# Spec: Multi-Phase Report Naming Guard

**Created by:** AnaPlan
**Date:** 2026-05-31
**Scope:** .ana/plans/active/multi-phase-report-naming-guard/scope.md

## Approach

The disease: `saveArtifact` validates command syntax but binds the requested report type before it validates the work item's phase structure, so an unnumbered report command can save unnumbered files that the multi-phase state machine will not read.

Add a phase-aware correction step inside `saveArtifact` for unnumbered report saves only. After `projectRoot` is known, read `.ana/plans/active/{slug}` and detect numbered specs such as `spec-1.md`. If the work item is multi-phase and the requested type is exactly `build-report` or `verify-report`, resolve the intended phase and reparse the type as `build-report-N` or `verify-report-N` before branch validation and file resolution continue.

Keep the correction in `packages/cli/src/commands/artifact.ts` near the existing parsing/path setup. The implementation may use local helpers, but do not introduce a new cross-command abstraction for this small policy. The important contract is that `typeInfo` must be refreshed after correction so all downstream behavior uses the corrected `fileName`, `displayName`, `baseType`, `artifactType`, companion key, save metadata key, archive gate, and commit message.

Phase resolution rules:

- Single-spec work uses `spec.md` and must not be corrected. A plan directory with only `spec.md` should keep `build-report` as `build_report.md` and `verify-report` as `verify_report.md`.
- Multi-phase work is identified by numbered specs matching `spec-N.md`. Do not rely on scope prose or plan text for this guard.
- Build correction should target the earliest phase that needs a build save. A phase needs build if its numbered build report is missing. A failed phase also needs build if its numbered verify report exists with `**Result:** FAIL` and there is not already a newer build save recorded after that verify save for the same phase.
- Verify correction should target the earliest phase that is ready for verify. A phase is ready if the numbered build report exists and the numbered verify report is missing. A failed phase is ready for re-verify if `.saves.json` shows the phase's build-report key was saved after the phase's verify-report key.
- For phase 1, read phase-aware `.saves.json` keys first and keep the existing backward-compatible fallback to unnumbered keys where relevant. For phase 2 and later, only numbered keys should drive phase resolution.
- If all declared phases already have passing verify reports, do not invent a next phase number. Print a clear red error explaining that no multi-phase report target could be inferred and tell the user to run `ana work status` or use an explicit numbered report type.

The correction must run before the existing auto-rename fallback. This composes the two self-healing behaviors: a wrong unnumbered command plus an unnumbered report file becomes the correct numbered command target, then the existing rename path moves `build_report.md` to `build_report_N.md` and does the same for the companion file.

## Output Mockups

When an unnumbered build report save is corrected on a two-phase item:

```text
⚠ build-report is unnumbered for a multi-phase work item; saving as build-report-1.
Renamed build_report.md → build_report_1.md
Renamed build_data.yaml → build_data_1.yaml
✓ build_data_1.yaml validated (1 concerns)
✓ Saved Build report 1 for `test-slug` on `feature/test-slug`.
```

When an unnumbered verify report save is corrected:

```text
⚠ verify-report is unnumbered for a multi-phase work item; saving as verify-report-1.
Renamed verify_report.md → verify_report_1.md
Renamed verify_data.yaml → verify_data_1.yaml
✓ verify_data_1.yaml validated (1 findings, 1 warnings)
✓ Saved Verify report 1 for `test-slug` on `feature/test-slug`.
```

When no phase target can be inferred:

```text
Error: Cannot infer a target phase for build-report on multi-phase work item `test-slug`.
Run `ana work status` or use an explicit numbered type like `ana artifact save build-report-2 test-slug`.
```

## File Changes

### packages/cli/src/commands/artifact.ts (modify)

**What changes:** Add phase-aware correction for unnumbered `build-report` and `verify-report` saves on multi-phase work items. Change the local `typeInfo` binding in `saveArtifact` so it can be refreshed after correction. Ensure any helper that reads phase state is local, deterministic, and filesystem-based.

**Pattern to follow:** Follow the existing self-healing auto-rename block in `saveArtifact`, especially its sequencing before validation and companion discovery. Follow `work-state.ts` for expected numbered filenames and `.saves.json` key fallback behavior.

**Why:** Without this, the CLI can save `build_report.md` or `verify_report.md` on a multi-phase feature branch, while `ana work status` looks for `build_report_1.md` and `verify_report_1.md`.

### packages/cli/tests/commands/artifact.test.ts (modify)

**What changes:** Add behavior tests to the existing artifact command test file, near the fix-cycle auto-rename and phase-aware key tests. Extend the temp repo fixture in that block to support numbered specs and `.saves.json` phase timestamps.

**Pattern to follow:** Follow the real temp git repository setup already used by `setupFeatureBranch()` and the existing direct `saveArtifact(...)` calls.

**Why:** This behavior spans artifact parsing, filesystem naming, git commits, companion files, and `.saves.json`; a pure helper test would miss the regressions that caused issue #232.

## Acceptance Criteria

- [ ] AC1: `ana artifact save build-report {slug}` on a multi-phase scope with `spec-1.md` auto-corrects to the correct numbered build report type and prints a yellow warning.
- [ ] AC2: `ana artifact save verify-report {slug}` on a multi-phase scope auto-corrects to the correct numbered verify report type and prints a yellow warning.
- [ ] AC3: `ana artifact save build-report {slug}` on a single-spec scope with only `spec.md` works unchanged, using the unnumbered report.
- [ ] AC4: After auto-correcting an unnumbered build report save, `ana work status` can advance to the expected phase stage, such as `phase-1-ready-for-verify`.
- [ ] AC5: The type correction composes with the existing auto-rename fallback: a wrong unnumbered command plus an unnumbered report file becomes the correct numbered report file.
- [ ] AC6: Existing tests pass, and new tests cover build-report correction, verify-report correction, single-spec non-correction, and composition with the existing rename fallback.
- [ ] New tests verify `.saves.json` records corrected numbered report and companion keys for multi-phase saves.
- [ ] New tests verify the corrected save's commit message/display name uses the numbered report display.
- [ ] `pnpm run test -- --run` passes after implementation.
- [ ] `pnpm run build` passes after implementation.

## Testing Strategy

- **Unit tests:** Use direct `saveArtifact(...)` calls in `packages/cli/tests/commands/artifact.test.ts`, following the current temp git repo pattern. Capture `console.log` or `console.warn` around saves that must print the yellow correction warning, and restore the original console method in `finally`.
- **Integration tests:** Exercise real file rename, companion rename, git commit, and `.saves.json` metadata by creating numbered specs plus unnumbered report/data files in the slug directory, then saving with the unnumbered command.
- **Edge cases:** Cover build phase 1 correction, verify phase 1 correction, single-spec non-correction, unnumbered command plus unnumbered file auto-rename, failed verify plus newer build selecting re-verify, and all phases complete producing a clear error instead of an off-plan report.

## Dependencies

- Existing artifact save validation, companion validation, `.saves.json` metadata, and auto-rename behavior remain in place.
- No new runtime dependency is needed.
- Tests require git in the environment, as the existing artifact tests already do.

## Constraints

- Do not change `saveAllArtifacts()`. It derives artifact types from filenames and should remain compatible.
- Do not change `work-state.ts` stage detection for this fix. The save command must produce files that match the existing state machine.
- Do not correct explicit numbered commands. `build-report-2` and `verify-report-2` should continue through existing parsing and validation.
- Do not treat `spec.md` as multi-phase. Numbered specs are the trigger.
- Preserve existing behavior for single-spec saves, companion validation, archive gating, worktree auto-move, and post-save cleanup.
- Use local imports with `.js` extensions and `node:` prefixes if imports change.

## Gotchas

- The current `typeInfo` local is `const`; correction requires either `let typeInfo` or a separate corrected variable that all later code uses. Do not update only `type` or only `typeInfo`.
- Several downstream checks use `typeInfo.artifactType`, while one plan-staging condition still checks the original `type` string. If a corrected verify save should stage `plan.md`, ensure the condition still recognizes the corrected verify report.
- The existing auto-rename fallback depends on `typeInfo.fileName` already being numbered. Run correction before that block.
- Fix cycles are not the same as first builds. If phase 1 has `verify_report_1.md` with `FAIL`, an unnumbered build save should target phase 1 again, not phase 2.
- Phase 1 has backward-compatible `.saves.json` fallback keys in `work-state.ts`; phase 2 and later should not use unnumbered fallback keys.
- Report companions must follow the corrected report target. `build-report-1` implies `build_data_1.yaml` and `build-data-1` metadata.
- Avoid broad refactors in `artifact.ts`; proof context already notes several active concerns around artifact archiving and metadata.

## Build Brief

### Rules That Apply

- Local imports must include `.js` extensions and Node built-ins must use `node:` prefixes.
- Use `import type` for type-only imports if imports change.
- Prefer named exports; do not add a default export.
- Commands surface user-facing errors with `chalk.red` and `process.exit(1)`.
- Test behavior, not helper implementation details.
- Always pass `--run` to Vitest in non-interactive test commands.
- Tests that create git repos must force the branch name with `git branch -M main` or `git init -b main`.
- This change should be foundation, not scaffolding: the corrected artifact type must become the single source of truth for all downstream save behavior.

### Pattern Extracts

`packages/cli/src/commands/artifact.ts:679-746`

```ts
export function saveArtifact(type: string, slug: string): void {
  // 0. Validate slug format
  try {
    validateSlug(slug);
  } catch {
    console.error(chalk.red('Error: Invalid slug format. Use kebab-case: fix-auth-timeout, add-export-csv'));
    process.exit(1);
  }

  // 1. Parse type
  const typeInfo = parseArtifactType(type);
  if (!typeInfo) {
    console.error(chalk.red(`Error: Unknown artifact type \`${type}\`.`));
    console.error(chalk.gray('Valid types: scope, plan, spec, spec-N, contract, build-report, build-report-N, verify-report, verify-report-N'));
    process.exit(1);
  }

  // 2. Resolve project root early — needed for readArtifactBranch and throughout
  const projectRoot = findProjectRoot();

  // 3. Read artifactBranch from ana.json
  const artifactBranch = readArtifactBranch(projectRoot);

  // 4. Get current branch
  const currentBranch = getCurrentBranch();
  if (!currentBranch) {
    console.error(chalk.red('Error: Not a git repository. `ana artifact save` requires git.'));
    process.exit(1);
  }

  // 5. Validate branch
  validateBranch(typeInfo, currentBranch, artifactBranch, slug);

  // 6. Resolve file path (relative to projectRoot for git, absolute for fs)
  const relFilePath = path.join('.ana', 'plans', 'active', slug, typeInfo.fileName);
  let filePath = path.join(projectRoot, relFilePath);

  // 6a. Auto-rename fallback for multi-spec: if build_report_1.md doesn't exist
  // but build_report.md does, rename it. Same for verify_report. Build agents
  // commonly write the default filename instead of the phase-numbered one.
  // Also handles fix cycles: when BOTH numbered and unnumbered exist, the
  // unnumbered file (from the fix build) overwrites the numbered file.
  const isNumbered = typeInfo.fileName.match(/_\d+\.md$/);
  if (isNumbered) {
```

`packages/cli/src/commands/work-state.ts:425-475`

```ts
    // Determine which phase we're on
    for (let i = 0; i < totalPhases; i++) {
      const phaseNum = i + 1;
      const spec = specs[i];
      if (!spec) continue;
      const expectedBuildReport = spec.file === 'spec.md' ? 'build_report.md' : `build_report_${phaseNum}.md`;
      const expectedVerifyReport = spec.file === 'spec.md' ? 'verify_report.md' : `verify_report_${phaseNum}.md`;

      const phaseBuildReport = buildReports.find(r => r.file === expectedBuildReport);
      const phaseVerifyReport = verifyReports.find(r => r.file === expectedVerifyReport);

      if (!phaseBuildReport) {
        // This phase not built yet
        if (phaseNum === 1) {
          return 'phase-1-build-in-progress';
        } else {
          return `phase-${phaseNum}-ready-for-build`;
        }
      }

      if (phaseBuildReport && !phaseVerifyReport) {
        // Check verify-in-progress via worktree timestamp
        if (projectRoot && worktreeExists(projectRoot, slug)) {
          const wtSavesDir = path.join(getWorktreePath(projectRoot, slug), '.ana', 'plans', 'active', slug);
          if (isTimestampRecent(wtSavesDir, 'verify_started_at')) {
            return `phase-${phaseNum}-verify-in-progress`;
          }
        }
        return `phase-${phaseNum}-ready-for-verify`;
      }
```

`packages/cli/tests/commands/artifact.test.ts:4165-4232`

```ts
describe('fix-cycle auto-rename and phase-aware keys', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-fixcycle-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  function getValidBuildReportContent(): string {
    return `# Build Report

## Deviations
None.

## Open Issues
None.

## Acceptance Criteria
All met.

## PR Summary
Ready to review.`;
  }
```

### Proof Context

- `packages/cli/src/commands/artifact.ts`: active finding `fix-false-rejection-archive-C3` says `hasOpposingStageAdvanced` reads `.saves.json` on every call. Keep the new correction narrow and avoid adding repeated `.saves.json` reads inside hot downstream paths.
- `packages/cli/src/commands/artifact.ts`: build concerns note artifact archiving and save metadata are already delicate. Do not widen archive behavior as part of this fix.
- `packages/cli/tests/commands/artifact.test.ts`: existing active test findings are unrelated to report naming. No current finding overlaps the new contract assertions.

### Checkpoint Commands

- After `packages/cli/src/commands/artifact.ts` changes: `(cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts)` — Expected: 184 existing tests plus the new artifact tests pass.
- After all changes: `pnpm run test -- --run` — Expected: 139 test files pass, 3156 tests pass, 2 tests skipped, plus the new tests.
- Lint: `pnpm run lint`
- Build: `pnpm run build`

### Build Baseline

- Current tests: 3156 passed, 2 skipped
- Current test files: 139 passed
- Command used: `pnpm run test -- --run`
- Focused artifact baseline: 184 tests in 1 file passed
- Focused command used: `(cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts)`
- After build: expected at least 3164 tests in 139 files, assuming 8 new tests are added to the existing artifact test file
- Regression focus: `packages/cli/tests/commands/artifact.test.ts`, artifact save branch validation, companion discovery, `.saves.json` phase keys, and work-status phase progression after saving corrected reports
