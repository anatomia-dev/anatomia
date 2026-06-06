# Plan: captured-test-evidence

**Branch:** feature/captured-test-evidence

## Phases

- [x] Phase 1 — Capture spine + warn-mode gate (never blocks): shell-free capturing runner, marker + length-addressed verbatim inliner, three save-time validators wired warn-mode at both save sites, `ana test` command, four template edits, `test_json` schema, `.captures/` gitignore, and the 8-stack adversarial corpus.
  - Spec: spec-1.md
- [ ] Phase 2 — Self-arming flip to fail-closed: marker-sealed arming signal (`.ana/state/capture.json`), check-then-arm gate ordering, fail-closed enforcement scoped to `build_report.md` only.
  - Spec: spec-2.md
  - Depends on: Phase 1
