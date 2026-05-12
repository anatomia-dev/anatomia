# Scope: Worktree test infrastructure

**Created by:** Ana
**Date:** 2026-05-12

## Intent

The `+` prefix parsing bug shipped because no test exercised `git worktree add` through the `work status` flow. The test helper `createWorkTestProject` in `work.test.ts` creates branches with `git checkout -b` — which produces the `* ` prefix (current branch), not the `+ ` prefix (worktree branch). The worktree-specific `git branch` output never appeared in any test. This scope adds worktree support to the test helper so that future worktree-related changes are tested against real git worktree output, not simulated branches.

## Complexity Assessment
- **Kind:** chore
- **Size:** small — extends one test helper, adds a few tests that exercise the new capability
- **Files affected:**
  - `packages/cli/tests/commands/work.test.ts` — extend `createWorkTestProject` to support `worktree: true` option; add tests exercising the worktree path through `getWorkStatus`
- **Blast radius:** None for production code. Test-only change. Existing tests are unaffected — the new `worktree` option is additive. When not specified, the helper behaves identically to today.
- **Estimated effort:** ~30 minutes
- **Multi-phase:** no

## Approach

Extend `createWorkTestProject` with an optional `worktree: true` flag on each slug. When set, instead of `git checkout -b {prefix}{slug}`, the helper does `git worktree add .ana/worktrees/{slug} -b {prefix}{slug}` — then writes feature artifacts inside the worktree, commits from the worktree, and returns to the main tree. The cleanup in `afterEach` already handles worktree removal (there's a `git worktree list --porcelain` + `git worktree remove --force` pattern at line 3954-3966 in the existing test file).

This mirrors what `worktree.test.ts` already does (line 103: `execSync('git worktree add ...')`) but integrates it into the `work.test.ts` helper so status-flow tests can exercise the real worktree code path.

Then add tests that use the new flag to verify:
1. `getWorkBranch` returns a clean branch name (no `+` prefix) when a worktree is active
2. Stage detection works correctly when build/verify reports exist on a worktree branch
3. `work status` shows worktree info (path, commit count, behind-count) for worktree-created branches

These tests serve as regression guards — if anyone changes the branch parsing again, these tests catch the `+` prefix issue before it ships.

## Acceptance Criteria

- AC1: `createWorkTestProject` accepts `worktree: true` on slug options — creates a real `git worktree add` instead of `git checkout -b`
- AC2: When `worktree: true`, feature artifacts are written inside the worktree directory and committed from the worktree's working tree
- AC3: After worktree creation, the helper returns control on the artifact branch (main tree), same as the current `git checkout` flow
- AC4: Existing tests that don't use `worktree: true` are completely unaffected — identical behavior
- AC5: At least one test uses `worktree: true` to verify that `getWorkBranch` returns a clean branch name when a worktree is active
- AC6: At least one test uses `worktree: true` to verify that stage detection is correct (not stuck at `build-in-progress`) when build reports exist on a worktree branch
- AC7: The `afterEach` cleanup properly removes worktrees created by the helper (no stale worktrees left between tests)
- AC8: No existing tests break. Test count increases.

## Edge Cases & Risks

- **Worktree cleanup between tests.** `git worktree add` registers a worktree that git tracks. If cleanup fails, subsequent tests in the same file may see stale worktrees. The existing cleanup pattern at line 3954-3966 handles this with `git worktree list --porcelain` + `git worktree remove --force`. The same pattern should be applied in the top-level `afterEach` if it isn't already.
- **Worktree path inside `.ana/worktrees/`.** The helper should create worktrees at `.ana/worktrees/{slug}` (matching production behavior), not at an arbitrary path. This ensures `worktreeExists` and `getWorktreePath` work correctly in tests.
- **Cross-platform.** `git worktree add` works on all platforms (macOS, Linux, Windows). No platform-specific concerns.
- **Test isolation.** Each test creates a fresh `tempDir`. Worktrees are inside that temp directory. No interference between tests.

## Rejected Approaches

- **Mocking `git branch -a` output instead of creating real worktrees.** Would be faster but defeats the purpose — the whole point is to test against real git output so format changes (like the `+` prefix) are caught. Mocking the output means we'd have to know the format in advance, which is what we got wrong.
- **Shared test utility file for worktree creation.** `worktree.test.ts` has its own `createTestProject` helper, and `work.test.ts` has `createWorkTestProject`. Merging them into a shared utility is a refactor that's out of scope. The helpers serve different purposes (one tests utility functions, the other tests the status/complete flow). Extending each independently is simpler.
- **Making `createWorkTestProject` always use worktrees.** Would break the simplicity of existing tests that don't need real worktrees. The `checkout -b` path is fine for testing status display and stage detection when worktree output isn't the concern. The `worktree: true` flag is opt-in.

## Open Questions

- **Should the worktree-created tests also verify `commitsBehind`?** The freshness detection scope added `commitsBehind` to `getWorktreeInfo`. A worktree test could verify that `commitsBehind` works against a real worktree (not just a simulated one). This would be a bonus test, not a requirement for this scope. AnaPlan should decide.

## Exploration Findings

### Patterns Discovered
- `work.test.ts:83-96`: The current `featureBranch` flow: `git checkout -b {prefix}{slug}` → write artifacts → `git add -A && git commit` → `git checkout {artifactBranch}`. The worktree equivalent: `git worktree add .ana/worktrees/{slug} -b {prefix}{slug}` → write artifacts in worktree path → `git -C {wtPath} add -A && git -C {wtPath} commit` → no checkout needed (main tree stays on artifact branch).
- `work.test.ts:3954-3966`: Existing worktree cleanup in `afterEach` for one specific test section. Uses `git worktree list --porcelain` to find worktrees, then `git worktree remove --force` for each. This pattern should be lifted to the top-level `afterEach` so all tests get cleanup.
- `worktree.test.ts:27-54`: A cleaner cleanup pattern — the top-level `afterEach` handles all worktrees. This is the model to follow.
- `worktree.test.ts:100-104`: Real worktree creation in tests — `execSync('git worktree add "${wtPath}" -b feature/test-slug')`. The pattern works and has been stable across 80+ pipeline runs.

### Constraints Discovered
- [OBSERVED] `createWorkTestProject`'s `featureBranch: true` path at line 83-96 uses `git checkout -b` then `git checkout {artifactBranch}` to return. With worktrees, there's no checkout needed — the main tree stays on the artifact branch throughout. The control flow is simpler.
- [OBSERVED] Feature artifacts written in the worktree path need `git -C {wtPath}` for add/commit instead of `cwd: tempDir`. Or `execSync('git add -A && git commit...', { cwd: wtPath })`.
- [OBSERVED] The top-level `afterEach` at line 20-28 does `fs.rm(tempDir, ...)` but doesn't do `git worktree remove`. If a worktree is active, `fs.rm` might fail on locked files. The cleanup should remove worktrees first, then the directory.

### Test Infrastructure
- This IS the test infrastructure scope — no existing infrastructure to reference.

## For AnaPlan

### Structural Analog
`packages/cli/tests/commands/work.test.ts:83-96` — the existing `featureBranch: true` path in `createWorkTestProject`. The `worktree: true` path follows the same structure (create branch, write artifacts, commit) but uses `git worktree add` instead of `git checkout -b`.

### Relevant Code Paths
- `packages/cli/tests/commands/work.test.ts:33-99` — `createWorkTestProject` helper (the extension point)
- `packages/cli/tests/commands/work.test.ts:20-28` — `afterEach` cleanup (needs worktree-aware cleanup)
- `packages/cli/tests/commands/work.test.ts:3954-3966` — existing worktree cleanup pattern (to lift or reference)
- `packages/cli/tests/utils/worktree.test.ts:27-54` — cleaner worktree cleanup pattern (model)
- `packages/cli/tests/utils/worktree.test.ts:100-104` — real worktree creation in tests (pattern)

### Patterns to Follow
- `worktree.test.ts:27-54` for `afterEach` cleanup with `git worktree list --porcelain`
- `worktree.test.ts:100-104` for `git worktree add` in temp directories
- `work.test.ts:83-96` for the existing `featureBranch` helper flow (the pattern to mirror)

### Known Gotchas
- **`git worktree add` requires a commit to exist.** The `createWorkTestProject` helper already makes an initial commit at line 62. The worktree creation must happen after that.
- **Worktree artifacts live at a different filesystem path.** With `checkout -b`, artifacts are at `tempDir/.ana/plans/active/{slug}/`. With a worktree, artifacts in the worktree are at `tempDir/.ana/worktrees/{slug}/.ana/plans/active/{slug}/`. The helper must write to the worktree path when `worktree: true`.
- **`afterEach` ordering matters.** `git worktree remove` must run before `fs.rm(tempDir)`. If the directory is removed first, git's worktree metadata becomes orphaned and subsequent `git worktree prune` calls in other tests might produce warnings.

### Things to Investigate
- Whether the top-level `afterEach` at line 20-28 needs the worktree cleanup pattern from line 3954-3966, or whether `fs.rm(tempDir, { force: true, recursive: true })` handles worktree directories on all platforms.
