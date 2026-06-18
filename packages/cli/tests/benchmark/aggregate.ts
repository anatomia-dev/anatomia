/**
 * Prove-it benchmark aggregate — the deterministic statistics layer.
 *
 * Reduces many scored runs to per-cell summary stats and per-task arm
 * comparisons. This is the only NET-NEW module in the benchmark: `anatrace-core`
 * has no statistical-aggregation surface, so the estimators live here.
 *
 * DETERMINISM (AC5): pure — no clock, no `Math.random`, no network, no
 * filesystem. All grouped output is sorted by `(task, metric, arm)` string order
 * so iteration is stable and `JSON.stringify(aggregate(x))` is byte-identical
 * across invocations on identical input.
 *
 * ESTIMATORS (resolving the scope's open question):
 *  - Within-cell spread: SAMPLE variance / std-dev with Bessel's correction
 *    (`n-1`); `sem = sampleStdDev / sqrt(n)`.
 *  - 95% CI of the mean: STUDENT'S t, two-tailed, `df = n-1`
 *    (`mean ± t(0.975, df) * sem`). NOT normal-approx — at small k, z=1.96
 *    understates the interval (t for df=2 is 4.303); an overconfident CI is
 *    exactly the overclaim this benchmark exists to forbid.
 *  - `n=1`: `mean` only; spread + CI `null`; `singleRun = true`. Never /0.
 *  - `n=0` (a metric all-null within a built cell): emit with `n=0`,
 *    `mean=null` — surfaced, never silently dropped.
 *
 * Abstained runs are COUNTED (`abstainedRuns`), never folded into cells.
 */

import type { Arm, MetricsRow, ScoreResult } from './scorer.js';

/** Per-cell summary statistics for one (task, arm, metric). */
export interface CellStats {
  task: string;
  arm: Arm;
  metric: string;
  /** Number of non-null values that fed this cell. */
  n: number;
  /** Arithmetic mean; `null` when `n=0`. */
  mean: number | null;
  /** Sample variance (Bessel `n-1`); `null` for `n<2`. */
  sampleVariance: number | null;
  /** Sample standard deviation; `null` for `n<2`. */
  sampleStdDev: number | null;
  /** Standard error of the mean; `null` for `n<2`. */
  sem: number | null;
  /** Student's-t 95% CI of the mean; `null` for `n<2`. */
  ci95: { low: number; high: number } | null;
  /** True iff exactly one run fed this cell (variance unavailable, flagged). */
  singleRun: boolean;
}

/** A paired baseline-vs-comparison arm comparison for one (task, metric). */
export interface ArmComparison {
  task: string;
  metric: string;
  baselineArm: Arm;
  comparisonArm: Arm;
  /** How often the comparison arm beat the baseline (lower is better). */
  winRate: { wins: number; total: number };
  /** Mean of `baseline - comparison` over comparable paired runs. */
  meanReduction: number;
  /** Number of positionally paired runs (the shared `min` of the two arms). */
  pairedRuns: number;
  /** Runs left unpaired because the arms had unequal run counts. */
  droppedRuns: number;
}

/** The full aggregate report over a set of scored/abstained runs. */
export interface AggregateReport {
  cells: CellStats[];
  comparisons: ArmComparison[];
  /** Count of runs that scored (fed the cells). */
  scoredRuns: number;
  /** Count of runs that abstained (counted, never folded into cells). */
  abstainedRuns: number;
}

/**
 * The numeric `MetricsRow` fields that are aggregated. Lower is better for every
 * one, so an arm "win" is `comparison < baseline`. Boolean/string fields
 * (`priced`, `model`, `taskId`, `arm`) are excluded.
 */
const NUMERIC_METRICS: ReadonlyArray<keyof MetricsRow> = [
  'distinctFilesRead',
  'wrongFileReads',
  'redundantReads',
  'redundantReadRatio',
  'tokensToFirstCorrectEdit',
  'turnsToResolution',
  'wallClockMsToFirstCorrectEdit',
  'toolCalls',
  'turns',
  'durationMs',
  'inputTokens',
  'outputTokens',
  'cacheCreateTokens',
  'cacheReadTokens',
  'peakContextTokens',
  'contextUtilization',
  'costUsd',
];

/** The baseline arm every comparison is measured against. */
const BASELINE_ARM: Arm = 'bare';

/**
 * Static two-tailed t-critical values at 95% (`t(0.975, df)`) for `df` 1–30.
 * These are mathematical constants (content-stable, deterministic), NOT
 * fabricated data. `df > 30` falls back to the normal-approx z=1.96.
 */
const T_CRITICAL_95: Readonly<Record<number, number>> = {
  1: 12.706205,
  2: 4.302653,
  3: 3.182446,
  4: 2.776445,
  5: 2.570582,
  6: 2.446912,
  7: 2.364624,
  8: 2.306004,
  9: 2.262157,
  10: 2.228139,
  11: 2.200985,
  12: 2.178813,
  13: 2.160369,
  14: 2.144787,
  15: 2.131450,
  16: 2.119905,
  17: 2.109816,
  18: 2.100922,
  19: 2.093024,
  20: 2.085963,
  21: 2.079614,
  22: 2.073873,
  23: 2.068658,
  24: 2.063899,
  25: 2.059539,
  26: 2.055529,
  27: 2.051831,
  28: 2.048407,
  29: 2.045230,
  30: 2.042272,
};

/** The normal-approx 95% two-tailed critical value, used for `df > 30`. */
const Z_CRITICAL_95 = 1.959964;

/**
 * The two-tailed 95% t-critical for a given degrees-of-freedom.
 *
 * @param df - Degrees of freedom (`n - 1`)
 * @returns The t-critical (or z=1.959964 for `df > 30`)
 */
function tCritical95(df: number): number {
  return T_CRITICAL_95[df] ?? Z_CRITICAL_95;
}

/**
 * Compute the per-cell statistics for a set of values.
 *
 * @param task - The task id
 * @param arm - The arm
 * @param metric - The metric name
 * @param values - The non-null numeric values for this cell, in run order
 * @returns The summary statistics for the cell
 */
function computeCell(task: string, arm: Arm, metric: string, values: number[]): CellStats {
  const n = values.length;
  if (n === 0) {
    return {
      task,
      arm,
      metric,
      n: 0,
      mean: null,
      sampleVariance: null,
      sampleStdDev: null,
      sem: null,
      ci95: null,
      singleRun: false,
    };
  }

  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n === 1) {
    return {
      task,
      arm,
      metric,
      n: 1,
      mean,
      sampleVariance: null,
      sampleStdDev: null,
      sem: null,
      ci95: null,
      singleRun: true,
    };
  }

  const sumSq = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0);
  const sampleVariance = sumSq / (n - 1);
  const sampleStdDev = Math.sqrt(sampleVariance);
  const sem = sampleStdDev / Math.sqrt(n);
  const margin = tCritical95(n - 1) * sem;

  return {
    task,
    arm,
    metric,
    n,
    mean,
    sampleVariance,
    sampleStdDev,
    sem,
    ci95: { low: mean - margin, high: mean + margin },
    singleRun: false,
  };
}

/**
 * Read a numeric metric off a row, or `null` when the field is `null`.
 *
 * @param row - A scored metrics row
 * @param metric - The metric field name
 * @returns The numeric value, or `null`
 */
function metricValue(row: MetricsRow, metric: keyof MetricsRow): number | null {
  const v = row[metric];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Aggregate scored runs into per-cell statistics and per-task arm comparisons.
 *
 * Abstains are counted (`abstainedRuns`) and excluded from every cell. Scored
 * rows are grouped by `(task, arm)` in input order (run order, which the
 * paired-comparison win-rate relies on). For each numeric metric a cell is
 * emitted with mean ± Student's-t 95% CI and within-cell variance; arm
 * comparisons pair the baseline (`bare`) against each other arm positionally.
 *
 * Pure and deterministic: identical input yields `JSON.stringify`-identical
 * output. All output is sorted by `(task, metric, arm)` string order.
 *
 * @param results - The scored/abstained runs to aggregate
 * @returns The aggregate report (cells, comparisons, scored/abstained counts)
 */
export function aggregate(results: ScoreResult[]): AggregateReport {
  let abstainedRuns = 0;
  const scored: MetricsRow[] = [];
  for (const r of results) {
    if (r.outcome === 'abstain') abstainedRuns += 1;
    else scored.push(r.row);
  }

  // Group scored rows by task → arm, preserving input (run) order.
  const byTaskArm = new Map<string, Map<Arm, MetricsRow[]>>();
  for (const row of scored) {
    let arms = byTaskArm.get(row.taskId);
    if (!arms) {
      arms = new Map<Arm, MetricsRow[]>();
      byTaskArm.set(row.taskId, arms);
    }
    const rows = arms.get(row.arm);
    if (rows) rows.push(row);
    else arms.set(row.arm, [row]);
  }

  const cells: CellStats[] = [];
  const comparisons: ArmComparison[] = [];

  for (const task of [...byTaskArm.keys()].sort()) {
    const arms = byTaskArm.get(task)!;
    const armNames = [...arms.keys()].sort();

    // Per-cell stats: one cell per (arm, metric).
    for (const metric of NUMERIC_METRICS) {
      for (const arm of armNames) {
        const rows = arms.get(arm)!;
        const values = rows
          .map((row) => metricValue(row, metric))
          .filter((v): v is number => v !== null);
        cells.push(computeCell(task, arm, String(metric), values));
      }
    }

    // Arm comparisons: baseline `bare` vs each other arm, paired positionally.
    const baselineRows = arms.get(BASELINE_ARM);
    if (baselineRows) {
      for (const comparisonArm of armNames) {
        if (comparisonArm === BASELINE_ARM) continue;
        const comparisonRows = arms.get(comparisonArm)!;
        const pairedRuns = Math.min(baselineRows.length, comparisonRows.length);
        const droppedRuns = Math.abs(baselineRows.length - comparisonRows.length);

        for (const metric of NUMERIC_METRICS) {
          let wins = 0;
          let total = 0;
          let reductionSum = 0;
          for (let i = 0; i < pairedRuns; i++) {
            const bv = metricValue(baselineRows[i], metric);
            const cv = metricValue(comparisonRows[i], metric);
            if (bv === null || cv === null) continue;
            total += 1;
            if (cv < bv) wins += 1;
            reductionSum += bv - cv;
          }
          comparisons.push({
            task,
            metric: String(metric),
            baselineArm: BASELINE_ARM,
            comparisonArm,
            winRate: { wins, total },
            meanReduction: total === 0 ? 0 : reductionSum / total,
            pairedRuns,
            droppedRuns,
          });
        }
      }
    }
  }

  // Stable sort: (task, metric, arm) for cells; (task, metric, comparisonArm)
  // for comparisons. Grouping already iterates in sorted order, but sort
  // explicitly so the contract holds regardless of insertion order.
  cells.sort(
    (a, b) =>
      a.task.localeCompare(b.task) ||
      a.metric.localeCompare(b.metric) ||
      String(a.arm).localeCompare(String(b.arm)),
  );
  comparisons.sort(
    (a, b) =>
      a.task.localeCompare(b.task) ||
      a.metric.localeCompare(b.metric) ||
      String(a.comparisonArm).localeCompare(String(b.comparisonArm)),
  );

  return { cells, comparisons, scoredRuns: scored.length, abstainedRuns };
}
