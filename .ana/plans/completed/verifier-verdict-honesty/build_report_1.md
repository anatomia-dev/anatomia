# Build Report: Verifier Verdict Honesty — Phase 1 (Components 1 + 2)

**Created by:** AnaBuild
**Date:** 2026-06-16
**Spec:** .ana/plans/active/verifier-verdict-honesty/spec-1.md
**Branch:** feature/verifier-verdict-honesty

> Phase 1 of 2. This phase covers contract assertions **A001–A020** (Components 1
> and 2). A021–A031 (Component 3, the deterministic read-build-report veto) are
> Phase 2's scope (spec-2.md) and are intentionally untouched here.

## What Was Built

### Component 1 — prompt de-contradiction
- `packages/cli/templates/.claude/agents/ana-verify.md` (modified): removed the two
  "check the build report for coverage claims" read-licenses (the UNSATISFIED bullet
  and the no-tagged-test paragraph). Kept the prohibition (`never read the build
  report`), the source-inspection fallback, and the "which you haven't read"
  reinforcements untouched.
- `packages/cli/templates/.codex/agents/ana-verify.md` (modified): same two deletions,
  located by content (identical prose to the claude master).
- `.claude/agents/ana-verify.md` (modified): dogfood copy synced byte-identical to its master.
- `.codex/agents/ana-verify.md` (modified): dogfood copy synced byte-identical to its master.
- `packages/cli/tests/templates/agent-proof-context.test.ts` (modified): added a
  dedicated describe block with tests for A001–A005 (no license in either master,
  prohibition kept, source-inspection kept, both dogfood copies byte-match).

### Component 2 — one verdict function
- `packages/cli/src/utils/verdict.ts` (created): the single verdict source. Exports
  `RESULT_HEADLINE_PATTERN`, `VerdictResult`, and `deriveVerdict(content)` — scrape
  the headline, cross-check against the `## Contract Compliance` table, coerce a
  contradicted PASS → FAIL with one reason per UNSATISFIED row. Content-only (no
  companion-file reads); findings are deliberately excluded as a coercion signal.
  JSDoc carries the honesty boundary verbatim.
- `packages/cli/src/utils/proofSummary.ts` (modified): exported `parseComplianceTable`;
  replaced the `parseResult` call site in `buildProofSummary` with `deriveVerdict`,
  carrying `contradictions` onto the proof summary; deleted the dead `parseResult`;
  added the additive `verdict_contradictions?: string[]` field to `ProofSummary`.
- `packages/cli/src/types/proof.ts` (modified): added additive optional
  `verdict_contradictions?: string[]` to `ProofChainEntry`.
- `packages/cli/src/commands/work-state.ts` (modified): `getVerifyResult` is now a thin
  wrapper over `deriveVerdict` (UNKNOWN → lowercase `'unknown'` preserved).
- `packages/cli/src/commands/artifact.ts` (modified): `readLocalVerifyResult` routes
  through `deriveVerdict` (UNKNOWN → `'unknown'`); exported for testability.
- `packages/cli/src/commands/pr.ts` (modified): `extractVerifyResult` routes through
  `deriveVerdict` (UNKNOWN → `null` preserved); exported for testability.
- `packages/cli/src/commands/work.ts` (modified): the three inline
  `/\*\*Result:\*\*\s*FAIL/i.test(content)` FAIL-checks now use
  `deriveVerdict(content).result === 'FAIL'`; the per-phase guard passes
  `deriveVerdict(...).contradictions` into `guardFailResult`.
- `packages/cli/src/commands/work-proof.ts` (modified): `guardFailResult` gained an
  optional `contradictions?` param that lists each reason instead of the generic
  FAIL line; both call sites (writeProofChain guard + per-phase guard) pass the
  reasons; the proof entry carries `verdict_contradictions` when present.
- `packages/cli/src/commands/artifact-validators.ts` (modified): `validateVerifyReportFormat`
  stays a presence-only validator; it now imports the shared `RESULT_HEADLINE_PATTERN`
  instead of redeclaring the regex.
- `packages/cli/tests/utils/verdict.test.ts` (created): table-driven coverage of
  `deriveVerdict`, the routing wrappers, `validateVerifyReportFormat`, and the
  honesty-boundary source doc.
- `packages/cli/tests/commands/work-proof-guard.test.ts` (created): `guardFailResult`
  message coverage.

## PR Summary

- Removes the contradictory instruction in the `ana-verify` agent definition that
  both forbade and ordered reading the build report — the verifier now has a single,
  clean "never read the build report" obligation (both Claude and Codex harnesses).
- Collapses six duplicated `**Result:**` headline scrapes into one `deriveVerdict()`
  function in `utils/verdict.ts`, killing regex drift.
- The verdict now cross-checks the self-authored PASS/FAIL headline against the
  verifier's own Contract Compliance table and coerces a PASS that sits over an
  UNSATISFIED row to FAIL — the verdict is no longer one-word-forgeable.
- The coercion is observable, not silent: the contradicting row is named in the
  `ana work complete` guard message and recorded on the proof entry
  (`verdict_contradictions`).
- Honesty boundary kept explicit in code: not one-word-forgeable, still
  self-authored — deliberately not claimed to make the agent unable to lie.

## Acceptance Criteria Coverage

- AC1 "no build-report license; prohibition remains" → agent-proof-context.test.ts
  "no longer licenses reading the build report" (claude + codex) + "keeps the
  never-read-the-build-report prohibition" (A001/A002/A003).
- AC2 "source-inspection fallback survives" → agent-proof-context.test.ts "keeps the
  source-inspection fallback for untested assertions" (A004); both masters retain
  multiple "source inspection" references.
- AC3 "exactly one function parses the headline; parseResult deleted" → verdict.test.ts
  "the old duplicate parseResult is gone from proofSummary" (A016) + routing tests
  (A013/A014/A015); src sweep confirms no other `**Result:**` scrape remains.
- AC4 "coerce PASS→FAIL iff UNSATISFIED row; clean PASS stays PASS; findings excluded"
  → verdict.test.ts deriveVerdict block (A006/A007/A008) + "trusts a PASS headline
  when there is no compliance table".
- AC5 "contradiction surfaced in guard message AND on proof entry" → work-proof-guard.test.ts
  "prints each contradiction reason" (A017); proof entry carries `verdict_contradictions`
  (type + writeProofChain wiring, verified by source inspection — no proof-chain
  integration fixture in this phase).
- AC6 "honesty framing present in JSDoc; no 'can't lie'" → verdict.test.ts honesty
  boundary source block (A019/A020).
- AC7 "build regenerates dist; full suite green; lint clean" → see Test Results +
  Verification Commands. ✅

## Implementation Decisions

- **`deriveVerdict` name kept despite a collision.** `utils/capture-runner.ts` already
  exports an unrelated `deriveVerdict(counts, exitCode)`. The spec output mockup and
  the contract targets (`deriveVerdict.cleanPass.result`, etc.) hardcode the name for
  the verify-report function, so I kept it. The two live in different modules and no
  file imports both, so there is no compile conflict. Recorded as an Open Issue.
- **Exported two previously-private routing functions.** `readLocalVerifyResult`
  (artifact.ts) and `extractVerifyResult` (pr.ts) were private and untested. The
  contract asserts their behavior (A014/A015), and the spec's testing strategy calls
  for "one fixture, three callers." I exported them so each gets a direct tagged test
  rather than only indirect coverage. Minimal surface widening; noted as an Open Issue.
- **`verdict_contradictions` threaded summary → entry as a spread-when-present field.**
  Matches the additive, undefined-safe convention used for `commit_hygiene`/`process`/
  `compliance` in `ProofChainEntry`, so old entries and clean verdicts simply omit it.
- **Line numbers re-derived at build time** as the spec instructed: claude master
  licenses were at `:216`/`:233` (not `:209`/`:226`); `parseResult` was at
  proofSummary `:213`; `parseComplianceTable` at `:168`.

## Deviations from Contract

None — contract followed exactly for A001–A020. (A009/A010 were already removed by
AnaPlan; A021–A031 are Phase 2 scope and out of scope here.)

The two exports noted above are implementation choices in service of the contract's
own testing requirement, not deviations from any assertion's target/matcher/value.

## Test Results

### Baseline (before changes)
Command: `pnpm run test -- --run`
```
Test Files  159 passed (159)
     Tests  3797 passed | 2 skipped (3799)
```

### After Changes
Command (sealed): `ana test --stage build --slug verifier-verdict-honesty`
```
✓ captured  counts: 3826 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=verifier-verdict-honesty counts=3826p/0f/2s verdict=pass sha256=fc1629ebe79a129d6e05193800bf9beb0528c25b82fe6fcee14421f560f36b76 -->

### Comparison
- Tests added: 29 (verdict.test.ts: 20, work-proof-guard.test.ts: 4, agent-proof-context.test.ts: 5)
- Tests removed: 0
- Regressions: none (0 failed; skipped count unchanged at 2)

### New Tests Written
- `tests/utils/verdict.test.ts`: deriveVerdict table (clean PASS, coerced PASS→FAIL,
  per-row reasons, multi-row, FAIL headline, UNKNOWN/empty, no-table backward-compat);
  RESULT_HEADLINE_PATTERN statelessness; routing through getVerifyResult /
  extractVerifyResult / readLocalVerifyResult; validateVerifyReportFormat presence
  check; honesty-boundary + parseResult-removed source assertions.
- `tests/commands/work-proof-guard.test.ts`: guardFailResult — PASS no-op, generic
  FAIL message, contradiction-reason message, context label.
- `tests/templates/agent-proof-context.test.ts` (additions): license removed in both
  masters, prohibition kept, source-inspection kept, both dogfood copies byte-match.

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run tests/templates tests/utils/verdict.test.ts tests/commands/work-proof-guard.test.ts)
pnpm run test -- --run
pnpm run lint
```

## Git History
```
1a35e28a [verifier-verdict-honesty] Component 2: one verdict function, cross-checks the table
aecda8c2 [verifier-verdict-honesty] Component 1: remove build-report read license from ana-verify
```

## Open Issues

1. **`deriveVerdict` name collision** with the unrelated function in
   `utils/capture-runner.ts`. No compile conflict (separate modules, no shared
   importer); name dictated by spec/contract. Observation — monitor.
2. **Function-only circular import** between `utils/verdict.ts` and
   `utils/proofSummary.ts` (and the pre-existing `proofSummary ↔ artifact-validators`
   cycle that verdict now sits in). ESM-safe because the symbols are only used inside
   function bodies; build/typecheck/suite all green. Debt — monitor; a future
   top-level use of an imported symbol in any of these modules would break load order.
3. **Two routing functions exported** (`readLocalVerifyResult`, `extractVerifyResult`)
   purely for testability of A014/A015. Slight surface widening. Observation —
   acknowledge.
4. **Source-content tests for A016/A019/A020** read the .ts files and assert on
   substrings; inherently fragile to benign rewording. They cover the contains/
   not_contains intent faithfully. Observation — monitor.
5. **Pre-existing lint warning** in `src/utils/git-operations.ts:198` (unused
   eslint-disable directive) — not introduced by this build, only a warning. Observation.

Second pass — what I noticed but had not written down:
- AC5's proof-entry half (`verdict_contradictions` actually rendering on a proof card)
  is verified by source inspection and the type/wiring, not by an end-to-end
  proof-chain fixture; there is no integration test in this phase that completes work
  with a coerced-PASS report and asserts the field lands in `proof_chain.json`. The
  guard-message half IS unit-tested (A017). Flagging so the verifier assesses whether
  source-level evidence is sufficient for the "on the proof entry" clause.

Added that item above. The remaining list is otherwise complete.
