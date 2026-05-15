# Spec: Worktree Guard Integration Tests

**Created by:** AnaPlan
**Date:** 2026-05-14
**Scope:** .ana/plans/active/worktree-guard-tests/scope.md

## Approach

Create one test file (`packages/cli/tests/commands/worktree-guards.test.ts`) with four `describe` blocks — one per guarded command. Each test creates a temp directory containing a fake `.git` file with worktree-style content (`gitdir: /fake/.git/worktrees/test`), chdir into it, and verifies the guard fires.

Three commands (`init`, `setup complete`, `scan --save`) are tested through Commander `parseAsync` — register the command on a fresh `Command()` instance via the exported `register*Command` function, then call `parseAsync`. The fourth (`completeWork`) is an exported function — call it directly.

The fake `.git` file approach is correct because `isWorktreeDirectory()` checks for a `.git` FILE (not directory) whose content includes `/worktrees/`. No git init needed. The detection-layer tests in `worktree.test.ts` already cover real worktrees — these tests verify the next layer: detection → guard → exit/warn.

For `scan --save`, the scan continues after the warning. The scan engine will run against the temp directory (near-empty, just the `.git` file). The test captures `console.warn` output, then lets the scan run or fail naturally — the assertion is on the warning message, not the scan result. Mock `process.exit` to ensure it's NOT called (the warning-only guard must not exit).

## Output Mockups

These tests produce no user-facing output. They verify that existing guards emit the correct error/warning messages.

Expected `console.error` output from init/setup/work guards:
```
Error: Run init from the main project directory, not from a worktree.
Error: Run setup from the main project directory, not from a worktree.
Error: Run work complete from the main project directory, not from a worktree.
```

Expected `console.warn` output from scan --save guard:
```
Warning: You're in a worktree. Saving scan.json here is probably not intended. Run from the main project directory to update the project scan.
```

## File Changes

### `packages/cli/tests/commands/worktree-guards.test.ts` (create)
**What changes:** New test file with four describe blocks testing each worktree guard.
**Pattern to follow:** `work.test.ts:1317-1348` — the `process.exit` mock + `console.error` capture pattern.
**Why:** These guards prevent repo corruption but are currently verified only by source inspection (A028, A030, A031, A032). Integration tests prove the guards actually fire.

## Acceptance Criteria

- [x] AC1: A test verifies that `ana init` from a directory with a worktree `.git` file calls `process.exit(1)` and prints an error containing "main project directory"
- [x] AC2: A test verifies that `ana setup complete` from a directory with a worktree `.git` file calls `process.exit(1)` and prints an error containing "main project directory"
- [x] AC3: A test verifies that `completeWork()` from a directory with a worktree `.git` file calls `process.exit(1)` and prints an error containing "main project directory"
- [x] AC4: A test verifies that `ana scan --save` from a directory with a worktree `.git` file prints a warning containing "worktree" to `console.warn` and does NOT call `process.exit(1)`
- [x] AC5: Each test restores `process.cwd`, `process.exit`, and `console.error`/`console.warn` in afterEach — no test pollution
- [x] AC6: All existing tests continue to pass
- [x] Tests pass with `pnpm vitest run`
- [x] No build errors

## Testing Strategy

- **Unit tests:** Not applicable — this scope IS the tests.
- **Integration tests:** Each test exercises the full path from command invocation through `isWorktreeDirectory()` detection to exit/warn behavior.
- **Edge cases:** 
  - `scan --save` must warn but NOT exit — assert `process.exit` was NOT called with 1
  - Commander must not interfere with the guard — the mock catches exit before Commander does anything else

## Dependencies

None. All guarded commands and `isWorktreeDirectory` already exist.

## Constraints

- No production code changes. Tests only.
- Test must not create real git worktrees — use fake `.git` file fixture.
- `afterEach` must restore `process.cwd`, all console spies, and `process.exit` — no test pollution across files.

## Gotchas

- **Commander `parseAsync` calls `process.exit(0)` on success.** The `process.exit` mock must distinguish exit(1) from exit(0). Assert specifically with `toHaveBeenCalledWith(1)`.
- **`scan --save` continues after the warning.** The scan engine will attempt to run in the temp directory. It may succeed (empty project scan) or throw. The test should handle either outcome — wrap the `parseAsync` call to tolerate errors after the warning. The assertion is on `console.warn` content only.
- **chalk wraps messages in ANSI codes.** Use `.toContain('main project directory')` and `.toContain('worktree')` — never exact string match.
- **`completeWork` requires a slug argument.** Pass any valid slug like `'test-slug'`. The guard fires before slug validation, so the value doesn't matter — but it must be valid kebab-case to avoid a different exit(1) from `validateSlug`.
- **Commander `exitOverride`.** Call `.exitOverride()` on the program before `parseAsync` to prevent Commander from calling `process.exit(0)` on its own (for `--help`, `--version`, or after success). This avoids false positive assertions on exit calls. Without this, Commander's own exit(0) can interfere with checking that the guard's exit(1) fires.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { completeWork } from '../../src/commands/work.js'`
- Use `import type` for type-only imports, separate from value imports
- Always pass `--run` flag when invoking Vitest
- Test behavior, not implementation — assert on exit codes and error messages, not internal function calls
- Use `fs.mkdtemp` for temp directories in tests
- Restore all spies in `afterEach` — no test pollution

### Pattern Extracts

From `work.test.ts:1317-1327` — the process.exit mock + assertion pattern:
```typescript
// @ana A028
it('blocks completion with exit code 1 on FAIL result', async () => {
  await createMergedProject({ slug: 'test-slug', phases: 1, verifyResults: ['FAIL'] });

  const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit');
  }) as never);

  await expect(completeWork('test-slug')).rejects.toThrow('process.exit');
  expect(mockExit).toHaveBeenCalledWith(1);
  mockExit.mockRestore();
});
```

From `work.test.ts:1330-1348` — console.error capture + assertion pattern:
```typescript
// @ana A029
it('FAIL error message includes remediation guidance', async () => {
  await createMergedProject({ slug: 'test-slug', phases: 1, verifyResults: ['FAIL'] });

  const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit');
  }) as never);
  const originalError = console.error;
  const errors: string[] = [];
  console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };

  await expect(completeWork('test-slug')).rejects.toThrow('process.exit');

  console.error = originalError;
  const errorOutput = errors.join('\n');
  expect(errorOutput).toContain('claude --agent ana-build');
  expect(errorOutput).toContain('FAIL');
  mockExit.mockRestore();
});
```

From `worktree.test.ts:22-28` — temp dir + cwd save/restore pattern:
```typescript
let tempDir: string;
let originalCwd: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-test-'));
  originalCwd = process.cwd();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
});
```

From `src/utils/worktree.ts:87-101` — what `isWorktreeDirectory` checks:
```typescript
export function isWorktreeDirectory(dir?: string): boolean {
  const checkDir = dir ?? process.cwd();
  const gitPath = path.join(checkDir, '.git');
  try {
    const stat = fs.statSync(gitPath);
    if (!stat.isFile()) return false;
    const content = fs.readFileSync(gitPath, 'utf-8');
    return content.includes('/worktrees/');
  } catch {
    return false;
  }
}
```

The fake `.git` file content that triggers detection: `gitdir: /fake/.git/worktrees/test`

### Proof Context

No active proof findings for affected files.

### Checkpoint Commands

- After creating test file: `(cd packages/cli && pnpm vitest run tests/commands/worktree-guards.test.ts --run)` — Expected: 4+ tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: all 2281+ tests pass
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 2281 passed, 2 skipped (2283 total)
- Current test files: 102 passed
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2285+ tests in 103 files (1 new file, 4+ new tests)
- Regression focus: None — no production code is modified
