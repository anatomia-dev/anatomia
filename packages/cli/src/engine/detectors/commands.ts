/**
 * Command detection from package.json scripts
 *
 * Detects build, test, and lint commands and prefixes with package manager.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export interface DetectedCommands {
  build: string | null;
  test: string | null;
  lint: string | null;
  dev: string | null;
  all: Record<string, string>;
}

/**
 * Detect build/test/lint/dev commands from package.json scripts.
 * Prefixes with the detected package manager.
 *
 * If packageManager is null (no lockfile found — typically a non-Node
 * project), returns all-null commands without attempting to read
 * package.json.
 *
 * If projectType is non-Node (not 'node' and not 'unknown'), still reads
 * package.json to populate `result.all` (polyglot projects have JS tooling)
 * but skips named command detection — JS build/test/lint commands are wrong
 * for Ruby/Python/Go/Rust projects.
 *
 * @param cwd - Project root directory
 * @param packageManager - Detected package manager or null
 * @param projectType - Project type from detectProjectType (e.g. 'node', 'ruby', 'rust')
 * @returns Detected commands with optional all scripts
 */
export async function detectCommands(
  cwd: string,
  packageManager: string | null,
  projectType?: string,
): Promise<DetectedCommands> {
  const result: DetectedCommands = {
    build: null,
    test: null,
    lint: null,
    dev: null,
    all: {},
  };

  if (packageManager === null) {
    return result;
  }

  try {
    const content = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    const scripts = pkg.scripts || {};

    result.all = scripts;

    // Non-Node projects: preserve commands.all from package.json but skip
    // named command detection — JS commands are wrong for these projects.
    if (projectType && projectType !== 'node' && projectType !== 'unknown') {
      return result;
    }

    const prefix = packageManager === 'npm' ? 'npm run' : `${packageManager} run`;

    // Build: first match
    for (const key of ['build', 'compile', 'tsc']) {
      if (scripts[key]) { result.build = `${prefix} ${key}`; break; }
    }

    // Test: first match (npm test is a shorthand)
    for (const key of ['test', 'test:run']) {
      if (scripts[key]) {
        result.test = key === 'test' && packageManager === 'npm'
          ? 'npm test'
          : `${prefix} ${key}`;
        break;
      }
    }

    // Lint: first match
    for (const key of ['lint', 'eslint', 'biome']) {
      if (scripts[key]) { result.lint = `${prefix} ${key}`; break; }
    }

    // Dev: first match
    for (const key of ['dev', 'start', 'serve']) {
      if (scripts[key]) { result.dev = `${prefix} ${key}`; break; }
    }
  } catch {
    // No package.json or invalid — return nulls
  }

  return result;
}
