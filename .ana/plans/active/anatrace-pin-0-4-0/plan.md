# Plan: anatrace-pin-0-4-0

**Branch:** feature/anatrace-pin-0-4-0

## Phases

- Bump anatrace-core 0.2.0 → 0.4.0 (pin + lockfile + worktree install), lock the verdict `reason` field to 0.4.0's closed set with a forward-compatible drift signal, close finding C12 fail-closed in the emit path, add real-engine CI assertions (incl. one in-class obfuscated-forbidden-command fixture), and record the bump + verdict-semantics shift in CHANGELOG.md.
  - Spec: spec.md
