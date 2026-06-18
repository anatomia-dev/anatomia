# Build Report: Proof-Context Intelligence — Phase 2 (import-graph write pipeline + reader)

**Created by:** AnaBuild
**Date:** 2026-06-18
**Spec:** .ana/plans/active/proof-context-intelligence/spec-2.md
**Branch:** feature/proof-context-intelligence

## What Was Built

- `packages/cli/src/engine/analyzers/graph/buildGraph.ts` (created): Harvested **verbatim** (560 lines) from `feature/devday-scan`. The pure, deterministic, fail-soft import-graph primitive — `buildImportGraph(parsed, tsconfigs, projectRoot, workspacePackages)` resolves per-file imports (relative, tsconfig-alias, framework-default, monorepo workspace-package) into a sorted file→file digraph; bare/external specifiers produce no edge and are counted as `unresolved`. Also exports `persistCodeGraph(stateDir, graph)` (fail-soft write) and the `CodeGraph`/`ImportEdge` types. Its three type imports (`ParsedAnalysis`/`ParsedFile`, `TsconfigEntry`) resolve unchanged against main's types — confirmed by `tsc --noEmit`.
- `packages/cli/src/engine/analyzers/graph/readGraph.ts` (created): New `readCodeGraph(projectRoot): CodeGraph | null`. Synchronous (mirrors `getProofContext`), reads `<root>/.ana/state/code-graph.json`, parses in try/catch, validates array `nodes`/`edges`, returns the typed graph or `null` on absent/unreadable/unparseable/malformed. Never throws. Staleness intentionally not checked.
- `packages/cli/src/engine/scan-engine.ts` (modified): Added opt-in `persistGraphTo?: string` to `scanProject` options. Inside the deep-tier `if (parsed) { … }` block, after conventions detection, builds the workspace-package map from `census.sourceRoots` (excluding the `.` root), calls `buildImportGraph(...)`, and persists **only when `persistGraphTo` is set** — wrapped in its own try/catch so a graph failure never invalidates the scan. `ana scan` passes no dir, so it stays read-only and byte-stable.
- `packages/cli/src/commands/init/state.ts` (modified): `runAnalyzer` gained an optional `persistGraphTo` param, forwarded to `scanProject` (conditionally, to satisfy `exactOptionalPropertyTypes`).
- `packages/cli/src/commands/init/index.ts` (modified): The init build now calls `runAnalyzer(cwd, path.join(tmpAnaPath, 'state'))` — the same staging `state/` dir `buildSymbolIndexSafe` writes into, so `code-graph.json` survives the atomic swap into live `.ana/`.
- `packages/cli/tests/engine/analyzers/graph/buildGraph.test.ts` (created): 12 cases — builder + persist.
- `packages/cli/tests/engine/analyzers/graph/readGraph.test.ts` (created): 6 cases — reader.
- `packages/cli/tests/commands/init/code-graph-init.test.ts` (created): 2 cases — built-CLI init integration.

## PR Summary

- Harvests the import-graph write pipeline onto `main`: a pure, deterministic `buildImportGraph` plus a fail-soft `persistCodeGraph`, lifted verbatim from `feature/devday-scan`.
- Wires the graph into the deep-tier scan behind an opt-in `persistGraphTo` option — `ana scan` stays read-only and byte-stable; only write contexts (init) persist `code-graph.json`.
- A fresh `ana init` now writes a non-empty `.ana/state/code-graph.json` day one (verified end-to-end through the atomic swap), satisfying the AC2b precondition.
- Adds `readCodeGraph`, the shared fail-soft reader Phase 3 consumes for both the import blast-radius layer and the `hidden`/`unknown` relation flag.
- This phase ships an inert artifact (like `symbol-index.json` before its consumers existed); Phase 3 makes it visible. 20 new tests, 0 regressions.

## Acceptance Criteria Coverage

- AC "buildImportGraph + persistCodeGraph exist on main, deterministic, type-check against main" → buildGraph.test.ts "determinism" + "edge resolution" (12 assertions); `tsc --noEmit` clean.
- AC "scanProject accepts persistGraphTo, writes only when set; ana scan writes nothing" → verified by sealed full suite (scan-engine byte-parity/determinism tests pass) + opt-in code path (persist guarded by `if (options.persistGraphTo)`).
- AC "ana init writes non-empty code-graph.json on a fresh repo" → ✅ code-graph-init.test.ts "writes a non-empty code-graph.json … after the atomic swap" (**@ana A028**) + "records the in-repo import edge".
- AC "readCodeGraph returns typed graph when present, null (never throws) when absent/unparseable/malformed" → ✅ readGraph.test.ts (6 cases; absent-case tagged **@ana A029**).
- AC "a graph-build or persist failure never invalidates the scan" → own try/catch in scan-engine; persist fail-soft proven by buildGraph.test.ts "is fail-soft: never throws even when the target path is invalid".
- AC "tests pass; no build errors; lint clean" → ✅ sealed run 4023 passed / 0 failed; `tsc --noEmit` clean; eslint 0 errors on changed files.

### Contract coverage (Phase 2 scope)
2/2 in-scope assertions tagged: **A028** (init writes non-empty `code-graph.json`), **A029** (`readCodeGraph` → `null` when absent). All other contract assertions (A001–A027, A030–A034) belong to Phase 1 (delivered) or Phase 3 (not started) and are out of scope here.

## Implementation Decisions

- **Wiring `persistGraphTo` through `runAnalyzer` rather than a standalone post-init build.** The spec's structural analog (`buildSymbolIndexSafe`) is a separate build, but the spec explicitly directs the scan-engine `persistGraphTo` hook to avoid a re-parse. Since the scan happens inside `runAnalyzer`, I threaded one optional param through it and passed `path.join(tmpAnaPath, 'state')` at the call site — the same staging dir `buildSymbolIndexSafe` targets. This reuses the deep-tier `parsed`/`census` the scan already computed (no second parse) and lands the file where the atomic swap preserves it.
- **`projectRoot` = `rootPath` in the scan wiring is correct.** The `ParsedFile.file` schema comment says "relative to project root," but `parseProjectFiles` actually sets `file` to the **absolute** path (`parseFile(absolutePath, …)` at treeSitter.ts:1053). So `path.relative(rootPath, f.file)` yields the right repo-relative node identity. Confirmed empirically: the init integration test produces non-empty nodes with the expected `src/a.ts → src/b.ts` edge.
- **Reader validation is minimal-but-load-bearing.** `isCodeGraph` checks only that `nodes`/`edges` are arrays (the fields downstream indexes), so a forward-compatible graph with extra fields still reads while genuinely malformed shapes are rejected. Documented and tested.

## Deviations from Contract

None — contract followed exactly. Both in-scope assertions (A028, A029) are satisfied as specified and tagged. Ambiguity notes:

- The spec offered sync-or-async for the reader and **recommended sync**; I built it sync (Phase 3's `getProofContext` is sync). Not a deviation — followed the recommendation.
- The init integration test is required by the spec's Testing Strategy but not enumerated in `contract.yaml`'s `file_changes`. I placed it at `tests/commands/init/code-graph-init.test.ts` (extra coverage beyond the two contract-listed test files). Not a deviation — additive.

## Test Results

### Baseline (before changes)
Command: `pnpm run test -- --run`
Tests: **4002 passed, 1 failed, 2 skipped (4005)** across 171 files.
The single failure — `template-propagation.test.ts › "a Claude-only project never creates or touches the .codex tree"` — **passes in isolation** (21/21). It is a pre-existing flake under full parallel load, present on the untouched feature branch before any of my changes. Used as the regression baseline (a known flake, not a real failure).

### After Changes (sealed)
<!-- ana:capture stage=build slug=proof-context-intelligence counts=4023p/0f/2s verdict=pass sha256=d2b7e4d214e7456fe33e6a2c4638e5bef7f24beb220ab2682dd40a9880d6b3ae -->
Tests: **4023 passed, 0 failed, 2 skipped (4025)**. The previously-flaky template-propagation test passed in this run.

### Comparison
- Tests added: **20** (12 builder/persist + 6 reader + 2 init integration). 4025 total − 4005 baseline = 20.
- Tests removed: **0**.
- Regressions: **none**. The one baseline "failure" was the known flake; it passed in the sealed run, so 0 failing after changes.

### New Tests Written
- `tests/engine/analyzers/graph/buildGraph.test.ts`: relative/NodeNext `.js→.ts`, extension-less + directory-index, tsconfig alias, bare/external → no edge + unresolved count, monorepo workspace-package edge, self-edge suppression, distinct-importer in-degree, sorted determinism + byte-identical reruns, `filesAnalyzed`, absolute-path relativization, persist round-trip, persist fail-soft.
- `tests/engine/analyzers/graph/readGraph.test.ts`: present/well-formed, absent → null (no throw), invalid JSON → null, wrong shape → null, non-object/null → null, forward-compatible extra fields.
- `tests/commands/init/code-graph-init.test.ts`: fresh built-CLI `ana init` writes non-empty `code-graph.json` post-swap; the in-repo edge is recorded.

## Verification Commands
```
(cd 'packages/cli' && pnpm run build)        # typecheck + bundle
pnpm run test -- --run                        # full suite (or: ana test --stage build --slug proof-context-intelligence)
(cd 'packages/cli' && pnpm vitest run tests/engine/analyzers/graph/ tests/commands/init/code-graph-init.test.ts)
(cd 'packages/cli' && npx eslint src/engine/analyzers/graph/ src/engine/scan-engine.ts src/commands/init/state.ts src/commands/init/index.ts)
```

## Git History
```
a2112a60 [proof-context-intelligence:s2] Wire graph persistence into scan + init
ea1986ce [proof-context-intelligence:s2] Add import-graph builder + reader
```

## Open Issues

1. **Stale `ParsedFile.file` schema comment.** `types/parsed.ts` documents `file` as "relative to project root" but `parseProjectFiles` emits absolute paths. The graph wiring is correct *because* of this (it passes `rootPath` to relativize), but the contradiction is a latent trap for the next caller. Severity: observation. Suggested action: monitor (or a one-line comment fix in a future cleanup).
2. **Pre-existing flaky init test.** `template-propagation.test.ts › "never creates or touches the .codex tree"` fails under full parallel load but passes in isolation and passed in the sealed run. Not introduced by this build; in a module this spec touches (`init/`), so flagged for visibility. Severity: debt. Suggested action: scope (parallel-isolation fix, separate work item).
3. **Pre-existing lint warning** in `src/utils/git-operations.ts:198` (unused eslint-disable directive) surfaces in the repo-wide `pnpm run lint`. Not my file, not introduced here. Severity: observation. Suggested action: acknowledge.

Second pass — what I noticed but hadn't written down: the `buildGraph.ts` harvest also ships barrel/generated down-weight sets (`barrelFiles`/`generatedFiles`) and a `pagerank.ts` companion exists on the source branch; neither is consumed this phase (the harvest is intentionally `buildGraph.ts`-only per spec). These are inert-by-design, not concerns. No further issues surfaced.
