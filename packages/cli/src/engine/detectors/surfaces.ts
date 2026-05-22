/**
 * Surface detection — identifies deployable applications within a monorepo.
 *
 * A "surface" is a package that represents something you ship: a web app,
 * an API server, a CLI tool. Shared libraries, config packages, and
 * infrastructure tooling are excluded.
 *
 * Three signals classify surfaces:
 * 1. Bin + dev script — package declares `bin` AND has "dev" in scripts
 * 2. apps/ + strong config OR fileCount > 50 — under apps/ with evidence
 * 3. Strong framework config — config file (e.g., next.config.ts) anywhere
 *
 * Pure function: census in, surfaces out. No filesystem access.
 */

import * as path from 'node:path';
import type { ProjectCensus, SourceRoot } from '../types/census.js';
import type { Surface, EnrichedPackage } from '../types/engineResult.js';
import { TESTING_PACKAGES } from './dependencies.js';
import { getFrameworkDisplayName } from '../../utils/displayNames.js';

// ── Constants ─────────────────────────────────────────────────────────

/**
 * Config file basenames that indicate a strong framework presence.
 * Used by Signal 2 (apps/ threshold bypass) and Signal 3.
 * To add a new framework: one entry here + one in FRAMEWORK_HINTS (census.ts).
 */
export const STRONG_FRAMEWORK_CONFIGS = new Set([
  'next.config.ts', 'next.config.js', 'next.config.mjs',
  'nest-cli.json',
  'nuxt.config.ts', 'nuxt.config.js',
  'svelte.config.js', 'svelte.config.ts',
  'angular.json',
  'vue.config.js',
  'remix.config.js', 'remix.config.ts',
  'react-router.config.ts', 'react-router.config.js',
  'astro.config.mjs', 'astro.config.ts', 'astro.config.js',
]);

/**
 * Last-path-segment patterns for infrastructure packages.
 * Packages whose last segment exactly matches are excluded from surfaces.
 */
export const INFRA_PATTERNS = new Set([
  'tsconfig',
  'eslint-config',
  'prettier-config',
  'tailwind-config',
  'config-typescript',
  'biome-config',
]);

/**
 * Path segments that indicate non-product workspace packages.
 * Packages with ANY path segment matching (case-insensitive) are excluded
 * from surface detection. Covers examples, templates, testing fixtures,
 * playgrounds, and similar non-shippable directories.
 */
const EXCLUDED_SEGMENTS = new Set([
  'examples', 'example',
  'example-apps',
  'templates', 'template',
  'e2e',
  'test', 'tests',
  'fixtures', 'fixture',
  'playground', 'playgrounds',
  'sandbox',
  'demos', 'demo',
  'starters', 'starter',
  'samples', 'sample',
  'boilerplate',
  'references', 'reference',
]);

/**
 * Check whether a relative path belongs to a non-product workspace package.
 * Returns true when any segment of the path matches EXCLUDED_SEGMENTS
 * (case-insensitive) or the last segment ends with `-e2e`.
 *
 * @param relativePath - Forward-slash-separated relative path (e.g., "examples/next-app")
 * @returns True if the path is non-product and should be excluded from surfaces
 */
export function isNonProductPath(relativePath: string): boolean {
  const segments = relativePath.split('/');
  for (const segment of segments) {
    if (EXCLUDED_SEGMENTS.has(segment.toLowerCase())) return true;
  }
  // Suffix check: last segment ending with -e2e (e.g., "gauzy-e2e")
  const lastSegment = segments[segments.length - 1] || '';
  if (lastSegment.toLowerCase().endsWith('-e2e')) return true;
  return false;
}

/** Minimum source files for a package to be considered as a surface. */
export const MIN_SOURCE_FILES = 5;

/** File count threshold for apps/ packages without strong framework config. */
export const APPS_DIR_FILE_THRESHOLD = 50;

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Derive a surface name from the last path segment, normalized.
 * - Lowercase
 * - Underscores to hyphens
 * - Dots stripped
 * - @scope prefix stripped
 *
 * @param relativePath - Package's relative path (e.g., "apps/web", "@scope/cli")
 * @returns Normalized name from last segment
 */
function deriveRawName(relativePath: string): string {
  let segment = relativePath.split('/').pop() || relativePath;
  // Strip @scope prefix
  if (segment.startsWith('@')) {
    const slashIdx = segment.indexOf('/');
    if (slashIdx >= 0) segment = segment.slice(slashIdx + 1);
  }
  return segment
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\./g, '');
}

/**
 * Get the parent directory segment for disambiguation.
 * @param relativePath - e.g., "apps/web" → "apps"
 * @returns Parent segment or empty string if no parent
 */
function getParentSegment(relativePath: string): string {
  const parts = relativePath.split('/');
  return parts.length > 1 ? (parts[parts.length - 2] || '') : '';
}

/**
 * Check if a path segment looks like a version string.
 * Matches "v1", "v2", purely numeric segments like "2", "10".
 */
function isVersionLike(segment: string): boolean {
  return /^v\d+$/.test(segment) || /^\d+$/.test(segment);
}

/**
 * Detect per-surface language.
 * 1. tsconfig in census → "TypeScript"
 * 2. own devDeps include typescript → "TypeScript"
 * 3. has Node deps → "JavaScript"
 * 4. otherwise → null
 *
 * @param root - Source root to detect language for
 * @param census - Full census for tsconfig lookup
 * @returns Display language name or null
 */
function detectLanguage(root: SourceRoot, census: ProjectCensus): string | null {
  // 1. tsconfig presence
  const hasTsconfig = census.configs.tsconfigs.some(
    tc => tc.sourceRootPath === root.relativePath,
  );
  if (hasTsconfig) return 'TypeScript';

  // 2. own devDeps include typescript
  if (root.devDeps['typescript']) return 'TypeScript';

  // 3. has Node deps (non-empty deps or devDeps)
  if (Object.keys(root.deps).length > 0 || Object.keys(root.devDeps).length > 0) {
    return 'JavaScript';
  }

  // 4. no signal
  return null;
}

/**
 * Detect per-surface framework from census frameworkHints.
 * Uses first strong framework hint matching this source root.
 *
 * @param root - Source root to detect framework for
 * @param census - Full census for framework hint lookup
 * @returns Display framework name or null
 */
function detectFramework(root: SourceRoot, census: ProjectCensus): string | null {
  const hints = census.configs.frameworkHints.filter(
    h => h.sourceRootPath === root.relativePath,
  );
  // Find first hint whose path basename is a strong config
  for (const hint of hints) {
    const basename = path.basename(hint.path);
    if (STRONG_FRAMEWORK_CONFIGS.has(basename)) {
      return getFrameworkDisplayName(hint.framework);
    }
  }
  return null;
}

/**
 * Detect per-surface testing frameworks.
 * Checks surface's own deps + devDeps, then falls back to rootDevDeps.
 *
 * @param root - Source root
 * @param rootDevDeps - Root package.json devDeps (monorepo toolchain)
 * @returns Array of testing framework display names
 */
function detectTesting(root: SourceRoot, rootDevDeps: Record<string, string>): string[] {
  const testing: string[] = [];
  const seen = new Set<string>();
  const ownDeps = { ...root.deps, ...root.devDeps };

  for (const [pkg, name] of Object.entries(TESTING_PACKAGES)) {
    if (ownDeps[pkg] && !seen.has(name)) {
      seen.add(name);
      testing.push(name);
    }
  }

  // Fallback: check rootDevDeps if nothing found in own deps
  if (testing.length === 0) {
    for (const [pkg, name] of Object.entries(TESTING_PACKAGES)) {
      if (rootDevDeps[pkg] && !seen.has(name)) {
        seen.add(name);
        testing.push(name);
      }
    }
  }

  return testing;
}

/**
 * Check if a source root has a strong framework config file.
 *
 * @param root - Source root to check
 * @param census - Full census for framework hint lookup
 * @returns True if any framework hint for this root is a strong config
 */
function hasStrongConfig(root: SourceRoot, census: ProjectCensus): boolean {
  return census.configs.frameworkHints.some(h => {
    if (h.sourceRootPath !== root.relativePath) return false;
    return STRONG_FRAMEWORK_CONFIGS.has(path.basename(h.path));
  });
}

// ── Main detector ─────────────────────────────────────────────────────

/**
 * Detect development surfaces from census data.
 *
 * @param census - Project census with source roots and configs
 * @param rootDevDeps - Root package.json devDeps for testing fallback
 * @returns Array of detected surfaces, sorted alphabetically by path
 */
export function detectSurfaces(
  census: ProjectCensus,
  rootDevDeps: Record<string, string>,
): Surface[] {
  if (census.layout === 'single-repo') return [];

  const candidates: Array<{ root: SourceRoot }> = [];

  for (const root of census.sourceRoots) {
    // Pre-filter: root package
    if (root.relativePath === '.' || root.relativePath === '') continue;

    // Pre-filter: too few source files
    if (root.fileCount < MIN_SOURCE_FILES) continue;

    // Pre-filter: infrastructure package
    const lastSegment = root.relativePath.split('/').pop() || '';
    if (INFRA_PATTERNS.has(lastSegment)) continue;

    // Pre-filter: non-product package (examples, templates, fixtures, etc.)
    if (isNonProductPath(root.relativePath)) continue;

    // Signal 1: bin + dev script
    if (root.hasBin && root.scripts.includes('dev')) {
      candidates.push({ root });
      continue;
    }

    // Signal 2: apps/ with strong config or large file count
    if (root.relativePath.startsWith('apps/')) {
      if (hasStrongConfig(root, census) || root.fileCount > APPS_DIR_FILE_THRESHOLD) {
        candidates.push({ root });
        continue;
      }
    }

    // Signal 3: strong framework config anywhere
    if (hasStrongConfig(root, census)) {
      candidates.push({ root });
    }
  }

  // Derive names
  const rawNames = candidates.map(c => ({
    ...c,
    rawName: deriveRawName(c.root.relativePath),
  }));

  // Version-string normalization: segments matching v\d+ or purely numeric → parent prepended
  for (const entry of rawNames) {
    const lastSegment = entry.root.relativePath.split('/').pop() || '';
    if (isVersionLike(lastSegment)) {
      const parent = getParentSegment(entry.root.relativePath);
      if (parent) {
        entry.rawName = `${parent.toLowerCase()}-${entry.rawName}`;
      }
    }
  }

  // Collision disambiguation: both colliding names get parent directory prepended
  const nameCount = new Map<string, number>();
  for (const entry of rawNames) {
    nameCount.set(entry.rawName, (nameCount.get(entry.rawName) || 0) + 1);
  }
  for (const entry of rawNames) {
    if ((nameCount.get(entry.rawName) || 0) > 1) {
      const parent = getParentSegment(entry.root.relativePath);
      if (parent) {
        entry.rawName = `${parent.toLowerCase()}-${entry.rawName}`;
      }
    }
  }

  // Build surfaces
  const surfaces: Surface[] = rawNames.map(({ root, rawName }) => ({
    name: rawName,
    path: root.relativePath,
    packageName: root.packageName,
    language: detectLanguage(root, census),
    framework: detectFramework(root, census),
    testing: detectTesting(root, rootDevDeps),
    sourceFiles: root.fileCount,
  }));

  // Sort by path for deterministic output
  surfaces.sort((a, b) => a.path.localeCompare(b.path));

  return surfaces;
}

/**
 * Enrich monorepo packages with per-package intelligence.
 *
 * @param census - Project census
 * @param rootDevDeps - Root package.json devDeps for testing fallback
 * @returns Array of enriched packages (excludes root package)
 */
export function enrichPackages(
  census: ProjectCensus,
  rootDevDeps: Record<string, string>,
): EnrichedPackage[] {
  return census.sourceRoots
    .filter(r => r.relativePath !== '.' && r.relativePath !== '')
    .map(r => ({
      name: r.packageName ?? r.relativePath,
      path: r.relativePath,
      language: detectLanguage(r, census),
      framework: detectFramework(r, census),
      testing: detectTesting(r, rootDevDeps),
      hasBin: r.hasBin,
      scripts: r.scripts,
      sourceFiles: r.fileCount,
    }));
}
