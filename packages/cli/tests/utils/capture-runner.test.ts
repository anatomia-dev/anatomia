import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  resolveCommand,
  runCapture,
  deriveCounts,
  deriveVerdict,
  captureSpawnOptions,
  CaptureCommandError,
} from '../../src/utils/capture-runner.js';

/**
 * Runner unit tests — the security boundary.
 *
 * `resolveCommand` must parse the two forms we generate without a shell and
 * REFUSE every shell metacharacter (no silent fallback). `runCapture` must tee
 * the full bytes and fail CLOSED on a spawn error before writing any sink.
 */

const NODE = process.execPath;
const tmpDirs: string[] = [];

function mkSink(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-run-'));
  tmpDirs.push(dir);
  return path.join(dir, 'out.log');
}

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe('resolveCommand — shell-free parsing', () => {
  const base = '/project/root';

  it('parses a bare `program args` command into program and args', () => {
    const r = resolveCommand('vitest run --reporter=dot', base);
    expect(r.program).toBe('vitest');
    expect(r.args).toEqual(['run', '--reporter=dot']);
    expect(r.cwd).toBe(base);
  });

  it("recovers cwd from a `(cd '<dir>' && <cmd>)` wrapper", () => {
    const r = resolveCommand("(cd 'packages/cli' && pnpm vitest run)", base);
    expect(r.cwd).toBe(path.resolve(base, 'packages/cli'));
    expect(r.program).toBe('pnpm');
    expect(r.args).toEqual(['vitest', 'run']);
  });

  it("unescapes the POSIX '\\'' single-quote idiom in a cd path", () => {
    const r = resolveCommand("(cd 'a'\\''b' && vitest)", base);
    expect(r.cwd).toBe(path.resolve(base, "a'b"));
    expect(r.program).toBe('vitest');
  });

  it('lifts leading VAR=val assignments into env and skips them for the executable', () => {
    const r = resolveCommand('CI=1 NODE_ENV=test vitest run', base);
    expect(r.env['CI']).toBe('1');
    expect(r.env['NODE_ENV']).toBe('test');
    expect(r.program).toBe('vitest');
    expect(r.args).toEqual(['run']);
  });

  it('treats the first non-assignment token as the program (dotenv passes)', () => {
    const r = resolveCommand('dotenv -- vitest run', base);
    expect(r.program).toBe('dotenv');
    expect(r.args).toEqual(['--', 'vitest', 'run']);
    expect(r.env).toEqual({});
  });

  it('round-trips the configured args verbatim — no flags appended', () => {
    const r = resolveCommand('vitest run packages/cli', base);
    expect(r.args).toEqual(['run', 'packages/cli']);
    expect(r.args).not.toContain('--appended');
  });

  it("refuses a pipe and names the construct", () => {
    let msg = '';
    try {
      resolveCommand('vitest run | tee out.txt', base);
    } catch (e) {
      expect(e).toBeInstanceOf(CaptureCommandError);
      msg = (e as Error).message;
    }
    expect(msg).toContain('pipe');
  });

  it('refuses command substitution and backticks with no shell fallback', () => {
    expect(() => resolveCommand('vitest $(echo run)', base)).toThrow(CaptureCommandError);
    expect(() => resolveCommand('vitest `echo run`', base)).toThrow(CaptureCommandError);
  });

  it('refuses extra &&-chains, semicolons, ||, redirection, and globs', () => {
    expect(() => resolveCommand('vitest && rm -rf /', base)).toThrow(/chaining/);
    expect(() => resolveCommand('vitest ; rm -rf /', base)).toThrow(/semicolon/);
    expect(() => resolveCommand('vitest || true', base)).toThrow(/pipe/);
    expect(() => resolveCommand('vitest > out.txt', base)).toThrow(/redirection/);
    expect(() => resolveCommand('vitest *.test.ts', base)).toThrow(/glob/);
    expect(() => resolveCommand("(cd 'x' && vitest | tee)", base)).toThrow(/pipe/);
  });

  it('allows a metacharacter that is quoted (literal argv, no shell needed)', () => {
    const r = resolveCommand('vitest -t "a|b"', base);
    expect(r.program).toBe('vitest');
    expect(r.args).toEqual(['-t', 'a|b']);
  });
});

describe('runCapture — fail-closed tee', () => {
  it('never enables a shell in its spawn options', () => {
    const opts = captureSpawnOptions('/tmp', 1000);
    expect(opts.shell).toBe(false);
  });

  it('tees exactly the captured bytes to the sink (file equals returned bytes)', () => {
    const sink = mkSink();
    const result = runCapture({
      program: NODE,
      args: ['-e', 'process.stdout.write("hello world")'],
      cwd: process.cwd(),
      sink,
    });
    expect(result.bytes).toBe(11);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.usedShell).toBe(false);
    expect(fs.existsSync(sink)).toBe(true);
    expect(fs.readFileSync(sink)).toEqual(result.rawBytes);
    expect(fs.readFileSync(sink, 'utf8')).toBe('hello world');
  });

  it('concatenates stdout and stderr into the preserved bytes', () => {
    const sink = mkSink();
    const result = runCapture({
      program: NODE,
      args: ['-e', 'process.stdout.write("OUT");process.stderr.write("ERR")'],
      cwd: process.cwd(),
      sink,
    });
    expect(result.rawBytes.toString('utf8')).toBe('OUTERR');
  });

  it('throws on a spawn error (ENOENT) and writes NO capture file', () => {
    const sink = mkSink();
    let threw = false;
    try {
      runCapture({
        program: 'definitely-not-a-real-binary-xyz123',
        args: [],
        cwd: process.cwd(),
        sink,
      });
    } catch (e) {
      threw = true;
      expect(e).toBeInstanceOf(CaptureCommandError);
    }
    expect(threw).toBe(true);
    // captureFileWritten === false — truncated/empty output is never sealed.
    expect(fs.existsSync(sink)).toBe(false);
  });
});

describe('deriveVerdict — trinary, no false green', () => {
  it('returns pass when counted, passed>0, and no failures at exit 0', () => {
    expect(deriveVerdict({ passed: 47, failed: 0, skipped: 2 }, 0)).toBe('pass');
  });

  // @ana A011 — a run where nothing actually passed is never a pass.
  it('returns abstain for {0,0,0} at exit 0 (no vacuous green)', () => {
    expect(deriveVerdict({ passed: 0, failed: 0, skipped: 0 }, 0)).toBe('abstain');
  });

  // @ana A011 — an all-skipped suite passed nothing → abstain, not pass.
  it('returns abstain for an all-skipped suite at exit 0', () => {
    expect(deriveVerdict({ passed: 0, failed: 0, skipped: 5 }, 0)).toBe('abstain');
  });

  it('returns fail when failures are present', () => {
    expect(deriveVerdict({ passed: 1, failed: 2, skipped: 0 }, 1)).toBe('fail');
  });

  it('returns fail on a non-zero exit even when counts look clean', () => {
    expect(deriveVerdict({ passed: 3, failed: 0, skipped: 0 }, 1)).toBe('fail');
  });

  // @ana A010 — a clean exit with no countable evidence is never a pass.
  it('returns abstain when counts are null at exit 0', () => {
    expect(deriveVerdict(null, 0)).toBe('abstain');
  });
});

describe('deriveCounts — from captured output', () => {
  // @ana A006 — counts read from vitest's machine-readable JSON reporter.
  it('reads counts from vitest --reporter=json output', () => {
    const json =
      '{"numTotalTestSuites":7,"numTotalTests":49,"numPassedTests":47,"numFailedTests":0,' +
      '"numPendingTests":1,"numTodoTests":1,"success":true,"testResults":[]}';
    const counts = deriveCounts(json, 'vitest');
    expect(counts).not.toBeNull();
    expect(counts!.passed).toBe(47);
    expect(counts!.passed).toBeGreaterThan(0);
    expect(counts!.failed).toBe(0);
    // pending (.skip) + todo both fold into "skipped".
    expect(counts!.skipped).toBe(2);
  });

  // @ana A006 — the JSON object survives being embedded in surrounding stderr
  // noise (the capture concatenates stdout+stderr); fields are read by key.
  it('reads vitest JSON counts even when wrapped in stderr noise', () => {
    const noisy =
      '> [email protected] test\n> vitest run --reporter=json\n\n' +
      '{"numTotalTests":3,"numPassedTests":3,"numFailedTests":0,"numPendingTests":0,' +
      '"numTodoTests":0,"testResults":[{"status":"passed"}]}\n' +
      'some trailing turbo summary line\n';
    const counts = deriveCounts(noisy, 'vitest');
    expect(counts).toEqual({ passed: 3, failed: 0, skipped: 0 });
  });

  // @ana A006 — falls back to the human summary when no JSON reporter is present.
  it('falls back to the human vitest summary when JSON is absent', () => {
    const counts = deriveCounts('      Tests  47 passed | 2 skipped (49)\n', 'vitest');
    expect(counts).not.toBeNull();
    expect(counts!.passed).toBe(47);
    expect(counts!.passed).toBeGreaterThan(0);
    expect(counts!.skipped).toBe(2);
  });

  // @ana A022 — the JSON-count path is runner-agnostic: go's -json stream is
  // counted via parseGo, proving the mechanism is not hard-wired to vitest.
  it('reads counts from a non-vitest JSON runner (go test -json)', () => {
    const goJson =
      '{"Action":"pass","Test":"TestA"}\n{"Action":"pass","Test":"TestB"}\n' +
      '{"Action":"fail","Test":"TestC"}\n{"Action":"skip","Test":"TestD"}\nok\texample/p\n';
    const counts = deriveCounts(goJson, 'go');
    expect(counts).not.toBeNull();
    expect(counts!.passed).toBe(2);
    expect(counts!.passed).toBeGreaterThan(0);
    expect(counts!.failed).toBe(1);
    expect(counts!.skipped).toBe(1);
  });

  it('abstains (null) on unrecognized output', () => {
    expect(deriveCounts('some random tool finished fine\n')).toBeNull();
  });

  // ABSTAIN-ON-UNKNOWN must not be defeated by a coincidental match.
  it('abstains on unhinted output even when it embeds a runner-shaped phrase', () => {
    // This prose would match rspec's loose `N examples, N failures` regex if we
    // ran every parser against unidentified output. Unhinted ⇒ must abstain.
    const prose = 'The guide walks through 5 examples, 0 failures expected, then more.\n';
    expect(deriveCounts(prose)).toBeNull();
  });

  it('abstains when the embedded phrase is hinted to the wrong runner', () => {
    // Hinted as vitest, but the text carries no vitest `Tests …` summary line —
    // the hinted parser simply finds nothing and we abstain rather than guess.
    const prose = 'we observed 5 examples, 2 failures during the demo\n';
    expect(deriveCounts(prose, 'vitest')).toBeNull();
  });

  it('rspec parser ignores a summary phrase that is not its own line', () => {
    // Anchored: a mid-sentence `N examples, N failures` is not the rspec summary.
    expect(deriveCounts('saw 9 examples, 9 failures inline in a log\n', 'rspec')).toBeNull();
    // …but a real standalone rspec summary line still parses.
    const counts = deriveCounts('5 examples, 1 failure, 2 pending\n', 'rspec');
    expect(counts).not.toBeNull();
    expect(counts!.passed).toBe(2);
    expect(counts!.failed).toBe(1);
  });
});
