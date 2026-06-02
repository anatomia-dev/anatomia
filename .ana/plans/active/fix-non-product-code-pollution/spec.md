# Spec: Fix non-product code pollution in findings, hot files, schema counts, and deploy detection

**Created by:** AnaPlan
**Date:** 2026-06-02
**Scope:** .ana/plans/active/fix-non-product-code-pollution/scope.md

## Approach

The disease: five subsystems independently decide what "non-product code" means, producing inconsistent and incomplete exclusions. The fix: one definition, used everywhere.

`EXCLUDED_SEGMENTS` in surfaces.ts already defines non-product paths for surface detection. Export it. Derive a `NON_PRODUCT_GLOB_IGNORE` array from it (each segment → `**/{segment}/**`). Merge with the existing build-artifact globs that all three findings rules already share. Export both constants.

Then wire them in:

1. **Findings rules** (validation.ts, errorBoundaries.ts, secrets.ts) — replace each rule's local glob ignore constant with `NON_PRODUCT_GLOB_IGNORE` from surfaces.ts.
2. **Hot file detection** (git.ts) — add `isNonProductPath` filter inside the churn counting loop.
3. **Supabase schema detection** (scan-engine.ts) — filter `migrationFiles` and `schemaFiles` individually before they're spread into `files`.
4. **Deploy discovery** (census.ts) — add `isNonProductPath` skip at the top of the source-root loop.

All six integration points follow patterns already established in the codebase. No new abstractions.

## Output Mockups

No user-facing output changes. The fix removes false data from scan.json — template Dockerfiles no longer appear as deploy platform, template route files no longer inflate finding denominators, template configs no longer appear in hot files, and example migration files no longer inflate model counts.

**Before (supabase repo):**
```json
"schemas": { "supabase": { "modelCount": 400 } }
```

**After (supabase repo):**
```json
"schemas": { "supabase": { "modelCount": ~100 } }
```

**Before (payload repo):**
```json
"deployment": { "platform": "Docker" }
```

**After (payload repo):**
```json
"deployment": { "platform": null }
```

## File Changes

### `packages/cli/src/engine/detectors/surfaces.ts` (modify)
**What changes:** Export `EXCLUDED_SEGMENTS`. Add a new exported constant `NON_PRODUCT_GLOB_IGNORE` that combines build-artifact globs with non-product-path globs derived from `EXCLUDED_SEGMENTS`.
**Pattern to follow:** The existing `EXCLUDED_SEGMENTS` declaration at line 63 and the build-artifact globs from the findings rules (e.g., `**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/.git/**`, `**/.turbo/**`, `**/out/**`, `**/.cache/**`).
**Why:** Without this, each consumer maintains its own partial copy of the exclusion list.

### `packages/cli/src/engine/findings/rules/validation.ts` (modify)
**What changes:** Remove the local `ROUTE_GLOB_IGNORE` constant. Import `NON_PRODUCT_GLOB_IGNORE` from surfaces.ts. Use it in both `glob()` calls.
**Pattern to follow:** The existing glob calls at lines 75 and 82 already pass an `ignore` option — replace the value.
**Why:** validation.ts currently excludes only build artifacts. Template/example route files pass through and inflate the denominator.

### `packages/cli/src/engine/findings/rules/errorBoundaries.ts` (modify)
**What changes:** Remove the local `GLOB_IGNORE` constant. Import `NON_PRODUCT_GLOB_IGNORE` from surfaces.ts. Use it in both `glob()` calls.
**Pattern to follow:** Same as validation.ts — direct constant replacement.
**Why:** Template/example error boundary and page files pass through and produce false findings.

### `packages/cli/src/engine/findings/rules/secrets.ts` (modify)
**What changes:** Remove the local `SECRET_GLOB_IGNORE` constant. Import `NON_PRODUCT_GLOB_IGNORE` from surfaces.ts. Merge with secrets-specific globs (test files, seeds, migrations, docs, config/data files, lock files, env files, storybook) that are unique to secret detection — these remain inline because they're domain-specific, not about "non-product paths."
**Pattern to follow:** The existing `SECRET_GLOB_IGNORE` structure. The merged array is `[...NON_PRODUCT_GLOB_IGNORE, ...SECRETS_EXTRA_IGNORE]` where `SECRETS_EXTRA_IGNORE` contains the test/seed/doc/config/lock/env/storybook globs.
**Why:** secrets.ts has partial coverage (`**/test/**`, `**/tests/**`) but is missing `**/templates/**`, `**/examples/**`, `**/playground/**`, `**/references/**` and other EXCLUDED_SEGMENTS entries. The shared constant fills the gaps and prevents future divergence.

### `packages/cli/src/engine/detectors/git.ts` (modify)
**What changes:** Import `isNonProductPath` from surfaces.ts. Add a filter inside the high-churn file counting loop (after the source-extension check, before the count increment) that skips files matching `isNonProductPath`.
**Pattern to follow:** The `isNonProductPath` filter in census.ts `selectPrimary` (line 163) and `discoverSchemas` (line 327). Same function, same import path.
**Why:** Template config files (e.g., shadcn's `templates/` configs) dominate hot files without this filter.

### `packages/cli/src/engine/scan-engine.ts` (modify)
**What changes:** Filter `migrationFiles` and `schemaFiles` with `isNonProductPath` individually, before they're spread into `files`. This is in the Supabase detection block around line 535.
**Pattern to follow:** Prisma filtering at line 315: `matches = matches.filter(m => !isNonProductPath(m));`. Drizzle filtering at line 437: `.filter(m => !isNonProductPath(m))`. Same pattern, applied to Supabase.
**Why:** Without this, `firstPath` at line 543 could reference an example directory, making `schemaDir` point to a non-product path. The `modelCount` would include example migration tables.

### `packages/cli/src/engine/census.ts` (modify)
**What changes:** Add `if (isNonProductPath(root.relativePath)) continue;` at the top of the for-loop in `discoverDeployments`.
**Pattern to follow:** `discoverSchemas` at line 327: `if (isNonProductPath(root.relativePath)) continue;`. Same file, same import (already imported at line 26), same pattern.
**Why:** Template workspace packages with Dockerfiles or wrangler configs register as the project's deploy platform.

### New test file: `packages/cli/tests/engine/non-product-filtering.test.ts` (create)
**What changes:** Consolidated test file covering all non-product filtering integration points.
**Pattern to follow:** `packages/cli/tests/engine/census-detection.test.ts` — temp directory setup, `beforeEach`/`afterEach` cleanup, direct function imports, `@ana` assertion tags.
**Why:** Centralizes regression coverage for a cross-cutting concern rather than scattering tests across 6 files.

## Acceptance Criteria

- [ ] AC1: Findings rules (validation, errorBoundaries, secrets) exclude files under non-product paths — no route/page/secret findings from examples/, templates/, fixtures/, playground/, references/, or other EXCLUDED_SEGMENTS directories
- [ ] AC2: Hot file detection excludes files under non-product paths — template config files do not appear in highChurnFiles
- [ ] AC3: Supabase schema detection excludes migration files under non-product paths, and the `isNonProductPath` filter is applied BEFORE `firstPath` capture so `schemaDir` points to a real product directory
- [ ] AC4: Deploy discovery excludes deploy configs from non-product workspace packages — template Dockerfiles do not register as the project's deploy platform
- [ ] AC5: All non-product path exclusions derive from the single `EXCLUDED_SEGMENTS` set in surfaces.ts — no duplicated definitions of what constitutes non-product code
- [ ] AC6: Clean control regression bar: run `ana scan --json` on dub, langfuse, and anatomia before and after this change, diff the JSON output, zero differences (excluding `scannedAt` timestamp)
- [ ] Tests pass with `(cd 'packages/cli' && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`
- [ ] Lint passes with `pnpm run lint`

## Testing Strategy

- **Unit tests:** One new test file `packages/cli/tests/engine/non-product-filtering.test.ts` covering:
  - `NON_PRODUCT_GLOB_IGNORE` contains entries for every segment in `EXCLUDED_SEGMENTS`
  - `NON_PRODUCT_GLOB_IGNORE` contains the build-artifact globs (`node_modules`, `dist`, `build`, `.next`, `.git`, `.turbo`, `out`, `.cache`)
  - `discoverDeployments` skips roots with non-product relative paths (extend existing census-detection.test.ts pattern — create temp dir with Dockerfile under `templates/` root)
  - Hot file filtering: mock git output with template paths, verify they're excluded from `highChurnFiles`
  - Supabase filtering: verify migration files under example paths are excluded and `schemaDir` doesn't point to a non-product path

- **Integration tests:** AC6 regression bar (manual — run scan on clean repos before and after)

- **Edge cases:**
  - All high-churn files in templates → hot files section is empty (not broken)
  - All Supabase migrations in examples → Supabase schema reports `found: false`
  - Deploy config only in template root → deployment platform is null

## Dependencies

None. All changes are within the existing engine layer.

## Constraints

- Engine files have zero CLI dependencies — no chalk, no ora, no commander.
- All imports use `.js` extensions and `node:` prefix for built-ins.
- `EXCLUDED_SEGMENTS` is a `Set` — the derived globs must spread it to array first.
- `isNonProductPath` operates on forward-slash-separated relative paths — git.ts output is already in this format.

## Gotchas

- **Supabase filter ordering is critical.** Filter `migrationFiles` and `schemaFiles` BEFORE they're spread into `files`. If you filter `files` after the spread, `firstPath` at line 543 has already captured a potentially-bad path. The Prisma pattern (filter `matches` before scoring) is the correct analog.
- **secrets.ts has domain-specific globs beyond non-product paths.** Don't delete the test-file, seed, migration, doc, config, lock, env, and storybook patterns — those are secret-detection-specific exclusions, not "non-product path" exclusions. Merge `NON_PRODUCT_GLOB_IGNORE` with those, don't replace wholesale.
- **git.ts paths are already relative.** `git log --name-only` outputs repo-relative paths with forward slashes. `isNonProductPath` works on these directly — no path manipulation needed.
- **`EXCLUDED_SEGMENTS` uses `new Set()` not an array.** To derive globs, spread to array first: `[...EXCLUDED_SEGMENTS].map(s => ...)`.
- **Don't duplicate build-artifact globs.** The three findings rules all share the same 8 build-artifact patterns. Move those into `NON_PRODUCT_GLOB_IGNORE` alongside the derived non-product globs. Don't keep copies in the rule files.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { NON_PRODUCT_GLOB_IGNORE } from '../../detectors/surfaces.js'`
- Use `import type` for type-only imports, separate from value imports
- Named exports only — no default exports
- Exported functions require `@param` and `@returns` JSDoc tags
- Engine files have zero CLI dependencies
- Use `| null` for checked-and-empty fields, `?:` for unchecked
- SCREAMING_SNAKE_CASE for exported constants
- Temp directory tests use `fs.mkdtempSync` with cleanup in `afterEach`

### Pattern Extracts

**census.ts discoverSchemas filter (line 326-327) — the structural analog for deploy filtering:**
```typescript
// packages/cli/src/engine/census.ts:326-327
for (const root of roots) {
    // Skip non-product paths (e2e fixtures, examples, templates, etc.)
    if (isNonProductPath(root.relativePath)) continue;
```

**scan-engine.ts Prisma filter (line 314-315) — the structural analog for Supabase filtering:**
```typescript
// packages/cli/src/engine/scan-engine.ts:314-315
      // Filter out non-product paths (e2e/, examples/, fixtures/, etc.)
      matches = matches.filter(m => !isNonProductPath(m));
```

**git.ts churn loop (lines 371-381) — filter insertion point:**
```typescript
// packages/cli/src/engine/detectors/git.ts:371-381
  if (churnOutput) {
    for (const line of churnOutput.split('\n')) {
      const file = line.trim();
      if (!file) continue;
      // Filter to source extensions + src/ markdown
      const ext = file.substring(file.lastIndexOf('.'));
      const isSourceExt = SOURCE_EXTENSIONS.has(ext);
      const isSrcMarkdown = ext === '.md' && (file.startsWith('src/') || file.includes('/src/'));
      if (!isSourceExt && !isSrcMarkdown) continue;
      fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    }
```

**census-detection.test.ts pattern (lines 12-23) — test structure for deploy tests:**
```typescript
// packages/cli/tests/engine/census-detection.test.ts:12-23
describe('discoverDeployments', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'census-deploy-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeRoots = (dir: string) => [{ absolutePath: dir, relativePath: '.' }];
```

### Proof Context
- `census.ts`: "No test for discoverSchemas non-product path filtering" — this build adds the missing coverage for deploy filtering (same gap pattern).
- `scan-engine.ts`: High churn file (13 commits in 14 days) — keep changes minimal and targeted to the Supabase block.
- `surfaces.ts`: No relevant active findings for this change.

### Checkpoint Commands
- After surfaces.ts changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 3154 tests pass (no regressions from export addition)
- After all file changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 3154 + new tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 3154 passed, 2 skipped
- Current test files: 130
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected ~3165+ tests in 131 files (1 new test file with ~11+ tests)
- Regression focus: `census-detection.test.ts`, `git-activity.test.ts`, `scanProject.test.ts` — existing tests that exercise the modified code paths
