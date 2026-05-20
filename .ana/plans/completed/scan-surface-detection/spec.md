# Spec: Scan Surface Detection

**Created by:** AnaPlan
**Date:** 2026-05-20
**Scope:** .ana/plans/active/scan-surface-detection/scope.md

## Approach

Add a `surfaces` array to scan.json and enrich `monorepo.packages` with per-package intelligence. The detection lives in a new pure function `detectSurfaces(census)` in a new detector file, following the structural pattern of `dependencies.ts` — census as input, typed result as output, no filesystem access.

Three signals classify surfaces:
1. **Bin + dev script** — package declares a `bin` field AND has `"dev"` in its scripts.
2. **apps/ + strong config OR fileCount > 50** — package under `apps/` with a strong framework config file or substantial size.
3. **Strong framework config** — package anywhere with a strong framework config file (e.g., `nest-cli.json`, `next.config.ts`).

Pre-filters exclude packages before signal evaluation: root package, packages with < 5 source files, packages whose last path segment matches known infrastructure patterns.

The census gains a `scripts` field on `SourceRoot` and 9 new `FRAMEWORK_HINTS` entries. The `EngineResult` gains named types `Surface` and `EnrichedPackage` for the new fields.

## Output Mockups

### scan.json additions (monorepo)

```json
{
  "surfaces": [
    {
      "name": "cli",
      "path": "packages/cli",
      "packageName": "anatomia-cli",
      "language": "TypeScript",
      "framework": null,
      "testing": ["Vitest"],
      "sourceFiles": 251
    },
    {
      "name": "website",
      "path": "website",
      "packageName": "anatomia-website",
      "language": "TypeScript",
      "framework": "Next.js",
      "testing": ["Vitest"],
      "sourceFiles": 132
    }
  ],
  "monorepo": {
    "packages": [
      {
        "name": "anatomia-cli",
        "path": "packages/cli",
        "language": "TypeScript",
        "framework": null,
        "testing": ["Vitest"],
        "hasBin": true,
        "scripts": ["build", "dev", "test", "lint", "clean"],
        "sourceFiles": 251
      }
    ]
  }
}
```

### scan.json (single-repo)

```json
{
  "surfaces": []
}
```

### Terminal output (monorepo with surfaces)

```
  Workspace    Turborepo (pnpm) · primary: packages/cli
  Surfaces     cli · website (Next.js)
```

### Terminal output (5+ surfaces, truncated)

```
  Surfaces     api · cli · dashboard (Next.js) · worker (+2 more)
```

## File Changes

### `packages/cli/src/engine/types/census.ts` (modify)

**What changes:** Add `scripts: string[]` to the `SourceRoot` interface.
**Pattern to follow:** Existing fields on `SourceRoot` — same documentation style, same JSON-serializable constraint.
**Why:** Surface detection Signal 1 needs script keys to check for `dev`. The census is where per-package data belongs — it's gathered once and passed to all detectors.

### `packages/cli/src/engine/census.ts` (modify)

**What changes:** Two additions: (1) 9 new entries in `FRAMEWORK_HINTS` — `nest-cli.json`, `nuxt.config.ts`, `nuxt.config.js`, `svelte.config.js`, `svelte.config.ts`, `angular.json`, `vue.config.js`, `react-router.config.js`, `astro.config.js`. (2) Populate `scripts` field in all three `SourceRoot` construction paths.
**Pattern to follow:** Existing `FRAMEWORK_HINTS` entries for file pattern/framework/check structure. Existing `hasBin` population pattern for `scripts` — same cast through `(pkg.packageJson as unknown as Record<string, unknown>)['scripts']`, then `Object.keys()` with nullish fallback.
**Why:** New framework hints enable Signal 3 detection for NestJS, Nuxt, SvelteKit, Angular, Vue CLI. The `scripts` field enables Signal 1 (`bin + dev`). Three code paths build SourceRoot: no-package.json fallback (gets `scripts: []`), single-repo (gets scripts from root package.json), monorepo (gets scripts from each workspace package.json).

### `packages/cli/src/engine/types/engineResult.ts` (modify)

**What changes:** (1) Add `Surface` named interface with fields: `name`, `path`, `packageName`, `language`, `framework`, `testing`, `sourceFiles`. (2) Add `EnrichedPackage` named interface extending the current inline `{ name: string; path: string }` with: `language`, `framework`, `testing`, `hasBin`, `scripts`, `sourceFiles`. (3) Replace `monorepo.packages` inline type with `EnrichedPackage[]`. (4) Add `surfaces: Surface[]` to `EngineResult`. (5) Update `createEmptyEngineResult()` with `surfaces: []`.
**Pattern to follow:** Existing named types in the file — `ReadmeResult`, `StackRole`. The `EnrichedPackage` extends the existing shape so downstream consumers that only read `.name` and `.path` are unaffected. Place `surfaces` after `monorepo` in the interface — logically grouped.
**Why:** Named types make both `Surface` and `EnrichedPackage` importable by the detector and test files. Inline types with 7+ fields are unwieldy. The `createEmptyEngineResult()` update is mandatory — the explicit return type annotation enforces completeness, so TypeScript will fail to compile without it.

### `packages/cli/src/engine/detectors/surfaces.ts` (create)

**What changes:** New detector file with:
- `STRONG_FRAMEWORK_CONFIGS` — a `Set<string>` of basenames (`next.config.ts`, `next.config.js`, `next.config.mjs`, `nest-cli.json`, `nuxt.config.ts`, `nuxt.config.js`, `svelte.config.js`, `svelte.config.ts`, `angular.json`, `vue.config.js`, `remix.config.js`, `remix.config.ts`, `react-router.config.ts`, `react-router.config.js`, `astro.config.mjs`, `astro.config.ts`, `astro.config.js`).
- `INFRA_PATTERNS` — a `Set<string>` of last-path-segment patterns to exclude: `tsconfig`, `eslint-config`, `prettier-config`, `tailwind-config`, `config-typescript`, `biome-config`.
- `MIN_SOURCE_FILES = 5` — pre-filter threshold.
- `APPS_DIR_FILE_THRESHOLD = 50` — Signal 2 threshold for apps/ packages without strong config.
- `detectSurfaces(census, rootDevDeps)` — pure function returning `Surface[]`. Takes `rootDevDeps` separately for testing fallback.
- Per-surface enrichment logic that produces `EnrichedPackage[]` (exported helper or inline in the same function — builder's choice on structure).
- Name derivation: last path segment, normalized (lowercase, underscores to hyphens, dots stripped, `@scope` prefix stripped), with collision disambiguation (both colliding names get parent directory prepended) and version-string normalization (segments matching `v\d+` or purely numeric → parent prepended).
- Surfaces sorted alphabetically by path.

**Pattern to follow:** `dependencies.ts` — pure function, census input, typed output. Lookup tables as module-level constants. Export the function and the constant sets (tests verify the sets directly).
**Why:** Isolating detection in its own file follows the detector architecture. A stranger adding a new framework: one entry in `FRAMEWORK_HINTS` (census.ts) + one entry in `STRONG_FRAMEWORK_CONFIGS` (surfaces.ts). Adjusting thresholds: one constant.

The function needs access to `TESTING_PACKAGES` from `dependencies.ts` for per-surface testing detection. Import and reuse — don't duplicate. Per-surface testing: check surface's own `deps` + `devDeps` against `TESTING_PACKAGES`. If nothing found, check `rootDevDeps` (testing frameworks commonly installed at root in monorepos).

Per-surface language detection:
1. Check if the source root has a tsconfig entry in `census.configs.tsconfigs` → "TypeScript"
2. Check if the source root's own devDeps include `typescript` → "TypeScript"
3. Check if the source root has Node deps (non-empty `deps` or `devDeps`) → "JavaScript"
4. Otherwise → `null`

Per-surface framework detection: check `census.configs.frameworkHints` for entries whose `sourceRootPath` matches the source root. Use the first strong framework hint's framework name, mapped to display name (same mapping used in `scan-engine.ts` via `getFrameworkDisplayName`). Import `getFrameworkDisplayName` from the framework detection module.

**Important:** `FrameworkHintEntry` stores `path` (full relative, e.g., `apps/web/next.config.ts`), not the original pattern. The STRONG_FRAMEWORK_CONFIGS check must use `path.basename(hint.path)` to extract the filename and match against the set.

### `packages/cli/src/engine/scan-engine.ts` (modify)

**What changes:** (1) Import `detectSurfaces` and call it after census is built. (2) Enrich the `mono.packages` mapping to include the new `EnrichedPackage` fields by reading from census source roots. (3) Add `surfaces` to the return object.
**Pattern to follow:** Existing detector calls in `scanProject()` — import at top, call after census, spread into result. The mono.packages enrichment happens where the current `.map(r => ({ name, path }))` is — extend that map with the additional fields.
**Why:** Surface detection depends only on census data, so it runs early. Package enrichment happens at the same point monorepo.packages is already built.

### `packages/cli/src/commands/scan.ts` (modify)

**What changes:** Add a "Surfaces" display line after the "Workspace" line. Conditional on monorepo + surfaces.length > 0. Each surface shows `name` or `name (framework)` when framework is non-null. Truncate at 4 surfaces with `(+N more)` overflow, matching the services line pattern.
**Pattern to follow:** The services line at the same location in scan.ts — same chalk styling (`chalk.gray` label, padEnd(12)), same truncation pattern with `chalk.dim` for overflow.
**Why:** Terminal output is the human-readable version of scan.json. Surfaces are monorepo intelligence that developers need to see during scan.

### `packages/cli/tests/engine/detectors/surfaces.test.ts` (create)

**What changes:** Unit tests for `detectSurfaces` using synthetic census data. Covers all 13 acceptance criteria through test cases with constructed `ProjectCensus` objects.
**Pattern to follow:** Existing detector tests in `tests/engine/detectors/` — import the function, build minimal input, assert output. The census.test.ts pattern of constructing test data inline (not from filesystem) is the right model for unit tests.
**Why:** Pure function + synthetic data = fast, deterministic tests. No filesystem access needed.

### `packages/cli/tests/contract/analyzer-contract.test.ts` (modify)

**What changes:** Add field access assertions for `surfaces` on `createEmptyEngineResult()` — verify `result.surfaces` exists and is an empty array.
**Pattern to follow:** Existing field completeness checks in the same file.
**Why:** The contract test catches field renames and ensures `createEmptyEngineResult()` populates all fields.

## Acceptance Criteria

- [ ] AC1: For monorepo projects, scan.json contains a `surfaces` array where each entry has `name`, `path`, `packageName`, `language`, `framework`, `testing`, and `sourceFiles` fields.
- [ ] AC2: For monorepo projects, scan.json `monorepo.packages` entries include `language`, `framework`, `testing`, `hasBin`, `scripts`, and `sourceFiles` fields.
- [ ] AC3: For single-repo projects, `surfaces` is an empty array and `monorepo.packages` is unchanged.
- [ ] AC4: Signal 1 detects packages with `hasBin AND has "dev" in scripts`. Verified: Anatomia CLI (bin+dev → detected), Dub CLI (bin+dev → detected), Cal.com prisma (bin, no dev → filtered), Cal.com app-store-cli (bin, no dev → filtered), Twenty twenty-sdk (bin, no dev → filtered).
- [ ] AC5: Signal 2 detects packages under `apps/` that have a strong framework config OR `fileCount > 50`. Verified: Formbricks storybook (apps/, 7 files, no strong config → filtered), Midday desktop (apps/, 3 files, no strong config → filtered), Midday worker (apps/, 125 files → detected), Cap media-server (apps/, 28 files, no strong config → filtered).
- [ ] AC6: Signal 3 detects packages with a strong framework config file regardless of location. Verified: Twenty twenty-server (nest-cli.json → detected), Documenso remix (react-router.config.ts → detected).
- [ ] AC7: Per-surface language detection uses tsconfig presence as primary signal, falling back to own devDeps for TypeScript, then "JavaScript" for Node packages without tsconfig, then null.
- [ ] AC8: Surface names are derived from the last path segment, normalized (lowercase, underscores to hyphens, dots stripped, @scope stripped), with collision disambiguation (both colliding names get parent directory prepended) and version-string normalization (v1/v2/numeric → parent-segment prepended).
- [ ] AC9: Surfaces are sorted alphabetically by path for deterministic diffs between scan runs.
- [ ] AC10: The scan terminal output includes a "Surfaces" line for monorepos with detected surfaces, following the existing display format.
- [ ] AC11: `SourceRoot` includes a `scripts: string[]` field (script keys from package.json). `FRAMEWORK_HINTS` includes 9 new entries: nest-cli.json, nuxt.config.ts, nuxt.config.js, svelte.config.js, svelte.config.ts, angular.json, vue.config.js, react-router.config.js, astro.config.js.
- [ ] AC12: Adding a new framework: one entry in `FRAMEWORK_HINTS` + one entry in `STRONG_FRAMEWORK_CONFIGS`. Adjusting detection thresholds: one constant. A stranger can extend either without understanding the rest of the system.
- [ ] AC13: Packages with fewer than 5 source files are excluded from surface consideration regardless of other signals. Packages whose last path segment exactly matches a known infrastructure pattern (tsconfig, eslint-config, prettier-config, tailwind-config, config-typescript, biome-config) are excluded. The root package (relativePath of `.` or `""`) is excluded. These pre-filters run before any signal evaluation.
- [ ] Tests pass with `pnpm run test -- --run`
- [ ] No build errors with `pnpm run build`
- [ ] No lint errors with `cd packages/cli && pnpm run lint`

## Testing Strategy

- **Unit tests:** `tests/engine/detectors/surfaces.test.ts` — synthetic census objects exercising all three signals, pre-filters, name derivation (including collision disambiguation and version-string normalization), language/framework/testing enrichment, sorting, single-repo empty result, and edge cases (pure-JS package, root package exclusion, infra pattern exclusion). Follow the detector test pattern: import function, construct minimal census, assert output.
- **Contract tests:** Update `analyzer-contract.test.ts` to verify `surfaces` field exists on `createEmptyEngineResult()`.
- **Edge cases:**
  - Package with bin + dev but < 5 files → filtered by pre-filter
  - Infrastructure package under apps/ with > 50 files → filtered by infra pattern
  - Two packages producing the same name after normalization → both get parent prepended
  - Version-like path segments (v1, v2, numeric) → parent prepended
  - Package with no deps, no tsconfig, not Node → language: null
  - Single-repo → surfaces is `[]`, monorepo.packages unchanged

## Dependencies

- `TESTING_PACKAGES` exported from `dependencies.ts` (already exported)
- `getFrameworkDisplayName` — verify this is exported from the framework detection module before importing. If not exported, the builder should export it or inline the mapping.
- Census `scripts` field must be populated before `detectSurfaces` is called (census is built first, so this is automatic)

## Constraints

- Engine files have zero CLI dependencies — no chalk, no commander, no ora in `surfaces.ts`.
- `createEmptyEngineResult()` uses explicit return type — adding `surfaces` without updating the factory causes compile failure. This is intentional and enforced.
- The `engineResult-partial.ts` validator is NOT modified — scope explicitly says `surfaces` doesn't need partial validation.
- Backward compatibility: existing consumers of `monorepo.packages` read only `.name`, `.path`, and `.length`. The `EnrichedPackage` type extends the existing shape, so TypeScript allows reading the original fields without change.

## Gotchas

- **Three SourceRoot construction paths.** `census.ts` has three code paths that build `SourceRoot` objects: no-package.json fallback (~line 388), single-repo (~line 400), monorepo (~line 412). ALL three need the `scripts` field. The first gets `scripts: []`. The second and third use the cast pattern from `hasBin` to read scripts from package.json.
- **`@manypkg/get-packages` TypeScript types don't include `scripts`.** Access via the same cast pattern already used for `bin`: `(pkg.packageJson as unknown as Record<string, unknown>)['scripts']`. Then `Object.keys(scripts ?? {})` with appropriate type narrowing.
- **`FrameworkHintEntry` stores `path` not `pattern`.** The `path` field is the full relative path (e.g., `apps/web/next.config.ts`). STRONG_FRAMEWORK_CONFIGS matching must use `path.basename(hint.path)` to extract the filename. All strong patterns are basenames (no subdirectory prefix), so this is correct.
- **`createEmptyEngineResult()` explicit return type.** Adding `surfaces` to the `EngineResult` interface will fail to compile until `createEmptyEngineResult()` is updated to include `surfaces: []`. The comment at line 338 documents this design.
- **Import `getFrameworkDisplayName`.** This function lives in the framework detection module. Verify it's exported before importing. If it's not exported, the builder needs to either export it or create a local framework-name mapping. Check the actual export before writing the import.
- **`selectPrimary` is NOT affected.** The 9 new `FRAMEWORK_HINTS` entries could theoretically change which package is selected as primary in existing repos. The scope verified this doesn't happen — the new hints only add detection for packages that are already smaller than existing primaries. Don't add any selectPrimary changes.
- **`monorepo.packages` in scan-engine filters out root.** The current map at scan-engine.ts line 649-651 filters `r.relativePath !== '.' && r.relativePath !== ''`. The enriched version must keep this filter.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. No default exports.
- Engine files have zero CLI dependencies — no chalk in `surfaces.ts`.
- Use `| null` for fields that were checked and found empty. `language: string | null`, `framework: string | null`.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Constants use SCREAMING_SNAKE_CASE.
- Always use `--run` flag with vitest to avoid watch mode hang.

### Pattern Extracts

**SourceRoot construction with cast pattern (census.ts:412-424):**
```typescript
sourceRoots = result.packages.map(pkg => {
  const abs = pkg.dir;
  const rel = toPosix(path.relative(normalizedRoot, abs));
  return {
    absolutePath: abs,
    relativePath: rel,
    packageName: pkg.packageJson.name ?? null,
    fileCount: countSourceFiles(abs),
    isPrimary: false, // set below after primary selection
    deps: (pkg.packageJson.dependencies ?? {}) as Record<string, string>,
    devDeps: (pkg.packageJson.devDependencies ?? {}) as Record<string, string>,
    hasBin: !!((pkg.packageJson as unknown as Record<string, unknown>)['bin']),
  };
});
```

**Services display line with truncation (scan.ts:180-185):**
```typescript
const collapsed = collapseServiceVariants(filteredServices.map(s => s.name));
const MAX_SVC = 5;
const displayed = collapsed.slice(0, MAX_SVC).join(' · ');
const overflow = collapsed.length > MAX_SVC ? ` ${chalk.dim(`(+${collapsed.length - MAX_SVC} more)`)}` : '';
lines.push(`  ${chalk.gray('Services'.padEnd(12))} ${displayed}${overflow}`);
```

**Monorepo packages mapping (scan-engine.ts:649-651):**
```typescript
packages: census.sourceRoots
  .filter(r => r.relativePath !== '.' && r.relativePath !== '')
  .map(r => ({ name: r.packageName ?? r.relativePath, path: r.relativePath })),
```

### Proof Context

- `scan-engine.ts`: 2 pipeline cycles. One finding about `detectNonNodeTesting` using synchronous `existsSync` — not relevant to this build. One build concern about A017 test coverage — not relevant.
- `census.ts`: 1 pipeline cycle. Dormant concern about root-level module path matching — not relevant to this build.
- `engineResult.ts`, `scan.ts`: No active proof findings.

### Checkpoint Commands

- After `census.ts` + `types/census.ts` changes: `cd packages/cli && pnpm vitest run tests/engine/census.test.ts` — Expected: existing census tests pass (scripts field is additive)
- After `engineResult.ts` changes: `cd packages/cli && pnpm run build` — Expected: compile succeeds (createEmptyEngineResult updated)
- After `surfaces.ts` + test file: `cd packages/cli && pnpm vitest run tests/engine/detectors/surfaces.test.ts` — Expected: all surface detection tests pass
- After all changes: `cd packages/cli && pnpm vitest run` — Expected: 2618+ tests pass
- Lint: `cd packages/cli && pnpm run lint` — Expected: no errors

### Build Baseline
- Current tests: 2618 passed, 2 skipped (2620 total)
- Current test files: 115 passed
- Command used: `cd packages/cli && pnpm vitest run`
- After build: expected 2618 + new surface tests passing, 116+ test files
- Regression focus: `tests/contract/analyzer-contract.test.ts` (field completeness), `tests/engine/census.test.ts` (SourceRoot shape change)
