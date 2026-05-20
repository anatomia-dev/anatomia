import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildNonNodeCommands, preserveUserState } from '../../../src/commands/init/state.js';
import { getBuildCommandString } from '../../../src/utils/worktree.js';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('buildNonNodeCommands()', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `nonnodecmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A010
  it('Ruby + RSpec with bin/rspec: test is bin/rspec', async () => {
    await mkdir(join(tempDir, 'bin'), { recursive: true });
    await writeFile(join(tempDir, 'bin', 'rspec'), '#!/usr/bin/env ruby\n');

    const result = buildNonNodeCommands('Ruby', ['RSpec'], tempDir);

    expect(result.test).toBe('bin/rspec');
    expect(result.build).toBeNull();
    expect(result.lint).toBeNull();
    expect(result.dev).toBeNull();
  });

  // @ana A011
  it('Ruby + RSpec without bin/rspec: test is bundle exec rspec', () => {
    const result = buildNonNodeCommands('Ruby', ['RSpec'], tempDir);

    expect(result.test).toBe('bundle exec rspec');
  });

  // @ana A018
  it('Ruby without any test framework: test is null', () => {
    const result = buildNonNodeCommands('Ruby', [], tempDir);

    expect(result.test).toBeNull();
  });

  // @ana A012, A013
  it('Go: test and build commands populated', () => {
    const result = buildNonNodeCommands('Go', ['Go testing'], tempDir);

    expect(result.test).toBe('go test ./...');
    expect(result.build).toBe('go build ./...');
    expect(result.lint).toBeNull();
    expect(result.dev).toBeNull();
  });

  // @ana A014, A015, A016
  it('Rust: test, build, and lint commands populated', () => {
    const result = buildNonNodeCommands('Rust', ['Cargo test'], tempDir);

    expect(result.test).toBe('cargo test');
    expect(result.build).toBe('cargo build');
    expect(result.lint).toBe('cargo clippy');
    expect(result.dev).toBeNull();
  });

  // @ana A017
  it('Python + pytest: test is pytest', () => {
    const result = buildNonNodeCommands('Python', ['pytest'], tempDir);

    expect(result.test).toBe('pytest');
    expect(result.build).toBeNull();
  });

  // @ana A019
  it('non-Node projects never get a dev command', () => {
    expect(buildNonNodeCommands('Go', ['Go testing'], tempDir).dev).toBeNull();
    expect(buildNonNodeCommands('Rust', ['Cargo test'], tempDir).dev).toBeNull();
    expect(buildNonNodeCommands('Ruby', ['RSpec'], tempDir).dev).toBeNull();
    expect(buildNonNodeCommands('Python', ['pytest'], tempDir).dev).toBeNull();
  });

  it('unknown language returns all null', () => {
    const result = buildNonNodeCommands('Haskell', [], tempDir);

    expect(result.test).toBeNull();
    expect(result.build).toBeNull();
    expect(result.lint).toBeNull();
    expect(result.dev).toBeNull();
  });
});

describe('preserveUserState() — JS command migration', () => {
  let existingDir: string;
  let tmpDir: string;

  beforeEach(async () => {
    const base = join(tmpdir(), `preserve-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    existingDir = join(base, 'existing');
    tmpDir = join(base, 'tmp');
    await mkdir(existingDir, { recursive: true });
    await mkdir(tmpDir, { recursive: true });
    // Create minimal tmp ana.json so preserveUserState has something to overwrite
    await writeFile(join(tmpDir, 'ana.json'), JSON.stringify({
      anaVersion: '1.0.0', commands: { test: null, build: null, lint: null },
    }));
  });

  afterEach(async () => {
    await rm(join(tmpdir(), existingDir.split('/').slice(-3, -2)[0] || ''), {
      recursive: true, force: true, maxRetries: 3, retryDelay: 200,
    }).catch(() => {});
    // Clean up both dirs
    await rm(existingDir, { recursive: true, force: true }).catch(() => {});
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // @ana A022
  it('preserves user-configured native commands on re-init', async () => {
    await writeFile(join(existingDir, 'ana.json'), JSON.stringify({
      anaVersion: '1.0.0',
      language: 'Ruby',
      commands: { test: 'bundle exec rspec', build: null, lint: null },
    }));

    const newConfig = {
      anaVersion: '1.1.0',
      language: 'Ruby',
      commands: { test: null, build: null, lint: null },
    };

    await preserveUserState(existingDir, tmpDir, newConfig);

    const merged = JSON.parse(await import('node:fs/promises').then(f => f.readFile(join(tmpDir, 'ana.json'), 'utf-8')));
    expect(merged.commands.test).toBe('bundle exec rspec');
  });

  // @ana A023
  it('clears stale JS commands for non-Node projects on re-init', async () => {
    await writeFile(join(existingDir, 'ana.json'), JSON.stringify({
      anaVersion: '1.0.0',
      language: 'Ruby',
      commands: { test: 'pnpm run test', build: 'pnpm run build', lint: 'pnpm run lint' },
    }));

    const newConfig = {
      anaVersion: '1.1.0',
      language: 'Ruby',
      commands: { test: null, build: null, lint: null },
    };

    await preserveUserState(existingDir, tmpDir, newConfig);

    const merged = JSON.parse(await import('node:fs/promises').then(f => f.readFile(join(tmpDir, 'ana.json'), 'utf-8')));
    // Stale JS commands must be cleared
    expect(merged.commands.test).not.toBe('pnpm run test');
    expect(merged.commands.build).not.toBe('pnpm run build');
    expect(merged.commands.lint).not.toBe('pnpm run lint');
  });

  it('does NOT clear JS commands for TypeScript projects', async () => {
    await writeFile(join(existingDir, 'ana.json'), JSON.stringify({
      anaVersion: '1.0.0',
      language: 'TypeScript',
      commands: { test: 'pnpm run test', build: 'pnpm run build' },
    }));

    const newConfig = {
      anaVersion: '1.1.0',
      language: 'TypeScript',
      commands: { test: 'pnpm run test', build: 'pnpm run build' },
    };

    await preserveUserState(existingDir, tmpDir, newConfig);

    const merged = JSON.parse(await import('node:fs/promises').then(f => f.readFile(join(tmpDir, 'ana.json'), 'utf-8')));
    expect(merged.commands.test).toBe('pnpm run test');
    expect(merged.commands.build).toBe('pnpm run build');
  });
});

describe('getBuildCommandString()', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `buildcmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(tempDir, '.ana'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A021
  it('returns empty string when commands.build is null', async () => {
    await writeFile(join(tempDir, '.ana', 'ana.json'), JSON.stringify({
      commands: { build: null, test: 'cargo test' },
    }));

    expect(getBuildCommandString(tempDir)).toBe('');
  });

  it('returns the build command when it is a string', async () => {
    await writeFile(join(tempDir, '.ana', 'ana.json'), JSON.stringify({
      commands: { build: 'cargo build' },
    }));

    expect(getBuildCommandString(tempDir)).toBe('cargo build');
  });

  it('returns empty string when ana.json is missing', () => {
    expect(getBuildCommandString(join(tempDir, 'nonexistent'))).toBe('');
  });
});
