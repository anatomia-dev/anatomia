/**
 * Golden / snapshot tests for the full `ana scan` human card.
 *
 * Renders `formatHumanReadable` directly (no temp dirs, no subprocess) across
 * five fixtures — full deep-tier, surface-tier, monorepo overflow, no-stack
 * fallback, and a confidence-gate fixture — and snapshots the whole card so PR
 * review of alignment, the section rules, and the "How your team writes" gate is
 * mechanical (AC10).
 *
 * Color is stripped (chalk.level = 0) so snapshots are plain text regardless of
 * the runner's TTY. The scan card carries no timestamp, so — unlike the proof
 * card — these snapshots have no timezone dependence.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import { formatHumanReadable } from '../../src/commands/scan.js';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';
import type { EngineResult, Surface } from '../../src/engine/types/engineResult.js';

beforeAll(() => {
  chalk.level = 0;
});

const RENDER = { isFunnel: false, rootPath: '/tmp/scan-golden' };

/** A confident, clearable naming sub-category result. */
function naming(majority: string, confidence: number, mixed: boolean) {
  return { majority, confidence, mixed, distribution: {}, sampleSize: 100 } as never;
}

/** A surface descriptor with sensible defaults. */
function surface(over: Partial<Surface>): Surface {
  return {
    name: 'pkg',
    path: `packages/${over.name ?? 'pkg'}`,
    packageName: over.name ?? 'pkg',
    language: 'TypeScript',
    framework: null,
    testing: [],
    sourceFiles: 10,
    ...over,
  };
}

/** Fixture 1: full deep-tier — populated conventions + patterns. */
function fullDeepTier(): EngineResult {
  const r = createEmptyEngineResult();
  r.applicationShape = 'cli';
  r.overview.project = 'anatomia-workspace';
  r.stack.language = 'TypeScript';
  r.stack.testing = ['Vitest'];
  r.stack.workspace = 'pnpm';
  r.monorepo = {
    isMonorepo: true,
    tool: 'pnpm',
    packages: [{ name: 'cli', path: 'packages/cli' }, { name: 'web', path: 'packages/web' }] as never,
    primaryPackage: { name: 'cli', path: 'packages/cli' } as never,
  };
  r.conventions = {
    naming: {
      files: naming('PascalCase', 0.6, true),
      functions: naming('camelCase', 0.95, false),
      variables: naming('camelCase', 0.9, false),
      classes: naming('PascalCase', 0.55, false),
      constants: naming('SCREAMING_SNAKE_CASE', 0.98, false),
    },
    indentation: { style: 'spaces', width: 2, confidence: 1 },
    sampledFiles: 50,
    detectionTime: 10,
  };
  r.patterns = {
    errorHandling: { library: 'exceptions', confidence: 0.9, evidence: [] },
    validation: { library: 'zod', confidence: 0.95, evidence: [] },
    sampledFiles: 20,
    detectionTime: 10,
    threshold: 0.7,
  };
  r.git.recentActivity = {
    activeContributors: 3,
    weeklyCommits: [2, 5, 4, 6],
    highChurnFiles: [],
  } as never;
  return r;
}

/** Fixture 2: surface-tier — conventions and patterns both null. */
function surfaceTier(): EngineResult {
  const r = createEmptyEngineResult();
  r.applicationShape = 'cli';
  r.overview.project = 'anatomia-workspace';
  r.stack.language = 'TypeScript';
  r.stack.testing = ['Vitest'];
  // conventions and patterns stay null (the createEmpty default).
  return r;
}

/** Fixture 3: monorepo with more surfaces than MAX_SURFACES (4). */
function monorepoOverflow(): EngineResult {
  const r = createEmptyEngineResult();
  r.overview.project = 'big-monorepo';
  r.stack.language = 'TypeScript';
  r.monorepo = {
    isMonorepo: true,
    tool: 'pnpm',
    packages: [] as never,
    primaryPackage: null,
  };
  r.surfaces = ['svc1', 'svc2', 'svc3', 'svc4', 'svc5', 'svc6'].map(name =>
    surface({ name, framework: 'NestJS', testing: ['Vitest'] }),
  );
  return r;
}

/** Fixture 4: no-stack ancestor-walk fallback. */
function noStackFallback(): EngineResult {
  const r = createEmptyEngineResult();
  r.overview.project = 'subdir';
  // stack stays empty → triggers the ancestor walk.
  return r;
}

/** Fixture 5: confidence gate — mixed/low-confidence signals must be omitted. */
function gateFixture(): EngineResult {
  const r = createEmptyEngineResult();
  r.applicationShape = 'cli';
  r.overview.project = 'gated';
  r.stack.language = 'TypeScript';
  r.conventions = {
    naming: {
      files: naming('PascalCase', 0.6, true), // mixed — omit
      functions: naming('camelCase', 0.9, false), // confident — show
      classes: naming('PascalCase', 0.55, false), // low confidence — omit
      constants: naming('SCREAMING_SNAKE_CASE', 0.98, false), // confident — show
    },
    imports: { style: 'mixed', confidence: 0.69, distribution: { absolute: 0.5, relative: 0.5 }, aliasPattern: null },
    indentation: { style: 'spaces', width: 2, confidence: 1 },
    codePatterns: { nullStyle: { nullCount: 5, optionalCount: 5, preference: 'mixed' } },
    sampledFiles: 50,
    detectionTime: 10,
  };
  r.patterns = {
    validation: { library: 'zod', confidence: 0.95, evidence: [] },
    sampledFiles: 20,
    detectionTime: 10,
    threshold: 0.7,
  };
  return r;
}

describe('scan card golden snapshots', () => {
  // @ana A001, A002, A003, A006, A007, A008, A009, A010, A016, A019
  it('renders the full deep-tier card', () => {
    const card = formatHumanReadable(fullDeepTier(), RENDER);
    expect(card).toMatchSnapshot();
    expect(card).toContain('╭'); // A001 rounded header
    expect(card).not.toContain('┌'); // A002 the old square box is gone
    expect(card).toContain('── Stack'); // A003 inset section rule
    expect(card).toContain('── How your team writes');
    expect(card).toContain('camelCase functions');
    expect(card).toContain('SCREAMING_SNAKE_CASE constants');
    expect(card).toContain('spaces, 2-wide');
    expect(card).toContain('exceptions');
    expect(card).toContain('Zod');
    expect(card).toContain('.ana/scan.json'); // A016 non-funnel scan.json pointer
    // The low-confidence class naming (0.55) is omitted even though it isn't "mixed".
    expect(card).not.toContain('PascalCase classes');
  });

  // @ana A012
  it('renders the surface-tier card with the section absent (no empty header)', () => {
    const card = formatHumanReadable(surfaceTier(), RENDER);
    expect(card).toMatchSnapshot();
    expect(card).not.toContain('How your team writes');
  });

  // @ana A017
  it('renders the monorepo overflow card with a +N more indicator', () => {
    const card = formatHumanReadable(monorepoOverflow(), RENDER);
    expect(card).toMatchSnapshot();
    expect(card).toContain('(+2 more)');
  });

  // @ana A015, A018
  it('renders the no-stack ancestor-walk fallback', () => {
    const result = noStackFallback();
    // Point rootPath at this test file's directory so the ancestor walk finds a
    // real package.json (packages/cli) — proving the fallback's project-root
    // guidance survives the restyle. The machine-specific "(found at …)" path is
    // normalized before snapshotting so the golden file stays deterministic.
    const card = formatHumanReadable(result, { isFunnel: true, rootPath: __dirname });
    expect(card).toContain('project root'); // A018
    expect(card).toContain('ana init'); // A015 funnel CTA preserved
    const normalized = card.replace(/\(found at .*\)/, '(found at <ROOT>)');
    expect(normalized).toMatchSnapshot();
  });

  // @ana A011, A019
  it('renders the gate fixture with mixed and low-confidence signals omitted', () => {
    const card = formatHumanReadable(gateFixture(), RENDER);
    expect(card).toMatchSnapshot();
    // The section still renders for the confident signals…
    expect(card).toContain('── How your team writes');
    expect(card).toContain('camelCase functions');
    expect(card).toContain('SCREAMING_SNAKE_CASE constants');
    expect(card).toContain('Zod');
    // …but never the word "mixed", and never the omitted file/class naming rows.
    expect(card).not.toContain('mixed');
    expect(card).not.toContain('PascalCase'); // both file (mixed) and class (low conf) omitted
  });

  // @ana A013
  it('emits no ANSI escape codes when color is stripped', () => {
    for (const fixture of [fullDeepTier(), surfaceTier(), monorepoOverflow(), gateFixture()]) {
      const card = formatHumanReadable(fixture, RENDER);
      expect(/\x1b\[/.test(card)).toBe(false);
    }
  });
});

/** Compute the rendered name + summary line widths, color stripped. */
function boxLines(card: string): string[] {
  return card.split('\n').filter(l => l.includes('│'));
}

describe('scan card box width', () => {
  // @ana A004, A005
  it('keeps the header lines at exactly 71 columns', () => {
    const card = formatHumanReadable(fullDeepTier(), RENDER);
    const lines = boxLines(card);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(line.length).toBe(71);
    }
  });

  // @ana A004
  it('truncates a very long project name without shearing the border', () => {
    const r = surfaceTier();
    r.overview.project = 'a'.repeat(120);
    const card = formatHumanReadable(r, RENDER);
    for (const line of boxLines(card)) {
      expect(line.length).toBe(71);
    }
  });
});
