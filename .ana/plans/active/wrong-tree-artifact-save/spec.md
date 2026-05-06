# Spec: Wrong-Tree Artifact Save

**Created by:** AnaPlan
**Date:** 2026-05-06
**Scope:** .ana/plans/active/wrong-tree-artifact-save/scope.md

## Approach

When Build or Verify agents write their reports to the wrong git tree, `saveArtifact` should detect the mistake and relocate the file instead of blocking the pipeline.

Two scenarios exist:

**Scenario A — Agent on main, worktree exists.** The branch validation currently hard-exits when a build-verify artifact is saved from the artifact branch. Instead: check if a worktree exists for the slug. If the file exists on main, relocate it to the worktree, reassign `projectRoot` to the worktree path, update `currentBranch` to the feature branch, and continue the save. The commit lands on the feature branch (worktree's git context).

**Scenario B — Agent in worktree, file not found.** The file-exists check currently hard-exits. Instead: check the main tree for the file. If found, relocate it to the worktree and continue.

Both scenarios apply only to `build-verify` category artifacts. Planning artifacts are never relocated.

The relocation primitive (`relocateArtifactToWorktree`) lives in `worktree.ts` alongside the existing worktree utilities. A new `getMainTreeRoot()` utility parses the worktree's `.git` file to find the main tree — same pattern as `isWorktreeDirectory()`. The relocation uses `copyFileSync` + `unlinkSync` (not `renameSync`) for cross-mount safety.

When a file exists in both trees, the worktree copy is preferred. The main copy is warned about but not deleted.

## Output Mockups

**Scenario A — agent on main, file relocated to worktree:**
```
⚠ Relocated build_report.md from main tree to worktree.
  Write here next time: .ana/worktrees/wrong-tree-artifact-save/.ana/plans/active/wrong-tree-artifact-save/
✓ Saved Build report for `wrong-tree-artifact-save` on `feature/wrong-tree-artifact-save`.
```

**Scenario B — agent in worktree, file found on main:**
```
⚠ Relocated build_report.md from main tree to worktree.
  Write here next time: /absolute/path/to/worktree/.ana/plans/active/wrong-tree-artifact-save/
✓ Saved Build report for `wrong-tree-artifact-save` on `feature/wrong-tree-artifact-save`.
```

**Companion YAML relocated alongside:**
```
⚠ Relocated build_report.md from main tree to worktree.
⚠ Relocated build_data.yaml from main tree to worktree.
  Write here next time: .ana/worktrees/wrong-tree-artifact-save/.ana/plans/active/wrong-tree-artifact-save/
```

**File in both trees:**
```
⚠ build_report.md found in both main tree and worktree. Using worktree copy.
  Orphan on main: .ana/plans/active/wrong-tree-artifact-save/build_report.md
```

## File Changes

### `packages/cli/src/utils/worktree.ts` (modify)
**What changes:** Add `getMainTreeRoot()` — parses the `.git` file in a worktree directory to resolve the main tree root. Add `relocateArtifactToWorktree()` — copies a file (and optional companion) from one tree to another using `copyFileSync` + `unlinkSync`.
**Pattern to follow:** `isWorktreeDirectory()` at lines 54-68 for `.git` file parsing. Same try/catch, same `fs.readFileSync` + string parsing.
**Why:** `artifact.ts` needs to find files across trees and move them. The worktree module owns all cross-tree awareness.

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Modify `validateBranch()` to return a signal instead of hard-exiting when relocation is possible. Modify `saveArtifact()` to attempt relocation in two places: after branch validation (Scenario A) and at the file-exists check (Scenario B). Change `projectRoot` from `const` to `let`. Update `currentBranch` after Scenario A relocation. The success message at line 1208 already uses `currentBranch` — after reassignment it shows the correct feature branch.
**Pattern to follow:** The existing auto-rename fallback at lines 896-909 — same concept of "fix the file location, warn, continue."
**Why:** Without this, the pipeline blocks whenever an agent writes to the wrong tree. The error messages give wrong advice (`git checkout` fails when the branch is in a worktree).

### `packages/cli/tests/commands/artifact.test.ts` (modify)
**What changes:** Add test cases for both relocation scenarios, companion relocation, planning artifact non-relocation, file-in-both-trees preference, and the no-worktree baseline.
**Pattern to follow:** Existing `createTestProject()` helper and `createArtifact()` helper. Tests create real git repos in temp dirs with `execSync`.
**Why:** This is the core behavioral change — every scenario needs a test.

## Acceptance Criteria
- [ ] AC1: When Build writes `build_report.md` to main tree and a worktree exists, `artifact save build-report` relocates the file to the worktree, warns, and completes the save successfully
- [ ] AC2: When Build writes `build_report.md` to the worktree, `artifact save` works normally (no change to existing behavior)
- [ ] AC3: When no worktree exists, `artifact save` works normally (no change to existing behavior)
- [ ] AC4: Companion YAML files (`build_data.yaml`, `verify_data.yaml`) are relocated alongside their reports
- [ ] AC5: Planning artifacts (scope, spec, contract) are NEVER relocated — they stay on main
- [ ] AC6: The commit after relocation targets the feature branch (worktree's git context), not main
- [ ] AC7: Error messages include the worktree path when a worktree exists, so the agent knows where to write next time
- [ ] AC8: When file exists in BOTH trees, worktree copy is preferred and main copy is warned about but not deleted
- [ ] AC9: Tests pass with `pnpm vitest run`
- [ ] AC10: No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests:** Test `getMainTreeRoot()` with a real worktree (create one in temp dir, call the function, verify it returns the main tree path). Test `relocateArtifactToWorktree()` — file moves, companion moves, source is deleted.
- **Integration tests:** Full `saveArtifact()` flow for both scenarios. Create a test project, create a worktree with `git worktree add`, write the artifact to the wrong tree, call `saveArtifact`, verify the commit lands on the feature branch and the file is in the worktree's plan directory.
- **Edge cases:**
  - File in both trees — verify worktree copy is used, main copy survives
  - Planning artifact on main with worktree existing — verify no relocation attempted
  - No worktree exists, agent on main — verify original error behavior unchanged
  - Companion YAML exists alongside report — verify both are relocated
  - Companion YAML missing — verify report still relocates (companion check happens later)

## Dependencies

- `worktreeExists()` and `getWorktreePath()` already exist in `worktree.ts`
- `deriveCompanionFileName()` already exists in `artifact.ts`
- `getCurrentBranch()` already exists in `git-operations.ts`

## Constraints

- `copyFileSync` + `unlinkSync` instead of `renameSync` — defensive against cross-mount edge cases. `.ana/worktrees/` is a subdirectory of the project root (same filesystem in practice), but the copy+delete pattern is standard for robustness.
- Planning artifacts must never be relocated. The category check is the guard — it runs before any relocation logic.
- The relocation warning must include the worktree path so agents can self-correct on subsequent runs.

## Gotchas

- **`projectRoot` is `const` at line 876.** Must change to `let` so Scenario A can reassign it. All downstream code — `captureModulesTouched`, `runPreCheckAndStore`, companion check, git staging, commit — already uses `projectRoot` by name, so reassignment propagates automatically.
- **`filePath` is already `let` at line 894.** It's derived from `projectRoot` and must be reassigned after relocation too.
- **`currentBranch` is `const` at line 883.** Must also change to `let` for Scenario A — after relocating to the worktree, the current branch for the success message should be the feature branch, not main.
- **Companion relocation must happen before line 989** (companion YAML discovery). If the companion is on the wrong tree, it needs to be relocated before `artifact.ts` checks for its existence. The relocation function should move both report and companion in one call.
- **The `git checkout` suggestion in current error messages is wrong** — git prevents two worktrees from checking out the same branch. After this change the hard-exit becomes a relocation, so the bad advice disappears.
- **`validateBranch` currently calls `process.exit(1)`.** For Scenario A, it needs to signal "relocatable" instead of exiting. Restructure to return a status or move the worktree check into `saveArtifact` before calling `validateBranch`.
- **Proof finding note:** `archivePreviousVersion` relies on correct `projectRoot` for `git show` path. After reassignment in Scenario A, `projectRoot` points to the worktree, which has its own git context — `git show HEAD:{path}` will reference the feature branch HEAD, which is correct for build-verify artifacts.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { getMainTreeRoot } from '../utils/worktree.js'`
- Use `node:` prefix for built-ins: `import * as fs from 'node:fs'`
- Explicit return types on all exported functions
- Exported functions require `@param` and `@returns` JSDoc tags
- Prefer early returns over nested conditionals
- Error handling: commands surface errors with `chalk.red` + `process.exit(1)`. Utility functions catch internally and return defaults.
- Tests use `fs.mkdtemp` for temp dirs, `execSync` for git operations, real git repos (not mocks)
- Tests must force branch name: `git branch -M main` after first commit
- Always pass `--run` to vitest to avoid watch mode hang

### Pattern Extracts

**`.git` file parsing pattern** (worktree.ts lines 54-68):
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

**Auto-rename fallback pattern** (artifact.ts lines 896-909):
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
```

### Proof Context

**artifact.ts** (2 prior cycles):
- `archivePreviousVersion` relies on correct `projectRoot` for `git show` path — relevant because Scenario A reassigns `projectRoot`. After reassignment it points to the worktree, so `git show HEAD:{path}` references the feature branch HEAD. This is correct for build-verify artifacts.

**worktree.ts** (2 prior cycles):
- `isWorktreeDirectory` false-positive risk in git submodules — `getMainTreeRoot()` should use the same `/worktrees/` check to avoid submodule confusion.

### Checkpoint Commands

- After `worktree.ts` changes: `cd packages/cli && pnpm vitest run tests/utils/worktree.test.ts -- --run` — Expected: existing tests pass, new utility tests pass
- After `artifact.ts` changes: `cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts -- --run` — Expected: existing tests pass, new relocation tests pass
- After all changes: `cd packages/cli && pnpm vitest run` — Expected: 1950+ tests pass
- Lint: `pnpm run lint`
- Build: `pnpm run build`

### Build Baseline
- Current tests: 1950 passed, 2 skipped (95 test files)
- Command used: `cd packages/cli && pnpm vitest run`
- After build: expected ~1960-1965 tests in 95 test files
- Regression focus: `tests/commands/artifact.test.ts` (existing branch validation tests must still pass)
