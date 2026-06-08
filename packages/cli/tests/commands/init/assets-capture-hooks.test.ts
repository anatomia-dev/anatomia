/**
 * Always-install capture gating — the SessionStart/SessionEnd hooks (Phase 1+2).
 *
 * The capture hooks are installed by `ana init` REGARDLESS of the `processCapture`
 * flag; the flag is the single RUNTIME switch (`ana _capture` no-ops when off).
 * This supersedes the prior install-time gating (old contract A019/A020/A021):
 * there is no "no hook when off" and no flip-off prune — flipping the flag is a
 * live toggle with no re-init, and `ana _capture`'s runtime gate (covered in
 * _capture/forensics tests) is the sole on/off control.
 *
 * The end-to-end behavior runs the built CLI (`node dist/index.js init`), the
 * sanctioned pattern for init integration (getTemplatesDir resolves to
 * dist/templates only when compiled). Requires `pnpm run build` first.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createAnaJson } from '../../../src/commands/init/state.js';
import { createEmptyEngineResult } from '../../../src/engine/types/engineResult.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const cliPath = path.join(__dirname, '..', '..', '..', 'dist', 'index.js');

const CAPTURE_COMMAND = 'ana _capture';
const CAPTURE_DERIVE_COMMAND = 'ana _capture --derive';
const USER_COMMAND = 'echo my-user-hook';

/** Hook entry shape used by Claude/Codex settings. */
interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type: string; command: string }>;
}

/** Collect every hook command across all hook events in a settings object. */
function hookCommands(settings: Record<string, unknown>): string[] {
  const cmds: string[] = [];
  const hooks = (settings['hooks'] ?? {}) as Record<string, HookEntry[]>;
  for (const event of Object.keys(hooks)) {
    for (const entry of hooks[event] ?? []) {
      for (const h of entry.hooks ?? []) cmds.push(h.command);
    }
  }
  return cmds;
}

/** Collect the hook commands under a single named event. */
function eventCommands(settings: Record<string, unknown>, event: string): string[] {
  const hooks = (settings['hooks'] ?? {}) as Record<string, HookEntry[]>;
  const cmds: string[] = [];
  for (const entry of hooks[event] ?? []) {
    for (const h of entry.hooks ?? []) cmds.push(h.command);
  }
  return cmds;
}

describe('createAnaJson — customer default', () => {
  // @ana A018
  it('defaults processCapture to off', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-pc-default-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-pc-cwd-'));
    try {
      await createAnaJson(tmpDir, createEmptyEngineResult(), cwdDir);
      const anaJson = JSON.parse(await fs.readFile(path.join(tmpDir, 'ana.json'), 'utf-8'));
      expect(anaJson['processCapture']).toBe('off');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });
});

describe('always-install capture gating (built CLI)', () => {
  let tmpDir: string;
  let freshCommands: string[];
  let onCommands: string[];
  let onTwiceCommands: string[];
  let offCommands: string[];
  let onSettings: Record<string, unknown>;
  let offSettings: Record<string, unknown>;

  const settingsPath = (): string => path.join(tmpDir, '.claude', 'settings.json');

  async function setupProject(dir: string): Promise<void> {
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'capture-gate-fixture',
        version: '1.0.0',
        devDependencies: { vitest: '2.0.0', typescript: '5.7.0' },
        scripts: { build: 'tsc', test: 'vitest run', lint: 'eslint .' },
      }),
    );
    await fs.writeFile(path.join(dir, 'tsconfig.json'), '{}');
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'index.ts'), 'export const x = 1;\n');
    await fs.writeFile(path.join(dir, '.gitignore'), 'node_modules\n');
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir });
    await execFileAsync('git', ['add', '-A'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: dir });
  }

  async function runInit(): Promise<void> {
    await execFileAsync('node', [cliPath, 'init', '--force', '--platforms', 'claude'], { cwd: tmpDir });
  }

  async function readSettings(): Promise<Record<string, unknown>> {
    return JSON.parse(await fs.readFile(settingsPath(), 'utf-8'));
  }

  async function setProcessCapture(value: 'on' | 'off'): Promise<void> {
    const anaJsonPath = path.join(tmpDir, '.ana', 'ana.json');
    const anaJson = JSON.parse(await fs.readFile(anaJsonPath, 'utf-8'));
    anaJson['processCapture'] = value;
    await fs.writeFile(anaJsonPath, JSON.stringify(anaJson, null, 2), 'utf-8');
  }

  /** Seed a user-authored SessionStart hook into the generated settings.json. */
  async function seedUserHook(): Promise<void> {
    const settings = await readSettings();
    const hooks = (settings['hooks'] ?? {}) as Record<string, HookEntry[]>;
    hooks['SessionStart'] = [
      ...(hooks['SessionStart'] ?? []),
      { hooks: [{ type: 'command', command: USER_COMMAND }] },
    ];
    settings['hooks'] = hooks;
    await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
  }

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-capture-gate-'));
    await setupProject(tmpDir);

    // 1. Fresh init — customer default is off, but the hook is ALWAYS installed
    //    (the flag is the runtime switch, not an install gate).
    await runInit();
    freshCommands = hookCommands(await readSettings());

    // 2. Seed a user hook, flip processCapture on, re-init → capture hook present
    //    (idempotent), user hook preserved.
    await seedUserHook();
    await setProcessCapture('on');
    await runInit();
    onSettings = await readSettings();
    onCommands = hookCommands(onSettings);

    // 3. Re-init again with capture on → idempotent (no duplicate hook).
    await runInit();
    onTwiceCommands = hookCommands(await readSettings());

    // 4. Flip processCapture off, re-init → capture hook STAYS installed
    //    (runtime-gated, never pruned), user hook intact.
    await setProcessCapture('off');
    await runInit();
    offSettings = await readSettings();
    offCommands = hookCommands(offSettings);
  }, 120000);

  afterAll(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // Supersedes old A020 ("no hook when off"): the hook is installed regardless of the flag.
  it('fresh install installs the capture hook regardless of the flag (default off)', () => {
    expect(freshCommands).toContain(CAPTURE_COMMAND);
  });

  // @ana A019
  it('init installs the ana _capture hook', () => {
    expect(onCommands).toContain(CAPTURE_COMMAND);
  });

  // @ana A022
  it('installing the capture hook preserves user-authored hooks', () => {
    expect(onCommands).toContain(USER_COMMAND);
  });

  it('re-init is idempotent (exactly one capture hook)', () => {
    expect(onTwiceCommands.filter((c) => c === CAPTURE_COMMAND)).toHaveLength(1);
  });

  // Supersedes old A021 ("flip-off prunes"): the hook stays; the flag gates at runtime.
  it('capture hook stays installed when the flag is off (runtime-gated, not pruned)', () => {
    expect(offCommands).toContain(CAPTURE_COMMAND);
  });

  // @ana A022
  it('user-authored hooks stay intact across on/off flips', () => {
    expect(offCommands).toContain(USER_COMMAND);
  });

  // ── Phase 2: the SessionEnd derive hook ────────────────────────────────────

  it('installs the SessionEnd derive hook (Claude)', () => {
    expect(eventCommands(onSettings, 'SessionEnd')).toContain(CAPTURE_DERIVE_COMMAND);
  });

  it('the SessionEnd derive hook stays installed when the flag is off', () => {
    expect(eventCommands(offSettings, 'SessionEnd')).toContain(CAPTURE_DERIVE_COMMAND);
  });

  it('the SessionStart hook stays the plain capture command (not the derive)', () => {
    expect(eventCommands(onSettings, 'SessionStart')).toContain(CAPTURE_COMMAND);
    expect(eventCommands(onSettings, 'SessionStart')).not.toContain(CAPTURE_DERIVE_COMMAND);
  });
});

/**
 * Codex install coverage. Exercises hooks.json SessionStart + Stop (always
 * installed), user-hook preservation, the config.toml merge (delta #2), and that
 * the hooks remain installed when the flag is off (runtime-gated, not pruned).
 */
describe('always-install capture gating — Codex (built CLI)', () => {
  let tmpDir: string;
  let onHooks: Record<string, HookEntry[]>;
  let onConfig: string;
  let offHooks: Record<string, HookEntry[]>;

  const USER_CONFIG = '# user codex config\n[history]\npersistence = "save-all"\n';

  const hooksPath = (): string => path.join(tmpDir, '.codex', 'hooks.json');
  const configPath = (): string => path.join(tmpDir, '.codex', 'config.toml');

  async function setupProject(dir: string): Promise<void> {
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'codex-gate-fixture',
        version: '1.0.0',
        devDependencies: { vitest: '2.0.0', typescript: '5.7.0' },
        scripts: { build: 'tsc', test: 'vitest run', lint: 'eslint .' },
      }),
    );
    await fs.writeFile(path.join(dir, 'tsconfig.json'), '{}');
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'index.ts'), 'export const x = 1;\n');
    await fs.writeFile(path.join(dir, '.gitignore'), 'node_modules\n');
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir });
    await execFileAsync('git', ['add', '-A'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: dir });
  }

  async function runInitCodex(): Promise<void> {
    await execFileAsync('node', [cliPath, 'init', '--force', '--platforms', 'codex'], { cwd: tmpDir });
  }

  async function setProcessCapture(value: 'on' | 'off'): Promise<void> {
    const anaJsonPath = path.join(tmpDir, '.ana', 'ana.json');
    const anaJson = JSON.parse(await fs.readFile(anaJsonPath, 'utf-8'));
    anaJson['processCapture'] = value;
    await fs.writeFile(anaJsonPath, JSON.stringify(anaJson, null, 2), 'utf-8');
  }

  async function readHooks(): Promise<Record<string, HookEntry[]>> {
    try {
      return JSON.parse(await fs.readFile(hooksPath(), 'utf-8'));
    } catch {
      return {};
    }
  }

  function eventCmds(hooks: Record<string, HookEntry[]>, event: string): string[] {
    const cmds: string[] = [];
    for (const entry of hooks[event] ?? []) {
      for (const h of entry.hooks ?? []) cmds.push(h.command);
    }
    return cmds;
  }

  function allCmds(hooks: Record<string, HookEntry[]>): string[] {
    return Object.keys(hooks).flatMap((e) => eventCmds(hooks, e));
  }

  /** Seed a user-authored hook into hooks.json under SessionStart. */
  async function seedUserHook(): Promise<void> {
    const hooks = await readHooks();
    hooks['SessionStart'] = [
      ...(hooks['SessionStart'] ?? []),
      { hooks: [{ type: 'command', command: USER_COMMAND }] },
    ];
    await fs.writeFile(hooksPath(), JSON.stringify(hooks, null, 2), 'utf-8');
  }

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-codex-gate-'));
    await setupProject(tmpDir);

    // 1. Fresh init (default off) — hooks are installed regardless.
    await runInitCodex();

    // 2. Pre-seed a user config.toml WITHOUT the hooks flag (delta #2 scenario)
    //    and a user-authored hook, flip capture on, re-init.
    await fs.writeFile(configPath(), USER_CONFIG, 'utf-8');
    await seedUserHook();
    await setProcessCapture('on');
    await runInitCodex();
    onHooks = await readHooks();
    onConfig = await fs.readFile(configPath(), 'utf-8');

    // 3. Flip off, re-init → capture hooks STAY installed (runtime-gated), user hook kept.
    await setProcessCapture('off');
    await runInitCodex();
    offHooks = await readHooks();
  }, 120000);

  afterAll(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('installs the SessionStart capture hook (Codex)', () => {
    expect(eventCmds(onHooks, 'SessionStart')).toContain(CAPTURE_COMMAND);
  });

  it('installs the Stop derive hook (Codex)', () => {
    expect(eventCmds(onHooks, 'Stop')).toContain(CAPTURE_DERIVE_COMMAND);
  });

  it('installing the Codex hooks preserves user-authored hooks', () => {
    expect(allCmds(onHooks)).toContain(USER_COMMAND);
  });

  it('merges the [features] hooks flag into a pre-existing config.toml (delta #2)', () => {
    expect(onConfig).toMatch(/hooks\s*=\s*true/);
    // The user's own config is preserved, not clobbered.
    expect(onConfig).toContain('persistence = "save-all"');
  });

  it('capture hooks stay installed when the flag is off (Codex, runtime-gated)', () => {
    const cmds = allCmds(offHooks);
    expect(cmds).toContain(CAPTURE_COMMAND);
    expect(cmds).toContain(CAPTURE_DERIVE_COMMAND);
  });

  it('user-authored hooks stay intact across on/off flips (Codex)', () => {
    expect(allCmds(offHooks)).toContain(USER_COMMAND);
  });
});
