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

Remove wrong inputs before they reach signal evaluation. Add a path-segment pre-filter to `detectSurfaces()` that excludes workspace packages whose relativePath contains any segment from a defined non-product vocabulary. The complete exclusion set:

```
examples, example, example-apps, templates, template, e2e, test, tests,
references, reference, demos, demo, starters, starter, fixtures, fixture,
playground, playgrounds, sandbox, samples, sample, boilerplate
```

Plus a suffix rule: any package whose last path segment ends with `-e2e` (Nx/Turborepo convention for test projects, e.g., `apps/gauzy-e2e`).

Apply the same exclusion logic in `mergeSurfaces()` to silently clean up orphaned false surfaces on re-init. Export a shared `isNonProductPath` predicate so both locations use a single source of truth.

This follows "the elegant solution is the one that removes" — we don't add complexity to signal logic, we remove wrong inputs. And it creates foundation: the `isNonProductPath` predicate is reusable for any future feature that needs to distinguish product from non-product paths.

## Acceptance Criteria
- AC1: Repos with false surfaces produce correct surface counts after the fix:
  | Repo | Expected surfaces after fix |
  |------|---------------------------|
  | payload | 0 (framework monorepo — ships npm packages, not deployable apps) |
  | scalar | 0 (library — all detected surfaces were from examples/) |
  | trpc | 0 (library — all 20 surfaces were from examples/) |
  | refine | 0 (library — all 14 from examples/) |
  | tanstack-form | 0 (library — all 5 from examples/) |
  | excalidraw | 0 (library — 1 from examples/) |
  | vercel-ai | 0 (library — all 18 from examples/) |
  | highlight | real surfaces only (false surfaces from e2e/ removed) |
  | trigger.dev | 2: webapp (apps/webapp, remix.config.js), cli-v3 (packages/cli-v3, bin+dev) |
  | cal.com | real surfaces only (example-apps/ and platform/examples/ removed) |
  | directus | real surfaces only (tests/sandbox removed) |
  | ever-gauzy | real surfaces only (apps/gauzy-e2e removed via -e2e suffix) |
  | novu | real surfaces only (playground/ removed; apps/api, dashboard, worker, webhook, ws retained) |
- AC2: Repos with legitimate surfaces are unaffected — same surfaces detected before and after. Verified safe: dub (apps/web), inbox-zero (apps/web, apps/worker, packages/cli), supabase (apps/studio, apps/docs, apps/www, etc.), teable (apps/*, plugins/), trigger.dev real surfaces, langfuse (web/).
- AC3: Library repos (trpc, refine, tanstack-form, excalidraw, vercel-ai) correctly get zero surfaces.
- AC4: Re-init on a repo that previously had false surfaces in ana.json silently drops the false surfaces — no console.warn, no log message. These were never legitimate user state; surfacing "dropped surface X" warnings would confuse users who never manually configured surfaces.
- AC5: `packages/test-utils` (segment = `test-utils`) is NOT excluded. Only exact segment matches trigger exclusion.
- AC6: `apps/gauzy-e2e` (segment = `gauzy-e2e`, ends with `-e2e`) IS excluded via suffix check.
- AC7: The `isNonProductPath` predicate is exported from `surfaces.ts` and used by both detection and merge — single source of truth.
- AC8: After merge cleanup produces an empty result, the `surfaces` key is omitted from ana.json (not written as `"surfaces": {}`).

## Edge Cases & Risks

- **`demo` as legitimate surface:** Theoretical risk. Zero instances in 70-repo test set. `apps/demo-app/` (segment = `demo-app`) would NOT be excluded. Risk accepted.
- **`playground` as legitimate surface:** A code-playground SaaS could theoretically have this. Target customers don't build meta-tooling. Risk negligible.
- **`sandbox` as legitimate surface:** Same pattern. `apps/sandbox-ui/` would NOT be excluded. Risk accepted.
- **Empty surfaces object after merge cleanup:** When all orphaned surfaces are dropped and no fresh surfaces detected, `mergeSurfaces()` returns `{}`. The merge caller at state.ts:768-770 should check emptiness and delete the key rather than assigning empty object (AC8).
- **Case sensitivity:** macOS HFS+ is case-insensitive. The `.toLowerCase()` comparison handles unusual casing (`Examples/`, `TEMPLATES/`).

## Rejected Approaches

**Filter at census level.** Template/example packages' dependencies contribute to `allDeps` for stack detection (e.g., Payload's templates include `next` + `@payloadcms/next`). Filtering them from census would degrade stack detection. The surface detector is the right discrimination point.

**Make Signal 3 smarter.** Signal 3's logic is correct — a workspace package with a strong framework config IS likely deployable. The problem is what packages reach Signal 3, not Signal 3's logic. Adding path awareness to Signal 3 specifically would work but scatters the fix across signal logic instead of concentrating it in one pre-filter.

**Opt-in architecture (only detect under `apps/` + bin packages, remove Signal 3).** This would prevent false positives by construction but creates false negatives. Verified: langfuse has `web/` at top level (not under `apps/`, no bin) with `next.config.mjs` — Signal 3 is the only signal that catches it. teable has `plugins/` with `next.config.mjs` in the same situation. Signal 3 is necessary.

**Configurable exclusion overrides.** Future feature (`includeSurfaces` in ana.json). Not needed now — zero confirmed cases where the exclusion list produces a false negative for target customers. Don't build configuration for a problem nobody has.

**Include `integrations/` in exclusion list.** Verified: scalar includes `integrations/**/*` in workspace but no strong framework configs exist there. No false surface produced from `integrations/` paths. Don't exclude what isn't broken.

**Put `isNonProductPath` in utils/ or a shared constants file.** Investigated: `artifact.ts` already imports from `engine/findings/rules/secrets.js`. The `commands/ → engine/detectors/` import path has established precedent. The predicate belongs in `surfaces.ts` because it's surface-detection domain logic, not a generic utility.

## Open Questions

None. All resolved during investigation.

## Exploration Findings

### Patterns Discovered
- `surfaces.ts:220-228` — existing pre-filter chain (root package, min files, infra patterns). New filter slots at line 229.
- `state.ts:641-645` — merge cleanup "keep removed surfaces" loop. The modification point for Part 2.
- `surfaces.test.ts` — `makeRoot()` and `makeCensus()` helpers already exist for synthetic census testing.
- `artifact.ts:27` — imports `SECRET_PATTERNS` from `engine/findings/rules/secrets.js`. Precedent for `commands/ → engine/detectors/` import.

### Constraints Discovered
- [TYPE-VERIFIED] Zero-surface graceful degradation (artifact.ts:627, work.ts:923, scan.ts:207, state.ts:559, proof.ts:63, doctor.ts:379) — all guard on `length > 0` or `Object.keys().length > 0`
- [OBSERVED] `mergeSurfaces` writes `surfaces: {}` when result is empty but existed before — fix via AC8
- [OBSERVED] Scope `**Surface:**` field validation skips entirely when no surfaces in ana.json — no downstream change needed
- [TYPE-VERIFIED] ana.json schema defaults surfaces to `{}` via Zod (anaJsonSchema.ts:63)
- [OBSERVED] `commands/ → engine/` imports exist: artifact.ts imports from findings/rules/, state.ts and skills.ts import from engine/types/

### Test Infrastructure
- `tests/engine/detectors/surfaces.test.ts` — `makeRoot()` creates synthetic SourceRoot objects, `makeCensus()` builds ProjectCensus. Both accept partial overrides. Tests exercise all three signals and pre-filters.

## For AnaPlan

### Structural Analog
`INFRA_PATTERNS` check at surfaces.ts:227-228. Identical pattern: a Set of known names, checked against path segments. The new pre-filter is the same shape at broader scope.

### Relevant Code Paths
- `src/engine/detectors/surfaces.ts` — main detection logic, lines 220-248 are the pre-filter + signal chain
- `src/commands/init/state.ts:641-645` — merge cleanup loop for orphaned surfaces
- `src/commands/init/state.ts:768-770` — merge caller that writes surfaces to ana.json (needs empty-check per AC8)
- `tests/engine/detectors/surfaces.test.ts` — existing test suite with helpers

### Patterns to Follow
- Pre-filter style: `if (condition) continue;` inside the sourceRoots loop (matches lines 221, 224, 228)
- Set + exact match for segments (matches INFRA_PATTERNS pattern)
- Export predicate function alongside the private Set (matches how `STRONG_FRAMEWORK_CONFIGS` is exported as a Set but `hasStrongConfig` is a private function — here we invert: Set is private, predicate is exported)

### Known Gotchas
- The pre-filter must run BEFORE all signals (including Signal 1 which doesn't check paths). Insert after line 228, before line 231.
- `relativePath` uses forward slashes even on Windows (comes from `@manypkg/get-packages` normalized paths).
- The existing `lastSegment` at line 227 can be reused for the `-e2e` suffix check since it's the same variable (last segment of relativePath). The segment-set iteration is separate (checks ALL segments), but the suffix check targets only the last segment — same variable, different check.
- After merge cleanup returns `{}`, the caller at line 769 should check emptiness and omit the key (matching the pattern at state.ts:559 for fresh configs).
- Add code comment near EXCLUDED_SEGMENTS documenting intentional non-exclusions: `docs` (real deployable surface), `integrations` (no confirmed false surfaces).
- The merge cleanup drops silently (no console.warn). This is intentional — the existing `console.warn` at line 643 is for RETAINED orphaned surfaces, not dropped ones.

### Things to Investigate
None. All implementation details resolved during scoping.
