# Scope: Scan Polish — Detection Gaps + AGENTS.md Quality

**Created by:** Ana
**Date:** 2026-05-26

## Intent

Five P2-P3 improvements that make the scan more complete and the init output cleaner. None fix wrong data — the scan is already correct for all identity fields after Tier 1. These fill gaps where the scan shows incomplete data or downstream output is noisy.

Bundled because: all are small (5-15 lines each), all have zero blast radius (additive or display-only), and shipping them together gets 1.1.5 to a state where nothing obvious is missing for the handoff 30.

## Complexity Assessment
- **Kind:** chore
- **Size:** small — 5 changes across 2 files, ~50 lines total production code
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/scan-engine.ts` — 3 changes (Drizzle model aggregation, env hygiene monorepo check, stale comment fix)
  - `packages/cli/src/commands/init/assets.ts` — 2 changes (AI service collapse, surfaces section)
- **Blast radius:** Zero. All changes are additive (checking more paths, filtering noise, adding a section). No existing correct output changes. Model counts can only increase or stay the same. Env detection can only change false→true. AGENTS.md gains content, doesn't lose it.
- **Estimated effort:** 2-3 hours
- **Multi-phase:** no

## Approach

Five independent improvements shipped as one scope because they share the same risk profile (zero blast radius, additive only) and the same verification strategy (scan real repos, check output).

## Acceptance Criteria

- AC1: openstatus Drizzle model count shows ~20+ models (currently 0) — the barrel index pattern is followed into subdirectories
- AC2: dub env hygiene shows `envExampleExists: true` (currently false — `.env.example` is at `apps/web/.env.example`, not root)
- AC3: inbox-zero AGENTS.md services section does NOT list 12+ Vercel AI sub-provider variants individually
- AC4: inbox-zero AGENTS.md has a `## Surfaces` section listing surface names with paths and frameworks
- AC5: scan-engine.ts:723-724 comment accurately reflects three-tier model (not "stay on allDeps")
- AC6: midday and Cap Drizzle model counts are UNCHANGED (they use single-file schemas that already work)
- AC7: All Group A repos produce identical identity fields — zero regressions

## Edge Cases & Risks

**Drizzle barrel file detection:** When the census-resolved schema path has 0 table definitions, the fix scans the file's directory recursively for .ts files with pgTable/mysqlTable/sqliteTable calls. Risk: could find table definitions in unrelated .ts files in the same directory tree. Mitigated by: the directory IS the drizzle config's `schema` path — files in it are schema files by definition.

**Drizzle aggregation vs best-file:** The current code picks the single best file. The fix aggregates across ALL matched files in the directory. Risk: could double-count if a file re-exports tables from another file (barrel that also defines tables). Mitigated by: counting `Table(` calls, not exports — a re-export doesn't create a new `Table(` call.

**Env hygiene false positive:** Could checking the primary path produce `envExampleExists: true` for repos where the `.env.example` is stale or unrelated? Low risk — the presence of `.env.example` is always a positive signal regardless of which directory it's in.

**AI service filtering in AGENTS.md:** Filtering by `category === 'ai'` when `stack.aiSdk` is populated. Risk: could filter a genuine non-Vercel-AI service that happens to be categorized as 'ai'. Mitigated by: only filter when `stack.aiSdk` is non-null AND the service's category is 'ai'. A project without any AI SDK in the stack wouldn't filter anything.

**Surfaces in AGENTS.md:** Adding a ## Surfaces section. Risk: repos with 10+ surfaces could produce a long list. Mitigated by: cap at 6 surfaces with "+N more" if needed — matching the init success message pattern.

## Rejected Approaches

**Drizzle: following import/export chains from barrel files.** Parsing `export * from "./monitors"` to find the re-exported files would work but is over-engineered. Just scanning the directory tree is simpler and catches the same files.

**Env: checking ALL workspace package directories.** Unnecessary — the primary source root is where the app runs. An env.example in a utility package isn't relevant.

**Services: using collapseServiceVariants from scan.ts.** That function groups variants but still lists them. For AGENTS.md, we want to REMOVE the sub-providers entirely (the stack field already names the primary SDK).

## Open Questions

None.

## Exploration Findings

### Patterns Discovered
- `scan-engine.ts:385-500` — Drizzle detection block. Census path resolves to file or directory. For openstatus: resolves to `packages/db/src/schema/index.ts` (a barrel with 0 tables). Scoring picks best single file — finds 0 in the barrel and stops.
- `scan-engine.ts:543-564` — `detectSecrets()` only reads `rootPath`. Doesn't receive census or primary path.
- `assets.ts:426-435` — Services section iterates `standalone` (stackRoles.length === 0) services. AI sub-providers have no stackRole (they don't match `stack.aiSdk` by name) so they all appear.

### Constraints Discovered
- [TYPE-VERIFIED] `detectSecrets` signature is `(rootPath: string)` — needs a second parameter for the primary path, OR the caller handles it
- [OBSERVED] Drizzle census path can be file or directory (line 407-421 handles both cases). The barrel-file-with-0-tables case isn't handled.
- [OBSERVED] AGENTS.md services list has no truncation — lists ALL standalone services. scan.ts CLI has truncation (5 max + "+N more").
- [OBSERVED] `engineResult.surfaces` array is available in `generateAgentsMd` but never rendered.

### Test Infrastructure
- `tests/engine/findings/env.test.ts` — tests `checkEnvHygiene` with mock secrets data (not filesystem). The `detectSecrets` function is tested via integration in `scanProject.test.ts`.
- No dedicated test for AGENTS.md content generation — `generateAgentsMd` writes to disk. Tests would need to read the generated file.

## For AnaPlan

### Structural Analog
- Drizzle directory scanning: `scan-engine.ts:407-421` — existing directory-handling code within the Drizzle block. The fix extends this pattern.
- Env primary path: `scan-engine.ts:962` call site has `census` in scope. Pattern follows how other detection functions receive primary info.
- AGENTS.md services filtering: `scan.ts:192-200` — CLI display already filters by `stackRoles.length === 0`. AGENTS.md can add a category filter on top.
- AGENTS.md surfaces: state.ts:997-1017 — init success message already renders surfaces with truncation.

### Relevant Code Paths
- `packages/cli/src/engine/scan-engine.ts:385-500` — Drizzle detection, scoring, and result writing
- `packages/cli/src/engine/scan-engine.ts:543-564` — detectSecrets function
- `packages/cli/src/engine/scan-engine.ts:962` — detectSecrets call site (census in scope)
- `packages/cli/src/engine/scan-engine.ts:720-726` — stale comment
- `packages/cli/src/commands/init/assets.ts:423-435` — AGENTS.md services section
- `packages/cli/src/commands/init/assets.ts:340-476` — full generateAgentsMd function

### Patterns to Follow
- Drizzle: the existing directory glob at line 410 (`${p}/**/*.ts`)
- Env: the existing `envExampleExists` boolean pattern at line 555
- Services: the `svc.stackRoles.length === 0` filter pattern at line 427
- Surfaces: the init display at state.ts:1000-1017 (MAX_SURFACE_DISPLAY = 3 pattern)

### Known Gotchas
- `detectSecrets` is called at line 962 with just `rootPath`. To check the primary path, either: (a) add a second parameter `primaryAbsPath?: string`, or (b) do the check inline at the call site after `detectSecrets` returns and override `envExampleExists` if found in primary. Option (b) avoids changing the function signature.
- The AGENTS.md surfaces section should go AFTER the deployment section and BEFORE the conventions section — matching the visual hierarchy of scan output.
- For AI service filtering: check `engineResult.stack.aiSdk !== null` before filtering. Don't filter if no AI SDK is detected (the services might be standalone).
- The Drizzle aggregation must preserve the `provider` detection logic — use the most common table helper across all files (most pgTable calls across all files → postgresql).

### Things to Investigate
- Whether openstatus's `drizzle.config.ts` pointing to `./src/schema/index.ts` produces a relative path in `censusDrizzle` that matches what the scanner sees. The path resolution through census → scan-engine might differ from what `path.dirname()` produces.
