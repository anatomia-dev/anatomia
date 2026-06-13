/**
 * Scan freshness utilities for detecting stale project scans.
 *
 * Provides non-blocking, best-effort staleness detection:
 * - Combines time threshold (>7 days) AND commit threshold (>50 commits)
 * - Falls back to time-only when git SHA is unresolvable
 * - Silent on failure — errors never surface to the user
 *
 * All functions are silent on failure — errors never surface to the user.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runGit } from './git-operations.js';

/** Staleness threshold: 7 days in milliseconds */
const STALE_DAYS_THRESHOLD = 7;

/** Staleness threshold: 50 commits since last scan */
const STALE_COMMITS_THRESHOLD = 50;

/**
 * Source-file extensions that count as a "material" change for rescan gating.
 * Doc-only, config-only, or `.ana/` artifact-only diffs do not move the index,
 * so the auto-rescan stays silent and never timestamp-churns those commits.
 */
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.rb', '.php',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.swift',
  '.vue', '.svelte',
]);

/**
 * Classify the diff between two commits as material (a recognized source file
 * changed) or not. Returns a trinary so callers can distinguish "no source
 * changed" (false) from "couldn't tell" (null).
 *
 * Crucially, this lets the context-never-rots refresh commit — which only ever
 * touches `.ana/scan.json` + `.ana/ana.json` — NOT count as drift: the auto-
 * rescan would otherwise leave the index one (artifact-only) commit behind HEAD
 * forever and falsely flag itself as stale.
 *
 * @param from - The base commit-ish (e.g. the indexed commit).
 * @param to - The target commit-ish (e.g. `HEAD`).
 * @param projectRoot - Absolute path to the project root.
 * @returns true if a source file changed, false if only non-source changed,
 *   null when the diff is undeterminable (git failure / unknown commit).
 */
function sourceDeltaBetween(from: string, to: string, projectRoot: string): boolean | null {
  const diff = runGit(['diff', '--name-only', `${from}..${to}`], { cwd: projectRoot });
  if (diff.exitCode !== 0) return null;

  const changed = diff.stdout.split('\n').map(l => l.trim()).filter(Boolean);
  if (changed.length === 0) return false;

  for (const file of changed) {
    if (SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())) return true;
  }
  return false;
}

/** Shape returned by checkScanFreshness */
export interface ScanFreshnessResult {
  isStale: boolean;
  daysSinceScan: number;
  commitsSinceScan: number | null;
  /**
   * True when the indexed scan's `overview.indexedCommit` no longer matches the
   * current git HEAD — the scan describes a tree that has since moved on. This
   * is an independent staleness signal: it can flip `isStale` true even when the
   * scan is young and few commits old, because the *content* has drifted. `null`
   * when divergence is undeterminable (no indexedCommit stamped, or git
   * unavailable).
   */
  headDiverged: boolean | null;
}

/**
 * Check whether the project scan is stale based on time and commit distance.
 *
 * Returns null in three cases: CI environment, missing/unparseable lastScanAt,
 * or any internal error. When git rev-list fails (exit code 128 from shallow
 * clones or force-pushed repos), falls back to time-only evaluation.
 *
 * @param lastScanAt - ISO timestamp string from ana.json
 * @param projectRoot - Absolute path to the project root
 * @returns Staleness result or null when suppressed/unavailable
 */
export function checkScanFreshness(
  lastScanAt: string | undefined | null,
  projectRoot: string,
): ScanFreshnessResult | null {
  // CI suppression
  if (process.env['CI'] === 'true') return null;

  // Missing lastScanAt
  if (!lastScanAt) return null;

  try {
    // Parse timestamp
    const scanDate = new Date(lastScanAt);
    if (isNaN(scanDate.getTime())) return null;

    const now = Date.now();
    const daysSinceScan = Math.floor((now - scanDate.getTime()) / (1000 * 60 * 60 * 24));

    // Try to get commit count from scan.json git.head, and HEAD divergence from
    // overview.indexedCommit (the commit the scan actually indexed — stamped by
    // the context-never-rots rescan).
    let commitsSinceScan: number | null = null;
    let headDiverged: boolean | null = null;
    const scanJsonPath = path.join(projectRoot, '.ana', 'scan.json');

    try {
      const scanContent = fs.readFileSync(scanJsonPath, 'utf-8');
      const scanJson = JSON.parse(scanContent);
      const headSha = scanJson?.git?.head;

      if (typeof headSha === 'string' && headSha.length > 0) {
        const result = runGit(['rev-list', '--count', `${headSha}..HEAD`], { cwd: projectRoot });

        if (result.exitCode === 0) {
          const count = parseInt(result.stdout, 10);
          if (!isNaN(count)) {
            commitsSinceScan = count;
          }
        }
        // exitCode !== 0 (e.g. 128): fall through to time-only
      }

      // HEAD-divergence check: has the tree moved past the indexed commit with a
      // MATERIAL source change? Stays null (undeterminable) when no indexedCommit
      // was stamped or git is unavailable, so a scan written before this feature
      // never flags drift. Material-gated so the artifact-only refresh commit
      // (scan.json + ana.json) doesn't perpetually flag the index as diverged.
      const indexedCommit = scanJson?.overview?.indexedCommit;
      if (typeof indexedCommit === 'string' && indexedCommit.length > 0) {
        const headResult = runGit(['rev-parse', '--short', 'HEAD'], { cwd: projectRoot });
        if (headResult.exitCode === 0 && headResult.stdout.length > 0) {
          if (headResult.stdout === indexedCommit) {
            headDiverged = false;
          } else {
            // HEAD moved — only "diverged" when the move includes source.
            headDiverged = sourceDeltaBetween(indexedCommit, 'HEAD', projectRoot);
          }
        }
      }
    } catch {
      // scan.json missing or unreadable — fall through to time-only
    }

    // Determine staleness
    let isStale: boolean;
    if (commitsSinceScan !== null) {
      // Both thresholds must be met
      isStale = daysSinceScan > STALE_DAYS_THRESHOLD && commitsSinceScan > STALE_COMMITS_THRESHOLD;
    } else {
      // Time-only fallback: age alone triggers staleness
      isStale = daysSinceScan > STALE_DAYS_THRESHOLD;
    }

    // HEAD divergence is an independent staleness trigger: if the indexed scan
    // points at a commit the tree has moved past, the scan is stale regardless
    // of age — context has rotted.
    if (headDiverged === true) {
      isStale = true;
    }

    return {
      isStale,
      daysSinceScan,
      commitsSinceScan,
      headDiverged,
    };
  } catch {
    // Silent on any error — best-effort
    return null;
  }
}

/**
 * Decide whether a fresh scan is warranted after a merge by checking for a
 * *material* source delta between the last indexed commit and current HEAD.
 *
 * This gates the context-never-rots auto-rescan in `ana work complete`: doc-only,
 * config-only, or `.ana/`-artifact-only completions don't move the symbol graph
 * or conventions, so re-indexing them would only churn the scan.json timestamp
 * for no signal. We rescan only when a recognized source file changed.
 *
 * Fail-open by design: when the last indexed commit is unknown (no prior scan,
 * or a scan written before indexedCommit existed) or git can't enumerate the
 * diff, we return `true` so a scan still runs. The whole rescan is wrapped in a
 * total try-catch by the caller, so a needless scan is cheap and never blocks.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns true when a source file changed since the indexed commit (or the
 *   baseline is unknown); false only when we can prove no source file moved.
 */
export function hasMaterialSourceDelta(projectRoot: string): boolean {
  try {
    const scanJsonPath = path.join(projectRoot, '.ana', 'scan.json');

    let indexedCommit: string | null = null;
    try {
      const scanJson = JSON.parse(fs.readFileSync(scanJsonPath, 'utf-8'));
      const stamped = scanJson?.overview?.indexedCommit;
      if (typeof stamped === 'string' && stamped.length > 0) {
        indexedCommit = stamped;
      }
    } catch {
      // No readable prior scan — fail open (rescan).
    }

    // No baseline to diff against → rescan (first scan after this feature ships,
    // or the prior scan predates indexedCommit stamping).
    if (!indexedCommit) return true;

    const delta = sourceDeltaBetween(indexedCommit, 'HEAD', projectRoot);
    // Undeterminable (shallow clone, unknown commit, exit 128) → fail open so we
    // don't silently skip a legitimately-needed rescan.
    if (delta === null) return true;
    return delta;
  } catch {
    // Best-effort: on any unexpected failure, fail open.
    return true;
  }
}
