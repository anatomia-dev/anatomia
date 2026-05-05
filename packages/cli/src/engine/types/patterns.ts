/**
 * Pattern inference types
 *
 * Defines types for detected coding patterns:
 * - Error handling (exceptions, error returns)
 * - Validation (pydantic, zod, joi)
 * - Database (sqlalchemy, prisma, typeorm)
 * - Auth (JWT, OAuth, sessions)
 * - Testing (pytest, jest, vitest)
 */

import { z } from 'zod';

/**
 * Pattern confidence with evidence
 *
 * Represents a detected pattern (e.g., Pydantic validation, SQLAlchemy database)
 * with confidence score and human-readable evidence.
 *
 * @example
 * ```typescript
 * {
 *   library: 'pydantic',
 *   confidence: 0.95,
 *   evidence: [
 *     'pydantic in dependencies',
 *     'BaseModel imports found',
 *     '7 Pydantic models detected'
 *   ]
 * }
 * ```
 *
 * @example Multi-pattern (SQLAlchemy async variant)
 * ```typescript
 * {
 *   library: 'sqlalchemy',
 *   variant: 'async',
 *   confidence: 0.95,
 *   evidence: [
 *     'sqlalchemy + asyncpg in dependencies',
 *     'AsyncSession imports found',
 *     '12 async route handlers detected'
 *   ],
 *   primary: true  // Dominant pattern in multi-pattern scenario
 * }
 * ```
 */
export const PatternConfidenceSchema = z.object({
  library: z.string(),                    // 'pydantic', 'zod', 'sqlalchemy', 'pytest', etc.
  variant: z.string().optional(),         // 'async', 'sync' for databases; framework-specific variants
  confidence: z.number().min(0).max(1),   // 0.0-1.0 score
  evidence: z.array(z.string()),          // Human-readable evidence (e.g., 'pydantic in dependencies')
  primary: z.boolean().optional(),        // true if dominant pattern (multi-pattern scenarios)
});

export type PatternConfidence = z.infer<typeof PatternConfidenceSchema>;

/**
 * Multi-pattern detection result
 *
 * Used when multiple variants of same category detected
 * (e.g., SQLAlchemy sync + async in migration scenario)
 *
 * @example SQLAlchemy migration project
 * ```typescript
 * {
 *   patterns: [
 *     {
 *       library: 'sqlalchemy',
 *       variant: 'async',
 *       confidence: 0.95,
 *       evidence: ['AsyncSession in 12 files', 'asyncpg driver'],
 *       primary: true  // Dominant pattern
 *     },
 *     {
 *       library: 'sqlalchemy',
 *       variant: 'sync',
 *       confidence: 0.85,
 *       evidence: ['Session in 3 files', 'legacy routes'],
 *       primary: false  // Secondary pattern
 *     }
 *   ],
 *   primary: {
 *     library: 'sqlalchemy',
 *     variant: 'async',
 *     confidence: 0.95,
 *     evidence: ['AsyncSession in 12 files', 'asyncpg driver'],
 *     primary: true
 *   },
 *   confidence: 0.95  // Uses primary pattern's confidence
 * }
 * ```
 */
export const MultiPatternSchema = z.object({
  patterns: z.array(PatternConfidenceSchema),  // All detected patterns for this category
  primary: PatternConfidenceSchema,            // Dominant pattern (highest frequency/confidence)
  confidence: z.number().min(0).max(1),        // Overall category confidence (uses primary's confidence)
});

export type MultiPattern = z.infer<typeof MultiPatternSchema>;

/**
 * Type guard to check if pattern is multi-pattern
 *
 * @param pattern
 * @example
 * ```typescript
 * const pattern = result.database;
 * if (isMultiPattern(pattern)) {
 *   console.log('Multiple database patterns:', pattern.patterns.length);
 *   console.log('Primary:', pattern.primary.variant);
 * } else {
 *   console.log('Single pattern:', pattern.library);
 * }
 * ```
 */
export function isMultiPattern(
  pattern: PatternConfidence | MultiPattern | undefined
): pattern is MultiPattern {
  return pattern !== undefined && 'patterns' in pattern;
}

/**
 * Get the primary library name from a pattern, handling both single and multi-pattern cases.
 *
 * Returns null if the pattern is undefined or has no detectable library. Lives next to
 * `isMultiPattern` because both exist to handle the PatternConfidence | MultiPattern union
 * at consumer sites. Centralized here so there's ONE place to look for pattern-union helpers
 * instead of scattered `isMultiPattern ? primary.library : library` ternaries at every consumer.
 *
 * @param pattern
 * @returns The primary library name, or null if unset.
 * @example
 * ```typescript
 * const libName = getPatternLibrary(analysis.patterns?.database);
 * if (libName) stack.database = getPatternDisplayName(libName);
 * ```
 */
export function getPatternLibrary(
  pattern: PatternConfidence | MultiPattern | undefined
): string | null {
  if (!pattern) return null;
  return isMultiPattern(pattern) ? pattern.primary.library : pattern.library;
}

/**
 * Complete pattern analysis result
 *
 * Contains detected patterns for 5 categories (all optional - may not detect all).
 * Includes metadata about detection process (files sampled, time taken, threshold used).
 *
 * @example FastAPI project
 * ```typescript
 * {
 *   errorHandling: {
 *     library: 'exceptions',
 *     variant: 'fastapi',
 *     confidence: 0.95,
 *     evidence: ['HTTPException in dependencies', 'HTTPException imports found']
 *   },
 *   validation: {
 *     library: 'pydantic',
 *     confidence: 0.95,
 *     evidence: ['pydantic in dependencies', 'BaseModel imports found', '7 Pydantic models']
 *   },
 *   database: {
 *     library: 'sqlalchemy',
 *     variant: 'async',
 *     confidence: 0.95,
 *     evidence: ['sqlalchemy + asyncpg', 'AsyncSession imports', '12 async handlers']
 *   },
 *   auth: {
 *     library: 'oauth2-jwt',
 *     confidence: 0.95,
 *     evidence: ['python-jose in dependencies', 'OAuth2PasswordBearer detected']
 *   },
 *   testing: {
 *     library: 'pytest',
 *     confidence: 0.95,
 *     evidence: ['pytest in dependencies', 'tests/ directory exists', 'pytest.ini found']
 *   },
 *   sampledFiles: 20,
 *   detectionTime: 8742,
 *   threshold: 0.7
 * }
 * ```
 */
export const PatternAnalysisSchema = z.object({
  // 5 pattern categories (all optional - not all projects have all patterns)
  // Supports union types (PatternConfidence | MultiPattern)
  errorHandling: z.union([PatternConfidenceSchema, MultiPatternSchema]).optional(),
  validation: z.union([PatternConfidenceSchema, MultiPatternSchema]).optional(),
  database: z.union([PatternConfidenceSchema, MultiPatternSchema]).optional(),
  auth: z.union([PatternConfidenceSchema, MultiPatternSchema]).optional(),
  testing: z.union([PatternConfidenceSchema, MultiPatternSchema]).optional(),

  // Deep-tier hook/composable categories (all optional)
  dataFetching: z.union([PatternConfidenceSchema, MultiPatternSchema]).optional(),
  stateManagement: z.union([PatternConfidenceSchema, MultiPatternSchema]).optional(),
  formHandling: z.union([PatternConfidenceSchema, MultiPatternSchema]).optional(),

  // Metadata
  sampledFiles: z.number(),               // How many files sampled (0 when no sampling, 20 when sampled)
  detectionTime: z.number(),              // Milliseconds for inference
  threshold: z.number(),                  // Confidence threshold used (0.7)
});

export type PatternAnalysis = z.infer<typeof PatternAnalysisSchema>;

/**
 * Helper to create empty PatternAnalysis (for tests, errors, graceful degradation)
 *
 * Used when pattern inference fails or is skipped.
 */
export function createEmptyPatternAnalysis(): PatternAnalysis {
  return {
    sampledFiles: 0,
    detectionTime: 0,
    threshold: 0.7,
  };
}
