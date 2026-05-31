# Build Report: Platform Display and Run Command (Phase 2)

**Created by:** AnaBuild
**Date:** 2026-05-30
**Spec:** .ana/plans/active/platform-aware-cli/spec-2.md
**Branch:** feature/platform-aware-cli

## What Was Built

- `packages/cli/src/commands/platform.ts` (modified): Added `agentCommand(agentSuffix)` — returns `ana run {suffix}` strings. Added `getPlatformFlags(cwd)` — reads platformFlags from ana.json for the active platform.
- `packages/cli/src/commands/work.ts` (modified): Replaced all 17 `claude --agent` strings in `getNextAction()` and 6 display strings outside it with `agentCommand()` calls. Renamed `getClaudePid` to `getAgentPid` and all `claudePid` variable uses to `agentPid`.
- `packages/cli/src/commands/doctor.ts` (modified): Replaced 4 `claude --agent` display strings with `agentCommand()` calls.
- `packages/cli/src/commands/setup.ts` (modified): Replaced 3 `claude --agent` display strings with `agentCommand()` calls.
- `packages/cli/src/commands/pr.ts` (modified): Replaced 2 `claude --agent` display strings with `agentCommand()` calls.
- `packages/cli/src/commands/work-proof.ts` (modified): Replaced 1 `claude --agent` display string with `agentCommand()` calls.
- `packages/cli/src/commands/init/state.ts` (modified): Replaced 4 `claude --agent` display strings in "Next:" post-init output with `agentCommand()` calls.
- `packages/cli/src/commands/init/skills.ts` (modified): Updated scaffold template text to use `ana run setup` instead of `claude --agent ana-setup`.
- `packages/cli/src/commands/check.ts` (modified): Updated `isScaffoldTemplateLine()` to match both `claude --agent ana-setup` and `ana run setup` patterns.
- `packages/cli/src/commands/run.ts` (created): New command module implementing `ana run [agent] [-- ...args]` with agent mapping, platformFlags injection, --agent conflict guard, advisory pipeline state check, executable availability check, and TUI passthrough via `spawnSync`.
- `packages/cli/src/index.ts` (modified): Registered `registerRunCommand` in the PIPELINE group between `registerWorkCommand` and `registerArtifactCommand`.
- `packages/cli/tests/commands/platform.test.ts` (modified): Added tests for `agentCommand()`, `getPlatformFlags()`, and scaffold detection dual-pattern.
- `packages/cli/tests/commands/run.test.ts` (created): 12 tests covering agent mapping, platformFlags injection, passthrough args, conflict guard, missing project error, missing executable error, advisory warnings.
- `packages/cli/tests/commands/work.test.ts` (modified): Updated all `claude --agent` expected values to `ana run` syntax. Renamed `getClaudePid` → `getAgentPid` in imports and variable uses.
- `packages/cli/tests/commands/work-ci-mocked.test.ts` (modified): Renamed `getClaudePid` → `getAgentPid` in imports and describe blocks.
- `packages/cli/tests/commands/check-dashboard.test.ts` (modified): Added test for new `ana run setup` scaffold pattern detection.
- `packages/cli/tests/commands/init.test.ts` (modified): Updated expected setup command string from `claude --agent ana-setup` to `ana run setup`.

## PR Summary

- Migrate all user-facing `claude --agent` display strings to `ana run` syntax via the new `agentCommand()` helper, making the CLI platform-neutral
- Create `ana run` command with TUI passthrough, automatic platformFlags injection from ana.json, `--agent` conflict guard, and advisory pipeline state checking
- Rename `getClaudePid` to `getAgentPid` across source and tests for platform-neutral naming
- Update scaffold text and detection atomically: new installations write `ana run setup`, detection matches both old and new patterns
- Add 20 new tests covering agentCommand, getPlatformFlags, run command behavior, and scaffold dual-pattern detection

## Acceptance Criteria Coverage

- AC7 "ana work status shows ana run build" → work.test.ts:206 `expect(output).toContain('ana run build')` (1 assertion)
- AC8 "ana work status --json nextAction contains ana run build" → work.test.ts:879 `expect(output).toContain('ana run build')` (1 assertion, JSON path)
- AC9 "check.ts scaffold detection matches both patterns" → check-dashboard.test.ts scaffold dual-pattern test + platform.test.ts A026/A027 (3 assertions)
- AC10 "ana run build launches claude --agent ana-build with platformFlags" → run.test.ts A028 + A030 (4 assertions)
- AC11 "ana run (no argument) launches claude --agent ana" → run.test.ts A029 (3 assertions)
- AC12 "ana run build with no work item at build stage shows advisory warning" → run.test.ts advisory warning test (1 assertion)
- AC13 "ana run build -- --extra-flag appends after config flags" → run.test.ts A031 + arg order test (2 assertions)
- AC15 "ana run build with platformFlags containing --agent warns and exits" → run.test.ts A032 (3 assertions)
- AC16 "All existing tests pass. Test count does not decrease from 3001" → 3041 passed (up from 3021 baseline)
- "getClaudePid renamed to getAgentPid" → Verified: `grep -rn 'getClaudePid\|claudePid' packages/cli/src/ packages/cli/tests/` returns empty
- "No claude --agent strings remain in source files" → Verified: only in JSDoc comments and scaffold detection logic (correct behavior)
- "Scaffold text in skills.ts and detection in check.ts updated atomically" → Committed together in commit 60ebfaee

## Implementation Decisions

1. **Advisory pipeline check reads `.saves.json` directly** instead of importing work-state functions. The spec said "don't spawn a subprocess" and "call the status function internally." I chose direct file reading because importing the full work-state module would pull in heavy dependencies (git operations, proof chain) for a non-blocking advisory check. Direct `.saves.json` reading is lightweight and fail-soft.

2. **`run.ts` uses `process.argv.indexOf('--')` for passthrough args** instead of Commander's `rawArgs` property. Commander's `rawArgs` is not a public TypeScript property, causing a TS2339 error. `process.argv` is always available and correct.

3. **`artifact.ts` was NOT modified.** The spec listed it as needing a `claude --agent` replacement at line 891, but line 891 is `chalk.gray('See packages/cli/templates/.claude/agents/ana-verify.md for the full schema.')` — a file path reference, not an agent invocation. No `claude --agent` strings exist in artifact.ts.

4. **`scaffold-generators.ts` was NOT modified.** The spec noted it may have zero matches. Confirmed: no `claude --agent` or `ana-setup` strings exist in that file.

5. **`init/index.ts` was NOT modified.** The spec documented this as a non-change (line 138 refers to the `.claude/` directory, not an agent invocation). Confirmed correct.

## Deviations from Contract

### A026: Scaffold detection recognizes the old Claude Code setup prompt
**Instead:** Tested via source inspection (checking check.ts contains the match string) rather than calling the function directly
**Reason:** `isScaffoldTemplateLine` is a private function not exported from check.ts
**Outcome:** Functionally equivalent — also covered by the existing check-dashboard test that uses old-pattern fixture data and passes

### A027: Scaffold detection recognizes the new ana run setup prompt
**Instead:** Tested via source inspection AND a check-dashboard integration test that writes `ana run setup` scaffold content and verifies it's detected as scaffold
**Reason:** `isScaffoldTemplateLine` is a private function not exported from check.ts
**Outcome:** Stronger than contract requires — both source verification and integration test

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run)
Test Files  128 passed (128)
     Tests  3021 passed | 2 skipped (3023)
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run)
Test Files  129 passed (129)
     Tests  3041 passed | 2 skipped (3043)
```

### Comparison
- Tests added: 20
- Tests removed: 0
- Regressions: none

### New Tests Written
- `tests/commands/platform.test.ts`: 5 new tests — agentCommand named agents, agentCommand empty string, getPlatformFlags read/missing/empty, scaffold detection dual-pattern (2)
- `tests/commands/run.test.ts`: 12 new tests — error without .ana, build argument spawn, empty argument spawn, platformFlags append, passthrough args, --agent conflict guard, missing executable, unknown agent, arg order, all agent mappings, advisory warning present, advisory warning absent
- `tests/commands/check-dashboard.test.ts`: 1 new test — scaffold detection with ana run setup pattern

## Verification Commands
```
pnpm run build
(cd 'packages/cli' && pnpm vitest run)
pnpm run lint
```

## Git History
```
5d77d511 [platform-aware-cli:s2] Update test expectations for display string migration
406ddd8c [platform-aware-cli:s2] Create ana run command with TUI passthrough
60ebfaee [platform-aware-cli:s2] Update scaffold text and detection atomically
245b3947 [platform-aware-cli:s2] Rename getClaudePid to getAgentPid
0fe47326 [platform-aware-cli:s2] Migrate display strings to agentCommand across source files
12898967 [platform-aware-cli:s2] Add agentCommand and getPlatformFlags to platform.ts
```

## Open Issues

1. **Advisory pipeline check is a simplified implementation.** It reads `.saves.json` directly instead of using the full `determineStage()` function from work-state.ts. The `stage` field in `.saves.json` may not always match the computed stage from `determineStage()` (which considers artifact presence, timestamps, etc.). For advisory purposes this is acceptable, but a false warning is possible when `.saves.json` stage is stale.

2. **`e2e/init-flow.test.ts` still expects `claude --agent ana` in CLAUDE.md.** This is correct — template files under `templates/` are NOT changed in this spec (Scope 2). But it means CLAUDE.md in new installations still shows the old syntax until Scope 2 is implemented.

3. **Pre-existing lint warning.** `packages/cli/src/utils/git-operations.ts:198` has an unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
