import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock git-operations at module level for ESM compatibility
const mockRunGit = vi.fn();
vi.mock('../../src/utils/git-operations.js', () => ({
  runGit: (...args: unknown[]) => mockRunGit(...args),
}));

import { checkScanFreshness } from '../../src/utils/scan-freshness.js';

describe('checkScanFreshness', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'scan-freshness-'));
    fs.mkdirSync(path.join(tmpDir, '.ana'), { recursive: true });
    vi.unstubAllEnvs();
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
});
