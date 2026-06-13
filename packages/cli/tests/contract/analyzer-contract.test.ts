/**
 * Contract tests between CLI and engine packages
 *
 * Validates that CLI scaffold generators accept EngineResult correctly.
 * If the EngineResult shape changes incompatibly, these tests fail.
 *
 * Run on every CI build.
 */

import { describe, it, expect } from 'vitest';
import { generateProjectContextScaffold } from '../../src/utils/scaffold-generators.js';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';
import type { EngineResult } from '../../src/engine/types/engineResult.js';

describe('Engine Interface Contract', () => {
  describe('required fields access', () => {
    it('accesses core EngineResult fields without errors', () => {
      const result = createEmptyEngineResult();

      // Should not throw — proves all required fields accessible
      expect(result.overview.project).toBe('unknown');
      expect(result.stack.language).toBeNull();
      expect(result.stack.framework).toBeNull();
      expect(result.commands.packageManager).toBeNull();
      expect(result.files.total).toBe(0);
    });

    // @ana A028
    it('createEmptyEngineResult includes surfaces field', () => {
      const result = createEmptyEngineResult();
      expect(result).toHaveProperty('surfaces');
      expect(result.surfaces).toEqual([]);
      expect(Array.isArray(result.surfaces)).toBe(true);
    });

    it('catches field renames at compile time', () => {
      const result: EngineResult = createEmptyEngineResult();

      // Required field access — TypeScript will fail if these are renamed
      const _project: string = result.overview.project;
      const _scannedAt: string = result.overview.scannedAt;
      const _language: string | null = result.stack.language;
      const _framework: string | null = result.stack.framework;
      const _packageManager: string | null = result.commands.packageManager;
      const _total: number = result.files.total;
      const _structure: Array<{ path: string; purpose: string }> = result.structure;

      expect(_project).toBeDefined();
      expect(_scannedAt).toBeDefined();
      expect(_language).toBeNull();
      expect(_framework).toBeNull();
      expect(_packageManager).toBeNull();
      expect(_total).toBe(0);
      expect(_structure).toHaveLength(0);
    });
  });

  describe('optional fields access', () => {
    it('handles full EngineResult with patterns and conventions', () => {
      const result: EngineResult = {
        ...createEmptyEngineResult(),
        overview: { project: 'test', scannedAt: '2026-03-19T10:00:00Z', depth: 'deep', indexedCommit: null },
        stack: {
          language: 'Python',
          framework: 'FastAPI',
          database: 'PostgreSQL',
          auth: null,
          testing: ['pytest'],
          payments: null,
          workspace: null,
          aiSdk: null,
          uiSystem: null,
        },
        patterns: {
          errorHandling: { library: 'exceptions', variant: '', confidence: 0.9, evidence: [] },
          validation: { library: 'pydantic', variant: '', confidence: 0.95, evidence: [] },
          testing: { library: 'pytest', variant: '', confidence: 1.0, evidence: [] },
          sampledFiles: 20,
          detectionTime: 5000,
          threshold: 0.7,
        },
        conventions: {
          naming: {
            files: {
              majority: 'snake_case',
              confidence: 0.9,
              mixed: false,
              distribution: { snake_case: 0.9 },
              sampleSize: 20,
            },
            functions: {
              majority: 'snake_case',
              confidence: 0.95,
              mixed: false,
              distribution: { snake_case: 0.95 },
              sampleSize: 20,
            },
            classes: {
              majority: 'PascalCase',
              confidence: 1.0,
              mixed: false,
              distribution: { PascalCase: 1.0 },
              sampleSize: 5,
            },
            variables: {
              majority: 'snake_case',
              confidence: 0.9,
              mixed: false,
              distribution: { snake_case: 0.9 },
              sampleSize: 20,
            },
            constants: {
              majority: 'SCREAMING_SNAKE_CASE',
              confidence: 1.0,
              mixed: false,
              distribution: { SCREAMING_SNAKE_CASE: 1.0 },
              sampleSize: 3,
            },
          },
          imports: {
            style: 'absolute',
            confidence: 0.85,
            distribution: { absolute: 0.85, relative: 0.15 },
            aliasPattern: null,
          },
          indentation: {
            style: 'spaces',
            width: 4,
            confidence: 1.0,
          },
          sampledFiles: 50,
          detectionTime: 2000,
        },
      };

      // Should not throw — proves scaffold generators accept EngineResult shape
      expect(() =>
        generateProjectContextScaffold(result)
      ).not.toThrow();
    });
  });

  describe('field count validation', () => {
    it('EngineResult has all expected top-level keys', () => {
      const result = createEmptyEngineResult();
      const keys = Object.keys(result);

      const expectedKeys = [
        'schemaVersion',
        'applicationShape',
        'overview',
        'stack',
        'stackProvenance',
        'versions',
        'files',
        'structure',
        'commands',
        'git',
        'monorepo',
        'externalServices',
        'schemas',
        'secrets',
        'projectProfile',
        'blindSpots',
        'findings',
        'deployment',
        'patterns',
        'conventions',
        'readme',
        'documentation',
        'secretFindings',
        'envVarMap',
        'duplicates',
        'circularDeps',
        'orphanFiles',
        'complexityHotspots',
        'gitIntelligence',
        'dependencyIntelligence',
        'technicalDebtMarkers',
        'inconsistencies',
        'conventionBreaks',
        'surfaces',
        'aiReadinessScore',
        'readingOrder',
      ];

      for (const key of expectedKeys) {
        expect(keys, `Missing top-level key: ${key}`).toContain(key);
      }

      expect(keys).toHaveLength(expectedKeys.length);
    });
  });

  // Phase 0 shape-freeze gates — assert the new/widened fields exist with the
  // frozen all-null defaults so later slices (1/3/5) populate a stable shape.
  describe('phase 0 shape-freeze gates', () => {
    it('overview carries an indexedCommit field defaulting to null', () => {
      const result = createEmptyEngineResult();
      expect(result.overview).toHaveProperty('indexedCommit');
      expect(result.overview.indexedCommit).toBeNull();
    });

    it('top-level readingOrder is present and null by default', () => {
      const result = createEmptyEngineResult();
      expect(result).toHaveProperty('readingOrder');
      expect(result.readingOrder).toBeNull();
    });

    it('coChangeCoupling.hasImportRelationship accepts boolean | null', () => {
      const result: EngineResult = {
        ...createEmptyEngineResult(),
        gitIntelligence: {
          churnHotspots: null,
          busFactor: null,
          coChangeCoupling: [
            { fileA: 'a.ts', fileB: 'b.ts', coChangePercentage: 0.5, hasImportRelationship: null },
            { fileA: 'c.ts', fileB: 'd.ts', coChangePercentage: 0.9, hasImportRelationship: true },
          ],
          bugMagnetFiles: null,
        },
      };
      // null = low-confidence import resolution; never fabricated as false.
      expect(result.gitIntelligence?.coChangeCoupling?.[0]?.hasImportRelationship).toBeNull();
      expect(result.gitIntelligence?.coChangeCoupling?.[1]?.hasImportRelationship).toBe(true);
    });

    it('bugMagnetFiles carries proof-chain fields alongside commit-churn fields', () => {
      const result: EngineResult = {
        ...createEmptyEngineResult(),
        gitIntelligence: {
          churnHotspots: null,
          busFactor: null,
          coChangeCoupling: null,
          bugMagnetFiles: [
            {
              file: 'src/commands/work.ts',
              bugCommitCount: 0,
              totalCommitCount: 0,
              ratio: 0,
              touchCount: 68,
              findingsPerTouch: 0.5,
              rejectionCycles: 4,
            },
          ],
        },
      };
      const magnet = result.gitIntelligence?.bugMagnetFiles?.[0];
      // Commit-churn semantics preserved (CORRECTION #3 — not overloaded).
      expect(magnet?.bugCommitCount).toBe(0);
      expect(magnet?.totalCommitCount).toBe(0);
      expect(magnet?.ratio).toBe(0);
      // Proof-chain semantics are distinct fields.
      expect(magnet?.touchCount).toBe(68);
      expect(magnet?.findingsPerTouch).toBe(0.5);
      expect(magnet?.rejectionCycles).toBe(4);
    });
  });
});
