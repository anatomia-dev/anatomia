/**
 * Tests for the hidden `ana _capture` command (capture v2).
 *
 * Totality is the headline property: `_capture` must exit 0 in EVERY case and
 * never disturb the session. These run against the compiled `dist/index.js`
 * (per testing-standards: integration assertions on the real CLI binary), so the
 * package must be built first (`pnpm run build`).
 *
 * SessionStart now writes a transient POINTER keyed by ANA_RUN_ID into
 * `~/.ana/forensics/pending/{run_id}.json` — no buffer, no git, no derive. The
 * retired `--derive` flag is accepted and exits 0 as a pure no-op (so a stale
 * hook on an un-re-init'd install never breaks a live session). The no-network
 * assertion is an enforcement test over the capture-path source.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../../dist/index.js');
const require = createRequire(import.meta.url);

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

  /**
   * Run `ana _capture` against the compiled CLI. The parent test process may
   * itself carry an ANA_RUN_ID — strip it, then apply the test's own env so each
   * case controls the correlation key explicitly.
   */
  function runCapture(
    stdin: string,
    opts?: { home?: string; cwd?: string; runId?: string | null; derive?: boolean },
  ): { status: number } {
    const env: Record<string, string | undefined> = { ...process.env, HOME: opts?.home ?? tmpHome };
    delete env['ANA_RUN_ID'];
    if (opts?.runId != null) env['ANA_RUN_ID'] = opts.runId;
    const args = opts?.derive ? ['_capture', '--derive'] : ['_capture'];
    const result = spawnSync('node', [CLI_PATH, ...args], {
      input: stdin,
      cwd: opts?.cwd ?? projectDir,
      env,
      encoding: 'utf-8',
    });
    return { status: result.status ?? 1 };
  }

  /** Absolute path to the pending dir under a home. */
  function pendingDir(home: string = tmpHome): string {
    return path.join(home, '.ana', 'forensics', 'pending');
  }

  /** Whether the legacy home buffer exists under a home. */
  function homeBufferExists(home: string = tmpHome): boolean {
    return fs.existsSync(path.join(home, '.ana', 'forensics', 'sessions.jsonl'));
  }

  /** Count pointer files under a home's pending dir. */
  function pointerCount(home: string = tmpHome): number {
    const dir = pendingDir(home);
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length;
  }

  const validPayload = JSON.stringify({
    session_id: '0a2f6d97',
    transcript_path: '/tmp/fixture/transcript.jsonl',
    cwd: '__PROJECT__',
    source: 'startup',
    model: 'claude-opus-4-6',
    hook_event_name: 'SessionStart',
  });

  // @ana A003, A004
  it('writes exactly one pending pointer (and NO home buffer) when gate on + valid stdin', () => {
    writeProject('on');
    const payload = validPayload.replace('__PROJECT__', projectDir);
    const { status } = runCapture(payload, { runId: 'run-1' });

    expect(status).toBe(0);
    // A003: a pointer keyed by ANA_RUN_ID, carrying the session id.
    expect(pointerCount()).toBe(1);
    const pointerPath = path.join(pendingDir(), 'run-1.json');
    expect(fs.existsSync(pointerPath)).toBe(true);
    const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf-8'));
    expect(pointer.session_id).toBe('0a2f6d97');
    expect(pointer.transcript_path).toBe('/tmp/fixture/transcript.jsonl');
    expect(pointer.source).toBe('startup');
    expect(typeof pointer.captured_at).toBe('string');
    expect(pointer.captured_at).not.toBe('');
    // A004: the session-start hook writes no home buffer.
    expect(homeBufferExists()).toBe(false);
  });

  it('writes nothing and exits 0 when the gate is off', () => {
    writeProject('off');
    const payload = validPayload.replace('__PROJECT__', projectDir);
    const { status } = runCapture(payload, { runId: 'run-1' });

    expect(status).toBe(0);
    expect(pointerCount()).toBe(0);
    expect(homeBufferExists()).toBe(false);
  });

  it('writes nothing and exits 0 when processCapture is absent', () => {
    writeProject(); // no processCapture key → off
    const payload = validPayload.replace('__PROJECT__', projectDir);
    const { status } = runCapture(payload, { runId: 'run-1' });

    expect(status).toBe(0);
    expect(pointerCount()).toBe(0);
  });

  it('no-ops when ANA_RUN_ID is absent (nothing to correlate)', () => {
    writeProject('on');
    const payload = validPayload.replace('__PROJECT__', projectDir);
    const { status } = runCapture(payload, { runId: null });

    expect(status).toBe(0);
    expect(pointerCount()).toBe(0);
  });

  it('exits 0 on malformed stdin (never throws)', () => {
    writeProject('on');
    const { status } = runCapture('this is not json {{{', { runId: 'run-1' });
    expect(status).toBe(0);
  });

  it('exits 0 and writes nothing on empty stdin', () => {
    writeProject('on');
    const { status } = runCapture('', { runId: 'run-1' });
    expect(status).toBe(0);
    expect(pointerCount()).toBe(0);
  });

  it('writes nothing when the payload has no session_id', () => {
    writeProject('on');
    const payload = JSON.stringify({ cwd: projectDir, source: 'startup', hook_event_name: 'SessionStart' });
    const { status } = runCapture(payload, { runId: 'run-1' });
    expect(status).toBe(0);
    expect(pointerCount()).toBe(0);
  });

  it('exits 0 when the pending dir is unwritable (HOME is a file)', () => {
    writeProject('on');
    // Point HOME at a regular file so mkdir of ~/.ana/forensics/pending fails (ENOTDIR).
    const fileHome = path.join(projectDir, 'not-a-dir');
    fs.writeFileSync(fileHome, 'x');
    const payload = validPayload.replace('__PROJECT__', projectDir);
    const { status } = runCapture(payload, { home: fileHome, runId: 'run-1' });
    expect(status).toBe(0);
  });

  it('exits 0 when run outside any Anatomia project', () => {
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-bare-'));
    try {
      const { status } = runCapture(JSON.stringify({ session_id: 'x', cwd: bareDir }), {
        cwd: bareDir,
        runId: 'run-1',
      });
      expect(status).toBe(0);
      expect(pointerCount()).toBe(0);
    } finally {
      fs.rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it('is hidden from `ana --help`', () => {
    const result = spawnSync('node', [CLI_PATH, '--help'], { encoding: 'utf-8' });
    expect(result.stdout ?? '').not.toContain('_capture');
  });

  // Enforcement scan (bonus coverage, no contract id): keeps the capture path network-free.
  it('the capture path imports no network modules (no network I/O)', () => {
    const captureSrc = fs.readFileSync(path.resolve(__dirname, '../../src/commands/_capture.ts'), 'utf-8');
    const forensicsSrc = fs.readFileSync(path.resolve(__dirname, '../../src/utils/forensics.ts'), 'utf-8');
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

  // @ana A001
  it('pins anatrace-core to an exact version (no caret/tilde)', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'),
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.['anatrace-core']).toBe('0.2.0');
  });

  // @ana A012
  it('keeps the no-network guarantee transitive: anatrace-core runtime deps ⊆ { yaml }', () => {
    // The engine is now a runtime dependency, so its OWN dependency tree must stay
    // inside the no-network guarantee — not just Anatomia's source. Read the
    // installed package.json and assert every runtime dep is on the allowlist.
    const ALLOWLIST = new Set(['yaml']);
    const corePkgPath = require.resolve('anatrace-core/package.json');
    const corePkg = JSON.parse(fs.readFileSync(corePkgPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
    };
    const runtimeDeps = Object.keys(corePkg.dependencies ?? {});
    const disallowed = runtimeDeps.filter((d) => !ALLOWLIST.has(d));
    expect(disallowed).toEqual([]); // fails loudly with the offending dep name(s)
  });

  // ── Retired --derive (SessionEnd/Stop) is a tolerated no-op ──────────────
  describe('--derive (retired no-op)', () => {
    // @ana A005
    it('exits 0 and writes nothing (no pointer, no buffer)', () => {
      writeProject('on');
      const payload = JSON.stringify({
        session_id: 'sess-1',
        transcript_path: '/tmp/whatever.jsonl',
        cwd: projectDir,
        hook_event_name: 'SessionEnd',
      });
      const { status } = runCapture(payload, { runId: 'run-1', derive: true });

      expect(status).toBe(0);
      expect(pointerCount()).toBe(0);
      expect(homeBufferExists()).toBe(false);
    });

    it('exits 0 even on malformed stdin', () => {
      writeProject('on');
      const { status } = runCapture('not json {{{', { runId: 'run-1', derive: true });
      expect(status).toBe(0);
    });

    it('exits 0 with the gate off', () => {
      writeProject('off');
      const { status } = runCapture(JSON.stringify({ session_id: 'x', cwd: projectDir }), {
        runId: 'run-1',
        derive: true,
      });
      expect(status).toBe(0);
    });
  });
});
