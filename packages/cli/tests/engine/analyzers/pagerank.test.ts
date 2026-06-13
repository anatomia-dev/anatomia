/**
 * Slice 3 — deterministic PageRank over the import graph.
 *
 * Covers pageRank(): a hub (imported by many) ranks above a leaf, dangling
 * nodes don't sink rank, scores are conserved (~sum to 1), and two runs over
 * identical inputs are byte-identical. Inputs are synthetic graphs so the test
 * is independent of tree-sitter / the real repo.
 */

import { describe, it, expect } from 'vitest';
import { pageRank } from '../../../src/engine/analyzers/graph/pagerank.js';
import type { ImportEdge } from '../../../src/engine/analyzers/graph/buildGraph.js';

function edge(from: string, to: string): ImportEdge {
  return { from, to, names: [] };
}

describe('pageRank', () => {
  it('ranks a widely-imported hub above its leaf importers', () => {
    // a, b, c all import hub; hub imports nothing.
    const ranks = pageRank({
      nodes: ['a.ts', 'b.ts', 'c.ts', 'hub.ts'],
      edges: [edge('a.ts', 'hub.ts'), edge('b.ts', 'hub.ts'), edge('c.ts', 'hub.ts')],
    });

    const hub = ranks.get('hub.ts')!;
    const leaf = ranks.get('a.ts')!;
    expect(hub).toBeGreaterThan(leaf);
  });

  it('conserves total rank to ~1 across a graph with a dangling node', () => {
    const ranks = pageRank({
      nodes: ['a.ts', 'b.ts', 'c.ts'],
      edges: [edge('a.ts', 'b.ts'), edge('b.ts', 'c.ts')], // c.ts dangles
    });
    const total = [...ranks.values()].reduce((s, r) => s + r, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('returns an empty map for an empty graph', () => {
    expect(pageRank({ nodes: [], edges: [] }).size).toBe(0);
  });

  it('is deterministic — two runs produce identical scores', () => {
    const graph = {
      nodes: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
      edges: [
        edge('a.ts', 'c.ts'),
        edge('b.ts', 'c.ts'),
        edge('c.ts', 'd.ts'),
        edge('d.ts', 'a.ts'),
      ],
    };
    const first = JSON.stringify([...pageRank(graph).entries()]);
    const second = JSON.stringify([...pageRank(graph).entries()]);
    expect(first).toBe(second);
  });

  it('ignores edges that reference nodes outside the node set', () => {
    const ranks = pageRank({
      nodes: ['a.ts', 'b.ts'],
      edges: [edge('a.ts', 'b.ts'), edge('a.ts', 'ghost.ts')],
    });
    expect(ranks.has('ghost.ts')).toBe(false);
    expect(ranks.get('b.ts')!).toBeGreaterThan(0);
  });
});
