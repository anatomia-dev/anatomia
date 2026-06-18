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
    intentCouples: [],
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
      intentCouples: [{ fileA: 'a.ts', fileB: 'hub.ts', coTouchCount: 4 }],
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

  it('names the strongest co-change partner by verified-item count (no percentage)', () => {
    // hub.ts and a.ts share an import edge in hubGraph (a.ts -> hub.ts), so the
    // coupling is structural, not hidden. Provenance is the verified-item count.
    const order = buildReadingOrder(
      baseInput({
        intentCouples: [{ fileA: 'a.ts', fileB: 'hub.ts', coTouchCount: 7 }],
      }),
    )!;
    const hub = order.entries.find((e) => e.file === 'hub.ts')!;
    expect(hub.reasons).toContain('changed together with a.ts in 7 verified items');
    // Never a synthetic percentage.
    expect(hub.reasons.some((r) => /%/.test(r))).toBe(false);
  });

  it('flags hidden coupling when a co-change pair shares no import edge', () => {
    // hub.ts and types.ts both exist in the graph but have NO edge between them
    // (types.ts is imported only by a.ts). That is the relationship structure
    // alone can't see — the differentiated proof-chain signal.
    const order = buildReadingOrder(
      baseInput({
        intentCouples: [{ fileA: 'hub.ts', fileB: 'types.ts', coTouchCount: 3 }],
      }),
    )!;
    const hub = order.entries.find((e) => e.file === 'hub.ts')!;
    expect(
      hub.reasons.some((r) =>
        r.startsWith('changed together with types.ts in 3 verified items') && r.includes('hidden coupling'),
      ),
    ).toBe(true);
  });

  it('co-change reorders files against the path tie-break (affects rank, not just reasons)', () => {
    // a.ts/b.ts/c.ts/d.ts are equal-centrality pure importers of hub.ts; with no
    // co-change they rank by path (a < b < c < d), so d.ts sorts LAST. Give
    // co-change only to d.ts (2 partners, the most) — it must OVERTAKE a.ts. This
    // fails if the co-change score term is removed, so it is not tautological:
    // it proves the signal changes the ORDER, not merely the reason strings.
    const without = buildReadingOrder(baseInput())!;
    const withD = buildReadingOrder(
      baseInput({
        intentCouples: [
          { fileA: 'a.ts', fileB: 'd.ts', coTouchCount: 3 },
          { fileA: 'b.ts', fileB: 'd.ts', coTouchCount: 3 },
        ],
      }),
    )!;
    const rank = (o: typeof without, f: string) => o.entries.findIndex((e) => e.file === f);
    expect(rank(without, 'd.ts')).toBeGreaterThan(rank(without, 'a.ts')); // path tie-break
    expect(rank(withD, 'd.ts')).toBeLessThan(rank(withD, 'a.ts')); // co-change flips it
  });

  it('picks the same top co-change partner regardless of intentCouples order', () => {
    // Two partners tie on coTouchCount. The named partner must be deterministic
    // (lexicographically smaller) independent of input array order — proving the
    // fusion self-determinizes rather than leaking caller iteration order.
    const couples = [
      { fileA: 'a.ts', fileB: 'hub.ts', coTouchCount: 3 },
      { fileA: 'b.ts', fileB: 'hub.ts', coTouchCount: 3 },
    ];
    const reasonFor = (cs: typeof couples) =>
      buildReadingOrder(baseInput({ intentCouples: cs }))!
        .entries.find((e) => e.file === 'hub.ts')!
        .reasons.find((r) => r.startsWith('changed together'));
    expect(reasonFor(couples)).toBe(reasonFor([...couples].reverse()));
    expect(reasonFor(couples)).toContain('changed together with a.ts'); // a < b tie-break
  });

  it('gates out a one-off co-touch (coTouchCount below MIN_COTOUCH)', () => {
    // A single shared work item is not "verified co-change" — it must not
    // produce a co-change reason or contribute to the score.
    const order = buildReadingOrder(
      baseInput({
        intentCouples: [{ fileA: 'a.ts', fileB: 'hub.ts', coTouchCount: 1 }],
      }),
    )!;
    const hub = order.entries.find((e) => e.file === 'hub.ts')!;
    expect(hub.reasons.some((r) => r.startsWith('changed together'))).toBe(false);
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

describe('buildReadingOrder — in-degree floor & blend (TARGET 1/5)', () => {
  /**
   * A real hub (high in-degree) plus a "near-leaf" that inherits centrality:
   * `leaf.ts` is imported by exactly ONE file (`hub.ts`), but that importer is
   * itself the centrality hub — so pure normalized PageRank would float `leaf.ts`
   * into the head. The geometric-mean blend + the near-leaf floor must keep it
   * out of the top decile.
   */
  function hubWithInheritingLeaf() {
    // A dense core where EVERY core file has in-degree 3 (each imported by its
    // three predecessors in a ring), plus one near-leaf imported exactly once —
    // and its single importer is a core node, so the leaf inherits centrality.
    // Because the whole core is head-eligible, the top decile is fully populated
    // by real (in-degree ≥ 3) files and the in-degree-1 leaf must stay out.
    const CORE = 12;
    const core = Array.from({ length: CORE }, (_, i) => `core${i}.ts`);
    const nodes = [...core, 'leaf.ts'];
    const edges: ImportEdge[] = [];
    for (let i = 0; i < CORE; i++) {
      // core[i] is imported by its 3 successors → in-degree 3 for every core node.
      for (let k = 1; k <= 3; k++) {
        edges.push(edge(core[(i + k) % CORE]!, core[i]!));
      }
    }
    edges.push(edge('core0.ts', 'leaf.ts')); // the lone inheriting importer
    const inDegree: Record<string, number> = {};
    for (const n of nodes) inDegree[n] = 0;
    for (const e of edges) inDegree[e.to] = (inDegree[e.to] ?? 0) + 1;
    return { nodes, edges, inDegree, barrelFiles: [], generatedFiles: [] };
  }

  it('keeps an in-degree-1 file out of the top decile despite inherited centrality', () => {
    const graph = hubWithInheritingLeaf();
    const order = buildReadingOrder(baseInput({ graph }))!;
    const topDecile = Math.max(1, Math.ceil(order.entries.length / 10));
    const head = order.entries.slice(0, topDecile).map((e) => e.file);
    // The head is filled by in-degree-3 core files; the near-leaf is barred.
    expect(head.every((f) => f.startsWith('core'))).toBe(true);
    expect(head).not.toContain('leaf.ts');
  });

  it('an in-degree hub outranks a sibling-coupled leaf (geometric-mean blend)', () => {
    const graph = hubWithInheritingLeaf();
    const order = buildReadingOrder(baseInput({ graph }))!;
    const rankOf = (f: string) => order.entries.findIndex((e) => e.file === f);
    // Every core file (in-degree 3) outranks the in-degree-1 leaf.
    const leafRank = rankOf('leaf.ts');
    for (let i = 0; i < 12; i++) {
      expect(rankOf(`core${i}.ts`)).toBeLessThan(leafRank);
    }
  });

  it('cites raw in-degree in the reasons instead of only an opaque centrality', () => {
    const graph = hubWithInheritingLeaf();
    const order = buildReadingOrder(baseInput({ graph }))!;
    const core = order.entries.find((e) => e.file === 'core0.ts')!;
    expect(core.reasons.some((r) => /imported by \d+|core hub/.test(r))).toBe(true);
  });

  it('down-weights a barrel file relative to a real implementation hub of equal in-degree', () => {
    // hub.ts and barrel.ts each imported by 4 files; barrel.ts is a re-export.
    const nodes = ['hub.ts', 'barrel.ts'];
    const edges: ImportEdge[] = [];
    for (let i = 0; i < 4; i++) {
      nodes.push(`a${i}.ts`, `b${i}.ts`);
      edges.push(edge(`a${i}.ts`, 'hub.ts'));
      edges.push(edge(`b${i}.ts`, 'barrel.ts'));
    }
    const inDegree: Record<string, number> = {};
    for (const n of nodes) inDegree[n] = 0;
    for (const e of edges) inDegree[e.to] = (inDegree[e.to] ?? 0) + 1;
    const order = buildReadingOrder(
      baseInput({ graph: { nodes, edges, inDegree, barrelFiles: ['barrel.ts'], generatedFiles: [] } }),
    )!;
    const rankOf = (f: string) => order.entries.findIndex((e) => e.file === f);
    expect(rankOf('hub.ts')).toBeLessThan(rankOf('barrel.ts'));
  });
});

describe('buildReadingOrder — informativeness over ubiquity (Round 2)', () => {
  /**
   * The locking test for the Round-2 objective shift. A ubiquitous UI primitive
   * imported by almost the whole repo (a "stopword") must rank BELOW a
   * high-out-degree orchestrator/entrypoint that is imported far less but
   * composes the system. This pins the IDF ubiquity down-weight + the
   * orchestrator/entrypoint boost + the strengthened UI-atom demotion together:
   * raw in-degree would rank the button first; informativeness must not.
   */
  function ubiquitousPrimitiveVsOrchestrator() {
    // 40 leaf modules. EVERY one imports the UI atom `components/ui/button.tsx`
    // (in-degree ~40, out-degree 0 — the canonical ubiquitous stopword). A
    // smaller cohort routes through `src/server/api/router.ts`, which BOTH is
    // imported by several files AND imports many modules (a real orchestrator /
    // entrypoint). Pure in-degree ranks the button #1; the new ranking must not.
    const N = 40;
    const nodes: string[] = ['components/ui/button.tsx', 'src/server/api/router.ts'];
    const edges: ImportEdge[] = [];
    for (let i = 0; i < N; i++) {
      const leaf = `src/leaf${i}.ts`;
      nodes.push(leaf);
      edges.push(edge(leaf, 'components/ui/button.tsx')); // everyone imports the atom
    }
    // The router is imported by 6 leaves (real fan-in) AND imports 12 modules
    // (high out-degree → orchestrator), so it both consumes and is consumed.
    for (let i = 0; i < 6; i++) edges.push(edge(`src/leaf${i}.ts`, 'src/server/api/router.ts'));
    for (let i = 0; i < 12; i++) {
      const dep = `src/handlers/h${i}.ts`;
      nodes.push(dep);
      edges.push(edge('src/server/api/router.ts', dep));
    }
    // Several genuine domain/data seams (db, schema, services) each imported by
    // a chunk of the repo — informative "read first" files that, with the IDF +
    // domain boost, must all outrank the ubiquitous primitive and bury it past
    // the top-5 (as they do in a real codebase).
    const domain = ['src/db/index.ts', 'src/db/schema.ts', 'src/services/auth.service.ts', 'src/models/user.ts'];
    for (const d of domain) nodes.push(d);
    for (let i = 0; i < N; i++) {
      for (const [j, d] of domain.entries()) {
        if (i % (j + 2) === 0) edges.push(edge(`src/leaf${i}.ts`, d)); // staggered fan-in
      }
    }
    const inDegree: Record<string, number> = {};
    for (const n of nodes) inDegree[n] = 0;
    for (const e of edges) inDegree[e.to] = (inDegree[e.to] ?? 0) + 1;
    return { nodes, edges, inDegree, barrelFiles: [], generatedFiles: [] };
  }

  it('ranks a high-out-degree orchestrator/entrypoint ABOVE a ubiquitous low-out-degree UI primitive', () => {
    const graph = ubiquitousPrimitiveVsOrchestrator();
    // Sanity: the button really is the most-imported file (raw in-degree would
    // rank it first) — the test is meaningful only if that premise holds.
    expect(graph.inDegree['components/ui/button.tsx']).toBeGreaterThan(
      graph.inDegree['src/server/api/router.ts']!,
    );

    const order = buildReadingOrder(baseInput({ graph }))!;
    const rankOf = (f: string) => order.entries.findIndex((e) => e.file === f);
    expect(rankOf('src/server/api/router.ts')).toBeLessThan(rankOf('components/ui/button.tsx'));
    // And the ubiquitous primitive is pushed out of the top-5 entirely.
    expect(rankOf('components/ui/button.tsx')).toBeGreaterThanOrEqual(5);
  });

  it('keeps a domain/data hub (db) ranked above a more-imported UI atom', () => {
    // The button is imported by MORE files than the db module, yet the db hub —
    // a domain/data seam — must outrank it. Pins the domain boost + IDF penalty.
    const nodes = ['components/ui/button.tsx', 'src/db/index.ts'];
    const edges: ImportEdge[] = [];
    for (let i = 0; i < 30; i++) {
      const f = `src/m${i}.ts`;
      nodes.push(f);
      edges.push(edge(f, 'components/ui/button.tsx'));
    }
    for (let i = 0; i < 18; i++) edges.push(edge(`src/m${i}.ts`, 'src/db/index.ts'));
    const inDegree: Record<string, number> = {};
    for (const n of nodes) inDegree[n] = 0;
    for (const e of edges) inDegree[e.to] = (inDegree[e.to] ?? 0) + 1;
    const order = buildReadingOrder(
      baseInput({ graph: { nodes, edges, inDegree, barrelFiles: [], generatedFiles: [] } }),
    )!;
    const rankOf = (f: string) => order.entries.findIndex((e) => e.file === f);
    expect(inDegree['components/ui/button.tsx']).toBeGreaterThan(inDegree['src/db/index.ts']!);
    expect(rankOf('src/db/index.ts')).toBeLessThan(rankOf('components/ui/button.tsx'));
  });

  it('does not down-weight a primitive-named file that actually orchestrates (high out-degree)', () => {
    // `card.ts` is named like a UI primitive but imports 10 modules (out-degree
    // 10) and is imported by 5 — it composes, so the UI-atom crush must NOT fire.
    const nodes = ['components/ui/card.tsx', 'components/ui/badge.tsx'];
    const edges: ImportEdge[] = [];
    for (let i = 0; i < 5; i++) {
      const f = `src/p${i}.ts`;
      nodes.push(f);
      edges.push(edge(f, 'components/ui/card.tsx'));
      edges.push(edge(f, 'components/ui/badge.tsx')); // badge: pure leaf, same in-degree
    }
    for (let i = 0; i < 10; i++) {
      const dep = `components/ui/parts/part${i}.tsx`;
      nodes.push(dep);
      edges.push(edge('components/ui/card.tsx', dep)); // card orchestrates
    }
    const inDegree: Record<string, number> = {};
    for (const n of nodes) inDegree[n] = 0;
    for (const e of edges) inDegree[e.to] = (inDegree[e.to] ?? 0) + 1;
    const order = buildReadingOrder(
      baseInput({ graph: { nodes, edges, inDegree, barrelFiles: [], generatedFiles: [] } }),
    )!;
    const rankOf = (f: string) => order.entries.findIndex((e) => e.file === f);
    // Same in-degree, but card orchestrates (out-degree 10) while badge is a
    // pure leaf — the orchestrator-spared card must outrank the crushed badge.
    expect(rankOf('components/ui/card.tsx')).toBeLessThan(rankOf('components/ui/badge.tsx'));
  });
});

describe('buildReadingOrder — coverage caveat (TARGET 2)', () => {
  it('attaches a caveat when the graph covers a minority of source files', () => {
    const order = buildReadingOrder(
      baseInput({ totalSourceFiles: 1000, primaryLanguageIsGraphLanguage: true }),
    )!;
    // hubGraph has 6 nodes; 6/1000 < 30% → caveat present.
    expect(order.coverageNote).toMatch(/TS\/JS import subgraph only/);
  });

  it('attaches a caveat when the primary language is not the graph language', () => {
    const order = buildReadingOrder(
      baseInput({ totalSourceFiles: 6, primaryLanguageIsGraphLanguage: false }),
    )!;
    expect(order.coverageNote).toMatch(/TS\/JS import subgraph only/);
  });

  it('leaves coverageNote null when coverage is faithful', () => {
    const order = buildReadingOrder(
      baseInput({ totalSourceFiles: 6, primaryLanguageIsGraphLanguage: true }),
    )!;
    expect(order.coverageNote).toBeNull();
  });

  it('attaches a caveat when the graph was SAMPLED even if coverage looks high', () => {
    // The honesty hole: a mid-size repo (≈750–2500 files) covers >30% with the
    // 750-cap, so the coverage ratio alone stays silent. graphSampled must still
    // force a caveat so a partial ranking is never presented as whole-repo.
    const order = buildReadingOrder(
      baseInput({ totalSourceFiles: 2400, primaryLanguageIsGraphLanguage: true, graphSampled: true }),
    )!;
    expect(order.coverageNote).toMatch(/sampled subset of the repo/);
  });

  it('frames the polyglot caveat by LANGUAGE, never a misleading percentage', () => {
    // A polyglot repo whose JS island happens to be ~100% of the graph must not
    // read "subgraph only (~100%)" — that implies whole-repo coverage. The caveat
    // names the language gap instead, and carries no percentage.
    const order = buildReadingOrder(
      baseInput({ totalSourceFiles: 6, primaryLanguageIsGraphLanguage: false }),
    )!;
    expect(order.coverageNote).toBe(
      "ranking covers the TS/JS import subgraph only, not the repo's primary language",
    );
    expect(order.coverageNote).not.toMatch(/%/);
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
