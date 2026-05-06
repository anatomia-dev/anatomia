# Scope: Code Comment Cleanup

**Created by:** Ana
**Date:** 2026-05-05

## Intent

The codebase carries its construction history. A contributor opens scan-engine.ts and reads about `analyze()` — a function deleted months ago. They copy a JSDoc example and get "function not found." They see `S19/SCAN-032` and learn nothing. 286 internal references across 97 files reference sprints, deleted functions, nonexistent documents, and implementation plan identifiers. The code works. The comments lie.

The principle: "Finished means a stranger can extend it." A stranger reading these files encounters a false mental model before they encounter the real one.

## Complexity Assessment

- **Size:** large
- **Files affected:** ~97 (67 in src/, 30 in tests/)
- **Blast radius:** Zero behavioral change — every edit is a comment rewrite, comment removal, or test file rename. No production logic touched. The only compilation-affecting changes are 14 `any` type replacements in test files.
- **Estimated effort:** 2-3 hours across 2-3 Build phases
- **Multi-phase:** yes

## Approach

Strip internal development artifacts from every source and test file. Three categories of change:

1. **Fix lies.** Rewrite headers and JSDoc that describe deleted functions (`analyze()`) as if they exist. Remove @example blocks that produce "function not found." These are the highest-priority items — they actively mislead contributors.

2. **Remove noise.** Delete tombstone comments for code nobody will search for ("mapToPatternDetail deleted Item 6"). Remove references to nonexistent documents (START_HERE.md, /ATLAS3/). These add zero value.

3. **Translate jargon.** Rewrite sprint/plan/ticket identifiers to plain English. `S19/SCAN-032: flag missing test coverage` becomes the rationale it always meant: "Package manager: non-Node projects return null instead of defaulting to 'npm'." Keep the "why," drop the identifier.

For every reference: if the underlying rationale has value, rewrite to plain English. If not, remove. The ruby.ts and php.ts tombstones explain why the parser exists without a reader — rewrite without sprint refs, keep the explanation.

Rename `s11-detection.test.ts` to describe what it actually tests (TypeScript override, Prisma parsing, package manager inheritance), not which sprint created it.

Replace 14 `any` types in test files with proper types. These are not simple substitutions — `imports.test.ts` needs the conventions analyzer import type, `ai-sdk-detection.test.ts` needs `Partial<EngineResult>` or a test helper type.

## Acceptance Criteria

- AC1: `scan-engine.ts` header accurately describes the census-based pipeline — no reference to `analyze()`
- AC2: `scan-engine.ts:605-613` paragraph about `analyze()` relationship is removed
- AC3: `engine/index.ts` tombstone comments removed — file contains only clean re-exports
- AC4: `treeSitter.ts` checkpoint list removed
- AC5: Zero references to `START_HERE.md` or `/ATLAS3/` remain in source
- AC6: Zero tombstone comments for deleted functions remain (except ruby.ts/php.ts which explain parser purpose without sprint refs)
- AC7: `engine/utils/confidence.ts:10` design doc reference removed
- AC8: Sprint references (`S13`-`S24`) either removed or rewritten to plain English — no bare sprint identifiers
- AC9: `STEP_`, `Lane 0`, `CP0-CP3` references either removed or rewritten — no implementation plan identifiers
- AC10: `Item N`, `D6.1` etc. references either removed or rewritten — no backlog/design doc identifiers
- AC11: 14 `any` types in test files replaced with proper types
- AC12: Zero JSDoc `@example` blocks reference `analyze()` — all updated to use `scanProject()` or removed
- AC16: Sprint references in test files either removed or rewritten — same standard as src/
- AC17: `s11-detection.test.ts` renamed to describe what it tests, not which sprint created it
- AC18: All existing tests pass
- AC19: Build succeeds, typecheck clean, lint clean (0 errors)

## Edge Cases & Risks

- **Rewrite judgment calls.** Some sprint references carry real design rationale (e.g., `Item 12` in skills.ts explains path protection semantics). The rule is: if there's a "why" worth preserving, rewrite to plain English. If there's only an identifier, remove. Build should read context around each reference before deciding.
- **ruby.ts/php.ts are exceptions.** These tombstones explain why the parser exists without a reader. Rewrite to remove `S19/INFRA-013` but keep the explanation.
- **`any` types are not mechanical.** `imports.test.ts` uses `any[]` for test data arrays requiring the conventions analyzer import type. `ai-sdk-detection.test.ts` uses `result as any` for partial `EngineResult` objects. Plan/Build should investigate proper types — `Partial<EngineResult>`, imported interface types, or test helper types.
- **Test file rename.** `s11-detection.test.ts` → new name. Any import or reference to the old filename must be updated. Grep for the filename before and after.
- **Design doc identifiers carry meaning.** `D6.1`, `D8.5`, `D12.3` etc. reference design decisions that shaped the code. The code IS the implementation now — the identifier adds nothing. But the concept it labels ("vault constants," "skill format validation") should be preserved in the comment if not already obvious from context.

## Rejected Approaches

- **Automated find-replace.** Most references need judgment — "is this noise or rationale?" A blanket `sed` would either remove valuable context or leave jargon behind. Manual review per reference is the correct approach.
- **Split into separate scopes per category.** The changes are independent per-file but share one disease ("internal artifacts in public code"). One scope, multi-phase build. Splitting into 3 scopes would create 3 pipeline runs for what's fundamentally one cleanup pass.
- **Defer `any` types.** Considered pulling AC11 into a separate scope since it changes compilation while everything else is comment-only. Kept it because the 14 occurrences are small, bounded, and the type investigation is straightforward. Plan can sequence it as the last phase if preferred.
- **JSDoc additions.** The V1_POLISH_REQUIREMENTS.md identified ~15 exported functions missing JSDoc. Deferred — JSDoc additions are open-ended and could balloon this scope. This scope removes lies; adding documentation is a separate concern.

## Open Questions

- Phase decomposition — Plan decides the right split. Recommended: (1) factual errors + tombstones + dead references, (2) sprint/plan/item ref rewrites in src/, (3) test files + rename + `any` types.

## Exploration Findings

### Patterns Discovered
- Sprint refs are not uniformly noise. ~35 of ~207 in src/ carry useful rationale behind the identifier. The rest are opaque jargon or dead references.
- Design doc identifiers (D6.1, D8.5, etc.) appear in 23 places, concentrated in constants.ts (5), check.ts (5), init/skills.ts (3), init/state.ts (2).
- The `analyze()` contamination spans 3 layers: scan-engine.ts header (misleading), JSDoc @examples (broken), and engine/index.ts tombstone (noise).

### Constraints Discovered
- [TYPE-VERIFIED] Zero behavioral change (all files) — every AC except AC11 and AC17 modifies only comments. No production logic changes.
- [OBSERVED] `analyze()` references (scan-engine.ts:12,605-613,677; index.ts:7; treeSitter.ts:15,1009; conventions/index.ts:44; patterns/index.ts:44) — 11 total references to a deleted function
- [OBSERVED] START_HERE.md references (8 files) and ATLAS3 reference (1 file) — all point to nonexistent documents
- [OBSERVED] Tombstone count: 10 locations across 7 files, all referencing deleted functions with sprint jargon
- [OBSERVED] Test sprint refs: 79 occurrences across 30 test files. Includes `s11-detection.test.ts` named after a sprint.

### Test Infrastructure
- Test file rename (`s11-detection.test.ts`) requires verifying no other test file imports from it. Checked: no imports — the file is self-contained.
- `any` type fixes in 4 test files: `analyzer-contract.test.ts` (1), `confirmation.test.ts` (3), `imports.test.ts` (4), `ai-sdk-detection.test.ts` (6). The `imports.test.ts` ones need the `ImportInfo` type from conventions. The `ai-sdk-detection.test.ts` ones need `Partial<EngineResult>`.

## For AnaPlan

### Structural Analog
`security-hardening` scope — touched ~30 files with mechanical migrations (execSync → runGit). Same shape: many files, each change is independent, systematic file-by-file approach. Different in that this scope has more judgment calls (rewrite vs. remove) while security was pure substitution.

### Relevant Code Paths
- `src/engine/scan-engine.ts` — the most important file has the worst header (lines 1-14, 605-613, 677)
- `src/engine/index.ts` — 11-line file, 4 lines are tombstone
- `src/engine/parsers/treeSitter.ts` — checkpoint list (lines 12-16), broken @example (line 1009)
- `src/engine/types/index.ts` — 23 sprint/item references, highest density file in src/
- `src/commands/check.ts` — 17 references (D12.3, SCAN-*, sprint refs)
- `src/engine/analyzers/patterns/confirmation.ts` — 15 references
- `src/engine/parsers/queries.ts` — 14 references
- `src/data/gotchas.ts` — 10 references (SCAN-* ticket identifiers in gotcha comments)
- `src/constants.ts` — 9 references (D6.1, D8.5, Item refs)
- `src/commands/init/skills.ts` — 10 references
- `tests/engine/types.test.ts` — 14 references, highest density test file

### Patterns to Follow
- `ruby.ts` and `php.ts` — these already show the correct pattern: explain why the code exists, drop the sprint identifier
- The security-hardening scope's systematic file-by-file approach with per-file validation

### Known Gotchas
- Don't delete the rationale behind sprint refs. `S19/SCAN-032` is jargon but "non-Node projects return null instead of defaulting to npm" is real design context. Read 2-3 lines of surrounding code before deciding remove vs. rewrite.
- `scan-engine.ts:605-613` should be removed, not rewritten. The paragraph describes a relationship to `analyze()` — there's nothing to rewrite it TO. AC2 says "removed."
- The `any` types need investigation, not substitution. `result as any` in ai-sdk-detection.test.ts passes a partial EngineResult — the proper fix is `Partial<EngineResult>` or a test factory, not just removing `as any`.

### Things to Investigate
- What should `s11-detection.test.ts` be renamed to? It tests TypeScript language override, Prisma provider parsing, and package manager inheritance. Suggest: `detection-improvements.test.ts` or `language-packagemanager.test.ts` — Plan should decide based on the test describe blocks.
