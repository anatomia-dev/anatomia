# Scope: Fix deploy platform detection for monorepos

**Created by:** Ana
**Date:** 2026-05-26

## Intent

The scan shows the wrong deploy platform for monorepos where a secondary service's config file sorts alphabetically before the primary app's. inbox-zero deploys to Vercel but the scan says "Cloudflare Workers" because `apps/image-proxy/wrangler.jsonc` is discovered before `apps/web/vercel.json`. The wrong platform cascades into AGENTS.md (no Vercel serverless warnings), gotcha matching (Prisma + Vercel safety gotcha silently suppressed), deployment skill context, service dedup, and scaffold generators. The fix makes `detectDeployment` primary-aware so it prefers the primary package's deploy config.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — 2 source files changed, 1 comment added, tests added
- **Surface:** cli
- **Files affected:** `src/engine/detectors/deployment.ts`, `src/engine/scan-engine.ts`, `src/engine/census.ts` (comment only), `tests/engine/detectors/ci-detection.test.ts`
- **Blast radius:** 7 downstream consumers read `deployment.platform` from EngineResult. All benefit without code changes — the value they read becomes correct. No consumer signatures change.
- **Estimated effort:** 1-2 hours
- **Multi-phase:** no

## Approach

Thread `primarySourceRoot` from the census into `detectDeployment`. The census already knows which package is primary (correct for inbox-zero and Cap — both show `primary: apps/web`). The deployment detector just doesn't use that information. Connect the wire that's already there.

The fix is Option B from the requirements analysis: make `detectDeployment` primary-aware with an optional `primaryPath` parameter, rather than restructuring census ordering (Option A, infeasible due to circular dependency with `selectPrimary`) or changing the schema to multi-platform (Option C, correct long-term but heavy — 18 lines across 11 files — and should be its own scope under ANA-SCAN-070).

Option B creates foundation: the `primaryPath` parameter survives into ANA-SCAN-070 as the ordering key for a future `platforms[]` array.

## Acceptance Criteria
- AC1: inbox-zero scan shows "Vercel" not "Cloudflare Workers"
- AC2: Cap scan shows "Vercel" not "Cloudflare Workers"
- AC3: dub scan still shows "Vercel" (regression check)
- AC4: formbricks scan still shows "Docker" (regression check — no vercel.json, Docker is correct)
- AC5: `ana init` on inbox-zero produces AGENTS.md with Vercel-specific serverless guidance ("Push to main deploys to production" and "Serverless function limits apply")
- AC6: Prisma + Vercel gotcha (`gotchas.ts:106`) fires for inbox-zero after the fix
- AC7: Single-repo projects are unaffected — `primaryPath='.'` matches all entries from the single root, preserving current behavior
- AC8: Existing fallback test (`ci-detection.test.ts:53-59`) continues to pass — documents behavior when no `primaryPath` is provided

## Edge Cases & Risks

**Primary package has no deploy config.** Falls back to `deployments[0]` — current behavior. No regression for repos where the primary package lacks a deploy config but a secondary has one. The platform may be imprecise (same as today), but not worse.

**Primary selection is wrong.** If `selectPrimary` picks the wrong primary, deploy detection inherits that error. Pre-existing issue — not introduced by this fix. Primary selection was improved in R5/R6 and correctly identifies `apps/web` for all test repos checked.

**`DEPLOYMENT_CONFIGS` insertion order as within-root priority.** When a primary package has both `vercel.json` and `Dockerfile`, `discoverDeployments` finds Vercel first (listed before Docker in the map). V8 guarantees string-key insertion order. A comment documents this. An explicit priority mechanism is deferred to ANA-SCAN-070.

**`@manypkg/get-packages` order changes.** The fix eliminates dependence on `@manypkg` ordering for deployment detection. Even if the library changes its iteration order, the primary package's config wins.

## Rejected Approaches

**Option A: Restructure census ordering.** Move the primary-first sort before `rootDescriptors` construction. Infeasible in naive form — `selectPrimary` needs `frameworkHints` which needs `rootDescriptors`. The resolved version (build unsorted, discover, select primary, then pass to detector) converges to Option B with unnecessary indirection. Also carries risk of breaking other discovery functions that are order-insensitive today.

**Option C: Multi-platform schema change now.** Change `deployment.platform` from `string | null` to `string[]`. Fixes both the ordering bug and multi-platform information loss. Correct long-term (Cap genuinely deploys to 4 platforms) but heavy: 18 lines across 11 files, EngineResult schema change, all consumer conditional logic, all tests. Should be its own scope under ANA-SCAN-070. Option B doesn't make Option C harder — it makes it easier because primary-awareness plumbing is already in place.

**Docker deprioritization heuristic.** Deprioritize Docker when another platform is co-present. Appealing but dangerous — a project that genuinely deploys to Docker with a stale `vercel.json` would show the wrong platform. Separate concern from the ordering fix.

## Open Questions

None. All questions from the requirements analysis were resolved during investigation.

## Exploration Findings

### Patterns Discovered
- `deployment.ts:32-37` — `detectDeployment` is a pure function taking census entries, no filesystem access. Adding a parameter is clean.
- `scan-engine.ts:924` — single call site for `detectDeployment`. `census` object is in scope and has `primarySourceRoot`.
- `census.ts:600-608` — `discoverDeployments` runs before `selectPrimary`, but `primarySourceRoot` is available at line 608. The fix passes it at the call site in scan-engine.ts where census is already fully constructed.

### Constraints Discovered
- [TYPE-VERIFIED] DeploymentEntry has `sourceRootPath` field (census.ts types, line 48) — this is what Option B matches against `primaryPath`
- [DETECTED] Only `detectDeployment` has `[0]` ordering sensitivity among census consumers. `discoverFrameworkHints`, `discoverTsconfigs`, `discoverSchemas` collect all entries and score by content.
- [DETECTED] Single-repo sets `primarySourceRoot = '.'` (census.ts:606) and builds one source root with `relativePath: '.'`. All deployment entries get `sourceRootPath: '.'`. The `find()` match works correctly.

### Test Infrastructure
- `tests/engine/detectors/ci-detection.test.ts` — existing deployment detection tests at lines 37-60. Three tests: single Vercel, empty array, multiple deployments (fallback behavior). Tests construct `DeploymentEntry[]` directly — no filesystem mocking needed.

## For AnaPlan

### Structural Analog
`detectCI` at `deployment.ts:43-48` — same file, same shape (takes census entries, returns detected result). But `detectCI` doesn't need primary-awareness because CI configs live at the project root, not per-package.

### Relevant Code Paths
- `src/engine/detectors/deployment.ts:32-37` — the function to modify. Add optional `primaryPath` parameter, prefer entries where `sourceRootPath === primaryPath`.
- `src/engine/scan-engine.ts:924` — the call site. Pass `census.primarySourceRoot`.
- `src/engine/census.ts:81-104` — `DEPLOYMENT_CONFIGS` map. Add comment documenting insertion order as intentional within-root priority.
- `tests/engine/detectors/ci-detection.test.ts:37-60` — existing tests. Keep the fallback test at line 53-59. Add new tests.

### Patterns to Follow
- `deployment.ts` — pure function signature, destructured census data, null-safe return shape
- `ci-detection.test.ts` — direct construction of census entry arrays, no filesystem mocking

### Known Gotchas
- The comment at `deployment.ts:30-31` says "Returns the first match (primary source root's deployment in a monorepo)" — this is aspirational documentation that must be fixed to reflect actual behavior after the change.
- The existing test at `ci-detection.test.ts:53-59` asserts `deployments[0]` fallback behavior (Docker over Vercel when no primary). Keep this test — it documents the fallback path when `primaryPath` is not provided.

### Things to Investigate
- None. All code paths traced, all consumers verified, all edge cases resolved.
