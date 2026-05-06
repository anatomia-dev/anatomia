/**
 * Integration tests for tree-sitter parsing pipeline.
 *
 * The original tests called analyze() which is deleted.
 * The parsing pipeline is now exercised through:
 * - scanProject(depth: 'deep') in scanProject.test.ts
 * - WASM smoke test in wasm-smoke.test.ts
 * - Proportional sampler tests in sampling/proportional-sampler.test.ts
 * - Performance benchmarks in performance/parsing-performance.test.ts
 *
 * This file retains the AnalysisResultSchema validation test as it tests
 * the type/schema directly, not analyze().
 */

import { describe, it, expect } from 'vitest';
import { AnalysisResultSchema } from '../../../src/engine/types/index.js';

describe('AnalysisResult schema validation', () => {
  it('validates a minimal AnalysisResult', () => {
    const minimal = {
      projectType: 'node',
      framework: 'nextjs',
      confidence: { projectType: 0.9, framework: 0.85 },
      indicators: { projectType: ['package.json found'], framework: ['next in dependencies'] },
      detectedAt: '2026-01-01T00:00:00.000Z',
      version: '1.0.0',
    };

    const result = AnalysisResultSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });
});
