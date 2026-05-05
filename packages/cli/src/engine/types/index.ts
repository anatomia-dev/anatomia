import { z } from 'zod';
import { StructureAnalysisSchema } from './structure.js';
import { ParsedAnalysisSchema } from './parsed.js';
import { PatternAnalysisSchema } from './patterns.js';
import { ConventionAnalysisSchema } from './conventions.js';

/**
 * Project types supported by Anatomia detection.
 *
 * Internal — only the derived `ProjectType` union is exported. The schema
 * itself has zero external consumers. Re-export the schema the day something
 * outside this file needs to validate a project type at runtime.
 */
const ProjectTypeSchema = z.enum([
  'python',
  'node',
  'go',
  'rust',
  'ruby',
  'php',
  'mixed', // Monorepo with multiple languages
  'unknown', // No indicators found
]);

export type ProjectType = z.infer<typeof ProjectTypeSchema>;

/**
 * Confidence score for a detection (internal).
 *
 * Range: 0.0 (no confidence) to 1.0 (certain). Internal — consumers that
 * need a runtime-validated confidence score get it transitively through
 * `AnalysisResultSchema`.
 */
const ConfidenceScoreSchema = z.number().min(0.0).max(1.0);

/**
 * Analysis result from project detection
 *
 * Detection provides: projectType, framework, confidence, indicators
 * Structure adds: entry points, architecture, tests, directory tree
 * Parsing adds: tree-sitter results
 * Patterns adds: pattern inference results
 * Conventions adds: convention detection results
 */
export const AnalysisResultSchema = z.object({
  // Project identification
  projectType: ProjectTypeSchema,
  framework: z.string().nullable(), // null if no framework detected

  // Confidence scores
  confidence: z.object({
    projectType: ConfidenceScoreSchema,
    framework: ConfidenceScoreSchema,
  }),

  // Indicators
  indicators: z.object({
    projectType: z.array(z.string()), // Files found: ["package.json", "package-lock.json"]
    framework: z.array(z.string()), // Signals found: ["next in dependencies", "next.config.js exists"]
  }),

  // Metadata
  detectedAt: z.string(), // ISO timestamp
  version: z.string(), // Tool version (e.g., "0.1.0-alpha")

  // Structure analysis (optional — populated by structure analyzer)
  structure: StructureAnalysisSchema.optional(),

  // Tree-sitter parsing (optional — populated by parser)
  parsed: ParsedAnalysisSchema.optional(),

  // Pattern inference (optional — populated by pattern analyzer)
  patterns: PatternAnalysisSchema.optional(),

  // Convention detection (optional — populated by convention analyzer)
  conventions: ConventionAnalysisSchema.optional(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/**
 * Minimal input for the deep-tier pipeline (parsing → patterns → conventions).
 *
 * Replaces AnalysisResult as the function parameter type for parseProjectFiles,
 * inferPatterns, and detectConventions. Only includes the fields those functions
 * actually read — no confidence, indicators, detectedAt, or version.
 *
 * Eliminates `as AnalysisResult` type casts in scan-engine.ts.
 */
export interface DeepTierInput {
  projectType: ProjectType;
  framework: string | null;
  structure?: import('./structure.js').StructureAnalysis | undefined;
  parsed?: import('./parsed.js').ParsedAnalysis | undefined;
  patterns?: import('./patterns.js').PatternAnalysis | undefined;
}

/**
 * Helper to create empty AnalysisResult (for tests, placeholders)
 */
export function createEmptyAnalysisResult(): AnalysisResult {
  return {
    projectType: 'unknown',
    framework: null,
    confidence: {
      projectType: 0.0,
      framework: 0.0,
    },
    indicators: {
      projectType: [],
      framework: [],
    },
    detectedAt: new Date().toISOString(),
    version: '0.0.0',
  };
}


// Export structure analysis types
export type {
  StructureAnalysis,
  EntryPointResult,
  ArchitectureResult,
  TestLocationResult,
} from './structure.js';
export {
  StructureAnalysisSchema,
  EntryPointResultSchema,
  ArchitectureResultSchema,
  TestLocationResultSchema,
  createEmptyStructureAnalysis,
} from './structure.js';

// Export parsed analysis types
export type {
  ParsedAnalysis,
  ParsedFile,
  FunctionInfo,
  ClassInfo,
  ImportInfo,
  ExportInfo,
  DecoratorInfo,
} from './parsed.js';
export {
  ParsedAnalysisSchema,
  ParsedFileSchema,
  FunctionInfoSchema,
  ClassInfoSchema,
  ImportInfoSchema,
  ExportInfoSchema,
  DecoratorInfoSchema,
  createEmptyParsedAnalysis,
} from './parsed.js';

// Export pattern analysis types
export type {
  PatternAnalysis,
  PatternConfidence,
  MultiPattern,
} from './patterns.js';
export {
  PatternAnalysisSchema,
  PatternConfidenceSchema,
  MultiPatternSchema,
  createEmptyPatternAnalysis,
  isMultiPattern,
} from './patterns.js';

// Export convention analysis types
export type {
  ConventionAnalysis,
  NamingConvention,
  ImportConvention,
  IndentationConvention,
  NamingStyle,
  ImportStyle,
  IndentStyle,
} from './conventions.js';
export {
  ConventionAnalysisSchema,
  NamingConventionSchema,
  ImportConventionSchema,
  IndentationConventionSchema,
  NamingStyleSchema,
  ImportStyleSchema,
  IndentStyleSchema,
  createEmptyConventionAnalysis,
} from './conventions.js';
