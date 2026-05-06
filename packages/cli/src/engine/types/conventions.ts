/**
 * Convention detection types
 *
 * Defines types for detected coding conventions:
 * - Naming (snake_case, camelCase, PascalCase, kebab-case, SCREAMING_SNAKE_CASE)
 * - Imports (absolute, relative, mixed)
 * - Type hints (always, sometimes, never - Python)
 * - Docstrings (google, numpy, rst, jsdoc, tsdoc, none)
 * - Indentation (spaces, tabs with width)
 */

import { z } from 'zod';

/**
 * Generic convention result with distribution
 *
 * Used for any convention type that has multiple possible values.
 * Reports majority, confidence, whether mixed, and full distribution.
 *
 * @param valueSchema
 * @example Clear convention
 * ```typescript
 * {
 *   majority: 'snake_case',
 *   confidence: 0.86,
 *   mixed: false,
 *   distribution: { snake_case: 0.86, camelCase: 0.10, PascalCase: 0.04 }
 * }
 * ```
 *
 * @example Mixed convention
 * ```typescript
 * {
 *   majority: 'snake_case',
 *   confidence: 0.65,
 *   mixed: true,  // <0.7 = mixed
 *   distribution: { snake_case: 0.65, camelCase: 0.30, PascalCase: 0.05 }
 * }
 * ```
 */
export const ConventionResultSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    majority: valueSchema,
    confidence: z.number().min(0).max(1),
    mixed: z.boolean(),  // true if confidence < 0.7
    distribution: z.record(z.string(), z.number()),  // All detected values with percentages
    sampleSize: z.number(),  // Number of names examined (0 for empty input)
  });

/**
 * Naming style enumeration
 */
export const NamingStyleSchema = z.enum([
  'snake_case',
  'camelCase',
  'PascalCase',
  'kebab-case',
  'SCREAMING_SNAKE_CASE',
  'lowercase',
  'unknown'
]);

export type NamingStyle = z.infer<typeof NamingStyleSchema>;

/**
 * Naming convention result for a single category (e.g., functions, variables)
 */
export const NamingConventionResultSchema = ConventionResultSchema(NamingStyleSchema);

export type NamingConventionResult = z.infer<typeof NamingConventionResultSchema>;

/**
 * Naming convention result (5 sub-categories)
 *
 * Analyzes naming across files, variables, functions, classes, and constants.
 *
 * @example Python project
 * ```typescript
 * {
 *   files: { majority: 'snake_case', confidence: 0.92, mixed: false, ... },
 *   variables: { majority: 'snake_case', confidence: 0.88, mixed: false, ... },
 *   functions: { majority: 'snake_case', confidence: 0.95, mixed: false, ... },
 *   classes: { majority: 'PascalCase', confidence: 1.0, mixed: false, ... },
 *   constants: { majority: 'SCREAMING_SNAKE_CASE', confidence: 1.0, mixed: false, ... }
 * }
 * ```
 */
export const NamingConventionSchema = z.object({
  files: NamingConventionResultSchema.optional(),
  variables: NamingConventionResultSchema.optional(),
  functions: NamingConventionResultSchema.optional(),
  classes: NamingConventionResultSchema.optional(),
  constants: NamingConventionResultSchema.optional(),
});

export type NamingConvention = z.infer<typeof NamingConventionSchema>;

/**
 * Import style enumeration
 */
export const ImportStyleSchema = z.enum(['absolute', 'relative', 'mixed']);

export type ImportStyle = z.infer<typeof ImportStyleSchema>;

/**
 * Import convention result
 *
 * @example Absolute imports
 * ```typescript
 * {
 *   style: 'absolute',
 *   confidence: 0.85,
 *   distribution: { absolute: 0.85, relative: 0.15 }
 * }
 * ```
 */
export const ImportConventionSchema = z.object({
  style: ImportStyleSchema,
  confidence: z.number().min(0).max(1),
  distribution: z.object({
    absolute: z.number(),
    relative: z.number(),
  }),
  aliasPattern: z.string().nullable(),  // analyzer always sets this (null or string) — no .optional()
});

export type ImportConvention = z.infer<typeof ImportConventionSchema>;

// typeHints + docstrings analyzers were deleted — they ran on fields
// that don't exist on FunctionInfo via `as unknown as` casts and always returned
// defaults. Phantom detection removed entirely, not shipped as zeros pretending
// to be measurements. Re-add only when tree-sitter extraction supplies real data.

/**
 * Indentation style enumeration
 */
export const IndentStyleSchema = z.enum(['spaces', 'tabs', 'mixed']);

export type IndentStyle = z.infer<typeof IndentStyleSchema>;

/**
 * Indentation convention result
 *
 * @example 4-space indentation
 * ```typescript
 * {
 *   style: 'spaces',
 *   width: 4,
 *   confidence: 1.0
 * }
 * ```
 */
export const IndentationConventionSchema = z.object({
  style: IndentStyleSchema,
  width: z.number().optional(),  // 2, 4, or 8 if spaces
  confidence: z.number().min(0).max(1),
});

export type IndentationConvention = z.infer<typeof IndentationConventionSchema>;

/**
 * Complete convention analysis result
 *
 * Contains detected conventions for all 5 categories (all optional).
 * Includes metadata about detection process (files sampled, time taken).
 *
 * @example TypeScript project
 * ```typescript
 * {
 *   naming: {
 *     files: { majority: 'kebab-case', confidence: 0.90, mixed: false, ... },
 *     variables: { majority: 'camelCase', confidence: 0.95, mixed: false, ... },
 *     functions: { majority: 'camelCase', confidence: 0.92, mixed: false, ... },
 *     classes: { majority: 'PascalCase', confidence: 1.0, mixed: false, ... },
 *   },
 *   imports: { style: 'absolute', confidence: 0.85, distribution: { absolute: 0.85, relative: 0.15 } },
 *   indentation: { style: 'spaces', width: 2, confidence: 1.0 },
 *   sampledFiles: 50,
 *   detectionTime: 2340
 * }
 * ```
 */
/**
 * Code pattern signals — grep-based characterization for contradiction detection.
 * These signals tell the setup agent whether template rules match the project's
 * actual patterns. Not style conventions — quality/architecture patterns.
 */
export const CodePatternsSchema = z.object({
  jsExtensionImports: z.object({
    count: z.number(),
    total: z.number(),
    ratio: z.number(),
  }).optional(),
  nodePrefix: z.object({
    count: z.number(),
    total: z.number(),
    ratio: z.number(),
  }).optional(),
  emptyCatches: z.object({
    empty: z.number(),
    commented: z.number(),
    total: z.number(),
  }).optional(),
  defaultExports: z.object({
    count: z.number(),
    totalFiles: z.number(),
  }).optional(),
  nullStyle: z.object({
    nullCount: z.number(),
    optionalCount: z.number(),
    preference: z.enum(['null', 'undefined', 'mixed']),
  }).optional(),
});

export type CodePatterns = z.infer<typeof CodePatternsSchema>;

export const ConventionAnalysisSchema = z.object({
  // 3 convention categories (all optional - may not detect all)
  naming: NamingConventionSchema.optional(),
  imports: ImportConventionSchema.optional(),
  indentation: IndentationConventionSchema.optional(),
  // Code pattern signals (optional — only populated in deep tier)
  codePatterns: CodePatternsSchema.optional(),

  // Metadata
  sampledFiles: z.number(),
  detectionTime: z.number(),  // milliseconds
});

export type ConventionAnalysis = z.infer<typeof ConventionAnalysisSchema>;

/**
 * Helper to create empty ConventionAnalysis (for tests, errors, graceful degradation)
 */
export function createEmptyConventionAnalysis(): ConventionAnalysis {
  return {
    sampledFiles: 0,
    detectionTime: 0,
  };
}
