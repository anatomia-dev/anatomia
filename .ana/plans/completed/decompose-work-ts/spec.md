# Spec: Decompose work.ts

**Created by:** AnaPlan
**Date:** 2026-05-25
**Scope:** .ana/plans/active/decompose-work-ts/scope.md

## Approach

Split `work.ts` (2545 lines) into 3 files along responsibility boundaries. No new logic — functions and types move unchanged. Re-export `deriveSurface` from `work.ts` for backward compatibility. Follows the identical pattern from the `decompose-proof-summary` work (see `src/utils/proof-parsers.ts` and `src/utils/proof-health.ts` for the structural analog).

**Dependency direction (acyclic):**
- `work-state.ts` → nothing from work (leaf — imports only from `../utils/`)
- `work-proof.ts` → `work-state.ts` (for `countPhases`)
- `work.ts` → imports from both `work-state.ts` and `work-proof.ts`

**Re-export strategy:** Only `deriveSurface` needs re-export. It's the only moving function that was exported from work.ts and imported externally (via dynamic import in `work.test.ts` line 5793). State functions were never exported from work.ts. `guardFailResult` and `writeProofChain` were never exported.

**`CONCURRENCY_TIMEOUT_MS` location:** Moves to `work-state.ts` and is exported. Used by `isTimestampRecent` (moves to work-state.ts) and `checkConcurrencyGuard` (stays in work.ts). work.ts imports it from work-state.ts. Single source of truth, clean dependency direction.

**`countPhases` and `getVerifyResult` imports:** Both move to work-state.ts. Both are also called from `completeWork` (stays in work.ts). work.ts imports them from work-state.ts. `countPhases` is additionally called from `writeProofChain` (work-proof.ts), so work-proof.ts also imports it from work-state.ts. Neither function is re-exported from work.ts — no external consumer exists.

## Output Mockups

No user-facing output changes. This is a structural refactor. The output of `ana work status` is byte-for-byte identical before and after.

## File Changes

### `src/commands/work-state.ts` (create)
**What changes:** New file containing 10 pipeline state computation functions + 5 types + 1 constant. All cut-paste from work.ts — no logic modifications.
**Pattern to follow:** Same module style as existing `src/utils/proof-parsers.ts` — `export function` with JSDoc, explicit return types, `.js` extensions on imports, `import type` for type-only imports.
**Why:** State computation is a distinct concern from command orchestration and display. Isolating it makes the dependency graph explicit and reduces work.ts by ~508 lines.

**Types to move (in order):**
- `ArtifactState` (interface, line 34)
- `ArtifactInfo` (interface, line 45)
- `SpecInfo` (interface, line 53)
- `ReportInfo` (interface, line 62)
- `VerifyReportInfo` (interface, line 71)

**Constant to move:**
- `CONCURRENCY_TIMEOUT_MS` (line 2371) — export it

**Functions to move (in order, cut-paste unchanged):**
- `fileExistsOnBranch` (line 115)
- `readFileOnBranch` (line 127)
- `getWorkBranch` (line 139)
- `countPhases` (line 160)
- `getVerifyResult` (line 190)
- `discoverSlugs` (line 204)
- `gatherArtifactState` (line 241)
- `isTimestampRecent` (line 368)
- `determineStage` (line 392)
- `getNextAction` (line 550)

**Imports needed in work-state.ts:**
- `import * as fs from 'node:fs';`
- `import * as path from 'node:path';`
- `import { runGit } from '../utils/git-operations.js';`
- `import { worktreeExists, getWorktreePath } from '../utils/worktree.js';`

All functions become `export function`. All types become `export interface`.

### `src/commands/work-proof.ts` (create)
**What changes:** New file containing 3 proof chain functions. All cut-paste from work.ts.
**Pattern to follow:** Same module style as `src/utils/proof-health.ts`.
**Why:** Proof chain writing is a distinct concern from pipeline state computation and command orchestration.

**Functions to move (in order, cut-paste unchanged):**
- `guardFailResult` (line 897)
- `deriveSurface` (line 919) — keep `export`
- `writeProofChain` (line 952)

**Imports needed in work-proof.ts:**
- `import * as fs from 'node:fs';`
- `import * as fsPromises from 'node:fs/promises';`
- `import * as path from 'node:path';`
- `import chalk from 'chalk';`
- `import { globSync } from 'glob';`
- `import { runGit } from '../utils/git-operations.js';`
- `import { findProjectRoot } from '../utils/validators.js';`
- `import { resolveFindingPaths, generateDashboard, computeChainHealth } from '../utils/proofSummary.js';`
- `import type { ProofSummary } from '../utils/proofSummary.js';`
- `import type { ProofChainEntry, ProofChain, ProofChainStats } from '../types/proof.js';`
- `import { countPhases } from './work-state.js';`

Note: `guardFailResult` is NOT exported — it's only called from `writeProofChain` (same file) and `completeWork` (work.ts). For work.ts to call it, it must be exported from work-proof.ts. So: export `guardFailResult` from work-proof.ts but do NOT re-export from work.ts.

### `src/commands/work.ts` (modify)
**What changes:** Remove ~828 lines (10 state functions + 5 types + 3 proof functions + 1 constant). Add imports from work-state.ts and work-proof.ts. Add 1 re-export line.
**Pattern to follow:** Same re-export pattern as `proofSummary.ts` re-exports from `proof-parsers.ts`.
**Why:** After extraction, work.ts keeps only what it should: command orchestration, display, concurrency, and registration.

**New imports to add:**
- `import { fileExistsOnBranch, readFileOnBranch, getWorkBranch, countPhases, getVerifyResult, discoverSlugs, gatherArtifactState, isTimestampRecent, determineStage, getNextAction, CONCURRENCY_TIMEOUT_MS } from './work-state.js';`
- `import type { ArtifactState, ArtifactInfo, SpecInfo, ReportInfo, VerifyReportInfo } from './work-state.js';`
- `import { writeProofChain, guardFailResult } from './work-proof.js';`

**New re-export to add:**
- `export { deriveSurface } from './work-proof.js';`

**Imports to remove from work.ts (move to work-proof.ts):**
- `resolveFindingPaths`, `generateDashboard`, `computeChainHealth` from the proofSummary import line
- `type ProofSummary` from the proofSummary import line

**Imports to split (some stay, some move):**
The current single proofSummary import line:
```
import { generateProofSummary, resolveFindingPaths, generateDashboard, computeChainHealth, wrapJsonResponse, wrapJsonError, detectHealthChange, getProofContext, extractScopeKind, type ProofSummary } from '../utils/proofSummary.js';
```
After split, work.ts keeps:
```
import { generateProofSummary, wrapJsonResponse, wrapJsonError, detectHealthChange, getProofContext, extractScopeKind } from '../utils/proofSummary.js';
```

**Imports that stay unchanged in work.ts:** All other imports (commander, chalk, child_process, fs, fsPromises, path, yaml, git-operations, validators, worktree, update-check, scan-freshness, proof types).

**Proof type imports adjustment:** `ProofChainEntry`, `ProofChain`, `ProofChainStats` — verify whether work.ts still needs these after writeProofChain moves. `completeWork` calls `writeProofChain` which returns `ProofChainStats`, and the recovery path in `completeWork` constructs `ProofChainEntry` directly. So `ProofChainEntry` and `ProofChainStats` stay in work.ts. Check if `ProofChain` is still needed — it may only be used inside `writeProofChain`. If so, remove it from work.ts's import.

**What stays in work.ts (~1717 lines):**
- `WorkItem` interface (uses `ArtifactState` via import type)
- `StatusOutput` interface
- `ConcurrencyGuardResult` interface
- `printExistingWorktree` function
- `printNotifications` function
- `printHumanReadable` function
- `getWorkStatus` function (exported)
- `completeWork` function (exported)
- `startWork` function (exported)
- `startBuildPhase` function
- `commitSaves` function
- `getClaudePid` function (exported)
- `checkConcurrencyGuard` function (exported)
- `writeTimestamp` function
- `registerWorkCommand` function (exported)

## Acceptance Criteria

- [ ] AC1: `work-state.ts` exists with 10 state functions + 5 types + 1 constant exported
- [ ] AC2: `work-proof.ts` exists with 3 proof functions exported (`writeProofChain`, `guardFailResult`, `deriveSurface`)
- [ ] AC3: `work.ts` imports from work-state.ts and work-proof.ts. Re-exports `deriveSurface` from work-proof.ts
- [ ] AC4: `work.ts` is ~1717 lines (down from 2545)
- [ ] AC5: Zero display output changes — `printHumanReadable`, `printNotifications`, `printExistingWorktree` are untouched in work.ts
- [ ] AC6: All existing tests pass without modification to test assertions. Tests import from work.ts via re-exports as before
- [ ] AC7: `pnpm run test -- --run` passes
- [ ] AC8: Build and lint pass

## Testing Strategy

- **No new tests needed.** This is a structural refactor — existing tests cover all behavior. The test matrix is unchanged.
- **Existing test files:** `work.test.ts` (6044 lines, 2924 tests total including other test files), `work-ci-mocked.test.ts`, `work-merge.test.ts`, `worktree-guards.test.ts`, `proof-surface-derivation.test.ts`. All import from `work.js` — the re-export ensures `deriveSurface` continues to resolve.
- **Regression focus:** The `deriveSurface` describe block (work.test.ts line 5792) uses dynamic import from `work.js`. The re-export must be in place before tests run.

## Dependencies

None. All referenced modules exist and are stable.

## Constraints

- **CRITICAL: Agent-parsed output untouched.** Pipeline agents parse `ana work status` human output. Display functions (`printHumanReadable`, `printNotifications`, `printExistingWorktree`) MUST NOT move, be renamed, or have their output format changed.
- **Zero behavior change.** Every function keeps its exact signature. No parameter changes, no return type changes, no logic changes.
- **Backward compatibility.** The `deriveSurface` re-export from work.ts ensures `import { deriveSurface } from './work.js'` continues to work.

## Gotchas

- **proofSummary import split.** The current single import line serves BOTH `writeProofChain` (3 functions: `resolveFindingPaths`, `generateDashboard`, `computeChainHealth`) and `completeWork` (6 functions: `generateProofSummary`, `wrapJsonResponse`, `wrapJsonError`, `detectHealthChange`, `getProofContext`, `extractScopeKind`). The type `ProofSummary` also moves to work-proof.ts. Verify no function appears in both files after split.
- **`CONCURRENCY_TIMEOUT_MS` is at line 2371** — far below the state functions that use it (line 377). It must move to work-state.ts with the functions. work.ts then imports it for `checkConcurrencyGuard`.
- **`ProofChain` import may be removable from work.ts.** After `writeProofChain` moves, verify whether `completeWork` still references `ProofChain` directly. If only `writeProofChain` used it, drop it from work.ts's proof type import. The recovery path in `completeWork` constructs entries and reads the chain — check this carefully.
- **`findProjectRoot` stays in work.ts imports AND appears in work-proof.ts.** `writeProofChain` receives `projectRoot` as a parameter but also calls `findProjectRoot` internally for resolving finding paths. Verify by reading the function.
- **`yaml` import stays in work.ts only.** It's used by `completeWork` for contract parsing, not by any moving function.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { countPhases } from './work-state.js'`
- Use `import type` for type-only imports, separate from value imports
- Prefer named exports — no default exports
- Explicit return types on all exported functions
- Exported functions require `@param` and `@returns` JSDoc tags
- `node:` prefix for built-in imports: `import * as fs from 'node:fs'`

### Pattern Extracts

Re-export pattern from `src/utils/proofSummary.ts` (line 1, after the decompose-proof-summary work):
```typescript
// Re-exports from proof-parsers for backward compatibility
export { parseBuildOpenIssues, extractFileRefs, extractScopeSummary, extractScopeKind, parseFindings, parseRejectionCycles } from './proof-parsers.js';
export type { ProofAssertion, ProofDeviation } from './proof-parsers.js';

// Re-exports from proof-health for backward compatibility
export { computeHealthReport, computeFirstPassRate, detectHealthChange, computeStaleness } from './proof-health.js';
```

For this spec, the re-export is minimal — only `deriveSurface`:
```typescript
export { deriveSurface } from './work-proof.js';
```

### Proof Context
- `[code] (pipeline-concurrency-guards-C2)` isTimestampRecent duplicates checkConcurrencyGuard logic — both parse .saves.json, extract timestamp, compare against CONCURRENCY_TIMEOUT_MS. This is a known issue but NOT in scope to fix. After this decomposition they'll be in different files (isTimestampRecent in work-state.ts, checkConcurrencyGuard in work.ts), making the duplication more visible but not worse.
- `[code] (work-ts-branch-coverage-C5)` Two different result parsers with different casing: getVerifyResult returns 'unknown' (lowercase). Not in scope — just be aware getVerifyResult moves to work-state.ts unchanged.

### Checkpoint Commands
- After creating `work-state.ts` and `work-proof.ts` and modifying `work.ts`: `(cd 'packages/cli' && pnpm vitest run)` — Expected: all existing tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2924 tests pass (2 skipped)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2924 passed, 2 skipped
- Current test files: 124
- Command used: `pnpm run test -- --run`
- After build: expected 2924 tests in 124 files (no new tests — structural refactor)
- Regression focus: `work.test.ts` (deriveSurface dynamic import), `work-ci-mocked.test.ts`, `work-merge.test.ts`, `worktree-guards.test.ts`
