import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectCommands } from '../../src/engine/detectors/commands.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('detectCommands()', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `commands-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A008, A009
  it('node project gets JS commands from package.json', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        scripts: { build: 'tsc', test: 'vitest run', lint: 'eslint .' },
      }),
    );

    const result = await detectCommands(tempDir, 'pnpm', 'node');

    expect(result.build).toBe('pnpm run build');
    expect(result.test).toBe('pnpm run test');
    expect(result.lint).toBe('pnpm run lint');
    expect(result.all).toHaveProperty('build', 'tsc');
  });

  // @ana A005, A006, A007
  it('ruby project with package.json: null named commands, populated all', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        scripts: { build: 'webpack', test: 'jest', lint: 'eslint' },
      }),
    );

    const result = await detectCommands(tempDir, 'yarn', 'ruby');

    expect(result.build).toBeNull();
    expect(result.test).toBeNull();
    expect(result.lint).toBeNull();
    expect(result.dev).toBeNull();
    expect(result.all).toHaveProperty('build', 'webpack');
    expect(result.all).toHaveProperty('test', 'jest');
  });

  it('no package manager returns all-null', async () => {
    const result = await detectCommands(tempDir, null);

    expect(result.build).toBeNull();
    expect(result.test).toBeNull();
    expect(result.lint).toBeNull();
    expect(result.dev).toBeNull();
    expect(result.all).toEqual({});
  });

  it('no package.json returns all-null', async () => {
    const result = await detectCommands(tempDir, 'pnpm', 'node');

    expect(result.build).toBeNull();
    expect(result.test).toBeNull();
    expect(result.all).toEqual({});
  });

  it('unknown projectType gets JS commands (same as node)', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        scripts: { build: 'tsc', test: 'vitest' },
      }),
    );

    const result = await detectCommands(tempDir, 'pnpm', 'unknown');

    expect(result.build).toBe('pnpm run build');
    expect(result.test).toBe('pnpm run test');
  });

  it('no projectType (undefined) gets JS commands for backward compat', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        scripts: { build: 'tsc' },
      }),
    );

    const result = await detectCommands(tempDir, 'pnpm');

    expect(result.build).toBe('pnpm run build');
  });
});
