# Plan: remove-plan-phase-checkbox

**Branch:** feature/remove-plan-phase-checkbox

## Phases

- [ ] Remove the non-authoritative plan.md phase checkbox: delete the verify-report→plan.md staging path, re-anchor `validatePlanFormat` to enforce a `Spec:` ref per phase (accepting both old and new formats), harden `ana work complete` against a tracked-modified plan.md, drop the `- [ ]` glyph from AnaPlan's emitted format across all agent files, remove AnaVerify's tick instruction, reconcile AnaBuild's "don't touch plan.md" wording, and correct the docs.
  - Spec: spec.md
