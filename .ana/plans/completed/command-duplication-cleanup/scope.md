# Scope: Command File Duplication Cleanup

**Created by:** Ana
**Date:** 2026-05-20

## Intent
Clean up duplicated and misplaced logic in work.ts and proof.ts — the two largest command files (~2500 and ~2400 lines). Four extractions plus one module move. All pure refactors, zero behavior changes.

Source: Learn Session 7, 5 findings about duplication. One finding (isTimestampRecent → checkConcurrencyGuard delegation) rejected after investigation — see Rejected Approaches.

## Complexity Assessment
- **Kind:** chore
- **Size:** small — 4 mechanical extractions + 1 function move, no new logic
- **Surface:** cli
- **Files affected:** `packages/cli/src/commands/work.ts`, `packages/cli/src/commands/proof.ts`, `packages/cli/src/utils/git-operations.ts`, `packages/cli/src/commands/learn.ts` (import path only)
- **Blast radius:** Command layer only. No behavior changes. All extractions preserve existing function signatures and output. learn.ts import path update is mechanical.
- **Estimated effort:** ~1 hour
- **Multi-phase:** no

## Approach
Extract duplicated logic into single-source-of-truth functions within the files that use them, and move two misplaced git utilities from a command file to the utility module where they belong. Every change is a pure refactor — same inputs, same outputs, fewer copies.

## Acceptance Criteria
- AC1: Resolves counting in `completeWork` is computed once before the JSON/console branch, not duplicated in each branch
- AC2: Line 1930 in work.ts uses `getCurrentBranch() ?? '(unknown)'` instead of inline `runGit` + manual exitCode check
- AC3: The duplicated 11-field empty audit matrix payload in proof.ts is extracted to a named constant and used at both call sites (lines ~1651 and ~1696)
- AC4: `pullBeforeRead` and `commitAndPushProofChanges` are exported from `git-operations.ts`, not `proof.ts`
- AC5: learn.ts imports both functions from `../utils/git-operations.js` instead of `./proof.js`
- AC6: All existing tests pass without modification — any test change signals a behavior change
- AC7: `isTimestampRecent` remains unchanged as a separate function in work.ts

## Edge Cases & Risks
- The `EMPTY_AUDIT_MATRIX` constant and the `wrapJsonResponse` call sites differ in their second argument (`{ entries: [] }` vs `chain`). Only the first argument (the matrix payload) should be extracted. The `wrapJsonResponse` calls themselves stay inline.
- `commitAndPushProofChanges` uses `spawnSync` directly (not `runGit`). When moving to git-operations.ts, the `spawnSync` import must come along. Verify git-operations.ts doesn't already import it to avoid duplicate imports.
- proof.ts will still import `runGit` from git-operations.ts for its own use. Moving two functions out doesn't eliminate the import — it just stops proof.ts from re-exporting git utilities.

## Rejected Approaches

### Finding 1: Delegate isTimestampRecent to checkConcurrencyGuard

The Learn Session recommended rewriting `isTimestampRecent` to `return checkConcurrencyGuard(savesDir, timestampKey, '', false).blocked`. Rejected because:

1. **Different responsibilities.** `isTimestampRecent` is a read-only status query used by `determineStage` during `work status`. `checkConcurrencyGuard` is a blocking guard that constructs formatted error messages with slugs and elapsed times. Coupling them means changes to the guard silently affect status display.
2. **Wasted work.** The guard builds a human-readable message on every call (slug name, elapsed time formatting). `determineStage` never reads it — it only checks `.blocked`. The delegation would construct and discard a string on every status check.
3. **False economy.** The 14-line function is simple, self-contained, and correct. It reads a file, parses a timestamp, returns a boolean. Making it delegate to a 48-line function with a richer return type doesn't make the code easier to understand — it makes it harder.

The duplication is structural coincidence (both parse timestamps from the same file format), not a shared concern. Two functions with the same mechanics but different contracts is separation of concerns, not redundancy.

## Open Questions
None — all findings investigated to source level.

## Exploration Findings

### Patterns Discovered
- work.ts uses `getCurrentBranch()` at 4 call sites (lines 767, 1240, 2007, 2086) — line 1930 is the only outlier using inline `runGit`
- proof.ts audit command has two early-return paths for empty state (no chain file at line 1648, empty entries at line 1694), both producing identical matrix JSON

### Constraints Discovered
- [TYPE-VERIFIED] `getCurrentBranch` returns `string | null` (git-operations.ts:207-209) — `null` on failure, matching `?? '(unknown)'` pattern
- [OBSERVED] `pullBeforeRead` and `commitAndPushProofChanges` use only `runGit`, `chalk`, `spawnSync` — no proof-specific imports, no circular dependency risk
- [OBSERVED] `wrapJsonResponse` second argument differs between the two audit empty paths: `{ entries: [] }` vs `chain` — cannot deduplicate the full call, only the matrix payload

### Test Infrastructure
- `tests/commands/work.test.ts` — covers `determineStage`, `completeWork` JSON/console output, concurrency guards
- `tests/commands/proof.test.ts` — covers audit empty-chain and filtered-empty scenarios
- `tests/utils/` — git-operations tests exist

## For AnaPlan

### Structural Analog
`getCurrentBranch()` in git-operations.ts (lines 207-209) — a small utility extracted from inline `runGit` calls. The resolves counting extraction follows the same pattern: inline logic → named function called before branching.

### Relevant Code Paths
- `packages/cli/src/commands/work.ts:1849-1887` — resolves counting in both branches of completeWork
- `packages/cli/src/commands/work.ts:1930-1931` — inline branch reading in startWork resume path
- `packages/cli/src/commands/proof.ts:1651-1662, 1696-1707` — duplicated empty audit matrix payloads
- `packages/cli/src/commands/proof.ts:151-225` — pullBeforeRead and commitAndPushProofChanges function bodies
- `packages/cli/src/commands/learn.ts:18` — import line to update
- `packages/cli/src/utils/git-operations.ts` — destination for moved functions

### Patterns to Follow
- git-operations.ts export style: `export function name(params): ReturnType { ... }` with JSDoc
- Constants in proof.ts are defined near their usage (see existing patterns in the audit command section)

### Known Gotchas
- `commitAndPushProofChanges` uses `spawnSync` (node:child_process) directly, not `runGit`. When moving to git-operations.ts, bring the import. Check if git-operations.ts already imports `spawnSync`.
- proof.ts line 30 imports `runGit` from git-operations.ts. After moving the two functions, proof.ts still needs this import for its own inline `runGit` calls. Don't accidentally remove it.
- The `chalk` import is used by both moved functions. git-operations.ts may not import chalk yet — check and add if needed.

### Things to Investigate
- Where in git-operations.ts to place the moved functions. The file currently has `runGit` → `readArtifactBranch` → `readBranchPrefix` → `readCoAuthor` → `getCurrentBranch`. The two new functions are higher-level (pull + commit+push vs read-only queries). Consider placing them at the end with a section comment, or grouping by read vs write operations.
