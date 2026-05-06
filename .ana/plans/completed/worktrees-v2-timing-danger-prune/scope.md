# Scope: Worktrees V2 — Phase Timing + Danger Map + Prune

**Created by:** Ana
**Date:** 2026-05-06

## Intent

V1 proved worktree isolation works — the trust model is enforced physically. But Build enters the worktree blind: no knowledge of which files have caused trouble before, and the proof chain is just a record nobody reads at build time. Meanwhile, phase timing lies — it measures gaps between artifact saves (which include developer idle time, sometimes days) instead of actual phase durations. And health display is missing the plan phase entirely.

The user wants three things: (1) Build enters the worktree knowing which files have a trouble history, (2) phase timing reflects what actually happened, and (3) stale worktree records get cleaned up automatically.

## Complexity Assessment
- **Size:** medium
- **Files affected:** `src/commands/work.ts`, `src/utils/proofSummary.ts`, `src/utils/worktree.ts`, `src/commands/proof.ts`, `src/types/proof.ts`
- **Blast radius:** `startBuildPhase` gains contract parsing + proof context query. `writeWorktreeContext` populates the existing `proofFindings` field (currently dead code). `computeTiming` reads new timestamp keys it currently ignores. `computePipelineStats` gains a field. `formatHealthDisplay` gains a column. `getWorkStatus` gains one line. No template changes. No CLI command signature changes. No behavioral changes — all additive.
- **Estimated effort:** 1-2 days
- **Multi-phase:** no

## Approach

Three independent improvements that all strengthen the proof chain as an operational surface.

**Danger Map:** Parse `contract.yaml` in `startBuildPhase` to extract `file_changes[].path`. Call the existing `getProofContext(paths, projectRoot)` once (it already batches). Rank files by severity-weighted finding count. Write the result as a `## Risk Profile` section into `worktree-context.md` via the existing but never-populated `proofFindings` field. Build already reads `worktree-context.md` (ana-build.md:107). Richer content, same file, same reader.

**Phase Timing:** `writeTimestamp` already writes `build_started_at` and `verify_started_at` to `.saves.json` (V1 laid this groundwork). `computeTiming` already computes `timing.plan` for individual entries. But `computeTiming` ignores the `_started_at` timestamps for build/verify duration — it uses artifact-gap timing instead. V2 reads the actual timestamps with a sanity-checked fallback. `computePipelineStats` gains `median_plan`. `formatHealthDisplay` shows 4 phases. Additionally, `writeTimestamp` records which agent entered each phase (`build_agent: "ana-build"`) for future consumption.

**Worktree Prune:** `getWorkStatus` calls `git worktree prune` before discovering slugs. Five lines. Cleans up stale records from manually deleted worktrees.

## Acceptance Criteria

- AC1: When `startBuildPhase` creates a worktree and `contract.yaml` exists with `file_changes`, the resulting `worktree-context.md` contains a `## Risk Profile` section with files ranked by severity-weighted finding count (risk=3, debt=2, observation=1 — or weights AnaPlan validates)
- AC2: When `file_changes` files have zero active findings in the proof chain, the `## Risk Profile` section is omitted entirely — no empty sections
- AC3: When `contract.yaml` is missing or unparseable, `startBuildPhase` falls back to current behavior (raw string pass-through, no danger map) with no error
- AC4: Risk profile includes findings only — not build concerns
- AC5: `computeTiming` reads `build_started_at` and `verify_started_at` from `.saves.json` and uses them for build/verify phase durations when available
- AC6: `computeTiming` falls back to artifact-gap timing when `_started_at` timestamps are absent (backward compat for pre-V2 entries)
- AC7: `computeTiming` falls back to artifact-gap timing when a sanity check fails: `_started_at` is later than the corresponding artifact save, or computed duration is negative, or duration exceeds 24 hours
- AC8: `computePipelineStats` computes `median_plan` from `timing.plan` values across entries
- AC9: `formatHealthDisplay` shows 4 phases: `scope Xm · plan Xm · build Xm · verify Xm`
- AC10: `writeTimestamp` accepts an optional agent identity string and writes `{phase}_agent` alongside `{phase}_started_at` in `.saves.json` (e.g., `build_agent: "ana-build"`)
- AC11: Agent identity is hardcoded at each call site: `work_started_at` → `ana`, `plan_started_at` → `ana-plan`, `build_started_at` → `ana-build`, `verify_started_at` → `ana-verify`
- AC12: `getWorkStatus` calls `runGit(['worktree', 'prune'])` before `discoverSlugs`, inside the existing `if (currentBranch)` guard, swallowing errors silently
- AC13: `PipelineStats` type gains `median_plan: number | null`

## Edge Cases & Risks

**Timestamp overwrite on FAIL→Fix cycle.** When verify FAILs, `work start` overwrites `build_started_at` (line 1519). The second build also overwrites `build-report` save entry on completion. Result: timing reflects the last successful cycle, not cumulative effort. This is correct — the proof chain entry represents what shipped. Rejection cost tracking is a V3 metric.

**Agent starts but never finishes.** Developer runs `work start` (writes `build_started_at`), walks away, runs `work start` again later (overwrites). `computeTiming` measures from the last start to the artifact save. Last-write-wins is the right behavior — false starts shouldn't inflate timing.

**Multi-phase plans.** `_started_at` timestamps get overwritten per phase (Phase 2 Build overwrites Phase 1's `build_started_at`). Meanwhile `computeTiming` reads `build-report` (Phase 1's key). This creates a cross-phase mismatch. **Resolution:** the sanity guard (AC7) catches this — `build_started_at` from Phase 2 is later than Phase 1's `build-report.saved_at`, so the fallback kicks in automatically. No special multi-phase logic needed.

**Empty proof chain for danger map.** `getProofContext` already returns empty results per query when no chain exists (lines 1867-1874). AC2 ensures no empty section is written.

**YAML parse failure.** Contract YAML could be malformed. The `yaml` package is already a dependency. AC3 requires graceful fallback — catch parse errors, proceed without danger map.

**`git worktree prune` failure.** Lock files, permissions, offline. Swallowed silently per AC12. Best-effort cleanup.

**`median_plan` with sparse data.** Early proof chain entries lack `timing.plan` (written as identical to `timing.think` for backward compat at line 1507). `computePipelineStats` should filter nulls same as it does for other phases — `plans.length > 0 ? floorMedian(plans) : null`.

## Rejected Approaches

**Per-file `getProofContext` calls.** Initially considered calling once per `file_changes` entry. Rejected after verifying `getProofContext` already accepts `queries: string[]` and reads the chain once (line 1879). Batch is free.

**Cumulative timing across FAIL→Fix cycles.** Would require storing a history of `_started_at` timestamps (array instead of scalar). Adds complexity for a metric nobody consumes yet. Deferred to V3 alongside rejection echoes, which provide the right context for "how much did failure cost."

**Including build concerns in danger map.** Build concerns are unclassified, softer signals without severity. Mixing them with severity-weighted findings dilutes the signal. Findings only, per user direction. Build concerns can be a V3 addition if findings alone aren't enough.

**Per-phase timestamps for multi-phase plans.** Would require `build_started_at_1`, `build_started_at_2`, etc. Over-engineering for V2 — the sanity guard + artifact-gap fallback handles multi-phase correctly. Revisit if multi-phase becomes common.

## Open Questions

- Exact severity weights for danger map ranking — risk=3, debt=2, observation=1 is the starting proposal. AnaPlan should validate whether this produces useful differentiation given the current proof chain's severity distribution.
- Format of the `## Risk Profile` section — ranked list with scores, grouped by severity, or natural language summary. Plan should design the format that a build agent will actually act on.
- Whether `median_plan` should display as `plan 0m` when the think→plan gap is under 1 minute (common in single-session scoping). Displaying 0m is technically correct but might look broken. Plan should decide: display, omit, or show `<1m`.

## Exploration Findings

### Patterns Discovered
- `writeWorktreeContext` (worktree.ts:443) already accepts `proofFindings` in its data parameter and writes `## Proof Findings` section — but the field is never populated by any caller. This is the exact hook point for the danger map.
- `computeTiming` (proofSummary.ts:1476) already computes `timing.plan` (line 1503) separating think and plan phases. The individual-entry computation is complete. Only the aggregate (`computePipelineStats`) and display (`formatHealthDisplay`) are missing `plan`.
- `getProofContext` (proofSummary.ts:1864) accepts `queries: string[]`, reads chain once, filters by active status by default (line 1899). Returns `ProofContextResult` with findings including severity, touch_count, and last_touched. Exactly what the danger map needs.

### Constraints Discovered
- [TYPE-VERIFIED] `PipelineStats` (proof.ts:175) has no `median_plan` field — must be added
- [TYPE-VERIFIED] `writeTimestamp` (work.ts:1634) takes only `(activePath, key)` — must gain optional agent parameter
- [OBSERVED] `contract.yaml` `file_changes` is validated by `artifact.ts:468-476` with path and action fields — the data is reliably structured when present
- [OBSERVED] `build_started_at` and `verify_started_at` are already written by V1 (work.ts:1550, 1493) but never read by `computeTiming`
- [OBSERVED] `formatHealthDisplay` (proof.ts:445-448) pushes parts conditionally — adding `median_plan` follows the exact same pattern

### Test Infrastructure
- `packages/cli/tests/commands/work.test.ts` — extensive phase detection tests, worktree integration tests, uses temp directories with git repos
- `packages/cli/tests/utils/proofSummary.test.ts` — timing computation tests, pipeline stats tests, proof context query tests
- `packages/cli/tests/commands/proof.test.ts` — health display formatting tests

## For AnaPlan

### Structural Analog
`computePipelineStats` + `formatHealthDisplay` is the closest analog for the `median_plan` addition — it's the exact same pattern (collect values, compute median, add to display). For the danger map, `getProofContext` + `writeWorktreeContext` is the analog — call an existing query function, format results, write to an existing section.

### Relevant Code Paths
- `work.ts:1542-1581` — `startBuildPhase`: reads contract, creates worktree. V2 inserts proof context query between contract read and worktree creation.
- `work.ts:1634-1646` — `writeTimestamp`: gains optional agent param.
- `worktree.ts:443-490` — `writeWorktreeContext`: already has `proofFindings` plumbing. V2 populates it with formatted risk profile.
- `proofSummary.ts:1476-1516` — `computeTiming`: reads timestamps, computes durations. V2 adds `_started_at` reads with sanity guards.
- `proofSummary.ts:946-976` — `computePipelineStats`: gains `median_plan` collection.
- `proofSummary.ts:1864-1949` — `getProofContext`: called by danger map. No changes needed to this function.
- `proof.ts:440-451` — `formatHealthDisplay` pipeline section: gains plan column.
- `proof.ts:175-180` — `PipelineStats` type: gains `median_plan` field.
- `work.ts:635-720` — `getWorkStatus`: gains prune call.

### Patterns to Follow
- `computePipelineStats` line 966-968: collect phase values with null filtering. Copy this pattern for `median_plan`.
- `formatHealthDisplay` lines 446-448: conditional part push. Copy for plan.
- `writeTimestamp` line 1644: `saves[key] = value`. Agent identity follows the same write pattern.
- `startBuildPhase` line 1560-1562: contract read pattern. YAML parse wraps this with error handling.

### Known Gotchas
- `proofSummary.ts` is ~1550 lines and a known hot module (6 findings, 11 pipeline touches). Changes here require care — the file is past comfort threshold per prior findings.
- `work.ts` has `process.exit(1)` in validation paths, making unit testing hard (noted in proof chain findings). New code should return errors, not exit.
- `computeTiming` backward compat: old entries have `timing.scope` not `timing.think`. The `think ?? scope` fallback at line 966 must be preserved.

### Things to Investigate
- Whether the `proofFindings` field in `writeWorktreeContext` data type needs to change from `string` to a structured type, or if formatting to string before passing is cleaner.
- Whether `computeTiming` should thread `_started_at` timestamps into the proof chain entry for archival, or if they stay in `.saves.json` only.
