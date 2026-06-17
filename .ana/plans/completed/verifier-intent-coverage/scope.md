# Scope: Verifier Intent Coverage — Mechanically Guarantee the Contract Covers Scope Intent

**Created by:** Ana
**Date:** 2026-06-05

## Intent

Make the contract's fidelity to scope intent **mechanically trustless**. Today the contract is positioned as the authoritative specification, but it is only a *fallible proxy* for what the scope actually asked for. Whether built code satisfies intent rests on the planner's diligence translating intent→assertions and the verifier's disposition to *notice* a thin translation — with **no mechanical check that every acceptance criterion is even covered, and no gating outlet when a gap is found.**

This is the one place "verified over trusted" is currently only *hoped*: genuinely wrong work can ship with a clean PASS. The fix is to guarantee — before the contract is sealed — that every scope acceptance criterion is either covered by a linked assertion or honestly marked as a judgment call, and to make the proof card honest about which ACs are mechanically pinned vs. verified by human judgment.

Sourced from `anatomia_reference/REQs/REQ-verifier-intent-coverage.md`, which supersedes `SPIKE-verifier-rigor.md`. Every load-bearing file/line claim in the REQ was re-verified against live source during scoping (see Exploration Findings — three citation corrections carried forward).

## Complexity Assessment

- **Kind:** feature
- **Size:** large
- **Surface:** cli
- **Files affected:**
  - `src/types/contract.ts` — add `ac?: string | string[]` to `ContractAssertion`; `judgment_only?: string[]` on `ContractSchema`
  - `src/commands/artifact-validators.ts` — build a real scope-AC **extractor** (all forms); add the pre-seal coverage **gate** function
  - `src/commands/artifact.ts` — call the gate before the seal hash is computed (the seal hash is taken in `saveArtifactMetadata()` at `:74`)
  - `src/commands/plan.ts` — **NEW** `plan` command group with a read-only `coverage {slug}` subcommand (planner-native preview)
  - `src/index.ts` — register the new `plan` command group (`registerPlanCommand`)
  - `src/types/proof.ts` — coverage / `judgment_only` fields on `ProofChainEntry` + `ProofSummary`; fix the stale cross-cutting comment at `:19` (`work.ts` → `work-proof.ts`)
  - `src/utils/proofSummary.ts` — populate the coverage field (default block at `:862`, plus generation logic)
  - `src/commands/work-proof.ts` — thread the coverage field through entry construction (`:130`)
  - `src/commands/proof.ts` — display sealed-vs-judgment coverage; surface the PARTIAL count
  - `templates/.claude/agents/ana-plan.md` — AC-coverage discipline, judgment-only concept, `ac:` linkage, scoped-precedence fix, material-gap-as-assertion, point planners at `ana plan coverage`
  - `templates/.claude/agents/ana-verify.md` — scoped-precedence fix, predictions tightening (keep + reinforce), receive the coverage map
- **Blast radius:** Low and contained by design. The `ac:` field is additive and zero-migration — legacy contracts (0/186 use it) validate unchanged and the gate **no-ops** on them. The gate blocks at the safest point (plan-time, pre-seal, before any build exists); a false block is instantly recoverable. The one genuinely new failure surface is the extractor — mitigated by measuring it against all 187 historical scopes before it is allowed to gate. Prompt changes only "activate" the gate for users on the new templates (merge-not-overwrite → inert-but-safe for users on old prompts until re-init/propagation).
- **Estimated effort:** ~3–5 focused days across phases. Phase 1 (extractor + measurement) is the critical-path de-risk; the rest is mechanical once the extractor is proven.
- **Multi-phase:** yes

## Approach

Make intent the source of truth and the contract its *fallible, coverage-checked* expression — and catch a thin contract **before it is sealed, not after.** Chosen by *the elegant solution removes*: we **delete a contradiction** (the self-contradictory authority lines in both prompts) and **add one typed link** (`ac:`) that makes coverage a computable fact — rather than building a smell-linter, a staged-context engine, or contract-amendment machinery (all cut on evidence; see Rejected Approaches). And by *foundation, not scaffolding*: the `ac:` link is a typed handoff — the pipeline's whole philosophy — not a checker bolted on top.

Five moves, keystone first:

1. **The `ac:` link** — an optional field tying each assertion to the scope AC it serves. Declared by the planner (trustless), not inferred at verify time (fuzzy). Formalizes what 58 contracts already do in informal `# AC1:` comments.
2. **A purpose-built scope-AC extractor**, proven safe on all 187 historical scopes *before* it gates anything. The existing check is a counter, not an extractor, and is even more restrictive than expected (requires a `- ` bullet prefix).
3. **The pre-seal coverage gate** (the keystone) — hard-block the seal **iff** a scope AC has zero covering assertions AND no judgment-only marker. This single mechanically-unambiguous condition is the *only* thing that gates; everything else surfaces, never blocks.
4. **The judgment-only marker** — an honest escape hatch for genuinely untestable ACs ("the error message is helpful"), with its count surfaced so it can't be silently abused to dodge the gate.
5. **Proof-summary coverage honesty** — record per-AC coverage and judgment-only counts so a PASS distinguishes mechanically-pinned ACs from judgment-verified ones, instead of the card over-claiming sealed coverage it doesn't have.

Plus the **planner-native preview** (`ana plan coverage {slug}`) and the **prompt fixes** that resolve the authority contradiction (scoped two-gate) and reinforce predictions.

**Suggested phasing (AnaPlan owns final decomposition):**
- **Phase 1 — Foundation + de-risk:** `ac:` field on the type; build the extractor; **prove AC1** on 187 scopes; confirm backward-compat (AC3). Nothing gates yet.
- **Phase 2 — The keystone:** the pre-seal gate + judgment-only marker + wiring into the save flow before the seal hash (AC2, AC4, AC5, AC6).
- **Phase 3 — Proof honesty:** coverage field across the 4 proof locations + PARTIAL-ships-as-PASS count + display (AC7, AC12).
- **Phase 4 — Surfaces:** the new `ana plan coverage` command (AC11) + both prompt templates (AC8, AC9, AC10).

## Acceptance Criteria

- **AC1:** The scope-AC extractor, run over all 187 historical scopes, extracts the correct AC set with **zero false "uncovered"** on contracts that genuinely cover everything. One false block on legitimate history is a release blocker. The extractor handles `- AC1:`, `## AC1`, `**AC1**`, and `AC1:` forms.
- **AC2:** The seal blocks **iff** a scope AC has zero covering assertions AND no judgment-only marker. Nothing else gates.
- **AC3:** All 186 existing contracts still validate and save unchanged (no `ac:` → gate no-ops).
- **AC4:** A judgment-only AC satisfies coverage and never blocks; the judgment-only count appears in the proof/card.
- **AC5:** A deliberately-retired scope AC (with a stated reason) does not false-block; a silently-dropped AC does block.
- **AC6:** A build-only spec with no contract (or no ACs) never triggers the gate.
- **AC7:** The proof summary records per-AC coverage and `judgment_only`; a PASS distinguishes mechanically-pinned ACs from judgment-verified ACs.
- **AC8:** The prompt change keeps the contract authoritative for assertion *reading* and intent authoritative for requirement *fulfillment* (scoped two-gate, not literal "intent wins"); the seal still means something.
- **AC9:** The prediction step remains; the Step-5 second pass is reframed from a question into a populated commitment; no count/format requirement is added.
- **AC10:** The contract is never modified downstream; no re-seal; rejection remains Build↔Verify only, never back to Plan.
- **AC11:** A new read-only `ana plan coverage {slug}` command prints the AC→assertion coverage map (per-AC status, covering assertions, judgment-only and weak-matcher info flags). It never gates. It lives in a new `plan` command group registered in `index.ts`.
- **AC12:** A save-time / card "N ACs shipped PARTIAL" count is surfaced for the human (the ~49/187 PARTIAL-inside-PASS case).
- **AC13 (safety envelope for strangers — gate activation):** The coverage gate **cannot be silently disabled by omission.** Activation as "any `ac:` link present → active; none → no-op" cannot distinguish a legitimate legacy contract from a *new-regime* contract where Plan should have linked but wrote **zero** `ac:` links — the latter silently disables the gate with no signal. The gate must tie activation to a positive signal (template/prompt version, or an explicit flag) so that a new-regime contract with zero links is **surfaced** ("coverage gate inactive — no `ac:` links"), not silently treated as legacy. Mechanism is AnaPlan's to choose; the requirement is that an inactive gate is never invisible.
- **AC14 (safety envelope for strangers — extractor fail-open):** The hard block fires **only on high-confidence AC extraction.** When a scope's AC format is ambiguous or unrecognized — formats outside our 187-scope measured set (loose human edits, older or customized templates a stranger team runs) — the gate **FAILS OPEN to a warning, never a false block.** This is per-run, per-customer safety: an unfamiliar format degrades to warn on *every* run, distinct from OQ3's global build-time degrade (which only fires if our own 187-scope measurement fails). "One false block is a release blocker" must hold for teams whose formats we never measured.

## Edge Cases & Risks

1. **Extractor robustness (the #1 correctness risk).** Must handle `- AC1` / `## AC1` / `**AC1**` / `AC1:`. A mis-parse is either a false block or a missed AC (the gap we're closing). Measure on 187 scopes before gating — non-negotiable (AC1).
2. **Judgment-only ACs.** Without the marker, genuinely untestable ACs false-block. Surface the count so the escape hatch can't be silently abused. **This protection is visibility-only — surfaced count, not prevention:** a planner can still over-mark ACs judgment-only, and the gate does not block on the count. Acceptable by design (the alternative — a cap or block — would re-introduce false-blocks), but stated explicitly so no one mistakes surfacing for enforcement.
3. **Scope-AC vs spec-AC divergence.** Plan may legitimately *correct* a bad scope AC (`ana-plan.md:369`). The gate must protect against *dropping* while allowing *correcting* — a "retired, here's why" path so a deliberately-removed AC isn't false-flagged. The join keys on scope AC ids carried through any renumbering by the `ac:` link.
4. **Multi-phase.** One contract covers all phases (`ana-plan.md:321`) → one AC set, one join. No per-phase complexity.
5. **Contractless / build-only specs.** No contract or no ACs → gate no-ops, never blocks.
6. **"Covered" ≠ "well-covered."** Coverage = ≥1 *linked* assertion; a weakly-covered AC (only `exists`/`contains`) counts as covered. The gate catches *dropped* ACs, not *weak* ones (the weak-matcher linter was cut — 49% false-alarm rate). Record "covered by weak matcher only" as **info**, never a block. The `ac:` link is self-reported by Plan — the gate verifies the link *exists* (structural coverage), not that the assertion *semantically* tests the AC (that stays Verify's judgment).
7. **Save-flow wiring (scrutiny correction).** The gate function belongs with the validators in `artifact-validators.ts`, but the seal hash is computed in `saveArtifactMetadata()` at `artifact.ts:74` — so the gate must be *called* before that point in the save orchestration, with access to both `scope.md` and the contract. Wiring nuance, not architecture.
8. **Silent-skip on omission (safety envelope for strangers — AC13).** Activation by `ac:`-presence alone means a new-regime contract where Plan *should* have linked but wrote zero links is indistinguishable from a pre-feature legacy contract — the gate silently no-ops and the wrong thing can ship with a clean seal, the exact failure this feature exists to close. The gate must not be skippable by omission without surfacing it. Confirm the activation signal holds for a stranger team: new template, no links → **visible** "gate inactive," never silent.
9. **Unmeasured scope formats (safety envelope for strangers — AC14).** Our 187 scopes cannot represent every format a customer will write — loose human edits, older templates, customized AC conventions. A hard block on a format we never measured is a false-block, and "one false block is a release blocker." The block must fire only on high-confidence extraction and **fail open to a warn** on any ambiguous/unrecognized format, per run. The safe default for an unfamiliar scope is *warn and let it through*, never *block*.

## Rejected Approaches

| Proposal | Why not |
|----------|---------|
| **Weak-matcher smell-linter** | 49% false-alarm rate, measured. Flagging half of every contract trains operators to ignore it and destroys its own signal. Redundant with `ac:` coverage (weak coverage becomes a report column, not a tool). |
| **Save-time walkthrough-completeness validator** | `proofSummary` already tallies AC rows and the AC Walkthrough already works. Machinery on a working behavior. Demote to an optional warning at most. |
| **`coverage` as a *verify-time* gate** | At verify time a dropped AC is already gone from contract + spec — the join finds nothing. Only useful as the plan-time pre-seal gate + the read-only preview. |
| **Contract amendment + re-seal** | The contract never needs in-place repair: weak contract + correct code → upstream finding; weak contract + wrong code → AC walkthrough FAIL → Build fixes the code. Re-seal solves a problem re-sourcing the gate dissolves. |
| **Staged CLI-gated-context engine** | 172 PASS runs show the prompt already carries the sequencing. Building an engine for a problem we don't have. |
| **Removing the prediction step** | Measurement error — predictions happen in ~89–94% of sessions and are the best anti-confirmation-bias mechanism in the prompt. Keep and reinforce. |
| **Second verifier / return-to-Plan on rejection / literal "intent always wins"** | Violate hard constraints (no second context, no return-to-Plan, don't neuter the seal). |
| **Test-body / matcher-reconciliation in v1** | Targets the *proven* failure but is the expensive cross-language build. Deferred to a measured follow-up REQ — see Open Questions resolution. |

## Open Questions

All five REQ open questions were resolved at scoping with the founder (Ryan). Recorded here as decisions, not open items:

1. **v1 scope boundary → coverage backstop only.** v1 does NOT include test-body signal. It closes the *dropped/uncovered-AC* class mechanically and makes the proof honest — both cheap. Test-body analysis (parsing `@ana` test bodies vs. matchers — the cross-language "Generalization Gate") is funded as a separate, measured follow-up REQ. **The gap is named, not papered over:** coverage does not catch a vacuous test body, which is the documented *proven* failure.
2. **Precedence → scoped two-gate.** The contract wins on *how to mechanically read an assertion*; intent (scope ACs, via the AC Walkthrough) wins on *whether the requirement is met at all*. Not literal "intent wins" (that would neuter the seal).
3. **Gate strength → hard block, contingent on AC1.** The single uncovered-AC condition is a *hard* pre-seal block — the one place "verified over trusted" justifies a mechanical stop. **Contingency:** if AC1 cannot go green, the gate must degrade to a warn rather than ship a false-blocking detector.
4. **PARTIAL visibility → include in v1.** Surface a save-time "N ACs shipped PARTIAL" count (AC12).
5. **Command namespace → new plan-time home (AC11).** Not `ana verify coverage`. A new `ana plan` command group is created so the preview lives where it's actually used (plan-time) and can be built to serve the planner uniquely. There is no `ana plan` surface today — this establishes it.

## Exploration Findings

### Patterns Discovered
- **Command-group registration** (`src/index.ts:57-75`): each group is a `registerXCommand(program)` call; groups render in registration order. The new `plan` group follows this exactly — add `registerPlanCommand(program)` and an import.
- **Subcommand pattern** (`verify.ts:132-145`): `new Command('verify').command('pre-check').argument('<slug>').action(...)`. `ana plan coverage` clones this shape but with a planner-native handler (richer than the seal-only `pre-check`).
- **Contract validation** lives in `validateContractFormat()` (`artifact-validators.ts:276-377`) — checks named fields by name, never iterates keys, so unknown fields like `ac` pass untouched (backward-compat confirmed for AC3).
- **Seal hash** is computed in `saveArtifactMetadata()` (`artifact.ts:74`) as `sha256:` of the contract content — the gate must run *before* this.
- **Proof cross-cutting pattern** (`proof.ts:14-21` comment): adding a proof field touches 4 locations — type, `generateProofSummary` default (`proofSummary.ts:862`), entry construction (`work-proof.ts:130`), display (`proof.ts` `formatHumanReadable` ~`:251`).

### Constraints Discovered
- [TYPE-VERIFIED] `ContractAssertion` (`contract.ts:14-21`) — `id`/`says` plus optional `block`/`target`/`matcher`/`value`. No `ac` field. Add `ac?: string | string[]`.
- [TYPE-VERIFIED] `ContractSchema` (`contract.ts:34-40`) — has `assertions?: ContractAssertion[]`; clean sibling slot for `judgment_only?: string[]`.
- [TYPE-VERIFIED] Existing AC check (`artifact-validators.ts:113`) is `/^-\s+(AC\d+|##?\s*AC|\*\*AC)/mi` — a **counter** that *requires a `- ` bullet prefix*. It does NOT extract ids and does NOT match bare `## AC1` / `**AC1**` / `AC1:`. The new extractor must be built fresh (confirms AC1 risk).
- [OBSERVED] **REQ citation corrections** (verified against live source):
  - REQ says validator is at `artifact.ts:367` — that line is a docstring for `archivePreviousVersion()`. Real validator: `validateContractFormat()` at `artifact-validators.ts:276-377`.
  - REQ implies the gate sits "before the seal hash" in `artifact-validators.ts` — the seal hash is actually in `artifact.ts:74`. Gate function with the validators; gate *call* before `saveArtifactMetadata()`.
  - REQ's stale-comment flag (`proof.ts:19`) is confirmed: it says `work.ts`, should say `work-proof.ts`. Fix while there.
- [TYPE-VERIFIED] All 10 prompt-template line references in the REQ (`ana-verify.md` `:88`/`:92`/`:244`/`:181-194`/`:250-257`; `ana-plan.md` `:333`/`:121`/`:290`/`:321`/`:369`) are **exact, zero drift** as of this scan.

### Test Infrastructure
- Vitest. `test count must not decrease` (CI across 3 OS × 2 Node). The extractor measurement (AC1) is itself a strong test fixture: feed all 187 `.ana/plans/completed/*/scope.md` (plus active) through the extractor and assert the AC set + zero false-uncovered against their contracts.

## For AnaPlan

### Structural Analog
`src/commands/verify.ts` (`registerVerifyCommand` + `runPreCheck` + `runContractPreCheck` + `printContractResults`, `:36-145`). The new `src/commands/plan.ts` with `registerPlanCommand` + a `coverage` subcommand is the closest structural match — same command-group shape, same slug-resolution + plan-dir-existence guards, same read-only-never-exits-nonzero contract. The handler is richer (joins scope ACs ↔ assertions and renders a coverage map) but the skeleton clones directly.

### Functional Analog
`validateScopeFormat`/`validateContractFormat` in `artifact-validators.ts` — same domain (parsing artifacts, enforcing format), different shape. The extractor and gate belong here, beside these.

### Relevant Code Paths
- `src/types/contract.ts:14-21,34-40` — type changes
- `src/commands/artifact-validators.ts:113,276-377` — extractor + gate (and the existing counter to replace/supplement)
- `src/commands/artifact.ts:51-115` (`saveArtifactMetadata`, hash at `:74`) — wire the gate call before the hash
- `src/commands/verify.ts:36-145` — clone target for `plan coverage`
- `src/index.ts:57-75` — register the new group
- `src/types/proof.ts` (`ProofChainEntry` `:48-108`, `ProofSummary` `:29-86`, stale comment `:19`)
- `src/utils/proofSummary.ts:862-888` — default block
- `src/commands/work-proof.ts:130-165` — entry construction
- `src/commands/proof.ts:251-439` (`formatHumanReadable`), `:644-691` (`formatListTable`) — display + PARTIAL count
- `templates/.claude/agents/ana-plan.md`, `templates/.claude/agents/ana-verify.md` — prompt fixes

### Patterns to Follow
- New command group: mirror `registerVerifyCommand` (`verify.ts:132`) and the registration call style in `index.ts:57-75`.
- Proof field: follow the documented 4-location cross-cutting recipe (type → default → entry → display); update the `proof.ts:19` comment to reflect reality (`work-proof.ts`).
- Coverage data must be **undefined-safe** for old proof entries (additive/optional everywhere).

### Known Gotchas
- **Templates vs. dogfood:** prompt edits go to `templates/.claude/agents/*.md` (the product, all customers). Do NOT only edit the root `.claude/agents/*.md` (our dogfood). The gate is inert until `ana-plan.md` writes `ac:`/judgment-only — that propagation is by design.
- **Pre-commit runs `tsc --noEmit`, build uses SWC** — type errors don't fail the build, only the hook. New optional fields must be threaded with correct types everywhere or the hook (not the build) catches it.
- **Gate must no-op, never throw, on:** no contract, no ACs, legacy contracts with no `ac:` field (AC3, AC6).
- **The hard block is contingent on AC1.** Do not ship a gating extractor that hasn't passed the 187-scope measurement; degrade to warn if it can't.

### Things to Investigate
- **AC1 measurement harness** — where the 187 scopes live (`.ana/plans/completed/*/` + active), and how to assert "extracted AC set matches" against each contract's `ac:` links / informal `# AC1:` comments. This is the gate on the whole feature; design it first.
- **What makes `ana plan coverage` planner-*unique* (OQ5=B intent):** beyond the verify-clone skeleton, decide the richest useful view — per-AC status (covered / uncovered / judgment-only), the covering assertion ids, weak-matcher-only info flags, and the judgment-only + PARTIAL counts. This is a design-judgment call for Plan.
- **Where `acceptance_criteria.met/total` is currently sourced** in the proof summary, so the new per-AC coverage data extends rather than duplicates it.
- **Retired-AC representation** (edge case 3) — how a planner marks "AC retired, here's why" so it doesn't false-block, and where that lives (scope vs contract).
- **Gate activation signal (AC13)** — choose the positive activation mechanism (template/prompt version stamp on the contract, or an explicit `coverage_gate:` flag) that distinguishes legacy from new-regime, and where it's read at save time. The hard requirement: a new-regime contract with zero `ac:` links surfaces "gate inactive," never silently no-ops. Design the inactive-but-surfaced path alongside the active path.
- **Extraction-confidence threshold + fail-open classification (AC14)** — define what counts as "high-confidence" extraction (gate-eligible) vs "ambiguous/unrecognized" (warn-only), as a per-run decision over an *individual* scope, not a global measured-vs-unmeasured switch. The 187-scope measurement (AC1) calibrates the threshold; it does not replace the per-run classifier. Verify the classifier itself can't false-classify a well-formed-but-unusual scope into a hard block.
- **`material-gap-as-assertion` needs a concrete definition (flag).** It is listed as an `ana-plan.md` change (Files affected) but never defined. Before it can be a prompt instruction, pin down: what makes a gap "material," what the planner does when one is found (emit an assertion? a judgment-only marker? a finding?), and how it interacts with the coverage gate. Do not ship the prompt line until the definition is concrete and testable.
