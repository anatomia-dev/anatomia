/**
 * Node.js dependency parser (all formats)
 *
 * Tries: package.json
 * Returns: Combined dependencies from all found files
 */

import * as path from 'node:path';
import { readFile, exists } from '../utils/file.js';
import { parsePackageJson } from './node/package.js';

/**
 * Read Node.js dependencies from all available formats
 *
 * Priority: package.json
 * Combines all found dependencies
 * @param rootPath
 */
export async function readNodeDependencies(
  rootPath: string
): Promise<string[]> {
  const deps = new Set<string>();

  // Try package.json (standard format)
  const packageJsonPath = path.join(rootPath, 'package.json');
  if (await exists(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath);
      const packageDeps = parsePackageJson(content);
      packageDeps.forEach((d) => deps.add(d));
    } catch (error) {
      // Corrupted file - could try package-lock.json fallback in future.
      // Catch binding was `_error` but references below used `error`, which
      // threw ReferenceError at runtime when a package.json was malformed.
      console.warn(
        `Warning: Failed to parse package.json: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  return Array.from(deps);
}
