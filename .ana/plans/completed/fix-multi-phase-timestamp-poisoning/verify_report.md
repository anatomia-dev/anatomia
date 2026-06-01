# Verify Report: Fix Multi-Phase Timestamp Poisoning

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-31
**Spec:** .ana/plans/active/fix-multi-phase-timestamp-poisoning/spec.md
**Branch:** feature/fix-multi-phase-timestamp-poisoning

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-multi-phase-timestamp-poisoning/contract.yaml
  Seal: INTACT (hash sha256:dcd0c02dba63bbd0f56223c6d7f26ee0b3e4493767c6fedb20c8f1052bcb28eb)
```

Tests: 3129 passed, 0 failed, 2 skipped. Build: clean (typecheck + tsup). Lint: 0 errors, 1 pre-existing warning (unused eslint-disable directive in an unrelated file).

Test count increased from 3099 → 3129 (+30 new tests). Test files: 129 (unchanged). No regressions.

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Phase 2 status is not blocked by Phase 1's verify timestamp | ✅ SATISFIED | work.test.ts:6430 — creates worktree with recent verify_started_at_1, asserts output contains 'phase-2-ready-for-verify' and not 'verify-in-progress' |
| A002 | Phase 2 verify start writes a phase-specific timestamp | ✅ SATISFIED | work.test.ts:6647 — runs startWork from worktree, asserts saves.verify_started_at_2 matches ISO date pattern |
| A003 | Phase 2 verify start writes a phase-specific agent key | ✅ SATISFIED | work.test.ts:6647 — asserts saves.verify_agent_2 === 'ana-verify' |
| A004 | Phase 2 verify start does not write the generic verify timestamp | ✅ SATISFIED | work.test.ts:6647 — asserts saves.verify_started_at is undefined |
| A005 | Single-spec work still detects verify-in-progress correctly | ✅ SATISFIED | work.test.ts:6463 — single-spec with recent verify_started_at, asserts output contains 'verify-in-progress' |
| A006 | Phase 1's verify timestamp is ignored when evaluating Phase 2 | ✅ SATISFIED | work.test.ts:6488 — writes verify_started_at_1, asserts Phase 2 status not 'verify-in-progress' and is 'phase-2-ready-for-verify' |
| A007 | Phase 2 re-verify writes the verify timestamp, not the build timestamp | ✅ SATISFIED | work.test.ts:6724 — asserts saves.verify_started_at_2 exists and saves.build_started_at_2 is undefined |
| A008 | Phase 2 re-verify correctly detects the ready-for-re-verify stage | ✅ SATISFIED | work.test.ts:6590 — FAIL verify + newer build, asserts output contains 'phase-2-ready-for-re-verify' |
| A009 | Old saves files without suffixed keys work for single-spec | ✅ SATISFIED | work.test.ts:6561 — single-spec with unsuffixed saves keys, asserts 'ready-for-re-verify' present, no 'unknown' stage |
| A010 | Old saves files fall back to unsuffixed keys for Phase 1 only | ✅ SATISFIED | work.test.ts:6341 — resolvePhase unit test with unsuffixed keys, asserts phaseNumber=1 and stage='ready-for-re-verify' |
| A011 | Old saves files do not fall back to unsuffixed keys for Phase 2 | ✅ SATISFIED | work.test.ts:6370 — resolvePhase unit test with unsuffixed keys for Phase 2, asserts stage='needs-fixes' (not re-verify) |
| A012 | A phase resolver function is exported from work-state.ts | ✅ SATISFIED | work.test.ts:6176 — asserts typeof resolvePhase === 'function', imported from work-state.js |
| A013 | The phase resolver returns phase number and correct timestamp keys | ✅ SATISFIED | work.test.ts:6181 — asserts result.phaseNumber===2, verifyTimestampKey==='verify_started_at_2', buildTimestampKey==='build_started_at_2', buildAgentKey==='build_agent_2', verifyAgentKey==='verify_agent_2' |
| A014 | Both determineStage and startWork use the phase resolver | ✅ SATISFIED | work-state.ts:583 calls resolvePhase from determineStage; work.ts:1161 calls resolvePhase from worktree-resume startWork; work.ts:1325,1334,1380 call getMainTreeResolution (which calls resolvePhase) from main-tree startWork. Old hasNumberedVerifyReport routing removed from worktree-resume path. Test work.test.ts:6841 verifies worktree writes correct key. |
| A015 | Phase 2 build start writes a phase-specific build timestamp | ✅ SATISFIED | work.test.ts:6686 — asserts saves.build_started_at_2 matches ISO date, saves.build_started_at is undefined |
| A016 | Phase 2 build start writes a phase-specific agent key | ✅ SATISFIED | work.test.ts:6686 — asserts saves.build_agent_2 === 'ana-build' |
| A017 | Phase-scoped keys work for 4-phase workflows | ✅ SATISFIED | work.test.ts:6273 (resolvePhase unit) — asserts phaseNumber=4, stage='ready-for-verify'; work.test.ts:6619 (integration) — asserts output contains 'phase-4-ready-for-verify' |
| A018 | Phase-scoped keys write correctly for arbitrary phase numbers | ✅ SATISFIED | work.test.ts:6801 — 4-phase worktree startWork, asserts saves.verify_started_at_4 exists and verify_agent_4==='ana-verify' |
| A019 | Re-verify works for arbitrary phase numbers | ✅ SATISFIED | work.test.ts:6304 (resolvePhase unit) — phase 4 FAIL with newer build, asserts stage='ready-for-re-verify' and verifyTimestampKey==='verify_started_at_4' |
| A020 | Timing uses per-phase start keys when available | ✅ SATISFIED | proofSummary.test.ts:2487 — build_started_at_1 set 5min after contract, asserts timing.build=45 (25min precise + 20min segment) |
| A021 | Timing falls back to segment timing when per-phase keys are absent | ✅ SATISFIED | proofSummary.test.ts:2508 — no start keys, asserts timing.build=50 (30+20 segment) |
| A022 | Stale per-phase start keys are rejected by sanity validation | ✅ SATISFIED | proofSummary.test.ts:2524 — build_started_at_1 after build-report-1, asserts timing.build=50 (fallback) and >0 |
| A023 | Main-tree and worktree startWork produce the same phase decision | ✅ SATISFIED | work.test.ts:6841 — worktree startWork writes verify_started_at_2. Main-tree path uses resolvePhase via getMainTreeResolution (same resolver). Both paths produce 'verify_started_at_2' as the key. |
| A024 | Defense-in-depth rejects verify timestamp that predates build report | ✅ SATISFIED | work.test.ts:6522 — verify_started_at_2 set before build-report-2.saved_at, asserts output not 'verify-in-progress' and is 'phase-2-ready-for-verify' |
| A025 | Single-spec re-verify writes the verify timestamp, not the build timestamp | ✅ SATISFIED | work.test.ts:6764 — single-spec FAIL, asserts saves.verify_started_at exists and saves.build_started_at is undefined |
| A026 | Single-spec re-verify does not write the build timestamp | ✅ SATISFIED | work.test.ts:6764 — same test, asserts saves.build_started_at is undefined |
| A027 | Duplicate timestamp logic is consolidated into one path | ✅ SATISFIED | work.test.ts:6403 — verifies compareTimestamp exists and works. Source: isTimestampRecent (work-state.ts:340) and checkConcurrencyGuard (work.ts:1751) both call compareTimestamp. |

## Independent Findings

**Predictions resolved:**
1. **Confirmed — A023 test only covers worktree path.** The test titled "main-tree and worktree startWork produce same phase decision" only runs `startWork` from inside the worktree. It doesn't invoke the main-tree path for comparison. The main-tree path IS wired to the same resolver (via `getMainTreeResolution`), but the test doesn't demonstrate this. The contract is satisfied because the resolver is shared, but the test title is misleading.

2. **Not found — concurrency guard uses phase-scoped keys.** The main-tree verify path correctly passes `verifyKey` (phase-scoped) to `checkConcurrencyGuard` (work.ts:1341). The build path doesn't use a concurrency guard (same as before). Good.

3. **Confirmed — `hasNumberedVerifyReport` still in main-tree startWork.** The glob-based variables (`hasNumberedSpec`, `hasNumberedBuildReport`, `hasNumberedVerifyReport`) remain at work.ts:1283-1285. They're used for the outer routing (does a build/verify report exist at all?). Phase-specific routing uses `getMainTreeResolution`. The spec says "remove independent hasNumberedVerifyReport routing" and the routing does use the resolver, but the existence detection still uses globs. This is reasonable — the glob answers "does any verify report exist?" while the resolver answers "which phase?".

4. **Confirmed — dual-meaning null return from resolvePhase.** Returns null for both "single-spec" and "all phases passed." In `determineStage`, null means 'ready-to-merge'. In `startWork` worktree-resume, null means "fall through to single-spec path." Works correctly but is a footgun for future callers.

5. **Not found — computeTiming handles edge cases.** The sanity check `phaseBuildStartedAt >= prevBoundary && phaseBuildStartedAt <= segEnd` correctly rejects timestamps before the contract time for Phase 1.

**Surprise finding:** The existing single-spec re-verify path was writing `build_started_at` instead of `verify_started_at`. This build fixes it (AC15/AC25/AC26). The old behavior meant the concurrency guard checked the wrong key on re-verify re-entry. Clean fix.

## AC Walkthrough

- **AC1:** ✅ PASS — Test at work.test.ts:6430 creates Phase 1 PASS + Phase 2 built + recent verify_started_at_1, verifies output is 'phase-2-ready-for-verify' not 'verify-in-progress'.
- **AC2:** ✅ PASS — Test at work.test.ts:6647 runs Phase 2 verify startWork, asserts saves.verify_started_at_2 and saves.verify_agent_2 present, saves.verify_started_at absent.
- **AC3:** ✅ PASS — Test at work.test.ts:6488 writes verify_started_at_1, asserts Phase 2 not blocked.
- **AC4:** ✅ PASS — Test at work.test.ts:6463 single-spec with recent verify_started_at returns 'verify-in-progress'.
- **AC5:** ✅ PASS — Test at work.test.ts:6724 Phase 2 FAIL re-verify writes verify_started_at_2, not build_started_at_2.
- **AC6:** ✅ PASS — Tests at work.test.ts:6561 (single-spec backward compat) and work.test.ts:6341/6370 (Phase 1 fallback / Phase 2 no fallback).
- **AC7:** ✅ PASS — Tests at proofSummary.test.ts:2487 (per-phase keys used), 2508 (fallback), 2524 (stale rejection). Sanity validated with timestamp before/after boundary checks.
- **AC8:** ✅ PASS — resolvePhase exported (work.test.ts:6176). determineStage calls it (work-state.ts:583). startWork worktree-resume calls it (work.ts:1161). Main-tree startWork calls getMainTreeResolution→resolvePhase (work.ts:1325,1334,1380). Old independent hasNumberedVerifyReport routing removed from worktree-resume path.
- **AC9:** ✅ PASS — Test at work.test.ts:6686 Phase 2 build writes build_started_at_2 and build_agent_2, not generic keys.
- **AC10:** ⚠️ PARTIAL — No direct test that Phase 1's build_started_at blocks or misroutes Phase 2 build. Covered indirectly: resolvePhase returns phase-specific keys so Phase 1's timestamps aren't consulted. The resolver's design prevents this, but no test explicitly demonstrates it.
- **AC11:** ⚠️ PARTIAL — Test at work.test.ts:6841 only covers the worktree path. Main-tree path uses same resolver (confirmed by source inspection at work.ts:1325), but no test runs main-tree startWork for Phase 2 to verify the same key is written. The resolver is shared, so behavior matches, but the test doesn't demonstrate both paths.
- **AC12:** ✅ PASS — resolvePhase reads buildSavedAt/verifySavedAt from savesMetadata (work-state.ts:432-436) for re-verify detection. Defense-in-depth in determineStage reads buildReportSavedAt from savesMetadata (work-state.ts:596-598).
- **AC13:** ✅ PASS — Tests at work.test.ts:6273 (resolvePhase unit: phase 4 ready-for-verify) and work.test.ts:6619 (integration: output contains 'phase-4-ready-for-verify'). startWork test at work.test.ts:6801 writes verify_started_at_4.
- **AC14:** ✅ PASS — Tests at work.test.ts:6304 (resolvePhase: phase 4 FAIL→re-verify) confirms stage='ready-for-re-verify' and verifyTimestampKey='verify_started_at_4', not build key.
- **AC15:** ✅ PASS — Test at work.test.ts:6764 single-spec FAIL re-verify writes verify_started_at (not build_started_at). Also changed at work.test.ts:4225 existing test updated to expect verify key. Test at work.test.ts:4280 force overwrite test updated for verify key.
- **Tests pass:** ✅ PASS — 3129 passed, 0 failed, 2 skipped with `(cd 'packages/cli' && pnpm vitest run)`.
- **No build errors:** ✅ PASS — `pnpm run build` clean (typecheck + tsup).
- **Lint passes:** ✅ PASS — 0 errors, 1 pre-existing warning.

## Blockers

No blockers. All 27 contract assertions satisfied. All ACs pass (2 partial due to incomplete test coverage of main-tree path, but the behavior is correct — verified by source inspection). Tests pass, build clean, lint clean. No regressions.

Checked for: unused exports in new code (compareTimestamp, resolvePhase, PhaseResolution all imported), unused parameters (_buildAgentKey in startBuildPhaseWithKey — prefixed with underscore, acknowledged), error paths that swallow silently (existing pattern for saves JSON parsing, appropriate), external assumptions (resolvePhase is pure — takes pre-gathered data, no filesystem reads).

## Findings

- **Code — Dead conditional in verify agent assignment:** `packages/cli/src/commands/work.ts:1336` — `const verifyAgent = mainTreeResolution ? 'ana-verify' : 'ana-verify'` evaluates to `'ana-verify'` on both branches. Should be simplified to `const verifyAgent = 'ana-verify'` or removed entirely since the value never varies.

- **Code — startBuildPhaseWithKey is an unnecessary wrapper:** `packages/cli/src/commands/work.ts:1502` — This function accepts `_buildAgentKey` (unused, underscore-prefixed) and delegates entirely to `startBuildPhase`. The caller at line 1327 could call `startBuildPhase` directly with the key. Adds one level of indirection with no behavioral difference.

- **Code — Dual-meaning null from resolvePhase:** `packages/cli/src/commands/work-state.ts:373` — Returns null for both "single-spec work" (totalPhases <= 1) and "all phases passed" (loop completes). In determineStage, null means 'ready-to-merge'. In startWork worktree-resume, null means "fall through to single-spec path." Works today because callers handle both cases, but a future caller might misinterpret null. A discriminated return type (e.g., `{ kind: 'single-spec' } | { kind: 'all-passed' }`) would be safer.

- **Code — Redundant filesystem reads in getMainTreeResolution:** `packages/cli/src/commands/work.ts:1487` — Called up to 3 times per main-tree startWork invocation (build, verify, FAIL paths each call it). Each call runs `gatherLocalArtifactState` which reads plan.md, all spec files, all build/verify reports from disk. The caller already has `hasNumberedSpec`, `buildReportExists`, etc. from earlier globs. Could cache the resolution or pass existing data.

- **Test — A023 test title claims main-tree/worktree comparison but only tests worktree:** `packages/cli/tests/commands/work.test.ts:6841` — Titled "main-tree and worktree startWork produce same phase decision for Phase 2 verify" but only invokes startWork from the worktree. The main-tree path's use of resolvePhase is verified by source inspection, not by test execution. The test proves the worktree path is correct; it doesn't prove both paths agree.

- **Code — Inside-worktree resume still writes timestamps without concurrency guard:** `packages/cli/src/commands/work.ts:1167` — The worktree-resume path calls `writeTimestamp` with `force: true` for all entries (build, verify, re-verify) without first checking `checkConcurrencyGuard`. This pre-existed (proof context pipeline-concurrency-guards-C3) and is now phase-aware, but the guard is still absent. Two concurrent agents entering the same phase in the same worktree would overwrite each other's timestamps.

- **Upstream — pipeline-concurrency-guards-C2 resolved:** Both `isTimestampRecent` (work-state.ts:340) and `checkConcurrencyGuard` (work.ts:1751) now delegate to the shared `compareTimestamp` function. The duplication flagged in the previous pipeline cycle is eliminated.

- **Upstream — decompose-work-ts-C4 partially addressed:** The multi-phase loop in `determineStage` was extracted into `resolvePhase`, reducing the function's cognitive complexity. However, `determineStage` remains a large function with significant branching (single-spec path, multi-phase path, worktree checks, defense-in-depth). The extraction helped but didn't fully resolve the finding.

## Deployer Handoff

This is a behavioral fix for a timing bug that affected all multi-phase pipeline work. Phase 1's `verify_started_at` was incorrectly blocking Phase 2 status for up to 1 hour.

**What changed:** Session timestamps are now phase-scoped (`verify_started_at_2` instead of `verify_started_at`). A new `resolvePhase` function centralizes multi-phase routing. Single-spec behavior is unchanged. Backward compatibility: old `.saves.json` files without suffixed keys continue to work for single-spec and Phase 1 fallback.

**Also fixed:** Single-spec re-verify was writing `build_started_at` instead of `verify_started_at`. Now correctly writes the verify key, matching the semantic meaning (re-verify is a verify session, not a build session).

**Risk:** Low. The phase resolver is a pure function tested with 30 new tests. All existing tests pass. The defense-in-depth timestamp validation adds safety against stale/poisoned timestamps without changing the happy path.

**After merge:** No migration needed. New phase-scoped keys are written alongside any existing unsuffixed keys. Old `.saves.json` files degrade gracefully.

## Verdict
**Shippable:** YES

All 27 contract assertions satisfied. 30 new tests covering phase resolver, phase-scoped keys, timing, backward compatibility, and arbitrary N phases. The core disease — Phase 1's verify timestamp poisoning Phase 2's status — is definitively fixed. Two AC items are partial (AC10, AC11) due to test coverage gaps on the main-tree path, but the behavior is correct by construction (shared resolver) and confirmed by source inspection. The findings are minor: dead conditional, unnecessary wrapper function, dual-meaning null return. None are blockers.
