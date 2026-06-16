/**
 * Proof chain types.
 *
 * Extracted from commands/work.ts so proof.ts can import without a
 * cross-command dependency. The types are pure — they reference
 * ProofSummary from utils/proofSummary.js for sub-field types, but
 * that's a clean utils → types → commands layering (commands depend
 * on both utils and types, neither depends on commands).
 */

import type { ProofSummary } from '../utils/proofSummary.js';
import type { ProvenanceCounts } from '../utils/forensics.js';

/**
 * Provenance for ONE agent session that worked on a work item (Phase 2).
 *
 * Provenance ONLY — identity + deterministic derived counts. One of these exists
 * per matching session (plan, build, every build rework cycle, verify), so the
 * per-role dataset is preserved rather than collapsed to a single session.
 */
export interface SessionProvenance {
  /** Pipeline role (`plan` | `build` | `verify` | …). */
  role: string;
  /** Harness the session ran on (`claude` | `codex`). */
  harness: string;
  /** The model that ran the session. */
  model: string;
  /** sha256 of the resolved agent-def file at spawn time. */
  agent_def_hash: string;
  /** CLI version that spawned the agent. */
  cli_version: string;
  /** Harness session id. */
  session_id: string;
  /**
   * ISO-8601 wall-clock timestamp at which this session's provenance was captured
   * (carried from the SessionStart pending pointer; falls back to save-time when
   * no pointer is present). This is capture metadata and the PRIMARY assembly
   * sort key — NOT part of the deterministic transcript derive.
   */
  captured_at: string;
  /**
   * sha256 of the transcript bytes this session's counts were derived from,
   * prefixed `sha256:`. A byte-identity ATTESTATION ONLY — it fingerprints the
   * exact bytes seen at capture so a record can be checked against a retained
   * transcript. It does NOT imply the provenance can be regenerated without those
   * retained bytes (the transcript is not committed). Capture metadata on the
   * wrapper, not part of the deterministic derive. Present iff the transcript was
   * readable at capture — OMITTED (alongside `derived`) when it was not.
   */
  transcript_hash?: string;
  /**
   * Deterministic provenance counts for this session, derived from the committed
   * transcript at `ana artifact save` time. OMITTED when the transcript was
   * unreadable at capture (e.g. a dangling path) — the session row is still kept
   * with its identity metadata so it stays visible in the dataset, just without
   * counts.
   */
  derived?: ProvenanceCounts;
}

/**
 * Session provenance attached to a completed proof entry (Phase 2).
 *
 * Provenance ONLY — counts, cost, tokens, model, outcome joins, churn. This is
 * deliberately NOT the rule engine: no findings, no verdicts, no scoring. Every
 * field is a recomputable fact derived from the session transcripts and the
 * already-assembled proof object. Attached optionally and never gating (see
 * {@link ProofChainEntry.process}).
 *
 * Carries ALL of the work item's matching sessions in {@link sessions} (one
 * {@link SessionProvenance} each), with work-item-level joins (`outcome`,
 * `task_shape`, `module_churn`) recorded once.
 */
export interface ProcessAttestation {
  /** Outcome joins read off the proof object being assembled (work-item level). */
  outcome: {
    /** True when verification passed with zero rejection cycles. */
    first_pass_verify: boolean;
    /** Contract assertions satisfied. */
    assertions_satisfied: number;
    /** Total contract assertions. */
    assertions_total: number;
    /** New findings bucketed by severity. */
    findings: { risk: number; debt: number; observation: number };
  };
  /** Task shape — size/kind/multi_phase, from scope.md + plan.md + proof.kind. */
  task_shape: {
    /** Complexity size from scope.md (`small` | `medium` | `large` | ''). */
    size: string;
    /** Work kind from the proof (`feature` | `fix` | `chore` | `milestone` | ''). */
    kind: string;
    /** Whether this work item has more than one phase. */
    multi_phase: boolean;
  };
  /** Per-file added/deleted churn read from `.saves.json` (work-item level). */
  module_churn: Record<string, { added: number; deleted: number }>;
  /**
   * Presence-floor completeness verdict (Phase 2). REQUIRED whenever capture is on
   * — it is always computed (even with zero sessions → all-gaps), so an incomplete
   * cross-machine record is loud rather than silently hidden (Verified-over-trusted).
   *
   * The verdict is a pure function of committed state: `expected` is tied to the
   * count of saved `build_report*.md` / `verify_report*.md` files (never
   * `rejection_cycles`, which would false-fail legitimate rework), `present` counts
   * the committed sessions by role, and `gaps` names every shortfall. `ana`/`learn`
   * roles are never required and never produce a gap. NEVER influences PASS/FAIL.
   */
  completeness: {
    /** True when no bucket is short (`gaps.length === 0`). */
    complete: boolean;
    /** Expected sessions per pipeline role (plan = 1; build/verify = saved report count). */
    expected: { plan: number; build: number; verify: number };
    /** Sessions actually present per role, counted from the committed provenance. */
    present: { plan: number; build: number; verify: number };
    /** One human-readable string per shortfall, e.g. `"verify: 0 of 1 expected session(s) present"`. */
    gaps: string[];
  };
  /**
   * Every committed provenance session for this work item — one per role/attempt,
   * deterministically ordered (by `captured_at`, then role). Repeated build
   * attempts from rejection cycles are kept: that rework is wanted data.
   */
  sessions: SessionProvenance[];
}

/**
 * The closed set of behavioral verdict reasons the `anatrace-core` engine emits,
 * locked to the installed 0.4.0 engine. SINGLE SOURCE OF TRUTH — the
 * {@link VerdictReason} type and the {@link isVerdictReason} guard are both derived
 * from this one list so the set can never drift between the type and the runtime
 * check.
 *
 * Lives in this otherwise types-only module ON PURPOSE: defining the value here
 * (rather than in `compliance.ts`) keeps it next to {@link VerdictReason}, avoids
 * duplicating the member list across two files, and avoids a circular import
 * (`compliance.ts` imports from `proof.ts`, never the reverse). The 0.4.0 delta vs
 * 0.2.0 is purely additive (3 added, none removed/renamed), so narrowing the
 * record field to this set cannot reject a reason a stored 0.2.0-era record carries.
 */
export const VERDICT_REASONS = [
  'predicate-matched',
  'predicate-not-matched',
  'routed-to-llm',
  'runtime-scoped',
  'low-confidence',
  'absent-signal',
  'content-unresolvable',
  'command-unresolvable',
  'codex-blind',
  'subject-unresolvable',
  'delegate-coverage-incomplete',
  'channel-coverage-incomplete',
  'window-unresolvable',
  'harness-version-unrecognized',
  'session-parse-suspect',
] as const;

/**
 * A verdict reason the installed 0.4.0 engine is known to produce — the closed
 * union derived from {@link VERDICT_REASONS} (no duplicated member list).
 */
export type VerdictReason = (typeof VERDICT_REASONS)[number];

/** O(1) membership set backing {@link isVerdictReason}. */
const VERDICT_REASON_SET: ReadonlySet<string> = new Set(VERDICT_REASONS);

/**
 * Membership guard for the closed verdict-reason set.
 *
 * @param r - The reason string to test (typically a live engine verdict reason)
 * @returns `true` (narrowing `r` to {@link VerdictReason}) iff `r` is in {@link VERDICT_REASONS}
 */
export function isVerdictReason(r: string): r is VerdictReason {
  return VERDICT_REASON_SET.has(r);
}

/**
 * One behavioral verdict in a committed {@link ComplianceAttestation} (Phase 2).
 *
 * COMPACT + SCRUBBED — the durable, Anatomia-owned projection of a core
 * `ComplianceVerdict`. It deliberately stores only the claim id, its `says`, the
 * status, and the reason: NEVER copied transcript bytes. (Core verdict evidence
 * is byte POINTERS, never excerpts — and the whole record passes `scrubDeep`
 * before write, so an egress command carrying a token never lands in committed
 * git history.) Snake_case to match the on-disk record, distinct from core's
 * camelCase runtime shape so the engine can evolve without breaking stored proof.
 */
export interface ComplianceVerdictRecord {
  /** Stable claim id — the join key to the mandate/proof chain. */
  claim_id: string;
  /** Human-readable obligation, verbatim from the mandate. */
  says: string;
  /** Behavioral verdict: `satisfied` | `violated` | `unverifiable`. EVIDENCE ONLY — never gates. */
  status: 'satisfied' | 'violated' | 'unverifiable';
  /**
   * Coverage-aware verdict reason (subject/context-dependent, e.g. `codex-blind`).
   * Locked to the closed {@link VerdictReason} set, while `(string & {})` keeps the
   * field forward-compatible: a reason from a FUTURE engine is still legally stored
   * verbatim (recorded + warned, never dropped) without a cast or data loss.
   */
  reason: VerdictReason | (string & {});
}

/**
 * Behavioral attestation for ONE agent transcript (Phase 2).
 *
 * The deterministic, coverage-aware verdict of HOW a session behaved, produced at
 * `ana artifact save` by {@link captureComplianceAtSave} and committed as
 * `.ana/plans/active/{slug}/compliance/{role}-{session_id}.json`. One record per
 * transcript — keyed `{role}-{session_id}` exactly like provenance — so plan,
 * build, every build-rework attempt, and verify each keep their own record;
 * rework is never collapsed.
 *
 * EVIDENCE, NEVER A GATE — a `violated` verdict is recorded and rendered but never
 * changes a proof's PASS/FAIL. Mirrors {@link ProcessAttestation}'s decoupling.
 */
export interface ComplianceAttestation {
  /** Pipeline role (`plan` | `build` | `verify` | …). */
  role: string;
  /** Harness the session ran on (`claude` | `codex`). */
  harness: string;
  /** Harness session id — ties the record to the session that produced it. */
  session_id: string;
  /** ISO-8601 wall-clock capture timestamp (carried from the pending pointer when present). */
  captured_at: string;
  /** The anatrace-core version that judged this session (read from core's package.json, never hardcoded). */
  anatrace_core_version: string;
  /** The mandate framework that judged it (e.g. `anatomia`). */
  framework: string;
  /** sha256 of the mandate (agent-def + contract) bytes, prefixed `sha256:`. Byte-identity attestation only. */
  mandate_hash: string;
  /** sha256 of the transcript bytes the verdicts were derived from, prefixed `sha256:`. Byte-identity attestation only. */
  transcript_hash: string;
  /** How much of the session could actually be checked. */
  coverage: {
    /** Total declared obligations (claims). */
    total: number;
    /** Claims mechanically checked against the captured transcript. */
    fully_checked: number;
    /** Claims that could not be verified (coverage-aware). */
    unverifiable: number;
  };
  /** True when every claim was fully checked (`unverifiable === 0`). Renders a loud warning when false. */
  complete: boolean;
  /** The per-claim behavioral verdicts (compact, scrubbed). */
  verdicts: ComplianceVerdictRecord[];
}

/**
 * Proof chain JSON entry — one completed slug's verification record.
 *
 * CROSS-CUTTING: Adding a field requires changes in 4+ locations:
 *   1. Type definition below
 *   2. Default in generateProofSummary() (utils/proofSummary.ts)
 *   3. Entry construction in writeProofChain() (commands/work-proof.ts)
 *   4. Display in formatHumanReadable() or formatListTable() (commands/proof.ts)
 * Old entries in proof_chain.json may lack new fields — consumers must handle undefined.
 */
/**
 * Proof chain JSON structure — the top-level container.
 */
export interface ProofChain {
  schema?: number;
  migrations?: Record<string, boolean>;
  entries: ProofChainEntry[];
}

/**
 * Health stats returned by writeProofChain.
 */
export interface ProofChainStats {
  runs: number;
  findings: number;
  active: number;

  promoted: number;
  closed: number;
  newFindings: number;
  maintenance?: {
    auto_closed: number;
  };
}

export interface ProofChainEntry {
  slug: string;
  feature: string;
  result: 'PASS' | 'FAIL' | 'UNKNOWN';
  author: { name: string; email: string };
  contract: ProofSummary['contract'];
  assertions: Array<{
    id: string;
    says: string;
    status: 'SATISFIED' | 'UNSATISFIED' | 'DEVIATED' | 'UNCOVERED' | 'UNVERIFIED';
    deviation?: string;
  }>;
  acceptance_criteria: ProofSummary['acceptance_criteria'];
  timing: ProofSummary['timing'];
  hashes: Record<string, string>;
  completed_at: string;
  // Intelligence capture
  modules_touched: string[];
  scope_summary?: string | undefined;
  kind?: 'feature' | 'fix' | 'chore' | 'milestone' | undefined;
  surface?: string | undefined;
  findings: Array<{
    id: string;
    category: 'code' | 'test' | 'upstream';
    summary: string;
    file: string | null;
    anchor: string | null;
    line?: number; // Display only. NOT used for matching or staleness.
    severity?: 'risk' | 'debt' | 'observation';
    suggested_action?: 'promote' | 'scope' | 'monitor' | 'acknowledge';
    related_assertions?: string[];
    resolves?: string[];
    status?: 'active' | 'promoted' | 'closed';
    closed_reason?: string;
    closed_at?: string;
    closed_by?: 'mechanical' | 'human' | 'agent';
    promoted_to?: string;
  }>;
  rejection_cycles: number;
  previous_failures: Array<{ id: string; summary: string }>;
  build_concerns: Array<{
    summary: string;
    file: string | null;
    severity?: 'risk' | 'debt' | 'observation';
    suggested_action?: 'promote' | 'scope' | 'monitor' | 'acknowledge';
  }>;
  commit_hygiene?: Array<{
    check: string;
    file: string;
    severity: string;
    message: string;
  }>;
  /**
   * Optional session provenance, attached at `ana work complete` when process
   * capture is on and a matching session buffer record is found. OPTIONAL by
   * construction — proof integrity never depends on it; a proof with this field
   * absent is complete and valid. Mirrors `commit_hygiene`'s decoupling.
   */
  process?: ProcessAttestation;
  /**
   * Optional behavioral attestations — one per agent transcript — assembled at
   * `ana work complete` when process capture is on and committed `compliance/*.json`
   * records exist. OPTIONAL by construction: proof integrity never depends on it; a
   * proof with this field absent is complete and valid, and pre-existing entries
   * remain valid. EVIDENCE, NEVER A GATE — a `violated` verdict here never changes
   * `result`. Mirrors {@link process}'s decoupling.
   */
  compliance?: ComplianceAttestation[];
  phases?: number;
  worktree?: {
    used: boolean;
    created_at: string | null;
    completed_at: string;
    commit_count: number;
    base_commit?: string;
  };
}

/**
 * Trajectory data — risks per run analysis.
 */
export interface TrajectoryData {
  risks_per_run_last5: number | null;
  risks_per_run_all: number | null;
  trend: 'improving' | 'worsening' | 'stable' | 'insufficient_data' | 'no_classified_data';
  unclassified_count: number;
}

/**
 * Hot module — file with recurring findings across entries.
 */
export interface HotModule {
  file: string;
  finding_count: number;
  entry_count: number;
  by_severity: {
    risk: number;
    debt: number;
    observation: number;
    unclassified: number;
  };
}

/**
 * Promotion candidate — finding eligible for promotion to a skill rule.
 */
export interface PromotionCandidate {
  id: string;
  severity: string;
  suggested_action: string;
  summary: string;
  file: string | null;
  entry_slug: string;
  recurrence_count?: number;
}

/**
 * Promotion effectiveness — tracks whether a promoted finding reduced recurrence.
 */
export interface PromotionEffectiveness {
  id: string;
  summary: string;
  severity: string;
  category: string;
  file: string | null;
  promoted_to: string | null;
  subsequent_entries: number;
  status: 'tracking' | 'effective' | 'ineffective';
  reduction_pct: number | null;
  match_criteria: {
    severity: string;
    category: string;
    file: string | null;
  };
}

/**
 * Health report — analysis layer over the proof chain.
 *
 * Separate from ChainHealth (which counts what exists).
 * HealthReport analyzes what's trending, what's hot, and what's actionable.
 */
/**
 * Verification stats — first-pass rate and total issues caught.
 */
export interface VerificationStats {
  first_pass_count: number;
  total_runs: number;
  first_pass_pct: number;
  total_caught: number;
}

/**
 * Pipeline timing stats — median total and per-phase breakdown.
 */
export interface PipelineStats {
  median_total: number;
  median_scope: number | null;
  median_plan: number | null;
  median_build: number | null;
  median_verify: number | null;
  entries_with_timing: number;
}

export interface HealthReport {
  runs: number;
  trajectory: TrajectoryData;
  hot_modules: HotModule[];
  promotion_candidates: PromotionCandidate[];
  promotions: PromotionEffectiveness[];
  verification?: VerificationStats | undefined;
  pipeline?: PipelineStats | undefined;
}

/**
 * Health change detection — compares two health snapshots.
 */
export interface HealthChange {
  changed: boolean;
  trajectory: TrajectoryData;
  triggers: Array<'trend_improved' | 'trend_worsened' | 'new_hot_module' | 'new_candidates'>;
  details: string[];
}

/**
 * A finding with staleness signals — its file was modified by subsequent pipeline runs.
 */
export interface StaleFinding {
  id: string;
  category: string;
  summary: string;
  file: string;
  severity: string;
  entry_slug: string;
  completed_at: string;
  subsequent_slugs: string[];
  subsequent_count: number;
  confidence: 'high' | 'medium';
}

/**
 * Result of staleness analysis across the proof chain.
 */
export interface StalenessResult {
  total_stale: number;
  high_confidence: StaleFinding[];
  medium_confidence: StaleFinding[];
  filter: string | null;
}
