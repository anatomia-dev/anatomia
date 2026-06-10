/**
 * Golden / snapshot tests for the `ana proof health` dashboard and the
 * `ana proof` summary list table.
 *
 * Renders `formatHealthDisplay` and `formatListTable` directly (no temp dirs, no
 * subprocess) across fixtures — full dashboard, zero-runs, Pipeline omitted, Hot
 * Spots empty, Next Actions empty/over-cap, the summary list table, and a Hot
 * Spots disambiguation/truncation fixture — and snapshots the whole render so PR
 * review of alignment, grid columns, and rule widths is mechanical (AC10).
 *
 * Color is stripped (chalk.level = 0) so snapshots are plain text regardless of
 * the runner's TTY. The health header date comes from `new Date()`, so the clock
 * is pinned (vi.setSystemTime) and TZ forced to UTC — otherwise snapshots drift
 * daily (the gotcha called out in the spec).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import chalk from 'chalk';
import { formatHealthDisplay, formatListTable } from '../../src/commands/proof.js';
import type { HealthReport, ProofChainEntry } from '../../src/types/proof.js';

const ORIGINAL_TZ = process.env['TZ'];

beforeAll(() => {
  chalk.level = 0;
  process.env['TZ'] = 'UTC';
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-09T12:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env['TZ'];
  else process.env['TZ'] = ORIGINAL_TZ;
});

/** Build a HealthReport with sensible all-sections-present defaults. */
function makeHealthReport(over: Partial<HealthReport> = {}): HealthReport {
  return {
    runs: 7,
    trajectory: {
      risks_per_run_last5: 1,
      risks_per_run_all: 2,
      trend: 'improving',
      unclassified_count: 0,
    },
    hot_modules: [],
    promotion_candidates: [],
    promotions: [],
    verification: { first_pass_count: 6, total_runs: 7, first_pass_pct: 86, total_caught: 4 },
    pipeline: {
      median_total: 42,
      median_scope: 5,
      median_plan: 8,
      median_build: 21,
      median_verify: 8,
      entries_with_timing: 7,
    },
    ...over,
  };
}

/** Two findings sharing a basename (→ dir/base) plus an over-long name (→ truncated). */
const HOT_SPOTS_DISAMBIG = [
  {
    file: 'src/commands/proof.ts',
    finding_count: 12,
    entry_count: 6,
    by_severity: { risk: 3, debt: 5, observation: 4, unclassified: 0 },
  },
  {
    file: 'src/engine/proof.ts',
    finding_count: 4,
    entry_count: 3,
    by_severity: { risk: 1, debt: 3, observation: 0, unclassified: 0 },
  },
  {
    file: 'src/utils/a-very-long-module-filename-that-overflows.ts',
    finding_count: 2,
    entry_count: 1,
    by_severity: { risk: 0, debt: 2, observation: 0, unclassified: 0 },
  },
];

const NEXT_ACTIONS = [
  {
    id: 'F1',
    severity: 'risk',
    suggested_action: 'promote',
    summary: 'Empty catch swallows detector failure',
    file: 'src/engine/scan-engine.ts',
    entry_slug: 'scan-fix',
    recurrence_count: 2,
  },
  {
    id: 'F2',
    severity: 'debt',
    suggested_action: 'scope',
    summary: 'SEVERITY_ORDER duplicated across two blocks',
    file: null,
    entry_slug: 'severity-dup',
    recurrence_count: 3,
  },
];

const fullDashboard = makeHealthReport({
  hot_modules: HOT_SPOTS_DISAMBIG,
  promotion_candidates: NEXT_ACTIONS,
});

const pipelineOmitted = makeHealthReport({ pipeline: undefined });

const hotSpotsEmpty = makeHealthReport({ hot_modules: [] });

const nextActionsEmpty = makeHealthReport({ promotion_candidates: [] });

// Eight promote candidates → Next Actions must cap at five.
const overCapNextActions = makeHealthReport({
  promotion_candidates: Array.from({ length: 8 }, (_, i) => ({
    id: `P${i}`,
    severity: 'risk',
    suggested_action: 'promote',
    summary: `Promote candidate number ${i}`,
    file: `src/file${i}.ts`,
    entry_slug: `e${i}`,
    recurrence_count: i,
  })),
});

/** Minimal proof entry — only the fields the list table reads. */
function listEntry(over: Partial<ProofChainEntry>): ProofChainEntry {
  return {
    slug: 'entry',
    result: 'PASS',
    contract: { total: 22, satisfied: 22, unsatisfied: 0, deviated: 0 },
    surface: 'cli',
    completed_at: '2026-06-09T10:00:00Z',
    ...over,
  } as unknown as ProofChainEntry;
}

const listEntries = [
  listEntry({
    slug: 'health-dashboard-redesign-with-a-very-long-name',
    contract: { total: 22, satisfied: 22, unsatisfied: 0, deviated: 0 },
    completed_at: '2026-06-09T10:00:00Z',
  }),
  listEntry({
    slug: 'cli-telemetry',
    contract: { total: 14, satisfied: 14, unsatisfied: 0, deviated: 0 },
    completed_at: '2026-06-08T10:00:00Z',
  }),
  listEntry({
    slug: 'scan-card-redesign',
    result: 'FAIL',
    contract: { total: 19, satisfied: 18, unsatisfied: 1, deviated: 0 },
    surface: undefined,
    completed_at: '2026-06-07T10:00:00Z',
  }),
];

describe('health dashboard golden snapshots', () => {
  // @ana A007, A008, A009, A010, A011, A012, A017, A018, A024
  it('renders the full dashboard', () => {
    const out = formatHealthDisplay(fullDashboard);
    expect(out).toMatchSnapshot();
    expect(out).toContain('╭'); // A007 rounded identity box
    expect(out).not.toContain('┌'); // A008 old square box is gone
    expect(out).toContain('── Quality'); // A009 inset rule
    expect(out).toContain('── Verification'); // A010 inset rule
    expect(out).toContain('── Hot Spots'); // A011 inset rule
    expect(out).toContain('(last 5)'); // A012 risk trend numbers
    expect(out).toContain('/'); // A017 disambiguated colliding basenames (dir/base)
    expect(out).toContain('…'); // A018 over-long module name truncated
    expect(/\x1b\[/.test(out)).toBe(false); // A024 no ANSI escapes when color stripped
  });

  // @ana A013
  it('renders the zero-runs path with a No data. message', () => {
    const out = formatHealthDisplay(0);
    expect(out).toMatchSnapshot();
    expect(out).toContain('╭'); // still the rounded box
    expect(out).toContain('0 runs');
    expect(out).toContain('No data.');
  });

  // @ana A014
  it('omits the Pipeline section when timing is insufficient', () => {
    const out = formatHealthDisplay(pipelineOmitted);
    expect(out).toMatchSnapshot();
    expect(out).not.toContain('── Pipeline');
    expect(out).not.toContain('Median');
  });

  // @ana A015
  it('omits the Hot Spots section when there are no hot spots', () => {
    const out = formatHealthDisplay(hotSpotsEmpty);
    expect(out).toMatchSnapshot();
    expect(out).not.toContain('── Hot Spots');
  });

  it('omits Next Actions when there are no candidates', () => {
    const out = formatHealthDisplay(nextActionsEmpty);
    expect(out).toMatchSnapshot();
    expect(out).not.toContain('── Next Actions');
  });

  // @ana A016
  it('caps Next Actions at five items', () => {
    const out = formatHealthDisplay(overCapNextActions);
    expect(out).toMatchSnapshot();
    const actionLines = out.split('\n').filter((l) => l.includes('Promote:') || l.includes('Fix:'));
    expect(actionLines.length).toBe(5);
  });
});

describe('proof summary list table golden snapshots', () => {
  // @ana A019, A020, A021
  it('renders the summary list table', () => {
    const out = formatListTable(listEntries);
    expect(out).toMatchSnapshot();
    expect(out).toContain('── Proof History'); // A019 inset header, not a bold label
    expect(out).toContain('PASS'); // A020 pass/fail result
    expect(out).toContain('FAIL');
    expect(out).toContain('…'); // A021 over-long slug truncated
    expect(out).toContain('--'); // dim surface fallback for the surfaceless entry
    expect(/\x1b\[/.test(out)).toBe(false); // legible with color stripped
  });
});
