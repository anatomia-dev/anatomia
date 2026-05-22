# Scope: Filter non-product paths from schema glob fallbacks

**Created by:** Ana
**Date:** 2026-05-22

## Intent
The census-level schema filter shipped in scan-quality-polish correctly skips non-product roots (e2e, examples, test fixtures). But the glob fallback in `detectSchemas` bypasses census entirely and rediscovers those same schemas directly. The result: repos like highlight still report false Prisma detection from `e2e/nextjs/prisma/schema.prisma`, and repos like trpc/electric could report false Drizzle from `examples/` directories. Close the gap by applying the same `isNonProductPath` filter to glob fallback results.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — 1 import addition, 2 filter lines, 1 test file
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/scan-engine.ts` (import + 2 filter lines)
  - `packages/cli/tests/engine/scanProject.test.ts` (new test cases)
- **Blast radius:** Schema detection only. The filter uses `isNonProductPath` which is already proven in surface detection. No new logic — just applying an existing filter to a code path that was missing it.
- **Estimated effort:** 15 minutes
- **Multi-phase:** no

## Approach
Extend the existing `isNonProductPath` import from `./detectors/surfaces.js` (already imported on line 39) and apply it as a filter on glob results in both the Prisma and Drizzle fallback paths. The filter goes at the chokepoint — after all sources merge into `matches`, before the scorer runs — so a single line covers all glob patterns per ORM. Add targeted regression tests that place schemas in non-product paths and verify they're excluded while real schemas in product paths are detected.

## Acceptance Criteria
- AC1: `isNonProductPath` is imported in scan-engine.ts via the existing surfaces.js import line
- AC2: Prisma glob fallback results are filtered through `isNonProductPath` before the scorer (after line 301, before line 303)
- AC3: Drizzle glob fallback results are filtered through `isNonProductPath` before content validation (after line 422, before line 424)
- AC4: A test verifies that a Prisma schema in an `e2e/` directory is NOT detected when it's the only schema
- AC5: A test verifies that a Drizzle schema in an `examples/` directory is NOT detected when it's the only schema
- AC6: Existing tests continue to pass — real schemas in `prisma/`, `packages/db/prisma/`, `apps/api/drizzle/` are unaffected

## Edge Cases & Risks
- **Double filtering:** Census paths are already filtered upstream — the new filter would redundantly check them. This is harmless (no-op on already-clean data) and not worth special-casing.
- **`test-utils` false positive:** A path like `packages/test-utils/prisma/schema.prisma` has segment `test-utils` which does NOT exactly match `test` in EXCLUDED_SEGMENTS. Safe — exact match only.
- **Drizzle content filter ordering:** Filtering non-product paths before the `Table(` content check means we skip file reads for excluded paths. This is a minor perf win, not a correctness concern.

## Rejected Approaches
- **Filter at each individual glob call:** More lines, same effect, and fragile when someone adds a third glob pattern. The chokepoint approach is one line per ORM block.
- **Add non-product paths to SCHEMA_GLOB_OPTS.ignore:** Glob ignore patterns are basename-based, not segment-based. Can't express "any path containing an `e2e` segment" without enumerating `**/e2e/**` for every excluded segment. The post-filter is cleaner.

## Open Questions
None — fully traced.

## Exploration Findings

### Patterns Discovered
- scan-engine.ts line 39: already imports `{ detectSurfaces, enrichPackages }` from `./detectors/surfaces.js` — extend this destructure
- Prisma chokepoint: line 303 `if (matches.length > 0)` — filter before this
- Drizzle chokepoint: line 422 `const unique = [...]` → line 424 content filter loop — filter between these

### Constraints Discovered
- [TYPE-VERIFIED] isNonProductPath signature (surfaces.ts:84) — takes `relativePath: string`, returns `boolean`. Glob results are already relative posix paths. Compatible.
- [OBSERVED] Census paths are pre-filtered — census.ts filters via `isNonProductPath` before passing schemas to `detectSchemas`. The glob fallback is the only unfiltered path.
- [OBSERVED] EXCLUDED_SEGMENTS uses exact match (surfaces.ts:87) — `segment.toLowerCase()` checked against Set. No substring matching. `test-utils` ≠ `test`.

### Test Infrastructure
- `packages/cli/tests/engine/scanProject.test.ts`: uses `createFiles()` helper to build temp directory trees, runs `scanProject()` against them. Schema tests start at line 98. This is the structural analog for new tests.

## For AnaPlan

### Structural Analog
`packages/cli/tests/engine/scanProject.test.ts` lines 98-160 — existing Prisma/Drizzle schema detection tests. Same `createFiles` + `scanProject` + assert pattern.

### Relevant Code Paths
- `packages/cli/src/engine/scan-engine.ts:259-470` — `detectSchemas` function, both Prisma and Drizzle blocks
- `packages/cli/src/engine/detectors/surfaces.ts:60-93` — `EXCLUDED_SEGMENTS` and `isNonProductPath`
- `packages/cli/src/engine/census.ts:319` — census-level schema filtering (already correct)

### Patterns to Follow
- Import style: extend existing destructured import on line 39
- Filter style: `.filter(m => !isNonProductPath(m as string))` — consistent with how surfaces.ts uses the function

### Known Gotchas
- The Prisma `matches` array can contain directory paths ending with `/` (from the multi-file schema fallback at line 300-301). `isNonProductPath` splits on `/` which would produce an empty trailing segment. This is safe — empty string doesn't match any excluded segment — but the test should include a directory-style path to confirm.

### Things to Investigate
None — all questions resolved during scoping.
