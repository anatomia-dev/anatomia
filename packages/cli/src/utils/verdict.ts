/**
 * The single source of verdict truth for verify reports.
 *
 * The headline `**Result:** PASS|FAIL` line is self-authored: the verify model
 * types it. Collapsing the ≥6 duplicated scrapes into one function lets the
 * verdict do one thing none of the copies did — cross-check the headline against
 * the verifier's own `## Contract Compliance` table and coerce a contradicted
 * PASS to FAIL.
 *
 * HONESTY BOUNDARY (do not soften): this makes the verdict **not
 * one-word-forgeable** — a one-word "PASS" that contradicts the agent's own
 * UNSATISFIED row no longer passes. It does NOT make the verdict un-lie-able: a
 * verifier that fills the compliance table dishonestly still passes. The verdict
 * is still **self-authored**. (Deliberately not claiming the agent is unable to
 * lie — that would be an over-claim.)
 */

import { parseComplianceTable } from './proofSummary.js';
import type { ComplianceAttestation } from '../types/proof.js';

/**
 * The single allowlisted claim the read-build-report veto gates on.
 *
 * Engine-OWNED: `anatrace-core`'s `anatomiaAdapter` derives this id from the
 * `ana-verify` agent-def's build-report prohibition. Verified empirically against
 * anatrace-core@0.4.0 (`anatomiaAdapter.extract()` + `runCompliance()`): the id is
 * stable across `verifier-verdict-honesty` Spec 1's de-contradiction edit, and a
 * verify session that `Read`s `build_report.md` yields
 * `{ status: 'violated', reason: 'predicate-not-matched', source: 'deterministic' }`.
 * If a future anatrace bump changes the id, this constant must move with it.
 */
export const VERIFY_INDEPENDENCE_CLAIM_ID = 'ana-verify:verify-independence';

/**
 * The outcome of the deterministic read-build-report veto (Component 3).
 */
export interface ReadBuildReportVeto {
  /** `true` iff a verify session deterministically read the build report — force-FAIL the proof. */
  applied: boolean;
  /** Why the veto did or did not fire (always stated — the absence of a veto is never silent). */
  reason?: string;
}

/**
 * Decide whether the deterministic read-build-report veto fires for a sealed proof.
 *
 * TRUST-THE-BYTES: a verify session that deterministically read `build_report.md`
 * force-FAILs the proof regardless of its self-authored PASS headline. This is the
 * ONE behavioral verdict that gates — every other verdict stays non-gating
 * evidence. The veto fires iff some attached record satisfies ALL FOUR conditions:
 *   1. `role === 'verify'`
 *   2. a verdict with `claim_id === VERIFY_INDEPENDENCE_CLAIM_ID`
 *   3. that verdict's `status === 'violated'`
 *   4. that verdict's `source === 'deterministic'`
 *
 * Forward-only and fail-open-but-surfaced: gating keys on `source` (stable), never
 * on the drift-prone `reason`. An absent `source` (pre-Component-3 records) is
 * treated as non-deterministic, so old records never retroactively gate. With NO
 * captured records at all, the veto does not fire but says so openly
 * (`'no captured transcript'`) — never a silent skip. Pure: records in → decision
 * out, no I/O.
 *
 * @param compliance - The behavioral attestations assembled for the work item (may be empty)
 * @returns Whether the veto applies, with a human-readable reason either way
 */
export function evaluateReadBuildReportVeto(
  compliance: ComplianceAttestation[],
): ReadBuildReportVeto {
  if (compliance.length === 0) {
    return { applied: false, reason: 'no captured transcript' };
  }

  for (const record of compliance) {
    if (record.role !== 'verify') continue;
    for (const verdict of record.verdicts) {
      if (
        verdict.claim_id === VERIFY_INDEPENDENCE_CLAIM_ID &&
        verdict.status === 'violated' &&
        verdict.source === 'deterministic'
      ) {
        return { applied: true, reason: 'verify read build_report.md' };
      }
    }
  }

  return { applied: false, reason: 'verify did not read build_report.md' };
}

/**
 * The one regex that scrapes the `**Result:**` headline. Every consumer imports
 * this constant rather than redeclaring it, which kills regex drift across the
 * former six scrape sites. No `g` flag — `.test()`/`.match()` stay stateless and
 * safe to share.
 */
export const RESULT_HEADLINE_PATTERN = /\*\*Result:\*\*\s*(PASS|FAIL)/i;

/**
 * The result of deriving a verdict from a verify report's content.
 */
export interface VerdictResult {
  /**
   * The effective verdict, post-coercion — what every consumer should use. A PASS
   * headline that contradicts an UNSATISFIED compliance row becomes `'FAIL'`.
   */
  result: 'PASS' | 'FAIL' | 'UNKNOWN';
  /** The raw scraped `**Result:**` line, before any coercion. */
  headline: 'PASS' | 'FAIL' | 'UNKNOWN';
  /**
   * Human-readable reasons; non-empty iff a PASS headline was coerced to FAIL.
   * One entry per offending UNSATISFIED row.
   */
  contradictions: string[];
}

/**
 * Derive the effective verdict from a verify report's markdown content.
 *
 * Content-only: takes the report string and nothing else (no companion-file
 * reads), so every call site — including the file-only ones — can use it
 * uniformly. The contradiction signal is the UNSATISFIED compliance-table row,
 * and ONLY that. Findings (`severity: risk`) live in the companion
 * `verify_data.yaml`, not the report markdown, so they are unreachable here — and
 * risk findings do not block a PASS anyway; only UNSATISFIED assertions do.
 * Keying on findings would manufacture false FAILs.
 *
 * @param content - Verify report markdown content
 * @returns The effective verdict, the raw headline, and any contradiction reasons
 */
export function deriveVerdict(content: string): VerdictResult {
  const match = content.match(RESULT_HEADLINE_PATTERN);
  const headline: VerdictResult['headline'] =
    match && match[1] ? (match[1].toUpperCase() as 'PASS' | 'FAIL') : 'UNKNOWN';

  // Only a PASS headline can be contradicted. FAIL and UNKNOWN pass through.
  if (headline !== 'PASS') {
    return { result: headline, headline, contradictions: [] };
  }

  const contradictions: string[] = [];
  for (const row of parseComplianceTable(content)) {
    if (row.status === 'UNSATISFIED') {
      contradictions.push(`PASS headline contradicts UNSATISFIED row ${row.id}`);
    }
  }

  if (contradictions.length > 0) {
    return { result: 'FAIL', headline, contradictions };
  }

  return { result: 'PASS', headline, contradictions: [] };
}
