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

  it('exits 0 on empty stdin', () => {
    writeProject('on');
    const { status } = runCapture('');
    expect(status).toBe(0);
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
    const combined = captureSrc + '\n' + forensicsSrc;

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
});
