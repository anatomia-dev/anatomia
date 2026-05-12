import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readArtifactBranch, readBranchPrefix, readCoAuthor, runGit } from '../../src/utils/git-operations.js';
import { spawnSync } from 'node:child_process';
import { AnaJsonSchema } from '../../src/commands/init/anaJsonSchema.js';

/**
 * Tests for readBranchPrefix() and AnaJsonSchema branchPrefix handling.
 *
 * Uses temp directories with ana.json fixtures for isolation.
 */

describe('readBranchPrefix', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ops-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /** Helper to write an ana.json fixture */
  async function writeAnaJson(config: Record<string, unknown>): Promise<void> {
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify(config, null, 2),
      'utf-8'
    );
  }

  // @ana A003
  it('returns configured value when branchPrefix is present', async () => {
    await writeAnaJson({ artifactBranch: 'main', branchPrefix: 'dev/' });
    const result = readBranchPrefix(tempDir);
    expect(result).toBe('dev/');
  });

  // @ana A004
  it('returns "feature/" when branchPrefix field is absent', async () => {
    await writeAnaJson({ artifactBranch: 'main' });
    const result = readBranchPrefix(tempDir);
    expect(result).toBe('feature/');
  });

  // @ana A005
  it('returns "feature/" when ana.json is missing entirely', () => {
    const result = readBranchPrefix(tempDir);
    expect(result).toBe('feature/');
  });

  // @ana A006
  it('returns empty string when branchPrefix is ""', async () => {
    await writeAnaJson({ artifactBranch: 'main', branchPrefix: '' });
    const result = readBranchPrefix(tempDir);
    expect(result).toBe('');
  });

  it('returns "feature/" when branchPrefix is a number', async () => {
    await writeAnaJson({ artifactBranch: 'main', branchPrefix: 42 });
    const result = readBranchPrefix(tempDir);
    expect(result).toBe('feature/');
  });

  it('returns "feature/" when branchPrefix is null', async () => {
    await writeAnaJson({ artifactBranch: 'main', branchPrefix: null });
    const result = readBranchPrefix(tempDir);
    expect(result).toBe('feature/');
  });

  it('returns "feature/" when ana.json is corrupted', async () => {
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(path.join(anaDir, 'ana.json'), '{invalid json', 'utf-8');
    const result = readBranchPrefix(tempDir);
    expect(result).toBe('feature/');
  });
});

describe('readCoAuthor', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ops-coauthor-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /** Helper to write an ana.json fixture */
  async function writeAnaJson(config: Record<string, unknown>): Promise<void> {
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify(config, null, 2),
      'utf-8'
    );
  }

  // @ana A001
  it('reads coAuthor from ana.json when present', async () => {
    await writeAnaJson({ coAuthor: 'Custom Bot <bot@example.com>' });
    const result = readCoAuthor(tempDir);
    expect(result).toBe('Custom Bot <bot@example.com>');
  });

  // @ana A002
  it('returns default when ana.json is missing', () => {
    const result = readCoAuthor(tempDir);
    expect(result).toBe('Ana <build@anatomia.dev>');
  });

  it('returns default when coAuthor field is absent', async () => {
    await writeAnaJson({ artifactBranch: 'main' });
    const result = readCoAuthor(tempDir);
    expect(result).toBe('Ana <build@anatomia.dev>');
  });

  it('returns default when ana.json is corrupted', async () => {
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(path.join(anaDir, 'ana.json'), '{invalid json', 'utf-8');
    const result = readCoAuthor(tempDir);
    expect(result).toBe('Ana <build@anatomia.dev>');
  });
});

describe('readArtifactBranch security hardening', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ops-artifact-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function writeAnaJson(config: Record<string, unknown>): Promise<void> {
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify(config, null, 2),
      'utf-8'
    );
  }

  // @ana A010
  it('exits with code 1 when artifactBranch contains injection payload', async () => {
    await writeAnaJson({ artifactBranch: 'main; echo pwned' });
    const originalExit = process.exit;
    const originalError = console.error;
    let exitCode: number | undefined;
    let errorMessage = '';
    process.exit = ((code: number) => { exitCode = code; }) as never;
    console.error = (msg: string) => { errorMessage += msg; };
    try {
      readArtifactBranch(tempDir);
    } finally {
      process.exit = originalExit;
      console.error = originalError;
    }
    expect(exitCode).toBe(1);
    expect(errorMessage).toContain('Invalid artifactBranch');
  });

  it('passes through valid artifact branch values', async () => {
    await writeAnaJson({ artifactBranch: 'main' });
    expect(readArtifactBranch(tempDir)).toBe('main');
  });
});

describe('readBranchPrefix security hardening', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ops-prefix-sec-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function writeAnaJson(config: Record<string, unknown>): Promise<void> {
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify(config, null, 2),
      'utf-8'
    );
  }

  // @ana A011
  it('returns fallback for injection payload in branchPrefix', async () => {
    await writeAnaJson({ artifactBranch: 'main', branchPrefix: 'x; echo pwned/' });
    const result = readBranchPrefix(tempDir);
    expect(result).toBe('feature/');
  });

  // @ana A027
  it('accepts empty string after hardening', async () => {
    await writeAnaJson({ artifactBranch: 'main', branchPrefix: '' });
    const result = readBranchPrefix(tempDir);
    expect(result).toBe('');
  });
});

describe('readCoAuthor security hardening', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ops-coauthor-sec-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function writeAnaJson(config: Record<string, unknown>): Promise<void> {
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify(config, null, 2),
      'utf-8'
    );
  }

  // @ana A012
  it('strips control characters from co-author value', async () => {
    await writeAnaJson({ coAuthor: 'Ana\n<build@anatomia.dev>\r\x00' });
    const result = readCoAuthor(tempDir);
    expect(result).not.toContain('\n');
    expect(result).not.toContain('\r');
    expect(result).not.toContain('\x00');
    expect(result).toBe('Ana<build@anatomia.dev>');
  });

  // @ana A013
  it('preserves normal co-author values with angle brackets', async () => {
    await writeAnaJson({ coAuthor: 'Ana <build@anatomia.dev>' });
    const result = readCoAuthor(tempDir);
    expect(result).toContain('<');
    expect(result).toBe('Ana <build@anatomia.dev>');
  });
});

describe('AnaJsonSchema branchPrefix', () => {
  // @ana A001
  it('defaults branchPrefix to "feature/" when field is absent', () => {
    const parsed = AnaJsonSchema.parse({ name: 'test' });
    expect(parsed.branchPrefix).toBe('feature/');
  });

  // @ana A002
  it('preserves a user-modified branchPrefix through round-trip', () => {
    const input = {
      name: 'test',
      branchPrefix: 'dev/',
      artifactBranch: 'main',
    };
    const parsed = AnaJsonSchema.parse(input);
    expect(parsed.branchPrefix).toBe('dev/');
  });

  // @ana A007
  it('catches invalid branchPrefix and defaults to "feature/"', () => {
    const input = {
      name: 'test',
      branchPrefix: 12345,
    };
    const parsed = AnaJsonSchema.parse(input);
    expect(parsed.branchPrefix).toBe('feature/');
  });

  it('preserves empty string branchPrefix', () => {
    const input = { name: 'test', branchPrefix: '' };
    const parsed = AnaJsonSchema.parse(input);
    expect(parsed.branchPrefix).toBe('');
  });

  it('preserves unknown fields and keeps branchPrefix', () => {
    const input = {
      name: 'test',
      branchPrefix: 'release/',
      unknownField: 'should-be-preserved',
    };
    const parsed = AnaJsonSchema.parse(input);
    expect(parsed.branchPrefix).toBe('release/');
    expect((parsed as Record<string, unknown>)['unknownField']).toBe('should-be-preserved');
  });
});

describe('runGit', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rungit-test-'));
    // Initialize a git repo
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'pipe' });
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir, stdio: 'pipe' });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir, stdio: 'pipe' });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A020
  it('captures stdout from successful command', () => {
    const result = runGit(['rev-parse', '--is-inside-work-tree'], { cwd: tempDir });
    expect(result.stdout).toContain('true');
    expect(result.exitCode).toBe(0);
  });

  // @ana A021
  it('returns non-zero exitCode on failure', () => {
    const result = runGit(['log', '--oneline', '-1'], { cwd: tempDir });
    // Empty repo has no commits — git log fails
    expect(result.exitCode).not.toBe(0);
  });

  // @ana A022
  it('works with cwd option', async () => {
    // Create a subdirectory that is NOT a git repo
    const subDir = path.join(tempDir, 'sub');
    await fs.mkdir(subDir);
    // Running in the git repo's root should succeed
    const result = runGit(['status', '--porcelain'], { cwd: tempDir });
    expect(result.exitCode).toBe(0);
  });

  it('returns empty stdout for commands with no output', () => {
    const result = runGit(['branch', '--list', 'nonexistent-branch-xyz'], { cwd: tempDir });
    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('captures stderr on error', () => {
    const result = runGit(['checkout', 'nonexistent-branch-xyz'], { cwd: tempDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

// @ana A023
describe('execSync enforcement', () => {
  it('zero execSync in commands and utils', () => {
    const thisDir = path.dirname(new URL(import.meta.url).pathname);
    const cliSrc = path.resolve(thisDir, '../../src');
    // Grep for execSync usage (imports or calls)
    const result = spawnSync('grep', ['-r', '--include=*.ts', '-l', 'execSync', `${cliSrc}/commands/`, `${cliSrc}/utils/`], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    const files = (result.stdout ?? '').trim().split('\n').filter(Boolean);
    // Filter out files that only mention execSync in comments/JSDoc
    const actualUsage = files.filter(file => {
      const content = fsSync.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      return lines.some((line: string) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
        return trimmed.includes('execSync');
      });
    });
    expect(actualUsage).toEqual([]);
  });
});
