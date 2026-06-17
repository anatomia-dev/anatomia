/**
 * Ultimate-configurability — comprehensive hardening suite.
 *
 * The per-slice suites pin each slice's own behavior (manifest.test.ts,
 * platforms/registry.test.ts, assets-agent-skills/-roster/-managed-blocks,
 * skills-custom). This file closes the CROSS-CUTTING acceptance criteria that
 * span more than one slice and live in no single slice's home — the
 * no-regression contract the spec demands be "bulletproof":
 *
 *   1. The additive fields (agents / skills) survive a REAL `preserveUserState`
 *      re-init round-trip untouched (spec verified-premise #2 — the load-bearing
 *      re-init safety).
 *   2. `config set` does not warn on the new fields (KNOWN_FIELDS is derived
 *      from the schema shape — the spec's stated benefit).
 *   3. Schema posture: each is optional, NO `.default` (absent
 *      stays `undefined` → absent survives re-init), and each degrades
 *      per-element rather than nuking the config.
 *   4. The post-init success display (state.ts:1015 `displaySuccessMessage`)
 *      COUNTS the config-added always-on skill — the count surface matches the
 *      scaffolded set, end to end.
 *   5. The pre-init scan preview (scan.ts:412 `formatHumanReadable`) does NOT
 *      leak a config-added always-on skill — CORRECTION #1 left that surface on
 *      the raw constant on purpose (no guaranteed ana.json pre-init).
 *   6. `detectPlatforms` routes through the registry and the registry-only
 *      `cursor` descriptor never leaks into detection or the run allowlist.
 *
 * Every block carries an "absent = today" anchor so a regression in the
 * unconfigured path fails loudly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Command } from 'commander';
import { AnaJsonSchema } from '../../../src/commands/init/anaJsonSchema.js';
import { preserveUserState, displaySuccessMessage, detectPlatforms } from '../../../src/commands/init/state.js';
import { createDirectoryStructure } from '../../../src/commands/init/assets.js';
import { formatHumanReadable } from '../../../src/commands/scan.js';
import { createEmptyEngineResult } from '../../../src/engine/types/engineResult.js';
import type { EngineResult } from '../../../src/engine/types/engineResult.js';
import { computeSkillManifest, CORE_SKILLS } from '../../../src/constants.js';
import { platformDetectProbes, knownPlatformIds } from '../../../src/platforms/registry.js';
import { createTestProject } from '../../helpers/test-project.js';

/** The additive configurability fields under the no-regression contract. */
const NEW_CONFIG_FIELDS = ['agents', 'skills'] as const;

/** Engine result whose stack fires the conditional skill triggers. */
function richResult(): EngineResult {
  const base = createEmptyEngineResult();
  return {
    ...base,
    stack: { ...base.stack, framework: 'Next.js', database: 'PostgreSQL', aiSdk: 'OpenAI' },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Re-init survival via preserveUserState (spec verified-premise #2)
// ───────────────────────────────────────────────────────────────────────────

describe('re-init: the configurability fields survive preserveUserState untouched', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cfg-reinit-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /** Run a real preserveUserState merge with `existing` as the prior ana.json. */
  async function reinit(existing: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existingAnaPath = path.join(tmpDir, '.ana-existing');
    await fs.mkdir(existingAnaPath, { recursive: true });
    await fs.writeFile(path.join(existingAnaPath, 'ana.json'), JSON.stringify(existing), 'utf-8');

    const tmpAnaPath = path.join(tmpDir, '.ana-tmp');
    await createDirectoryStructure(tmpAnaPath);

    const newConfig = {
      anaVersion: '9.9.9',
      lastScanAt: '2026-06-13T00:00:00Z',
      name: existing['name'] ?? 'test',
      language: null,
      framework: null,
      packageManager: null,
    };
    await preserveUserState(existingAnaPath, tmpAnaPath, newConfig);
    return JSON.parse(await fs.readFile(path.join(tmpAnaPath, 'ana.json'), 'utf-8'));
  }

  it('preserves a full agents block (skills + model) verbatim across re-init', async () => {
    const agents = {
      'ana-build': { skills: ['git-workflow', 'api-patterns'], model: 'opus' },
      'ana-release': { skills: ['git-workflow'] },
    };
    const result = await reinit({ name: 'test', agents });
    expect(result['agents']).toEqual(agents);
  });

  it('preserves a skills (always-on) block verbatim across re-init', async () => {
    const skills = { observability: { always: true }, metrics: { always: true } };
    const result = await reinit({ name: 'test', skills });
    expect(result['skills']).toEqual(skills);
  });

  it('a legacy/unmanaged key survives re-init via schema passthrough (migration safety)', async () => {
    // capabilities / platformDefaults are no longer managed schema fields, but a
    // project that set them before must not LOSE data — `.passthrough()` carries
    // any unrecognized key through the re-init merge untouched.
    const existing = {
      name: 'test',
      capabilities: { outputStyle: 'concise' },
      platformDefaults: { codex: { model: 'gpt-5.5' } },
    };
    const result = await reinit(existing);
    expect(result['capabilities']).toEqual(existing.capabilities);
    expect(result['platformDefaults']).toEqual(existing.platformDefaults);
  });

  it('preserves agents + skills at once, alongside the mechanical overrides (name/version refreshed)', async () => {
    const existing = {
      name: 'old-name',
      agents: { 'ana-build': { skills: ['git-workflow'] } },
      skills: { observability: { always: true } },
    };
    const result = await reinit(existing);
    expect(result['agents']).toEqual(existing.agents);
    expect(result['skills']).toEqual(existing.skills);
    // The mechanical overrides still fire — version/timestamp refresh from fresh.
    expect(result['anaVersion']).toBe('9.9.9');
    expect(result['lastScanAt']).toBe('2026-06-13T00:00:00Z');
  });

  it('absent = today: a config with none of the four gains none of them on re-init', async () => {
    const result = await reinit({ name: 'test', artifactBranch: 'main' });
    for (const field of NEW_CONFIG_FIELDS) {
      expect(field in result).toBe(false);
    }
    // The non-config path is unchanged — artifactBranch rides through.
    expect(result['artifactBranch']).toBe('main');
  });

  it('idempotent: a second re-init from the first re-init output is a fixpoint', async () => {
    const existing = {
      name: 'test',
      agents: { 'ana-build': { skills: ['git-workflow', 'api-patterns'] } },
      skills: { observability: { always: true } },
    };
    const once = await reinit(existing);
    const twice = await reinit(once);
    expect(twice['agents']).toEqual(once['agents']);
    expect(twice['skills']).toEqual(once['skills']);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. config set does not warn on the four new fields (KNOWN_FIELDS derivation)
// ───────────────────────────────────────────────────────────────────────────

describe('config set — the four configurability fields are known (no unknown-field warning)', () => {
  let tmpDir: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  async function createProgram(): Promise<Command> {
    const { registerConfigCommand } = await import('../../../src/commands/config.js');
    const program = new Command();
    program.exitOverride();
    registerConfigCommand(program);
    return program;
  }

  async function runCommand(program: Command, args: string[]): Promise<void> {
    try {
      await program.parseAsync(['node', 'test', ...args]);
    } catch {
      // exitOverride throws on errors that set exitCode — swallow.
    }
  }

  function errorOutput(): string {
    return errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cfg-known-'));
    originalCwd = process.cwd();
    await createTestProject(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.ana'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.ana', 'ana.json'),
      JSON.stringify({ name: 'test', artifactBranch: 'main' }, null, 2),
      'utf-8',
    );
    process.chdir(tmpDir);
    process.exitCode = 0;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = 0;
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  it('KNOWN_FIELDS (derived from the schema shape) contains the new fields', () => {
    const fields = Object.keys(AnaJsonSchema.shape);
    for (const field of NEW_CONFIG_FIELDS) {
      expect(fields).toContain(field);
    }
  });

  for (const field of NEW_CONFIG_FIELDS) {
    it(`does not warn "not a known ana.json field" when setting ${field}.x`, async () => {
      const program = await createProgram();
      // A nested key under each field — config set writes a leaf; the warning
      // keys off the TOP-LEVEL field name, which is now in KNOWN_FIELDS.
      await runCommand(program, ['config', 'set', `${field}.demo`, 'value']);
      expect(errorOutput()).not.toContain('not a known ana.json field');
    });
  }

  it('still warns on a genuinely unknown top-level field (no-regression on the guard)', async () => {
    const program = await createProgram();
    await runCommand(program, ['config', 'set', 'totallyMadeUpField', 'value']);
    expect(errorOutput()).toContain('not a known ana.json field');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Schema posture: absent = undefined, per-element degrade (all four fields)
// ───────────────────────────────────────────────────────────────────────────

describe('AnaJsonSchema — configurability fields: absent stays undefined, NO default', () => {
  it('the new fields are undefined when the ana.json omits them (migration-safe, no .default)', () => {
    const parsed = AnaJsonSchema.parse({ name: 'x' }) as Record<string, unknown>;
    for (const field of NEW_CONFIG_FIELDS) {
      expect(parsed[field]).toBeUndefined();
      // Critically: the key must not be MATERIALIZED by a default — an absent
      // key has to stay absent so it survives the re-init passthrough untouched.
      expect(field in parsed).toBe(false);
    }
  });

  it('a valid agents block round-trips through the schema unchanged', () => {
    const agents = {
      'ana-build': { skills: ['git-workflow', 'api-patterns'], model: 'opus' },
    };
    expect(AnaJsonSchema.parse({ name: 'x', agents }).agents).toEqual(agents);
  });

  it('a valid skills block round-trips through the schema unchanged', () => {
    const skills = { observability: { always: true } };
    expect(AnaJsonSchema.parse({ name: 'x', skills }).skills).toEqual(skills);
  });
});

describe('AnaJsonSchema — configurability fields degrade per-element, never nuke', () => {
  it('a malformed agents entry catches to {} while a sibling valid entry survives', () => {
    const parsed = AnaJsonSchema.parse({
      name: 'x',
      agents: {
        'ana-build': { skills: ['git-workflow'] },
        'ana-plan': 'not-an-object', // malformed → per-element .catch({})
      },
    });
    const agents = parsed.agents as Record<string, unknown>;
    expect(agents['ana-build']).toEqual({ skills: ['git-workflow'] });
    expect(agents['ana-plan']).toEqual({});
  });

  it('a malformed agents.<name>.skills (wrong type) catches to undefined, sibling keys survive', () => {
    const parsed = AnaJsonSchema.parse({
      name: 'x',
      agents: { 'ana-build': { skills: 'git-workflow', model: 'opus' } },
    });
    const build = (parsed.agents as Record<string, Record<string, unknown>>)['ana-build']!;
    expect(build['skills']).toBeUndefined();
    expect(build['model']).toBe('opus');
  });

  it('a malformed skills entry catches to {} (the surviving entry keeps always:true)', () => {
    const parsed = AnaJsonSchema.parse({
      name: 'x',
      skills: { observability: { always: true }, broken: 42 },
    });
    const skills = parsed.skills as Record<string, unknown>;
    expect(skills['observability']).toEqual({ always: true });
    expect(skills['broken']).toEqual({});
  });

  it('passthrough survives alongside a malformed configurability field (no cross-contamination)', () => {
    const parsed = AnaJsonSchema.parse({
      name: 'x',
      agents: 'not-a-record', // whole field catches to undefined
      unknownUserKey: 'must-survive',
    }) as Record<string, unknown>;
    expect(parsed['agents']).toBeUndefined();
    expect(parsed['unknownUserKey']).toBe('must-survive');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Post-init success display counts the config-added always-on skill
// ───────────────────────────────────────────────────────────────────────────

describe('displaySuccessMessage — post-init skill count reflects the config-added skill', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  function output(): string {
    return logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  }

  it('absent config: count + Detected line match the computed manifest (absent = today)', () => {
    const r = richResult();
    const computed = computeSkillManifest(r);
    displaySuccessMessage(r, 'demo', '2026-06-13T00:00:00Z', {});
    const out = output();
    expect(out).toContain(`(${computed.length} skills)`);
    // Conditional triggers fired — they show on the Detected line.
    expect(out).toContain('api-patterns');
  });

  it('a config-added always-on skill widens the count and lands on the Detected line', () => {
    const r = createEmptyEngineResult();
    const baseCount = computeSkillManifest(r).length;
    displaySuccessMessage(r, 'demo', '2026-06-13T00:00:00Z', {
      skills: { observability: { always: true } },
    });
    const out = output();
    // The count is the computed manifest + the one config-added skill.
    expect(out).toContain(`(${baseCount + 1} skills)`);
    // observability is not a CORE skill, so it shows under Detected, not Core.
    expect(CORE_SKILLS as readonly string[]).not.toContain('observability');
    expect(out).toContain('observability');
  });

  it('the count surface equals resolveSkillManifest length exactly (count ≡ scaffold)', () => {
    const r = createEmptyEngineResult();
    const anaConfig = { skills: { observability: { always: true }, metrics: { always: true } } };
    displaySuccessMessage(r, 'demo', '2026-06-13T00:00:00Z', anaConfig);
    // Two always-on additions beyond the computed manifest.
    expect(output()).toContain(`(${computeSkillManifest(r).length + 2} skills)`);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Pre-init scan preview does NOT leak a config-added skill (CORRECTION #1)
// ───────────────────────────────────────────────────────────────────────────

describe('scan preview (formatHumanReadable) stays on the raw constant — no config leak', () => {
  it('the scan card reports the computed manifest count, ignoring any ana.json skills', () => {
    // formatHumanReadable runs pre-init with no guaranteed ana.json, so it
    // deliberately uses computeSkillManifest (CORRECTION #1). Even a stack that
    // fires conditional triggers must count ONLY the computed manifest — there
    // is no path for a config-added always-on skill to reach this surface.
    const r = richResult();
    const computed = computeSkillManifest(r);
    const card = formatHumanReadable(r, { isFunnel: false, rootPath: '/tmp/x' });
    expect(card).toContain(`scaffold ${computed.length} skills`);
    // The conditional skills the rich stack fired are named in the preview.
    expect(card).toContain('api-patterns');
    // No config-only skill name leaks in (formatHumanReadable never reads config).
    expect(card).not.toContain('observability');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. detectPlatforms routes through the registry; cursor never leaks
// ───────────────────────────────────────────────────────────────────────────

describe('detectPlatforms — registry-routed, cursor (registry-only) never leaks', () => {
  it('returns at least one platform and only ever ids from the detect probes', () => {
    const probeIds = new Set(platformDetectProbes().map((p) => p.id));
    const detected = detectPlatforms();
    expect(detected.length).toBeGreaterThan(0);
    for (const id of detected) {
      // Either a probed platform, or the safe claude default — never cursor.
      expect(probeIds.has(id) || id === 'claude').toBe(true);
      expect(id).not.toBe('cursor');
    }
  });

  it('cursor is absent from both the detect probes and the run allowlist (no-regression)', () => {
    expect(platformDetectProbes().some((p) => p.id === 'cursor')).toBe(false);
    expect(knownPlatformIds().has('cursor')).toBe(false);
    // The probe set stays byte-identical to the pre-registry literal order.
    expect(platformDetectProbes().map((p) => p.id)).toEqual(['claude', 'codex']);
  });
});
