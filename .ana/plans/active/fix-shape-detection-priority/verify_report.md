# Verify Report: Fix Application Shape Detection Priority Chain

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-shape-detection-priority/spec.md
**Branch:** feature/fix-shape-detection-priority

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-shape-detection-priority/contract.yaml
  Seal: INTACT (hash sha256:1ac14f0643c633c842740026b6ce2b3363d9018822fc372285972d6308a19d56)
```

Build: SUCCESS (typecheck + tsup clean)
Tests: 2736 passed, 0 failed, 2 skipped (baseline was 2720 — 16 new tests added)
Lint: 0 errors, 1 warning (pre-existing unused eslint-disable in `git-operations.ts`, not in changed files)

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | MCP + Express → api-server | ✅ SATISFIED | test line 74-81, asserts `api-server` for `@modelcontextprotocol/sdk` + `express` framework |
| A002 | Pure MCP server → mcp-server | ✅ SATISFIED | test line 84-89, asserts `mcp-server` for MCP SDK with no framework |
| A003 | Next.js + MCP → web-app | ✅ SATISFIED | source inspection: test line 64-70 asserts `web-app` for MCP + `nextjs` framework. Note: `@ana A003` tag at line 319 is on wrong test (stale from prior contract) |
| A004 | Next.js + LangChain → web-app | ✅ SATISFIED | test line 102-109, asserts `web-app` for `@langchain/core` + `nextjs` framework |
| A005 | Express + LangChain → api-server | ✅ SATISFIED | test line 92-99, asserts `api-server` for `langchain` + `express` framework |
| A006 | Standalone LangChain → ai-agent | ✅ SATISFIED | test line 112-117, asserts `ai-agent` for `langchain` with no framework |
| A007 | NestJS + yargs → api-server | ✅ SATISFIED | test line 501-506, asserts `api-server` for `nestjs` framework + `yargs` dep |
| A008 | Next.js + commander → web-app | ✅ SATISFIED | test line 510-516, asserts `web-app` for `nextjs` framework + `commander` dep |
| A009 | Library + arg → library | ✅ SATISFIED | test line 313-317, asserts `library` for `arg` dep + `hasExports: true` |
| A010 | Commander alone → unknown | ✅ SATISFIED | test line 151-155, asserts `unknown` for `commander` dep only |
| A011 | bin + Express → api-server | ✅ SATISFIED | test line 534-542, asserts `api-server` for `express` framework + `hasBin: true` |
| A012 | bin + commander, no framework → cli | ✅ SATISFIED | test line 546-555, asserts `cli` for `hasBin: true` + `commander` dep, no framework |
| A013 | NestJS + @angular/core → full-stack | ✅ SATISFIED | test line 559-566, asserts `full-stack` for `nestjs` framework + `@angular/core` dep |
| A014 | Next.js alone → web-app | ✅ SATISFIED | test line 570-577, asserts `web-app` for `nextjs` framework, no special deps |
| A015 | Non-Node → FRAMEWORK_TO_SHAPE lookup | ✅ SATISFIED | test line 580-588, asserts `api-server` for `python` + `fastapi` |
| A016 | bin + library markers → cli | ✅ SATISFIED | test line 592-601, asserts `cli` for `hasBin: true` + `hasMain: true` |
| A017 | BROWSER_DEP_ALIASES is a named constant | ✅ SATISFIED | test line 604-611, source reads `applicationShape.ts` and asserts `toContain('BROWSER_DEP_ALIASES')` |
| A018 | CLI_DEPS constant and usage removed | ✅ SATISFIED | test line 614-621, source reads `applicationShape.ts` and asserts `not.toContain('CLI_DEPS')`. Confirmed via grep: zero matches in source file |

**18/18 SATISFIED, 0 UNSATISFIED**

## Independent Findings

**Predictions before reading code:**

1. "Builder probably left stale `@ana` tags from the prior contract" → **Confirmed.** 20 stale tags from a previous contract remain in the test file. IDs collide with the current contract (both use A001-A018). See Findings for details.

2. "BROWSER_DEP_ALIASES extraction might use wrong lookup method" → **Not found.** Correctly uses `Set.has()` at line 194, consistent with the `BROWSER_FRAMEWORKS.has()` call in the same expression.

3. "hasWebFramework hoisting might leave a stale variable" → **Not found.** The old `hasBrowserFramework` local in the MCP guard was cleanly replaced by the hoisted `hasWebFramework`. Diff confirms the old variable is gone.

4. "The ai-agent guard might not follow the MCP guard pattern" → **Not found.** Lines 163-167 follow the identical `if (deps match) { if (!hasWebFramework) { return } }` pattern.

5. "Over-building: extra functionality beyond spec" → **Not found.** Changes are minimal: 1 new constant, 1 hoisted variable, 2 guard updates, 1 reorder, 1 deletion. No extra params, no new exports, no unused abstractions.

**Production risk prediction:** "What if MCP + server framework + browser deps?" → The MCP guard falls through, framework check sees server + browser dep → full-stack. Correct behavior, but untested combination (see Findings).

**Over-building check:** No scope creep. All exported functions (`detectApplicationShape`) and types (`ApplicationShape`, `ApplicationShapeInput`, `ApplicationShapeResult`) are unchanged signatures. `BROWSER_DEP_ALIASES` is private (not exported). No YAGNI violations.

## AC Walkthrough
- [x] **AC1** (directus: MCP + Express → api-server): ✅ PASS — test line 74, source line 154-158
- [x] **AC2** (activepieces: MCP + server → api-server): ✅ PASS — covered by A001 test (Express is a server framework)
- [x] **AC3** (novu: NestJS + yargs → api-server): ✅ PASS — test line 501
- [x] **AC4** (amplication: NestJS + CLI deps → api-server): ✅ PASS — framework check (step 5-7) runs before bin/CLI checks (step 8)
- [x] **AC5** (hono: library + arg → library): ✅ PASS — test line 313, `CLI_DEPS` constant confirmed removed
- [x] **AC6** (langfuse: Next.js + @langchain/core → web-app): ✅ PASS — test line 102
- [x] **AC7** (Anatomia: bin + commander → cli): ✅ PASS — test line 546
- [x] **AC8** (ghostfolio: NestJS + @angular/core → full-stack): ✅ PASS — test line 559
- [x] **AC9** (dub/inbox-zero: Next.js → web-app): ✅ PASS — test line 570
- [x] **AC10** (Non-Node unchanged): ✅ PASS — test line 580, non-Node path at source lines 141-144 is untouched per diff
- [x] **AC11** (existing tests pass/updated): ✅ PASS — 2736 passed, 0 failed
- [x] **AC12** (8 new test cases): ✅ PASS — all 8 scenarios covered: pure MCP (line 84), MCP+server (line 74), ai-agent+browser (line 102), ai-agent+server (line 92), framework+CLI dep (line 501), framework+bin (line 519), library+CLI dep (line 302), bin+library (line 592)
- [x] **AC13** (bin + server framework test + design comment): ✅ PASS — test at line 528-542, design decision comment at lines 530-533
- [x] **Tests pass**: ✅ PASS — `(cd 'packages/cli' && pnpm vitest run)`: 2736 passed, 2 skipped
- [x] **Build**: ✅ PASS — `pnpm run build`: 2 packages, 0 errors
- [x] **Lint**: ✅ PASS — 0 errors (1 pre-existing warning in unrelated file)

## Blockers
None. All 18 contract assertions satisfied. All 16 acceptance criteria pass. No regressions (test count increased from 2720 to 2736). No unused exports in new code (BROWSER_DEP_ALIASES is private, used at line 194). No unhandled error paths (pure function, no I/O). No assumptions about external state. The stale @ana tag issue is tech debt, not a shipping blocker — tests themselves are correct.

## Findings

- **Test — Stale @ana tags from prior contract create proof chain ambiguity:** `packages/cli/tests/engine/detectors/applicationShape.test.ts` — 20 `@ana` tags from a previous build's contract remain in the file. Their IDs (A001-A018) collide with the current contract's IDs, so searching for `@ana A001` returns 3 matches instead of 1. The proof chain tooling cannot distinguish current tags from stale ones. Not a runtime issue — all tests work correctly — but degrades proof chain data quality for future builds. Suggested action: scope a tag-cleanup task, or adopt a namespaced tag format (e.g., `@ana fix-shape-C001`) to prevent cross-contract collisions.

- **Test — @ana A003 tag mismatch:** `packages/cli/tests/engine/detectors/applicationShape.test.ts:319` — The `@ana A003` tag marks the "detector is a pure function" test (checks source doesn't contain `node:fs`). The current contract's A003 says "Next.js + MCP → web-app," which is actually tested at line 64-70 without a tag. The assertion is satisfied by source inspection, but the tag creates a false mapping in the proof chain.

- **Code — BROWSER_DEP_ALIASES tightly coupled to BROWSER_FRAMEWORKS:** `packages/cli/src/engine/detectors/applicationShape.ts:107` — Adding a new browser framework whose package name differs from its internal key requires updating both `BROWSER_FRAMEWORKS` and `BROWSER_DEP_ALIASES` in sync. No compile-time or runtime check enforces this coupling. Currently only 3 aliases exist (next, @angular/core, solid-js), so the risk is low but grows with each new framework. Worth a code comment at minimum.

- **Test — No test for MCP + server framework + browser deps triple combination:** The test suite covers MCP+server→api-server and server+browser→full-stack independently, but not the triple: MCP + Express + React. In production, this combination falls through the MCP guard (framework present), then hits the server framework check and sees browser deps → full-stack. The behavior is correct, but the specific path is untested. Low risk given the guard logic is straightforward.

## Deployer Handoff
This is a pure-function change — no schema changes, no new dependencies, no runtime behavior change beyond returning different shape strings for specific input combinations. The `applicationShape` field in scan.json will change for projects matching the affected patterns (MCP+framework, agent+framework, CLI-dep-only), but no downstream consumers branch on shape values. Safe to merge and deploy. Re-scan any cached scan.json files after deploying to pick up corrected shapes.

## Verdict
**Shippable:** YES

18/18 contract assertions satisfied. 16/16 acceptance criteria pass. 2736 tests pass with 0 failures. Build and lint clean. The implementation matches the spec exactly: MCP guard extended to all frameworks, ai-agent guard added, priority chain reordered, CLI_DEPS removed, BROWSER_DEP_ALIASES extracted. The stale @ana tag issue is real tech debt worth scoping but doesn't affect correctness or shipping.
