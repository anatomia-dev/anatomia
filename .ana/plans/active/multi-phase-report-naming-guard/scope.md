# Scope: Multi-Phase Report Naming Guard

**Created by:** Ana
**Date:** 2026-05-31

## Intent

Fix issue #232: on a multi-phase work item, `ana artifact save build-report {slug}` and `ana artifact save verify-report {slug}` should not silently save unnumbered reports when the phase structure requires numbered reports.

The disease is that artifact saving validates the command syntax but does not validate that the artifact type matches the work item's phase structure. The CLI trusts the agent to choose `build-report-1` / `verify-report-1`, then the state machine cannot find the unnumbered files it saved.

## Complexity Assessment

- **Kind:** fix
- **Size:** small
- **Surface:** cli
- **Files affected:** `packages/cli/src/commands/artifact.ts`, `packages/cli/tests/commands/artifact.test.ts`
- **Blast radius:** Individual artifact saves for build and verify reports. Single-spec saves and `save-all` should remain unchanged.
- **Estimated effort:** 1 hour
- **Multi-phase:** no

## Approach

Add a save-time guard in the artifact command so report artifact types are mechanically reconciled with the work item's phase structure before branch validation and file resolution proceed.

The strategy is to extend the existing self-healing behavior in `saveArtifact`: the command already corrects a wrong report filename when the artifact type is numbered. This fix should correct the wrong unnumbered report type first, then let the existing filename fallback handle any file rename. That preserves the current product behavior: agents can make a common naming mistake, but the CLI keeps the pipeline state coherent.

Build and verify report correction should use phase-aware rules appropriate to each report type. Build correction should target the phase that needs a build report. Verify correction should target the phase that already has a build report and needs a verify report.

## Acceptance Criteria

- AC1: `ana artifact save build-report {slug}` on a multi-phase scope with `spec-1.md` auto-corrects to the correct numbered build report type and prints a yellow warning.
- AC2: `ana artifact save verify-report {slug}` on a multi-phase scope auto-corrects to the correct numbered verify report type and prints a yellow warning.
- AC3: `ana artifact save build-report {slug}` on a single-spec scope with only `spec.md` works unchanged, using the unnumbered report.
- AC4: After auto-correcting an unnumbered build report save, `ana work status` can advance to the expected phase stage, such as `phase-1-ready-for-verify`.
- AC5: The type correction composes with the existing auto-rename fallback: a wrong unnumbered command plus an unnumbered report file becomes the correct numbered report file.
- AC6: Existing tests pass, and new tests cover build-report correction, verify-report correction, single-spec non-correction, and composition with the existing rename fallback.

## Edge Cases & Risks

- Build and verify phase selection are related but not identical. Build should select the first phase missing a build report; verify should select the first phase with a build report and without a verify report.
- If all phases already have reports, the existing research suggests allowing the next phase number to be selected rather than blocking. AnaPlan should confirm whether that behavior is still appropriate once verify selection is type-specific.
- Mixed numbered and unnumbered files can exist during fix cycles. The new type correction must run before the existing rename fallback so current overwrite behavior remains intact.
- Single-spec work must not be treated as multi-phase. The guard should key off `spec-1.md`, not the presence of `spec.md`.
- `saveAllArtifacts()` should not need behavior changes because it derives artifact types from filenames.

## Rejected Approaches

- Rejecting unnumbered report saves on multi-phase work was rejected. It would be mechanically strict, but it recreates the manual-repair problem this fix is meant to remove.
- Changing the state machine to accept unnumbered first-phase reports was rejected. It would normalize the wrong artifact shape and leave future pipeline stages with ambiguous naming.
- Prompt-only enforcement was rejected. Agent instructions already document numbered report types; the issue exists because prompts are not a reliable verification boundary.

## Open Questions

- AnaPlan should design the exact phase-resolution helper or inline logic for build versus verify correction. In particular, verify correction should not use "first phase without a build report"; it should target the phase that is ready for verify.

## Exploration Findings

### Patterns Discovered

- `packages/cli/src/commands/artifact.ts:446` parses both numbered and unnumbered report types into `ArtifactTypeInfo`, including the target filename.
- `packages/cli/src/commands/artifact.ts:679` is the individual artifact save entry point. It parses the type before resolving the project root and validating the branch.
- `packages/cli/src/commands/artifact.ts:716` already contains the structural pattern to follow: when a numbered report type is requested but the agent wrote the unnumbered filename, the command renames the unnumbered report and companion file.
- `packages/cli/src/commands/work-state.ts:430` maps multi-phase specs to numbered reports, so `spec-1.md` expects `build_report_1.md` and `verify_report_1.md`.

### Constraints Discovered

- [TYPE-VERIFIED] `ArtifactTypeInfo` (`packages/cli/src/commands/artifact.ts:495`) includes `baseType`, `fileName`, `displayName`, and `artifactType`; correcting the type should refresh all of these fields.
- [OBSERVED] The current `saveArtifact` type binding is `const`; implementing correction may require changing that local binding to allow reparsing.
- [OBSERVED] Proof context for `artifact.ts` includes existing concerns around save metadata and artifact archiving. Keep this fix narrow and avoid widening the artifact command surface.
- [INFERRED] The warning should match existing command output style: yellow for user-visible correction, gray for low-level rename details.

### Test Infrastructure

- `packages/cli/tests/commands/artifact.test.ts:4165` contains the closest existing test block for fix-cycle auto-rename and phase-aware `.saves.json` keys.
- `packages/cli/tests/commands/artifact.test.ts:4214` sets up temporary git repositories on a feature branch, matching the branch requirements for build/verify artifact saves.
- `packages/cli/tests/commands/work.test.ts:419` has an existing assertion that `build_report_1.md` advances multi-phase status to `phase-1-ready-for-verify`.

## For AnaPlan

### Structural Analog

`packages/cli/src/commands/artifact.ts:716` is the required structural analog. It is the existing self-healing path for multi-spec report naming mistakes and already composes report file renames with companion file renames.

### Relevant Code Paths

- `packages/cli/src/commands/artifact.ts:446` parses artifact type strings into expected filenames.
- `packages/cli/src/commands/artifact.ts:679` saves one artifact and owns branch validation, file resolution, rename fallback, validation, metadata, and commit.
- `packages/cli/src/commands/artifact.ts:1135` saves all artifacts by deriving types from filenames; it should remain compatible without targeted changes.
- `packages/cli/src/commands/work-state.ts:425` determines multi-phase status by looking for numbered report filenames derived from spec filenames.
- `packages/cli/tests/commands/artifact.test.ts:4165` is the closest test location for new artifact save correction tests.

### Patterns to Follow

- Follow `packages/cli/src/commands/artifact.ts` local control flow: validate slug, parse type, resolve root, normalize/correct artifact metadata, validate branch, resolve paths.
- Follow the existing auto-rename fallback's self-healing style rather than introducing a hard error.
- Follow existing artifact tests that use real temp git repositories and direct `saveArtifact(...)` calls.

### Known Gotchas

- Verify-report phase resolution is not the same as build-report phase resolution. Do not blindly reuse "first phase without build report" for verify.
- The existing auto-rename fallback depends on `typeInfo.fileName` being numbered; correction must happen before that block.
- Correction should update both the type string used for save metadata and the parsed `typeInfo`, or `.saves.json` may record the wrong key.
- Single-spec work is identified by `spec.md`; multi-phase work is identified by numbered specs such as `spec-1.md`.

### Things to Investigate

- Whether verify-report correction during a fix cycle should target the first missing verify report or the current failed phase when a numbered verify report already exists.
- Whether the "all phases already have reports" behavior should remain permissive for both report types or should warn differently for verify reports.
