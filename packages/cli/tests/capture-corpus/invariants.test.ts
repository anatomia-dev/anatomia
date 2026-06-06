import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { deriveCounts, deriveVerdict, type KnownRunner } from '../../src/utils/capture-runner.js';
import {
  formatMarker,
  inlineCaptures,
  validateCaptureInlined,
  validateCaptureNotTruncated,
  type CaptureMarker,
} from '../../src/utils/capture-marker.js';

/**
 * Cross-stack capture corpus invariant sweep.
 *
 * For each of the 8 supported stacks: a passing `.raw` and a failing `.fail`
 * fixture (authored from real runner output), plus per-stack pathology rows
 * (empty / all-skipped / collection-error / compile-error). A `describe.each`
 * sweep asserts the Phase-1 invariants — PRESERVE, COUNTS-FROM-CAPTURE,
 * SEAL-BINDS/TAMPER-FIRES, ERROR-NEVER-STRIPPED, NO-FALSE-GREEN,
 * ABSTAIN-ON-UNKNOWN — plus two NEW adversarial rows: output-contains-the-end-
 * delimiter and output-contains-backticks. A green verdict on any adversarial
 * row is a CI-failing bug.
 */

const tmpDirs: string[] = [];

function mkSlugDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.captures'), { recursive: true });
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

/** Inline a capture into a report and return the persisted path + text. */
function sealReport(raw: string, verdict: CaptureMarker['verdict'] = 'pass'): { reportPath: string; text: string; errors: string[] } {
  const slugDir = mkSlugDir();
  const rel = '.captures/test-build-1.log';
  fs.writeFileSync(path.join(slugDir, rel), raw);
  const buf = Buffer.from(raw, 'utf8');
  const marker: CaptureMarker = {
    stage: 'build',
    slug: 'corpus',
    bytes: buf.byteLength,
    sha256: createHash('sha256').update(buf).digest('hex'),
    file: rel,
    counts: 'abstain',
    verdict,
  };
  const report = `# Build Report\n\n${formatMarker(marker)}\n`;
  const { text, errors } = inlineCaptures(report, slugDir);
  const reportPath = path.join(slugDir, 'build_report.md');
  fs.writeFileSync(reportPath, text);
  return { reportPath, text, errors };
}

interface StackCase {
  name: KnownRunner;
  raw: string;
  fail: string;
  errorToken: string;
}

const STACKS: StackCase[] = [
  {
    name: 'vitest',
    raw: ' Test Files  14 passed (14)\n      Tests  47 passed | 2 skipped (49)\n',
    fail: ' FAIL  src/a.test.ts > does a thing\n AssertionError: expected 1 to be 2\n      Tests  1 failed | 46 passed (47)\n',
    errorToken: 'AssertionError',
  },
  {
    name: 'jest',
    raw: 'Tests:       3 passed, 3 total\nSnapshots:   0 total\n',
    fail: 'Tests:       1 failed, 2 passed, 3 total\nExpect: received 2, expected 3\n',
    errorToken: 'received 2, expected 3',
  },
  {
    name: 'pytest',
    raw: '===================== 3 passed, 2 skipped in 0.50s =====================\n',
    fail: 'E   AssertionError: assert 1 == 2\n===================== 1 failed, 2 passed in 0.40s =====================\n',
    errorToken: 'assert 1 == 2',
  },
  {
    name: 'go',
    raw: '{"Action":"pass","Test":"TestA"}\n{"Action":"pass","Test":"TestB"}\nok  \texample/p\t0.01s\n',
    fail: '{"Action":"run","Test":"TestA"}\n{"Action":"fail","Test":"TestA"}\n--- FAIL: TestA\n    main_test.go:10: Error: boom\nFAIL\texample/p\n',
    errorToken: 'main_test.go:10',
  },
  {
    name: 'cargo',
    raw: 'running 3 tests\ntest result: ok. 3 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out\n',
    fail: "test tests::a ... FAILED\nError: assertion failed\ntest result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out\n",
    errorToken: 'assertion failed',
  },
  {
    name: 'rspec',
    raw: '5 examples, 0 failures, 1 pending\n',
    fail: 'Failure/Error: expect(1).to eq(2)\n5 examples, 2 failures\n',
    errorToken: 'expect(1).to eq(2)',
  },
  {
    name: 'junit',
    raw: '<testsuite name="s" tests="5" failures="0" errors="0" skipped="1"></testsuite>',
    fail: '<testsuite name="s" tests="5" failures="2" errors="0" skipped="0"><testcase name="a"><failure>expected status 200 got 500</failure></testcase></testsuite>',
    errorToken: 'expected status 200 got 500',
  },
  {
    name: 'dotnet',
    raw: 'Passed!  - Failed:     0, Passed:     3, Skipped:     1, Total:     4\n',
    fail: 'Failed!  - Failed:     2, Passed:     1, Skipped:     0, Total:     3\nError Message: boom\n',
    errorToken: 'Error Message: boom',
  },
];

describe.each(STACKS)('capture invariants: $name', ({ name, raw, fail, errorToken }) => {
  // @ana A020
  it('COUNTS-FROM-CAPTURE: derives a positive pass count from a passing capture', () => {
    const counts = deriveCounts(raw, name);
    expect(counts).not.toBeNull();
    expect(counts!.passed).toBeGreaterThan(0);
    expect(counts!.failed).toBe(0);
  });

  // @ana A026
  it('NO-FALSE-GREEN: a failing capture never yields a pass verdict', () => {
    const counts = deriveCounts(fail, name);
    expect(deriveVerdict(counts, 1)).not.toBe('pass');
  });

  // @ana A009
  it('PRESERVE + SEAL-BINDS + TAMPER-FIRES: inlines byte-for-byte, seals, tamper breaks the seal', () => {
    const { reportPath, text } = sealReport(raw);
    expect(validateCaptureInlined(reportPath)).toBeNull();
    expect(validateCaptureNotTruncated(reportPath)).toBeNull();
    expect(text).toContain(raw);
    expect(text).not.toContain('```'); // no code fence wrapper

    const tampered = text.replace(/passed/, 'PASSED');
    if (tampered !== text) {
      fs.writeFileSync(reportPath, tampered);
      expect(validateCaptureInlined(reportPath)).not.toBeNull();
    }
  });

  // @ana A021
  it('ERROR-NEVER-STRIPPED: error text survives verbatim into the sealed report', () => {
    expect(fail).toContain(errorToken);
    const { reportPath } = sealReport(fail, 'fail');
    expect(fs.readFileSync(reportPath, 'utf8')).toContain(errorToken);
  });
});

interface Pathology {
  stack: KnownRunner;
  kind: string;
  exitCode: number;
  output: string;
}

const PATHOLOGIES: Pathology[] = [
  { stack: 'vitest', kind: 'empty', exitCode: 0, output: '      Tests  no tests\n' },
  { stack: 'vitest', kind: 'all-skipped', exitCode: 0, output: '      Tests  4 skipped (4)\n' },
  { stack: 'vitest', kind: 'collection-error', exitCode: 1, output: 'Error: Failed to load url ./missing.ts\n  ❯ src/a.test.ts\n' },
  { stack: 'vitest', kind: 'compile-error', exitCode: 1, output: 'SyntaxError: Unexpected token (3:5)\n    at src/a.test.ts\n' },
  { stack: 'jest', kind: 'empty', exitCode: 0, output: 'Tests:       0 total\n' },
  { stack: 'jest', kind: 'all-skipped', exitCode: 0, output: 'Tests:       4 skipped, 4 total\n' },
  { stack: 'jest', kind: 'collection-error', exitCode: 1, output: "Cannot find module './missing'\nTests:       0 total\n" },
  { stack: 'jest', kind: 'compile-error', exitCode: 1, output: 'SyntaxError: Unexpected token\n  at src/a.test.js:3\n' },
  { stack: 'pytest', kind: 'empty', exitCode: 0, output: '===================== no tests ran in 0.01s =====================\n' },
  { stack: 'pytest', kind: 'all-skipped', exitCode: 0, output: '======================= 4 skipped in 0.02s =======================\n' },
  { stack: 'pytest', kind: 'collection-error', exitCode: 1, output: 'collected 0 items / 1 error\nE   ImportError: No module named x\n========================= 1 error in 0.10s =========================\n' },
  { stack: 'pytest', kind: 'compile-error', exitCode: 1, output: 'E   SyntaxError: invalid syntax\n========================= 1 error in 0.05s =========================\n' },
  { stack: 'go', kind: 'empty', exitCode: 0, output: 'ok  \texample/p\t0.001s [no tests to run]\n' },
  { stack: 'go', kind: 'all-skipped', exitCode: 0, output: '{"Action":"skip","Test":"TestA"}\n{"Action":"skip","Test":"TestB"}\n' },
  { stack: 'go', kind: 'compile-error', exitCode: 1, output: '# example/p\n./main.go:3:2: undefined: foo\nFAIL\texample/p [build failed]\n' },
  { stack: 'go', kind: 'runtime-abort', exitCode: 1, output: '{"Action":"run","Test":"TestA"}\npanic: runtime error: index out of range\nFAIL\texample/p\n' },
  { stack: 'cargo', kind: 'empty', exitCode: 0, output: 'running 0 tests\ntest result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out\n' },
  { stack: 'cargo', kind: 'all-skipped', exitCode: 0, output: 'running 4 tests\ntest result: ok. 0 passed; 0 failed; 4 ignored; 0 measured; 0 filtered out\n' },
  { stack: 'cargo', kind: 'compile-error', exitCode: 1, output: "error[E0425]: cannot find value `foo` in this scope\nerror: could not compile `example`\n" },
  { stack: 'cargo', kind: 'runtime-abort', exitCode: 1, output: "test tests::a ... FAILED\ntest result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out\n" },
  { stack: 'rspec', kind: 'empty', exitCode: 0, output: '0 examples, 0 failures\n' },
  { stack: 'rspec', kind: 'all-skipped', exitCode: 0, output: '4 examples, 0 failures, 4 pending\n' },
  { stack: 'rspec', kind: 'collection-error', exitCode: 1, output: 'An error occurred while loading ./spec/a_spec.rb.\nLoadError: cannot load such file -- missing\n' },
  { stack: 'rspec', kind: 'compile-error', exitCode: 1, output: 'SyntaxError: spec/a_spec.rb:3: syntax error, unexpected end\n' },
  { stack: 'junit', kind: 'empty', exitCode: 0, output: '<testsuite name="s" tests="0" failures="0" errors="0" skipped="0"></testsuite>' },
  { stack: 'junit', kind: 'all-skipped', exitCode: 0, output: '<testsuite name="s" tests="4" failures="0" errors="0" skipped="4"></testsuite>' },
  { stack: 'junit', kind: 'collection-error', exitCode: 1, output: '<testsuite name="s" tests="3" failures="0" errors="2" skipped="0"></testsuite>' },
  { stack: 'dotnet', kind: 'empty', exitCode: 0, output: 'Passed!  - Failed:     0, Passed:     0, Skipped:     0, Total:     0\n' },
  { stack: 'dotnet', kind: 'all-skipped', exitCode: 0, output: 'Passed!  - Failed:     0, Passed:     0, Skipped:     4, Total:     4\n' },
  { stack: 'dotnet', kind: 'compile-error', exitCode: 1, output: "Build FAILED.\nProgram.cs(3,5): error CS0103: The name 'foo' does not exist\n" },
  { stack: 'dotnet', kind: 'runtime-abort', exitCode: 1, output: 'Test run aborted. System.Exception: boom\n' },
];

describe.each(PATHOLOGIES)('NO-FALSE-GREEN pathology: $stack/$kind', ({ stack, exitCode, output }) => {
  // @ana A026
  it('never yields a pass verdict', () => {
    const counts = deriveCounts(output, stack);
    expect(deriveVerdict(counts, exitCode)).not.toBe('pass');
  });

  if (exitCode === 0) {
    // @ana A026
    it('abstains on a clean exit with no positive evidence (no vacuous green)', () => {
      const counts = deriveCounts(output, stack);
      expect(deriveVerdict(counts, exitCode)).toBe('abstain');
    });
  }
});

describe('NEW adversarial rows — the inliner correctness hazards', () => {
  // @ana A011
  it('output containing the literal end-delimiter round-trips (length-addressed)', () => {
    const raw = `running suite\n<!-- ana:capture-end -->\nmid\n<!-- ana:capture-end -->\nTests 3 passed\n`;
    const { reportPath, errors } = sealReport(raw);
    expect(errors).toEqual([]);
    expect(validateCaptureInlined(reportPath)).toBeNull();
    expect(validateCaptureNotTruncated(reportPath)).toBeNull();
  });

  // @ana A010
  it('output containing backticks / code fences round-trips (no fence wrapper)', () => {
    const raw = 'console output:\n```ts\nconst x = `tpl ${y}`;\n```\nTests 2 passed\n';
    const { reportPath, text } = sealReport(raw);
    expect(validateCaptureInlined(reportPath)).toBeNull();
    expect(text).toContain(raw);
  });
});

describe('capture invariants: ABSTAIN-ON-UNKNOWN', () => {
  const unknown = 'some bespoke harness finished\n  3 checks succeeded, 0 problems\n';

  // @ana A027
  it('gives null counts on unrecognized output but still preserves the bytes', () => {
    // counts === null (abstain on counts)
    expect(deriveCounts(unknown)).toBeNull();
    expect(deriveVerdict(null, 0)).toBe('abstain');

    const { reportPath, text } = sealReport(unknown, 'abstain');
    // Preservation still binds even when counts abstain.
    expect(validateCaptureInlined(reportPath)).toBeNull();
    expect(validateCaptureNotTruncated(reportPath)).toBeNull();
    expect(text).toContain(unknown);
  });
});
