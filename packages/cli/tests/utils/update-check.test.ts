import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock child_process.spawn and getCliVersion at module level for ESM compatibility
const mockUnref = vi.fn();
const mockSpawn = vi.fn().mockReturnValue({ unref: mockUnref });
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: (...args: unknown[]) => mockSpawn(...args) };
});

const mockGetCliVersion = vi.fn<() => Promise<string>>().mockResolvedValue('1.0.0');
vi.mock('../../src/commands/init/state.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/commands/init/state.js')>();
  return { ...actual, getCliVersion: () => mockGetCliVersion() };
});

import { isNewerVersion, readUpdateCache, getProjectAnaVersion, spawnUpdateCheck, checkForUpdates } from '../../src/utils/update-check.js';

describe('isNewerVersion', () => {
  // @ana A017
  it('handles multi-digit segments (1.10.0 > 1.2.0)', () => {
    expect(isNewerVersion('1.2.0', '1.10.0')).toBe(true);
  });

  // @ana A018
  it('returns false for equal versions', () => {
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
  });

  // @ana A019
  it('returns false when npm is older', () => {
    expect(isNewerVersion('2.0.0', '1.5.0')).toBe(false);
  });

  it('detects newer patch version', () => {
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(true);
  });

  it('detects newer minor version', () => {
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(true);
  });

  it('detects newer major version', () => {
    expect(isNewerVersion('1.0.0', '2.0.0')).toBe(true);
  });

  it('returns false for empty strings', () => {
    expect(isNewerVersion('', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '')).toBe(false);
  });

  it('returns false for malformed input', () => {
    expect(isNewerVersion('abc', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', 'xyz')).toBe(false);
  });

  it('handles versions with different segment counts', () => {
    expect(isNewerVersion('1.0', '1.0.1')).toBe(true);
    expect(isNewerVersion('1.0.1', '1.0')).toBe(false);
  });
});

describe('readUpdateCache', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'update-cache-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function writeCache(data: unknown): Promise<void> {
    const cacheDir = path.join(tempDir, '.ana', 'state', 'cache');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(
      path.join(cacheDir, 'update-check.json'),
      JSON.stringify(data),
      'utf-8',
    );
  }

  it('reads valid cache', async () => {
    const now = Date.now();
    await writeCache({ version: '1.2.0', timestamp: now });
    const result = readUpdateCache(tempDir);
    expect(result).toEqual({ version: '1.2.0', timestamp: now });
  });

  it('returns null for missing file', () => {
    const result = readUpdateCache(tempDir);
    expect(result).toBeNull();
  });

  it('returns null for corrupt JSON', async () => {
    const cacheDir = path.join(tempDir, '.ana', 'state', 'cache');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, 'update-check.json'), '{bad json', 'utf-8');
    const result = readUpdateCache(tempDir);
    expect(result).toBeNull();
  });

  it('returns null when fields are missing', async () => {
    await writeCache({ version: '1.0.0' }); // missing timestamp
    const result = readUpdateCache(tempDir);
    expect(result).toBeNull();
  });

  it('returns null when version is not a string', async () => {
    await writeCache({ version: 123, timestamp: Date.now() });
    const result = readUpdateCache(tempDir);
    expect(result).toBeNull();
  });
});

describe('getProjectAnaVersion', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-version-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function writeAnaJson(config: Record<string, unknown>): Promise<void> {
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify(config, null, 2),
      'utf-8',
    );
  }

  it('returns the anaVersion value', async () => {
    await writeAnaJson({ anaVersion: '1.0.0' });
    expect(getProjectAnaVersion(tempDir)).toBe('1.0.0');
  });

  // @ana A015
  it('returns unknown for missing anaVersion', async () => {
    await writeAnaJson({ name: 'test' });
    expect(getProjectAnaVersion(tempDir)).toBe('unknown');
  });

  // @ana A016
  it('returns unknown for anaVersion 0.0.0', async () => {
    await writeAnaJson({ anaVersion: '0.0.0' });
    expect(getProjectAnaVersion(tempDir)).toBe('unknown');
  });

  it('returns null when ana.json does not exist', () => {
    expect(getProjectAnaVersion(tempDir)).toBeNull();
  });

  it('returns null for corrupt ana.json', async () => {
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(path.join(anaDir, 'ana.json'), 'not json', 'utf-8');
    expect(getProjectAnaVersion(tempDir)).toBeNull();
  });
});

describe('spawnUpdateCheck', () => {
  let tempDir: string;
  const originalCI = process.env['CI'];

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spawn-test-'));
    delete process.env['CI'];
    mockSpawn.mockClear();
    mockUnref.mockClear();
  });

  afterEach(async () => {
    if (originalCI !== undefined) {
      process.env['CI'] = originalCI;
    } else {
      delete process.env['CI'];
    }
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  // @ana A020, A021, A022
  it('spawns detached background process with correct options', () => {
    spawnUpdateCheck(tempDir, 'anatomia-cli');

    expect(mockSpawn).toHaveBeenCalledOnce();
    const call = mockSpawn.mock.calls[0]!;
    expect(call[0]).toBe('node');
    expect(call[1]).toEqual(['-e', expect.any(String)]);
    expect(call[2]).toMatchObject({
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    expect(mockUnref).toHaveBeenCalledOnce();
  });

  // @ana A023
  it('uses JSON.stringify for cache path in spawn script', () => {
    spawnUpdateCheck(tempDir, 'anatomia-cli');

    const callArgs = mockSpawn.mock.calls[0]![1] as string[];
    const script = callArgs.find((a: string) => a.includes('https'));
    expect(script).toBeDefined();
    const expectedPath = JSON.stringify(path.join(tempDir, '.ana/state/cache/update-check.json'));
    expect(script!).toContain(expectedPath);
  });

  // @ana A010
  it('skips spawn when CI=true', () => {
    process.env['CI'] = 'true';

    spawnUpdateCheck(tempDir, 'anatomia-cli');

    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe('checkForUpdates', () => {
  let tempDir: string;
  const originalCI = process.env['CI'];

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'check-updates-test-'));
    delete process.env['CI'];
    mockGetCliVersion.mockResolvedValue('1.0.0');
    mockSpawn.mockClear();
    mockUnref.mockClear();
  });

  afterEach(async () => {
    if (originalCI !== undefined) {
      process.env['CI'] = originalCI;
    } else {
      delete process.env['CI'];
    }
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function writeCache(data: unknown): Promise<void> {
    const cacheDir = path.join(tempDir, '.ana', 'state', 'cache');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(
      path.join(cacheDir, 'update-check.json'),
      JSON.stringify(data),
      'utf-8',
    );
  }

  async function writeAnaJson(config: Record<string, unknown>): Promise<void> {
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify(config, null, 2),
      'utf-8',
    );
  }

  // @ana A014
  it('returns null updateAvailable when no cache exists', async () => {
    const result = await checkForUpdates(tempDir);
    expect(result.updateAvailable).toBeNull();
  });

  // @ana A008
  it('does not spawn background check when cache is fresh', async () => {
    await writeCache({ version: '1.0.0', timestamp: Date.now() });

    await checkForUpdates(tempDir);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  // @ana A009
  it('spawns background check when cache is expired', async () => {
    // Cache from 25 hours ago
    await writeCache({ version: '1.0.0', timestamp: Date.now() - 90_000_000 });

    await checkForUpdates(tempDir);
    expect(mockSpawn).toHaveBeenCalledOnce();
  });

  it('returns updateAvailable when cached version is newer', async () => {
    await writeCache({ version: '1.2.0', timestamp: Date.now() });

    const result = await checkForUpdates(tempDir);
    expect(result.updateAvailable).toEqual({
      current: '1.0.0',
      latest: '1.2.0',
    });
  });

  it('returns projectMismatch when versions differ', async () => {
    mockGetCliVersion.mockResolvedValue('1.1.0');
    await writeAnaJson({ anaVersion: '1.0.0' });

    const result = await checkForUpdates(tempDir);
    expect(result.projectMismatch).toEqual({
      cliVersion: '1.1.0',
      projectVersion: '1.0.0',
    });
  });

  it('returns null projectMismatch when versions match', async () => {
    await writeAnaJson({ anaVersion: '1.0.0' });

    const result = await checkForUpdates(tempDir);
    expect(result.projectMismatch).toBeNull();
  });

  // @ana A007
  it('returns defaults on any error (network failure produces no error output)', async () => {
    mockGetCliVersion.mockRejectedValue(new Error('fail'));

    const result = await checkForUpdates(tempDir);
    expect(result.updateAvailable).toBeNull();
    expect(result.projectMismatch).toBeNull();
  });

  it('skips npm check in CI but still checks project mismatch', async () => {
    process.env['CI'] = 'true';
    await writeCache({ version: '2.0.0', timestamp: Date.now() });
    await writeAnaJson({ anaVersion: '0.5.0' });

    const result = await checkForUpdates(tempDir);
    // CI skips npm check entirely — no cache read
    expect(result.updateAvailable).toBeNull();
    // But project mismatch still works (no network)
    expect(result.projectMismatch).toEqual({
      cliVersion: '1.0.0',
      projectVersion: '0.5.0',
    });
  });
});
