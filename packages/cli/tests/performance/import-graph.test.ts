/**
 * Slice 2 — deep-scan import-graph latency gate.
 *
 * The import graph only runs at deep tier over the 750-file sample cap, so the
 * worst realistic input is ~750 files each importing a handful of others.
 * buildImportGraph is a pure, synchronous function; this gate mirrors the
 * `<20s ana-init` performance test in spirit (a hard, mechanical budget) and
 * asserts graph construction over a full 750-file sample stays comfortably
 * sub-second so it never dominates a deep scan.
 */

import { describe, it, expect } from 'vitest';
import { buildImportGraph } from '../../src/engine/analyzers/graph/buildGraph.js';
import type { ParsedAnalysis, ParsedFile } from '../../src/engine/types/parsed.js';

/** Synthesize a parsed analysis of `n` files, each importing a few neighbors. */
function syntheticAnalysis(n: number): ParsedAnalysis {
  const files: ParsedFile[] = [];
  for (let i = 0; i < n; i++) {
    // Each file imports up to 5 lower-indexed siblings (in-repo edges) plus one
    // external package (no edge) — a realistic fan-out.
    const imports = [];
    for (let k = 1; k <= 5 && i - k >= 0; k++) {
      imports.push({ module: `./mod${i - k}`, names: [`Sym${i - k}`], line: k });
    }
    imports.push({ module: 'react', names: ['useState'], line: 99 });
    files.push({
      file: `src/mod${i}.ts`,
      language: 'typescript',
      functions: [],
      classes: [],
      imports,
      parseTime: 0,
      parseMethod: 'tree-sitter',
      errors: 0,
    });
  }
  return { files, totalParsed: n, cacheHits: 0, cacheMisses: 0 };
}

describe('import-graph latency (deep tier, 750-file cap)', () => {
  it('builds the graph over a full 750-file sample in well under 1s', () => {
    const parsed = syntheticAnalysis(750);

    const start = performance.now();
    const graph = buildImportGraph(parsed, []);
    const elapsedMs = performance.now() - start;

    // Sanity: the in-repo edges resolved and the external import was dropped.
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.unresolved).toBe(750); // one external `react` import per file

    // Hard budget — generous headroom so this never flakes, but tight enough
    // to catch an accidental O(n^2) regression in resolution.
    expect(elapsedMs).toBeLessThan(1000);
  });
});
