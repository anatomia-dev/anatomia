/**
 * Golden / snapshot tests for the full `ana proof <slug>` human card.
 *
 * Renders `formatHumanReadable` directly (no temp dirs, no subprocess) across
 * five fixtures — provenance-rich, provenance-absent, ≥6 sessions, unpriced
 * model, and a FAIL/DEVIATED card — and snapshots the whole card so PR review of
 * alignment, grid columns, and rule widths is mechanical (AC10).
 *
 * Color is stripped (chalk.level = 0) so snapshots are plain text regardless of
 * the runner's TTY, the same reason proofSummary.test.ts's toContain checks pass.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import chalk from 'chalk';
import { formatHumanReadable } from '../../src/commands/proof.js';
import type { ProofChainEntry } from '../../src/types/proof.js';
import type { SessionProvenance } from '../../src/types/proof.js';

// The card renders its header timestamp in the *local* timezone (correct UX for
// a CLI receipt). That makes these golden snapshots timezone-dependent: captured
// in the author's zone, they would fail under CI's UTC (proven: `16:40` MDT vs
// `22:40` UTC). Pin TZ to UTC for the duration of this file so the snapshots are
// deterministic everywhere, and restore it afterwards so no other suite inherits
// the change. Node re-reads process.env.TZ on each Date construction, so setting
// it here takes effect before any fixture is rendered.
const ORIGINAL_TZ = process.env['TZ'];

beforeAll(() => {
  chalk.level = 0;
  process.env['TZ'] = 'UTC';
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env['TZ'];
  else process.env['TZ'] = ORIGINAL_TZ;
});

/** Build a derived-counts session for the provenance grid. */
function session(
  role: string,
  model: string,
  turns: number,
  tools: number,
  input: number,
  output: number,
  cacheCreate: number,
  cacheRead: number,
  withCounts = true
): SessionProvenance {
  const base = {
    role,
    harness: 'claude',
    model,
    agent_def_hash: 'sha256:x',
    cli_version: '1.2.2',
    session_id: `${role}-${turns}`,
    captured_at: '2026-06-01T00:00:00.000Z',
  };
  if (!withCounts) return base;
  return {
    ...base,
    derived: {
      tokens: { input, output, cache_create: cacheCreate, cache_read: cacheRead },
      price_table_version: 'v3',
      derive_version: '3',
      duration_ms: 0,
      turns,
      tool_calls: tools,
      commands_run: 0,
      tests_executed: 0,
      failures_encountered: 0,
      files_touched: 0,
      model,
    },
  } as SessionProvenance;
}

/** Build a proof chain entry with sensible defaults. */
function makeEntry(over: Partial<ProofChainEntry>): ProofChainEntry {
  return {
    slug: 'proof-card-redesign',
    feature: 'Proof card visual redesign',
    result: 'PASS',
    author: { name: 'Dev', email: 'dev@example.com' },
    contract: { total: 44, satisfied: 44, unsatisfied: 0, deviated: 0 },
    assertions: [{ id: 'A001', says: 'It works', status: 'SATISFIED' }],
    acceptance_criteria: { total: 7, met: 7 },
    timing: { total_minutes: 23, think: 4, plan: 5, build: 10, verify: 4 },
    hashes: {},
    completed_at: '2026-06-08T14:32:00Z',
    modules_touched: [],
    findings: [],
    rejection_cycles: 0,
    previous_failures: [],
    build_concerns: [],
    surface: 'cli',
    ...over,
  } as ProofChainEntry;
}

const SHARED_MODEL = 'claude-opus-4-8';

const provenanceRich = makeEntry({
  findings: [
    { id: 'C1', category: 'code', summary: 'SEVERITY_ORDER map duplicated', file: null, anchor: null, severity: 'debt', suggested_action: 'scope' },
    { id: 'C2', category: 'code', summary: 'Hardcoded literal 10', file: null, anchor: null, severity: 'observation', suggested_action: 'monitor' },
    { id: 'C3', category: 'code', summary: 'No summary truncation', file: null, anchor: null, severity: 'observation', suggested_action: 'monitor' },
    { id: 'C4', category: 'code', summary: 'Fourth finding', file: null, anchor: null, severity: 'observation', suggested_action: 'monitor' },
    { id: 'C5', category: 'code', summary: 'Fifth finding', file: null, anchor: null, severity: 'observation', suggested_action: 'monitor' },
    { id: 'C6', category: 'code', summary: 'Sixth finding', file: null, anchor: null, severity: 'observation', suggested_action: 'monitor' },
    { id: 'C7', category: 'code', summary: 'Seventh finding', file: null, anchor: null, severity: 'observation', suggested_action: 'monitor' },
  ],
  process: {
    outcome: { first_pass_verify: true, assertions_satisfied: 44, assertions_total: 44, findings: { risk: 0, debt: 1, observation: 6 } },
    task_shape: { size: 'medium', kind: 'feature', multi_phase: false },
    module_churn: { 'a.ts': { added: 840, deleted: 210 } },
    completeness: { complete: true, expected: { plan: 1, build: 2, verify: 1 }, present: { plan: 1, build: 2, verify: 1 }, gaps: [] },
    sessions: [
      session('plan', SHARED_MODEL, 12, 48, 12100, 4200, 80000, 800000),
      session('build', SHARED_MODEL, 31, 140, 18000, 9100, 100000, 2000000),
      session('build', SHARED_MODEL, 9, 22, 4000, 1100, 10000, 400000),
      session('verify', SHARED_MODEL, 14, 61, 10200, 3000, 20000, 900000),
    ],
  },
});

const provenanceAbsent = makeEntry({
  slug: 'close-the-loop',
  feature: 'Close the loop on proof context',
  contract: { total: 12, satisfied: 12, unsatisfied: 0, deviated: 0 },
  timing: { total_minutes: 18, think: 2, plan: 4, build: 8, verify: 4 },
  completed_at: '2026-06-07T09:11:00Z',
});

const manySessions = makeEntry({
  slug: 'rejection-heavy',
  feature: 'A feature that took many build attempts',
  rejection_cycles: 4,
  process: {
    outcome: { first_pass_verify: false, assertions_satisfied: 44, assertions_total: 44, findings: { risk: 0, debt: 0, observation: 0 } },
    task_shape: { size: 'large', kind: 'feature', multi_phase: false },
    module_churn: {},
    completeness: { complete: true, expected: { plan: 1, build: 5, verify: 1 }, present: { plan: 1, build: 5, verify: 1 }, gaps: [] },
    sessions: [
      session('plan', SHARED_MODEL, 12, 48, 12100, 4200, 80000, 800000),
      session('build', SHARED_MODEL, 31, 140, 18000, 9100, 100000, 2000000),
      session('build', SHARED_MODEL, 20, 90, 12000, 6000, 60000, 1200000),
      session('build', SHARED_MODEL, 9, 22, 4000, 1100, 10000, 400000),
      session('build', SHARED_MODEL, 15, 70, 9000, 4000, 50000, 900000),
      session('build', SHARED_MODEL, 11, 40, 7000, 2000, 30000, 600000),
      session('verify', SHARED_MODEL, 14, 61, 10200, 3000, 20000, 900000),
    ],
  },
});

const unpricedModel = makeEntry({
  slug: 'unpriced-run',
  feature: 'A run on a model with no price row',
  process: {
    outcome: { first_pass_verify: true, assertions_satisfied: 44, assertions_total: 44, findings: { risk: 0, debt: 0, observation: 0 } },
    task_shape: { size: 'small', kind: 'feature', multi_phase: false },
    module_churn: {},
    completeness: { complete: true, expected: { plan: 1, build: 1, verify: 1 }, present: { plan: 1, build: 1, verify: 1 }, gaps: [] },
    // Two distinct models → grid keeps a per-row model column; one is unpriced.
    // Cache totals are ≥1M (rendered "X.XM") so the cache column stays 4 wide and
    // the TOTAL footer — now carrying the real 10-char table version "2026-06-14"
    // (AC6) rather than a synthetic short stamp — fits within 80 columns.
    sessions: [
      session('plan', SHARED_MODEL, 12, 48, 12100, 4200, 80000, 1000000),
      session('build', 'claude-opus-5-0', 31, 140, 18000, 9100, 100000, 2000000),
      session('verify', SHARED_MODEL, 14, 61, 10200, 3000, 20000, 1000000),
    ],
  },
});

const failDeviated = makeEntry({
  slug: 'half-built',
  feature: 'Some half-built feature',
  result: 'FAIL',
  contract: { total: 12, satisfied: 9, unsatisfied: 2, deviated: 1 },
  timing: { total_minutes: 31, think: 3, plan: 6, build: 12, verify: 10 },
  completed_at: '2026-06-05T22:40:00Z',
  assertions: [
    { id: 'A006', says: 'Valid input is accepted', status: 'SATISFIED' },
    { id: 'A007', says: 'Webhook signature is verified before processing', status: 'UNSATISFIED' },
    { id: 'A008', says: 'Errors return a 4xx status', status: 'UNSATISFIED' },
    { id: 'A010', says: 'Idempotency key is enforced on retried writes', status: 'DEVIATED', deviation: 'built with a 5-minute TTL instead of permanent dedup' },
  ],
});

// Every session runs on a model with no price row. This is the edge the
// mixed-priced `unpricedModel` fixture can't reach: provPriced is false, so the
// TOTAL itself must read "n/a", never "$0.00". The real-world trigger is a brand
// new model id that pricing.ts doesn't know yet — a paid run must not advertise
// itself as free.
const allUnpriced = makeEntry({
  slug: 'all-unpriced-run',
  feature: 'A run entirely on a model with no price row',
  process: {
    outcome: { first_pass_verify: true, assertions_satisfied: 44, assertions_total: 44, findings: { risk: 0, debt: 0, observation: 0 } },
    task_shape: { size: 'small', kind: 'feature', multi_phase: false },
    module_churn: {},
    completeness: { complete: true, expected: { plan: 1, build: 1, verify: 1 }, present: { plan: 1, build: 1, verify: 1 }, gaps: [] },
    sessions: [
      session('plan', 'claude-opus-5-0', 12, 48, 12100, 4200, 80000, 800000),
      session('build', 'claude-opus-5-0', 31, 140, 18000, 9100, 100000, 2000000),
      session('verify', 'claude-opus-5-0', 14, 61, 10200, 3000, 20000, 900000),
    ],
  },
});

// Two alignment cases AC7 lists that no other fixture exercised: a
// counts-unavailable session (no `derived` — renders as a free "counts
// unavailable" line, kept out of the grid so it can't shear a numeric column)
// and a Codex session (cache_create = 0 — the cache column sums create + read,
// so it must render the read figure alone without breaking the grid).
const mixedCounts = makeEntry({
  slug: 'mixed-counts',
  feature: 'A run with a counts-unavailable session and a Codex session',
  process: {
    outcome: { first_pass_verify: true, assertions_satisfied: 44, assertions_total: 44, findings: { risk: 0, debt: 0, observation: 0 } },
    task_shape: { size: 'medium', kind: 'feature', multi_phase: false },
    module_churn: {},
    completeness: { complete: true, expected: { plan: 1, build: 1, verify: 1 }, present: { plan: 1, build: 1, verify: 1 }, gaps: [] },
    sessions: [
      session('plan', SHARED_MODEL, 12, 48, 12100, 4200, 80000, 800000),
      // Codex-style session: cache_create = 0, cache column shows the read figure
      // only. Uses the short model id `gpt-5` so the session label keeps the card
      // within 80 columns once the TOTAL footer carries the real table version
      // "2026-06-14" (AC6) — the cache figure (600.0k) is what this fixture asserts.
      session('build', 'gpt-5', 20, 90, 14000, 5000, 0, 600000),
      // Counts-unavailable session: no derived counts at all.
      session('verify', 'claude-opus-4-8', 0, 0, 0, 0, 0, 0, false),
    ],
  },
});

/** Assert the whole card stays within an 80-column terminal. */
function maxLineWidth(card: string): number {
  return Math.max(...card.split('\n').map((l) => l.length));
}

describe('proof card golden snapshots', () => {
  // @ana A012, A013, A014, A018, A021, A022, A023, A024
  it('renders the provenance-rich card', () => {
    const card = formatHumanReadable(provenanceRich);
    expect(card).toMatchSnapshot();
    expect(card).toContain('PASS'); // A012 verdict in header
    expect(card).toContain('── Contract'); // A013 inset rule section header
    expect(card.split('\n').find((l) => l.includes('── Contract'))).toContain('/'); // A014 ratio roll-up
    expect(card.split('\n').find((l) => l.includes('── Findings'))).toMatch(/debt|obs/); // A018 severity roll-up
    expect(card).toContain('cache'); // A021 cache column
    expect(card).toContain('out'); // A022 in/out columns
    expect(card).toMatch(/TOTAL.*table 2026-06-14/s); // A023 TOTAL + price-table version (sourced from the CostResult — AC6)
    expect(card).toContain('completeness'); // A024 completeness line
  });

  // @ana A015, A019, A020
  it('collapses passing assertions and points overflow to --json', () => {
    const card = formatHumanReadable(provenanceRich);
    expect(card).toContain('satisfied'); // A015 collapsed counted line
    const overflow = card.split('\n').find((l) => l.includes('more — see'))!;
    expect(overflow).toContain('--json'); // A019 actionable overflow
    expect(overflow).not.toContain('and'); // A020 never a bare "and N more"
  });

  // @ana A029
  it('renders the provenance-absent card (the default)', () => {
    const card = formatHumanReadable(provenanceAbsent);
    expect(card).toMatchSnapshot();
    expect(card).not.toContain('Provenance');
    expect(card).not.toContain(' · $'); // no dangling cost segment in the subtitle
  });

  // @ana A030, A025
  it('renders the ≥6-session card aligned within 80 columns', () => {
    const card = formatHumanReadable(manySessions);
    expect(card).toMatchSnapshot();
    expect(card).toContain('build 5'); // rework index for repeated build attempts
    expect(maxLineWidth(card)).toBeLessThanOrEqual(80);
  });

  // @ana A026
  it('renders an unpriced model as n/a, never $0.00', () => {
    const card = formatHumanReadable(unpricedModel);
    expect(card).toMatchSnapshot();
    expect(card).toContain('n/a');
    expect(card).not.toContain('$0.00');
    expect(card).toContain('unpriced'); // TOTAL suffix counts the unpriced session
    expect(maxLineWidth(card)).toBeLessThanOrEqual(80);
  });

  // @ana A016, A017, A031
  it('renders the FAIL/DEVIATED card with failures and deviation detail', () => {
    const card = formatHumanReadable(failDeviated);
    expect(card).toMatchSnapshot();
    expect(card).toContain('FAIL'); // verdict
    expect(card).toContain('Webhook signature is verified before processing'); // A016 UNSATISFIED says
    expect(card).toContain('Idempotency key is enforced on retried writes'); // A017 DEVIATED says
    expect(card).toContain('built with a 5-minute TTL instead of permanent dedup'); // A017 deviation detail
  });

  // @ana A026
  it('renders an all-unpriced run with an n/a TOTAL, never $0.00', () => {
    const card = formatHumanReadable(allUnpriced);
    expect(card).toMatchSnapshot();
    expect(card).not.toContain('$0.00'); // a paid run must never read as free
    expect(card).toContain('n/a');
    // The TOTAL line itself carries no dollar figure — it is "n/a".
    const total = card.split('\n').find((l) => l.includes('TOTAL'))!;
    expect(total).toContain('n/a');
    expect(total).not.toContain('$');
    expect(total).toContain('3 unpriced'); // every session counted as unpriced
    expect(maxLineWidth(card)).toBeLessThanOrEqual(80);
  });

  it('renders counts-unavailable and Codex (cache_create=0) sessions aligned', () => {
    const card = formatHumanReadable(mixedCounts);
    expect(card).toMatchSnapshot();
    expect(card).toContain('counts unavailable'); // the no-derived session is loud
    expect(card).toContain('600.0k'); // Codex cache column = 0 create + 600k read
    expect(maxLineWidth(card)).toBeLessThanOrEqual(80);
  });

  // @ana A025, A027
  it('stays within 80 columns and emits no ANSI escapes when color is stripped', () => {
    for (const fixture of [provenanceRich, provenanceAbsent, manySessions, unpricedModel, failDeviated, allUnpriced, mixedCounts]) {
      const card = formatHumanReadable(fixture);
      expect(maxLineWidth(card)).toBeLessThanOrEqual(80); // A025
      expect(/\x1b\[/.test(card)).toBe(false); // A027 layout never depends on ANSI
    }
  });
});
