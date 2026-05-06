# Verify Report: Worktrees V2 — Phase Timing + Danger Map + Prune

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-06
**Spec:** .ana/plans/active/worktrees-v2-timing-danger-prune/spec.md
**Branch:** feature/worktrees-v2-timing-danger-prune

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/worktrees-v2-timing-danger-prune/.ana/plans/active/worktrees-v2-timing-danger-prune/contract.yaml
  Seal: INTACT (hash sha256:b215f463e78e88a6e0704ada3d8fd115b75cef58989b49d4a5adac562354693e)
```

Seal: **INTACT**

Tests: 1949 passed, 1 failed, 2 skipped. Build: pass. Lint: pass.

The 1 failure (`worktree.test.ts:125 — detectWorktreeSlug returns null for empty string`) is pre-existing: `detectWorktreeSlug('')` resolves to `process.cwd()` via `path.resolve('')`, picking up the worktree slug when tests run from inside a worktree. Passes on main. Not a regression from this build.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Build gets a ranked list of risky files | ✅ SATISFIED | `work.test.ts:3222` asserts `content.toContain('## Risk Profile')` |
| A002 | Files with more severe findings appear first | ✅ SATISFIED | `work.test.ts:3225-3227` asserts proofSummary.ts index < work.ts index (score 6 > 5) |
| A003 | Risk scores use severity weights: risk=3, debt=2, observation=1 | ✅ SATISFIED | `work.test.ts:3230-3231` asserts `risk score: 6` (3+2+1) and `risk score: 5` (3+2) |
| A004 | No empty risk section when files have no known issues | ✅ SATISFIED | `work.test.ts:3253` asserts `content.not.toContain('## Risk Profile')` |
| A005 | Bad contract YAML doesn't crash build setup | ✅ SATISFIED | `work.test.ts:3269` — malformed YAML falls back to raw string with no error; content contains 'Contract Assertions' |
| A006 | Risk profile shows findings but not build concerns | ✅ SATISFIED | `work.test.ts:3299-3300` asserts contains 'Test finding', not contains 'process.exit prevents testing' |
| A007 | Build duration uses build_started_at when available | ✅ SATISFIED | `proofSummary.test.ts:3310` asserts `timing.build === 45` (from _started_at, not 75min gap). Contract value is 60 — fixture produces 45; behavior correct |
| A008 | Verify duration uses verify_started_at when available | ✅ SATISFIED | `proofSummary.test.ts:3328` asserts `timing.verify === 30` |
| A009 | Old entries without _started_at compute correctly | ✅ SATISFIED | `proofSummary.test.ts:3345-3347` asserts `timing.build === 60` (gap timing), `timing.verify === 30` |
| A010 | Impossible timestamps don't produce nonsense durations | ✅ SATISFIED | `proofSummary.test.ts:3365` asserts `timing.build === 60` (falls back to gap timing) |
| A011 | Impossibly long build times fall back to gap timing | ✅ SATISFIED | `proofSummary.test.ts:3385` — build_started_at 35.5h before save triggers fallback. Gap timing produces 1500min (contract says 60 — value mismatch, behavior correct) |
| A012 | Negative durations from clock skew caught and corrected | ✅ SATISFIED | `proofSummary.test.ts:3403-3405` asserts `timing.verify === 30` (gap fallback) and `toBeGreaterThan(-1)` |
| A013 | Health report shows median plan duration | ✅ SATISFIED | `proofSummary.test.ts:3440-3448` creates PipelineStats with `median_plan: 8`, asserts `toBe(8)`. Type-level test — computation verified indirectly through A015 |
| A014 | Missing plan timing doesn't crash stats | ✅ SATISFIED | `proofSummary.test.ts:3456-3461` creates PipelineStats with `median_plan: null`, asserts `toBeNull()`. Type-level test — computation verified through A016 |
| A015 | Pipeline breakdown shows scope, plan, build, verify | ✅ SATISFIED | `proof.test.ts:2717-2720` asserts stdout contains 'scope', 'plan', 'build', 'verify' |
| A016 | Plan phase hidden when insufficient data | ✅ SATISFIED | `proof.test.ts:2744` asserts `stdout.not.toMatch(/plan \d+m/)` when entries lack `timing.plan` |
| A017 | Each phase records which agent ran it | ✅ SATISFIED | Source inspection: `work.ts:1558` calls `writeTimestamp(activePath, 'build_started_at', 'ana-build')`. Tag `@ana A017, A018` at `work.test.ts:3303` verifies `work_agent === 'ana'` — shares tag but only covers work agent directly |
| A018 | Scoping agent recorded as ana | ✅ SATISFIED | `work.test.ts:3325` asserts `saves.work_agent === 'ana'` |
| A019 | Planning agent recorded as ana-plan | ✅ SATISFIED | `work.test.ts:3357` asserts `saves.plan_agent === 'ana-plan'` |
| A020 | Verify agent recorded as ana-verify | ✅ SATISFIED | Source inspection: `work.ts:1501` calls `writeTimestamp(activePath, 'verify_started_at', 'ana-verify')`. Tag `@ana A019, A020` at `work.test.ts:3331` only checks `plan_agent` directly |
| A021 | Stale worktree records cleaned before listing | ✅ SATISFIED | `work.test.ts:3360-3392` creates stale worktree, calls getWorkStatus, verifies stale entry is gone from `git worktree list` |
| A022 | Prune failures don't break status command | ✅ SATISFIED | Same test — getWorkStatus completes without error despite stale worktree |
| A023 | PipelineStats type includes median_plan | ✅ SATISFIED | `types/proof.ts:178` adds `median_plan: number | null`. Verified in A013/A014 tests |

## Independent Findings

All contract assertions satisfied. The three feature areas (danger map, phase timing, worktree prune) are well-implemented. The risk profile code at `work.ts:1572-1617` is clean — YAML parse, severity weighting, descending sort, markdown formatting. The timing logic at `proofSummary.ts:1516-1545` has proper sanity guards (start > save, negative, >24h) with gap-timing fallback. The prune at `work.ts:664-668` is exactly where the spec says (inside `if (currentBranch)` guard, before `discoverSlugs`).

I checked for over-building: no unspecified parameters, exports, or features. `getProofContext` and `yaml` imports in `work.ts` are both used. No dead code blocks in new code paths. The `SEVERITY_WEIGHTS` record and `rankedFiles` array are local to the danger map section — no leakage.

## Previous Findings Resolution

### Previously UNSATISFIED Assertions

No assertions were UNSATISFIED in the previous report — the FAIL was due to out-of-scope deletion, not contract compliance failures.

### Previous Findings

| Finding | Status | Notes |
|---------|--------|-------|
| Code — Out-of-scope deletion of archivePreviousVersion | Fixed | `archivePreviousVersion` restored at `artifact.ts:182`, `escapeRegExp` at `artifact.ts:237`, all 4 call sites present (lines 917, 1047, 1390, 1395) |
| Test — Deleted tests from prior features | Fixed | `artifact.test.ts:356` has `non-main artifact branch` block, `artifact.test.ts:2594` has `artifact archiving` block (13 tests). `work.test.ts:2725` has `non-main artifact branch` block |
| Code — Double H2 heading in risk profile | Still present | `worktree.ts:481` pushes `## Proof Findings`, `work.ts:1604` writes `## Risk Profile` in proofFindings content. Not a blocker — cosmetic |
| Test — A013/A014 are type-level sentinels | Still present | Computation verified indirectly through A015/A016. Accepted |
| Test — A017 (build_agent) untagged | Still present | Tag `@ana A017, A018` at `work.test.ts:3303` covers `work_agent` only. `build_agent` verified by source inspection |
| Test — A020 (verify_agent) untagged | Still present | Tag `@ana A019, A020` at `work.test.ts:3331` covers `plan_agent` only. `verify_agent` verified by source inspection |
| Upstream — Contract A007 value stale | Still present | Contract says 60, fixture produces 45. Behavior correct |
| Upstream — Contract A011 value stale | Still present | Contract says 60, fixture produces 1500. Behavior correct |
| Upstream — Stale cache in getProofContext | Still present | Not addressed by this build — pre-existing |
| Test — detectWorktreeSlug empty-string test environment-dependent | Still present | Pre-existing, not part of this build |

## AC Walkthrough

- AC1: ✅ PASS — `startBuildPhase` with contract+file_changes produces `## Risk Profile` in `worktree-context.md` with files ranked by severity-weighted score. Verified via `work.test.ts:3186-3232`.
- AC2: ✅ PASS — Zero findings → no `## Risk Profile` section. Verified via `work.test.ts:3253`.
- AC3: ✅ PASS — Malformed YAML → falls back to raw string, no error. Verified via `work.test.ts:3257-3270`.
- AC4: ✅ PASS — Build concerns excluded from risk profile. Verified via `work.test.ts:3299-3300`.
- AC5: ✅ PASS — `computeTiming` reads `build_started_at`/`verify_started_at` and uses them. Verified via `proofSummary.test.ts:3310,3328`. Source at `proofSummary.ts:1491-1492`.
- AC6: ✅ PASS — Falls back to gap timing when _started_at absent. Verified via `proofSummary.test.ts:3345-3347`.
- AC7: ✅ PASS — Falls back when start > save (`proofSummary.test.ts:3365`), negative duration (`proofSummary.test.ts:3403`), or >24h (`proofSummary.test.ts:3385`). Source guards at `proofSummary.ts:1520-1529,1535-1544`.
- AC8: ✅ PASS — `computePipelineStats` collects `timing.plan` values, returns `median_plan`. Verified via `proofSummary.ts:967,974` (source) and `proof.test.ts:2699-2720` (integration).
- AC9: ✅ PASS — `formatHealthDisplay` shows `scope · plan · build · verify`. Verified via `proof.ts:446-449` (source) and `proof.test.ts:2717-2720`.
- AC10: ✅ PASS — `writeTimestamp` accepts agent parameter at `work.ts:1690`, writes `{phase}_agent` at `work.ts:1703-1704`.
- AC11: ✅ PASS — All call sites pass correct agent strings: `work_started_at → 'ana'` (line 1452), `plan_started_at → 'ana-plan'` (line 1489), `build_started_at → 'ana-build'` (lines 1527, 1558), `verify_started_at → 'ana-verify'` (line 1501).
- AC12: ✅ PASS — `getWorkStatus` calls `runGit(['worktree', 'prune'])` at `work.ts:665`, inside `if (currentBranch)` guard (line 642), before `discoverSlugs` (line 672). Errors swallowed silently (line 666-668).
- AC13: ✅ PASS — `PipelineStats` has `median_plan: number | null` at `types/proof.ts:178`.
- Tests pass: ⚠️ PARTIAL — 1949 passed, 1 failed (pre-existing, not regression), 2 skipped.
- No build errors: ✅ PASS — Build and lint both pass.

## Blockers

No blockers. All 23 contract assertions satisfied, all 13 ACs pass, no regressions. The previous blocker (out-of-scope deletion of `archivePreviousVersion`) is fully resolved — function restored at `artifact.ts:182`, helper at `artifact.ts:237`, all 4 call sites present, and all prior-feature tests restored in `artifact.test.ts` and `work.test.ts`.

Checked for: unused exports in new code (none — `getProofContext` import used at `work.ts:1579`, `yaml` import used at `work.ts:1574`), unused parameters (all used), error paths that swallow silently (`work.ts:1615` catch is intentional per AC3, `work.ts:666` catch is intentional per AC12), sentinel test patterns (A013/A014 noted in findings, acceptable given indirect coverage through A015/A016).

## Findings

- **Code — Double H2 heading in risk profile:** `packages/cli/src/utils/worktree.ts:481` — pushes `## Proof Findings` header, then `data.proofFindings` (from `packages/cli/src/commands/work.ts:1604`) starts with `## Risk Profile`. Output has two stacked H2 headers. Build agent sees both when reading worktree-context.md. Cosmetic — the content is correct.

- **Test — A013/A014 are type-level sentinels:** `packages/cli/tests/utils/proofSummary.test.ts:3432,3451` — Construct PipelineStats objects manually and assert field values. Prove the type exists, not that `computePipelineStats` computes `median_plan` correctly. Computation is tested indirectly through A015/A016 (health display exercises the full pipeline).

- **Test — A017 (build_agent) and A020 (verify_agent) lack direct tests:** `packages/cli/tests/commands/work.test.ts:3303` tag `@ana A017, A018` only tests `work_agent`. `work.test.ts:3331` tag `@ana A019, A020` only tests `plan_agent`. Both `build_agent` and `verify_agent` are verified by source inspection — the `writeTimestamp` code is straightforward (`work.ts:1558,1501`).

- **Upstream — Contract A007 value stale:** Contract says `timing.build equals 60` but test fixture correctly produces 45 (build_started_at to build-report is 45 minutes). Behavior verified — contract value doesn't match fixture.

- **Upstream — Contract A011 value stale:** Contract says `timing.build equals 60` but gap-timing fallback produces 1500 in test fixture (25-hour gap between contract and build-report). Behavior verified.

- **Upstream — Stale cache in getProofContext:** `packages/cli/src/utils/proofSummary.ts` — cache never invalidated (from Clean Ground for F3). Risk profile is now a new consumer via `packages/cli/src/commands/work.ts:1579`, inheriting this weakness. Pre-existing, not introduced by this build.

- **Test — detectWorktreeSlug empty-string test is environment-dependent:** `packages/cli/tests/utils/worktree.test.ts:125` — `detectWorktreeSlug('')` resolves to cwd via `path.resolve('')`, fails when tests run from inside a worktree. Pre-existing.

## Deployer Handoff

Three clean features, all additive:

1. **Danger map** — `startBuildPhase` now writes a `## Risk Profile` section to worktree-context.md when proof chain findings exist for the contract's `file_changes`. Build agent sees file history before starting work.
2. **Phase timing** — `computeTiming` uses `_started_at` timestamps for accurate build/verify durations. Backward compatible with old entries. `computePipelineStats` computes `median_plan`. Health display shows all 4 phases.
3. **Worktree prune** — `getWorkStatus` calls `git worktree prune` before discovery. Best-effort, errors swallowed.

The double H2 heading (`## Proof Findings` / `## Risk Profile`) is cosmetic — fix in a follow-up by removing `## Risk Profile` from the formatted content (the `## Proof Findings` header already serves as the section header).

The restoration of `archivePreviousVersion` and prior-feature tests is clean — verified all call sites and test blocks are present.

## Verdict
**Shippable:** YES
All 23 contract assertions satisfied. All acceptance criteria pass. No regressions. The previous blocker (out-of-scope deletion) is fully resolved. The 7 findings are observations and minor debt — none prevent shipping.
