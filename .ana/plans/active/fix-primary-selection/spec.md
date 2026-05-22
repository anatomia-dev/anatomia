# Spec: Fix Primary Package Selection in Monorepos

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/fix-primary-selection/scope.md

## Approach

Modify `selectPrimary` in `census.ts` to implement a 4-policy selection chain. The function gains a `projectDirName` parameter (the repo directory name, not the package.json name). The policies fire in order — first match wins:

- **Policy 0:** Non-product path exclusion. Filter candidates using `isNonProductPath` from `detectors/surfaces.ts`. If all candidates are excluded, fall back to the unfiltered list. This is a filter step, not a selection — it narrows the candidate pool for Policies 1–3.
- **Policy 1:** apps/ with framework evidence (existing logic, unchanged). Operates on filtered candidates.
- **Policy 2:** Name match. Compare `projectDirName` against each candidate's npm package name using tiered priority. Root packages (`relativePath === '.'`) are excluded from name-match candidates. Within a tier, largest file count wins as tiebreaker. The guard requires matched packages to have >= 10 files AND >= 5% of the largest filtered candidate's file count.
- **Policy 3:** Most files (existing logic). Operates on filtered candidates, not the original list.

The tiered name-match priority (Policy 2), from highest to lowest:
1. **Exact name** — package name equals directory name (e.g., dir `medusa`, package `medusa`)
2. **Scoped + exact** — bare name of scoped package equals directory name (e.g., dir `medusa`, package `@medusajs/medusa`)
3. **Scoped + identity word** — bare name is one of {core, server} AND scope contains directory name (e.g., dir `logto`, package `@logto/core`; dir `trpc`, package `@trpc/server`)
4. **Scoped + self-named** — bare name equals the scope's bare name (e.g., dir `strapi`, package `@strapi/strapi`)

Export `selectPrimary` so it can be unit-tested with mocked `SourceRoot[]` arrays. The existing census tests are integration-level against real repos — the new tests need to verify the policy chain as a pure function.

This depends on Issue #1 (fix-false-surface-detection) being merged first. The import of `isNonProductPath` will fail at compile time if Issue #1 hasn't shipped — this is correct hard-dependency behavior.

## Output Mockups

No user-facing output changes. The effect is observable in `scan.json` where `monorepo.primaryPackage` and `primarySourceRoot` change for affected repos:

```
# Before (logto)
primarySourceRoot: "packages/console"    # 1717 files, biggest
primaryPackage: { name: "@logto/console", path: "packages/console" }

# After (logto)
primarySourceRoot: "packages/core"       # name-match: @logto/core, identity word "core"
primaryPackage: { name: "@logto/core", path: "packages/core" }
```

## File Changes

### packages/cli/src/engine/census.ts (modify)
**What changes:** Export `selectPrimary`. Add `projectDirName` parameter. Implement Policy 0 (filter via `isNonProductPath`), Policy 2 (name-match with tiers and guard), and narrow Policy 3 to filtered candidates. Add private helper to extract scope and bare name from npm package names. Import `isNonProductPath` from `../detectors/surfaces.js`. Update the caller at the `selectPrimary` call site to pass `path.basename(normalizedRoot)`.
**Pattern to follow:** The existing Policy 1 pattern inside `selectPrimary` — filter candidates, sort by file count descending, return first match.
**Why:** Current Policy 2 (most files) picks the wrong package for 7 of 8 affected monorepos. The name-match policy uses the strongest available identity signal (directory name) to select correctly.

### packages/cli/tests/engine/census-primary.test.ts (create)
**What changes:** Unit tests for the exported `selectPrimary` function with mocked `SourceRoot[]` arrays and `FrameworkHintEntry[]`. Covers all matching tiers, the file-count guard (both absolute and relative thresholds), root exclusion, Policy 0 filtering with fallback, and regression tests for all 8 affected repos plus directus and scalar edge cases.
**Pattern to follow:** The existing `census-detection.test.ts` pattern — import the function directly, build test data in the test, assert return values. No filesystem fixtures needed since `selectPrimary` is pure.
**Why:** The policy chain has 4 tiers, 2 guard thresholds, and 3 interaction points between policies. Integration tests through `buildCensus` can't cover the matrix without real repo clones.

## Acceptance Criteria

- [ ] AC1: `selectPrimary()` accepts a `projectDirName` parameter and applies name-match before most-files fallback.
- [ ] AC2: Non-product paths (examples/, test/, templates/, etc.) are excluded from the candidate pool via `isNonProductPath` from Issue #1. If all candidates excluded, falls back to unfiltered list.
- [ ] AC3: Name-match fires in tiered priority: exact name > scoped+exact > scoped+identity word {core, server} > scoped+self-named. Within a tier, largest file count wins as tiebreaker.
- [ ] AC4: File-count minimum guard: matched package must have >= 10 files AND >= 5% of the largest viable candidate's file count (after Policy 0 filtering).
- [ ] AC5: Policy 3 (most files fallback) operates on Policy 0 filtered candidates, not the original unfiltered list.
- [ ] AC6: Caller at the `selectPrimary` call site passes `path.basename(normalizedRoot)` as the directory name.
- [ ] AC7: Root package (relativePath '.') is excluded from Policy 2 name-match candidates as defense-in-depth. Root is NOT excluded from Policy 3.
- [ ] AC8: All 8 affected repos produce correct new primaries: logto→packages/core, medusa→packages/medusa, trpc→packages/server, payload→packages/payload, strapi→packages/core/strapi, vercel-ai→packages/ai, n8n→packages/cli, scalar→unchanged (guard blocks).
- [ ] AC9: All Policy 1 repos produce identical results (dub, inbox-zero, supabase, cal.com, teable, formbricks, midday, tegon, trigger.dev).
- [ ] AC10: Directus produces identical result — wrapper (3 files) blocked by guard, api/ wins via Policy 3.
- [ ] AC11: Anatomia self-scan unchanged — "anatomia-cli" does not match "anatomia", Policy 3 picks packages/cli.
- [ ] AC12: Unit tests cover all matching variants, the file-count guard (both absolute and relative thresholds), root exclusion, regression tests for directus and scalar, and the full policy chain.
- [ ] AC13: Tests pass with `(cd 'packages/cli' && pnpm vitest run)`.
- [ ] AC14: No build errors — `pnpm run build` succeeds.

## Testing Strategy

- **Unit tests:** Test `selectPrimary` directly with constructed `SourceRoot[]` arrays. Each test builds the minimal set of roots needed to exercise a specific policy or edge case. Group by: tier matching (4 tiers), guard thresholds (absolute < 10, relative < 5%), Policy 0 filtering (non-product exclusion + fallback when all excluded), Policy 1 unchanged (apps/ + framework), root exclusion, and regression fixtures for all 8 affected repos + directus + scalar.
- **Integration:** The existing `census.test.ts` Anatomia self-scan test validates AC11 implicitly — "anatomia-cli" won't match directory name "anatomia", so packages/cli wins via most files.
- **Edge cases:** Multiple matches in the same tier (file count tiebreaker). Empty `projectDirName`. Package with no `packageName` (null). All candidates excluded by Policy 0. Single candidate that matches name but fails guard.

## Dependencies

- **Issue #1 (fix-false-surface-detection) must be merged to main.** `isNonProductPath` is imported from `src/engine/detectors/surfaces.ts`. Without it, the build fails at import resolution.

## Constraints

- `selectPrimary` must remain a pure function — no filesystem access, no async.
- Engine files have zero CLI dependencies — no chalk, commander, ora.
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Explicit return types on the exported `selectPrimary` function.
- `@param` and `@returns` JSDoc on the exported function.

## Gotchas

- **`projectDirName` comes from `path.basename(normalizedRoot)`, NOT from `projectName`.** `projectName` (line ~398 in census.ts) comes from root package.json's `name` field, which is often "root", "monorepo", or "@scope/monorepo". The directory name is the identity signal.
- **Root exclusion is Policy 2 only.** Root (`relativePath === '.'`) must remain a viable candidate for Policy 3. Excluding it from the fallback would break repos where no name matches and no apps/ exist.
- **The guard's "largest candidate" denominator uses Policy 0 filtered candidates.** For payload: `test/` (1754 files) is excluded by Policy 0, so the largest viable candidate is `packages/payload` (679 files). The guard is self-referential (679/679 = 100%) — this is correct.
- **Package names with scopes need bare-name extraction.** `@medusajs/medusa` → scope `medusajs`, bare `medusa`. Unscoped packages: bare = full name, scope = empty string. Handle null `packageName` by skipping the candidate for name-match.
- **The `isNonProductPath` import path from census.ts is `../detectors/surfaces.js`.** Census is at `src/engine/census.ts`, surfaces is at `src/engine/detectors/surfaces.ts` — one level down.
- **Identity words are exactly {core, server}.** No fuzzy matching, no additional words. The scope explicitly rejected `engine`, `sdk`, `api`, `main`, `app`.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { isNonProductPath } from '../detectors/surfaces.js'`
- Use `import type` for type-only imports, separate from value imports
- Explicit return types on exported functions
- `@param` and `@returns` JSDoc on exported functions
- Engine files have zero CLI dependencies
- Prefer early returns over nested conditionals
- Use `| null` for checked-and-empty fields; `?:` for unchecked
- Named exports only, no default exports

### Pattern Extracts

The existing Policy 1 pattern in `selectPrimary` (census.ts:116-123) — this is the structural pattern for Policy 2:

```typescript
// census.ts lines 116-123
const hintPaths = new Set(frameworkHints.map(h => h.sourceRootPath));
const appsWithFramework = roots
  .filter(r => r.relativePath.startsWith('apps/') && hintPaths.has(r.relativePath))
  .sort((a, b) => b.fileCount - a.fileCount);
if (appsWithFramework.length > 0) return appsWithFramework[0]!.relativePath;
```

The caller site (census.ts:478):

```typescript
primarySourceRoot = selectPrimary(sourceRoots, frameworkHints);
```

The `SourceRoot` interface (types/census.ts:14-24):

```typescript
export interface SourceRoot {
  absolutePath: string;
  relativePath: string;
  packageName: string | null;
  fileCount: number;
  isPrimary: boolean;
  deps: Record<string, string>;
  devDeps: Record<string, string>;
  hasBin: boolean;
  scripts: string[];
}
```

### Proof Context

- census.ts: 1 prior pipeline cycle. One dormant concern about root-level module paths — not relevant to this change (we're matching package names, not module paths).

### Checkpoint Commands

- After modifying census.ts: `(cd 'packages/cli' && pnpm vitest run census)` — Expected: existing census tests still pass
- After creating census-primary.test.ts: `(cd 'packages/cli' && pnpm vitest run census)` — Expected: all census tests pass including new ones
- After all changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 2720+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2720 passed, 2 skipped
- Current test files: 120
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected 2720 + new tests (target 20-30 new tests for the policy matrix) in 121 test files
- Regression focus: `tests/engine/census.test.ts` (existing integration tests must remain green)
