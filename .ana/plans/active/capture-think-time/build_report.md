# Build Report: Capture actual think time from Ana session start

**Created by:** AnaBuild
**Date:** 2026-05-13
**Spec:** .ana/plans/active/capture-think-time/spec.md
**Branch:** feature/capture-think-time

## What Was Built
- `packages/cli/src/commands/work.ts` (modified): Added `getClaudePid()` utility using POSIX `ps` to resolve Claude Code PID from process tree. Added `--session` flag on `status` subcommand that writes `.ana/state/session-{pid}.json`. Added session file consumption in `startWork()` new-slug path (read → delete → use timestamp). Extended `writeTimestamp()` with optional `timestamp` parameter.
- `.claude/agents/ana.md` (modified): Changed `ana work status` to `ana work status --session` in two locations.
- `packages/cli/templates/.claude/agents/ana.md` (modified): Same `--session` flag addition for new installations.
- `packages/cli/tests/commands/work.test.ts` (modified): Added 16 tests covering PID resolution, session file creation, session consumption, delete-then-use ordering, corrupted file handling, existing-slug path isolation, command registration, and prompt content verification.

## PR Summary

- Add session marker mechanism to capture actual think time: `ana work status --session` writes a PID-keyed timestamp file that `ana work start` consumes as `work_started_at`
- `getClaudePid()` resolves the Claude Code process ID via POSIX `ps` with graceful null fallback on any failure
- Delete-then-use ordering ensures session files are never stale: file is removed before its timestamp is passed to `writeTimestamp()`
- All failure modes degrade to current behavior (`now()`) — zero user-visible risk
- Template and dogfood ana.md both updated with `--session` flag

## Acceptance Criteria Coverage

- AC1 "work status --session writes session file" → work.test.ts:4599 "creates session file when --session flag is set" (2 assertions)
- AC2 "work start reads, deletes, uses session file" → work.test.ts:4639 "uses session timestamp for work_started_at" + work.test.ts:4668 "deletes session file before using timestamp" (3 assertions)
- AC3 "without session file, uses now()" → work.test.ts:4685 "falls back to now() without session file" (2 assertions)
- AC4 "PID resolution uses POSIX ps, fails gracefully" → work.test.ts:4565 "resolves Claude PID" + work.test.ts:4577 "returns null when ps fails" + work.test.ts:4589 "returns null when ps output invalid" (4 assertions)
- AC5 "--session flag in both ana.md files" → work.test.ts:4788 + work.test.ts:4794 (2 assertions)
- AC6 "session files in .ana/state/ (gitignored)" → verified by code path, .ana/.gitignore contains `state/`
- AC7 "orphan session files are inert" → work.test.ts:4750 "existing slug path does not consume session files" (1 assertion)
- AC8 "plain work status does not write session file" → work.test.ts:4614 + work.test.ts:4627 (2 assertions)
- AC9 "tests pass" → ✅ 2194 passed, 0 failed
- AC10 "no build errors" → ✅ build success

## Implementation Decisions

- Used `spawnSync` (already imported) instead of `execSync` as spec suggested. `spawnSync` returns structured output with exit code; `execSync` throws on non-zero exit. Better for graceful null-return pattern.
- A003 test fix: set `process.ppid` to 1 (init/launchd) whose parent is PID 0, triggering the `pid <= 0` guard. This tests the real code path without ESM-incompatible mocking of `spawnSync`.

## Fix History

- **Round 1 (initial build):** All implementation complete, 16 tests written. A003 test used tautological assertion.
- **Round 2 (this session):** Replaced A003 test. First attempt used `vi.spyOn(childProcess, 'spawnSync')` — failed due to ESM module namespace not being configurable. Second attempt set `process.ppid = 1` to trigger the `pid <= 0` guard via real `ps` output — passed.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes — round 1)
```
(cd packages/cli && pnpm vitest run)
Tests: 2178 passed | 2 skipped (2180)
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
 Test Files  100 passed (100)
      Tests  2194 passed | 2 skipped (2196)
   Duration  38.24s
```

### Comparison
- Tests added: 16
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/work.test.ts`: getClaudePid (resolve, ps-fail, invalid-output), --session flag (create file, valid timestamp, no-flag skip, non-git skip), session consumption (use timestamp, delete-before-use, fallback to now, writeTimestamp with/without param, corrupted JSON handling, existing-slug isolation), command registration (--session on status only), prompt content (ana.md, template ana.md)

### Contract Coverage
17/17 assertions tagged with `@ana`.

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
87e65d3e [capture-think-time] Fix: replace tautological A003 test with real invalid-output assertion
b64d1fd2 [capture-think-time] Verify report
fc2dd823 [capture-think-time] Build report
83e8875a [capture-think-time] Add session capture tests
b4aebbca [capture-think-time] Add session marker for think-time capture
```

## Open Issues

- **Conditional PID guard in 8 tests:** Tests for A004, A005, A007, A008, A010, A012/A013, A014 use `if (claudePid === null) return;` guard. In CI or Docker where `getClaudePid()` returns null, these tests execute zero assertions. Locally they work. Consider mocking `getClaudePid` to return a known PID for deterministic behavior in all environments.
- **A015 tests source code instead of runtime behavior:** Reads `work.ts` and regex-matches Commander registration blocks. Pragmatic since Commander registration is hard to test behaviorally without a CLI harness, but noted as debt.
- **A008 ordering not enforced by test:** Test proves file is deleted after `startWork` completes, but doesn't enforce delete-before-writeTimestamp ordering. Correct in implementation (lines 1834 vs 1845), but a reorder wouldn't fail the test.
- **Async/sync IO inconsistency:** Session file written with `await fsPromises.writeFile` in `getWorkStatus` but read with sync `fs.readFileSync` in `startWork`. Works correctly — noted for consistency awareness.

Verified complete by second pass.
