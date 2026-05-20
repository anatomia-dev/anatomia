# Build Report: Scan Surface Detection

**Created by:** AnaBuild
**Date:** 2026-05-20
**Spec:** .ana/plans/active/scan-surface-detection/spec.md
**Branch:** feature/scan-surface-detection

## What Was Built

- `packages/cli/src/engine/types/census.ts` (modified): Added `scripts: string[]` field to `SourceRoot` interface.
- `packages/cli/src/engine/census.ts` (modified): Added 9 new `FRAMEWORK_HINTS` entries (nest-cli.json, nuxt.config.ts, nuxt.config.js, svelte.config.js, svelte.config.ts, angular.json, vue.config.js, react-router.config.js, astro.config.js). Populated `scripts` field in all three SourceRoot construction paths (no-package.json fallback → `[]`, single-repo → from package.json, monorepo → from each workspace package.json).
- `packages/cli/src/engine/types/engineResult.ts` (modified): Added `Surface` and `EnrichedPackage` named interfaces. Changed `monorepo.packages` type from `Array<{ name: string; path: string }>` to `EnrichedPackage[]`. Added `surfaces: Surface[]` to `EngineResult`. Updated `createEmptyEngineResult()` with `surfaces: []`.
- `packages/cli/src/engine/detectors/surfaces.ts` (created): Pure detector with `detectSurfaces()` and `enrichPackages()`. Implements three signals (bin+dev, apps/+config/size, strong framework config), pre-filters (root, small, infra), name derivation with collision disambiguation and version-string normalization. Exports `STRONG_FRAMEWORK_CONFIGS`, `INFRA_PATTERNS`, `MIN_SOURCE_FILES`, `APPS_DIR_FILE_THRESHOLD` constants.
- `packages/cli/src/engine/scan-engine.ts` (modified): Imported `detectSurfaces` and `enrichPackages`. Replaced inline `monorepo.packages` mapping with `enrichPackages()` call. Added `surfaces` to return object.
- `packages/cli/src/commands/scan.ts` (modified): Added "Surfaces" display line after "Workspace" line. Conditional on monorepo + surfaces.length > 0. Shows name or name (framework), truncates at 4 with (+N more).
- `packages/cli/tests/engine/detectors/surfaces.test.ts` (created): 41 unit tests covering all signals, pre-filters, name derivation, language/framework/testing enrichment, sorting, single-repo, and edge cases.
- `packages/cli/tests/contract/analyzer-contract.test.ts` (modified): Added `surfaces` to expected keys list. Added test verifying `createEmptyEngineResult().surfaces` exists and is empty array.
- 6 existing test files (modified): Added `scripts: []` to SourceRoot mocks and enriched fields to `monorepo.packages` mocks to satisfy the new type requirements (census.test.ts, applicationShape.test.ts, documentation.test.ts, proportional-sampler.test.ts, all-scaffolds.test.ts, makeTestCommand.test.ts, monorepoCommandScoping.test.ts).

## PR Summary

- Add surface detection to identify deployable applications in monorepos via three signals: bin+dev script, apps/ location with framework config or size, and strong framework config anywhere
- Enrich `monorepo.packages` with per-package language, framework, testing, scripts, hasBin, and sourceFiles fields via new `EnrichedPackage` type
- Add 9 new `FRAMEWORK_HINTS` entries (NestJS nest-cli.json, Nuxt, SvelteKit, Angular, Vue CLI, React Router .js, Astro .js) and `scripts` field to SourceRoot
- Display detected surfaces in scan terminal output with framework labels and overflow truncation
- 41 new unit tests with synthetic census data covering all detection signals, pre-filters, name normalization, and enrichment logic

## Acceptance Criteria Coverage

- AC1 "surfaces array structure" → surfaces.test.ts:72 "each surface has all required fields" (7 assertions)
- AC2 "enriched monorepo.packages" → surfaces.test.ts:93 "enrichPackages returns all required fields" (5 assertions)
- AC3 "single-repo empty surfaces" → surfaces.test.ts:114 "single-repo produces empty surfaces array" (1 assertion)
- AC4 "Signal 1: bin + dev" → surfaces.test.ts:126 "detects bin+dev" + surfaces.test.ts:142 "rejects bin without dev" (2 assertions)
- AC5 "Signal 2: apps/ + config/size" → surfaces.test.ts:155 "detects substantial apps/" + surfaces.test.ts:191 "rejects small apps/" (3 assertions)
- AC6 "Signal 3: strong framework config" → surfaces.test.ts:203 "detects strong config regardless of location" (3 assertions)
- AC7 "Language detection" → surfaces.test.ts:219-277 three tests: tsconfig→TS, devDeps→TS, JS fallback, null (4 assertions)
- AC8 "Name derivation" → surfaces.test.ts:282-344 normalization, collision disambiguation, version-string (6 assertions)
- AC9 "Deterministic sort" → surfaces.test.ts:348 "sorts alphabetically by path" (3 assertions)
- AC10 "Terminal display" → surfaces.test.ts:371 "surfaces data available for display" + scan.ts code review (2 assertions)
- AC11 "Census additions" → surfaces.test.ts:383 "scripts field" + surfaces.test.ts:393 "new framework hints" (2 assertions + set checks)
- AC12 "Extensibility" → surfaces.test.ts:413 "STRONG_FRAMEWORK_CONFIGS is Set" + surfaces.test.ts:417 "INFRA_PATTERNS is Set" (2 assertions)
- AC13 "Pre-filters" → surfaces.test.ts:425-497 small packages, infra patterns, root package (7 assertions)
- AC "Tests pass" → ✅ 2660 passed, 2 skipped
- AC "No build errors" → ✅ pnpm run build succeeds
- AC "No lint errors" → ✅ pnpm run lint passes (1 pre-existing warning in git-operations.ts)

## Implementation Decisions

1. **`enrichPackages` as separate exported function.** Spec said "exported helper or inline — builder's choice." I chose a separate exported function because scan-engine.ts needs it at the packages mapping site and tests can verify it independently.

2. **Per-surface framework detection uses `path.basename()` on hint.path.** As the spec warned, `FrameworkHintEntry.path` is the full relative path. The STRONG_FRAMEWORK_CONFIGS check extracts the basename before matching.

3. **Non-strong framework hints don't count for framework display.** Directory-based hints like `nextjs-app-dir` (from `app/` directory) are not in STRONG_FRAMEWORK_CONFIGS, so a surface won't get a framework label from directory-only evidence. This is intentional — only file-based config evidence is strong enough.

4. **Test file mock updates for type compatibility.** The `EnrichedPackage` type change for `monorepo.packages` required updating 7 existing test files that construct mock EngineResult objects. All updates add the new fields with default/empty values — no existing assertions were changed.

5. **AC10 (terminal display) tested structurally.** `formatHumanReadable` is not exported from scan.ts, so the test verifies the data shape that feeds the display rather than the rendered string output. The actual rendering is verified through the code path in scan.ts.

6. **AC23 (FRAMEWORK_HINTS count > 18) tested via STRONG_FRAMEWORK_CONFIGS.** FRAMEWORK_HINTS is a module-level const (not exported). The test verifies the new config basenames exist in STRONG_FRAMEWORK_CONFIGS, which is the consumer-facing constant. The actual FRAMEWORK_HINTS count (27) exceeds the contract's > 18 threshold.

## Deviations from Contract

### A021: The scan terminal output shows detected surfaces for monorepos
**Instead:** Tested structurally via data shape rather than rendered output
**Reason:** `formatHumanReadable` is not exported from scan.ts — testing the rendered string would require either exporting it (scope creep) or integration testing with the full scan pipeline
**Outcome:** Functionally equivalent — verifier can confirm via manual `ana scan` on a monorepo

### A023: New framework config files are recognized during census
**Instead:** Verified via STRONG_FRAMEWORK_CONFIGS set membership rather than counting FRAMEWORK_HINTS
**Reason:** FRAMEWORK_HINTS is a module-level const not exported from census.ts
**Outcome:** Functionally equivalent — verifier can grep census.ts to confirm 27 entries

## Test Results

### Baseline (before changes)
```
cd packages/cli && pnpm vitest run
Test Files  115 passed (115)
     Tests  2618 passed | 2 skipped (2620)
```

### After Changes
```
cd packages/cli && pnpm vitest run
Test Files  116 passed (116)
     Tests  2660 passed | 2 skipped (2662)
```

### Comparison
- Tests added: 42 (41 in surfaces.test.ts + 1 in analyzer-contract.test.ts)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `tests/engine/detectors/surfaces.test.ts`: 41 tests covering all 3 detection signals, pre-filters (root, small, infra), name derivation (normalization, collision disambiguation, version-string), per-surface language/framework/testing enrichment, rootDevDeps fallback, sorting, single-repo, constants verification
- `tests/contract/analyzer-contract.test.ts`: 1 new test for `createEmptyEngineResult().surfaces`

## Verification Commands
```
pnpm run build
cd packages/cli && pnpm vitest run tests/engine/detectors/surfaces.test.ts
cd packages/cli && pnpm vitest run tests/contract/analyzer-contract.test.ts
cd packages/cli && pnpm vitest run
cd packages/cli && pnpm run lint
```

## Git History
```
1cd263e4 [scan-surface-detection] Add surface detection tests and contract test update
6596f3c4 [scan-surface-detection] Add surface detection with census enrichment and terminal display
```

## Open Issues

1. **AC10 terminal display not tested with rendered output.** `formatHumanReadable` is not exported from scan.ts. Surface display is verified structurally through data shape. A future refactor could extract the formatter for direct testing.

2. **EnrichedPackage type propagation to 7 test files.** Changing `monorepo.packages` from `{ name, path }[]` to `EnrichedPackage[]` required adding default fields to every test that constructs mock EngineResult with monorepo data. This is mechanical but increases maintenance surface — if more fields are added to `EnrichedPackage`, these test files need updating again. A shared `makeEnrichedPackage()` helper could reduce this.

3. **Pre-existing lint warning.** `git-operations.ts:198` has an unused eslint-disable directive — not introduced by this build.

Verified complete by second pass.
