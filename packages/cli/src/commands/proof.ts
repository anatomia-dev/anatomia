/**
 * ana proof [slug] - Display proof chain entry for completed work
 *
 * With no arguments: displays a summary table of all proof history entries.
 * With a slug: displays a detailed terminal card for that specific entry.
 *
 * Reads .ana/proof_chain.json and displays:
 * - Summary table: slug, result, assertion ratio, date (no slug)
 * - Detail card: feature name, result, contract, assertions, timing, deviations (with slug)
 *
 * Read-only operation - creates no files, modifies nothing.
 *
 * Usage:
 *   ana proof               Display summary table of all proofs
 *   ana proof --json        Output full proof chain as JSON
 *   ana proof {slug}        Display proof detail for work item
 *   ana proof {slug} --json Output detail JSON format
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { globSync } from 'glob';
import type { ProofChainEntry, ProofChain, ComplianceAttestation } from '../types/proof.js';
import { computeCost, PRICES } from '../data/pricing.js';
import { getSkillsDir, getSkillsDirRel } from './platform.js';
import { findProjectRoot, validateSkillName } from '../utils/validators.js';
import {
  getProofContext,
  wrapJsonResponse,
  wrapJsonError,
  generateDashboard,
  computeChainHealth,
  computeHealthReport,
  computeFirstPassRate,
  computeStaleness,
  computeResolutionClaims,
  truncateSummary,
  findFindingById,
  formatRelativeTime,
  MIN_ENTRIES_FOR_TREND,
} from '../utils/proofSummary.js';
import type { ProofContextResult } from '../utils/proofSummary.js';
import {
  readArtifactBranch,
  getCurrentBranch,
  readCoAuthor,
  runGit,
  pullBeforeRead,
  commitAndPushProofChanges,
} from '../utils/git-operations.js';
import {
  headerBox,
  sectionRule,
  keyValueRows,
  statGrid,
  proportionBar,
  statusGlyph,
  formatTokenCount,
  columnWidth,
} from '../utils/render.js';
import type { KeyValueRow } from '../utils/render.js';

/**
 * Format an ISO timestamp as a local-timezone YYYY-MM-DD date string.
 * Uses getFullYear/getMonth/getDate (local timezone) — no ICU locale dependency.
 *
 * @param iso - ISO 8601 timestamp string
 * @returns Local date in YYYY-MM-DD format, or the raw string if unparseable
 */
function formatLocalDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
import { isWorktreeDirectory } from '../utils/worktree.js';

/**
 * Validate a surface name against ana.json surfaces configuration.
 *
 * @param projectRoot - Absolute path to the project root
 * @param surfaceName - The surface name to validate
 * @returns Validation result with available surfaces
 */
function validateSurface(
  projectRoot: string,
  surfaceName: string
): { valid: boolean; available: string[]; configured: boolean } {
  try {
    const anaJsonPath = path.join(projectRoot, '.ana', 'ana.json');
    if (!fs.existsSync(anaJsonPath)) {
      return { valid: false, available: [], configured: false };
    }
    const anaContent = JSON.parse(fs.readFileSync(anaJsonPath, 'utf-8'));
    const surfaces = anaContent.surfaces as Record<string, unknown> | undefined;
    if (!surfaces || Object.keys(surfaces).length === 0) {
      return { valid: false, available: [], configured: false };
    }
    const available = Object.keys(surfaces);
    return { valid: available.includes(surfaceName), available, configured: true };
  } catch {
    return { valid: false, available: [], configured: false };
  }
}

/**
 * Factory that creates an exitError closure for proof subcommands.
 *
 * Each subcommand captures its command name, proof chain path, and JSON mode.
 * The returned closure reads the chain, formats the error (JSON or console),
 * prints contextual hints based on the error code, and exits with code 1.
 *
 * Hints map: keys are error codes, values are arrays of hint lines.
 * Context-based hints are handled via a formatHint callback for complex cases
 * (e.g., checking context keys like 'promoted_to' or 'closed_by').
 *
 * @param opts - Factory options
 * @param opts.commandName - Command name for JSON envelope (e.g., "proof close")
 * @param opts.proofChainPath - Absolute path to proof_chain.json
 * @param opts.proofRoot - Project root for reading artifact branch
 * @param opts.useJson - Whether to output JSON format
 * @param opts.hints - Static hints map: error code → array of console lines
 * @param opts.formatHint - Callback for context-dependent hints; returns lines or null to fall through
 * @returns Closure that formats error output and exits with code 1
 */
function createExitError(opts: {
  commandName: string;
  proofChainPath: string;
  proofRoot: string;
  useJson: boolean;
  hints?: Record<string, string[]>;
  formatHint?: (code: string, context: Record<string, unknown>) => string[] | null;
}): (code: string, message: string, context?: Record<string, unknown>) => never {
  return (code: string, message: string, context: Record<string, unknown> = {}): never => {
    let chain: ProofChain | null = null;
    try {
      if (fs.existsSync(opts.proofChainPath)) {
        chain = JSON.parse(fs.readFileSync(opts.proofChainPath, 'utf-8'));
      }
    } catch {
      /* use null */
    }

    if (opts.useJson) {
      console.log(
        JSON.stringify(wrapJsonError(opts.commandName, code, message, context, chain), null, 2)
      );
    } else {
      console.error(chalk.red(`Error: ${message}`));
      // Try formatHint callback first (for context-dependent hints)
      const dynamicHints = opts.formatHint?.(code, context);
      if (dynamicHints) {
        for (const line of dynamicHints) {
          console.error(line);
        }
      } else if (opts.hints && opts.hints[code]) {
        for (const line of opts.hints[code]) {
          console.error(line);
        }
      }
    }
    process.exit(1);
  };
}

/**
 * Empty audit matrix payload for early-return paths where no proof data exists.
 */
const EMPTY_AUDIT_MATRIX = {
  total_active: 0,
  actionable_count: 0,
  monitoring_count: 0,
  by_severity: { risk: 0, debt: 0, observation: 0, unclassified: 0 },
  by_action: { promote: 0, scope: 0, monitor: 0, acknowledge: 0, unclassified: 0 },
  by_severity_action: {},
  recent_entries: [],
  stale_count: 0,
  stale_high: 0,
  stale_medium: 0,
};

/**
 * Severity ordering for display sorting: risk → debt → observation → unclassified
 */
const SEVERITY_ORDER: Record<string, number> = { risk: 0, debt: 1, observation: 2 };

/** A severity-classified item rendered in the Findings / Build Concerns lists. */
interface SeverityItem {
  summary: string;
  severity?: string;
  suggested_action?: string;
}

/**
 * Sort severity-classified items risk → debt → observation → unclassified.
 *
 * @param items - The items to sort (not mutated)
 * @returns A new array in severity order
 */
function sortBySeverity<T extends { severity?: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const wa = a.severity ? (SEVERITY_ORDER[a.severity] ?? 3) : 3;
    const wb = b.severity ? (SEVERITY_ORDER[b.severity] ?? 3) : 3;
    return wa - wb;
  });
}

/**
 * Build a severity roll-up string for a section rule, e.g. `1 debt · 4 obs`.
 *
 * @param items - The classified items to summarise
 * @returns A `·`-joined count-by-severity string (empty when no items)
 */
function severityRollup(items: readonly { severity?: string }[]): string {
  const counts: Record<string, number> = {};
  for (const it of items) counts[it.severity ?? 'unclassified'] = (counts[it.severity ?? 'unclassified'] ?? 0) + 1;
  const labels: Array<[string, string]> = [
    ['risk', 'risk'],
    ['debt', 'debt'],
    ['observation', 'obs'],
    ['unclassified', 'unclassified'],
  ];
  return labels
    .filter(([k]) => counts[k])
    .map(([k, label]) => `${counts[k]} ${label}`)
    .join(' · ');
}

/**
 * Render a severity-tagged list section (Findings / Build Concerns) onto `lines`.
 *
 * Leads with an inset rule carrying a severity roll-up, lists up to five items
 * with `[severity · action]` badges, and replaces any overflow with an
 * actionable `--json` pointer (never a bare "and N more").
 *
 * @param lines - The output buffer to append to
 * @param title - The section label (e.g. `Findings`)
 * @param slug - The proof slug, for the `--json` overflow pointer
 * @param items - The classified items to render
 */
function renderSeverityList(
  lines: string[],
  title: string,
  slug: string,
  items: readonly SeverityItem[]
): void {
  if (items.length === 0) return;
  const sorted = sortBySeverity(items);
  lines.push('');
  lines.push(sectionRule(title, { rollup: severityRollup(sorted) }));
  const MAX_DISPLAY = 5;
  for (const it of sorted.slice(0, MAX_DISPLAY)) {
    if (it.severity && it.suggested_action) {
      lines.push(`  [${it.severity} · ${it.suggested_action}] ${it.summary}`);
    } else {
      lines.push(`  ${it.summary}`);
    }
  }
  if (sorted.length > MAX_DISPLAY) {
    lines.push(`  ${sorted.length - MAX_DISPLAY} more — see \`ana proof ${slug} --json\``);
  }
}

/**
 * Render the human-readable proof card for `ana proof <slug>`.
 *
 * Built entirely on the shared render vocabulary (utils/render.ts): a rounded
 * header box, inset section rules with roll-ups, a contract proportion bar,
 * aligned timing rows, severity-tagged finding lists, and a borderless
 * Provenance stat grid with a TOTAL footer. Presentation only — it never reads
 * or mutates proof data and renders fields that already exist on the entry.
 *
 * @param entry - Proof chain entry to display
 * @returns Formatted terminal card string
 */
export function formatHumanReadable(entry: ProofChainEntry): string {
  const lines: string[] = [];
  const width = 71;

  // ── Provenance cost summary (needed up front for the header subtitle) ──
  let provTotalCost = 0;
  let provPriced = false;
  let provTableVersion = '';
  let provUnpriced = 0;
  if (entry.process) {
    for (const s of entry.process.sessions) {
      if (!s.derived) continue;
      const c = computeCost(s.derived.tokens, s.derived.model, { priceTable: PRICES });
      if (c.priced) {
        provTotalCost += c.cost_usd;
        provPriced = true;
      } else {
        provUnpriced += 1;
      }
      // Source the displayed table version from the CostResult — the version the
      // cost was actually computed against — never the per-record stamp (which
      // could disagree once the shared table moves forward).
      if (!provTableVersion) provTableVersion = c.price_table_version;
    }
  }

  // ── Header ──
  const completedDate = new Date(entry.completed_at);
  const dateStr = formatLocalDate(entry.completed_at);
  const timeStr = completedDate.toTimeString().slice(0, 5);
  const timestamp = `${dateStr} ${timeStr}`;

  const verdictGlyph = entry.result === 'PASS' ? chalk.green('✓') : chalk.red('✗');
  // Truncate the feature so a long title never shears the rounded box border.
  const headlinePrefixWidth = 2 + 1 + 1 + entry.result.length + 3; // "  G W · "
  const maxFeature = width - 2 - headlinePrefixWidth;
  const feature =
    entry.feature.length > maxFeature
      ? entry.feature.slice(0, maxFeature - 1) + '…'
      : entry.feature;
  const headline = `  ${verdictGlyph} ${entry.result} · ${feature}`;

  const subtitleSegments = [entry.surface, `${entry.timing.total_minutes} min`].filter(
    (x): x is string => Boolean(x)
  );
  let subtitleLeft = `  ${subtitleSegments.join(' · ')}`;
  if (provPriced) subtitleLeft += ` · $${provTotalCost.toFixed(2)}`;

  lines.push(
    ...headerBox({
      title: headline,
      subtitleLeft,
      subtitleRight: timestamp,
      corners: 'rounded',
      width,
    })
  );

  // ── Contract ──
  const ct = entry.contract;
  const clean = ct.unsatisfied === 0 && ct.deviated === 0;
  let rollup = `${ct.satisfied}/${ct.total}`;
  if (clean) {
    rollup += ` ${chalk.green('✓')}`;
  } else {
    if (ct.unsatisfied > 0) rollup += ` · ${ct.unsatisfied} ${chalk.red('✗')}`;
    if (ct.deviated > 0) rollup += ` · ${ct.deviated} ${chalk.yellow('⚠')}`;
  }
  lines.push('');
  lines.push(sectionRule('Contract', { rollup, width }));
  lines.push(
    '  ' +
      proportionBar(ct.satisfied, ct.total, {
        width: 64,
        filledColor: chalk.green,
        emptyColor: chalk.gray,
      })
  );
  const countedLead = clean ? `${chalk.green('✓')} ` : '';
  lines.push(
    `  ${countedLead}${ct.satisfied} satisfied · ${ct.unsatisfied} unsatisfied · ${ct.deviated} deviated`
  );
  // Exceptional assertions render individually (the old standalone Deviations
  // section folds in here); passing assertions stay collapsed in the line above.
  for (const a of entry.assertions) {
    if (a.status === 'SATISFIED') continue;
    lines.push(`  ${statusGlyph(a.status)} ${a.id}  ${a.says}`);
    if (a.status === 'DEVIATED' && a.deviation) {
      lines.push(`        → ${a.deviation}`);
    }
  }

  // ── Timing ──
  lines.push('');
  lines.push(sectionRule('Timing', { width }));
  const timingRows: KeyValueRow[] = [
    { label: 'Total', value: `${entry.timing.total_minutes} min` },
  ];
  if (entry.timing.think != null) timingRows.push({ label: 'Think', value: `${entry.timing.think} min` });
  if (entry.timing.plan != null) timingRows.push({ label: 'Plan', value: `${entry.timing.plan} min` });
  if (entry.timing.build != null) timingRows.push({ label: 'Build', value: `${entry.timing.build} min` });
  if (entry.timing.verify != null) timingRows.push({ label: 'Verify', value: `${entry.timing.verify} min` });
  lines.push(...keyValueRows(timingRows, { labelWidth: 12 }));

  if (entry.timing.segments) {
    const phaseSegments = entry.timing.segments.filter((s) => s.phase != null);
    if (phaseSegments.length > 0) {
      lines.push('');
      lines.push(chalk.bold('  Phase breakdown'));
      lines.push(
        ...keyValueRows(
          phaseSegments.map((seg) => ({
            label: `${seg.stage === 'build' ? 'Build' : 'Verify'} ${seg.phase}`,
            value: `${seg.minutes} min`,
          })),
          { labelWidth: 12 }
        )
      );
    }
  }

  // ── Findings / Build Concerns (shared severity-list helper) ──
  renderSeverityList(lines, 'Findings', entry.slug, entry.findings || []);
  renderSeverityList(lines, 'Build Concerns', entry.slug, entry.build_concerns || []);

  // ── Commit Hygiene ──
  const commitHygiene = entry.commit_hygiene || [];
  if (commitHygiene.length > 0) {
    lines.push('');
    lines.push(sectionRule('Commit Hygiene', { width }));
    const MAX_DISPLAY = 5;
    for (const f of commitHygiene.slice(0, MAX_DISPLAY)) {
      lines.push(`  ${chalk.yellow('⚠')} ${f.message}`);
    }
    if (commitHygiene.length > MAX_DISPLAY) {
      lines.push(
        `  ${commitHygiene.length - MAX_DISPLAY} more — see \`ana proof ${entry.slug} --json\``
      );
    }
  }

  // ── Provenance (display-only; NEVER influences PASS/FAIL) ──
  if (entry.process) {
    const p = entry.process;
    lines.push('');
    lines.push(sectionRule('Provenance', { width }));

    // Model-collapse only when every session has counts AND shares one model;
    // a single differing or counts-unavailable session keeps models per-row.
    const allSameModel =
      p.sessions.length > 0 &&
      p.sessions.every((s) => s.derived != null) &&
      p.sessions.every((s) => s.derived!.model === p.sessions[0]!.derived!.model);

    // Per-session labels with a rework index (e.g. `build 2`), computed once in
    // dataset order so the indices are stable across the unavailable + grid passes.
    const roleSeen: Record<string, number> = {};
    const labelOf = new Map<(typeof p.sessions)[number], string>();
    for (const s of p.sessions) {
      const n = (roleSeen[s.role] = (roleSeen[s.role] ?? 0) + 1);
      let label = n > 1 ? `${s.role} ${n}` : s.role;
      if (!allSameModel) {
        const m = (s.derived?.model || s.model).replace(/^claude-/, '');
        label += ` · ${m}`;
      }
      labelOf.set(s, label);
    }

    if (allSameModel) {
      lines.push(`  ${chalk.gray('model')}  ${p.sessions[0]!.derived!.model}`);
    }

    // Counts-unavailable sessions render loudly (Verified-over-trusted) as free
    // lines — kept out of the grid so they never widen a numeric column.
    for (const s of p.sessions) {
      if (s.derived) continue;
      lines.push(`  ${labelOf.get(s)}  ${chalk.gray('counts unavailable')}`);
    }

    // Derived sessions → aligned grid with a TOTAL footer under a rule. The
    // in/out/cache columns surface the cache tokens that already exist on the
    // schema (the credibility fix). Codex sessions (cache_create = 0) render
    // their cache_read figure as-is.
    const rows: string[][] = [];
    for (const s of p.sessions) {
      const d = s.derived;
      if (!d) continue;
      const cost = computeCost(d.tokens, d.model, { priceTable: PRICES });
      // Unpriced model -> "n/a", never a misleading "$0.00".
      const costLabel = cost.priced ? `$${cost.cost_usd.toFixed(2)}` : 'n/a';
      rows.push([
        labelOf.get(s)!,
        String(d.turns),
        String(d.tool_calls),
        formatTokenCount(d.tokens.input),
        formatTokenCount(d.tokens.output),
        formatTokenCount(d.tokens.cache_create + d.tokens.cache_read),
        costLabel,
      ]);
    }
    if (rows.length > 0) {
      // Unpriced count rides the (roomy) left label; the (table vX) version is
      // the only trailing token — keeps the TOTAL line within 80 columns even
      // when a long suffix would otherwise overflow past the grid's right edge.
      const sessionCount = `${p.sessions.length} session${p.sessions.length === 1 ? '' : 's'}`;
      const totalLabel =
        `TOTAL  ${sessionCount}` + (provUnpriced > 0 ? ` · ${provUnpriced} unpriced` : '');
      lines.push(
        ...statGrid({
          columns: [
            { align: 'left', maxWidth: 22 },
            { align: 'right' },
            { align: 'right' },
            { align: 'right' },
            { align: 'right' },
            { align: 'right' },
            { align: 'right' },
          ],
          header: ['session', 'turns', 'tools', 'in', 'out', 'cache', 'cost'],
          rows,
          footer: {
            // When no session priced, the total is a non-figure: showing
            // "$0.00" would advertise a paid run as free (e.g. a new model id
            // missing from pricing.ts). Mirror the per-session "n/a" honestly.
            label: totalLabel,
            value: provPriced ? `$${provTotalCost.toFixed(2)}` : 'n/a',
            ...(provTableVersion ? { trailing: `(table ${provTableVersion})` } : {}),
          },
        })
      );
    }

    // Churn (work-item level).
    const churnFiles = Object.keys(p.module_churn).length;
    if (churnFiles > 0) {
      let added = 0;
      let deleted = 0;
      for (const c of Object.values(p.module_churn)) {
        added += c.added;
        deleted += c.deleted;
      }
      lines.push(`  ${chalk.gray('churn')}  ${churnFiles} files · +${added}/−${deleted}`);
    }

    // Completeness (display-only; optional-guarded for pre-Phase-2 entries).
    const comp = p.completeness;
    if (comp) {
      const counts = `plan ${comp.present.plan}/${comp.expected.plan} · build ${comp.present.build}/${comp.expected.build} · verify ${comp.present.verify}/${comp.expected.verify}`;
      if (comp.complete) {
        lines.push(`  completeness  ${chalk.green('✓')} complete (${counts})`);
      } else {
        lines.push(`  completeness  ${chalk.yellow('⚠')} incomplete — ${counts}`);
      }
    }
  }

  // ── Session Attestation (Phase 2; display-only; NEVER influences PASS/FAIL) ──
  if (entry.compliance?.length) {
    lines.push(...renderSessionAttestation(entry.compliance, entry.slug, width));
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Abbreviate a `sha256:`-prefixed byte-identity hash for compact display.
 *
 * @param hash - The full `sha256:<hex>` hash (or any string)
 * @returns A short `sha256:abcdef…` form, or `—` when absent
 */
function shortHash(hash: string): string {
  if (!hash) return '—';
  const m = hash.match(/^sha256:([0-9a-f]+)/);
  if (m && m[1]) return `sha256:${m[1].slice(0, 6)}…`;
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash;
}

/**
 * Render the Session Attestation section — the deterministic, coverage-aware
 * behavioral verdicts for each captured agent transcript (Phase 2).
 *
 * Module-private (`learn-session-memory-C1`: do not over-export from proof.ts) and
 * PRESENTATION ONLY — it reads the already-assembled, already-scrubbed records and
 * mutates nothing. A `violated` verdict renders with a red glyph but the headline
 * PASS/FAIL is computed entirely upstream and is never touched here: behavioral
 * verdicts are evidence, never a gate.
 *
 * @param compliance - The committed behavioral records attached to the entry
 * @param slug - The work-item slug (for the `--json` overflow hint)
 * @param width - The card render width
 * @returns The section lines (empty when there are no records)
 */
function renderSessionAttestation(
  compliance: ComplianceAttestation[],
  slug: string,
  width: number,
): string[] {
  const lines: string[] = [];
  if (compliance.length === 0) return lines;

  lines.push('');
  const transcripts = `${compliance.length} transcript${compliance.length === 1 ? '' : 's'}`;
  lines.push(sectionRule('Session Attestation', { width, rollup: chalk.gray(transcripts) }));

  // Engine identity (shared across records — read off the first).
  const first = compliance[0]!;
  lines.push(
    `  ${chalk.gray('core')} v${first.anatrace_core_version || '?'} · ${chalk.gray('framework')} ${first.framework || '?'}`,
  );

  const MAX_DETAIL = 3;
  // Stable rework index per role (e.g. `build 2`), mirroring the Provenance section.
  const roleSeen: Record<string, number> = {};
  for (const rec of compliance) {
    const n = (roleSeen[rec.role] = (roleSeen[rec.role] ?? 0) + 1);
    const label = n > 1 ? `${rec.role} ${n}` : rec.role;

    let satisfied = 0;
    let violated = 0;
    let unverifiable = 0;
    for (const v of rec.verdicts) {
      if (v.status === 'satisfied') satisfied += 1;
      else if (v.status === 'violated') violated += 1;
      else unverifiable += 1;
    }
    // A violated count renders red (a loud signal) but never gates.
    const violatedLabel = violated > 0 ? chalk.red(`${violated} violated`) : `${violated} violated`;
    lines.push(
      `  ${label} · ${rec.coverage.total} claims   ${chalk.green('✓')} ${satisfied} satisfied · ${violatedLabel} · ${unverifiable} unverifiable`,
    );
    lines.push(
      `        coverage ${rec.coverage.fully_checked}/${rec.coverage.total} checked · ${rec.coverage.unverifiable} unverifiable`,
    );

    // Compact (already-scrubbed) detail for the notable verdicts only.
    const notable = rec.verdicts.filter((v) => v.status !== 'satisfied');
    for (const v of notable.slice(0, MAX_DETAIL)) {
      const glyph = v.status === 'violated' ? chalk.red('⚠') : chalk.yellow('⚠');
      lines.push(`        ${glyph} ${v.claim_id}  ${v.status} (${v.reason})`);
    }
    if (notable.length > MAX_DETAIL) {
      lines.push(`        ${notable.length - MAX_DETAIL} more — see \`ana proof ${slug} --json\``);
    }

    lines.push(
      `        mandate ${shortHash(rec.mandate_hash)} · transcript ${shortHash(rec.transcript_hash)}`,
    );
    if (!rec.complete) {
      lines.push(`        ${chalk.yellow('⚠')} incomplete coverage`);
    }
  }

  const incomplete = compliance.filter((c) => !c.complete).length;
  if (incomplete > 0) {
    lines.push(
      `  ${chalk.yellow('⚠')} ${incomplete} record${incomplete === 1 ? '' : 's'} ${incomplete === 1 ? 'has' : 'have'} incomplete coverage — verdicts are evidence, never a gate.`,
    );
  }
  return lines;
}

/**
 * Format health display for terminal output.
 *
 * Accepts either a HealthReport object or `0` for the zero-runs case
 * (chain missing or empty). Renders on the shared `render.ts` vocabulary —
 * a rounded identity box, inset `sectionRule` headers, aligned `keyValueRows`,
 * and a `statGrid` Hot Spots table — so it converges with the proof and scan
 * cards. Presentation-only: the `HealthReport` shape and every section-omission
 * rule are preserved exactly.
 *
 * @param reportOrZero - HealthReport or 0 for zero-runs
 * @returns Formatted terminal output string
 */
export function formatHealthDisplay(
  reportOrZero: import('../types/proof.js').HealthReport | 0
): string {
  const lines: string[] = [];
  const width = 71;
  const isZero = reportOrZero === 0;
  const runs = isZero ? 0 : reportOrZero.runs;

  // Date for header
  const dateStr = formatLocalDate(new Date().toISOString());

  // Rounded identity box — converges with the proof and scan cards.
  const runLabel = `${runs} ${runs !== 1 ? 'runs' : 'run'}`;
  lines.push(
    ...headerBox({
      title: '  ana proof health',
      subtitleLeft: `  ${runLabel}`,
      subtitleRight: dateStr,
      corners: 'rounded',
      width,
    })
  );

  // Zero-runs: just show "No data." and return
  if (isZero || runs === 0) {
    lines.push('');
    lines.push('  No data.');
    lines.push('');
    return lines.join('\n');
  }

  const report = reportOrZero;

  // \u2500\u2500 Quality (renamed from Trajectory) \u2500\u2500
  lines.push('');
  lines.push(sectionRule('Quality', { width }));
  const qualityRows: KeyValueRow[] = [];
  if (report.trajectory.trend === 'no_classified_data') {
    qualityRows.push({ label: 'Trend', value: 'no classified data' });
    qualityRows.push({ label: 'Risks/run', value: 'no classified data' });
  } else {
    const trendDisplay =
      report.trajectory.trend === 'insufficient_data'
        ? `insufficient data (need ${MIN_ENTRIES_FOR_TREND}+ runs)`
        : report.trajectory.trend;
    qualityRows.push({ label: 'Trend', value: trendDisplay });

    const last5 =
      report.trajectory.risks_per_run_last5 !== null
        ? String(report.trajectory.risks_per_run_last5)
        : 'no data';
    const all =
      report.trajectory.risks_per_run_all !== null
        ? String(report.trajectory.risks_per_run_all)
        : 'no data';
    qualityRows.push({ label: 'Risks/run', value: `${last5} (last 5) \u00b7 ${all} (all)` });
  }
  lines.push(...keyValueRows(qualityRows, { labelWidth: 12 }));

  // ── Verification — always shown when runs > 0 ──
  if (report.verification) {
    lines.push('');
    lines.push(sectionRule('Verification', { width }));
    lines.push(
      ...keyValueRows(
        [
          {
            label: 'First-pass',
            value: `${report.verification.first_pass_pct}% (${report.verification.first_pass_count} of ${report.verification.total_runs})`,
          },
          {
            label: 'Caught',
            value: `${report.verification.total_caught} issues before shipping`,
          },
        ],
        { labelWidth: 12 }
      )
    );
  }

  // ── Pipeline — omitted when fewer than 3 entries have timing ──
  if (report.pipeline) {
    lines.push('');
    lines.push(sectionRule('Pipeline', { width }));

    const parts: string[] = [];
    if (report.pipeline.median_scope !== null) parts.push(`scope ${report.pipeline.median_scope}m`);
    if (report.pipeline.median_plan !== null) parts.push(`plan ${report.pipeline.median_plan}m`);
    if (report.pipeline.median_build !== null) parts.push(`build ${report.pipeline.median_build}m`);
    if (report.pipeline.median_verify !== null)
      parts.push(`verify ${report.pipeline.median_verify}m`);
    const breakdown = parts.length > 0 ? ` (${parts.join(' \u00b7 ')})` : '';
    lines.push(
      ...keyValueRows(
        [{ label: 'Median', value: `${report.pipeline.median_total}m${breakdown}` }],
        { labelWidth: 12 }
      )
    );
  }

  // Hot Spots section (renamed from Hot Modules) — omit when empty
  if (report.hot_modules.length > 0) {
    // Build basename map for disambiguation
    const basenameCounts = new Map<string, number>();
    for (const mod of report.hot_modules) {
      const base = path.basename(mod.file);
      basenameCounts.set(base, (basenameCounts.get(base) ?? 0) + 1);
    }

    lines.push('');
    lines.push(sectionRule('Hot Spots', { width }));

    const rows: string[][] = [];
    for (const mod of report.hot_modules) {
      const base = path.basename(mod.file);
      const displayName =
        (basenameCounts.get(base) ?? 0) > 1
          ? `${path.basename(path.dirname(mod.file))}/${base}`
          : base;

      const sevParts: string[] = [];
      if (mod.by_severity.risk > 0) sevParts.push(`${mod.by_severity.risk} risk`);
      if (mod.by_severity.debt > 0) sevParts.push(`${mod.by_severity.debt} debt`);
      if (mod.by_severity.observation > 0) sevParts.push(`${mod.by_severity.observation} obs`);
      if (mod.by_severity.unclassified > 0)
        sevParts.push(`${mod.by_severity.unclassified} unclassified`);
      const findingsText = `${mod.finding_count} findings (${sevParts.join(', ')})`;

      // Name/findings cells stay PLAIN so statGrid's maxWidth truncation works.
      rows.push([displayName, findingsText, `${mod.entry_count} runs`]);
    }

    lines.push(
      ...statGrid({
        columns: [
          { align: 'left', minWidth: 8, maxWidth: 22 },
          { align: 'left' },
          { align: 'right' },
        ],
        rows,
      })
    );
  }

  // Next Actions section — merged Promote + Recurring, capped at 5
  const MAX_NEXT_ACTIONS = 5;
  const nextActions: Array<{ label: string; sortKey: number }> = [];

  // Promote candidates → "Promote:" with severity badge
  const promoteCandidates = report.promotion_candidates.filter(
    (c) => c.suggested_action === 'promote'
  );
  for (const c of promoteCandidates) {
    const summary = truncateSummary(c.summary, 100);
    const fileSuffix = c.file ? ` \u2014 ${path.basename(c.file)}` : '';
    nextActions.push({
      label: `  Promote: [${c.severity}] ${summary}${fileSuffix}`,
      sortKey: c.recurrence_count ?? 1,
    });
  }

  // Recurring scope candidates → "Fix:" with entry count
  const recurringCandidates = report.promotion_candidates.filter(
    (c) => c.suggested_action === 'scope' && (c.recurrence_count ?? 0) >= 2
  );
  for (const c of recurringCandidates) {
    const summary = truncateSummary(c.summary, 100);
    const fileSuffix = c.file ? ` \u2014 ${path.basename(c.file)}` : '';
    nextActions.push({
      label: `  Fix: ${summary}${fileSuffix} (${c.recurrence_count} entries)`,
      sortKey: c.recurrence_count ?? 1,
    });
  }

  // Sort by recurrence count descending, cap at 5
  nextActions.sort((a, b) => b.sortKey - a.sortKey);
  const cappedActions = nextActions.slice(0, MAX_NEXT_ACTIONS);

  if (cappedActions.length > 0) {
    lines.push('');
    lines.push(sectionRule('Next Actions', { width }));

    for (const action of cappedActions) {
      lines.push(action.label);
    }
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Sort proof chain entries by recency — most recent first.
 *
 * Primary key: `completed_at` descending, with missing/undefined timestamps
 * pushed to the end. Secondary key (the tie-break): original append index
 * descending, so among entries with equal or missing `completed_at` the
 * last-appended entry sorts first. Append order is oldest-first
 * (`chain.entries.push`), so the highest index is the most recently recorded.
 *
 * @param entries - Proof chain entries in their original append order.
 * @returns A new array sorted most-recent-first; the input is not mutated.
 */
function sortEntriesByRecency(entries: ProofChainEntry[]): ProofChainEntry[] {
  return entries
    .map((entry, idx) => ({ entry, idx }))
    .sort((a, b) => {
      const aAt = a.entry.completed_at;
      const bAt = b.entry.completed_at;
      if (aAt && bAt) {
        const cmp = bAt.localeCompare(aAt);
        if (cmp !== 0) return cmp;
      } else if (!aAt && bAt) {
        return 1;
      } else if (aAt && !bAt) {
        return -1;
      }
      // Equal or both-missing completed_at: last-appended (higher idx) wins.
      return b.idx - a.idx;
    })
    .map(({ entry }) => entry);
}

/**
 * Format the human-readable proof summary table for the list view.
 *
 * Renders on the shared `render.ts` vocabulary — a lighter inset
 * `── Proof History ──` rule (a multi-row list is not a single-subject card) over
 * a borderless `statGrid`. The recency sort, PASS/FAIL coloring, the dim `--`
 * surface fallback, and slug truncation (now via the Slug column's `maxWidth`)
 * are all preserved.
 *
 * @param entries - Proof chain entries to display
 * @returns Formatted table string
 */
export function formatListTable(entries: ProofChainEntry[]): string {
  const lines: string[] = [];
  const width = 71;

  lines.push('');
  lines.push(sectionRule('Proof History', { width }));

  // Sort entries: most recent first, undefined completed_at pushed to end.
  const sorted = sortEntriesByRecency(entries);

  const rows: string[][] = sorted.map((entry) => {
    // Slug stays PLAIN so the Slug column's maxWidth truncation applies.
    const resultColor = entry.result === 'PASS' ? chalk.green : chalk.red;
    const ratio = `${entry.contract.satisfied}/${entry.contract.total}`;
    const surfaceRaw = entry.surface ?? '';
    const surfaceDisplay = surfaceRaw || chalk.dim('--');
    const date = entry.completed_at ? formatLocalDate(entry.completed_at) : '';
    return [entry.slug, resultColor(entry.result), ratio, surfaceDisplay, date];
  });

  lines.push(
    ...statGrid({
      columns: [
        { align: 'left', minWidth: 8, maxWidth: 20 },
        { align: 'left' },
        { align: 'left' },
        { align: 'left' },
        { align: 'left' },
      ],
      header: ['Slug', 'Result', 'Assertions', 'Surface', 'Date'],
      rows,
    })
  );

  lines.push('');

  return lines.join('\n');
}

/**
 * Handle the root `proof` command — list all proofs or show detail for a slug.
 *
 * @param slug - Optional work item slug to display proof for
 * @param options - Command options
 * @param options.json - Output JSON format
 * @param options.last - Select the most-recent proof instead of naming a slug
 */
async function handleProofList(
  slug: string | undefined,
  options: { json?: boolean; last?: boolean }
): Promise<void> {
  const proofRoot = findProjectRoot();
  const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');

  // Mutual exclusion: a slug and --last are two different selectors.
  if (slug && options.last) {
    console.error(chalk.red('Error: Cannot combine a slug with --last. Pick one selector.'));
    process.exit(1);
  }

  // --last view: resolve the most-recent entry, then render through the
  // existing detail path. Use the graceful read (missing/corrupt → empty),
  // never the detail-view hard exit that crashes on a fresh repo.
  if (options.last) {
    let chain: ProofChain = { entries: [] };
    if (fs.existsSync(proofChainPath)) {
      try {
        const content = fs.readFileSync(proofChainPath, 'utf-8');
        chain = JSON.parse(content);
      } catch {
        // If file is corrupt, treat as empty
        chain = { entries: [] };
      }
    }

    const entries = chain.entries ?? [];

    // Resolve "most recent" through the shared comparator.
    const entry = entries.length > 0 ? sortEntriesByRecency(entries)[0] : undefined;
    if (!entry) {
      // Mirror the list-view empty branch — never the detail-view hard error.
      if (options.json) {
        console.log(JSON.stringify(wrapJsonResponse('proof', { entries }, chain), null, 2));
      } else {
        console.log('No proofs yet.');
      }
      return;
    }

    // Render through the IDENTICAL detail branch, using the resolved entry's
    // real slug so the JSON envelope is byte-shape-identical to `ana proof <slug>`.
    if (options.json) {
      console.log(JSON.stringify(wrapJsonResponse(`proof ${entry.slug}`, entry, chain), null, 2));
    } else {
      console.log(formatHumanReadable(entry));
    }
    return;
  }

  // List view: no slug provided
  if (!slug) {
    // Read chain if it exists
    let chain: ProofChain = { entries: [] };
    if (fs.existsSync(proofChainPath)) {
      try {
        const content = fs.readFileSync(proofChainPath, 'utf-8');
        chain = JSON.parse(content);
      } catch {
        // If file is corrupt, treat as empty
        chain = { entries: [] };
      }
    }

    const entries = chain.entries ?? [];

    if (options.json) {
      console.log(JSON.stringify(wrapJsonResponse('proof', { entries }, chain), null, 2));
    } else if (entries.length === 0) {
      console.log('No proofs yet.');
    } else {
      console.log(formatListTable(entries));
    }
    return;
  }

  // Detail view: slug provided (existing behavior)

  // Check if proof_chain.json exists
  if (!fs.existsSync(proofChainPath)) {
    console.error(chalk.red('Error: No proof chain found at .ana/proof_chain.json'));
    console.error('');
    console.error('Complete work items with `ana work complete {slug}` to generate proof entries.');
    process.exit(1);
  }

  // Read and parse proof chain
  let chain: ProofChain;
  try {
    const content = fs.readFileSync(proofChainPath, 'utf-8');
    chain = JSON.parse(content);
  } catch (error) {
    console.error(chalk.red('Error: Failed to parse proof_chain.json'));
    if (error instanceof Error) {
      console.error(chalk.gray(error.message));
    }
    process.exit(1);
  }

  // Find entry by slug
  const entry = chain.entries?.find((e) => e.slug === slug);
  if (!entry) {
    console.error(chalk.red(`Error: No proof found for slug "${slug}"`));
    console.error('');
    console.error('Run `ana work status` to see completed work items.');
    process.exit(1);
  }

  // Format and output
  if (options.json) {
    console.log(JSON.stringify(wrapJsonResponse(`proof ${slug}`, entry, chain), null, 2));
  } else {
    console.log(formatHumanReadable(entry));
  }
}

/**
 * Handle the `proof context` subcommand — query proof chain for context about specific files.
 *
 * @param files - File paths to query
 * @param options - Command options
 * @param options.json - Output JSON format
 * @param parentJson - Whether the parent command's --json flag was set
 */
async function handleProofContext(
  files: string[],
  options: { json?: boolean },
  parentJson: boolean
): Promise<void> {
  const proofRoot = findProjectRoot();
  const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');

  // Check if proof chain exists
  if (!fs.existsSync(proofChainPath)) {
    console.log('No proof chain found. Complete pipeline cycles to build proof context.');
    return;
  }

  const results = getProofContext(files, proofRoot);

  const useJson = options.json || parentJson;

  if (useJson) {
    const chainContent = fs.readFileSync(proofChainPath, 'utf-8');
    const chain: ProofChain = JSON.parse(chainContent);
    console.log(JSON.stringify(wrapJsonResponse('proof context', { results }, chain), null, 2));
    return;
  }

  // Human-readable output
  const outputs: string[] = [];
  for (const result of results) {
    outputs.push(formatContextResult(result));
  }

  console.log(outputs.join('\n───\n\n'));
}

/**
 * Handle the `proof close` subcommand — close active findings with a reason.
 *
 * @param ids - Finding IDs to close
 * @param options - Command options
 * @param options.reason - Why these findings no longer apply
 * @param options.dryRun - Show what would happen without making changes
 * @param options.json - Output JSON format
 * @param parentJson - Whether the parent command's --json flag was set
 */
async function handleProofClose(
  ids: string[],
  options: { reason?: string; dryRun?: boolean; json?: boolean },
  parentJson: boolean
): Promise<void> {
  const proofRoot = findProjectRoot();
  const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
  const useJson = options.json || parentJson;

  // @ana A009
  const exitError = createExitError({
    commandName: 'proof close',
    proofChainPath,
    proofRoot,
    useJson,
    hints: {
      REASON_REQUIRED: [
        '  Proof closures must explain why the finding no longer applies.',
        '  Usage: ana proof close {id} --reason "explanation"',
      ],
      FINDING_NOT_FOUND: ['  Run `ana proof audit` to see active findings.'],
    },
    formatHint: (code, context) => {
      if (code === 'ALREADY_CLOSED' && context['closed_by']) {
        const lines = [
          `  Closed by: ${context['closed_by']} on ${context['closed_at'] ?? 'unknown'}`,
        ];
        if (context['closed_reason']) {
          lines.push(`  Reason: ${context['closed_reason']}`);
        }
        return lines;
      }
      if (code === 'WRONG_BRANCH') {
        if (isWorktreeDirectory()) {
          return [
            "  You're in a worktree. Proof commands modify the proof chain on the artifact branch. Run from the main project directory.",
          ];
        }
        const artifactBranch = readArtifactBranch(proofRoot);
        return [`  Run: git checkout ${artifactBranch}`];
      }
      return null;
    },
  });

  // Validate --reason is provided
  if (!options.reason) {
    exitError('REASON_REQUIRED', '--reason is required.');
    return;
  }

  // Branch check: must be on artifact branch (skip for dry-run — it's read-only)
  if (!options.dryRun) {
    const artifactBranch = readArtifactBranch(proofRoot);
    const currentBranch = getCurrentBranch();
    if (currentBranch !== artifactBranch) {
      exitError('WRONG_BRANCH', `Wrong branch. Switch to \`${artifactBranch}\` to close findings.`);
      return;
    }

    pullBeforeRead(proofRoot);
  }

  // Read chain
  if (!fs.existsSync(proofChainPath)) {
    exitError('NO_PROOF_CHAIN', 'No proof chain found.');
    return;
  }

  let chain: ProofChain;
  try {
    chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
  } catch {
    exitError('PARSE_ERROR', 'Failed to parse proof_chain.json.');
    return;
  }

  // Process each ID — collect results
  const closed: Array<{
    id: string;
    category: string;
    summary: string;
    file: string | null;
    severity: string | null;
    previous_status: string;
    entry_slug: string;
    entry_feature: string;
  }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const id of ids) {
    const result = findFindingById(chain, id);

    if (!result) {
      skipped.push({ id, reason: 'not found' });
      continue;
    }

    const foundFinding = result.finding as ProofChainEntry['findings'][0];
    const foundEntry = result.entry as ProofChainEntry;

    if (foundFinding.status === 'closed') {
      skipped.push({ id, reason: 'already closed' });
      continue;
    }

    const previousStatus = foundFinding.status ?? 'active';

    if (!options.dryRun) {
      foundFinding.status = 'closed';
      foundFinding.closed_reason = options.reason;
      foundFinding.closed_at = new Date().toISOString();
      foundFinding.closed_by = 'human';
    }

    closed.push({
      id: foundFinding.id,
      category: foundFinding.category,
      summary: foundFinding.summary,
      file: foundFinding.file,
      severity: foundFinding.severity ?? null,
      previous_status: previousStatus,
      entry_slug: foundEntry.slug,
      entry_feature: foundEntry.feature,
    });
  }

  // All IDs failed — exit with error
  if (closed.length === 0) {
    if (ids.length === 1 && skipped.length === 1) {
      const skip = skipped[0]!;
      if (skip.reason === 'not found') {
        exitError('FINDING_NOT_FOUND', `Finding "${skip.id}" not found.`);
      } else {
        const original = findFindingById(chain, skip.id);
        const originalFinding = original?.finding as ProofChainEntry['findings'][0] | undefined;
        exitError('ALREADY_CLOSED', `Finding "${skip.id}" is already closed.`, {
          closed_by: originalFinding?.closed_by ?? 'unknown',
          closed_at: originalFinding?.closed_at ?? 'unknown',
          closed_reason: originalFinding?.closed_reason ?? '',
        });
      }
    } else {
      exitError('ALL_FAILED', `All ${ids.length} finding IDs failed to close.`);
    }
    return;
  }

  // Dry run — report without mutating
  if (options.dryRun) {
    if (useJson) {
      console.log(
        JSON.stringify(
          wrapJsonResponse(
            'proof close',
            {
              reason: options.reason,
              closed: closed.map((c) => ({
                id: c.id,
                category: c.category,
                summary: c.summary,
                file: c.file,
                previous_status: c.previous_status,
              })),
              skipped,
              dry_run: true,
            },
            chain
          ),
          null,
          2
        )
      );
    } else {
      console.log('Dry run — no changes will be made.');
      console.log('');
      if (closed.length > 0) {
        console.log(`Would close ${closed.length} finding${closed.length !== 1 ? 's' : ''}:`);
        for (const c of closed) {
          console.log(
            `  ${c.id} ${chalk.dim(`[${c.category}]`)} ${c.summary} — ${c.file ?? 'no file'} (${c.previous_status} → closed)`
          );
        }
      }
      if (skipped.length > 0) {
        console.log('');
        console.log(`Would skip ${skipped.length}:`);
        for (const s of skipped) {
          console.log(`  ${s.id} — ${s.reason}`);
        }
      }
    }
    return;
  }

  // Write updated chain
  fs.writeFileSync(proofChainPath, JSON.stringify(chain, null, 2));

  // Regenerate PROOF_CHAIN.md
  const health = computeChainHealth(chain);
  const dashboardMd = generateDashboard(chain.entries, {
    runs: health.chain_runs,
    active: health.findings.active,
    promoted: health.findings.promoted,
    closed: health.findings.closed,
  });
  const chainMdPath = path.join(proofRoot, '.ana', 'PROOF_CHAIN.md');
  fs.writeFileSync(chainMdPath, dashboardMd);

  // Git: stage, commit, push — one commit for the batch
  const coAuthor = readCoAuthor(proofRoot);
  const idList =
    closed.length <= 3
      ? closed.map((c) => c.id).join(', ')
      : `${closed
          .slice(0, 2)
          .map((c) => c.id)
          .join(', ')}, ... (${closed.length} total)`;
  commitAndPushProofChanges({
    proofRoot,
    files: ['.ana/proof_chain.json', '.ana/PROOF_CHAIN.md'],
    message: `[proof] Close ${idList}: ${options.reason}`,
    coAuthor,
  });

  // Output
  if (useJson) {
    if (ids.length === 1 && closed.length === 1 && skipped.length === 0) {
      // Single-ID backward-compatible JSON
      const c = closed[0]!;
      console.log(
        JSON.stringify(
          wrapJsonResponse(
            'proof close',
            {
              finding: {
                id: c.id,
                category: c.category,
                summary: c.summary,
                file: c.file,
                severity: c.severity,
                entry_slug: c.entry_slug,
                entry_feature: c.entry_feature,
              },
              previous_status: c.previous_status,
              new_status: 'closed',
              reason: options.reason,
              closed_by: 'human',
            },
            chain
          ),
          null,
          2
        )
      );
    } else {
      console.log(
        JSON.stringify(
          wrapJsonResponse(
            'proof close',
            {
              reason: options.reason,
              closed: closed.map((c) => ({
                id: c.id,
                category: c.category,
                summary: c.summary,
                file: c.file,
                previous_status: c.previous_status,
              })),
              skipped,
              dry_run: false,
            },
            chain
          ),
          null,
          2
        )
      );
    }
  } else if (closed.length === 1 && skipped.length === 0) {
    // Single-ID backward-compatible output
    const c = closed[0]!;
    console.log(`✓ Closed ${c.id}: ${options.reason}`);
    console.log(`  ${chalk.dim(`[${c.category}]`)} ${c.summary} — ${c.file ?? 'no file'}`);
    console.log(`  ${c.previous_status} → closed (by: human)`);
    console.log('');
    console.log(
      chalk.gray(
        `Chain: ${health.chain_runs} ${health.chain_runs !== 1 ? 'runs' : 'run'} · ${health.findings.active} active finding${health.findings.active !== 1 ? 's' : ''}`
      )
    );
  } else {
    // Multi-ID output
    const total = closed.length + skipped.length;
    console.log(`✓ Closed ${closed.length} of ${total} findings: ${options.reason}`);
    for (const c of closed) {
      console.log(
        `  ${c.id} ${chalk.dim(`[${c.category}]`)} ${c.summary} — ${c.file ?? 'no file'} (${c.previous_status} → closed)`
      );
    }
    for (const s of skipped) {
      console.log(`  ✗ ${s.id} — ${s.reason} (skipped)`);
    }
    console.log('');
    console.log(
      chalk.gray(
        `Chain: ${health.chain_runs} ${health.chain_runs !== 1 ? 'runs' : 'run'} · ${health.findings.active} active finding${health.findings.active !== 1 ? 's' : ''}`
      )
    );
  }
}

/**
 * Handle the `proof promote` subcommand — promote findings to a skill rule.
 *
 * @param ids - Finding IDs to promote
 * @param options - Command options
 * @param options.skill - Skill to promote to
 * @param options.text - Custom rule text
 * @param options.section - Target section: rules or gotchas
 * @param options.force - Allow promoting a closed finding
 * @param options.json - Output JSON format
 * @param parentJson - Whether the parent command's --json flag was set
 */
async function handleProofPromote(
  ids: string[],
  options: { skill?: string; text?: string; section?: string; force?: boolean; json?: boolean },
  parentJson: boolean
): Promise<void> {
  const proofRoot = findProjectRoot();
  const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
  const useJson = options.json || parentJson;

  // Discover available skills for contextual help
  const skillGlobs = globSync(`${getSkillsDirRel()}/*/SKILL.md`, { cwd: proofRoot });
  const availableSkills = skillGlobs.map((p) => path.basename(path.dirname(p)));

  // @ana A010
  const exitError = createExitError({
    commandName: 'proof promote',
    proofChainPath,
    proofRoot,
    useJson,
    hints: {
      SKILL_REQUIRED: [
        `  Available skills: ${availableSkills.join(', ')}`,
        '  Usage: ana proof promote {id} --skill {name}',
      ],
      SKILL_NOT_FOUND: [`  Available skills: ${availableSkills.join(', ')}`],
      FINDING_NOT_FOUND: ['  Run `ana proof audit` to see active findings.'],
    },
    formatHint: (code, context) => {
      if (code === 'ALREADY_PROMOTED' && context['promoted_to']) {
        return [`  Promoted to: ${context['promoted_to']}`];
      }
      if (code === 'ALREADY_CLOSED' && context['closed_by']) {
        const lines = [
          `  Closed by: ${context['closed_by']} on ${context['closed_at'] ?? 'unknown'}`,
        ];
        if (context['closed_reason']) {
          lines.push(`  Reason: ${context['closed_reason']}`);
        }
        lines.push('  Use --force to promote a closed finding.');
        return lines;
      }
      if (code === 'WRONG_BRANCH') {
        if (isWorktreeDirectory()) {
          return [
            "  You're in a worktree. Proof commands modify the proof chain on the artifact branch. Run from the main project directory.",
          ];
        }
        const artifactBranch = readArtifactBranch(proofRoot);
        return [`  Run: git checkout ${artifactBranch}`];
      }
      return null;
    },
  });

  // Validate --skill is provided
  if (!options.skill) {
    exitError(
      'SKILL_REQUIRED',
      '--skill is required. Available skills: ' + availableSkills.join(', ')
    );
    return;
  }

  // Validate --text is not empty when provided
  if (options.text !== undefined && options.text.trim() === '') {
    exitError('TEXT_EMPTY', '--text cannot be empty.');
    return;
  }

  // Validate --section
  const sectionName = options.section ?? 'rules';
  if (sectionName !== 'rules' && sectionName !== 'gotchas') {
    exitError('INVALID_SECTION', `Invalid section "${sectionName}". Valid values: rules, gotchas`);
    return;
  }
  const sectionHeading = sectionName === 'gotchas' ? '## Gotchas' : '## Rules';

  // Validate skill exists
  const skillName = options.skill;
  const skillRelPath = `${getSkillsDirRel()}/${skillName}/SKILL.md`;
  const skillAbsPath = path.join(getSkillsDir(proofRoot), skillName, 'SKILL.md');
  if (!fs.existsSync(skillAbsPath)) {
    exitError('SKILL_NOT_FOUND', `Skill "${skillName}" not found.`);
    return;
  }

  // Branch check: must be on artifact branch
  const artifactBranch = readArtifactBranch(proofRoot);
  const currentBranch = getCurrentBranch();
  if (currentBranch !== artifactBranch) {
    exitError('WRONG_BRANCH', `Wrong branch. Switch to \`${artifactBranch}\` to promote findings.`);
    return;
  }

  pullBeforeRead(proofRoot);

  // Read chain
  if (!fs.existsSync(proofChainPath)) {
    exitError('NO_PROOF_CHAIN', 'No proof chain found.');
    return;
  }

  let chain: ProofChain;
  try {
    chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
  } catch {
    exitError('PARSE_ERROR', 'Failed to parse proof_chain.json.');
    return;
  }

  // Process each ID — collect results
  const promoted: Array<{
    id: string;
    category: string;
    summary: string;
    file: string | null;
    severity: string | null;
    previous_status: string;
  }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const id of ids) {
    const result = findFindingById(chain, id);

    if (!result) {
      skipped.push({ id, reason: 'not found' });
      continue;
    }

    const foundFinding = result.finding as ProofChainEntry['findings'][0];

    if (foundFinding.status === 'promoted') {
      skipped.push({ id, reason: 'already promoted' });
      continue;
    }

    if (foundFinding.status === 'closed' && !options.force) {
      skipped.push({ id, reason: 'already closed (use --force)' });
      continue;
    }

    const previousStatus = foundFinding.status ?? 'active';

    // Mutate the finding
    foundFinding.status = 'promoted';
    foundFinding.promoted_to = skillRelPath;

    promoted.push({
      id: foundFinding.id,
      category: foundFinding.category,
      summary: foundFinding.summary,
      file: foundFinding.file,
      severity: foundFinding.severity ?? null,
      previous_status: previousStatus,
    });
  }

  // All IDs failed — exit with error
  if (promoted.length === 0) {
    if (ids.length === 1 && skipped.length === 1) {
      const skip = skipped[0]!;
      if (skip.reason === 'not found') {
        exitError('FINDING_NOT_FOUND', `Finding "${skip.id}" not found.`);
      } else if (skip.reason === 'already promoted') {
        const original = findFindingById(chain, skip.id);
        const originalFinding = original?.finding as ProofChainEntry['findings'][0] | undefined;
        exitError('ALREADY_PROMOTED', `Finding "${skip.id}" is already promoted.`, {
          promoted_to: originalFinding?.promoted_to ?? 'unknown',
        });
      } else {
        const original = findFindingById(chain, skip.id);
        const originalFinding = original?.finding as ProofChainEntry['findings'][0] | undefined;
        exitError('ALREADY_CLOSED', `Finding "${skip.id}" is already closed.`, {
          closed_by: originalFinding?.closed_by ?? 'unknown',
          closed_at: originalFinding?.closed_at ?? 'unknown',
          closed_reason: originalFinding?.closed_reason ?? '',
        });
      }
    } else {
      exitError('ALL_FAILED', `All ${ids.length} finding IDs failed to promote.`);
    }
    return;
  }

  // Read skill file and append one rule
  let skillContent = fs.readFileSync(skillAbsPath, 'utf-8');
  const sectionIdx = skillContent.indexOf(sectionHeading);
  if (sectionIdx === -1) {
    exitError('SECTION_NOT_FOUND', `Skill file ${skillRelPath} has no ${sectionHeading} section.`);
    return;
  }

  // Determine rule text — use --text or first promoted finding's summary
  const firstPromoted = promoted[0]!;
  const ruleText = options.text ?? firstPromoted.summary;
  const ruleLine = `- ${ruleText}`;

  // Find section boundaries
  const sectionStart = sectionIdx + sectionHeading.length;
  const nextSectionIdx = skillContent.indexOf('\n## ', sectionStart);
  const sectionEnd = nextSectionIdx === -1 ? skillContent.length : nextSectionIdx;
  const sectionBody = skillContent.slice(sectionStart, sectionEnd);

  // Duplicate detection
  let duplicateWarning: string | null = null;
  const newWords = new Set(
    ruleText.replace(/[`*]/g, '').toLowerCase().split(/\s+/).filter(Boolean)
  );
  const existingLines = sectionBody.split('\n').filter((l) => l.trim().startsWith('-'));
  for (const line of existingLines) {
    const lineText = line.trim().replace(/^-\s*/, '').replace(/[`*]/g, '');
    const existingWords = new Set(lineText.toLowerCase().split(/\s+/).filter(Boolean));
    const intersection = new Set([...newWords].filter((w) => existingWords.has(w)));
    const smallerSize = Math.min(newWords.size, existingWords.size);
    if (smallerSize > 0 && intersection.size / smallerSize > 0.5) {
      duplicateWarning = `Similar rule exists: "${lineText}"`;
      break;
    }
  }

  // Check for placeholder line and handle replacement vs append
  const placeholderRegex = /^[ \t]*\*Not yet captured[^*]*\*/m;
  const placeholderMatch = sectionBody.match(placeholderRegex);

  if (placeholderMatch) {
    const placeholderIdx = sectionStart + sectionBody.indexOf(placeholderMatch[0]);
    skillContent =
      skillContent.slice(0, placeholderIdx) +
      ruleLine +
      skillContent.slice(placeholderIdx + placeholderMatch[0].length);
  } else {
    const sectionLines = sectionBody.split('\n');
    let lastNonEmptyIdx = sectionLines.length - 1;
    while (lastNonEmptyIdx >= 0 && sectionLines[lastNonEmptyIdx]!.trim() === '') {
      lastNonEmptyIdx--;
    }

    const beforeSection = skillContent.slice(0, sectionStart);
    const afterSection = skillContent.slice(sectionEnd);
    const contentLines = sectionLines.slice(0, lastNonEmptyIdx + 1);
    contentLines.push(ruleLine);
    const trailingNewlines = sectionLines.slice(lastNonEmptyIdx + 1);
    const newSection = [...contentLines, ...trailingNewlines].join('\n');
    skillContent = beforeSection + newSection + afterSection;
  }

  // Write updated skill file
  fs.writeFileSync(skillAbsPath, skillContent);

  // Write updated chain
  fs.writeFileSync(proofChainPath, JSON.stringify(chain, null, 2));

  // Regenerate PROOF_CHAIN.md
  const health = computeChainHealth(chain);
  const dashboardMd = generateDashboard(chain.entries, {
    runs: health.chain_runs,
    active: health.findings.active,
    promoted: health.findings.promoted,
    closed: health.findings.closed,
  });
  const chainMdPath = path.join(proofRoot, '.ana', 'PROOF_CHAIN.md');
  fs.writeFileSync(chainMdPath, dashboardMd);

  // Git: stage, commit, push — one commit for the batch
  const coAuthor = readCoAuthor(proofRoot);
  const idList =
    promoted.length <= 3
      ? promoted.map((p) => p.id).join(', ')
      : `${promoted
          .slice(0, 2)
          .map((p) => p.id)
          .join(', ')}, ... (${promoted.length} total)`;
  commitAndPushProofChanges({
    proofRoot,
    files: ['.ana/proof_chain.json', '.ana/PROOF_CHAIN.md', skillRelPath],
    message: `[proof] Promote ${idList} to ${skillName}`,
    coAuthor,
  });

  // Output
  if (useJson) {
    if (ids.length === 1 && promoted.length === 1 && skipped.length === 0) {
      // Single-ID backward-compatible JSON
      const p = promoted[0]!;
      const results: Record<string, unknown> = {
        finding: {
          id: p.id,
          category: p.category,
          summary: p.summary,
          file: p.file,
          severity: p.severity,
          suggested_action: null,
        },
        promoted_to: skillRelPath,
        rule_text: ruleLine,
        section: sectionHeading,
      };
      if (duplicateWarning) {
        results['duplicate_warning'] = duplicateWarning;
      }
      console.log(JSON.stringify(wrapJsonResponse('proof promote', results, chain), null, 2));
    } else {
      console.log(
        JSON.stringify(
          wrapJsonResponse(
            'proof promote',
            {
              promoted: promoted.map((p) => ({
                id: p.id,
                category: p.category,
                summary: p.summary,
                file: p.file,
                previous_status: p.previous_status,
              })),
              skipped,
              promoted_to: skillRelPath,
              rule_text: ruleLine,
              section: sectionHeading,
              duplicate_warning: duplicateWarning,
            },
            chain
          ),
          null,
          2
        )
      );
    }
  } else if (promoted.length === 1 && skipped.length === 0) {
    // Single-ID backward-compatible output
    const p = promoted[0]!;
    if (duplicateWarning) {
      console.log(chalk.yellow(`⚠ ${duplicateWarning}`));
    }
    console.log(`✓ Promoted ${p.id} to ${skillName}`);
    console.log(
      `  ${chalk.dim(`[${p.category}]`)} ${truncateSummary(p.summary, 100)} — ${p.file ?? 'no file'}`
    );
    console.log(`  ${p.previous_status} → promoted`);
    console.log(`  Rule: ${ruleLine}`);
    console.log(`  Section: ${sectionHeading}`);
    console.log(`  File: ${skillRelPath}`);
    console.log('');
    console.log(
      chalk.gray(
        `Chain: ${health.chain_runs} ${health.chain_runs !== 1 ? 'runs' : 'run'} · ${health.findings.active} active finding${health.findings.active !== 1 ? 's' : ''}`
      )
    );
  } else {
    // Multi-ID output
    if (duplicateWarning) {
      console.log(chalk.yellow(`⚠ ${duplicateWarning}`));
    }
    console.log(`✓ Promoted ${promoted.length} findings to ${skillName}`);
    for (const p of promoted) {
      console.log(
        `  ${p.id} ${chalk.dim(`[${p.category}]`)} ${truncateSummary(p.summary, 100)} — ${p.file ?? 'no file'} (${p.previous_status} → promoted)`
      );
    }
    for (const s of skipped) {
      console.log(`  ✗ ${s.id} — ${s.reason} (skipped)`);
    }
    console.log(`  Rule: ${ruleLine}`);
    console.log(`  Section: ${sectionHeading}`);
    console.log(`  File: ${skillRelPath}`);
    console.log('');
    console.log(
      chalk.gray(
        `Chain: ${health.chain_runs} ${health.chain_runs !== 1 ? 'runs' : 'run'} · ${health.findings.active} active finding${health.findings.active !== 1 ? 's' : ''}`
      )
    );
  }
}

/**
 * Handle the `proof strengthen` subcommand — commit a skill file edit and mark findings as promoted.
 *
 * @param ids - Finding IDs to strengthen
 * @param options - Command options
 * @param options.skill - Skill whose file was edited
 * @param options.reason - Why this skill was strengthened
 * @param options.force - Allow strengthening a closed finding
 * @param options.json - Output JSON format
 * @param parentJson - Whether the parent command's --json flag was set
 */
async function handleProofStrengthen(
  ids: string[],
  options: { skill?: string; reason?: string; force?: boolean; json?: boolean },
  parentJson: boolean
): Promise<void> {
  const proofRoot = findProjectRoot();
  const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
  const useJson = options.json || parentJson;

  // @ana A011
  const exitError = createExitError({
    commandName: 'proof strengthen',
    proofChainPath,
    proofRoot,
    useJson,
    hints: {
      SKILL_REQUIRED: ['  Usage: ana proof strengthen <ids...> --skill <name> --reason "..."'],
      REASON_REQUIRED: ['  Usage: ana proof strengthen <ids...> --skill <name> --reason "..."'],
      FINDING_NOT_FOUND: ['  Run `ana proof audit` to see active findings.'],
    },
    formatHint: (code, context) => {
      if (code === 'SKILL_NOT_FOUND') {
        const skillsDir = getSkillsDir(proofRoot);
        if (fs.existsSync(skillsDir)) {
          const available = fs
            .readdirSync(skillsDir)
            .filter((d) => fs.statSync(path.join(skillsDir, d)).isDirectory());
          if (available.length > 0) {
            return [`  Available skills: ${available.join(', ')}`];
          }
        }
        return [];
      }
      if (code === 'NO_UNCOMMITTED_CHANGES') {
        return [
          '  Edit the skill file first, then run this command to commit the changes.',
          `  Usage: ana proof strengthen <ids...> --skill ${options.skill ?? '<name>'} --reason "..."`,
        ];
      }
      if (code === 'ALREADY_PROMOTED' && context['promoted_to']) {
        return [`  Promoted to: ${context['promoted_to']}`];
      }
      if (code === 'ALREADY_CLOSED' && context['closed_by']) {
        const lines = [
          `  Closed by: ${context['closed_by']} on ${context['closed_at'] ?? 'unknown'}`,
        ];
        if (context['closed_reason']) {
          lines.push(`  Reason: ${context['closed_reason']}`);
        }
        lines.push('  Use --force to strengthen a closed finding.');
        return lines;
      }
      if (code === 'WRONG_BRANCH') {
        if (isWorktreeDirectory()) {
          return [
            "  You're in a worktree. Proof commands modify the proof chain on the artifact branch. Run from the main project directory.",
          ];
        }
        const artifactBranch = readArtifactBranch(proofRoot);
        return [`  Run: git checkout ${artifactBranch}`];
      }
      return null;
    },
  });

  // Validate --skill is provided
  if (!options.skill) {
    exitError('SKILL_REQUIRED', '--skill is required.');
    return;
  }

  // Validate --reason is provided
  if (!options.reason) {
    exitError('REASON_REQUIRED', '--reason is required.');
    return;
  }

  // Validate skill name format
  try {
    validateSkillName(options.skill);
  } catch {
    exitError(
      'INVALID_SKILL',
      'Invalid skill name: contains invalid characters. Use kebab-case: coding-standards, api-patterns'
    );
    return;
  }

  // Validate skill exists
  const skillName = options.skill;
  const skillRelPath = `${getSkillsDirRel()}/${skillName}/SKILL.md`;
  const skillAbsPath = path.join(getSkillsDir(proofRoot), skillName, 'SKILL.md');
  if (!fs.existsSync(skillAbsPath)) {
    exitError('SKILL_NOT_FOUND', `Skill "${skillName}" not found.`);
    return;
  }

  // Branch check: must be on artifact branch
  const artifactBranch = readArtifactBranch(proofRoot);
  const currentBranch = getCurrentBranch();
  if (currentBranch !== artifactBranch) {
    exitError(
      'WRONG_BRANCH',
      `Wrong branch. Switch to \`${artifactBranch}\` to strengthen findings.`
    );
    return;
  }

  // Verify uncommitted changes exist for the skill file
  // Check both unstaged and staged changes
  let hasUncommittedChanges = false;
  try {
    const unstaged = runGit(['diff', '--name-only', '--', skillRelPath], { cwd: proofRoot }).stdout;
    const staged = runGit(['diff', '--name-only', '--cached', '--', skillRelPath], {
      cwd: proofRoot,
    }).stdout;
    hasUncommittedChanges = unstaged.length > 0 || staged.length > 0;
  } catch {
    // git diff failed — treat as no changes
  }

  if (!hasUncommittedChanges) {
    exitError('NO_UNCOMMITTED_CHANGES', `No uncommitted changes to ${skillRelPath}`);
    return;
  }

  pullBeforeRead(proofRoot);

  // Read chain
  if (!fs.existsSync(proofChainPath)) {
    exitError('NO_PROOF_CHAIN', 'No proof chain found.');
    return;
  }

  let chain: ProofChain;
  try {
    chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
  } catch {
    exitError('PARSE_ERROR', 'Failed to parse proof_chain.json.');
    return;
  }

  // Process each ID — collect results
  const strengthened: Array<{
    id: string;
    category: string;
    summary: string;
    file: string | null;
    severity: string | null;
    previous_status: string;
  }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const id of ids) {
    const result = findFindingById(chain, id);

    if (!result) {
      skipped.push({ id, reason: 'not found' });
      continue;
    }

    const foundFinding = result.finding as ProofChainEntry['findings'][0];

    if (foundFinding.status === 'promoted') {
      skipped.push({ id, reason: 'already promoted' });
      continue;
    }

    if (foundFinding.status === 'closed' && !options.force) {
      skipped.push({ id, reason: 'already closed (use --force)' });
      continue;
    }

    const previousStatus = foundFinding.status ?? 'active';

    // Mutate the finding
    foundFinding.status = 'promoted';
    foundFinding.promoted_to = skillRelPath;

    strengthened.push({
      id: foundFinding.id,
      category: foundFinding.category,
      summary: foundFinding.summary,
      file: foundFinding.file,
      severity: foundFinding.severity ?? null,
      previous_status: previousStatus,
    });
  }

  // All IDs failed — exit with error
  if (strengthened.length === 0) {
    if (ids.length === 1 && skipped.length === 1) {
      const skip = skipped[0]!;
      if (skip.reason === 'not found') {
        exitError('FINDING_NOT_FOUND', `Finding "${skip.id}" not found.`);
      } else if (skip.reason === 'already promoted') {
        const original = findFindingById(chain, skip.id);
        const originalFinding = original?.finding as ProofChainEntry['findings'][0] | undefined;
        exitError('ALREADY_PROMOTED', `Finding "${skip.id}" is already promoted.`, {
          promoted_to: originalFinding?.promoted_to ?? 'unknown',
        });
      } else {
        const original = findFindingById(chain, skip.id);
        const originalFinding = original?.finding as ProofChainEntry['findings'][0] | undefined;
        exitError('ALREADY_CLOSED', `Finding "${skip.id}" is already closed.`, {
          closed_by: originalFinding?.closed_by ?? 'unknown',
          closed_at: originalFinding?.closed_at ?? 'unknown',
          closed_reason: originalFinding?.closed_reason ?? '',
        });
      }
    } else {
      exitError('ALL_FAILED', `All ${ids.length} finding IDs failed to strengthen.`);
    }
    return;
  }

  // Write updated chain
  fs.writeFileSync(proofChainPath, JSON.stringify(chain, null, 2));

  // Regenerate PROOF_CHAIN.MD
  const health = computeChainHealth(chain);
  const dashboardMd = generateDashboard(chain.entries, {
    runs: health.chain_runs,
    active: health.findings.active,
    promoted: health.findings.promoted,
    closed: health.findings.closed,
  });
  const chainMdPath = path.join(proofRoot, '.ana', 'PROOF_CHAIN.md');
  fs.writeFileSync(chainMdPath, dashboardMd);

  // Git: stage skill file + proof chain files, commit, push — one commit for the batch
  const coAuthor = readCoAuthor(proofRoot);
  commitAndPushProofChanges({
    proofRoot,
    files: [skillRelPath, '.ana/proof_chain.json', '.ana/PROOF_CHAIN.md'],
    message: `[learn] Strengthen ${skillName}: ${options.reason}`,
    coAuthor,
  });

  // Output
  if (useJson) {
    console.log(
      JSON.stringify(
        wrapJsonResponse(
          'proof strengthen',
          {
            skill: skillName,
            skill_path: skillRelPath,
            reason: options.reason,
            strengthened: strengthened.map((s) => ({
              id: s.id,
              category: s.category,
              summary: s.summary,
              file: s.file,
              previous_status: s.previous_status,
            })),
            skipped,
          },
          chain
        ),
        null,
        2
      )
    );
  } else if (strengthened.length === 1 && skipped.length === 0) {
    const s = strengthened[0]!;
    console.log(`✓ Strengthened 1 finding → ${skillName}`);
    console.log(
      `  ${s.id} ${chalk.dim(`[${s.category}]`)} ${truncateSummary(s.summary, 100)} — ${s.file ?? 'no file'} (${s.previous_status} → promoted)`
    );
    console.log(`  Skill: ${skillRelPath}`);
    console.log(`  Reason: ${options.reason}`);
    console.log('');
    console.log(
      chalk.gray(
        `Chain: ${health.chain_runs} ${health.chain_runs !== 1 ? 'runs' : 'run'} · ${health.findings.active} active finding${health.findings.active !== 1 ? 's' : ''}`
      )
    );
  } else {
    console.log(`✓ Strengthened ${strengthened.length} findings → ${skillName}`);
    for (const s of strengthened) {
      console.log(
        `  ${s.id} ${chalk.dim(`[${s.category}]`)} ${truncateSummary(s.summary, 100)} — ${s.file ?? 'no file'} (${s.previous_status} → promoted)`
      );
    }
    for (const sk of skipped) {
      console.log(`  ✗ ${sk.id} — ${sk.reason} (skipped)`);
    }
    console.log(`  Skill: ${skillRelPath}`);
    console.log(`  Reason: ${options.reason}`);
    console.log('');
    console.log(
      chalk.gray(
        `Chain: ${health.chain_runs} ${health.chain_runs !== 1 ? 'runs' : 'run'} · ${health.findings.active} active finding${health.findings.active !== 1 ? 's' : ''}`
      )
    );
  }
}

/**
 * Handle the `proof audit` subcommand — list active findings grouped by file.
 *
 * @param options - Command options
 * @param options.json - Output JSON format
 * @param options.full - Return all findings without truncation
 * @param options.severity - Filter by severity
 * @param options.entry - Filter to findings from a specific pipeline run
 * @param options.matrix - Show orientation summary
 * @param options.new - Filter to findings after last learn session
 * @param options.since - Filter to findings after ISO date
 * @param options.surface - Filter to findings from a specific surface
 * @param parentJson - Whether the parent command's --json flag was set
 */
async function handleProofAudit(
  options: {
    json?: boolean;
    full?: boolean;
    severity?: string;
    entry?: string;
    matrix?: boolean;
    new?: boolean;
    since?: string;
    surface?: string;
  },
  parentJson: boolean
): Promise<void> {
  const proofRoot = findProjectRoot();
  const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
  const useJson = options.json || parentJson;

  // --full without --json: print usage hint and return
  if (options.full && !useJson) {
    console.log('The --full flag is designed for agent consumption. Use with --json:');
    console.log('  ana proof audit --json --full');
    return;
  }

  // Validate --surface flag early
  if (options.surface) {
    const surfaceCheck = validateSurface(proofRoot, options.surface);
    if (!surfaceCheck.configured) {
      console.error('Surfaces are not configured. Add surfaces to ana.json with `ana init`.');
      process.exit(1);
      return;
    }
    if (!surfaceCheck.valid) {
      console.error(
        `Error: Unknown surface "${options.surface}". Available surfaces: ${surfaceCheck.available.join(', ')}`
      );
      process.exit(1);
      return;
    }
  }

  // Read chain (no branch check — audit is read-only)
  if (!fs.existsSync(proofChainPath)) {
    if (options.matrix) {
      if (useJson) {
        console.log(
          JSON.stringify(
            wrapJsonResponse('proof audit', EMPTY_AUDIT_MATRIX, { entries: [] }),
            null,
            2
          )
        );
      } else {
        console.log('\nProof Orientation: no proof chain data');
        console.log('  Run pipeline cycles to generate proof data.');
      }
      return;
    }
    if (useJson) {
      console.log(
        JSON.stringify(
          wrapJsonResponse('proof audit', { total_active: 0, by_file: [] }, { entries: [] }),
          null,
          2
        )
      );
    } else {
      console.log('No proof chain found. Complete pipeline cycles to build proof data.');
    }
    return;
  }

  let chain: ProofChain;
  try {
    chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
  } catch {
    console.error(chalk.red('Error: Failed to parse proof_chain.json'));
    process.exit(1);
    return;
  }

  // --matrix: orientation mode — early return before filters and file I/O
  if (options.matrix) {
    // Apply --surface filter to entries before matrix computation
    if (options.surface) {
      chain = { ...chain, entries: chain.entries.filter((e) => e.surface === options.surface) };
    }

    // Handle empty entries array
    if (chain.entries.length === 0) {
      if (useJson) {
        console.log(
          JSON.stringify(wrapJsonResponse('proof audit', EMPTY_AUDIT_MATRIX, chain), null, 2)
        );
      } else {
        console.log('\nProof Orientation: no proof chain data');
        console.log('  Run pipeline cycles to generate proof data.');
      }
      return;
    }

    // Collect counts from all active findings (no file I/O, no anchor checking)
    const matrixSeverityCounts: Record<string, number> = {};
    const matrixActionCounts: Record<string, number> = {};
    const matrixCrossTab: Record<string, number> = {};
    const entryFindingCounts: Record<string, number> = {};
    let matrixAllUnclassified = true;
    let totalActive = 0;
    let matrixActionable = 0;
    let matrixMonitoring = 0;

    for (const entry of chain.entries) {
      for (const finding of entry.findings || []) {
        if (finding.status && finding.status !== 'active') continue;
        totalActive++;

        const sev = (finding.severity ?? '—') === '—' ? 'unclassified' : finding.severity!;
        matrixSeverityCounts[sev] = (matrixSeverityCounts[sev] || 0) + 1;
        if ((finding.severity ?? '—') !== '—') matrixAllUnclassified = false;

        const act =
          (finding.suggested_action ?? '—') === '—' ? 'unclassified' : finding.suggested_action!;
        matrixActionCounts[act] = (matrixActionCounts[act] || 0) + 1;

        matrixCrossTab[`${sev}/${act}`] = (matrixCrossTab[`${sev}/${act}`] || 0) + 1;

        if (sev === 'risk' || sev === 'debt' || act === 'promote' || act === 'scope') {
          matrixActionable++;
        } else {
          matrixMonitoring++;
        }

        // Count findings per entry slug
        entryFindingCounts[entry.slug] = (entryFindingCounts[entry.slug] || 0) + 1;
      }
    }

    // Staleness
    const staleness = computeStaleness(chain);
    const staleHigh = staleness.high_confidence.length;
    const staleMedium = staleness.medium_confidence.length;

    // Recent entries (last 3)
    const recentEntries = chain.entries
      .slice(-3)
      .reverse()
      .map((e) => ({
        slug: e.slug,
        result: e.result,
        finding_count: entryFindingCounts[e.slug] || 0,
        completed_at: e.completed_at,
        ago: e.completed_at ? formatRelativeTime(e.completed_at) : 'unknown',
      }));

    // Session-aware enrichment: count findings new since last learn session
    let matrixNewSinceLast: number | undefined;
    let matrixLastSessionAt: string | undefined;
    try {
      const learnStatePath = path.join(proofRoot, '.ana', 'learn', 'state.json');
      if (fs.existsSync(learnStatePath)) {
        const learnState = JSON.parse(fs.readFileSync(learnStatePath, 'utf-8'));
        if (learnState.last_session_at) {
          matrixLastSessionAt = learnState.last_session_at;
          const threshold = new Date(learnState.last_session_at).getTime();
          let newCount = 0;
          for (const entry of chain.entries) {
            if (!entry.completed_at) continue;
            if (new Date(entry.completed_at).getTime() > threshold) {
              for (const finding of entry.findings || []) {
                if (finding.status && finding.status !== 'active') continue;
                newCount++;
              }
            }
          }
          matrixNewSinceLast = newCount;
        }
      }
    } catch {
      /* missing or malformed learn state — omit session info */
    }

    const matrixBySeverity = {
      risk: matrixSeverityCounts['risk'] || 0,
      debt: matrixSeverityCounts['debt'] || 0,
      observation: matrixSeverityCounts['observation'] || 0,
      unclassified: matrixSeverityCounts['unclassified'] || 0,
    };
    const matrixByAction = {
      promote: matrixActionCounts['promote'] || 0,
      scope: matrixActionCounts['scope'] || 0,
      monitor: matrixActionCounts['monitor'] || 0,
      acknowledge: matrixActionCounts['acknowledge'] || 0,
      unclassified: matrixActionCounts['unclassified'] || 0,
    };

    if (useJson) {
      const matrixPayload: Record<string, unknown> = {
        total_active: totalActive,
        actionable_count: matrixActionable,
        monitoring_count: matrixMonitoring,
        by_severity: matrixBySeverity,
        by_action: matrixByAction,
        by_severity_action: matrixCrossTab,
        recent_entries: recentEntries,
        stale_count: staleHigh + staleMedium,
        stale_high: staleHigh,
        stale_medium: staleMedium,
      };
      if (matrixNewSinceLast !== undefined) {
        matrixPayload['new_since_last'] = matrixNewSinceLast;
        matrixPayload['last_session_at'] = matrixLastSessionAt;
      }
      console.log(JSON.stringify(wrapJsonResponse('proof audit', matrixPayload, chain), null, 2));
    } else {
      // Human-readable orientation block
      if (totalActive === 0) {
        console.log(`\nProof Orientation: 0 active findings`);
        console.log(
          `  No active findings. Chain has ${chain.entries.length} entr${chain.entries.length !== 1 ? 'ies' : 'y'}.`
        );
      } else {
        const actionablePart = ` (${matrixActionable} actionable, ${matrixMonitoring} monitoring)`;
        console.log(
          `\nProof Orientation: ${totalActive} active finding${totalActive !== 1 ? 's' : ''}${actionablePart}`
        );

        if (!matrixAllUnclassified) {
          const sevOrder = ['risk', 'debt', 'observation', 'unclassified'];
          const sevParts = sevOrder
            .filter((s) => (matrixSeverityCounts[s] || 0) > 0)
            .map((s) => `${matrixSeverityCounts[s]} ${s}`);
          console.log(chalk.dim(`  ${sevParts.join(' · ')}`));

          // Cross-tab (capped at 5, sorted by count desc)
          const crossParts = Object.entries(matrixCrossTab)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([key, count]) => `${count} ${key}`);
          if (crossParts.length > 0) {
            console.log(chalk.dim(`  ${crossParts.join(' · ')}`));
          }
        }

        const staleTotal = staleHigh + staleMedium;
        if (staleTotal > 0) {
          console.log(
            `  Staleness: ${staleTotal} stale (${staleHigh} high, ${staleMedium} medium)`
          );
        } else {
          console.log(`  Staleness: none detected`);
        }

        if (matrixNewSinceLast !== undefined && matrixLastSessionAt) {
          console.log(
            `  New since last session: ${matrixNewSinceLast} finding${matrixNewSinceLast !== 1 ? 's' : ''} (last session: ${matrixLastSessionAt})`
          );
        }
      }

      if (recentEntries.length > 0) {
        console.log('');
        console.log('  Recent proofs:');
        const recentSlugW = columnWidth(
          recentEntries,
          (e) => (e as { slug?: string }).slug ?? '',
          8
        );
        for (const e of recentEntries) {
          const slugText = (e.slug ?? '').padEnd(recentSlugW);
          const findingLabel = `${e.finding_count} finding${e.finding_count !== 1 ? 's' : ''}`;
          console.log(`    ${slugText}${e.result}  ${findingLabel}  ${e.ago}`);
        }
      }
    }
    return;
  }

  // Collect all active findings with entry context
  let activeFindings: Array<{
    id: string;
    category: string;
    summary: string;
    file: string | null;
    anchor: string | null;
    anchor_present: boolean;
    line?: number;
    age_days: number;
    severity: string;
    suggested_action: string;
    related_assertions?: string[];
    entry_slug: string;
    entry_feature: string;
    entry_surface?: string;
  }> = [];

  for (const entry of chain.entries) {
    for (const finding of entry.findings || []) {
      if (finding.status && finding.status !== 'active') continue;

      // Compute age from entry's completed_at
      const completedAt = entry.completed_at ? new Date(entry.completed_at) : new Date();
      const ageDays = Math.floor((Date.now() - completedAt.getTime()) / (1000 * 60 * 60 * 24));

      // Check anchor_present by reading the file
      let anchorPresent = false;
      if (finding.file && finding.anchor) {
        try {
          const filePath = path.join(proofRoot, finding.file);
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            // Strip line reference from anchor (e.g., "census.ts:267-274" → "census")
            const anchorText = finding.anchor
              .replace(/\.\w+:\d+(-\d+)?$/, '')
              .replace(/:\d+(-\d+)?$/, '');
            anchorPresent = content.includes(anchorText);
          }
        } catch {
          /* file read failed — anchor not present */
        }
      }

      const auditFinding: (typeof activeFindings)[0] = {
        id: finding.id,
        category: finding.category,
        summary: finding.summary,
        file: finding.file,
        anchor: finding.anchor,
        anchor_present: anchorPresent,
        age_days: ageDays,
        severity: finding.severity ?? '—',
        suggested_action: finding.suggested_action ?? '—',
        entry_slug: entry.slug,
        entry_feature: entry.feature,
      };
      if (entry.surface) auditFinding.entry_surface = entry.surface;
      if (finding.line !== undefined) auditFinding.line = finding.line;
      if (finding.related_assertions !== undefined)
        auditFinding.related_assertions = finding.related_assertions;
      activeFindings.push(auditFinding);
    }
  }

  // Apply --severity filter (post-collection, before grouping)
  if (options.severity) {
    const allowedSeverities = new Set(options.severity.split(',').map((s) => s.trim()));
    // Map 'unclassified' filter value to the '—' sentinel used in activeFindings
    const matchesSeverity = (sev: string): boolean => {
      if (allowedSeverities.has(sev)) return true;
      if (sev === '—' && allowedSeverities.has('unclassified')) return true;
      return false;
    };
    activeFindings = activeFindings.filter((f) => matchesSeverity(f.severity));
  }

  // Apply --entry filter (post-collection, before grouping)
  if (options.entry) {
    const entrySlug = options.entry;
    activeFindings = activeFindings.filter((f) => f.entry_slug === entrySlug);
  }

  // Apply --surface filter (post-collection, before grouping)
  if (options.surface) {
    activeFindings = activeFindings.filter((f) => f.entry_surface === options.surface);
  }

  // Apply --new / --since filter (post-collection, before grouping)
  if (options.new || options.since) {
    let threshold: number | null = null;

    if (options.since) {
      const sinceDate = new Date(options.since);
      if (isNaN(sinceDate.getTime())) {
        console.error(
          chalk.red(
            `Error: Invalid date for --since: "${options.since}". Use ISO format (e.g., 2026-05-15).`
          )
        );
        process.exit(1);
        return;
      }
      threshold = sinceDate.getTime();
    } else {
      // --new: read last_session_at from learn state
      try {
        const learnStatePath = path.join(proofRoot, '.ana', 'learn', 'state.json');
        if (fs.existsSync(learnStatePath)) {
          const learnState = JSON.parse(fs.readFileSync(learnStatePath, 'utf-8'));
          if (learnState.last_session_at) {
            threshold = new Date(learnState.last_session_at).getTime();
          }
        }
      } catch {
        /* missing or malformed — show all */
      }
    }

    if (threshold !== null) {
      // Build entry slug → completed_at map
      const entryCompletedMap = new Map<string, string>();
      for (const entry of chain.entries) {
        if (entry.completed_at) {
          entryCompletedMap.set(entry.slug, entry.completed_at);
        }
      }

      activeFindings = activeFindings.filter((f) => {
        const completedAt = entryCompletedMap.get(f.entry_slug);
        if (!completedAt) return false;
        return new Date(completedAt).getTime() > threshold!;
      });
    }
    // If threshold is null (no last_session_at), show all — no filter applied
  }

  // Zero findings
  if (activeFindings.length === 0) {
    if (useJson) {
      console.log(
        JSON.stringify(
          wrapJsonResponse(
            'proof audit',
            {
              total_active: 0,
              by_severity: { risk: 0, debt: 0, observation: 0, unclassified: 0 },
              by_action: { promote: 0, scope: 0, monitor: 0, acknowledge: 0, unclassified: 0 },
              by_severity_action: {},
              by_file: [],
            },
            chain
          ),
          null,
          2
        )
      );
    } else {
      console.log('Proof chain is clean — no active findings.');
    }
    return;
  }

  // Group by file
  const fileGroups = new Map<string, typeof activeFindings>();
  for (const finding of activeFindings) {
    const key = finding.file ?? 'General';
    const existing = fileGroups.get(key) || [];
    existing.push(finding);
    fileGroups.set(key, existing);
  }

  // Sort files by count descending, cap at 8 (unless --full)
  const MAX_FILES = 8;
  const MAX_PER_FILE = 3;
  const useFull = options.full && useJson;
  const sortedFiles = Array.from(fileGroups.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, useFull ? undefined : MAX_FILES);

  // Sort findings within each file group by severity (risk → debt → observation → unclassified)
  for (const [, findings] of sortedFiles) {
    findings.sort((a, b) => {
      const wa = SEVERITY_ORDER[a.severity] ?? 3;
      const wb = SEVERITY_ORDER[b.severity] ?? 3;
      return wa - wb;
    });
  }

  // Severity and action summary counts (active findings only)
  const severityCounts: Record<string, number> = {};
  const actionCounts: Record<string, number> = {};
  const severityActionCounts: Record<string, number> = {};
  let allUnclassified = true;
  for (const f of activeFindings) {
    const sev = f.severity === '—' ? 'unclassified' : f.severity;
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;
    if (f.severity !== '—') allUnclassified = false;

    const act = f.suggested_action === '—' ? 'unclassified' : f.suggested_action;
    actionCounts[act] = (actionCounts[act] || 0) + 1;

    const crossKey = `${sev}/${act}`;
    severityActionCounts[crossKey] = (severityActionCounts[crossKey] || 0) + 1;
  }

  const bySeverity = {
    risk: severityCounts['risk'] || 0,
    debt: severityCounts['debt'] || 0,
    observation: severityCounts['observation'] || 0,
    unclassified: severityCounts['unclassified'] || 0,
  };
  const byAction = {
    promote: actionCounts['promote'] || 0,
    scope: actionCounts['scope'] || 0,
    monitor: actionCounts['monitor'] || 0,
    acknowledge: actionCounts['acknowledge'] || 0,
    unclassified: actionCounts['unclassified'] || 0,
  };

  // Compute actionable vs monitoring counts
  // Actionable: severity is risk/debt OR action is promote/scope
  // Monitoring: everything else
  let actionableCount = 0;
  let monitoringCount = 0;
  for (const f of activeFindings) {
    const sev = f.severity === '—' ? 'unclassified' : f.severity;
    const act = f.suggested_action === '—' ? 'unclassified' : f.suggested_action;
    if (sev === 'risk' || sev === 'debt' || act === 'promote' || act === 'scope') {
      actionableCount++;
    } else {
      monitoringCount++;
    }
  }

  if (useJson) {
    const byFile = sortedFiles.map(([file, findings]) => ({
      file,
      count: findings.length,
      findings: useFull ? findings : findings.slice(0, MAX_PER_FILE),
      overflow: useFull ? 0 : Math.max(0, findings.length - MAX_PER_FILE),
    }));
    const totalFiles = fileGroups.size;
    const overflowFiles = useFull ? 0 : Math.max(0, totalFiles - MAX_FILES);
    const result = {
      total_active: activeFindings.length,
      actionable_count: actionableCount,
      monitoring_count: monitoringCount,
      by_severity: bySeverity,
      by_action: byAction,
      by_severity_action: severityActionCounts,
      by_file: byFile,
      overflow_files: overflowFiles,
    };
    console.log(JSON.stringify(wrapJsonResponse('proof audit', result, chain), null, 2));
  } else {
    // Human-readable output
    const totalFiles = fileGroups.size;
    const actionablePart =
      activeFindings.length > 0
        ? ` (${actionableCount} actionable, ${monitoringCount} monitoring)`
        : '';
    console.log(
      `\nProof Audit: ${activeFindings.length} active finding${activeFindings.length !== 1 ? 's' : ''}${actionablePart} across ${totalFiles} file${totalFiles !== 1 ? 's' : ''}`
    );

    if (activeFindings.length > 0 && !allUnclassified) {
      const sevOrder = ['risk', 'debt', 'observation', 'unclassified'];
      const sevParts = sevOrder
        .filter((s) => (severityCounts[s] || 0) > 0)
        .map((s) => `${severityCounts[s]} ${s}`);
      // Include any unknown severity values not in sevOrder
      for (const [key, count] of Object.entries(severityCounts)) {
        if (!sevOrder.includes(key) && count > 0) {
          sevParts.push(`${count} ${key}`);
        }
      }
      console.log(chalk.dim(`  ${sevParts.join(' · ')}`));

      // Cross-tab: severity/action pairs, sorted by count descending, capped at 5
      const crossParts = Object.entries(severityActionCounts)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key, count]) => `${count} ${key}`);
      if (crossParts.length > 0) {
        console.log(chalk.dim(`  ${crossParts.join(' · ')}`));
      }

      const actOrder = ['promote', 'scope', 'monitor', 'acknowledge'];
      const actParts: string[] = [];
      for (const act of actOrder) {
        if ((actionCounts[act] || 0) > 0) {
          actParts.push(`${actionCounts[act]} ${act}`);
        }
      }
      // Include any unknown action values not in actOrder (exclude 'unclassified' from display)
      for (const [key, count] of Object.entries(actionCounts)) {
        if (!actOrder.includes(key) && key !== 'unclassified' && count > 0) {
          actParts.push(`${count} ${key}`);
        }
      }
      if (actParts.length > 0) {
        console.log(chalk.dim(`  ${actParts.join(' · ')}`));
      }
    }

    console.log('');

    for (const [file, findings] of sortedFiles) {
      console.log(`  ${file} (${findings.length} finding${findings.length !== 1 ? 's' : ''})`);
      const displayed = findings.slice(0, MAX_PER_FILE);
      for (const f of displayed) {
        console.log(
          `    ${chalk.dim(`[${f.category}]`)} ${chalk.dim(`[${f.severity} · ${f.suggested_action}]`)} ${f.summary}`
        );
        const anchorIcon = f.anchor ? (f.anchor_present ? '✓' : '✗') : '—';
        // @ana A004
        console.log(
          `           age: ${f.age_days}d | anchor: ${anchorIcon} | from: ${f.entry_feature}`
        );
      }
      if (findings.length > MAX_PER_FILE) {
        console.log(`    ... and ${findings.length - MAX_PER_FILE} more`);
      }
      console.log('');
    }

    // Overflow files
    const overflowFiles = fileGroups.size - sortedFiles.length;
    if (overflowFiles > 0) {
      const overflowFindings =
        activeFindings.length - sortedFiles.reduce((sum, [, f]) => sum + f.length, 0);
      console.log(
        `  ... and ${overflowFiles} more file${overflowFiles !== 1 ? 's' : ''} (${overflowFindings} findings)`
      );
    }
  }
}

/**
 * Handle the `proof health` subcommand — display proof chain health dashboard.
 *
 * @param options - Command options
 * @param options.json - Output JSON format
 * @param options.surface - Filter to entries from a specific surface
 * @param parentJson - Whether the parent command's --json flag was set
 */
async function handleProofHealth(
  options: { json?: boolean; surface?: string },
  parentJson: boolean
): Promise<void> {
  const proofRoot = findProjectRoot();
  const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
  const useJson = options.json || parentJson;

  // Validate --surface flag early
  if (options.surface) {
    const surfaceCheck = validateSurface(proofRoot, options.surface);
    if (!surfaceCheck.configured) {
      console.error('Surfaces are not configured. Add surfaces to ana.json with `ana init`.');
      process.exit(1);
      return;
    }
    if (!surfaceCheck.valid) {
      console.error(
        `Error: Unknown surface "${options.surface}". Available surfaces: ${surfaceCheck.available.join(', ')}`
      );
      process.exit(1);
      return;
    }
  }

  // Read chain (no branch check — health is read-only)
  if (!fs.existsSync(proofChainPath)) {
    if (useJson) {
      console.log(
        JSON.stringify(
          wrapJsonResponse(
            'proof health',
            {
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
              verification: computeFirstPassRate([]),
            },
            { entries: [] }
          ),
          null,
          2
        )
      );
    } else {
      console.log(formatHealthDisplay(0));
    }
    return;
  }

  let chain: ProofChain;
  try {
    chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
  } catch {
    console.error(chalk.red('Error: Failed to parse proof_chain.json'));
    process.exit(1);
    return;
  }

  // Apply --surface filter before computation
  if (options.surface) {
    chain = { ...chain, entries: chain.entries.filter((e) => e.surface === options.surface) };
  }

  const report = computeHealthReport(chain);

  if (useJson) {
    console.log(JSON.stringify(wrapJsonResponse('proof health', report, chain), null, 2));
    return;
  }

  // Terminal display
  console.log(formatHealthDisplay(report));
}

/**
 * Handle the `proof stale` subcommand — show findings with staleness signals.
 *
 * @param options - Command options
 * @param options.after - Filter to findings from a specific pipeline entry
 * @param options.minConfidence - Minimum confidence tier
 * @param options.json - Output JSON format
 * @param parentJson - Whether the parent command's --json flag was set
 */
async function handleProofStale(
  options: { after?: string; minConfidence?: string; json?: boolean },
  parentJson: boolean
): Promise<void> {
  const proofRoot = findProjectRoot();
  const proofChainPath = path.join(proofRoot, '.ana', 'proof_chain.json');
  const useJson = options.json || parentJson;

  // Read chain (no branch check — stale is read-only)
  if (!fs.existsSync(proofChainPath)) {
    if (useJson) {
      console.log(
        JSON.stringify(
          wrapJsonResponse(
            'proof stale',
            {
              total_stale: 0,
              high_confidence: [],
              medium_confidence: [],
              filter: options.after || null,
            },
            { entries: [] }
          ),
          null,
          2
        )
      );
    } else {
      console.log('Stale Findings: 0 findings with staleness signals');
      console.log('');
      console.log('No proof chain found. Complete pipeline cycles to build proof data.');
    }
    return;
  }

  let chain: ProofChain;
  try {
    chain = JSON.parse(fs.readFileSync(proofChainPath, 'utf-8'));
  } catch {
    console.error(chalk.red('Error: Failed to parse proof_chain.json'));
    process.exit(1);
    return;
  }

  const stalenessOpts: { afterSlug?: string; minConfidence?: 'high' | 'medium' } = {};
  if (options.after) stalenessOpts.afterSlug = options.after;
  if (options.minConfidence === 'high') stalenessOpts.minConfidence = 'high';
  const result = computeStaleness(chain, stalenessOpts);

  const resolutionClaims = computeResolutionClaims(chain);

  if (useJson) {
    console.log(
      JSON.stringify(
        wrapJsonResponse(
          'proof stale',
          { ...result, resolution_claims: resolutionClaims.claims },
          chain
        ),
        null,
        2
      )
    );
    return;
  }

  // Human-readable output
  if (options.after) {
    console.log(
      `Stale Findings: ${result.total_stale} finding${result.total_stale !== 1 ? 's' : ''} from ${options.after} with staleness signals`
    );
  } else {
    console.log(
      `Stale Findings: ${result.total_stale} finding${result.total_stale !== 1 ? 's' : ''} with staleness signals`
    );
  }

  if (result.total_stale === 0 && resolutionClaims.claims.length === 0) {
    console.log('');
    console.log('No active findings have been modified by subsequent pipeline runs.');
    return;
  }

  // High confidence tier
  if (result.high_confidence.length > 0) {
    console.log('');
    console.log('High confidence (3+ subsequent entries modified the file):');
    for (const f of result.high_confidence) {
      console.log(`  ${f.id} [${f.severity}] ${f.summary} — ${f.file}`);
      const slugList =
        f.subsequent_slugs.length <= 3
          ? f.subsequent_slugs.join(', ')
          : `${f.subsequent_slugs.slice(0, 3).join(', ')}, ... (${f.subsequent_count} entries)`;
      console.log(
        `    Modified by: ${slugList} (${f.subsequent_count} ${f.subsequent_count !== 1 ? 'entries' : 'entry'})`
      );
      if (f.completed_at) {
        const date = formatLocalDate(f.completed_at);
        console.log(`    Created in: ${f.entry_slug} (${date})`);
      }
      console.log('');
    }
  }

  // Medium confidence tier
  if (result.medium_confidence.length > 0) {
    console.log('Medium confidence (1-2 subsequent entries modified the file):');
    for (const f of result.medium_confidence) {
      console.log(`  ${f.id} [${f.severity}] ${f.summary} — ${f.file}`);
      const slugList = f.subsequent_slugs.join(', ');
      console.log(
        `    Modified by: ${slugList} (${f.subsequent_count} ${f.subsequent_count !== 1 ? 'entries' : 'entry'})`
      );
      if (f.completed_at) {
        const date = formatLocalDate(f.completed_at);
        console.log(`    Created in: ${f.entry_slug} (${date})`);
      }
      console.log('');
    }
  }

  // Resolution claims section
  if (resolutionClaims.claims.length > 0) {
    console.log('');
    console.log('Verify resolution claims:');
    for (const claim of resolutionClaims.claims) {
      console.log(`  ${claim.upstream_id} claims ${claim.referenced_id} resolved`);
      console.log(`    "${claim.upstream_summary}"`);
      const fileSuffix = claim.referenced_file ? ` — ${claim.referenced_file}` : '';
      console.log(
        `    Original: [${claim.referenced_severity}] ${claim.referenced_summary}${fileSuffix} (${claim.referenced_status})`
      );
      console.log('');
    }
  }
}

/**
 * Register the `proof` command.
 *
 * @param program - Commander program instance.
 */
export function registerProofCommand(program: Command): void {
  const proofCommand = new Command('proof')
    .description('View proof chain entries, health, and findings')
    .argument('[slug]', 'Work item slug to display proof for')
    .option('--json', 'Output JSON format for programmatic consumption')
    // Order `--latest, --last` so commander's canonical key is `options.last`.
    .option('--latest, --last', 'Show the most recent proof')
    .action(async (slug, options) => handleProofList(slug, options));

  const contextCommand = new Command('context')
    .description('Query proof chain for context about specific files')
    .argument('<files...>', 'File paths to query')
    .option('--json', 'Output JSON format')
    .action(async (files, options) => {
      const parentJson = !!proofCommand.opts()['json'];
      await handleProofContext(files, options, parentJson);
    });
  proofCommand.addCommand(contextCommand);

  const closeCommand = new Command('close')
    .description('Close active findings with a reason')
    .argument('<ids...>', 'Finding IDs to close (e.g., F003 or F001 F002 F003)')
    .option('--reason <reason>', 'Why these findings no longer apply')
    .option('--dry-run', 'Show what would happen without making changes')
    .option('--json', 'Output JSON format')
    .action(async (ids, options) => {
      const parentJson = !!proofCommand.opts()['json'];
      await handleProofClose(ids, options, parentJson);
    });
  proofCommand.addCommand(closeCommand);

  const promoteCommand = new Command('promote')
    .description('Promote findings to a skill rule')
    .argument('<ids...>', 'Finding IDs to promote (e.g., F001 or F001 F002)')
    .option('--skill <skill>', 'Skill to promote to (e.g., coding-standards)')
    .option('--text <text>', "Custom rule text (defaults to first finding's summary)")
    .option('--section <section>', 'Target section: rules or gotchas (default: rules)')
    .option('--force', 'Allow promoting a closed finding')
    .option('--json', 'Output JSON format')
    .action(async (ids, options) => {
      const parentJson = !!proofCommand.opts()['json'];
      await handleProofPromote(ids, options, parentJson);
    });
  proofCommand.addCommand(promoteCommand);

  const strengthenCommand = new Command('strengthen')
    .description('Commit a skill file edit and mark findings as promoted')
    .argument('<ids...>', 'Finding IDs to strengthen (e.g., F001 or F001 F002)')
    .option('--skill <skill>', 'Skill whose file was edited (e.g., coding-standards)')
    .option('--reason <reason>', 'Why this skill was strengthened')
    .option('--force', 'Allow strengthening a closed finding')
    .option('--json', 'Output JSON format')
    .action(async (ids, options) => {
      const parentJson = !!proofCommand.opts()['json'];
      await handleProofStrengthen(ids, options, parentJson);
    });
  proofCommand.addCommand(strengthenCommand);

  const auditCommand = new Command('audit')
    .description('List active findings grouped by file')
    .option('--json', 'Output JSON format')
    .option('--full', 'Return all findings without truncation (requires --json)')
    .option(
      '--severity <values>',
      'Filter by severity (comma-separated: risk,debt,observation,unclassified)'
    )
    .option('--entry <slug>', 'Filter to findings from a specific pipeline run')
    .option('--matrix', 'Show orientation summary instead of file-grouped findings')
    .option('--surface <name>', 'Filter to findings from entries belonging to a specific surface')
    .option('--new', 'Filter to findings from entries completed after the last learn session')
    .option('--since <date>', 'Filter to findings from entries completed after ISO date')
    .action(async (options) => {
      const parentJson = !!proofCommand.opts()['json'];
      await handleProofAudit(options, parentJson);
    });
  proofCommand.addCommand(auditCommand);

  const healthCommand = new Command('health')
    .description('Display proof chain health dashboard')
    .option('--json', 'Output JSON format')
    .option('--surface <name>', 'Filter to entries belonging to a specific surface')
    .action(async (options) => {
      const parentJson = !!proofCommand.opts()['json'];
      await handleProofHealth(options, parentJson);
    });
  proofCommand.addCommand(healthCommand);

  const staleCommand = new Command('stale')
    .description('Show findings with staleness signals from subsequent pipeline runs')
    .option('--after <slug>', 'Filter to findings from a specific pipeline entry')
    .option('--min-confidence <level>', 'Minimum confidence tier (high or medium)')
    .option('--json', 'Output JSON format')
    .action(async (options) => {
      const parentJson = !!proofCommand.opts()['json'];
      await handleProofStale(options, parentJson);
    });
  proofCommand.addCommand(staleCommand);

  program.addCommand(proofCommand);
}

/**
 * Format a single proof context result for human-readable terminal output.
 *
 * @param result - Proof context result to format
 * @returns Formatted string
 */
function formatContextResult(result: ProofContextResult): string {
  const hasData = result.findings.length > 0 || result.build_concerns.length > 0;

  if (!hasData) {
    return `No proof context found for ${result.query}`;
  }

  const lines: string[] = [];

  // Header
  lines.push(`Proof context for ${result.query}`);
  if (result.touch_count > 0 && result.last_touched) {
    const lastDate = formatLocalDate(result.last_touched);
    lines.push(
      `Touched in ${result.touch_count} pipeline cycle${result.touch_count === 1 ? '' : 's'} (last: ${lastDate})`
    );
  }
  lines.push('');

  // Findings
  if (result.findings.length > 0) {
    lines.push('Findings:');
    for (const finding of result.findings) {
      const idTag = finding.id ? ` (${finding.id})` : '';
      const anchor = finding.anchor ? ` ${finding.anchor} —` : '';
      const truncatedSummary = truncateSummary(finding.summary, 250);
      lines.push(`  ${chalk.dim(`[${finding.category}]`)}${idTag}${anchor} ${truncatedSummary}`);
      lines.push(`         ${chalk.gray(`From: ${finding.from}`)}`);
      lines.push('');
    }
  }

  // Build concerns
  if (result.build_concerns.length > 0) {
    lines.push('Build concerns:');
    for (const concern of result.build_concerns) {
      lines.push(`  ${concern.summary}`);
      lines.push(`         ${chalk.gray(`From: ${concern.from}`)}`);
      lines.push('');
    }
  } else if (result.findings.length > 0) {
    lines.push('No build concerns for this file.');
    lines.push('');
  }

  return lines.join('\n');
}
