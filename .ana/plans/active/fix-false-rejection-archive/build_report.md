# Build Report: Fix False Rejection Archives on Same-Session Re-Saves

**Created by:** AnaBuild
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-false-rejection-archive/spec.md
**Branch:** feature/fix-false-rejection-archive

## What Was Built

- `packages/cli/src/commands/artifact.ts` (modified): Added `deriveOpposingReportKey` and `hasOpposingStageAdvanced` exported helpers. Gated all four `archivePreviousVersion` call sites (two in `saveArtifact`, two loops in `saveAllArtifacts`) on `hasOpposingStageAdvanced`. Added `options.gateOnStageTransition` parameter to `writeSaveMetadata` to conditionally skip history pushes for archivable types when opposing stage hasn't advanced. Updated all six `writeSaveMetadata` call sites (two in `saveArtifact`, two in `saveAllArtifacts` for artifacts and companions) to pass the gate option.

- `packages/cli/src/utils/proofSummary.ts` (modified): Added `slugDir` parameter to `computeTiming`. Replaced `hasRejectionHistory` (boolean from `.saves.json` history arrays) with `hasRejectionContent` (content-based detection via `parseRejectionCycles` reading actual verify report files). Updated `generateProofSummary` to pass `slugDir` to `computeTiming`.

- `packages/cli/tests/commands/artifact.test.ts` (modified): Updated all 8 existing archive tests to include `.saves.json` with opposing-stage entries (so the gate permits archiving). Added helper `writeOpposingSaves`. Added 12 new tests for: same-session verify re-save (no archive, no companion archive, no history), same-session build re-save (no archive, no history), genuine rejection (archive created, history created), multi-phase opposing key derivation (verify-report-2 → build-report-2, build-report-3 → verify-report-3), companion gating, first-time saves. Re-tagged existing tests with correct contract assertion IDs.

- `packages/cli/tests/utils/proofSummary.test.ts` (modified): Updated existing rejection-cycle timing test to include a verify report file with rejection content. Added 4 new tests: content-based detection activates timing reconstruction, false history without rejection content uses fallback, missing verify report uses fallback, multi-phase verify report with rejection content.

## PR Summary

- Gate artifact archiving and history pushes on opposing-stage advancement, preventing false `_r` archive files and false `.saves.json` history entries from same-session corrections
- Replace history-array-based rejection detection in `computeTiming` with content-based detection using `parseRejectionCycles`, making timing reconstruction immune to false history
- Add `deriveOpposingReportKey` and `hasOpposingStageAdvanced` as defense-in-depth helpers with phase-aware and companion-key support
- 16 new tests covering same-session gating, genuine rejection preservation, multi-phase opposing keys, companion gating, first-time saves, and content-based timing detection

## Acceptance Criteria Coverage

- AC1 "Same-session re-save of verify-report does NOT create _r archive files" → artifact.test.ts "same-session verify re-save does not archive report" (1 assertion)
- AC2 "Same-session re-save of verify-report does NOT create a history entry" → artifact.test.ts "same-session verify re-save does not create history entry" (1 assertion)
- AC3 "Same criteria for build-report" → artifact.test.ts "same-session build re-save does not archive report" + "does not create history entry" (2 assertions)
- AC4 "Genuine rejection cycles still create _r archive files and history entries" → artifact.test.ts "genuine rejection creates archive" + "genuine rejection creates history entry" (2 assertions)
- AC5 "Multi-phase numbered artifacts use phase-aware opposing key lookup" → artifact.test.ts "multi-phase opposing key derives correctly" + "multi-phase opposing key derives correctly for build" (2 assertions)
- AC6 "computeTiming uses parseRejectionCycles instead of hasRejectionHistory" → proofSummary.test.ts "content-based rejection detection activates timing reconstruction" + "false history does not activate rejection timing" (2 assertions, values 60 vs 70 prove correct path)
- AC7 "Companion artifacts follow the same gating" → artifact.test.ts "same-session verify re-save does not archive companion" + "companion follows parent gate on same-session re-save" (2 assertions)
- AC8 "First-time saves continue to work" → artifact.test.ts "first save with no prior entry works normally" + "first save with no saves.json works normally" (2 assertions)
- AC9 "Tests pass" → 2872 passed, 2 skipped
- AC10 "No build errors" → `pnpm run build` succeeds
- AC11 "No lint errors" → `pnpm run lint` passes (1 pre-existing warning in git-operations.ts)

## Implementation Decisions

1. **`deriveOpposingReportKey` handles companion keys.** The spec mentioned companions need gating but didn't specify how companion keys map to opposing report keys. I added companion-key support directly in `deriveOpposingReportKey` (verify-data-2 → parent verify-report-2 → opposing build-report-2) to keep the gate call sites simple.

2. **`hasOpposingStageAdvanced` reads the report key for companions.** When checking a companion key like `verify-data`, the function derives the parent report key (`verify-report`) to find the current artifact's timestamp, then checks the opposing report's timestamp. This ensures companions inherit their parent report's gate decision.

3. **`writeSaveMetadata` uses inline IIFE for `shouldPreserveHistory`.** The gate check has multiple conditions (first write, non-archivable type, archivable with gate option). An IIFE keeps the logic contained without adding a separate function.

4. **Content-based detection iterates numbered verify reports.** Uses the `verifyPhases` array (already computed from `getNumberedPhases`) to discover numbered files, plus checks the unnumbered `verify_report.md`. Any file with rejection content triggers the rejection timing branch.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts)
Test Files  1 passed (1)
     Tests  172 passed (172)

(cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts)
Test Files  1 passed (1)
     Tests  256 passed (256)
```

### After Changes
```
(cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts)
Test Files  1 passed (1)
     Tests  184 passed (184)

(cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts)
Test Files  1 passed (1)
     Tests  260 passed (260)

(cd packages/cli && pnpm vitest run)
Test Files  122 passed (122)
     Tests  2872 passed | 2 skipped (2874)
```

### Comparison
- Tests added: 16 (12 in artifact.test.ts, 4 in proofSummary.test.ts)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `artifact.test.ts`: same-session verify/build re-save gating (no archive, no companion archive, no history), genuine rejection (archive + history created), multi-phase opposing key derivation, companion gating, first-time saves (no prior entry, no .saves.json)
- `proofSummary.test.ts`: content-based rejection detection activates timing reconstruction, false history falls back to simple timing, missing verify report falls back, multi-phase verify report with rejection content

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run tests/commands/artifact.test.ts)
(cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
ae1d846b [fix-false-rejection-archive] Replace hasRejectionHistory with content-based detection
ee8e237f [fix-false-rejection-archive] Add stage-transition gate to artifact archiving and history
```

## Open Issues

1. **`writeOpposingSaves` test helper duplicates opposing-key logic.** The helper in artifact.test.ts derives opposing keys with inline string manipulation rather than calling `deriveOpposingReportKey`. This means if the derivation logic changes, the helper may drift. Accepted because the helper is test-only and the derivation is straightforward.

2. **Content-based detection reads verify report files on every `computeTiming` call.** For projects with many phases and large verify reports, this adds I/O. Currently negligible (verify reports are small, typically 1-2 files), but worth noting if proof summary computation is ever on a hot path.

3. **The multi-phase rejection test (A018) uses a hybrid setup.** It has both unnumbered `verify-report` saves entries and numbered `verify-report-1` to trigger multi-phase detection. The test verifies the numbered file path is found. The unnumbered saves entries cause multi-phase detection to NOT activate (since `buildPhases.length === 0`), meaning the rejection branch is what runs. This is correct behavior but the setup is non-obvious.

Verified complete by second pass.
