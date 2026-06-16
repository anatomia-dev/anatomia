# Scope: Verifier Verdict Honesty (light) — the PASS/FAIL verdict stops grading itself

**Created by:** Ana
**Date:** 2026-06-16

## Intent

Make Anatomia's PASS/FAIL verdict mean what the product says it means. Today the headline
verdict is regex-scraped from a prose `**Result:**` line the verify *model* typed — so the
brand claim ("trust the bytes, not the model") is, at the verdict itself, still
trust-the-model. The whole product is positioned on "Verify never grades its own homework";
the verdict is the one place that promise is currently only *hoped*.

This is the LIGHT tier: three reinforcing fixes on the **same** claim. It is explicitly **NOT**
the heavy per-assertion-status `verify_data.yaml` schema rewrite (that tier is deferred — see
Rejected Approaches / Out of Scope).

Honesty bar (carried into the artifacts verbatim): this is a verification tool's own verdict,
on a resume that says you build verification tools. Component 3's veto makes the verdict
trust-the-bytes for the **one process claim it gates**. Component 2 makes the verdict
**not one-word-forgeable** — it does **NOT** make it "the agent can't lie." The verdict is
still self-authored. The scope, spec, and proof must say exactly that and never overclaim.

## Complexity Assessment

- **Kind:** feature
- **Size:** large
- **Surface:** cli
- **Files affected:**
  - **Component 1 — prompt contradiction (6 byte-identical copies of `ana-verify.md`):**
    - `packages/cli/templates/.claude/agents/ana-verify.md` (master)
    - `packages/cli/templates/.codex/agents/ana-verify.md` (master)
    - `packages/cli/dist/templates/.claude/...` + `.codex/...` (rebuilt from masters)
    - `.claude/agents/ana-verify.md` + `.codex/agents/ana-verify.md` (dogfood — synced)
  - **Component 2 — headline-consistency verdict function (the dedup target, full enumeration):**
    - `packages/cli/src/utils/proofSummary.ts` — `parseResult()` (`:189`, regex `:190`); table-status
      parse (`:172`) and `contract.unsatisfied` derivation (`:1026`) supply the contradiction signal
    - `packages/cli/src/commands/work-state.ts` — `getVerifyResult()` (`:141`, regex `:142`)
    - `packages/cli/src/commands/artifact.ts` — `readLocalVerifyResult()` (`:580`, regex `:583`)
    - `packages/cli/src/commands/pr.ts` — inline match (`:43`)
    - `packages/cli/src/commands/artifact-validators.ts` — presence validator (`:124`) — *consumes*
      the verdict, distinct intent (validates the line exists); reconcile, do not naively fold
    - `packages/cli/src/commands/work.ts` — FAIL-only inline forms (`:1341`, `:1527`, `:1534`)
    - `packages/cli/src/commands/work-proof.ts` — `guardFailResult()` (`:193`, called `:290`) —
      *consumes* an already-parsed result string
    - new home for the single verdict function (likely `work-state.ts` or a small `verdict.ts`) — Plan decides
  - **Component 3 — deterministic veto (forward-only):**
    - `packages/cli/src/utils/compliance.ts` — today emits the record as EVIDENCE (`:22-23` docstring is the
      explicit "never a gate" contract)
    - `packages/cli/src/commands/proof.ts` — `renderSessionAttestation` (`:574`); the "evidence, never a
      gate" rendering (`:565-567`, `:607`, `:637`)
    - the proof-sealing / verdict path (`work-proof.ts` `guardFailResult`/entry construction, `artifact.ts`
      verdict read) — where a deterministic `violated` must force-FAIL
    - `packages/cli/package.json` — anatrace-core pin (lands via `anatrace-pin-0-4-0`, not this item)
- **Blast radius:** Heavy file overlap with `verifier-intent-coverage` (in plan ahead of us) — it edits
  `ana-verify.md`, `proofSummary.ts`, `artifact-validators.ts`, `proof.ts`, `work-proof.ts`. **Every
  file:line in this scope is a hint, not a fact** — re-derive against live source at build time, after
  both `verifier-intent-coverage` and `anatrace-pin-0-4-0` land. Component 1 is prompt-only (low risk,
  guarded by a byte-identity test). Component 2 is a pure refactor + one new cross-check (no schema, no
  migration). Component 3 changes a gate decision and is forward-only, so no historical re-baselining.
- **Estimated effort:** Spec 1 ~0.5–1 day. Spec 2 ~1–2 days *after* the go/no-go check clears (the
  empirical adapter check is the real work; the gate wiring is small).
- **Multi-phase:** yes

## Approach

Three reinforcing components on one claim — the verdict. Sequenced as **two specs, risk-aligned**, so
the anatomia-only work ships independently of the anatrace dependency.

**Spec 1 — Components 1 + 2 (pure anatomia, no anatrace dependency).**
- *Component 1 — remove the contradiction.* `ana-verify.md` both forbids reading the build report
  (`:30`, `:503`) and orders it (`:209`, `:226` "check the build report for coverage claims"). Delete the
  `:209`/`:226` license; keep `:30`/`:503`. The agent-def becomes internally consistent: "never read the
  build report," full stop. This **preserves** Verify's independence — do not weaken Verify's scrutiny;
  the UNSATISFIED-by-source-inspection path stays, only the build-report reference is removed. Edit the two
  `templates/` masters → rebuild `dist/` → sync the two dogfood copies. *(This also strengthens Component
  3: a clean "forbidden" obligation is what lets the adapter emit a clean, gate-eligible claim.)*
- *Component 2 — one verdict function.* Today the verdict is scraped by ≥3 near-duplicate functions plus
  inline forms (enumerated above), each independently trusting one prose line; meanwhile
  `contract.unsatisfied` is derived 100% from the agent-authored compliance **table** (`proofSummary.ts:172
  → :1026`), wholly independent of the headline. Collapse the scrape into ONE verdict function that
  **refuses a PASS headline contradicting an UNSATISFIED table row or a blocker finding.** *The elegant
  solution removes:* three parse functions become one. The honesty line, stated in the function's
  doc and the proof: this makes the verdict **not one-word-forgeable**, it does **not** make it
  un-lie-able — the verdict is still self-authored.

**Spec 2 — Component 3 (deterministic read-build-report veto, forward-only).** anatrace builds the verify
mandate from the agent-def (`compliance.ts` `readMandateBlobs` → `anatomiaAdapter.extract`) and can
deterministically check from the transcript whether the verify session read `build_report.md`. That verdict
is today EVIDENCE, never a gate (`compliance.ts:22-23`). Flip **that one claim** evidence→gate: a
deterministic `violated` on "Verify read the build report" force-FAILs the proof regardless of the prose
headline. This is the component that makes the verdict trust-the-bytes. Keep
`runtime-scoped`/`unverifiable`/`contract-matcher` claims as non-gating evidence.

**The gate-eligibility line — already drawn in the data (anatrace-core 0.4.0 type system):**
- `ClaimStrength = 'forbidden'` → PRESENT ⇒ `violated`, absent ⇒ `satisfied` (`index.d.mts:443`,
  `:449`). Default `optional` NEVER produces `violated`. "Never read the build report" is a `forbidden`
  obligation.
- `PredicateTarget = 'read-paths'` (`:383`); `PredicateScope = 'transcript'` (mechanical, counted) vs
  `'runtime'` (⇒ `unverifiable`, not counted) (`:397`).
- `VerdictStatus = 'satisfied' | 'violated' | 'unverifiable'` (`:753`); `VerdictReason` is a closed vocab
  (`:760`) — gate only on the deterministic reasons (`predicate-matched` / `absent-signal`), never on
  `runtime-scoped` / `routed-to-llm` / `low-confidence`.
- **Gate predicate:** force-FAIL iff a verdict has `status === 'violated'` **AND** a deterministic
  transcript reason **AND** `claim_id` is the allowlisted read-build-report claim. anatrace itself draws
  this line (a MASS file-scope spread is a non-gating `info` Finding, `:757`) — we piggyback on its
  determinism signal, we do not invent one.

## Acceptance Criteria

- **AC1:** `ana-verify.md` no longer contains the `:209`/`:226` "check the build report" license; the
  `:30`/`:503` prohibition remains. All 6 copies are byte-consistent per harness (claude masters/dogfood/dist
  identical; codex masters/dogfood/dist identical) and `tests/templates/agent-proof-context.test.ts` passes.
- **AC2:** Verify's independence and scrutiny are unweakened — the UNSATISFIED-by-source-inspection path
  for untested assertions survives; only the build-report reference is removed.
- **AC3:** Exactly one verdict function parses the `**Result:**` headline; `parseResult`, `getVerifyResult`,
  `readLocalVerifyResult`, the `pr.ts` inline match, and the `work.ts` FAIL-only inline forms
  (`:1341/:1527/:1534`) all route through it. `guardFailResult` and the `artifact-validators` presence check
  are reconciled (they consume the verdict; behavior preserved).
- **AC4:** The verdict function refuses (does not return) a PASS when the compliance table has an UNSATISFIED
  row or a blocker finding is present — a contradicted PASS is surfaced, not silently trusted.
- **AC5:** Component 2's honesty framing is explicit in code doc and proof artifact: "not one-word-forgeable,
  still self-authored" — no "the agent can't lie" claim anywhere.
- **AC6 (Spec 2, gated):** A deterministic `violated` on the allowlisted read-build-report claim
  (`status==='violated'` + deterministic transcript reason + claim id) force-FAILs the proof regardless of
  the prose headline. The veto applies **forward-only**, from the gating version onward.
- **AC7 (Spec 2):** `runtime-scoped`, `unverifiable`, `routed-to-llm`, and `contract-matcher` verdicts remain
  non-gating evidence — the veto gates exactly one claim, nothing wider.
- **AC8 (Spec 2):** Forward-only is documented on the proof/card: "veto applies from version X forward; prior
  verdicts were self-reported and are labeled as such." No historical proof is re-judged.
- **AC9 (publish gate, not a code AC):** No verification pass-rate / green-rate number is published until the
  forward-only-vs-true-rate question is explicitly settled with the developer.

## Edge Cases & Risks

1. **THE go/no-go (Spec 2 linchpin).** The veto hinges on `anatomiaAdapter.extract()` actually emitting the
   build-report prohibition as a **gate-eligible** `forbidden` / `read-paths` / `transcript` claim with a
   **stable id** — not as a predicate-less `intent` claim (which routes to the LLM and gates nothing). That
   adapter lives **inside anatrace-core**, so this is verifiable only empirically, only after 0.4.0 is
   installed. **STOP condition:** if it emits `intent`, do NOT force a gate onto a non-gate-eligible claim —
   file an upstream anatrace finding, ship Spec 1 alone, defer Spec 2 to a fast-follow once the adapter is
   fixed. Bring the adapter-check result back to Ryan the moment `anatrace-pin-0-4-0` merges — that is the
   Component 3 go/no-go.
2. **Component 2 must not over-claim.** The cross-check defeats one-word forgery; it does not make a
   self-authored verdict trustworthy. A verifier that fills the table dishonestly still passes Component 2.
   That residual is exactly what Component 3 (and the deferred heavy tier) address. State the boundary; don't
   paper over it.
3. **Contradicted-PASS handling.** When the headline says PASS but the table has an UNSATISFIED row, the
   function must have a defined, non-silent behavior (surface/refuse, not coerce to FAIL invisibly). Plan
   defines the exact disposition; it must be observable in the proof.
4. **Line-number drift (high).** `proofSummary.ts` is the largest util module (~1285 lines) and high-churn;
   two PRs (`verifier-intent-coverage`, `anatrace-pin-0-4-0`) land ahead. Treat every citation here as a hint
   and re-derive at build time.
5. **`artifact-validators.ts` is a presence validator, not a parser.** It validates the `**Result:**` line
   exists in the first 10 lines (a save-time guard). Folding it into the parse function would conflate two
   intents — reconcile carefully, don't collapse blindly.
6. **Codex parity.** Both `.claude` and `.codex` agent-defs must change together; the veto path must work for
   both harnesses (`compliance.ts` already branches on harness). Never land a claude-only fix.

## Rejected Approaches

- **The heavy per-assertion-status schema rewrite (tier-a).** A `verify_data.yaml` with typed per-assertion
  status, a 5-site YAML repoint, and the ~62-fixture/golden rewrite. Rejected for *this* item: enormous blast
  radius for a marginal honesty gain over the light tier, and it doesn't address the root (a self-graded
  verdict). Deferred to a measured follow-up REQ.
- **Widening the veto to force-push / file-scope (Fork A — rejected).** `command-content` (force-push/rebase)
  is technically gate-eligible, but it gates *conduct*, not verdict-honesty — different claim, heavier
  historical-flip blast radius, and anatrace treats file-scope MASS spread as a non-gating Finding by design.
  Narrow (read-build-report only) fully serves the positioning and is reversible; widening is a deferred
  measured follow-up, not a v1 choice.
- **Retroactive veto / re-baselining (Fork B — rejected, data-forced).** No captured transcripts exist for the
  historical chain — compliance records only begin emitting via `anatrace-pin`. A retroactive veto has nothing
  to check. Forward-only is the only honest option; green-rate stays a publish gate.
- **Broad multi-process-claim gating.** Gating many compliance claims at once. Rejected — start with the one
  claim that makes the verdict trust-the-bytes; widening is measured follow-up.

## Open Questions

- **(Spec 2 blocker, owned by Plan at build time)** Does `anatomiaAdapter.extract()` from the de-contradicted
  `ana-verify.md` emit a gate-eligible `forbidden`/`read-paths`/`transcript` claim with a stable id? This is
  the go/no-go — answerable only after 0.4.0 installs. Not resolvable now (engine not installed).
- **(Owned by Ryan)** The green-rate / pass-rate publish number — settle before any public figure (AC9).
- Exact disposition of a contradicted PASS (surface vs hard-FAIL in Component 2) — Plan decides with the
  verdict-function design; must be observable in the proof.

## Exploration Findings

### Patterns Discovered
- The verdict scrape is one regex `/\*\*Result:\*\*\s*(PASS|FAIL)/i` copied across `proofSummary.ts:190`,
  `pr.ts:43`, `work-state.ts:142`, `artifact-validators.ts:124`, `artifact.ts:583`, with FAIL-only inline
  variants at `work.ts:1341/1527/1534`. Three are named functions (`parseResult`, `getVerifyResult`,
  `readLocalVerifyResult`); `guardFailResult` (`work-proof.ts:193`) consumes the parsed string.
- `contract.unsatisfied` is parsed from the verify report's compliance table at `proofSummary.ts:172`
  (`/(SATISFIED|UNSATISFIED|DEVIATED|UNCOVERED)/i` on the status cell) and counted at `:1026`. Fully
  agent-authored, fully independent of the headline — this is the contradiction signal Component 2 exploits.
- The compliance pipeline: `captureComplianceAtSave` (`compliance.ts:147`) → `readMandateBlobs` (agent-def +
  contract) → `anatomiaAdapter.extract` → `runCompliance` → scrubbed record. `assembleComplianceAttestations`
  reads it at `work complete`. The record is rendered by `renderSessionAttestation` (`proof.ts:574`).

### Constraints Discovered
- [TYPE-VERIFIED] anatrace-core 0.4.0 `ClaimStrength='forbidden'` ⇒ PRESENT→`violated` / absent→`satisfied`
  (`index.d.mts:443/449`); `PredicateScope='transcript'|'runtime'` (`:397`); `read-paths` target (`:383`);
  closed `VerdictReason` vocab (`:760`); `VerdictStatus` (`:753`). The gate-eligibility line lives in the data.
- [OBSERVED] `compliance.ts:22-23` — "The record is EVIDENCE, never a gate: a `violated` verdict is stored and
  rendered but never changes a proof's PASS/FAIL." This is the exact contract Component 3 flips (for one claim).
- [OBSERVED] anatrace-core is pinned at `0.2.0` in `packages/cli/package.json` and is **not installed** in the
  main working tree. 0.4.0 is present only in the `anatrace-pin-0-4-0` worktree's `node_modules`. Component 3
  cannot build until that PR merges.
- [OBSERVED] 6 `ana-verify.md` copies are byte-identical per harness today (verified by sha256). Edit masters →
  rebuild dist → sync dogfood; `tests/templates/agent-proof-context.test.ts` guards drift.

### Test Infrastructure
- `tests/templates/agent-proof-context.test.ts` — guards template/dogfood/dist sync for agent-defs (Component 1).
- `tests/utils/compliance.test.ts`, `tests/commands/proof-compliance-display.test.ts` — compliance capture +
  display (present in the worktree; will exist in main once anatrace-pin lands). Component 3's gate needs new
  tests here, including a fixture transcript where verify reads `build_report.md`.

## For AnaPlan

### Structural Analog
- **Component 3's gate decision:** `guardFailResult` (`work-proof.ts:193`, called `:290`) — the existing
  point where a FAIL result halts the seal. The veto is structurally the same shape: a deterministic signal
  that forces a FAIL. Read it before designing the gate; the veto should converge with, not bypass, this path.
- **Component 2's verdict function:** `getVerifyResult` (`work-state.ts:141`) is the cleanest existing
  parse — the dedup target shape. The new function is this plus the table/blocker cross-check.

### Relevant Code Paths
- `packages/cli/src/utils/compliance.ts` — mandate assembly + `runCompliance`; the evidence-never-gate docstring.
- `packages/cli/src/commands/proof.ts:574` — `renderSessionAttestation` (presentation; "evidence, never a gate").
- `packages/cli/src/utils/proofSummary.ts:172/189/1026` — table-status parse, headline parse, unsatisfied count.
- `.ana/worktrees/anatrace-pin-0-4-0/node_modules/.pnpm/anatrace-core@0.4.0/.../dist/index.d.mts` — the 0.4.0
  type system (read `:280-500`, `:753-771` for the gate-eligibility taxonomy).

### Patterns to Follow
- Edit `templates/` masters, rebuild `dist/`, sync dogfood — never edit dist or dogfood directly.
- Gate on anatrace's own determinism signal (`status==='violated'` + deterministic reason + allowlisted id) —
  do not re-derive determinism in anatomia.

### Known Gotchas
- `proofSummary.ts` line numbers WILL move (high-churn, two PRs ahead). Re-derive at build time.
- `artifact-validators.ts` is a presence validator, not a parser — reconcile, don't naively fold.
- Both harnesses (`.claude` + `.codex`) must change in lockstep.

### Things to Investigate (design judgment — not factual lookups)
- **(Go/no-go)** Empirically confirm `anatomiaAdapter.extract()` emits a gate-eligible read-build-report claim
  (not `intent`) once 0.4.0 installs. Drives the entire Spec 2 build-or-defer decision.
- The exact disposition of a contradicted PASS in Component 2 (surface vs hard-FAIL), observable in the proof.
- Where the single verdict function should live (`work-state.ts` vs a new `verdict.ts`) given the import graph.
