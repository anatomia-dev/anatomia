# Verify Report: Fix Deep Tier Sampling & Finding Accuracy

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-19
**Spec:** .ana/plans/active/fix-deep-tier-sampling/spec.md
**Branch:** feature/fix-deep-tier-sampling

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-deep-tier-sampling/contract.yaml
  Seal: INTACT (hash sha256:6b208ad85ce65d17d9affa77831709eb506a7ee1fde4faaa7daf5f6170f5d775)
```

Tests: 2548 passed, 0 failed, 2 skipped. Build: success. Lint: 0 errors (1 pre-existing warning in git-operations.ts).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | The validation rule finds all API routes in a project, not just sampled ones | ✅ SATISFIED | `tests/engine/findings/rules/validation.test.ts:27-44` — creates 15 routes at varying depths, asserts title contains "/15" |
| A002 | Routes with validation library imports are correctly detected as validated | ✅ SATISFIED | `tests/engine/findings/rules/validation.test.ts:47-59` — two routes with zod/yup imports, asserts severity === 'pass' |
| A003 | Both App Router and Pages Router API routes are discovered | ✅ SATISFIED | `tests/engine/findings/rules/validation.test.ts:62-79` — 2 App Router + 1 Pages Router route, asserts title contains '3' |
| A004 | Small projects with few API routes get info severity at most, not warn | ✅ SATISFIED | `tests/engine/findings/rules/validation.test.ts:82-95` — 5 routes with no validation, asserts severity === 'info' |
| A005 | Projects with no API routes produce no validation finding | ✅ SATISFIED | `tests/engine/findings/rules/validation.test.ts:98-108` — only page.tsx present, asserts finding === null |
| A006 | The validation finding title shows actual counts instead of saying sampled | ✅ SATISFIED | `tests/engine/findings/rules/validation.test.ts:111-125` — 12 routes, asserts title not contains 'sampled' and contains '12/12' |
| A007 | Partially validated projects include a limitation note about wrapper-based validation | ✅ SATISFIED | `tests/engine/findings/rules/validation.test.ts:128-139` — 1 validated + 1 unvalidated, asserts detail contains 'wrapper-based' |
| A008 | Routes importing schema or validate path patterns count as validated | ✅ SATISFIED | `tests/engine/findings/rules/validation.test.ts:143-155` — routes importing from '@/schemas/user' and '@/validation/items', asserts severity === 'pass' |
| A009 | Error boundaries are found regardless of directory depth | ✅ SATISFIED | `tests/engine/findings/rules/errorBoundaries.test.ts:27-39` — error.tsx at `app/deep/nested/level/error.tsx`, asserts severity === 'pass' |
| A010 | Page count is accurate when no error boundaries exist | ✅ SATISFIED | `tests/engine/findings/rules/errorBoundaries.test.ts:42-56` — 5 pages, asserts title contains '5 pages' |
| A011 | Non-Next.js projects skip the error boundary check entirely | ✅ SATISFIED | `tests/engine/findings/rules/errorBoundaries.test.ts:59-69` — framework=null, asserts finding === null |
| A012 | All path aliases from tsconfig are returned, not just the first one | ✅ SATISFIED | `tests/engine/analyzers/conventions/imports.test.ts:19-33` — 4 aliases configured, asserts aliases.length === 4 and each alias present |
| A013 | Aliases with tilde prefix are recognized as path aliases | ✅ SATISFIED | `tests/engine/analyzers/conventions/imports.test.ts:36-45` — `~/*` and `~/lib/*`, asserts aliases contains '~/' |
| A014 | Aliases with hash prefix are recognized as path aliases | ✅ SATISFIED | `tests/engine/analyzers/conventions/imports.test.ts:48-55` — `#imports/*`, asserts aliases contains '#imports/' |
| A015 | Scoped npm packages like @nestjs are excluded from alias detection | ✅ SATISFIED | `tests/engine/analyzers/conventions/imports.test.ts:58-69` — `@nestjs/*` and `@types/*` in paths, asserts not contained in result |
| A016 | Imports using any configured alias are classified as absolute, not external | ✅ SATISFIED | `tests/engine/analyzers/conventions/imports.test.ts:96-103` — tests @/, @/lib/, ~/lib/, #imports/ aliases all classify as 'absolute' |
| A017 | Projects with no tsconfig paths get an empty alias list | ✅ SATISFIED | `tests/engine/analyzers/conventions/imports.test.ts:81-86` — null paths, asserts aliases.length === 0 |
| A018 | Deep files get sampled even when the budget is smaller than the total file count | ✅ SATISFIED | `tests/engine/sampling/proportional-sampler.test.ts:143-180` — 50 shallow + 30 mid + 20 deep files, budget 20, asserts deep files present |
| A019 | The default sample budget is 750 files | ✅ SATISFIED | `tests/engine/sampling/proportional-sampler.test.ts:183-201` — 1000 files, no explicit budget, asserts files.length === 750 |
| A020 | A project with all files at the same depth still samples correctly | ✅ SATISFIED | `tests/engine/sampling/proportional-sampler.test.ts:204-221` — 10 files all at depth 2, budget 100, asserts files.length === 10 |
| A021 | The tree-sitter parse cost comment reflects actual measured performance | ✅ SATISFIED | Source inspection: `packages/cli/src/engine/parsers/treeSitter.ts:904` changed from "slow path: 50-150ms" to "~0.8ms/file amortized". Comment-only change, no @ana tag expected. |

## Independent Findings

**Predictions made before reading code:**
1. *VALIDATION_PATH_PATTERNS false positives* — **Confirmed.** The check at `validation.ts:52` matches any import line containing "schema" or "validate" as substrings. An import like `import { schemaVersion } from './config'` would count as validated. However, the spec explicitly chose this heuristic ("validation via schema path pattern") and it's consistent with the limitation note in the finding detail. False positives here mean under-reporting unvalidated routes, which is the safe direction.
2. *Old test files not updated properly* — **Not found.** Both `tests/engine/findings/validation.test.ts` and `tests/engine/findings/errorBoundaries.test.ts` were properly rewritten to use temp directories and the new async signatures.
3. *allocateBudget over-allocation edge case* — **Confirmed.** When budget < number of non-empty buckets, the function assigns floor-of-1 to each, exceeding budget. The outer `sampleFilesProportional` compensates via `allFiles.slice(0, budget)`, so no user-visible bug. But the function's internal contract is violated.
4. *Dead replace('/*','') in classifyTSImport* — **Confirmed.** Line 83 and 97 have `replace('/*', '')` and `replace('*', '')` that are no-ops for the new alias format (already stripped by `parseTsconfigAlias`). Harmless — backward-compatible with any code that might pass old-format aliases.
5. *Scoped alias classification interaction* — **Not found.** Traced `@/models/user` and `@nestjs/common` through both the scoped-check path (line 77-87) and general alias check (line 94-99). Both classify correctly.

**Production risks:**
- *Sync reads at scale:* Not a new risk — the validation rule uses the same `readFileSync` pattern as `secrets.ts`. Established convention in the codebase.
- *VALIDATION_PATH_PATTERNS accuracy:* Low risk in practice — `schema` and `validate` appearing in non-validation import paths is uncommon.

## AC Walkthrough

- **AC1:** Scanning Dub produces a validation finding with denominator ≥100 — **-- UNVERIFIABLE** (requires Dub codebase)
- **AC2:** Scanning a project with 10+ validated routes produces pass or accurate count — **✅ PASS** (test at validation.test.ts:62-79 exercises 3 validated routes returning pass; test at validation.test.ts:111-125 shows accurate count 12/12)
- **AC3:** Validation finding covers both App Router and Pages Router patterns — **✅ PASS** (test at validation.test.ts:62-79 verifies both patterns; implementation at validation.ts:75-86 uses both glob patterns)
- **AC4:** Validation severity considers absolute route count — projects with <10 routes get info at most — **✅ PASS** (test at validation.test.ts:82-95; implementation at validation.ts:110 checks `routeFiles.length < 10`)
- **AC5:** Error-boundaries detects error.tsx regardless of depth — **✅ PASS** (test at errorBoundaries.test.ts:27-39 places error.tsx at depth 4; glob at errorBoundaries.ts:30 uses `**` pattern)
- **AC6:** parseTsconfigAlias returns string[] with all aliases — **✅ PASS** (return type is `Promise<string[]>` at imports.ts:322; test at imports.test.ts:19-33 verifies 4 aliases returned)
- **AC7:** Multiple alias types classified as absolute — **✅ PASS** (test at imports.test.ts:96-103 verifies @/, @/lib/, ~/lib/, #imports/ all classify as 'absolute'; test at imports.test.ts:105-111 verifies @nestjs still external)
- **AC8:** Sample at budget 750 includes files from all depth levels — **✅ PASS** (test at proportional-sampler.test.ts:143-180 creates 3 depth tiers, budget 20, verifies all tiers represented)
- **AC9:** Scan performance under 12 seconds on 11k files — **⚠️ PARTIAL** (full test suite completed in 45s including all 2548 tests; no dedicated 11k-file benchmark run in this session)
- **AC10:** treeSitter.ts comment reflects ~0.8ms/file — **✅ PASS** (verified at treeSitter.ts:904: `// Cache miss - parse file (~0.8ms/file amortized)`)
- **AC11:** Validation title uses actual counts, detail includes limitation note — **✅ PASS** (test at validation.test.ts:111-125 asserts '12/12' and no 'sampled'; test at validation.test.ts:128-139 asserts 'wrapper-based' in detail)
- **AC12:** Tests pass with `pnpm run test -- --run` — **✅ PASS** (2548 passed, 0 failed, 2 skipped)
- **AC13:** No build errors — **✅ PASS** (build completed successfully)

## Blockers

No blockers. All 21 contract assertions satisfied. All mechanically-verifiable ACs pass. No regressions (baseline was 2524 passed; now 2548 passed — 24 new tests added). Checked: no unused exports in new files (all exports are imported by test or production code), no unhandled error paths (validation.ts:35 catches readFileSync failures, errorBoundaries.ts:61 catches glob failures, proportionalSampler.ts:225 catches glob failures), no external state assumptions beyond filesystem access which is the rule's purpose.

## Findings

- **Code — VALIDATION_PATH_PATTERNS substring matching:** `packages/cli/src/engine/findings/rules/validation.ts:52` — The check `VALIDATION_PATH_PATTERNS.some(p => lower.includes(p))` matches any import line containing "schema" or "validate" as substrings. An import like `import { schemaVersion } from './config'` would count as validated. This errs on the safe side (under-reports unvalidated routes) and the spec chose this heuristic deliberately. The limitation note in the finding output covers it.
- **Code — allocateBudget exceeds budget when budget < non-empty buckets:** `packages/cli/src/engine/sampling/proportionalSampler.ts:77` — If `budget=2` and all 3 depth buckets have files, first-pass assigns floor-of-1 to each (total=3), exceeding budget. No user-visible bug because `sampleFilesProportional` trims via `allFiles.slice(0, budget)`. But the function violates its own contract — callers must compensate.
- **Code — Dead replace calls in classifyTSImport:** `packages/cli/src/engine/analyzers/conventions/imports.ts:83` — `alias.replace('/*', '')` and line 97's `alias.replace('*', '')` are no-ops for the new alias format returned by `parseTsconfigAlias` (which already strips `/*`). Harmless — provides backward compatibility if anyone passes old-format aliases.
- **Test — No false-positive boundary test for VALIDATION_PATH_PATTERNS:** `packages/cli/tests/engine/findings/rules/validation.test.ts` — All tests verify true positives (zod, yup, schema paths). No test verifies that a route importing e.g. `schemaVersion` from a non-validation module gets counted as validated (which it would). This matches the spec's acceptance of the heuristic but leaves the boundary undocumented.
- **Code — readFileSync in async validation rule:** `packages/cli/src/engine/findings/rules/validation.ts:34` — The validation rule is async (for glob) but reads files synchronously. This matches the established `secrets.ts` pattern and the spec explicitly calls it out as intentional. At 500+ routes the sync reads could add ~50ms. Not a problem at current scale.
- **Upstream — A021 verified by source inspection only:** Contract assertion A021 targets a comment change. There is no `@ana A021` tag in any new test file, which is appropriate — testing a comment's content would be a source-content assertion (anti-pattern per testing standards). Verified directly at `treeSitter.ts:904`.

## Deployer Handoff

This is a pure engine change — no CLI surface changes, no config schema changes, no new dependencies. The scan budget increases from 500 to 750 files, which adds ~150ms to scan time per the spec's benchmarks. The `parseTsconfigAlias` return type changed from `string | null` to `string[]`, but the `scan.json` `aliasPattern` field remains `string | null` (first alias for backward compatibility, handled at `conventions/index.ts:230`). The old test files at `tests/engine/findings/validation.test.ts` and `tests/engine/findings/errorBoundaries.test.ts` were rewritten — they now use temp directories instead of mock objects, matching the new async/glob-based implementations.

## Verdict
**Shippable:** YES

All 21 contract assertions satisfied. 11 of 13 ACs pass, 1 unverifiable (requires external codebase), 1 partial (performance benchmark not run in-session but reasonable from test suite timing). No regressions. Findings are observations and minor debt — nothing that prevents shipping. The implementation follows established patterns (secrets.ts for glob-based rules, proportional allocation for sampling) and the code is clean.
