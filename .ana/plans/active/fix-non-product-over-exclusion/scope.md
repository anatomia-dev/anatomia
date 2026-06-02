# Scope: Fix non-product path over-exclusion at deep segments

**Created by:** Ana
**Date:** 2026-06-02

## Intent

PR #262 added `isNonProductPath` filtering to findings, hot files, schema detection, and deploy discovery. It works correctly for workspace package paths (1-3 segments) but over-excludes when segment names like `e2e`, `test`, `sandbox`, `templates`, `playground` appear deep inside product surfaces — because the filter checks ALL path segments, not just the package-level ones.

dub loses 9 production API routes. `apps/web/app/(ee)/api/e2e/` has real E2E testing API endpoints — `e2e` at index 5 is a product feature, not a test directory. 600+ product files across 17 repos are silently over-excluded (email templates, LLM playgrounds, testing API controllers, webhook sandbox endpoints).

The user wants the file-path callers fixed without changing the package-path callers that work correctly.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — 1 new function, 1 constant update, 6 call-site migrations, test updates
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/detectors/surfaces.ts` (add function, update constant)
  - `packages/cli/src/engine/detectors/git.ts` (1 call-site migration)
  - `packages/cli/src/engine/scan-engine.ts` (4 call-site migrations)
  - `packages/cli/tests/engine/detectors/surfaces.test.ts` (add depth-boundary tests)
  - `packages/cli/tests/engine/non-product-filtering.test.ts` (update glob assertions, add file-path tests)
- **Blast radius:** Findings rules (validation, errorBoundaries, secrets) consume `NON_PRODUCT_GLOB_IGNORE` — they get the fixed patterns automatically via the in-place update. No import changes needed in those files.
- **Estimated effort:** 1-2 hours
- **Multi-phase:** no

## Approach

Split non-product filtering into two tiers: package-path filtering (existing `isNonProductPath`, checks all segments, unchanged) and file-path filtering (new `isNonProductFilePath`, checks only the first 3 segments). Update `NON_PRODUCT_GLOB_IGNORE` in place from any-depth `**/${segment}/**` to 3-tier root-anchored patterns. Migrate file-path callers to the new function; package-path callers stay on the original.

This preserves the original function's correct behavior for its designed use case while fixing the regression introduced when it was extended to deep file paths.

## Acceptance Criteria
- AC1: `isNonProductFilePath('apps/web/app/(ee)/api/e2e/bounties/route.ts')` returns `false` (e2e at segment 4, past depth limit)
- AC2: `isNonProductFilePath('examples/next-app/src/route.ts')` returns `true` (examples at segment 0)
- AC3: `isNonProductFilePath('packages/platform/examples/base/src/route.ts')` returns `true` (examples at segment 2, within depth limit)
- AC4: `isNonProductPath('examples/next-app')` still returns `true` (unchanged for package paths)
- AC5: `NON_PRODUCT_GLOB_IGNORE` contains `${s}/**`, `*/${s}/**`, `*/*/${s}/**` patterns (rooted, not `**/${s}/**`)
- AC6: `NON_PRODUCT_GLOB_IGNORE` retains `**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/.git/**`, `**/.turbo/**`, `**/out/**`, `**/.cache/**` at any depth (build artifacts are correct everywhere)
- AC7: git.ts:382 calls `isNonProductFilePath`, not `isNonProductPath`
- AC8: scan-engine.ts lines 321, 443, 543, 545 call `isNonProductFilePath`, not `isNonProductPath`
- AC9: Package-path callers (census.ts:167/331/427, surfaces.ts:331, state.ts:651) remain on `isNonProductPath` unchanged
- AC10: `-e2e` suffix check in `isNonProductFilePath` iterates segments 0 through limit-1 (not just last segment)
- AC11: All existing tests pass (updated assertions where needed)

## Edge Cases & Risks

**novu gains 5 scaffold template routes.** `packages/novu/src/commands/init/templates/` has `templates` at segment 4 — past depth limit, no longer excluded. These scaffold routes genuinely lack validation. Noisy but not wrong. Accept.

**`**/build/**` is a pre-existing over-exclusion in trigger.dev.** Not introduced by this fix, not in scope.

**Repos with non-product packages at depth 3+.** No observed repo across 17 validated has excluded segments at depth 3+ that are genuinely non-product packages. Monitor.

**Test directories at depth 3+ escape the filter.** twenty's `src/testing/`, novu's deep `e2e/` dirs, formbricks' deep `tests/` dirs. Covered by other mechanisms: findings globs only match `route.ts`/`page.tsx` (not `.test.ts`), and secrets.ts has `**/*.test.*`/`**/*.spec.*` patterns. No functional impact.

## Rejected Approaches

**New `NON_PRODUCT_GLOB_IGNORE_ROOTED` export alongside the existing constant.** The REQ proposed this. Rejected because the any-depth version would have zero consumers after migration — dead code. In-place update of `NON_PRODUCT_GLOB_IGNORE` is simpler: same name, rooted patterns, no dead exports. If a future consumer needs any-depth, they can regenerate from `EXCLUDED_SEGMENTS` in one line.

**Depth 2 instead of 3.** Initial proposal. Rejected because cal.com has `packages/platform/examples/` at index 2 — depth-2 missed it. Validated across 17 repos: every correctly-excluded path has the excluded segment at index 0, 1, or 2.

**Depth 4.** Would start catching product code inside surfaces (novu's scaffold templates at segment 4). Depth 3 is the boundary where package structure ends and product source begins.

## Open Questions

None. Depth 3 validated across 17 repos by 3 redundant agents. All design questions resolved.

## Exploration Findings

### Patterns Discovered
- surfaces.ts:88-97: `isNonProductPath` iterates all segments, `-e2e` suffix checks only last segment
- surfaces.ts:105-111: `NON_PRODUCT_GLOB_IGNORE` uses `**/${s}/**` any-depth pattern generation
- non-product-filtering.test.ts:14-46: Tests import `NON_PRODUCT_GLOB_IGNORE` by name and assert `**/${segment}/**` patterns — will need updated assertions

### Constraints Discovered
- [TYPE-VERIFIED] Package-path vs file-path caller split (surfaces.ts, census.ts, git.ts, scan-engine.ts) — package callers pass 1-3 segment paths, file callers pass 5-10+ segment paths
- [OBSERVED] Build artifact patterns (`**/node_modules/**`, etc.) are correct at any depth — must remain `**/` prefixed
- [OBSERVED] `-e2e` suffix check on `isNonProductPath` only tests last segment (line 94) — for file paths this is the filename, not directory segments

### Test Infrastructure
- `packages/cli/tests/engine/detectors/surfaces.test.ts` — tests `isNonProductPath` export, basic exclusion/inclusion, case insensitivity, `-e2e` suffix
- `packages/cli/tests/engine/non-product-filtering.test.ts` — tests `NON_PRODUCT_GLOB_IGNORE` patterns, `isNonProductPath` on file paths, Supabase simulation

## For AnaPlan

### Structural Analog
`isNonProductPath` itself (surfaces.ts:88-97). The new `isNonProductFilePath` is a depth-limited variant of the same function — same segment iteration pattern, same `EXCLUDED_SEGMENTS` set, different loop bound and `-e2e` check scope.

### Relevant Code Paths
- `packages/cli/src/engine/detectors/surfaces.ts:64-111` — `EXCLUDED_SEGMENTS`, `isNonProductPath`, `NON_PRODUCT_GLOB_IGNORE`
- `packages/cli/src/engine/detectors/git.ts:382` — hot file filtering
- `packages/cli/src/engine/scan-engine.ts:321,443,543,545` — schema detection filtering
- `packages/cli/src/engine/findings/rules/validation.ts:15,21` — imports and uses `NON_PRODUCT_GLOB_IGNORE`
- `packages/cli/src/engine/findings/rules/errorBoundaries.ts:14,16` — imports and uses `NON_PRODUCT_GLOB_IGNORE`
- `packages/cli/src/engine/findings/rules/secrets.ts:21,136` — imports and uses `NON_PRODUCT_GLOB_IGNORE`

### Patterns to Follow
- surfaces.ts:88-97 for the function shape
- surfaces.ts:105-111 for the constant generation pattern (spread `EXCLUDED_SEGMENTS` with `.flatMap`)

### Known Gotchas
- The `-e2e` suffix check must iterate segments 0 through limit-1 in the new function, not replicate the "last segment" pattern from the original
- `NON_PRODUCT_GLOB_IGNORE` test assertions in non-product-filtering.test.ts check for exact `**/${segment}/**` patterns — must update to 3-tier rooted patterns
- Findings rules (validation, errorBoundaries, secrets) import `NON_PRODUCT_GLOB_IGNORE` by name — in-place rename means zero import changes needed

### Things to Investigate
- Confirm the exact JSDoc for `isNonProductFilePath` — should document why depth 3 and reference the original function for package-path use
