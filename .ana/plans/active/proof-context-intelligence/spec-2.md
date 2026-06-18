# Spec: Import-graph write pipeline + reader (infrastructure)

**Created by:** AnaPlan
**Date:** 2026-06-18
**Scope:** .ana/plans/active/proof-context-intelligence/scope.md

## Approach

**Discovered constraint (load-bearing):** the scope assumes "the branch persists `code-graph.json` but never reads it back — so only a reader is new." That is true on `feature/devday-scan`. On `main` it is **not**: there is no `graph/` analyzer, no `buildImportGraph`, no `persistCodeGraph`, no `persistGraphTo` scan wiring, and **nothing writes `.ana/state/code-graph.json`**. So the day-1 import layer (AC2b) needs the entire import-graph **write pipeline** harvested onto main first, then a reader. This phase is that infrastructure. It produces an inert artifact (like `symbol-index.json` before its consumers existed); Phase 3 makes it visible.

`main` already has everything the builder *consumes*: `ParsedAnalysis` with imports (`types/parsed.ts`, `ImportInfoSchema`), `census.configs.tsconfigs` and `census.sourceRoots` (used today at conventions detection, `scan-engine.ts`), and the deep-tier `parsed` object. So the harvest is a clean lift — the graph builder is a pure function of data main already gathers.

**Structural analog — follow it exactly:** `symbol-index.json` is built and persisted at init by `buildSymbolIndexSafe` (`init/state.ts:927`) calling `buildSymbolIndex(cwd, statePath)` and writing to `.ana/state/`. The code graph mirrors this convention. Two viable wiring points; **use the scan-engine `persistGraphTo` hook** (the branch's approach) rather than a separate post-init build, because the graph is a pure function of the deep-tier `parsed`/`census` the scan already computes — re-deriving it standalone would re-parse. The scan stays read-only for `ana scan` (no dir passed); only write contexts pass a state dir.

**Three lifts:**
1. **Harvest `buildGraph.ts`** verbatim from `feature/devday-scan:packages/cli/src/engine/analyzers/graph/buildGraph.ts` (~560 lines, pure, deterministic, fail-soft). Exports `CodeGraph`/`ImportEdge` types, `buildImportGraph(parsed, tsconfigs, projectRoot, workspacePackages)`, `persistCodeGraph(stateDir, graph)`. Its imports (`ParsedAnalysis`/`ParsedFile` from `types/parsed.js`, `TsconfigEntry` from `types/census.js`) all resolve on main unchanged — confirm by build.
2. **Wire the scan** — add `persistGraphTo?: string` to `scanProject`'s options and, inside the deep-tier `if (parsed) { … }` block (`scan-engine.ts`, after conventions detection), build the workspace-package map from `census.sourceRoots`, call `buildImportGraph(...)`, and `await persistCodeGraph(options.persistGraphTo, codeGraph)` **only when `persistGraphTo` is set**. Wrap in its own try/catch — a graph failure must never invalidate the scan (engine graceful-degradation rule).
3. **Wire init** — `init/state.ts:73` already calls `scanProject(rootPath, { depth: 'deep' })`. Pass `persistGraphTo` = the init build's `.ana/state` staging dir so a fresh `ana init` writes `code-graph.json`. **Verify the write actually fires on a fresh init** (scope gotcha — "don't assume day-1 is day-1"): the integration test below is non-optional.

4. **New reader** — `readCodeGraph(projectRoot): CodeGraph | null`. Reads `<root>/.ana/state/code-graph.json`, parses, returns the typed graph or `null` on absent/unparseable/malformed (fail-soft, never throws). Place it beside the builder (`engine/analyzers/graph/readGraph.ts`). This is the shared reader Phase 3 uses for **both** the day-1 import layer and the `hidden` flag — build it as a standalone reader, not buried in a co-change path (scope gotcha).

**Staleness (resolves scope open question):** silent. The reader does not check or surface `generated` age in v1; off-graph files become `unknown` downstream. Revisit only if staleness proves misleading.

## Output Mockups

No user-facing output this phase. The observable artifact is the file:

`.ana/state/code-graph.json` after `ana init`:
```json
{
  "generated": "2026-06-18T16:00:00.000Z",
  "nodes": ["packages/cli/src/commands/proof.ts", "packages/cli/src/utils/proofSummary.ts", "…"],
  "edges": [
    { "from": "packages/cli/src/commands/proof.ts", "to": "packages/cli/src/utils/proofSummary.ts", "names": ["getProofContext"] }
  ],
  "filesAnalyzed": 268,
  "unresolved": 41,
  "inDegree": { "packages/cli/src/utils/proofSummary.ts": 6 }
}
```

## File Changes

### packages/cli/src/engine/analyzers/graph/buildGraph.ts (create)
**What changes:** Harvest verbatim from `feature/devday-scan`. Do not rewrite — lift the file. Confirm its three type imports resolve against main's `types/parsed.ts` and `types/census.ts` (they are byte-identical on the parse side — `parsed.ts` shows no diff between branches).
**Pattern to follow:** the source file itself; it is already in house style (pure engine, fail-soft writes, deterministic sorted output).
**Why:** the graph builder is the missing write side AC2b depends on.

### packages/cli/src/engine/analyzers/graph/readGraph.ts (create)
**What changes:** New `readCodeGraph(projectRoot: string): CodeGraph | null`. Synchronous (mirrors `getProofContext`'s sync reads of `.ana/`), or async if cleaner — Phase 3's `getProofContext` is sync, so **prefer sync** (`fs.readFileSync` + `JSON.parse` in try/catch → `null`). Validate the parsed object has array `nodes`/`edges` before returning; malformed → `null`.
**Pattern to follow:** the fail-soft read+parse already in `getProofContext` (`proofSummary.ts:1269-1276`) — read, parse in try/catch, default on failure.
**Why:** the shared reader for the day-1 layer and the `hidden` flag (Phase 3).

### packages/cli/src/engine/scan-engine.ts (modify)
**What changes:** Add `persistGraphTo?: string` to the `scanProject` options type. Inside the deep-tier `if (parsed) { … }` block (after conventions detection), build the workspace map from `census.sourceRoots` (name→relativePath, excluding the `.` root entry), call `buildImportGraph(parsed, census.configs.tsconfigs, rootPath, workspacePackages)`, and persist only when `persistGraphTo` is set. Own try/catch.
**Pattern to follow:** the exact wiring on `feature/devday-scan:scan-engine.ts:881-896` (pasted below). Use a dynamic `import()` for the graph module, consistent with the other deep-tier analyzers in this block.
**Why:** the scan computes `parsed`/`census` already; building the graph here avoids a re-parse and keeps `ana scan` read-only (no dir passed).

### packages/cli/src/commands/init/state.ts (modify)
**What changes:** At the `scanProject(rootPath, { depth: 'deep' })` call (`:73`), pass `persistGraphTo` set to the init build's `.ana/state` staging directory (the same dir `buildSymbolIndexSafe` writes into). Confirm against how `buildSymbolIndexSafe` (`:927`) resolves its `statePath` so the graph lands in the same place and survives the atomic swap.
**Pattern to follow:** `buildSymbolIndexSafe` (`init/state.ts:919-933`) — the established "build a `.ana/state` artifact during init" pattern.
**Why:** makes the day-1 layer genuinely day-1 — written on first `ana init`, before any pipeline cycle.

### Tests (create)
- `packages/cli/tests/engine/analyzers/graph/buildGraph.test.ts` — harvest the branch's graph builder tests if present; otherwise cover: relative + tsconfig-alias edges resolve, bare/external specifiers produce no edge, unresolved counted, deterministic sorted output, monorepo workspace-package edges resolve.
- `packages/cli/tests/engine/analyzers/graph/readGraph.test.ts` — present → typed graph; absent file → `null`; malformed JSON → `null`; wrong shape → `null`; never throws.
- Init integration: a fresh `ana init` writes `.ana/state/code-graph.json` with non-empty `nodes` (the day-1 write-path verification the scope demands).

## Acceptance Criteria
- [ ] `buildImportGraph` + `persistCodeGraph` exist on `main` and build/persist a deterministic `CodeGraph`; harvested verbatim, builds and type-checks against main's types.
- [ ] `scanProject` accepts `persistGraphTo` and writes `code-graph.json` only when set; `ana scan` (no dir) writes nothing and keeps its read-only contract.
- [ ] `ana init` writes `.ana/state/code-graph.json` with non-empty `nodes` on a fresh repo (AC2b precondition — verified by integration test).
- [ ] `readCodeGraph(projectRoot)` returns a typed `CodeGraph` when present and `null` (never throws) when absent/unparseable/malformed.
- [ ] A graph-build or persist failure never invalidates the scan (own try/catch; engine graceful degradation).
- [ ] Tests pass with `pnpm run test -- --run`; no build errors; lint clean.

## Testing Strategy
- **Unit (builder):** edge resolution (relative, alias, external→none), determinism, monorepo workspace packages, unresolved count.
- **Unit (reader):** present/absent/malformed/wrong-shape → typed-or-null, never throws.
- **Integration (init):** fresh init produces a non-empty `code-graph.json` in `.ana/state/`.
- **Regression:** `ana scan` byte-parity — confirm no `code-graph.json` is written when `persistGraphTo` is unset.

## Dependencies
Phase 1 merged (sequencing; no code dependency — different files). Harvest source: `feature/devday-scan` (present locally as a branch).

## Constraints
- Engine purity: `buildGraph.ts` and `readGraph.ts` carry zero CLI deps (no chalk/ora/commander). They take data / paths and return data.
- Fail-soft everywhere: builder, persist, and reader all degrade to safe defaults (`null` / no-write), never crash a caller. Do not add `console.error` to these engine catch blocks (57+ intentional empty engine catches — house rule).
- `ana scan` must remain byte-stable: the write hook is opt-in via `persistGraphTo`.

## Gotchas
- **The write side does not exist on main** — this is the whole point of the phase. Don't look for an existing `persistCodeGraph` to extend; create it from the harvest.
- **Verify the init write fires** — the scope explicitly warns "don't assume day-1 is day-1." The init integration test is mandatory, not optional.
- **Staging-dir vs final `.ana/`** — init builds in a temp dir then atomically swaps (`preserveUserState`). The graph must be written into the staging `state/` dir so it survives the swap — exactly where `buildSymbolIndexSafe` writes. Match that path resolution; do not write to the live `.ana/` directly.
- **Don't merge the whole `devday-scan` branch.** It also puts intelligence into `scan.json` — explicitly rejected by the scope ("the always-loaded ~11k-token dump"). Harvest only `buildGraph.ts` + the wiring; nothing scan.json-facing.
- **Sync vs async reader:** Phase 3's `getProofContext` is synchronous. A sync `readCodeGraph` composes without infecting that path with async. Prefer sync.

## Build Brief

### Rules That Apply
- `.js` extensions on all relative imports; `import type` separated from value imports.
- Engine files (`src/engine/`) have zero CLI dependencies — no chalk/ora/commander. Engine catch blocks stay empty (graceful degradation); don't add logging.
- Explicit return types + `@param`/`@returns` JSDoc on exported functions.
- Use dynamic `import()` for analyzers inside the deep-tier block, matching the existing `patterns`/`conventions` calls.

### Pattern Extracts

Scan-engine wiring to replicate (`feature/devday-scan:scan-engine.ts:881-896`):
```ts
        try {
          const { buildImportGraph, persistCodeGraph } = await import('./analyzers/graph/buildGraph.js');
          const workspacePackages = new Map<string, string>();
          for (const sr of census.sourceRoots) {
            if (sr.packageName && sr.relativePath && sr.relativePath !== '.') {
              workspacePackages.set(sr.packageName, sr.relativePath);
            }
          }
          codeGraph = buildImportGraph(parsed, census.configs.tsconfigs, rootPath, workspacePackages);
          if (options.persistGraphTo) {
            await persistCodeGraph(options.persistGraphTo, codeGraph);
          }
        } catch {
          // Best-effort: the import graph is a derived artifact, never a gate.
        }
```

`persistCodeGraph` as harvested (`feature/devday-scan:buildGraph.ts`):
```ts
export async function persistCodeGraph(stateDir: string, graph: CodeGraph): Promise<void> {
  try {
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, 'code-graph.json'),
      JSON.stringify(graph, null, 2),
      'utf-8',
    );
  } catch {
    // Persisting the graph is best-effort; never block the caller.
  }
}
```

Init build-and-persist analog (`init/state.ts:927-933`):
```ts
export async function buildSymbolIndexSafe(cwd: string, tmpAnaPath: string): Promise<void> {
  const spinner = ora('Building symbol index...').start();
  try {
    const statePath = path.join(tmpAnaPath, 'state');
    const index = await buildSymbolIndex(cwd, statePath);
    spinner.succeed(`Symbol index built (${index.symbols.length} symbols from ${index.files_parsed} files)`);
```

`CodeGraph` type (harvest target, `feature/devday-scan:buildGraph.ts`):
```ts
export interface CodeGraph {
  generated: string;
  nodes: string[];                 // repo-relative POSIX, sorted
  edges: ImportEdge[];             // { from, to, names }, sorted by (from,to)
  filesAnalyzed: number;
  unresolved: number;
  inDegree: Record<string, number>;
  // …plus barrel-module list (harvest full type as-is)
}
```

### Proof Context
Run `ana proof context packages/cli/src/engine/scan-engine.ts packages/cli/src/commands/init/state.ts`. Curate top findings before building (Plan note: these are core scan/init files — expect active findings around init preservation and scan determinism; prioritize any touching the atomic-swap path). If none active, state so.

### Checkpoint Commands
- After harvesting `buildGraph.ts`: `(cd 'packages/cli' && pnpm run build)` — Expected: type-checks against main's `parsed.ts`/`census.ts`.
- After scan-engine wiring: `(cd 'packages/cli' && pnpm vitest run)` scoped to scan-engine tests — Expected: `ana scan` byte-parity tests still pass (no graph written).
- After all changes: `pnpm run test -- --run` — Expected: 3893 + new tests, 0 regressions.
- Lint: `pnpm run lint`.

### Build Baseline
- Current tests: **3893** test cases
- Current test files: **171**
- Command used: `pnpm run test -- --run`
- After build: expected 3893 + graph builder/reader/init-integration cases in 171 + ~2–3 new files
- Regression focus: scan-engine byte-parity / determinism tests (a new opt-in option must not change `ana scan` output), init preservation tests (`state.ts`).
