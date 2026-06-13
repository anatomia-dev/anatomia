import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

/**
 * Slice 5 — Context-never-rots.
 *
 * After the archive commit, `completeWork` refreshes the project scan so the
 * next agent reads a ranking that already reflects the just-merged work. These
 * tests verify the three contract points:
 *   1. A material-source merge → scan.json lands in a follow-on commit with
 *      overview.indexedCommit stamped to HEAD.
 *   2. The rescan is wrapped in a total try-catch: when scanProject throws,
 *      completion still succeeds.
 *   3. A doc/artifact-only completion is gated off — no scan.json is written.
 *
 * The engine is mocked so we can (a) keep the scan fast and deterministic and
 * (b) force a throw. The mock delegates to a per-test override.
 */

// Per-test override for scanProject. Default: a minimal deterministic result.
let scanProjectImpl: ((root: string, opts: unknown) => Promise<unknown>) | null = null;
const scanProjectCalls: Array<{ root: string }> = [];

vi.mock('../../src/engine/scan-engine.js', () => ({
  scanProject: async (root: string, opts: unknown) => {
    scanProjectCalls.push({ root });
    if (scanProjectImpl) return scanProjectImpl(root, opts);
    throw new Error('scanProjectImpl not set');
  },
}));

import { completeWork } from '../../src/commands/work.js';

/** Build a deterministic scan result whose indexedCommit matches HEAD. */
function makeScanResult(projectRoot: string): Record<string, unknown> {
  const head = execSync('git rev-parse --short HEAD', { cwd: projectRoot, encoding: 'utf-8' }).trim();
  return {
    schemaVersion: '1.0',
    overview: {
      project: 'rescan-fixture',
      scannedAt: '2026-06-13T12:00:00.000Z',
      depth: 'deep',
      indexedCommit: head,
    },
    git: { head },
  };
}

describe('completeWork — context-never-rots rescan (Slice 5)', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rescan-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    scanProjectImpl = null;
    scanProjectCalls.length = 0;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  /**
   * Create a merged, completable single-phase work item.
   *
   * @param opts.touchSource - when true, the feature branch edits a real source
   *   file so a material delta exists after merge.
   */
  async function createMergedProject(opts: { touchSource: boolean }): Promise<void> {
    const slug = 'test-slug';
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(path.join(anaDir, 'ana.json'), JSON.stringify({ artifactBranch: 'main', lastScanAt: 'old' }), 'utf-8');

    // A source file so the baseline tree has code to diff against.
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'app.ts'), 'export const v = 1;\n', 'utf-8');

    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git branch -M main', { cwd: tempDir, stdio: 'ignore' });

    // Planning artifacts on main.
    const slugPath = path.join(anaDir, 'plans', 'active', slug);
    await fs.mkdir(slugPath, { recursive: true });
    await fs.writeFile(path.join(slugPath, 'scope.md'), '# Scope', 'utf-8');
    await fs.writeFile(
      path.join(slugPath, 'plan.md'),
      '# Plan\n## Phases\n- [ ] Phase 1\n  Spec: spec.md\n',
      'utf-8',
    );
    await fs.writeFile(path.join(slugPath, 'spec.md'), '# Spec 1', 'utf-8');
    execSync('git add -A && git commit -m "add planning"', { cwd: tempDir, stdio: 'ignore' });

    // Feature branch with reports (+ optional source edit).
    execSync('git checkout -b feature/test-slug', { cwd: tempDir, stdio: 'ignore' });
    await fs.writeFile(path.join(slugPath, 'build_report.md'), '# Build Report', 'utf-8');
    await fs.writeFile(path.join(slugPath, 'verify_report.md'), '# Verify Report\n\n**Result:** PASS', 'utf-8');
    await fs.writeFile(
      path.join(slugPath, '.saves.json'),
      JSON.stringify({
        'build-report': { saved_at: new Date().toISOString(), hash: 'sha256:' + '0'.repeat(64) },
        'verify-report': { saved_at: new Date().toISOString(), hash: 'sha256:' + '0'.repeat(64) },
      }),
      'utf-8',
    );
    if (opts.touchSource) {
      await fs.writeFile(path.join(tempDir, 'src', 'app.ts'), 'export const v = 2;\n', 'utf-8');
    }
    execSync('git add -A && git commit -m "add reports"', { cwd: tempDir, stdio: 'ignore' });

    // Merge to main.
    execSync('git checkout main', { cwd: tempDir, stdio: 'ignore' });
    execSync('git merge --no-ff feature/test-slug -m "merge"', { cwd: tempDir, stdio: 'ignore' });
  }

  it('writes scan.json with indexedCommit === HEAD in a follow-on commit after a material merge', async () => {
    await createMergedProject({ touchSource: true });
    scanProjectImpl = async () => makeScanResult(tempDir);

    await completeWork('test-slug');

    // scanProject ran against the project root (compare on basename — macOS
    // resolves tmp through the /private symlink, so absolute paths differ).
    expect(scanProjectCalls.length).toBe(1);
    expect(path.basename(scanProjectCalls[0]!.root)).toBe(path.basename(tempDir));

    // scan.json written, indexedCommit stamped to the commit that was HEAD when
    // the scan ran — the archive commit, which is the parent of the artifact-only
    // refresh commit that scan.json is now part of (HEAD~1).
    const scanJsonPath = path.join(tempDir, '.ana', 'scan.json');
    expect(fsSync.existsSync(scanJsonPath)).toBe(true);
    const scan = JSON.parse(fsSync.readFileSync(scanJsonPath, 'utf-8'));
    const indexedHead = execSync('git rev-parse --short HEAD~1', { cwd: tempDir, encoding: 'utf-8' }).trim();
    expect(scan.overview.indexedCommit).toBe(indexedHead);

    // ana.json.lastScanAt synced to scan.json.overview.scannedAt.
    const anaJson = JSON.parse(fsSync.readFileSync(path.join(tempDir, '.ana', 'ana.json'), 'utf-8'));
    expect(anaJson.lastScanAt).toBe(scan.overview.scannedAt);

    // The follow-on commit is HEAD and carries both files + the co-author trailer.
    const lastMsg = execSync('git log -1 --pretty=%B', { cwd: tempDir, encoding: 'utf-8' });
    expect(lastMsg).toContain('[test-slug] Refresh scan after merge');
    expect(lastMsg).toContain('Co-authored-by:');
    const committedFiles = execSync('git show --name-only --pretty=format: HEAD', { cwd: tempDir, encoding: 'utf-8' });
    expect(committedFiles).toContain('.ana/scan.json');
    expect(committedFiles).toContain('.ana/ana.json');
  });

  it('completes successfully even when scanProject throws (total try-catch)', async () => {
    await createMergedProject({ touchSource: true });
    scanProjectImpl = async () => {
      throw new Error('boom: WASM crash');
    };

    await expect(completeWork('test-slug')).resolves.not.toThrow();

    // Archive still happened — the work is complete despite the rescan failure.
    expect(fsSync.existsSync(path.join(tempDir, '.ana', 'plans', 'completed', 'test-slug'))).toBe(true);
    expect(fsSync.existsSync(path.join(tempDir, '.ana', 'plans', 'active', 'test-slug'))).toBe(false);
    // No scan.json was written (the scan threw before writing).
    expect(fsSync.existsSync(path.join(tempDir, '.ana', 'scan.json'))).toBe(false);
    // The rescan was attempted (no prior scan.json → fail-open gate).
    expect(scanProjectCalls.length).toBe(1);
  });

  it('skips the rescan when the merge had no material source delta', async () => {
    await createMergedProject({ touchSource: false });
    // A prior scan.json pinned to the pre-merge baseline so the gate has a
    // commit to diff against. Only doc/artifact files changed in the merge, so
    // the material-source gate must short-circuit before scanProject runs.
    const baseline = execSync('git rev-parse --short HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();
    fsSync.writeFileSync(
      path.join(tempDir, '.ana', 'scan.json'),
      JSON.stringify({ overview: { indexedCommit: baseline, scannedAt: 'baseline' }, git: { head: baseline } }),
    );
    scanProjectImpl = async () => makeScanResult(tempDir);

    await completeWork('test-slug');

    // Completion happened, but the rescan was gated off entirely.
    expect(fsSync.existsSync(path.join(tempDir, '.ana', 'plans', 'completed', 'test-slug'))).toBe(true);
    expect(scanProjectCalls.length).toBe(0);
    // scan.json untouched — still the baseline we wrote.
    const scan = JSON.parse(fsSync.readFileSync(path.join(tempDir, '.ana', 'scan.json'), 'utf-8'));
    expect(scan.overview.indexedCommit).toBe(baseline);
  });
});
