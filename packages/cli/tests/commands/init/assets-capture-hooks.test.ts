/**
 * Capture-hook install model — one SessionStart hook, legacy derive pruned (Phase 3).
 *
 * `ana init` installs exactly one capture hook: `SessionStart → ana _capture`, on
 * both Claude and Codex, REGARDLESS of the `processCapture` flag (the flag is the
 * single RUNTIME switch — `ana _capture` no-ops when off; flipping it is a live
 * toggle with no re-init). The retired end-of-session derive hook
 * (`ana _capture --derive`, SessionEnd on Claude / Stop on Codex) is no longer
 * installed and is actively PRUNED from upgraded installs that still carry it —
 * keying on the exact command so user-authored hooks under the same event survive.
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
const templateHooksPath = path.join(__dirname, '..', '..', '..', 'templates', '.codex', 'hooks.json');

const CAPTURE_COMMAND = 'ana _capture';
const CAPTURE_DERIVE_COMMAND = 'ana _capture --derive';
const USER_COMMAND = 'echo my-user-hook';
/** A user-authored end-of-session hook that must survive the derive prune. */
const USER_CLEANUP_COMMAND = 'my-own-cleanup.sh';

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

/** The raw `hooks` object from a settings object (for presence/absence of an event key). */
function hooksObject(settings: Record<string, unknown>): Record<string, unknown> {
  return (settings['hooks'] ?? {}) as Record<string, unknown>;
}

describe('createAnaJson — customer default', () => {
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

describe('single capture hook + derive prune — Claude (built CLI)', () => {
  let tmpDir: string;
  let freshSettings: Record<string, unknown>;
  let freshCommands: string[];
  let onCommands: string[];
  let onTwiceCommands: string[];
  let offSettings: Record<string, unknown>;
  let offCommands: string[];
  let prunedSettings: Record<string, unknown>;
  let deriveOnlySettings: Record<string, unknown>;

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

  /** Overwrite the SessionEnd event with the given entries (simulates a legacy install). */
  async function seedClaudeSessionEnd(entries: HookEntry[]): Promise<void> {
    const settings = await readSettings();
    const hooks = (settings['hooks'] ?? {}) as Record<string, HookEntry[]>;
    hooks['SessionEnd'] = entries;
    settings['hooks'] = hooks;
    await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
  }

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-capture-claude-'));
    await setupProject(tmpDir);

    // 1. Fresh init — the SessionStart hook is ALWAYS installed (default off);
    //    no SessionEnd derive hook is installed any more.
    await runInit();
    freshSettings = await readSettings();
    freshCommands = hookCommands(freshSettings);

    // 2. Seed a user SessionStart hook, flip processCapture on, re-init →
    //    capture hook present (idempotent), user hook preserved.
    await seedUserHook();
    await setProcessCapture('on');
    await runInit();
    onCommands = hookCommands(await readSettings());

    // 3. Re-init again → idempotent (no duplicate capture hook).
    await runInit();
    onTwiceCommands = hookCommands(await readSettings());

    // 4. Flip off, re-init → SessionStart capture hook STAYS (runtime-gated).
    await setProcessCapture('off');
    await runInit();
    offSettings = await readSettings();
    offCommands = hookCommands(offSettings);

    // 5. Simulate a legacy install: seed a SessionEnd holding the retired derive
    //    hook alongside a user-authored cleanup hook, then re-init → derive pruned,
    //    user hook survives.
    await seedClaudeSessionEnd([
      { hooks: [{ type: 'command', command: CAPTURE_DERIVE_COMMAND }] },
      { hooks: [{ type: 'command', command: USER_CLEANUP_COMMAND }] },
    ]);
    await runInit();
    prunedSettings = await readSettings();

    // 6. Seed a SessionEnd holding ONLY the derive hook, re-init → the now-empty
    //    SessionEnd key is removed entirely.
    await seedClaudeSessionEnd([
      { hooks: [{ type: 'command', command: CAPTURE_DERIVE_COMMAND }] },
    ]);
    await runInit();
    deriveOnlySettings = await readSettings();
  }, 120000);

  afterAll(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A038 — a fresh install gets exactly one capture hook on Claude.
  it('fresh install installs the SessionStart capture hook', () => {
    expect(eventCommands(freshSettings, 'SessionStart')).toContain(CAPTURE_COMMAND);
    expect(freshCommands.filter((c) => c === CAPTURE_COMMAND)).toHaveLength(1);
  });

  // @ana A039 — a fresh install installs no end-of-session derive hook.
  it('fresh install installs no SessionEnd derive hook', () => {
    expect(freshCommands).not.toContain(CAPTURE_DERIVE_COMMAND);
    expect(hooksObject(freshSettings)['SessionEnd']).toBeUndefined();
  });

  it('init installs the ana _capture hook', () => {
    expect(onCommands).toContain(CAPTURE_COMMAND);
  });

  it('installing the capture hook preserves user-authored hooks', () => {
    expect(onCommands).toContain(USER_COMMAND);
  });

  it('re-init is idempotent (exactly one capture hook)', () => {
    expect(onTwiceCommands.filter((c) => c === CAPTURE_COMMAND)).toHaveLength(1);
  });

  it('capture hook stays installed when the flag is off (runtime-gated, not pruned)', () => {
    expect(offCommands).toContain(CAPTURE_COMMAND);
  });

  it('user-authored hooks stay intact across on/off flips', () => {
    expect(offCommands).toContain(USER_COMMAND);
  });

  // ── Phase 3: derive prune on re-init ────────────────────────────────────────

  // @ana A040 — re-init removes a stale derive hook left by an older version.
  it('re-init prunes a stale SessionEnd derive hook', () => {
    expect(eventCommands(prunedSettings, 'SessionEnd')).not.toContain(CAPTURE_DERIVE_COMMAND);
    expect(hookCommands(prunedSettings)).not.toContain(CAPTURE_DERIVE_COMMAND);
  });

  // @ana A041 — pruning a stale hook never removes the user's own hooks.
  it('re-init preserves a co-located user-authored SessionEnd hook', () => {
    expect(eventCommands(prunedSettings, 'SessionEnd')).toContain(USER_CLEANUP_COMMAND);
    // The SessionStart capture hook is untouched by the prune.
    expect(eventCommands(prunedSettings, 'SessionStart')).toContain(CAPTURE_COMMAND);
  });

  it('removes the SessionEnd key entirely when it held only the derive hook', () => {
    expect(hooksObject(deriveOnlySettings)['SessionEnd']).toBeUndefined();
    expect(eventCommands(deriveOnlySettings, 'SessionStart')).toContain(CAPTURE_COMMAND);
  });
});

/**
 * Codex install coverage. Exercises hooks.json SessionStart (always installed),
 * the absence of the Stop derive hook on fresh installs, the derive prune on
 * re-init, user-hook preservation, and the config.toml merge (delta #2).
 */
describe('single capture hook + derive prune — Codex (built CLI)', () => {
  let tmpDir: string;
  let freshHooks: Record<string, HookEntry[]>;
  let onHooks: Record<string, HookEntry[]>;
  let onConfig: string;
  let prunedHooks: Record<string, HookEntry[]>;
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

  /** Overwrite the Stop event with the given entries (simulates a legacy install). */
  async function seedCodexStop(entries: HookEntry[]): Promise<void> {
    const hooks = await readHooks();
    hooks['Stop'] = entries;
    await fs.writeFile(hooksPath(), JSON.stringify(hooks, null, 2), 'utf-8');
  }

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-capture-codex-'));
    await setupProject(tmpDir);

    // 1. Fresh init (default off) — SessionStart installed, no Stop derive hook.
    await runInitCodex();
    freshHooks = await readHooks();

    // 2. Pre-seed a user config.toml WITHOUT the hooks flag (delta #2 scenario)
    //    and a user-authored SessionStart hook, flip capture on, re-init.
    await fs.writeFile(configPath(), USER_CONFIG, 'utf-8');
    await seedUserHook();
    await setProcessCapture('on');
    await runInitCodex();
    onHooks = await readHooks();
    onConfig = await fs.readFile(configPath(), 'utf-8');

    // 3. Simulate a legacy install: seed a Stop holding the retired derive hook
    //    alongside a user-authored cleanup hook, re-init → derive pruned, user kept.
    await seedCodexStop([
      { hooks: [{ type: 'command', command: CAPTURE_DERIVE_COMMAND }] },
      { hooks: [{ type: 'command', command: USER_CLEANUP_COMMAND }] },
    ]);
    await runInitCodex();
    prunedHooks = await readHooks();

    // 4. Flip off, re-init → SessionStart capture hook STAYS (runtime-gated).
    await setProcessCapture('off');
    await runInitCodex();
    offHooks = await readHooks();
  }, 120000);

  afterAll(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('fresh install installs the SessionStart capture hook (Codex)', () => {
    expect(eventCmds(freshHooks, 'SessionStart')).toContain(CAPTURE_COMMAND);
  });

  it('fresh install installs no Stop derive hook (Codex)', () => {
    expect(allCmds(freshHooks)).not.toContain(CAPTURE_DERIVE_COMMAND);
    expect(freshHooks['Stop']).toBeUndefined();
  });

  it('installs the SessionStart capture hook on re-init (Codex)', () => {
    expect(eventCmds(onHooks, 'SessionStart')).toContain(CAPTURE_COMMAND);
  });

  it('installing the Codex hooks preserves user-authored hooks', () => {
    expect(allCmds(onHooks)).toContain(USER_COMMAND);
  });

  it('merges the [features] hooks flag into a pre-existing config.toml (delta #2)', () => {
    expect(onConfig).toMatch(/hooks\s*=\s*true/);
    // The user's own config is preserved, not clobbered.
    expect(onConfig).toContain('persistence = "save-all"');
  });

  // @ana A043 — re-init prunes the stale derive hook on Codex too.
  it('re-init prunes a stale Stop derive hook (Codex)', () => {
    expect(eventCmds(prunedHooks, 'Stop')).not.toContain(CAPTURE_DERIVE_COMMAND);
    expect(allCmds(prunedHooks)).not.toContain(CAPTURE_DERIVE_COMMAND);
  });

  it('re-init preserves a co-located user-authored Stop hook (Codex)', () => {
    expect(eventCmds(prunedHooks, 'Stop')).toContain(USER_CLEANUP_COMMAND);
    expect(eventCmds(prunedHooks, 'SessionStart')).toContain(CAPTURE_COMMAND);
  });

  it('capture hook stays installed when the flag is off (Codex, runtime-gated)', () => {
    expect(allCmds(offHooks)).toContain(CAPTURE_COMMAND);
  });

  it('user-authored hooks stay intact across on/off flips (Codex)', () => {
    expect(allCmds(offHooks)).toContain(USER_COMMAND);
  });
});

/**
 * Structural enforcement on the shipped Codex template — no built CLI needed.
 * The template must carry only the SessionStart capture hook; no Stop / derive.
 */
describe('Codex hooks template (structural)', () => {
  // @ana A042 — the Codex install template carries no derive hook.
  it('templates/.codex/hooks.json has no derive entry and no Stop key', async () => {
    const raw = await fs.readFile(templateHooksPath, 'utf-8');
    expect(raw).not.toContain('--derive');

    const parsed = JSON.parse(raw) as Record<string, HookEntry[]>;
    expect(parsed['Stop']).toBeUndefined();
    const sessionStartCmds = (parsed['SessionStart'] ?? []).flatMap((e) =>
      (e.hooks ?? []).map((h) => h.command),
    );
    expect(sessionStartCmds).toContain(CAPTURE_COMMAND);
  });
});
