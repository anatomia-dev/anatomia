# Verify Report: Worktrees V2 — Phase Timing + Danger Map + Prune

**Result:** FAIL
**Created by:** AnaVerify
**Date:** 2026-05-06
**Spec:** .ana/plans/active/worktrees-v2-timing-danger-prune/spec.md
**Branch:** feature/worktrees-v2-timing-danger-prune

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/worktrees-v2-timing-danger-prune/contract.yaml
  Seal: INTACT (hash sha256:b215f463e78e88a6e0704ada3d8fd115b75cef58989b49d4a5adac562354693e)
```

Seal: **INTACT**

Tests: 1929 passed, 1 failed, 2 skipped. Build: pass. Lint: pass.

The 1 failure (`worktree.test.ts:125 — detectWorktreeSlug returns null for empty string`) is pre-existing: `detectWorktreeSlug('')` resolves to `process.cwd()` via `path.resolve('')`, so it picks up the worktree slug when tests run from inside a worktree. Passes on main (confirmed by running the same test from main's working directory). Not a regression from this build.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Build gets a ranked list of risky files | ✅ SATISFIED | `work.test.ts:3116` asserts `content.toContain('## Risk Profile')` |
| A002 | Files with more severe findings appear first | ✅ SATISFIED | `work.test.ts:3120-3121` asserts proofSummary.ts index < work.ts index (score 6 > 5) |
| A003 | Risk scores use severity weights: risk=3, debt=2, observation=1 | ✅ SATISFIED | `work.test.ts:3124-3125` asserts `risk score: 6` (3+2+1) and `risk score: 5` (3+2) |
| A004 | No empty risk section when files have no known issues | ✅ SATISFIED | `work.test.ts:3147` asserts `content.not.toContain('## Risk Profile')` |
| A005 | Bad contract YAML doesn't crash build setup | ✅ SATISFIED | `work.test.ts:3158` — malformed YAML falls back to raw string with no error; content contains 'Contract Assertions' |
| A006 | Risk profile shows findings but not build concerns | ✅ SATISFIED | `work.test.ts:3186-3187` asserts contains 'Test finding', not contains 'process.exit prevents testing' |
| A007 | Build duration uses build_started_at when available | ✅ SATISFIED | `proofSummary.test.ts:3304` asserts `timing.build === 45` (from _started_at, not 75min gap). Note: contract value is 60, test fixture produces 45 — behavior correct |
| A008 | Verify duration uses verify_started_at when available | ✅ SATISFIED | `proofSummary.test.ts:3325` asserts `timing.verify === 30` |
| A009 | Old entries without _started_at compute correctly | ✅ SATISFIED | `proofSummary.test.ts:3342` asserts `timing.build === 60` (gap timing), `timing.verify === 30` |
| A010 | Impossible timestamps don't produce nonsense durations | ✅ SATISFIED | `proofSummary.test.ts:3361` asserts `timing.build === 60` (falls back to gap timing) |
| A011 | Impossibly long build times fall back to gap timing | ✅ SATISFIED | `proofSummary.test.ts:3381` — build_started_at 35.5h before save triggers fallback. Gap timing produces 1500min (contract says 60 — value mismatch, behavior correct) |
| A012 | Negative durations from clock skew caught and corrected | ✅ SATISFIED | `proofSummary.test.ts:3399-3400` asserts `timing.verify === 30` (gap fallback) and `toBeGreaterThan(-1)`. Tests verify phase (contract targets build) — same logic applies |
| A013 | Health report shows median plan duration | ✅ SATISFIED | `proofSummary.test.ts:3432-3440` creates PipelineStats with `median_plan: 8`, asserts `toBe(8)`. Type-level test — computation verified indirectly through A015 |
| A014 | Missing plan timing doesn't crash stats | ✅ SATISFIED | `proofSummary.test.ts:3451-3458` creates PipelineStats with `median_plan: null`, asserts `toBeNull()`. Type-level test — computation verified through A016 |
| A015 | Pipeline breakdown shows scope, plan, build, verify | ✅ SATISFIED | `proof.test.ts:2698` asserts stdout contains 'scope', 'plan', 'build', 'verify' |
| A016 | Plan phase hidden when insufficient data | ✅ SATISFIED | `proof.test.ts:2730` asserts `stdout.not.toMatch(/plan \d+m/)` when entries lack `timing.plan` |
| A017 | Each phase records which agent ran it | ✅ SATISFIED | Source inspection: `work.ts:1558` calls `writeTimestamp(activePath, 'build_started_at', 'ana-build')`. No direct test — build_agent verified by writeTimestamp code path |
| A018 | Scoping agent recorded as ana | ✅ SATISFIED | `work.test.ts:3198` asserts `saves.work_agent === 'ana'` |
| A019 | Planning agent recorded as ana-plan | ✅ SATISFIED | `work.test.ts:3235` asserts `saves.plan_agent === 'ana-plan'` |
| A020 | Verify agent recorded as ana-verify | ✅ SATISFIED | Source inspection: `work.ts:1500` calls `writeTimestamp(activePath, 'verify_started_at', 'ana-verify')`. Tagged test (A019/A020) only checks plan_agent |
| A021 | Stale worktree records cleaned before listing | ✅ SATISFIED | `work.test.ts:3236-3270` creates stale worktree, calls getWorkStatus, verifies stale entry is gone |
| A022 | Prune failures don't break status command | ✅ SATISFIED | Same test — getWorkStatus completes without error despite stale worktree |
| A023 | PipelineStats type includes median_plan | ✅ SATISFIED | `types/proof.ts:178` adds `median_plan: number \| null`. Verified in A013 test |

## Independent Findings

### Out-of-Scope Deletion: archivePreviousVersion (REGRESSION)

The builder's second commit (`4354d50`) — made AFTER merging main into the feature branch — deleted the `archivePreviousVersion` function from `artifact.ts` (78 lines), the `escapeRegExp` helper (10 lines), all 4 call sites in `saveArtifact` and `saveAllArtifacts`, and the entire non-main-artifact-branch test block and artifact archive tests (484 lines total from `artifact.test.ts` and `work.test.ts`).

`artifact.ts` is NOT in the contract's `file_changes`. The spec states "All additive — no behavioral changes to existing code paths." The builder violated this constraint. The `rejection-artifact-preservation` feature was shipped (PR #79, commit `97ebdb9`) and its code was brought into the feature branch via the main merge. The builder then explicitly removed it.

**Impact:** Rejection artifact archiving is now broken. When a verify report FAILs and the builder fixes+resubmits, the previous verify report and build report are no longer archived to `_r{N}` files. This loses the audit trail of rejection cycles.

### Double H2 Heading in Risk Profile

`worktree.ts:481` writes `## Proof Findings` as a section header, then inserts `data.proofFindings` which starts with `## Risk Profile` (from `work.ts:1597`). The rendered output stacks two H2 headers:

```
## Proof Findings

## Risk Profile
**src/commands/work.ts** (risk score: 5) — ...
```

The spec mockup shows only `## Risk Profile`. The builder should have either (a) omitted `## Risk Profile` from the formatted content and let `## Proof Findings` be the header, or (b) renamed `## Proof Findings` in worktree.ts to `## Risk Profile`. The contract's A001 assertion checks for `## Risk Profile` (which is present inside the content), so this isn't a contract violation, but it's a formatting oddity that the build agent reading worktree-context.md will encounter.

### Sentinel Tests for A013/A014

The A013 and A014 tagged tests construct `PipelineStats` objects manually with hardcoded values (`median_plan: 8` and `median_plan: null`). They prove the type has the field — they do NOT test that `computePipelineStats` actually collects `timing.plan` values and computes the median. The computation is tested indirectly through A015/A016 (the health display tests exercise the full pipeline including `computePipelineStats`), but the tagged tests themselves are tautological type assertions.

### Missing Direct Tests for A017 and A020

A017 (`build_agent: "ana-build"`) and A020 (`verify_agent: "ana-verify"`) have no direct tagged tests. The tagged test for A017/A018 only checks `work_agent: "ana"`. The tagged test for A019/A020 only checks `plan_agent: "ana-plan"`. Both A017 and A020 are verified by source inspection (the `writeTimestamp` call sites clearly pass the correct agent strings), but the test coverage gap means a future refactor could break agent identity for build/verify without any test catching it.

### Contract Value Mismatches (Upstream)

A007 specifies `timing.build equals 60` but the test fixture correctly produces 45 (build_started_at to build-report is 45 minutes). A011 specifies `timing.build equals 60` but the gap-timing fallback produces 1500 (25 hours in the fixture). Both tests verify the correct behavior — the contract values were written for different fixtures.

### Pre-Existing: Cache Stale in getProofContext

The risk profile calls `getProofContext` which uses the known-stale cache (from Clean Ground for F3). If findings change between calls within one `writeProofChain` invocation, the risk profile could show stale data. This is an existing issue, not introduced by this build, but the danger map feature is now a new consumer of that cache.

## AC Walkthrough

- AC1: ✅ PASS — `startBuildPhase` with contract+file_changes produces `## Risk Profile` in `worktree-context.md` with files ranked by severity-weighted score. Verified via `work.test.ts:3103-3125`.
- AC2: ✅ PASS — Zero findings → no `## Risk Profile` section. Verified via `work.test.ts:3147`.
- AC3: ✅ PASS — Malformed YAML → falls back to raw string, no error. Verified via `work.test.ts:3153-3162`.
- AC4: ✅ PASS — Build concerns excluded from risk profile. Verified via `work.test.ts:3186-3187`.
- AC5: ✅ PASS — `computeTiming` reads `build_started_at`/`verify_started_at` and uses them. Verified via `proofSummary.test.ts:3304,3325`.
- AC6: ✅ PASS — Falls back to gap timing when _started_at absent. Verified via `proofSummary.test.ts:3342-3344`.
- AC7: ✅ PASS — Falls back when start > save (`proofSummary.test.ts:3361`), negative duration (`proofSummary.test.ts:3399`), or >24h (`proofSummary.test.ts:3381`).
- AC8: ✅ PASS — `computePipelineStats` collects `timing.plan` values, returns `median_plan`. Verified via `proofSummary.ts:966` (code) and indirectly through `proof.test.ts:2698` (display).
- AC9: ✅ PASS — `formatHealthDisplay` shows `scope · plan · build · verify`. Verified via `proof.test.ts:2718-2721`.
- AC10: ✅ PASS — `writeTimestamp` accepts agent parameter and writes `{phase}_agent`. Code at `work.ts:1698-1702` derives agent key via `key.replace('_started_at', '_agent')`.
- AC11: ✅ PASS — All call sites pass correct agent strings: `work_started_at → 'ana'` (line 1452), `plan_started_at → 'ana-plan'` (line 1489), `build_started_at → 'ana-build'` (lines 1527, 1558), `verify_started_at → 'ana-verify'` (line 1500).
- AC12: ✅ PASS — `getWorkStatus` calls `runGit(['worktree', 'prune'])` at `work.ts:665`, inside `if (currentBranch)` guard, before `discoverSlugs` at line 672. Errors swallowed silently.
- AC13: ✅ PASS — `PipelineStats` has `median_plan: number | null` at `types/proof.ts:178`.
- Tests pass: ⚠️ PARTIAL — 1929 passed, 1 failed (pre-existing, not regression), 2 skipped.
- No build errors: ✅ PASS — Build and lint both pass.

## Blockers

**Out-of-scope deletion of shipped functionality.** The builder deleted the `archivePreviousVersion` function from `artifact.ts` (not in spec's `file_changes`), all 4 call sites, the `escapeRegExp` helper, and 484 lines of tests from `artifact.test.ts` and `work.test.ts` covering the `rejection-artifact-preservation` and `non-main-artifact-branch-tests` features. The spec explicitly states "All additive — no behavioral changes to existing code paths." This is a regression to previously shipped features.

To fix: revert the deletions from `artifact.ts`, `artifact.test.ts`, and the `non-main artifact branch` + `startWork on develop` test blocks from `work.test.ts`. These can be cherry-picked from `faca865` (the merge commit that brought them in).

## Findings

- **Code — Out-of-scope deletion of archivePreviousVersion:** `packages/cli/src/commands/artifact.ts` — Builder removed the entire `archivePreviousVersion` function (78 lines), `escapeRegExp` helper (10 lines), and all 4 call sites in `saveArtifact`/`saveAllArtifacts`. This was a shipped feature from `rejection-artifact-preservation` (PR #79). Removed in commit `4354d50` after merging main brought the code in. File is NOT in the spec's `file_changes`.

- **Test — Deleted tests from prior features:** `packages/cli/tests/commands/artifact.test.ts` (360 lines), `packages/cli/tests/commands/work.test.ts` (124 lines) — Builder removed the `non-main artifact branch` describe block (3 tests), the `startWork on develop` tests (2 tests), and the artifact archiving tests. All belonged to completed features (`non-main-artifact-branch-tests`, `rejection-artifact-preservation`). Regression risk: these features are now untested.

- **Code — Double H2 heading in risk profile:** `packages/cli/src/commands/work.ts:1597` — `proofFindings` content starts with `## Risk Profile`, but `worktree.ts:481` wraps it in `## Proof Findings`. Output has two stacked H2 headers. Build agent will see this when reading worktree-context.md.

- **Test — A013/A014 are type-level sentinels:** `packages/cli/tests/utils/proofSummary.test.ts:3432,3451` — Construct PipelineStats objects manually and assert field values. Prove the type exists, not that `computePipelineStats` computes `median_plan` correctly. Computation is tested indirectly through A015/A016.

- **Test — A017 (build_agent) untagged:** No test asserts `saves.build_agent === 'ana-build'`. Verified by reading `work.ts:1527,1558` which call `writeTimestamp(..., 'build_started_at', 'ana-build')`. The `writeTimestamp` function's agent key derivation at `work.ts:1700` handles it correctly.

- **Test — A020 (verify_agent) untagged:** No test asserts `saves.verify_agent === 'ana-verify'`. Tagged test `@ana A019, A020` at `work.test.ts:3207` only checks `plan_agent`. Verified by reading `work.ts:1500`.

- **Upstream — Contract A007 value stale:** Contract says `timing.build equals 60` but test fixture correctly produces 45. Behavior (use _started_at) is verified — contract value doesn't match the fixture.

- **Upstream — Contract A011 value stale:** Contract says `timing.build equals 60` but gap-timing fallback produces 1500 in the test fixture. Behavior (fall back to gap timing on >24h) is verified.

- **Upstream — Stale finding still present:** `packages/cli/src/utils/proofSummary.ts` — Cache never invalidated (from Clean Ground for F3). Risk profile is now a new consumer of `getProofContext`, inheriting this weakness.

- **Test — detectWorktreeSlug empty-string test is environment-dependent:** `packages/cli/tests/utils/worktree.test.ts:125` — Pre-existing: `detectWorktreeSlug('')` resolves to cwd, fails when tests run from inside a worktree. Not a regression.

## Deployer Handoff

**Do not merge as-is.** The builder deleted the `archivePreviousVersion` function and its tests — these belong to the `rejection-artifact-preservation` feature (PR #79) and must be restored.

After fixing the out-of-scope deletions:
- The 3 feature areas (danger map, phase timing, worktree prune) are clean and well-tested.
- The double H2 heading in risk profile is cosmetic — acceptable for now, can be fixed in a follow-up.
- The A013/A014 sentinel tests are weak but the behavior is covered indirectly through the health display tests.
- Agent identity (A017/A020) lacks direct test coverage but is verified by source inspection — the code is straightforward and low-risk.

## Verdict
**Shippable:** NO
The new features work correctly. All 23 contract assertions are satisfied. All acceptance criteria pass. But the builder deleted 113 lines of source code and 484 lines of tests from files outside the spec's `file_changes`, removing the shipped `archivePreviousVersion` feature and 5 tests from prior builds. This is a regression that must be reverted before shipping.
