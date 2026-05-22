# Build Report: Filter non-product paths from schema glob fallbacks

**Created by:** AnaBuild
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-schema-glob-fallback/spec.md
**Branch:** feature/fix-schema-glob-fallback

## What Was Built

- `packages/cli/src/engine/scan-engine.ts` (modified): Added `isNonProductPath` to the existing `detectSurfaces, enrichPackages` import from `./detectors/surfaces.js`. Added `.filter(m => !isNonProductPath(m))` on Prisma `matches` array after all glob sources merge (line 303) and before the scorer gate. Added `.filter(m => !isNonProductPath(m))` on Drizzle `unique` array after deduplication and before the content-check loop.
- `packages/cli/tests/engine/scanProject.test.ts` (modified): Added two test cases — one verifying Prisma schema in `e2e/` is excluded, one verifying Drizzle schema in `examples/` is excluded. Both assert `found === false` and that blind spots fire appropriately.

## PR Summary

- Filter non-product paths (e2e/, examples/, fixtures/, etc.) from Prisma and Drizzle glob fallback discovery in scan-engine.ts
- Reuses existing `isNonProductPath` from surfaces.ts — same function census already uses
- Prisma filter applied after both glob sources merge, before scorer; Drizzle filter applied before content reads
- Two regression tests confirm schemas in excluded directories are not detected and blind spots fire correctly

## Acceptance Criteria Coverage

- AC1 "`isNonProductPath` is imported in scan-engine.ts" → scan-engine.ts line 39 import statement (3 assertions)
- AC2 "Prisma glob fallback results filtered" → scan-engine.ts line 303 `.filter()` call ✅
- AC3 "Drizzle glob fallback results filtered" → scan-engine.ts line 423 `.filter()` call ✅
- AC4 "Prisma schema in e2e/ NOT detected" → scanProject.test.ts "excludes Prisma schema in e2e directory from detection" (3 assertions) ✅
- AC5 "Drizzle schema in examples/ NOT detected" → scanProject.test.ts "excludes Drizzle schema in examples directory from detection" (3 assertions) ✅
- AC6 "Existing tests continue to pass" → 2858 passed, 0 regressions ✅
- Tests pass with `(cd 'packages/cli' && pnpm vitest run)` ✅
- No lint errors ✅

## Implementation Decisions

- Placed filter after census-sourced paths merge into `matches` for Prisma. Census paths are already clean so filtering them is a harmless no-op, as the spec noted. Keeps code simpler than branching on source.
- Combined dedup and filter into one expression for Drizzle (`[...new Set(rawMatches)].filter(...)`) rather than two separate steps. More concise, same semantics.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run tests/engine/scanProject)
Test Files  1 passed (1)
     Tests  34 passed (34)
  Duration  1.85s
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run)
Test Files  122 passed (122)
     Tests  2858 passed | 2 skipped (2860)
  Duration  43.27s
```

### Comparison
- Tests added: 2
- Tests removed: 0
- Regressions: none

### New Tests Written
- `scanProject.test.ts`: "excludes Prisma schema in e2e directory from detection" — creates project with `e2e/nextjs/prisma/schema.prisma` as only schema, asserts `found === false` and blind spot fires
- `scanProject.test.ts`: "excludes Drizzle schema in examples directory from detection" — creates project with `examples/drizzle-app/schema.ts` as only schema, asserts `found === false` and blind spot fires

### Contract Coverage
Contract coverage: 8/8 assertions tagged.
- A001, A002, A003 → "excludes Prisma schema in e2e directory from detection" test
- A004, A005 → "excludes Drizzle schema in examples directory from detection" test
- A006 → existing "detects external services and schemas" test (pre-existing, line 99)
- A007 → existing "detects Prisma schema in a monorepo sub-package" test (pre-existing, line 123)
- A008 → full suite pass: 2858 > 2855

## Verification Commands
```bash
(cd 'packages/cli' && pnpm vitest run tests/engine/scanProject)
(cd 'packages/cli' && pnpm vitest run)
pnpm run lint
```

## Git History
```
2ac2c240 [fix-schema-glob-fallback] Filter non-product paths from schema glob fallbacks
```

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
