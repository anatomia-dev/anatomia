# Scope: Extract Artifact Validators

**Created by:** Ana
**Date:** 2026-05-24

## Intent

`artifact.ts` is 2093 lines — the third-largest source file. 610 of those lines are 8 format validators (`validatePlanFormat`, `validateScopeFormat`, `validateContractFormat`, etc.) that are pure functions: file path in, error string (or null) out. They have no dependency on any other artifact.ts function, no shared state, and a clean dependency set (fs, path, yaml, findProjectRoot). They're called from exactly two places: `saveArtifact` and `saveAllArtifacts`.

Extracting them to a sibling module follows the same pattern as the proofSummary decomposition — move pure functions to a named module, re-export from the original for backward compatibility.

## Complexity Assessment

- **Kind:** chore
- **Size:** small — move 8 functions from artifact.ts to a new artifact-validators.ts, add re-exports, update test imports
- **Surface:** cli
- **Files affected:**
  - `src/commands/artifact.ts` — remove 8 validators (~610 lines), add imports + re-exports
  - `src/commands/artifact-validators.ts` — new file with the 8 validators
  - `tests/commands/artifact.test.ts` — update import to include new module (or use re-exports)
  - `tests/commands/scope-surface-validation.test.ts` — update import (or use re-exports)
- **Blast radius:** Zero behavior change. All functions keep exact signatures. Re-exports maintain backward compatibility. Tests can import from either path.
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Move 8 validator functions from artifact.ts to a new `artifact-validators.ts` in the same directory. artifact.ts re-exports all public validators for backward compatibility. Test imports can update to the new module or continue using the re-exports.

**Functions to move (all pure, no cross-dependencies):**

| Function | Lines | Exported | Dependencies |
|----------|-------|----------|-------------|
| `validatePlanFormat` | 37 | private | fs |
| `validateVerifyReportFormat` | 27 | private | fs |
| `validateScopeFormat` | 134 | EXPORT | fs, path, findProjectRoot |
| `validateSpecFormat` | 41 | private | fs |
| `validateContractFormat` | 140 | private | fs, yaml |
| `validateVerifyDataFormat` | 127 | EXPORT | fs, path, yaml |
| `validateBuildDataFormat` | 64 | EXPORT | fs, yaml |
| `validateBuildReportFormat` | 40 | private | fs |

**Dependency analysis:**
- No validator calls another validator.
- No validator calls any other artifact.ts function.
- No validator has side effects (no writes, no git, no console output).
- Only external dependency beyond Node built-ins: `findProjectRoot` from `../utils/validators.js` (used by `validateScopeFormat` only) and `yaml` (used by 3 validators for YAML parsing).
- `SECRET_PATTERNS` from the engine is NOT used by any validator.

**Currently private validators that need to become exported:** `validatePlanFormat`, `validateVerifyReportFormat`, `validateSpecFormat`, `validateContractFormat`, `validateBuildReportFormat` are currently private (called only by `saveArtifact` and `saveAllArtifacts`). After extraction, they must be exported from `artifact-validators.ts` so artifact.ts can import them. They do NOT need to be re-exported from artifact.ts — only the 3 already-public validators need re-exports.

**Re-export strategy:** artifact.ts re-exports the 3 public validators (`validateScopeFormat`, `validateVerifyDataFormat`, `validateBuildDataFormat`) for backward compatibility. The 5 private validators are exported from artifact-validators.ts but NOT re-exported from artifact.ts — they're internal to the package, consumed only by saveArtifact/saveAllArtifacts via direct import.

## Acceptance Criteria

- AC1: `artifact-validators.ts` exists with all 8 validator functions exported.
- AC2: `artifact.ts` imports validators from `./artifact-validators.js` and calls them unchanged.
- AC3: `artifact.ts` re-exports `validateScopeFormat`, `validateVerifyDataFormat`, `validateBuildDataFormat` for backward compatibility.
- AC4: `artifact.ts` is ~1480 lines (was 2093 — reduced by ~610).
- AC5: All existing tests pass without modification to test assertions.
- AC6: Zero behavior change — every validator keeps its exact signature and return type.
- AC7: `pnpm run test -- --run` passes.
- AC8: Build and lint pass.

## Edge Cases & Risks

**`validateScopeFormat` calls `findProjectRoot`.** This import moves to artifact-validators.ts. It's already imported in artifact.ts from `../utils/validators.js`. The new module needs the same import. Since artifact-validators.ts is in the same directory as artifact.ts (`src/commands/`), the relative path is identical.

**Private-to-exported promotion.** 5 validators go from private to exported. This has no runtime impact — they were already module-scoped functions, not truly private (no class, no closure). The `export` keyword is the only change to these 5 function declarations.

**Test imports.** `artifact.test.ts` imports `validateVerifyDataFormat` and `validateBuildDataFormat` from artifact.js. `scope-surface-validation.test.ts` imports `validateScopeFormat` from artifact.js. Both continue to work via re-exports. Tests MAY update imports to the new module but don't have to.

**`parseArtifactType` stays in artifact.ts.** It's a parser for the CLI argument (type string → structured info), not a format validator. It's called by `saveArtifact` and `saveAllArtifacts` as part of the command flow, not validation. Different responsibility — it stays.

**`ArtifactTypeInfo` type.** Used by `parseArtifactType` which stays in artifact.ts. No validator uses it. No movement needed.

## Rejected Approaches

**Also extracting `parseArtifactType`.** It's not a format validator — it parses CLI arguments. Different responsibility. Including it would muddy the module boundary.

**Also extracting helper functions (`moveFileCrossFs`, `deriveCompanionFileName`, etc.).** These are save-operation helpers, not validators. They belong with `saveArtifact`.

**Making validators a class.** They're pure functions with no shared state. A class adds ceremony without value.

## Open Questions

None. The dependency analysis is complete and boundaries are clean.

## Exploration Findings

### Patterns Discovered

- All 8 validators follow the same pattern: read file, check structure, return error string or null. Pure functions with no side effects.
- No validator calls another validator — completely independent.
- 3 validators use yaml.parse for YAML content (contract, verify-data, build-data). The yaml import moves to the new module.
- Only `validateScopeFormat` uses `findProjectRoot` (to read ana.json for surface validation). This is the only cross-module dependency.

### Constraints Discovered

- [VERIFIED] No validator calls any other artifact.ts function. Zero internal cross-dependencies.
- [VERIFIED] 3 validators are currently exported and consumed by 2 test files. Re-exports handle backward compatibility.
- [VERIFIED] 5 validators are private. After extraction they become exported from artifact-validators.ts but NOT re-exported from artifact.ts.
- [VERIFIED] Validators are called from exactly 2 functions: `saveArtifact` (lines 1396-1490) and `saveAllArtifacts` (lines 1796-1869).

### Test Infrastructure

- artifact.test.ts: 4349 lines, 30 describe blocks. Validator tests (6 describe blocks) could optionally move to a new test file but don't have to — they work via re-exports.

## For AnaPlan

### Structural Analog

The `decompose-proof-summary` scope — identical pattern. Move pure functions to a sibling module, re-export from the original.

### Relevant Code Paths

- `src/commands/artifact.ts` lines 502-1112 — the 8 validators
- `src/commands/artifact.ts` lines 1396-1490, 1796-1869 — where validators are called
- `tests/commands/artifact.test.ts` line 7 — import statement
- `tests/commands/scope-surface-validation.test.ts` line 9 — import statement

### Patterns to Follow

- Same re-export pattern as proofSummary.ts: `export { fn } from './artifact-validators.js'`
- Same `import type` for type-only imports
- Same ESM `.js` extension convention

### Known Gotchas

- `validateScopeFormat` needs `findProjectRoot` imported from `../utils/validators.js`. The relative path is the same from both artifact.ts and artifact-validators.ts since they're in the same directory.
- `validateContractFormat` returns `string[]` (array of errors), not `string | null` like the others. The function signature is different — make sure the import handles this correctly.
- `validateSpecFormat` returns `{ error?: string; warning?: string }`, also different from the `string | null` pattern. Same caution.

### Things to Investigate

- Whether to split the test file too (move validator test describes to `artifact-validators.test.ts`). The proofSummary scope split tests alongside source. This scope could do the same. Plan should decide based on test file size — at 4349 lines, artifact.test.ts is large enough to benefit from a split.
