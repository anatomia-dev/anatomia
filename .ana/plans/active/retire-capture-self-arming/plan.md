# Plan: retire-capture-self-arming

**Branch:** feature/retire-capture-self-arming

## Phases

- [ ] Retire capture-gate self-arming; drive enablement from a committed `ana.json` flag (`captureGate`), preserving gate/seal/capture behavior exactly. Re-express the gate's behavior in a new sealed contract, add the carve-out + status readout, migrate the dogfood, and clean non-sealed prose (project-context, CHANGELOG).
  - Spec: spec.md
