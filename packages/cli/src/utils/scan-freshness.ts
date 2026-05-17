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

/** Shape returned by checkScanFreshness */
export interface ScanFreshnessResult {
  isStale: boolean;
  daysSinceScan: number;
  commitsSinceScan: number | null;
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

    // Try to get commit count from scan.json git.head
    let commitsSinceScan: number | null = null;
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

    return {
      isStale,
      daysSinceScan,
      commitsSinceScan,
    };
  } catch {
    // Silent on any error — best-effort
    return null;
  }
}
