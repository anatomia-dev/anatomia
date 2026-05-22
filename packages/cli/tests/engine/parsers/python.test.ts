import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseRequirementsTxt } from '../../../src/engine/parsers/python/requirements';
import { parsePyprojectToml } from '../../../src/engine/parsers/python/pyproject';
import { parsePipfile } from '../../../src/engine/parsers/python/Pipfile';
import { readPythonDependencies } from '../../../src/engine/parsers/python';
import { isNonProductPath } from '../../../src/engine/detectors/surfaces';

describe('parseRequirementsTxt', () => {
  it('parses simple dependencies', () => {
    const content = 'flask==2.0.1\ndjango>=3.0';
    const result = parseRequirementsTxt(content);
    expect(result).toEqual(['flask', 'django']);
  });

  it('handles comments at start of line', () => {
    const content = '# comment\nflask==2.0';
    const result = parseRequirementsTxt(content);
    expect(result).toEqual(['flask']);
  });

  it('handles inline comments', () => {
    const content = 'flask==2.0 # web framework';
    const result = parseRequirementsTxt(content);
    expect(result).toEqual(['flask']);
  });

  it('handles extras in brackets', () => {
    const content = 'requests[security]>=2.0';
    const result = parseRequirementsTxt(content);
    expect(result).toEqual(['requests']);
  });

  it('handles environment markers', () => {
    const content = 'pytest>=7.0; python_version >= "3.8"';
    const result = parseRequirementsTxt(content);
    expect(result).toEqual(['pytest']);
  });

  it('skips option lines starting with dash', () => {
    const content = '-e git+https://github.com/example/repo.git\nflask';
    const result = parseRequirementsTxt(content);
    expect(result).toEqual(['flask']);
  });

  it('handles blank lines', () => {
    const content = 'flask\n\n\ndjango';
    const result = parseRequirementsTxt(content);
    expect(result).toEqual(['flask', 'django']);
  });

  it('normalizes case to lowercase', () => {
    const content = 'Django==3.0\nFLASK==2.0';
    const result = parseRequirementsTxt(content);
    expect(result).toEqual(['django', 'flask']);
  });
});

describe('parsePyprojectToml', () => {
  // @ana A001
  it('parses PEP 621 format', () => {
    const content = `[project]
dependencies = ["fastapi>=0.100.0", "uvicorn>=0.20.0"]`;
    const result = parsePyprojectToml(content);
    expect(result.production).toContain('fastapi');
    expect(result.production).toContain('uvicorn');
    expect(result.dev).toEqual([]);
  });

  // @ana A005
  it('parses Poetry format and skips python version', () => {
    const content = `[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.100.0"`;
    const result = parsePyprojectToml(content);
    expect(result.production).toContain('fastapi');
    expect(result.production).not.toContain('python');
    expect(result.dev).toEqual([]);
  });

  // @ana A006
  it('parses Poetry dev dependencies', () => {
    const content = `[tool.poetry.group.dev.dependencies]
pytest = "^7.0"`;
    const result = parsePyprojectToml(content);
    expect(result.production).toContain('pytest');
    expect(result.dev).toEqual([]);
  });

  // @ana A018
  it('returns empty arrays for invalid TOML', () => {
    const content = 'invalid{toml';
    const result = parsePyprojectToml(content);
    expect(result.production).toEqual([]);
    expect(result.dev).toEqual([]);
  });

  // @ana A002, A003
  it('parses PEP 735 dependency-groups into dev', () => {
    const content = `[dependency-groups]
test = [
    "pytest>=7.0",
    "coverage>=7.0",
]
docs = [
    "sphinx>=6.0",
]`;
    const result = parsePyprojectToml(content);
    expect(result.dev).toContain('pytest');
    expect(result.dev).toContain('coverage');
    expect(result.dev).toContain('sphinx');
    expect(result.production).not.toContain('pytest');
    expect(result.production).not.toContain('coverage');
    expect(result.production).not.toContain('sphinx');
  });

  // @ana A004
  it('parses optional-dependencies into production', () => {
    const content = `[project]
dependencies = [
    "anyio[trio] >=3.2.1",
    "httpx>=0.24.0",
]

[project.optional-dependencies]
dev = ["black>=23.0", "mypy>=1.0"]`;
    const result = parsePyprojectToml(content);
    expect(result.production).toContain('anyio');
    expect(result.production).toContain('httpx');
    expect(result.production).toContain('black');
    expect(result.production).toContain('mypy');
    expect(result.dev).toEqual([]);
  });

  it('handles single-line arrays in dependency-groups', () => {
    const content = `[dependency-groups]
benchmark = ["pytest-benchmark>=5.1.0"]`;
    const result = parsePyprojectToml(content);
    expect(result.dev).toContain('pytest-benchmark');
  });

  it('handles TOML inline comments after closing bracket', () => {
    const content = `[project]
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn>=0.20.0",
] # production deps

[dependency-groups]
test = [
    "pytest>=9.0",
    "coverage[toml]>=7.0",
] # test dependencies`;
    const result = parsePyprojectToml(content);
    expect(result.production).toContain('fastapi');
    expect(result.production).toContain('uvicorn');
    expect(result.dev).toContain('pytest');
    expect(result.dev).toContain('coverage');
  });

  it('handles single-quoted strings in dependency-groups', () => {
    const content = `[dependency-groups]
test = [
    'pytest>=7.0',
    "coverage>=7.0",
]`;
    const result = parsePyprojectToml(content);
    expect(result.dev).toContain('pytest');
    expect(result.dev).toContain('coverage');
  });

  it('extracts deps from fastapi-style pyproject with correct separation', () => {
    const content = `[project]
name = "fastapi"
dependencies = [
    "starlette>=0.37.2",
    "pydantic>=1.7.4",
    "anyio[trio] >=3.2.1",
]

[project.optional-dependencies]
standard = [
    "httpx>=0.23.0",
    "uvicorn[standard]>=0.12.0",
]

[dependency-groups]
test = [
    "pytest>=7.1.3",
    "coverage[toml]>=6.5.0",
    "dirty-equals>=0.6.0",
]`;
    const result = parsePyprojectToml(content);
    // Production: project deps + optional-dependencies
    expect(result.production).toContain('starlette');
    expect(result.production).toContain('pydantic');
    expect(result.production).toContain('anyio');
    expect(result.production).toContain('httpx');
    // Dev: dependency-groups
    expect(result.dev).toContain('pytest');
    expect(result.dev).toContain('coverage');
    expect(result.dev).toContain('dirty-equals');
    // Contamination check: dev deps NOT in production
    expect(result.production).not.toContain('dirty-equals');
  });

  it('extracts deps from pydantic-style pyproject with correct separation', () => {
    const content = `[project]
name = "pydantic"
dependencies = [
    'pydantic-core>=2.20.1',
    'typing-extensions>=4.6.1',
]

[dependency-groups]
test = [
    'pytest>=7.0',
    'pytest-timeout>=2.1.0',
]`;
    const result = parsePyprojectToml(content);
    expect(result.production).toContain('pydantic-core');
    expect(result.production).not.toContain('pytest');
    expect(result.dev).toContain('pytest');
    expect(result.dev).toContain('pytest-timeout');
  });

  it('handles include-group inline tables', () => {
    const content = `[dependency-groups]
test = [
    "pytest>=7.0",
    {include-group = "common"},
]
common = [
    "rich>=13.0",
]`;
    const result = parsePyprojectToml(content);
    expect(result.dev).toContain('pytest');
    expect(result.dev).not.toContain('include-group');
  });

  // @ana A017
  it('handles empty dependency-groups section', () => {
    const content = `[dependency-groups]

[project]
name = "empty"`;
    const result = parsePyprojectToml(content);
    expect(result.production).toEqual([]);
    expect(result.dev).toEqual([]);
  });

  it('handles dependency-groups with extras brackets and single quotes combined', () => {
    const content = `[dependency-groups]
test = [
    'pytest[extra] >=7.0',
    "coverage>=7.0",
    'anyio[trio]>=3.0',
]`;
    const result = parsePyprojectToml(content);
    expect(result.dev).toContain('pytest');
    expect(result.dev).toContain('coverage');
    expect(result.dev).toContain('anyio');
  });

  // --- Contamination proof tests ---

  // @ana A009, A010
  it('does not include dev-only Flask in production', () => {
    const content = `[project]
dependencies = [
    "starlette>=0.27.0",
    "pydantic>=1.7.4",
]

[dependency-groups]
tests = [
    "flask>=2.0",
    "pytest>=7.0",
]`;
    const result = parsePyprojectToml(content);
    expect(result.production).toContain('starlette');
    expect(result.production).not.toContain('flask');
    expect(result.dev).toContain('flask');
  });

  // @ana A011, A012
  it('does not include dev-only SQLAlchemy in production', () => {
    const content = `[project]
dependencies = [
    "pydantic-core>=2.20.1",
    "typing-extensions>=4.6.1",
]

[dependency-groups]
dev = [
    "sqlalchemy>=2.0",
    "mypy>=1.0",
]`;
    const result = parsePyprojectToml(content);
    expect(result.production).toContain('pydantic-core');
    expect(result.production).not.toContain('sqlalchemy');
    expect(result.dev).toContain('sqlalchemy');
  });

  // @ana A013
  it('pytest in dependency-groups appears in all for testing detection', () => {
    const content = `[project]
dependencies = [
    "fastapi>=0.100.0",
]

[dependency-groups]
test = [
    "pytest>=7.0",
]`;
    const result = parsePyprojectToml(content);
    expect(result.dev).toContain('pytest');
    // At parsePyprojectToml level, "all" doesn't exist — that's readPythonDependencies.
    // But dev containing pytest proves it will flow into "all".
  });

  // @ana A014
  it('FastAPI in project dependencies lands in production', () => {
    const content = `[project]
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn>=0.20.0",
]

[dependency-groups]
test = [
    "pytest>=7.0",
]`;
    const result = parsePyprojectToml(content);
    expect(result.production).toContain('fastapi');
    expect(result.production).toContain('uvicorn');
  });

  // @ana A019
  it('handles dependency-group named dependencies', () => {
    const content = `[project]
dependencies = ["flask>=2.0"]

[dependency-groups]
dependencies = ["pytest>=7.0"]`;
    const result = parsePyprojectToml(content);
    // Strategy 1 uses `match()` which returns only the first occurrence,
    // so the `[project]` `dependencies` key wins — the identically-named
    // group under `[dependency-groups]` does NOT cross-match into production.
    expect(result.dev).toContain('pytest');
    expect(result.production).toContain('flask');
    expect(result.production).not.toContain('pytest');
  });

  // @ana A016
  it('docstring does not say devDependencies', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const filePath = path.join(__dirname, '../../../src/engine/parsers/python/pyproject.ts');
    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).not.toContain('devDependencies');
  });
});

// @ana A015
describe('EXCLUDED_SEGMENTS', () => {
  it('excludes testing segment from surface detection', () => {
    expect(isNonProductPath('packages/testing/code-health')).toBe(true);
  });
});

describe('readPythonDependencies', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anatomia-pydeps-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // @ana A007, A008, A013
  it('returns structured production and all', async () => {
    await fs.writeFile(path.join(tempDir, 'pyproject.toml'), `[project]
dependencies = ["fastapi>=0.100.0"]

[dependency-groups]
test = ["pytest>=7.0"]
`);
    const result = await readPythonDependencies(tempDir);
    expect(result.production).toBeDefined();
    expect(result.all).toBeDefined();
    expect(result.production).toContain('fastapi');
    expect(result.production).not.toContain('pytest');
    expect(result.all).toContain('fastapi');
    expect(result.all).toContain('pytest');
  });

  it('requirements.txt deps land in production', async () => {
    await fs.writeFile(path.join(tempDir, 'requirements.txt'), 'flask==2.0\ndjango>=3.0\n');
    const result = await readPythonDependencies(tempDir);
    expect(result.production).toContain('flask');
    expect(result.production).toContain('django');
    expect(result.all).toContain('flask');
  });

  it('combines requirements.txt and pyproject.toml', async () => {
    await fs.writeFile(path.join(tempDir, 'requirements.txt'), 'flask==2.0\n');
    await fs.writeFile(path.join(tempDir, 'pyproject.toml'), `[dependency-groups]
test = ["pytest>=7.0"]
`);
    const result = await readPythonDependencies(tempDir);
    expect(result.production).toContain('flask');
    expect(result.production).not.toContain('pytest');
    expect(result.all).toContain('flask');
    expect(result.all).toContain('pytest');
  });
});

describe('parsePipfile', () => {
  it('parses packages section', () => {
    const content = `[packages]
flask = "*"
sqlalchemy = ">=1.4"`;
    const result = parsePipfile(content);
    expect(result).toEqual(['flask', 'sqlalchemy']);
  });

  it('parses dev-packages section', () => {
    const content = `[dev-packages]
pytest = "*"`;
    const result = parsePipfile(content);
    expect(result).toEqual(['pytest']);
  });

  it('handles empty Pipfile', () => {
    const content = '[packages]';
    const result = parsePipfile(content);
    expect(result).toEqual([]);
  });
});
