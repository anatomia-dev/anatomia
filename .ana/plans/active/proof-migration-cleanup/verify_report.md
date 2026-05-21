# Verify Report: Pre-surface behavior cleanup

**Result:** FAIL
**Created by:** AnaVerify
**Date:** 2026-05-20
**Spec:** .ana/plans/active/proof-migration-cleanup/spec.md
**Branch:** feature/proof-migration-cleanup

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/proof-migration-cleanup/contract.yaml
  Seal: INTACT (hash sha256:4ede6d351999cee4101e07f893f1c7da85dfdd7867b7c6e14747a55136e881e6)
```

Build: ✅ (2 tasks successful)
Tests: 2713 passed, 2 skipped (120 test files) — +2 from baseline 2711
Checkpoint (work tests): 237 passed
Checkpoint (monorepo scoping): 22 passed
Lint: ✅ (0 errors, 2 pre-existing warnings in website)

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Proof chain gains a migrations field after work complete runs | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:5983` — `expect(chain.migrations).toBeDefined()` |
| A002 | Surface backfill marker is set to true after backfill runs | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:5984` — `expect(chain.migrations.surface_backfill).toBe(true)` |
| A003 | Lesson-to-closed marker is set to true | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:5985` — `expect(chain.migrations.lesson_to_closed).toBe(true)` |
| A004 | Surface backfill loop is skipped when marker is already present | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:6017` — entry with `modules_touched: ['packages/cli/src/foo.ts']` remains without surface when marker present; `toBeUndefined()` satisfies `not_equals "cli"` |
| A005 | Entries without surface remain unchanged when backfill is skipped | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:6017` — `expect(chain.entries[0].surface).toBeUndefined()` |
| A006 | Lesson migration code is removed from the maintenance loop | ✅ SATISFIED | Source inspection: `grep 'lesson' packages/cli/src/commands/work.ts` returns only the migration marker name at line 1180. The 6-line `if ((finding.status as string) === 'lesson')` block is absent from the maintenance loop (lines 1128-1173). |
| A007 | The lesson backward-compat line in computeChainHealth is preserved | ✅ SATISFIED | `packages/cli/src/utils/proofSummary.ts:1419` — `case 'lesson': closed++; break;` |
| A008 | Outer surface guard uses simplified check instead of Object.keys length | ✅ SATISFIED | Source inspection: `grep 'Object.keys(anaSurfaces).length' work.ts` returns no matches. Line 1050: `if (anaSurfaces)`. Line 1099: `if (anaSurfaces && !chain.migrations?.['surface_backfill'])`. |
| A009 | ProofChain interface includes migrations field | ✅ SATISFIED | `packages/cli/src/types/proof.ts:28` — `migrations?: Record<string, boolean>` |
| A010 | DashboardEntry surface field uses clean optional syntax | ❌ UNSATISFIED | `packages/cli/src/utils/proofSummary.ts:462` — still reads `surface?: string \| undefined;`. The `\| undefined` was not removed. |
| A011 | Root lint command is project-wide in monorepo init | ✅ SATISFIED | `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts:194` — `expect(cmds['lint']).toBe('pnpm run lint')` |
| A012 | Monorepo lint scoping block is removed from createAnaJson | ✅ SATISFIED | Source inspection: `grep 'stays scoped' state.ts` returns no matches. Lines 463-485 deleted per diff. |
| A013 | Per-surface lint commands are unaffected by the root lint change | ✅ SATISFIED | `packages/cli/src/commands/init/state.ts:543` — `lint: surfaceLint` still generated in surface block. |
| A014 | The resolveFindingPaths loop is not modified | ✅ SATISFIED | Source inspection: `packages/cli/src/commands/work.ts:1086-1095` — `resolveFindingPaths(existing.findings` present and unchanged per diff. |
| A015 | Old proof chains without migrations field are handled gracefully | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:5960-5976` — chain created without `migrations` field, test passes, optional chaining at line 1099 (`chain.migrations?.['surface_backfill']`) handles undefined. |

**Summary:** 14 SATISFIED, 1 UNSATISFIED (A010)

## Independent Findings

Predictions resolved:
1. **Bracket vs dot notation** — Confirmed cosmetic inconsistency but not a bug. The backfill guard at line 1099 uses `chain.migrations?.['surface_backfill']` (bracket) while the marker is set at line 1180 via spread (`{ ...chain.migrations, surface_backfill: true }`). Both work correctly. Bracket notation is actually more defensive for string keys.
2. **AC6 / A010 missed** — Confirmed. `proofSummary.ts:462` still has `surface?: string | undefined`.
3. **Dead `lang` variable** — Not found. `lang` is still used at line 469 for non-Node native commands.
4. **Heavyweight integration tests** — Confirmed. Each migration test creates a full git repo with plan artifacts and runs `completeWork`. This is the correct approach given `writeProofChain` is private, but it's ~100 lines of setup for 4 lines of behavioral assertion. The existing `deriveSurface` tests referenced by the spec are much lighter.
5. **Empty migrations object** — Investigated. `chain.migrations?.['surface_backfill']` correctly evaluates to `undefined` (falsy) for `{}`, so backfill runs. Correct behavior.

Surprise finding: The `lesson_to_closed` migration marker is always set unconditionally (line 1180) even though the lesson migration code no longer runs. This is correct per spec — the marker is a "this migration is complete" flag — but it means every `work complete` claims the lesson migration happened even for chains that never had lesson findings. Acceptable trade-off for simplicity.

## AC Walkthrough

- ✅ **AC1** — `proof_chain.json` gains `migrations` field. Verified by test at work.test.ts:5983 and source at work.ts:1180. Old chains handled via optional chaining at work.ts:1099.
- ✅ **AC2** — Backfill loop skipped when marker present. Verified by test at work.test.ts:6017 — entry without surface remains `undefined`.
- ✅ **AC3** — Lesson migration code (6 lines) removed. Diff confirms deletion. Maintenance loop (lines 1128-1173) intact: staleness checks, anchor-absent auto-closing, file-moved detection all present.
- ✅ **AC4** — Both `Object.keys(anaSurfaces).length > 0` guards simplified. Line 1050: `if (anaSurfaces)`. Line 1099: `if (anaSurfaces && !chain.migrations?.['surface_backfill'])`.
- ✅ **AC5** — `ProofChain` interface includes `migrations?: Record<string, boolean>` at proof.ts:28.
- ❌ **AC6** — `DashboardEntry.surface` NOT changed. proofSummary.ts:462 still reads `surface?: string | undefined`.
- ✅ **AC7** — `case 'lesson'` preserved at proofSummary.ts:1419.
- ✅ **AC8** — All existing tests pass (2711). Two new tests added (lines 5958, 5990): (a) migration marker written after backfill, (b) backfill skipped when marker present.
- ✅ **AC9** — `resolveFindingPaths` loop untouched. Lines 1086-1095 unchanged per diff.
- ✅ **AC10** — Root `commands.lint` uses project-wide command. Test at monorepoCommandScoping.test.ts:194 asserts `'pnpm run lint'`.
- ✅ **AC11** — Comment at state.ts:455 updated: "All three (build, test, lint) are project-wide."
- ✅ **AC12** — Scoping block removed. Lines 463-485 deleted per diff. `lintCmd` changed from `let` to `const`.
- ✅ **Tests pass** — 2713 passed, 2 skipped. `pnpm run test -- --run`.
- ✅ **No build errors** — `pnpm run build` successful. Lint clean (0 errors).

## Blockers

1 contract assertion UNSATISFIED: **A010** — `DashboardEntry.surface` in `proofSummary.ts:462` still uses `surface?: string | undefined` instead of `surface?: string`. This is a one-character change (remove `| undefined`). The spec explicitly describes it, the contract explicitly asserts it.

## Findings

- **Code — DashboardEntry.surface type annotation not cleaned:** `packages/cli/src/utils/proofSummary.ts:462` — `surface?: string | undefined` should be `surface?: string`. The `| undefined` is redundant with `?:`. This is the sole contract assertion failure (A010). One-line fix.
- **Test — Heavyweight integration setup for migration tests:** `packages/cli/tests/commands/work.test.ts:5858` — The `createProofProjectWithChain` helper is ~70 lines that creates a full git repo, ana.json, plan artifacts, build/verify reports, merges branches, all to test a 4-line code path. This is the correct approach since `writeProofChain` is private, but the setup dwarfs the behavioral assertions. The spec noted this gotcha. Accepted.
- **Code — Bracket notation inconsistency in migration guard:** `packages/cli/src/commands/work.ts:1099` — Uses `chain.migrations?.['surface_backfill']` (bracket) while the marker is set via object spread at line 1180. Both work correctly. Bracket notation is actually slightly more defensive for dynamic-feeling keys. Style observation only.
- **Upstream — surface-awareness-bridge-C4 resolved:** Backfill is now gated by migration marker. No longer O(n) on every `work complete` after first run. Directly resolved by this build.
- **Upstream — remove-lesson-status-C1 resolved:** Migration marker behavior now has two dedicated integration tests. Directly resolved by this build.
- **Code — lesson_to_closed marker set unconditionally:** `packages/cli/src/commands/work.ts:1180` — The marker is written on every `work complete` even though the lesson migration code was removed. Semantically claims "lesson migration complete" for chains that never had lesson findings. Correct per spec — the marker prevents future re-introduction of the migration code from running. Accepted.

## Deployer Handoff

This is a cleanup build — two independent changes sharing one theme (pre-surface code that hasn't been updated). The proof chain migration marker system is the structural change; the lint scoping removal is straightforward.

The A010 failure is a one-line cosmetic fix in `proofSummary.ts:462` — remove `| undefined` from the `surface` field type. After that fix, this build is shippable.

No behavioral regressions. Test count increased by 2 (2711 → 2713). Both resolved proof chain findings (`surface-awareness-bridge-C4`, `remove-lesson-status-C1`) are directly addressed by this build.

## Verdict
**Shippable:** NO
1 of 15 contract assertions UNSATISFIED (A010). 1 of 14 acceptance criteria FAIL (AC6). The fix is a single-line type annotation change in `proofSummary.ts:462`. After that fix, this build passes all checks.
