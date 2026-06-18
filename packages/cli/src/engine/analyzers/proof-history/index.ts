/**
 * Proof co-change engine (Phase 3).
 *
 * Answers "what else will I have to touch?" for a single queried file by mining
 * the verified work-outcome ledger (`.ana/proof_chain.json`) for files that
 * change *together* with it across completed work items, then cross-referencing
 * each partner against the structural import graph.
 *
 * This module is the pure, synchronous heart of the **Also changes with**
 * section: it takes already-parsed proof entries plus the optional import graph
 * and returns a classified, gated partner list. It performs no IO and emits no
 * chalk — all reads happen in `getProofContext`, all rendering in `proof.ts`.
 *
 * Honesty by construction:
 *  - A partner only counts when both files clear `MIN_TOUCHES` (≥3 work items)
 *    and the couple clears `MIN_COTOUCH` (≥2 shared verified items).
 *  - One mega-refactor cannot manufacture pairs: items touching more than
 *    `OVERSIZED_ITEM_CAP` files are excluded from *pairing* (touch-counting is
 *    unaffected).
 *  - The graph relation is `hidden` / `imports` / `unknown` — never fabricated.
 *    No graph, or a partner the graph never saw, is `unknown`, never guessed.
 */

import type { CodeGraph } from '../graph/buildGraph.js';

/**
 * Minimum number of completed work items a file must appear in before it can
 * participate in a co-change couple (applies to BOTH the query and the
 * partner). Touch-counting spans every entry, oversized or not.
 */
export const MIN_TOUCHES = 3;

/** Minimum shared (non-oversized) work items for a couple to surface. */
export const MIN_COTOUCH = 2;

/**
 * A work item touching more files than this is excluded from pair generation:
 * a single mega-refactor with a large overlapping file set would otherwise
 * manufacture spurious couples. Chosen well above a normal feature's footprint
 * (the live chain's largest item touches 110 files) but below the
 * mega-refactor regime. Touch-counting for `MIN_TOUCHES` is unaffected — only
 * pairing is skipped for these items.
 */
export const OVERSIZED_ITEM_CAP = 40;

/** How a co-change partner relates to the query in the import graph. */
export type CoChangeRelation = 'hidden' | 'imports' | 'unknown';

/** One proof-derived co-change partner of the queried file. */
export interface CoChangePartner {
  /** Repo-relative path of the partner, exactly as stored in `modules_touched`. */
  file: string;
  /** Number of shared (non-oversized) work items linking it to the query. */
  coTouchCount: number;
  /**
   * Relation to the query in the import graph:
   *  - `imports` — both are graph nodes and an edge exists (either direction);
   *  - `hidden` — both are graph nodes but NO edge exists (co-change the graph
   *    can't see — the high-value signal);
   *  - `unknown` — no graph, or one of the files is absent from the graph.
   */
  relation: CoChangeRelation;
  /** The linking work-item slugs, deterministically sorted. */
  slugs: string[];
}

/** The proof co-change result for one queried file. */
export interface CoChangeResult {
  /**
   * Surviving partners, ordered for display: `hidden` first (the surprising
   * signal), then `imports`, then `unknown`; within each, by co-touch count
   * descending, ties broken by path. NOT capped — the renderer applies the
   * first-screen cap and reports `total`.
   */
  partners: CoChangePartner[];
  /** Total surviving partners (== `partners.length`); the cap footer uses this. */
  total: number;
  /**
   * True when a same-stem test partner of the query (e.g. `work.test.ts` for
   * `work.ts`) was dropped from the list — the renderer emits a one-line note.
   */
  suppressedTestPartner: boolean;
}

/** Matcher contract: does a stored path match a queried path? (reuses `fileMatches`). */
export type FileMatcher = (stored: string, queried: string) => boolean;

/** The minimal proof-entry shape this engine reads (slug + touched files). */
export interface CoChangeEntry {
  slug?: string;
  modules_touched?: string[];
}

/**
 * Strip a path down to its stem for same-stem test-partner detection.
 *
 * Removes a `.test`/`.spec` infix and the file extension, e.g.
 * `work.test.ts` → `work`, `work.ts` → `work`, `parse.spec.tsx` → `parse`.
 *
 * @param filePath - A repo-relative or basename path.
 * @returns The bare stem (no directory, no `.test`/`.spec`, no extension).
 */
function stemOf(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  // Drop a `.test`/`.spec` infix together with its trailing extension first
  // (work.test.ts → work), then any remaining extension (work.ts → work).
  return base.replace(/\.(test|spec)\.[^.]+$/i, '').replace(/\.[^.]+$/, '');
}

/** Whether a basename carries a `.test`/`.spec` infix. */
function isTestFile(filePath: string): boolean {
  const base = filePath.split('/').pop() ?? filePath;
  return /\.(test|spec)\.[^.]+$/i.test(base);
}

/** Directory portion of a path, or '' for a bare basename. */
function dirOf(filePath: string): string {
  return filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
}

/**
 * Whether `partner` is the same-stem test counterpart of `query` (or vice
 * versa): exactly one of them is a test file, their stems are equal, and they
 * share a directory (or one path is a basename / suffix of the other). This is
 * net-new in Phase 3 — the harvested analyzer does not suppress partners.
 *
 * @param query - The queried file path.
 * @param partner - A candidate co-change partner path.
 * @returns Whether the partner should be suppressed as a same-stem test file.
 */
function isSameStemTestPartner(query: string, partner: string): boolean {
  // Exactly one side must be a test file — two non-tests or two tests are real
  // co-change, not a file/its-own-test pairing.
  if (isTestFile(query) === isTestFile(partner)) return false;
  if (stemOf(query) !== stemOf(partner)) return false;

  const qDir = dirOf(query);
  const pDir = dirOf(partner);
  // Same directory, a bare-basename query/partner, or a path-suffix relation.
  return (
    qDir === pDir ||
    qDir === '' ||
    pDir === '' ||
    query.endsWith('/' + partner) ||
    partner.endsWith('/' + query)
  );
}

/**
 * Resolve a queried/partner path to its node identity in the graph.
 *
 * Prefers an exact node match (the common case — both are repo-relative POSIX
 * paths), falling back to the supplied matcher so a basename query
 * (`work.ts`) still resolves to its full node path.
 *
 * @param target - The path to resolve.
 * @param nodes - The graph's node paths.
 * @param nodeSet - A set view of `nodes` for O(1) exact lookup.
 * @param match - The file matcher (reused `fileMatches`).
 * @returns The matching node path, or `null` when absent from the graph.
 */
function resolveNode(
  target: string,
  nodes: string[],
  nodeSet: Set<string>,
  match: FileMatcher,
): string | null {
  if (nodeSet.has(target)) return target;
  return nodes.find((n) => match(n, target)) ?? null;
}

/**
 * Compute the proof co-change partners of a queried file.
 *
 * Pure and synchronous: no IO, no chalk. Walks the already-parsed proof
 * entries to (1) count per-file touches across ALL entries, (2) accumulate
 * shared work items between the query and every co-touched file from
 * non-oversized entries, then gates, suppresses same-stem test partners,
 * classifies each survivor against the import graph, and returns them ordered
 * for display.
 *
 * @param entries - Parsed proof-chain entries (slug + `modules_touched`).
 * @param queryFile - The file being queried (basename, relative, or absolute).
 * @param graph - The import graph, or `null` when none is available.
 * @param match - File matcher reused from `proofSummary` (no second matcher).
 * @returns The classified, gated co-change partners plus totals and the
 *   suppression flag. An empty list when nothing clears the gates.
 */
export function computeCoChange(
  entries: CoChangeEntry[],
  queryFile: string,
  graph: CodeGraph | null,
  match: FileMatcher,
): CoChangeResult {
  // 1. Per-file touch counts across EVERY entry (oversized included), deduping
  //    a file touched twice within one item. Also count how many items touch
  //    the query (via the matcher — the query may be a basename).
  const touchCount = new Map<string, number>();
  let queryTouchCount = 0;
  // partner file -> { items: count of shared non-oversized items, slugs }
  const partnerAcc = new Map<string, { items: number; slugs: Set<string> }>();

  for (const entry of entries) {
    const files = Array.from(new Set(entry.modules_touched ?? []));
    if (files.length === 0) continue;

    for (const file of files) {
      touchCount.set(file, (touchCount.get(file) ?? 0) + 1);
    }

    const queryInEntry = files.some((f) => match(f, queryFile));
    if (queryInEntry) queryTouchCount += 1;

    // Pairing skips oversized items (mega-refactor guard) — but only pairing;
    // the touch counts above already absorbed this item.
    if (!queryInEntry || files.length > OVERSIZED_ITEM_CAP) continue;

    for (const partner of files) {
      // The partner is every OTHER file in the item — never the query itself.
      if (match(partner, queryFile)) continue;
      const acc = partnerAcc.get(partner) ?? { items: 0, slugs: new Set<string>() };
      acc.items += 1;
      if (entry.slug) acc.slugs.add(entry.slug);
      partnerAcc.set(partner, acc);
    }
  }

  // Precompute graph lookup structures once (not per partner).
  let nodeSet: Set<string> | null = null;
  let edgeSet: Set<string> | null = null;
  let queryNode: string | null = null;
  if (graph) {
    nodeSet = new Set(graph.nodes);
    edgeSet = new Set<string>();
    for (const e of graph.edges) {
      edgeSet.add(`${e.from}\0${e.to}`);
      edgeSet.add(`${e.to}\0${e.from}`);
    }
    queryNode = resolveNode(queryFile, graph.nodes, nodeSet, match);
  }

  let suppressedTestPartner = false;
  const partners: CoChangePartner[] = [];

  for (const [file, acc] of partnerAcc) {
    // 2. Gates: query and partner each cleared MIN_TOUCHES; couple cleared
    //    MIN_COTOUCH shared (non-oversized) items.
    if (queryTouchCount < MIN_TOUCHES) continue;
    if ((touchCount.get(file) ?? 0) < MIN_TOUCHES) continue;
    if (acc.items < MIN_COTOUCH) continue;

    // 3. Same-stem test-partner suppression (net-new).
    if (isSameStemTestPartner(queryFile, file)) {
      suppressedTestPartner = true;
      continue;
    }

    // 4. hidden / imports / unknown — never fabricated.
    let relation: CoChangeRelation = 'unknown';
    if (graph && nodeSet && edgeSet && queryNode) {
      const partnerNode = resolveNode(file, graph.nodes, nodeSet, match);
      if (partnerNode) {
        relation = edgeSet.has(`${queryNode}\0${partnerNode}`) ? 'imports' : 'hidden';
      }
    }

    partners.push({
      file,
      coTouchCount: acc.items,
      relation,
      slugs: Array.from(acc.slugs).sort(),
    });
  }

  // 5. Order for display: hidden first, then imports, then unknown; within each
  //    by co-touch count desc, ties broken by path so output is byte-stable.
  const relationRank: Record<CoChangeRelation, number> = { hidden: 0, imports: 1, unknown: 2 };
  partners.sort(
    (a, b) =>
      relationRank[a.relation] - relationRank[b.relation] ||
      b.coTouchCount - a.coTouchCount ||
      (a.file < b.file ? -1 : a.file > b.file ? 1 : 0),
  );

  return { partners, total: partners.length, suppressedTestPartner };
}
