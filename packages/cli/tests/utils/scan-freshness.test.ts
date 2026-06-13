import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock git-operations at module level for ESM compatibility
const mockRunGit = vi.fn();
vi.mock('../../src/utils/git-operations.js', () => ({
  runGit: (...args: unknown[]) => mockRunGit(...args),
}));

import { checkScanFreshness, hasMaterialSourceDelta } from '../../src/utils/scan-freshness.js';

describe('checkScanFreshness', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'scan-freshness-'));
    fs.mkdirSync(path.join(tmpDir, '.ana'), { recursive: true });
    vi.unstubAllEnvs();
    // Ensure CI suppression doesn't trigger in test environment
    delete process.env['CI'];
    mockRunGit.mockReset();
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  function writeScanJson(content: Record<string, unknown>): void {
    fs.writeFileSync(path.join(tmpDir, '.ana', 'scan.json'), JSON.stringify(content));
  }

  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  // @ana A006
  it('returns null when CI=true', () => {
    vi.stubEnv('CI', 'true');
    const result = checkScanFreshness(daysAgo(10), tmpDir);
    expect(result).toBeNull();
  });

  // @ana A007
  it('returns null when lastScanAt is missing', () => {
    const result = checkScanFreshness(undefined, tmpDir);
    expect(result).toBeNull();
  });

  // @ana A007
  it('returns null when lastScanAt is null', () => {
    const result = checkScanFreshness(null, tmpDir);
    expect(result).toBeNull();
  });

  // @ana A007
  it('returns null when lastScanAt is empty string', () => {
    const result = checkScanFreshness('', tmpDir);
    expect(result).toBeNull();
  });

  // @ana A008
  it('returns null when lastScanAt is unparseable', () => {
    const result = checkScanFreshness('not-a-date', tmpDir);
    expect(result).toBeNull();
  });

  // @ana A008
  it('returns null when lastScanAt is garbage string', () => {
    const result = checkScanFreshness('xyzzy123', tmpDir);
    expect(result).toBeNull();
  });

  // @ana A001, A017, A018
  it('displays staleness notification when thresholds exceeded', () => {
    writeScanJson({ git: { head: 'abc123' } });
    mockRunGit.mockReturnValue({ stdout: '73', stderr: '', exitCode: 0 });

    const result = checkScanFreshness(daysAgo(12), tmpDir);

    expect(result).not.toBeNull();
    expect(result!.isStale).toBe(true);
    expect(result!.daysSinceScan).toBeGreaterThan(0);
    expect(result!.commitsSinceScan).toBe(73);
  });

  // @ana A002
  it('does not notify when only time threshold exceeded', () => {
    writeScanJson({ git: { head: 'abc123' } });
    mockRunGit.mockReturnValue({ stdout: '10', stderr: '', exitCode: 0 });

    const result = checkScanFreshness(daysAgo(10), tmpDir);

    expect(result).not.toBeNull();
    expect(result!.isStale).toBe(false);
  });

  // @ana A003
  it('does not notify when only commit threshold exceeded', () => {
    writeScanJson({ git: { head: 'abc123' } });
    mockRunGit.mockReturnValue({ stdout: '100', stderr: '', exitCode: 0 });

    const result = checkScanFreshness(daysAgo(3), tmpDir);

    expect(result).not.toBeNull();
    expect(result!.isStale).toBe(false);
  });

  // @ana A004, A005, A019
  it('falls back to time-only when git rev-list fails', () => {
    writeScanJson({ git: { head: 'abc123' } });
    mockRunGit.mockReturnValue({ stdout: '', stderr: 'fatal: bad object', exitCode: 128 });

    const result = checkScanFreshness(daysAgo(10), tmpDir);

    expect(result).not.toBeNull();
    expect(result!.isStale).toBe(true);
    expect(result!.commitsSinceScan).toBeNull();
  });

  it('falls back to time-only when scan.json is missing', () => {
    // No scan.json written
    const result = checkScanFreshness(daysAgo(10), tmpDir);

    expect(result).not.toBeNull();
    expect(result!.isStale).toBe(true);
    expect(result!.commitsSinceScan).toBeNull();
  });

  it('falls back to time-only when scan.json has no git.head', () => {
    writeScanJson({ stack: 'typescript' });

    const result = checkScanFreshness(daysAgo(10), tmpDir);

    expect(result).not.toBeNull();
    expect(result!.isStale).toBe(true);
    expect(result!.commitsSinceScan).toBeNull();
  });

  // @ana A020
  it('scanStale is null when scan is current', () => {
    writeScanJson({ git: { head: 'abc123' } });
    mockRunGit.mockReturnValue({ stdout: '5', stderr: '', exitCode: 0 });

    const result = checkScanFreshness(daysAgo(2), tmpDir);

    expect(result).not.toBeNull();
    expect(result!.isStale).toBe(false);
    expect(result!.daysSinceScan).toBeLessThanOrEqual(2);
    expect(result!.commitsSinceScan).toBe(5);
  });

  it('returns not stale when exactly at time threshold boundary', () => {
    writeScanJson({ git: { head: 'abc123' } });
    mockRunGit.mockReturnValue({ stdout: '100', stderr: '', exitCode: 0 });

    const result = checkScanFreshness(daysAgo(7), tmpDir);

    expect(result).not.toBeNull();
    expect(result!.isStale).toBe(false);
  });

  it('returns not stale when exactly at commit threshold boundary', () => {
    writeScanJson({ git: { head: 'abc123' } });
    mockRunGit.mockReturnValue({ stdout: '50', stderr: '', exitCode: 0 });

    const result = checkScanFreshness(daysAgo(10), tmpDir);

    expect(result).not.toBeNull();
    expect(result!.isStale).toBe(false);
  });

  // ── Slice 5: HEAD-divergence stale flag (context-never-rots) ──
  describe('HEAD divergence (Slice 5)', () => {
    // Route runGit by subcommand: rev-list (commit count), rev-parse (current
    // short HEAD), and diff --name-only (material source-delta classification).
    function routeGit(opts: {
      count?: string;
      head?: string;
      headExit?: number;
      diffFiles?: string;
      diffExit?: number;
    }): void {
      mockRunGit.mockImplementation((args: string[]) => {
        if (args[0] === 'rev-list') {
          return { stdout: opts.count ?? '0', stderr: '', exitCode: 0 };
        }
        if (args[0] === 'rev-parse') {
          return { stdout: opts.head ?? '', stderr: '', exitCode: opts.headExit ?? 0 };
        }
        if (args[0] === 'diff') {
          return { stdout: opts.diffFiles ?? '', stderr: '', exitCode: opts.diffExit ?? 0 };
        }
        return { stdout: '', stderr: '', exitCode: 1 };
      });
    }

    it('headDiverged=true and isStale=true when HEAD moved past the index with a source change, even on a fresh scan', () => {
      writeScanJson({ git: { head: 'abc123' }, overview: { indexedCommit: 'abc123' } });
      routeGit({ count: '1', head: 'def456', diffFiles: 'src/commands/work.ts' });

      const result = checkScanFreshness(daysAgo(0), tmpDir);

      expect(result).not.toBeNull();
      expect(result!.headDiverged).toBe(true);
      // Young scan (0 days, 1 commit) — only divergence makes it stale.
      expect(result!.isStale).toBe(true);
    });

    it('headDiverged=false when HEAD moved but only artifact files changed (the refresh commit)', () => {
      writeScanJson({ git: { head: 'abc123' }, overview: { indexedCommit: 'abc123' } });
      routeGit({ count: '1', head: 'def456', diffFiles: '.ana/scan.json\n.ana/ana.json' });

      const result = checkScanFreshness(daysAgo(1), tmpDir);

      expect(result).not.toBeNull();
      expect(result!.headDiverged).toBe(false);
      expect(result!.isStale).toBe(false);
    });

    it('headDiverged=false and isStale=false when indexedCommit matches HEAD', () => {
      writeScanJson({ git: { head: 'abc123' }, overview: { indexedCommit: 'abc123' } });
      routeGit({ count: '0', head: 'abc123' });

      const result = checkScanFreshness(daysAgo(1), tmpDir);

      expect(result).not.toBeNull();
      expect(result!.headDiverged).toBe(false);
      expect(result!.isStale).toBe(false);
    });

    it('headDiverged=null when scan.json has no indexedCommit (pre-Slice-5 scan)', () => {
      writeScanJson({ git: { head: 'abc123' } });
      mockRunGit.mockReturnValue({ stdout: '5', stderr: '', exitCode: 0 });

      const result = checkScanFreshness(daysAgo(2), tmpDir);

      expect(result).not.toBeNull();
      expect(result!.headDiverged).toBeNull();
      expect(result!.isStale).toBe(false);
    });

    it('headDiverged=null when rev-parse HEAD is unavailable', () => {
      writeScanJson({ git: { head: 'abc123' }, overview: { indexedCommit: 'abc123' } });
      routeGit({ count: '0', head: '', headExit: 128 });

      const result = checkScanFreshness(daysAgo(1), tmpDir);

      expect(result).not.toBeNull();
      expect(result!.headDiverged).toBeNull();
      expect(result!.isStale).toBe(false);
    });

    it('headDiverged=null when HEAD moved but the diff is undeterminable', () => {
      writeScanJson({ git: { head: 'abc123' }, overview: { indexedCommit: 'abc123' } });
      routeGit({ count: '1', head: 'def456', diffExit: 128 });

      const result = checkScanFreshness(daysAgo(1), tmpDir);

      expect(result).not.toBeNull();
      expect(result!.headDiverged).toBeNull();
      expect(result!.isStale).toBe(false);
    });
  });
});

describe('hasMaterialSourceDelta', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'material-delta-'));
    fs.mkdirSync(path.join(tmpDir, '.ana'), { recursive: true });
    mockRunGit.mockReset();
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  function writeScanJson(content: Record<string, unknown>): void {
    fs.writeFileSync(path.join(tmpDir, '.ana', 'scan.json'), JSON.stringify(content));
  }

  it('returns true (fail-open) when there is no prior scan.json', () => {
    expect(hasMaterialSourceDelta(tmpDir)).toBe(true);
    // No baseline → no diff attempted.
    expect(mockRunGit).not.toHaveBeenCalled();
  });

  it('returns true (fail-open) when scan.json has no indexedCommit', () => {
    writeScanJson({ git: { head: 'abc123' } });
    expect(hasMaterialSourceDelta(tmpDir)).toBe(true);
    expect(mockRunGit).not.toHaveBeenCalled();
  });

  it('returns true when a source file changed since the indexed commit', () => {
    writeScanJson({ overview: { indexedCommit: 'abc123' } });
    mockRunGit.mockReturnValue({ stdout: 'README.md\nsrc/commands/work.ts', stderr: '', exitCode: 0 });

    expect(hasMaterialSourceDelta(tmpDir)).toBe(true);
    expect(mockRunGit).toHaveBeenCalledWith(['diff', '--name-only', 'abc123..HEAD'], { cwd: tmpDir });
  });

  it('returns false when only doc/config/artifact files changed', () => {
    writeScanJson({ overview: { indexedCommit: 'abc123' } });
    mockRunGit.mockReturnValue({
      stdout: 'README.md\n.ana/proof_chain.json\ndocs/guide.md\npackage.json',
      stderr: '',
      exitCode: 0,
    });

    expect(hasMaterialSourceDelta(tmpDir)).toBe(false);
  });

  it('returns false when nothing changed (HEAD === indexedCommit)', () => {
    writeScanJson({ overview: { indexedCommit: 'abc123' } });
    mockRunGit.mockReturnValue({ stdout: '', stderr: '', exitCode: 0 });

    expect(hasMaterialSourceDelta(tmpDir)).toBe(false);
  });

  it('returns true (fail-open) when git diff fails', () => {
    writeScanJson({ overview: { indexedCommit: 'abc123' } });
    mockRunGit.mockReturnValue({ stdout: '', stderr: 'fatal: bad object', exitCode: 128 });

    expect(hasMaterialSourceDelta(tmpDir)).toBe(true);
  });
});
