# Plan: session-capture

**Branch:** feature/session-capture

## Phases

- [ ] Phase 1 — Capture: env injection at the two spawn sites, install-time-gated SessionStart hooks (Claude + Codex), the hidden `ana _capture` total subcommand, the home-anchored buffer, the `processCapture` gate, and dogfood default-on.
  - Spec: spec-1.md
- [ ] Phase 2 — Derive + attach: deterministic transcript-derive (counts/cost/tokens/churn/outcome), `module_churn` via `--numstat`, the versioned price table, the `ProcessAttestation` 4-touch proof attach, and the SessionEnd/Stop derive trigger.
  - Spec: spec-2.md
  - Depends on: Phase 1
