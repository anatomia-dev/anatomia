# Plan: verifier-intent-coverage

**Branch:** feature/verifier-intent-coverage

## Phases

- Keystone — the mechanism. Types (`ac:`, `coverage_waivers`, `version 1.1` activation), the corpus-proven scope-AC extractor, the pre-seal coverage gate with the AC14 fail-open classifier and the AC13 always-on diagnostic, and save-flow wiring into both save sites. Front-loads the extractor + live-corpus measurement (AC1) before any gate blocks; ships inert-but-safe (no contract emits `version 1.1` yet, so the gate no-ops everywhere).
  - Spec: spec-1.md
- Surfacing + activation. Per-AC coverage + PARTIAL count threaded through the proof summary, card, and PR surfaces; the read-only `ana plan coverage {slug}` command; and both prompt templates (ana-plan.md emits `ac:`/`coverage_waivers`/`version 1.1`; ana-verify.md gets the coverage map, scoped-precedence fix, and prediction reframe). This phase activates the gate by teaching Plan to emit `version 1.1` contracts.
  - Spec: spec-2.md
  - Depends on: Phase 1
