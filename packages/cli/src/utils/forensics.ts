/**
 * Forensics capture utilities — the home-anchored session buffer.
 *
 * Phase 1 (capture) writes one provenance pointer per agent session into
 * `~/.ana/forensics/sessions.jsonl`. This module is the single source of truth
 * for the buffer path, the record shape, and the gate read, so that the Phase-2
 * derive reader and this writer agree on one format.
 *
 * Nothing here derives counts or touches the proof — that is Phase 2. Phase 1 is
 * pointer + provenance only.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AnaJsonSchema } from '../commands/init/anaJsonSchema.js';

/**
 * One session-capture record — the line appended to the forensics buffer.
 *
 * Phase 1 writes the pointer (`transcript_path`) plus identity/provenance.
 * Phase 2 enriches the same record shape with optional derived fields, so this
 * interface is the contract both phases share.
 */
export interface SessionRecord {
  /** Harness-assigned session id (from the hook payload). */
  session_id: string;
  /** Path to the session transcript, recorded VERBATIM from the payload. Never reconstructed. */
  transcript_path: string;
  /** Harness name — `ANA_HARNESS` env, defaulting to `'claude'` on direct launch. */
  harness: string;
  /** Harness version. Not delivered in the Claude SessionStart payload — empty at Phase 1. */
  harness_version: string;
  /** Pipeline role — `ANA_ROLE` env, falling back to the payload `agent_type`. */
  role: string;
  /** Work-item slug — `ANA_SLUG` env. Empty string is a valid value (think/learn/main-repo). */
  slug: string;
  /** Model id from the hook payload. */
  model: string;
  /** sha256 of the resolved agent-def file at spawn time — `ANA_AGENT_DEF_HASH` env. */
  agent_def_hash: string;
  /** CLI version that spawned the agent — `ANA_CLI_VERSION` env. */
  cli_version: string;
  /** Working directory, recorded verbatim from the payload. */
  cwd: string;
  /** Session-start source (`startup` | `resume` | `clear` | `compact`), verbatim from payload. */
  source: string;
  /** Host OS platform (`os.platform()`). */
  os: string;
  /** Node version (`process.version`). */
  node: string;
  /** ISO-8601 capture timestamp. */
  timestamp: string;
}

/**
 * The harness hook payload delivered on stdin at SessionStart.
 *
 * Every field is optional — this is an untyped boundary. Absent fields degrade
 * cleanly to empty strings in the record. Codex may not deliver every key.
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
 * The single source of truth for the forensics buffer path.
 *
 * Centralized so the Phase-2 reader and this Phase-1 writer resolve the same
 * file. Home is resolved via `os.homedir()`.
 *
 * @returns Absolute path to `~/.ana/forensics/sessions.jsonl`
 */
export function getForensicsBufferPath(): string {
  return path.join(os.homedir(), '.ana', 'forensics', 'sessions.jsonl');
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
 * Build one session record by merging the `ANA_*` env with the hook payload.
 *
 * Applies the clean-degrade fallbacks: `role` falls back to the payload
 * `agent_type`, `harness` defaults to `'claude'`, and absent env reads as empty
 * strings. `transcript_path` is recorded verbatim from the payload — never
 * reconstructed.
 *
 * @param env - Process environment (carries the injected `ANA_*` vars)
 * @param payload - The narrowed hook payload from stdin
 * @returns A fully-populated session record
 */
export function buildSessionRecord(
  env: Record<string, string | undefined>,
  payload: HookPayload,
): SessionRecord {
  return {
    session_id: payload.session_id ?? '',
    transcript_path: payload.transcript_path ?? '',
    harness: env['ANA_HARNESS'] || 'claude',
    harness_version: payload.version ?? '',
    role: env['ANA_ROLE'] || payload.agent_type || '',
    slug: env['ANA_SLUG'] ?? '',
    model: payload.model ?? '',
    agent_def_hash: env['ANA_AGENT_DEF_HASH'] ?? '',
    cli_version: env['ANA_CLI_VERSION'] ?? '',
    cwd: payload.cwd ?? '',
    source: payload.source ?? '',
    os: os.platform(),
    node: process.version,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Append one session record to the forensics buffer.
 *
 * Creates the buffer directory if absent, then appends a single
 * `JSON.stringify(record) + '\n'` line. Uses `fs.appendFileSync` (`O_APPEND`)
 * so concurrent sessions interleave whole lines without clobbering each other.
 *
 * @param record - The session record to persist
 */
export function appendSessionRecord(record: SessionRecord): void {
  const bufferPath = getForensicsBufferPath();
  fs.mkdirSync(path.dirname(bufferPath), { recursive: true });
  fs.appendFileSync(bufferPath, JSON.stringify(record) + '\n', 'utf-8');
}

/**
 * Whether process capture is enabled for this project.
 *
 * Mirrors `isCaptureGateEnabled` minus the test-command carve-out: process
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
