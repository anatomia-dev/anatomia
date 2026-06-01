# Scope: Fix Multi-Phase Timestamp Poisoning

**Created by:** Ana
**Date:** 2026-05-31

## Intent
Fix a state-model bug where `.saves.json` session timestamps are work-item-scoped but the pipeline state machine applies them per-phase. In multi-phase workflows, Phase 1's `verify_started_at` timestamp persists and causes `ana work status` to misclassify Phase 2 as "verify-in-progress" for up to one hour after Phase 1 verification completes. Discovered during the first multi-phase Codex pipeline run (`docs-readme-platform-update`).

The same structural flaw exists for `build_started_at` and affects `startWork` phase routing — the system has three independent views of "what phase are we on?" that disagree in multi-phase scenarios.

## Complexity Assessment
- **Kind:** fix
- **Size:** medium — state model change across two modules plus timing, with backward compatibility for existing `.saves.json` files
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/work-state.ts` — `determineStage`, `isTimestampRecent`, new phase resolver
  - `packages/cli/src/commands/work.ts` — `startWork` worktree-resume path, `writeTimestamp` calls
  - `packages/cli/src/utils/proofSummary.ts` — `computeTiming` per-phase start keys
  - `packages/cli/src/commands/work-state.test.ts` — new/modified tests
  - `packages/cli/src/commands/work.test.ts` — new/modified tests
- **Blast radius:** `ana work status`, `ana work start`, `ana work complete` (reads `.saves.json`), proof chain timing. All pipeline agents call `work status` and `work start` on every session.
- **Estimated effort:** 1 day
- **Multi-phase:** no

## Approach
The disease is that `.saves.json` has a flat namespace mixing durable phase-aware artifact metadata (`build-report-1`, `verify-report-1`) with transient phase-blind session markers (`build_started_at`, `verify_started_at`). These markers were designed for single-phase work and never made phase-aware when multi-phase support was added to `determineStage`.

The fix makes session timestamps phase-aware for multi-phase work and centralizes phase resolution into one helper used by both `determineStage` and `startWork`.

Three parts:

**1. Phase-scoped session keys.** For multi-phase work, write `build_started_at_1`, `verify_started_at_1`, `build_started_at_2`, `verify_started_at_2`. Keep unsuffixed keys for single-spec work and backward compatibility. The phase number comes from the centralized resolver.

**2. Centralized phase resolver.** One function that examines the artifact state (specs, build reports, verify reports) and returns the current phase number, stage, and the correct `.saves.json` keys for that phase. Both `determineStage` and `startWork` use this resolver instead of duplicating phase logic with different implementations.

**3. Defense-in-depth timestamp comparison.** Even with the correct per-phase key, verify that the timestamp postdates the current phase's `build-report-N.saved_at`. A `verify_started_at_2` that predates `build-report-2.saved_at` is provably stale (from a crash-and-restart or timing anomaly). This prevents edge cases the phase keys alone might miss.

`computeTiming` should prefer per-phase start keys when present (`build_started_at_1` for Phase 1 build duration, `verify_started_at_2` for Phase 2 verify duration) and fall back to segment timing (contract → build-report-N → verify-report-N intervals) when keys are absent. This preserves accuracy for old proof entries.

## Acceptance Criteria
- AC1: `ana work status` returns `phase-2-ready-for-verify` (not `phase-2-verify-in-progress`) when Phase 1 has a recent `verify_started_at`, Phase 1 is PASS, Phase 2 build report exists, and Phase 2 verify report is missing.
- AC2: `ana work start` for Phase 2 verify writes `verify_started_at_2` to `.saves.json`, not the generic `verify_started_at`.
- AC3: A recent `verify_started_at_1` does not block Phase 2 status or entry.
- AC4: Single-spec work with a recent generic `verify_started_at` still correctly returns `verify-in-progress`.
- AC5: Phase 2 FAIL verify + newer Phase 2 build report returns `phase-2-ready-for-re-verify`. `startWork` writes `verify_started_at_2`, not `build_started_at`.
- AC6: Existing old `.saves.json` files without suffixed keys behave correctly for single-spec and backward-compatible Phase 1 entries.
- AC7: `computeTiming` uses per-phase start keys when present and falls back to segment timing when absent.
- AC8: `determineStage` and `startWork` use the same phase resolver — no duplicated phase detection logic.

## Edge Cases & Risks
**Clock consistency.** Both `build-report-N.saved_at` and `verify_started_at_N` come from `new Date().toISOString()` on the same machine. The defense-in-depth comparison is safe. Edge case: if a developer's clock jumps backward between build save and verify start, the comparison would incorrectly treat the verify timestamp as stale. The 1-hour concurrency window makes this extremely unlikely.

**Crash between `work start` and `artifact save`.** If verify starts (writes `verify_started_at_2`) but crashes before saving `verify_report_2`, the timestamp remains as a valid concurrency guard. After 1 hour it expires. Same behavior as single-phase today — no regression.

**Mixed old/new `.saves.json` format.** Old saves have unsuffixed keys. New saves for multi-phase have suffixed keys. The resolver should check suffixed first, fall back to unsuffixed for Phase 1 only. Phase 2+ with no suffixed key means no active session — return `ready-for-X`.

**`startWork` from main tree vs worktree.** The worktree resume path (inside the worktree) and the main-tree path read artifacts from different locations. The phase resolver should work with the artifacts it's given, not assume filesystem location. The existing split between artifact-branch reads and worktree reads is preserved.

**`isTimestampRecent` vs `checkConcurrencyGuard` duplication.** Proof findings `pipeline-concurrency-guards-C2` notes these duplicate logic. The phase resolver should consolidate them — one timestamp-checking path, phase-aware.

## Rejected Approaches
**Patch-only: compare `verify_started_at` against `build-report-N.saved_at` in `determineStage`.** This fixes the status display but leaves `startWork` writing nothing for Phase 2 verify, leaves the concurrency guard absent, and doesn't address the re-verify routing. Treats the symptom.

**Clear timestamps after artifact save.** When `ana artifact save verify-report-1` succeeds, clear `verify_started_at`. Clean lifecycle, but doesn't help if the session crashes without saving (no clear happens), and adds coupling between `artifact.ts` and the session state model.

**Phase-specific keys only, no timestamp comparison.** Correct for the normal case, but doesn't handle stale keys from crash-and-restart scenarios. Belt without suspenders.

## Open Questions
- Should `checkConcurrencyGuard` be merged into the phase resolver or remain a separate utility that the resolver calls? The resolver needs to know the right key; the guard needs to check it. Separate concerns, but the duplication with `isTimestampRecent` should be eliminated.
- Should `computeTiming` changes go in this scope or be deferred? The timing uses generic `build_started_at` for the build segment start, which is Phase 1's value for all phases. Fixing it here is complete; deferring it is lower risk.

## Exploration Findings

### Patterns Discovered
- `work-state.ts:417-487`: Multi-phase loop iterates phases correctly for artifact detection but reads phase-blind timestamps at line 449.
- `work-state.ts:382-388`: Single-phase verify-in-progress uses same `isTimestampRecent` pattern — structurally identical to the multi-phase bug but can't trigger (only one phase).
- `work.ts:1144-1195`: Worktree resume path uses `hasNumberedVerifyReport` (any report matches) — doesn't distinguish current phase from completed phases.
- `work.ts:1317-1319`: Main-tree `startWork` routes to `startBuildPhase()` for any spec-exists/no-build-report state — can't see worktree artifacts.
- `work.ts:1650-1671`: `writeTimestamp` has `force` parameter and write-once guard. Multi-phase needs `force: true` for Phase 2+ to overwrite Phase 1 values, or needs suffixed keys.
- `proofSummary.ts:620-623`: `computeTiming` reads generic `build_started_at` and `verify_started_at` — Phase 2 build segment uses Phase 1's build start.
- `proofSummary.ts:659-712`: Multi-phase timing already computes per-phase segments from artifact save times — per-phase start keys would improve accuracy but aren't required for correctness.

### Constraints Discovered
- [TYPE-VERIFIED] `.saves.json` is read from two locations: artifact branch (main tree) and worktree. Timestamps for build/verify are written to the worktree to avoid dirty state blocking `git pull` on the artifact branch.
- [TYPE-VERIFIED] `CONCURRENCY_TIMEOUT_MS` is 1 hour (line 57). The poisoning window is exactly this duration.
- [OBSERVED] `determineStage` checks `build_started_at` for Phase 1 only (line 438-439 returns `phase-1-build-in-progress` without a timestamp check, just worktree existence). Phase 2+ returns `phase-N-ready-for-build` directly. Build timestamp poisoning doesn't manifest because the check doesn't exist.
- [OBSERVED] The Codex Verify agent did NOT run `ana work start` — it only ran `ana work status`. The bug is entirely in status determination, not in session entry.
- [OBSERVED] Proof finding `decompose-work-ts-C4` already identified that `determineStage` needs phase-specific helpers.
- [OBSERVED] Proof finding `pipeline-concurrency-guards-C3` already identified that inside-worktree resume writes `verify_started_at` without checking concurrency.

### Test Infrastructure
- `packages/cli/tests/commands/work-status.test.ts`: Tests `determineStage` with mock artifact states. Tests single-phase and multi-phase stage detection. Does not test timestamp-based concurrency for multi-phase.
- `packages/cli/tests/commands/work-concurrency.test.ts`: Tests `checkConcurrencyGuard` and `isTimestampRecent`. Does not test phase-aware timestamp behavior.
- `packages/cli/tests/commands/work-complete.test.ts`: Tests phase-aware `.saves.json` reads for completeness checks.

## For AnaPlan

### Structural Analog
`packages/cli/src/commands/work-state.ts` `determineStage` multi-phase loop (line 426-487) is the structural analog — the exact code being modified. The single-phase verify-in-progress check at line 380-388 is the simpler version of the same pattern.

For the phase resolver, `packages/cli/src/commands/work-state.ts` `gatherArtifactState` (line 191-309) is the structural analog — it already gathers per-phase artifact info. The resolver builds on top of this data.

### Relevant Code Paths
- `packages/cli/src/commands/work-state.ts:343-490` — `determineStage`, the state machine
- `packages/cli/src/commands/work-state.ts:319-332` — `isTimestampRecent`, the timestamp checker
- `packages/cli/src/commands/work.ts:1110-1383` — `startWork`, phase routing and timestamp writes
- `packages/cli/src/commands/work.ts:1398-1503` — `startBuildPhase`, worktree creation and timestamp
- `packages/cli/src/commands/work.ts:1591-1638` — `checkConcurrencyGuard`, duplicates `isTimestampRecent`
- `packages/cli/src/commands/work.ts:1650-1671` — `writeTimestamp`, the write primitive
- `packages/cli/src/utils/proofSummary.ts:515-712` — `computeTiming`, reads generic start timestamps

### Patterns to Follow
- The existing `.saves.json` key convention: artifact keys use hyphens (`build-report-1`), timestamp keys use underscores (`build_started_at`). Phase-suffixed timestamps should follow: `build_started_at_1`, `verify_started_at_1`.
- `gatherArtifactState` returns a typed interface. The phase resolver should return a typed interface too.
- `determineStage` is a pure function (takes artifacts + branch info, returns a string). The phase resolver should also be pure.

### Known Gotchas
- `writeTimestamp` has a write-once guard (`if (!force && saves[key] !== undefined) return`). Phase-scoped keys are new keys, so the guard won't block them. But if the resolver writes `verify_started_at_2` and the agent crashes and restarts, the write-once guard would prevent re-writing. Use `force: true` for all phase-scoped timestamp writes to match the existing verify path behavior.
- `startWork` worktree-resume path (line 1144-1195) reads artifacts with `globSync`. The phase resolver should not use filesystem operations if called from `determineStage` (which operates on git branch data). The resolver should take pre-gathered artifact state as input.
- `computeTiming` is called from `generateProofSummary` which reads `.saves.json` from the completed plan directory. By completion time, all phases are done. The per-phase start keys improve accuracy but the segment-based fallback (contract → build-report-N intervals) is already correct for total duration.

### Things to Investigate
- Whether `startWork` from the main tree (Bug 3 — can't see worktree artifacts) needs any adjustment, or whether agents always entering from the worktree makes it safe to defer.
- Whether `checkConcurrencyGuard` and `isTimestampRecent` should be fully merged in this scope or just have `isTimestampRecent` delegate to the phase-aware check.
