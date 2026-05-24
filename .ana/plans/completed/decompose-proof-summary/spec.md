# Spec: Decompose proofSummary.ts

**Created by:** AnaPlan
**Date:** 2026-05-23
**Scope:** .ana/plans/active/decompose-proof-summary/scope.md

## Approach

Split `proofSummary.ts` (2409 lines) into three files along responsibility boundaries. No new logic — functions move unchanged. Re-exports from `proofSummary.ts` ensure zero consumer breakage.

**Dependency direction (acyclic):**
- `proof-parsers.ts` → nothing (leaf)
- `proof-health.ts` → nothing (leaf — scope suggested it depends on proof-parsers via `extractFileRefs`, but verified this is false: `computeStaleness` and `resolveFindingPaths` do NOT call `extractFileRefs`)
- `proofSummary.ts` (core) → imports from both proof-parsers and proof-health

**Re-export strategy:** `proofSummary.ts` re-exports all public symbols from both new modules. Existing consumer imports continue unchanged. Consumers MAY update to import directly, but don't have to.

**Type location decision:** `ProofSummary` interface stays in `proofSummary.ts`. The scope raised moving it to `src/types/proof.ts`, but `ProofChainEntry` already depends on `ProofSummary` via `import type`. That's a separate type-hierarchy refactor, not part of this decomposition.

**Test split decision:** The `writeSaveMetadata history preservation` describe block (line 4024) imports from `artifact.ts`, not `proofSummary.ts`. It's misplaced but moving it is out of scope. Leave it in `proofSummary.test.ts`. Same for `computePipelineStats with median_plan` (line 3988) — it's a type-level test that belongs with health tests; move it to `proof-health.test.ts`.

## Output Mockups

No user-facing output changes. This is a structural refactor.

## File Changes

### `src/utils/proof-parsers.ts` (create)
**What changes:** New file containing all parsing/extraction functions — the leaf module.
**Pattern to follow:** Same style as existing `proofSummary.ts` — `export function` with JSDoc, explicit return types, `.js` extensions on imports.
**Why:** Parsing functions have zero dependencies on other proof modules. Isolating them makes the dependency graph explicit.

**Functions to move (cut-paste, no modifications):**
- `parseBuildOpenIssues` (line 283)
- `extractFileRefs` (line 333) — called only by `parseBuildOpenIssues` and `parseFindings` (both parsers)
- `extractScopeSummary` (line 420)
- `extractScopeKind` (line 441)
- `parseFindings` (line 1522)
- `parseRejectionCycles` (line 1604)

**Types to move:**
- `ProofAssertion` interface (line 17)
- `ProofDeviation` interface (line 27)

**Imports needed:** `import * as fs from 'node:fs';` (for `extractScopeSummary`, `extractScopeKind`)

**Private types/interfaces that stay in core:** `FindingWithFeature` (line 403) — only used by `generateDashboard` in core.

### `src/utils/proof-health.ts` (create)
**What changes:** New file containing all health computation functions.
**Pattern to follow:** Same style as existing `proofSummary.ts`.
**Why:** Health computation is a distinct concern from report parsing and proof generation.

**Functions to move (cut-paste, no modifications):**
- `computeHealthReport` (line 679) — the large health analysis function
- `computePipelineStats` (line 1006) — private, called only by `computeHealthReport`
- `floorMedian` (line 1047) — private, called only by `computePipelineStats`
- `computeFirstPassRate` (line 973)
- `detectHealthChange` (line 1060)
- `computeStaleness` (line 1153)
- `computeResolutionClaims` (line 1300)
- `findFindingById` (line 1371)
- `computeChainHealth` (line 1394)
- `resolveFindingPaths` (line 368)

**Types to move:**
- `ChainHealth` interface (line 610)
- `ResolutionClaim` interface (line 1261)
- `ResolutionClaimsResult` interface (line 1283)

**Constants to move:**
- `MIN_FINDINGS_HOT` (line 659)
- `MIN_ENTRIES_HOT` (line 661)
- `TRAJECTORY_WINDOW` (line 663)
- `MIN_ENTRIES_FOR_TREND` (line 665)
- `MIN_ENTRIES_FOR_EFFECTIVENESS` (line 667) — private, stays private

**Imports needed:** `import * as fs from 'node:fs';` and `import * as path from 'node:path';` (for `resolveFindingPaths`), `import { globSync } from 'glob';` (for `resolveFindingPaths`). Type imports from `../types/proof.js` for return types used by `computeHealthReport`, `computeStaleness`, etc.

### `src/utils/proofSummary.ts` (modify)
**What changes:** Remove moved functions/types/constants. Add imports from the two new modules. Add re-exports for backward compatibility. All remaining functions stay unchanged.
**Why:** Core orchestration functions remain here. Re-exports ensure zero consumer breakage.

**What stays:**
- `ProofSummary` interface
- `SaveEntry`, `PreCheckAssertion`, `PreCheckData`, `SavesData`, `ContractYaml` — private types
- `DashboardEntry`, `FindingWithFeature`, `ProofChainEntryForContext` — private types
- `parseComplianceTable`, `parseResult`, `parseACResults`, `parseDeviations` — private parsers used only by `generateProofSummary`
- `computeTiming` — private, used only by `generateProofSummary`
- `getAuthor` — private
- `fileMatches` — private
- `generateProofSummary` — main entry point
- `generateDashboard` — dashboard rendering
- `getProofContext` — proof context queries
- `wrapJsonResponse`, `wrapJsonError` — JSON envelope helpers
- `formatRelativeTime`, `truncateSummary` — display helpers
- `JsonEnvelope`, `JsonErrorEnvelope`, `ProofContextResult` — exported types

**New imports to add:**
```
import { parseRejectionCycles, parseFindings, parseBuildOpenIssues, extractFileRefs, extractScopeSummary, extractScopeKind } from './proof-parsers.js';
import type { ProofAssertion, ProofDeviation } from './proof-parsers.js';
import { computeChainHealth, resolveFindingPaths } from './proof-health.js';
import type { ChainHealth } from './proof-health.js';
```

Only import what core actually uses internally. `computeTiming` calls `parseRejectionCycles`. `generateProofSummary` calls `parseFindings`, `parseBuildOpenIssues`, `extractScopeSummary`, `extractScopeKind`, `parseRejectionCycles`, `resolveFindingPaths`. `generateDashboard` uses `FindingWithFeature` (stays private in core). `wrapJsonResponse` and `wrapJsonError` use `ChainHealth` and `computeChainHealth`.

**Re-exports to add:**
```
// Re-export from proof-parsers for backward compatibility
export { parseBuildOpenIssues, extractFileRefs, extractScopeSummary, extractScopeKind, parseFindings, parseRejectionCycles } from './proof-parsers.js';
export type { ProofAssertion, ProofDeviation } from './proof-parsers.js';

// Re-export from proof-health for backward compatibility
export { computeHealthReport, computeFirstPassRate, computeChainHealth, detectHealthChange, computeStaleness, computeResolutionClaims, resolveFindingPaths, findFindingById } from './proof-health.js';
export type { ChainHealth, ResolutionClaim, ResolutionClaimsResult } from './proof-health.js';
export { MIN_FINDINGS_HOT, MIN_ENTRIES_HOT, TRAJECTORY_WINDOW, MIN_ENTRIES_FOR_TREND } from './proof-health.js';
```

### `tests/utils/proof-parsers.test.ts` (create)
**What changes:** New test file for parser functions.
**Pattern to follow:** Same Vitest patterns as existing test file.

**Describe blocks to move:**
- `parseFindings` (line 650)
- `parseFindings backward compat` (line 2019)
- `parseRejectionCycles` (line 887)
- `extractFileRefs` (line 960)
- `parseBuildOpenIssues` (line 1063)
- `extractScopeSummary` (line 1609)
- `extractScopeKind` (line 1648)

**Test infrastructure:** `extractScopeSummary` and `extractScopeKind` tests use `beforeEach`/`afterEach` with temp directories — those move with the describe blocks. No shared test infrastructure crosses the boundary.

**Import statement:** Import from `../../src/utils/proof-parsers.js` (not from `proofSummary.js`).

### `tests/utils/proof-health.test.ts` (create)
**What changes:** New test file for health computation functions.
**Pattern to follow:** Same Vitest patterns as existing test file.

**Describe blocks to move:**
- `resolveFindingPaths` (line 1122) — includes nested `glob fallback` and `glob cache` describes
- `findFindingById` (line 2157)
- `computeChainHealth` (line 2261)
- `computeHealthReport` (line 2422) — includes nested `trajectory`, `hot modules`, `promotion candidates`, `promotion effectiveness`, `named constants` describes
- `detectHealthChange` (line 2893)
- `computeStaleness` (line 3018)
- `computeResolutionClaims` (line 3422)
- `computePipelineStats with median_plan` (line 3988) — type-level test, belongs here

**Test infrastructure:** `resolveFindingPaths` tests use `beforeEach`/`afterEach` with temp directories AND `vi.mock('glob')`. The glob mock must be in THIS file (Vitest module mocking is per-file). The `computeHealthReport` `named constants` tests import `MIN_FINDINGS_HOT`, `MIN_ENTRIES_HOT`, `TRAJECTORY_WINDOW`, `MIN_ENTRIES_FOR_TREND`.

**Import statement:** Import from `../../src/utils/proof-health.js`. Also import the `PipelineStats` type from `../../src/types/proof.js` for the `computePipelineStats` type test.

### `tests/utils/proofSummary.test.ts` (modify)
**What changes:** Remove moved describe blocks. Update import statement to only import what's still tested here.
**Why:** Remaining tests cover core functions that stay in `proofSummary.ts`.

**Describe blocks that stay:**
- `generateProofSummary` (line 102)
- `computeTiming with work_started_at` (line 569)
- `getProofContext` (line 1306)
- `getProofContext new fields` (line 2033)
- `generateDashboard` (line 1731)
- `generateProofSummary scope_summary` (line 1842)
- `generateProofSummary YAML reader` (line 1871)
- `truncateSummary` (line 3632)
- `computeTiming with build_started_at and verify_started_at` (line 3678)
- `computeTiming with plan_started_at` (line 3828)
- `writeSaveMetadata history preservation` (line 4024) — imports from artifact.ts, stays
- `computeTiming segment-based computation` (line 4113)

**What stays in the import:** `generateProofSummary`, `getProofContext`, `generateDashboard`, `truncateSummary` — imported from `../../src/utils/proofSummary.js`.

**`buildGanttBars` helper, `TestProofTiming`/`TestGanttBar` interfaces, `TEST_STAGES` constant (lines 36-100):** Stay in `proofSummary.test.ts` — only used by `computeTiming` tests.

**`vi.mock('glob')` at top of file:** Remove from this file. It moves to `proof-health.test.ts` (only `resolveFindingPaths` tests use it). The `import * as glob from 'glob'` also moves.

**`formatHumanReadable` import (line 35):** Check if any remaining test uses it. If not, remove.

### No consumer file changes required
`proof.ts`, `work.ts`, `doctor.ts`, `learn.ts`, `pr.ts`, `types/proof.ts` — all import from `proofSummary.js`. Re-exports ensure these continue to work unchanged.

## Acceptance Criteria

- [ ] AC1: `proof-parsers.ts` exists and exports: `parseBuildOpenIssues`, `parseFindings`, `parseRejectionCycles`, `extractFileRefs`, `extractScopeSummary`, `extractScopeKind`, `ProofAssertion`, `ProofDeviation`.
- [ ] AC2: `proof-health.ts` exists and exports: `computeHealthReport`, `computeFirstPassRate`, `computeChainHealth`, `detectHealthChange`, `computeStaleness`, `computeResolutionClaims`, `resolveFindingPaths`, `findFindingById`, `ChainHealth`, `ResolutionClaim`, `ResolutionClaimsResult`, `MIN_FINDINGS_HOT`, `MIN_ENTRIES_HOT`, `TRAJECTORY_WINDOW`, `MIN_ENTRIES_FOR_TREND`.
- [ ] AC3: `proofSummary.ts` re-exports all public symbols from `proof-parsers.ts` and `proof-health.ts` — no existing import statement in any consumer file breaks.
- [ ] AC4: All existing tests pass without modification to test assertions (import paths may change but test logic does not).
- [ ] AC5: Tests are split into 3 files matching the source split. Each test file imports from its corresponding source module, not from `proofSummary.ts`.
- [ ] AC6: Zero behavior change — every function keeps its exact signature, return type, and behavior.
- [ ] AC7: No consumer file changes are required (re-exports handle backward compatibility).
- [ ] AC8: `pnpm run test -- --run` passes — 2906 tests, 122 test files.
- [ ] AC9: No build errors — `pnpm run build` succeeds.
- [ ] AC10: No lint errors — `pnpm run lint` succeeds.

## Testing Strategy

- **Unit tests:** Each new test file imports exclusively from its corresponding source module. Test logic is identical — only import paths change.
- **Integration tests:** The existing `generateProofSummary` tests serve as integration tests — they exercise the core function which calls into both parsers and health modules.
- **Edge cases:** No new edge cases — this is a structural refactor. The existing test suite (2906 tests) is the mechanical proof.
- **Regression focus:** `generateProofSummary` tests are the primary regression signal. If the cross-module imports are wired wrong, these tests fail.

## Dependencies

None. No new packages, no schema changes, no infrastructure.

## Constraints

- Zero behavior change. Every function keeps its exact signature, name, return type.
- No consumer file modifications. Re-exports handle backward compatibility.
- Test assertions must not change. Only import paths may change.
- The `vi.mock('glob')` call must appear in the test file that uses it (`proof-health.test.ts`), not in a shared setup. Vitest module mocking is per-file.

## Gotchas

- **`computeTiming` calls `parseRejectionCycles`.** `computeTiming` is private in `proofSummary.ts`. After the split, it needs `parseRejectionCycles` from `proof-parsers.ts`. This is handled by the import `proofSummary.ts` adds from `proof-parsers.js`. The re-export of `parseRejectionCycles` also covers it for the value import, but core needs a direct import since it calls the function internally.
- **`generateProofSummary` calls 6 parser functions.** After the split, `proofSummary.ts` must import these directly from `proof-parsers.js` for internal use — the re-export alone doesn't provide the binding for internal calls.
- **Dual import pattern.** `proofSummary.ts` needs both `import { ... } from './proof-parsers.js'` (for internal use by its own functions) AND `export { ... } from './proof-parsers.js'` (for re-export to consumers). These are two separate statements — TypeScript's `export { ... } from '...'` does not create a local binding.
- **`resolveFindingPaths` needs `glob`.** The `import { globSync } from 'glob'` moves to `proof-health.ts`. Remove it from `proofSummary.ts` after the move (unless another remaining function uses it — verify first).
- **`yaml` import stays in core.** Only `generateProofSummary` uses `import * as yaml from 'yaml'`.
- **`runGit` import stays in core.** Only `getAuthor` (private) uses it.
- **Type imports from `../types/proof.js` in proof-health.** Several health functions use `import('../types/proof.js').StalenessResult` inline syntax. When moving, convert to top-level `import type` statements for consistency.
- **The `computeFirstPassRate` function is not directly tested in proofSummary.test.ts.** There's no describe block for it. It's tested indirectly through `computeHealthReport`. This is fine — it moves to `proof-health.ts` alongside `computeHealthReport` and continues to be covered.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { foo } from './proof-parsers.js'`
- Use `import type` for type-only imports, separate from value imports
- Prefer named exports, no default exports
- Exported functions require `@param` and `@returns` JSDoc tags
- Explicit return types on all exported functions
- Use `node:` prefix for built-ins: `import * as fs from 'node:fs'`
- Always use `--run` with pnpm test to avoid watch mode hang

### Pattern Extracts

**Re-export pattern from init/index.ts (structural analog):**
```typescript
// packages/cli/src/commands/init/index.ts — lines show how init re-exports from submodules
export { commitInfrastructure } from './commit.js';
export type { InitResult } from './types.js';
```

**Export style from proofSummary.ts (lines 283-285):**
```typescript
export function parseBuildOpenIssues(content: string): Array<{ summary: string; file: string | null }> {
  const results: Array<{ summary: string; file: string | null }> = [];
```

**Test file import pattern from proofSummary.test.ts (lines 11-34):**
```typescript
import {
  generateProofSummary,
  parseFindings,
  parseRejectionCycles,
  extractFileRefs,
  parseBuildOpenIssues,
  resolveFindingPaths,
  // ... etc
} from '../../src/utils/proofSummary.js';
```

### Proof Context
- `proofSummary.ts ~2330 lines — past comfort threshold, growing` (audit-matrix-orientation-C7) — this decomposition directly addresses this finding.
- `formatRelativeTime doesn't handle invalid input` (audit-matrix-orientation-C1) — stays in core, not part of this split. No action needed.

### Checkpoint Commands
- After creating `proof-parsers.ts` and `proof-health.ts`: `(cd 'packages/cli' && pnpm vitest run)` — Expected: compilation succeeds (tests may fail until re-exports wired)
- After wiring re-exports in `proofSummary.ts`: `(cd 'packages/cli' && pnpm vitest run)` — Expected: all 2906 tests pass
- After splitting test files: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 2906 tests pass across 124 test files (122 + 2 new)
- Final: `pnpm run test -- --run` — Expected: 2906 tests pass
- Lint: `pnpm run lint` — Expected: clean
- Build: `pnpm run build` — Expected: clean

### Build Baseline
- Current tests: 2906 passed, 2 skipped (2908 total)
- Current test files: 122
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: 2906 tests in 124 test files (122 existing + 2 new)
- Regression focus: `proofSummary.test.ts` — if cross-module imports are wrong, `generateProofSummary` tests fail first
