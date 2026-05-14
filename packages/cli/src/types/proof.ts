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

/**
 * Proof chain JSON entry — one completed slug's verification record.
 *
 * CROSS-CUTTING: Adding a field requires changes in 4+ locations:
 *   1. Type definition below
 *   2. Default in generateProofSummary() (utils/proofSummary.ts)
 *   3. Entry construction in writeProofChain() (commands/work.ts)
 *   4. Display in formatHumanReadable() or formatListTable() (commands/proof.ts)
 * Old entries in proof_chain.json may lack new fields — consumers must handle undefined.
 */
/**
 * Proof chain JSON structure — the top-level container.
 */
export interface ProofChain {
  schema?: number;
  entries: ProofChainEntry[];
}

/**
 * Health stats returned by writeProofChain.
 */
export interface ProofChainStats {
  runs: number;
  findings: number;
  active: number;
  lessons: number;
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
  findings: Array<{
    id: string;
    category: 'code' | 'test' | 'upstream';
    summary: string;
    file: string | null;
    anchor: string | null;
    line?: number; // Display only. NOT used for matching or staleness.
    severity?: 'risk' | 'debt' | 'observation';
    suggested_action?: 'promote' | 'scope' | 'monitor' | 'accept';
    related_assertions?: string[];
    status?: 'active' | 'lesson' | 'promoted' | 'closed';
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
    suggested_action?: 'promote' | 'scope' | 'monitor' | 'accept';
  }>;
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
