# Verify Report: Fix False Surface Detection

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-false-surface-detection/spec.md
**Branch:** feature/fix-false-surface-detection

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/fix-false-surface-detection/.ana/plans/active/fix-false-surface-detection/contract.yaml
  Seal: INTACT (hash sha256:9730e6b4d4b4c76c6eda910f65158702261f4df176b8fce1dd0633b5aefa6175)
```

Seal: **INTACT**

Build: **PASS** (pnpm run build, 2 tasks successful)
Tests: **2746 passed, 0 failed, 2 skipped** (120 test files, baseline was 2720 — 26 new tests added)
Lint: **PASS** (0 errors, 2 pre-existing warnings in website/)

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Packages under examples/ are not detected as surfaces | ✅ SATISFIED | `surfaces.test.ts:593-609` — creates root at `examples/next-app` with framework hint, asserts `toHaveLength(0)` |
| A002 | Packages under templates/ are not detected as surfaces | ✅ SATISFIED | `surfaces.test.ts:612-628` — creates root at `templates/starter` with framework hint, asserts `toHaveLength(0)` |
| A003 | Packages under e2e/ are not detected as surfaces | ✅ SATISFIED | `surfaces.test.ts:631-644` — creates root at `e2e/integration` with bin+dev, asserts `toHaveLength(0)` |
| A004 | Packages under test/ are not detected as surfaces | ✅ SATISFIED | `surfaces.test.ts:647-661` — creates root at `test/helpers` with bin+dev, asserts `toHaveLength(0)` |
| A005 | Packages under playground/ are not detected as surfaces | ✅ SATISFIED | `surfaces.test.ts:663-680` — creates root at `playground/demo` with framework hint, asserts `toHaveLength(0)` |
| A006 | Packages under sandbox/ are not detected as surfaces | ✅ SATISFIED | `surfaces.test.ts:682-695` — creates root at `sandbox/experiment` with bin+dev, asserts `toHaveLength(0)` |
| A007 | Packages under fixtures/ are not detected as surfaces | ✅ SATISFIED | `surfaces.test.ts:698-715` — creates root at `fixtures/mock-app` with framework hint, asserts `toHaveLength(0)` |
| A008 | Packages ending with -e2e are excluded from surfaces | ✅ SATISFIED | `surfaces.test.ts:736-752` — creates root at `apps/gauzy-e2e` with framework hint, asserts `toHaveLength(0)` |
| A009 | Compound names like test-utils are not excluded | ✅ SATISFIED | `surfaces.test.ts:755-768` — creates root at `packages/test-utils` with bin+dev, asserts `toHaveLength(1)` |
| A010 | Compound names like demo-app are not excluded | ✅ SATISFIED | `surfaces.test.ts:770-782` — creates root at `packages/demo-app` with bin+dev, asserts `toHaveLength(1)` |
| A011 | Path exclusion is case-insensitive | ✅ SATISFIED | `surfaces.test.ts:785-817` — tests `Examples/next-app` and `TEMPLATES/starter`, both assert `toHaveLength(0)` |
| A012 | Non-product segment anywhere in path triggers exclusion | ✅ SATISFIED | `surfaces.test.ts:820-836` — creates root at `packages/examples/next-app` (mid-path), asserts `toHaveLength(0)` |
| A013 | Legitimate apps/ surfaces are still detected | ✅ SATISFIED | `surfaces.test.ts:839-855` — `apps/web` with framework hint, asserts `surfaces.length > 0` |
| A014 | Legitimate packages/ with bin+dev are still detected | ✅ SATISFIED | `surfaces.test.ts:857-869` — `packages/cli` with bin+dev, asserts `surfaces.length > 0` |
| A015 | The non-product path predicate is exported for reuse | ✅ SATISFIED | `surfaces.test.ts:872-897` — imports `isNonProductPath`, asserts `typeof === 'function'`, tests true/false cases and suffix/case behavior |
| A016 | Re-init silently drops false surfaces from ana.json | ✅ SATISFIED | `monorepoCommandScoping.test.ts:688-706` — orphaned surface at `examples/next-app`, asserts merged values don't contain that path |
| A017 | No warning is logged when dropping false surfaces | ✅ SATISFIED | `monorepoCommandScoping.test.ts:704` — `expect(warnSpy).not.toHaveBeenCalled()` after dropping non-product surface |
| A018 | Legitimate orphaned surfaces are kept on re-init | ✅ SATISFIED | `monorepoCommandScoping.test.ts:708-727` — orphaned surface at `apps/legacy`, asserts merged values contain that path |
| A019 | A warning is logged for kept orphaned surfaces | ✅ SATISFIED | `monorepoCommandScoping.test.ts:724` — `expect(warnSpy).toHaveBeenCalledTimes(1)` (1 > 0) |
| A020 | Empty surfaces result omits the surfaces key from ana.json | ✅ SATISFIED | `monorepoCommandScoping.test.ts:757-827` — full `preserveUserState` integration test, asserts `merged!['surfaces']` is undefined |
| A021 | Mixed orphaned surfaces are handled correctly — false dropped, legitimate kept | ✅ SATISFIED | `monorepoCommandScoping.test.ts:729-755` — mixed scenario, asserts keys don't contain `examples-app` |
| A022 | Legitimate surface survives mixed cleanup | ✅ SATISFIED | `monorepoCommandScoping.test.ts:751` — asserts keys contain `legacy` |
| A023 | All 22 non-product segment names are in the exclusion set | ✅ SATISFIED | `surfaces.test.ts:900-923` — iterates all 22 expected segments through `isNonProductPath`, asserts `toHaveLength(22)` |
| A024 | Packages under example-apps/ are not detected as surfaces | ✅ SATISFIED | `surfaces.test.ts:717-733` — creates root at `example-apps/remix-app` with framework hint, asserts `toHaveLength(0)` |

## Independent Findings

**Prediction 1 (pre-filter placement):** Not found. Correctly placed after INFRA_PATTERNS at line 272, before signal evaluation.

**Prediction 2 (-e2e suffix scope):** Not found. The suffix check operates on `lastSegment` only (line 90-91), not the full path. Correct.

**Prediction 3 (state.test.ts mismatch):** Confirmed but non-blocking. The contract and spec both list `tests/commands/init/state.test.ts` as a target, but the builder put merge tests in `monorepoCommandScoping.test.ts` where existing `mergeSurfaces` tests already lived. Reasonable — tests are colocated with related tests.

**Prediction 4 (empty-surfaces handling):** Not found. Lines 774-778 in state.ts correctly check `Object.keys(mergedSurfaces).length > 0` and delete the key when empty. The A020 test verifies this end-to-end through `preserveUserState`.

**Prediction 5 (22-entry count):** Not found. Manually counted 22 entries in EXCLUDED_SEGMENTS. The test at line 922 also asserts `expectedSegments.toHaveLength(22)`.

**Production risk (case inconsistency):** INFRA_PATTERNS at line 269 is case-sensitive (`INFRA_PATTERNS.has(lastSegment)`) while EXCLUDED_SEGMENTS at line 87 is case-insensitive (`.toLowerCase()`). A package named `Tsconfig` would pass the INFRA_PATTERNS check but `Examples` would be caught by EXCLUDED_SEGMENTS. This is pre-existing behavior for INFRA_PATTERNS — not introduced by this build — but the inconsistency is worth noting.

**Over-building check:** No scope creep detected. The implementation adds exactly what the spec describes: one constant, one predicate, one pre-filter line, and one merge modification. No unused exports — `isNonProductPath` is imported in both `surfaces.ts` (detection) and `state.ts` (merge). `EXCLUDED_SEGMENTS` is private. No extra parameters, no unnecessary abstractions.

## AC Walkthrough

- **AC1:** ✅ PASS — All 22 non-product path segments are in EXCLUDED_SEGMENTS (verified by manual count and test at line 900-923). Each category tested individually: examples (line 593), templates (612), e2e (631), test (647), playground (663), sandbox (682), fixtures (698), example-apps (717).
- **AC2:** ✅ PASS — Legitimate surfaces unaffected: `apps/web` (line 839), `packages/cli` (line 857) both detect as surfaces. `isNonProductPath` returns false for `apps/web`, `packages/cli` (line 884-887).
- **AC3:** ✅ PASS — When all detected surfaces are non-product, `detectSurfaces` returns empty array. Tested individually per excluded category. The A020 test confirms empty merge result omits the key.
- **AC4:** ✅ PASS — `monorepoCommandScoping.test.ts:688-706`: non-product orphaned surface dropped with zero `console.warn` calls.
- **AC5:** ✅ PASS — `surfaces.test.ts:755-768`: `packages/test-utils` (segment `test-utils`) is NOT excluded, detects as surface with `toHaveLength(1)`.
- **AC6:** ✅ PASS — `surfaces.test.ts:736-752`: `apps/gauzy-e2e` (ends with `-e2e`) is excluded, `toHaveLength(0)`.
- **AC7:** ✅ PASS — `isNonProductPath` exported from `surfaces.ts:84`, imported in `state.ts:22` and used in both `detectSurfaces` (line 272) and `mergeSurfaces` (line 646). Single source of truth.
- **AC8:** ✅ PASS — `monorepoCommandScoping.test.ts:757-827`: full `preserveUserState` integration test verifies `merged!['surfaces']` is `undefined` (not `{}`).
- **Tests pass:** ✅ PASS — `(cd packages/cli && pnpm vitest run)`: 2746 passed, 0 failed, 2 skipped.
- **No lint errors:** ✅ PASS — `pnpm run lint`: 0 errors, 2 pre-existing warnings (website/).

## Blockers

None. All 24 contract assertions satisfied. All 10 acceptance criteria pass. No regressions (baseline 2720, now 2746 — 26 new tests). No unused exports in new code (`isNonProductPath` imported by both detection and merge; `EXCLUDED_SEGMENTS` is private). No unhandled error paths (`isNonProductPath` is a pure predicate with no throws). No assumptions about external state (uses forward-slash path splitting, consistent with `@manypkg/get-packages` normalized paths). No sentinel tests — each assertion checks specific lengths or boolean values matching the contract matcher.

## Findings

- **Code — Double path split in detection loop:** `packages/cli/src/engine/detectors/surfaces.ts:268,272` — `detectSurfaces` splits `root.relativePath` at line 268 to get `lastSegment`, then `isNonProductPath` splits the same path again at line 85. Micro-inefficiency only — the function is called once per source root during a scan, so impact is negligible. Noted for awareness, not action.

- **Code — Inconsistent casing strategy between pre-filters:** `packages/cli/src/engine/detectors/surfaces.ts:45,60` — `INFRA_PATTERNS` uses case-sensitive matching (`has(lastSegment)`) while `EXCLUDED_SEGMENTS` uses case-insensitive (`.toLowerCase()`). This is pre-existing for INFRA_PATTERNS, but the two pre-filters now sit adjacent (lines 269 and 272). A `Tsconfig` package would bypass INFRA_PATTERNS. Low risk — monorepo package names are overwhelmingly lowercase — but the inconsistency is architectural debt.

- **Upstream — Contract file_changes lists state.test.ts but implementation uses monorepoCommandScoping.test.ts:** Contract `file_changes` includes `packages/cli/tests/commands/init/state.test.ts` (modify), but that file doesn't exist. Builder correctly placed merge tests in `monorepoCommandScoping.test.ts` where existing `mergeSurfaces` tests live. The contract's file list was aspirational. Not a code issue — note for next seal.

- **Code — console.warn noise for legitimate orphaned surfaces:** `packages/cli/src/commands/init/state.ts:647` — Pre-existing concern from proof context: `mergeSurfaces console.warn on removed surfaces may be noisy for intentional removals`. This build improves the situation by silencing warnings for non-product paths, but legitimate orphaned surfaces (e.g., user removed a real surface from their monorepo) still get warned. The behavior is correct per spec — just noting the noise persists for the product-path case.

- **Code — Trailing slash edge in isNonProductPath:** `packages/cli/src/engine/detectors/surfaces.ts:85` — `'examples/'.split('/')` produces `['examples', '']`. The empty string doesn't match EXCLUDED_SEGMENTS, but `examples` does, so the function still returns true. Not a bug — `@manypkg/get-packages` doesn't produce trailing slashes — but the empty-segment case is unguarded. Defensive, not actionable.

## Deployer Handoff

This is a purely internal change — no user-facing API or CLI changes. After merge:

1. **No migration needed.** Existing repos with false surfaces in `ana.json` will have them silently cleaned on next `ana init` (re-init). No manual intervention required.
2. **Behavioral change:** Repos that previously detected non-product packages as surfaces will now produce fewer (or zero) surfaces. This is the intended fix. Users who had `examples/next-app` in their surfaces will see it disappear — silently, with no warning.
3. **The `surfaces` key may be omitted entirely** from `ana.json` if all detected surfaces were false. This matches fresh-init behavior and is handled correctly by downstream consumers that use `?? {}` patterns.
4. **No new dependencies.** The `commands/ -> engine/detectors/` import path has established precedent.

## Verdict

**Shippable:** YES

Clean implementation. Two files changed (surfaces.ts, state.ts), two test files extended. 26 new tests, all passing. All 24 contract assertions satisfied. No regressions, no scope creep, no dead code. The predicate is correctly placed, correctly exported, and correctly consumed by both detection and merge. The empty-result handling follows the established spread pattern from line 559. Would stake my name on this shipping.
