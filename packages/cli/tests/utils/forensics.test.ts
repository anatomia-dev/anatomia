/**
 * Tests for the forensics capture utilities (Phase 1).
 *
 * Covers buildSessionRecord (happy path + clean degrade), appendSessionRecord
 * (atomic append, dir creation, concurrency-tolerant), isProcessCaptureEnabled
 * (the gate read), parseHookPayload, and getForensicsBufferPath.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildSessionRecord,
  appendSessionRecord,
  isProcessCaptureEnabled,
  getForensicsBufferPath,
  parseHookPayload,
  type HookPayload,
} from '../../src/utils/forensics.js';

describe('forensics', () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let projectDir: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-home-'));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-proj-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpHome;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  /** Write a project ana.json with the given fields. */
  function writeAnaJson(content: unknown): void {
    const anaDir = path.join(projectDir, '.ana');
    fs.mkdirSync(anaDir, { recursive: true });
    fs.writeFileSync(path.join(anaDir, 'ana.json'), typeof content === 'string' ? content : JSON.stringify(content));
  }

  describe('getForensicsBufferPath', () => {
    it('resolves to ~/.ana/forensics/sessions.jsonl under HOME', () => {
      expect(getForensicsBufferPath()).toBe(path.join(tmpHome, '.ana', 'forensics', 'sessions.jsonl'));
    });
  });

  describe('parseHookPayload', () => {
    it('parses a valid payload, copying only string fields', () => {
      const raw = JSON.stringify({
        session_id: 's1',
        transcript_path: '/t.jsonl',
        cwd: '/proj',
        source: 'startup',
        model: 'claude-opus-4-6',
        agent_type: 'ana',
        extra: 123,
      });
      const p = parseHookPayload(raw);
      expect(p.session_id).toBe('s1');
      expect(p.transcript_path).toBe('/t.jsonl');
      expect(p.source).toBe('startup');
      expect((p as Record<string, unknown>)['extra']).toBeUndefined();
    });

    it('returns {} on malformed JSON', () => {
      expect(parseHookPayload('not json {')).toEqual({});
    });

    it('returns {} on empty stdin', () => {
      expect(parseHookPayload('')).toEqual({});
    });

    it('returns {} on a JSON non-object (array, number)', () => {
      expect(parseHookPayload('[1,2,3]')).toEqual({});
      expect(parseHookPayload('42')).toEqual({});
    });
  });

  describe('buildSessionRecord', () => {
    // @ana A008, A009
    it('builds a full record from env + payload (happy path)', () => {
      const env = {
        ANA_HARNESS: 'claude',
        ANA_ROLE: 'build',
        ANA_SLUG: 'session-capture',
        ANA_CLI_VERSION: '1.2.2',
        ANA_AGENT_DEF_HASH: 'sha256:abc123',
        PATH: '/usr/bin',
      };
      const payload: HookPayload = {
        session_id: '0a2f6d97',
        transcript_path: '/tmp/fixture/transcript.jsonl',
        cwd: '/proj/.ana/worktrees/session-capture',
        source: 'startup',
        model: 'claude-opus-4-6',
      };
      const rec = buildSessionRecord(env, payload);

      // A008: session_id present
      expect(rec.session_id).toBe('0a2f6d97');
      // A009: transcript_path verbatim from payload
      expect(rec.transcript_path).toBe('/tmp/fixture/transcript.jsonl');
      expect(rec.harness).toBe('claude');
      expect(rec.role).toBe('build');
      expect(rec.slug).toBe('session-capture');
      expect(rec.model).toBe('claude-opus-4-6');
      expect(rec.agent_def_hash).toBe('sha256:abc123');
      expect(rec.cli_version).toBe('1.2.2');
      expect(rec.cwd).toBe('/proj/.ana/worktrees/session-capture');
      expect(rec.source).toBe('startup');
      expect(rec.os).toBe(os.platform());
      expect(rec.node).toBe(process.version);
      expect(typeof rec.timestamp).toBe('string');
      expect(rec.timestamp).not.toBe('');
    });

    // @ana A009
    it('records transcript_path verbatim even when empty (Codex SessionStart)', () => {
      const rec = buildSessionRecord({ ANA_HARNESS: 'codex' }, { session_id: 'x' });
      expect(rec.transcript_path).toBe('');
    });

    // @ana A014, A015
    it('clean degrade: direct launch with no ANA_* env falls back to agent_type', () => {
      // No ANA_* env — simulates a direct `claude --agent ana` launch.
      const env: Record<string, string | undefined> = {};
      const payload: HookPayload = {
        session_id: 'direct',
        transcript_path: '/t.jsonl',
        agent_type: 'ana',
        model: 'claude-opus-4-6',
      };
      const rec = buildSessionRecord(env, payload);

      // A014: role falls back to payload agent_type
      expect(rec.role).toBe('ana');
      // A015: empty slug, not dropped
      expect(rec.slug).toBe('');
      // harness defaults to claude
      expect(rec.harness).toBe('claude');
      expect(rec.cli_version).toBe('');
      expect(rec.agent_def_hash).toBe('');
    });
  });

  describe('appendSessionRecord', () => {
    function makeRecord(sessionId: string): ReturnType<typeof buildSessionRecord> {
      return buildSessionRecord({ ANA_HARNESS: 'claude', ANA_ROLE: 'build' }, { session_id: sessionId });
    }

    // @ana A010
    it('writes exactly one line for one record, creating the dir', () => {
      const bufferPath = getForensicsBufferPath();
      expect(fs.existsSync(path.dirname(bufferPath))).toBe(false);

      appendSessionRecord(makeRecord('s1'));

      expect(fs.existsSync(bufferPath)).toBe(true);
      const lines = fs.readFileSync(bufferPath, 'utf-8').trim().split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!).session_id).toBe('s1');
    });

    it('appends a second line on a second call (concurrency-tolerant)', () => {
      appendSessionRecord(makeRecord('s1'));
      appendSessionRecord(makeRecord('s2'));

      const lines = fs.readFileSync(getForensicsBufferPath(), 'utf-8').trim().split('\n').filter(Boolean);
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!).session_id).toBe('s1');
      expect(JSON.parse(lines[1]!).session_id).toBe('s2');
    });
  });

  describe('isProcessCaptureEnabled', () => {
    // @ana A016
    it('returns true when processCapture is on', () => {
      writeAnaJson({ name: 'x', processCapture: 'on' });
      expect(isProcessCaptureEnabled(projectDir)).toBe(true);
    });

    it('returns false when processCapture is off', () => {
      writeAnaJson({ name: 'x', processCapture: 'off' });
      expect(isProcessCaptureEnabled(projectDir)).toBe(false);
    });

    it('returns false when processCapture is absent', () => {
      writeAnaJson({ name: 'x' });
      expect(isProcessCaptureEnabled(projectDir)).toBe(false);
    });

    // @ana A017
    it('returns false on malformed ana.json', () => {
      writeAnaJson('{ not valid json');
      expect(isProcessCaptureEnabled(projectDir)).toBe(false);
    });

    it('returns false when ana.json is missing entirely', () => {
      // projectDir has no .ana — fail-safe to false
      expect(isProcessCaptureEnabled(projectDir)).toBe(false);
    });
  });
});
