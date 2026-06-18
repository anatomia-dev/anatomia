# Build Report: "Also changes with" — assembly + render + co-change templates (Phase 3)

**Created by:** AnaBuild
**Date:** 2026-06-18
**Spec:** .ana/plans/active/proof-context-intelligence/spec-3.md
**Branch:** feature/proof-context-intelligence

## What Was Built

- **packages/cli/src/engine/analyzers/proof-history/index.ts** (created): pure sync `computeCoChange(entries, queryFile, graph, match)` — the proof co-change engine. Harvests the branch's pair-accumulation + `MIN_TOUCHES`(3)/`MIN_COTOUCH`(2) gates; adds two net-new pieces: the `OVERSIZED_ITEM_CAP`(40) pairing exclusion and same-stem test-partner suppression; classifies each partner `hidden`/`imports`/`unknown` against the import graph (`unknown` is first-class — never fabricated). Returns `{ partners, total, suppressedTestPartner }`, ordered hidden→imports→unknown then co-touch desc.
- **packages/cli/src/utils/proofSummary.ts** (modified): added the optional `also_changes_with` field to `ProofContextResult` (proof partners + day-1 `imported_by`/`imports` + `proof_total` + `suppressed_test_partner`). `getProofContext` now reads the graph once via `readCodeGraph`, assembles both layers per query (`assembleAlsoChangesWith`), dedups proof partners out of the import layer, and no longer short-circuits on a missing chain (so the day-1 layer surfaces on fresh repos). Exported `fileMatches` so the engine reuses the one matcher.
- **packages/cli/src/commands/proof.ts** (modified): `formatContextResult` renders the capped **Also changes with** section (`renderAlsoChangesWith`) — hidden→imports→unknown groups, top-3 cap with a "top N of M" `--why` footer, suppression note, then capped `Imported by:`/`Imports:` sub-directions. `handleProofContext` surfaces the day-1 layer from a graph alone and guards the JSON path against a missing chain.
- **6 template files** (`templates/.claude/agents/{ana,ana-plan,ana-verify}.md` + `.codex` mirrors) and their **6 dogfood copies** (`.claude/agents/*`, `.codex/agents/*`): ana-plan includes co-change partners in the Build Brief as blast radius (AC13); ana-verify consumes co-change, independence reaffirmed (AC12); ana frames "Also changes with" as blast-radius discovery (AC11); codex mirrors in lockstep (AC14). Kept byte-for-byte with templates (the dogfood-match tests enforce this).
- **packages/cli/tests/engine/analyzers/proof-history.test.ts** (created): 22 unit tests for `computeCoChange`.
- **packages/cli/tests/utils/proofSummary.test.ts** (modified): +14 `getProofContext` result-shape tests.
- **packages/cli/tests/commands/proof.test.ts** (modified): +8 render tests (subprocess CLI).
- **packages/cli/tests/templates/agent-proof-context.test.ts** (modified): +7 co-change guidance tests.
- **packages/cli/tests/commands/init/template-propagation.test.ts** (modified): one timeout adjustment (see Implementation Decisions; assertions unchanged).

## PR Summary

- Adds the **Also changes with** section to `ana proof context` — one capped, gracefully-degrading list of what else moves when you touch a file, composed from the verified proof chain plus the day-1 import graph.
- New pure engine `computeCoChange` mines co-change partners across ≥2 verified work items, gated (≥3 touches each, ≥2 shared items), with a mega-refactor pairing exclusion so one giant item can't manufacture pairs.
- Each partner is honestly flagged `hidden` / `imports` / `unknown` against the import graph — `unknown` is never collapsed into a guess; a file's own test (even in a parallel `tests/` tree) is suppressed with a one-line note.
- The static `Imported by:` / `Imports:` layer renders from `code-graph.json` alone, so blast radius works on a fresh repo with no proof history.
- Agent templates (Claude + Codex) now pass co-change blast radius into Plan's Build Brief and tell Verify to consume it while forming findings independently.

## Acceptance Criteria Coverage

- AC2 (proof co-change, capped, "top N" footer) → proof.test.ts "caps proof partners at 3 with a top-N footer" + proofSummary.test.ts "returns also_changes_with proof partners" (A009, A010, A011, A020, A026, A027) — ✅
- AC2b (day-1 import layer, renders on fresh repo) → proofSummary.test.ts "surfaces a day-1 import layer even with no proof chain" + proof.test.ts "renders Imported by from the graph with no proof chain" (A012, A013) — ✅
- AC3 (same-stem test partner suppressed + note) → proof-history.test.ts suppression cases incl. parallel-tree mirror + proof.test.ts "emits a one-line suppression note" (A014, A015) — ✅
- AC4 (hidden/imports/unknown, absent graph → unknown, no crash) → proof-history.test.ts trichotomy cases + proofSummary.test.ts relation tests (A016, A017, A018) — ✅
- AC5 (gates + oversized exclusion) → proof-history.test.ts gate + oversized-item cases (A019, A020, A021) — ✅
- AC7 (honest absence; no chain+no graph → section absent) → proof.test.ts "omits Also changes with" + proofSummary.test.ts "leaves also_changes_with undefined" (A022, A023) — ✅
- AC8 (optional field; old callers unaffected) → proofSummary.test.ts "keeps existing touch_count and findings fields intact" (A024, A025) — ✅
- AC10 (hot file first-screen) → proof.test.ts cap test against a 4-partner hot file (A026, A027) — ✅
- AC12 (verify consumes co-change; independence) → agent-proof-context.test.ts ana-verify co-change tests (A032, A034) — ✅
- AC13 (plan Build Brief co-change) → agent-proof-context.test.ts ana-plan co-change tests (A033) — ✅
- AC14 (codex mirrors) → agent-proof-context.test.ts codex mirror tests (A033, A034) — ✅
- Tests pass / no build errors / lint clean → sealed full-suite run below — ✅

Contract coverage: **34/34 assertions tagged** (A001–A034 across the suite; A028/A029 by Phase 2 graph tests, A001–A008/A022 by Phase 1).

## Implementation Decisions

- **`computeCoChange` takes a 4th `match` parameter.** The spec's signature was `(entries, queryFile, graph)` and said "reuse `fileMatches`, do not introduce a second matcher." `proofSummary.ts` imports `computeCoChange`, so having the engine import `fileMatches` back from `proofSummary` would be a runtime circular import. I instead exported `fileMatches` and inject it as `match: FileMatcher` — one matcher, no cycle, engine stays fully decoupled and unit-testable.
- **Capping lives in the renderer, not the engine.** `computeCoChange` returns the full ordered partner list plus `total`; `formatContextResult` applies the top-3 cap and the "top N of M" footer. This mirrors Phase 1's `shaped_by` render cap and keeps `total` meaningful for the footer.
- **`getProofContext` no longer short-circuits on a missing chain; `handleProofContext` bails only when BOTH chain and graph are absent.** Required for AC2b/A013 — the day-1 import layer must render on a fresh repo (graph present, no proof chain). The JSON path falls back to an empty-chain envelope so it never throws on a missing file.
- **Test-partner suppression normalizes the `src/`↔`tests/` mirror** (see Deviations) rather than the spec's literal "shared directory" check.
- **`also_changes_with` is omitted entirely when neither layer has content** (AC7/AC8): old callers and the JSON shape are unaffected.

## Deviations from Contract

None — all 34 contract assertions are satisfied. One spec-text ambiguity was resolved (recorded here because the spec instructs documenting ambiguity resolutions):

### A014 / AC3: same-stem test-partner suppression heuristic
**Ambiguity:** The spec said match on "basename stem equality … and shared directory-or-suffix." This repo keeps tests in a **parallel `tests/` tree** (`tests/commands/work.test.ts`), not co-located with `src/commands/work.ts`, so a literal directory-equality check would NOT suppress the test partner — contradicting the spec's own mockup, which shows `work.test.ts suppressed` for that exact query.
**Chosen:** Normalize the `src/`↔`tests/` mirror — strip the `.test`/`.spec` infix and collapse `src`/`tests`/`test`/`__tests__` segments, then compare full paths. `src/commands/work.ts` and `tests/commands/work.test.ts` both normalize to `commands/work.ts` → suppressed; different modules stay distinct (`src/x/index.ts` ≠ `src/y/index.test.ts`). Bare-basename queries fall back to stem equality.
**Why / Outcome:** The AC3 intent — "a file's own test file is not listed as something that changes with it" — is fully met for this codebase's layout (verified on the live chain: `work.test.ts` is now suppressed with the note). Discovered via smoke test, not assumed.

## Test Results

### Baseline (before Phase 3 changes, on this branch after Phases 1+2)
Command: `ana test --stage build --slug proof-context-intelligence` (`pnpm run test -- --run`)
```
counts: 4023 passed, 0 failed, 2 skipped  (verdict: pass)
```

### After Changes
Command: `ana test --stage build --slug proof-context-intelligence`
```
counts: 4068 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=proof-context-intelligence counts=4068p/0f/2s verdict=pass sha256=0db40ff07ea0f01f763c37ab63765fd42f28a1e2b2eeebca8b45a7b3c3e50d41 -->

Test files: 175 passed. Stability confirmed across 3 consecutive full `vitest run`s after the timeout fix (4066→4068 as engine cases were added).

### Comparison
- Tests added: **+45** (4023 → 4068). Engine `proof-history.test.ts`: 22; `proofSummary.test.ts`: +14; `proof.test.ts`: +8 render; `agent-proof-context.test.ts`: +7.
- Tests removed: **0**.
- Regressions: **none**. (One pre-existing flaky timeout in `template-propagation.test.ts` was amplified by added subprocess load and fixed — see Open Issues.)

### Checkpoint runs (during build)
- `proof-history.test.ts` scoped: 22 passed.
- `proof.test.ts` + `proofSummary.test.ts` scoped: 443 passed (no regressions).
- `agent-proof-context.test.ts` scoped: 24 passed.

## Verification Commands
```
pnpm run build
(cd 'packages/cli' && pnpm vitest run tests/engine/analyzers/proof-history.test.ts)
(cd 'packages/cli' && pnpm vitest run tests/commands/proof.test.ts tests/utils/proofSummary.test.ts tests/templates/agent-proof-context.test.ts)
pnpm run test -- --run
pnpm run lint
```
Manual smoke (live chain): `ana proof context packages/cli/src/commands/work.ts` → renders "Also changes with" with the test partner suppressed and a "top 3 of 62" footer.

## Git History
```
7c1fb5ee [proof-context-intelligence:s3] Suppress test partners across parallel test trees
563ec278 [proof-context-intelligence:s3] Fix: realistic timeout for two-init propagation test
9c83ddb5 [proof-context-intelligence:s3] Co-change template guidance (.claude + .codex)
35cc0d3c [proof-context-intelligence:s3] Assemble + render Also changes with
6dfb628a [proof-context-intelligence:s3] Add computeCoChange proof co-change engine
```

## Open Issues

- **Pre-existing flaky timeout in `template-propagation.test.ts` (amplified, then fixed).** The "Claude-only project never creates the .codex tree" test runs two sequential `ana init` subprocesses under the 5s default timeout — failing durations sat at 5014/5430ms. My added subprocess-heavy render tests raised parallel CPU contention enough to tip it over (~50% under full load); it was always at the edge. Fixed by giving that one test a 30s budget (assertions unchanged). Severity: debt. Suggested action: monitor — other multi-subprocess init tests in this file may share the same under-budgeted pattern.
- **Pre-existing lint warning in `src/utils/git-operations.ts:198`** (unused eslint-disable directive) — not my file, not introduced by this build; surfaces on every lint run. Severity: observation. Suggested action: acknowledge.
- **Day-1 import layer depends on `code-graph.json`, which is not present in this worktree.** The graph is written at `ana init`/scan (Phase 2) and is not committed, so in the current worktree all proof partners render as `unknown` and no `Imported by:`/`Imports:` layer appears for the live command. This is correct fail-soft behaviour (verified), but means the graph-dependent paths (relation flags, import layer) are exercised only by tests that write a fixture graph, not by the live repo right now. Severity: observation. Suggested action: monitor.
- **`also_changes_with` is recomputed per query inside `getProofContext`'s map** (touch counts walk all entries per query). For the typical 1–3 file queries this is negligible; a query of dozens of files against a large chain would be O(files × entries). Severity: observation. Suggested action: monitor.

Second pass — re-examined for anything noticed-but-unwritten: the suppression-heuristic change and the no-chain short-circuit removal are documented (Deviations / Implementation Decisions); the 4-param signature is documented; the lint warning and flaky-test fix are listed above. No silent caps beyond the documented top-3 / per-direction-3 (both shown with footers). Nothing further surfaced. Verified complete by second pass.
