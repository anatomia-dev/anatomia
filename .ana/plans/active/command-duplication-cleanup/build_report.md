# Build Report: Command File Duplication Cleanup

**Created by:** AnaBuild
**Date:** 2026-05-20
**Spec:** .ana/plans/active/command-duplication-cleanup/spec.md
**Branch:** feature/command-duplication-cleanup

## What Was Built
- `packages/cli/src/commands/work.ts` (modified): Hoisted the resolves-counting loop above the JSON/console output branch so it runs once instead of duplicated in each branch. Replaced inline `runGit(['rev-parse', '--abbrev-ref', 'HEAD'])` with `getCurrentBranch() ?? '(unknown)'` in the startWork resume path.
- `packages/cli/src/commands/proof.ts` (modified): Extracted the 11-field zeroed-out audit matrix to `EMPTY_AUDIT_MATRIX` constant used at both early-return paths. Removed `pullBeforeRead` and `commitAndPushProofChanges` function definitions. Added imports of both from `../utils/git-operations.js`. Removed unused `spawnSync` import from `node:child_process`.
- `packages/cli/src/utils/git-operations.ts` (modified): Added `pullBeforeRead` and `commitAndPushProofChanges` as exported functions at the end of the file, after `getCurrentBranch`. Functions preserved exactly — same JSDoc, same signatures, same implementation.
- `packages/cli/src/commands/learn.ts` (modified): Changed import of `commitAndPushProofChanges` and `pullBeforeRead` from `'./proof.js'` to merged into the existing `'../utils/git-operations.js'` import line. Removed the `./proof.js` import entirely.

## PR Summary

- Deduplicate resolves-counting loop in `completeWork` — computed once before the JSON/console branch instead of identically in each
- Replace inline `runGit rev-parse` with `getCurrentBranch()` in startWork resume path, matching the pattern used everywhere else in work.ts
- Extract 11-field empty audit matrix to `EMPTY_AUDIT_MATRIX` constant in proof.ts, eliminating identical object literals at two call sites
- Move `pullBeforeRead` and `commitAndPushProofChanges` from proof.ts to git-operations.ts — they're git utilities, not proof commands
- Update learn.ts to import from git-operations.js instead of cross-importing from sibling command file proof.js

## Acceptance Criteria Coverage

- AC1 "Resolves counting computed once" → work.ts: `resolvesClaimsCount` loop hoisted to line 1849 before `if (options?.json)` branch, used in both branches (verified by 215 work.test.ts tests passing)
- AC2 "getCurrentBranch instead of inline runGit" → work.ts: line 1931 now reads `getCurrentBranch() ?? '(unknown)'` (verified by work.test.ts passing)
- AC3 "Empty audit matrix extracted to constant" → proof.ts: `EMPTY_AUDIT_MATRIX` defined at line ~142 (verified by 257 proof.test.ts tests passing)
- AC4 "pullBeforeRead and commitAndPushProofChanges exported from git-operations.ts" → git-operations.ts: both functions added after `getCurrentBranch` (verified by typecheck and all tests passing)
- AC5 "learn.ts imports from git-operations.js" → learn.ts line 17: single import line from `'../utils/git-operations.js'` (verified by typecheck)
- AC6 "All existing tests pass without modification" → 2713 passed, 2 skipped — identical to baseline. Zero test files modified.
- AC7 "isTimestampRecent remains unchanged" → NO TEST (structural criterion — function exists unchanged in work.ts, verified by grep)
- AC8 "No build errors" → typecheck passes, tsup build succeeds
- AC9 "No new lint violations" → lint reports only pre-existing warning in git-operations.ts:198

## Implementation Decisions

- **Combined commit 2:** The spec planned separate commits for proof.ts/git-operations.ts and learn.ts, but the pre-commit hook runs typecheck which fails when proof.ts removes exports that learn.ts still imports. Combined all three files into one commit to keep every commit green.
- **Comment numbering:** Updated step comments in work.ts from "14. Print summary" to "14. Count resolution claims" and "15. Print summary" to reflect the new code structure.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run)
 Test Files  120 passed (120)
      Tests  2713 passed | 2 skipped (2715)
   Duration  46.32s
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run)
 Test Files  120 passed (120)
      Tests  2713 passed | 2 skipped (2715)
   Duration  44.47s
```

### Comparison
- Tests added: 0
- Tests removed: 0
- Regressions: none

### New Tests Written
None — pure refactor, no new behavior. Existing 2713 tests serve as regression coverage.

## Verification Commands
```bash
(cd 'packages/cli' && pnpm run build)
(cd 'packages/cli' && pnpm vitest run tests/commands/work.test.ts)
(cd 'packages/cli' && pnpm vitest run tests/commands/proof.test.ts)
(cd 'packages/cli' && pnpm vitest run)
(cd 'packages/cli' && pnpm run lint)
```

## Git History
```
0bfa8fdd [command-duplication-cleanup] Extract constant, move git functions, update imports
73a0f276 [command-duplication-cleanup] Hoist resolves counting and use getCurrentBranch
```

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive for `no-control-regex`. Not introduced by this build, flagged in 10+ prior verify cycles. Not fixed per spec constraint.

Verified complete by second pass.
