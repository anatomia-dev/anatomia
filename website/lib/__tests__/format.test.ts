import { describe, it, expect } from 'vitest';
import { splitHeadline } from '@/lib/format';

// @ana A022
describe('splitHeadline parses emphasis', () => {
  it('produces segments with em flags for emphasized words', () => {
    const segments = splitHeadline('Your AI does not know your codebase. *Ana* does.');

    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ t: 'Your AI does not know your codebase. ' });
    expect(segments[1]).toEqual({ t: 'Ana', em: true });
    expect(segments[2]).toEqual({ t: ' does.' });
  });
});

// @ana A023
describe('splitHeadline with no emphasis', () => {
  it('produces a single plain segment', () => {
    const segments = splitHeadline('No emphasis here.');

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ t: 'No emphasis here.' });
  });
});

// @ana A024
describe('splitHeadline emphasis at start', () => {
  it('first segment has em true', () => {
    const segments = splitHeadline('*Bold* start.');

    expect(segments[0]).toEqual({ t: 'Bold', em: true });
    expect(segments[1]).toEqual({ t: ' start.' });
  });
});

describe('splitHeadline emphasis at end', () => {
  it('last segment has em true', () => {
    const segments = splitHeadline('End with *emphasis*');

    expect(segments[segments.length - 1]).toEqual({ t: 'emphasis', em: true });
  });
});
