# Build Report: Verifier Intent Coverage — Phase 2 (Surfacing + activation)

**Created by:** AnaBuild
**Date:** 2026-06-16
**Spec:** .ana/plans/active/verifier-intent-coverage/spec-2.md
**Branch:** feature/verifier-intent-coverage

## What Was Built

- **packages/cli/src/utils/proofSummary.ts** (modified): `parseACResults` now returns the `partial` row count (previously computed at `:219` and discarded). The `ProofSummary.acceptance_criteria` type + default gain `partial: number` and a `coverage` object (`pinned`/`judgment`/`retired`/`uncovered`/`weak_only`). `generateProofSummary` computes `coverage` by reading `scope.md` and re-parsing `contract.yaml`, then calling the exported Phase 1 `joinCoverage` — undefined-safe to all-zero when scope/contract is absent or unparseable.
- **packages/cli/src/types/proof.ts** (modified): fixed the stale cross-cutting comment — entry construction lives in `commands/work-proof.ts`, not `commands/work.ts`. (`ProofChainEntry.acceptance_criteria` already aliases `ProofSummary['acceptance_criteria']`, so the new fields flow automatically.)
- **packages/cli/src/commands/proof.ts** (modified): the `── Contract ──` card section gains an `AC coverage: N pinned · N judgment-only · N retired` line (with a red `uncovered` segment when > 0 and a gray weak-matcher info line), plus a `⚠ N acceptance criteria shipped PARTIAL` line. Both undefined-safe for legacy entries.
- **packages/cli/src/commands/pr.ts** (modified): PR summary line appends `(N PARTIAL)` when `partial > 0`. Exported `renderProofMarkdown` so the PR rendering path is unit-testable.
- **packages/cli/src/commands/plan.ts** (created): new `plan` command group with a read-only `coverage <slug>` subcommand — the plan-time mirror of the seal gate. Joins scope ACs to the contract via the same exported `joinCoverage`, prints a per-AC map (covered/judgment/retired/UNCOVERED + weak-matcher info), active/legacy header, and a roll-up. Never gates; always exits 0.
- **packages/cli/src/commands/artifact-validators.ts** (modified): exported `isVersionAtLeast` and `COVERAGE_GATE_MIN_VERSION` so `plan.ts` reuses the gate's version logic (the "1.10 > 1.9" numeric compare) instead of forking it.
- **packages/cli/src/index.ts** (modified): import + register `registerPlanCommand` in the PIPELINE group, adjacent to `registerVerifyCommand`.
- **packages/cli/templates/.claude/agents/ana-plan.md** & **templates/.codex/agents/ana-plan.md** (modified): contract schema example bumped to `version: "1.1"`, assertions gain `ac:` links, a `coverage_waivers` block added; AC-coverage discipline section added; `ana plan coverage {slug}` named as the pre-seal preview in Step 8. **This is what activates the Phase 1 gate for new-template users.**
- **packages/cli/templates/.claude/agents/ana-verify.md** & **templates/.codex/agents/ana-verify.md** (modified): contract-vs-spec reframed as a scoped **two-gate** (contract authoritative for assertion *reading*, intent authoritative for requirement *fulfillment*); Step-5 second pass turned into a populated commitment; coverage map received as AC-Walkthrough context; prediction step kept; no re-seal / return-to-Plan path introduced.
- **.claude/agents/{ana-plan,ana-verify}.md** & **.codex/agents/{ana-plan,ana-verify}.md** (modified): dogfood copies synced byte-for-byte to the templates (required by the dogfood-sync tests — see Deviations).
- **Test files** (created/modified): `tests/commands/plan-coverage.test.ts` (created), `tests/commands/template-coverage-prompts.test.ts` (created), `tests/utils/proofSummary.test.ts` (modified), `tests/commands/proof.test.ts` (modified), `tests/commands/pr.test.ts` (modified), plus three fixture files completed (`commit-hygiene.test.ts`, `work-proof-process.test.ts`, and a literal in `proofSummary.test.ts`).

## PR Summary

- Makes the Phase 1 coverage mechanism visible and turns it on: `ana-plan` templates now emit `version: "1.1"` contracts with `ac:` links and `coverage_waivers`, activating the pre-seal gate for new-template users.
- Adds `ana plan coverage <slug>`, a read-only plan-time preview that prints the AC→assertion coverage map (pinned / judgment-only / retired / UNCOVERED + weak-matcher info). Never gates, always exits 0.
- Threads per-AC coverage and the PARTIAL count through the proof summary → card → PR surfaces, so a PASS distinguishes mechanically-pinned ACs from judgment-verified ones and a PARTIAL-inside-PASS is no longer silently swallowed.
- Reframes the verifier prompt as a scoped two-gate (contract authoritative for *how* to read an assertion; intent authoritative for *whether* the requirement is met) and turns the second-pass prediction check into a populated commitment.
- All coverage/PARTIAL fields are additive and undefined-safe; the proof-coverage computation and the new command both reuse the single exported `joinCoverage` rather than forking the join.

## Acceptance Criteria Coverage

- AC4 (count) "judgment-only count appears in summary + card, distinct from retired" → proofSummary.test.ts "populates acceptance_criteria.coverage" (`coverage.judgment===1`, `retired===0`) + proof.test.ts "renders the AC coverage line" (1 judgment-only · 1 retired)
- AC7 "summary records per-AC coverage; PASS distinguishes pinned vs judgment; undefined-safe" → proofSummary.test.ts coverage-population + undefined-safe cases; proof.test.ts A027 card coverage line + legacy-omits case
- AC8 "scoped two-gate in both prompts; seal still means something" → template-coverage-prompts.test.ts A033 (two-gate, intent, blanket-authoritative-sentence removed) over both platforms
- AC9 "prediction kept; Step-5 = populated commitment; no count/format rule" → template-coverage-prompts.test.ts A034 (`predict` retained + `populated commitment`)
- AC10 "no re-seal / return-to-Plan / contract modification" → template-coverage-prompts.test.ts A035 (asserts absence across both platforms) + verified by inspection
- AC11 "`ana plan coverage` prints per-AC map; never gates; exits 0; registered in new plan group" → plan-coverage.test.ts A028/A029/A030/A031 (rows, UNCOVERED, exit 0, registration) + 8 supporting cases
- AC12 "N ACs shipped PARTIAL surfaced (card + PR)" → proof.test.ts A024 (card) + pr.test.ts renderProofMarkdown PARTIAL segment + proofSummary.test.ts A023 (parse)
- Activation "ana-plan emits version 1.1 + ac/coverage_waivers" → template-coverage-prompts.test.ts A032 (version "1.1", coverage_waivers, ac:, plan coverage pointer) over both platforms

Contract coverage (Phase 2 assertions): **13/13 tagged** — A023–A035 each have a `@ana`-tagged test. (A001–A022 are Phase 1, already built + verified.)

## Implementation Decisions

- **`partial`/`coverage` typed as required (not optional).** The spec specifies `partial: number` and a `coverage` object; `generateProofSummary` always populates them. Old `proof_chain.json` entries lack them at runtime, so every *consumer* (card, PR) still guards defensively — `no-unnecessary-condition` is not enabled, so the guard is lint-clean. Keeping required surfaced four incomplete `ProofSummary` fixtures, which I completed (type-correct, not assertion changes).
- **Reused `joinCoverage` everywhere; did not fork the join.** The proof-coverage computation, `ana plan coverage`, and the Phase 1 gate all call the one exported helper (spec gotcha). For per-AC *display* in the command (waiver reasons), I read `contract.coverage_waivers` directly — that is display enrichment, not a re-implementation of the coverage determination.
- **Coverage computed after the verify loop**, with the `parseACResults` assignment changed to preserve the `coverage` object (it comes from scope+contract, not the verify report).
- **`ana plan coverage` exit-on-guard uses `process.exit(0)`** even for missing-slug/contract, because the command is informational and must never exit non-zero (spec constraint) — unlike `verify.ts`'s `runPreCheck`, which exits 1 on a missing plan dir.

## Deviations from Contract

The contract assertions (A023–A035) were satisfied exactly as written. The deviations below are from the **spec's prose guidance**, not the contract.

### Spec constraint: "Prompt edits go to `templates/.claude/agents/`, not the root dogfood."
**Instead:** I also edited the root dogfood `.claude/agents/{ana-plan,ana-verify}.md` and `.codex/agents/{ana-plan,ana-verify}.md`, copying them byte-for-byte from the edited templates.
**Reason:** Two pre-existing dogfood-sync tests (`tests/templates/agent-proof-context.test.ts` "dogfood agent definitions match the shipped templates exactly" and `tests/templates/codex-learn-template.test.ts` "every dogfood codex agent .md matches the shipped template exactly") assert the root dogfood is byte-identical to the templates. Editing templates alone left those two tests red (3795p/2f). "Every commit leaves the suite green" is a hard guardrail.
**Outcome:** Functionally consistent with the spec's intent — the *product* change is in `templates/`; the dogfood is just kept in sync, which is exactly what the sync tests enforce. The product still ships from `templates/`. Verifier should confirm this reading is correct and that touching the dogfood is acceptable (it changes the agents this repo itself uses on next re-init).

### Spec File Changes named only `templates/.claude/agents/*.md` for the prompt edits.
**Instead:** I edited the `.codex/agents/*.md` templates too (and their dogfood copies).
**Reason:** The spec's own Constraints section says "Both Claude and Codex: the template edits ship to per-platform dirs," and `CODEX_AGENT_FILES` + the codex sync test enforce the `.codex` bodies. The `.claude`-only File Changes entry was underspecified relative to the constraint.
**Outcome:** Both platforms carry identical instructions; the contract's `anaVerifyTemplate`/`anaPlanTemplate` assertions hold for both.

### Additions beyond the spec (additive exports for testability/reuse).
- Exported `renderProofMarkdown` (`pr.ts`) so the PR PARTIAL path is unit-tested rather than left as an untested code path.
- Exported `isVersionAtLeast` + `COVERAGE_GATE_MIN_VERSION` (`artifact-validators.ts`) so `plan.ts` reuses the version logic instead of forking it.
Both are pure, additive named exports with no behavior change.

## Test Results

### Baseline (before changes)
Command: `(cd packages/cli && pnpm vitest run)`
```
Test Files  157 passed (157)
      Tests  3767 passed | 2 skipped (3769)
```

### After Changes
Sealed via `ana test --stage build --slug verifier-intent-coverage`:
```
✓ captured  counts: 3797 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=verifier-intent-coverage counts=3797p/0f/2s verdict=pass sha256=07a74c06321150ea0234d9fb86fbec1adc3970abea7bc50de1e5cf9674e22a46 -->

### Comparison
- Tests added: +30 net (3767 → 3797 passing)
- Tests removed: 0
- Regressions: none in the final suite. (An intermediate run showed 2 failures in the dogfood-sync tests after the template edits; resolved by syncing the dogfood — see Deviations. The marker above is the clean final state.)

### New Tests Written
- `tests/commands/plan-coverage.test.ts` (12): per-AC rows, UNCOVERED marker, exit-0 invariant, judgment/retired/weak-matcher rendering, active/legacy headers, fully-covered note, build-only scope, missing-contract + missing-slug guards, command registration.
- `tests/commands/template-coverage-prompts.test.ts` (8): version 1.1 + ac/coverage_waivers + plan-coverage pointer in ana-plan (both platforms); two-gate + intent + removed blanket-authoritative sentence in ana-verify; prediction retained + populated-commitment; no re-seal/return-to-Plan.
- `tests/utils/proofSummary.test.ts` (+5): parseACResults partial count; coverage population (pinned/judgment); undefined-safe all-zero; weak_only.
- `tests/commands/proof.test.ts` (+4): card AC-coverage line (+ legacy omits); card PARTIAL line (+ legacy omits).
- `tests/commands/pr.test.ts` (+2): renderProofMarkdown PARTIAL segment present / absent.

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
(cd packages/cli && pnpm vitest run tests/commands/plan-coverage.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/template-coverage-prompts.test.ts)
(cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts tests/commands/proof.test.ts tests/commands/pr.test.ts)
(cd packages/cli && pnpm run lint)
```
Dogfood the command directly: `ana plan coverage verifier-intent-coverage` (this contract maps 14/14 ACs covered, 3 weak-matcher info).

## Git History
```
01711504 [verifier-intent-coverage:s2] Sync dogfood agent defs to the edited templates
182dce58 [verifier-intent-coverage:s2] Activate the gate in templates + fix verifier prompts
807de545 [verifier-intent-coverage:s2] Add read-only `ana plan coverage` preview command
772c45fe [verifier-intent-coverage:s2] Surface AC coverage + PARTIAL in proof card and PR
49cf0a28 [verifier-intent-coverage:s2] Thread per-AC coverage + PARTIAL count through proof summary
```
(Earlier commits `028ce164`…`fe070719` are Phase 1 + reports.)

## Open Issues

1. **Editing the root dogfood agents changes the agents this repo uses.** Syncing `.claude`/`.codex` dogfood to the templates means the next re-init/agent run in *this* repo picks up the new two-gate verifier and 1.1-emitting planner. Intended (that is dogfooding), but worth a human's awareness — it changes how this project's own pipeline behaves. (severity: observation, action: monitor)

2. **`ana plan coverage` is not wired into the `ana run` pipeline as an automatic step.** The templates *instruct* the planner to run it, but nothing enforces the planner actually previewed coverage before save. The real enforcement is the Phase 1 gate at `ana artifact save`; the command is an advisory preview, as the spec intends. Noting so it is not mistaken for an automatic gate. (severity: observation, action: acknowledge)

3. **Coverage display reads `contract.coverage_waivers` directly for waiver reasons.** `joinCoverage` returns the status but not the reason, so `plan.ts` does a small second read of the waivers array purely to print the reason text. This is display-only and does not re-implement the join, but it is a second place that touches `coverage_waivers` — if the waiver shape changes, both `joinCoverage` and this display lookup need updating. (severity: debt, action: monitor)

4. **The spec's File Changes under-specified the `.codex` template + dogfood edits.** I followed the spec's Constraints ("Both Claude and Codex") and the existing sync tests, but a reader comparing only the File Changes table to the diff will see more files touched than listed. Documented in Deviations. (severity: observation, action: acknowledge)

Second pass — what I noticed but didn't initially write down: the `partial`/`coverage` required-vs-optional choice could be questioned by the verifier (I judged required, matching the spec wording, and completed the fixtures rather than loosening the type — captured under Implementation Decisions); and the `renderProofMarkdown` export was added solely for testability (captured under Deviations). No further concerns surfaced.
