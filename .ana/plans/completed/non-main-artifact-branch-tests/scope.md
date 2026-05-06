# Scope: Non-Main Artifact Branch Tests

**Created by:** Ana
**Date:** 2026-05-06

## Intent
Every test assumes the artifact branch is `main`. The `artifactBranch` field in `ana.json` supports any branch name, and the runtime code reads it correctly via `readArtifactBranch()` — but zero tests exercise a non-main value. A team using `develop` as their artifact branch hits untested code paths in `work start`, `artifact save`, `work complete`, `work status`, and `proof` commands. Add parameterized tests proving non-main values work, and fix a display bug where init shows the git default branch instead of the configured artifact branch.

## Complexity Assessment
- **Size:** small
- **Files affected:** 3 (`tests/commands/work.test.ts`, `tests/commands/artifact.test.ts`, `src/commands/init/state.ts`)
- **Blast radius:** minimal — new tests only, plus a 1-line display fix
- **Estimated effort:** ~1 hour
- **Multi-phase:** no

## Approach
Add ~5-10 tests that pass `artifactBranch: 'develop'` to the existing test helpers, which already accept it as a parameter. The test infrastructure is ready — this is purely about exercising the non-main path. Fix the init display bug by reading from the already-available `anaConfig` parameter instead of `engineResult.git.defaultBranch`.

## Acceptance Criteria
- AC1: `startWork` works with `artifactBranch: 'develop'` — validates against `develop`, not `main`
- AC2: `getWorkStatus` correctly discovers slugs when artifact branch is `develop`
- AC3: `saveArtifact` for scope validates branch against `develop`
- AC4: `saveArtifact` for build-report validates against `develop` (must NOT be on `develop`)
- AC5: `completeWork` validates against `develop`
- AC6: Init display at `state.ts:634` shows the configured `artifactBranch`, not the git default branch
- AC7: All existing tests pass (no regression)
- AC8: Build succeeds, typecheck clean, lint clean

## Edge Cases & Risks
- **Empty `artifactBranch` in ana.json:** `readArtifactBranch()` at `git-operations.ts:79` already handles this — exits with error. No change needed.
- **`artifactBranch` that doesn't exist as a git branch:** Existing behavior — `git pull` and branch checks fail. Not in scope to change, but a test could verify the error is clear.
- **Parameterized tests hiding failures:** If `.each` is used, ensure test names include the branch value so failures are identifiable.

## Rejected Approaches
- **Full parameterization of ALL existing tests:** Overkill. The runtime code has a single code path — `readArtifactBranch()` returns whatever's in `ana.json`. One representative test per command function is sufficient to prove the config is respected.
- **Testing with exotic branch names (slashes, unicode):** `validateBranchName()` already has its own tests. The disease here is "non-main values untested," not "branch name validation untested."

## Open Questions
None.

## Exploration Findings

### Patterns Discovered
- `tests/commands/work.test.ts`: `createWorkTestProject()` helper (line 33) already accepts `artifactBranch` param, defaults to `'main'`, creates git repo with that branch name. Every call site passes no value or omits the field.
- `tests/commands/artifact.test.ts`: `createTestProject()` helper (line 33) already accepts `artifactBranch` and `currentBranch` params. Every call site passes `artifactBranch: 'main'`.
- `src/commands/init/state.ts:634`: `displaySuccessMessage()` receives `anaConfig` as a parameter (line 571). Line 638 already reads `anaConfig?.['commands']`. Line 634 ignores `anaConfig` and reads `engineResult.git.defaultBranch` instead.

### Constraints Discovered
- [TYPE-VERIFIED] `readArtifactBranch` (git-operations.ts:62) — reads `artifactBranch` from `.ana/ana.json`, exits on missing/empty. All pipeline commands use this function.
- [OBSERVED] Zero test files reference `artifactBranch: 'develop'` or any non-main value — confirmed via grep across entire test directory.
- [OBSERVED] `anaConfig` available in display function — `displaySuccessMessage` already receives the written `ana.json` config as its 4th parameter.

### Test Infrastructure
- `work.test.ts`: temp dir + real git repo per test, `createWorkTestProject()` helper handles full setup including feature branches
- `artifact.test.ts`: same pattern, `createTestProject()` helper with `artifactBranch`/`currentBranch`/`branchPrefix` options

## For AnaPlan

### Structural Analog
`tests/commands/work.test.ts` line 117–140 — the existing `startWork` tests. New tests follow the same shape, just pass `artifactBranch: 'develop'`.

### Relevant Code Paths
- `packages/cli/tests/commands/work.test.ts` — `createWorkTestProject()` at line 33, all test call sites lines 117–483
- `packages/cli/tests/commands/artifact.test.ts` — `createTestProject()` at line 33, all test call sites lines 206–1456
- `packages/cli/src/commands/init/state.ts` — display bug at line 634, `anaConfig` param at line 571
- `packages/cli/src/utils/git-operations.ts` — `readArtifactBranch()` at line 62

### Patterns to Follow
- Follow the existing test style in `work.test.ts` — individual `it()` blocks, not `.each()`, based on how the file is structured
- Use `artifactBranch: 'develop'` consistently as the non-main test value

### Known Gotchas
- `git branch -M {name}` in the test helper renames the initial branch. If `artifactBranch: 'develop'`, the repo's branch is `develop` — subsequent `git checkout main` would fail. The helpers already handle this correctly.
- `state.ts` line 634 fix must preserve the fallback chain for cases where `anaConfig` is undefined (the parameter is optional).

### Things to Investigate
- Decide between individual `it()` blocks vs. `describe.each`/`it.each` for the parameterized tests. The existing codebase uses individual blocks — consistency may win over compactness.
