# Spec: Fix non-product path over-exclusion at deep segments

**Created by:** AnaPlan
**Date:** 2026-06-02
**Scope:** .ana/plans/active/fix-non-product-over-exclusion/scope.md

## Approach

Split non-product filtering into two tiers. `isNonProductPath` (unchanged) checks all segments — correct for package-level paths (1-3 segments). New `isNonProductFilePath` checks only the first 3 segments — correct for full file paths (5-10+ segments) where excluded segment names like `e2e`, `templates`, `playground` appear deep inside product surfaces.

Update `NON_PRODUCT_GLOB_IGNORE` in place from any-depth `**/${s}/**` to 3-tier rooted patterns. The any-depth version has zero correct use cases after migration — findings rules, schema detection, and deploy discovery all operate on file paths. Build artifact patterns (`**/node_modules/**` etc.) remain `**/`-prefixed because they're correct at any depth.

Add a `FILE_PATH_DEPTH_LIMIT = 3` constant. Not a function parameter — depth 3 was validated across 17 repos as the boundary where package structure ends and product source begins.

The `-e2e` suffix check in `isNonProductFilePath` must iterate segments 0 through `FILE_PATH_DEPTH_LIMIT - 1`, not replicate the original's "last segment" pattern. For file paths, the last segment is the filename (e.g., `route.ts`), not a directory name.

## Output Mockups

No user-facing output changes. This fix changes internal filtering behavior only. The observable effect is that scan results include files previously over-excluded (e.g., dub's `apps/web/app/(ee)/api/e2e/` routes appear in findings and hot files).

## File Changes

### `packages/cli/src/engine/detectors/surfaces.ts` (modify)
**What changes:** Add `FILE_PATH_DEPTH_LIMIT` constant (value `3`). Add `isNonProductFilePath` function below `isNonProductPath`. Update `NON_PRODUCT_GLOB_IGNORE` generation from `**/${s}/**` to 3-tier rooted patterns via `.flatMap`. Export the new function and constant.
**Pattern to follow:** `isNonProductPath` at lines 88-97 — same segment iteration, same `EXCLUDED_SEGMENTS` set, different loop bound and `-e2e` check scope.
**Why:** The existing function checks all segments, which over-excludes when file paths have excluded segment names deep inside product code.

### `packages/cli/src/engine/detectors/git.ts` (modify)
**What changes:** Change the import at the top of the file from `isNonProductPath` to `isNonProductFilePath`. Update the call at line 382 (hot file filtering) to use `isNonProductFilePath`.
**Pattern to follow:** Existing import/usage pattern in the same file.
**Why:** Hot file paths from `git log --name-only` are full file paths, not package paths.

### `packages/cli/src/engine/scan-engine.ts` (modify)
**What changes:** Change the import from `isNonProductPath` to `isNonProductFilePath`. Update 4 call sites (lines 321, 443, 543, 545) to use `isNonProductFilePath`.
**Pattern to follow:** Existing import/usage pattern in the same file.
**Why:** Schema detection and Supabase migration filtering operate on full file paths from glob results.

### `packages/cli/tests/engine/detectors/surfaces.test.ts` (modify)
**What changes:** Add import for `isNonProductFilePath`. Add a new describe block testing depth-boundary behavior: deep paths return false (e2e at index 5), shallow paths return true (examples at index 0, 2), `-e2e` suffix within depth limit, case insensitivity.
**Pattern to follow:** The existing `isNonProductPath is exported and usable` block at lines 926-951 — same structure of function-type check + true/false path assertions + suffix + case tests.
**Why:** The new function needs direct unit tests alongside the existing function's tests.

### `packages/cli/tests/engine/non-product-filtering.test.ts` (modify)
**What changes:** Update import to include `isNonProductFilePath`. Update assertion in the `NON_PRODUCT_GLOB_IGNORE` describe block — the test at line 28 currently asserts `**/${segment}/**` for every EXCLUDED_SEGMENTS entry. Change to assert 3-tier rooted patterns (`${segment}/**`, `*/${segment}/**`, `*/*/${segment}/**`). Add new test block for `isNonProductFilePath` on file paths — the hot file and Supabase tests should use `isNonProductFilePath` since they simulate file-path filtering. Add depth-boundary tests showing deep paths pass through.
**Pattern to follow:** Existing test structure in the same file.
**Why:** Test assertions must match the updated constant format and the new function's behavior.

## Acceptance Criteria

- [ ] AC1: `isNonProductFilePath('apps/web/app/(ee)/api/e2e/bounties/route.ts')` returns `false` (e2e at index 5, past depth-3 limit)
- [ ] AC2: `isNonProductFilePath('examples/next-app/src/route.ts')` returns `true` (examples at segment 0)
- [ ] AC3: `isNonProductFilePath('packages/platform/examples/base/src/route.ts')` returns `true` (examples at segment 2, within depth limit)
- [ ] AC4: `isNonProductPath('examples/next-app')` still returns `true` (unchanged for package paths)
- [ ] AC5: `NON_PRODUCT_GLOB_IGNORE` contains `${s}/**`, `*/${s}/**`, `*/*/${s}/**` patterns (rooted, not `**/${s}/**`)
- [ ] AC6: `NON_PRODUCT_GLOB_IGNORE` retains `**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/.git/**`, `**/.turbo/**`, `**/out/**`, `**/.cache/**` at any depth (build artifacts correct everywhere)
- [ ] AC7: git.ts hot file filtering calls `isNonProductFilePath`, not `isNonProductPath`
- [ ] AC8: scan-engine.ts lines 321, 443, 543, 545 call `isNonProductFilePath`, not `isNonProductPath`
- [ ] AC9: Package-path callers (census.ts, surfaces.ts detectSurfaces, state.ts) remain on `isNonProductPath` unchanged
- [ ] AC10: `-e2e` suffix check in `isNonProductFilePath` iterates segments 0 through limit-1 (not just last segment)
- [ ] AC11: All existing tests pass (updated assertions where needed)
- [ ] Tests pass with `(cd 'packages/cli' && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests (surfaces.test.ts):** New describe block for `isNonProductFilePath`. Test the depth boundary: paths with excluded segments at index 0, 1, 2 return true; paths with excluded segments at index 3+ return false. Test `-e2e` suffix at each depth tier. Test case insensitivity. Test that `isNonProductPath` behavior is unchanged (existing tests still pass).
- **Unit tests (non-product-filtering.test.ts):** Update `NON_PRODUCT_GLOB_IGNORE` assertion to check 3-tier rooted patterns instead of `**/${segment}/**`. Add `isNonProductFilePath` tests for file-path scenarios (hot files, Supabase paths, deep product paths). Verify build artifact patterns unchanged.
- **Edge cases:** Empty string path, single-segment path, path with excluded segment at exactly index 3 (should NOT be excluded — depth limit means indices 0, 1, 2 only).

## Dependencies

None. All changes are internal to the CLI package.

## Constraints

- `isNonProductPath` must remain unchanged — package-path callers depend on all-segment checking.
- Build artifact patterns in `NON_PRODUCT_GLOB_IGNORE` must remain `**/`-prefixed.
- Findings rules (validation.ts, errorBoundaries.ts, secrets.ts) import `NON_PRODUCT_GLOB_IGNORE` by name — the in-place update means zero import changes needed in those files.

## Gotchas

- The non-product-filtering.test.ts line 28 loop `expect(NON_PRODUCT_GLOB_IGNORE).toContain(`**/${segment}/**`)` will fail immediately after the constant update. This is the first test to fix — update to check for the 3 rooted patterns per segment instead.
- The `-e2e` suffix in `isNonProductPath` checks `segments[segments.length - 1]` (the last segment). For `isNonProductFilePath`, this would check the filename. The new function must instead iterate segments 0 through `FILE_PATH_DEPTH_LIMIT - 1` for the suffix check.
- `scan-engine.ts` imports `isNonProductPath` — confirm the import is from `./detectors/surfaces.js`. The new function must be added to the same import.
- `git.ts` imports `isNonProductPath` — confirm the import is from `../detectors/surfaces.js` (relative from `detectors/` subdirectory — actually git.ts IS in detectors, so it's `./surfaces.js`). Verify the actual import path before changing.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { isNonProductFilePath } from './surfaces.js'`
- Use `import type` for type-only imports, separate from value imports
- Explicit return types on exported functions: `export function isNonProductFilePath(relativePath: string): boolean`
- Exported functions require `@param` and `@returns` JSDoc tags
- Engine files have zero CLI dependencies — no chalk, no ora in surfaces.ts
- Constants use SCREAMING_SNAKE_CASE: `FILE_PATH_DEPTH_LIMIT`

### Pattern Extracts

The structural analog — `isNonProductPath` from surfaces.ts:88-97:

```typescript
export function isNonProductPath(relativePath: string): boolean {
  const segments = relativePath.split('/');
  for (const segment of segments) {
    if (EXCLUDED_SEGMENTS.has(segment.toLowerCase())) return true;
  }
  // Suffix check: last segment ending with -e2e (e.g., "gauzy-e2e")
  const lastSegment = segments[segments.length - 1] || '';
  if (lastSegment.toLowerCase().endsWith('-e2e')) return true;
  return false;
}
```

The constant generation pattern — surfaces.ts:105-111:

```typescript
export const NON_PRODUCT_GLOB_IGNORE: string[] = [
  // Build artifacts
  '**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**',
  '**/.git/**', '**/.turbo/**', '**/out/**', '**/.cache/**',
  // Non-product paths derived from EXCLUDED_SEGMENTS
  ...[...EXCLUDED_SEGMENTS].map(s => `**/${s}/**`),
];
```

### Proof Context

surfaces.ts — `fix-non-product-code-pollution-C5`: `**/build/**` collides with legitimate build directories. Not introduced by this fix, documented in scope as out-of-scope.

git.ts — `security-hardening-C8`: retains execSync. Unrelated to this change.

No active findings overlap with this contract's assertions.

### Checkpoint Commands

- After surfaces.ts changes: `(cd 'packages/cli' && pnpm vitest run tests/engine/detectors/surfaces.test.ts tests/engine/non-product-filtering.test.ts)` — Expected: both files pass with updated assertions
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 3205+ tests pass
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 3205 passed, 2 skipped (132 test files)
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected 3220+ tests (adding ~15-20 new assertions for depth-boundary, rooted pattern, and file-path tests)
- Regression focus: `tests/engine/non-product-filtering.test.ts` (assertions change), `tests/engine/detectors/surfaces.test.ts` (new block added)
