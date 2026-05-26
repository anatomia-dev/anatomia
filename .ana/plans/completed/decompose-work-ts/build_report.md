# Build Report: Decompose work.ts

**Created by:** AnaBuild
**Date:** 2026-05-25
**Spec:** .ana/plans/active/decompose-work-ts/spec.md
**Branch:** feature/decompose-work-ts

## What Was Built
- `packages/cli/src/commands/work-state.ts` (created): 9 pipeline state functions (`fileExistsOnBranch`, `readFileOnBranch`, `getWorkBranch`, `countPhases`, `getVerifyResult`, `discoverSlugs`, `gatherArtifactState`, `isTimestampRecent`, `determineStage`) + 5 types (`ArtifactState`, `ArtifactInfo`, `SpecInfo`, `ReportInfo`, `VerifyReportInfo`) + 1 constant (`CONCURRENCY_TIMEOUT_MS`). 491 lines.
- `packages/cli/src/commands/work-proof.ts` (created): 3 proof chain functions (`guardFailResult`, `deriveSurface`, `writeProofChain`). Imports `countPhases` from work-state.ts. 333 lines.
- `packages/cli/src/commands/work.ts` (modified): Removed moved code. Added imports from work-state.ts and work-proof.ts. Added re-export of `deriveSurface`. Kept `getNextAction` in work.ts (see Deviations). Removed unused proofSummary imports (`resolveFindingPaths`, `generateDashboard`, `type ProofSummary`) and proof type imports (`ProofChainEntry`, `ProofChain`, `ProofChainStats`). Kept `computeChainHealth` — still used in `completeWork` recovery path. 1749 lines (down from 2545).

## PR Summary

- Split `work.ts` (2545 lines) into three modules: `work-state.ts` (state computation), `work-proof.ts` (proof chain writing), and `work.ts` (command orchestration and display)
- Dependency direction is acyclic: work-state.ts is a leaf, work-proof.ts depends on work-state.ts, work.ts depends on both
- Re-exports `deriveSurface` from work.ts for backward compatibility (used by test dynamic imports)
- `getNextAction` kept in work.ts (instead of work-state.ts) because existing source-reading tests verify its string content in work.ts
- Zero behavior changes — all 2924 tests pass without modification

## Acceptance Criteria Coverage

- AC1 "work-state.ts exists with 10 state functions + 5 types + 1 constant exported" -> work-state.ts has 9 functions (not 10 — getNextAction stayed in work.ts), 5 types, 1 constant. See Deviations.
- AC2 "work-proof.ts exists with 3 proof functions exported" -> work-proof.ts exports `writeProofChain`, `guardFailResult`, `deriveSurface`. VERIFIED.
- AC3 "work.ts imports from work-state.ts and work-proof.ts. Re-exports deriveSurface" -> work.ts imports 7 functions + 1 constant from work-state.ts, 2 functions from work-proof.ts, re-exports deriveSurface. VERIFIED.
- AC4 "work.ts is ~1717 lines (down from 2545)" -> 1749 lines. Close to target; difference is getNextAction staying + minor whitespace. VERIFIED.
- AC5 "Zero display output changes" -> printHumanReadable, printNotifications, printExistingWorktree untouched in work.ts. VERIFIED.
- AC6 "All existing tests pass without modification to test assertions" -> 2924 passed, 2 skipped. VERIFIED.
- AC7 "pnpm run test -- --run passes" -> VERIFIED.
- AC8 "Build and lint pass" -> VERIFIED (0 lint errors; 1 pre-existing warning in git-operations.ts).

## Implementation Decisions

1. **getNextAction stays in work.ts.** The spec says move it to work-state.ts. However, test `getNextAction includes --merge for ready-to-merge` (work.test.ts:1582) reads work.ts source file content and asserts the string `"Or to merge and complete (from"` appears. Moving getNextAction removes the string from work.ts, breaking the test. Since AC6 requires all tests pass without test modification, getNextAction stays. This gives work-state.ts 9 exported functions instead of 10.

2. **Removed unused imports from work.ts.** After extraction, `fileExistsOnBranch`, `readFileOnBranch`, `isTimestampRecent` were only used by moved functions — removed from the work-state import. `ArtifactInfo`, `SpecInfo`, `ReportInfo`, `VerifyReportInfo` types were only used by moved functions — removed from the type import. Only `ArtifactState` is still needed (in WorkItem interface).

3. **Kept `computeChainHealth` in work.ts proofSummary import.** The spec said to move it to work-proof.ts only, but the recovery path in `completeWork` (line 679) calls `computeChainHealth` directly. Both files import it.

4. **Removed `runGit` from work-proof.ts imports.** The spec listed it as needed, but `writeProofChain` doesn't call `runGit` — it was used by the state functions. Lint caught it as unused.

## Deviations from Contract

### A001: Pipeline state computation lives in its own module
**Instead:** work-state.ts exports 9 functions instead of 10
**Reason:** `getNextAction` must stay in work.ts because test `work.test.ts:1582` reads work.ts source file content and asserts `"Or to merge and complete (from"` is present. Moving the function breaks the test. Contract A016 requires no test modifications.
**Outcome:** Functionally equivalent — 9 state functions in work-state.ts, 1 display-adjacent function in work.ts. The dependency graph is still acyclic.

## Test Results

### Baseline (before changes)
```
pnpm run test -- --run
Test Files  124 passed (124)
     Tests  2924 passed | 2 skipped (2926)
  Duration  48.01s
```

### After Changes
```
pnpm run test -- --run
Test Files  124 passed (124)
     Tests  2924 passed | 2 skipped (2926)
  Duration  49.23s
```

### Comparison
- Tests added: 0
- Tests removed: 0
- Regressions: none

### New Tests Written
None — structural refactor, existing tests cover all behavior.

## Verification Commands
```bash
pnpm run build
(cd 'packages/cli' && pnpm vitest run)
pnpm run lint
```

## Git History
```
d47923fb [decompose-work-ts] Extract state and proof functions from work.ts
```

## Open Issues

1. **`computeChainHealth` imported in both work.ts and work-proof.ts.** The spec intended it to move entirely to work-proof.ts, but the recovery path in `completeWork` uses it directly. Both files legitimately need it. Not a problem — just a deviation from the spec's import split description.

2. **Pre-existing lint warning in git-operations.ts:198** — "Unused eslint-disable directive (no-control-regex)". Not introduced by this build.

Verified complete by second pass.
