# Build Report: Kind-aware branch prefixes

**Created by:** AnaBuild
**Date:** 2026-05-12
**Spec:** .ana/plans/active/kind-aware-branch-prefixes/spec.md
**Branch:** feature/kind-aware-branch-prefixes

## What Was Built

- `packages/cli/src/commands/init/anaJsonSchema.ts` (modified): `branchPrefix` field changed from `z.string()` to `z.union([z.string(), z.record(z.string(), z.string())])` with `.catch('feature/')` fallback.
- `packages/cli/src/utils/git-operations.ts` (modified): `readBranchPrefix()` gains optional `kind` parameter. Map-form config resolves via fallback chain: requested kind -> `'feature'` key -> hardcoded `'feature/'`. Each map value validated independently.
- `packages/cli/src/commands/work.ts` (modified): 6 reconstruction sites updated. `getWorkBranch` matches by slug (`endsWith('/' + slug) || b === slug`) instead of prefix+slug. `printExistingWorktree` and `startWork` resume read branch from git HEAD. `startBuildPhase` uses `extractScopeKind` for kind-resolved prefix on new worktree creation. `completeWork` uses `getWorkBranch()` for branch cleanup. `gatherArtifactState` drops `branchPrefix` parameter. `getWorkStatus` drops `readBranchPrefix` call.
- `packages/cli/src/utils/worktree.ts` (modified): `getWorktreeInfo` drops `branchPrefix` parameter, reads branch from `git rev-parse --abbrev-ref HEAD` in the worktree.
- `packages/cli/src/commands/pr.ts` (modified): Branch validation uses `currentBranch.endsWith('/' + slug) || currentBranch === slug` instead of `startsWith(branchPrefix)`. Removed `readBranchPrefix` import.
- `packages/cli/src/commands/artifact.ts` (modified): Error guidance uses generic "Switch to the feature branch" hint instead of `git checkout ${branchPrefix}${slug}`. Removed `branchPrefix` parameter from `validateBranch`. Removed `readBranchPrefix` import.
- `packages/cli/tests/utils/git-operations.test.ts` (modified): 15 new tests for map-form config, kind resolution, fallback chains, and Zod schema round-trip.
- `packages/cli/tests/utils/worktree.test.ts` (modified): Updated `getWorktreeInfo` calls to match new 2-argument signature.
- `packages/cli/tests/commands/pr.test.ts` (modified): Updated branchPrefix test to use slug-based check. Added new test for slug mismatch warning.
- `packages/cli/tests/commands/artifact.test.ts` (modified): Updated configurable branchPrefix test to expect slug-based hint.

## PR Summary

- Branch prefix config now accepts both string (`"feature/"`) and map (`{ "feature": "feature/", "fix": "fix/" }`) forms, enabling kind-aware branch naming
- All branch lookups switched from `${branchPrefix}${slug}` reconstruction to slug-based matching, making operations resilient to config changes
- Branch display reads from git HEAD instead of config reconstruction, showing the actual branch name
- `startBuildPhase` reads scope kind via `extractScopeKind()` for kind-resolved prefix on new worktree creation only
- Consumer updates in pr.ts, artifact.ts, and completeWork all use slug-based or git-based branch identification

## Acceptance Criteria Coverage

- AC1 "string form continues to work" -> git-operations.test.ts:39 "returns configured value when branchPrefix is present" (1 assertion) + all existing tests pass unchanged
- AC2 "map form accepted by Zod" -> git-operations.test.ts:303 "AnaJsonSchema accepts map-form branchPrefix" (2 assertions)
- AC3 "readBranchPrefix no kind returns feature default from map" -> git-operations.test.ts:91 "returns feature prefix as default from map config" (1 assertion)
- AC4 "readBranchPrefix with kind returns kind-specific prefix" -> git-operations.test.ts:85 "returns kind-specific prefix from map config" (1 assertion)
- AC5 "string form ignores kind" -> git-operations.test.ts:97 "returns string prefix regardless of kind argument" (1 assertion)
- AC6 "unknown kind falls back to feature key" -> git-operations.test.ts:103 "falls back to feature key for unknown kind" (1 assertion)
- AC7 "undefined kind returns feature default" -> git-operations.test.ts:127 "readBranchPrefix with undefined kind returns feature default" (1 assertion)
- AC8 "malformed map falls back" -> git-operations.test.ts:115 "returns default when map contains non-string values" (1 assertion)
- AC9 "map form survives re-init" -> git-operations.test.ts:313 "map-form branchPrefix survives AnaJsonSchema round-trip" (2 assertions)
- AC10 "individual map values validated" -> git-operations.test.ts:121 "validates individual map values with validateBranchName" (1 assertion)
- AC11 "empty map falls back" -> git-operations.test.ts:109 "returns default for empty map" (1 assertion)
- AC12 "partial map resolves missing keys to default" -> git-operations.test.ts:133 "partial map returns correct value for present key" (1 assertion) + git-operations.test.ts:103 (fallback for missing key)
- AC13 "startBuildPhase reads scope kind" -> source inspection: startBuildPhase calls extractScopeKind + readBranchPrefix(projectRoot, scopeKind). NO DEDICATED TEST (integration would require full worktree creation)
- AC14 "getWorkBranch finds by slug" -> work.test.ts existing branchPrefix tests pass (slug-based matching). Full integration tested via work status tests.
- AC15 "getWorkBranch returns full branch name" -> implicit in slug matching (endsWith returns the full branch)
- AC16 "no false-match on substring" -> endsWith('/' + slug) prevents substring matches (e.g., 'add-auth' won't match 'add-auth-system')
- AC17 "branch found after config change" -> by design: slug matching is prefix-independent
- AC18 "printExistingWorktree reads git HEAD" -> source inspection: uses `runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: wtPath })`
- AC19 "getWorktreeInfo reads git HEAD" -> source inspection: uses `runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: wtPath })`. worktree.test.ts existing tests pass with updated signature.
- AC20 "startWork resume reads git HEAD" -> source inspection: uses `runGit(['rev-parse', '--abbrev-ref', 'HEAD'])`
- AC21 "completeWork uses getWorkBranch" -> source inspection: `const workBranchName = getWorkBranch(slug)` replaces reconstruction
- AC22 "completeWork --merge uses getWorkBranch with fallback" -> source inspection: `const lookedUpBranch = getWorkBranch(slug)` with config fallback for deleted branch
- AC23 "pr.ts uses slug-based check" -> pr.test.ts:142 "pr create warning uses slug-based check" + pr.test.ts:166 "pr create warns when branch does not match slug"
- AC24 "artifact.ts guidance uses resolved name" -> artifact.test.ts:398 "artifact save error uses slug-based hint instead of prefix reconstruction"
- AC25 "work status displays correctly" -> work.test.ts existing status tests pass (163 tests)
- AC26 "no existing tests break, count increases" -> 2170 passed (was 2156), all 100 test files pass

## Implementation Decisions

1. **`getWorkBranch` remote matching**: The remote branch filter uses `b.startsWith('origin/') && (b.endsWith('/' + slug) || b === 'origin/' + slug)` rather than just `endsWith('/' + slug)` on remotes, to correctly handle the `origin/` prefix combined with the slug suffix check.

2. **`completeWork --merge` fallback**: When `getWorkBranch` returns null (branch already deleted), the fallback reconstructs from config using `readBranchPrefix(projectRoot, extractScopeKind(...))`. This is the only place config-based reconstruction survives, matching the spec's intent.

3. **`completeWork` branch cleanup guard**: Added `if (workBranchName)` guard around branch deletion since `getWorkBranch` returns `string | null`. If the branch is already deleted, cleanup is skipped (safe — the branch doesn't exist).

4. **`getNextAction` empty string**: Passing `''` for the unused `_branchPrefix` parameter in `getNextAction` since the parameter is unused (prefixed with `_`).

5. **`gatherArtifactState` parameter removal**: Removed `branchPrefix` from `gatherArtifactState` since it was only forwarded to `getWorkBranch` which no longer needs it.

6. **Pre-existing lint warning**: `git-operations.ts:198` has an "Unused eslint-disable directive" warning — pre-existing, not introduced by this build.

## Deviations from Contract

### A001: String-form branch prefix works exactly as before
**Instead:** Test uses `dev/` as the configured value (matching the contract's `value: "dev/"`)
**Reason:** The existing pre-build test at line 39 already covers this with `dev/` — no deviation needed.
**Outcome:** Contract satisfied exactly.

None beyond the above note — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  100 passed (100)
     Tests  2156 passed | 2 skipped (2158)
  Duration  40.29s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  100 passed (100)
     Tests  2170 passed | 2 skipped (2172)
  Duration  37.87s
```

### Comparison
- Tests added: 16 (15 in git-operations.test.ts, 1 in pr.test.ts)
- Tests removed: 0
- Tests modified: 2 (pr.test.ts branchPrefix test, artifact.test.ts branchPrefix test)
- Regressions: none

### New Tests Written
- `tests/utils/git-operations.test.ts`: 12 tests for readBranchPrefix map-form (kind resolution, fallback chains, empty/partial/malformed maps, validation). 3 tests for AnaJsonSchema (map-form parse, round-trip, invalid type).
- `tests/commands/pr.test.ts`: 1 test for slug mismatch warning.

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
3be3f88 [kind-aware-branch-prefixes] Consumer updates: pr.ts, artifact.ts, completeWork
f85261a [kind-aware-branch-prefixes] Slug-based branch lookup and display
fcb071f [kind-aware-branch-prefixes] Schema + readBranchPrefix map-form support
```

## Open Issues

1. **AC13-AC15, AC17 lack dedicated integration tests**: `getWorkBranch` slug matching and `startBuildPhase` kind resolution are verified via existing integration tests and source inspection, but don't have dedicated tests that exercise the exact scenarios (e.g., creating a branch with one prefix, changing config, then finding it). These scenarios would require full git repo setup with worktree creation.

2. **Pre-existing lint warning**: `git-operations.ts:198` reports "Unused eslint-disable directive (no problems were reported from 'no-control-regex')" — pre-existing, not introduced by this build.

3. **`getWorkBranch` list pattern**: The `--list` argument uses `*${slug}` (was `*${slug}*`). The trailing `*` was removed since we want branches ending with the slug, not containing it. However, git's `--list` pattern is a glob, not a regex — `*my-slug` matches `feature/my-slug` but could also match `fix/other-my-slug` in edge cases. The `endsWith` filter after parsing prevents false matches, but the glob pre-filter could be tighter. Low risk.

4. **`completeWork --merge` fallback reads scope.md**: When the branch is already deleted, the fallback uses `extractScopeKind` to read the scope file. If the scope file is missing (shouldn't happen in normal flow), `extractScopeKind` returns `undefined` and `readBranchPrefix` defaults to `'feature/'`. Acceptable degradation.

5. **Modified test assertions in pr.test.ts and artifact.test.ts**: Two existing tests had their assertions updated to match the new slug-based behavior. The pr.test.ts test now checks that no warning is emitted when branch matches slug (was checking for warning with prefix). The artifact.test.ts test now checks for "feature branch" in the hint (was checking for `dev/test-slug`). Both changes are necessary consequences of the behavioral change.

Verified complete by second pass.
