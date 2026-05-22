# Build Report: Fix False Surface Detection

**Created by:** AnaBuild
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-false-surface-detection/spec.md
**Branch:** feature/fix-false-surface-detection

## What Was Built

- `packages/cli/src/engine/detectors/surfaces.ts` (modified): Added `EXCLUDED_SEGMENTS` private constant (22 entries), exported `isNonProductPath` predicate, and a pre-filter `continue` after the existing INFRA_PATTERNS check (line 228). The predicate checks all path segments case-insensitively against the exclusion set and applies a `-e2e` suffix check on the last segment.
- `packages/cli/src/commands/init/state.ts` (modified): Two changes — (1) `mergeSurfaces()` now uses `isNonProductPath` to silently drop non-product orphaned surfaces while keeping legitimate ones with the existing console.warn. (2) `preserveUserState()` checks if `mergeSurfaces()` returns empty and deletes the `surfaces` key instead of writing `{}`.
- `packages/cli/tests/engine/detectors/surfaces.test.ts` (modified): Added 22 new tests covering: each excluded segment category, `-e2e` suffix rule, compound names NOT excluded (`test-utils`, `demo-app`), case-insensitive matching, mid-path segment matching, legitimate surfaces unaffected, `isNonProductPath` export and direct usage, and the full 22-entry vocabulary check.
- `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` (modified): Added 4 new tests covering: non-product orphaned surfaces silently dropped (no console.warn), legitimate orphaned surfaces kept with console.warn, mixed scenario (false dropped + legitimate kept), and empty merge result omitting `surfaces` key from ana.json via `preserveUserState`.

## PR Summary

- Add `isNonProductPath` predicate to filter non-product workspace packages (examples, templates, fixtures, playgrounds, etc.) before surface signal evaluation
- Modify `mergeSurfaces()` to silently drop false surfaces on re-init instead of keeping them with a confusing warning
- Handle empty merge result by omitting `surfaces` key from ana.json (matching fresh-init behavior)
- 26 new tests covering detection pre-filter, merge cleanup, and edge cases

## Acceptance Criteria Coverage

- AC1 "non-product paths excluded from detection" -> surfaces.test.ts: A001-A007, A024 — tests for examples, templates, e2e, test, playground, sandbox, fixtures, example-apps (8 tests, 8 assertions)
- AC2 "legitimate surfaces unaffected" -> surfaces.test.ts: A013 "apps/web still detected", A014 "packages/cli with bin+dev still detected" (2 tests, 2 assertions)
- AC3 "library repos get zero surfaces" -> Covered implicitly by A001-A007 tests where only non-product roots exist, resulting in 0 surfaces
- AC4 "re-init silently drops false surfaces" -> monorepoCommandScoping.test.ts: A016 not_contains examples/next-app, A017 no console.warn (1 test, 2 assertions)
- AC5 "test-utils NOT excluded" -> surfaces.test.ts: A009 compound name preserved (1 test, 1 assertion)
- AC6 "gauzy-e2e IS excluded" -> surfaces.test.ts: A008 -e2e suffix exclusion (1 test, 1 assertion)
- AC7 "isNonProductPath exported and used by both" -> surfaces.test.ts: A015 export check + state.ts import verified by typecheck
- AC8 "empty merge omits surfaces key" -> monorepoCommandScoping.test.ts: A020 preserveUserState returns merged without surfaces key (1 test, 2 assertions)
- AC9 "Tests pass" -> ✅ 2746 passed
- AC10 "No lint errors" -> ✅ 0 errors (1 pre-existing warning in git-operations.ts)

## Implementation Decisions

- `EXCLUDED_SEGMENTS` is private (not exported) — only the predicate `isNonProductPath` is the public API. The set is an implementation detail.
- The predicate iterates all segments rather than using `some()` on an array — keeps the same imperative style as the surrounding code in `detectSurfaces`.
- The A020 test uses the full `preserveUserState` integration path rather than testing the caller logic in isolation, because the empty-check is a 3-line addition in a function that's already integration-tested in the same file.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  120 passed (120)
     Tests  2720 passed | 2 skipped (2722)
  Duration  43.73s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  120 passed (120)
     Tests  2746 passed | 2 skipped (2748)
  Duration  43.41s
```

### Comparison
- Tests added: 26
- Tests removed: 0
- Regressions: none

### New Tests Written
- `tests/engine/detectors/surfaces.test.ts`: 22 new tests — excluded segment categories (examples, templates, e2e, test, playground, sandbox, fixtures, example-apps), -e2e suffix, compound names preserved, case-insensitive matching, mid-path segments, legitimate surfaces unaffected, isNonProductPath export, vocabulary completeness
- `tests/commands/init/monorepoCommandScoping.test.ts`: 4 new tests — non-product orphaned surfaces dropped silently, legitimate orphaned surfaces kept with warning, mixed scenario, empty merge result omits surfaces key

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run tests/engine/detectors/surfaces.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
f1dfd127 [fix-false-surface-detection] Add selective merge cleanup for false surfaces
f50d4d07 [fix-false-surface-detection] Add non-product path pre-filter to surface detection
```

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
