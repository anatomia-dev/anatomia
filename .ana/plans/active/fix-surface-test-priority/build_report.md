# Build Report: Fix per-surface test command priority

**Created by:** AnaBuild
**Date:** 2026-05-20
**Spec:** .ana/plans/active/fix-surface-test-priority/spec.md
**Branch:** feature/fix-surface-test-priority

## What Was Built

- `packages/cli/src/commands/init/state.ts` (modified): Inverted the test command conditional at lines 517-523. Script passthrough (`scripts['test'] !== undefined`) is now checked first, with `buildDirectTestCommand` as fallback only when no test script exists. Mirrors the build command block pattern.
- `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` (modified): Updated A002 assertion from `toContain('vitest run')` to `toBe("(cd 'packages/cli' && pnpm run test)")`. Added 4 new tests: complex script passthrough (A002), fallback to direct invocation (A003), bun package manager (A005), empty-string test script (A006).
- `packages/cli/tests/commands/init/makeTestCommand.test.ts` (modified): Updated 2 assertions that encoded the old broken behavior — pnpm Vitest monorepo and yarn Jest monorepo tests now expect script passthrough instead of direct invocation.

## PR Summary

- Fix test command priority so per-surface `scripts['test']` is checked before direct runner invocation, matching the build command pattern
- Surfaces with a test script now get `(cd 'path' && {pm} run test)` instead of `(cd 'path' && {runner} {framework} {flags})`
- Direct invocation (`buildDirectTestCommand`) is preserved as fallback when no test script exists
- Updated 3 existing test assertions and added 4 new tests covering complex scripts, fallback, bun PM, and empty-string edge case
- Fixes the 41% command mismatch rate identified in scope (8 surfaces that would cause test failures)

## Acceptance Criteria Coverage

- AC1 "Surface with test script gets script passthrough" → monorepoCommandScoping.test.ts "generates surfaces section for monorepo" A001 assertion: `toBe("(cd 'packages/cli' && pnpm run test)")` (1 assertion)
- AC2 "Surface with no test script but detected framework gets direct invocation" → monorepoCommandScoping.test.ts "fallback to direct invocation when no test script exists" A003: `toBe("(cd 'packages/api' && pnpm vitest run)")` (1 assertion)
- AC3 "Surface with neither test script nor detected framework gets null" → monorepoCommandScoping.test.ts A026: `toBeNull()` (1 assertion, unchanged)
- AC4 "Root command generation unchanged" → makeTestCommand.test.ts root command assertions unchanged, still pass (existing coverage)
- AC5 "Existing tests pass, new tests cover edge cases" → 2717 pass, 4 new tests added ✅

## Implementation Decisions

- Used `scripts['test'] !== undefined` rather than `scripts['test']` for the check. This correctly handles empty-string test scripts (`test: ""`) — `undefined` check means "the key exists" regardless of value, which is the right semantics for "developer intentionally set this script."
- Updated `makeTestCommand.test.ts` assertions (not in spec's File Changes) because those 2 tests encoded the old broken behavior and would otherwise regress. Same logical change as the A002 update in monorepoCommandScoping.test.ts.

## Deviations from Contract

### A007: Root-level test commands are not affected by this change
**Instead:** Verified via existing tests in makeTestCommand.test.ts that assert root `commands.test` values — no dedicated new test added
**Reason:** Root command generation is a separate code path (lines 460-475) untouched by this change. Existing tests already cover it.
**Outcome:** Functionally equivalent — root test commands verified through existing test coverage

### A008: Build commands still use script passthrough as before
**Instead:** Verified via existing A003 assertion in monorepoCommandScoping.test.ts line 127: `toBe("(cd 'packages/cli' && pnpm run build)")`
**Reason:** Build command block was not modified — existing test already asserts this exact value
**Outcome:** Functionally equivalent — pre-existing test covers this assertion

### A009: Existing merge behavior preserves user-customized test commands on re-init
**Instead:** Verified via existing A008 test in monorepoCommandScoping.test.ts: `mergeSurfaces preserves user-tuned commands` asserts `merged.cli.commands.test === 'custom-user-test-command'`
**Reason:** mergeSurfaces is not modified by this change — existing test already covers the exact contract assertion
**Outcome:** Exact match — existing test asserts the contract value

### A010: The web surface with no test script and empty testing array gets null
**Instead:** Verified via existing assertion in the A001-A004 test at line 130: `expect(webCmds['test']).toBeNull()`
**Reason:** This is already asserted in the main monorepo generation test — the web surface has `testing: []` and no test script
**Outcome:** Exact match — pre-existing test covers this assertion

## Test Results

### Baseline (before changes)
```
pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

### After Changes
```
pnpm vitest run (full suite)
 Test Files  120 passed (120)
      Tests  2717 passed | 2 skipped (2719)
   Start at  21:24:40
   Duration  65.24s
```

### Comparison
- Tests added: 4
- Tests removed: 0
- Assertions updated: 3 (A002 in monorepoCommandScoping, 2 in makeTestCommand — all changed from direct invocation to script passthrough)
- Regressions: none

### New Tests Written
- `monorepoCommandScoping.test.ts`: 4 new tests
  - "complex script passthrough preserves developer setup steps" (A002)
  - "fallback to direct invocation when no test script exists" (A003)
  - "bun package manager uses bun run prefix" (A005)
  - "empty-string test script uses script passthrough" (A006)

## Contract Coverage

Contract coverage: 10/10 assertions tagged.

- A001 → monorepoCommandScoping.test.ts existing test (assertion updated)
- A002 → monorepoCommandScoping.test.ts new test "complex script passthrough"
- A003 → monorepoCommandScoping.test.ts new test "fallback to direct invocation"
- A004 → monorepoCommandScoping.test.ts existing A026 test (web surface with no test/framework → null)
- A005 → monorepoCommandScoping.test.ts new test "bun package manager"
- A006 → monorepoCommandScoping.test.ts new test "empty-string test script"
- A007 → existing tests in makeTestCommand.test.ts (deviation documented)
- A008 → existing A003 assertion in monorepoCommandScoping.test.ts line 127
- A009 → existing A008 test in monorepoCommandScoping.test.ts
- A010 → existing assertion in A001-A004 test at line 130

## Verification Commands
```
pnpm run build
cd packages/cli && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts
cd packages/cli && pnpm vitest run tests/commands/init/makeTestCommand.test.ts
cd packages/cli && pnpm vitest run
pnpm run lint
```

## Git History
```
3dac37f7 [fix-surface-test-priority] Update makeTestCommand assertions to expect script passthrough
185f50c6 [fix-surface-test-priority] Fix test command priority: script passthrough before direct invocation
```

## Open Issues

1. `makeTestCommand.test.ts` was not listed in the spec's File Changes section but required assertion updates. The spec only mentioned `monorepoCommandScoping.test.ts`. This is a spec gap — the scope analysis didn't catch that `makeTestCommand.test.ts` also encoded the old (broken) priority behavior. The updates are consistent with the fix (same logical change as the A002 update).

2. Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
