/**
 * Forensics capture utilities — per-session provenance that travels git.
 *
 * Capture v2 does NOT use a home-global buffer (that channel never crossed
 * machines). Instead:
 *
 *  1. The SessionStart hook (`ana _capture`) writes a transient POINTER keyed by
 *     `ANA_RUN_ID` into `~/.ana/forensics/pending/{run_id}.json` — just enough to
 *     find the live session later. No derive, no git.
 *  2. At `ana artifact save`, {@link captureProvenanceAtSave} resolves the session
 *     from that pointer (or a Claude fallback), derives counts from the on-disk
 *     transcript, and writes a self-contained
 *     `.ana/plans/active/{slug}/provenance/{role}-{session_id}.json` that is
 *     committed alongside the artifact — so it travels git like every other file.
 *
 * This module owns the pointer shape, the gate read, and the capture lifecycle.
 * The deterministic transcript derive itself is delegated to the published
 * `anatrace-core` engine ({@link parseSession} + {@link deriveCounts}) — Anatomia
 * no longer hand-parses agent transcripts. The derive is provenance ONLY — counts
 * and model, never findings or verdicts.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { globSync } from 'glob';
import { deriveCounts, parseSession } from 'anatrace-core';
import type { Harness, NamedBlob, ProvenanceCounts } from 'anatrace-core';
import { AnaJsonSchema } from '../commands/init/anaJsonSchema.js';
import type { SessionProvenance } from '../types/proof.js';

/**
 * Durable, derived provenance for one finished session — re-exported from
 * `anatrace-core`.
 *
 * This is the engine's frozen provenance shape: token counts, model, structural
 * counts, and the `derive_version`/`price_table_version` stamps. It is
 * deliberately NOT the rule engine — no findings, no verdicts, no scoring. Every
 * field is a pure function of the transcript bytes: deriving the same transcript
 * twice yields a `JSON.stringify`-identical object. Re-exported here so existing
 * importers (e.g. `types/proof.ts`) keep their import path unchanged.
 */
export type { ProvenanceCounts } from 'anatrace-core';

/**
 * The harness hook payload delivered on stdin at SessionStart.
 *
 * Every field is optional — this is an untyped boundary. Absent fields degrade
 * cleanly to empty strings. Codex may not deliver every key.
 */
export interface HookPayload {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  source?: string;
  model?: string;
  /** Present only when the session was started with `--agent <name>`. */
  agent_type?: string;
  /** Harness version, if the payload carries it (Claude SessionStart does not). */
  version?: string;
}

/**
 * A transient SessionStart pointer — written by the hook, consumed at save.
 *
 * Just enough to find the live session later: the session id, its transcript
 * path (verbatim from the payload, may be empty for Codex), the model, the
 * start source, and the wall-clock capture time (which becomes the committed
 * provenance's `captured_at`). Lives at `~/.ana/forensics/pending/{run_id}.json`
 * and is deleted the moment a save consumes it.
 */
export interface PendingPointer {
  /** Harness-assigned session id (from the hook payload). */
  session_id: string;
  /** Path to the session transcript, recorded VERBATIM from the payload. May be empty. */
  transcript_path: string;
  /** Model id from the hook payload (may be empty). */
  model: string;
  /** Session-start source (`startup` | `resume` | `clear` | `compact`), verbatim. */
  source: string;
  /** ISO-8601 wall-clock capture timestamp — carried into the committed `captured_at`. */
  captured_at: string;
}

/**
 * The single source of truth for the pending-pointer directory.
 *
 * Centralized so the hook writer and the save-time reader resolve the same dir.
 * Home is resolved via `os.homedir()`.
 *
 * @returns Absolute path to `~/.ana/forensics/pending`
 */
export function getPendingDir(): string {
  return path.join(os.homedir(), '.ana', 'forensics', 'pending');
}

/**
 * Safely narrow an unknown stdin payload into a {@link HookPayload}.
 *
 * The stdin payload is an untyped boundary — a malformed payload must never
 * throw. Returns an empty object on any parse/shape failure; copies only string
 * fields, ignoring everything else.
 *
 * @param raw - Raw stdin string (may be empty or malformed JSON)
 * @returns A narrowed payload; `{}` if the input is unusable
 */
export function parseHookPayload(raw: string): HookPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  const obj = parsed as Record<string, unknown>;
  const payload: HookPayload = {};
  const keys: Array<keyof HookPayload> = [
    'session_id',
    'transcript_path',
    'cwd',
    'source',
    'model',
    'agent_type',
    'version',
  ];
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string') payload[key] = val;
  }
  return payload;
}

/**
 * Write the SessionStart pending pointer for a run id.
 *
 * Total/never-throw — the SessionStart hook calls this and must never disturb the
 * session. Creates the pending dir if absent. A missing/empty run id is a no-op
 * (nothing to correlate).
 *
 * @param runId - The `ANA_RUN_ID` correlation key
 * @param pointer - The pointer payload to persist
 */
export function writePendingPointer(runId: string, pointer: PendingPointer): void {
  if (!runId) return;
  try {
    const dir = getPendingDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${runId}.json`), JSON.stringify(pointer), 'utf-8');
  } catch {
    // Total: a failed pointer write must never disturb the session.
  }
}

/**
 * Read the pending pointer for a run id.
 *
 * Returns `null` on any failure (absent file, unreadable, malformed JSON, wrong
 * shape) — never throws. Copies only the known string fields.
 *
 * @param runId - The `ANA_RUN_ID` correlation key
 * @returns The pointer, or `null` if unavailable
 */
export function readPendingPointer(runId: string): PendingPointer | null {
  if (!runId) return null;
  try {
    const raw = fs.readFileSync(path.join(getPendingDir(), `${runId}.json`), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      session_id: readString(parsed, 'session_id'),
      transcript_path: readString(parsed, 'transcript_path'),
      model: readString(parsed, 'model'),
      source: readString(parsed, 'source'),
      captured_at: readString(parsed, 'captured_at'),
    };
  } catch {
    return null;
  }
}

/**
 * Delete the pending pointer for a run id (best-effort).
 *
 * Called once a save has consumed the pointer. Swallows all errors — a missing
 * file is a perfectly fine outcome.
 *
 * @param runId - The `ANA_RUN_ID` correlation key
 */
export function deletePendingPointer(runId: string): void {
  if (!runId) return;
  try {
    fs.unlinkSync(path.join(getPendingDir(), `${runId}.json`));
  } catch {
    // Best-effort: nothing to delete is success.
  }
}

/**
 * Prune pending pointers older than `maxAgeMs` by file mtime (best-effort).
 *
 * Opportunistic housekeeping so a crashed/never-saved session cannot grow the
 * pending dir unbounded. Uses wall-clock (`Date.now()`/file mtime) — this is
 * runtime housekeeping, NOT the deterministic derive path. Swallows all errors.
 *
 * @param maxAgeMs - Maximum pointer age in milliseconds before it is removed
 */
export function prunePendingPointers(maxAgeMs: number): void {
  try {
    const dir = getPendingDir();
    const now = Date.now();
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      const fp = path.join(dir, name);
      try {
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > maxAgeMs) fs.unlinkSync(fp);
      } catch {
        // Skip an individual unreadable/racing entry.
      }
    }
  } catch {
    // Best-effort: a missing pending dir is success.
  }
}

/**
 * Whether process capture is enabled for this project.
 *
 * Mirrors `isTestEvidenceGateEnabled` minus the test-command carve-out: process
 * capture is unconditional when `processCapture` is `'on'`. Undefined-safe by
 * construction — a missing or malformed `ana.json` returns `false` and never
 * throws (a broken config must never accidentally enable capture).
 *
 * @param projectRoot - Project root directory
 * @returns True only when the committed `processCapture` flag is `'on'`
 */
export function isProcessCaptureEnabled(projectRoot: string): boolean {
  let anaJson: Record<string, unknown>;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8')) as unknown;
    anaJson = AnaJsonSchema.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }
  return anaJson['processCapture'] === 'on';
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic transcript derive (delegated to anatrace-core; provenance ONLY)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely read a string field from an unknown object.
 *
 * @param obj - The value to read from (any type — narrowed internally)
 * @param key - The field name
 * @returns The string value, or `''` if absent or non-string
 */
function readString(obj: unknown, key: string): string {
  if (typeof obj !== 'object' || obj === null) return '';
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === 'string' ? val : '';
}

/**
 * Derive provenance counts from transcript bytes via the `anatrace-core` engine.
 *
 * Wraps the bytes in a core {@link NamedBlob}, runs {@link parseSession} (which
 * detects the Claude/Codex shape, with `harness` as the hint), and projects the
 * normalized session into {@link ProvenanceCounts} via {@link deriveCounts}. Both
 * core calls are SYNCHRONOUS and PURE (no clock, no network, no randomness) — the
 * same bytes always yield a `JSON.stringify`-identical object. `parseSession`
 * returns `null` for an unrecognizable transcript; that maps to `null` here, the
 * same "derived omitted" path as an unreadable file.
 *
 * @param bytes - The raw transcript bytes that were read from disk
 * @param name - The transcript filename (used by core's adapter detection)
 * @param harness - The harness that produced it (`'codex'` selects the Codex shape)
 * @returns The derived counts, or `null` if the session could not be parsed
 */
function deriveCountsFromBytes(
  bytes: Uint8Array,
  name: string,
  harness: string,
): ProvenanceCounts | null {
  const blobs: NamedBlob[] = [{ name, bytes }];
  const session = parseSession(blobs, harness as Harness);
  if (session === null) return null;
  return deriveCounts(session);
}

/**
 * Derive durable provenance counts from a completed transcript.
 *
 * Reads the JSONL at `transcriptPath` and delegates the derive to
 * `anatrace-core`. DETERMINISTIC: no clock, no randomness, no network — duration
 * comes from the transcript's own timestamps. Same input bytes →
 * `JSON.stringify`-identical output. Provenance ONLY — never findings or verdicts.
 *
 * @param transcriptPath - Absolute path to the session transcript (`.jsonl`)
 * @param harness - The harness that produced it (`'codex'` selects the Codex shape)
 * @returns The derived counts, or `null` if the transcript is unreadable/missing/unparsable
 */
export function deriveTranscript(
  transcriptPath: string,
  harness: string,
): ProvenanceCounts | null {
  let bytes: Uint8Array;
  try {
    bytes = fs.readFileSync(transcriptPath);
  } catch {
    return null; // dangling/unreadable path → caller omits the field
  }
  return deriveCountsFromBytes(bytes, path.basename(transcriptPath), harness);
}

/**
 * Resolve a transcript path for a session, with harness-specific fallbacks.
 *
 * When `transcriptPath` is already known (the pointer carried it), it is returned
 * verbatim. Otherwise the session id is used to locate the on-disk transcript:
 * - **Codex** — glob `$CODEX_HOME/sessions/**\/rollout-*-<session_id>.jsonl`
 *   (the filename UUID equals the session id — confirmed against a real rollout).
 * - **Claude** — glob `~/.claude/projects/**\/<session_id>.jsonl` (the session id
 *   equals the transcript filename).
 *
 * Returns `''` when nothing resolves. Never throws.
 *
 * @param env - Process environment (for `CODEX_HOME`)
 * @param sessionId - The harness session id
 * @param transcriptPath - The already-known transcript path, if any
 * @param harness - The harness name (`'claude'` | `'codex'`)
 * @returns The resolved transcript path, or `''`
 */
export function resolveTranscriptPath(
  env: Record<string, string | undefined>,
  sessionId: string,
  transcriptPath: string,
  harness: string,
): string {
  if (transcriptPath && transcriptPath.length > 0) return transcriptPath;
  if (!sessionId) return '';
  try {
    if (harness === 'codex') {
      const codexHome =
        env['CODEX_HOME'] && env['CODEX_HOME'].length > 0
          ? env['CODEX_HOME']
          : path.join(os.homedir(), '.codex');
      const matches = globSync(`sessions/**/rollout-*-${sessionId}.jsonl`, {
        cwd: codexHome,
        absolute: true,
      });
      return matches[0] ?? '';
    }
    // Claude: the session id equals the transcript filename under ~/.claude/projects.
    const claudeProjects = path.join(os.homedir(), '.claude', 'projects');
    const matches = globSync(`**/${sessionId}.jsonl`, { cwd: claudeProjects, absolute: true });
    return matches[0] ?? '';
  } catch {
    return '';
  }
}

/** Orphan pointers older than this (72h) are pruned opportunistically at save. */
const POINTER_MAX_AGE_MS = 72 * 60 * 60 * 1000;

/**
 * Capture one session's provenance at `ana artifact save` time.
 *
 * This is the orchestrator the save sites call. It is TOTAL — any failure returns
 * `null` and a capture failure must NEVER break a save. On success it writes a
 * self-contained `.ana/plans/active/{slug}/provenance/{role}-{session_id}.json`,
 * deletes the consumed pointer, prunes orphan pointers, and returns the absolute
 * path written so the caller can stage it into the artifact commit.
 *
 * Session resolution:
 *  1. `role` ← `ANA_ROLE` (no role → return `null`).
 *  2. `runId` ← `ANA_RUN_ID`; read its pointer for session id / transcript / model.
 *  3. Claude fallback when no pointer session: `session_id` ← `CLAUDE_CODE_SESSION_ID`.
 *  4. Resolve the transcript path from the session id when the pointer lacked one.
 *  5. Read the transcript bytes ONCE; derive counts and the `transcript_hash`
 *     (sha256 byte-identity attestation) from those same bytes. Both are present
 *     iff the transcript was readable — an unreadable transcript writes an
 *     identity-only row with both omitted (no guessed values).
 *
 * @param projectRoot - Project root directory
 * @param slug - Work-item slug being saved
 * @param env - Process environment (carries the injected `ANA_*` vars)
 * @returns The absolute path of the written provenance file, or `null` if none was written
 */
export function captureProvenanceAtSave(
  projectRoot: string,
  slug: string,
  env: Record<string, string | undefined>,
): string | null {
  try {
    if (!isProcessCaptureEnabled(projectRoot)) return null;

    const role = env['ANA_ROLE'] ?? '';
    if (!role) return null; // no role → nothing to attribute

    const harness = env['ANA_HARNESS'] || 'claude';
    const runId = env['ANA_RUN_ID'] ?? '';
    const pointer = runId ? readPendingPointer(runId) : null;

    let sessionId = pointer?.session_id ?? '';
    let transcriptPath = pointer?.transcript_path ?? '';
    const pointerModel = pointer?.model ?? '';

    // Claude fallback: recover the session id from the harness env when no pointer
    // was written (the hook never fired). Codex has no such env → no fallback.
    if (!sessionId && harness !== 'codex') {
      sessionId = env['CLAUDE_CODE_SESSION_ID'] ?? '';
    }
    if (!sessionId) return null; // unresolvable session → nothing to write

    if (!transcriptPath) {
      transcriptPath = resolveTranscriptPath(env, sessionId, '', harness);
    }

    // Read the transcript bytes ONCE so the derive and the transcript_hash attest
    // the exact same bytes. An unreadable/missing path leaves both absent — the
    // identity row is still written below.
    let derived: ProvenanceCounts | null = null;
    let transcriptHash: string | null = null;
    if (transcriptPath) {
      try {
        const bytes = fs.readFileSync(transcriptPath);
        transcriptHash = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
        derived = deriveCountsFromBytes(bytes, path.basename(transcriptPath), harness);
      } catch {
        // Unreadable transcript → both derived and transcript_hash stay absent.
      }
    }

    const provenance: SessionProvenance = {
      role,
      harness,
      model: derived?.model || pointerModel || '',
      agent_def_hash: env['ANA_AGENT_DEF_HASH'] ?? '',
      cli_version: env['ANA_CLI_VERSION'] ?? '',
      session_id: sessionId,
      captured_at: pointer?.captured_at || new Date().toISOString(),
      ...(transcriptHash ? { transcript_hash: transcriptHash } : {}),
      ...(derived ? { derived } : {}),
    };

    const provDir = path.join(projectRoot, '.ana', 'plans', 'active', slug, 'provenance');
    fs.mkdirSync(provDir, { recursive: true });
    const filePath = path.join(provDir, `${role}-${sessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(provenance, null, 2) + '\n', 'utf-8');

    // Consume the pointer and prune orphans (best-effort).
    if (runId) deletePendingPointer(runId);
    prunePendingPointers(POINTER_MAX_AGE_MS);

    return filePath;
  } catch {
    return null; // Total: a capture failure must never break a save.
  }
}
