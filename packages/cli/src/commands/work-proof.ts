/**
 * Proof chain writing functions.
 *
 * Depends on work-state (for countPhases) — never imports from work.
 * Handles proof chain entry creation, backfill migrations, and dashboard generation.
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import { globSync } from 'glob';
import { resolveFindingPaths, generateDashboard, computeChainHealth } from '../utils/proofSummary.js';
import type { ProofSummary } from '../utils/proofSummary.js';
import type { ProofChainEntry, ProofChain, ProofChainStats, ProcessAttestation, SessionProvenance } from '../types/proof.js';
import { agentCommand } from './platform.js';
import { countPhases } from './work-state.js';
import {
  deriveTranscript,
  getForensicsBufferPath,
  isProcessCaptureEnabled,
  type SessionRecord,
} from '../utils/forensics.js';

/** Per-file churn map as stored in `.saves.json`. */
type ModuleChurnMap = Record<string, { added: number; deleted: number }>;

/**
 * Whether a captured session belongs to a given work item's worktree.
 *
 * DEVIATION FROM spec-2 (human-approved): spec-2 says "find buffer record(s) for
 * this slug", assuming the buffer carries the slug. It does NOT for Build/Verify:
 * those launch from the MAIN repo (the agent `cd`s into the worktree only AFTER
 * its session starts), so `ANA_SLUG` is empty at SessionStart and Phase 1
 * correctly records them with an empty slug (AC6-valid — the slug is genuinely
 * unknowable at spawn). So we recover them DETERMINISTICALLY by matching the
 * worktree path against (a) the recorded `transcript_path`, (b) the record's
 * `cwd`, or (c) the transcript's OWN per-line `cwd` entries (which become the
 * worktree once the agent cd's in). A direct `record.slug === slug` match still
 * wins first (covers `ana run plan --slug`). Think/Learn/empty-slug records not
 * tied to any worktree never match here — they stay buffer-only, as designed.
 *
 * @param record - The session buffer record
 * @param slug - The work-item slug being completed
 * @param worktreePath - Absolute path to `.ana/worktrees/{slug}`
 * @returns True if this record belongs to the work item
 */
function recordBelongsToWorktree(record: SessionRecord, slug: string, worktreePath: string): boolean {
  if (record.slug && record.slug === slug) return true;
  if (record.transcript_path && record.transcript_path.includes(worktreePath)) return true;
  if (record.cwd && record.cwd.startsWith(worktreePath)) return true;
  // Fall back to the transcript's own cwd entries — robust for Build/Verify,
  // which start in the main repo and cd into the worktree mid-session.
  try {
    if (!record.transcript_path || !fs.existsSync(record.transcript_path)) return false;
    const raw = fs.readFileSync(record.transcript_path, 'utf-8');
    for (const line of raw.split('\n')) {
      if (!line.includes(worktreePath)) continue; // cheap pre-filter before JSON.parse
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof parsed === 'object' && parsed !== null) {
        const cwd = (parsed as Record<string, unknown>)['cwd'];
        if (typeof cwd === 'string' && cwd.startsWith(worktreePath)) return true;
      }
    }
  } catch {
    // Unreadable transcript — treat as no match.
  }
  return false;
}

/**
 * Parse the `Size` field out of a scope.md Complexity Assessment.
 *
 * @param scopeContent - The scope.md contents
 * @returns The lowercased size (e.g. `large`), or `''` if absent
 */
function parseScopeSize(scopeContent: string): string {
  const m = scopeContent.match(/\*\*Size:\*\*\s*([a-zA-Z]+)/);
  return m && m[1] ? m[1].toLowerCase() : '';
}

/**
 * Assemble the optional {@link ProcessAttestation} for a completed work item.
 *
 * Provenance ONLY (counts/cost/outcome/task-shape/churn) — never findings or
 * verdicts. Returns `null` (→ field omitted, proof still valid) when capture is
 * off, no session record matches the worktree, or the transcript is unreadable.
 * Among matching records the newest by `timestamp` wins (deterministic).
 *
 * @param projectRoot - Project root directory
 * @param slug - Work-item slug being completed
 * @param proof - The proof summary being assembled (source of outcome joins)
 * @param moduleChurn - Per-file churn read from `.saves.json`
 * @param scopeContent - scope.md contents (for task size)
 * @param multiPhase - Whether the plan has more than one phase
 * @returns The attestation, or `null` if none should be attached
 */
export function assembleProcessAttestation(
  projectRoot: string,
  slug: string,
  proof: ProofSummary,
  moduleChurn: ModuleChurnMap,
  scopeContent: string,
  multiPhase: boolean,
): ProcessAttestation | null {
  if (!isProcessCaptureEnabled(projectRoot)) return null;

  const bufferPath = getForensicsBufferPath();
  let records: SessionRecord[];
  try {
    if (!fs.existsSync(bufferPath)) return null;
    const raw = fs.readFileSync(bufferPath, 'utf-8');
    records = raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as SessionRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is SessionRecord => r !== null);
  } catch {
    return null;
  }

  const worktreePath = path.join(projectRoot, '.ana', 'worktrees', slug);
  const matches = records.filter((r) => recordBelongsToWorktree(r, slug, worktreePath));
  if (matches.length === 0) return null;

  // Deterministic order: by timestamp, then role. ALL matching sessions are kept
  // — plan, build, every build rework cycle, verify — so the per-role dataset is
  // preserved. Repeated build attempts from rejection cycles are wanted data.
  matches.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
    return a.role < b.role ? -1 : a.role > b.role ? 1 : 0;
  });

  const sessions: SessionProvenance[] = [];
  for (const record of matches) {
    const derived = deriveTranscript(record.transcript_path, record.harness);
    if (!derived) continue; // dangling/unreadable transcript → skip that session
    sessions.push({
      role: record.role,
      harness: record.harness,
      model: record.model || derived.model,
      agent_def_hash: record.agent_def_hash,
      cli_version: record.cli_version,
      session_id: record.session_id,
      derived,
    });
  }
  // Every matching transcript was unreadable → no provenance to attach.
  if (sessions.length === 0) return null;

  const findings = { risk: 0, debt: 0, observation: 0 };
  for (const f of proof.findings) {
    if (f.severity === 'risk') findings.risk += 1;
    else if (f.severity === 'debt') findings.debt += 1;
    else if (f.severity === 'observation') findings.observation += 1;
  }

  return {
    outcome: {
      first_pass_verify: proof.rejection_cycles === 0,
      assertions_satisfied: proof.contract.satisfied,
      assertions_total: proof.contract.total,
      findings,
    },
    task_shape: {
      size: parseScopeSize(scopeContent),
      kind: proof.kind ?? '',
      multi_phase: multiPhase,
    },
    module_churn: moduleChurn,
    sessions,
  };
}

/**
 * Guard against completing work with a FAIL verification result.
 * Prints error messages and exits the process if result is FAIL.
 *
 * @param result - Verification result string
 * @param context - Optional context (e.g., "Phase 2") for the error message
 */
export function guardFailResult(result: string, context?: string): void {
  if (result === 'FAIL') {
    const prefix = context ? `${context}: ` : '';
    console.error(chalk.red(`Error: ${prefix}Cannot complete work with a FAIL verification result.`));
    console.error(chalk.gray('The verify report says FAIL. Fix the issues and re-verify before completing.'));
    console.error(chalk.gray(`Run: ${agentCommand('build')} to fix, then ${agentCommand('verify')}`));
    process.exit(1);
  }
}

/**
 * Derive surface from modules_touched path matching against ana.json surfaces.
 *
 * Returns the surface name when exactly one surface matches the given modules.
 * Cross-surface entries (modules spanning multiple surfaces) return undefined.
 *
 * @param modulesTouched - List of file paths touched by the entry
 * @param surfaces - Record of surface names to surface config with path
 * @returns The matching surface name, or undefined
 */
export function deriveSurface(
  modulesTouched: string[],
  surfaces: Record<string, { path: string }>,
): string | undefined {
  if (modulesTouched.length === 0 || Object.keys(surfaces).length === 0) {
    return undefined;
  }
  const matchingSurfaces = new Set<string>();
  for (const filePath of modulesTouched) {
    for (const [surfaceName, surface] of Object.entries(surfaces)) {
      // Use directory-boundary prefix matching to avoid false positives
      // e.g., 'packages/cli/' should not match 'packages/cli-utils/foo.ts'
      const surfacePrefix = surface.path.endsWith('/') ? surface.path : surface.path + '/';
      if (filePath.startsWith(surfacePrefix) || filePath === surface.path) {
        matchingSurfaces.add(surfaceName);
      }
    }
  }
  if (matchingSurfaces.size === 1) {
    return [...matchingSurfaces][0];
  }
  return undefined;
}

/**
 * Write a new entry to the proof chain, run backfill migrations, and generate the dashboard.
 *
 * @param slug - Work item slug
 * @param proof - Proof summary data
 * @param projectRoot - Project root directory
 * @param worktreeMeta - Optional worktree metadata to include in the proof chain entry
 * @returns Chain health counts: total runs and cumulative findings
 */
export async function writeProofChain(slug: string, proof: ProofSummary, projectRoot: string, worktreeMeta?: ProofChainEntry['worktree']): Promise<ProofChainStats> {
  const anaDir = path.join(projectRoot, '.ana');

  // Ensure .ana directory exists
  await fsPromises.mkdir(anaDir, { recursive: true });

  // 1. Write/append to proof_chain.json
  const chainPath = path.join(anaDir, 'proof_chain.json');
  let chain: ProofChain = { entries: [] };

  if (fs.existsSync(chainPath)) {
    try {
      chain = JSON.parse(fs.readFileSync(chainPath, 'utf-8'));
      if (!Array.isArray(chain.entries)) {
        chain = { entries: [] };
      }
    } catch {
      chain = { entries: [] };
    }
  }

  // Read modules_touched and commit_hygiene from .saves.json (captured at
  // build-report save time when the feature branch definitely exists and
  // all code is committed).
  let modulesTouched: string[] = [];
  let commitHygiene: Array<{ check: string; file: string; severity: string; message: string }> = [];
  let moduleChurn: ModuleChurnMap = {};
  try {
    const slugSaves = path.join(anaDir, 'plans', 'completed', slug, '.saves.json');
    if (fs.existsSync(slugSaves)) {
      const savesContent = JSON.parse(fs.readFileSync(slugSaves, 'utf-8'));
      if (Array.isArray(savesContent['modules_touched'])) {
        modulesTouched = savesContent['modules_touched'];
      }
      if (Array.isArray(savesContent['commit_hygiene'])) {
        commitHygiene = savesContent['commit_hygiene'];
      }
      if (savesContent['module_churn'] && typeof savesContent['module_churn'] === 'object') {
        moduleChurn = savesContent['module_churn'] as ModuleChurnMap;
      }
    }
  } catch { /* fall back to empty */ }

  // FAIL result guard — block proof chain entry for failed verification
  guardFailResult(proof.result);

  // UNKNOWN result warning (AC12)
  const completedPlanDir = path.join(anaDir, 'plans', 'completed', slug);
  if (proof.result === 'UNKNOWN') {
    const verifyReportPath = path.join(completedPlanDir, 'verify_report.md');
    if (fs.existsSync(verifyReportPath)) {
      console.error(chalk.yellow(`Warning: Entry '${slug}' has result UNKNOWN but a verify report exists. Check verify_report.md for a Result line.`));
    }
  }

  // Assemble the optional session provenance attestation (Phase 2). Provenance
  // ONLY — never findings/verdicts. Absent (null) when capture is off, no session
  // matches the worktree, or the transcript is unreadable; the proof stays valid.
  let scopeContent = '';
  let multiPhase = false;
  try {
    const scopePath = path.join(completedPlanDir, 'scope.md');
    if (fs.existsSync(scopePath)) scopeContent = fs.readFileSync(scopePath, 'utf-8');
    const planPath = path.join(completedPlanDir, 'plan.md');
    if (fs.existsSync(planPath)) {
      const { total } = countPhases(fs.readFileSync(planPath, 'utf-8'));
      multiPhase = total > 1;
    }
  } catch { /* scope/plan unavailable — task_shape degrades to defaults */ }
  const processAttestation = assembleProcessAttestation(
    projectRoot,
    slug,
    proof,
    moduleChurn,
    scopeContent,
    multiPhase,
  );

  const entry: ProofChainEntry = {
    slug,
    feature: proof.feature,
    result: proof.result,
    author: proof.author,
    contract: proof.contract,
    assertions: proof.assertions.map(a => {
      const base: ProofChainEntry['assertions'][0] = {
        id: a.id,
        says: a.says,
        status: (a.verifyStatus || 'UNVERIFIED') as ProofChainEntry['assertions'][0]['status'],
      };
      if (a.verifyStatus === 'DEVIATED') {
        const deviation = proof.deviations.find(d => d.contract_id === a.id)?.instead;
        if (deviation) base.deviation = deviation;
      }
      return base;
    }),
    acceptance_criteria: proof.acceptance_criteria,
    timing: proof.timing,
    hashes: proof.hashes,
    completed_at: new Date().toISOString(),
    modules_touched: modulesTouched,
    scope_summary: proof.scope_summary,
    kind: proof.kind,
    findings: proof.findings.map((c, i) => ({
      ...c,
      id: `${slug}-C${i + 1}`,
      status: 'active' as const,
    } as ProofChainEntry['findings'][0])),
    rejection_cycles: proof.rejection_cycles,
    previous_failures: proof.previous_failures,
    build_concerns: proof.build_concerns ?? [],
    ...(commitHygiene.length > 0 ? { commit_hygiene: commitHygiene } : {}),
    ...(processAttestation ? { process: processAttestation } : {}),
    ...(worktreeMeta ? { worktree: worktreeMeta } : {}),
  };

  // Derive surface from modules_touched path matching against ana.json surfaces
  let anaSurfaces: Record<string, { path: string }> | undefined;
  try {
    const anaJsonPath = path.join(projectRoot, '.ana', 'ana.json');
    if (fs.existsSync(anaJsonPath)) {
      const anaContent = JSON.parse(fs.readFileSync(anaJsonPath, 'utf-8'));
      anaSurfaces = anaContent.surfaces as Record<string, { path: string }> | undefined;
    }
  } catch { /* ana.json missing or malformed — skip surface derivation */ }

  if (anaSurfaces) {
    const derived = deriveSurface(modulesTouched, anaSurfaces);
    if (derived) {
      entry.surface = derived;
    }
  }

  // Populate phases from plan.md if available
  try {
    const planPath = path.join(completedPlanDir, 'plan.md');
    if (fs.existsSync(planPath)) {
      const planContent = fs.readFileSync(planPath, 'utf-8');
      const { total } = countPhases(planContent);
      if (total > 1) {
        entry.phases = total;
      }
    }
  } catch { /* plan.md unavailable — omit phases field */ }

  // Assign status to new findings
  for (const finding of entry.findings) {
    if (finding.category === 'upstream') {
      finding.status = 'closed';
      finding.closed_reason = 'upstream';
      finding.closed_at = new Date().toISOString();
      finding.closed_by = 'mechanical';
    } else {
      finding.status = 'active';
    }
  }

  // Resolve finding/build_concern file fields from basenames to full paths.
  // Shared cache avoids redundant globSync calls across all resolution passes.
  const globCache = new Map<string, string[]>();

  // New entry: resolve against its own modules_touched
  resolveFindingPaths(entry.findings, entry.modules_touched, projectRoot, globCache);
  resolveFindingPaths(entry.build_concerns, entry.modules_touched, projectRoot, globCache);

  // Maintenance counters
  let autoClosed = 0;

  // Existing entries: resolve finding paths (idempotent — already-resolved files are skipped)
  for (const existing of chain.entries) {
    resolveFindingPaths(existing.findings || [], existing.modules_touched || [], projectRoot, globCache);
    resolveFindingPaths(existing.build_concerns || [], existing.modules_touched || [], projectRoot, globCache);
  }

  // Backfill migration: derive surface for existing entries without one
  if (anaSurfaces && !chain.migrations?.['surface_backfill']) {
    for (const existing of chain.entries) {
      if ((existing.surface === undefined || existing.surface === null) && existing.modules_touched?.length) {
        const derived = deriveSurface(existing.modules_touched, anaSurfaces);
        if (derived) {
          existing.surface = derived;
        }
      }
    }
  }

  // Staleness checks — run after path resolution and status assignment
  // Process all entries (existing + new)
  const allEntries = [...chain.entries, entry];
  const fileContentCache = new Map<string, string | null>();
  const globResultCache = new Map<string, string[]>();

  const readFileContent = (filePath: string): string | null => {
    if (fileContentCache.has(filePath)) return fileContentCache.get(filePath)!;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      fileContentCache.set(filePath, content);
      return content;
    } catch {
      fileContentCache.set(filePath, null);
      return null;
    }
  };

  for (const chainEntry of allEntries) {
    for (const finding of chainEntry.findings || []) {
      // Skip already-closed findings
      if (finding.status === 'closed') continue;

      // Skip findings without file reference
      if (!finding.file) continue;

      const fullPath = path.join(projectRoot, finding.file);

      if (fs.existsSync(fullPath)) {
        // File exists — run anchor-absent check
        if (finding.anchor) {
          const content = readFileContent(fullPath);
          if (content !== null && !content.includes(finding.anchor)) {
            finding.status = 'closed';
            finding.closed_reason = 'code changed, anchor absent';
            finding.closed_at = new Date().toISOString();
            finding.closed_by = 'mechanical';
            autoClosed++;
          }
        }
      } else {
        // File does NOT exist at declared path — glob for the basename
        const basename = path.basename(finding.file);
        let matches = globResultCache.get(basename);
        if (matches === undefined) {
          matches = globSync('**/' + basename, {
            cwd: projectRoot,
            ignore: ['**/node_modules/**', '**/.ana/**'],
          });
          globResultCache.set(basename, matches);
        }

        if (matches.length === 0) {
          // Genuinely deleted — no file with this name exists anywhere
          finding.status = 'closed';
          finding.closed_reason = 'file removed';
          finding.closed_at = new Date().toISOString();
          finding.closed_by = 'mechanical';
          autoClosed++;
        }
        // 1+ matches → file exists elsewhere, conservative — skip
      }
    }
  }

  // Supersession removed — same-file + same-category heuristic can't
  // distinguish same-issue from different-issue without semantic judgment.

  // Backfill migration: rename suggested_action 'accept' → 'acknowledge'
  if (!chain.migrations?.['accept_to_acknowledge']) {
    for (const existing of chain.entries) {
      for (const finding of existing.findings || []) {
        if ((finding.suggested_action as string) === 'accept') {
          finding.suggested_action = 'acknowledge';
        }
      }
      for (const concern of existing.build_concerns || []) {
        if ((concern.suggested_action as string) === 'accept') {
          concern.suggested_action = 'acknowledge';
        }
      }
    }
  }

  chain.entries.push(entry);
  chain.schema = 1;
  chain.migrations = { ...chain.migrations, surface_backfill: true, accept_to_acknowledge: true };
  await fsPromises.writeFile(chainPath, JSON.stringify(chain, null, 2));

  // 2. Regenerate PROOF_CHAIN.md as quality dashboard
  const chainMdPath = path.join(anaDir, 'PROOF_CHAIN.md');

  // Compute chain health counts via shared utility
  const health = computeChainHealth(chain);
  const { chain_runs: runs, findings: { active: activeCount, closed: closedCount, promoted: promotedCount, total: totalFindings } } = health;

  const dashboardMd = generateDashboard(chain.entries, { runs, active: activeCount, promoted: promotedCount, closed: closedCount });
  await fsPromises.writeFile(chainMdPath, dashboardMd);

  const stats: ProofChainStats = {
    runs,
    findings: totalFindings,
    active: activeCount,
    promoted: promotedCount,
    closed: closedCount,
    newFindings: entry.findings.length,
  };

  if (autoClosed > 0) {
    stats.maintenance = { auto_closed: autoClosed };
  }

  return stats;
}
