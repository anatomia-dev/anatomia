# Verify Report: Filter non-product paths from schema glob fallbacks

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-schema-glob-fallback/spec.md
**Branch:** feature/fix-schema-glob-fallback

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/fix-schema-glob-fallback/.ana/plans/active/fix-schema-glob-fallback/contract.yaml
  Seal: INTACT (hash sha256:78ef566c0890e96192b975997230163aa84326eaadf8a7852c6201d5cc0e6d63)
```

Seal: INTACT.

Build: ✅ (typecheck + tsup clean). Tests: 2858 passed, 2 skipped (122 test files). Lint: ✅.

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | The scan engine imports the non-product path filter from the surfaces module | ✅ SATISFIED | `packages/cli/src/engine/scan-engine.ts:39` — `isNonProductPath` added to existing destructured import from `./detectors/surfaces.js` |
| A002 | A Prisma schema in an e2e directory is not detected as a real schema | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:254` — `expect(result.schemas['prisma']!.found).toBe(false)` |
| A003 | A missing Prisma schema triggers the expected blind spot warning | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:256` — `expect(result.blindSpots.find(b => b.area === 'Database' && /Prisma/.test(b.issue))).toBeDefined()` |
| A004 | A Drizzle schema in an examples directory is not detected as a real schema | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:273` — `expect(result.schemas['drizzle']!.found).toBe(false)` |
| A005 | A missing Drizzle schema triggers the expected blind spot warning | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:275` — `expect(result.blindSpots.find(b => /drizzle-orm/.test(b.issue))).toBeDefined()` |
| A006 | A real Prisma schema in a product path is still detected normally | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:113` — existing test asserts `found === true` for `prisma/schema.prisma`. Test passes (36/36 in scanProject suite). |
| A007 | A real Prisma schema in a monorepo sub-package is still detected | ✅ SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:136` — existing test asserts `found === true` for `packages/db/prisma/schema.prisma`. |
| A008 | Existing test suite passes without regressions | ✅ SATISFIED | 2858 passed > 2855 threshold. 0 failures. |

## Independent Findings

**Prediction resolutions:**
1. "Drizzle filter wrong" — Not found. Both Prisma (line 304) and Drizzle (line 424) filters are correctly placed and use the same `!isNonProductPath(m)` pattern.
2. "Tests don't check blind spots" — Not found. Both tests assert blind spots fire (`toBeDefined()`).
3. "Trailing-slash directory paths not tested" — Partially confirmed. See Test finding below.
4. "Import as separate line instead of extending destructure" — Not found. Import correctly extended at line 39.
5. "Builder added `isNonProductPath` as separate import" — Not found. Same as #4.

**Production risk prediction** ("if `isNonProductPath` has false positives"): Not a concern for this build. The function uses exact segment matching via `EXCLUDED_SEGMENTS` set (lowercased). It's already proven in census.ts for the same purpose. A directory literally named "test" or "examples" containing a real schema would be excluded — but that's the intentional design, and the existing monorepo sub-package test (`packages/db/prisma/`) confirms product paths pass through.

**Over-building check:** No scope creep. The diff is 4 lines in scan-engine.ts (1 import change + 2 filter lines + 1 comment change) and 38 lines of tests. No new exports, no new functions, no new abstractions. Tight and focused.

## AC Walkthrough
- AC1: `isNonProductPath` imported via existing surfaces.js import line — ✅ PASS (`packages/cli/src/engine/scan-engine.ts:39`)
- AC2: Prisma glob fallback results filtered through `isNonProductPath` before scorer — ✅ PASS (line 304, after both glob sources merge into `matches`, before `if (matches.length > 0)` at line 305)
- AC3: Drizzle glob fallback results filtered through `isNonProductPath` before content validation — ✅ PASS (line 424, `unique` array filtered before `Table(` content loop at line 426)
- AC4: Test verifies Prisma schema in `e2e/` NOT detected — ✅ PASS (test at line 241, asserts `found === false`)
- AC5: Test verifies Drizzle schema in `examples/` NOT detected — ✅ PASS (test at line 260, asserts `found === false`)
- AC6: Existing tests continue to pass — ✅ PASS (2858 passed, 0 failed; monorepo sub-package test at line 123 passes, standard path test at line 99 passes)
- Tests pass with `(cd 'packages/cli' && pnpm vitest run)` — ✅ PASS (2858 passed, 2 skipped)
- No lint errors — ✅ PASS

## Blockers

None. All 8 contract assertions satisfied, all 8 ACs pass. Checked for: unused exports in new code (none — no new exports), unused parameters (none — filter lambdas use their parameter), unhandled error paths (filter is inside existing try/catch blocks), sentinel test patterns (both tests assert specific values: `toBe(false)` and `toBeDefined()` on specific blind spot predicates), dead code (no new branches or conditional blocks added).

## Findings

- **Test — Multi-file Prisma fallback path not exercised:** `packages/cli/tests/engine/scanProject.test.ts:241` — The Prisma exclusion test creates `e2e/nextjs/prisma/schema.prisma`, which matches the `**/schema.prisma` glob (first fallback at scan-engine.ts:294). The multi-file fallback (`**/prisma/*.prisma` at line 298) produces directory paths ending with `/`, which `isNonProductPath` handles correctly (empty trailing segment is ignored). But this code path is never tested with a non-product directory. The filter at line 304 applies to both paths, so it works — but if the multi-file fallback's directory dedup logic changed, the non-product exclusion wouldn't catch a regression. Accepted: low risk, and the spec's Gotchas section explicitly analyzed this edge case.

- **Code — Defense-in-depth on census paths:** `packages/cli/src/engine/scan-engine.ts:304` — The filter at line 304 runs on ALL `matches`, including census-sourced paths (line 292). Census already filters via `isNonProductPath` in census.ts, so this is a no-op for census paths. The spec acknowledges this trade-off ("harmless no-op, keeps code simpler than branching on source"). Clean design choice — if census ever regresses on filtering, this catches it.

- **Upstream — Regression assertions rely on pre-existing tests:** Contract A006 and A007 verify that real schemas in product paths are still detected. These are covered by tests from previous builds (lines 99 and 123 of scanProject.test.ts) without `@ana` tags for this build. This is appropriate — the assertions are regression guards, and the existing tests adequately cover them. No action needed, but worth noting for contract hygiene: future contracts could reference the existing test IDs.

## Deployer Handoff

Minimal change — 2 `.filter()` calls added to scan-engine.ts, 2 new test cases. The fix closes a false-positive detection path where glob fallbacks in the Prisma and Drizzle schema detection blocks bypassed the `isNonProductPath` filter that census already applied. No new dependencies, no config changes, no migration needed. The worktree is 5 commits behind main — rebase before merge.

## Verdict
**Shippable:** YES

All 8 contract assertions satisfied. All acceptance criteria pass. Tests green (2858/2858). Lint clean. Build clean. The implementation is minimal, correctly placed, and follows established patterns. The two filter calls mirror the existing `isNonProductPath` usage in census.ts. No over-building, no scope creep, no regressions.
