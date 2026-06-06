import { describe, it, expect } from 'vitest';
import { deriveCounts, deriveVerdict, type KnownRunner } from '../../src/utils/capture-runner.js';

/**
 * Cross-stack capture corpus invariant sweep (count + verdict).
 *
 * For each of the 8 supported stacks: a passing `.raw` and a failing `.fail`
 * fixture (authored from real runner output), plus per-stack pathology rows
 * (empty / all-skipped / collection-error / compile-error). The sweep asserts
 * the count/verdict invariants — COUNTS-FROM-CAPTURE, NO-FALSE-GREEN,
 * ABSTAIN-ON-UNKNOWN. A green verdict on any failing/empty row is a CI-failing
 * bug.
 *
 * Preservation/inliner invariants (PRESERVE, SEAL-BINDS, ERROR-NEVER-STRIPPED,
 * the end-delimiter/backtick adversarial rows) were retired with the inliner:
 * nothing is inlined any more, so the raw bytes never enter the committed
 * report and there is no block to bind or truncate. The marker is a compact
 * attestation whose closed-token grammar is covered in capture-marker.test.ts.
 */

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

describe.each(STACKS)('capture invariants: $name', ({ name, raw, fail }) => {
  it('COUNTS-FROM-CAPTURE: derives a positive pass count from a passing capture', () => {
    const counts = deriveCounts(raw, name);
    expect(counts).not.toBeNull();
    expect(counts!.passed).toBeGreaterThan(0);
    expect(counts!.failed).toBe(0);
  });

  // @ana A011 — a failing capture never yields a pass verdict.
  it('NO-FALSE-GREEN: a failing capture never yields a pass verdict', () => {
    const counts = deriveCounts(fail, name);
    expect(deriveVerdict(counts, 1)).not.toBe('pass');
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
  // @ana A011 — never a pass verdict on a pathological run.
  it('never yields a pass verdict', () => {
    const counts = deriveCounts(output, stack);
    expect(deriveVerdict(counts, exitCode)).not.toBe('pass');
  });

  if (exitCode === 0) {
    // @ana A010, A011 — a clean exit with no positive evidence abstains.
    it('abstains on a clean exit with no positive evidence (no vacuous green)', () => {
      const counts = deriveCounts(output, stack);
      expect(deriveVerdict(counts, exitCode)).toBe('abstain');
    });
  }
});

describe('capture invariants: ABSTAIN-ON-UNKNOWN', () => {
  const unknown = 'some bespoke harness finished\n  3 checks succeeded, 0 problems\n';

  // @ana A009 — unrecognized output yields null counts and an abstain verdict.
  it('gives null counts on unrecognized output and abstains on the verdict', () => {
    expect(deriveCounts(unknown)).toBeNull();
    expect(deriveVerdict(null, 0)).toBe('abstain');
  });
});
