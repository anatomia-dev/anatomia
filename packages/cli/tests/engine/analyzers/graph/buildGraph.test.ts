import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildImportGraph, persistCodeGraph } from '../../../../src/engine/analyzers/graph/buildGraph.js';
import type { ParsedAnalysis, ParsedFile } from '../../../../src/engine/types/parsed.js';
import type { TsconfigEntry } from '../../../../src/engine/types/census.js';

/** Build a minimal ParsedFile with the given imports. */
function file(
  filePath: string,
  imports: Array<{ module: string; names?: string[] }>,
): ParsedFile {
  return {
    file: filePath,
    language: 'typescript',
    imports: imports.map((imp) => ({ module: imp.module, names: imp.names ?? [], line: 1 })),
    functions: [],
    classes: [],
    decorators: [],
    parseTime: 0,
    parseMethod: 'tree-sitter' as const,
    errors: 0,
  };
}

/** Wrap files into a ParsedAnalysis. */
function analysis(files: ParsedFile[]): ParsedAnalysis {
  return { files, totalParsed: files.length, cacheHits: 0, cacheMisses: 0 };
}

describe('buildImportGraph', () => {
  describe('edge resolution', () => {
    it('resolves a relative specifier to an in-repo file (NodeNext .js → .ts)', () => {
      const parsed = analysis([
        file('src/a.ts', [{ module: './b.js', names: ['thing'] }]),
        file('src/b.ts', []),
      ]);

      const graph = buildImportGraph(parsed, []);

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]).toEqual({ from: 'src/a.ts', to: 'src/b.ts', names: ['thing'] });
      expect(graph.unresolved).toBe(0);
    });

    it('resolves an extension-less relative specifier and a directory index', () => {
      const parsed = analysis([
        file('src/a.ts', [{ module: './b' }, { module: './dir' }]),
        file('src/b.ts', []),
        file('src/dir/index.ts', []),
      ]);

      const graph = buildImportGraph(parsed, []);

      const targets = graph.edges.map((e) => e.to).sort();
      expect(targets).toEqual(['src/b.ts', 'src/dir/index.ts']);
      expect(graph.unresolved).toBe(0);
    });

    it('resolves a tsconfig path alias against its baseUrl', () => {
      const tsconfigs: TsconfigEntry[] = [
        { sourceRootPath: '.', path: 'tsconfig.json', paths: { '@/*': ['./src/*'] }, baseUrl: '.' },
      ];
      const parsed = analysis([
        file('src/a.ts', [{ module: '@/b', names: ['B'] }]),
        file('src/b.ts', []),
      ]);

      const graph = buildImportGraph(parsed, tsconfigs);

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]).toMatchObject({ from: 'src/a.ts', to: 'src/b.ts' });
    });

    it('produces NO edge for a bare/external specifier and counts it unresolved', () => {
      const parsed = analysis([
        file('src/a.ts', [
          { module: 'react' },
          { module: 'node:fs' },
          { module: '@nestjs/common' },
        ]),
      ]);

      const graph = buildImportGraph(parsed, []);

      expect(graph.edges).toHaveLength(0);
      expect(graph.unresolved).toBe(3);
      expect(graph.nodes).toHaveLength(0);
    });

    it('resolves a monorepo workspace-package import to the package entry', () => {
      const workspacePackages = new Map<string, string>([['@scope/lib', 'packages/lib']]);
      const parsed = analysis([
        file('packages/app/src/main.ts', [{ module: '@scope/lib', names: ['helper'] }]),
        file('packages/lib/src/index.ts', []),
      ]);

      const graph = buildImportGraph(parsed, [], '', workspacePackages);

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]).toMatchObject({
        from: 'packages/app/src/main.ts',
        to: 'packages/lib/src/index.ts',
      });
    });

    it('does not record self-edges', () => {
      const parsed = analysis([
        file('src/a.ts', [{ module: './a.js' }]),
      ]);

      const graph = buildImportGraph(parsed, []);

      expect(graph.edges).toHaveLength(0);
    });
  });

  describe('in-degree', () => {
    it('counts distinct importers per target (deduped on from)', () => {
      const parsed = analysis([
        file('src/a.ts', [{ module: './hub.js' }, { module: './hub.js', names: ['x'] }]),
        file('src/b.ts', [{ module: './hub.js' }]),
        file('src/hub.ts', []),
      ]);

      const graph = buildImportGraph(parsed, []);

      // a imports hub twice but counts once; b once → inDegree 2.
      expect(graph.inDegree['src/hub.ts']).toBe(2);
      expect(graph.edges.filter((e) => e.to === 'src/hub.ts')).toHaveLength(2);
    });
  });

  describe('determinism', () => {
    it('emits sorted nodes and edges so two runs are byte-identical (modulo timestamp)', () => {
      const parsed = analysis([
        file('src/z.ts', [{ module: './a.js' }, { module: './m.js' }]),
        file('src/a.ts', []),
        file('src/m.ts', []),
      ]);

      const g1 = buildImportGraph(parsed, []);
      const g2 = buildImportGraph(parsed, []);

      expect(g1.nodes).toEqual([...g1.nodes].sort());
      const edgeKeys = g1.edges.map((e) => `${e.from} ${e.to}`);
      expect(edgeKeys).toEqual([...edgeKeys].sort());

      const strip = (g: typeof g1) => ({ ...g, generated: '' });
      expect(strip(g1)).toEqual(strip(g2));
    });

    it('reports filesAnalyzed as the full parse universe', () => {
      const parsed = analysis([
        file('src/a.ts', [{ module: 'react' }]),
        file('src/b.ts', []),
      ]);

      const graph = buildImportGraph(parsed, []);

      expect(graph.filesAnalyzed).toBe(2);
    });
  });

  describe('projectRoot relativization', () => {
    it('relativizes absolute parsed paths against projectRoot', () => {
      const root = '/repo';
      const parsed = analysis([
        file('/repo/src/a.ts', [{ module: './b.js' }]),
        file('/repo/src/b.ts', []),
      ]);

      const graph = buildImportGraph(parsed, [], root);

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]).toMatchObject({ from: 'src/a.ts', to: 'src/b.ts' });
    });
  });
});

describe('persistCodeGraph', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-persist-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes code-graph.json into the state dir, creating it if absent', async () => {
    const stateDir = path.join(tmpDir, 'state');
    const parsed = analysis([
      file('src/a.ts', [{ module: './b.js' }]),
      file('src/b.ts', []),
    ]);
    const graph = buildImportGraph(parsed, []);

    await persistCodeGraph(stateDir, graph);

    const written = JSON.parse(fs.readFileSync(path.join(stateDir, 'code-graph.json'), 'utf-8'));
    expect(written.edges).toHaveLength(1);
    expect(written.nodes).toContain('src/a.ts');
  });

  it('is fail-soft: never throws even when the target path is invalid', async () => {
    // A file (not a dir) at the parent makes mkdir of a subdir fail.
    const filePath = path.join(tmpDir, 'not-a-dir');
    fs.writeFileSync(filePath, 'x');
    const graph = buildImportGraph(analysis([]), []);

    await expect(persistCodeGraph(path.join(filePath, 'state'), graph)).resolves.toBeUndefined();
  });
});
