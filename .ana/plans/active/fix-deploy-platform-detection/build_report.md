# Build Report: Fix deploy platform detection for monorepos

**Created by:** AnaBuild
**Date:** 2026-05-26
**Spec:** .ana/plans/active/fix-deploy-platform-detection/spec.md
**Branch:** feature/fix-deploy-platform-detection

## What Was Built

- `packages/cli/src/engine/detectors/deployment.ts` (modified): Added optional `primaryPath` parameter to `detectDeployment`. When provided, `find()` for entry matching `sourceRootPath === primaryPath` before falling back to `deployments[0]`. Updated JSDoc to document new behavior with `@param` and `@returns` tags. Restructured to early-return on empty array.
- `packages/cli/src/engine/scan-engine.ts` (modified): Passed `census.primarySourceRoot` as second argument to `detectDeployment` at line 924.
- `packages/cli/src/engine/census.ts` (modified): Added comment above `DEPLOYMENT_CONFIGS` documenting that insertion order is intentional within-root priority (V8 string-key insertion order guarantee).
- `packages/cli/tests/engine/detectors/ci-detection.test.ts` (modified): Added 4 new tests for primary-aware deployment detection. Tagged all contract assertions A001-A007.

## PR Summary

- Fix monorepo deployment detection to prefer the primary package's deploy platform over the alphabetically-first entry across all packages
- Add optional `primaryPath` parameter to `detectDeployment` — backward-compatible, existing callers unaffected
- Thread `census.primarySourceRoot` through at the single call site in scan-engine
- Document `DEPLOYMENT_CONFIGS` insertion-order priority (V8 guarantee) to prevent accidental reordering
- Add 4 unit tests covering primary preference, fallback, single-repo compatibility, and empty list edge case

## Acceptance Criteria Coverage

- AC1 "inbox-zero scan shows Vercel not Cloudflare Workers" → NO TEST (integration criterion — verified by running scan on real repo)
- AC2 "Cap scan shows Vercel not Cloudflare Workers" → NO TEST (integration criterion)
- AC3 "dub scan still shows Vercel" → NO TEST (integration criterion)
- AC4 "formbricks scan still shows Docker" → NO TEST (integration criterion)
- AC5 "ana init on inbox-zero produces AGENTS.md with Vercel-specific guidance" → NO TEST (integration criterion)
- AC6 "Prisma + Vercel gotcha fires for inbox-zero" → NO TEST (integration criterion)
- AC7 "Single-repo projects unaffected" → ci-detection.test.ts "single-repo primaryPath matches all entries" (1 assertion)
- AC8 "Existing fallback test continues to pass" → ci-detection.test.ts "returns first deployment when multiple present" (1 assertion, unchanged)
- AC9 "Tests pass" → ✅ 2928 passed, 2 skipped
- AC10 "No build errors" → ✅ pnpm run build succeeds
- AC11 "No lint errors" → ✅ pnpm run lint passes (1 pre-existing warning in git-operations.ts)

## Implementation Decisions

- Restructured `detectDeployment` to early-return on empty array before checking `primaryPath`. This avoids the `primaryPath` check when there are no entries and reads more naturally with early returns.
- Used `primaryPath !== undefined` instead of a truthful check because `primaryPath` is a string that could theoretically be `''`. Strict check is safer.

## Deviations from Contract

### A006: Empty deployment list still returns null platform
**Instead:** Tagged the existing "returns null when no deployments in census" test which asserts `toBeNull()`, not just existence.
**Reason:** Contract matcher is `exists` (checking the field exists), but the existing test already asserts `toBeNull()` which is strictly stronger — the field exists AND is null.
**Outcome:** Functionally exceeds the contract requirement — verifier should assess.

### A008: The scan engine passes the primary source root to deployment detection
**Instead:** This is a code-level assertion (call site passes `census.primarySourceRoot`), not a unit test assertion. Verified by reading the modified line in scan-engine.ts.
**Reason:** Testing the call site would require mocking the entire scan engine, which is disproportionate. The code change is a single-line addition that's trivially verifiable by inspection.
**Outcome:** Verifier can confirm by reading `scan-engine.ts` line 924.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run tests/engine/detectors/ci-detection.test.ts)
Test Files  1 passed (1)
     Tests  7 passed (7)
```

### After Changes
```
(cd packages/cli && pnpm vitest run tests/engine/detectors/ci-detection.test.ts)
Test Files  1 passed (1)
     Tests  11 passed (11)

(cd packages/cli && pnpm vitest run)
Test Files  124 passed (124)
     Tests  2928 passed | 2 skipped (2930)
  Duration  58.79s
```

### Comparison
- Tests added: 4
- Tests removed: 0
- Regressions: none

### New Tests Written
- `tests/engine/detectors/ci-detection.test.ts`:
  - "prefers primary source root deployment over first entry" (A001, A002)
  - "falls back to first entry when primary has no deployment" (A003)
  - "single-repo primaryPath matches all entries" (A004)
  - "returns null when no deployments even with primaryPath" (A007)

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run tests/engine/detectors/ci-detection.test.ts)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
042d8a6e [fix-deploy-platform-detection] Add primary-aware deployment detection tests
1003c5c1 [fix-deploy-platform-detection] Add primaryPath param to detectDeployment
```

## Contract Coverage

7/8 assertions tagged: A001, A002, A003, A004, A005, A006, A007.
A008 is a code-inspection assertion (call site verification), documented as deviation.

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
