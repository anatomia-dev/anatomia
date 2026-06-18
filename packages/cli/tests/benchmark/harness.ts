/**
 * Prove-it benchmark harness (Slice 4).
 *
 * The harness is the thin orchestration layer over {@link scoreTranscript}: it
 * loads a fixed localization task from `tests/benchmark/tasks/<id>.json`,
 * resolves the transcript for an arm (BARE today; SCAN later), and emits a
 * mechanically scored {@link MetricsRow} — or abstains.
 *
 * Design constraints (build spec, Slice 4):
 *  - Env-gated, OUT of default CI: the suite runs only when
 *    `ANA_BENCH=1`. {@link benchmarkEnabled} is the single gate so the test and
 *    any future CLI entrypoint agree.
 *  - Model / prompt / budget constant across arms: the task pins the prompt, and
 *    both arms must be run with the same model — the harness does not vary it,
 *    it only scores what it is given.
 *  - Mechanically scored, no LLM judge: scoring is entirely in
 *    {@link scoreTranscript}.
 *  - Trinary abstain-on-unknown: a task or transcript we cannot trust yields an
 *    abstention with a reason, never a fabricated row (the pattern from
 *    `capture-runner.ts`).
 *
 * The harness reuses `src/utils/forensics.ts` for transcript derivation (via the
 * scorer) — it does NOT shell out, does NOT call an LLM, and does NOT re-run the
 * agent. Producing the transcripts (the actual BARE/SCAN agent runs) is an
 * out-of-band, human-driven step; the harness consumes their on-disk artifacts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  scoreTranscript,
  type Arm,
  type BenchmarkTask,
  type MetricsRow,
  type ScoreResult,
} from './scorer.js';

/** The env var that gates the whole benchmark suite out of default CI. */
export const BENCH_ENV_VAR = 'ANA_BENCH';

/**
 * Whether the benchmark suite is enabled for this process.
 *
 * Single gate so the test, the harness, and any future CLI entrypoint agree.
 * Enabled only when `ANA_BENCH` is exactly `'1'` — any other value (including
 * unset, empty, `'0'`, `'true'`) leaves it OFF so a stray export can't silently
 * pull a slow, transcript-dependent suite into a normal `pnpm test` run.
 *
 * @param env - Process environment (defaults to `process.env`)
 * @returns True only when `ANA_BENCH === '1'`
 */
export function benchmarkEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[BENCH_ENV_VAR] === '1';
}

/** Absolute path to the `tests/benchmark/tasks` directory. */
function tasksDir(): string {
  return path.join(import.meta.dirname, 'tasks');
}

/** Safely read a string field from an unknown value. */
function readString(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  return typeof val === 'string' ? val : '';
}

/** Safely read a boolean field from an unknown value. */
function readBoolean(obj: Record<string, unknown>, key: string): boolean {
  return obj[key] === true;
}

/**
 * Narrow an unknown parsed-JSON value into a {@link BenchmarkTask}.
 *
 * Validates the load-bearing fields: a non-empty `id`, `prompt`, `pinnedCommit`,
 * and a `relevantFiles` array of at least one non-empty string. Returns `null`
 * (never throws) on any shape failure so the harness abstains rather than
 * scoring against a malformed task.
 *
 * @param raw - Parsed JSON (unknown shape)
 * @returns The validated task, or `null` when malformed
 */
export function parseTask(raw: unknown): BenchmarkTask | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const id = readString(obj, 'id');
  const prompt = readString(obj, 'prompt');
  const pinnedCommit = readString(obj, 'pinnedCommit');
  if (!id || !prompt || !pinnedCommit) return null;

  const relevantRaw = obj['relevantFiles'];
  if (!Array.isArray(relevantRaw)) return null;
  const relevantFiles = relevantRaw.filter((f): f is string => typeof f === 'string' && f.length > 0);
  if (relevantFiles.length === 0) return null;

  return {
    id,
    prompt,
    pinnedCommit,
    relevantFiles,
    readOnly: readBoolean(obj, 'readOnly'),
  };
}

/**
 * Load a fixed task by id from `tests/benchmark/tasks/<id>.json`.
 *
 * @param id - The task id (filename stem)
 * @returns The validated task, or `null` if absent/unreadable/malformed
 */
export function loadTask(id: string): BenchmarkTask | null {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(tasksDir(), `${id}.json`), 'utf-8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return parseTask(parsed);
}

/**
 * List the ids of all fixed tasks under `tests/benchmark/tasks`.
 *
 * Deterministic — sorted so a run order is stable. Returns `[]` when the dir is
 * absent.
 *
 * @returns Sorted task ids
 */
export function listTaskIds(): string[] {
  try {
    return fs
      .readdirSync(tasksDir())
      .filter((n) => n.endsWith('.json'))
      .map((n) => n.slice(0, -'.json'.length))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Run one arm of one task: score the supplied transcript against the task.
 *
 * This is intentionally a pure score of an EXISTING transcript — the harness
 * never spawns the agent (transcript production is an out-of-band step). The
 * `pinnedCommit` is carried on the task purely as provenance/documentation; the
 * harness does not check out anything.
 *
 * @param task - The fixed localization task
 * @param arm - The arm this transcript belongs to (`bare` | `scan`)
 * @param transcriptPath - Absolute path to the arm's session transcript
 * @param harness - The harness that produced it (`claude` | `codex`)
 * @returns A scored metrics row, or an abstention with a reason
 */
export function runArm(
  task: BenchmarkTask,
  arm: Arm,
  transcriptPath: string,
  harness = 'claude',
): ScoreResult {
  return scoreTranscript(transcriptPath, task, arm, harness);
}

/**
 * Render a small set of scored rows as a fixed table for the demo.
 *
 * @param rows - Scored metrics rows (any arms)
 * @returns A multi-line table string
 */
export function renderTable(rows: MetricsRow[]): string {
  const header = `task=${rows[0]?.taskId ?? '?'}  model=${rows[0]?.model ?? '?'}`;
  const body = rows.map((r) => {
    const tok = r.tokensToFirstCorrectEdit === null ? 'n/a' : String(r.tokensToFirstCorrectEdit);
    return `  ${r.arm.toUpperCase().padEnd(4)} | ${r.distinctFilesRead} files | ${r.wrongFileReads} wrong | ${r.toolCalls} tools | ${tok} tok`;
  });
  return [header, ...body].join('\n');
}
