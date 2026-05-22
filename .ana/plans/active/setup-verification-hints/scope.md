# Scope: Setup Verification Hints

**Created by:** Ana
**Date:** 2026-05-22

## Intent

The setup agent presents scan output as-is. The developer confirms "yes" to config that might be misleading, because neither party has verified the consequential claims. The scan is deterministic code that makes heuristic bets — it's right most of the time, but when it's wrong, the error propagates silently into ana.json and project-context.md, shaping every pipeline run that follows.

The setup agent is in a unique position: it has both scan data and codebase access. But today it uses this position only for enrichment (Steps 3-7), never for verification (Step 2). The highest-value verification targets are:

1. **Surface completeness** — are there workspace packages that look like services but weren't detected as surfaces? The scan already has every workspace package with scripts and file counts. The setup agent just doesn't cross-reference this data against the surfaces list.
2. **Stack provenance** — was the detected database/auth/payments/AI SDK found in the primary package, or in a non-primary workspace package? When Supabase is detected from `packages/nodes-langchain` (not the primary package), the developer should know.

Both can be addressed without LLM reasoning. The scan produces deterministic provenance metadata. The setup agent reads it and presents it. The developer confirms or corrects. Zero friction when the scan is correct.

## Complexity Assessment

- **Kind:** feature
- **Size:** medium — scan enrichment (new provenance function + type changes) + setup template hardening (Step 2 verification presentation)
- **Surface:** cli
- **Files affected:**
  - `src/engine/detectors/dependencies.ts` — new `findStackProvenance` function
  - `src/engine/types/engineResult.ts` — `StackProvenance` type, add to `EngineResult`
  - `src/engine/scan-engine.ts` — wire provenance into scan output
  - `templates/.claude/agents/ana-setup.md` — hardened Step 2 with verification hints
  - `tests/engine/detectors/dependencies.test.ts` — provenance detection tests
- **Blast radius:** Low. Provenance is a new additive field in scan.json — existing consumers ignore unknown fields. The setup template change is prose instructions for an LLM agent, not code. No changes to ana.json schema, init logic, or pipeline flow.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Two changes that work together:

**1. Scan enrichment: stack detection provenance.** After `detectFromDeps` identifies stack fields from the merged `allDeps`, a new function `findStackProvenance` cross-references the detected packages against per-source-root deps from the census. When a detection came from a non-primary package, it records which package was the source. This produces a `stackProvenance` field in scan.json — empty when all detections came from the primary package (the common case), populated only when there's a cross-package detection worth flagging.

The function is pure: census in, provenance out. It does not change `detectFromDeps` or the existing detection logic — it's a post-hoc analysis of where the detections came from. ~30 lines of implementation.

**2. Setup template hardening: verification-aware Step 2.** Two additions to the Config Confirmation step:

- **Surface gap check.** After showing surfaces, the setup agent reads `monorepo.packages` from scan.json and identifies packages that have a `dev` script, 15+ source files, and are NOT in the `surfaces` array or excluded by INFRA_PATTERNS/EXCLUDED_SEGMENTS conventions. If any exist, it presents them as "packages not detected as surfaces" with an offer to add them. If the developer says yes, the setup agent writes them into ana.json with scoped commands derived from the package's scripts. This uses existing scan.json data — no new scan computation needed.

- **Provenance notes.** When `stackProvenance` has entries (non-primary detections), the setup agent shows an inline `ⓘ` note under the Stack line: "Database: Supabase — detected from packages/nodes-langchain, not your primary package. Correct?" This lets the developer catch cross-package detections without any LLM reasoning — the scan already determined the provenance, the setup agent just reads and presents it.

Both additions are silent when there's nothing to flag. The sniper customer with a correct scan sees the exact same Step 2 as today. Only monorepos with cross-package stack detections or unsurfaced backend services see the additional notes.

## Acceptance Criteria

- AC1: scan.json contains a `stackProvenance` field. When all stack detections come from the primary package (or allDeps for single-repo projects), the field is an empty object `{}`. When a detection came from a non-primary package, it contains an entry: `{ database: { package: "@supabase/supabase-js", source: "packages/nodes-langchain" } }`.
- AC2: `findStackProvenance` checks `database`, `auth`, `payments`, and `aiSdk`. It does NOT check `testing` (testing detection intentionally uses rootDevDeps fallback — provenance is expected to be cross-package) or `framework` (framework comes from config files and shape detection, not allDeps).
- AC3: `findStackProvenance` is a pure function: `(census: ProjectCensus, depResult: DependencyDetectionResult) => StackProvenance`. No filesystem access. Testable with synthetic census objects.
- AC4: For single-repo projects (no monorepo), `stackProvenance` is always `{}` — provenance is only meaningful when multiple packages exist.
- AC5: The setup template's Step 2, after showing surfaces, cross-references `monorepo.packages` against `surfaces` in scan.json. Packages with a `dev` script AND 15+ source files AND not in `surfaces` AND not matching non-product path conventions are presented as potential surfaces the developer may want to add.
- AC6: The setup template's Step 2, when `stackProvenance` has entries, shows an `ⓘ` note for each non-primary detection with the source package path and an offer to correct.
- AC7: When the developer confirms adding a potential surface, the setup agent writes it to ana.json `surfaces` with scoped commands derived from the package's scripts and the project's package manager. The pattern follows existing surface entries.
- AC8: When no provenance flags exist and no surface gaps are found, Step 2 looks identical to the current flow — zero additional presentation.

## Edge Cases & Risks

**Provenance for pattern-detected stack fields:**
- `stack.database` and `stack.auth` can also come from deep-tier pattern detection (scan-engine.ts lines 803-811), not just `detectFromDeps`. When the dep detection returns null but pattern detection fills the field, there's no package-level provenance — the detection came from code patterns, not dependencies. `findStackProvenance` only runs against dep-detected fields. If `depResult.database` is null but `stack.database` is non-null (pattern-detected), no provenance entry is created. This is correct — pattern detection reads sampled files across the project, not per-package deps.

**Single-repo provenance:**
- Single-repo projects have one source root marked as primary. `detectFromDeps` runs against `census.allDeps` which equals that root's deps merged with devDeps. Provenance is always "primary" → empty `stackProvenance`. No false flags.

**The surface gap criteria must be conservative:**
- The setup agent should NOT present every non-surfaced package. The criteria (dev script + 15+ files + not excluded) is intentionally strict. The 15-file threshold aligns with Signal 4's `MIN_FILES_SERVER_DEP`. Packages below 15 files are too small to be meaningful services. Packages without `dev` scripts aren't independently runnable. This criteria will miss some edge cases — that's acceptable. The goal is zero false alerts for the sniper customer, even at the cost of missing some edge cases for complex monorepos.

**Surface gap presentation order:**
- The surface gap check runs AFTER the surfaces are shown, not before. The developer first sees what WAS detected, then what WASN'T. This prevents confusion about which packages are surfaces and which are suggestions.

**Setup agent adds surfaces to ana.json:**
- The setup agent already modifies ana.json in Step 2 (corrections). Adding a surface is the same operation: read ana.json, add the surface entry with scoped commands, write back. The commands follow the existing pattern: `(cd '{path}' && {pm} run {script})` for each available script (test, build, lint). The package manager comes from ana.json's `packageManager` field.

**Re-init interaction:**
- `stackProvenance` is in scan.json, which is fully refreshed on re-init. No preservation needed. Surfaces added by the setup agent via ana.json are preserved by `mergeSurfaces` on re-init (matched by path, user commands preserved).

**LLM reliability:**
- The setup agent is an LLM following template instructions. The surface gap check requires comparing two arrays (packages vs surfaces) — this is simple enough for reliable LLM execution. The provenance notes require reading a JSON field and presenting it — even simpler. Neither check involves LLM reasoning about whether something "should" be a surface — the criteria are explicit and deterministic.

## Rejected Approaches

**Full LLM-powered verification pass (Step 1.5).** The original proposal had four verification checks including database cross-checking by reading actual package.json files, framework verification by re-reading deps, and shape verification by reading the README. This adds latency, introduces LLM false alerts, and duplicates work the scan already does. The design principle "The elegant solution is the one that removes" suggests fixing the scan rather than adding a verification layer. Stack provenance and surface gap checks achieve the same outcome with deterministic data.

**Database cross-check by reading package.json.** Having the setup agent read the primary package's package.json and compare against the scan's database detection. This duplicates what `findStackProvenance` does deterministically — the scan can record provenance directly instead of asking the LLM to re-derive it at runtime.

**Shape verification against README.** The shape priority reordering in 1.1.3 (PR #194) already fixed the main class of shape errors (framework evidence now outranks CLI dep signals). Having the LLM re-read the README to verify shape is doing what the scan already does, but with probabilistic reasoning instead of deterministic heuristics. Monitor for shape accuracy in the field rather than adding a runtime check.

**Framework verification for monorepos.** Flagging multi-framework architectures (React frontend + NestJS backend) in Step 2. This is useful context, but it belongs in Step 5 (project-context Architecture section), not Step 2 (config confirmation). The setup agent's Step 4 investigation should already discover multi-framework architecture naturally. Putting it in Step 2 conflates config confirmation with architectural overview.

**Companion file (scan-hints.json).** A separate file alongside scan.json for verification metadata. Adds complexity — another file to manage, preserve on re-init, keep in sync. A top-level field in scan.json is simpler and follows the existing pattern (every detection result goes in scan.json).

**Near-miss surfaces in scan.json.** Having the scan record packages that triggered some-but-not-all surface signals. This adds complexity to the scan for a feature that can be computed by the setup agent from existing data. `monorepo.packages` already has scripts, file counts, and framework info — the setup agent can identify the gap without the scan pre-computing it.

## Open Questions

None. Resolved:
- Provenance function design: post-hoc analysis, not inline with detection. `detectFromDeps` stays unchanged.
- Which stack fields to track: database, auth, payments, aiSdk. NOT testing (intentionally cross-package) or framework (config-based, not dep-based).
- Surface gap criteria: dev script + 15 files + not excluded. Aligns with Signal 4's threshold. Conservative by design.
- Where provenance goes: `stackProvenance` field in scan.json, not a companion file.

## Exploration Findings

### Patterns Discovered

- `dependencies.ts`: All package maps (`DATABASE_PACKAGES`, `AUTH_PACKAGES`, `PAYMENT_PACKAGES`) are already exported. The reverse lookup from display name to package name is possible via `Object.entries().find()`.
- `scan-engine.ts`: `detectFromDeps` is called at line 663 with `census.allDeps`. The census object with per-root deps is available at line 645. Provenance can be computed immediately after `detectFromDeps` returns.
- `engineResult.ts`: `EngineResult.stack` is an inline type at line 111. `stackProvenance` would be a sibling field at the same level.
- `ana-setup.md` template: Step 2 already shows surfaces (lines 148-151) with per-surface test commands. The surface gap check would go immediately after this block.

### Constraints Discovered

- [TYPE-VERIFIED] `detectFromDeps` takes `allDeps: Record<string, string>` and returns `DependencyDetectionResult` with display names only (dependencies.ts:297-299). Package names are discarded after detection.
- [TYPE-VERIFIED] `SourceRoot.deps` is production-only (census.ts:524). `findStackProvenance` can check per-root production deps to find which root triggered a detection.
- [OBSERVED] `stack.database` and `stack.auth` can be filled by pattern detection (scan-engine.ts:803-811) when dep detection returns null. Provenance only applies to dep-detected fields.
- [OBSERVED] `EnrichedPackage` in scan.json already has `scripts: string[]` and `sourceFiles: number` — the setup agent has all data needed for the surface gap check without any scan changes.
- [OBSERVED] The setup template shows surfaces from ana.json (line 148-151), but reads scan.json in Step 1 (line 52). Both data sources are available for cross-referencing.

### Test Infrastructure

- `dependencies.test.ts`: 127 lines, 19 tests. Tests `detectFromDeps` with synthetic dep maps. `findStackProvenance` tests follow the same pattern but need synthetic census objects (import `makeRoot`/`makeCensus` helpers from surfaces.test.ts, or create similar helpers).

## For AnaPlan

### Structural Analog

`detectFromDeps` in dependencies.ts (line 297-312). Pure function, data in → structured result out. `findStackProvenance` follows the same pattern but takes census + depResult instead of allDeps. The test structure mirrors `dependencies.test.ts` — synthetic inputs, expected outputs.

### Relevant Code Paths

- `src/engine/detectors/dependencies.ts` lines 263-312 — `DependencyDetectionResult` type and `detectFromDeps`. `findStackProvenance` is a new exported function in this file.
- `src/engine/scan-engine.ts` lines 645-663 — census build and dep detection. Provenance computation goes after line 663.
- `src/engine/scan-engine.ts` lines 985-1014 — scan output assembly. `stackProvenance` goes alongside `stack`.
- `src/engine/types/engineResult.ts` lines 111-123 — `stack` type definition. `stackProvenance` type goes nearby.
- `templates/.claude/agents/ana-setup.md` lines 116-176 — Step 2: Config Confirmation. Surface gap check and provenance notes go within this step.

### Patterns to Follow

- Pure function pattern: `findStackProvenance(census, depResult)` following `detectFromDeps(allDeps)` (dependencies.ts:297)
- Exported type pattern: `StackProvenance` following `DependencyDetectionResult` (dependencies.ts:263)
- scan.json field pattern: `stackProvenance` at the same level as `stack` (engineResult.ts:111)
- Template instruction pattern: conditional presentation following the existing `[If surfaces in ana.json:` block (ana-setup.md:148)
- Empty-by-default pattern: `stackProvenance: {}` in `createEmptyEngineResult` (engineResult.ts:374)

### Known Gotchas

- `detectFromDeps` discards package names after matching — it returns display names only ("Supabase", not "@supabase/supabase-js"). `findStackProvenance` needs to reverse-lookup from display name to package name using the exported package maps. Use `Object.entries(DATABASE_PACKAGES).find(([, name]) => name === depResult.database)` to recover the triggering package name.
- Pattern-detected stack fields have no package-level provenance. Check `depResult.database` (not `stack.database`) to avoid flagging pattern-detected fields. If `depResult.database` is null, skip provenance for database even if `stack.database` is non-null.
- The setup template change is a product change — it ships to ALL customers via `templates/.claude/agents/ana-setup.md`. The dogfood template at `.claude/agents/ana-setup.md` is separate.

### Things to Investigate

- Whether the reverse lookup from display name to package name should be extracted as a reusable utility (e.g., `findTriggeringPackage(packageMap, displayName)`) or inlined in `findStackProvenance`. The function would be useful for future provenance-related features.
- Whether the surface gap presentation should include the package's detected framework (from `EnrichedPackage.framework`) to help the developer decide. Showing "valhalla/jawn (Express, 305 files, has dev/test)" is more informative than just "valhalla/jawn (305 files, has dev)."
- The exact wording of the provenance `ⓘ` note. It should prompt correction without being alarming — "detected from X, not your primary package" vs "⚠ might be wrong."
