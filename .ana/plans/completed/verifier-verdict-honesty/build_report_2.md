# Build Report: Verdict Honesty — Component 3 (deterministic read-build-report veto)

**Created by:** AnaBuild
**Date:** 2026-06-16
**Spec:** .ana/plans/active/verifier-verdict-honesty/spec-2.md
**Branch:** feature/verifier-verdict-honesty (Phase 2)

## What Was Built

Component 3 flips ONE behavioral claim from evidence to gate: if the verify session
deterministically read `build_report.md`, the proof is force-FAILed regardless of its
self-authored PASS headline. Forward-only, fail-open-but-surfaced.

- **packages/cli/src/types/proof.ts** (modified): Added optional `source?: 'deterministic' | 'llm' | (string & {})` to `ComplianceVerdictRecord` (mirrors the engine's type-disjoint channel; `?:` so pre-Component-3 records deserialize as non-gating). Added `verdict_veto?: { applied: boolean; reason?: string }` to `ProofChainEntry` so the proof records whether the veto fired.
- **packages/cli/src/utils/compliance.ts** (modified): `projectVerdicts` now threads `source` from the core verdict onto the persisted record (additive — absent source stays absent). Rewrote the module docstring: verdicts are evidence EXCEPT the allowlisted `ana-verify:verify-independence` verdict, which gates the proof when `violated` + `source: deterministic`.
- **packages/cli/src/utils/verdict.ts** (modified): Added `evaluateReadBuildReportVeto(compliance)` — pure records-in → decision-out. Fires iff a record has `role === 'verify'` ∧ a verdict with `claim_id === VERIFY_INDEPENDENCE_CLAIM_ID` ∧ `status === 'violated'` ∧ `source === 'deterministic'`. Gates on `source`, never `reason`. Exported `VERIFY_INDEPENDENCE_CLAIM_ID` with the empirical 0.4.0 citation, plus the `ReadBuildReportVeto` type.
- **packages/cli/src/commands/work-proof.ts** (modified — load-bearing): Reordered `writeProofChain` so compliance attestations are assembled UPSTREAM of the FAIL guard and the proof-chain write, then the veto is evaluated. Added `guardVerdictVeto` (print + `process.exit(1)`, mirroring `guardFailResult`) that force-FAILs when the veto applied. Records `verdict_veto` on the entry (always — `applied: false` with a stated reason when no veto fired).
- **packages/cli/src/commands/proof.ts** (modified): `renderSessionAttestation` now renders the veto status (APPLIED override line / "not applied — &lt;reason&gt;" including "no captured transcript") and the forward-only honesty-boundary line, even with zero records. New module-private `renderVerdictVeto` helper. Updated the "evidence, never a gate" copy to name the one gating claim.

Tests:
- **tests/utils/verdict.test.ts**: veto truth table (8 cases).
- **tests/utils/compliance.test.ts**: `source` projection + legacy-omit + docstring-honesty.
- **tests/commands/work-proof-guard.test.ts**: `guardVerdictVeto` unit tests.
- **tests/commands/verdict-veto-integration.test.ts** (created): full real-engine pipeline, both harnesses, + `writeProofChain` end-to-end.
- **tests/commands/proof-compliance-display.test.ts**: veto rendering + honesty boundary.

## PR Summary

- Adds a deterministic "read-build-report" veto: if the verify session actually `Read` the build report (as judged by anatrace-core), the proof is force-FAILed even when the verifier typed a PASS headline.
- The veto keys on the engine's stable `source: 'deterministic'` channel (never the drift-prone `reason`) and fires on exactly one allowlisted claim under exactly four conditions — no other verdict, role, or claim gates.
- Forward-only and fail-open-but-surfaced: pre-feature records (no `source`) and capture-off runs never gate, and the proof always states the veto outcome ("not applied — no captured transcript") so it is never a silent skip.
- The load-bearing change reorders `writeProofChain` so the veto is decided upstream of the seal; verified with a real-engine integration test for both Claude and Codex transcripts.
- Updates the proof card and the compliance docstring so they no longer claim verdicts "never gate" unconditionally — they name the one gating claim and render a forward-only honesty boundary.

## Acceptance Criteria Coverage

- **AC1** (verify violated+deterministic → force-FAIL, forward-only) → `verdict.test.ts` "applies when verify deterministically violated" (A021) + `verdict-veto-integration.test.ts` force-FAIL (both harnesses) — ✅ Verified
- **AC2** (unverifiable/satisfied/non-verify/other-claim/non-deterministic do NOT gate) → `verdict.test.ts` A022/A023/A024/A026 (5 cases) — ✅ Verified
- **AC3** (`source` persisted via `projectVerdicts`; absent source deserializes non-gating) → `compliance.test.ts` "carries the engine source verbatim" (A025) + "omits source when core supplies none" — ✅ Verified
- **AC4** (capture off / no record → no veto, headline stands, proof states "not applied — no captured transcript") → `verdict.test.ts` A027 + `verdict-veto-integration.test.ts` A029 (written entry) + `proof-compliance-display.test.ts` "not applied — no captured transcript" — ✅ Verified
- **AC5** (veto runs upstream of proof-chain write + FAIL guard) → reorder in `work-proof.ts:writeProofChain`; `verdict-veto-integration.test.ts` blocks completion (exit 1) with a PASS headline — ✅ Verified
- **AC6** (docstring + attestation copy name the one gating claim; honesty-boundary renders once) → `compliance.test.ts` A030 + `proof-compliance-display.test.ts` "renders the honesty boundary exactly once" (A031) — ✅ Verified
- **AC7** (no pass-rate number/assertion added) → only the one honesty-boundary line added; no rate computed anywhere — ✅ Verified (manual)
- **AC8** (Codex parity — codex fixture exercises the gate) → `verdict-veto-integration.test.ts` runs both `claude` and `codex` through the real engine — ✅ Verified
- **AC9** (`pnpm run test -- --run` green, lint clean) → 3849 passed / 0 failed / 2 skipped; lint 0 errors on changed files — ✅ Verified

## Contract Coverage

11/11 Component-3 assertions (A021–A031) tagged. (A001–A020 belong to Components 1–2 / Spec 1, built and verified in Phase 1 — not this build.)

- A021 → `verdict.test.ts` "applies when verify deterministically violated verify-independence"
- A022 → `verdict.test.ts` "does not apply when the claim is satisfied"
- A023 → `verdict.test.ts` "does not apply when source is not deterministic (llm channel)"
- A024 → `verdict.test.ts` "different claim id" + "non-verify role" (two tests)
- A025 → `compliance.test.ts` "carries the engine source verbatim onto the record"
- A026 → `verdict.test.ts` "does not apply when source is absent (legacy record)"
- A027 → `verdict.test.ts` "does not apply with no records, and says so openly"
- A028 → `work-proof-guard.test.ts` "exits 1 with the deterministic-veto message" + `verdict-veto-integration.test.ts` force-FAIL (both harnesses)
- A029 → `verdict-veto-integration.test.ts` "records verdict_veto on the written proof entry"
- A030 → `compliance.test.ts` "names the one gating claim instead of asserting verdicts never gate"
- A031 → `proof-compliance-display.test.ts` "renders the APPLIED override line and the forward-only honesty boundary"

## Implementation Decisions

1. **Dedicated `guardVerdictVeto` (print + exit) rather than coercing `proof.result` to FAIL.** The spec offered both. I chose the dedicated guard so the exact Output-Mockup message renders. Consequence: a proof whose veto fires exits before the entry is written, so a *written* `proof_chain.json` entry always carries `verdict_veto.applied === false` — identical in spirit to how `guardFailResult` never writes a FAIL entry. The "result is FAIL" framing of A028 is expressed in the integration test via an `effectiveResult = veto.applied ? 'FAIL' : headline` helper and proven by the exit-1 block.
2. **`renderVerdictVeto` extracted as a module-private helper** so the veto line renders even when there are zero compliance records (AC4's "no captured transcript" path), without growing the public surface (respects `learn-session-memory-C1`: don't over-export from proof.ts).
3. **Veto evaluator scans all attached records** (not just "the" verify record) so the rework edge case — multiple verify sessions where one read the report — gates correctly (spec edge case). Tested.
4. **`source` typed as `?:` (optional), never `| null`** per the Build Brief convention; threaded additively onto the anatrace-pin-locked record (no restructuring).
5. **Engine facts re-verified empirically at build time** (anatrace-core@0.4.0, both harnesses) before writing code: claim id `ana-verify:verify-independence`, predicate `read-paths/not_contains/build_report`, and the `violated`/`source: deterministic` verdict on a `Read` of `build_report.md`. Confirmed a shell-`cat` read does NOT trip the gate (no false positive).

## Deviations from Contract

None — contract followed exactly. All 11 Component-3 assertions are satisfied by tests tagged with their IDs, using the contract's targets and matchers.

(One non-contract test-assertion change is documented under Open Issues: a pre-existing display test asserted the old "never a gate" copy that AC6 required me to change.)

## Test Results

### Baseline (before Phase 2 changes, post-Spec-1)
Command: `pnpm run test -- --run`
Tests: 3826 passed, 0 failed, 2 skipped (3828 total) · 161 test files

### After Changes (sealed)
Command: `ana test --stage build --slug verifier-verdict-honesty`
Tests: 3849 passed, 0 failed, 2 skipped

<!-- ana:capture stage=build slug=verifier-verdict-honesty counts=3849p/0f/2s verdict=pass sha256=edb7b472419f65f0e8719e74d2805c774884227073e0c02181edb6dff025e86a -->

### Comparison
- Tests added: +23 (veto truth table 8, source projection/legacy/docstring 3, guardVerdictVeto 3, integration 5, display 4)
- Tests removed: 0
- Tests modified: 1 (pre-existing incomplete-coverage display assertion updated to the AC6 copy — see Open Issues)
- Regressions: none (skips unchanged at 2)

### New Tests Written
- `tests/utils/verdict.test.ts`: `evaluateReadBuildReportVeto` truth table — all four conditions met → applied; each flipped → not applied; no record → "no captured transcript"; rework edge case.
- `tests/utils/compliance.test.ts`: `projectVerdicts` carries `source`; omits it when absent; docstring names the gating claim.
- `tests/commands/work-proof-guard.test.ts`: `guardVerdictVeto` exits 1 with the deterministic-veto message; no-op when not applied; context label.
- `tests/commands/verdict-veto-integration.test.ts` (new file): real-engine pipeline (capture → assemble → veto → guard) for Claude and Codex; control (no read → no veto); `writeProofChain` records `verdict_veto`.
- `tests/commands/proof-compliance-display.test.ts`: veto APPLIED override line + honesty boundary; "not applied — no captured transcript" with no records; boundary renders once; pre-veto entry renders nothing.

## Verification Commands

```
pnpm run build
(cd packages/cli && pnpm vitest run tests/utils/verdict.test.ts tests/utils/compliance.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/work-proof-guard.test.ts tests/commands/verdict-veto-integration.test.ts tests/commands/proof-compliance-display.test.ts)
pnpm run test -- --run
pnpm run lint
```

## Git History

```
e31df990 [verifier-verdict-honesty:s2] Test compliance docstring names the gating claim
0e3645a0 [verifier-verdict-honesty:s2] Test verdict_veto is recorded on the written entry
c7fe5100 [verifier-verdict-honesty:s2] Render veto status + forward-only honesty boundary
0a80edee [verifier-verdict-honesty:s2] Wire deterministic veto into the proof seal
5701f0ab [verifier-verdict-honesty:s2] Add deterministic read-build-report veto evaluator
e91904d2 [verifier-verdict-honesty:s2] Persist verdict source; verdict_veto on proof entry
```

## Open Issues

1. **Pre-existing display test assertion updated for AC6 (not a weakening).** `tests/commands/proof-compliance-display.test.ts` had a test asserting the incomplete-coverage warning copy `verdicts are evidence, never a gate`. AC6 explicitly required removing that unconditional claim, so I updated the assertion to the new copy (`verdicts are non-gating evidence (except the verify-independence veto below)`). This is a spec-driven expected-value change, not a relaxed matcher — the test still pins exact copy. Recorded for the developer's build-vs-verify comparison.

2. **A written proof entry's `verdict_veto.applied` is always `false`.** Because `guardVerdictVeto` exits the process before the entry is written (mirroring `guardFailResult`), an APPLIED veto never produces a written entry. The APPLIED rendering path (`proof.ts`) is therefore reachable only for entries constructed in tests, not from `writeProofChain` today. This is intentional and consistent with how FAIL proofs are handled, but worth noting: if a future change wants to persist an applied-veto FAIL entry for the dashboard, the guard ordering would need revisiting.

3. **Stale `@ana` tags in two extended test files.** `compliance.test.ts` and `proof-compliance-display.test.ts` carry `@ana A019/A020/A021/A024/A025/A026/...` tags from a PRIOR feature's contract (anatrace-core-integration / anatrace-pin). I left them untouched (not my contract) and added Component-3 tests with the current contract's IDs. A reader scanning `@ana` tags should not assume those legacy tags map to this contract's same-numbered assertions.

Second pass — what I noticed but didn't write down above: nothing further. The reorder was the one risk flagged by the spec; I verified the veto evaluation sits upstream of both the FAIL guard and the entry write by reading the live `writeProofChain` ordering and by an integration test that blocks completion with a PASS headline. No unused imports/params (lint clean). No unhandled spec edge cases (shell-read no-false-positive and rework-multi-session both tested). Verified complete by second pass.
