import { describe, it, expect } from 'vitest';
import { confirmPatternsWithTreeSitter } from '../../../../src/engine/analyzers/patterns/index.js';
import type { AnalysisResult } from '../../../../src/engine/types/index.js';
import type { PatternConfidence } from '../../../../src/engine/types/patterns.js';

describe('Pattern Confirmation Performance', () => {
  it('completes in <100ms when using cached parsed data', async () => {
    // Create analysis with pre-parsed files (simulates cache hit)
    const analysis: AnalysisResult = {
      projectType: 'python',
      framework: 'fastapi',
      confidence: { projectType: 0.95, framework: 0.90 },
      indicators: { projectType: [], framework: [] },
      detectedAt: new Date().toISOString(),
      version: '1.0.0',
      parsed: {
        files: [
          // 20 files (typical sample size)
          ...Array.from({ length: 20 }, (_, i) => ({
            file: `app/file${i}.py`,
            language: 'python',
            functions: [],
            classes: [],
            imports: [{ module: 'pydantic', names: ['BaseModel'], line: 1 }],
            decorators: [],
            parseTime: 0,  // Cache hit = 0ms
            parseMethod: 'cached' as const,
            errors: 0,
          })),
        ],
        totalParsed: 20,
        cacheHits: 20,  // 100% cache hit
        cacheMisses: 0,
      },
    };

    const initialPatterns: Partial<Record<string, PatternConfidence>> = {
      validation: {
        library: 'pydantic',
        confidence: 0.75,
        evidence: ['pydantic in dependencies'],
      },
    };

    const startTime = Date.now();
    const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);
    const duration = Date.now() - startTime;

    // Should be fast (just iterating arrays, no parsing)
    expect(duration).toBeLessThan(100);  // <100ms (nearly instant)
    expect(confirmed['validation']?.confidence).toBeGreaterThan(0.75);  // Boosted
  });

  it('does not trigger re-parsing (reuses existing parsed data)', async () => {
    // This test verifies implementation doesn't call parseProjectFiles
    // If it did, performance would be 100-200ms (not <50ms)

    const analysis: AnalysisResult = {
      projectType: 'node',
      framework: 'express',
      confidence: { projectType: 0.95, framework: 0.90 },
      indicators: { projectType: [], framework: [] },
      detectedAt: new Date().toISOString(),
      version: '1.0.0',
      parsed: {
        files: [{
          file: 'src/index.ts',
          language: 'typescript',
          functions: [],
          classes: [],
          imports: [{ module: 'zod', names: ['z'], line: 1 }],
          decorators: [],
          parseTime: 0,
          parseMethod: 'cached',
          errors: 0
        }],
        totalParsed: 1,
        cacheHits: 1,
        cacheMisses: 0,
      },
    };

    const initialPatterns: Partial<Record<string, PatternConfidence>> = {
      validation: {
        library: 'zod',
        confidence: 0.75,
        evidence: ['zod in dependencies'],
      },
    };

    const startTime = Date.now();
    const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);
    const duration = Date.now() - startTime;

    // Confirmation should be instant (just array operations)
    expect(duration).toBeLessThan(50);
    expect(confirmed['validation']?.confidence).toBeGreaterThan(0.75);
  });
});
