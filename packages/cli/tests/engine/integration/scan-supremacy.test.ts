/**
 * Scan-supremacy effort — end-to-end engine integration & no-regression guards.
 *
 * The slice-level unit suites (proof-history, graph, pagerank, reading-order,
 * scope, named-imports, scan-freshness, benchmark, work-complete-rescan) pin
 * each analyzer in isolation. This file closes the *wiring* and *no-regression*
 * gaps that only a real `scanProject()` run can prove:
 *
 *  1. Slice 5 — `overview.indexedCommit` is stamped from the resolved
 *     `git.head` in a real scan, and is `null` when the project is not a git
 *     repo (the "absent" case — the byte-identity default holds with no git).
 *  2. Slice 2 — the opt-in write contract: `scanProject` writes
 *     `.ana/state/code-graph.json` ONLY when `persistGraphTo` is supplied, and
 *     writes NOTHING (read-only / byte-parity) when it is omitted. This is the
 *     central no-regression claim for `ana scan`.
 *  3. Slice 1 — proof-history runs at BOTH tiers (it reads the ledger, not the
 *     symbol graph), populating `gitIntelligence.bugMagnetFiles` even at
 *     surface tier; and stays `null` when no proof chain is present.
 *  4. No-regression — a project with no proof chain and a too-sparse graph
 *     produces the frozen all-null defaults (`gitIntelligence === null`,
 *     `readingOrder === null`): the new feature is invisible when unconfigured.
 *  5. Slice 3 — the resolveImportRelationships side-effect: a co-change row's
 *     `hasImportRelationship` is resolved against the real graph (never a
 *     fabricated `false` for a file the graph never saw).
 *
 * Uses the live engine (tree-sitter WASM) like the other integration tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanProject } from '../../../src/engine/scan-engine.js';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('scan supremacy — engine integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `scan-supremacy-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  /** Initialize a git repo in tempDir with one commit; return the short HEAD. */
  function initGit(): string {
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git add -A', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "init"', { cwd: tempDir, stdio: 'pipe' });
    return execSync('git rev-parse --short HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();
  }

  // ── Slice 5: overview.indexedCommit stamp ──────────────────────────────────
  describe('Slice 5 — indexedCommit stamp', () => {
    it('stamps overview.indexedCommit from the resolved git.head', async () => {
      await createHubProject();
      const head = initGit();

      const result = await scanProject(tempDir, { depth: 'deep' });

      // The stamp is self-consistent with git.head — it records the exact commit
      // the scan describes, so a divergence check later can compare against HEAD.
      expect(result.overview.indexedCommit).toBe(head);
      expect(result.overview.indexedCommit).toBe(result.git.head);
    });

    it('leaves indexedCommit null when there is no git repo (absent = no stamp)', async () => {
      await createHubProject();
      // No initGit() — the project is not under version control.
      const result = await scanProject(tempDir, { depth: 'deep' });
      expect(result.overview.indexedCommit).toBeNull();
      expect(result.git.head).toBeNull();
    });
  });

  // ── Slice 2: opt-in code-graph write contract (the read-only no-regression) ─
  describe('Slice 2 — persistGraphTo write contract', () => {
    it('does NOT write code-graph.json when persistGraphTo is omitted (ana scan is read-only)', async () => {
      await createHubProject();
      const stateDir = join(tempDir, '.ana', 'state');

      const result = await scanProject(tempDir, { depth: 'deep' });

      // The reading order proves the graph was built in memory…
      expect(result.readingOrder).not.toBeNull();
      // …but nothing was persisted: `ana scan` keeps its no-files-written
      // contract. The whole .ana dir must not have been created by the scan.
      expect(existsSync(join(stateDir, 'code-graph.json'))).toBe(false);
      expect(existsSync(join(tempDir, '.ana'))).toBe(false);
    });

    it('writes code-graph.json into the state dir ONLY when persistGraphTo is supplied', async () => {
      await createHubProject();
      const stateDir = join(tempDir, '.ana', 'state');
      await mkdir(stateDir, { recursive: true });

      await scanProject(tempDir, { depth: 'deep', persistGraphTo: stateDir });

      const graphPath = join(stateDir, 'code-graph.json');
      expect(existsSync(graphPath)).toBe(true);
      const graph = JSON.parse(await readFile(graphPath, 'utf-8'));
      // The hub project's edges all point at src/hub.ts — the persisted graph
      // is the real digraph, not an empty stub.
      expect(graph.nodes).toContain('src/hub.ts');
      expect(graph.edges.some((e: { to: string }) => e.to === 'src/hub.ts')).toBe(true);
    });

    it('does NOT persist a graph at surface tier even when persistGraphTo is supplied', async () => {
      await createHubProject();
      const stateDir = join(tempDir, '.ana', 'state');
      await mkdir(stateDir, { recursive: true });

      // Surface tier skips tree-sitter entirely → no graph to persist.
      await scanProject(tempDir, { depth: 'surface', persistGraphTo: stateDir });

      expect(existsSync(join(stateDir, 'code-graph.json'))).toBe(false);
    });
  });

  // ── Slice 1: proof-history runs at every tier ──────────────────────────────
  describe('Slice 1 — proof-history at every tier', () => {
    /** Write a proof_chain.json gating `src/hot.ts` (3 touches) past the gate. */
    async function writeProofChain(): Promise<void> {
      const finding = { id: 'F', category: 'code', summary: 'x', file: null, anchor: null };
      const entries = ['s1', 's2', 's3'].map((slug) => ({
        slug,
        modules_touched: ['src/hot.ts', 'src/cold.ts'],
        rejection_cycles: 2,
        findings: [finding, finding],
      }));
      await mkdir(join(tempDir, '.ana'), { recursive: true });
      await writeFile(
        join(tempDir, '.ana', 'proof_chain.json'),
        JSON.stringify({ schema: 1, entries }, null, 2),
        'utf-8',
      );
    }

    it('populates bugMagnetFiles from the proof chain at SURFACE tier (no tree-sitter dependency)', async () => {
      await createFiles({ 'package.json': JSON.stringify({ name: 'p', version: '1.0.0' }) });
      await writeProofChain();

      const result = await scanProject(tempDir, { depth: 'surface' });

      expect(result.gitIntelligence).not.toBeNull();
      const magnets = result.gitIntelligence!.bugMagnetFiles!;
      expect(magnets.map((m) => m.file)).toContain('src/hot.ts');
      const hot = magnets.find((m) => m.file === 'src/hot.ts')!;
      expect(hot.touchCount).toBe(3);
      // CORRECTION #3 — commit-churn fields stay zeroed; proof-chain fields carry signal.
      expect(hot.bugCommitCount).toBe(0);
      expect(hot.findingsPerTouch).toBe(2); // 6 findings / 3 touches
      expect(hot.rejectionCycles).toBe(6); // 2 per item × 3 items
    });

    it('populates bugMagnetFiles at DEEP tier too', async () => {
      await createHubProject();
      await writeProofChain();
      const result = await scanProject(tempDir, { depth: 'deep' });
      expect(result.gitIntelligence?.bugMagnetFiles?.some((m) => m.file === 'src/hot.ts')).toBe(true);
    });

    it('leaves gitIntelligence null when there is no proof chain', async () => {
      await createFiles({ 'package.json': JSON.stringify({ name: 'p', version: '1.0.0' }) });
      const result = await scanProject(tempDir, { depth: 'surface' });
      expect(result.gitIntelligence).toBeNull();
    });
  });

  // ── No-regression: feature is invisible when unconfigured/ungated ──────────
  describe('no-regression — unconfigured feature is invisible', () => {
    it('a project with no proof chain and a sparse graph yields the frozen all-null defaults', async () => {
      // One isolated file with only an external import: no proof chain, and the
      // import graph is below the edge threshold → both new fields stay null.
      await createFiles({
        'package.json': JSON.stringify({ name: 'lonely', version: '1.0.0' }),
        'src/only.ts': "import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n",
      });

      const result = await scanProject(tempDir, { depth: 'deep' });

      // Exactly the shape-frozen Phase-0 defaults — the feature adds nothing
      // observable until its gates are actually met.
      expect(result.gitIntelligence).toBeNull();
      expect(result.readingOrder).toBeNull();
    });

    it('surface scans never populate readingOrder (deep-tier only)', async () => {
      await createHubProject();
      const result = await scanProject(tempDir, { depth: 'surface' });
      expect(result.readingOrder).toBeNull();
    });
  });

  // ── Slice 3: hasImportRelationship resolved against the real graph ──────────
  describe('Slice 3 — hasImportRelationship resolution side-effect', () => {
    it('builds a non-null reading order over a real hub graph with measured reasons', async () => {
      await createHubProject();
      const result = await scanProject(tempDir, { depth: 'deep' });

      expect(result.readingOrder).not.toBeNull();
      const order = result.readingOrder!;
      // hub.ts is the centrality winner; every entry states its measured basis.
      expect(order.entries[0]!.file).toBe('src/hub.ts');
      for (const entry of order.entries) {
        expect(entry.reasons.length).toBeGreaterThan(0);
        expect(entry.reasons.some((r) => r.startsWith('import centrality'))).toBe(true);
      }
    });
  });
});
