/**
 * Capture arming state — the sticky, per-working-copy signal that flips the
 * capture gate from warn-mode to fail-closed.
 *
 * A project "arms" the moment it seals its first valid build-report capture.
 * From then on, every build-report save on this working copy requires valid
 * captured evidence. The flag lives in gitignored `.ana/state/capture.json`, so
 * arming is scoped to a persistent working copy: a fresh `git clone`, a CI
 * runner, or an ephemeral agent environment starts UN-armed (warn-mode) and
 * stays there until it captures once locally. This is the brick-proof guarantee
 * the whole design rests on — a project arms only AFTER it has proven it can
 * capture, so arming itself is evidence the agent is already on the capture path.
 *
 * Undefined-safe by construction: a missing or malformed `capture.json` reads as
 * "not armed" → warn-mode. A throw here would brick every fresh project, the
 * exact opposite of the goal.
 *
 * This module is a small, pure-ish util — no chalk, no commander, no
 * process.exit. It writes ONLY to `.ana/state/` (never `ana.json`, never the
 * proof chain) and is a SEPARATE file from `.saves.json`, so it adds zero reads
 * to that hot save path.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** The on-disk shape of the arming record. */
interface CaptureState {
  /** Always true once written — presence + this flag together mean "armed". */
  armed: boolean;
  /** ISO-8601 timestamp of the first arming (sticky; never rewritten). */
  armedAt: string;
}

/**
 * Resolve the arming record path for a project.
 *
 * @param projectRoot - Project root directory
 * @returns Absolute path to `.ana/state/capture.json`
 */
function captureStatePath(projectRoot: string): string {
  return path.join(projectRoot, '.ana', 'state', 'capture.json');
}

/**
 * Whether this working copy has armed capture enforcement.
 *
 * Undefined-safe: a missing or malformed `.ana/state/capture.json` returns
 * false (warn-mode) and never throws.
 *
 * @param projectRoot - Project root directory
 * @returns True only when a valid arming record marks the project armed
 */
export function isArmed(projectRoot: string): boolean {
  const statePath = captureStatePath(projectRoot);
  if (!fs.existsSync(statePath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Partial<CaptureState>;
    return parsed.armed === true;
  } catch {
    return false;
  }
}

/**
 * Arm capture enforcement for this working copy.
 *
 * Idempotent: an already-armed project is left untouched, preserving its
 * original `armedAt`. Writes ONLY to `.ana/state/capture.json` — never to
 * `ana.json` and never to the proof chain.
 *
 * @param projectRoot - Project root directory
 */
export function armCapture(projectRoot: string): void {
  if (isArmed(projectRoot)) return;
  const statePath = captureStatePath(projectRoot);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const state: CaptureState = { armed: true, armedAt: new Date().toISOString() };
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}
