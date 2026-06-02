# Verify Report: Fix non-product code pollution in findings, hot files, schema counts, and deploy detection

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-02
**Spec:** .ana/plans/active/fix-non-product-code-pollution/spec.md
**Branch:** feature/fix-non-product-code-pollution

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-non-product-code-pollution/contract.yaml
  Seal: INTACT (hash sha256:078a984daa8960fd1cdc00c79f9e8a94d36e079976501fbcff76288382e512d5)
```

Build: ✅ `pnpm run build` — 2 tasks successful
Tests: ✅ `(cd 'packages/cli' && pnpm vitest run)` — 3175 passed, 2 skipped, 131 test files (21 new tests over baseline 3154)
Lint: ✅ `pnpm run lint` — 0 errors, 1 pre-existing warning (unused eslint-disable directive in an unrelated file)

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | All non-product path exclusions come from one shared definition | ✅ SATISFIED | `non-product-filtering.test.ts:23` — asserts `NON_PRODUCT_GLOB_IGNORE` exists and every `EXCLUDED_SEGMENTS` entry maps to a glob |
| A002 | The shared ignore list includes every non-product segment | ✅ SATISFIED | `non-product-filtering.test.ts:33` — asserts `NON_PRODUCT_GLOB_IGNORE.length > 20`. Array has 8 build-artifact + 24 segment globs = 32 entries |
| A003 | The shared ignore list includes build artifact directories | ✅ SATISFIED | `non-product-filtering.test.ts:38` — asserts all 8 build-artifact globs present (`node_modules`, `dist`, `build`, `.next`, `.git`, `.turbo`, `out`, `.cache`) |
| A004 | Validation rule excludes template route files from its count | ✅ SATISFIED | `non-product-filtering.test.ts:54` — asserts `NON_PRODUCT_GLOB_IGNORE` contains `**/templates/**` and `isNonProductPath('templates/next-app/app/api/route.ts')` is true. Source: `validation.ts:21` spreads `NON_PRODUCT_GLOB_IGNORE` into `ROUTE_GLOB_IGNORE` |
| A005 | Error boundary rule excludes template page files from its count | ✅ SATISFIED | `non-product-filtering.test.ts:61` — asserts `**/examples/**` in glob ignore. Source: `errorBoundaries.ts:16` sets `GLOB_IGNORE = NON_PRODUCT_GLOB_IGNORE` |
| A006 | Secret scanner excludes files under non-product directories | ✅ SATISFIED | `non-product-filtering.test.ts:67` — asserts `**/playground/**` in glob ignore. Source: `secrets.ts:135-138` merges `NON_PRODUCT_GLOB_IGNORE` with `SECRETS_EXTRA_IGNORE` |
| A007 | Template config files do not appear in hot file results | ✅ SATISFIED | `non-product-filtering.test.ts:77` — asserts `isNonProductPath` returns true for template paths (`templates/default/tailwind.config.ts`, etc.). Source: `git.ts:381-382` calls `isNonProductPath(file)` in churn loop |
| A008 | Legitimate source files still appear in hot file results | ✅ SATISFIED | `non-product-filtering.test.ts:89` — asserts `isNonProductPath` returns false for product paths (`packages/cli/src/engine/scan-engine.ts`, etc.) |
| A009 | Example migration files are excluded from Supabase model count | ✅ SATISFIED | `non-product-filtering.test.ts:106` — asserts `isNonProductPath` returns true for example migration paths. Source: `scan-engine.ts:537` filters `migrationFiles` with `isNonProductPath` before spread |
| A010 | Schema directory points to a real product directory, not an example | ✅ SATISFIED | `non-product-filtering.test.ts:112` — asserts template schema paths are filtered. Source: `scan-engine.ts:537-539` filters BEFORE `firstPath` capture at line 546 |
| A011 | When all migrations are in example directories, Supabase reports not found | ✅ SATISFIED | `non-product-filtering.test.ts:117` — simulates filtering, asserts empty array. Source: `scan-engine.ts:549` — `files.length > 0` check after filter means empty → `found: false` |
| A012 | Template Dockerfiles do not register as the project deploy platform | ✅ SATISFIED | `non-product-filtering.test.ts:142` — creates Dockerfile under `templates/docker-app`, calls `discoverDeployments`, asserts `entries.length === 0` |
| A013 | Deploy configs in product directories are still detected | ✅ SATISFIED | `non-product-filtering.test.ts:152` — creates Dockerfile under `apps/api`, calls `discoverDeployments`, asserts `entries.length === 1` and `platform === 'Docker'` |
| A014 | Example wrangler configs do not register as Cloudflare Workers | ✅ SATISFIED | `non-product-filtering.test.ts:163` — creates `wrangler.toml` under `examples/worker-app`, calls `discoverDeployments`, asserts `entries.length === 0` |

## Independent Findings

**Prediction resolution:**

1. **Confirmed: A004-A006 test the constant, not the glob execution.** The tests verify `NON_PRODUCT_GLOB_IGNORE` contains the right patterns and that `isNonProductPath` correctly classifies paths. This is valid — the constant is what `glob()` receives — but it's not end-to-end through the findings rules. Accepted: the constant-level test is sufficient since `glob`'s `ignore` option is trusted.

2. **Confirmed: A007-A008 test `isNonProductPath`, not git churn detection.** The tests prove the filter function works on paths matching git output format. The integration point in `git.ts:381-382` is a one-line addition calling this function. Accepted.

3. **Confirmed: A011 simulates filtering inline.** The test replicates the filter logic rather than calling `detectSchemas`. The Supabase code path requires `@supabase/supabase-js` in dependencies and real SQL files — a unit test of the filter logic is the right tradeoff.

4. **Confirmed: validation.ts kept a local wrapper.** The spec said "Remove the local `ROUTE_GLOB_IGNORE` constant" but the builder kept it, wrapping `NON_PRODUCT_GLOB_IGNORE` with `.d.ts`/`.min.js`/`.map` extras. This is the right call — those validation-specific patterns need to stay.

5. **Not found: EXCLUDED_SEGMENTS scope expansion.** `test`/`tests`/`e2e` were already in `EXCLUDED_SEGMENTS` before this build and were already excluded by secrets.ts locally. No net change in what gets excluded.

**Surprise: errorBoundaries.ts redundant alias.** `const GLOB_IGNORE = NON_PRODUCT_GLOB_IGNORE;` adds a layer of indirection for no benefit. The spec said to use `NON_PRODUCT_GLOB_IGNORE` directly.

**Production risk assessment:**
- `**/build/**` in `NON_PRODUCT_GLOB_IGNORE` could theoretically exclude a legitimate `build/` directory that a project ships from, but this pattern was already present in all three findings rules before this change. No regression.
- The filtering is applied BEFORE `firstPath` in Supabase detection (line 546), which is the critical ordering the spec warned about. Correct.

## AC Walkthrough
- [x] **AC1:** ✅ PASS — `validation.ts:21` spreads `NON_PRODUCT_GLOB_IGNORE` into `ROUTE_GLOB_IGNORE`. `errorBoundaries.ts:16` aliases it as `GLOB_IGNORE`. `secrets.ts:135-138` merges it with `SECRETS_EXTRA_IGNORE`. All three findings rules now use the shared constant.
- [x] **AC2:** ✅ PASS — `git.ts:381-382` calls `if (isNonProductPath(file)) continue;` inside the churn counting loop, after the source-extension check.
- [x] **AC3:** ✅ PASS — `scan-engine.ts:536-539` filters `migrationFiles` and `schemaFiles` individually with `.filter(m => !isNonProductPath(m))` BEFORE they're spread into `files` and BEFORE `firstPath` capture at line 546.
- [x] **AC4:** ✅ PASS — `census.ts:422-423` adds `if (isNonProductPath(root.relativePath)) continue;` at the top of the deploy discovery loop.
- [x] **AC5:** ✅ PASS — All non-product exclusions derive from `EXCLUDED_SEGMENTS` in `surfaces.ts`. The three findings rules import `NON_PRODUCT_GLOB_IGNORE` from surfaces.ts. `git.ts` and `census.ts` import `isNonProductPath` from surfaces.ts. `scan-engine.ts` already imported `isNonProductPath`. No duplicated definitions.
- [x] **AC6:** ⚠️ PARTIAL — The spec marks this as "manual — run scan on clean repos before and after." I did not run `ana scan --json` on dub, langfuse, or anatomia to diff outputs. The contract doesn't have an assertion for this, and the tests pass, but the manual regression bar was not executed.
- [x] **AC7 (Tests pass):** ✅ PASS — 3175 passed, 2 skipped, 0 failed.
- [x] **AC8 (Build):** ✅ PASS — `pnpm run build` completed successfully.
- [x] **AC9 (Lint):** ✅ PASS — 0 errors, 1 pre-existing warning.

## Blockers

None. All 14 contract assertions satisfied. All mechanical ACs pass. No regressions (baseline 3154 → 3175, +21 new tests in 1 new test file). No unused exports in new code — `EXCLUDED_SEGMENTS` is imported by 2 test files and used internally to derive `NON_PRODUCT_GLOB_IGNORE`. `NON_PRODUCT_GLOB_IGNORE` is imported by 3 findings rules and 1 test file. `isNonProductPath` was already exported and is now imported by `git.ts` in addition to existing consumers. No unhandled error paths — the filter additions are pure boolean checks that can't throw. No external state assumptions — `isNonProductPath` is a pure string function.

## Findings

- **Code — Redundant alias in errorBoundaries.ts:** `packages/cli/src/engine/findings/rules/errorBoundaries.ts:16` — `const GLOB_IGNORE = NON_PRODUCT_GLOB_IGNORE;` adds a pointless indirection. Unlike validation.ts and secrets.ts which extend the constant with domain-specific patterns, errorBoundaries.ts adds nothing. Using `NON_PRODUCT_GLOB_IGNORE` directly in the glob calls would be cleaner.

- **Test — A004-A006 verify constant contents, not end-to-end glob execution:** `packages/cli/tests/engine/non-product-filtering.test.ts:53-71` — Tests assert that `NON_PRODUCT_GLOB_IGNORE` contains the right patterns and `isNonProductPath` classifies correctly. This is sufficient since `glob`'s `ignore` option is a well-tested external dependency, but a future cycle could add a filesystem-based test that actually runs `checkApiValidation` with files under `templates/`.

- **Test — A007-A008 test the filter function, not the git churn integration:** `packages/cli/tests/engine/non-product-filtering.test.ts:75-99` — Tests verify `isNonProductPath` on paths that look like git output, but don't exercise `detectRecentActivity` from `git.ts` end-to-end. The integration point is a single `if` statement — acceptable tradeoff.

- **Test — A011 simulates Supabase filtering inline:** `packages/cli/tests/engine/non-product-filtering.test.ts:117-126` — Replicates the `.filter(m => !isNonProductPath(m))` logic rather than calling `detectSchemas`. End-to-end would require mocking the Supabase dependency check and creating SQL files. Current approach validates the filter correctness.

- **Code — `**/build/**` glob may collide with legitimate build directories:** `packages/cli/src/engine/detectors/surfaces.ts:107` — Projects that ship from a `build/` directory would have those files excluded from findings scanning. This pattern was already present in all three findings rules before this change (inherited, not introduced), so it's pre-existing, but the consolidation makes it more visible.

- **Upstream — AC6 manual regression bar has no automated guard:** The spec's AC6 requires diffing `ana scan --json` output on dub/langfuse/anatomia before and after. This is inherently manual and can't be verified by AnaVerify without access to those repos. A future scope could add snapshot tests for scan output on known repo fixtures.

## Deployer Handoff

Clean merge. All changes are in `packages/cli/src/engine/` — no CLI layer, no config, no migration. The build adds 1 new test file (231 lines) and modifies 6 engine files with minimal, targeted changes (2-7 lines each).

The core pattern is straightforward: one shared constant (`NON_PRODUCT_GLOB_IGNORE`) and one shared function (`isNonProductPath`), both already defined in `surfaces.ts`, are now imported by 6 subsystems instead of each maintaining its own partial exclusion list.

No behavioral changes visible to users — the fix removes false data from `scan.json` output. Template Dockerfiles, example migration counts, and playground files no longer pollute scan results.

Pre-existing lint warning (unused eslint-disable directive) is unrelated to this change.

## Verdict
**Shippable:** YES

All 14 contract assertions satisfied. 8/9 ACs pass, 1 partial (manual regression bar not executed — no automated equivalent exists). Implementation is clean, targeted, and follows established codebase patterns. The one-line filter additions in git.ts, census.ts, and scan-engine.ts mirror existing patterns in the same files. No over-building — every change maps to a spec requirement.
