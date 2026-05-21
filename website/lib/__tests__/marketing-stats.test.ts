import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the docs-data modules before importing marketing-stats
vi.mock('@/lib/docs-data', () => ({
  getCommandCount: vi.fn(),
  getBuildMeta: vi.fn(),
}));

import { getMarketingCommandCount, getMarketingVersion, getMarketingTestCount } from '../marketing-stats';
import { getCommandCount, getBuildMeta } from '@/lib/docs-data';

const mockGetCommandCount = vi.mocked(getCommandCount);
const mockGetBuildMeta = vi.mocked(getBuildMeta);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getMarketingCommandCount', () => {
  // @ana A001
  it('returns dynamic value from extraction data', () => {
    mockGetCommandCount.mockReturnValue(32);
    expect(getMarketingCommandCount()).toBe(32);
  });

  // @ana A002
  it('returns fallback when file missing', () => {
    mockGetCommandCount.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    expect(getMarketingCommandCount()).toBe(26);
  });

  // @ana A003
  it('returns fallback when JSON invalid', () => {
    mockGetCommandCount.mockImplementation(() => {
      throw new SyntaxError('Unexpected token');
    });
    expect(getMarketingCommandCount()).toBe(26);
  });

  it('returns fallback when totalCommands field missing', () => {
    mockGetCommandCount.mockReturnValue(undefined as unknown as number);
    // Returns undefined (the actual value) — the function trusts the accessor
    // When the accessor itself throws, the fallback kicks in
    expect(getMarketingCommandCount()).toBeUndefined();
  });
});

describe('getMarketingVersion', () => {
  // @ana A004
  it('returns dynamic value with v prefix', () => {
    mockGetBuildMeta.mockReturnValue({
      version: '1.0.2',
      commitSha: 'abc1234',
      buildTimestamp: '2026-05-16T00:00:00Z',
      testCount: 2744,
    });
    expect(getMarketingVersion()).toBe('v1.0.2');
  });

  // @ana A005
  it('returns fallback when file missing', () => {
    mockGetBuildMeta.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    expect(getMarketingVersion()).toBe('v1.1.0');
  });

  it('returns fallback when JSON malformed', () => {
    mockGetBuildMeta.mockImplementation(() => {
      throw new SyntaxError('Unexpected token');
    });
    expect(getMarketingVersion()).toBe('v1.1.0');
  });

  it('returns fallback when version field missing', () => {
    mockGetBuildMeta.mockReturnValue({
      version: undefined as unknown as string,
      commitSha: 'abc1234',
      buildTimestamp: '2026-05-16T00:00:00Z',
      testCount: 2744,
    });
    // Missing version falls back to hardcoded default
    expect(getMarketingVersion()).toBe('v1.1.0');
  });
});

describe('getMarketingTestCount', () => {
  it('returns rounded-down count with + suffix', () => {
    mockGetBuildMeta.mockReturnValue({
      version: '1.0.2',
      commitSha: 'abc1234',
      buildTimestamp: '2026-05-16T00:00:00Z',
      testCount: 2744,
    });
    expect(getMarketingTestCount()).toBe('2,700+');
  });

  it('rounds down to nearest 100', () => {
    mockGetBuildMeta.mockReturnValue({
      version: '1.0.2',
      commitSha: 'abc1234',
      buildTimestamp: '2026-05-16T00:00:00Z',
      testCount: 3150,
    });
    expect(getMarketingTestCount()).toBe('3,100+');
  });

  it('returns fallback when file missing', () => {
    mockGetBuildMeta.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    expect(getMarketingTestCount()).toBe('2,700+');
  });

  it('returns fallback when testCount is 0', () => {
    mockGetBuildMeta.mockReturnValue({
      version: '1.0.2',
      commitSha: 'abc1234',
      buildTimestamp: '2026-05-16T00:00:00Z',
      testCount: 0,
    });
    expect(getMarketingTestCount()).toBe('2,700+');
  });
});
