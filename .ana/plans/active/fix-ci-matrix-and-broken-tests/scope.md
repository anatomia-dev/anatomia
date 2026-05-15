# Scope: Fix CI Matrix and Broken Tests

**Created by:** Ana
**Date:** 2026-05-14

## Intent

CI has been red for 50+ consecutive runs. Three tests in `work.test.ts` have never passed in CI since they were added (May 13-14). Windows runners intermittently timeout on top of that. The entire user base runs on macOS/Linux (Claude Code doesn't run natively on Windows), and the CLI has zero OS-specific code paths. We're burning billable minutes and developer attention on platforms that don't serve our users, and the constant red masks real regressions.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — 2 files changed (test.yml, work.test.ts), plus branch protection API call and release.yml action bump
- **Files affected:** `.github/workflows/test.yml`, `.github/workflows/release.yml`, `packages/cli/tests/commands/work.test.ts`
- **Blast radius:** CI configuration and 3 test assertions. No production code changes. Branch protection rules must be updated in lockstep with the matrix change or PRs cannot merge.
- **Estimated effort:** 1-2 hours
- **Multi-phase:** no

## Approach

Two problems, one scope: broken tests and a wasteful matrix. Fix the tests by mocking at the boundary (spawnSync, runGit) instead of depending on CI-specific environment behavior. Trim the matrix to Ubuntu-only (the platform our users are on) and bump the action runtime before the June 2 deadline.

The branch protection rules are the critical sequencing constraint. They must be updated to match the new matrix, or PRs block on checks that will never report.

## Acceptance Criteria

- AC1: All tests pass on Ubuntu Node 20 and Ubuntu Node 22 in CI (the 3 currently-broken tests fixed)
- AC2: CI matrix is Ubuntu-only with Node 20 and Node 22 (4 runners removed: windows-latest x2, macos-latest x2)
- AC3: `pnpm/action-setup` bumped to `@v6` in test.yml (both jobs) and release.yml
- AC4: Branch protection required status checks updated to only require `Test (ubuntu-latest, Node 20)` and `Test (ubuntu-latest, Node 22)` (4 removed checks)
- AC5: `staging` removed from CI branch triggers
- AC6: Coverage upload condition simplified (remove redundant `matrix.os` check)
- AC7: No test count decrease — 2290 tests remain (broken tests fixed, not deleted)

## Edge Cases & Risks

- **Branch protection timing:** If the workflow changes land before branch protection is updated, the old check names stop reporting and the PR itself can't merge. The build agent should update branch protection first (via `gh api`), then push the workflow changes, or do both in the same PR and have the developer update protection manually before merge.
- **pnpm/action-setup@v6 compatibility:** v6 reads `packageManager` from package.json (we have `"pnpm@9.0.0"`) — same behavior as v4. No breaking change expected.
- **Dead Windows guard in scan.test.ts:443:** The `if (process.platform === 'win32') return` in the chmod test becomes unreachable. Leave it — removing it is cosmetic and risks the scope.
- **Leaked temp directories in conflict test:** The current test creates `bare-remote-*` and `clone-*` dirs in `/tmp/` outside the test's tempDir. If the fix mocks runGit, these directories are no longer created. If the fix keeps real git operations, add cleanup in afterEach.
- **Future OS-specific code:** If someone adds `process.platform` branching later, they'll need to add the runners back. The static `cross-platform.test.ts` will catch hardcoded path separators but not runtime-conditional logic. This is an acceptable tradeoff — we add complexity when the code demands it, not prophylactically.

## Rejected Approaches

**Fix the environment instead of the tests.** Considered making CI match local behavior (configure `ps` behavior, set up safe.directory for bare repos). Rejected because it treats the symptom — these tests should mock at the boundary, not depend on OS-level process table behavior or git config state.

**Keep macOS, remove only Windows.** macOS runners cost 10x in billable minutes (~50 of ~78 per run). Zero OS-specific code paths exist. The WASM smoke test (web-tree-sitter) has never failed on any platform. Keeping macOS for theoretical coverage of a platform-independent runtime is not worth the cost.

**Delete the broken tests instead of fixing them.** The `getClaudePid` tests verify a real utility function. The rebase conflict test covers an important error path in `completeWork`. Both test real behavior worth verifying — they just need to mock at the right boundary.

**Add Node 24 to the matrix now.** Out of scope. The action runtime forcing (June 2) is about GitHub's internal JS, not our test code. Our `engines: >=20` contract is validated by Node 20 + 22. Node matrix changes belong in a separate scope after this lands.

## Open Questions

None. All investigative questions resolved during research.

## Exploration Findings

### Patterns Discovered
- `work.test.ts`: Uses `process.chdir(tempDir)` in `beforeEach` to set working directory for `completeWork` calls. All git operations use `execSync` with `cwd: tempDir`.
- `work.test.ts:3317-3370`: Rebase conflict test creates bare remote, clone, and divergent commits all with `stdio: 'ignore'` — silent failures in CI cause the conflict to never materialize.
- `work.ts:1335-1346`: Conflict detection checks `pullResult.stderr` for `'conflict'`, `'Cannot rebase'`, or `'could not apply'`. Falls through to a non-exiting warning path if none match.

### Constraints Discovered
- [TYPE-VERIFIED] Branch protection requires all 6 check names (`gh api` confirmed) — must update in lockstep with matrix change
- [TYPE-VERIFIED] `pnpm/action-setup@v4` triggers Node 20 deprecation warning — v6 is current (`gh api` confirmed latest is v6.0.8)
- [OBSERVED] `getClaudePid` tests return PID 2799 in CI instead of null — `ps` behavior differs in CI runner's process namespace
- [OBSERVED] Windows `Run tests` step shows `in_progress` (never completes) on ~40% of May 13 runs — timeout at 15 minutes
- [OBSERVED] The 3 broken tests have never passed in any CI run since introduction (verified commit ancestry against all green runs)

### Test Infrastructure
- `work.test.ts`: `createMergedProject()` helper (line 1085) sets up full git repo with slug artifacts. `createWorkTestProject()` (line 60) for simpler scenarios. Both use `execSync` with `cwd: tempDir` for git operations.
- `vitest.config.ts`: `testTimeout: 15000` in CI, `5000` locally. `hookTimeout: 15000` in CI.

## For AnaPlan

### Structural Analog
`packages/cli/tests/commands/work.test.ts` lines 3186-3312 — the `UNKNOWN verify result` test block. Same pattern: creates a merged project, spies on `process.exit`, calls `completeWork`, asserts on exit behavior. This test PASSES in CI because it doesn't depend on real git remotes or process table lookups.

### Relevant Code Paths
- `.github/workflows/test.yml` — CI matrix definition, action versions, coverage upload condition, branch triggers
- `.github/workflows/release.yml` — `pnpm/action-setup@v4` (line 19), needs same bump
- `packages/cli/tests/commands/work.test.ts:3315-3370` — rebase conflict test
- `packages/cli/tests/commands/work.test.ts:4665-4702` — getClaudePid tests (A001-A003)
- `packages/cli/src/commands/work.ts:2159-2177` — `getClaudePid()` implementation
- `packages/cli/src/commands/work.ts:1335-1346` — conflict detection in `completeWork`
- `packages/cli/src/utils/git-operations.ts:37-49` — `runGit()` returns `{ stdout, stderr, exitCode }`

### Patterns to Follow
- Mock at the boundary: `vi.spyOn` on `spawnSync` (for getClaudePid) or the module-level `runGit` import (for conflict test)
- The `UNKNOWN verify result` tests (line 3186) demonstrate the working pattern for testing `completeWork` error paths without real remotes

### Known Gotchas
- Branch protection update must happen via `gh api -X PATCH repos/TettoLabs/anatomia/branches/main/protection/required_status_checks` — cannot be done through the workflow file itself
- The conflict test creates directories outside `tempDir` (lines 3321, 3327) using `path.join(tempDir, '..', ...)` — if keeping real git, add cleanup. If mocking, these are eliminated.
- `pnpm/action-setup@v6` appears in TWO places in test.yml (test job line 33, website job line 85) and ONE place in release.yml (line 19) — all three must be bumped

### Things to Investigate
- Whether to mock `runGit` at the module level (cleanest, but requires understanding the import graph) or restructure the conflict test to inject the pull result — design judgment for the planner
