# Scope: Empirical Proof Benchmark — the measuring instrument ("ruler")

**Created by:** Ana
**Date:** 2026-06-18

## Intent

Harvest the benchmark harness/scorer from the never-deploy `feature/devday-scan`
branch onto `main` as a **deterministic A/B measuring instrument** — a "ruler"
that takes two Claude Code session transcripts (one produced with Anatomia, one
vanilla) and emits a tamper-evident, reproducible comparison: tokens, tool calls,
cost, and the reliability metrics that carry the product's "verified over trusted"
claim.

This scope delivers **only the instrument** — the code that *can* compute the
numbers, with tests proving it computes them correctly. It deliberately produces
**no published number**. Task selection, `relevantFiles` authoring, running the
paired transcripts, `protocol.md`, and corpus choice (golden_7 vs. other) are the
out-of-band measurement *program* — human-driven, no mechanical verification
possible — and are explicitly **out of scope**. Build the ruler first; measure
with it later.

Derived from `REQ-empirical-proof-benchmark.md` (v2). This scope is the REQ's
"~70% already-built infra" half — the half that goes through the pipeline. The
REQ itself states the runs are out-of-band.

## Complexity Assessment

- **Kind:** feature
- **Size:** medium
- **Surface:** cli
- **Files affected:**
  - `packages/cli/tests/benchmark/scorer.ts` (port from branch + per-turn metrics)
  - `packages/cli/tests/benchmark/harness.ts` (port from branch)
  - `packages/cli/tests/benchmark/harness.test.ts` (port from branch)
  - `packages/cli/tests/benchmark/fixtures/*.jsonl` (port from branch)
  - `packages/cli/tests/benchmark/tasks/*.json` (port from branch)
  - `packages/cli/tests/benchmark/aggregate.ts` (NEW — statistics)
  - `packages/cli/tests/benchmark/aggregate.test.ts` (NEW)
  - Consumed (NOT modified): `src/utils/forensics.ts` (`deriveTranscript`),
    `src/data/pricing.ts` (`computeCost`)
- **Blast radius:** Near-zero on the product. All code lives under `tests/`,
  gated behind `ANA_BENCH=1`, imports only shipped surfaces. The published
  `anatrace-core` package is **not** touched. No production command, schema, or
  template changes.
- **Estimated effort:** ~1.5 days (mostly a port + one new stats module).
- **Multi-phase:** no

## Approach

Build a thin benchmark + statistics layer **on top of** the already-shipped
`anatrace-core` engine. We are not building a measurement engine — we already
have one in production. We are giving it a benchmark harness and a stats layer.

Three pieces of work, in dependency order:

1. **Port the scorer + harness** from `feature/devday-scan` behind `ANA_BENCH=1`.
   The branch scorer already imports only shipped surfaces (`deriveTranscript`
   from `forensics`, `TokenCounts` from `pricing`) — verified, no branch-only
   deps. It walks a transcript and produces task-relative scoring against an
   authored `relevantFiles` ground truth. Wire the shipped `computeCost` to add
   a `$/task` column (the engine already prices; the scorer just doesn't call it
   yet).

2. **Add the cheap reliability metrics** in the scorer's own transcript walk:
   redundant/duplicate-read ratio, peak context-window utilization, wall-clock
   time-to-first-correct-edit, steps/turns-to-resolution, cache-decomposed token
   columns. The two that need per-turn granularity (peak-util, redundant-reads)
   are computed in the scorer walk — **not** by extending the published
   `anatrace-core` package, because a benchmark metric must not crack open a
   shipped engine.

3. **Build `aggregate.ts`** — the only genuinely new logic. Takes many scored
   runs and produces per-task pairing → mean ± 95% CI, per-task win-rate
   ("N/N reduced"), and **within-cell variance** across the k runs of a cell.
   `anatrace-core` has no statistical-aggregation surface (verified against its
   ~70 exports) — this is net-new.

Widen the scorer's `Arm` type (today the union `'bare' | 'scan'`) so future arms
(context-only, full-toolbelt, feature-under-test) plug in without a type rewrite.

## Acceptance Criteria

- AC1: The benchmark harness, scorer, fixtures, and task files are present on
  `main` under `packages/cli/tests/benchmark/`, gated behind `ANA_BENCH=1`, and
  import only shipped surfaces (`forensics`, `pricing`) — no import resolves to
  the `feature/devday-scan` branch.
- AC2: The ported benchmark test suite passes (the branch reported 20/20 green
  against `anatrace-core@0.4.0`); test count does not decrease.
- AC3: `scoreTranscript` emits a `$/task` value computed via the shipped
  `computeCost`, with `priced:false` preserved on unknown models (never a
  fabricated cost).
- AC4: The scorer emits all five reliability metrics — redundant/duplicate-read
  ratio, peak context-window utilization, wall-clock time-to-first-correct-edit,
  turns-to-resolution, cache-decomposed token columns — each derived only from
  reliable transcript fields (see AC7).
- AC5: `aggregate.ts` accepts ≥1 scored runs per cell and emits, per task:
  mean ± 95% CI, win-rate, and within-cell variance; given identical input it is
  byte-identical across invocations (deterministic, no clock/network/randomness).
- AC6: The `Arm` type accommodates more than two arms without a breaking change
  to the scorer's public surface.
- AC7: No metric is built on `deriveTranscript`'s best-effort regex-parsed fields
  (`tests_executed`, `files_touched`, `commands_run`) — these are documented
  provenance-only and never verdict-grade. Metrics use tokens / tool_calls /
  turns / duration only.
- AC8: The published `anatrace-core` package is unmodified; no new code is added
  to it for benchmark purposes.

## Edge Cases & Risks

- **Unparseable / truncated / budget-capped transcript** — must abstain
  (`ScoreOutcome: 'abstain'`), never silently score as a low-token win. The
  branch scorer already has abstain-on-unknown; preserve it through the port.
- **Unknown model in cost table** — `computeCost` returns `priced:false`; the
  `$/task` column must surface "unpriced," not `$0`.
- **Single run per cell** — `aggregate.ts` must accept k=1 without dividing by
  zero on variance (report variance as undefined/0 with a flag, not a crash),
  even though the *program* will require k≥3.
- **Best-effort field leakage** — the most insidious risk: building a credibility
  metric on the flaky regex-parsed counts (AC7). Proof chain confirms these are
  never verdict-grade (`session-capture` build concern, reaffirmed in
  `anatrace-core-integration`).
- **Branch drift** — the branch was written against `anatrace-core@0.4.0`; main
  is on the same version (verified). If the derive shape moved, the port must
  adapt to main's `ProvenanceCounts`, not the branch's assumptions.

## Rejected Approaches

- **Port a full forensics/cost engine from the branch.** Rejected — production
  already delegates derive and cost to shipped `anatrace-core`. Re-porting would
  duplicate a shipped engine (violates "the elegant solution removes"). The
  branch scorer already imports the shipped surfaces; we keep it that way.
- **Extend `anatrace-core` to expose per-turn peak-util / redundant-reads.**
  Rejected for v1 — cracking open a published package for a benchmark-only metric
  inverts the dependency. Compute per-turn metrics in the scorer's own walk.
- **Scope the whole REQ (harness + runs + protocol) as one pipeline item.**
  Rejected — the runs are human-driven and have no mechanical verification; Build
  would report "done" while the actual deliverable (a published number) doesn't
  exist. The harness is the pipeline-shaped half; the program is paired sessions.
- **Build arms 3+ (context-only, full-toolbelt) now.** Rejected for this scope —
  the REQ defers them to v2. The `Arm` type is widened (AC6) so they plug in
  later, but no arm logic beyond bare/scan is built here.

## Open Questions

- The exact within-cell variance statistic (sample stddev vs. SEM vs. reporting
  both) and the CI method (normal-approx vs. t-distribution for small k) is a
  design-judgment call for AnaPlan — it determines what `aggregate.ts` computes.
  The REQ pre-registers k≥3 but leaves the estimator open.

## Exploration Findings

### Patterns Discovered
- `feature/devday-scan:packages/cli/tests/benchmark/scorer.ts` — the scorer:
  `scoreTranscript` (line ~275) calls `deriveTranscript` (forensics.js:33),
  `Arm = 'bare' | 'scan'` (line ~40), `MetricsRow` (line ~67), abstain via
  `ScoreResult` union (line ~83), exports `renderMetricsRow`, `totalTokens`.
- `src/data/pricing.ts:16` — `computeCost`, `PRICES`, `PRICE_TABLE_VERSION`
  re-exported from `anatrace-core`; already consumed by `proof.ts:293,485`.
- `src/utils/forensics.ts:305` — `deriveTranscript` returns `ProvenanceCounts`
  (aggregate, not per-turn) or `null` on unparseable; pure (no clock/net/random).

### Constraints Discovered
- [TYPE-VERIFIED] `deriveTranscript` reachable only from tests post-
  `anatrace-core-integration` (production uses `deriveCountsFromBytes`); a
  benchmark/test consumer is exactly its intended remaining use (proof finding
  `anatrace-core-integration-C2`).
- [OBSERVED] `deriveTranscript` `tests_executed`/`files_touched`/`commands_run`
  are best-effort regex parsing, documented provenance-only, never verdict-grade
  (`session-capture` build concern). → AC7.
- [OBSERVED] `ProvenanceCounts` is an aggregate projection; per-turn data
  (needed for peak-util, redundant-reads) is not exposed → compute in scorer walk.
- [INFERRED] `anatrace-core@0.4.0` exports ~70 symbols (compliance, friction,
  cost, derive, coverage, SARIF) but **no** benchmark-scoring or statistical-
  aggregation surface → `aggregate.ts` is net-new, scorer is benchmark-specific.

### Test Infrastructure
- Vitest. Branch ships `harness.test.ts` + fixtures (`bare-claude.jsonl`,
  `edit-claude.jsonl`, `empty.jsonl`) and one task (`proof-history-touch-gate.json`).
  CI gates: lint, typecheck (`tsc --noEmit` via pre-commit), coverage, Node 22+24.
  Test count must not decrease (Active Constraint).

## For AnaPlan

### Structural Analog
`feature/devday-scan:packages/cli/tests/benchmark/scorer.ts` — the closest
structural match is the artifact being ported itself. For the NEW `aggregate.ts`,
the functional analog is `src/utils/proofSummary.ts` (aggregates/statistics over
a set of records — health, trajectory) — same shape of work (reduce many records
to summary stats), different domain. Read both before designing `aggregate.ts`.

### Relevant Code Paths
- `feature/devday-scan:packages/cli/tests/benchmark/` — everything to port
  (`git show feature/devday-scan:<path>` to read without checkout).
- `src/utils/forensics.ts:267-322` — `deriveTranscript` / `deriveCountsFromBytes`.
- `src/data/pricing.ts` — `computeCost` re-export surface.
- `src/commands/proof.ts:293,485` — reference usage of `computeCost` in production.

### Patterns to Follow
- Cost: call `computeCost` from `pricing.js` exactly as `proof.ts` does
  (`{ priceTable: PRICES }`), preserve `priced:false`.
- Determinism: mirror `forensics.ts`'s "no clock/network/randomness" discipline
  in `aggregate.ts` — same input → JSON-identical output (AC5).

### Known Gotchas
- Do NOT build any metric on `tests_executed`/`files_touched`/`commands_run`
  (best-effort regex; AC7).
- Do NOT modify `anatrace-core` (AC8). Per-turn metrics live in the scorer walk.
- The branch `Arm` type is a 2-member union; widening it touches the scorer's
  public surface — confirm no consumer breaks.

### Things to Investigate
- Whether `ProvenanceCounts` exposes any per-turn array; if not (expected),
  the scorer must re-walk the raw JSONL for peak-util / redundant-reads. AnaPlan
  should confirm against main's `anatrace-core@0.4.0` derive shape.
- The variance/CI estimator choice (see Open Questions) — design judgment.
