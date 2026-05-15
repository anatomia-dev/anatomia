/**
 * Tests for `ana work complete --merge` flag
 *
 * Separated from work.test.ts because mocking spawnSync requires vi.mock at module level,
 * which would affect all tests in the file. These tests mock node:child_process to intercept
 * gh CLI calls while passing git commands through.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
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

import { completeWork } from '../../src/commands/work.js';

describe('ana work complete --merge', () => {
  let tempDir: string;
  let originalCwd: string;
  let mockExit: ReturnType<typeof vi.spyOn>;
  let logs: string[];
  let errors: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'work-merge-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    logs = [];
    errors = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };
    console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };

    // Default: pass all spawnSync calls through to real implementation
    spawnMock.mockImplementation((...args: Parameters<typeof realSpawnSync>) => {
      return realSpawnSync(...args);
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    mockExit.mockRestore();
    console.log = originalLog;
    console.error = originalError;
    spawnMock.mockReset();
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Create a merged project scenario matching createMergedProject from work.test.ts
   */
  async function createMergedProject(slug: string): Promise<void> {
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
    await fs.writeFile(path.join(slugPath, 'plan.md'), '# Plan\n## Phases\n- [ ] Phase 1\n  Spec: spec.md\n', 'utf-8');
    await fs.writeFile(path.join(slugPath, 'spec.md'), '# Spec', 'utf-8');

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
  }

  function mockGh(handler: (args: string[]) => { status: number | null; stdout: string; stderr: string }) {
    spawnMock.mockImplementation(((command: string, args?: readonly string[], options?: object) => {
      if (command === 'gh') {
        return handler(args as string[]);
      }
      // Pass through to real spawnSync for git and everything else
      return realSpawnSync(command, args, options);
    }) as typeof realSpawnSync);
  }

  // @ana A001, A002, A003, A018
  it('merges PR and completes work item', async () => {
    await createMergedProject('test-slug');

    const ghCalls: string[][] = [];
    mockGh((args) => {
      ghCalls.push(args);
      if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'view' && args.includes('state,baseRefName')) {
        return { status: 0, stdout: JSON.stringify({ state: 'OPEN', baseRefName: 'main' }), stderr: '' };
      }
      if (args[0] === 'pr' && args[1] === 'merge') {
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    await completeWork('test-slug', { merge: true });

    const output = logs.join('\n');
    expect(output).toContain('PR merged.');

    // Verify no --squash, --delete-branch, or --admin in merge call
    const mergeCall = ghCalls.find(a => a[0] === 'pr' && a[1] === 'merge');
    expect(mergeCall).toBeDefined();
    expect(mergeCall).not.toContain('--squash');
    expect(mergeCall).not.toContain('--rebase');
    expect(mergeCall).not.toContain('--delete-branch');
    expect(mergeCall).not.toContain('--admin');

    // Completion happened
    const completedPath = path.join(tempDir, '.ana', 'plans', 'completed', 'test-slug');
    expect(fsSync.existsSync(completedPath)).toBe(true);
  });

  // @ana A005, A006
  it('shows branch protection guidance when checks are pending', async () => {
    await createMergedProject('test-slug');

    mockGh((args) => {
      if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'view' && args.includes('state,baseRefName')) {
        return { status: 0, stdout: JSON.stringify({ state: 'OPEN', baseRefName: 'main' }), stderr: '' };
      }
      if (args[0] === 'pr' && args[1] === 'merge') {
        return { status: 1, stdout: '', stderr: 'required status check "ci" is expected' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    await expect(completeWork('test-slug', { merge: true })).rejects.toThrow('process.exit');

    const output = errors.join('\n');
    expect(output).toContain('branch protection');
    expect(output).toContain('--auto');
    expect(output).toContain('--admin');
    expect(output).toContain('ana work complete test-slug');
  });

  // @ana A007
  it('shows branch protection guidance when policy prohibits merge', async () => {
    await createMergedProject('test-slug');

    mockGh((args) => {
      if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'view' && args.includes('state,baseRefName')) {
        return { status: 0, stdout: JSON.stringify({ state: 'OPEN', baseRefName: 'main' }), stderr: '' };
      }
      if (args[0] === 'pr' && args[1] === 'merge') {
        return { status: 1, stdout: '', stderr: 'Pull request is not mergeable: the base branch policy prohibits the merge.' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    await expect(completeWork('test-slug', { merge: true })).rejects.toThrow('process.exit');

    const output = errors.join('\n');
    expect(output).toContain('branch protection');
    expect(output).toContain('--auto');
    expect(output).toContain('--admin');
  });

  it('handles malformed gh pr view response', async () => {
    await createMergedProject('test-slug');

    mockGh((args) => {
      if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'view') {
        return { status: 0, stdout: 'not valid json', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    await expect(completeWork('test-slug', { merge: true })).rejects.toThrow('process.exit');

    const output = errors.join('\n');
    expect(output).toContain('Failed to parse');
  });

  // @ana A008, A009, A010
  it('shows rebase instructions when branch is behind', async () => {
    await createMergedProject('test-slug');

    mockGh((args) => {
      if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'view' && args.includes('state,baseRefName')) {
        return { status: 0, stdout: JSON.stringify({ state: 'OPEN', baseRefName: 'main' }), stderr: '' };
      }
      if (args[0] === 'pr' && args[1] === 'merge') {
        return { status: 1, stdout: '', stderr: 'the base branch is behind' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    await expect(completeWork('test-slug', { merge: true })).rejects.toThrow('process.exit');

    const output = errors.join('\n');
    expect(output).toContain('rebase');
    expect(output).toContain('--force-with-lease');
    expect(output).toContain('approvals');
  });

  // @ana A011
  it('skips merge when PR is already merged', async () => {
    await createMergedProject('test-slug');

    mockGh((args) => {
      if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'view' && args.includes('state,baseRefName')) {
        return { status: 0, stdout: JSON.stringify({ state: 'MERGED', baseRefName: 'main' }), stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    await completeWork('test-slug', { merge: true });

    const output = logs.join('\n');
    expect(output).toContain('already merged');

    const completedPath = path.join(tempDir, '.ana', 'plans', 'completed', 'test-slug');
    expect(fsSync.existsSync(completedPath)).toBe(true);
  });

  // @ana A012, A017
  it('exits when no PR exists', async () => {
    await createMergedProject('test-slug');

    mockGh((args) => {
      if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'view') {
        return { status: 1, stdout: '', stderr: 'no pull requests found' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    await expect(completeWork('test-slug', { merge: true })).rejects.toThrow('process.exit');

    const output = errors.join('\n');
    expect(output).toContain('ana pr create');

    // Completion should NOT have happened (no archive)
    const activePath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug');
    expect(fsSync.existsSync(activePath)).toBe(true);
  });

  // @ana A013
  it('reports multiple merge strategies', async () => {
    await createMergedProject('test-slug');

    mockGh((args) => {
      if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'view' && args.includes('state,baseRefName')) {
        return { status: 0, stdout: JSON.stringify({ state: 'OPEN', baseRefName: 'main' }), stderr: '' };
      }
      if (args[0] === 'pr' && args[1] === 'merge') {
        return { status: 1, stdout: '', stderr: 'multiple merge methods enabled: merge strategy required' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    await expect(completeWork('test-slug', { merge: true })).rejects.toThrow('process.exit');

    const output = errors.join('\n');
    expect(output).toContain('Merge manually');
  });

  // @ana A014
  it('shows raw stderr for unknown errors', async () => {
    await createMergedProject('test-slug');

    mockGh((args) => {
      if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'view' && args.includes('state,baseRefName')) {
        return { status: 0, stdout: JSON.stringify({ state: 'OPEN', baseRefName: 'main' }), stderr: '' };
      }
      if (args[0] === 'pr' && args[1] === 'merge') {
        return { status: 1, stdout: '', stderr: 'unexpected gh error text' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    await expect(completeWork('test-slug', { merge: true })).rejects.toThrow('process.exit');

    const output = errors.join('\n');
    expect(output).toContain('unexpected gh error text');
  });

  // @ana A015
  it('exits when base branch does not match artifact branch', async () => {
    await createMergedProject('test-slug');

    mockGh((args) => {
      if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'view' && args.includes('state,baseRefName')) {
        return { status: 0, stdout: JSON.stringify({ state: 'OPEN', baseRefName: 'develop' }), stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    await expect(completeWork('test-slug', { merge: true })).rejects.toThrow('process.exit');

    const output = errors.join('\n');
    expect(output).toContain('must target');
  });

  // @ana A016
  it('exits when gh is not installed', async () => {
    await createMergedProject('test-slug');

    mockGh(() => {
      return { status: 1, stdout: '', stderr: '' };
    });

    await expect(completeWork('test-slug', { merge: true })).rejects.toThrow('process.exit');

    const output = errors.join('\n');
    expect(output).toContain('https://cli.github.com/');
  });

  // @ana A001, A002, A003, A004, A007
  it('already-merged path with --json produces valid JSON', async () => {
    await createMergedProject('test-slug');

    mockGh((args) => {
      if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'view' && args.includes('state,baseRefName')) {
        return { status: 0, stdout: JSON.stringify({ state: 'MERGED', baseRefName: 'main' }), stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    await completeWork('test-slug', { json: true, merge: true });

    console.log = originalLog;
    const output = logs.join('\n');

    // Should be clean JSON — no human-readable text before the envelope
    const json = JSON.parse(output);
    expect(json.command).toBe('work complete');
    expect(json.results.slug).toBe('test-slug');
    expect(json.meta).toBeTypeOf('object');
    expect(output).not.toContain('already merged');
  });

  // @ana A005, A006, A008
  it('merge-succeeded path with --json produces valid JSON', async () => {
    await createMergedProject('test-slug');

    mockGh((args) => {
      if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'view' && args.includes('state,baseRefName')) {
        return { status: 0, stdout: JSON.stringify({ state: 'OPEN', baseRefName: 'main' }), stderr: '' };
      }
      if (args[0] === 'pr' && args[1] === 'merge') {
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    await completeWork('test-slug', { json: true, merge: true });

    console.log = originalLog;
    const output = logs.join('\n');

    // Should be clean JSON — no human-readable text before the envelope
    const json = JSON.parse(output);
    expect(json.command).toBe('work complete');
    expect(json.results.slug).toBe('test-slug');
    expect(json.meta).toBeTypeOf('object');
    expect(output).not.toContain('Merging PR');
    expect(output).not.toContain('PR merged');
  });
});
