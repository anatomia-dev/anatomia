# Plan: context-compression-savings

**Branch:** feature/context-compression-savings

## Phases

- [ ] A — Generalize capture to `ana build` & `ana lint` (pure Layer A: capture + compact return, no seal, no gate) + four agent templates
  - Spec: spec-1.md
- [ ] B — Compact failures into the agent-facing return (deterministic extraction, fires on the real failure signal: verdict=fail for test, non-zero exit for build/lint)
  - Spec: spec-2.md
  - Depends on: Phase A
- [ ] C-core — Instrument pipeline savings: per-capture recorder → gitignored sidecar → durable unsealed `metrics` field on the proof entry → proof viewer pipeline → dogfood flag-on
  - Spec: spec-3.md
  - Depends on: Phase B
- [ ] D — Config flag `captureMetrics: "on"|"off"` (schema + init-write `off` + re-init preserve). **BUILD-GATED on `retire-capture-self-arming` merging to main.**
  - Spec: spec-4.md
  - Depends on: Phase C-core, and (external) `retire-capture-self-arming` merged to main
