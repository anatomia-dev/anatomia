# Plan: proof-benchmark-harness

**Branch:** feature/proof-benchmark-harness

## Phases

- Port the benchmark scorer/harness/fixtures/task from `feature/devday-scan` to `main` under `packages/cli/tests/benchmark/` (gated by `ANA_BENCH=1`), add the five reliability metrics + `$/task` cost, widen `Arm`, and build the net-new `aggregate.ts` statistics layer.
  - Spec: spec.md
