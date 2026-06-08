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
 * This module is the single source of truth for the pointer shape, the gate read,
 * and the deterministic transcript derive. The derive is provenance ONLY — counts
 * and model, never findings or verdicts.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { globSync } from 'glob';
import { AnaJsonSchema } from '../commands/init/anaJsonSchema.js';
import { PRICE_TABLE_VERSION, type TokenCounts } from '../data/pricing.js';
import type { SessionProvenance } from '../types/proof.js';

/**
 * Durable, derived provenance for one finished session.
 *
 * Produced by {@link deriveTranscript} from a completed transcript. This is the
 * provenance dataset row — token counts, model, churn-adjacent shape — and
 * NOTHING ELSE. It is deliberately NOT the rule engine: no findings, no
 * verdicts, no scoring. If a count cannot be derived it is `0`/`''`, never an
 * inferred judgement.
 *
 * No `cost_usd` is carried here: cost is a display-time estimate computed from
 * `tokens` + `model` + `price_table_version` (so the committed git object stays a
 * recomputable fact, never a baked-in dollar figure).
 *
 * Every field is a pure function of the transcript bytes (AC8): deriving the same
 * transcript twice yields a `JSON.stringify`-identical object.
 */
export interface ProvenanceCounts {
  /** Token counts, deduped by `requestId` (Claude) or taken from the cumulative total (Codex). */
  tokens: TokenCounts;
  /** The price-table version the cost is computed against (at display time). */
  price_table_version: string;
  /** Wall-clock duration from first→last transcript timestamp, in ms. `0` if unknown. */
  duration_ms: number;
  /** Number of assistant turns. */
  turns: number;
  /** Number of tool invocations. */
  tool_calls: number;
  /** Number of shell/Bash tool invocations. */
  commands_run: number;
  /** Best-effort count of tests executed, parsed from test-command output. `0` if none seen. */
  tests_executed: number;
  /** Best-effort count of test failures, parsed from test-command output. `0` if none seen. */
  failures_encountered: number;
  /** Best-effort count of distinct files written/edited. `0` if none seen. */
  files_touched: number;
  /** The model that ran the session. */
  model: string;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic transcript derive (provenance ONLY, never the engine)
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
 * Safely read a finite number field from an unknown object.
 *
 * @param obj - The value to read from (any type — narrowed internally)
 * @param key - The field name
 * @returns The finite number value, or `0` if absent or non-number
 */
function readNumber(obj: unknown, key: string): number {
  if (typeof obj !== 'object' || obj === null) return 0;
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === 'number' && Number.isFinite(val) ? val : 0;
}

/**
 * Safely read a nested object field from an unknown object.
 *
 * @param obj - The value to read from (any type — narrowed internally)
 * @param key - The field name
 * @returns The nested object, or `undefined` if absent or non-object
 */
function readObject(obj: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof obj !== 'object' || obj === null) return undefined;
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === 'object' && val !== null ? (val as Record<string, unknown>) : undefined;
}

/**
 * Read and parse a transcript file into an array of line objects.
 *
 * Malformed lines are skipped, never thrown. An unreadable/missing path returns
 * `null` so the caller can omit the derived field cleanly.
 *
 * @param transcriptPath - Absolute path to the `.jsonl` transcript
 * @returns The parsed line objects, or `null` if the file is unreadable
 */
function readTranscriptLines(transcriptPath: string): Array<Record<string, unknown>> | null {
  let raw: string;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf-8');
  } catch {
    return null; // dangling/unreadable path → caller omits the field
  }
  const lines: Array<Record<string, unknown>> = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // malformed line is skipped, never throws the derive
    }
    if (typeof parsed === 'object' && parsed !== null) {
      lines.push(parsed as Record<string, unknown>);
    }
  }
  return lines;
}

/**
 * Compute the first→last timestamp span (ms) from top-level ISO `timestamp` fields.
 *
 * Pure — parses fixed timestamp strings, never reads the clock. `0` when fewer
 * than two valid timestamps are present.
 *
 * @param lines - Parsed transcript line objects
 * @returns The span in milliseconds, or `0` if undeterminable
 */
function durationFromTimestamps(lines: Array<Record<string, unknown>>): number {
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    const ts = readString(line, 'timestamp');
    if (!ts) continue;
    const ms = Date.parse(ts); // deterministic parse of input — NOT a clock read
    if (Number.isNaN(ms)) continue;
    if (ms < first) first = ms;
    if (ms > last) last = ms;
  }
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return 0;
  return last - first;
}

/**
 * Best-effort parse of "N passed"/"N failed" out of a text blob.
 *
 * Deliberately simple: matches the first `passed`/`failed` count. Test-runner
 * output varies wildly, so this is documented as best-effort — a missed count is
 * `0`, never an inferred judgement.
 *
 * @param text - Tool-result / command-output text
 * @returns The tests and failures parsed from this blob (deltas to accumulate)
 */
function parseTestCounts(text: string): { tests: number; failures: number } {
  let tests = 0;
  let failures = 0;
  const passed = text.match(/(\d+)\s+passed/);
  if (passed) tests += Number(passed[1]);
  const failed = text.match(/(\d+)\s+failed/);
  if (failed) {
    const n = Number(failed[1]);
    tests += n;
    failures += n;
  }
  return { tests, failures };
}

/**
 * Extract the text of a tool_result content block (string or array form).
 *
 * @param content - The `content` field of a tool_result block
 * @returns The flattened text, or `''` if there is none
 */
function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'object' && c !== null ? readString(c, 'text') : ''))
      .join('\n');
  }
  return '';
}

/**
 * Derive provenance from a Claude transcript (per-message model; dedup tokens by requestId).
 *
 * @param lines - Parsed transcript line objects
 * @returns The derived provenance counts
 */
function deriveClaude(lines: Array<Record<string, unknown>>): ProvenanceCounts {
  const seenRequestIds = new Set<string>();
  const tokens: TokenCounts = { input: 0, output: 0, cache_create: 0, cache_read: 0 };
  let model = '';
  let turns = 0;
  let toolCalls = 0;
  let commandsRun = 0;
  let testsExecuted = 0;
  let failuresEncountered = 0;
  const filesTouched = new Set<string>();
  const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

  for (const line of lines) {
    const type = readString(line, 'type');
    const message = readObject(line, 'message');

    if (type === 'assistant' && message) {
      turns += 1;
      if (!model) model = readString(message, 'model');

      // Token usage — count each requestId exactly once (Claude repeats it across lines).
      const requestId = readString(line, 'requestId');
      const usage = readObject(message, 'usage');
      if (usage && requestId && !seenRequestIds.has(requestId)) {
        seenRequestIds.add(requestId);
        tokens.input += readNumber(usage, 'input_tokens');
        tokens.output += readNumber(usage, 'output_tokens');
        tokens.cache_create += readNumber(usage, 'cache_creation_input_tokens');
        tokens.cache_read += readNumber(usage, 'cache_read_input_tokens');
      }

      // Tool calls live in the assistant content array.
      const content = (message as Record<string, unknown>)['content'];
      if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block !== 'object' || block === null) continue;
          if (readString(block, 'type') !== 'tool_use') continue;
          toolCalls += 1;
          const name = readString(block, 'name');
          if (name === 'Bash') commandsRun += 1;
          if (EDIT_TOOLS.has(name)) {
            const input = readObject(block, 'input');
            const fp = input ? readString(input, 'file_path') : '';
            if (fp) filesTouched.add(fp);
          }
        }
      }
    }

    // Test counts — parse Bash tool_result outputs (best-effort, documented).
    if (type === 'user' && message) {
      const content = (message as Record<string, unknown>)['content'];
      if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block !== 'object' || block === null) continue;
          if (readString(block, 'type') !== 'tool_result') continue;
          const text = toolResultText((block as Record<string, unknown>)['content']);
          const counts = parseTestCounts(text);
          testsExecuted += counts.tests;
          failuresEncountered += counts.failures;
        }
      }
    }
  }

  return {
    tokens,
    price_table_version: PRICE_TABLE_VERSION,
    duration_ms: durationFromTimestamps(lines),
    turns,
    tool_calls: toolCalls,
    commands_run: commandsRun,
    tests_executed: testsExecuted,
    failures_encountered: failuresEncountered,
    files_touched: filesTouched.size,
    model,
  };
}

/**
 * Derive provenance from a Codex rollout transcript.
 *
 * Confirmed against a real `~/.codex/sessions/**\/rollout-*.jsonl` (2026-06):
 * - **Model** is on `turn_context.payload.model` — NOT `session_meta.payload.model`
 *   (which is `null`). First `turn_context` model wins.
 * - **Usage** is a CUMULATIVE running total on `event_msg` lines whose
 *   `payload.type === 'token_count'`, under `payload.info.total_token_usage`.
 *   The LAST occurrence is the session total — do NOT sum per-line. Keys:
 *   `input_tokens`, `output_tokens`, `cached_input_tokens` (→ `cache_read`);
 *   there is NO cache-creation equivalent (`cache_create` stays `0`).
 * - **Turns** = `response_item` `message` blocks with `role === 'assistant'`.
 * - **Tool calls** = `function_call` + `custom_tool_call` `response_item`s.
 *
 * @param lines - Parsed transcript line objects
 * @returns The derived provenance counts
 */
function deriveCodex(lines: Array<Record<string, unknown>>): ProvenanceCounts {
  const tokens: TokenCounts = { input: 0, output: 0, cache_create: 0, cache_read: 0 };
  let model = '';
  let turns = 0;
  let toolCalls = 0;
  let commandsRun = 0;
  let testsExecuted = 0;
  let failuresEncountered = 0;

  for (const line of lines) {
    const type = readString(line, 'type');
    const payload = readObject(line, 'payload');
    if (!payload) continue;

    if (type === 'turn_context' && !model) {
      model = readString(payload, 'model');
    }

    if (type === 'event_msg' && readString(payload, 'type') === 'token_count') {
      const info = readObject(payload, 'info');
      const total = info ? readObject(info, 'total_token_usage') : undefined;
      if (total) {
        // Cumulative — overwrite so the LAST total wins (do not sum).
        tokens.input = readNumber(total, 'input_tokens');
        tokens.output = readNumber(total, 'output_tokens');
        tokens.cache_read = readNumber(total, 'cached_input_tokens');
        tokens.cache_create = 0; // no Codex equivalent
      }
    }

    if (type === 'response_item') {
      const itemType = readString(payload, 'type');
      if (itemType === 'message' && readString(payload, 'role') === 'assistant') {
        turns += 1;
      }
      if (itemType === 'function_call' || itemType === 'custom_tool_call') {
        toolCalls += 1;
        if (readString(payload, 'name') === 'shell') commandsRun += 1;
      }
      if (itemType === 'function_call_output' || itemType === 'custom_tool_call_output') {
        const output = readObject(payload, 'output');
        const text = output ? readString(output, 'content') : readString(payload, 'output');
        const counts = parseTestCounts(text);
        testsExecuted += counts.tests;
        failuresEncountered += counts.failures;
      }
    }
  }

  return {
    tokens,
    price_table_version: PRICE_TABLE_VERSION,
    duration_ms: durationFromTimestamps(lines),
    turns,
    tool_calls: toolCalls,
    commands_run: commandsRun,
    tests_executed: testsExecuted,
    failures_encountered: failuresEncountered,
    files_touched: 0, // Codex apply_patch parsing is out of scope — best-effort 0
    model,
  };
}

/**
 * Derive durable provenance counts from a completed transcript.
 *
 * Reads the JSONL at `transcriptPath` and computes a {@link ProvenanceCounts}.
 * DETERMINISTIC (AC8): no clock, no randomness, no network — duration comes from
 * the transcript's own timestamps. Same input bytes → `JSON.stringify`-identical
 * output. A malformed line is skipped, never thrown. Provenance ONLY — never
 * findings or verdicts.
 *
 * @param transcriptPath - Absolute path to the session transcript (`.jsonl`)
 * @param harness - The harness that produced it (`'codex'` selects the Codex shape)
 * @returns The derived counts, or `null` if the transcript is unreadable/missing
 */
export function deriveTranscript(
  transcriptPath: string,
  harness: string,
): ProvenanceCounts | null {
  const lines = readTranscriptLines(transcriptPath);
  if (lines === null) return null;
  return harness === 'codex' ? deriveCodex(lines) : deriveClaude(lines);
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
 *  5. Derive counts (omitted when the transcript is unreadable — the row is still written).
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

    const derived = transcriptPath ? deriveTranscript(transcriptPath, harness) : null;

    const provenance: SessionProvenance = {
      role,
      harness,
      model: derived?.model || pointerModel || '',
      agent_def_hash: env['ANA_AGENT_DEF_HASH'] ?? '',
      cli_version: env['ANA_CLI_VERSION'] ?? '',
      session_id: sessionId,
      captured_at: pointer?.captured_at || new Date().toISOString(),
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
