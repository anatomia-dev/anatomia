import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs');

import { readFileSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);

function setupMockData(entries: unknown[]): void {
  mockReadFileSync.mockReturnValue(JSON.stringify(entries));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
});

const multiEntryData = [
  {
    slug: 'feat-one',
    feature: 'Feature One',
    result: 'pass',
    stage: 'completed',
    contract: { total: 5, satisfied: 5, unsatisfied: 0 },
    assertionCount: 5,
    findingCount: 2,
    rejectionCycles: 1,
    completedAt: '2026-05-01T00:00:00Z',
    scopeSummary: null,
    modulesTouched: [],
    assertions: [],
    findings: [],
    timing: { think: 3, plan: 8, build: 15, verify: 0, totalMinutes: 26 },
    hashes: {},
    findingSeverity: { risk: 0, debt: 1, observation: 1 },
    duration: 26,
    prevSlug: null,
    nextSlug: 'feat-two',
  },
  {
    slug: 'feat-two',
    feature: 'Feature Two',
    result: 'pass',
    stage: 'completed',
    contract: { total: 3, satisfied: 3, unsatisfied: 0 },
    assertionCount: 3,
    findingCount: 1,
    rejectionCycles: 0,
    completedAt: '2026-05-02T00:00:00Z',
    scopeSummary: null,
    modulesTouched: [],
    assertions: [],
    findings: [],
    timing: { think: 5, plan: 0, build: 20, verify: 0, totalMinutes: 25 },
    hashes: {},
    findingSeverity: { risk: 0, debt: 0, observation: 1 },
    duration: 25,
    prevSlug: 'feat-one',
    nextSlug: 'feat-three',
  },
  {
    slug: 'feat-three',
    feature: 'Feature Three',
    result: 'pass',
    stage: 'completed',
    contract: { total: 4, satisfied: 4, unsatisfied: 0 },
    assertionCount: 4,
    findingCount: 0,
    rejectionCycles: 0,
    completedAt: '2026-05-03T00:00:00Z',
    scopeSummary: null,
    modulesTouched: [],
    assertions: [],
    findings: [],
    timing: { think: 7, plan: 12, build: 10, verify: 0, totalMinutes: 29 },
    hashes: {},
    findingSeverity: { risk: 0, debt: 0, observation: 0 },
    duration: 29,
    prevSlug: 'feat-two',
    nextSlug: null,
  },
];

// @ana A004
describe('getProofStats computes correct totals', () => {
  it('counts entries, assertions, findings, and rejections', async () => {
    setupMockData(multiEntryData);
    const { getProofStats } = await import('@/lib/docs-data/proofs');
    const stats = getProofStats();

    expect(stats.entries).toBe(3);
    expect(stats.assertions).toBe(12);
    expect(stats.findings).toBe(3);
  });
});

// @ana A006
describe('getProofStats counts rejections correctly', () => {
  it('only counts entries with rejectionCycles > 0', async () => {
    setupMockData(multiEntryData);
    const { getProofStats } = await import('@/lib/docs-data/proofs');
    const stats = getProofStats();

    expect(stats.rejections).toBe(1);
  });
});

// @ana A005
describe('getProofStats with empty dataset', () => {
  it('returns zeros for all fields', async () => {
    setupMockData([]);
    const { getProofStats } = await import('@/lib/docs-data/proofs');
    const stats = getProofStats();

    expect(stats.entries).toBe(0);
    expect(stats.assertions).toBe(0);
    expect(stats.findings).toBe(0);
    expect(stats.rejections).toBe(0);
  });
});

// @ana A007
describe('getMedianTimings filters zeros', () => {
  it('filters out zero-valued stages before computing median', async () => {
    setupMockData(multiEntryData);
    const { getMedianTimings } = await import('@/lib/docs-data/proofs');
    const medians = getMedianTimings();

    // think values: [3, 5, 7] → median 5
    expect(medians.think).toBe(5);
    // plan values (non-zero): [8, 12] → median 10
    expect(medians.plan).toBe(10);
    // build values: [15, 20, 10] → sorted [10, 15, 20] → median 15
    expect(medians.build).toBe(15);
  });
});

// @ana A008
describe('getMedianTimings all-zero stage', () => {
  it('returns 0 for a stage where all entries have zero', async () => {
    setupMockData(multiEntryData);
    const { getMedianTimings } = await import('@/lib/docs-data/proofs');
    const medians = getMedianTimings();

    // verify values: all 0 → filtered out → empty → returns 0
    expect(medians.verify).toBe(0);
  });
});

// @ana A009
describe('getMedianTimings with empty dataset', () => {
  it('returns zeros for all stages', async () => {
    setupMockData([]);
    const { getMedianTimings } = await import('@/lib/docs-data/proofs');
    const medians = getMedianTimings();

    expect(medians.think).toBe(0);
    expect(medians.plan).toBe(0);
    expect(medians.build).toBe(0);
    expect(medians.verify).toBe(0);
  });
});

describe('getMedianTimings odd vs even entry count', () => {
  it('computes median correctly for even count (average of two middle)', async () => {
    setupMockData(multiEntryData);
    const { getMedianTimings } = await import('@/lib/docs-data/proofs');
    const medians = getMedianTimings();

    // plan has 2 non-zero values: [8, 12] → (8+12)/2 = 10
    expect(medians.plan).toBe(10);
  });

  it('computes median correctly for odd count (middle value)', async () => {
    setupMockData(multiEntryData);
    const { getMedianTimings } = await import('@/lib/docs-data/proofs');
    const medians = getMedianTimings();

    // think has 3 non-zero values: [3, 5, 7] → middle = 5
    expect(medians.think).toBe(5);
  });
});
