# Spec: Worktree Artifact Path Mismatch — Prevention and Cleanup

**Created by:** AnaPlan
**Date:** 2026-05-07
**Scope:** .ana/plans/active/worktree-artifact-cleanup/scope.md

## Approach

The disease is detection-without-correction: `artifact save` already knows the file is on the wrong tree but exits with manual instructions instead of fixing it. Four layers, each covering a failure mode the previous can't reach.

**Layer 1 (artifact save — auto-move):** Replace the error-and-exit block at artifact.ts line 938-951 with an auto-move. When the file exists on the main tree but not the worktree, move it (and its companion) to the worktree and continue the save. Use `fs.renameSync` with a copy-delete fallback for cross-filesystem worktrees (EXDEV). Only move untracked files — if a file is tracked on main, something is wrong and the save should error.

The companion file MUST be moved in the same block, before execution reaches the companion discovery at line 1029. If only the report moves, companion discovery fails the save with a missing-companion error.

**Layer 2 (artifact save — post-save sweep):** After the git commit succeeds (after the stage + commit block around line 1108-1132), check whether the main tree has untracked copies of the files that were just saved. Delete them. This covers the edge case where the agent wrote to both trees — the worktree copy existed so Layer 1 never fired, but the stale main-tree copy persists.

**Layer 3 (work complete — refined auto-clean):** Refine the auto-clean block at work.ts line 1053-1082. Split behavior by filename: build/verify artifacts (`build_report*.md`, `build_data*.yaml`, `verify_report*.md`, `verify_data*.yaml`) get removed unconditionally (no content-match). Planning artifacts keep the existing content-match guard. The `slugFiles` array is already available — partition it by filename pattern and apply the appropriate cleanup strategy to each group.

**Layer 4 (agent templates — pwd hint):** Add one instruction line to Build and Verify templates near their report-write sections. Wording: "Determine the absolute path with `pwd` before writing — Claude Code's Write tool resolves paths against the main tree, not the worktree." Universally correct, no worktree jargon.

## Output Mockups

**Layer 1 — auto-move message (artifact save):**
```
  ℹ Moved build_report.md from main tree to worktree
  ℹ Moved build_data.yaml from main tree to worktree
✓ build_data.yaml validated (2 concerns)
[worktree-artifact-cleanup] Build report
```

**Layer 2 — post-save sweep message:**
```
[worktree-artifact-cleanup] Build report
  ⚠ Removed stale build_report.md from main tree
  ⚠ Removed stale build_data.yaml from main tree
```

**Layer 3 — work complete auto-clean with split behavior:**
```
  ⚠ Removed 2 untracked build/verify artifact(s) from main (always agent-written).
  ⚠ Removed 1 untracked planning artifact(s) from main (matched merged content).
```

If only build/verify artifacts are present and removed, no content-match is attempted for those. If planning artifacts are also present, content-match runs for those only.

## File Changes

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Two additions: (1) Layer 1 — replace the error-and-exit block (lines 938-951) with auto-move logic. Move both report and companion from main tree to worktree. (2) Layer 2 — add a post-save sweep after the git commit that removes untracked main-tree copies of the saved files.
**Pattern to follow:** The rename pattern at lines 920-924 (detect file in wrong location, `renameSync`, log, continue). The untracked check pattern at line 1083 (`spawnSync` with `git ls-files --error-unmatch`).
**Why:** Without Layer 1, the save fails with manual instructions. Without Layer 2, a dual-write leaves a stale copy on main that blocks `work complete`.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Layer 3 — refine the auto-clean block (lines 1053-1082). Partition `slugFiles` into build/verify artifacts (by filename pattern) and planning artifacts (everything else). Remove build/verify unconditionally. Keep content-match for planning artifacts.
**Pattern to follow:** The existing auto-clean structure — same loop shape, same message format, same error handling. The refinement is in the condition, not the structure.
**Why:** Without this, either all untracked files get content-matched (current behavior — build/verify artifacts fail the match when the agent rewrote them) or all get removed unconditionally (unsafe for planning artifacts).

### `packages/cli/templates/.claude/agents/ana-build.md` (modify)
**What changes:** Layer 4 — add a pwd hint before the report format section (near line 275). One instruction line telling the agent to use `pwd` for the absolute path when writing artifacts.
**Pattern to follow:** Existing instruction style in the template — imperative, direct, no rationale.
**Why:** Soft prevention. Reduces the frequency of wrong-tree writes, which reduces how often Layers 1-3 fire.

### `packages/cli/templates/.claude/agents/ana-verify.md` (modify)
**What changes:** Layer 4 — add a pwd hint before the report template section (near line 285). Same wording as Build template.
**Pattern to follow:** Same as Build template change.
**Why:** Verify writes `verify_report.md` and `verify_data.yaml` — same wrong-tree risk as Build.

### `packages/cli/tests/commands/artifact.test.ts` (modify)
**What changes:** Add tests for Layer 1 (auto-move from main tree to worktree, companion moves together, EXDEV fallback, tracked files are not moved) and Layer 2 (post-save sweep removes stale main-tree copies).
**Pattern to follow:** Existing test structure — `createTestProject()` helper, temp dirs with real git repos, `beforeEach`/`afterEach` cleanup.
**Why:** Layers 1 and 2 are the critical path. They must have test coverage.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** Add tests for Layer 3 (build/verify artifacts removed unconditionally, planning artifacts keep content-match, mixed scenarios).
**Pattern to follow:** Existing work.test.ts patterns.
**Why:** Layer 3 changes existing auto-clean behavior. Tests must prove the split works correctly.

## Acceptance Criteria

- [x] AC1: `artifact save build-report {slug}` succeeds when the report file exists only on the main tree (auto-moved to worktree, save completes, no stale copy on main)
- [x] AC2: When the report's data companion (`build_data.yaml` / `verify_data.yaml`) is also on the main tree, both files are moved together before the save continues
- [x] AC3: After a successful worktree save, any untracked copies of the saved files on the main tree are deleted
- [x] AC4: `work complete` removes untracked `build_report*.md`, `build_data*.yaml`, `verify_report*.md`, `verify_data*.yaml` from the slug's plan directory without requiring content-match
- [x] AC5: `work complete` still requires content-match for planning artifacts (`scope.md`, `spec.md`, `plan.md`, `contract.yaml`) — no behavior change for those
- [x] AC6: Build and Verify agent templates use `pwd`-based path guidance for artifact writes
- [x] AC7: All auto-move and cleanup operations only act on untracked files (tracked files are never touched)
- [x] AC8: All cleanup operations are best-effort — failure to clean never fails the save or completion
- [x] Tests pass with `cd packages/cli && pnpm vitest run`
- [x] No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests (artifact.ts):**
  - Layer 1: Create a test project simulating a worktree (main tree has the report, worktree does not). Call `saveArtifact`. Assert the file was moved to the worktree and the save completed. Test companion co-movement. Test that tracked files on main are NOT moved (save errors normally). Test EXDEV fallback by mocking `renameSync` to throw EXDEV.
  - Layer 2: Create a test project where both main and worktree have the report. Call `saveArtifact`. Assert the main-tree copy is deleted after save. Assert the worktree copy is committed.
- **Unit tests (work.test.ts):**
  - Layer 3: Simulate `work complete` with untracked build/verify artifacts — assert unconditional removal. Simulate with untracked planning artifacts — assert content-match is required. Simulate mixed — assert split behavior.
- **Edge cases:**
  - File disappears between existence check and unlink (TOCTOU) — the try-catch handles it gracefully.
  - No main tree (not a worktree) — Layers 1 and 2 are no-ops.
  - Companion file exists on worktree but not main — only report needs moving.

## Dependencies

- `getMainTreeRoot()` from `src/utils/worktree.ts` — already imported in artifact.ts.
- `deriveCompanionFileName()` — already exists in artifact.ts.
- `runGit` — already imported in both artifact.ts and work.ts.

## Constraints

- All cleanup is best-effort. `try-catch` wraps every `unlinkSync` and `renameSync` in cleanup paths. A cleanup failure logs a warning and continues — it never throws, never exits.
- Only untracked files are touched. Every file gets an `ls-files --error-unmatch` check before move or delete. Tracked files are never modified by cleanup logic.
- No new dependencies. All work uses `node:fs`, `node:path`, and existing git helpers.

## Gotchas

- **Companion must move BEFORE line 1029.** The companion discovery block at line 1024 checks `fs.existsSync(companionPath)` where `companionPath` is computed from the worktree's slug directory. If Layer 1 moves only the report, the companion check fails. Layer 1 must move both report and companion in the same block.
- **EXDEV on cross-filesystem worktrees.** `fs.renameSync` throws `EXDEV` if source and destination are on different filesystems. Fallback: `fs.copyFileSync` + `fs.unlinkSync`. This is the same pattern Node.js docs recommend.
- **Layer 3 filename patterns must NOT match planning artifacts.** The patterns `build_report`, `build_data`, `verify_report`, `verify_data` are safe because no planning artifact starts with `build_` or `verify_`. But be precise — use `startsWith` on the basename, not a substring match on the full path.
- **`planPrefix` scoping is still needed.** Layer 3 partitions within `slugFiles` (already scoped to the slug's plan directory). Don't remove the `planPrefix` filter — it ensures files outside this slug are never touched.
- **The Layer 2 sweep needs the main tree root.** Use `getMainTreeRoot(projectRoot)`. If it returns `projectRoot` (not a worktree), skip the sweep entirely — there's no main tree to clean.

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions (`import { foo } from './bar.js'`).
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- Error handling in commands: `chalk.red` message + `process.exit(1)` for real errors. Best-effort cleanup uses try-catch with `chalk.yellow` warnings.
- Explicit return types on all exported functions. Internal helpers can use inference.
- Exported functions require `@param` and `@returns` JSDoc tags.

### Pattern Extracts

**Structural analog — rename pattern (artifact.ts lines 916-926):**
```typescript
  const isNumbered = typeInfo.fileName.match(/_\d+\.md$/);
  if (!fs.existsSync(filePath) && isNumbered) {
    const defaultName = typeInfo.baseType === 'build-report' ? 'build_report.md'
      : typeInfo.baseType === 'verify-report' ? 'verify_report.md' : null;
    if (defaultName) {
      const defaultPath = path.join(projectRoot, '.ana', 'plans', 'active', slug, defaultName);
      if (fs.existsSync(defaultPath)) {
        fs.renameSync(defaultPath, filePath);
        console.log(chalk.gray(`Renamed ${defaultName} → ${typeInfo.fileName}`));
      }
    }
  }
```

**Untracked check pattern (artifact.ts line 1083-1086):**
```typescript
  const isTracked = spawnSync('git', ['ls-files', '--error-unmatch', relFilePath], {
    cwd: projectRoot,
    stdio: 'pipe'
  }).status === 0;
```

**Existing auto-clean block (work.ts lines 1053-1082):**
```typescript
        if (slugFiles.length > 0) {
          // Verify each file matches what the merge would bring (compare against remote)
          let allMatch = true;
          for (const relPath of slugFiles) {
            const localPath = path.join(projectRoot, relPath);
            const localContent = fs.readFileSync(localPath, 'utf-8');
            const remoteResult = runGit(['show', `origin/${artifactBranch}:${relPath}`], { cwd: projectRoot });
            if (remoteResult.exitCode !== 0 || remoteResult.stdout !== localContent) {
              allMatch = false;
              break;
            }
          }

          if (allMatch) {
            // Safe to remove — files are identical to what the merge brings
            for (const relPath of slugFiles) {
              fs.unlinkSync(path.join(projectRoot, relPath));
            }
            console.log(chalk.yellow(`⚠ Removed ${slugFiles.length} untracked artifact${slugFiles.length !== 1 ? 's' : ''} from main (written by agent to wrong tree).`));

            // Retry pull
            pullResult = runGit(['pull', '--rebase'], { cwd: projectRoot });
          } else {
            console.error(chalk.red('Error: Pull blocked by untracked files that differ from the merged version:'));
            for (const f of slugFiles) {
              console.error(chalk.gray(`  ${f}`));
            }
            console.error(chalk.gray('These files were written to main but differ from the PR. Inspect and remove manually.'));
            process.exit(1);
          }
        }
```

### Proof Context

**artifact.ts (2 pipeline cycles):**
- [code] Double YAML parse in companion success message — not relevant to this build, but awareness that the companion handling code around line 1068-1072 is already flagged for redundant parsing.
- [code] archivePreviousVersion uses string equality — CRLF concern. Not directly relevant but the archive block runs before Layer 1's insertion point.

**work.ts (9 pipeline cycles):**
- [code] Untested defensive branches in startWork — not relevant to this build (different function).
- Build concern: archivePreviousVersion relies on correct projectRoot — relevant awareness for Layer 1 which also depends on correct projectRoot vs mainRoot distinction.

### Checkpoint Commands

- After Layer 1 + Layer 2 changes to artifact.ts: `cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts --run` — Expected: all existing + new tests pass
- After Layer 3 changes to work.ts: `cd packages/cli && pnpm vitest run tests/commands/work.test.ts --run` — Expected: all existing + new tests pass
- After all changes: `cd packages/cli && pnpm vitest run` — Expected: 1994+ tests pass, 0 failures
- Lint: `pnpm run lint`
- Build: `pnpm run build`

### Build Baseline

- Current tests: 1994 passed, 2 skipped (1996 total)
- Current test files: 95 passed (95 total)
- Command used: `cd packages/cli && pnpm vitest run`
- After build: expected ~2010+ tests in 95 files (new tests added to existing test files)
- Regression focus: `tests/commands/artifact.test.ts`, `tests/commands/work.test.ts`
