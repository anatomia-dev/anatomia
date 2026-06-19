/**
 * Prove-it benchmark scorer (the "ruler").
 *
 * Mechanically scores a single agent session transcript against a fixed
 * localization task. The whole point of the harness is a credible with/without
 * comparison, so scoring is DETERMINISTIC and mechanical — no LLM judge, no
 * heuristic guessing. Every metric is a pure function of the transcript bytes
 * plus the task's declared target files.
 *
 * Metrics are sourced from THREE shipped surfaces, never re-implemented here:
 *  - **Provenance counts** — `deriveTranscript` (`src/utils/forensics.ts`) for
 *    tokens / `tool_calls` / `turns` / `duration_ms` / `model`.
 *  - **Cost** — `computeCost` (`src/data/pricing.ts`) for `$/task`; `priced:false`
 *    on an unknown model is preserved (surfaced as unpriced, never a fake `$0`).
 *  - **Context facts** — `analyze(session).session.context` (`anatrace-core`) for
 *    root-lane peak-context tokens and the real utilization ratio. The ratio is
 *    OMITTED for an unknown model (never guessed) ⇒ mapped to `null`.
 *
 * Genuinely benchmark-specific signals (no shipped surface exists) are computed
 * in the localization walk here: distinct/wrong/redundant file reads and the
 * three "to-first-correct-edit" metrics (tokens, turns, wall-clock).
 *
 * ABSTAIN-ON-UNKNOWN (the trinary pattern): a transcript we cannot parse, or one
 * whose harness shape we do not understand, scores `abstain` with a reason —
 * never a fabricated metrics row. A green benchmark must rest on real bytes. A
 * `null` time-to-first-edit on an edit task that never edited is a REAL (poor)
 * scored result, NOT an abstain — abstain is reserved for "we cannot trust the
 * bytes", not "the agent did badly".
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { analyze, parseSession } from 'anatrace-core';
import type { Harness, NamedBlob } from 'anatrace-core';
import { deriveTranscript } from '../../src/utils/forensics.js';
import { computeCost, PRICES } from '../../src/data/pricing.js';
import type { TokenCounts } from '../../src/data/pricing.js';

/** Trinary scoring outcome — `scored` requires positive evidence. */
export type ScoreOutcome = 'scored' | 'abstain';

/**
 * A benchmark arm. `bare` and `scan` are the pre-registered arms; the
 * `(string & {})` member widens the type to accept future arms (e.g.
 * `context-only`) with zero breakage while keeping autocomplete for the known
 * ones. No consumer switches exhaustively on `Arm`, so widening is safe.
 */
export type Arm = 'bare' | 'scan' | (string & {});

/**
 * A fixed localization task. Pinned to a repo commit so the relevant-file set is
 * stable — the task is only meaningful against `pinnedCommit`.
 */
export interface BenchmarkTask {
  /** Stable task id (matches the `tasks/<id>.json` filename). */
  id: string;
  /** Human-readable description of the localization goal. */
  prompt: string;
  /** Repo commit the relevant-file set was authored against. */
  pinnedCommit: string;
  /**
   * Repo-relative paths that are legitimately relevant to the task. A read of
   * any of these is "on target"; a read of anything else is a wrong-file read.
   * The first relevant file edited counts as the "first correct edit".
   */
  relevantFiles: string[];
  /**
   * Whether this task is read-only (localization, no edit expected) — when true,
   * the to-first-correct-edit metrics are allowed to be `null` without
   * abstaining.
   */
  readOnly: boolean;
}

/** One scored metrics row for a single arm of a single task. */
export interface MetricsRow {
  taskId: string;
  arm: Arm;
  /** Distinct file paths opened with `Read`. */
  distinctFilesRead: number;
  /** Reads of files NOT in the task's relevant set — the reliability signal. */
  wrongFileReads: number;
  /** Wasteful repeat reads of files already opened (`totalReads - distinct`). */
  redundantReads: number;
  /** `redundantReads / totalReads`; `0` on a no-read run (never divides by 0). */
  redundantReadRatio: number;
  /** Cumulative tokens spent up to the first correct edit; `null` if none. */
  tokensToFirstCorrectEdit: number | null;
  /** Assistant turns taken to reach the first correct edit; `null` if none. */
  turnsToResolution: number | null;
  /** Wall-clock ms from session start to the first correct edit; `null` if none. */
  wallClockMsToFirstCorrectEdit: number | null;
  /** Total tool invocations (from forensics derive). */
  toolCalls: number;
  /** Total assistant turns (from forensics derive). */
  turns: number;
  /** Session wall-clock duration in ms (from forensics derive). */
  durationMs: number;
  /** Fresh input tokens (cache-decomposed, from forensics derive). */
  inputTokens: number;
  /** Output tokens (from forensics derive). */
  outputTokens: number;
  /** Cache-creation input tokens (from forensics derive). */
  cacheCreateTokens: number;
  /** Cache-read input tokens (from forensics derive). */
  cacheReadTokens: number;
  /** Root-lane peak context tokens (`input + cache_read + cache_create`). */
  peakContextTokens: number;
  /** Peak context as a ratio of the model window; `null` for an unknown model. */
  contextUtilization: number | null;
  /** Estimated `$/task` from the shipped price table. */
  costUsd: number;
  /** Whether the model was priced — `false` means unpriced, NOT free. */
  priced: boolean;
  /** The model that ran the session (from forensics derive). */
  model: string;
}

/** A successful score, or an abstention with a reason. */
export type ScoreResult =
  | { outcome: 'scored'; row: MetricsRow }
  | { outcome: 'abstain'; reason: string };

/** Harness shapes the scorer's localization pass understands. */
const KNOWN_HARNESSES = new Set(['claude', 'codex']);

/**
 * Sum the input+output token total from a {@link TokenCounts}.
 *
 * Cache tokens are excluded: the metric is "work done to reach the answer", and
 * cache reads/creates are an artifact of harness plumbing, not localization
 * effort. Deterministic — pure arithmetic over the derived counts.
 *
 * @param tokens - Derived token counts
 * @returns input + output tokens
 */
function totalTokens(tokens: TokenCounts): number {
  return tokens.input + tokens.output;
}

/**
 * Normalize a file path for comparison.
 *
 * The transcript records absolute paths; tasks declare repo-relative ones. We
 * compare by suffix so an absolute `…/src/foo.ts` matches a relative
 * `src/foo.ts` without needing the repo root. Backslashes are normalized so a
 * Windows-authored transcript still matches.
 *
 * @param p - A file path (absolute or relative)
 * @returns The path with backslashes normalized to forward slashes
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Whether a read path matches one of the task's relevant files.
 *
 * Suffix match: the absolute read path ends with `/<relative>` or equals it.
 *
 * @param readPath - The (normalized) path the agent read
 * @param relevant - The (normalized) relevant-file set
 * @returns True when the read is on-target
 */
function isRelevant(readPath: string, relevant: Set<string>): boolean {
  if (relevant.has(readPath)) return true;
  for (const rel of relevant) {
    if (readPath.endsWith('/' + rel) || readPath === rel) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transcript line readers (mirrors forensics' safe-narrowing discipline)
// ─────────────────────────────────────────────────────────────────────────────

/** Safely read a string field from an unknown value. */
function readString(obj: unknown, key: string): string {
  if (typeof obj !== 'object' || obj === null) return '';
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === 'string' ? val : '';
}

/** Safely read a finite number field from an unknown value. */
function readNumber(obj: unknown, key: string): number {
  if (typeof obj !== 'object' || obj === null) return 0;
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === 'number' && Number.isFinite(val) ? val : 0;
}

/** Safely read a nested object field from an unknown value. */
function readObject(obj: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof obj !== 'object' || obj === null) return undefined;
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === 'object' && val !== null ? (val as Record<string, unknown>) : undefined;
}

/**
 * Parse an ISO-8601 timestamp string into epoch ms, or `null` when absent or
 * unparseable. Deterministic — `Date.parse` of a FIXED string reads no clock.
 *
 * @param ts - An ISO timestamp string (or empty)
 * @returns Epoch milliseconds, or `null`
 */
function parseTs(ts: string): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Parse a transcript file into line objects, or `null` if unreadable.
 *
 * Malformed lines are skipped (never thrown), mirroring forensics. An empty but
 * readable file parses to `[]` — the caller treats that as an abstain (no
 * evidence), distinct from `null` (unreadable).
 *
 * @param transcriptPath - Absolute path to the `.jsonl` transcript
 * @returns Parsed line objects, or `null` when the file cannot be read
 */
function parseTranscript(transcriptPath: string): Array<Record<string, unknown>> | null {
  let raw: string;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf-8');
  } catch {
    return null;
  }
  const lines: Array<Record<string, unknown>> = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed === 'object' && parsed !== null) {
      lines.push(parsed as Record<string, unknown>);
    }
  }
  return lines;
}

/** Edit-class tool names that count as an "edit" of a file. */
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/** The localization metrics derived from a single Claude transcript. */
interface LocalizationResult {
  distinctReads: Set<string>;
  wrongReads: number;
  totalReads: number;
  tokensToFirstCorrectEdit: number | null;
  turnsToResolution: number | null;
  wallClockMsToFirstCorrectEdit: number | null;
}

/**
 * The localization pass over a Claude transcript.
 *
 * Walks assistant turns in order, accumulating per-turn token usage (deduped by
 * `requestId`, matching forensics) and an assistant-turn counter so that when
 * the first edit of a relevant file is seen we can report the running token
 * total, the turn count, and the wall-clock elapsed at that point. `Read`
 * tool_uses populate the distinct/wrong/total read counts.
 *
 * @param lines - Parsed Claude transcript line objects
 * @param relevant - The normalized relevant-file set
 * @returns The localization metrics derived from this transcript
 */
function localizeClaude(
  lines: Array<Record<string, unknown>>,
  relevant: Set<string>,
): LocalizationResult {
  const seenRequestIds = new Set<string>();
  const distinctReads = new Set<string>();
  let wrongReads = 0;
  let totalReads = 0;
  let runningTokens = 0;
  let assistantTurns = 0;
  let anchorMs: number | null = null;
  let tokensToFirstCorrectEdit: number | null = null;
  let turnsToResolution: number | null = null;
  let wallClockMsToFirstCorrectEdit: number | null = null;

  for (const line of lines) {
    // Session-start anchor: the first line carrying a parseable timestamp.
    const lineMs = parseTs(readString(line, 'timestamp'));
    if (anchorMs === null && lineMs !== null) anchorMs = lineMs;

    if (readString(line, 'type') !== 'assistant') continue;
    const message = readObject(line, 'message');
    if (!message) continue;
    assistantTurns += 1;

    // Running token total — dedup by requestId exactly like forensics.
    const requestId = readString(line, 'requestId');
    const usage = readObject(message, 'usage');
    if (usage && requestId && !seenRequestIds.has(requestId)) {
      seenRequestIds.add(requestId);
      runningTokens += readNumber(usage, 'input_tokens') + readNumber(usage, 'output_tokens');
    }

    const content = (message as Record<string, unknown>)['content'];
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      if (readString(block, 'type') !== 'tool_use') continue;
      const name = readString(block, 'name');
      const input = readObject(block, 'input');
      const fp = input ? normalizePath(readString(input, 'file_path')) : '';
      if (!fp) continue;

      if (name === 'Read') {
        totalReads += 1;
        distinctReads.add(fp);
        if (!isRelevant(fp, relevant)) wrongReads += 1;
      }
      if (EDIT_TOOLS.has(name) && tokensToFirstCorrectEdit === null && isRelevant(fp, relevant)) {
        tokensToFirstCorrectEdit = runningTokens;
        turnsToResolution = assistantTurns;
        wallClockMsToFirstCorrectEdit =
          lineMs !== null && anchorMs !== null ? lineMs - anchorMs : null;
      }
    }
  }

  return {
    distinctReads,
    wrongReads,
    totalReads,
    tokensToFirstCorrectEdit,
    turnsToResolution,
    wallClockMsToFirstCorrectEdit,
  };
}

/**
 * Read the root-lane context facts for a transcript via the shipped
 * `anatrace-core` `analyze` surface.
 *
 * `parseSession` normalizes the bytes (the same parser forensics uses) and
 * `analyze` projects the root-lane peak-context facts. The utilization ratio is
 * OMITTED by the surface for an unknown model (never guessed) — mapped to `null`
 * here rather than a misleading `0`. Returns peak `0` / util `null` when the
 * session cannot be parsed or carries no context block.
 *
 * @param bytes - The raw transcript bytes
 * @param name - The transcript filename (used by core's adapter detection)
 * @param harness - The harness that produced it
 * @returns Root-lane peak context tokens and the utilization ratio (or `null`)
 */
function contextFacts(
  bytes: Uint8Array,
  name: string,
  harness: Harness,
): { peakContextTokens: number; contextUtilization: number | null } {
  const session = parseSession([{ name, bytes }] as NamedBlob[], harness);
  const ctx = session ? analyze(session).session.context : undefined;
  return {
    peakContextTokens: ctx?.rootPeakTokens ?? 0,
    contextUtilization: ctx?.rootContextUtilization ?? null,
  };
}

/**
 * Score one agent session transcript against a task for a given arm.
 *
 * Deterministic and mechanical. Returns `abstain` (never a fabricated row) when:
 *  - the transcript is unreadable/missing,
 *  - the transcript parsed to zero lines (no evidence),
 *  - the harness shape is one the localization pass does not understand,
 *  - forensics could not derive provenance counts.
 *
 * For a `readOnly` task the to-first-correct-edit metrics are `null` by design.
 * For an edit task a `null` means the agent never reached the fix — that is a
 * real (poor) result, still scored, never abstained: abstain is reserved for
 * "we cannot trust the bytes", not "the agent did badly".
 *
 * @param transcriptPath - Absolute path to the session transcript
 * @param task - The fixed localization task
 * @param arm - Which arm produced this transcript
 * @param harness - The harness that produced it (`claude` | `codex`)
 * @returns A scored metrics row, or an abstention with a reason
 */
export function scoreTranscript(
  transcriptPath: string,
  task: BenchmarkTask,
  arm: Arm,
  harness = 'claude',
): ScoreResult {
  if (!KNOWN_HARNESSES.has(harness)) {
    return { outcome: 'abstain', reason: `unknown harness '${harness}' — cannot score` };
  }

  const lines = parseTranscript(transcriptPath);
  if (lines === null) {
    return { outcome: 'abstain', reason: `transcript unreadable: ${transcriptPath}` };
  }
  if (lines.length === 0) {
    return { outcome: 'abstain', reason: 'transcript parsed to zero lines — no evidence to score' };
  }

  // Provenance-shaped counts (tokens, tool_calls, turns, duration, model) from
  // the single source of truth — never re-implemented here.
  const derived = deriveTranscript(transcriptPath, harness);
  if (derived === null) {
    return { outcome: 'abstain', reason: 'forensics could not derive provenance counts' };
  }

  // The localization-specific pass is Claude-shaped today; Codex transcripts
  // record file reads under a different schema, so we abstain rather than
  // fabricate a zero-read row for them.
  if (harness === 'codex') {
    return {
      outcome: 'abstain',
      reason: 'codex localization scoring not implemented — abstaining rather than fabricating',
    };
  }

  const relevant = new Set([...task.relevantFiles].map(normalizePath));
  const localization = localizeClaude(lines, relevant);
  const redundantReads = localization.totalReads - localization.distinctReads.size;
  const redundantReadRatio =
    localization.totalReads === 0 ? 0 : redundantReads / localization.totalReads;

  // Context facts via the shipped analyze surface (a second, deliberate parse —
  // each metric family arrives through its own named shipped surface).
  let bytes: Uint8Array | null = null;
  try {
    bytes = fs.readFileSync(transcriptPath);
  } catch {
    bytes = null;
  }
  const { peakContextTokens, contextUtilization } = bytes
    ? contextFacts(bytes, path.basename(transcriptPath), harness as Harness)
    : { peakContextTokens: 0, contextUtilization: null };

  // Cost via the shipped price table — `priced:false` surfaces unpriced models
  // distinctly, never a fake `$0`.
  const cost = computeCost(derived.tokens, derived.model, { priceTable: PRICES });

  const row: MetricsRow = {
    taskId: task.id,
    arm,
    distinctFilesRead: localization.distinctReads.size,
    wrongFileReads: localization.wrongReads,
    redundantReads,
    redundantReadRatio,
    tokensToFirstCorrectEdit: task.readOnly ? null : localization.tokensToFirstCorrectEdit,
    turnsToResolution: task.readOnly ? null : localization.turnsToResolution,
    wallClockMsToFirstCorrectEdit: task.readOnly
      ? null
      : localization.wallClockMsToFirstCorrectEdit,
    toolCalls: derived.tool_calls,
    turns: derived.turns,
    durationMs: derived.duration_ms,
    inputTokens: derived.tokens.input,
    outputTokens: derived.tokens.output,
    cacheCreateTokens: derived.tokens.cache_create,
    cacheReadTokens: derived.tokens.cache_read,
    peakContextTokens,
    contextUtilization,
    costUsd: cost.cost_usd,
    priced: cost.priced,
    model: derived.model,
  };

  return { outcome: 'scored', row };
}

/**
 * Render a metrics row as a single fixed-width table line (the demo's
 * "Benchmark table" row). Deterministic — pure formatting. The new structured
 * metrics are NOT crammed into this demo line; it stays the ported 5-column
 * format so the ported render tests keep passing.
 *
 * @param row - A scored metrics row
 * @returns A pipe-delimited line: `arm | files | wrong | tools | tokens`
 */
export function renderMetricsRow(row: MetricsRow): string {
  const tokens = row.tokensToFirstCorrectEdit === null ? 'n/a' : String(row.tokensToFirstCorrectEdit);
  return [
    row.arm.toUpperCase().padEnd(4),
    `${row.distinctFilesRead} files`,
    `${row.wrongFileReads} wrong`,
    `${row.toolCalls} tools`,
    `${tokens} tok`,
  ].join(' | ');
}

export { totalTokens };
