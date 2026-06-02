# Spec: Fix Vite Framework Detection and Service Detection Gaps

**Created by:** AnaPlan
**Date:** 2026-06-02
**Scope:** .ana/plans/active/fix-vite-framework-detection/scope.md

## Approach

Three-layer fix targeting two diseases:

**Disease 1 — Config-only framework detection misses the modern JS ecosystem:**

1. **Census layer:** Add `hasMain` and `hasExports` boolean fields to `SourceRoot` type, populated during census construction from package.json. Add `vite.config.ts/js/mjs` entries to `FRAMEWORK_HINTS` with framework `'vite'` — placed AFTER all framework-specific configs (nuxt, svelte, vue CLI, etc.) so specific configs always shadow the generic vite hint.

2. **Surface detection layer:** Add `vite.config.ts/js/mjs` to `STRONG_FRAMEWORK_CONFIGS`. Add a library guard in Signal 3: when `hasStrongConfig` fires on a vite config, check `root.hasMain || root.hasExports` — if true, the package is a library using Vite for bundling, skip surface detection. Enhance `detectFramework` to resolve `'vite'` hints via dep-based lookup on the root's own deps.

3. **Framework detection layer:** Create a Vue detector following the react.ts pattern. Register it in the framework registry at position 5 (between Express and React). The Vue detector guards against Nuxt to prevent double-detection.

**Disease 2 — Service detection gaps:** Add MCP and missing Upstash packages to `EXTERNAL_SERVICE_PACKAGES` in scan-engine.ts.

**Key design decision — per-surface `detectFramework` gets its own dep-based resolution for `'vite'` hints.** The stack-level framework detection (framework.ts → registry) already handles deps-based framework resolution. The per-surface `detectFramework` in surfaces.ts only uses census hints today. For `'vite'` hints specifically, it needs to resolve to the actual framework (Vue/React/Svelte/etc.) using the root's own deps. This is a small inline map, not a duplication of the full registry — it maps dep names to framework display names for the specific case where the hint is `'vite'`.

## Output Mockups

After this fix, scanning a Vue 3 + Vite monorepo (hoppscotch pattern):

**Stack-level framework** (via framework registry Vue detector):
```
Framework: Vue
```

**Per-surface framework labels** (via surfaces.ts detectFramework):
```
Surface: hoppscotch-selfhost-web  Framework: Vue    (vite.config.ts + vue in deps)
Surface: hoppscotch-sh-admin      Framework: Vue    (vite.config.ts + vue in deps)
Surface: hoppscotch-desktop        Framework: Vue    (vite.config.ts + vue in deps)
```

**Library packages excluded** (library guard):
```
hoppscotch-data       — has main/exports → excluded (library)
hoppscotch-js-sandbox — has main/exports → excluded (library)
hoppscotch-kernel     — has main/exports → excluded (library)
```

**Shape resolution:** Surfaces with framework detected resolve to "web-app" instead of "unknown" via scan-engine.ts shape detection (no changes needed there — it already reads framework).

**Service detection additions:**
```
@modelcontextprotocol/sdk → MCP Server (ai)
@upstash/ratelimit        → Upstash Ratelimit (cache)
@upstash/vector           → Upstash Vector (vector-db)
@upstash/workflow          → Upstash Workflow (queue)
```

## File Changes

### `packages/cli/src/engine/types/census.ts` (modify)
**What changes:** Add `hasMain: boolean` and `hasExports: boolean` to the `SourceRoot` interface.
**Pattern to follow:** The existing `hasBin: boolean` field at line 22.
**Why:** The library guard in surface detection needs these fields to distinguish library packages (which declare `main`/`module`/`exports`) from deployable apps (which don't).

### `packages/cli/src/engine/census.ts` (modify)
**What changes:** Two areas:
1. Add `vite.config.ts`, `vite.config.js`, `vite.config.mjs` entries to `FRAMEWORK_HINTS` with framework `'vite'`. Place them AFTER all framework-specific configs but BEFORE the Express/React entry-point patterns (server.js, App.tsx).
2. Populate `hasMain` and `hasExports` in all three SourceRoot construction sites (fallback at ~line 526, single-repo at ~line 553, monorepo at ~line 566).

**Pattern to follow:** For hasMain/hasExports, follow the `hasBin` cast pattern at line 561: `!!((pkg.packageJson as unknown as Record<string, unknown>)['bin'])`. For `hasMain`, collapse `main` and `module` into one boolean: `!!pkgRaw['main'] || !!pkgRaw['module']` — matching scan-engine.ts:773. For `hasExports`: `!!pkgRaw['exports']`.
**Why:** Census must expose library markers for the surface detection library guard, and vite config discovery enables downstream framework resolution.

### `packages/cli/src/engine/detectors/surfaces.ts` (modify)
**What changes:** Three areas:
1. Add `vite.config.ts`, `vite.config.js`, `vite.config.mjs` to `STRONG_FRAMEWORK_CONFIGS`.
2. Add a library guard in Signal 3: after `hasStrongConfig` returns true, check if the config that matched is a vite config (check hints for this root where basename starts with `vite.config.`). If so, check `root.hasMain || root.hasExports` — if true, skip (it's a library). Non-vite strong configs (next.config.ts, etc.) are never guarded — they're always framework-specific.
3. Enhance `detectFramework` to resolve `'vite'` hints: when a hint has framework `'vite'`, instead of returning `getFrameworkDisplayName('vite')` (which would return "Vite" — a build tool, not a framework), resolve to the actual framework using the root's own deps. Check in order: `vue` → "Vue", `react` (without `next`) → "React", `svelte` → "Svelte", `solid-js` → "Solid". If no dep matches, return null (generic Vite project, no framework label).

**Pattern to follow:** The existing `hasStrongConfig` helper and `detectFramework` function structure.
**Why:** Without the library guard, ~18 library packages across test repos become false-positive surfaces. Without vite hint resolution, surfaces get no framework label (vite.config.ts matches STRONG_FRAMEWORK_CONFIGS but `getFrameworkDisplayName('vite')` returns a build tool name, not a framework name).

### `packages/cli/src/engine/detectors/node/vue.ts` (create)
**What changes:** New Vue framework detector following the react.ts pattern. Checks for `vue` in deps, guards against `nuxt` (which includes Vue). Checks census hints for `'vue'` framework hints (from vue.config.ts — legacy Vue CLI projects). Returns Detection with framework `'vue'`.
**Pattern to follow:** `packages/cli/src/engine/detectors/node/react.ts` — same structure: check deps, guard against parent framework, check hints, return Detection.
**Why:** Vue 3 apps with only `vue` in deps and a `vite.config.ts` (no `vue.config.ts`) need dep-based detection at the stack level.

### `packages/cli/src/engine/detectors/node/framework-registry.ts` (modify)
**What changes:** Import `detectVue` from `./vue.js`. Insert it at position 5 in `NODE_FRAMEWORK_DETECTORS` (between Express and React). Update the JSDoc priority comment.
**Pattern to follow:** Existing import and array structure.
**Why:** Vue must be checked before React (Vue apps have `vue` in deps, not `react`), but after Express (a Vue+Express SSR app should identify as Express at the stack level — Express is the runtime).

### `packages/cli/src/engine/scan-engine.ts` (modify)
**What changes:** Add entries to `EXTERNAL_SERVICE_PACKAGES`:
- `'@modelcontextprotocol/sdk': { name: 'MCP Server', category: 'ai' }`
- `'@upstash/ratelimit': { name: 'Upstash Ratelimit', category: 'cache' }`
- `'@upstash/vector': { name: 'Upstash Vector', category: 'vector-db' }`
- `'@upstash/workflow': { name: 'Upstash Workflow', category: 'queue' }`

**Pattern to follow:** Existing entries in the map. Group MCP with the ai category entries. Group Upstash with a comment near the existing Upstash entries in dependencies.ts (but these go in scan-engine.ts's EXTERNAL_SERVICE_PACKAGES, not dependencies.ts).
**Why:** These are architecturally significant dependencies that should appear in the externalServices scan output.

### `packages/cli/tests/engine/detectors/surfaces.test.ts` (modify)
**What changes:** 
1. Update `makeRoot` helper to include `hasMain: false` and `hasExports: false` as defaults.
2. Add test cases for: vite.config.ts surface detection (Signal 3 fires), library guard exclusion (hasMain/hasExports blocks surface detection), vite framework resolution in detectFramework (vue in deps → "Vue"), dep-based fallback for packages with no config file.

**Pattern to follow:** Existing test structure with `makeRoot`, `makeCensus`, `@ana` contract tags.

### `packages/cli/tests/engine/detectors/node-frameworks.test.ts` (modify)
**What changes:** Add Vue detector tests: detection with vue in deps, guard against nuxt, confidence levels with and without hints.
**Pattern to follow:** Existing React detector tests in the same file — same structure (import detector, create hints, assert Detection fields).

## Acceptance Criteria

- [x] AC1: Scanning a Vue 3 + Vite monorepo (hoppscotch pattern) detects the framework as "Vue" at both stack and surface level, and shape resolves to "web-app" instead of "unknown"
- [x] AC2: Packages with `vite.config.ts` that have `main`/`module`/`exports` in package.json (library packages) are NOT detected as surfaces — zero false positives from the library guard
- [x] AC3: Packages with `vite.config.ts` that do NOT have library markers ARE detected as surfaces
- [x] AC4: Packages with no config file at all but with `vue` or `react` in production deps get the correct framework label via dep-based fallback
- [x] AC5: `@modelcontextprotocol/sdk` is detected as service "MCP Server" (category: ai)
- [x] AC6: `@upstash/ratelimit`, `@upstash/vector`, `@upstash/workflow` are detected as services without duplicating `@upstash/redis` or `@upstash/qstash` (already in dependencies.ts)
- [x] AC7: Existing framework detection for Next.js, NestJS, Express, React, Remix, Svelte, Nuxt, Angular, Astro is unchanged — no regressions
- [x] AC8: `FRAMEWORK_HINTS` in census.ts and `STRONG_FRAMEWORK_CONFIGS` in surfaces.ts both include `vite.config.ts/js/mjs` entries
- [x] AC9: `SourceRoot` type includes `hasMain` and `hasExports` boolean fields, populated from package.json during census construction
- [x] AC10: All existing tests pass with updated `makeRoot` helper (new fields have safe defaults)
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `(cd packages/cli && pnpm run build)`
- [ ] Lint passes with `(cd packages/cli && pnpm run lint)`

## Testing Strategy

- **Unit tests (surfaces.test.ts):** Test the library guard (vite config + hasMain → excluded, vite config + no library markers → surface detected). Test vite framework resolution (vite hint + vue in deps → "Vue", vite hint + react in deps → "React", vite hint + no matching deps → null). Test that non-vite strong configs are NOT affected by the library guard.
- **Unit tests (node-frameworks.test.ts):** Test Vue detector: vue in deps → Detection with framework 'vue'. Nuxt guard: vue + nuxt in deps → null (Nuxt wins). Vue + vue.config.ts hint → higher confidence. Vue + vite hint → detection works (dep-based).
- **Regression:** All existing framework tests pass unchanged. All existing surface tests pass with makeRoot defaults.
- **Edge cases:** Package with both vue and react in deps (unlikely migration scenario) — Vue wins by priority order. Package with vite.config.ts but no framework deps — no framework label (null), still detected as surface. Package with hasMain but NOT vite config — library guard does NOT apply (guard is vite-specific).

## Dependencies

- The `fix-non-product-code-pollution` scope has already shipped and merged. `isNonProductPath` and `EXCLUDED_SEGMENTS` are already exported from surfaces.ts.
- No new npm dependencies required.

## Constraints

- Census SourceRoot type change is additive — existing code continues to compile. New boolean fields default to false in test helpers.
- `FRAMEWORK_HINTS` ordering is load-bearing. Vite entries MUST go after all framework-specific config entries.
- Engine files have zero CLI dependencies — no chalk, no ora in any modified engine file.
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Exported functions require `@param`/`@returns` JSDoc.

## Gotchas

- **`FRAMEWORK_HINTS` order is load-bearing.** First match per pattern wins in `discoverFrameworkHints`. If vite entries appear before `nuxt.config.ts`, a Nuxt project with both configs gets the `'vite'` hint first, shadowing the more specific `'nuxt'` hint. Vite entries must go after ALL framework-specific configs.
- **`STRONG_FRAMEWORK_CONFIGS` and `FRAMEWORK_HINTS` must stay in sync.** The JSDoc at surfaces.ts line 31 documents this. Adding vite to one without the other creates inconsistency.
- **The library guard is vite-specific, not generic.** Only vite configs trigger the `hasMain`/`hasExports` check. A package with `next.config.ts` and `main` in package.json is still a valid surface (Next.js libraries exist but are rare and architecturally different). Don't apply the guard to all strong configs.
- **Per-surface `detectFramework` returns display names, not internal IDs.** It calls `getFrameworkDisplayName()`. For the vite resolution path, return display names directly ("Vue", "React", etc.) — don't call `getFrameworkDisplayName('vite')` which returns "Vite" (not in the display name map, falls back to the raw key).
- **`getFrameworkDisplayName('vite')` would return `'vite'`** because there's no entry for `'vite'` in `FRAMEWORK_DISPLAY_NAMES`. The function falls back to the raw key. Don't add a `'vite'` entry — Vite isn't a framework. The per-surface detectFramework must resolve to the actual framework or return null.
- **Three SourceRoot construction sites in census.ts.** The fallback path (~line 526), single-repo path (~line 553), and monorepo path (~line 566) all need `hasMain` and `hasExports`. Missing any one creates a runtime type error in tests.
- **Vue detector and the stack-level framework detection are independent paths.** The Vue detector in the registry handles stack-level detection (what framework does this PROJECT use?). The per-surface `detectFramework` vite resolution handles surface-level detection (what framework does this SURFACE use?). Both should produce "Vue" for a Vue+Vite package, but they're invoked by different code paths.
- **`Detection` type is imported from `../python/fastapi.js`.** Follow this existing cross-language import for the Vue detector — don't create a new Detection type.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { foo } from './bar.js'`
- `import type` for type-only imports, separate from value imports
- Named exports only — no default exports
- Engine files have zero CLI dependencies
- Exported functions require `@param`/`@returns` JSDoc
- Prefer early returns over nested conditionals
- Use `| null` for checked-and-empty, `?:` for unchecked
- Empty catch blocks in engine are intentional (graceful degradation)

### Pattern Extracts

**react.ts detector pattern (the structural analog for vue.ts):**
```typescript
// packages/cli/src/engine/detectors/node/react.ts (lines 15-54)
export function detectReact(
  dependencies: string[],
  hints: FrameworkHintEntry[]
): Detection {
  const hasReact = dependencies.includes('react');
  const hasNext = dependencies.includes('next');

  if (!hasReact || hasNext) {
    return { framework: null, confidence: 0.0, indicators: [] };
  }

  const indicators: string[] = ['react in dependencies'];
  let confidence = 0.75;

  // Verify it's actually a React app via census hints
  const hasAppFile = hints.some(h => h.framework === 'react');

  if (hasAppFile) {
    confidence = 0.90;
    indicators.push('App.tsx/jsx found (React SPA)');
  }

  // Check for React build tools
  const hasVite = dependencies.includes('vite');
  const hasCRA = dependencies.includes('react-scripts');

  if (hasVite) {
    indicators.push('Vite (React build tool)');
    confidence = Math.max(confidence, 0.85);
  } else if (hasCRA) {
    indicators.push('Create React App');
    confidence = Math.max(confidence, 0.90);
  }

  return {
    framework: 'react',
    confidence,
    indicators,
  };
}
```

**hasBin cast pattern in census.ts (the pattern for hasMain/hasExports):**
```typescript
// packages/cli/src/engine/census.ts (lines 561, 577)
hasBin: !!((pkg.packageJson as unknown as Record<string, unknown>)['bin']),
scripts: Object.keys(((pkg.packageJson as unknown as Record<string, unknown>)['scripts'] as Record<string, unknown> | null) ?? {}),
```

**makeRoot helper (needs hasMain/hasExports defaults):**
```typescript
// packages/cli/tests/engine/detectors/surfaces.test.ts (lines 24-36)
function makeRoot(overrides: Partial<SourceRoot> & { relativePath: string }): SourceRoot {
  return {
    absolutePath: `/tmp/project/${overrides.relativePath}`,
    relativePath: overrides.relativePath,
    packageName: overrides.packageName ?? overrides.relativePath.split('/').pop() ?? null,
    fileCount: overrides.fileCount ?? 100,
    isPrimary: overrides.isPrimary ?? false,
    deps: overrides.deps ?? {},
    devDeps: overrides.devDeps ?? {},
    hasBin: overrides.hasBin ?? false,
    scripts: overrides.scripts ?? [],
  };
}
```

### Proof Context

**surfaces.ts:**
- (scan-surface-detection-C5) `deriveRawName` @scope branch unreachable for standard monorepo layouts — not affected by this change.
- Build concern: "Signal 4 surfaces show framework: null — detectFramework only recognizes config-file-based frameworks" — this is exactly the disease being cured by the vite hint resolution enhancement.

**census.ts:**
- (fill-scan-detection-gaps-C3) `FRAMEWORK_HINTS` is not exported — no direct unit test for array ordering. Integration tests cover this. Be aware the ordering invariant is tested indirectly.
- Build concern: "react-router.config.js moved from original position" — ordering changes have happened before. Follow existing ordering conventions carefully.

**No active findings for:** types/census.ts, framework-registry.ts, scan-engine.ts EXTERNAL_SERVICE_PACKAGES section.

### Checkpoint Commands

- After `types/census.ts` + `census.ts` changes: `(cd packages/cli && pnpm vitest run)` — Expected: 3175+ tests pass (type changes are additive, tests need makeRoot update first)
- After `surfaces.ts` + test updates: `(cd packages/cli && pnpm vitest run)` — Expected: all existing tests pass + new tests pass
- After all changes: `pnpm run test -- --run` — Expected: 3175+ existing tests + ~15-20 new tests pass
- Lint: `(cd packages/cli && pnpm run lint)`

### Build Baseline
- Current tests: 3175 passed (2 skipped) in 131 test files
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~3190-3195 tests in 131 test files (no new test files — tests added to existing files)
- Regression focus: `surfaces.test.ts` (makeRoot change affects all tests), `node-frameworks.test.ts` (new Vue tests alongside existing)
