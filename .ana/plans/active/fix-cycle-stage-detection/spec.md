# Spec: Fix cycle stage detection breaks on multi-phase builds

**Created by:** AnaPlan
**Date:** 2026-05-12
**Scope:** .ana/plans/active/fix-cycle-stage-detection/scope.md

## Approach

Three subsystems independently assume the happy path — `.saves.json` key naming, stage detection, and template instructions. Fix all three so fix cycles (FAIL → fix → re-verify) work mechanically for both single-spec and multi-phase paths.

**Layer 1 — Code (mechanical guarantees):**
- Add `artifactType` field to `ArtifactTypeInfo` that preserves the full type string (e.g., `build-report-1`). Use it as the `.saves.json` key instead of `baseType`.
- Replace git timestamp comparison in stage detection with `.saves.json` `saved_at` timestamp comparison. Read `.saves.json` from the worktree branch using the existing `readFileOnBranch` utility.
- Extend auto-rename to handle fix cycles: when both numbered and unnumbered report files exist, rename unnumbered → numbered (overwriting). Also rename companion files in the same pass.
- Make `deriveCompanionKey` phase-aware by accepting the full artifact type string.
- Make `completeWork` read phase-aware `.saves.json` keys with fallback to unnumbered keys.

**Layer 2 — Templates (reduce need for mechanical intervention):**
- Make `ana-build.md` resume protocol use phase-numbered filenames from the first instruction.
- Add `ready-for-re-verify` and `phase-N-ready-for-re-verify` to `ana-verify.md` Find Work stages.

**`saveAllArtifacts` does not need fix-cycle rename logic.** It discovers artifacts by scanning the directory — if both files exist, both are found and saved independently. The rename only matters in `saveArtifact` where the user specifies the expected artifact type.

## Output Mockups

Stage detection after fix build saves updated report:
```
  fix-slug (1 phase):
    scope.md         ✓ main
    plan.md          ✓ main
    spec.md          ✓ main
    Phase 1: ✓ built ✗ not verified
    Stage: ready-for-re-verify
    → claude --agent ana-verify
```

Multi-phase after fix build on phase 2:
```
  multi-slug (2 phases):
    scope.md         ✓ main
    plan.md          ✓ main
    spec-1.md        ✓ main
    spec-2.md        ✓ main
    Phase 1: ✓ built ✓ verified
    Phase 2: ✓ built ✗ not verified
    Stage: phase-2-ready-for-re-verify
    → claude --agent ana-verify
```

Auto-rename during fix cycle:
```
Renamed build_report.md → build_report_2.md
Renamed build_data.yaml → build_data_2.yaml
```

## File Changes

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:**
1. Add `artifactType` field to `ArtifactTypeInfo` interface — stores the full type string (e.g., `build-report-1`) while `baseType` continues to store `build-report`.
2. Populate `artifactType` in `parseArtifactType` — set it to the original `type` parameter.
3. Change `writeSaveMetadata` call sites to pass `artifactType` instead of `baseType`. There are two sites: `saveArtifact` (around line 1251) and `saveAllArtifacts` (around line 1655).
4. Change `deriveCompanionKey` to accept the full artifact type string and return phase-aware keys. `build-report-1` → `build-data-1`, `verify-report` → `verify-data`. The function currently takes `baseType` and always returns unnumbered keys.
5. Update both call sites of `deriveCompanionKey`: `saveArtifact` (around line 1127) and `saveAllArtifacts` (around line 1517) to pass `artifactType` instead of `baseType`.
6. Extend auto-rename block (lines 997-1011) to also handle the case where BOTH numbered and unnumbered files exist — rename unnumbered → numbered with overwrite. Add companion file rename in the same block: derive the companion filenames for both paths, and if the unnumbered companion exists, rename it too.
**Pattern to follow:** Existing auto-rename at lines 997-1011 — `fs.renameSync` with `chalk.gray` log message.
**Why:** Without phase-aware keys, `.saves.json` timestamps for phase 2 overwrite phase 1. Without extended auto-rename, fix cycle builds that write unnumbered files (the common case) leave the numbered file stale.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:**
1. Replace git timestamp comparison in single-spec stage detection (lines 395-421) with `.saves.json` timestamp comparison. Read `.saves.json` from the worktree branch using `readFileOnBranch`, parse it, compare `saved_at` for `build-report` vs `verify-report`.
2. Replace git timestamp comparison in multi-phase stage detection (lines 458-483) with the same `.saves.json` approach. Compare `saved_at` for `build-report-N` vs `verify-report-N`, with fallback to unnumbered keys for backward compatibility.
3. Update `completeWork` completeness check (lines 1483-1486) to be phase-aware. For multi-phase work, iterate phases and check `build-report-N` / `verify-report-N` keys. Fall back to unnumbered keys for work items created before this fix. Single-spec path keeps checking `build-report` / `verify-report`.
**Pattern to follow:** Existing `readFileOnBranch` usage at line 334 for reading verify report content. The `.saves.json` read follows the same pattern — `readFileOnBranch(workBranch, savesJsonPath)`, then `JSON.parse`.
**Why:** Git timestamps break when the idempotent check (content hash unchanged) skips the commit, leaving the git log timestamp stale. `.saves.json` is the explicit record of when each artifact was saved.

### `packages/cli/templates/.claude/agents/ana-build.md` (modify)
**What changes:** Update "Resume After Failed Verify" section (line 432+) to use phase-numbered filenames from the first instruction. Currently says `build_report.md` and `verify_report.md` — should say `build_report.md` (or `build_report_{N}.md` for multi-phase) from the opening line, not as a late afterthought at line 450.
**Pattern to follow:** The multi-phase handling section (line 417) already uses `build_report_{N}.md` notation.
**Why:** Template using unnumbered filenames is the root cause of agents writing unnumbered files during fix cycles. Making the instruction phase-aware from the start eliminates the common case.

### `packages/cli/templates/.claude/agents/ana-verify.md` (modify)
**What changes:** Add `ready-for-re-verify` and `phase-N-ready-for-re-verify` to the Find Work stages list (line 39-41). Currently only lists `ready-for-verify` and `phase-N-ready-for-verify`.
**Pattern to follow:** Existing bullet format at lines 40-41.
**Why:** Without these stages listed, AnaVerify reports "nothing to verify" when a fix cycle completes.

### `.claude/agents/ana-build.md` (modify)
**What changes:** Copy the updated template from `packages/cli/templates/.claude/agents/ana-build.md` byte-for-byte. This is the dogfood copy that Anatomia uses for its own pipeline. The sync test at `packages/cli/tests/templates/agent-proof-context.test.ts` line 67 enforces byte-identity between dogfood copies and templates.
**Pattern to follow:** Exact copy — no differences allowed.
**Why:** Without this, the dogfood copy has stale resume instructions and the sync test fails.

### `.claude/agents/ana-verify.md` (modify)
**What changes:** Copy the updated template from `packages/cli/templates/.claude/agents/ana-verify.md` byte-for-byte. Same dogfood sync requirement as ana-build.md.
**Pattern to follow:** Exact copy — no differences allowed.
**Why:** Without this, the dogfood copy is missing re-verify stages and the sync test fails.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** Add tests for fix-cycle stage transitions. See Testing Strategy.
**Pattern to follow:** Existing test at line 212 (`with verify_report FAIL → needs-fixes`) — same `createWorkTestProject` helper, same `captureOutput` + `expect` pattern.
**Why:** No tests exist for `ready-for-re-verify` or `phase-N-ready-for-re-verify` transitions.

### `packages/cli/tests/commands/artifact.test.ts` (modify)
**What changes:** Add tests for fix-cycle auto-rename scenarios. See Testing Strategy.
**Pattern to follow:** Existing test helper `createTestProject` and the real git repo pattern used throughout the file.
**Why:** No tests exist for the "both numbered and unnumbered exist" auto-rename case or companion rename.

## Acceptance Criteria

- [ ] AC1: Multi-phase fix cycle works end-to-end — FAIL verify on phase N, fix build, `ana artifact save build-report-N`, stage transitions to `phase-N-ready-for-re-verify`, AnaVerify picks up the work.
- [ ] AC2: `artifact save` is self-healing — when both `build_report.md` and `build_report_N.md` exist, save renames the unnumbered file's content to the numbered path. Works for both reports and companion data files. Works for verify reports too.
- [ ] AC3: Stage detection uses `.saves.json` `saved_at` timestamps instead of git commit timestamps — both single-spec path and multi-phase path.
- [ ] AC4: `.saves.json` keys are phase-aware — `build-report-1`, `verify-report-1`, `build-data-1`, `verify-data-1` for numbered artifacts. Unnumbered artifacts (`build-report`, `verify-report`) unchanged.
- [ ] AC5: `completeWork` completeness check reads phase-aware keys for multi-phase work, with fallback to old unnumbered keys for backward compatibility.
- [ ] AC6: Template `ana-build.md` resume protocol uses phase-numbered filenames from the first instruction, not as a late hint.
- [ ] AC7: Template `ana-verify.md` "Find Work" section lists `ready-for-re-verify` and `phase-N-ready-for-re-verify` as valid stages.
- [ ] AC8: Tests exist for fix-cycle stage transitions and auto-rename scenarios.
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`.
- [ ] No build errors with `pnpm run build`.

## Testing Strategy

**Unit tests in `work.test.ts`:**
- `ready-for-re-verify` stage transition (single-spec): Create project with FAIL verify report, add `.saves.json` on feature branch with build-report `saved_at` AFTER verify-report `saved_at`. Assert output contains `ready-for-re-verify`.
- `phase-N-ready-for-re-verify` stage transition (multi-phase): Same pattern with phase-numbered keys (`build-report-2`, `verify-report-2`).
- `needs-fixes` when build timestamp is BEFORE verify timestamp: Verify the negative case — `.saves.json` has build saved before verify, stage stays `needs-fixes`.
- Backward compatibility: `.saves.json` with unnumbered keys still works for stage detection on multi-phase items.

The test helper `createWorkTestProject` needs a `savesJson` option to write `.saves.json` on the feature branch alongside feature artifacts. The helper currently writes feature artifacts and commits them — add `.saves.json` content to the same commit.

**Unit tests in `artifact.test.ts`:**
- Auto-rename when both numbered and unnumbered report files exist: Create both `build_report.md` and `build_report_1.md`, save `build-report-1`, verify `build_report.md` was renamed to `build_report_1.md` (unnumbered content overwrites numbered).
- Auto-rename of companion files alongside reports: Create `build_data.yaml` alongside `build_report.md`, both numbered and unnumbered. Verify companion is renamed too.
- Phase-aware `.saves.json` keys: Save `build-report-1`, verify `.saves.json` has key `build-report-1` not `build-report`.
- Phase-aware companion keys: Save `build-report-1` with companion, verify `.saves.json` has key `build-data-1`.

**Edge cases to test:**
- Only unnumbered exists (existing behavior — still works).
- Only numbered exists (no rename needed — existing behavior).
- Single-spec path: `.saves.json` keys remain `build-report` / `verify-report` (no regression).

## Dependencies

None. All changes are within the existing codebase.

## Constraints

- Backward compatibility: Existing `.saves.json` files with unnumbered keys must still work for both stage detection and `completeWork` completeness checks.
- `baseType` field must remain unchanged — it drives category logic, validation dispatch, display names, and branch checks throughout `artifact.ts`.
- Test count must not decrease. Current: 2107 tests in 99 files.

## Gotchas

- **`deriveCompanionKey` is called in two places:** `saveArtifact` (around line 1127) and `saveAllArtifacts` (around line 1517). Both currently pass `baseType`. Both must be updated to pass `artifactType`. Missing one silently writes unnumbered companion keys.
- **`saveAllArtifacts` writes save metadata at line 1655 using `artifact.typeInfo.baseType`.** The `typeInfo` objects come from scanning the plan directory (lines 1408-1448), NOT from CLI argument parsing. The scanned artifacts already construct the full type string (e.g., `build-report-2` at line 1429) — it's the `type` variable. Ensure `parseArtifactType` stores this as `artifactType`.
- **`completeWork` reads `.saves.json` from the local filesystem** (line 1475-1481), NOT from a branch. This is correct — `completeWork` runs from the main tree after merge, and `.saves.json` is in the active plan directory which lives on the artifact branch.
- **Stage detection reads from a branch** (via `readFileOnBranch`), but `completeWork` reads from disk. Different code paths, same data.
- **The `.saves.json` on the worktree branch** is accessible from main via `readFileOnBranch(workBranch, path)`. The path format must use forward slashes for cross-platform compatibility — follow the pattern in `archivePreviousVersion` line 186.
- **Auto-rename companion derivation:** Use `deriveCompanionFileName` (already handles numbered files correctly — `build_report_1.md` → `build_data_1.yaml`). For the unnumbered source, call it with the unnumbered report name to get the unnumbered companion name.
- **Test helper modification:** The `createWorkTestProject` helper in `work.test.ts` commits feature artifacts in a single commit. Adding `.saves.json` to that commit is straightforward — write the file before the `git add -A && git commit` call. But `.saves.json` needs controlled timestamps, so write it with explicit `saved_at` values, not `new Date()`.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- Explicit return types on all exported functions. Internal helpers can use inference.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Always use `--run` with `pnpm vitest` to avoid watch mode hang.

### Pattern Extracts

**Auto-rename pattern** (`artifact.ts` lines 997-1011) — extend this block:
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
```

**Stage detection pattern** (`work.ts` lines 395-421) — replace the git timestamp block:
```typescript
    if (hasVerifyReport) {
      const result = verifyReports[0]?.result;
      if (result === 'PASS') {
        return 'ready-to-merge';
      } else if (result === 'FAIL') {
        // Check if build report was updated AFTER verify report (fixes applied)
        try {
          const basePath = `.ana/plans/active/${slug}`;
          const buildTime = runGit(
            ['log', '--format=%ct', '-1', workBranch, '--', `${basePath}/build_report.md`]
          ).stdout;
          const verifyTime = runGit(
            ['log', '--format=%ct', '-1', workBranch, '--', `${basePath}/verify_report.md`]
          ).stdout;
          if (buildTime && verifyTime && parseInt(buildTime) > parseInt(verifyTime)) {
            return 'ready-for-re-verify';
          }
        } catch { /* fall through to needs-fixes */ }
        return 'needs-fixes';
      }
    }
```

**`readFileOnBranch` utility** (`work.ts` line 123-126):
```typescript
function readFileOnBranch(branch: string, filePath: string): string | null {
  const result = runGit(['show', `${branch}:${filePath}`]);
  return result.exitCode === 0 ? result.stdout : null;
}
```

**Test pattern** (`work.test.ts` lines 212-231):
```typescript
    it('with verify_report FAIL → needs-fixes', async () => {
      const planContent = `# Plan\n## Phases\n- [ ] Phase 1\n  Spec: spec.md`;
      const verifyContent = `# Verify Report\n\n**Result:** FAIL`;
      await createWorkTestProject({
        slugs: [{
          slug: 'test-slug',
          artifacts: ['scope.md', 'plan.md', 'spec.md'],
          planContent,
          featureBranch: true,
          featureArtifacts: [
            { file: 'build_report.md' },
            { file: 'verify_report.md', content: verifyContent },
          ],
        }],
      });

      const output = await captureOutput(async () => await getWorkStatus({ json: false }));
      expect(output).toContain('needs-fixes');
    });
```

### Proof Context

**artifact.ts** — 4 pipeline cycles. Most relevant:
- [code] `archivePreviousVersion` uses string equality for content comparison — could produce false archives on Windows with CRLF. Not related to this fix but worth awareness during auto-rename extension.

**work.ts** — 12 pipeline cycles. Most relevant:
- [code] Race condition in `writeTimestamp`: read-modify-write on `.saves.json` is not atomic. Known and accepted — CLI is single-process.
- [test] Phase detection logic has no dedicated tagged tests. This fix adds the missing re-verify tests.

No active findings directly overlap with contract assertions for this fix.

### Checkpoint Commands

- After `ArtifactTypeInfo` + `parseArtifactType` changes: `(cd packages/cli && pnpm vitest run --run tests/commands/artifact.test.ts)` — Expected: existing tests still pass
- After stage detection rewrite: `(cd packages/cli && pnpm vitest run --run tests/commands/work.test.ts)` — Expected: existing tests still pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2107+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2107 passed, 2 skipped (99 test files)
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2120+ tests (adding ~13 new tests across work.test.ts and artifact.test.ts)
- Regression focus: `tests/commands/work.test.ts` (stage detection), `tests/commands/artifact.test.ts` (auto-rename, `.saves.json` keys)
