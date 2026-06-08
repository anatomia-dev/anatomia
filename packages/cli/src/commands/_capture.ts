/**
 * ana _capture — hidden, total session-capture hook target.
 *
 * Invoked by the SessionStart hook the generator installs (Claude + Codex) when
 * `processCapture` is on. Reads the harness payload from stdin and the injected
 * `ANA_*` env, then writes exactly one transient POINTER keyed by `ANA_RUN_ID`
 * into `~/.ana/forensics/pending/{run_id}.json`. No derive, no git — the heavy
 * work (derive + commit) happens later at `ana artifact save`.
 *
 * DELIBERATE INVERSION OF THE COMMAND-LAYER ERROR CONVENTION: every other
 * command surfaces errors (chalk.red + process.exit(1)). `_capture` is TOTAL —
 * it runs inside live agent sessions, so it must NEVER throw, NEVER block, and
 * ALWAYS exit 0 (gate off, missing/invalid stdin, unwritable pointer dir, missing
 * env, not a project). A future reader must not "fix" this to surface errors.
 * It also makes no network calls and prints nothing on the happy path.
 *
 * The `--derive` flag (SessionEnd/Stop on older installs that have not re-init'd)
 * is retained as a declared option but is a pure no-op: removing it would make
 * commander error on the unknown option inside a live session, breaking the total
 * contract. Phase 3 prunes the stale hook from configs.
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  isProcessCaptureEnabled,
  parseHookPayload,
  writePendingPointer,
  type PendingPointer,
} from '../utils/forensics.js';

/** Upper bound on the stdin read — keeps the hook well under the sub-300ms budget. */
const STDIN_TIMEOUT_MS = 250;

/**
 * Read the full stdin stream to a string, bounded by a short timeout.
 *
 * The harness writes the hook payload to stdin and closes it. We read to end,
 * but cap the wait so a harness that never closes stdin (or a TTY) cannot hang
 * the session. Resolves with whatever was read; never rejects.
 *
 * @param timeoutMs - Maximum time to wait for stdin to end
 * @returns The accumulated stdin content (may be empty)
 */
function readStdin(timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve(data);
    };
    const timer = setTimeout(finish, timeoutMs);
    // Don't let a pending timer keep the process alive.
    if (typeof timer.unref === 'function') timer.unref();

    try {
      // No piped input (interactive TTY) — nothing to read.
      if (process.stdin.isTTY) {
        clearTimeout(timer);
        finish();
        return;
      }
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      process.stdin.on('end', () => {
        clearTimeout(timer);
        finish();
      });
      process.stdin.on('error', () => {
        clearTimeout(timer);
        finish();
      });
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

/**
 * Walk up from a starting directory looking for a `.ana/` directory.
 *
 * Defensive and cheap — no schema validation, no throwing helpers on the hot
 * path. Returns the first ancestor containing `.ana/`, or null if none.
 *
 * @param startDir - Directory to start the walk from
 * @returns The project root, or null if not inside a project
 */
function findProjectRoot(startDir: string): string | null {
  try {
    let dir = path.resolve(startDir);
    const root = path.parse(dir).root;
    while (dir !== root) {
      if (fs.existsSync(path.join(dir, '.ana'))) return dir;
      dir = path.dirname(dir);
    }
    // Check the filesystem root itself.
    if (fs.existsSync(path.join(root, '.ana'))) return root;
    return null;
  } catch {
    return null;
  }
}

/**
 * Execute the capture: read stdin, resolve the project, check the gate, write a pointer.
 *
 * Total by construction — the whole body is wrapped so no failure mode escapes.
 * No-ops (returns without writing) when: stdin is unusable, no project is found,
 * the gate is off, no session id is present, or no `ANA_RUN_ID` is set (nothing to
 * correlate). Never throws, does no git, does no derive.
 */
export async function executeCapture(): Promise<void> {
  try {
    const raw = await readStdin(STDIN_TIMEOUT_MS);
    const payload = parseHookPayload(raw);

    // Resolve the project root from the payload cwd (the session's cwd), falling
    // back to our own cwd. Reading the gate needs a project root.
    const startDir = payload.cwd && payload.cwd.length > 0 ? payload.cwd : process.cwd();
    const projectRoot = findProjectRoot(startDir);
    if (!projectRoot) return; // not a project → silent no-op

    if (!isProcessCaptureEnabled(projectRoot)) return; // gate off → silent no-op

    if (!payload.session_id) return; // no session id → unusable, unmatchable pointer; skip

    const runId = process.env['ANA_RUN_ID'];
    if (!runId) return; // no correlation key → the save could never find this pointer; skip

    const pointer: PendingPointer = {
      session_id: payload.session_id,
      transcript_path: payload.transcript_path ?? '',
      model: payload.model ?? '',
      source: payload.source ?? '',
      captured_at: new Date().toISOString(),
    };
    writePendingPointer(runId, pointer);
  } catch {
    // Total: every failure mode is swallowed. The session must not be disturbed.
  }
}

/**
 * No-op for the retired `--derive` (SessionEnd/Stop) branch.
 *
 * Capture v2 does all derive + commit work at `ana artifact save`, not at
 * session end. The `--derive` flag is kept declared (see the module header) so an
 * un-pruned hook from an older install does not make commander error inside a
 * live session — but it does nothing. TOTAL: returns immediately, never throws.
 */
export async function executeDerive(): Promise<void> {
  // Intentionally empty — the end-of-session derive was removed in capture v2.
}

/**
 * Register the hidden `ana _capture` command.
 *
 * Added with `{ hidden: true }` so it never appears in `ana --help`, and NOT
 * inside a commandsGroup. Always exits 0.
 *
 * @param program - Commander program instance
 */
export function registerCaptureCommand(program: Command): void {
  const captureCommand = new Command('_capture')
    .description('(internal) Capture a session provenance record')
    .option('--derive', 'Derive provenance from a finished transcript (SessionEnd/Stop)')
    .action(async (options: { derive?: boolean }) => {
      // --derive (SessionEnd/Stop on stale installs) → no-op; otherwise
      // (SessionStart) → write the pending pointer. Both are total/exit 0.
      if (options.derive) {
        await executeDerive();
      } else {
        await executeCapture();
      }
      // Total: always a clean exit, regardless of what happened above.
      process.exit(0);
    });

  program.addCommand(captureCommand, { hidden: true });
}
