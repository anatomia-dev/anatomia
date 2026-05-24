/**
 * Proof chain health computation functions.
 *
 * Leaf module — no dependencies on other proof modules.
 * Health analysis, staleness detection, and resolution claim computation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { globSync } from 'glob';
import type {
  HealthReport,
  TrajectoryData,
  HotModule,
  PromotionCandidate,
  PromotionEffectiveness,
  VerificationStats,
  PipelineStats,
  HealthChange,
  StalenessResult,
  StaleFinding,
} from '../types/proof.js';

/**
 * Chain health counts for JSON meta fields.
 */
export interface ChainHealth {
  chain_runs: number;
  findings: {
    active: number;
    closed: number;
    promoted: number;
    total: number;
    by_severity: {
      risk: number;
      debt: number;
      observation: number;
      unclassified: number;
    };
    by_action: {
      promote: number;
      scope: number;
      monitor: number;
      accept: number;
      unclassified: number;
    };
  };
}

/**
 * A resolution claim — an upstream finding claiming to resolve an earlier finding.
 */
export interface ResolutionClaim {
  /** ID of the upstream finding making the claim (e.g., "slug-B-C3") */
  upstream_id: string;
  /** Summary of the upstream finding */
  upstream_summary: string;
  /** Slug of the entry containing the upstream finding */
  upstream_slug: string;
  /** ID of the referenced (original) finding being claimed as resolved */
  referenced_id: string;
  /** Summary of the referenced finding */
  referenced_summary: string;
  /** Current status of the referenced finding */
  referenced_status: string;
  /** File associated with the referenced finding */
  referenced_file: string | null;
  /** Severity of the referenced finding */
  referenced_severity: string;
}

/**
 * Result of resolution claims analysis.
 */
export interface ResolutionClaimsResult {
  claims: ResolutionClaim[];
}

// ─── Health Report Constants ─────────────────────────────────────────
/** Minimum active findings for a module to be "hot" */
export const MIN_FINDINGS_HOT = 3;
/** Minimum distinct entries for a module to be "hot" */
export const MIN_ENTRIES_HOT = 2;
/** Number of recent entries for trajectory window */
export const TRAJECTORY_WINDOW = 5;
/** Minimum entries before trend can be computed */
export const MIN_ENTRIES_FOR_TREND = 10;
/** Minimum subsequent entries before promotion effectiveness is computed */
const MIN_ENTRIES_FOR_EFFECTIVENESS = 5;

/**
 * Compute health report from a parsed proof chain.
 *
 * Pure synchronous function — caller handles file I/O.
 * Analyzes trajectory, hot modules, promotion candidates, and promotion effectiveness.
 *
 * @param chain - Parsed proof chain (must have `entries` array)
 * @param chain.entries - Array of proof chain entries with findings
 * @returns HealthReport with trajectory, hot modules, promotion candidates, and effectiveness
 */
export function computeHealthReport(chain: {
  entries: Array<{
    slug?: string;
    rejection_cycles?: number;
    previous_failures?: Array<{ id: string; summary: string }>;
    timing?: {
      total_minutes?: number;
      think?: number;
      plan?: number;
      build?: number;
      verify?: number;
      scope?: number;
    };
    findings?: Array<{
      id?: string;
      status?: string;
      severity?: string;
      category?: string;
      suggested_action?: string;
      summary?: string;
      file?: string | null;
      promoted_to?: string;
    }>;
  }>;
}): HealthReport {
  const runs = chain.entries.length;

  if (runs === 0) {
    return {
      runs: 0,
      trajectory: {
        risks_per_run_last5: null,
        risks_per_run_all: null,
        trend: 'insufficient_data',
        unclassified_count: 0,
      },
      hot_modules: [],
      promotion_candidates: [],
      promotions: [],
    };
  }

  // ─── Trajectory ──────────────────────────────────────────────────
  let totalUnclassified = 0;
  const riskCounts: number[] = [];
  let hasClassifiedData = false;

  for (const entry of chain.entries) {
    let entryRisks = 0;
    let entryHasClassified = false;
    for (const f of entry.findings || []) {
      if (!f.severity) {
        totalUnclassified++;
        continue;
      }
      hasClassifiedData = true;
      entryHasClassified = true;
      if (f.severity === 'risk') {
        entryRisks++;
      }
    }
    if (entryHasClassified) {
      riskCounts.push(entryRisks);
    }
  }

  let risksPerRunAll: number | null = null;
  let risksPerRunLast5: number | null = null;
  let trend: TrajectoryData['trend'] = 'insufficient_data';

  if (!hasClassifiedData && totalUnclassified > 0) {
    trend = 'no_classified_data';
  } else if (hasClassifiedData) {
    const sum = riskCounts.reduce((a, b) => a + b, 0);
    risksPerRunAll = Math.round((sum / riskCounts.length) * 10) / 10;

    const window = riskCounts.slice(-TRAJECTORY_WINDOW);
    const windowSum = window.reduce((a, b) => a + b, 0);
    risksPerRunLast5 = Math.round((windowSum / window.length) * 10) / 10;

    if (riskCounts.length < MIN_ENTRIES_FOR_TREND) {
      trend = 'insufficient_data';
    } else {
      // Compare first half vs second half
      const half = Math.floor(riskCounts.length / 2);
      const firstHalf = riskCounts.slice(0, half);
      const secondHalf = riskCounts.slice(half);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (secondAvg < firstAvg) {
        trend = 'improving';
      } else if (secondAvg > firstAvg) {
        trend = 'worsening';
      } else {
        trend = 'stable';
      }
    }
  }

  const trajectory: TrajectoryData = {
    risks_per_run_last5: risksPerRunLast5,
    risks_per_run_all: risksPerRunAll,
    trend,
    unclassified_count: totalUnclassified,
  };

  // ─── Hot Modules ─────────────────────────────────────────────────
  const moduleMap = new Map<string, {
    findings: number;
    entries: Set<number>;
    risk: number;
    debt: number;
    observation: number;
    unclassified: number;
  }>();

  for (let i = 0; i < chain.entries.length; i++) {
    const entry = chain.entries[i]!;
    for (const f of entry.findings || []) {
      // Only count active findings
      if (f.status && f.status !== 'active') continue;
      if (!f.file) continue;

      let mod = moduleMap.get(f.file);
      if (!mod) {
        mod = { findings: 0, entries: new Set(), risk: 0, debt: 0, observation: 0, unclassified: 0 };
        moduleMap.set(f.file, mod);
      }
      mod.findings++;
      mod.entries.add(i);
      switch (f.severity) {
        case 'risk': mod.risk++; break;
        case 'debt': mod.debt++; break;
        case 'observation': mod.observation++; break;
        default: mod.unclassified++; break;
      }
    }
  }

  const hotModules: HotModule[] = [];
  for (const [file, data] of moduleMap) {
    if (data.findings >= MIN_FINDINGS_HOT && data.entries.size >= MIN_ENTRIES_HOT) {
      hotModules.push({
        file,
        finding_count: data.findings,
        entry_count: data.entries.size,
        by_severity: {
          risk: data.risk,
          debt: data.debt,
          observation: data.observation,
          unclassified: data.unclassified,
        },
      });
    }
  }

  // Sort by finding count descending, cap at 5
  hotModules.sort((a, b) => b.finding_count - a.finding_count);
  const topHotModules = hotModules.slice(0, 5);

  // ─── Promotion Candidates ───────────────────────────────────────
  const candidates: PromotionCandidate[] = [];
  // Track scope findings by (severity + category + file) for recurrence detection
  const scopeRecurrence = new Map<string, { count: number; finding: { id: string; severity: string; suggested_action: string; summary: string; file: string | null; entry_slug: string } }>();

  for (const entry of chain.entries) {
    for (const f of entry.findings || []) {
      if (f.status && f.status !== 'active') continue;

      if (f.suggested_action === 'promote') {
        candidates.push({
          id: f.id || 'unknown',
          severity: f.severity || 'unclassified',
          suggested_action: 'promote',
          summary: f.summary || '',
          file: f.file ?? null,
          entry_slug: entry.slug || '',
        });
      } else if (f.suggested_action === 'scope') {
        const key = `${f.severity || ''}:${f.category || ''}:${f.file || ''}`;
        const existing = scopeRecurrence.get(key);
        if (existing) {
          existing.count++;
          // Update to latest entry
          existing.finding = {
            id: f.id || 'unknown',
            severity: f.severity || 'unclassified',
            suggested_action: 'scope',
            summary: f.summary || '',
            file: f.file ?? null,
            entry_slug: entry.slug || '',
          };
        } else {
          scopeRecurrence.set(key, {
            count: 1,
            finding: {
              id: f.id || 'unknown',
              severity: f.severity || 'unclassified',
              suggested_action: 'scope',
              summary: f.summary || '',
              file: f.file ?? null,
              entry_slug: entry.slug || '',
            },
          });
        }
      }
    }
  }

  // Add recurring scope findings (2+ entries)
  for (const [, data] of scopeRecurrence) {
    if (data.count >= 2) {
      candidates.push({
        ...data.finding,
        recurrence_count: data.count,
      });
    }
  }

  // ─── Promotion Effectiveness ─────────────────────────────────────
  const promotions: PromotionEffectiveness[] = [];

  for (let i = 0; i < chain.entries.length; i++) {
    const entry = chain.entries[i]!;
    for (const f of entry.findings || []) {
      if (f.status !== 'promoted') continue;

      const severity = f.severity || '';
      const category = f.category || '';
      const file = f.file ?? null;

      // Count matching findings in subsequent entries
      const subsequentEntries = chain.entries.slice(i + 1);
      let matchingFindings = 0;
      for (const subEntry of subsequentEntries) {
        for (const sf of subEntry.findings || []) {
          if (sf.severity === severity && sf.category === category && (sf.file ?? null) === file) {
            matchingFindings++;
          }
        }
      }

      const subsequent = subsequentEntries.length;
      let status: 'tracking' | 'effective' | 'ineffective';
      let reductionPct: number | null = null;

      if (subsequent < MIN_ENTRIES_FOR_EFFECTIVENESS) {
        status = 'tracking';
      } else {
        // Compare: if matching findings decreased relative to baseline (1 per entry), it's effective
        const expectedBaseline = subsequent; // 1 match per entry would be no change
        reductionPct = Math.round((1 - matchingFindings / expectedBaseline) * 100);
        status = reductionPct > 0 ? 'effective' : 'ineffective';
      }

      promotions.push({
        id: f.id || 'unknown',
        summary: f.summary || '',
        severity,
        category,
        file,
        promoted_to: f.promoted_to ?? null,
        subsequent_entries: subsequent,
        status,
        reduction_pct: reductionPct,
        match_criteria: { severity, category, file },
      });
    }
  }

  // ─── Verification ─────────────────────────────────────────────────
  const verification = computeFirstPassRate(chain.entries);

  // ─── Pipeline Timing ────────────────────────────────────────────
  const pipeline = computePipelineStats(chain.entries);

  return {
    runs,
    trajectory,
    hot_modules: topHotModules,
    promotion_candidates: candidates,
    promotions,
    verification,
    pipeline: pipeline ?? undefined,
  };
}

/**
 * Compute first-pass rate and total issues caught from rejection data.
 *
 * @param entries - Proof chain entries with optional rejection_cycles and previous_failures
 * @returns VerificationStats with first-pass count, percentage, and total caught
 */
export function computeFirstPassRate(entries: Array<{
  rejection_cycles?: number;
  previous_failures?: Array<{ id: string; summary: string }>;
}>): VerificationStats {
  let firstPassCount = 0;
  let totalCaught = 0;

  for (const entry of entries) {
    const cycles = entry.rejection_cycles ?? 0;
    if (cycles === 0) {
      firstPassCount++;
    }
    totalCaught += (entry.previous_failures ?? []).length;
  }

  const totalRuns = entries.length;
  const firstPassPct = totalRuns > 0 ? Math.round((firstPassCount / totalRuns) * 100) : 100;

  return {
    first_pass_count: firstPassCount,
    total_runs: totalRuns,
    first_pass_pct: firstPassPct,
    total_caught: totalCaught,
  };
}

/**
 * Compute pipeline timing stats (medians) from entry timing data.
 * Returns null if fewer than 3 entries have timing data with total_minutes > 0.
 *
 * @param entries - Proof chain entries with optional timing breakdown
 * @returns PipelineStats or null if insufficient data
 */
function computePipelineStats(entries: Array<{
  timing?: {
    total_minutes?: number;
    think?: number;
    plan?: number;
    build?: number;
    verify?: number;
    scope?: number;
  };
}>): PipelineStats | null {
  const MIN_PIPELINE_ENTRIES = 3;

  // Collect entries with total_minutes > 0
  const validEntries = entries.filter(e => e.timing && (e.timing.total_minutes ?? 0) > 0);

  if (validEntries.length < MIN_PIPELINE_ENTRIES) {
    return null;
  }

  const totals = validEntries.map(e => e.timing!.total_minutes!);
  const scopes = validEntries.map(e => e.timing!.think ?? e.timing!.scope ?? null).filter((v): v is number => v !== null);
  const plans = validEntries.map(e => e.timing!.plan ?? null).filter((v): v is number => v !== null);
  const builds = validEntries.map(e => e.timing!.build ?? null).filter((v): v is number => v !== null);
  const verifies = validEntries.map(e => e.timing!.verify ?? null).filter((v): v is number => v !== null);

  return {
    median_total: floorMedian(totals),
    median_scope: scopes.length > 0 ? floorMedian(scopes) : null,
    median_plan: plans.length > 0 ? floorMedian(plans) : null,
    median_build: builds.length > 0 ? floorMedian(builds) : null,
    median_verify: verifies.length > 0 ? floorMedian(verifies) : null,
    entries_with_timing: validEntries.length,
  };
}

/**
 * Compute floor median — for even-count arrays, use the lower of the two middle values.
 *
 * @param values - Array of numbers (must be non-empty)
 * @returns Floor median value
 */
function floorMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor((sorted.length - 1) / 2);
  return sorted[mid]!;
}

/**
 * Detect health changes by comparing current chain vs chain-minus-last-entry.
 *
 * @param chain - Full parsed proof chain
 * @param chain.entries - Array of proof chain entries with findings
 * @returns HealthChange indicating whether anything meaningful changed
 */
export function detectHealthChange(chain: {
  entries: Array<{
    slug?: string;
    findings?: Array<{
      id?: string;
      status?: string;
      severity?: string;
      category?: string;
      suggested_action?: string;
      summary?: string;
      file?: string | null;
      promoted_to?: string;
    }>;
  }>;
}): HealthChange {
  const current = computeHealthReport(chain);
  const noChange: HealthChange = {
    changed: false,
    trajectory: current.trajectory,
    triggers: [],
    details: [],
  };

  // Single entry or empty — no comparison possible
  if (chain.entries.length <= 1) {
    return noChange;
  }

  const previous = computeHealthReport({ entries: chain.entries.slice(0, -1) });
  const triggers: HealthChange['triggers'] = [];
  const details: string[] = [];

  // Check trend direction change
  const trendOrder = ['worsening', 'stable', 'improving'] as const;
  const currentTrendIdx = trendOrder.indexOf(current.trajectory.trend as typeof trendOrder[number]);
  const previousTrendIdx = trendOrder.indexOf(previous.trajectory.trend as typeof trendOrder[number]);

  if (currentTrendIdx >= 0 && previousTrendIdx >= 0 && currentTrendIdx !== previousTrendIdx) {
    if (currentTrendIdx > previousTrendIdx) {
      triggers.push('trend_improved');
      details.push(`trend improved (risks/run ${previous.trajectory.risks_per_run_last5} → ${current.trajectory.risks_per_run_last5})`);
    } else {
      triggers.push('trend_worsened');
      details.push(`trend worsened (risks/run ${previous.trajectory.risks_per_run_last5} → ${current.trajectory.risks_per_run_last5})`);
    }
  }

  // Check new hot modules
  const previousHotFiles = new Set(previous.hot_modules.map(m => m.file));
  const newHotModules = current.hot_modules.filter(m => !previousHotFiles.has(m.file));
  if (newHotModules.length > 0) {
    triggers.push('new_hot_module');
    for (const m of newHotModules) {
      details.push(`${m.file} is now a hot module`);
    }
  }

  // Check new promotion candidates
  const previousCandidateIds = new Set(previous.promotion_candidates.map(c => c.id));
  const newCandidates = current.promotion_candidates.filter(c => !previousCandidateIds.has(c.id));
  if (newCandidates.length > 0) {
    triggers.push('new_candidates');
    details.push(`${newCandidates.length} new promotion candidate${newCandidates.length !== 1 ? 's' : ''}`);
  }

  if (triggers.length === 0) {
    return noChange;
  }

  return {
    changed: true,
    trajectory: current.trajectory,
    triggers,
    details,
  };
}

/**
 * Compute staleness analysis for active findings in the proof chain.
 *
 * Cross-references each active finding's `file` against `modules_touched`
 * in subsequent entries. A finding is "stale" if the file it references
 * was modified by a later pipeline run — the code may have changed.
 *
 * Pure synchronous function — caller handles file I/O.
 *
 * @param chain - Parsed proof chain with entries containing findings and modules_touched
 * @param chain.entries - Array of proof chain entries with findings and modules_touched
 * @param options - Optional filters: afterSlug (only findings from that entry), minConfidence ('high' | 'medium')
 * @param options.afterSlug - Only include findings from the entry with this slug
 * @param options.minConfidence - Minimum confidence tier to include ('high' excludes medium)
 * @returns StalenessResult with findings grouped by confidence tier
 */
export function computeStaleness(
  chain: {
    entries: Array<{
      slug?: string;
      completed_at?: string;
      modules_touched?: string[];
      findings?: Array<{
        id?: string;
        status?: string;
        severity?: string;
        category?: string;
        summary?: string;
        file?: string | null;
      }>;
    }>;
  },
  options?: { afterSlug?: string; minConfidence?: 'high' | 'medium' },
): StalenessResult {
  const highConfidence: StaleFinding[] = [];
  const mediumConfidence: StaleFinding[] = [];

  for (let i = 0; i < chain.entries.length; i++) {
    const entry = chain.entries[i]!;

    // If --after filter, only consider findings from that entry
    if (options?.afterSlug && entry.slug !== options.afterSlug) continue;

    for (const f of entry.findings || []) {
      // Only active findings
      if (f.status && f.status !== 'active') continue;
      // Must have a file to cross-reference
      if (!f.file) continue;

      // Check subsequent entries for modules_touched overlap
      const subsequentSlugs: string[] = [];
      for (let j = i + 1; j < chain.entries.length; j++) {
        const laterEntry = chain.entries[j]!;
        const touched = laterEntry.modules_touched || [];
        if (touched.includes(f.file)) {
          subsequentSlugs.push(laterEntry.slug || `entry-${j}`);
        }
      }

      if (subsequentSlugs.length === 0) continue;

      // Frequency-normalized confidence thresholds
      // entries_since = total entries after this finding's entry
      const entriesSince = chain.entries.length - (i + 1);
      let confidence: 'high' | 'medium';

      if (entriesSince < 5) {
        // Below minimum entries: use raw thresholds
        confidence = subsequentSlugs.length >= 3 ? 'high' : 'medium';
      } else {
        // Compute file touch rate across the entire chain (baseline frequency)
        let totalTouches = 0;
        for (const e of chain.entries) {
          if ((e.modules_touched || []).includes(f.file)) {
            totalTouches++;
          }
        }
        const touchRate = totalTouches / chain.entries.length;
        const expected = Math.max(3, Math.ceil(entriesSince * touchRate));
        if (subsequentSlugs.length >= expected) {
          confidence = 'high';
        } else if (subsequentSlugs.length >= Math.ceil(expected * 0.5)) {
          confidence = 'medium';
        } else {
          continue; // Not stale enough — skip
        }
      }

      const staleFinding: StaleFinding = {
        id: f.id || 'unknown',
        category: f.category || 'code',
        summary: f.summary || '',
        file: f.file,
        severity: f.severity || 'unclassified',
        entry_slug: entry.slug || '',
        completed_at: entry.completed_at || '',
        subsequent_slugs: subsequentSlugs,
        subsequent_count: subsequentSlugs.length,
        confidence,
      };

      if (staleFinding.confidence === 'high') {
        highConfidence.push(staleFinding);
      } else {
        mediumConfidence.push(staleFinding);
      }
    }
  }

  // Apply minConfidence filter
  const filteredHigh = highConfidence;
  const filteredMedium = options?.minConfidence === 'high' ? [] : mediumConfidence;

  return {
    total_stale: filteredHigh.length + filteredMedium.length,
    high_confidence: filteredHigh,
    medium_confidence: filteredMedium,
    filter: options?.afterSlug || null,
  };
}

/**
 * Compute resolution claims from the proof chain.
 *
 * Scans all entries for upstream findings with `resolves` arrays.
 * For each referenced ID, checks whether the original finding is still active.
 * Skips claims where the referenced ID doesn't exist or is already closed.
 * Deduplicates: if multiple upstream findings claim the same original,
 * only the most recent (latest entry) is kept.
 *
 * @param chain - Proof chain with entries array
 * @param chain.entries - Array of proof chain entries to search
 * @returns ResolutionClaimsResult with active claims
 */
export function computeResolutionClaims(
  chain: {
    entries: Array<{
      slug?: string;
      completed_at?: string;
      findings?: Array<{
        id?: string;
        status?: string;
        severity?: string;
        category?: string;
        summary?: string;
        file?: string | null;
        resolves?: string[];
      }>;
    }>;
  },
): ResolutionClaimsResult {
  // Build index of all findings by ID
  const findingIndex = new Map<string, { status: string; summary: string; file: string | null; severity: string }>();
  for (const entry of chain.entries) {
    for (const f of entry.findings ?? []) {
      if (!f.id) continue;
      findingIndex.set(f.id, {
        status: f.status ?? 'active',
        summary: f.summary ?? '',
        file: f.file ?? null,
        severity: f.severity ?? 'unclassified',
      });
    }
  }

  // Collect claims — later entries override earlier ones for dedup
  const claimsByReferenced = new Map<string, ResolutionClaim>();

  for (const entry of chain.entries) {
    for (const f of entry.findings ?? []) {
      if (f.category !== 'upstream' || !f.resolves || f.resolves.length === 0) continue;

      for (const referencedId of f.resolves) {
        const original = findingIndex.get(referencedId);
        // Skip non-existent or non-active findings
        if (!original || original.status !== 'active') continue;

        claimsByReferenced.set(referencedId, {
          upstream_id: f.id ?? 'unknown',
          upstream_summary: f.summary ?? '',
          upstream_slug: entry.slug ?? '',
          referenced_id: referencedId,
          referenced_summary: original.summary,
          referenced_status: original.status,
          referenced_file: original.file,
          referenced_severity: original.severity,
        });
      }
    }
  }

  return { claims: Array.from(claimsByReferenced.values()) };
}

/**
 * Find a finding by its ID across all entries in the chain.
 *
 * Returns both the finding and its parent entry so callers have access
 * to entry-level metadata (slug, feature name) for output formatting.
 *
 * @param chain - Parsed proof chain with entries array
 * @param chain.entries - Array of proof chain entries to search
 * @param id - Finding ID to search for (e.g., "F001")
 * @returns The matching finding and its parent entry, or null if not found
 */
export function findFindingById(
  chain: { entries: Array<{ slug?: string; feature?: string; findings?: Array<{ id: string; [key: string]: unknown }> }> },
  id: string,
): { finding: { id: string; [key: string]: unknown }; entry: { slug?: string; feature?: string; findings?: Array<{ id: string; [key: string]: unknown }> } } | null {
  for (const entry of chain.entries) {
    for (const finding of entry.findings || []) {
      if (finding.id === id) {
        return { finding, entry };
      }
    }
  }
  return null;
}

/**
 * Compute chain health counts from a parsed ProofChain object.
 *
 * Pure synchronous function — caller handles file I/O.
 *
 * @param chain - Parsed proof chain (must have `entries` array)
 * @param chain.entries - Array of proof chain entries
 * @returns Chain health counts for use in JSON meta fields
 */
export function computeChainHealth(chain: { entries: Array<{ findings?: Array<{ status?: string; severity?: string; suggested_action?: string }> }> }): ChainHealth {
  const runs = chain.entries.length;
  let total = 0;
  let active = 0;
  let closed = 0;
  let promoted = 0;

  // Severity breakdowns
  let sevRisk = 0;
  let sevDebt = 0;
  let sevObservation = 0;
  let sevUnclassified = 0;

  // Action breakdowns
  let actPromote = 0;
  let actScope = 0;
  let actMonitor = 0;
  let actAccept = 0;
  let actUnclassified = 0;

  for (const e of chain.entries) {
    for (const f of e.findings || []) {
      total++;
      switch (f.status) {
        case 'active': active++; break;
        case 'promoted': promoted++; break;
        case 'closed': closed++; break;
        default: active++; break; // undefined = active
      }
      // Severity and action breakdowns count active findings only
      const isActive = !f.status || f.status === 'active';
      if (isActive) {
        switch (f.severity) {
          case 'risk': sevRisk++; break;
          case 'debt': sevDebt++; break;
          case 'observation': sevObservation++; break;
          default: sevUnclassified++; break;
        }
        switch (f.suggested_action) {
          case 'promote': actPromote++; break;
          case 'scope': actScope++; break;
          case 'monitor': actMonitor++; break;
          case 'accept': actAccept++; break;
          default: actUnclassified++; break;
        }
      }
    }
  }

  return {
    chain_runs: runs,
    findings: {
      active, closed, promoted, total,
      by_severity: { risk: sevRisk, debt: sevDebt, observation: sevObservation, unclassified: sevUnclassified },
      by_action: { promote: actPromote, scope: actScope, monitor: actMonitor, accept: actAccept, unclassified: actUnclassified },
    },
  };
}

/**
 * Resolve finding/build-concern file fields from basenames to full paths.
 *
 * For each item where `file` is non-null and contains no `/`, finds matching
 * modules using path-boundary check (`module.endsWith('/' + file)`). If exactly
 * one match, replaces `file` with the full path. Mutates in place.
 *
 * Idempotent — files that already exist at their declared path (relative to
 * `projectRoot`) are skipped. Files that don't exist — whether bare basenames
 * or partial monorepo paths — enter the resolution chain.
 *
 * @param items - Array of objects with a `file` field (findings or build_concerns)
 * @param modules - Array of full relative paths from modules_touched
 * @param projectRoot - Project root for existence checks and glob fallback
 * @param globCache - Optional shared cache to avoid redundant globSync calls across invocations
 * @returns void (mutates items in place)
 */
export function resolveFindingPaths(
  items: Array<{ file: string | null }>,
  modules: string[],
  projectRoot: string,
  globCache: Map<string, string[]> = new Map(),
): void {
  for (const item of items) {
    if (!item.file) continue;
    if (fs.existsSync(path.join(projectRoot, item.file))) continue;

    const basename = item.file;
    const matches = modules.filter(m => m === basename || m.endsWith('/' + basename));

    if (matches.length === 1) {
      item.file = matches[0]!;
    } else {
      // Glob fallback: search the project filesystem for an unambiguous match
      let globMatches = globCache.get(basename);
      if (globMatches === undefined) {
        globMatches = globSync('**/' + basename, {
          cwd: projectRoot,
          ignore: ['**/node_modules/**', '**/.ana/**'],
        }).map(p => p.replace(/\\/g, '/'));
        globCache.set(basename, globMatches);
      }
      if (globMatches.length === 1) {
        item.file = globMatches[0]!;
      }
    }
  }
}
