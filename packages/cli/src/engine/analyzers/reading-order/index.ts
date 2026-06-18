/**
 * Fused reading list (Slice 3)
 *
 * The payoff slice: it fuses the three independent scan signals into one
 * token-budgeted "read these first" list —
 *   1. import-graph PageRank centrality (Slice 2 — structural importance),
 *   2. proof-chain bug-magnet RATE (Slice 1 — proven rework risk), and
 *   3. proof-derived co-change (Slice 1 — files that repeatedly changed together
 *      across verified work items; gated to >= MIN_COTOUCH so a one-off or a
 *      mega-refactor artifact never counts),
 * then trims the ranked result to a ~1k-token budget and, when an active
 * `scope.md` "Files affected" list is present, personalizes the ranking toward
 * the task at hand.
 *
 * Honesty by construction: every entry's `reasons[]` states the *measured*
 * basis for its rank (centrality, work items, rework cycles, and — for
 * co-change — the verified-item count, never a synthetic percentage). The
 * co-change signal is the proof-chain's alone: it comes from intent couples
 * (files co-touched across completed work items), not git churn. Below an edge
 * threshold (a too-sparse graph) the whole result is `null`, so consumers can
 * distinguish "nothing worth ranking" from "ranked it and here's the order".
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
/**
 * A git-churn co-change row, as carried by the (frozen, currently-unpopulated)
 * `gitIntelligence.coChangeCoupling` schema field. Read only by
 * {@link resolveImportRelationships}; the live fusion uses {@link IntentCoupleInput}.
 */
export type CoChangeRow = NonNullable<
  NonNullable<EngineResult['gitIntelligence']>['coChangeCoupling']
>[number];

/**
 * A proof-derived co-change couple the fusion reads: two files co-touched across
 * `coTouchCount` completed, contract-verified work items. There is deliberately
 * no percentage — the honest provenance is the verified-item count itself, so a
 * reason reads "changed together in N verified items", never a synthetic "N%".
 */
export interface IntentCoupleInput {
  /** Lexicographically first file of the pair (matches graph node identity). */
  fileA: string;
  /** Lexicographically second file of the pair. */
  fileB: string;
  /** Distinct completed work items that touched both files. */
  coTouchCount: number;
}

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
  /**
   * Slice-1 proof-derived intent couples (verified co-change). Passed raw; the
   * fusion itself gates them to >= {@link MIN_COTOUCH} verified items, so a
   * one-off co-touch — or the thousands of spurious pairs a single huge refactor
   * would manufacture — never becomes a coupling. May be empty.
   */
  intentCouples: IntentCoupleInput[];
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
  /**
   * Whether the import graph was built from the truncated 750-file sample (i.e.
   * the repo has more files than the cap), so the graph saw only a subset of the
   * repo. Triggers a coverage caveat even when the covered fraction looks high —
   * without it, a mid-size repo would present a partial ranking as whole-repo.
   */
  graphSampled?: boolean;
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
/**
 * Minimum verified work items two files must share before the fusion treats them
 * as co-changed. At >= 2 the coupling is "changed together repeatedly", not "fell
 * inside one work item once" — which both denoises the signal and is what makes
 * it honestly *verified* co-change. It also dissolves the artifact of a single
 * sweeping refactor (one work item touching dozens of files would otherwise
 * manufacture every pairwise couple at coTouchCount 1).
 */
const MIN_COTOUCH = 2;
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

// ── Round 2: rank by informativeness, not ubiquity ─────────────────────────
// The Round-1 graph is faithful, but pure in-degree/PageRank rewards exactly
// the wrong thing for UI-heavy apps: a button imported by 16% of the repo
// outranks the database client. Ubiquity is ANTI-signal — a file imported
// almost everywhere is a "stopword" whose omnipresence makes it LESS
// informative to read first. The three levers below shift the objective from
// "most imported" to "most informative / architecturally central".

/**
 * IDF-style ubiquity down-weight. A file imported by a large fraction of the
 * repo behaves like a stopword: its centrality is multiplied by a smooth factor
 * that is ~1.0 while fan-in stays below {@link UBIQUITY_KNEE} of all files, then
 * falls off as the fraction climbs, bottoming out at {@link UBIQUITY_FLOOR} once
 * a file is imported nearly everywhere. Computed as
 * `clamp(log(N/inDeg) / log(1/KNEE), FLOOR, 1)` — the log ratio is 1.0 exactly
 * at the knee and shrinks toward 0 as inDeg → N, so a 50%-of-repo barrel is
 * crushed while an 8%-of-repo data hub is barely touched. O(1) per node.
 */
const UBIQUITY_KNEE = 0.08; // fan-in fraction at which the penalty begins
const UBIQUITY_FLOOR = 0.18; // hardest down-weight for a near-universal import

/**
 * Architectural-signal boosts (multiplicative, applied to centrality). These
 * reward files that carry "understand the system" value rather than raw fan-in:
 *  - ENTRYPOINT: app/server/main/router/index at an app or package root, route
 *    or handler files, `api/` — the seams a senior engineer opens first.
 *  - DOMAIN: schema/prisma/db/models/services and `features/<domain>/` — the
 *    data shapes and domain logic the rest of the code is organized around.
 *  - ORCHESTRATOR: a file that both consumes and is consumed (high out-degree
 *    AND non-trivial in-degree) composes the system rather than being a leaf
 *    imported everywhere; scaled smoothly by out-degree.
 */
const ENTRYPOINT_BOOST = 1.6;
const DOMAIN_BOOST = 1.45;
/** Max multiplier from the orchestrator (out-degree) signal; reached asymptotically. */
const ORCHESTRATOR_MAX_BOOST = 1.5;
/** Out-degree at which the orchestrator boost reaches ~half its max (smooth ramp). */
const ORCHESTRATOR_HALF_OUT = 8;
/** A file needs at least this in-degree before its out-degree counts as orchestration. */
const ORCHESTRATOR_MIN_IN = 3;

/**
 * Strengthened UI-atom / pure-barrel down-weight. A small leaf primitive under a
 * UI/design-system directory with a primitive name (button, badge, toast, …)
 * and low out-degree is the canonical stopword: high fan-in, near-zero reading
 * value. We crush its centrality so it cannot hold a top-5 slot in a large app.
 * Pure export-only barrels (no own declarations) are likewise demoted harder
 * than the conservative {@link BARREL_DAMP} when they are also UI barrels.
 */
const UI_ATOM_DAMP = 0.12;

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
  const { graph, bugMagnets, intentCouples, scopeFiles, scopeSlug } = input;
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

  // Raw out-degree (distinct imports) — "how many in-repo files this consumes".
  // Drives the orchestrator boost: a file that both consumes and is consumed
  // composes the system. O(E), deduped on (from, to) like in-degree.
  const outDegree = computeOutDegree(graph);

  // Total file universe for the IDF ubiquity penalty. The graph's node count is
  // the population a fan-in fraction is measured against (every file that
  // participated in an import). nFiles ≥ 1 keeps the log well-defined.
  const nFiles = Math.max(1, graph.nodes.length);

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

  // 3. Co-change — proof-derived intent couples (verified co-change). Per file:
  //    how many distinct partners it changed together with, plus the strongest
  //    partner (by verified-item count) to name concretely. Gated to >=
  //    MIN_COTOUCH verified items so one-off co-touches and mega-refactor
  //    artifacts never count. Each couple is cross-referenced against the import
  //    graph: a pair with NO shared edge is "hidden coupling" — the relationship
  //    the structural graph alone can't see, which only the proof chain reveals.
  const edgeSet = new Set<string>();
  for (const e of graph.edges) {
    edgeSet.add(`${e.from}\0${e.to}`);
    edgeSet.add(`${e.to}\0${e.from}`);
  }
  const graphNodeSet = new Set(graph.nodes);
  const coChangeByFile = new Map<
    string,
    { partners: number; topCoTouch: number; topPartner: string; topHidden: boolean }
  >();
  for (const couple of intentCouples) {
    if (couple.coTouchCount < MIN_COTOUCH) continue;
    for (const [self, other] of [[couple.fileA, couple.fileB], [couple.fileB, couple.fileA]] as const) {
      const acc = coChangeByFile.get(self) ?? { partners: 0, topCoTouch: 0, topPartner: '', topHidden: false };
      acc.partners += 1;
      // Strongest partner by co-touch count; ties broken on partner path so the
      // chosen partner (and its hidden-coupling flag) is independent of the input
      // couple order — buildReadingOrder is self-determinizing, not reliant on the
      // caller pre-sorting intentCouples.
      if (
        couple.coTouchCount > acc.topCoTouch ||
        (couple.coTouchCount === acc.topCoTouch && (acc.topPartner === '' || other < acc.topPartner))
      ) {
        acc.topCoTouch = couple.coTouchCount;
        acc.topPartner = other;
        // Hidden coupling: both files are graph nodes yet share no import edge,
        // so the relationship is invisible to structure alone. A partner the
        // graph never saw is NOT claimed hidden — we genuinely can't tell.
        acc.topHidden =
          graphNodeSet.has(self) && graphNodeSet.has(other) && !edgeSet.has(`${self}\0${other}`);
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

    const outDeg = outDegree[file] ?? 0;

    // TARGET 5 — geometric mean of normalized PageRank and normalized
    // in-degree. A file that inherits PageRank but has few real importers
    // (small normDeg) can't inflate: sqrt(high * low) stays low. A real hub
    // scores high on BOTH, so the blend rewards it.
    let centrality = Math.sqrt(pr * normDeg);

    // ROUND 2 — rank by informativeness, not ubiquity. A file imported by a
    // large fraction of the repo is a stopword: its omnipresence makes it LESS
    // informative to read first. Multiply centrality by the smooth IDF penalty
    // so a 50%-of-repo barrel falls out of the head while an 8%-of-repo data hub
    // is barely touched.
    centrality *= ubiquityMultiplier(raw, nFiles);

    // A re-export barrel (a UI/marketing index, or any non-domain package-root
    // index with high fan-in and zero captured out-edges) is the worst stopword:
    // it matches the index-at-package-root entrypoint shape yet teaches nothing.
    // Detect it once so it is denied the entrypoint boost and crushed below. The
    // shape rule catches `export * from`-only barrels the parser records as
    // exports (so they carry no out-edge) without flagging the data-layer index.
    const reexportBarrel = isUiBarrelIndex(file) || isReexportBarrelByShape(file, raw, outDeg);

    // Reward architectural signal over raw fan-in. Entrypoints (app/server/
    // route/api/index-at-root) and domain/data files (schema/prisma/db/services/
    // features) carry "understand the system" value; orchestrators that both
    // consume and are consumed compose it. Boosts stack multiplicatively but are
    // bounded, so they re-order among real hubs without manufacturing one. A
    // re-export barrel is explicitly excluded from the entrypoint boost.
    if (!reexportBarrel && isEntrypointPath(file)) centrality *= ENTRYPOINT_BOOST;
    if (isDomainPath(file)) centrality *= DOMAIN_BOOST;
    centrality *= orchestratorMultiplier(raw, outDeg);

    // Down-weight barrels and generated files — high fan-in, low reading value.
    if (generatedSet.has(file)) centrality *= GENERATED_DAMP;
    else if (barrelSet.has(file)) centrality *= BARREL_DAMP;
    // Strengthened leaf-primitive demotion: a UI atom (button/badge/toast/…)
    // with low out-degree, and any re-export barrel, are the canonical
    // stopwords — high fan-in, near-zero reading value. Crush them so they
    // cannot hold a top-5 slot in a large app. A primitive-named file that
    // actually orchestrates (high out-degree) is spared.
    if (reexportBarrel || (isUiAtom(file) && outDeg <= 2)) centrality *= UI_ATOM_DAMP;
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
      // Name the partner by basename, but disambiguate when it collides with
      // THIS file's basename (e.g. two `census.ts` at different paths) so the
      // reason never reads as a file coupled to itself.
      const selfBase = file.split('/').pop() ?? file;
      const partnerBase = coc.topPartner.split('/').pop() ?? coc.topPartner;
      const partnerName =
        partnerBase === selfBase ? coc.topPartner.split('/').slice(-2).join('/') : partnerBase;
      // Honest provenance: the verified-item count from the proof chain, never a
      // synthetic percentage. Flag hidden coupling (changed together with no
      // shared import edge) — the relationship structure alone would miss.
      const items = `${coc.topCoTouch} verified item${coc.topCoTouch === 1 ? '' : 's'}`;
      const hidden = coc.topHidden ? ' (hidden coupling)' : '';
      reasons.push(`changed together with ${partnerName} in ${items}${hidden}`);
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
    input.graphSampled ?? false,
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
 * Raw out-degree (distinct in-repo imports) per node, deduped on (from, to) so a
 * file importing the same target twice counts once — the mirror of in-degree.
 * Drives the orchestrator boost. O(E); never carried on the graph today, so
 * always derived here.
 */
function computeOutDegree(graph: Pick<CodeGraph, 'nodes' | 'edges'>): Record<string, number> {
  const seen = new Set<string>();
  const deg: Record<string, number> = {};
  for (const n of graph.nodes) deg[n] = 0;
  for (const e of graph.edges) {
    const key = `${e.from} ${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deg[e.from] = (deg[e.from] ?? 0) + 1;
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
 * UI-primitive leaf: a small atom under a UI / design-system / components
 * directory whose basename is a known primitive (button, badge, toast, …). It
 * is matched on BOTH a UI-ish path AND a primitive name so a domain file that
 * merely lives under `components/` (e.g. a feature page) is not caught. The
 * caller additionally gates on out-degree so a composite that happens to be
 * named like a primitive but orchestrates many imports is spared.
 */
const UI_PRIMITIVE_NAME =
  /^(button|badge|toast|spinner|input|textarea|typography|text|heading|loading|loadingcontent|tooltip|tooltipexplanation|alert|skeleton|avatar|label|checkbox|radio|switch|toggle|separator|divider|card|chip|tag|icon|iconcircle|spacer|kbd|progress)(\.[a-z]+)?$/i;

/** A path segment that marks a UI / design-system / components location. */
const UI_DIR_SEGMENT = /(^|\/)(ui|design-system|primitives|atoms|components)(\/|$)/i;

function isUiAtom(p: string): boolean {
  const base = p.split('/').pop() ?? p;
  const stem = base.replace(/\.[a-z]+$/i, '');
  if (!UI_PRIMITIVE_NAME.test(base)) return false;
  // Require a UI-ish location OR a clearly primitive standalone name so a
  // top-level `components/Toast.tsx` (no `ui/` segment) is still caught, but an
  // arbitrary `lib/input.ts` parser is not unless it sits under a UI dir.
  const uiDir = UI_DIR_SEGMENT.test(p);
  return uiDir || /^(button|badge|toast|spinner|typography|skeleton|avatar)$/i.test(stem);
}

/** Whether the file is an `index.*` sitting at a directory/package root. */
function isIndexFile(p: string): boolean {
  const base = (p.split('/').pop() ?? p).toLowerCase();
  return /^index\.[a-z]+$/.test(base);
}

/** The directory segment immediately enclosing `index.*` (lowercased). */
function indexEnclosingSegment(p: string): string {
  const base = p.split('/').pop() ?? p;
  const dir = p.slice(0, p.length - base.length).replace(/\/$/, '');
  return (dir.split('/').pop() ?? '').toLowerCase();
}

/**
 * A UI / presentation re-export barrel: an `index` file whose enclosing
 * package/dir is a UI, design-system, or marketing/content surface
 * (`packages/ui/index.tsx`, `ui-patterns/index.tsx`, `marketing/index.ts`).
 * These accumulate enormous fan-in (everything imports the design system or
 * content through one entry) yet are the canonical stopword — reading the barrel
 * teaches you nothing about the architecture. They must NOT receive the
 * entrypoint boost and ARE crushed like a UI atom.
 */
function isUiBarrelIndex(p: string): boolean {
  if (!isIndexFile(p)) return false;
  const seg = indexEnclosingSegment(p);
  return /(^|-)(ui|design-system|components|primitives|atoms|icons|marketing|content|emails?|email-templates?)$/.test(seg);
}

/**
 * A pure re-export barrel inferred from graph shape: a package/dir-root `index`
 * file with substantial fan-in but ZERO captured out-edges — it is imported by
 * many yet imports nothing itself, the signature of an `export * from './x'`
 * barrel (whose re-exports the graph records as exports, not import edges). A
 * domain/data index (e.g. a `db`/`schema` package entry) is exempt: it is a
 * legitimate "read first" data seam, not a presentation barrel.
 */
function isReexportBarrelByShape(p: string, inDeg: number, outDeg: number): boolean {
  if (outDeg !== 0 || inDeg < 4) return false;
  if (!isIndexFile(p)) return false;
  // A domain/data index (db/schema/models/services) is a legitimate read-first
  // data seam, not a presentation barrel — exempt it. (An `api/` route index is
  // also real, caught by isDomainPath being false but the route shape elsewhere;
  // here we only need to spare the data layer.)
  if (isDomainPath(p)) return false;
  return true;
}

/**
 * Likely entrypoint: the seams a reader opens first. App/package-root
 * `app`/`server`/`main`/`index`/`router` files, route/handler files, and
 * anything under an `api/` segment. Index files only count as entrypoints at an
 * app/package boundary (`src/index`, `<pkg>/index`), not a deep barrel.
 */
function isEntrypointPath(p: string): boolean {
  const base = (p.split('/').pop() ?? p).toLowerCase();
  const stem = base.replace(/\.[a-z]+$/i, '');
  if (/(^|\/)api(\/|$)/i.test(p)) return true;
  if (/(^|\.)(route|router|handler|controller|middleware)(\.[a-z]+)?$/i.test(base)) return true;
  if (/^(server|main|app|bootstrap|application)$/i.test(stem)) return true;
  if (/^(env|config|settings)$/i.test(stem)) return true; // server/env config entry
  if (stem === 'index') {
    // Only an app/package-root index is an entrypoint; a deep `foo/bar/index`
    // is usually a re-export barrel, handled by the barrel down-weight instead.
    return /(^|\/)(src|app|server|apps\/[^/]+|packages\/[^/]+)\/index\.[a-z]+$/i.test(p)
      || /^[^/]+\/index\.[a-z]+$/i.test(p);
  }
  return false;
}

/**
 * Domain / data file: schema, prisma, db, models, services, and a
 * `features/<domain>/` or `domain/` layout. These carry the data shapes and
 * business logic the rest of the system is organized around — high "understand
 * the system" value independent of fan-in.
 */
function isDomainPath(p: string): boolean {
  return (
    /(^|\/)(schema|prisma|db|database|models?|entities|services?|domain|repositories)(\/|\b)/i.test(p) ||
    /(^|\/)features?\/[^/]+\//i.test(p) ||
    /(schema|prisma|\.model|\.entity|\.service|\.repository)(\.[a-z]+)?$/i.test(p.split('/').pop() ?? p)
  );
}

/**
 * Smooth IDF-style ubiquity multiplier in `[UBIQUITY_FLOOR, 1]`. Identity while
 * fan-in stays under the knee fraction of all files; decays toward the floor as
 * the fraction approaches 1 (a near-universal import). `log(N/inDeg)` is the
 * classic IDF; dividing by `log(1/KNEE)` normalizes it to 1.0 at the knee.
 */
function ubiquityMultiplier(inDeg: number, nFiles: number): number {
  if (inDeg <= 0 || nFiles <= 0) return 1;
  const frac = inDeg / nFiles;
  if (frac <= UBIQUITY_KNEE) return 1;
  const idf = Math.log(nFiles / inDeg);
  const norm = idf / Math.log(1 / UBIQUITY_KNEE);
  return Math.max(UBIQUITY_FLOOR, Math.min(1, norm));
}

/**
 * Smooth orchestrator multiplier in `[1, ORCHESTRATOR_MAX_BOOST]`, scaled by
 * out-degree once a file is consumed by at least {@link ORCHESTRATOR_MIN_IN}
 * others. A file that both imports many modules AND is itself imported composes
 * the system; a pure leaf (out-degree 0) gets no boost. Uses a saturating ramp
 * so a route handler with 8 imports gets ~half the max and big page components
 * don't run away.
 */
function orchestratorMultiplier(inDeg: number, outDeg: number): number {
  if (inDeg < ORCHESTRATOR_MIN_IN || outDeg <= 0) return 1;
  const ramp = outDeg / (outDeg + ORCHESTRATOR_HALF_OUT); // 0→1, =0.5 at HALF_OUT
  return 1 + (ORCHESTRATOR_MAX_BOOST - 1) * ramp;
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
  graphWasSampled: boolean,
): string | null {
  // Percentage of source files the graph actually covers, clamped to [0, 100]
  // (the graph's nodes are a subset of source files, so coverage can't exceed
  // 100% in practice — the clamp just guards against any counting drift).
  const pct =
    totalSourceFiles && totalSourceFiles > 0
      ? Math.min(100, Math.round((graphNodeCount / totalSourceFiles) * 100))
      : null;

  // 1. Polyglot: the graph's language isn't the repo's primary language. This is
  //    a LANGUAGE caveat, not a coverage one — frame it as such (a misleading
  //    "~100%" would otherwise read as "covered the whole repo").
  if (!primaryLanguageIsGraphLanguage) {
    return 'ranking covers the TS/JS import subgraph only, not the repo\'s primary language';
  }

  // 2. Sampled: the import graph was built from the truncated 750-file sample, so
  //    it did not see the whole repo even when the covered fraction looks high.
  //    Without this, a mid-size repo (≈750–2500 files) would emit a confident
  //    whole-repo ranking over a partial sample with no caveat at all.
  if (graphWasSampled) {
    return pct !== null
      ? `ranking computed over a sampled subset of the repo (~${pct}% of source files)`
      : 'ranking computed over a sampled subset of the repo';
  }

  // 3. Low coverage even without sampling (e.g. a small TS/JS island in a repo of
  //    mostly isolated or non-import files): disclose the partial coverage.
  if (pct !== null && graphNodeCount / (totalSourceFiles as number) < MIN_COVERAGE) {
    return `ranking covers the TS/JS import subgraph only (~${pct}% of source files)`;
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
