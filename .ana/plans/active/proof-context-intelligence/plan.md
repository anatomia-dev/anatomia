# Plan: proof-context-intelligence

**Branch:** feature/proof-context-intelligence

## Phases

- The "why" + bloat discipline + adoption — add `shaped_by` to `ana proof context`, the signal-only `ana proof <slug> --why` drill-down, and the template guidance that makes the command actually run. No graph dependency; ships value on the dogfood install immediately.
  - Spec: spec-1.md
- Import-graph write pipeline + reader (infrastructure) — harvest `buildImportGraph`/`persistCodeGraph` from `feature/devday-scan` onto main, wire persistence into the deep-tier scan and `ana init` (mirroring `buildSymbolIndexSafe`), and add a typed reader for `.ana/state/code-graph.json`. Writes the artifact `also_changes_with` depends on; inert until Phase 3 reads it.
  - Spec: spec-2.md
  - Depends on: Phase 1
- "Also changes with" assembly + render + co-change templates — harvest the proof co-change logic as a pure sync helper, join it (plus the Phase 2 graph reader) into `getProofContext`, render the two-layer section under hard caps, and finish the co-change template guidance.
  - Spec: spec-3.md
  - Depends on: Phase 2
