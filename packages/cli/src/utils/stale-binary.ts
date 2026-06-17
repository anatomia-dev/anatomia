/**
 * Dev-binary staleness guard.
 *
 * The dogfood `ana` runs a locally-built `dist/index.js` whose code only refreshes
 * when the CLI is rebuilt. A `post-merge` git hook rebuilds it automatically on
 * pull — but if that rebuild fails (e.g. a merged dependency was never installed,
 * so the typecheck can't resolve it), the binary silently freezes at the last good
 * build. That exact failure shipped a stale binary for days, undetected.
 *
 * To make that impossible to miss, the post-merge hook writes a {@link STALE_MARKER_FILENAME}
 * marker next to the built entry on any failed rebuild. {@link staleBinaryWarning}
 * surfaces it on EVERY `ana` invocation until a successful build clears it.
 *
 * Published (npm) installs never carry the marker: the hook only runs inside the
 * source repo, and a clean publish build wipes `dist/`. So customers never see this.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';

/** Filename of the marker the post-merge hook writes beside the built entry. */
export const STALE_MARKER_FILENAME = '.build-stale';

/** Max bytes of marker detail to surface — defensive against a corrupt/huge marker. */
const MAX_DETAIL_BYTES = 2048;

/**
 * Build the stale-binary warning for stderr, or `null` when the binary is current.
 *
 * TOTAL on the CLI hot path: never throws and never blocks. It `stat`s the marker
 * first (so a non-regular file — FIFO/socket/dir — is ignored rather than read,
 * which would hang the CLI on a pipe), then reads at most {@link MAX_DETAIL_BYTES}
 * from a descriptor (so a corrupt/huge marker never materializes a giant string).
 * The warning goes to stderr via the caller, so it never corrupts `--json` stdout.
 *
 * @param entryDir - Directory of the running entry (the `dist/` dir in a built install)
 * @returns A multi-line warning string (newline-terminated), or `null` if no valid marker exists
 */
export function staleBinaryWarning(entryDir: string): string | null {
  try {
    const markerPath = path.join(entryDir, STALE_MARKER_FILENAME);

    // stat (not existsSync) so we never *read* a non-regular file. The hook only
    // ever writes a regular file; anything else at this path is junk — ignore it,
    // and critically never read a FIFO/socket (that would block the CLI forever).
    let isRegularFile: boolean;
    try {
      isRegularFile = fs.statSync(markerPath).isFile();
    } catch {
      return null; // no marker (ENOENT) or unstattable → healthy/quiet
    }
    if (!isRegularFile) return null;

    let detail = '';
    try {
      // Bounded read from a descriptor — cap the bytes that ever enter memory,
      // not just the bytes printed.
      const fd = fs.openSync(markerPath, 'r');
      try {
        const buf = Buffer.allocUnsafe(MAX_DETAIL_BYTES);
        const n = fs.readSync(fd, buf, 0, MAX_DETAIL_BYTES, 0);
        detail = buf.toString('utf-8', 0, n).trim();
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // Regular file but the read failed (e.g. EACCES) — still warn, without detail.
    }

    const lines = [
      chalk.bgRed.white(' CLI BINARY MAY BE STALE '),
      chalk.yellow('Your local `ana` is older than the merged source — the last rebuild failed.'),
    ];
    if (detail) lines.push(chalk.gray(detail));
    lines.push(chalk.yellow('Fix: cd packages/cli && pnpm install && pnpm run build'));

    return lines.join('\n') + '\n';
  } catch {
    return null; // a staleness check must NEVER break the CLI
  }
}
