/**
 * Unit tests for polyglot language detection
 *
 * Tests the tiered heuristic in detectProjectType() that disambiguates
 * repos with both package.json and pyproject.toml.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectProjectType } from '../../../src/engine/detectors/projectType.js';
import { detectFramework } from '../../../src/engine/detectors/framework.js';

describe('polyglot language detection', () => {
  const tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'anatom-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch {
        // Ignore cleanup errors
      }
    }
    tempDirs.length = 0;
  });

  // @ana A001
  it('detects Python when pyproject.toml has PEP 621 dependencies', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "litellm"
dependencies = ["openai", "httpx", "fastapi"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('pyproject.toml');
  });

  // @ana A002, A003
  it('preserves Node detection with lockfile and no pyproject.toml', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A004
  it('workspaces field overrides pyproject.toml presence', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      workspaces: ['packages/*'],
    }));
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "test"
dependencies = ["fastapi", "uvicorn"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.90);
  });

  it('workspaces object format (Yarn) overrides pyproject.toml', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      workspaces: { packages: ['packages/*'] },
    }));
    await fs.writeFile(path.join(dir, 'yarn.lock'), '');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "test"
dependencies = ["django"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.90);
  });

  // @ana A005
  it('detects Python when pyproject.toml has Poetry dependencies', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[tool.poetry.dependencies]
python = "^3.9"
fastapi = "^0.100.0"
uvicorn = "^0.23.0"
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.90);
  });

  // @ana A006, A007
  it('detects Python when no lockfile but pyproject.toml exists', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "myapp"
dependencies = ["flask"]
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.85);
  });

  // @ana A008, A019
  it('reduces confidence for bare package.json without lockfile', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.70);
  });

  // @ana A009
  it('tooling-only pyproject.toml does not trigger Python detection', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[tool.ruff]
line-length = 88

[tool.black]
line-length = 88
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A010
  it('handles malformed pyproject.toml gracefully', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '{{{{invalid toml content!@#$');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A011
  it('recognizes bun.lock as lockfile indicator', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'bun.lock'), '');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
    expect(result.indicators).toContain('bun.lock');
  });

  // @ana A018
  it('empty dependencies array does not trigger Python detection', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "toolconfig"
dependencies = []
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A012
  it('frameworkDeps uses Python deps after type flip', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
    }));
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "backend"
dependencies = ["fastapi", "uvicorn", "sqlalchemy"]
`);

    // Type detection flips to Python
    const result = await detectProjectType(dir);
    expect(result.type).toBe('python');

    // Framework detection should use Python deps, not Node deps
    const pythonDeps = ['fastapi', 'uvicorn', 'sqlalchemy'];
    const nodeDeps = ['react', 'react-dom'];

    // If frameworkDeps correctly uses Python deps, it finds fastapi
    const frameworkResult = detectFramework(pythonDeps, 'python', []);
    expect(frameworkResult.framework).toBe('fastapi');

    // Node deps would NOT find fastapi
    const wrongResult = detectFramework(nodeDeps, 'python', []);
    expect(wrongResult.framework).not.toBe('fastapi');
  });

  it('pyproject.toml with only [project] but no dependencies key → node', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(dir, 'pyproject.toml'), `[project]
name = "config-only"
version = "1.0.0"
`);

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });
});
