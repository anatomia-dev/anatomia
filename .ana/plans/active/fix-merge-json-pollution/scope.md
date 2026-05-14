# Scope: Fix --merge stdout pollution in --json mode

**Created by:** Ana
**Date:** 2026-05-14

## Intent

`ana work complete --merge --json <slug>` produces invalid JSON output. Progress messages ("Merging PR...", "PR merged.") and pull-recovery warnings write to stdout before the JSON envelope, breaking any consumer that pipes the output to `jq` or parses it programmatically. The fix guards these messages behind `if (!options?.json)` and adds test coverage for the `--merge --json` interaction.

## Complexity Assessment

- **Kind:** fix
- **Size:** small — 5 guard wraps + 1 test
- **Files affected:** `src/commands/work.ts`, `tests/commands/work-merge.test.ts`
- **Blast radius:** Zero behavioral change. Human-readable output unchanged. Only suppresses text when `--json` is set.
- **Estimated effort:** <30 minutes build + verify
- **Multi-phase:** no

## Approach

Guard all unguarded `console.log` calls in the `--merge` and pull-recovery paths with `if (!options?.json)`. Add a test that calls `completeWork(slug, { json: true, merge: true })` through the already-merged path and asserts stdout is valid JSON with no preceding text.

## Acceptance Criteria

- AC1: `ana work complete --merge --json <slug>` produces exactly one JSON object on stdout with no preceding text, for both the "already merged" and "merge succeeded" paths.
- AC2: Pull-recovery warning messages (untracked artifact removal) do not appear on stdout when `--json` is set.
- AC3: Human-readable output (without `--json`) is unchanged — all progress messages still appear.
- AC4: A test in `work-merge.test.ts` exercises `--merge --json` and validates stdout parses as JSON.

## Edge Cases & Risks

- The `console.error` calls in error paths (branch protection, merge failure, etc.) write to stderr, not stdout. These don't pollute JSON and should NOT be suppressed — they're useful diagnostics even in `--json` mode where the JSON error also goes to stdout.
- The recovery path at line 1354 is already guarded. No change needed there.

## Rejected Approaches

- **Refactoring to a logger abstraction:** Would be "foundation" in theory but the CLI already has a consistent pattern (`if (!options?.json)` guards) used throughout `completeWork`. Adding a logger for 5 lines is scaffolding, not foundation. Match the existing pattern.
- **Redirecting progress to stderr:** Some CLIs put progress on stderr so stdout is always machine-readable. This would be a larger design decision affecting the entire CLI surface. Not appropriate for a bug fix scope.

## Open Questions

None. The fix is fully determined.

## Exploration Findings

### Patterns Discovered

- `work.ts:1353-1354`: The recovery path already uses the correct pattern: `if (!options?.json) { console.log(...) }`. This is the structural template for the fix.
- Error paths (lines 1117-1228) correctly pair `console.error` (always) + `if (options?.json) { JSON error }` + `process.exit(1)`. These are fine — stderr doesn't pollute stdout.

### Constraints Discovered

- [TYPE-VERIFIED] `options` parameter (work.ts:1062) — `{ json?: boolean; merge?: boolean }`. Both flags are optional booleans.
- [OBSERVED] `work-merge.test.ts` uses `vi.mock('node:child_process')` — tests in this file mock `spawnSync` to simulate `gh` CLI responses. The JSON test should use the same infrastructure.
- [OBSERVED] No existing test covers `{ json: true, merge: true }` together — the merge tests don't pass `json: true`, and the JSON tests in `work.test.ts` don't pass `merge: true`.

### Test Infrastructure

- `work-merge.test.ts`: Isolated test file with full `vi.mock` setup for `child_process`, `fs`, and git operations. Has helpers for simulating PR states (merged, open, etc.).
- `work.test.ts:2778`: Recovery JSON test — demonstrates how to capture and assert on JSON stdout output.

## For AnaPlan

### Structural Analog

`work.ts:1353-1354` — the recovery path's `if (!options?.json)` guard. Exact same pattern, same function, same options object. Copy this pattern 5 times.

### Relevant Code Paths

- `src/commands/work.ts:1150-1232` — merge block with 3 unguarded console.log calls
- `src/commands/work.ts:1278-1307` — pull-recovery block with 2 unguarded console.log calls
- `src/commands/work.ts:1345-1400` — crash recovery (already guarded, reference only)
- `tests/commands/work-merge.test.ts` — merge test infrastructure

### Patterns to Follow

- `work.ts:1353` for the guard pattern
- `work-merge.test.ts` for test setup and mock structure
- `work.test.ts:2778` for JSON output assertion pattern

### Known Gotchas

- `work-merge.test.ts` uses `vi.mock('node:child_process')` which requires test isolation (separate file from `work.test.ts`). The new test belongs in this file.
- The mock setup simulates `gh pr view` responses. To test the "already merged" JSON path, set `prData.state` to `'MERGED'` in the mock response.

### Things to Investigate

None. The fix is mechanical and fully specified.
