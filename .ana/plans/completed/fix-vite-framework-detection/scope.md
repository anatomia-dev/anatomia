# Scope: Fix Vite Framework Detection and Service Detection Gaps

**Created by:** Ana
**Date:** 2026-06-02

## Intent

The scanner's framework detection is config-file-only. Modern Vue 3 and React+Vite apps use `vite.config.ts` — not framework-specific config files like `vue.config.ts` (legacy Vue CLI) or `next.config.ts`. Some don't use any config file at all (hoppscotch-common runs `vite` directly via script). This makes major open-source repos invisible: hoppscotch (70K stars) shows no framework, "unknown" shape, and 4 missing surfaces. novu's 1416-file React dashboard has no framework label. twenty's 7794-file React frontend is invisible as a surface.

The service detection map also has gaps: MCP (`@modelcontextprotocol/sdk`) is architecturally significant but undetected as a service, and Upstash has partial coverage (redis and qstash detected, but ratelimit/vector/workflow missing).

This is the second of three scan accuracy fixes. The first (fix-non-product-code-pollution) ships before this and adds `isNonProductPath` filtering and `EXCLUDED_SEGMENTS`. That fix will have merged before this ships — surfaces.ts will already have those constants exported.

## Complexity Assessment

- **Kind:** fix
- **Size:** medium — 8-10 files changed, one new file (Vue detector), census type extension, but all changes follow established patterns
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/types/census.ts` — add `hasMain`, `hasExports` to `SourceRoot`
  - `packages/cli/src/engine/census.ts` — read `main`/`module`/`exports` from package.json during SourceRoot construction; add `vite.config.ts/js/mjs` to `FRAMEWORK_HINTS`
  - `packages/cli/src/engine/detectors/surfaces.ts` — add `vite.config.ts/js/mjs` to `STRONG_FRAMEWORK_CONFIGS` with library guard in Signal 3; update `detectFramework` to handle `'vite'` hints with dep-based resolution
  - `packages/cli/src/engine/detectors/node/vue.ts` — new file: Vue framework detector (follows existing per-framework pattern)
  - `packages/cli/src/engine/detectors/node/framework-registry.ts` — register Vue detector in priority array
  - `packages/cli/src/engine/scan-engine.ts` — add entries to `EXTERNAL_SERVICE_PACKAGES`
  - `packages/cli/tests/engine/detectors/surfaces.test.ts` — test cases for vite.config.ts surface detection with library guard
  - New test file or additions for Vue detector and dep-based fallback
- **Blast radius:** Framework detection feeds shape detection (via scan-engine.ts:774-779) and surface framework labels. Adding `vite.config.ts` to STRONG_FRAMEWORK_CONFIGS will create new surfaces for packages that were previously invisible — this is the intended fix, but the library guard must prevent false positives from library packages using Vite for bundling. Census SourceRoot type change affects all consumers of SourceRoot, but the new fields are additive (existing code doesn't break, tests need `makeRoot` helper updated).
- **Estimated effort:** 1-2 days
- **Multi-phase:** no

## Approach

Two diseases, one scope:

**Disease 1: Config-only framework detection misses the modern JS ecosystem.** The scanner requires a framework-specific config file (next.config.ts, vue.config.ts) to identify a framework. But modern Vue 3, React+Vite, Svelte, and Solid apps use `vite.config.ts` — a build-tool config, not a framework config. And some apps (hoppscotch-common) have no config file at all. Fix by: (1) adding `vite.config.ts` as a framework signal with a library guard to prevent false positives, and (2) adding dep-based framework resolution as a fallback when no config file exists.

**Disease 2: Service detection map has gaps for architecturally significant dependencies.** MCP is undetected. Upstash has partial coverage. Fix by adding entries to the existing map — straightforward, follows the established pattern.

The library guard is the critical safety mechanism for Disease 1. Verified across 10 scanned repos: library packages that use `vite.config.ts` for bundling (not as deployable apps) have `main`/`module`/`exports` fields in their package.json. Deployable apps do not. The guard: when Signal 3 fires on `vite.config.ts`, check if the package has library markers (`hasMain` or `hasExports` on SourceRoot). If yes, it's a library — skip surface detection. This correctly excludes hoppscotch-data, hoppscotch-js-sandbox, hoppscotch-kernel (libraries) while keeping hoppscotch-selfhost-web, hoppscotch-sh-admin, hoppscotch-desktop, novu dashboard (apps). Verified: zero false positives, zero false negatives across all 10 repos.

The dep-based fallback adds a Vue detector (and enhances the existing React detector pattern) in the node framework registry. When no config-based framework is found, deps provide the signal: `vue` in deps = Vue, `react` in deps = React (when no Next.js config), etc. This lives in the framework detection layer so both stack-level and per-surface detection benefit.

Census maps `vite.config.ts` to a generic `'vite'` hint. Resolution to the actual framework (Vue/React/etc.) happens at detection time using deps — census stays simple (file presence only, no dep reading for hints).

## Acceptance Criteria

- AC1: Scanning a Vue 3 + Vite monorepo (hoppscotch pattern) detects the framework as "Vue" at both stack and surface level, and shape resolves to "web-app" instead of "unknown"
- AC2: Packages with `vite.config.ts` that have `main`/`module`/`exports` in package.json (library packages) are NOT detected as surfaces — zero false positives from the library guard
- AC3: Packages with `vite.config.ts` that do NOT have library markers ARE detected as surfaces
- AC4: Packages with no config file at all but with `vue` or `react` in production deps get the correct framework label via dep-based fallback
- AC5: `@modelcontextprotocol/sdk` is detected as service "MCP Server" (category: ai)
- AC6: `@upstash/ratelimit`, `@upstash/vector`, `@upstash/workflow` are detected as services without duplicating `@upstash/redis` or `@upstash/qstash` (already in dependencies.ts)
- AC7: Existing framework detection for Next.js, NestJS, Express, React, Remix, Svelte, Nuxt, Angular, Astro is unchanged — no regressions
- AC8: `FRAMEWORK_HINTS` in census.ts and `STRONG_FRAMEWORK_CONFIGS` in surfaces.ts both include `vite.config.ts/js/mjs` entries
- AC9: `SourceRoot` type includes `hasMain` and `hasExports` boolean fields, populated from package.json during census construction
- AC10: All existing tests pass with updated `makeRoot` helper (new fields have safe defaults)

## Edge Cases & Risks

- **Library false positives are the highest risk.** Without the guard, ~18 library packages across 10 test repos would become false-positive surfaces. The `hasMain`/`hasExports` guard eliminates all 18. Risk: a library that doesn't declare `main`/`module`/`exports` would be misclassified as a surface. Mitigation: this is non-standard for published npm libraries — all observed libraries in the test set declare at least one of these fields.
- **vite.config.ts is framework-ambiguous.** Unlike `next.config.ts` (always Next.js), `vite.config.ts` could be Vue, React, Svelte, Solid, or vanilla. The dep-based resolution handles this, but if both `vue` and `react` are in deps (unlikely but possible in migration repos), the priority order in the framework registry determines the winner.
- **twenty-front edge case.** 7794 files, deployable React app, has `vite.config.ts`, no `main`/`exports` (correctly NOT excluded by library guard), but no `dev` script. It should be detected via Signal 3 (strong framework config) after this fix. AnaPlan should verify.
- **Census type change is additive but wide.** Adding `hasMain`/`hasExports` to SourceRoot touches the type definition and all construction sites in census.ts (3 code paths: single-repo, monorepo-fallback, monorepo-packages). All test helpers that construct SourceRoot need defaults. Risk is low (additive fields with boolean defaults) but the surface area is broad.
- **Vue detector priority.** Vue must be checked before React in the framework registry (Vue apps don't have `react` in deps, but the priority order matters for future frameworks). Must not interfere with NestJS or Express detection.

## Rejected Approaches

**Part A: CLI shape detection and primary selection changes.** The REQ includes CLI package detection in monorepos (shadcn classified as web-app). Excluded because: (1) primary selection changes cascade through shape, deploy, framework identity, and all generators — much higher blast radius; (2) the redundant review recommends deferring primary selection changes; (3) it solves a different disease (identity detection, not framework detection). Separate scope if it earns priority.

**Doc framework detection (fumadocs, nextra, etc.) as services.** The REQ considers adding doc frameworks to `EXTERNAL_SERVICE_PACKAGES`. Excluded because: docs frameworks aren't "services" in the way Stripe or Sentry are — they're frameworks. Adding a new `docs` stack field would be more correct but requires schema changes for marginal signal. Not worth the cost.

**Jest testing aggregation fix.** The REQ notes Jest is detected per-surface but missing from the stack-level testing array. Excluded because: separate code path (stack aggregation in scan-engine.ts), separate concern, should be its own fix.

**Tauri detection.** Niche — relevant for desktop app repos but doesn't affect the core framework detection disease.

**Library guard via script-based check instead of main/exports.** An alternative guard: libraries have `build` but not `dev` scripts. Rejected because twenty-front is a deployable app with no `dev` script — script-based guard would create a false negative. The `main`/`module`/`exports` guard is more reliable: it tests what a package IS (a library that exports modules) rather than what scripts it has.

**Dep-based fallback in surfaces.ts only.** Would fix per-surface framework labels but leave the stack-level banner broken (hoppscotch would still show no framework). The fallback must live in the framework detection layer where both stack-level and per-surface detection can use it.

## Open Questions

None — all investigation items resolved during scoping. Design judgment questions for AnaPlan listed in the For AnaPlan section.

## Exploration Findings

### Patterns Discovered

- `surfaces.ts:205-217`: Per-surface `detectFramework` filters census hints by sourceRootPath, then checks basenames against `STRONG_FRAMEWORK_CONFIGS`. This function needs to handle the new `'vite'` hint by resolving it to the actual framework via deps.
- `census.ts:31-78`: `FRAMEWORK_HINTS` is ordered — first match per pattern wins. Vite entries should go after all framework-specific configs so they don't shadow framework configs.
- `node/framework-registry.ts:51-58`: Priority array is the single source of truth. Vue detector slots in before React (position 5, pushing React to 6).
- `node/react.ts:18-23`: React detector already guards against Next.js (`hasNext` check). Vue detector should similarly guard against Nuxt (which includes Vue).
- `census.ts:559,575`: Two monorepo SourceRoot construction sites read `bin` from package.json via cast. Same pattern extends to `main`/`module`/`exports`.
- `scan-engine.ts:766-772`: Stack-level shape detection reads `hasMain`/`hasExports` from primary root's package.json directly (not from census). After this fix, census SourceRoot will have these fields — scan-engine could use them instead, but that's a cleanup, not a requirement.

### Constraints Discovered

- [TYPE-VERIFIED] `SourceRoot` has no `hasMain`/`hasExports` (types/census.ts:14-24) — must be added for the library guard
- [TYPE-VERIFIED] `FRAMEWORK_HINTS` and `STRONG_FRAMEWORK_CONFIGS` are separate lists that must stay in sync (surfaces.ts JSDoc at line 31)
- [OBSERVED] Census reads package.json via `@manypkg/get-packages` which exposes `packageJson` as a typed object — `main`/`module`/`exports` require cast to `Record<string, unknown>`, same pattern as `bin` (census.ts:559)
- [OBSERVED] Per-surface `detectFramework` in surfaces.ts is independent from the main `detectFramework` in framework.ts — they serve different purposes (surface labels vs. stack identity) but should produce consistent results

### Test Infrastructure

- `tests/engine/detectors/surfaces.test.ts`: Uses `makeRoot()` and `makeCensus()` helpers to build synthetic census objects. `makeRoot` needs `hasMain`/`hasExports` with `false` defaults. Tests use `@ana` contract tags.

## For AnaPlan

### Structural Analog

`packages/cli/src/engine/detectors/node/react.ts` — closest structural match for the Vue detector. Same shape: check deps, guard against parent framework (Next.js for React, Nuxt for Vue), check census hints, return Detection. The Vue detector follows this pattern exactly.

### Relevant Code Paths

- `packages/cli/src/engine/detectors/surfaces.ts` — Signal 3 (line 312) is where the library guard goes. `detectFramework` (line 205) is where `'vite'` hint resolution goes.
- `packages/cli/src/engine/census.ts` — SourceRoot construction at lines 532, 551-561, 564-578. `FRAMEWORK_HINTS` at lines 31-78. `discoverFrameworkHints` at lines 259-284.
- `packages/cli/src/engine/detectors/node/framework-registry.ts` — Vue detector registration.
- `packages/cli/src/engine/detectors/framework.ts` — main framework detector dispatches to node registry. No changes needed here — Vue detector is added via registry.
- `packages/cli/src/engine/scan-engine.ts` — `EXTERNAL_SERVICE_PACKAGES` at lines 145-200 for service additions. Lines 766-772 read `hasMain`/`hasExports` from package.json directly — after this fix, census SourceRoot has these fields but scan-engine's direct read is not broken (just redundant).
- `packages/cli/src/engine/types/census.ts` — `SourceRoot` interface at line 14.

### Patterns to Follow

- `packages/cli/src/engine/detectors/node/react.ts` — one file per framework detector, exports single function, guards against parent framework
- `packages/cli/src/engine/census.ts:559` — how `hasBin` is read from package.json (cast pattern for `main`/`module`/`exports`)
- `packages/cli/tests/engine/detectors/surfaces.test.ts:24-36` — `makeRoot` helper pattern for synthetic SourceRoot construction

### Known Gotchas

- `FRAMEWORK_HINTS` order matters — vite entries must go AFTER all framework-specific configs. If vite is listed before `nuxt.config.ts`, a Nuxt project with both configs would get `'vite'` hint first and miss the more specific `'nuxt'` hint.
- The per-surface `detectFramework` in surfaces.ts currently only checks basenames against `STRONG_FRAMEWORK_CONFIGS`. Adding `'vite'` means it needs dep-based resolution for that specific hint — it can't just return `getFrameworkDisplayName('vite')` because "Vite" is a build tool, not a framework.
- `scan-engine.ts:766-772` already reads `hasMain`/`hasExports` from primary root's package.json for shape detection. Don't duplicate or conflict — the census SourceRoot fields are for surface detection's library guard. Scan-engine's direct read can be cleaned up later but is not in scope.

### Things to Investigate

- Exact priority position for Vue detector relative to Express. Vue apps can include Express for SSR (`vue` + `express` in deps). If Vue is at position 5 (before Express at 4... wait, Express is at 4), check whether a Vue+Express app should be classified as Vue or Express. The answer is Vue — Express is the server, Vue is the framework.
- Whether the per-surface `detectFramework` in surfaces.ts should share fallback logic with the main framework detection layer, or have its own dep-based resolution. Currently they're independent — the per-surface version only uses census hints. Dep-based fallback may need to be available in both places. Design this so the logic isn't duplicated.
- Confirm twenty-front (7794 files, vite.config.ts, no library markers, no dev script) gets detected as a surface after these changes. Signal 3 should fire: strong framework config + no library guard exclusion. Verify against the actual twenty package.json structure.
