# Scope: Scan Polish — Detection Gaps + AGENTS.md Quality

**Created by:** Ana
**Date:** 2026-05-26

## Intent

Five P2-P3 improvements that make the scan more complete and the init output cleaner. None fix wrong data — the scan is already correct for all identity fields after Tier 1. These fill gaps where the scan shows incomplete data or downstream output is noisy.

Bundled because: all are small (5-15 lines each), all have zero blast radius (additive or display-only), and shipping them together gets 1.1.5 to a state where nothing obvious is missing for the handoff 30.

## Complexity Assessment
- **Kind:** chore
- **Size:** small — 5 changes across 2 files + 2 stale comment fixes, ~50 lines total production code
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/scan-engine.ts` — 3 changes (Drizzle model aggregation, env hygiene monorepo check, 2 stale comment fixes)
  - `packages/cli/src/commands/init/assets.ts` — 2 changes (AI sub-provider collapse, surfaces section)
- **Blast radius:** Zero for detection changes (additive only — broader globs, additional path checks). Near-zero for AGENTS.md changes (additive section, narrower service filter). No existing correct output changes. Model counts can only increase or stay the same.
- **Estimated effort:** 2-3 hours
- **Multi-phase:** no

## Approach

Five independent improvements plus two stale comment fixes, shipped as one scope.

## Acceptance Criteria

- AC1: openstatus Drizzle model count shows ~40 tables (currently 0) — barrel index file expanded into directory, counts aggregated across all schema files
- AC2: dub env hygiene shows `envExampleExists: true` (currently false — `.env.example` is at `apps/web/.env.example`, not root)
- AC3: inbox-zero AGENTS.md services section does NOT list "Vercel AI (OpenAI)", "Vercel AI (Anthropic)", etc. individually. BUT it DOES still list "OpenAI" (direct SDK usage) if present as a standalone service.
- AC4: inbox-zero AGENTS.md has a `## Surfaces` section listing surface names with paths and frameworks. Single-package repos with 0 surfaces do NOT get a Surfaces section.
- AC5: scan-engine.ts:723-724 comment accurately reflects three-tier model
- AC6: scan-engine.ts:733 stale line reference updated (says "line ~504", actual is ~659)
- AC7: midday and Cap Drizzle model counts are UNCHANGED (50 and 31 respectively — they use single-file schemas)
- AC8: All Group A repos produce identical identity fields — zero regressions

## Edge Cases & Risks

**Drizzle barrel file detection:** When the census-resolved schema path is a file with 0 table definitions (e.g., a barrel index.ts that only re-exports), the fix scans the file's directory recursively for .ts files with `pgTable(`/`mysqlTable(`/`sqliteTable(` calls and aggregates counts. This is a POST-SCORING FALLBACK that only triggers when `best.modelCount === 0` — it does NOT change behavior for repos where the schema file has tables directly (midday, Cap).

**Drizzle aggregation path storage:** When aggregating, store the barrel file path as `schemas['drizzle'].path` — it's the entry point users should know about, even though the tables are in subdirectories.

**Drizzle aggregation provider:** Aggregate table helper counts (pgTable, mysqlTable, sqliteTable) across ALL expanded files, then determine provider from the global totals. For openstatus (all sqliteTable), provider will be "sqlite". The `configDialect` fallback ("turso") only fires if 0 table helpers are found globally, which won't happen after aggregation succeeds.

**AI service collapse precision:** The filter removes services whose name starts with `stack.aiSdk + ' ('` — i.e., the parenthesized sub-provider variants like "Vercel AI (OpenAI)", "Vercel AI (Anthropic)". This does NOT remove standalone SDK services like "OpenAI" or "Anthropic" that are direct dependencies. A project using BOTH Vercel AI (meta-framework) AND the direct OpenAI SDK (for embeddings) correctly preserves the direct OpenAI mention.

**AGENTS.md write-once behavior:** `generateAgentsMd` at line 342 checks `if (await fileExists(destPath)) return` — the improvements only affect NEW init runs. Existing users must delete AGENTS.md and re-init to see the changes. This is by design (merge-not-overwrite).

**Surfaces section for single-package repos:** If `engineResult.surfaces.length === 0`, the Surfaces section is omitted entirely. No empty heading.

**Surfaces cap:** Cap at 4 (matching scan.ts `MAX_SURFACES = 4` pattern). Repos with more than 4 surfaces get "+N more" truncation.

## Rejected Approaches

**AI service filter by category:** Filtering all services with `category === 'ai'` when `stack.aiSdk` is populated. This would hide legitimate direct SDK usage (e.g., the `openai` package installed alongside Vercel AI for embeddings). Three independent reviewers caught this — the name-prefix approach is more precise.

**Drizzle fix during resolution phase:** Moving the barrel-file detection to the file-vs-directory resolution (lines 406-414) instead of post-scoring. While cleaner architecturally, it requires reading file content during resolution (currently done only in scoring), changing two code phases instead of adding one fallback. The post-scoring approach is simpler: if `best.modelCount === 0`, expand and re-aggregate.

**Surfaces cap at 6:** Too high for AGENTS.md which is a density-optimized file read by AI tools. scan.ts uses 4, init uses 3. Cap at 4 for consistency with the scan terminal.

## Open Questions

None.

## Exploration Findings

### Patterns Discovered
- `scan-engine.ts:447-474` — Drizzle scoring picks BEST single file. For barrel files (0 tables), no fallback exists. The fix adds one after line 474.
- `scan-engine.ts:543-564` — `detectSecrets()` only reads `rootPath`. Census is in scope at call site (line 962) but not passed. Option (b) from the scope: mutate the returned result at the call site — avoids changing function signature.
- `assets.ts:423-435` — Services section iterates `standalone` (stackRoles.length === 0). AI sub-providers have no stackRole because their name doesn't match `stack.aiSdk` exactly. The name-prefix filter `svc.name.startsWith(stack.aiSdk + ' (')` is precise.
- `collapseServiceVariants` in scan.ts already groups AI sub-providers for CLI terminal display. AGENTS.md doesn't call it — the service section lists them individually.

### Constraints Discovered
- [TYPE-VERIFIED] `detectSecrets` signature is `(rootPath: string)` — option (b) mutates result at call site, avoids parameter change
- [OBSERVED] AGENTS.md `generateAgentsMd` at line 342 returns early if file exists — improvements only affect new init
- [OBSERVED] scan.ts `MAX_SURFACES = 4`, init `MAX_SURFACE_DISPLAY = 3` — AGENTS.md should use 4 for consistency with terminal
- [VERIFIED] openstatus has 40 `sqliteTable(` calls across schema files (using the scanner's exact regex pattern). Earlier estimate of "~20+" was low.
- [VERIFIED] inbox-zero has BOTH `ai` (Vercel AI) AND `openai` (direct SDK). Category filter would hide the direct SDK.

### Test Infrastructure
- No dedicated test for AGENTS.md content — `generateAgentsMd` writes to disk. Tests would need to read the generated file.
- Drizzle schema detection tested via integration in `scanProject.test.ts`.

## For AnaPlan

### Structural Analog
- Drizzle directory expansion: `scan-engine.ts:408-411` — existing directory-handling code that pushes `${p}/**/*.ts` files into matches. The barrel fallback follows the same glob pattern.
- Env primary path: `scan-engine.ts:962` call site has `census` in scope. Pattern follows how other post-detection enrichments work.
- AI service filtering: `scan.ts:192-200` — CLI already filters standalone services. AGENTS.md adds a name-prefix filter on top.
- Surfaces: `state.ts:997-1017` — init success message renders surfaces with truncation. AGENTS.md section follows the same structure.

### Relevant Code Paths
- `packages/cli/src/engine/scan-engine.ts:447-480` — Drizzle scoring loop + result writing. Barrel fallback inserts between best check and schema write.
- `packages/cli/src/engine/scan-engine.ts:543-564` — detectSecrets function
- `packages/cli/src/engine/scan-engine.ts:962` — detectSecrets call site (census in scope)
- `packages/cli/src/engine/scan-engine.ts:723-724` — stale comment about allDeps
- `packages/cli/src/engine/scan-engine.ts:733` — stale line reference ("line ~504", actual ~659)
- `packages/cli/src/commands/init/assets.ts:423-435` — AGENTS.md services section
- `packages/cli/src/commands/init/assets.ts:340-476` — full generateAgentsMd function

### Patterns to Follow
- Drizzle: the existing directory glob at line 410 (`${p}/**/*.ts`) for the barrel fallback
- Env: the existing `envExampleExists` boolean pattern at line 555
- Services: `svc.name.startsWith(stack.aiSdk + ' (')` for the name-prefix filter — verified against actual service names in EXTERNAL_SERVICE_PACKAGES and AI_SDK_PACKAGES
- Surfaces: `state.ts:1000-1017` for the MAX_SURFACE_DISPLAY pattern with "+N more"
- Surface entry format: `- {name} ({path}) — {framework}` or `- {name} ({path})` if framework is null

### Known Gotchas
- `detectSecrets` returns an object. Mutating `secrets.envExampleExists` at the call site is fine — the object is not frozen/const.
- Guard env check with `census.primarySourceRoot !== '.'` — if primary IS root, the root check already ran.
- The barrel fallback must only trigger from CENSUS matches, not from GLOB FALLBACK matches. The glob fallback (lines 430-444) already has its own content filter. Adding a directory expansion there would be redundant and could cause over-counting.
- For the surfaces section placement: after `## Deployment` and before `## Conventions` (if it exists). Check the section ordering in `generateAgentsMd`.
- `engineResult.surfaces` may be empty for single-repo projects. ALWAYS check `surfaces.length > 0` before rendering the section heading.

### Things to Investigate
- Whether openstatus's `drizzle.config.ts` path `./src/schema/index.ts` resolves through census to the expected relative path `packages/db/src/schema/index.ts`. The path resolution through census → scan-engine matters for `path.dirname()` to produce the right directory.
