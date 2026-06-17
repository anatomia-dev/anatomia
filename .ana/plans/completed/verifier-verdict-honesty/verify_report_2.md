# Verify Report: Verdict Honesty — Component 3 (deterministic read-build-report veto)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-16
**Spec:** .ana/plans/active/verifier-verdict-honesty/spec-2.md
**Branch:** feature/verifier-verdict-honesty

> Scope: Phase 2 only (Component 3, assertions A021–A031). Phase 1 (A001–A020) was verified
> independently in verify_report_1.md and is out of scope here.

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../verifier-verdict-honesty/contract.yaml
  Seal: INTACT (hash sha256:4ccdd83ffe148da425aad8c8d4b8f85838bada357f60b34d23cd13f0a2694bcd)
```

Seal **INTACT** — contract unmodified since AnaPlan sealed it.

`ana plan coverage` is not available in this CLI build (v1.2.2) — the subcommand does not exist
(`error: unknown command 'plan'`). I used contract.yaml directly as the assertion checklist and
walked the spec's Acceptance Criteria manually. No coverage map was available to cross-reference
waived/judgment ACs; AC coverage below is assessed by direct inspection.

**Tests:** 3849 passed, 0 failed, 2 skipped (full suite, sealed via `ana test --stage verify`).
Focused Phase 2 files (compliance + verdict + proof-compliance-display): 57 passed.
**Build:** success (`pnpm run build`, exit 0). **Lint:** clean (`pnpm run lint`, exit 0).

Sealed verify-stage evidence marker:
```
<!-- ana:capture stage=verify slug=verifier-verdict-honesty counts=3849p/0f/2s verdict=pass sha256=2f0dc9ddfb325675f714a99ebbe766277eee9a62bb2c4e65e2de535ff4b03398 -->
```

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A021 | Deterministic build-report read forces FAIL (all four conditions) | ✅ SATISFIED | `verdict.ts:66-87` checks role+claim_id+status+source; `tests/utils/verdict.test.ts:234` asserts `applied===true` and reason contains `build_report.md`; integration test (real engine) `verdict-veto-integration.test.ts:131` |
| A022 | Satisfied verify-independence claim does not trigger veto | ✅ SATISFIED | `tests/utils/verdict.test.ts:241` flips status→`satisfied`, asserts `applied !== true` |
| A023 | Non-deterministic (llm/unmarked) verdict never triggers veto | ✅ SATISFIED | `verdict.ts:79` requires `source==='deterministic'`; `tests/utils/verdict.test.ts:249` uses `source:'llm'`, asserts `applied !== true` |
| A024 | Veto fires on exactly one claim, one role | ✅ SATISFIED | `tests/utils/verdict.test.ts:265` (wrong claim_id) and `:273` (role `build`) both assert `applied !== true` |
| A025 | Determinism signal persisted onto the compliance record | ✅ SATISFIED | `compliance.ts:99-108` projects `source` verbatim; `tests/utils/compliance.test.ts:327` asserts `projected[0].source==='deterministic'` |
| A026 | Pre-feature records (no source) never retroactively gate | ✅ SATISFIED | `verdict.ts:79` non-match on absent source; `tests/utils/verdict.test.ts:257` deletes `source`, asserts `applied !== true`; projection omits absent source (`compliance.test.ts:339`) |
| A027 | No transcript → veto skipped openly with stated reason | ✅ SATISFIED | `verdict.ts:69-71` returns `{applied:false, reason:'no captured transcript'}`; `tests/utils/verdict.test.ts:279` asserts reason contains `no captured transcript` |
| A028 | A verify session that read the build report cannot complete with PASS | ✅ SATISFIED | `work-proof.ts:354-355` evaluates+guards upstream of write; `work-proof-guard.test.ts:111` asserts `exit 1`; integration `verdict-veto-integration.test.ts:131` force-FAILs PASS headline through the real engine, both harnesses |
| A029 | Proof entry carries the verdict_veto status | ✅ SATISFIED | `types/proof.ts:319` declares `verdict_veto?`; `work-proof.ts:416` records it; `verdict-veto-integration.test.ts:197` asserts entry carries `verdict_veto` with `no captured transcript` |
| A030 | Compliance docstring names the one gating claim | ✅ SATISFIED | `compliance.ts:22-27` "gates the proof when violated + source: deterministic"; `tests/utils/compliance.test.ts:436` asserts contains `gates the proof` + claim id, NOT `EVIDENCE, never a gate` |
| A031 | Attestation renders the forward-only honesty boundary | ✅ SATISFIED | `proof.ts:690-702` renders APPLIED/not-applied + `forward-only` line; `proof-compliance-display.test.ts:137,150` assert both render paths; `:159` asserts boundary renders exactly once |

All 11 Phase 2 assertions SATISFIED. Each tagged test was read; none are sentinels — the veto
truth table flips each of the four conditions independently, and the integration test drives the
**real** anatrace-core 0.4.0 engine (not a stubbed verdict) end-to-end.

## Independent Findings

**The load-bearing reorder is correct.** The spec flagged `work-proof.ts` ordering as "the one
place Component 3 can go subtly wrong." Tracing `writeProofChain`: compliance assembled (`:336`),
veto evaluated (`:354`), `guardVerdictVeto` (`:355`), `guardFailResult` (`:359`), entry built
(`:406`), chain written (`:609`). The veto sits upstream of **both** the FAIL guard and the seal
write. Prediction #1 (subtly-wrong ordering) — **not confirmed**; the builder got it right and
documented why (`:329-335`, `:413-415`).

**Predictions resolved:**
- #2 forward-only absent-source mishandling — **not found**: `verdict.ts:79` requires
  `=== 'deterministic'`; `compliance.ts:107` omits an absent source; an explicit legacy-record test exists.
- #3 only-3-of-4 conditions / keying on `reason` — **not found**: all four conditions checked, gate
  keys on `source` per the spec constraint, never `reason`.
- #4 no-record reason string mismatch — **not found**: exact `'no captured transcript'`, asserted.
- #5 codex fixture thin/missing — **not found**: a real codex rollout fixture runs through the real
  engine; both harnesses exercised (AC8).
- Production risk (Bash/Grep substring read) — the engine's `read-paths` projection binds only to the
  `Read` tool's `file_path`, so a diff-scoping `grep build_report` does not gate. This is an
  anatrace-core guarantee and is **not** exercised in Anatomia's own suite (see Findings).

**Second sweep (beyond predictions).** I read the docstrings and user-facing copy around the
evidence→gate flip the spec called out. The spec's gotcha said `compliance.ts` and `proof.ts` copy
"become false; update or AnaVerify will flag a doc-vs-behavior contradiction." Both named files were
updated correctly. But the same unconditional "never a gate" invariant survives in two unlisted
places: three docstrings in `types/proof.ts` (`:193`, `:228`, `:380`) and — more notably — a
user-facing stderr warning in `work-proof.ts:345`, whose sibling display copy in `proof.ts:670` WAS
qualified with "(except the verify-independence veto below)". The builder knew to qualify it in one
location and missed the sibling. Behavior is correct; this is documentation/copy drift, recorded in
Findings.

**Over-building / YAGNI:** none. `evaluateReadBuildReportVeto`, `guardVerdictVeto`,
`renderVerdictVeto`, `VERIFY_INDEPENDENCE_CLAIM_ID`, and the `ReadBuildReportVeto` type are each
imported and used in production paths. The veto evaluator is pure (records in → decision out), as the
spec required. No dead branches in the new code.

## AC Walkthrough

- **AC1** (four-condition force-FAIL, forward-only): ✅ PASS — `verdict.ts:66-87` + truth table +
  real-engine integration test.
- **AC2** (satisfied / non-verify / non-allowlisted / non-deterministic do not gate): ✅ PASS —
  `tests/utils/verdict.test.ts:241,249,265,273`.
- **AC3** (source persisted; old records non-gating): ✅ PASS — `compliance.ts:99-108`;
  `compliance.test.ts:327,339`.
- **AC4** (capture off / no record → no veto, headline stands, states "no captured transcript"):
  ✅ PASS — `verdict.ts:69-71`; integration `:197` asserts the written entry records
  `verdict_veto.applied=false, reason='no captured transcript'`.
- **AC5** (veto upstream of write + FAIL guard; build-report-read fixture blocks completion):
  ✅ PASS — ordering verified by reading `work-proof.ts:354-359` vs write `:609`; integration test
  force-FAILs a PASS headline and `guardVerdictVeto` exits 1.
- **AC6** (compliance.ts docstring + proof.ts attestation copy no longer claim "never gate"
  unconditionally; honesty-boundary renders once): ✅ PASS — the two **named** files are updated
  (`compliance.ts:22-27`, `proof.ts:587-591`), and the boundary renders exactly once
  (`proof-compliance-display.test.ts:159`). NOTE: the AC's named files pass, but the same invariant
  still appears unconditionally in `types/proof.ts` and `work-proof.ts:345` (see Findings) — these are
  outside AC6's named scope, so they do not fail the AC.
- **AC7** (no pass-rate / green-rate added, only the honesty line): ✅ PASS — grep for
  pass-rate/green-rate finds only pre-existing first-pass-rate (rejection-cycle) metrics; no new rate
  added for this feature.
- **AC8** (codex parity; codex fixture exercises the gate): ✅ PASS — integration test loops
  `['claude','codex']` through the real engine.
- **AC9** (suite green, lint clean): ✅ PASS — 3849 passed / 0 failed / 2 skipped; lint exit 0.

## Blockers

None. I searched for: (1) veto computed after the seal write (it is computed at `:354`, write at
`:609` — upstream, correct); (2) a fourth condition omitted or `reason`-keyed gating (all four present,
keyed on `source`); (3) absent-source treated as gating (it is non-gating, with an explicit test);
(4) unused exports in the new code (all imported in production); (5) a missing codex path (present, real
engine, both harnesses); (6) silent skip on no transcript (stated openly as `no captured transcript`,
asserted). Nothing qualifies as a blocker — the contract is fully satisfied and the load-bearing reorder
holds.

## Findings

- **Code — `types/proof.ts` still asserts verdicts are "EVIDENCE, NEVER A GATE" unconditionally:**
  `packages/cli/src/types/proof.ts:193` (`status … EVIDENCE ONLY — never gates`), `:228`, and `:380`
  carry the now-imprecise unconditional invariant. The verify-independence veto gates the seal
  (blocks completion), so these three docstrings describe behavior the code no longer guarantees for
  that one claim. Debt — the spec's own gotcha was about exactly this contradiction; it was fixed in
  `compliance.ts`/`proof.ts` but not here.
- **Code — user-facing "never a gate" warning left unqualified:** `packages/cli/src/commands/work-proof.ts:345`
  prints `behavioral verdicts are evidence, never a gate.` to stderr, while the parallel display copy
  in `proof.ts:670` was correctly qualified with `(except the verify-independence veto below)`. The
  inconsistency means a user who triggers the incomplete-coverage path is told verdicts never gate,
  one line before the veto can block their completion. Debt; recommend mirroring the proof.ts qualifier.
- **Upstream — spec enumerated only 2 of 4 files carrying the flipped invariant:** the spec gotcha
  named `compliance.ts:22-23` and `proof.ts` copy, but `types/proof.ts` (3 docstrings) and the
  `work-proof.ts` stderr warning also asserted "never a gate." A future evidence→gate flip should
  grep the whole tree for the invariant string, not patch the enumerated files. Promote candidate:
  "when flipping a documented invariant, update every site stating it, not just the spec's list."
- **Test — Bash/Grep substring read of the build report is not exercised in Anatomia's suite:**
  `verdict-veto-integration.test.ts` covers the `Read`-tool positive and the no-read control, but the
  spec's edge case (reading `build_report` via Bash/Grep must NOT gate) relies on anatrace-core's
  read-paths projection and is not pinned by an Anatomia test. A future engine bump could widen
  read-paths and silently introduce a false-positive veto. Observation — monitor; the engine
  currently guarantees precision 1.0 on `Read` `file_path`.

## Deployer Handoff

This is Phase 2 of 2 (Component 3). Phase 1 (A001–A020) was already verified (verify_report_1.md).
With both phases now verified, this branch is ready for PR. The change is behaviorally sound: the
deterministic read-build-report veto is wired upstream of the seal, keys on the stable `source`
channel, is forward-only (old records never retroactively gate), fails open-but-surfaced, and works
for both harnesses against the real engine. The four Findings are documentation/copy drift and one
untested engine-guaranteed edge case — none affect runtime behavior. Consider folding the two doc fixes
(`types/proof.ts`, `work-proof.ts:345`) into a follow-up so the "never a gate" copy is consistent
across the whole codebase.

## Verdict

**Shippable:** YES

All 11 Phase 2 assertions SATISFIED, all 9 acceptance criteria PASS, full suite green (3849/0/2),
lint clean, build clean. I read every new/modified Component 3 source file and every tagged Phase 2
test; the integration test drives the real anatrace-core engine end-to-end across both harnesses and
the load-bearing reorder is verifiably upstream of the seal. The four Findings are non-blocking
documentation/copy drift and one engine-guaranteed edge case left untested. I would stake my name on
this shipping.
