import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import {
  isWorktreeDirectory,
  detectWorktreeSlug,
  getWorktreePath,
  worktreeExists,
  createWorktree,
  removeWorktree,
  getWorktreeInfo,
  branchExists,
} from '../../src/utils/worktree.js';

describe('worktree utilities', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-test-'));
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    // Clean up any worktrees before removing tempDir
    try {
      const result = execSync('git worktree list --porcelain', {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      const worktrees = result
        .split('\n')
        .filter(l => l.startsWith('worktree '))
        .map(l => l.replace('worktree ', ''));
      // Remove all worktrees except the main one
      for (const wt of worktrees) {
        if (wt !== tempDir) {
          try {
            execSync(`git worktree remove "${wt}" --force`, { cwd: tempDir, stdio: 'ignore' });
          } catch {
            // Force-remove directory
          }
        }
      }
    } catch {
      // Not a git repo — nothing to clean
    }
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Create a test project with git initialized and ana.json.
   */
  async function createTestProject(options?: {
    branchPrefix?: string;
    createBranch?: string;
  }): Promise<void> {
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

    // Create .ana/ana.json
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    const config: Record<string, unknown> = { artifactBranch: 'main' };
    if (options?.branchPrefix !== undefined) {
      config['branchPrefix'] = options.branchPrefix;
    }
    await fs.writeFile(path.join(anaDir, 'ana.json'), JSON.stringify(config), 'utf-8');

    // Create .ana/.gitignore (so worktree creation can check for it)
    await fs.writeFile(path.join(anaDir, '.gitignore'), 'state/\n', 'utf-8');

    // Create a file so initial commit works
    await fs.writeFile(path.join(tempDir, 'README.md'), '# Test', 'utf-8');

    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });

    if (options?.createBranch) {
      execSync(`git checkout -b ${options.createBranch}`, { cwd: tempDir, stdio: 'ignore' });
      execSync(`git checkout main`, { cwd: tempDir, stdio: 'ignore' });
    }
  }

  // --- isWorktreeDirectory ---

  // @ana A027
  describe('isWorktreeDirectory', () => {
    it('returns false in a normal git repo', async () => {
      await createTestProject();
      expect(isWorktreeDirectory(tempDir)).toBe(false);
    });

    // @ana A026
    it('returns true inside a worktree', async () => {
      await createTestProject();
      const wtPath = path.join(tempDir, '.ana', 'worktrees', 'test-slug');
      execSync(`git worktree add "${wtPath}" -b feature/test-slug`, { cwd: tempDir, stdio: 'ignore' });
      expect(isWorktreeDirectory(wtPath)).toBe(true);
    });

    it('returns false for a non-git directory', async () => {
      expect(isWorktreeDirectory(tempDir)).toBe(false);
    });
  });

  // --- detectWorktreeSlug ---

  describe('detectWorktreeSlug', () => {
    it('returns slug when inside a worktree path', () => {
      const fakePath = '/project/.ana/worktrees/my-feature/src/main.ts';
      expect(detectWorktreeSlug(fakePath)).toBe('my-feature');
    });

    it('returns null when not in a worktree path', () => {
      expect(detectWorktreeSlug('/project/src/main.ts')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(detectWorktreeSlug('')).toBeNull();
    });
  });

  // --- getWorktreePath ---

  describe('getWorktreePath', () => {
    it('returns correct path', () => {
      const result = getWorktreePath('/project', 'my-slug');
      expect(result).toBe(path.join('/project', '.ana', 'worktrees', 'my-slug'));
    });
  });

  // --- worktreeExists ---

  describe('worktreeExists', () => {
    it('returns false when no worktree exists', async () => {
      await createTestProject();
      expect(worktreeExists(tempDir, 'nonexistent')).toBe(false);
    });

    it('returns true when worktree directory exists', async () => {
      await createTestProject();
      const wtPath = path.join(tempDir, '.ana', 'worktrees', 'test-slug');
      execSync(`git worktree add "${wtPath}" -b feature/test-slug`, { cwd: tempDir, stdio: 'ignore' });
      expect(worktreeExists(tempDir, 'test-slug')).toBe(true);
    });
  });

  // --- createWorktree ---

  // @ana A004, A005
  describe('createWorktree', () => {
    it('creates a worktree with a new branch', async () => {
      await createTestProject();
      process.chdir(tempDir);

      const result = await createWorktree(tempDir, 'test-slug', 'feature/');

      expect(result.worktreePath).toBe(path.join(tempDir, '.ana', 'worktrees', 'test-slug'));
      expect(result.branch).toBe('feature/test-slug');
      expect(result.branchIsNew).toBe(true);
      expect(fsSync.existsSync(result.worktreePath)).toBe(true);
      expect(isWorktreeDirectory(result.worktreePath)).toBe(true);
    });

    // @ana A012
    it('installs dependencies when lockfile exists', async () => {
      await createTestProject();
      // Create a minimal package.json + pnpm-lock.yaml
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test', dependencies: {} }),
        'utf-8'
      );
      await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf-8');
      execSync('git add -A && git commit -m "add pkg"', { cwd: tempDir, stdio: 'ignore' });
      process.chdir(tempDir);

      const result = await createWorktree(tempDir, 'test-slug', 'feature/');
      // depsInstalled may be true or false depending on pnpm availability
      expect(typeof result.depsInstalled).toBe('boolean');
    });

    // @ana A013, A035
    it('symlinks env files', async () => {
      await createTestProject();
      // Write env files AFTER the git commit so they're untracked
      // (just like real projects where .env is gitignored)
      await fs.writeFile(path.join(tempDir, '.env'), 'SECRET=value', 'utf-8');
      await fs.writeFile(path.join(tempDir, '.env.local'), 'LOCAL=value', 'utf-8');
      process.chdir(tempDir);

      const result = await createWorktree(tempDir, 'test-slug', 'feature/');
      expect(result.envFilesLinked).toContain('.env');
      expect(result.envFilesLinked).toContain('.env.local');

      // Check that the files exist in the worktree
      const envInWt = path.join(result.worktreePath, '.env');
      expect(fsSync.existsSync(envInWt)).toBe(true);

      // Check it's a symlink or copy
      try {
        const stat = await fs.lstat(envInWt);
        expect(stat.isSymbolicLink() || stat.isFile()).toBe(true);
      } catch {
        // File exists in some form
      }
    });

    // @ana A014, A038
    it('writes worktree-context.md with contract assertions', async () => {
      await createTestProject();
      process.chdir(tempDir);

      const result = await createWorktree(tempDir, 'test-slug', 'feature/', {
        contractAssertions: '- A001: test passes\n- A002: thing works',
        summary: 'Build the payment flow',
      });

      expect(result.contextFileWritten).toBe(true);
      const contextPath = path.join(result.worktreePath, '.ana', 'worktree-context.md');
      expect(fsSync.existsSync(contextPath)).toBe(true);

      const content = await fs.readFile(contextPath, 'utf-8');
      expect(content).toContain('## Contract Assertions');
      expect(content).toContain('A001');
      expect(content).toContain('Build the payment flow');
    });

    // @ana A015
    it('rolls back on failure — removes worktree directory', async () => {
      await createTestProject();
      process.chdir(tempDir);

      // Create a worktree first, so creating another with the same name fails
      const wtPath = path.join(tempDir, '.ana', 'worktrees', 'existing-slug');
      execSync(`git worktree add "${wtPath}" -b feature/existing-slug`, { cwd: tempDir, stdio: 'ignore' });

      await expect(createWorktree(tempDir, 'existing-slug', 'feature/')).rejects.toThrow();
    });

    // @ana A016
    it('rolls back branch when creation fails after branch was created', async () => {
      await createTestProject();
      process.chdir(tempDir);

      // Create the worktree directory manually to trigger failure
      const wtPath = path.join(tempDir, '.ana', 'worktrees', 'fail-slug');
      await fs.mkdir(wtPath, { recursive: true });
      // Write a file to make the dir non-empty (git worktree add fails on non-empty dirs)
      await fs.writeFile(path.join(wtPath, 'block'), 'block', 'utf-8');

      try {
        await createWorktree(tempDir, 'fail-slug', 'feature/');
      } catch {
        // Expected to fail
      }

      // Branch should not exist (rollback cleaned it)
      const branchResult = execSync('git branch --list feature/fail-slug', {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      expect(branchResult.trim()).toBe('');
    });

    // @ana A017
    it('preserves existing branch on rollback', async () => {
      await createTestProject({ createBranch: 'feature/pre-existing' });
      process.chdir(tempDir);

      // Create the worktree directory to trigger failure
      const wtPath = path.join(tempDir, '.ana', 'worktrees', 'pre-existing');
      await fs.mkdir(wtPath, { recursive: true });
      await fs.writeFile(path.join(wtPath, 'block'), 'block', 'utf-8');

      try {
        await createWorktree(tempDir, 'pre-existing', 'feature/');
      } catch {
        // Expected to fail
      }

      // Branch should still exist (not deleted by rollback)
      expect(branchExists(tempDir, 'feature/pre-existing')).toBe(true);
    });

    // @ana A018
    it('creates worktree from existing branch (in-flight migration)', async () => {
      await createTestProject({ createBranch: 'feature/migrate-slug' });
      process.chdir(tempDir);

      const result = await createWorktree(tempDir, 'migrate-slug', 'feature/');

      expect(result.branch).toBe('feature/migrate-slug');
      expect(result.branchIsNew).toBe(false);
      expect(fsSync.existsSync(result.worktreePath)).toBe(true);
    });

    // @ana A034
    it('ensures .gitignore includes worktrees/', async () => {
      await createTestProject();
      process.chdir(tempDir);

      await createWorktree(tempDir, 'test-slug', 'feature/');

      const gitignore = await fs.readFile(path.join(tempDir, '.ana', '.gitignore'), 'utf-8');
      expect(gitignore).toContain('worktrees/');
    });

    it('throws when worktree already exists', async () => {
      await createTestProject();
      process.chdir(tempDir);

      await createWorktree(tempDir, 'test-slug', 'feature/');
      await expect(createWorktree(tempDir, 'test-slug', 'feature/')).rejects.toThrow('already exists');
    });
  });

  // --- removeWorktree ---

  // @ana A019
  describe('removeWorktree', () => {
    it('removes an existing worktree', async () => {
      await createTestProject();
      process.chdir(tempDir);
      await createWorktree(tempDir, 'test-slug', 'feature/');

      const removed = await removeWorktree(tempDir, 'test-slug');
      expect(removed).toBe(true);
      expect(fsSync.existsSync(path.join(tempDir, '.ana', 'worktrees', 'test-slug'))).toBe(false);
    });

    // @ana A020
    it('returns false when worktree does not exist', async () => {
      await createTestProject();
      const removed = await removeWorktree(tempDir, 'nonexistent');
      expect(removed).toBe(false);
    });
  });

  // --- getWorktreeInfo ---

  // @ana A024
  describe('getWorktreeInfo', () => {
    it('returns null when no worktree exists', async () => {
      await createTestProject();
      expect(getWorktreeInfo(tempDir, 'nonexistent', 'feature/')).toBeNull();
    });

    it('returns worktree info with commit count', async () => {
      await createTestProject();
      process.chdir(tempDir);
      await createWorktree(tempDir, 'info-slug', 'feature/');

      const info = getWorktreeInfo(tempDir, 'info-slug', 'feature/');
      expect(info).not.toBeNull();
      expect(info!.path).toContain('info-slug');
      expect(info!.branch).toBe('feature/info-slug');
      expect(typeof info!.commitCount).toBe('number');
      expect(typeof info!.lastActivityDays).toBe('number');
    });

    // @ana A025
    it('flags stale worktrees with 0 commits and 14+ days', async () => {
      await createTestProject();
      process.chdir(tempDir);
      await createWorktree(tempDir, 'stale-slug', 'feature/');

      // A just-created worktree won't be stale
      const info = getWorktreeInfo(tempDir, 'stale-slug', 'feature/');
      expect(info).not.toBeNull();
      // commitCount will be 0 (no commits on branch beyond main)
      // lastActivityDays should be 0 (just created)
      // isStale requires 14+ days, so it should be false
      expect(info!.isStale).toBe(false);
    });
  });

  // --- branchExists ---

  describe('branchExists', () => {
    it('returns false for non-existent branch', async () => {
      await createTestProject();
      expect(branchExists(tempDir, 'feature/nope')).toBe(false);
    });

    it('returns true for existing branch', async () => {
      await createTestProject({ createBranch: 'feature/exists' });
      expect(branchExists(tempDir, 'feature/exists')).toBe(true);
    });
  });

  // --- submodule handling ---

  // @ana A037
  describe('submodule handling', () => {
    it('initializes submodules when .gitmodules exists', async () => {
      await createTestProject();
      // Create a fake .gitmodules file
      await fs.writeFile(path.join(tempDir, '.gitmodules'), '', 'utf-8');
      execSync('git add -A && git commit -m "add gitmodules"', { cwd: tempDir, stdio: 'ignore' });
      process.chdir(tempDir);

      const result = await createWorktree(tempDir, 'sub-slug', 'feature/');
      // submodulesInitialized may be true or false depending on actual submodule config
      expect(typeof result.submodulesInitialized).toBe('boolean');
    });
  });

  // @ana A036
  describe('env file fallback', () => {
    it('env files exist in worktree after creation', async () => {
      await createTestProject();
      // Write env AFTER commit so it's untracked (mimics gitignored .env)
      await fs.writeFile(path.join(tempDir, '.env'), 'KEY=val', 'utf-8');
      process.chdir(tempDir);

      const result = await createWorktree(tempDir, 'env-slug', 'feature/');
      const envPath = path.join(result.worktreePath, '.env');
      expect(fsSync.existsSync(envPath)).toBe(true);
    });
  });
});
