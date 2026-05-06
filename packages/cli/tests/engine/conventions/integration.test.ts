import { describe, it, expect, beforeAll } from 'vitest';
import { createEmptyAnalysisResult } from '../../../src/engine/types/index.js';
import { detectConventions } from '../../../src/engine/analyzers/conventions/index.js';
import type { AnalysisResult } from '../../../src/engine/types/index.js';
import { ParserManager } from '../../../src/engine/parsers/treeSitter.js';
import { skipIfNoWasm } from '../fixtures.js';

const wasmAvailable = await skipIfNoWasm();

describe.skipIf(!wasmAvailable)('detectConventions orchestrator', () => {
  beforeAll(async () => {
    await ParserManager.getInstance().initialize();
  });

  it('returns ConventionAnalysis with all required fields', async () => {

    // Create mock analysis with minimal parsed data
    const analysis: AnalysisResult = {
      ...createEmptyAnalysisResult(),
      projectType: 'python',
      structure: {
        directories: {},
        entryPoints: ['test_file.py'],
        testLocation: null,
        architecture: 'unknown',
        directoryTree: '',
        configFiles: [],
        confidence: { entryPoints: 1.0, testLocation: 0, architecture: 0, overall: 0.5 },
      },
      parsed: {
        files: [
          {
            file: 'test_file.py',
            language: 'python',
            functions: [{ name: 'test_func', line: 1, async: false, decorators: [] }],
            classes: [{ name: 'TestClass', line: 10, superclasses: [], methods: [], decorators: [] }],
            imports: [{ module: 'os', names: [], line: 1 }],
            parseTime: 0,
            parseMethod: 'cached',
            errors: 0,
          },
        ],
        totalParsed: 1,
        cacheHits: 0,
        cacheMisses: 1,
      },
    };

    const fileNames = analysis.parsed?.files.map(f => f.file) ?? [];
    const conventions = await detectConventions('/tmp', analysis, { preSampledFiles: fileNames });

    expect(conventions).toBeDefined();
    expect(conventions.naming).toBeDefined();
    expect(conventions.imports).toBeDefined();
    expect(conventions.indentation).toBeDefined();
    expect(conventions.sampledFiles).toBeGreaterThanOrEqual(0);
    expect(conventions.detectionTime).toBeGreaterThanOrEqual(0);
  });

  it('handles missing parsed data gracefully', async () => {

    const analysis = createEmptyAnalysisResult();
    // No parsed field

    const fileNames = analysis.parsed?.files.map(f => f.file) ?? [];
    const conventions = await detectConventions('/tmp', analysis, { preSampledFiles: fileNames });

    // Should return empty conventions (graceful degradation)
    expect(conventions.sampledFiles).toBe(0);
    expect(conventions.detectionTime).toBeGreaterThanOrEqual(0);
  });

  // "includes typeHints only for Python projects" test removed — typeHints
  // analyzer was deleted (phantom detection).

  it('naming includes all 5 sub-categories', async () => {

    const analysis: AnalysisResult = {
      ...createEmptyAnalysisResult(),
      projectType: 'python',
      structure: {
        directories: {},
        entryPoints: ['user_service.py'],
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

    const fileNames = analysis.parsed?.files.map(f => f.file) ?? [];
    const conventions = await detectConventions('/tmp', analysis, { preSampledFiles: fileNames });

    expect(conventions.naming).toBeDefined();
    expect(conventions.naming?.files).toBeDefined();
    expect(conventions.naming?.functions).toBeDefined();
    expect(conventions.naming?.classes).toBeDefined();
    expect(conventions.naming?.variables).toBeDefined();
    expect(conventions.naming?.constants).toBeDefined();
  });
});

describe.skipIf(!wasmAvailable)('Mixed convention handling', () => {
  beforeAll(async () => {
    await ParserManager.getInstance().initialize();
  });

  it('reports distributions for mixed naming', async () => {

    const analysis: AnalysisResult = {
      ...createEmptyAnalysisResult(),
      projectType: 'python',
      structure: {
        directories: {},
        entryPoints: ['snake_file.py', 'snake_two.py', 'camelFile.py'],
        testLocation: null,
        architecture: 'unknown',
        directoryTree: '',
        configFiles: [],
        confidence: { entryPoints: 1.0, testLocation: 0, architecture: 0, overall: 0.5 },
      },
      parsed: {
        files: [
          { file: 'snake_file.py', language: 'python', functions: [], classes: [], imports: [], parseTime: 0, parseMethod: 'cached', errors: 0 },
          { file: 'snake_two.py', language: 'python', functions: [], classes: [], imports: [], parseTime: 0, parseMethod: 'cached', errors: 0 },
          { file: 'camelFile.py', language: 'python', functions: [], classes: [], imports: [], parseTime: 0, parseMethod: 'cached', errors: 0 },
        ],
        totalParsed: 3,
        cacheHits: 0,
        cacheMisses: 3,
      },
    };

    const fileNames = analysis.parsed?.files.map(f => f.file) ?? [];
    const conventions = await detectConventions('/tmp', analysis, { preSampledFiles: fileNames });

    if (conventions.naming?.files) {
      expect(conventions.naming.files.majority).toBeDefined();
      expect(conventions.naming.files.confidence).toBeGreaterThan(0);
      expect(conventions.naming.files.distribution).toBeDefined();
      expect(typeof conventions.naming.files.mixed).toBe('boolean');
    }
  });

  it('reports distributions for mixed imports', async () => {

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
            { module: 'src.models', names: [], line: 1 },  // Absolute
            { module: '.local', names: [], line: 2 },      // Relative
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

    const fileNames = analysis.parsed?.files.map(f => f.file) ?? [];
    const conventions = await detectConventions('/tmp', analysis, { preSampledFiles: fileNames });

    expect(conventions.imports).toBeDefined();
    expect(conventions.imports?.distribution.absolute).toBeGreaterThanOrEqual(0);
    expect(conventions.imports?.distribution.relative).toBeGreaterThanOrEqual(0);
  });
});

describe.skipIf(!wasmAvailable)('Performance', () => {
  beforeAll(async () => {
    await ParserManager.getInstance().initialize();
  });

  it('completes in reasonable time', async () => {

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
    const fileNames = analysis.parsed?.files.map(f => f.file) ?? [];
    const conventions = await detectConventions('/tmp', analysis, { preSampledFiles: fileNames });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(10000);  // 10s generous budget for mock test
    expect(conventions.detectionTime).toBeGreaterThanOrEqual(0);
  });
});
