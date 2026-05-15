# Scope: Worktree Guard Integration Tests

**Created by:** Ana
**Date:** 2026-05-14

## Intent

Three CLI commands hard-block execution when run from inside a worktree: `init`, `setup complete`, and `work complete`. A fourth (`scan --save`) warns but continues. These guards prevent repo corruption — running `init` from a worktree creates a nested `.ana/`, running `work complete` corrupts the proof chain. All four guards are verified only by source inspection (A028, A030, A031, A032 in the worktree-isolation verify report). No integration test verifies that the guard actually fires when a command runs from inside a worktree. This scope adds those tests.

## Complexity Assessment
- **Kind:** chore
- **Size:** small — one new test file, no production code changes
- **Files affected:** 1 new file: `packages/cli/tests/commands/worktree-guards.test.ts`
- **Blast radius:** None. New tests only. No production code modified.
- **Estimated effort:** 1-2 hours
- **Multi-phase:** no

## Approach

Create a single test file that verifies each worktree guard fires correctly. Use a fake `.git` file fixture (a file containing `gitdir: /fake/.git/worktrees/test`) instead of real `git worktree add` — the unit tests in `worktree.test.ts:93-108` already verify detection works with real worktrees. The guard tests verify the next layer: detection returns true → command blocks or warns.

For `completeWork` (exported function), call it directly. For `init`, `setup complete`, and `scan --save` (Commander action handlers), register the command on a Commander program and call `parseAsync`. The guard fires before any other command logic, so no project scaffolding is needed beyond the fake `.git` file.

Use the established `vi.spyOn(process, 'exit')` + `console.error` capture pattern from `work.test.ts` and `artifact.test.ts`.

## Acceptance Criteria
- AC1: A test verifies that `ana init` from a directory with a worktree `.git` file calls `process.exit(1)` and prints an error containing "main project directory"
- AC2: A test verifies that `ana setup complete` from a directory with a worktree `.git` file calls `process.exit(1)` and prints an error containing "main project directory"
- AC3: A test verifies that `completeWork()` from a directory with a worktree `.git` file calls `process.exit(1)` and prints an error containing "main project directory"
- AC4: A test verifies that `ana scan --save` from a directory with a worktree `.git` file prints a warning containing "worktree" to `console.warn` and does NOT call `process.exit(1)`
- AC5: Each test restores `process.cwd`, `process.exit`, and `console.error`/`console.warn` in afterEach — no test pollution
- AC6: All existing tests continue to pass

## Edge Cases & Risks

- **Commander parseAsync side effects.** Commander may print help text or throw on unrecognized options. The tests should only test the worktree guard path — pass minimal valid arguments (`['node', 'ana', 'init']`) and mock `process.exit` so the guard's `exit(1)` is caught before Commander does anything else.
- **`scan --save` continues after the warning.** The scan will attempt to actually run after the warning. The test should mock enough of the scan pipeline (or let it fail gracefully) to avoid unrelated errors. The assertion is on the warning message, not the scan result.
- **`process.chdir` in parallel tests.** Vitest runs test files in parallel but tests within a file sequentially. Since all guard tests are in one file and use `beforeEach`/`afterEach` for cwd save/restore, there's no cross-contamination risk. But the file must not run in parallel with other files that also `chdir` — check if this is already handled by the test runner config.
- **chalk stripping.** The error messages use `chalk.red()`. Assertions should match the text content, not ANSI codes. Use `.toContain('main project directory')` not exact string match.

## Rejected Approaches

**Real worktree creation via `git worktree add`.** The detection function `isWorktreeDirectory()` is already unit-tested with real worktrees (worktree.test.ts:100-104). Creating real worktrees in guard tests (~200ms each with git init + worktree add) would re-test detection instead of testing guard behavior. The fake `.git` file tests the full chain (file detection → guard → exit) in ~5ms.

**Mocking `isWorktreeDirectory()` to return true.** This tests "does the handler branch on the return value" — not "does the guard work." The fake `.git` file tests the actual detection-to-exit chain without being heavier.

**Testing proof command hints (proof.ts:779/1029/1299/1638).** These are not guards. They're `formatHint` callbacks inside `WRONG_BRANCH` error handlers that change the hint text from "Run: git checkout main" to "You're in a worktree." The actual blocking is done by the branch check, not the worktree check. Testing them requires triggering a WRONG_BRANCH error from inside a worktree — complex setup for near-zero safety value.

**Putting tests in `worktree.test.ts`.** That file tests utility functions (`isWorktreeDirectory`, `createWorktree`, etc.). Guard tests verify command-level behavior across multiple commands. A dedicated file keeps concerns separated.

## Open Questions

None.

## Exploration Findings

### Patterns Discovered
- Guard pattern is identical across init, setup, and work complete: `if (isWorktreeDirectory()) { console.error(...); process.exit(1); }` — three lines, always at the top of the action handler before any other logic.
- `scan --save` uses `console.warn` (not `console.error`) and does NOT call `process.exit` — the scan continues after the warning.
- Proof commands use `isWorktreeDirectory()` inside `formatHint` callbacks of `exitError()` — fundamentally different from the guard pattern.

### Constraints Discovered
- [TYPE-VERIFIED] Commander action handlers (init/index.ts:61, setup.ts:54, scan.ts:352) — guards are inline in Commander `.action()` callbacks, not exported functions. Must invoke through Commander `parseAsync`.
- [TYPE-VERIFIED] `completeWork` (work.ts:1062) — exported directly, callable without Commander.
- [OBSERVED] `process.exit` mock pattern — `vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never)` used in work.test.ts:1321, artifact.test.ts:2125.
- [OBSERVED] `captureError` helper in artifact.test.ts:2114-2141 — wraps both `process.exit` and `console.error` capture. Could be a model for a shared helper, but inline is fine for 4 tests.

### Test Infrastructure
- worktree.test.ts: `createTestProject()` helper with git init + ana.json — overkill for guard tests
- work.test.ts: `vi.spyOn(process, 'exit')` pattern for testing exit behavior
- artifact.test.ts: `captureError()` helper that intercepts both exit and error output

## For AnaPlan

### Structural Analog
`packages/cli/tests/commands/work.test.ts` lines 1318-1347 — the `completeWork` exit(1) tests for FAIL result. Same pattern: mock process.exit, capture console.error, call the function, assert exit code and error message. The guard tests follow this exact shape.

### Relevant Code Paths
- `packages/cli/src/commands/init/index.ts:62-66` — init worktree guard
- `packages/cli/src/commands/setup.ts:55-59` — setup complete worktree guard
- `packages/cli/src/commands/work.ts:1063-1067` — work complete worktree guard
- `packages/cli/src/commands/scan.ts:382-385` — scan --save worktree warning
- `packages/cli/src/utils/worktree.ts:87-101` — `isWorktreeDirectory()` implementation
- `packages/cli/tests/utils/worktree.test.ts:93-110` — existing unit tests for detection

### Patterns to Follow
- `work.test.ts:1321-1327` — `vi.spyOn(process, 'exit')` mock pattern
- `work.test.ts:1337-1346` — `console.error` capture + assertion pattern
- `worktree.test.ts:22-54` — `beforeEach`/`afterEach` with temp dir and cwd restore

### Known Gotchas
- Commander's `parseAsync` may call `process.exit(0)` on `--help` or after successful completion — the mock must distinguish exit(1) from exit(0).
- `scan --save` continues execution after the warning — the test needs to handle (or suppress) the subsequent scan attempt gracefully.
- `chalk.red()` wraps error text in ANSI codes — use `.toContain()` not exact match.

### Things to Investigate
- Whether `scan --save` can be tested by letting the scan fail naturally (no valid project) after the warning fires, or if it needs additional mocking to avoid unrelated errors.
