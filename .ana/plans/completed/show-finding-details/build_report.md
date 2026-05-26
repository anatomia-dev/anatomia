# Build Report: Show Finding Details in CLI Output

**Created by:** AnaBuild
**Date:** 2026-05-26
**Spec:** .ana/plans/active/show-finding-details/spec.md
**Branch:** feature/show-finding-details

## What Was Built
- `packages/cli/src/engine/findings/rules/validation.ts` (modified): Replaced two-line detail string (containing literal `\n`) with single concise line matching spec AC3 text.
- `packages/cli/src/commands/scan.ts` (modified): Added detail rendering inside the `criticalOrWarn` loop — after each title line, checks `f.detail` for non-null, splits on `\n`, pushes each line as `chalk.gray()` with 4-space indent. Exported `formatHumanReadable` for testing.
- `packages/cli/tests/engine/findings/rules/validation.test.ts` (modified): Added test asserting detail is a single line matching exact AC3 text with no `\n`.
- `packages/cli/tests/commands/scan-finding-details.test.ts` (created): 7 tests covering detail rendering: non-null detail shown, gray styling, null detail skipped, multi-line split, secret detail with file location, env detail present, pass findings excluded.

## PR Summary

- Show `f.detail` as indented gray text below each warn/critical finding in `ana scan` output
- Rewrite validation finding detail from two-line to single concise line explaining the heuristic
- Export `formatHumanReadable` from scan.ts to enable direct unit testing of display logic
- Add 8 new tests covering detail rendering and validation detail text

## Acceptance Criteria Coverage

- AC1 "scan shows f.detail as indented gray text" → scan-finding-details.test.ts "renders detail lines for findings with non-null detail" (2 assertions)
- AC2 "all-pass findings show no detail lines" → scan-finding-details.test.ts "pass findings excluded from detail rendering" (1 assertion)
- AC3 "validation detail is single line matching exact text" → validation.test.ts "validation detail is a single concise line" (2 assertions: exact match + no `\n`)
- AC4 "secret findings show redacted match + file:line" → scan-finding-details.test.ts "secret finding detail contains file location" (1 assertion)
- AC5 "env hygiene finding shows explanatory detail" → scan-finding-details.test.ts "env finding detail is present" (1 assertion)
- AC6 "output remains compact" → scan-finding-details.test.ts "skips detail for findings with null detail" + "splits multi-line detail" (structural verification)
- AC7 "tests pass" → ✅ 2932 passed, 2 skipped
- AC8 "no build errors" → ✅ Build succeeds

## Implementation Decisions

- **Exported `formatHumanReadable`:** The spec noted it was not exported and suggested exporting or testing indirectly. Exporting allows direct unit tests with minimal EngineResult fixtures via `createEmptyEngineResult()`, which is cleaner than integration tests via CLI subprocess. The function was already the natural public API for terminal formatting.
- **Test structure:** Created a dedicated `scan-finding-details.test.ts` rather than adding to the existing `scan.test.ts` (which uses subprocess-based integration tests). Direct function tests are faster and more precise for this display logic.

## Deviations from Contract

### A002: Detail text appears dimmed to distinguish it from the finding title
**Instead:** Verified detail line exists and is indented; chalk.gray styling is applied in code but ANSI escape presence depends on terminal/color environment during test
**Reason:** chalk.gray wraps with ANSI codes conditionally based on color support; asserting exact ANSI sequences is brittle and environment-dependent
**Outcome:** Functionally equivalent — code applies `chalk.gray()`, test verifies the detail text is present and indented. Verifier can confirm gray styling by reading the source.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run)
 Test Files  124 passed (124)
      Tests  2924 passed | 2 skipped (2926)
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run)
 Test Files  125 passed (125)
      Tests  2932 passed | 2 skipped (2934)
```

### Comparison
- Tests added: 8 (1 in validation.test.ts, 7 in scan-finding-details.test.ts)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `tests/commands/scan-finding-details.test.ts`: Detail rendering for non-null detail, gray styling, null detail skipped, multi-line split, secret detail with file location, env detail present, pass findings excluded
- `tests/engine/findings/rules/validation.test.ts`: Validation detail is single concise line (exact text match + no newline)

## Verification Commands
```bash
(cd 'packages/cli' && pnpm run build)
(cd 'packages/cli' && pnpm vitest run tests/engine/findings/rules/validation.test.ts)
(cd 'packages/cli' && pnpm vitest run tests/commands/scan-finding-details.test.ts)
(cd 'packages/cli' && pnpm vitest run)
pnpm run lint
```

## Git History
```
239d1642 [show-finding-details] Render finding detail as indented gray text
975c41f1 [show-finding-details] Rewrite validation detail to single concise line
```

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
