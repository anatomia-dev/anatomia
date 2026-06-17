# Plan: anatrace-core-integration

**Branch:** feature/anatrace-core-integration

## Phases

- Phase 1 — Provenance swap. Add `anatrace-core@0.2.0` as a pinned dependency; replace the hand-rolled Claude/Codex derive in `forensics.ts` with `parseSession` + `deriveCounts`; adopt core pricing; re-baseline the derive tests to invariants; rewrite the Codex fixture with a real `apply_patch` body; make the network-freedom guarantee transitive. Ships standalone.
  - Spec: spec-1.md
- Phase 2 — Behavioral attestation. Build the sound root-lane coverage-context construction (proven fail-closed, test-first), then the save-time producer that runs `runCompliance` and writes one scrubbed record per transcript (total/fail-safe), a reader, and the `ana proof` Session Attestation section. Verdicts are evidence — they never gate PASS/FAIL.
  - Spec: spec-2.md
  - Depends on: Phase 1
