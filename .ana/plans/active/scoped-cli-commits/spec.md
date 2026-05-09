# Spec: CLI commits must be scoped to intended paths

**Created by:** AnaPlan
**Date:** 2026-05-09
**Scope:** .ana/plans/active/scoped-cli-commits/scope.md

## Approach

Every `git commit` and `git diff --staged --quiet` call in the CLI currently operates on the entire staging index. Pre-existing staged changes from other sessions, manual operations, or concurrent pipeline work leak into unrelated commits. The fix: append `-- <paths>` to every commit and diff check so each operates only on the files the CLI intended to stage.

Six commit sites exist across three files. Three have diff check guards. The structural analog is `commitAndPushProofChanges` in proof.ts (line 165) — it already has `options.files` as a path array. The pattern: collect the paths you staged, pass them to both the diff check and the commit via `'--', ...paths`.

For simple sites (work.ts sites 3/4, proof.ts site 6), the paths are known inline — just append `'--', ...paths` to the commit args. For complex sites (artifact.ts sites 1/2), introduce a `stagedPaths: string[]` array declared before the staging try block, push to it alongside each `git add`/`git rm` call, then pass it to both the diff check and commit.

For the `commitSaves` function (work.ts site 5), the path is already in `savesRelPath` — append it to both the diff check and commit.

## Output Mockups

No user-visible output changes. With a clean index, behavior is identical. With a dirty index, the CLI now commits only its own files instead of sweeping in unrelated staged changes.

## File Changes

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Four changes across two commit sites.

**Site 1 (single artifact save, lines 1216–1286):**
- Declare `const stagedPaths: string[] = []` before the staging try block at line 1216.
- Push each path to `stagedPaths` alongside every `git add` call: `relFilePath` (line 1217), `relCompanionPath` (line 1221, conditional), each `archivePath` (line 1226), `relPlanPath` (line 1233, conditional). Also push `path.relative(projectRoot, savesPath)` alongside the saves staging (line 1263, conditional).
- Append `'--', ...stagedPaths` to the diff check at line 1268.
- Append `'--', ...stagedPaths` to the commit at line 1281.

**Site 2 (multi artifact save-all, lines 1598–1668):**
- Declare `const stagedPaths: string[] = []` before the staging try block at line 1598.
- Push each path to `stagedPaths` alongside every `git add` call: each `artifactPath` (line 1600), each `companion.relPath` (line 1605), each `archivePath` (line 1610). For the plan.md special case (line 1617), push `path.relative(projectRoot, planPath)` — use the relative path, not the absolute `planPath` that's passed to `git add`. For orphan `git rm` calls (lines 1627–1629), push `path.relative(projectRoot, path.join(planDir, tracked))` — this is the same value passed to `git rm`.
- Push `path.relative(projectRoot, savesPathAll)` alongside the saves staging (line 1651, conditional).
- Append `'--', ...stagedPaths` to the diff check at line 1656.
- Append `'--', ...stagedPaths` to the commit at line 1668.

**Pattern to follow:** The commit at proof.ts line 165 — `spawnSync('git', ['commit', '-m', commitMessage], ...)` becomes `spawnSync('git', ['commit', '-m', commitMessage, '--', ...paths], ...)`.

**Why:** Without scoping, `git commit` sweeps in every staged file. The observed bug: `work complete commit-work-start-timestamps` (commit `bb2ee1f`) swept `polish-scan-copy`'s staged deletions into its commit.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Three changes across three commit sites.

**Site 3 (recovery commit, line 1282):**
- The paths are already visible inline at line 1280: `.ana/plans/completed/${slug}/`, `.ana/proof_chain.json`, `.ana/PROOF_CHAIN.md`. Append `'--'` plus these same paths to the commit args at line 1282.

**Site 4 (main `completeWork` commit, line 1508):**
- The paths are already visible inline at line 1506: `.ana/plans/active/${slug}/`, `.ana/plans/completed/${slug}/`, `.ana/proof_chain.json`, `.ana/PROOF_CHAIN.md`. Append `'--'` plus these same paths to the commit args at line 1508.

**Site 5 (`commitSaves`, lines 2040/2048):**
- Append `'--', savesRelPath` to the diff check at line 2040.
- Append `'--', savesRelPath` to the commit at line 2048.

**Pattern to follow:** Same as artifact.ts — append `'--', ...paths` to the spawnSync args array.

**Why:** Same root cause. Any staged change leaks into these commits.

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** One change.

**Site 6 (`commitAndPushProofChanges`, line 165):**
- Append `'--', ...options.files` to the commit args. The path array already exists as a typed parameter.

**Pattern to follow:** This IS the structural analog — simplest possible change.

**Why:** Same root cause.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** Add one test proving scoped commits work. Target site 4 (`completeWork` main path) because it's the most complex — directory moves, deletions, proof chain writes.

The test should: set up a merged project via `createMergedProject`, stage an unrelated file (`echo "unrelated" > unrelated.txt && git add unrelated.txt`), run `completeWork`, then verify:
1. The unrelated file is NOT in the commit (`git diff-tree --no-commit-id --name-only -r HEAD` should not contain `unrelated.txt`).
2. The unrelated file IS still staged (`git diff --cached --name-only` should contain `unrelated.txt`).

**Pattern to follow:** The existing `completeWork` happy path tests at line 688 — same `createMergedProject` setup, same assertion style.

**Why:** Proves the fix works end-to-end. Without scoping, the unrelated file would appear in the commit.

## Acceptance Criteria

- [ ] AC1: `work complete` commit (line 1508) includes only `active/{slug}/`, `completed/{slug}/`, `proof_chain.json`, `PROOF_CHAIN.md` — no other staged files leak in
- [ ] AC2: `work complete` recovery commit (line 1282) includes only `completed/{slug}/`, `proof_chain.json`, `PROOF_CHAIN.md`
- [ ] AC3: `commitSaves` commit (line 2048) includes only `.ana/plans/active/{slug}/.saves.json`
- [ ] AC4: `artifact save` single commit (line 1281) includes only the artifact file, companion YAML (if present), archive files, plan.md (if verify-report), and .saves.json
- [ ] AC5: `artifact save` multi commit (line 1668) includes only the artifact files, companion YAMLs, archive files, plan.md (if verify-report), orphan removals, and .saves.json
- [ ] AC6: `commitAndPushProofChanges` commit (proof.ts line 165) includes only `options.files`
- [ ] AC7: `artifact save` single diff check (line 1268) checks only the artifact's staged paths, not the entire index
- [ ] AC8: `artifact save` multi diff check (line 1656) checks only the artifacts' staged paths, not the entire index
- [ ] AC9: `commitSaves` diff check (line 2040) checks only `.ana/plans/active/{slug}/.saves.json`, not the entire index
- [ ] AC10: With a clean index, all nine sites produce identical behavior to current code — no regressions
- [ ] AC11: At least one test targeting site 4 (`completeWork` main path) stages an unrelated file, runs `completeWork`, verifies the unrelated file is NOT in the resulting commit (via `git diff-tree --no-commit-id --name-only -r HEAD`), and verifies it IS still staged afterward (via `git diff --cached --name-only`)
- [ ] AC12: `git rm` orphan paths at artifact.ts site 2 (lines 1627–1629) are included in the scoped commit — orphan cleanup is committed, not left staged
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`

## Testing Strategy

- **Unit test:** One new test in `work.test.ts` targeting `completeWork` (site 4). Stages an unrelated file before calling `completeWork`, verifies it's excluded from the commit and still staged afterward. Uses the existing `createMergedProject` helper and real git repos — no mocks.
- **Regression:** All 2047 existing tests must continue to pass. The change is invisible when the index is clean (the normal case), so no existing tests should break.
- **Edge cases covered by design:** Empty `stagedPaths` (nothing to stage) → `git diff --staged --quiet --` with no paths returns 0 → early exit fires. This matches current behavior.

## Dependencies

None. All changes are to existing files with no new imports.

## Constraints

- No changes to user-visible output. The fix is invisible to users with clean indexes.
- `git commit -- <paths>` uses `--only` semantics (working tree, not index). Since `git add` and `git commit` are always adjacent synchronous calls at every site, working tree and index match. No practical difference.

## Gotchas

- **Site 2 `planPath` is absolute.** Line 1617 passes `path.join(planDir, 'plan.md')` to `git add` — an absolute path. The `stagedPaths` array needs the relative version: `path.relative(projectRoot, planPath)`. The relative form is already computed at line 1616 for the `includes` check.
- **Site 2 orphan `git rm` paths.** Lines 1627–1629 use `git rm` not `git add`. These deletions must also go into `stagedPaths`. The path passed to `git rm` is `path.relative(projectRoot, path.join(planDir, tracked))` — collect that same value.
- **`stagedPaths` must be declared BEFORE the try block.** The staging block at artifact.ts sites 1 and 2 is inside a try/catch. If `stagedPaths` is declared inside the try block, the diff check and commit (which are outside the try block) can't access it. Declare it before the try.
- **Site 1 saves staging is also outside the main try block.** The `.saves.json` staging at lines 1260–1264 is in its own try/catch after the main staging block. The `stagedPaths` array must be accessible from both try blocks — another reason to declare it before either block.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Always pass `--run` flag when invoking Vitest to avoid watch mode hang.
- Tests that create git repositories must force branch name with `git branch -M main` after first commit.
- Test behavior, not implementation — assert on git state, not internal function calls.
- Prefer real implementations over mocks.

### Pattern Extracts

**Structural analog — proof.ts lines 162–165 (the commit to scope):**
```typescript
  // Stage and commit
  runGit(['add', ...options.files], { cwd: options.proofRoot });
  const commitMessage = `${options.message}\n\nCo-authored-by: ${options.coAuthor}`;
  const commitResult = spawnSync('git', ['commit', '-m', commitMessage], { stdio: 'pipe', cwd: options.proofRoot });
```

**Diff check pattern — artifact.ts lines 1268–1273:**
```typescript
  const diffResult = spawnSync('git', ['diff', '--staged', '--quiet'], { cwd: projectRoot });
  if (diffResult.status === 0) {
    // status 0 means no differences — nothing to commit
    console.log(chalk.yellow('No changes to save — artifact is already up to date.'));
    process.exit(0);
  }
```

**Test pattern — work.test.ts lines 688–706 (happy path assertion style):**
```typescript
    describe('happy path', () => {
      it('completes single-spec work with PASS', async () => {
        await createMergedProject({ slug: 'test-slug', phases: 1 });

        await completeWork('test-slug');

        // Verify directory moved
        const activePath = path.join(tempDir, '.ana', 'plans', 'active', 'test-slug');
        const completedPath = path.join(tempDir, '.ana', 'plans', 'completed', 'test-slug');
        expect(fsSync.existsSync(activePath)).toBe(false);
        expect(fsSync.existsSync(completedPath)).toBe(true);
```

### Proof Context

No active proof findings related to commit scoping or staging behavior for any of the three affected files. Known findings are about YAML parsing, CRLF normalization, and JSDoc — unrelated to this work.

### Checkpoint Commands

- After proof.ts change: `(cd packages/cli && pnpm vitest run tests/commands/proof.test.ts)` — Expected: all proof tests pass
- After work.ts changes: `(cd packages/cli && pnpm vitest run tests/commands/work.test.ts)` — Expected: all work tests pass including the new dirty-index test
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2048+ tests pass (2047 existing + 1 new)
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 2047 passed, 2 skipped (2049 total)
- Current test files: 96 passed
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2048+ passed in 96 test files
- Regression focus: `tests/commands/work.test.ts`, `tests/commands/proof.test.ts` — tests that exercise commit behavior
