/**
 * Tests for ana run command.
 *
 * Tests mock spawnSync to verify correct argument construction
 * without spawning actual processes. All paths call process.exit(),
 * so every executeRun() call is expected to throw.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
}));

import { spawnSync } from 'node:child_process';
import { executeRun } from '../../src/commands/run.js';

const mockedSpawnSync = vi.mocked(spawnSync);

describe('ana run', () => {
  let tempDir: string;
  let originalCwd: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockedSpawnSync.mockReset();
    // Default: `which` succeeds (claude is in PATH), `claude` exits 0
    mockedSpawnSync.mockImplementation(((cmd: string) => {
      if (cmd === 'which' || cmd === 'where') {
        return { status: 0, stdout: '/usr/bin/claude\n', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as typeof spawnSync);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  function createProject(config?: Record<string, unknown>): void {
    const anaDir = path.join(tempDir, '.ana');
    fs.mkdirSync(anaDir, { recursive: true });
    fs.writeFileSync(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({
        name: 'test',
        platforms: ['claude'],
        platformFlags: {},
        ...config,
      }),
    );
  }

  /** Run executeRun and return the exit code from the thrown error. */
  function runAndGetExit(suffix: string, args: string[] = []): number {
    try {
      executeRun(suffix, args);
      return -1; // Should not reach here
    } catch (e) {
      const match = (e as Error).message.match(/process\.exit\((\d+)\)/);
      return match?.[1] ? parseInt(match[1], 10) : -1;
    }
  }

  // @ana A033
  it('errors without .ana directory', () => {
    const code = runAndGetExit('build');
    expect(code).toBe(1);
    const errorOutput = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(errorOutput).toContain('ana init');
  });

  // @ana A028
  it('spawns claude --agent ana-build for build argument', () => {
    createProject();
    runAndGetExit('build');

    const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
    expect(spawnCall).toBeDefined();
    const spawnArgs = spawnCall![1] as string[];
    expect(spawnArgs).toContain('--agent');
    expect(spawnArgs).toContain('ana-build');
  });

  // @ana A029
  it('spawns claude --agent ana for empty agent argument', () => {
    createProject();
    runAndGetExit('');

    const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
    expect(spawnCall).toBeDefined();
    const spawnArgs = spawnCall![1] as string[];
    expect(spawnArgs).toContain('--agent');
    expect(spawnArgs).toContain('ana');
    expect(spawnArgs[spawnArgs.indexOf('--agent') + 1]).toBe('ana');
  });

  // @ana A030
  it('appends platformFlags from config', () => {
    createProject({
      platformFlags: { claude: ['--dangerously-skip-permissions'] },
    });
    runAndGetExit('build');

    const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
    expect(spawnCall).toBeDefined();
    const spawnArgs = spawnCall![1] as string[];
    expect(spawnArgs).toContain('--dangerously-skip-permissions');
  });

  // @ana A031
  it('passes through args after --', () => {
    createProject();
    runAndGetExit('build', ['--extra-flag']);

    const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
    expect(spawnCall).toBeDefined();
    const spawnArgs = spawnCall![1] as string[];
    expect(spawnArgs).toContain('--extra-flag');
  });

  // @ana A032
  it('rejects --agent in platformFlags with exit code 1', () => {
    createProject({
      platformFlags: { claude: ['--agent', 'something'] },
    });

    const code = runAndGetExit('build');
    expect(code).toBe(1);
    const errorOutput = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(errorOutput).toContain('--agent');
    expect(errorOutput).toContain('conflicts');
  });

  it('errors when claude is not in PATH', () => {
    createProject();
    mockedSpawnSync.mockImplementation(((cmd: string) => {
      if (cmd === 'which' || cmd === 'where') {
        return { status: 1, stdout: '', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as typeof spawnSync);

    const code = runAndGetExit('build');
    expect(code).toBe(1);
    const errorOutput = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(errorOutput).toContain('claude not found');
  });

  it('errors for unknown agent suffix', () => {
    createProject();
    const code = runAndGetExit('unknown-agent');
    expect(code).toBe(1);
    const errorOutput = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(errorOutput).toContain('Unknown agent');
  });

  it('builds correct arg order: --agent name, flags, passthrough', () => {
    createProject({
      platformFlags: { claude: ['--dangerously-skip-permissions'] },
    });
    runAndGetExit('build', ['--verbose']);

    const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
    const spawnArgs = spawnCall![1] as string[];
    expect(spawnArgs).toEqual([
      '--agent', 'ana-build',
      '--dangerously-skip-permissions',
      '--verbose',
    ]);
  });

  it('maps all known agent suffixes correctly', () => {
    const expectedMappings: Record<string, string> = {
      '': 'ana',
      build: 'ana-build',
      plan: 'ana-plan',
      verify: 'ana-verify',
      setup: 'ana-setup',
      learn: 'ana-learn',
    };

    for (const [suffix, expectedAgent] of Object.entries(expectedMappings)) {
      createProject();
      mockedSpawnSync.mockReset();
      mockedSpawnSync.mockImplementation(((cmd: string) => {
        if (cmd === 'which' || cmd === 'where') {
          return { status: 0, stdout: '/usr/bin/claude\n', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      }) as typeof spawnSync);

      runAndGetExit(suffix);

      const spawnCall = mockedSpawnSync.mock.calls.find(c => c[0] === 'claude');
      expect(spawnCall, `Missing spawn call for suffix "${suffix}"`).toBeDefined();
      const spawnArgs = spawnCall![1] as string[];
      expect(spawnArgs[spawnArgs.indexOf('--agent') + 1]).toBe(expectedAgent);
    }
  });

  it('shows advisory warning when no work item at expected stage', () => {
    createProject();
    const plansDir = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(path.join(plansDir, '.saves.json'), JSON.stringify({ stage: 'ready-for-verify' }));

    runAndGetExit('build');

    const logOutput = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(logOutput).toContain('No work item at build stage');
  });

  it('does not warn when work item is at the correct stage', () => {
    createProject();
    const plansDir = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(path.join(plansDir, '.saves.json'), JSON.stringify({ stage: 'ready-for-build' }));

    runAndGetExit('build');

    const logOutput = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(logOutput).not.toContain('No work item');
  });
});
