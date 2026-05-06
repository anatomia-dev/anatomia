/**
 * Other Node.js framework detectors (Fastify, Koa, Hono)
 *
 * Catch-all for dep-only framework detection where no filesystem probes
 * are needed. A framework graduates to its own file only when it needs
 * more than a dependency check.
 */

import type { Detection } from '../python/fastapi.js';
import type { FrameworkHintEntry } from '../../types/census.js';

/**
 * Detect simpler Node frameworks (Fastify, Koa, Hono).
 */
export function detectOtherNodeFrameworks(
  dependencies: string[],
  _hints: FrameworkHintEntry[]
): Detection {
  if (dependencies.includes('fastify')) {
    return { framework: 'fastify', confidence: 0.85, indicators: ['fastify in dependencies'] };
  }
  if (dependencies.includes('koa')) {
    return { framework: 'koa', confidence: 0.85, indicators: ['koa in dependencies'] };
  }
  // Hono — lightweight web framework for edge runtimes
  if (dependencies.includes('hono')) {
    return { framework: 'hono', confidence: 0.85, indicators: ['hono in dependencies'] };
  }
  return { framework: null, confidence: 0.0, indicators: [] };
}
