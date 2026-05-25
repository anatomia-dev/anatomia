# Build Report: Fix Risk Findings

**Created by:** AnaBuild
**Date:** 2026-05-25
**Spec:** .ana/plans/active/fix-risk-findings/spec.md
**Branch:** feature/fix-risk-findings

## What Was Built

- `packages/cli/src/commands/init/state.ts` (modified): Added `escapedPath` variable using `surface.path.replace(/'/g, "'\\''")` after scripts extraction. Replaced `surface.path` with `escapedPath` in all 4 template literal interpolation sites (build, test passthrough, test direct, lint).
- `packages/cli/src/commands/work.ts` (modified): Replaced `!existing.surface` with `existing.surface === undefined || existing.surface === null` in the backfill guard at the surface migration block.
- `website/lib/docs-data/docsStatValues.ts` (modified): Added exported `DocsStatKey` union type with all 9 valid keys and JSDoc comment.
- `website/components/docs/content/DocsStat.tsx` (modified): Added `import type { DocsStatKey }` and changed `value` prop from `string` to `DocsStatKey`. Runtime `?? value` fallback kept.
- `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` (modified): Added 2 test cases — one verifying single-quote path escaping produces correct POSIX idiom in all command types, one verifying paths without quotes remain unchanged.

## PR Summary

- Escape single quotes in surface path shell commands using the POSIX `'\''` idiom, preventing broken shell syntax in ana.json when a surface path contains an apostrophe
- Replace falsy coercion (`!existing.surface`) with explicit null/undefined check in the backfill guard, so empty-string surfaces are no longer overwritten during migration
- Export `DocsStatKey` union type and narrow the `DocsStat` component prop from `string` to the 9 valid keys, catching misspelled keys at compile time while preserving the runtime fallback for MDX
- Add 2 new tests for the path escaping behavior covering both quoted and unquoted paths

## Acceptance Criteria Coverage

- AC1 "Surface command strings escape single quotes" → monorepoCommandScoping.test.ts "escapes single quotes in surface path commands" — asserts build, test, lint all contain `'\''` (3 assertions)
- AC2 "A test verifies escape" → same test as AC1 (4 assertions across build/test/lint/command-suffix)
- AC3 "Backfill guard uses explicit null check" → source code inspection: `existing.surface === undefined || existing.surface === null` at work.ts:1101. work.test.ts: 215 tests pass unchanged.
- AC4 "DocsStatKey exported as union of 9 keys" → docsStatValues.ts exports `DocsStatKey` with 9 members
- AC5 "DocsStat prop accepts DocsStatKey, runtime fallback kept" → DocsStat.tsx uses `value: DocsStatKey`, `?? value` preserved at line 33
- AC6 "Website builds successfully" → `cd website && pnpm run build` succeeded
- AC7 "All existing tests pass unchanged" → 2921 passed, 2 skipped (2919 existing + 2 new)

## Implementation Decisions

None. All three fixes were fully specified. No ambiguity encountered.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
pnpm run test -- --run
Test Files  124 passed (124)
     Tests  2919 passed | 2 skipped (2921)
```
(Turbo cached from prior build — all passing)

### After Changes
```
pnpm run test -- --run
Test Files  124 passed (124)
     Tests  2921 passed | 2 skipped (2923)
   Duration  52.49s
```

### Comparison
- Tests added: 2
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts`:
  - "escapes single quotes in surface path commands" — creates surface with path `it's-here`, verifies all 3 command types contain POSIX-escaped path
  - "does not alter paths without single quotes" — verifies standard path produces unchanged command string

## Verification Commands
```
pnpm run build
(cd 'packages/cli' && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts)
(cd 'packages/cli' && pnpm vitest run tests/commands/work.test.ts)
(cd 'website' && pnpm run build)
pnpm run test -- --run
pnpm run lint
```

## Git History
```
621f010b [fix-risk-findings] Add DocsStatKey type narrowing
a3775834 [fix-risk-findings] Use explicit null check in backfill guard
43afd8f0 [fix-risk-findings] Escape single quotes in surface path commands
```

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
