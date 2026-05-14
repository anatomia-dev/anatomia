# Spec: Run build command during worktree creation

**Created by:** AnaPlan
**Date:** 2026-05-14
**Scope:** .ana/plans/active/worktree-build-step/scope.md

## Approach

Add a `runBuildCommand()` function to `worktree.ts` that reads `commands.build` from the worktree's own `.ana/ana.json` and executes it via `spawnSync` with `shell: true`. Insert the call in `createWorktree()` between `linkEnvFiles()` and `initSubmodules()`.

The function follows the `installDependencies()` pattern — sync, `spawnSync`, returns a status value — with two deliberate divergences:

1. **`shell: true`** instead of `spawnSync(cmd, args)`. The build command is a user-configured string like `(cd packages/cli && pnpm run build)` that needs shell interpretation (pipes, `&&`, subshells). `installDependencies` constructs its own command from known parts so it can split cleanly. The build command cannot.

2. **Three-state return** (`boolean | null`) instead of plain `boolean`. `null` means no build command was configured — the step was skipped. `true`/`false` mean it ran and succeeded/failed. This distinction matters: the Build agent seeing `null` knows there's nothing to build, while `false` means "rebuild before testing."

Read `ana.json` with bare `fs.readFileSync` + `JSON.parse`, not the Zod schema from `anaJsonSchema.ts`. The build step is a utility — importing the schema adds coupling to the init module. A runtime `typeof === 'string'` check on `commands.build` is sufficient.

When the build command fails, `createWorktree()` does NOT throw. It records `buildSucceeded: false` in the result and continues. The worktree is still usable — source code, deps, and env files are all present. The developer may be entering the worktree specifically to fix a broken build.

## Output Mockups

**Build succeeds:**
```
Creating worktree for `payment-flow`...
  Branch: feature/payment-flow (new)
  Path: .ana/worktrees/payment-flow
  Dependencies: installed
  Build: succeeded
  Env files: .env, .env.local → symlinked
  Context: worktree-context.md written
```

**Build fails:**
```
Creating worktree for `payment-flow`...
  Branch: feature/payment-flow (new)
  Path: .ana/worktrees/payment-flow
  Dependencies: installed
  Build: failed — run `pnpm run build` in the worktree manually
  Env files: .env, .env.local → symlinked
  Context: worktree-context.md written
```

**No build command configured:**
```
Creating worktree for `payment-flow`...
  Branch: feature/payment-flow (new)
  Path: .ana/worktrees/payment-flow
  Dependencies: installed
  Build: skipped (no build command)
  Env files: .env, .env.local → symlinked
  Context: worktree-context.md written
```

**worktree-context.md build section (success):**
```markdown
## Build Status

Build command `pnpm run build` succeeded. Artifacts should be present.
```

**worktree-context.md build section (failure):**
```markdown
## Build Status

Build command `pnpm run build` failed. Run the build manually before testing:
`pnpm run build`
```

**worktree-context.md build section (skipped):**
```markdown
## Build Status

No build command configured in `.ana/ana.json`. If tests fail with MODULE_NOT_FOUND, add a `commands.build` entry.
```

## File Changes

### `packages/cli/src/utils/worktree.ts` (modify)
**What changes:** Add `runBuildCommand()` function, add `buildSucceeded` to `WorktreeCreateResult`, insert build step in `createWorktree()`, pass build status to `writeWorktreeContext()`.
**Pattern to follow:** `installDependencies()` at line 386 for the function shape. `writeWorktreeContext()` at line 495 for section output.
**Why:** Without this, worktrees have no `dist/` and baseline tests produce 283 MODULE_NOT_FOUND failures.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Add a `Build:` log line in the caller site at line 2054 (between Dependencies and Env files lines), using the `buildSucceeded` field from the result.
**Pattern to follow:** The existing `Dependencies: ${result.depsInstalled ? 'installed' : 'skipped'}` pattern at line 2054.
**Why:** The developer needs to see whether the build ran and whether it succeeded.

### `packages/cli/tests/utils/worktree.test.ts` (modify)
**What changes:** Add three new test cases inside the existing `createWorktree` describe block: build succeeds, build fails, no build command.
**Pattern to follow:** The existing `installs dependencies when lockfile exists` test at line 172 for test structure. Use `createTestProject()` helper with a modified `ana.json` that includes `commands.build`.
**Why:** AC10 requires tests for all three build outcomes.

## Acceptance Criteria

- [ ] AC1: `createWorktree()` runs `commands.build` from the worktree's `.ana/ana.json` after dependency installation and env file linking
- [ ] AC2: When `commands.build` is null/undefined, the build step is skipped silently
- [ ] AC3: When the build command fails, worktree creation completes with a warning (not a hard failure)
- [ ] AC4: The warning message includes the failed command and suggests running it manually
- [ ] AC5: The build runs with the worktree as CWD (not the main tree)
- [ ] AC6: Build step runs AFTER `installDependencies()` and `linkEnvFiles()`, BEFORE `initSubmodules()`
- [ ] AC7: `WorktreeCreateResult` includes a `buildSucceeded` field (`boolean | null` — null when skipped)
- [ ] AC8: `worktree-context.md` includes build status so the Build agent can see whether artifacts exist
- [ ] AC9: Existing worktree tests pass — no regressions in creation, removal, rollback, env linking, or context writing
- [ ] AC10: New tests cover: build succeeds, build fails (warns, doesn't throw), no build command (skips)
- [ ] AC11: Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] AC12: No build errors from `pnpm run build`

## Testing Strategy

- **Unit tests:** Three tests in the existing `createWorktree` describe block:
  1. **Build succeeds:** Set up `ana.json` with `commands.build` pointing to a trivial command (`echo built > dist/marker.txt`). Assert `result.buildSucceeded === true` and the marker file exists in the worktree.
  2. **Build fails:** Set up `ana.json` with `commands.build` pointing to a command that exits non-zero (`exit 1`). Assert `result.buildSucceeded === false` and that `createWorktree` did NOT throw.
  3. **No build command:** Use the default `createTestProject()` (no `commands` in ana.json). Assert `result.buildSucceeded === null`.
- **Edge cases:** The "no ana.json in worktree" case is covered by the "no build command" test — if `ana.json` doesn't exist or has no `commands` field, `runBuildCommand` returns `null`.
- **Regression:** All existing tests must continue to pass. The `createTestProject()` helper doesn't set `commands.build`, so existing tests will have `buildSucceeded: null` — no behavioral change.

## Dependencies

None. All changes are in existing files with no new dependencies.

## Constraints

- The build step must not break worktree rollback. If `createWorktree` throws during a later step (e.g., `writeWorktreeContext`), rollback must still clean up. Since `runBuildCommand` doesn't throw, it can't trigger rollback — but verify that adding it between linkEnvFiles and initSubmodules doesn't change the rollback path.
- `spawnSync` with `shell: true` inherits the parent process's environment. This is correct — build commands need PATH and other env vars.

## Gotchas

- **`installDependencies` returns `false` for "no lockfile" AND for "install failed."** The build function must NOT conflate "no command" with "command failed" — that's why the return type is `boolean | null` instead of `boolean`.
- **The `commands` field in ana.json is `Record<string, unknown>`.** The build value needs a runtime `typeof === 'string'` check. If someone puts `commands: { build: 42 }`, treat it like no build command (return `null`).
- **Test commands must work cross-platform.** Use `echo` for the success case — it works on all platforms. For the failure case, use `exit 1` (works in both bash and cmd via `shell: true`).
- **Existing tests create worktrees with `createTestProject()` which doesn't set `commands`.** After this change, those results will include `buildSucceeded: null`. Existing assertions don't check this field, so no tests break.
- **`writeWorktreeContext` receives build info via its `data` parameter.** The function signature needs a new optional field for build status. Don't change the existing fields — add alongside them.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Engine files have zero CLI dependencies — `worktree.ts` is in `utils/`, not `engine/`, so `chalk` is technically allowed but not needed here (warnings go through the caller in `work.ts`).
- Always use `--run` with `pnpm vitest` to avoid watch mode hang.

### Pattern Extracts

**`installDependencies()` — the structural analog (worktree.ts:386-412):**
```typescript
function installDependencies(wtPath: string): boolean {
  // Detect package manager
  let cmd: string;
  let args: string[];

  if (fs.existsSync(path.join(wtPath, 'pnpm-lock.yaml'))) {
    cmd = 'pnpm';
    args = ['install', '--frozen-lockfile'];
  } else if (fs.existsSync(path.join(wtPath, 'yarn.lock'))) {
    cmd = 'yarn';
    args = ['install', '--frozen-lockfile'];
  } else if (fs.existsSync(path.join(wtPath, 'package-lock.json'))) {
    cmd = 'npm';
    args = ['ci'];
  } else {
    // No lockfile — no dependencies to install
    return false;
  }

  const result = spawnSync(cmd, args, {
    cwd: wtPath,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  return result.status === 0;
}
```

**Caller site in work.ts (lines 2050-2060):**
```typescript
    const result = await createWorktree(projectRoot, slug, branchPrefix, contextData);
    const branchLabel = result.branchIsNew ? '(new)' : '(existing)';
    console.log(`  Branch: ${result.branch} ${branchLabel}`);
    console.log(`  Path: ${path.relative(process.cwd(), result.worktreePath) || result.worktreePath}`);
    console.log(`  Dependencies: ${result.depsInstalled ? 'installed' : 'skipped'}`);
    if (result.envFilesLinked.length > 0) {
      console.log(`  Env files: ${result.envFilesLinked.join(', ')} → symlinked`);
    } else {
      console.log('  Env files: none detected');
    }
    console.log(`  Context: ${result.contextFileWritten ? 'worktree-context.md written' : 'not written'}`);
```

**writeWorktreeContext section structure (worktree.ts:512-531):**
```typescript
  const sections: string[] = [
    `# Worktree Context: ${slug}`,
    '',
    `**Created:** ${new Date().toISOString()}`,
    '',
  ];

  if (data?.summary) {
    sections.push('## Summary', '', data.summary, '');
  }

  sections.push('## Contract Assertions', '');
  if (data?.contractAssertions) {
    sections.push(data.contractAssertions);
  } else {
    sections.push('_No contract assertions available._');
  }
```

### Proof Context

Active findings for `worktree.ts`:
- **Double H2 heading in risk profile** — `writeWorktreeContext` pushes `## Proof Findings` then content starts with `## Risk Profile`. Not related to this build but be aware of the section structure.
- **commitsBehind uses `origin/artifactBranch` but commitCount uses bare `artifactBranch`** — asymmetric ref comparison. Not related to this build.

No active findings for `worktree.test.ts` or `work.ts`.

### Checkpoint Commands

- After adding `runBuildCommand()` and updating `createWorktree()`: `(cd packages/cli && pnpm vitest run tests/utils/worktree.test.ts)` — Expected: all existing tests pass, `buildSucceeded` is `null` for all (no test projects have `commands.build`)
- After adding new tests: `(cd packages/cli && pnpm vitest run tests/utils/worktree.test.ts)` — Expected: 3 new tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2221+ tests pass (2218 existing + 3 new)
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 2218 passed, 2 skipped (2220 total)
- Current test files: 100
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2221+ tests in 100 files
- Regression focus: `tests/utils/worktree.test.ts` — all existing createWorktree tests must still pass with `buildSucceeded: null`
