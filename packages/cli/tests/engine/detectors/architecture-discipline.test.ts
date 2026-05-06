/**
 * Architectural discipline test: converted detectors must not import filesystem modules.
 *
 * Detectors receive census data as pure function input. This test prevents
 * regression — if a developer adds a new detector with fs.readFile, the
 * test catches it.
 *
 * Scope: framework detectors (framework.ts, node/*, python/*) and
 * deployment.ts.
 *
 * Excluded (not yet converted, still legitimately read filesystem):
 *   - packageManager.ts (reads lock files to detect manager)
 *   - projectType.ts (reads various files to detect language)
 *   - dependencies.ts (reads package.json for dep aggregation)
 *   - commands.ts (reads package.json for scripts)
 *   - git.ts (reads .git for git info)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const DETECTORS_DIR = path.resolve(__dirname, '../../../src/engine/detectors');

/** Files that have been converted to census-based pure functions. */
const CONVERTED_FILES = [
  'framework.ts',
  'deployment.ts',
  'go.ts',
  'rust.ts',
];

/** Directories where ALL files should be census-based. */
const CONVERTED_DIRS = [
  'node',
  'python',
];

const FS_IMPORT_PATTERNS = [
  /from\s+['"]node:fs['"]/,
  /from\s+['"]node:fs\/promises['"]/,
  /from\s+['"]fs['"]/,
  /require\s*\(\s*['"]node:fs['"]\s*\)/,
  /require\s*\(\s*['"]fs['"]\s*\)/,
];

function checkFileForFsImports(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const violations: string[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of FS_IMPORT_PATTERNS) {
      if (pattern.test(lines[i]!)) {
        violations.push(`${path.basename(filePath)}:${i + 1}: ${lines[i]!.trim()}`);
      }
    }
  }
  return violations;
}

describe('Architectural discipline: converted detectors are fs-free', () => {
  it('converted detector files do not import from node:fs', () => {
    const violations: string[] = [];

    // Check individual converted files
    for (const file of CONVERTED_FILES) {
      const filePath = path.join(DETECTORS_DIR, file);
      violations.push(...checkFileForFsImports(filePath));
    }

    // Check all files in converted directories
    for (const dir of CONVERTED_DIRS) {
      const dirPath = path.join(DETECTORS_DIR, dir);
      const files = readdirSync(dirPath).filter(f => f.endsWith('.ts'));
      for (const file of files) {
        violations.push(...checkFileForFsImports(path.join(dirPath, file)));
      }
    }

    expect(violations, `Converted detectors must not import filesystem modules:\n${violations.join('\n')}`).toEqual([]);
  });

  // Also check that the file.js utility isn't imported (indirect fs access)
  it('converted detector files do not import from utils/file.js', () => {
    const violations: string[] = [];
    const FILE_UTIL_PATTERN = /from\s+['"].*utils\/file/;

    for (const file of CONVERTED_FILES) {
      const content = readFileSync(path.join(DETECTORS_DIR, file), 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (FILE_UTIL_PATTERN.test(lines[i]!)) {
          violations.push(`${file}:${i + 1}: ${lines[i]!.trim()}`);
        }
      }
    }

    for (const dir of CONVERTED_DIRS) {
      const dirPath = path.join(DETECTORS_DIR, dir);
      const files = readdirSync(dirPath).filter(f => f.endsWith('.ts'));
      for (const file of files) {
        const content = readFileSync(path.join(dirPath, file), 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (FILE_UTIL_PATTERN.test(lines[i]!)) {
            violations.push(`${dir}/${file}:${i + 1}: ${lines[i]!.trim()}`);
          }
        }
      }
    }

    expect(violations, `Converted detectors must not use utils/file.js:\n${violations.join('\n')}`).toEqual([]);
  });
});
