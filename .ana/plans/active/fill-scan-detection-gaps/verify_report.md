# Verify Report: Fill Scan Detection Gaps

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fill-scan-detection-gaps/spec.md
**Branch:** feature/fill-scan-detection-gaps

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fill-scan-detection-gaps/contract.yaml
  Seal: INTACT (hash sha256:d76bd2582ce022e4d99a397e47f3155756edb059d437ac27351d7f5713b802fc)
```

Build: clean (0 errors). Tests: 2837 passed, 0 failed, 2 skipped (122 files). Lint: 0 errors (3 pre-existing warnings — website unused vars, cli unused eslint-disable).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Kysely projects are detected as using a database | ✅ SATISFIED | `dependencies.test.ts:17` — `expect(DATABASE_PACKAGES['kysely']).toBe('Kysely')` |
| A002 | MikroORM projects are detected as using a database | ✅ SATISFIED | `dependencies.test.ts:22` — `expect(DATABASE_PACKAGES['@mikro-orm/core']).toBe('MikroORM')` |
| A003 | Slonik projects are detected as PostgreSQL | ✅ SATISFIED | `dependencies.test.ts:27` — `expect(DATABASE_PACKAGES['slonik']).toBe('PostgreSQL')` |
| A004 | Silverhand slonik fork detected as PostgreSQL | ✅ SATISFIED | `dependencies.test.ts:32` — `expect(DATABASE_PACKAGES['@silverhand/slonik']).toBe('PostgreSQL')` |
| A005 | Vercel Postgres projects detected | ✅ SATISFIED | `dependencies.test.ts:37` — `expect(DATABASE_PACKAGES['@vercel/postgres']).toBe('Vercel Postgres')` |
| A006 | MongoDB native driver detected | ✅ SATISFIED | `dependencies.test.ts:42` — `expect(DATABASE_PACKAGES['mongodb']).toBe('MongoDB')` |
| A007 | Postgres.js projects detected as PostgreSQL | ✅ SATISFIED | `dependencies.test.ts:47` — `expect(DATABASE_PACKAGES['postgres']).toBe('PostgreSQL')` |
| A008 | sqlite3 projects detected as SQLite | ✅ SATISFIED | `dependencies.test.ts:52` — `expect(DATABASE_PACKAGES['sqlite3']).toBe('SQLite')` |
| A009 | SQL Server projects detected | ✅ SATISFIED | `dependencies.test.ts:57` — `expect(DATABASE_PACKAGES['mssql']).toBe('SQL Server')` |
| A010 | ORMs win over raw drivers when both present | ✅ SATISFIED | `dependencies.test.ts:66` — `detectFromDeps({prisma:'1', postgres:'1'}).database` equals `'Prisma'` |
| A011 | Mongoose wins over native MongoDB driver | ✅ SATISFIED | `dependencies.test.ts:72` — `detectFromDeps({mongoose:'1', mongodb:'1'}).database` equals `'Mongoose'` |
| A012 | postgres.js standalone detects PostgreSQL | ✅ SATISFIED | `dependencies.test.ts:79` — `detectFromDeps({postgres:'1'}).database` equals `'PostgreSQL'` |
| A013 | sqlite3 standalone detects SQLite | ✅ SATISFIED | `dependencies.test.ts:85` — `detectFromDeps({sqlite3:'1'}).database` equals `'SQLite'` |
| A014 | mssql standalone detects SQL Server | ✅ SATISFIED | `dependencies.test.ts:91` — `detectFromDeps({mssql:'1'}).database` equals `'SQL Server'` |
| A015 | Svelte projects with .mjs config detected | ✅ SATISFIED | `surfaces.test.ts:482` — `STRONG_FRAMEWORK_CONFIGS.has('svelte.config.mjs')` is `true` |
| A016 | Nuxt projects with .mjs config detected | ✅ SATISFIED | `surfaces.test.ts:485` — `STRONG_FRAMEWORK_CONFIGS.has('nuxt.config.mjs')` is `true` |
| A017 | Remix projects with .mjs config detected | ✅ SATISFIED | `surfaces.test.ts:488` — `STRONG_FRAMEWORK_CONFIGS.has('remix.config.mjs')` is `true` |
| A018 | React Router projects with .mjs config detected | ✅ SATISFIED | `surfaces.test.ts:491` — `STRONG_FRAMEWORK_CONFIGS.has('react-router.config.mjs')` is `true` |
| A019 | Vue projects with .mjs config detected | ✅ SATISFIED | `surfaces.test.ts:494` — `STRONG_FRAMEWORK_CONFIGS.has('vue.config.mjs')` is `true` |
| A020 | Svelte detected over Nuxt when both configs exist | ✅ SATISFIED | `surfaces.test.ts:520` — `surfaces[0].framework.toLowerCase()` contains `'svelte'`. Uses `toContain` matching contract `contains` matcher. |
| A021 | React Stripe.js detected as Stripe | ✅ SATISFIED | `dependencies.test.ts:104` — `expect(PAYMENT_PACKAGES['@stripe/react-stripe-js']).toBe('Stripe')` |
| A022 | Frontend-only Stripe project detects Stripe | ✅ SATISFIED | `dependencies.test.ts:110` — `detectFromDeps({'@stripe/react-stripe-js':'1'}).payments` equals `'Stripe'` |
| A023 | Existing database detections unchanged | ✅ SATISFIED | `dependencies.test.ts:120` — `expect(DATABASE_PACKAGES['prisma']).toBe('Prisma')` |
| A024 | Existing payment detections unchanged | ✅ SATISFIED | `dependencies.test.ts:124` — `expect(PAYMENT_PACKAGES['stripe']).toBe('Stripe')` |

## Independent Findings

**Prediction resolution:**

1. **Confirmed — A020 test constructs manual hint order.** The Svelte/Nuxt ordering test at `surfaces.test.ts:511` hardcodes `frameworkHints` with Svelte first and Nuxt second. This means the test proves `detectSurfaces` respects hint order, but does NOT prove the production `FRAMEWORK_HINTS` array in `census.ts` has the correct order. I verified the source directly — `census.ts:51-58` has Svelte (lines 52-54) before Nuxt (lines 56-58), so the production code IS correct. The test just wouldn't catch a regression. This is acknowledged by the spec's Gotchas: "FRAMEWORK_HINTS is not exported from census.ts."

2. **Confirmed — A015-A019 tagged as batch.** Line 479 uses `// @ana A015, A016, A017, A018, A019` on a single describe with five individual `it` blocks. Each `it` tests one specific .mjs entry. Acceptable — each assertion maps to a specific `it` case.

3. **Not found — FRAMEWORK_HINTS and STRONG_FRAMEWORK_CONFIGS are in sync.** All 5 .mjs entries exist in both: `svelte.config.mjs`, `nuxt.config.mjs`, `remix.config.mjs`, `react-router.config.mjs`, `vue.config.mjs`. Verified in `census.ts:41,44,54,58,63` and `surfaces.ts:32-37`.

4. **Confirmed — `vue.config.ts` missing from both lists.** Pre-existing gap, not introduced by this build. Only `.mjs` variants were in scope.

5. **Not found — `postgres` collision risk is dormant.** The package name `postgres` only enters detection via `allDeps` from `package.json` dependencies. Non-Node ecosystems aren't scanned through this path.

**Surprise finding:** The `@ana A015`-`A020` IDs in `surfaces.test.ts` collide with tags from the scan-surface-detection contract (lines 287, 304, 323, 355, 380, 412). The older tags are for completely different assertions (language detection, name derivation). Any tool parsing `@ana` tags across the codebase will match the wrong tests for the older contract's assertions. Not a blocker — tag IDs are scoped per-contract, not globally unique — but worth knowing.

## AC Walkthrough
- **AC1** (9 new DATABASE_PACKAGES entries): ✅ PASS — All 9 entries verified in source (`dependencies.ts:20-34`) and by test (`dependencies.test.ts:16-58`).
- **AC2** (ORMs before raw drivers): ✅ PASS — `dependencies.ts:15-20` shows ORMs (including Kysely, MikroORM at line 20) before raw drivers (line 29+). A010-A011 tests confirm ordering via `detectFromDeps`.
- **AC3** (FRAMEWORK_HINTS .mjs variants): ✅ PASS — All 5 .mjs entries present in `census.ts:41,44,54,58,63`.
- **AC4** (STRONG_FRAMEWORK_CONFIGS .mjs variants): ✅ PASS — All 5 .mjs entries present in `surfaces.ts:32-37`. Tests at `surfaces.test.ts:481-495`.
- **AC5** (Svelte before Nuxt in FRAMEWORK_HINTS): ✅ PASS — `census.ts:51-54` (Svelte) precedes `census.ts:55-58` (Nuxt). Comment at line 51 documents the intent.
- **AC6** (PAYMENT_PACKAGES @stripe/react-stripe-js): ✅ PASS — `dependencies.ts:89` maps to `'Stripe'`. Test at `dependencies.test.ts:104`.
- **AC7** (postgres standalone → PostgreSQL): ✅ PASS — `dependencies.test.ts:79` calls `detectFromDeps({postgres:'1'})` and asserts `database === 'PostgreSQL'`.
- **AC8** (sqlite3 standalone → SQLite): ✅ PASS — `dependencies.test.ts:85` calls `detectFromDeps({sqlite3:'1'})` and asserts `database === 'SQLite'`.
- **AC9** (Svelte wins over Nuxt): ✅ PASS — `surfaces.test.ts:518-520` runs `detectSurfaces` with both hints and asserts framework contains 'svelte'. Source ordering verified in `census.ts:51-58`.
- **AC10** (No existing detections change): ✅ PASS — Regression tests at `dependencies.test.ts:119-127`. Full test suite shows 0 failures, 2837 passed.
- **AC11** (Unit tests cover each entry and ordering fix): ✅ PASS — New test file `dependencies.test.ts` (128 lines, 16 tests). Surfaces test extended with .mjs membership tests and Svelte/Nuxt ordering test.
- **AC12** (Tests pass): ✅ PASS — `(cd packages/cli && pnpm vitest run)`: 2837 passed, 2 skipped, 0 failed.
- **AC13** (No build errors): ✅ PASS — `pnpm run build` completed cleanly.
- **AC14** (Lint passes): ✅ PASS — 0 errors (pre-existing warnings only).

## Blockers
No blockers. All 24 contract assertions satisfied, all 14 ACs pass. Checked for: unused exports in new test file (none — all imports from source are used in assertions), unused parameters in new code (no new functions added), error paths (no new logic, only table entries), spec gaps requiring builder decisions (none — purely additive vocabulary changes).

## Findings
- **Test — A020 ordering test doesn't verify production array order:** `packages/cli/tests/engine/detectors/surfaces.test.ts:511` — The test constructs `frameworkHints` manually with Svelte first. It proves `detectSurfaces` respects iteration order but wouldn't catch a regression where someone reorders the FRAMEWORK_HINTS array in census.ts. The spec acknowledges this limitation (FRAMEWORK_HINTS is unexported). Source-verified that `census.ts:51-58` has correct ordering.
- **Upstream — `vue.config.ts` missing from FRAMEWORK_HINTS and STRONG_FRAMEWORK_CONFIGS:** Pre-existing gap. Both lists have `vue.config.js` and now `vue.config.mjs`, but no `.ts` variant. Not in scope for this build, but a detection gap for Vue projects using TypeScript configs.
- **Code — FRAMEWORK_HINTS unexportable creates testing blind spot:** `packages/cli/src/engine/census.ts:31` — The `const` is module-private. Array ordering invariants (Svelte before Nuxt, ORMs before drivers in FRAMEWORK_HINTS) can only be tested indirectly through integration tests. This is a design choice — not a defect — but means ordering regressions can only be caught by integration tests that construct the right fixture scenario.
- **Test — @ana tag ID collision across contracts:** `packages/cli/tests/engine/detectors/surfaces.test.ts:479` — IDs A015-A020 are used by both this contract (fill-scan-detection-gaps) and the earlier scan-surface-detection contract (lines 287-412). Tag IDs are per-contract, so this is architecturally expected, but any cross-contract tag parser would match the wrong tests.

## Deployer Handoff
Purely additive change — 9 database entries, 5 .mjs framework config entries, 1 payment entry, and a Svelte/Nuxt array reorder in census.ts. No logic changes, no new dependencies, no API surface changes. Test count increased from 2807 to 2837. Safe to merge without further integration testing.

## Verdict
**Shippable:** YES
All 24 contract assertions satisfied. All 14 acceptance criteria pass. Tests green, build clean, lint clean. The changes are additive vocabulary entries with no logic modifications. The four findings are observations about pre-existing gaps and test structure limitations — none affect correctness of the shipped code.
