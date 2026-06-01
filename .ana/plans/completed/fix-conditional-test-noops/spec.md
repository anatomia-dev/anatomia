# Spec: Fix Conditional Test No-Ops

**Created by:** AnaPlan
**Date:** 2026-06-01
**Scope:** .ana/plans/active/fix-conditional-test-noops/scope.md

## Approach

Two changes, both test-only:

**1. Session tests → mocked file.** Move the `--session flag` and `session consumption in startWork` describe blocks (11 tests total, 7 with PID guards) from `work.test.ts` to `work-ci-mocked.test.ts`. The mocked file already has `vi.mock('node:child_process')` with pass-through for non-`ps` calls. The 7 PID-dependent tests get a mock that returns PID 12345 for `ps` calls. The 4 non-guarded tests use the default pass-through — behavior identical to unmocked.

The `Commander registration` and `Ana prompt --session flag` describes (3 tests) stay in `work.test.ts`. They read source files — no PID dependency, no `tempDir` dependency. They become standalone describes after the parent `session marker and think-time capture` describe is removed.

**2. Parsing-performance → visible skip.** Replace `if (files.length === 0) return` with `if (files.length === 0) { ctx.skip(); return; }` using Vitest's `TestContext.skip()`. The scope identified 2 tests but there are actually 3 — the first test (`parses 20 files in ≤5 seconds`) uses the same guard in multi-line format. All 3 get the fix.

**Why move all 11 tests, not just the 7 guarded ones:** The `--session flag` describe has 3 tests, only 1 guarded. The `session consumption` describe has 8 tests, 6 guarded. Moving individual tests out of their describe blocks fragments the feature. The 4 non-guarded tests work fine with the pass-through mock and benefit from staying with their related tests.

## Output Mockups

No user-facing output changes. Test runner output changes:

Before (CI): 7 tests silently pass with zero assertions, 3 parsing tests silently pass with zero assertions.

After (CI): 7 session tests execute full assertion sets with mocked PID. 3 parsing-performance tests show as "skipped" when no source files found (instead of phantom pass).

## File Changes

### `packages/cli/tests/commands/work-ci-mocked.test.ts` (modify)
**What changes:** Add the `--session flag` and `session consumption in startWork` describe blocks. Add the `createSessionTestProject` helper. Expand the import from `work.js` to include `getWorkStatus` and `startWork`. Add `import * as fsSync from 'node:fs'` for sync filesystem operations.
**Pattern to follow:** The existing `exits on pull conflict (mocked)` describe in this same file — same tempDir setup, same `spawnMock` configuration, same `realExecSync`/`realSpawnSync` capture pattern.
**Why:** The 7 PID-guarded tests need `spawnSync` mocked to return a deterministic PID. This file already has that mock infrastructure.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** Remove the `--session flag` and `session consumption in startWork` describes, plus the `createSessionTestProject` helper and the parent describe's tempDir setup/teardown. Keep `Commander registration` and `Ana prompt --session flag` describes — lift them out of the removed parent describe to become standalone top-level describes. Remove the `getAgentPid` import if no remaining code uses it (the `getWorkStatus`, `startWork` imports stay — other tests use them).
**Pattern to follow:** N/A — this is deletion and flattening.
**Why:** Removing the no-op tests from the unmocked file. The remaining describes don't need the parent wrapper.

### `packages/cli/tests/engine/performance/parsing-performance.test.ts` (modify)
**What changes:** In all 3 tests that have `if (files.length === 0) return`, change the test callback signature to accept the test context and replace the silent return with `ctx.skip()`. Specifically: `it('...', async (ctx) => { ... if (files.length === 0) { ctx.skip(); return; } ... })`.
**Pattern to follow:** The existing `describe.skipIf(!wasmAvailable)` pattern in the same file — same concept (visible skip), different mechanism (runtime vs. declaration-time).
**Why:** Makes the skip visible in test output instead of phantom-passing with zero assertions.

## Acceptance Criteria

- [ ] AC1: All 7 session-related tests that previously guarded on `getAgentPid() === null` now run with a mocked PID and execute their full assertion set.
- [ ] AC2: The `creates session file when --session flag is set` test always executes its file-existence and content assertions, not conditionally.
- [ ] AC3: No test uses `if (agentPid === null) return` or `if (agentPid !== null)` as a conditional skip pattern.
- [ ] AC4: All 3 parsing-performance tests use `ctx.skip()` with visible skip instead of silent `return`.
- [ ] AC5: All existing tests still pass — zero regressions.
- [ ] AC6: The total test count remains the same or increases (tests that were phantom-passing now genuinely pass).
- [ ] AC7: Tests pass with `(cd 'packages/cli' && pnpm vitest run)`.
- [ ] AC8: No lint errors.

## Testing Strategy

- **No new tests needed.** The work IS fixing existing tests. The contract assertions verify that the fixed tests actually execute their assertion sets.
- **Regression:** Run the full CLI test suite. The 11 moved tests must pass in the mocked file. The remaining work.test.ts tests must still pass. The 3 parsing-performance tests must pass (or skip visibly if no source files).
- **Edge cases:** Verify that `Commander registration` and `Ana prompt --session flag` tests still pass after being lifted out of their parent describe.

## Dependencies

None. No source code changes — test-only.

## Constraints

- Total test count must not decrease (active constraint from project-context).
- The `@ana` contract assertion tags (A004–A017) on the session tests must be preserved when moved to the mocked file.
- The `vi.mock('node:child_process')` in work-ci-mocked.test.ts mocks `spawnSync` only — `execSync` passes through via the `...actual` spread.

## Gotchas

**`createSessionTestProject` uses `execSync`, not `spawnSync`.** The helper's git operations (`git init`, `git add`, `git commit`) use `execSync` which is NOT mocked in work-ci-mocked.test.ts. This means the helper works as-is — no need to switch to `realExecSync`. However, for consistency with the existing `createMergedProject` helper in the same file (which uses `realExecSync`), use `realExecSync` in the copied helper. This prevents breakage if someone later adds `execSync` to the mock.

**The first parsing-performance test uses multi-line guard.** It's `if (files.length === 0) {\n  return;\n}` while the other two use `if (files.length === 0) return;`. Both need the same fix. The scope only identified 2 — there are 3.

**Mock configuration per-test for session tests.** The 7 PID-dependent tests need `spawnMock` configured to return PID 12345 for `ps` calls (same pattern as the existing `resolves Claude PID from process tree` test at line 49 of work-ci-mocked.test.ts). The 4 non-guarded tests use the default pass-through from beforeEach. Structure: configure the PID mock inside each test that needs it, or in a nested beforeEach within the session consumption describe.

**Removing `getAgentPid` import from work.test.ts.** After moving the session tests, check if any remaining test in work.test.ts calls `getAgentPid`. If not, remove it from the import statement. The grep shows it's only used in the session tests being moved.

**The 3 remaining tests need restructuring.** `Commander registration` and `Ana prompt --session flag` are currently nested inside `describe('session marker and think-time capture')`. After removing the parent, they need their own describe wrappers. They don't use `tempDir` — they only use `__dirname` and `fsSync` for static file reads.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- Always use `--run` with pnpm test to avoid watch mode hang.

### Pattern Extracts

**Mock setup pattern from work-ci-mocked.test.ts (lines 16–32):**
```typescript
// Capture real implementations before vi.mock hoists
const { realExecSync, realSpawnSync } = vi.hoisted(() => {
  const cp = require('node:child_process');
  return {
    realExecSync: cp.execSync as typeof import('node:child_process').execSync,
    realSpawnSync: cp.spawnSync as typeof import('node:child_process').spawnSync,
  };
});

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: spawnMock,
  };
});
```

**PID mock configuration from work-ci-mocked.test.ts (lines 50–55):**
```typescript
spawnMock.mockImplementation(((command: string, args?: readonly string[], options?: object) => {
  if (command === 'ps') {
    return { status: 0, stdout: '12345\n', stderr: '', pid: 0, output: ['', '12345\n', ''], signal: null };
  }
  return realSpawnSync(command, args, options);
}) as typeof realSpawnSync);
```

**Default pass-through from work-ci-mocked.test.ts (lines 39–41):**
```typescript
spawnMock.mockImplementation((...args: Parameters<typeof realSpawnSync>) => {
  return realSpawnSync(...args);
});
```

### Proof Context

Key findings for affected files:

- **[test] capture-think-time-C1:** "Conditional PID guard makes 8 tests potential no-ops in environments where getClaudePid() returns null" — this IS the disease we're fixing.
- **[code] fix-ci-matrix-and-broken-tests-C2:** "createMergedProject duplicated between work-ci-mocked.test.ts and work.test.ts" — known duplication. Adding createSessionTestProject as a third helper is acceptable; extraction to shared utils is a separate scope.
- **[test] fix-ci-matrix-and-broken-tests-C1:** "Broad mock intercept matches any git command with 'pull' in args" — existing concern in work-ci-mocked.test.ts, not affected by this change.

### Checkpoint Commands

- After modifying work-ci-mocked.test.ts: `(cd 'packages/cli' && pnpm vitest run tests/commands/work-ci-mocked.test.ts)` — Expected: all existing + 11 new tests pass
- After modifying work.test.ts: `(cd 'packages/cli' && pnpm vitest run tests/commands/work.test.ts)` — Expected: passes with 11 fewer tests
- After modifying parsing-performance.test.ts: `(cd 'packages/cli' && pnpm vitest run tests/engine/performance/parsing-performance.test.ts)` — Expected: 3 tests pass (or skip visibly)
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 3132 tests pass, 2 skipped (possibly +3 skipped if no WASM source files found)
- Lint: `(cd 'packages/cli' && pnpm run lint)`

### Build Baseline
- Current tests: 3132 passed, 2 skipped
- Current test files: 129
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: 3132 passed, 2 skipped, 129 test files (same count — tests moved, not added)
- Regression focus: `work.test.ts` (remaining tests still pass after removal), `work-ci-mocked.test.ts` (existing tests still pass after additions)
