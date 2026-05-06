import { describe, it, expect, beforeAll } from 'vitest';
import { createEmptyAnalysisResult } from '../../../src/engine/types/index.js';
import { detectConventions } from '../../../src/engine/analyzers/conventions/index.js';
import type { AnalysisResult } from '../../../src/engine/types/index.js';
import { ParserManager } from '../../../src/engine/parsers/treeSitter.js';
import { skipIfNoWasm } from '../fixtures.js';

const wasmAvailable = await skipIfNoWasm();

describe.skipIf(!wasmAvailable)('Convention Detection Edge Cases', () => {
  beforeAll(async () => {
    await ParserManager.getInstance().initialize();
  });

  it('handles no parsed data gracefully', async () => {

    const analysis = createEmptyAnalysisResult();
    // No parsed field

    const conventions = await detectConventions('/tmp', analysis);

    // Graceful degradation - returns empty
    expect(conventions.sampledFiles).toBe(0);
    expect(conventions.detectionTime).toBeGreaterThanOrEqual(0);
  });

  it('handles empty parsed files array', async () => {

    const analysis: AnalysisResult = {
      ...createEmptyAnalysisResult(),
      projectType: 'python',
      structure: {
        directories: {},
        entryPoints: [],
        testLocation: null,
        architecture: 'unknown',
        directoryTree: '',
        configFiles: [],
        confidence: { entryPoints: 0, testLocation: 0, architecture: 0, overall: 0 },
      },
      parsed: {
        files: [],  // Empty
        totalParsed: 0,
        cacheHits: 0,
        cacheMisses: 0,
      },
    };

    const conventions = await detectConventions('/tmp', analysis);

    expect(conventions).toBeDefined();
    expect(conventions.sampledFiles).toBeGreaterThanOrEqual(0);
  });

  it('handles project with no functions or classes', async () => {

    const analysis: AnalysisResult = {
      ...createEmptyAnalysisResult(),
      projectType: 'python',
      structure: {
        directories: {},
        entryPoints: ['test.py'],
        testLocation: null,
        architecture: 'unknown',
        directoryTree: '',
        configFiles: [],
        confidence: { entryPoints: 1.0, testLocation: 0, architecture: 0, overall: 0.5 },
      },
      parsed: {
        files: [{
          file: 'test.py',
          language: 'python',
          functions: [],  // No functions
          classes: [],    // No classes
          imports: [],
          parseTime: 0,
          parseMethod: 'cached',
          errors: 0,
        }],
        totalParsed: 1,
        cacheHits: 0,
        cacheMisses: 1,
      },
    };

    const conventions = await detectConventions('/tmp', analysis);

    expect(conventions.naming).toBeDefined();
    // Functions/classes might have unknown majority with 0 confidence
    expect(conventions.naming?.functions).toBeDefined();
  });

  // "handles TypeScript project (no type hints)" test removed — typeHints analyzer
  // was deleted (phantom detection on nonexistent fields).

  it('handles all unknown naming (ambiguous single-word names)', async () => {

    const analysis: AnalysisResult = {
      ...createEmptyAnalysisResult(),
      projectType: 'python',
      structure: {
        directories: {},
        entryPoints: ['test.py'],
        testLocation: null,
        architecture: 'unknown',
        directoryTree: '',
        configFiles: [],
        confidence: { entryPoints: 1.0, testLocation: 0, architecture: 0, overall: 0.5 },
      },
      parsed: {
        files: [{
          file: 'test.py',
          language: 'python',
          functions: [
            { name: 'func', line: 1, async: false, decorators: [] },  // Single word
            { name: 'data', line: 2, async: false, decorators: [] },  // Single word
          ],
          classes: [],
          imports: [],
          parseTime: 0,
          parseMethod: 'cached',
          errors: 0,
        }],
        totalParsed: 1,
        cacheHits: 0,
        cacheMisses: 1,
      },
    };

    const conventions = await detectConventions('/tmp', analysis);

    // Should handle gracefully (unknown majority with 0 confidence)
    expect(conventions.naming?.functions).toBeDefined();
    if (conventions.naming?.functions?.majority === 'unknown') {
      expect(conventions.naming.functions.confidence).toBe(0);
    }
  });

  it('handles no internal imports (library project)', async () => {

    const analysis: AnalysisResult = {
      ...createEmptyAnalysisResult(),
      projectType: 'python',
      structure: {
        directories: {},
        entryPoints: ['test.py'],
        testLocation: null,
        architecture: 'unknown',
        directoryTree: '',
        configFiles: [],
        confidence: { entryPoints: 1.0, testLocation: 0, architecture: 0, overall: 0.5 },
      },
      parsed: {
        files: [{
          file: 'test.py',
          language: 'python',
          functions: [],
          classes: [],
          imports: [
            { module: 'fastapi', names: [], line: 1 },  // External
            { module: 'pydantic', names: [], line: 2 }, // External
          ],
          parseTime: 0,
          parseMethod: 'cached',
          errors: 0,
        }],
        totalParsed: 1,
        cacheHits: 0,
        cacheMisses: 1,
      },
    };

    const conventions = await detectConventions('/tmp', analysis);

    // Should handle gracefully (mixed with 0 confidence)
    expect(conventions.imports).toBeDefined();
    expect(conventions.imports?.style).toBe('mixed');
    expect(conventions.imports?.confidence).toBe(0);
  });

  // "handles no docstrings (coverage 0%)" test removed — docstrings analyzer
  // was deleted. The prior test was a THP Q3 "sentinel test": it
  // asserted coverage === 0, but the analyzer ALWAYS returned 0 regardless of
  // input because it read a `docstring` field that doesn't exist on FunctionInfo
  // via an `as unknown as` cast. The test would have passed on any input.

  it('handles mixed indentation gracefully', async () => {

    const analysis: AnalysisResult = {
      ...createEmptyAnalysisResult(),
      projectType: 'python',
      structure: {
        directories: {},
        entryPoints: ['test.py'],
        testLocation: null,
        architecture: 'unknown',
        directoryTree: '',
        configFiles: [],
        confidence: { entryPoints: 1.0, testLocation: 0, architecture: 0, overall: 0.5 },
      },
      parsed: {
        files: [{
          file: 'test.py',
          language: 'python',
          functions: [],
          classes: [],
          imports: [],
          parseTime: 0,
          parseMethod: 'cached',
          errors: 0,
        }],
        totalParsed: 1,
        cacheHits: 0,
        cacheMisses: 1,
      },
    };

    const conventions = await detectConventions('/tmp', analysis);

    // Indentation should detect from file contents
    expect(conventions.indentation).toBeDefined();
    expect(conventions.indentation?.style).toMatch(/spaces|tabs|mixed/);
  });

  it('performance: completes in reasonable time', async () => {

    const analysis: AnalysisResult = {
      ...createEmptyAnalysisResult(),
      projectType: 'python',
      structure: {
        directories: {},
        entryPoints: ['test.py'],
        testLocation: null,
        architecture: 'unknown',
        directoryTree: '',
        configFiles: [],
        confidence: { entryPoints: 1.0, testLocation: 0, architecture: 0, overall: 0.5 },
      },
      parsed: {
        files: [{
          file: 'test.py',
          language: 'python',
          functions: [{ name: 'func', line: 1, async: false, decorators: [] }],
          classes: [],
          imports: [],
          parseTime: 0,
          parseMethod: 'cached',
          errors: 0,
        }],
        totalParsed: 1,
        cacheHits: 0,
        cacheMisses: 1,
      },
    };

    const start = Date.now();
    const conventions = await detectConventions('/tmp', analysis);
    const duration = Date.now() - start;

    // Generous budget for mock tests (real projects tested in accuracy suite)
    expect(duration).toBeLessThan(10000);
    expect(conventions.detectionTime).toBeGreaterThanOrEqual(0);
  });

  it('all categories have required fields', async () => {

    const analysis: AnalysisResult = {
      ...createEmptyAnalysisResult(),
      projectType: 'python',
      structure: {
        directories: {},
        entryPoints: ['test.py'],
        testLocation: null,
        architecture: 'unknown',
        directoryTree: '',
        configFiles: [],
        confidence: { entryPoints: 1.0, testLocation: 0, architecture: 0, overall: 0.5 },
      },
      parsed: {
        files: [{
          file: 'user_service.py',
          language: 'python',
          functions: [{ name: 'get_user', line: 1, async: false, decorators: [] }],
          classes: [{ name: 'User', line: 10, superclasses: [], methods: [], decorators: [] }],
          imports: [{ module: 'src.models', names: [], line: 1 }],
          parseTime: 0,
          parseMethod: 'cached',
          errors: 0,
        }],
        totalParsed: 1,
        cacheHits: 0,
        cacheMisses: 1,
      },
    };

    const conventions = await detectConventions('/tmp', analysis);

    // Naming should have all 5 sub-categories
    expect(conventions.naming?.files).toHaveProperty('majority');
    expect(conventions.naming?.files).toHaveProperty('confidence');
    expect(conventions.naming?.files).toHaveProperty('mixed');
    expect(conventions.naming?.files).toHaveProperty('distribution');

    // Imports should have required fields
    expect(conventions.imports).toHaveProperty('style');
    expect(conventions.imports).toHaveProperty('confidence');
    expect(conventions.imports).toHaveProperty('distribution');

    // Metadata
    expect(conventions.sampledFiles).toBeGreaterThanOrEqual(0);
    expect(conventions.detectionTime).toBeGreaterThanOrEqual(0);
  });
});
