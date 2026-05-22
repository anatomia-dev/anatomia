# Build Report: Fix Primary Package Selection in Monorepos

**Created by:** AnaBuild
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-primary-selection/spec.md
**Branch:** feature/fix-primary-selection

## What Was Built

- `packages/cli/src/engine/census.ts` (modified): Exported `selectPrimary` with new `projectDirName` parameter. Added import of `isNonProductPath` from `./detectors/surfaces.js`. Implemented Policy 0 (non-product path filtering with fallback), Policy 2 (4-tier name-match with `parsePackageName` helper and file-count guard), and narrowed Policy 3 to operate on filtered candidates. Updated caller at line 478 to pass `path.basename(normalizedRoot)`. Added constants `IDENTITY_WORDS`, `NAME_MATCH_MIN_FILES`, `NAME_MATCH_MIN_RATIO`.
- `packages/cli/tests/engine/census-primary.test.ts` (created): 32 unit tests for `selectPrimary` covering all 4 tiers, file-count guard (both thresholds), Policy 0 filtering with fallback, Policy 1 priority, root exclusion, regression fixtures for all 8 affected repos + directus + scalar, anatomia self-scan, and edge cases (empty dir name, null package name, single candidate failing guard, empty roots).

## PR Summary

- Implement 4-policy primary selection chain in `selectPrimary`: Policy 0 (non-product path filtering), Policy 1 (apps/ + framework, unchanged), Policy 2 (4-tier name-match against repo directory name with file-count guard), Policy 3 (most files fallback on filtered candidates)
- Name-match tiers: exact name > scoped+exact > scoped+identity word {core, server} > scoped+self-named, with file count tiebreaker within tier
- File-count guard prevents tiny wrapper packages from winning: must have >= 10 files AND >= 5% of largest viable candidate
- Fixes incorrect primary selection for 7 of 8 affected monorepos (logto, medusa, trpc, payload, strapi, vercel-ai, n8n); scalar correctly unchanged by guard
- 32 new unit tests covering the full policy matrix, regression fixtures, and edge cases

## Acceptance Criteria Coverage

- AC1 "selectPrimary accepts projectDirName" → census-primary.test.ts "caller passes path.basename(normalizedRoot)" + all tier tests (32 tests use the parameter)
- AC2 "Non-product paths excluded with fallback" → census-primary.test.ts:152 "non-product paths are excluded" + :162 "Policy 0 falls back to unfiltered"
- AC3 "Tiered priority with tiebreaker" → census-primary.test.ts:47-111 tier matching group (7 tests)
- AC4 "File-count minimum guard" → census-primary.test.ts:115-141 guard group (3 tests)
- AC5 "Policy 3 on filtered candidates" → census-primary.test.ts:173 "Policy 3 uses filtered candidates"
- AC6 "Caller passes path.basename" → census.ts line 478 passes `path.basename(normalizedRoot)`, tested in census-primary.test.ts:258
- AC7 "Root excluded from Policy 2" → census-primary.test.ts:210 "root package excluded from Policy 2"
- AC8 "8 affected repos correct" → census-primary.test.ts:229-331 regression group (8 tests)
- AC9 "Policy 1 repos identical" → Policy 1 code unchanged; apps/ + framework still wins (census-primary.test.ts:186 verifies priority)
- AC10 "Directus identical" → census-primary.test.ts:337 "directus wrapper blocked by guard"
- AC11 "Anatomia self-scan unchanged" → census-primary.test.ts:349 "anatomia self-scan unchanged"
- AC12 "Unit tests cover all variants" → 32 tests across 9 describe blocks
- AC13 "Tests pass" → 2794 passed, 2 skipped (see below)
- AC14 "No build errors" → pnpm run build succeeds (verified by pre-commit hook)

## Implementation Decisions

- `parsePackageName` as a private helper rather than inline logic — cleaner separation for the 4-tier matching loop.
- Constants `NAME_MATCH_MIN_FILES` (10) and `NAME_MATCH_MIN_RATIO` (0.05) declared at module scope for clarity, not magic numbers in the function body.
- `IDENTITY_WORDS` as a Set constant — matches spec's "{core, server}" exactly, no fuzzy matching.
- Scoring approach: collect all matches with tier numbers, sort by tier then file count, apply guard to best match. This is cleaner than 4 separate filter-sort-return blocks and allows the tiebreaker to work naturally.

## Deviations from Contract

### A014: The root package is not eligible for name-based matching
**Instead:** Test verifies exclusion by giving root fewer files than another package, so Policy 3 doesn't mask the exclusion
**Reason:** Original test had root with 1000 files — Policy 3 would pick it regardless, making the not_equals "." assertion fail even though Policy 2 correctly excluded it. Restructured to prove the exclusion matters.
**Outcome:** Functionally equivalent — the contract's intent (root excluded from name-match) is proven by showing root doesn't win when it would only win via Policy 2.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run census)
Test Files  3 passed (3)
Tests  28 passed | 2 skipped (30)
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run census)
Test Files  4 passed (4)
Tests  60 passed | 2 skipped (62)

(cd 'packages/cli' && pnpm vitest run)
Test Files  121 passed (121)
Tests  2794 passed | 2 skipped (2796)
```

### Comparison
- Tests added: 32
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/engine/census-primary.test.ts`: 32 tests across 9 describe blocks — tier matching (7), file-count guard (3), Policy 0 filtering (3), Policy 1 priority (1), root exclusion (2), regression repos (8), directus (1), anatomia (1), export/caller (2), edge cases (4)

## Verification Commands
```bash
pnpm run build
(cd 'packages/cli' && pnpm vitest run census)
(cd 'packages/cli' && pnpm vitest run)
pnpm run lint
```

## Git History
```
1f89cf95 [fix-primary-selection] Add unit tests for selectPrimary policy chain
280f1c1d [fix-primary-selection] Implement 4-policy primary selection chain
```

## Open Issues

- Pre-existing lint warning in `src/utils/git-operations.ts:198` (unused eslint-disable directive) — not introduced by this build.
- The A014 test required restructuring to prove root exclusion from Policy 2 — see Deviations. The contract assertion `not_equals "."` is structurally awkward because Policy 3 can still select root by most-files. The test works by ensuring root has fewer files, but a future reader might find the indirection non-obvious.

Verified complete by second pass.
