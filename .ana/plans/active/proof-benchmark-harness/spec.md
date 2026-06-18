# Spec: Empirical Proof Benchmark — the measuring instrument ("ruler")

**Created by:** AnaPlan
**Date:** 2026-06-18
**Scope:** .ana/plans/active/proof-benchmark-harness/scope.md

## Approach

Port the benchmark harness, scorer, fixtures, and task from `feature/devday-scan`
onto `main` under `packages/cli/tests/benchmark/`, gated behind `ANA_BENCH=1`.
Then extend the scorer with five reliability metrics and a `$/task` cost column,
widen the `Arm` type, and build the only genuinely new module — `aggregate.ts`,
a deterministic statistics layer.

Everything consumes **shipped** surfaces. The published `anatrace-core` package
is never modified (AC8). No production command, schema, or template changes.

**The three shipped surfaces the scorer consumes:**

1. **Provenance counts** — `deriveTranscript(path, harness)` from
   `src/utils/forensics.js`, returning `ProvenanceCounts` (tokens, `tool_calls`,
   `turns`, `duration_ms`, `model`). This is the named consumed surface from the
   scope, and proof finding `anatrace-core-integration-C2` confirms a
   test/benchmark consumer is exactly its intended remaining use. Keep using it.

2. **Cost** — `computeCost(tokens, model, { priceTable: PRICES })` from
   `src/data/pricing.js`, exactly as `proof.ts` calls it. Returns
   `{ cost_usd, priced, price_table_version }`. Preserve `priced:false` for
   unknown models — surface "unpriced," never a fabricated `$0` (AC3).

3. **Context facts (the design change)** — `analyze(session).session.context`
   from `anatrace-core`, returning `ContextFacts`:
   - `rootPeakTokens` — max over the ROOT lane's assistant turns of
     `input + cache_read + cache_create` (excludes output, excludes subagent
     churn). This IS the peak-context-utilization numerator.
   - `rootContextUtilization` — `rootPeakTokens / contextLimit(model)`, a real
     ratio against `anatrace-core`'s bundled `CONTEXT_LIMITS` table. Present only
     for a known model; **omitted (never guessed) for an unknown model** → map to
     `null`.
   - `contextLimitsVersion` — the limit-table version the ratio was computed
     against.

   The session is produced via `parseSession([{ name, bytes }], harness)` — the
   same parser `forensics.ts` uses. This is a **shipped** anatrace-core surface
   (a direct dependency of `packages/cli`, already imported by `forensics.ts`) —
   it does not resolve to the branch, and it does not modify the package.

   **Why this diverges from the scope's "compute peak-util in the scorer walk":**
   The scope's exploration only inspected `deriveTranscript`/`ProvenanceCounts`
   (aggregate-only) and concluded a hand-walk was required. But `analyze()`
   already ships exactly this metric, with two properties a hand-walk cannot
   match: (a) the `CONTEXT_LIMITS` table is **not** independently exported, so a
   scorer walk could only ever emit raw peak tokens, never the utilization
   *ratio* AC4 asks for; (b) the shipped surface is **root-lane-scoped**
   (gameability-hardened) — a naive walk merging subagent turns would be wrong
   and gameable. This is the consume-a-shipped-surface pattern the scope already
   endorses for `deriveTranscript`/`computeCost` — NOT the rejected
   "extend anatrace-core" approach (we add nothing to the package). Developer
   confirmed this sourcing.

**What stays in the scorer's own localization walk** (genuinely benchmark-
specific — no shipped surface exists): distinct-file-reads, wrong-file-reads,
redundant/duplicate-reads, and the three "to-first-correct-edit" metrics
(tokens, turns, wall-clock). The branch scorer already has the per-turn walk
(`localizeClaude`) that tracks reads and running tokens deduped by `requestId` —
extend it; do not rewrite it.

**`aggregate.ts`** is the net-new statistics module. It reduces many scored runs
to per-cell summary stats and per-task arm comparisons. Estimator decisions
(resolving the scope's open question) are in **Constraints** below.

**Single parse vs. double parse (deliberate):** the scorer calls
`deriveTranscript` (for counts) AND `parseSession`+`analyze` (for context facts)
— two parses of the same small transcript. This is intentional: each metric
family arrives through its own named shipped surface, and it keeps
`deriveTranscript` as the documented test consumer rather than orphaning it.
Transcripts are tiny; surface clarity beats micro-optimizing one parse.

## Output Mockups

The one-line demo render (`renderMetricsRow` / `renderTable`) is **ported
verbatim and unchanged** — the new metrics are emitted as structured
`MetricsRow` fields, not crammed into the demo line. This keeps the ported render
tests passing as-is (format is not the deliverable; the data is).

The ported demo line is unchanged:

```
task=proof-history-touch-gate  model=claude-opus-4-8
  BARE | 5 files | 3 wrong | 6 tools | n/a tok
```

A scored `MetricsRow` (structured — what AC4 calls "emits"), BARE arm on the
`bare-claude.jsonl` fixture (read-only task):

```jsonc
{
  "taskId": "proof-history-touch-gate",
  "arm": "bare",
  "distinctFilesRead": 5,
  "wrongFileReads": 3,
  "redundantReads": 0,
  "redundantReadRatio": 0,
  "tokensToFirstCorrectEdit": null,      // read-only task
  "turnsToResolution": null,             // read-only task
  "wallClockMsToFirstCorrectEdit": null, // read-only task
  "toolCalls": 6,
  "turns": 7,
  "durationMs": 60000,
  "inputTokens": 16700,
  "outputTokens": 1460,
  "cacheCreateTokens": 0,
  "cacheReadTokens": 0,
  "peakContextTokens": 2900,             // analyze().session.context.rootPeakTokens
  "contextUtilization": 0.0145,          // rootContextUtilization (2900 / 200000)
  "costUsd": 0.12,                        // computeCost over the full token set
  "priced": true,
  "model": "claude-opus-4-8"
}
```

An aggregate cell (per task × metric × arm) and an arm comparison:

```jsonc
// CellStats for metric "toolCalls", arm "scan", over 3 runs with values [1,2,3]
{
  "task": "T", "arm": "scan", "metric": "toolCalls",
  "n": 3,
  "mean": 2,
  "sampleVariance": 1,
  "sampleStdDev": 1,
  "sem": 0.5773502692,
  "ci95": { "low": -0.484438, "high": 4.484438 },  // Student's t, df=2 (t=4.303)
  "singleRun": false
}

// ArmComparison for (task T, metric toolCalls): scan reduced it in every paired run
{
  "task": "T", "metric": "toolCalls",
  "baselineArm": "bare", "comparisonArm": "scan",
  "winRate": { "wins": 3, "total": 3 },
  "meanReduction": 4,
  "pairedRuns": 3,
  "droppedRuns": 0
}
```

A single-run cell (k=1) must not crash — variance/CI undefined, flagged:

```jsonc
{ "task": "T", "arm": "scan", "metric": "toolCalls",
  "n": 1, "mean": 5,
  "sampleVariance": null, "sampleStdDev": null, "sem": null, "ci95": null,
  "singleRun": true }
```

## File Changes

The machine-readable `file_changes` list is in contract.yaml. All paths below are
**create** — `packages/cli/tests/benchmark/` does not exist on `main` (verified).

### packages/cli/tests/benchmark/scorer.ts (create)
**What changes:** Port the branch scorer, then extend `MetricsRow` with the new
structured fields and populate them. Keep the existing `localizeClaude` walk;
add redundant-read counting and the turns/wall-clock-to-first-correct-edit
trackers alongside the existing tokens tracker. Add cost via `computeCost`. Add
context facts via `parseSession`+`analyze`. Widen `Arm`.
**Pattern to follow:** The branch scorer
(`feature/devday-scan:packages/cli/tests/benchmark/scorer.ts`) is the structural
analog — mirror its abstain-on-unknown discipline, its safe-narrowing readers,
and its requestId-deduped token accumulation. For cost, mirror
`src/commands/proof.ts` (`computeCost(d.tokens, d.model, { priceTable: PRICES })`,
unpriced → "n/a", never "$0.00").
**Why:** Without it there is no ruler — no mechanical, deterministic scoring of a
transcript against ground truth.

### packages/cli/tests/benchmark/harness.ts (create)
**What changes:** Port verbatim. The harness is a thin orchestration layer over
`scoreTranscript` (gate, task loading, `runArm`, `renderTable`). No new logic
beyond carrying the widened `Arm` through.
**Pattern to follow:** The branch harness — `benchmarkEnabled` is the single
`ANA_BENCH=1` gate; `parseTask`/`loadTask` validate load-bearing fields and
return `null` (never throw) on malformed input.
**Why:** The gate keeps a slow, transcript-dependent suite out of default CI; the
loaders make tasks data, not code.

### packages/cli/tests/benchmark/harness.test.ts (create)
**What changes:** Port the branch test suite verbatim, then ADD tagged tests for
the new metrics (the `@ana` assertions enumerated in contract.yaml). The ported
tests already assert exact counts (5 files / 3 wrong / 6 tools), the abstain
cases, the gate, and determinism — keep them. Add new `describe` blocks for the
reliability metrics, cost, context facts, and `Arm` widening.
**Pattern to follow:** The branch test file's structure (`describe` per concern,
narrow-then-assert on the `ScoreResult` union, fixtures resolved via
`import.meta.dirname`).
**Why:** AC2 — the ported suite must pass and test count must not decrease.

### packages/cli/tests/benchmark/fixtures/bare-claude.jsonl (create)
### packages/cli/tests/benchmark/fixtures/edit-claude.jsonl (create)
### packages/cli/tests/benchmark/fixtures/empty.jsonl (create)
**What changes:** Port byte-for-byte from the branch
(`git show feature/devday-scan:<path>`). These encode the exact ground-truth
values the contract asserts — do not regenerate or edit them.
**Why:** The contract's resolved values (peak 2900, util 0.0145, cost $0.12,
tokens-to-edit 1800, wall-clock 10000ms) are computed FROM these exact bytes.

### packages/cli/tests/benchmark/tasks/proof-history-touch-gate.json (create)
**What changes:** Port verbatim. Carries `id`, `prompt`, `pinnedCommit`,
`relevantFiles` (3 paths), `readOnly: true`.
**Why:** The fixed localization task the BARE fixture is scored against.

### packages/cli/tests/benchmark/aggregate.ts (create)
**What changes:** Net-new. `aggregate(results: ScoreResult[]): AggregateReport`.
Filters scored rows (counts abstains into `abstainedRuns`), groups by
(task, arm), and for each numeric metric computes per-cell stats and per-task
arm comparisons. See **Testing Strategy** and **Constraints** for the exact
estimators and edge behavior.
**Pattern to follow:** The functional analog is `src/utils/proofSummary.ts`
(`generateProofSummary` — reduce many records to a typed summary object). Same
shape of work, different domain. The stats math is net-new; mirror forensics'
determinism discipline (no clock/network/randomness).
**Why:** AC5 — the only way to turn k paired runs into mean ± CI, win-rate, and
within-cell variance. `anatrace-core` has no statistical-aggregation surface.

### packages/cli/tests/benchmark/aggregate.test.ts (create)
**What changes:** Net-new. Tagged tests for the aggregate assertions in
contract.yaml — fixed-input stats (mean/variance/stddev), the t-distribution CI
(wider than normal-approx), k=1 no-crash, win-rate, determinism, abstain
counting.
**Why:** AC5 — proves the stats compute correctly and deterministically.

## Acceptance Criteria

Copied from scope, expanded with implementation-specific criteria:

- [ ] AC1: Harness, scorer, fixtures, and task present on `main` under
  `packages/cli/tests/benchmark/`, gated behind `ANA_BENCH=1`; no import resolves
  to `feature/devday-scan`. Imports resolve only to shipped surfaces
  (`forensics`, `pricing`, `anatrace-core`).
- [ ] AC2: The ported benchmark suite passes; total test count does not decrease.
- [ ] AC3: `scoreTranscript` emits a `costUsd` computed via the shipped
  `computeCost`, with `priced:false` preserved on unknown models (never `$0`).
- [ ] AC4: The scorer emits all five reliability metrics — redundant-read ratio,
  peak context utilization, wall-clock time-to-first-correct-edit,
  turns-to-resolution, cache-decomposed token columns — each from reliable
  transcript fields (see AC7).
- [ ] AC5: `aggregate.ts` accepts ≥1 scored runs per cell and emits, per task:
  mean ± 95% CI, win-rate, within-cell variance; byte-identical across
  invocations on identical input.
- [ ] AC6: `Arm` accommodates >2 arms without a breaking change to the scorer's
  public surface.
- [ ] AC7: No metric is built on `deriveTranscript`'s best-effort regex fields
  (`tests_executed`, `files_touched`, `commands_run`, `failures_encountered`).
  Metrics use tokens / `tool_calls` / `turns` / `duration_ms` / context facts only.
- [ ] AC8: `anatrace-core` is unmodified; no new code added to it.
- [ ] New: `pnpm vitest run` green in `packages/cli`; `tsc --noEmit` clean
  (pre-commit gate); lint clean.
- [ ] New: the new benchmark tests are reachable without `ANA_BENCH=1` (the
  mechanism tests are hermetic; only an agent-RUN suite would gate).

## Testing Strategy

- **Unit tests (scorer):** Score the ported fixtures and assert the exact
  resolved values below. All cache fields in the fixtures are 0.

  | Metric (field) | BARE on `bare-claude.jsonl` (read-only) | EDIT-task on `edit-claude.jsonl` (`readOnly:false`) |
  |---|---|---|
  | `distinctFilesRead` | 5 | 1 |
  | `wrongFileReads` | 3 | 0 |
  | `redundantReads` | 0 | 0 |
  | `redundantReadRatio` | 0 | 0 |
  | `toolCalls` | 6 | 2 |
  | `turns` | 7 | 3 |
  | `durationMs` | 60000 | 20000 |
  | `inputTokens` | 16700 | 1900 |
  | `outputTokens` | 1460 | 380 |
  | `cacheCreateTokens` | 0 | 0 |
  | `cacheReadTokens` | 0 | 0 |
  | `peakContextTokens` | 2900 | 1000 |
  | `contextUtilization` | 0.0145 | 0.005 |
  | `costUsd` | 0.12 | 0.019 |
  | `priced` | true | true |
  | `tokensToFirstCorrectEdit` | null | 1800 |
  | `turnsToResolution` | null | 2 |
  | `wallClockMsToFirstCorrectEdit` | null | 10000 |
  | `model` | claude-opus-4-8 | claude-opus-4-8 |

  (The "EDIT-task" column reuses the SAME loaded task with `readOnly` overridden
  to `false`, exactly as the branch test does: `{ ...loadTask(TASK_ID)!,
  readOnly: false }`, scored against `edit-claude.jsonl`.)

- **Unit tests (abstain, port verbatim):** unreadable path → `abstain` reason
  contains "unreadable"; `empty.jsonl` → "zero lines"; harness `'gemini'` →
  "unknown harness"; harness `'codex'` → "codex". A `null`
  tokens-to-first-correct-edit on an edit task that never edits is `scored`
  (a real poor result), NOT abstain.

- **Unit tests (aggregate):** Use fixed in-memory `MetricsRow`s — no transcripts.
  - Metric values `[1, 2, 3]` for one (task, arm) cell → `n=3`, `mean=2`,
    `sampleVariance=1`, `sampleStdDev=1`, `sem≈0.5773502692`, `singleRun=false`.
  - **t-distribution CI:** with the above, `ci95.high` ≈ 4.4844 (t, df=2,
    t=4.302653) — assert `ci95.high > 3.2`, which discriminates the t-interval
    from a normal-approx interval (z-bound ≈ 3.13). This proves the small-sample
    estimator is t, not z.
  - **k=1:** single row → `mean` set, `sampleVariance/sampleStdDev/sem/ci95 =
    null`, `singleRun=true`. No throw, no divide-by-zero.
  - **Win-rate:** baseline `bare` and comparison `scan`, 3 positional pairs where
    `scan` < `bare` on a metric → `winRate = { wins: 3, total: 3 }`.
  - **Abstain counting:** feed N abstains + M scored → `abstainedRuns === N`,
    cells built only from the M scored.
  - **Determinism:** `JSON.stringify(aggregate(rows))` identical across two calls.

- **Edge cases:** unknown model → `contextUtilization` null (never guessed),
  `priced:false`, `costUsd` not surfaced as real; k=1 variance null+flag;
  all-abstain cell surfaces as `n=0` (not silently dropped).

## Dependencies

- `anatrace-core` (already a direct dependency of `packages/cli`; `forensics.ts`
  imports `parseSession`/`deriveCounts`/`analyze`-adjacent symbols from it).
- The shipped `deriveTranscript` (forensics) and `computeCost`/`PRICES`
  (pricing) — present on `main`, unmodified.
- Vitest (existing test runner).

## Constraints

- **Determinism (AC5):** `aggregate.ts` and the scorer must be pure — no clock,
  no `Math.random`, no network, no filesystem ordering dependence. Same input →
  `JSON.stringify`-identical output. Sort all grouped output by (task, metric,
  arm) string order so iteration is stable.
- **Estimators (resolves the scope's open question):**
  - Within-cell spread: **sample variance and sample standard deviation** with
    Bessel's correction (divide by `n-1`). `sem = sampleStdDev / sqrt(n)`.
  - 95% CI of the mean: **Student's t**, two-tailed, `df = n-1`:
    `mean ± t(0.975, df) * sem`. NOT normal-approx — at the pre-registered k≥3,
    z=1.96 understates the interval (t for df=2 is 4.303); an overconfident CI is
    exactly the overclaim "verified over trusted" forbids. Embed a static
    t-critical lookup table for `df` 1–30 at 95% two-tailed; fall back to 1.96
    for `df > 30`. (t-criticals are mathematical constants, not fabricated data —
    content-stable, deterministic.)
  - `n=1`: `mean` = the single value; `sampleVariance`, `sampleStdDev`, `sem`,
    `ci95` = `null`; `singleRun = true`. Never divide by zero.
  - `n=0` (cell all-abstain or empty): emit the cell with `n=0`, `mean=null` —
    surface it, never silently omit.
- **Win-rate pairing:** positional by run index within a (task, metric) cell
  (the program runs paired sessions in sequence). Lower is better for every
  metric in `MetricsRow`, so a "win" is `comparison < baseline`. Unequal arm
  counts pair to the shared `min`; surface the remainder as `droppedRuns` (no
  silent truncation).
- **`Arm` widening (AC6):** `export type Arm = 'bare' | 'scan' | (string & {})`.
  Keeps autocomplete for known arms while accepting future arms with zero
  breakage. No consumer switches exhaustively on `Arm` (verified: only `scorer`/
  `harness`/their test reference it, all pass-through), so widening is safe.
- **Test count must not decrease** (Active Constraint; CI gates lint, `tsc
  --noEmit`, coverage, Node 22+24).
- **AC8 — never modify `anatrace-core`.** Consume `parseSession`/`analyze` as a
  reader only.

## Gotchas

- **AC1 enumerates "(forensics, pricing)" but the scorer also imports
  `anatrace-core` directly** for `parseSession`/`analyze`. This is NOT a branch
  dep and NOT a modification — `anatrace-core` is a shipped, direct dependency of
  `packages/cli` that `forensics.ts` itself imports. It satisfies AC1's intent
  ("only shipped surfaces; nothing resolves to the branch"). Verify should read
  the import as a shipped surface, not a deviation. (The alternative — adding a
  re-export to `forensics.ts` — would modify a file the scope marks "NOT
  modified," so it was rejected.)
- **Do NOT build any metric on `deriveTranscript`'s best-effort fields**
  (`tests_executed`, `files_touched`, `commands_run`, `failures_encountered`).
  Proof finding `session-capture-C12` and the forensics build concern confirm
  these are flaky regex parses, documented provenance-only, never verdict-grade
  (AC7). Cache-decomposed columns come from `tokens` (frozen tier); peak/util
  from `ContextFacts`; counts from `tool_calls`/`turns`/`duration_ms`. All safe.
- **`rootContextUtilization` is OPTIONAL** — `analyze()` omits it for an unknown
  model (never guesses). Map absent → `contextUtilization: null`. Do not default
  it to 0 (0 would falsely read as "tiny context").
- **`peakContextTokens` excludes output tokens** by design (`rootPeakTokens =
  input + cache_read + cache_create`). Don't add output — that's not context
  occupancy.
- **`renderMetricsRow`/`renderTable` stay unchanged** (5-column demo line). The
  new metrics are structured fields only; cramming them into the render string
  would break the ported render tests for no benefit. Format is not the
  deliverable.
- **Abstain ≠ poor result.** A `null` tokens/turns/wall-clock-to-first-edit on an
  edit task that never edited is a REAL (poor) scored result — still `scored`,
  never `abstain`. Abstain is reserved for "we cannot trust the bytes"
  (unreadable / zero-line / unknown harness / codex / derive-null). Preserve this
  trinary exactly through the port.
- **Fixtures are ground truth — port byte-for-byte.** Every resolved contract
  value is computed from these exact bytes. Editing or regenerating a fixture
  invalidates the assertions.
- **Two parses are intentional** (`deriveTranscript` for counts + `parseSession`/
  `analyze` for context). Don't "optimize" to one and orphan `deriveTranscript`
  (its documented test-consumer role, finding `anatrace-core-integration-C2`).

## Build Brief

### Rules That Apply
- **ESM imports need `.js`** on every relative import (`./scorer.js`,
  `../../src/utils/forensics.js`). Compiles without it; crashes at runtime.
- **`import type` for type-only imports**, separate from value imports
  (`import type { TokenCounts } from '../../src/data/pricing.js'`). Never mix
  types and values in one statement.
- **Named exports only** — no default exports.
- **Avoid `any`** — use `unknown` and narrow with type guards (the branch
  scorer's `readString`/`readNumber`/`readObject` helpers are the pattern).
- **Use `| null`** for "checked and empty" (the metric fields that can be null);
  reserve `?:` for "may not have been checked." Mirror the branch's
  `tokensToFirstCorrectEdit: number | null`.
- **Explicit return types on all exported functions; `@param`/`@returns` JSDoc on
  every exported function** — pre-commit (`tsc --noEmit` + eslint) rejects
  missing tags.
- **Determinism discipline** — no `Date.now()`, no `Math.random()`, no network in
  scorer or aggregate.

### Pattern Extracts

Cost, exactly as production calls it — `src/commands/proof.ts:485`:
```ts
const cost = computeCost(d.tokens, d.model, { priceTable: PRICES });
// Unpriced model -> "n/a", never a misleading "$0.00".
const costLabel = cost.priced ? `$${cost.cost_usd.toFixed(2)}` : 'n/a';
```

The branch scorer's per-turn walk to extend — `localizeClaude` already dedups
tokens by `requestId` and tracks the first correct edit. Add `redundantReads`
(total reads − distinct reads), a turn counter (turns-to-resolution), and a
first-edit timestamp (wall-clock) inside this same loop
(`feature/devday-scan:packages/cli/tests/benchmark/scorer.ts`, `localizeClaude`):
```ts
for (const line of lines) {
  if (readString(line, 'type') !== 'assistant') continue;
  const message = readObject(line, 'message');
  if (!message) continue;
  const requestId = readString(line, 'requestId');
  const usage = readObject(message, 'usage');
  if (usage && requestId && !seenRequestIds.has(requestId)) {
    seenRequestIds.add(requestId);
    runningTokens += readNumber(usage, 'input_tokens') + readNumber(usage, 'output_tokens');
  }
  // ... tool_use blocks: Read -> distinctReads/wrongReads; EDIT_TOOLS -> first correct edit
}
```

Context facts via the shipped analyze surface (the new sourcing) —
mirrors `forensics.ts:deriveCountsFromBytes` (`parseSession([{name, bytes}],
harness)`), then `analyze(session)`:
```ts
import { analyze, parseSession } from 'anatrace-core';
import type { NamedBlob, Harness } from 'anatrace-core';
// after reading bytes:
const session = parseSession([{ name, bytes }] as NamedBlob[], harness as Harness);
const ctx = session ? analyze(session).session.context : undefined;
const peakContextTokens = ctx?.rootPeakTokens ?? 0;
const contextUtilization = ctx?.rootContextUtilization ?? null; // omitted ⇒ null, never 0
```

The functional analog for aggregate's reduce-to-typed-summary shape —
`src/utils/proofSummary.ts:883` (`generateProofSummary`): initialize a fully
typed result object with explicit defaults, then fill it from sources. Mirror the
"typed object, explicit nulls, no seeded empties for absent data" discipline.

### Proof Context

`packages/cli/src/utils/forensics.ts` — touched in 3 cycles (last 2026-06-13,
`anatrace-core-integration`). Findings relevant to THIS build:
- `anatrace-core-integration-C2` (code): `deriveTranscript` is reachable only
  from tests post-integration — a benchmark/test consumer is exactly its intended
  remaining use. **Confirms the scorer is a legitimate consumer.**
- `session-capture-C12` (code) + forensics build concern: `tests_executed`/
  `failures_encountered`/`files_touched`/`commands_run` are best-effort regex
  parses, provenance-only, never verdict-grade. **→ AC7: do not use them.**
- `anatrace-core-integration-C7` (code): `resolveTranscriptPath` is a
  zero-importer export — unrelated to this build; do not touch it.

`packages/cli/src/data/pricing.ts` — no active proof findings.

**Co-change partners (blast-radius awareness):** `forensics.ts` historically
changes with `artifact.ts`, `init/anaJsonSchema.ts`, `init/state.ts` (the capture
pipeline). **This build does NOT touch the capture path** — it only READS
`deriveTranscript` from a new `tests/` consumer, so those partners are out of
scope. Flagged only so the coupling is known, not acted on.

### Checkpoint Commands
Surface is `cli`. Per-file checkpoint uses the cli surface test command; final
baseline uses the root `commands.test`.
- After scorer.ts + fixtures + task + harness.ts + ported harness.test.ts:
  `(cd 'packages/cli' && pnpm vitest run tests/benchmark)` — Expected: the ported
  suite green (branch reported 20/20), plus the new metric assertions.
- After aggregate.ts + aggregate.test.ts:
  `(cd 'packages/cli' && pnpm vitest run tests/benchmark)` — Expected: aggregate
  tests green.
- After all changes: `pnpm run test -- --run` — Expected: full suite green, test
  count strictly greater than baseline.
- Typecheck: `(cd 'packages/cli' && pnpm exec tsc --noEmit)` — Expected: clean.
- Lint: `pnpm run lint` — Expected: clean.

### Build Baseline
Run `pnpm run test -- --run` (root `commands.test`) and record exact counts
before building — capture the real terminal numbers, do not estimate.
- Current test files (packages/cli): 175 `.test.ts`/`.spec.ts` files (`find`
  count; the runner's reported file/test totals are the authoritative baseline —
  record them from the run).
- `packages/cli/tests/benchmark/` does NOT exist on `main` (verified) — this is a
  pure addition; no existing benchmark tests to regress.
- After build: expected baseline + the ported benchmark tests (branch reported
  20 in `harness.test.ts`) + the new metric/aggregate tests, in
  +2 test files (`harness.test.ts`, `aggregate.test.ts`).
- Regression focus: none expected — all code is net-new under `tests/benchmark/`
  and imports shipped surfaces read-only. Confirm the full suite still passes to
  prove the new imports don't perturb module resolution.
