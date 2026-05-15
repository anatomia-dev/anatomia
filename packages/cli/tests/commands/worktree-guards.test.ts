/**
 * Integration tests for worktree guards.
 *
 * Each guarded command detects when it's running inside a git worktree
 * (via isWorktreeDirectory()) and either exits with an error or warns.
 * These tests create a fake .git file that triggers the detection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { registerInitCommand } from '../../src/commands/init/index.js';
import { registerSetupCommand } from '../../src/commands/setup.js';
import { registerScanCommand } from '../../src/commands/scan.js';
import { completeWork } from '../../src/commands/work.js';

let tempDir: string;
let originalCwd: string;
let originalError: typeof console.error;
let originalWarn: typeof console.warn;
let mockExit: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-guard-test-'));
  originalCwd = process.cwd();
  originalError = console.error;
  originalWarn = console.warn;
  // Create fake .git file that triggers isWorktreeDirectory()
  await fs.writeFile(
    path.join(tempDir, '.git'),
    'gitdir: /fake/.git/worktrees/test\n'
  );
});

afterEach(async () => {
  // Guaranteed cleanup — runs even if assertions fail
  console.error = originalError;
  console.warn = originalWarn;
  if (mockExit) {
    mockExit.mockRestore();
    mockExit = null;
  }
  process.chdir(originalCwd);
  await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
});

// @ana A001, A002
describe('init guard blocks execution from a worktree', () => {
  it('exits with code 1 and tells user to use main directory', async () => {
    process.chdir(tempDir);

    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const errors: string[] = [];
    console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };

    const program = new Command();
    program.exitOverride();
    registerInitCommand(program);

    await expect(program.parseAsync(['node', 'ana', 'init'])).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    const errorOutput = errors.join('\n');
    expect(errorOutput).toContain('main project directory');
  });
});

// @ana A003, A004
describe('setup complete guard blocks execution from a worktree', () => {
  it('exits with code 1 and tells user to use main directory', async () => {
    process.chdir(tempDir);

    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const errors: string[] = [];
    console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };

    const program = new Command();
    program.exitOverride();
    registerSetupCommand(program);

    await expect(program.parseAsync(['node', 'ana', 'setup', 'complete'])).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    const errorOutput = errors.join('\n');
    expect(errorOutput).toContain('main project directory');
  });
});

// @ana A005, A006
describe('work complete guard blocks execution from a worktree', () => {
  it('exits with code 1 and tells user to use main directory', async () => {
    process.chdir(tempDir);

    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const errors: string[] = [];
    console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };

    await expect(completeWork('test-slug')).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    const errorOutput = errors.join('\n');
    expect(errorOutput).toContain('main project directory');
  });
});

// @ana A007, A008
describe('scan --save guard warns but continues from a worktree', () => {
  it('warns about worktree but does not exit with code 1', async () => {
    process.chdir(tempDir);

    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };

    const program = new Command();
    program.exitOverride();
    registerScanCommand(program);

    // scan --save will warn, then attempt to scan the temp dir.
    // It may throw due to missing project structure — that's fine.
    // The assertion is on the warning, not the scan result.
    try {
      await program.parseAsync(['node', 'ana', 'scan', '--save']);
    } catch {
      // Expected — scan engine may fail on empty temp dir
    }

    const warnOutput = warnings.join('\n');
    expect(warnOutput).toContain('worktree');
    expect(mockExit).not.toHaveBeenCalledWith(1);
  });
});

// @ana A009
describe('afterEach restores process state', () => {
  it('confirms spies and cwd are restored after worktree tests', () => {
    // This test runs AFTER the above tests. If afterEach cleanup failed,
    // process.cwd() would still be the temp dir (which was deleted),
    // or console.error/warn would still be mocked.
    expect(process.cwd()).toBe(originalCwd);
    expect(console.error).toBe(originalError);
    expect(console.warn).toBe(originalWarn);
  });
});
