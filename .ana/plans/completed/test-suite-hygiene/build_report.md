# Build Report: Test Suite Hygiene

**Created by:** AnaBuild
**Date:** 2026-05-07
**Spec:** .ana/plans/active/test-suite-hygiene/spec.md
**Branch:** feature/test-suite-hygiene

## What Was Built

- `packages/cli/tests/cleanup/old-system-removed.test.ts` (deleted): Removed entire file (21 archaeological tests) and `tests/cleanup/` directory
- `packages/cli/tests/engine/fixtures.ts` (modified): Removed dead `loadFixture()` function, unexported `isWasmAvailable()`, removed `console.warn`, removed unused imports
- `packages/cli/tests/performance/benchmarks.test.ts` (modified): Removed `console.log` timing output
- `packages/cli/tests/engine/performance/parsing-performance.test.ts` (modified): Removed `console.log` skip message
- `packages/cli/tests/e2e/init-flow.test.ts` (modified): Added `ana-learn.md` to agent files array, updated stale comments, added new E2E test for conditional skill scaffolding (ai-patterns, api-patterns, data-access)
- `packages/cli/tests/commands/verify.test.ts` (modified): Removed archaeological "tag coverage" test, added source-reading exemption comment to import boundary test
- `packages/cli/tests/commands/artifact.test.ts` (modified): Removed archaeological "step 9a" test, strengthened `seal_hash` assertion to pattern match
- `packages/cli/tests/utils/proofSummary.test.ts` (modified): Renamed 2 "Callouts" -> "Findings", strengthened 12 `toBeGreaterThan(0)` -> exact `toBe(N)`, removed 1 redundant guard, added exemption comment
- `packages/cli/tests/commands/work.test.ts` (modified): Removed 2 source-reading tests + 2 mislabeled tests, renamed 1 test, added 3 template comments, strengthened ~18 weak assertions (including 3 timestamp toBeDefined -> toMatch)
- `packages/cli/tests/commands/proof.test.ts` (modified): Strengthened ~27 `toBeDefined()` -> type-specific assertions including 2 `closed_at` timestamps, removed 3 redundant guards

## PR Summary

- Eight-category test hygiene pass: removes 27 tests with no behavioral coverage (archaeological, source-reading, mislabeled duplicates)
- Strengthens ~55 weak assertions across 4 test files (toBeDefined -> toBeTypeOf/toMatch/toBeInstanceOf/toBe)
- Adds new E2E test verifying conditional skill scaffolding (ai-patterns, api-patterns, data-access) with a rich fixture triggering all 3 conditional triggers
- Adds missing ana-learn.md agent to E2E init test, updates stale comment counts
- Removes dead code from test helpers (loadFixture, isWasmAvailable export, console noise)
- Zero production code changes -- test-only cleanup

## Acceptance Criteria Coverage

- AC1 "Zero source-reading tests" -> work.test.ts: removed "completeCommand registers --json option" and "injectGitWorkflow uses branchPrefix placeholder". artifact.test.ts: removed "step 9a post-commit fixup". Exemption comments added to verify.test.ts and proofSummary.test.ts. Template comments added to 3 work.test.ts template tests. ✅ Verified
- AC2 "Zero archaeological tests" -> old-system-removed.test.ts deleted entirely, tests/cleanup/ directory removed. verify.test.ts "tag coverage" test removed. ✅ Verified
- AC3 "Every test name accurate" -> work.test.ts: renamed "shows maintenance line" -> "does not show Maintenance label". proofSummary.test.ts: renamed 2 "Callouts" -> "Findings". ✅ Verified
- AC4 "No sole toBeDefined" -> Strengthened across proof.test.ts (~27 including closed_at timestamps), work.test.ts (~18 including build_started_at and verify_started_at), artifact.test.ts (1), proofSummary.test.ts (1). ✅ Verified
- AC5 "E2E init test asserts all agents and skills" -> Added ana-learn.md to main test. Added new E2E test with rich fixture (Next.js + prisma + @anthropic-ai/sdk) that asserts all 8 skill directories. ✅ Verified
- AC6 "Zero dead exports" -> loadFixture removed, isWasmAvailable unexported. ✅ Verified
- AC7 "Zero console.log/warn" -> Removed from benchmarks.test.ts, parsing-performance.test.ts, fixtures.ts. ✅ Verified
- AC8 "All tests pass, count decreases" -> 95 files, 1987 passed, 2 skipped. Down from 96/2013. ✅ Verified
- AC9 "Tests pass, no build errors, no lint errors" -> Build, typecheck, lint all pass (1 pre-existing warning). ✅ Verified

## Implementation Decisions

1. **Conditional skills tested via separate E2E test:** Rather than modifying the main init test's minimal fixture (which would change its scope), added a new test `'scaffolds conditional skill directories when scan detects triggers'` that uses a rich fixture with Next.js + prisma + @anthropic-ai/sdk to trigger all 3 conditional skills. This keeps the main test focused on unconditional scaffolding.

2. **Header comment updated to "5 core + 3 conditional dirs":** The previous comment said "8 dirs" which was misleading since only 5 were tested. Now accurately describes the split.

3. **quality.trajectory assertion:** Changed from `toBeTypeOf('string')` to `toHaveProperty('trajectory')` because the field is null when there are insufficient entries for trend detection. Weaker than ideal but avoids false failure.

4. **Remaining toBeDefined guards:** Kept ~8 `toBeDefined()` instances that serve as guards before value assertions (e.g., `expect(entry.worktree).toBeDefined()` before `expect(entry.worktree.used).toBe(true)`). Acceptable per AC4: "Guard assertions before stronger checks are acceptable."

## Deviations from Contract

None -- all 30 contract assertions now satisfied. A021-A023 satisfied via new E2E test with rich fixture.

## Fix History

**Cycle 1 (verify failure):** 3 unsatisfied assertions (A021-A023) for conditional skill directories. Verifier confirmed these were a contract defect (skills are conditionally scaffolded), but the contract is authoritative. Fix: added new E2E test with rich fixture that triggers all 3 conditional skills. Also strengthened 5 remaining `toBeDefined()` on timestamp fields flagged by verifier (AC4 partial).

## Test Results

### Baseline (before changes -- round 1)
```
(cd packages/cli && pnpm vitest run)
 Test Files  96 passed (96)
      Tests  2013 passed | 2 skipped (2015)
   Duration  36.26s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
 Test Files  95 passed (95)
      Tests  1987 passed | 2 skipped (1989)
   Duration  35.18s
```

### Comparison
- Tests added: 1 (conditional skill scaffolding E2E)
- Tests removed: 27 (21 old-system-removed + 2 source-reading + 2 mislabeled + 1 archaeological verify + 1 archaeological artifact)
- Net change: -26 tests
- Test files removed: 1 (old-system-removed.test.ts)
- Regressions: none

### New Tests Written
- `packages/cli/tests/e2e/init-flow.test.ts`: "scaffolds conditional skill directories when scan detects triggers" -- verifies all 8 skill directories (5 core + 3 conditional) are scaffolded when scan detects Next.js (api-patterns), prisma (data-access), and @anthropic-ai/sdk (ai-patterns)

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
310977a [test-suite-hygiene] Fix: Add conditional skill E2E test and strengthen remaining timestamp assertions
7c1620a [test-suite-hygiene] Verify report
389a583 [test-suite-hygiene] Build report
435b866 [test-suite-hygiene] Strengthen weak assertions in proof.test.ts
058662c [test-suite-hygiene] Clean up work.test.ts
56f3cdd [test-suite-hygiene] Clean up proofSummary.test.ts
cdb9aaa [test-suite-hygiene] Clean up verify.test.ts and artifact.test.ts
3ac0c6c [test-suite-hygiene] Add missing ana-learn.md agent to E2E init test
e28ff6c [test-suite-hygiene] Clean up test helpers and remove console noise
dfbc7ad [test-suite-hygiene] Delete archaeological test file old-system-removed.test.ts
```

## Open Issues

1. **quality.trajectory assertion weakened:** Used `toHaveProperty('trajectory')` instead of `toBeTypeOf('string')` because the field is null with insufficient entries. This is weaker than the other strengthened assertions -- it only verifies the key exists, not its type.

2. **Remaining toBeGreaterThan(0) in proofSummary.test.ts:** 5 instances in hot_modules, scopeCandidates, and staleness sections were not strengthened -- they're outside the spec's targeted scope. Could be addressed in a follow-up.

3. **Pre-existing lint warning:** `src/utils/git-operations.ts:169` has an unused eslint-disable directive. Not introduced by this build.

4. **E2E scan regression test uses 5 toBeDefined() sole assertions:** `init-flow.test.ts:280-284` scan.json top-level keys use `toBeDefined()`. Outside this build's scope but same anti-pattern.

5. **proofSummary.test.ts: weak assertions in parseFindings tests:** `proofSummary.test.ts:733,736` use `toBeGreaterThanOrEqual(4)` and `toBeGreaterThanOrEqual(2)` on deterministic fixture data. Outside this build's targeted scope.

Verified complete by second pass.
