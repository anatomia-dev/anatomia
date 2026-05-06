import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

/**
 * Tests for `ana setup check` command.
 *
 * Uses temp directories with .ana/context/ structure for isolation.
 */

describe('ana setup check', () => {
  let tempDir: string;
  let contextPath: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'check-test-'));
    contextPath = path.join(tempDir, '.ana', 'context');
    await fs.mkdir(contextPath, { recursive: true });
    // findProjectRoot requires ana.json + .git/ to identify this as a valid project root
    await fs.writeFile(path.join(tempDir, '.ana', 'ana.json'), '{}');
    await fs.mkdir(path.join(tempDir, '.git'), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  function runCheck(args: string = ''): { stdout: string; exitCode: number } {
    const cliPath = path.join(originalCwd, 'dist', 'index.js');
    try {
      const stdout = execSync(`node ${cliPath} setup check ${args}`, {
        encoding: 'utf-8',
        cwd: tempDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { stdout, exitCode: 0 };
    } catch (error: unknown) {
      const execError = error as { stdout?: string; status?: number };
      return {
        stdout: execError.stdout || '',
        exitCode: execError.status || 1,
      };
    }
  }

  async function createContextFile(filename: string, content: string): Promise<void> {
    await fs.writeFile(path.join(contextPath, filename), content, 'utf-8');
  }

  /** Generate project-context.md with all 6 required sections */
  function generateProjectContext(extra: string = ''): string {
    return `# Project Context

## What This Project Does
**Detected:** TypeScript · pnpm · Vitest
This project is a CLI tool for managing AI context.

## Architecture
**Detected:** 12 directories mapped: src/, tests/, templates/
Monorepo with CLI and website packages.

## Key Decisions
We chose TypeScript for type safety.

## Key Files
- src/commands/init.ts — main init flow
- src/engine/analyze.ts — project scanner

## Active Constraints
Do not modify engine types during active sprints.

## Domain Vocabulary
- Scaffold: auto-generated context file
- Skill: editable team standards file
${extra}`;
  }

  describe('single-file check', () => {
    it('returns correct JSON structure', async () => {
      await createContextFile('project-context.md', generateProjectContext());

      const { stdout, exitCode } = runCheck('project-context.md --json');
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty('file', 'project-context.md');
      expect(result).toHaveProperty('line_count');
      expect(result.line_count).toHaveProperty('actual');
      expect(result.line_count).toHaveProperty('pass');
      expect(result).toHaveProperty('headers');
      expect(result).toHaveProperty('placeholders');
      expect(result).toHaveProperty('scaffold_markers');
      expect(result).toHaveProperty('citations');
      expect(result).toHaveProperty('overall');
      expect(exitCode).toBe(0);
    });

    it('passes when file has all required sections', async () => {
      await createContextFile('project-context.md', generateProjectContext());

      const { stdout, exitCode } = runCheck('project-context.md --json');
      const result = JSON.parse(stdout);

      expect(result.overall).toBe(true);
      expect(result.headers.pass).toBe(true);
      expect(result.placeholders.pass).toBe(true);
      expect(result.scaffold_markers.pass).toBe(true);
      expect(exitCode).toBe(0);
    });
  });

  describe('all-files check', () => {
    it('returns array of file results', async () => {
      await createContextFile('project-context.md', generateProjectContext());
      await createContextFile('design-principles.md', '# Design Principles\n\nMove fast and verify.\n');

      const { stdout, exitCode } = runCheck('--json');
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty('files');
      expect(result.files).toHaveLength(2);
      expect(result).toHaveProperty('overall');
      expect(result.overall).toBe(true);
      expect(exitCode).toBe(0);
    });
  });

  describe('structural validation (no line counts)', () => {
    it('line count always passes regardless of file size', async () => {
      // Even very short files pass line count
      await createContextFile('project-context.md', generateProjectContext());

      const { stdout } = runCheck('project-context.md --json');
      const result = JSON.parse(stdout);

      expect(result.line_count.pass).toBe(true);
    });

    it('line count passes for scaffold files', async () => {
      const scaffoldContent = '<!-- SCAFFOLD - Setup will fill this file -->\n## What This Project Does\n## Architecture\n## Key Decisions\n## Key Files\n## Active Constraints\n## Domain Vocabulary\n';
      await createContextFile('project-context.md', scaffoldContent);

      const { stdout } = runCheck('project-context.md --json');
      const result = JSON.parse(stdout);

      expect(result.line_count.pass).toBe(true);
    });

    it('fails headers when required sections missing', async () => {
      // Missing several required sections
      const content = '# Project Context\n\n## What This Project Does\nSome content.\n';
      await createContextFile('project-context.md', content);

      const { stdout, exitCode } = runCheck('project-context.md --json');
      const result = JSON.parse(stdout);

      expect(result.headers.pass).toBe(false);
      expect(exitCode).toBe(1);
    });

    it('design-principles passes with any content', async () => {
      // design-principles has no required sections
      await createContextFile('design-principles.md', '# Design Principles\n\nOur team values simplicity.\n');

      const { stdout, exitCode } = runCheck('design-principles.md --json');
      const result = JSON.parse(stdout);

      expect(result.headers.pass).toBe(true);
      expect(exitCode).toBe(0);
    });
  });

  describe('placeholder detection', () => {
    it('fails when file contains TODO', async () => {
      const content = generateProjectContext('\nTODO: fix this later\n');
      await createContextFile('project-context.md', content);

      const { stdout, exitCode } = runCheck('project-context.md --json');
      const result = JSON.parse(stdout);

      expect(result.placeholders.pass).toBe(false);
      expect(result.placeholders.count).toBeGreaterThan(0);
      expect(result.overall).toBe(false);
      expect(exitCode).toBe(1);
    });

    it('passes when file has no placeholders', async () => {
      await createContextFile('project-context.md', generateProjectContext());

      const { stdout } = runCheck('project-context.md --json');
      const result = JSON.parse(stdout);

      expect(result.placeholders.pass).toBe(true);
      expect(result.placeholders.count).toBe(0);
    });

    it('detects multiple placeholder types', async () => {
      const content = generateProjectContext('\nTODO: a\nFIXME: b\n[INSERT something]\nTBD\n');
      await createContextFile('project-context.md', content);

      const { stdout } = runCheck('project-context.md --json');
      const result = JSON.parse(stdout);

      expect(result.placeholders.pass).toBe(false);
      expect(result.placeholders.count).toBeGreaterThanOrEqual(4);
    });
  });

  describe('scaffold marker detection', () => {
    it('fails when file contains scaffold marker', async () => {
      const content = '<!-- SCAFFOLD - Setup will fill this file -->\n' + generateProjectContext();
      await createContextFile('project-context.md', content);

      const { stdout, exitCode } = runCheck('project-context.md --json');
      const result = JSON.parse(stdout);

      expect(result.scaffold_markers.pass).toBe(false);
      expect(result.scaffold_markers.count).toBe(1);
      expect(result.overall).toBe(false);
      expect(exitCode).toBe(1);
    });

    it('passes when file has no scaffold markers', async () => {
      await createContextFile('project-context.md', generateProjectContext());

      const { stdout } = runCheck('project-context.md --json');
      const result = JSON.parse(stdout);

      expect(result.scaffold_markers.pass).toBe(true);
      expect(result.scaffold_markers.count).toBe(0);
    });
  });

  describe('citation verification', () => {
    it('passes when cited file exists', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'utils.ts'), 'line1\nline2\nline3\nline4\nline5\n');

      const content = generateProjectContext('\n\nExample from `src/utils.ts` (lines 1-3):\n```\ncode\n```\n');
      await createContextFile('project-context.md', content);

      const { stdout } = runCheck('project-context.md --json');
      const result = JSON.parse(stdout);

      expect(result.citations.total).toBe(1);
      expect(result.citations.verified).toBe(1);
      expect(result.citations.pass).toBe(true);
    });

    it('fails when cited file does not exist', async () => {
      const content = generateProjectContext('\n\nExample from `nonexistent/file.ts` (lines 1-10):\n```\ncode\n```\n');
      await createContextFile('project-context.md', content);

      const { stdout, exitCode } = runCheck('project-context.md --json');
      const result = JSON.parse(stdout);

      expect(result.citations.total).toBe(1);
      expect(result.citations.verified).toBe(0);
      expect(result.citations.failed).toHaveLength(1);
      expect(result.citations.failed[0].reason).toBe('file not found');
      expect(result.citations.pass).toBe(false);
      expect(exitCode).toBe(1);
    });
  });

  describe('exit codes', () => {
    it('returns exit code 0 when all pass', async () => {
      await createContextFile('project-context.md', generateProjectContext());

      const { exitCode } = runCheck('project-context.md --json');
      expect(exitCode).toBe(0);
    });

    it('returns exit code 1 when any fail', async () => {
      // Missing required sections
      const content = '# Project Context\n\nSome content.\n';
      await createContextFile('project-context.md', content);

      const { exitCode } = runCheck('project-context.md --json');
      expect(exitCode).toBe(1);
    });
  });

  describe('error handling', () => {
    it('gives helpful error when .ana/context/ does not exist', async () => {
      await fs.rm(contextPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });

      const { stdout, exitCode } = runCheck('--json');
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('.ana/context/');
      expect(exitCode).toBe(1);
    });

    it('gives helpful error when specific file not found', async () => {
      const { stdout, exitCode } = runCheck('nonexistent.md --json');
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('not found');
      expect(exitCode).toBe(1);
    });
  });
});
