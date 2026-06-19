# Build Report: Empirical Proof Benchmark — the measuring instrument ("ruler")

**Created by:** AnaBuild
**Date:** 2026-06-18
**Spec:** .ana/plans/active/proof-benchmark-harness/spec.md
**Branch:** feature/proof-benchmark-harness

## What Was Built

All nine files are **created** — `packages/cli/tests/benchmark/` did not exist on `main`.

- `packages/cli/tests/benchmark/scorer.ts` (created): Ported the branch scorer, then extended it. Widened `Arm` to `'bare' | 'scan' | (string & {})`. Extended `MetricsRow` with the five reliability metrics (`redundantReads`/`redundantReadRatio`, `peakContextTokens`/`contextUtilization`, `wallClockMsToFirstCorrectEdit`, `turnsToResolution`, cache-decomposed `inputTokens`/`outputTokens`/`cacheCreateTokens`/`cacheReadTokens`) plus `costUsd`/`priced` and `turns`/`durationMs`. The `localizeClaude` walk was extended in-place (not rewritten) to count total reads, the assistant-turn-to-resolution, and the wall-clock-to-first-edit. Cost comes from the shipped `computeCost(derived.tokens, model, { priceTable: PRICES })`; context facts from the shipped `parseSession` + `analyze().session.context` (`anatrace-core`). Read-only tasks null all three to-first-edit metrics; unknown models map the omitted utilization ratio to `null` and surface `priced:false`.
- `packages/cli/tests/benchmark/harness.ts` (created): Ported verbatim. The widened `Arm` flows through via the import; no logic change.
- `packages/cli/tests/benchmark/harness.test.ts` (created): Ported the branch suite, tagged each test with its `@ana` assertion id, and added new `describe` blocks for cost, the five reliability metrics, the edit-task to-first-edit metrics, the unknown-model unpriced case, `Arm` widening, and the AC7 import-hygiene source checks.
- `packages/cli/tests/benchmark/aggregate.ts` (created): Net-new deterministic statistics layer. `aggregate(results: ScoreResult[]): AggregateReport` — counts abstains, groups scored rows by (task, arm) in run order, emits per-cell stats (mean, sample variance/std-dev with Bessel's correction, SEM, Student's-t 95% CI) and per-task arm comparisons (positional win-rate, mean reduction, dropped runs). Embeds a static t-critical table (df 1–30, z=1.96 fallback). Pure: no clock/random/network/fs.
- `packages/cli/tests/benchmark/aggregate.test.ts` (created): Net-new. Fixed in-memory `MetricsRow`s exercise mean/variance/std-dev/SEM, the t-CI (wider than normal-approx), k=1 no-crash, n=0 all-null metric, win-rate pairing (+ unequal-count dropped runs), abstain counting, and determinism.
- `packages/cli/tests/benchmark/fixtures/{bare-claude,edit-claude,empty}.jsonl` (created): Ported byte-for-byte (sha-verified against the branch). Ground truth for every resolved contract value.
- `packages/cli/tests/benchmark/tasks/proof-history-touch-gate.json` (created): Ported verbatim. The fixed localization task (3 relevant files, `readOnly: true`).

## PR Summary

- Ports the empirical "proof benchmark" (the measuring ruler) onto `main` under `packages/cli/tests/benchmark/`, gated behind `ANA_BENCH=1` so the agent-run suite stays out of default CI while the hermetic mechanism tests run on every `pnpm test`.
- Extends the mechanical transcript scorer with five reliability metrics (redundant-read ratio, root-lane peak-context utilization, wall-clock & turns to first correct edit, cache-decomposed token columns) and a `$/task` cost column, all sourced from shipped surfaces (`forensics`, `pricing`, `anatrace-core`) — never the never-deploy branch and never `anatrace-core`'s flaky best-effort regex fields.
- Adds a net-new deterministic statistics layer (`aggregate.ts`) producing per-cell mean ± Student's-t 95% CI, within-cell variance, and per-task win-rate, with honest small-sample behavior (k=1 flags variance undefined; abstains counted, never dropped).
- Widens the `Arm` type to accept future arms (e.g. `context-only`) with zero breaking change to the scorer's public surface.
- 48 new tests; full suite green at 4117 passed / 0 failed / 2 skipped (baseline +48, no regressions).

## Acceptance Criteria Coverage

- AC1 "ported, gated, shipped-surface imports only" → harness.test.ts gate tests (A001–A003), `loadTask` (A005–A006), and the import-hygiene source check (A004). ✅
- AC2 "ported suite passes; test count does not decrease" → BARE scoring with exact counts (A007–A011); count rose 4069→4117 (+48). ✅
- AC3 "$/task via shipped computeCost, priced flag preserved" → A012 (costUsd 0.12), A013 (priced true), A014 (unknown model → priced false). ✅
- AC4 "five reliability metrics from reliable fields" → redundant (A015–A016), peak/util (A017–A018), wall-clock/turns to edit (A019–A020), cache-decomposed tokens (A021–A022), read-only null (A023), abstain trinary (A024–A026). ✅
- AC5 "aggregate: mean ± 95% CI, win-rate, variance; deterministic" → A027–A034. ✅
- AC6 "Arm accommodates >2 arms" → A035 (`context-only` scores). ✅
- AC7 "no metric on best-effort regex fields" → scorer source contains no `tests_executed`/`files_touched` (A036–A037); metrics use tokens/tool_calls/turns/duration_ms/context facts only. ✅
- AC8 "anatrace-core unmodified" → verified mechanically (see Deviations A038); scorer is a read-only consumer. ✅ (process gate, not a unit test)
- New "vitest green, tsc clean, lint clean" → full suite green; `tsc --noEmit` (both main and test tsconfig) clean; scoped eslint clean. ✅
- New "new tests reachable without ANA_BENCH=1" → all 48 new tests are hermetic mechanism tests; they ran in the default `pnpm test`. ✅

## Implementation Decisions

- **Wall-clock anchor.** `wallClockMsToFirstCorrectEdit` is measured from the first transcript line carrying a parseable timestamp (session start) to the timestamp of the assistant turn that makes the first correct edit. On the edit fixture this is 11:00:10 − 11:00:00 = 10000ms, matching the resolved value. `Date.parse` of a fixed string reads no clock, so determinism holds.
- **`turnsToResolution` counts assistant turns.** Incremented once per assistant turn with a message; captured at the first correct edit (edit fixture → 2). Read-only tasks null it alongside the other to-first-edit metrics.
- **Three reads, by design.** The scorer reads the transcript for the localization line walk (`parseTranscript`), again via `deriveTranscript` (counts), and a third time for `parseSession`/`analyze` (context). The spec endorses the multi-parse for surface clarity; transcripts are tiny. (Logged as an observation.)
- **Aggregate null handling.** Per metric, only non-null values feed a cell; `n` is the non-null count. A metric that is all-null within an otherwise-scored cell surfaces as `n=0`/`mean=null` (never silently dropped). This is how the "n=0" constraint manifests, since an all-abstain (task,arm) produces no scored rows at all.
- **Static t-table precision.** Used the precise textbook `t(0.975, df=2)=4.302653`. See Deviations note on the spec mockup's rounded value.

## Deviations from Contract

### A038: The published measurement engine is consumed, never edited, for the benchmark
**Instead:** Verified mechanically (`git diff --name-only -- '*anatrace-core*'` is empty; the scorer only `import`s `analyze`/`parseSession`/`computeCost`/`PRICES`/`deriveTranscript`) rather than by a tagged unit test.
**Reason:** `anatrace-core` lives in `node_modules`, which is untracked — there is no in-repo path for a unit test to assert a git diff against it. The contract's own target is a `git diff` command, i.e. a process/CI gate, not a runtime assertion.
**Outcome:** Functionally equivalent — the intent ("never modify anatrace-core") is fully met and independently checkable by AnaVerify via the same git command. No `@ana A038` tag exists because there is no test to carry it.

### Ambiguity resolution — `ci95` mockup value
**Instead:** The aggregate emits `ci95.high = 4.48414` for `[1,2,3]`; the spec's illustrative mockup shows `4.484438`.
**Reason:** The mockup used a rounded t-critical; the implementation uses the precise `t(0.975, df=2)=4.302653`. Contract A029 asserts only `ci95.high > 3.2` (matcher `greater`), which holds with wide margin.
**Outcome:** The implementation value is the mathematically correct one. My own test asserts `toBeCloseTo(4.4841, 3)` to match it. No contract assertion is violated.

(No other deviations — the port is byte-faithful and the contract is otherwise followed exactly.)

## Test Results

### Baseline (before changes)
Command: `pnpm run test -- --run` (root `commands.test`), with only the data fixtures/task added (no test code yet).
```
 Test Files  175 passed (175)
      Tests  4069 passed | 2 skipped (4071)
```

### After Changes
Command (sealed via `ana test --stage build --slug proof-benchmark-harness`):
```
✓ captured  counts: 4117 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=proof-benchmark-harness counts=4117p/0f/2s verdict=pass sha256=d8151a0c19e09d70887cbf93871da2f1cba0a3184ab3fd797469ec332f7fd663 -->

Benchmark-suite-only run (`cd packages/cli && pnpm vitest run tests/benchmark`):
```
 Test Files  2 passed (2)
      Tests  48 passed (48)
```

### Comparison
- Tests added: 48 (harness.test.ts + aggregate.test.ts)
- Test files added: 2 (175 → 177)
- Tests removed: 0
- Regressions: none (4069 → 4117 passed = +48; 2 skipped unchanged; 0 failed)

### New Tests Written
- `packages/cli/tests/benchmark/harness.test.ts`: gate, task loading, BARE exact-count scoring, cost (priced/unpriced), all five reliability metrics, edit-task to-first-edit metrics, read-only nulling, Arm widening, AC7 source hygiene, abstain trinary, determinism — 36 tests.
- `packages/cli/tests/benchmark/aggregate.test.ts`: mean/variance/std-dev/SEM, Student's-t CI, k=1 edge, n=0 all-null metric, win-rate + dropped runs, abstain counting, determinism — 12 tests.

## Verification Commands

```bash
# Full suite (root) — expect 4117 passed / 0 failed / 2 skipped
pnpm run test -- --run

# Benchmark suite only — expect 48 passed
(cd packages/cli && pnpm vitest run tests/benchmark)

# Typecheck (both configs the pre-commit hook runs) — expect clean
(cd packages/cli && pnpm exec tsc --noEmit)
(cd packages/cli && pnpm exec tsc --noEmit -p tsconfig.test.json)

# Lint (scoped to new files) — expect clean
(cd packages/cli && pnpm exec eslint tests/benchmark/*.ts)

# AC8 — anatrace-core unmodified (expect empty output)
git diff --name-only -- '*anatrace-core*'
```

## Git History
```
a04275fd [proof-benchmark-harness] Add deterministic aggregate statistics layer
656aafcd [proof-benchmark-harness] Port benchmark ruler + reliability metrics & cost
```

## Open Issues

1. **A038 is a process/git gate, not a unit test.** `anatrace-core` is in untracked `node_modules`, so no test can assert a git diff. Verified mechanically (empty `git diff`, scorer is read-only). Documented as a deviation. (observation / acknowledge)
2. **Spec mockup `ci95.high` (4.484438) vs implementation (4.48414).** The mockup rounded the t-critical; the implementation uses the precise constant. Contract A029 only requires `> 3.2`. Flagged so AnaVerify reads the small difference as correct, not a defect. (observation / monitor)
3. **Scorer reads the transcript three times** (localization lines + `deriveTranscript` counts + `parseSession`/`analyze` context). Spec-endorsed for surface clarity; transcripts are tiny. (observation / monitor)
4. **Pre-commit lint reports 1 warning (0 errors)** over the staged set — not in any benchmark file (scoped eslint on the five new files is clean). Pre-existing, not introduced here. (observation / acknowledge)

Second pass — re-examined for unused exports (`totalTokens` is exported and part of the ported public surface, not dead), unhandled spec edge cases (unknown-model utilization null, k=1, n=0, unequal-arm dropped runs all covered), and assumptions about external state (none — all metrics are pure functions of committed fixture bytes). The four items above are the complete set; all are observations, none blocking.
