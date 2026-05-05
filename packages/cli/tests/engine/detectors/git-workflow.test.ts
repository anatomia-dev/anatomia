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
