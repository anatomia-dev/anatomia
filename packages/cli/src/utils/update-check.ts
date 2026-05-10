/**
 * Version awareness utilities for CLI update checks and project version comparison.
 *
 * Provides non-blocking, best-effort version checking:
 * - npm registry lookup via cached background spawn
 * - Local ana.json version comparison (instant, no network)
 *
 * All functions are silent on failure — errors never surface to the user.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { getCliVersion } from '../commands/init/state.js';

/** Cache TTL: 24 hours in milliseconds */
const CACHE_TTL_MS = 86_400_000;

/** Cache file location relative to project root */
const CACHE_PATH = '.ana/state/cache/update-check.json';

/** Shape of the cached update check result */
interface UpdateCache {
  version: string;
  timestamp: number;
}

/** Shape returned by checkForUpdates */
export interface UpdateCheckResult {
  updateAvailable: { current: string; latest: string } | null;
  projectMismatch: { cliVersion: string; projectVersion: string } | null;
}

/**
 * Compare two semver strings. Returns true if `latest` is newer than `current`.
 *
 * Pure function — splits on `.`, compares numeric segments left-to-right.
 * Returns false for equal versions, malformed input, or when current is newer.
 *
 * @param current - Current version string (e.g. "1.2.0")
 * @param latest - Latest version string (e.g. "1.3.0")
 * @returns true if latest is strictly newer than current
 */
export function isNewerVersion(current: string, latest: string): boolean {
  if (!current || !latest) return false;

  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  if (currentParts.some(isNaN) || latestParts.some(isNaN)) return false;

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const c = currentParts[i] ?? 0;
    const l = latestParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }

  return false;
}

/**
 * Read the cached update check result from disk.
 *
 * Returns the cached version and timestamp, or null on any error
 * (missing file, corrupt JSON, missing fields).
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Cached update data or null
 */
export function readUpdateCache(projectRoot: string): UpdateCache | null {
  try {
    const cachePath = path.join(projectRoot, CACHE_PATH);
    const content = fs.readFileSync(cachePath, 'utf-8');
    const data = JSON.parse(content);

    if (typeof data.version !== 'string' || typeof data.timestamp !== 'number') {
      return null;
    }

    return { version: data.version, timestamp: data.timestamp };
  } catch {
    // Missing file, parse error, permission error — all silent
    return null;
  }
}

/**
 * Spawn a detached background process to fetch the latest version from npm.
 *
 * The child process fetches `https://registry.npmjs.org/{packageName}/latest`,
 * writes the result to the cache file, and exits. The parent does not wait.
 *
 * Skipped entirely when `CI=true` environment variable is set.
 *
 * @param projectRoot - Absolute path to the project root
 * @param packageName - npm package name to check (e.g. "anatomia-cli")
 */
export function spawnUpdateCheck(projectRoot: string, packageName: string): void {
  if (process.env['CI'] === 'true') return;

  const cacheFile = path.join(projectRoot, CACHE_PATH);
  const cacheDir = path.dirname(cacheFile);

  // Inline Node.js script for the child process
  // Uses JSON.stringify for safe path interpolation (ANA-SEC-001 class)
  const script = `
const https = require('https');
const fs = require('fs');
const path = require('path');

const cacheFile = ${JSON.stringify(cacheFile)};
const cacheDir = ${JSON.stringify(cacheDir)};

const req = https.get('https://registry.npmjs.org/${packageName}/latest', { timeout: 3000 }, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const pkg = JSON.parse(data);
      if (pkg.version) {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify({ version: pkg.version, timestamp: Date.now() }));
      }
    } catch {}
    process.exit(0);
  });
});
req.on('error', () => process.exit(0));
req.on('timeout', () => { req.destroy(); process.exit(0); });
`;

  const child = spawn('node', ['-e', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.unref();
}

/**
 * Read the anaVersion field from the project's ana.json.
 *
 * Returns the version string, "unknown" for missing/0.0.0 values,
 * or null when ana.json cannot be read at all.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Version string, "unknown", or null
 */
export function getProjectAnaVersion(projectRoot: string): string | null {
  try {
    const anaJsonPath = path.join(projectRoot, '.ana', 'ana.json');
    const content = fs.readFileSync(anaJsonPath, 'utf-8');
    const data = JSON.parse(content);

    const version = data.anaVersion;
    if (version === undefined || version === null || version === '0.0.0') {
      return 'unknown';
    }

    if (typeof version !== 'string') {
      return 'unknown';
    }

    return version;
  } catch {
    // Missing file, parse error — return null (can't determine)
    return null;
  }
}

/**
 * Orchestrate version checks: npm registry (cached) and project ana.json.
 *
 * Calls getCliVersion(), reads cached npm data, spawns background refresh
 * if cache is stale/missing (unless CI), compares project anaVersion.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Update availability and project mismatch info (nulls when current)
 */
export async function checkForUpdates(projectRoot: string): Promise<UpdateCheckResult> {
  const result: UpdateCheckResult = {
    updateAvailable: null,
    projectMismatch: null,
  };

  try {
    const currentVersion = await getCliVersion();

    // npm update check
    if (process.env['CI'] !== 'true') {
      const cache = readUpdateCache(projectRoot);

      if (cache) {
        const isStale = Date.now() - cache.timestamp > CACHE_TTL_MS;

        if (isNewerVersion(currentVersion, cache.version)) {
          result.updateAvailable = {
            current: currentVersion,
            latest: cache.version,
          };
        }

        if (isStale) {
          spawnUpdateCheck(projectRoot, 'anatomia-cli');
        }
      } else {
        // No cache — spawn background check for next run
        spawnUpdateCheck(projectRoot, 'anatomia-cli');
      }
    }

    // Project version mismatch check
    const projectVersion = getProjectAnaVersion(projectRoot);
    if (projectVersion !== null && projectVersion !== currentVersion) {
      result.projectMismatch = {
        cliVersion: currentVersion,
        projectVersion,
      };
    }
  } catch {
    // Silent on any error — best-effort
  }

  return result;
}
