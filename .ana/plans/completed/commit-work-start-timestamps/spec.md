# Spec: Commit timestamps written by work start

**Created by:** AnaPlan
**Date:** 2026-05-08
**Scope:** .ana/plans/active/commit-work-start-timestamps/scope.md

## Approach

`work start` writes to `.saves.json` on the artifact branch in two places (Think phase, Plan phase) without committing. This creates dirty tracked state that blocks `git pull --rebase` for concurrent work. The fix: commit after each write.

Extract a private `commitSaves` helper in work.ts that stages only the slug's `.saves.json`, checks for staged changes, and commits with the configured co-author. Place it near `writeTimestamp` (bottom of file). Call it after both `writeTimestamp` calls that target the artifact branch (Think line ~1600, Plan line ~1637). The helper handles the no-op case silently — if `writeTimestamp` was a no-op (write-once guard), `git diff --staged --quiet` returns 0 and the function returns without committing.

Build/Verify/Fix phases already write to the worktree, not the artifact branch. No changes needed there.

Secondary: fix comments and user-facing messages that say "main" when they mean the artifact branch. The code already uses `artifactBranch` variable for all branch operations — only human-readable strings are wrong. "Main tree" and "main project directory" refer to git's primary working tree and must NOT be changed.

## Output Mockups

No user-visible output changes. The commit is silent — no console output. The only observable effect is that `git status` shows no dirty `.saves.json` after `work start`.

Commit messages:

```
[fix-auth-timeout] Start work

Co-authored-by: Ana <build@anatomia.dev>
```

```
[fix-auth-timeout] Start plan phase

Co-authored-by: Ana <build@anatomia.dev>
```

## File Changes

### packages/cli/src/commands/work.ts (modify)
**What changes:**
1. Add `commitSaves` helper function near `writeTimestamp`. Pattern: stage `.saves.json` with `runGit(['add', ...])`, check for changes with `spawnSync('git', ['diff', '--staged', '--quiet'])`, commit with `spawnSync('git', ['commit', '-m', ...])`. If nothing staged (status 0), return silently.
2. Call `commitSaves` after the Think phase `writeTimestamp` (line ~1600) with message `[${slug}] Start work`.
3. Call `commitSaves` after the Plan phase `writeTimestamp` (line ~1637) with message `[${slug}] Start plan phase`.
4. Fix "main" → "artifact branch" in comments and messages where "main" refers to the branch, not git's primary working tree.

**Pattern to follow:** artifact.ts lines 1260-1286 — the stage/check/commit pattern in `artifact save`.

**Why:** Without the commit, `.saves.json` is dirty on the artifact branch, blocking `git pull --rebase` in concurrent pipeline work. Confirmed failure on 2026-05-07.

### packages/cli/src/commands/artifact.ts (modify)
**What changes:** Fix one user-facing message at line ~937 that says "main" when it means the artifact branch. Change to reference `artifactBranch` variable via template literal.

**Pattern to follow:** The same file already uses `${artifactBranch}` in other messages (e.g., line 941).

**Why:** Misleading for customers whose artifact branch is not "main".

## Acceptance Criteria

- [ ] AC1: After `work start {slug}` creates a new work item (Think phase), `.saves.json` is committed to the artifact branch — `git status` shows no unstaged changes for that file
- [ ] AC2: After `work start {slug}` enters Plan phase (scope exists, no plan), `.saves.json` is committed to the artifact branch — `git status` shows no unstaged changes for that file
- [ ] AC3: Think phase commit message is `[{slug}] Start work` with co-author trailer
- [ ] AC4: Plan phase commit message is `[{slug}] Start plan phase` with co-author trailer
- [ ] AC5: Second call to `work start {slug}` for the same phase (write-once no-op) does not create an empty commit and does not error
- [ ] AC6: The commit stages only `.ana/plans/active/{slug}/.saves.json` — no other files are included
- [ ] AC7: No `git push` is executed by `work start`
- [ ] AC8: Comments and messages in work.ts and artifact.ts that say "main" when meaning the artifact branch are corrected. Messages referring to the "main project directory" or "main tree" (git's primary working tree) are left unchanged.
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors

## Testing Strategy

- **Unit tests:** Extend the existing `ana work start` describe block (work.test.ts ~line 2764). Follow the existing pattern: `createStartTestProject()` → `startWork(slug)` → assert git state.
  - **Think phase commit:** After `startWork`, verify `git log --oneline -1` shows `[slug] Start work` and `git status` shows clean `.saves.json`.
  - **Plan phase commit:** Create a project with scope.md (triggers plan phase), call `startWork`, verify `git log --oneline -1` shows `[slug] Start plan phase` and `git status` is clean.
  - **No-op on repeat:** Call `startWork` twice for same slug in Think phase, verify `git log --oneline` shows exactly one `Start work` commit (second call is a no-op).
  - **Scoped staging:** Create an untracked file in the slug directory before calling `startWork`, verify it remains untracked after the commit.
  - **Co-author trailer:** Verify the commit message contains the co-author line from ana.json (or the default).
- **Edge cases:**
  - Repeat call for Plan phase — no empty commit.

## Dependencies

None. All required imports (`readCoAuthor`, `runGit`, `spawnSync`) are already available in work.ts.

## Constraints

- No `git push` from `work start`. Artifact save handles push.
- The commit stages only this slug's `.saves.json` — scoped `git add` with the relative path, never the directory.
- Pre-commit hook (`.husky/pre-commit` lines 14-18) skips commits that only touch `.ana/` files. These commits are automatically skipped.

## Gotchas

- `writeTimestamp` returns `Promise<void>` with no indication of whether it wrote. The commit logic must check independently via `git diff --staged --quiet` after staging, not by inspecting writeTimestamp's behavior.
- The Think phase creates the directory AND writes `.saves.json` in the same block (lines ~1597-1600). The `git add` must target `.saves.json` specifically, not the directory — the directory may contain other uncommitted files.
- "Main tree" and "main project directory" in work.ts are correct git terminology for the primary working tree. Do NOT change these to "artifact branch."
- The `commitSaves` helper needs `projectRoot` to run git commands and to compute the relative path for `git add`. Pass it as a parameter.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- Error handling in commands: `chalk.red` message + `process.exit(1)`.
- Always use `--run` with `pnpm vitest` to avoid watch mode hang.

### Pattern Extracts

**Structural analog — artifact.ts commit pattern (lines 1260-1286):**

```typescript
// artifact.ts lines 1260-1286
  const savesPath = path.join(slugDir, '.saves.json');
  if (fs.existsSync(savesPath)) {
    try {
      runGit(['add', path.relative(projectRoot, savesPath)], { cwd: projectRoot });
    } catch { /* */ }
  }

  // 8a. Check if there are staged changes
  const diffResult = spawnSync('git', ['diff', '--staged', '--quiet'], { cwd: projectRoot });
  if (diffResult.status === 0) {
    // status 0 means no differences — nothing to commit
    console.log(chalk.yellow('No changes to save — artifact is already up to date.'));
    process.exit(0);
  }

  // 9. Commit
  const coAuthor = readCoAuthor(projectRoot);

  const prefix = isTracked ? 'Update: ' : '';
  const commitMessage = `[${slug}] ${prefix}${typeInfo.displayName}\n\nCo-authored-by: ${coAuthor}`;
  try {
    const commitResult = spawnSync('git', ['commit', '-m', commitMessage], { stdio: 'pipe', cwd: projectRoot });
    if (commitResult.status !== 0) throw new Error(commitResult.stderr?.toString() || 'Commit failed');
  } catch (error) {
    console.error(chalk.red(`Error: Commit failed. ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
```

**Work.ts commit message format (line 1372):**

```typescript
    const commitMessage = `[${slug}] Complete — archived to plans/completed\n\nCo-authored-by: ${coAuthor}`;
```

**Work.ts Think phase — where to add commit call (lines 1596-1603):**

```typescript
    // Create directory
    await fsPromises.mkdir(activePath, { recursive: true });

    // Write work_started_at
    await writeTimestamp(activePath, 'work_started_at', 'ana');

    console.log(`Started work item \`${slug}\`. Write your scope, then run \`ana artifact save scope ${slug}\`.`);
    return;
```

**Work.ts Plan phase — where to add commit call (lines 1637-1639):**

```typescript
    await writeTimestamp(activePath, 'plan_started_at', 'ana-plan');
    console.log(`Resuming \`${slug}\` — Plan phase. Run \`claude --agent ana-plan\`.`);
    return;
```

### "Main" terminology fixes

**work.ts — change these (refers to the branch):**
- Line 1031: `// Build/Verify agents writing artifacts to main instead of the worktree.` → `...to the artifact branch instead of...`
- Line 1076: `from main (always agent-written)` → `from the artifact branch (always agent-written)`
- Line 1096: `from main (matched merged content)` → `from the artifact branch (matched merged content)`
- Line 1102: `'These files were written to main but differ from the PR.'` → `'These files were written to the artifact branch but differ from the PR.'`
- Line 1388: `so the feature branch is never an ancestor of main.` → `...ancestor of the artifact branch.`
- Line 1649: `// Write timestamp to worktree (not main) to avoid...` → `...worktree (not the artifact branch) to avoid...`
- Line 1681: same pattern as 1649
- Line 1720: same pattern as 1649
- Line 1796: same pattern as 1649

**work.ts — leave unchanged (refers to git primary working tree):**
- Line 989: `main project directory` — correct git terminology
- Line 1006: `main commit path` — refers to code path, not branch
- Line 1347: `main tree` — correct git terminology
- Line 1554: `main project directory` — correct git terminology

**artifact.ts — change this:**
- Line 937: `is here on main but belongs in the worktree` → `is here on the artifact branch but belongs in the worktree`

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands

- After adding `commitSaves` and calling it in Think/Plan: `(cd packages/cli && pnpm vitest run --run)` — Expected: all existing tests pass
- After adding new tests: `(cd packages/cli && pnpm vitest run --run)` — Expected: 2024+ tests pass (existing + new)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2024 passed, 2 skipped (2026 total)
- Current test files: 95
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2030+ tests in 95 files (new tests added to existing work.test.ts)
- Regression focus: work.test.ts (existing `ana work start` tests must not break)
