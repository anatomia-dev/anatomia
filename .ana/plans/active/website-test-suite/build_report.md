# Build Report: Website Test Suite

**Created by:** AnaBuild
**Date:** 2026-05-20
**Spec:** .ana/plans/active/website-test-suite/spec.md
**Branch:** feature/website-test-suite

## What Was Built

- `website/package.json` (modified): Added `"test": "vitest run"` script to enable turborepo and root-level test discovery.
- `website/lib/__tests__/docs-data/proofs.test.ts` (created): Tests `getProofStats` and `getMedianTimings` computation logic using `vi.mock('node:fs')` and `vi.resetModules()` + dynamic import for cache busting. 8 tests covering multi-entry stats, empty datasets, zero-filtering in medians, odd/even median calculation.
- `website/lib/__tests__/docs-data/docs-stat-values.test.ts` (created): Pure function tests for `buildDocsStatValues` (9 key validation) and `resolveDocsStatTags` (replacement, unknown keys, no-tag text, multiple tags). 5 tests, no mocking.
- `website/lib/__tests__/docs-data/strip-jsx.test.ts` (created): Tests stripJsx regex/stripping logic with 3 mocked data accessor modules (proofs, skills, gotchas). 8 tests covering import/export removal, JSX comments, self-closing components, block component child preservation, full-strip removal, DocsStat resolution.
- `website/lib/__tests__/docs-data/data-integrity.test.ts` (created): Contract tests validating real `data/docs/*.json` files against expected shapes. Uses `describe.skipIf(!dataExists)` for graceful degradation on fresh clones. 6 tests.
- `website/lib/__tests__/format.test.ts` (created): Pure function tests for `splitHeadline` emphasis parsing. 4 tests covering middle emphasis, no emphasis, start emphasis, end emphasis.
- `website/lib/__tests__/proof-feed.test.ts` (created): Tests `formatAge` boundary behavior using `vi.useFakeTimers()`. 6 tests covering seconds, zero-clamp, future-clamp, minutes, hours, days thresholds.
- `website/lib/__tests__/copy.test.ts` (created): Structural integrity tests for the copy catalog. 6 tests covering 20 top-level sections, nav links, footer columns, footer link completeness, hero CTA, pricing plans.

## PR Summary

- Added `"test": "vitest run"` script to website package.json, enabling root-level `pnpm test` to cover both CLI and website surfaces
- Created 7 new test files (43 tests) covering proofs computation, docs-stat-values, strip-jsx, data-integrity, format, proof-feed, and copy catalog
- Used `vi.resetModules()` + dynamic import for proofs.ts cache-busting, `vi.mock('node:fs')` for filesystem isolation, and `describe.skipIf` for graceful data-integrity test degradation
- Zero production code changes — only test files and package.json test script modified
- All tests follow the marketing-stats.test.ts mocking convention where applicable

## Acceptance Criteria Coverage

- AC1 "package.json test script" → package.json has `"test": "vitest run"` ✅
- AC2 "38+ passing tests" → 51 tests passing (45 run + 6 skipped; all 51 pass when data dir present via turborepo) ✅
- AC3 "root test command works" → `pnpm run test -- --run` exits 0, runs both surfaces ✅
- AC4 "proofs.test.ts computation logic" → proofs.test.ts:83-116 tests getProofStats and getMedianTimings (8 tests) ✅
- AC5 "docs-stat-values pure functions" → docs-stat-values.test.ts tests buildDocsStatValues and resolveDocsStatTags with no mocking (5 tests) ✅
- AC6 "strip-jsx mocked data accessors" → strip-jsx.test.ts mocks proofs (×3), skills (×1), gotchas (×1) (8 tests) ✅
- AC7 "data-integrity with describe.skipIf" → data-integrity.test.ts uses describe.skipIf(!dataExists) (6 tests) ✅
- AC8 "format.test.ts splitHeadline" → format.test.ts tests emphasis parsing (4 tests) ✅
- AC9 "proof-feed.test.ts formatAge" → proof-feed.test.ts tests all thresholds + clamping (6 tests) ✅
- AC10 "copy.test.ts structural integrity" → copy.test.ts validates sections, nav, footer, hero, pricing (6 tests) ✅
- AC11 "zero production code changes" → only test files and package.json modified ✅
- AC12 "test files in correct directories" → all in `lib/__tests__/` or `lib/__tests__/docs-data/` ✅

## Implementation Decisions

- **Strip-jsx test file name:** Spec referenced `strip-jsx.ts` but actual file is `stripJsx.ts`. Used `@/lib/docs-data/stripJsx` import path matching the real file. Test file named `strip-jsx.test.ts` per spec convention.
- **Data-integrity supplementary files:** Grouped agent-templates, context-files, and search-index into one test with conditional per-file check (using `existsSync` per file) since some may not exist in all build states.
- **Proofs test structure:** Each describe block gets a fresh module via `vi.resetModules()` + `beforeEach`. The `setupMockData` helper sets the `readFileSync` mock before each dynamic import, ensuring the module-level cache starts fresh.
- **Test counts:** 51 total tests (45 passed + 6 skipped when data dir absent). When turborepo runs prebuild first, all 51 pass including data-integrity.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd website && pnpm vitest run)
Test Files  1 passed (1)
     Tests  8 passed (8)
  Duration  374ms
```

### After Changes
```
(cd website && pnpm vitest run)
 ✓ lib/__tests__/docs-data/data-integrity.test.ts (6 tests) — skipped (no data dir)
 ✓ lib/__tests__/format.test.ts (4 tests)
 ✓ lib/__tests__/docs-data/docs-stat-values.test.ts (5 tests)
 ✓ lib/__tests__/copy.test.ts (6 tests)
 ✓ lib/__tests__/marketing-stats.test.ts (8 tests)
 ✓ lib/__tests__/docs-data/strip-jsx.test.ts (8 tests)
 ✓ lib/__tests__/docs-data/proofs.test.ts (8 tests)
 ✓ lib/__tests__/proof-feed.test.ts (6 tests)

Test Files  7 passed | 1 skipped (8)
     Tests  45 passed | 6 skipped (51)
  Duration  358ms
```

Via root command (turborepo, with prebuild data):
```
pnpm run test -- --run
 ✓ lib/__tests__/docs-data/data-integrity.test.ts (6 tests)
 ✓ lib/__tests__/format.test.ts (4 tests)
 ✓ lib/__tests__/docs-data/docs-stat-values.test.ts (5 tests)
 ✓ lib/__tests__/copy.test.ts (6 tests)
 ✓ lib/__tests__/marketing-stats.test.ts (8 tests)
 ✓ lib/__tests__/docs-data/strip-jsx.test.ts (8 tests)
 ✓ lib/__tests__/docs-data/proofs.test.ts (8 tests)
 ✓ lib/__tests__/proof-feed.test.ts (6 tests)

Test Files  8 passed (8)
     Tests  51 passed (51)
Tasks:    4 successful, 4 total
```

### Comparison
- Tests added: 43 (8 baseline → 51 total)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `proofs.test.ts`: getProofStats totals, empty dataset, rejection counting; getMedianTimings zero-filtering, all-zero stage, empty dataset, odd/even median
- `docs-stat-values.test.ts`: buildDocsStatValues 9-key output; resolveDocsStatTags replacement, unknown keys, no tags, multiple tags
- `strip-jsx.test.ts`: import/export removal, JSX comments, self-closing components, block component children, full-strip removal, DocsStat resolution
- `data-integrity.test.ts`: proof-entries shape, skill-templates shape, gotchas shape, build-meta shape, commands shape, supplementary files
- `format.test.ts`: emphasis middle, no emphasis, emphasis start, emphasis end
- `proof-feed.test.ts`: 30s ago, zero-clamp, future-clamp, 90s minutes, 2h hours, 48h days
- `copy.test.ts`: 20 sections, nav links, footer columns, footer link completeness, hero CTA, pricing plans

## Verification Commands
```bash
(cd website && pnpm run build)
(cd website && pnpm vitest run)
pnpm run test -- --run
(cd website && pnpm run lint)
```

## Git History
```
d8f21e9f [website-test-suite] Add format, proof-feed, and copy tests
0e43d53d [website-test-suite] Add data-integrity tests
6cce3241 [website-test-suite] Add strip-jsx tests
4dff1342 [website-test-suite] Add docs-stat-values tests
51fb596c [website-test-suite] Add proofs computation tests
841b88c9 [website-test-suite] Add test script to website package.json
```

## Open Issues

- **Data-integrity tests skip when data dir absent:** The 6 data-integrity tests are skipped when running `cd website && pnpm vitest run` directly (no prebuild). They pass when run via turborepo (`pnpm run test -- --run`) because turborepo runs `prebuild` first. This is by design (spec AC7), not a deficiency.
- **Spec references `strip-jsx.ts` but file is `stripJsx.ts`:** The spec's file path didn't match the actual filename casing. Used the real path `stripJsx.ts` for imports. Test file named `strip-jsx.test.ts` per spec convention.
- **Test count 51 vs spec's expected 48:** The spec estimated 48 tests. We produced 51 (43 new + 8 existing). The difference is 3 additional tests: an extra proofs odd-vs-even median test (2 cases in one describe), an extra strip-jsx test for JSX comments, and an extra strip-jsx test for self-closing components. All are pure additive coverage.

Verified complete by second pass.
