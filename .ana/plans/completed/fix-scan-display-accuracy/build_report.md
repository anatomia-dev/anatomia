# Build Report: Fix scan display accuracy

**Created by:** AnaBuild
**Date:** 2026-06-02
**Spec:** .ana/plans/active/fix-scan-display-accuracy/spec.md
**Branch:** feature/fix-scan-display-accuracy

## What Was Built

- `packages/cli/src/engine/scan-engine.ts` (modified): Replaced `gitignore.includes('.env')` substring match with `git check-ignore --no-index .env` subprocess call. Added `execSync` import from `node:child_process`. Exported `detectSecrets` for direct testing. Added JSDoc tags per coding standards.
- `packages/cli/src/commands/scan.ts` (modified): Changed contributor display from `N contributor(s)` to `N active contributor(s)`.
- `packages/cli/tests/engine/scan-engine-secrets.test.ts` (created): 4 tests covering happy path, false positive fix, non-git fallback, and negation pattern handling.
- `packages/cli/tests/commands/scan.test.ts` (modified): Added `contributor display label` describe block with integration test verifying "active contributor" label in scan output.

## PR Summary

- Fix env hygiene false positive: replace `.gitignore.includes('.env')` substring match with `git check-ignore --no-index .env`, which correctly handles `.env.local`-only repos, negation patterns, and non-git directories
- Add "active" qualifier to contributor count display, matching the `activeContributors` data field which measures a 14-day window
- Add 5 new tests: 4 unit tests for `detectSecrets` covering all gitignore scenarios, 1 integration test for contributor display label

## Acceptance Criteria Coverage

- AC1 "`.env.local`-only produces `gitignoreCoversEnv: false`" -> scan-engine-secrets.test.ts "detects .env.local-only gitignore as not covering .env" (1 assertion)
- AC2 "`.env` in gitignore produces `gitignoreCoversEnv: true`" -> scan-engine-secrets.test.ts "detects .env in gitignore as covered" (1 assertion)
- AC3 "contributor display reads 'N active contributors'" -> scan.test.ts "displays active contributor count" (1 assertion: `toContain('active contributor')`)
- AC4 "singular form '1 active contributor'" -> scan.test.ts "displays active contributor count" (conditional assertion: `not.toContain('1 active contributors')`)
- AC5 "existing env hygiene tests pass" -> env.test.ts: 5 passed unchanged
- AC6 "no scan output changes for repos with `.env` in gitignore" -> scan-engine-secrets.test.ts "detects .env in gitignore as covered" confirms no regression
- Tests pass: 3205 passed, 2 skipped
- No build errors: `pnpm run build` succeeds

## Implementation Decisions

- Exported `detectSecrets` with `export` keyword for direct testing. The spec called this out as the only API surface change. No other module imports it — the export exists solely for test access.
- The contributor display test creates a real git repo with a commit to populate activity data, matching the integration test pattern used throughout scan.test.ts.
- Combined A005/A006/A007 into a single integration test since they all test the same output line. The test checks for "active contributor" (covering A005/A006) and conditionally verifies singular form doesn't use plural (A007).

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
 Test Files  131 passed (131)
      Tests  3200 passed | 2 skipped (3202)
   Duration  50.80s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
 Test Files  132 passed (132)
      Tests  3205 passed | 2 skipped (3207)
   Duration  51.71s
```

### Comparison
- Tests added: 5 (4 in scan-engine-secrets.test.ts, 1 in scan.test.ts)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `tests/engine/scan-engine-secrets.test.ts`: 4 tests covering gitignore coverage detection — happy path (.env in gitignore), false positive fix (.env.local only), non-git directory fallback, negation pattern handling
- `tests/commands/scan.test.ts`: 1 test verifying "active contributor" label in scan output

### Contract Coverage
Contract coverage: 8/8 assertions tagged.
- A001 -> scan-engine-secrets.test.ts
- A002 -> scan-engine-secrets.test.ts
- A003 -> scan-engine-secrets.test.ts
- A004 -> scan-engine-secrets.test.ts
- A005, A006, A007 -> scan.test.ts "displays active contributor count"
- A008 -> env.test.ts passes unchanged (5/5)

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run scan-engine-secrets)
(cd packages/cli && pnpm vitest run scan.test)
(cd packages/cli && pnpm vitest run tests/engine/findings/env.test)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
f94e7ee8 [fix-scan-display-accuracy] Add active qualifier to contributor display
ef4a06b4 [fix-scan-display-accuracy] Fix env hygiene false positive with git check-ignore
```

## Open Issues

- `detectSecrets` is now exported solely for testing — no other module consumes the export. This is a pragmatic choice per the spec's instruction, but worth noting as a minor API surface expansion.
- Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts` (unused eslint-disable directive) — not introduced by this build.

Verified complete by second pass.
