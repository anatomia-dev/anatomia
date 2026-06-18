/**
 * Prove-it benchmark aggregate — unit tests (the statistics layer).
 *
 * Uses fixed in-memory {@link MetricsRow}s — no transcripts — so the estimators
 * are tested in isolation: mean / sample variance / sample std-dev, the
 * Student's-t CI (wider than a normal-approx interval), the k=1 no-crash edge,
 * win-rate pairing, abstain counting, and determinism.
 *
 * `// @ana A0NN` tags map a test to the contract assertion it satisfies.
 */

import { describe, it, expect } from 'vitest';
import { aggregate, type CellStats, type ArmComparison } from './aggregate.js';
import type { Arm, MetricsRow, ScoreResult } from './scorer.js';

/**
 * Build a fully-typed {@link MetricsRow} with neutral defaults, overriding only
 * the fields a test cares about. Keeps each test focused on one metric.
 */
function makeRow(task: string, arm: Arm, overrides: Partial<MetricsRow>): MetricsRow {
  return {
    taskId: task,
    arm,
    distinctFilesRead: 0,
    wrongFileReads: 0,
    redundantReads: 0,
    redundantReadRatio: 0,
    tokensToFirstCorrectEdit: null,
    turnsToResolution: null,
    wallClockMsToFirstCorrectEdit: null,
    toolCalls: 0,
    turns: 0,
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreateTokens: 0,
    cacheReadTokens: 0,
    peakContextTokens: 0,
    contextUtilization: null,
    costUsd: 0,
    priced: true,
    model: 'claude-opus-4-8',
    ...overrides,
  };
}

/** Wrap a row as a scored result. */
function scored(row: MetricsRow): ScoreResult {
  return { outcome: 'scored', row };
}

/** Find the single cell for a (task, arm, metric). */
function cellFor(cells: CellStats[], task: string, arm: Arm, metric: string): CellStats {
  const cell = cells.find((c) => c.task === task && c.arm === arm && c.metric === metric);
  expect(cell).toBeDefined();
  return cell!;
}

/** Find the single comparison for a (task, metric). */
function comparisonFor(comparisons: ArmComparison[], task: string, metric: string): ArmComparison {
  const cmp = comparisons.find((c) => c.task === task && c.metric === metric);
  expect(cmp).toBeDefined();
  return cmp!;
}

/** Three scored runs of one cell with `toolCalls` values [1, 2, 3]. */
function threeRunCell(): ScoreResult[] {
  return [1, 2, 3].map((v) => scored(makeRow('T', 'scan', { toolCalls: v })));
}

describe('aggregate — per-cell mean and spread', () => {
  // @ana A027
  it('averages a metric across the runs of a cell', () => {
    const cell = cellFor(aggregate(threeRunCell()).cells, 'T', 'scan', 'toolCalls');
    expect(cell.mean).toBe(2);
    expect(cell.n).toBe(3);
  });

  // @ana A028
  it('reports the sample variance (Bessel n-1) across the runs', () => {
    const cell = cellFor(aggregate(threeRunCell()).cells, 'T', 'scan', 'toolCalls');
    expect(cell.sampleVariance).toBe(1);
  });

  it('reports sample std-dev and the standard error of the mean', () => {
    const cell = cellFor(aggregate(threeRunCell()).cells, 'T', 'scan', 'toolCalls');
    expect(cell.sampleStdDev).toBe(1);
    expect(cell.sem).toBeCloseTo(0.5773502692, 9);
    expect(cell.singleRun).toBe(false);
  });
});

describe("aggregate — Student's t confidence interval", () => {
  // @ana A029
  it('is honest for small samples — wider than a naive normal-approx interval', () => {
    const cell = cellFor(aggregate(threeRunCell()).cells, 'T', 'scan', 'toolCalls');
    expect(cell.ci95).not.toBeNull();
    // t (df=2, t=4.302653): high ≈ 4.4841. A normal-approx (z=1.96) high ≈ 3.13.
    // Asserting > 3.2 discriminates the t-interval from the z-interval.
    expect(cell.ci95!.high).toBeGreaterThan(3.2);
    expect(cell.ci95!.high).toBeCloseTo(4.4841, 3);
    expect(cell.ci95!.low).toBeCloseTo(-0.4841, 3);
  });
});

describe('aggregate — single run (k=1) edge case', () => {
  // @ana A030
  it('flags variance undefined rather than inventing it', () => {
    const report = aggregate([scored(makeRow('T', 'scan', { toolCalls: 5 }))]);
    const cell = cellFor(report.cells, 'T', 'scan', 'toolCalls');
    expect(cell.mean).toBe(5);
    expect(cell.sampleVariance).toBeNull();
    expect(cell.sampleStdDev).toBeNull();
    expect(cell.sem).toBeNull();
    expect(cell.ci95).toBeNull();
  });

  // @ana A031
  it('explicitly flags the single run so a reader knows variance is unavailable', () => {
    const report = aggregate([scored(makeRow('T', 'scan', { toolCalls: 5 }))]);
    expect(cellFor(report.cells, 'T', 'scan', 'toolCalls').singleRun).toBe(true);
  });
});

describe('aggregate — n=0 metric within a built cell', () => {
  it('surfaces an all-null metric as n=0 / mean=null, never silently dropped', () => {
    // The rows are scored (so the cell exists), but every row leaves
    // contextUtilization null → that metric's cell is n=0, surfaced.
    const report = aggregate([
      scored(makeRow('T', 'scan', { toolCalls: 1 })),
      scored(makeRow('T', 'scan', { toolCalls: 2 })),
    ]);
    const cell = cellFor(report.cells, 'T', 'scan', 'contextUtilization');
    expect(cell.n).toBe(0);
    expect(cell.mean).toBeNull();
    expect(cell.singleRun).toBe(false);
  });
});

describe('aggregate — per-task win-rate', () => {
  /** Baseline `bare` [5,6,7] vs comparison `scan` [1,2,3] on toolCalls. */
  function pairedRuns(): ScoreResult[] {
    return [
      scored(makeRow('T', 'bare', { toolCalls: 5 })),
      scored(makeRow('T', 'bare', { toolCalls: 6 })),
      scored(makeRow('T', 'bare', { toolCalls: 7 })),
      scored(makeRow('T', 'scan', { toolCalls: 1 })),
      scored(makeRow('T', 'scan', { toolCalls: 2 })),
      scored(makeRow('T', 'scan', { toolCalls: 3 })),
    ];
  }

  // @ana A032
  it('counts how often the comparison arm beat the baseline across paired runs', () => {
    const cmp = comparisonFor(aggregate(pairedRuns()).comparisons, 'T', 'toolCalls');
    expect(cmp.baselineArm).toBe('bare');
    expect(cmp.comparisonArm).toBe('scan');
    expect(cmp.winRate.wins).toBe(3);
    expect(cmp.winRate.total).toBe(3);
    expect(cmp.pairedRuns).toBe(3);
    expect(cmp.droppedRuns).toBe(0);
    expect(cmp.meanReduction).toBe(4); // mean of (5-1, 6-2, 7-3)
  });

  it('surfaces unequal arm counts as droppedRuns (no silent truncation)', () => {
    const runs: ScoreResult[] = [
      scored(makeRow('T', 'bare', { toolCalls: 5 })),
      scored(makeRow('T', 'bare', { toolCalls: 6 })),
      scored(makeRow('T', 'bare', { toolCalls: 7 })),
      scored(makeRow('T', 'scan', { toolCalls: 1 })),
      scored(makeRow('T', 'scan', { toolCalls: 2 })),
    ];
    const cmp = comparisonFor(aggregate(runs).comparisons, 'T', 'toolCalls');
    expect(cmp.pairedRuns).toBe(2);
    expect(cmp.droppedRuns).toBe(1);
    expect(cmp.winRate.wins).toBe(2);
  });
});

describe('aggregate — abstains are counted, not hidden', () => {
  // @ana A033
  it('counts abstained runs and builds cells only from the scored ones', () => {
    const report = aggregate([
      { outcome: 'abstain', reason: 'unreadable' },
      { outcome: 'abstain', reason: 'zero lines' },
      scored(makeRow('T', 'scan', { toolCalls: 4 })),
    ]);
    expect(report.abstainedRuns).toBe(2);
    expect(report.scoredRuns).toBe(1);
    const cell = cellFor(report.cells, 'T', 'scan', 'toolCalls');
    expect(cell.n).toBe(1);
    expect(cell.mean).toBe(4);
  });
});

describe('aggregate — determinism', () => {
  // @ana A034
  it('is byte-identical across invocations on identical input', () => {
    const rows = [
      scored(makeRow('T', 'bare', { toolCalls: 5, durationMs: 100 })),
      scored(makeRow('T', 'scan', { toolCalls: 1, durationMs: 50 })),
      scored(makeRow('U', 'scan', { toolCalls: 9, durationMs: 200 })),
    ];
    expect(JSON.stringify(aggregate(rows))).toBe(JSON.stringify(aggregate(rows)));
  });
});
