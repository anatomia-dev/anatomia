/**
 * Display tests for the Session Attestation section (Phase 2, Step 3).
 *
 * Renders `formatHumanReadable` directly (color stripped) and asserts:
 *  - the section appears in the existing proof card with counts, coverage line,
 *    and abbreviated mandate/transcript hashes (AC9/A025);
 *  - a `violated` behavioral verdict is rendered but NEVER flips the PASS headline
 *    or `entry.result` (AC10/A024);
 *  - an incomplete-coverage record renders a loud warning (AC26/A026);
 *  - an entry with no compliance records renders no section (additive, backward
 *    compatible).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import chalk from 'chalk';
import { formatHumanReadable } from '../../src/commands/proof.js';
import type { ProofChainEntry, ComplianceAttestation } from '../../src/types/proof.js';

beforeAll(() => { chalk.level = 0; });
afterAll(() => { chalk.level = 0; });

/** A behavioral record with sensible defaults. */
function record(over: Partial<ComplianceAttestation> = {}): ComplianceAttestation {
  return {
    role: 'build',
    harness: 'claude',
    session_id: 'sess-1',
    captured_at: '2026-06-01T00:00:00.000Z',
    anatrace_core_version: '0.2.0',
    framework: 'anatomia',
    mandate_hash: 'sha256:1a2b3c4d5e6f7890abcdef',
    transcript_hash: 'sha256:9f8e7d6c5b4a3210fedcba',
    coverage: { total: 8, fully_checked: 5, unverifiable: 3 },
    complete: false,
    verdicts: [
      { claim_id: 'no-force-push', says: 'Never force-push', status: 'satisfied', reason: 'predicate-matched' },
      { claim_id: 'no-egress', says: 'No network egress', status: 'unverifiable', reason: 'delegate-coverage-incomplete' },
    ],
    ...over,
  };
}

/** Build a PASS proof chain entry with sensible defaults. */
function makeEntry(over: Partial<ProofChainEntry>): ProofChainEntry {
  return {
    slug: 'anatrace-core-integration',
    feature: 'Behavioral attestation',
    result: 'PASS',
    author: { name: 'Dev', email: 'dev@example.com' },
    contract: { total: 4, satisfied: 4, unsatisfied: 0, deviated: 0 },
    assertions: [{ id: 'A001', says: 'It works', status: 'SATISFIED' }],
    acceptance_criteria: { total: 4, met: 4 },
    timing: { total_minutes: 10, think: 1, plan: 2, build: 5, verify: 2 },
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

describe('Session Attestation section', () => {
  // @ana A025
  it('renders the section with counts, coverage line, and abbreviated hashes (AC9)', () => {
    const card = formatHumanReadable(makeEntry({ compliance: [record()] }));
    expect(card).toContain('Session Attestation');
    expect(card).toContain('1 transcript');
    expect(card).toContain('core v0.2.0');
    expect(card).toContain('framework anatomia');
    // counts line: 1 satisfied, 0 violated, 1 unverifiable
    expect(card).toContain('1 satisfied');
    expect(card).toContain('0 violated');
    expect(card).toContain('1 unverifiable');
    // coverage line from the record's coverage block
    expect(card).toContain('coverage 5/8 checked');
    // abbreviated hashes (never the full digest)
    expect(card).toContain('mandate sha256:1a2b3c…');
    expect(card).toContain('transcript sha256:9f8e7d…');
    expect(card).not.toContain('1a2b3c4d5e6f7890abcdef');
  });

  // @ana A024
  it('renders a violated verdict but never flips the PASS headline or result (AC10)', () => {
    const violated = record({
      complete: true,
      coverage: { total: 2, fully_checked: 2, unverifiable: 0 },
      verdicts: [
        { claim_id: 'no-force-push', says: 'Never force-push', status: 'violated', reason: 'predicate-not-matched' },
        { claim_id: 'stay-in-scope', says: 'Stay in file scope', status: 'satisfied', reason: 'predicate-matched' },
      ],
    });
    const entry = makeEntry({ result: 'PASS', compliance: [violated] });
    const card = formatHumanReadable(entry);

    // The violation IS rendered (evidence is visible)...
    expect(card).toContain('1 violated');
    expect(card).toContain('no-force-push');
    expect(card).toContain('violated (predicate-not-matched)');
    // ...but the headline result is untouched: PASS, never FAIL.
    expect(entry.result).toBe('PASS');
    expect(card).toContain('PASS');
    expect(card).not.toContain('FAIL');
  });

  // (Tag is from a prior feature's contract.) Assertion updated to the
  // verifier-verdict-honesty AC6 copy: the incomplete-coverage warning no longer
  // claims verdicts "never gate" unconditionally — it names the veto exception.
  it('renders a loud warning when a record has incomplete coverage (AC26)', () => {
    const card = formatHumanReadable(makeEntry({ compliance: [record({ complete: false })] }));
    expect(card).toContain('incomplete');
    expect(card).toMatch(/incomplete coverage — verdicts are non-gating evidence \(except the verify-independence veto below\)/);
  });

  it('renders no section when there are no compliance records (additive / backward compatible)', () => {
    const card = formatHumanReadable(makeEntry({}));
    expect(card).not.toContain('Session Attestation');
  });

  it('labels reworked roles with a stable index (build, build 2)', () => {
    const card = formatHumanReadable(makeEntry({
      compliance: [
        record({ role: 'build', session_id: 'b1', complete: true, coverage: { total: 1, fully_checked: 1, unverifiable: 0 }, verdicts: [] }),
        record({ role: 'build', session_id: 'b2', complete: true, coverage: { total: 1, fully_checked: 1, unverifiable: 0 }, verdicts: [] }),
      ],
    }));
    expect(card).toContain('2 transcripts');
    expect(card).toMatch(/build 2 ·/);
  });
});

describe('read-build-report veto status (Component 3)', () => {
  // @ana A031 — an APPLIED veto renders the override line + the forward-only honesty boundary.
  it('renders the APPLIED override line and the forward-only honesty boundary', () => {
    const card = formatHumanReadable(makeEntry({
      compliance: [record({ complete: true, coverage: { total: 2, fully_checked: 2, unverifiable: 0 } })],
      verdict_veto: { applied: true, reason: 'verify read build_report.md' },
    }));
    expect(card).toContain('verdict veto: APPLIED');
    expect(card).toContain('verify read build_report.md');
    // The forward-only honesty boundary states earlier verdicts were self-reported.
    expect(card).toContain('forward-only');
    expect(card).toContain('pre-veto verdicts were self-reported');
  });

  // @ana A031 — with no captured transcript the veto status is stated openly, never silent (AC4).
  it('renders "not applied — no captured transcript" with no compliance records', () => {
    const card = formatHumanReadable(makeEntry({
      verdict_veto: { applied: false, reason: 'no captured transcript' },
    }));
    // No transcripts → no full Session Attestation rollup, but the veto line still shows.
    expect(card).toContain('verdict veto: not applied — no captured transcript');
    expect(card).toContain('forward-only');
  });

  it('renders the honesty boundary exactly once even alongside records', () => {
    const card = formatHumanReadable(makeEntry({
      compliance: [record({ complete: true, coverage: { total: 1, fully_checked: 1, unverifiable: 0 }, verdicts: [] })],
      verdict_veto: { applied: false, reason: 'verify did not read build_report.md' },
    }));
    const occurrences = card.split('veto is forward-only').length - 1;
    expect(occurrences).toBe(1);
  });

  it('renders no veto line on a pre-veto entry (verdict_veto absent / backward compatible)', () => {
    const card = formatHumanReadable(makeEntry({}));
    expect(card).not.toContain('verdict veto');
    expect(card).not.toContain('forward-only');
  });
});
