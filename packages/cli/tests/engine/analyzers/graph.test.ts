/**
 * Slice 2 — Import-graph primitive.
 *
 * Covers buildImportGraph(): relative + tsconfig-alias specifiers resolve to
 * in-repo files (edge), external specifiers resolve to nothing (no edge),
 * output is deterministic, resolution is fail-soft per file, and the graph
 * persists to .ana/state/code-graph.json. Inputs are synthetic ParsedAnalysis
 * fixtures so the test is independent of WASM/tree-sitter availability.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { existsSync } from 'node:fs';
import {
  buildImportGraph,
  persistCodeGraph,
} from '../../../src/engine/analyzers/graph/buildGraph.js';
import type { ParsedAnalysis, ParsedFile, ImportInfo } from '../../../src/engine/types/parsed.js';
import type { TsconfigEntry } from '../../../src/engine/types/census.js';

/** Build a ParsedFile with just the fields the graph builder reads. */
function file(filePath: string, imports: Array<Partial<ImportInfo>>): ParsedFile {
  return {
    file: filePath,
    language: 'typescript',
    functions: [],
    classes: [],
    imports: imports.map((i) => ({ module: i.module ?? '', names: i.names ?? [], line: i.line ?? 1 })),
    parseTime: 0,
    parseMethod: 'tree-sitter',
    errors: 0,
  };
}

function analysis(files: ParsedFile[]): ParsedAnalysis {
  return { files, totalParsed: files.length, cacheHits: 0, cacheMisses: 0 };
}

describe('buildImportGraph — resolution', () => {
  it('creates an edge for a relative specifier resolving in-repo', () => {
    const parsed = analysis([
      file('packages/cli/src/engine/scan-engine.ts', [{ module: './census', names: ['buildCensus'] }]),
      file('packages/cli/src/engine/census.ts', []),
    ]);

    const graph = buildImportGraph(parsed, []);

    expect(graph.edges).toEqual([
      {
        from: 'packages/cli/src/engine/scan-engine.ts',
        to: 'packages/cli/src/engine/census.ts',
        names: ['buildCensus'],
      },
    ]);
    expect(graph.nodes).toContain('packages/cli/src/engine/scan-engine.ts');
    expect(graph.nodes).toContain('packages/cli/src/engine/census.ts');
    expect(graph.unresolved).toBe(0);
  });

  it('resolves a relative specifier through a directory index file', () => {
    const parsed = analysis([
      file('src/a.ts', [{ module: './sub' }]),
      file('src/sub/index.ts', []),
    ]);
    const graph = buildImportGraph(parsed, []);
    expect(graph.edges).toEqual([{ from: 'src/a.ts', to: 'src/sub/index.ts', names: [] }]);
  });

  it('rewrites a .js specifier to its .ts source (NodeNext convention)', () => {
    const parsed = analysis([
      file('src/scan-engine.ts', [{ module: './census.js', names: ['buildCensus'] }]),
      file('src/census.ts', []),
    ]);
    const graph = buildImportGraph(parsed, []);
    expect(graph.edges).toEqual([
      { from: 'src/scan-engine.ts', to: 'src/census.ts', names: ['buildCensus'] },
    ]);
  });

  it('relativizes absolute parsed paths against projectRoot for node identity', () => {
    const root = '/abs/repo';
    const parsed = analysis([
      file('/abs/repo/src/a.ts', [{ module: './b.js' }]),
      file('/abs/repo/src/b.ts', []),
    ]);
    const graph = buildImportGraph(parsed, [], root);
    // Nodes/edges are repo-relative, not absolute.
    expect(graph.nodes).toEqual(['src/a.ts', 'src/b.ts']);
    expect(graph.edges).toEqual([{ from: 'src/a.ts', to: 'src/b.ts', names: [] }]);
  });

  it('does NOT create an edge for an external specifier', () => {
    const parsed = analysis([
      file('src/a.ts', [
        { module: 'react' },
        { module: 'node:fs' },
        { module: '@nestjs/common' },
      ]),
    ]);
    const graph = buildImportGraph(parsed, []);
    expect(graph.edges).toHaveLength(0);
    // No in-repo target → every specifier is unresolved, no node added.
    expect(graph.unresolved).toBe(3);
    expect(graph.nodes).toHaveLength(0);
  });

  it('does NOT create an edge for a relative specifier with no in-repo target', () => {
    const parsed = analysis([file('src/a.ts', [{ module: './missing' }])]);
    const graph = buildImportGraph(parsed, []);
    expect(graph.edges).toHaveLength(0);
    expect(graph.unresolved).toBe(1);
  });

  it('resolves a relative import that escapes one level but stays in-repo', () => {
    const parsed = analysis([
      file('src/feature/a.ts', [{ module: '../shared/util' }]),
      file('src/shared/util.ts', []),
    ]);
    const graph = buildImportGraph(parsed, []);
    expect(graph.edges).toEqual([
      { from: 'src/feature/a.ts', to: 'src/shared/util.ts', names: [] },
    ]);
  });

  it('drops a relative import that escapes the repo root (no edge)', () => {
    const parsed = analysis([file('a.ts', [{ module: '../outside' }])]);
    const graph = buildImportGraph(parsed, []);
    expect(graph.edges).toHaveLength(0);
    expect(graph.unresolved).toBe(1);
  });
});

describe('buildImportGraph — tsconfig path aliases', () => {
  const tsconfigs: TsconfigEntry[] = [
    {
      sourceRootPath: '.',
      path: 'tsconfig.json',
      baseUrl: '.',
      paths: { '@/*': ['./src/*'], '@lib/*': ['./src/lib/*'] },
    },
  ];

  it('resolves an aliased specifier to its target file', () => {
    const parsed = analysis([
      file('src/app.ts', [{ module: '@/util/helpers', names: ['help'] }]),
      file('src/util/helpers.ts', []),
    ]);
    const graph = buildImportGraph(parsed, tsconfigs);
    expect(graph.edges).toEqual([
      { from: 'src/app.ts', to: 'src/util/helpers.ts', names: ['help'] },
    ]);
  });

  it('prefers the most specific alias prefix', () => {
    const parsed = analysis([
      file('src/app.ts', [{ module: '@lib/math' }]),
      file('src/lib/math.ts', []),
    ]);
    const graph = buildImportGraph(parsed, tsconfigs);
    expect(graph.edges).toEqual([{ from: 'src/app.ts', to: 'src/lib/math.ts', names: [] }]);
  });

  it('does NOT create an edge when an aliased target is missing in-repo', () => {
    const parsed = analysis([file('src/app.ts', [{ module: '@/nope' }])]);
    const graph = buildImportGraph(parsed, tsconfigs);
    expect(graph.edges).toHaveLength(0);
    expect(graph.unresolved).toBe(1);
  });
});

describe('buildImportGraph — determinism & shape', () => {
  it('emits sorted nodes and edges, and is byte-identical across runs', () => {
    const parsed = analysis([
      file('src/z.ts', [{ module: './a' }, { module: './m' }]),
      file('src/a.ts', []),
      file('src/m.ts', [{ module: './a' }]),
    ]);

    const g1 = buildImportGraph(parsed, []);
    const g2 = buildImportGraph(parsed, []);

    // Edges sorted by (from, to).
    expect(g1.edges.map((e) => `${e.from}->${e.to}`)).toEqual([
      'src/m.ts->src/a.ts',
      'src/z.ts->src/a.ts',
      'src/z.ts->src/m.ts',
    ]);
    // Nodes sorted.
    expect(g1.nodes).toEqual([...g1.nodes].sort());
    // Byte-identical modulo the generated timestamp.
    const strip = (g: { generated: string }) => ({ ...g, generated: '' });
    expect(JSON.stringify(strip(g1))).toBe(JSON.stringify(strip(g2)));
  });

  it('dedupes repeated edges and merges (sorted) names', () => {
    const parsed = analysis([
      file('src/a.ts', [
        { module: './b', names: ['Two'] },
        { module: './b', names: ['One'] },
      ]),
      file('src/b.ts', []),
    ]);
    const graph = buildImportGraph(parsed, []);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.names).toEqual(['One', 'Two']);
  });

  it('drops self-edges', () => {
    const parsed = analysis([file('src/a.ts', [{ module: './a' }])]);
    const graph = buildImportGraph(parsed, []);
    expect(graph.edges).toHaveLength(0);
  });

  it('is fail-soft: an empty parse yields an empty graph', () => {
    const graph = buildImportGraph(analysis([]), []);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.filesAnalyzed).toBe(0);
    expect(graph.unresolved).toBe(0);
  });
});

describe('persistCodeGraph', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'code-graph-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('writes code-graph.json into the given state dir with the graph contents', async () => {
    const parsed = analysis([
      file('src/a.ts', [{ module: './b', names: ['x'] }]),
      file('src/b.ts', []),
    ]);
    const graph = buildImportGraph(parsed, []);
    const stateDir = path.join(tmp, '.ana', 'state');
    await persistCodeGraph(stateDir, graph);

    const out = path.join(stateDir, 'code-graph.json');
    expect(existsSync(out)).toBe(true);
    const written = JSON.parse(await fs.readFile(out, 'utf-8'));
    expect(written.edges).toEqual([{ from: 'src/a.ts', to: 'src/b.ts', names: ['x'] }]);
    expect(written.nodes).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('is fail-soft when the target is unwritable (no throw)', async () => {
    const graph = buildImportGraph(analysis([]), []);
    // Point at a path whose parent is a file, not a directory — mkdir fails.
    const filePath = path.join(tmp, 'not-a-dir');
    await fs.writeFile(filePath, 'x', 'utf-8');
    await expect(persistCodeGraph(path.join(filePath, 'state'), graph)).resolves.toBeUndefined();
  });

  it('re-persisting overwrites idempotently (byte-identical modulo timestamp)', async () => {
    // Re-init persists the graph again into the (swapped) state dir. Persisting
    // the same graph twice must produce byte-identical content except for the
    // `generated` timestamp — no accumulation, no stale residue.
    const parsed = analysis([
      file('src/a.ts', [{ module: './b', names: ['x'] }]),
      file('src/b.ts', []),
    ]);
    const graph = buildImportGraph(parsed, []);
    const stateDir = path.join(tmp, '.ana', 'state');

    await persistCodeGraph(stateDir, graph);
    const first = JSON.parse(await fs.readFile(path.join(stateDir, 'code-graph.json'), 'utf-8'));
    await persistCodeGraph(stateDir, graph);
    const second = JSON.parse(await fs.readFile(path.join(stateDir, 'code-graph.json'), 'utf-8'));

    const strip = (g: { generated: string }) => ({ ...g, generated: '' });
    expect(JSON.stringify(strip(first))).toBe(JSON.stringify(strip(second)));
    expect(second.nodes).toEqual(['src/a.ts', 'src/b.ts']);
  });
});
