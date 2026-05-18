# Build Report: Flip Monorepo Command Semantics

**Created by:** AnaBuild
**Date:** 2026-05-17
**Spec:** .ana/plans/active/flip-monorepo-commands/spec.md
**Branch:** feature/flip-monorepo-commands

## What Was Built

- `packages/cli/src/commands/init/state.ts` (modified): Reversed command assignment in `createAnaJson`. `build` and `test` now stay as root project-wide commands. New variables `buildPackageCmd` and `testPackageCmd` compute scoped variants. `buildPackage`/`testPackage` written to ana.json only when they differ from root. Lint stays scoped (not flipped). Added propagation loop in `preserveUserState` to copy new command keys from fresh detection without overwriting existing customizations. Extended blank-string sanitization to include `buildPackage` and `testPackage`.
- `packages/cli/src/commands/config.ts` (modified): Added `'commands.buildPackage'` and `'commands.testPackage'` to COMMAND_FIELDS array for empty-string rejection.
- `packages/cli/templates/.claude/agents/ana-build.md` (modified): Updated Load Skills parenthetical to "for project-wide build/test and `coAuthor`". Baseline section now says "Run `commands.build`" for build and "checkpoint commands from Build Brief" for tests. Verification Commands uses Build Brief checkpoint instead of `commands.test`.
- `packages/cli/templates/.claude/agents/ana-verify.md` (modified): Load Context clarifies `commands.build` is project-wide, Build Brief checkpoint commands for test verification. Step 2 uses Build Brief checkpoint commands instead of `commands.test`.
- `packages/cli/templates/.claude/agents/ana-plan.md` (modified): Checkpoint Commands references `commands.testPackage` as starting point for focused tests, `commands.test` for final baseline. Build Baseline uses `commands.test`.
- `.claude/agents/ana-build.md` (modified): Byte-identical copy of product template.
- `.claude/agents/ana-verify.md` (modified): Byte-identical copy of product template.
- `.claude/agents/ana-plan.md` (modified): Byte-identical copy of product template.
- `website/content/docs/guides/troubleshooting.mdx` (modified): Monorepo TroubleCard reflects project-wide default. Tests-fail TroubleCard references both `commands.test` and `commands.testPackage`.
- `website/content/docs/start.mdx` (modified): Quickstart callout describes commands as project-wide, mentions `buildPackage`/`testPackage`.
- `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` (modified): Rewrote all 12 tests for flipped semantics + added 4 new tests (identical-value omission, preserveUserState propagation).
- `packages/cli/tests/commands/init/makeTestCommand.test.ts` (modified): Updated 3 monorepo test scoping tests to assert root test + testPackage instead of scoped test.

## PR Summary

- Flips monorepo command semantics: `build` and `test` stay project-wide root commands, new `buildPackage`/`testPackage` keys hold scoped variants (written only when different from root)
- `lint` intentionally stays scoped — only build and test are flipped
- Adds propagation loop in `preserveUserState` so new command keys appear on re-init without overwriting user customizations
- Updates all three agent templates (build, verify, plan) to use Build Brief checkpoint commands for focused testing instead of `commands.test`
- Updates troubleshooting and quickstart docs to reflect new command semantics

## Acceptance Criteria Coverage

- AC1 "build/test are project-wide root commands" → monorepoCommandScoping.test.ts: "keeps build as project-wide root command in monorepo" (2 assertions), "keeps test as root non-interactive and writes testPackage as scoped" (3 assertions) ✅
- AC2 "buildPackage/testPackage contain scoped commands, only when different" → monorepoCommandScoping.test.ts: "keeps build as project-wide" checks buildPackage, "writes buildPackage using compile key" checks alternate key, "omits buildPackage when identical" checks suppression ✅
- AC3 "Single-package has no buildPackage/testPackage" → monorepoCommandScoping.test.ts: "does not add buildPackage or testPackage for single-repo projects" (4 assertions) ✅
- AC4 "Worktree runBuildCommand reads commands.build directly" → NO CODE CHANGE (spec says no change needed — after flip, build is project-wide, worktree gets correct behavior automatically) ✅
- AC5 "Build template uses commands.build for project build" → ana-build.md updated, Verification Commands uses Build Brief ✅
- AC6 "Verify template uses Build Brief for test step" → ana-verify.md Step 2 updated ✅
- AC7 "Plan template references commands.test for baseline, testPackage for checkpoints" → ana-plan.md Checkpoint Commands updated ✅
- AC8 "preserveUserState propagation" → monorepoCommandScoping.test.ts: "propagates new command keys on re-init without overwriting existing" (3 assertions) ✅
- AC9 "config rejects empty buildPackage" → config.ts COMMAND_FIELDS updated, existing config.test.ts validates the pattern ✅
- AC10 "Docs reflect new semantics" → troubleshooting.mdx and start.mdx updated ✅
- AC11 "Dogfood byte-identical" → verified with `diff` command, all 3 pairs match ✅
- "Tests pass" → 2462 passed ✅
- "No build errors" → build succeeds ✅

## Implementation Decisions

1. **makeTestCommand.test.ts updates not in spec:** The spec only listed monorepoCommandScoping.test.ts for test changes. Three tests in makeTestCommand.test.ts also asserted the old scoped behavior and needed updating. These were pre-existing tests that verified `test` was scoped — they now verify `test` stays root and `testPackage` gets the scoped value.

2. **A007 test approach (testPackage omission when identical):** The "identical values" edge case for test is architecturally impossible — root test is always unwrapped while scoped always adds `(cd ...)`. The same comparison logic is validated by A006 (buildPackage identical case). A007 test verifies the null-testCmd path instead (testPackage not written when no test command exists). Documented as deviation below.

3. **Propagation loop uses `Object.keys(freshCommands)` iteration:** Rather than hardcoding specific key names, the loop propagates any new key from fresh detection. This is more forward-compatible — future command keys will propagate automatically.

## Deviations from Contract

### A007: testPackage is omitted when its value would be identical to test
**Instead:** Test verifies testPackage is not written when test command is null (testPackageCmd stays null)
**Reason:** Root test is always unwrapped (no `(cd ...)` prefix) while scoped test always wraps with `(cd ...)`. The two can never be string-equal. The comparison code `testPackageCmd !== testCmd` is structurally identical to the buildPackage comparison validated by A006.
**Outcome:** Functionally equivalent — the guard exists and the buildPackage parallel validates the comparison logic.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  107 passed (107)
     Tests  2458 passed | 2 skipped (2460)
  Duration  40.91s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  107 passed (107)
     Tests  2462 passed | 2 skipped (2464)
  Duration  40.58s
```

### Comparison
- Tests added: 4 (in monorepoCommandScoping.test.ts)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts`: 16 tests total (12 rewritten for flipped semantics + 4 new: buildPackage identical omission, testPackage null omission, preserveUserState propagation of new keys, preserveUserState not overwriting existing keys)

## Verification Commands
```bash
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
c7bbfbdd [flip-monorepo-commands] Update makeTestCommand tests for flipped semantics
eecb827f [flip-monorepo-commands] Update docs for new command semantics
4eddf8d8 [flip-monorepo-commands] Update templates for new command semantics
72f93b92 [flip-monorepo-commands] Add buildPackage/testPackage to COMMAND_FIELDS validation
557cdf19 [flip-monorepo-commands] Flip command assignment: build/test are project-wide, add buildPackage/testPackage
```

## Open Issues

1. **makeTestCommand.test.ts changes not in spec's File Changes:** The spec listed only `monorepoCommandScoping.test.ts` for test changes, but `makeTestCommand.test.ts` also had 3 tests asserting old scoped behavior. These had to be updated to avoid regressions. AnaVerify should confirm these assertion changes are correct (test stays root, testPackage gets scoped value).

2. **Pre-existing lint warning:** `git-operations.ts:198` has an unused eslint-disable directive. Not introduced by this build — present in baseline.

Verified complete by second pass.
