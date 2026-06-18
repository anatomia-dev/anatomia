import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readCodeGraph } from '../../../../src/engine/analyzers/graph/readGraph.js';
import type { CodeGraph } from '../../../../src/engine/analyzers/graph/buildGraph.js';

/** Write a code-graph.json under a project root's .ana/state dir. */
function writeGraph(root: string, content: string): void {
  const stateDir = path.join(root, '.ana', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'code-graph.json'), content, 'utf-8');
}

const SAMPLE: CodeGraph = {
  generated: '2026-06-18T16:00:00.000Z',
  nodes: ['src/a.ts', 'src/b.ts'],
  edges: [{ from: 'src/a.ts', to: 'src/b.ts', names: ['thing'] }],
  filesAnalyzed: 2,
  unresolved: 0,
  inDegree: { 'src/b.ts': 1 },
  barrelFiles: [],
  generatedFiles: [],
};

describe('readCodeGraph', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-read-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the typed graph when present and well-formed', () => {
    writeGraph(tmpDir, JSON.stringify(SAMPLE));

    const graph = readCodeGraph(tmpDir);

    expect(graph).not.toBeNull();
    expect(graph?.nodes).toEqual(['src/a.ts', 'src/b.ts']);
    expect(graph?.edges[0]).toEqual({ from: 'src/a.ts', to: 'src/b.ts', names: ['thing'] });
  });

  // @ana A029
  it('returns null (never throws) when the graph file is absent', () => {
    expect(() => readCodeGraph(tmpDir)).not.toThrow();
    expect(readCodeGraph(tmpDir)).toBeNull();
  });

  it('returns null when the file is not valid JSON', () => {
    writeGraph(tmpDir, '{ this is : not json ]');

    expect(() => readCodeGraph(tmpDir)).not.toThrow();
    expect(readCodeGraph(tmpDir)).toBeNull();
  });

  it('returns null when the JSON has the wrong shape (missing arrays)', () => {
    writeGraph(tmpDir, JSON.stringify({ generated: 'x', nodes: 'oops', edges: 5 }));

    expect(readCodeGraph(tmpDir)).toBeNull();
  });

  it('returns null for a non-object top-level value', () => {
    writeGraph(tmpDir, JSON.stringify(['not', 'a', 'graph']));
    expect(readCodeGraph(tmpDir)).toBeNull();

    writeGraph(tmpDir, JSON.stringify(null));
    expect(readCodeGraph(tmpDir)).toBeNull();
  });

  it('accepts a forward-compatible graph carrying extra fields', () => {
    writeGraph(tmpDir, JSON.stringify({ ...SAMPLE, futureField: { anything: true } }));

    const graph = readCodeGraph(tmpDir);

    expect(graph).not.toBeNull();
    expect(graph?.nodes).toHaveLength(2);
  });
});
