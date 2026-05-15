# Scope: work.ts saves.json backward compat bug + worktree duplication + formatting

**Created by:** Ana
**Date:** 2026-05-15

## Intent
Fix three clustered quality issues in work.ts identified by AnaLearn session 5. The priority is a logic bug in saves.json backward compatibility that allows multi-phase completeness checks to pass using wrong-phase data. Secondary: eliminate duplicated worktree-info computation and fix a broken multi-line display in work status.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — logic changes in existing functions, no new systems
- **Files affected:** `packages/cli/src/commands/work.ts`, `packages/cli/tests/commands/work.test.ts`
- **Blast radius:** Low. All changes are internal to work.ts display and completeness-check logic. No CLI interface changes, no new commands, no schema changes, no downstream consumers affected.
- **Estimated effort:** 1-2 hours
- **Multi-phase:** no

## Approach

Three fixes, one file, shared test infrastructure.

**Saves.json phase guard:** The unnumbered-key fallback in both `completeWork` and `getWorkStatus` lacks a phase guard. Phase 2+ can satisfy completeness checks using phase 1's legacy data. Add a `phaseNum === 1` guard so only the first phase falls back to unnumbered keys — the only phase that could legitimately have pre-migration data. This affects two code paths that share the same disease.

**Worktree info deduplication:** `printExistingWorktree` reimplements git queries that `getWorktreeInfo` already performs and returns as a typed object. Replace the manual computation with a call to the existing function. Attempt the same for the `startWork` resume path — but only if `getWorktreeInfo` works cleanly from inside the worktree. If path resolution doesn't fit naturally, leave it and note a finding. Seven lines aren't worth a shim.

**Formatting fix:** `getNextAction` returns a multi-line string for ready-to-merge. The caller prefixes with `→` and indentation, which only applies to the first line. Change the return type to `string | string[]` so the caller can format each line independently.

## Acceptance Criteria
- AC1: `completeWork` rejects phase 2+ saves.json completeness checks that only have unnumbered keys — phase 2 cannot pass using phase 1's backward-compat data
- AC2: `getWorkStatus` multi-phase stage detection applies the same phase guard — phase 2 does not fall back to unnumbered saves.json keys
- AC3: Phase 1 still falls back to unnumbered keys correctly (backward compat preserved for the one phase where it's legitimate)
- AC4: Test coverage exists for `completeWork`'s multi-phase completeness check with both numbered and unnumbered saves.json keys
- AC5: The existing backward compat test (work.test.ts ~line 565) is updated to assert correct behavior: phase 1 falls back, phase 2 does not
- AC6: `printExistingWorktree` uses `getWorktreeInfo` instead of reimplementing git queries
- AC7: `getNextAction` returns `string | string[]`; the caller formats each element with proper `→` prefix and indentation
- AC8: All existing tests pass

## Edge Cases & Risks
- **In-flight multi-phase work with unnumbered keys:** If someone has a real multi-phase work item where `.saves.json` only contains unnumbered keys for phase 2, the fix would block their `work complete`. Practically unlikely — multi-phase was added with numbered format as the default from day one. The backward compat path existed as defensive coding, not because real data used it for phase 2+.
- **startWork resume path resolution:** `getWorktreeInfo` takes `projectRoot` + `slug` and resolves the worktree path internally. The resume path runs from inside the worktree where `findProjectRoot()` returns the worktree root. Need to verify `getWorktreePath(worktreeRoot, slug)` still resolves correctly. If it doesn't, leave the 7 lines and note a finding.
- **Display change in printExistingWorktree:** `getWorktreeInfo` also computes `lastActivityDays` and `isStale`, which `printExistingWorktree` doesn't currently show. The refactor must not start displaying these fields unless intentionally added. Just ignore unused fields.
- **getNextAction callers:** `getNextAction` is called at line 765 (in `getWorkStatus` building `StatusItem`). The `nextAction` field on `StatusItem` would change from `string` to `string | string[]`. Check that the status display caller at line 659 and any JSON output consumers handle both types.

## Rejected Approaches
- **Separate scopes per issue:** All three issues are in work.ts, share test infrastructure, and are small fixes. Three pipeline runs for three fixes in the same file is overhead that doesn't earn its place.
- **"General case" multi-line handling in getNextAction:** Only one return value is multi-line. Building a general-purpose multi-line rendering system for a single case violates "every character earns its place." Return `string | string[]`, handle both in the caller, move on.
- **Removing backward compat entirely:** The unnumbered-key fallback for phase 1 is still legitimate — pre-migration single-phase work items exist. Removing it would break real data. The fix is narrowing the fallback, not eliminating it.

## Open Questions
- The `startWork` resume path: can `getWorktreeInfo` be called cleanly when already inside the worktree? Plan should verify the path resolution chain (`findProjectRoot()` from worktree → `getWorktreePath()`) and drop this sub-task if it doesn't work naturally.

## Exploration Findings

### Patterns Discovered
- work.ts:1553 and work.ts:472 share the same unnumbered-key fallback pattern — same bug, two locations
- work.ts:2129-2149 (`printExistingWorktree`) is a near-exact copy of worktree.ts:301-367 (`getWorktreeInfo`), minus `lastActivityDays` and `isStale`
- `getWorktreeInfo` is already imported on line 25 and used at lines 768 and 1581

### Constraints Discovered
- [TYPE-VERIFIED] WorktreeInfo interface (worktree.ts:38-45) — already includes `commitsBehind`, `commitCount`, `branch`, `path`, `lastActivityDays`, `isStale`. No schema change needed.
- [OBSERVED] countPhases returns `spec-N.md` for multi-phase, `spec.md` for single-phase — the `isUnnumbered` check correctly identifies single-phase specs, but the fallback condition is too broad
- [OBSERVED] The test at work.test.ts:565 encodes the buggy behavior as expected — it asserts phase 2 succeeds with unnumbered keys. This test must be updated, not just supplemented.
- [OBSERVED] getNextAction has exactly one multi-line return (line 531, ready-to-merge). No other stage returns `\n`.

### Test Infrastructure
- work.test.ts uses `createWorkTestProject` helper for status tests, `createMergedProject` helper for complete tests
- Stage detection tests are in the `getWorkStatus` describe block (~line 200+)
- Complete tests are in a separate describe block (~line 860+)

## For AnaPlan

### Structural Analog
`getWorkStatus` multi-phase stage detection (work.ts:436-475) — same loop structure, same saves.json lookup pattern, same phase iteration as `completeWork`'s completeness check. The fix is the same shape in both locations.

### Relevant Code Paths
- `completeWork` completeness check: work.ts:1530-1573 (saves.json phase loop)
- `getWorkStatus` multi-phase stage detection: work.ts:436-475 (saves.json fallback in FAIL path)
- `printExistingWorktree`: work.ts:2116-2159 (display function with duplicated git queries)
- `getWorktreeInfo`: worktree.ts:301-367 (canonical implementation)
- `startWork` resume path: work.ts:1746-1758 (inside-worktree HEAD read)
- `getNextAction`: work.ts:505-556 (stage-to-action mapping)
- Status display caller: work.ts:657-659 (formats nextAction with arrow prefix)
- `StatusItem.nextAction` type: wherever StatusItem is defined — needs to accept `string | string[]`

### Patterns to Follow
- The existing phase-guard pattern at work.ts:448 (`if (phaseNum === 1)`) — same conditional shape needed for saves.json fallback
- The existing `getWorktreeInfo` call at work.ts:768 — same usage pattern for the refactor

### Known Gotchas
- The backward compat test at line 565 asserts the WRONG behavior. Updating it is part of the fix, not a test regression.
- `StatusItem.nextAction` type change from `string` to `string | string[]` may require updating the type definition and any JSON serialization paths (check `--json` output in `getWorkStatus`).
- `printExistingWorktree` currently doesn't display `lastActivityDays` or `isStale` from `getWorktreeInfo`. The refactor should not add new display fields — just use what it already showed.

### Things to Investigate
- Where `StatusItem` is defined and whether `nextAction: string` is used in JSON output or typed exports — the type change needs to be safe for all consumers.
- Whether the `startWork` resume path's `findProjectRoot()` from inside a worktree returns a root that `getWorktreePath` can use to resolve back to the same worktree. If not, skip this sub-task.

### Proof Chain Findings to Close
- fix-cycle-stage-detection-C3 (risk/scope) — saves.json logic bug
- fix-cycle-stage-detection-C1 (debt/scope) — backward compat test gap
- kind-aware-branch-prefixes-C5 (debt/scope) — HEAD duplication
- kind-aware-branch-prefixes-C6 (debt/scope) — HEAD duplication (3rd instance)
- worktree-freshness-detection-C2 (debt/scope) — commitsBehind duplication
- work-complete-merge-C4 (debt/scope) — formatting bug
