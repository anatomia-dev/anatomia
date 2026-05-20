# Scope: Fix Deep Tier Sampling & Finding Accuracy

**Created by:** Ana
**Date:** 2026-05-19

## Intent

The deep tier's proportional sampler produces a depth-biased sample that systematically over-represents shallow files (config, types, barrel exports) and under-represents application code (API routes, services, domain logic). This bias causes the API validation finding to produce misleading results on real customer repos — "1/1 sampled API routes have no input validation" on Dub (which has 139 API routes, 76 with validation imports), "12/12" on Formbricks (which has 96 routes, 30+ with direct validation). The error-boundaries finding has the same sample-dependency problem. And the import convention classifier has a separate bug that misclassifies alias imports, producing wrong results for any project with multiple tsconfig path aliases.

These issues were discovered during V2-Alpha pre-launch testing across 20 real open-source repos. They affect the sniper customer directly — TS monorepos with Next.js are where the sampling bias and alias bug are most visible.

## Complexity Assessment

- **Kind:** fix
- **Size:** medium — 5 files changed, ~130 lines new/changed code, each component independently testable
- **Files affected:**
  - `packages/cli/src/engine/findings/rules/validation.ts` — rewrite to use own glob
  - `packages/cli/src/engine/findings/rules/errorBoundaries.ts` — update to glob for error.tsx/jsx and page.tsx/jsx directly (~15 lines changed, smallest change in the set)
  - `packages/cli/src/engine/analyzers/conventions/imports.ts` — fix `parseTsconfigAlias` return type from `string | null` to `string[]`, fix alias filter to include all path aliases (not just `@/`-prefixed)
  - `packages/cli/src/engine/sampling/proportionalSampler.ts` — add depth stratification, increase budget to 750
  - `packages/cli/src/engine/parsers/treeSitter.ts` — fix misleading comment (line 904)
- **Blast radius:** scan output changes for every deep-tier scan. Finding titles/severities change. Convention import classification changes. These are correctness improvements — the current outputs are wrong.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Three independent fixes that address three independent problems, shipped together because they all affect deep-tier accuracy and were discovered in the same V2-Alpha testing:

**1. Findings get their own file discovery.** The validation and error-boundaries rules stop depending on the general-purpose sample and instead glob for the specific files they need. The validation rule reads all API routes (not a sample), checks imports directly, and reports with full denominator. The error-boundaries rule globs for `error.tsx` files directly. This decouples finding accuracy from sample composition — the right architecture, since findings need specific files while conventions/patterns need representative files.

**2. The import alias classifier returns all aliases.** `parseTsconfigAlias` currently returns `string | null` — the first matching alias from tsconfig paths. Projects with multiple aliases (`@/pages/*`, `@/lib/*`, `@/ui/*`) get only the first one, causing the rest to be misclassified as external. The fix changes the return type to `string[]` and returns all tsconfig `paths` keys that look like path aliases — not just `@/`-prefixed ones. The heuristic: a key is an alias if it ends with `/*` and is NOT an `@scope/package` pattern (where scope is a word longer than 2 chars). This catches `@/*`, `@/lib/*`, `~/lib/*`, `#imports/*`, `components/*` while excluding `@nestjs/*`, `@types/*`. The caller that previously wrapped the single result in an array can pass the array directly. `classifyTSImport` already accepts `aliases?: string[]` — it's just receiving too few entries.

The FindingContext interface is unchanged. The `sampledFiles` and `parsedFiles` fields remain available for rules that need them. The validation and error-boundaries rules simply stop depending on them.

**3. The general sample gets depth stratification and a larger budget.** Replace depth-first sorting with depth-bucketed allocation (proportional representation at every depth level). Increase budget from 500 to 750 — costs ~150ms based on benchmarks, well within the 12s performance target. This improves representativeness for convention detection and pattern inference.

## Acceptance Criteria

- AC1: Scanning Dub produces a validation finding with denominator ≥100 (not "1/1")
- AC2: Scanning a project with 10+ API routes and validation imports produces a `pass` or accurately-counted finding — not a false alarm
- AC3: Validation finding covers both App Router (`**/api/**/route.{ts,js,tsx,jsx}`) and Pages Router (`**/pages/api/**/*.{ts,js,tsx,jsx}`) patterns
- AC4: Validation severity considers absolute route count — projects with <10 total routes get `info` at most
- AC5: Error-boundaries finding detects `error.tsx` files regardless of their depth in the directory tree
- AC6: `parseTsconfigAlias` returns `string[]` containing all path aliases from tsconfig, not just the first match
- AC7: A project with `@/lib/*`, `@/pages/*`, `@/ui/*` aliases classifies all three as absolute imports. A project with `~/lib/*` or `#imports/*` aliases classifies those as absolute, not external
- AC8: General sample at budget 750 includes files from all depth levels (not just shallowest)
- AC9: Scan performance remains under 12 seconds on repos up to 11k source files
- AC10: treeSitter.ts comment accurately reflects measured parse performance (~0.8ms/file amortized)
- AC11: Validation finding title uses actual counts, not "sampled" (e.g., "63/139 API routes have no validation imports" or "All 139 API routes have validation imports"). Detail text includes a limitation note when less than 100% of routes have validation imports (e.g., "Checked top-of-file imports for validation libraries. Routes using wrapper-based or middleware-based validation may not be detected.")

## Edge Cases & Risks

- **Re-export routes.** Formbricks has `export { GET } from '@/modules/api/v2/health/route'` — a one-line re-export. Reading the first 30 lines shows the re-export, not validation imports. The validation happens in the re-exported module. This is structurally unfollowable without two-hop resolution. The honest-reporting approach handles it — the re-export has no validation imports (technically true), and the full denominator prevents it from being alarming. Known limitation, not something to fix.
- **Wrapper-based validation.** Formbricks' `withV3ApiWrapper` imports zod internally; the route file imports only the wrapper. Import-based detection fundamentally cannot catch this without following the import chain one level deep. Investigation confirmed this: Dub's `withWorkspace` is an auth wrapper (NOT validation), while Formbricks' `withApiWrapper` IS validation. Module path heuristics can't reliably distinguish them. Known limitation, documented in finding detail text.
- **tRPC and NestJS routes.** These frameworks handle validation structurally (schema in procedure definition, validation pipes). The validation finding's glob patterns won't match them. This is correct behavior — these frameworks ARE validated by construction. The finding targets Next.js/Express-style file-based routing where validation is opt-in.
- **Depth stratification on flat repos.** A project with all files at depth 1-2 has no deep files to stratify. The sampler should degrade gracefully — if a depth bucket is empty, redistribute its budget to other buckets.
- **Alias patterns beyond `@/`.** Some projects use `~/`, `#/`, bare aliases like `components/*`. The fix should return all path aliases from tsconfig, not just `@/`-prefixed ones.
- **Budget 750 on very large repos.** On Cal.com (11k files), 750 is 6.8% coverage. Adequate for conventions but not exhaustive. The point is representativeness via stratification, not total coverage.

## Rejected Approaches

**Wrapper detection via module path heuristics.** Initially proposed detecting validation wrappers by checking if imported module paths contain "wrapper", "middleware", or "validator". Investigation on Dub proved this unreliable: `withWorkspace` (auth, not validation) is the most imported module in API routes. `parseRequestBody` (just `req.json()`) has "request" in the path. Module path alone cannot distinguish auth wrappers from validation wrappers. Honesty beats precision — report what import scanning CAN see, document what it can't.

**Two-hop import resolution.** Following imports one level deep (does the wrapper file itself import zod?) would catch Formbricks-style wrapper validation. But it requires reading and parsing every imported module for every route file — significantly more I/O and complexity for a finding that already has honest reporting with the denominator. Deferred.

**Category-aware sampling.** Reserving budget slots for API routes, services, models. Too coupled to specific directory naming conventions. A project putting API routes in `src/server/handlers/` wouldn't match. The targeted-glob approach (each finding globs for its own files) is simpler and more precise.

**Budget increase alone without stratification.** 750 depth-first files is still biased — more of the boring files, not a representative cross-section. Budget increase and stratification are complementary, not alternatives.

**Random/seeded-random sampling.** Unbiased but harder to reason about. "Why was this file sampled?" becomes "it was random." Stratified sampling is deterministic, explainable, and achieves the same representativeness goal.

**Tier 2 module path heuristics for wrapper detection.** Considered detecting validation wrappers by checking if imported module paths contain `api-wrapper`, `validate-request`, etc. Investigated and rejected — module path alone cannot distinguish auth wrappers from validation wrappers (Dub's `withWorkspace` is the most imported module in API routes and is auth, not validation). Ship with Tier 1 (direct validation library imports + schema/validate path patterns) only.

## Open Questions

None — all design-judgment questions were resolved during investigation.

## Exploration Findings

### Patterns Discovered

- `validation.ts` lines 27-33: API route detection already handles both App Router and Pages Router patterns — the glob patterns should match both
- `FindingContext` already has `rootPath` (line 31) — no interface changes needed for findings to do their own globbing
- `FindingRule.check` already returns `Promise` (line 38) — async glob is already supported
- `parseTsconfigAlias` line 342: `aliasKeys.find()` returns only the first match — the bug. Return type is `string | null`, needs to become `string[]`. Lines 342-346 filter for `@`-prefixed aliases with scope length ≤ 2, which excludes `~/`, `#/`, and bare aliases — the filter needs to be generalized
- `parseTsconfigAlias` has TWO call sites with different purposes:
  - `conventions/index.ts` line 93: builds `aliasPatterns` array for import classification. Currently wraps single result in array + appends `*`. With `string[]` return, becomes a `.map()` instead.
  - `detectProjectRoot` in `imports.ts` line 259: returns the alias as the "project root" for Node projects. `detectProjectRoot` returns `string | null`. With `string[]` return from `parseTsconfigAlias`, this call site needs adaptation (return first alias, common prefix, or stop delegating to `parseTsconfigAlias` for this purpose).
- `aliasPattern` field on `ConventionAnalysis` (imports.ts line 230): currently stores a single alias string in scan.json output. With multiple aliases, Plan must decide: keep first alias (cosmetic, no schema change) or change to array (changes scan.json schema).
- `classifyTSImport` line 83: already calls `aliases?.some()` — handles multiple aliases correctly if they're passed
- Convention analyzer line 93-94: passes `parseTsconfigAlias` result to `classifyTSImport` — the pipeline is correct, just underfed

### Constraints Discovered

- [TYPE-VERIFIED] Sequential parsing (treeSitter.ts:1039) — tree-sitter WASM is single-threaded, files must be parsed sequentially
- [OBSERVED] Parse cost 0.8ms/file amortized — measured cold on Dub (3910 files). Glob cost ~290ms constant regardless of budget. Total deep tier at 750 budget: ~890ms
- [OBSERVED] Dub tsconfig has 4 path aliases (`@/pages/*`, `@/styles/*`, `@/ui/*`, `@/lib/*`) but only `@/pages/*` is returned by `parseTsconfigAlias` — 574 `@/lib/` imports in API routes misclassified as external
- [OBSERVED] Dub: 139 API routes, 76 with direct validation imports (55%). `withWorkspace` is auth, not validation
- [OBSERVED] Formbricks: 96 API routes, 30 with direct validation, 33 with wrapper-only validation, 46 with neither

### Test Infrastructure

- `tests/engine/sampling/proportional-sampler.test.ts` — tests allocation, test-file exclusion, budget cap, depth ordering. Will need update for stratification
- Validation and error-boundaries rules have no dedicated test files — findings are tested through integration in scan-engine tests

## For AnaPlan

### Structural Analog

`packages/cli/src/engine/findings/rules/secrets.ts` — the secrets rule already does its own filesystem scan (globs for source files, reads them for secret patterns) independent of the general sample. The validation and error-boundaries rules should follow this pattern: use `FindingContext.rootPath` to glob for their specific files, read what they need, report what they find.

### Relevant Code Paths

- `packages/cli/src/engine/findings/rules/validation.ts` — current rule, 63 lines. Rewrite to glob + read imports
- `packages/cli/src/engine/findings/rules/errorBoundaries.ts` — current rule, 50 lines. Update to glob for `**/error.{tsx,jsx}` and `**/page.{tsx,jsx}` directly (~15 lines changed, smallest change in the set)
- `packages/cli/src/engine/analyzers/conventions/imports.ts` — `parseTsconfigAlias` at line 316, `classifyTSImport` at line 67
- `packages/cli/src/engine/sampling/proportionalSampler.ts` — `depthThenAlpha` at line 55, `sampleFilesProportional` at line 69
- `packages/cli/src/engine/scan-engine.ts` line 719 — budget parameter passed to sampler
- `packages/cli/src/engine/parsers/treeSitter.ts` line 904 — misleading comment

### Patterns to Follow

- `packages/cli/src/engine/findings/rules/secrets.ts` — finding rule that does its own filesystem I/O
- `packages/cli/src/engine/sampling/proportionalSampler.ts` — existing allocation logic (proportional with floor of 1) to extend with depth buckets

### Known Gotchas

- The `glob` import is already available in the sampler but not in the findings rules. Rules will need to import it (or use a simpler `fs.readdir` + filter approach for targeted file discovery).
- `FindingRule.check` can return `Promise` but the current validation and error-boundaries rules are synchronous. Converting to async is safe — `generateFindings` already awaits the result.
- The conventions analyzer comment (line 36: "Samples 50 files") is stale — it now uses the full pre-sampled list. Another comment to fix.

### Things to Investigate

- What's the right number of depth buckets for stratification? 3 (shallow/mid/deep) or 4 (quartiles)? The planner should decide based on typical depth distributions in the sniper customer's repos.
- Should the validation rule's "first 30 lines" approach use a simple `readFile` + split, or the existing `readFile` utility with a byte limit? The planner should check what utilities exist for partial file reads.
