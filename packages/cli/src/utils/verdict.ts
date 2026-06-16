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
