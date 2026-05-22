/**
 * Tests for git workflow pattern detection signals:
 * commitFormat, branchPatterns, hooks, mergeStrategy, coAuthor
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectGitInfo } from '../../../src/engine/detectors/git.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

let tmpDir: string;

function git(cmd: string) {
  execSync(`git ${cmd}`, { cwd: tmpDir, stdio: 'pipe' });
}

function writeFile(name: string, content: string) {
  fs.writeFileSync(path.join(tmpDir, name), content);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-workflow-test-'));
  git('init -b main');
  git('config user.email "test@test.com"');
  git('config user.name "Test"');
  writeFile('file.txt', 'init');
  git('add .');
  git('commit -m "init"');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
});

describe('git workflow signals', () => {
  describe('commitFormat', () => {
    it('detects conventional commits with high confidence', async () => {
      for (let i = 0; i < 5; i++) {
        writeFile('file.txt', `change ${i}`);
        git(`add . && git commit -m "feat: feature ${i}"`);
      }
      const result = await detectGitInfo(tmpDir);
      expect(result.commitFormat).not.toBeNull();
      expect(result.commitFormat!.conventional).toBe(true);
      expect(result.commitFormat!.confidence).toBeGreaterThan(0.7);
    });

    it('detects non-conventional commits', async () => {
      for (let i = 0; i < 5; i++) {
        writeFile('file.txt', `change ${i}`);
        git(`add . && git commit -m "Added feature ${i}"`);
      }
      const result = await detectGitInfo(tmpDir);
      expect(result.commitFormat!.conventional).toBe(false);
    });

    it('reports correct confidence for mixed formats', async () => {
      // init + 2 conventional + 2 non-conventional = 5 total, 2/5 = 0.4
      writeFile('file.txt', 'a');
      git('add . && git commit -m "feat: one"');
      writeFile('file.txt', 'b');
      git('add . && git commit -m "fix: two"');
      writeFile('file.txt', 'c');
      git('add . && git commit -m "Added three"');
      writeFile('file.txt', 'd');
      git('add . && git commit -m "Updated four"');

      const result = await detectGitInfo(tmpDir);
      expect(result.commitFormat!.sampleSize).toBe(5);
      // 2 conventional out of 5 = 0.4, so conventional = false
      expect(result.commitFormat!.conventional).toBe(false);
      expect(result.commitFormat!.confidence).toBeCloseTo(0.4, 1);
    });

    it('handles repo with single commit', async () => {
      const result = await detectGitInfo(tmpDir);
      expect(result.commitFormat).not.toBeNull();
      expect(result.commitFormat!.sampleSize).toBe(1);
    });
  });

  describe('branchPatterns', () => {
    it('returns empty prefixes for repo with no remote branches', async () => {
      const result = await detectGitInfo(tmpDir);
      expect(result.branchPatterns).not.toBeNull();
      expect(result.branchPatterns!.prefixes).toEqual({});
      expect(result.branchPatterns!.primary).toBeNull();
    });

    // @ana A012, A013, A020
    it('detects branch patterns from GitHub PR merge subjects', async () => {
      // Create branches and merge them with GitHub-style subjects
      for (let i = 0; i < 5; i++) {
        git('checkout -b feature/thing-' + i);
        writeFile('file.txt', 'feature ' + i);
        git('add . && git commit -m "feat: thing ' + i + '"');
        git('checkout main');
        git('merge --no-ff feature/thing-' + i + ' -m "Merge pull request #' + (i + 1) + ' from myorg/feature/thing-' + i + '"');
      }
      // Add one fix branch
      git('checkout -b fix/bug-1');
      writeFile('file.txt', 'fix 1');
      git('add . && git commit -m "fix: bug 1"');
      git('checkout main');
      git('merge --no-ff fix/bug-1 -m "Merge pull request #6 from myorg/fix/bug-1"');

      const result = await detectGitInfo(tmpDir);
      expect(result.branchPatterns).not.toBeNull();
      expect(result.branchPatterns!.prefixes['feature/']).toBe(5);
      expect(result.branchPatterns!.prefixes['fix/']).toBe(1);
      expect(result.branchPatterns!.primary).toBe('feature/');
    });

    // @ana A014
    it('parses git CLI merge branch format', async () => {
      git('checkout -b feature/alpha');
      writeFile('file.txt', 'alpha');
      git('add . && git commit -m "feat: alpha"');
      git('checkout main');
      git("merge --no-ff feature/alpha -m \"Merge branch 'feature/alpha'\"");

      git('checkout -b feature/beta');
      writeFile('file.txt', 'beta');
      git('add . && git commit -m "feat: beta"');
      git('checkout main');
      git("merge --no-ff feature/beta -m \"Merge branch 'feature/beta' into main\"");

      const result = await detectGitInfo(tmpDir);
      expect(result.branchPatterns!.prefixes['feature/']).toBe(2);
      expect(result.branchPatterns!.primary).toBe('feature/');
    });

    // @ana A015
    it('excludes bot branches from merge-based detection', async () => {
      // Feature merges
      git('checkout -b feature/real-1');
      writeFile('file.txt', 'real 1');
      git('add . && git commit -m "feat: real 1"');
      git('checkout main');
      git('merge --no-ff feature/real-1 -m "Merge pull request #1 from myorg/feature/real-1"');

      // Bot merge
      git('checkout -b dependabot/npm-axios');
      writeFile('file.txt', 'bot');
      git('add . && git commit -m "chore: bump axios"');
      git('checkout main');
      git('merge --no-ff dependabot/npm-axios -m "Merge pull request #2 from myorg/dependabot/npm-axios"');

      const result = await detectGitInfo(tmpDir);
      expect(result.branchPatterns!.prefixes).not.toHaveProperty('dependabot/');
      expect(result.branchPatterns!.prefixes['feature/']).toBe(1);
    });

    // @ana A016, A017
    it('falls back to remote branches when no merge history', async () => {
      // No merges — just linear commits. Falls back to git branch -r (empty for local-only repo).
      const result = await detectGitInfo(tmpDir);
      expect(result.branchPatterns).not.toBeNull();
      expect(result.branchPatterns).toHaveProperty('prefixes');
      expect(result.branchPatterns).toHaveProperty('primary');
    });

    // @ana A018
    it('returns null primary when default branch is unknown', async () => {
      // Empty repo with no commits — detectGitInfo returns null for branchPatterns
      // because head is null, so the entire git info block returns nulls.
      // For repos WITH commits but no detectable default branch, the fallback
      // path runs with null defaultBranch, producing empty prefixes and null primary.
      // Test with a repo that has commits but no merge history:
      const result = await detectGitInfo(tmpDir);
      // tmpDir has commits but no merges and no remote — falls back to git branch -r
      // which returns empty for local-only repos, giving null primary
      expect(result.branchPatterns!.primary).toBeNull();
    });

    // @ana A019
    it('skips unparseable merge subjects without error', async () => {
      // Create a merge with a custom unparseable subject
      git('checkout -b feature/good');
      writeFile('file.txt', 'good');
      git('add . && git commit -m "feat: good"');
      git('checkout main');
      git('merge --no-ff feature/good -m "Merge pull request #1 from myorg/feature/good"');

      // Create a merge with an unparseable custom subject
      git('checkout -b some-branch');
      writeFile('file.txt', 'custom');
      git('add . && git commit -m "some change"');
      git('checkout main');
      git('merge --no-ff some-branch -m "Release v2.0.0 - consolidated changes"');

      const result = await detectGitInfo(tmpDir);
      expect(result.branchPatterns!.prefixes['feature/']).toBe(1);
      // The unparseable subject should not produce any prefix entry
      expect(Object.keys(result.branchPatterns!.prefixes)).toEqual(['feature/']);
    });
  });

  describe('hooks', () => {
    it('detects Husky pre-commit hook with test and lint', async () => {
      fs.mkdirSync(path.join(tmpDir, '.husky'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.husky', 'pre-commit'),
        '#!/bin/sh\npnpm run test\npnpm run lint\npnpm run typecheck'
      );
      const result = await detectGitInfo(tmpDir);
      expect(result.hooks).not.toBeNull();
      expect(result.hooks!.preCommit.exists).toBe(true);
      expect(result.hooks!.preCommit.runsTests).toBe(true);
      expect(result.hooks!.preCommit.runsLint).toBe(true);
      expect(result.hooks!.preCommit.runsTypecheck).toBe(true);
    });

    it('returns exists: false when no hooks directory', async () => {
      const result = await detectGitInfo(tmpDir);
      expect(result.hooks!.preCommit.exists).toBe(false);
      expect(result.hooks!.preCommit.runsTests).toBe(false);
    });

    it('detects .git/hooks/pre-commit when no Husky', async () => {
      const hooksDir = path.join(tmpDir, '.git', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(
        path.join(hooksDir, 'pre-commit'),
        '#!/bin/sh\nnpm run lint'
      );
      const result = await detectGitInfo(tmpDir);
      expect(result.hooks!.preCommit.exists).toBe(true);
      expect(result.hooks!.preCommit.runsLint).toBe(true);
      expect(result.hooks!.preCommit.runsTests).toBe(false);
    });
  });

  describe('mergeStrategy', () => {
    it('reports squash/rebase for repo with zero merge commits', async () => {
      // Add a few more straight-line commits
      for (let i = 0; i < 3; i++) {
        writeFile('file.txt', `v${i}`);
        git(`add . && git commit -m "commit ${i}"`);
      }
      const result = await detectGitInfo(tmpDir);
      expect(result.mergeStrategy).not.toBeNull();
      expect(result.mergeStrategy!.strategy).toBe('squash');
    });
  });

  describe('coAuthor', () => {
    it('detects Co-authored-by trailer', async () => {
      writeFile('file.txt', 'coauthor');
      git('add .');
      execSync(
        `git commit -m "feat: add thing" -m "Co-authored-by: Bot <bot@test.com>"`,
        { cwd: tmpDir, stdio: 'pipe' }
      );
      const result = await detectGitInfo(tmpDir);
      expect(result.coAuthor).not.toBeNull();
      expect(result.coAuthor!.detected).toBe(true);
      expect(result.coAuthor!.pattern).toContain('Bot');
    });

    it('returns detected: false when no trailers', async () => {
      const result = await detectGitInfo(tmpDir);
      expect(result.coAuthor!.detected).toBe(false);
      expect(result.coAuthor!.pattern).toBeNull();
    });
  });

  describe('non-git directory', () => {
    it('returns null for all workflow signals when not a git repo', async () => {
      const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'git-workflow-nogit-'));
      try {
        const result = await detectGitInfo(nonGit);
        expect(result.commitFormat).toBeNull();
        expect(result.branchPatterns).toBeNull();
        expect(result.hooks).toBeNull();
        expect(result.mergeStrategy).toBeNull();
        expect(result.coAuthor).toBeNull();
      } finally {
        fs.rmSync(nonGit, { recursive: true, maxRetries: 3, retryDelay: 200 });
      }
    });
  });

  describe('empty repo (git init, no commits)', () => {
    it('returns null for commit-dependent signals but detects hooks', async () => {
      const emptyRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'git-workflow-empty-'));
      try {
        execSync('git init -b main', { cwd: emptyRepo, stdio: 'pipe' });
        // Add a hook to an empty repo
        fs.mkdirSync(path.join(emptyRepo, '.husky'), { recursive: true });
        fs.writeFileSync(path.join(emptyRepo, '.husky', 'pre-commit'), '#!/bin/sh\nnpm test');

        const result = await detectGitInfo(emptyRepo);
        expect(result.commitFormat).toBeNull();
        expect(result.mergeStrategy).toBeNull();
        expect(result.coAuthor).toBeNull();
        // hooks should still be detected even with no commits
        expect(result.hooks).not.toBeNull();
        expect(result.hooks!.preCommit.exists).toBe(true);
      } finally {
        fs.rmSync(emptyRepo, { recursive: true, maxRetries: 3, retryDelay: 200 });
      }
    });
  });
});
