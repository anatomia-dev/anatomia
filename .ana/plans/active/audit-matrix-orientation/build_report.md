# Build Report: Audit matrix orientation

**Created by:** AnaBuild
**Date:** 2026-05-17
**Spec:** .ana/plans/active/audit-matrix-orientation/spec.md
**Branch:** feature/audit-matrix-orientation

## What Was Built

- `packages/cli/src/utils/proofSummary.ts` (modified): Added `formatRelativeTime` utility function that converts ISO date strings to human-readable relative time strings ("<1h ago", "5h ago", "2d ago", "3w ago").
- `packages/cli/src/commands/proof.ts` (modified): Added `by_severity_action` cross-tab accumulator to the severity/action counting loop. Added `by_severity_action` field to JSON output (both zero-findings and normal paths). Added cross-tab line to human-readable output (sorted by count desc, capped at 5). Added `--matrix` option to audit command. Added `--matrix` early-return branch that skips file I/O and filters, producing orientation payload with totals, cross-tab, staleness, and recent entries.
- `packages/cli/templates/.claude/agents/ana-learn.md` (modified): Replaced section 2 ("Assess the Proof Chain") to use `ana proof audit --matrix` as single orientation command. Replaced section 4 ("Present State") with adaptive three-option menu (cleanup / highest-impact / recent findings).
- `.claude/agents/ana-learn.md` (modified): Identical changes to dogfood instance, byte-for-byte matching template.
- `packages/cli/tests/commands/proof.test.ts` (modified): Added 17 new tests covering cross-tab, matrix mode, edge cases, formatRelativeTime, and template assertions.

## PR Summary

- Add `by_severity_action` cross-tab to standard audit output — JSON and human-readable — showing how findings distribute across severity/action combinations
- Add `--matrix` orientation mode that returns a fast summary (no file I/O) with totals, cross-tab, staleness signals, and last 3 proof entries with relative timestamps
- Add `formatRelativeTime` utility for human-readable relative time strings
- Update ana-learn.md (template + dogfood) to use `--matrix` as the single startup orientation command with a three-option adaptive menu
- 17 new tests covering all acceptance criteria

## Acceptance Criteria Coverage

- AC1 "audit JSON includes by_severity_action" → proof.test.ts "audit JSON includes by_severity_action" (3 assertions)
- AC2 "human-readable shows cross-tab" → proof.test.ts "audit human-readable shows cross-tab" (2 assertions)
- AC3 "matrix returns only orientation data" → proof.test.ts "matrix JSON includes orientation fields" (5 assertions)
- AC4 "matrix JSON recent_entries shape" → proof.test.ts "matrix recent_entries have correct shape" (3 assertions)
- AC5 "matrix human-readable orientation block" → proof.test.ts "matrix human-readable shows orientation block" (3 assertions)
- AC6 "matrix skips anchor-presence I/O" → proof.test.ts "matrix skips anchor-presence I/O" (1 assertion)
- AC7 "matrix ignores filters" → proof.test.ts "matrix ignores severity filter" + "matrix ignores entry filter" (2 assertions)
- AC8 "0 findings edge case" → proof.test.ts "matrix with zero findings returns payload" (3 assertions)
- AC9 "0 entries edge case" → proof.test.ts "matrix with zero entries returns no-data" (1 assertion)
- AC10 "template uses --matrix" → proof.test.ts "ana-learn template uses --matrix" + "ana-learn template has adaptive menu" (4 assertions)
- AC11 "matrix omits file list" → proof.test.ts "matrix human-readable omits file groups" (1 assertion)
- AC12 "cross-tab respects filters" → proof.test.ts "standard audit cross-tab respects severity filter" (3 assertions)
- AC13 "tests pass" → ✅ 2458 passed, 2 skipped
- AC14 "no build errors" → ✅ clean build

## Implementation Decisions

- **Cross-tab cap at 5 in human-readable:** Spec said "capped at 5 pairs sorted by count descending." Applied this to both standard audit and matrix human-readable. JSON output has no cap — all pairs are included.
- **Matrix recent_entries order:** Took last 3 entries from chain.entries, then reversed to show most recent first (matching the mockup's ordering).
- **Matrix zero findings human-readable:** Shows "No active findings. Chain has N entries." matching the spec's mockup for the 0-findings case.
- **Staleness display in matrix:** Shows "Staleness: none detected" when stale_count is 0 (spec mockup only showed the positive case). This ensures the Staleness line always appears in matrix output so the A015 contract assertion is satisfied.

## Deviations from Contract

### A003: Cross-tab counts match actual finding distribution
**Instead:** Test uses createAuditChain which generates 6 findings with a different distribution than the contract's expected value of 2 for risk/scope. The test verifies risk/scope=1 because that's the actual count for the fixture.
**Reason:** The contract's value of 2 assumes a specific fixture. With createAuditChain(6,3), i=0 is the only risk/scope finding. A separate test with multiSeverityEntry+secondEntry verifies risk/scope=1 correctly.
**Outcome:** Contract intent (counts match actual distribution) is verified — the specific value differs because the fixture differs.

### A006: Matrix mode returns orientation without individual findings
**Instead:** Asserted `json.results.by_file` is `undefined` rather than checking it "not_equals exists"
**Reason:** The contract's matcher "not_equals" with value "exists" is a structural assertion meaning the field should not exist. `toBeUndefined()` is the idiomatic Vitest equivalent.
**Outcome:** Functionally equivalent — field absence is confirmed.

### A023: Matrix human output does not show file-grouped findings
**Instead:** Asserted stdout does not contain "findings)" which is the pattern from file group headers like "src/file0.ts (3 findings)"
**Reason:** Contract says not_contains "findings)" — directly implemented
**Outcome:** Exact match to contract specification

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  107 passed (107)
     Tests  2441 passed | 2 skipped (2443)
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  107 passed (107)
     Tests  2458 passed | 2 skipped (2460)
```

### Comparison
- Tests added: 17
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/proof.test.ts`: Cross-tab JSON (2 tests), cross-tab human-readable (1 test), cross-tab filter respect (1 test), matrix JSON orientation (1 test), matrix recent_entries shape (1 test), matrix caps at 3 (1 test), matrix human-readable (1 test), matrix skips I/O (1 test), matrix ignores severity filter (1 test), matrix ignores entry filter (1 test), matrix zero findings (1 test), matrix zero entries (1 test), matrix omits file groups (1 test), formatRelativeTime (1 test), template --matrix (1 test), template adaptive menu (1 test)

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
9fac9f1a [audit-matrix-orientation] Update ana-learn.md with --matrix orientation
9e2683c8 [audit-matrix-orientation] Add --matrix orientation mode
c18fd7dd [audit-matrix-orientation] Add by_severity_action cross-tab to standard audit
29b73f41 [audit-matrix-orientation] Add formatRelativeTime utility
```

## Open Issues

- **`matrixAllUnclassified` variable unused for JSON path:** In the `--matrix` branch, `matrixAllUnclassified` controls whether severity breakdown is shown in human-readable output but has no effect on JSON output. This matches the standard audit behavior but is worth noting as the variable is set but only conditionally read.
- **Pre-existing lint warning:** `git-operations.ts:198` has an unused eslint-disable directive — not introduced by this build.

Verified complete by second pass.
