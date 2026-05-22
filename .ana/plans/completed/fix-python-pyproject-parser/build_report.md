# Build Report: Fix Python pyproject.toml parser — 3 bugs

**Created by:** AnaBuild
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-python-pyproject-parser/spec.md
**Branch:** feature/fix-python-pyproject-parser

## What Was Built

- `packages/cli/src/engine/parsers/python/pyproject.ts` (modified): Three bug fixes — (1) `extractFromArray` regex updated from `/"(...)/` to `/["'](...)/` with `'` added to trailing character class, supporting single-quoted TOML strings; (2) Strategy 1 and Strategy 2 group regexes changed from `\]` to `\]\s*$` for end-of-line anchoring, preventing early termination at extras brackets like `[trio]`; (3) New Strategy 5 block (~15 lines) added after Strategy 2 to parse PEP 735 `[dependency-groups]` sections, mirroring Strategy 2's section-then-groups structure. Two code comments added documenting the `\]\s*$` regex tradeoff and Strategy 1's lack of section scoping.

- `packages/cli/tests/engine/parsers/python.test.ts` (modified): 9 new test cases added to the `parsePyprojectToml` describe block covering PEP 735 dependency-groups (multi-group, single-line, empty section), extras brackets array termination, single-quoted strings (pure and mixed), include-group inline tables, fastapi-style integration, pydantic-style integration, and combined edge cases.

## PR Summary

- Fix PEP 735 `[dependency-groups]` parsing so pytest and other testing deps are detected in modern Python projects (fastapi, pydantic)
- Fix array termination bug where extras brackets like `"anyio[trio]"` caused early regex match, dropping subsequent dependencies
- Support single-quoted strings in TOML arrays (used by pydantic's pyproject.toml)
- Add 9 tests covering all three bugs, edge cases, and real-world pyproject.toml patterns
- Document regex tradeoffs and Strategy 1 section-scoping limitation in code comments

## Acceptance Criteria Coverage

- AC1 "dependency-groups detected" → python.test.ts "parses PEP 735 dependency-groups" (2 assertions: contains pytest, length > 1)
- AC2 "extras brackets parsed completely" → python.test.ts "handles extras brackets in arrays" (2 assertions: contains anyio, contains httpx)
- AC3 "single-line arrays still work" → python.test.ts "handles single-line arrays" (1 assertion: contains pytest-benchmark)
- AC4 "single-quoted strings extracted" → python.test.ts "handles single-quoted strings" (2 assertions: contains pytest, contains coverage)
- AC5 "pytest in fastapi/pydantic results" → python.test.ts "extracts pytest from fastapi-style pyproject" + "extracts pytest from pydantic-style pyproject" (6 + 2 assertions)
- AC6 "include-group no crash" → python.test.ts "handles include-group inline tables" (2 assertions: contains pytest, not contains include-group)
- AC7 "existing tests unchanged" → all 4 original tests pass unmodified (verified in baseline and final run)
- AC8 "code comments present" → pyproject.ts lines 47 ("not section-scoped") and 51 ("TOML parser")

## Implementation Decisions

- Placed Strategy 5 comment as "PEP 735 (Python 3.12+)" to match the PEP 735 standard context, consistent with how Strategies 1-4 reference their standards.
- Added a note about `include-group` inline tables producing harmless phantom dep names — this is informational for future maintainers, since `{include-group = "tests"}` doesn't match the `["']` leading quote in `extractFromArray` and produces no output.
- The "empty dependency-groups section" and "combined edge case" tests are bonus coverage beyond the contract — they guard against regression in the section terminator regex and the interaction of all three fixes.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run tests/engine/parsers/python.test.ts)

 Test Files  1 passed (1)
      Tests  15 passed (15)
   Duration  138ms
```

Full suite baseline: 2837 passed, 2 skipped (122 test files)

### After Changes
```
(cd 'packages/cli' && pnpm vitest run tests/engine/parsers/python.test.ts)

 Test Files  1 passed (1)
      Tests  24 passed (24)
   Duration  145ms
```

Full suite:
```
pnpm run test -- --run

 Test Files  122 passed (122)
      Tests  2846 passed | 2 skipped (2848)
   Duration  43.04s
```

### Comparison
- Tests added: 9
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/engine/parsers/python.test.ts`: PEP 735 multi-group extraction, extras brackets array termination, single-line dependency-groups arrays, single-quoted strings (pure and mixed), fastapi-style integration, pydantic-style integration, include-group inline tables, empty dependency-groups section, combined edge case (extras + single quotes in dependency-groups)

## Verification Commands
```bash
pnpm run build
(cd 'packages/cli' && pnpm vitest run tests/engine/parsers/python.test.ts)
pnpm run test -- --run
pnpm run lint
```

## Git History
```
c890c7a7 [fix-python-pyproject-parser] Add tests for all 3 parser bug fixes
d616350c [fix-python-pyproject-parser] Fix 3 pyproject.toml parsing bugs
```

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
