/**
 * Proportional file sampler — Disease B cure.
 *
 * Replaces the alphabetical-50 flat sampler with source-root-weighted
 * allocation. Every source root gets representation proportional to its
 * file count, with a floor of 1 file per root (no source root invisible).
 *
 * Within each root: depth-stratified sampling ensures files at all
 * directory depths get proportional representation. Three buckets:
 * shallow (≤ 2), mid (3–5), deep (6+). Within each bucket: alphabetical
 * for determinism.
 */

import { glob } from 'glob';
import * as path from 'node:path';
import type { ProjectCensus } from '../types/census.js';

const SOURCE_EXTENSIONS = '{ts,tsx,js,jsx,py,go,rs}';

const GLOB_IGNORE = [
  '**/node_modules/**',
  '**/vendor/**',
  '**/venv/**',
  '**/.venv/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/target/**',
  '**/__pycache__/**',
  '**/.pytest_cache/**',
  '**/coverage/**',
  '**/.ana/**',
  '**/.claude/**',
  '**/*.d.ts',
  '**/.git/**',
  '**/.turbo/**',
  '**/*.min.js',
  '**/*.bundle.js',
];

const TEST_PATTERNS = [
  '.test.',
  '.spec.',
  'test_',
  '_test.',
  '__tests__/',
];

function isTestFile(file: string): boolean {
  return TEST_PATTERNS.some(p => file.includes(p));
}

interface DepthBucket {
  label: string;
  files: string[];
}

/**
 * Allocate a budget across non-empty buckets proportionally with floor of 1.
 *
 * @param buckets - Array of buckets with files
 * @param budget - Total files to allocate
 * @returns Array of allocations matching bucket order
 */
function allocateBudget(buckets: DepthBucket[], budget: number): number[] {
  const nonEmpty = buckets.filter(b => b.files.length > 0);
  if (nonEmpty.length === 0) return buckets.map(() => 0);

  const totalFiles = nonEmpty.reduce((sum, b) => sum + b.files.length, 0);
  const allocations = buckets.map(() => 0);
  let remaining = budget;

  // First pass: assign floor of 1 to each non-empty bucket
  for (const [i, bucket] of buckets.entries()) {
    if (bucket.files.length > 0) {
      allocations[i] = 1;
      remaining--;
    }
  }

  // Second pass: distribute remaining proportionally
  if (remaining > 0) {
    let distributed = 0;
    for (const [i, bucket] of buckets.entries()) {
      if (bucket.files.length === 0) continue;
      const proportion = bucket.files.length / totalFiles;
      const extra = Math.floor(proportion * remaining);
      allocations[i] = (allocations[i] ?? 0) + extra;
      distributed += extra;
    }
    // Assign leftover to the largest bucket (rounding residual)
    const leftover = remaining - distributed;
    if (leftover > 0) {
      let largestIdx = 0;
      let largestCount = 0;
      for (const [i, bucket] of buckets.entries()) {
        if (bucket.files.length > largestCount) {
          largestCount = bucket.files.length;
          largestIdx = i;
        }
      }
      allocations[largestIdx] = (allocations[largestIdx] ?? 0) + leftover;
    }
  }

  return allocations;
}

/**
 * Sample files proportionally across source roots.
 *
 * @param census - Project census with source root info
 * @param budget - Maximum total files to sample (default: 750)
 * @returns Deterministic list of relative file paths
 */
export async function sampleFilesProportional(
  census: ProjectCensus,
  budget: number = 750,
): Promise<string[]> {
  const roots = census.sourceRoots.filter(r => r.fileCount > 0);
  if (roots.length === 0) {
    // Fallback: glob from rootPath if no source roots have files
    return globFromDir(census.rootPath, census.rootPath, budget);
  }

  const totalFiles = roots.reduce((sum, r) => sum + r.fileCount, 0);
  if (totalFiles === 0) return [];

  // Allocate budget proportionally with floor of 1 per root
  const allocations: Array<{ root: typeof roots[0]; allocation: number }> = [];
  let remaining = budget;

  // First pass: assign floor of 1 to each root
  for (const root of roots) {
    allocations.push({ root, allocation: 1 });
    remaining--;
  }

  // Second pass: distribute remaining proportionally
  if (remaining > 0) {
    let distributed = 0;
    for (const entry of allocations) {
      const proportion = entry.root.fileCount / totalFiles;
      const extra = Math.floor(proportion * remaining);
      entry.allocation += extra;
      distributed += extra;
    }
    // Assign leftover to the largest root (rounding residual)
    const leftover = remaining - distributed;
    if (leftover > 0) {
      const largest = allocations.reduce((a, b) =>
        a.root.fileCount > b.root.fileCount ? a : b
      );
      largest.allocation += leftover;
    }
  }

  // Glob and sample from each root
  const allFiles: string[] = [];
  for (const { root, allocation } of allocations) {
    const files = await globFromDir(root.absolutePath, census.rootPath, allocation);
    allFiles.push(...files);
  }

  // Final trim to budget (in case of rounding overshoot)
  return allFiles.slice(0, budget);
}

async function globFromDir(
  dir: string,
  rootPath: string,
  limit: number,
): Promise<string[]> {
  try {
    const pattern = `**/*.${SOURCE_EXTENSIONS}`;
    const matches = await glob(pattern, {
      cwd: dir,
      absolute: false,
      ignore: GLOB_IGNORE,
    });

    const nonTest = matches.filter(f => !isTestFile(f));

    // Depth-stratified sampling: bucket files by depth, allocate proportionally
    const shallow: string[] = [];  // depth ≤ 2
    const mid: string[] = [];      // depth 3–5
    const deep: string[] = [];     // depth 6+

    for (const f of nonTest) {
      const depth = f.split('/').length;
      if (depth <= 2) {
        shallow.push(f);
      } else if (depth <= 5) {
        mid.push(f);
      } else {
        deep.push(f);
      }
    }

    // Sort within each bucket alphabetically for determinism
    shallow.sort((a, b) => a.localeCompare(b));
    mid.sort((a, b) => a.localeCompare(b));
    deep.sort((a, b) => a.localeCompare(b));

    const buckets: DepthBucket[] = [
      { label: 'shallow', files: shallow },
      { label: 'mid', files: mid },
      { label: 'deep', files: deep },
    ];

    const allocs = allocateBudget(buckets, limit);
    const sampled: string[] = [];

    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i]!;
      sampled.push(...bucket.files.slice(0, allocs[i]));
    }

    // Convert to rootPath-relative paths
    const relDir = path.relative(rootPath, dir);
    return sampled.map(f => (relDir ? path.join(relDir, f) : f).replace(/\\/g, '/'));
  } catch {
    return [];
  }
}
