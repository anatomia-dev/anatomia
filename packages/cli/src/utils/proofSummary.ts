/**
 * Generate proof summary from pipeline artifacts
 *
 * Reads artifacts from a slug directory (active or completed) and returns
 * a structured summary for proof chain and PR generation.
 */

import { runGit } from './git-operations.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { parseRejectionCycles, parseFindings, parseBuildOpenIssues, extractScopeSummary, extractScopeKind } from './proof-parsers.js';
import type { ProofAssertion, ProofDeviation } from './proof-parsers.js';
import { computeChainHealth } from './proof-health.js';
import type { ChainHealth } from './proof-health.js';
import { joinCoverage } from '../commands/artifact-validators.js';
import { deriveVerdict } from './verdict.js';
import type { ContractSchema } from '../types/contract.js';
import { computeCoChange } from '../engine/analyzers/proof-history/index.js';
import type { CoChangePartner } from '../engine/analyzers/proof-history/index.js';
import { readCodeGraph } from '../engine/analyzers/graph/readGraph.js';
import type { CodeGraph } from '../engine/analyzers/graph/buildGraph.js';

// Re-export from proof-parsers for backward compatibility
export { parseBuildOpenIssues, extractFileRefs, extractScopeSummary, extractScopeKind, parseFindings, parseRejectionCycles } from './proof-parsers.js';
export type { ProofAssertion, ProofDeviation } from './proof-parsers.js';

// Re-export from proof-health for backward compatibility
export { computeHealthReport, computeFirstPassRate, computeChainHealth, detectHealthChange, computeStaleness, computeResolutionClaims, resolveFindingPaths, findFindingById } from './proof-health.js';
export type { ChainHealth, ResolutionClaim, ResolutionClaimsResult } from './proof-health.js';
export { MIN_FINDINGS_HOT, MIN_ENTRIES_HOT, TRAJECTORY_WINDOW, MIN_ENTRIES_FOR_TREND } from './proof-health.js';

/**
 * Complete proof summary
 */
export interface ProofSummary {
  feature: string;
  result: 'PASS' | 'FAIL' | 'UNKNOWN';
  /**
   * Reasons a PASS headline was coerced to a FAIL `result` by {@link deriveVerdict}
   * (one per contradicting UNSATISFIED compliance row). Additive and optional:
   * absent on a clean verdict and on old entries. Surfaced on the proof entry so
   * the coercion is observable, not silent.
   */
  verdict_contradictions?: string[];
  author: {
    name: string;
    email: string;
  };
  assertions: ProofAssertion[];
  contract: {
    total: number;
    satisfied: number;
    unsatisfied: number;
    deviated: number;
  };
  acceptance_criteria: {
    total: number;
    met: number;
    /**
     * Count of acceptance criteria that shipped PARTIAL (a PARTIAL-inside-PASS).
     * Additive: old proof_chain.json entries lack it — consumers treat absent as 0.
     */
    partial: number;
    /**
     * Per-AC coverage breakdown from {@link joinCoverage}: how each scope AC is
     * covered by the contract. Additive and undefined-safe — old entries or a
     * missing scope/contract yield an all-zero object.
     */
    coverage: {
      /** ACs pinned by >=1 assertion `ac:` link. */
      pinned: number;
      /** ACs excused by a judgment-only coverage_waivers entry. */
      judgment: number;
      /** ACs excused by a retired coverage_waivers entry. */
      retired: number;
      /** ACs with no link and no waiver (would block the seal). */
      uncovered: number;
      /** Pinned ACs whose linking assertions all use weak matchers only. */
      weak_only: number;
    };
  };
  timing: {
    total_minutes: number;
    think?: number;
    plan?: number;
    build?: number;
    verify?: number;
    segments?: Array<{ stage: string; minutes: number; phase?: number }>;
  };
  deviations: ProofDeviation[];
  hashes: Record<string, string>;
  completed_at: string;
  scope_summary?: string | undefined;
  kind?: 'feature' | 'fix' | 'chore' | 'milestone' | undefined;
  // Intelligence capture
  findings: Array<{
    category: string;
    summary: string;
    file: string | null;
    anchor: string | null;
    line?: number;
    severity?: 'risk' | 'debt' | 'observation';
    suggested_action?: 'promote' | 'scope' | 'monitor' | 'acknowledge';
    related_assertions?: string[];
    resolves?: string[];
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
}

/**
 * Save metadata entry structure
 */
interface SaveEntry {
  saved_at?: string;
  commit?: string;
  hash?: string;
  history?: Array<{ saved_at: string; hash: string }>;
}

/**
 * Pre-check assertion from .saves.json
 */
interface PreCheckAssertion {
  id: string;
  says: string;
  status: 'COVERED' | 'UNCOVERED';
}

/**
 * Pre-check metadata structure
 */
interface PreCheckData {
  seal?: string;
  seal_commit?: string;
  assertions?: PreCheckAssertion[];
  covered?: number;
  uncovered?: number;
}

/**
 * Saves.json structure
 */
interface SavesData {
  scope?: SaveEntry;
  contract?: SaveEntry;
  'build-report'?: SaveEntry;
  'verify-report'?: SaveEntry;
  'pre-check'?: PreCheckData;
  [key: string]: SaveEntry | PreCheckData | undefined;
}

/**
 * Contract YAML structure
 */
interface ContractYaml {
  feature?: string;
  assertions?: Array<{ id: string; says: string }>;
}

/**
 * Parse Contract Compliance table from verify report
 *
 * @param content - Verify report content
 * @returns Array of compliance rows with id, says, status, evidence
 */
export function parseComplianceTable(content: string): Array<{
  id: string;
  says: string;
  status: string;
  evidence: string;
}> {
  const results: Array<{ id: string; says: string; status: string; evidence: string }> = [];

  // Find the Contract Compliance table
  const tableMatch = content.match(/## Contract Compliance[\s\S]*?\|[\s\S]*?\n([\s\S]*?)(?=\n##|\n---|\n\n\n|$)/);
  if (!tableMatch) return results;

  const tableSection = tableMatch[0];
  const lines = tableSection.split('\n');

  for (const line of lines) {
    // Skip header and separator lines
    if (!line.startsWith('|') || line.includes('----') || line.includes('Says') || line.includes('Status')) {
      continue;
    }

    // Parse table row: | ID | Says | Status | Evidence |
    const cells = line.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length >= 3) {
      const id = cells[0] ?? '';
      const says = cells[1] ?? '';
      // Extract status from emoji + text (e.g., "✅ SATISFIED")
      const statusCell = cells[2] ?? '';
      const statusMatch = statusCell.match(/(SATISFIED|UNSATISFIED|DEVIATED|UNCOVERED)/i);
      const status = statusMatch && statusMatch[1] ? statusMatch[1].toUpperCase() : 'UNKNOWN';
      const evidence = cells[3] || '';

      results.push({ id, says, status, evidence });
    }
  }

  return results;
}

/**
 * Parse AC walkthrough and count results
 *
 * @param content - Verify report content
 * @returns Object with total, met, and partial AC counts
 */
function parseACResults(content: string): { total: number; met: number; partial: number } {
  // Scope to the AC Walkthrough section to avoid false matches from other sections
  // (e.g., a Findings bullet containing "PASS" in prose).
  // Fall back to full content if heading is missing (old reports).
  let section = content;
  const walkthroughStart = content.indexOf('## AC Walkthrough');
  if (walkthroughStart !== -1) {
    const afterHeading = walkthroughStart + '## AC Walkthrough'.length;
    const nextHeading = content.indexOf('\n## ', afterHeading);
    section = nextHeading !== -1
      ? content.substring(walkthroughStart, nextHeading)
      : content.substring(walkthroughStart);
  }

  // Match status words on bullet-list lines (anchored to `- ` prefix).
  // Mirrors parseAssertionResults: match the word, ignore prefix symbols.
  // Excludes `**Result:** PASS` (no bullet prefix) to avoid false matches.
  const passCount = (section.match(/^\s*-\s+.*\bPASS\b/gm) || []).length;
  const failCount = (section.match(/^\s*-\s+.*\bFAIL\b/gm) || []).length;
  const partialCount = (section.match(/^\s*-\s+.*\bPARTIAL\b/gm) || []).length;
  const unverifiableCount = (section.match(/^\s*-\s+.*\bUNVERIFIABLE\b/gm) || []).length;

  const total = passCount + failCount + partialCount + unverifiableCount;
  const met = passCount;

  return { total: total || 0, met, partial: partialCount };
}

/**
 * Parse deviations from build report
 *
 * @param content - Build report content
 * @returns Array of parsed deviations
 */
function parseDeviations(content: string): ProofDeviation[] {
  const deviations: ProofDeviation[] = [];

  // Match deviation blocks: ### A{ID}: {says}
  const deviationPattern = /### (A\d+): ([^\n]+)\n([\s\S]*?)(?=\n### |## |$)/g;
  let match;

  while ((match = deviationPattern.exec(content)) !== null) {
    const contractId = match[1];
    const saysRaw = match[2];
    const body = match[3];
    if (!contractId || saysRaw === undefined || body === undefined) continue;
    const says = saysRaw.trim();

    // Extract Instead, Reason, Outcome
    const insteadMatch = body.match(/\*\*Instead:\*\*\s*([^\n]+)/);
    const reasonMatch = body.match(/\*\*Reason:\*\*\s*([^\n]+)/);
    const outcomeMatch = body.match(/\*\*Outcome:\*\*\s*([^\n]+)/);

    deviations.push({
      contract_id: contractId,
      says,
      instead: insteadMatch && insteadMatch[1] ? insteadMatch[1].trim() : null,
      reason: reasonMatch && reasonMatch[1] ? reasonMatch[1].trim() : null,
      outcome: outcomeMatch && outcomeMatch[1] ? outcomeMatch[1].trim() : null,
    });
  }

  return deviations;
}

/**
 * Finding with feature context for Active Issues index
 */
interface FindingWithFeature {
  category: string;
  summary: string;
  file: string | null;
  feature: string;
}


/**
 * Dashboard entry type for generateDashboard
 */
interface DashboardEntry {
  slug: string;
  feature: string;
  completed_at: string;
  surface?: string | undefined;
  findings?: Array<{ id: string; category: string; summary: string; file: string | null; anchor: string | null; status?: string }>;
}

/**
 * Generate a quality dashboard from proof chain entries.
 *
 * Contains: summary line, Hot Modules section, Promoted Rules placeholder,
 * and Active Findings section (grouped by file).
 *
 * @param entries - Proof chain entries (oldest first)
 * @param stats - Chain health stats
 * @param stats.runs - Total pipeline runs
 * @param stats.active - Active finding count
 * @param stats.promoted - Promoted finding count
 * @param stats.closed - Closed finding count
 * @returns Markdown string for PROOF_CHAIN.md
 */
export function generateDashboard(entries: DashboardEntry[], stats: { runs: number; active: number; promoted: number; closed: number }): string {
  let md = '# Proof Chain Dashboard\n\n';

  // Summary line
  md += `${stats.runs} runs · ${stats.active} active · ${stats.promoted} promoted · ${stats.closed} closed\n\n`;

  // By Surface section — only when at least one entry has a defined surface
  const hasSurfaces = entries.some(e => e.surface !== undefined);
  if (hasSurfaces) {
    const surfaceMap = new Map<string, { runs: number; active: number; latest: string }>();
    for (const entry of entries) {
      const surfaceKey = entry.surface ?? 'Unscoped';
      const existing = surfaceMap.get(surfaceKey) || { runs: 0, active: 0, latest: '' };
      existing.runs++;
      if (entry.completed_at > existing.latest) {
        existing.latest = entry.completed_at;
      }
      for (const finding of entry.findings ?? []) {
        if (!finding.status || finding.status === 'active') {
          existing.active++;
        }
      }
      surfaceMap.set(surfaceKey, existing);
    }

    md += '## By Surface\n\n';
    md += '| Surface | Runs | Active | Latest |\n';
    md += '|---------|------|--------|--------|\n';
    for (const [surface, data] of surfaceMap) {
      const latestDate = data.latest ? data.latest.slice(0, 10) : '—';
      md += `| ${surface} | ${data.runs} | ${data.active} | ${latestDate} |\n`;
    }
    md += '\n';
  }

  // Hot Modules: files with active findings from 2+ distinct entries
  const fileEntryMap = new Map<string, Set<string>>();
  const fileActiveCount = new Map<string, number>();

  for (const entry of entries) {
    for (const finding of entry.findings ?? []) {
      if (!finding.file) continue;
      if (finding.status && finding.status !== 'active') continue;
      const entrySet = fileEntryMap.get(finding.file) || new Set();
      entrySet.add(entry.slug);
      fileEntryMap.set(finding.file, entrySet);
      fileActiveCount.set(finding.file, (fileActiveCount.get(finding.file) || 0) + 1);
    }
  }

  md += '## Hot Modules\n\n';
  const hotModules = Array.from(fileEntryMap.entries())
    .filter(([, entrySet]) => entrySet.size >= 2)
    .map(([file, entrySet]) => ({ file, active: fileActiveCount.get(file) || 0, entries: entrySet.size }))
    .sort((a, b) => b.active - a.active)
    .slice(0, 5);

  if (hotModules.length > 0) {
    md += '| File | Active | Entries |\n';
    md += '|------|--------|--------|\n';
    for (const mod of hotModules) {
      md += `| ${mod.file} | ${mod.active} | ${mod.entries} |\n`;
    }
  } else {
    md += '*No hot modules yet.*\n';
  }

  md += '\n## Promoted Rules\n\n*No promoted rules yet.*\n\n';

  // Active Findings section (grouped by file)
  // Collect active findings
  const allActive: Array<FindingWithFeature & { entryDate: string }> = [];
  const reversedEntries = [...entries].reverse();
  for (const entry of reversedEntries) {
    for (const finding of entry.findings ?? []) {
      if (finding.status && finding.status !== 'active') continue;
      allActive.push({
        category: finding.category,
        summary: finding.summary,
        file: finding.file,
        feature: entry.feature,
        entryDate: entry.completed_at,
      });
    }
  }

  const MAX_ACTIVE = 30;
  const totalActive = allActive.length;
  const capped = allActive.slice(0, MAX_ACTIVE);

  if (totalActive === 0) {
    md += '## Active Findings\n\n*No active findings.*\n';
  } else {
    if (totalActive <= MAX_ACTIVE) {
      md += `## Active Findings (${totalActive})\n\n`;
    } else {
      md += `## Active Findings (${MAX_ACTIVE} shown of ${totalActive} total)\n\n`;
    }

    // Group by file
    const fileGroups = new Map<string, Array<FindingWithFeature & { entryDate: string }>>();
    for (const finding of capped) {
      const key = finding.file ?? 'General';
      const existing = fileGroups.get(key) || [];
      existing.push(finding);
      fileGroups.set(key, existing);
    }

    const fileNames = Array.from(fileGroups.keys()).sort((a, b) => {
      if (a === 'General') return 1;
      if (b === 'General') return -1;
      return a.localeCompare(b);
    });

    for (const fileName of fileNames) {
      const findings = fileGroups.get(fileName) || [];
      md += `### ${fileName}\n\n`;
      for (const finding of findings) {
        md += `- **${finding.category}:** ${finding.summary} — *${finding.feature}*\n`;
      }
      md += '\n';
    }
  }

  return md;
}

/**
 * JSON envelope for successful proof responses.
 */
export interface JsonEnvelope<T = unknown> {
  command: string;
  timestamp: string;
  results: T;
  meta: ChainHealth;
}

/**
 * JSON envelope for error proof responses.
 */
export interface JsonErrorEnvelope {
  command: string;
  timestamp: string;
  error: {
    code: string;
    message: string;
    [key: string]: unknown;
  };
  meta: ChainHealth;
}

/**
 * Wrap a successful command result in the standard JSON envelope.
 *
 * @param command - Command name (e.g., "proof", "proof close")
 * @param results - Command-specific results object
 * @param chain - Parsed proof chain for health metadata
 * @param chain.entries - Array of proof chain entries
 * @returns Four-key JSON envelope
 */
export function wrapJsonResponse<T>(command: string, results: T, chain: { entries: Array<{ findings?: Array<{ status?: string; severity?: string; suggested_action?: string }> }> }): JsonEnvelope<T> {
  return {
    command,
    timestamp: new Date().toISOString(),
    results,
    meta: computeChainHealth(chain),
  };
}

/**
 * Wrap an error in the standard JSON error envelope.
 *
 * @param command - Command name (e.g., "proof close")
 * @param code - Machine-readable error code (e.g., "WRONG_BRANCH")
 * @param message - Human-readable error message
 * @param context - Additional context fields for the error
 * @param chain - Parsed proof chain for health metadata (null if chain unavailable)
 * @param chain.entries - Array of proof chain entries
 * @returns Four-key JSON error envelope
 */
export function wrapJsonError(
  command: string,
  code: string,
  message: string,
  context: Record<string, unknown>,
  chain: { entries: Array<{ findings?: Array<{ status?: string; severity?: string; suggested_action?: string }> }> } | null,
): JsonErrorEnvelope {
  const meta: ChainHealth = chain
    ? computeChainHealth(chain)
    : {
      chain_runs: 0,
      findings: {
        active: 0, closed: 0, promoted: 0, total: 0,
        by_severity: { risk: 0, debt: 0, observation: 0, unclassified: 0 },
        by_action: { promote: 0, scope: 0, monitor: 0, acknowledge: 0, unclassified: 0 },
      },
    };

  return {
    command,
    timestamp: new Date().toISOString(),
    error: { code, message, ...context },
    meta,
  };
}


/**
 * Compute timing from save timestamps
 *
 * @param saves - Saves data from .saves.json
 * @param slugDir - Path to the slug directory, used for content-based rejection detection
 * @returns Timing breakdown in minutes
 */
function computeTiming(saves: SavesData, slugDir: string): ProofSummary['timing'] {
  const MAX_PHASE_MS = 24 * 60 * 60 * 1000; // 24 hours

  const getTime = (key: string): number | null => {
    const entry = saves[key] as SaveEntry | undefined;
    return entry?.saved_at ? new Date(entry.saved_at).getTime() : null;
  };

  /**
   * Get the latest timestamp for an artifact key, handling multi-phase naming.
   * Single-spec: exact match ("build-report" → saves["build-report"])
   * Multi-phase: latest numbered match ("build-report" → max of saves["build-report-1"], "-2", "-3"])
   *
   * @param baseKey - Artifact key prefix (e.g., "build-report", "verify-report")
   * @returns Epoch milliseconds of the latest matching save, or null if none found
   */
  const getLatestTime = (baseKey: string): number | null => {
    // Try exact key first (single-spec fast path)
    const exact = getTime(baseKey);
    if (exact !== null) return exact;

    // Find all phase-numbered keys and return the latest timestamp
    let latest: number | null = null;
    for (const key of Object.keys(saves)) {
      if (key.startsWith(baseKey + '-') && /\d+$/.test(key)) {
        const t = getTime(key);
        if (t !== null && (latest === null || t > latest)) {
          latest = t;
        }
      }
    }
    return latest;
  };

  // Top-level ISO strings for raw timestamps (not { saved_at, hash } objects)
  const readRawTimestamp = (key: string): number | null => {
    const raw = saves[key];
    return typeof raw === 'string' ? new Date(raw).getTime() : null;
  };

  /**
   * Enumerate numbered phase keys (e.g., "build-report-1", "build-report-2")
   * sorted by phase number. Only matches exact `{baseKey}-{N}` patterns —
   * excludes companion data keys like "build-data-1".
   *
   * @param baseKey - Artifact key prefix (e.g., "build-report", "verify-report")
   * @returns Sorted array of phase number and key pairs
   */
  const getNumberedPhases = (baseKey: string): Array<{ phase: number; key: string }> => {
    const phases: Array<{ phase: number; key: string }> = [];
    const pattern = new RegExp(`^${baseKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
    for (const key of Object.keys(saves)) {
      const match = key.match(pattern);
      if (match?.[1]) {
        phases.push({ phase: parseInt(match[1], 10), key });
      }
    }
    return phases.sort((a, b) => a.phase - b.phase);
  };

  /**
   * Detect multi-phase: numbered build-report keys present
   */
  const buildPhases = getNumberedPhases('build-report');
  const verifyPhases = getNumberedPhases('verify-report');
  const isMultiPhase = buildPhases.length > 0;

  /**
   * Detect rejection cycles: content-based detection using verify report files.
   * Reads actual verify report content and checks for "Previous Findings Resolution"
   * sections via parseRejectionCycles, rather than relying on .saves.json history arrays
   * which can contain false entries from same-session corrections.
   */
  const buildReportEntry = saves['build-report'] as SaveEntry | undefined;
  const verifyReportEntry = saves['verify-report'] as SaveEntry | undefined;

  const hasRejectionContent = (() => {
    try {
      // Check unnumbered verify report first
      const unnumberedPath = path.join(slugDir, 'verify_report.md');
      if (fs.existsSync(unnumberedPath)) {
        const content = fs.readFileSync(unnumberedPath, 'utf-8');
        const { cycles } = parseRejectionCycles(content);
        if (cycles > 0) return true;
      }

      // Check numbered verify reports
      for (const { key } of verifyPhases) {
        // Derive filename from key: "verify-report-1" → "verify_report_1.md"
        const phaseMatch = key.match(/^verify-report-(\d+)$/);
        if (!phaseMatch?.[1]) continue;
        const numberedPath = path.join(slugDir, `verify_report_${phaseMatch[1]}.md`);
        if (fs.existsSync(numberedPath)) {
          const content = fs.readFileSync(numberedPath, 'utf-8');
          const { cycles } = parseRejectionCycles(content);
          if (cycles > 0) return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  })();

  const workStartedAt = readRawTimestamp('work_started_at');
  const planStartedAt = readRawTimestamp('plan_started_at');
  const buildStartedAt = readRawTimestamp('build_started_at');
  const verifyStartedAt = readRawTimestamp('verify_started_at');

  const scopeTime = getTime('scope');
  const contractTime = getTime('contract');
  const buildTime = getLatestTime('build-report');
  const verifyTime = getLatestTime('verify-report');

  // Total includes think phase when work_started_at is available
  const startTime = workStartedAt ?? scopeTime;
  const totalMs = (verifyTime && startTime) ? verifyTime - startTime : 0;

  const timing: ProofSummary['timing'] = {
    total_minutes: Math.round(totalMs / 60000),
  };

  // Think and plan computation (unchanged by segment logic)
  if (workStartedAt && scopeTime && contractTime) {
    timing.think = Math.round((scopeTime - workStartedAt) / 60000);

    let usedPlanStartedAt = false;
    if (planStartedAt !== null && planStartedAt <= contractTime) {
      const durationMs = contractTime - planStartedAt;
      if (durationMs >= 0 && durationMs <= MAX_PHASE_MS) {
        timing.plan = Math.round(durationMs / 60000);
        usedPlanStartedAt = true;
      }
    }
    if (!usedPlanStartedAt) {
      timing.plan = Math.round((contractTime - scopeTime) / 60000);
    }
  } else if (contractTime && scopeTime) {
    timing.think = Math.round((contractTime - scopeTime) / 60000);
    timing.plan = Math.round((contractTime - scopeTime) / 60000);
  }

  // --- Segment-based build/verify computation ---
  if (isMultiPhase && contractTime) {
    // Multi-phase: sum per-phase segments and capture individual segment data
    let buildMs = 0;
    let verifyMs = 0;
    const segments: Array<{ stage: string; minutes: number; phase?: number }> = [];

    // Add think segment
    if (timing.think != null) {
      segments.push({ stage: 'think', minutes: timing.think });
    }
    // Add plan segment
    if (timing.plan != null) {
      segments.push({ stage: 'plan', minutes: timing.plan });
    }

    for (let i = 0; i < buildPhases.length; i++) {
      const buildPhase = buildPhases[i]!;
      const verifyPhase = verifyPhases[i];
      const phaseNum = buildPhase.phase;

      // Build segment: try per-phase start key first, fall back to segment timing
      const prevVerify = verifyPhases[i - 1];
      const segStart = i === 0
        ? contractTime
        : prevVerify ? getTime(prevVerify.key) : null;
      const segEnd = getTime(buildPhase.key);

      let usedBuildStartedAt = false;
      if (segEnd !== null) {
        // Try per-phase build_started_at_N
        const phaseBuildStartedAt = readRawTimestamp(`build_started_at_${phaseNum}`);
        if (phaseBuildStartedAt !== null) {
          // Sanity: must be after previous phase boundary and before this build report
          const prevBoundary = segStart;
          if (prevBoundary !== null && phaseBuildStartedAt >= prevBoundary && phaseBuildStartedAt <= segEnd) {
            const durationMs = segEnd - phaseBuildStartedAt;
            if (durationMs >= 0 && durationMs <= MAX_PHASE_MS) {
              buildMs += durationMs;
              segments.push({ stage: 'build', minutes: Math.round(durationMs / 60000), phase: phaseNum });
              usedBuildStartedAt = true;
            }
          }
        }
      }

      if (!usedBuildStartedAt && segStart !== null && segEnd !== null) {
        const durationMs = segEnd - segStart;
        if (durationMs >= 0 && durationMs <= MAX_PHASE_MS) {
          buildMs += durationMs;
          segments.push({ stage: 'build', minutes: Math.round(durationMs / 60000), phase: phaseNum });
        }
      }

      // Verify segment: try per-phase start key first, fall back to segment timing
      if (verifyPhase) {
        const vStart = getTime(buildPhase.key);
        const vEnd = getTime(verifyPhase.key);

        let usedVerifyStartedAt = false;
        if (vEnd !== null) {
          const phaseVerifyStartedAt = readRawTimestamp(`verify_started_at_${phaseNum}`);
          if (phaseVerifyStartedAt !== null && vStart !== null) {
            // Sanity: must be after build-report-N.saved_at and before verify-report-N.saved_at
            if (phaseVerifyStartedAt >= vStart && phaseVerifyStartedAt <= vEnd) {
              const durationMs = vEnd - phaseVerifyStartedAt;
              if (durationMs >= 0 && durationMs <= MAX_PHASE_MS) {
                verifyMs += durationMs;
                segments.push({ stage: 'verify', minutes: Math.round(durationMs / 60000), phase: verifyPhase.phase });
                usedVerifyStartedAt = true;
              }
            }
          }
        }

        if (!usedVerifyStartedAt && vStart !== null && vEnd !== null) {
          const durationMs = vEnd - vStart;
          if (durationMs >= 0 && durationMs <= MAX_PHASE_MS) {
            verifyMs += durationMs;
            segments.push({ stage: 'verify', minutes: Math.round(durationMs / 60000), phase: verifyPhase.phase });
          }
        }
      }
    }

    timing.build = Math.round(buildMs / 60000);
    timing.verify = Math.round(verifyMs / 60000);
    if (segments.length > 0) {
      timing.segments = segments;
    }
  } else if (hasRejectionContent && contractTime) {
    // Rejection cycles: reconstruct timeline from history entries
    let buildMs = 0;
    let verifyMs = 0;

    // Collect all build timestamps: history (oldest first) + current
    const buildTimestamps: number[] = [];
    if (buildReportEntry?.history) {
      for (const h of buildReportEntry.history) {
        const t = new Date(h.saved_at).getTime();
        if (!isNaN(t)) buildTimestamps.push(t);
      }
    }
    if (buildReportEntry?.saved_at) {
      const t = new Date(buildReportEntry.saved_at).getTime();
      if (!isNaN(t)) buildTimestamps.push(t);
    }

    const verifyTimestamps: number[] = [];
    if (verifyReportEntry?.history) {
      for (const h of verifyReportEntry.history) {
        const t = new Date(h.saved_at).getTime();
        if (!isNaN(t)) verifyTimestamps.push(t);
      }
    }
    if (verifyReportEntry?.saved_at) {
      const t = new Date(verifyReportEntry.saved_at).getTime();
      if (!isNaN(t)) verifyTimestamps.push(t);
    }

    // Build segments: contract → build[0], verify[0] → build[1], verify[1] → build[2], ...
    for (let i = 0; i < buildTimestamps.length; i++) {
      const segStart = i === 0 ? contractTime : verifyTimestamps[i - 1];
      const segEnd = buildTimestamps[i]!;
      if (segStart !== undefined && segStart !== null) {
        const durationMs = segEnd - segStart;
        if (durationMs >= 0 && durationMs <= MAX_PHASE_MS) {
          buildMs += durationMs;
        }
      }
    }

    // Verify segments: build[0] → verify[0], build[1] → verify[1], ...
    for (let i = 0; i < verifyTimestamps.length; i++) {
      const segStart = buildTimestamps[i];
      const segEnd = verifyTimestamps[i]!;
      if (segStart !== undefined && segStart !== null) {
        const durationMs = segEnd - segStart;
        if (durationMs >= 0 && durationMs <= MAX_PHASE_MS) {
          verifyMs += durationMs;
        }
      }
    }

    timing.build = Math.round(buildMs / 60000);
    timing.verify = Math.round(verifyMs / 60000);
  } else {
    // Fallback: existing endpoint-subtraction for single-phase without history
    if (buildTime && contractTime) {
      let usedStartedAt = false;
      if (buildStartedAt !== null && buildStartedAt <= buildTime) {
        const durationMs = buildTime - buildStartedAt;
        if (durationMs >= 0 && durationMs <= MAX_PHASE_MS) {
          timing.build = Math.round(durationMs / 60000);
          usedStartedAt = true;
        }
      }
      if (!usedStartedAt) {
        timing.build = Math.round((buildTime - contractTime) / 60000);
      }
    }

    if (verifyTime && buildTime) {
      let usedStartedAt = false;
      if (verifyStartedAt !== null && verifyStartedAt <= verifyTime) {
        const durationMs = verifyTime - verifyStartedAt;
        if (durationMs >= 0 && durationMs <= MAX_PHASE_MS) {
          timing.verify = Math.round(durationMs / 60000);
          usedStartedAt = true;
        }
      }
      if (!usedStartedAt) {
        timing.verify = Math.round((verifyTime - buildTime) / 60000);
      }
    }
  }

  return timing;
}

/**
 * Get git author info
 *
 * @returns Object with name and email from git config
 */
function getAuthor(): { name: string; email: string } {
  const nameResult = runGit(['config', 'user.name']);
  const emailResult = runGit(['config', 'user.email']);
  return {
    name: nameResult.exitCode === 0 && nameResult.stdout ? nameResult.stdout : 'Unknown',
    email: emailResult.exitCode === 0 && emailResult.stdout ? emailResult.stdout : 'unknown@example.com',
  };
}

/**
 * Generate proof summary from a slug directory
 *
 * @param slugDir - Path to the slug directory (active or completed)
 * @returns ProofSummary with all available data
 */
export function generateProofSummary(slugDir: string): ProofSummary {
  const slug = path.basename(slugDir);

  // Initialize with defaults
  const summary: ProofSummary = {
    feature: slug,
    result: 'UNKNOWN',
    author: getAuthor(),
    assertions: [],
    contract: {
      total: 0,
      satisfied: 0,
      unsatisfied: 0,
      deviated: 0,
    },
    acceptance_criteria: {
      total: 0,
      met: 0,
      partial: 0,
      coverage: { pinned: 0, judgment: 0, retired: 0, uncovered: 0, weak_only: 0 },
    },
    timing: {
      total_minutes: 0,
    },
    deviations: [],
    hashes: {},
    completed_at: new Date().toISOString(),
    findings: [],
    rejection_cycles: 0,
    previous_failures: [],
    build_concerns: [],
    commit_hygiene: [],
    // `process` (session provenance) is an optional attach assembled at
    // work-complete from the session buffer — NOT a defaulted array. It defaults
    // to absent; do not seed an empty object here.
  };

  // Source 1: .saves.json
  const savesPath = path.join(slugDir, '.saves.json');
  let saves: SavesData = {};
  if (fs.existsSync(savesPath)) {
    try {
      saves = JSON.parse(fs.readFileSync(savesPath, 'utf-8'));

      // Extract hashes
      for (const [key, value] of Object.entries(saves)) {
        if (key !== 'pre-check' && value && typeof value === 'object' && 'hash' in value) {
          const entry = value as SaveEntry;
          if (entry.hash) {
            summary.hashes[key] = entry.hash;
          }
        }
      }

      // Extract timing
      summary.timing = computeTiming(saves, slugDir);

      // Extract commit hygiene findings
      const hygieneData = saves['commit_hygiene' as keyof typeof saves];
      if (Array.isArray(hygieneData)) {
        summary.commit_hygiene = hygieneData as NonNullable<ProofSummary['commit_hygiene']>;
      }

      // Pre-check data in .saves.json is vestigial — assertions now come from contract.yaml
    } catch {
      // Continue with defaults
    }
  }

  // Source 2: contract.yaml (for feature name fallback)
  const contractPath = path.join(slugDir, 'contract.yaml');
  if (fs.existsSync(contractPath)) {
    try {
      const contract: ContractYaml = yaml.parse(fs.readFileSync(contractPath, 'utf-8'));
      if (contract.feature) {
        summary.feature = contract.feature;
      }

      // Build assertions from contract (primary path)
      if (summary.assertions.length === 0 && contract.assertions) {
        summary.assertions = contract.assertions.map(a => ({
          id: a.id,
          says: a.says,
          verifyStatus: null,
        }));
        summary.contract.total = contract.assertions.length;
      }
    } catch {
      // Continue with defaults
    }
  }

  // Source 3: verify reports (single-spec: verify_report.md, multi-spec: verify_report_N.md)
  // Read ALL verify reports and aggregate compliance, findings, and results.
  const dirFiles = fs.readdirSync(slugDir);
  const verifyFiles = dirFiles
    .filter(f => f.match(/^verify_report(_\d+)?\.md$/))
    .sort();

  let lastResult: 'PASS' | 'FAIL' | 'UNKNOWN' | null = null;
  let lastContradictions: string[] = [];
  const allFindings: ProofSummary['findings'] = [];

  for (const verifyFile of verifyFiles) {
    const verifyPath = path.join(slugDir, verifyFile);
    try {
      const verifyContent = fs.readFileSync(verifyPath, 'utf-8');

      // Track result from each phase — last phase determines overall result.
      // deriveVerdict cross-checks the headline against the compliance table and
      // coerces a contradicted PASS to FAIL; carry its reasons onto the proof.
      const phaseVerdict = deriveVerdict(verifyContent);
      if (phaseVerdict.result !== 'UNKNOWN') {
        lastResult = phaseVerdict.result;
        lastContradictions = phaseVerdict.contradictions;
      }

      // Accumulate AC results from last phase (most complete). Preserve the
      // `coverage` object — it is computed from scope.md + contract.yaml below,
      // not from the verify report, so it must survive this assignment.
      const acCounts = parseACResults(verifyContent);
      summary.acceptance_criteria = {
        ...acCounts,
        coverage: summary.acceptance_criteria.coverage,
      };

      // Parse compliance table and overlay on assertions (each phase has different IDs)
      const complianceRows = parseComplianceTable(verifyContent);
      for (const row of complianceRows) {
        const assertion = summary.assertions.find(a => a.id === row.id);
        if (assertion) {
          assertion.verifyStatus = row.status as 'SATISFIED' | 'UNSATISFIED' | 'DEVIATED';
          assertion.evidence = row.evidence;
        }
      }

      // YAML-first findings reader: derive companion path, read if exists, fall back to regex
      const companionName = verifyFile.replace(/_report/, '_data').replace(/\.md$/, '.yaml');
      const companionPath = path.join(slugDir, companionName);

      if (fs.existsSync(companionPath)) {
        try {
          const yamlContent = yaml.parse(fs.readFileSync(companionPath, 'utf-8'));
          if (yamlContent && Array.isArray(yamlContent.findings)) {
            for (const f of yamlContent.findings as Array<Record<string, unknown>>) {
              const finding: ProofSummary['findings'][0] = {
                category: String(f['category'] ?? 'code'),
                summary: String(f['summary'] ?? ''),
                file: typeof f['file'] === 'string' ? f['file'] : null,
                anchor: typeof f['anchor'] === 'string' ? f['anchor'] : null,
              };
              if (typeof f['line'] === 'number') finding.line = f['line'];
              if (typeof f['severity'] === 'string') finding.severity = f['severity'] as 'risk' | 'debt' | 'observation';
              if (typeof f['suggested_action'] === 'string') finding.suggested_action = f['suggested_action'] as 'promote' | 'scope' | 'monitor' | 'acknowledge';
              if (Array.isArray(f['related_assertions'])) finding.related_assertions = f['related_assertions'] as string[];
              if (Array.isArray(f['resolves'])) finding.resolves = f['resolves'] as string[];
              allFindings.push(finding);
            }
          }
        } catch {
          // YAML parse failed — fall back to regex
          allFindings.push(...parseFindings(verifyContent));
        }
      } else {
        // No companion — fall back to regex extraction
        allFindings.push(...parseFindings(verifyContent));
      }

      // Parse rejection cycles from each phase
      const rejectionData = parseRejectionCycles(verifyContent);
      summary.rejection_cycles += rejectionData.cycles;
      summary.previous_failures.push(...rejectionData.failures);
    } catch {
      // Continue with defaults
    }
  }

  if (lastResult) summary.result = lastResult;
  if (lastContradictions.length > 0) summary.verdict_contradictions = lastContradictions;
  summary.findings = allFindings;

  // Coverage: join scope.md ACs against the contract's `ac:` links + waivers via
  // the same exported `joinCoverage` the pre-seal gate uses (one implementation,
  // never forked). Undefined-safe: a missing scope, a legacy 1.0 contract, or any
  // parse failure degrades to the all-zero default — never throws.
  try {
    const scopePath = path.join(slugDir, 'scope.md');
    if (fs.existsSync(scopePath) && fs.existsSync(contractPath)) {
      const scopeContent = fs.readFileSync(scopePath, 'utf-8');
      const coverageContract = yaml.parse(fs.readFileSync(contractPath, 'utf-8')) as ContractSchema;
      const join = joinCoverage(scopeContent, coverageContract);
      summary.acceptance_criteria.coverage = {
        pinned: join.acs.filter(ac => ac.status === 'pinned').length,
        judgment: join.acs.filter(ac => ac.status === 'judgment').length,
        retired: join.acs.filter(ac => ac.status === 'retired').length,
        uncovered: join.acs.filter(ac => ac.status === 'uncovered').length,
        weak_only: join.acs.filter(ac => ac.status === 'pinned' && ac.weakOnly).length,
      };
    }
  } catch {
    // Coverage stays at the all-zero default — never block summary generation.
  }

  // Update contract counts from verify statuses (aggregated across all phases)
  summary.contract.satisfied = summary.assertions.filter(a => a.verifyStatus === 'SATISFIED').length;
  summary.contract.unsatisfied = summary.assertions.filter(a => a.verifyStatus === 'UNSATISFIED').length;
  summary.contract.deviated = summary.assertions.filter(a => a.verifyStatus === 'DEVIATED').length;

  // Source 4: build reports (single-spec: build_report.md, multi-spec: build_report_N.md)
  // Read ALL build reports and aggregate deviations and build concerns.
  const buildFiles = dirFiles
    .filter(f => f.match(/^build_report(_\d+)?\.md$/))
    .sort();

  for (const buildFile of buildFiles) {
    const buildPath = path.join(slugDir, buildFile);
    try {
      const buildContent = fs.readFileSync(buildPath, 'utf-8');
      summary.deviations.push(...parseDeviations(buildContent));

      // YAML-first build concerns reader: derive companion, read if exists, fall back to regex
      const buildCompanionName = buildFile.replace(/_report/, '_data').replace(/\.md$/, '.yaml');
      const buildCompanionPath = path.join(slugDir, buildCompanionName);

      if (fs.existsSync(buildCompanionPath)) {
        try {
          const yamlContent = yaml.parse(fs.readFileSync(buildCompanionPath, 'utf-8'));
          if (yamlContent && Array.isArray(yamlContent.concerns)) {
            for (const c of yamlContent.concerns as Array<Record<string, unknown>>) {
              const concern: ProofSummary['build_concerns'][0] = {
                summary: String(c['summary'] ?? ''),
                file: typeof c['file'] === 'string' ? c['file'] : null,
              };
              if (typeof c['severity'] === 'string') concern.severity = c['severity'] as 'risk' | 'debt' | 'observation';
              if (typeof c['suggested_action'] === 'string') concern.suggested_action = c['suggested_action'] as 'promote' | 'scope' | 'monitor' | 'acknowledge';
              summary.build_concerns.push(concern);
            }
          }
        } catch {
          // YAML parse failed — fall back to regex
          const concerns = parseBuildOpenIssues(buildContent);
          if (concerns.length > 0) {
            summary.build_concerns.push(...concerns);
          }
        }
      } else {
        // No companion — fall back to regex extraction
        const concerns = parseBuildOpenIssues(buildContent);
        if (concerns.length > 0) {
          summary.build_concerns.push(...concerns);
        }
      }
    } catch {
      // Continue with defaults
    }
  }

  // Source 5: scope.md (for scope_summary and kind)
  const scopePath = path.join(slugDir, 'scope.md');
  summary.scope_summary = extractScopeSummary(scopePath);
  summary.kind = extractScopeKind(scopePath);

  return summary;
}

/**
 * Result of querying proof context for a single file
 */
export interface ProofContextResult {
  query: string;
  findings: Array<{
    id: string;
    category: string;
    summary: string;
    file: string;
    anchor: string | null;
    line?: number;
    severity?: 'risk' | 'debt' | 'observation';
    suggested_action?: 'promote' | 'scope' | 'monitor' | 'acknowledge';
    related_assertions?: string[];
    resolves?: string[];
    from: string;
    date: string;
    status?: string | undefined;
  }>;
  build_concerns: Array<{
    summary: string;
    file: string;
    from: string;
    date: string;
  }>;
  touch_count: number;
  last_touched: string | null;
  /**
   * Verified work items that shaped this file, most-recent-first by
   * `completed_at`. Optional and additive — absent when no proof chain entry
   * touches the queried file, so the JSON shape for old callers is unaffected.
   */
  shaped_by?: Array<{
    slug: string;
    kind?: string;
    completed_at: string;
    scope_summary: string;
  }>;
  /**
   * Files that change together with this one — the **Also changes with**
   * section. Two layers in one structure:
   *  - `proof_partners` — files co-touched across ≥2 verified work items,
   *    each flagged `hidden`/`imports`/`unknown` against the import graph;
   *  - `imported_by` / `imports` — the day-1 static import blast-radius from
   *    `code-graph.json`, deduped against the proof partners (a partner that
   *    is also an import edge appears once, as the proof row).
   *
   * Optional and additive (AC8): absent when there is neither proof co-change
   * nor any import-graph relationship for the queried file, so the JSON shape
   * for old callers is unaffected.
   */
  also_changes_with?: {
    proof_partners: Array<{
      file: string;
      coTouchCount: number;
      relation: 'hidden' | 'imports' | 'unknown';
      slugs: string[];
    }>;
    /** Total surviving proof partners (the cap footer reports "top 3 of N"). */
    proof_total: number;
    /** Files that import the query (who breaks if I change this), deduped & sorted. */
    imported_by: string[];
    /** Files the query imports, deduped against proof partners & sorted. */
    imports: string[];
    /** True when a same-stem test partner was suppressed from the proof layer. */
    suppressed_test_partner: boolean;
  };
}

/**
 * Proof chain entry structure for getProofContext (minimal projection)
 */
interface ProofChainEntryForContext {
  slug?: string;
  feature: string;
  completed_at?: string;
  kind?: string;
  scope_summary?: string;
  modules_touched?: string[];
  findings?: Array<{
    id: string;
    category: string;
    summary: string;
    file: string | null;
    anchor: string | null;
    line?: number;
    severity?: 'risk' | 'debt' | 'observation';
    suggested_action?: 'promote' | 'scope' | 'monitor' | 'acknowledge';
    related_assertions?: string[];
    resolves?: string[];
    status?: string;
  }>;
  build_concerns?: Array<{
    summary: string;
    file: string | null;
    severity?: 'risk' | 'debt' | 'observation';
    suggested_action?: 'promote' | 'scope' | 'monitor' | 'acknowledge';
  }>;
}

/**
 * Check if a stored file path matches a queried file path.
 *
 * Three-tier matching:
 * 1. Exact match — stored equals queried
 * 2. Path-suffix match — one ends with '/' + the other's basename
 * 3. Basename match — stored has no '/' (legacy) and basenames equal
 *
 * Path-boundary checks ('/' prefix) prevent false positives from partial names.
 *
 * Exported so the proof co-change engine can reuse the exact same matcher
 * (passed in as `FileMatcher`) rather than introducing a second one.
 *
 * @param stored - File path from proof chain finding/concern
 * @param queried - File path from user query
 * @returns Whether the files match
 */
export function fileMatches(stored: string, queried: string): boolean {
  // Exact match
  if (stored === queried) return true;

  const storedBasename = path.basename(stored);
  const queriedBasename = path.basename(queried);

  // Basenames must match for any non-exact match
  if (storedBasename !== queriedBasename) return false;

  // Both have directories: require one path to be a suffix of the other
  if (stored.includes('/') && queried.includes('/')) {
    return stored.endsWith('/' + queried) || queried.endsWith('/' + stored) || stored === queried;
  }

  // Path-suffix: stored (full path) ends with '/' + queriedBasename
  if (stored.includes('/') && stored.endsWith('/' + queriedBasename)) return true;

  // Path-suffix: queried (full path) ends with '/' + storedBasename
  if (queried.includes('/') && queried.endsWith('/' + storedBasename)) return true;

  // Basename match: stored has no '/' (legacy data)
  if (!stored.includes('/')) return true;

  return false;
}

/**
 * Resolve a queried file to its node identity in the import graph.
 *
 * @param query - The queried file (basename, relative, or absolute).
 * @param graph - The import graph.
 * @returns The matching node path, or `null` when the query is off-graph.
 */
function resolveQueryNode(query: string, graph: CodeGraph): string | null {
  if (graph.nodes.includes(query)) return query;
  return graph.nodes.find((n) => fileMatches(n, query)) ?? null;
}

/**
 * Build the optional `also_changes_with` structure for one queried file.
 *
 * Joins the proof co-change layer (`computeCoChange`) with the day-1 import
 * blast-radius layer (the query's edges in the graph), deduping the import
 * layer against the proof partners so a partner that is also an import edge
 * appears once (as the proof row). Returns `undefined` when neither layer has
 * any content, so the section is honestly absent (AC7) and old callers see no
 * new field (AC8).
 *
 * @param entries - Parsed proof-chain entries.
 * @param query - The queried file path.
 * @param graph - The import graph, or `null` when none is available.
 * @returns The assembled structure, or `undefined` when there is nothing to show.
 */
function assembleAlsoChangesWith(
  entries: ProofChainEntryForContext[],
  query: string,
  graph: CodeGraph | null,
): ProofContextResult['also_changes_with'] {
  const co = computeCoChange(entries, query, graph, fileMatches);

  // Day-1 import layer from the graph's edges for the query node.
  let importedBy: string[] = [];
  let imports: string[] = [];
  if (graph) {
    const queryNode = resolveQueryNode(query, graph);
    if (queryNode) {
      importedBy = Array.from(
        new Set(graph.edges.filter((e) => e.to === queryNode).map((e) => e.from)),
      ).sort();
      imports = Array.from(
        new Set(graph.edges.filter((e) => e.from === queryNode).map((e) => e.to)),
      ).sort();
    }
  }

  // Dedup: a file already shown as a proof partner is never repeated in the
  // import layer (it renders once, as the flagged proof row).
  const isProofPartner = (file: string): boolean =>
    co.partners.some((p: CoChangePartner) => p.file === file || fileMatches(p.file, file));
  importedBy = importedBy.filter((f) => !isProofPartner(f));
  imports = imports.filter((f) => !isProofPartner(f));

  const hasContent = co.partners.length > 0 || importedBy.length > 0 || imports.length > 0;
  if (!hasContent) return undefined;

  return {
    proof_partners: co.partners,
    proof_total: co.total,
    imported_by: importedBy,
    imports,
    suppressed_test_partner: co.suppressedTestPartner,
  };
}

/**
 * Query proof chain for context about specific files.
 *
 * Reads proof_chain.json, matches findings and build concerns against
 * queried file paths using three-tier matching (exact, path-suffix, basename).
 * Returns structured results per queried file.
 *
 * @param queries - Array of file paths to query
 * @param projectRoot - Project root directory (where .ana/ lives)
 * @param options - Optional configuration
 * @param options.includeAll - When true, returns all findings regardless of status
 * @returns Array of ProofContextResult, one per queried file
 */
export function getProofContext(queries: string[], projectRoot: string, options?: { includeAll?: boolean }): ProofContextResult[] {
  const chainPath = path.join(projectRoot, '.ana', 'proof_chain.json');

  // Read the import graph once (Phase 2 reader; `null` when absent). The day-1
  // import blast-radius layer is available the moment `ana init` has run — even
  // with no proof chain — so the graph is read regardless of chain presence,
  // and the no-chain case no longer short-circuits (it can still surface the
  // day-1 layer).
  const graph = readCodeGraph(projectRoot);

  let entries: ProofChainEntryForContext[] = [];
  if (fs.existsSync(chainPath)) {
    try {
      const content = fs.readFileSync(chainPath, 'utf-8');
      const chain = JSON.parse(content);
      entries = chain.entries ?? [];
    } catch {
      entries = [];
    }
  }

  return queries.map(query => {
    const matchedFindings: ProofContextResult['findings'] = [];
    const matchedConcerns: ProofContextResult['build_concerns'] = [];
    const touchDates: string[] = [];
    const shapedBy: NonNullable<ProofContextResult['shaped_by']> = [];

    for (const entry of entries) {
      let entryTouches = false;
      const entryDate = entry.completed_at ?? '';

      // Match findings
      for (const finding of entry.findings ?? []) {
        if (!finding.file) continue;
        // Filter by status: default excludes closed/promoted, includeAll returns everything
        if (!options?.includeAll && finding.status && finding.status !== 'active') continue;
        if (fileMatches(finding.file, query)) {
          const matched: ProofContextResult['findings'][0] = {
            id: finding.id,
            category: finding.category,
            summary: finding.summary,
            file: finding.file,
            anchor: finding.anchor,
            from: entry.feature,
            date: entryDate,
            status: finding.status,
          };
          if (finding.line !== undefined) matched.line = finding.line;
          if (finding.severity !== undefined) matched.severity = finding.severity;
          if (finding.suggested_action !== undefined) matched.suggested_action = finding.suggested_action;
          if (finding.related_assertions !== undefined) matched.related_assertions = finding.related_assertions;
          if (finding.resolves !== undefined) matched.resolves = finding.resolves;
          matchedFindings.push(matched);
          entryTouches = true;
        }
      }

      // Match build concerns
      for (const concern of entry.build_concerns ?? []) {
        if (!concern.file) continue;
        if (fileMatches(concern.file, query)) {
          matchedConcerns.push({
            summary: concern.summary,
            file: concern.file,
            from: entry.feature,
            date: entryDate,
          });
          entryTouches = true;
        }
      }

      if (entryTouches && entryDate) {
        touchDates.push(entryDate);
      }

      // A touching entry is a "shaper" of this file. Collect its intent so the
      // command can answer "why is this file the way it is". Guard every
      // optional read — legacy entries predate slug/kind/scope_summary.
      if (entryTouches) {
        const row: NonNullable<ProofContextResult['shaped_by']>[number] = {
          slug: entry.slug ?? '',
          completed_at: entryDate,
          scope_summary: entry.scope_summary ?? '',
        };
        if (entry.kind !== undefined) row.kind = entry.kind;
        shapedBy.push(row);
      }
    }

    // Sort dates descending to find most recent
    touchDates.sort((a, b) => b.localeCompare(a));

    // Rank shapers most-recent-first: recency answers "why is it like this now".
    shapedBy.sort((a, b) => b.completed_at.localeCompare(a.completed_at));

    const alsoChangesWith = assembleAlsoChangesWith(entries, query, graph);

    return {
      query,
      findings: matchedFindings,
      build_concerns: matchedConcerns,
      touch_count: touchDates.length,
      last_touched: touchDates[0] ?? null,
      ...(shapedBy.length > 0 ? { shaped_by: shapedBy } : {}),
      ...(alsoChangesWith ? { also_changes_with: alsoChangesWith } : {}),
    };
  });
}

/**
 * Convert an ISO date string to a human-readable relative time.
 *
 * Precision: "<1h ago" for <1 hour, "{N}h ago" for <24h,
 * "{N}d ago" for <30d, "{N}w ago" for >=30d.
 *
 * @param isoDate - ISO 8601 date string
 * @returns Human-readable relative time string (e.g., "2d ago", "1w ago")
 */
export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return '<1h ago';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

/**
 * Truncate text at a word boundary, appending '...' if truncated.
 *
 * If text fits within maxLength, returns it unchanged. Otherwise finds
 * the last space before the limit and truncates there. If no space is
 * found, hard-cuts at maxLength.
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Original text or truncated text with '...' appended
 */
export function truncateSummary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const lastSpace = text.lastIndexOf(' ', maxLength);
  const cutPoint = lastSpace > 0 ? lastSpace : maxLength;
  return text.substring(0, cutPoint) + '...';
}
