# Plan: scan-card-redesign

**Branch:** feature/scan-card-redesign

## Phases

- Rebuild scan's `formatHumanReadable` on the shared `utils/render.ts` vocabulary (rounded header box, inset section rules, aligned key/value rows) and add a confidence-gated "How your team writes" Conventions section surfacing the already-computed `result.conventions` and `result.patterns` data; pin the full card with golden snapshots.
  - Spec: spec.md
