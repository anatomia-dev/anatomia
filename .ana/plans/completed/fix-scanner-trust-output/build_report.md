# Build Report: Fix Scanner Trust Output

**Created by:** AnaBuild
**Date:** 2026-05-17
**Spec:** .ana/plans/active/fix-scanner-trust-output/spec.md
**Branch:** feature/fix-scanner-trust-output

## What Was Built

- `packages/cli/src/engine/findings/rules/secrets.ts` (modified): Added `TEMPLATE_PATTERNS` array and `isTemplateSyntax()` helper. Integrated template check into `validate` function before the word list check — returns `false` for passwords matching `<<...>>`, `{{...}}`, `${...}`, or `<word>` patterns.
- `packages/cli/src/commands/init/state.ts` (modified): Added `const runner = packageManager === 'npm' ? 'npx' : packageManager` and replaced `packageManager` with `runner` in the three framework return strings.
- `packages/cli/tests/engine/findings/secrets.test.ts` (modified): Added 7 test cases — 5 template suppression variants (A001-A005), 1 real credential detection (A006), 1 partial template character negative case (A007).
- `packages/cli/tests/commands/init/makeTestCommand.test.ts` (modified): Corrected existing mocha assertion from `'npm mocha --exit'` to `'pnpm mocha --exit'`. Added 3 npm-specific test cases (A008-A010). Tagged existing pnpm/yarn tests (A011-A012).

## PR Summary

- Fix false-positive CRITICAL findings on template passwords (`<<pass>>`, `{{pass}}`, `${pass}`, `<pass>`) in database URLs
- Fix npm monorepo users getting unrunnable test commands (`npm vitest run` → `npx vitest run`)
- Add 10 new tests covering all template variants, real credential detection, and npm runner mapping
- Both fixes are isolated leaf-function changes with zero shared code paths

## Acceptance Criteria Coverage

- AC1 "Template syntax patterns do NOT produce findings" → secrets.test.ts: 5 tests (A001-A005) each assert `findings.critical === 0`
- AC2 "Real credentials still fire" → secrets.test.ts: "detects real credentials in database URL" (A006) asserts critical > 0
- AC3 "Passwords containing special chars still fire" → secrets.test.ts: "does not suppress passwords with partial template characters" (A007) tests `p@ss<w0rd` and `my{secret}123`
- AC4 "Tests cover at least 5 template syntax variants" → 5 template tests + `${process.env.DB_URL}` includes dotted/mixed content
- AC5 "buildDirectTestCommand(['Vitest'], 'npm') returns npx vitest run" → makeTestCommand.test.ts (A008)
- AC6 "buildDirectTestCommand(['Jest'], 'npm') returns npx jest --watchAll=false" → makeTestCommand.test.ts (A009)
- AC7 "buildDirectTestCommand(['Mocha'], 'npm') returns npx mocha --exit" → makeTestCommand.test.ts (A010)
- AC8 "pnpm/yarn/bun behavior unchanged" → existing tests pass (A011, A012); mocha assertion corrected to use pnpm (was incorrectly testing npm)
- AC9 "All existing tests pass" → 2376 passed, 0 regressions

## Implementation Decisions

- Placed `TEMPLATE_PATTERNS` as a module-level constant (peer to `DB_URL_PLACEHOLDERS`) rather than inline in the function — matches the existing pattern of declaring check data at module scope.
- `isTemplateSyntax` is a private function (not exported) since it's only used inside the validate closure. JSDoc added for clarity but no `@param`/`@returns` export requirement applies.
- Corrected the existing mocha test to use `'pnpm'` as packageManager (was `'npm'` which tested broken behavior). The new npm-specific tests now properly cover the npm case.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  106 passed (106)
     Tests  2366 passed | 2 skipped (2368)
  Duration  43.24s
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  106 passed (106)
     Tests  2376 passed | 2 skipped (2378)
  Duration  44.06s
```

### Comparison
- Tests added: 10
- Tests removed: 0
- Regressions: none

### New Tests Written
- `tests/engine/findings/secrets.test.ts`: 7 cases — template suppression for `<<password>>`, `{{db_pass}}`, `${dbPassword}`, `${process.env.DB_URL}`, `<YOUR_PASSWORD>`; real credential detection; partial template character non-suppression
- `tests/commands/init/makeTestCommand.test.ts`: 3 cases — npm+Vitest, npm+Jest, npm+Mocha

## Verification Commands
```
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
f9eeb371 [fix-scanner-trust-output] Fix npm runner mapping in buildDirectTestCommand
9f43f1c9 [fix-scanner-trust-output] Add template pattern recognition to secret validator
```

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
