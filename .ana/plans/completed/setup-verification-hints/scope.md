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
  - `src/engine/detectors/dependencies.ts` — extend `DependencyDetectionResult` with triggering package names, new `findStackProvenance` function
  - `src/engine/types/engineResult.ts` — `StackProvenance` type, add `stackProvenance` to `EngineResult`, update `createEmptyEngineResult`
  - `src/engine/scan-engine.ts` — wire provenance into scan output (between line 663 and stack assembly at 773)
  - `templates/.claude/agents/ana-setup.md` — hardened Step 2 with verification hints
  - `tests/engine/detectors/dependencies.test.ts` — provenance detection tests
  - `tests/contract/analyzer-contract.test.ts` — add `stackProvenance` to expected keys list (required by the cross-cutting update checklist at engineResult.ts:8-14)
- **Blast radius:** Low. Provenance is a new additive field in scan.json — existing consumers ignore unknown fields. The setup template change is prose instructions for an LLM agent, not code. No changes to ana.json schema, init logic, or pipeline flow.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Two changes that work together:

**1. Scan enrichment: stack detection provenance.** Two small changes work together:

First, extend `DependencyDetectionResult` to carry the triggering npm package name alongside each display name. Today `detectFromDeps` finds `@supabase/supabase-js` → stores `"Supabase"` and discards the package name. The extension captures both: `{ database: "Supabase", databasePkg: "@supabase/supabase-js" }`. This eliminates a fragile reverse-lookup problem: multiple npm packages map to the same display name (4 packages → "PostgreSQL", 2 → "Prisma", 2 → "Firebase", 2 → "SQLite"), so reverse-mapping from display name back to package name via `find()` returns the wrong package. Forward capture is ~5 lines of change in `detectFromDeps` — one extra assignment per detection loop.

Second, a new function `findStackProvenance` takes the census and the extended dep result, and searches per-source-root deps to find which root contributed each detection. It checks BOTH `root.deps` AND `root.devDeps` — because `census.allDeps` merges both production and dev dependencies across all roots, a detection could come from either. When the detection source is a non-primary package, it records the source root path. This produces a `stackProvenance` field in scan.json — empty object `{}` when all detections came from the primary package (the common case), populated only for cross-package detections.

The provenance shape is simple: `{ database: "packages/nodes-langchain" }` — just the source root path. The display name is already in `stack.database` and the npm package name is in `depResult.databasePkg`. The setup agent only needs the source path to present "detected from X, not your primary package."

Both functions are pure: data in, structured result out. ~40-50 lines total.

**2. Setup template hardening: verification-aware Step 2.** Two additions to the Config Confirmation step:

- **Surface gap check.** After showing surfaces, the setup agent reads `monorepo.packages` from scan.json and identifies packages that have a `dev` script, 15+ source files, and are NOT in the `surfaces` array. Packages whose path contains `examples`, `templates`, `fixtures`, `e2e`, `test`, `tests`, `testing`, `playground`, `sandbox`, `demos`, `starters`, `samples`, `boilerplate`, or `references` are excluded (these are the non-product path conventions from the scan's EXCLUDED_SEGMENTS — inlined in the template since the LLM can't read code constants). Packages whose last path segment is `tsconfig`, `eslint-config`, `prettier-config`, `tailwind-config`, `config-typescript`, or `biome-config` are also excluded (INFRA_PATTERNS). Results are capped at 5 packages, sorted by source file count descending, with a "+ N more" overflow note if applicable. If the developer says yes to adding any, the setup agent writes them into ana.json with scoped commands. This uses existing scan.json data — no new scan computation needed.

- **Provenance notes.** When `stackProvenance` has entries (non-primary detections), the setup agent shows an inline `ⓘ` note under the Stack line: "Database: Supabase — detected from packages/nodes-langchain, not your primary package. Correct?" This lets the developer catch cross-package detections without any LLM reasoning — the scan already determined the provenance, the setup agent just reads and presents it.

Both additions are silent when there's nothing to flag. The sniper customer with a correct scan sees the exact same Step 2 as today. Only monorepos with cross-package stack detections or unsurfaced backend services see the additional notes.

## Acceptance Criteria

- AC1: `DependencyDetectionResult` gains optional `databasePkg`, `authPkg`, `paymentsPkg` fields that carry the triggering npm package name for each detection. `detectFromDeps` captures these alongside the display names. This eliminates fragile reverse lookups from display name to package name.
- AC2: scan.json contains a `stackProvenance` field. When all stack detections come from the primary package (or for single-repo projects), the field is an empty object `{}`. When a detection came from a non-primary package, it contains an entry with the source root path: `{ database: "packages/nodes-langchain" }`.
- AC3: `findStackProvenance` checks `database`, `auth`, `payments`, and `aiSdk`. It does NOT check `testing` (testing detection intentionally uses rootDevDeps fallback — provenance is expected to be cross-package) or `framework` (framework detection already uses `census.primaryDeps` for monorepos — scan-engine.ts:689-690 — so provenance is always "primary" by construction).
- AC4: `findStackProvenance` is a pure function: `(census: ProjectCensus, depResult: DependencyDetectionResult, aiSdk: string | null) => StackProvenance`. The `aiSdk` parameter is separate because `detectAiSdk` is a separate function from `detectFromDeps` — aiSdk is not part of `DependencyDetectionResult`. No filesystem access. Testable with synthetic census objects.
- AC5: `findStackProvenance` checks BOTH `root.deps` AND `root.devDeps` for each source root. This is required because `census.allDeps` merges both production and dev dependencies — a detection could come from either.
- AC6: For single-repo projects (no monorepo), `stackProvenance` is always `{}` — provenance is only meaningful when multiple packages exist. For non-Node projects where `aiSdk` comes from `detectNonNodeAiSdk` (language-specific deps, not `census.allDeps`), no aiSdk provenance entry is created.
- AC7: The setup template's Step 2, after showing surfaces, cross-references `monorepo.packages` against `surfaces` in scan.json. Packages with a `dev` script AND 15+ source files AND not in `surfaces` AND not matching inlined non-product path patterns are presented as potential surfaces. Capped at 5 suggestions sorted by source file count descending.
- AC8: The setup template's Step 2, when `stackProvenance` has entries, shows an `ⓘ` note for each non-primary detection with the source package path and an offer to correct.
- AC9: When the developer confirms adding a potential surface, the setup agent writes it to ana.json `surfaces` with scoped commands derived from the package's scripts and the project's package manager. Commands use the pattern `(cd '{path}' && {pm} run {script})` where `{pm}` is `npm run` for npm, `{pm} run` for others. Surface entries include test, build, lint commands (when the package has those scripts) and `dev: null` — matching `createAnaJson`'s behavior. The setup agent reads back ana.json after writing to confirm persistence.
- AC10: When no provenance flags exist and no surface gaps are found, Step 2 looks identical to the current flow — zero additional presentation.

## Edge Cases & Risks

**Provenance for pattern-detected stack fields:**
- `stack.database` and `stack.auth` can also come from deep-tier pattern detection (scan-engine.ts lines 803-811), not just `detectFromDeps`. When the dep detection returns null but pattern detection fills the field, there's no package-level provenance — the detection came from code patterns, not dependencies. `findStackProvenance` only runs against dep-detected fields. If `depResult.database` is null but `stack.database` is non-null (pattern-detected), no provenance entry is created. This is correct — pattern detection reads sampled files across the project, not per-package deps.

**Single-repo provenance:**
- Single-repo projects have one source root marked as primary. `detectFromDeps` runs against `census.allDeps` which equals that root's deps merged with devDeps. Provenance is always "primary" → empty `stackProvenance`. No false flags.

**The surface gap criteria must be conservative:**
- The setup agent should NOT present every non-surfaced package. The criteria (dev script + 15+ files + not excluded) is intentionally strict. The 15-file threshold aligns with Signal 4's `MIN_FILES_SERVER_DEP`. Packages below 15 files are too small to be meaningful services. Packages without `dev` scripts aren't independently runnable. Results are capped at 5 packages sorted by file count descending — a microservices monorepo with 20 matching packages shows the 5 largest, not all 20. This criteria will miss some edge cases — that's acceptable. The goal is zero false alerts for the sniper customer, even at the cost of missing some edge cases for complex monorepos.
- The criteria only works for Node workspace packages. Python/Go/Rust packages in a monorepo won't have `dev` scripts in package.json. This is a known limitation — non-Node surface gap detection is a separate concern.

**Surface gap presentation order:**
- The surface gap check runs AFTER the surfaces are shown, not before. The developer first sees what WAS detected, then what WASN'T. This prevents confusion about which packages are surfaces and which are suggestions.

**Setup agent adds surfaces to ana.json:**
- The setup agent already modifies ana.json in Step 2 (corrections). Adding a surface is the same operation: read ana.json, add the surface entry with scoped commands, write back. The commands follow the existing pattern: `(cd '{path}' && {pm} run {script})` where `{pm}` is `npm run` for npm or `{pm} run` for pnpm/yarn. Commands include test, build, lint (when the package has those scripts) and `dev: null` — matching `createAnaJson`'s behavior where dev is always null in surface commands. The setup agent should NOT attempt to replicate `createAnaJson`'s full script-detection logic (checking for `compile`, `tsc` variants, `buildDirectTestCommand` fallback) — simple `{pm} run test/build/lint` is sufficient for setup-added surfaces.

**Re-init interaction:**
- `stackProvenance` is in scan.json, which is fully refreshed on re-init. No preservation needed. Surfaces added by the setup agent via ana.json are preserved by `mergeSurfaces` on re-init (matched by path, user commands preserved). However, `mergeSurfaces` will log a console warning: "Surface 'X' (path) no longer detected — keeping existing configuration." This is existing behavior for any surface not in the fresh scan output. The warning is informative, not destructive — the surface remains.

**LLM reliability:**
- The setup agent is an LLM following template instructions. The surface gap check requires comparing two arrays (packages vs surfaces) — this is simple enough for reliable LLM execution. The provenance notes require reading a JSON field and presenting it — even simpler. Neither check involves LLM reasoning about whether something "should" be a surface — the criteria are explicit and deterministic.

## Rejected Approaches

**Full LLM-powered verification pass (Step 1.5).** The original proposal had four verification checks including database cross-checking by reading actual package.json files, framework verification by re-reading deps, and shape verification by reading the README. This adds latency, introduces LLM false alerts, and duplicates work the scan already does. The design principle "The elegant solution is the one that removes" suggests fixing the scan rather than adding a verification layer. Stack provenance and surface gap checks achieve the same outcome with deterministic data.

**Database cross-check by reading package.json.** Having the setup agent read the primary package's package.json and compare against the scan's database detection. This duplicates what `findStackProvenance` does deterministically — the scan can record provenance directly instead of asking the LLM to re-derive it at runtime.

**Shape verification against README.** The shape priority reordering in 1.1.3 (PR #194) already fixed the main class of shape errors (framework evidence now outranks CLI dep signals). Having the LLM re-read the README to verify shape is doing what the scan already does, but with probabilistic reasoning instead of deterministic heuristics. Monitor for shape accuracy in the field rather than adding a runtime check.

**Framework verification for monorepos.** Flagging multi-framework architectures (React frontend + NestJS backend) in Step 2. This is useful context, but it belongs in Step 5 (project-context Architecture section), not Step 2 (config confirmation). The setup agent's Step 4 investigation should already discover multi-framework architecture naturally. Putting it in Step 2 conflates config confirmation with architectural overview.

**Companion file (scan-hints.json).** A separate file alongside scan.json for verification metadata. Adds complexity — another file to manage, preserve on re-init, keep in sync. A top-level field in scan.json is simpler and follows the existing pattern (every detection result goes in scan.json).

**Near-miss surfaces in scan.json.** Having the scan record packages that triggered some-but-not-all surface signals. This adds complexity to the scan for a feature that can be computed by the setup agent from existing data. `monorepo.packages` already has scripts, file counts, and framework info — the setup agent can identify the gap without the scan pre-computing it.

**Reverse lookup from display name to package name.** The original design had `findStackProvenance` use `Object.entries(DATABASE_PACKAGES).find(([, name]) => name === displayName)` to recover the triggering npm package. Three redundant review agents unanimously identified this as fragile: multiple packages map to the same display name (4 packages → "PostgreSQL", 2 → "Prisma", 2 → "Firebase", 2 → "SQLite", 3 → "Stripe"). `find()` returns the first match, which may not be the actual triggering package. The fix: extend `detectFromDeps` to capture the triggering package name forward (5 lines of change), eliminating the reverse lookup entirely. This follows "The elegant solution is the one that removes."

## Open Questions

None. Resolved:
- Provenance function design: forward capture in `detectFromDeps` (extends return type with triggering package names) + post-hoc `findStackProvenance` for per-root attribution. Reverse lookup rejected after redundant review found it unreliable.
- Which stack fields to track: database, auth, payments, aiSdk. NOT testing (intentionally cross-package via rootDevDeps fallback) or framework (config-based, not dep-based).
- `findStackProvenance` must check both `root.deps` AND `root.devDeps` because `census.allDeps` merges both.
- Surface gap criteria: dev script + 15 files + not excluded + capped at 5. Aligns with Signal 4's threshold. Conservative by design.
- Where provenance goes: `stackProvenance` field in scan.json, not a companion file.
- Non-Node AI SDK: `detectNonNodeAiSdk` uses language-specific deps not accessible via `SourceRoot.deps/devDeps`. No aiSdk provenance for non-Node projects — stated as known limitation.
- `aiSdk` is separate from `DependencyDetectionResult` — `findStackProvenance` takes it as a third parameter.
- Contract test at `tests/contract/analyzer-contract.test.ts` must be updated with the new key.

## Exploration Findings

### Patterns Discovered

- `dependencies.ts`: All package maps are already exported `Record<string, string>`. Multiple packages map to same display names (PostgreSQL=4, Prisma=2, Firebase=2, SQLite=2, Stripe=3, Clerk=3). Forward capture in `detectFromDeps` eliminates this ambiguity.
- `scan-engine.ts`: `detectFromDeps` called at line 663 with `census.allDeps`. `detectAiSdk` called separately at line 787 with same `allDeps`. Census object available at line 645. Provenance goes between lines 663 and 773 (stack assembly).
- `census.ts`: `allDeps` merges BOTH `deps` AND `devDeps` across all roots (lines 548-555). `rootDevDeps` is separate (line 561) and NOT included in `allDeps`.
- `engineResult.ts`: cross-cutting update checklist at lines 8-14 requires changes in 5+ locations including `analyzer-contract.test.ts`.
- `ana-setup.md` template: Step 2 already shows surfaces (lines 148-151). Surface gap check goes after this block. LLM cannot access code constants — exclusion patterns must be inlined in template prose.

### Constraints Discovered

- [TYPE-VERIFIED] `detectFromDeps` takes `allDeps: Record<string, string>` and returns `DependencyDetectionResult` with display names only (dependencies.ts:297-299). Package names are discarded. Extended in this scope to also return triggering package names.
- [TYPE-VERIFIED] `SourceRoot.deps` is production-only (census.ts:524). `SourceRoot.devDeps` is dev-only (census.ts:525). `findStackProvenance` MUST check both because `allDeps` merges both.
- [TYPE-VERIFIED] `DependencyDetectionResult` has `database`, `auth`, `testing`, `payments` — NOT `aiSdk` (dependencies.ts:263-274). aiSdk is detected by separate `detectAiSdk` function.
- [OBSERVED] `stack.database` and `stack.auth` can be filled by pattern detection (scan-engine.ts:803-811) when dep detection returns null. Provenance only applies to dep-detected fields.
- [OBSERVED] `EnrichedPackage` in scan.json has `scripts: string[]` and `sourceFiles: number` — the setup agent has all data for surface gap check without scan changes.
- [OBSERVED] Non-Node AI SDK detection uses `detectNonNodeAiSdk(deps)` where deps are language-specific strings (scan-engine.ts:834-835), not census `SourceRoot.deps`. Provenance cannot trace non-Node aiSdk.
- [OBSERVED] `analyzer-contract.test.ts` line 148-182 has explicit `expectedKeys` array. Adding `stackProvenance` to `EngineResult` without updating this list fails CI.

### Test Infrastructure

- `dependencies.test.ts`: 127 lines, 19 tests. Tests `detectFromDeps` with synthetic dep maps. `findStackProvenance` tests need synthetic census objects — `makeRoot`/`makeCensus` helpers exist in `surfaces.test.ts` but are local (not exported). Either extract to a shared `tests/engine/helpers/census.ts` or duplicate locally. Extraction is preferred — follows "finished means a stranger can extend it."

## For AnaPlan

### Structural Analog

`detectFromDeps` in dependencies.ts (line 297-312). Pure function, data in → structured result out. `findStackProvenance` follows the same pattern but takes census + depResult instead of allDeps. The test structure mirrors `dependencies.test.ts` — synthetic inputs, expected outputs.

### Relevant Code Paths

- `src/engine/detectors/dependencies.ts` lines 263-312 — `DependencyDetectionResult` type and `detectFromDeps`. Extend type + capture triggering package names. `findStackProvenance` is a new exported function in this file.
- `src/engine/scan-engine.ts` lines 645-663 — census build and dep detection. Provenance computation goes between line 663 and stack assembly at 773.
- `src/engine/scan-engine.ts` line 787 — `detectAiSdk(allDeps)` call. aiSdk result passed as third arg to `findStackProvenance`.
- `src/engine/scan-engine.ts` lines 985-1014 — scan output assembly. `stackProvenance` goes alongside `stack`.
- `src/engine/types/engineResult.ts` lines 111-123 — `stack` type definition. `StackProvenance` type goes nearby. `createEmptyEngineResult` at line 371 needs `stackProvenance: {}`.
- `tests/contract/analyzer-contract.test.ts` lines 148-182 — `expectedKeys` array. Must add `stackProvenance`.
- `templates/.claude/agents/ana-setup.md` lines 116-176 — Step 2: Config Confirmation. Surface gap check and provenance notes go within this step.

### Patterns to Follow

- Pure function pattern: `findStackProvenance(census, depResult, aiSdk)` following `detectFromDeps(allDeps)` (dependencies.ts:297)
- Forward capture pattern: `databasePkg` alongside `database` in `DependencyDetectionResult`, similar to how each detection loop already captures `pkg` and `name`
- Exported type pattern: `StackProvenance` following `DependencyDetectionResult` (dependencies.ts:263)
- scan.json field pattern: `stackProvenance` at the same level as `stack` (engineResult.ts:111)
- Template instruction pattern: conditional presentation following the existing `[If surfaces in ana.json:` block (ana-setup.md:148)
- Empty-by-default pattern: `stackProvenance: {}` in `createEmptyEngineResult` (engineResult.ts:374)
- Template read-back pattern: after writing surface to ana.json, read back to confirm — following existing Step 2 correction pattern (ana-setup.md:164)

### Known Gotchas

- `detectFromDeps` is being extended to forward-capture triggering package names. The extension is additive — existing consumers that read `depResult.database` (display name) are unaffected. New fields (`databasePkg`, `authPkg`, `paymentsPkg`) are optional additions.
- Pattern-detected stack fields have no package-level provenance. Check `depResult.database` (not `stack.database`) to avoid flagging pattern-detected fields. If `depResult.database` is null, skip provenance for database even if `stack.database` is non-null.
- The setup template change is a product change — it ships to ALL customers via `templates/.claude/agents/ana-setup.md`. The dogfood template at `.claude/agents/ana-setup.md` is separate.
- `createAnaJson` in state.ts sets `dev: null` for surface commands (line 547). Setup-agent-added surfaces should match this convention — don't include dev commands.
- `mergeSurfaces` will log "no longer detected — keeping existing configuration" for setup-added surfaces on re-init. This is informative, not destructive.

### Things to Investigate

- Whether the surface gap presentation should include the package's detected framework (from `EnrichedPackage.framework`) to help the developer decide. Showing "valhalla/jawn (Express, 305 files, has dev/test)" is more informative than just "valhalla/jawn (305 files, has dev)."
- The exact wording of the provenance `ⓘ` note. It should prompt correction without being alarming — "detected from X, not your primary package" vs "⚠ might be wrong."
- Whether extracting `makeRoot`/`makeCensus` to a shared test helper module has any circular import risk with the existing test structure.
