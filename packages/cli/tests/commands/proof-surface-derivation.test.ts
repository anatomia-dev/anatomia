/**
 * Tests for proof chain surface derivation logic.
 *
 * The derivation in writeProofChain reads ana.json surfaces and matches
 * modules_touched file paths against surface paths using directory-boundary
 * prefix matching. This file tests that logic in isolation.
 */

import { describe, it, expect } from 'vitest';

/**
 * Derive surface from modules_touched paths against surfaces config.
 * Mirrors the logic in work.ts writeProofChain.
 *
 * @param modulesTouched - File paths relative to project root
 * @param surfaces - Surface config from ana.json
 * @returns Surface name if exactly one match, undefined otherwise
 */
function deriveSurface(
  modulesTouched: string[],
  surfaces: Record<string, { path: string }>,
): string | undefined {
  if (modulesTouched.length === 0 || Object.keys(surfaces).length === 0) {
    return undefined;
  }

  const matchingSurfaces = new Set<string>();
  for (const filePath of modulesTouched) {
    for (const [surfaceName, surface] of Object.entries(surfaces)) {
      const surfacePrefix = surface.path.endsWith('/') ? surface.path : surface.path + '/';
      if (filePath.startsWith(surfacePrefix) || filePath === surface.path) {
        matchingSurfaces.add(surfaceName);
      }
    }
  }

  if (matchingSurfaces.size === 1) {
    return [...matchingSurfaces][0];
  }
  return undefined;
}

describe('proof chain surface derivation', () => {
  const surfaces = {
    cli: { path: 'packages/cli' },
    web: { path: 'apps/web' },
    'cli-utils': { path: 'packages/cli-utils' },
  };

  // @ana A020
  it('derives surface from modules_touched single match', () => {
    const modulesTouched = [
      'packages/cli/src/commands/init/state.ts',
      'packages/cli/src/commands/config.ts',
      'packages/cli/tests/commands/config.test.ts',
    ];
    const surface = deriveSurface(modulesTouched, surfaces);
    expect(surface).toBe('cli');
  });

  // @ana A021
  it('derives null surface from modules_touched multi match', () => {
    const modulesTouched = [
      'packages/cli/src/commands/init/state.ts',
      'apps/web/src/pages/index.tsx',
    ];
    const surface = deriveSurface(modulesTouched, surfaces);
    expect(surface).toBeUndefined();
  });

  // @ana A031
  it('derives surface with correct path boundary matching', () => {
    // 'packages/cli-utils/foo.ts' should NOT match surface 'cli' (path: 'packages/cli')
    // because 'packages/cli-utils/' does not start with 'packages/cli/'
    const modulesTouched = [
      'packages/cli-utils/src/helpers.ts',
      'packages/cli/src/commands/init.ts',
    ];
    // Both cli and cli-utils match → multiple → null
    const surface = deriveSurface(modulesTouched, surfaces);
    expect(surface).toBeUndefined();

    // Only cli-utils files → single match
    const onlyCliUtils = ['packages/cli-utils/src/helpers.ts'];
    expect(deriveSurface(onlyCliUtils, surfaces)).toBe('cli-utils');

    // Only cli files → single match, not confused by cli-utils path
    const onlyCli = ['packages/cli/src/commands/init.ts'];
    expect(deriveSurface(onlyCli, surfaces)).toBe('cli');
  });

  it('returns undefined when no files match any surface', () => {
    const modulesTouched = ['README.md', 'package.json'];
    const surface = deriveSurface(modulesTouched, surfaces);
    expect(surface).toBeUndefined();
  });

  it('returns undefined when modules_touched is empty', () => {
    const surface = deriveSurface([], surfaces);
    expect(surface).toBeUndefined();
  });

  it('returns undefined when no surfaces configured', () => {
    const surface = deriveSurface(['packages/cli/foo.ts'], {});
    expect(surface).toBeUndefined();
  });
});
