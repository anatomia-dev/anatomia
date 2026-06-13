/**
 * Slice 3 — fused reading list.
 *
 * Covers buildReadingOrder() and resolveImportRelationships():
 *  - hub files rank top-N; a leaf type-only file ranks low,
 *  - two runs are byte-identical (deterministic),
 *  - readingOrder === null below the edge threshold,
 *  - reasons state the measured basis (work items, rework, co-change, centrality),
 *  - in-scope files rank up when a scope is supplied + personalizedTo is set,
 *  - the token budget trims the list (binary search) deterministically,
 *  - hasImportRelationship: true when an edge exists, false when both nodes are
 *    in-graph without an edge, null when a file is missing (low-confidence).
 *
 * Inputs are synthetic graphs/signals — independent of tree-sitter and the repo.
 */

import { describe, it, expect } from 'vitest';
import {
  buildReadingOrder,
  resolveImportRelationships,
  type ReadingOrderInput,
  type CoChangeRow,
} from '../../../src/engine/analyzers/reading-order/index.js';
import type { ImportEdge } from '../../../src/engine/analyzers/graph/buildGraph.js';

function edge(from: string, to: string): ImportEdge {
  return { from, to, names: [] };
}

/** A graph where `hub.ts` is imported by a, b, c, d (a clear centrality hub). */
function hubGraph() {
  return {
    nodes: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'hub.ts', 'types.ts'],
    edges: [
      edge('a.ts', 'hub.ts'),
      edge('b.ts', 'hub.ts'),
      edge('c.ts', 'hub.ts'),
      edge('d.ts', 'hub.ts'),
      edge('a.ts', 'types.ts'), // types.ts: leaf-ish, imported once
    ],
  };
}

function baseInput(overrides: Partial<ReadingOrderInput> = {}): ReadingOrderInput {
  return {
    graph: hubGraph(),
    bugMagnets: [],
    coChange: [],
    scopeFiles: [],
    scopeSlug: null,
    ...overrides,
  };
}

describe('buildReadingOrder — ranking', () => {
  it('ranks the import hub above a barely-imported leaf', () => {
    const order = buildReadingOrder(baseInput());
    expect(order).not.toBeNull();
    const rankOf = (f: string) => order!.entries.findIndex((e) => e.file === f);
    expect(rankOf('hub.ts')).toBeGreaterThanOrEqual(0);
    expect(rankOf('hub.ts')).toBeLessThan(rankOf('types.ts'));
  });

  it('returns null below the edge threshold (too-sparse graph)', () => {
    const sparse = buildReadingOrder(
      baseInput({ graph: { nodes: ['a.ts', 'b.ts'], edges: [edge('a.ts', 'b.ts')] } }),
    );
    expect(sparse).toBeNull();
  });

  it('every entry carries a measured centrality reason', () => {
    const order = buildReadingOrder(baseInput())!;
    for (const entry of order.entries) {
      expect(entry.reasons.some((r) => r.startsWith('import centrality'))).toBe(true);
    }
  });

  it('is deterministic — two runs are byte-identical', () => {
    const input = baseInput({
      bugMagnets: [{ file: 'hub.ts', touchCount: 5, findingsPerTouch: 1.2, rejectionCycles: 3 }],
      coChange: [{ fileA: 'a.ts', fileB: 'hub.ts', coChangePercentage: 80, hasImportRelationship: null }],
    });
    const first = JSON.stringify(buildReadingOrder(input));
    const second = JSON.stringify(buildReadingOrder(input));
    expect(first).toBe(second);
  });
});

describe('buildReadingOrder — fused signals', () => {
  it('surfaces a bug-magnet rate as a measured reason', () => {
    const order = buildReadingOrder(
      baseInput({
        bugMagnets: [{ file: 'hub.ts', touchCount: 5, findingsPerTouch: 1.2, rejectionCycles: 3 }],
      }),
    )!;
    const hub = order.entries.find((e) => e.file === 'hub.ts')!;
    expect(hub.reasons).toContain('5 work items, 3 rework cycles');
  });

  it('singularizes a one-item, one-rework-cycle reason', () => {
    const order = buildReadingOrder(
      baseInput({
        bugMagnets: [{ file: 'hub.ts', touchCount: 1, findingsPerTouch: 1, rejectionCycles: 1 }],
      }),
    )!;
    const hub = order.entries.find((e) => e.file === 'hub.ts')!;
    expect(hub.reasons).toContain('1 work item, 1 rework cycle');
  });

  it('names the strongest co-change partner with its percentage', () => {
    const order = buildReadingOrder(
      baseInput({
        coChange: [{ fileA: 'hub.ts', fileB: 'a.ts', coChangePercentage: 72, hasImportRelationship: true }],
      }),
    )!;
    const hub = order.entries.find((e) => e.file === 'hub.ts')!;
    expect(hub.reasons).toContain('changed together with a.ts (72%)');
  });

  it('ignores bug-magnet rows whose touchCount is null (unmeasured)', () => {
    const order = buildReadingOrder(
      baseInput({
        bugMagnets: [{ file: 'hub.ts', touchCount: null, findingsPerTouch: null, rejectionCycles: null }],
      }),
    )!;
    const hub = order.entries.find((e) => e.file === 'hub.ts')!;
    expect(hub.reasons.some((r) => r.includes('work item'))).toBe(false);
  });
});

describe('buildReadingOrder — scope personalization', () => {
  it('boosts an in-scope file above an equal-centrality peer and records personalizedTo', () => {
    // a.ts and b.ts have identical (base, importer-only) centrality. Unscoped,
    // they tie and break on path (a before b). Scoping b.ts must flip that.
    const unscoped = buildReadingOrder(baseInput())!;
    const rankIn = (o: typeof unscoped, f: string) => o.entries.findIndex((e) => e.file === f);
    expect(rankIn(unscoped, 'a.ts')).toBeLessThan(rankIn(unscoped, 'b.ts'));

    const scoped = buildReadingOrder(
      baseInput({ scopeFiles: ['b.ts'], scopeSlug: 'my-task' }),
    )!;
    expect(scoped.personalizedTo).toBe('my-task');
    const scopedEntry = scoped.entries.find((e) => e.file === 'b.ts')!;
    expect(scopedEntry.reasons).toContain('in active scope');
    // The 1.5x boost flips b.ts ahead of its equal-centrality peer a.ts.
    expect(rankIn(scoped, 'b.ts')).toBeLessThan(rankIn(scoped, 'a.ts'));
  });

  it('leaves personalizedTo null when no scope files are supplied', () => {
    const order = buildReadingOrder(baseInput({ scopeSlug: 'ignored', scopeFiles: [] }))!;
    expect(order.personalizedTo).toBeNull();
  });
});

describe('buildReadingOrder — token budget', () => {
  it('trims entries to fit a tight budget', () => {
    // 20 importers of hub → 21 nodes, well over a tiny budget.
    const nodes = ['hub.ts'];
    const edges: ImportEdge[] = [];
    for (let i = 0; i < 20; i++) {
      const f = `mod${i}.ts`;
      nodes.push(f);
      edges.push(edge(f, 'hub.ts'));
    }
    const full = buildReadingOrder(baseInput({ graph: { nodes, edges }, budget: 100000 }))!;
    const trimmed = buildReadingOrder(baseInput({ graph: { nodes, edges }, budget: 30 }))!;

    expect(trimmed.budget).toBe(30);
    expect(trimmed.entries.length).toBeGreaterThanOrEqual(1);
    expect(trimmed.entries.length).toBeLessThan(full.entries.length);
    // The trimmed list is a prefix of the full ranking (best-first preserved).
    expect(trimmed.entries[0]!.file).toBe(full.entries[0]!.file);
  });
});

describe('buildReadingOrder — degrade-not-crash', () => {
  it('returns null on an empty graph (no nodes, no edges) rather than throwing', () => {
    expect(buildReadingOrder(baseInput({ graph: { nodes: [], edges: [] } }))).toBeNull();
  });

  it('returns null when edges reference only out-of-node-set files (sparse after filtering)', () => {
    // Edges exist but reference ghosts; below the edge threshold is the gate, so
    // a 1-edge graph is null regardless. Proves the threshold guards crashes.
    const order = buildReadingOrder(
      baseInput({ graph: { nodes: ['a.ts'], edges: [edge('a.ts', 'ghost.ts')] } }),
    );
    expect(order).toBeNull();
  });

  it('tolerates a bug-magnet row for a file not in the graph (no entry, no crash)', () => {
    const order = buildReadingOrder(
      baseInput({
        bugMagnets: [{ file: 'not-in-graph.ts', touchCount: 9, findingsPerTouch: 2, rejectionCycles: 1 }],
      }),
    )!;
    // The orphan magnet contributes no entry (entries come from graph nodes).
    expect(order.entries.some((e) => e.file === 'not-in-graph.ts')).toBe(false);
  });
});

describe('resolveImportRelationships', () => {
  const graph = {
    nodes: ['a.ts', 'b.ts', 'c.ts'],
    edges: [edge('a.ts', 'b.ts')],
  };

  it('marks a co-change pair true when they share an import edge (either direction)', () => {
    const rows: CoChangeRow[] = [
      { fileA: 'b.ts', fileB: 'a.ts', coChangePercentage: 50, hasImportRelationship: null },
    ];
    const resolved = resolveImportRelationships(rows, graph);
    expect(resolved[0]!.hasImportRelationship).toBe(true);
  });

  it('marks a co-change pair false when both nodes are in-graph without an edge', () => {
    const rows: CoChangeRow[] = [
      { fileA: 'a.ts', fileB: 'c.ts', coChangePercentage: 50, hasImportRelationship: null },
    ];
    const resolved = resolveImportRelationships(rows, graph);
    expect(resolved[0]!.hasImportRelationship).toBe(false);
  });

  it('emits null (never false) when a file is not in the graph (low-confidence)', () => {
    const rows: CoChangeRow[] = [
      { fileA: 'a.ts', fileB: 'ghost.ts', coChangePercentage: 50, hasImportRelationship: true },
    ];
    const resolved = resolveImportRelationships(rows, graph);
    expect(resolved[0]!.hasImportRelationship).toBeNull();
  });

  it('does not mutate the input rows', () => {
    const rows: CoChangeRow[] = [
      { fileA: 'a.ts', fileB: 'b.ts', coChangePercentage: 50, hasImportRelationship: null },
    ];
    resolveImportRelationships(rows, graph);
    expect(rows[0]!.hasImportRelationship).toBeNull();
  });
});
