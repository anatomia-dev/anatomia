/**
 * Tests for the hidden `ana _capture` command (Phase 1).
 *
 * Totality is the headline property: `_capture` must exit 0 in EVERY case and
 * never disturb the session. These run against the compiled `dist/index.js`
 * (per testing-standards: integration assertions on the real CLI binary), so
 * the package must be built first (`pnpm run build`). The no-network assertion
 * is an enforcement test over the capture-path source.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../../dist/index.js');

describe('ana _capture', () => {
  let tmpHome: string;
  let projectDir: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-home-'));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-proj-'));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  /** Write the project ana.json with the given processCapture value. */
  function writeProject(processCapture?: 'on' | 'off'): void {
    const anaDir = path.join(projectDir, '.ana');
    fs.mkdirSync(anaDir, { recursive: true });
    const config: Record<string, unknown> = { name: 'test' };
    if (processCapture) config['processCapture'] = processCapture;
    fs.writeFileSync(path.join(anaDir, 'ana.json'), JSON.stringify(config));
  }

  /** Run `ana _capture` against the compiled CLI with the given stdin + env. */
  function runCapture(
    stdin: string,
    opts?: { home?: string; cwd?: string },
  ): { status: number } {
    const result = spawnSync('node', [CLI_PATH, '_capture'], {
      input: stdin,
      cwd: opts?.cwd ?? projectDir,
      env: { ...process.env, HOME: opts?.home ?? tmpHome },
      encoding: 'utf-8',
    });
    return { status: result.status ?? 1 };
  }

  /** Count lines in the forensics buffer under tmpHome. */
  function bufferLineCount(home: string = tmpHome): number {
    const bufferPath = path.join(home, '.ana', 'forensics', 'sessions.jsonl');
    if (!fs.existsSync(bufferPath)) return 0;
    return fs.readFileSync(bufferPath, 'utf-8').trim().split('\n').filter(Boolean).length;
  }

  const validPayload = JSON.stringify({
    session_id: '0a2f6d97',
    transcript_path: '/tmp/fixture/transcript.jsonl',
    cwd: '__PROJECT__',
    source: 'startup',
    model: 'claude-opus-4-6',
    hook_event_name: 'SessionStart',
  });

  // @ana A010
  it('appends exactly one line when the gate is on and stdin is valid', () => {
    writeProject('on');
    const payload = validPayload.replace('__PROJECT__', projectDir);
    const { status } = runCapture(payload);

    expect(status).toBe(0);
    expect(bufferLineCount()).toBe(1);

    const bufferPath = path.join(tmpHome, '.ana', 'forensics', 'sessions.jsonl');
    const rec = JSON.parse(fs.readFileSync(bufferPath, 'utf-8').trim());
    expect(rec.session_id).toBe('0a2f6d97');
    // transcript_path recorded verbatim from the payload
    expect(rec.transcript_path).toBe('/tmp/fixture/transcript.jsonl');
    expect(rec.source).toBe('startup');
  });

  // @ana A012
  it('writes nothing and exits 0 when the gate is off', () => {
    writeProject('off');
    const payload = validPayload.replace('__PROJECT__', projectDir);
    const { status } = runCapture(payload);

    expect(status).toBe(0);
    expect(bufferLineCount()).toBe(0);
  });

  it('writes nothing and exits 0 when processCapture is absent', () => {
    writeProject(); // no processCapture key → off
    const payload = validPayload.replace('__PROJECT__', projectDir);
    const { status } = runCapture(payload);

    expect(status).toBe(0);
    expect(bufferLineCount()).toBe(0);
  });

  // @ana A011
  it('exits 0 on malformed stdin (never throws)', () => {
    writeProject('on');
    const { status } = runCapture('this is not json {{{');
    expect(status).toBe(0);
  });

  it('exits 0 and writes nothing on empty stdin', () => {
    writeProject('on');
    const { status } = runCapture('');
    expect(status).toBe(0);
    expect(bufferLineCount()).toBe(0);
  });

  it('writes nothing when the payload has no session_id', () => {
    writeProject('on');
    const payload = JSON.stringify({ cwd: projectDir, source: 'startup', hook_event_name: 'SessionStart' });
    const { status } = runCapture(payload);
    expect(status).toBe(0);
    expect(bufferLineCount()).toBe(0);
  });

  it('exits 0 when the buffer dir is unwritable (HOME is a file)', () => {
    writeProject('on');
    // Point HOME at a regular file so mkdir of ~/.ana/forensics fails (ENOTDIR).
    const fileHome = path.join(projectDir, 'not-a-dir');
    fs.writeFileSync(fileHome, 'x');
    const payload = validPayload.replace('__PROJECT__', projectDir);
    const { status } = runCapture(payload, { home: fileHome });
    expect(status).toBe(0);
  });

  it('exits 0 when run outside any Anatomia project', () => {
    // cwd is a bare temp dir with no .ana — no project root → silent no-op.
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-bare-'));
    try {
      const result = spawnSync('node', [CLI_PATH, '_capture'], {
        input: JSON.stringify({ session_id: 'x', cwd: bareDir }),
        cwd: bareDir,
        env: { ...process.env, HOME: tmpHome },
        encoding: 'utf-8',
      });
      expect(result.status ?? 1).toBe(0);
      expect(bufferLineCount()).toBe(0);
    } finally {
      fs.rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it('is hidden from `ana --help`', () => {
    const result = spawnSync('node', [CLI_PATH, '--help'], { encoding: 'utf-8' });
    expect(result.stdout ?? '').not.toContain('_capture');
  });

  // @ana A013
  it('the capture path imports no network modules (no network I/O)', () => {
    // Enforcement test (testing-standards sanctioned): assert the source of the
    // capture path never pulls in a network module. Phase 1 capture is fs + os
    // only; this guards against a future edit introducing a network call.
    const captureSrc = fs.readFileSync(path.resolve(__dirname, '../../src/commands/_capture.ts'), 'utf-8');
    const forensicsSrc = fs.readFileSync(path.resolve(__dirname, '../../src/utils/forensics.ts'), 'utf-8');
    // Phase 2: the derive path (deriveTranscript) lives in forensics.ts and the
    // cost path in data/pricing.ts — both must also be network-free.
    const pricingSrc = fs.readFileSync(path.resolve(__dirname, '../../src/data/pricing.ts'), 'utf-8');
    const combined = captureSrc + '\n' + forensicsSrc + '\n' + pricingSrc;

    const networkPatterns = [
      /from\s+['"]node:https?['"]/,
      /from\s+['"]node:net['"]/,
      /from\s+['"]node:dns['"]/,
      /from\s+['"]node:http2['"]/,
      /from\s+['"]node:tls['"]/,
      /\bfetch\s*\(/,
      /from\s+['"](?:axios|node-fetch|undici|got)['"]/,
    ];
    for (const pattern of networkPatterns) {
      expect(combined).not.toMatch(pattern);
    }
  });

  // ── Phase 2: SessionEnd/Stop derive mode (--derive) ──────────────────────
  describe('--derive (SessionEnd/Stop)', () => {
    /** Seed the forensics buffer under tmpHome with one record. */
    function seedRecord(home: string, record: Record<string, unknown>): void {
      const bufferPath = path.join(home, '.ana', 'forensics', 'sessions.jsonl');
      fs.mkdirSync(path.dirname(bufferPath), { recursive: true });
      fs.appendFileSync(bufferPath, JSON.stringify(record) + '\n', 'utf-8');
    }

    /** A minimal Phase-1 record (no derived block yet). */
    function pointerRecord(sessionId: string, transcriptPath: string): Record<string, unknown> {
      return {
        session_id: sessionId,
        transcript_path: transcriptPath,
        harness: 'claude',
        harness_version: '',
        role: 'think',
        slug: '',
        model: 'claude-opus-4-6',
        agent_def_hash: '',
        cli_version: '',
        cwd: projectDir,
        source: 'startup',
        os: 'darwin',
        node: 'v20',
        timestamp: '2026-06-01T00:00:00.000Z',
      };
    }

    /** Write a tiny Claude transcript with known token counts. */
    function writeTranscript(): string {
      const p = path.join(projectDir, 'transcript.jsonl');
      const lines = [
        {
          type: 'assistant',
          requestId: 'req_1',
          timestamp: '2026-06-01T00:00:00.000Z',
          message: {
            model: 'claude-opus-4-6',
            usage: { input_tokens: 700, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
            content: [],
          },
        },
      ];
      fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
      return p;
    }

    /** Run `ana _capture --derive` against the compiled CLI. */
    function runDerive(stdin: string, home: string): { status: number } {
      const result = spawnSync('node', [CLI_PATH, '_capture', '--derive'], {
        input: stdin,
        cwd: projectDir,
        env: { ...process.env, HOME: home },
        encoding: 'utf-8',
      });
      return { status: result.status ?? 1 };
    }

    /** Read the single buffer record under a home. */
    function readRecord(home: string): Record<string, unknown> {
      const bufferPath = path.join(home, '.ana', 'forensics', 'sessions.jsonl');
      return JSON.parse(fs.readFileSync(bufferPath, 'utf-8').trim());
    }

    // @ana A034
    it('writes derived counts back into the matching record (async, exit 0)', () => {
      writeProject('on');
      const transcript = writeTranscript();
      seedRecord(tmpHome, pointerRecord('sess-1', transcript));

      const payload = JSON.stringify({ session_id: 'sess-1', transcript_path: transcript, cwd: projectDir, hook_event_name: 'SessionEnd' });
      const { status } = runDerive(payload, tmpHome);

      expect(status).toBe(0);
      const rec = readRecord(tmpHome);
      expect(rec['derived']).toBeDefined();
      const derived = rec['derived'] as Record<string, unknown>;
      expect((derived['tokens'] as Record<string, number>)['input']).toBe(700);
      expect(derived['model']).toBe('claude-opus-4-6');
    });

    // @ana A035
    it('persists no raw transcript body in the enriched record', () => {
      writeProject('on');
      const transcript = writeTranscript();
      seedRecord(tmpHome, pointerRecord('sess-1', transcript));

      const payload = JSON.stringify({ session_id: 'sess-1', transcript_path: transcript, cwd: projectDir });
      runDerive(payload, tmpHome);

      const rec = readRecord(tmpHome);
      // The only added key is `derived`, which holds counts — never message text.
      const derived = rec['derived'] as Record<string, unknown>;
      expect(Object.keys(derived).sort()).toEqual(
        ['commands_run', 'cost_usd', 'duration_ms', 'failures_encountered', 'files_touched', 'model', 'price_table_version', 'tests_executed', 'tokens', 'tool_calls', 'turns'].sort(),
      );
    });

    it('no-ops and exits 0 when the gate is off', () => {
      writeProject('off');
      const transcript = writeTranscript();
      seedRecord(tmpHome, pointerRecord('sess-1', transcript));

      const payload = JSON.stringify({ session_id: 'sess-1', transcript_path: transcript, cwd: projectDir });
      const { status } = runDerive(payload, tmpHome);

      expect(status).toBe(0);
      expect(readRecord(tmpHome)['derived']).toBeUndefined();
    });

    it('no-ops and exits 0 when the transcript is missing', () => {
      writeProject('on');
      seedRecord(tmpHome, pointerRecord('sess-1', path.join(projectDir, 'gone.jsonl')));

      const payload = JSON.stringify({ session_id: 'sess-1', transcript_path: path.join(projectDir, 'gone.jsonl'), cwd: projectDir });
      const { status } = runDerive(payload, tmpHome);

      expect(status).toBe(0);
      expect(readRecord(tmpHome)['derived']).toBeUndefined();
    });

    it('exits 0 on malformed stdin', () => {
      writeProject('on');
      const { status } = runDerive('not json {{{', tmpHome);
      expect(status).toBe(0);
    });
  });
});
