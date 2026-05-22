# Spec: Filter non-product paths from schema glob fallbacks

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/fix-schema-glob-fallback/scope.md

## Approach

The census-level schema filter in `census.ts` correctly calls `isNonProductPath` before passing schemas to `detectSchemas`. But when census finds nothing and `detectSchemas` falls back to glob discovery, those glob results bypass the filter entirely. Repos with Prisma schemas in `e2e/` or Drizzle schemas in `examples/` get false detections.

The fix: add `isNonProductPath` to the existing destructured import from `./detectors/surfaces.js` (line 39 of scan-engine.ts), then filter glob-sourced `matches` in both ORM blocks before the scorer runs.

**Prisma block:** Filter `matches` after all glob sources merge (line 301) and before the scorer gate at line 303. This covers both the `**/schema.prisma` glob and the `**/prisma/*.prisma` multi-file fallback.

**Drizzle block:** Filter the deduplicated `unique` array (line 422) before the content-check loop at line 424. This skips file reads for excluded paths — minor perf win, correct behavior.

Census-sourced paths are already clean. Filtering them again via the unified `matches` array is a harmless no-op and keeps the code simpler than branching on source.

## Output Mockups

Before fix — scanning a repo like highlight with `e2e/nextjs/prisma/schema.prisma`:
```
schemas:
  prisma:
    found: true
    path: "e2e/nextjs/prisma/schema.prisma"   ← false detection
```

After fix:
```
schemas:
  prisma:
    found: false
    path: null
```
(Unless a real schema exists in a product path, in which case that one is detected.)

## File Changes

### `packages/cli/src/engine/scan-engine.ts` (modify)
**What changes:** Add `isNonProductPath` to the existing surfaces.js import destructure. Add one `.filter()` call in the Prisma glob fallback section (after all sources merge into `matches`, before the `if (matches.length > 0)` gate). Add one `.filter()` call in the Drizzle glob fallback section (filter the `unique` array before the content-check loop).
**Pattern to follow:** The same `isNonProductPath` usage in `census.ts` line 322: `if (isNonProductPath(root.relativePath)) continue;` — same function, same semantics, array filter form instead of loop guard.
**Why:** Without this, glob fallback rediscovers schemas in non-product paths that census correctly excluded, producing false ORM detections and missing blind spots.

### `packages/cli/tests/engine/scanProject.test.ts` (modify)
**What changes:** Add two test cases in the existing schema detection test group: one for Prisma schema in an `e2e/` directory, one for Drizzle schema in an `examples/` directory. Both verify the schema is NOT detected when it's the only schema present.
**Pattern to follow:** The existing "detects Prisma schema in a monorepo sub-package" test (lines 119-141) — same `createFiles` + `scanProject` + assert structure.
**Why:** Regression tests for the specific false-positive scenarios this fix addresses.

## Acceptance Criteria
- [x] AC1: `isNonProductPath` is imported in scan-engine.ts via the existing surfaces.js import line
- [ ] AC2: Prisma glob fallback results are filtered through `isNonProductPath` before the scorer
- [ ] AC3: Drizzle glob fallback results are filtered through `isNonProductPath` before content validation
- [ ] AC4: A test verifies that a Prisma schema in an `e2e/` directory is NOT detected when it's the only schema
- [ ] AC5: A test verifies that a Drizzle schema in an `examples/` directory is NOT detected when it's the only schema
- [ ] AC6: Existing tests continue to pass — real schemas in `prisma/`, `packages/db/prisma/`, `apps/api/drizzle/` are unaffected
- [ ] Tests pass with `(cd 'packages/cli' && pnpm vitest run)`
- [ ] No lint errors

## Testing Strategy
- **Unit tests:** Two new test cases in `scanProject.test.ts` using the existing `createFiles` + `scanProject` + assert pattern. Each creates a temp project with a schema file in a non-product path and asserts the schema is not detected.
- **Prisma test:** Create `e2e/nextjs/prisma/schema.prisma` with models + `@prisma/client` dep. Assert `schemas['prisma'].found` is `false` and the blind spot fires.
- **Drizzle test:** Create `examples/drizzle-app/schema.ts` with `pgTable(` content + `drizzle-orm` dep. Assert `schemas['drizzle'].found` is `false` and the blind spot fires.
- **Edge case — directory-style Prisma path:** The Prisma multi-file fallback produces directory entries ending with `/`. The `e2e` test should use a path like `e2e/prisma/` to confirm `isNonProductPath` handles the trailing slash (it does — empty trailing segment doesn't match any excluded segment).
- **Regression:** All 122 existing test files / 2856 tests must continue passing.

## Dependencies
None. `isNonProductPath` is already exported from `surfaces.ts` and proven in surface detection.

## Constraints
- Engine files must not import CLI dependencies (chalk, ora, commander).
- The filter must use exact segment matching via `isNonProductPath`, not substring or glob patterns.

## Gotchas
- **Prisma multi-file fallback produces directory paths ending with `/`.** `isNonProductPath` splits on `/` which gives an empty trailing segment. Empty string doesn't match any excluded segment, so the function correctly evaluates based on the real segments. The test should include a directory-style path (e.g., `e2e/prisma/models.prisma` triggering the multi-file fallback that produces `e2e/prisma/`) to confirm this.
- **Filter both glob results AND the multi-file directory dedup.** The Prisma block has two glob paths: `**/schema.prisma` (line 294) and `**/prisma/*.prisma` (line 298-301). Both feed into `matches`. Filter once after both have contributed, not on each individually.
- **Drizzle content filter ordering matters.** Filter non-product paths BEFORE the `Table(` content check. This way excluded paths don't trigger file reads. The filter goes on `unique` before the content loop.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { isNonProductPath } from './detectors/surfaces.js'`
- Use `import type` for type-only imports, separate from value imports
- Engine files have zero CLI dependencies — no chalk, no ora
- Prefer early returns over nested conditionals
- Exported functions require `@param` and `@returns` JSDoc tags (not relevant here — no new exports)

### Pattern Extracts

**Import to extend** (scan-engine.ts line 39):
```typescript
import { detectSurfaces, enrichPackages } from './detectors/surfaces.js';
```

**Census usage of isNonProductPath** (census.ts line 322):
```typescript
    if (isNonProductPath(root.relativePath)) continue;
```

**isNonProductPath signature** (surfaces.ts lines 84-93):
```typescript
export function isNonProductPath(relativePath: string): boolean {
  const segments = relativePath.split('/');
  for (const segment of segments) {
    if (EXCLUDED_SEGMENTS.has(segment.toLowerCase())) return true;
  }
  const lastSegment = segments[segments.length - 1] || '';
  if (lastSegment.toLowerCase().endsWith('-e2e')) return true;
  return false;
}
```

**Test structural analog** (scanProject.test.ts lines 119-141):
```typescript
  it('detects Prisma schema in a monorepo sub-package', async () => {
    await createFiles({
      'package.json': JSON.stringify({
        name: 'monorepo-root',
        dependencies: { '@prisma/client': '5.0.0' },
      }),
      'packages/db/prisma/schema.prisma':
        'model User { id Int @id }\nmodel Post { id Int @id }\nmodel Comment { id Int @id }',
    });

    const result = await scanProject(tempDir, { depth: 'surface' });

    expect(result.schemas['prisma']).toBeDefined();
    expect(result.schemas['prisma']!.found).toBe(true);
    expect(result.schemas['prisma']!.path).toBe('packages/db/prisma/schema.prisma');
    expect(result.schemas['prisma']!.modelCount).toBe(3);
    expect(result.blindSpots.find(b => b.area === 'Database' && /Prisma/.test(b.issue))).toBeUndefined();
  });
```

### Proof Context
- `scan-engine.ts`: Hardcoded subdirectory list inline (fix-typescript-language-detection-C1) — not relevant to this build.
- `scan-engine.ts`: Duplicate `readPythonDependencies` calls (fix-python-dep-separation-C1) — not relevant to this build.
- `scanProject.test.ts`: No active proof findings.

No active proof findings overlap with this build's assertions.

### Checkpoint Commands
- After modifying scan-engine.ts: `(cd 'packages/cli' && pnpm vitest run src/engine/scan-engine)` — Expected: existing schema tests pass
- After adding test cases: `(cd 'packages/cli' && pnpm vitest run tests/engine/scanProject)` — Expected: all tests pass including 2 new
- After all changes: `pnpm run test -- --run` — Expected: 2858+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2856 passed, 2 skipped (2858 total)
- Current test files: 122
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected 2858+ tests (2 new) in 122 test files
- Regression focus: existing Prisma/Drizzle schema detection tests in `scanProject.test.ts`
