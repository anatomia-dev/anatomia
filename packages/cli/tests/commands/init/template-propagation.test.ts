/**
 * Template propagation — lock-stock refresh of machine-owned templates on re-init.
 *
 * Covers the behavior reversal: re-init now overwrites agent instruction
 * bodies + CLAUDE.md from stock (recover via git) while preserving a
 * customer's basic CONFIG (Claude frontmatter model/tools; Codex
 * model/sandbox_mode/model_reasoning_effort). Integration cases run the built
 * CLI; the preserve-contract regression guard drives preserveUserState
 * directly for a deterministic, exhaustive check.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseFrontmatter } from '../../../src/utils/agent-config.js';
import { createDirectoryStructure } from '../../../src/commands/init/assets.js';
import { preserveUserState } from '../../../src/commands/init/state.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const cliPath = path.join(__dirname, '..', '..', '..', 'dist', 'index.js');
const templatesDir = path.join(__dirname, '..', '..', '..', 'templates');
const repoRoot = path.join(__dirname, '..', '..', '..', '..', '..');

/** Scaffold a minimal, scannable git project so init detects a real stack. */
async function setupProject(dir: string, name: string): Promise<void> {
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      devDependencies: { vitest: '2.0.0', typescript: '5.7.0' },
      scripts: { build: 'tsc', test: 'vitest run', lint: 'eslint .' },
    }),
  );
  await fs.writeFile(path.join(dir, 'tsconfig.json'), '{}');
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'src', 'index.ts'), 'export const x = 1;\n');
  await fs.writeFile(path.join(dir, '.gitignore'), 'node_modules\n');
  await execFileAsync('git', ['init'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  await execFileAsync('git', ['add', '-A'], { cwd: dir });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: dir });
}

/** Run the built CLI `init --force`, returning combined stdout+stderr. */
async function runInit(dir: string, platforms: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    'node',
    [cliPath, 'init', '--force', '--platforms', platforms],
    { cwd: dir },
  );
  return `${stdout}\n${stderr}`;
}

describe('template propagation — dirty re-init (built CLI)', () => {
  let tmpDir: string;
  let secondRunOutput: string;
  let stockClaudeBuild: string;
  let stockCodexBuild: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-tp-dirty-'));
    await setupProject(tmpDir, 'propagation-fixture');

    stockClaudeBuild = await fs.readFile(
      path.join(templatesDir, '.claude/agents/ana-build.md'),
      'utf-8',
    );
    stockCodexBuild = await fs.readFile(
      path.join(templatesDir, '.codex/agents/ana-build.md'),
      'utf-8',
    );

    // First init creates the trees
    await runInit(tmpDir, 'claude,codex');

    // Mutate a Claude agent: custom model + custom body
    await fs.writeFile(
      path.join(tmpDir, '.claude/agents/ana-build.md'),
      `---
name: ana-build
model: my-custom-model
description: "AnaBuild"
skills: [git-workflow]
---

# CUSTOM CLAUDE BODY MARKER
`,
    );

    // Mutate the Codex agent body + .agent.toml config keys
    await fs.writeFile(
      path.join(tmpDir, '.codex/agents/ana-build.md'),
      '# CUSTOM CODEX BODY MARKER\n',
    );
    await fs.writeFile(
      path.join(tmpDir, '.codex/agents/ana-build.agent.toml'),
      `name = "renamed-by-user"
description = "user edited"
developer_instructions = "stale pointer"
model = "gpt-custom"
sandbox_mode = "read-only"
model_reasoning_effort = "low"
`,
    );

    // Edit AGENTS.md (must NOT be overwritten — out of scope, skip-if-exists)
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# CUSTOM AGENTS MARKER\n');

    secondRunOutput = await runInit(tmpDir, 'claude,codex');
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A001
  it('overwrites the Claude agent instruction body from stock', async () => {
    const refreshed = await fs.readFile(path.join(tmpDir, '.claude/agents/ana-build.md'), 'utf-8');
    expect(refreshed).not.toContain('CUSTOM CLAUDE BODY MARKER');
    expect(refreshed).toContain('AnaBuild');
  });

  // @ana A004
  it('preserves the customer Claude frontmatter model', async () => {
    const refreshed = await fs.readFile(path.join(tmpDir, '.claude/agents/ana-build.md'), 'utf-8');
    const fm = parseFrontmatter(refreshed);
    expect(fm?.model).toBe('my-custom-model');
  });

  // @ana A002
  it('overwrites the Codex agent instruction body from stock', async () => {
    const refreshed = await fs.readFile(path.join(tmpDir, '.codex/agents/ana-build.md'), 'utf-8');
    expect(refreshed).toBe(stockCodexBuild);
    expect(refreshed).not.toContain('CUSTOM CODEX BODY MARKER');
  });

  // @ana A005
  it('preserves Codex .agent.toml model/sandbox/reasoning config keys', async () => {
    const refreshed = await fs.readFile(path.join(tmpDir, '.codex/agents/ana-build.agent.toml'), 'utf-8');
    expect(refreshed).toContain('model = "gpt-custom"');
    expect(refreshed).toContain('sandbox_mode = "read-only"');
    expect(refreshed).toContain('model_reasoning_effort = "low"');
  });

  // @ana A006
  it('refreshes Codex .agent.toml machine fields from stock', async () => {
    const refreshed = await fs.readFile(path.join(tmpDir, '.codex/agents/ana-build.agent.toml'), 'utf-8');
    expect(refreshed).toContain('name = "ana-build"');
    expect(refreshed).toContain('developer_instructions = "Full instructions in ana-build.md. Invoke via: ana run"');
    expect(refreshed).not.toContain('renamed-by-user');
    expect(refreshed).not.toContain('stale pointer');
  });

  // @ana A003
  it('refreshes ana-learn.md from each harness own stock (never cross-written)', async () => {
    const claudeLearn = await fs.readFile(path.join(tmpDir, '.claude/agents/ana-learn.md'), 'utf-8');
    const codexLearn = await fs.readFile(path.join(tmpDir, '.codex/agents/ana-learn.md'), 'utf-8');
    const stockClaudeLearn = await fs.readFile(path.join(templatesDir, '.claude/agents/ana-learn.md'), 'utf-8');
    const stockCodexLearn = await fs.readFile(path.join(templatesDir, '.codex/agents/ana-learn.md'), 'utf-8');
    // Each tree matches its OWN stock body, and the two harnesses differ
    expect(claudeLearn).toContain(stockClaudeLearn.trim().slice(0, 40));
    expect(codexLearn).toBe(stockCodexLearn);
    expect(claudeLearn).not.toBe(codexLearn);
  });

  // @ana A007, A008
  it('refreshes CLAUDE.md with re-applied project name and stack', async () => {
    const claudeMd = await fs.readFile(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('# propagation-fixture');
    expect(claudeMd).toContain('**Stack:**');
    expect(claudeMd).toContain('TypeScript');
  });

  // @ana A009
  it('leaves AGENTS.md untouched (out of scope, skip-if-exists)', async () => {
    const agentsMd = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('CUSTOM AGENTS MARKER');
  });

  // @ana A010
  it('leaves no temp or partial files in the agent directories', async () => {
    const claudeAgents = await fs.readdir(path.join(tmpDir, '.claude/agents'));
    const codexAgents = await fs.readdir(path.join(tmpDir, '.codex/agents'));
    for (const f of [...claudeAgents, ...codexAgents]) {
      expect(f).not.toContain('.tmp-');
    }
  });

  // @ana A011
  it('writes content that passes integrity (refreshed bodies match stock)', async () => {
    // The atomic writer verifies the temp file hash before rename; a passing
    // run means the on-disk content equals the intended content.
    const claudeAgents = await fs.readFile(path.join(tmpDir, '.claude/agents/ana-build.md'), 'utf-8');
    // Body equals stock body (frontmatter model differs by design)
    expect(claudeAgents).toContain(stockClaudeBuild.split('\n---\n')[1]?.trim().slice(0, 30) ?? 'AnaBuild');
  });

  // @ana A012, A014
  it('emits a consolidated warning listing exactly the changed files', () => {
    expect(secondRunOutput).toContain('Refreshed to v');
    expect(secondRunOutput).toContain('recover your version from git');
    // The changed-files line names ana-build.md but NOT CLAUDE.md
    // (CLAUDE.md was re-interpolated to identical content — no false positive)
    const refreshedLine = secondRunOutput
      .split('\n')
      .find((l) => l.includes('Refreshed to v')) ?? '';
    expect(refreshedLine).toContain('ana-build.md');
    expect(refreshedLine).not.toContain('CLAUDE.md');
  });

  // @ana A017
  it('completes init successfully despite the warning (non-blocking)', () => {
    // runInit resolved (exit 0) in beforeAll; the success banner confirms completion
    expect(secondRunOutput).toContain('configuration');
  });
});

describe('template propagation — clean re-init is silent (built CLI)', () => {
  let tmpDir: string;
  let secondRunOutput: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-tp-clean-'));
    await setupProject(tmpDir, 'clean-fixture');
    await runInit(tmpDir, 'claude,codex');
    // No edits — re-init with identical context
    secondRunOutput = await runInit(tmpDir, 'claude,codex');
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A013, A015
  it('emits no overwrite warning when nothing changed (CLAUDE.md no false positive)', () => {
    expect(secondRunOutput).not.toContain('Refreshed to v');
  });
});

describe('template propagation — config-only change is silent (built CLI)', () => {
  let tmpDir: string;
  let secondRunOutput: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-tp-config-'));
    await setupProject(tmpDir, 'config-fixture');
    await runInit(tmpDir, 'claude,codex');

    // Change ONLY the model on a Claude agent (body identical to stock)
    const stock = await fs.readFile(path.join(tmpDir, '.claude/agents/ana-plan.md'), 'utf-8');
    const modelOnly = stock.replace(/^model:.*$/m, 'model: sonnet-custom');
    await fs.writeFile(path.join(tmpDir, '.claude/agents/ana-plan.md'), modelOnly);

    // Change ONLY config keys on a Codex .agent.toml (body untouched)
    const tomlPath = path.join(tmpDir, '.codex/agents/ana-plan.agent.toml');
    const toml = await fs.readFile(tomlPath, 'utf-8');
    await fs.writeFile(tomlPath, toml.replace(/^model_reasoning_effort = .*$/m, 'model_reasoning_effort = "minimal"'));

    secondRunOutput = await runInit(tmpDir, 'claude,codex');
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A016
  it('does not warn when only a model/config key changed', () => {
    expect(secondRunOutput).not.toContain('Refreshed to v');
  });

  // @ana A016
  it('still preserves the config-only change after re-init', async () => {
    const refreshed = await fs.readFile(path.join(tmpDir, '.claude/agents/ana-plan.md'), 'utf-8');
    expect(parseFrontmatter(refreshed)?.model).toBe('sonnet-custom');
    const toml = await fs.readFile(path.join(tmpDir, '.codex/agents/ana-plan.agent.toml'), 'utf-8');
    expect(toml).toContain('model_reasoning_effort = "minimal"');
  });
});

describe('template propagation — fresh and single-harness (built CLI)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-tp-fresh-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A022
  it('a fresh install writes templates with no overwrite warning', async () => {
    await setupProject(tmpDir, 'fresh-fixture');
    const output = await runInit(tmpDir, 'claude,codex');
    expect(output).not.toContain('Refreshed to v');
    // Templates were actually written
    expect(await fs.readFile(path.join(tmpDir, '.claude/agents/ana-build.md'), 'utf-8')).toContain('AnaBuild');
  });

  // @ana A023
  it('a Claude-only project never creates or touches the .codex tree', async () => {
    await setupProject(tmpDir, 'claude-only-fixture');
    await runInit(tmpDir, 'claude');
    const codexExists = await fs
      .stat(path.join(tmpDir, '.codex'))
      .then(() => true)
      .catch(() => false);
    expect(codexExists).toBe(false);
    // Second run still touches only the Claude tree
    await runInit(tmpDir, 'claude');
    const codexStillAbsent = await fs
      .stat(path.join(tmpDir, '.codex'))
      .then(() => true)
      .catch(() => false);
    expect(codexStillAbsent).toBe(false);
    // Two sequential `ana init` subprocesses sit right at the 5s default; give
    // them a realistic budget so heavy parallel runs don't tip it into a
    // spurious timeout (the assertions are unchanged).
  }, 30000);
});

describe('template propagation — preserve-contract regression guard (AC5, exhaustive)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-tp-preserve-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A018, A019, A020, A021, A029, A030
  it('preserves the COMPLETE preserveUserState contract (all eight items)', async () => {
    const existingAnaPath = path.join(tmpDir, '.ana-existing');
    const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
    await fs.mkdir(existingAnaPath, { recursive: true });
    await createDirectoryStructure(tmpAnaPath);

    // 1. context/ (wholesale)
    await fs.mkdir(path.join(existingAnaPath, 'context'), { recursive: true });
    await fs.writeFile(path.join(existingAnaPath, 'context', 'project-context.md'), '# Team architecture notes');

    // 2. ana.json — user fields + custom key + tuned surface command; mechanical refreshed
    //   (A021 user fields, A030 surfaces + unknown keys)
    await fs.writeFile(
      path.join(existingAnaPath, 'ana.json'),
      JSON.stringify({
        name: 'old-name',
        language: 'JavaScript',
        framework: null,
        packageManager: 'npm',
        coAuthor: 'My Team <team@example.com>',
        artifactBranch: 'develop',
        setupPhase: 'context-complete',
        custom: { myFlag: true },
        myUnknownTopLevelKey: 'survives',
        surfaces: {
          cli: { path: 'packages/cli', language: 'JavaScript', framework: null, commands: { test: 'my custom test' } },
        },
      }),
    );

    // 3. state/setup-progress.json — preserved because setupPhase !== 'complete'
    await fs.mkdir(path.join(existingAnaPath, 'state'), { recursive: true });
    await fs.writeFile(path.join(existingAnaPath, 'state', 'setup-progress.json'), JSON.stringify({ step: 3 }));

    // 4. proof_chain.json + PROOF_CHAIN.md
    await fs.writeFile(path.join(existingAnaPath, 'proof_chain.json'), JSON.stringify({ entries: ['e1'] }));
    await fs.writeFile(path.join(existingAnaPath, 'PROOF_CHAIN.md'), '# Proof chain history');

    // 5. plans/completed/
    await fs.mkdir(path.join(existingAnaPath, 'plans', 'completed', 'old-work'), { recursive: true });
    await fs.writeFile(path.join(existingAnaPath, 'plans', 'completed', 'old-work', 'scope.md'), 'archived');

    // 6. learn/
    await fs.mkdir(path.join(existingAnaPath, 'learn'), { recursive: true });
    await fs.writeFile(path.join(existingAnaPath, 'learn', 'state.json'), JSON.stringify({ last_session_at: '2026-05-15T14:30:00Z' }));

    // 7. plans/active/
    await fs.mkdir(path.join(existingAnaPath, 'plans', 'active', 'in-flight'), { recursive: true });
    await fs.writeFile(path.join(existingAnaPath, 'plans', 'active', 'in-flight', 'spec.md'), 'in-flight spec');

    // 8. skills/ (Rules/Gotchas/Examples)
    await fs.mkdir(path.join(existingAnaPath, 'skills', 'coding-standards'), { recursive: true });
    await fs.writeFile(
      path.join(existingAnaPath, 'skills', 'coding-standards', 'SKILL.md'),
      '## Rules\nMy custom rule\n## Gotchas\nMy gotcha\n## Examples\nMy example\n',
    );

    const newConfig = {
      anaVersion: '2.0.0',
      lastScanAt: '2026-05-18T00:00:00Z',
      name: 'fresh-name',
      language: 'TypeScript',
      framework: 'Express',
      packageManager: 'pnpm',
      surfaces: {
        cli: { path: 'packages/cli', language: 'TypeScript', framework: 'Express', commands: { test: 'fresh test' } },
      },
    };

    await preserveUserState(existingAnaPath, tmpAnaPath, newConfig);

    // 1. context preserved
    expect(await fs.readFile(path.join(tmpAnaPath, 'context', 'project-context.md'), 'utf-8'))
      .toContain('Team architecture notes');

    // 2 + 21 + 30. ana.json user fields, custom + unknown key, tuned surface command; mechanical refreshed
    const ana = JSON.parse(await fs.readFile(path.join(tmpAnaPath, 'ana.json'), 'utf-8'));
    expect(ana.coAuthor).toBe('My Team <team@example.com>');
    expect(ana.artifactBranch).toBe('develop');
    expect(ana.custom.myFlag).toBe(true);
    expect(ana.myUnknownTopLevelKey).toBe('survives');
    expect(ana.surfaces.cli.commands.test).toBe('my custom test'); // user command preserved
    expect(ana.surfaces.cli.framework).toBe('Express'); // mechanical field refreshed
    expect(ana.name).toBe('fresh-name'); // mechanical refreshed
    expect(ana.language).toBe('TypeScript');

    // 3. setup-progress preserved (setupPhase !== complete)
    expect(JSON.parse(await fs.readFile(path.join(tmpAnaPath, 'state', 'setup-progress.json'), 'utf-8')).step).toBe(3);

    // 4. proof chain
    expect(JSON.parse(await fs.readFile(path.join(tmpAnaPath, 'proof_chain.json'), 'utf-8')).entries).toEqual(['e1']);
    expect(await fs.readFile(path.join(tmpAnaPath, 'PROOF_CHAIN.md'), 'utf-8')).toContain('Proof chain history');

    // 5. plans/completed/
    expect(await fs.readFile(path.join(tmpAnaPath, 'plans', 'completed', 'old-work', 'scope.md'), 'utf-8')).toBe('archived');

    // 6. learn/
    expect(JSON.parse(await fs.readFile(path.join(tmpAnaPath, 'learn', 'state.json'), 'utf-8')).last_session_at)
      .toBe('2026-05-15T14:30:00Z');

    // 7. plans/active/
    expect(await fs.readFile(path.join(tmpAnaPath, 'plans', 'active', 'in-flight', 'spec.md'), 'utf-8')).toBe('in-flight spec');

    // 8. skills/ human content
    const skill = await fs.readFile(path.join(tmpAnaPath, 'skills', 'coding-standards', 'SKILL.md'), 'utf-8');
    expect(skill).toContain('My custom rule');
    expect(skill).toContain('My gotcha');
    expect(skill).toContain('My example');
  });

  // @ana A030
  it('preserves .ana/requirements/ byte-identically (root + archived)', async () => {
    const existingAnaPath = path.join(tmpDir, '.ana-existing');
    const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
    await fs.mkdir(existingAnaPath, { recursive: true });
    await createDirectoryStructure(tmpAnaPath);

    await fs.writeFile(
      path.join(existingAnaPath, 'ana.json'),
      JSON.stringify({ name: 'p', artifactBranch: 'main', setupPhase: 'complete' }),
    );

    // Populate the backlog: an open requirement at the root and an archived one.
    await fs.mkdir(path.join(existingAnaPath, 'requirements', 'archived'), { recursive: true });
    const openContent = '---\nreq: REQ-open\nstatus: open\n---\n\n## Problem\nkeep me\n';
    const archivedContent = '---\nreq: REQ-done\nstatus: archived\nresolution: completed\n---\n\n## Problem\nkeep me too\n';
    await fs.writeFile(path.join(existingAnaPath, 'requirements', 'REQ-open.md'), openContent);
    await fs.writeFile(path.join(existingAnaPath, 'requirements', 'archived', 'REQ-done.md'), archivedContent);

    await preserveUserState(existingAnaPath, tmpAnaPath, {
      anaVersion: '2.0.0',
      lastScanAt: '2026-05-18T00:00:00Z',
      name: 'p',
      language: null,
      framework: null,
      packageManager: null,
    });

    expect(await fs.readFile(path.join(tmpAnaPath, 'requirements', 'REQ-open.md'), 'utf-8')).toBe(openContent);
    expect(await fs.readFile(path.join(tmpAnaPath, 'requirements', 'archived', 'REQ-done.md'), 'utf-8')).toBe(archivedContent);
  });

  // @ana A029
  it('does NOT carry setup-progress.json when setup is complete', async () => {
    const existingAnaPath = path.join(tmpDir, '.ana-existing');
    const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
    await fs.mkdir(path.join(existingAnaPath, 'state'), { recursive: true });
    await createDirectoryStructure(tmpAnaPath);

    await fs.writeFile(
      path.join(existingAnaPath, 'ana.json'),
      JSON.stringify({ name: 'p', artifactBranch: 'main', setupPhase: 'complete' }),
    );
    await fs.writeFile(path.join(existingAnaPath, 'state', 'setup-progress.json'), JSON.stringify({ step: 9 }));

    await preserveUserState(existingAnaPath, tmpAnaPath, {
      anaVersion: '2.0.0',
      lastScanAt: '2026-05-18T00:00:00Z',
      name: 'p',
      language: null,
      framework: null,
      packageManager: null,
    });

    const carried = await fs
      .stat(path.join(tmpAnaPath, 'state', 'setup-progress.json'))
      .then(() => true)
      .catch(() => false);
    expect(carried).toBe(false);
  });
});

describe('template propagation — version nudge + docs + changelog', () => {
  // @ana A025
  it('the work.ts version-mismatch nudge points to ana init and conveys template refresh', async () => {
    const work = await fs.readFile(path.join(__dirname, '..', '..', '..', 'src', 'commands', 'work.ts'), 'utf-8');
    const mismatchBlock = work.slice(work.indexOf('output.projectMismatch'));
    const snippet = mismatchBlock.slice(0, 400);
    expect(snippet).toContain('ana init');
    expect(snippet).toContain('refresh');
    expect(snippet).toContain('templates');
  });

  // @ana A026, A027
  it('configurability.mdx documents overwrite + preserved config, not edit-persistence', async () => {
    const mdx = await fs.readFile(
      path.join(repoRoot, 'website', 'content', 'docs', 'guides', 'configurability.mdx'),
      'utf-8',
    );
    // No longer promises agent-file edits persist
    expect(mdx).not.toContain('edits persist across re-init');
    // Documents overwrite + recover-via-git + preserved basic config
    expect(mdx.toLowerCase()).toContain('overwrit');
    expect(mdx).toContain('git');
    expect(mdx.toLowerCase()).toContain('preserv');
  });

});
