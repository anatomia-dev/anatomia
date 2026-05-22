# Build Report: Fill Scan Detection Gaps

**Created by:** AnaBuild
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fill-scan-detection-gaps/spec.md
**Branch:** feature/fill-scan-detection-gaps

## What Was Built

- `packages/cli/src/engine/detectors/dependencies.ts` (modified): Added 9 entries to DATABASE_PACKAGES (kysely, @mikro-orm/core after knex; @vercel/postgres after firebase-admin; slonik, @silverhand/slonik, mongodb, postgres, sqlite3, mssql after @libsql/client). Added 1 entry to PAYMENT_PACKAGES (@stripe/react-stripe-js after @stripe/stripe-js).
- `packages/cli/src/engine/census.ts` (modified): Added 5 .mjs variants to FRAMEWORK_HINTS (remix.config.mjs, react-router.config.mjs, svelte.config.mjs, nuxt.config.mjs, vue.config.mjs). Moved react-router.config.js adjacent to .ts variant. Moved SvelteKit block above Nuxt block to fix tiebreak ordering.
- `packages/cli/src/engine/detectors/surfaces.ts` (modified): Added 5 .mjs entries to STRONG_FRAMEWORK_CONFIGS (nuxt.config.mjs, svelte.config.mjs, vue.config.mjs, remix.config.mjs, react-router.config.mjs).
- `packages/cli/tests/engine/detectors/dependencies.test.ts` (created): New test file with 17 tests covering all 9 DATABASE_PACKAGES entries, ordering invariants (ORM wins over raw driver), standalone raw driver detection, PAYMENT_PACKAGES entry, and regression guards.
- `packages/cli/tests/engine/detectors/surfaces.test.ts` (modified): Added 5 .mjs entries to existing STRONG_FRAMEWORK_CONFIGS membership test. Added new describe block with 5 individual .mjs membership tests. Added Svelte/Nuxt ordering integration test via detectSurfaces with synthetic census.

## PR Summary

- Add 9 database driver entries (Kysely, MikroORM, slonik, @silverhand/slonik, @vercel/postgres, mongodb, postgres, sqlite3, mssql) and 1 payment entry (@stripe/react-stripe-js) to lookup tables
- Add .mjs config file variants for Svelte, Nuxt, Remix, React Router, and Vue to both FRAMEWORK_HINTS and STRONG_FRAMEWORK_CONFIGS
- Fix Svelte/Nuxt misidentification by reordering SvelteKit block above Nuxt in FRAMEWORK_HINTS array
- 25 new tests covering all entries, ordering invariants, and the Svelte/Nuxt tiebreak fix

## Acceptance Criteria Coverage

- AC1 "DATABASE_PACKAGES contains all 9 new entries" → dependencies.test.ts: 9 individual membership tests (A001-A009)
- AC2 "ORMs appear before raw drivers" → dependencies.test.ts: "ORM (Prisma) wins over raw driver (postgres)" and "ORM (Mongoose) wins over raw driver (mongodb)" (A010, A011)
- AC3 "FRAMEWORK_HINTS contains .mjs variants" → surfaces.test.ts: 5 individual STRONG_FRAMEWORK_CONFIGS.has() tests (A015-A019). FRAMEWORK_HINTS is not exported; .mjs presence verified indirectly through STRONG_FRAMEWORK_CONFIGS sync and the Svelte/Nuxt integration test.
- AC4 "STRONG_FRAMEWORK_CONFIGS contains 5 .mjs variants" → surfaces.test.ts: 5 tests (A015-A019)
- AC5 "Svelte before Nuxt in FRAMEWORK_HINTS" → surfaces.test.ts: integration test via detectSurfaces with both configs (A020)
- AC6 "PAYMENT_PACKAGES contains @stripe/react-stripe-js" → dependencies.test.ts (A021)
- AC7 "postgres detects PostgreSQL" → dependencies.test.ts: "postgres.js standalone detects PostgreSQL" (A012)
- AC8 "sqlite3 detects SQLite" → dependencies.test.ts: "sqlite3 standalone detects SQLite" (A013)
- AC9 "svelte.config.mjs + nuxt.config.js → Svelte" → surfaces.test.ts: ordering integration test (A020)
- AC10 "No existing detections change" → dependencies.test.ts: regression guards (A023, A024) + full suite green
- AC11 "Unit tests cover each new entry" → 25 new tests across 2 files ✅
- AC12 "Tests pass" → 2837 passed, 2 skipped ✅
- AC13 "No build errors" → pnpm run build succeeds ✅
- AC14 "Lint passes" → 0 errors (1 pre-existing warning in unrelated file) ✅

## Implementation Decisions

- Placed `react-router.config.js` adjacent to `react-router.config.ts` in FRAMEWORK_HINTS (it was previously separated by several blocks). The spec said "add .mjs variants adjacent to existing .ts/.js siblings" — this required moving the existing .js entry to group it with the .ts entry and new .mjs entry.
- Used `.toLowerCase().toContain('svelte')` for the A020 ordering test since `detectFramework` returns display names ('Svelte') but the contract specifies `matcher: contains, value: svelte` (lowercase).

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  121 passed (121)
     Tests  2812 passed | 2 skipped (2814)
  Duration  43.25s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  122 passed (122)
     Tests  2837 passed | 2 skipped (2839)
  Duration  45.77s
```

### Comparison
- Tests added: 25
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/engine/detectors/dependencies.test.ts`: 17 tests — 9 DATABASE_PACKAGES membership, 6 detectFromDeps ordering (including standalone driver detection), 1 PAYMENT_PACKAGES membership, 1 detectFromDeps payment detection, 2 regression guards
- `packages/cli/tests/engine/detectors/surfaces.test.ts`: 8 new tests — 5 .mjs STRONG_FRAMEWORK_CONFIGS membership, 1 Svelte/Nuxt ordering integration, 2 added to existing membership array

### Contract Coverage
24/24 assertions tagged. All contract assertion IDs (A001-A024) have corresponding `@ana` tags in test files.

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run dependencies)
(cd packages/cli && pnpm vitest run surfaces)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
fe770942 [fill-scan-detection-gaps] Add .mjs framework configs and reorder Svelte above Nuxt
fe1bed45 [fill-scan-detection-gaps] Add database and payment entries
```

## Open Issues

- Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` (unused eslint-disable directive) — not introduced by this build.
- The `react-router.config.js` entry was moved from its original position (after `vue.config.js`) to be adjacent to the `.ts` variant in the Remix/React Router block. This is a reorder of an existing entry, not a new addition. The spec's instruction to place .mjs variants "adjacent to existing .ts/.js siblings" motivated grouping all three React Router entries together.

Verified complete by second pass.
