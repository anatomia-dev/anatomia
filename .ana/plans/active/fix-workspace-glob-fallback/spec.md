# Spec: Fix Workspace Glob Fallback

**Created by:** AnaPlan
**Date:** 2026-05-25
**Scope:** .ana/plans/active/fix-workspace-glob-fallback/scope.md

## Approach

Two independent fixes in `buildCensus()` at `packages/cli/src/engine/census.ts`. Both address `@manypkg/get-packages` failure modes that cause total scan failure on real-world repos.

**Fix A — Expand `isSingleRepo` condition (line 496).**
Currently requires `result.tool.type === 'root'` AND `nonRootPackages.length === 0`. The `tool.type === 'root'` check is overly specific — `@manypkg` returns `tool.type = 'pnpm'` for repos like umami where workspace YAML exists but globs resolve to 0 packages. Drop the tool type check: when there are 0 non-root packages, treat as single-repo regardless of detected tool type. Also add a defensive guard for `result.rootPackage` being undefined in the `isSingleRepo` branch — the type allows optional, even though current implementations always set it.

**Fix B — Enhance catch block to read root `package.json` (lines 488-491).**
Currently sets `result = null` and falls through to an empty-deps source root. For JS/TS projects where `@manypkg` throws (missing `name` field in workspace packages — erxes, immich), the root `package.json` exists and has real deps. Declare `let fallbackRootPackage` before the try/catch. In the catch block, attempt to read and parse root `package.json`. In the `!result` branch (line 503), use `fallbackRootPackage` fields instead of empty objects when available. When no root `package.json` exists (Python/Go/Rust), behavior is identical to current.

## Output Mockups

No user-facing output changes. The scan produces the same terminal display and `scan.json` format. The difference is that repos which previously crashed or returned zero detection now produce populated results.

Before Fix A (umami): `TypeError: Cannot read properties of undefined (reading 'deps')` — crash.
After Fix A (umami): Scan completes. Root deps detected (Next.js, Prisma, React, Vitest).

Before Fix B (erxes): Scan completes but `allDeps: {}` — zero stack detection.
After Fix B (erxes): Scan completes with 236 deps from root `package.json` — Mongoose, React, Apollo detected.

## File Changes

### `packages/cli/src/engine/census.ts` (modify)
**What changes:** Two locations in `buildCensus()`:
1. Line 496 — simplify `isSingleRepo` condition by removing `result.tool.type === 'root'` check.
2. Lines 488-491 — enhance catch block to read root `package.json` into a `fallbackRootPackage` variable.
3. Lines 503-515 — replace hardcoded empty-deps source root with one populated from `fallbackRootPackage` when available.
4. Lines 516-528 — add defensive guard for `result.rootPackage` being undefined before the non-null assertion.

**Pattern to follow:** The `isSingleRepo` branch at lines 516-528 shows exactly how to read root package.json fields into a source root. Fix B's `!result` branch should follow the same field access pattern.
**Why:** Without these changes, repos with unresolvable workspace globs crash, and repos where `@manypkg` throws on invalid workspace packages produce zero detection.

### `packages/cli/tests/engine/census.test.ts` (modify)
**What changes:** Add 3 new test cases exercising Fix A (0-package workspace), Fix B (throw with root package.json), and Fix B edge case (throw without root package.json).
**Pattern to follow:** The existing "builds census for empty directory" test at line 27 — same `mkdtempSync` + try/finally cleanup pattern.
**Why:** AC5, AC6, AC7 require explicit test coverage for both fixes and the edge case.

## Acceptance Criteria

- [ ] AC1: `ana scan` on umami completes without crashing. Stack detection includes Next.js, Prisma, and React (from root package.json deps).
- [ ] AC2: `ana scan` on erxes detects database (Mongoose/MongoDB), framework (React or Apollo), and testing frameworks from root package.json deps. Not zero detection.
- [ ] AC3: `ana scan` on immich completes without crashing. Language should still be TypeScript.
- [ ] AC4: All existing monorepo scans produce identical results. The 39 pnpm monorepos, 13 yarn monorepos, and 6 npm monorepos in the test set are unaffected.
- [ ] AC5: A test verifies that a project with `pnpm-workspace.yaml` containing an unresolvable glob pattern and a root `package.json` with deps produces a working scan (not crash, deps detected). Exercises Fix A.
- [ ] AC6: A test verifies that when `@manypkg` throws (e.g., workspace package missing `name` field) and root `package.json` exists with deps, those deps are detected. Exercises Fix B.
- [ ] AC7: A test verifies that when `@manypkg` throws and NO root `package.json` exists, the empty-deps fallback runs (same as current behavior). Exercises Fix B edge case.
- [ ] AC8: `pnpm run test -- --run` passes.
- [ ] AC9: Build and lint pass.

## Testing Strategy

- **Unit tests:** Not applicable — `buildCensus` is an integration-level function that reads the filesystem and invokes `@manypkg`.
- **Integration tests:** 3 new tests in `census.test.ts` using temp directories with synthetic project structures:
  1. **Fix A test:** Create temp dir with `package.json` (has deps like `next`, `vitest`) + `pnpm-workspace.yaml` with glob `packages: ['nonexistent-dir/*']`. `@manypkg` returns 0 non-root packages. Assert: `layout === 'single-repo'`, deps from root package.json are in `allDeps`.
  2. **Fix B test:** Create temp dir with root `package.json` (has deps) + subdirectory with a `package.json` missing the `"name"` field + `pnpm-workspace.yaml` pointing at that subdirectory. `@manypkg` throws on the nameless package. Assert: `layout === 'single-repo'`, deps from root package.json are in `allDeps`.
  3. **Fix B edge case:** Create temp dir with NO `package.json` at root + a `pnpm-workspace.yaml`. `@manypkg` throws (no root package.json). Assert: `layout === 'single-repo'`, `allDeps` is empty — same as current behavior.
- **Edge cases:** The three tests above ARE the edge cases. The existing Anatomia self-scan test covers the normal monorepo path (regression guard).

## Dependencies

None. Both fixes are self-contained changes to `buildCensus()`.

## Constraints

- Engine files have zero CLI dependencies — no chalk, no ora, no commander. Both fixes use only `node:fs` and `node:path` (already imported).
- `existsSync` and `readFileSync` are already imported at line 11 of census.ts.
- The `SourceRoot` type from `src/engine/types/engineResult.ts` defines the shape — all fields must be provided.

## Gotchas

- **Fix A changes `isSingleRepo` semantics.** After the fix, any repo where `@manypkg` succeeds but finds 0 non-root packages is treated as single-repo — regardless of `tool.type`. This is correct but different from current behavior where `tool.type !== 'root'` with 0 packages would enter the monorepo branch and crash. The `monorepoTool` variable at line 590 correctly handles this: `(isSingleRepo || !result) ? null : ...` — when `isSingleRepo` is true, `monorepoTool` is null.
- **Fix A's defensive guard on `result.rootPackage`.** In the `isSingleRepo` branch (line 517), `result.rootPackage!` uses a non-null assertion. After Fix A, this branch fires when `result` is non-null but has 0 packages. `rootPackage` should always exist in this case, but the type allows optional. Add `if (!result?.rootPackage)` guard before line 517 that falls through to the empty-deps path. This mirrors the scope's recommendation for defensive typing.
- **Fix B test needs `@manypkg` to actually throw.** Don't mock — create a real filesystem structure that triggers the throw. A workspace package.json without a `"name"` field causes `@manypkg` to throw. This is verified behavior from the scope's investigation of erxes and immich.
- **Fix B edge case test.** A `pnpm-workspace.yaml` without a root `package.json` is unusual but valid for the test. `@manypkg` will throw because it can't find a root package.json. The catch block fires, `existsSync` returns false, `fallbackRootPackage` stays null, and the empty-deps source root is created.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Engine files have zero CLI dependencies — pure functions only.
- Use `| null` for fields that were checked and found empty.
- Prefer early returns over nested conditionals.
- Empty catch blocks in engine are intentional — graceful degradation pattern. The inner catch in Fix B (corrupt package.json) follows this pattern.
- Always use `--run` with `pnpm test` / `pnpm vitest` to avoid watch mode hang.
- Exported functions require `@param` and `@returns` JSDoc tags. `buildCensus` is already exported with JSDoc — no new exports needed.

### Pattern Extracts

**Existing `isSingleRepo` branch (census.ts lines 516-528) — the pattern Fix B's `!result` branch should follow:**
```typescript
// packages/cli/src/engine/census.ts lines 516-528
  } else if (isSingleRepo) {
    const pkg = result.rootPackage!;
    sourceRoots = [{
      absolutePath: normalizedRoot,
      relativePath: '.',
      packageName: pkg.packageJson.name ?? null,
      fileCount: countSourceFiles(normalizedRoot),
      isPrimary: true,
      deps: (pkg.packageJson.dependencies ?? {}) as Record<string, string>,
      devDeps: (pkg.packageJson.devDependencies ?? {}) as Record<string, string>,
      hasBin: !!((pkg.packageJson as unknown as Record<string, unknown>)['bin']),
      scripts: Object.keys(((pkg.packageJson as unknown as Record<string, unknown>)['scripts'] as Record<string, unknown> | null) ?? {}),
    }];
```

**Existing empty-dir test (census.test.ts lines 27-42) — the pattern for new tests:**
```typescript
// packages/cli/tests/engine/census.test.ts lines 27-42
  it('builds census for empty directory (no package.json)', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tmpDir = mkdtempSync(join(tmpdir(), 'census-test-'));
    try {
      const census = await buildCensus(tmpDir);
      expect(census.layout).toBe('single-repo');
      expect(census.monorepoTool).toBeNull();
      expect(census.sourceRoots).toHaveLength(1);
      expect(census.sourceRoots[0]!.isPrimary).toBe(true);
      expect(Object.keys(census.allDeps)).toHaveLength(0);
    } finally {
      rmSync(tmpDir, { recursive: true, maxRetries: 3, retryDelay: 200 });
    }
  });
```

### Proof Context

No active proof findings directly related to the `buildCensus` function's workspace handling or the catch block. The existing findings (primary selection tier 4, FRAMEWORK_HINTS export, discoverSchemas filter) are unrelated to this fix.

No active proof findings for `census.test.ts`.

### Checkpoint Commands

- After modifying `census.ts`: `(cd 'packages/cli' && pnpm vitest run census.test)` — Expected: existing 2-3 tests pass (no new tests yet)
- After adding tests to `census.test.ts`: `(cd 'packages/cli' && pnpm vitest run census.test)` — Expected: 5-6 tests pass (2-3 existing + 3 new)
- After all changes: `pnpm run test -- --run` — Expected: 2924 tests pass in 124 test files
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 2921 passed, 2 skipped (2923 total)
- Current test files: 124
- Command used: `pnpm run test -- --run`
- After build: expected 2924 passed (2921 + 3 new) in 124 test files (no new test files)
- Regression focus: `census.test.ts` (directly modified), `scanProject.test.ts` (uses `buildCensus` indirectly via `scanProject`)
