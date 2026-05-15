/**
 * Tests extracted from work.test.ts that require vi.mock('node:child_process').
 *
 * Separated because vi.mock is hoisted to module scope — adding it to work.test.ts
 * would break 2290+ tests that depend on real spawnSync/execSync.
 *
 * Pattern follows work-merge.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Capture real implementations before vi.mock hoists
const { realExecSync, realSpawnSync } = vi.hoisted(() => {
  const cp = require('node:child_process');
  return {
    realExecSync: cp.execSync as typeof import('node:child_process').execSync,
    realSpawnSync: cp.spawnSync as typeof import('node:child_process').spawnSync,
  };
});

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: spawnMock,
  };
});

import { completeWork, getClaudePid } from '../../src/commands/work.js';

describe('getClaudePid (mocked)', () => {
  beforeEach(() => {
    // Default: pass all spawnSync calls through to real implementation
    spawnMock.mockImplementation((...args: Parameters<typeof realSpawnSync>) => {
      return realSpawnSync(...args);
    });
  });

  afterEach(() => {
    spawnMock.mockReset();
  });

  // @ana A001
  it('resolves Claude PID from process tree', () => {
    spawnMock.mockImplementation(((command: string, args?: readonly string[], options?: object) => {
      if (command === 'ps') {
        return { status: 0, stdout: '12345\n', stderr: '', pid: 0, output: ['', '12345\n', ''], signal: null };
      }
      return realSpawnSync(command, args, options);
    }) as typeof realSpawnSync);

    const pid = getClaudePid();
    expect(pid).toBe(12345);
  });

  // @ana A002
  it('returns null when ps command fails', () => {
    spawnMock.mockImplementation(((command: string, args?: readonly string[], options?: object) => {
      if (command === 'ps') {
        return { status: 1, stdout: '', stderr: 'ps: error', pid: 0, output: ['', '', 'ps: error'], signal: null };
      }
      return realSpawnSync(command, args, options);
    }) as typeof realSpawnSync);

    const pid = getClaudePid();
    expect(pid).toBeNull();
  });

  // @ana A003
  it('returns null when ps output is not a valid number', () => {
    spawnMock.mockImplementation(((command: string, args?: readonly string[], options?: object) => {
      if (command === 'ps') {
        return { status: 0, stdout: '0\n', stderr: '', pid: 0, output: ['', '0\n', ''], signal: null };
      }
      return realSpawnSync(command, args, options);
    }) as typeof realSpawnSync);

    const pid = getClaudePid();
    expect(pid).toBeNull();
  });
});

describe('exits on pull conflict (mocked)', () => {
  let tempDir: string;
  let originalCwd: string;
  let mockExit: ReturnType<typeof vi.spyOn>;
  let errors: string[];
  let originalError: typeof console.error;
  let originalLog: typeof console.log;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'work-ci-mocked-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    errors = [];
    originalError = console.error;
    originalLog = console.log;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
    console.log = () => {}; // suppress normal output

    // Default: pass all spawnSync calls through to real implementation
    spawnMock.mockImplementation((...args: Parameters<typeof realSpawnSync>) => {
      return realSpawnSync(...args);
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    mockExit.mockRestore();
    console.error = originalError;
    console.log = originalLog;
    spawnMock.mockReset();
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function createMergedProject(options: {
    slug: string;
    phases?: number;
  }): Promise<void> {
    const phases = options.phases || 1;
    const slug = options.slug;

    realExecSync('git init', { cwd: tempDir, stdio: 'ignore' });
    realExecSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
    realExecSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({ artifactBranch: 'main' }),
      'utf-8'
    );

    realExecSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
    realExecSync('git branch -M main', { cwd: tempDir, stdio: 'ignore' });

    const slugPath = path.join(tempDir, '.ana', 'plans', 'active', slug);
    await fs.mkdir(slugPath, { recursive: true });
    await fs.writeFile(path.join(slugPath, 'scope.md'), '# Scope', 'utf-8');

    let planContent = '# Plan\n## Phases\n';
    for (let i = 0; i < phases; i++) {
      const phaseNum = i + 1;
      const specFile = phases === 1 ? 'spec.md' : `spec-${phaseNum}.md`;
      planContent += `- [ ] Phase ${phaseNum}\n  Spec: ${specFile}\n`;
      await fs.writeFile(path.join(slugPath, specFile), `# Spec ${phaseNum}`, 'utf-8');
    }
    await fs.writeFile(path.join(slugPath, 'plan.md'), planContent, 'utf-8');

    realExecSync('git add -A && git commit -m "add planning"', { cwd: tempDir, stdio: 'ignore' });

    realExecSync(`git checkout -b feature/${slug}`, { cwd: tempDir, stdio: 'ignore' });

    await fs.writeFile(path.join(slugPath, 'build_report.md'), '# Build Report', 'utf-8');
    await fs.writeFile(path.join(slugPath, 'verify_report.md'), '# Verify Report\n\n**Result:** PASS', 'utf-8');

    const savesEntries: Record<string, { saved_at: string; hash: string }> = {};
    savesEntries['build-report'] = { saved_at: new Date().toISOString(), hash: 'sha256:' + '0'.repeat(64) };
    savesEntries['verify-report'] = { saved_at: new Date().toISOString(), hash: 'sha256:' + '0'.repeat(64) };
    await fs.writeFile(path.join(slugPath, '.saves.json'), JSON.stringify(savesEntries), 'utf-8');

    realExecSync('git add -A && git commit -m "add reports"', { cwd: tempDir, stdio: 'ignore' });

    realExecSync('git checkout main', { cwd: tempDir, stdio: 'ignore' });
    realExecSync(`git merge --no-ff feature/${slug} -m "merge"`, { cwd: tempDir, stdio: 'ignore' });

    // Add a remote so the pull block in completeWork is not skipped
    // (completeWork checks `runGit(['remote']).stdout` — empty means no remote, skip pull)
    realExecSync('git remote add origin https://example.com/fake.git', { cwd: tempDir, stdio: 'ignore' });
  }

  // @ana A004, A005, A006
  it('exits with code 1 on rebase conflict', async () => {
    await createMergedProject({ slug: 'conflict-test', phases: 1 });

    // Mock spawnSync to intercept `git pull --rebase` and return conflict stderr
    spawnMock.mockImplementation(((command: string, args?: readonly string[], options?: object) => {
      if (command === 'git' && args && Array.from(args).includes('pull')) {
        return {
          status: 128,
          stdout: '',
          stderr: 'CONFLICT (content): Merge conflict in file\ncould not apply abc1234',
          pid: 0,
          output: ['', '', 'CONFLICT (content): Merge conflict in file\ncould not apply abc1234'],
          signal: null,
        };
      }
      return realSpawnSync(command, args, options);
    }) as typeof realSpawnSync);

    try {
      await completeWork('conflict-test');
    } catch (e) {
      expect((e as Error).message).toBe('process.exit');
    }

    const exitCalls = mockExit.mock.calls;
    const output = errors.join('\n');

    // A004: process.exit(1) was called
    expect(exitCalls.length).toBeGreaterThan(0);
    expect(exitCalls[0]?.[0]).toBe(1);
    // A005: error message contains "conflict"
    expect(output.toLowerCase()).toContain('conflict');
    // A006: error message instructs user to resolve
    expect(output).toContain('Resolve conflicts and try again');
  });
});
