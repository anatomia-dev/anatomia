# Plan: proof-card-redesign

**Branch:** feature/proof-card-redesign

## Phases

- Extract a shared terminal-render vocabulary (`utils/render.ts`) of six pure primitives, rebuild the `ana proof <slug>` card on it, surface cache tokens in Provenance, and adopt the shared header primitive in `formatHealthDisplay` (square default → byte-identical health).
  - Spec: spec.md
