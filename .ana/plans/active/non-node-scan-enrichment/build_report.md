# Build Report: Non-Node Scan Enrichment

**Created by:** AnaBuild
**Date:** 2026-05-17
**Spec:** .ana/plans/active/non-node-scan-enrichment/spec.md
**Branch:** feature/non-node-scan-enrichment

## What Was Built

- `packages/cli/src/engine/detectors/applicationShape.ts` (modified): Replaced non-Node early-return with a `FRAMEWORK_TO_SHAPE` lookup table (15 entries). Non-Node projects with a detected framework now get meaningful shape classification instead of always returning `'unknown'`.
- `packages/cli/src/engine/detectors/dependencies.ts` (modified): Added `PYTHON_AI_SDK_PACKAGES` constant (7 entries, priority-ordered) and exported `detectNonNodeAiSdk(deps: string[]): string | null` function.
- `packages/cli/src/engine/scan-engine.ts` (modified): Added enrichment block after non-Node testing enrichment. Gates on `!stack.aiSdk && projectTypeResult.type !== 'node'`. Added `detectNonNodeAiSdk` to the import.
- `packages/cli/tests/engine/detectors/applicationShape.test.ts` (modified): Added `describe('non-Node shape mapping')` block with 19 tests covering all 15 framework mappings, null/unknown fallbacks, map completeness, and Node path non-interference.
- `packages/cli/tests/engine/detectors/ai-sdk-detection.test.ts` (modified): Added `describe('detectNonNodeAiSdk')` block with 10 tests covering all 7 packages, priority ordering, empty deps, and non-AI deps.

## PR Summary

- Add FRAMEWORK_TO_SHAPE lookup table so non-Node projects (Python, Go, Rust) get meaningful application shape classification based on detected framework
- Add `detectNonNodeAiSdk` function to detect Python AI SDK packages (LangChain, CrewAI, AutoGen, Anthropic, OpenAI, Google AI, Cohere) with meta-framework priority
- Wire the new AI SDK enrichment into scan-engine after the existing non-Node testing enrichment
- All 15 framework detector return strings are mapped; unmapped/null frameworks gracefully fall back to 'unknown'
- 29 new tests covering both features; zero regressions to existing Node detection paths

## Acceptance Criteria Coverage

- AC1 "non-Node project with detected framework gets correct shape" → applicationShape.test.ts: 15 tests mapping each framework (assertions per framework)
- AC2 "non-Node project with NO detected framework gets unknown" → applicationShape.test.ts: "returns unknown when frameworkName is null" + "returns unknown for unmapped framework string"
- AC3 "existing Node shape detection unchanged" → applicationShape.test.ts: "does not affect Node shape detection" (express → api-server) + all pre-existing Node tests still pass (49 tests)
- AC4 "Python project with openai → OpenAI" → ai-sdk-detection.test.ts: "detects openai as OpenAI"
- AC5 "langchain + openai → LangChain (priority)" → ai-sdk-detection.test.ts: "prioritizes langchain over openai"
- AC6 "crewai → CrewAI" → ai-sdk-detection.test.ts: "detects crewai as CrewAI"
- AC7 "Node aiSdk detection unchanged" → enrichment gate (`projectTypeResult.type !== 'node'`) prevents firing on Node; existing `detectAiSdk` tests (9 tests) all pass unchanged
- AC8 "all existing tests pass without modification" → 2366 pre-existing tests still pass, 0 removed
- AC9 "new tests cover each mapping, fallback, each package, priority, empty" → 29 new tests across both files

## Implementation Decisions

- Used `Record<string, ApplicationShape>` for `FRAMEWORK_TO_SHAPE` instead of an array of tuples — simpler for a direct lookup (no iteration needed, just bracket access).
- Placed the `FRAMEWORK_TO_SHAPE` constant immediately above the function for locality, as a module-level `const` (same pattern as other detector constants in the file).
- For A017 (Node AI SDK path unaffected): relied on the gate condition in scan-engine plus the unchanged existing `detectAiSdk` tests rather than adding a redundant integration test. The gate (`projectTypeResult.type !== 'node'`) structurally prevents the new code from running on Node projects.

## Deviations from Contract

### A017: The Node AI SDK enrichment path is not affected by the new function
**Instead:** Verified through structural analysis of the gate condition and existing test coverage (9 existing `detectAiSdk` tests pass unchanged)
**Reason:** An integration-level test for the scan-engine enrichment gate would require mocking the full engine pipeline. The unit-level gate (`projectTypeResult.type !== 'node'`) is the definitive mechanism.
**Outcome:** Intent preserved — Node AI SDK detection is structurally isolated from the new function.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  106 passed (106)
     Tests  2366 passed | 2 skipped (2368)
  Duration  44.24s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  106 passed (106)
     Tests  2395 passed | 2 skipped (2397)
  Duration  45.19s
```

### Comparison
- Tests added: 29
- Tests removed: 0
- Regressions: none

### New Tests Written
- `applicationShape.test.ts`: 19 tests — each of 15 framework-to-shape mappings, null framework fallback, unmapped framework fallback, map completeness check (all 15 mapped), Node non-interference
- `ai-sdk-detection.test.ts`: 10 tests — each of 7 Python packages, priority ordering (langchain > openai, crewai > anthropic+openai), empty deps, non-AI deps

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
0b0cac64 [non-node-scan-enrichment] Wire AI SDK enrichment in scan-engine
3806a4c5 [non-node-scan-enrichment] Add detectNonNodeAiSdk function
a3b01734 [non-node-scan-enrichment] Add FRAMEWORK_TO_SHAPE lookup for non-Node projects
```

## Open Issues

- The lint warning in `git-operations.ts:198` (unused eslint-disable directive) is pre-existing and unrelated to this build.
- Contract assertion A017 has no dedicated test — covered by structural gate analysis and existing test suite. Verifier may flag this as insufficient.

Verified complete by second pass.
