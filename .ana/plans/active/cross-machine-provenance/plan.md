# Plan: cross-machine-provenance

**Branch:** feature/cross-machine-provenance

## Phases

- [ ] Write + assemble — mint `ANA_RUN_ID`, reduce the SessionStart hook to a pointer writer, derive+write+commit provenance at both `ana artifact save` sites, delete the home buffer, drop committed `cost_usd`, and rewrite `assembleProcessAttestation` to read the committed `provenance/*.json` (deleting `recordBelongsToWorktree`)
  - Spec: spec-1.md
- [x] Completeness + enforcement + display — add the per-phase presence-floor completeness check, the `processCaptureStrict` gate (warn by default, fail under strict), cross-machine + squash-merge survival fixtures, and finalize cost-at-display
  - Spec: spec-2.md
  - Depends on: Phase 1
- [x] Init hooks — install only the SessionStart hook on both platforms, add a targeted `ana _capture --derive` prune, keep `provenance/` out of the generated `.gitignore`
  - Spec: spec-3.md
  - Depends on: Phase 1
