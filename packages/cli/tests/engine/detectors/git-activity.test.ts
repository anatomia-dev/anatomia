/**
 * Git activity signals tests
 *
 * Tests high-churn files, active contributors, weekly commit tempo,
 * adaptive window, and null/empty cases.
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

function writeFile(name: string, content: string = 'x') {
  const fullPath = path.join(tmpDir, name);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-activity-test-'));
  git('init -b main');
  git('config user.email "test@test.com"');
  git('config user.name "Test"');
  writeFile('src/index.ts', 'init');
  git('add .');
  git('commit -m "init"');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
});

describe('git activity signals', () => {
  describe('highChurnFiles', () => {
    it('reports files by commit count', async () => {
      // Make 3 commits to index.ts, 1 to other.ts
      for (let i = 0; i < 3; i++) {
        writeFile('src/index.ts', `change ${i}`);
        git(`add . && git commit -m "update index ${i}"`);
      }
      writeFile('src/other.ts', 'new');
      git('add . && git commit -m "add other"');

      const result = await detectGitInfo(tmpDir);
      expect(result.recentActivity).not.toBeNull();
      const churn = result.recentActivity!.highChurnFiles;
      // index.ts has 4 commits (init + 3 updates), other.ts has 1
      expect(churn[0]?.path).toBe('src/index.ts');
      expect(churn[0]?.commits).toBeGreaterThan(churn[1]?.commits ?? 0);
    });

    it('filters to source file extensions only', async () => {
      writeFile('CHANGELOG.md', 'v1');
      writeFile('package-lock.json', '{}');
      writeFile('src/app.ts', 'code');
      git('add . && git commit -m "add files"');

      const result = await detectGitInfo(tmpDir);
      const paths = result.recentActivity!.highChurnFiles.map(f => f.path);
      expect(paths).toContain('src/app.ts');
      expect(paths).not.toContain('CHANGELOG.md');
      expect(paths).not.toContain('package-lock.json');
    });

    it('includes .md files inside src/ directories', async () => {
      writeFile('src/components/README.md', 'docs');
      git('add . && git commit -m "add src docs"');

      const result = await detectGitInfo(tmpDir);
      const paths = result.recentActivity!.highChurnFiles.map(f => f.path);
      expect(paths).toContain('src/components/README.md');
    });

    it('excludes root-level markdown', async () => {
      writeFile('README.md', 'updated');
      git('add . && git commit -m "update readme"');

      const result = await detectGitInfo(tmpDir);
      const paths = result.recentActivity!.highChurnFiles.map(f => f.path);
      expect(paths).not.toContain('README.md');
    });

    it('caps at 10 files maximum', async () => {
      for (let i = 0; i < 15; i++) {
        writeFile(`src/file${i}.ts`, `content ${i}`);
      }
      git('add . && git commit -m "add many files"');

      const result = await detectGitInfo(tmpDir);
      expect(result.recentActivity!.highChurnFiles.length).toBeLessThanOrEqual(10);
    });
  });

  describe('activeContributors', () => {
    it('counts distinct contributors', async () => {
      // Default test setup has 1 contributor
      const result = await detectGitInfo(tmpDir);
      expect(result.recentActivity!.activeContributors).toBe(1);
    });
  });

  describe('weeklyCommits', () => {
    it('always returns exactly 4 entries', async () => {
      const result = await detectGitInfo(tmpDir);
      expect(result.recentActivity!.weeklyCommits).toHaveLength(4);
    });

    it('buckets commits into weeks, newest first', async () => {
      // Add commits (all recent — within this week)
      for (let i = 0; i < 3; i++) {
        writeFile('src/index.ts', `v${i}`);
        git(`add . && git commit -m "commit ${i}"`);
      }
      const result = await detectGitInfo(tmpDir);
      // All commits are from this week (bucket 0)
      expect(result.recentActivity!.weeklyCommits[0]).toBeGreaterThanOrEqual(4); // init + 3
    });
  });

  describe('adaptive window', () => {
    it('uses 30 days for repos with <= 300 commits', async () => {
      // Our test repo has very few commits
      const result = await detectGitInfo(tmpDir);
      expect(result.recentActivity!.windowDays).toBe(30);
    });
  });

  describe('null cases', () => {
    it('returns null for non-git directory', async () => {
      const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'git-activity-nogit-'));
      try {
        const result = await detectGitInfo(nonGit);
        expect(result.recentActivity).toBeNull();
      } finally {
        fs.rmSync(nonGit, { recursive: true, maxRetries: 3, retryDelay: 200 });
      }
    });

    it('returns null for empty repo (no commits)', async () => {
      const emptyRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'git-activity-empty-'));
      try {
        execSync('git init -b main', { cwd: emptyRepo, stdio: 'pipe' });
        const result = await detectGitInfo(emptyRepo);
        expect(result.recentActivity).toBeNull();
      } finally {
        fs.rmSync(emptyRepo, { recursive: true, maxRetries: 3, retryDelay: 200 });
      }
    });

    it('returns null for shallow clone', async () => {
      // Create a repo, then shallow clone it
      const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'git-activity-origin-'));
      const shallow = fs.mkdtempSync(path.join(os.tmpdir(), 'git-activity-shallow-'));
      try {
        execSync('git init -b main', { cwd: origin, stdio: 'pipe' });
        execSync('git config user.email "t@t.com"', { cwd: origin, stdio: 'pipe' });
        execSync('git config user.name "T"', { cwd: origin, stdio: 'pipe' });
        fs.writeFileSync(path.join(origin, 'f.txt'), 'x');
        execSync('git add . && git commit -m "init"', { cwd: origin, stdio: 'pipe' });

        fs.rmSync(shallow, { recursive: true, maxRetries: 3, retryDelay: 200 });
        execSync(`git clone --depth=1 "file://${origin}" "${shallow}"`, { stdio: 'pipe' });

        const result = await detectGitInfo(shallow);
        expect(result.recentActivity).toBeNull();
      } finally {
        fs.rmSync(origin, { recursive: true, maxRetries: 3, retryDelay: 200 });
        fs.rmSync(shallow, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      }
    });
  });
});

describe('git activity — dogfood', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

  it('produces expected output for Anatomia repo', async () => {
    const result = await detectGitInfo(REPO_ROOT);
    expect(result.recentActivity).not.toBeNull();
    const activity = result.recentActivity!;

    // Very active repo — should narrow to 14 days or be 30
    expect([14, 30]).toContain(activity.windowDays);

    // Should have high-churn files (we've been actively developing)
    expect(activity.highChurnFiles.length).toBeGreaterThan(0);
    // Top files should be source files
    for (const file of activity.highChurnFiles) {
      const ext = file.path.substring(file.path.lastIndexOf('.'));
      const isMd = ext === '.md';
      expect(
        ['.ts', '.tsx', '.js', '.jsx'].includes(ext) || isMd,
        `${file.path} should be a source file`
      ).toBe(true);
    }

    // At least 1 active contributor
    expect(activity.activeContributors).toBeGreaterThanOrEqual(1);

    // 4 weekly entries
    expect(activity.weeklyCommits).toHaveLength(4);
  });
});
