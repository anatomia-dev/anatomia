/**
 * Package manager detection.
 *
 * Priority order:
 *   1. Nearest lockfile (walking up to 5 levels). Authoritative signal —
 *      a lockfile proves which tool actually ran install.
 *   2. package.json's `packageManager` field (corepack standard). Used
 *      when no lockfile exists yet (fresh install, pre-commit scenarios).
 *      Handles bun/yarn/pnpm projects that haven't run install yet but
 *      have declared intent via the corepack field.
 *   3. Plain 'npm' fallback when package.json exists but declares nothing.
 *      Most common default for a bare `npm init` project.
 *   4. Null when there's no package.json either — non-Node project.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const LOCKFILE_MAP: Array<[string, string]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

/** Maximum directory levels to walk up when searching for lockfiles */
const MAX_WALK_DEPTH = 5;

/** Package managers we recognize when reading package.json's `packageManager` field */
const RECOGNIZED_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

/**
 * Read package.json's `packageManager` field (corepack convention).
 *
 * The field format is `<name>@<version>` (e.g. `"pnpm@8.6.12"`). We only
 * care about the name. Returns null on any failure (missing file, parse
 * error, missing field, malformed value, unknown manager name).
 *
 * Why this matters: a fresh bun/yarn/pnpm project that declared the
 * packageManager field but hasn't run install yet has no lockfile. Without
 * this check, we'd fall through to 'npm' and lie to the user about which
 * manager their project uses.
 *
 * @param cwd - Directory containing (potentially) package.json
 * @returns Recognized package manager name, or null
 */
async function readPackageManagerField(cwd: string): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    const field = pkg?.packageManager;
    if (typeof field !== 'string') return null;
    // Format: "name@version" — split on @, take the left side
    const name = field.split('@')[0]?.trim();
    if (name && RECOGNIZED_MANAGERS.has(name)) return name;
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect the package manager used in a project.
 *
 * Resolution order:
 *   1. Walk up from cwd looking for a lockfile (pnpm > yarn > bun > npm).
 *      Returns the matching manager if found.
 *   2. Read `packageManager` field from package.json in cwd. This handles
 *      fresh projects that declared intent but haven't run install yet.
 *      Respects bun/yarn/pnpm declarations — no 'npm' lie.
 *   3. Plain package.json with no declared manager → default to 'npm'.
 *   4. No package.json either → null. Non-Node projects (Python / Go /
 *      Rust) have no package manager in the Node sense; previously this
 *      fell back to 'npm' which was a semantic lie.
 *
 * @param cwd - Directory to start searching from
 * @returns Detected package manager name, or null if not a Node project
 */
export async function detectPackageManager(cwd: string): Promise<string | null> {
  const resolvedCwd = path.resolve(cwd);
  let dir = resolvedCwd;
  let depth = 0;

  // 1. Lockfile walk
  while (depth < MAX_WALK_DEPTH) {
    for (const [lockfile, manager] of LOCKFILE_MAP) {
      try {
        await fs.access(path.join(dir, lockfile));
        return manager;
      } catch {
        // not found, try next
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
    depth++;
  }

  // 2. No lockfile — fall back to package.json `packageManager` field
  const declared = await readPackageManagerField(resolvedCwd);
  if (declared) return declared;

  // 3. Plain package.json exists → default 'npm'
  try {
    await fs.access(path.join(resolvedCwd, 'package.json'));
    return 'npm';
  } catch {
    // 4. No package.json → non-Node project
    return null;
  }
}
