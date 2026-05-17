# Build Report: Rust/Go Polyglot Detection

**Created by:** AnaBuild
**Date:** 2026-05-17
**Spec:** .ana/plans/active/rust-go-polyglot-detection/spec.md
**Branch:** feature/rust-go-polyglot-detection

## What Was Built

- `packages/cli/src/engine/detectors/projectType.ts` (modified): Added `hasRustWorkspace(content)` helper that uses `/^\[workspace\]\s*$/m` regex to detect Cargo workspace declarations without matching subsections like `[workspace.members]`. Extended tier heuristic to check `Cargo.toml` and `go.mod` as competing manifests — Tier 1 fast path now gates on absence of ALL competing manifests (`!hasPyproject && !hasCargo && !hasGoMod`). Each tier (lockfile and no-lockfile) checks Python first, Rust second, Go third. A lockfile fallback returns Node 0.95 when competing manifests exist but don't match (e.g., single-crate Cargo.toml).
- `packages/cli/tests/engine/detectors/polyglot.test.ts` (modified): Added 12 new test cases covering all acceptance criteria — Rust workspace detection with/without lockfile, single-crate fallback, Go detection with/without lockfile, workspaces guard priority over both Cargo.toml and go.mod, malformed Cargo.toml, `[workspace.members]` subsection non-match, frameworkDeps cascade after Rust type flip, and regression guard for existing Python detection.
- `packages/cli/tests/engine/detectors/projectType.test.ts` (modified): Updated one pre-existing test ("prioritizes Node.js over Go") to match new behavior — package.json + go.mod (no lockfile) now correctly detects Go 0.85 per AC9.

## PR Summary

- Add Rust workspace and Go module detection to the polyglot project type heuristic, so repos with a thin package.json (turborepo, frontend tooling) alongside a real Cargo workspace or go.mod are correctly classified
- `hasRustWorkspace` helper uses anchored regex to distinguish `[workspace]` from subsections like `[workspace.members]`
- Tier structure extended: Python → Rust → Go priority ordering in both lockfile and no-lockfile tiers, with workspaces guard retaining Node priority
- Single-crate Cargo.toml (WASM binding pattern) safely falls through to Node
- 12 new tests covering all acceptance criteria; 1 existing test updated to match new Go detection behavior

## Acceptance Criteria Coverage

- AC1 "Cargo.toml with [workspace] + lockfile → rust 0.90" → polyglot.test.ts "detects Rust when Cargo.toml has [workspace] section (with lockfile)" (3 assertions) ✅
- AC2 "Cargo.toml with only [package] → node" → polyglot.test.ts "single-crate Cargo.toml without [workspace] stays Node" (2 assertions) ✅
- AC3 "go.mod + lockfile → go 0.90" → polyglot.test.ts "detects Go when go.mod exists alongside package.json (with lockfile)" (3 assertions) ✅
- AC4 "no competing manifest → node 0.95" → polyglot.test.ts "preserves Node detection with lockfile and no competing manifest" (2 assertions) ✅
- AC5 "workspaces field → node regardless of Cargo.toml/go.mod" → polyglot.test.ts "workspaces field overrides Cargo.toml presence" + "workspaces field overrides go.mod presence" (2 assertions each) ✅
- AC6 "all existing polyglot tests pass" → 15/15 original polyglot.test.ts tests pass unmodified ✅
- AC7 "malformed Cargo.toml falls through" → polyglot.test.ts "handles malformed Cargo.toml gracefully" (2 assertions) ✅
- AC8 "no lockfile + Cargo.toml [workspace] → rust 0.85" → polyglot.test.ts "detects Rust without lockfile when Cargo.toml has [workspace]" (2 assertions) ✅
- AC9 "no lockfile + go.mod → go 0.85" → polyglot.test.ts "detects Go without lockfile when go.mod exists" (2 assertions) ✅
- AC10 "frameworkDeps routes correctly" → polyglot.test.ts "frameworkDeps routes to language-specific deps after Rust type flip" (2 assertions) ✅
- Tests pass with `pnpm vitest run` → ✅ 2441 passed
- No build errors → ✅ typecheck + lint clean

## Implementation Decisions

- **Lockfile fallback consolidation:** The original code had separate return statements for "tooling-only pyproject.toml" in the lockfile tier. With three competing manifests, each tier now checks Python → Rust → Go in sequence, then falls through to a single `return { type: 'node', confidence: 0.95, indicators }` at the end of the lockfile block. Same behavior, less repetition.
- **Go detection has no content check:** Per spec, `go.mod` existence alone is sufficient — there's no Go equivalent of the WASM binding false positive. No `hasGoModule` helper needed.
- **Extra test for `[workspace.members]` subsection:** Added a test not in the spec's acceptance criteria to verify the regex anchoring correctly rejects `[workspace.members]` (the gotcha the spec called out).

## Deviations from Contract

### Existing test assertion updated
**Instead:** Updated `projectType.test.ts` test "prioritizes Node.js over Go when both present" to expect Go 0.85 instead of Node 0.70
**Reason:** AC9 explicitly defines package.json + go.mod (no lockfile) → Go 0.85. The pre-existing test was written before Go polyglot detection existed and asserted the old priority order.
**Outcome:** Test now matches the spec's intended behavior. The old assertion was correct for the old code; the new assertion is correct for the new code.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run tests/engine/detectors/polyglot.test.ts)
Test Files  1 passed (1)
     Tests  15 passed (15)
  Duration  188ms
```

Full suite baseline (from spec): 2429 passed, 2 skipped (2431 total)

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  107 passed (107)
     Tests  2441 passed | 2 skipped (2443)
  Duration  43.05s
```

### Comparison
- Tests added: 12 (in polyglot.test.ts)
- Tests removed: 0
- Tests modified: 1 (in projectType.test.ts — assertion updated to match AC9)
- Regressions: none

### New Tests Written
- `polyglot.test.ts`: Rust workspace with lockfile (A001-A003), single-crate fallback (A004), Go with lockfile (A005-A007), Node fast path preservation (A008-A009), workspaces guard vs Cargo.toml (A010), workspaces guard vs go.mod (A011), malformed Cargo.toml (A012), Rust without lockfile (A013-A014), Go without lockfile (A015-A016), frameworkDeps cascade (A017), regression guard (A018), [workspace.members] subsection rejection (bonus)

### Contract Coverage
18/18 assertions tagged.

## Verification Commands
```bash
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
ce51b2c6 [rust-go-polyglot-detection] Add Rust/Go polyglot detection to tier heuristic
```

## Open Issues

- Updated pre-existing test in `projectType.test.ts` — the test asserted old behavior (Node priority over Go) that AC9 explicitly supersedes. The test name and assertion were both updated. This is the only modification to an existing test.

Verified complete by second pass.
