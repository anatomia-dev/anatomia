/**
 * Tests for the forensics capture utilities (capture v2).
 *
 * Capture v2 replaces the home-global buffer with two layers:
 *  - a transient pending POINTER (`writePendingPointer`/`readPendingPointer`/
 *    `deletePendingPointer`/`prunePendingPointers`) keyed by ANA_RUN_ID, and
 *  - `captureProvenanceAtSave`, which derives counts and writes a self-contained
 *    `provenance/{role}-{session_id}.json` into the work item at save time.
 *
 * The old buffer API (getForensicsBufferPath/appendSessionRecord/…) is gone.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getPendingDir,
  writePendingPointer,
  readPendingPointer,
  deletePendingPointer,
  prunePendingPointers,
  captureProvenanceAtSave,
  isProcessCaptureEnabled,
  parseHookPayload,
  type PendingPointer,
} from '../../src/utils/forensics.js';
import * as forensics from '../../src/utils/forensics.js';

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

  /** A minimal Claude transcript with known token counts and a body sentinel. */
  function writeTranscript(name = 'transcript.jsonl'): string {
    const p = path.join(projectDir, name);
    const lines = [
      {
        type: 'assistant',
        requestId: 'req_1',
        timestamp: '2026-06-01T00:00:00.000Z',
        message: {
          id: 'msg_1',
          model: 'claude-opus-4-6',
          usage: { input_tokens: 700, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          // A raw body line — must NEVER appear in the committed provenance JSON.
          content: [{ type: 'text', text: 'TRANSCRIPT_BODY_SENTINEL' }],
        },
      },
    ];
    fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
    return p;
  }

  /** sha256 of a file's bytes, prefixed `sha256:` (mirrors captureProvenanceAtSave). */
  function sha256OfFile(p: string): string {
    return 'sha256:' + createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  }

  /** Build a capture env merged over a minimal base. */
  function captureEnv(over: Record<string, string | undefined> = {}): Record<string, string | undefined> {
    return {
      ANA_HARNESS: 'claude',
      ANA_ROLE: 'build',
      ANA_CLI_VERSION: '1.2.2',
      ANA_AGENT_DEF_HASH: 'sha256:abc',
      ...over,
    };
  }

  /** List the committed provenance files for a slug. */
  function listProvenance(slug: string): string[] {
    const dir = path.join(projectDir, '.ana', 'plans', 'active', slug, 'provenance');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  }

  describe('getPendingDir', () => {
    it('resolves to ~/.ana/forensics/pending under HOME', () => {
      expect(getPendingDir()).toBe(path.join(tmpHome, '.ana', 'forensics', 'pending'));
    });
  });

  describe('the home buffer API is gone', () => {
    // @ana A016
    it('no longer exports getForensicsBufferPath / appendSessionRecord / updateSessionRecord', () => {
      const exported = forensics as unknown as Record<string, unknown>;
      expect(exported['getForensicsBufferPath']).toBeUndefined();
      expect(exported['appendSessionRecord']).toBeUndefined();
      expect(exported['updateSessionRecord']).toBeUndefined();
      expect(exported['buildSessionRecord']).toBeUndefined();
    });
  });

  describe('pending pointer round-trip', () => {
    const pointer: PendingPointer = {
      session_id: '0a2f6d97',
      transcript_path: '/tmp/fixture/transcript.jsonl',
      model: 'claude-opus-4-6',
      source: 'startup',
      captured_at: '2026-06-07T22:00:00.000Z',
    };

    // @ana A003, A004
    it('writes a pointer keyed by run id and reads it back; writes NO home buffer', () => {
      writePendingPointer('run-1', pointer);

      // A003: the pointer carries the session id, keyed by the run id.
      const read = readPendingPointer('run-1');
      expect(read).not.toBeNull();
      expect(read!.session_id).toBe('0a2f6d97');
      expect(read!.transcript_path).toBe('/tmp/fixture/transcript.jsonl');
      expect(read!.captured_at).toBe('2026-06-07T22:00:00.000Z');
      expect(fs.existsSync(path.join(getPendingDir(), 'run-1.json'))).toBe(true);

      // A004: no home buffer file is written anywhere under ~/.ana/forensics.
      expect(fs.existsSync(path.join(tmpHome, '.ana', 'forensics', 'sessions.jsonl'))).toBe(false);
    });

    it('no-ops on an empty run id (nothing to correlate)', () => {
      writePendingPointer('', pointer);
      expect(fs.existsSync(getPendingDir())).toBe(false);
    });

    it('readPendingPointer returns null for an absent / malformed pointer', () => {
      expect(readPendingPointer('missing')).toBeNull();
      fs.mkdirSync(getPendingDir(), { recursive: true });
      fs.writeFileSync(path.join(getPendingDir(), 'bad.json'), '{ not json', 'utf-8');
      expect(readPendingPointer('bad')).toBeNull();
    });

    it('deletePendingPointer removes the consumed pointer (best-effort)', () => {
      writePendingPointer('run-1', pointer);
      deletePendingPointer('run-1');
      expect(fs.existsSync(path.join(getPendingDir(), 'run-1.json'))).toBe(false);
      // Deleting again is a harmless no-op.
      expect(() => deletePendingPointer('run-1')).not.toThrow();
    });
  });

  describe('prunePendingPointers', () => {
    it('deletes pointers older than maxAge by mtime, keeps fresh ones', () => {
      writePendingPointer('fresh', {
        session_id: 'f', transcript_path: '', model: '', source: 'startup', captured_at: 'x',
      });
      writePendingPointer('stale', {
        session_id: 's', transcript_path: '', model: '', source: 'startup', captured_at: 'x',
      });
      // Backdate the stale pointer's mtime to 100h ago.
      const stalePath = path.join(getPendingDir(), 'stale.json');
      const old = new Date(Date.now() - 100 * 60 * 60 * 1000);
      fs.utimesSync(stalePath, old, old);

      prunePendingPointers(72 * 60 * 60 * 1000);

      expect(fs.existsSync(path.join(getPendingDir(), 'fresh.json'))).toBe(true);
      expect(fs.existsSync(stalePath)).toBe(false);
    });

    it('is a best-effort no-op when the pending dir is absent', () => {
      expect(() => prunePendingPointers(1000)).not.toThrow();
    });
  });

  describe('captureProvenanceAtSave', () => {
    // @ana A003, A005, A006, A009
    it('writes the committed provenance shape (transcript_hash + derive_version, no cost_usd, no body)', () => {
      writeAnaJson({ name: 'x', processCapture: 'on' });
      const transcript = writeTranscript();
      writePendingPointer('run-1', {
        session_id: 'sess-1',
        transcript_path: transcript,
        model: 'claude-opus-4-6',
        source: 'startup',
        captured_at: '2026-06-07T22:00:00.000Z',
      });

      const written = captureProvenanceAtSave(projectDir, 'feat', captureEnv({ ANA_RUN_ID: 'run-1' }));

      // A006: the file is provenance/{role}-{session_id}.json and the path is returned.
      expect(written).toBe(
        path.join(projectDir, '.ana', 'plans', 'active', 'feat', 'provenance', 'build-sess-1.json'),
      );
      expect(fs.existsSync(written!)).toBe(true);

      const raw = fs.readFileSync(written!, 'utf-8');
      const prov = JSON.parse(raw);
      expect(prov.role).toBe('build');
      expect(prov.session_id).toBe('sess-1');
      expect(prov.harness).toBe('claude');
      expect(prov.cli_version).toBe('1.2.2');
      expect(prov.agent_def_hash).toBe('sha256:abc');
      // captured_at carried verbatim from the pointer (the primary sort key).
      expect(prov.captured_at).toBe('2026-06-07T22:00:00.000Z');
      // A005: transcript_hash is the sha256 of the exact transcript bytes derived,
      // present on the WRAPPER (not inside derived) because the transcript was read.
      expect(prov.transcript_hash).toBe(sha256OfFile(transcript));
      expect(prov.transcript_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      // derived counts present with the core stamps + tokens.
      expect(prov.derived.price_table_version).toBe('2026-06-08');
      expect(prov.derived.derive_version).toBe('3'); // A003: engine derive version
      expect(prov.derived.tokens.input).toBe(700);
      expect(prov.derived.model).toBe('claude-opus-4-6');
      // transcript_hash lives on the wrapper, never inside core's frozen derived.
      expect(prov.derived.transcript_hash).toBeUndefined();
      // No baked-in dollar figure in the committed object.
      expect(raw).not.toContain('cost_usd');
      // A009: no raw transcript body leaks into the committed object.
      expect(raw).not.toContain('TRANSCRIPT_BODY_SENTINEL');
    });

    it('consumes the pointer it used (pointer deleted after capture)', () => {
      writeAnaJson({ name: 'x', processCapture: 'on' });
      const transcript = writeTranscript();
      writePendingPointer('run-1', {
        session_id: 'sess-1', transcript_path: transcript, model: 'claude-opus-4-6', source: 'startup', captured_at: 'x',
      });

      captureProvenanceAtSave(projectDir, 'feat', captureEnv({ ANA_RUN_ID: 'run-1' }));
      expect(fs.existsSync(path.join(getPendingDir(), 'run-1.json'))).toBe(false);
    });

    // @ana A005, A006
    it('omits derived AND transcript_hash when the transcript is unreadable, still writes the identity row', () => {
      writeAnaJson({ name: 'x', processCapture: 'on' });
      writePendingPointer('run-1', {
        session_id: 'sess-1',
        transcript_path: path.join(projectDir, 'gone.jsonl'), // does not exist
        model: 'claude-opus-4-6',
        source: 'startup',
        captured_at: 'x',
      });

      const written = captureProvenanceAtSave(projectDir, 'feat', captureEnv({ ANA_RUN_ID: 'run-1' }));
      expect(written).not.toBeNull();
      const prov = JSON.parse(fs.readFileSync(written!, 'utf-8'));
      // Both the derived block and the byte-identity hash are omitted — no guessed
      // values when the transcript could not be read.
      expect(prov.derived).toBeUndefined();
      expect(prov.transcript_hash).toBeUndefined();
      // A006: identity metadata still present so the session stays visible.
      expect(prov.session_id).toBe('sess-1');
      expect(prov.model).toBe('claude-opus-4-6'); // carried from the pointer
    });

    // @ana A011
    it('overwrites the same provenance file on a re-save by the same session', () => {
      writeAnaJson({ name: 'x', processCapture: 'on' });
      const transcript = writeTranscript();
      const seed = (): void =>
        writePendingPointer('run-1', {
          session_id: 'sess-1', transcript_path: transcript, model: 'claude-opus-4-6', source: 'startup', captured_at: 'x',
        });

      seed();
      captureProvenanceAtSave(projectDir, 'feat', captureEnv({ ANA_RUN_ID: 'run-1' }));
      seed();
      captureProvenanceAtSave(projectDir, 'feat', captureEnv({ ANA_RUN_ID: 'run-1' }));

      // Same session → one file, not two.
      expect(listProvenance('feat')).toEqual(['build-sess-1.json']);
    });

    // @ana A012
    it('writes two distinct files for two distinct sessions (concurrency)', () => {
      writeAnaJson({ name: 'x', processCapture: 'on' });
      const tA = writeTranscript('a.jsonl');
      const tB = writeTranscript('b.jsonl');
      writePendingPointer('run-A', {
        session_id: 'sess-A', transcript_path: tA, model: 'claude-opus-4-6', source: 'startup', captured_at: 'x',
      });
      writePendingPointer('run-B', {
        session_id: 'sess-B', transcript_path: tB, model: 'claude-opus-4-6', source: 'startup', captured_at: 'x',
      });

      captureProvenanceAtSave(projectDir, 'feat', captureEnv({ ANA_RUN_ID: 'run-A' }));
      captureProvenanceAtSave(projectDir, 'feat', captureEnv({ ANA_RUN_ID: 'run-B' }));

      expect(listProvenance('feat').sort()).toEqual(['build-sess-A.json', 'build-sess-B.json']);
    });

    it('returns null when ANA_ROLE is empty (nothing to attribute)', () => {
      writeAnaJson({ name: 'x', processCapture: 'on' });
      const transcript = writeTranscript();
      writePendingPointer('run-1', {
        session_id: 'sess-1', transcript_path: transcript, model: 'claude-opus-4-6', source: 'startup', captured_at: 'x',
      });

      const written = captureProvenanceAtSave(projectDir, 'feat', captureEnv({ ANA_RUN_ID: 'run-1', ANA_ROLE: '' }));
      expect(written).toBeNull();
      expect(listProvenance('feat')).toEqual([]);
    });

    it('returns null when process capture is off', () => {
      writeAnaJson({ name: 'x', processCapture: 'off' });
      const transcript = writeTranscript();
      writePendingPointer('run-1', {
        session_id: 'sess-1', transcript_path: transcript, model: 'claude-opus-4-6', source: 'startup', captured_at: 'x',
      });

      expect(captureProvenanceAtSave(projectDir, 'feat', captureEnv({ ANA_RUN_ID: 'run-1' }))).toBeNull();
    });

    it('recovers the Claude session from CLAUDE_CODE_SESSION_ID when no pointer exists', () => {
      writeAnaJson({ name: 'x', processCapture: 'on' });
      // Place the transcript where the Claude glob fallback finds it: ~/.claude/projects/**.
      const projDir = path.join(tmpHome, '.claude', 'projects', 'encoded');
      fs.mkdirSync(projDir, { recursive: true });
      const transcript = path.join(projDir, 'sess-claude.jsonl');
      fs.writeFileSync(
        transcript,
        JSON.stringify({
          type: 'assistant', requestId: 'r', timestamp: '2026-06-01T00:00:00.000Z',
          message: { model: 'claude-opus-4-6', usage: { input_tokens: 5, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, content: [] },
        }) + '\n',
        'utf-8',
      );

      const written = captureProvenanceAtSave(
        projectDir,
        'feat',
        captureEnv({ CLAUDE_CODE_SESSION_ID: 'sess-claude' }), // no ANA_RUN_ID / pointer
      );
      expect(written).not.toBeNull();
      const prov = JSON.parse(fs.readFileSync(written!, 'utf-8'));
      expect(prov.session_id).toBe('sess-claude');
      expect(prov.derived.tokens.input).toBe(5);
    });

    it('returns null for Codex with no pointer and no session id (no fallback)', () => {
      writeAnaJson({ name: 'x', processCapture: 'on' });
      const written = captureProvenanceAtSave(
        projectDir,
        'feat',
        captureEnv({ ANA_HARNESS: 'codex', CLAUDE_CODE_SESSION_ID: 'irrelevant' }),
      );
      expect(written).toBeNull();
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

  describe('isProcessCaptureEnabled', () => {
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

    it('returns false on malformed ana.json', () => {
      writeAnaJson('{ not valid json');
      expect(isProcessCaptureEnabled(projectDir)).toBe(false);
    });

    it('returns false when ana.json is missing entirely', () => {
      expect(isProcessCaptureEnabled(projectDir)).toBe(false);
    });
  });
});
