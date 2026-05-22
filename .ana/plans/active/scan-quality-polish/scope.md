# Scope: Scan Quality Polish (6 Additive Fixes)

**Created by:** Ana
**Date:** 2026-05-22

## Intent

Six small additive fixes — 3 product accuracy improvements and 3 test quality improvements — surfaced through R5/R6 validation and proof chain findings. Each makes the scan strictly more accurate or the tests strictly more honest. None are regressions; all are pre-existing gaps now documented. Validated by 3 independent agents with no concerns.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — 6 changes, each 1-5 lines, all additive
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/census.ts` (Fixes 1, 3)
  - `packages/cli/src/engine/detectors/surfaces.ts` (Fixes 2, 3)
  - `packages/cli/tests/commands/scan.test.ts` (Fixes 4, 5)
  - `packages/cli/tests/engine/detectors/applicationShape.test.ts` (Fix 6)
- **Blast radius:** Minimal. Product fixes are additive filters/entries — repos that don't hit the new paths are completely unaffected. Test fixes are test-only.
- **Estimated effort:** < 1 hour
- **Multi-phase:** no

## Approach

Fill six documented gaps in scan accuracy and test honesty. Product fixes add a missing filter, a case-normalization, and a missing config variant. Test fixes eliminate a vacuous assertion, add value-level checks, and correct a proof chain tag mapping. All changes are strictly additive — no existing behavior changes for correctly-scanned repos.

## Acceptance Criteria

- AC1: `discoverSchemas` skips non-product paths (e2e fixtures, examples, templates). A monorepo with `e2e/express-ts/prisma/schema.prisma` does not report that as a product schema.
- AC2: `INFRA_PATTERNS` matching is case-insensitive, consistent with `EXCLUDED_SEGMENTS` on the adjacent line.
- AC3: `vue.config.ts` is recognized in both `FRAMEWORK_HINTS` and `STRONG_FRAMEWORK_CONFIGS`, achieving parity with every other framework's `.ts`/`.js`/`.mjs` coverage.
- AC4: The "surfaces without testing" test (scan.test.ts ~line 1086) fails if the Surfaces section doesn't render or the surface line isn't found — no vacuous pass.
- AC5: Surface display tests assert on rendered framework/language/testing values, not just surface names.
- AC6: `// @ana A003` tags the "Next.js + MCP yields to web-app" test (applicationShape.test.ts:64), not the "detector is a pure function" test (line 319).

## Edge Cases & Risks

- **Fix 1:** Could `isNonProductPath` filter a legitimate schema? Only if production Prisma schemas live inside directories named `examples/`, `e2e/`, `test/`, etc. Not a real-world concern — surface detection already uses this exact filter at surfaces.ts:272 without issue.
- **Fix 2:** Could a legitimate package named `Tsconfig` (capitalized) need to be a surface? No — these are infrastructure config package names by definition. A capitalized variant is still infrastructure.
- **Fix 3:** `hasStrongConfig` (surfaces.ts:239) iterates `census.frameworkHints` and checks `STRONG_FRAMEWORK_CONFIGS.has(path.basename(h.path))`. Both tables must be updated in lockstep. No other consumers.
- **Fix 5:** Exact assertion strings depend on the scan display renderer. Build must run the test once with the fixture to capture actual rendered output before writing value assertions.
- **Fix 6:** Tag goes on a new line before the `it(` at line 64 (inside the `describe` block at line 63), not before the `describe`.

## Rejected Approaches

- **Filtering `discoverFrameworkHints` for non-product paths:** Not needed. Framework hints from e2e roots exist in the census but are harmless — per-surface detection already filters non-product surfaces, and project-level detection requires a dependency match.
- **Filtering `discoverTsconfigs` for non-product paths:** Not needed. Tsconfig discovery doesn't cause false detections.

## Open Questions

None. All fixes are fully specified.

## Exploration Findings

### Patterns Discovered
- census.ts:25: `isNonProductPath` already imported from `./detectors/surfaces.js` — no new import needed for Fix 1.
- surfaces.ts:87: `EXCLUDED_SEGMENTS` uses `.toLowerCase()` — Fix 2 brings `INFRA_PATTERNS` into consistency.
- scan.test.ts:1077: `expect(surfIdx).toBeGreaterThan(-1)` pattern already exists in the adjacent test — Fix 4 follows established pattern.

### Constraints Discovered
- [TYPE-VERIFIED] FRAMEWORK_HINTS entries (census.ts:62-63) — Vue has `.js` and `.mjs` but not `.ts`. Every other framework has all three.
- [TYPE-VERIFIED] STRONG_FRAMEWORK_CONFIGS entries (surfaces.ts:35) — Vue has `.js` and `.mjs` but not `.ts`. Same gap.
- [OBSERVED] A003 tag mismatch (applicationShape.test.ts:319 vs :64) — tag on wrong test, confirmed by reading both test bodies.

### Test Infrastructure
- `createMonorepoWithSurfaces` helper (scan.test.ts:1025-1052): Creates fixture with `pnpm-workspace.yaml`, packages with `bin`+`dev` script, 6 source files each, optional config file and deps. The `cli` surface gets TypeScript (from `.ts` source files) and optionally Vitest; the `web` surface gets Next.js (from dep + config) and optionally Vitest.

## For AnaPlan

### Structural Analog
The existing `isNonProductPath` filter at surfaces.ts:272 is the structural analog for Fix 1 — same predicate, same `continue` pattern, same loop shape. The `EXCLUDED_SEGMENTS` `.toLowerCase()` call at surfaces.ts:87 is the analog for Fix 2.

### Relevant Code Paths
- `packages/cli/src/engine/census.ts:314-360` — `discoverSchemas` function, Fix 1 insertion point
- `packages/cli/src/engine/census.ts:59-63` — FRAMEWORK_HINTS Vue entries, Fix 3
- `packages/cli/src/engine/detectors/surfaces.ts:29-39` — STRONG_FRAMEWORK_CONFIGS, Fix 3
- `packages/cli/src/engine/detectors/surfaces.ts:268-269` — INFRA_PATTERNS check, Fix 2
- `packages/cli/tests/commands/scan.test.ts:1066-1101` — Surface display tests, Fixes 4-5
- `packages/cli/tests/engine/detectors/applicationShape.test.ts:63-70,319` — A003 tag locations, Fix 6

### Patterns to Follow
- surfaces.ts:272 — `isNonProductPath` continue pattern
- surfaces.ts:87 — `.toLowerCase()` before Set lookup
- scan.test.ts:1077 — `expect(surfIdx).toBeGreaterThan(-1)` assertion style

### Known Gotchas
- Fix 5: Do NOT write value assertions without first running the test to capture actual rendered surface line output. The fixture creates surfaces with Next.js and TypeScript — verify the rendered strings match before asserting.
- Fix 6: Insert `// @ana A003` as a NEW LINE before the `it(` at line 64. Do not overwrite the `it(` line. Delete the tag at line 319.

### Things to Investigate
None. All fixes are fully specified with exact locations and code.
