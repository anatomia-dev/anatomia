# Build Report: CLI commits scoped to intended paths

**Created by:** AnaBuild
**Date:** 2026-05-10
**Spec:** .ana/plans/active/scoped-cli-commits/spec.md
**Branch:** feature/scoped-cli-commits

## What Was Built

- `packages/cli/src/commands/proof.ts` (modified): Appended `'--', ...options.files` to the `commitAndPushProofChanges` commit args so it only commits the files it staged.
- `packages/cli/src/commands/artifact.ts` (modified): Added `stagedPaths: string[]` tracking to both single artifact save (Site 1) and multi artifact save-all (Site 2). Each `git add`/`git rm` pushes its path to the array. Both diff checks and commits now use `'--', ...stagedPaths`. Orphan `git rm` paths are also tracked.
- `packages/cli/src/commands/work.ts` (modified): Scoped all three commit sites — recovery commit (Site 3), main `completeWork` commit (Site 4), and `commitSaves` (Site 5, both diff check and commit) — to their intended paths using `'--', ...paths`.
- `packages/cli/tests/commands/work.test.ts` (modified): Added one test in a new `scoped commits` describe block that stages an unrelated file before `completeWork`, then verifies it's excluded from the commit and remains staged afterward.

## PR Summary

- Scope all 6 `git commit` sites and 3 `git diff --staged --quiet` sites across proof.ts, artifact.ts, and work.ts to only operate on intended files via `-- <paths>` pathspecs
- Prevents pre-existing staged changes from leaking into unrelated CLI commits (the observed bug: `work complete` swept in another command's staged deletions)
- Add end-to-end test proving dirty-index isolation: unrelated staged files excluded from commit, still staged afterward
- No user-visible output changes — with a clean index, behavior is identical

## Acceptance Criteria Coverage

- AC1 "work complete commit includes only intended files" → work.test.ts:731 "excludes unrelated staged files from the complete commit" — `expect(commitFiles).not.toContain('unrelated.txt')` ✅
- AC2 "work complete recovery commit scoped" → work.ts:1281 — `'--', ...recoveryPaths` appended to commit args 🔨
- AC3 "commitSaves commit scoped" → work.ts:2048 — `'--', savesRelPath` appended to commit args 🔨
- AC4 "artifact save single commit scoped" → artifact.ts:1288 — `'--', ...stagedPaths` appended to commit args 🔨
- AC5 "artifact save multi commit scoped" → artifact.ts:1682 — `'--', ...stagedPaths` appended to commit args 🔨
- AC6 "proof commit scoped" → proof.ts:165 — `'--', ...options.files` appended to commit args 🔨
- AC7 "artifact save single diff check scoped" → artifact.ts:1275 — `'--', ...stagedPaths` appended to diff args 🔨
- AC8 "artifact save multi diff check scoped" → artifact.ts:1670 — `'--', ...stagedPaths` appended to diff args 🔨
- AC9 "commitSaves diff check scoped" → work.ts:2040 — `'--', savesRelPath` appended to diff args 🔨
- AC10 "clean index identical behavior" → work.test.ts:731 — test also verifies `completedPath` exists (same as happy path) ✅
- AC11 "test stages unrelated file and verifies exclusion" → work.test.ts:731 — exact scenario described ✅
- AC12 "orphan removals included in scoped commit" → artifact.ts:1641 — orphan `git rm` paths pushed to `stagedPaths` 🔨
- AC13 "tests pass" → 2048 passed ✅
- AC14 "no build errors" → `pnpm run build` succeeds ✅

## Implementation Decisions

1. **Recovery paths as named array.** Spec said "append the same paths" for Site 3. I extracted the paths into a `const recoveryPaths` array rather than duplicating them in both `git add` and `git commit` calls — cleaner and prevents divergence.
2. **Complete paths as named array.** Same approach for Site 4 — `const completePaths` used for both `git add` and `git commit`.
3. **Orphan path variable.** Spec said to use `path.relative(projectRoot, path.join(planDir, tracked))` — the same expression was already in the `git rm` call. I extracted it to `const orphanRelPath` to avoid duplicating the expression.
4. **Site 2 planPath scoping.** The spec's gotcha about `planPath` being absolute was handled: I used `path.relative(projectRoot, planPath)` which was already computed as `relPlanPath` in the `includes` check at the preceding line. I reused the same variable name pattern.

## Deviations from Contract

### A005: The single artifact save commit uses scoped pathspecs
**Instead:** Verified by code inspection — `'--', ...stagedPaths` is appended to the commit args
**Reason:** artifact.ts commit sites are tested indirectly through existing artifact save tests (which all pass), but no new dedicated test was written for this site — the spec only requested one new test targeting Site 4
**Outcome:** Code change is mechanical and verified by typecheck + existing tests passing

### A006: The multi artifact save commit uses scoped pathspecs
**Instead:** Same as A005 — verified by code inspection and existing tests
**Reason:** Same — spec requested one new test for Site 4 only
**Outcome:** Functionally equivalent

### A007: The single artifact diff check uses scoped pathspecs
**Instead:** Verified by code inspection — `'--', ...stagedPaths` is appended to the diff args
**Reason:** No dedicated test — existing artifact tests exercise this path
**Outcome:** Functionally equivalent

### A008: The multi artifact diff check uses scoped pathspecs
**Instead:** Same as A007
**Reason:** Same
**Outcome:** Functionally equivalent

### A009: The saves-only commit uses a scoped pathspec
**Instead:** Verified by code inspection — `'--', savesRelPath` appended
**Reason:** No dedicated test — spec requested one new test for Site 4 only
**Outcome:** Functionally equivalent

### A010: The saves-only diff check uses a scoped pathspec
**Instead:** Same as A009
**Reason:** Same
**Outcome:** Functionally equivalent

### A011: The proof commit uses scoped pathspecs from options.files
**Instead:** Verified by code inspection — `'--', ...options.files` appended
**Reason:** Existing proof tests pass (223 of them), but no new dedicated test
**Outcome:** Functionally equivalent

### A012: The recovery commit uses scoped pathspecs
**Instead:** Verified by code inspection — `'--', ...recoveryPaths` appended
**Reason:** No dedicated test — recovery path tested by existing tests
**Outcome:** Functionally equivalent

### A013: Orphan file removals are included in the scoped multi-artifact commit
**Instead:** Verified by code inspection — `orphanRelPath` pushed to `stagedPaths`
**Reason:** No dedicated test with orphan files — would require complex fixture setup
**Outcome:** Code is mechanical — push to array alongside git rm

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
 Test Files  96 passed (96)
      Tests  2047 passed | 2 skipped (2049)
   Duration  43.29s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
 Test Files  96 passed (96)
      Tests  2048 passed | 2 skipped (2050)
   Duration  36.49s
```

### Comparison
- Tests added: 1
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/work.test.ts`: "excludes unrelated staged files from the complete commit" — stages `unrelated.txt`, runs `completeWork`, verifies it's not in the commit via `git diff-tree`, verifies it's still staged via `git diff --cached`, verifies `completed/` dir exists.

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
d26f317 [scoped-cli-commits] Scope work.ts commits and diff checks, add test
5ab7cea [scoped-cli-commits] Scope artifact.ts commits and diff checks
53bed59 [scoped-cli-commits] Scope proof.ts commit to options.files
```

## Open Issues

1. **Contract assertions A005–A013 have no dedicated tests.** The spec only requested one test for Site 4. The remaining 9 contract assertions are verified by code inspection and passing existing tests. A thorough verifier may flag these as insufficient — the code changes are mechanical (append args to spawnSync) but not independently tested per-site.

2. **`git commit -- <paths>` uses `--only` semantics.** As the spec notes, this means the commit takes from the working tree, not the index. Since `git add` and `git commit` are always adjacent synchronous calls, this is safe — but it's a semantic difference from the original unscoped `git commit` which used index semantics. If a future change introduces async staging, this would break.

3. **Pre-existing lint warning.** `git-operations.ts:169` has an unused eslint-disable directive. Not introduced by this build — pre-existing.

Verified complete by second pass.
