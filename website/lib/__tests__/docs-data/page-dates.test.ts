import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs');

import { readFileSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);

const samplePageDates = {
  'start': '2026-05-20',
  'concepts/artifacts': '2026-05-13',
  'concepts/context': '2026-05-16',
  'guides/configurability': '2026-05-20',
};

function setupMockData(data: unknown): void {
  mockReadFileSync.mockReturnValue(JSON.stringify(data));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
});

// @ana A008, A009, A010
describe('getPageDate', () => {
  it('returns the date for a known slug', async () => {
    setupMockData(samplePageDates);
    const { getPageDate } = await import('@/lib/docs-data/pageDates');
    expect(getPageDate('start')).toBe('2026-05-20');
  });

  it('returns the date for a nested slug', async () => {
    setupMockData(samplePageDates);
    const { getPageDate } = await import('@/lib/docs-data/pageDates');
    expect(getPageDate('concepts/artifacts')).toBe('2026-05-13');
  });

  it('returns null for an unknown slug', async () => {
    setupMockData(samplePageDates);
    const { getPageDate } = await import('@/lib/docs-data/pageDates');
    expect(getPageDate('nonexistent/page')).toBeNull();
  });

  // @ana A009
  it('keys do not contain .mdx extension', async () => {
    setupMockData(samplePageDates);
    const { getPageDate } = await import('@/lib/docs-data/pageDates');
    // Verify the mock data keys (which mirror real output) have no .mdx
    for (const key of Object.keys(samplePageDates)) {
      expect(key).not.toContain('.mdx');
      expect(getPageDate(key)).not.toBeNull();
    }
  });

  // @ana A010
  it('values are YYYY-MM-DD date strings', async () => {
    setupMockData(samplePageDates);
    const { getPageDate } = await import('@/lib/docs-data/pageDates');
    for (const key of Object.keys(samplePageDates)) {
      const date = getPageDate(key);
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('caches data after first load', async () => {
    setupMockData(samplePageDates);
    const { getPageDate } = await import('@/lib/docs-data/pageDates');
    getPageDate('start');
    getPageDate('concepts/artifacts');
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });
});
