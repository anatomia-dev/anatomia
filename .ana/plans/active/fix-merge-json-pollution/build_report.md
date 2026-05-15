# Build Report: Fix --merge stdout pollution in --json mode

**Created by:** AnaBuild
**Date:** 2026-05-14
**Spec:** .ana/plans/active/fix-merge-json-pollution/spec.md
**Branch:** feature/fix-merge-json-pollution

## What Was Built

- `packages/cli/src/commands/work.ts` (modified): Wrapped 5 unguarded `console.log` calls with `if (!options?.json)` guards — 3 in the merge block (already-merged message, pre-merge progress, post-merge confirmation) and 2 in the pull-recovery block (build/verify artifact removal warning, planning artifact removal warning).
- `packages/cli/tests/commands/work-merge.test.ts` (modified): Added 2 test cases exercising `{ json: true, merge: true }` — one for the already-merged path, one for merge-succeeded. Both capture stdout and assert it parses as valid JSON with no preceding text.

## PR Summary

- Fix stdout pollution when `ana work complete --merge --json` is used — progress messages no longer corrupt the JSON envelope
- Guard 5 `console.log` calls in merge and pull-recovery paths with `if (!options?.json)` checks
- Add 2 tests verifying clean JSON output for both already-merged and merge-succeeded scenarios
- Human-readable output (without `--json`) unchanged — all progress messages still appear

## Acceptance Criteria Coverage

- AC1 "ana work complete --merge --json produces exactly one JSON object on stdout" → work-merge.test.ts "already-merged path with --json produces valid JSON" + "merge-succeeded path with --json produces valid JSON" (JSON.parse succeeds, envelope shape verified)
- AC2 "Pull-recovery warning messages do not appear on stdout when --json is set" → Guards applied at lines 1287 and 1307; not directly tested (requires complex filesystem state — see spec Testing Strategy)
- AC3 "Human-readable output without --json is unchanged" → Existing tests "merges PR and completes work item" (asserts `PR merged.`) and "skips merge when PR is already merged" (asserts `already merged`) still pass
- AC4 "A test exercises --merge --json and validates stdout parses as JSON" → Two new tests in work-merge.test.ts

## Implementation Decisions

- Used exact same guard pattern as line 1353 (`if (!options?.json)`) for consistency.
- Tests restore `console.log = originalLog` before parsing to match the pattern from work.test.ts:2779.
- Tests assert `json.results.slug` (not `json.results.new_findings`) because the merge path completes the work item, producing a slug-bearing envelope rather than a findings-bearing one.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run tests/commands/work-merge.test.ts --run)
Test Files  1 passed (1)
     Tests  11 passed (11)
  Duration  2.12s
```

### After Changes
```
(cd packages/cli && pnpm vitest run tests/commands/work-merge.test.ts --run)
Test Files  1 passed (1)
     Tests  13 passed (13)
  Duration  2.79s
```

### Full Suite
```
(cd packages/cli && pnpm vitest run)
Test Files  101 passed (101)
     Tests  2256 passed | 2 skipped (2258)
  Duration  38.87s
```

### Comparison
- Tests added: 2
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/work-merge.test.ts`: "already-merged path with --json produces valid JSON" (JSON.parse, command envelope, slug, meta, no 'already merged' text); "merge-succeeded path with --json produces valid JSON" (JSON.parse, command envelope, slug, meta, no 'Merging PR'/'PR merged' text)

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
341d6cb2 [fix-merge-json-pollution] Add tests for --merge --json paths
3f93946f [fix-merge-json-pollution] Guard 5 console.log calls with json check
```

## Open Issues

None — verified by second pass. The 5 guards are mechanical, pattern-identical, and all tested paths confirm the behavior. The lint warning on `git-operations.ts:198` is pre-existing and unrelated.
