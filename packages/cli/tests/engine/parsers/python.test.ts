import { describe, it, expect } from 'vitest';
import { parseRequirementsTxt } from '../../../src/engine/parsers/python/requirements';
import { parsePyprojectToml } from '../../../src/engine/parsers/python/pyproject';
import { parsePipfile } from '../../../src/engine/parsers/python/Pipfile';

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
  it('parses PEP 621 format', () => {
    const content = `[project]
dependencies = ["fastapi>=0.100.0", "uvicorn>=0.20.0"]`;
    const result = parsePyprojectToml(content);
    expect(result).toEqual(['fastapi', 'uvicorn']);
  });

  it('parses Poetry format and skips python version', () => {
    const content = `[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.100.0"`;
    const result = parsePyprojectToml(content);
    expect(result).toEqual(['fastapi']);
  });

  it('parses Poetry dev dependencies', () => {
    const content = `[tool.poetry.group.dev.dependencies]
pytest = "^7.0"`;
    const result = parsePyprojectToml(content);
    expect(result).toEqual(['pytest']);
  });

  it('returns empty array for invalid TOML', () => {
    const content = 'invalid{toml';
    const result = parsePyprojectToml(content);
    expect(result).toEqual([]);
  });

  // @ana A001, A002
  it('parses PEP 735 dependency-groups', () => {
    const content = `[dependency-groups]
test = [
    "pytest>=7.0",
    "coverage>=7.0",
]
docs = [
    "sphinx>=6.0",
]`;
    const result = parsePyprojectToml(content);
    expect(result).toContain('pytest');
    expect(result).toContain('coverage');
    expect(result).toContain('sphinx');
    expect(result.length).toBeGreaterThan(1);
  });

  // @ana A003, A004
  it('handles extras brackets in arrays', () => {
    const content = `[project]
dependencies = [
    "anyio[trio] >=3.2.1",
    "httpx>=0.24.0",
]`;
    const result = parsePyprojectToml(content);
    expect(result).toContain('anyio');
    expect(result).toContain('httpx');
  });

  // @ana A005
  it('handles single-line arrays', () => {
    const content = `[dependency-groups]
benchmark = ["pytest-benchmark>=5.1.0"]`;
    const result = parsePyprojectToml(content);
    expect(result).toContain('pytest-benchmark');
  });

  // @ana A006, A007
  it('handles single-quoted strings', () => {
    const content = `[dependency-groups]
test = [
    'pytest>=7.0',
    "coverage>=7.0",
]`;
    const result = parsePyprojectToml(content);
    expect(result).toContain('pytest');
    expect(result).toContain('coverage');
  });

  // @ana A008
  it('extracts pytest from fastapi-style pyproject', () => {
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
    expect(result).toContain('pytest');
    expect(result).toContain('starlette');
    expect(result).toContain('pydantic');
    expect(result).toContain('anyio');
    expect(result).toContain('httpx');
    expect(result).toContain('coverage');
  });

  // @ana A009
  it('extracts pytest from pydantic-style pyproject', () => {
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
    expect(result).toContain('pytest');
    expect(result).toContain('pydantic-core');
  });

  // @ana A010, A011
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
    expect(result).toContain('pytest');
    expect(result).not.toContain('include-group');
  });

  it('handles empty dependency-groups section', () => {
    const content = `[dependency-groups]

[project]
name = "empty"`;
    const result = parsePyprojectToml(content);
    expect(result).toEqual([]);
  });

  it('handles dependency-groups with extras brackets and single quotes combined', () => {
    const content = `[dependency-groups]
test = [
    'pytest[extra] >=7.0',
    "coverage>=7.0",
    'anyio[trio]>=3.0',
]`;
    const result = parsePyprojectToml(content);
    expect(result).toContain('pytest');
    expect(result).toContain('coverage');
    expect(result).toContain('anyio');
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
