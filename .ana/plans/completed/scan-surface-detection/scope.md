# Scope: Scan Surface Detection

**Created by:** Ana
**Date:** 2026-05-20

## Intent

The scan reads every workspace package's dependencies, framework hints, tsconfigs, and bin fields — then merges it all into flat root-level fields (`allDeps`, `stack.framework`, `stack.testing`) and loses the per-package identity. A customer with a Next.js frontend and an Express API backend sees one detected framework, one testing framework, one set of commands. The second surface is invisible.

This scope teaches the scan to detect and report development surfaces. It adds a `surfaces` array to scan.json and enriches `monorepo.packages` with per-package intelligence. The scan is regenerated every `ana init` — wrong detection costs nothing. This is intelligence, not commitment. The ana.json schema, template changes, and pipeline integration build on this in later scopes.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium
- **Files affected:** 5 modified, 1 new file, 1 new test file
- **Blast radius:** Additive to scan.json output. All existing consumers of `monorepo.packages` read only `.name`, `.path`, and `.length` — extra fields are invisible to them. Zero changes to ana.json, templates, pipeline, or the partial schema validator.
- **Estimated effort:** 1-2 pipeline cycles
- **Multi-phase:** no

## Approach

Add a pure function `detectSurfaces(census)` that classifies which workspace packages are significant development surfaces using three signals grounded in what the census already knows: bin presence with an active development workflow, the `apps/` directory convention, and application framework config files. Enrich every workspace package in scan.json with per-package language, framework, testing, scripts, and file count data — useful for agents and future ana.json population regardless of surface classification.

The detection function lives alongside existing detectors (`dependencies.ts`, `commands.ts`, `git.ts`) and follows the same pattern: pure function, census as input, typed result as output. The census gets one new field (`scripts` on `SourceRoot`) and nine new entries to `FRAMEWORK_HINTS` (nest-cli.json, nuxt.config.ts, nuxt.config.js, svelte.config.js, svelte.config.ts, angular.json, vue.config.js, react-router.config.js, astro.config.js) to recognize NestJS, Nuxt, SvelteKit, Angular, Vue CLI, and missing extension variants for React Router and Astro.

## Acceptance Criteria
- AC1: For monorepo projects, scan.json contains a `surfaces` array where each entry has `name`, `path`, `packageName`, `language`, `framework`, `testing`, and `sourceFiles` fields.
- AC2: For monorepo projects, scan.json `monorepo.packages` entries include `language`, `framework`, `testing`, `hasBin`, `scripts`, and `sourceFiles` fields.
- AC3: For single-repo projects, `surfaces` is an empty array and `monorepo.packages` is unchanged.
- AC4: Signal 1 detects packages with `hasBin AND has "dev" in scripts`. Verified: Anatomia CLI (bin+dev → detected), Dub CLI (bin+dev → detected), Cal.com prisma (bin, no dev → filtered), Cal.com app-store-cli (bin, no dev → filtered), Twenty twenty-sdk (bin, no dev → filtered).
- AC5: Signal 2 detects packages under `apps/` that have a strong framework config OR `fileCount > 50`. Verified: Formbricks storybook (apps/, 7 files, no strong config → filtered), Midday desktop (apps/, 3 files, no strong config → filtered), Midday worker (apps/, 125 files → detected), Cap media-server (apps/, 28 files, no strong config → filtered).
- AC6: Signal 3 detects packages with a strong framework config file regardless of location. Verified: Twenty twenty-server (nest-cli.json → detected), Documenso remix (react-router.config.ts → detected).
- AC7: Per-surface language detection uses tsconfig presence as primary signal, falling back to own devDeps for TypeScript, then "JavaScript" for Node packages without tsconfig, then null.
- AC8: Surface names are derived from the last path segment, normalized (lowercase, underscores to hyphens, dots stripped, @scope stripped), with collision disambiguation (both colliding names get parent directory prepended) and version-string normalization (v1/v2/numeric → parent-segment prepended).
- AC9: Surfaces are sorted alphabetically by path for deterministic diffs between scan runs.
- AC10: The scan terminal output includes a "Surfaces" line for monorepos with detected surfaces, following the existing display format.
- AC11: `SourceRoot` includes a `scripts: string[]` field (script keys from package.json). `FRAMEWORK_HINTS` includes 9 new entries: nest-cli.json, nuxt.config.ts, nuxt.config.js, svelte.config.js, svelte.config.ts, angular.json, vue.config.js, react-router.config.js, astro.config.js.
- AC12: Adding a new framework: one entry in `FRAMEWORK_HINTS` + one entry in `STRONG_FRAMEWORK_CONFIGS`. Adjusting detection thresholds: one constant. A stranger can extend either without understanding the rest of the system.
- AC13: Packages with fewer than 5 source files are excluded from surface consideration regardless of other signals. Packages whose last path segment exactly matches a known infrastructure pattern (tsconfig, eslint-config, prettier-config, tailwind-config, config-typescript, biome-config) are excluded. The root package (relativePath of `.` or `""`) is excluded. These pre-filters run before any signal evaluation.

## Edge Cases & Risks

**Config packages with positive signals.** A config package that somehow has bin + dev or lives under apps/ with >50 files. Mitigated by the pre-filter pipeline: packages with last-path-segment matching `tsconfig`, `eslint-config`, `prettier-config`, `tailwind-config`, `config-typescript`, or `biome-config` are excluded before signal evaluation. Verified against 10+ repos — catches every real config package across Cal.com, Midday, Documenso, Latitude, Formbricks, Dub, Cap, n8n.

**selectPrimary impact from new FRAMEWORK_HINTS.** Adding nest-cli.json could change which package is selected as primary if a NestJS app under `apps/` is larger than the current primary. Verified: Cal.com's apps/api/v2 gains a nest-cli.json hint but apps/web (989 files, next.config.ts) is larger and already has a hint — primary stays apps/web. Twenty's twenty-server gains a hint but lives under `packages/`, not `apps/` — Policy 1 (apps/ with framework) doesn't consider it. No repo changes primary selection.

**FrameworkHintEntry doesn't store the pattern.** The census stores `framework` and `path` (full relative, e.g., `apps/web/next.config.ts`), not the original FRAMEWORK_HINTS pattern string. The STRONG_FRAMEWORK_CONFIGS check must use `path.basename(hint.path)` to extract the filename and match against the set. All strong patterns are basenames (no subdirectory prefix), so basename matching is correct.

**n8n collision: `packages/cli` and `packages/@n8n/cli`.** Both produce the name `cli` after @scope stripping. Disambiguation produces `packages-cli` (from `packages/cli`) and `n8n-cli` (from `packages/@n8n/cli`, where parent `@n8n` becomes `n8n` after stripping). n8n also produces 4+ surfaces because of uniform bin+dev across packages. This is accepted complexity for a 50+ package repo outside our target segment.

**Pure-JS package in a TypeScript monorepo.** Cal.com's `apps/api` is a 1-file JavaScript proxy with no tsconfig in a TypeScript monorepo. Language detection correctly produces "JavaScript" (Step 3: has Node deps, no tsconfig) rather than incorrectly inheriting "TypeScript" from the root. Verified against actual filesystem.

**The `src/main.ts` NestJS hint becomes redundant.** After adding `nest-cli.json` as a strong framework hint, the existing `src/main.ts` → nestjs weak hint is redundant for surface detection (nest-cli.json is strong, src/main.ts is not). Both still matter for framework detection in the root `stack.framework` field. No existing hint should be removed — the new entries are additive.

**Testing root fallback false positives.** A surface inheriting root-level Vitest doesn't prove it has tests. This is documented in the REQ and accepted: "more useful than an empty `testing: []` for surfaces that obviously do have tests but install the runner at root." The testing array is scan intelligence, not a contract.

## Rejected Approaches

**Scripts as the primary signal for all three detection paths.** Investigated extensively against 11 repos (200+ packages). Scripts are too noisy — well-organized monorepos like n8n standardize build/dev/test across ALL packages, making scripts useless as a discriminator. Latitude has 40+ domain packages with identical `test` scripts. The `dev` script works specifically for Signal 1 (bin packages) because it separates "actively developed product CLIs" from "internal tools you run but don't iterate on." For Signal 2 (apps/), file count is the better signal because the question is "how substantial is this?" not "does it have scripts?"

**File count >50 for Signal 1 (bin packages).** The REQ's original design. Works for known repos but is a magic number — a stranger reads the code and asks "why 50?" The `dev` script is conceptually grounded ("this package has an active development workflow") and catches two known false negatives: Dub CLI (18 files, has dev) and Inbox Zero CLI (16 files, has dev). Cal.com prisma (24 files, no dev) and app-store-cli (23 files, no dev) are still correctly filtered. For the sniper customer, `dev` is strictly better with zero new false positives.

**Adding `shape` field per surface.** No downstream consumer exists. The enum would be immediately wrong — is a REST API "api" or "web-app"? Is a GraphQL server "api" or "service"? All six research agents converged on this: add it when a consumer exists that would use it to change behavior. Not before.

**Adding `testFiles` field per surface.** The census doesn't have per-root test counts. A field that's always 0 is worse than absent. Omitted.

**Persisting detection signals in scan.json.** Log detection reasoning in terminal output during scan, don't persist in the JSON output. The signals are the detector's internal logic, not intelligence for downstream consumers.

**Modifying `engineResult-partial.ts`.** The partial schema validates critical invariants for existing consumers (schemaVersion, stack, commands). No consumer reads `surfaces`. Adding it would force `.optional()` and gains nothing. Leave it alone.

## Open Questions

**Terminal output truncation.** When a monorepo has 5+ detected surfaces, should the one-line display truncate at N surfaces with "+M more"? Or always show all? This is a display question that doesn't affect detection logic. AnaPlan should decide based on the existing scan output density — the current workspace line is a single line regardless of package count.

## Exploration Findings

### Patterns Discovered

- `census.ts:412-424`: Where `SourceRoot` objects are built for monorepo packages. `hasBin`, `deps`, `devDeps`, `packageName` are all read from `pkg.packageJson` in this block. Adding `scripts` goes here — same pattern, same data source.
- `census.ts:386-398` and `census.ts:399-410`: Two other code paths for `SourceRoot` construction (no package.json fallback, and single-repo). Both need `scripts: []` or populated from root package.json respectively.
- `scan-engine.ts:646-655`: Where `monorepo.packages` is built from `census.sourceRoots`. Currently maps to `{ name, path }`. This is where enrichment happens — extend the map to include the new fields.
- `scan.ts:198-204`: Where the workspace line is displayed in terminal output. The surfaces line goes immediately after, following the same format: `  ${chalk.gray('Surfaces'.padEnd(12))} ...`.
- `detectors/dependencies.ts:64-77`: `TESTING_PACKAGES` record mapping npm package names to display names. Used for per-surface testing detection by checking surface deps + root devDeps against these entries.

### Constraints Discovered

- [TYPE-VERIFIED] `EngineResult.monorepo.packages` type is `Array<{ name: string; path: string }>` (engineResult.ts:124) — enriching requires extending this type, which TypeScript enforces across all consumers.
- [TYPE-VERIFIED] `createEmptyEngineResult()` (engineResult.ts:339-375) has an explicit return type annotation — adding `surfaces` to `EngineResult` will cause a compile error until the factory is updated. This is by design (the comment at line 338 says so).
- [OBSERVED] `monorepo.packages` consumers in `scaffold-generators.ts:112-114` and `scan.ts:138,200` read only `.name`, `.path`, and `.length`. Extra fields are invisible — enrichment is backward-compatible.
- [OBSERVED] `FrameworkHintEntry` stores `framework`, `sourceRootPath`, and `path` (full relative path like `apps/web/next.config.ts`). It does NOT store the original pattern string from FRAMEWORK_HINTS. Strong-vs-weak classification must use `path.basename(hint.path)`.
- [OBSERVED] `selectPrimary` (census.ts:97-116) uses Policy 1: largest `apps/` root with ANY framework hint (sorted by fileCount descending). Adding new hints could only change primary if a newly-hinted `apps/` package is larger than the current primary — verified this doesn't happen for any test repo.
- [OBSERVED] `@manypkg/get-packages` provides `packageJson` on each package with full parsed content including `scripts` — no additional file reads needed.

### Test Infrastructure

- `tests/engine/` contains detector tests following a consistent pattern: import the detector function, construct minimal census/input data, assert on the output. The surface detector test file follows this pattern.
- `tests/contract/analyzer-contract.test.ts` checks field completeness on EngineResult — adding `surfaces` requires updating this test.
- Vitest with `--run` flag (per project convention). Tests are pure unit tests with synthetic data — no filesystem access needed for the detector function.

## For AnaPlan

### Structural Analog

`src/engine/detectors/dependencies.ts` — closest structural match. It's a detector that takes census data (specifically the merged dependency maps) and returns a typed result. `detectSurfaces` follows the same pattern: takes `ProjectCensus`, returns `Surface[]`. Both are pure functions with no filesystem access. Both use lookup tables (TESTING_PACKAGES / STRONG_FRAMEWORK_CONFIGS) against census data.

The scan terminal display addition in `scan.ts:198-204` is structurally analogous to the existing workspace display line — same format, same conditional (monorepo only), same chalk styling.

### Relevant Code Paths

- `packages/cli/src/engine/types/census.ts` — `SourceRoot` interface gets `scripts: string[]`
- `packages/cli/src/engine/census.ts:30-57` — `FRAMEWORK_HINTS` array gets 9 new entries
- `packages/cli/src/engine/census.ts:386-426` — Three code paths for building `SourceRoot` objects, all need `scripts`
- `packages/cli/src/engine/types/engineResult.ts:72-324` — `EngineResult` interface gets `surfaces` array type, `monorepo.packages` gets enriched type
- `packages/cli/src/engine/types/engineResult.ts:339-375` — `createEmptyEngineResult()` needs `surfaces: []` and enriched package defaults
- `packages/cli/src/engine/scan-engine.ts:646-655` — Where `monorepo.packages` is built; where surface detection call and package enrichment goes
- `packages/cli/src/commands/scan.ts:198-204` — Where surfaces terminal line goes (after workspace line)
- `packages/cli/src/engine/detectors/dependencies.ts:64-77` — `TESTING_PACKAGES` for per-surface testing detection

### Patterns to Follow

- `src/engine/detectors/dependencies.ts` — detector pattern (pure function, census input, typed output)
- `src/engine/census.ts:412-424` — SourceRoot construction pattern (read from `pkg.packageJson`)
- `src/commands/scan.ts:198-204` — terminal display line pattern

### Known Gotchas

- `FrameworkHintEntry` stores `path` not `pattern` — the STRONG_FRAMEWORK_CONFIGS match must use `path.basename(hint.path)`, not a direct lookup against the entry.
- Three separate code paths build `SourceRoot`: no-package.json fallback (line 388), single-repo (line 400), monorepo (line 412). All three need the `scripts` field. The first two can use `scripts: []` and `Object.keys(pkg.packageJson.scripts ?? {})` respectively.
- The `@manypkg/get-packages` type for `packageJson` doesn't include `scripts` in its TypeScript definition. Access via cast: `(pkg.packageJson as unknown as Record<string, unknown>)['scripts']` — same pattern already used for `bin` on line 409/423.
- `createEmptyEngineResult()` uses an explicit return type annotation that enforces completeness. Adding `surfaces` to `EngineResult` will fail to compile until the factory is updated. This is intentional and documented in the comment at line 338.
- The `analyzer-contract.test.ts` field completeness check will need updating for the new `surfaces` field.

### Things to Investigate

- Whether the enriched `monorepo.packages` type should use a named interface (e.g., `EnrichedPackage`) or remain inline. The current type is `Array<{ name: string; path: string }>` — adding 6 fields inline gets unwieldy. A named type follows the pattern of other composed types in `engineResult.ts` (e.g., `DetectedCommands`, `GitInfo`).
- The exact terminal output format for the surfaces line. The REQ suggests: `Surfaces: cli (packages/cli), website (website, Next.js)`. The parenthetical could show path only, or path + framework when framework is non-null. AnaPlan should look at the existing workspace line format and match.
