import { describe, it, expect, beforeAll } from 'vitest';
import { inferPatterns } from '../../../../src/engine/analyzers/patterns/index.js';
import { testProjects } from './fixtures/testProjects.js';
import type { AnalysisResult } from '../../../../src/engine/types/index.js';
import { ParserManager } from '../../../../src/engine/parsers/treeSitter.js';
import { skipIfNoWasm } from '../../fixtures.js';

const wasmAvailable = await skipIfNoWasm();

describe.skipIf(!wasmAvailable)('Pattern Inference Integration', () => {
  beforeAll(async () => {
    await ParserManager.getInstance().initialize();
  });

  // analyze() integration tests deleted — analyze() was removed.
  // The equivalent behavior is tested via scanProject() in scanProject.test.ts.

  describe('inferPatterns() orchestrator', () => {
    it('returns PatternAnalysis with metadata', async () => {
      const mockAnalysis: AnalysisResult = {
        projectType: 'python',
        framework: 'fastapi',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '0.1.0',
        parsed: {
          files: [],
          totalParsed: 0,
          cacheHits: 0,
          cacheMisses: 0,
        },
      };

      const patterns = await inferPatterns('.', mockAnalysis);

      expect(patterns).toBeDefined();
      expect(patterns.threshold).toBe(0.7);
      expect(patterns.sampledFiles).toBe(0);
      expect(patterns.detectionTime).toBeGreaterThanOrEqual(0);
    });

    it('filters patterns by confidence threshold', async () => {
      const mockAnalysis: AnalysisResult = {
        projectType: 'python',
        framework: 'fastapi',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '0.1.0',
      };

      const patterns = await inferPatterns('.', mockAnalysis);

      if (patterns.validation) {
        expect(patterns.validation.confidence).toBeGreaterThanOrEqual(0.7);
      }
      if (patterns.database) {
        expect(patterns.database.confidence).toBeGreaterThanOrEqual(0.7);
      }
      if (patterns.auth) {
        expect(patterns.auth.confidence).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('handles errors gracefully (returns empty patterns)', async () => {
      const mockAnalysis: AnalysisResult = {
        projectType: 'unknown',
        framework: null,
        confidence: { projectType: 0.0, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '0.1.0',
      };

      const patterns = await inferPatterns('/nonexistent/path', mockAnalysis);

      expect(patterns).toBeDefined();
      expect(patterns.sampledFiles).toBe(0);
    });
  });

  describe('Test project structure validation', () => {
    it('has 30 test projects defined', () => {
      expect(testProjects).toHaveLength(30);
    });

    it('all projects have required fields', () => {
      testProjects.forEach(project => {
        expect(project.name).toBeDefined();
        expect(project.url).toMatch(/^https:\/\/github\.com/);
        expect(project.language).toBeDefined();
        expect(project.framework).toBeDefined();
        expect(project.expected).toBeDefined();
      });
    });

    it('has Python projects (10)', () => {
      expect(testProjects.filter(p => p.language === 'python')).toHaveLength(10);
    });

    it('has Node.js projects (10)', () => {
      expect(testProjects.filter(p => p.language === 'node')).toHaveLength(10);
    });

    it('has Go projects (5)', () => {
      expect(testProjects.filter(p => p.language === 'go')).toHaveLength(5);
    });

    it('has Rust projects (5)', () => {
      expect(testProjects.filter(p => p.language === 'rust')).toHaveLength(5);
    });

    it('has FastAPI projects (5)', () => {
      expect(testProjects.filter(p => p.framework === 'fastapi')).toHaveLength(5);
    });

    it('has Next.js projects (4)', () => {
      expect(testProjects.filter(p => p.framework === 'nextjs')).toHaveLength(4);
    });
  });

  describe('Performance validation', () => {
    it('completes pattern inference within budget (<10s)', async () => {
      const mockAnalysis: AnalysisResult = {
        projectType: 'python',
        framework: 'fastapi',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '0.1.0',
        parsed: {
          files: Array.from({ length: 20 }, (_, i) => ({
            file: `file${i}.py`,
            language: 'python',
            functions: [],
            classes: [],
            imports: [{ module: 'pydantic', names: ['BaseModel'], line: 1 }],
            decorators: [],
            parseTime: 0,
            parseMethod: 'cached' as const,
            errors: 0,
          })),
          totalParsed: 20,
          cacheHits: 20,
          cacheMisses: 0,
        },
      };

      const start = Date.now();
      const patterns = await inferPatterns('.', mockAnalysis);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10000);
      expect(patterns).toBeDefined();
    });
  });
});
