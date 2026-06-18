/**
 * Slice 3 — deep-scan fusion latency gate.
 *
 * The reading-order fusion (PageRank + signal blend + co-change + budget trim)
 * is the net-new compute the reading-order feature adds on top of the graph
 * build. Like the import-graph gate, it runs over at most the 750-file sample,
 * so the worst realistic input is a 750-node graph with a dense co-change set.
 *
 * buildReadingOrder is pure and synchronous (it calls pageRank internally); this
 * gate asserts the whole fusion stays comfortably sub-second so it never
 * dominates a deep scan — and catches an accidental O(n^2) regression in the
 * co-change wiring (which iterates intent couples × graph).
 */

import { describe, it, expect } from 'vitest';
import { buildReadingOrder, type IntentCoupleInput } from '../../src/engine/analyzers/reading-order/index.js';
import type { ImportEdge } from '../../src/engine/analyzers/graph/buildGraph.js';

describe('reading-order fusion latency (deep tier, 750-node graph)', () => {
  it('fuses centrality + bug-magnet + co-change over a 750-node graph in well under 1s', () => {
    const N = 750;
    const nodes = Array.from({ length: N }, (_, i) => `src/mod${i}.ts`);
    const edges: ImportEdge[] = [];
    for (let i = 0; i < N; i++) {
      // Each file imports up to 5 lower-indexed siblings — a realistic fan-out
      // (~3.7k edges), the same shape as the import-graph latency gate.
      for (let k = 1; k <= 5 && i - k >= 0; k++) {
        edges.push({ from: `src/mod${i}.ts`, to: `src/mod${i - k}.ts`, names: [] });
      }
    }

    // A dense co-change set on the same scale as a real mature repo (~1.5k gated
    // couples) — the worst case for the co-change cross-reference loop.
    const intentCouples: IntentCoupleInput[] = [];
    for (let i = 0; i < N; i++) {
      for (let k = 1; k <= 4 && i - k >= 0; k++) {
        intentCouples.push({ fileA: `src/mod${i - k}.ts`, fileB: `src/mod${i}.ts`, coTouchCount: 2 + (i % 5) });
      }
    }

    const bugMagnets = nodes
      .filter((_, i) => i % 7 === 0)
      .map((file, i) => ({ file, touchCount: 3 + i, findingsPerTouch: 1.5, rejectionCycles: i % 4 }));

    const start = performance.now();
    const order = buildReadingOrder({
      graph: { nodes, edges },
      bugMagnets,
      intentCouples,
      scopeFiles: [],
      scopeSlug: null,
      totalSourceFiles: N,
      primaryLanguageIsGraphLanguage: true,
    });
    const elapsedMs = performance.now() - start;

    expect(order).not.toBeNull();
    expect(order!.entries.length).toBeGreaterThan(0);
    // At least one co-change reason fired (the wiring is exercised, not bypassed).
    expect(
      order!.entries.some((e) => e.reasons.some((r) => r.startsWith('changed together'))),
    ).toBe(true);

    // Hard budget — generous headroom so it never flakes, tight enough to catch
    // an O(n^2) regression in the fusion or co-change cross-reference.
    expect(elapsedMs).toBeLessThan(1000);
  });
});
