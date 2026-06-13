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

    // Full-path ranking: two proof.ts files exist, so we match on full path.
    expect(magnets[0]?.file).toBe('packages/cli/src/commands/work.ts');
    // Verified premise from the build spec: work.ts = 68 touches.
    expect(magnets[0]?.touchCount).toBe(68);

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

  it('matches the build spec verified premises exactly (full-path touch counts)', async () => {
    // These are the spec's independently-confirmed numbers (line 13). Locking
    // them in turns a silent regression in ledger parsing into a red test.
    const result = (await readProofHistory(REPO_ROOT)) as ProofHistory;
    const byFile = new Map(result.bugMagnetFiles.map((m) => [m.file, m]));

    expect(byFile.get('packages/cli/src/commands/work.ts')?.touchCount).toBe(68);
    expect(byFile.get('packages/cli/src/commands/proof.ts')?.touchCount).toBe(42);
    expect(byFile.get('packages/cli/src/utils/proofSummary.ts')?.touchCount).toBe(36);

    // Two `proof.ts` files exist; ranking is by FULL path, not basename. The
    // commands/proof.ts row above must NOT be conflated with src/types/proof.ts.
    const proofTs = result.bugMagnetFiles.filter((m) => m.file.endsWith('/proof.ts'));
    const distinctPaths = new Set(proofTs.map((m) => m.file));
    expect(distinctPaths.has('packages/cli/src/commands/proof.ts')).toBe(true);
    // Each path is its own ranked row (no basename collapse).
    expect(distinctPaths.size).toBe(proofTs.length);
  });

  it('survives the 2 legacy entries that lack modules_touched (?? [] guard)', async () => {
    // 2 of 202 real entries predate modules_touched. The analyzer must skip
    // them via `?? []` and still produce a populated map — never crash, never
    // count a legacy entry as a touch.
    const result = await readProofHistory(REPO_ROOT);
    expect(result).not.toBeNull();
    expect((result as ProofHistory).bugMagnetFiles.length).toBeGreaterThan(0);
    // No file's touch count can exceed the 200 entries that carry the field.
    for (const m of (result as ProofHistory).bugMagnetFiles) {
      expect(m.touchCount).toBeLessThanOrEqual(200);
    }
  });
});
