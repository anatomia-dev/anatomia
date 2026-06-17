/**
 * Contract types (clear-the-deck).
 *
 * Single source of truth for contract structures used by artifact.ts
 * and verify.ts. Extracted from duplicate local interfaces where
 * artifact.ts had `id?: string` (lied) while verify.ts had `id: string`
 * (truth). Runtime validation at artifact.ts line 367 enforces id as
 * required — the type now agrees.
 */

/**
 * Contract assertion from YAML
 */
export interface ContractAssertion {
  id: string;
  says: string;
  block?: string;
  target?: string;
  matcher?: string;
  value?: unknown;
  /**
   * Scope acceptance-criterion id(s) this assertion covers (e.g. "AC1" or
   * ["AC1", "AC2"]). Additive and optional: legacy contracts omit it and the
   * coverage gate stays inactive for them. The coverage gate joins on this
   * field to prove every scope AC is mechanically pinned.
   */
  ac?: string | string[];
}

/**
 * A deliberate excusal of a scope acceptance criterion from needing a linked
 * assertion. Models BOTH "judgment-only" (untestable by nature) and "retired"
 * (deliberately removed) as one concept — an AC excused with a stated reason.
 *
 * This consciously supersedes the scope's literal `judgment_only: string[]`
 * shape. A bare id array carries no justification, so over-marking would be
 * invisible; requiring a `reason` for every waiver forces the planner to state
 * intent, which is what makes the anti-silent-abuse protection real. `kind` is
 * preserved so a later proof card can separate judgment-verified ACs from
 * retired ones. Do NOT "simplify" this back to a bare string array.
 */
export interface CoverageWaiver {
  /** The scope AC id being waived (e.g. "AC3"). */
  ac: string;
  /** Why the AC is excused: judgment-only (untestable) or deliberately retired. */
  kind: 'judgment' | 'retired';
  /** Required for both kinds — the stated justification. */
  reason: string;
}

/**
 * Contract file change structure
 */
export interface ContractFileChange {
  path?: string;
  action?: string;
}

/**
 * Contract schema structure
 */
export interface ContractSchema {
  version?: string;
  sealed_by?: string;
  feature?: string;
  assertions?: ContractAssertion[];
  file_changes?: ContractFileChange[];
  /**
   * Acceptance criteria deliberately excused from needing a linked assertion.
   * Additive and optional. See {@link CoverageWaiver} for why this unified
   * shape supersedes the scope's literal `judgment_only: string[]`.
   */
  coverage_waivers?: CoverageWaiver[];
}
