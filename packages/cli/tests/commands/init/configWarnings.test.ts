/**
 * Fail-soft validation pass — the LOUD half of "malformed → warn, not nuke".
 *
 * The resolvers degrade malformed configurability keys to stock silently; this
 * module surfaces a clear, field-named warning for each ignored value. These
 * tests pin the exact field-naming the spec demands so a regression that goes
 * back to silent-swallow is caught.
 */

import { describe, it, expect } from 'vitest';
import { collectConfigWarnings } from '../../../src/commands/init/configWarnings.js';

describe('collectConfigWarnings', () => {
  it('absent config (and a valid config) produces ZERO warnings', () => {
    expect(collectConfigWarnings({})).toEqual([]);
    expect(collectConfigWarnings(undefined)).toEqual([]);
    expect(
      collectConfigWarnings({
        agents: { 'ana-build': { skills: ['git-workflow'], model: 'opus' } },
        skills: { observability: { always: true } },
      }),
    ).toEqual([]);
  });

  it('a traversing agent name → invalid-name warning, entry skipped', () => {
    const warnings = collectConfigWarnings({ agents: { '../evil': { skills: [] } } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBe(
      "agents has an invalid agent name '../evil' — ignoring (names may use [A-Za-z0-9._-], excluding '.' and '..').",
    );
  });

  it('a traversing skill name (bare ..) → invalid-name warning', () => {
    const warnings = collectConfigWarnings({ skills: { '..': { always: true } } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBe(
      "skills has an invalid skill name '..' — ignoring (names may use [A-Za-z0-9._-], excluding '.' and '..').",
    );
  });

  it('agents.<a>.skills:"notanarray" → array-of-strings warning naming the field + value', () => {
    const warnings = collectConfigWarnings({ agents: { 'ana-build': { skills: 'notanarray' } } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBe(
      'agents.ana-build.skills must be an array of strings — ignoring (using stock). Got: "notanarray"',
    );
  });

  it('agents:"totally-wrong" → top-level agents-must-be-object warning', () => {
    const warnings = collectConfigWarnings({ agents: 'totally-wrong' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('agents must be an object');
    expect(warnings[0]).toContain('Got: "totally-wrong"');
  });

  it('skills.<s>.always:"yes" → boolean warning naming the field', () => {
    const warnings = collectConfigWarnings({ skills: { observability: { always: 'yes' } } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('skills.observability.always must be a boolean');
    expect(warnings[0]).toContain('Got: "yes"');
  });

  it('collects MULTIPLE field-named warnings in one pass', () => {
    const warnings = collectConfigWarnings({
      agents: { 'ana-build': { skills: 'notanarray' } },
      skills: { observability: { always: 'yes' } },
    });
    expect(warnings).toHaveLength(2);
    expect(warnings.some((w) => w.includes('agents.ana-build.skills'))).toBe(true);
    expect(warnings.some((w) => w.includes('skills.observability.always'))).toBe(true);
  });

  it('never throws on hostile input', () => {
    expect(() => collectConfigWarnings(null)).not.toThrow();
    expect(() => collectConfigWarnings([1, 2, 3])).not.toThrow();
    expect(() => collectConfigWarnings('string')).not.toThrow();
    expect(() => collectConfigWarnings(42)).not.toThrow();
  });
});
