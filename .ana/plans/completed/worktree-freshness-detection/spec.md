# Spec: Worktree freshness detection

**Created by:** AnaPlan
**Date:** 2026-05-12
**Scope:** .ana/plans/active/worktree-freshness-detection/scope.md

## Approach

Two additive changes, both following patterns that already exist in the codebase:

**1. `commitsBehind` field.** Mirror the existing `commitCount` computation in `getWorktreeInfo` (worktree.ts:304-316) with reversed rev-list arguments: `git rev-list --count ${branchName}..${artifactBranch}`. Same try-catch, same default-to-0. Surface the count at three display points: `work status` (printHumanReadable), `startBuildPhase` resume path (printExistingWorktree), and `pr create`. All warnings are informational yellow text — no operations blocked.

**2. `base_commit` field.** At `work complete` time, compute `git merge-base ${artifactBranch} ${branchName}` and store the 40-char SHA in the proof chain entry's `worktree` object. Compute alongside the existing worktree metadata capture at work.ts:1520-1527 (before worktree removal at 1541 and branch deletion at 1583). Follow the error handling pattern from artifact.ts:144-150: try-catch, silently omit on failure.

**Design decisions:**

- **`pr.ts` uses a best-effort fetch before the behind-check.** PR creation is already a network operation (`gh pr create`). One more fetch doesn't meaningfully slow it, and accuracy matters at PR time. The behind-count is computed inline with `runGit(['rev-list', '--count', ...])` — no need to import `getWorktreeInfo` since `pr.ts` already has `currentBranch` and `artifactBranch`.
- **`startBuildPhase`/`printExistingWorktree` uses local refs only, no fetch.** `work status` (which fetches at line 683) gives the accurate number. Adding a network call to every build resume is unnecessary.
- **`printExistingWorktree` already duplicates commit-count logic from `getWorktreeInfo`** (noted in proof findings as "Kind-aware branch prefixes" finding). This scope adds `commitsBehind` to `printExistingWorktree` using the same inline pattern — don't refactor the duplication in this scope, just mirror the existing approach.

## Output Mockups

### `work status` — worktree line when behind

```
    Worktree: .ana/worktrees/my-feature (2 commits, last activity today) ⚠ 3 behind main
```

When not behind, no extra text (same as current):
```
    Worktree: .ana/worktrees/my-feature (2 commits, last activity today)
```

When stale AND behind:
```
    Worktree: .ana/worktrees/my-feature (0 commits, last activity 15d ago) ⚠ stale ⚠ 3 behind main
```

### `startBuildPhase` resume — existing worktree print with behind-warning

```
Worktree exists for `my-feature`.
  Path: .ana/worktrees/my-feature
  Branch: feature/my-feature
  Commits: 2 since branch point
  ⚠ 5 commits behind main. Consider rebasing before building.

cd .ana/worktrees/my-feature
```

When not behind, no extra line (same as current).

### `pr create` — behind-warning before PR creation

```
⚠ Branch is 3 commits behind main. Consider rebasing before merging.
```

Printed before the PR body generation. Yellow text. When not behind, nothing printed.

### `work status --json` — worktreeInfo object

```json
{
  "worktreeInfo": {
    "path": ".ana/worktrees/my-feature",
    "branch": "feature/my-feature",
    "commitCount": 2,
    "commitsBehind": 3,
    "lastActivityDays": 0,
    "isStale": false
  }
}
```

### Proof chain entry — worktree object with base_commit

```json
{
  "worktree": {
    "used": true,
    "created_at": "2026-05-12T10:00:00Z",
    "completed_at": "2026-05-12T12:00:00Z",
    "commit_count": 3,
    "base_commit": "abc123def456789012345678901234567890abcd"
  }
}
```

## File Changes

### `packages/cli/src/utils/worktree.ts` (modify)
**What changes:** Add `commitsBehind: number` to `WorktreeInfo` interface. Add a second `rev-list --count` call in `getWorktreeInfo` with reversed arguments (`${branchName}..${artifactBranch}`).
**Pattern to follow:** The existing `commitCount` computation at lines 304-316 — identical structure, reversed arguments, same try-catch defaulting to 0.
**Why:** This is the single source of truth for worktree status data. All display points consume `WorktreeInfo`.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Four touch points:
1. `printHumanReadable` (~line 647-651): Append behind-count to the worktree display line when `commitsBehind > 0`. Format: `⚠ N behind {artifactBranch}` in yellow, after the existing stale flag.
2. `printExistingWorktree` (~line 2013-2041): Add an inline `rev-list --count` for behind-count (same pattern as the existing inline `commitCount` at lines 2029-2035). Print warning line when > 0.
3. Worktree metadata capture (~line 1520-1527): Compute `git merge-base ${artifactBranch} ${workBranchName}` and store as `base_commit`. Add to `worktreeMeta` object at ~line 1553-1558.
4. JSON output: `WorktreeInfo` already flows into JSON output via `getWorktreeInfo` — no additional change needed for `commitsBehind` in JSON.
**Pattern to follow:** `printHumanReadable` stale flag pattern (line 650) for conditional display. `artifact.ts:144-150` for merge-base error handling.
**Why:** These are the three user-facing moments where behind-count matters: status check, build resume, and completion.

### `packages/cli/src/types/proof.ts` (modify)
**What changes:** Add `base_commit?: string` to the `ProofChainEntry.worktree` type (after `commit_count` at line 95).
**Pattern to follow:** Existing optional fields on the same type — `kind?: string` on the parent entry follows the same pattern.
**Why:** Records what commit the code was verified against. Enables future analysis of proof chain integrity.

### `packages/cli/src/commands/pr.ts` (modify)
**What changes:** After reading `artifactBranch` and `currentBranch` (around line 167), add a best-effort fetch + behind-count check. Compute `rev-list --count ${currentBranch}..${artifactBranch}` after fetching. Print yellow warning if > 0.
**Pattern to follow:** The `work status` fetch pattern at work.ts:682-694 — best-effort fetch, silently continue on failure. The behind-count computation follows the same `rev-list` pattern as worktree.ts.
**Why:** PR creation is the last moment to catch staleness before the PR exists. A warning here saves a rebase-after-review cycle.

### `packages/cli/tests/utils/worktree.test.ts` (modify)
**What changes:** Add tests for `commitsBehind` computation inside the existing `getWorktreeInfo` describe block. Test: freshly-created worktree has `commitsBehind: 0`; after adding a commit to main, `commitsBehind` is 1.
**Pattern to follow:** The existing `getWorktreeInfo` tests at lines 350-383. Same `createTestProject` + `createWorktree` setup.
**Why:** Validates the core computation — everything else is display logic consuming this field.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** Add tests for behind-warning display in `work status` output. Test: when worktree is behind, status output contains the behind warning text; when not behind, output does not contain it.
**Pattern to follow:** The existing `captureOutput` + `getWorkStatus` pattern at lines 435-437.
**Why:** Validates the user-visible warning surfaces correctly.

## Acceptance Criteria

- [ ] AC1: `getWorktreeInfo` returns a `commitsBehind` field — the count of commits on the artifact branch not on the worktree branch
- [ ] AC2: `commitsBehind` is 0 when the worktree is up to date with the artifact branch
- [ ] AC3: `commitsBehind` is correctly computed when the artifact branch has advanced
- [ ] AC4: `commitsBehind` defaults to 0 on git failure (same error-swallowing pattern as `commitCount`)
- [ ] AC5: `work status` displays `commitsBehind` alongside existing worktree info when count > 0
- [ ] AC6: `work status` does NOT show behind-count when `commitsBehind` is 0
- [ ] AC7: `startBuildPhase` resume path prints a warning when `commitsBehind > 0`
- [ ] AC8: `printExistingWorktree` includes `commitsBehind` in its output when > 0
- [ ] AC9: `pr create` warns when the work branch is behind the artifact branch
- [ ] AC10: All warnings are informational (yellow text, not red errors) — they do not block any operation
- [ ] AC11: `work complete` computes `git merge-base` and stores result as `base_commit` in proof chain worktree object
- [ ] AC12: `base_commit` is a 40-character git SHA (full hash, not abbreviated)
- [ ] AC13: If `merge-base` fails, `base_commit` is omitted (not null, not empty string — absent)
- [ ] AC14: Old proof chain entries without `base_commit` continue to work
- [ ] AC15: `ProofChainEntry.worktree` type includes `base_commit?: string`
- [ ] AC16: No existing tests break. Test count increases.
- [ ] AC17: `work status --json` includes `commitsBehind` in the worktree info object

## Testing Strategy

- **Unit tests (worktree.test.ts):**
  - `commitsBehind` is 0 for a freshly-created worktree (no divergence)
  - `commitsBehind` is N after adding N commits to main while worktree exists
  - `commitsBehind` is 0 when worktree has commits but main hasn't advanced
  - Both `commitCount` and `commitsBehind` are correct simultaneously (worktree ahead AND behind)

- **Integration tests (work.test.ts):**
  - `work status` output contains behind-warning text when worktree is behind
  - `work status` output does NOT contain behind-warning text when worktree is fresh
  - `work status --json` output includes `commitsBehind` field in worktree info

- **Edge cases:**
  - Git failure during rev-list: defaults to 0, no crash
  - Worktree doesn't exist: `getWorktreeInfo` returns null (existing behavior, unchanged)
  - `merge-base` failure in `completeWork`: `base_commit` key absent from worktree meta, no crash

## Dependencies

None. All patterns exist in the codebase. No new npm packages.

## Constraints

- All changes are additive — no existing behavior changes.
- `commitsBehind` rev-list runs with `cwd: wtPath` (same as `commitCount`). Both branch refs are visible from the worktree.
- `base_commit` computation must happen before worktree removal (line 1541) and branch deletion (line 1583).
- Old proof chain entries without `base_commit` must not break any consumer. The field is optional (`?:`).

## Gotchas

- **`printExistingWorktree` duplicates rev-list logic.** It computes `commitCount` inline (lines 2029-2035) rather than calling `getWorktreeInfo`. Add `commitsBehind` using the same inline pattern — don't refactor the duplication in this scope. There's a known proof finding about this duplication from the `kind-aware-branch-prefixes` scope.
- **`pr.ts` needs `runGit` imported.** Check existing imports — `pr.ts` currently uses `spawnSync` directly and imports some git helpers. It imports `getCurrentBranch` from `../utils/git-operations.js`. It may need `runGit` added to that import.
- **`artifactBranch` variable name in `pr.ts`.** It's already computed at line 163. Use that variable for both the fetch and the rev-list — don't re-read it.
- **`worktreeMeta` typing.** The `worktreeMeta` object at work.ts:1553-1558 is constructed inline (not typed). Adding `base_commit` conditionally means: compute it, then only include it in the object if it's defined. Use spread: `...(baseCommit ? { base_commit: baseCommit } : {})`.
- **`pr.ts` fetch target.** Fetch `origin ${artifactBranch}` (same as work.ts:683), not `origin` (which fetches all refs and is slower).

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Error handling in commands: `chalk.yellow` for warnings (not `chalk.red` — these are informational).
- Early returns over nested conditionals.
- Explicit return types on exported functions.
- `@param` and `@returns` JSDoc on exported functions.
- Always use `--run` with `pnpm vitest` to avoid watch mode hang.

### Pattern Extracts

**commitCount computation (worktree.ts:304-316) — structural analog for commitsBehind:**
```typescript
  // Count commits since branch point
  let commitCount = 0;
  try {
    const result = runGit(
      ['rev-list', '--count', `${artifactBranch}..${branchName}`],
      { cwd: wtPath }
    );
    if (result.exitCode === 0) {
      commitCount = parseInt(result.stdout) || 0;
    }
  } catch {
    // Ignore — default 0
  }
```

**merge-base computation (artifact.ts:144-150) — structural analog for base_commit:**
```typescript
    let mergeBase: string;
    try {
      const mbResult = runGit(['merge-base', artBranch, 'HEAD'], { cwd: projectRoot });
      if (mbResult.exitCode !== 0) return; // Expected on new repos — silently skip
      mergeBase = mbResult.stdout;
    } catch {
      return; // Expected on new repos — silently skip
    }
```

**Worktree display line (work.ts:648-651) — where behind-count appends:**
```typescript
    if (item.worktreeInfo) {
      const wt = item.worktreeInfo;
      const activityLabel = wt.lastActivityDays === 0 ? 'today' : `${wt.lastActivityDays}d ago`;
      const staleFlag = wt.isStale ? chalk.yellow(' ⚠ stale') : '';
      console.log(`    Worktree: ${path.relative(process.cwd(), wt.path) || wt.path} (${wt.commitCount} commit${wt.commitCount !== 1 ? 's' : ''}, last activity ${activityLabel})${staleFlag}`);
    }
```

**printExistingWorktree inline commitCount (work.ts:2028-2041) — where behind-count adds a line:**
```typescript
  let commitCount = 0;
  try {
    const result = runGit(
      ['rev-list', '--count', `${artifactBranch}..${branchName}`],
      { cwd: wtPath }
    );
    if (result.exitCode === 0) commitCount = parseInt(result.stdout) || 0;
  } catch { /* ignore */ }

  console.log(`Worktree exists for \`${slug}\`.`);
  console.log(`  Path: ${path.relative(process.cwd(), wtPath) || wtPath}`);
  console.log(`  Branch: ${branchName}`);
  console.log(`  Commits: ${commitCount} since branch point`);
  console.log(`\ncd ${path.relative(process.cwd(), wtPath) || wtPath}`);
```

**Worktree metadata capture (work.ts:1520-1558) — where base_commit inserts:**
```typescript
  // 8c. Capture worktree metadata BEFORE removal (needed for proof chain)
  const wtPath = getWorktreePath(projectRoot, slug);
  const worktreeUsed = fs.existsSync(wtPath);
  let worktreeCommitCount = 0;
  if (worktreeUsed) {
    const wtInfo = getWorktreeInfo(projectRoot, slug, branchPrefix);
    worktreeCommitCount = wtInfo?.commitCount ?? 0;
  }
  // ...
  const worktreeMeta = {
    used: worktreeUsed,
    created_at: worktreeCreatedAt,
    completed_at: new Date().toISOString(),
    commit_count: worktreeCommitCount,
  };
```

### Proof Context

**worktree.ts:** "Detached HEAD produces branchName '(unknown)'" and "rev-parse --abbrev-ref HEAD returns literal 'HEAD'" findings from kind-aware-branch-prefixes — not relevant to this scope since `commitsBehind` uses the same `branchName` variable as `commitCount`. If the branch name is wrong, both fields fail identically.

**work.ts:** "printExistingWorktree duplicates HEAD-reading logic from getWorktreeInfo" — directly relevant. This scope adds `commitsBehind` to the same duplicated pattern rather than refactoring. Noted in Gotchas.

**pr.ts:** No active proof findings.

**proof.ts:** "ProofChainEntryForContext duplicates type knowledge" build concern — not relevant. `base_commit` is added to `ProofChainEntry.worktree`, not to the context type.

### Checkpoint Commands

- After `worktree.ts` + `proof.ts` changes: `(cd packages/cli && pnpm vitest run --run tests/utils/worktree.test.ts)` — Expected: existing tests pass, new tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: all tests pass, count > 2156
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2156 passed, 2 skipped (2158 total)
- Current test files: 100
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2164+ tests in 100 files (new tests in existing files)
- Regression focus: `tests/utils/worktree.test.ts`, `tests/commands/work.test.ts`
