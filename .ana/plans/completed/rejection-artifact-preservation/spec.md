# Spec: Rejection Cycle Artifact Preservation

**Created by:** AnaPlan
**Date:** 2026-05-06
**Scope:** .ana/plans/active/rejection-artifact-preservation/scope.md

## Approach

Add a helper function `archivePreviousVersion()` to `artifact.ts` that extracts the committed version of a file from git history before the new version is staged. If the committed content differs from the current disk content, the committed version is written to a `_r{N}` archive file alongside the original.

The helper follows the `captureModulesTouched` pattern: standalone function, called from both `saveArtifact` and `saveAllArtifacts`, non-blocking on failure (warn and continue).

Content comparison prevents false archives. If `git show HEAD:{path}` returns content identical to what's on disk, no archive is created — the file wasn't actually changed between rounds.

Round numbering is determined by scanning the plan directory for existing `_r{N}` files matching the base name. If `verify_report_r1.md` exists, the next archive is `verify_report_r2.md`.

Archive files are staged in the same commit as the new artifacts — atomic, no separate commit.

Only report and data files are archivable: `verify_report`, `build_report`, `verify_data`, `build_data` (plus their phase-numbered variants like `verify_report_1`). Planning artifacts (scope, plan, spec, contract) are not overwritten by agents and don't need archiving.

## Output Mockups

When an archive is created during `ana artifact save verify-report slug`:
```
Archived verify_report.md → verify_report_r1.md (previous round)
✓ verify_report.md validated (3 findings)
✓ verify_data.yaml validated (3 findings)
✓ Saved verify-report for `slug`
```

When a companion YAML is also archived:
```
Archived verify_report.md → verify_report_r1.md (previous round)
Archived verify_data.yaml → verify_data_r1.yaml (previous round)
✓ verify_report.md validated (3 findings)
✓ verify_data.yaml validated (3 findings)
✓ Saved verify-report for `slug`
```

When no committed version exists (first save — most common case):
```
✓ verify_report.md validated (3 findings)
✓ verify_data.yaml validated (3 findings)
✓ Saved verify-report for `slug`
```

No output — archiving is silent when there's nothing to archive.

When archive fails (non-blocking):
```
Warning: Could not archive previous verify_report.md: {error message}
✓ verify_report.md validated (3 findings)
```

During `ana artifact save-all slug` with multiple archives:
```
Archived build_report.md → build_report_r1.md (previous round)
Archived build_data.yaml → build_data_r1.yaml (previous round)
Archived verify_report.md → verify_report_r2.md (previous round)
Archived verify_data.yaml → verify_data_r2.yaml (previous round)
✓ Saved 4 artifacts for `slug`
```

## File Changes

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Add `archivePreviousVersion()` helper function. Call it from `saveArtifact` (for the main file and its companion) and from `saveAllArtifacts` (for all artifacts and companions) before staging.
**Pattern to follow:** `captureModulesTouched` — standalone helper, called from both save paths, catches errors internally and warns instead of throwing.
**Why:** Without this, rejection-round artifacts are permanently lost when the agent overwrites or deletes them.

**`archivePreviousVersion()` signature and behavior:**
- Parameters: `projectRoot`, `relFilePath` (relative to project root), `planDir` (absolute path to slug directory)
- Returns: `string | null` — the relative path of the archive file (for staging), or null if no archive was created
- Steps:
  1. Run `git show HEAD:{relFilePath}`. If exit code is non-zero, return null (no committed version).
  2. Read the current disk file. If content is identical to committed version, return null (no change).
  3. Scan `planDir` for existing `_r{N}` files matching the base name to determine next round number.
  4. Write committed content to the archive filename in `planDir`.
  5. Log the archive message with `chalk.gray`.
  6. Return the relative path of the archive file.

**Archivable file detection:** The helper is called for specific file types — it doesn't need to decide whether a file is archivable. The callers decide. In `saveArtifact`, the file is archivable if `typeInfo.baseType` is `verify-report` or `build-report` (plus their companions). In `saveAllArtifacts`, the same check applies per artifact and per companion.

**Archive filename construction:** Strip the extension, append `_r{N}`, re-add the extension. Examples:
- `verify_report.md` → `verify_report_r1.md`
- `verify_report_1.md` → `verify_report_1_r1.md`
- `verify_data.yaml` → `verify_data_r1.yaml`
- `build_report.md` → `build_report_r2.md` (if `_r1` exists)

**Insertion points in `saveArtifact`:**
1. Main file: After the auto-rename fallback (line 838) and before the file-exists check (line 841). The archive targets the final filename after any rename.
2. Companion: After companion path is computed (around line 916) and after companion existence is confirmed, but before staging (line 992). Collect the archive relPath for staging alongside the companion.
3. Staging: Add the archive relPaths to the git add calls alongside the main file and companion.

**Insertion points in `saveAllArtifacts`:**
1. After companion discovery (section 3a, line 1280) and before the staging loop (line 1326). Loop through artifacts and companions, calling `archivePreviousVersion` for each archivable item. Collect archive relPaths.
2. Staging: Add archive relPaths to the staging loop.

### `packages/cli/tests/commands/artifact.test.ts` (modify)
**What changes:** Add tests for the archive behavior in both `saveArtifact` and `saveAllArtifacts`.
**Pattern to follow:** Existing tests in the file — `createTestProject` helper, temp directories with real git repos, `execSync` for git operations.
**Why:** AC1-AC5 require mechanical verification.

## Acceptance Criteria

- [ ] AC1: When `ana artifact save verify-report {slug}` runs and `verify_report.md` has a different committed version in HEAD, the committed version is extracted and written to `verify_report_r1.md` before staging
- [ ] AC2: Same for `verify_data.yaml` → `verify_data_r1.yaml`
- [ ] AC3: Same for `build_report.md` → `build_report_r1.md`
- [ ] AC4: Round number increments: if `_r1` already exists, next archive is `_r2`
- [ ] AC5: Files with no committed version in HEAD (`git show` fails) are skipped — no false archives
- [ ] AC6: All existing tests pass
- [ ] AC7: Build succeeds, typecheck clean, lint clean
- [ ] AC8: Archive files are staged in the same commit as the new artifacts
- [ ] AC9: Identical content (no actual change between rounds) does not create an archive

## Testing Strategy

- **Unit tests for `archivePreviousVersion`:** Test the helper directly if it's exported, or test through the save functions.
- **Integration tests via `saveArtifact`:**
  - Save a verify-report, commit it, modify the file, save again → `verify_report_r1.md` exists with original content
  - Same flow for build-report and companion YAMLs
  - Save twice with modifications → `_r1` then `_r2` exist
  - Save when no committed version exists → no archive file created
  - Save with identical content → no archive file created
- **Integration tests via `saveAllArtifacts`:**
  - Save-all with a previously committed verify-report → archive created for report and companion
- **Edge cases:**
  - Multi-phase: `verify_report_1.md` → `verify_report_1_r1.md`
  - Archive when file was deleted from disk but exists in git history
  - Archive failure is non-blocking (save still succeeds)

## Dependencies

- `runGit` from `src/utils/git-operations.ts` (already imported in artifact.ts)
- `chalk` (already imported)
- `fs` (already imported — note: artifact.ts uses synchronous `node:fs`, not `node:fs/promises`)

## Constraints

- Archive files must be invisible to existing consumers: scan regexes, `deriveCompanionFileName`, `generateProofSummary`, orphan cleanup. All use `_\d+` patterns that don't match `_r\d+`. Verified in scope.
- The `archivePreviousVersion` helper must not throw. All errors caught internally, logged as warnings, save continues.
- `git show HEAD:{path}` requires the path relative to the repo root, not absolute.

## Gotchas

- **`saveArtifact` uses synchronous fs.** The entire function is synchronous (`fs.existsSync`, `fs.readFileSync`, `fs.writeFileSync`). The archive helper must also be synchronous.
- **Auto-rename sequencing matters.** In `saveArtifact`, the auto-rename fallback (lines 824-838) renames `build_report.md` → `build_report_1.md`. The archive check must run AFTER this rename — it targets the final filename. If you archive before rename, you'd archive against the wrong filename.
- **Companion archiving in `saveArtifact` has a gate.** The companion path is only valid if it was discovered AND the companion file exists on disk (checked at line 918). Archive the companion only after this existence check passes.
- **`saveAllArtifacts` companion loop is separate.** Companions are in a separate `companions` array (line 1249), not in `artifacts`. The archive loop must cover both arrays.
- **`fs.readFileSync` on a deleted file.** If the agent deleted the file before save, the disk read will fail. Check `fs.existsSync` before comparing content. If the file doesn't exist on disk but does in git, that's a valid archive case — the committed version IS different from "nothing."
- **The `relFilePath` must be relative to projectRoot.** In `saveArtifact` this is already computed as `relFilePath` (line 821). In `saveAllArtifacts`, use `path.relative(projectRoot, artifact.path)` for artifacts and `companion.relPath` for companions.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Explicit return types on all exported functions. Internal helpers can use inference.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Error handling in commands: `chalk.red` / `chalk.yellow` for user-facing messages. Archive helper uses `chalk.yellow` for warnings since failures are non-blocking.
- Prefer early returns over nested conditionals.
- Always use `--run` with `pnpm vitest` to avoid watch mode hang.

### Pattern Extracts

**`captureModulesTouched` — the structural analog (artifact.ts:134-167):**
```typescript
function captureModulesTouched(projectRoot: string, slugDir: string): void {
  try {
    const artBranch = readArtifactBranch(projectRoot);

    // @ana A007
    / Inner try: merge-base failure is expected on first commit or no remote
    let mergeBase: string;
    try {
      const mbResult = runGit(['merge-base', artBranch, 'HEAD'], { cwd: projectRoot });
      if (mbResult.exitCode !== 0) return; // Expected on new repos — silently skip
      mergeBase = mbResult.stdout;
    } catch {
      return; // Expected on new repos — silently skip
    }

    const diffResult = runGit(['diff', mergeBase, '--name-only', '--', '.', ':(exclude).ana'], { cwd: projectRoot });
```

**Auto-rename fallback — insertion point context (artifact.ts:824-841):**
```typescript
  // 6a. Auto-rename fallback for multi-spec: if build_report_1.md doesn't exist
  // but build_report.md does, rename it. Same for verify_report. Build agents
  // commonly write the default filename instead of the phase-numbered one.
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

  // 6b. Verify file exists
  if (!fs.existsSync(filePath)) {
```

**Test helper pattern (artifact.test.ts:33-65):**
```typescript
  async function createTestProject(options: {
    artifactBranch?: string;
    currentBranch?: string;
    branchPrefix?: string;
  }): Promise<void> {
    const artifactBranch = options.artifactBranch || 'main';
    const branchPrefix = options.branchPrefix;

    // Init git
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });

    // Create .ana/ana.json
    const anaDir = path.join(tempDir, '.ana');
    await fs.mkdir(anaDir, { recursive: true });
    await fs.writeFile(
      path.join(anaDir, 'ana.json'),
      JSON.stringify({ artifactBranch, ...(branchPrefix !== undefined && { branchPrefix }) }),
      'utf-8'
    );

    // Initial commit (git needs at least one commit)
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'ignore' });

    // Rename branch to match artifactBranch
    execSync(`git branch -M ${artifactBranch}`, { cwd: tempDir, stdio: 'ignore' });
```

### Proof Context
- [observation] Double YAML parse in companion success message — `saveArtifact` re-parses at lines 932-933 after validation already parsed. Not related to this build but worth knowing: don't add another parse of companion files.

No other active findings for artifact.ts.

### Checkpoint Commands

- After adding `archivePreviousVersion` helper: `(cd packages/cli && pnpm vitest run --reporter=verbose tests/commands/artifact.test.ts)` — Expected: all existing artifact tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 1913+ tests pass
- Lint: `pnpm run lint`
- Typecheck: `pnpm run build`

### Build Baseline
- Current tests: 1913 passed, 2 skipped (1915 total)
- Current test files: 95 passed
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~1925+ tests (1913 + ~12 new archive tests)
- Regression focus: `tests/commands/artifact.test.ts` — existing save and save-all tests
