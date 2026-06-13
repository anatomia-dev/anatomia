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
        agents: { 'ana-build': { skills: ['git-workflow'], model: 'opus', enabled: true } },
        skills: { observability: { always: true } },
        capabilities: {
          commands: { ship: 'string body', audit: { run: 'npm run audit', description: 'Audit' } },
          outputStyle: 'concise',
          mcpServers: { weather: { command: 'weather-mcp' } },
        },
        platformDefaults: { codex: { model: 'gpt-5.5' } },
      }),
    ).toEqual([]);
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

  it('capabilities.outputStyle:42 → outputStyle-must-be-a-string warning', () => {
    const warnings = collectConfigWarnings({ capabilities: { outputStyle: 42 } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('capabilities.outputStyle must be a string');
    expect(warnings[0]).toContain('Got: 42');
  });

  it('capabilities.commands:"oops" → commands-must-be-an-object warning', () => {
    const warnings = collectConfigWarnings({ capabilities: { commands: 'oops' } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('capabilities.commands must be an object');
    expect(warnings[0]).toContain('Got: "oops"');
  });

  it('a single bad command entry is named (not the whole map)', () => {
    const warnings = collectConfigWarnings({
      capabilities: { commands: { ship: 'fine', broken: 42 } },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('capabilities.commands.broken');
    expect(warnings[0]).toContain('Got: 42');
  });

  it('a command object with no usable field is named, hinting unknown keys', () => {
    const warnings = collectConfigWarnings({
      capabilities: { commands: { broken: { typo: 'oops' } } },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('capabilities.commands.broken');
    expect(warnings[0]).toContain('Unrecognized field');
    expect(warnings[0]).toContain('typo');
  });

  it('platformDefaults:5 → must-be-an-object warning', () => {
    const warnings = collectConfigWarnings({ platformDefaults: 5 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('platformDefaults must be an object');
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
      capabilities: { outputStyle: 42, commands: 'oops' },
    });
    expect(warnings).toHaveLength(3);
    expect(warnings.some((w) => w.includes('agents.ana-build.skills'))).toBe(true);
    expect(warnings.some((w) => w.includes('capabilities.outputStyle'))).toBe(true);
    expect(warnings.some((w) => w.includes('capabilities.commands must be an object'))).toBe(true);
  });

  it('never throws on hostile input', () => {
    expect(() => collectConfigWarnings(null)).not.toThrow();
    expect(() => collectConfigWarnings([1, 2, 3])).not.toThrow();
    expect(() => collectConfigWarnings('string')).not.toThrow();
    expect(() => collectConfigWarnings(42)).not.toThrow();
  });
});
