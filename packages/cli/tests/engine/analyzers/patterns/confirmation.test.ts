import { describe, it, expect, beforeAll } from 'vitest';
import { confirmPatternsWithTreeSitter } from '../../../../src/engine/analyzers/patterns/index.js';
import type { AnalysisResult, ParsedFile } from '../../../../src/engine/types/index.js';
import type { PatternConfidence } from '../../../../src/engine/types/patterns.js';
import { isMultiPattern } from '../../../../src/engine/types/patterns.js';
import { ParserManager } from '../../../../src/engine/parsers/treeSitter.js';
import { skipIfNoWasm } from '../../fixtures.js';

const wasmAvailable = await skipIfNoWasm();

// Helper to create mock ParsedFile
function createMockParsedFile(
  file: string,
  language: string,
  imports: Array<{ module: string; names: string[] }> = [],
  classes: Array<{ name: string; superclasses: string[] }> = [],
  functions: Array<{ name: string; async: boolean; decorators: string[] }> = [],
  decorators: Array<{ name: string; arguments: string[]; line: number }> = []
): ParsedFile {
  return {
    file,
    language,
    functions: functions.map(f => ({ ...f, line: 1 })),
    classes: classes.map(c => ({ ...c, line: 1, methods: [], decorators: [] })),
    imports: imports.map(i => ({ ...i, line: 1 })),
    decorators,
    parseTime: 10,
    parseMethod: 'tree-sitter',
    errors: 0,
  };
}

describe.skipIf(!wasmAvailable)('Tree-sitter Pattern Confirmation', () => {
  beforeAll(async () => {
    await ParserManager.getInstance().initialize();
  });

  describe('Validation Pattern Confirmation', () => {
    it('boosts Pydantic confidence when BaseModel imports found', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: 'fastapi',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'app/models.py',
              'python',
              [{ module: 'pydantic', names: ['BaseModel', 'Field'] }],
              [{ name: 'User', superclasses: ['BaseModel'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        validation: {
          library: 'pydantic',
          confidence: 0.75,
          evidence: ['pydantic in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['validation']?.confidence).toBeGreaterThan(0.75);
      expect(confirmed['validation']?.confidence).toBeLessThanOrEqual(1.0);
      expect(confirmed['validation']?.evidence).toContain('Pydantic imports found in code');
      expect(confirmed['validation']?.evidence.some(e => e.includes('Pydantic model(s)'))).toBe(true);
    });

    it('boosts Zod confidence when zod imports found', async () => {

      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'express',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'src/schemas.ts',
              'typescript',
              [{ module: 'zod', names: ['z'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        validation: {
          library: 'zod',
          confidence: 0.75,
          evidence: ['zod in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['validation']?.confidence).toBeGreaterThanOrEqual(0.90);
      expect(confirmed['validation']?.evidence).toContain('Zod imports found in code');
    });

    it('does not boost confidence when imports not found', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile('app/main.py', 'python', [], [], []),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        validation: {
          library: 'pydantic',
          confidence: 0.75,
          evidence: ['pydantic in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      // No boost (imports not found)
      expect(confirmed['validation']?.confidence).toBe(0.75);
      expect(confirmed['validation']?.evidence).toHaveLength(1);  // Only dependency evidence
    });

    it('confirms Joi validation library', async () => {

      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'express',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'src/validation.js',
              'javascript',
              [{ module: 'joi', names: ['Joi'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        validation: {
          library: 'joi',
          confidence: 0.75,
          evidence: ['joi in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['validation']?.confidence).toBeGreaterThanOrEqual(0.90);
      expect(confirmed['validation']?.evidence).toContain('Joi imports found in code');
    });

    it('confirms class-validator via decorators', async () => {

      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'nestjs',
        confidence: { projectType: 0.95, framework: 0.95 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'src/dto/user.dto.ts',
              'typescript',
              [],
              [],
              [],
              [
                { name: 'IsString', arguments: [], line: 5 },
                { name: 'IsEmail', arguments: [], line: 7 },
              ]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        validation: {
          library: 'class-validator',
          confidence: 0.75,
          evidence: ['class-validator in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['validation']?.confidence).toBeGreaterThanOrEqual(0.90);
      expect(confirmed['validation']?.evidence).toContain('Validation decorators found');
    });

    it('confirms DRF serializers', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: 'django',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'api/serializers.py',
              'python',
              [],
              [
                { name: 'UserSerializer', superclasses: ['ModelSerializer'] },
                { name: 'PostSerializer', superclasses: ['Serializer'] },
              ]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        validation: {
          library: 'drf-serializers',
          confidence: 0.80,
          evidence: ['djangorestframework in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['validation']?.confidence).toBeGreaterThanOrEqual(0.95);
      expect(confirmed['validation']?.evidence.some(e => e.includes('DRF Serializer'))).toBe(true);
    });
  });

  describe('Database Pattern Confirmation', () => {
    it('confirms SQLAlchemy async variant and boosts confidence', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: 'fastapi',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'app/database.py',
              'python',
              [{ module: 'sqlalchemy.ext.asyncio', names: ['AsyncSession', 'create_async_engine'] }],
              [],
              [{ name: 'get_db', async: true, decorators: [] }]
            ),
            createMockParsedFile(
              'app/routes/users.py',
              'python',
              [],
              [],
              [{ name: 'get_users', async: true, decorators: ['app.get("/users")'] }]
            ),
          ],
          totalParsed: 2,
          cacheHits: 0,
          cacheMisses: 2,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        database: {
          library: 'sqlalchemy',
          variant: 'async',
          confidence: 0.80,
          evidence: ['sqlalchemy + asyncpg in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['database']?.variant).toBe('async');
      expect(confirmed['database']?.confidence).toBeGreaterThan(0.80);
      expect(confirmed['database']?.evidence).toContain('AsyncSession imports found (async variant confirmed)');
      expect(confirmed['database']?.evidence.some(e => e.includes('async route handler'))).toBe(true);
    });

    it('detects SQLAlchemy sync variant when Session imports found', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: 'flask',
        confidence: { projectType: 0.95, framework: 0.85 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'app/database.py',
              'python',
              [{ module: 'sqlalchemy.orm', names: ['Session', 'sessionmaker'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        database: {
          library: 'sqlalchemy',
          variant: 'sync',
          confidence: 0.80,
          evidence: ['sqlalchemy in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['database']?.variant).toBe('sync');
      expect(confirmed['database']?.evidence).toContain('Session imports found (sync variant confirmed)');
    });

    it('confirms Prisma when PrismaClient imports found', async () => {

      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'nextjs',
        confidence: { projectType: 0.95, framework: 0.95 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'lib/db.ts',
              'typescript',
              [{ module: '@prisma/client', names: ['PrismaClient'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        database: {
          library: 'prisma',
          confidence: 0.80,
          evidence: ['@prisma/client in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['database']?.confidence).toBeGreaterThanOrEqual(0.95);
      expect(confirmed['database']?.evidence).toContain('PrismaClient imports found');
    });

    it('confirms TypeORM', async () => {

      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'nestjs',
        confidence: { projectType: 0.95, framework: 0.95 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'src/entities/user.entity.ts',
              'typescript',
              [{ module: 'typeorm', names: ['Entity', 'Column'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        database: {
          library: 'typeorm',
          confidence: 0.75,
          evidence: ['typeorm in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['database']?.confidence).toBeGreaterThanOrEqual(0.90);
      expect(confirmed['database']?.evidence).toContain('TypeORM imports found');
    });

    it('confirms GORM for Go projects', async () => {

      const analysis: AnalysisResult = {
        projectType: 'go',
        framework: 'gin',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'models/user.go',
              'go',
              [{ module: 'gorm.io/gorm', names: ['Model'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        database: {
          library: 'gorm',
          confidence: 0.85,
          evidence: ['gorm.io/gorm in go.mod'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['database']?.confidence).toBeGreaterThanOrEqual(0.95);
      expect(confirmed['database']?.evidence).toContain('GORM imports found');
    });

    it('confirms Sequelize', async () => {

      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'express',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'models/user.js',
              'javascript',
              [{ module: 'sequelize', names: ['DataTypes', 'Model'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        database: {
          library: 'sequelize',
          confidence: 0.75,
          evidence: ['sequelize in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['database']?.confidence).toBeGreaterThanOrEqual(0.90);
      expect(confirmed['database']?.evidence).toContain('Sequelize imports found');
    });
  });

  describe('Auth Pattern Confirmation', () => {
    it('confirms JWT when imports found', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: 'fastapi',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'app/auth.py',
              'python',
              [
                { module: 'jose', names: ['jwt'] },
                { module: 'fastapi.security', names: ['OAuth2PasswordBearer'] },
              ]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        auth: {
          library: 'oauth2-jwt',
          confidence: 0.75,
          evidence: ['JWT library in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['auth']?.confidence).toBeGreaterThanOrEqual(0.90);
      expect(confirmed['auth']?.evidence).toContain('JWT library imports found in code');
    });

    it('confirms Clerk auth', async () => {

      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'nextjs',
        confidence: { projectType: 0.95, framework: 0.95 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'app/providers.tsx',
              'tsx',
              [{ module: '@clerk/nextjs', names: ['ClerkProvider'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        auth: {
          library: 'clerk',
          confidence: 0.90,
          evidence: ['@clerk/nextjs in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['auth']?.confidence).toBeGreaterThanOrEqual(0.90);
      expect(confirmed['auth']?.evidence).toContain('Auth library imports confirmed');
    });

    it('confirms Passport session auth', async () => {

      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'express',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'src/auth/passport.js',
              'javascript',
              [{ module: 'passport', names: ['use', 'initialize'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        auth: {
          library: 'passport',
          confidence: 0.80,
          evidence: ['passport in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['auth']?.confidence).toBeGreaterThanOrEqual(0.95);
      expect(confirmed['auth']?.evidence).toContain('Session auth imports found');
    });
  });

  describe('Testing Pattern Confirmation', () => {
    it('boosts testing confidence when test directory detected', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: 'fastapi',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        structure: {
          directories: {},
          entryPoints: ['app/main.py'],
          testLocation: 'tests/',
          architecture: 'layered',
          directoryTree: '',
          configFiles: ['pytest.ini'],
          confidence: {
            entryPoints: 1.0,
            testLocation: 1.0,
            architecture: 0.90,
            overall: 0.95,
          },
        },
        parsed: {
          files: [],
          totalParsed: 0,
          cacheHits: 0,
          cacheMisses: 0,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        testing: {
          library: 'pytest',
          confidence: 0.75,
          evidence: ['pytest in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['testing']?.confidence).toBeGreaterThanOrEqual(0.90);
      expect(confirmed['testing']?.evidence).toContain('Test directory detected: tests/');
    });

    it('confirms jest with test imports', async () => {

      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'express',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        structure: {
          directories: {},
          entryPoints: ['src/index.ts'],
          testLocation: '__tests__/',
          architecture: 'layered',
          directoryTree: '',
          configFiles: ['jest.config.js'],
          confidence: {
            entryPoints: 1.0,
            testLocation: 1.0,
            architecture: 0.90,
            overall: 0.95,
          },
        },
        parsed: {
          files: [
            createMockParsedFile(
              '__tests__/user.test.js',
              'javascript',
              [{ module: 'jest', names: ['describe', 'it', 'expect'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        testing: {
          library: 'jest',
          confidence: 0.90,  // Already boosted by config file
          evidence: ['jest in devDependencies', 'jest.config.js found'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['testing']?.confidence).toBeGreaterThanOrEqual(0.95);
      expect(confirmed['testing']?.evidence).toContain('Test directory detected: __tests__/');
      expect(confirmed['testing']?.evidence).toContain('jest imports found');
    });

    it('confirms Go test files', async () => {

      const analysis: AnalysisResult = {
        projectType: 'go',
        framework: 'gin',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        structure: {
          directories: {},
          entryPoints: ['main.go'],
          testLocation: '*_test.go',
          architecture: 'layered',
          directoryTree: '',
          configFiles: [],
          confidence: {
            entryPoints: 1.0,
            testLocation: 1.0,
            architecture: 0.85,
            overall: 0.92,
          },
        },
        parsed: {
          files: [],
          totalParsed: 0,
          cacheHits: 0,
          cacheMisses: 0,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        testing: {
          library: 'go-test',
          confidence: 0.95,
          evidence: ['Go test convention'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['testing']?.confidence).toBe(1.0);
      expect(confirmed['testing']?.evidence.some(e => e.includes('*_test.go'))).toBe(true);
    });
  });

  describe('Error Handling Pattern Confirmation', () => {
    it('boosts confidence when route decorators found', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: 'fastapi',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: Array.from({ length: 12 }, (_, i) =>
            createMockParsedFile(
              `app/routes/route${i}.py`,
              'python',
              [{ module: 'fastapi', names: ['FastAPI'] }],
              [],
              [{ name: `handler${i}`, async: true, decorators: [`app.get("/route${i}")`] }]
            )
          ),
          totalParsed: 12,
          cacheHits: 0,
          cacheMisses: 12,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        errorHandling: {
          library: 'exceptions',
          variant: 'fastapi-httpexception',
          confidence: 0.80,
          evidence: ['FastAPI uses HTTPException for error handling'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['errorHandling']?.confidence).toBeGreaterThan(0.80);
      expect(confirmed['errorHandling']?.evidence.some(e => e.includes('file(s) with error'))).toBe(true);
    });

    it('boosts confidence when HTTPException imports found', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: 'fastapi',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'app/main.py',
              'python',
              [{ module: 'fastapi', names: ['FastAPI', 'HTTPException'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        errorHandling: {
          library: 'exceptions',
          variant: 'fastapi-httpexception',
          confidence: 0.80,
          evidence: ['FastAPI uses HTTPException for error handling'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['errorHandling']?.confidence).toBeGreaterThan(0.80);
      expect(confirmed['errorHandling']?.evidence).toContain('HTTPException imports found');
    });

    it('confirms Go error returns', async () => {

      const analysis: AnalysisResult = {
        projectType: 'go',
        framework: 'gin',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [],
          totalParsed: 0,
          cacheHits: 0,
          cacheMisses: 0,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        errorHandling: {
          library: 'error-returns',
          confidence: 1.0,
          evidence: ['Go uses error return values (language convention)'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['errorHandling']?.confidence).toBe(1.0);
      expect(confirmed['errorHandling']?.evidence).toContain('Go error return convention confirmed');
    });
  });

  describe('Edge Cases', () => {
    it('handles missing parsed data gracefully', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        // No parsed field (skipParsing:true scenario)
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        validation: {
          library: 'pydantic',
          confidence: 0.75,
          evidence: ['pydantic in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      // No boost (no parsed data available)
      expect(confirmed['validation']?.confidence).toBe(0.75);
      expect(confirmed['validation']?.evidence).toHaveLength(1);  // Only dependency evidence
    });

    it('handles empty parsed files array', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [],  // Empty array
          totalParsed: 0,
          cacheHits: 0,
          cacheMisses: 0,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        validation: {
          library: 'zod',
          confidence: 0.75,
          evidence: ['zod in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      // No boost (no files to analyze)
      expect(confirmed['validation']?.confidence).toBe(0.75);
    });

    it('handles patterns with no confirmation function', async () => {

      const analysis: AnalysisResult = {
        projectType: 'rust',  // Supported for detection but not parsing
        framework: 'axum',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [],
          totalParsed: 0,
          cacheHits: 0,
          cacheMisses: 0,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {};

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      // Should not crash, returns empty
      expect(Object.keys(confirmed)).toHaveLength(0);
    });

    it('caps confidence at 1.0', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: 'fastapi',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'app/models.py',
              'python',
              [{ module: 'pydantic', names: ['BaseModel'] }],
              Array.from({ length: 20 }, (_, i) => ({
                name: `Model${i}`,
                superclasses: ['BaseModel']
              }))
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        validation: {
          library: 'pydantic',
          confidence: 0.95,  // Already high
          evidence: ['pydantic in dependencies', 'config file found'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      // Should cap at 1.0, not exceed
      expect(confirmed['validation']?.confidence).toBeLessThanOrEqual(1.0);
    });

    it('preserves patterns not found in parsed data', async () => {

      const analysis: AnalysisResult = {
        projectType: 'python',
        framework: 'fastapi',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'app/main.py',
              'python',
              [{ module: 'fastapi', names: ['FastAPI'] }]  // No pydantic imports
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        validation: {
          library: 'pydantic',
          confidence: 0.75,
          evidence: ['pydantic in dependencies'],
        },
        auth: {
          library: 'oauth2-jwt',
          confidence: 0.75,
          evidence: ['FastAPI OAuth2 patterns expected'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      // Validation not boosted (no imports found)
      expect(confirmed['validation']?.confidence).toBe(0.75);
      // Auth not boosted (no imports found)
      expect(confirmed['auth']?.confidence).toBe(0.75);
      // Both patterns still present
      expect(confirmed['validation']).toBeDefined();
      expect(confirmed['auth']).toBeDefined();
    });
  });

  // @ana A012, A013
  describe('Data Fetching Pattern Confirmation', () => {
    it('boosts dataFetching confidence when useQuery imports found', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'nextjs',
        confidence: { projectType: 0.95, framework: 0.95 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            // 10 component files total, 4 with useQuery → dominant (40%)
            ...Array.from({ length: 4 }, (_, i) =>
              createMockParsedFile(
                `components/Feature${i}.tsx`,
                'typescript',
                [{ module: '@tanstack/react-query', names: ['useQuery'] }]
              )
            ),
            ...Array.from({ length: 6 }, (_, i) =>
              createMockParsedFile(
                `components/Other${i}.tsx`,
                'typescript',
                []
              )
            ),
          ],
          totalParsed: 10,
          cacheHits: 0,
          cacheMisses: 10,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        dataFetching: {
          library: 'react-query',
          confidence: 0.75,
          evidence: ['@tanstack/react-query in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['dataFetching']?.confidence).toBeGreaterThan(0.75);
      expect(confirmed['dataFetching']?.evidence.some(e => e.includes('useQuery imports'))).toBe(true);
      expect(confirmed['dataFetching']?.evidence.some(e => e.includes('dominant'))).toBe(true);
      expect(confirmed['dataFetching']?.evidence.some(e => e.includes('component files'))).toBe(true);
    });

    it('does not boost when no imports found', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile('src/app.tsx', 'typescript', []),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        dataFetching: {
          library: 'react-query',
          confidence: 0.75,
          evidence: ['@tanstack/react-query in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['dataFetching']?.confidence).toBe(0.75);
      expect(confirmed['dataFetching']?.evidence).toHaveLength(1);
    });

    it('boosts SWR confidence when useSWR imports found', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'components/Profile.tsx',
              'typescript',
              [{ module: 'swr', names: ['useSWR'] }]
            ),
            createMockParsedFile('components/Other.tsx', 'typescript', []),
            createMockParsedFile('components/More.tsx', 'typescript', []),
          ],
          totalParsed: 3,
          cacheHits: 0,
          cacheMisses: 3,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        dataFetching: {
          library: 'swr',
          confidence: 0.75,
          evidence: ['swr in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['dataFetching']?.confidence).toBeGreaterThan(0.75);
      expect(confirmed['dataFetching']?.evidence.some(e => e.includes('useSWR imports'))).toBe(true);
    });
  });

  // @ana A018, A021
  describe('Dominance Classification', () => {
    it('classifies dominant usage (>=30%)', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            // 4/10 = 40% → dominant
            ...Array.from({ length: 4 }, (_, i) =>
              createMockParsedFile(
                `components/Feature${i}.tsx`,
                'typescript',
                [{ module: '@tanstack/react-query', names: ['useQuery'] }]
              )
            ),
            ...Array.from({ length: 6 }, (_, i) =>
              createMockParsedFile(
                `components/Other${i}.tsx`,
                'typescript',
                []
              )
            ),
          ],
          totalParsed: 10,
          cacheHits: 0,
          cacheMisses: 10,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        dataFetching: {
          library: 'react-query',
          confidence: 0.75,
          evidence: ['@tanstack/react-query in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);
      const evidence = confirmed['dataFetching']?.evidence.join(' ') || '';

      expect(evidence).toContain('dominant');
      expect(evidence).toContain('component files');
    });

    // @ana A019
    it('classifies present usage (10-30%)', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            // 2/10 = 20% → present
            ...Array.from({ length: 2 }, (_, i) =>
              createMockParsedFile(
                `components/Feature${i}.tsx`,
                'typescript',
                [{ module: '@tanstack/react-query', names: ['useQuery'] }]
              )
            ),
            ...Array.from({ length: 8 }, (_, i) =>
              createMockParsedFile(
                `components/Other${i}.tsx`,
                'typescript',
                []
              )
            ),
          ],
          totalParsed: 10,
          cacheHits: 0,
          cacheMisses: 10,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        dataFetching: {
          library: 'react-query',
          confidence: 0.75,
          evidence: ['@tanstack/react-query in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);
      const evidence = confirmed['dataFetching']?.evidence.join(' ') || '';

      expect(evidence).toContain('present');
    });

    // @ana A020
    it('classifies incidental usage (<10%)', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            // 1/20 = 5% → incidental
            createMockParsedFile(
              'components/Feature0.tsx',
              'typescript',
              [{ module: '@tanstack/react-query', names: ['useQuery'] }]
            ),
            ...Array.from({ length: 19 }, (_, i) =>
              createMockParsedFile(
                `components/Other${i}.tsx`,
                'typescript',
                []
              )
            ),
          ],
          totalParsed: 20,
          cacheHits: 0,
          cacheMisses: 20,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        dataFetching: {
          library: 'react-query',
          confidence: 0.75,
          evidence: ['@tanstack/react-query in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);
      const evidence = confirmed['dataFetching']?.evidence.join(' ') || '';

      expect(evidence).toContain('incidental');
    });
  });

  // @ana A022, A023
  describe('MultiPattern Detection', () => {
    it('creates MultiPattern when react-query and swr both >=10%', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            // 4 react-query files (40%)
            ...Array.from({ length: 4 }, (_, i) =>
              createMockParsedFile(
                `components/RQ${i}.tsx`,
                'typescript',
                [{ module: '@tanstack/react-query', names: ['useQuery'] }]
              )
            ),
            // 2 swr files (20%)
            ...Array.from({ length: 2 }, (_, i) =>
              createMockParsedFile(
                `components/SWR${i}.tsx`,
                'typescript',
                [{ module: 'swr', names: ['useSWR'] }]
              )
            ),
            // 4 plain component files
            ...Array.from({ length: 4 }, (_, i) =>
              createMockParsedFile(
                `components/Plain${i}.tsx`,
                'typescript',
                []
              )
            ),
          ],
          totalParsed: 10,
          cacheHits: 0,
          cacheMisses: 10,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        dataFetching: {
          library: 'react-query',
          confidence: 0.75,
          evidence: ['@tanstack/react-query in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);
      const df = confirmed['dataFetching'];

      // Should be a MultiPattern
      expect(df).toBeDefined();
      expect(isMultiPattern(df)).toBe(true);
      if (!isMultiPattern(df)) throw new Error('expected MultiPattern');
      expect(df.patterns.length).toBe(2);
      expect(df.primary.library).toBeDefined();
      expect(df.primary.library).toBe('react-query'); // more files → primary
    });

    // @ana A024
    it('returns PatternConfidence when only one library >=10%', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            // 3 react-query files (30%)
            ...Array.from({ length: 3 }, (_, i) =>
              createMockParsedFile(
                `components/Feature${i}.tsx`,
                'typescript',
                [{ module: '@tanstack/react-query', names: ['useQuery'] }]
              )
            ),
            ...Array.from({ length: 7 }, (_, i) =>
              createMockParsedFile(
                `components/Other${i}.tsx`,
                'typescript',
                []
              )
            ),
          ],
          totalParsed: 10,
          cacheHits: 0,
          cacheMisses: 10,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        dataFetching: {
          library: 'react-query',
          confidence: 0.75,
          evidence: ['@tanstack/react-query in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);
      const df = confirmed['dataFetching'];

      // Should NOT be a MultiPattern
      expect(df).toBeDefined();
      expect(isMultiPattern(df)).toBe(false);
    });
  });

  // @ana A014
  describe('State Management Pattern Confirmation', () => {
    it('boosts stateManagement confidence when zustand imports found', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'components/Counter.tsx',
              'typescript',
              [{ module: 'zustand', names: ['create'] }]
            ),
            ...Array.from({ length: 4 }, (_, i) =>
              createMockParsedFile(
                `components/Other${i}.tsx`,
                'typescript',
                []
              )
            ),
          ],
          totalParsed: 5,
          cacheHits: 0,
          cacheMisses: 5,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        stateManagement: {
          library: 'zustand',
          confidence: 0.75,
          evidence: ['zustand in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['stateManagement']?.confidence).toBeGreaterThan(0.75);
      expect(confirmed['stateManagement']?.evidence.some(e => e.includes('zustand imports'))).toBe(true);
    });

    it('boosts redux-toolkit confidence when imports found', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'components/App.tsx',
              'typescript',
              [{ module: 'react-redux', names: ['useSelector', 'useDispatch'] }]
            ),
            ...Array.from({ length: 2 }, (_, i) =>
              createMockParsedFile(`components/O${i}.tsx`, 'typescript', [])
            ),
          ],
          totalParsed: 3,
          cacheHits: 0,
          cacheMisses: 3,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        stateManagement: {
          library: 'redux-toolkit',
          confidence: 0.75,
          evidence: ['@reduxjs/toolkit in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['stateManagement']?.confidence).toBeGreaterThan(0.75);
      expect(confirmed['stateManagement']?.evidence.some(e => e.includes('redux imports'))).toBe(true);
    });

    it('boosts pinia confidence when defineStore imports found', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'nuxt',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'stores/counter.ts',
              'typescript',
              [{ module: 'pinia', names: ['defineStore'] }]
            ),
            ...Array.from({ length: 5 }, (_, i) =>
              createMockParsedFile(`pages/page${i}.vue`, 'vue', [])
            ),
          ],
          totalParsed: 6,
          cacheHits: 0,
          cacheMisses: 6,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        stateManagement: {
          library: 'pinia',
          confidence: 0.75,
          evidence: ['pinia in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['stateManagement']?.confidence).toBeGreaterThan(0.75);
      expect(confirmed['stateManagement']?.evidence.some(e => e.includes('pinia imports'))).toBe(true);
    });
  });

  // @ana A015
  describe('Form Handling Pattern Confirmation', () => {
    it('boosts formHandling confidence when useForm imports found', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'components/ContactForm.tsx',
              'typescript',
              [{ module: 'react-hook-form', names: ['useForm'] }]
            ),
            createMockParsedFile(
              'components/SignupForm.tsx',
              'typescript',
              [{ module: 'react-hook-form', names: ['useForm', 'useFormContext'] }]
            ),
            ...Array.from({ length: 3 }, (_, i) =>
              createMockParsedFile(`components/Other${i}.tsx`, 'typescript', [])
            ),
          ],
          totalParsed: 5,
          cacheHits: 0,
          cacheMisses: 5,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        formHandling: {
          library: 'react-hook-form',
          confidence: 0.75,
          evidence: ['react-hook-form in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['formHandling']?.confidence).toBeGreaterThan(0.75);
      expect(confirmed['formHandling']?.evidence.some(e => e.includes('useForm imports'))).toBe(true);
    });

    it('boosts formik confidence when useFormik imports found', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'components/Form.tsx',
              'typescript',
              [{ module: 'formik', names: ['useFormik', 'Formik'] }]
            ),
            ...Array.from({ length: 4 }, (_, i) =>
              createMockParsedFile(`components/Other${i}.tsx`, 'typescript', [])
            ),
          ],
          totalParsed: 5,
          cacheHits: 0,
          cacheMisses: 5,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        formHandling: {
          library: 'formik',
          confidence: 0.75,
          evidence: ['formik in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['formHandling']?.confidence).toBeGreaterThan(0.75);
      expect(confirmed['formHandling']?.evidence.some(e => e.includes('formik imports'))).toBe(true);
    });
  });

  // @ana A016
  describe('Nuxt Auto-Import Detection', () => {
    it('detects Nuxt useFetch via imports when framework is nuxt', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'nuxt',
        confidence: { projectType: 0.95, framework: 0.90 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            // Nuxt may still have explicit imports for some composables
            createMockParsedFile(
              'pages/index.vue',
              'vue',
              [{ module: '#imports', names: ['useFetch'] }]
            ),
            createMockParsedFile(
              'pages/about.vue',
              'vue',
              [{ module: '#imports', names: ['useFetch', 'useAsyncData'] }]
            ),
            ...Array.from({ length: 3 }, (_, i) =>
              createMockParsedFile(`pages/page${i}.vue`, 'vue', [])
            ),
          ],
          totalParsed: 5,
          cacheHits: 0,
          cacheMisses: 5,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        dataFetching: {
          library: 'nuxt-composables',
          confidence: 0.75,
          evidence: ['@nuxtjs/composition-api in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      expect(confirmed['dataFetching']?.confidence).toBeGreaterThan(0.75);
      expect(confirmed['dataFetching']?.evidence.some(e => e.includes('Nuxt framework detected'))).toBe(true);
      expect(confirmed['dataFetching']?.evidence.some(e => e.includes('useFetch'))).toBe(true);
    });

    // @ana A017
    it('does not detect useFetch regex in non-Nuxt project', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: 'nextjs',
        confidence: { projectType: 0.95, framework: 0.95 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            // A file that happens to import something called useFetch
            createMockParsedFile(
              'components/Fetch.tsx',
              'typescript',
              [{ module: './hooks', names: ['useFetch'] }]
            ),
          ],
          totalParsed: 1,
          cacheHits: 0,
          cacheMisses: 1,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        dataFetching: {
          library: 'nuxt-composables',
          confidence: 0.75,
          evidence: ['@nuxtjs/composition-api in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      // nuxt-composables confirmation is gated on framework=nuxt
      // Since framework is nextjs, no boost should happen
      expect(confirmed['dataFetching']?.confidence).toBe(0.75);
      expect(confirmed['dataFetching']?.evidence).toHaveLength(1);
    });
  });

  // @ana A034
  describe('Stage 3 dominance classification tests', () => {
    it('evidence includes raw file counts for all classifications', async () => {
      const analysis: AnalysisResult = {
        projectType: 'node',
        framework: null,
        confidence: { projectType: 0.95, framework: 0.0 },
        indicators: { projectType: [], framework: [] },
        detectedAt: new Date().toISOString(),
        version: '1.0.0',
        parsed: {
          files: [
            createMockParsedFile(
              'components/Form.tsx',
              'typescript',
              [{ module: 'react-hook-form', names: ['useForm'] }]
            ),
            createMockParsedFile(
              'components/Store.tsx',
              'typescript',
              [{ module: 'zustand', names: ['create'] }]
            ),
            ...Array.from({ length: 3 }, (_, i) =>
              createMockParsedFile(`components/Other${i}.tsx`, 'typescript', [])
            ),
          ],
          totalParsed: 5,
          cacheHits: 0,
          cacheMisses: 5,
        },
      };

      const initialPatterns: Partial<Record<string, PatternConfidence>> = {
        formHandling: {
          library: 'react-hook-form',
          confidence: 0.75,
          evidence: ['react-hook-form in dependencies'],
        },
        stateManagement: {
          library: 'zustand',
          confidence: 0.75,
          evidence: ['zustand in dependencies'],
        },
      };

      const confirmed = await confirmPatternsWithTreeSitter('', initialPatterns, analysis);

      // Both should include component file counts
      const fhEvidence = confirmed['formHandling']?.evidence.join(' ') || '';
      const smEvidence = confirmed['stateManagement']?.evidence.join(' ') || '';

      expect(fhEvidence).toContain('component files');
      expect(smEvidence).toContain('component files');
    });
  });
});
