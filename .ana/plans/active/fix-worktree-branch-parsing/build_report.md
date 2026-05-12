# Build Report: Fix worktree branch parsing

**Created by:** AnaBuild
**Date:** 2026-05-12
**Spec:** .ana/plans/active/fix-worktree-branch-parsing/spec.md
**Branch:** feature/fix-worktree-branch-parsing

## What Was Built

- `packages/cli/src/commands/work.ts` (modified): Line 144 — widened regex from `/^\* /` to `/^[*+] /` to strip both current-branch (`*`) and worktree (`+`) markers from `git branch -a` output.
- `packages/cli/src/engine/detectors/git.ts` (modified): Line 108-109 — replaced `if (name.startsWith('* ')) name = name.slice(2)` with `name = name.replace(/^[*+] /, '')`. Strips both markers, removes conditional.
- `packages/cli/tests/commands/work.test.ts` (modified): Three changes: (1) added `worktree?: boolean` to slug options in `createWorkTestProject`, with implementation using `git worktree add` instead of `git checkout -b`; (2) added worktree cleanup to top-level `afterEach` (modeled on `worktree.test.ts:27-54`); (3) added integration test proving `getWorkStatus` returns clean `workBranch` and correct `stage` for worktree branches.

## PR Summary

- Fix `git branch -a` parsing to strip the `+ ` worktree marker, not just `* ` current-branch marker, in both `work.ts` and `git.ts`
- Add `worktree: true` option to `createWorkTestProject` test helper — uses `git worktree add` for realistic worktree scenarios
- Add worktree cleanup to top-level `afterEach` to prevent stale worktrees between tests
- Add integration test that creates a real worktree with a build report, then verifies `getWorkStatus({ json: true })` returns a clean branch name and correct pipeline stage

## Acceptance Criteria Coverage

- AC1 "clean branch name, no `+` prefix" → work.test.ts:733 `expect(json.items[0].workBranch).toBe('feature/test-slug')` (1 assertion)
- AC2 "clean branch name, no `*` prefix" → work.test.ts:729 existing test `getWorkBranch finds branch with custom prefix` (1 assertion, `toContain('dev/')`) — pre-existing, unaffected
- AC3 "legitimate `+` in branch names not stripped" → NO TEST (regex property: `[*+] ` requires trailing space; `feature/c++fixes` has no space after `+`. Verified by inspection, not a code path.)
- AC4 "detectBranches strips both markers" → source inspection: `git.ts:108-109` now uses `/^[*+] /`
- AC5 "createWorkTestProject accepts worktree: true" → work.test.ts:733 test exercises this path
- AC6 "worktree artifacts written in worktree directory, main tree stays on artifact branch" → work.test.ts:733 test creates worktree with build_report.md artifact and calls getWorkStatus from main tree
- AC7 "integration test with worktree: true" → work.test.ts:733 `getWorkStatus returns clean workBranch for worktree-checked-out branch`
- AC8 "afterEach cleanup removes worktrees" → work.test.ts:25-48 top-level afterEach with `git worktree list --porcelain` + `git worktree remove`
- AC9 "existing tests unaffected" → 166 existing tests pass, 167 total (166 + 1 new)
- AC10 "no existing tests break, test count increases" → 2178 passed (up from 2177 baseline)

## Implementation Decisions

- Placed the worktree path at `tempDir/worktrees/{slug}` (inside tempDir, outside `.ana/`) per spec's gotcha about avoiding path conflicts with `.ana/worktrees/`.
- The worktree helper creates the `worktrees/` directory with `recursive: true` before calling `git worktree add`.
- Feature artifacts for worktree slugs are written to the worktree's own `.ana/plans/active/{slug}/` directory (not the main tree's), and committed with `cwd: wtPath`.
- After worktree setup, `process.chdir(tempDir)` ensures the test runs from the main tree perspective.

## Deviations from Contract

### A003: Current branch marker is still stripped correctly
**Instead:** Satisfied by the pre-existing test at line 729 (`getWorkBranch finds branch with custom prefix`) which was not modified. The `@ana A010` tag on that test is from a previous build — I did not re-tag it.
**Reason:** The contract points to an existing test block. The assertion is satisfied by existing code. No new test needed.
**Outcome:** Functionally equivalent — the existing test covers this assertion.

### A004: The worktree plus-marker regex in work.ts uses a character class
**Instead:** Verified by source inspection rather than a runtime test. The regex `/^[*+] /` is visible on line 144.
**Reason:** This is a source-level assertion, not a behavioral one. Testing regex content at runtime would require exposing internals.
**Outcome:** Verifier can confirm by reading work.ts:144.

### A005: The worktree plus-marker regex in git.ts uses a character class
**Instead:** Verified by source inspection. The regex `/^[*+] /` is on line 108.
**Reason:** Same as A004 — source-level assertion.
**Outcome:** Verifier can confirm by reading git.ts:108.

### A006: Test helper accepts a worktree option
**Instead:** Verified by the integration test exercising `worktree: true`. No separate test for the helper's type signature.
**Reason:** The helper is tested through its usage, not its type.
**Outcome:** Functionally equivalent.

### A007: Worktree cleanup runs before directory removal
**Instead:** Verified by source inspection of afterEach at lines 25-48. The cleanup runs `git worktree remove` before `fs.rm(tempDir)`.
**Reason:** This is a structural assertion about test teardown ordering.
**Outcome:** Verifier can confirm by reading work.test.ts:25-48.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
 Test Files  100 passed (100)
      Tests  2177 passed | 2 skipped (2179)
   Duration  41.67s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
 Test Files  100 passed (100)
      Tests  2178 passed | 2 skipped (2180)
   Duration  40.69s
```

### Comparison
- Tests added: 1
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/work.test.ts`: "getWorkStatus returns clean workBranch for worktree-checked-out branch" — creates a real worktree with a build report artifact, calls `getWorkStatus({ json: true })` from the main tree, asserts `workBranch` is `'feature/test-slug'` (no `+` prefix) and `stage` is `'ready-for-verify'`.

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
6ccd57b [fix-worktree-branch-parsing] Add worktree integration test and cleanup
f566d02 [fix-worktree-branch-parsing] Fix branch marker stripping for worktree-checked-out branches
```

## Open Issues

- Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.
- Pre-existing test errors in proof chain tests (F004 already promoted, F999 not found, pathspec mismatch) — not introduced by this build. These appear in test output but don't cause test failures.

Verified complete by second pass.
