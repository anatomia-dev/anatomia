# Verify Report: Fix AnaDocs date freshness

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-docs-date-freshness/spec.md
**Branch:** feature/fix-docs-date-freshness

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/fix-docs-date-freshness/.ana/plans/active/fix-docs-date-freshness/contract.yaml
  Seal: INTACT (hash sha256:4b1f1a5d7326e3c4040e234f1f103d915c20211d0f6b4ed0edb5f524e74cde92)
```

Seal: **INTACT**

Build: ✅ success (website build completes cleanly)
Tests: 68 passed, 0 failed, 0 skipped (10 test files)
Lint: 0 errors, 2 warnings (pre-existing in `Hero.tsx`, not from this build)

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | The CLI reference page shows a build-derived date, not a hardcoded one | ✅ SATISFIED | `website/app/docs/reference/cli/page.tsx:70` — uses `{meta.buildTimestamp.slice(0, 10)}`. Grep confirms no `2026-05-22` string in file. |
| A002 | The CLI reference page derives the date from buildTimestamp | ✅ SATISFIED | `website/app/docs/reference/cli/page.tsx:70` — contains `meta.buildTimestamp.slice(0, 10)` |
| A003 | Stale docs trigger a warning with the file path | ✅ SATISFIED | `website/lib/__tests__/docs-data/staleness.test.ts:50` — asserts `stale[0].file` contains `.mdx` |
| A004 | Stale docs warning includes the age in days | ✅ SATISFIED | `website/lib/__tests__/docs-data/staleness.test.ts:51` — asserts `stale[0].days` is >= 74 |
| A005 | Fresh docs produce no staleness warnings | ✅ SATISFIED | `website/lib/__tests__/docs-data/staleness.test.ts:76` — asserts `stale.length` equals 0 with all dates within 60 days |
| A006 | Files where git returns no date fall back to buildTimestamp | ✅ SATISFIED | `website/lib/__tests__/docs-data/staleness.test.ts:107` — verifies fallback produces valid YYYY-MM-DD date; source `extract-docs-data.ts:1063` initializes `date = fallbackDate` before try/catch |
| A007 | The staleness threshold is 60 days | ✅ SATISFIED | `website/lib/__tests__/docs-data/staleness.test.ts:83-98` — tests boundary: 60 days not flagged, 61 days flagged; source `extract-docs-data.ts:1045` has `STALENESS_THRESHOLD_DAYS = 60` |
| A008 | page-dates.json is generated with slug-to-date entries | ✅ SATISFIED | `website/lib/__tests__/docs-data/page-dates.test.ts:27-31` — asserts getPageDate returns specific date for known slug; verified `website/data/docs/page-dates.json` exists with 14 entries after build |
| A009 | page-dates.json keys are slug paths without .mdx extension | ✅ SATISFIED | `website/lib/__tests__/docs-data/page-dates.test.ts:46-54` — asserts keys do not contain `.mdx`; verified in generated `page-dates.json` (keys like `concepts/artifacts`, `start`) |
| A010 | page-dates.json values are YYYY-MM-DD date strings | ✅ SATISFIED | `website/lib/__tests__/docs-data/page-dates.test.ts:57-63` — asserts values match `/^\d{4}-\d{2}-\d{2}$/` regex; contract matcher is `contains: "-"` which is also satisfied |
| A011 | lastReviewed is removed from all MDX frontmatter | ✅ SATISFIED | `grep -r lastReviewed website/content/docs/` returns 0 matches. All 14 MDX files verified clean. |
| A012 | The slug page reads dates from getPageDate, not frontmatter | ✅ SATISFIED | `website/app/docs/[...slug]/page.tsx:112` — `lastReviewed={getPageDate(slug.join("/")) ?? undefined}` |
| A013 | The slug page no longer reads lastReviewed from page data | ✅ SATISFIED | `grep page.data.lastReviewed website/` returns 0 matches |
| A014 | The staleness check does not fail the build | ✅ SATISFIED | `website/scripts/extract-docs-data.ts:1086-1099` — `checkStaleDocs` returns data, no `process.exit`; caller at lines 1192-1200 uses `console.warn` only |
| A015 | The website build succeeds with all changes applied | ✅ SATISFIED | `pnpm run build` in website directory completed successfully |

## Independent Findings

**Predictions resolved:**

1. Hardcoded date might remain — **Not found.** Grep confirmed clean.
2. execSync catch might swallow without fallback — **Not found.** `date` is pre-initialized to `fallbackDate` before `try`, so the catch naturally falls back. Good pattern.
3. getPageDate tests check existence not format — **Partially confirmed.** `page-dates.test.ts` uses specific values (`toBe('2026-05-20')`), but `staleness.test.ts` uses range matchers (`toBeGreaterThanOrEqual`). The range matchers are acceptable here since the computed age depends on `Date.now()`.
4. page-dates.json might include .mdx — **Not found.** Slug computation strips `.mdx` at line 1061.
5. 60 threshold as magic number — **Not found.** Named constant `STALENESS_THRESHOLD_DAYS = 60`.

**Surprise finding:** The staleness tests replicate `checkStaleDocs` inline rather than importing the real function. See Findings below.

**Production risks reviewed:**
- Vercel shallow clone: The fallback is correctly wired — `date` defaults to `fallbackDate` before `try`, so both empty git output and thrown errors produce the fallback date.
- New MDX files: The walker dynamically finds all `.mdx` files in `content/docs/`, so future files are automatically included.

## AC Walkthrough

- **AC1**: ✅ PASS — `website/app/docs/reference/cli/page.tsx:70` uses `meta.buildTimestamp.slice(0, 10)`. No static date string remains (grep confirms).
- **AC2**: ✅ PASS — `extract-docs-data.ts:1193-1197` emits `console.warn` with file path (`.mdx` suffix) and age in days for stale docs. Tested in `staleness.test.ts:41-53`.
- **AC3**: ✅ PASS — `extract-docs-data.ts:1199` prints `✓ No stale docs` when empty. Tested in `staleness.test.ts:67-78`.
- **AC4**: ✅ PASS — `page-dates.json` verified at `website/data/docs/page-dates.json` with 14 slug-to-date entries after build.
- **AC5**: ✅ PASS — Grep for `lastReviewed` in `website/content/docs/` returns 0 matches. All 14 files cleaned.
- **AC6**: ✅ PASS — `website/app/docs/[...slug]/page.tsx:112` passes `getPageDate(slug.join("/"))` to MetaRow.
- **AC7**: ✅ PASS — `extract-docs-data.ts:1054,1063-1070` initializes `date = fallbackDate` (from `buildTimestamp.slice(0, 10)`) before git call; empty output or thrown error both fall through to fallback.
- **AC8**: ✅ PASS — Website build succeeds. Tests: 68 passed (up from baseline 55, 13 new tests). Lint: 0 errors.
- **AC9**: ✅ PASS — Same mechanism as AC7: `date` pre-initialized to `fallbackDate`, try/catch wraps git call. New uncommitted files and shallow clone gaps both produce fallback date.

## Blockers

No blockers. All 15 contract assertions satisfied. All 9 ACs pass. No test regressions (68 pass vs 55 baseline). Build succeeds. Lint clean (warnings pre-existing). Checked: no unused exports in new files (`getPageDate` is imported by `index.ts` and `[...slug]/page.tsx`), no unused parameters (every function parameter is used), no `process.exit` in staleness path, no hardcoded date strings remaining, no unhandled error paths in extraction logic.

## Findings

- **Test — Staleness tests replicate checkStaleDocs rather than testing the actual function:** `website/lib/__tests__/docs-data/staleness.test.ts:18-31` — The test file defines its own copy of `checkStaleDocs` with the same logic as `extract-docs-data.ts:1086-1099`. This means a bug in the real function (different date parsing, off-by-one, changed threshold) would NOT be caught. The duplication exists because `checkStaleDocs` isn't exported from the script. Reasonable choice given the script's structure, but the test is testing a copy, not the original. Future refactoring should either export the function or move the logic to a testable module.

- **Code — All page-dates.json entries show today's date:** `website/data/docs/page-dates.json` — All 14 entries are `2026-05-22` because this branch modified every MDX file (removing `lastReviewed`). This is correct git behavior — the most recent commit touching each file is in this branch. On main after merge, dates will reflect the merge commit. Not a bug, but means staleness warnings won't fire until 60+ days from merge.

- **Code — Date.now() makes staleness non-deterministic:** `website/scripts/extract-docs-data.ts:1087` — `checkStaleDocs` uses `Date.now()` internally. A doc at exactly 60 days old will be stale or fresh depending on what time of day the build runs. The test handles this with `toBeGreaterThanOrEqual` rather than exact values — correct but worth noting for boundary awareness.

- **Upstream — Proof chain finding resolved:** `dynamic-pages-C1` ("Hardcoded 'Last reviewed' date in CLI reference page will become stale") is directly resolved by this build. Line 70 now uses `meta.buildTimestamp.slice(0, 10)`.

- **Code — Missing JSDoc on exported function:** `website/lib/docs-data/pageDates.ts:19` — `getPageDate` lacks `@param` and `@returns` JSDoc tags. However, the pattern file (`meta.ts:17`) also lacks them, and the website lint config doesn't enforce this rule. Consistent with codebase convention.

## Deployer Handoff

- This is a website-only change. No CLI package changes.
- After merge, all 14 MDX page dates will show the merge date (because `lastReviewed` removal touched every file). Dates will naturally diverge as individual pages are edited.
- The staleness warning won't fire until 60 days post-merge. To test it sooner, temporarily lower `STALENESS_THRESHOLD_DAYS` in `extract-docs-data.ts:1045`.
- `page-dates.json` is regenerated on every `pnpm prebuild` (which runs before `pnpm build`). It's a generated artifact in `data/docs/` — don't commit it manually.
- Pre-existing lint warnings in `Hero.tsx` (unused `formatAge` and `latest`) are unrelated to this build.

## Verdict

**Shippable:** YES

All 15 contract assertions satisfied. All 9 acceptance criteria pass. Build succeeds, 68 tests pass (13 new), lint clean. The implementation follows existing codebase patterns (pageDates.ts mirrors meta.ts, extraction follows validateInternalLinks pattern). The staleness test duplication is a debt item, not a blocker — the duplicated logic is simple and the boundary cases are well-tested. Would stake my name on this shipping.
