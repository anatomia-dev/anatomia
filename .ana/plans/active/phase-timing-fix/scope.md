# Scope: Fix Pipeline Phase Timing

**Created by:** Ana
**Date:** 2026-05-07

## Intent
Pipeline phase timing is structurally broken. Three bugs produce incorrect or missing timestamps for Plan and Verify phases. The user wants accurate phase duration measurements across all pipeline stages so proof chain entries reflect real session times, not artifact-gap estimates.

## Complexity Assessment
- **Size:** small
- **Files affected:** `packages/cli/src/commands/work.ts`, `packages/cli/src/utils/proofSummary.ts`, `packages/cli/templates/.claude/agents/ana-plan.md`, `.claude/agents/ana-plan.md`
- **Blast radius:** Proof chain timing data, `.saves.json` writes, agent template behavior. No schema changes. No new commands. Backward compatible — old entries without `plan_started_at` fall back to artifact-gap.
- **Estimated effort:** 1-2 hours
- **Multi-phase:** no

## Approach
Phase detection in `work start` was designed for a pre-worktree world where all artifacts lived on main. In the worktree world, build/verify artifacts live on the feature branch. From main, phase detection structurally misidentifies the current phase 100% of the time for Verify.

The fix has two parts: make phase detection correct by detecting from inside the worktree (where all artifacts are visible), and close the gaps where timestamps are never written or never consumed.

Specifically:
1. Fix the early-return path in `work start` (when already inside the matching worktree) to detect the phase locally and write the correct `_started_at` timestamp before returning.
2. Add `work start` to the Plan template so `plan_started_at` actually gets written.
3. Reorder the Verify template so the agent cds to the worktree BEFORE calling `work start` — the early-return fix only works from inside the worktree.
4. Wire `plan_started_at` into `computeTiming` so it's actually consumed.
5. Add a write-once guard to `writeTimestamp` so crash/resume doesn't overwrite the original session start. FAIL→Fix path uses a `force` parameter to intentionally overwrite.
6. Warn (don't silently skip) when worktree is missing during timestamp write.

This removes the root cause (phase detection from wrong context) rather than patching symptoms.

## Acceptance Criteria
- AC1: `work start` from inside a worktree during Verify phase writes `verify_started_at` (not `build_started_at`)
- AC2: `work start` from inside a worktree during Build phase (resume) writes `build_started_at`
- AC3: `work start` from main during Plan phase writes `plan_started_at`
- AC4: `computeTiming` uses `plan_started_at` when available, falls back to artifact-gap when absent
- AC5: `computeTiming` uses `verify_started_at` when available (existing code — verify it works with the fix)
- AC6: Plan template instructs agent to run `work start {slug}` after `work status`
- AC7: Sanity guards on `plan_started_at`: must be before `contract.saved_at`, duration positive, under 24 hours
- AC8: Old proof chain entries without `plan_started_at` still compute plan timing via artifact-gap (backward compat)
- AC9: `build_started_at` is NOT overwritten when Verify phase runs `work start`
- AC10: `writeTimestamp` does NOT overwrite existing timestamps (write-once behavior)
- AC11: FAIL→Fix path overwrites `build_started_at` intentionally (force parameter)
- AC12: Missing worktree during Build/Verify timestamp write produces a warning, not silent skip

## Edge Cases & Risks
- **Agent doesn't run `work start`:** Timing falls back to artifact-gap. Same as today. No crash, no incorrect data — just less precise.
- **Agent runs `work start` multiple times (crash/resume):** Write-once guard preserves original timestamp. First session start is what matters.
- **FAIL→Fix cycle:** Build agent re-runs with `force: true` → overwrites `build_started_at` → correct (new build session).
- **Verify calls `work start` from main (ignores template reordering):** Early-return doesn't fire. Normal phase detection misidentifies as Build. Write-once guard prevents corrupting `build_started_at`, but `verify_started_at` never written. Falls back to artifact-gap. Same as today — no regression, just no improvement. Template reordering is load-bearing for the fix.
- **`work start` called with wrong slug from inside worktree:** Existing guard rejects with clear error (line 1414-1418).
- **Worktree manually deleted:** Warning printed, timestamp skipped, artifact-gap fallback. Not a crash.
- **Concurrent `work start` calls:** Read-modify-write race on `.saves.json` — low practical risk since agents run sequentially. Write-once guard reduces the window.
- **Multi-phase numbered artifacts:** Early-return path must use same glob patterns as existing phase detection for `build_report_*.md` / `verify_report_*.md`.

## Rejected Approaches

**Record timestamps in `artifact save` instead of `work start`.** Save time IS `saved_at` time — they'd be identical. The point of `_started_at` is measuring when the agent began working, not when it finished. Only `work start` can capture session start.

**Add explicit phase parameter to `work start` (e.g., `work start --phase verify`).** Over-engineering. The artifact files already encode the phase. Detection from inside the worktree is unambiguous. A flag adds API surface for a problem that doesn't exist once detection context is correct.

## Open Questions
- Multi-phase numbered artifact detection in the early-return path — do the glob patterns match existing conventions? AnaPlan should verify.

## Exploration Findings

### Patterns Discovered
- `work.ts:1397-1413`: Early-return path when `detectWorktreeSlug() === slug`. Prints info and returns with zero timestamp work.
- `work.ts:1713-1730`: `writeTimestamp()` — unconditional overwrite, no guard.
- `work.ts:1499`: `plan_started_at` write — reachable only if Plan agent calls `work start`, which the template never instructs.
- `work.ts:1504-1506`: Build phase condition — `specExists && !buildReportExists`. From main during Verify, this is always true (build report is on feature branch).
- `work.ts:1510-1516`: Verify phase condition — `buildReportExists && !verifyReportExists`. Correct logic, but `buildReportExists` is always false from main.
- `proofSummary.ts:1490-1492`: Reads `build_started_at` and `verify_started_at` but not `plan_started_at`.
- `proofSummary.ts:1506-1513`: Plan timing always uses artifact-gap (`contractTime - scopeTime`).

### Constraints Discovered
- [TYPE-VERIFIED] Worktrees have `.ana/ana.json` — `findProjectRoot()` resolves correctly from inside worktrees
- [TYPE-VERIFIED] `detectWorktreeSlug()` returns slug when CWD is inside a worktree, null otherwise
- [OBSERVED] `.saves.json` split-brain (worktree vs main) is resolved by `git pull` at `work complete` time
- [OBSERVED] `work status` already prints worktree paths — Verify agent has the path before calling `work start`

### Test Infrastructure
- `packages/cli/tests/commands/work.test.ts` — existing tests for `work start`, phase detection, worktree creation

## For AnaPlan

### Structural Analog
`work.ts:1510-1516` — the Verify phase detection block. This is the exact code shape the early-return fix mirrors: check `buildReportExists && !verifyReportExists`, write timestamp, continue. The early-return version does the same detection but from inside the worktree using local file paths.

### Relevant Code Paths
- `work.ts:1397-1413` — early-return path (Change 2 target)
- `work.ts:1713-1730` — `writeTimestamp()` (Change 6 target)
- `work.ts:1499` — `plan_started_at` write (already exists, just unreachable)
- `work.ts:1540-1545` — FAIL→Fix `build_started_at` write (needs `force: true`)
- `work.ts:1510-1516` — Verify phase detection (structural analog for early-return fix)
- `proofSummary.ts:1485-1540` — `computeTiming` section (Change 5 target)
- `templates/.claude/agents/ana-plan.md:32` — Plan template (Change 3 target)
- `.claude/agents/ana-plan.md` — dogfood copy of Plan template

### Patterns to Follow
- `work.ts:1518-1530` — build timing in `computeTiming`: prefer `_started_at`, sanity-guard, fall back to artifact-gap. Plan timing should follow this exact pattern.
- `work.ts:1576-1580` — `startBuildPhase()` resume path: check worktree exists, construct `wtPlanDir`, write timestamp. Early-return fix should use same path construction but with `findProjectRoot()`.

### Known Gotchas
- `process.cwd()` in the early-return path is unsafe if agent has cd'd to a subdirectory. Use `findProjectRoot()` which traverses upward to the worktree root.
- The Verify template reordering is load-bearing, not cosmetic. If verify calls `work start` from main, the early-return fix never fires and the bug persists. AnaPlan should make the template instruction unambiguous.
- `globSync` is already imported in `work.ts` — use it for numbered artifact detection in the early-return path.

### Things to Investigate
- Verify that the numbered artifact glob patterns (`build_report_*.md`, `verify_report_*.md`) in the early-return path match the conventions used by `artifact save` for multi-phase builds. Check the save command for the exact naming pattern.
