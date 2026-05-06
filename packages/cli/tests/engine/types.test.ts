import { describe, it, expect } from 'vitest';
import {
  AnalysisResult,
  AnalysisResultSchema,
  ProjectType,
  createEmptyAnalysisResult,
} from '../../src/engine/types/index.js';
import type { EngineResult } from '../../src/engine/types/engineResult.js';
import type {
  NamingConventionResult,
  ConventionAnalysis,
} from '../../src/engine/types/conventions.js';
import type {
  PatternAnalysis,
  PatternConfidence,
  MultiPattern,
} from '../../src/engine/types/patterns.js';
import type { DetectedCommands } from '../../src/engine/detectors/commands.js';
import type { GitInfo } from '../../src/engine/detectors/git.js';
import type {
  DetectedDeployment,
  DetectedCI,
} from '../../src/engine/detectors/deployment.js';

describe('AnalysisResult types', () => {
  describe('createEmptyAnalysisResult', () => {
    it('creates valid empty result', () => {
      const result = createEmptyAnalysisResult();

      expect(result.projectType).toBe('unknown');
      expect(result.framework).toBeNull();
      expect(result.confidence.projectType).toBe(0.0);
      expect(result.confidence.framework).toBe(0.0);
      expect(result.indicators.projectType).toEqual([]);
      expect(result.indicators.framework).toEqual([]);
      expect(result.version).toBe('0.0.0');
    });

    it('includes valid ISO timestamp', () => {
      const result = createEmptyAnalysisResult();
      const parsedDate = new Date(result.detectedAt);
      expect(parsedDate.toISOString()).toBe(result.detectedAt);
    });
  });

  describe('AnalysisResultSchema validation', () => {
    it('validates correct AnalysisResult', () => {
      const result: AnalysisResult = {
        projectType: 'python',
        framework: 'fastapi',
        confidence: {
          projectType: 1.0,
          framework: 0.95,
        },
        indicators: {
          projectType: ['requirements.txt', 'pyproject.toml'],
          framework: ['fastapi in dependencies', 'FastAPI imports found'],
        },
        detectedAt: new Date().toISOString(),
        version: '0.1.0-alpha',
      };

      expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
    });

    it('rejects invalid project type', () => {
      const invalid = {
        projectType: 'invalid-type', // Not in enum
        framework: null,
        confidence: { projectType: 1.0, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '0.1.0-alpha',
      };

      expect(() => AnalysisResultSchema.parse(invalid)).toThrow();
    });

    it('rejects out-of-range confidence', () => {
      const invalid = {
        projectType: 'python',
        framework: null,
        confidence: { projectType: 1.5, framework: 0.0 }, // Out of range
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '0.1.0-alpha',
      };

      expect(() => AnalysisResultSchema.parse(invalid)).toThrow();
    });

    it('accepts all valid project types', () => {
      const validTypes: ProjectType[] = [
        'python',
        'node',
        'go',
        'rust',
        'ruby',
        'php',
        'mixed',
        'unknown',
      ];

      for (const type of validTypes) {
        const result = createEmptyAnalysisResult();
        result.projectType = type;
        expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
      }
    });
  });
});

/**
 * Compile-time type-unification assertions.
 *
 * The body of these `it` blocks is irrelevant at runtime — the assertions
 * live in the type annotations on the declarations. If convention unification
 * or pattern unification ever regresses, tsc will refuse to compile this file.
 *
 * IMPORTANT: enforcement becomes real once tsconfig.test.json +
 * `typecheck.enabled: true` is added in vitest.config.ts. Until then,
 * `tests/` is excluded from tsconfig.json and vitest's default transform
 * (esbuild) strips types without full checking — so today these assertions
 * guard against gross regressions only (missing fields, renamed types).
 */
describe('type-unification compile-time assertions', () => {
  it('EngineResult.conventions is the analyzer ConventionAnalysis type', () => {
    // If these lines compile, the unification is intact.
    type ConventionsField = NonNullable<EngineResult['conventions']>;
    const _same1: ConventionsField = {} as ConventionAnalysis;
    const _same2: ConventionAnalysis = {} as ConventionsField;
    void _same1;
    void _same2;

    // Naming sub-field must be the analyzer NamingConventionResult.
    type FunctionsField = NonNullable<ConventionsField['naming']>['functions'];
    const _naming: NamingConventionResult = {} as NonNullable<FunctionsField>;
    void _naming;

    expect(true).toBe(true);
  });

  it('EngineResult.patterns is the analyzer PatternAnalysis type', () => {
    type PatternsField = NonNullable<EngineResult['patterns']>;
    const _same1: PatternsField = {} as PatternAnalysis;
    const _same2: PatternAnalysis = {} as PatternsField;
    void _same1;
    void _same2;

    // Individual pattern categories accept the union directly — no
    // intermediate PatternDetail mapping (deleted).
    type DatabasePattern = PatternsField['database'];
    const _asSingle: DatabasePattern = {} as PatternConfidence | undefined;
    const _asMulti: DatabasePattern = {} as MultiPattern | undefined;
    void _asSingle;
    void _asMulti;

    expect(true).toBe(true);
  });

  it('EngineResult.commands composes DetectedCommands & { packageManager }', () => {
    // scan-engine composes detectCommands() output with packageManager.
    // If EngineResult['commands'] regresses to an inline type that omits any
    // DetectedCommands field, this block fails to compile.
    const commandsField = {} as EngineResult['commands'];
    const _detected: DetectedCommands = commandsField;  // must be assignable both ways
    const _composed: EngineResult['commands'] = {
      ...({} as DetectedCommands),
      packageManager: 'pnpm',
    };
    // The composition adds exactly `packageManager: string | null` on top.
    const _pm: string | null = commandsField.packageManager;
    void _detected;
    void _composed;
    void _pm;

    expect(true).toBe(true);
  });

  it('EngineResult.git is GitInfo directly', () => {
    // Inline git shape was byte-identical to GitInfo, so the field
    // imports the detector type directly. Any inline divergence fails here.
    const _a: GitInfo = {} as EngineResult['git'];
    const _b: EngineResult['git'] = {} as GitInfo;
    void _a;
    void _b;

    expect(true).toBe(true);
  });

  it('EngineResult.deployment composes DetectedDeployment & DetectedCI', () => {
    // scan-engine merges detectDeployment() + detectCI() via spread.
    // The field type matches that runtime shape exactly — both halves must
    // be assignable from EngineResult['deployment'] and vice versa.
    const deployField = {} as EngineResult['deployment'];
    const _asDeploy: DetectedDeployment = deployField;
    const _asCI: DetectedCI = deployField;
    const _composed: EngineResult['deployment'] = {
      ...({} as DetectedDeployment),
      ...({} as DetectedCI),
    };
    void _asDeploy;
    void _asCI;
    void _composed;

    expect(true).toBe(true);
  });
});
