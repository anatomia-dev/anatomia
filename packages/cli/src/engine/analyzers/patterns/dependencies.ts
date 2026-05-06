/**
 * Pattern detection from package manifests.
 *
 * Stage 1 of pattern inference: fast dependency-based detection.
 * Reads package.json / requirements.txt / go.mod and returns PatternConfidence
 * objects with 0.75-0.85 baseline confidence. Stage 3 (confirmation.ts) boosts
 * these via tree-sitter AST inspection.
 *
 * All 5 detect* helpers are private (only used by detectFromDependencies,
 * which is the public entry point). The module is deliberately flat — each
 * detector is independent and adding a new category means adding one helper
 * + one call in detectFromDependencies.
 */

import { exists, joinPath } from '../../utils/file.js';
import type { ProjectType } from '../../types/index.js';
import type { PatternConfidence } from '../../types/patterns.js';
import type { SchemaFileEntry } from '../../types/census.js';

/**
 * Detect patterns from pre-read dependency lists.
 *
 * @param deps - Package names (production dependencies)
 * @param devDeps - Package names (dev dependencies)
 * @param projectType - Language/platform type
 * @param framework - Detected framework (for error handling patterns)
 * @param rootPath - Project root (still needed for config file existence checks)
 * @param schemaFiles - Census schema entries (replaces rootPath schema.prisma check)
 */
export async function detectFromDependencies(
  deps: string[],
  devDeps: string[],
  projectType: ProjectType,
  framework: string | null,
  rootPath: string,
  schemaFiles: SchemaFileEntry[] = []
): Promise<Partial<Record<string, PatternConfidence>>> {
  const patterns: Partial<Record<string, PatternConfidence>> = {};

  // Detect validation patterns
  const validation = detectValidationPattern(deps, framework);
  if (validation) patterns['validation'] = validation;

  // Detect database patterns
  const database = detectDatabasePattern(deps, framework, schemaFiles);
  if (database) patterns['database'] = database;

  // Detect auth patterns
  const auth = detectAuthPattern(deps, framework);
  if (auth) patterns['auth'] = auth;

  // Detect testing patterns (rootPath still needed for config file checks)
  const testing = await detectTestingPattern(deps, devDeps, framework, rootPath);
  if (testing) patterns['testing'] = testing;

  // Detect error handling patterns (framework-specific)
  const errorHandling = detectErrorHandlingPattern(deps, projectType, framework);
  if (errorHandling) patterns['errorHandling'] = errorHandling;

  // Detect deep-tier hook/composable patterns
  const dataFetching = detectDataFetchingPattern(deps);
  if (dataFetching) patterns['dataFetching'] = dataFetching;

  const stateManagement = detectStateManagementPattern(deps);
  if (stateManagement) patterns['stateManagement'] = stateManagement;

  const formHandling = detectFormHandlingPattern(deps);
  if (formHandling) patterns['formHandling'] = formHandling;

  return patterns;
}

/**
 * Detect validation pattern from dependencies
 *
 * Checks for: pydantic, zod, joi, class-validator, djangorestframework, go-playground/validator
 */
function detectValidationPattern(
  deps: string[],
  _framework: string | null,
): PatternConfidence | null {
  // Python validation libraries
  if (deps.includes('pydantic')) {
    return {
      library: 'pydantic',
      confidence: 0.75,  // Dependency only (tree-sitter confirmation boosts to 0.90-0.95)
      evidence: ['pydantic in dependencies'],
    };
  }

  // TypeScript/JavaScript validation libraries
  if (deps.includes('zod')) {
    return {
      library: 'zod',
      confidence: 0.75,
      evidence: ['zod in dependencies'],
    };
  }

  if (deps.includes('joi')) {
    return {
      library: 'joi',
      confidence: 0.75,
      evidence: ['joi in dependencies'],
    };
  }

  if (deps.includes('class-validator')) {
    return {
      library: 'class-validator',
      confidence: 0.75,
      evidence: ['class-validator in dependencies'],
    };
  }

  // Django REST Framework serializers
  if (deps.includes('djangorestframework')) {
    return {
      library: 'drf-serializers',
      confidence: 0.80,  // Slightly higher - DRF is definitive
      evidence: ['djangorestframework in dependencies'],
    };
  }

  // Go playground validator
  if (deps.some(d => d.includes('github.com/go-playground/validator'))) {
    return {
      library: 'go-playground-validator',
      confidence: 0.80,
      evidence: ['go-playground/validator in go.mod'],
    };
  }

  // Yup (JavaScript/TypeScript)
  if (deps.includes('yup')) {
    return {
      library: 'yup',
      confidence: 0.75,
      evidence: ['yup in dependencies'],
    };
  }

  if (deps.includes('ajv')) {
    return {
      library: 'ajv',
      confidence: 0.75,
      evidence: ['ajv in dependencies'],
    };
  }

  if (deps.includes('validator')) {
    return {
      library: 'validator',
      confidence: 0.70,
      evidence: ['validator in dependencies'],
    };
  }

  if (deps.includes('superstruct')) {
    return {
      library: 'superstruct',
      confidence: 0.75,
      evidence: ['superstruct in dependencies'],
    };
  }

  if (deps.includes('valibot')) {
    return {
      library: 'valibot',
      confidence: 0.75,
      evidence: ['valibot in dependencies'],
    };
  }

  return null;  // No validation library detected
}

/**
 * Detect database pattern from dependencies
 *
 * Checks for: sqlalchemy, prisma, typeorm, gorm, sqlc, sequelize, drizzle-orm
 * Detects variants: SQLAlchemy async vs sync based on async drivers
 */
function detectDatabasePattern(
  deps: string[],
  framework: string | null,
  schemaFiles: SchemaFileEntry[],
): PatternConfidence | null {
  // Python database libraries
  if (deps.includes('sqlalchemy')) {
    // Detect async variant by checking for async drivers
    const hasAsyncDrivers = deps.some(d =>
      d.includes('asyncpg') ||     // PostgreSQL async
      d.includes('aiomysql') ||    // MySQL async
      d.includes('aiosqlite')      // SQLite async
    );

    // Companion package boost (+0.05)
    const baseConfidence = 0.80;
    const companionBoost = hasAsyncDrivers ? 0.05 : 0;
    const confidence = baseConfidence + companionBoost;

    return {
      library: 'sqlalchemy',
      variant: hasAsyncDrivers ? 'async' : 'sync',
      confidence,  // 0.85 with companions, 0.80 without
      evidence: hasAsyncDrivers
        ? ['sqlalchemy in dependencies', 'async driver detected (asyncpg/aiomysql/aiosqlite)', 'companion package boost +0.05']
        : ['sqlalchemy in dependencies'],
    };
  }

  // TypeScript/JavaScript database libraries
  if (deps.includes('@prisma/client') || deps.includes('prisma')) {
    // Check for schema.prisma via census (replaces rootPath filesystem check)
    const hasPrismaSchema = schemaFiles.some(s => s.orm === 'prisma');

    return {
      library: 'prisma',
      confidence: hasPrismaSchema ? 0.95 : 0.80,  // Schema file boosts confidence
      evidence: hasPrismaSchema
        ? ['@prisma/client in dependencies', 'schema.prisma file found']
        : ['@prisma/client in dependencies'],
    };
  }

  if (deps.includes('typeorm')) {
    return {
      library: 'typeorm',
      confidence: 0.75,
      evidence: ['typeorm in dependencies'],
    };
  }

  if (deps.includes('sequelize')) {
    return {
      library: 'sequelize',
      confidence: 0.75,
      evidence: ['sequelize in dependencies'],
    };
  }

  if (deps.includes('drizzle-orm')) {
    return {
      library: 'drizzle',
      confidence: 0.75,
      evidence: ['drizzle-orm in dependencies'],
    };
  }

  // Go database libraries
  if (deps.some(d => d.includes('gorm.io/gorm'))) {
    return {
      library: 'gorm',
      confidence: 0.85,  // GORM is dominant in Go
      evidence: ['gorm.io/gorm in go.mod'],
    };
  }

  if (deps.some(d => d.includes('sqlc'))) {
    return {
      library: 'sqlc',
      confidence: 0.85,
      evidence: ['sqlc in dependencies'],
    };
  }

  // Django ORM (built-in to Django)
  if (framework === 'django') {
    return {
      library: 'django-orm',
      confidence: 1.0,  // Django always has ORM
      evidence: ['Django framework detected (built-in ORM)'],
    };
  }

  return null;  // No database library detected
}

/**
 * Detect auth pattern from dependencies
 *
 * Checks for: JWT libraries, OAuth, session management, third-party (Clerk, NextAuth)
 */
function detectAuthPattern(
  deps: string[],
  framework: string | null,
): PatternConfidence | null {
  // JWT detection (cross-language)
  const jwtLibraries = [
    'pyjwt',                  // Python
    'python-jose',            // Python (FastAPI common)
    'jsonwebtoken',           // Node.js
    'jose',                   // Node.js (modern)
    'github.com/golang-jwt/jwt', // Go
  ];

  const jwtLib = jwtLibraries.find(lib => deps.some(d => d.includes(lib)));
  if (jwtLib) {
    return {
      library: 'jwt',
      confidence: 0.75,
      evidence: ['JWT library in dependencies'],
    };
  }

  // FastAPI OAuth2
  if (framework === 'fastapi' && deps.includes('fastapi')) {
    // OAuth2PasswordBearer is built into FastAPI (confirmed via import analysis)
    return {
      library: 'oauth2-jwt',
      confidence: 0.75,  // Will boost to 0.90+ if OAuth2PasswordBearer imports found
      evidence: ['FastAPI OAuth2 patterns expected'],
    };
  }

  // Express/Node session management
  if (deps.includes('express-session')) {
    return {
      library: 'express-session',
      confidence: 0.80,
      evidence: ['express-session in dependencies'],
    };
  }

  // Passport.js (Node.js)
  if (deps.includes('passport')) {
    return {
      library: 'passport',
      confidence: 0.80,
      evidence: ['passport in dependencies'],
    };
  }

  // Third-party auth providers
  if (deps.includes('@clerk/nextjs')) {
    return {
      library: 'clerk',
      confidence: 0.90,  // Higher - Clerk is definitive
      evidence: ['@clerk/nextjs in dependencies'],
    };
  }

  if (deps.includes('next-auth')) {
    return {
      library: 'next-auth',
      confidence: 0.90,
      evidence: ['next-auth in dependencies'],
    };
  }

  if (deps.includes('auth0')) {
    return {
      library: 'auth0',
      confidence: 0.90,
      evidence: ['auth0 in dependencies'],
    };
  }

  // Django auth (built-in)
  if (framework === 'django') {
    return {
      library: 'django-auth',
      confidence: 0.85,
      evidence: ['Django framework detected (built-in auth)'],
    };
  }

  return null;  // No auth library detected
}

/**
 * Detect testing pattern from dependencies
 *
 * Checks for: pytest, jest, vitest, mocha, go test (file pattern)
 * @param deps
 * @param devDeps
 * @param framework
 * @param rootPath
 */
async function detectTestingPattern(
  deps: string[],
  devDeps: string[],
  framework: string | null,
  rootPath: string
): Promise<PatternConfidence | null> {
  const allDeps = [...deps, ...devDeps];  // Combine dependencies and devDependencies

  // Python testing
  if (allDeps.includes('pytest')) {
    // Check for pytest config files
    const hasPytestIni = await exists(joinPath(rootPath, 'pytest.ini'));
    const hasPyprojectToml = await exists(joinPath(rootPath, 'pyproject.toml'));
    const hasConfig = hasPytestIni || hasPyprojectToml;

    return {
      library: 'pytest',
      confidence: hasConfig ? 0.90 : 0.75,  // Config file boosts confidence
      evidence: hasConfig
        ? ['pytest in dependencies', `config file found (${hasPytestIni ? 'pytest.ini' : 'pyproject.toml'})`]
        : ['pytest in dependencies'],
    };
  }

  if (allDeps.includes('unittest')) {
    return {
      library: 'unittest',
      confidence: 0.75,
      evidence: ['unittest in dependencies'],
    };
  }

  // Node.js testing
  if (allDeps.includes('jest')) {
    // Check for jest config
    const hasJestConfig = await exists(joinPath(rootPath, 'jest.config.js')) ||
                          await exists(joinPath(rootPath, 'jest.config.ts')) ||
                          await exists(joinPath(rootPath, 'jest.config.json'));

    const inDevDeps = devDeps.includes('jest');

    return {
      library: 'jest',
      confidence: hasJestConfig ? 0.90 : 0.75,
      evidence: [
        inDevDeps ? 'jest in devDependencies' : 'jest in dependencies',
        ...(hasJestConfig ? ['jest.config.js found'] : [])
      ],
    };
  }

  if (allDeps.includes('vitest')) {
    // Check for vitest config
    const hasVitestConfig = await exists(joinPath(rootPath, 'vitest.config.ts')) ||
                            await exists(joinPath(rootPath, 'vitest.config.js'));

    const inDevDeps = devDeps.includes('vitest');

    return {
      library: 'vitest',
      confidence: hasVitestConfig ? 0.90 : 0.75,
      evidence: [
        inDevDeps ? 'vitest in devDependencies' : 'vitest in dependencies',
        ...(hasVitestConfig ? ['vitest.config.ts found'] : [])
      ],
    };
  }

  if (allDeps.includes('mocha')) {
    return {
      library: 'mocha',
      confidence: 0.75,
      evidence: [devDeps.includes('mocha') ? 'mocha in devDependencies' : 'mocha in dependencies'],
    };
  }

  // Go testing (built-in — detected via *_test.go file pattern)
  // Return null — detected via file patterns in the confirmation stage

  return null;  // No testing framework detected in dependencies
}

/**
 * Detect error handling pattern from dependencies + framework
 *
 * Mostly framework-specific (FastAPI → HTTPException, Go → error returns)
 * Only detects when we have dependencies or framework information
 */
function detectErrorHandlingPattern(
  deps: string[],
  projectType: ProjectType,
  framework: string | null,
): PatternConfidence | null {
  // Python exception-based error handling (framework-specific)
  if (framework === 'fastapi') {
    return {
      library: 'exceptions',
      variant: 'fastapi-httpexception',
      confidence: 0.80,  // Boosts to 0.95 if HTTPException imports found in confirmation stage
      evidence: ['FastAPI uses HTTPException for error handling'],
    };
  }

  if (framework === 'django') {
    return {
      library: 'exceptions',
      variant: 'django-apiexception',
      confidence: 0.80,
      evidence: ['Django/DRF uses APIException for error handling'],
    };
  }

  // Node.js exception-based error handling (framework-specific)
  if (framework === 'express' || framework === 'nestjs' || framework === 'nextjs') {
    return {
      library: 'exceptions',
      variant: framework,
      confidence: 0.80,
      evidence: [`${framework} uses try/catch error handling`],
    };
  }

  // Go error return values (language convention - always present when deps found)
  if (projectType === 'go' && deps.length > 0) {
    return {
      library: 'error-returns',
      confidence: 1.0,  // Go convention, always present
      evidence: ['Go uses error return values (language convention)'],
    };
  }

  // Generic exception-based (Python/JavaScript/TypeScript without framework)
  // Only detect if we have dependencies (means we can read dependency files)
  if ((projectType === 'python' || projectType === 'node') && deps.length > 0 && !framework) {
    return {
      library: 'exceptions',
      variant: 'generic',
      confidence: 0.75,
      evidence: [`${projectType} uses exception-based error handling`],
    };
  }

  return null;  // No error handling pattern detected
}

/**
 * Detect data fetching pattern from dependencies
 *
 * Checks for: @tanstack/react-query, swr, @nuxtjs/composition-api, apollo-client
 */
function detectDataFetchingPattern(
  deps: string[],
): PatternConfidence | null {
  if (deps.includes('@tanstack/react-query') || deps.includes('react-query')) {
    return {
      library: 'react-query',
      confidence: 0.75,
      evidence: ['@tanstack/react-query in dependencies'],
    };
  }

  if (deps.includes('swr')) {
    return {
      library: 'swr',
      confidence: 0.75,
      evidence: ['swr in dependencies'],
    };
  }

  if (deps.includes('@nuxtjs/composition-api')) {
    return {
      library: 'nuxt-composables',
      confidence: 0.75,
      evidence: ['@nuxtjs/composition-api in dependencies'],
    };
  }

  if (deps.includes('@apollo/client') || deps.includes('apollo-client')) {
    return {
      library: 'apollo',
      confidence: 0.75,
      evidence: ['apollo-client in dependencies'],
    };
  }

  if (deps.includes('@trpc/client') || deps.includes('@trpc/react-query')) {
    return {
      library: 'trpc',
      confidence: 0.75,
      evidence: ['trpc in dependencies'],
    };
  }

  return null;
}

/**
 * Detect state management pattern from dependencies
 *
 * Checks for: zustand, jotai, recoil, pinia, @pinia/nuxt, @reduxjs/toolkit, vuex, mobx
 */
function detectStateManagementPattern(
  deps: string[],
): PatternConfidence | null {
  if (deps.includes('zustand')) {
    return {
      library: 'zustand',
      confidence: 0.75,
      evidence: ['zustand in dependencies'],
    };
  }

  if (deps.includes('jotai')) {
    return {
      library: 'jotai',
      confidence: 0.75,
      evidence: ['jotai in dependencies'],
    };
  }

  if (deps.includes('recoil')) {
    return {
      library: 'recoil',
      confidence: 0.75,
      evidence: ['recoil in dependencies'],
    };
  }

  if (deps.includes('pinia') || deps.includes('@pinia/nuxt')) {
    return {
      library: 'pinia',
      confidence: 0.75,
      evidence: ['pinia in dependencies'],
    };
  }

  if (deps.includes('@reduxjs/toolkit')) {
    return {
      library: 'redux-toolkit',
      confidence: 0.75,
      evidence: ['@reduxjs/toolkit in dependencies'],
    };
  }

  if (deps.includes('vuex')) {
    return {
      library: 'vuex',
      confidence: 0.75,
      evidence: ['vuex in dependencies'],
    };
  }

  if (deps.includes('mobx') || deps.includes('mobx-react') || deps.includes('mobx-react-lite')) {
    return {
      library: 'mobx',
      confidence: 0.75,
      evidence: ['mobx in dependencies'],
    };
  }

  return null;
}

/**
 * Detect form handling pattern from dependencies
 *
 * Checks for: react-hook-form, formik, vee-validate
 */
function detectFormHandlingPattern(
  deps: string[],
): PatternConfidence | null {
  if (deps.includes('react-hook-form')) {
    return {
      library: 'react-hook-form',
      confidence: 0.75,
      evidence: ['react-hook-form in dependencies'],
    };
  }

  if (deps.includes('formik')) {
    return {
      library: 'formik',
      confidence: 0.75,
      evidence: ['formik in dependencies'],
    };
  }

  if (deps.includes('vee-validate')) {
    return {
      library: 'vee-validate',
      confidence: 0.75,
      evidence: ['vee-validate in dependencies'],
    };
  }

  return null;
}
