# Build Report: Fix sampler budget overflow

**Created by:** AnaBuild
**Date:** 2026-05-20
**Spec:** .ana/plans/active/fix-sampler-budget-overflow/spec.md
**Branch:** feature/fix-sampler-budget-overflow

## What Was Built

- `packages/cli/src/engine/sampling/proportionalSampler.ts` (modified): Added `&& remaining > 0` guard to the first-pass loop in `allocateBudget` (line 78). Added a 3-line comment explaining shallow-priority behavior when budget < bucket count.
- `packages/cli/tests/engine/sampling/proportional-sampler.test.ts` (modified): Added 2 new tests — "respects budget when budget is smaller than depth bucket count" (budget=2, 3 depth levels) and "budget of 1 with all depth levels populated returns single file" (budget=1, 3 depth levels).

## PR Summary

- Fix `allocateBudget` budget overflow: first-pass loop now stops assigning floor-of-1 when budget is exhausted, preventing allocations that sum beyond the budget
- Add guard comment explaining shallow-priority behavior under small budgets (buckets ordered shallow/mid/deep)
- Add two regression tests covering budget=2 and budget=1 with all three depth levels populated
- Root-level allocation in `sampleFilesProportional` has the same pattern but is out of scope (protected by final trim)

## Acceptance Criteria Coverage

- AC1 "allocateBudget never returns allocations > budget" -> proportional-sampler.test.ts "respects budget when budget is smaller than depth bucket count" — `expect(files.length).toBe(2)` (budget=2, 3 buckets)
- AC2 "shallow buckets receive allocation before mid/deep" -> proportional-sampler.test.ts "respects budget when budget is smaller than depth bucket count" — `expect(hasShallowFile).toBe(true)`
- AC3 "comment at the guard explains shallow-priority" -> proportionalSampler.ts lines 76-79, 3-line comment present
- AC4 "test with small budget verifying total ≤ budget" -> both new tests assert `files.length` equals budget
- AC5 "existing sampler tests pass unchanged" -> 8 original tests pass, 0 modified
- AC6 "tests pass with project test command" -> `pnpm run test -- --run`: 2715 passed, 2 skipped
- AC7 "no build errors" -> `pnpm run build` succeeds, pre-commit hook passes (typecheck + lint)

## Implementation Decisions

None. The spec was unambiguous — the fix is a single `&& remaining > 0` condition and a comment.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run tests/engine/sampling/)
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  354ms
```

### After Changes
```
(cd packages/cli && pnpm vitest run tests/engine/sampling/)
 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  440ms
```

### Full Suite
```
pnpm run test -- --run
 Test Files  120 passed (120)
      Tests  2715 passed | 2 skipped (2717)
   Duration  70.34s
```

### Comparison
- Tests added: 2
- Tests removed: 0
- Regressions: none

### New Tests Written
- `proportional-sampler.test.ts`: "respects budget when budget is smaller than depth bucket count" (budget=2, asserts length=2 and shallow present), "budget of 1 with all depth levels populated returns single file" (budget=1, asserts length=1)

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run tests/engine/sampling/)
pnpm run test -- --run
pnpm run lint
```

## Git History
```
293c3991 [fix-sampler-budget-overflow] Add tests for budget < bucket count scenarios
a77c9801 [fix-sampler-budget-overflow] Guard allocateBudget first-pass against budget exhaustion
```

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
