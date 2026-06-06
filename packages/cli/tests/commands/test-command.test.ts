import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  executeCapture,
  resolveTestCommandString,
  inferRunner,
  isCheckpointSealConflict,
  CAPTURE_ERROR_EXIT,
} from '../../src/commands/test.js';

/**
 * `ana test` orchestrator tests — exit-code contract, the compact sealed marker
 * (counts/verdict/sha256/bytes/lines, no file), log deletion after sealing, the
 * abstain discoverability hint, the removed-ceiling seal, and the checkpoint
 * degrade-to-raw path. Tags map to the orchestrator-level contract assertions.
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

describe('isCheckpointSealConflict', () => {
  it('refuses an explicit --stage build with a passthrough (the incident form)', () => {
    expect(isCheckpointSealConflict('build', 'cli', ['vitest', 'run'])).toBe(true);
  });

  it('refuses an explicit --stage verify with a passthrough (same class of contradiction)', () => {
    expect(isCheckpointSealConflict('verify', 'cli', ['vitest', 'run'])).toBe(true);
  });

  it('allows a bare checkpoint — default stage + passthrough is legitimate', () => {
    expect(isCheckpointSealConflict('build', 'default', ['vitest', 'run'])).toBe(false);
  });

  it('allows an explicit sealing stage with NO passthrough (the baseline seal)', () => {
    expect(isCheckpointSealConflict('build', 'cli', [])).toBe(false);
    expect(isCheckpointSealConflict('verify', 'cli', [])).toBe(false);
  });

  it('does not refuse when the stage source is unknown (no false positives)', () => {
    expect(isCheckpointSealConflict('build', undefined, ['vitest'])).toBe(false);
  });
});

describe('resolveTestCommandString', () => {
  it('reads top-level commands.test and reports the source', () => {
    expect(resolveTestCommandString({ commands: { test: 'vitest run' } }, undefined)).toEqual({
      command: 'vitest run',
      source: 'test',
    });
  });

  // @ana A007 — prefers top-level test_json over test and reports source 'test_json'.
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

  // @ana A001, A002, A003 — a passing baseline emits a ONE-LINE compact marker
  // that carries counts/verdict/sha256/bytes/lines and drops the file field.
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
    expect(outcome.marker).toContain('lines=');
    expect(outcome.marker!.includes('file=')).toBe(false);
    expect(outcome.marker!.split('\n')).toHaveLength(1);
    expect(outcome.lines).toBe(1);
    expect(outcome.verdict).toBe('pass');
    expect(outcome.exitCode).toBe(0);
  });

  // @ana A015 — the .captures log is deleted after the result is sealed.
  it('deletes the capture log after sealing the baseline marker', () => {
    const { root, slug } = mkProject('');
    const s = script(root, 'vitest-run.cjs', '      Tests  3 passed (3)\n', 0);
    fs.writeFileSync(path.join(root, '.ana', 'ana.json'), JSON.stringify({ name: 'd', commands: { test: `${NODE} ${s}` } }));

    const now = 1700000009;
    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now });
    expect(outcome.marker).toBeDefined();
    expect(fs.existsSync(logPath(root, slug, now))).toBe(false);
  });

  // @ana A025 — abstaining WITHOUT a test_json source sets the discoverability hint.
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

  it('exits 1 (not 3) when the baseline tests fail', () => {
    const { root, slug } = mkProject('');
    const s = script(root, 'fail.cjs', '      Tests  1 failed | 2 passed (3)\n', 1);
    fs.writeFileSync(path.join(root, '.ana', 'ana.json'), JSON.stringify({ name: 'd', commands: { test: `${NODE} ${s}` } }));

    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now: 1700000001 });
    expect(outcome.verdict).toBe('fail');
    expect(outcome.exitCode).toBe(1);
    expect(outcome.marker).toContain('verdict=fail');
  });

  it('exits 3 (capture error) when the configured command needs a shell', () => {
    const { root, slug } = mkProject('vitest run | tee out.txt');
    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now: 1700000002 });
    expect(outcome.exitCode).toBe(CAPTURE_ERROR_EXIT);
    expect(outcome.captureError).toContain('pipe');
    expect(outcome.marker).toBeUndefined();
  });

  // @ana A027, A028 — a capture over the OLD 8 MiB ceiling still seals compactly
  // and does NOT exit with the capture-error code (the ceiling was removed).
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
    expect(outcome.bytes).toBeGreaterThan(8 * 1024 * 1024);
  });
});

describe('executeCapture — checkpoint', () => {
  it('degrades to raw and does NOT block on a checkpoint capture bug', () => {
    const { root, slug } = mkProject('');
    const outcome = executeCapture({
      stage: 'build',
      slug,
      passthrough: ['definitely-not-a-real-binary-xyz123'],
      projectRoot: root,
      now: 1700000004,
    });
    expect(outcome.mode).toBe('checkpoint');
    expect(outcome.degradedToRaw).toBe(true);
    expect(outcome.exitCode).not.toBe(CAPTURE_ERROR_EXIT); // never the capture/seal code
  });

  it('captures a clean checkpoint without sealing a marker', () => {
    const { root, slug } = mkProject('');
    const s = script(root, 'chk.cjs', 'Tests  2 passed (2)\n', 0);
    const outcome = executeCapture({
      stage: 'build',
      slug,
      passthrough: [`${NODE}`, s],
      projectRoot: root,
      now: 1700000005,
    });
    expect(outcome.mode).toBe('checkpoint');
    expect(outcome.degradedToRaw).toBe(false);
    expect(outcome.marker).toBeUndefined();
    expect(outcome.exitCode).toBe(0);
  });

  it('passes a pre-tokenized argv through VERBATIM (no quoting loss)', () => {
    const { root, slug } = mkProject('');
    // Echo argv beyond `node <script>` as JSON, so we can prove a multi-word
    // arg survived as ONE token instead of being re-split by the string parser.
    const echo = path.join(root, 'echo-argv.cjs');
    fs.writeFileSync(echo, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));process.exit(0);');
    const outcome = executeCapture({
      stage: 'build',
      slug,
      passthrough: [NODE, echo, '-k', 'alpha and beta'],
      projectRoot: root,
      now: 1700000006,
    });
    expect(outcome.mode).toBe('checkpoint');
    expect(outcome.degradedToRaw).toBe(false);
    // The argv arrives intact; the old join(' ')+re-parse split it into
    // ["-k","alpha","and","beta"], which this assertion would catch.
    expect(outcome.rawText).toContain('["-k","alpha and beta"]');
  });

  it('infers a runner hint from a checkpoint command and derives counts', () => {
    const { root, slug } = mkProject('');
    // Name the runner in the command so inferRunner picks it up; vitest-shaped
    // summary then yields a real count even on a checkpoint.
    const vitestish = script(root, 'vitest', ' Test Files  1 passed (1)\n      Tests  2 passed (2)\n', 0);
    const outcome = executeCapture({
      stage: 'build',
      slug,
      passthrough: [NODE, vitestish],
      projectRoot: root,
      now: 1700000007,
    });
    expect(outcome.mode).toBe('checkpoint');
    expect(outcome.counts).toEqual({ passed: 2, failed: 0, skipped: 0 });
  });
});
