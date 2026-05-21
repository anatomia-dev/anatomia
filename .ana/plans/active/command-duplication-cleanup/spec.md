# Spec: Command File Duplication Cleanup

**Created by:** AnaPlan
**Date:** 2026-05-20
**Scope:** .ana/plans/active/command-duplication-cleanup/scope.md

## Approach

Four mechanical extractions plus one module move. All pure refactors — same inputs, same outputs, fewer copies. No new logic, no behavior changes.

1. **Resolves counting hoisted above branch (work.ts).** The JSON branch (lines ~1849-1857) and console branch (lines ~1880-1887) each compute `resolvesClaimsCount` / `resolvesCount` with identical loops over `proof.findings`. Compute the count once before the `if (useJson)` branch, use it in both. Variable name: `resolvesClaimsCount` (the more descriptive of the two).

2. **Inline branch read → getCurrentBranch (work.ts).** Line 1930-1931 runs `runGit(['rev-parse', '--abbrev-ref', 'HEAD'])` and checks `exitCode` manually. The rest of the file uses `getCurrentBranch()` which does the exact same thing. Replace with `getCurrentBranch() ?? '(unknown)'`.

3. **Empty audit matrix constant (proof.ts).** The 11-field zeroed-out matrix payload appears identically at two call sites (lines ~1651 and ~1696). Extract to `const EMPTY_AUDIT_MATRIX` defined once near the audit section. The `wrapJsonResponse` calls stay inline — only the first argument (the matrix object) is deduplicated. The second argument differs between call sites (`{ entries: [] }` vs `chain`).

4. **Move pullBeforeRead + commitAndPushProofChanges to git-operations.ts.** These are git utilities that happen to live in proof.ts. They depend only on `runGit`, `chalk`, and `spawnSync` — all already imported in git-operations.ts. Place them at the end of git-operations.ts after `getCurrentBranch`, preserving their existing JSDoc comments and function signatures. Update proof.ts to import them from git-operations.ts. Update learn.ts to import from `../utils/git-operations.js` instead of `./proof.js`.

**Open question resolution:** The scope asked where to place the moved functions in git-operations.ts. Decision: at the end, after `getCurrentBranch`. The file progresses from low-level (`runGit`) to read-only queries. The two write operations are the highest-level, so they go last.

## Output Mockups

No user-visible output changes. All refactors preserve existing function signatures, return values, and console output. The only observable difference is import paths in source files.

## File Changes

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** (1) Hoist the resolves-counting loop above the JSON/console branch so it runs once. Remove the duplicate loop from the console branch. (2) Replace the inline `runGit` + exitCode check at line ~1930-1931 with `getCurrentBranch() ?? '(unknown)'`.
**Pattern to follow:** The four other `getCurrentBranch()` call sites already in work.ts (lines 767, 1240, 2007, 2086).
**Why:** Two identical loops computing the same count is a maintenance trap — a fix to one must be mirrored in the other.

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** (1) Extract the 11-field zeroed-out audit matrix to `const EMPTY_AUDIT_MATRIX`. Use it at both early-return call sites. (2) Remove `pullBeforeRead` and `commitAndPushProofChanges` function definitions. (3) Add imports of both functions from `../utils/git-operations.js`. (4) Remove the `spawnSync` import from `node:child_process` (only used by `commitAndPushProofChanges`; `chalk` stays — used throughout proof.ts).
**Pattern to follow:** Existing constant definitions in the file (defined near usage, uppercase snake case).
**Why:** The two functions are git utilities, not proof commands. Moving them to git-operations.ts eliminates cross-command importing (learn.ts importing from proof.ts).

### `packages/cli/src/utils/git-operations.ts` (modify)
**What changes:** Add `pullBeforeRead` and `commitAndPushProofChanges` as exported functions at the end of the file. Both functions use `runGit`, `chalk`, and `spawnSync` — all already imported. No new imports needed.
**Pattern to follow:** Existing export style in git-operations.ts — `export function name(params): ReturnType` with JSDoc including `@param` and `@returns` tags.
**Why:** These are git utilities (pull, commit, push) that belong alongside `runGit` and `getCurrentBranch`, not inside a command file.

### `packages/cli/src/commands/learn.ts` (modify)
**What changes:** Change the import of `commitAndPushProofChanges` and `pullBeforeRead` from `'./proof.js'` to `'../utils/git-operations.js'`. Merge into the existing git-operations import line.
**Pattern to follow:** The existing import on line 17 already pulls `readArtifactBranch`, `getCurrentBranch`, `readCoAuthor` from git-operations.js — add the two functions to that import.
**Why:** learn.ts should not cross-import from a sibling command file. The utility module is the correct dependency direction.

## Acceptance Criteria
- [ ] AC1: Resolves counting in `completeWork` is computed once before the JSON/console branch, not duplicated in each branch
- [ ] AC2: Line ~1930 in work.ts uses `getCurrentBranch() ?? '(unknown)'` instead of inline `runGit` + manual exitCode check
- [ ] AC3: The duplicated 11-field empty audit matrix payload in proof.ts is extracted to a named constant and used at both call sites
- [ ] AC4: `pullBeforeRead` and `commitAndPushProofChanges` are exported from `git-operations.ts`, not `proof.ts`
- [ ] AC5: learn.ts imports both functions from `../utils/git-operations.js` instead of `./proof.js`
- [ ] AC6: All existing tests pass without modification — any test change signals a behavior change
- [ ] AC7: `isTimestampRecent` remains unchanged as a separate function in work.ts
- [ ] AC8: No build errors
- [ ] AC9: No new lint violations introduced

## Testing Strategy
- **Unit tests:** No new tests needed. This is a pure refactor — all behavior is unchanged. AC6 is the primary verification: the existing 2713 tests must pass without modification.
- **Integration tests:** None — no new behavior to integrate.
- **Edge cases:** None — the refactoring preserves all existing edge case handling.
- **Regression focus:** `tests/commands/work.test.ts` (resolves counting output), `tests/commands/proof.test.ts` (audit empty-chain and filtered-empty paths), `tests/utils/git-operations.test.ts` (import resolution still works after adding exports).

## Dependencies
None — all changes are internal refactoring of existing code.

## Constraints
- **Zero behavior changes.** Every function must produce identical output for identical input. If any test needs modification, the refactor has introduced a behavior change and must be reverted.
- **No new imports in git-operations.ts.** The file already has `spawnSync`, `chalk`, and its own `runGit`. The moved functions use only these.
- **proof.ts still imports runGit from git-operations.ts.** Moving two functions out does not eliminate the import — proof.ts uses `runGit` directly in dozens of places.

## Gotchas

- **spawnSync import in proof.ts:** After removing `pullBeforeRead` and `commitAndPushProofChanges`, the `spawnSync` import (line 24) becomes unused. Remove it — but verify no other code in proof.ts uses `spawnSync` directly. (Confirmed: only `commitAndPushProofChanges` uses it.)
- **chalk stays in proof.ts:** Even though `commitAndPushProofChanges` uses `chalk`, proof.ts uses chalk extensively elsewhere. Do NOT remove the chalk import from proof.ts.
- **commit.ts comment reference:** `packages/cli/src/commands/init/commit.ts` line 6 mentions `commitAndPushProofChanges` in a comment describing a pattern analogy. Leave it unchanged — it's documentation, not a dependency.
- **git-operations.ts line 198 lint warning:** There's a pre-existing unused `eslint-disable-next-line no-control-regex` concern flagged by many verify cycles. This is not related to this work — don't fix it, don't break it.
- **EMPTY_AUDIT_MATRIX must be a fresh object per use or a frozen constant.** Since `wrapJsonResponse` receives it as an argument and JSON.stringify doesn't mutate, a shared `const` is safe. No need for `Object.freeze` or factory function.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. No default exports.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Prefer early returns over nested conditionals.

### Pattern Extracts

**getCurrentBranch usage pattern (work.ts:2007)** — the pattern to follow for AC2:
```typescript
// work.ts:2007
const currentBranch = getCurrentBranch();
```

**Existing git-operations.ts export style (lines 207-210)** — the pattern for placed functions:
```typescript
/**
 * Get the current git branch name, or null if not in a git repo.
 *
 * @returns Current branch name, or null on failure
 */
export function getCurrentBranch(): string | null {
  const result = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  return result.exitCode === 0 ? result.stdout : null;
}
```

**The two identical audit matrix payloads (proof.ts:1651-1662 and 1696-1707):**
```typescript
{
  total_active: 0,
  actionable_count: 0,
  monitoring_count: 0,
  by_severity: { risk: 0, debt: 0, observation: 0, unclassified: 0 },
  by_action: { promote: 0, scope: 0, monitor: 0, accept: 0, unclassified: 0 },
  by_severity_action: {},
  recent_entries: [],
  stale_count: 0,
  stale_high: 0,
  stale_medium: 0,
}
```

**learn.ts existing git-operations import (line 17):**
```typescript
import { readArtifactBranch, getCurrentBranch, readCoAuthor } from '../utils/git-operations.js';
```

### Proof Context

**work.ts (top findings):**
- `[code] upstream-finding-resolution-C1`: work.ts duplicates resolves counting logic — JSON and console branches have identical loops. **Directly addressed by AC1.**
- `[code] kind-aware-branch-prefixes-C6`: startWork resume path duplicates HEAD-reading pattern. **Directly addressed by AC2.**
- `[code] pipeline-concurrency-guards-C2`: isTimestampRecent duplicates checkConcurrencyGuard logic. **Explicitly out of scope per AC7.**

**proof.ts:** No findings directly related to the audit matrix extraction or the function move.

**git-operations.ts:** Pre-existing lint warning at line 198 (unused eslint-disable directive) — flagged by 10+ verify cycles. Not related to this work.

**learn.ts:** No active proof findings.

### Checkpoint Commands
- After work.ts changes: `(cd 'packages/cli' && pnpm vitest run tests/commands/work.test.ts)` — Expected: all work tests pass
- After proof.ts changes: `(cd 'packages/cli' && pnpm vitest run tests/commands/proof.test.ts)` — Expected: all proof tests pass
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 2713 tests pass, 2 skipped, 120 test files
- Lint: `(cd 'packages/cli' && pnpm run lint)`

### Build Baseline
- Current tests: 2713 passed, 2 skipped
- Current test files: 120
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: 2713 passed, 2 skipped, 120 test files (no new tests — pure refactor)
- Regression focus: `tests/commands/work.test.ts`, `tests/commands/proof.test.ts`, `tests/utils/git-operations.test.ts`
