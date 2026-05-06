/**
 * Unit tests for getPatternLibrary + isMultiPattern.
 *
 * These helpers collapse the PatternConfidence | MultiPattern union at
 * consumer sites. The helper exists so there's ONE place to look for pattern
 * union handling instead of scattered `isMultiPattern ? primary.library : library`
 * ternaries. Covers all 4 enumerated cases from the plan plus empty-variant.
 */

import { describe, it, expect } from 'vitest';
import {
  getPatternLibrary,
  isMultiPattern,
} from '../../../src/engine/types/patterns.js';
import type {
  PatternConfidence,
  MultiPattern,
} from '../../../src/engine/types/patterns.js';

describe('getPatternLibrary', () => {
  it('returns .library for a single PatternConfidence', () => {
    const pattern: PatternConfidence = {
      library: 'zod',
      variant: 'schemas',
      confidence: 0.95,
      evidence: ['zod in dependencies'],
    };
    expect(getPatternLibrary(pattern)).toBe('zod');
  });

  it('returns .primary.library for a MultiPattern', () => {
    const pattern: MultiPattern = {
      patterns: [
        { library: 'sqlalchemy', variant: 'async', confidence: 0.95, evidence: [], primary: true },
        { library: 'sqlalchemy', variant: 'sync', confidence: 0.85, evidence: [], primary: false },
      ],
      primary: { library: 'sqlalchemy', variant: 'async', confidence: 0.95, evidence: [], primary: true },
      confidence: 0.95,
    };
    expect(getPatternLibrary(pattern)).toBe('sqlalchemy');
  });

  it('returns null for undefined input', () => {
    expect(getPatternLibrary(undefined)).toBeNull();
  });

  it('still returns .library when variant is empty string', () => {
    // Previously mapToPatternDetail coalesced variant to '' which
    // masked the single-vs-multi distinction. The helper should not be fooled
    // by an empty variant — a PatternConfidence without `patterns` is still
    // treated as single, returning .library directly.
    const pattern: PatternConfidence = {
      library: 'pytest',
      variant: '',
      confidence: 0.9,
      evidence: ['pytest in dependencies'],
    };
    expect(getPatternLibrary(pattern)).toBe('pytest');
  });
});

describe('isMultiPattern', () => {
  it('is true for MultiPattern shape (has .patterns array)', () => {
    const pattern: MultiPattern = {
      patterns: [],
      primary: { library: 'x', confidence: 0.9, evidence: [] },
      confidence: 0.9,
    };
    expect(isMultiPattern(pattern)).toBe(true);
  });

  it('is false for single PatternConfidence (no .patterns field)', () => {
    const pattern: PatternConfidence = {
      library: 'zod',
      confidence: 0.95,
      evidence: [],
    };
    expect(isMultiPattern(pattern)).toBe(false);
  });

  it('is false for undefined', () => {
    expect(isMultiPattern(undefined)).toBe(false);
  });
});
