/**
 * Init integration — the import graph is written day one.
 *
 * The AC2b precondition: a fresh `ana init` must persist a non-empty
 * `.ana/state/code-graph.json` so the import blast-radius layer works on the
 * very first pipeline cycle, before any history exists. This drives the built
 * CLI end-to-end (init → atomic swap) and asserts the graph survives the swap
 * into the live `.ana/state` dir — the "don't assume day-1 is day-1" check the
 * scope demands.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const cliPath = path.join(__dirname, '..', '..', '..', 'dist', 'index.js');

/**
 * Scaffold a minimal, scannable git project whose source files import one
 * another, so the import graph has at least one resolvable edge (and therefore
 * non-empty nodes).
 */
async function setupProject(dir: string): Promise<void> {
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'graph-init-fixture',
      version: '1.0.0',
      devDependencies: { vitest: '2.0.0', typescript: '5.7.0' },
      scripts: { build: 'tsc', test: 'vitest run', lint: 'eslint .' },
    }),
  );
  await fs.writeFile(path.join(dir, 'tsconfig.json'), '{}');
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  // a.ts imports b.ts — one in-repo edge → a non-empty graph.
  await fs.writeFile(path.join(dir, 'src', 'a.ts'), "import { b } from './b.js';\nexport const a = b + 1;\n");
  await fs.writeFile(path.join(dir, 'src', 'b.ts'), 'export const b = 1;\n');
  await fs.writeFile(path.join(dir, '.gitignore'), 'node_modules\n');
  await execFileAsync('git', ['init'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  await execFileAsync('git', ['add', '-A'], { cwd: dir });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: dir });
}

describe('ana init — import graph written day one', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-graph-init-'));
    await setupProject(tmpDir);
    await execFileAsync('node', [cliPath, 'init', '--force', '--platforms', 'claude'], { cwd: tmpDir });
  }, 120_000);

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // @ana A028
  it('writes a non-empty code-graph.json into the live .ana/state after the atomic swap', async () => {
    const graphPath = path.join(tmpDir, '.ana', 'state', 'code-graph.json');

    const raw = await fs.readFile(graphPath, 'utf-8');
    const graph = JSON.parse(raw);

    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(Array.isArray(graph.edges)).toBe(true);
  });

  it('records the in-repo import edge in the persisted graph', async () => {
    const graph = JSON.parse(
      await fs.readFile(path.join(tmpDir, '.ana', 'state', 'code-graph.json'), 'utf-8'),
    );

    const edge = graph.edges.find(
      (e: { from: string; to: string }) => e.from.endsWith('src/a.ts') && e.to.endsWith('src/b.ts'),
    );
    expect(edge).toBeDefined();
  });
});
