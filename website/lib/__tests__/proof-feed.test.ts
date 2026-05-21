import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatAge } from '@/lib/proof-feed';

const FIXED_NOW = new Date('2026-05-20T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// @ana A025
describe('formatAge seconds threshold', () => {
  it('formats 30 seconds ago as "30s ago"', () => {
    const ts = new Date(FIXED_NOW - 30_000).toISOString();
    expect(formatAge(ts)).toBe('30s ago');
  });
});

// @ana A026
describe('formatAge zero-second clamp', () => {
  it('formats exact now as "1s ago" not "0s ago"', () => {
    const ts = new Date(FIXED_NOW).toISOString();
    expect(formatAge(ts)).toBe('1s ago');
  });
});

// @ana A027
describe('formatAge future timestamp clamp', () => {
  it('clamps future timestamp to "1s ago"', () => {
    const ts = new Date(FIXED_NOW + 60_000).toISOString();
    expect(formatAge(ts)).toBe('1s ago');
  });
});

// @ana A028
describe('formatAge minutes threshold', () => {
  it('formats 90 seconds ago as "1m ago"', () => {
    const ts = new Date(FIXED_NOW - 90_000).toISOString();
    expect(formatAge(ts)).toBe('1m ago');
  });
});

// @ana A029
describe('formatAge hours threshold', () => {
  it('formats 2 hours ago as "2h ago"', () => {
    const ts = new Date(FIXED_NOW - 2 * 3600_000).toISOString();
    expect(formatAge(ts)).toBe('2h ago');
  });
});

// @ana A030
describe('formatAge days threshold', () => {
  it('formats 48 hours ago as "2d ago"', () => {
    const ts = new Date(FIXED_NOW - 48 * 3600_000).toISOString();
    expect(formatAge(ts)).toBe('2d ago');
  });
});
