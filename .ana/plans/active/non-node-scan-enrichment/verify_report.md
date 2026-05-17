# Verify Report: Non-Node Scan Enrichment (Application Shape + Python AI SDK)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-17
**Spec:** .ana/plans/active/non-node-scan-enrichment/spec.md
**Branch:** feature/non-node-scan-enrichment

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/non-node-scan-enrichment/contract.yaml
  Seal: INTACT (hash sha256:f6fa674e3d50ac411b1da3d72c68753d367f0b72bab1673b70404a61a46f6586)
```

Seal status: **INTACT**

Tests: 2395 passed, 0 failed, 2 skipped. Build: ⚡️ success. Lint: 0 errors, 1 warning (pre-existing unused eslint-disable directive).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | A Python FastAPI project is classified as an API server | ✅ SATISFIED | `applicationShape.test.ts:353` — `makeInput({ projectType: 'python', frameworkName: 'fastapi' })`, asserts `result.shape` `.toBe('api-server')` |
| A002 | A Python Typer project is classified as a CLI | ✅ SATISFIED | `applicationShape.test.ts:373` — `makeInput({ projectType: 'python', frameworkName: 'typer' })`, asserts `.toBe('cli')` |
| A003 | A Python Django project is classified as full-stack | ✅ SATISFIED | `applicationShape.test.ts:358` — `makeInput({ projectType: 'python', frameworkName: 'django' })`, asserts `.toBe('full-stack')` |
| A004 | A Go Gin project is classified as an API server | ✅ SATISFIED | `applicationShape.test.ts:383` — `makeInput({ projectType: 'go', frameworkName: 'gin' })`, asserts `.toBe('api-server')` |
| A005 | A Go Cobra project is classified as a CLI | ✅ SATISFIED | `applicationShape.test.ts:398` — `makeInput({ projectType: 'go', frameworkName: 'cobra-cli' })`, asserts `.toBe('cli')` |
| A006 | A Rust Axum project is classified as an API server | ✅ SATISFIED | `applicationShape.test.ts:408` — `makeInput({ projectType: 'rust', frameworkName: 'axum' })`, asserts `.toBe('api-server')` |
| A007 | A Rust Clap project is classified as a CLI | ✅ SATISFIED | `applicationShape.test.ts:423` — `makeInput({ projectType: 'rust', frameworkName: 'clap-cli' })`, asserts `.toBe('cli')` |
| A008 | A non-Node project with no detected framework gets unknown shape | ✅ SATISFIED | `applicationShape.test.ts:428` — `makeInput({ projectType: 'python', frameworkName: null })`, asserts `.toBe('unknown')` |
| A009 | A non-Node project with an unmapped framework gets unknown shape | ✅ SATISFIED | `applicationShape.test.ts:434` — `makeInput({ projectType: 'python', frameworkName: 'some-unknown-framework' })`, asserts `.toBe('unknown')` |
| A010 | Node projects still use the full detection chain, not the lookup table | ✅ SATISFIED | `applicationShape.test.ts:453` — `makeInput({ projectType: 'node', frameworkName: 'express', deps: ['express'] })`, asserts `.not.toBe('unknown')`. Matcher is `not_equals` / `'unknown'` — test uses `.not.toBe('unknown')`, which matches. |
| A011 | A Python project with openai is detected as using OpenAI | ✅ SATISFIED | `ai-sdk-detection.test.ts:71` — `detectNonNodeAiSdk(['openai'])`, asserts `.toBe('OpenAI')` |
| A012 | LangChain takes priority over OpenAI when both are present | ✅ SATISFIED | `ai-sdk-detection.test.ts:76` — `detectNonNodeAiSdk(['langchain', 'openai'])`, asserts `.toBe('LangChain')` |
| A013 | A Python project with crewai is detected as using CrewAI | ✅ SATISFIED | `ai-sdk-detection.test.ts:80` — `detectNonNodeAiSdk(['crewai'])`, asserts `.toBe('CrewAI')` |
| A014 | A Python project with the Anthropic SDK is detected as using Anthropic | ✅ SATISFIED | `ai-sdk-detection.test.ts:85` — `detectNonNodeAiSdk(['anthropic'])`, asserts `.toBe('Anthropic')` |
| A015 | An empty dependency list returns no AI SDK | ✅ SATISFIED | `ai-sdk-detection.test.ts:102` — `detectNonNodeAiSdk([])`, asserts `.toBeNull()`. Contract matcher `equals` / `null` — `.toBeNull()` is equivalent. |
| A016 | Dependencies without any AI packages return no AI SDK | ✅ SATISFIED | `ai-sdk-detection.test.ts:107` — `detectNonNodeAiSdk(['flask', 'pytest', 'requests'])`, asserts `.toBeNull()` |
| A017 | The Node AI SDK enrichment path is not affected by the new function | ✅ SATISFIED | No @ana-tagged test. Verified by source inspection: `scan-engine.ts:771` calls `detectAiSdk(allDeps)` at Node stack construction. `scan-engine.ts:818` gates `detectNonNodeAiSdk` with `!stack.aiSdk && projectTypeResult.type !== 'node'`, which structurally prevents execution on Node projects. The existing `detectAiSdk` tests in `ai-sdk-detection.test.ts:1-65` pass — Node detection is unmodified. |
| A018 | All 15 framework strings have a mapping in the lookup table | ✅ SATISFIED | `applicationShape.test.ts:440` — enumerates all 15 strings, filters for non-unknown shape, asserts `.toHaveLength(15)`. Also verified by reading `FRAMEWORK_TO_SHAPE` map at `applicationShape.ts:127-143` — 15 entries present. |

## Independent Findings

**Predictions resolved:**

1. **Map placement awkward** — Partially confirmed. The `FRAMEWORK_TO_SHAPE` constant sits between the function's JSDoc comment and the `export function` declaration (lines 125-143 between doc comment ending at 124 and function at 145). Works fine but reads oddly — the JSDoc appears to document the map, not the function. Not a blocker.

2. **Tests use weak assertions** — Not found. All assertions use `.toBe()` with exact expected values. The A018 test (line 440) uses `.toHaveLength(15)` which is appropriate for a count assertion.

3. **Priority tests thin** — Not found. Two priority tests exist: `langchain > openai` (line 76) and `crewai > anthropic + openai` (line 111). Covers the two highest-priority meta-frameworks.

4. **A017 has no tagged test** — Confirmed. No `@ana A017` tag in any test file for this feature. Verified by source inspection instead. The enrichment gate (`!stack.aiSdk && projectTypeResult.type !== 'node'`) is structurally sound, and existing Node AI SDK tests pass.

5. **Module doc stale** — Confirmed. The module-level JSDoc (line 2) says "classifies Node projects" but the function now classifies non-Node too.

**Production risk predictions:**
- "What would break in production?" — If a new framework detector is added but `FRAMEWORK_TO_SHAPE` isn't updated, the new framework silently gets `'unknown'`. The comment at line 126 documents the coupling, but there's no compile-time enforcement. The A018 test catches this at test time if the framework list in the test is also updated — but it's a manual coordination. Acceptable tradeoff for the simplicity gained.

**Over-building check:**
- No parameters, functions, or exports beyond what the spec requires.
- `detectNonNodeAiSdk` is exported (used by scan-engine import). `PYTHON_AI_SDK_PACKAGES` is not exported — appropriate.
- No extra error handling, no extra code paths.

## AC Walkthrough

- [x] **AC1:** ✅ PASS — FastAPI → `'api-server'`, Typer → `'cli'`, all 15 mappings verified in test and source.
- [x] **AC2:** ✅ PASS — `frameworkName: null` returns `'unknown'` (test line 428), unmapped string returns `'unknown'` (test line 434).
- [x] **AC3:** ✅ PASS — Non-Node branch triggers on `projectType !== null && projectType !== 'node'` (line 147). Node projects skip it entirely. Existing Node tests (lines 18-326) all pass.
- [x] **AC4:** ✅ PASS — `detectNonNodeAiSdk(['openai'])` → `'OpenAI'` (test line 71).
- [x] **AC5:** ✅ PASS — `detectNonNodeAiSdk(['langchain', 'openai'])` → `'LangChain'` (test line 76).
- [x] **AC6:** ✅ PASS — `detectNonNodeAiSdk(['crewai'])` → `'CrewAI'` (test line 80).
- [x] **AC7:** ✅ PASS — Gate at scan-engine.ts:818 checks `projectTypeResult.type !== 'node'`. Node projects never reach `detectNonNodeAiSdk`. `detectAiSdk` at line 771 is unchanged.
- [x] **AC8:** ✅ PASS — 2395 tests passed, 0 failed. Baseline was 2366 + 2 skipped. New tests added, no regressions.
- [x] **AC9:** ✅ PASS — Shape tests: 15 framework mappings + null fallback + unmapped fallback + completeness count test. AI SDK tests: 7 packages + 2 priority tests + empty array + no-match array.
- [x] **No build errors:** ✅ PASS — `pnpm run build` succeeds.
- [x] **Tests pass:** ✅ PASS — `pnpm vitest run` passes (2395 passed, 2 skipped).

## Blockers

None. All 18 contract assertions satisfied. All 11 acceptance criteria pass. No regressions (2395 vs 2366 baseline — 29 new tests, 0 failures). Checked: no unused exports in new code (`detectNonNodeAiSdk` imported in scan-engine.ts, `PYTHON_AI_SDK_PACKAGES` internal only), no unused parameters (both functions use all params), no unhandled error paths (pure functions with no I/O), no assumptions about external state (both functions take data in, return data out).

## Findings

- **Code — Module JSDoc says "classifies Node projects":** `packages/cli/src/engine/detectors/applicationShape.ts:2` — The doc comment says "classifies Node projects" but the function now handles non-Node via the lookup table. Should say "classifies projects by interpreting signals from census and framework detection." Minor — doesn't affect behavior.

- **Code — FRAMEWORK_TO_SHAPE map positioned between JSDoc and function:** `packages/cli/src/engine/detectors/applicationShape.ts:127` — The map constant sits between the function's JSDoc block (ending at line 124) and the `export function` declaration (line 145). Reads as if the JSDoc documents the map. Would be cleaner above the JSDoc block or in a separate constants section. Cosmetic only.

- **Test — A017 has no @ana-tagged test:** `packages/cli/tests/engine/detectors/ai-sdk-detection.test.ts` — Contract assertion A017 ("Node AI SDK enrichment path not affected") has no tagged test. Verified by source inspection of the gate condition at `packages/cli/src/engine/scan-engine.ts:818`. The structural gate is unambiguous (`projectTypeResult.type !== 'node'`), and existing Node detection tests pass. Acceptable for this assertion type (negative structural guarantee), but worth noting that a future refactor of the enrichment block could lose this protection without a dedicated test catching it.

- **Test — Multi-tagging obscures assertion traceability:** `packages/cli/tests/engine/detectors/applicationShape.test.ts:350` — Line 350 tags `@ana A001, A002, A003, A004, A005, A006, A007` on a single `describe` block containing individual per-framework tests. Each framework test IS its own assertion verification, but the multi-tag format means contract tracing requires reading the describe block rather than jumping to a specific line. Not ambiguous on close reading — each `it` block's test name matches a contract `block` field — but one-to-one tagging would be more maintainable.

## Deployer Handoff

Clean merge. Two additive changes: a `FRAMEWORK_TO_SHAPE` lookup table in `applicationShape.ts` and a `detectNonNodeAiSdk` function in `dependencies.ts` with a call site in `scan-engine.ts`. No breaking changes, no new dependencies, no config changes. The branch is 6 commits behind main — rebase or merge main before merging. The one lint warning (unused eslint-disable in an unrelated file) is pre-existing.

## Verdict

**Shippable:** YES

All 18 contract assertions satisfied. All 11 acceptance criteria pass. Tests green (2395/2395). Build and lint clean. The implementation is minimal and matches the spec precisely — a lookup table and a list scan, both pure functions, both gated correctly. No over-building, no scope creep. The findings are cosmetic (stale JSDoc, map positioning) and structural observations (no dedicated A017 test, multi-tagging). None affect correctness or reliability.
