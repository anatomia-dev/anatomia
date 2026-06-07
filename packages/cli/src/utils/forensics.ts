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
import { computeCost, type TokenCounts } from '../data/pricing.js';

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
  /**
   * Derived provenance counts, written back by the SessionEnd/Stop hook (Phase 2).
   * Absent until the session ends and {@link deriveTranscript} has run. Optional
   * by construction — a record without it is a complete, valid Phase-1 record.
   */
  derived?: ProvenanceCounts;
}

/**
 * Durable, derived provenance for one finished session.
 *
 * Produced by {@link deriveTranscript} from a completed transcript. This is the
 * provenance dataset row — counts, cost, model, churn-adjacent shape — and
 * NOTHING ELSE. It is deliberately NOT the rule engine: no findings, no
 * verdicts, no scoring. If a count cannot be derived it is `0`/`''`, never an
 * inferred judgement.
 *
 * Every field is a pure function of the transcript bytes (AC8): deriving the same
 * transcript twice yields a `JSON.stringify`-identical object.
 */
export interface ProvenanceCounts {
  /** Token counts, deduped by `requestId` (Claude) or taken from the cumulative total (Codex). */
  tokens: TokenCounts;
  /** Estimated cost in USD from the versioned price table. */
  cost_usd: number;
  /** The price-table version the cost was computed against. */
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — deterministic transcript derive (provenance ONLY, never the engine)
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

  const cost = computeCost(tokens, model);
  return {
    tokens,
    cost_usd: cost.cost_usd,
    price_table_version: cost.price_table_version,
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

  const cost = computeCost(tokens, model);
  return {
    tokens,
    cost_usd: cost.cost_usd,
    price_table_version: cost.price_table_version,
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
 * the transcript's own timestamps, cost from the versioned price table. Same
 * input bytes → `JSON.stringify`-identical output. A malformed line is skipped,
 * never thrown. Provenance ONLY — never findings or verdicts.
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
 * Write derived counts back into the matching buffer record, in place.
 *
 * Used by the SessionEnd/Stop hook (Phase 2): finds the line whose `session_id`
 * matches and rewrites it with `derived` set, leaving every other line byte-for-
 * byte unchanged. No-op (returns `false`) when the buffer is absent or no record
 * matches. Best-effort and safe — swallows IO errors so it never disturbs
 * session teardown.
 *
 * @param sessionId - The session id to match
 * @param derived - The derived provenance to attach
 * @returns True if a record was updated; false otherwise
 */
export function updateSessionRecord(sessionId: string, derived: ProvenanceCounts): boolean {
  if (!sessionId) return false;
  const bufferPath = getForensicsBufferPath();
  try {
    if (!fs.existsSync(bufferPath)) return false;
    const raw = fs.readFileSync(bufferPath, 'utf-8');
    const lines = raw.split('\n');
    let updated = false;
    const out = lines.map((line) => {
      if (!line.trim()) return line;
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        return line; // preserve unparseable lines verbatim
      }
      if (typeof record === 'object' && record !== null && readString(record, 'session_id') === sessionId) {
        updated = true;
        return JSON.stringify({ ...(record as SessionRecord), derived });
      }
      return line;
    });
    if (!updated) return false;
    fs.writeFileSync(bufferPath, out.join('\n'), 'utf-8');
    return true;
  } catch {
    return false; // total: never disturb teardown
  }
}
