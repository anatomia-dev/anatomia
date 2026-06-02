# Build Report: Fix Vite Framework Detection and Service Detection Gaps

**Created by:** AnaBuild
**Date:** 2026-06-02
**Spec:** .ana/plans/active/fix-vite-framework-detection/spec.md
**Branch:** feature/fix-vite-framework-detection

## What Was Built

- `packages/cli/src/engine/types/census.ts` (modified): Added `hasMain: boolean` and `hasExports: boolean` fields to `SourceRoot` interface, following the existing `hasBin` pattern.
- `packages/cli/src/engine/census.ts` (modified): Added vite.config.ts/js/mjs to `FRAMEWORK_HINTS` (after all framework-specific configs, before Express entry points). Populated `hasMain` and `hasExports` in all three SourceRoot construction sites (fallback, single-repo, monorepo) using the `hasBin` cast pattern.
- `packages/cli/src/engine/detectors/surfaces.ts` (modified): Added vite.config.ts/js/mjs to `STRONG_FRAMEWORK_CONFIGS`. Added library guard in Signal 3 — vite config packages with `hasMain || hasExports` are excluded from surface detection. Added `resolveViteFramework()` for dep-based framework resolution of vite hints (vue → "Vue", react → "React", svelte → "Svelte", solid-js → "Solid", else null).
- `packages/cli/src/engine/detectors/node/vue.ts` (created): Vue framework detector following react.ts pattern. Guards against Nuxt. Boosts confidence with vue.config hint (0.90) or Vite presence (0.85).
- `packages/cli/src/engine/detectors/node/framework-registry.ts` (modified): Imported and registered `detectVue` at position 5 (between Express and React). Updated priority documentation.
- `packages/cli/src/engine/scan-engine.ts` (modified): Added `@modelcontextprotocol/sdk` (MCP Server, ai), `@upstash/ratelimit` (cache), `@upstash/vector` (vector-db), `@upstash/workflow` (queue) to `EXTERNAL_SERVICE_PACKAGES`.
- `packages/cli/tests/engine/detectors/surfaces.test.ts` (modified): Updated `makeRoot` with `hasMain`/`hasExports` defaults. Added 15 new tests for library guard, vite framework resolution, STRONG_FRAMEWORK_CONFIGS membership, makeRoot defaults, SourceRoot field existence, and regression.
- `packages/cli/tests/engine/detectors/node-frameworks.test.ts` (modified): Added 10 new tests for Vue detector (detection, Nuxt guard, config confidence boost, Vite confidence, disambiguation).
- `packages/cli/tests/engine/census-primary.test.ts` (modified): Updated `root()` helper with `hasMain`/`hasExports` defaults.
- `packages/cli/tests/engine/types/census.test.ts` (modified): Updated all 4 inline SourceRoot constructions with `hasMain`/`hasExports`.
- `packages/cli/tests/engine/sampling/proportional-sampler.test.ts` (modified): Updated `makeRoot()` helper with defaults.
- `packages/cli/tests/engine/detectors/applicationShape.test.ts` (modified): Updated inline SourceRoot construction with new fields.
- `packages/cli/tests/engine/detectors/documentation.test.ts` (modified): Updated `makeSourceRoot()` helper and 3 inline SourceRoot constructions.
- `packages/cli/tests/engine/detectors/dependencies.test.ts` (modified): Updated `makeRoot()` helper with defaults.

## PR Summary

- Add Vite config file recognition to census hints and surface detection, with a library guard that prevents false-positive surfaces from packages using Vite purely as a build tool (hasMain/hasExports in package.json)
- Add dep-based framework resolution for Vite surfaces — surfaces with vite.config.ts get framework labels like "Vue" or "React" based on their actual dependencies instead of being labeled "Vite"
- Create Vue framework detector for stack-level detection, with Nuxt guard to prevent double-detection
- Add MCP SDK and Upstash packages (@upstash/ratelimit, @upstash/vector, @upstash/workflow) to external service detection
- Extend SourceRoot type with hasMain/hasExports boolean fields populated from package.json during census construction

## Acceptance Criteria Coverage

- AC1 "Vue 3 + Vite framework detection" → node-frameworks.test.ts: Vue detector tests (6 assertions), surfaces.test.ts: vite hint → "Vue" resolution (1 assertion)
- AC2 "Library packages NOT detected as surfaces" → surfaces.test.ts: "library guard excludes vite config package with hasMain" + "with hasExports" (2 tests, 2 assertions)
- AC3 "Non-library vite packages ARE detected" → surfaces.test.ts: "detects package with vite.config.ts as surface" (1 assertion)
- AC4 "Dep-based framework fallback" → surfaces.test.ts: vite hint → "Vue", vite hint → "React", vite hint → null (3 tests)
- AC5 "MCP detected as service" → verified via EXTERNAL_SERVICE_PACKAGES entry (name: 'MCP Server', category: 'ai')
- AC6 "Upstash services detected" → verified via EXTERNAL_SERVICE_PACKAGES entries (3 packages)
- AC7 "No regressions" → node-frameworks.test.ts: "Next.js detection unchanged", "React guards against Next.js" (2 tests). Full suite: 3200 passed, 0 regressions.
- AC8 "Config sync" → surfaces.test.ts: "STRONG_FRAMEWORK_CONFIGS includes vite configs" (3 assertions for ts/js/mjs). Census FRAMEWORK_HINTS has 3 vite entries (verified by ordering position).
- AC9 "SourceRoot includes hasMain/hasExports" → surfaces.test.ts: field existence tests (2 tests), makeRoot defaults (2 tests)
- AC10 "All existing tests pass with updated makeRoot" → surfaces.test.ts: "existing signal tests pass with updated makeRoot" (1 test). Full suite: 3200 passed.

## Implementation Decisions

- **Library guard checks framework hints, not STRONG_FRAMEWORK_CONFIGS directly.** The guard needs to know if the strong config is specifically a vite config. It checks `census.configs.frameworkHints` for entries whose basename starts with `vite.config.` — this correctly identifies vite configs from census data rather than re-parsing file existence.
- **`resolveViteFramework` merges deps + devDeps.** Vue is typically a production dep, but some setups have it in devDeps. Merging both gives the broadest coverage without false positives (framework packages are never accidental devDeps).
- **Vue detector checks for `vite` in deps as a confidence booster** (0.85), matching how react.ts treats Vite. This is separate from the per-surface vite resolution — the Vue detector is for stack-level detection, vite resolution is for surface-level labels.
- **Service package entries added in logical groups.** MCP placed next to existing AI entries (@anthropic-ai/sdk). Upstash entries grouped with a comment before vector databases (since @upstash/vector is a vector-db).
- **Test helper updates in 7 files.** The SourceRoot type change required updating makeRoot/root() helpers in census-primary, proportional-sampler, census, documentation, applicationShape, dependencies, and surfaces test files. All use `false` defaults matching the non-library package default.

## Deviations from Contract

### A011: MCP SDK is detected as an external service
**Instead:** Verified by adding entry to EXTERNAL_SERVICE_PACKAGES map; no unit test for the detection flow
**Reason:** EXTERNAL_SERVICE_PACKAGES entries are consumed by `detectExternalServices` which requires a rootPath for config checking. The map entry is the verification — the detection flow is tested by existing integration tests.
**Outcome:** Entry present with exact name/category. Functionally equivalent.

### A012: MCP is categorized as an AI service
**Instead:** Verified by map entry value, not by running detection
**Reason:** Same as A011 — category is a property of the map entry
**Outcome:** Category is `'ai'` in the map entry. Exact match.

### A013, A014, A015: Upstash services detected
**Instead:** Verified by map entries, not by running detection flow
**Reason:** Same pattern as A011/A012
**Outcome:** All three entries present with exact names and categories.

### A019: FRAMEWORK_HINTS includes vite entries
**Instead:** Verified by census.ts code inspection and indirect test (vite hint present in test census objects produces correct framework labels)
**Reason:** FRAMEWORK_HINTS is not exported — per proof context note (fill-scan-detection-gaps-C3), no direct unit test for array ordering exists. Integration tests cover this.
**Outcome:** Three vite entries added at correct position. Intent preserved.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  131 passed (131)
     Tests  3175 passed | 2 skipped (3177)
  Duration  50.51s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  131 passed (131)
     Tests  3200 passed | 2 skipped (3202)
  Duration  52.09s
```

### Comparison
- Tests added: 25
- Tests removed: 0
- Regressions: none

### New Tests Written
- `surfaces.test.ts`: 15 new tests — library guard (hasMain excludes, hasExports excludes), vite surface detection (non-library detected), non-vite config not guarded, vite framework resolution (Vue, React, null), STRONG_FRAMEWORK_CONFIGS membership (3 vite variants), makeRoot defaults (2), SourceRoot field existence (2), regression check (1)
- `node-frameworks.test.ts`: 10 new tests — Vue detector (null when no vue, null when nuxt present, baseline detection, vue.config boost, vite boost, combined confidence), Next.js unchanged after Vue addition, React still guards Next.js, Vue/React disambiguation, Nuxt blocks Vue

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
(cd packages/cli && pnpm run lint)
```

## Git History
```
bee58019 [fix-vite-framework-detection] Add MCP and Upstash service packages
ddf127bd [fix-vite-framework-detection] Add Vue detector and register in framework registry
7040e7d5 [fix-vite-framework-detection] Add vite config entries, library guard, and framework resolution
b69bcffb [fix-vite-framework-detection] Add hasMain/hasExports to SourceRoot and census construction
```

## Open Issues

- **Pre-existing lint warning in git-operations.ts** — `Unused eslint-disable directive (no-control-regex)` at line 198. Not introduced by this build; present in baseline.
- **EXTERNAL_SERVICE_PACKAGES entries (A011-A015) not directly unit-tested.** The map is consumed by `detectExternalServices()` which requires rootPath and does filesystem config checks. Testing the map entries directly would require either exporting the map (API surface change) or mocking the filesystem. Existing integration tests cover the detection flow. Documented as deviation.
- **FRAMEWORK_HINTS ordering invariant is untested.** Per proof context (fill-scan-detection-gaps-C3), the array is not exported and has no direct unit test for ordering. The vite entries are placed after all framework-specific configs as required, but a future reordering could silently break the invariant. This is pre-existing technical debt, not introduced by this build.

Verified complete by second pass.
