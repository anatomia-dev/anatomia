# Build Report: Fix CI Matrix and Broken Tests

**Created by:** AnaBuild
**Date:** 2026-05-15
**Spec:** .ana/plans/active/fix-ci-matrix-and-broken-tests/spec.md
**Branch:** feature/fix-ci-matrix-and-broken-tests

## What Was Built

- `.github/workflows/test.yml` (modified): Reduced matrix from 3 OS x 2 Node (6 runners) to Ubuntu-only x 2 Node (2 runners). Removed `staging` from branch triggers. Bumped `pnpm/action-setup` from v4 to v6 in both test and website jobs. Simplified coverage upload condition to remove `matrix.os` check. Updated job name to use hardcoded `ubuntu-latest` string.
- `.github/workflows/release.yml` (modified): Bumped `pnpm/action-setup` from v4 to v6.
- `packages/cli/tests/commands/work-ci-mocked.test.ts` (created): New test file with 4 tests extracted from work.test.ts. Uses `vi.hoisted()` + `vi.mock('node:child_process')` pattern from work-merge.test.ts. getClaudePid tests mock `spawnSync` for `ps` command. Conflict test mocks `spawnSync` for `git pull --rebase` and adds a fake remote so the pull block isn't skipped.
- `packages/cli/tests/commands/work.test.ts` (modified): Removed 3 getClaudePid tests and 1 conflict test (moved to work-ci-mocked.test.ts). No other changes.
- `.claude/skills/deployment/SKILL.md` (modified): Updated CI matrix rule from "3 OS x 2 Node" to "2 runners: Ubuntu x Node 20, 22". Removed Windows path separator gotcha entirely.
- `packages/cli/ARCHITECTURE.md` (modified): Updated "Ubuntu/macOS/Windows x Node 20/22" to "Ubuntu x Node 20/22".
- `packages/cli/CONTRIBUTING.md` (modified): Updated two CI matrix references from "Ubuntu/macOS/Windows x Node 20/22" to "Ubuntu x Node 20/22".

## PR Summary

- Reduce CI matrix from 6 runners (3 OS x 2 Node) to 2 runners (Ubuntu x Node 20/22), eliminating wasteful Windows/macOS runners for a CLI with zero OS-specific code paths
- Bump `pnpm/action-setup` from v4 to v6 in all 3 workflow locations (test job, website job, release job) ahead of the June Node 20 deprecation deadline
- Extract 4 environment-dependent tests into `work-ci-mocked.test.ts` with mocked `spawnSync` — makes getClaudePid and conflict tests deterministic in CI
- Remove `staging` from branch triggers (branch doesn't exist on remote) and simplify coverage upload condition
- Update deployment skill, ARCHITECTURE.md, and CONTRIBUTING.md to reflect Ubuntu-only matrix

## Acceptance Criteria Coverage

- AC1 "All tests pass on Ubuntu Node 20 and Ubuntu Node 22" -> work-ci-mocked.test.ts: all 4 tests pass with mocked spawnSync (3 getClaudePid + 1 conflict) ✅
- AC2 "CI matrix is Ubuntu-only with Node 20 and Node 22" -> test.yml: `runs-on: ubuntu-latest`, `matrix: node-version: [20, 22]` ✅
- AC3 "pnpm/action-setup bumped to v6" -> test.yml lines 32, 84; release.yml line 19 — all `@v6` ✅
- AC4 "Branch protection required status checks updated" -> NO TEST (developer runs `gh api` command manually — documented in spec) 🔨
- AC5 "staging removed from CI branch triggers" -> test.yml: `branches: [main]` only ✅
- AC6 "Coverage upload condition simplified" -> test.yml: `if: matrix.node-version == 20` (no `matrix.os`) ✅
- AC7 "No test count decrease" -> 2297 passed, 2 skipped across 104 files (was 103 files) ✅
- AC8 "Documentation updated" -> SKILL.md, ARCHITECTURE.md, CONTRIBUTING.md all updated ✅

## Implementation Decisions

- **Mock return shape for spawnSync:** Included all required fields (`status`, `stdout`, `stderr`, `pid`, `output`, `signal`) to match the `SpawnSyncReturns` type. The existing work-merge.test.ts pattern only returns `{ status, stdout, stderr }` but this works because spawnSync consumers only read those fields.
- **Fake remote for conflict test:** Added `git remote add origin https://example.com/fake.git` after `createMergedProject` to ensure `completeWork`'s remote check at line 1243 passes. Without this, the pull block is skipped entirely and the mock never fires. The URL is unreachable but the mock intercepts the pull before any network call.
- **Console.log suppression in conflict test:** Added `console.log = () => {}` to suppress normal output during the test, keeping only `console.error` captures for assertion. The original test in work.test.ts didn't suppress console.log — this is cleaner.

## Deviations from Contract

### A001: Claude PID resolution returns a valid process ID when the process tree is available
**Instead:** Mock returns pid 12345 and test asserts `expect(pid).toBe(12345)` — the contract specifies `value: 12345` which matches exactly.
**Reason:** The original test used real `getClaudePid()` with a conditional guard (`if (pid !== null)`), making it a potential no-op in CI. The mocked version is deterministic.
**Outcome:** Strictly stronger — the original test was a no-op when ps failed; the mock ensures the happy path is always exercised.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
 Test Files  103 passed (103)
      Tests  2297 passed | 2 skipped (2299)
   Duration  38.77s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
 Test Files  104 passed (104)
      Tests  2297 passed | 2 skipped (2299)
   Duration  39.08s
```

### Comparison
- Tests added: 4 (in work-ci-mocked.test.ts)
- Tests removed: 4 (from work.test.ts: 3 getClaudePid + 1 conflict)
- Net change: 0
- Test files: 103 -> 104 (+1 new file)
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/work-ci-mocked.test.ts`: 4 tests covering getClaudePid happy path (mocked ps returns 12345), ps failure (status 1), invalid ps output (pid <= 0), and rebase conflict during pull (mocked git pull returns conflict stderr)

## Verification Commands
```bash
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
d283a99e [fix-ci-matrix-and-broken-tests] Update documentation to reflect Ubuntu-only CI matrix
66e1a80e [fix-ci-matrix-and-broken-tests] Extract 4 broken tests to work-ci-mocked.test.ts
e9add494 [fix-ci-matrix-and-broken-tests] Reduce CI matrix to Ubuntu-only and bump pnpm/action-setup to v6
```

## Open Issues

- **Pre-existing lint warning:** `src/utils/git-operations.ts:198` has "Unused eslint-disable directive" warning — not introduced by this build, present in baseline.
- **AC4 branch protection:** The developer must run the `gh api` command from the spec's Branch Protection Update section before or after merging to update required status checks from the old 6-runner names to the new 2-runner names (`Test (ubuntu-latest, Node 20)` and `Test (ubuntu-latest, Node 22)`). Without this, PRs to main will be blocked waiting for check names that no longer exist.
- **Contract A001 deviation:** The original test was environment-dependent (conditional `if (pid !== null)` guard). The mocked version always exercises the happy path with pid 12345, which is strictly stronger but uses a different verification method than the original.

Verified complete by second pass.
