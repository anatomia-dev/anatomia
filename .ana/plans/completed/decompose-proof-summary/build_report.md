# Build Report: Decompose proofSummary.ts

**Created by:** AnaBuild
**Date:** 2026-05-24
**Spec:** .ana/plans/active/decompose-proof-summary/spec.md
**Branch:** feature/decompose-proof-summary

## What Was Built
For each file created or modified:
- `packages/cli/src/utils/proof-parsers.ts` (created): Leaf module with 6 parsing functions (`parseBuildOpenIssues`, `extractFileRefs`, `extractScopeSummary`, `extractScopeKind`, `parseFindings`, `parseRejectionCycles`) and 2 types (`ProofAssertion`, `ProofDeviation`). Zero dependencies on other proof modules.
- `packages/cli/src/utils/proof-health.ts` (created): Leaf module with 10 health computation functions (`computeHealthReport`, `computeFirstPassRate`, `computePipelineStats`, `floorMedian`, `detectHealthChange`, `computeStaleness`, `computeResolutionClaims`, `findFindingById`, `computeChainHealth`, `resolveFindingPaths`), 3 types (`ChainHealth`, `ResolutionClaim`, `ResolutionClaimsResult`), and 5 constants (`MIN_FINDINGS_HOT`, `MIN_ENTRIES_HOT`, `TRAJECTORY_WINDOW`, `MIN_ENTRIES_FOR_TREND`, `MIN_ENTRIES_FOR_EFFECTIVENESS`). Zero dependencies on other proof modules.
- `packages/cli/src/utils/proofSummary.ts` (modified): Removed moved functions/types/constants. Added direct imports from proof-parsers and proof-health for internal use. Added re-exports of all public symbols for backward compatibility. Removed `globSync` import (only used by moved `resolveFindingPaths`). File reduced from 2409 to 1285 lines.
- `packages/cli/tests/utils/proof-parsers.test.ts` (created): 7 describe blocks (parseFindings, parseFindings backward compat, parseRejectionCycles, extractFileRefs, parseBuildOpenIssues, extractScopeSummary, extractScopeKind) — imports from `proof-parsers.js`.
- `packages/cli/tests/utils/proof-health.test.ts` (created): 8 describe blocks (resolveFindingPaths, findFindingById, computeChainHealth, computeHealthReport, detectHealthChange, computeStaleness, computeResolutionClaims, computePipelineStats with median_plan) — imports from `proof-health.js`. Includes `vi.mock('glob')` for resolveFindingPaths tests.
- `packages/cli/tests/utils/proofSummary.test.ts` (modified): Removed 15 moved describe blocks. Updated imports to only include `generateProofSummary`, `getProofContext`, `generateDashboard`, `truncateSummary`. Removed `vi.mock('glob')` and `glob` import.

## PR Summary

- Split `proofSummary.ts` (2409 lines) into three files: `proof-parsers.ts` (leaf, parsing), `proof-health.ts` (leaf, health computation), and `proofSummary.ts` (core orchestration at 1285 lines)
- All public symbols re-exported from `proofSummary.ts` — zero consumer breakage, no import changes needed anywhere else
- Dependency graph is acyclic: both new modules are leaves with no cross-dependencies
- Test files split to match: 124 test files (122 + 2 new), all 2906 tests passing
- `vi.mock('glob')` correctly moved to `proof-health.test.ts` (Vitest module mocking is per-file)

## Acceptance Criteria Coverage

- AC1 "proof-parsers.ts exists and exports all functions/types" → proof-parsers.ts exports: parseBuildOpenIssues, parseFindings, parseRejectionCycles, extractFileRefs, extractScopeSummary, extractScopeKind, ProofAssertion, ProofDeviation (verified via build + import in test file)
- AC2 "proof-health.ts exists and exports all functions/types/constants" → proof-health.ts exports: computeHealthReport, computeFirstPassRate, computeChainHealth, detectHealthChange, computeStaleness, computeResolutionClaims, resolveFindingPaths, findFindingById, ChainHealth, ResolutionClaim, ResolutionClaimsResult, MIN_FINDINGS_HOT, MIN_ENTRIES_HOT, TRAJECTORY_WINDOW, MIN_ENTRIES_FOR_TREND (verified via build + import in test file)
- AC3 "proofSummary.ts re-exports all public symbols" → Re-export statements added for all parser and health symbols. Verified: all 2906 tests pass without changing any consumer import.
- AC4 "All existing tests pass without modification to test assertions" → 2906 passed, 2 skipped (identical to baseline). Only import paths changed.
- AC5 "Tests split into 3 files matching source split" → proof-parsers.test.ts imports from proof-parsers.js, proof-health.test.ts imports from proof-health.js
- AC6 "Zero behavior change" → All function signatures unchanged. Typecheck passes.
- AC7 "No consumer file changes" → No modifications to proof.ts, work.ts, doctor.ts, learn.ts, pr.ts, or types/proof.ts
- AC8 "pnpm run test -- --run passes" → 2906 tests passed
- AC9 "No build errors" → pnpm run build succeeds
- AC10 "No lint errors" → pnpm run lint passes (1 pre-existing warning in git-operations.ts)

## Implementation Decisions

- Removed `resolveFindingPaths` from the direct import in `proofSummary.ts` (line 14) since it's only re-exported, not used internally. The re-export `export { ... } from './proof-health.js'` handles consumers.
- Used `import type` with top-level named types in `proof-health.ts` (e.g., `TrajectoryData`, `HotModule`, etc.) rather than the inline `import('../types/proof.js').X` pattern from the original — cleaner and consistent with the Build Brief's rule about `import type` for type-only imports.
- Test extraction used exact line-range copying rather than manual rewrite — preserving every character of test logic to guarantee AC4.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run)
Test Files  122 passed (122)
     Tests  2906 passed | 2 skipped (2908)
  Duration  43.37s
```

### After Changes
```
pnpm run test -- --run
Test Files  124 passed (124)
     Tests  2906 passed | 2 skipped (2908)
  Duration  44.68s
```

### Comparison
- Tests added: 0 (tests moved, not added)
- Tests removed: 0
- Test files: 122 → 124 (+2 new)
- Regressions: none

### New Tests Written
No new tests — this is a structural refactor. All 148 tests in the two new files are exact copies of existing tests, now importing from their corresponding source module.

## Verification Commands
```
pnpm run build
(cd 'packages/cli' && pnpm vitest run)
pnpm run lint
```

## Git History
```
c65ba758 [decompose-proof-summary] Split test files to match source modules
85992572 [decompose-proof-summary] Extract parsing and health functions from proofSummary.ts
```

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — "Unused eslint-disable directive" — not introduced by this build.

Verified complete by second pass.
