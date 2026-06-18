# Build Report: "Also changes with" — assembly + render + co-change templates (Phase 3)

**Created by:** AnaBuild
**Date:** 2026-06-18
**Spec:** .ana/plans/active/proof-context-intelligence/spec-3.md
**Branch:** feature/proof-context-intelligence

> Clean snapshot after one fix cycle (verify_report_3 → re-build). See **Fix History** for what changed since the first build. Prior report versions are in git history.

## What Was Built

- **packages/cli/src/engine/analyzers/proof-history/index.ts** (created): pure sync `computeCoChange(entries, queryFile, graph, match)` — the proof co-change engine. Harvests the branch's pair-accumulation + `MIN_TOUCHES`(3)/`MIN_COTOUCH`(2) gates; adds two net-new pieces: the `OVERSIZED_ITEM_CAP`(40) pairing exclusion and same-stem test-partner suppression; classifies each partner `hidden`/`imports`/`unknown` against the import graph (`unknown` is first-class — never fabricated). Returns `{ partners, total, suppressedTestPartner }`, ordered hidden→imports→unknown then co-touch desc.
  - **Fix-cycle change:** `isSameStemTestPartner` now routes its final comparison through the injected `match` (`fileMatches`) on the tree-mirror-normalized forms, instead of a divergent normalized exact-equality. Suppression is now exactly as path-form-tolerant as query↔partner pairing (see Fix History / Deviations).
- **packages/cli/src/utils/proofSummary.ts** (modified): added the optional `also_changes_with` field to `ProofContextResult` (proof partners + day-1 `imported_by`/`imports` + `proof_total` + `suppressed_test_partner`). `getProofContext` now reads the graph once via `readCodeGraph`, assembles both layers per query (`assembleAlsoChangesWith`), dedups proof partners out of the import layer, and no longer short-circuits on a missing chain (so the day-1 layer surfaces on fresh repos). Exported `fileMatches` so the engine reuses the one matcher.
- **packages/cli/src/commands/proof.ts** (modified): `formatContextResult` renders the capped **Also changes with** section (`renderAlsoChangesWith`) — hidden→imports→unknown groups, top-3 cap with a "top N of M" `--why` footer, suppression note, then capped `Imported by:`/`Imports:` sub-directions. `handleProofContext` surfaces the day-1 layer from a graph alone and guards the JSON path against a missing chain.
- **6 template files** (`templates/.claude/agents/{ana,ana-plan,ana-verify}.md` + `.codex` mirrors) and their **6 dogfood copies** (`.claude/agents/*`, `.codex/agents/*`): ana-plan includes co-change partners in the Build Brief as blast radius (AC13); ana-verify consumes co-change, independence reaffirmed (AC12); ana frames "Also changes with" as blast-radius discovery (AC11); codex mirrors in lockstep (AC14). Kept byte-for-byte with templates (the dogfood-match tests enforce this).
- **packages/cli/tests/engine/analyzers/proof-history.test.ts** (created, +1 in fix cycle): now 23 unit tests for `computeCoChange` — added a path-form-mismatch suppression case (package-relative query vs repo-relative test partner).
- **packages/cli/tests/utils/proofSummary.test.ts** (modified): +14 `getProofContext` result-shape tests.
- **packages/cli/tests/commands/proof.test.ts** (modified): +8 render tests (subprocess CLI).
- **packages/cli/tests/templates/agent-proof-context.test.ts** (modified): +7 co-change guidance tests.
- **packages/cli/tests/commands/init/template-propagation.test.ts** (modified): one timeout adjustment (see Implementation Decisions; assertions unchanged).

## Fix History

### Cycle 2 — verify_report_3 FAIL (AC3 blocker), this re-build
- **What failed:** Every sealed contract assertion passed mechanically (Gate 1), but Gate 2 (intent) failed: a *package-relative* query leaked the query's own test file into "Also changes with". Live repro: from `packages/cli`, `node dist/index.js proof context src/utils/proofSummary.ts` listed `packages/cli/tests/utils/proofSummary.test.ts` as a co-change partner with no suppression note (`top 3 of 40`). The A014/A015 tests passed only because they used aligned path forms.
- **Root cause:** query↔partner pairing reconciles differing path prefixes via `fileMatches` (suffix-tolerant), but suppression routed through a second comparison (`normalizeForTestMatch(...) === normalizeForTestMatch(...)`, prefix-sensitive exact equality). When the query path form differed from the stored partner form, the query matched partners for pairing yet failed test-counterpart detection. The spec gotcha had warned: *"do not introduce a second matcher."*
- **Fix:** thread the injected `match` into `isSameStemTestPartner` and replace the normalized exact-equality with `match(normalizeForTestMatch(partner), normalizeForTestMatch(query))`. The `src/`↔`tests/` tree normalization is preserved (fileMatches alone can't bridge parallel trees, since it requires basenames to align and the trees aren't path suffixes of each other); the final comparison now inherits fileMatches' `/`-boundary suffix tolerance — so package-relative queries suppress repo-relative partners, while the `/` boundary still keeps genuinely different modules distinct.
- **Test (the second finding):** added `proof-history.test.ts` "suppresses the test partner when the query path form differs from the stored partner" — query `src/commands/work.ts` vs stored `packages/cli/tests/commands/work.test.ts`. Confirmed **red before** the fix (`expected false to be true`) and **green after**.
- **Live re-verify:** the same package-relative query now renders `top 3 of 39` + `(note: same-stem test partner suppressed)`; the query's own test file is gone from the list.
- **Out of scope (honored):** contract.yaml is sealed and was not touched. A014/A015's narrowness remains an upstream finding for a future contract revision.

## PR Summary

- Adds the **Also changes with** section to `ana proof context` — one capped, gracefully-degrading list of what else moves when you touch a file, composed from the verified proof chain plus the day-1 import graph.
- New pure engine `computeCoChange` mines co-change partners across ≥2 verified work items, gated (≥3 touches each, ≥2 shared items), with a mega-refactor pairing exclusion so one giant item can't manufacture pairs.
- Each partner is honestly flagged `hidden` / `imports` / `unknown` against the import graph — `unknown` is never collapsed into a guess; a file's own test (even in a parallel `tests/` tree, and across differing query path forms) is suppressed with a one-line note.
- The static `Imported by:` / `Imports:` layer renders from `code-graph.json` alone, so blast radius works on a fresh repo with no proof history.
- Agent templates (Claude + Codex) now pass co-change blast radius into Plan's Build Brief and tell Verify to consume it while forming findings independently.

## Acceptance Criteria Coverage

- AC2 (proof co-change, capped, "top N" footer) → proof.test.ts "caps proof partners at 3 with a top-N footer" + proofSummary.test.ts "returns also_changes_with proof partners" (A009, A010, A011, A020, A026, A027) — ✅
- AC2b (day-1 import layer, renders on fresh repo) → proofSummary.test.ts "surfaces a day-1 import layer even with no proof chain" + proof.test.ts "renders Imported by from the graph with no proof chain" (A012, A013) — ✅
- AC3 (same-stem test partner suppressed + note, **including differing path forms**) → proof-history.test.ts suppression cases incl. parallel-tree mirror + the new path-form-mismatch case + proof.test.ts "emits a one-line suppression note" (A014, A015) — ✅
- AC4 (hidden/imports/unknown, absent graph → unknown, no crash) → proof-history.test.ts trichotomy cases + proofSummary.test.ts relation tests (A016, A017, A018) — ✅
- AC5 (gates + oversized exclusion) → proof-history.test.ts gate + oversized-item cases (A019, A020, A021) — ✅
- AC7 (honest absence; no chain+no graph → section absent) → proof.test.ts "omits Also changes with" + proofSummary.test.ts "leaves also_changes_with undefined" (A022, A023) — ✅
- AC8 (optional field; old callers unaffected) → proofSummary.test.ts "keeps existing touch_count and findings fields intact" (A024, A025) — ✅
- AC10 (hot file first-screen) → proof.test.ts cap test against a 4-partner hot file (A026, A027) — ✅
- AC12 (verify consumes co-change; independence) → agent-proof-context.test.ts ana-verify co-change tests (A032, A034) — ✅
- AC13 (plan Build Brief co-change) → agent-proof-context.test.ts ana-plan co-change tests (A033) — ✅
- AC14 (codex mirrors) → agent-proof-context.test.ts codex mirror tests (A033, A034) — ✅
- Tests pass / no build errors / lint clean → sealed full-suite run below — ✅

Contract coverage: **34/34 assertions tagged** (A001–A034 across the suite; A028/A029 by Phase 2 graph tests, A001–A008/A022 by Phase 1). AC3's A014 now also covered by the path-form-mismatch test.

## Implementation Decisions

- **`computeCoChange` takes a 4th `match` parameter.** The spec's signature was `(entries, queryFile, graph)` and said "reuse `fileMatches`, do not introduce a second matcher." `proofSummary.ts` imports `computeCoChange`, so having the engine import `fileMatches` back from `proofSummary` would be a runtime circular import. I instead exported `fileMatches` and inject it as `match: FileMatcher` — one matcher, no cycle, engine stays fully decoupled and unit-testable. The fix cycle extended this principle to suppression (see Deviations).
- **Capping lives in the renderer, not the engine.** `computeCoChange` returns the full ordered partner list plus `total`; `formatContextResult` applies the top-3 cap and the "top N of M" footer. This mirrors Phase 1's `shaped_by` render cap and keeps `total` meaningful for the footer.
- **`getProofContext` no longer short-circuits on a missing chain; `handleProofContext` bails only when BOTH chain and graph are absent.** Required for AC2b/A013 — the day-1 import layer must render on a fresh repo (graph present, no proof chain). The JSON path falls back to an empty-chain envelope so it never throws on a missing file.
- **`also_changes_with` is omitted entirely when neither layer has content** (AC7/AC8): old callers and the JSON shape are unaffected.

## Deviations from Contract

None — all 34 contract assertions are satisfied. Two spec-text ambiguities were resolved (recorded here because the spec instructs documenting ambiguity resolutions):

### A014 / AC3: same-stem test-partner suppression heuristic
**Ambiguity:** The spec said match on "basename stem equality … and shared directory-or-suffix." This repo keeps tests in a **parallel `tests/` tree** (`tests/commands/work.test.ts`), not co-located with `src/commands/work.ts`, so a literal directory-equality check would NOT suppress the test partner — contradicting the spec's own mockup.
**Chosen:** Normalize the `src/`↔`tests/` mirror (strip the `.test`/`.spec` infix and collapse `src`/`tests`/`test`/`__tests__` segments), then — as of the fix cycle — compare the normalized forms with the injected `fileMatches` matcher rather than exact string equality.
**Why / Outcome:** The AC3 intent — "a file's own test file is not listed as something that changes with it" — is now met across **all** plausible CLI invocations, not just aligned path forms. Verified live: `top 3 of 39` + suppression note for a package-relative query whose stored partners are repo-relative.

### A014 / AC3 (fix cycle): final comparison routed through the pairing matcher
**Instead:** The normalized exact-equality (`normalizeForTestMatch(query) === normalizeForTestMatch(partner)`) is replaced by `match(normalizeForTestMatch(partner), normalizeForTestMatch(query))` — the same `fileMatches` used for pairing.
**Reason:** A divergent second comparison made suppression prefix-sensitive while pairing was suffix-tolerant; differing query/partner path forms leaked the query's own test file (verify_report_3 blocker). The spec gotcha explicitly warned against a second matcher.
**Outcome:** Suppression is now exactly as path-tolerant as pairing; the `/`-boundary in `fileMatches` still keeps genuinely different modules distinct (`src/x/index.ts` ≠ `src/y/index.test.ts`). Backed by red-before/green-after tests.

## Test Results

### Baseline (this fix cycle, before changes — branch state from verify_report_3)
Command: `cd packages/cli && pnpm vitest run tests/engine/analyzers/proof-history.test.ts`
```
Test Files  1 passed (1)
      Tests  22 passed (22)
```
New test added → confirmed RED before the fix:
```
× suppresses the test partner when the query path form differs from the stored partner
AssertionError: expected false to be true
```

### After Changes
Command: `ana test --stage build --slug proof-context-intelligence` (`pnpm run test -- --run`)
```
counts: 4069 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=proof-context-intelligence counts=4069p/0f/2s verdict=pass sha256=b9b83f66ffa0f9740a4b73b9d612d0f2505df232cc9f9cb64587f8328366473c -->

Scoped re-run after fix: `proof-history.test.ts` → 23 passed (was 22; +1 new case green).

### Comparison
- Tests added this cycle: **+1** (4068 → 4069) — the path-form-mismatch suppression case.
- Tests removed: **0**.
- Regressions: **none**. All existing suppression cases (co-located mirror, `.spec`, parallel `tests/` tree, different-stem NOT suppressed, different-module NOT suppressed) still pass unchanged.

## Verification Commands
```
pnpm run build
(cd 'packages/cli' && pnpm vitest run tests/engine/analyzers/proof-history.test.ts)
(cd 'packages/cli' && pnpm vitest run tests/commands/proof.test.ts tests/utils/proofSummary.test.ts tests/templates/agent-proof-context.test.ts)
pnpm run test -- --run
pnpm run lint
```
Manual smoke (live chain, from `packages/cli`): `node dist/index.js proof context src/utils/proofSummary.ts` → "Also changes with" renders `top 3 of 39` with `(note: same-stem test partner suppressed)`; the query's own `tests/utils/proofSummary.test.ts` is absent.

## Git History
```
75b2cf06 [proof-context-intelligence:s3] Fix: suppress test partner across differing path forms
7c1fb5ee [proof-context-intelligence:s3] Suppress test partners across parallel test trees
563ec278 [proof-context-intelligence:s3] Fix: realistic timeout for two-init propagation test
9c83ddb5 [proof-context-intelligence:s3] Co-change template guidance (.claude + .codex)
35cc0d3c [proof-context-intelligence:s3] Assemble + render Also changes with
6dfb628a [proof-context-intelligence:s3] Add computeCoChange proof co-change engine
```

## Open Issues

- **Suppression tolerance now matches pairing tolerance — including pairing's bare-basename edge.** Routing the comparison through `fileMatches` means a query whose normalized form collapses to a single bare segment (e.g. a top-level `src/index.ts` → `index.ts`) could, in principle, match a same-basename test in a different module via fileMatches' suffix/legacy-basename rules. This is the *same* tolerance pairing already has (the verify report explicitly asked suppression to match pairing), and the `/`-boundary protects all multi-segment paths. Severity: observation. Suggested action: monitor.
- **Pre-existing lint warning in `src/utils/git-operations.ts:198`** (unused eslint-disable directive) — not my file, not introduced by this build; surfaces on every lint run. The website package also has 2 unrelated unused-var warnings. 0 errors overall. Severity: observation. Suggested action: acknowledge.
- **Day-1 import layer depends on `code-graph.json`, which is not present in this worktree.** The graph is written at `ana init`/scan (Phase 2) and is not committed, so in the current worktree all proof partners render as `unknown` and no `Imported by:`/`Imports:` layer appears for the live command. This is correct fail-soft behaviour (verified), but means the graph-dependent paths (relation flags, import layer) are exercised only by tests that write a fixture graph, not by the live repo right now. Severity: observation. Suggested action: monitor.
- **Pre-existing under-budgeted timeout pattern in `template-propagation.test.ts`** (fixed for one test in the first build cycle by raising its budget to 30s; other multi-subprocess init tests in the file may share the pattern). Severity: debt. Suggested action: monitor.
- **`also_changes_with` is recomputed per query inside `getProofContext`'s map** (touch counts walk all entries per query). For the typical 1–3 file queries this is negligible; a query of dozens of files against a large chain would be O(files × entries). Severity: observation. Suggested action: monitor.

Second pass — re-examined for anything noticed-but-unwritten: the fix-cycle matcher change is documented in Fix History + Deviations; the bare-basename tolerance edge it introduces is the first Open Issue above; the unchanged "different module NOT suppressed" guard was confirmed still green; no contract edits were made (sealed). The new test was confirmed red-before/green-after. Nothing further surfaced. Verified complete by second pass.
