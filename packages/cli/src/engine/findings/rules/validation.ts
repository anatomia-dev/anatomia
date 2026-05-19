/**
 * API route input validation check.
 *
 * Globs for API route files directly (App Router + Pages Router) and reads
 * the first 30 lines of each to check for validation library imports.
 * Independent of the file sampler — produces accurate denominators.
 *
 * Only fires on deep tier (framework detection needed).
 */

import { glob } from 'glob';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Finding, FindingContext } from '../index.js';

const VALIDATION_MODULES = ['zod', 'yup', 'joi', 'class-validator', 'valibot', '@sinclair/typebox'];
const VALIDATION_PATH_PATTERNS = ['schema', 'schemas', 'validate', 'validation'];

const ROUTE_GLOB_IGNORE = [
  '**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**',
  '**/.git/**', '**/.turbo/**', '**/out/**', '**/.cache/**',
  '**/*.d.ts', '**/*.min.js', '**/*.map',
];

/**
 * Check whether a file's first 30 lines import a validation library.
 *
 * @param filePath - Absolute path to the file
 * @returns true if validation imports are detected
 */
function hasValidationImport(filePath: string): boolean {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return false;
  }

  const lines = content.split('\n').slice(0, 30);

  for (const line of lines) {
    const lower = line.toLowerCase();
    // Only check lines that look like imports
    if (!lower.includes('import') && !lower.includes('require')) continue;

    // Check for direct validation library imports
    if (VALIDATION_MODULES.some(v => lower.includes(v))) {
      return true;
    }

    // Check for schema/validate path patterns in import paths
    if (VALIDATION_PATH_PATTERNS.some(p => lower.includes(p))) {
      return true;
    }
  }

  return false;
}

/**
 * Check API route input validation coverage.
 *
 * Globs for App Router and Pages Router API route files, reads the first
 * 30 lines of each, and checks for validation library imports. Returns
 * a finding with the full denominator (not sampled).
 *
 * @param ctx - Finding context with rootPath
 * @returns Finding or null (null if no API routes found)
 */
export async function checkApiValidation(ctx: FindingContext): Promise<Finding | null> {
  let routeFiles: string[] = [];

  try {
    // App Router: **/api/**/route.{ts,js,tsx,jsx}
    const appRoutes = await glob('**/api/**/route.{ts,js,tsx,jsx}', {
      cwd: ctx.rootPath,
      absolute: false,
      ignore: ROUTE_GLOB_IGNORE,
    });

    // Pages Router: **/pages/api/**/*.{ts,js,tsx,jsx}
    const pagesRoutes = await glob('**/pages/api/**/*.{ts,js,tsx,jsx}', {
      cwd: ctx.rootPath,
      absolute: false,
      ignore: ROUTE_GLOB_IGNORE,
    });

    routeFiles = [...appRoutes, ...pagesRoutes];
  } catch {
    return null;
  }

  if (routeFiles.length === 0) return null;

  const validated = routeFiles.filter(f =>
    hasValidationImport(path.join(ctx.rootPath, f))
  );

  if (validated.length === routeFiles.length) {
    return {
      id: 'api-validation',
      severity: 'pass',
      title: `All ${routeFiles.length} API routes have validation imports`,
      detail: null,
      category: 'security',
    };
  }

  const unvalidated = routeFiles.length - validated.length;
  const severity = routeFiles.length < 10 ? 'info' : 'warn';

  return {
    id: 'api-validation',
    severity,
    title: `${unvalidated}/${routeFiles.length} API routes have no validation imports`,
    detail: 'Checked top-of-file imports for validation libraries. Routes using\nwrapper-based or middleware-based validation may not be detected.',
    category: 'security',
  };
}
