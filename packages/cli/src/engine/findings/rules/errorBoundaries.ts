/**
 * Error boundary detection (Next.js App Router).
 *
 * Globs for error.tsx/jsx and page.tsx/jsx directly — independent of the
 * file sampler. A single root-level error.tsx covers all routes via
 * Next.js bubbling. 4/8 well-maintained YC repos have zero error
 * boundaries — this is info, not warn.
 *
 * Only fires on Next.js projects.
 */

import { glob } from 'glob';
import type { Finding, FindingContext } from '../index.js';

const GLOB_IGNORE = [
  '**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**',
  '**/.git/**', '**/.turbo/**', '**/out/**', '**/.cache/**',
];

/**
 * Check for error boundary existence in Next.js App Router projects.
 *
 * @param ctx - Finding context with stack and rootPath
 * @returns Finding or null (null if not Next.js or no pages)
 */
export async function checkErrorBoundaries(ctx: FindingContext): Promise<Finding | null> {
  if (!ctx.stack.framework?.includes('Next.js')) return null;

  try {
    const errorFiles = await glob('**/error.{tsx,jsx}', {
      cwd: ctx.rootPath,
      absolute: false,
      ignore: GLOB_IGNORE,
    });

    const pageFiles = await glob('**/page.{tsx,jsx}', {
      cwd: ctx.rootPath,
      absolute: false,
      ignore: GLOB_IGNORE,
    });

    if (pageFiles.length === 0) return null;

    if (errorFiles.length > 0) {
      return {
        id: 'error-boundaries',
        severity: 'pass',
        title: 'Error boundary detected',
        detail: null,
        category: 'reliability',
      };
    }

    return {
      id: 'error-boundaries',
      severity: 'info',
      title: `${pageFiles.length} pages, no error boundaries`,
      detail: 'Consider adding app/error.tsx for graceful error handling',
      category: 'reliability',
    };
  } catch {
    return null;
  }
}
