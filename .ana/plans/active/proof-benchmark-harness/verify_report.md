# Verify Report: Empirical Proof Benchmark — the measuring instrument ("ruler")

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-18
**Spec:** .ana/plans/active/proof-benchmark-harness/spec.md
**Branch:** feature/proof-benchmark-harness

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../proof-benchmark-harness/contract.yaml
  Seal: INTACT (hash sha256:16f4c23ccc2af8e4886474bd18ee69cd8d13710534d46cd02948ea5fa37b38ae)
```

Seal status: **INTACT** — contract unmodified since AnaPlan sealed it.

**Mechanical results (independent verify-stage runs):**
- Build: `pnpm run build` — **clean** (2 tasks successful, build success in 68ms).
- Typecheck: `(cd packages/cli && pnpm exec tsc --noEmit)` — **clean** (exit 0).
- Benchmark suite (focused): `(cd packages/cli && pnpm vitest run tests/benchmark)` — **48 passed / 0 failed**, 2 files.
- Full suite (sealed verify evidence via `ana test --stage verify`): **4117 passed, 0 failed, 2 skipped — verdict: pass.**
  - Sealed marker: `<!-- ana:capture stage=verify slug=proof-benchmark-harness counts=4117p/0f/2s verdict=pass sha256=d530cd49ec828bb0656d0c88420daed11d31ca8b74c0f787b51658ec6cef6620 -->`
- Lint: `pnpm run lint` — **passes (exit 0)**. One **pre-existing** warning ("Unused eslint-disable directive") in `src/utils/git-operations.ts:198`, a file this build does not touch (identical to `main`). Warnings do not change eslint's exit code (the script has no `--max-warnings 0`), so lint is green. Not a regression — see Findings / Deployer Handoff.

Tests: 4117 passed, 0 failed, 2 skipped. Build: clean. Lint: passes (exit 0), 1 pre-existing warning unrelated to this build (no benchmark-introduced lint problems).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Benchmark OFF by default | ✅ SATISFIED | harness.test.ts:57 — `benchmarkEnabled({})` → false; impl harness.ts:53 `env[BENCH_ENV_VAR] === '1'` |
| A002 | ON only when switch exactly on | ✅ SATISFIED | harness.test.ts:69 — `{ANA_BENCH:'1'}` → true |
| A003 | Stray/partial value never enables | ✅ SATISFIED | harness.test.ts:62 — `'0'`/`'true'`/`''` all → false |
| A004 | Scorer never depends on never-deploy branch | ✅ SATISFIED | harness.test.ts:77 source guard; confirmed by inspection — no `devday-scan` in any of scorer/harness/aggregate; imports resolve to forensics/pricing/anatrace-core only |
| A005 | Fixed task loads w/ pinned commit + 3 relevant files | ✅ SATISFIED | harness.test.ts:83; task json has 3 relevantFiles, pinnedCommit, readOnly:true (verified directly) |
| A006 | Absent task returns null (no crash) | ✅ SATISFIED | harness.test.ts:102 — `loadTask('no-such-task')` → null; impl catches readFile error |
| A007 | Real transcript scores (not abstain) | ✅ SATISFIED | harness.test.ts:124 — outcome 'scored' |
| A008 | Counts distinct files opened = 5 | ✅ SATISFIED | harness.test.ts:132 — `distinctFilesRead` 5 |
| A009 | Counts off-target reads = 3 | ✅ SATISFIED | harness.test.ts:136 — `wrongFileReads` 3; full-path (not basename) ranking |
| A010 | Tool calls from shipped provenance = 6 | ✅ SATISFIED | harness.test.ts:138 — `toolCalls` 6, sourced from `deriveTranscript` |
| A011 | Records model | ✅ SATISFIED | harness.test.ts:141 — `model` 'claude-opus-4-8' |
| A012 | $/task from shipped price table = 0.12 | ✅ SATISFIED | harness.test.ts:165 — `costUsd` 0.12 via `computeCost(derived.tokens,...)` |
| A013 | Known model marked priced | ✅ SATISFIED | harness.test.ts:170 — `priced` true |
| A014 | Unknown model unpriced, not $0 | ✅ SATISFIED | harness.test.ts:176 — `priced` false + `contextUtilization` null on unknown model |
| A015 | Redundant reads reported = 0 | ✅ SATISFIED | harness.test.ts:199 — `redundantReads` 0 (`totalReads - distinct`) |
| A016 | Redundant ratio without /0 = 0 | ✅ SATISFIED | harness.test.ts:204; impl guards `totalReads===0 ? 0 : ...` |
| A017 | Peak context held = 2900 | ✅ SATISFIED | harness.test.ts:211 — `analyze().session.context.rootPeakTokens` |
| A018 | Context util as real ratio = 0.0145 | ✅ SATISFIED | harness.test.ts:218 — `rootContextUtilization` |
| A019 | Wall-clock to first correct edit = 10000 | ✅ SATISFIED | harness.test.ts:259 |
| A020 | Turns to first correct edit = 2 | ✅ SATISFIED | harness.test.ts:254 |
| A021 | Input tokens broken out = 16700 | ✅ SATISFIED | harness.test.ts:224 |
| A022 | Cache columns present & separated = 0 | ✅ SATISFIED | harness.test.ts:230 — `cacheReadTokens`/`cacheCreateTokens` |
| A023 | Read-only task leaves edit metrics null | ✅ SATISFIED | harness.test.ts:238 — all three to-first-edit fields null |
| A024 | Unreadable transcript abstains | ✅ SATISFIED | harness.test.ts:319 — outcome 'abstain', reason contains 'unreadable' |
| A025 | Empty transcript abstains ("zero lines") | ✅ SATISFIED | harness.test.ts:327; empty.jsonl = 0 non-empty lines (verified) |
| A026 | Unknown harness abstains | ✅ SATISFIED | harness.test.ts:335 — reason contains 'unknown harness' |
| A027 | Mean across runs = 2 | ✅ SATISFIED | aggregate.test.ts:73 |
| A028 | Sample variance (Bessel n-1) = 1 | ✅ SATISFIED | aggregate.test.ts:80 |
| A029 | Student's-t CI honest (high > 3.2) | ✅ SATISFIED | aggregate.test.ts:95 — `toBeGreaterThan(3.2)` matches matcher `greater`/3.2; plus `toBeCloseTo(4.4841)` |
| A030 | k=1 variance null, not invented | ✅ SATISFIED | aggregate.test.ts:108 — variance/stddev/sem/ci95 all null |
| A031 | k=1 flagged singleRun | ✅ SATISFIED | aggregate.test.ts:119 — `singleRun` true |
| A032 | Per-task win-rate wins = 3 | ✅ SATISFIED | aggregate.test.ts:154 |
| A033 | Abstains counted, not dropped = 2 | ✅ SATISFIED | aggregate.test.ts:182 — `abstainedRuns` 2, cells from scored only |
| A034 | Aggregate byte-identical on identical input | ✅ SATISFIED | aggregate.test.ts:198; impl sorts by (task,metric,arm) — see Findings on test strength |
| A035 | Third arm scores without type rewrite | ✅ SATISFIED | harness.test.ts:294 — `'context-only'` carries through; `Arm = 'bare'\|'scan'\|(string & {})` |
| A036 | No tests_executed best-effort field | ✅ SATISFIED | harness.test.ts:305 source guard; confirmed absent in scorer source |
| A037 | No files_touched best-effort field | ✅ SATISFIED | harness.test.ts:310 source guard; confirmed absent in scorer source |
| A038 | anatrace-core unmodified | ✅ SATISFIED | `git diff --name-only main...HEAD` → 0 anatrace-core files; diff is exclusively new `tests/benchmark/` files + plan artifacts |

All 38 assertions SATISFIED. Each tagged test was read and confirmed to do what its assertion specifies; matchers (`equals`/`contains`/`not_contains`/`greater`) align with the test methods used.

## Independent Findings

**Predictions vs. reality (formed before reading implementation source):**
1. *Predicted a divide-by-zero risk in `redundantReadRatio`* → **Not found.** Explicitly guarded (`totalReads === 0 ? 0 : ...`), exactly what A016 demands.
2. *Predicted the `Arm` widening might not carry a third arm through to the row* → **Confirmed working.** `row.arm` carries `'context-only'`; `(string & {})` is the correct widening idiom and no consumer switches exhaustively on `Arm`.
3. *Predicted float-precision trouble on `contextUtilization` (0.0145)* → **Not found.** Value comes from the shipped `analyze()` surface and the exact-equality test passes.
4. *Predicted determinism might rely on Map insertion order* → **Partly.** The implementation *does* sort explicitly by `(task, metric, arm)` (aggregate.ts:325) — genuinely deterministic. But the A034 test only proves same-input idempotence (see Findings).
5. *Predicted the "lower is better for all metrics" spec guidance could mislead* → **Confirmed as an observation** — see Findings.

**Surprise (not predicted):** `totalTokens` (scorer.ts:137) is a fully-documented **dead export** — nothing imports or calls it. The cost path uses `derived.tokens`; the to-first-edit walk inlines its own `input + output` sum. YAGNI residue from the port.

**Second sweep (areas I did not predict, and what I checked):**
- *Import hygiene across all three modules, not just the guarded scorer:* read every import in `scorer.ts`, `harness.ts`, `aggregate.ts` — all resolve to `node:` built-ins, `anatrace-core`, `../../src/utils/forensics.js`, `../../src/data/pricing.js`, or sibling `./*.js`. No branch import hides in the un-guarded files. A004's source guard is scorer-only, but inspection covers the rest.
- *AC7 best-effort leakage beyond the two guarded strings:* grepped the whole benchmark dir for all four flaky fields (`tests_executed`, `files_touched`, `commands_run`, `failures_encountered`) — present only inside the test guards, never in any source.
- *Over-building:* no scope creep beyond `totalTokens`. The render functions are the ported 5-column demo line unchanged (as the spec mandates); no extra CLI surface, no schema/template/command changes. Confirmed the git diff touches only `tests/benchmark/` + plan artifacts.
- *Gate reachability:* ran the benchmark suite with `ANA_BENCH` unset — 48/48 pass, confirming the mechanism tests are hermetic and the gate only constrains the (out-of-band) agent-RUN suite.
- *Abstain trinary integrity:* verified an edit task that never edits returns `scored` with null edit metrics (harness.test.ts:279), NOT abstain — the trinary is preserved exactly per spec.

## AC Walkthrough

- **AC1 — ported, gated, shipped-surface imports only:** ✅ PASS. All 9 files present under `packages/cli/tests/benchmark/`; gate is `ANA_BENCH=1` (A001–A003); no import resolves to `feature/devday-scan` (A004 + inspection of all three modules); imports resolve to forensics/pricing/anatrace-core. The direct `anatrace-core` import is a shipped dependency (already imported by forensics.ts), satisfying AC1's intent per the spec's documented gotcha — read as a shipped surface, not a deviation.
- **AC2 — ported suite passes; test count does not decrease:** ✅ PASS. Benchmark suite 48/48; full suite 4117 passed / 0 failed. Git diff shows only pure additions (no existing test file modified), so test count strictly increased — the count-gate half (coverage-waived as a CI/process gate) holds by construction.
- **AC3 — $/task via shipped computeCost; priced:false preserved:** ✅ PASS. A012/A013 (priced model → 0.12, priced:true) and A014 (unknown model → priced:false, never $0).
- **AC4 — five reliability metrics from reliable fields:** ✅ PASS. Redundant-read ratio (A015/A016), peak context utilization (A017/A018), wall-clock to first correct edit (A019), turns-to-resolution (A020), cache-decomposed token columns (A021/A022); read-only nulls preserved (A023); abstain trinary intact (A024–A026). All sourced from tokens/tool_calls/turns/duration/context-facts, never best-effort fields (A036/A037).
- **AC5 — aggregate stats, deterministic:** ✅ PASS. Mean ± Student's-t CI (A027–A029), within-cell variance (A028), win-rate (A032), k=1 no-crash (A030/A031), abstain counting (A033), determinism (A034). t-critical lookup table is a static constant table, df>30 falls back to z=1.96 — matches spec.
- **AC6 — Arm widening, no breaking change:** ✅ PASS. A035 — third arm `'context-only'` scores and carries through.
- **AC7 — no metric on best-effort regex fields:** ✅ PASS. A036/A037 + full-dir grep confirm no best-effort field is read anywhere in source.
- **AC8 — anatrace-core unmodified:** ✅ PASS. A038 — 0 anatrace-core files in the diff; package consumed read-only via `parseSession`/`analyze`.
- **New — vitest green, tsc clean, lint clean:** ✅ PASS. Vitest green, `tsc --noEmit` clean, and `pnpm run lint` passes (exit 0). The one warning is a **pre-existing** unused-eslint-disable in `git-operations.ts:198` (untouched by this build); warnings don't fail the lint gate. No benchmark-introduced lint problem.
- **New — benchmark tests reachable without ANA_BENCH=1:** ✅ PASS. Verified — suite runs and passes with the env var unset.

## Blockers

None. Searched specifically for:
- **Contract failures** — all 38 assertions SATISFIED, every tagged test read and confirmed against its matcher/value.
- **Unverified ACs** — all 8 ACs PASS. (Build/typecheck/lint all green: lint exits 0 with one pre-existing, out-of-scope warning.)
- **Regressions** — full suite 4117/0; all changes are net-new files under `tests/benchmark/` importing shipped surfaces read-only; no existing source or test file modified.
- **Fabricated/sentinel tests** — none; assertions are exact-value against committed ground-truth fixtures.
- **anatrace-core / branch leakage** — none (A004/A038 + inspection).
- **Unhandled error paths** — abstain trinary, null-task, unreadable/empty/unknown-harness all covered and tested.

The pre-existing lint warning (lint passes, exit 0) is documented as a finding, not a blocker — it is not introduced by this build (the file is byte-identical to `main`).

## Findings

- **Code — Dead export `totalTokens`:** `packages/cli/tests/benchmark/scorer.ts:137` (exported line 491) — fully JSDoc'd but called by nothing. Cost uses `derived.tokens`; the to-first-edit walk inlines its own `input + output` sum. Zero importers anywhere → genuine YAGNI residue from the port. Safe to delete; the next engineer should not assume it's wired into the cost or token-to-edit math.
- **Code — `aggregate` assumes "lower is better" for every numeric metric:** `packages/cli/tests/benchmark/aggregate.ts:81` — win-rate and `meanReduction` treat all of `NUMERIC_METRICS` (including `distinctFilesRead`, `inputTokens`, `turns`) as "lower wins." An arm that reads *fewer* files because it missed relevant ones would score a spurious "win." This is the spec's explicit modeling choice, so not a defect — but it's a foot-gun: the ruler can reward under-reading. Worth a per-metric direction map if/when a metric where "higher is better" enters `MetricsRow`.
- **Test — AC7 guard is textual, not semantic:** `packages/cli/tests/benchmark/harness.test.ts:305` — A036/A037 assert the scorer *source* does not contain `tests_executed`/`files_touched`. Legitimate enforcement test, but a future read via destructuring-rename or computed key (`derived['files_'+'touched']`) would slip past the substring check. Low risk given the field names are the documented ones; flagged so the next change to the scorer's field access doesn't lean on this guard for safety.
- **Code — to-first-edit metrics can disagree on null-ness:** `packages/cli/tests/benchmark/scorer.ts:321` — `wallClockMsToFirstCorrectEdit` is null when the editing line lacks a parseable `timestamp`, even when `turnsToResolution`/`tokensToFirstCorrectEdit` are populated. Not triggered by the committed fixtures (which carry timestamps), but a real transcript missing one timestamp would emit a partially-null edit-metric triplet. Consider documenting that wall-clock is best-effort relative to the other two.
- **Test — determinism test under-covers the contract intent:** `packages/cli/tests/benchmark/aggregate.test.ts:198` — A034 asserts `JSON.stringify(aggregate(x)) === JSON.stringify(aggregate(x))` (same input twice). The implementation genuinely sorts by `(task, metric, arm)` (aggregate.ts:325), so byte-stability across input permutations holds — but the test would still pass if that explicit sort were removed (Map insertion order is also stable for identical input). A stronger test would shuffle the input rows and assert identical output. The behavior is correct; the test is just weaker than the guarantee.
- **Code (pre-existing, not this build) — long-standing benign lint warning:** `packages/cli/src/utils/git-operations.ts:198` — `pnpm run lint` emits one warning, "Unused eslint-disable directive (no-control-regex)", but **passes (exit 0)**. Root cause: commit `83b2446d [security-hardening]` added `// eslint-disable-next-line no-control-regex` above a control-char strip in `readCoAuthor`, but the cli `eslint.config.js` never enables `no-control-regex` (it doesn't extend `@eslint/js` recommended), so the directive was redundant from the moment it was committed; ESLint v9+ surfaces redundant directives as warnings by default. The file is untouched by this build (byte-identical to `main`). This warning is documented across ~12 prior cycles (active: `verifier-verdict-honesty-C5`; also `simplify-seal-and-test-core-C7`, `cross-machine-provenance-C15`, `rename-capturegate-testevidencegate-C6`). It does **not** fail the lint gate. The clean fix is a one-line deletion of the redundant directive (zero behavior change); worth a `learn`/cleanup task so it stops recurring as noise in every verify.

## Deployer Handoff

- **What ships:** a hermetic, env-gated benchmark "ruler" — scorer, harness, aggregate stats layer, fixtures, and one fixed task — entirely under `packages/cli/tests/benchmark/`. No production command, schema, template, or `anatrace-core` change. Pure addition; zero regression surface.
- **The benchmark mechanism tests run on every `pnpm test`** (they are hermetic). Only the future agent-RUN suite is gated behind `ANA_BENCH=1`.
- **`pnpm run lint` passes (exit 0).** There is one long-standing, benign warning — an unused eslint-disable in `src/utils/git-operations.ts:198`, unrelated to this work and present on `main` for ~12 cycles. It does not block the lint gate. If you want to silence it permanently, drop the redundant `// eslint-disable-next-line no-control-regex` line in `readCoAuthor` — a zero-behavior one-liner, best handled as a separate cleanup/`learn` task. This PR neither causes nor fixes it.
- **`totalTokens` is dead code** — fine to ship, but a good candidate for the cleanup pass; don't build on it assuming it's wired in.

## Verdict

**Shippable:** YES

All 38 contract assertions SATISFIED against committed ground-truth fixtures, all 8 acceptance criteria PASS, build and typecheck clean, full suite 4117 passed / 0 failed with sealed verify-stage evidence. The code is disciplined: shipped-surface consumption only, anatrace-core untouched, abstain trinary preserved, determinism genuinely enforced by explicit sorting. The findings are observations and debt for the next engineer — a dead export, a textual AC7 guard, an under-covering determinism test, and a documented "lower-is-better" modeling choice — none of which block shipping. Lint passes (exit 0); the single warning is a long-standing, benign unused-eslint-disable on `main`, not introduced here, and tracked across many prior cycles. I would stake my name on this benchmark code shipping, with the optional one-line lint cleanup tracked as separate work.
