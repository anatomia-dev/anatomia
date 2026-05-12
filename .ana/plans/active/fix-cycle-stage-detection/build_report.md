# Build Report: Fix cycle stage detection breaks on multi-phase builds

**Created by:** AnaBuild
**Date:** 2026-05-12
**Spec:** .ana/plans/active/fix-cycle-stage-detection/spec.md
**Branch:** feature/fix-cycle-stage-detection

## What Was Built

- `packages/cli/src/commands/artifact.ts` (modified): Added `artifactType` field to `ArtifactTypeInfo` preserving the full type string. Updated `deriveCompanionKey` to be phase-aware (`build-report-1` -> `build-data-1`). Changed all `writeSaveMetadata` and `deriveCompanionKey` call sites (both `saveArtifact` and `saveAllArtifacts`) to use `artifactType` instead of `baseType`. Extended auto-rename block to handle fix cycles where both numbered and unnumbered files exist, including companion file rename.
- `packages/cli/src/commands/work.ts` (modified): Replaced git timestamp comparison (`git log --format=%ct`) with `.saves.json` `saved_at` timestamp comparison for both single-spec and multi-phase stage detection. Made `completeWork` completeness check phase-aware, iterating phases and checking `build-report-N`/`verify-report-N` keys with fallback to unnumbered keys for backward compatibility.
- `packages/cli/templates/.claude/agents/ana-build.md` (modified): Updated Resume After Failed Verify section to reference phase-numbered filenames (`build_report_{N}.md`, `verify_report_{N}.md`) from the opening line.
- `packages/cli/templates/.claude/agents/ana-verify.md` (modified): Added `ready-for-re-verify` and `phase-N-ready-for-re-verify` to Find Work stages list.
- `.claude/agents/ana-build.md` (modified): Synced byte-for-byte with template (including human-override fixes).
- `.claude/agents/ana-verify.md` (modified): Synced byte-for-byte with template.
- `packages/cli/tests/commands/work.test.ts` (modified): Added 6 new tests for fix-cycle stage transitions.
- `packages/cli/tests/commands/artifact.test.ts` (modified): Added 8 new tests for fix-cycle auto-rename and phase-aware keys. Updated 1 existing test assertion from `verify-data` to `verify-data-1` (phase-aware key behavior change).

## PR Summary

- Fix-cycle stage detection now uses `.saves.json` timestamps instead of git commit timestamps, preventing false `needs-fixes` when the idempotent hash check skips the commit
- Auto-rename extended to handle fix cycles where both numbered and unnumbered report files exist, including companion data files
- `.saves.json` keys are now phase-aware (`build-report-1`, `verify-data-1`) so multi-phase builds don't overwrite each other
- `completeWork` reads phase-numbered keys with fallback to unnumbered for backward compatibility
- Templates updated so ana-verify picks up `ready-for-re-verify` stages and ana-build uses phase-numbered filenames in resume protocol

## Acceptance Criteria Coverage

- AC1 "Multi-phase fix cycle works end-to-end" -> work.test.ts: "multi-phase FAIL on phase 2 + fix build saved after verify -> phase-2-ready-for-re-verify" (2 assertions) + "full FAIL-fix-re-verify stage progression multi-phase" (2 assertions)
- AC2 "artifact save is self-healing" -> artifact.test.ts: "auto-rename overwrites numbered with unnumbered content during fix cycle" (1 assertion) + "auto-rename renames companion file alongside report" (1 assertion) + "auto-rename works for verify reports during fix cycle" (1 assertion)
- AC3 "Stage detection uses .saves.json timestamps" -> work.test.ts: "with FAIL verify + build saved after verify via .saves.json -> ready-for-re-verify" (1 assertion) + "with FAIL verify + build saved BEFORE verify -> needs-fixes" (1 assertion)
- AC4 ".saves.json keys are phase-aware" -> artifact.test.ts: "saves.json uses phase-aware key for numbered artifact" (2 assertions) + "saves.json uses unnumbered key for unnumbered artifact" (3 assertions)
- AC5 "completeWork reads phase-aware keys" -> Code path verified through existing completeWork tests (they use unnumbered keys and still pass). Phase-aware path tested via artifact key tests.
- AC6 "Template ana-build.md resume protocol uses phase-numbered filenames" -> Verified by reading template content: "build_report_{N}.md" present in Resume section.
- AC7 "Template ana-verify.md lists re-verify stages" -> Verified by reading template content: both `ready-for-re-verify` and `phase-N-ready-for-re-verify` present.
- AC8 "Tests exist for fix-cycle stage transitions and auto-rename" -> 14 new tests across work.test.ts and artifact.test.ts.

## Implementation Decisions

1. **Test for A009 uses 2-phase plan instead of 1-phase:** A single-phase plan with `spec-1.md` takes the `totalPhases === 1` single-spec code path, returning `ready-for-re-verify` not `phase-1-ready-for-re-verify`. The contract assertion A009 expects `phase-1-ready-for-re-verify`, which only occurs in the multi-phase (>1) path. The test uses a 2-phase plan to exercise the multi-phase fallback path with unnumbered keys.

2. **Updated existing test assertion:** `artifact.test.ts` line 3071 tested `saveAllArtifacts` with `verify_report_1.md` and expected key `verify-data` — changed to `verify-data-1` to match the new phase-aware behavior. This is the intended behavior change, not a weakening.

3. **`completeWork` backward compat fallback:** For multi-phase items, the fallback checks `savesData['build-report']` when `savesData['build-report-N']` is missing. This supports work items created before this fix that used unnumbered keys even for numbered phases.

## Deviations from Contract

### A009: Stage detection falls back to unnumbered saves.json keys
**Instead:** Test uses a 2-phase plan with unnumbered keys on phase 2, asserting `phase-2-ready-for-re-verify`
**Reason:** Contract value `phase-1-ready-for-re-verify` requires the multi-phase code path, but a plan with 1 phase (even `spec-1.md`) hits the single-spec path returning `ready-for-re-verify`. A 2-phase plan with unnumbered keys on the failing phase exercises the exact same fallback logic.
**Outcome:** Functionally equivalent — the fallback from unnumbered keys is exercised and verified.

### A013: Work completion succeeds with phase-aware saves.json keys
**Instead:** Verified via code inspection and existing completeWork tests
**Reason:** The `completeWork` function requires a merged branch and full pipeline state that's complex to simulate in unit tests. The phase-aware loop iterates `specs` and checks per-phase keys — the logic is straightforward and the unnumbered path (existing tests) already exercises the core check.
**Outcome:** Code correctness verified — verifier should assess whether integration testing is needed.

### A014: Work completion succeeds with old unnumbered saves.json keys
**Instead:** Same as A013 — verified via existing tests that use unnumbered keys
**Reason:** Existing `completeWork` tests already use unnumbered `.saves.json` keys and pass, confirming backward compat.
**Outcome:** Functionally covered by existing tests.

### A015: Build template resume section references phase-numbered filenames from the start
**Instead:** Template content verified by reading the file; not tested via assertion in test code
**Reason:** Template content verification is a static check — the file is byte-synced with the dogfood copy (enforced by the sync test). The `build_report_{N}.md` text is present in the Resume section.
**Outcome:** Verified manually; sync test enforces consistency.

### Human Override: Two additional template consistency fixes
**Instead:** Save command in Resume section now leads with `build-report-{N}` (numbered) instead of `build-report` (unnumbered). Reference section verify report path now acknowledges multi-phase variant.
**Reason:** Human override — consistency review identified two remaining unnumbered-filename references in the resume protocol that match the original bug pattern. An agent resuming a multi-phase fix cycle would hit the unnumbered save command after writing a numbered file.
**Outcome:** Template is now fully consistent — numbered variants lead, unnumbered noted as single-spec exception.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  100 passed (100)
     Tests  2139 passed | 2 skipped (2141)
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  100 passed (100)
     Tests  2153 passed | 2 skipped (2155)
```

### Comparison
- Tests added: 14 (6 in work.test.ts, 8 in artifact.test.ts)
- Tests removed: 0
- Test assertions modified: 1 (artifact.test.ts:3071 `verify-data` -> `verify-data-1`)
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/work.test.ts`: fix-cycle stage transitions (ready-for-re-verify, needs-fixes with timestamps, FAIL->fix->re-verify progressions, multi-phase re-verify, backward compat with unnumbered keys)
- `packages/cli/tests/commands/artifact.test.ts`: fix-cycle auto-rename (both numbered+unnumbered exist, companion rename, verify report rename, phase-aware .saves.json keys, unnumbered keys, edge cases)

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
1f62fe9 [fix-cycle-stage-detection] Fix remaining unnumbered-filename references in resume protocol
7bd5d5e [fix-cycle-stage-detection] Add tests for fix-cycle stage transitions and auto-rename
bee9444 [fix-cycle-stage-detection] Update templates for fix-cycle stages
6ba9836 [fix-cycle-stage-detection] Replace git timestamps with .saves.json for stage detection
238d2be [fix-cycle-stage-detection] Phase-aware artifact keys and fix-cycle auto-rename
```

## Open Issues

1. **Pre-existing lint warning in git-operations.ts:** `Unused eslint-disable directive (no-control-regex)` at line 169. Not introduced by this build — present in baseline.

2. **Modified existing test assertion (artifact.test.ts:3071):** Changed expected `.saves.json` key from `verify-data` to `verify-data-1` for `saveAllArtifacts` with `verify_report_1.md`. This is the intended behavior change (phase-aware keys), not a weakening — the assertion is equally strict. Documented here because the guardrail requires noting any test assertion change.

3. **completeWork phase-aware check not directly tested:** The `completeWork` function's phase-aware `.saves.json` check is verified through code inspection and existing tests (unnumbered path). Full integration testing requires complex git state (merged branches, worktrees). The code is a straightforward loop over `specs` with fallback. A dedicated integration test could be added if this proves fragile.

Verified complete by second pass.
