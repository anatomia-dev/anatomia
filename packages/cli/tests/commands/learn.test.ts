/**
 * Tests for ana learn command
 *
 * Uses temp directories for isolation.
 * Tests cover contract assertions A019-A024.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

describe('ana learn', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-test-'));
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Helper to run ana learn command
   */
  function runLearn(args: string[] = []): { stdout: string; stderr: string; exitCode: number } {
    const cliPath = path.join(__dirname, '../../dist/index.js');
    try {
      const stdout = execSync(`node ${cliPath} learn ${args.join(' ')}`, {
        encoding: 'utf-8',
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; status?: number };
      return {
        stdout: execError.stdout || '',
        stderr: execError.stderr || '',
        exitCode: execError.status || 1,
      };
    }
  }

  /**
   * Helper to create a git-initialized project for learn testing.
   * Sets up a "main" branch with ana.json.
   */
  async function createLearnTestProject(options?: {
    branch?: string;
    withLearnState?: boolean;
    withProofChain?: boolean;
    findingsCount?: number;
  }): Promise<void> {
    const branch = options?.branch ?? 'main';

    // Init git
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

    // Create .ana/ana.json
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({ artifactBranch: 'main' }),
    );

    // Optionally create learn state
    if (options?.withLearnState) {
      const learnDir = path.join(anaDir, 'learn');
      await fs.mkdir(learnDir, { recursive: true });
      await fs.writeFile(
        path.join(learnDir, 'state.json'),
        JSON.stringify({ last_session_at: null }),
      );
    }

    // Optionally create proof chain with findings
    if (options?.withProofChain) {
      const count = options.findingsCount ?? 5;
      const findings = Array.from({ length: count }, (_, i) => ({
        id: `F${String(i + 1).padStart(3, '0')}`,
        category: 'code',
        summary: `Finding ${i + 1}`,
        file: `src/file${i}.ts`,
        anchor: null,
        status: 'active',
        severity: 'debt',
        suggested_action: 'scope',
      }));

      await fs.writeFile(
        path.join(anaDir, 'proof_chain.json'),
        JSON.stringify({
          entries: [{
            slug: 'test-entry',
            feature: 'Test Feature',
            result: 'PASS',
            author: { name: 'Dev', email: 'dev@test.com' },
            contract: { total: 1, covered: 1, uncovered: 0, satisfied: 1, unsatisfied: 0, deviated: 0 },
            assertions: [],
            acceptance_criteria: { total: 1, met: 1 },
            timing: { total_minutes: 10 },
            hashes: {},
            completed_at: '2026-05-10T10:00:00Z',
            modules_touched: [],
            findings,
            rejection_cycles: 0,
            previous_failures: [],
            build_concerns: [],
          }],
        }, null, 2),
      );
    }

    // Initial commit
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
    execSync(`git branch -M ${branch}`, { cwd: tempDir, stdio: 'ignore' });
  }

  // @ana A019
  describe('learn end writes last_session_at', () => {
    it('writes a timestamp to state.json', async () => {
      await createLearnTestProject({ withLearnState: true });
      process.chdir(tempDir);
      const { exitCode } = runLearn(['end']);
      expect(exitCode).toBe(0);

      const stateContent = await fs.readFile(
        path.join(tempDir, '.ana', 'learn', 'state.json'),
        'utf-8',
      );
      const state = JSON.parse(stateContent);
      expect(state.last_session_at).toBeDefined();
      expect(state.last_session_at).not.toBeNull();
      // Should be a valid ISO timestamp
      expect(new Date(state.last_session_at).getTime()).not.toBeNaN();
    });
  });

  // @ana A020
  describe('learn end commits state.json', () => {
    it('creates a git commit with [learn] prefix', async () => {
      await createLearnTestProject({ withLearnState: true });
      process.chdir(tempDir);
      const { exitCode } = runLearn(['end']);
      expect(exitCode).toBe(0);

      const log = execSync('git log --oneline -1', { cwd: tempDir, encoding: 'utf-8' });
      expect(log).toContain('[learn] End session');
    });
  });

  // @ana A021
  describe('learn end rejects wrong branch', () => {
    it('exits with error when not on artifact branch', async () => {
      await createLearnTestProject();
      // Create and switch to a feature branch
      execSync('git checkout -b feature/test', { cwd: tempDir, stdio: 'ignore' });
      process.chdir(tempDir);
      const { exitCode, stderr } = runLearn(['end']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('Wrong branch');
    });
  });

  // @ana A022
  describe('learn end shows findings count', () => {
    it('shows how many findings will be old next time', async () => {
      await createLearnTestProject({ withLearnState: true, withProofChain: true, findingsCount: 7 });
      process.chdir(tempDir);
      const { stdout, exitCode } = runLearn(['end']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Findings now');
      expect(stdout).toContain('7');
    });
  });

  // @ana A023
  describe('learn end creates missing learn directory', () => {
    it('creates .ana/learn/ if it does not exist', async () => {
      await createLearnTestProject(); // No withLearnState — directory doesn't exist
      process.chdir(tempDir);
      const { exitCode } = runLearn(['end']);
      expect(exitCode).toBe(0);

      const stateContent = await fs.readFile(
        path.join(tempDir, '.ana', 'learn', 'state.json'),
        'utf-8',
      );
      const state = JSON.parse(stateContent);
      expect(state.last_session_at).toBeDefined();
    });
  });

  // @ana A024
  describe('learn end --json returns valid JSON', () => {
    it('returns JSON with command field', async () => {
      await createLearnTestProject({ withLearnState: true, withProofChain: true });
      process.chdir(tempDir);
      const { stdout, exitCode } = runLearn(['end', '--json']);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json.command).toBe('learn end');
      expect(json.results.last_session_at).toBeDefined();
      expect(json.results.findings_before_cutoff).toBeDefined();
    });
  });
});
