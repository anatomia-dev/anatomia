# Spec: work.ts saves.json backward compat bug + worktree duplication + formatting

**Created by:** AnaPlan
**Date:** 2026-05-15
**Scope:** .ana/plans/active/fix-work-saves-compat/scope.md

## Approach

Three fixes in `work.ts`, one test file. All changes are internal logic — no CLI interface changes, no new commands, no schema changes.

**Fix 1 — Phase guard on saves.json fallback:** Two code paths fall back to unnumbered saves.json keys (`build-report`, `verify-report`) for backward compat. This fallback is only legitimate for phase 1 — pre-migration single-phase work items. Phase 2+ should never match unnumbered keys because multi-phase was introduced with numbered format from day one. The disease: the fallback condition is too broad, letting phase 2 satisfy completeness checks using phase 1's legacy data.

The fix is identical in both locations:
- `getWorkStatus` multi-phase stage detection (the `FAIL` re-verify check around line 472): guard the `saves['build-report']` fallback with `phaseNum === 1`.
- `completeWork` completeness check (around line 1553): the `!isUnnumbered` guard already exists but the fallback uses `!isUnnumbered` to decide whether to try unnumbered keys — this needs an additional `phaseNum === 1` constraint. Currently `!isUnnumbered` is true for ALL numbered specs (phase 1 through N), but the fallback should only apply to phase 1.

**Fix 2 — printExistingWorktree deduplication:** Replace the manual git queries in `printExistingWorktree` (HEAD read, rev-list ahead, rev-list behind) with a call to `getWorktreeInfo(projectRoot, slug)`, which already computes all these values. Use the returned `WorktreeInfo` fields for display. Ignore `lastActivityDays` and `isStale` — `printExistingWorktree` doesn't currently display them. The `startWork` resume path is NOT included — `getWorktreeInfo` can't be called cleanly from inside a worktree because `findProjectRoot()` returns the worktree root, and `getWorktreePath(worktreeRoot, slug)` resolves to a nested path that doesn't exist.

**Fix 3 — getNextAction multi-line return:** Change `getNextAction` return type to `string | string[]`. The ready-to-merge case returns a 2-element array instead of a `\n`-joined string. The `WorkItem.nextAction` type widens to `string | string[]`. The human-readable display caller formats arrays with per-line `→` prefix and indentation. JSON output naturally serializes arrays — this improves the JSON shape from embedded `\n` to a proper array.

## Output Mockups

**Before (ready-to-merge in `work status`):**
```
    Stage: ready-to-merge
    → Review PR, then: ana work complete my-slug
Or to merge and complete (from main): ana work complete --merge my-slug
```
The second line has no `→` prefix or indentation — raw text dumped after the styled first line.

**After:**
```
    Stage: ready-to-merge
    → Review PR, then: ana work complete my-slug
    → Or to merge and complete (from main): ana work complete --merge my-slug
```
Both lines get the cyan `→` prefix and consistent indentation.

**JSON before:** `"nextAction": "Review PR, then: ana work complete my-slug\nOr to merge and complete (from main): ana work complete --merge my-slug"`

**JSON after:** `"nextAction": ["Review PR, then: ana work complete my-slug", "Or to merge and complete (from main): ana work complete --merge my-slug"]`

## File Changes

### `packages/cli/src/commands/work.ts` (modify)
**What changes:**
1. Phase guard added to saves.json fallback in `getWorkStatus` multi-phase FAIL path (~line 472). The `saves['build-report']` and `saves['verify-report']` fallbacks get a `phaseNum === 1` condition.
2. Phase guard added to saves.json fallback in `completeWork` completeness check (~line 1553). The `savesData['build-report']` and `savesData['verify-report']` fallbacks get a `phaseNum === 1` condition alongside the existing `!isUnnumbered` check.
3. `printExistingWorktree` body replaced: delete manual git queries, call `getWorktreeInfo(projectRoot, slug)`, format from returned `WorktreeInfo`. Preserve existing display format — branch, commit count, commits behind warning, cd path.
4. `getNextAction` return type changed to `string | string[]`. The ready-to-merge branch returns a 2-element array.
5. `WorkItem.nextAction` type changed from `string` to `string | string[]` (line 82).
6. Human-readable display caller (~line 659) updated to handle `string | string[]` — if array, map each element to a `→`-prefixed line.

**Pattern to follow:** The existing `getWorktreeInfo` call at line 768 for usage pattern. The existing phase guard at line 448 (`if (phaseNum === 1)`) for guard shape.
**Why:** Without the phase guard, phase 2+ can pass completeness checks using phase 1's backward-compat data — a logic bug. Without the dedup, git queries are duplicated across two functions. Without the formatting fix, multi-line next actions display incorrectly.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:**
1. The existing test at ~line 565 ("multi-phase stage detection falls back to unnumbered saves.json keys") is updated: it currently asserts phase 2 succeeds with unnumbered keys (the buggy behavior). Update to assert phase 2 does NOT fall back — it should NOT show `phase-2-ready-for-re-verify` when only unnumbered keys exist.
2. New test: phase 1 with unnumbered keys still falls back correctly (backward compat preserved).
3. New test: `completeWork` rejects phase 2 completeness when only unnumbered saves.json keys exist.
4. New test: `completeWork` accepts phase 1 with unnumbered saves.json keys (backward compat).
5. New test: `getNextAction` array return renders with per-line `→` prefix in human-readable output (check ready-to-merge stage display).

**Pattern to follow:** The existing multi-phase stage detection tests in the `getWorkStatus` describe block (~line 500+). The `createWorkTestProject` and `createMergedProject` helpers.
**Why:** The existing test encodes the bug as expected behavior. Tests must verify the fix and confirm backward compat is preserved where legitimate.

## Acceptance Criteria

- [ ] AC1: `completeWork` rejects phase 2+ saves.json completeness checks that only have unnumbered keys — phase 2 cannot pass using phase 1's backward-compat data
- [ ] AC2: `getWorkStatus` multi-phase stage detection applies the same phase guard — phase 2 does not fall back to unnumbered saves.json keys
- [ ] AC3: Phase 1 still falls back to unnumbered keys correctly (backward compat preserved for the one phase where it's legitimate)
- [ ] AC4: Test coverage exists for `completeWork`'s multi-phase completeness check with both numbered and unnumbered saves.json keys
- [ ] AC5: The existing backward compat test (work.test.ts ~line 565) is updated to assert correct behavior: phase 1 falls back, phase 2 does not
- [ ] AC6: `printExistingWorktree` uses `getWorktreeInfo` instead of reimplementing git queries
- [ ] AC7: `getNextAction` returns `string | string[]`; the caller formats each element with proper `→` prefix and indentation
- [ ] AC8: All existing tests pass

## Testing Strategy

- **Unit tests:** Update existing backward compat test to assert the corrected behavior (phase 2 with unnumbered keys does NOT trigger re-verify). Add a companion test for phase 1 unnumbered fallback working. Add `completeWork` tests using `createMergedProject` helper — one test for phase 2 rejection, one for phase 1 acceptance. Add a display test for ready-to-merge multi-line formatting.
- **Edge cases:** Phase 1 single-spec with unnumbered keys (backward compat), phase 2 with numbered keys (normal path), phase 2 with only unnumbered keys (the bug).
- **Regression:** Full suite run to confirm no existing tests break. The test at line 565 changes its assertion — this is intentional, not a regression.

## Dependencies

None. All changes are in existing files with existing test infrastructure.

## Constraints

- `printExistingWorktree` refactor must not display `lastActivityDays` or `isStale` — these are `getWorktreeInfo` fields that the function doesn't currently show.
- The `startWork` resume path is out of scope — path resolution from inside a worktree doesn't work cleanly with `getWorktreeInfo`.
- JSON output shape for `nextAction` changes from string-with-newlines to array. This is acceptable — the embedded newline was already broken for programmatic consumers.

## Gotchas

- The test at ~line 565 currently asserts `phase-2-ready-for-re-verify` with unnumbered keys — this is the buggy behavior encoded as expected. Updating this test is part of the fix, not a regression.
- `completeWork` uses `!isUnnumbered` to decide whether to try unnumbered fallback. `isUnnumbered` is true when `specFile === 'spec.md'` — this is only true for single-phase specs. For multi-phase, ALL phases have `!isUnnumbered === true`, including phase 1. The fix needs `phaseNum === 1` as an additional constraint, not a replacement for `!isUnnumbered`.
- `getWorktreeInfo` internally calls `readArtifactBranch(projectRoot)`. The `printExistingWorktree` function receives `artifactBranch` as a parameter. After the refactor, the `artifactBranch` parameter becomes unused for git queries but is still needed for the behind-warning message text. Actually, `getWorktreeInfo` doesn't return `artifactBranch` in its result — so use the parameter for the warning message text (e.g., "behind main"). Keep the parameter.
- `printExistingWorktree` currently prints `path.relative(process.cwd(), wtPath)` — after refactoring with `getWorktreeInfo`, the `path` field on `WorktreeInfo` is the absolute worktree path. Continue using `path.relative()` for display.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- Test behavior, not implementation. Assert on what the code returns or produces.
- Never weaken a test to make it pass. The test at line 565 is being corrected, not weakened.
- Always pass `--run` flag when invoking Vitest.
- Tests that create git repositories must force the branch name with `git init -b main` or `git branch -M main`.

### Pattern Extracts

**Phase guard pattern (work.ts:446-453) — the shape to replicate for saves.json fallback:**
```typescript
      if (!phaseBuildReport) {
        // This phase not built yet
        if (phaseNum === 1) {
          return 'phase-1-build-in-progress';
        } else {
          return `phase-${phaseNum}-ready-for-build`;
        }
      }
```

**Existing saves.json fallback in getWorkStatus (work.ts:469-474) — the code to fix:**
```typescript
              const buildKey = `build-report-${phaseNum}`;
              const verifyKey = `verify-report-${phaseNum}`;
              const buildSavedAt = (saves[buildKey] ?? saves['build-report'])?.saved_at;
              const verifySavedAt = (saves[verifyKey] ?? saves['verify-report'])?.saved_at;
```

**Existing saves.json fallback in completeWork (work.ts:1549-1554) — the code to fix:**
```typescript
    const buildKey = isUnnumbered ? 'build-report' : `build-report-${phaseNum}`;
    const verifyKey = isUnnumbered ? 'verify-report' : `verify-report-${phaseNum}`;

    // Phase-aware lookup with fallback to unnumbered keys for backward compat
    const buildSave = savesData[buildKey] ?? (!isUnnumbered ? savesData['build-report'] : undefined);
    const verifySave = savesData[verifyKey] ?? (!isUnnumbered ? savesData['verify-report'] : undefined);
```

**getWorktreeInfo usage at work.ts:768 — the call pattern for printExistingWorktree:**
```typescript
    const wtInfo = getWorktreeInfo(projectRoot, slug);
```

**Human-readable nextAction display (work.ts:657-659) — the caller to update:**
```typescript
    // Show stage and next action
    console.log(`    ${chalk.bold('Stage:')} ${item.stage}`);
    console.log(chalk.cyan(`    → ${item.nextAction}\n`));
```

### Proof Context

Key findings for `work.ts`:
- **[code] completeWork fallback lets multi-phase specs share one unnumbered saves.json entry** — this is the primary bug being fixed (fix-cycle-stage-detection-C3).
- **[code] printExistingWorktree duplicates HEAD-reading logic from getWorktreeInfo** — being fixed by this scope (kind-aware-branch-prefixes-C5).
- **[code] getNextAction multi-line return breaks status output formatting** — being fixed by this scope (work-complete-merge-C4).

No active findings conflict with the planned changes.

### Checkpoint Commands

- After phase guard fix: `(cd packages/cli && pnpm vitest run tests/commands/work.test.ts --run)` — Expected: all work tests pass
- After all changes: `(cd packages/cli && pnpm vitest run --run)` — Expected: 2297+ tests pass, 104 test files
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2297 passed, 2 skipped (2299 total)
- Current test files: 104 passed
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2301+ tests (4+ new tests for phase guard, completeWork, backward compat, formatting)
- Regression focus: `tests/commands/work.test.ts` — the test at ~line 565 changes its assertion
