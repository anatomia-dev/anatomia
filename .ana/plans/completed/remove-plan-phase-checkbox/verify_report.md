# Verify Report: Remove the non-authoritative plan.md phase checkbox

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-08
**Spec:** .ana/plans/active/remove-plan-phase-checkbox/spec.md
**Branch:** feature/remove-plan-phase-checkbox

## Pre-Check Results

`ana verify pre-check remove-plan-phase-checkbox`:
```
=== CONTRACT COMPLIANCE ===
  Contract: .../remove-plan-phase-checkbox/contract.yaml
  Seal: INTACT (hash sha256:f899bf46c2c644d1e90fee2889aefa5862015836c0c22e455f4d98c03c42dadc)
```
Seal status: **INTACT** — contract unmodified since AnaPlan sealed it.

**Build:** `pnpm run build` — exit 0 (clean).
**Tests (independent, sealed):** 3589 passed, 0 failed, 2 skipped (baseline was 3582 passed / 2 skipped → net +7).
```
<!-- ana:capture stage=verify slug=remove-plan-phase-checkbox counts=3589p/0f/2s verdict=pass sha256=29ead85e49db3cc2c101dd2acbe7624fc6b51eb47b349a056f9a56a5b1a12a3f -->
```
**Lint:** `(cd packages/cli && pnpm run lint)` — 0 errors, 1 warning. The lone warning (`src/utils/git-operations.ts:198` unused eslint-disable) is **pre-existing** (file not in this build's changeset; directive present on main). Not a regression.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Old checkbox-style plan still accepted | ✅ SATISFIED | `artifact.test.ts:804` "accepts old-format (checkbox)…" asserts `not.toThrow`; validator walks `## Phases`, accepts `- [ ]` as a `- ` line (`artifact-validators.ts:86`). |
| A002 | New plain-list plan accepted | ✅ SATISFIED | `artifact.test.ts:817` new-format (no glyph) → `not.toThrow`. |
| A003 | Multi-phase plan w/ spec per phase accepted | ✅ SATISFIED | `artifact.test.ts:832` two phases each with `Spec:` → `not.toThrow`; `Depends on:` sub-line correctly excluded. |
| A004 | Phase missing Spec ref rejected | ✅ SATISFIED | `artifact.test.ts:864` phase with only `Description:` → `toThrow`; validator per-phase Spec check (`artifact-validators.ts:97-107`). |
| A005 | Plan with no `## Phases` rejected | ✅ SATISFIED | `artifact.test.ts:843` → `toThrow`; heading check (`artifact-validators.ts:56`). |
| A019 | Empty `## Phases` section rejected | ✅ SATISFIED | `artifact.test.ts:847` heading present, no `- ` entries → `toThrow`; zero-phase guard (`artifact-validators.ts:91`). |
| A006 | countPhases reads old format | ✅ SATISFIED | `work-state.test.ts` total=1, specs=['spec.md']; `work-state.ts` unchanged. |
| A007 | countPhases reads new format | ✅ SATISFIED | `work-state.test.ts` new-format total=1. |
| A008 | countPhases multi-phase | ✅ SATISFIED | `work-state.test.ts` total=2, specs=['spec-1.md','spec-2.md']. |
| A009 | verify-report single-save does not commit plan.md | ✅ SATISFIED | `artifact.test.ts:683` on a **feature branch** asserts `isFileCommitted(plan.md)===false`; discriminating (single-save removed block was live there). Staging block removed `artifact.ts` (was 1201-1208). |
| A010 | verify-report bulk-save does not commit plan.md | ⚠️ DEVIATED | Coupling block removed from `saveAllArtifacts` (was 1630-1638); grep confirms no remaining plan.md staging. **But** the tagged test (`artifact.test.ts:2460`) runs on the artifact branch where that block was a guarded no-op — it does not assert `false` and does not discriminate the fix. Requirement verified by source inspection (on a feature branch plan.md is filtered from primaries → not committed). See Findings + AC5. |
| A011 | verify-report save still commits the report | ✅ SATISFIED | `artifact.test.ts:683` asserts `isFileCommitted(verify_report.md)===true`. |
| A012 | `work complete --merge` succeeds w/ tracked-modified plan.md | ✅ SATISFIED | `work-merge.test.ts:705` reproduces the autostash collision (origin ahead, conflicting line); completion succeeds, item archived. Pull defense `work.ts:749-763`. |
| A013 | Completion leaves no uncommitted plan.md | ✅ SATISFIED | Same test asserts `git status --porcelain` empty post-completion and archived plan.md has no `<<<<<<<` markers. |
| A014 | AnaPlan emits glyph-free phase line | ✅ SATISFIED | `- {phase description matching the scope}` present in all 4 ana-plan files (grep -rln, 4/4). |
| A015 | AnaVerify not told to tick checkbox | ✅ SATISFIED | grep "change the phase's checkbox" → 0 hits across all 4 ana-verify files. |
| A016 | AnaVerify not told save stages plan.md | ✅ SATISFIED | grep "stages plan.md" → 0 hits across all 4 ana-verify files. |
| A017 | AnaBuild guidance drops checkbox ref | ✅ SATISFIED | grep "plan.md checkboxes" → 0 hits; now "Don't touch plan.md. AnaPlan owns it." |
| A018 | Docs drop checkbox-update mention | ✅ SATISFIED | grep "checkbox updates in multi-phase" → 0 hits in `artifacts.mdx`. |

18/19 SATISFIED, 1 DEVIATED (A010). No UNSATISFIED.

## Independent Findings

**Predictions (Step 3) resolved:**
1. *Dead variables left after deleting staging blocks (`relPlanPath`/`planPath`)* → **Not found.** Both blocks removed wholesale; no orphaned vars (`artifact.ts` diff is pure deletion).
2. *A tagged test that doesn't discriminate* → **CONFIRMED** at A010 — see below. This was the highest-value find.
3. *Validator edge case missed (`Depends on:` miscounted as a phase)* → **Not found.** Indented sub-items excluded by `startsWith('- ')` (unindented only); `countPhases` multi-phase test proves total=2 with a `Depends on:` line present.
4. *`not_contains` edits removing one instance but leaving residuals* → **Not found.** Every forbidden string greps to 0 across all four copies.
5. *Claude/Codex drift* → **Not found.** Changed-hunk parity is byte-identical for all three agent files.

**Surprise (not predicted):** the A010 *contract assertion itself* is misframed — its literal `false` only holds on a feature branch. On the artifact branch, `saveAllArtifacts` legitimately commits plan.md as a primary artifact, so `isFileCommitted(plan.md)` is `true` there regardless of the fix. The builder reframed the test to "no verify-report-coupled staging + clean tree" rather than the contract's literal `false`. The code is correct; the assertion was written without the branch-context distinction.

**Production-risk prediction** — *in-flight items carrying an already-dirty plan.md predating this fix could still block `--merge`.* The `work.ts` pull defense addresses exactly this, and `work-merge.test.ts:705` reproduces the collision (origin/main rewriting the same line the working tree has uncommitted) and proves the archived plan.md is clean, not conflict-corrupted. Genuinely discriminating test — the comment explains the pull returns exit 0 despite a conflict, so the restore-from-HEAD is what prevents committing `<<<<<<<` markers. Good defense-in-depth.

**Quality observations:** Code matches the spec's "mirror, not share" decision — the `Spec:` regex is duplicated verbatim with a comment pointing to the canonical `work-state.ts:125`, and `countPhases` is untouched (AC7 preserved). `noUncheckedIndexedAccess` guards are present on every `lines[i]` access. Engine-purity boundary respected (`artifact-validators.ts` stays CLI-dependency-free). No over-building: no new exports, no unused params, no gold-plating beyond the five coordinated moves.

## AC Walkthrough

- **AC1** — Multi-phase completion leaves no uncommitted/modified plan.md. ✅ PASS — `work-merge.test.ts:705` asserts `git status --porcelain` empty after `--merge`.
- **AC2** — `--merge` never blocked by plan.md state, incl. pre-fix dirty plan.md. ✅ PASS — pull defense (`work.ts:749-763`) restores tracked-modified plan.md from HEAD before the autostash pull; test reproduces the collision and completes.
- **AC3** — AnaPlan emits plain-list phases w/ `Spec:` per phase, no glyph, all 4 files, Claude≡Codex. ✅ PASS — grep 4/4 + parity check.
- **AC4** — No instruction tells AnaVerify to tick plan.md; AnaBuild guidance coherent. ✅ PASS — forbidden strings grep to 0; new wording ("AnaPlan owns it") is coherent.
- **AC5** — `ana artifact save verify-report` (single + multi) does not stage/commit plan.md. ⚠️ PARTIAL — **single-save** proven by a discriminating feature-branch test (A009). **Multi-save** coupling is removed and verified by source inspection (on a feature branch plan.md is filtered from primaries; the removed block was the only verify-report-coupled stage), but the tagged multi-save test runs on the artifact branch where that block was a no-op, so it does not independently demonstrate the multi-save claim. Code is correct; test coverage for the multi-save path is weaker than the AC describes.
- **AC6** — Validator enforces `Spec:` per phase, accepts old+new, in-flight plans validate. ✅ PASS — A001–A004, A019.
- **AC7** — `countPhases` unchanged; status display unchanged. ✅ PASS — `work-state.ts` has zero diff vs main; format-agnostic counting tests pass.
- **AC8** — `artifacts.mdx` no longer describes checkbox updates. ✅ PASS — A018.
- **AC9** — Claude/Codex instructions behaviorally identical. ✅ PASS — changed-hunk parity byte-identical for plan/verify/build.
- **Implementation** — full suite passes, no new lint errors; the two named legacy tests handled. ✅ PASS — 3589p/0f/2s; the "stages plan.md" test (683) inverted to assert NOT committed; the "rejects without checkboxes" test (827) split into A004 (missing-Spec rejects) and A019 (empty-section rejects). 1 lint warning is pre-existing/unrelated.

## Blockers

None. The fix ships correctly: the disease (verify-report→plan.md staging) is removed at the source in both save paths, the validator re-anchors `Spec:`-per-phase without dropping enforcement, the merge pull defense is real and discriminatingly tested, and the 12 agent files + doc are coherent and platform-parity-clean.

Searched specifically for: dead variables after the staging deletions (none — pure deletions); unused exports in changed source (none — no new exports); error paths swallowed silently (validator returns error strings, surfaced via existing `chalk.red`+`exit(1)` path); external-state assumptions (pull defense scopes strictly to one path, leaves sibling artifacts untouched); `countPhases` regression (file unchanged); residual checkbox coupling anywhere in the agent corpus (grep clean). The one real defect — A010's non-discriminating test — is a test-quality gap over correct code, not a shipping blocker.

## Findings

- **Test — A010 tagged test is a sentinel:** `packages/cli/tests/commands/artifact.test.ts:2460` — runs on the artifact branch (`createTestProject()` defaults to `currentBranch === artifactBranch`), where the deleted `saveAllArtifacts` block was guarded by `!artifactPaths.includes(relPlanPath)` and plan.md is already a primary. The test therefore yields the identical result (plan.md committed, clean tree) with or without the fix — it would have passed before the change. To discriminate, it must run on a feature branch (`currentBranch !== artifactBranch`) where plan.md is filtered from primaries, asserting `isFileCommitted(plan.md) === false` — which also matches the real-world scenario (Verify runs in a worktree). The single-save A009 test is the discriminating one and is correctly on a feature branch.
- **Upstream — Contract A010 misframed for branch context:** A010's literal `isFileCommitted(plan.md) === false after save-all` only holds on a feature branch. On the artifact branch, `saveAllArtifacts` commits plan.md as a legitimate primary artifact (status would be `true`), so the assertion as written contradicts normal save-all behavior. A future seal should either pin the branch context or restate the assertion as "no verify-report-*coupled* staging of plan.md." Recorded so the next planner tightens it.
- **Code — Phase detection is bullet-literal:** `packages/cli/src/commands/artifact-validators.ts:86` — `line.startsWith('- ')` recognizes only `- ` bullets; a `* ` bullet or tab-prefixed dash is silently uncounted. This faithfully mirrors `countPhases` (intentional, commented, pointing at `work-state.ts:125`), so the two copies stay consistent — but it documents a frozen-format fragility shared by both for whoever next touches plan parsing.
- **Code — Pull-defense porcelain gate is broad:** `packages/cli/src/commands/work.ts:749` — the guard `planStatus.trim() && !trimStart().startsWith('??')` also treats a staged-deleted (`D `) or renamed (`R `) plan.md as "modified" and restores it from HEAD. Harmless (restoring a non-authoritative file is the desired outcome), but the comment frames the guard narrowly as "tracked-modified"; the behavior is slightly broader than the prose. Acknowledged, no action needed.

## Deployer Handoff

- **Behavior change for in-flight items:** after merge, AnaVerify no longer edits plan.md, and verify-report saves no longer stage it. Existing plans on disk with the old `- [ ]` glyph still validate (backward-compatible) — no migration needed.
- **The merge pull defense is load-bearing for pre-fix items:** any work item started before this change that carries a dirty plan.md on disk will have it silently restored from HEAD during `ana work complete --merge` (with a yellow notice unless `--json`). This is intended.
- **One test-quality follow-up (non-blocking):** the A010 multi-save test should be moved to a feature-branch fixture to actually discriminate the staging removal. Tracked in Findings; does not affect correctness.
- Templates and dogfood `.claude`/`.codex` copies were edited in lockstep, so this install is correct immediately without waiting for a re-init.

## Verdict

**Shippable:** YES

The code is correct on every path I exercised: build clean, 3589 tests green, lint clean (sole warning pre-existing and unrelated), contract seal INTACT, and all nine acceptance criteria met (AC5 with the multi-save sub-path verified by source inspection rather than a discriminating test). The single genuine defect is a sentinel test for A010 over code that is itself right — a test-quality gap and an upstream contract-framing gap, both documented for follow-up, neither a reason to hold the change. I'd stake my name on this shipping.
