# Spec: Extract Artifact Validators

**Created by:** AnaPlan
**Date:** 2026-05-25
**Scope:** .ana/plans/active/extract-artifact-validators/scope.md

## Approach

Move 8 validator functions and their supporting declarations from `artifact.ts` (~610 lines) to a new sibling module `artifact-validators.ts`. Follow the same decomposition pattern used in `src/utils/proofSummary.ts` — re-export public symbols from the original module for backward compatibility.

**What moves:**
- 8 functions: `validatePlanFormat`, `validateVerifyReportFormat`, `validateScopeFormat`, `validateSpecFormat`, `validateContractFormat`, `validateVerifyDataFormat`, `validateBuildDataFormat`, `validateBuildReportFormat`
- Constants: `VALID_MATCHERS`, `VALUE_REQUIRED_MATCHERS`, `VALID_FINDING_CATEGORIES`, `VALID_FINDING_SEVERITIES`, `VALID_FINDING_ACTIONS`
- Interfaces: `VerifyDataSchema`, `BuildDataSchema`

**What stays in artifact.ts:**
- All save logic, git operations, companion handling, commit hygiene
- `parseArtifactType`, `ArtifactTypeInfo`, `SaveMetadata`, and all other non-validator code
- `SECRET_PATTERNS` import (not used by any validator)

**Re-export strategy (matching proofSummary.ts pattern):**
- artifact.ts re-exports 3 public validators: `validateScopeFormat`, `validateVerifyDataFormat`, `validateBuildDataFormat`
- artifact.ts imports all 8 validators from `./artifact-validators.js` for internal use
- The 5 private validators are exported from artifact-validators.ts but NOT re-exported from artifact.ts

**Cleanup during extraction:**
- Remove duplicate JSDoc on `validateScopeFormat` (lines 554-559 are stale; only the block at 560-565 moves)
- Remove dead `import type { ContractSchema } from '../types/contract.js'` from artifact.ts after extraction

## Output Mockups

No user-visible output changes. This is a pure refactor — zero behavior change.

## File Changes

### `packages/cli/src/commands/artifact-validators.ts` (create)

**What changes:** New module containing all 8 validator functions, their supporting constants, and interfaces.
**Pattern to follow:** `src/utils/proofSummary.ts` structure — imports at top, exported functions, no CLI dependencies (no chalk, no commander).
**Why:** Reduces artifact.ts from 2093 to ~1500 lines. Validators are pure functions with no dependency on artifact.ts internals — they belong in their own module.

### `packages/cli/src/commands/artifact.ts` (modify)

**What changes:** Remove ~610 lines of validators + constants + interfaces. Add import of all 8 validators from `./artifact-validators.js`. Add re-exports of 3 public validators. Remove dead `ContractSchema` type import.
**Pattern to follow:** Same import + re-export block structure as `src/utils/proofSummary.ts` lines 11-23.
**Why:** Without the re-exports, downstream consumers (`artifact.test.ts`, `scope-surface-validation.test.ts`) would break.

## Acceptance Criteria

- [ ] AC1: `artifact-validators.ts` exists with all 8 validator functions exported
- [ ] AC2: `artifact.ts` imports validators from `./artifact-validators.js` and calls them unchanged
- [ ] AC3: `artifact.ts` re-exports `validateScopeFormat`, `validateVerifyDataFormat`, `validateBuildDataFormat` for backward compatibility
- [ ] AC4: `artifact.ts` is ~1500 lines (reduced by ~595 lines)
- [ ] AC5: All existing tests pass without modification to test assertions
- [ ] AC6: Zero behavior change — every validator keeps its exact signature and return type
- [ ] AC7: `pnpm run test -- --run` passes
- [ ] AC8: Build and lint pass

## Testing Strategy

- **Unit tests:** All existing validator tests continue to pass via re-exports. No new tests needed — this is a pure extraction with zero behavior change.
- **Integration tests:** `saveArtifact` and `saveAllArtifacts` tests exercise validators through the save flow — they confirm the import wiring is correct.
- **Edge cases:** None introduced. The extraction is mechanical.

## Dependencies

None. All referenced modules already exist.

## Constraints

- ESM `.js` extension on all imports (runtime crash without it)
- `import type` for type-only imports (separate from value imports)
- Named exports only (no default exports)
- Explicit return types on all exported functions

## Gotchas

- `validateScopeFormat` needs `findProjectRoot` imported from `../utils/validators.js`. The relative path is identical from both artifact.ts and artifact-validators.ts since they're in the same directory (`src/commands/`).
- `validateContractFormat` returns `string[]` (not `string | null` like most validators). Import usage in artifact.ts already handles this correctly — don't unify signatures.
- `validateSpecFormat` returns `{ error?: string; warning?: string }` — also different from the `string | null` pattern.
- The `ContractSchema` type import in artifact.ts becomes dead after extraction. Lint will fail if not removed. Note: `ContractSchema` is imported from `'../types/contract.js'` — this import moves to artifact-validators.ts.
- `yaml` is used by both modules — artifact.ts uses it for non-validator code too, so the import stays in both files.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins
- Use `import type` for type-only imports, separate from value imports
- Prefer named exports — no default exports
- Explicit return types on all exported functions
- Exported functions require `@param` and `@returns` JSDoc tags

### Pattern Extracts

From `src/utils/proofSummary.ts` lines 11-23 — the re-export pattern to follow:

```typescript
import { parseRejectionCycles, parseFindings, parseBuildOpenIssues, extractScopeSummary, extractScopeKind } from './proof-parsers.js';
import type { ProofAssertion, ProofDeviation } from './proof-parsers.js';
import { computeChainHealth } from './proof-health.js';
import type { ChainHealth } from './proof-health.js';

// Re-export from proof-parsers for backward compatibility
export { parseBuildOpenIssues, extractFileRefs, extractScopeSummary, extractScopeKind, parseFindings, parseRejectionCycles } from './proof-parsers.js';
export type { ProofAssertion, ProofDeviation } from './proof-parsers.js';

// Re-export from proof-health for backward compatibility
export { computeHealthReport, computeFirstPassRate, computeChainHealth, detectHealthChange, computeStaleness, computeResolutionClaims, resolveFindingPaths, findFindingById } from './proof-health.js';
export type { ChainHealth, ResolutionClaim, ResolutionClaimsResult } from './proof-health.js';
```

### Proof Context

- `fix-false-rejection-archive-C3`: `.saves.json` read perf concern — irrelevant to validators, no action needed.
- Build concerns about `archivePreviousVersion`, commit hygiene exports, history growth — all relate to save logic that stays in artifact.ts, not validators.

No active proof findings for the validator functions being extracted.

### Checkpoint Commands

- After creating `artifact-validators.ts` and modifying `artifact.ts`: `(cd 'packages/cli' && pnpm vitest run)` — Expected: 2921 pass, 2 skipped
- After all changes: `pnpm run test -- --run` — Expected: all workspace tests pass
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 2921 passed, 2 skipped (2923 total)
- Current test files: 124 passed
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: same 2921 passed, 2 skipped — no new tests (pure refactor)
- Regression focus: `tests/commands/artifact.test.ts`, `tests/commands/scope-surface-validation.test.ts`
