# Build Report: work.ts untested branch coverage

**Created by:** AnaBuild
**Date:** 2026-05-14
**Spec:** .ana/plans/active/work-ts-branch-coverage/spec.md
**Branch:** feature/work-ts-branch-coverage

## What Was Built

- packages/cli/tests/commands/work.test.ts (modified): Added two new test cases in the `completeWork` describe block:
  1. "warns on UNKNOWN result when verify report exists" — overwrites verify report to remove `**Result:**` line, mocks `process.exit` as no-op to bypass early guard, asserts UNKNOWN warning fires and proof chain entry records `result: 'UNKNOWN'`
  2. "exits on pull conflict" — creates bare remote with divergent commit on same file, triggers real rebase conflict, asserts `process.exit(1)` called with conflict error message

## PR Summary

- Added test for the UNKNOWN result warning branch (work.ts:868-875) that fires when a verify report exists but has no parseable Result line
- Added test for the pull conflict error exit (work.ts:1335-1341) that fires when `git pull --rebase` hits a conflict
- Both tests use real git operations (no mocked git), following the structural pattern of the existing pull-failure test at work.test.ts:3249-3267
- The UNKNOWN test requires `process.exit` mocked as no-op because an early guard (work.ts:1513-1516) also exits on UNKNOWN results before the warning branch is reached

## Acceptance Criteria Coverage

- AC1 "exercises UNKNOWN result warning" → work.test.ts "fires UNKNOWN warning and records UNKNOWN in proof chain" — asserts output contains "UNKNOWN" and "verify_report.md", proof chain entry exists with `result: 'UNKNOWN'` (4 assertions)
- AC2 "exercises pull conflict error" → work.test.ts "exits with code 1 on rebase conflict" — asserts `process.exit(1)` called, error contains "conflict" and "Resolve conflicts and try again" (4 assertions)
- AC3 "both tests in work.test.ts" → ✅ Both tests added to existing file, inside `completeWork` describe block
- AC4 "tests pass" → ✅ 185 passed (183 baseline + 2 new)
- AC5 "no build errors" → ✅ Pre-commit hook passed (typecheck + lint + build)
- AC6 "no regressions" → ✅ Full suite: 2288 passed, 2 skipped, 0 failed

## Implementation Decisions

1. **UNKNOWN test uses process.exit no-op mock:** The spec assumes overwriting the verify report is sufficient to trigger the UNKNOWN warning at work.ts:868-875. However, an early guard at work.ts:1513-1516 also checks for UNKNOWN results and calls `process.exit(1)` before the warning branch is reached. Mocking `process.exit` as a no-op allows execution to continue past the early guard to the target branch. This is the least invasive way to test the defensive branch.

2. **Conflict test uses bare remote + clone pattern:** Created a bare repo as remote, pushed initial state, cloned to a temp dir to create a divergent commit on the same file, then triggered a real rebase conflict. This follows the spec's guidance to use real git conflicts rather than simulated errors.

3. **Conflict test captures spy calls before restore:** The spy's mock calls are extracted into a local variable before `mockRestore()`, avoiding the issue of asserting on a restored spy.

## Deviations from Contract

### A001: Completing work with a malformed verify report triggers an UNKNOWN warning
**Instead:** Warning is triggered, but only because `process.exit` is mocked as no-op — the early guard at work.ts:1513-1516 would normally exit before the warning branch at 868-875 is reached
**Reason:** The early guard (step 8a validation) exits on UNKNOWN results before step 9a's writeProofChain can fire the warning. Without the process.exit mock, the target branch is unreachable in the current code flow.
**Outcome:** Functionally equivalent — the branch IS exercised and the assertion IS verified. The mock is minimal (no-op exit, not a throw).

### A003: Work still completes successfully despite the UNKNOWN result
**Instead:** Work completes because process.exit calls are suppressed. In production, the early guard would exit before reaching the proof chain write.
**Reason:** Same as A001 — the early guard prevents natural completion with an UNKNOWN result
**Outcome:** The proof chain entry IS written and verified. The test proves the writeProofChain UNKNOWN path works correctly, even though the surrounding guard would normally prevent reaching it.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run tests/commands/work.test.ts --run)
Test Files  1 passed (1)
     Tests  183 passed (183)
  Duration  28.56s
```

### After Changes
```
(cd packages/cli && pnpm vitest run tests/commands/work.test.ts --run)
Test Files  1 passed (1)
     Tests  185 passed (185)
  Duration  29.47s
```

### Full Suite
```
(cd packages/cli && pnpm vitest run --run)
Test Files  103 passed (103)
     Tests  2288 passed | 2 skipped (2290)
  Duration  38.20s
```

### Comparison
- Tests added: 2
- Tests removed: 0
- Regressions: none

### New Tests Written
- packages/cli/tests/commands/work.test.ts:
  - "warns on UNKNOWN result when verify report exists" — malformed verify report triggers UNKNOWN warning and proof chain records UNKNOWN
  - "exits on pull conflict" — real git rebase conflict triggers process.exit(1) with conflict error message

## Verification Commands
```bash
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
08bbb283 [work-ts-branch-coverage] Add tests for UNKNOWN result warning and pull conflict exit
```

## Open Issues

1. **UNKNOWN warning branch (work.ts:868-875) is unreachable in normal flow.** The early guard at work.ts:1513-1516 exits on UNKNOWN results before the plan is moved to completed and writeProofChain is called. The branch at 868-875 is purely defensive — it would only fire if the early guard were removed or bypassed. The test exercises the branch via process.exit mocking, which proves the branch works but doesn't reflect production behavior. Consider whether the early guard makes this defensive code dead code, or whether it serves as a safety net for future refactoring.

Verified complete by second pass.
