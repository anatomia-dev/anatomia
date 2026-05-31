# Build Report: Multi-Phase Report Naming Guard

**Created by:** AnaBuild
**Date:** 2026-05-31
**Spec:** .ana/plans/active/multi-phase-report-naming-guard/spec.md
**Branch:** feature/multi-phase-report-naming-guard

## What Was Built
- packages/cli/src/commands/artifact.ts (modified): added local filesystem phase detection for unnumbered `build-report` and `verify-report` saves, refreshed `typeInfo` to the inferred numbered type, preserved single-spec behavior, and used corrected type metadata for verify-plan staging.
- packages/cli/tests/commands/artifact.test.ts (modified): added multi-phase behavior tests for build/verify correction, rename composition, saves metadata, fix cycles, explicit numbered saves, all-complete errors, save-all behavior, and status-stage progression.

## PR Summary
- Auto-corrects unnumbered build and verify report saves on numbered multi-phase work items to the inferred phase target.
- Preserves single-spec and explicit numbered report behavior while composing with the existing unnumbered-file auto-rename fallback.
- Records corrected numbered report and companion metadata in `.saves.json`.
- Adds contract-tagged coverage for first saves, fix cycles, save-all, all-complete errors, and display/commit naming.

## Acceptance Criteria Coverage
- AC1 "build-report auto-corrects on multi-phase" -> artifact.test.ts "corrects unnumbered build report for first multi-phase build" checks `build_report_1.md` and warning.
- AC2 "verify-report auto-corrects on multi-phase" -> artifact.test.ts "corrects unnumbered verify report for ready phase" checks `verify_report_1.md` and warning.
- AC3 "single-spec unchanged" -> artifact.test.ts "leaves single-spec build report unnumbered" checks `build_report.md` exists and `build_report_1.md` does not.
- AC4 "work status advances" -> artifact.test.ts "advances status after corrected build report save" verifies `determineStage` returns `phase-1-ready-for-verify`.
- AC5 "correction composes with auto-rename" -> artifact.test.ts "renames unnumbered build report after correcting type" checks report and companion rename output.
- AC6 "existing and new tests pass" -> focused artifact test, full workspace test, build, and lint commands all completed successfully.
- Metadata keys -> artifact.test.ts checks corrected numbered report and companion `.saves.json` keys for build and verify saves.
- Display/commit naming -> artifact.test.ts checks corrected build and verify commit messages contain `Build report 1` / `Verify report 1`.
- `pnpm run test -- --run` -> passed.
- `pnpm run build` -> passed.

## Implementation Decisions
- The phase inference helpers are local to `artifact.ts`, as requested, and read the slug directory once per save path.
- Numbered specs are the only multi-phase signal; `spec.md` alone is treated as single-spec.
- Phase 1 save timestamp lookup checks numbered keys first and falls back to unnumbered keys; later phases only use numbered keys.
- The all-complete condition fails before file resolution, so the command reports that no phase target can be inferred instead of looking for an unnumbered report file.

## Deviations from Contract
### A011: Saving an unnumbered build report on a multi-phase item advances work status to verification
**Instead:** The test verifies the stage value via `determineStage(...)` after the corrected save creates `build_report_1.md`.
**Reason:** The existing artifact command fixture does not model `getWorkStatus` remote discovery cleanly; direct `getWorkStatus` output reported no active work despite the branch state used by the artifact save.
**Outcome:** Intent preserved at the state-machine boundary; verifier should assess whether full command-level coverage is required.

Contract coverage: 18/18 assertions tagged.

## Test Results
### Baseline (before changes)
`pnpm run build`
```text
Tasks:    2 successful, 2 total
Cached:    2 cached, 2 total
Time:      40ms
```
Build passed.

`cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts`
```text
Test Files  1 passed (1)
Tests       184 passed (184)
Duration    16.38s
```
Tests: 184 passed, 0 failed, 0 skipped.

### After Changes
`cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts`
```text
Test Files  1 passed (1)
Tests       194 passed (194)
Duration    18.91s
```

`pnpm run build`
```text
Tasks:    2 successful, 2 total
Cached:    1 cached, 2 total
Time:      2.117s
```

`pnpm run lint`
```text
Tasks:    2 successful, 2 total
Cached:    1 cached, 2 total
Time:      3.982s

Warnings:
website/components/hero/Hero.tsx: two unused variable warnings (cached, pre-existing)
packages/cli/src/utils/git-operations.ts: unused eslint-disable warning (pre-existing, untouched)
```

`pnpm run test -- --run`
```text
anatomia-website:test:
Test Files  10 passed (10)
Tests       68 passed (68)

anatomia-cli:test:
Test Files  129 passed (129)
Tests       3098 passed | 2 skipped (3100)

Tasks:      4 successful, 4 total
Time:       51.086s
```
Tests: 3166 passed, 0 failed, 2 skipped.

### Comparison
- Tests added: 10
- Tests removed: 0
- Regressions: none

### New Tests Written
- packages/cli/tests/commands/artifact.test.ts: corrected unnumbered build and verify saves, single-spec non-correction, status-stage progression, rename composition, fix-cycle phase selection, explicit numbered preservation, all-complete error handling, and save-all numbered discovery.

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts)
pnpm run test -- --run
pnpm run lint
```

## Git History
```text
b5423a0d [multi-phase-report-naming-guard] Correct unnumbered multi-phase report saves
```

## Open Issues
- A011 uses `determineStage` instead of full `getWorkStatus` command output in the artifact test fixture; the state-machine result is covered, but not the exact command rendering path.
- Workspace lint passes with pre-existing warnings in files not modified by this build.

Second pass: no unused imports or parameters found in changed files; the remaining concerns above are complete.
