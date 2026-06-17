/**
 * Unit tests for src/platforms/registry.ts — the single platform descriptor
 * table.
 *
 * The load-bearing contract is the *identity function*: routing the legacy
 * consumers (getAgentsDir, KNOWN_PLATFORMS, resolveAgentDefPath,
 * detectPlatforms, the Codex run defaults, AGENT_FILES/CODEX_AGENT_FILES)
 * through the registry must produce **byte-identical** output to the
 * pre-registry literals. These tests pin that so a future descriptor edit can
 * never silently change stock behavior — the no-regression contract.
 *
 * Plus the headline proof: a registry-only descriptor (`cursor`) resolves its
 * agents dir through the SAME `getAgentsDir` consumer with zero new branches —
 * a third platform's SCAFFOLDING/detection is a data row, not a code change.
 * (Execution is out of scope: `ana run` dispatch is still a claude/codex fork,
 * so cursor stays `known:false` — see the registry header.)
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import {
  PLATFORM_REGISTRY,
  DEFAULT_PLATFORM_ID,
  getPlatformDescriptor,
  resolvePlatformDescriptor,
  knownPlatformIds,
  platformDetectProbes,
  agentsDirSegmentsFor,
} from '../../src/platforms/registry.js';
import { getAgentsDir } from '../../src/commands/platform.js';
import { AGENT_FILES, CODEX_AGENT_FILES } from '../../src/constants.js';

/** The six agent files the stock platforms scaffolded before the registry. */
const LEGACY_STOCK_AGENT_FILES = [
  'ana.md',
  'ana-plan.md',
  'ana-setup.md',
  'ana-build.md',
  'ana-verify.md',
  'ana-learn.md',
];

describe('platform registry — descriptor table', () => {
  it('registers claude, codex, and the registry-only cursor descriptor', () => {
    const ids = PLATFORM_REGISTRY.map((d) => d.id);
    expect(ids).toEqual(['claude', 'codex', 'cursor']);
  });

  it('default platform id is claude', () => {
    expect(DEFAULT_PLATFORM_ID).toBe('claude');
    expect(getPlatformDescriptor(DEFAULT_PLATFORM_ID)).not.toBeNull();
  });

  it('getPlatformDescriptor returns the descriptor by id, null when absent', () => {
    expect(getPlatformDescriptor('claude')?.id).toBe('claude');
    expect(getPlatformDescriptor('codex')?.id).toBe('codex');
    expect(getPlatformDescriptor('cursor')?.id).toBe('cursor');
    expect(getPlatformDescriptor('nope')).toBeNull();
  });
});

describe('platform registry — identity with pre-registry literals', () => {
  it('claude descriptor matches the legacy claude shape byte-for-byte', () => {
    const claude = getPlatformDescriptor('claude');
    expect(claude).not.toBeNull();
    expect(claude?.agentsDirSegments).toEqual(['.claude', 'agents']);
    expect([...(claude?.agentFiles ?? [])]).toEqual(LEGACY_STOCK_AGENT_FILES);
    expect(claude?.detectExecutable).toBe('claude');
    expect(claude?.known).toBe(true);
    // Claude carries no runtime defaults (no model / sandbox fallback today).
    expect(claude?.runDefaults).toEqual({});
  });

  it('codex descriptor matches the legacy codex shape byte-for-byte', () => {
    const codex = getPlatformDescriptor('codex');
    expect(codex).not.toBeNull();
    expect(codex?.agentsDirSegments).toEqual(['.codex', 'agents']);
    expect([...(codex?.agentFiles ?? [])]).toEqual(LEGACY_STOCK_AGENT_FILES);
    expect(codex?.detectExecutable).toBe('codex');
    expect(codex?.known).toBe(true);
    // The exact inline fallbacks from run.ts dispatchToCodex (pre-registry).
    expect(codex?.runDefaults.model).toBe('gpt-5.5');
    expect(codex?.runDefaults.sandboxMode).toBe('danger-full-access');
  });

  it('AGENT_FILES / CODEX_AGENT_FILES derive from the descriptors, unchanged', () => {
    // The constants are now sourced from the registry — assert they still equal
    // the literal roster they replaced (the no-regression byte-equality).
    expect([...AGENT_FILES]).toEqual(LEGACY_STOCK_AGENT_FILES);
    expect([...CODEX_AGENT_FILES]).toEqual(LEGACY_STOCK_AGENT_FILES);
    expect(AGENT_FILES).toHaveLength(6);
    expect(CODEX_AGENT_FILES).toHaveLength(6);
  });

  it('KNOWN_PLATFORMS derives to exactly {claude, codex}', () => {
    // Pre-registry this was `new Set(['claude', 'codex'])`. cursor is
    // known:false so it must NOT leak into the run-dispatch allowlist.
    const known = knownPlatformIds();
    expect([...known].sort()).toEqual(['claude', 'codex']);
    expect(known.has('cursor')).toBe(false);
  });

  it('detect probes preserve the legacy claude-before-codex order', () => {
    // Pre-registry detectPlatforms iterated the literal ['claude', 'codex'].
    // cursor has no detectExecutable, so it is absent from the probe list.
    const probes = platformDetectProbes();
    expect(probes).toEqual([
      { id: 'claude', executable: 'claude' },
      { id: 'codex', executable: 'codex' },
    ]);
  });
});

describe('platform registry — resolvePlatformDescriptor fail-soft', () => {
  it('resolves a known id to its own descriptor', () => {
    expect(resolvePlatformDescriptor('codex').id).toBe('codex');
    expect(resolvePlatformDescriptor('cursor').id).toBe('cursor');
  });

  it('falls back to claude for undefined / unknown platform (matches legacy default)', () => {
    expect(resolvePlatformDescriptor(undefined).id).toBe('claude');
    expect(resolvePlatformDescriptor('totally-unknown').id).toBe('claude');
  });
});

describe('platform registry — third platform scaffolding is a data row', () => {
  it('getAgentsDir resolves cursor through the unchanged consumer (no new branch)', () => {
    // The headline proof: getAgentsDir was a claude/codex ternary. Routed
    // through the registry, it resolves cursor's dir with ZERO consumer edits —
    // cursor exists purely as a data row in PLATFORM_REGISTRY.
    const cursorDir = getAgentsDir('/projects/my-app', 'cursor');
    expect(cursorDir).toBe(path.join('/projects/my-app', '.cursor', 'agents'));
  });

  it('getAgentsDir stays byte-identical for the stock platforms', () => {
    expect(getAgentsDir('/p')).toBe(path.join('/p', '.claude', 'agents'));
    expect(getAgentsDir('/p', 'claude')).toBe(path.join('/p', '.claude', 'agents'));
    expect(getAgentsDir('/p', 'codex')).toBe(path.join('/p', '.codex', 'agents'));
  });

  it('getAgentsDir falls back to claude for an unknown platform', () => {
    // Pre-registry the ternary treated anything-not-codex as claude. Preserved.
    expect(getAgentsDir('/p', 'martian')).toBe(path.join('/p', '.claude', 'agents'));
  });

  it('agentsDirSegmentsFor mirrors getAgentsDir resolution', () => {
    expect(agentsDirSegmentsFor('cursor')).toEqual(['.cursor', 'agents']);
    expect(agentsDirSegmentsFor(undefined)).toEqual(['.claude', 'agents']);
    expect(agentsDirSegmentsFor('unknown')).toEqual(['.claude', 'agents']);
  });
});
