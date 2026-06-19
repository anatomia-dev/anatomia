/**
 * Prove-it benchmark harness — unit tests (the "ruler" mechanism).
 *
 * These tests verify the MECHANISM (gate, task loading, mechanical scoring,
 * the five reliability metrics, cost, context facts, abstain-on-unknown, Arm
 * widening) against committed fixtures. They are hermetic and fast, so they run
 * on every `pnpm test` — what is "out of default CI" is the agent-RUN suite
 * (producing live transcripts), gated behind `ANA_BENCH=1` via
 * {@link benchmarkEnabled}. We prove the gate itself here so the gating is real,
 * not asserted.
 *
 * `// @ana A0NN` tags map a test to the contract assertion it satisfies.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  BENCH_ENV_VAR,
  benchmarkEnabled,
  loadTask,
  listTaskIds,
  parseTask,
  runArm,
  renderTable,
} from './harness.js';
import { scoreTranscript, renderMetricsRow, type Arm, type MetricsRow } from './scorer.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const TASK_ID = 'proof-history-touch-gate';
const BARE = path.join(FIXTURES, 'bare-claude.jsonl');
const EDIT = path.join(FIXTURES, 'edit-claude.jsonl');

/** The scorer source, read once for the import-hygiene assertions (A004/A036/A037). */
const SCORER_SOURCE = fs.readFileSync(path.join(import.meta.dirname, 'scorer.ts'), 'utf-8');

/** Score the BARE fixture as the read-only task; narrow to the row or fail. */
function bareRow(): MetricsRow {
  const result = runArm(loadTask(TASK_ID)!, 'bare', BARE);
  expect(result.outcome).toBe('scored');
  if (result.outcome !== 'scored') throw new Error('expected scored');
  return result.row;
}

/** Score the EDIT fixture as an edit task (readOnly overridden to false). */
function editRow(): MetricsRow {
  const editTask = { ...loadTask(TASK_ID)!, readOnly: false };
  const result = scoreTranscript(EDIT, editTask, 'bare');
  expect(result.outcome).toBe('scored');
  if (result.outcome !== 'scored') throw new Error('expected scored');
  return result.row;
}

describe('benchmarkEnabled — the CI gate', () => {
  // @ana A001
  it('is OFF when the env var is unset', () => {
    expect(benchmarkEnabled({})).toBe(false);
  });

  // @ana A003
  it('is OFF for any value other than exactly "1"', () => {
    expect(benchmarkEnabled({ [BENCH_ENV_VAR]: '0' })).toBe(false);
    expect(benchmarkEnabled({ [BENCH_ENV_VAR]: 'true' })).toBe(false);
    expect(benchmarkEnabled({ [BENCH_ENV_VAR]: '' })).toBe(false);
  });

  // @ana A002
  it('is ON only when the env var is exactly "1"', () => {
    expect(benchmarkEnabled({ [BENCH_ENV_VAR]: '1' })).toBe(true);
  });
});

describe('scorer imports resolve only to shipped surfaces', () => {
  // @ana A004
  it('never depends on the never-deploy branch it was ported from', () => {
    expect(SCORER_SOURCE).not.toContain('devday-scan');
  });
});

describe('task loading', () => {
  // @ana A005
  it('loads the fixed proof-history task with its pinned commit and relevant set', () => {
    const task = loadTask(TASK_ID);
    expect(task).not.toBeNull();
    expect(task!.id).toBe(TASK_ID);
    expect(task!.pinnedCommit).toBe('9e438085678b03339a5a25d2eabe07b23dcdaaab');
    expect(task!.readOnly).toBe(true);
    expect(task!.relevantFiles).toEqual([
      'src/engine/analyzers/proof-history/index.ts',
      'src/types/proof.ts',
      'src/utils/proofSummary.ts',
    ]);
    expect(task!.relevantFiles.length).toBe(3);
  });

  it('lists the fixed task id', () => {
    expect(listTaskIds()).toContain(TASK_ID);
  });

  // @ana A006
  it('returns null for an absent task (never throws)', () => {
    expect(loadTask('no-such-task')).toBeNull();
  });

  it('rejects a malformed task shape (missing relevantFiles)', () => {
    expect(parseTask({ id: 'x', prompt: 'p', pinnedCommit: 'c' })).toBeNull();
  });

  it('rejects a task with an empty relevant set', () => {
    expect(parseTask({ id: 'x', prompt: 'p', pinnedCommit: 'c', relevantFiles: [] })).toBeNull();
  });

  it('rejects a non-object task', () => {
    expect(parseTask('nope')).toBeNull();
    expect(parseTask(null)).toBeNull();
  });
});

describe('BARE arm — mechanical scoring of a real transcript', () => {
  const task = loadTask(TASK_ID)!;

  // @ana A007, A008, A009, A010, A011
  it('produces a scored metrics row with exact counts', () => {
    const result = runArm(task, 'bare', BARE);
    expect(result.outcome).toBe('scored');
    if (result.outcome !== 'scored') return; // narrow for TS; assertion above is the gate

    const row = result.row;
    // The BARE fixture opens 5 distinct files: work.ts, commands/proof.ts,
    // proofSummary.ts, scan-engine.ts, proof-history/index.ts.
    expect(row.distinctFilesRead).toBe(5);
    // 3 of those are NOT in the relevant set (work.ts, commands/proof.ts,
    // scan-engine.ts). commands/proof.ts must NOT match the relevant
    // src/types/proof.ts — ranking is by full relative path, not basename.
    expect(row.wrongFileReads).toBe(3);
    // 1 Bash + 5 Read tool_uses = 6 total tool calls (from forensics derive).
    expect(row.toolCalls).toBe(6);
    // read-only task ⇒ tokens-to-first-correct-edit is intentionally null.
    expect(row.tokensToFirstCorrectEdit).toBeNull();
    expect(row.model).toBe('claude-opus-4-8');
    expect(row.arm).toBe('bare');
  });

  it('renders the BARE row as a stable table line', () => {
    const result = runArm(task, 'bare', BARE);
    expect(result.outcome).toBe('scored');
    if (result.outcome !== 'scored') return;
    expect(renderMetricsRow(result.row)).toBe('BARE | 5 files | 3 wrong | 6 tools | n/a tok');
  });

  it('renders a benchmark table for the demo', () => {
    const result = runArm(task, 'bare', BARE);
    expect(result.outcome).toBe('scored');
    if (result.outcome !== 'scored') return;
    const table = renderTable([result.row]);
    expect(table).toContain(`task=${TASK_ID}`);
    expect(table).toContain('BARE | 5 files | 3 wrong | 6 tools | n/a tok');
  });
});

describe('cost — $/task via shipped computeCost', () => {
  // @ana A012
  it('carries a dollar cost computed from the shipped price table', () => {
    expect(bareRow().costUsd).toBe(0.12);
  });

  // @ana A013
  it('marks a known-model run as priced', () => {
    expect(bareRow().priced).toBe(true);
  });
});

describe('cost — unpriced models surface as unpriced, never $0', () => {
  // @ana A014
  it('marks an unknown model unpriced and omits the utilization ratio', () => {
    // Build a transcript identical to BARE but on a model not in the price
    // table. Fixed bytes ⇒ deterministic; only the tmp dir name is random.
    const bytes = fs.readFileSync(BARE, 'utf-8').replace(/claude-opus-4-8/g, 'totally-unknown-model-x');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ana-bench-'));
    const file = path.join(dir, 'unknown-model.jsonl');
    fs.writeFileSync(file, bytes);
    try {
      const result = scoreTranscript(file, loadTask(TASK_ID)!, 'bare');
      expect(result.outcome).toBe('scored');
      if (result.outcome !== 'scored') return;
      expect(result.row.priced).toBe(false);
      // analyze() omits the ratio for an unknown model ⇒ null, never guessed 0.
      expect(result.row.contextUtilization).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('reliability metrics — redundant reads', () => {
  // @ana A015
  it('reports zero wasteful repeat reads on the BARE fixture', () => {
    expect(bareRow().redundantReads).toBe(0);
  });

  // @ana A016
  it('reports a redundant-read ratio without dividing by zero', () => {
    expect(bareRow().redundantReadRatio).toBe(0);
  });
});

describe('reliability metrics — peak context tokens', () => {
  // @ana A017
  it('reports the root-lane peak context the agent held at once', () => {
    expect(bareRow().peakContextTokens).toBe(2900);
  });
});

describe('reliability metrics — context utilization ratio', () => {
  // @ana A018
  it('reports peak context as a real fraction of the model window', () => {
    expect(bareRow().contextUtilization).toBe(0.0145);
  });
});

describe('reliability metrics — cache-decomposed token columns', () => {
  // @ana A021
  it('reports fresh input tokens separated from output and cache', () => {
    expect(bareRow().inputTokens).toBe(16700);
    expect(bareRow().outputTokens).toBe(1460);
  });

  // @ana A022
  it('reports cache columns present and separated from fresh input/output', () => {
    expect(bareRow().cacheReadTokens).toBe(0);
    expect(bareRow().cacheCreateTokens).toBe(0);
  });
});

describe('reliability metrics — read-only task leaves edit metrics null', () => {
  // @ana A023
  it('blanks the to-first-edit metrics rather than fabricating them', () => {
    const row = bareRow();
    expect(row.tokensToFirstCorrectEdit).toBeNull();
    expect(row.turnsToResolution).toBeNull();
    expect(row.wallClockMsToFirstCorrectEdit).toBeNull();
  });
});

describe('reliability metrics — edit task to-first-correct-edit', () => {
  it('sums input+output tokens up to and including the editing turn', () => {
    // Turn 1: 1000+200, Turn 2 (the Edit of a relevant file): 500+100.
    // Running total through the editing turn = 1200 + 600 = 1800.
    expect(editRow().tokensToFirstCorrectEdit).toBe(1800);
  });

  // @ana A020
  it('reports how many turns it took to reach the first correct edit', () => {
    expect(editRow().turnsToResolution).toBe(2);
  });

  // @ana A019
  it('reports the wall-clock ms to the first correct edit', () => {
    expect(editRow().wallClockMsToFirstCorrectEdit).toBe(10000);
  });

  it('emits the full structured edit-task row with exact values', () => {
    const row = editRow();
    expect(row.distinctFilesRead).toBe(1);
    expect(row.wrongFileReads).toBe(0);
    expect(row.redundantReads).toBe(0);
    expect(row.toolCalls).toBe(2);
    expect(row.turns).toBe(3);
    expect(row.durationMs).toBe(20000);
    expect(row.inputTokens).toBe(1900);
    expect(row.outputTokens).toBe(380);
    expect(row.peakContextTokens).toBe(1000);
    expect(row.contextUtilization).toBe(0.005);
    expect(row.costUsd).toBe(0.019);
    expect(row.priced).toBe(true);
  });

  it('treats a never-edited edit task as a real (poor) scored result, not abstain', () => {
    // The BARE fixture only reads, never edits → null edit metrics on an edit
    // task. Still `scored` (a real poor result), never an abstain.
    const editTask = { ...loadTask(TASK_ID)!, readOnly: false };
    const result = scoreTranscript(BARE, editTask, 'bare');
    expect(result.outcome).toBe('scored');
    if (result.outcome !== 'scored') return;
    expect(result.row.tokensToFirstCorrectEdit).toBeNull();
    expect(result.row.turnsToResolution).toBeNull();
    expect(result.row.wallClockMsToFirstCorrectEdit).toBeNull();
  });
});

describe('Arm widening — a third arm scores without a type rewrite', () => {
  // @ana A035
  it('accepts a future arm and carries it through to the row', () => {
    const arm: Arm = 'context-only';
    const result = scoreTranscript(BARE, loadTask(TASK_ID)!, arm);
    expect(result.outcome).toBe('scored');
    if (result.outcome !== 'scored') return;
    expect(result.row.arm).toBe('context-only');
  });
});

describe('AC7 — no best-effort field leakage in the scorer', () => {
  // @ana A036
  it('never reads the best-effort tests_executed count', () => {
    expect(SCORER_SOURCE).not.toContain('tests_executed');
  });

  // @ana A037
  it('never reads the best-effort files_touched count', () => {
    expect(SCORER_SOURCE).not.toContain('files_touched');
  });
});

describe('abstain-on-unknown (trinary, never fabricate)', () => {
  const task = loadTask(TASK_ID)!;

  // @ana A024
  it('abstains with a reason when the transcript is unreadable', () => {
    const result = runArm(task, 'bare', path.join(FIXTURES, 'does-not-exist.jsonl'));
    expect(result.outcome).toBe('abstain');
    if (result.outcome !== 'abstain') return;
    expect(result.reason).toContain('unreadable');
  });

  // @ana A025
  it('abstains when the transcript parses to zero lines (no evidence)', () => {
    const result = runArm(task, 'bare', path.join(FIXTURES, 'empty.jsonl'));
    expect(result.outcome).toBe('abstain');
    if (result.outcome !== 'abstain') return;
    expect(result.reason).toContain('zero lines');
  });

  // @ana A026
  it('abstains for an unknown harness rather than scoring', () => {
    const result = runArm(task, 'bare', BARE, 'gemini');
    expect(result.outcome).toBe('abstain');
    if (result.outcome !== 'abstain') return;
    expect(result.reason).toContain('unknown harness');
  });

  it('abstains for codex transcripts (localization scoring not implemented)', () => {
    const result = runArm(task, 'bare', BARE, 'codex');
    expect(result.outcome).toBe('abstain');
    if (result.outcome !== 'abstain') return;
    expect(result.reason).toContain('codex');
  });
});

describe('determinism', () => {
  it('scores the same transcript byte-identically twice', () => {
    const task = loadTask(TASK_ID)!;
    const a = runArm(task, 'bare', BARE);
    const b = runArm(task, 'bare', BARE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('keeps the row shape stable across arms', () => {
    const task = loadTask(TASK_ID)!;
    const scan = runArm(task, 'scan', BARE);
    expect(scan.outcome).toBe('scored');
    if (scan.outcome !== 'scored') return;
    const keys: Array<keyof MetricsRow> = [
      'taskId',
      'arm',
      'distinctFilesRead',
      'wrongFileReads',
      'redundantReads',
      'redundantReadRatio',
      'tokensToFirstCorrectEdit',
      'turnsToResolution',
      'wallClockMsToFirstCorrectEdit',
      'toolCalls',
      'turns',
      'durationMs',
      'inputTokens',
      'outputTokens',
      'cacheCreateTokens',
      'cacheReadTokens',
      'peakContextTokens',
      'contextUtilization',
      'costUsd',
      'priced',
      'model',
    ];
    for (const k of keys) expect(scan.row[k]).toBeDefined();
    expect(scan.row.arm).toBe('scan');
  });
});
