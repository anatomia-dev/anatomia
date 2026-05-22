# Scope: Fix False Surface Detection

**Created by:** Ana
**Date:** 2026-05-21

## Intent

Non-product workspace packages (examples, templates, e2e fixtures, reference apps) are detected as product surfaces, polluting ana.json and misleading the pipeline. This is the #1 priority issue from R5 comprehensive validation — 12 of 35 monorepos (34%) have false surfaces, totaling ~82+ confirmed false detections across 13 repos.

The user wants surface detection to answer "what are the things you ship?" not "what workspace packages have framework configs?" The fix should remove false surfaces without affecting legitimate ones, clean up existing false surfaces on re-init, and handle library repos getting zero surfaces gracefully.

## Complexity Assessment
- **Kind:** fix
- **Size:** medium (focused change, two locations, well-defined boundary)
- **Surface:** cli
- **Files affected:** `src/engine/detectors/surfaces.ts`, `src/commands/init/state.ts`, `tests/engine/detectors/surfaces.test.ts`, new integration test file
- **Blast radius:** Low. The pre-filter runs before all signal logic — signals are untouched. Merge cleanup only drops surfaces whose paths prove they were never product. All downstream consumers already handle zero surfaces gracefully (verified: scan.ts, artifact.ts, work.ts, proof.ts, doctor.ts, state.ts).
- **Estimated effort:** ~2-3 hours implementation + tests
- **Multi-phase:** no

## Approach

Remove wrong inputs before they reach signal evaluation. Add a path-segment pre-filter to `detectSurfaces()` that excludes workspace packages whose path contains universally-understood non-product segments (examples, templates, e2e, test, references, playground, sandbox, etc.). Apply the same exclusion logic in `mergeSurfaces()` to clean up orphaned false surfaces on re-init. Export a shared predicate so both locations use a single source of truth.

This follows "the elegant solution is the one that removes" — we don't add complexity to signal logic, we remove wrong inputs. And it creates foundation: the `isNonProductPath` predicate is reusable for any future feature that needs to distinguish product from non-product paths.

## Acceptance Criteria
- AC1: Repos with false surfaces (payload, scalar, highlight, trpc, refine, tanstack-form, excalidraw, vercel-ai, trigger.dev, cal.com, directus, ever-gauzy, novu) produce correct surface counts after the fix.
- AC2: Repos with legitimate surfaces (dub, inbox-zero, supabase, teable, novu real surfaces, trigger.dev real surfaces, langfuse) are unaffected — same surfaces detected before and after.
- AC3: Library repos (trpc, refine, tanstack-form, excalidraw, vercel-ai) correctly get zero surfaces.
- AC4: Re-init on a repo that previously had false surfaces in ana.json drops the false surfaces (merge cleanup).
- AC5: `packages/test-utils` (segment = `test-utils`) is NOT excluded. Only exact segment matches trigger exclusion.
- AC6: `apps/gauzy-e2e` (segment = `gauzy-e2e`, ends with `-e2e`) IS excluded via suffix check.
- AC7: The `isNonProductPath` predicate is exported and used by both detection and merge — single source of truth.

## Edge Cases & Risks

- **`demo` as legitimate surface:** Theoretical risk. Zero instances in 70-repo test set. `apps/demo-app/` (segment = `demo-app`) would NOT be excluded. Risk accepted.
- **`playground` as legitimate surface:** A code-playground SaaS could theoretically have this. Target customers don't build meta-tooling. Risk negligible.
- **`sandbox` as legitimate surface:** Same pattern. `apps/sandbox-ui/` would NOT be excluded. Risk accepted.
- **Empty surfaces object after merge cleanup:** When all orphaned surfaces are dropped and no fresh surfaces detected, `mergeSurfaces()` returns `{}`. The merge caller should delete the `surfaces` key rather than writing an empty object to ana.json.
- **Case sensitivity:** macOS HFS+ is case-insensitive. The `.toLowerCase()` comparison handles unusual casing (`Examples/`, `TEMPLATES/`).

## Rejected Approaches

**Filter at census level.** Template/example packages' dependencies contribute to `allDeps` for stack detection (e.g., Payload's templates include `next` + `@payloadcms/next`). Filtering them from census would degrade stack detection. The surface detector is the right discrimination point.

**Make Signal 3 smarter.** Signal 3's logic is correct — a workspace package with a strong framework config IS likely deployable. The problem is what packages reach Signal 3, not Signal 3's logic. Adding path awareness to Signal 3 specifically would work but scatters the fix across signal logic instead of concentrating it in one pre-filter.

**Opt-in architecture (only detect under `apps/` + bin packages, remove Signal 3).** This would prevent false positives by construction but creates false negatives. Verified: langfuse has `web/` at top level (not under `apps/`, no bin) with `next.config.mjs` — Signal 3 is the only signal that catches it. teable has `plugins/` with `next.config.mjs` in the same situation. Signal 3 is necessary.

**Configurable exclusion overrides.** Future feature (`includeSurfaces` in ana.json). Not needed now — zero confirmed cases where the exclusion list produces a false negative for target customers. Don't build configuration for a problem nobody has.

**Include `integrations/` in exclusion list.** Verified: scalar includes `integrations/**/*` in workspace but no strong framework configs exist there. No false surface produced from `integrations/` paths. Don't exclude what isn't broken.

## Open Questions

None. All open questions from the requirements doc resolved during investigation:

- **Export set vs predicate:** Export the predicate (`isNonProductPath`), keep the Set private. Other modules need to ask "is this path non-product?" — they don't need the vocabulary.
- **`integrations/` problem:** Verified it doesn't exist. No action needed.
- **`docs/` exclusion:** Confirmed it should NOT be excluded (supabase `apps/docs`, documenso `apps/docs` are real surfaces). Add a code comment documenting this intentional non-exclusion.
- **`-e2e` suffix breadth:** `endsWith('-e2e')` is sufficient. Only one Nx pattern exists in the wild. No need for `-e2e-tests` variant.
- **Zero-surface pipeline interaction:** Fully traced. Every consumer handles zero surfaces gracefully. No code changes needed downstream.
- **Data-driven vs hardcoded:** Hardcoded Set is correct. The vocabulary is universal. Don't over-engineer.
- **Opt-in vs opt-out:** Opt-out (pre-filter) is correct. Signal 3 catches legitimate surfaces outside `apps/` that have no bin field.

## Exploration Findings

### Patterns Discovered
- `surfaces.ts:220-228` — existing pre-filter chain (root package, min files, infra patterns). New filter slots at line 229.
- `state.ts:641-645` — merge cleanup "keep removed surfaces" loop. The modification point for Part 2.
- `surfaces.test.ts` — `makeRoot()` and `makeCensus()` helpers already exist for synthetic census testing.

### Constraints Discovered
- [TYPE-VERIFIED] Zero-surface graceful degradation (artifact.ts:627, work.ts:923, scan.ts:207, state.ts:559, proof.ts:63, doctor.ts:379) — all guard on `length > 0` or `Object.keys().length > 0`
- [OBSERVED] `mergeSurfaces` writes `surfaces: {}` when result is empty but existed before — minor cosmetic to clean up
- [OBSERVED] Scope `**Surface:**` field validation skips entirely when no surfaces in ana.json — no downstream change needed
- [TYPE-VERIFIED] ana.json schema defaults surfaces to `{}` via Zod (anaJsonSchema.ts:63)

### Test Infrastructure
- `tests/engine/detectors/surfaces.test.ts` — `makeRoot()` creates synthetic SourceRoot objects, `makeCensus()` builds ProjectCensus. Both accept partial overrides. Tests exercise all three signals and pre-filters.

## For AnaPlan

### Structural Analog
`INFRA_PATTERNS` check at surfaces.ts:227-228. Identical pattern: a Set of known names, checked against path segments. The new pre-filter is the same shape at broader scope.

### Relevant Code Paths
- `src/engine/detectors/surfaces.ts` — main detection logic, lines 220-248 are the pre-filter + signal chain
- `src/commands/init/state.ts:641-645` — merge cleanup loop for orphaned surfaces
- `src/commands/init/state.ts:768-770` — merge caller that writes surfaces to ana.json
- `tests/engine/detectors/surfaces.test.ts` — existing test suite with helpers

### Patterns to Follow
- Pre-filter style: `if (condition) continue;` inside the sourceRoots loop (matches lines 221, 224, 228)
- Set + exact match for segments (matches INFRA_PATTERNS pattern)
- Export predicate function (matches existing exported constants like `STRONG_FRAMEWORK_CONFIGS`, `INFRA_PATTERNS`)

### Known Gotchas
- The pre-filter must run BEFORE all signals (including Signal 1 which doesn't check paths). Insert after line 228, before line 231.
- `relativePath` uses forward slashes even on Windows (comes from `@manypkg/get-packages` normalized paths).
- The `lastSegment` variable at line 227 is already computed for INFRA_PATTERNS — reuse or rename to avoid shadowing.
- After merge cleanup returns `{}`, the caller at line 769 should check emptiness and delete the key rather than assigning empty object.
- Add code comment near EXCLUDED_SEGMENTS documenting intentional non-exclusions: `docs` (real deployable surface), `integrations` (no confirmed false surfaces).

### Things to Investigate
- Whether the existing `lastSegment` variable (line 227) should be reused for the suffix check or computed fresh (the pre-filter checks ALL segments, not just the last one, so the segment iteration is separate — but the suffix check IS on the last segment only).
