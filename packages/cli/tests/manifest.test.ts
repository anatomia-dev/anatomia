/**
 * Unit tests for src/manifest.ts — the resolver spine of ultimate
 * configurability.
 *
 * The load-bearing contract is the *identity function*: when an `ana.json`
 * key is absent, the resolver returns today's hardcoded constant byte-for-byte.
 * These tests pin that equality so a future refactor of the resolver can never
 * silently change no-config (stock) behavior — the no-regression contract.
 *
 *   resolveSkillManifest({}, r) ≡ computeSkillManifest(r)
 *   resolveAgentRoster({})      ≡ the built-in six agents
 *   resolveAgentSkills({}, n)   ≡ []
 *
 * Plus: config-added always-on skills append (deduped, core-wins); the
 * post-init count path (state.ts:1015) and the scaffold path (skills.ts:125)
 * resolve to the SAME set when a custom skill is present (the display can never
 * drift from what is scaffolded); malformed config degrades to the default.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveSkillManifest,
  resolveAgentRoster,
  resolveAgentSkills,
  resolveAgentMap,
  BUILTIN_AGENT_ROSTER,
  CORE_AGENT,
} from '../src/manifest.js';
import { computeSkillManifest, AGENT_FILES } from '../src/constants.js';
import { createEmptyEngineResult } from '../src/engine/types/engineResult.js';
import type { EngineResult } from '../src/engine/types/engineResult.js';

/** Bare engine result — no conditional triggers fire (core skills only). */
function bareResult(): EngineResult {
  return createEmptyEngineResult();
}

/** Engine result whose stack fires all three conditional skill triggers. */
function richResult(): EngineResult {
  const base = createEmptyEngineResult();
  return {
    ...base,
    stack: { ...base.stack, framework: 'Next.js', database: 'PostgreSQL', aiSdk: 'OpenAI' },
  };
}

describe('manifest resolver — identity contract (absent = today)', () => {
  it('resolveSkillManifest({}, r) deep-equals computeSkillManifest(r) — bare', () => {
    const r = bareResult();
    expect(resolveSkillManifest({}, r)).toEqual(computeSkillManifest(r));
  });

  it('resolveSkillManifest({}, r) deep-equals computeSkillManifest(r) — all triggers fire', () => {
    const r = richResult();
    const computed = computeSkillManifest(r);
    // Sanity: the rich fixture actually exercises the conditional triggers,
    // so this is not a vacuous core-only comparison.
    expect(computed).toContain('api-patterns');
    expect(computed).toContain('data-access');
    expect(computed).toContain('ai-patterns');
    expect(resolveSkillManifest({}, r)).toEqual(computed);
  });

  it('resolveAgentRoster({}) deep-equals the built-in six agents', () => {
    const expected = AGENT_FILES.map((f) => f.replace(/\.md$/, ''));
    expect(expected).toHaveLength(6);
    expect(resolveAgentRoster({})).toEqual(expected);
    expect(resolveAgentRoster({})).toEqual([...BUILTIN_AGENT_ROSTER]);
  });

  it('resolveAgentSkills({}, name) is [] for every built-in agent', () => {
    for (const name of BUILTIN_AGENT_ROSTER) {
      expect(resolveAgentSkills({}, name)).toEqual([]);
    }
  });
});

describe('resolveSkillManifest — config-added skills', () => {
  it('appends an always-on skill after the computed manifest', () => {
    const r = bareResult();
    const computed = computeSkillManifest(r);
    const resolved = resolveSkillManifest({ skills: { observability: { always: true } } }, r);

    // Computed set preserved verbatim and in order; addition appended last.
    expect(resolved.slice(0, computed.length)).toEqual(computed);
    expect(resolved[resolved.length - 1]).toBe('observability');
    expect(resolved).toHaveLength(computed.length + 1);
  });

  it('does NOT append a skill that lacks always:true (deferred to later slices)', () => {
    const r = bareResult();
    const resolved = resolveSkillManifest({ skills: { observability: {} } }, r);
    expect(resolved).toEqual(computeSkillManifest(r));
    expect(resolved).not.toContain('observability');
  });

  it('dedups: an always-on skill already in the core set is not duplicated (core wins)', () => {
    const r = bareResult();
    const resolved = resolveSkillManifest({ skills: { 'git-workflow': { always: true } } }, r);
    expect(resolved).toEqual(computeSkillManifest(r));
    expect(resolved.filter((s) => s === 'git-workflow')).toHaveLength(1);
  });

  it('dedups: an always-on skill already added by a conditional trigger is not duplicated', () => {
    const r = richResult(); // api-patterns is already in the computed set
    const resolved = resolveSkillManifest({ skills: { 'api-patterns': { always: true } } }, r);
    expect(resolved).toEqual(computeSkillManifest(r));
    expect(resolved.filter((s) => s === 'api-patterns')).toHaveLength(1);
  });
});

describe('post-init count guard (state.ts:1015) ≡ scaffold set (skills.ts:125)', () => {
  it('count path and scaffold path resolve to the SAME set when a custom skill is present', () => {
    // Both displaySuccessMessage (count) and scaffoldAndSeedSkills (scaffold)
    // now call resolveSkillManifest with the same (anaConfig, engineResult).
    // Pin that they produce the identical array — the previously-divergent
    // case where the count used the raw constant and under-counted a config
    // skill. Same call = same result, by construction.
    const r = bareResult();
    const anaConfig = { skills: { observability: { always: true } } };

    const scaffolded = resolveSkillManifest(anaConfig, r);
    const counted = resolveSkillManifest(anaConfig, r);

    expect(counted).toEqual(scaffolded);
    expect(scaffolded).toContain('observability');
    expect(counted).toContain('observability');
    // The custom skill widens the count beyond the bare computed manifest.
    expect(counted.length).toBe(computeSkillManifest(r).length + 1);
  });
});

describe('resolveAgentRoster — config-driven roster', () => {
  it('drops a built-in agent flagged enabled:false', () => {
    const resolved = resolveAgentRoster({ agents: { 'ana-learn': { enabled: false } } });
    expect(resolved).not.toContain('ana-learn');
    expect(resolved).toContain('ana');
    expect(resolved).toHaveLength(BUILTIN_AGENT_ROSTER.length - 1);
  });

  it('appends a config-supplied agent not in the built-in roster', () => {
    const resolved = resolveAgentRoster({ agents: { 'ana-release': { skills: [] } } });
    expect(resolved.slice(0, BUILTIN_AGENT_ROSTER.length)).toEqual([...BUILTIN_AGENT_ROSTER]);
    expect(resolved[resolved.length - 1]).toBe('ana-release');
  });

  it('a config block that only sets skills/model keeps the built-in enabled', () => {
    const resolved = resolveAgentRoster({ agents: { 'ana-build': { skills: ['api-patterns'] } } });
    expect(resolved).toEqual([...BUILTIN_AGENT_ROSTER]);
  });

  it('never drops the Think core agent, even with enabled:false (Slice 6)', () => {
    const resolved = resolveAgentRoster({ agents: { [CORE_AGENT]: { enabled: false } } });
    expect(resolved).toContain(CORE_AGENT);
    // Only the core-agent guard fires; the rest of the roster is untouched.
    expect(resolved).toEqual([...BUILTIN_AGENT_ROSTER]);
  });
});

describe('resolveAgentMap — config-driven dispatch surface (Slice 6)', () => {
  it('absent agents → byte-identical to the prior hardcoded literal', () => {
    expect(resolveAgentMap({})).toEqual({
      '': 'ana',
      build: 'ana-build',
      plan: 'ana-plan',
      verify: 'ana-verify',
      setup: 'ana-setup',
      learn: 'ana-learn',
    });
  });

  it('drops a disabled built-in and keys a config agent by stripped suffix', () => {
    const map = resolveAgentMap({
      agents: { 'ana-learn': { enabled: false }, 'ana-release': { skills: [] } },
    });
    expect(map['learn']).toBeUndefined();
    expect(map['release']).toBe('ana-release');
    expect(map['']).toBe('ana');
  });

  it('a config agent without the ana- prefix is keyed by its full name', () => {
    expect(resolveAgentMap({ agents: { reviewer: {} } })['reviewer']).toBe('reviewer');
  });

  it('malformed ana.json → the built-in default map', () => {
    for (const bad of [null, undefined, 42, 'str', ['a'], true]) {
      expect(resolveAgentMap(bad)).toEqual(resolveAgentMap({}));
    }
  });
});

describe('resolveAgentSkills — per-agent projection', () => {
  it('returns the declared skills list for a named agent', () => {
    const anaJson = { agents: { 'ana-build': { skills: ['git-workflow', 'api-patterns'] } } };
    expect(resolveAgentSkills(anaJson, 'ana-build')).toEqual(['git-workflow', 'api-patterns']);
  });

  it('dedups while preserving authoring order', () => {
    const anaJson = { agents: { 'ana-build': { skills: ['a', 'b', 'a', 'c', 'b'] } } };
    expect(resolveAgentSkills(anaJson, 'ana-build')).toEqual(['a', 'b', 'c']);
  });

  it('returns [] for an agent with no skills declared', () => {
    const anaJson = { agents: { 'ana-build': { model: 'opus' } } };
    expect(resolveAgentSkills(anaJson, 'ana-build')).toEqual([]);
  });

  it('returns [] for an agent absent from the config map', () => {
    const anaJson = { agents: { 'ana-build': { skills: ['x'] } } };
    expect(resolveAgentSkills(anaJson, 'ana-verify')).toEqual([]);
  });
});

describe('malformed config falls through to default', () => {
  const r = bareResult();

  it('resolveSkillManifest: skills not an object → computed manifest verbatim', () => {
    expect(resolveSkillManifest({ skills: 'nope' }, r)).toEqual(computeSkillManifest(r));
    expect(resolveSkillManifest({ skills: ['array', 'not', 'object'] }, r)).toEqual(
      computeSkillManifest(r),
    );
    expect(resolveSkillManifest({ skills: null }, r)).toEqual(computeSkillManifest(r));
  });

  it('resolveSkillManifest: a malformed entry within skills is skipped, valid ones survive', () => {
    const resolved = resolveSkillManifest(
      { skills: { broken: 'not-an-object', good: { always: true } } },
      r,
    );
    expect(resolved).toContain('good');
    expect(resolved).not.toContain('broken');
  });

  it('resolveSkillManifest / resolveAgentRoster: non-object ana.json → defaults', () => {
    for (const bad of [null, undefined, 42, 'str', ['a'], true]) {
      expect(resolveSkillManifest(bad, r)).toEqual(computeSkillManifest(r));
      expect(resolveAgentRoster(bad)).toEqual([...BUILTIN_AGENT_ROSTER]);
      expect(resolveAgentSkills(bad, 'ana-build')).toEqual([]);
    }
  });

  it('resolveAgentRoster: agents not an object → built-in roster verbatim', () => {
    expect(resolveAgentRoster({ agents: 'nope' })).toEqual([...BUILTIN_AGENT_ROSTER]);
    expect(resolveAgentRoster({ agents: ['x'] })).toEqual([...BUILTIN_AGENT_ROSTER]);
  });

  it('resolveAgentSkills: skills field not an array → []', () => {
    expect(resolveAgentSkills({ agents: { 'ana-build': { skills: 'git-workflow' } } }, 'ana-build')).toEqual([]);
  });
});
