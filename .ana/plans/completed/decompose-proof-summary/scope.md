# Scope: Decompose proofSummary.ts

**Created by:** Ana
**Date:** 2026-05-24

## Intent

`proofSummary.ts` is 2409 lines with 21 exported functions and 5 consumers. Learn Session 5 flagged it as "the canary for when proofSummary.ts needs decomposition." It has grown through 15+ pipeline scopes, each adding functions. A stranger opening this file sees a wall of code with no clear boundary between report parsing, health computation, and proof generation.

The disease: three unrelated responsibilities live in one file because each new function was "just one more export." Parsing markdown reports (string in → data out), computing health metrics (proof chain → statistics), and generating proof summaries (read files → compose result) are distinct concerns with a clean dependency direction: core depends on parsing and computation, computation depends on parsing, parsing depends on nothing. No circular dependencies.

## Complexity Assessment

- **Kind:** chore
- **Size:** medium — 1 large file → 3 files, 1 test file → 3 test files, consumer imports updated
- **Surface:** cli
- **Files affected:**
  - `src/utils/proofSummary.ts` → split into 3 files
  - `src/utils/proof-parsers.ts` — new (parsing functions)
  - `src/utils/proof-health.ts` — new (computation functions)
  - `tests/utils/proofSummary.test.ts` → split into 3 test files
  - `tests/utils/proof-parsers.test.ts` — new
  - `tests/utils/proof-health.test.ts` — new
  - `src/commands/proof.ts` — import path updates
  - `src/commands/work.ts` — import path updates
  - `src/commands/doctor.ts` — import path updates
  - `src/commands/learn.ts` — import path updates
  - `src/commands/pr.ts` — import path updates
  - `src/types/proof.ts` — import path updates (if any type re-exports)
- **Blast radius:** Zero behavior change. Every function keeps its exact signature, name, and behavior. Only import paths change. The test suite is the mechanical proof — if all 4780 lines of tests pass with the new file structure, the decomposition is correct.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Split `proofSummary.ts` into three files along the natural responsibility boundaries. The dependency direction is acyclic: parsing is a leaf, computation imports from parsing, core imports from both. No new code is written — functions move unchanged between files.

**`src/utils/proof-parsers.ts`** (leaf module, ~400 lines):
- `parseComplianceTable`, `parseResult`, `parseACResults`, `parseDeviations` (private → stay private, move with `generateProofSummary`)

Actually, the private parsers are only called by `generateProofSummary`. They should stay with core. The exported parsers that are independently useful move:
- `parseBuildOpenIssues` — called by `generateProofSummary` (core)
- `parseFindings` — called by `generateProofSummary` (core) and proof.ts
- `parseRejectionCycles` — called by `computeTiming` (core) and proof.ts
- `extractFileRefs` — called by `resolveFindingPaths` (computation) and `computeStaleness` (computation)
- `extractScopeSummary` — called by `generateProofSummary` (core)
- `extractScopeKind` — called by `generateProofSummary` (core) and work.ts
- Types: `ProofAssertion`, `ProofDeviation` (used in `ProofSummary`)

**`src/utils/proof-health.ts`** (~600 lines):
- `computeHealthReport` — called by proof.ts, doctor.ts
- `computeFirstPassRate` — called by proof.ts
- `computeChainHealth` — called by proof.ts, work.ts
- `detectHealthChange` — called by work.ts
- `computeStaleness` — called by proof.ts (imports `extractFileRefs` from proof-parsers)
- `computeResolutionClaims` — called by proof.ts
- `resolveFindingPaths` — called by work.ts (imports `extractFileRefs` from proof-parsers)
- `findFindingById` — called by proof.ts
- Types: `ChainHealth`, `ResolutionClaim`, `ResolutionClaimsResult`
- Constants: `MIN_FINDINGS_HOT`, `MIN_ENTRIES_HOT`, `TRAJECTORY_WINDOW`, `MIN_ENTRIES_FOR_TREND`

**`src/utils/proofSummary.ts`** (core, ~800 lines, keeps the name for minimal consumer disruption):
- `generateProofSummary` — the main entry point
- `computeTiming` — private, only used by generateProofSummary
- `parseComplianceTable`, `parseResult`, `parseACResults`, `parseDeviations` — private, only used by generateProofSummary
- `getProofContext` — called by proof.ts, work.ts
- `generateDashboard` — called by proof.ts, work.ts
- `wrapJsonResponse`, `wrapJsonError` — called by proof.ts, work.ts, learn.ts
- `formatRelativeTime`, `truncateSummary` — called by proof.ts
- Types: `ProofSummary`, `JsonEnvelope`, `JsonErrorEnvelope`, `ProofContextResult`
- Re-exports from proof-parsers and proof-health for backward compatibility (consumers can update imports gradually, but re-exports mean nothing breaks immediately)

**Re-export strategy:** `proofSummary.ts` re-exports everything from `proof-parsers.ts` and `proof-health.ts`. This means existing consumer imports continue to work unchanged. Consumers CAN update to import directly from the specific module, but they don't HAVE to. The test split verifies the modules work independently. The consumer import updates are a follow-up cleanup, not a requirement for this scope.

## Acceptance Criteria

- AC1: `proof-parsers.ts` exists and exports: `parseBuildOpenIssues`, `parseFindings`, `parseRejectionCycles`, `extractFileRefs`, `extractScopeSummary`, `extractScopeKind`, `ProofAssertion`, `ProofDeviation`.
- AC2: `proof-health.ts` exists and exports: `computeHealthReport`, `computeFirstPassRate`, `computeChainHealth`, `detectHealthChange`, `computeStaleness`, `computeResolutionClaims`, `resolveFindingPaths`, `findFindingById`, `ChainHealth`, `ResolutionClaim`, `ResolutionClaimsResult`, `MIN_FINDINGS_HOT`, `MIN_ENTRIES_HOT`, `TRAJECTORY_WINDOW`, `MIN_ENTRIES_FOR_TREND`.
- AC3: `proofSummary.ts` re-exports all public symbols from `proof-parsers.ts` and `proof-health.ts` — no existing import statement in any consumer file breaks.
- AC4: All 4780 lines of existing tests pass without modification to test assertions (import paths may change but test logic does not).
- AC5: Tests are split into 3 files matching the source split. Each test file imports from its corresponding source module, not from `proofSummary.ts`.
- AC6: Zero behavior change — every function keeps its exact signature, return type, and behavior.
- AC7: No consumer file changes are required (re-exports handle backward compatibility).
- AC8: `pnpm run test -- --run` passes.

## Edge Cases & Risks

**Private functions that cross boundaries.** `parseComplianceTable`, `parseResult`, `parseACResults`, `parseDeviations` are private (not exported) and only called by `generateProofSummary`. They stay in `proofSummary.ts` with `generateProofSummary`. No private function needs to move across a module boundary.

**`computeTiming` calls `parseRejectionCycles`.** `computeTiming` is private to `proofSummary.ts` (called only by `generateProofSummary`). It imports `parseRejectionCycles` from `proof-parsers.ts`. This is a clean cross-module import — core imports from parsing, matching the dependency direction.

**Test file splitting.** The test file has `describe` blocks that map cleanly to functions. Each `describe('functionName', ...)` block moves to the test file matching the source file. The `vi.mock('glob')` at the top is only used by `resolveFindingPaths` tests — it moves to `proof-health.test.ts`. The `beforeEach`/`afterEach` with temp directories is only used by `generateProofSummary` tests — it stays in `proofSummary.test.ts`.

**Type exports.** Some types like `ProofSummary` are used by consumers that import from `proofSummary.ts`. The re-export strategy handles this — `proofSummary.ts` re-exports types from both child modules. If a consumer imports `type { ProofSummary } from '../utils/proofSummary.js'`, it continues to work.

## Rejected Approaches

**Moving all functions out and making proofSummary.ts a pure re-export barrel.** Over-decomposition. The core functions (`generateProofSummary`, `getProofContext`, `wrapJsonResponse`, `generateDashboard`) belong together — they compose results from the other modules. A barrel file with no logic of its own is indirection without value.

**Updating all consumer imports immediately.** Unnecessary churn. The re-export strategy means consumers continue to work. A follow-up scope can update imports to be more specific — but it's not required and shouldn't be bundled with the structural change.

**Splitting into more than 3 files.** The display functions (`generateDashboard`, `formatRelativeTime`, `truncateSummary`) could be a fourth module. But they're small (< 100 lines combined) and only used alongside the core functions. Three files is the right granularity.

## Open Questions

None. The dependency analysis is complete and the split boundaries are clean.

## Exploration Findings

### Patterns Discovered

- Dependency direction is acyclic: parsing → nothing, computation → parsing (via `extractFileRefs`), core → parsing + computation. Verified by tracing all internal function calls.
- Private functions are contained: 4 private parsers + `computeTiming` are only called by `generateProofSummary`. They stay in `proofSummary.ts`. No private function needs to cross a module boundary.
- Test `describe` blocks map 1:1 to functions — clean split.
- The `vi.mock('glob')` is only needed by `resolveFindingPaths` tests. The temp directory setup is only needed by `generateProofSummary` tests. No shared test infrastructure crosses the split boundary.

### Constraints Discovered

- [TYPE-VERIFIED] `ProofSummary` type is defined in proofSummary.ts and used by work.ts and pr.ts via `type { ProofSummary }` import. Must be re-exported from proofSummary.ts after moving to proof-parsers.ts (it's a parsing output type).
- [VERIFIED] 4780 test lines exist with comprehensive coverage. If tests pass after the split, the decomposition is correct.
- [VERIFIED] 5 consumer files import from proofSummary.ts. Re-exports ensure zero consumer changes required.

### Test Infrastructure

- `proofSummary.test.ts`: 4780 lines, 30 describe blocks. Each describe block tests one function — clean mapping to the 3-file split.

## For AnaPlan

### Structural Analog

Any module decomposition in the codebase. The closest is the `init/` directory — `state.ts`, `assets.ts`, `preflight.ts`, `skills.ts`, `commit.ts` were split from what was originally a single init file. Same pattern: move functions to named modules, re-export from the original for backward compatibility.

### Relevant Code Paths

- `src/utils/proofSummary.ts` — the file being split (all 2409 lines)
- `tests/utils/proofSummary.test.ts` — the test file being split (all 4780 lines)
- Consumer imports: proof.ts:27, work.ts:14, doctor.ts:3, learn.ts:2, pr.ts:1

### Patterns to Follow

- ESM imports with `.js` extensions
- `export function` for public API, plain `function` for private
- `export type` for type-only exports
- Re-export pattern: `export { functionName } from './proof-parsers.js';`

### Known Gotchas

- The `vi.mock('glob')` in the test file must be in the test file that tests `resolveFindingPaths`, not in a shared setup. Vitest module mocking is per-file.
- Some test `describe` blocks reference helper functions defined at the top of the test file (like `buildGanttBars`). These helpers stay in whichever test file uses them.
- The re-export must include both value exports AND type exports. Use `export type { TypeName } from './module.js'` for type-only re-exports.

### Things to Investigate

- Whether `ProofSummary` type should live in `proof-parsers.ts` (it's a parsing output) or in `src/types/proof.ts` (where other proof types live). Currently it's in `proofSummary.ts`. The cleanest location is `src/types/proof.ts` — but that's a type-location change, not a function-location change. Plan should decide.
