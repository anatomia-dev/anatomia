/**
 * Managed-block surfaces (Slice 4).
 *
 * Two layers under test:
 *
 *  1. `mergeManagedBlock(existing, managed, markerKey)` — the NET-NEW merge
 *     primitive. Boundary + injection discipline: it touches only the
 *     marker-delimited region for its key and preserves every other byte;
 *     `managed:null` prunes the block. (Modeled on the hooks-merge boundary +
 *     `## Detected` injection — not a rename of mergeHooksSettings.)
 *
 *  2. The `capabilities` wiring in `createClaudeConfiguration`:
 *       commands    → `.claude/commands/<name>.md` (marker-headed, prunable)
 *       outputStyle → `settings.json` key (siblings survive)
 *       mcpServers  → `.mcp.json`
 *     Absent capabilities = byte-identical to stock, no new files.
 *
 * The capability tests call `createClaudeConfiguration` directly — getTemplatesDir
 * resolves to source `templates/` when running from source (vitest), so no built
 * dist is required.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  mergeManagedBlock,
  createClaudeConfiguration,
} from '../../../src/commands/init/assets.js';
import * as initStateModule from '../../../src/commands/init/state.js';
import type { InitState } from '../../../src/commands/init/types.js';

const BEGIN = (key: string): string => `<!-- >>> Anatomia managed: ${key} (do not edit this block) >>> -->`;
const END = (key: string): string => `<!-- <<< Anatomia managed: ${key} <<< -->`;

describe('mergeManagedBlock — net-new merge primitive', () => {
  it('wraps the body in markers on a fresh (null) file', () => {
    const out = mergeManagedBlock(null, 'hello body', 'command:ship');
    expect(out).toBe(`${BEGIN('command:ship')}\nhello body\n${END('command:ship')}\n`);
  });

  it('treats empty-string existing as a fresh write', () => {
    const out = mergeManagedBlock('', 'b', 'command:ship');
    expect(out).toBe(`${BEGIN('command:ship')}\nb\n${END('command:ship')}\n`);
  });

  it('replaces only its own region in place, preserving surrounding user content', () => {
    const existing = `# User intro\n\n${BEGIN('command:ship')}\nold body\n${END('command:ship')}\n\n# User outro\n`;
    const out = mergeManagedBlock(existing, 'new body', 'command:ship');
    expect(out).toBe(`# User intro\n\n${BEGIN('command:ship')}\nnew body\n${END('command:ship')}\n\n# User outro\n`);
    // The user's prose is preserved verbatim.
    expect(out).toContain('# User intro');
    expect(out).toContain('# User outro');
    // The old managed body is gone.
    expect(out).not.toContain('old body');
  });

  it('appends a block to a file that has user content but no managed region', () => {
    const out = mergeManagedBlock('# Hand authored\n', 'managed body', 'command:ship');
    expect(out).toBe(`# Hand authored\n\n${BEGIN('command:ship')}\nmanaged body\n${END('command:ship')}\n`);
  });

  it('prunes its block out, returning surrounding user content', () => {
    const existing = `# Keep me\n\n${BEGIN('command:ship')}\nbody\n${END('command:ship')}\n`;
    const out = mergeManagedBlock(existing, null, 'command:ship');
    expect(out).toBe('# Keep me\n');
  });

  it('returns null when pruning a managed-only file (nothing left to keep)', () => {
    const existing = `${BEGIN('command:ship')}\nbody\n${END('command:ship')}\n`;
    const out = mergeManagedBlock(existing, null, 'command:ship');
    expect(out).toBeNull();
  });

  it('prune of an absent block is a no-op (returns existing unchanged)', () => {
    const existing = '# Just user content\n';
    expect(mergeManagedBlock(existing, null, 'command:ship')).toBe(existing);
  });

  it('keys are independent — a second key appends rather than overwriting the first', () => {
    const first = mergeManagedBlock(null, 'A body', 'command:a');
    const both = mergeManagedBlock(first, 'B body', 'command:b');
    expect(both).toContain(BEGIN('command:a'));
    expect(both).toContain('A body');
    expect(both).toContain(BEGIN('command:b'));
    expect(both).toContain('B body');
  });

  it('does not throw on a mangled begin-without-end file (degrades to append)', () => {
    const mangled = `${BEGIN('command:ship')}\nuser broke the end marker\n`;
    const out = mergeManagedBlock(mangled, 'fresh body', 'command:ship');
    expect(out).not.toBeNull();
    expect(out).toContain('fresh body');
  });
});

describe('capabilities wiring in createClaudeConfiguration', () => {
  let cwd: string;
  const initState: InitState = 'fresh';

  // createClaudeConfiguration resolves templates via getTemplatesDir(), which
  // only points at the real tree from dist/. Under vitest-from-src it
  // mis-resolves to src/templates, so point it at the package's real
  // templates/ dir (same workaround as init.test.ts's full-flow block).
  const realTemplatesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'templates',
  );
  let templatesSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  async function readSettings(): Promise<Record<string, unknown>> {
    return JSON.parse(await fs.readFile(path.join(cwd, '.claude', 'settings.json'), 'utf-8'));
  }

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-mb-'));
    templatesSpy = vi
      .spyOn(initStateModule, 'getTemplatesDir')
      .mockReturnValue(realTemplatesDir);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    templatesSpy.mockRestore();
    logSpy.mockRestore();
    await fs.rm(cwd, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('absent capabilities → settings.json byte-identical to stock, no new files', async () => {
    await createClaudeConfiguration(cwd, null, initState, {});
    const settings = await readSettings();
    expect(settings).toEqual({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'ana _capture' }] }] } });
    // No commands dir, no .mcp.json
    await expect(fs.access(path.join(cwd, '.claude', 'commands'))).rejects.toThrow();
    await expect(fs.access(path.join(cwd, '.mcp.json'))).rejects.toThrow();
  });

  it('capabilities.commands.ship → .claude/commands/ship.md with marker', async () => {
    await createClaudeConfiguration(cwd, null, initState, {
      capabilities: { commands: { ship: 'Run the ship checklist.' } },
    });
    const shipPath = path.join(cwd, '.claude', 'commands', 'ship.md');
    const content = await fs.readFile(shipPath, 'utf-8');
    expect(content).toContain(BEGIN('command:ship'));
    expect(content).toContain('Run the ship checklist.');
    expect(content).toContain(END('command:ship'));
  });

  it('re-init with a command entry removed → that command file is pruned', async () => {
    // First init: declare ship + audit.
    await createClaudeConfiguration(cwd, null, initState, {
      capabilities: { commands: { ship: 'ship body', audit: 'audit body' } },
    });
    const auditPath = path.join(cwd, '.claude', 'commands', 'audit.md');
    expect(await fs.readFile(auditPath, 'utf-8')).toContain('audit body');

    // Re-init: drop audit, keep ship.
    await createClaudeConfiguration(cwd, null, 'reinit', {
      capabilities: { commands: { ship: 'ship body' } },
    });
    await expect(fs.access(auditPath)).rejects.toThrow();
    // ship survives.
    expect(await fs.readFile(path.join(cwd, '.claude', 'commands', 'ship.md'), 'utf-8')).toContain('ship body');
  });

  it('a hand-authored command file (no marker) survives re-init reconciliation', async () => {
    // Seed a managed command so the commands dir exists.
    await createClaudeConfiguration(cwd, null, initState, {
      capabilities: { commands: { ship: 'ship body' } },
    });
    const minePath = path.join(cwd, '.claude', 'commands', 'mine.md');
    const handAuthored = '# My own command\n\nNo marker here.\n';
    await fs.writeFile(minePath, handAuthored, 'utf-8');

    // Re-init declaring only ship — mine.md is not declared and has no marker.
    await createClaudeConfiguration(cwd, null, 'reinit', {
      capabilities: { commands: { ship: 'ship body' } },
    });
    expect(await fs.readFile(minePath, 'utf-8')).toBe(handAuthored);
  });

  it('outputStyle set → settings.json key added, siblings (hooks) survive', async () => {
    await createClaudeConfiguration(cwd, null, initState, {
      capabilities: { outputStyle: 'concise' },
    });
    const settings = await readSettings();
    expect(settings['outputStyle']).toBe('concise');
    // The always-installed capture hook still present.
    expect(settings['hooks']).toEqual({ SessionStart: [{ hooks: [{ type: 'command', command: 'ana _capture' }] }] });
  });

  it('outputStyle on re-init preserves a user-authored sibling settings key', async () => {
    await createClaudeConfiguration(cwd, null, initState, {});
    // User adds a sibling key out of band.
    const settingsPath = path.join(cwd, '.claude', 'settings.json');
    const existing = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
    existing['permissions'] = { allow: ['Bash(ls:*)'] };
    await fs.writeFile(settingsPath, JSON.stringify(existing, null, 2), 'utf-8');

    await createClaudeConfiguration(cwd, null, 'reinit', {
      capabilities: { outputStyle: 'verbose' },
    });
    const settings = await readSettings();
    expect(settings['outputStyle']).toBe('verbose');
    expect(settings['permissions']).toEqual({ allow: ['Bash(ls:*)'] });
  });

  it('mcpServers → .mcp.json with the declared servers', async () => {
    await createClaudeConfiguration(cwd, null, initState, {
      capabilities: {
        mcpServers: { weather: { command: 'weather-mcp', args: ['--stdio'] } },
      },
    });
    const doc = JSON.parse(await fs.readFile(path.join(cwd, '.mcp.json'), 'utf-8'));
    expect(doc).toEqual({ mcpServers: { weather: { command: 'weather-mcp', args: ['--stdio'] } } });
  });

  it('mcpServers merge preserves a user-authored server already in .mcp.json', async () => {
    await fs.writeFile(
      path.join(cwd, '.mcp.json'),
      JSON.stringify({ mcpServers: { mine: { command: 'mine' } } }, null, 2),
      'utf-8',
    );
    await createClaudeConfiguration(cwd, null, initState, {
      capabilities: { mcpServers: { weather: { command: 'weather-mcp' } } },
    });
    const doc = JSON.parse(await fs.readFile(path.join(cwd, '.mcp.json'), 'utf-8'));
    expect(doc).toEqual({
      mcpServers: { mine: { command: 'mine' }, weather: { command: 'weather-mcp' } },
    });
  });

  it('malformed capabilities degrades (warns, no crash) — settings stays stock, no files', async () => {
    // capabilities present but every sub-surface malformed: commands not an
    // object, outputStyle not a string, mcpServers not an object.
    await createClaudeConfiguration(cwd, null, initState, {
      capabilities: { commands: 'oops', outputStyle: 42, mcpServers: ['nope'] },
    });
    const settings = await readSettings();
    expect(settings['outputStyle']).toBeUndefined();
    await expect(fs.access(path.join(cwd, '.claude', 'commands'))).rejects.toThrow();
    await expect(fs.access(path.join(cwd, '.mcp.json'))).rejects.toThrow();
  });

  it('a command name with path traversal is rejected (no escape from commands dir)', async () => {
    await createClaudeConfiguration(cwd, null, initState, {
      capabilities: { commands: { '../escape': 'evil' } },
    });
    // Nothing written outside the commands dir; the traversal name produced no file.
    await expect(fs.access(path.join(cwd, '.claude', 'escape.md'))).rejects.toThrow();
  });

  // ── Gap 1: delete-config restores stock (the spec's headline demo) ────────
  describe('delete-config restores stock (absent = today)', () => {
    it('stock → configure → DELETE config → re-init == stock (byte-equality)', async () => {
      // 1. Stock: no capabilities at all. Capture the settings.json bytes.
      await createClaudeConfiguration(cwd, null, initState, {});
      const settingsPath = path.join(cwd, '.claude', 'settings.json');
      const stockSettings = await fs.readFile(settingsPath, 'utf-8');
      // Stock has no commands dir and no .mcp.json.
      await expect(fs.access(path.join(cwd, '.claude', 'commands'))).rejects.toThrow();

      // 2. Configure: a command + an outputStyle.
      await createClaudeConfiguration(cwd, null, 'reinit', {
        capabilities: { commands: { ship: 'Run the ship checklist.' }, outputStyle: 'concise' },
      });
      // The configured state is real: ship.md exists, outputStyle is set.
      const shipPath = path.join(cwd, '.claude', 'commands', 'ship.md');
      expect(await fs.readFile(shipPath, 'utf-8')).toContain('Run the ship checklist.');
      expect(JSON.parse(await fs.readFile(settingsPath, 'utf-8'))['outputStyle']).toBe('concise');

      // 3. DELETE the whole capabilities block → re-init with absent config.
      await createClaudeConfiguration(cwd, null, 'reinit', {});

      // ship.md is PRUNED (the previously-failing orphaned-file case).
      await expect(fs.access(shipPath)).rejects.toThrow();
      // The now-empty commands dir is gone OR empty — either way, no orphan.
      const commandsDir = path.join(cwd, '.claude', 'commands');
      const remaining = await fs.readdir(commandsDir).catch(() => []);
      expect(remaining).toEqual([]);

      // settings.json is BYTE-IDENTICAL to stock (outputStyle removed, no sentinel).
      const restoredSettings = await fs.readFile(settingsPath, 'utf-8');
      expect(restoredSettings).toBe(stockSettings);
      expect(JSON.parse(restoredSettings)['outputStyle']).toBeUndefined();
      expect(JSON.parse(restoredSettings)['_anatomiaManaged']).toBeUndefined();
    });

    it('removing outputStyle leaves a user-authored sibling settings key intact', async () => {
      await createClaudeConfiguration(cwd, null, initState, {});
      const settingsPath = path.join(cwd, '.claude', 'settings.json');
      const existing = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      existing['permissions'] = { allow: ['Bash(ls:*)'] };
      await fs.writeFile(settingsPath, JSON.stringify(existing, null, 2), 'utf-8');

      // Set then unset outputStyle.
      await createClaudeConfiguration(cwd, null, 'reinit', { capabilities: { outputStyle: 'verbose' } });
      await createClaudeConfiguration(cwd, null, 'reinit', {});

      const settings = await readSettings();
      expect(settings['outputStyle']).toBeUndefined();
      expect(settings['_anatomiaManaged']).toBeUndefined();
      // The user's sibling key survived the whole cycle.
      expect(settings['permissions']).toEqual({ allow: ['Bash(ls:*)'] });
    });

    it('does NOT remove a user-authored outputStyle Anatomia never managed', async () => {
      await createClaudeConfiguration(cwd, null, initState, {});
      const settingsPath = path.join(cwd, '.claude', 'settings.json');
      const existing = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      // User sets outputStyle by hand — no Anatomia sentinel claims it.
      existing['outputStyle'] = 'my-own-style';
      await fs.writeFile(settingsPath, JSON.stringify(existing, null, 2), 'utf-8');

      // Re-init with absent capabilities — we must NOT delete a key we never wrote.
      await createClaudeConfiguration(cwd, null, 'reinit', {});
      const settings = await readSettings();
      expect(settings['outputStyle']).toBe('my-own-style');
    });
  });

  // ── Gap 3: capabilities.commands accepts the object shape ─────────────────
  describe('capabilities.commands object shape { run, description, body }', () => {
    it('projects { run, description } into the command markdown body', async () => {
      await createClaudeConfiguration(cwd, null, initState, {
        capabilities: {
          commands: {
            ship: { description: 'Ship the release', run: 'npm run release' },
          },
        },
      });
      const content = await fs.readFile(path.join(cwd, '.claude', 'commands', 'ship.md'), 'utf-8');
      expect(content).toContain(BEGIN('command:ship'));
      expect(content).toContain('Ship the release');
      expect(content).toContain('```bash');
      expect(content).toContain('npm run release');
      expect(content).toContain(END('command:ship'));
    });

    it('accepts a free-form body field', async () => {
      await createClaudeConfiguration(cwd, null, initState, {
        capabilities: { commands: { audit: { body: '# Audit\n\nStep 1.' } } },
      });
      const content = await fs.readFile(path.join(cwd, '.claude', 'commands', 'audit.md'), 'utf-8');
      expect(content).toContain('# Audit');
      expect(content).toContain('Step 1.');
    });

    it('string and object forms coexist in one commands map', async () => {
      await createClaudeConfiguration(cwd, null, initState, {
        capabilities: {
          commands: {
            ship: 'plain string body',
            audit: { description: 'object body' },
          },
        },
      });
      expect(await fs.readFile(path.join(cwd, '.claude', 'commands', 'ship.md'), 'utf-8')).toContain('plain string body');
      expect(await fs.readFile(path.join(cwd, '.claude', 'commands', 'audit.md'), 'utf-8')).toContain('object body');
    });

    it('an object with no usable string field is dropped (no file created)', async () => {
      await createClaudeConfiguration(cwd, null, initState, {
        capabilities: { commands: { broken: { run: 42, description: null } } },
      });
      await expect(fs.access(path.join(cwd, '.claude', 'commands', 'broken.md'))).rejects.toThrow();
    });
  });
});
