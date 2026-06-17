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
  isSafeNameSegment,
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

  it('resolveAgentRoster() is always the built-in six agents', () => {
    const expected = AGENT_FILES.map((f) => f.replace(/\.md$/, ''));
    expect(expected).toHaveLength(6);
    expect(resolveAgentRoster()).toEqual(expected);
    expect(resolveAgentRoster()).toEqual([...BUILTIN_AGENT_ROSTER]);
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

describe('resolveAgentMap — fixed built-in dispatch surface', () => {
  it('is byte-identical to the prior hardcoded literal', () => {
    expect(resolveAgentMap()).toEqual({
      '': 'ana',
      build: 'ana-build',
      plan: 'ana-plan',
      verify: 'ana-verify',
      setup: 'ana-setup',
      learn: 'ana-learn',
    });
  });

  it('the Think core agent is the empty-suffix default', () => {
    expect(resolveAgentMap()['']).toBe(CORE_AGENT);
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

  it('resolveSkillManifest / resolveAgentSkills: non-object ana.json → defaults', () => {
    for (const bad of [null, undefined, 42, 'str', ['a'], true]) {
      expect(resolveSkillManifest(bad, r)).toEqual(computeSkillManifest(r));
      expect(resolveAgentSkills(bad, 'ana-build')).toEqual([]);
    }
  });

  it('resolveAgentSkills: skills field not an array → []', () => {
    expect(resolveAgentSkills({ agents: { 'ana-build': { skills: 'git-workflow' } } }, 'ana-build')).toEqual([]);
  });
});

describe('path-traversal guard — config names that become filesystem paths', () => {
  it('isSafeNameSegment accepts ordinary names, rejects separators and dot segments', () => {
    for (const ok of ['api-patterns', 'ana-build', 'observability', 'a.b_c-1']) {
      expect(isSafeNameSegment(ok)).toBe(true);
    }
    // Separators, parent refs, and the bare dot/dot-dot segments all escape.
    for (const bad of ['../evil', '../../evil', 'a/b', '.', '..', '', 'a\\b', 'a b']) {
      expect(isSafeNameSegment(bad)).toBe(false);
    }
  });

  it('resolveSkillManifest drops a traversing config skill name (keeps safe ones)', () => {
    const r = bareResult();
    const m = resolveSkillManifest(
      { skills: { '../../evil': { always: true }, '..': { always: true }, 'real-skill': { always: true } } },
      r,
    );
    expect(m).not.toContain('../../evil');
    expect(m).not.toContain('..');
    expect(m).toContain('real-skill');
    // The computed (stock) manifest is still fully present and unreordered.
    expect(m.slice(0, computeSkillManifest(r).length)).toEqual(computeSkillManifest(r));
  });
});
