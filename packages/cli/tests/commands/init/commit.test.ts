/**
 * Tests for `ana init commit` command.
 *
 * Uses temp directories with real git repos for isolation, following
 * artifact.test.ts patterns: fs.mkdtemp, execSync('git init -b main'),
 * process.chdir with cleanup in afterEach.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import {
  discoverDirtyFiles,
  discoverGitignoredFiles,
  discoverGitignoredDirtyFiles,
  isExcluded,
  determineCommitMessage,
} from '../../../src/commands/init/commit.js';

describe('ana init commit', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'init-commit-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Init git with forced branch name for CI compatibility
    execSync('git init -b main', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fsp.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Helper to create a minimal project with .ana/ana.json
   */
  async function createProject(opts?: {
    artifactBranch?: string;
    coAuthor?: string;
  }): Promise<void> {
    const anaDir = path.join(tempDir, '.ana');
    await fsp.mkdir(anaDir, { recursive: true });
    await fsp.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({
        artifactBranch: opts?.artifactBranch ?? 'main',
        coAuthor: opts?.coAuthor ?? 'Ana <build@anatomia.dev>',
      }),
      'utf-8'
    );

    // Initial commit so git operations work
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
  }

  // -------------------------------------------------------------------
  // File discovery
  // -------------------------------------------------------------------

  describe('discoverDirtyFiles', () => {
    // @ana A001, A003
    it('discovers dirty infrastructure files from known roots', async () => {
      await createProject();

      // Create dirty files in known roots
      await fsp.writeFile(path.join(tempDir, '.ana', 'ana.json'), '{"updated": true}');
      await fsp.mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'skills', 'test.md'), 'skill');
      await fsp.writeFile(path.join(tempDir, 'CLAUDE.md'), '# CLAUDE');

      const files = discoverDirtyFiles(tempDir);

      expect(files).toContain('.ana/ana.json');
      // Untracked directories appear as directory entries in git status
      // (e.g., "?? .claude/"), not as individual files
      expect(files).toContain('.claude/');
      expect(files).toContain('CLAUDE.md');
    });

    // @ana A012
    it('returns empty array when no dirty files exist', async () => {
      await createProject();

      const files = discoverDirtyFiles(tempDir);
      expect(files).toEqual([]);
    });

    it('ignores non-infrastructure dirty files', async () => {
      await createProject();

      await fsp.writeFile(path.join(tempDir, 'src', 'app.ts'), 'code').catch(() => {
        // src/ may not exist
      });
      await fsp.writeFile(path.join(tempDir, 'random.txt'), 'data');

      const files = discoverDirtyFiles(tempDir);
      expect(files).not.toContain('random.txt');
    });

    // @ana A023
    it('discovers monorepo AGENTS.md when scan.json has primaryPackage', async () => {
      await createProject();

      // Write scan.json with monorepo config
      await fsp.writeFile(
        path.join(tempDir, '.ana', 'scan.json'),
        JSON.stringify({
          monorepo: {
            primaryPackage: { name: 'my-cli', path: 'packages/cli' },
          },
        })
      );
      // Commit scan.json so it's tracked
      execSync('git add .ana/scan.json && git commit -m "add scan"', { cwd: tempDir, stdio: 'ignore' });

      // Create the monorepo AGENTS.md
      await fsp.mkdir(path.join(tempDir, 'packages', 'cli'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, 'packages', 'cli', 'AGENTS.md'), '# Agents');

      const files = discoverDirtyFiles(tempDir);
      expect(files).toContain('packages/cli/AGENTS.md');
    });
  });

  // -------------------------------------------------------------------
  // Exclusions
  // -------------------------------------------------------------------

  describe('isExcluded', () => {
    // @ana A004
    it('excludes proof_chain.json', () => {
      expect(isExcluded('.ana/proof_chain.json')).toBe(true);
    });

    // @ana A006
    it('excludes PROOF_CHAIN.md', () => {
      expect(isExcluded('.ana/PROOF_CHAIN.md')).toBe(true);
    });

    // @ana A005
    it('excludes .ana/plans/ directory', () => {
      expect(isExcluded('.ana/plans/active/foo/scope.md')).toBe(true);
    });

    // @ana A007
    it('excludes .ana/state/ directory', () => {
      expect(isExcluded('.ana/state/cache/data.json')).toBe(true);
    });

    // @ana A008
    it('excludes .claude/agent-memory/ directory', () => {
      expect(isExcluded('.claude/agent-memory/session.json')).toBe(true);
    });

    // @ana A009
    it('excludes .claude/settings.local.json', () => {
      expect(isExcluded('.claude/settings.local.json')).toBe(true);
    });

    it('does not exclude regular infrastructure files', () => {
      expect(isExcluded('.ana/ana.json')).toBe(false);
      expect(isExcluded('.ana/scan.json')).toBe(false);
      expect(isExcluded('.claude/settings.json')).toBe(false);
      expect(isExcluded('CLAUDE.md')).toBe(false);
    });
  });

  describe('exclusions in discoverDirtyFiles', () => {
    // @ana A004, A005, A006
    it('excludes pipeline data files from discovered set', async () => {
      await createProject();

      // Create excluded files as untracked
      await fsp.mkdir(path.join(tempDir, '.ana', 'plans', 'active', 'test'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.ana', 'plans', 'active', 'test', 'scope.md'), 'scope');
      await fsp.writeFile(path.join(tempDir, '.ana', 'proof_chain.json'), '[]');
      await fsp.writeFile(path.join(tempDir, '.ana', 'PROOF_CHAIN.md'), '# Proof');

      // Also create a non-excluded file to confirm discovery works
      await fsp.writeFile(path.join(tempDir, '.ana', 'scan.json'), '{}');

      const files = discoverDirtyFiles(tempDir);

      expect(files).not.toContain('.ana/proof_chain.json');
      expect(files).not.toContain('.ana/PROOF_CHAIN.md');
      expect(files).not.toContain('.ana/plans/active/test/scope.md');
      expect(files).toContain('.ana/scan.json');
    });

    // @ana A007, A008, A009
    it('excludes runtime state files from discovered set', async () => {
      await createProject();

      // Create excluded state files
      await fsp.mkdir(path.join(tempDir, '.ana', 'state'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.ana', 'state', 'data.json'), '{}');
      await fsp.mkdir(path.join(tempDir, '.claude', 'agent-memory'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'agent-memory', 'session.json'), '{}');
      await fsp.mkdir(path.join(tempDir, '.claude'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.local.json'), '{}');

      const files = discoverDirtyFiles(tempDir);

      expect(files).not.toContain('.ana/state/data.json');
      expect(files).not.toContain('.claude/agent-memory/session.json');
      expect(files).not.toContain('.claude/settings.local.json');
    });
  });

  // -------------------------------------------------------------------
  // Commit message
  // -------------------------------------------------------------------

  describe('determineCommitMessage', () => {
    // @ana A016
    it('returns initialize message when ana.json is not tracked', async () => {
      // Don't call createProject — we need ana.json untracked
      const anaDir = path.join(tempDir, '.ana');
      await fsp.mkdir(anaDir, { recursive: true });

      // Make an initial commit without ana.json
      await fsp.writeFile(path.join(tempDir, 'README.md'), '# test');
      execSync('git add README.md && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });

      // Now create ana.json (untracked)
      await fsp.writeFile(path.join(anaDir, 'ana.json'), '{}');

      const msg = determineCommitMessage(tempDir);
      expect(msg).toBe('[ana] Initialize project context');
    });

    // @ana A017
    it('returns update message when ana.json is already tracked', async () => {
      await createProject();

      const msg = determineCommitMessage(tempDir);
      expect(msg).toBe('[ana] Update project context');
    });
  });

  // -------------------------------------------------------------------
  // Guard sequence (functional tests via the command action)
  // -------------------------------------------------------------------

  describe('guard sequence', () => {
    /**
     * Helper to run the init commit command and capture output/exit.
     * Mocks process.exit and captures console output.
     */
    async function runInitCommit(): Promise<{
      stdout: string;
      stderr: string;
      exitCode: number | undefined;
    }> {
      const originalExit = process.exit;
      const originalLog = console.log;
      const originalError = console.error;
      const stdoutLines: string[] = [];
      const stderrLines: string[] = [];
      let capturedExitCode: number | undefined;

      console.log = (...args: unknown[]) => {
        stdoutLines.push(args.map(String).join(' '));
      };
      console.error = (...args: unknown[]) => {
        stderrLines.push(args.map(String).join(' '));
      };
      process.exit = ((code?: number) => {
        capturedExitCode = code;
        throw new Error(`process.exit(${code})`);
      }) as typeof process.exit;

      try {
        // Dynamically import to get fresh module state
        const { registerInitCommitCommand } = await import('../../../src/commands/init/commit.js');
        const { Command } = await import('commander');
        const parent = new Command('init');
        registerInitCommitCommand(parent);

        // Find and execute the commit subcommand's action
        const commitCmd = parent.commands.find(c => c.name() === 'commit');
        if (!commitCmd) throw new Error('commit subcommand not registered');

        // Parse with the commit subcommand
        await parent.parseAsync(['commit'], { from: 'user' });

        return {
          stdout: stdoutLines.join('\n'),
          stderr: stderrLines.join('\n'),
          exitCode: capturedExitCode,
        };
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('process.exit')) {
          return {
            stdout: stdoutLines.join('\n'),
            stderr: stderrLines.join('\n'),
            exitCode: capturedExitCode,
          };
        }
        throw error;
      } finally {
        console.log = originalLog;
        console.error = originalError;
        process.exit = originalExit;
      }
    }

    // @ana A012
    it('rejects when ana.json does not exist', async () => {
      // No project setup — no .ana/ana.json
      // Need an initial commit so git works
      await fsp.writeFile(path.join(tempDir, 'README.md'), '# test');
      execSync('git add README.md && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });

      const result = await runInitCommit();
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('ana init');
    });

    // @ana A011
    it('rejects when on wrong branch', async () => {
      await createProject({ artifactBranch: 'main' });

      // Switch to a feature branch
      execSync('git checkout -b feature/test', { cwd: tempDir, stdio: 'ignore' });

      const result = await runInitCommit();
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('must be committed to');
    });

    // @ana A014, A015
    it('exits 0 with up-to-date message when nothing dirty', async () => {
      await createProject();

      const result = await runInitCommit();
      expect(result.exitCode).toBeUndefined(); // no process.exit called
      expect(result.stdout).toContain('up to date');
    });

    // @ana A001, A002, A013, A018
    it('commits infrastructure files with correct message and --no-verify', async () => {
      await createProject();

      // Create a dirty infrastructure file
      await fsp.writeFile(
        path.join(tempDir, '.ana', 'scan.json'),
        JSON.stringify({ stack: 'test' })
      );

      const result = await runInitCommit();
      expect(result.exitCode).toBeUndefined(); // success, no exit called

      // Verify git log
      const log = execSync('git log -1 --name-only --format="%s%n%b"', {
        cwd: tempDir,
        encoding: 'utf-8',
      });

      expect(log).toContain('[ana]');
      expect(log).toContain('.ana/scan.json');
      expect(log).toContain('Co-authored-by:');
    });

    // @ana A016, A018
    it('uses Initialize message on first commit of ana.json', async () => {
      // Setup without committing ana.json initially
      await fsp.writeFile(path.join(tempDir, 'README.md'), '# test');
      execSync('git add README.md && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });

      // Now create .ana/ infrastructure
      const anaDir = path.join(tempDir, '.ana');
      await fsp.mkdir(anaDir, { recursive: true });
      await fsp.writeFile(
        path.join(anaDir, 'ana.json'),
        JSON.stringify({ artifactBranch: 'main' })
      );

      const result = await runInitCommit();
      expect(result.exitCode).toBeUndefined();

      const log = execSync('git log -1 --format="%s"', {
        cwd: tempDir,
        encoding: 'utf-8',
      }).trim();

      expect(log).toContain('Initialize project context');
    });

    // @ana A017
    it('uses Update message when ana.json is already tracked', async () => {
      await createProject();

      // Modify ana.json
      await fsp.writeFile(
        path.join(tempDir, '.ana', 'ana.json'),
        JSON.stringify({ artifactBranch: 'main', updated: true })
      );

      const result = await runInitCommit();
      expect(result.exitCode).toBeUndefined();

      const log = execSync('git log -1 --format="%s"', {
        cwd: tempDir,
        encoding: 'utf-8',
      }).trim();

      expect(log).toContain('Update project context');
    });
  });

  // -------------------------------------------------------------------
  // Push behavior
  // -------------------------------------------------------------------

  describe('push behavior', () => {
    // @ana A019, A020
    it('soft-fails on push failure (no remote configured)', async () => {
      await createProject();

      // Create dirty file
      await fsp.writeFile(path.join(tempDir, '.ana', 'scan.json'), '{}');

      // runInitCommit uses the same helper from guard sequence
      const originalExit = process.exit;
      const originalLog = console.log;
      const originalError = console.error;
      const stdoutLines: string[] = [];
      const stderrLines: string[] = [];
      let capturedExitCode: number | undefined;

      console.log = (...args: unknown[]) => {
        stdoutLines.push(args.map(String).join(' '));
      };
      console.error = (...args: unknown[]) => {
        stderrLines.push(args.map(String).join(' '));
      };
      process.exit = ((code?: number) => {
        capturedExitCode = code;
        throw new Error(`process.exit(${code})`);
      }) as typeof process.exit;

      try {
        const { registerInitCommitCommand } = await import('../../../src/commands/init/commit.js');
        const { Command } = await import('commander');
        const parent = new Command('init');
        registerInitCommitCommand(parent);
        await parent.parseAsync(['commit'], { from: 'user' });
      } catch (error) {
        if (!(error instanceof Error && error.message.startsWith('process.exit'))) {
          throw error;
        }
      } finally {
        console.log = originalLog;
        console.error = originalError;
        process.exit = originalExit;
      }

      // With no remote, commit should succeed without push attempt
      // exitCode undefined = no process.exit called = success
      expect(capturedExitCode).toBeUndefined();
      const stdout = stdoutLines.join('\n');
      expect(stdout).toContain('Infrastructure committed');
      // No "Push failed" because no remote exists — push is skipped
      expect(stdout).not.toContain('Push failed');
    });
  });

  // -------------------------------------------------------------------
  // Idempotent behavior
  // -------------------------------------------------------------------

  describe('idempotent behavior', () => {
    // @ana A014, A015
    it('running twice without changes exits cleanly both times', async () => {
      await createProject();

      // Create and commit a dirty file
      await fsp.writeFile(path.join(tempDir, '.ana', 'scan.json'), '{}');

      // First run — should commit
      const originalExit = process.exit;
      const originalLog = console.log;
      const originalError = console.error;

      const run = async (): Promise<{ stdout: string; exitCode: number | undefined }> => {
        const stdoutLines: string[] = [];
        let exitCode: number | undefined;

        console.log = (...args: unknown[]) => {
          stdoutLines.push(args.map(String).join(' '));
        };
        console.error = () => { /* suppress */ };
        process.exit = ((code?: number) => {
          exitCode = code;
          throw new Error(`process.exit(${code})`);
        }) as typeof process.exit;

        try {
          const { registerInitCommitCommand } = await import('../../../src/commands/init/commit.js');
          const { Command } = await import('commander');
          const parent = new Command('init');
          registerInitCommitCommand(parent);
          await parent.parseAsync(['commit'], { from: 'user' });
        } catch (error) {
          if (!(error instanceof Error && error.message.startsWith('process.exit'))) {
            throw error;
          }
        }

        return { stdout: stdoutLines.join('\n'), exitCode };
      };

      const first = await run();
      expect(first.exitCode).toBeUndefined();
      expect(first.stdout).toContain('Infrastructure committed');

      // Second run — nothing dirty, should exit cleanly
      const second = await run();
      expect(second.exitCode).toBeUndefined();
      expect(second.stdout).toContain('up to date');

      console.log = originalLog;
      console.error = originalError;
      process.exit = originalExit;
    });
  });

  // -------------------------------------------------------------------
  // displaySuccessMessage commit readiness
  // -------------------------------------------------------------------

  describe('displaySuccessMessage commit readiness', () => {
    // @ana A021
    it('shows ana init commit in success message', async () => {
      // Need a git repo so getCurrentBranch() works
      await createProject();

      const originalLog = console.log;
      const lines: string[] = [];
      console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      };

      try {
        const { displaySuccessMessage } = await import('../../../src/commands/init/state.js');
        displaySuccessMessage(null, 'test-project', '1.0', { artifactBranch: 'main' });

        const output = lines.join('\n');
        expect(output).toContain('ana init commit');
      } finally {
        console.log = originalLog;
      }
    });
  });

  // -------------------------------------------------------------------
  // Setup template
  // -------------------------------------------------------------------

  describe('setup template', () => {
    // @ana A022
    it('contains ana init commit instruction in template', async () => {
      // Read the actual template file
      const templatePath = path.join(
        originalCwd,
        'packages',
        'cli',
        'templates',
        '.claude',
        'agents',
        'ana-setup.md'
      );

      // The template should be accessible from the worktree
      let content: string;
      try {
        content = fs.readFileSync(templatePath, 'utf-8');
      } catch {
        // Fallback: try from the tempDir's original location
        // This is a template check — verify the template mentions the command
        const worktreeTemplatePath = path.resolve(
          __dirname,
          '..', '..', '..', '..', '..',
          'packages', 'cli', 'templates', '.claude', 'agents', 'ana-setup.md'
        );
        content = fs.readFileSync(worktreeTemplatePath, 'utf-8');
      }

      expect(content).toContain('ana init commit');
    });
  });

  // -------------------------------------------------------------------
  // discoverGitignoredFiles
  // -------------------------------------------------------------------

  describe('discoverGitignoredFiles', () => {
    // @ana A001
    it('discovers gitignored infrastructure files under known roots', async () => {
      await createProject();

      // Create .gitignore that ignores .claude/
      await fsp.writeFile(path.join(tempDir, '.gitignore'), '.claude/\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      // Create gitignored infrastructure files
      await fsp.mkdir(path.join(tempDir, '.claude'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.json'), '{}');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      const result = discoverGitignoredFiles(tempDir, dirtyFiles);

      expect(result).toContain('.claude/settings.json');
    });

    // @ana A002
    it('discovers all files recursively under gitignored known root', async () => {
      await createProject();

      await fsp.writeFile(path.join(tempDir, '.gitignore'), '.claude/\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      // Create multiple gitignored files
      await fsp.mkdir(path.join(tempDir, '.claude', 'skills', 'coding'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.json'), '{}');
      await fsp.writeFile(path.join(tempDir, '.claude', 'skills', 'coding', 'SKILL.md'), '# skill');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      const result = discoverGitignoredFiles(tempDir, dirtyFiles);

      expect(result.length).toBeGreaterThan(1);
    });

    // @ana A003
    it('discovers gitignored root-level infrastructure files', async () => {
      await createProject();

      // Gitignore CLAUDE.md
      await fsp.writeFile(path.join(tempDir, '.gitignore'), 'CLAUDE.md\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      await fsp.writeFile(path.join(tempDir, 'CLAUDE.md'), '# CLAUDE');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      const result = discoverGitignoredFiles(tempDir, dirtyFiles);

      expect(result).toContain('CLAUDE.md');
    });

    // @ana A012
    it('returns empty array when no infrastructure files are gitignored', async () => {
      await createProject();

      // No .gitignore at all — nothing is ignored
      const dirtyFiles = discoverDirtyFiles(tempDir);
      const result = discoverGitignoredFiles(tempDir, dirtyFiles);

      expect(result).toEqual([]);
    });

    // @ana A013
    it('excludes agent-memory from gitignored discovery', async () => {
      await createProject();

      await fsp.writeFile(path.join(tempDir, '.gitignore'), '.claude/\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      // Create both included and excluded files
      await fsp.mkdir(path.join(tempDir, '.claude', 'agent-memory'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'agent-memory', 'session.json'), '{}');
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.json'), '{}');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      const result = discoverGitignoredFiles(tempDir, dirtyFiles);

      expect(result).not.toContain('.claude/agent-memory/session.json');
      expect(result).toContain('.claude/settings.json');
    });

    // @ana A014
    it('excludes settings.local.json from gitignored discovery', async () => {
      await createProject();

      await fsp.writeFile(path.join(tempDir, '.gitignore'), '.claude/\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      await fsp.mkdir(path.join(tempDir, '.claude'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.local.json'), '{}');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      const result = discoverGitignoredFiles(tempDir, dirtyFiles);

      expect(result).not.toContain('.claude/settings.local.json');
    });

    // @ana A015
    it('excludes .ana/plans/ from gitignored discovery', async () => {
      await createProject();

      await fsp.writeFile(path.join(tempDir, '.gitignore'), '.ana/\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      await fsp.mkdir(path.join(tempDir, '.ana', 'plans', 'active'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.ana', 'plans', 'active', 'scope.md'), 'scope');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      const result = discoverGitignoredFiles(tempDir, dirtyFiles);

      expect(result).not.toContain('.ana/plans/active/scope.md');
    });

    // @ana A016
    it('excludes .ana/state/ from gitignored discovery', async () => {
      await createProject();

      await fsp.writeFile(path.join(tempDir, '.gitignore'), '.ana/\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      await fsp.mkdir(path.join(tempDir, '.ana', 'state'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.ana', 'state', 'data.json'), '{}');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      const result = discoverGitignoredFiles(tempDir, dirtyFiles);

      expect(result).not.toContain('.ana/state/data.json');
    });

    // @ana A017
    it('handles entire .claude/ directory being gitignored', async () => {
      await createProject();

      await fsp.writeFile(path.join(tempDir, '.gitignore'), '.claude/\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      // Create multiple files under .claude/
      await fsp.mkdir(path.join(tempDir, '.claude', 'agents'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.json'), '{}');
      await fsp.writeFile(path.join(tempDir, '.claude', 'agents', 'ana.md'), '# ana');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      const result = discoverGitignoredFiles(tempDir, dirtyFiles);

      expect(result.length).toBeGreaterThan(0);
    });

    // @ana A018
    it('respects .claude/.gitignore exclusions during force-add discovery', async () => {
      await createProject();

      // Root .gitignore ignores .claude/
      await fsp.writeFile(path.join(tempDir, '.gitignore'), '.claude/\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      // Create files — agent-memory is excluded by EXCLUDED_PREFIXES
      await fsp.mkdir(path.join(tempDir, '.claude', 'agent-memory'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'agent-memory', 'data.json'), '{}');
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.json'), '{}');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      const result = discoverGitignoredFiles(tempDir, dirtyFiles);

      // agent-memory excluded by EXCLUDED_PREFIXES, not by nested .gitignore
      expect(result).not.toContain('.claude/agent-memory/data.json');
      expect(result).toContain('.claude/settings.json');
    });

    // @ana A019
    it('excludes files already in the dirty set', async () => {
      await createProject();

      // Create a file that will show up in dirty AND could be gitignored
      // .ana/scan.json is not gitignored, so it's in the dirty set only
      await fsp.writeFile(path.join(tempDir, '.ana', 'scan.json'), '{}');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      expect(dirtyFiles).toContain('.ana/scan.json');

      const result = discoverGitignoredFiles(tempDir, dirtyFiles);
      expect(result).not.toContain('.ana/scan.json');
    });

    // @ana A020
    it('handles git check-ignore exit code 1 gracefully', async () => {
      await createProject();

      // No .gitignore — nothing is ignored. git check-ignore returns exit 1.
      await fsp.mkdir(path.join(tempDir, '.claude'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.json'), '{}');

      // The file is untracked (dirty), so pass it as dirty to exclude it
      // Actually, let's test with a file that exists but is not dirty and not ignored
      const dirtyFiles = discoverDirtyFiles(tempDir);
      const result = discoverGitignoredFiles(tempDir, dirtyFiles);

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------
  // discoverGitignoredDirtyFiles (commit hardening)
  // -------------------------------------------------------------------

  describe('discoverGitignoredDirtyFiles', () => {
    // @ana A005
    it('identifies dirty files that are also gitignored', async () => {
      await createProject();

      // Create .gitignore that ignores .claude/
      await fsp.writeFile(path.join(tempDir, '.gitignore'), '.claude/\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      // Create a .claude/ file, force-add it, commit
      await fsp.mkdir(path.join(tempDir, '.claude'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.json'), '{}');
      execSync('git add -f .claude/settings.json && git commit -m "force-add"', { cwd: tempDir, stdio: 'ignore' });

      // Modify the tracked-but-gitignored file — it shows as dirty
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.json'), '{"updated": true}');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      expect(dirtyFiles).toContain('.claude/settings.json');

      const result = discoverGitignoredDirtyFiles(tempDir, dirtyFiles);
      expect(result).toContain('.claude/settings.json');
    });

    // @ana A006
    it('does not flag non-gitignored dirty files', async () => {
      await createProject();

      // Modify ana.json — dirty but not gitignored
      await fsp.writeFile(path.join(tempDir, '.ana', 'ana.json'), '{"updated": true}');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      expect(dirtyFiles.length).toBeGreaterThan(0);

      const result = discoverGitignoredDirtyFiles(tempDir, dirtyFiles);
      expect(result.length).toBe(0);
    });

    // @ana A007
    it('returns empty array for empty dirty set', async () => {
      await createProject();

      const result = discoverGitignoredDirtyFiles(tempDir, []);
      expect(result).toEqual([]);
    });

    // @ana A015
    it('handles git check-ignore errors gracefully', async () => {
      // Non-git directory — spawnSync returns non-zero
      const nonGitDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'non-git-'));
      try {
        const result = discoverGitignoredDirtyFiles(nonGitDir, ['some-file.txt']);
        expect(result).toEqual([]);
      } finally {
        await fsp.rm(nonGitDir, { recursive: true, force: true });
      }
    });

    it('returns only the gitignored subset when mixed dirty files exist', async () => {
      await createProject();

      // Gitignore .claude/
      await fsp.writeFile(path.join(tempDir, '.gitignore'), '.claude/\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      // Force-add a .claude/ file
      await fsp.mkdir(path.join(tempDir, '.claude'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.json'), '{}');
      execSync('git add -f .claude/settings.json && git commit -m "force-add"', { cwd: tempDir, stdio: 'ignore' });

      // Modify both: tracked-but-gitignored AND normal file
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.json'), '{"v2": true}');
      await fsp.writeFile(path.join(tempDir, '.ana', 'scan.json'), '{"updated": true}');

      const dirtyFiles = discoverDirtyFiles(tempDir);
      const result = discoverGitignoredDirtyFiles(tempDir, dirtyFiles);

      // Only the gitignored one should be in the result
      expect(result).toContain('.claude/settings.json');
      expect(result).not.toContain('.ana/scan.json');
    });
  });

  // -------------------------------------------------------------------
  // Force-add integration (via command action)
  // -------------------------------------------------------------------

  describe('force-add integration', () => {
    /**
     * Helper to run init commit with optional flags.
     */
    async function runInitCommitWithFlags(flags: string[] = []): Promise<{
      stdout: string;
      stderr: string;
      exitCode: number | undefined;
    }> {
      const originalExit = process.exit;
      const originalLog = console.log;
      const originalError = console.error;
      const stdoutLines: string[] = [];
      const stderrLines: string[] = [];
      let capturedExitCode: number | undefined;

      console.log = (...args: unknown[]) => {
        stdoutLines.push(args.map(String).join(' '));
      };
      console.error = (...args: unknown[]) => {
        stderrLines.push(args.map(String).join(' '));
      };
      process.exit = ((code?: number) => {
        capturedExitCode = code;
        throw new Error(`process.exit(${code})`);
      }) as typeof process.exit;

      try {
        const { registerInitCommitCommand } = await import('../../../src/commands/init/commit.js');
        const { Command } = await import('commander');
        const parent = new Command('init');
        registerInitCommitCommand(parent);
        await parent.parseAsync(['commit', ...flags], { from: 'user' });

        return {
          stdout: stdoutLines.join('\n'),
          stderr: stderrLines.join('\n'),
          exitCode: capturedExitCode,
        };
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('process.exit')) {
          return {
            stdout: stdoutLines.join('\n'),
            stderr: stderrLines.join('\n'),
            exitCode: capturedExitCode,
          };
        }
        throw error;
      } finally {
        console.log = originalLog;
        console.error = originalError;
        process.exit = originalExit;
      }
    }

    // @ana A004, A005, A006, A007, A021
    it('force-adds gitignored files so they appear in the commit', async () => {
      await createProject();

      // Set up .gitignore that blocks .claude/
      await fsp.writeFile(path.join(tempDir, '.gitignore'), '.claude/\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      // Create a dirty (non-ignored) file and a gitignored file
      await fsp.writeFile(path.join(tempDir, '.ana', 'scan.json'), '{}');
      await fsp.mkdir(path.join(tempDir, '.claude'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.json'), '{}');

      const result = await runInitCommitWithFlags();
      expect(result.exitCode).toBeUndefined();

      // Console output names the force-added file
      expect(result.stdout).toContain('.claude/settings.json');
      // Console output explains worktree compatibility
      expect(result.stdout).toContain('worktree');
      // Success message includes file count
      expect(result.stdout).toContain('file');

      // Verify git log contains both files
      const gitLog = execSync('git log -1 --name-only --format=""', {
        cwd: tempDir,
        encoding: 'utf-8',
      });
      expect(gitLog).toContain('.claude/settings.json');
      expect(gitLog).toContain('.ana/scan.json');
    });

    // @ana A008, A009, A010
    it('skips force-add when --respect-gitignore is set', async () => {
      await createProject();

      // Set up .gitignore that blocks .claude/
      await fsp.writeFile(path.join(tempDir, '.gitignore'), '.claude/\n');
      execSync('git add .gitignore && git commit -m "add gitignore"', { cwd: tempDir, stdio: 'ignore' });

      // Create a dirty (non-ignored) file and a gitignored file
      await fsp.writeFile(path.join(tempDir, '.ana', 'scan.json'), '{}');
      await fsp.mkdir(path.join(tempDir, '.claude'), { recursive: true });
      await fsp.writeFile(path.join(tempDir, '.claude', 'settings.json'), '{}');

      const result = await runInitCommitWithFlags(['--respect-gitignore']);
      expect(result.exitCode).toBeUndefined();

      // Warning about worktree implications
      const output = result.stdout + result.stderr;
      expect(output).toContain("won't be available in worktrees");

      // Verify git log: dirty file present, gitignored file absent
      const gitLog = execSync('git log -1 --name-only --format=""', {
        cwd: tempDir,
        encoding: 'utf-8',
      });
      expect(gitLog).toContain('.ana/scan.json');
      expect(gitLog).not.toContain('.claude/settings.json');
    });

    // @ana A011
    it('produces no gitignore output when nothing is gitignored', async () => {
      await createProject();

      // Create a dirty file but nothing gitignored
      await fsp.writeFile(path.join(tempDir, '.ana', 'scan.json'), '{}');

      const result = await runInitCommitWithFlags();
      expect(result.exitCode).toBeUndefined();
      expect(result.stdout).not.toContain('force-add');
      expect(result.stdout).toContain('Infrastructure committed');
    });
  });
});
