# Scope: Fix TypeScript Language Detection for Monorepos and Multi-Directory Projects

**Created by:** Ana
**Date:** 2026-05-22

## Intent

Four repos (budibase, infisical, tooljet, immich) show "Node.js" when they're clearly TypeScript. The TypeScript override check only looks at root tsconfig.json and allDeps — it misses typescript in root devDependencies (monorepo toolchain deps) and tsconfig.json files in non-workspace subdirectories. This fix expands detection to catch both cases without changing any currently-correct result.

## Complexity Assessment

- **Kind:** fix
- **Size:** small — one code change in scan-engine.ts, plus unit tests
- **Surface:** cli
- **Files affected:** `packages/cli/src/engine/scan-engine.ts` (the TypeScript override block, lines 853-861) + test file TBD by plan
- **Blast radius:** Display and context accuracy only. Language value flows to scan header, ana.json, scaffold descriptions, and scan.json `stack.language`. Does NOT affect init command generation, skill detection, setup messaging, or pipeline behavior. Upgrading Node.js → TypeScript is always an improvement, never a regression.
- **Estimated effort:** ~30 minutes implementation + tests
- **Multi-phase:** no

## Approach

Expand the TypeScript override from a two-check to a three-tier detection:

1. **Tier 1** (existing, unchanged): root `tsconfig.json` via `existsSync`.
2. **Tier 2** (one-line addition): add `census.rootDevDeps['typescript']` check alongside the existing `allDeps['typescript']`. Fixes budibase — typescript is a root devDependency that lives in `census.rootDevDeps`, not `allDeps`.
3. **Tier 3** (new, gated): check `tsconfig.json` in four evidence-backed subdirectories — `frontend`, `backend`, `server`, `web`. Only runs when Tiers 1 and 2 both miss (short-circuit). Fixes infisical and tooljet. Immich would also be fixed but is blocked by a separate issue (Issue #7: pnpm-workspace.yaml zero detection).

The entire check remains gated on `stack.language === 'Node.js'`, which prevents false positives for Go, Python, Rust, null, and already-TypeScript repos.

## Acceptance Criteria

- AC1: Budibase scan produces `stack.language: "TypeScript"` (was "Node.js")
- AC2: Infisical scan produces `stack.language: "TypeScript"` (was "Node.js")
- AC3: Tooljet scan produces `stack.language: "TypeScript"` (was "Node.js")
- AC4: Repos currently detecting as TypeScript remain TypeScript (no regression)
- AC5: Non-Node.js repos (Go, Python, Rust, null) are unaffected by the change
- AC6: Tier 3 is short-circuited when Tier 1 or Tier 2 already matches
- AC7: Unit test covers typescript-in-rootDevDeps-only scenario (budibase case)
- AC8: Unit test covers subdirectory-tsconfig-only scenario (infisical/tooljet case)
- AC9: Unit test covers the Node.js gate blocking non-Node languages

## Edge Cases & Risks

- **Memos (Go) has `web/tsconfig.json`**: Safe — the `Node.js` gate prevents Tier 3 from firing on Go projects. Verified against actual repo.
- **Immich blocked by Issue #7**: This fix correctly detects `server/tsconfig.json` and `web/tsconfig.json`, but immich's scan is broken for a separate reason. No special handling needed — when Issue #7 is fixed, this detection will work automatically.
- **rootDevDeps undefined**: `census.rootDevDeps` defaults to `{}` via nullish coalescing at census.ts:460 (`result?.rootPackage?.packageJson?.devDependencies ?? {}`). Property access on `{}` returns `undefined`. Safe.
- **Short-circuit correctness**: Langfuse has `web/tsconfig.json` but is caught by Tier 2 (allDeps). The `if (!hasTsConfig && !hasTsDep)` guard skips Tier 3 entirely. No unnecessary filesystem calls.

## Rejected Approaches

- **`readdirSync` to find all subdirectory tsconfigs dynamically**: More general, but requires an exclusion list (node_modules, .git, dist, build, .next, coverage...) that is its own maintenance surface. The 4-entry inclusion list is simpler, explicit, and covers all evidence-backed cases. Adding a fifth entry is one line.
- **8-entry directory list** (`src, app, lib, client` in addition to the 4): Zero repos in the 70-repo test set need them. `src/` is the highest false-positive risk entry. `lib/` is commonly compiled output. `app/` and `client/` are speculative. Dropped per "every character earns its place."
- **Adding `api/` or `cli/`**: Directus has `api/tsconfig.json` and tooljet has `cli/tsconfig.json`, but both already detect correctly via other tiers. Neither entry would flip any additional repo.
- **Changing the allDeps/rootDevDeps separation**: That's an architectural decision with broader consequences. This is a targeted fix — use what exists.

## Open Questions

None — all questions from the requirements doc are resolved.

## Exploration Findings

### Patterns Discovered

- `scan-engine.ts:853-861`: TypeScript override is a post-detection fixup, runs after all stack enrichment. Clean insertion point — expand the existing block.
- `census.ts:446-460`: `allDeps` merges workspace package deps/devDeps. `rootDevDeps` is separate, read directly from root package.json. Intentional separation — root deps are toolchain, not stack.

### Constraints Discovered

- [TYPE-VERIFIED] Node.js gate (scan-engine.ts:855) — `stack.language === 'Node.js'` string equality prevents false positives for all non-Node languages
- [TYPE-VERIFIED] rootDevDeps default (census.ts:460) — nullish coalescing to `{}` means safe property access even when no root package.json exists
- [OBSERVED] existsSync already imported — no new imports needed for Tier 3
- [OBSERVED] allDeps excludes root for monorepos — sourceRoots are workspace packages only (census.ts:428-443)

### Test Infrastructure

- Existing scan-engine tests use mock census objects and filesystem fixtures. The TypeScript override block likely needs a new test file or section covering the three tiers.

## For AnaPlan

### Structural Analog

The existing TypeScript override at scan-engine.ts:853-861 IS the structural analog — this scope expands it in place. The tiered short-circuit pattern (check cheap things first, skip expensive checks when cheap ones match) appears in other detectors.

### Relevant Code Paths

- `packages/cli/src/engine/scan-engine.ts:853-861` — the TypeScript override block to expand
- `packages/cli/src/engine/census.ts:446-460` — where allDeps and rootDevDeps are built (context, not changed)
- `packages/cli/src/engine/census.ts:415-427` — single-repo branch (explains why infisical/tooljet subdirs are invisible)
- `packages/cli/src/engine/census.ts:428-443` — monorepo branch (explains why budibase root devDeps are invisible to allDeps)

### Patterns to Follow

- The existing override block structure at scan-engine.ts:853-861 — expand, don't restructure
- `existsSync` usage pattern already established in the same function

### Known Gotchas

- The `census` parameter in the scan function carries `rootDevDeps` — make sure the planner threads it through to the override check (it's already available in scope at line 855)
- `allDeps` is a local variable built earlier in the function — also already in scope

### Things to Investigate

- Where the existing scan-engine tests live and what fixture/mock pattern they use for the TypeScript override (needed to design the test approach)
