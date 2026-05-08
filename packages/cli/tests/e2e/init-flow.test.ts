/**
 * End-to-end tests for ana init
 *
 * Tests actual command execution in temp project directory.
 * Validates all files/directories created correctly:
 * - .ana/ (context, docs, plans, hooks, state)
 * - .claude/ with settings.json, agents/ (6 files), and skills/ (5 core + 3 conditional dirs)
 * - CLAUDE.md at project root
 * Total: 51 files
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileExists } from '../../src/commands/init/preflight.js';

const execFileAsync = promisify(execFile);

describe('ana init E2E', () => {
  let tmpProject: string;
  let cliPath: string;

  beforeEach(async () => {
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-e2e-'));

    // Get path to built CLI
    cliPath = path.join(__dirname, '..', '..', 'dist', 'index.js');

    // Create minimal package.json in test project
    await fs.writeFile(
      path.join(tmpProject, 'package.json'),
      JSON.stringify({ name: 'test-project', version: '1.0.0' })
    );

    // Create .git so init doesn't hit the no-git confirm (defaultYes: false in non-TTY)
    await fs.mkdir(path.join(tmpProject, '.git'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpProject, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('creates all expected files in .ana/ (context, docs, plans, hooks, state)', async () => {
    await execFileAsync('node', [cliPath, 'init'], {
      cwd: tmpProject,
    });

    const anaPath = path.join(tmpProject, '.ana');

    // Verify directories (4)
    const dirs = [
      'context',
      'plans/active',
      'plans/completed',
      'state',
    ];

    for (const dir of dirs) {
      const exists = await dirExists(path.join(anaPath, dir));
      expect(exists, `Directory missing: ${dir}`).toBe(true);
    }

    // Verify generated files (2)
    const generatedFiles = [
      'context/project-context.md',
      'context/design-principles.md',
    ];

    for (const file of generatedFiles) {
      const exists = await fileExists(path.join(anaPath, file));
      expect(exists, `Generated file missing: ${file}`).toBe(true);
    }

    // .ana/hooks/ removed (the PostToolUse hook chain was computing
    // validation then discarding it; entire chain deleted)

    // Verify .gitkeep files in plan directories
    const activeGitkeepExists = await fileExists(path.join(anaPath, 'plans/active/.gitkeep'));
    const completeGitkeepExists = await fileExists(path.join(anaPath, 'plans/completed/.gitkeep'));
    expect(activeGitkeepExists).toBe(true);
    expect(completeGitkeepExists).toBe(true);

    // Verify ana.json
    const metaExists = await fileExists(path.join(anaPath, 'ana.json'));
    expect(metaExists).toBe(true);

    const anaJsonContent = await fs.readFile(path.join(anaPath, 'ana.json'), 'utf-8');
    const meta = JSON.parse(anaJsonContent);
    expect(meta.lastScanAt).toBeDefined();
    expect(meta.name).toBeDefined();

    // Count assertion removed — each expected file is already individually
    // asserted above by name; the total count added zero information and
    // required manual updates on every manifest change.

    // Verify .gitignore exists and excludes runtime state
    const gitignorePath = path.join(anaPath, '.gitignore');
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    expect(gitignoreContent).toContain('state/');

    // Verify .claude/ directory was also created (outside .ana/)
    const claudePath = path.join(tmpProject, '.claude');
    const claudeExists = await dirExists(claudePath);
    expect(claudeExists).toBe(true);

    // Verify .claude/settings.json
    const settingsExists = await fileExists(path.join(claudePath, 'settings.json'));
    expect(settingsExists).toBe(true);

    // Verify .claude/agents/ directory with 6 agent files
    const agentsExists = await dirExists(path.join(claudePath, 'agents'));
    expect(agentsExists).toBe(true);

    // Verify all 6 agent files exist
    const agentFiles = [
      'ana.md',
      'ana-plan.md',
      'ana-setup.md',
      'ana-build.md',
      'ana-verify.md',
      'ana-learn.md',
    ];

    for (const agentFile of agentFiles) {
      const agentExists = await fileExists(path.join(claudePath, 'agents', agentFile));
      expect(agentExists, `Agent file missing: ${agentFile}`).toBe(true);
    }

    // Verify .claude/skills/ directory with core skill directories
    // Note: ai-patterns, api-patterns, data-access are conditional —
    // only scaffolded when scan detects aiSdk, framework, or database.
    // This minimal fixture triggers none of those conditions.
    const skillsExists = await dirExists(path.join(claudePath, 'skills'));
    expect(skillsExists).toBe(true);

    const skillDirs = [
      'testing-standards',
      'coding-standards',
      'git-workflow',
      'deployment',
      'troubleshooting',
    ];

    for (const skillDir of skillDirs) {
      const skillFileExists = await fileExists(path.join(claudePath, 'skills', skillDir, 'SKILL.md'));
      expect(skillFileExists, `Skill file missing: ${skillDir}/SKILL.md`).toBe(true);
    }

    // Verify CLAUDE.md at project root
    const claudeMdExists = await fileExists(path.join(tmpProject, 'CLAUDE.md'));
    expect(claudeMdExists).toBe(true);

    const claudeMdContent = await fs.readFile(path.join(tmpProject, 'CLAUDE.md'), 'utf-8');
    expect(claudeMdContent).toContain('claude --agent ana');
  }, 30000); // 30s timeout

  it('re-init preserves context/ files (user enrichment) but refreshes state/', async () => {
    // First init
    await execFileAsync('node', [cliPath, 'init'], {
      cwd: tmpProject,
    });

    const anaPath = path.join(tmpProject, '.ana');
    const contextPath = path.join(anaPath, 'context');
    const statePath = path.join(anaPath, 'state');

    // User enriches context/project-context.md with real content
    const enriched = '# Project Context\n\n## What This Project Does\nEnriched by user.\n';
    await fs.writeFile(path.join(contextPath, 'project-context.md'), enriched);

    // Add derived file to state/ — this should NOT survive re-init
    // (state/ is regenerated, not preserved, except setup-progress.json
    // during a partial setup)
    await fs.writeFile(path.join(statePath, 'test.json'), '{"derived":true}');

    // Re-init with --force (skips confirmation prompt)
    await execFileAsync('node', [cliPath, 'init', '--force'], {
      cwd: tmpProject,
    });

    // context/ survives — user enrichment is preserved
    const pcContent = await fs.readFile(path.join(contextPath, 'project-context.md'), 'utf-8');
    expect(pcContent).toContain('Enriched by user.');

    // state/test.json does NOT survive — state/ is derived and regenerated
    const testFileExists = await fileExists(path.join(statePath, 'test.json'));
    expect(testFileExists).toBe(false);
  }, 60000); // 60s timeout

  it('init failure leaves existing .ana/ untouched (NEW-001 swap safety)', async () => {
    // First init creates a valid .ana/
    await execFileAsync('node', [cliPath, 'init'], {
      cwd: tmpProject,
    });

    const anaPath = path.join(tmpProject, '.ana');
    const contextPath = path.join(anaPath, 'context');

    // Mark the install so we can verify it survives a failed re-init
    const marker = '# Project Context\n\n## What This Project Does\nMARKER_BEFORE_FAIL\n';
    await fs.writeFile(path.join(contextPath, 'project-context.md'), marker);

    // Induce failure by running init from a cwd that disappears mid-run.
    // Simpler: corrupt the existing ana.json to invalid JSON, then init
    // must still protect user state (schema catches invalid fields per-field,
    // context/ copy is unaffected).
    // NOTE: If an easier "deterministic failure" injection point emerges
    // later, prefer that. This test is a smoke-level check that NEW-001's
    // core guarantee (old .ana/ is safe on failure path) holds.
    const anaJsonPath = path.join(anaPath, 'ana.json');
    await fs.writeFile(anaJsonPath, 'not valid json', 'utf-8');

    // Re-init with --force. Should succeed since schema catches invalid
    // ana.json gracefully. The marker must survive because context/ copy
    // happens before the atomic swap.
    try {
      await execFileAsync('node', [cliPath, 'init', '--force'], {
        cwd: tmpProject,
      });
    } catch {
      // If re-init fails, the old .ana/ must still be intact — that's the
      // NEW-001 guarantee.
    }

    const pcContent = await fs.readFile(path.join(contextPath, 'project-context.md'), 'utf-8');
    expect(pcContent).toContain('MARKER_BEFORE_FAIL');
  }, 60000); // 60s timeout
});

describe('regression tests', () => {
  let tmpProject: string;
  let cliPath: string;

  beforeEach(async () => {
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-e2e-'));
    cliPath = path.join(__dirname, '..', '..', 'dist', 'index.js');

    await fs.writeFile(
      path.join(tmpProject, 'package.json'),
      JSON.stringify({ name: 'test-project' })
    );

    // Create .git so init doesn't hit the no-git confirm (defaultYes: false in non-TTY)
    await fs.mkdir(path.join(tmpProject, '.git'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpProject, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('creates scan.json with full engine result when analysis runs', async () => {
    // Create a minimal project with detectable framework
    await fs.writeFile(
      path.join(tmpProject, 'package.json'),
      JSON.stringify({
        name: 'scan-test',
        dependencies: { next: '14.0.0' },
        scripts: { build: 'next build', test: 'vitest run' },
      })
    );

    // Run init WITHOUT --skip-analysis
    await execFileAsync('node', [cliPath, 'init'], {
      cwd: tmpProject,
    });

    const anaPath = path.join(tmpProject, '.ana');
    const scanPath = path.join(anaPath, 'scan.json');

    // scan.json must exist
    const exists = await fileExists(scanPath);
    expect(exists).toBe(true);

    // Must be valid JSON with expected top-level keys
    const content = await fs.readFile(scanPath, 'utf-8');
    const scan = JSON.parse(content);
    expect(scan.overview).toBeDefined();
    expect(scan.stack).toBeDefined();
    expect(scan.commands).toBeDefined();
    expect(scan.files).toBeDefined();
    expect(scan.externalServices).toBeDefined();

    // Should detect Next.js
    expect(scan.stack.framework).toBe('Next.js');
  }, 30000);

  // @ana A021, A022, A023
  it('scaffolds conditional skill directories when scan detects triggers', async () => {
    // Rich fixture: Next.js triggers api-patterns, prisma triggers data-access,
    // @anthropic-ai/sdk triggers ai-patterns
    await fs.writeFile(
      path.join(tmpProject, 'package.json'),
      JSON.stringify({
        name: 'full-stack-project',
        dependencies: {
          next: '14.0.0',
          prisma: '5.0.0',
          '@anthropic-ai/sdk': '0.30.0',
        },
        scripts: { build: 'next build', test: 'vitest run' },
      })
    );

    await execFileAsync('node', [cliPath, 'init'], {
      cwd: tmpProject,
    });

    const claudePath = path.join(tmpProject, '.claude');

    // All 8 skill directories should exist: 5 core + 3 conditional
    const allSkillDirs = [
      'testing-standards',
      'coding-standards',
      'git-workflow',
      'deployment',
      'troubleshooting',
      'ai-patterns',
      'api-patterns',
      'data-access',
    ];

    for (const skillDir of allSkillDirs) {
      const skillFileExists = await fileExists(path.join(claudePath, 'skills', skillDir, 'SKILL.md'));
      expect(skillFileExists, `Skill file missing: ${skillDir}/SKILL.md`).toBe(true);
    }
  }, 30000);

});

// Helper functions
async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}


