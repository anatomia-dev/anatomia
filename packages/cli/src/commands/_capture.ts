/**
 * ana _capture — hidden, total session-capture hook target.
 *
 * Invoked by the SessionStart hook the generator installs (Claude + Codex) when
 * `processCapture` is on. Reads the harness payload from stdin and the injected
 * `ANA_*` env, then appends exactly one provenance line to the home-anchored
 * forensics buffer.
 *
 * DELIBERATE INVERSION OF THE COMMAND-LAYER ERROR CONVENTION: every other
 * command surfaces errors (chalk.red + process.exit(1)). `_capture` is TOTAL —
 * it runs inside live agent sessions, so it must NEVER throw, NEVER block, and
 * ALWAYS exit 0 (gate off, missing/invalid stdin, unwritable buffer, missing
 * env, not a project). A future reader must not "fix" this to surface errors.
 * It also makes no network calls and prints nothing on the happy path.
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { globSync } from 'glob';
import {
  appendSessionRecord,
  buildSessionRecord,
  deriveTranscript,
  isProcessCaptureEnabled,
  parseHookPayload,
  updateSessionRecord,
  type HookPayload,
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
 * Execute the capture: read stdin, resolve the project, check the gate, append.
 *
 * Total by construction — the whole body is wrapped so no failure mode escapes.
 * No-ops (returns without writing) when: stdin is unusable, no project is found,
 * or the gate is off. Never throws.
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

    const record = buildSessionRecord(process.env, payload);
    appendSessionRecord(record);
  } catch {
    // Total: every failure mode is swallowed. The session must not be disturbed.
  }
}

/**
 * Detect which harness produced a session, for the derive branch.
 *
 * Prefers the injected `ANA_HARNESS` env; falls back to the transcript path
 * shape (Codex rollouts live under `.codex/` and are named `rollout-*.jsonl`).
 * Defaults to `'claude'`.
 *
 * @param env - Process environment
 * @param transcriptPath - The resolved transcript path
 * @returns The harness name (`'claude'` | `'codex'`)
 */
function detectHarness(env: Record<string, string | undefined>, transcriptPath: string): string {
  const fromEnv = env['ANA_HARNESS'];
  if (fromEnv) return fromEnv;
  if (transcriptPath.includes(`${path.sep}.codex${path.sep}`) || /rollout-.*\.jsonl$/.test(transcriptPath)) {
    return 'codex';
  }
  return 'claude';
}

/**
 * Resolve the transcript path for the derive, with a Codex glob fallback.
 *
 * Claude SessionEnd delivers `transcript_path` directly. Codex `Stop` may not, so
 * we glob `$CODEX_HOME/sessions/**\/rollout-*-<session_id>.jsonl` (the filename
 * UUID equals the session id — confirmed against a real rollout). Returns `''`
 * when nothing resolves.
 *
 * @param env - Process environment
 * @param payload - The narrowed hook payload
 * @returns The transcript path, or `''` if unresolvable
 */
function resolveTranscriptPath(env: Record<string, string | undefined>, payload: HookPayload): string {
  if (payload.transcript_path && payload.transcript_path.length > 0) return payload.transcript_path;
  const sessionId = payload.session_id;
  if (!sessionId) return '';
  try {
    const codexHome = env['CODEX_HOME'] && env['CODEX_HOME'].length > 0
      ? env['CODEX_HOME']
      : path.join(os.homedir(), '.codex');
    const matches = globSync(`sessions/**/rollout-*-${sessionId}.jsonl`, { cwd: codexHome, absolute: true });
    return matches[0] ?? '';
  } catch {
    return '';
  }
}

/**
 * Execute the end-of-session derive: read the finished transcript, compute
 * provenance counts, and write them back into the matching buffer record.
 *
 * Triggered by the SessionEnd (Claude) / Stop (Codex) hook. TOTAL by
 * construction — no-ops on a missing project, gate off, unresolvable transcript,
 * or unreadable transcript; never throws. No network. Provenance ONLY — never
 * findings or verdicts.
 */
export async function executeDerive(): Promise<void> {
  try {
    const raw = await readStdin(STDIN_TIMEOUT_MS);
    const payload = parseHookPayload(raw);

    const startDir = payload.cwd && payload.cwd.length > 0 ? payload.cwd : process.cwd();
    const projectRoot = findProjectRoot(startDir);
    if (!projectRoot) return; // not a project → silent no-op
    if (!isProcessCaptureEnabled(projectRoot)) return; // gate off → silent no-op

    if (!payload.session_id) return; // cannot match a record without the id

    const transcriptPath = resolveTranscriptPath(process.env, payload);
    if (!transcriptPath) return; // nothing to derive from

    const harness = detectHarness(process.env, transcriptPath);
    const derived = deriveTranscript(transcriptPath, harness);
    if (!derived) return; // dangling/unreadable → no-op

    updateSessionRecord(payload.session_id, derived);
  } catch {
    // Total: every failure mode is swallowed. Teardown must not be disturbed.
  }
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
      // --derive (SessionEnd/Stop) → enrich the existing record; otherwise
      // (SessionStart) → append a new pointer record. Both are total/exit 0.
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
