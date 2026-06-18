# Build Report: Proof-Context "why" — Phase 1 (`shaped_by` + `ana proof <slug> --why` + adoption)

**Created by:** AnaBuild
**Date:** 2026-06-18
**Spec:** .ana/plans/active/proof-context-intelligence/spec-1.md
**Branch:** feature/proof-context-intelligence

## What Was Built

### Engine
- **packages/cli/src/utils/proofSummary.ts** (modified): Added optional `shaped_by?` field to `ProofContextResult` (array of `{ slug, kind?, completed_at, scope_summary }`). Widened the `ProofChainEntryForContext` minimal projection to read `slug?`, `kind?`, `scope_summary?`. In the existing `getProofContext` per-entry loop, every entry that touches the queried file (`entryTouches`) now pushes a shaped-by row; after the loop the list is sorted most-recent-first by `completed_at` desc and assigned only when non-empty (so old callers' JSON shape is unaffected). All optional reads guarded (`entry.slug ?? ''`, `entry.scope_summary ?? ''`, `kind` only when defined).

### Command / render
- **packages/cli/src/commands/proof.ts** (modified):
  - `formatContextResult` renders a **Shaped by** section after the header, before Findings — capped at top 3, each row `✓ {slug} ({kind · date})` with the raw `scope_summary` truncated via the existing `truncateSummary` (cap 140). A gating footer `N more — drill a specific one with \`ana proof <slug> --why\`` appears only when >3 shapers exist. `hasData` now also accounts for shapers.
  - New exported `formatWhy(entry)` renderer — the signal-only `--why` view: header, **Scope** (raw `scope_summary`), **Assertions needing attention** (exceptional-only loop with deviation reasons, or "✓ all N satisfied"), **Open findings** (active only), **Modules touched**. Built as an omission renderer (renders only allowed fields) so cost/hashes/timing/provenance can never leak in by default.
  - Added `--why` boolean option to the `ana proof <slug>` command and threaded it through `handleProofList` into both non-JSON detail render points (`<slug>` and `--last`). JSON output is untouched (`--why` only affects human render).

### Adoption (templates + dogfood mirrors)
- **templates/.claude/agents/ana.md** + **templates/.codex/agents/ana.md** (modified): Scope step 3 makes `ana proof context {files}` non-optional for scopes touching existing code, seeded by identified files, framing **Shaped by** as "why this file is the way it is" orientation.
- **templates/.claude/agents/ana-verify.md** + **templates/.codex/agents/ana-verify.md** (modified): Dropped the "context, not a checklist" hedge; added that Shaped-by history is orientation only and that Verify forms findings **independently** (protects the two-account model).
- **templates/.claude/agents/ana-plan.md** + **templates/.codex/agents/ana-plan.md** (modified): Noted that `shaped_by` orients the architect on intent history (co-change partners deferred to Phase 3 per spec).
- **.claude/agents/{ana,ana-plan,ana-verify}.md** + **.codex/agents/{ana,ana-plan,ana-verify}.md** (modified): Dogfood copies synced byte-for-byte to the templates (required by the repo's dogfood-sync invariant test — see Deviations).

### Tests
- **packages/cli/tests/utils/proofSummary.test.ts** (modified): +7 unit tests — `getProofContext shaped_by` describe block.
- **packages/cli/tests/commands/proof.test.ts** (modified): +10 render/`--why` tests (Shaped by section, footer/cap/recency, exactly-3, truncation, no-history omission, `--why` signal + omission, full-card-without-why).
- **packages/cli/tests/templates/agent-proof-context.test.ts** (modified): +4 tagged Phase-1 adoption assertions (A030/A031/A032/A034).

## PR Summary

- `ana proof context {file}` now shows a **Shaped by** section — the verified work items that made each file the way it is (slug · kind · date + intent), most-recent-first, capped at the top 3 with a `--why` drill-down footer when more exist.
- New `ana proof <slug> --why` renders a signal-only view — scope intent, exceptional assertions with reasons, open findings, and modules touched — deliberately omitting cost, token counts, sha256 hashes, timing, and provenance. It's the cheap drill-down the Shaped-by footer points to (the two ship together by design).
- `shaped_by` is an additive optional field on `ProofContextResult`; the JSON shape and all existing fields are unaffected, and absence is honest (no chain → no section).
- Agent templates now make `ana proof context` a non-optional scoping step, drop the "context, not a checklist" hedge in Verify while reaffirming independent findings, and note intent-history in Plan's Build Brief — mirrored across `.codex` and the byte-identical dogfood copies.
- 21 new tests; full suite 4003 passing, 0 failures, 2 pre-existing skips.

## Acceptance Criteria Coverage

- AC1 "Shaped by section, top-3, --why footer" → proof.test.ts "renders Shaped by with slug and truncated scope summary" + "shows a --why drill-down footer when more than 3 shapers exist" + "caps the shaped-by list at 3" (A003, A004); engine ordering proofSummary.test.ts "produces a shaped_by row…" + "orders shaped_by rows most-recent-first" (A001, A002) ✅
- AC6 "--why signal only, omits cost/hashes/timing/provenance" → proof.test.ts "renders scope intent and modules touched" + "renders a deviated assertion with its reason" + "omits provenance, timing, cost, and hashes" (A005, A006, A007) ✅
- AC9 "scope_summary truncated, raw" → proof.test.ts "truncates a long scope summary, never dumping past the cap" (A008) ✅
- AC11 "ana.md non-optional proof context" → agent-proof-context.test.ts "ana.md instructs running ana proof context as a non-optional scope step" (A030) ✅
- AC12 partial "drop hedge, independent findings" → agent-proof-context.test.ts "ana-verify.md drops the 'context, not a checklist' hedge" + "reaffirms forming findings independently" (A031, A032) ✅
- AC14 partial ".codex mirrors" → agent-proof-context.test.ts "codex ana-verify mirror carries the independence framing" (A034); dogfood byte-for-byte tests ✅
- "shaped_by optional, old callers unaffected" (AC8) → proofSummary.test.ts "leaves existing touch_count and findings fields intact" + "omits shaped_by when there is no proof chain" (A024, A025) ✅
- "no chain → Shaped by absent" (AC7) → proofSummary.test.ts "omits shaped_by entirely when no entry touches" + proof.test.ts "does not render Shaped by when no entry touches the file" (A022) ✅
- "tests pass, build clean, lint clean" → 4003 passing; `pnpm run build` ✓; `eslint` on changed files exit 0 ✅

## Contract Coverage

Phase 1 owns assertions **A001–A008, A022, A024, A025, A030, A031, A032, A034** (14). All 14 are tagged with `// @ana {ID}` on new tests. The remaining contract assertions (A009–A021, A023, A026–A029, A033) belong to Phases 2 and 3 (co-change layer, import graph, init graph write, plan co-change Build Brief) and are intentionally not addressed here — the spec defers them.

Contract coverage (this phase): **14/14 Phase-1 assertions tagged.**

## Implementation Decisions

- **Shaper inclusion = `entryTouches`.** Per spec, a "shaper" is any proof entry whose finding or build-concern matches the queried file (the existing `entryTouches` signal that already drives `touch_count`). This keeps the Shaped-by count consistent with the touch count and avoids introducing a second, divergent notion of "touched."
- **`formatWhy` as a separate exported function** (not a `why?` flag on `formatHumanReadable`). The spec preferred this so the full renderer stays untouched and the omission set is explicit by construction — `--why` renders nothing it shouldn't because it only ever pushes the allowed lines.
- **Truncation cap = 140 chars** for `scope_summary` in both Shaped by and `formatWhy` open-findings summaries — matches the ~2-line budget in the spec's mockup; uses the existing `truncateSummary` word-boundary helper unchanged.
- **`--why` honored in both the `<slug>` and `--last` detail paths**, JSON unaffected. `--last --why` renders the most-recent entry's why view, which is a natural, low-cost extension of the detail branch.
- **Open findings in `--why` = active only** (`!status || status === 'active'`), mirroring `getProofContext`'s own active-filter semantics so "open" means the same thing everywhere.

## Deviations from Contract

### Dogfood agent copies modified beyond the spec's File Changes list
**Instead:** Also edited `.claude/agents/{ana,ana-plan,ana-verify}.md` and `.codex/agents/{ana,ana-plan,ana-verify}.md` (6 repo-root dogfood files) in addition to the `templates/` copies the spec listed.
**Reason:** The repo enforces a dogfood-sync invariant — `tests/templates/agent-proof-context.test.ts` asserts the root agent definitions match the shipped templates byte-for-byte. Editing only the templates broke 2 tests. The spec's File Changes omitted the dogfood copies, but the invariant requires them in lockstep.
**Outcome:** Functionally required, not a scope expansion — same text, byte-identical mirror. Suite green. Flagged so the developer/verifier sees the file set is larger than the spec listed.

Otherwise: contract followed exactly for the Phase-1 assertions.

## Test Results

### Baseline (before changes)
Command: `(cd packages/cli && pnpm vitest run)`
```
Test Files  171 passed (171)
     Tests  3982 passed | 2 skipped (3984)
```

### After Changes (sealed)
Command: `ana test --stage build --slug proof-context-intelligence`
```
✓ captured  counts: 4003 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=proof-context-intelligence counts=4003p/0f/2s verdict=pass sha256=66e0280470b4c7cd1fa6dd15870c24fa493ac757578fa3d4ea1247c13fd3b0fd -->

### Comparison
- Tests added: 21 (7 engine + 10 render/--why + 4 template adoption)
- Tests removed: 0
- Regressions: none (0 failed; the 2 skips are pre-existing)

### New Tests Written
- `tests/utils/proofSummary.test.ts` — `getProofContext shaped_by`: row shape (slug/kind/date/summary), recency ordering, absence when untouched, absence with no chain, legacy entry without scope_summary, existing-fields-intact, build-concern-only shaper.
- `tests/commands/proof.test.ts` — Shaped by render, footer when >3, cap-at-3 + recency order, no footer at exactly 3, scope-summary truncation (SENTINEL past cap), no-history omission; `--why` scope+modules, deviated-assertion reason, omission of provenance/timing/cost/hashes; full card retains Timing without `--why`.
- `tests/templates/agent-proof-context.test.ts` — A030 (non-optional `ana proof context`), A031 (hedge removed), A032 (independent findings), A034 (codex mirror independence).

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts tests/commands/proof.test.ts tests/templates/agent-proof-context.test.ts)
(cd packages/cli && pnpm vitest run)              # full suite: 4003 passed, 2 skipped
(cd packages/cli && npx eslint src/utils/proofSummary.ts src/commands/proof.ts)
```

## Git History
```
efff3385 [proof-context-intelligence:s1] Test proof-context adoption framing
168053cc [proof-context-intelligence:s1] Adoption: proof-context template guidance
99443864 [proof-context-intelligence:s1] Render Shaped by section and ana proof --why
43dc3cee [proof-context-intelligence:s1] Add shaped_by to proof context engine
```

## Open Issues

1. **Stale `@ana` tags from a prior contract collide with this contract's IDs.** `tests/commands/proof.test.ts`, `tests/utils/proofSummary.test.ts`, and `tests/templates/agent-proof-context.test.ts` already carry `// @ana A001`–`A024` tags from an *earlier* feature's contract, where those IDs meant different things (e.g. A001 there tags a finding-ID test, not shaped_by). Per the guardrail I did not modify existing tests' tags. My new Phase-1 tests carry the *current* contract's IDs with correct semantics. The verifier should read tag→assertion mapping from the NEW tests only; the pre-existing tags are not about this contract. Severity: observation. Suggested action: monitor (a future learn pass could decide whether to retag or namespace tags per contract).

2. **Spec File Changes list was incomplete — dogfood copies not listed.** The 6 repo-root `.claude`/`.codex` agent files had to be edited to satisfy the byte-for-byte dogfood-sync test, but the spec only listed the `templates/` copies. Captured as a Deviation above. Severity: debt. Suggested action: scope (Plan should list dogfood mirrors whenever it lists template edits, or the invariant should be documented in the Build Brief).

3. **`scope_summary` line-wrapping in the terminal.** The truncated 140-char summary can wrap to a second physical line in narrow terminals (visible in the smoke test). This is terminal soft-wrap, not a render bug, and matches the spec mockup's ~2-line budget. Severity: observation. Suggested action: acknowledge.

Forced second pass — re-checked for unlisted concerns: no unused imports/params introduced (eslint clean), `--why` omission set verified by an explicit no-64-hex/no-`$`/no-Provenance/no-Timing assertion, legacy/no-chain/concern-only edge cases all covered, JSON shape proven unaffected. The three items above are the complete set.
