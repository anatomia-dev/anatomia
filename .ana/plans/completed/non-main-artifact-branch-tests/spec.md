# Spec: Non-Main Artifact Branch Tests

**Created by:** AnaPlan
**Date:** 2026-05-06
**Scope:** .ana/plans/active/non-main-artifact-branch-tests/scope.md

## Approach

Add representative tests proving each pipeline command respects `artifactBranch: 'develop'`. The test helpers (`createWorkTestProject`, `createTestProject`, `createStartTestProject`) already accept `artifactBranch` as a parameter and set up the git repo accordingly — every new test follows the existing pattern and passes `artifactBranch: 'develop'`.

Fix the init display bug: `displaySuccessMessage` at `state.ts:634` reads `engineResult.git.defaultBranch` instead of the configured artifact branch. Replace with `anaConfig?.['artifactBranch']` and preserve the existing fallback chain for when `anaConfig` is undefined.

## Output Mockups

### Init display — before fix
```
  Branch:   main
```
(Shows git default branch even when `artifactBranch` is `develop` in ana.json)

### Init display — after fix
```
  Branch:   develop
```
(Shows the configured artifact branch from ana.json)

## File Changes

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** Add a `describe('non-main artifact branch')` block inside the `ana work status` describe, containing tests for `getWorkStatus` with `artifactBranch: 'develop'`. Add a test inside the `ana work start` describe proving `startWork` validates against `develop` instead of `main`. Add a test proving `startWork` rejects when not on the `develop` artifact branch.
**Pattern to follow:** Existing `describe('stage detection - single-spec')` tests at lines 115–252 for work status. Existing `createStartTestProject` tests at lines 2799–2977 for startWork.
**Why:** Zero tests currently exercise the non-main `artifactBranch` path for these functions.

### `packages/cli/tests/commands/artifact.test.ts` (modify)
**What changes:** Add a `describe('non-main artifact branch')` block inside `ana artifact save`, containing tests proving scope save requires the `develop` artifact branch and build-report save rejects when on the `develop` artifact branch.
**Pattern to follow:** Existing `describe('branch validation')` tests at lines 309–353.
**Why:** All branch validation tests hardcode `artifactBranch: 'main'`. No test proves the validation logic uses the configured value instead of a hardcoded `'main'`.

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** Line 634 — replace `engineResult.git.defaultBranch` with `anaConfig?.['artifactBranch'] as string`. Preserve the existing fallback chain (`?? engineResult.git.branch ?? 'main'`) for when `anaConfig` is undefined or has no `artifactBranch`.
**Pattern to follow:** Line 638 already reads `anaConfig?.['commands']` with the same optional chaining pattern.
**Why:** Currently displays the git default branch instead of the configured artifact branch. A team with `artifactBranch: 'develop'` sees `Branch: main` in init output — misleading.

## Acceptance Criteria

- [ ] AC1: `startWork` works with `artifactBranch: 'develop'` — validates against `develop`, not `main`
- [ ] AC2: `getWorkStatus` correctly discovers slugs when artifact branch is `develop`
- [ ] AC3: `saveArtifact` for scope validates branch against `develop`
- [ ] AC4: `saveArtifact` for build-report validates against `develop` (must NOT be on `develop`)
- [ ] AC5: `completeWork` validates against `develop`
- [ ] AC6: Init display at `state.ts:634` shows the configured `artifactBranch`, not the git default branch
- [ ] AC7: All existing tests pass (no regression)
- [ ] AC8: Build succeeds, typecheck clean, lint clean

## Testing Strategy

- **Unit tests:** Each new test follows the structure of its nearest neighbor. Work status tests use `createWorkTestProject({ artifactBranch: 'develop' })`. Artifact tests use `createTestProject({ artifactBranch: 'develop' })`. StartWork tests use `createStartTestProject({ artifactBranch: 'develop' })`.
- **Integration tests:** Not needed — these are integration-level already (real git repos, real file operations).
- **Edge cases:**
  - `startWork` on wrong branch when artifact branch is `develop` (not on `develop` → reject with error mentioning `develop`)
  - `getWorkStatus` with feature branch when artifact branch is `develop` — verify stage detection works identically to the main-based tests

## Dependencies

None. All test infrastructure exists.

## Constraints

- Tests must use individual `it()` blocks, not `.each()` — matches existing style.
- New tests go in `describe('non-main artifact branch')` blocks within existing top-level describes.
- Use `'develop'` consistently as the non-main test value.

## Gotchas

- The `createWorkTestProject` helper runs `git branch -M {artifactBranch}` to rename the initial branch. When `artifactBranch: 'develop'`, the repo has no `main` branch. Tests that create feature branches and then `git checkout {artifactBranch}` will correctly check out `develop`. Don't accidentally reference `main` in any new test setup.
- The `state.ts` fix must preserve the fallback for `anaConfig` being `undefined` — the parameter is optional. The expression should be `anaConfig?.['artifactBranch'] as string ?? engineResult.git.defaultBranch ?? engineResult.git.branch ?? 'main'` so that when `anaConfig` exists, its value wins, but when it doesn't, the old behavior is preserved.
- For the `completeWork` test: the setup is substantial (needs merged feature branch, `.saves.json`, verify report with PASS result). Follow the pattern from the existing `work complete uses configured prefix for branch cleanup` test at line 538, which already builds the full completeWork fixture. Adapt it to use `artifactBranch: 'develop'` and `feature/` prefix.
- The `saveArtifact` for build-report test with `develop` must use `currentBranch` that is NOT `develop` — use `feature/test-slug` as the non-artifact branch, same as existing tests.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Explicit return types on exported functions.
- Prefer early returns over nested conditionals.
- Always use `--run` with pnpm vitest to avoid watch mode hang.

### Pattern Extracts

**Work status test pattern** (work.test.ts lines 116–127):
```typescript
    it('scope only → ready-for-plan', async () => {
      await createWorkTestProject({
        slugs: [{
          slug: 'test-slug',
          artifacts: ['scope.md'],
        }],
      });

      const output = captureOutput(() => getWorkStatus({ json: false }));
      expect(output).toContain('ready-for-plan');
      expect(output).toContain('claude --agent ana-plan');
    });
```

**Artifact branch validation test pattern** (artifact.test.ts lines 310–322):
```typescript
    it('allows scope save on artifact branch', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'main' });
      await createArtifact('test-slug', 'scope.md');

      expect(() => saveArtifact('scope', 'test-slug')).not.toThrow();
    });

    it('rejects scope save on feature branch', async () => {
      await createTestProject({ artifactBranch: 'main', currentBranch: 'feature/test-slug' });
      await createArtifact('test-slug', 'scope.md');

      expect(() => saveArtifact('scope', 'test-slug')).toThrow();
    });
```

**StartWork test pattern** (work.test.ts lines 2799–2807):
```typescript
  it('creates plan directory on start', async () => {
    await createStartTestProject();

    await startWork('fix-auth-timeout');

    const slugDir = path.join(tempDir, '.ana', 'plans', 'active', 'fix-auth-timeout');
    expect(fsSync.existsSync(slugDir)).toBe(true);
  });
```

**StartWork branch rejection pattern** (work.test.ts lines 2958–2977):
```typescript
  it('rejects start on non-artifact branch', async () => {
    await createStartTestProject({ currentBranch: 'feature/other-thing' });

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const originalError = console.error;
    const errors: string[] = [];
    console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };

    await expect(startWork('fix-auth-timeout')).rejects.toThrow('process.exit');

    console.error = originalError;
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorOutput = errors.join('\n');
    expect(errorOutput).toContain('feature/other-thing');
    expect(errorOutput).toContain('main');
    mockExit.mockRestore();
  });
```

**Init display line** (state.ts line 634):
```typescript
    const artifactBranch = engineResult.git.defaultBranch ?? engineResult.git.branch ?? 'main';
```

**anaConfig usage on the next line** (state.ts line 638):
```typescript
    const configCmds = anaConfig?.['commands'] as Record<string, string | null> | undefined;
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands

- After work.test.ts changes: `cd packages/cli && pnpm vitest run tests/commands/work.test.ts` — Expected: all existing + new tests pass
- After artifact.test.ts changes: `cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts` — Expected: all existing + new tests pass
- After state.ts fix: `cd packages/cli && pnpm vitest run` — Expected: all tests pass
- After all changes: `cd packages/cli && pnpm vitest run` — Expected: 1913+ tests pass (was 1913)
- Lint: `pnpm run lint`
- Typecheck: pre-commit hook runs `tsc --noEmit`

### Build Baseline
- Current tests: 1913 passed, 2 skipped (1915 total)
- Current test files: 95
- Command used: `cd packages/cli && pnpm vitest run`
- After build: expected ~1921-1923 tests (1913 + ~8-10 new) in 95 files
- Regression focus: `tests/commands/work.test.ts`, `tests/commands/artifact.test.ts` — existing tests must not break from additions
