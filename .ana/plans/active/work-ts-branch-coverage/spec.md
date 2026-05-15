# Spec: work.ts untested branch coverage

**Created by:** AnaPlan
**Date:** 2026-05-14
**Scope:** .ana/plans/active/work-ts-branch-coverage/scope.md

## Approach

Add two tests to the existing `completeWork` describe block in `packages/cli/tests/commands/work.test.ts`. Both tests exercise defensive branches that currently have zero coverage:

1. **UNKNOWN result warning** (work.ts:868-875): When `parseResult` returns UNKNOWN (no valid `**Result:** PASS/FAIL` line in verify report) and the verify report file exists in the completed directory, a yellow warning fires. The test creates a merged project, overwrites the verify report to remove the Result line, then calls `completeWork` and asserts on the warning output and the proof chain entry's `result` field.

2. **Pull conflict error exit** (work.ts:1335-1341): When `git pull --rebase --autostash` produces a conflict (stderr contains "conflict"), `completeWork` exits with code 1 and an error message. The test creates a bare remote with a divergent commit, so the pull hits a real rebase conflict.

Both tests follow the structural analog at work.test.ts:3249-3267 (the existing pull-failure test): same describe block neighborhood, same console capture pattern, same process.exit spy pattern.

## Output Mockups

**UNKNOWN warning output (what the test asserts on):**
```
Warning: Entry 'unknown-test' has result UNKNOWN but a verify report exists. Check verify_report.md for a Result line.
```

**Conflict error output (what the test asserts on):**
```
Error: Pull failed due to conflicts. Resolve conflicts and try again.
  git stderr: <first line of git's conflict message>
```

## File Changes

### packages/cli/tests/commands/work.test.ts (modify)
**What changes:** Add two new test cases inside the `completeWork` describe block.
**Pattern to follow:** The existing pull-failure test at lines 3249-3267 — same console capture, same assertion style.
**Why:** Two defensive branches (UNKNOWN warning, conflict exit) have zero coverage. If these branches regress, nothing catches it.

## Acceptance Criteria

- [x] AC1: A test exercises the UNKNOWN result warning at work.ts:868-875. It creates a verify report without a `**Result:**` line, confirms the yellow warning fires containing "UNKNOWN" and "verify_report.md", and confirms completeWork still succeeds (writes proof chain entry).
- [x] AC2: A test exercises the pull conflict error at work.ts:1335-1342. It sets up a git state where `pull --rebase` produces a conflict, confirms `process.exit(1)` is called, and confirms the error message contains "conflict."
- [x] AC3: Both tests live in `packages/cli/tests/commands/work.test.ts`, not a new file.
- [ ] Tests pass with `pnpm vitest run tests/commands/work.test.ts`
- [ ] No build errors
- [ ] Existing tests unaffected (no regressions)

## Testing Strategy

- **Unit tests:** Two new tests in the existing `completeWork` describe block. No integration tests needed — these are pure behavior assertions on specific branches.
- **Edge cases covered:**
  - UNKNOWN test: verify the proof chain entry has `result: 'UNKNOWN'` — not just that the warning fires
  - Conflict test: use a real git conflict (divergent history on same file), not a simulated error

## Dependencies

None. Both tests use existing infrastructure (`createMergedProject`, `tempDir`, `completeWork` import).

## Constraints

- No production code changes. Test-only.
- `process.exit` spy must restore cleanly (use mockImplementation that throws, catch it in the test).
- Git operations in tests must force branch name with `git branch -M main` (CI default branch varies).

## Gotchas

1. **UNKNOWN warning fires AFTER the plan moves to completed.** The sequence is: step 9 copies active→completed (line 1604), then step 9a calls `writeProofChain` (line 1616), which checks `completedPlanDir` for the verify report (line 871). The fixture must overwrite the verify report in the *active* directory BEFORE calling `completeWork` — the `cp` will carry it to completed.

2. **The UNKNOWN check requires BOTH conditions:** `proof.result === 'UNKNOWN'` AND `fs.existsSync(verifyReportPath)`. Since `createMergedProject` always writes a verify report, overwriting its content (removing the Result line) satisfies both — the file exists, and parseResult returns UNKNOWN.

3. **The conflict test needs a remote that actually works.** The existing pull-failure test uses an invalid URL (which triggers the non-conflict WARNING path at lines 3343-3346). The conflict test needs: bare repo as remote → push initial state → create local divergent commit on same file → `pull --rebase` will produce conflict stderr containing "conflict".

4. **`process.exit` spy pattern:** The test must catch the thrown error from the mock. Pattern: `vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); })` then wrap `completeWork()` in try/catch and assert on the captured console output.

5. **The pull only runs if a remote exists** (line 1243 checks `runGit(['remote']).stdout`). The conflict test must have a remote configured — which it naturally will since it uses a bare repo.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins
- Tests must force branch name with `git branch -M main` after first commit
- Always use `--run` flag with vitest (no watch mode)
- Assert on specific expected values, not existence checks
- Prefer real implementations over mocks — the conflict test uses a real git conflict

### Pattern Extracts

Structural analog — the existing pull-failure test (work.test.ts:3249-3267):
```typescript
    // @ana A027
    describe('work complete warns on pull failure', () => {
      it('warns on non-conflict pull failure', async () => {
        await createMergedProject({ slug: 'pull-warn-test', phases: 1 });

        // Add a remote that will fail with a non-conflict error
        execSync('git remote add origin https://invalid.example.com/repo.git', { cwd: tempDir, stdio: 'ignore' });

        const originalError = console.error;
        const errors: string[] = [];
        console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };

        await completeWork('pull-warn-test');

        console.error = originalError;
        const output = errors.join('\n');
        expect(output).toContain('Warning');
        expect(output).toContain('Pull failed');
      });
    });
```

The `createMergedProject` helper signature (work.test.ts:1085-1094):
```typescript
    async function createMergedProject(options: {
      slug: string;
      phases?: number;
      verifyResults?: string[];
      merged?: boolean;
      branchDeleted?: boolean;
    }): Promise<void> {
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands

- After UNKNOWN test added: `(cd packages/cli && pnpm vitest run tests/commands/work.test.ts)` — Expected: passes including new test
- After conflict test added: `(cd packages/cli && pnpm vitest run tests/commands/work.test.ts)` — Expected: all tests pass
- Full suite: `(cd packages/cli && pnpm vitest run)` — Expected: 2283+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2283 (2281 passed, 2 skipped)
- Current test files: 102
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2285 tests in 102 files
- Regression focus: other tests in the `completeWork` describe block — ensure process.exit spy doesn't leak
