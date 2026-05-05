import { z } from 'zod';

/**
 * Entry point detection result
 *
 * Contains entry point file paths (where code execution starts),
 * confidence score, and detection source.
 *
 * @example
 * ```typescript
 * {
 *   entryPoints: ['app/main.py'],
 *   confidence: 1.0,
 *   source: 'framework-convention'
 * }
 * ```
 */
export const EntryPointResultSchema = z.object({
  entryPoints: z.array(z.string()), // File paths (can be multiple for microservices)
  confidence: z.number().min(0).max(1),
  source: z.enum([
    'package.json-main', // Node: package.json "main" field (definitive)
    'package.json-exports', // Node: package.json "exports" field (modern)
    'framework-convention', // Framework-specific pattern (Django manage.py, NestJS src/main.ts)
    'convention', // Language convention (Python main.py, Go cmd/*/main.go)
    'not-found', // No entry point detected (library project)
  ]),
});

export type EntryPointResult = z.infer<typeof EntryPointResultSchema>;

/**
 * Architecture classification result
 *
 * Identifies project architecture pattern using directory structure heuristics.
 *
 * @example
 * ```typescript
 * {
 *   architecture: 'layered',
 *   confidence: 0.95,
 *   indicators: ['models/', 'services/', 'api/']
 * }
 * ```
 */
export const ArchitectureResultSchema = z.object({
  architecture: z.enum([
    'layered', // Technical layers: models/, services/, api/
    'domain-driven', // Business domains: features/*, modules/*
    'microservices', // Multiple services: apps/*, services/*, cmd/* (≥2)
    'monolith', // Single application, no separation
    'library', // No entry point, exports functions/classes
  ]),
  confidence: z.number().min(0).max(1),
  indicators: z.array(z.string()), // Directories that led to classification
});

export type ArchitectureResult = z.infer<typeof ArchitectureResultSchema>;

/**
 * Test location detection result
 *
 * Identifies where tests are located and which test framework is used.
 *
 * @example
 * ```typescript
 * {
 *   testLocations: ['tests/'],
 *   confidence: 1.0,
 *   framework: 'pytest'
 * }
 * ```
 */
export const TestLocationResultSchema = z.object({
  testLocations: z.array(z.string()), // Directories or file patterns
  confidence: z.number().min(0).max(1),
  framework: z.enum([
    'pytest', // Python
    'jest', // Node
    'vitest', // Node (modern)
    'go-test', // Go
    'cargo-test', // Rust
    'unknown', // No test framework detected
  ]),
});

export type TestLocationResult = z.infer<typeof TestLocationResultSchema>;

/**
 * Complete structure analysis result
 *
 * Comprehensive analysis of project directory structure including
 * entry points, architecture pattern, test locations, and directory tree.
 *
 * Extends AnalysisResult as optional field.
 *
 * @example
 * ```typescript
 * {
 *   directories: { 'src/': 'Source code', 'tests/': 'Tests' },
 *   entryPoints: ['app/main.py'],
 *   testLocation: 'tests/',
 *   architecture: 'layered',
 *   directoryTree: 'project/\n  src/\n  tests/',
 *   configFiles: ['.env', 'pyproject.toml'],
 *   confidence: {
 *     entryPoints: 1.0,
 *     testLocation: 1.0,
 *     architecture: 0.90,
 *     overall: 0.95
 *   }
 * }
 * ```
 */
export const StructureAnalysisSchema = z.object({
  // Directory purpose mapping
  directories: z.record(z.string(), z.string()), // path → purpose (e.g., 'src/' → 'Source code')

  // Entry points (where execution starts)
  entryPoints: z.array(z.string()), // File paths (e.g., ['app/main.py', 'manage.py'])

  // Test location (where tests live)
  testLocation: z.string().nullable(), // Directory or pattern (e.g., 'tests/' or '*_test.go')

  // Architecture classification
  architecture: z.string(), // 'layered' | 'domain-driven' | 'microservices' | etc.

  // ASCII directory tree (for context files)
  directoryTree: z.string(), // Max 50 lines, 4 levels deep

  // Config files detected
  configFiles: z.array(z.string()), // ['.env', 'tsconfig.json', 'settings.py', etc.]

  // Confidence scores (transparency - GEM #1)
  confidence: z.object({
    entryPoints: z.number().min(0).max(1), // 0.0-1.0
    testLocation: z.number().min(0).max(1), // 0.0-1.0
    architecture: z.number().min(0).max(1), // 0.60-0.95 (fuzzy concept)
    overall: z.number().min(0).max(1), // Weighted: 50% entry + 25% test + 25% arch
  }),
});

export type StructureAnalysis = z.infer<typeof StructureAnalysisSchema>;

/**
 * Helper to create empty StructureAnalysis (for tests, placeholders)
 */
export function createEmptyStructureAnalysis(): StructureAnalysis {
  return {
    directories: {},
    entryPoints: [],
    testLocation: null,
    architecture: 'unknown',
    directoryTree: '',
    configFiles: [],
    confidence: {
      entryPoints: 0.0,
      testLocation: 0.0,
      architecture: 0.0,
      overall: 0.0,
    },
  };
}
