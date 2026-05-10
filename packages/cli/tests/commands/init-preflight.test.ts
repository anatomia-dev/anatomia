/**
 * Tests for validateInitPreconditions pipeline dependency checks.
 *
 * Separated from init.test.ts because mocking runGit and spawnSync
 * requires vi.mock at module level. These tests exercise the actual
 * validateInitPreconditions function with mocked git/gh commands.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Hoist mocks
const mockRunGit = vi.hoisted(() => vi.fn());
const mockSpawnSync = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/git-operations.js', () => ({
  runGit: mockRunGit,
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: mockSpawnSync,
  };
});

import { validateInitPreconditions } from '../../src/commands/init/preflight.js';

describe('validateInitPreconditions pipeline checks', () => {
  let tmpDir: string;
  let anaPath: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-preflight-test-'));
    anaPath = path.join(tmpDir, '.ana');

    // Create minimal project root indicators
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{}');
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Helper: set up a .git directory and configure runGit mock defaults.
   * Returns a happy-path configuration that individual tests can override.
   */
  async function setupGitDefaults(overrides?: {
    userName?: { exitCode: number; stdout: string };
    userEmail?: { exitCode: number; stdout: string };
    hasCommits?: boolean;
    hasRemote?: boolean;
  }): Promise<void> {
    await fs.mkdir(path.join(tmpDir, '.git'), { recursive: true });

    const defaults = {
      userName: { exitCode: 0, stdout: 'Test User', stderr: '' },
      userEmail: { exitCode: 0, stdout: 'test@example.com', stderr: '' },
      hasCommits: true,
      hasRemote: true,
      ...overrides,
    };

    mockRunGit.mockImplementation((args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--verify') {
        return { exitCode: defaults.hasCommits ? 0 : 1, stdout: defaults.hasCommits ? 'abc123' : '', stderr: '' };
      }
      if (args[0] === 'remote') {
        return { exitCode: 0, stdout: defaults.hasRemote ? 'origin' : '', stderr: '' };
      }
      if (args[0] === 'config' && args[1] === 'user.name') {
        return { ...defaults.userName, stderr: '' };
      }
      if (args[0] === 'config' && args[1] === 'user.email') {
        return { ...defaults.userEmail, stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });
  }

  // @ana A009
  it('warns when git user.name is not configured', async () => {
    await setupGitDefaults({
      userName: { exitCode: 1, stdout: '' },
    });
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'gh version 2.0', stderr: '' });

    const result = await validateInitPreconditions(tmpDir, anaPath, { yes: true });

    expect(result.warnings.some(w => w.includes('git config --global user.name'))).toBe(true);
  });

  // @ana A010
  it('warns when git user.email is not configured', async () => {
    await setupGitDefaults({
      userEmail: { exitCode: 1, stdout: '' },
    });
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'gh version 2.0', stderr: '' });

    const result = await validateInitPreconditions(tmpDir, anaPath, { yes: true });

    expect(result.warnings.some(w => w.includes('git config --global user.email'))).toBe(true);
  });

  // @ana A011
  it('skips git user checks when hasGit is false', async () => {
    // No .git directory — hasGit will be false
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'gh version 2.0', stderr: '' });

    const result = await validateInitPreconditions(tmpDir, anaPath, { force: true });

    expect(result.warnings.some(w => w.includes('user.name'))).toBe(false);
    expect(result.warnings.some(w => w.includes('user.email'))).toBe(false);
    // runGit should not have been called for user.name/email
    const userNameCalls = mockRunGit.mock.calls.filter(
      (args: string[][]) => args[0]?.[0] === 'config' && args[0]?.[1] === 'user.name'
    );
    expect(userNameCalls).toHaveLength(0);
  });

  // @ana A012
  it('warns when gh CLI is not installed', async () => {
    await setupGitDefaults();
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'command not found' });

    const result = await validateInitPreconditions(tmpDir, anaPath, { yes: true });

    expect(result.warnings.some(w => w.includes('The pipeline works without it through Build/Verify'))).toBe(true);
  });

  // @ana A013
  it('shows git remote add origin when no remote detected', async () => {
    await setupGitDefaults({ hasRemote: false });
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'gh version 2.0', stderr: '' });

    const result = await validateInitPreconditions(tmpDir, anaPath, { yes: true });

    // Check console output contains the suggestion
    const output = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('git remote add origin');

    // Also check warnings array
    expect(result.warnings.some(w => w.includes('git remote add origin'))).toBe(true);
  });

  // @ana A014
  it('returns warnings array in PreflightResult', async () => {
    await setupGitDefaults({
      userName: { exitCode: 1, stdout: '' },
    });
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: '' });

    const result = await validateInitPreconditions(tmpDir, anaPath, { yes: true });

    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // @ana A015
  it('all new checks are informational — canProceed remains true', async () => {
    await setupGitDefaults({
      userName: { exitCode: 1, stdout: '' },
      userEmail: { exitCode: 1, stdout: '' },
    });
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: '' });

    const result = await validateInitPreconditions(tmpDir, anaPath, { yes: true });

    // Even with all warnings, canProceed is true
    expect(result.canProceed).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(3); // user.name, user.email, gh
  });
});
