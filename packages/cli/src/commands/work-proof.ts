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
import type { ProofChainEntry, ProofChain, ProofChainStats } from '../types/proof.js';
import { countPhases } from './work-state.js';

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
    console.error(chalk.gray('Run: claude --agent ana-build to fix, then claude --agent ana-verify'));
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

  chain.entries.push(entry);
  chain.schema = 1;
  chain.migrations = { ...chain.migrations, surface_backfill: true };
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
