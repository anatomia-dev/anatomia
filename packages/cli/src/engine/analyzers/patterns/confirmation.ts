/**
 * Tree-sitter pattern confirmation.
 *
 * Stage 3 of pattern inference: AST-level confirmation of patterns detected
 * from dependencies. Each confirmer inspects parsed imports and class/
 * function shapes to boost confidence and attach variant information
 * (e.g., SQLAlchemy sync vs async, Pydantic BaseModel class count).
 *
 * All 5 confirm* helpers mutate the `patterns` argument in place — the
 * orchestrator copies the initial pattern map before passing it in, so the
 * mutations are scoped to that copy.
 *
 * detectMultipleDatabasePatterns is exported (for test coverage) and is
 * called by confirmDatabasePattern to detect sync+async coexistence in
 * SQLAlchemy projects.
 */

import type { DeepTierInput, ParsedFile } from '../../types/index.js';
import type { PatternConfidence, MultiPattern } from '../../types/patterns.js';
import { isMultiPattern } from '../../types/patterns.js';

// ============================================================================
// DOMINANCE THRESHOLDS
// ============================================================================

/** >=30% of component files = dominant */
const DOMINANCE_THRESHOLD_DOMINANT = 0.30;

/** >=10% of component files = present */
const DOMINANCE_THRESHOLD_PRESENT = 0.10;

/** File extensions considered "component files" for dominance calculation */
const COMPONENT_EXTENSIONS = ['.tsx', '.jsx', '.vue'];

/** Directory names that indicate component files */
const COMPONENT_DIRECTORIES = ['components', 'pages', 'app'];

// ============================================================================
// STAGE 3: TREE-SITTER CONFIRMATION
// ============================================================================

/**
 * Confirm patterns using tree-sitter analysis (Stage 3)
 *
 * OPTIMIZATION: Reuses parsed files from the parsing phase (no re-parsing needed).
 * 98.9% cache hit rate from the ASTCache means this is nearly instant.
 *
 * Boosts confidence based on code evidence:
 * - Imports found: +0.15 (0.75 → 0.90)
 * - Usage patterns: +0.05 (0.90 → 0.95)
 * - Multiple instances: +0.05 additional (0.95 → 1.0 capped)
 *
 * @param rootPath - Project root (not used, but kept for consistency)
 * @param initialPatterns - Patterns from detectFromDependencies() (Stage 1 baseline)
 * @param analysis - DeepTierInput with parsed files from the parsing phase
 * @returns Patterns with boosted confidence based on code evidence
 */
export async function confirmPatternsWithTreeSitter(
  rootPath: string,
  initialPatterns: Partial<Record<string, PatternConfidence>>,
  analysis: DeepTierInput
): Promise<Record<string, PatternConfidence>> {
  // Copy initial patterns (will mutate confidence and evidence)
  const confirmed = { ...initialPatterns };

  // Get parsed files (already cached, no re-parsing)
  const parsedFiles = analysis.parsed?.files || [];

  // Confirm each category (each function mutates confirmed object)
  // Note: Testing confirmation uses structure.testLocation, so run even if no parsed files
  await confirmValidationPattern(confirmed, parsedFiles, analysis);
  await confirmErrorHandlingPattern(confirmed, parsedFiles, analysis);
  await confirmDatabasePattern(confirmed, parsedFiles, analysis);
  await confirmAuthPattern(confirmed, parsedFiles, analysis);
  await confirmTestingPattern(confirmed, parsedFiles, analysis);

  // Deep-tier hook/composable confirmations
  await confirmDataFetchingPattern(confirmed, parsedFiles, analysis);
  await confirmStateManagementPattern(confirmed, parsedFiles, analysis);
  await confirmFormHandlingPattern(confirmed, parsedFiles, analysis);

  return confirmed as Record<string, PatternConfidence>;
}

/**
 * Confirm validation pattern in parsed code
 *
 * Checks for:
 * - Pydantic: BaseModel imports, class inheritance
 * - Zod: z.object() usage, schema definitions
 * - Joi: Joi.object() calls
 * - class-validator: Decorator usage
 *
 * Boosts confidence if patterns found in code.
 * @param patterns
 * @param parsedFiles
 * @param analysis
 */
async function confirmValidationPattern(
  patterns: Partial<Record<string, PatternConfidence>>,
  parsedFiles: ParsedFile[],
  _analysis: DeepTierInput
): Promise<void> {
  if (!patterns['validation']) return;  // No validation pattern detected in dependency stage

  const library = patterns['validation'].library;

  // Pydantic confirmation
  if (library === 'pydantic') {
    // Check for Pydantic imports
    const hasPydanticImports = parsedFiles.some(f =>
      f.imports.some(imp =>
        imp.module.includes('pydantic') ||
        imp.names.includes('BaseModel')
      )
    );

    if (hasPydanticImports) {
      patterns['validation'].confidence = Math.min(1.0,
        patterns['validation'].confidence + 0.15  // Import verification boost
      );
      patterns['validation'].evidence.push('Pydantic imports found in code');
    }

    // Count classes inheriting from BaseModel
    const baseModelClasses = parsedFiles
      .flatMap(f => f.classes)
      .filter(cls => cls.superclasses.includes('BaseModel'));

    if (baseModelClasses.length > 0) {
      patterns['validation'].confidence = Math.min(1.0,
        patterns['validation'].confidence + 0.05  // Usage boost
      );
      patterns['validation'].evidence.push(
        `${baseModelClasses.length} Pydantic model(s) detected`
      );
    }
  }

  // Zod confirmation
  else if (library === 'zod') {
    // Check for Zod imports
    const hasZodImports = parsedFiles.some(f =>
      f.imports.some(imp =>
        imp.module === 'zod' ||
        imp.names.includes('z')
      )
    );

    if (hasZodImports) {
      patterns['validation'].confidence = Math.min(1.0,
        patterns['validation'].confidence + 0.15
      );
      patterns['validation'].evidence.push('Zod imports found in code');

      // Additional boost for usage
      patterns['validation'].confidence = Math.min(1.0,
        patterns['validation'].confidence + 0.05
      );
      patterns['validation'].evidence.push('Zod usage patterns detected');
    }
  }

  // Joi confirmation
  else if (library === 'joi') {
    const hasJoiImports = parsedFiles.some(f =>
      f.imports.some(imp =>
        imp.module === 'joi' ||
        imp.names.includes('Joi')
      )
    );

    if (hasJoiImports) {
      patterns['validation'].confidence = Math.min(1.0,
        patterns['validation'].confidence + 0.15
      );
      patterns['validation'].evidence.push('Joi imports found in code');
    }
  }

  // class-validator confirmation
  else if (library === 'class-validator') {
    // Check for validation decorators
    const hasValidatorDecorators = parsedFiles.some(f =>
      f.decorators?.some(dec =>
        dec.name.startsWith('Is') ||  // @IsString, @IsEmail, etc.
        dec.name.startsWith('Min') ||  // @Min, @Max
        dec.name === 'ValidateNested'
      )
    );

    if (hasValidatorDecorators) {
      patterns['validation'].confidence = Math.min(1.0,
        patterns['validation'].confidence + 0.15
      );
      patterns['validation'].evidence.push('Validation decorators found');
    }
  }

  // DRF serializers confirmation
  else if (library === 'drf-serializers') {
    // Check for serializers.ModelSerializer or serializers.Serializer
    const hasSerializerClasses = parsedFiles
      .flatMap(f => f.classes)
      .filter(cls =>
        cls.superclasses.some(s =>
          s.includes('Serializer') || s.includes('ModelSerializer')
        )
      );

    if (hasSerializerClasses.length > 0) {
      patterns['validation'].confidence = Math.min(1.0,
        patterns['validation'].confidence + 0.15
      );
      patterns['validation'].evidence.push(
        `${hasSerializerClasses.length} DRF Serializer(s) detected`
      );
    }
  }

  // go-playground/validator confirmation
  else if (library === 'go-playground-validator') {
    // Check for validator imports
    const hasValidatorImports = parsedFiles.some(f =>
      f.imports.some(imp => imp.module.includes('validator'))
    );

    if (hasValidatorImports) {
      patterns['validation'].confidence = Math.min(1.0,
        patterns['validation'].confidence + 0.10
      );
      patterns['validation'].evidence.push('Validator imports found');
    }
  }

  // Yup confirmation
  else if (library === 'yup') {
    const hasYupImports = parsedFiles.some(f =>
      f.imports.some(imp =>
        imp.module === 'yup' ||
        imp.names.includes('yup')
      )
    );

    if (hasYupImports) {
      patterns['validation'].confidence = Math.min(1.0,
        patterns['validation'].confidence + 0.15
      );
      patterns['validation'].evidence.push('Yup imports found in code');
    }
  }
}

/**
 * Confirm error handling pattern prevalence
 *
 * Checks frequency of error handling patterns in code.
 * Heuristic: Route decorators and framework imports indicate error handling.
 * @param patterns
 * @param parsedFiles
 * @param analysis
 */
async function confirmErrorHandlingPattern(
  patterns: Partial<Record<string, PatternConfidence>>,
  parsedFiles: ParsedFile[],
  _analysis: DeepTierInput
): Promise<void> {
  if (!patterns['errorHandling']) return;

  const library = patterns['errorHandling'].library;

  // Exception-based error handling (Python, JavaScript, TypeScript)
  if (library === 'exceptions') {
    // Count files with error handling patterns
    let filesWithErrorPatterns = 0;

    for (const file of parsedFiles) {
      // Heuristic: Files with route decorators likely have error handling
      const hasRouteDecorators = file.decorators?.some(dec =>
        dec.name.includes('app.') ||      // FastAPI @app.get
        dec.name.includes('router.') ||   // FastAPI @router.post
        dec.name.includes('Get') ||       // NestJS @Get()
        dec.name.includes('Post')         // NestJS @Post()
      );

      // Heuristic: Files importing framework likely have error handling
      const hasFrameworkImports = file.imports.some(imp =>
        imp.module.includes('fastapi') ||
        imp.module.includes('express') ||
        imp.module.includes('django') ||
        imp.names.includes('HTTPException')
      );

      if (hasRouteDecorators || hasFrameworkImports) {
        filesWithErrorPatterns++;
      }
    }

    // Boost based on prevalence
    if (filesWithErrorPatterns >= 10) {
      patterns['errorHandling'].confidence = Math.min(1.0,
        patterns['errorHandling'].confidence + 0.15
      );
      patterns['errorHandling'].evidence.push(
        `${filesWithErrorPatterns} file(s) with error handling patterns`
      );
    } else if (filesWithErrorPatterns >= 5) {
      patterns['errorHandling'].confidence = Math.min(1.0,
        patterns['errorHandling'].confidence + 0.10
      );
      patterns['errorHandling'].evidence.push(
        `${filesWithErrorPatterns} file(s) with error patterns`
      );
    }

    // Check for HTTPException specifically (FastAPI)
    if (patterns['errorHandling'].variant === 'fastapi-httpexception') {
      const hasHTTPException = parsedFiles.some(f =>
        f.imports.some(imp => imp.names.includes('HTTPException'))
      );

      if (hasHTTPException) {
        patterns['errorHandling'].confidence = Math.min(1.0,
          patterns['errorHandling'].confidence + 0.05
        );
        patterns['errorHandling'].evidence.push('HTTPException imports found');
      }
    }
  }

  // Go error returns (already high confidence)
  else if (library === 'error-returns') {
    // Go error returns are language convention
    // Confidence already 1.0 from dependency detection, just add evidence
    if (!patterns['errorHandling'].evidence.includes('Go error return convention confirmed')) {
      patterns['errorHandling'].evidence.push('Go error return convention confirmed');
    }
  }
}

/**
 * Confirm database pattern usage and detect variants
 *
 * Detects multiple patterns (e.g., SQLAlchemy sync + async)
 * Uses detectMultipleDatabasePatterns() for variant detection.
 *
 * SQLAlchemy: Distinguish async vs sync based on imports (AsyncSession vs Session)
 * Prisma: Verify PrismaClient imports
 * GORM: Check struct tag usage
 * @param patterns
 * @param parsedFiles
 * @param analysis
 */
async function confirmDatabasePattern(
  patterns: Partial<Record<string, PatternConfidence | MultiPattern>>,
  parsedFiles: ParsedFile[],
  _analysis: DeepTierInput
): Promise<void> {
  // Parameter type widened to accept the full union — previously narrowed to
  // PatternConfidence but the function assigns MultiPattern at line below via
  // a cast that silenced the type mismatch. After this
  // change the cast is unnecessary and the isMultiPattern guard below makes
  // the code honest about which branch is running.
  const dbPattern = patterns['database'];
  if (!dbPattern) return;

  // If already a multi-pattern (e.g., from a prior confirmation pass), skip
  // the single-pattern boost logic below — the fields (variant, confidence,
  // evidence) don't exist directly on MultiPattern; they live on primary.
  if (isMultiPattern(dbPattern)) return;

  // From here on, dbPattern is narrowed to PatternConfidence.
  const library = dbPattern.library;

  // SQLAlchemy confirmation with multi-pattern detection
  if (library === 'sqlalchemy') {
    // Detect if multiple patterns exist (sync + async)
    const multiPattern = await detectMultipleDatabasePatterns(parsedFiles);

    if (multiPattern && 'patterns' in multiPattern) {
      // Multi-pattern detected — replace the single pattern with MultiPattern.
      // No cast needed now: the widened parameter type accepts both branches.
      patterns['database'] = multiPattern;
      return;  // Multi-pattern replaces single pattern, no further boosting
    }

    // Single pattern or no pattern detected via multi-pattern check
    // Continue with existing boost logic below
  }

  // SQLAlchemy confirmation and variant detection
  if (library === 'sqlalchemy') {
    // Check for AsyncSession imports (async variant)
    const hasAsyncImports = parsedFiles.some(f =>
      f.imports.some(imp =>
        imp.module.includes('sqlalchemy.ext.asyncio') ||
        imp.names.includes('AsyncSession') ||
        imp.names.includes('create_async_engine')
      )
    );

    // Check for Session imports (sync variant)
    const hasSyncImports = parsedFiles.some(f =>
      f.imports.some(imp =>
        imp.module.includes('sqlalchemy.orm') &&
        (imp.names.includes('Session') || imp.names.includes('sessionmaker')) &&
        !imp.module.includes('asyncio')
      )
    );

    if (hasAsyncImports) {
      dbPattern.variant = 'async';
      dbPattern.confidence = Math.min(1.0, dbPattern.confidence + 0.15);
      dbPattern.evidence.push('AsyncSession imports found (async variant confirmed)');
    } else if (hasSyncImports) {
      dbPattern.variant = 'sync';
      dbPattern.confidence = Math.min(1.0, dbPattern.confidence + 0.10);  // Slightly lower boost (sync is legacy)
      dbPattern.evidence.push('Session imports found (sync variant confirmed)');
    }

    // Count async route handlers with database usage
    const asyncDbFunctions = parsedFiles
      .flatMap(f => f.functions)
      .filter(fn =>
        fn.async &&
        fn.decorators.some(d =>
          d.includes('app.') ||
          d.includes('router.')
        )
      );

    if (asyncDbFunctions.length > 0) {
      dbPattern.confidence = Math.min(1.0, dbPattern.confidence + 0.05);
      dbPattern.evidence.push(
        `${asyncDbFunctions.length} async route handler(s) with database usage`
      );
    }
  }

  // Prisma confirmation
  else if (library === 'prisma') {
    const hasPrismaImports = parsedFiles.some(f =>
      f.imports.some(imp =>
        imp.module.includes('@prisma/client') ||
        imp.names.includes('PrismaClient')
      )
    );

    if (hasPrismaImports) {
      dbPattern.confidence = Math.min(1.0, dbPattern.confidence + 0.15);
      dbPattern.evidence.push('PrismaClient imports found');
    }
  }

  // TypeORM confirmation
  else if (library === 'typeorm') {
    const hasTypeORMImports = parsedFiles.some(f =>
      f.imports.some(imp => imp.module.includes('typeorm'))
    );

    if (hasTypeORMImports) {
      dbPattern.confidence = Math.min(1.0, dbPattern.confidence + 0.15);
      dbPattern.evidence.push('TypeORM imports found');
    }
  }

  // GORM confirmation
  else if (library === 'gorm') {
    const hasGORMImports = parsedFiles.some(f =>
      f.imports.some(imp => imp.module.includes('gorm.io/gorm'))
    );

    if (hasGORMImports) {
      dbPattern.confidence = Math.min(1.0, dbPattern.confidence + 0.10);
      dbPattern.evidence.push('GORM imports found');
    }
  }

  // Sequelize confirmation
  else if (library === 'sequelize') {
    const hasSequelizeImports = parsedFiles.some(f =>
      f.imports.some(imp => imp.module.includes('sequelize'))
    );

    if (hasSequelizeImports) {
      dbPattern.confidence = Math.min(1.0, dbPattern.confidence + 0.15);
      dbPattern.evidence.push('Sequelize imports found');
    }
  }

  // Drizzle confirmation
  else if (library === 'drizzle') {
    const hasDrizzleImports = parsedFiles.some(f =>
      f.imports.some(imp => imp.module.includes('drizzle-orm'))
    );

    if (hasDrizzleImports) {
      dbPattern.confidence = Math.min(1.0, dbPattern.confidence + 0.15);
      dbPattern.evidence.push('Drizzle ORM imports found');
    }
  }

  // Django ORM (built-in, high confidence already)
  else if (library === 'django-orm') {
    // Django ORM is built-in, no boost needed (confidence already 1.0)
    dbPattern.evidence.push('Django ORM confirmed (built-in to framework)');
  }

  // sqlc confirmation
  else if (library === 'sqlc') {
    // sqlc is a code generator, check for generated code patterns
    const hasSqlcPatterns = parsedFiles.some(f =>
      f.imports.some(imp => imp.module.includes('database/sql'))
    );

    if (hasSqlcPatterns) {
      dbPattern.confidence = Math.min(1.0, dbPattern.confidence + 0.10);
      dbPattern.evidence.push('sqlc patterns detected');
    }
  }
}

/**
 * Confirm auth pattern usage in code
 * @param patterns
 * @param parsedFiles
 * @param analysis
 */
async function confirmAuthPattern(
  patterns: Partial<Record<string, PatternConfidence>>,
  parsedFiles: ParsedFile[],
  _analysis: DeepTierInput
): Promise<void> {
  if (!patterns['auth']) return;

  const library = patterns['auth'].library;

  // JWT confirmation (cross-language)
  if (library === 'jwt' || library === 'oauth2-jwt') {
    const hasJWTImports = parsedFiles.some(f =>
      f.imports.some(imp =>
        imp.module.includes('jwt') ||
        imp.module.includes('jose') ||
        imp.names.includes('OAuth2PasswordBearer')
      )
    );

    if (hasJWTImports) {
      patterns['auth'].confidence = Math.min(1.0,
        patterns['auth'].confidence + 0.15
      );
      patterns['auth'].evidence.push('JWT library imports found in code');
    }
  }

  // Third-party auth (Clerk, NextAuth)
  else if (library === 'clerk' || library === 'next-auth') {
    const hasAuthImports = parsedFiles.some(f =>
      f.imports.some(imp =>
        imp.module.includes('@clerk/nextjs') ||
        imp.module.includes('next-auth')
      )
    );

    if (hasAuthImports) {
      patterns['auth'].confidence = Math.min(1.0,
        patterns['auth'].confidence + 0.05  // Smaller boost (dependency already 0.90)
      );
      patterns['auth'].evidence.push('Auth library imports confirmed');
    }
  }

  // Session-based auth
  else if (library === 'express-session' || library === 'passport') {
    const hasSessionImports = parsedFiles.some(f =>
      f.imports.some(imp =>
        imp.module.includes('express-session') ||
        imp.module.includes('passport')
      )
    );

    if (hasSessionImports) {
      patterns['auth'].confidence = Math.min(1.0,
        patterns['auth'].confidence + 0.15
      );
      patterns['auth'].evidence.push('Session auth imports found');
    }
  }

  // Auth0 confirmation
  else if (library === 'auth0') {
    const hasAuth0Imports = parsedFiles.some(f =>
      f.imports.some(imp => imp.module.includes('auth0'))
    );

    if (hasAuth0Imports) {
      patterns['auth'].confidence = Math.min(1.0,
        patterns['auth'].confidence + 0.05
      );
      patterns['auth'].evidence.push('Auth0 imports confirmed');
    }
  }

  // Django auth (built-in)
  else if (library === 'django-auth') {
    // Django auth is built-in, just confirm
    patterns['auth'].evidence.push('Django auth confirmed (built-in)');
  }
}

/**
 * Confirm testing pattern presence
 *
 * Uses structure.testLocation from structure analysis (test directory already detected).
 * Boosts confidence if test directory found.
 * @param patterns
 * @param parsedFiles
 * @param analysis
 */
async function confirmTestingPattern(
  patterns: Partial<Record<string, PatternConfidence>>,
  parsedFiles: ParsedFile[],
  analysis: DeepTierInput
): Promise<void> {
  if (!patterns['testing']) return;

  const framework = patterns['testing'].library;

  // Use test location from structure analysis
  const testLocation = analysis.structure?.testLocation;

  if (testLocation) {
    // Go test special case - set to 1.0
    if (analysis.projectType === 'go') {
      patterns['testing'].confidence = 1.0;  // Go test always present
      patterns['testing'].evidence.push('Go test files confirmed (*_test.go pattern)');
    } else {
      // Other frameworks - boost by 0.15
      patterns['testing'].confidence = Math.min(1.0,
        patterns['testing'].confidence + 0.15
      );
      patterns['testing'].evidence.push(
        `Test directory detected: ${testLocation}`
      );
    }
  }

  // Framework-specific confirmations
  if (framework === 'pytest' || framework === 'jest' || framework === 'vitest') {
    const hasTestImports = parsedFiles.some(f =>
      f.imports.some(imp => imp.module.includes(framework))
    );

    if (hasTestImports) {
      patterns['testing'].confidence = Math.min(1.0,
        patterns['testing'].confidence + 0.05
      );
      patterns['testing'].evidence.push(`${framework} imports found`);
    }
  }
}

// ============================================================================
// MULTI-PATTERN DETECTION
// ============================================================================

/**
 * Detect multiple database patterns (variant detection)
 *
 * Common scenario: Project migrating from sync to async SQLAlchemy
 * - Legacy routes: Session (sync)
 * - New routes: AsyncSession (async)
 *
 * Returns:
 * - MultiPattern if both variants detected (2+ patterns)
 * - PatternConfidence if only one variant (single pattern)
 * - null if no database pattern detected
 *
 * Primary selection logic:
 * 1. Highest frequency (most files using pattern)
 * 2. If tied: async preferred over sync (modern pattern)
 * 3. If still tied: higher confidence wins
 *
 * @param parsedFiles - Parsed files from the parsing phase
 * @returns Multi-pattern, single pattern, or null
 */
export async function detectMultipleDatabasePatterns(
  parsedFiles: ParsedFile[]
): Promise<MultiPattern | PatternConfidence | null> {
  const detected: PatternConfidence[] = [];

  // Count AsyncSession usage (async variant)
  const asyncSessionFiles = parsedFiles.filter(f =>
    f.imports.some(imp =>
      imp.module.includes('sqlalchemy.ext.asyncio') &&
      (imp.names.includes('AsyncSession') ||
       imp.names.includes('create_async_engine'))
    )
  ).length;

  // Count Session usage (sync variant)
  // Exclude files that also have async imports (avoid double-counting mixed files)
  const syncSessionFiles = parsedFiles.filter(f => {
    const hasAsyncImport = f.imports.some(imp =>
      imp.module.includes('sqlalchemy.ext.asyncio')
    );
    const hasSyncImport = f.imports.some(imp =>
      imp.module.includes('sqlalchemy.orm') &&
      (imp.names.includes('Session') || imp.names.includes('sessionmaker'))
    );
    // Only count if has sync import AND no async import
    return hasSyncImport && !hasAsyncImport;
  }).length;

  // Detect async variant if files found
  if (asyncSessionFiles > 0) {
    const confidence = 0.80 + (asyncSessionFiles >= 5 ? 0.15 : 0.10);
    detected.push({
      library: 'sqlalchemy',
      variant: 'async',
      confidence: Math.min(1.0, confidence),
      evidence: [
        `AsyncSession imports in ${asyncSessionFiles} file(s)`,
        'Modern async pattern detected'
      ],
      primary: asyncSessionFiles >= syncSessionFiles,  // Primary if more files
    });
  }

  // Detect sync variant if files found
  if (syncSessionFiles > 0) {
    const confidence = 0.70 + (syncSessionFiles >= 5 ? 0.15 : 0.10);
    detected.push({
      library: 'sqlalchemy',
      variant: 'sync',
      confidence: Math.min(1.0, confidence),
      evidence: [
        `Session imports in ${syncSessionFiles} file(s)`,
        'Legacy sync pattern detected'
      ],
      primary: syncSessionFiles > asyncSessionFiles,  // Primary if more files
    });
  }

  // No patterns detected
  if (detected.length === 0) {
    return null;
  }

  // Single pattern detected - return PatternConfidence (not MultiPattern)
  if (detected.length === 1) {
    const pattern = detected[0]!;  // Length check guarantees this exists
    pattern.primary = true;  // Single pattern is always primary
    return pattern;
  }

  // Multiple patterns detected - determine primary based on frequency
  // Primary selection: highest frequency, async preferred on tie
  const asyncPattern = detected.find(p => p.variant === 'async');
  const syncPattern = detected.find(p => p.variant === 'sync');

  let primary: PatternConfidence;
  if (asyncSessionFiles > syncSessionFiles) {
    // Async has more files - it's primary
    primary = asyncPattern!;
    primary.primary = true;
    if (syncPattern) syncPattern.primary = false;
  } else if (syncSessionFiles > asyncSessionFiles) {
    // Sync has more files - it's primary
    primary = syncPattern!;
    primary.primary = true;
    if (asyncPattern) asyncPattern.primary = false;
  } else {
    // Tied frequency - prefer async (modern pattern)
    primary = asyncPattern!;
    primary.primary = true;
    if (syncPattern) syncPattern.primary = false;
  }

  return {
    patterns: detected,
    primary,
    confidence: primary.confidence,  // Use primary pattern's confidence
  };
}

// ============================================================================
// DEEP-TIER HOOK/COMPOSABLE CONFIRMATION
// ============================================================================

/**
 * Check if a file is a "component file" for dominance calculation.
 *
 * Component files: .tsx, .jsx, .vue extensions OR files in components/, pages/, app/ directories.
 * Excludes test files and utility files.
 */
function isComponentFile(filePath: string): boolean {
  // Exclude test files
  if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('__tests__')) {
    return false;
  }

  // Check extension
  if (COMPONENT_EXTENSIONS.some(ext => filePath.endsWith(ext))) {
    return true;
  }

  // Check directory
  const parts = filePath.split('/');
  return parts.some(part => COMPONENT_DIRECTORIES.includes(part));
}

/**
 * Classify dominance based on file count fraction.
 *
 * @param hookFileCount - Files importing the hook
 * @param totalComponentFiles - Total component files in project
 * @returns Classification string and fraction
 */
function classifyDominance(
  hookFileCount: number,
  totalComponentFiles: number,
): { classification: string; fraction: number } {
  if (totalComponentFiles === 0) {
    return { classification: 'present', fraction: 0 };
  }

  const fraction = hookFileCount / totalComponentFiles;

  if (fraction >= DOMINANCE_THRESHOLD_DOMINANT) {
    return { classification: 'dominant', fraction };
  }
  if (fraction >= DOMINANCE_THRESHOLD_PRESENT) {
    return { classification: 'present', fraction };
  }
  return { classification: 'incidental', fraction };
}

/**
 * Count files importing specific hook names from a given module.
 *
 * @param parsedFiles - All parsed files
 * @param modulePattern - Module name substring to match
 * @param hookNames - Hook function names to look for in imports
 * @returns Number of files with matching imports
 */
function countHookImportFiles(
  parsedFiles: ParsedFile[],
  modulePattern: string,
  hookNames: string[],
): number {
  return parsedFiles.filter(f =>
    f.imports.some(imp =>
      imp.module.includes(modulePattern) &&
      imp.names.some(n => hookNames.includes(n))
    )
  ).length;
}

/**
 * Detect Nuxt auto-imported composable usage via regex.
 *
 * Nuxt auto-imports: useFetch, useAsyncData, useState, useRoute, useRouter, useRuntimeConfig.
 * ParsedFile.functions captures definitions, not calls — so we scan raw file content
 * with regex instead. Framework-gated to nuxt/nuxt3 only.
 *
 * @param parsedFiles - Parsed files (used for file paths, not function detection)
 * @param framework - Detected framework
 * @returns Map of composable name → file count
 */
function countNuxtComposableUsage(
  parsedFiles: ParsedFile[],
  framework: string | null,
): Map<string, number> {
  const counts = new Map<string, number>();

  if (framework !== 'nuxt' && framework !== 'nuxt3') {
    return counts;
  }

  const nuxtComposables = ['useFetch', 'useAsyncData', 'useState', 'useRoute', 'useRouter', 'useRuntimeConfig'];

  for (const composable of nuxtComposables) {
    // Count files that import this composable (Nuxt may still have explicit imports)
    const fileCount = parsedFiles.filter(f =>
      f.imports.some(imp => imp.names.includes(composable))
    ).length;
    if (fileCount > 0) {
      counts.set(composable, fileCount);
    }
  }

  return counts;
}

/**
 * Confirm data fetching pattern via tree-sitter and Nuxt regex
 *
 * Handles: react-query (useQuery, useMutation), swr (useSWR),
 * apollo (useQuery, useMutation), trpc, nuxt-composables
 */
async function confirmDataFetchingPattern(
  patterns: Partial<Record<string, PatternConfidence | MultiPattern>>,
  parsedFiles: ParsedFile[],
  analysis: DeepTierInput,
): Promise<void> {
  const dfPattern = patterns['dataFetching'];
  if (!dfPattern) return;
  if (isMultiPattern(dfPattern)) return;

  const library = dfPattern.library;
  const componentFiles = parsedFiles.filter(f => isComponentFile(f.file));
  const totalComponentFiles = componentFiles.length;

  // react-query confirmation
  if (library === 'react-query') {
    const hookNames = ['useQuery', 'useMutation', 'useInfiniteQuery', 'useQueryClient'];
    const hookFileCount = countHookImportFiles(parsedFiles, '@tanstack/react-query', hookNames);

    // Also check legacy 'react-query' module (exact match to avoid double-counting @tanstack/react-query)
    const legacyCount = parsedFiles.filter(f =>
      f.imports.some(imp =>
        imp.module === 'react-query' &&
        imp.names.some(n => hookNames.includes(n))
      )
    ).length;
    const totalHookFiles = hookFileCount + legacyCount;

    if (totalHookFiles > 0) {
      const { classification } = classifyDominance(totalHookFiles, totalComponentFiles);
      dfPattern.confidence = Math.min(1.0, dfPattern.confidence + 0.15);
      dfPattern.evidence.push(
        `useQuery imports in ${totalHookFiles}/${totalComponentFiles} component files (${classification})`
      );

      // Check for useMutation too
      const mutationFiles = countHookImportFiles(parsedFiles, '@tanstack/react-query', ['useMutation']);
      if (mutationFiles > 0) {
        dfPattern.confidence = Math.min(1.0, dfPattern.confidence + 0.05);
        dfPattern.evidence.push(`useMutation imports in ${mutationFiles} files`);
      }
    }

    // Check for competing SWR library → MultiPattern
    const swrFiles = countHookImportFiles(parsedFiles, 'swr', ['useSWR']);
    if (swrFiles > 0 && totalComponentFiles > 0) {
      const rqDominance = classifyDominance(totalHookFiles, totalComponentFiles);
      const swrDominance = classifyDominance(swrFiles, totalComponentFiles);

      if (rqDominance.fraction >= DOMINANCE_THRESHOLD_PRESENT && swrDominance.fraction >= DOMINANCE_THRESHOLD_PRESENT) {
        const rqPattern: PatternConfidence = {
          library: 'react-query',
          confidence: dfPattern.confidence,
          evidence: dfPattern.evidence,
          primary: totalHookFiles >= swrFiles,
        };
        const swrPattern: PatternConfidence = {
          library: 'swr',
          confidence: 0.75 + 0.15,
          evidence: [
            'swr in dependencies',
            `useSWR imports in ${swrFiles}/${totalComponentFiles} component files (${swrDominance.classification})`,
          ],
          primary: swrFiles > totalHookFiles,
        };
        const primary = totalHookFiles >= swrFiles ? rqPattern : swrPattern;
        patterns['dataFetching'] = {
          patterns: [rqPattern, swrPattern],
          primary,
          confidence: primary.confidence,
        };
        return;
      }
    }
  }

  // SWR confirmation
  else if (library === 'swr') {
    const hookFileCount = countHookImportFiles(parsedFiles, 'swr', ['useSWR', 'useSWRMutation', 'useSWRInfinite']);

    if (hookFileCount > 0) {
      const { classification } = classifyDominance(hookFileCount, totalComponentFiles);
      dfPattern.confidence = Math.min(1.0, dfPattern.confidence + 0.15);
      dfPattern.evidence.push(
        `useSWR imports in ${hookFileCount}/${totalComponentFiles} component files (${classification})`
      );
    }
  }

  // Nuxt composables confirmation
  else if (library === 'nuxt-composables') {
    const nuxtUsage = countNuxtComposableUsage(parsedFiles, analysis.framework);
    const useFetchCount = nuxtUsage.get('useFetch') || 0;
    const useAsyncDataCount = nuxtUsage.get('useAsyncData') || 0;
    const totalDataFetching = useFetchCount + useAsyncDataCount;

    if (totalDataFetching > 0) {
      const { classification } = classifyDominance(totalDataFetching, totalComponentFiles);
      dfPattern.confidence = Math.min(1.0, dfPattern.confidence + 0.15);
      dfPattern.evidence.push('Nuxt framework detected');
      if (useFetchCount > 0) {
        dfPattern.evidence.push(
          `useFetch calls in ${useFetchCount}/${totalComponentFiles} component files (${classification})`
        );
      }
      if (useAsyncDataCount > 0) {
        dfPattern.evidence.push(`useAsyncData calls in ${useAsyncDataCount} files`);
      }
    }
  }

  // Apollo confirmation
  else if (library === 'apollo') {
    const hookFileCount = countHookImportFiles(parsedFiles, '@apollo/client', ['useQuery', 'useMutation', 'useLazyQuery']);

    if (hookFileCount > 0) {
      const { classification } = classifyDominance(hookFileCount, totalComponentFiles);
      dfPattern.confidence = Math.min(1.0, dfPattern.confidence + 0.15);
      dfPattern.evidence.push(
        `useQuery imports in ${hookFileCount}/${totalComponentFiles} component files (${classification})`
      );
    }
  }
}

/**
 * Confirm state management pattern via hook imports
 */
async function confirmStateManagementPattern(
  patterns: Partial<Record<string, PatternConfidence | MultiPattern>>,
  parsedFiles: ParsedFile[],
  _analysis: DeepTierInput,
): Promise<void> {
  const smPattern = patterns['stateManagement'];
  if (!smPattern) return;
  if (isMultiPattern(smPattern)) return;

  const library = smPattern.library;
  const componentFiles = parsedFiles.filter(f => isComponentFile(f.file));
  const totalComponentFiles = componentFiles.length;

  if (library === 'zustand') {
    const hookFileCount = countHookImportFiles(parsedFiles, 'zustand', ['create', 'useStore']);
    // Also count files importing from user-created stores (zustand pattern: import useXxxStore from './stores/xxx')
    const storeImportFiles = parsedFiles.filter(f =>
      f.imports.some(imp => imp.module.includes('zustand'))
    ).length;
    const totalFiles = Math.max(hookFileCount, storeImportFiles);

    if (totalFiles > 0) {
      const { classification } = classifyDominance(totalFiles, totalComponentFiles);
      smPattern.confidence = Math.min(1.0, smPattern.confidence + 0.15);
      smPattern.evidence.push(
        `zustand imports in ${totalFiles}/${totalComponentFiles} component files (${classification})`
      );
    }
  }

  else if (library === 'jotai') {
    const hookFileCount = countHookImportFiles(parsedFiles, 'jotai', ['useAtom', 'useAtomValue', 'useSetAtom', 'atom']);

    if (hookFileCount > 0) {
      const { classification } = classifyDominance(hookFileCount, totalComponentFiles);
      smPattern.confidence = Math.min(1.0, smPattern.confidence + 0.15);
      smPattern.evidence.push(
        `jotai imports in ${hookFileCount}/${totalComponentFiles} component files (${classification})`
      );
    }
  }

  else if (library === 'recoil') {
    const hookFileCount = countHookImportFiles(parsedFiles, 'recoil', ['useRecoilState', 'useRecoilValue', 'atom', 'selector']);

    if (hookFileCount > 0) {
      const { classification } = classifyDominance(hookFileCount, totalComponentFiles);
      smPattern.confidence = Math.min(1.0, smPattern.confidence + 0.15);
      smPattern.evidence.push(
        `recoil imports in ${hookFileCount}/${totalComponentFiles} component files (${classification})`
      );
    }
  }

  else if (library === 'pinia') {
    const hookFileCount = countHookImportFiles(parsedFiles, 'pinia', ['defineStore', 'storeToRefs']);

    if (hookFileCount > 0) {
      const { classification } = classifyDominance(hookFileCount, totalComponentFiles);
      smPattern.confidence = Math.min(1.0, smPattern.confidence + 0.15);
      smPattern.evidence.push(
        `pinia imports in ${hookFileCount}/${totalComponentFiles} component files (${classification})`
      );
    }
  }

  else if (library === 'redux-toolkit') {
    const hookFileCount = countHookImportFiles(parsedFiles, '@reduxjs/toolkit', ['createSlice', 'configureStore']);
    const reactReduxFiles = countHookImportFiles(parsedFiles, 'react-redux', ['useSelector', 'useDispatch']);
    const totalFiles = Math.max(hookFileCount, reactReduxFiles);

    if (totalFiles > 0) {
      const { classification } = classifyDominance(totalFiles, totalComponentFiles);
      smPattern.confidence = Math.min(1.0, smPattern.confidence + 0.15);
      smPattern.evidence.push(
        `redux imports in ${totalFiles}/${totalComponentFiles} component files (${classification})`
      );
    }
  }

  else if (library === 'vuex') {
    const hookFileCount = countHookImportFiles(parsedFiles, 'vuex', ['useStore', 'mapState', 'mapGetters', 'createStore']);

    if (hookFileCount > 0) {
      const { classification } = classifyDominance(hookFileCount, totalComponentFiles);
      smPattern.confidence = Math.min(1.0, smPattern.confidence + 0.15);
      smPattern.evidence.push(
        `vuex imports in ${hookFileCount}/${totalComponentFiles} component files (${classification})`
      );
    }
  }
}

/**
 * Confirm form handling pattern via hook imports
 */
async function confirmFormHandlingPattern(
  patterns: Partial<Record<string, PatternConfidence | MultiPattern>>,
  parsedFiles: ParsedFile[],
  _analysis: DeepTierInput,
): Promise<void> {
  const fhPattern = patterns['formHandling'];
  if (!fhPattern) return;
  if (isMultiPattern(fhPattern)) return;

  const library = fhPattern.library;
  const componentFiles = parsedFiles.filter(f => isComponentFile(f.file));
  const totalComponentFiles = componentFiles.length;

  if (library === 'react-hook-form') {
    const hookFileCount = countHookImportFiles(parsedFiles, 'react-hook-form', ['useForm', 'useFormContext', 'useController', 'useFieldArray']);

    if (hookFileCount > 0) {
      const { classification } = classifyDominance(hookFileCount, totalComponentFiles);
      fhPattern.confidence = Math.min(1.0, fhPattern.confidence + 0.15);
      fhPattern.evidence.push(
        `useForm imports in ${hookFileCount}/${totalComponentFiles} component files (${classification})`
      );
    }
  }

  else if (library === 'formik') {
    const hookFileCount = countHookImportFiles(parsedFiles, 'formik', ['useFormik', 'Formik', 'Form', 'Field']);

    if (hookFileCount > 0) {
      const { classification } = classifyDominance(hookFileCount, totalComponentFiles);
      fhPattern.confidence = Math.min(1.0, fhPattern.confidence + 0.15);
      fhPattern.evidence.push(
        `formik imports in ${hookFileCount}/${totalComponentFiles} component files (${classification})`
      );
    }
  }

  else if (library === 'vee-validate') {
    const hookFileCount = countHookImportFiles(parsedFiles, 'vee-validate', ['useForm', 'useField', 'defineRule']);

    if (hookFileCount > 0) {
      const { classification } = classifyDominance(hookFileCount, totalComponentFiles);
      fhPattern.confidence = Math.min(1.0, fhPattern.confidence + 0.15);
      fhPattern.evidence.push(
        `vee-validate imports in ${hookFileCount}/${totalComponentFiles} component files (${classification})`
      );
    }
  }
}
