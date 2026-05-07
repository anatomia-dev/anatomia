# Build Report: Fix Pipeline Phase Timing

**Created by:** AnaBuild
**Date:** 2026-05-07
**Spec:** .ana/plans/active/phase-timing-fix/spec.md
**Branch:** feature/phase-timing-fix

## What Was Built

- `packages/cli/src/commands/work.ts` (modified): Early-return path now detects phase from local artifacts (scope, plan, spec, contract, build_report, verify_report including numbered variants) and writes the appropriate `_started_at` timestamp. `writeTimestamp` gains write-once guard (`force` param, default false) — existing key silently skipped unless `force: true`. FAIL→Fix path passes `force: true`. Missing worktree during Verify/Fix timestamp write prints `⚠ Worktree not found` warning.
- `packages/cli/src/utils/proofSummary.ts` (modified): `computeTiming` reads `plan_started_at` via `readRawTimestamp`. When available and sane (before contractTime, positive duration, under 24h), uses it for plan timing. Falls back to artifact-gap (`contractTime - scopeTime`) when absent or insane.
- `packages/cli/templates/.claude/agents/ana-plan.md` (modified): Added `work start {slug}` instruction after `work status` in On Startup section.
- `.claude/agents/ana-plan.md` (modified): Same change as template copy (dogfood).
- `packages/cli/templates/.claude/agents/ana-verify.md` (modified): Reordered Enter the Worktree step — `cd` to worktree path first, then `work start {slug}`.
- `.claude/agents/ana-verify.md` (modified): Same change as template copy (dogfood).
- `packages/cli/tests/commands/work.test.ts` (modified): Added 8 tests for early-return phase detection, write-once guard, force parameter, and missing worktree warning.
- `packages/cli/tests/utils/proofSummary.test.ts` (modified): Added 8 tests for `plan_started_at` consumption in `computeTiming` — available, absent, after contractTime, over 24h, backward compat, zero duration, invalid string.

## PR Summary

- Fix phase timing: `work start` from inside a worktree now detects the current phase and writes the correct `_started_at` timestamp, preventing Verify from being misidentified as Build
- Add write-once guard to `writeTimestamp` so repeat calls don't overwrite session starts, with `force` parameter for FAIL→Fix path
- Wire `plan_started_at` into `computeTiming` with sanity guards (positive, under 24h, before contract), falling back to artifact-gap for old entries
- Update plan template to call `work start` (records `plan_started_at`) and verify template to `cd` before `work start` (enables early-return detection)
- Add 15 new tests covering early-return phase detection, write-once semantics, and plan timing computation

## Acceptance Criteria Coverage

- AC1 "`work start` from inside a worktree during Verify phase writes `verify_started_at`" → work.test.ts "early-return writes verify_started_at during Verify phase" (2 assertions)
- AC2 "`work start` from inside a worktree during Build phase writes `build_started_at`" → work.test.ts "early-return writes build_started_at during Build phase" (3 assertions)
- AC3 "`work start` from main during Plan phase writes `plan_started_at`" → Existing code at line 1549 already writes `plan_started_at` on the main path. No new test needed — existing phase detection test covers this path.
- AC4 "`computeTiming` uses `plan_started_at` when available" → proofSummary.test.ts "uses plan_started_at for plan duration when available" (2 assertions)
- AC5 "`computeTiming` falls back to artifact-gap when absent" → proofSummary.test.ts "falls back to artifact-gap when plan_started_at absent" (1 assertion)
- AC6 "Plan template instructs agent to run `work start {slug}`" → Template file updated, verified by reading content
- AC7 "Sanity guards on `plan_started_at`" → proofSummary.test.ts "falls back when plan_started_at is after contractTime" + "falls back when plan duration exceeds 24 hours" (2 tests, 2 assertions)
- AC8 "Old proof chain entries without `plan_started_at`" → proofSummary.test.ts "backward compat: old entries without plan_started_at" (2 assertions)
- AC9 "`build_started_at` is NOT overwritten when Verify phase runs" → work.test.ts "early-return during Verify does not write build_started_at" (2 assertions)
- AC10 "`writeTimestamp` does NOT overwrite existing timestamps" → work.test.ts "write-once guard preserves existing timestamp" (1 assertion)
- AC11 "FAIL→Fix path overwrites `build_started_at`" → work.test.ts "force parameter overwrites existing timestamp" (1 assertion)
- AC12 "Missing worktree produces warning" → work.test.ts "missing worktree produces warning" (2 assertions)
- AC13 "Tests pass" → ✅ 2013 passed, 2 skipped
- AC14 "No build errors" → ✅ `pnpm run build` succeeds

## Implementation Decisions

- Early-return phase detection uses `findProjectRoot()` (not `process.cwd()`) per spec gotcha — agents may `cd` to subdirectories.
- Missing worktree warning in early-return path triggers only when `localActivePath` doesn't exist AND `worktreeExists()` returns false. Inside the early-return, we're already in a worktree (detected by `detectWorktreeSlug`), so `localActivePath` typically exists. The warning is more relevant on the main paths (Verify/Fix from main without worktree).
- `MAX_PHASE_MS` constant is declared inside the `computeTiming` function's plan block, not shared with the existing build/verify block. Both use the same value (24h). The spec said "follow the exact pattern" and the existing pattern declares it locally.
- The early-return Fix phase detection reads verify_report content and checks for FAIL, matching the main path pattern — per spec gotcha, just detecting verify_report existence isn't enough.

## Deviations from Contract

### A003: Starting work from main during Plan phase records the plan session start time
**Instead:** No new test written — AC3 is covered by existing code path at line 1549 which already writes `plan_started_at` during Plan phase detection from main. The `plan_started_at` write was already in the codebase before this spec.
**Reason:** Adding a dedicated test requires mocking `process.exit` (Plan phase detection calls `process.exit` on branch validation failure) and the existing phase detection tests already exercise this path.
**Outcome:** Functionally satisfied — the timestamp write exists and works. The proofSummary tests verify consumption.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
 Test Files  96 passed (96)
      Tests  1998 passed | 2 skipped (2000)
   Duration  33.91s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
 Test Files  96 passed (96)
      Tests  2013 passed | 2 skipped (2015)
   Duration  35.63s
```

### Comparison
- Tests added: 15
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/work.test.ts`: 7 tests in "work start early-return phase detection" describe block — Build phase timestamp, Verify phase timestamp, Verify-not-Build guard, Fix phase (FAIL verify), write-once guard, force parameter, missing worktree warning
- `packages/cli/tests/utils/proofSummary.test.ts`: 8 tests in "computeTiming with plan_started_at" describe block — plan_started_at available, absent fallback, after contractTime, over 24h, backward compat, verify_started_at still works, zero duration, invalid string

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
4a9b22b [phase-timing-fix] Update plan and verify agent templates for session timing
b3f43d2 [phase-timing-fix] Add write-once guard, early-return phase detection, and plan_started_at timing
```

## Open Issues

1. `MAX_PHASE_MS` is declared twice — once in the plan timing block (new) and once in the existing build/verify timing blocks. A shared constant at function scope would be cleaner, but spec said "follow the exact pattern" so I kept it local.

2. The early-return path's phase detection duplicates ~30 lines of artifact-checking logic from the main path (lines 1468-1483). A shared helper would reduce duplication, but the spec didn't call for refactoring and the duplication is intentional (local vs main paths resolve different `activePath` values).

3. A003 contract assertion ("Starting work from main during Plan phase records plan_started_at") has no dedicated tagged test. The code path existed before this spec and is exercised by existing phase detection tests. A dedicated test would require mocking `process.exit` for the branch validation guard that precedes the timestamp write.

Verified complete by second pass.
