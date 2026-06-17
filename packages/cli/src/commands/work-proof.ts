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
import { isProcessCaptureEnabled } from '../utils/forensics.js';
import { assembleComplianceAttestations } from '../utils/compliance.js';
import {
  evaluateReadBuildReportVeto,
  VERIFY_INDEPENDENCE_CLAIM_ID,
} from '../utils/verdict.js';
import type { ReadBuildReportVeto } from '../utils/verdict.js';

/** Per-file churn map as stored in `.saves.json`. */
type ModuleChurnMap = Record<string, { added: number; deleted: number }>;

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
 * Compute the presence-floor completeness verdict for a work item (Phase 2).
 *
 * The single source of truth for the verdict — called by both
 * {@link assembleProcessAttestation} (post-`cp`, reads `completed/`) and the early
 * strict guard in `completeWork` (pre-`cp`, reads `active/`). Pure: depends only on
 * the report files under `reportsDir` and the passed `sessions`, so the recorded
 * verdict and the upstream strict block can never disagree for the same inputs.
 *
 * Expectation is tied to SAVED REPORTS, never to `rejection_cycles` (which would
 * false-fail legitimate rework): `expected.plan = 1`; `expected.build` /
 * `expected.verify` equal the count of `build_report*.md` / `verify_report*.md`
 * files in `reportsDir` (rework files like `build_report_2_r1.md` are counted, so a
 * multi-attempt pipeline reads complete when each attempt has a session). `present`
 * counts the passed sessions by role; `ana`/`learn` (and any non-pipeline role) are
 * counted in the dataset but NEVER create an expected or a gap. A bucket is a gap
 * when `present < expected`; `complete` is true when there are no gaps.
 *
 * @param reportsDir - Directory holding the saved `*_report*.md` files (`active/{slug}` or `completed/{slug}`)
 * @param sessions - The committed sessions for this item (source of `present`)
 * @returns The completeness verdict (`complete` / `expected` / `present` / `gaps`)
 */
export function computeCompleteness(
  reportsDir: string,
  sessions: SessionProvenance[],
): ProcessAttestation['completeness'] {
  const countReports = (pattern: string): number => {
    try {
      return globSync(pattern, { cwd: reportsDir }).length;
    } catch {
      return 0;
    }
  };

  const expected = {
    plan: 1,
    build: countReports('build_report*.md'),
    verify: countReports('verify_report*.md'),
  };

  const present = { plan: 0, build: 0, verify: 0 };
  for (const s of sessions) {
    if (s.role === 'plan') present.plan += 1;
    else if (s.role === 'build') present.build += 1;
    else if (s.role === 'verify') present.verify += 1;
    // `ana` / `learn` / any other role: part of the dataset, never an expected/gap.
  }

  const gaps: string[] = [];
  for (const role of ['plan', 'build', 'verify'] as const) {
    if (present[role] < expected[role]) {
      gaps.push(`${role}: ${present[role]} of ${expected[role]} expected session(s) present`);
    }
  }

  return { complete: gaps.length === 0, expected, present, gaps };
}

/**
 * Assemble the optional {@link ProcessAttestation} for a completed work item.
 *
 * Reads the committed per-session provenance files — every `*.json` under
 * `.ana/plans/completed/{slug}/provenance/` (the active dir is `cp`'d to
 * `completed/` before this runs, so the merged-tree content is present). Each
 * file is already a self-contained {@link SessionProvenance} with its own derived
 * counts — no buffer, no worktree-path matching, no re-derive. This is the whole
 * point of capture v2: assembly no longer depends on any machine's home state or
 * local transcript, so a proof assembled from files committed across machines
 * comes out the same (AC2/AC7).
 *
 * Provenance ONLY (counts/outcome/task-shape/churn) — never findings or verdicts.
 * Returns `null` ONLY when capture is off. When capture is on it ALWAYS returns
 * an attestation — even with zero provenance files (`sessions: []`), so a gap is
 * recorded rather than silently hidden. Sessions are ordered deterministically by
 * `captured_at`, then `role`.
 *
 * @param projectRoot - Project root directory
 * @param slug - Work-item slug being completed
 * @param proof - The proof summary being assembled (source of outcome joins)
 * @param moduleChurn - Per-file churn read from `.saves.json`
 * @param scopeContent - scope.md contents (for task size)
 * @param multiPhase - Whether the plan has more than one phase
 * @returns The attestation, or `null` only when capture is disabled
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

  const completedSlugDir = path.join(projectRoot, '.ana', 'plans', 'completed', slug);
  const provDir = path.join(completedSlugDir, 'provenance');
  const sessions: SessionProvenance[] = [];
  try {
    for (const file of fs.readdirSync(provDir)) {
      if (!file.endsWith('.json')) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(fs.readFileSync(path.join(provDir, file), 'utf-8'));
      } catch {
        continue; // an unparseable provenance file is skipped, never thrown
      }
      if (typeof parsed === 'object' && parsed !== null) {
        sessions.push(parsed as SessionProvenance);
      }
    }
  } catch {
    // No provenance dir → zero committed sessions. NOT an early return: capture is
    // on, so we still attach an attestation with an empty sessions[] (the gap is
    // recorded, not hidden — Phase 2 makes that incompleteness loud).
  }

  // Deterministic order: by captured_at, then role. ALL committed sessions are
  // kept — plan, build, every build rework cycle, verify — so the per-role
  // dataset is preserved. Repeated build attempts from rejection cycles are data.
  sessions.sort((a, b) => {
    const at = a.captured_at ?? '';
    const bt = b.captured_at ?? '';
    if (at !== bt) return at < bt ? -1 : 1;
    return a.role < b.role ? -1 : a.role > b.role ? 1 : 0;
  });

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
    completeness: computeCompleteness(completedSlugDir, sessions),
    sessions,
  };
}

/**
 * Guard against completing work with a FAIL verification result.
 * Prints error messages and exits the process if result is FAIL.
 *
 * @param result - Verification result string
 * @param context - Optional context (e.g., "Phase 2") for the error message
 * @param contradictions - Optional contradiction reasons from a coerced PASS; when
 *   present and non-empty, they are listed instead of the generic FAIL line
 */
export function guardFailResult(result: string, context?: string, contradictions?: string[]): void {
  if (result === 'FAIL') {
    const prefix = context ? `${context}: ` : '';
    console.error(chalk.red(`Error: ${prefix}Cannot complete work with a FAIL verification result.`));
    if (contradictions && contradictions.length > 0) {
      // Coerced PASS: the headline said PASS but the verifier's own table contradicts it.
      console.error(chalk.gray("The verify headline says PASS but it contradicts the verifier's own report:"));
      for (const reason of contradictions) {
        console.error(chalk.gray(`  • ${reason}`));
      }
      console.error(chalk.gray('Fix the issues and re-verify before completing.'));
    } else {
      console.error(chalk.gray('The verify report says FAIL. Fix the issues and re-verify before completing.'));
    }
    console.error(chalk.gray(`Run: ${agentCommand('build')} to fix, then ${agentCommand('verify')}`));
    process.exit(1);
  }
}

/**
 * Guard against completing work when the deterministic read-build-report veto
 * fired (verifier-verdict-honesty Component 3). Trust-the-bytes: a verify session
 * that deterministically read `build_report.md` force-FAILs the proof regardless
 * of its self-authored PASS headline. Mirrors {@link guardFailResult}'s
 * print-and-exit shape.
 *
 * MUST run upstream of the proof-chain write so the override happens at the seal
 * decision — a veto computed after the entry is written gates nothing.
 *
 * @param veto - The veto outcome from {@link evaluateReadBuildReportVeto}
 * @param context - Optional context (e.g. "Phase 2") for the error message
 */
export function guardVerdictVeto(veto: ReadBuildReportVeto, context?: string): void {
  if (!veto.applied) return;
  const prefix = context ? `${context}: ` : '';
  console.error(chalk.red(`Error: ${prefix}Cannot complete work with a FAIL verification result.`));
  console.error(chalk.gray('Deterministic veto: the verify session read build_report.md.'));
  console.error(chalk.gray(`  claim ${VERIFY_INDEPENDENCE_CLAIM_ID} — violated (source: deterministic)`));
  console.error(chalk.gray('Verify must not read the build report. The PASS headline is overridden.'));
  console.error(chalk.gray(`Run: ${agentCommand('build')} to fix, then ${agentCommand('verify')}`));
  process.exit(1);
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

  // Assemble the optional behavioral attestations (Phase 2) — one committed
  // compliance record per transcript. Capture-on only. MUST be assembled HERE,
  // upstream of every FAIL guard and the proof-chain write, because the
  // read-build-report veto (Component 3) reads these records to decide whether to
  // force-FAIL the proof. A veto computed after the entry is written gates nothing.
  // All verdicts remain non-gating EVIDENCE except the one allowlisted claim the
  // veto keys on; an incomplete-coverage record is announced loudly but never blocks.
  const compliance = isProcessCaptureEnabled(projectRoot)
    ? assembleComplianceAttestations(projectRoot, slug)
    : [];
  const incompleteCompliance = compliance.filter((c) => !c.complete);
  if (incompleteCompliance.length > 0) {
    console.error(
      chalk.yellow(
        `Warning: ${incompleteCompliance.length} session attestation(s) have incomplete coverage — ` +
          `behavioral verdicts are evidence, never a gate.`,
      ),
    );
  }

  // Deterministic read-build-report veto (Component 3). Evaluate BEFORE the FAIL
  // guard and the entry write. When it fires, the proof is force-FAILed regardless
  // of the self-authored headline; when it does not, the outcome (with its stated
  // reason — including "no captured transcript") is recorded on the entry so the
  // absence of a veto is never a silent skip.
  const verdictVeto = evaluateReadBuildReportVeto(compliance);
  guardVerdictVeto(verdictVeto);

  // FAIL result guard — block proof chain entry for failed verification.
  // Pass any contradiction reasons so a coerced PASS explains itself.
  guardFailResult(proof.result, undefined, proof.verdict_contradictions);

  // UNKNOWN result warning (AC12)
  const completedPlanDir = path.join(anaDir, 'plans', 'completed', slug);
  if (proof.result === 'UNKNOWN') {
    const verifyReportPath = path.join(completedPlanDir, 'verify_report.md');
    if (fs.existsSync(verifyReportPath)) {
      console.error(chalk.yellow(`Warning: Entry '${slug}' has result UNKNOWN but a verify report exists. Check verify_report.md for a Result line.`));
    }
  }

  // Assemble the optional session provenance attestation from the committed
  // per-session files. Provenance ONLY — never findings/verdicts. Absent (null)
  // only when capture is off; the proof stays valid either way.
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

  // Completeness WARN path (strict is enforced earlier in completeWork, before any
  // archival). writeProofChain is reached only when completion is allowed to
  // proceed — strict-off, or strict-on-but-complete — so here we warn and continue,
  // recording the gap into the entry via process.completeness. It never blocks.
  if (processAttestation && !processAttestation.completeness.complete) {
    console.error(
      chalk.yellow(
        `Warning: Process provenance is incomplete — ${processAttestation.completeness.gaps.join('; ')}. ` +
          `Recorded in the proof's completeness block.`,
      ),
    );
  }

  const entry: ProofChainEntry = {
    slug,
    feature: proof.feature,
    result: proof.result,
    ...(proof.verdict_contradictions && proof.verdict_contradictions.length > 0
      ? { verdict_contradictions: proof.verdict_contradictions }
      : {}),
    // Record the veto outcome (always not-applied here: an applied veto exits
    // upstream via guardVerdictVeto). Its stated reason makes the absence of a
    // veto observable — never a silent skip (forward-only, Component 3).
    verdict_veto: verdictVeto,
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
    ...(compliance.length > 0 ? { compliance } : {}),
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
