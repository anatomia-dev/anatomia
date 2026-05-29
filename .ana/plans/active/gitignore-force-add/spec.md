# Spec: Force-add gitignored infrastructure in init commit

**Created by:** AnaPlan
**Date:** 2026-05-29
**Scope:** .ana/plans/active/gitignore-force-add/scope.md

## Approach

When a host repo gitignores `.claude/` (common for teams already using Claude Code), `ana init commit` silently drops infrastructure files because `git status --porcelain` excludes gitignored files and `git add` without `-f` skips them. The fix adds a second discovery pass after `discoverDirtyFiles()` that enumerates actual files on disk, batch-checks them against `git check-ignore --stdin`, and force-adds the gitignored subset with `git add -f`.

Two separate file lists, two separate `git add` calls. The existing dirty-file path is unchanged. The new gitignored path runs independently and only uses `-f` for the files that need it. A `--respect-gitignore` flag opts out of force-adding entirely.

The new `discoverGitignoredFiles()` function follows the same pattern as `discoverDirtyFiles()`: same inputs (`projectRoot`), same return type (`string[]`), same filtering (`isExcluded()`), exported for direct testing.

**Critical design constraint:** The function enumerates files on disk dynamically using `fs.readdirSync` with `{ recursive: true }` — not a hardcoded filename list. This covers future skills, enrichment files, nested agents, and custom skill directories without code changes.

## Output Mockups

### Normal case (gitignored files detected and force-added)

```
  ⚠ Gitignored infrastructure files detected — force-adding for worktree compatibility:
    .claude/agents/ana-build.md
    .claude/agents/ana.md
    .claude/settings.json
    .claude/skills/coding-standards/SKILL.md

✓ Infrastructure committed to main (12 files)

  [ana] Initialize project context
```

### With --respect-gitignore flag

```
  ⚠ 4 infrastructure files are gitignored and were NOT committed:
    .claude/agents/ana-build.md
    .claude/agents/ana.md
    .claude/settings.json
    .claude/skills/coding-standards/SKILL.md
  These files won't be available in worktrees. Pipeline builds may fail.

✓ Infrastructure committed to main (8 files)

  [ana] Initialize project context
```

### No gitignored files (existing behavior, unchanged)

```
✓ Infrastructure committed to main (12 files)

  [ana] Initialize project context
```

## File Changes

### `packages/cli/src/commands/init/commit.ts` (modify)

**What changes:**
1. New exported function `discoverGitignoredFiles(projectRoot: string): string[]` — enumerates files on disk under KNOWN_ROOTS and KNOWN_ROOT_FILES, filters through `isExcluded()`, batch-checks against `git check-ignore --stdin`, returns the gitignored subset. Excludes any files already in the dirty set (passed as second parameter) to avoid double-staging.
2. `--respect-gitignore` option added to the Commander command definition before `.action()`.
3. The action body gains a second discovery call after `discoverDirtyFiles()`, conditional console output for gitignored files, a separate `git add -f` call for the gitignored subset, and adjusted file count in the success message.

**Pattern to follow:** `discoverDirtyFiles()` in the same file — same function shape, same `spawnSync` usage for git, same `isExcluded()` filtering, same return type.

**Why:** Without this, gitignored infrastructure files silently vanish from commits, breaking worktree-based builds for teams that gitignore `.claude/`.

### `packages/cli/tests/commands/init/commit.test.ts` (modify)

**What changes:** New `describe('discoverGitignoredFiles')` block with tests for gitignore detection, force-add behavior, `--respect-gitignore` flag, exclusion filtering, and edge cases (entire `.claude/` ignored, nested gitignore, no gitignored files). New tests in the guard sequence block for the full command flow with gitignored files.

**Pattern to follow:** Existing test structure in the same file — `createProject()` helper, temp git repos with `fsp.mkdtemp`, `execSync` for git operations, `runInitCommit()` helper for command-level tests.

**Why:** Every behavioral change needs test coverage. The gitignore detection is the core logic and must be tested directly.

## Acceptance Criteria

- [ ] AC1: When any infrastructure file under KNOWN_ROOTS or KNOWN_ROOT_FILES exists on disk but is gitignored, `ana init commit` force-adds it and includes it in the commit. Detection enumerates actual files on disk dynamically.
- [ ] AC2: Force-added files appear in the committed changeset (verifiable via `git log --name-only`).
- [ ] AC3: Console output explicitly names the force-added files and explains why (worktree compatibility).
- [ ] AC4: `--respect-gitignore` flag skips force-add and prints a warning that these files won't be available in worktrees.
- [ ] AC5: When no infrastructure files are gitignored, behavior is identical to current — no extra output, no `-f` flag.
- [ ] AC6: The `.claude/.gitignore` entries we create (agent-memory/, settings.local.json) are NOT force-added — only infrastructure files that Anatomia needs committed.
- [ ] AC7: Force-add works through nested gitignore scenarios (host root `.gitignore` + our `.claude/.gitignore`).
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests for `discoverGitignoredFiles`:** Direct function tests with real git repos in temp dirs. Create `.gitignore` with `.claude/` entry, create infrastructure files on disk, verify the function returns the correct gitignored subset. Test with various gitignore patterns: directory ignore (`.claude/`), wildcard (`.claude/*`), root-level file ignore (`CLAUDE.md`).
- **Unit tests for exclusion in gitignored set:** Verify that `agent-memory/`, `settings.local.json`, `.ana/plans/`, `.ana/state/`, `.ana/worktrees/` are excluded from the gitignored discovery even when they exist on disk and are gitignored.
- **Integration tests via `runInitCommit()`:** Full command flow — create repo with `.gitignore` containing `.claude/`, run init commit, verify files appear in `git log --name-only`. Test `--respect-gitignore` flag skips force-add.
- **Edge cases:**
  - No gitignored files → function returns empty array, no extra output
  - Entire `.claude/` gitignored → all non-excluded files within it are discovered
  - Files already in dirty set are excluded from gitignored set (no double-staging)
  - `git check-ignore` exit code 1 (nothing ignored) handled as success, not error

## Dependencies

None. All dependencies (KNOWN_ROOTS, KNOWN_ROOT_FILES, isExcluded, spawnSync patterns) already exist in commit.ts.

## Constraints

- `git check-ignore --stdin` must be used for batch detection — no gitignore parsing.
- `fs.readdirSync({ recursive: true })` requires Node 18.17+. Project requires Node 22+, no issue.
- The existing `discoverDirtyFiles()` function must remain unchanged — zero modifications.
- EXCLUDED_PREFIXES must apply to the gitignored set identically to the dirty set.

## Gotchas

- **`git check-ignore` exit code 1 is NOT an error.** It means no paths matched. Exit code 0 means at least one path is ignored. Check `stdout` for actual results, not exit code for success/failure. Only treat exit code 128+ as an error.
- **`git check-ignore --stdin` reads one path per line from stdin.** Pass paths via `spawnSync` input option. Output contains only the paths that ARE ignored — parse output lines.
- **`fs.readdirSync({ recursive: true })` returns `string | Buffer` entries.** Filter to files only (use `statSync` or `lstatSync` to exclude directories). The entries are relative to the root passed to `readdirSync` — join with the root prefix for repo-relative paths.
- **`discoverDirtyFiles` may return directory entries** (e.g., `.claude/` from `?? .claude/` in git status). The gitignored pass operates on individual files, so there's no overlap concern. But avoid double-staging: if a file's parent directory is in the dirty set, it's already covered by the normal `git add`.
- **The `--respect-gitignore` option must be added to Commander BEFORE `.action()`.** Commander options must be defined before the action handler.
- **`git add -f` on a file inside an untracked-and-ignored parent directory works.** Git creates the necessary index entries automatically. No need to add the parent first.
- **Monorepo AGENTS.md:** The existing `resolveMonorepoAgentsMd()` resolves the path. The gitignored pass should also check this path as a root file, same as `discoverDirtyFiles` does.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. Export `discoverGitignoredFiles` for direct testing.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Prefer early returns over nested conditionals.
- Error handling in commands: `chalk.red` message + `process.exit(1)`.
- Always use `--run` with `pnpm vitest` to avoid watch mode hang.

### Pattern Extracts

**Structural analog — `discoverDirtyFiles` function signature and spawnSync usage (commit.ts lines 92-101):**
```typescript
export function discoverDirtyFiles(projectRoot: string): string[] {
  const statusResult = spawnSync('git', ['status', '--porcelain'], {
    cwd: projectRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
  });
  if (statusResult.status !== 0) {
    return [];
  }
```

**Exclusion filter pattern (commit.ts lines 135-148):**
```typescript
  for (const dirtyPath of dirtyPaths) {
    // Check root files first (exact match)
    if (rootFiles.includes(dirtyPath)) {
      if (!isExcluded(dirtyPath)) {
        discovered.push(dirtyPath);
      }
      continue;
    }

    // Check known roots (prefix match)
    const matchesRoot = roots.some(root => dirtyPath.startsWith(root));
    if (matchesRoot && !isExcluded(dirtyPath)) {
      discovered.push(dirtyPath);
    }
  }
```

**Commander option + action pattern (commit.ts lines 281-285):**
```typescript
export function registerInitCommitCommand(initCommand: Command): void {
  initCommand
    .command('commit')
    .description('Commit infrastructure files to the artifact branch')
    .action(() => {
```

**Test helper pattern (commit.test.ts lines 44-61):**
```typescript
  async function createProject(opts?: {
    artifactBranch?: string;
    coAuthor?: string;
  }): Promise<void> {
    const anaDir = path.join(tempDir, '.ana');
    await fsp.mkdir(anaDir, { recursive: true });
    await fsp.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({
        artifactBranch: opts?.artifactBranch ?? 'main',
        coAuthor: opts?.coAuthor ?? 'Ana <build@anatomia.dev>',
      }),
      'utf-8'
    );
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });
  }
```

### Proof Context

**commit.ts:**
- `[test]` (init-commit-C2) No integration test for pull conflict abort path — not related to this build.
- Build concern: File count in success message counts directory entries not individual files for untracked dirs — relevant: the success message file count should include force-added files. The count currently adds `files.length` which may include directory entries. The gitignored set is individual files, so when both lists merge for the count, the total will be more accurate for the gitignored portion.

**commit.test.ts:**
- `[test]` (init-commit-C1) Push failure test doesn't test push failure — not related to this build.

### Checkpoint Commands

- After `discoverGitignoredFiles` function added: `(cd packages/cli && pnpm vitest run -- --testPathPattern commit)` — Expected: existing tests pass, new unit tests pass
- After full implementation (flag + action changes + all tests): `(cd packages/cli && pnpm vitest run)` — Expected: 2981+ tests pass (existing) + new tests
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 2981 passed, 2 skipped (2983 total)
- Current test files: 127 passed
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2995+ tests (14+ new tests for gitignore detection, force-add, flag, edge cases)
- Regression focus: existing `discoverDirtyFiles` tests, guard sequence tests, idempotent behavior tests — all must remain green with zero changes
