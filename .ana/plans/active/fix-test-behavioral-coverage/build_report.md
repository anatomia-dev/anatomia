# Build Report: Fix test behavioral coverage gaps

**Created by:** AnaBuild
**Date:** 2026-05-20
**Spec:** .ana/plans/active/fix-test-behavioral-coverage/spec.md
**Branch:** feature/fix-test-behavioral-coverage

## What Was Built

- `packages/cli/tests/commands/doctor.test.ts` (modified): Deleted the dead ternary assertion on line 430. The expression `'still scaffold'.split(' ')[0]` always evaluates to `'still'` (truthy), so the ternary always resolved to `'deployment'`, duplicating line 428. The two remaining `toContain` assertions on lines 428-429 fully satisfy A022.

- `packages/cli/tests/commands/work.test.ts` (modified): Deleted the trivial `deriveSurface` idempotency test (lines 5848-5855) — calling a pure function twice with the same inputs proves nothing beyond determinism. Added a new test in the `migration markers` describe block that exercises the `!existing.surface` backfill guard: creates an entry with `surface: 'website'` and `modules_touched: ['packages/cli/src/foo.ts']` (which derives to `'cli'`), runs backfill, and verifies the surface remains `'website'`.

## PR Summary

- Delete dead ternary assertion in doctor A022 test that always evaluated to the same branch, creating false coverage
- Replace trivial deriveSurface idempotency test with a meaningful backfill guard test
- New test proves the `!existing.surface` guard prevents overwriting entries that already have a surface value
- Uses intentional surface mismatch (entry has 'website', modules derive to 'cli') to make the assertion non-trivial
- No production code changes — test-only fixes

## Acceptance Criteria Coverage

- AC1 "doctor.test.ts line 430 deleted" -> doctor.test.ts: line removed, lines 428-429 unchanged (verified by diff) ✅
- AC2 "A022 test still passes" -> doctor.test.ts: 40 tests passed including A022 block ✅
- AC3 "trivial idempotency test replaced with backfill guard test" -> work.test.ts: old test deleted, new test creates entry with existing surface, runs backfill, verifies no overwrite ✅
- AC4 "replacement test uses surface mismatch" -> work.test.ts: entry has `surface: 'website'`, modules_touched derives to `'cli'` ✅
- AC5 "@ana A021 tag preserved" -> work.test.ts: `// @ana A021` comment on new test ✅
- AC6 "all existing tests pass unchanged" -> 2713 passed, 2 skipped (identical to baseline) ✅
- AC7 "tests pass with pnpm run test -- --run" -> confirmed ✅
- AC8 "no build errors" -> build succeeds, typecheck passes, lint clean (1 pre-existing warning in git-operations.ts) ✅

## Implementation Decisions

None — spec was fully prescriptive.

## Deviations from Contract

None — contract followed exactly.

Contract coverage: 10/10 assertions tagged.

- A001: Dead ternary removed, A022 block has exactly 2 `toContain` assertions
- A002: `toContain('deployment')` assertion preserved
- A003: `toContain('troubleshooting')` assertion preserved
- A004: `chain.entries[0].surface` equals `'website'` after backfill
- A005: `modules_touched[0]` is `'packages/cli/src/foo.ts'` (contains `packages/cli`)
- A006: No `migrations: { surface_backfill: true }` in fixture — backfill loop runs
- A007: Test has `// @ana A021` comment
- A008: Idempotency test deleted from deriveSurface block
- A009: All 2713 tests pass
- A010: Test count unchanged (1 removed, 1 added)

## Test Results

### Baseline (before changes)

```
doctor.test.ts: 1 passed (40 tests)
work.test.ts: 1 passed (215 tests)

Full suite:
 Test Files  120 passed (120)
       Tests  2713 passed | 2 skipped (2715)
```

### After Changes

```
doctor.test.ts: 1 passed (40 tests)
work.test.ts: 1 passed (215 tests)

Full suite:
 Test Files  120 passed (120)
       Tests  2713 passed | 2 skipped (2715)
```

### Comparison

- Tests added: 1
- Tests removed: 1
- Net change: 0
- Regressions: none

### New Tests Written

- `packages/cli/tests/commands/work.test.ts`: "preserves existing surface during backfill — does not overwrite" — creates an entry with pre-existing surface value and modules_touched that would derive to a different surface, verifies backfill respects the `!existing.surface` guard.

## Verification Commands

```bash
pnpm run build
(cd 'packages/cli' && pnpm vitest run tests/commands/doctor.test.ts)
(cd 'packages/cli' && pnpm vitest run tests/commands/work.test.ts)
pnpm run test -- --run
pnpm run lint
```

## Git History

```
f0cec229 [fix-test-behavioral-coverage] Replace trivial idempotency test with backfill guard test
533679db [fix-test-behavioral-coverage] Delete dead ternary in doctor A022 test
```

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
