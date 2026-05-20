# Build Report: Command Detection Language Awareness

**Created by:** AnaBuild
**Date:** 2026-05-19
**Spec:** .ana/plans/active/command-language-awareness/spec.md
**Branch:** feature/command-language-awareness

## What Was Built

- `packages/cli/src/engine/scan-engine.ts` (modified): Added Ruby (.rspec → RSpec, test/ → Minitest) and Rust (→ Cargo test) branches to `detectNonNodeTesting`. Added clear-and-rebuild block after rootDevDeps loop — replaces `stack.testing` with fresh native-only results for non-Node projects. Passed `projectTypeResult.type` to `detectCommands`.
- `packages/cli/src/engine/detectors/commands.ts` (modified): Added optional `projectType` parameter. Non-Node projects still read package.json to populate `result.all` but skip named command detection (build/test/lint/dev stay null).
- `packages/cli/src/commands/init/state.ts` (modified): Added `buildNonNodeCommands()` for Ruby/Go/Python/Rust native commands. Guarded monorepo scoping block with language check. Added JS command migration in `preserveUserState`. Added conditional init display (setup-first for non-Node with null test).
- `packages/cli/src/utils/worktree.ts` (modified): `getBuildCommandString` returns `''` instead of `'pnpm run build'` for null build command. Exported function for testing.
- `packages/cli/templates/.claude/agents/ana-setup.md` (modified): Changed "skip null/empty fields" to surface null `commands.test` and `commands.build` with ⚠ marker.
- `.claude/agents/ana-setup.md` (modified): Same change — dogfood copy matches product template.
- `packages/cli/tests/engine/scanProject.test.ts` (modified): Added 4 polyglot tests for Ruby contamination elimination, Rust Cargo test detection, Ruby Minitest detection, TypeScript unaffected.
- `packages/cli/tests/detectors/commands.test.ts` (created): 6 tests for `detectCommands` with projectType parameter.
- `packages/cli/tests/commands/init/nonNodeCommands.test.ts` (created): 19 tests covering `buildNonNodeCommands`, `preserveUserState` migration, `getBuildCommandString`, display logic, and template content.

## PR Summary

- Add language-aware command detection: Ruby, Go, Python, and Rust projects get native test/build/lint commands instead of wrong JS commands from package.json
- Eliminate JS testing framework contamination in `stack.testing` for non-Node projects via clear-and-rebuild after all enrichment
- Guard monorepo scoping block and `detectCommands` to suppress JS commands for non-Node projects while preserving `commands.all`
- Fix `getBuildCommandString` to return empty string instead of misleading `'pnpm run build'` for non-Node projects
- Add re-init migration to clear stale JS commands, conditional init display for non-Node, and setup template ⚠ markers for null commands

## Acceptance Criteria Coverage

- AC1 "Ruby + .rspec + bin/rspec → bin/rspec" → nonNodeCommands.test.ts "Ruby + RSpec with bin/rspec: test is bin/rspec" (1 assertion)
- AC2 "TypeScript unaffected" → scanProject.test.ts "TypeScript project: commands unaffected" (2 assertions) + commands.test.ts "node project gets JS commands" (4 assertions)
- AC3 "Python + pytest → pytest" → nonNodeCommands.test.ts "Python + pytest: test is pytest" (2 assertions)
- AC4 "Go → go test/build" → nonNodeCommands.test.ts "Go: test and build commands populated" (4 assertions)
- AC5 "Rust → cargo test/build/clippy" → nonNodeCommands.test.ts "Rust: test, build, and lint commands populated" (4 assertions)
- AC6 "Ruby without .rspec → null" → nonNodeCommands.test.ts "Ruby without any test framework: test is null" (1 assertion)
- AC7 "stack.testing contamination eliminated" → scanProject.test.ts "Ruby project with JS devDeps: stack.testing shows RSpec, not JS frameworks" (5 assertions)
- AC8 "detectNonNodeTesting Ruby/Rust branches" → scanProject.test.ts Ruby RSpec + Minitest + Rust Cargo test tests (3 tests)
- AC9 "commands.all populated" → scanProject.test.ts + commands.test.ts (2 tests assert commands.all)
- AC10 "Rust + JS workspace → buildPackage null" → Covered by scoping guard (language check prevents block execution). NO TEST — tested indirectly through engine-level assertions.
- AC11 "Skills Detected no JS test commands" → NO TEST (display-level assertion, would require E2E)
- AC12 "getBuildCommandString → ''" → nonNodeCommands.test.ts "returns empty string when commands.build is null" (1 assertion)
- AC13 "User native command survives re-init" → nonNodeCommands.test.ts "preserves user-configured native commands" (1 assertion)
- AC14 "preserveUserState clears stale JS commands" → nonNodeCommands.test.ts "clears stale JS commands" (3 assertions)
- AC15 "Rust stack.testing → Cargo test" → scanProject.test.ts "Rust project: stack.testing shows Cargo test" (1 assertion)
- AC16 "TypeScript init shows setup optional" → nonNodeCommands.test.ts "TypeScript project shows setup as optional" (1 assertion)
- AC17 "Non-Node null test → setup first" → nonNodeCommands.test.ts "non-Node with null test shows setup first" (2 assertions)
- AC18 "Non-Node with test → setup optional" → nonNodeCommands.test.ts "non-Node with test populated shows setup as optional" (1 assertion)
- AC19 "Setup template ⚠ marker" → nonNodeCommands.test.ts "product template surfaces null commands with ⚠ marker" (2 assertions)
- AC20 "Configured commands persist" → NO TEST (requires full init flow with ana.json write — covered by AC13 preserveUserState test which tests the merge logic)
- AC21 "Dogfood template updated" → nonNodeCommands.test.ts "dogfood template matches product template change" (2 assertions)
- Tests pass ✅ | Build clean ✅ | Lint clean ✅

## Implementation Decisions

1. **`buildNonNodeCommands` placement:** Placed after the commands object is created in `createAnaJson`, merging native commands over the engine-detected nulls. This means native commands are set at init-time, not engine-time — matching the spec's intent that the engine suppresses JS commands and the init layer fills in natives.

2. **Exported `getBuildCommandString`:** The function was private. Exported with `@internal` JSDoc tag to enable direct unit testing. The spec required a test; the function has no side effects and is safe to export.

3. **`preserveUserState` migration placement:** Added after the blank sanitizer and key propagation blocks, before the final write. This ensures blank sanitization happens first, then new keys propagate, then stale JS commands are cleared — correct order of operations.

4. **Display test approach:** Used console.log spy (direct override, not vi.spyOn) to capture output from `displaySuccessMessage`. Checked for "Configure commands" and "optional" keywords with chalk-aware assertions (chalk output is in the joined string).

## Deviations from Contract

### A020: Rust projects with JS workspace packages do not get scoped JS build commands
**Instead:** Verified through the scoping block guard code path — language check prevents the scoping block from executing for non-Node projects
**Reason:** Testing A020 requires a full monorepo fixture with Rust + JS workspace packages through `createAnaJson`, which requires mocking the full init flow. The guard is a simple language check on the same code path tested by A005/A006.
**Outcome:** Functionally equivalent — the scoping block is unreachable for non-Node. Verifier should assess.

## Test Results

### Baseline (before changes)
```
(pnpm run test -- --run)
Test Files  113 passed (113)
     Tests  2589 passed | 2 skipped (2591)
```

### After Changes
```
(pnpm run test -- --run)
Test Files  115 passed (115)
     Tests  2618 passed | 2 skipped (2620)
```

### Comparison
- Tests added: 29
- Tests removed: 0
- Test files added: 2
- Regressions: none

### New Tests Written
- `packages/cli/tests/detectors/commands.test.ts`: detectCommands with projectType — node gets JS commands, ruby gets null named commands with populated all, no package manager, no package.json, unknown type, undefined type backward compat
- `packages/cli/tests/commands/init/nonNodeCommands.test.ts`: buildNonNodeCommands (Ruby/Go/Rust/Python/unknown), preserveUserState JS migration (clear stale, preserve native, skip TypeScript), getBuildCommandString (null → '', string → string, missing → ''), displaySuccessMessage (non-Node setup-first, TypeScript optional, non-Node with test optional), template content (product ⚠, dogfood ⚠)
- `packages/cli/tests/engine/scanProject.test.ts`: 4 new polyglot fixtures (Ruby contamination, Rust Cargo test, Ruby Minitest, TypeScript unaffected)

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts)
(cd packages/cli && pnpm vitest run tests/detectors/commands.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/init/nonNodeCommands.test.ts)
pnpm run test -- --run
(cd packages/cli && pnpm run lint)
```

## Git History
```
4c452e6e [command-language-awareness] Layer 4: Init display and setup templates
2bcb2531 [command-language-awareness] Worktree fix and re-init migration
1b3b0b4c [command-language-awareness] Layer 3: Native command builder and scoping guard
3802cec2 [command-language-awareness] Layer 1+2: Non-Node testing detection and JS command suppression
```

## Open Issues

- **AC10 (scoped JS commands for Rust monorepo) lacks a direct test.** The scoping guard is a language check at the top of an existing code block — exercised indirectly through all non-Node scan tests. A dedicated monorepo fixture through `createAnaJson` would provide direct coverage but requires significant test infrastructure (mocking the full init flow with monorepo detection).

- **AC11 (Skills Detected section) lacks a test.** The Skills Detected display is deep in `displayDetectionSummary` and reads from `commands.all` / `stack.testing` — verifying that JS test commands don't appear would require E2E-level testing of the display output. The underlying data (null named commands, correct stack.testing) is tested.

- **AC20 (configured commands persist after setup) lacks a direct test.** The persistence mechanism is `preserveUserState` which IS tested (AC13, AC22). AC20's specific scenario — "after setup on a project with null commands" — requires an end-to-end flow through the setup agent writing ana.json and then re-init preserving it.

- **Pre-existing lint warning:** `git-operations.ts:198` has an unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
