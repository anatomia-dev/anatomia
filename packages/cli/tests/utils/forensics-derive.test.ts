/**
 * Tests for the Phase-2 transcript derive (deriveTranscript, updateSessionRecord).
 *
 * Determinism is a hard contract (AC8): same transcript bytes → byte-identical
 * output. Token usage is deduped by requestId (Claude) or taken from the last
 * cumulative total (Codex). No raw transcript body is ever carried into the
 * derived counts (AC12). Fixtures are inline + trimmed (no message bodies beyond
 * what each assertion needs).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  deriveTranscript,
  updateSessionRecord,
  appendSessionRecord,
  getForensicsBufferPath,
  type SessionRecord,
  type ProvenanceCounts,
} from '../../src/utils/forensics.js';

/** A sentinel that must NEVER appear in derived output (AC12 no-raw-body). */
const SECRET_BODY = 'SECRET_TRANSCRIPT_BODY_DO_NOT_PERSIST';

/** Build a Claude transcript fixture with a duplicated requestId for dedup coverage. */
function claudeFixture(): string {
  const lines = [
    {
      type: 'assistant',
      requestId: 'req_A',
      timestamp: '2026-06-01T00:00:00.000Z',
      message: {
        model: 'claude-opus-4-6',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 200,
        },
        content: [
          { type: 'text', text: SECRET_BODY },
          { type: 'tool_use', name: 'Bash', input: { command: 'pnpm test' } },
          { type: 'tool_use', name: 'Write', input: { file_path: '/proj/a.ts' } },
        ],
      },
    },
    {
      // Duplicate requestId — usage must be counted ONCE.
      type: 'assistant',
      requestId: 'req_A',
      timestamp: '2026-06-01T00:00:10.000Z',
      message: {
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
        model: 'claude-opus-4-6',
        usage: {
          input_tokens: 500,
          output_tokens: 300,
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 100,
        },
        content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/proj/b.ts' } }],
      },
    },
    {
      type: 'user',
      timestamp: '2026-06-01T00:00:21.000Z',
      message: {
        content: [{ type: 'tool_result', content: 'Tests 10 passed, 2 failed' }],
      },
    },
  ];
  // Include a malformed line — must be skipped, never throw.
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n{ this is not json\n';
}

/** Build a Codex rollout fixture (model on turn_context; cumulative token_count). */
function codexFixture(): string {
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
    { type: 'response_item', timestamp: '2026-06-01T00:00:05.000Z', payload: { type: 'function_call', name: 'shell' } },
    { type: 'response_item', timestamp: '2026-06-01T00:00:06.000Z', payload: { type: 'custom_tool_call', name: 'apply_patch' } },
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
    it('sums input tokens across requestIds', () => {
      // @ana A023
      const d = deriveTranscript(writeFixture('claude.jsonl', claudeFixture()), 'claude');
      expect(d?.tokens.input).toBe(1500);
    });

    it('dedupes token usage by requestId (output counted once per request)', () => {
      // @ana A024
      const d = deriveTranscript(writeFixture('claude.jsonl', claudeFixture()), 'claude');
      expect(d?.tokens.output).toBe(800);
    });

    it('extracts the session model', () => {
      // @ana A025
      const d = deriveTranscript(writeFixture('claude.jsonl', claudeFixture()), 'claude');
      expect(d?.model).toBe('claude-opus-4-6');
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
      // cost = 1500/1e6*15 + 800/1e6*75 + 150/1e6*18.75 + 300/1e6*1.5 = 0.0857625,
      // rounded to 6 dp = 0.085763.
      expect(d.cost_usd).toBe(0.085763);
    });

    it('parses best-effort test counts from tool results', () => {
      const d = deriveTranscript(writeFixture('claude.jsonl', claudeFixture()), 'claude') as ProvenanceCounts;
      expect(d.tests_executed).toBe(12);
      expect(d.failures_encountered).toBe(2);
    });

    it('is deterministic — deriving twice yields JSON-identical output', () => {
      // @ana A026
      const p = writeFixture('claude.jsonl', claudeFixture());
      const a = deriveTranscript(p, 'claude');
      const b = deriveTranscript(p, 'claude');
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('never carries raw transcript body into the derived counts', () => {
      // @ana A035
      const d = deriveTranscript(writeFixture('claude.jsonl', claudeFixture()), 'claude');
      expect(JSON.stringify(d)).not.toContain(SECRET_BODY);
    });
  });

  describe('deriveTranscript — Codex', () => {
    it('reads the model from turn_context, not the null session_meta model', () => {
      // @ana A025
      const d = deriveTranscript(writeFixture('codex.jsonl', codexFixture()), 'codex');
      expect(d?.model).toBe('gpt-5.5');
    });

    it('takes the last cumulative total_token_usage (does not sum)', () => {
      // @ana A023, A024
      const d = deriveTranscript(writeFixture('codex.jsonl', codexFixture()), 'codex') as ProvenanceCounts;
      expect(d.tokens.input).toBe(300);
      expect(d.tokens.output).toBe(120);
      expect(d.tokens.cache_read).toBe(80);
      expect(d.tokens.cache_create).toBe(0);
    });

    it('counts assistant turns and tool calls', () => {
      const d = deriveTranscript(writeFixture('codex.jsonl', codexFixture()), 'codex') as ProvenanceCounts;
      expect(d.turns).toBe(2);
      expect(d.tool_calls).toBe(2);
      expect(d.commands_run).toBe(1);
      expect(d.duration_ms).toBe(30000);
    });

    it('is deterministic for Codex too', () => {
      // @ana A026
      const p = writeFixture('codex.jsonl', codexFixture());
      expect(JSON.stringify(deriveTranscript(p, 'codex'))).toBe(
        JSON.stringify(deriveTranscript(p, 'codex')),
      );
    });

    it('never carries raw transcript body into the derived counts', () => {
      // @ana A035
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
      expect(d.cost_usd).toBe(0);
    });
  });

  describe('updateSessionRecord', () => {
    /** A minimal valid SessionRecord for buffer seeding. */
    function record(sessionId: string): SessionRecord {
      return {
        session_id: sessionId,
        transcript_path: '/t.jsonl',
        harness: 'claude',
        harness_version: '',
        role: 'think',
        slug: '',
        model: 'claude-opus-4-6',
        agent_def_hash: '',
        cli_version: '',
        cwd: '/proj',
        source: 'startup',
        os: 'darwin',
        node: 'v20',
        timestamp: '2026-06-01T00:00:00.000Z',
      };
    }

    const derived: ProvenanceCounts = {
      tokens: { input: 1500, output: 800, cache_create: 150, cache_read: 300 },
      cost_usd: 0.0857625,
      price_table_version: '2026-06-01',
      duration_ms: 20000,
      turns: 3,
      tool_calls: 3,
      commands_run: 1,
      tests_executed: 12,
      failures_encountered: 2,
      files_touched: 2,
      model: 'claude-opus-4-6',
    };

    it('writes derived counts back into the matching record', () => {
      // @ana A034
      appendSessionRecord(record('sess-1'));
      appendSessionRecord(record('sess-2'));
      const ok = updateSessionRecord('sess-2', derived);
      expect(ok).toBe(true);

      const lines = fs.readFileSync(getForensicsBufferPath(), 'utf-8').trim().split('\n');
      const parsed = lines.map((l) => JSON.parse(l) as SessionRecord);
      const target = parsed.find((r) => r.session_id === 'sess-2');
      const other = parsed.find((r) => r.session_id === 'sess-1');
      expect(target?.derived).toEqual(derived);
      // The other record is left untouched.
      expect(other?.derived).toBeUndefined();
    });

    it('returns false when no record matches (no throw, no write)', () => {
      // @ana A034
      appendSessionRecord(record('sess-1'));
      expect(updateSessionRecord('absent', derived)).toBe(false);
    });

    it('returns false when the buffer does not exist', () => {
      expect(updateSessionRecord('sess-1', derived)).toBe(false);
    });
  });
});
