# Build Report: Worktree Guard Integration Tests

**Created by:** AnaBuild
**Date:** 2026-05-14
**Spec:** .ana/plans/active/worktree-guard-tests/spec.md
**Branch:** feature/worktree-guard-tests

## What Was Built

- `packages/cli/tests/commands/worktree-guards.test.ts` (created): Integration tests for all four worktree guards — init, setup complete, work complete, and scan --save. Tests use a fake `.git` file fixture to trigger `isWorktreeDirectory()` detection, then verify exit/warn behavior through Commander parseAsync (for init, setup, scan) and direct function call (for completeWork).

## PR Summary

- Add integration tests proving all four worktree guards fire correctly when running from a worktree directory
- Tests use fake `.git` file fixture (no real git worktree needed) — lightweight and fast
- Blocking guards (init, setup complete, work complete) verified to exit(1) with "main project directory" error
- Warning guard (scan --save) verified to warn about worktree without exiting
- All tests restore process state (cwd, exit mock, console spies) in afterEach

## Acceptance Criteria Coverage

- AC1 "init from worktree exits with error" → worktree-guards.test.ts "init guard" (exit(1) + message assertions)
- AC2 "setup complete from worktree exits with error" → worktree-guards.test.ts "setup complete guard" (exit(1) + message assertions)
- AC3 "completeWork from worktree exits with error" → worktree-guards.test.ts "work complete guard" (exit(1) + message assertions)
- AC4 "scan --save from worktree warns without exit" → worktree-guards.test.ts "scan --save guard" (not.toHaveBeenCalledWith(1) + warn message)
- AC5 "restores process state in afterEach" → worktree-guards.test.ts "afterEach restores process state" (cwd check)
- AC6 "all existing tests continue to pass" → Full suite: 2286 passed, 0 regressions

## Implementation Decisions

- Used `program.parseAsync(['node', 'ana', 'init'])` (default `from: 'node'`) rather than `{ from: 'user' }` — Commander expects argv[0]=node, argv[1]=program when using default parsing mode. The `{ from: 'user' }` mode strips those, causing "unknown command" errors.
- Combined exit-code and error-message assertions into single tests per guard (A001+A002 in one test, etc.) since both assertions test the same invocation — splitting would duplicate setup with no benefit.
- The A009 assertion (test isolation) is covered by a dedicated test that verifies `process.cwd()` equals `originalCwd` — this runs after all other tests, proving afterEach cleanup works.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  102 passed (102)
     Tests  2281 passed | 2 skipped (2283)
  Duration  39.32s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  103 passed (103)
     Tests  2286 passed | 2 skipped (2288)
  Duration  38.43s
```

### Comparison
- Tests added: 5
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/worktree-guards.test.ts`: init guard exit, setup complete guard exit, work complete guard exit, scan --save warn-only, afterEach state restoration

## Verification Commands
```bash
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
c7565e72 [worktree-guard-tests] Add integration tests for worktree guards
```

## Open Issues

Contract coverage: 10/10 assertions tagged (A001-A010). A001+A002 share one test, A003+A004 share one test, A005+A006 share one test, A007+A008 share one test, A009 has dedicated test, A010 verified by full suite pass.

Pre-existing lint warning in `src/utils/git-operations.ts:198` (unused eslint-disable directive) — not introduced by this build.

Verified complete by second pass.
