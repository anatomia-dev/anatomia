# Verify Report: Verifier Intent Coverage — Phase 2 (Surfacing + activation)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-16
**Spec:** .ana/plans/active/verifier-intent-coverage/spec-2.md
**Branch:** feature/verifier-intent-coverage

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .../verifier-intent-coverage/contract.yaml
  Seal: INTACT (hash sha256:5095b2cec3666d3f8b3c0288ddaec41cc378473a12533bbb4e86e035fe195dd8)
```
Seal status: **INTACT** — the contract has not been modified since AnaPlan sealed it.

This is a single sealed contract spanning both phases. Phase 1 (gate mechanism, A001–A022) was verified in `verify_report_1.md`. **Phase 2 owns A023–A035** (AC4-count, AC7, AC8, AC9, AC10, AC11, AC12 + activation). This report verifies the Phase 2 assertions; Phase 1 assertions are inherited as SATISFIED from the prior report.

**Mechanical run (independent, sealed):**
- Tests: **3797 passed, 0 failed, 2 skipped.** verdict: pass.
  `<!-- ana:capture stage=verify slug=verifier-intent-coverage counts=3797p/0f/2s verdict=pass sha256=b4631099d76c5ef8a24f4e139bcef562ab7d3bd737ad24a7177995c9a0fcb27a -->`
- Build: **success** (`tsup`, 46ms, dist/index.js emitted).
- Lint: **0 errors, 1 warning.** The lone warning is an unused `eslint-disable` directive in `src/utils/git-operations.ts:198` — not a Phase 2 file, pre-existing and unrelated to this build.

## Contract Compliance

Phase 2 assertions (A023–A035). Each verified by reading the tagged test AND the implementation; card-output assertions additionally confirmed by live invocation.

| ID   | Says                                                        | Status      | Evidence |
|------|-------------------------------------------------------------|-------------|----------|
| A023 | Partial criteria are counted, not hidden                     | ✅ SATISFIED | `tests/utils/proofSummary.test.ts:355-374` asserts `acceptance_criteria.partial === 2` (matcher `equals` 2). Impl `proofSummary.ts:243,249` threads `partialCount` out of `parseACResults`. |
| A024 | Proof card tells the human how many criteria shipped partial | ✅ SATISFIED | `tests/commands/proof.test.ts:837-846` renders the card and matches `/2 acceptance criteria shipped PARTIAL/` (matcher `contains` "PARTIAL"). Impl `proof.ts:374-378`. Live: card shows the line. |
| A025 | Every proof records how each AC was covered                  | ✅ SATISFIED | `proofSummary.test.ts:376-413` asserts `coverage` populated; `:415-437` confirms undefined-safe all-zero. Impl `proofSummary.ts:1056-1076`. |
| A026 | A pass tells judgment-verified ACs apart from pinned ones    | ✅ SATISFIED | `proofSummary.test.ts:410` asserts `coverage.judgment === 1` (matcher `equals` 1). Impl `proofSummary.ts:1068`. |
| A027 | Proof card shows the coverage breakdown                      | ✅ SATISFIED | `tests/commands/proof.test.ts:814-825` asserts card contains `AC coverage:` + `4 pinned`/`1 judgment-only`/`1 retired` (matcher `contains` "coverage"). Impl `proof.ts:362-373`. |
| A028 | Coverage preview lists each AC                               | ✅ SATISFIED | `tests/commands/plan-coverage.test.ts:111-118` asserts output contains AC1/AC2/AC6 (matcher `contains` "AC1"). Live output lists AC1–AC14. |
| A029 | Preview clearly marks any uncovered AC                       | ✅ SATISFIED | `plan-coverage.test.ts:120-125` asserts output contains `UNCOVERED` (matcher `contains`). Impl `plan.ts:120`. |
| A030 | Preview never blocks — exits 0 even when uncovered           | ✅ SATISFIED | `plan-coverage.test.ts:127-132` asserts `exitCode === 0` (matcher `equals` 0). Impl always `process.exit(0)`. Live: exit 0 on both success and missing-slug. |
| A031 | New plan command is available to run                         | ✅ SATISFIED | `plan-coverage.test.ts:201-209` asserts registered names contain `plan` + sub `coverage` (matcher `contains` "plan"). `index.ts:70` calls `registerPlanCommand`. Live: `ana plan --help` lists `coverage`. |
| A032 | New plans seal contracts at the gate-activating version      | ✅ SATISFIED | `tests/commands/template-coverage-prompts.test.ts:21-33` over BOTH `.claude` + `.codex`. Direct grep: `version: "1.1"` present, `version: "1.0"` absent in both plan templates. |
| A033 | Verifier treats contract and intent as two distinct gates    | ✅ SATISFIED | `template-coverage-prompts.test.ts:36-48`. Direct read `ana-verify.md:94-97`: substantive Gate 1 (contract/assertion-reading) / Gate 2 (intent/fulfillment) reframe; blanket "authoritative specification" line removed. |
| A034 | Verifier still predicts likely mistakes before reading code  | ✅ SATISFIED | `template-coverage-prompts.test.ts:50-60`. `ana-verify.md` retains `predict` (14 occurrences) and `:266` reframes Step 5 to a "populated commitment". |
| A035 | Rejection never re-seals or returns to planning              | ✅ SATISFIED | `template-coverage-prompts.test.ts:62-74` (matcher `not_contains` "re-seal"). Direct grep: 0 hits for re-seal/reseal/return-to-plan/back-to-plan in both verify templates. |

All 13 Phase 2 assertions SATISFIED.

## Independent Findings

**Reuse over duplication (predicted, not found).** The highest-risk shortcut for this phase was re-implementing the AC→assertion join in two new call sites. The builder did NOT: both `plan.ts:64` and `proofSummary.ts:1065` call the single exported `joinCoverage` — the same function the Phase 1 gate uses. One implementation, no fork. This is exactly what the spec's "do not fork the join" gotcha demanded.

**Undefined-safety (predicted, not found).** Every new proof field is additive and degrades cleanly: `proof.ts:364-378` guards `entry.acceptance_criteria?.coverage` and renders nothing for legacy entries; `pr.ts:112` guards `acPartial`; `proofSummary.ts:1060-1076` wraps the coverage computation in try/catch that falls back to the all-zero default. Negative-case tests exist for each (`proof.test.ts:827-834,848-854`; `proofSummary.test.ts:415-437`).

**Template reframes are substantive (predicted shortcut, not found).** I checked the templates were genuinely reworded, not keyword-stuffed. `ana-verify.md:94-97` is a real two-question reframe (assertion-reading vs requirement-fulfillment) and the old blanket "contract is authoritative" sentence is gone. `:266` turns the Step 5 second pass from a bare question into a written commitment. AC8/AC9 are met in spirit, not just by string match.

**parseACResults regex (proof-context follow-up).** The proof chain flagged (V1 Code Changes) that this regex could false-match non-AC bullets containing PASS/PARTIAL. Phase 2 mitigates by scoping the match to the `## AC Walkthrough` section (`proofSummary.ts:228-236`). The cross-section risk is largely closed; an in-section Findings-style bullet is not a realistic shape in that section. Noted as observation, not a blocker.

**Surprise — stale `@ana` tags.** A naive tag-driven coverage tool would mis-map this contract. `proofSummary.test.ts:693` carries `// @ana A024` on a timing-fallback test, and `:1042-1046` tag `generateDashboard` tests with A022–A028. Those IDs collide with this contract's namespace but the tests are unrelated. The *real* A024/A027 are correctly tagged in `proof.test.ts`. Coverage is genuinely present — but the tag noise pollutes the proof signal. (See Findings.)

**Over-building check.** `plan.ts` is well-scoped to AC11; no unused exports (`runPlanCoverage`/`registerPlanCommand` both consumed by tests + `index.ts`). One minor duplication: `plan.ts:101-107` re-parses `coverage_waivers` to recover reason text because `joinCoverage` does not return it — acceptable, the reason is display-only.

## AC Walkthrough

- **AC4 (count):** ✅ PASS — judgment-only count appears distinct from retired in both summary (`coverage.judgment`, `proofSummary.ts:1068`) and card (`proof.ts:367`). Verified live: the coverage line renders `N judgment-only · N retired` separately.
- **AC7:** ✅ PASS — `acceptance_criteria.coverage` records pinned/judgment/retired/uncovered/weak_only; card distinguishes them (`proof.test.ts:814-825`). Legacy entries render cleanly (`:827-834`).
- **AC8:** ✅ PASS — both prompts reframed to the scoped two-gate; contract authoritative for assertion reading, intent for fulfillment; seal still meaningful (`ana-verify.md:94-97`). Templates emit `version: "1.1"` (`ana-plan.md`).
- **AC9:** ✅ PASS — prediction step retained (Step 3); Step 5 second pass is now a populated commitment (`ana-verify.md:266`); no count/format requirement added.
- **AC10:** ✅ PARTIAL→PASS by inspection — neither template introduces re-seal / return-to-Plan / contract modification (grep: 0 hits across both verify templates; enforcement test `template-coverage-prompts.test.ts:62-74`).
- **AC11:** ✅ PASS — `ana plan coverage {slug}` prints the per-AC map with covering assertion ids, judgment/retired + weak-matcher info; never gates, exits 0; registered in a new `plan` group. **Live-verified** against this contract (14/14 covered) and the missing-slug error path (exit 0).
- **AC12:** ✅ PASS — "N ACs shipped PARTIAL" surfaced on the card (`proof.ts:374-378`) and PR (`pr.ts:112-114`, `pr.test.ts:578`).
- **Activation:** ✅ PASS — `ana-plan.md` emits `1.1` with `ac:`/`coverage_waivers`; the Phase 1 gate now fires for new-template contracts. This contract dogfoods it — sealed at 1.1, all 14 ACs covered, gate would pass at save.
- **Tests pass; count does not decrease; no build/lint errors:** ✅ PASS — 3797 passed / 0 failed; build success; lint 0 errors.

## Blockers

None. I searched specifically for:
- **Forked join logic** — none; both new call sites reuse the exported `joinCoverage`.
- **Undefined-safety gaps on legacy proof entries** — none; every consumer (`proof.ts`, `pr.ts`, `proofSummary.ts`) guards the new fields and has a negative-case test.
- **Keyword-only template edits that don't fix the AC8 authority contradiction** — none; the two-gate and populated-commitment reframes are substantive prose, and the old "authoritative specification" sentence is removed.
- **A re-seal / return-to-Plan path violating AC10** — none; zero matches across both verify templates.
- **Unused exports / dead code in new files** — none; `plan.ts` exports are all consumed.
- **`process.exit(1)` leaking into the informational command** — none; `plan.ts` exits 0 on every path (AC11 invariant).

Nothing rises to blocker level.

## Findings

- **Test — Stale/cross-contract `@ana` tags mis-map assertion IDs:** `packages/cli/tests/utils/proofSummary.test.ts:693` tags a timing-fallback test `// @ana A024`, and `:1042-1046` tag `generateDashboard` tests with `A022`–`A028`. These IDs belong to *this* contract's namespace but the tests are unrelated to its assertions. The genuine A024/A027 coverage lives in `proof.test.ts`. Coverage is real, but any tag-driven attribution tool will produce false mappings. The `@ana` namespace is per-contract while the file is long-lived — tags from earlier features were never re-scoped. Severity: debt.

- **Code — `proofSummary.ts` keeps growing past the comfort threshold:** the module already carries an active proof-chain finding (`decompose-proof-summary-C1`, "largest util module"). Phase 2 adds ~30 lines of coverage threading. Still present — not introduced here, but the trend continues. Severity: debt; monitor.

- **Code — `parseACResults` PARTIAL regex false-match risk only partially closed:** `packages/cli/src/utils/proofSummary.ts:243` matches `^\s*-\s+.*\bPARTIAL\b`. Phase 2 scopes it to the `## AC Walkthrough` section (`:228-236`), which closes the cross-section false-match (the prior `V1 Code Changes` concern). A prose bullet *within* that section containing the word PARTIAL would still count — low likelihood given the section's shape. Severity: observation.

- **Code — `plan.ts` missing-slug guard reports an error to stderr but exits 0:** `packages/cli/src/commands/plan.ts:41-44` prints `Error: No active work found` then `process.exit(0)`. A caller inspecting the exit code sees success despite an error on stderr. This is a deliberate consequence of the "never exits non-zero" contract (AC11/A030), so it is correct-by-design — but the error-with-success-code pairing is a small UX inconsistency a scripting consumer could trip on. Severity: observation; acknowledged.

- **Upstream — spec test plan under-specified the card/PR surfaces:** `spec-2.md` File Changes listed test edits only in `proofSummary.test.ts`, `plan-coverage.test.ts`, and `template-coverage-prompts.test.ts`. But A024/A027 (`cardOutput`) and the AC12 PR surface genuinely require `proof.test.ts` and `pr.test.ts` coverage — which the builder correctly added. The spec's test inventory was incomplete; the build was not. Severity: observation; monitor.

- **Code — `plan.ts` re-parses `coverage_waivers` for reason text:** `packages/cli/src/commands/plan.ts:101-107` iterates waivers a second time to recover reason strings, because `joinCoverage` returns status but not the waiver reason. Minor duplication of waiver iteration; display-only. A future refactor could have `joinCoverage` carry the reason. Severity: observation; acknowledged.

## Deployer Handoff

- This PASS completes Phase 2 — the final phase. With Phase 1 already verified, all assertions A001–A035 are now SATISFIED and the feature is complete.
- **This change activates the coverage gate for new-template users.** After merge + re-init, every *new-template* Plan must link its scope ACs (`ac:`) or waive them (`coverage_waivers`) or the pre-seal gate blocks at `ana artifact save`. The block is plan-time, pre-build, and instantly fixable — but it is a real behavior change in the planning flow. Worth a line in the changelog.
- Users on old prompts keep emitting `1.0` contracts; the gate stays inert for them until they re-init. Rollout is safe and opt-in via template propagation.
- The contract dogfoods the feature: it is sealed at `1.1` with `ac:` links on all 35 assertions, and `ana plan coverage verifier-intent-coverage` confirms 14/14 ACs covered.
- No new dependencies, no migrations, no env changes. New surface: the `ana plan coverage <slug>` command (read-only, never gates).

## Verdict
**Shippable:** YES

Every Phase 2 assertion (A023–A035) is SATISFIED with evidence I gathered this session: a clean independent test run (3797/0), a successful build, lint with no errors, direct reads of every changed file, independent grep verification of all four template-content assertions, and live invocation of the new `ana plan coverage` command on both its success and error paths. The reuse discipline, undefined-safety, and template reframes the spec demanded are all genuinely present. The findings are debt and observations — tag hygiene, module size, a by-design exit-code quirk — none of which prevent shipping. I would stake my name on this going to production.
