/**
 * Phase 3 — proof co-change engine (`computeCoChange`).
 *
 * Pure-function tests: gates (MIN_TOUCHES / MIN_COTOUCH), the oversized-item
 * pairing exclusion, same-stem test-partner suppression, the
 * hidden/imports/unknown trichotomy (with a graph, without a graph, and with a
 * partner that is off-graph), determinism, dedup-within-item, and legacy
 * entries lacking `modules_touched`. The matcher is the real `fileMatches`
 * exported from proofSummary — proving the engine reuses it, not a second one.
 */

import { describe, it, expect } from 'vitest';
import {
  computeCoChange,
  MIN_TOUCHES,
  MIN_COTOUCH,
  OVERSIZED_ITEM_CAP,
  type CoChangeEntry,
} from '../../../src/engine/analyzers/proof-history/index.js';
import { fileMatches } from '../../../src/utils/proofSummary.js';
import type { CodeGraph } from '../../../src/engine/analyzers/graph/buildGraph.js';

/** Build a proof entry with a slug and a touched-file list. */
function entry(slug: string, modules: string[] | undefined): CoChangeEntry {
  return modules === undefined ? { slug } : { slug, modules_touched: modules };
}

/** Build a minimal CodeGraph from node list + directed edges. */
function graph(nodes: string[], edges: Array<[string, string]>): CodeGraph {
  return {
    generated: '2026-06-18T00:00:00Z',
    nodes: [...nodes].sort(),
    edges: edges.map(([from, to]) => ({ from, to, names: [] })),
    filesAnalyzed: nodes.length,
    unresolved: 0,
    inDegree: {},
    barrelFiles: [],
    generatedFiles: [],
  };
}

const QUERY = 'src/a.ts';

describe('computeCoChange — gates', () => {
  it('returns no partners when nothing touches the query', () => {
    const result = computeCoChange([entry('s1', ['src/x.ts', 'src/y.ts'])], QUERY, null, fileMatches);
    expect(result.partners).toEqual([]);
    expect(result.total).toBe(0);
  });

  // @ana A019
  it('excludes a partner when the query is under the MIN_TOUCHES gate', () => {
    // a.ts and b.ts co-occur, but the query (a.ts) is touched only twice (< 3).
    const entries = [
      entry('s1', [QUERY, 'src/b.ts']),
      entry('s2', [QUERY, 'src/b.ts']),
      // b.ts gets a third touch elsewhere so only the QUERY is under-gated.
      entry('s3', ['src/b.ts', 'src/c.ts']),
      entry('s4', ['src/b.ts', 'src/c.ts']),
    ];
    const result = computeCoChange(entries, QUERY, null, fileMatches);
    expect(result.total).toBe(0);
    expect(result.partners).toEqual([]);
  });

  it('excludes a partner that is itself under the MIN_TOUCHES gate', () => {
    // query clears the gate; partner b.ts appears only twice.
    const entries = [
      entry('s1', [QUERY, 'src/b.ts']),
      entry('s2', [QUERY, 'src/b.ts']),
      entry('s3', [QUERY, 'src/z.ts']),
    ];
    const result = computeCoChange(entries, QUERY, null, fileMatches);
    expect(result.partners.find((p) => p.file === 'src/b.ts')).toBeUndefined();
  });

  // @ana A020
  it('requires MIN_COTOUCH shared items and reports the count', () => {
    // Both files clear MIN_TOUCHES; they co-occur in exactly 2 items (== gate).
    const entries = [
      entry('s1', [QUERY, 'src/b.ts']),
      entry('s2', [QUERY, 'src/b.ts']),
      entry('s3', [QUERY, 'src/lonely.ts']), // query 3rd touch; no shared partner here
      entry('s4', ['src/b.ts', 'src/other.ts']), // b.ts 3rd touch; not shared with query
    ];
    const result = computeCoChange(entries, QUERY, null, fileMatches);
    const b = result.partners.find((p) => p.file === 'src/b.ts');
    expect(b).toBeDefined();
    expect(b?.coTouchCount).toBe(2);
    expect(b?.coTouchCount).toBeGreaterThan(1);
    expect(MIN_COTOUCH).toBe(2);
    expect(MIN_TOUCHES).toBe(3);
  });

  it('drops a couple that shares only one item even when both clear MIN_TOUCHES', () => {
    const entries = [
      entry('s1', [QUERY, 'src/b.ts']), // only shared item
      entry('s2', [QUERY, 'src/p.ts']),
      entry('s3', [QUERY, 'src/q.ts']),
      entry('s4', ['src/b.ts', 'src/r.ts']),
      entry('s5', ['src/b.ts', 'src/s.ts']),
    ];
    const result = computeCoChange(entries, QUERY, null, fileMatches);
    expect(result.partners.find((p) => p.file === 'src/b.ts')).toBeUndefined();
  });
});

describe('computeCoChange — oversized-item pairing exclusion', () => {
  // @ana A021
  it('a single mega-refactor cannot manufacture a co-change pair by itself', () => {
    // One 110-file item touches both QUERY and partner. Both clear MIN_TOUCHES
    // via small items, but their ONLY shared item is the oversized one — so the
    // couple must not survive (pairing skips oversized items).
    const big = Array.from({ length: 110 }, (_, i) => `src/big-${i}.ts`);
    big[0] = QUERY;
    big[1] = 'src/b.ts';
    expect(big.length).toBeGreaterThan(OVERSIZED_ITEM_CAP);

    const entries = [
      entry('mega', big),
      // small items to clear MIN_TOUCHES for both, with NO further co-occurrence
      entry('q2', [QUERY, 'src/qx.ts']),
      entry('q3', [QUERY, 'src/qy.ts']),
      entry('b2', ['src/b.ts', 'src/bx.ts']),
      entry('b3', ['src/b.ts', 'src/by.ts']),
    ];
    const result = computeCoChange(entries, QUERY, null, fileMatches);
    expect(result.partners.find((p) => p.file === 'src/b.ts')).toBeUndefined();
    expect(result.total).toBe(0);
  });

  it('counts touches from oversized items even though pairing skips them', () => {
    // The query appears in a big item plus two small co-occurring items with a
    // normal partner; the couple survives on the two small shared items.
    const big = Array.from({ length: 50 }, (_, i) => `src/m-${i}.ts`);
    big[0] = QUERY;
    const entries = [
      entry('mega', big),
      entry('s1', [QUERY, 'src/b.ts']),
      entry('s2', [QUERY, 'src/b.ts']),
      entry('s3', ['src/b.ts', 'src/z.ts']), // b.ts third touch
    ];
    const result = computeCoChange(entries, QUERY, null, fileMatches);
    const b = result.partners.find((p) => p.file === 'src/b.ts');
    expect(b?.coTouchCount).toBe(2);
  });
});

describe('computeCoChange — same-stem test-partner suppression', () => {
  // @ana A014
  it('suppresses the query\'s own test file and sets the flag', () => {
    const entries = [
      entry('s1', [QUERY, 'src/a.test.ts']),
      entry('s2', [QUERY, 'src/a.test.ts']),
      entry('s3', [QUERY, 'src/a.test.ts']),
    ];
    const result = computeCoChange(entries, QUERY, null, fileMatches);
    expect(result.suppressedTestPartner).toBe(true);
    expect(result.partners.find((p) => p.file === 'src/a.test.ts')).toBeUndefined();
  });

  it('suppresses a .spec partner too, and leaves real partners intact', () => {
    const entries = [
      entry('s1', [QUERY, 'src/a.spec.ts', 'src/real.ts']),
      entry('s2', [QUERY, 'src/a.spec.ts', 'src/real.ts']),
      entry('s3', [QUERY, 'src/a.spec.ts', 'src/real.ts']),
    ];
    const result = computeCoChange(entries, QUERY, null, fileMatches);
    expect(result.suppressedTestPartner).toBe(true);
    expect(result.partners.map((p) => p.file)).toContain('src/real.ts');
    expect(result.partners.map((p) => p.file)).not.toContain('src/a.spec.ts');
  });

  it('does NOT suppress a different-stem test file', () => {
    const entries = [
      entry('s1', [QUERY, 'src/other.test.ts']),
      entry('s2', [QUERY, 'src/other.test.ts']),
      entry('s3', [QUERY, 'src/other.test.ts']),
    ];
    const result = computeCoChange(entries, QUERY, null, fileMatches);
    expect(result.suppressedTestPartner).toBe(false);
    expect(result.partners.map((p) => p.file)).toContain('src/other.test.ts');
  });

  it('suppresses a test in a parallel tests/ tree (src↔tests mirror)', () => {
    // Real-repo layout: src/commands/work.ts ↔ tests/commands/work.test.ts.
    const q = 'packages/cli/src/commands/work.ts';
    const testMirror = 'packages/cli/tests/commands/work.test.ts';
    const entries = [
      entry('s1', [q, testMirror, 'packages/cli/src/commands/pr.ts']),
      entry('s2', [q, testMirror, 'packages/cli/src/commands/pr.ts']),
      entry('s3', [q, testMirror, 'packages/cli/src/commands/pr.ts']),
    ];
    const result = computeCoChange(entries, q, null, fileMatches);
    expect(result.suppressedTestPartner).toBe(true);
    expect(result.partners.map((p) => p.file)).not.toContain(testMirror);
    expect(result.partners.map((p) => p.file)).toContain('packages/cli/src/commands/pr.ts');
  });

  it('does NOT suppress a same-stem test from a different module', () => {
    // src/x/index.ts must not suppress src/y/index.test.ts — different modules.
    const q = 'src/x/index.ts';
    const otherModuleTest = 'src/y/index.test.ts';
    const entries = [
      entry('s1', [q, otherModuleTest]),
      entry('s2', [q, otherModuleTest]),
      entry('s3', [q, otherModuleTest]),
    ];
    const result = computeCoChange(entries, q, null, fileMatches);
    expect(result.suppressedTestPartner).toBe(false);
    expect(result.partners.map((p) => p.file)).toContain(otherModuleTest);
  });
});

describe('computeCoChange — hidden/imports/unknown trichotomy', () => {
  const coupled: CoChangeEntry[] = [
    entry('s1', [QUERY, 'src/b.ts']),
    entry('s2', [QUERY, 'src/b.ts']),
    entry('s3', [QUERY, 'src/b.ts']),
  ];

  // @ana A016
  it('flags imports when an edge exists between query and partner', () => {
    const g = graph([QUERY, 'src/b.ts'], [[QUERY, 'src/b.ts']]);
    const result = computeCoChange(coupled, QUERY, g, fileMatches);
    const b = result.partners.find((p) => p.file === 'src/b.ts');
    expect(b?.relation).toBe('imports');
  });

  it('flags hidden when both are graph nodes but share no edge', () => {
    const g = graph([QUERY, 'src/b.ts'], []); // both present, no edge
    const result = computeCoChange(coupled, QUERY, g, fileMatches);
    const b = result.partners.find((p) => p.file === 'src/b.ts');
    expect(b?.relation).toBe('hidden');
  });

  it('flags unknown when the partner is absent from the graph', () => {
    const g = graph([QUERY, 'src/elsewhere.ts'], []); // partner b.ts not a node
    const result = computeCoChange(coupled, QUERY, g, fileMatches);
    const b = result.partners.find((p) => p.file === 'src/b.ts');
    expect(b?.relation).toBe('unknown');
  });

  // @ana A017
  it('flags every partner unknown when there is no graph at all', () => {
    const result = computeCoChange(coupled, QUERY, null, fileMatches);
    expect(result.partners[0]?.relation).toBe('unknown');
    expect(result.partners.every((p) => p.relation === 'unknown')).toBe(true);
  });

  it('orders hidden partners before imports partners', () => {
    const entries = [
      entry('s1', [QUERY, 'src/hidden.ts', 'src/imported.ts']),
      entry('s2', [QUERY, 'src/hidden.ts', 'src/imported.ts']),
      entry('s3', [QUERY, 'src/hidden.ts', 'src/imported.ts']),
    ];
    const g = graph(
      [QUERY, 'src/hidden.ts', 'src/imported.ts'],
      [[QUERY, 'src/imported.ts']], // edge only to imported.ts
    );
    const result = computeCoChange(entries, QUERY, g, fileMatches);
    expect(result.partners[0]?.file).toBe('src/hidden.ts');
    expect(result.partners[0]?.relation).toBe('hidden');
    expect(result.partners[1]?.relation).toBe('imports');
  });
});

describe('computeCoChange — robustness & determinism', () => {
  it('dedupes a file touched twice within one item', () => {
    const entries = [
      entry('s1', [QUERY, 'src/b.ts', 'src/b.ts']),
      entry('s2', [QUERY, 'src/b.ts']),
      entry('s3', [QUERY, 'src/b.ts']),
    ];
    const result = computeCoChange(entries, QUERY, null, fileMatches);
    expect(result.partners.find((p) => p.file === 'src/b.ts')?.coTouchCount).toBe(3);
  });

  it('skips legacy entries lacking modules_touched', () => {
    const entries = [
      entry('legacy', undefined),
      entry('s1', [QUERY, 'src/b.ts']),
      entry('s2', [QUERY, 'src/b.ts']),
      entry('s3', [QUERY, 'src/b.ts']),
    ];
    const result = computeCoChange(entries, QUERY, null, fileMatches);
    expect(result.partners.find((p) => p.file === 'src/b.ts')?.coTouchCount).toBe(3);
  });

  it('matches a basename query against full repo-relative paths (one matcher)', () => {
    const entries = [
      entry('s1', ['packages/cli/src/a.ts', 'packages/cli/src/b.ts']),
      entry('s2', ['packages/cli/src/a.ts', 'packages/cli/src/b.ts']),
      entry('s3', ['packages/cli/src/a.ts', 'packages/cli/src/b.ts']),
    ];
    const result = computeCoChange(entries, 'a.ts', null, fileMatches);
    expect(result.partners.map((p) => p.file)).toContain('packages/cli/src/b.ts');
  });

  it('is deterministic — repeated calls are byte-identical', () => {
    const entries = [
      entry('a', [QUERY, 'src/x.ts', 'src/y.ts']),
      entry('b', [QUERY, 'src/x.ts', 'src/y.ts']),
      entry('c', [QUERY, 'src/x.ts', 'src/y.ts']),
    ];
    const first = computeCoChange(entries, QUERY, null, fileMatches);
    const second = computeCoChange(entries, QUERY, null, fileMatches);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('carries linking slugs, deterministically sorted', () => {
    const entries = [
      entry('zeta', [QUERY, 'src/b.ts']),
      entry('alpha', [QUERY, 'src/b.ts']),
      entry('mu', [QUERY, 'src/b.ts']),
    ];
    const result = computeCoChange(entries, QUERY, null, fileMatches);
    expect(result.partners[0]?.slugs).toEqual(['alpha', 'mu', 'zeta']);
  });
});
