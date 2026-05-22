# Build Report: Scan Quality Polish (6 Additive Fixes)

**Created by:** AnaBuild
**Date:** 2026-05-22
**Spec:** .ana/plans/active/scan-quality-polish/spec.md
**Branch:** feature/scan-quality-polish

## What Was Built

- `packages/cli/src/engine/census.ts` (modified): Added `isNonProductPath` filter at top of `discoverSchemas` loop to skip e2e/example/template directories (Fix 1). Added `vue.config.ts` entry to `FRAMEWORK_HINTS` array before existing `.js`/`.mjs` entries (Fix 3).
- `packages/cli/src/engine/detectors/surfaces.ts` (modified): Added `.toLowerCase()` to `lastSegment` before `INFRA_PATTERNS.has()` check for case-insensitive matching (Fix 2). Added `vue.config.ts` to `STRONG_FRAMEWORK_CONFIGS` set before existing `.js`/`.mjs` entries (Fix 3).
- `packages/cli/tests/commands/scan.test.ts` (modified): Replaced vacuous `if (surfIdx > -1)` guard with `expect(surfIdx).toBeGreaterThan(-1)` assertion, added `expect(cliLine).toBeDefined()` (Fix 4). Added `toContain` assertions for `Next.js`, `JavaScript`, and `Vitest` in the surface display block (Fix 5).
- `packages/cli/tests/engine/detectors/applicationShape.test.ts` (modified): Moved `// @ana A003` tag from line 319 (above `describe('detector is a pure function')`) to line 64 (above `it('mcp-server yields to web-app when browser framework present')`) (Fix 6).

## PR Summary

- Fix schema discovery to skip non-product paths (e2e fixtures, examples, templates) via `isNonProductPath` filter
- Make `INFRA_PATTERNS` matching case-insensitive, consistent with adjacent `EXCLUDED_SEGMENTS` check
- Add `vue.config.ts` to both `FRAMEWORK_HINTS` and `STRONG_FRAMEWORK_CONFIGS` for full `.ts`/`.js`/`.mjs` parity
- Replace vacuous conditional assertions in scan tests with proper `expect()` calls that fail on missing sections
- Add value-level assertions for rendered framework, language, and testing values in surface display tests

## Acceptance Criteria Coverage

- AC1 "discoverSchemas skips non-product paths" → census.ts `isNonProductPath` continue added at top of loop. Covered by existing scan integration tests (no dedicated schema discovery test file exists).
- AC2 "INFRA_PATTERNS matching is case-insensitive" → surfaces.ts `.toLowerCase()` added. Covered by existing surface detection tests.
- AC3 "vue.config.ts recognized in both tables" → Added to `FRAMEWORK_HINTS` (census.ts) and `STRONG_FRAMEWORK_CONFIGS` (surfaces.ts). Structural verification — both tables now have `.ts`/`.js`/`.mjs` for Vue.
- AC4 "A007 test fails if Surfaces section doesn't render" → scan.test.ts:1093 `expect(surfIdx).toBeGreaterThan(-1)` (was `if` guard)
- AC5 "Surface display tests assert rendered values" → scan.test.ts:1083-1085 `toContain('Next.js')`, `toContain('JavaScript')`, `toContain('Vitest')`
- AC6 "@ana A003 tags correct test" → applicationShape.test.ts:65 now has the tag; line 319 no longer has it
- AC7 "Tests pass" → 2846 passed, 2 skipped, 122 test files
- AC8 "No build errors" → `pnpm run build` succeeds

## Implementation Decisions

- Fix 1: Placed `isNonProductPath` check immediately after the `for (const root of roots)` line, before any Prisma/Drizzle checks, as spec directed. Uses `continue` to skip the entire root.
- Fix 3: Placed `vue.config.ts` first in the Vue entries (before `.js` and `.mjs`) to match the `.ts`-first ordering used by Next.js, Remix, Nuxt, and Svelte entries.
- Fix 5: Ran the test fixture to capture actual rendered output before writing assertions. `cli` surface renders `JavaScript` (no tsconfig, has deps), `web` surface renders `Next.js` (from next dep + next.config.js). Both show `Vitest` from devDeps.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  122 passed (122)
     Tests  2846 passed | 2 skipped (2848)
  Duration  45.75s
```

### After Changes
```
pnpm run test -- --run
Test Files  122 passed (122)
     Tests  2846 passed | 2 skipped (2848)
  Duration  43.88s
```

### Comparison
- Tests added: 0 (fixes modify existing assertions, no new test functions)
- Tests removed: 0
- Regressions: none

### New Tests Written
No new test files or test functions. Fixes 4-6 modify existing test assertions and tags.

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
91bbc379 [scan-quality-polish] Move @ana A003 tag to correct test
ee1dc69b [scan-quality-polish] Fix vacuous test assertions and add value-level surface checks
c03a2287 [scan-quality-polish] Fix schema discovery filter, case-insensitive infra matching, Vue TS config
```

## Open Issues

- Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.
- Fix 1 has no dedicated unit test for `discoverSchemas` filtering non-product paths. The function is private (not exported) and no schema-specific test file exists. Verified structurally: the `isNonProductPath` call is identical to the pattern in `detectSurfaces` which IS tested. A monorepo with `e2e/express-ts/prisma/schema.prisma` would need an integration test to fully verify AC1.
- Fix 2 (case-insensitive INFRA_PATTERNS) has no dedicated test for a capitalized package name like `Tsconfig`. The `.toLowerCase()` call is structurally identical to the adjacent `EXCLUDED_SEGMENTS` check. A test would require a monorepo fixture with a capitalized infra package.

Verified complete by second pass.
