/**
 * Directory tree rendering.
 */

import { basename } from 'node:path';


/**
 * Build ASCII directory tree
 *
 * Generates clean tree representation for context files.
 *
 * @param rootPath - Absolute path to project root
 * @param maxDepth - Maximum depth (default: 4 levels)
 * @param maxDirs - Maximum directories to show (default: 40)
 * @returns ASCII tree string (max 50 lines)
 *
 */
export async function buildAsciiTree(
  rootPath: string,
  maxDepth: number = 4,
  maxDirs: number = 40
): Promise<string> {
  // DYNAMIC IMPORT — string literal specifier is invisible to grep/madge.
  // If renaming utils/directory.ts, search for '../../utils/directory.js'
  // to catch this site along with any top-of-file imports.
  const { walkDirectories } = await import('../../utils/directory.js');

  const directories = await walkDirectories(rootPath, maxDepth);

  // Sort alphabetically with priority dirs first
  const priorityDirs = ['src', 'lib', 'app', 'tests', 'docs'];
  const sorted = directories.sort((a, b) => {
    const aBase = basename(a);
    const bBase = basename(b);
    const aPriority = priorityDirs.indexOf(aBase);
    const bPriority = priorityDirs.indexOf(bBase);
    if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
    if (aPriority !== -1) return -1;
    if (bPriority !== -1) return 1;
    return a.localeCompare(b);
  });

  const limited = sorted.slice(0, maxDirs);
  const remaining = sorted.length - maxDirs;

  const projectName = basename(rootPath);
  let tree = `${projectName}/\n`;

  for (const dir of limited) {
    const depth = dir.split('/').length;
    const indent = '  '.repeat(depth);
    const dirName = basename(dir);
    tree += `${indent}${dirName}/\n`;
  }

  if (remaining > 0) {
    tree += `  ... ${remaining} more director${remaining === 1 ? 'y' : 'ies'}\n`;
  }

  return tree;
}
