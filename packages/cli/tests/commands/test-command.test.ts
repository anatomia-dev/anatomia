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
 * `ana test` orchestrator tests — exit-code contract, sealed marker, and the
 * checkpoint degrade-to-raw path. Bonus coverage beyond the contract's listed
 * test files; tags map to the orchestrator-level assertions (A002, A023, A028).
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
  it('reads top-level commands.test', () => {
    expect(resolveTestCommandString({ commands: { test: 'vitest run' } }, undefined)).toBe('vitest run');
  });

  // @ana A024
  it('prefers a surface test_json override when present (opt-in structured)', () => {
    const ana = { surfaces: { cli: { commands: { test: 'vitest run', test_json: 'vitest run --reporter=json' } } } };
    expect(resolveTestCommandString(ana, 'cli')).toBe('vitest run --reporter=json');
  });

  it('falls back to the surface commands.test without test_json', () => {
    const ana = { surfaces: { cli: { commands: { test: 'vitest run' } } } };
    expect(resolveTestCommandString(ana, 'cli')).toBe('vitest run');
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
  // @ana A002
  it('emits a sealed marker on a passing baseline run (exit 0)', () => {
    const { root, slug } = mkProject('');
    // The script name carries the runner so inferRunner identifies it (counts
    // are hint-only — unhinted output abstains by design).
    const s = script(root, 'vitest-run.cjs', '      Tests  3 passed (3)\n', 0);
    fs.writeFileSync(path.join(root, '.ana', 'ana.json'), JSON.stringify({ name: 'd', commands: { test: `${NODE} ${s}` } }));

    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now: 1700000000 });
    expect(outcome.captureError).toBeUndefined();
    expect(outcome.marker).toContain('ana:capture');
    expect(outcome.marker).toContain('verdict=pass');
    expect(outcome.verdict).toBe('pass');
    expect(outcome.exitCode).toBe(0);
    // the capture file was written
    expect(fs.existsSync(path.join(root, '.ana', 'plans', 'active', slug, outcome.file!))).toBe(true);
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

  // @ana A028
  it('exits 3 (capture error) when the configured command needs a shell', () => {
    const { root, slug } = mkProject('vitest run | tee out.txt');
    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now: 1700000002 });
    expect(outcome.exitCode).toBe(CAPTURE_ERROR_EXIT);
    expect(outcome.captureError).toContain('pipe');
    expect(outcome.marker).toBeUndefined();
  });

  // @ana A028
  it('exits 3 (capture error) when output exceeds the 8 MiB inline ceiling', () => {
    const { root, slug } = mkProject('');
    // Emit ~8.4 MiB so the ceiling fails closed.
    const big = path.join(root, 'big.cjs');
    fs.writeFileSync(big, "process.stdout.write('x'.repeat(8.4*1024*1024|0));");
    fs.writeFileSync(path.join(root, '.ana', 'ana.json'), JSON.stringify({ name: 'd', commands: { test: `${NODE} ${big}` } }));

    const outcome = executeCapture({ stage: 'build', slug, projectRoot: root, now: 1700000003 });
    expect(outcome.exitCode).toBe(CAPTURE_ERROR_EXIT);
    expect(outcome.captureError).toContain('inline ceiling');
    expect(outcome.marker).toBeUndefined();
  });
});

describe('executeCapture — checkpoint', () => {
  // @ana A023
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
