# Build Report: Fix Multi-Phase Timestamp Poisoning

**Created by:** AnaBuild
**Date:** 2026-05-31
**Spec:** .ana/plans/active/fix-multi-phase-timestamp-poisoning/spec.md
**Branch:** feature/fix-multi-phase-timestamp-poisoning

## What Was Built

- `packages/cli/src/commands/work-state.ts` (modified): Added `resolvePhase()` function — pure function that examines artifact state and saves metadata to determine current phase, stage, and correct timestamp keys. Added `compareTimestamp()` as shared core logic for timestamp comparison. Added `PhaseResolution` interface. Updated `determineStage` multi-phase section to use `resolvePhase` for consistent routing and phase-scoped keys (`verify_started_at_N`). Added defense-in-depth check that rejects verify timestamps predating the build report.

- `packages/cli/src/commands/work.ts` (modified): Updated inside-worktree resume path to use `resolvePhase` for all multi-phase build/verify/fix routing — writes phase-scoped keys. Updated main-tree verify and fix paths to use phase-scoped keys via `getMainTreeResolution`. Consolidated `checkConcurrencyGuard` to use `compareTimestamp`. Added helper functions: `gatherLocalArtifactState`, `readLocalSaves`, `getMainTreeResolution`, `startBuildPhaseWithKey`. Fixed single-spec re-verify to write `verify_started_at` (not `build_started_at`).

- `packages/cli/src/utils/proofSummary.ts` (modified): Extended multi-phase `computeTiming` to try per-phase start keys (`build_started_at_N`, `verify_started_at_N`) before falling back to segment timing. Added sanity validation: `build_started_at_N` must be after previous phase boundary and before `build-report-N.saved_at`; `verify_started_at_N` must be after `build-report-N.saved_at` and before `verify-report-N.saved_at`.

- `packages/cli/tests/commands/work.test.ts` (modified): Added 23 new tests in `phase-scoped timestamps` describe block covering: resolvePhase unit tests, determineStage with phase-scoped keys, startWork phase-scoped key writes (inside-worktree path), defense-in-depth validation, backward compat, arbitrary N phases (4-phase), compareTimestamp consolidation. Updated 2 existing tests that tested the old buggy re-verify behavior (AC15/AC25 — FAIL→Fix now correctly writes verify key).

- `packages/cli/tests/utils/proofSummary.test.ts` (modified): Added 7 new tests in `computeTiming with per-phase start keys` describe block covering: per-phase build_started_at_N usage, fallback to segment timing, stale key rejection, per-phase verify_started_at_N, mixed scenarios, backward compat with old saves.

## PR Summary

- Fixes multi-phase timestamp poisoning where Phase 1's `verify_started_at` incorrectly caused Phase 2 to show as `verify-in-progress`
- Introduces `resolvePhase()` — a single pure function used by both `determineStage` and `startWork` for consistent multi-phase routing
- Writes phase-scoped timestamp keys (`build_started_at_N`, `verify_started_at_N`) for multi-phase work, preventing cross-phase interference
- Fixes single-spec and multi-phase re-verify to write verify keys (not build keys), correctly modeling re-verify as a verify session
- Adds defense-in-depth: verify timestamps predating the build report are rejected as stale

## Acceptance Criteria Coverage

- AC1 "phase-2-ready-for-verify when Phase 1 has recent verify_started_at" → work.test.ts "returns phase-2-ready-for-verify when Phase 1 has recent verify_started_at" (2 assertions)
- AC2 "startWork for Phase 2 verify writes verify_started_at_2" → work.test.ts "Phase 2 verify writes verify_started_at_2 and verify_agent_2" (3 assertions)
- AC3 "recent verify_started_at_1 does not affect Phase 2 status" → work.test.ts "recent verify_started_at_1 does not affect Phase 2 status" (2 assertions)
- AC4 "single-spec with recent verify_started_at returns verify-in-progress" → work.test.ts "single-spec with recent verify_started_at returns verify-in-progress" (1 assertion)
- AC5 "Phase 2 FAIL re-verify writes verify_started_at_2" → work.test.ts "Phase 2 re-verify writes verify_started_at_2 not build_started_at_2" (3 assertions)
- AC6 "backward compat single-spec with generic keys" → work.test.ts "backward compat: single-spec with generic keys works correctly" (3 assertions)
- AC7 "computeTiming uses per-phase start keys" → proofSummary.test.ts "uses build_started_at_1 for Phase 1 build duration when valid" (1 assertion)
- AC8 "resolvePhase is exported from work-state.ts" → work.test.ts "is exported from work-state.ts and callable" (1 assertion) + code inspection (exported)
- AC9 "startWork for Phase 2 build writes build_started_at_2" → work.test.ts "Phase 2 build writes build_started_at_2 and build_agent_2" (3 assertions)
- AC10 "Phase 2 build start not blocked by Phase 1 timestamps" → covered by AC3 test + resolvePhase unit tests
- AC11 "main-tree and worktree startWork produce same phase decision" → work.test.ts "main-tree and worktree startWork produce same phase decision" (2 assertions)
- AC12 "phase resolver uses .saves.json save metadata" → resolvePhase FAIL/re-verify tests use saves metadata (3 tests)
- AC13 "phase-scoped keys work for arbitrary N (4-phase status)" → work.test.ts "4-phase workflow returns phase-4-ready-for-verify" (1 assertion)
- AC14 "re-verify works for arbitrary N (4-phase)" → resolvePhase "4-phase re-verify on phase 4 returns ready-for-re-verify" (3 assertions)
- AC15 "single-spec FAIL re-verify writes verify_started_at" → work.test.ts "single-spec FAIL re-verify writes verify_started_at not build_started_at" (3 assertions)
- Tests pass: ✅
- No build errors: ✅
- Lint passes: ✅ (1 pre-existing warning in git-operations.ts)

## Implementation Decisions

1. **`gatherLocalArtifactState` for inside-worktree path:** The spec said both `determineStage` and `startWork` should call the resolver. `determineStage` uses git branch reads; `startWork` inside-worktree uses filesystem reads. Created `gatherLocalArtifactState` to gather artifact state from local filesystem, then pass to `resolvePhase`. Same resolver, different data source.

2. **Inside-worktree path is the primary multi-phase routing path:** The main-tree `startWork` path rarely sees multi-phase state because reports live on the feature branch. Phase-scoped key writes happen primarily through the inside-worktree resume path. Tests exercise this path directly.

3. **`startBuildPhaseWithKey` delegation:** Rather than duplicating worktree creation logic, added a thin wrapper that passes the phase-scoped key to `startBuildPhase` via an optional parameter.

4. **`phaseName` regex in `checkConcurrencyGuard`:** Updated from simple `replace('_started_at', '')` to `replace(/_started_at(?:_\d+)?$/, '')` to correctly extract phase name from suffixed keys like `verify_started_at_2` → `verify`.

5. **Existing test modifications:** Two tests (`early-return writes build_started_at during Fix phase` and `force parameter overwrites existing timestamp`) tested the OLD buggy behavior of writing `build_started_at` on re-verify. Updated to verify the correct behavior per AC15/AC25.

## Deviations from Contract

### A004: Phase 2 verify start does not write the generic verify timestamp
**Instead:** Verified that `saves.verify_started_at` is undefined after Phase 2 verify write
**Reason:** Contract matcher `not_equals` with value `exists` — I interpreted this as "the generic key should not exist" and tested with `toBeUndefined()`
**Outcome:** Functionally equivalent — verifier should assess

### A014: Both determineStage and startWork use the phase resolver
**Instead:** Verified via the A023 test that inside-worktree startWork writes the correct phase-scoped key (proving it uses the resolver). No structural code inspection test.
**Reason:** Testing "uses resolver" as a boolean is a code structure assertion, not a behavioral test. The behavioral proof is that the correct phase-scoped key is written.
**Outcome:** Intent preserved — behavioral proof that both paths produce consistent phase decisions

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run)
Test Files  129 passed (129)
     Tests  3099 passed | 2 skipped (3101)
  Duration  50.41s
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run)
Test Files  129 passed (129)
     Tests  3129 passed | 2 skipped (3131)
  Duration  52.49s
```

### Comparison
- Tests added: 30
- Tests removed: 0
- Tests modified: 2 (updated to match correct re-verify behavior per AC15/AC25)
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/work.test.ts`: 23 new tests — resolvePhase unit tests, phase-scoped key writes via inside-worktree startWork, determineStage with phase-scoped verify-in-progress, defense-in-depth, backward compat, 4-phase arbitrary N, compareTimestamp consolidation
- `packages/cli/tests/utils/proofSummary.test.ts`: 7 new tests — per-phase start keys in computeTiming, sanity validation, mixed scenarios, stale key rejection, backward compat

## Verification Commands
```bash
(cd 'packages/cli' && pnpm run build)
(cd 'packages/cli' && pnpm vitest run)
(cd 'packages/cli' && pnpm run lint)
```

## Git History
```
96fdb08d [fix-multi-phase-timestamp-poisoning] Add tests for phase-scoped timestamps
d45da892 [fix-multi-phase-timestamp-poisoning] Add phase resolver and phase-scoped timestamp keys
```

## Open Issues

1. **Main-tree multi-phase routing limited by filesystem visibility:** The main-tree `startWork` path can only route multi-phase correctly when all reports are present on the local filesystem. In practice, reports live on the feature branch and the inside-worktree path handles routing. The main-tree path with `getMainTreeResolution` works when `hasNumberedSpec` is true, but is limited when verify reports are only on the feature branch. This is pre-existing behavior — the fix addresses the inside-worktree path which is the production hot path.

2. **`startBuildPhaseWithKey` unused parameter:** The `_buildAgentKey` parameter is unused — the agent value is always 'ana-build'. Kept for API symmetry with the resolution interface. Could be cleaned up.

3. **Pre-existing lint warning:** `git-operations.ts:198` has an unused eslint-disable directive — not introduced by this build.

Verified complete by second pass.
