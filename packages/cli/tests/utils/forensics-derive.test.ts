/**
 * Tests for the deterministic transcript derive (deriveTranscript).
 *
 * The derive is delegated to `anatrace-core` (parseSession + deriveCounts); these
 * tests assert the INVARIANTS Anatomia depends on, re-baselined against core:
 *  - determinism: same bytes → `JSON.stringify`-identical output;
 *  - no raw transcript body ever escapes into the derived counts;
 *  - `derive_version === "3"` and `price_table_version === "2026-06-08"` stamps;
 *  - Codex `files_touched` is derived from a real `apply_patch` body (> 0);
 *  - no baked-in `cost_usd` (cost is a display-time estimate in capture v2).
 *
 * Fixtures carry the fields a real transcript carries — Claude lines have a
 * `message.id` (core dedups token usage by message id) and `tool_use_id`-linked
 * tool results (core only counts test output behind a command tool); Codex
 * rollouts carry a `patch_apply_end` event (core derives `files_touched` from it)
 * and an `exec_command` call. With those, core reproduces the prior derive's
 * counts. Where core genuinely re-baselines a number, the assertion notes the
 * old → new value (see the Codex block).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  deriveTranscript,
  type ProvenanceCounts,
} from '../../src/utils/forensics.js';

/** A sentinel that must NEVER appear in derived output (A009 no-raw-body). */
const SECRET_BODY = 'SECRET_TRANSCRIPT_BODY_DO_NOT_PERSIST';

/**
 * Build a Claude transcript fixture.
 *
 * Two lines share `message.id` (`msg_1`) so core dedups their token usage exactly
 * once; a third (`msg_2`) adds a second request. The Bash tool_use carries an id
 * that the trailing tool_result references via `tool_use_id`, so core attributes
 * the "N passed / N failed" output to a command tool (its test-count gate).
 */
function claudeFixture(): string {
  const lines = [
    {
      type: 'assistant',
      requestId: 'req_A',
      timestamp: '2026-06-01T00:00:00.000Z',
      message: {
        id: 'msg_1',
        model: 'claude-opus-4-6',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 200,
        },
        content: [
          { type: 'text', text: SECRET_BODY },
          { type: 'tool_use', id: 'tu_bash', name: 'Bash', input: { command: 'pnpm test' } },
          { type: 'tool_use', id: 'tu_write', name: 'Write', input: { file_path: '/proj/a.ts' } },
        ],
      },
    },
    {
      // Duplicate message.id — usage must be counted ONCE (core dedups by id).
      type: 'assistant',
      requestId: 'req_A',
      timestamp: '2026-06-01T00:00:10.000Z',
      message: {
        id: 'msg_1',
        model: 'claude-opus-4-6',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 200,
        },
        content: [],
      },
    },
    {
      type: 'assistant',
      requestId: 'req_B',
      timestamp: '2026-06-01T00:00:20.000Z',
      message: {
        id: 'msg_2',
        model: 'claude-opus-4-6',
        usage: {
          input_tokens: 500,
          output_tokens: 300,
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 100,
        },
        content: [{ type: 'tool_use', id: 'tu_read', name: 'Read', input: { file_path: '/proj/b.ts' } }],
      },
    },
    {
      type: 'user',
      timestamp: '2026-06-01T00:00:21.000Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tu_bash', content: 'Tests 10 passed, 2 failed' }],
      },
    },
  ];
  // Include a malformed line — must be skipped, never throw.
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n{ this is not json\n';
}

/**
 * Build a Codex rollout fixture.
 *
 * Model is on `turn_context` (session_meta's is null); token usage is the LAST
 * cumulative `token_count` total (not summed). An `exec_command` call with a
 * `call_id`-linked output carries the test counts; a `custom_tool_call`
 * (`apply_patch`) plus a `patch_apply_end` event give core a real edit to count
 * (`files_touched`).
 */
function codexFixture(): string {
  const patchEnd = {
    type: 'event_msg',
    timestamp: '2026-06-01T00:00:08.000Z',
    payload: {
      type: 'patch_apply_end',
      changes: { '/proj/src/foo.ts': { type: 'update' } },
    },
  };
  const lines = [
    {
      type: 'session_meta',
      timestamp: '2026-06-01T00:00:00.000Z',
      payload: { id: 'codex-uuid-1', model: null, cwd: '/proj' },
    },
    {
      type: 'turn_context',
      timestamp: '2026-06-01T00:00:01.000Z',
      payload: { turn_id: 't1', model: 'gpt-5.5' },
    },
    {
      type: 'event_msg',
      timestamp: '2026-06-01T00:00:02.000Z',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: 100, output_tokens: 50, cached_input_tokens: 20 } },
      },
    },
    {
      // Cumulative — this LATER total is the session total (not summed with the prior).
      type: 'event_msg',
      timestamp: '2026-06-01T00:00:30.000Z',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: 300, output_tokens: 120, cached_input_tokens: 80 } },
      },
    },
    { type: 'response_item', timestamp: '2026-06-01T00:00:03.000Z', payload: { type: 'message', role: 'assistant', content: SECRET_BODY } },
    { type: 'response_item', timestamp: '2026-06-01T00:00:04.000Z', payload: { type: 'message', role: 'assistant' } },
    { type: 'response_item', timestamp: '2026-06-01T00:00:05.000Z', payload: { type: 'function_call', name: 'exec_command', call_id: 'c1', arguments: '{"command":["bash","-lc","pnpm test"]}' } },
    { type: 'response_item', timestamp: '2026-06-01T00:00:06.000Z', payload: { type: 'function_call_output', call_id: 'c1', output: { content: 'Tests 10 passed, 2 failed' } } },
    { type: 'response_item', timestamp: '2026-06-01T00:00:07.000Z', payload: { type: 'custom_tool_call', name: 'apply_patch' } },
    patchEnd,
  ];
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

describe('forensics derive', () => {
  let tmpDir: string;
  let tmpHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'derive-'));
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'derive-home-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpHome;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  /** Write a fixture file and return its path. */
  function writeFixture(name: string, content: string): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, content, 'utf-8');
    return p;
  }

  describe('deriveTranscript — Claude', () => {
    it('sums input tokens across requests, deduped by message id', () => {
      // msg_1 (1000, counted once across its two lines) + msg_2 (500) = 1500.
      const d = deriveTranscript(writeFixture('claude.jsonl', claudeFixture()), 'claude');
      expect(d?.tokens.input).toBe(1500);
    });

    it('dedupes token usage by message id (output counted once per message)', () => {
      const d = deriveTranscript(writeFixture('claude.jsonl', claudeFixture()), 'claude');
      expect(d?.tokens.output).toBe(800);
    });

    it('extracts the session model', () => {
      const d = deriveTranscript(writeFixture('claude.jsonl', claudeFixture()), 'claude');
      expect(d?.model).toBe('claude-opus-4-6');
    });

    // @ana A003
    it('carries the core stamps (derive_version + price_table_version) but NEVER a cost_usd', () => {
      const d = deriveTranscript(writeFixture('claude.jsonl', claudeFixture()), 'claude') as ProvenanceCounts;
      // A003: each record states the engine derive version that produced it.
      expect(d.derive_version).toBe('3');
      // The version the display-time cost is computed against is present.
      expect(d.price_table_version).toBe('2026-06-08');
      // No baked-in dollar figure on the derived (committed) object.
      expect(JSON.stringify(d)).not.toContain('cost_usd');
      expect((d as unknown as Record<string, unknown>)['cost_usd']).toBeUndefined();
    });

    it('derives exact cache tokens, turns, tool/command counts, files, duration', () => {
      const d = deriveTranscript(writeFixture('claude.jsonl', claudeFixture()), 'claude') as ProvenanceCounts;
      expect(d.tokens.cache_create).toBe(150);
      expect(d.tokens.cache_read).toBe(300);
      expect(d.turns).toBe(3);
      expect(d.tool_calls).toBe(3);
      expect(d.commands_run).toBe(1);
      // Only the Write counts toward files_touched; the Read does not edit a file.
      expect(d.files_touched).toBe(1);
      // First line 00:00:00 → last line (the user tool_result) 00:00:21 = 21000ms.
      expect(d.duration_ms).toBe(21000);
    });

    it('parses best-effort test counts from a command tool result', () => {
      const d = deriveTranscript(writeFixture('claude.jsonl', claudeFixture()), 'claude') as ProvenanceCounts;
      expect(d.tests_executed).toBe(12);
      expect(d.failures_encountered).toBe(2);
    });

    // @ana A004
    it('is deterministic — deriving twice yields JSON-identical output', () => {
      const p = writeFixture('claude.jsonl', claudeFixture());
      const a = deriveTranscript(p, 'claude');
      const b = deriveTranscript(p, 'claude');
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    // @ana A009
    it('never carries raw transcript body into the derived counts', () => {
      const d = deriveTranscript(writeFixture('claude.jsonl', claudeFixture()), 'claude');
      expect(JSON.stringify(d)).not.toContain(SECRET_BODY);
    });
  });

  describe('deriveTranscript — Codex', () => {
    it('reads the model from turn_context, not the null session_meta model', () => {
      const d = deriveTranscript(writeFixture('codex.jsonl', codexFixture()), 'codex');
      expect(d?.model).toBe('gpt-5.5');
    });

    it('takes the last cumulative total, with cached subtracted from input (re-baseline: input 300 → 220)', () => {
      // Core reports FRESH input: gross input_tokens (300) minus cached_input (80)
      // = 220. The old hand-derive recorded the gross 300; core subtracts cache.
      const d = deriveTranscript(writeFixture('codex.jsonl', codexFixture()), 'codex') as ProvenanceCounts;
      expect(d.tokens.input).toBe(220);
      expect(d.tokens.output).toBe(120);
      expect(d.tokens.cache_read).toBe(80);
      expect(d.tokens.cache_create).toBe(0);
    });

    // @ana A003
    it('carries the core stamps but never cost_usd (Codex)', () => {
      const d = deriveTranscript(writeFixture('codex.jsonl', codexFixture()), 'codex') as ProvenanceCounts;
      expect(d.derive_version).toBe('3');
      expect(d.price_table_version).toBe('2026-06-08');
      expect((d as unknown as Record<string, unknown>)['cost_usd']).toBeUndefined();
    });

    it('counts assistant turns, tool calls, and the command (re-baseline: duration 30000 → 28000)', () => {
      // Duration spans the timestamped events core folds (first 00:00:02 →
      // last 00:00:30 = 28000ms), not the raw first/last line.
      const d = deriveTranscript(writeFixture('codex.jsonl', codexFixture()), 'codex') as ProvenanceCounts;
      expect(d.turns).toBe(2);
      expect(d.tool_calls).toBe(3); // exec_command + apply_patch tool + the patch edit
      expect(d.commands_run).toBe(1); // exec_command is a command tool
      expect(d.tests_executed).toBe(12);
      expect(d.failures_encountered).toBe(2);
      expect(d.duration_ms).toBe(28000);
    });

    // @ana A008
    it('derives files_touched from a real apply_patch body (no longer hardcoded 0)', () => {
      const d = deriveTranscript(writeFixture('codex.jsonl', codexFixture()), 'codex') as ProvenanceCounts;
      expect(d.files_touched).toBeGreaterThan(0);
      expect(d.files_touched).toBe(1); // the single patch_apply_end change
    });

    // @ana A004
    it('is deterministic for Codex too', () => {
      const p = writeFixture('codex.jsonl', codexFixture());
      expect(JSON.stringify(deriveTranscript(p, 'codex'))).toBe(
        JSON.stringify(deriveTranscript(p, 'codex')),
      );
    });

    // @ana A009
    it('never carries raw transcript body into the derived counts', () => {
      const d = deriveTranscript(writeFixture('codex.jsonl', codexFixture()), 'codex');
      expect(JSON.stringify(d)).not.toContain(SECRET_BODY);
    });
  });

  describe('deriveTranscript — edge cases', () => {
    it('returns null for a dangling/missing transcript path', () => {
      expect(deriveTranscript(path.join(tmpDir, 'nope.jsonl'), 'claude')).toBeNull();
    });

    it('returns zeroed counts for an empty transcript, never throws', () => {
      const d = deriveTranscript(writeFixture('empty.jsonl', ''), 'claude') as ProvenanceCounts;
      expect(d.tokens.input).toBe(0);
      expect(d.turns).toBe(0);
      expect(d.model).toBe('');
      expect(d.derive_version).toBe('3');
      expect(d.price_table_version).toBe('2026-06-08');
    });
  });
});
