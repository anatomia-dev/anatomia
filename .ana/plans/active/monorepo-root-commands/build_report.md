# Build Report: Monorepo Root Commands

**Created by:** AnaBuild
**Date:** 2026-05-17
**Spec:** .ana/plans/active/monorepo-root-commands/spec.md
**Branch:** feature/monorepo-root-commands

## What Was Built

- `packages/cli/src/commands/init/state.ts` (modified): Captures `buildRoot` and `testRoot` (unscoped project-wide commands) before monorepo scoping overwrites `build`/`test` with package-scoped variants. Conditionally adds them to ana.json `commands` only for monorepos with root-level scripts. Added `buildRoot`/`testRoot` to `preserveUserState` blank-string sanitization.
- `packages/cli/src/utils/worktree.ts` (modified): `runBuildCommand` and `getBuildCommandString` now use `buildRoot ?? build` fallback chain, preferring the project-wide command when available.
- `packages/cli/templates/.claude/agents/ana-build.md` (modified): Clarified that `buildRoot` or `build` is for baseline builds; Build Brief checkpoint commands are for focused testing. Updated Verification Commands template section.
- `packages/cli/templates/.claude/agents/ana-verify.md` (modified): Clarified that test verification uses Build Brief checkpoint commands, not `commands.test`. Updated Step 2 template section.
- `.claude/agents/ana-build.md` (modified): Byte-identical copy of product template.
- `.claude/agents/ana-verify.md` (modified): Byte-identical copy of product template.
- `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` (modified): Added 8 new tests — buildRoot/testRoot creation, single-repo exclusion, null-root-script edge cases, preserveUserState handling.
- `packages/cli/tests/utils/worktree.test.ts` (modified): Added 3 new tests — buildRoot preference, build fallback, null when neither exists.
- `packages/cli/tests/commands/init/anaJsonSchema.test.ts` (modified): Added 1 new test — schema passthrough preserves buildRoot/testRoot.

## PR Summary

- Add `buildRoot` and `testRoot` fields to ana.json for monorepo projects, capturing unscoped project-wide build/test commands before monorepo scoping narrows them to the primary package
- `runBuildCommand` and `getBuildCommandString` in worktree.ts now prefer `buildRoot` over `build`, so worktree builds compile all workspace packages in dependency order
- Build and Verify agent templates clarified to distinguish baseline commands (ana.json `buildRoot`/`build`) from focused test commands (spec Build Brief checkpoints)
- `preserveUserState` sanitizes blank `buildRoot`/`testRoot` values on re-init, matching existing behavior for `build`/`test`/`lint`
- 12 new tests covering root command capture, fallback chain, schema passthrough, and re-init sanitization

## Acceptance Criteria Coverage

- AC1 "monorepos with root-level build/test scripts produce buildRoot/testRoot" → monorepoCommandScoping.test.ts "monorepo init populates buildRoot" + "monorepo init populates testRoot" (4 assertions)
- AC2 "single-package projects have no buildRoot/testRoot" → monorepoCommandScoping.test.ts "single-repo has no buildRoot or testRoot" (3 assertions)
- AC3 "runBuildCommand uses buildRoot when present, falls back to build, returns null" → worktree.test.ts "runBuildCommand prefers buildRoot over build" + "falls back to build" + "returns null when neither" (5 assertions)
- AC4 "preserveUserState handles new fields" → monorepoCommandScoping.test.ts "preserveUserState handles missing buildRoot/testRoot" + "sanitizes blank buildRoot/testRoot" (6 assertions)
- AC5 "Build template distinguishes baseline from focused commands" → ✅ Verified by reading template diff — `buildRoot or build` for baseline, Build Brief for tests
- AC6 "Verify template uses Build Brief checkpoint commands" → ✅ Verified by reading template diff
- AC7 "Build report Verification Commands references Build Brief" → ✅ Verified by reading template diff
- "Tests pass" → ✅ 2470 passed, 0 failed
- "No lint errors" → ✅ Pre-existing warning only (git-operations.ts, unrelated)
- "getBuildCommandString prefers buildRoot over build" → worktree.test.ts "runBuildCommand prefers buildRoot" verifies through createWorktree which calls both (context file shows buildRoot command)
- "Dogfood templates match product templates" → ✅ Verified by `diff` — 0 differences

## Implementation Decisions

- **testRootCmd captured after makeTestCommandNonInteractive but before monorepo scoping.** The spec's gotcha section specified this: the root test command should be the non-interactive variant, not the raw `result.commands.test`. Captured at line 402 (right after the `makeTestCommandNonInteractive` call, before the monorepo test-scoping block).
- **buildRootCmd uses `result.commands.build || null`.** The spec notes `result.commands.build` is never mutated by scoping — only the local `buildCmd` variable is overwritten. Captured it as a `const` before `buildCmd` to make the intent clear.
- **Contract A007/A010 tested through createWorktree integration.** `runBuildCommand` and `getBuildCommandString` are unexported. The test sets `buildRoot` to a command that writes a marker file and `build` to `exit 1` — proving buildRoot is preferred because the build succeeds and the marker file contains the right content. The worktree-context.md also shows the buildRoot command string.
- **Null-coalescing (`??`) used in worktree.ts instead of `||`.** `??` is correct here because `buildRoot` could be `null` (absent from JSON parse) but not falsy-string — `buildRoot` is only written when it has a non-empty string value.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts tests/utils/worktree.test.ts tests/commands/init/anaJsonSchema.test.ts)
Test Files  3 passed (3)
     Tests  65 passed (65)
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  107 passed (107)
     Tests  2470 passed | 2 skipped (2472)
  Duration  40.27s
```

### Comparison
- Tests added: 12 (6 monorepo scoping + 2 preserveUserState + 3 worktree + 1 schema)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `monorepoCommandScoping.test.ts`: buildRoot/testRoot creation for monorepos, single-repo exclusion, null-root-script edge cases, buildRoot vs scoped build coexistence, preserveUserState missing/blank sanitization
- `worktree.test.ts`: buildRoot preference over build, fallback to build when buildRoot absent, null when neither exists
- `anaJsonSchema.test.ts`: schema passthrough preserves buildRoot/testRoot without data loss

## Verification Commands
```bash
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts)
(cd packages/cli && pnpm vitest run tests/utils/worktree.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/init/anaJsonSchema.test.ts)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
4b0b60d8 [monorepo-root-commands] Clarify baseline vs focused commands in templates
4eb68abe [monorepo-root-commands] Prefer buildRoot in worktree build functions
6d14a18f [monorepo-root-commands] Capture root commands before monorepo scoping
```

## Open Issues

- The lint warning in `git-operations.ts:198` ("Unused eslint-disable directive") is pre-existing and unrelated to this build.
- `testRoot` is written to ana.json but has no mechanical consumer in code — it's agent-readable only, per spec constraints. Future work may add a `runTestCommand` equivalent.
- `runBuildCommand` and `getBuildCommandString` both independently read and parse `.ana/ana.json`. The spec's proof context notes this as existing debt (`worktree-build-step-C3`). This build makes the fallback chain consistent between the two functions but doesn't address the duplicate I/O.

Verified complete by second pass.
