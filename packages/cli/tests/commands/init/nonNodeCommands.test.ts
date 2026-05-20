import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildNonNodeCommands } from '../../../src/commands/init/state.js';
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
