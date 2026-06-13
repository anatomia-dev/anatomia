/**
 * Config-driven agent roster (Slice 6).
 *
 * `ana.json.agents` reshapes which agents both harnesses scaffold:
 *
 *  1. `resolveAgentMap` — derives the `ana run` suffix→full-name dispatch map
 *     from the roster. Absent config → byte-identical to the prior hardcoded
 *     literal. A disabled built-in drops out; a config-supplied agent becomes
 *     dispatchable. The Think core agent (`ana`) is never droppable.
 *
 *  2. `copyAgentFiles` / `copyCodexAgentFiles` — iterate `resolveAgentRoster`
 *     instead of the raw AGENT_FILES/CODEX_AGENT_FILES constants. A built-in
 *     flagged `enabled:false` is NOT scaffolded; a config-supplied agent is
 *     scaffolded from its `.ana/agent-templates/<name>.md` template (Claude
 *     frontmatter + body; Codex `.md` + a synthesized `.agent.toml`). Absent
 *     `ana.json.agents` leaves the stock six byte-identical (no-regression).
 *
 * The copy-function tests pass the real templates/ dir explicitly (same
 * workaround as assets-agent-skills.test.ts) and place the project's
 * `.ana/agent-templates/` under the parent of the `.claude`/`.codex` agents
 * dir, mirroring the live tree layout the copy functions resolve.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  copyAgentFiles,
  copyCodexAgentFiles,
} from '../../../src/commands/init/assets.js';
import {
  resolveAgentMap,
  resolveAgentRoster,
  BUILTIN_AGENT_ROSTER,
  CORE_AGENT,
} from '../../../src/manifest.js';

const realTemplatesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'templates',
);

const STOCK_AGENTS = ['ana', 'ana-build', 'ana-plan', 'ana-verify', 'ana-learn', 'ana-setup'];

describe('resolveAgentMap — config-driven dispatch surface', () => {
  it('absent agents config → byte-identical to the prior hardcoded literal', () => {
    expect(resolveAgentMap({})).toEqual({
      '': 'ana',
      build: 'ana-build',
      plan: 'ana-plan',
      verify: 'ana-verify',
      setup: 'ana-setup',
      learn: 'ana-learn',
    });
    // Undefined / malformed ana.json resolves to the same default map.
    expect(resolveAgentMap(undefined)).toEqual(resolveAgentMap({}));
    expect(resolveAgentMap('nonsense')).toEqual(resolveAgentMap({}));
    expect(resolveAgentMap({ agents: ['x'] })).toEqual(resolveAgentMap({}));
  });

  it('drops a disabled built-in from the dispatch map', () => {
    const map = resolveAgentMap({ agents: { 'ana-learn': { enabled: false } } });
    expect(map['learn']).toBeUndefined();
    expect(map['']).toBe('ana');
    expect(map['build']).toBe('ana-build');
  });

  it('makes a config-supplied agent dispatchable by its stripped suffix', () => {
    const map = resolveAgentMap({ agents: { 'ana-release': { skills: [] } } });
    expect(map['release']).toBe('ana-release');
  });

  it('keys a config agent without the ana- prefix by its full name', () => {
    const map = resolveAgentMap({ agents: { reviewer: { skills: [] } } });
    expect(map['reviewer']).toBe('reviewer');
  });

  it('the Think core agent is always the empty-suffix default, even if enabled:false', () => {
    const map = resolveAgentMap({ agents: { ana: { enabled: false } } });
    expect(map['']).toBe('ana');
  });
});

describe('resolveAgentRoster — Think core agent is never droppable', () => {
  it('ignores enabled:false on the Think core agent', () => {
    const resolved = resolveAgentRoster({ agents: { ana: { enabled: false } } });
    expect(resolved).toContain(CORE_AGENT);
    // Every built-in is retained — the guard only protects `ana`, the rest stay.
    expect(resolved).toEqual([...BUILTIN_AGENT_ROSTER]);
  });

  it('disabling Think alongside another agent still keeps Think', () => {
    const resolved = resolveAgentRoster({
      agents: { ana: { enabled: false }, 'ana-learn': { enabled: false } },
    });
    expect(resolved).toContain('ana');
    expect(resolved).not.toContain('ana-learn');
  });
});

describe('copyAgentFiles — config-driven roster (Claude)', () => {
  let projectRoot: string;
  let agentsDir: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-roster-claude-'));
    agentsDir = path.join(projectRoot, '.claude', 'agents');
    await fs.mkdir(agentsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function readAgent(name: string): Promise<string> {
    return fs.readFile(path.join(agentsDir, `${name}.md`), 'utf-8');
  }
  async function readStock(name: string): Promise<string> {
    return fs.readFile(path.join(realTemplatesDir, '.claude/agents', `${name}.md`), 'utf-8');
  }
  async function exists(name: string): Promise<boolean> {
    try {
      await fs.access(path.join(agentsDir, `${name}.md`));
      return true;
    } catch {
      return false;
    }
  }
  /** Author a config-supplied agent template under the project's .ana/agent-templates. */
  async function seedAgentTemplate(name: string, body: string): Promise<void> {
    const dir = path.join(projectRoot, '.ana', 'agent-templates');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${name}.md`), body, 'utf-8');
  }

  it('absent agents config → all six stock agents byte-identical to stock', async () => {
    await copyAgentFiles(agentsDir, realTemplatesDir, {});
    for (const name of STOCK_AGENTS) {
      expect(await readAgent(name)).toBe(await readStock(name));
    }
  });

  it('a built-in flagged enabled:false is NOT scaffolded', async () => {
    await copyAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-learn': { enabled: false } },
    });
    expect(await exists('ana-learn')).toBe(false);
    // The rest stay byte-identical.
    for (const name of ['ana', 'ana-build', 'ana-plan', 'ana-verify', 'ana-setup']) {
      expect(await readAgent(name)).toBe(await readStock(name));
    }
  });

  it('the Think core agent is scaffolded even when flagged enabled:false', async () => {
    await copyAgentFiles(agentsDir, realTemplatesDir, {
      agents: { ana: { enabled: false } },
    });
    expect(await exists('ana')).toBe(true);
    expect(await readAgent('ana')).toBe(await readStock('ana'));
  });

  it('scaffolds a config-supplied agent from .ana/agent-templates/<name>.md', async () => {
    await seedAgentTemplate(
      'ana-release',
      '---\nname: ana-release\nskills: [git-workflow]\n---\nYou are AnaRelease.\n',
    );
    await copyAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-release': { skills: ['git-workflow', 'api-patterns'] } },
    });
    expect(await exists('ana-release')).toBe(true);
    const content = await readAgent('ana-release');
    expect(content).toContain('You are AnaRelease.');
    // Per-agent skills project onto the config agent's frontmatter too.
    expect(content).toContain('skills: [git-workflow, api-patterns]');
    // Built-ins are untouched.
    expect(await readAgent('ana-build')).toBe(await readStock('ana-build'));
  });

  it('a config-supplied agent with no template file is skipped (no crash)', async () => {
    // No .ana/agent-templates/ana-release.md authored.
    await copyAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-release': { skills: [] } },
    });
    expect(await exists('ana-release')).toBe(false);
    // The built-ins still scaffold normally.
    expect(await readAgent('ana-build')).toBe(await readStock('ana-build'));
  });
});

describe('copyCodexAgentFiles — config-driven roster (Codex)', () => {
  let projectRoot: string;
  let agentsDir: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-roster-codex-'));
    agentsDir = path.join(projectRoot, '.codex', 'agents');
    await fs.mkdir(agentsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
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
  async function mdExists(name: string): Promise<boolean> {
    try {
      await fs.access(path.join(agentsDir, `${name}.md`));
      return true;
    } catch {
      return false;
    }
  }
  async function tomlExists(name: string): Promise<boolean> {
    try {
      await fs.access(path.join(agentsDir, `${name}.agent.toml`));
      return true;
    } catch {
      return false;
    }
  }
  async function seedAgentTemplate(name: string, body: string): Promise<void> {
    const dir = path.join(projectRoot, '.ana', 'agent-templates');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${name}.md`), body, 'utf-8');
  }

  it('absent agents config → all six stock .md/.agent.toml byte-identical', async () => {
    await copyCodexAgentFiles(agentsDir, realTemplatesDir, {});
    for (const name of STOCK_AGENTS) {
      expect(await readMd(name)).toBe(await readStockMd(name));
      expect(await readToml(name)).toBe(await readStockToml(name));
    }
  });

  it('a built-in flagged enabled:false is NOT scaffolded (.md and .agent.toml)', async () => {
    await copyCodexAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-learn': { enabled: false } },
    });
    expect(await mdExists('ana-learn')).toBe(false);
    expect(await tomlExists('ana-learn')).toBe(false);
  });

  it('the Think core agent is scaffolded even when flagged enabled:false', async () => {
    await copyCodexAgentFiles(agentsDir, realTemplatesDir, {
      agents: { ana: { enabled: false } },
    });
    expect(await readMd('ana')).toBe(await readStockMd('ana'));
    expect(await readToml('ana')).toBe(await readStockToml('ana'));
  });

  it('scaffolds a config-supplied agent: template .md + synthesized .agent.toml', async () => {
    await seedAgentTemplate('ana-release', '# ana-release prompt\nYou are AnaRelease.\n');
    await copyCodexAgentFiles(agentsDir, realTemplatesDir, {
      agents: { 'ana-release': { skills: ['git-workflow'] } },
    });
    expect(await mdExists('ana-release')).toBe(true);
    const md = await readMd('ana-release');
    expect(md).toContain('You are AnaRelease.');
    // Skills project into the managed block on the config agent's .md.
    expect(md).toContain('## Skills');
    expect(md).toContain('- git-workflow');

    // A minimal .agent.toml is synthesized with the codex runtime defaults.
    expect(await tomlExists('ana-release')).toBe(true);
    const toml = await readToml('ana-release');
    expect(toml).toContain('name = "ana-release"');
    expect(toml).toContain('model = "gpt-5.5"');
    expect(toml).toContain('sandbox_mode = "danger-full-access"');
    // The projected skills land as a flat array on the synthesized manifest.
    expect(toml).toContain('skills = ["git-workflow"]');
  });
});
