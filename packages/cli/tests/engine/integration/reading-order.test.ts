/**
 * Slice 3 — reading-order integration through scanProject().
 *
 * Builds a tiny multi-file TS project where one module is the clear import hub,
 * runs a real deep scan, and asserts the fused reading list is populated, the
 * hub ranks at the top, and two deep scans produce byte-identical reading
 * orders (the determinism contract). Surface scans never populate it.
 *
 * Uses the live engine (tree-sitter WASM); lives under tests/engine/integration
 * alongside the other deep-tier integration tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanProject } from '../../../src/engine/scan-engine.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('scanProject() reading order (Slice 3)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `reading-order-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function createFiles(files: Record<string, string>): Promise<void> {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(tempDir, filePath);
      await mkdir(join(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, content);
    }
  }

  /** Four consumers all importing one hub module — a clear centrality hub. */
  async function createHubProject(): Promise<void> {
    await createFiles({
      'package.json': JSON.stringify({ name: 'hub-test', version: '1.0.0', dependencies: { typescript: '^5.0.0' } }),
      'src/hub.ts': 'export const hub = () => 1;\n',
      'src/a.ts': "import { hub } from './hub.js';\nexport const a = () => hub();\n",
      'src/b.ts': "import { hub } from './hub.js';\nexport const b = () => hub();\n",
      'src/c.ts': "import { hub } from './hub.js';\nexport const c = () => hub();\n",
      'src/d.ts': "import { hub } from './hub.js';\nexport const d = () => hub();\n",
    });
  }

  it('populates a fused reading list at deep tier with the hub ranked top', async () => {
    await createHubProject();

    const result = await scanProject(tempDir, { depth: 'deep' });

    expect(result.readingOrder).not.toBeNull();
    const order = result.readingOrder!;
    expect(order.budget).toBe(1000);
    expect(order.personalizedTo).toBeNull(); // no active scope in the temp project
    expect(order.entries.length).toBeGreaterThan(0);
    expect(order.entries[0]!.file).toBe('src/hub.ts');
    // Every entry states its measured centrality basis.
    expect(order.entries[0]!.reasons.some((r) => r.startsWith('import centrality'))).toBe(true);
  });

  it('produces byte-identical reading orders across two deep scans', async () => {
    await createHubProject();

    const first = await scanProject(tempDir, { depth: 'deep' });
    const second = await scanProject(tempDir, { depth: 'deep' });

    // scannedAt differs between runs, but the reading order is a pure function
    // of the (identical) source — it must be byte-for-byte stable.
    expect(JSON.stringify(first.readingOrder)).toBe(JSON.stringify(second.readingOrder));
  });

  it('does not populate the reading order at surface tier (no graph)', async () => {
    await createHubProject();
    const result = await scanProject(tempDir, { depth: 'surface' });
    expect(result.readingOrder).toBeNull();
  });

  it('returns null when the graph is below the edge threshold', async () => {
    // A single isolated file: no in-repo edges, so no meaningful ranking.
    await createFiles({
      'package.json': JSON.stringify({ name: 'lonely', version: '1.0.0' }),
      'src/only.ts': "import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n",
    });
    const result = await scanProject(tempDir, { depth: 'deep' });
    expect(result.readingOrder).toBeNull();
  });
});
