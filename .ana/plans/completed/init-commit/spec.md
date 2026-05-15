# Spec: `ana init commit` — persist infrastructure to git

**Created by:** AnaPlan
**Date:** 2026-05-14
**Scope:** .ana/plans/active/init-commit/scope.md

## Approach

Add `ana init commit` as a subcommand registered on the existing `initCommand` in `init/index.ts`. The implementation lives in a new file `init/commit.ts` that exports a registration function. The command follows the guard-commit-push sequence proven by `artifact save` but at the implementation weight of `commitAndPushProofChanges` (proof.ts:156-195).

**Guard sequence (order matters):**
1. Worktree guard — `isWorktreeDirectory()`, same as init/setup/scan
2. Init guard — `.ana/ana.json` must exist
3. Branch validation — current branch must equal artifact branch
4. Pull with rebase — remote-aware, skip if no remotes, conflict = error, network failure = warn and continue
5. Discover infrastructure files — known roots + exclusions + `git status --porcelain`
6. Idempotent check — if nothing dirty, exit 0 with "Context is up to date"
7. Stage and commit — path-scoped `git commit --no-verify -- <paths>`
8. Push — soft-fail on push failure (warn, don't exit non-zero)

**File discovery strategy:** Walk known directory roots (`.ana/`, `.claude/`, root `CLAUDE.md`, root `AGENTS.md`, monorepo `AGENTS.md` from `scan.json`). Apply exclusions. Then intersect with `git status --porcelain` output to find files that are untracked (`??`) or modified (`M`/`A`). This catches new files init created AND files setup enriched, without sweeping up pipeline data.

**Exclusion list (each excluded file has its own commit lifecycle):**
- `.ana/proof_chain.json` — managed by `ana work complete`
- `.ana/PROOF_CHAIN.md` — managed by `ana work complete`
- `.ana/plans/` — managed by `ana artifact save`
- `.ana/state/` — already in `.ana/.gitignore`, belt-and-suspenders
- `.ana/worktrees/` — already in `.ana/.gitignore`, belt-and-suspenders
- `.claude/settings.local.json` — per-developer preference
- `.claude/agent-memory/` — per-developer session state

**Commit message logic:** Check if `.ana/ana.json` is tracked (`git ls-files --error-unmatch`). If not tracked → first commit: `[ana] Initialize project context`. If tracked → update: `[ana] Update project context`. Append co-author trailer from `readCoAuthor()`.

**Success message readiness check:** In `displaySuccessMessage`, after the "Next:" section, add a commit-readiness line. Compare `getCurrentBranch()` to the artifact branch from the config already passed in. Display `ana init commit — Save to {branch} ✓` if on the right branch, or `⚠ you're on {currentBranch} — switch to {artifactBranch} before committing` if not.

**Setup template changes:** Two additions to `ana-setup.md`:
1. After Step 2 (config confirmation) — check branch, offer to switch if not on artifact branch.
2. Step 8 (completion) — if on artifact branch, auto-invoke `ana init commit`. If not, print fallback instruction.

## Output Mockups

### First commit (on correct branch)
```
✓ Infrastructure committed to main (12 files)

  [ana] Initialize project context

  Committed locally. Pushing...
✓ Pushed to origin/main
```

### Subsequent commit
```
✓ Infrastructure committed to main (3 files)

  [ana] Update project context

  Committed locally. Pushing...
✓ Pushed to origin/main
```

### Nothing to commit
```
Context is up to date.
```

### Wrong branch
```
Error: You're on `feature/foo`. Infrastructure must be committed to `main`.
  Run: git checkout main
```

### Push failure (soft-fail)
```
✓ Infrastructure committed to main (12 files)

  [ana] Initialize project context

  Committed locally. Pushing...
  ⚠ Push failed. Run `git push` manually.
```

### Init success message addition
```
  Next:
    claude --agent ana          Start working (Ana knows your stack)
    claude --agent ana-setup    Enrich with your team's knowledge (optional, ~10 min)
    ana init commit             Save to main ✓
```

Or if on wrong branch:
```
    ana init commit             ⚠ you're on feature/foo — switch to main first
```

## File Changes

### `packages/cli/src/commands/init/commit.ts` (create)
**What changes:** New file implementing the `ana init commit` subcommand. Exports `registerInitCommitCommand(initCommand: Command)` which adds the `commit` subcommand to the init parent command.
**Pattern to follow:** `commitAndPushProofChanges` (proof.ts:156-195) for commit mechanics. `pullBeforeRead` (proof.ts:126-140) for pull logic. Guard structure matches `artifact save`'s order (artifact.ts:1077-1112) but at proof.ts's implementation weight.
**Why:** Core feature — without this file, the command doesn't exist.

### `packages/cli/src/commands/init/index.ts` (modify)
**What changes:** Import and call `registerInitCommitCommand(initCommand)` before `program.addCommand(initCommand)`.
**Pattern to follow:** Same pattern as `setup.ts` where `setupCommand.command('complete')` adds a subcommand to a parent command. Here, the registration happens via an imported function for separation.
**Why:** Registers the subcommand on the init parent. Commander.js resolves `ana init commit` only if the subcommand is added to the parent before the parent is added to the program.

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** Add commit-readiness indicator to `displaySuccessMessage`. After the "Next:" section (around line 703), add a line showing `ana init commit` with branch status.
**Pattern to follow:** Existing `displaySuccessMessage` formatting — `chalk.cyan` for commands, inline status with `✓` or `⚠`.
**Why:** Users need to know commit is available and whether their branch is correct, immediately after init completes.

### `packages/cli/templates/.claude/agents/ana-setup.md` (modify)
**What changes:** Two additions: (1) After Step 2's "Does this look right?" confirmation block, add a branch check section that reads `artifactBranch` from `ana.json`, checks `git rev-parse --abbrev-ref HEAD`, and offers to switch if mismatched. (2) In Step 8, add auto-invocation of `ana init commit` if on the artifact branch, with fallback instruction if not.
**Pattern to follow:** Existing Step 8 structure — action + presentation.
**Why:** The setup agent is the primary path for enriching context files. Auto-committing at the end eliminates the "I ran setup but forgot to commit" failure mode.

### `website/content/docs/start.mdx` (modify)
**What changes:** Add a commit step between init and first pipeline run. After the init output block and setup callout, add a brief section showing `ana init commit` as the persistence step.
**Pattern to follow:** Existing quickstart step formatting.
**Why:** AC13 — quickstart must include the commit step.

### `website/content/docs/guides/using-ana-setup.mdx` (modify)
**What changes:** Add a note that setup auto-commits infrastructure on completion when on the artifact branch.
**Pattern to follow:** Existing callout style in the guide.
**Why:** AC13 — setup guide notes auto-commit behavior.

### `website/content/docs/concepts/context.mdx` (modify)
**What changes:** Add a brief section on infrastructure persistence lifecycle — init creates, setup enriches, `ana init commit` persists to git.
**Pattern to follow:** Existing section structure in the concept page.
**Why:** AC13 — context concept page describes the persistence lifecycle.

### `website/content/docs/concepts/toolbelt.mdx` (modify)
**What changes:** Add `ana init commit` to the toolbelt table, associated with the `ana-setup` agent row and as standalone.
**Pattern to follow:** Existing table format.
**Why:** AC13 — toolbelt page lists the new command.

### `packages/cli/tests/commands/init/commit.test.ts` (create)
**What changes:** Test file for the new command covering: guard sequence, file discovery with exclusions, idempotent behavior, commit message selection, push soft-fail, and the readiness check in displaySuccessMessage.
**Pattern to follow:** `artifact.test.ts` — temp directories with real git repos, `createTestProject` helper, `execSync` for git operations, assertion on `process.exit` via mocking or output capture.
**Why:** Core command tests. The test patterns from artifact.test.ts cover identical git mechanics.

## Acceptance Criteria

- [ ] AC1: `ana init commit` commits all infrastructure files from known roots to artifact branch with path-scoped commit
- [ ] AC2: Excludes pipeline data (`proof_chain.json`, `PROOF_CHAIN.md`, `plans/`)
- [ ] AC3: Excludes runtime state (`.ana/state/`, `.ana/worktrees/`, `.claude/settings.local.json`, `.claude/agent-memory/`)
- [ ] AC4: Validates context: worktree guard, branch validation, pull-before-commit
- [ ] AC5: Uses `--no-verify` and path-scoped `git commit -- <paths>`
- [ ] AC6: Idempotent — exits 0 with "Context is up to date" when nothing dirty
- [ ] AC7: Context-aware commit messages (`Initialize` vs `Update`) with co-author trailer
- [ ] AC8: Push after commit with soft-fail on push failure
- [ ] AC9: `displaySuccessMessage` shows commit-readiness check
- [ ] AC10: Setup template checks branch after Step 2, auto-invokes at Step 8
- [ ] AC11: Monorepo `AGENTS.md` discovered via `scan.json` `monorepo.primaryPackage.path`
- [ ] AC12: File discovery uses known roots + exclusions + `git status --porcelain`, not hardcoded file list
- [ ] AC13: Documentation updated across 4 pages
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `(cd packages/cli && pnpm run build)`

## Testing Strategy

- **Unit tests:** Test file discovery logic (known roots, exclusions, intersection with git status). Test commit message selection (first commit vs update). Test the guard sequence (worktree rejection, branch mismatch, missing init). Test idempotent path.
- **Integration tests:** Create temp git repos, write infrastructure files, run the commit function, verify git log shows correct commit with correct paths. Verify excluded files are NOT in the commit.
- **Edge cases:** No remote (skip pull and push). Empty discovery (nothing dirty). Monorepo path resolution. Push failure (verify exit 0 still). Conflict on pull (verify error + exit 1).

Follow `artifact.test.ts` patterns: `fs.mkdtemp` for temp dirs, `execSync('git init -b main')` for repo setup (force branch name for CI compatibility), `process.chdir` with cleanup in afterEach.

## Dependencies

- `isWorktreeDirectory` from `../../utils/worktree.js`
- `readArtifactBranch`, `getCurrentBranch`, `readCoAuthor`, `runGit` from `../../utils/git-operations.js`
- `findProjectRoot` from `../../utils/validators.js`
- `chalk` for output formatting
- `spawnSync` from `node:child_process` for commit execution
- `scan.json` on disk for monorepo path resolution

## Constraints

- The command must not import from engine (architectural boundary).
- Path-scoped commits only — never `git add -A` or `git commit -a`.
- Exit codes: 0 on success AND on idempotent no-op. 1 on validation failures. 0 on push failure (commit succeeded).
- The exclusion list must be maintained as the source of truth for what this command will NOT commit. If a new proof/pipeline command starts committing files, its paths must be added to this exclusion list.

## Gotchas

- **Commander.js subcommand + bare action coexistence:** `init` has a bare `.action()` handler AND the new `commit` subcommand. This works — proven by `setup.ts:40` where `setupCommand.action()` coexists with `setupCommand.command('complete')`. Commander.js resolves the subcommand name first; bare action fires only when no subcommand matches.
- **`git status --porcelain` paths are relative to repo root:** The command runs from project root (via `findProjectRoot()`), so porcelain paths match directly. But if a file is inside `.ana/plans/active/foo/scope.md`, the exclusion check must match on prefix (`.ana/plans/`) not exact path.
- **`primaryPackage.path` is in `scan.json`, not `ana.json`:** The discovery function must read `scan.json` separately to resolve monorepo paths. If `scan.json` doesn't exist or doesn't have the field, skip monorepo discovery silently.
- **`displaySuccessMessage` receives `anaConfig` which is the freshly-written config:** The artifact branch is available there without re-reading disk. But `getCurrentBranch()` is a git operation — ensure it's called only once and handle the null case (not a git repo, though init already validated this).
- **Template changes affect new installs only:** Existing users who ran setup before this feature shipped won't have the auto-commit behavior. The command is independently discoverable via `ana init --help`.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. No default exports.
- Early returns over nested conditionals.
- Error handling in commands: `chalk.red` message + `process.exit(1)`.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Tests must force branch name with `git init -b main` or `git branch -M main`.
- Always pass `--run` flag when invoking Vitest.

### Pattern Extracts

**`commitAndPushProofChanges` — proof.ts:156-195 (structural analog for commit mechanics):**
```typescript
function commitAndPushProofChanges(options: {
  proofRoot: string;
  files: string[];
  message: string;
  coAuthor: string;
}): void {
  // Stage and commit
  runGit(['add', ...options.files], { cwd: options.proofRoot });
  const commitMessage = `${options.message}\n\nCo-authored-by: ${options.coAuthor}`;
  const commitResult = spawnSync('git', ['commit', '-m', commitMessage, '--', ...options.files], { stdio: 'pipe', cwd: options.proofRoot });
  if (commitResult.status !== 0) {
    const stderr = commitResult.stderr?.toString() || 'Commit failed';
    console.error(chalk.red(`Error: Failed to commit. Changes NOT saved to git.`));
    console.error(chalk.dim(stderr));
    process.exit(1);
  }

  // Push with one retry
  const pushResult = runGit(['push'], { cwd: options.proofRoot });
  if (pushResult.exitCode === 0) return;

  // Push failed — pull --rebase and retry
  const pullResult = runGit(['pull', '--rebase', '--autostash'], { cwd: options.proofRoot });
  if (pullResult.exitCode !== 0) {
    const pullStderr = pullResult.stderr;
    if (pullStderr.includes('conflict') || pullStderr.includes('Cannot rebase') || pullStderr.includes('CONFLICT')) {
      runGit(['rebase', '--abort'], { cwd: options.proofRoot });
      console.error(chalk.yellow('  Committed locally. Push failed after retry — run `git push`'));
      return;
    }
    console.error(chalk.yellow('  Committed locally. Push failed after retry — run `git push`'));
    return;
  }

  // Retry push after successful pull
  const retryResult = runGit(['push'], { cwd: options.proofRoot });
  if (retryResult.exitCode !== 0) {
    console.error(chalk.yellow('  Committed locally. Push failed after retry — run `git push`'));
  }
}
```

**`pullBeforeRead` — proof.ts:126-140 (pull pattern):**
```typescript
function pullBeforeRead(proofRoot: string): void {
  const remotes = runGit(['remote'], { cwd: proofRoot }).stdout;
  if (remotes) {
    const pullResult = runGit(['pull', '--rebase', '--autostash'], { cwd: proofRoot });
    if (pullResult.exitCode !== 0) {
      const errorMessage = pullResult.stderr;
      if (errorMessage.includes('conflict') || errorMessage.includes('Cannot rebase')) {
        runGit(['rebase', '--abort'], { cwd: proofRoot });
        console.error(chalk.red('Error: Pull failed due to conflicts. Resolve conflicts and try again.'));
        process.exit(1);
      }
      console.error(chalk.yellow('⚠ Warning: Pull failed. Continuing with local data.'));
    }
  }
}
```

**Artifact save commit — artifact.ts:1460-1480 (--no-verify + path-scoped pattern):**
```typescript
const commitMessage = `[${slug}] ${prefix}${typeInfo.displayName}\n\nCo-authored-by: ${coAuthor}`;
try {
  const commitResult = spawnSync('git', ['commit', '--no-verify', '-m', commitMessage, '--', ...stagedPaths], { stdio: 'pipe', cwd: projectRoot });
  if (commitResult.status !== 0) throw new Error(commitResult.stderr?.toString() || 'Commit failed');
} catch (error) {
  console.error(chalk.red(`Error: Commit failed. ${error instanceof Error ? error.message : 'Unknown error'}`));
  process.exit(1);
}
```

### Proof Context

No active proof findings for affected files.

### Checkpoint Commands

- After `commit.ts` created + registered: `(cd packages/cli && pnpm run build)` — Expected: clean compile
- After tests written: `(cd packages/cli && pnpm vitest run tests/commands/init/commit.test.ts --run)` — Expected: all tests pass
- After all changes: `(cd packages/cli && pnpm vitest run --run)` — Expected: 2254+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2254 passed, 2 skipped (101 test files)
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2270+ tests in 102 test files (1 new test file)
- Regression focus: `tests/commands/init/preflight.test.ts` (shares init infrastructure)
