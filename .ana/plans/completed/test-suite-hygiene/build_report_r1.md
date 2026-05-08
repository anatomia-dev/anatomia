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
- `packages/cli/tests/e2e/init-flow.test.ts` (modified): Added `ana-learn.md` to agent files array, updated stale comments (agent count 9→6, skill count 6→5)
- `packages/cli/tests/commands/verify.test.ts` (modified): Removed archaeological "tag coverage" test, added source-reading exemption comment to import boundary test
- `packages/cli/tests/commands/artifact.test.ts` (modified): Removed archaeological "step 9a" test, strengthened `seal_hash` assertion to pattern match
- `packages/cli/tests/utils/proofSummary.test.ts` (modified): Renamed 2 "Callouts" → "Findings", strengthened 12 `toBeGreaterThan(0)` → exact `toBe(N)`, removed 1 redundant guard, added exemption comment
- `packages/cli/tests/commands/work.test.ts` (modified): Removed 2 source-reading tests + 2 mislabeled tests, renamed 1 test, added 3 template comments, strengthened ~15 weak assertions
- `packages/cli/tests/commands/proof.test.ts` (modified): Strengthened ~25 `toBeDefined()` → type-specific assertions, removed 3 redundant guards

## PR Summary

- Eight-category test hygiene pass: removes 27 tests with no behavioral coverage (archaeological, source-reading, mislabeled duplicates)
- Strengthens ~50 weak assertions across 4 test files (toBeDefined → toBeTypeOf/toMatch/toBeInstanceOf/toBe)
- Adds missing ana-learn.md agent to E2E init test, updates stale comment counts
- Removes dead code from test helpers (loadFixture, isWasmAvailable export, console noise)
- Zero production code changes — test-only cleanup

## Acceptance Criteria Coverage

- AC1 "Zero source-reading tests" → work.test.ts: removed "completeCommand registers --json option" and "injectGitWorkflow uses branchPrefix placeholder". artifact.test.ts: removed "step 9a post-commit fixup". Exemption comments added to verify.test.ts and proofSummary.test.ts. Template comments added to 3 work.test.ts template tests. ✅
- AC2 "Zero archaeological tests" → old-system-removed.test.ts deleted entirely, tests/cleanup/ directory removed. verify.test.ts "tag coverage" test removed. ✅
- AC3 "Every test name accurate" → work.test.ts: renamed "shows maintenance line" → "does not show Maintenance label". proofSummary.test.ts: renamed 2 "Callouts" → "Findings". ✅
- AC4 "No sole toBeDefined" → Strengthened across proof.test.ts (~25), work.test.ts (~15), artifact.test.ts (1), proofSummary.test.ts (1). Guard assertions before stronger checks kept. ✅
- AC5 "E2E init test asserts all agents and skills" → Added ana-learn.md. Conditional skill dirs (ai-patterns, api-patterns, data-access) NOT added — see Deviations. 🔨
- AC6 "Zero dead exports" → loadFixture removed, isWasmAvailable unexported. ✅
- AC7 "Zero console.log/warn" → Removed from benchmarks.test.ts, parsing-performance.test.ts, fixtures.ts. ✅
- AC8 "All tests pass, count decreases" → 95 files, 1986 passed, 2 skipped. Down from 96/2013. ✅
- AC9 "Tests pass, no build errors, no lint errors" → Build, typecheck, lint all pass (pre-commit hook runs all three). ✅

## Implementation Decisions

1. **Conditional skills not added to E2E test (AC5 deviation):** The spec says to add ai-patterns, api-patterns, data-access to init-flow assertions. However, these are CONDITIONAL skills (only scaffolded when scan detects aiSdk, framework, or database). The E2E test uses a minimal fixture (`{ name: 'test-project' }`) that doesn't trigger any conditions. Adding them would fail. Instead, added a comment explaining why they're absent and kept the core 5 skill assertions.

2. **quality.trajectory assertion:** Changed from `toBeTypeOf('string')` to `toHaveProperty('trajectory')` because the field is null when there are insufficient entries for trend detection. This is weaker than ideal but avoids a false failure.

3. **Remaining toBeDefined guards:** Kept ~8 `toBeDefined()` instances that serve as guards before value assertions (e.g., `expect(entry.worktree).toBeDefined()` before `expect(entry.worktree.used).toBe(true)`). These are acceptable per AC4: "Guard assertions before stronger checks are acceptable."

4. **Remaining toBeGreaterThan(0) outside spec scope:** Left 5 `toBeGreaterThan(0)` instances in proofSummary.test.ts sections not called out by the spec (hot_modules, scopeCandidates, staleness). The spec targets the proofContext section only.

## Deviations from Contract

### A020: E2E init test checks for the ana-learn agent file
**No deviation** — ana-learn.md added successfully.

### A021: E2E init test checks for the ai-patterns skill directory
**Instead:** Added comment explaining conditional scaffolding but did not add assertion
**Reason:** ai-patterns is a conditional skill (requires aiSdk detection). The E2E test's minimal fixture doesn't trigger it. Adding the assertion would cause a test failure.
**Outcome:** Intent partially preserved — the comment documents the gap. A separate test with an enriched fixture could assert conditional skills.

### A022: E2E init test checks for the api-patterns skill directory
**Instead:** Same as A021
**Reason:** api-patterns requires framework detection
**Outcome:** Same as A021

### A023: E2E init test checks for the data-access skill directory
**Instead:** Same as A021
**Reason:** data-access requires database detection
**Outcome:** Same as A021

## Test Results

### Baseline (before changes)
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
      Tests  1986 passed | 2 skipped (1988)
   Duration  34.75s
```

### Comparison
- Tests added: 0
- Tests removed: 27 (21 old-system-removed + 2 source-reading + 2 mislabeled + 1 archaeological verify + 1 archaeological artifact)
- Test files removed: 1 (old-system-removed.test.ts)
- Regressions: none

### New Tests Written
None — this is a cleanup pass, not new feature work.

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
435b866 [test-suite-hygiene] Strengthen weak assertions in proof.test.ts
058662c [test-suite-hygiene] Clean up work.test.ts
56f3cdd [test-suite-hygiene] Clean up proofSummary.test.ts
cdb9aaa [test-suite-hygiene] Clean up verify.test.ts and artifact.test.ts
3ac0c6c [test-suite-hygiene] Add missing ana-learn.md agent to E2E init test
e28ff6c [test-suite-hygiene] Clean up test helpers and remove console noise
dfbc7ad [test-suite-hygiene] Delete archaeological test file old-system-removed.test.ts
```

## Open Issues

1. **Conditional skills not tested in E2E:** The 3 conditional skill directories (ai-patterns, api-patterns, data-access) have no E2E test coverage. A dedicated test with an enriched fixture (adding next.js dep for api-patterns, etc.) would close this gap, but that's a feature addition beyond the spec's scope.

2. **quality.trajectory assertion weakened:** Used `toHaveProperty('trajectory')` instead of `toBeTypeOf('string')` because the field is null with insufficient entries. This is weaker than the other strengthened assertions — it only verifies the key exists, not its type.

3. **Remaining toBeGreaterThan(0) in proofSummary.test.ts:** 5 instances in hot_modules, scopeCandidates, and staleness sections were not strengthened — they're outside the spec's targeted scope. They could be addressed in a follow-up.

4. **Pre-existing lint warning:** `src/utils/git-operations.ts:169` has an unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.