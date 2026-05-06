/**
 * Version detection tests
 *
 * Validates that version strings from package.json are stored on
 * EngineResult.versions for all detected stack dependencies.
 */

import { describe, it, expect } from 'vitest';
import { createEmptyEngineResult } from '../../src/engine/types/engineResult.js';

describe('version detection', () => {
  it('createEmptyEngineResult has empty versions object', () => {
    const result = createEmptyEngineResult();
    expect(result.versions).toEqual({});
  });

  it('versions field accepts range strings', () => {
    const result = createEmptyEngineResult();
    result.versions = { prisma: '^7.2.0', next: '~16.0.0' };
    expect(result.versions['prisma']).toBe('^7.2.0');
    expect(result.versions['next']).toBe('~16.0.0');
  });

  it('versions field accepts tag strings', () => {
    const result = createEmptyEngineResult();
    result.versions = { next: 'latest', prisma: 'canary' };
    expect(result.versions['next']).toBe('latest');
  });

  it('versions field accepts git URL strings', () => {
    const result = createEmptyEngineResult();
    result.versions = { 'my-lib': 'github:user/repo#branch' };
    expect(result.versions['my-lib']).toBe('github:user/repo#branch');
  });

  it('versions is top-level on EngineResult, not in stack', () => {
    const result = createEmptyEngineResult();
    expect(result).toHaveProperty('versions');
    // Verify it's NOT inside stack
    expect((result.stack as Record<string, unknown>)['versions']).toBeUndefined();
  });
});
