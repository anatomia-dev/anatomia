import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { staleBinaryWarning, STALE_MARKER_FILENAME } from '../../src/utils/stale-binary.js';

/**
 * Dev-binary staleness guard — the consumer side.
 *
 * `staleBinaryWarning` is the hot-path startup check: it must be TOTAL (never
 * throw, never break the CLI), fire ONLY when the post-merge hook left a marker,
 * and stay quiet (return null) for the common current state and for npm customers
 * (whose dist never carries the marker).
 */

const tmpDirs: string[] = [];
function mkDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-bin-'));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('staleBinaryWarning', () => {
  it('returns null when no marker is present (the common, healthy state)', () => {
    expect(staleBinaryWarning(mkDir())).toBeNull();
  });

  it('returns null for a non-existent entry dir, without throwing', () => {
    expect(staleBinaryWarning(path.join(os.tmpdir(), 'no-such-dir-xyz-12345'))).toBeNull();
  });

  it('warns when the marker exists and names the exact fix', () => {
    const d = mkDir();
    fs.writeFileSync(path.join(d, STALE_MARKER_FILENAME), '');
    const w = staleBinaryWarning(d);
    expect(w).not.toBeNull();
    expect(w).toContain('STALE');
    expect(w).toContain('pnpm install && pnpm run build');
    expect(w!.endsWith('\n')).toBe(true);
  });

  it('includes the marker detail when present', () => {
    const d = mkDir();
    fs.writeFileSync(path.join(d, STALE_MARKER_FILENAME), 'Reason: pnpm run build failed (typecheck)');
    const w = staleBinaryWarning(d)!;
    expect(w).toContain('pnpm run build failed');
  });

  it('truncates an oversized marker so it never floods the terminal', () => {
    const d = mkDir();
    fs.writeFileSync(path.join(d, STALE_MARKER_FILENAME), 'x'.repeat(10_000));
    const w = staleBinaryWarning(d)!;
    expect(w).not.toBeNull();
    expect(w.length).toBeLessThan(4_000); // detail capped well under the raw 10k
  });

  it('ignores a non-regular marker (a directory) quietly — the hook only writes regular files', () => {
    const d = mkDir();
    fs.mkdirSync(path.join(d, STALE_MARKER_FILENAME));
    expect(staleBinaryWarning(d)).toBeNull();
  });

  it('NEVER hangs on a FIFO marker (a blocking read would wedge the CLI forever)', () => {
    const d = mkDir();
    const fifo = path.join(d, STALE_MARKER_FILENAME);
    const made = spawnSync('mkfifo', [fifo]);
    if (made.status !== 0) return; // mkfifo unavailable (e.g. Windows) → skip
    // If this returned by reading the FIFO it would block; reaching the assertion
    // (and the test not timing out) proves stat-first short-circuits the read.
    expect(staleBinaryWarning(d)).toBeNull();
  });
});
