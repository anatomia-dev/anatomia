# Verify Report: Fix False Rejection Archives on Same-Session Re-Saves

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-false-rejection-archive/spec.md
**Branch:** feature/fix-false-rejection-archive

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/fix-false-rejection-archive/.ana/plans/active/fix-false-rejection-archive/contract.yaml
  Seal: INTACT (hash sha256:e33b83a2e87290f7aadf5bfcfb2e910b51d984bb4b74fee8eb8f6195a881ccfd)
```

Seal: **INTACT**

Tests: 2872 passed, 0 failed, 2 skipped (baseline 2856 — +16 new tests). Build: ✅ success. Lint: ✅ 0 errors (1 pre-existing warning in git-operations.ts).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Re-saving a verify report without a new build does not create archive files | ✅ SATISFIED | `artifact.test.ts:3632` — tagged `@ana A001`, sets verify-report newer than build-report, re-saves, asserts `archiveFiles.length` equals 0 |
| A002 | Re-saving a verify report without a new build does not archive companion data | ✅ SATISFIED | `artifact.test.ts:3660` — tagged `@ana A002`, same no-advancement setup, asserts `companionArchiveFiles.length` equals 0 |
| A003 | Re-saving a verify report without a new build does not add a history entry | ✅ SATISFIED | `artifact.test.ts:3686` — tagged `@ana A003`, asserts `saves['verify-report'].history` is undefined after gated re-save |
| A004 | Re-saving a build report without a new verification does not create archive files | ✅ SATISFIED | `artifact.test.ts:3711` — tagged `@ana A004`, build-report newer than verify-report, asserts `archiveFiles.length` equals 0 |
| A005 | Re-saving a build report without a new verification does not add a history entry | ✅ SATISFIED | `artifact.test.ts:3737` — tagged `@ana A005`, asserts `saves['build-report'].history` is undefined |
| A006 | A real rejection cycle still creates archive files | ✅ SATISFIED | `artifact.test.ts:3762` — tagged `@ana A006`, opposing stage advanced, asserts `archiveFiles.length > 0` |
| A007 | A real rejection cycle still records history in the saves file | ✅ SATISFIED | `artifact.test.ts:3784` — tagged `@ana A007`, opposing stage advanced, asserts `history.length > 0` |
| A008 | Phase-numbered verify report checks the matching phase build report | ✅ SATISFIED | `artifact.test.ts:3805` — tagged `@ana A008`, calls `deriveOpposingReportKey('verify-report-2')`, asserts equals `'build-report-2'` |
| A009 | Phase-numbered build report checks the matching phase verify report | ✅ SATISFIED | `artifact.test.ts:3811` — tagged `@ana A009`, calls `deriveOpposingReportKey('build-report-3')`, asserts equals `'verify-report-3'` |
| A010 | Timing uses verify report content to detect rejection cycles | ✅ SATISFIED | `proofSummary.test.ts:4522` — tagged `@ana A010`, no history arrays but verify report has rejection content, asserts `timing.build` equals 60 |
| A011 | History arrays without rejection content use the simple timing path | ✅ SATISFIED | `proofSummary.test.ts:4561` — tagged `@ana A011`, history arrays present but verify report has no rejection section, asserts `timing.build` equals 70 (fallback path confirmed by different value from rejection path's 60) |
| A012 | Missing verify report file falls back to simple timing | ✅ SATISFIED | `proofSummary.test.ts:4600` — tagged `@ana A012`, no verify report file on disk, asserts `timing.build` is defined. Contract matcher is `exists`, assertion aligns |
| A013 | Companion data files are not archived when the parent report gate blocks | ✅ SATISFIED | `artifact.test.ts:3817` — tagged `@ana A013`, no opposing advancement, asserts `companionArchiveFiles.length` equals 0 |
| A014 | First-time saves work without archive or history | ✅ SATISFIED | `artifact.test.ts:3843` — tagged `@ana A014`, first save with no committed version, asserts `archiveFiles.length` equals 0 and no throw |
| A015 | First-time saves do not crash when saves file is missing | ✅ SATISFIED | `artifact.test.ts:3859` — tagged `@ana A015`, no `.saves.json`, asserts `saveSucceeded` is truthy |
| A016 | Existing archive tests still pass after adding the gate | ✅ SATISFIED | `artifact.test.ts:3330` — tagged `@ana A016`, existing test updated with `writeOpposingSaves` to satisfy gate, asserts archive exists (truthy) |
| A017 | Round number incrementing still works | ✅ SATISFIED | `artifact.test.ts:3431` — tagged `@ana A017`, two rounds of opposing-stage advancement, asserts `archiveCount` equals 2 |
| A018 | Content-based detection works for multi-phase verify reports | ✅ SATISFIED | `proofSummary.test.ts:4623` — tagged `@ana A018`, numbered verify report with rejection content, asserts `timing.build` is defined. Contract matcher is `exists`, assertion aligns |

## Independent Findings

**Gate architecture is sound.** The three-layer defense works as designed: (1) `hasOpposingStageAdvanced` gates archiving, (2) `writeSaveMetadata` gates history, (3) `computeTiming` uses content-based rejection detection. The ordering invariant (archive before metadata write) is preserved — archive at line 1340, metadata at line 1579 in `saveArtifact`; archive at line 1896, metadata at line 1994 in `saveAllArtifacts`.

**Both save paths mirror correctly.** `saveArtifact` and `saveAllArtifacts` both apply the gate at all four call sites (report archive, companion archive, report metadata, companion metadata). The spec's constraint about mirroring is satisfied.

**No over-building detected.** The implementation adds exactly what the spec requires: `deriveOpposingReportKey`, `hasOpposingStageAdvanced`, gating at call sites, `writeSaveMetadata` optional parameter, and `computeTiming` content-based detection. No extra parameters, no unused code paths, no speculative features.

**Prediction resolution:** All five predictions investigated; none confirmed. The builder handled companion key derivation, edge cases, and test fixtures correctly. The surprise finding was the no-op gate on companion metadata (see Findings).

## AC Walkthrough

- **AC1:** Same-session re-save of verify-report does NOT create `_r` archive files — ✅ PASS — test A001 at `artifact.test.ts:3632` verifies, passes
- **AC2:** Same-session re-save does NOT create history entry — ✅ PASS — test A003 at `artifact.test.ts:3686` verifies, passes
- **AC3:** Same criteria for build-report — ✅ PASS — tests A004 (`artifact.test.ts:3711`) and A005 (`artifact.test.ts:3737`) verify both archive and history gating for build-report
- **AC4:** Genuine rejection cycles preserved — ✅ PASS — tests A006 (`artifact.test.ts:3762`) and A007 (`artifact.test.ts:3784`) verify archiving and history proceed when opposing stage advanced
- **AC5:** Multi-phase phase-aware opposing key — ✅ PASS — tests A008 (`artifact.test.ts:3805`) and A009 (`artifact.test.ts:3811`) verify `verify-report-2` → `build-report-2` and `build-report-3` → `verify-report-3`
- **AC6:** `computeTiming` uses content-based detection — ✅ PASS — `hasRejectionHistory` replaced with `hasRejectionContent` at `proofSummary.ts:1707-1738`. Tests A010 (content triggers rejection path), A011 (false history doesn't trigger), A012 (missing file falls back) confirm
- **AC7:** Companion gating follows parent — ✅ PASS — test A013 at `artifact.test.ts:3817` verifies companion not archived when parent gate blocks. Code at `artifact.ts:1510-1516` and `artifact.ts:1907-1911` applies gate to companions
- **AC8:** First-time saves unaffected — ✅ PASS — tests A014 (`artifact.test.ts:3843`) and A015 (`artifact.test.ts:3859`) verify no crash and no archiving on first save
- **Tests pass:** ✅ PASS — 2872 passed, 0 failed, 2 skipped (full suite via `pnpm run test -- --run`)
- **No build errors:** ✅ PASS — `pnpm run build` succeeds
- **No lint errors:** ✅ PASS — 0 errors, 1 pre-existing warning

## Blockers

No blockers. All 18 contract assertions satisfied. All 11 acceptance criteria pass. No regressions (baseline 2856 → 2872, +16 new tests). Checked for: unused exports in new code (`deriveOpposingReportKey` and `hasOpposingStageAdvanced` exported — former used in test import, latter used only internally but exported for consistency with `deriveCompanionKey` pattern), unused parameters in new functions (none found), unhandled error paths (`hasOpposingStageAdvanced` catches JSON parse errors and returns false, `hasRejectionContent` wraps all file reads in try/catch), assumptions about external state (`.saves.json` absence handled gracefully throughout).

## Findings

- **Code — writeSaveMetadata companion gate is a no-op:** `packages/cli/src/commands/artifact.ts:2008` — In `saveAllArtifacts`, companion metadata writes always pass `gateOnStageTransition`, but `writeSaveMetadata` checks `isArchivableType` first (`/^(verify-report|build-report)(-\d+)?$/`), which doesn't match `verify-data`/`build-data` keys. The gate option is passed but never evaluated — the code falls through to `return true` (always preserve history for non-archivable types). Harmless because companion data entries don't drive timing logic, but it's unnecessary work and potentially confusing for the next reader.

- **Code — hasOpposingStageAdvanced reads .saves.json per call:** `packages/cli/src/commands/artifact.ts:1195` — Each `hasOpposingStageAdvanced` call opens and parses `.saves.json` independently. In `saveArtifact`, this happens up to 4 times per save (report archive, companion archive, report metadata, companion metadata). The file is small and saves are infrequent, so no performance concern, but a cached read pattern (read once, pass data) would be cleaner. Not worth addressing now — the current approach is correct, just not optimal.

- **Code — hasOpposingStageAdvanced exported without external consumers:** `packages/cli/src/commands/artifact.ts:1188` — Exported but only called within artifact.ts itself. Not imported in tests or other modules. Follows the precedent of `deriveCompanionKey` being exported, but `deriveOpposingReportKey` is the one actually tested externally. This widens public API surface marginally.

- **Upstream — proofSummary.ts continues growing:** This change adds ~32 lines (net) to a file already at ~2330 lines. Now ~2370 lines. Known from prior cycles (audit-matrix-orientation-C7). The content-based detection adds a necessary IIFE but doesn't move the needle on the decomposition need.

- **Test — A012 and A018 use toBeDefined() for fallback path:** `packages/cli/tests/utils/proofSummary.test.ts:4620,4661` — Contract matcher is `exists`, so these are contract-aligned. However, the fallback timing value is deterministic (70 minutes for A012's fixture) and could be asserted specifically. A011's test proves the distinction between paths with `toBe(70)` vs `toBe(60)`, so the coverage gap is small. Acceptable as-is.

## Deployer Handoff

This is a correctness fix with no user-facing behavior changes. The fix suppresses false `_r` archive files and false `.saves.json` history entries that were created when re-saving artifacts in the same session without a genuine rejection cycle.

**What to watch after merge:**
- On next pipeline run, verify that genuine rejection cycles still produce `_r` archives and history entries. The gate should only block same-session corrections.
- The `computeTiming` change means timing reconstruction now depends on verify report file content (presence of "Previous Findings Resolution" section) rather than `.saves.json` history arrays. Old pipeline runs with real rejection cycles should still have verify reports on disk — if they were deleted, timing would silently fall back to endpoint subtraction. This is the correct degradation behavior.
- No migration needed. The gate is purely additive — existing `.saves.json` files with false history entries are harmless; they just won't trigger rejection timing anymore if the verify report doesn't contain rejection content.

## Verdict

**Shippable:** YES

All 18 contract assertions satisfied. All 11 acceptance criteria pass. 2872 tests pass with no regressions. The three-layer defense (archive gate, history gate, content-based timing) is correctly implemented across both save paths. The five findings are all observation/debt-level — no correctness issues, no edge cases missed, no over-building. The implementation matches the spec precisely.
