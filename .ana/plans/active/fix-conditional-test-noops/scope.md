# Scope: Fix Conditional Test No-Ops

**Created by:** Ana
**Date:** 2026-06-01

## Intent
Fix 7 tests that silently pass as no-ops when `getAgentPid()` returns null. These tests call `getAgentPid()`, check if the result is null, and `return` — making the test pass without testing anything. In CI, in most dev environments, and in Codex sessions, the PID resolution fails because the process tree (agent → shell → node) doesn't exist. The test count (3132) includes phantom passes that don't verify behavior.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — 7 tests in one file need their PID guard replaced with a mock
- **Surface:** cli
- **Files affected:**
  - `packages/cli/tests/commands/work.test.ts` — 7 tests in two describe blocks (lines 4885-5100)
  - `packages/cli/tests/commands/work-ci-mocked.test.ts` — structural analog for the mock pattern (already mocks `spawnSync` for `getAgentPid`)
- **Blast radius:** Test reliability only. No source changes. No behavior changes.
- **Estimated effort:** 2-3 hours
- **Multi-phase:** no

## Approach
The disease is that `getAgentPid()` uses `spawnSync('ps', ...)` to walk the process tree, which returns null when there's no agent host process. Tests that depend on a resolvable PID silently skip their assertions instead of mocking the PID resolution.

The fix: mock `getAgentPid` to return a deterministic PID in the affected tests. The mock pattern already exists in `work-ci-mocked.test.ts` — it mocks `spawnSync` at the module level to intercept `ps` calls and return a fake PID.

Two options for where to put the fixed tests:

**Option A: Move the 7 tests to `work-ci-mocked.test.ts`.** That file already has the `spawnSync` mock infrastructure. The tests join the existing mocked environment. Pro: no new mock setup. Con: `work-ci-mocked.test.ts` grows; the tests are separated from their original describe block context.

**Option B: Mock `getAgentPid` directly in `work.test.ts` using `vi.spyOn`.** Import `getAgentPid` and mock its return value per-test. Pro: tests stay in their original location. Con: `getAgentPid` is called internally by `startWork` and `getWorkStatus` — the mock needs to intercept the internal call, not just the import. If `getAgentPid` is called via the module's own reference (not through the import binding), `vi.spyOn` on the import won't intercept it.

The REQ and the existing `work-ci-mocked.test.ts` pattern both point to Option A. The `vi.mock('node:child_process')` approach is the proven pattern — it intercepts `spawnSync` at the module boundary so internal calls are caught. The 7 tests should move to `work-ci-mocked.test.ts` or a new companion file that uses the same mock setup.

One additional finding: the first test (`creates session file when --session flag is set`, line 4885) has a slightly different pattern — it calls `getAgentPid()` and conditionally asserts only if the PID is non-null, but the test still "passes" without the PID-dependent assertions. This test also needs the mock.

Also found: 2 tests in `parsing-performance.test.ts` have `if (files.length === 0) return` guards. These are different — they guard against environments with no source files, not a mock-worthy condition. They should use `test.skipIf` with a message instead of silent return.

## Acceptance Criteria
- AC1: All 7 session-related tests in `work.test.ts` that previously guarded on `getAgentPid() === null` now run with a mocked PID and execute their full assertion set.
- AC2: The `creates session file when --session flag is set` test (line 4885) always executes its file-existence and content assertions, not conditionally.
- AC3: No test uses `if (agentPid === null) return` or `if (agentPid !== null)` as a conditional skip pattern.
- AC4: The 2 parsing-performance tests use `test.skipIf` or `describe.skipIf` with a reason string instead of silent `return`.
- AC5: All existing tests still pass — zero regressions.
- AC6: The total test count remains the same or increases (tests that were phantom-passing now genuinely pass).

## Edge Cases & Risks
**`vi.mock` hoisting.** Module-level `vi.mock('node:child_process')` is hoisted to the top of the file. Adding it to `work.test.ts` would break 3100+ tests that depend on real `spawnSync`. This is why `work-ci-mocked.test.ts` exists as a separate file — the mock is isolated. The fixed tests must go in a mocked file, not in `work.test.ts`.

**Session tests depend on real git operations.** The `startWork` function calls `runGit` (which uses `spawnSync`). The mock must pass through all non-`ps` calls to the real `spawnSync`, same as the existing pattern in `work-ci-mocked.test.ts`.

**Test count change.** Moving tests from `work.test.ts` to a mocked file changes which file they're counted under but the total count stays the same. No net change to the test suite.

## Rejected Approaches
**`test.skip` with a reason.** This was the simpler option — convert `if (agentPid === null) return` to `test.skipIf(!getAgentPid())`. But this doesn't fix the problem — it just makes the skip visible. The tests still wouldn't run in CI. The whole point is to make them actually execute.

**Mocking at the function level with `vi.spyOn`.** `getAgentPid` is called internally within `startWork` and `getWorkStatus`. A spy on the imported function doesn't intercept internal module calls. The `spawnSync` mock at the module boundary is the correct approach.

## Open Questions
None.

## Exploration Findings

### Patterns Discovered
- `work-ci-mocked.test.ts:16-32`: The existing mock pattern — `vi.hoisted` captures real `spawnSync`, `vi.mock` replaces it, the mock implementation passes non-`ps` calls through to the real function.
- `work.test.ts:4888-4904`: First test has a subtler pattern — it calls `getAgentPid()` and wraps assertions in `if (agentPid !== null)`, meaning the test "passes" with zero assertions.
- `work.test.ts:4954,4981,5018,5056,5083`: Five tests with `if (agentPid === null) return` — immediate bail.
- `parsing-performance.test.ts:53,84`: Different pattern — guards against empty file lists, not mockable. Should be `skipIf`.

### Constraints Discovered
- [TYPE-VERIFIED] `vi.mock` is hoisted to module scope — adding it to work.test.ts breaks all other tests in that file.
- [OBSERVED] `work-ci-mocked.test.ts` already has the `createSessionTestProject` pattern (similar `createMergedProject` helper) — the session tests would need their own helper adapted to the mocked environment.
- [OBSERVED] The 2 skipped tests in the suite (3132 passed, 2 skipped) are WASM-related (`skipIf(!wasmAvailable)`) — unrelated to this scope.

### Test Infrastructure
- `packages/cli/tests/commands/work-ci-mocked.test.ts`: Structural analog. Already mocks `spawnSync` for `getAgentPid` tests. The session tests should follow this pattern.
- `packages/cli/tests/commands/work.test.ts:4840-4881`: `createSessionTestProject` helper — may need to be shared or duplicated in the mocked file.

## For AnaPlan

### Structural Analog
`packages/cli/tests/commands/work-ci-mocked.test.ts` is the structural analog — same mock setup, same pass-through pattern, same `getAgentPid` import. The 7 session tests follow this file's pattern exactly.

### Relevant Code Paths
- `packages/cli/tests/commands/work.test.ts:4883-5100` — the 7 affected tests
- `packages/cli/tests/commands/work-ci-mocked.test.ts:16-85` — the mock pattern
- `packages/cli/tests/engine/performance/parsing-performance.test.ts:53,84` — the 2 skipIf candidates
- `packages/cli/src/commands/work.ts:1683-1705` — `getAgentPid` implementation

### Patterns to Follow
- `vi.hoisted` to capture real `spawnSync` before mock
- `vi.mock('node:child_process')` with pass-through for non-`ps` calls
- `createMergedProject`-style helper for test setup

### Known Gotchas
- The `createSessionTestProject` helper in `work.test.ts` uses `realExecSync` style git operations. In the mocked file, `spawnSync` is mocked — the helper must use the real implementation for git setup. The existing `work-ci-mocked.test.ts` captures `realSpawnSync` via `vi.hoisted` for exactly this reason.
- Moving tests to a new file means the `@ana` contract assertion tags move too. The original scope's contract IDs (A004-A014) referenced these tests. The tags must be preserved.

### Things to Investigate
- Whether `createSessionTestProject` should be extracted to a shared helper or duplicated in the mocked file.
