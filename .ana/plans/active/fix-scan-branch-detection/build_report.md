# Build Report: Fix scan branch detection

**Created by:** AnaBuild
**Date:** 2026-05-15
**Spec:** .ana/plans/active/fix-scan-branch-detection/spec.md
**Branch:** feature/fix-scan-branch-detection

## What Was Built

- `packages/cli/src/engine/detectors/git.ts` (modified): Added `BOT_BRANCH_PREFIXES` Set constant and `isBotBranch()` helper. Rewrote `detectBranches()` to check `git remote` first — falls back to `git branch` (local) when no remote, uses `git branch -r` (remote only) with bot filtering when remote exists. Returns `[]` instead of `null` when remote exists but has no branches. Added `isBotBranch()` filter to `detectBranchPatterns()` before prefix counting.
- `packages/cli/tests/engine/detectors/git-detection.test.ts` (modified): Added 3 new tests using bare remote repos: "excludes local-only branches when remote exists", "excludes bot branches from branch list", "excludes bot prefixes from branchPatterns".

## PR Summary

- Switch `detectBranches()` from `git branch -a` to `git branch -r` when a remote exists, eliminating local-only branches from shared scan intelligence
- Fall back to `git branch` (local) when no remote is configured, preserving detection for local-only repos
- Filter known bot prefixes (dependabot/, renovate/, snyk-, greenkeeper/, imgbot/) from both branch list and branchPatterns analysis
- Add 3 new tests using bare remote repos to verify remote-only filtering and bot prefix exclusion

## Acceptance Criteria Coverage

- AC1 "detectBranches uses git branch -r when remote exists" → git-detection.test.ts "excludes bot branches from branch list" — verifies remote branches present, bot branches absent (A001, A002)
- AC2 "falls back to git branch when no remote" → git-detection.test.ts "returns branch list for local repo with commits" — existing test, still passes (A003, A004)
- AC3 "branchPatterns excludes bot prefixes" → git-detection.test.ts "excludes bot prefixes from branchPatterns" — verifies dependabot/ and renovate/ absent from prefixes, feature/ present, primary is feature/ (A005, A006, A007, A008)
- AC4 "existing test passes" → ✅ All 7 original tests pass
- AC5 "local branches excluded when remote exists" → git-detection.test.ts "excludes local-only branches when remote exists" (A009, A010)
- AC6 "bot prefixes excluded from branchPatterns" → git-detection.test.ts "excludes bot prefixes from branchPatterns" (A005, A006, A007, A008)
- Tests pass → ✅ 2339 passed, 2 skipped
- No build errors → ✅ Build succeeded

## Implementation Decisions

- Extracted `isBotBranch()` as a shared helper used by both `detectBranches()` and `detectBranchPatterns()`. The spec described adding bot filtering to each function separately. A shared helper avoids duplication and ensures the prefix list stays in sync.
- When remote exists but `git branch -r` returns empty, `detectBranches()` returns `[]` (empty array) rather than `null`. This distinguishes "remote with no branches" from "no git repo at all" (`null`), matching the spec's edge case description.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run tests/engine/detectors/git-detection.test.ts --run)
Test Files  1 passed (1)
     Tests  7 passed (7)
  Duration  2.16s
```

### After Changes
```
(cd packages/cli && pnpm vitest run --run)
Test Files  104 passed (104)
     Tests  2339 passed | 2 skipped (2341)
  Duration  43.37s
```

### Comparison
- Tests added: 3
- Tests removed: 0
- Regressions: none

### New Tests Written
- `git-detection.test.ts`: "excludes local-only branches when remote exists" — bare remote setup, push main, create unpushed local-experiment, verify it's excluded
- `git-detection.test.ts`: "excludes bot branches from branch list" — bare remote with pushed dependabot/ and feature/ branches, verify dependabot filtered and feature kept
- `git-detection.test.ts`: "excludes bot prefixes from branchPatterns" — bare remote with 3 dependabot/, 1 renovate/, 2 feature/ branches, verify prefixes map excludes bot prefixes and primary is feature/

### Contract Coverage
11/11 assertions tagged:
- A001, A002, A011 → "excludes bot branches from branch list"
- A003, A004 → "returns branch list for local repo with commits"
- A005, A006, A007, A008 → "excludes bot prefixes from branchPatterns"
- A009, A010 → "excludes local-only branches when remote exists"

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
2b1a0d4d [fix-scan-branch-detection] Add tests for remote-only branches and bot prefix filtering
46b48332 [fix-scan-branch-detection] Switch detectBranches to remote-aware, filter bots from branchPatterns
```

## Open Issues

- Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — "Unused eslint-disable directive (no-control-regex)". Not introduced by this build.
- Some test output noise from `ana proof strengthen` commands failing during the full suite run (pathspec errors, missing flags). These are pre-existing test artifacts from proof chain tests, not related to this build.

Verified complete by second pass.
