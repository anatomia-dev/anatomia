# Build Report: work.ts saves.json backward compat bug + worktree dedup + formatting

**Created by:** AnaBuild
**Date:** 2026-05-15
**Spec:** .ana/plans/active/fix-work-saves-compat/spec.md
**Branch:** feature/fix-work-saves-compat

## What Was Built

- `packages/cli/src/commands/work.ts` (modified): Three fixes applied:
  1. Phase guard added to saves.json fallback in `getWorkStatus` multi-phase FAIL path (line 472). `saves['build-report']` and `saves['verify-report']` fallbacks now require `phaseNum === 1`.
  2. Phase guard added to saves.json fallback in `completeWork` completeness check (line 1553). `savesData['build-report']` and `savesData['verify-report']` fallbacks now require `!isUnnumbered && phaseNum === 1`.
  3. `printExistingWorktree` body replaced: deleted manual git queries (HEAD, rev-list ahead, rev-list behind), replaced with `getWorktreeInfo(projectRoot, slug)` call. Preserves identical display format.
  4. `getNextAction` return type changed to `string | string[]`. Ready-to-merge returns a 2-element array.
  5. `WorkItem.nextAction` type widened from `string` to `string | string[]`.
  6. Human-readable display caller updated to format arrays with per-line `→` prefix.

- `packages/cli/tests/commands/work.test.ts` (modified):
  1. Existing test at line 565 ("multi-phase stage detection falls back to unnumbered saves.json keys") updated to assert corrected behavior: phase 2 does NOT fall back, and shows `phase-2-needs-fixes` instead.
  2. New test: phase 1 with unnumbered keys falls back correctly (backward compat preserved).
  3. New test: `completeWork` rejects phase 2 completeness when only unnumbered saves.json keys exist.
  4. New test: `completeWork` accepts phase 1 with unnumbered saves.json keys.
  5. New test: ready-to-merge next action renders with per-line `→` prefix in human-readable output.
  6. New test: getNextAction returns array for ready-to-merge in JSON output.
  7. `createMergedProject` helper fixed to write phase-numbered saves.json keys for multi-phase projects (was writing only unnumbered keys, masking the bug in existing tests).

## PR Summary

- Fixed saves.json backward-compat fallback that let phase 2+ pass completeness checks using phase 1's legacy unnumbered keys in both `getWorkStatus` (re-verify detection) and `completeWork`
- Deduplicated `printExistingWorktree` by replacing manual git queries with existing `getWorktreeInfo()` utility — same display output, fewer code paths
- Changed `getNextAction` to return `string | string[]` so multi-line next actions (ready-to-merge) display with proper `→` prefix per line instead of raw newline-joined text
- Fixed `createMergedProject` test helper to write phase-numbered saves.json keys for multi-phase, preventing the helper from masking the bug it was supposed to test

## Acceptance Criteria Coverage

- AC1 "`completeWork` rejects phase 2+ saves.json completeness checks that only have unnumbered keys" → work.test.ts "completeWork rejects phase 2 with only unnumbered saves.json keys" (1 assertion: error output contains 'build-report')
- AC2 "`getWorkStatus` multi-phase stage detection applies the same phase guard" → work.test.ts "multi-phase stage detection does not fall back to unnumbered saves.json keys for phase 2" (2 assertions: not contains 'phase-2-ready-for-re-verify', contains 'phase-2-needs-fixes')
- AC3 "Phase 1 still falls back to unnumbered keys correctly" → work.test.ts "multi-phase stage detection falls back to unnumbered saves.json keys for phase 1" (1 assertion) + "completeWork accepts phase 1 with unnumbered saves.json keys" (1 assertion)
- AC4 "Test coverage exists for `completeWork`'s multi-phase completeness check" → Two new tests: phase 2 rejection + phase 1 acceptance
- AC5 "The existing backward compat test is updated to assert correct behavior" → Test renamed and assertions inverted: `not.toContain('phase-2-ready-for-re-verify')` + `toContain('phase-2-needs-fixes')`
- AC6 "`printExistingWorktree` uses `getWorktreeInfo`" → Implementation calls `getWorktreeInfo(projectRoot, slug)` instead of manual git queries
- AC7 "`getNextAction` returns `string | string[]`" → Type signature updated, ready-to-merge returns 2-element array, display caller formats with `→` prefix
- AC8 "All existing tests pass" → 2302 passed, 2 skipped, 104 test files

## Implementation Decisions

1. **`createMergedProject` fix:** The test helper was writing unnumbered saves.json keys for ALL phases, which meant existing multi-phase tests were silently relying on the bug. Fixed to write `build-report-{N}` / `verify-report-{N}` for multi-phase. This is necessary — without it, the existing "completes multi-spec work (3 phases)" test fails after the production fix. The helper was encoding the bug.

2. **`artifactBranch` parameter kept on `printExistingWorktree`:** `getWorktreeInfo` doesn't return `artifactBranch` in its result. The parameter is still needed for the behind-warning message text ("commits behind main"). Kept as specified in the gotchas.

3. **Empty string after array display:** Used `console.log('')` instead of `\n` suffix to maintain spacing parity with the single-string path.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run --run)
Test Files  104 passed (104)
     Tests  2297 passed | 2 skipped (2299)
```

### After Changes
```
(cd packages/cli && pnpm vitest run --run)
Test Files  104 passed (104)
     Tests  2302 passed | 2 skipped (2304)
```

### Comparison
- Tests added: 5 (1 replaced existing buggy test with corrected version + 1 new phase-1 backward compat + 2 completeWork tests + 2 formatting tests; net +5 because the replaced test counted as 1 removed + 2 added = +1, plus 4 new = +5 total)
- Tests removed: 0 (the test at line 565 was corrected, not removed — it was replaced with 2 tests)
- Regressions: none

### New Tests Written
- `work.test.ts`: "multi-phase stage detection does not fall back to unnumbered saves.json keys for phase 2" — verifies phase 2 with unnumbered keys shows needs-fixes not ready-for-re-verify
- `work.test.ts`: "multi-phase stage detection falls back to unnumbered saves.json keys for phase 1" — verifies phase 1 backward compat preserved
- `work.test.ts`: "completeWork rejects phase 2 with only unnumbered saves.json keys" — verifies completeness check fails for phase 2 with legacy keys
- `work.test.ts`: "completeWork accepts phase 1 with unnumbered saves.json keys" — verifies single-phase backward compat
- `work.test.ts`: "ready-to-merge next action renders with per-line arrow prefix" — verifies both lines get `→` prefix
- `work.test.ts`: "getNextAction returns array for ready-to-merge in JSON output" — verifies JSON shape is array

## Verification Commands
```bash
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run --run)
pnpm run lint
```

## Git History
```
6637b826 [fix-work-saves-compat] Return string[] from getNextAction for multi-line actions
130a1efa [fix-work-saves-compat] Deduplicate printExistingWorktree with getWorktreeInfo
3624f424 [fix-work-saves-compat] Add phase guard to saves.json fallbacks
```

## Open Issues

The `createMergedProject` helper previously wrote only unnumbered saves.json keys for all phases. This means any multi-phase test using `createMergedProject` was passing the completeness check via the (now-fixed) buggy fallback path. After the fix, `createMergedProject` writes phase-numbered keys. Any future test that needs to specifically test the unnumbered fallback for multi-phase must construct saves.json manually rather than relying on the helper.

The pre-existing lint warning in `git-operations.ts` (unused eslint-disable directive at line 198) is not introduced by this build.

Verified complete by second pass.
