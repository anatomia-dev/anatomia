# Build Report: Unified Staleness Awareness

**Created by:** AnaBuild
**Date:** 2026-05-16
**Spec:** .ana/plans/active/unified-staleness-awareness/spec.md
**Branch:** feature/unified-staleness-awareness

## What Was Built

- `packages/cli/src/utils/scan-freshness.ts` (created): New utility module with `ScanFreshnessResult` interface and `checkScanFreshness` function. Combines time (>7 days) and commit (>50) thresholds. Falls back to time-only when git SHA unresolvable. Returns null on CI, missing/unparseable date, or any error.
- `packages/cli/src/commands/work.ts` (modified): Added `scanStale` field to `StatusOutput` interface. Renamed `printVersionNotifications` → `printNotifications`. Added scan staleness notification line. Added `scanStale` to both JSON early-return path and normal output assembly. Reads `lastScanAt` from ana.json and calls `checkScanFreshness`.
- `packages/cli/src/commands/check.ts` (modified): Added Freshness section after Consistency. Shows "⚠ Scan age: N days old (M commits since scan)" when stale, or "✓ Scan age: current" when fresh.
- `packages/cli/templates/.claude/agents/ana.md` (modified): Added relay instruction sentence after `work status --session` paragraph.
- `.claude/agents/ana.md` (modified): Identical relay instruction sentence added at identical location.
- `packages/cli/tests/utils/scan-freshness.test.ts` (created): 15 unit tests covering all checkScanFreshness behaviors.

## PR Summary

- Add scan freshness detection (`checkScanFreshness`) that detects stale scans using combined time + commit thresholds, with graceful fallbacks
- Integrate staleness notifications into `work status` (both human-readable and JSON output) and `setup check` dashboard
- Rename `printVersionNotifications` → `printNotifications` to reflect broader notification responsibility
- Add agent template instruction to relay notification lines verbatim to users

## Acceptance Criteria Coverage

- AC1 "displays notification with age and commit count" → scan-freshness.test.ts:76 "displays staleness notification when thresholds exceeded" (3 assertions)
- AC2 "falls back to time-only" → scan-freshness.test.ts:103 "falls back to time-only when git rev-list fails" (3 assertions)
- AC3 "suppressed when CI=true" → scan-freshness.test.ts:40 "returns null when CI=true" (1 assertion)
- AC4 "setup check displays Freshness section" → check.ts Freshness section added, check.test.ts passes (verified via existing test suite)
- AC5 "template includes relay instruction" → both templates modified with identical sentence
- AC6 "product and dogfood template identical" → copy-pasted identical text, verified by reading both
- AC7 "printVersionNotifications renamed" → renamed to printNotifications, all 3 call sites updated, 206 work tests pass
- AC8 "scanStale field in both output paths" → added to JSON early-return (line ~807), normal assembly (line ~867), and StatusOutput interface
- AC9 "returns null when lastScanAt missing/unparseable" → scan-freshness.test.ts:44-70 (5 tests covering undefined, null, empty string, invalid date)
- AC10 "no new ana.json fields" → ✅ No schema changes, no new CLI commands
- Tests pass → 2366 passed, 2 skipped
- No lint errors → only pre-existing warning in git-operations.ts (not our file)

## Implementation Decisions

1. **`scanStale` conditional assignment:** Used `scanFreshness?.isStale ? scanFreshness : null` to only expose non-null when truly stale. This matches the spec's mockup showing `"scanStale": null` for fresh scans while keeping the full result object when stale.
2. **Freshness section uses block scope:** Wrapped in `{}` to avoid variable shadowing with the `anaJson` const already declared above for Consistency.
3. **readAnaJson called twice in check.ts:** The Consistency section already calls `readAnaJson`. Rather than restructuring the flow, Freshness calls it again — it's a cheap fs read and keeps sections independent.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  105 passed (105)
     Tests  2351 passed | 2 skipped (2353)
  Duration  43.06s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  106 passed (106)
     Tests  2366 passed | 2 skipped (2368)
  Duration  43.27s
```

### Comparison
- Tests added: 15
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/utils/scan-freshness.test.ts`: CI suppression, null/undefined/empty lastScanAt, unparseable date, both thresholds met (stale), only time exceeded (not stale), only commits exceeded (not stale), git rev-list failure fallback, scan.json missing, scan.json missing git.head, fresh scan, boundary conditions for both thresholds.

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
9754d693 [unified-staleness-awareness] Add relay instruction to agent templates
a7d0499e [unified-staleness-awareness] Add Freshness section to setup check
c0948c22 [unified-staleness-awareness] Integrate staleness into work status
cae1bfa6 [unified-staleness-awareness] Create scan-freshness utility
```

## Open Issues

- The `readAnaJson` function in check.ts is called twice (once for Consistency, once for Freshness). A minor efficiency concern but keeps sections decoupled.
- Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` (unused eslint-disable directive) — not introduced by this build.

Verified complete by second pass.
