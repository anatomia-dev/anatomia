# Verify Report: Fix Primary Package Selection in Monorepos

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-primary-selection/spec.md
**Branch:** feature/fix-primary-selection

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-primary-selection/contract.yaml
  Seal: INTACT (hash sha256:45188d7f874f2c383bb0b5ebffc5dd6d7af345f792a3eb5df144bfa39976bc54)
```
Seal status: **INTACT**

Tests: 2794 passed, 0 failed, 2 skipped (121 test files). Build: success. Lint: 0 errors (3 warnings — all pre-existing, none in changed files).

Census-specific tests: 60 passed, 2 skipped (4 test files including new census-primary.test.ts).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | A package whose name exactly matches the repo directory is selected as primary | ✅ SATISFIED | census-primary.test.ts:42-49, asserts `selectPrimary(roots, [], 'payload')` returns `'packages/payload'` |
| A002 | A scoped package whose bare name matches the repo directory is selected | ✅ SATISFIED | census-primary.test.ts:52-59, asserts result `toBe('packages/medusa')` for `@medusajs/medusa` |
| A003 | A scoped package with identity word 'core' whose scope matches the directory is selected | ✅ SATISFIED | census-primary.test.ts:62-69, `@logto/core` with dir `logto` returns `'packages/core'` |
| A004 | A scoped package with identity word 'server' whose scope matches the directory is selected | ✅ SATISFIED | census-primary.test.ts:72-79, `@trpc/server` with dir `trpc` returns `'packages/server'` |
| A005 | A scoped self-named package whose bare name equals the scope is selected | ✅ SATISFIED | census-primary.test.ts:82-89, `@strapi/strapi` with dir `strapi` returns `'packages/core/strapi'` |
| A006 | Higher-priority tiers win over lower-priority tiers | ✅ SATISFIED | census-primary.test.ts:92-100, tier 1 exact `'myapp'` beats tier 3 `@myapp/core`, returns `'packages/exact'` |
| A007 | When multiple packages match the same tier, the one with more files wins | ✅ SATISFIED | census-primary.test.ts:103-111, two tier-2 scoped+exact matches, `toContain('larger')` matches contract `contains` matcher |
| A008 | A name-matched package with fewer than 10 files is rejected by the guard | ✅ SATISFIED | census-primary.test.ts:118-128, 5-file package blocked, falls to Policy 3, result `not.toBe('packages/core')` |
| A009 | A name-matched package with less than 5% of the largest candidate's files is rejected | ✅ SATISFIED | census-primary.test.ts:131-140, 12/1000=1.2% < 5%, guard blocks, falls to Policy 3 |
| A010 | Packages in example directories are excluded from primary selection | ✅ SATISFIED | census-primary.test.ts:157-164, `not.toContain('examples/')`, Policy 0 filters examples/ path |
| A011 | When all candidates are non-product paths, the original unfiltered list is used as fallback | ✅ SATISFIED | census-primary.test.ts:167-176, all-excluded roots fall back to unfiltered, result `toBeTruthy()` (exists matcher) and `toBe('examples/app-a')` |
| A012 | Apps directory packages with framework evidence still win over name matches | ✅ SATISFIED | census-primary.test.ts:195-204, `apps/web` with framework hint beats `packages/myapp` name match |
| A013 | The most-files fallback uses only product-path candidates | ✅ SATISFIED | census-primary.test.ts:179-188, examples/big (2000 files) excluded, `packages/actual` (500) wins via Policy 3 |
| A014 | The root package is not eligible for name-based matching | ✅ SATISFIED | census-primary.test.ts:211-222, root `.` with matching name excluded from Policy 2, falls to Policy 3 |
| A015 | The root package can still win via the most-files fallback | ✅ SATISFIED | census-primary.test.ts:225-233, root `.` (1000 files) wins Policy 3 when no name match |
| A016 | Logto scan selects packages/core as the primary package | ✅ SATISFIED | census-primary.test.ts:240-249, realistic logto fixture returns `'packages/core'` |
| A017 | Medusa scan selects packages/medusa as the primary package | ✅ SATISFIED | census-primary.test.ts:252-262, returns `'packages/medusa'` |
| A018 | tRPC scan selects packages/server as the primary package | ✅ SATISFIED | census-primary.test.ts:265-274, returns `'packages/server'` |
| A019 | Payload scan selects packages/payload as the primary package | ✅ SATISFIED | census-primary.test.ts:277-286, payload test/ (1754 files) filtered by Policy 0, returns `'packages/payload'` |
| A020 | Strapi scan selects packages/core/strapi as the primary package | ✅ SATISFIED | census-primary.test.ts:289-298, returns `'packages/core/strapi'` |
| A021 | Vercel AI scan selects packages/ai as the primary package | ✅ SATISFIED | census-primary.test.ts:301-309, `'ai'` exact match returns `'packages/ai'` |
| A022 | n8n scan selects packages/cli as the primary package | ✅ SATISFIED | census-primary.test.ts:312-319, `'n8n'` exact match on `n8n` package returns `'packages/cli'` |
| A023 | Scalar scan is unchanged because the guard blocks the tiny core package | ✅ SATISFIED | census-primary.test.ts:322-333, `@scalar/core` (8 files) blocked by guard, falls to Policy 3 → `'packages/workspace-store'` |
| A024 | Directus wrapper package is blocked by the guard and api wins via most files | ✅ SATISFIED | census-primary.test.ts:340-350, `directus` (3 files) blocked, Policy 3 returns `'api'` |
| A025 | Anatomia self-scan is unchanged because anatomia-cli does not match directory name anatomia | ✅ SATISFIED | census-primary.test.ts:357-366, `'anatomia-cli'` ≠ `'anatomia'`, Policy 3 returns `'packages/cli'` |
| A026 | The caller passes the repo directory name, not the package.json name | ✅ SATISFIED | census.ts:571 — `selectPrimary(sourceRoots, frameworkHints, path.basename(normalizedRoot))`. Source inspection confirms `path.basename(normalizedRoot)` is the directory name. Test at census-primary.test.ts:378 documents the parameter acceptance. |
| A027 | selectPrimary is exported for unit testing | ✅ SATISFIED | census-primary.test.ts:373, `typeof selectPrimary` is `'function'`. Import at line 9 confirms named export from census.js. |

## Independent Findings

The implementation is clean and well-structured. The 4-policy chain in `selectPrimary` (census.ts:147-224) follows the existing Policy 1 pattern as instructed. `parsePackageName` is a tight private helper. Constants are properly named and placed.

**Predictions resolved:**
1. Scope extraction off-by-one — **NOT FOUND.** `parsePackageName` correctly handles `@scope/bare` with `slice(1, slashIdx)` / `slice(slashIdx + 1)`.
2. Wrong guard denominator — **NOT FOUND.** `maxFileCount` computed from `viable` (Policy 0 filtered), correct per spec.
3. Similar regression fixtures — **NOT FOUND.** Each regression test has distinct tier behavior (logto=tier3, medusa=tier2, strapi=tier4, payload=tier1, etc.).
4. Root exclusion too aggressive — **NOT FOUND.** `r.relativePath !== '.'` in nameMatchCandidates only; root stays in `viable` for Policy 3.
5. Policy 0 fallback edge — **NOT FOUND.** `filtered.length > 0 ? filtered : roots` handles all-excluded correctly. A011 tests this.

**Surprised findings:**
- Tier 4 (scoped+self-named) is directory-name-independent — `@strapi/strapi` matches in ANY repo, not just directories named "strapi". This is by design (the spec defines it as "bare name equals scope's bare name"), but it means tier 4 is more permissive than the other tiers. In practice, this is fine because tiers 1-3 fire first.
- No test exercises the interaction between Policy 0 filtering and Policy 1 (apps/ in non-product paths). An `examples/apps/web` path with framework hints would be filtered by Policy 0 before Policy 1 fires — this might be intentional but is untested.

## AC Walkthrough
- ✅ AC1: `selectPrimary` accepts `projectDirName` parameter (census.ts:150), applies name-match (Policy 2, lines 165-216) before most-files fallback (Policy 3, lines 218-221).
- ✅ AC2: Non-product paths filtered via `isNonProductPath` from surfaces.ts (census.ts:153). Fallback on line 154: `filtered.length > 0 ? filtered : roots`. Import on line 26.
- ✅ AC3: Tiered priority implemented (census.ts:184-202): tier 1 (exact) → tier 2 (scoped+exact) → tier 3 (identity word) → tier 4 (self-named). Sort on line 207: `a.tier - b.tier || b.root.fileCount - a.root.fileCount`. Tests A001-A007 cover all tiers and tiebreaker.
- ✅ AC4: Guard on lines 211-213: `>= NAME_MATCH_MIN_FILES` (10) AND `>= maxFileCount * NAME_MATCH_MIN_RATIO` (5%). Tests A008, A009 cover both thresholds. Line 169: `maxFileCount` uses `viable` (filtered candidates).
- ✅ AC5: Policy 3 on line 219 sorts `viable` (which is `filtered` when non-empty). Test A013 verifies examples/big excluded.
- ✅ AC6: Caller at census.ts:571: `path.basename(normalizedRoot)`. Confirmed by source inspection. `normalizedRoot` is the project root path.
- ✅ AC7: Root excluded from Policy 2 on line 173: `r.relativePath !== '.'`. Root stays in `viable` for Policy 3. Tests A014 (excluded) and A015 (eligible via Policy 3).
- ✅ AC8: All 8 repos tested: logto→packages/core (A016), medusa→packages/medusa (A017), trpc→packages/server (A018), payload→packages/payload (A019), strapi→packages/core/strapi (A020), vercel-ai→packages/ai (A021), n8n→packages/cli (A022), scalar→packages/workspace-store unchanged (A023). All pass.
- ⚠️ AC9: Policy 1 repos producing identical results — not directly tested in census-primary.test.ts (these are integration-level concerns requiring real repo fixtures). The existing `census.test.ts` integration tests still pass (60 tests). PARTIAL — behavior unchanged is inferred from no code changes to Policy 1 logic, not directly verified per-repo.
- ✅ AC10: Directus tested in A024 — wrapper (3 files) blocked by guard, `api` (600 files) wins via Policy 3.
- ✅ AC11: Anatomia self-scan tested in A025 — `anatomia-cli` ≠ `anatomia`, Policy 3 picks `packages/cli`. Integration test in census.test.ts also covers this implicitly.
- ✅ AC12: Unit tests cover: 4 tiers (A001-A005), tiebreaker (A007), guard absolute (A008) + relative (A009) + pass (line 142), root exclusion (A014-A015), Policy 0 filtering + fallback (A010-A011, A013), Policy 1 unchanged (A012), regressions for 8 repos + directus + scalar (A016-A025). Edge cases: empty projectDirName, null packageName, single tiny candidate, empty roots.
- ✅ AC13: `(cd 'packages/cli' && pnpm vitest run)` — 2794 passed, 0 failed, 2 skipped.
- ✅ AC14: `pnpm run build` — success, 0 errors.

## Blockers
No blockers. All 27 contract assertions satisfied. All ACs pass (AC9 partial — Policy 1 repos unchanged by inference, not direct test). No test failures. No regressions.

Checked for: unused exports in new code (only `selectPrimary`, intentionally exported for testing); unused parameters (all 3 params of `selectPrimary` used); error paths (`parsePackageName` handles unscoped and scoped, `viable` fallback handles empty filtered list, empty roots returns `'.'`); external assumptions (pure function, no filesystem access); spec gaps (tier 4 directory-independence is by design).

## Findings

- **Test — A007 tiebreaker uses weak assertion:** `packages/cli/tests/engine/census-primary.test.ts:110` — `toContain('larger')` would pass if the result were any string containing "larger", not just `packages/larger`. However, the contract specifies `matcher: "contains", value: "larger"` so the test is contract-aligned. Weakness is in the contract design, not the test.
- **Test — A026 caller test is indirect:** `packages/cli/tests/engine/census-primary.test.ts:378` — The test shows `selectPrimary` accepts a third argument but doesn't verify the actual call site. Caller verified by source inspection at `census.ts:571`. This is reasonable — a unit test can't verify call site usage without integration testing.
- **Code — Tier 4 is directory-name independent:** `packages/cli/src/engine/census.ts:199` — `bareLower === scopeLower` matches `@strapi/strapi` in ANY repo, regardless of `projectDirName`. This is correct per spec but more permissive than tiers 1-3. In practice harmless because higher tiers fire first, and the guard provides a safety net.
- **Code — parsePackageName accepts empty string:** `packages/cli/src/engine/census.ts:121` — Returns `{ scope: '', bare: '' }` for empty input. Currently harmless because `nameMatchCandidates` filters `null` packageName, but an empty-string `packageName` would pass the filter and produce an empty bare comparison against `dirLower`. If `dirLower` is also empty, that's a false match. The `if (projectDirName)` guard on line 167 prevents this in practice.
- **Test — No Policy 0 + Policy 1 interaction test:** `packages/cli/tests/engine/census-primary.test.ts` — No test verifies what happens when an `apps/` package lives under a non-product path (e.g., `examples/apps/web`). Policy 0 would filter it before Policy 1 fires. This is likely correct behavior but untested.
- **Code — Case-insensitivity is implicit:** `packages/cli/src/engine/census.ts:194` — `IDENTITY_WORDS.has(bareLower)` relies on the caller having lowercased `bare`, which happens on line 180. Correct but not documented. A future maintainer adding an identity word must remember to add it lowercase.

## Deployer Handoff
- This build depends on Issue #1 (fix-false-surface-detection) being merged — `isNonProductPath` is imported from `detectors/surfaces.ts`. If that hasn't shipped, the build will fail at import.
- The branch is 10 commits behind main. Rebase or merge main before merging.
- After merge, self-scan (`ana scan`) should produce the same `packages/cli` primary as before — AC11 covers this.
- The 2 skipped tests in the test suite are pre-existing, not introduced by this build.
- Website build cache warnings about proof_chain.json >2MB are pre-existing, unrelated.

## Verdict
**Shippable:** YES

27/27 contract assertions SATISFIED. 13/14 ACs pass, 1 partial (AC9 — Policy 1 repos unchanged by inference from no code change, supported by passing integration tests). 2794 tests pass, 0 fail. Build clean. Lint clean. Implementation follows spec precisely — no over-building, no scope creep, no dead code. The policy chain is well-structured, tested at unit and regression level, and the guard provides good defense against false matches.
