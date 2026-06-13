# Plan: anatrace-core-integration

**Branch:** feature/anatrace-core-integration

## Phases

- Phase 1 — Provenance swap. Add `anatrace-core@0.2.0` as a pinned dependency; replace the hand-rolled Claude/Codex derive in `forensics.ts` with `parseSession` + `deriveCounts`; adopt core pricing; re-baseline the derive tests to invariants; rewrite the Codex fixture with a real `apply_patch` body; make the network-freedom guarantee transitive.
  - Spec: spec-1.md
- Phase 2a — Soundness spike. Build the `MandateEvaluationContext` / `CaptureCoverage` construction for root-lane v1 and prove it fails closed: delegate-inclusive negatives resolve `unverifiable`, an unobservable root channel never resolves `satisfied`, and runtime contract assertions never appear `satisfied`. No producer, no display yet — this phase proves the one genuine design problem in isolation.
  - Spec: spec-2.md
  - Depends on: Phase 1
- Phase 2b — Behavioral-attestation producer + display. Add the `ComplianceAttestation` type, a save-time producer that runs `runCompliance` and writes one scrubbed record per transcript (total/fail-safe), a reader, and the `ana proof` behavioral-attestation section. Verdicts are evidence — they never gate PASS/FAIL.
  - Spec: spec-3.md
  - Depends on: Phase 2a
