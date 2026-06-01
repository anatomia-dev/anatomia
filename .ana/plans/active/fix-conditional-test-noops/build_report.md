# Build Report: Fix Conditional Test No-Ops

**Created by:** AnaBuild
**Date:** 2026-06-01
**Spec:** .ana/plans/active/fix-conditional-test-noops/spec.md
**Branch:** feature/fix-conditional-test-noops

## What Was Built

- `packages/cli/tests/commands/work-ci-mocked.test.ts` (modified): Added `session marker and think-time capture (mocked)` describe with 11 tests (3 `--session flag` + 8 `session consumption in startWork`). Added `createSessionTestProject` helper using `realExecSync`. Added `mockPid()` helper that configures `spawnMock` to return PID 12345 for `ps` calls. Added `fsSync` and `getWorkStatus`/`startWork` imports. The 7 PID-dependent tests now always execute their full assertion sets with deterministic PID.
- `packages/cli/tests/commands/work.test.ts` (modified): Removed `session marker and think-time capture` parent describe (11 tests, `createSessionTestProject` helper, tempDir setup/teardown). Lifted `Commander registration` and `Ana prompt --session flag` describes to standalone top-level describes. Removed `getAgentPid` from import.
- `packages/cli/tests/engine/performance/parsing-performance.test.ts` (modified): Changed all 3 test callbacks to accept `ctx` parameter. Replaced `if (files.length === 0) return` (both multi-line and single-line forms) with `ctx.skip(); return` for visible skip in test output.

## PR Summary

- Move 11 session tests from work.test.ts to work-ci-mocked.test.ts where spawnSync is already mocked, eliminating conditional PID guards that caused 7 tests to silently no-op in CI
- Mock PID deterministically (12345) so session consumption tests always execute their full assertion sets regardless of environment
- Replace silent `return` with `ctx.skip()` in 3 parsing-performance tests so empty-source-file skips appear in test output instead of phantom-passing

## Acceptance Criteria Coverage

- AC1 "All 7 session-related tests that previously guarded on `getAgentPid() === null` now run with a mocked PID" -> work-ci-mocked.test.ts: `mockPid()` called in all 7 PID-dependent tests, assertions execute unconditionally
- AC2 "The `creates session file when --session flag is set` test always executes its file-existence and content assertions" -> work-ci-mocked.test.ts: assertions are unconditional (no `if (agentPid !== null)` wrapper), uses hardcoded `session-12345.json` path
- AC3 "No test uses `if (agentPid === null) return` or `if (agentPid !== null)` as a conditional skip pattern" -> Verified: zero occurrences of these patterns in either test file
- AC4 "All 3 parsing-performance tests use `ctx.skip()` with visible skip" -> parsing-performance.test.ts: all 3 tests accept `ctx` and call `ctx.skip()` when `files.length === 0`
- AC5 "All existing tests still pass" -> 3132 passed, 2 skipped (identical to baseline)
- AC6 "Total test count remains the same or increases" -> 3132 passed (same as baseline; 11 tests moved, not added/removed)
- AC7 "Tests pass with `(cd 'packages/cli' && pnpm vitest run)`" -> Confirmed
- AC8 "No lint errors" -> Confirmed (only pre-existing warning in git-operations.ts)

## Implementation Decisions

1. **`mockPid()` helper function.** Spec suggested "configure the PID mock inside each test that needs it, or in a nested beforeEach." Chose a shared `mockPid()` function called explicitly in each test that needs it. This is clearer than a nested beforeEach (visible at the call site) and less repetitive than inline configuration in each test.

2. **`realExecSync` in `createSessionTestProject`.** Per spec's Gotchas, switched from `execSync` to `realExecSync` for consistency with `createMergedProject`, even though `execSync` isn't currently mocked (only `spawnSync` is). Prevents future breakage.

3. **Contract @ana tag remapping.** The original work.test.ts had `@ana A004`-`@ana A017` tags from a previous contract. This spec's contract has A001-A012 with different semantics. The moved tests were re-tagged to match this spec's contract assertions. The `Commander registration` and `Ana prompt` tests retain their original `@ana A015`-`@ana A017` tags since those aren't in scope for this contract.

## Deviations from Contract

### A007: No conditional PID skip pattern
**Instead:** Verified by code inspection — no `if (agentPid === null) return` pattern exists in the moved tests. This is a `pattern.absent` / `not_contains` assertion verified structurally, not by a test.
**Reason:** This assertion verifies absence of a code pattern, not behavior. It's satisfied by the code change itself (removing the guards), not by a test assertion.
**Outcome:** Fully satisfied — the pattern is absent from all moved tests.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run)
Test Files  129 passed (129)
     Tests  3132 passed | 2 skipped (3134)
  Duration  49.38s
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run)
Test Files  129 passed (129)
     Tests  3132 passed | 2 skipped (3134)
  Duration  50.35s
```

### Comparison
- Tests added: 11 (in work-ci-mocked.test.ts)
- Tests removed: 11 (from work.test.ts)
- Net change: 0
- Regressions: none

### Checkpoint Results
- work-ci-mocked.test.ts: 14 passed (3 existing + 11 new)
- work.test.ts: 231 passed (was 242, lost 11 moved tests)
- parsing-performance.test.ts: 3 passed

### Contract Coverage
- A001: tagged in work-ci-mocked.test.ts (`creates session file when --session flag is set`)
- A002: tagged in work-ci-mocked.test.ts (`uses session timestamp for work_started_at`)
- A003: tagged in work-ci-mocked.test.ts (`deletes session file before using timestamp`)
- A004: tagged in work-ci-mocked.test.ts (`writeTimestamp uses provided timestamp`)
- A005: tagged in work-ci-mocked.test.ts (`handles corrupted session file gracefully`)
- A006: tagged in work-ci-mocked.test.ts (`existing slug path does not consume session files`)
- A007: structural (pattern absence) — documented as deviation
- A008: tagged in parsing-performance.test.ts (`parses 20 files`)
- A009: tagged in parsing-performance.test.ts (`achieves >=80% cache speedup`)
- A010: tagged in parsing-performance.test.ts (`memory usage stays <=500MB`)
- A011: verified by full suite (3132 passed > 3131)
- A012: verified by full suite (3134 total > 3131)

Contract coverage: 12/12 assertions addressed.

## Verification Commands
```bash
(cd 'packages/cli' && pnpm run build)
(cd 'packages/cli' && pnpm vitest run tests/commands/work-ci-mocked.test.ts)
(cd 'packages/cli' && pnpm vitest run tests/commands/work.test.ts)
(cd 'packages/cli' && pnpm vitest run tests/engine/performance/parsing-performance.test.ts)
(cd 'packages/cli' && pnpm vitest run)
(cd 'packages/cli' && pnpm run lint)
```

## Git History
```
fa600aec [fix-conditional-test-noops] Fix parsing-performance visible skip
93b4d49b [fix-conditional-test-noops] Move session tests to mocked file
```

## Open Issues

1. **Pre-existing lint warning in git-operations.ts.** `Unused eslint-disable directive (no-control-regex)` at line 198. Not introduced by this build.

2. **`createSessionTestProject` is now the third duplicated helper.** Per proof context finding `fix-ci-matrix-and-broken-tests-C2`, `createMergedProject` was already duplicated between work-ci-mocked.test.ts and work.test.ts. This build adds a third helper (`createSessionTestProject`) in the mocked file. Extraction to shared test utils is a separate scope.

3. **A007 is a structural assertion, not a behavioral test.** The contract asserts `pattern.absent` / `not_contains` for `if (agentPid === null) return`. This is satisfied by the code change (removing guards), not by a runtime test. AnaVerify can confirm by grep.

Verified complete by second pass.
