import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  executeCapture,
  resolveTestCommandString,
  inferRunner,
  CAPTURE_ERROR_EXIT,
} from '../../src/commands/test.js';

/**
 * `ana test` orchestrator tests — exit-code contract, the compact sealed marker
 * (counts/verdict/sha256, no file), log deletion after sealing, the abstain
 * discoverability hint, the removed-ceiling seal, and the verify-runs-full-
 * project rule. Tags map to the orchestrator-level contract assertions.
 */

const NODE = process.execPath;
const tmpDirs: string[] = [];

/** Build a temp project with an ana.json whose commands.test runs a script. */
function mkProject(testCmd: string): { root: string; slug: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ana-test-cmd-'));
  tmpDirs.push(root);
  const slug = 'demo';
  fs.mkdirSync(path.join(root, '.ana', 'plans', 'active', slug), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.ana', 'ana.json'),
    JSON.stringify({ name: 'demo', commands: { test: testCmd } }),
  );
  return { root, slug };
}

/** Write an executable node script that prints `out` and exits `code`. */
function script(root: string, name: string, out: string, code = 0): string {
  const p = path.join(root, name);
  fs.writeFileSync(p, `process.stdout.write(${JSON.stringify(out)});process.exit(${code});`);
  return p;
}

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe('resolveTestCommandString', () => {
  // @ana A014 — with no surface named, the top-level command resolves (source set).
  it('reads top-level commands.test and reports the source', () => {
    const resolved = resolveTestCommandString({ commands: { test: 'vitest run' } }, undefined);
    expect(resolved).toEqual({ command: 'vitest run', source: 'test' });
    expect(resolved!.source).toBeDefined();
  });

  it('prefers top-level commands.test_json over commands.test', () => {
    const ana = { commands: { test: 'vitest run', test_json: 'vitest run --reporter=json' } };
    expect(resolveTestCommandString(ana, undefined)).toEqual({
      command: 'vitest run --reporter=json',
      source: 'test_json',
    });
  });

  it('prefers a surface test_json override when present (opt-in structured)', () => {
    const ana = { surfaces: { cli: { commands: { test: 'vitest run', test_json: 'vitest run --reporter=json' } } } };
    expect(resolveTestCommandString(ana, 'cli')).toEqual({
      command: 'vitest run --reporter=json',
      source: 'test_json',
    });
  });

  it('falls back to the surface commands.test without test_json', () => {
    const ana = { surfaces: { cli: { commands: { test: 'vitest run' } } } };
    expect(resolveTestCommandString(ana, 'cli')).toEqual({ command: 'vitest run', source: 'test' });
  });

  it('returns null when no test command is configured', () => {
    expect(resolveTestCommandString({ commands: {} }, undefined)).toBeNull();
    expect(resolveTestCommandString({ surfaces: {} }, 'cli')).toBeNull();
  });
});

describe('inferRunner', () => {
  it('maps command strings to runners', () => {
    expect(inferRunner("(cd 'packages/cli' && pnpm vitest run)")).toBe('vitest');
    expect(inferRunner('go test ./...')).toBe('go');
    expect(inferRunner('cargo test')).toBe('cargo');
  });
});

describe('executeCapture — baseline', () => {
  /** Path the baseline log is tee'd to before deletion, for a given `now`. */
  function logPath(root: string, slug: string, now: number): string {
    return path.join(root, '.ana', 'plans', 'active', slug, '.captures', `test-build-${now}.log`);
  }

  // @ana A011 — a passing baseline emits a ONE-LINE compact marker carrying
  // counts/verdict/sha256 and dropping the file field.
  it('emits a compact sealed marker on a passing baseline run (exit 0)', () => {
    const { root, slug } = mkProject('');
    // The script name carries the runner so inferRunner identifies it (counts
    // are hint-only — unhinted output abstains by design).
    const s = script(root, 'vitest-run.cjs', '      Tests  3 passed (3)\n', 0);
    fs.writeFileSync(path.join(root, '.ana', 'ana.json'), JSON.stringify({ name: 'd', commands: { test: `${NODE} ${s}` } }));

    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now: 1700000000 });
    expect(outcome.captureError).toBeUndefined();
    expect(outcome.marker).toContain('ana:capture');
    expect(outcome.marker).toContain('verdict=pass');
    expect(outcome.marker).not.toContain('bytes=');
    expect(outcome.marker).not.toContain('lines=');
    expect(outcome.marker!.includes('file=')).toBe(false);
    expect(outcome.marker!.split('\n')).toHaveLength(1);
    expect(outcome.verdict).toBe('pass');
    expect(outcome.exitCode).toBe(0);
  });

  it('deletes the capture log after sealing the baseline marker', () => {
    const { root, slug } = mkProject('');
    const s = script(root, 'vitest-run.cjs', '      Tests  3 passed (3)\n', 0);
    fs.writeFileSync(path.join(root, '.ana', 'ana.json'), JSON.stringify({ name: 'd', commands: { test: `${NODE} ${s}` } }));

    const now = 1700000009;
    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now });
    expect(outcome.marker).toBeDefined();
    expect(fs.existsSync(logPath(root, slug, now))).toBe(false);
  });

  it('sets a countHint naming commands.test_json when abstaining without test_json', () => {
    const { root, slug } = mkProject('');
    // Unknown runner → counts abstain; command came from `test`, not `test_json`.
    const s = script(root, 'mystery.cjs', 'bespoke harness: all good\n', 0);
    fs.writeFileSync(path.join(root, '.ana', 'ana.json'), JSON.stringify({ name: 'd', commands: { test: `${NODE} ${s}` } }));

    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now: 1700000010 });
    expect(outcome.counts).toBeNull();
    expect(outcome.verdict).toBe('abstain');
    expect(outcome.countHint).toContain('test_json');
  });

  it('suppresses the countHint when test_json IS the resolved source', () => {
    const { root, slug } = mkProject('');
    // test_json resolves and is unknown-runner → still abstains, but no hint.
    const s = script(root, 'mystery.cjs', 'bespoke harness: all good\n', 0);
    fs.writeFileSync(
      path.join(root, '.ana', 'ana.json'),
      JSON.stringify({ name: 'd', commands: { test: 'should-not-run', test_json: `${NODE} ${s}` } }),
    );

    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now: 1700000011 });
    expect(outcome.counts).toBeNull();
    expect(outcome.countHint).toBeUndefined();
  });

  // @ana A012 — a failing baseline reports a test failure (exit 1), not a capture error.
  it('exits 1 (not 3) when the baseline tests fail', () => {
    const { root, slug } = mkProject('');
    const s = script(root, 'fail.cjs', '      Tests  1 failed | 2 passed (3)\n', 1);
    fs.writeFileSync(path.join(root, '.ana', 'ana.json'), JSON.stringify({ name: 'd', commands: { test: `${NODE} ${s}` } }));

    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now: 1700000001 });
    expect(outcome.verdict).toBe('fail');
    expect(outcome.exitCode).toBe(1);
    expect(outcome.marker).toContain('verdict=fail');
  });

  // @ana A013 — a command that needs a shell is refused as a capture error (exit 3).
  it('exits 3 (capture error) when the configured command needs a shell', () => {
    const { root, slug } = mkProject('vitest run | tee out.txt');
    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now: 1700000002 });
    expect(outcome.exitCode).toBe(CAPTURE_ERROR_EXIT);
    expect(outcome.captureError).toContain('pipe');
    expect(outcome.marker).toBeUndefined();
  });

  it('still seals a capture larger than the old 8 MiB inline ceiling', () => {
    const { root, slug } = mkProject('');
    // Emit ~8.4 MiB — over the retired ceiling, well under the 64 MiB maxBuffer.
    const big = path.join(root, 'big.cjs');
    fs.writeFileSync(big, "process.stdout.write('x'.repeat(8.4*1024*1024|0));");
    fs.writeFileSync(path.join(root, '.ana', 'ana.json'), JSON.stringify({ name: 'd', commands: { test: `${NODE} ${big}` } }));

    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now: 1700000003 });
    expect(outcome.exitCode).not.toBe(CAPTURE_ERROR_EXIT);
    expect(outcome.marker).toBeDefined();
    expect(outcome.marker).toContain('ana:capture');
  });
});

describe('executeCapture — verify runs the full project', () => {
  // @ana A015 — verify seals a verify-stage marker resolved from the top-level
  // command, ignoring --surface (ignore-and-run-full).
  it('seals a stage=verify marker from the top-level command even when a surface is named', () => {
    const { root, slug } = mkProject('');
    const s = script(root, 'vitest-run.cjs', '      Tests  3 passed (3)\n', 0);
    // The surface command would ENOENT if it were (wrongly) used; the top-level
    // command runs cleanly, so a passing verify marker proves --surface is ignored.
    fs.writeFileSync(
      path.join(root, '.ana', 'ana.json'),
      JSON.stringify({
        name: 'd',
        commands: { test: `${NODE} ${s}` },
        surfaces: { cli: { commands: { test: 'definitely-not-a-real-binary-xyz123' } } },
      }),
    );

    const outcome = executeCapture({ stage: 'verify', slug, surface: 'cli', projectRoot: root, now: 1700000020 });
    expect(outcome.captureError).toBeUndefined();
    expect(outcome.marker).toContain('stage=verify');
    expect(outcome.verdict).toBe('pass');
    expect(outcome.exitCode).toBe(0);
  });
});
