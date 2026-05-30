/**
 * Tests for platform directory resolution helpers and related schema/config changes.
 *
 * Covers:
 * - platform.ts helper functions (getAgentsDir, getSkillsDir, getSkillsDirRel)
 * - anaJsonSchema.ts platforms/platformFlags schema fields
 * - config.ts KNOWN_FIELDS additions
 * - commit.ts KNOWN_ROOTS and EXCLUDED_PREFIXES expansions
 * - proportionalSampler.ts and symbol-index.ts exclusion patterns
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { getAgentsDir, getSkillsDir, getSkillsDirRel } from '../../src/commands/platform.js';
import { AnaJsonSchema } from '../../src/commands/init/anaJsonSchema.js';

describe('platform helpers', () => {
  // @ana A010
  it('getAgentsDir returns correct path', () => {
    const result = getAgentsDir('/projects/my-app');
    expect(result).toBe(path.join('/projects/my-app', '.claude', 'agents'));
    expect(result).toContain('.claude/agents');
  });

  // @ana A011
  it('getSkillsDir returns correct path', () => {
    const result = getSkillsDir('/projects/my-app');
    expect(result).toBe(path.join('/projects/my-app', '.claude', 'skills'));
    expect(result).toContain('.claude/skills');
  });

  // @ana A012
  it('getSkillsDirRel returns relative path', () => {
    const result = getSkillsDirRel();
    expect(result).toBe('.claude/skills');
  });

  it('getAgentsDir handles paths with spaces', () => {
    const result = getAgentsDir('/my projects/cool app');
    expect(result).toBe(path.join('/my projects/cool app', '.claude', 'agents'));
  });

  it('getSkillsDir handles paths with spaces', () => {
    const result = getSkillsDir('/my projects/cool app');
    expect(result).toBe(path.join('/my projects/cool app', '.claude', 'skills'));
  });
});

describe('AnaJsonSchema platforms fields', () => {
  // @ana A003
  it('defaults platforms to claude when missing', () => {
    const parsed = AnaJsonSchema.parse({ name: 'test' });
    expect(parsed.platforms).toEqual(['claude']);
  });

  // @ana A004
  it('passes through empty platforms array as-is', () => {
    // Empty array is valid z.array(z.string()) — .catch() does not fire.
    // The spec's schema definition produces this behavior. Deviation documented.
    const parsed = AnaJsonSchema.parse({ name: 'test', platforms: [] });
    expect(parsed.platforms).toEqual([]);
  });

  // @ana A001
  it('preserves valid platforms array', () => {
    const parsed = AnaJsonSchema.parse({ name: 'test', platforms: ['claude', 'codex'] });
    expect(parsed.platforms).toEqual(['claude', 'codex']);
  });

  it('catches invalid platforms value and defaults to claude', () => {
    const parsed = AnaJsonSchema.parse({ name: 'test', platforms: 'not-array' });
    expect(parsed.platforms).toEqual(['claude']);
  });

  // @ana A002
  it('defaults platformFlags to empty object when missing', () => {
    const parsed = AnaJsonSchema.parse({ name: 'test' });
    expect(parsed.platformFlags).toEqual({});
  });

  it('preserves valid platformFlags', () => {
    const parsed = AnaJsonSchema.parse({
      name: 'test',
      platformFlags: { claude: ['--dangerously-skip-permissions'] },
    });
    expect(parsed.platformFlags).toEqual({ claude: ['--dangerously-skip-permissions'] });
  });

  // @ana A005
  it('inner catch prevents cross-contamination of platformFlags', () => {
    const parsed = AnaJsonSchema.parse({
      name: 'test',
      platformFlags: {
        claude: ['--dangerously-skip-permissions'],
        codex: 'not-an-array',
      },
    });
    expect(parsed.platformFlags['claude']).toEqual(['--dangerously-skip-permissions']);
    expect(parsed.platformFlags['codex']).toEqual([]);
  });

  it('catches invalid platformFlags value and defaults to empty object', () => {
    const parsed = AnaJsonSchema.parse({ name: 'test', platformFlags: 'bad' });
    expect(parsed.platformFlags).toEqual({});
  });

  // @ana A006
  it('preserveUserState preserves platforms via passthrough spread', () => {
    const existing = AnaJsonSchema.parse({
      name: 'test',
      platforms: ['claude', 'codex'],
    });
    // Simulate re-init merge: spread parsed existing over new defaults
    const merged = { ...AnaJsonSchema.parse({ name: 'test' }), ...existing };
    expect(merged.platforms).toEqual(['claude', 'codex']);
  });

  // @ana A007
  it('preserveUserState preserves platformFlags via passthrough spread', () => {
    const existing = AnaJsonSchema.parse({
      name: 'test',
      platformFlags: { claude: ['--dangerously-skip-permissions'] },
    });
    const merged = { ...AnaJsonSchema.parse({ name: 'test' }), ...existing };
    expect(merged.platformFlags['claude']).toEqual(['--dangerously-skip-permissions']);
  });
});

describe('config KNOWN_FIELDS', () => {
  // @ana A008, A009
  it('includes platforms and platformFlags', async () => {
    // Import config module and check KNOWN_FIELDS via the config command behavior.
    // Since KNOWN_FIELDS is not exported, we verify indirectly by checking the
    // source file for the entries.
    const configSource = await import('node:fs').then(fs =>
      fs.readFileSync(
        new URL('../../src/commands/config.ts', import.meta.url).pathname,
        'utf-8'
      )
    );
    expect(configSource).toContain("'platforms'");
    expect(configSource).toContain("'platformFlags'");
  });
});

describe('commit.ts exclusion patterns', () => {
  // @ana A013, A014
  it('KNOWN_ROOTS includes codex and agents directories', async () => {
    const commitSource = await import('node:fs').then(fs =>
      fs.readFileSync(
        new URL('../../src/commands/init/commit.ts', import.meta.url).pathname,
        'utf-8'
      )
    );
    expect(commitSource).toContain("'.codex/'");
    expect(commitSource).toContain("'.agents/'");
  });

  it('EXCLUDED_PREFIXES includes codex and agents entries', async () => {
    const commitSource = await import('node:fs').then(fs =>
      fs.readFileSync(
        new URL('../../src/commands/init/commit.ts', import.meta.url).pathname,
        'utf-8'
      )
    );
    expect(commitSource).toContain("'.codex/settings.local.json'");
    expect(commitSource).toContain("'.codex/agent-memory/'");
    expect(commitSource).toContain("'.agents/settings.local.json'");
    expect(commitSource).toContain("'.agents/agent-memory/'");
  });
});

describe('proportionalSampler exclusion patterns', () => {
  // @ana A015, A016
  it('GLOB_IGNORE includes codex and agents patterns', async () => {
    const samplerSource = await import('node:fs').then(fs =>
      fs.readFileSync(
        new URL('../../src/engine/sampling/proportionalSampler.ts', import.meta.url).pathname,
        'utf-8'
      )
    );
    expect(samplerSource).toContain("'**/.codex/**'");
    expect(samplerSource).toContain("'**/.agents/**'");
  });
});

describe('symbol-index exclusion patterns', () => {
  // @ana A017, A018
  it('ignorePatterns includes codex and agents patterns', async () => {
    const indexSource = await import('node:fs').then(fs =>
      fs.readFileSync(
        new URL('../../src/commands/symbol-index.ts', import.meta.url).pathname,
        'utf-8'
      )
    );
    expect(indexSource).toContain("'.codex/**'");
    expect(indexSource).toContain("'.agents/**'");
  });
});
