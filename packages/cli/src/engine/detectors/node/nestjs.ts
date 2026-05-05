/**
 * Nest.js framework detector
 *
 * CRITICAL: Check BEFORE Express (Nest.js uses Express internally)
 */

import type { Detection } from '../python/fastapi.js';
import type { FrameworkHintEntry } from '../../types/census.js';

/**
 * Detect Nest.js framework from dependencies and census hints.
 * Priority: Must be checked BEFORE Express.
 */
export function detectNestjs(
  dependencies: string[],
  hints: FrameworkHintEntry[]
): Detection {
  const dependencyFound = dependencies.includes('@nestjs/core');
  if (!dependencyFound) {
    return { framework: null, confidence: 0.0, indicators: [] };
  }

  const indicators: string[] = ['@nestjs/core in dependencies'];
  let confidence = 0.90;

  // Check for src/main.ts via census hints (NestJS convention)
  const hasMainTs = hints.some(h => h.framework === 'nestjs');
  if (hasMainTs) {
    confidence = Math.min(1.0, confidence + 0.05);
    indicators.push('src/main.ts found');
  }

  // Note: scanForImports decorator scan deferred to analyzer scope.
  // The dep + hint check provides 0.90-0.95 confidence, sufficient for detection.

  return {
    framework: 'nestjs',
    confidence,
    indicators,
  };
}
