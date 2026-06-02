/**
 * Tests for ana scan command
 *
 * Uses temp directories for isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { countFiles, formatNumber } from '../../src/utils/fileCounts.js';
import {
  getLanguageDisplayName,
  getFrameworkDisplayName,
  getPatternDisplayName,
} from '../../src/utils/displayNames.js';

// @ana A012, A013
describe('ana scan', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-test-'));
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Helper to run ana scan command
   */
  function runScan(args: string[] = []): { stdout: string; stderr: string; exitCode: number } {
    const cliPath = path.join(__dirname, '../../dist/index.js');
    try {
      const stdout = execSync(`node ${cliPath} scan ${args.join(' ')}`, {
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
   * Helper to create test project files
   */
  async function createTestFiles(files: Record<string, string>): Promise<void> {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(tempDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }
  }

  describe('command invocation', () => {
    // AC1: ana scan runs on cwd, ana scan <path> runs on specified path
    it('scans current directory when no path provided', async () => {
      await createTestFiles({
        'package.json': '{"name":"test","version":"1.0.0"}',
        'index.ts': 'export const foo = 1;',
        'utils.ts': 'export const bar = 2;',
      });
      process.chdir(tempDir);

      const { stdout, exitCode } = runScan();
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Language\s+Node\.js/);
    });

    it('scans specified path when path argument provided', async () => {
      await createTestFiles({
        'package.json': '{"name":"test","version":"1.0.0"}',
        'index.ts': 'export const foo = 1;',
        'utils.ts': 'export const bar = 2;',
        'helper.ts': 'export const baz = 3;',
      });

      const { stdout, exitCode } = runScan([tempDir]);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Language\s+Node\.js/);
    });

    it('shows helpful error for nonexistent path', async () => {
      const { stderr, exitCode } = runScan(['/nonexistent/path/abc123']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/not found|does not exist|No such/i);
    });
  });

  describe('no .ana/ required (AC2)', () => {
    it('works on project without .ana/ directory', async () => {
      await createTestFiles({
        'package.json': '{"name":"test","version":"1.0.0"}',
      });

      const { stdout, exitCode } = runScan([tempDir]);
      expect(stdout).toMatch(/Language\s+Node\.js/);
      expect(exitCode).toBe(0);
    });
  });

  describe('JSON output (AC3)', () => {
    it('produces valid JSON with --json flag', async () => {
      await createTestFiles({
        'package.json': '{"name":"test","version":"1.0.0"}',
      });

      const { stdout, exitCode } = runScan([tempDir, '--json']);
      expect(exitCode).toBe(0);
      const json = JSON.parse(stdout);
      expect(json).toHaveProperty('overview');
      expect(json.overview).toHaveProperty('project');
      expect(json.overview).toHaveProperty('scannedAt');
      expect(json).toHaveProperty('stack');
      expect(json).toHaveProperty('files');
      expect(json).toHaveProperty('structure');
    });

    it('JSON stack contains all category fields', async () => {
      await createTestFiles({
        'package.json': '{"name":"test","version":"1.0.0"}',
      });

      const { stdout } = runScan([tempDir, '--json']);
      const json = JSON.parse(stdout);
      expect(json.stack).toHaveProperty('language');
      expect(json.stack).toHaveProperty('auth');
      // auth is null when not detected
      expect(json.stack.auth).toBeNull();
    });

    it('JSON files contains all count fields', async () => {
      await createTestFiles({
        'package.json': '{"name":"test","version":"1.0.0"}',
        'index.ts': 'export const x = 1;',
        'foo.test.ts': 'test("foo", () => {});',
      });

      const { stdout } = runScan([tempDir, '--json']);
      const json = JSON.parse(stdout);
      expect(json.files).toHaveProperty('source');
      expect(json.files).toHaveProperty('test');
      expect(json.files).toHaveProperty('config');
      expect(json.files).toHaveProperty('total');
      expect(typeof json.files.source).toBe('number');
    });

    it('JSON structure is array of path/purpose objects', async () => {
      await createTestFiles({
        'package.json': '{"name":"test","version":"1.0.0"}',
        'src/index.ts': 'export const x = 1;',
        'tests/foo.test.ts': 'test("foo", () => {});',
      });

      const { stdout } = runScan([tempDir, '--json']);
      const json = JSON.parse(stdout);
      expect(Array.isArray(json.structure)).toBe(true);
      if (json.structure.length > 0) {
        expect(json.structure[0]).toHaveProperty('path');
        expect(json.structure[0]).toHaveProperty('purpose');
      }
    });
  });

  describe('read-only operation (AC5)', () => {
    it('creates no files during scan', async () => {
      await createTestFiles({
        'package.json': '{"name":"test","version":"1.0.0"}',
      });

      const filesBefore = await fs.readdir(tempDir, { recursive: true });
      runScan([tempDir]);
      const filesAfter = await fs.readdir(tempDir, { recursive: true });
      expect(filesAfter.sort()).toEqual(filesBefore.sort());
    });
  });

  describe('stack detection (AC6, AC7)', () => {
    it('displays Language when detected', async () => {
      await createTestFiles({
        'package.json': '{"name":"test","version":"1.0.0"}',
      });

      const { stdout } = runScan([tempDir]);
      expect(stdout).toMatch(/Language\s+Node\.js/);
    });

    it('displays Framework when detected', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'test',
          version: '1.0.0',
          dependencies: { next: '14.0.0' },
        }),
      });

      const { stdout } = runScan([tempDir]);
      expect(stdout).toMatch(/Framework\s+Next\.js/);
    });

    it('omits Framework line entirely when not detected', async () => {
      await createTestFiles({
        'package.json': '{"name":"test","version":"1.0.0"}',
      });

      const { stdout } = runScan([tempDir]);
      expect(stdout).not.toMatch(/Framework/);
    });

    it('omits Database line entirely when not detected', async () => {
      await createTestFiles({
        'package.json': '{"name":"test","version":"1.0.0"}',
      });

      const { stdout } = runScan([tempDir]);
      expect(stdout).not.toMatch(/Database/);
    });

    it('omits Auth line entirely when not detected', async () => {
      await createTestFiles({
        'package.json': '{"name":"test","version":"1.0.0"}',
      });

      const { stdout } = runScan([tempDir]);
      expect(stdout).not.toMatch(/Auth/);
    });

    it('displays Testing when test framework detected', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'test',
          version: '1.0.0',
          devDependencies: { vitest: '2.0.0' },
        }),
        'foo.test.ts': 'import { test } from "vitest"; test("x", () => {});',
      });

      const { stdout } = runScan([tempDir]);
      expect(stdout).toMatch(/Testing\s+Vitest/);
    });
  });

  describe('file counts (AC8)', () => {
    // File counts are in JSON output (scan.json), not terminal output (P1 redesign removed them).
    // Terminal output shows file counts in the header summary line for rich projects.
    it('includes file counts in JSON output', async () => {
      await createTestFiles({
        'package.json': '{}',
        'index.ts': 'export const a = 1;',
        'utils.ts': 'export const b = 2;',
        'helper.ts': 'export const c = 3;',
        'foo.test.ts': 'test("a", () => {});',
        'bar.test.ts': 'test("b", () => {});',
      });

      const { stdout } = runScan([tempDir, '--json']);
      const json = JSON.parse(stdout);
      expect(json.files.source).toBe(3);
      expect(json.files.test).toBe(2);
      expect(json.files.config).toBe(1);
      expect(json.files.total).toBe(6);
    });

    it('formats large numbers with commas', () => {
      expect(formatNumber(1026)).toBe('1,026');
      expect(formatNumber(999)).toBe('999');
      expect(formatNumber(10000)).toBe('10,000');
    });
  });

  describe('structure map (AC9, AC10)', () => {
    // P1 redesign: Structure section removed from terminal output. Structure
    // data is still in JSON output and scan.json for setup agent consumption.
    it('includes structure in JSON output', async () => {
      await createTestFiles({
        'package.json': '{}',
        'src/index.ts': 'export const x = 1;',
        'tests/foo.test.ts': 'test("foo", () => {});',
      });

      const { stdout } = runScan([tempDir, '--json']);
      const json = JSON.parse(stdout);
      expect(json.structure.length).toBeGreaterThan(0);
      expect(json.structure.some((s: { path: string }) => s.path === 'src/')).toBe(true);
    });
  });

  describe('footer CTA (AC11)', () => {
    it('displays dynamic CTA in funnel context (no .ana/)', async () => {
      await createTestFiles({
        'package.json': '{}',
      });

      const { stdout } = runScan([tempDir]);
      // Funnel context (no .ana/) — dynamic CTA based on findings count
      expect(stdout).toContain('ana init');
    });
  });

  describe('--save flag', () => {
    it('writes scan.json with --save flag', async () => {
      await createTestFiles({
        'package.json': '{"name":"test"}',
        'index.ts': 'export const x = 1;',
      });
      // --save requires .ana/ to exist and cannot combine with path arg
      fsSync.mkdirSync(path.join(tempDir, '.ana'), { recursive: true });
      process.chdir(tempDir);

      const { stdout, exitCode } = runScan(['--save']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Scan saved to .ana/scan.json');

      // Verify file exists and contains valid JSON
      const scanJsonPath = path.join(tempDir, '.ana', 'scan.json');
      expect(fsSync.existsSync(scanJsonPath)).toBe(true);

      const scanContent = JSON.parse(await fs.readFile(scanJsonPath, 'utf-8'));
      expect(scanContent.overview).toBeDefined();
      expect(scanContent.overview.project).toBeDefined();
      expect(scanContent.stack).toBeDefined();
      expect(scanContent.files).toBeDefined();
      expect(scanContent.structure).toBeDefined();
    });

    it('does not write scan.json without --save flag', async () => {
      await createTestFiles({
        'package.json': '{"name":"test"}',
        'index.ts': 'export const x = 1;',
      });

      const { exitCode } = runScan([tempDir]);
      expect(exitCode).toBe(0);

      // Verify file does NOT exist
      const scanJsonPath = path.join(tempDir, '.ana', 'scan.json');
      expect(fsSync.existsSync(scanJsonPath)).toBe(false);
    });

    it('auto-creates .ana/ when --save used without init', async () => {
      await createTestFiles({
        'package.json': '{"name":"test"}',
      });

      // Verify .ana doesn't exist
      const anaDir = path.join(tempDir, '.ana');
      expect(fsSync.existsSync(anaDir)).toBe(false);
      process.chdir(tempDir);

      const { exitCode } = runScan(['--save']);
      expect(exitCode).toBe(0);
      expect(fsSync.existsSync(anaDir)).toBe(true);
    });
  });

  describe('--quiet flag', () => {
    it('produces no stdout when --quiet used alone', async () => {
      await createTestFiles({
        'package.json': '{}',
      });

      const { stdout, exitCode } = runScan([tempDir, '--quiet']);
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe('');
    });

    it('still produces JSON when --quiet --json combined', async () => {
      await createTestFiles({
        'package.json': '{}',
      });

      const { stdout, exitCode } = runScan([tempDir, '--quiet', '--json']);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.overview).toBeDefined();
      expect(parsed.stack).toBeDefined();
    });
  });

  describe('--quick flag', () => {
    it('forces surface tier with patterns and conventions null', async () => {
      await createTestFiles({
        'package.json': '{}',
      });

      const { stdout, exitCode } = runScan([tempDir, '--quick', '--json']);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.overview.depth).toBe('surface');
      expect(parsed.patterns).toBeNull();
      expect(parsed.conventions).toBeNull();
    });
  });

  describe('path + --save guard', () => {
    it('errors when path and --save combined', async () => {
      await createTestFiles({
        'package.json': '{}',
      });

      const { stderr, exitCode } = runScan([tempDir, '--save']);
      // tempDir !== '.' so this should trigger path+save guard
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Cannot combine path argument with --save');
    });
  });

  describe('edge cases (AC14, AC15)', () => {
    it('handles empty directory gracefully', async () => {
      // tempDir is already empty

      const { stdout, exitCode } = runScan([tempDir]);
      expect(stdout).toMatch(/No code detected/);
      expect(exitCode).toBe(0);
    });

    it('handles non-code project gracefully', async () => {
      await createTestFiles({
        'README.md': '# Project',
        'images/logo.png': 'fake-image-data',
      });

      const { stdout, exitCode } = runScan([tempDir]);
      expect(stdout).toMatch(/No code detected/);
      expect(exitCode).toBe(0);
    });

    it('handles permission denied gracefully', async () => {
      // Skip on Windows where chmod doesn't work the same way
      if (process.platform === 'win32') {
        return;
      }

      await createTestFiles({
        'package.json': '{}',
        'index.ts': 'export const x = 1;',
        'secret.ts': 'export const secret = "hidden";',
      });

      // Make one file unreadable
      await fs.chmod(path.join(tempDir, 'secret.ts'), 0o000);

      const { stdout, exitCode } = runScan([tempDir]);
      // The important thing is that the scan completes without crashing
      expect(stdout).toMatch(/Language\s+Node\.js/);
      expect(exitCode).toBe(0);

      // Restore permissions for cleanup
      await fs.chmod(path.join(tempDir, 'secret.ts'), 0o644);
    });
  });
});

describe('countFiles utility', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'countfiles-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Helper to create test files
   */
  async function createFiles(files: string[]): Promise<void> {
    for (const file of files) {
      const fullPath = path.join(tempDir, file);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, '// content');
    }
  }

  describe('source file counting', () => {
    it('counts .ts files as source', async () => {
      await createFiles(['a.ts', 'b.ts', 'c.ts']);
      const result = await countFiles(tempDir);
      expect(result.source).toBe(3);
    });

    it('counts .tsx files as source', async () => {
      await createFiles(['a.tsx', 'b.tsx']);
      const result = await countFiles(tempDir);
      expect(result.source).toBe(2);
    });

    it('counts .py files as source', async () => {
      await createFiles(['a.py', 'b.py', 'c.py', 'd.py']);
      const result = await countFiles(tempDir);
      expect(result.source).toBe(4);
    });

    it('counts multiple languages', async () => {
      await createFiles(['a.ts', 'b.ts', 'c.py', 'd.py', 'e.go']);
      const result = await countFiles(tempDir);
      expect(result.source).toBe(5);
    });

    it('excludes test files from source count', async () => {
      await createFiles(['foo.ts', 'foo.test.ts']);
      const result = await countFiles(tempDir);
      expect(result.source).toBe(1);
    });
  });

  describe('test file counting', () => {
    it('counts *.test.ts files', async () => {
      await createFiles(['foo.test.ts', 'bar.test.ts']);
      const result = await countFiles(tempDir);
      expect(result.test).toBe(2);
    });

    it('counts *.spec.ts files', async () => {
      await createFiles(['foo.spec.ts']);
      const result = await countFiles(tempDir);
      expect(result.test).toBe(1);
    });

    it('counts files in tests/ directory', async () => {
      await createFiles(['tests/helper.ts']);
      const result = await countFiles(tempDir);
      expect(result.test).toBe(1);
    });

    it('counts files in __tests__/ directory', async () => {
      await createFiles(['__tests__/utils.ts']);
      const result = await countFiles(tempDir);
      expect(result.test).toBe(1);
    });

    it('counts test_*.py files', async () => {
      await createFiles(['test_utils.py']);
      const result = await countFiles(tempDir);
      expect(result.test).toBe(1);
    });
  });

  describe('config file counting', () => {
    it('counts package.json as config', async () => {
      await createFiles(['package.json']);
      const result = await countFiles(tempDir);
      expect(result.config).toBe(1);
    });

    it('counts tsconfig.json as config', async () => {
      await createFiles(['tsconfig.json']);
      const result = await countFiles(tempDir);
      expect(result.config).toBe(1);
    });

    it('counts multiple config files', async () => {
      await createFiles(['package.json', 'tsconfig.json', '.eslintrc.js']);
      const result = await countFiles(tempDir);
      expect(result.config).toBe(3);
    });

    it('counts .env files as config', async () => {
      await createFiles(['.env', '.env.local']);
      const result = await countFiles(tempDir);
      expect(result.config).toBe(2);
    });
  });

  describe('total calculation', () => {
    it('total equals source + test + config', async () => {
      await createFiles([
        'src/a.ts',
        'src/b.ts',
        'src/c.ts',
        'foo.test.ts',
        'bar.test.ts',
        'package.json',
      ]);
      const result = await countFiles(tempDir);
      expect(result.source).toBe(3);
      expect(result.test).toBe(2);
      expect(result.config).toBe(1);
      expect(result.total).toBe(6);
    });

    it('returns zero counts for empty directory', async () => {
      const result = await countFiles(tempDir);
      expect(result.source).toBe(0);
      expect(result.test).toBe(0);
      expect(result.config).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('directory exclusions', () => {
    it('excludes node_modules from all counts', async () => {
      await createFiles(['src/index.ts', 'node_modules/lodash/index.js']);
      const result = await countFiles(tempDir);
      expect(result.source).toBe(1);
    });

    it('excludes .git from all counts', async () => {
      await createFiles(['src/index.ts', '.git/objects/abc123']);
      const result = await countFiles(tempDir);
      expect(result.source).toBe(1);
    });

    it('excludes dist from all counts', async () => {
      await createFiles(['src/index.ts', 'dist/index.js']);
      const result = await countFiles(tempDir);
      expect(result.source).toBe(1);
    });

    it('excludes vendor from all counts', async () => {
      await createFiles(['src/main.go', 'vendor/github.com/pkg/errors/errors.go']);
      const result = await countFiles(tempDir);
      expect(result.source).toBe(1);
    });
  });

  describe('recursive counting', () => {
    it('counts nested source files', async () => {
      await createFiles([
        'src/index.ts',
        'src/utils/helper.ts',
        'src/utils/deep/nested.ts',
      ]);
      const result = await countFiles(tempDir);
      expect(result.source).toBe(3);
    });

    it('counts nested test files', async () => {
      await createFiles([
        'tests/unit/foo.test.ts',
        'tests/integration/bar.test.ts',
      ]);
      const result = await countFiles(tempDir);
      expect(result.test).toBe(2);
    });

    it('counts config files in subdirectories', async () => {
      await createFiles([
        'package.json',
        'packages/cli/package.json',
        'packages/cli/tsconfig.json',
      ]);
      const result = await countFiles(tempDir);
      expect(result.config).toBe(3);
    });
  });
});

describe('scanProject graceful degradation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'analyzer-degradation-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function createTestFiles(files: Record<string, string>): Promise<void> {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(tempDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }
  }

  it('returns language when analyzing basic project', async () => {
    await createTestFiles({
      'package.json': '{"name":"test","version":"1.0.0"}',
    });

    const { scanProject } = await import('../../src/engine/index.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.stack.language).not.toBeNull();
  });

  it('returns framework when detected', async () => {
    await createTestFiles({
      'package.json': JSON.stringify({
        name: 'test',
        dependencies: { next: '14.0.0' },
      }),
    });

    const { scanProject } = await import('../../src/engine/index.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.stack.framework).toBe('Next.js');
  });

  it('returns structure when analyzing project with directories', async () => {
    await createTestFiles({
      'package.json': '{}',
      'src/index.ts': 'export const x = 1;',
      'tests/foo.test.ts': 'test("x", () => {});',
    });

    const { scanProject } = await import('../../src/engine/index.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.structure).toBeDefined();
  });

  it('patterns null on surface tier (expected)', async () => {
    await createTestFiles({
      'package.json': '{"name":"test","version":"1.0.0"}',
    });

    const { scanProject } = await import('../../src/engine/index.js');
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.patterns).toBeNull();
    expect(result.stack).toBeDefined();
  });
});

describe('ana scan', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-test-fallback-'));
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  function runScan(args: string[] = []): { stdout: string; stderr: string; exitCode: number } {
    const cliPath = path.join(__dirname, '../../dist/index.js');
    try {
      const stdout = execSync(`node ${cliPath} scan ${args.join(' ')}`, {
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

  async function createTestFiles(files: Record<string, string>): Promise<void> {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(tempDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }
  }

  describe('dependency-file fallback detection', () => {
    it('detects Supabase from @supabase/supabase-js', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'test',
          dependencies: { '@supabase/supabase-js': '2.0.0' },
        }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      expect(stdout).toMatch(/Database\s+Supabase/);
    });

    it('detects Clerk from @clerk/nextjs', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'test',
          dependencies: { '@clerk/nextjs': '4.0.0' },
        }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      expect(stdout).toMatch(/Auth\s+Clerk/);
    });

    it('detects Vitest from devDependencies', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'test',
          devDependencies: { vitest: '2.0.0' },
        }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      expect(stdout).toMatch(/Testing\s+Vitest/);
    });

    it('detects Stripe as Payments category', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'test',
          dependencies: { stripe: '16.0.0' },
        }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      expect(stdout).toMatch(/Payments\s+Stripe/);
    });

    it('detects both Database and Auth from Supabase packages', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'test',
          dependencies: {
            '@supabase/supabase-js': '2.0.0',
            '@supabase/ssr': '0.5.0',
          },
        }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      expect(stdout).toMatch(/Database\s+Supabase/);
      expect(stdout).toMatch(/Auth\s+Supabase Auth/);
    });

    it('detects NextAuth', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'test',
          dependencies: { 'next-auth': '4.0.0' },
        }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      expect(stdout).toMatch(/Auth\s+NextAuth/);
    });

    it('detects Prisma', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'test',
          dependencies: { prisma: '5.0.0' },
        }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      expect(stdout).toMatch(/Database\s+Prisma/);
    });

    it('handles no relevant deps gracefully', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'test',
          dependencies: { lodash: '4.0.0' },
        }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      expect(stdout).not.toMatch(/Database/);
      expect(stdout).not.toMatch(/Auth/);
      expect(stdout).not.toMatch(/Payments/);
    });

    it('handles empty package.json gracefully', async () => {
      await createTestFiles({
        'package.json': '{}',
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout, exitCode } = runScan();
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Language\s+Node\.js/);
    });

    it('handles missing package.json gracefully', async () => {
      await createTestFiles({
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout, exitCode } = runScan();
      expect(exitCode).toBe(0);
      // Should not crash - produces output with the box header
      expect(stdout).toContain('┌');
    });

    it('includes payments in JSON output', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'test',
          dependencies: { stripe: '16.0.0' },
        }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan(['--json']);
      const result = JSON.parse(stdout);
      expect(result.stack.payments).toBe('Stripe');
    });
  });

  describe('monorepo detection', () => {
    it('detects pnpm-workspace.yaml as pnpm monorepo', async () => {
      await createTestFiles({
        'pnpm-workspace.yaml': 'packages:\n  - "packages/*"',
        'packages/cli/package.json': JSON.stringify({ name: 'cli' }),
        'packages/web/package.json': JSON.stringify({ name: 'web' }),
        'package.json': JSON.stringify({ name: 'root' }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      expect(stdout).toMatch(/Workspace\s+pnpm monorepo/);
      // P1 redesign: Packages section removed, package info in Workspace line
      expect(stdout).toMatch(/Workspace/);
    });

    it('shows no workspace info for non-monorepo', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({ name: 'test' }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      expect(stdout).not.toMatch(/Workspace/);
      expect(stdout).not.toMatch(/Packages/);
    });

    it('detects package.json workspaces', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'root',
          workspaces: ['apps/*'],
        }),
        'apps/web/package.json': JSON.stringify({ name: 'web' }),
        'index.ts': 'const x = 1;',
        // @manypkg requires a lockfile to detect workspace tool
        'yarn.lock': '',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      expect(stdout).toMatch(/Workspace\s+yarn monorepo/);
    });

    it('includes packages in JSON output', async () => {
      await createTestFiles({
        'pnpm-workspace.yaml': 'packages:\n  - "packages/*"',
        'packages/cli/package.json': JSON.stringify({ name: 'cli' }),
        'package.json': JSON.stringify({ name: 'root' }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan(['--json']);
      const result = JSON.parse(stdout);
      expect(result.stack.workspace).toBe('pnpm monorepo');
      expect(result.monorepo).toBeDefined();
      expect(result.monorepo.packages).toBeInstanceOf(Array);
      expect(result.monorepo.packages.length).toBeGreaterThan(0);
    });

    // @ana A011
    it('Workspace line does not include inline Surfaces sub-item', async () => {
      await createTestFiles({
        'pnpm-workspace.yaml': 'packages:\n  - "packages/*"',
        'packages/cli/package.json': JSON.stringify({ name: 'cli', bin: { cli: 'index.js' }, scripts: { dev: 'node index.js' } }),
        'packages/web/package.json': JSON.stringify({ name: 'web', dependencies: { next: '14.0.0' } }),
        'package.json': JSON.stringify({ name: 'root' }),
        'index.ts': 'const x = 1;',
        // Enough source files to meet MIN_SOURCE_FILES for surface detection
        ...Object.fromEntries(
          Array.from({ length: 6 }, (_, i) => [`packages/cli/src/f${i}.ts`, `export const x${i} = ${i};`]),
        ),
        ...Object.fromEntries(
          Array.from({ length: 6 }, (_, i) => [`packages/web/src/f${i}.ts`, `export const x${i} = ${i};`]),
        ),
        'packages/web/next.config.js': 'module.exports = {};',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      // Workspace line should exist but NOT contain "Surfaces" as a sub-item
      const workspaceLine = stdout.split('\n').find((l: string) => l.includes('Workspace'));
      expect(workspaceLine).toBeDefined();
      expect(workspaceLine).not.toContain('Surfaces');
    });
  });

  // @ana A001, A002, A003, A004, A005, A006, A010
  describe('Surfaces section', () => {
    /**
     * Helper to create a monorepo with surfaces.
     * Each surface has enough source files to meet MIN_SOURCE_FILES.
     */
    async function createMonorepoWithSurfaces(
      surfaces: Array<{ name: string; framework?: string; deps?: Record<string, string>; devDeps?: Record<string, string>; configFile?: [string, string] }>,
    ): Promise<void> {
      const files: Record<string, string> = {
        'pnpm-workspace.yaml': 'packages:\n  - "packages/*"',
        'package.json': JSON.stringify({ name: 'root' }),
        'index.ts': 'const x = 1;',
      };
      for (const s of surfaces) {
        const pkg: Record<string, unknown> = {
          name: s.name,
          bin: { [s.name]: 'index.js' },
          scripts: { dev: 'node index.js' },
        };
        if (s.deps) pkg['dependencies'] = s.deps;
        if (s.devDeps) pkg['devDependencies'] = s.devDeps;
        files[`packages/${s.name}/package.json`] = JSON.stringify(pkg);
        // Enough source files
        for (let i = 0; i < 6; i++) {
          files[`packages/${s.name}/src/f${i}.ts`] = `export const x${i} = ${i};`;
        }
        if (s.configFile) {
          files[`packages/${s.name}/${s.configFile[0]}`] = s.configFile[1];
        }
      }
      await createTestFiles(files);
      process.chdir(tempDir);
    }

    it('renders Surfaces section with header and divider for monorepo', async () => {
      await createMonorepoWithSurfaces([
        { name: 'cli', devDeps: { vitest: '2.0.0' } },
        { name: 'web', deps: { next: '14.0.0' }, devDeps: { vitest: '2.0.0' }, configFile: ['next.config.js', 'module.exports = {};'] },
      ]);

      const { stdout } = runScan();
      expect(stdout).toContain('Surfaces');
      // Divider for "Surfaces" (8 chars)
      expect(stdout).toMatch(/────────/);
    });

    it('shows surface name, framework/language, and testing on each line', async () => {
      await createMonorepoWithSurfaces([
        { name: 'cli', devDeps: { vitest: '2.0.0' } },
        { name: 'web', deps: { next: '14.0.0' }, devDeps: { vitest: '2.0.0' }, configFile: ['next.config.js', 'module.exports = {};'] },
      ]);

      const { stdout } = runScan();
      const lines = stdout.split('\n');

      // Find lines after "Surfaces" header
      const surfIdx = lines.findIndex((l: string) => l.includes('Surfaces') && !l.includes('────'));
      expect(surfIdx).toBeGreaterThan(-1);

      // Check for surface data lines (after header + divider)
      const surfaceBlock = lines.slice(surfIdx + 2, surfIdx + 6).join('\n');
      expect(surfaceBlock).toContain('cli');
      expect(surfaceBlock).toContain('web');

      // Value-level assertions: verify rendered framework, language, and testing
      expect(surfaceBlock).toContain('Next.js');
      expect(surfaceBlock).toContain('JavaScript');
      expect(surfaceBlock).toContain('Vitest');
    });

    // @ana A007
    it('surfaces without testing show identity only (no separator)', async () => {
      await createMonorepoWithSurfaces([
        { name: 'cli' },  // no devDeps with testing framework
      ]);

      const { stdout } = runScan();
      const lines = stdout.split('\n');
      const surfIdx = lines.findIndex((l: string) => l.includes('Surfaces') && !l.includes('────'));
      expect(surfIdx).toBeGreaterThan(-1);
      // The cli surface line should not contain " · " separator since no testing
      const cliLine = lines.slice(surfIdx + 2).find((l: string) => l.includes('cli'));
      expect(cliLine).toBeDefined();
      expect(cliLine).not.toContain(' · ');
    });

    // @ana A008
    it('shows overflow indicator for 5+ surfaces', async () => {
      await createMonorepoWithSurfaces([
        { name: 'svc1' },
        { name: 'svc2' },
        { name: 'svc3' },
        { name: 'svc4' },
        { name: 'svc5' },
      ]);

      const { stdout } = runScan();
      expect(stdout).toContain('(+1 more)');
    });

    // @ana A009
    it('shows no overflow for exactly 4 surfaces', async () => {
      await createMonorepoWithSurfaces([
        { name: 'svc1' },
        { name: 'svc2' },
        { name: 'svc3' },
        { name: 'svc4' },
      ]);

      const { stdout } = runScan();
      expect(stdout).not.toContain('(+');
    });

    it('omits Surfaces section for single-repo project', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({ name: 'test', devDependencies: { vitest: '2.0.0' } }),
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      // "Surfaces" should not appear as a section header
      const lines = stdout.split('\n');
      const hasSurfaceSection = lines.some((l: string) =>
        l.trim() === 'Surfaces' || l.match(/^\s+Surfaces\s*$/),
      );
      expect(hasSurfaceSection).toBe(false);
    });
  });

  describe('box alignment', () => {
    // @ana A001
    it('name line with shape badge has correct box width', async () => {
      // Project with a detected shape — the name line must be exactly boxWidth (71) chars
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'inbox-zero',
          dependencies: { next: '15.0.0', react: '19.0.0', 'react-dom': '19.0.0' },
        }),
        'app/page.tsx': 'export default function Home() { return <div />; }',
        'app/layout.tsx': 'export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }',
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      const lines = stdout.split('\n');
      // Find the name line (contains project name between │ borders)
      const nameLine = lines.find((l: string) => l.includes('inbox-zero') && l.includes('│'));
      expect(nameLine).toBeDefined();
      // With FORCE_COLOR=0, no ANSI codes — line length should be exactly 71
      expect(nameLine!.length).toBe(71);
    });

    // @ana A002
    it('summary line has correct box width', async () => {
      await createTestFiles({
        'package.json': JSON.stringify({
          name: 'test-project',
          dependencies: { next: '15.0.0', react: '19.0.0', 'react-dom': '19.0.0' },
        }),
        'app/page.tsx': 'export default function Home() { return <div />; }',
        'app/layout.tsx': 'export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }',
        'index.ts': 'const x = 1;',
      });
      process.chdir(tempDir);

      const { stdout } = runScan();
      const lines = stdout.split('\n');
      // Find summary line — contains "Next.js" between │ borders, but NOT the name line
      const summaryLine = lines.find((l: string) =>
        l.includes('Next.js') && l.includes('│') && !l.includes('test-project'),
      );
      if (summaryLine) {
        expect(summaryLine.length).toBe(71);
      }
    });

    // @ana A003, A004
    it('drops package count from summary when it would overflow', async () => {
      // Create a monorepo with Prisma + PostgreSQL (long database display) + many packages.
      // The primary package has the deps so the scanner detects them.
      // Summary would be: "TypeScript · Next.js · Prisma → PostgreSQL (100 models) · 113 packages"
      // That's 72 visible chars with "  " prefix = 74, exceeding innerWidth of 69
      const files: Record<string, string> = {
        'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n  - "apps/*"',
        'package.json': JSON.stringify({ name: 'calcom-monorepo' }),
        'apps/web/package.json': JSON.stringify({
          name: 'web',
          dependencies: { '@prisma/client': '5.0.0', next: '15.0.0', react: '19.0.0', 'react-dom': '19.0.0' },
        }),
        'apps/web/app/page.tsx': 'export default function Home() { return <div />; }',
        'apps/web/app/layout.tsx': 'export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }',
        'apps/web/src/index.ts': 'export const x = 1;',
      };
      // Create many packages to produce "113 packages" in summary
      for (let i = 0; i < 113; i++) {
        files[`packages/pkg${i}/package.json`] = JSON.stringify({ name: `pkg${i}` });
      }
      // Prisma schema in conventional location with enough models to produce a 4-digit count.
      // "Prisma → PostgreSQL (1000 models)" is 1 char longer than "(100 models)",
      // pushing "  " + summary past innerWidth (69) to trigger overflow.
      const models = Array.from({ length: 1000 }, (_, i) => `model M${i} { id Int @id }`).join('\n');
      files['prisma/schema.prisma'] = `datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n${models}`;

      await createTestFiles(files);
      process.chdir(tempDir);

      const { stdout } = runScan();
      const lines = stdout.split('\n');
      // Find the summary line (between │ borders, contains the tech stack but not the project name)
      const summaryLine = lines.find((l: string) =>
        l.includes('│') && (l.includes('·') || l.includes('Prisma')) && !l.includes('calcom-monorepo'),
      );
      expect(summaryLine).toBeDefined();
      // Summary must fit within box width
      expect(summaryLine!.length).toBe(71);
      // If the original summary would have overflowed, package count is dropped
      // (package count is shown in the Workspace line below the box)
      if (summaryLine!.includes('Prisma')) {
        expect(summaryLine!).not.toContain('packages');
      }
    });
  });
});

describe('contributor display label', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-contrib-'));
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  function runScan(args: string[] = []): { stdout: string; stderr: string; exitCode: number } {
    const cliPath = path.join(__dirname, '../../dist/index.js');
    try {
      const stdout = execSync(`node ${cliPath} scan ${args.join(' ')}`, {
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

  // @ana A005, A006, A007
  it('displays active contributor count', async () => {
    // Create a git repo with commits so activity data is populated
    execSync('git init', { cwd: tempDir, stdio: ['pipe', 'pipe', 'pipe'] });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: ['pipe', 'pipe', 'pipe'] });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: ['pipe', 'pipe', 'pipe'] });
    await fs.writeFile(path.join(tempDir, 'package.json'), '{"name":"test","version":"1.0.0"}');
    await fs.writeFile(path.join(tempDir, 'index.ts'), 'export const foo = 1;');
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: ['pipe', 'pipe', 'pipe'] });

    process.chdir(tempDir);
    const { stdout } = runScan();

    // The Activity line should include "active contributor" (singular or plural)
    const activityLine = stdout.split('\n').find((l: string) => l.includes('Activity'));
    expect(activityLine).toBeDefined();
    expect(activityLine).toContain('active contributor');
    // Singular: "1 active contributor" not "1 active contributors"
    if (activityLine!.includes('1 active contributor')) {
      expect(activityLine).not.toContain('1 active contributors');
    }
  });
});

describe('display name mapping', () => {
  it('maps node to Node.js', () => {
    expect(getLanguageDisplayName('node')).toBe('Node.js');
  });

  it('maps python to Python', () => {
    expect(getLanguageDisplayName('python')).toBe('Python');
  });

  it('maps go to Go', () => {
    expect(getLanguageDisplayName('go')).toBe('Go');
  });

  it('maps nextjs to Next.js', () => {
    expect(getFrameworkDisplayName('nextjs')).toBe('Next.js');
  });

  it('maps fastapi to FastAPI', () => {
    expect(getFrameworkDisplayName('fastapi')).toBe('FastAPI');
  });

  it('maps vitest to Vitest', () => {
    expect(getPatternDisplayName('vitest')).toBe('Vitest');
  });

  it('maps prisma to Prisma', () => {
    expect(getPatternDisplayName('prisma')).toBe('Prisma');
  });
});
