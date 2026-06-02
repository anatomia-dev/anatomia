# Scope: Fix non-product code pollution in findings, hot files, schema counts, and deploy detection

**Created by:** Ana
**Date:** 2026-06-02

## Intent

The scanner already knows which paths are non-product code (`EXCLUDED_SEGMENTS` in surfaces.ts, used by `isNonProductPath()`). Five other systems — findings rules, hot file detection, Supabase schema detection, and deploy discovery — don't use it. Test fixtures, templates, examples, and playground directories are counted as production code, producing visibly wrong results on high-profile repos: 4x model inflation (supabase), 100% false-positive findings (trigger.dev, payload, novu), template Dockerfiles as deploy platform (payload), and template configs dominating hot files (shadcn).

The fix is structural: export the shared definition of "non-product" and wire it into every system that globs or filters project files.

## Complexity Assessment
- **Kind:** fix
- **Size:** medium — 8 files changed, 1 new shared constant, 6 test additions
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/detectors/surfaces.ts` (export `EXCLUDED_SEGMENTS`)
  - `packages/cli/src/engine/findings/rules/validation.ts` (adopt shared ignore)
  - `packages/cli/src/engine/findings/rules/errorBoundaries.ts` (adopt shared ignore)
  - `packages/cli/src/engine/findings/rules/secrets.ts` (adopt shared ignore)
  - `packages/cli/src/engine/detectors/git.ts` (add `isNonProductPath` filter)
  - `packages/cli/src/engine/scan-engine.ts` (filter Supabase migration glob)
  - `packages/cli/src/engine/census.ts` (filter in `discoverDeployments`)
  - New: shared constant file or addition to existing findings export
- **Blast radius:** All scan output for repos with non-product directories. Clean repos (no examples/templates/fixtures in workspace) are unaffected — verified against dub, langfuse, and anatomia.
- **Estimated effort:** 2-3 hours implementation + testing
- **Multi-phase:** no

## Approach

Export `EXCLUDED_SEGMENTS` from surfaces.ts and derive a `FINDINGS_GLOB_IGNORE` constant that combines build-artifact globs with non-product-path globs generated from the shared set. Replace the three independent ignore lists in findings rules with this single constant. Add `isNonProductPath` filtering to hot file detection and Supabase schema detection (matching the pattern Prisma and Drizzle already use). Add the same filter to `discoverDeployments` in census.ts (matching the pattern `discoverSchemas` already uses).

One definition of "non-product." Every system that touches file paths uses it.

## Acceptance Criteria

- AC1: Findings rules (validation, errorBoundaries, secrets) exclude files under non-product paths — no route/page/secret findings from examples/, templates/, fixtures/, playground/, references/, or other EXCLUDED_SEGMENTS directories
- AC2: Hot file detection excludes files under non-product paths — template config files do not appear in highChurnFiles
- AC3: Supabase schema detection excludes migration files under non-product paths, and the `isNonProductPath` filter is applied BEFORE `firstPath` capture so `schemaDir` points to a real product directory
- AC4: Deploy discovery excludes deploy configs from non-product workspace packages — template Dockerfiles do not register as the project's deploy platform
- AC5: All non-product path exclusions derive from the single `EXCLUDED_SEGMENTS` set in surfaces.ts — no duplicated definitions of what constitutes non-product code
- AC6: Clean control regression bar: run `ana scan --json` on dub, langfuse, and anatomia before and after this change, diff the JSON output, zero differences. These three repos have no non-product pollution and must not be affected. The diff must be empty (excluding `scannedAt` timestamp).

## Edge Cases & Risks

**Over-exclusion of legitimate code.** A project with `apps/test/` as a real app name would be excluded by the `test` segment. Mitigation: `isNonProductPath` already makes this exclusion in surface detection and ships without complaints. Same risk profile — no new exposure.

**Template directories with product content.** Email templates, user-facing template engines — `templates/` could contain real product code. Same tradeoff surfaces.ts already accepts. The segment match is coarse by design.

**Empty hot files after filtering.** If all high-churn files are in templates, the hot files section disappears. Better than showing wrong data. The display already handles the empty case (section omitted).

**Novu embedded templates.** `packages/novu/src/commands/init/templates/` contains route files inside product `src/`. `isNonProductPath` correctly catches these via the `templates` segment — the segment-matching approach works on any path depth, not just top-level directories.

## Rejected Approaches

**Separate `FINDINGS_GLOB_IGNORE` constant not derived from `EXCLUDED_SEGMENTS`.** The REQ considered a standalone list to avoid coupling findings to surfaces. Rejected: "non-product path" is a single concept, all consumers are in the same layer (`packages/cli/src/engine/`), and a separate list means someone forgets to update it when a new segment is added. Derive, don't duplicate.

**Filter at the consumer (scan-engine.ts line 1006) instead of in `discoverDeployments`.** Rejected: `discoverSchemas` already filters at discovery (census.ts line 327). Deploy should match. Filtering at discovery prevents any future consumer from inheriting unfiltered results.

**Bundle basename collision display fix (scan.ts line 288).** Different disease: "display strips path context" is not "non-product code not filtered." Architecturally separate. Deferred to its own scope.

**Expand SOURCE_EXTENSIONS to include .json/.yaml.** Design decision about what hot files means, not a bug. The current scope fixes pollution in the existing signal. Expanding what counts as a hot file is a separate evaluation.

**Filter non-product paths in the sampler (proportionalSampler.ts).** The sampler feeds convention detection, not findings. May improve convention accuracy but is a different concern. Confirmed deferred.

## Scope Boundary: What This Does NOT Fix

This scope fixes non-product code pollution — files that `isNonProductPath` identifies as examples, templates, fixtures, etc. It does NOT fix deploy detection for paths that have no excluded segments:

- **twenty's Cloudflare Workers** from `packages/twenty-website/wrangler.jsonc` — a real workspace package (the marketing site), not a template. Needs the deploy-platform-detection primary-awareness fix.
- **trigger.dev's Docker** from `internal-packages/clickhouse/Dockerfile` — a real infrastructure package, not an example. Also needs primary-awareness.

Those bugs require REQ-deploy-platform-detection's primary-package preference logic, not non-product filtering. Both fixes are compatible and can ship independently.

## Open Questions

None. Investigation items from the REQ have been resolved by redundant agent review and code verification.

## Exploration Findings

### Patterns Discovered
- `census.ts` already imports `isNonProductPath` and uses it in `selectPrimary` (line 163) and `discoverSchemas` (line 327). `discoverDeployments` (line 416) is the gap — same file, same import, same pattern to follow.
- Prisma schema detection (scan-engine.ts line 315) and Drizzle schema detection (line 437) already filter via `isNonProductPath`. Only Supabase migrations at line 535 lack the filter.
- `secrets.ts` has partial non-product exclusion (`**/test/**`, `**/tests/**`, `**/e2e/**`, `**/*fixture*/**`) but is missing `**/templates/**`, `**/examples/**`, `**/playground/**`, `**/references/**` and others from EXCLUDED_SEGMENTS.

### Constraints Discovered
- [TYPE-VERIFIED] `EXCLUDED_SEGMENTS` is not exported (surfaces.ts:63) — needs `export` added
- [TYPE-VERIFIED] `isNonProductPath` is exported (surfaces.ts:87) — available to all engine code
- [TYPE-VERIFIED] Supabase filter must precede `firstPath` capture at line 543 — otherwise `schemaDir` could point to an example directory even with correct model count
- [OBSERVED] Novu embedded templates (`packages/novu/src/commands/init/templates/`) — route files inside product src/ that `isNonProductPath` correctly catches via the `templates` segment. Validates the segment-matching approach at arbitrary depth.

### Test Infrastructure
- Finding rule tests: `packages/cli/src/engine/findings/rules/*.test.ts` — mock filesystem with fixture paths
- Git detector tests: `packages/cli/src/engine/detectors/git.test.ts` — mock git output
- Schema detection tests: `packages/cli/src/engine/scan-engine.test.ts` — glob mocking
- Census tests: `packages/cli/src/engine/census.test.ts` — source root filtering tests

## For AnaPlan

### Structural Analog
`census.ts:discoverSchemas` (line 327) — `if (isNonProductPath(root.relativePath)) continue;`. This is the exact pattern for the deploy fix. For the findings fix, Prisma/Drizzle filtering at scan-engine.ts lines 315 and 437 shows the glob-then-filter pattern for Supabase.

### Relevant Code Paths
- `packages/cli/src/engine/detectors/surfaces.ts:63-94` — `EXCLUDED_SEGMENTS` and `isNonProductPath`
- `packages/cli/src/engine/findings/rules/validation.ts:19-23` — `ROUTE_GLOB_IGNORE` to replace
- `packages/cli/src/engine/findings/rules/errorBoundaries.ts:15-18` — `GLOB_IGNORE` to replace
- `packages/cli/src/engine/findings/rules/secrets.ts:111-129` — `SECRET_GLOB_IGNORE` to replace (has partial coverage)
- `packages/cli/src/engine/detectors/git.ts:369-386` — high-churn loop, filter insertion point at line 379
- `packages/cli/src/engine/scan-engine.ts:535-544` — Supabase migration glob, filter before firstPath
- `packages/cli/src/engine/census.ts:416-433` — `discoverDeployments`, add filter matching line 327

### Patterns to Follow
- Derive globs from `EXCLUDED_SEGMENTS`: `[...EXCLUDED_SEGMENTS].map(s => `**/${s}/**`)`
- Combine with existing build-artifact globs into a single exported constant
- census.ts filtering: `if (isNonProductPath(root.relativePath)) continue;` inside the for-loop

### Known Gotchas
- The Supabase filter MUST be applied to `migrationFiles` and `schemaFiles` individually BEFORE they're spread into `files` — otherwise `firstPath` (line 543) could still reference an example path
- `EXCLUDED_SEGMENTS` is currently `const` (not exported). Adding `export` is the only change to surfaces.ts itself.
- `secrets.ts` already excludes some test paths — the shared constant replaces these AND adds the missing ones. Don't leave the old partial list alongside the new one.

### Things to Investigate
- Verify test infrastructure patterns in each affected test file to determine assertion style and mocking approach before writing new test cases
