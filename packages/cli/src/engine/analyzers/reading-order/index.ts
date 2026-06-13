/**
 * Fused reading list (Slice 3)
 *
 * The payoff slice: it fuses the three independent scan signals into one
 * token-budgeted "read these first" list —
 *   1. import-graph PageRank centrality (Slice 2 — structural importance),
 *   2. proof-chain bug-magnet RATE (Slice 1 — proven rework risk), and
 *   3. git co-change coupling (the in-flight churn path),
 * then trims the ranked result to a ~1k-token budget and, when an active
 * `scope.md` "Files affected" list is present, personalizes the ranking toward
 * the task at hand.
 *
 * Honesty by construction: every entry's `reasons[]` states the *measured*
 * basis for its rank (centrality, work items, rework cycles, co-change) — never
 * a fabricated justification. Below an edge threshold (a too-sparse graph) the
 * whole result is `null`, so consumers can distinguish "nothing worth ranking"
 * from "ranked it and here's the order".
 *
 * Determinism: PageRank is fixed-iteration, ties break on file path, and the
 * budget trim is a deterministic binary search — two runs over identical inputs
 * are byte-identical.
 *
 * Pure and synchronous (engine boundary): no I/O, no CLI deps. Inputs are the
 * already-built graph, the proof history, the co-change rows, and the resolved
 * scope files; output is the `readingOrder` region of EngineResult.
 */

import type { EngineResult } from '../../types/engineResult.js';
import type { CodeGraph } from '../graph/buildGraph.js';
import { pageRank } from '../graph/pagerank.js';

/** The `readingOrder` shape this analyzer produces (non-null variant). */
export type ReadingOrder = NonNullable<EngineResult['readingOrder']>;
/** One ranked entry in the reading list. */
export type ReadingEntry = ReadingOrder['entries'][number];
/** The co-change rows the fusion reads (proof-chain or git-churn path). */
export type CoChangeRow = NonNullable<
  NonNullable<EngineResult['gitIntelligence']>['coChangeCoupling']
>[number];

/**
 * The proof-chain bug-magnet rate signal, narrowed to just the fields the
 * fusion reads. Sourced from Slice 1's `gitIntelligence.bugMagnetFiles[]`.
 */
export interface BugMagnetRate {
  /** Repo-relative file path (matches graph node identity). */
  file: string;
  /** Completed work items that touched the file (`null` if not measured). */
  touchCount: number | null;
  /** Findings raised per touch — the rate, not the raw count. */
  findingsPerTouch: number | null;
  /** Rejection cycles summed across the touching work items. */
  rejectionCycles: number | null;
}

/** Everything the fusion needs to rank a reading list. */
export interface ReadingOrderInput {
  /**
   * The Slice-2 import graph. PageRank runs over `nodes`/`edges`; the fusion
   * also reads the raw `inDegree` (the ground-truth fan-in blended with
   * PageRank and used as the top-decile sanity floor) and the
   * `barrelFiles`/`generatedFiles` down-weight sets when present.
   */
  graph: Pick<CodeGraph, 'nodes' | 'edges'> &
    Partial<Pick<CodeGraph, 'inDegree' | 'barrelFiles' | 'generatedFiles'>>;
  /** Slice-1 proof-chain bug-magnet rates (may be empty). */
  bugMagnets: BugMagnetRate[];
  /** Git/proof co-change rows used for the co-change signal (may be empty). */
  coChange: CoChangeRow[];
  /**
   * Repo-relative files from the active `scope.md` "Files affected" list, used
   * to personalize the ranking. Empty when no active scope.
   */
  scopeFiles: string[];
  /** The active scope slug, recorded in `personalizedTo`. `null` = unpersonalized. */
  scopeSlug: string | null;
  /** Approximate token budget the entries are trimmed to (default ~1000). */
  budget?: number;
  /**
   * Total source files in the repo (from the file census), used to compute the
   * import-graph coverage caveat. When the resolved graph covers only a small
   * fraction of source files, the result carries a `coverageNote` so consumers
   * never mistake a tiny JS island for the whole-repo reading order. Omit
   * (or `null`) to skip the coverage caveat.
   */
  totalSourceFiles?: number | null;
  /**
   * Whether the import graph's language (always TS/JS here) matches the repo's
   * detected primary language. `false` for a polyglot repo whose primary
   * language is Python/Go/PHP/Ruby — which also triggers the scope caveat.
   */
  primaryLanguageIsGraphLanguage?: boolean;
}

/** Default token budget — roughly the "read these first" header of a context. */
const DEFAULT_BUDGET = 1000;

/**
 * Minimum number of in-graph edges before a reading list is meaningful. Below
 * this the graph is too sparse for centrality to mean anything, so we return
 * `null` rather than rank noise.
 */
const MIN_EDGES = 3;

/** Weights for the three fused signals. Centrality leads; risk and co-change refine. */
const W_CENTRALITY = 1.0;
const W_BUGMAGNET = 0.6;
const W_COCHANGE = 0.4;
/** Multiplicative boost applied to a file named in the active scope. */
const SCOPE_BOOST = 1.5;
/**
 * Additive floor for an in-scope file, applied on top of {@link SCOPE_BOOST}.
 * Guarantees an in-scope file outranks an equal-centrality non-scoped peer even
 * when both have zero base score (pure importers). Tiny — well below any real
 * hub's centrality — so it lifts only among otherwise-tied files.
 */
const SCOPE_FLOOR = 0.001;

/**
 * Down-weight multiplier for pure barrel/re-export files and generated/vendored
 * files: they inherit fan-in through re-exports without being the real
 * architectural hub, so we halve their centrality contribution rather than drop
 * them (they can still legitimately rank if also a measured bug-magnet).
 */
const BARREL_DAMP = 0.5;
const GENERATED_DAMP = 0.35;
/**
 * Damp for non-head paths (e2e helpers, Cypress fixtures, test scaffolds): a
 * shared test helper can carry real fan-in but is never "read these first", so
 * its centrality is heavily reduced. The head-demotion is the hard floor; this
 * keeps it from outscoring real hubs when the head isn't fully populated.
 */
const NONHEAD_DAMP = 0.15;

/**
 * Raw in-degree below which a file is a near-leaf: even if it inherits high
 * PageRank from a central importer, ≤2 distinct importers means it is not a
 * repo-wide hub. Such files are barred from the top decile (the sanity guard).
 */
const NEAR_LEAF_INDEGREE = 2;

/**
 * Coverage threshold: if the resolved import subgraph covers fewer than this
 * fraction of the repo's source files, attach a scope caveat so the ranking
 * isn't mistaken for a whole-repo reading order.
 */
const MIN_COVERAGE = 0.3;

/**
 * Rough token estimate for one rendered entry. Each entry contributes a file
 * path plus its reasons; ~4 characters per token is the usual GPT-family rule
 * of thumb. Kept conservative so the budget trims to a real "first screen".
 */
function estimateEntryTokens(entry: ReadingEntry): number {
  const chars = entry.file.length + entry.reasons.reduce((sum, r) => sum + r.length, 0);
  return Math.ceil(chars / 4) + 2; // +2 for bullet/structural overhead
}

/** Sum of {@link estimateEntryTokens} across a slice of entries. */
function totalTokens(entries: ReadingEntry[]): number {
  return entries.reduce((sum, e) => sum + estimateEntryTokens(e), 0);
}

/**
 * Largest prefix of `entries` whose estimated tokens fit `budget`, found by
 * binary search over the prefix length.
 *
 * Entries are already sorted best-first, so the answer is always a prefix —
 * binary search finds the cut deterministically. At least one entry is always
 * kept (a single over-budget entry is better than an empty list).
 *
 * @param entries - Ranked entries, best-first.
 * @param budget - Approximate token budget.
 * @returns The kept prefix (length ≥ 1 when `entries` is non-empty).
 */
function trimToBudget(entries: ReadingEntry[], budget: number): ReadingEntry[] {
  if (entries.length === 0) return [];

  let lo = 1;
  let hi = entries.length;
  let best = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (totalTokens(entries.slice(0, mid)) <= budget) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return entries.slice(0, best);
}

/**
 * Build the fused, token-budgeted reading list.
 *
 * Fuses import-graph centrality, proof-chain bug-magnet rate, and co-change
 * into one ranked list, personalizes toward the active scope when present, and
 * trims to the token budget. Returns `null` when the graph is too sparse
 * (`< MIN_EDGES` edges) — there is nothing meaningful to rank.
 *
 * @param input - Graph, signals, scope files, and budget (see
 *   {@link ReadingOrderInput}).
 * @returns The populated `readingOrder` region, or `null` below the edge
 *   threshold.
 */
export function buildReadingOrder(input: ReadingOrderInput): ReadingOrder | null {
  const { graph, bugMagnets, coChange, scopeFiles, scopeSlug } = input;
  const budget = input.budget ?? DEFAULT_BUDGET;

  if (graph.edges.length < MIN_EDGES) return null;

  // 1. Centrality — fixed-iteration PageRank over the FULL resolved graph,
  //    normalized to its own max. PageRank alone lets a near-leaf inherit a
  //    central importer's mass, so we BLEND it with the raw in-degree below.
  const ranks = pageRank(graph);
  if (ranks.size === 0) return null;
  let maxRank = 0;
  for (const r of ranks.values()) if (r > maxRank) maxRank = r;

  // Raw in-degree (distinct importers) — the ground-truth "how many files
  // depend on this". When the graph didn't carry it (older callers/tests),
  // recompute from edges so the blend and the near-leaf floor still apply.
  const inDegree = graph.inDegree ?? computeInDegree(graph);
  let maxInDegree = 0;
  for (const node of graph.nodes) {
    const d = inDegree[node] ?? 0;
    if (d > maxInDegree) maxInDegree = d;
  }

  const barrelSet = new Set(graph.barrelFiles ?? []);
  const generatedSet = new Set(graph.generatedFiles ?? []);

  // 2. Bug-magnet rate — index by file. Only rows that actually carry a
  //    measured rate (Slice 1's ≥3-touch gate) contribute; normalize per signal.
  const magnetByFile = new Map<string, BugMagnetRate>();
  let maxFindingsRate = 0;
  let maxRejections = 0;
  for (const m of bugMagnets) {
    magnetByFile.set(m.file, m);
    if (m.findingsPerTouch !== null && m.findingsPerTouch > maxFindingsRate) maxFindingsRate = m.findingsPerTouch;
    if (m.rejectionCycles !== null && m.rejectionCycles > maxRejections) maxRejections = m.rejectionCycles;
  }

  // 3. Co-change — per-file partner count + the strongest coupling percentage,
  //    so a heavily-coupled file ranks up and we can name a concrete partner.
  const coChangeByFile = new Map<string, { partners: number; topPct: number; topPartner: string }>();
  for (const row of coChange) {
    for (const [self, other] of [[row.fileA, row.fileB], [row.fileB, row.fileA]] as const) {
      const acc = coChangeByFile.get(self) ?? { partners: 0, topPct: 0, topPartner: '' };
      acc.partners += 1;
      if (row.coChangePercentage > acc.topPct) {
        acc.topPct = row.coChangePercentage;
        acc.topPartner = other;
      }
      coChangeByFile.set(self, acc);
    }
  }
  let maxPartners = 0;
  for (const c of coChangeByFile.values()) if (c.partners > maxPartners) maxPartners = c.partners;

  const scopeSet = new Set(scopeFiles);

  // Fuse over every node in the graph. A file scores from whichever signals
  // measured it; reasons state only the bases that actually fired.
  const entries: Array<ReadingEntry & { rawInDegree: number }> = [];
  for (const file of graph.nodes) {
    const pr = maxRank > 0 ? (ranks.get(file) ?? 0) / maxRank : 0;
    const raw = inDegree[file] ?? 0;
    const normDeg = maxInDegree > 0 ? raw / maxInDegree : 0;

    // TARGET 5 — geometric mean of normalized PageRank and normalized
    // in-degree. A file that inherits PageRank but has few real importers
    // (small normDeg) can't inflate: sqrt(high * low) stays low. A real hub
    // scores high on BOTH, so the blend rewards it.
    let centrality = Math.sqrt(pr * normDeg);

    // Down-weight barrels and generated files — high fan-in, low reading value.
    if (generatedSet.has(file)) centrality *= GENERATED_DAMP;
    else if (barrelSet.has(file)) centrality *= BARREL_DAMP;
    // Down-weight obvious non-head paths (e2e helpers, Cypress fixtures, test
    // scaffolds): a shared test helper can carry real fan-in but is never the
    // architectural reading order, so it must not outscore real hubs. The
    // explicit head-demotion below is the hard floor; this keeps the score honest.
    if (isNonHeadPath(file)) centrality *= NONHEAD_DAMP;

    const reasons: string[] = [];
    let score = W_CENTRALITY * centrality;

    const magnet = magnetByFile.get(file);
    if (magnet && magnet.touchCount !== null) {
      const normRate = maxFindingsRate > 0 && magnet.findingsPerTouch !== null
        ? magnet.findingsPerTouch / maxFindingsRate
        : 0;
      const normRej = maxRejections > 0 && magnet.rejectionCycles !== null
        ? magnet.rejectionCycles / maxRejections
        : 0;
      score += W_BUGMAGNET * (normRate + normRej);
      const rejPart = magnet.rejectionCycles ? `, ${magnet.rejectionCycles} rework cycle${magnet.rejectionCycles === 1 ? '' : 's'}` : '';
      reasons.push(`${magnet.touchCount} work item${magnet.touchCount === 1 ? '' : 's'}${rejPart}`);
    }

    const coc = coChangeByFile.get(file);
    if (coc && coc.partners > 0) {
      const normPartners = maxPartners > 0 ? coc.partners / maxPartners : 0;
      score += W_COCHANGE * normPartners;
      const partnerName = coc.topPartner.split('/').pop() ?? coc.topPartner;
      reasons.push(`changed together with ${partnerName} (${Math.round(coc.topPct)}%)`);
    }

    // Lead with the concrete in-degree citation (the honest, measured basis)
    // and keep the legacy `import centrality` reason for back-compat consumers.
    reasons.push(importanceReason(raw));
    reasons.push(`import centrality ${centrality.toFixed(2)}`);

    if (scopeSet.has(file)) {
      // Multiplicative boost rewards an already-central in-scope file; the small
      // additive term guarantees an in-scope file outranks an equal-centrality
      // peer even when both score ~0 (pure importers, whose geometric-mean
      // centrality is 0 because in-degree is 0). Additive term is tiny so it
      // never lifts a scoped leaf above a genuine hub.
      score = score * SCOPE_BOOST + SCOPE_FLOOR;
      reasons.unshift('in active scope');
    }

    entries.push({ file, score: Number(score.toFixed(6)), reasons, rawInDegree: raw });
  }

  // Rank best-first; ties break on file path for a total, byte-stable order.
  entries.sort((a, b) => (b.score - a.score) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  // TARGET 1 sanity guard — a near-leaf (raw in-degree ≤ 2) must never sit in
  // the top decile by inherited centrality. Stable-partition the ranked list:
  // near-leaves that landed in the top decile are demoted below all
  // non-near-leaves, preserving relative order within each group. Files boosted
  // by an active scope or a measured bug-magnet are exempt (they earned the
  // rank on an actionable signal, not inherited centrality).
  const guarded = demoteNearLeaves(entries, scopeSet, magnetByFile);

  const trimmed = trimToBudget(
    guarded.map(({ file, score, reasons }) => ({ file, score, reasons })),
    budget,
  );

  const coverageNote = computeCoverageNote(
    graph.nodes.length,
    input.totalSourceFiles ?? null,
    input.primaryLanguageIsGraphLanguage ?? true,
  );

  return {
    budget,
    personalizedTo: scopeFiles.length > 0 ? scopeSlug : null,
    coverageNote,
    entries: trimmed,
  };
}

/** Recompute raw in-degree (distinct importers) from edges when not supplied. */
function computeInDegree(graph: Pick<CodeGraph, 'nodes' | 'edges'>): Record<string, number> {
  const seen = new Set<string>();
  const deg: Record<string, number> = {};
  for (const n of graph.nodes) deg[n] = 0;
  for (const e of graph.edges) {
    const key = `${e.from} ${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deg[e.to] = (deg[e.to] ?? 0) + 1;
  }
  return deg;
}

/**
 * Concrete, measured importance reason citing raw in-degree, replacing the
 * opaque "import centrality 1.00". A high-fan-in file reads as a "core hub";
 * a moderate one as "imported by N files"; a 0-importer node (a pure importer
 * that depends on others but is depended on by none) says so honestly.
 */
function importanceReason(rawInDegree: number): string {
  if (rawInDegree === 0) return 'entry point — imports others, imported by none in-graph';
  const fileWord = rawInDegree === 1 ? 'file' : 'files';
  if (rawInDegree >= 20) return `core hub — imported by ${rawInDegree} ${fileWord} across the repo`;
  return `imported by ${rawInDegree} ${fileWord}`;
}

/**
 * Demote near-leaves (raw in-degree ≤ {@link NEAR_LEAF_INDEGREE}) out of the top
 * decile. Stable: keeps the within-group ranking. A file exempt because it is
 * in the active scope or carries a measured bug-magnet rate is NOT demoted — it
 * earned its rank on an actionable signal, not inherited centrality.
 */
function demoteNearLeaves(
  entries: Array<ReadingEntry & { rawInDegree: number }>,
  scopeSet: Set<string>,
  magnetByFile: Map<string, BugMagnetRate>,
): Array<ReadingEntry & { rawInDegree: number }> {
  if (entries.length === 0) return entries;
  const topDecile = Math.max(1, Math.ceil(entries.length / 10));

  const isExempt = (e: { file: string }): boolean => {
    if (scopeSet.has(e.file)) return true;
    const m = magnetByFile.get(e.file);
    return !!(m && m.touchCount !== null);
  };

  // The head (the first `topDecile` output slots) must contain NO non-exempt
  // near-leaf and NO non-head path. Greedily fill the head from eligible
  // entries (non-near-leaf/non-non-head OR exempt), parking the rest; once the
  // head is filled with eligible entries, the parked ones resume after it. This
  // is robust to cascades — removing one near-leaf can't pull another into the
  // head — unlike a single positional pass. Order within each group is stable.
  //
  // A non-head path (e2e/cypress/fixture) is barred from the head entirely (not
  // just the top decile): it is never "read these first" regardless of fan-in.
  const headEligible = (e: { file: string; rawInDegree: number }): boolean => {
    if (isExempt(e)) return true;
    if (isNonHeadPath(e.file)) return false;
    return e.rawInDegree > NEAR_LEAF_INDEGREE;
  };

  const head: Array<ReadingEntry & { rawInDegree: number }> = [];
  const parked: Array<ReadingEntry & { rawInDegree: number }> = [];
  for (const e of entries) {
    if (head.length < topDecile && headEligible(e)) head.push(e);
    else parked.push(e);
  }
  return [...head, ...parked];
}

/**
 * Obvious non-"read these first" paths: end-to-end test helpers, Cypress
 * fixtures/support, Playwright specs, storybook stories, and test scaffolds.
 * These can carry real in-graph fan-in (a shared e2e helper) yet are never the
 * architectural reading order, so they are demoted out of the head.
 */
function isNonHeadPath(p: string): boolean {
  return (
    /(^|\/)(e2e|cypress|playwright)\//i.test(p) ||
    /(^|\/)__(tests|mocks|fixtures)__\//.test(p) ||
    /(^|\/)(test|tests|__tests__|fixtures|mocks)\//i.test(p) ||
    /\.(cy|e2e|spec|test|stories)\.[a-z]+$/i.test(p)
  );
}

/**
 * Build the honest coverage caveat. When the resolved import subgraph covers
 * only a minority of the repo's source files, OR the graph's language isn't the
 * repo's primary language, the ranking describes a JS/TS subgraph — say so.
 * `null` when coverage is faithful (no caveat needed).
 */
function computeCoverageNote(
  graphNodeCount: number,
  totalSourceFiles: number | null,
  primaryLanguageIsGraphLanguage: boolean,
): string | null {
  if (totalSourceFiles && totalSourceFiles > 0) {
    const coverage = graphNodeCount / totalSourceFiles;
    if (!primaryLanguageIsGraphLanguage || coverage < MIN_COVERAGE) {
      const pct = Math.round(coverage * 100);
      return `ranking covers the TS/JS import subgraph only (~${pct}% of source files)`;
    }
  } else if (!primaryLanguageIsGraphLanguage) {
    return 'ranking covers the TS/JS import subgraph only, not the repo\'s primary language';
  }
  return null;
}

/**
 * Cross-reference co-change rows against the import graph to resolve each row's
 * `hasImportRelationship` flag (CORRECTION #1).
 *
 * For a co-change pair, `true` when the two files share a directed import edge
 * (either direction) in the graph, `false` when both files are present in the
 * graph's node set but have no edge between them, and `null` — never
 * `false` — when at least one file isn't in the graph at all (resolution was
 * low-confidence; we genuinely couldn't tell). Returns new rows; never mutates.
 *
 * @param coChange - The co-change rows whose flag should be resolved.
 * @param graph - The import graph providing edge/node ground truth.
 * @returns New co-change rows with `hasImportRelationship` resolved.
 */
export function resolveImportRelationships(
  coChange: CoChangeRow[],
  graph: Pick<CodeGraph, 'nodes' | 'edges'>,
): CoChangeRow[] {
  const nodeSet = new Set(graph.nodes);
  const edgeSet = new Set<string>();
  for (const e of graph.edges) {
    edgeSet.add(`${e.from} ${e.to}`);
    edgeSet.add(`${e.to} ${e.from}`);
  }

  return coChange.map((row) => {
    // Low-confidence: a file the graph never saw — can't claim a relationship
    // either way, so emit null (never a fabricated false).
    if (!nodeSet.has(row.fileA) || !nodeSet.has(row.fileB)) {
      return { ...row, hasImportRelationship: null };
    }
    return { ...row, hasImportRelationship: edgeSet.has(`${row.fileA} ${row.fileB}`) };
  });
}
