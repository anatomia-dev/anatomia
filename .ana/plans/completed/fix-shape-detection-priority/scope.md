# Scope: Fix Application Shape Detection Priority Chain

**Created by:** Ana
**Date:** 2026-05-22

## Intent

The application shape priority chain lets dependency-based signals (MCP SDK, LangChain, CLI deps like yargs/arg) override framework-based identity, producing wrong shapes for projects whose primary identity is determined by their framework. This is #2 priority from R5 comprehensive validation (70 repos tested). 8 repos misclassified: 6 false "cli", 2 false "mcp-server." This fix addresses 5 directly; the remaining 3 need upstream fixes in primary selection (Issue #3) and framework detection (Issue #8).

The user wants the shape detector to answer "what IS this project?" correctly. Directus (Express data platform) should be `api-server`, not `mcp-server`. Novu (NestJS notification platform) should be `api-server`, not `cli`. Hono (web framework library) should be `library`, not `cli`. The framework is the identity; the dependency is a capability.

## Complexity Assessment
- **Kind:** fix
- **Size:** small (one pure function reordered, one test file updated, zero schema changes)
- **Surface:** cli
- **Files affected:** `src/engine/detectors/applicationShape.ts`, `tests/engine/detectors/applicationShape.test.ts`
- **Blast radius:** Informational only. Shape appears in scan.json, terminal header, project-context scaffold (single-repo only), and setup agent display. Does NOT affect: surface detection, init command generation, pipeline validation, skill selection, proof chain, or any downstream command logic. Zero runtime consumers branch on shape values.
- **Estimated effort:** ~2 hours implementation + tests
- **Multi-phase:** no

## Approach

Reorder the priority chain so framework evidence (the strongest identity signal for a Node.js project) ranks above dependency-based classification. The principle: **framework is identity; dependency is capability.**

Three coordinated changes within the same pure function:

1. **Extend the MCP guard** to block on server frameworks, not just browser frameworks. Express + MCP SDK is "an API server that also offers MCP" — not "a dedicated MCP server."

2. **Gate ai-agent on "no framework detected."** Same principle as the MCP guard extension. LangChain + Next.js is "a web-app that integrates with LangChain" — not "an AI agent." Fixes langfuse (currently misclassified as `ai-agent`, actually a Next.js observability platform). Without this gate, the fix ships with a known inconsistency — "framework beats dependency" applied to MCP and CLI but not to ai-agent.

3. **Move framework checks above bin and CLI dep checks.** If NestJS is detected, the project is an api-server regardless of yargs in deps. Move library markers above CLI dep check. Remove the CLI-dep-as-last-resort step entirely (current step 10) — zero true positives in 70 repos, one false positive.

The resulting chain:

```
Node.js projects:
  1. MCP SDK (guard: no browser OR server framework) → mcp-server
  2. Agent framework (guard: no browser OR server framework) → ai-agent
  3. Mobile deps → mobile-app
  4. Job framework without web framework → worker
  5. Browser framework → web-app
  6. Server framework + browser deps → full-stack
  7. Server framework alone → api-server
  8. bin field → cli
  9. Library markers (main/module/exports) → library
  10. unknown
```

This follows "the elegant solution is the one that removes" — step 10 (CLI dep fallback) is deleted, the inline `hasBrowserDep` array is extracted to a named constant, and the priority logic becomes shorter and clearer.

## Acceptance Criteria
- AC1: directus scans as `api-server` (was `mcp-server`)
- AC2: activepieces scans as `api-server` (was `mcp-server`)
- AC3: novu scans as `api-server` (was `cli`)
- AC4: amplication scans as `api-server` (was `cli`)
- AC5: hono scans as `library` (was `cli`)
- AC6: langfuse scans as `web-app` (was `ai-agent`)
- AC7: Anatomia scans as `cli` (unchanged — bin + no framework)
- AC8: ghostfolio scans as `full-stack` (unchanged — NestJS + @angular/core)
- AC9: dub, inbox-zero, supabase scan as `web-app` (unchanged)
- AC10: Non-Node repos (ollama, gh-cli, prefect) unchanged (separate code path)
- AC11: All existing tests pass or are updated with correct new assertions
- AC12: New test cases cover: pure MCP server (no framework), MCP + server framework, ai-agent + browser framework, ai-agent + server framework, framework + CLI dep, framework + bin, library markers + CLI dep, bin + library markers (bin wins)
- AC13: `bin + server framework` has an explicit test and a code comment documenting the design decision (framework wins — verified safe for 70-repo set, api-server is correct for tools like json-server that embed Express)

## Edge Cases & Risks

**bin + server framework (theoretical):** Zero repos in 70-repo test set have this at the primary root level. Real tools like json-server/http-server have it. Under the new priority, these go from `cli` to `api-server`. Assessment: `api-server` is correct — these tools ARE servers accessed via HTTP. For n8n, `packages/cli` has bin + express but is NOT the primary (4th by file count at 1988 files; `nodes-base` has 4126). Risk: low for target customer; acceptable for ecosystem.

**ai-agent + framework gating:** A genuine AI agent with a web dashboard (LangChain + Next.js) would get `web-app` instead of `ai-agent`. This is correct — if the Next.js frontend is the primary surface (most files, most deps), the project's identity is "web app with AI features." A pure LangChain agent without a web framework still gets `ai-agent`.

**Step 10 removal:** A CLI in early development (commander in deps, no bin yet) goes from `cli` to `unknown`. `unknown` is honest and recoverable (setup catches it). `cli` on a non-CLI is misleading and unrecoverable. npx requires `bin` — a CLI without bin cannot be distributed. Zero true positives in 70 repos.

**primaryDeps merges prod+dev deps:** `arg` in hono's devDeps currently triggers CLI classification with the same weight as `commander` in prod deps. The reordering fixes this indirectly (library markers now beat CLI dep), but the data quality issue remains. Not in scope — noted for a future scope on dep-type distinction.

**ever-gauzy:** Still misclassified. Goes from `cli` (wrong) to `unknown` (honest) with step 10 removal. Correct fix requires Angular framework detector (Issue #8, separate scope).

**trpc:** Still misclassified. Wrong primary selection (Issue #3) causes `packages/openapi` (has bin) to be primary instead of `packages/server`. Separate scope.

## Rejected Approaches

**Removing yargs/minimist/arg from CLI_DEPS:** These ARE identity deps for real CLI tools. The problem isn't the set — it's the priority. When NestJS + yargs coexist, the framework is identity. When yargs exists alone, it IS identity. Priority ordering handles this correctly; shrinking the set would miss real CLIs.

**Adding devDep/prodDep distinction to shape detection:** Would fix hono more precisely (ignore `arg` in devDeps) but requires census schema changes, affects all detectors, and the reordering already fixes it. Disproportionate blast radius for zero additional correctness.

**Keeping step 10 (CLI dep as last resort) with tighter gating:** Three independent review agents recommended removal. Zero confirmed true positives. One confirmed false positive. Keeping it violates "the elegant solution is the one that removes." If a true positive emerges later, re-adding with proper gating is trivial.

**Deferring ai-agent gating to a separate scope:** Creates a known inconsistency on day one. "Framework beats dependency" applied to MCP and CLI but not ai-agent is an unexplained exception. langfuse stays misclassified. The gate is one condition — same pattern as the MCP guard extension. Including it is foundation; deferring it is technical debt.

## Open Questions

None. All questions from the requirements file were resolved during investigation.

## Exploration Findings

### Patterns Discovered
- `applicationShape.ts:145-219`: Pure function, no side effects, clean input/output contract. Reordering is a logic-only change.
- `applicationShape.ts:205-207`: Inline `hasBrowserDep` array `['next', '@angular/core', 'solid-js']` — fragile alias mapping, should be extracted.
- `scan-engine.ts:703-710`: Shape input assembly — `deps` is `Object.keys(census.primaryDeps)` which merges prod+dev. Framework comes from `frameworkResult.framework`.
- `census.ts:496`: `primaryDeps = { ...primaryRoot.deps, ...primaryRoot.devDeps }` — confirmed devDep merge.

### Constraints Discovered
- [TYPE-VERIFIED] Pure function contract (applicationShape.ts:145) — detector receives data, returns classification, no filesystem reads. Confirmed by A003 test.
- [VERIFIED] Non-Node path unchanged (applicationShape.ts:147-150) — early return for `projectType !== 'node'` uses `FRAMEWORK_TO_SHAPE` lookup. Reordering only affects the Node.js path below line 152.
- [VERIFIED] Primary selection for n8n — Policy 2 (most files) picks `nodes-base` (4126 files), not `packages/cli` (1988 files). The `bin + express` combination at `packages/cli` does NOT reach shape detection.
- [VERIFIED] Hono framework self-detection — `detectOtherNodeFrameworks` checks for `'hono'` in deps. The hono repo doesn't depend on itself, so `frameworkName = null`. Reordering is safe.
- [VERIFIED] Ghostfolio full-stack path — NestJS detected (priority 3 in registry, before Express). `hasBrowserDep` finds `@angular/core` in deps. Result: `full-stack` under both old and new priority.

### Test Infrastructure
- `applicationShape.test.ts`: `makeInput()` helper builds `ApplicationShapeInput` with all signals off. Tests use `@ana AXXX` contract tags. 3 assertions change behavior, 2 tests (A006: commander-alone and yargs-alone → cli) become step-10-removal casualties (new expected value: `unknown`).

## For AnaPlan

### Structural Analog
`applicationShape.ts` itself — the reordering is within this file. The guard pattern at line 155-159 (MCP + browser framework check) is the structural template for extending MCP guard and adding ai-agent guard.

### Relevant Code Paths
- `src/engine/detectors/applicationShape.ts` — the entire file. Priority chain lines 152-218. MCP guard 155-159. CLI dep check 187-189. Framework checks 192-210. Library markers 213-215.
- `tests/engine/detectors/applicationShape.test.ts` — all 491 lines. Tests that change: line 73-79 (MCP + Express), line 273-275 (commander + hasMain), line 278-280 (yargs + hasExports), line 122-141 (A006: CLI dep alone tests).
- `src/engine/detectors/node/framework-registry.ts` — read-only context. Priority order: Next.js > Remix > NestJS > Express > React > Other(Fastify/Koa/Hono).
- `src/engine/detectors/node/other.ts` — read-only context. Confirms hono framework detection checks for `'hono'` literal in deps.

### Patterns to Follow
- The existing MCP guard (line 155-159) is the pattern for the ai-agent guard: check framework, skip if framework present.
- The `hasBrowserDep` check (line 205-207) is the pattern for constant extraction.

### Known Gotchas
- The A006 tests (line 120-141) test CLI deps in isolation. With step 10 removed, `commander` alone → `unknown`, not `cli`. These tests need their assertions changed, not deleted — they still test that the detector doesn't crash on CLI-dep-only input.
- The test at line 73-79 has a misleading comment ("pure MCP server") but the input has `frameworkName: 'express'`. The fix changes both the assertion AND the comment. Add a NEW test for actual pure MCP (no framework).
- `BROWSER_FRAMEWORKS` contains `'hono'` — no, it doesn't. `SERVER_FRAMEWORKS` does. Don't confuse the sets. The full-stack check uses `BROWSER_FRAMEWORKS` for the dep check + the inline alias array.
- The `ai-agent` guard needs to check BOTH browser AND server frameworks, same as the proposed MCP guard. Use the same `hasWebFramework` check pattern already computed at line 174-176 for the worker step.

### Things to Investigate
- Whether the `hasWebFramework` variable (line 174-176, computed for worker check) can be reused for the MCP and ai-agent guards, or whether it needs to be computed earlier / differently. Currently it's inside the function body after step 3 — may need to move up.
