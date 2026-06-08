/**
 * Tests for Phase-2 module_churn capture (AC10).
 *
 * captureModulesTouched additionally records per-file added/deleted churn under a
 * NEW `module_churn` key, computed via `git diff --numstat`. The existing
 * `modules_touched` path array must remain byte-unchanged. Exact-value assertions
 * against a real temp git repo; binary files coerce to 0/0.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeModuleChurn, saveArtifact } from '../../src/commands/artifact.js';

const RUN_TS = 'packages/cli/src/commands/run.ts';

describe('module_churn', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'churn-'));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** Run a git command in the temp repo. */
  function git(cmd: string): void {
    execSync(`git ${cmd}`, { cwd: tempDir, stdio: 'ignore' });
  }

  /** Write a file (creating parent dirs) relative to the repo root. */
  function writeFile(rel: string, content: string): void {
    const abs = path.join(tempDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }

  /** Initialize a repo with a baseline commit on `main`, then a feature branch. */
  function initRepo(): void {
    git('init -b main');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');
    fs.mkdirSync(path.join(tempDir, '.ana'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.ana', 'ana.json'),
      JSON.stringify({ artifactBranch: 'main' }),
      'utf-8',
    );
    writeFile('README.md', 'base\n');
    git('add -A');
    git('commit -m init');
  }

  describe('computeModuleChurn', () => {
    it('records exact added/deleted churn per file', () => {
      // @ana A029
      initRepo();
      git('checkout -b feature/test');
      // New file with exactly 3 added lines.
      writeFile(RUN_TS, 'a\nb\nc\n');
      git('add -A');
      git('commit -m "add run.ts"');

      const mergeBase = execSync('git merge-base main HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();
      const churn = computeModuleChurn(tempDir, mergeBase);

      expect(churn[RUN_TS]).toEqual({ added: 3, deleted: 0 });
    });

    it('coerces binary file churn to 0/0', () => {
      // @ana A029
      initRepo();
      git('checkout -b feature/test');
      // A binary file — numstat reports '-'/'-'.
      fs.writeFileSync(path.join(tempDir, 'asset.bin'), Buffer.from([0, 1, 2, 3, 255, 0, 7]));
      git('add -A');
      git('commit -m "add binary"');

      const mergeBase = execSync('git merge-base main HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();
      const churn = computeModuleChurn(tempDir, mergeBase);

      expect(churn['asset.bin']).toEqual({ added: 0, deleted: 0 });
    });

    it('excludes .ana files from churn', () => {
      initRepo();
      git('checkout -b feature/test');
      writeFile('.ana/plans/active/x/spec.md', 'spec\nbody\n');
      writeFile(RUN_TS, 'a\n');
      git('add -A');
      git('commit -m "mixed"');

      const mergeBase = execSync('git merge-base main HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();
      const churn = computeModuleChurn(tempDir, mergeBase);

      expect(churn[RUN_TS]).toEqual({ added: 1, deleted: 0 });
      expect(Object.keys(churn).some((k) => k.startsWith('.ana/'))).toBe(false);
    });

    it('returns an empty map for an unresolvable merge-base, never throws', () => {
      initRepo();
      expect(() => computeModuleChurn(tempDir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).not.toThrow();
    });
  });

  describe('captureModulesTouched writes both keys to .saves.json', () => {
    /** Create a build report + companion under the active plan dir. */
    function createBuildReport(slug: string): void {
      const dir = path.join(tempDir, '.ana', 'plans', 'active', slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'build_report.md'),
        '# Build Report\n\n## Deviations\nNone.\n\n## Open Issues\nNone.\n\n## Acceptance Criteria\nAll met.\n\n## PR Summary\nReady.',
        'utf-8',
      );
      fs.writeFileSync(
        path.join(dir, 'build_data.yaml'),
        'schema: 1\nconcerns:\n  - summary: "x"\n    severity: debt\n    suggested_action: monitor\n',
        'utf-8',
      );
    }

    it('records module_churn while leaving modules_touched a path array', () => {
      // @ana A029, A030
      initRepo();
      git('checkout -b feature/test-slug');
      writeFile(RUN_TS, 'one\ntwo\nthree\nfour\n'); // 4 added lines
      git('add -A');
      git('commit -m "feature work"');
      createBuildReport('test-slug');

      process.chdir(tempDir);
      saveArtifact('build-report', 'test-slug');

      const savesPath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug', '.saves.json');
      const saves = JSON.parse(fs.readFileSync(savesPath, 'utf-8')) as Record<string, unknown>;

      // A029 — module_churn present with exact per-file churn.
      expect(saves['module_churn']).toBeDefined();
      expect((saves['module_churn'] as Record<string, unknown>)[RUN_TS]).toEqual({ added: 4, deleted: 0 });

      // A030 — modules_touched is still a path string array containing run.ts.
      expect(Array.isArray(saves['modules_touched'])).toBe(true);
      expect(saves['modules_touched']).toContain(RUN_TS);
    });
  });
});
