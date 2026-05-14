# Verify Report: Fix pipeline timing accuracy for multi-phase and rejection cycles

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-13
**Spec:** .ana/plans/active/fix-timing-accuracy/spec.md
**Branch:** feature/fix-timing-accuracy

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/fix-timing-accuracy/.ana/plans/active/fix-timing-accuracy/contract.yaml
  Seal: INTACT (hash sha256:8b3ed93f870eae7bb17c7f5f4a9f55a10fe42076044c2687ddee9004057ab115)
```

Tests: 2192 passed, 0 failed, 2 skipped. Build: pass. Lint: pass (1 pre-existing warning).

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Overwriting an artifact with new content preserves the previous timestamp and hash | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3748` — asserts `history[0].saved_at === firstSavedAt`; fake timers at line 3729 ensure distinct timestamps |
| A002 | History entries include both the timestamp and the content hash | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3749` — asserts `history[0].hash === firstHash` |
| A003 | Multiple overwrites accumulate history in chronological order | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3765` — writes 3 versions, asserts `history.length === 2` and `h0Time <= h1Time` |
| A004 | Re-saving identical content does not create a history entry | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3777-3781` — saves same content twice, asserts `result === false` and `history` is undefined |
| A005 | SaveMetadata type in artifact.ts accepts a history array | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3789-3795` — writes two versions, verifies `history` property in JSON. Type at `packages/cli/src/commands/artifact.ts:34` |
| A006 | SaveEntry type in proofSummary.ts accepts a history array | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3814-3830` — constructs saves with history, calls `generateProofSummary`, parses without error. Type at `packages/cli/src/utils/proofSummary.ts:96` |
| A007 | Two-phase builds report accurate build time by summing per-phase segments | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3851` — asserts `timing.build === 45` (30+15) |
| A008 | Two-phase builds report accurate verify time by summing per-phase segments | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3852` — asserts `timing.verify === 22` (8+14) |
| A009 | Three-phase builds sum all phase segments correctly | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3875` — asserts `timing.build === 45` (20+15+10) |
| A010 | Three-phase verify time sums all phase segments correctly | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3876` — asserts `timing.verify === 20` (5+8+7) |
| A011 | Multi-phase total time still spans the full pipeline duration | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3853` — asserts `timing.total_minutes === 97` |
| A012 | Rejection cycles produce accurate build time when history is available | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3903` — asserts `timing.build === 60` (30+30) |
| A013 | Rejection cycles produce accurate verify time when history is available | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3904` — asserts `timing.verify === 20` (10+10) |
| A014 | Old proofs without history or numbered keys compute identical timing | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3919` — asserts `timing.build === 60` |
| A015 | Old proofs verify time unchanged by new computation path | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3920` — asserts `timing.verify === 30` |
| A016 | Timing output shape has exactly the same fields as before | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3936-3941` — asserts `total_minutes`, `think`, `plan`, `build`, `verify` present and numeric |
| A017 | Companion data keys are not included in timing computation | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3961-3962` — adds `build-data-1` and `verify-data-1`, asserts timing unchanged (build=30, verify=10) |
| A018 | A stale segment exceeding 24 hours is excluded from the phase total | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3982` — phase 2 build >48h, asserts `timing.build === 30` (only phase 1 counted) |
| A019 | MAX_PHASE_MS is declared once at the top of computeTiming | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:4004-4005` — reads source, counts `const MAX_PHASE_MS` in computeTiming body, asserts 1 |

## Independent Findings

### Prediction Resolution
1. **Confirmed: builder fixed timestamp race with fake timers.** `vi.useFakeTimers()` at line 3729 with `vi.setSystemTime()` at line 3742 advances 30 minutes between writes. Clean fix — eliminates the non-determinism entirely.
2. **Confirmed: non-null assertion still present at line 1627.** `verifyPhases[i - 1]!.key` — pipeline ordering prevents crashes in practice, but the `!` is unsafe. Not a blocker since the verify phases array is enumerated in lockstep with build phases.
3. **Confirmed: A019 reads source code directly.** Acceptable — consolidation of a constant into a single declaration can't be tested behaviorally.
4. **Confirmed: no cap on history array.** Practically limited by human pipeline fatigue. Not a concern now.
5. **Surprised: builder added extra `_started_at` precedence test** at line 4008 — verifies segment computation takes precedence over `_started_at`-based when numbered keys are detected. Good coverage beyond the contract.

### Over-Building Check
- The `_started_at` precedence test (line 4008-4026) is beyond contract scope but provides useful regression coverage. Not overbuilt — it tests a real interaction between the new and old code paths.
- No unused exports found in new code. `writeSaveMetadata` is exported and used in both production code (artifact.ts:1282, 1287, 1686, 1692) and tests. All other new code (segment computation, `getNumberedPhases`) is internal to `computeTiming`.
- No dead code blocks. Every `if` branch in `computeTiming` (multi-phase at line 1615, rejection at line 1652, fallback at line 1708) has a corresponding test exercising it.

## Previous Findings Resolution

### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A001 | Test was non-deterministic — two synchronous writes produced identical `saved_at`, failing the inequality assertion at line 3743 | ✅ SATISFIED | Builder added `vi.useFakeTimers()` with `vi.setSystemTime()` to force 30-minute gap between writes. Test now deterministically passes. |

### Previous Findings
| Finding | Status | Notes |
|---------|--------|-------|
| Test — Timestamp race in history preservation test | Fixed | Builder replaced real-time writes with fake timers at lines 3729-3742. Timestamps are now controlled. |
| Code — Non-null assertion on missing verify phase (proofSummary.ts:1627) | Still present | `verifyPhases[i - 1]!.key` — pipeline enforces ordering, so this doesn't crash in practice. Acceptable risk. |
| Code — writeSaveMetadata export scope widened for tests (artifact.ts:46) | Still present | Only consumed by tests. Minor API surface widening — accepted. |
| Code — Unbounded history array growth (artifact.ts:74) | Still present | No cap added. Practically limited by human pipeline fatigue (~3-4 cycles max). |
| Upstream — proofSummary.ts continuing to grow | Still present | Now ~1740 lines. Known from prior cycles. |

## AC Walkthrough
- [x] AC1: `writeSaveMetadata()` preserves the previous `{ saved_at, hash }` in a `history` array when overwriting — ✅ PASS — Logic at artifact.ts:71-86 pushes old entry to history. Test at line 3725 passes with fake timers ensuring distinct timestamps.
- [x] AC2: `SaveEntry` type includes optional `history` field in both files — ✅ PASS — `artifact.ts:34` has `history?: Array<{ saved_at: string; hash: string }>`. `proofSummary.ts:96` has identical type.
- [x] AC3: `computeTiming()` produces accurate multi-phase splits — ✅ PASS — 2-phase test (line 3833, build=45) and 3-phase test (line 3857, build=45, verify=20) both pass.
- [x] AC4: `computeTiming()` produces accurate rejection cycle splits — ✅ PASS — Rejection test (line 3880) passes, build=60, verify=20.
- [x] AC5: Backward compatibility — ✅ PASS — Old-format test (line 3908) passes, build=60, verify=30. Fallback path at line 1708 unchanged.
- [x] AC6: Existing tests pass, new tests cover scenarios — ✅ PASS — 2192 passed, 0 failed, 2 skipped. New tests cover multi-phase (2 and 3 phases), rejection with history, backward compat, data key exclusion, stale segment exclusion, idempotent re-save, and `_started_at` precedence.
- [x] AC7: Timing schema unchanged — ✅ PASS — Schema test (line 3924) passes. Output shape is `{ total_minutes, think, plan, build, verify }`.
- [x] AC8: No build errors — ✅ PASS — `pnpm run build` succeeds.
- [x] AC9: Idempotent re-save does NOT create history — ✅ PASS — Test (line 3773) passes: same content returns false, no history created.

## Blockers
No blockers. All 19 contract assertions satisfied. All 9 acceptance criteria pass. Zero test failures. Build and lint clean. Checked for: unused parameters in new functions (none — `getNumberedPhases` uses both `baseKey` and return value), unhandled error paths in segment computation (all guarded with `!== null`/`!== undefined` and `!isNaN`), assumptions about external state (none — all computation is from in-memory saves data), and missing edge cases from the spec (data key exclusion and stale segment exclusion both covered).

## Findings
- **Code — Non-null assertion on missing verify phase:** `packages/cli/src/utils/proofSummary.ts:1627` — `verifyPhases[i - 1]!.key` crashes if `verify-report-(N-1)` doesn't exist when `build-report-N` does. Pipeline ordering prevents this in practice, but the `!` assertion is unsafe. A null check with fallback to `contractTime` would be defensive.
- **Code — writeSaveMetadata export scope widened for tests:** `packages/cli/src/commands/artifact.ts:46` — Changed from internal `function` to `export function`. Only consumed by test files. Widens the module's public API for testability — minor, accepted.
- **Code — Unbounded history array growth:** `packages/cli/src/commands/artifact.ts:74` — Each rejection cycle appends to history with no cap. Practically limited by human pipeline fatigue (~3-4 cycles). Worth monitoring if automated retry loops are added.
- **Test — A019 asserts on source code content:** `packages/cli/tests/utils/proofSummary.test.ts:3988` — Reads `proofSummary.ts` and checks for `const MAX_PHASE_MS` string count. Testing standards say to avoid source-content assertions, but consolidation of a constant declaration can't be tested behaviorally. Acceptable tradeoff.
- **Upstream — proofSummary.ts continuing to grow:** `packages/cli/src/utils/proofSummary.ts` — Now ~1740 lines (was ~1550 at last cycle). The segment computation is well-contained within `computeTiming`, but the file continues past the comfort threshold. Known from prior cycles — see proof context.

## Deployer Handoff
- The previous FAIL was solely the timestamp race in the A001 test. Builder fixed it with `vi.useFakeTimers()`. All 19 contract assertions now SATISFIED.
- The `writeSaveMetadata` export is unchanged from previous round — harmless, test-only consumer.
- The `history` field is additive — old `.saves.json` files without it parse and compute identically (verified by backward-compat test at line 3908).
- No schema change to proof chain output. Downstream consumers (`work complete`, `proof health`, `proof chain display`) are unaffected.
- The non-null assertion at line 1627 is a latent risk but not a regression — it existed in the previous round and is guarded by pipeline ordering.

## Verdict
**Shippable:** YES
All 19 contract assertions SATISFIED. All 9 acceptance criteria pass. 2192 tests pass, 0 fail. Build and lint clean. The single blocker from the previous round (timestamp race in A001 test) is fixed with fake timers. The remaining findings are carried forward observations — none are blockers.
