/**
 * Unit tests for project type detection
 *
 * Tests detectProjectType() with real temp directories to verify
 * file-based detection logic.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectProjectType } from '../../../src/engine/detectors/projectType.js';

describe('detectProjectType', () => {
  const tempDirs: string[] = [];

  // Helper to create a temp directory
  async function createTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'anatom-test-'));
    tempDirs.push(dir);
    return dir;
  }

  // Cleanup after each test
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

  it('detects Node.js project from bare package.json (reduced confidence)', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.70);
    expect(result.indicators).toContain('package.json');
  });

  it('detects Node.js with pnpm-lock.yaml indicator', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
    expect(result.indicators).toContain('package.json');
    expect(result.indicators).toContain('pnpm-lock.yaml');
  });

  it('detects Node.js with package-lock.json indicator', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.indicators).toContain('package.json');
    expect(result.indicators).toContain('package-lock.json');
  });

  it('detects Python project from pyproject.toml', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "test"');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.95);
    expect(result.indicators).toContain('pyproject.toml');
  });

  it('detects Python project from requirements.txt', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask==2.0.0');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('requirements.txt');
  });

  it('detects Python project from Pipfile', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'Pipfile'), '');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('Pipfile');
  });

  it('detects Python project from setup.py', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'setup.py'), '');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.85);
    expect(result.indicators).toContain('setup.py');
  });

  it('detects Go project from go.mod', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'go.mod'), 'module example.com/test');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('go');
    expect(result.confidence).toBe(0.95);
    expect(result.indicators).toContain('go.mod');
  });

  it('detects Rust project from Cargo.toml', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'Cargo.toml'), '[package]\nname = "test"');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('rust');
    expect(result.confidence).toBe(0.95);
    expect(result.indicators).toContain('Cargo.toml');
  });

  it('detects Ruby project from Gemfile', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'Gemfile'), 'source "https://rubygems.org"');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('ruby');
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('Gemfile');
  });

  it('detects PHP project from composer.json', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'composer.json'), '{}');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('php');
    expect(result.confidence).toBe(0.90);
    expect(result.indicators).toContain('composer.json');
  });

  it('returns unknown for empty directory', async () => {
    const dir = await createTempDir();

    const result = await detectProjectType(dir);

    expect(result.type).toBe('unknown');
    expect(result.confidence).toBe(0.0);
    expect(result.indicators).toEqual([]);
  });

  it('prioritizes Node.js over Go when both present (priority order)', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'go.mod'), 'module test');

    const result = await detectProjectType(dir);

    // Node.js comes first in priority order (bare package.json = 0.70)
    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.70);
    expect(result.indicators).toContain('package.json');
  });

  it('prioritizes pyproject.toml over requirements.txt', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask');

    const result = await detectProjectType(dir);

    // pyproject.toml has higher confidence (0.95 vs 0.90)
    expect(result.type).toBe('python');
    expect(result.confidence).toBe(0.95);
    expect(result.indicators).toContain('pyproject.toml');
  });

  // Lockfile invariant tests: package.json + lockfile + NO pyproject.toml → always node 0.95
  // @ana A013
  it('lockfile invariant: pnpm-lock.yaml', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), '');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A014
  it('lockfile invariant: package-lock.json', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A015
  it('lockfile invariant: yarn.lock', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'yarn.lock'), '');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A016
  it('lockfile invariant: bun.lockb', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'bun.lockb'), '');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });

  // @ana A017
  it('lockfile invariant: bun.lock', async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'bun.lock'), '');

    const result = await detectProjectType(dir);

    expect(result.type).toBe('node');
    expect(result.confidence).toBe(0.95);
  });
});
