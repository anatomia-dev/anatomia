import { describe, it, expect } from 'vitest';
import type { ImportInfo } from '../../../src/engine/types/parsed.js';
import {
  classifyPythonImport,
  classifyTSImport,
  classifyGoImport,
  analyzeImportConvention,
} from '../../../src/engine/analyzers/conventions/imports.js';

describe('classifyPythonImport', () => {
  it('detects relative imports', () => {
    expect(classifyPythonImport('.models', null)).toBe('relative');
    expect(classifyPythonImport('..utils', null)).toBe('relative');
    expect(classifyPythonImport('...package', null)).toBe('relative');
  });

  it('detects absolute imports', () => {
    expect(classifyPythonImport('src.models', null)).toBe('absolute');
    expect(classifyPythonImport('src.utils.helper', null)).toBe('absolute');
    expect(classifyPythonImport('myproject.utils', 'myproject')).toBe('absolute');
  });

  it('detects external imports', () => {
    expect(classifyPythonImport('fastapi', null)).toBe('external');
    expect(classifyPythonImport('pydantic', null)).toBe('external');
    expect(classifyPythonImport('sqlalchemy', null)).toBe('external');
  });

  it('normalizes project name (hyphens to underscores)', () => {
    expect(classifyPythonImport('my_project.utils', 'my-project')).toBe('absolute');
    expect(classifyPythonImport('api_service.models', 'api-service')).toBe('absolute');
  });
});

describe('classifyTSImport', () => {
  it('detects relative imports', () => {
    expect(classifyTSImport('../models/user', [])).toBe('relative');
    expect(classifyTSImport('./utils/helper', [])).toBe('relative');
    expect(classifyTSImport('../../shared/types', [])).toBe('relative');
  });

  it('detects absolute imports with @/ alias', () => {
    expect(classifyTSImport('@/models/user', ['@/*'])).toBe('absolute');
    expect(classifyTSImport('@/utils', ['@/*'])).toBe('absolute');
  });

  it('detects absolute imports with src/', () => {
    expect(classifyTSImport('src/models/user', [])).toBe('absolute');
    expect(classifyTSImport('src/utils', [])).toBe('absolute');
  });

  it('detects external imports (node_modules)', () => {
    expect(classifyTSImport('express', [])).toBe('external');
    expect(classifyTSImport('zod', [])).toBe('external');
    expect(classifyTSImport('react', [])).toBe('external');
  });

  it('distinguishes scoped packages from internal aliases', () => {
    expect(classifyTSImport('@nestjs/common', ['@/*'])).toBe('external');  // Scoped package
    expect(classifyTSImport('@types/node', ['@/*'])).toBe('external');  // Scoped package
    expect(classifyTSImport('@/models', ['@/*'])).toBe('absolute');  // Internal alias
  });
});

describe('classifyGoImport', () => {
  it('detects internal imports', () => {
    expect(classifyGoImport('github.com/user/project/pkg/models', 'github.com/user/project')).toBe('internal');
    expect(classifyGoImport('github.com/user/project/internal/db', 'github.com/user/project')).toBe('internal');
  });

  it('detects external imports', () => {
    expect(classifyGoImport('fmt', 'github.com/user/project')).toBe('external');
    expect(classifyGoImport('github.com/gin-gonic/gin', 'github.com/user/project')).toBe('external');
  });

  it('handles module with version suffix', () => {
    expect(classifyGoImport('github.com/user/project/v2/pkg', 'github.com/user/project/v2')).toBe('internal');
  });

  it('handles missing module path', () => {
    expect(classifyGoImport('github.com/user/project/pkg', null)).toBe('external');
  });
});

describe('analyzeImportConvention', () => {
  it('detects absolute majority (83%)', () => {
    const imports: ImportInfo[] = [
      { module: 'src.models', names: [], line: 1 },
      { module: 'src.utils', names: [], line: 2 },
      { module: 'src.api', names: [], line: 3 },
      { module: 'src.services', names: [], line: 4 },
      { module: 'src.db', names: [], line: 5 },
      { module: '.local', names: [], line: 6 },  // 1 relative
      { module: 'fastapi', names: [], line: 7 },  // External (excluded)
    ];

    const result = analyzeImportConvention(imports, 'python', null);

    expect(result.style).toBe('absolute');
    expect(result.confidence).toBeCloseTo(0.83, 2);  // 5/6 internal imports
  });

  it('detects relative majority (75%)', () => {
    const imports: ImportInfo[] = [
      { module: '../models', names: [], line: 1 },
      { module: '../utils', names: [], line: 2 },
      { module: './local', names: [], line: 3 },
      { module: '@/models', names: [], line: 4 },  // 1 absolute
    ];

    const result = analyzeImportConvention(imports, 'node', null, ['@/*']);

    expect(result.style).toBe('relative');
    expect(result.confidence).toBe(0.75);  // 3/4
  });

  it('detects mixed imports (50/50)', () => {
    const imports: ImportInfo[] = [
      { module: 'src.models', names: [], line: 1 },
      { module: 'src.utils', names: [], line: 2 },
      { module: '.models', names: [], line: 3 },
      { module: '.utils', names: [], line: 4 },
    ];

    const result = analyzeImportConvention(imports, 'python', null);

    expect(result.style).toBe('mixed');
    expect(result.confidence).toBe(0.5);  // Max of 50% absolute, 50% relative
  });

  it('handles no internal imports (library project)', () => {
    const imports: ImportInfo[] = [
      { module: 'fastapi', names: [], line: 1 },  // All external
      { module: 'pydantic', names: [], line: 2 },
    ];

    const result = analyzeImportConvention(imports, 'python', null);

    expect(result.style).toBe('mixed');
    expect(result.confidence).toBe(0);
  });
});
