# Spec: work complete --merge flag

**Created by:** AnaPlan
**Date:** 2026-05-08
**Scope:** .ana/plans/active/work-complete-merge/scope.md

## Approach

Add `--merge` to `work complete` that merges the PR via GitHub's API before running the existing completion flow. The merge logic is a self-contained block inserted between step 3 (artifact branch check, line 1017) and step 4 (pull, line 1028). It uses config already hoisted above it (`artifactBranch`, `branchPrefix`, `slug`).

The merge block follows an escalation ladder:

1. Check `gh` availability (`spawnSync('gh', ['--version'])`)
2. Get PR state via `gh pr view {branchName} --json state,baseRefName`
3. If already merged → skip merge, continue to step 4
4. If no PR → exit with "create one first" message
5. Validate base branch matches `artifactBranch` → exit on mismatch
6. Run `gh pr merge {branchName}` (no strategy flag, no `--delete-branch`)
7. On failure, classify stderr and escalate:
   - Checks pending → try `gh pr merge {branchName} --auto` → on success, tell user to come back after merge; on failure, tell user to merge manually or enable auto-merge
   - Branch behind → show rebase commands with worktree path
   - Multiple strategies → tell user to merge manually or specify strategy
   - Unknown → show raw stderr

All failure paths call `process.exit(1)` before any completion logic. When `--json` is passed, failure paths output structured JSON via `wrapJsonResponse`.

**Open question resolutions:**

- **`--json` interaction:** Yes — early exits output structured JSON when `--json` is passed. The existing `wrapJsonResponse` function wraps the error payload. Each exit includes `status: "error"`, a machine-readable `reason` string, and a human-readable `message`.
- **stderr parsing:** Keyword matching with catch-all. Check for keywords like `"required status check"`, `"behind"`, `"not up to date"`, `"merge strategy"`, `"multiple merge methods"`. No exact string matching — keywords are resilient across `gh` versions, and the catch-all (raw stderr) handles anything unrecognized.
- **`gh --version` guard extraction:** Not extracted. Two consumers (pr.ts line 179, new code in work.ts), 5 lines each. Extract if a third appears.

## Output Mockups

**Successful merge and complete:**
```
Merging PR...
PR merged.
✓ work-complete-merge — PASS
  Contract: 12/12 satisfied
  Findings: 2 new (0 risk, 1 debt, 1 observation)
  Archived to .ana/plans/completed/work-complete-merge
```

**Checks pending, auto-merge enabled:**
```
Merging PR...
Checks are still pending. Enabling auto-merge...
Auto-merge enabled for PR #97. It will merge when checks pass.
Run `ana work complete work-complete-merge` after the PR merges.
```

**Checks pending, auto-merge fails:**
```
Merging PR...
Checks are still pending. Enabling auto-merge...
Auto-merge is not available for this repository.
Merge the PR manually after checks pass, or enable auto-merge in repository settings.
Then run: ana work complete work-complete-merge
```

**Branch behind:**
```
Merging PR...
Error: Branch is behind the base branch. Rebase before merging:

  cd .ana/worktrees/work-complete-merge
  git fetch origin main
  git rebase origin/main
  git push --force-with-lease

Warning: Force-pushing may dismiss existing PR approvals if the repo has "dismiss stale reviews" enabled.
```

**Multiple merge strategies:**
```
Merging PR...
Error: Multiple merge strategies are enabled with no default.
Merge the PR manually via GitHub or specify a strategy:
  gh pr merge --merge    (merge commit)
  gh pr merge --squash   (squash)
  gh pr merge --rebase   (rebase)
```

**No PR exists:**
```
Error: No PR found for branch `feature/work-complete-merge`.
Create one first: ana pr create work-complete-merge
```

**Base branch mismatch:**
```
Error: PR base branch is `develop` but artifact branch is `main`.
The PR must target `main` to complete this work item.
```

**gh not installed:**
```
Error: GitHub CLI (gh) not found.
Install from https://cli.github.com/
```

**Wrong branch with --merge:**
```
Error: You're on `feature/work-complete-merge`. Switch to `main` to complete work.
`--merge` handles the merge, but must run from the artifact branch.
Run: git checkout main && git pull
```

**Already merged:**
```
PR already merged. Continuing with completion...
✓ work-complete-merge — PASS
...
```

**`--json` early exit example (checks pending, auto enabled):**
```json
{
  "command": "work complete",
  "result": {
    "status": "error",
    "reason": "auto_merge_enabled",
    "pr": 97,
    "message": "Auto-merge enabled. Run `ana work complete work-complete-merge` after the PR merges."
  }
}
```

**Template updates — verify agent PASS output (ana-verify.md around line 443):**
```
"All verified. PR created for review. After merging, run: `ana work complete {slug}`
Or to merge and complete in one step: `ana work complete --merge {slug}`"
```

**Template update — ana.md pipeline state table (line 277):**
```
| Ready to merge | "Review the PR, merge, then `ana work complete {slug}`. Or: `ana work complete --merge {slug}`." |
```

**Template update — work status next-action (work.ts line 524):**
```
Review PR, then: ana work complete {slug}
Or to merge and complete: ana work complete --merge {slug}
```

**Template update — verification-passed message (work.ts line 1695):**
```
`{slug}` has passed verification. Run `ana work complete {slug}` to archive.
Or to merge and complete in one step: ana work complete --merge {slug}
```

## File Changes

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Four areas: (1) Add `--merge` option to Commander registration and `completeWork` options type. (2) Insert merge logic block between step 3 and step 4. (3) Update step 3 error message to mention `--merge` when the flag is set. (4) Update `getNextAction` for `ready-to-merge` stage and the verification-passed message to mention `--merge`. (5) Update `completeCommand` description.
**Pattern to follow:** `pr.ts` lines 179-300 for `gh` calls and error handling. `work.ts` line 1226 for `spawnSync` + `gh pr view` within the completion flow.
**Why:** This is the core feature — without it, `--merge` doesn't exist.

### `packages/cli/templates/.claude/agents/ana-verify.md` (modify)
**What changes:** Add `--merge` option text to the PASS output block (around line 443).
**Pattern to follow:** Existing output format at line 443.
**Why:** AC15 — the verify agent must present the `--merge` option when routing the developer after PASS.

### `packages/cli/templates/.claude/agents/ana.md` (modify)
**What changes:** Add `--merge` option to the pipeline state table entry for "Ready to merge" (line 277).
**Pattern to follow:** Existing table format.
**Why:** AC18 — Ana's state table is the reference for what to do at each stage.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** Add a new `describe('--merge flag')` block inside `describe('ana work complete')`. Tests for: successful merge + complete, already-merged skip, no PR, base branch mismatch, gh not installed, checks pending with auto-merge, checks pending without auto-merge, branch behind, multiple strategies, unknown error, `--merge` not passed (regression — behavior unchanged), wrong branch message update.
**Pattern to follow:** `createMergedProject` helper at line 592. Same `spawnSync` mocking pattern used at line 1226 for `gh pr view`.
**Why:** The merge logic has 8+ distinct code paths. Each needs a test.

## Acceptance Criteria

- [ ] AC1: `ana work complete --merge {slug}` merges an open PR and completes the work item in one command
- [ ] AC2: Without `--merge`, `work complete` behavior is identical to current behavior — no regressions
- [ ] AC3: Merge uses `gh pr merge` without `--delete-branch` and without a merge strategy flag
- [ ] AC4: When `gh pr merge` fails because checks are pending, `--auto` is attempted; if `--auto` succeeds, output includes the PR number and tells the user to run `work complete` after it merges; exit without completing
- [ ] AC5: When `--auto` fails (repo doesn't have auto-merge enabled), output tells the user to merge manually or enable auto-merge; exit without completing
- [ ] AC6: When `gh pr merge` fails because the branch is behind, output includes the exact rebase commands with the worktree path, a `--force-with-lease` push, and a warning about approval dismissal; exit without completing
- [ ] AC7: When the PR is already merged, `--merge` skips the merge step and continues with normal completion — never worse than running without the flag
- [ ] AC8: When no PR exists for the branch, output tells the user to create one with `ana pr create`; exit without completing
- [ ] AC9: When `gh pr merge` fails because multiple merge strategies are enabled, output tells the user to merge manually or specify a strategy; exit without completing
- [ ] AC10: When `gh pr merge` fails for any unrecognized reason, output the raw `gh` stderr; exit without completing
- [ ] AC11: Before merging, verify the PR's base branch matches `artifactBranch`; if not, output the mismatch and exit
- [ ] AC12: Before merging, check `gh --version`; if `gh` is not installed, output install instructions and exit
- [ ] AC13: `--merge` exits before any existing completion steps (pull, archive, commit, push) on all failure paths — no partial completion
- [ ] AC14: `--admin` is never used, under any circumstance
- [ ] AC15: The verify agent template PASS output includes: `Or to merge and complete in one step: \`ana work complete --merge {slug}\``
- [ ] AC16: `work status` next-action text for `ready-to-merge` includes the `--merge` option
- [ ] AC17: The verification-passed message (work.ts line 1695) includes the `--merge` option
- [ ] AC18: Ana's pipeline state table (ana.md line 277) includes the `--merge` option
- [ ] AC19: Verify agent guardrails at lines 494 and 498 of ana-verify.md are NOT modified
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`
- [ ] No lint errors with `pnpm run lint`

## Testing Strategy

- **Unit tests:** New `describe('--merge flag')` block inside `describe('ana work complete')` in work.test.ts. Mock `spawnSync` to simulate `gh` responses. Use the existing `createMergedProject` helper for git repo setup. Each failure mode gets its own test.
- **Mocking pattern:** The existing tests mock `gh pr view` at line 1226 via `spawnSync`. The new tests extend this by mocking `gh pr merge` and `gh --version` responses. Use `vi.spyOn` on `child_process.spawnSync` with conditional returns based on arguments.
- **Edge cases:**
  - `--merge` with already-merged PR (AC7): mock `gh pr view` returning `state: "MERGED"`, verify completion continues normally
  - `--merge` without `--json` vs with `--json`: verify output format matches expectation for each failure path
  - `--merge` not passed: verify existing behavior unchanged (regression test)
  - `--merge` from wrong branch: verify updated error message

## Dependencies

- `gh` CLI installed and authenticated (runtime dependency, not build)
- `spawnSync` already imported in work.ts (line 16)
- `wrapJsonResponse` already imported in work.ts (line 23)

## Constraints

- Never use `--admin` flag. Never auto-rebase. Never use `--delete-branch`.
- All `gh` calls use `spawnSync` with `stdio: 'pipe'` and `encoding: 'utf-8'` — consistent with existing patterns.
- Merge logic must complete before step 4 (`git pull --rebase`) runs. The pull fetches the merge commit.
- Lines 494 and 498 of ana-verify.md must not be modified (AC19 — guardrails stay).

## Gotchas

- **`gh pr merge` in non-interactive mode won't prompt for merge strategy.** If multiple strategies are enabled with no default, it errors. This is AC9 — must be a classified failure, not a crash.
- **`gh pr merge --auto` fails if the repo doesn't have "Allow auto-merge" enabled** (off by default in GitHub settings). The `--auto` failure is a second escalation step, not a retry of the same thing.
- **Step 3 error message at line 1017-1021 is currently misleading** when `--merge` is passed. It says "The PR should be merged before completing" — but the user is trying to use `--merge` to do exactly that. The message needs to change when `options?.merge` is true. See Output Mockups for the updated message.
- **The `completeWork` options type is inline** (`{ json?: boolean }`). Adding `merge?: boolean` to the inline type. Also update the Commander action's `cmdOptions` type at line 1947.
- **`gh pr view` returns exit code 1 when no PR exists.** The stderr contains "no pull requests found" or similar. This is how AC8 is detected.
- **The `completeCommand` description** (line 1944) says "Archive completed work after PR merge." Update to reflect that `--merge` also performs the merge.
- **`getNextAction` at line 523-524** returns a plain string. The `--merge` addition is a second line in the status output, not a modification to the existing line. Check how the return value is rendered — if it's a single line, append with `\n`.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- Error handling: commands use `chalk.red` message + `process.exit(1)`.
- Explicit return types on exported functions. Internal helpers use inference.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Always use `--run` with `pnpm vitest` to avoid watch mode hang.
- Co-author trailer: `Ana <build@anatomia.dev>`.

### Pattern Extracts

**gh availability guard (pr.ts lines 179-184):**
```typescript
  // 3. Check gh CLI availability
  const ghCheck = spawnSync('gh', ['--version'], { stdio: 'pipe' });
  if (ghCheck.status !== 0) {
    console.error(chalk.red('Error: GitHub CLI (gh) not found.'));
    console.error(chalk.gray('Install from https://cli.github.com/'));
    process.exit(1);
  }
```

**spawnSync gh call pattern (pr.ts lines 286-290):**
```typescript
  const ghResult = spawnSync(
    'gh',
    ['pr', 'create', '--base', artifactBranch, '--head', currentBranch, '--title', prTitle, '--body', prBody],
    { cwd: projectRoot, stdio: 'pipe', encoding: 'utf-8' }
  );
```

**gh pr view within work complete (work.ts lines 1226-1232):**
```typescript
        const ghResult = spawnSync('gh', ['pr', 'view', workBranchName, '--json', 'state', '-q', '.state'], {
          encoding: 'utf-8', stdio: 'pipe',
        });
        if (ghResult.status === 0 && ghResult.stdout) {
          merged = ghResult.stdout.trim() === 'MERGED';
        }
```

**Step 3 guard — current code (work.ts lines 1017-1021):**
```typescript
  if (currentBranch !== artifactBranch) {
    console.error(chalk.red(`Error: You're on \`${currentBranch}\`. Switch to \`${artifactBranch}\` to complete work.`));
    console.error(chalk.gray('The PR should be merged before completing.'));
    console.error(chalk.gray(`Run: git checkout ${artifactBranch} && git pull`));
    process.exit(1);
  }
```

**Commander registration (work.ts lines 1943-1949):**
```typescript
  const completeCommand = new Command('complete')
    .description('Archive completed work after PR merge')
    .argument('<slug>', 'Work item slug to complete')
    .option('--json', 'Output JSON format for programmatic consumption')
    .action(async (slug: string, cmdOptions: { json?: boolean }) => {
      await completeWork(slug, cmdOptions);
    });
```

**getNextAction ready-to-merge (work.ts lines 523-524):**
```typescript
  if (stage === 'ready-to-merge') {
    return `Review PR, then: ana work complete ${slug}`;
  }
```

**Verification-passed message (work.ts line 1695):**
```typescript
    console.log(`\`${slug}\` has passed verification. Run \`ana work complete ${slug}\` to archive.`);
```

### Proof Context

Top findings for `work.ts`:
- **[code]** Main path re-reads `proof_chain.json` from disk for `computeChainHealth` after `writeProofChain` just wrote it. Not relevant to merge changes — the merge block runs before proof chain logic.
- **[code]** Race condition in `writeTimestamp`: read-modify-write on `.saves.json` is not atomic. Not relevant — merge block doesn't touch `.saves.json`.

No active proof findings for `ana-verify.md` or `ana.md` that are relevant to this build.

### Checkpoint Commands

- After adding `--merge` option to Commander: `pnpm run build` — Expected: clean build
- After merge logic block: `(cd packages/cli && pnpm vitest run)` — Expected: 2029 tests pass (existing, no regressions)
- After all changes including new tests: `(cd packages/cli && pnpm vitest run)` — Expected: ~2041+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2029 passed, 2 skipped (2031 total)
- Current test files: 95
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2041+ tests in 95 files (new tests added to existing work.test.ts)
- Regression focus: existing `ana work complete` tests in work.test.ts — the merge block must not affect any path when `--merge` is not passed
