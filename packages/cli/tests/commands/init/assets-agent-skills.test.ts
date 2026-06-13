/**
 * Per-agent skill projection (Slice 2).
 *
 * Three surfaces under test:
 *
 *  1. `copyAgentFiles` — projects `ana.json.agents.<name>.skills` into the
 *     Claude `.md` frontmatter `skills:` line on EVERY init. `skills` is NOT a
 *     CONFIG key, so it is re-projected from ana.json (which survives re-init)
 *     rather than carried forward from the existing file — the second re-init
 *     PRESERVES the mapping (the previously-reverting bug). Absent config leaves
 *     stock byte-identical.
 *
 *  2. `copyCodexAgentFiles` — writes a flat `skills = [...]` line to the
 *     `.agent.toml` AND a single marker-bounded `## Skills` block to the `.md`.
 *     Absent config leaves both byte-identical to stock.
 *
 *  3. `ana agents skills <agent> <list>` / `--clear` — writes the mapping to
 *     ana.json (the source of truth the projection reads).
 *
 * Both copy functions resolve templates via getTemplatesDir(), which mis-resolves
 * under vitest-from-src — the suites that call createClaudeConfiguration/
 * createCodexConfiguration spy it onto the real templates/ dir (the same
 * workaround as assets-managed-blocks.test.ts). The direct copy-function tests
 * pass the real templates dir explicitly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import {
  copyAgentFiles,
  copyCodexAgentFiles,
} from '../../../src/commands/init/assets.js';
import { createTestProject } from '../../helpers/test-project.js';

const realTemplatesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'templates',
);

const CODEX_SKILLS_BEGIN = (name: string): string =>
  `<!-- >>> Anatomia managed: skills:${name} (do not edit this block) >>> -->`;
const CODEX_SKILLS_END = (name: string): string =>
  `<!-- <<< Anatomia managed: skills:${name} <<< -->`;

describe('copyAgentFiles — Claude per-agent skill projection', () => {
  let agentsDir: string;

  beforeEach(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-claude-skills-'));
  });

  afterEach(async () => {
    await fs.rm(agentsDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /** Read a Claude agent .md from the test dir. */
  async function readAgent(name: string): Promise<string> {
    return fs.readFile(path.join(agentsDir, `${name}.md`), 'utf-8');
  }

  /** Read the stock template for a Claude agent .md. */
  async function readStock(name: string): Promise<string> {
    return fs.readFile(path.join(realTemplatesDir, '.claude/agents', `${name}.md`), 'utf-8');
  }

  it('absent agents config → fresh files byte-identical to stock', async () => {
    await copyAgentFiles(agentsDir, realTemplatesDir, {});
    for (const name of ['ana', 'ana-build', 'ana-plan', 'ana-verify', 'ana-learn', 'ana-setup']) {
      expect(await readAgent(name)).toBe(await readStock(name));
    }
  });

  it('absent agents key (undefined ana.json) → byte-identical to stock', async () => {
    await copyAgentFiles(agentsDir, realTemplatesDir, undefined);
    expect(await readAgent('ana-build')).toBe(await readStock('ana-build'));
  });

  it('projects agents.<name>.skills into the frontmatter skills line on a fresh write', async () => {
    await copyAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-build': { skills: ['git-workflow', 'api-patterns'] } },
    });
    const content = await readAgent('ana-build');
    expect(content).toContain('skills: [git-workflow, api-patterns]');
    // Stock shipped `skills: [git-workflow]` — the projection replaced it, not appended.
    expect(content).not.toContain('skills: [git-workflow]\n');
    // Only the named agent is touched; ana-plan keeps its stock skills.
    expect(await readAgent('ana-plan')).toBe(await readStock('ana-plan'));
  });

  it('a SECOND re-init PRESERVES the projected mapping (the previously-reverting case)', async () => {
    const anaJson = {
      agents: { 'ana-build': { skills: ['git-workflow', 'api-patterns'] } },
    };
    // First init.
    await copyAgentFiles(agentsDir, realTemplatesDir, anaJson);
    expect(await readAgent('ana-build')).toContain('skills: [git-workflow, api-patterns]');
    // Second re-init with the same config — the mapping must still be there.
    await copyAgentFiles(agentsDir, realTemplatesDir, anaJson);
    expect(await readAgent('ana-build')).toContain('skills: [git-workflow, api-patterns]');
  });

  it('re-init re-projects from ana.json even when the on-disk skills line was manually edited', async () => {
    // Seed an existing file whose skills line a user hand-edited away from stock.
    await copyAgentFiles(agentsDir, realTemplatesDir, {});
    const buildPath = path.join(agentsDir, 'ana-build.md');
    const edited = (await fs.readFile(buildPath, 'utf-8')).replace(
      'skills: [git-workflow]',
      'skills: [hand-edited]',
    );
    await fs.writeFile(buildPath, edited, 'utf-8');

    // Re-init with config — projection wins (ana.json is the source of truth).
    await copyAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-build': { skills: ['git-workflow', 'api-patterns'] } },
    });
    const content = await readAgent('ana-build');
    expect(content).toContain('skills: [git-workflow, api-patterns]');
    expect(content).not.toContain('hand-edited');
  });

  it('preserves a CONFIG-class model key alongside the projected skills', async () => {
    // Existing file carries a user model override.
    await copyAgentFiles(agentsDir, realTemplatesDir, {});
    const buildPath = path.join(agentsDir, 'ana-build.md');
    const withModel = (await fs.readFile(buildPath, 'utf-8')).replace(
      /^model:.*$/m,
      'model: sonnet',
    );
    await fs.writeFile(buildPath, withModel, 'utf-8');

    await copyAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-build': { skills: ['git-workflow'] } },
    });
    const content = await readAgent('ana-build');
    expect(content).toContain('model: sonnet');
    expect(content).toContain('skills: [git-workflow]');
  });

  it('deduplicates and preserves authoring order of projected skills', async () => {
    await copyAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-build': { skills: ['api-patterns', 'git-workflow', 'api-patterns'] } },
    });
    expect(await readAgent('ana-build')).toContain('skills: [api-patterns, git-workflow]');
  });

  it('malformed agents config falls through to stock (no crash, no clobber)', async () => {
    // agents is an array, not a record — resolver returns [] for every agent.
    await copyAgentFiles(agentsDir, realTemplatesDir, { agents: ['nonsense'] });
    expect(await readAgent('ana-build')).toBe(await readStock('ana-build'));
  });
});

describe('copyCodexAgentFiles — Codex per-agent skill projection', () => {
  let agentsDir: string;

  beforeEach(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-codex-skills-'));
  });

  afterEach(async () => {
    await fs.rm(agentsDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function readMd(name: string): Promise<string> {
    return fs.readFile(path.join(agentsDir, `${name}.md`), 'utf-8');
  }

  async function readToml(name: string): Promise<string> {
    return fs.readFile(path.join(agentsDir, `${name}.agent.toml`), 'utf-8');
  }

  async function readStockMd(name: string): Promise<string> {
    return fs.readFile(path.join(realTemplatesDir, '.codex/agents', `${name}.md`), 'utf-8');
  }

  async function readStockToml(name: string): Promise<string> {
    return fs.readFile(path.join(realTemplatesDir, '.codex/agents', `${name}.agent.toml`), 'utf-8');
  }

  it('absent config → .md and .agent.toml byte-identical to stock', async () => {
    await copyCodexAgentFiles(agentsDir, realTemplatesDir, {});
    for (const name of ['ana', 'ana-build', 'ana-plan', 'ana-verify', 'ana-learn', 'ana-setup']) {
      expect(await readMd(name)).toBe(await readStockMd(name));
      expect(await readToml(name)).toBe(await readStockToml(name));
    }
  });

  it('writes a flat skills = [...] line to .agent.toml', async () => {
    await copyCodexAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-build': { skills: ['git-workflow', 'api-patterns'] } },
    });
    const toml = await readToml('ana-build');
    expect(toml).toContain('skills = ["git-workflow", "api-patterns"]');
    // The CONFIG keys still refresh from stock.
    expect(toml).toContain('model = "gpt-5.5"');
    // An undeclared agent keeps no skills line.
    expect(await readToml('ana-plan')).toBe(await readStockToml('ana-plan'));
  });

  it('writes a single marker-bounded ## Skills block to the .md', async () => {
    await copyCodexAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-build': { skills: ['git-workflow', 'api-patterns'] } },
    });
    const md = await readMd('ana-build');
    expect(md).toContain(CODEX_SKILLS_BEGIN('ana-build'));
    expect(md).toContain('## Skills');
    expect(md).toContain('- git-workflow');
    expect(md).toContain('- api-patterns');
    expect(md).toContain(CODEX_SKILLS_END('ana-build'));
    // The stock instruction body is preserved above the block.
    expect(md).toContain('You are **AnaBuild**');
    // Exactly one begin marker — no duplication.
    expect(md.split(CODEX_SKILLS_BEGIN('ana-build')).length - 1).toBe(1);
  });

  it('a SECOND re-init preserves the mapping with a SINGLE block (no duplication)', async () => {
    const anaJson = {
      agents: { 'ana-build': { skills: ['git-workflow', 'api-patterns'] } },
    };
    await copyCodexAgentFiles(agentsDir, realTemplatesDir, anaJson);
    await copyCodexAgentFiles(agentsDir, realTemplatesDir, anaJson);

    const md = await readMd('ana-build');
    // Still exactly one ## Skills block after the second re-init.
    expect(md.split(CODEX_SKILLS_BEGIN('ana-build')).length - 1).toBe(1);
    expect(md).toContain('- api-patterns');

    const toml = await readToml('ana-build');
    // Still exactly one skills line.
    expect(toml.split('skills = [').length - 1).toBe(1);
    expect(toml).toContain('skills = ["git-workflow", "api-patterns"]');
  });

  it('skills-only change does not report the .md as an instruction change', async () => {
    // First write the stock files (no skills).
    const fresh = await copyCodexAgentFiles(agentsDir, realTemplatesDir, {});
    expect(fresh).toEqual([]);
    // Re-init adding only skills — the instruction body is unchanged, so the
    // .md must NOT be reported in the changed-files list.
    const changed = await copyCodexAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-build': { skills: ['git-workflow'] } },
    });
    expect(changed).toEqual([]);
  });

  it('clearing skills on re-init restores the stock .md and .agent.toml', async () => {
    await copyCodexAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-build': { skills: ['git-workflow', 'api-patterns'] } },
    });
    // Re-init with the skills removed from config.
    await copyCodexAgentFiles(agentsDir, realTemplatesDir, {});
    expect(await readMd('ana-build')).toBe(await readStockMd('ana-build'));
    expect(await readToml('ana-build')).toBe(await readStockToml('ana-build'));
  });
});

describe('ana agents skills — writes the mapping to ana.json', () => {
  let tempDir: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  /** Build a Commander program with the agents command registered. */
  async function createProgram(): Promise<Command> {
    const { registerAgentsCommand } = await import('../../../src/commands/agents.js');
    const program = new Command();
    program.exitOverride();
    registerAgentsCommand(program);
    return program;
  }

  /** Run a command through Commander, swallowing exitCode-based errors. */
  async function runCommand(program: Command, args: string[]): Promise<void> {
    try {
      await program.parseAsync(['node', 'test', ...args]);
    } catch {
      // exitOverride throws on errors that set exitCode — swallow.
    }
  }

  /** Create .claude/agents with the six stock agent stubs. */
  async function seedAgents(): Promise<void> {
    await createTestProject(tempDir);
    const dir = path.join(tempDir, '.claude/agents');
    await fs.mkdir(dir, { recursive: true });
    for (const name of ['ana', 'ana-build', 'ana-plan', 'ana-verify', 'ana-learn', 'ana-setup']) {
      await fs.writeFile(path.join(dir, `${name}.md`), `---\nname: ${name}\n---\nbody\n`, 'utf-8');
    }
  }

  async function readAnaJson(): Promise<Record<string, unknown>> {
    return JSON.parse(await fs.readFile(path.join(tempDir, '.ana', 'ana.json'), 'utf-8'));
  }

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-skills-cmd-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    process.exitCode = 0;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = 0;
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('sets agents.<agent>.skills from a comma-separated list', async () => {
    await seedAgents();
    const program = await createProgram();
    await runCommand(program, ['agents', 'skills', 'ana-build', 'git-workflow,api-patterns']);

    const config = await readAnaJson();
    const agents = config['agents'] as Record<string, { skills: string[] }>;
    expect(agents['ana-build']?.skills).toEqual(['git-workflow', 'api-patterns']);
    expect(process.exitCode).not.toBe(1);
  });

  it('trims whitespace and dedupes the list', async () => {
    await seedAgents();
    const program = await createProgram();
    await runCommand(program, ['agents', 'skills', 'ana-plan', ' coding-standards , testing-standards, coding-standards ']);

    const agents = (await readAnaJson())['agents'] as Record<string, { skills: string[] }>;
    expect(agents['ana-plan']?.skills).toEqual(['coding-standards', 'testing-standards']);
  });

  it('--clear removes the skills mapping (pruning the empty agents map)', async () => {
    await seedAgents();
    const program = await createProgram();
    await runCommand(program, ['agents', 'skills', 'ana-build', 'git-workflow']);
    expect((await readAnaJson())['agents']).toBeDefined();

    const program2 = await createProgram();
    await runCommand(program2, ['agents', 'skills', 'ana-build', '--clear']);
    // The only entry was ana-build.skills, so the whole agents key is pruned.
    expect((await readAnaJson())['agents']).toBeUndefined();
  });

  it('--clear keeps a sibling agent override intact', async () => {
    await seedAgents();
    // Pre-seed ana.json with two agents, one carrying a non-skills override.
    const config = await readAnaJson();
    config['agents'] = {
      'ana-build': { skills: ['git-workflow'] },
      'ana-plan': { model: 'sonnet' },
    };
    await fs.writeFile(path.join(tempDir, '.ana', 'ana.json'), JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const program = await createProgram();
    await runCommand(program, ['agents', 'skills', 'ana-build', '--clear']);

    const after = (await readAnaJson())['agents'] as Record<string, Record<string, unknown>>;
    expect(after['ana-build']).toBeUndefined();
    expect(after['ana-plan']).toEqual({ model: 'sonnet' });
  });

  it('errors on an unknown agent and sets exit code 1', async () => {
    await seedAgents();
    const program = await createProgram();
    await runCommand(program, ['agents', 'skills', 'ana-nope', 'git-workflow']);
    expect(process.exitCode).toBe(1);
    expect((await readAnaJson())['agents']).toBeUndefined();
  });
});
