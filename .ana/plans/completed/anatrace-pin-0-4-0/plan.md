# Plan: anatrace-pin-0-4-0

**Branch:** feature/anatrace-pin-0-4-0

## Phases

- Bump anatrace-core 0.2.0 → 0.4.0 (pin + lockfile + worktree install), lock the verdict `reason` field to 0.4.0's closed set with a forward-compatible drift signal, close finding C12 fail-closed in the emit path, and add real-engine CI assertions (incl. one in-class ANSI-C `$'...'`-decodable force-push fixture that reads `violated`). CHANGELOG is deferred to the 1.3.0 cut — the bump + verdict-semantics shift are captured in the PR description and this cycle's proof entry instead.
  - Spec: spec.md
