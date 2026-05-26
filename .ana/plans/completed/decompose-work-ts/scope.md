# Scope: Decompose work.ts

**Created by:** Ana
**Date:** 2026-05-24

## Intent

`work.ts` is the largest source file (2545 lines) and the highest-churn file in the codebase (104 commits all-time — 50% more than the next highest). It contains 22 functions spanning 3 unrelated responsibilities: pipeline state computation, proof chain writing, and command orchestration + display. A developer adding a new pipeline stage has to navigate 2545 lines to find `determineStage`. A developer debugging proof chain entries has to find `writeProofChain` buried between `guardFailResult` and `completeWork`.

The disease: three distinct concerns accumulated in one file because the commands that orchestrate them (`completeWork`, `startWork`, `getWorkStatus`) call all of them. The calling code belongs together. The called code doesn't.

**CRITICAL CONSTRAINT:** Pipeline agents parse `ana work status` human output. The display functions (`printHumanReadable`, `printNotifications`, `printExistingWorktree`) MUST NOT be moved, renamed, or have their output format changed. This scope moves only pure computation and proof-writing functions. Display code stays untouched in work.ts.

## Complexity Assessment

- **Kind:** chore
- **Size:** medium — 1 large file → 3 files, types relocated, re-exports for backward compat
- **Surface:** cli
- **Files affected:**
  - `src/commands/work.ts` — remove ~828 lines, add imports + 1 re-export
  - `src/commands/work-state.ts` — new (~508 lines, pipeline state computation)
  - `src/commands/work-proof.ts` — new (~320 lines, proof chain writing)
- **Blast radius:** Zero behavior change. Zero display change. Agent-parsed output untouched. All functions keep exact signatures. Re-export handles the 1 externally-imported function (`deriveSurface`).
- **Estimated effort:** 1 pipeline cycle
- **Multi-phase:** no

## Approach

Split `work.ts` (2545 lines) into 3 files along responsibility boundaries. Same proven pattern as the proofSummary and artifact-validators decompositions. Display functions and command orchestrators stay in work.ts. Pure state computation moves to work-state.ts. Proof chain writing moves to work-proof.ts.

**`src/commands/work-state.ts`** (~508 lines) — pipeline state computation:

| Function | Lines | Dependencies |
|----------|-------|-------------|
| `fileExistsOnBranch` | 12 | runGit |
| `readFileOnBranch` | 15 | runGit |
| `getWorkBranch` | 18 | runGit |
| `countPhases` | 30 | (pure) |
| `getVerifyResult` | 14 | (pure) |
| `discoverSlugs` | 36 | fs, path, runGit |
| `gatherArtifactState` | 128 | fs, path, runGit, countPhases, fileExistsOnBranch, getVerifyResult, getWorkBranch, readFileOnBranch |
| `isTimestampRecent` | 24 | fs, path |
| `determineStage` | 158 | path, worktreeExists, getWorktreePath, isTimestampRecent, readFileOnBranch |
| `getNextAction` | 73 | (pure) |

Types that move with the functions:
- `ArtifactState` (line 34)
- `ArtifactInfo` (line 45)
- `SpecInfo` (line 53)
- `ReportInfo` (line 62)
- `VerifyReportInfo` (line 71)

Cross-calls are acyclic:
- `determineStage` → `isTimestampRecent`, `readFileOnBranch`
- `gatherArtifactState` → `countPhases`, `fileExistsOnBranch`, `getVerifyResult`, `getWorkBranch`, `readFileOnBranch`
- All others are leaf functions

Imports needed: `fs`, `path`, `runGit` (from `../utils/git-operations.js`), `worktreeExists`, `getWorktreePath` (from `../utils/worktree.js`).

**Module-scope constant (from redundant agent review, unanimous 3/3):** `CONCURRENCY_TIMEOUT_MS` (line 2371) is used by BOTH `isTimestampRecent` (moves to work-state.ts) and `checkConcurrencyGuard` (stays in work.ts). Move the constant to work-state.ts and export it. work.ts imports it from work-state.ts. Single source of truth, clean dependency direction.

**`src/commands/work-proof.ts`** (~320 lines) — proof chain writing:

| Function | Lines | Dependencies |
|----------|-------|-------------|
| `guardFailResult` | 22 | chalk, process.exit |
| `deriveSurface` | 33 | path (pure computation, already exported) |
| `writeProofChain` | 265 | fs, path, chalk, deriveSurface, guardFailResult, + proofSummary imports (resolveFindingPaths, generateDashboard, computeChainHealth), proof types |

Cross-calls: `writeProofChain` → `deriveSurface`, `guardFailResult` (both move together), AND `countPhases` (imported from work-state.ts — corrected from redundant agent review, unanimous 3/3).

**NOTE (from redundant agent review, unanimous 3/3):** `guardFailResult` calls `console.error` (3 times) and `process.exit(1)`. `writeProofChain` calls `console.error` for UNKNOWN result warnings. These are stderr error paths — NOT agent-parsed display output. Agents don't run `ana work complete`. Safe to move, but work-proof.ts is NOT pure computation — it has side effects.

Imports needed: `fs`, `fsPromises` (from `node:fs/promises` — used by writeProofChain for mkdir/writeFile), `path`, `chalk`, `countPhases` (from `./work-state.js`), proofSummary functions (resolveFindingPaths, generateDashboard, computeChainHealth), proof types (ProofChainEntry, ProofChain, etc.), `findProjectRoot` from validators, `runGit` from git-operations.

**`src/commands/work.ts`** (~1717 lines) — keeps everything agents interact with:

Commands: `getWorkStatus`, `completeWork`, `startWork`, `startBuildPhase`, `registerWorkCommand`
Display: `printHumanReadable`, `printNotifications`, `printExistingWorktree`
Concurrency: `getClaudePid`, `checkConcurrencyGuard`, `writeTimestamp`
Utility: `commitSaves`
Types: `WorkItem` (uses `ArtifactState` imported from work-state), `StatusOutput`, `ConcurrencyGuardResult`

New imports from work-state.ts: all 10 state functions + `ArtifactState` type
New imports from work-proof.ts: `writeProofChain`, `deriveSurface`, `guardFailResult` (corrected from redundant agent review — `completeWork` calls `guardFailResult` directly at line 1676)
Re-export: `export { deriveSurface } from './work-proof.js'` (backward compat for work.test.ts dynamic import)

Some proofSummary imports stay in work.ts (`generateProofSummary`, `wrapJsonResponse`, `wrapJsonError`, `detectHealthChange`, `getProofContext`, `extractScopeKind` — all used by `completeWork` outside of `writeProofChain`). Some proofSummary imports move to work-proof.ts (`resolveFindingPaths`, `generateDashboard`, `computeChainHealth` — used only by `writeProofChain`). The import line splits.

## Acceptance Criteria

- AC1: `work-state.ts` exists with 10 state functions + 5 types exported.
- AC2: `work-proof.ts` exists with 3 proof functions exported (`writeProofChain`, `guardFailResult`, `deriveSurface`).
- AC3: `work.ts` imports from work-state.ts and work-proof.ts. Re-exports `deriveSurface` from work-proof.ts.
- AC4: `work.ts` is ~1717 lines (down from 2545).
- AC5: Zero display output changes — `printHumanReadable`, `printNotifications`, `printExistingWorktree` are untouched in work.ts.
- AC6: All existing tests pass without modification to test assertions. Tests import from work.ts via re-exports as before.
- AC7: `pnpm run test -- --run` passes.
- AC8: Build and lint pass.

## Edge Cases & Risks

**Agent safety.** The CRITICAL constraint. All display functions stay in work.ts. The output of `ana work status` is byte-for-byte identical before and after this change. Verified: agents parse stage names ("ready-for-build", "ready-for-verify") from `printHumanReadable`, worktree paths from the same function, and ℹ notification lines from `printNotifications`. None of these functions move.

**`deriveSurface` re-export.** `work.test.ts` line 5793 imports `deriveSurface` via dynamic import from `work.js`. The re-export `export { deriveSurface } from './work-proof.js'` maintains this. `proof-surface-derivation.test.ts` has its OWN implementation — it doesn't import from work.ts.

**`ArtifactState` type crossing module boundary.** `WorkItem` in work.ts has a field `artifacts: ArtifactState`. After extraction, work.ts imports `ArtifactState` from work-state.ts. This is a type-only import — zero runtime cost.

**proofSummary import split.** The current single import line from `proofSummary.js` splits between work.ts and work-proof.ts. Each file imports only what it uses. Both import from the same module — no diamond dependency.

**`completeWork` calls `writeProofChain`.** After extraction, `completeWork` (in work.ts) calls `writeProofChain` (in work-proof.ts) via import. This is the main orchestration dependency — it's a clean function call across a module boundary. `writeProofChain` receives all data as parameters, no shared state.

**State functions are all private (not exported from work.ts).** After moving to work-state.ts, they become exported from work-state.ts but are NOT re-exported from work.ts — they're internal to the commands package. Only work.ts consumes them.

## Rejected Approaches

**Moving display functions to work-display.ts.** These are what agents parse. Moving them adds a module boundary in the most sensitive code path. Not worth the risk until agents migrate to `--json` for work status.

**Splitting work.ts into more than 3 files.** The concurrency functions (`getClaudePid`, `checkConcurrencyGuard`, `writeTimestamp`) could be a 4th file. But they're only ~137 lines and tightly coupled to `startWork`. Not worth the file.

**Moving `completeWork` (686 lines) to its own file.** It orchestrates state + proof + display, so it depends on all three. Moving it creates a 4th file that imports from the other 3 — more indirection for no added clarity. Better to keep orchestrators in the main file.

## Open Questions

None. Dependency analysis complete, type boundaries verified, agent safety confirmed.

## Exploration Findings

### Patterns Discovered

- 10 state functions call each other in an acyclic graph. `gatherArtifactState` is the hub — it calls 5 others. `determineStage` calls 2 others. The rest are leaves.
- `writeProofChain` is self-contained except for calling `deriveSurface` and `guardFailResult`, both of which move with it.
- The proofSummary import line serves BOTH `writeProofChain` (3 functions) and `completeWork` (6 functions). The split is clean — no function is used by both.
- All 10 state functions are private (not exported). All 3 proof functions include 1 export (`deriveSurface`).

### Constraints Discovered

- [CRITICAL] Agents parse `printHumanReadable` and `printNotifications` output. These stay in work.ts. Verified against all 5 agent templates.
- [VERIFIED] `deriveSurface` is the only externally-imported function that moves. Re-export handles it.
- [VERIFIED] `countPhases` is also exported — but only consumed internally by `gatherArtifactState`. After move, both are in work-state.ts — no re-export needed. Wait — let me verify:

### Test Infrastructure

- `work.test.ts` (6044 lines): imports `getWorkStatus`, `completeWork`, `startWork`, `getClaudePid`, `checkConcurrencyGuard`, `deriveSurface` from work.ts. After move, all continue to work via direct exports (commands stay) and re-export (deriveSurface).
- `work-ci-mocked.test.ts` (218 lines): imports `completeWork`, `getClaudePid`. Both stay in work.ts.
- `work-merge.test.ts`: imports `completeWork`. Stays.
- `worktree-guards.test.ts`: imports `completeWork`. Stays.

## For AnaPlan

### Structural Analog

The `decompose-proof-summary` scope — identical pattern. Move pure functions to sibling modules, re-export from the original.

### Relevant Code Paths

- `src/commands/work.ts` lines 34-71 — type definitions (move to work-state.ts)
- `src/commands/work.ts` lines 115-622 — state functions (move to work-state.ts)
- `src/commands/work.ts` lines 897-951 — proof functions (move to work-proof.ts)
- `src/commands/work.ts` lines 952-1216 — writeProofChain (move to work-proof.ts)
- `src/commands/work.ts` lines 623-896 — display + command (STAYS)
- `src/commands/work.ts` lines 1217-2545 — commands + concurrency + registration (STAYS)

### Patterns to Follow

- Same re-export pattern as proofSummary: `export { deriveSurface } from './work-proof.js'`
- Same `import type` for type-only imports
- Same ESM `.js` extension convention

### Known Gotchas

- The proofSummary import line must be SPLIT, not duplicated. work.ts keeps imports it uses (`generateProofSummary`, `wrapJsonResponse`, etc.). work-proof.ts gets imports it uses (`resolveFindingPaths`, `generateDashboard`, `computeChainHealth`). Verify no function appears in both.
- `writeProofChain` uses `type ProofSummary` from the import. This becomes `import type { ProofSummary } from '../utils/proofSummary.js'` in work-proof.ts.
- `ArtifactState` is used in work.ts via the `WorkItem` interface. After move, work.ts needs `import type { ArtifactState } from './work-state.js'`.
- `countPhases` is exported from work.ts today (`export function countPhases`). After moving to work-state.ts, check if anything externally imports it. Verified: nothing does — `grep` returned empty. It can become a non-re-exported export from work-state.ts.

### Things to Investigate

- RESOLVED: `commitSaves` is called ONLY by `startWork` (line 2055) and `startBuildPhase` (line 2104) — both stay in work.ts. NOT called by `writeProofChain`. Stays in work.ts. No cross-module dependency.
