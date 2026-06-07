/**
 * Install-time capture gating — the SessionStart hook install + prune (Phase 1).
 *
 * The end-to-end install/prune behavior runs the built CLI (`node dist/index.js
 * init`), the sanctioned pattern for init integration (getTemplatesDir resolves
 * to dist/templates only when compiled). The customer-default-off guard drives
 * createAnaJson directly. Requires `pnpm run build` first.
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

describe('install-time capture gating (built CLI)', () => {
  let tmpDir: string;
  let freshCommands: string[];
  let onCommands: string[];
  let onTwiceCommands: string[];
  let offCommands: string[];

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

    // 1. Fresh init — customer default off → no capture hook.
    await runInit();
    freshCommands = hookCommands(await readSettings());

    // 2. Seed a user hook, flip processCapture on, re-init → capture hook added,
    //    user hook preserved.
    await seedUserHook();
    await setProcessCapture('on');
    await runInit();
    onCommands = hookCommands(await readSettings());

    // 3. Re-init again with capture still on → idempotent (no duplicate hook).
    await runInit();
    onTwiceCommands = hookCommands(await readSettings());

    // 4. Flip processCapture off, re-init → capture hook pruned, user hook kept.
    await setProcessCapture('off');
    await runInit();
    offCommands = hookCommands(await readSettings());
  }, 120000);

  afterAll(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A020
  it('fresh install (default off) installs no capture hook', () => {
    expect(freshCommands).not.toContain(CAPTURE_COMMAND);
  });

  // @ana A019
  it('re-init with processCapture on installs the ana _capture hook', () => {
    expect(onCommands).toContain(CAPTURE_COMMAND);
  });

  // @ana A022
  it('installing the capture hook preserves user-authored hooks', () => {
    expect(onCommands).toContain(USER_COMMAND);
  });

  it('re-init with capture on is idempotent (exactly one capture hook)', () => {
    expect(onTwiceCommands.filter((c) => c === CAPTURE_COMMAND)).toHaveLength(1);
  });

  // @ana A021
  it('re-init with processCapture off prunes the previously-installed capture hook', () => {
    expect(offCommands).not.toContain(CAPTURE_COMMAND);
  });

  // @ana A022
  it('pruning the capture hook leaves user-authored hooks intact', () => {
    expect(offCommands).toContain(USER_COMMAND);
  });
});
