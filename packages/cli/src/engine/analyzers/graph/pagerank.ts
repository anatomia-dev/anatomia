/**
 * Deterministic power-iteration PageRank (Slice 3)
 *
 * Computes node centrality over the Slice-2 import digraph. "Centrality" here
 * is import-graph PageRank: a file is central when many files (transitively)
 * import it, so it is the structural answer to "what should I read first?".
 *
 * Determinism by construction: a fixed iteration count (no float-comparison
 * convergence test that could vary by accumulation order), node order taken
 * verbatim from the already-sorted graph, and dangling-node mass redistributed
 * uniformly. Two runs over the same graph produce byte-identical scores.
 *
 * Pure and synchronous — no I/O, no CLI deps (engine boundary). The result is a
 * `Map<file, rank>` the reading-order fusion reads; it never mutates its input.
 */

import type { CodeGraph } from './buildGraph.js';

/** Standard PageRank damping factor (probability of following an edge). */
const DAMPING = 0.85;

/**
 * Fixed power-iteration count. PageRank on a sparse import graph converges
 * well within this; a fixed count (vs an epsilon convergence check) keeps the
 * result independent of float accumulation order, so two runs are identical.
 */
const ITERATIONS = 40;

/**
 * Run deterministic power-iteration PageRank over an import graph.
 *
 * Each edge `from → to` is a "vote" from the importer to the imported file, so
 * files that are widely depended upon score highest. Dangling nodes (no
 * outgoing edges) redistribute their mass uniformly across all nodes, the
 * standard correction that keeps total rank conserved.
 *
 * @param graph - The Slice-2 import graph (`nodes` already sorted, `edges`
 *   are repo-relative `from → to` pairs). Only `nodes` and `edges` are read.
 * @returns A map from each node's repo-relative path to its PageRank score in
 *   `[0, 1]` (scores sum to ~1). Empty when the graph has no nodes.
 */
export function pageRank(graph: Pick<CodeGraph, 'nodes' | 'edges'>): Map<string, number> {
  const nodes = graph.nodes;
  const n = nodes.length;
  const ranks = new Map<string, number>();
  if (n === 0) return ranks;

  // Index nodes by their (already sorted) position so iteration is order-stable.
  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) index.set(nodes[i]!, i);

  // Out-edge adjacency + out-degree, both keyed by node index.
  const outTargets: number[][] = Array.from({ length: n }, () => []);
  const outDegree = new Array<number>(n).fill(0);
  for (const edge of graph.edges) {
    const from = index.get(edge.from);
    const to = index.get(edge.to);
    if (from === undefined || to === undefined) continue; // edge outside node set
    outTargets[from]!.push(to);
    outDegree[from]! += 1;
  }

  let rank = new Array<number>(n).fill(1 / n);
  const base = (1 - DAMPING) / n;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const next = new Array<number>(n).fill(base);

    // Dangling mass (nodes with no out-edges) is shared uniformly — added to
    // every node so total rank is conserved across iterations.
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      if (outDegree[i] === 0) dangling += rank[i]!;
    }
    const danglingShare = (DAMPING * dangling) / n;

    for (let i = 0; i < n; i++) {
      const deg = outDegree[i]!;
      if (deg === 0) continue;
      const share = (DAMPING * rank[i]!) / deg;
      for (const target of outTargets[i]!) {
        next[target]! += share;
      }
    }
    for (let i = 0; i < n; i++) next[i]! += danglingShare;

    rank = next;
  }

  for (let i = 0; i < n; i++) ranks.set(nodes[i]!, rank[i]!);
  return ranks;
}
