/**
 * Slice 1 — Proof-history risk map.
 *
 * Covers readProofHistory() against (a) synthetic fixtures written to temp
 * dirs and (b) the real .ana/proof_chain.json shipped in this repo. The real
 * chain is the contract: `src/commands/work.ts` is the #1 risk file, ranking
 * is deterministic, and the analyzer returns null when no chain is present.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { existsSync } from 'node:fs';
import {
  readProofHistory,
  toBugMagnetFiles,
  type ProofHistory,
} from '../../../src/engine/analyzers/proof-history/index.js';
import type { ProofChainEntry } from '../../../src/types/proof.js';

// The live proof chain ships at the worktree root: tests/engine/analyzers ->
// up 5 -> repo root -> .ana/proof_chain.json.
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const REAL_CHAIN = path.join(REPO_ROOT, '.ana', 'proof_chain.json');

/** Build a minimal proof-chain entry with only the fields the analyzer reads. */
function entry(
  slug: string,
  modules: string[] | undefined,
  opts: { findings?: number; rejections?: number } = {},
): Partial<ProofChainEntry> {
  const findings = Array.from({ length: opts.findings ?? 0 }, (_, i) => ({
    id: `${slug}-F${i}`,
    category: 'code' as const,
    summary: 'x',
    file: null,
    anchor: null,
  }));
  return {
    slug,
    ...(modules === undefined ? {} : { modules_touched: modules }),
    rejection_cycles: opts.rejections ?? 0,
    findings,
  };
}

async function writeChain(dir: string, entries: Array<Partial<ProofChainEntry>>): Promise<void> {
  const anaDir = path.join(dir, '.ana');
  await fs.mkdir(anaDir, { recursive: true });
  await fs.writeFile(
    path.join(anaDir, 'proof_chain.json'),
    JSON.stringify({ schema: 1, entries }, null, 2),
    'utf-8',
  );
}

describe('readProofHistory — synthetic fixtures', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'proof-history-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('returns null when there is no proof chain', async () => {
    const result = await readProofHistory(tmp);
    expect(result).toBeNull();
  });

  it('returns null for an empty proof chain', async () => {
    await writeChain(tmp, []);
    const result = await readProofHistory(tmp);
    expect(result).toBeNull();
  });

  it('returns null when no file clears the >=3-touch gate', async () => {
    // hot.ts is touched only twice — below the gate.
    await writeChain(tmp, [
      entry('s1', ['hot.ts'], { findings: 5 }),
      entry('s2', ['hot.ts'], { findings: 5 }),
    ]);
    const result = await readProofHistory(tmp);
    expect(result).toBeNull();
  });

  it('ranks the highest findings-per-touch + rejection file first', async () => {
    // riskier.ts: 3 touches, 30 findings (rate 10), 6 rejections.
    // calmer.ts:  3 touches, 6 findings  (rate 2),  0 rejections.
    // both clear the gate; riskier.ts must rank #1.
    await writeChain(tmp, [
      entry('a', ['riskier.ts'], { findings: 10, rejections: 2 }),
      entry('b', ['riskier.ts'], { findings: 10, rejections: 2 }),
      entry('c', ['riskier.ts'], { findings: 10, rejections: 2 }),
      entry('d', ['calmer.ts'], { findings: 2, rejections: 0 }),
      entry('e', ['calmer.ts'], { findings: 2, rejections: 0 }),
      entry('f', ['calmer.ts'], { findings: 2, rejections: 0 }),
    ]);

    const result = await readProofHistory(tmp);
    expect(result).not.toBeNull();
    const magnets = (result as ProofHistory).bugMagnetFiles;

    expect(magnets[0]?.file).toBe('riskier.ts');
    expect(magnets[0]?.touchCount).toBe(3);
    // 30 findings / 3 touches = 10 per touch.
    expect(magnets[0]?.findingsPerTouch).toBe(10);
    expect(magnets[0]?.rejectionCycles).toBe(6);

    expect(magnets[1]?.file).toBe('calmer.ts');
    expect(magnets[1]?.touchCount).toBe(3);
    // 6 findings / 3 touches = 2 per touch.
    expect(magnets[1]?.findingsPerTouch).toBe(2);
    expect(magnets[1]?.rejectionCycles).toBe(0);
  });

  it('skips legacy entries that lack modules_touched (?? [])', async () => {
    await writeChain(tmp, [
      entry('legacy', undefined, { findings: 99, rejections: 99 }), // no modules_touched
      entry('a', ['file.ts'], { findings: 3 }),
      entry('b', ['file.ts'], { findings: 3 }),
      entry('c', ['file.ts'], { findings: 3 }),
    ]);

    const result = await readProofHistory(tmp);
    expect(result).not.toBeNull();
    const magnets = (result as ProofHistory).bugMagnetFiles;
    // Only file.ts ranks; the legacy entry contributed nothing.
    expect(magnets.map((m) => m.file)).toEqual(['file.ts']);
    expect(magnets[0]?.touchCount).toBe(3);
  });

  it('dedupes a file touched twice within one work item', async () => {
    await writeChain(tmp, [
      entry('a', ['dup.ts', 'dup.ts'], { findings: 2 }),
      entry('b', ['dup.ts'], { findings: 2 }),
      entry('c', ['dup.ts'], { findings: 2 }),
    ]);
    const result = await readProofHistory(tmp);
    const magnet = (result as ProofHistory).bugMagnetFiles.find((m) => m.file === 'dup.ts');
    expect(magnet?.touchCount).toBe(3);
  });

  it('computes intent couples with linking slugs for gated files only', async () => {
    // a.ts and b.ts co-occur in 3 items (both gated). c.ts appears once -> not gated.
    await writeChain(tmp, [
      entry('alpha', ['a.ts', 'b.ts'], { findings: 1 }),
      entry('beta', ['a.ts', 'b.ts'], { findings: 1 }),
      entry('gamma', ['a.ts', 'b.ts', 'c.ts'], { findings: 1 }),
    ]);

    const result = await readProofHistory(tmp);
    const couples = (result as ProofHistory).intentCouples;
    // Only the a.ts/b.ts pair survives (c.ts has 1 touch, under the gate).
    expect(couples).toHaveLength(1);
    expect(couples[0]?.fileA).toBe('a.ts');
    expect(couples[0]?.fileB).toBe('b.ts');
    expect(couples[0]?.coTouchCount).toBe(3);
    expect(couples[0]?.slugs).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('ranks by FULL path with exact counts on a frozen fixture (no basename collapse)', async () => {
    // The "verified premises" the build spec independently confirmed — full-path
    // ranking and exact touch counts — locked against a FROZEN synthetic chain
    // instead of the live ledger, so the numbers never drift. Two `proof.ts`
    // files at different paths must stay distinct rows (the real-repo hazard).
    await writeChain(tmp, [
      entry('s1', ['src/commands/work.ts', 'src/commands/proof.ts', 'src/types/proof.ts'], { findings: 2 }),
      entry('s2', ['src/commands/work.ts', 'src/commands/proof.ts'], { findings: 2 }),
      entry('s3', ['src/commands/work.ts', 'src/commands/proof.ts'], { findings: 2 }),
      entry('s4', ['src/commands/work.ts', 'src/types/proof.ts'], { findings: 2 }),
      entry('s5', ['src/commands/work.ts'], { findings: 2 }),
    ]);

    const result = (await readProofHistory(tmp)) as ProofHistory;
    const byFile = new Map(result.bugMagnetFiles.map((m) => [m.file, m]));

    // Exact, frozen premises: work.ts in 5 items, commands/proof.ts in 3,
    // types/proof.ts in 2 (below the gate → absent).
    expect(byFile.get('src/commands/work.ts')?.touchCount).toBe(5);
    expect(byFile.get('src/commands/proof.ts')?.touchCount).toBe(3);
    expect(byFile.has('src/types/proof.ts')).toBe(false); // 2 touches < gate

    // Two same-basename files: ranked by FULL path, never collapsed to basename.
    const proofTs = result.bugMagnetFiles.filter((m) => m.file.endsWith('/proof.ts'));
    expect(new Set(proofTs.map((m) => m.file)).size).toBe(proofTs.length);
  });

  it('is deterministic — repeated reads are byte-identical', async () => {
    await writeChain(tmp, [
      entry('a', ['x.ts', 'y.ts'], { findings: 4, rejections: 1 }),
      entry('b', ['x.ts', 'y.ts'], { findings: 4, rejections: 1 }),
      entry('c', ['x.ts', 'y.ts'], { findings: 4, rejections: 1 }),
    ]);
    const first = await readProofHistory(tmp);
    const second = await readProofHistory(tmp);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('toBugMagnetFiles keeps proof-chain fields and leaves git-churn fields zeroed', async () => {
    await writeChain(tmp, [
      entry('a', ['z.ts'], { findings: 5, rejections: 1 }),
      entry('b', ['z.ts'], { findings: 5, rejections: 1 }),
      entry('c', ['z.ts'], { findings: 5, rejections: 1 }),
    ]);
    const result = (await readProofHistory(tmp)) as ProofHistory;
    const rows = toBugMagnetFiles(result);
    const row = rows.find((r) => r.file === 'z.ts');
    expect(row).toBeDefined();
    // Proof-chain semantics carried through.
    expect(row?.touchCount).toBe(3);
    expect(row?.findingsPerTouch).toBe(5);
    expect(row?.rejectionCycles).toBe(3);
    // Commit-churn fields are NOT overloaded (CORRECTION #3).
    expect(row?.bugCommitCount).toBe(0);
    expect(row?.totalCommitCount).toBe(0);
    expect(row?.ratio).toBe(0);
  });

  it('returns null on an unparseable proof chain (fail-soft)', async () => {
    const anaDir = path.join(tmp, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(path.join(anaDir, 'proof_chain.json'), '{ not valid json', 'utf-8');
    const result = await readProofHistory(tmp);
    expect(result).toBeNull();
  });

  it('returns null when entries is not an array (malformed shape, degrade not crash)', async () => {
    const anaDir = path.join(tmp, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    // Valid JSON, wrong shape — `entries` is an object, not an array.
    await fs.writeFile(
      path.join(anaDir, 'proof_chain.json'),
      JSON.stringify({ schema: 1, entries: { nope: true } }),
      'utf-8',
    );
    const result = await readProofHistory(tmp);
    expect(result).toBeNull();
  });

  it('tolerates entries with missing findings / rejection_cycles (?? defaults)', async () => {
    // Entries carry modules_touched but neither findings nor rejection_cycles —
    // the analyzer must default both to 0 (rate 0) and still gate/rank, not throw.
    const anaDir = path.join(tmp, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'proof_chain.json'),
      JSON.stringify({
        schema: 1,
        entries: [
          { slug: 'a', modules_touched: ['bare.ts'] },
          { slug: 'b', modules_touched: ['bare.ts'] },
          { slug: 'c', modules_touched: ['bare.ts'] },
        ],
      }),
      'utf-8',
    );
    const result = (await readProofHistory(tmp)) as ProofHistory;
    expect(result).not.toBeNull();
    const bare = result.bugMagnetFiles.find((m) => m.file === 'bare.ts');
    expect(bare?.touchCount).toBe(3);
    expect(bare?.findingsPerTouch).toBe(0);
    expect(bare?.rejectionCycles).toBe(0);
  });
});

describe('readProofHistory — real .ana/proof_chain.json', () => {
  it('ranks src/commands/work.ts #1, deterministically', async () => {
    // The real chain ships in this repo; this is the load-bearing assertion.
    expect(existsSync(REAL_CHAIN)).toBe(true);

    const result = await readProofHistory(REPO_ROOT);
    expect(result).not.toBeNull();
    const magnets = (result as ProofHistory).bugMagnetFiles;

    // work.ts is the documented #1 risk file. Assert the RANK, not an exact
    // touch count: that count climbs every time a work item touches work.ts, so
    // pinning it couples this test to the live, ever-growing ledger. Exact-count
    // premises are locked against a FROZEN fixture below instead.
    expect(magnets[0]?.file).toBe('packages/cli/src/commands/work.ts');
    expect(magnets[0]?.touchCount).toBeGreaterThanOrEqual(3);

    // Every ranked file cleared the >=3-touch gate.
    expect(magnets.every((m) => m.touchCount >= 3)).toBe(true);

    // Deterministic: a second read produces the identical ranking.
    const again = (await readProofHistory(REPO_ROOT)) as ProofHistory;
    expect(again.bugMagnetFiles.map((m) => m.file)).toEqual(magnets.map((m) => m.file));
  });

  it('produces intent couples linking work.ts to its companion files', async () => {
    const result = (await readProofHistory(REPO_ROOT)) as ProofHistory;
    expect(result).not.toBeNull();
    // proofSummary.ts and proof.ts change together with work-related files;
    // assert the couple set is non-empty and carries linking slugs.
    expect(result.intentCouples.length).toBeGreaterThan(0);
    for (const couple of result.intentCouples) {
      expect(couple.fileA < couple.fileB).toBe(true);
      expect(couple.slugs.length).toBe(couple.coTouchCount);
      expect(couple.coTouchCount).toBeGreaterThan(0);
    }
  });

  it('skips legacy entries lacking modules_touched on the real chain (?? [] guard)', async () => {
    // Some early real entries predate modules_touched. The analyzer must skip
    // them via `?? []` and still produce a populated map — never crash, never
    // count a legacy entry as a touch. Count-agnostic: the exact number of legacy
    // entries changes as the ledger grows, so assert the INVARIANT, not a number.
    const raw = JSON.parse(await fs.readFile(REAL_CHAIN, 'utf-8')) as {
      entries: Array<{ modules_touched?: string[] }>;
    };
    const entriesWithModules = raw.entries.filter(
      (e) => Array.isArray(e.modules_touched) && e.modules_touched.length > 0,
    ).length;

    const result = await readProofHistory(REPO_ROOT);
    expect(result).not.toBeNull();
    expect((result as ProofHistory).bugMagnetFiles.length).toBeGreaterThan(0);
    // No file can be touched by more work items than actually carry the field.
    for (const m of (result as ProofHistory).bugMagnetFiles) {
      expect(m.touchCount).toBeGreaterThanOrEqual(3);
      expect(m.touchCount).toBeLessThanOrEqual(entriesWithModules);
    }
  });
});
