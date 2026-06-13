/**
 * Prove-it benchmark harness — unit tests (Slice 4).
 *
 * These tests verify the MECHANISM (gate, task loading, mechanical scoring,
 * abstain-on-unknown) against committed fixtures. They are hermetic and fast, so
 * they run on every `pnpm test` — what is "out of default CI" is the
 * agent-RUN suite (producing live transcripts), gated behind `ANA_BENCH=1` via
 * {@link benchmarkEnabled}. We prove the gate itself here so the gating is real,
 * not asserted.
 *
 * Slice-4 deliverable lands here: one fixed localization task + the BARE arm
 * producing a real, mechanically scored metrics row, plus an abstain when a
 * transcript cannot be parsed.
 */

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
import { scoreTranscript, renderMetricsRow, type MetricsRow } from './scorer.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const TASK_ID = 'proof-history-touch-gate';

describe('benchmarkEnabled — the CI gate', () => {
  it('is OFF when the env var is unset', () => {
    expect(benchmarkEnabled({})).toBe(false);
  });

  it('is OFF for any value other than exactly "1"', () => {
    expect(benchmarkEnabled({ [BENCH_ENV_VAR]: '0' })).toBe(false);
    expect(benchmarkEnabled({ [BENCH_ENV_VAR]: 'true' })).toBe(false);
    expect(benchmarkEnabled({ [BENCH_ENV_VAR]: '' })).toBe(false);
  });

  it('is ON only when the env var is exactly "1"', () => {
    expect(benchmarkEnabled({ [BENCH_ENV_VAR]: '1' })).toBe(true);
  });
});

describe('task loading', () => {
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
  });

  it('lists the fixed task id', () => {
    expect(listTaskIds()).toContain(TASK_ID);
  });

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
  const transcript = path.join(FIXTURES, 'bare-claude.jsonl');

  it('produces a scored metrics row with exact counts', () => {
    const result = runArm(task, 'bare', transcript);
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
    const result = runArm(task, 'bare', transcript);
    expect(result.outcome).toBe('scored');
    if (result.outcome !== 'scored') return;
    expect(renderMetricsRow(result.row)).toBe('BARE | 5 files | 3 wrong | 6 tools | n/a tok');
  });

  it('renders a benchmark table for the demo', () => {
    const result = runArm(task, 'bare', transcript);
    expect(result.outcome).toBe('scored');
    if (result.outcome !== 'scored') return;
    const table = renderTable([result.row]);
    expect(table).toContain(`task=${TASK_ID}`);
    expect(table).toContain('BARE | 5 files | 3 wrong | 6 tools | n/a tok');
  });
});

describe('tokens-to-first-correct-edit (edit task)', () => {
  it('reports the running token total at the first relevant edit', () => {
    // Same fixture but treated as an edit task: the fixture never edits, only
    // reads, so there is no correct edit → null (a real, poor result, still
    // scored — null here means "never reached the fix", NOT abstain).
    const editTask = { ...loadTask(TASK_ID)!, readOnly: false };
    const result = scoreTranscript(path.join(FIXTURES, 'bare-claude.jsonl'), editTask, 'bare');
    expect(result.outcome).toBe('scored');
    if (result.outcome !== 'scored') return;
    expect(result.row.tokensToFirstCorrectEdit).toBeNull();
  });

  it('sums input+output tokens up to and including the editing turn', () => {
    const editTask = { ...loadTask(TASK_ID)!, readOnly: false };
    const result = scoreTranscript(path.join(FIXTURES, 'edit-claude.jsonl'), editTask, 'bare');
    expect(result.outcome).toBe('scored');
    if (result.outcome !== 'scored') return;
    // Turn 1: 1000+200, Turn 2 (the Edit of a relevant file): 500+100.
    // Running total through the editing turn = 1200 + 600 = 1800.
    expect(result.row.tokensToFirstCorrectEdit).toBe(1800);
  });
});

describe('abstain-on-unknown (trinary, never fabricate)', () => {
  const task = loadTask(TASK_ID)!;

  it('abstains with a reason when the transcript is unreadable', () => {
    const result = runArm(task, 'bare', path.join(FIXTURES, 'does-not-exist.jsonl'));
    expect(result.outcome).toBe('abstain');
    if (result.outcome !== 'abstain') return;
    expect(result.reason).toContain('unreadable');
  });

  it('abstains when the transcript parses to zero lines (no evidence)', () => {
    const result = runArm(task, 'bare', path.join(FIXTURES, 'empty.jsonl'));
    expect(result.outcome).toBe('abstain');
    if (result.outcome !== 'abstain') return;
    expect(result.reason).toContain('zero lines');
  });

  it('abstains for an unknown harness rather than scoring', () => {
    const result = runArm(task, 'bare', path.join(FIXTURES, 'bare-claude.jsonl'), 'gemini');
    expect(result.outcome).toBe('abstain');
    if (result.outcome !== 'abstain') return;
    expect(result.reason).toContain('unknown harness');
  });

  it('abstains for codex transcripts (localization scoring not implemented)', () => {
    const result = runArm(task, 'bare', path.join(FIXTURES, 'bare-claude.jsonl'), 'codex');
    expect(result.outcome).toBe('abstain');
    if (result.outcome !== 'abstain') return;
    expect(result.reason).toContain('codex');
  });
});

describe('determinism', () => {
  it('scores the same transcript byte-identically twice', () => {
    const task = loadTask(TASK_ID)!;
    const a = runArm(task, 'bare', path.join(FIXTURES, 'bare-claude.jsonl'));
    const b = runArm(task, 'bare', path.join(FIXTURES, 'bare-claude.jsonl'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('keeps the row shape stable across arms', () => {
    const task = loadTask(TASK_ID)!;
    const scan = runArm(task, 'scan', path.join(FIXTURES, 'bare-claude.jsonl'));
    expect(scan.outcome).toBe('scored');
    if (scan.outcome !== 'scored') return;
    const keys: Array<keyof MetricsRow> = [
      'taskId',
      'arm',
      'distinctFilesRead',
      'wrongFileReads',
      'toolCalls',
      'tokensToFirstCorrectEdit',
      'model',
    ];
    for (const k of keys) expect(scan.row[k]).toBeDefined();
    expect(scan.row.arm).toBe('scan');
  });
});
