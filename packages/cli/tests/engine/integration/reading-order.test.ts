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

  /** Write a proof chain into the temp project's `.ana/`. */
  async function writeProofChain(entries: unknown[]): Promise<void> {
    await mkdir(join(tempDir, '.ana'), { recursive: true });
    await writeFile(
      join(tempDir, '.ana', 'proof_chain.json'),
      JSON.stringify({ schema: 1, entries }, null, 2),
    );
  }

  it('fuses proof-derived co-change end-to-end through scanProject (the third signal fires)', async () => {
    // This is the path that was NEVER exercised end-to-end: the live scan used
    // to pass an empty co-change list. a.ts and b.ts both import hub.ts but NOT
    // each other; a proof chain co-touches them across 3 verified work items.
    // The fusion must surface that as a co-change reason — and as HIDDEN coupling
    // (they share no import edge), the signal structure alone can't see.
    await createHubProject();
    await writeProofChain([
      { slug: 'w1', modules_touched: ['src/a.ts', 'src/b.ts'], findings: [], rejection_cycles: 0 },
      { slug: 'w2', modules_touched: ['src/a.ts', 'src/b.ts'], findings: [], rejection_cycles: 0 },
      { slug: 'w3', modules_touched: ['src/a.ts', 'src/b.ts'], findings: [], rejection_cycles: 0 },
    ]);

    const result = await scanProject(tempDir, { depth: 'deep' });
    expect(result.readingOrder).not.toBeNull();
    const order = result.readingOrder!;

    const aEntry = order.entries.find((e) => e.file === 'src/a.ts');
    expect(aEntry).toBeDefined();
    // Honest provenance: verified-item count, never a percentage; hidden coupling
    // because a.ts and b.ts share no direct import edge.
    expect(
      aEntry!.reasons.some(
        (r) =>
          r.startsWith('changed together with b.ts in 3 verified items') &&
          r.includes('hidden coupling'),
      ),
    ).toBe(true);
    expect(aEntry!.reasons.some((r) => /%/.test(r))).toBe(false);
    // The schema field reserved for git co-change stays null — co-change is
    // threaded directly, not stored as a fabricated percentage row.
    expect(result.gitIntelligence?.coChangeCoupling).toBeNull();
  });

  it('changes the file ORDER end-to-end, not just the reasons', async () => {
    // Before/after on identical source. a/b/c/d are equal-centrality importers of
    // hub; with no proof chain they rank by path, so src/d.ts sorts LAST. A chain
    // that co-touches src/d.ts with both src/a.ts and src/b.ts gives d.ts the most
    // co-change partners — it must OVERTAKE src/a.ts. This proves the signal moves
    // the order through the real scan, not merely that reason strings differ.
    await createHubProject();
    const without = await scanProject(tempDir, { depth: 'deep' });

    await writeProofChain([
      { slug: 'w1', modules_touched: ['src/d.ts', 'src/a.ts'], findings: [], rejection_cycles: 0 },
      { slug: 'w2', modules_touched: ['src/d.ts', 'src/a.ts'], findings: [], rejection_cycles: 0 },
      { slug: 'w3', modules_touched: ['src/d.ts', 'src/a.ts'], findings: [], rejection_cycles: 0 },
      { slug: 'w4', modules_touched: ['src/d.ts', 'src/b.ts'], findings: [], rejection_cycles: 0 },
      { slug: 'w5', modules_touched: ['src/d.ts', 'src/b.ts'], findings: [], rejection_cycles: 0 },
      { slug: 'w6', modules_touched: ['src/d.ts', 'src/b.ts'], findings: [], rejection_cycles: 0 },
    ]);
    const withCoChange = await scanProject(tempDir, { depth: 'deep' });

    const rank = (o: NonNullable<typeof without.readingOrder>, f: string) =>
      o.entries.findIndex((e) => e.file === f);
    const wo = without.readingOrder!;
    const wc = withCoChange.readingOrder!;

    expect(rank(wo, 'src/d.ts')).toBeGreaterThan(rank(wo, 'src/a.ts')); // path tie-break: d last
    expect(rank(wc, 'src/d.ts')).toBeLessThan(rank(wc, 'src/a.ts')); // co-change flips d ahead
  });

  it('stays null-safe on a degenerate proof chain (no co-change, no crash)', async () => {
    // A chain too thin to clear the >=3-touch gate yields no proof history, so
    // co-change simply does not fire — the reading order is still populated from
    // centrality, and nothing throws.
    await createHubProject();
    await writeProofChain([
      { slug: 'only', modules_touched: ['src/a.ts'], findings: [], rejection_cycles: 0 },
    ]);

    const result = await scanProject(tempDir, { depth: 'deep' });
    expect(result.readingOrder).not.toBeNull();
    const order = result.readingOrder!;
    expect(order.entries.length).toBeGreaterThan(0);
    expect(order.entries.some((e) => e.reasons.some((r) => r.startsWith('changed together')))).toBe(false);
  });
});
