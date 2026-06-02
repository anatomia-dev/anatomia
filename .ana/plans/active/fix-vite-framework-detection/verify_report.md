# Verify Report: Fix Vite Framework Detection and Service Detection Gaps

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-02
**Spec:** .ana/plans/active/fix-vite-framework-detection/spec.md
**Branch:** feature/fix-vite-framework-detection

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/fix-vite-framework-detection/.ana/plans/active/fix-vite-framework-detection/contract.yaml
  Seal: INTACT (hash sha256:f07336a74e725e54a0ac67c6faf50cbdef1525ba4a70c3016348e26e836d74a4)
```

Tests: 3200 passed, 0 failed, 2 skipped (131 files). Build: success. Lint: 0 errors (1 pre-existing warning in git-operations.ts, unrelated).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Vue apps are detected as Vue at the stack level | ✅ SATISFIED | `node-frameworks.test.ts:240-245` — `detectVue(['vue'], [])` asserts `framework === 'vue'` |
| A002 | Vue detection is blocked when Nuxt is present | ✅ SATISFIED | `node-frameworks.test.ts:235-238` — `detectVue(['vue', 'nuxt'], [])` asserts `framework === null` |
| A003 | Vue detection confidence increases with config file evidence | ✅ SATISFIED | `node-frameworks.test.ts:248-253` — `detectVue(['vue'], [hint('vue', 'vue.config.ts')])` asserts `confidence === 0.90` (> 0.75) |
| A004 | Library packages with vite config are not detected as surfaces | ✅ SATISFIED | `surfaces.test.ts:1308-1324` — `hasMain: true` + vite.config.ts → `surfaces.length === 0` |
| A005 | Library packages with exports field are not detected as surfaces | ✅ SATISFIED | `surfaces.test.ts:1328-1344` — `hasExports: true` + vite.config.ts → `surfaces.length === 0` |
| A006 | Deployable apps with vite config are detected as surfaces | ✅ SATISFIED | `surfaces.test.ts:1287-1304` — no library markers + vite.config.ts → `surfaces.length === 1` |
| A007 | The library guard only applies to vite configs, not other framework configs | ✅ SATISFIED | `surfaces.test.ts:1348-1364` — `next.config.ts` + `hasMain: true` → `surfaces.length === 1` |
| A008 | Surfaces with vite config and Vue deps get the Vue framework label | ✅ SATISFIED | `surfaces.test.ts:1370-1386` — vite hint + `vue: '3.4.0'` → `framework === 'Vue'` |
| A009 | Surfaces with vite config and React deps get the React framework label | ✅ SATISFIED | `surfaces.test.ts:1390-1406` — vite hint + `react: '18.2.0'` → `framework === 'React'` |
| A010 | Surfaces with vite config but no framework deps get no framework label | ✅ SATISFIED | `surfaces.test.ts:1410-1425` — vite hint, no deps → `framework === null` |
| A011 | MCP SDK is detected as an external service | ✅ SATISFIED | Source inspection: `scan-engine.ts:163` — `'@modelcontextprotocol/sdk': { name: 'MCP Server', category: 'ai' }` |
| A012 | MCP is categorized as an AI service | ✅ SATISFIED | Source inspection: `scan-engine.ts:163` — `category: 'ai'` |
| A013 | Upstash Ratelimit is detected as an external service | ✅ SATISFIED | Source inspection: `scan-engine.ts:182` — `'@upstash/ratelimit': { name: 'Upstash Ratelimit', category: 'cache' }` |
| A014 | Upstash Vector is detected as a vector database service | ✅ SATISFIED | Source inspection: `scan-engine.ts:183` — `'@upstash/vector': { name: 'Upstash Vector', category: 'vector-db' }` |
| A015 | Upstash Workflow is detected as a queue service | ✅ SATISFIED | Source inspection: `scan-engine.ts:184` — `'@upstash/workflow': { name: 'Upstash Workflow', category: 'queue' }` |
| A016 | Next.js detection is unchanged after adding Vue and vite support | ✅ SATISFIED | `node-frameworks.test.ts:298-302` — `detectNextjs(['next', 'react'], [hint])` → `framework === 'nextjs'` |
| A017 | React detection still guards against Next.js | ✅ SATISFIED | `node-frameworks.test.ts:305-308` — `detectReact(['next', 'react'], [])` → `framework === null` |
| A018 | Vite config files are recognized as strong framework indicators | ✅ SATISFIED | `surfaces.test.ts:1429-1438` — `STRONG_FRAMEWORK_CONFIGS.has('vite.config.ts')` → `true`, same for .js and .mjs |
| A019 | Vite config files are recognized as framework hints during census | ✅ SATISFIED | Source inspection: `census.ts:68-70` — 3 vite entries in FRAMEWORK_HINTS (not exported, cannot be unit-tested directly; see fill-scan-detection-gaps-C3) |
| A020 | Census source roots include library marker fields | ✅ SATISFIED | `surfaces.test.ts:1454-1458` — `makeRoot({ hasMain: true })` → `root.hasMain === true` |
| A021 | Census source roots track package exports declarations | ✅ SATISFIED | `surfaces.test.ts:1459-1462` — `makeRoot({ hasExports: true })` → `root.hasExports === true` |
| A022 | Test helper defaults keep all existing tests passing | ✅ SATISFIED | `surfaces.test.ts:1442-1451` — `makeRoot({}).hasMain === false`, `makeRoot({}).hasExports === false` |
| A023 | Existing surface detection tests pass with new SourceRoot fields | ✅ SATISFIED | `surfaces.test.ts:1466-1478` — Signal 1 test with new defaults → `surfaces.length > 0` |
| A024 | Vue detection works with Vite as the build tool | ✅ SATISFIED | `node-frameworks.test.ts:256-261` — `detectVue(['vue', 'vite'], [])` → `framework === 'vue'`, confidence 0.85 |

## Independent Findings

**Prediction resolution:**

1. **Vue+React edge case (per-surface):** Partially confirmed. The registry-level test exists (`node-frameworks.test.ts:311-318` tests both detectors independently). But `resolveViteFramework` in surfaces.ts has no test for a root with both `vue` and `react` in deps — Vue wins by array order, but this is untested at the surface level.

2. **Library guard string check:** Not a problem. Uses `path.basename(h.path).startsWith('vite.config.')` which is correct and not fragile — it matches the 3 known extensions (.ts, .js, .mjs).

3. **Hard-coded dep lookup in resolveViteFramework:** Confirmed as intentional. The spec explicitly calls this out: "small inline map, not a duplication of the full registry." The map handles vue, react (with next guard), svelte, solid-js. Missing: preact, qwik, lit, and other Vite-compatible frameworks.

4. **FRAMEWORK_HINTS ordering:** Correct. Vite entries at lines 68-70, after all framework-specific configs (Next, Remix, Astro, NestJS, SvelteKit, Nuxt, Angular, Vue CLI) and before Express/React entry points.

5. **Census construction consistency:** All four construction sites have hasMain and hasExports with consistent patterns. The fallback site at line 539 uses a slightly different cast (`fallbackRootPackage as Record<string, unknown> | null` with optional chaining) vs the pkg sites which use `pkg.packageJson as unknown as Record<string, unknown>` — both are correct for their respective types.

**Surprise finding:** Signal 2 (apps/ directory at line 340-344) does NOT apply the library guard. A library package under `apps/` with `vite.config.ts` and `hasMain: true` would still be detected as a surface. This is arguably correct — `apps/` is a conventional directory for deployable apps, and the library guard is designed for `packages/`. But it's worth noting.

## AC Walkthrough

- [x] **AC1:** Vue 3 + Vite detection at stack and surface level → ✅ PASS — `detectVue` returns `framework: 'vue'` (stack), `resolveViteFramework` returns `'Vue'` (surface). Tests at node-frameworks.test.ts:240 and surfaces.test.ts:1370.
- [x] **AC2:** Library guard prevents false positives → ✅ PASS — `hasMain` and `hasExports` both trigger exclusion. Tests at surfaces.test.ts:1308 and 1328.
- [x] **AC3:** Non-library vite packages detected as surfaces → ✅ PASS — Test at surfaces.test.ts:1287 confirms `surfaces.length === 1` without library markers.
- [x] **AC4:** Dep-based framework resolution → ✅ PASS — Vue, React, and null cases tested at surfaces.test.ts:1370, 1390, 1410.
- [x] **AC5:** MCP service detection → ✅ PASS — Entry at scan-engine.ts:163 with name 'MCP Server' and category 'ai'.
- [x] **AC6:** Upstash service detection → ✅ PASS — Three entries at scan-engine.ts:182-184. No duplication with existing `@upstash/redis` or `@upstash/qstash` (those are in dependencies.ts, these are in EXTERNAL_SERVICE_PACKAGES).
- [x] **AC7:** No regressions → ✅ PASS — 3200 tests pass (baseline 3175 + 25 new). Next.js and React guards explicitly tested at node-frameworks.test.ts:297-308.
- [x] **AC8:** Config sync → ✅ PASS — `STRONG_FRAMEWORK_CONFIGS` tested at surfaces.test.ts:1429-1438. `FRAMEWORK_HINTS` verified by source inspection at census.ts:68-70.
- [x] **AC9:** SourceRoot type extensions → ✅ PASS — `hasMain: boolean` and `hasExports: boolean` added to `SourceRoot` at types/census.ts:23-24. All four census construction sites populate them.
- [x] **AC10:** Test helper compatibility → ✅ PASS — `makeRoot` defaults `hasMain: false` and `hasExports: false` at surfaces.test.ts:34-35. All 131 test files pass.
- [x] **Tests pass** → ✅ PASS — `(cd packages/cli && pnpm vitest run)` — 3200 passed, 2 skipped.
- [x] **No build errors** → ✅ PASS — `pnpm run build` succeeds.
- [x] **Lint passes** → ✅ PASS — 0 errors (1 pre-existing warning unrelated to this build).

## Blockers

No blockers. All 24 contract assertions satisfied. All 13 ACs pass. No regressions (3200 tests pass). Checked: no unused exports in new vue.ts file (detectVue imported by framework-registry.ts and tests), no dead code paths in resolveViteFramework (all 4 dep checks + null return are reachable), no unguarded error paths in new code (pure function with no I/O), no engine files importing CLI deps (vue.ts and surfaces.ts changes are engine-pure).

## Findings

- **Code — resolveViteFramework handles only 4 frameworks:** `packages/cli/src/engine/detectors/surfaces.ts:245` — Only vue, react, svelte, solid-js are mapped. Preact, Qwik, Lit, and other Vite-based frameworks would get `null` as their surface framework label. This is acknowledged by the spec ("small inline map") but worth scoping when more Vite frameworks appear in real scans.

- **Code — Inline dep-to-framework map creates parallel knowledge:** `packages/cli/src/engine/detectors/surfaces.ts:248` — The `resolveViteFramework` function duplicates framework-dep associations that also exist in the registry detectors. If a new framework is added to the registry, `resolveViteFramework` won't know about it. The spec explicitly chose this tradeoff. Dormant unless a new Vite-based framework is added to the registry.

- **Code — Signal 2 (apps/) bypasses library guard:** `packages/cli/src/engine/detectors/surfaces.ts:341` — A library package under `apps/` with `vite.config.ts` and `hasMain: true` would still be detected as a surface via Signal 2. This is arguably correct (apps/ implies deployable), but the guard is inconsistently applied across signals.

- **Test — Service detection entries (A011-A015) have no unit tests:** `packages/cli/src/engine/scan-engine.ts:163,182-184` — EXTERNAL_SERVICE_PACKAGES is a static map, so source inspection is sufficient. But if the map were refactored to a dynamic lookup, these entries would have no regression protection. Verified by source inspection for this report.

- **Test — FRAMEWORK_HINTS vite ordering is untested:** `packages/cli/src/engine/census.ts:68-70` — The ordering invariant (vite entries after framework-specific configs) is load-bearing per the spec. FRAMEWORK_HINTS is not exported (see fill-scan-detection-gaps-C3), so the ordering can only be tested via integration tests. A reordering mistake would silently shadow framework-specific hints.

- **Test — No per-surface test for dual-framework deps in resolveViteFramework:** `packages/cli/src/engine/detectors/surfaces.ts:248` — A root with both `vue` and `react` in deps would produce 'Vue' (priority order), but this path is untested at the surface level. The registry-level test at `node-frameworks.test.ts:311` covers detector independence but not surface-level resolution.

- **Upstream — Contract A019 value is fragile:** Contract asserts `viteHints.length` equals exactly 3. If a 4th vite extension is later supported (e.g., `vite.config.cjs`), A019's value must be updated. The matcher could be `greater` with value 0 for durability, but `equals 3` is correct today.

## Deployer Handoff

This build adds three capabilities: (1) Vue framework detection at both stack and per-surface levels, (2) a library guard that prevents Vite-as-bundler packages from being detected as deployable surfaces, and (3) four new external service entries (MCP, Upstash Ratelimit/Vector/Workflow).

The library guard is vite-specific — it only fires when vite.config.* is the strong config AND the package declares `main`/`module`/`exports`. Non-vite configs (next.config.ts, etc.) are never guarded.

FRAMEWORK_HINTS ordering is load-bearing: vite entries must stay after all framework-specific configs. If someone adds a new framework config to the hints array, it must go before the vite block (line 67).

The Vue detector is at position 5 in the registry (between Express and React). Moving it after React would not break detection for Vue-only projects, but a project with both vue and react deps would be classified as React instead of Vue at the stack level.

## Verdict

**Shippable:** YES

All 24 contract assertions satisfied. All 13 ACs pass. 3200 tests pass with 25 new tests. No regressions. Build and lint clean. The code follows existing patterns (vue.ts mirrors react.ts, library guard is narrowly scoped, service entries follow the map convention). Findings are all debt/observation — none are blockers. Would stake my name on shipping this.
