# Build Report: Version Awareness Notifications

**Created by:** AnaBuild
**Date:** 2026-05-10
**Spec:** .ana/plans/active/version-awareness/spec.md
**Branch:** feature/version-awareness

## What Was Built

- `packages/cli/src/utils/update-check.ts` (created): New utility module with five exports — `isNewerVersion` (pure semver comparison), `readUpdateCache` (sync cache read), `spawnUpdateCheck` (detached background npm fetch), `getProjectAnaVersion` (ana.json version reader), `checkForUpdates` (async orchestrator). All functions are silent on error. Cache uses 24h TTL. CI environments skip npm checks entirely. Path interpolation in spawn script uses `JSON.stringify` for injection safety.
- `packages/cli/tests/utils/update-check.test.ts` (created): 30 tests across 5 describe blocks. Tests isNewerVersion (9 cases including multi-digit, malformed, edge cases), readUpdateCache (5 cases with fixtures), getProjectAnaVersion (5 cases including 0.0.0 and missing), spawnUpdateCheck (3 cases verifying detached/unref/windowsHide/CI-skip), checkForUpdates (8 integration cases). Uses `vi.mock` at module level for ESM-compatible mocking of `node:child_process` and `getCliVersion`.
- `packages/cli/src/commands/work.ts` (modified): Extended `StatusOutput` with `updateAvailable` and `projectMismatch` fields. Made `getWorkStatus` async. Added `printVersionNotifications` helper. Notifications render in three paths: normal flow (before footer), empty items early return, zero-slugs early return. JSON output includes both fields. Action handler updated to async/await.
- `packages/cli/tests/commands/work.test.ts` (modified): Converted `captureOutput` helper to async-capable. Updated all 21 call sites to `await captureOutput(async () => await getWorkStatus(...))`. Updated `toThrow()` to `rejects.toThrow()` for the error test. Added 7 new notification tests covering: update available, project mismatch, suppression when current, no-work-items path, JSON output with fields, JSON output with nulls, and async regression verification.

## PR Summary

- Add version awareness to `ana work status`: non-blocking npm update check (cached, background spawn) and project ana.json version mismatch detection
- Notifications render as informational `ℹ` lines in both human-readable and JSON output, including when no active work exists
- Convert `getWorkStatus` to async with mechanical update of 21 existing test call sites — zero regressions
- Background npm check uses detached child process with 3s timeout, 24h cache TTL, CI skip, and `JSON.stringify` path escaping for injection safety
- Pure semver comparison handles multi-digit segments correctly (1.10.0 > 1.2.0)

## Acceptance Criteria Coverage

- AC1 "update notification" → work.test.ts "shows update available notification" (2 assertions: contains 'available', contains version strings)
- AC2 "project mismatch" → work.test.ts "shows project mismatch notification" (3 assertions: contains 'Project initialized with', 'ana init', version)
- AC3 "suppressed when current" → work.test.ts "suppresses notifications when versions are current" (2 assertions: not contains 'available', not contains 'initialized with')
- AC4 "network failure silent" → update-check.test.ts "returns defaults on any error" (2 assertions: updateAvailable null, projectMismatch null)
- AC5 "cache 24h TTL" → update-check.test.ts "does not spawn when fresh" + "spawns when expired" (2 tests)
- AC6 "CI skip" → update-check.test.ts "skips spawn when CI=true" + "skips npm check in CI" (2 tests)
- AC7 "JSON output" → work.test.ts "JSON output includes fields" + "JSON output shows null" (2 tests, 4 assertions)
- AC8 "first run no notification" → update-check.test.ts "returns null when no cache exists" (1 assertion)
- AC9 "command text" → work.test.ts "shows update available notification" contains 'npm update -g anatomia-cli' + "shows project mismatch" contains 'ana init'
- AC10 "anaVersion missing/0.0.0" → update-check.test.ts "returns unknown for missing" + "returns unknown for 0.0.0" (2 tests)
- AC11 "multi-digit semver" → update-check.test.ts "handles multi-digit segments" (1 assertion)
- AC12 "background process independence" → update-check.test.ts "spawns detached background process" (detached, unref, windowsHide assertions)
- AC13 "tests pass" → Full suite: 2106 passed ✅
- AC14 "no build errors" → `pnpm run build` passes ✅
- AC15 "21 existing calls work" → 150 existing work tests pass, toThrow updated to rejects.toThrow ✅

## Implementation Decisions

- Used `vi.mock` at module level for ESM-compatible mocking of `node:child_process` and `getCliVersion`, rather than `vi.spyOn` which fails on ESM module namespaces. The mock wraps the actual spawn so non-mocked behavior is preserved.
- Added `printVersionNotifications` helper function to avoid duplicating notification rendering logic across three code paths.
- Used `process.env['CI']` bracket notation instead of `process.env.CI` to satisfy TypeScript's `noPropertyAccessFromIndexSignature` compiler option.
- Notification tests use `vi.spyOn(updateCheckModule, 'checkForUpdates')` for per-test control rather than module-level `vi.mock`, since the work.test.ts already has complex setup and module-level mocking would affect all 150+ existing tests.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
 Test Files  98 passed (98)
      Tests  2069 passed | 2 skipped (2071)
   Duration  37.59s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
 Test Files  99 passed (99)
      Tests  2106 passed | 2 skipped (2108)
   Duration  38.36s
```

### Comparison
- Tests added: 37 (30 in update-check.test.ts, 7 in work.test.ts)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/utils/update-check.test.ts`: isNewerVersion (9), readUpdateCache (5), getProjectAnaVersion (5), spawnUpdateCheck (3), checkForUpdates (8)
- `packages/cli/tests/commands/work.test.ts`: version notifications (7)

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
a01acbe [version-awareness] Wire version notifications into work status
969c41e [version-awareness] Convert getWorkStatus to async
0166d57 [version-awareness] Add update-check utility module
```

## Open Issues

- The lint warning `Unused eslint-disable directive` in `src/utils/git-operations.ts:169` is pre-existing — not introduced by this build.
- The `captureWithVersionMock` helper in work.test.ts uses dynamic `vi.spyOn` on the already-imported module. This works because `checkForUpdates` is called inside the function body (not at import time), but it's a pattern that could break if Vitest changes ESM interop behavior. A module-level `vi.mock` would be more robust but would require restructuring the existing test file.
- The `toThrow()` → `rejects.toThrow()` change on line 421 was necessary because `getWorkStatus` is now async. The assertion is functionally equivalent but the error is now caught via promise rejection rather than synchronous throw. This is a mechanical consequence of the async conversion, not a weakening.

Verified complete by second pass.
