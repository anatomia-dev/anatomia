# Build Report: Fix non-product path over-exclusion at deep segments

**Created by:** AnaBuild
**Date:** 2026-06-02
**Spec:** .ana/plans/active/fix-non-product-over-exclusion/spec.md
**Branch:** feature/fix-non-product-over-exclusion

## What Was Built

- `packages/cli/src/engine/detectors/surfaces.ts` (modified): Added `FILE_PATH_DEPTH_LIMIT = 3` constant, `isNonProductFilePath` function that checks only first 3 segments, updated `NON_PRODUCT_GLOB_IGNORE` from `**/${s}/**` to 3-tier rooted patterns via `.flatMap`. `isNonProductPath` unchanged.
- `packages/cli/src/engine/detectors/git.ts` (modified): Changed import and call site from `isNonProductPath` to `isNonProductFilePath` for hot file filtering.
- `packages/cli/src/engine/scan-engine.ts` (modified): Changed import from `isNonProductPath` to `isNonProductFilePath`. Updated 4 call sites (lines 321, 443, 543, 545) for schema detection and Supabase migration filtering.
- `packages/cli/tests/engine/detectors/surfaces.test.ts` (modified): Added `isNonProductFilePath` and `FILE_PATH_DEPTH_LIMIT` imports. Added describe block with 8 tests covering depth-boundary, -e2e suffix, case insensitivity, and product path behavior.
- `packages/cli/tests/engine/non-product-filtering.test.ts` (modified): Added `isNonProductFilePath` and `FILE_PATH_DEPTH_LIMIT` imports. Updated `NON_PRODUCT_GLOB_IGNORE` assertions from `**/${segment}/**` to 3-tier rooted patterns. Migrated hot file and Supabase tests to use `isNonProductFilePath`. Added 3 new describe blocks: depth-boundary (12 tests), isNonProductPath unchanged (3 tests), build artifact patterns (2 tests).

## PR Summary

- Split non-product filtering into `isNonProductPath` (all segments, for package paths) and `isNonProductFilePath` (first 3 segments, for full file paths) to fix over-exclusion of deep product paths like `apps/web/app/(ee)/api/e2e/`
- Updated `NON_PRODUCT_GLOB_IGNORE` from any-depth `**/${s}/**` to 3-tier rooted patterns (`${s}/**`, `*/${s}/**`, `*/*/${s}/**`), preserving build artifact patterns at any depth
- Migrated git.ts hot file filtering and scan-engine.ts schema/migration filtering (5 call sites total) to use the depth-limited filter
- Added 25 new test assertions covering depth boundaries, -e2e suffix scoping, case insensitivity, and pattern format validation

## Acceptance Criteria Coverage

- AC1 "`isNonProductFilePath('apps/web/app/(ee)/api/e2e/bounties/route.ts')` returns false" → non-product-filtering.test.ts "allows deep product paths" (1 assertion) + surfaces.test.ts "returns false for deep paths" (1 assertion)
- AC2 "`isNonProductFilePath('examples/next-app/src/route.ts')` returns true" → non-product-filtering.test.ts "excludes non-product directories at segment 0" (1 assertion) + surfaces.test.ts "returns true for shallow non-product" (1 assertion)
- AC3 "`isNonProductFilePath('packages/platform/examples/base/src/route.ts')` returns true" → non-product-filtering.test.ts "excludes non-product directories at segment 2" (1 assertion)
- AC4 "`isNonProductPath('examples/next-app')` still returns true" → non-product-filtering.test.ts "package-path filtering still works" (1 assertion) + surfaces.test.ts existing tests unchanged
- AC5 "NON_PRODUCT_GLOB_IGNORE contains rooted patterns" → non-product-filtering.test.ts "uses 3-tier rooted patterns" (4 assertions per segment × 22 segments)
- AC6 "NON_PRODUCT_GLOB_IGNORE retains build artifact any-depth patterns" → non-product-filtering.test.ts "build artifact patterns remain at any depth" (8 assertions) + "all 8 build artifact patterns preserved" (1 assertion)
- AC7 "git.ts calls isNonProductFilePath" → verified by import change (code inspection)
- AC8 "scan-engine.ts calls isNonProductFilePath" → verified by import change and 4 call-site migrations (code inspection)
- AC9 "Package-path callers remain on isNonProductPath" → not migrated (census.ts, surfaces.ts detectSurfaces, state.ts unchanged)
- AC10 "-e2e suffix iterates segments 0 through limit-1" → non-product-filtering.test.ts "-e2e suffix" tests (2 assertions) + surfaces.test.ts "-e2e suffix" tests (2 assertions)
- AC11 "All existing tests pass" → 3230 passed, 0 failures
- Tests pass with `(cd 'packages/cli' && pnpm vitest run)` → ✅
- No build errors with `pnpm run build` → ✅ (verified by pre-commit hook)

## Implementation Decisions

- Combined the segment check and -e2e suffix check into separate loops in `isNonProductFilePath` rather than a single loop. The original `isNonProductPath` also has them as separate loops. Keeps the structure parallel.
- Used `Math.min(FILE_PATH_DEPTH_LIMIT, segments.length)` to avoid out-of-bounds on short paths (e.g., single-segment "examples").
- Updated the hot file and Supabase test descriptions to reference `isNonProductFilePath` instead of `isNonProductPath` since those tests simulate file-path filtering scenarios.

## Deviations from Contract

### A019: Package-path callers are not migrated
**Instead:** A019 asserts `scan-engine.ts.import` `not_contains` `isNonProductPath`. After migration, scan-engine.ts imports `isNonProductFilePath` and has zero references to `isNonProductPath` — satisfied exactly.
**Reason:** The assertion name "package-path callers are not migrated" describes intent (don't migrate census.ts, surfaces.ts detectSurfaces, state.ts), but the mechanical check targets scan-engine.ts which IS migrated. The assertion value is satisfied.
**Outcome:** Contract assertion satisfied mechanically. The intent (don't migrate package-path callers) is also satisfied — census.ts, surfaces.ts, state.ts unchanged.

No other deviations — contract followed exactly on all other assertions.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run)
 Test Files  132 passed (132)
      Tests  3205 passed | 2 skipped (3207)
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run)
 Test Files  132 passed (132)
      Tests  3230 passed | 2 skipped (3232)
```

### Comparison
- Tests added: 25
- Tests removed: 0
- Regressions: none

### New Tests Written
- `tests/engine/detectors/surfaces.test.ts`: 8 new tests — isNonProductFilePath export check, FILE_PATH_DEPTH_LIMIT value, shallow/deep path filtering, -e2e suffix within/past limit, case insensitivity
- `tests/engine/non-product-filtering.test.ts`: 17 new/modified tests — 3-tier rooted pattern assertions, depth-boundary behavior (12 tests including edge cases), isNonProductPath unchanged (3 tests), build artifact pattern preservation (2 tests)

### Contract Coverage
21/21 assertions tagged. All contract assertions have corresponding `@ana` tags in test files.

## Verification Commands
```bash
pnpm run build
(cd 'packages/cli' && pnpm vitest run tests/engine/detectors/surfaces.test.ts tests/engine/non-product-filtering.test.ts)
(cd 'packages/cli' && pnpm vitest run)
pnpm run lint
```

## Git History
```
43fd06e9 [fix-non-product-over-exclusion] Migrate file-path callers to isNonProductFilePath
c48fa283 [fix-non-product-over-exclusion] Add depth-limited file path filter and rooted glob patterns
```

## Open Issues

None — verified by second pass. All changes follow the spec exactly, all tests meaningfully verify behavior, no unused imports or parameters, no unhandled edge cases.
