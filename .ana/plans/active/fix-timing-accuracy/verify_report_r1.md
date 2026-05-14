# Verify Report: Fix pipeline timing accuracy for multi-phase and rejection cycles

**Result:** FAIL
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

Tests: 2191 passed, 1 failed, 2 skipped. Build: pass. Lint: pass (1 pre-existing warning).

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Overwriting an artifact with new content preserves the previous timestamp and hash | ❌ UNSATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3725` — tagged test fails: line 3743 asserts `saved_at` changed between writes, but sub-millisecond execution produces identical timestamps. History IS preserved (lines 3740-3742 pass), but the test as written does not pass. |
| A002 | History entries include both the timestamp and the content hash | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3741-3742` — asserts `history[0].saved_at` and `history[0].hash` match first-write values |
| A003 | Multiple overwrites accumulate history in chronological order | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3747` — writes 3 versions, asserts `history.length === 2` and chronological ordering via `h0Time <= h1Time` |
| A004 | Re-saving identical content does not create a history entry | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3764` — saves same content twice, asserts `result === false` and `history` is undefined |
| A005 | SaveMetadata type in artifact.ts accepts a history array | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3776` — writes two versions, verifies resulting JSON has `history` property. Type check confirmed at `packages/cli/src/commands/artifact.ts:34` |
| A006 | SaveEntry type in proofSummary.ts accepts a history array | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3804` — constructs saves with history, calls `generateProofSummary`, parses without error. Type at `packages/cli/src/utils/proofSummary.ts:96` |
| A007 | Two-phase builds report accurate build time by summing per-phase segments | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3823` — 2-phase pipeline, asserts `timing.build === 45` (30+15) |
| A008 | Two-phase builds report accurate verify time by summing per-phase segments | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3843` — asserts `timing.verify === 22` (8+14) |
| A009 | Three-phase builds sum all phase segments correctly | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3847` — 3-phase pipeline, asserts `timing.build === 45` (20+15+10) |
| A010 | Three-phase verify time sums all phase segments correctly | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3867` — asserts `timing.verify === 20` (5+8+7) |
| A011 | Multi-phase total time still spans the full pipeline duration | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3844` — asserts `timing.total_minutes === 97` for 2-phase pipeline |
| A012 | Rejection cycles produce accurate build time when history is available | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3871` — rejection cycle with 1 history entry, asserts `timing.build === 60` (30+30) |
| A013 | Rejection cycles produce accurate verify time when history is available | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3895` — asserts `timing.verify === 20` (10+10) |
| A014 | Old proofs without history or numbered keys compute identical timing | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3898` — old-format saves, asserts `timing.build === 60` |
| A015 | Old proofs verify time unchanged by new computation path | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3911` — asserts `timing.verify === 30` |
| A016 | Timing output shape has exactly the same fields as before | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3914` — asserts `total_minutes`, `think`, `plan`, `build`, `verify` all present and numeric |
| A017 | Companion data keys are not included in timing computation | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3935` — adds `build-data-1` and `verify-data-1` keys, asserts timing unchanged (build=30, verify=10) |
| A018 | A stale segment exceeding 24 hours is excluded from the phase total | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3956` — phase 2 build >48h, asserts `timing.build === 30` (only phase 1 counted) |
| A019 | MAX_PHASE_MS is declared once at the top of computeTiming | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3978` — reads source, counts `const MAX_PHASE_MS` declarations in `computeTiming`, asserts 1 |

## Independent Findings

### Prediction Resolution
1. **Confirmed: timestamp race in history test.** Two synchronous `writeSaveMetadata` calls execute within the same millisecond, producing identical `saved_at`. The test at line 3743 asserts they differ — it fails. The implementation correctly preserves history, but the test's non-contractual assertion is flawed.
2. **Not found: edge case with mixed history presence.** The rejection code handles missing timestamps gracefully via `segStart !== undefined && segStart !== null` checks. Verified at lines 1686 and 1698.
3. **Confirmed: MAX_PHASE_MS consolidated.** Single declaration at line 1503, references throughout. Clean.
4. **Not found: regex matching unexpected keys.** `getNumberedPhases` uses `^build-report-(\\d+)$` — anchored regex, won't match `build-data-1`. Verified by reading the regex at line 1552.
5. **Not found: phase enumeration sorting issue.** `getNumberedPhases` parses `parseInt(match[1], 10)` and sorts numerically at line 1559. Correct.

**Production risks:**
- **Not found: NaN from partial migration.** All timestamp reads go through `getTime` which returns `null` for missing/invalid entries. Segment math guards with `if (segStart !== null && segEnd !== null)`. Safe.
- **Found: unbounded history growth.** Through many rejection cycles, the history array grows without limit. Not a blocker — practically limited by pipeline fatigue (humans stop after ~3-4 cycles) — but worth noting.

### Over-Building Check
- `writeSaveMetadata` changed from `function` to `export function`. The export is used only in tests. Not over-building per se — this is a testability concession — but it widens the module's public API for something the spec didn't request.
- No unused exports or dead code paths found. All new code paths (multi-phase, rejection, fallback) have corresponding test coverage.

## AC Walkthrough
- [x] AC1: `writeSaveMetadata()` preserves the previous `{ saved_at, hash }` in a `history` array when overwriting — ❌ FAIL — The logic is correct (lines 71-86 of artifact.ts), but the tagged test fails due to timestamp race at line 3743. Contract assertion A001 is UNSATISFIED because the test does not pass.
- [x] AC2: `SaveEntry` type includes optional `history` field in both files — ✅ PASS — `artifact.ts:34` and `proofSummary.ts:96` both have `history?: Array<{ saved_at: string; hash: string }>`.
- [x] AC3: `computeTiming()` produces accurate multi-phase splits — ✅ PASS — 2-phase test (line 3823) and 3-phase test (line 3847) both pass with exact values.
- [x] AC4: `computeTiming()` produces accurate rejection cycle splits — ✅ PASS — Rejection test (line 3871) passes, asserting build=60 and verify=20.
- [x] AC5: Backward compatibility — ✅ PASS — Old-format test (line 3898) passes with build=60, verify=30. Existing timing tests all pass.
- [x] AC6: Existing tests pass, new tests cover scenarios — ❌ FAIL — 1 test failure (`preserves history when overwriting with different content`). 2191 pass, 1 fail.
- [x] AC7: Timing schema unchanged — ✅ PASS — Schema test (line 3914) passes. Output shape is `{ total_minutes, think, plan, build, verify }`.
- [x] AC8: No build errors — ✅ PASS — `pnpm run build` succeeds.
- [x] AC9: Idempotent re-save does NOT create history — ✅ PASS — Test (line 3764) passes: same content returns false, no history.

## Blockers
1. **Test failure in `preserves history when overwriting with different content`** (`packages/cli/tests/utils/proofSummary.test.ts:3743`). Line 3743 asserts `saved_at` differs between two synchronous writes, but both complete within the same millisecond. The implementation is correct — the fix is to remove or rewrite the timestamp-inequality assertion (e.g., assert the hash changed instead, or add a `vi.useFakeTimers()` to force distinct timestamps). This is the only thing preventing PASS.

## Findings
- **Test — Timestamp race in history preservation test:** `packages/cli/tests/utils/proofSummary.test.ts:3743` — Two synchronous `writeSaveMetadata` calls produce identical `saved_at` when they execute within the same millisecond. The test asserts the new timestamp differs from the old one, which is a non-deterministic assertion. The hash assertion on line 3744 would suffice to prove the entry was overwritten. Fix: use `vi.useFakeTimers()` to control timestamps, or remove the `saved_at` inequality assertion and rely on the hash inequality + history presence.
- **Code — Non-null assertion on missing verify phase:** `packages/cli/src/utils/proofSummary.ts:1627` — `verifyPhases[i - 1]!.key` crashes if `verify-report-(N-1)` doesn't exist when `build-report-N` does. The pipeline enforces ordering so this doesn't happen in practice, but the `!` assertion is unsafe. A null check with fallback to `contractTime` would be defensive.
- **Code — writeSaveMetadata export scope widened for tests:** `packages/cli/src/commands/artifact.ts:46` — Changed from internal `function` to `export function`. Only consumed by test files. This widens the module's public API — a minor testability tradeoff, not a design issue.
- **Code — Unbounded history array growth:** `packages/cli/src/commands/artifact.ts:74` — Each rejection cycle appends to history with no cap. Practically limited (humans stop after ~3-4 cycles), but theoretically unbounded. Not a concern today; worth monitoring if automated retry loops are added.
- **Upstream — proofSummary.ts continuing to grow:** File is now ~1740 lines (was ~1550 at last cycle, known issue from prior proof context). This build adds ~190 lines. The segment computation is well-contained within `computeTiming`, but the file continues past the comfort threshold.

## Deployer Handoff
- The test failure at line 3743 is the single blocker. The implementation logic is correct — only the test assertion is flawed. Once the test is fixed, all 19 contract assertions should be SATISFIED.
- The `writeSaveMetadata` export is new but harmless. No runtime behavior change for existing consumers.
- The `history` field is additive — old `.saves.json` files without it parse and compute identically (verified by backward-compat test).
- No schema change to proof chain output. Downstream consumers (`work complete`, `proof health`, `proof chain display`) are unaffected.

## Verdict
**Shippable:** NO
One test fails: the timestamp-inequality assertion in the A001 test. The implementation is sound — the history preservation logic works correctly — but the test is flawed due to a sub-millisecond timing race. Fix the test, and this ships.