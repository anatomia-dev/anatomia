# Verify Report: Fix SQL Table Counting Regex

**Result:** FAIL
**Created by:** AnaVerify
**Date:** 2026-06-03
**Spec:** .ana/plans/active/fix-sql-table-counting-regex/spec.md
**Branch:** feature/fix-sql-table-counting-regex

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/fix-sql-table-counting-regex/.ana/plans/active/fix-sql-table-counting-regex/contract.yaml
  Seal: INTACT (hash sha256:ed2ac00b79c717ba3c969f7d6468f4a26623a41830b4b601119e585bd3653f56)
```

Seal status: INTACT.

Build: PASS (`pnpm run build`, 2 successful tasks).
Focused tests: PASS (`cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts`, 44 passed, 0 failed).
Full tests: FAIL (`pnpm run test -- --run`, 3224 passed, 9 failed, 2 skipped across 132 files).
Lint: PASS with warnings only (`pnpm run lint`, 0 errors, 3 warnings in unrelated files).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Quoted schema-qualified Supabase tables are counted by table name | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:623` includes `"public"."page"` and `:657` asserts Supabase found; `packages/cli/src/engine/scan-engine.ts:274` selects the final identifier segment. |
| A002 | Supabase migrations with sixteen creates and two drops report fourteen surviving tables | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:658` asserts `modelCount` is `14`. |
| A003 | Supabase migration detection keeps the migration directory path | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:659` asserts path is `supabase/migrations/`. |
| A004 | Non-public schema prefixes count the table instead of the schema | UNSATISFIED | Tagged test uses `fixture.includesContentServiceAsService = true` at `packages/cli/tests/engine/scanProject.test.ts:611` and asserts that constant at `:652`; it does not observe that `content.service` was counted as `service` rather than `content`. |
| A005 | Quoted public schema prefixes count the table instead of public | UNSATISFIED | Tagged test uses `fixture.includesPublicPageAsPage = true` at `packages/cli/tests/engine/scanProject.test.ts:612` and asserts that constant at `:653`; it does not observe the extracted table name. |
| A006 | Schema-qualified dropped tables are removed from the surviving count | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:641` and `:642` drop schema-qualified tables; `:658` asserts the surviving count is `14`, which would be higher if drops were ignored. |
| A007 | A table dropped and recreated later still survives | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:642` drops `public.recreated`, `:645` recreates it, and `:658` asserts the final surviving count includes the recreated table. |
| A008 | Generic SQL fallback uses the same table identifier handling | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:669` and `:670` cover schema-qualified generic SQL, and `:686` asserts SQL fallback found. |
| A009 | Generic SQL fallback reports only surviving tables | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:687` asserts generic SQL `modelCount` is `3`. |
| A010 | Generic SQL fallback keeps the SQL directory path | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:688` asserts path is `db/`. |
| A011 | Prisma model counting is unchanged by the SQL table fix | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:710` asserts Prisma `modelCount` is `2`. |
| A012 | Drizzle model counting is unchanged by the SQL table fix | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:712` asserts Drizzle `modelCount` is `2`. |

## Independent Findings
The production change is tightly scoped to private `countUniqueTables`: it sorts SQL file paths before reading (`packages/cli/src/engine/scan-engine.ts:266`), applies a shared CREATE/DROP regex (`:263`), selects the final schema-qualified identifier (`:274`), normalizes to lowercase (`:275`), and mutates a surviving table set in order (`:278`-`:281`). No new imports, exports, CLI dependencies, or parser dependency were added.

Prediction resolution: the expected glob-order issue was not found because the helper sorts copied paths before processing. DROP handling supports `IF EXISTS` in the regex at `packages/cli/src/engine/scan-engine.ts:263`, so the simple `DROP TABLE IF EXISTS` case was not missed. The fixture-boolean prediction was confirmed for A004/A005: those assertions are tagged but tautological. The production risk prediction around SQL comments remains an acknowledged spec gap, not introduced here.

Live CLI check: after building, I created a temporary Supabase project and ran `node packages/cli/dist/index.js scan "$tmpdir" --json`; the output reported `schemas.supabase.path: "supabase/migrations/"` and `modelCount: 3` for quoted `public.page`, `content.service`, `users`, drop, and recreate input.

Full-suite failure: the required workspace test command failed with 9 failures. The failing cases are outside the SQL change surface, but this still violates the contract's full-suite acceptance gate.

## AC Walkthrough
- AC1: PASS — `packages/cli/src/engine/scan-engine.ts:274` selects the final identifier, and the live CLI scan returned the expected surviving count for `"public"."page"`.
- AC2: PASS — `packages/cli/tests/engine/scanProject.test.ts:624` covers `content.service`; implementation final-segment extraction is at `packages/cli/src/engine/scan-engine.ts:274`.
- AC3: PASS — bare names, unquoted `public.table`, `IF NOT EXISTS`, case-insensitive CREATE, and multiline whitespace are covered at `packages/cli/tests/engine/scanProject.test.ts:625`-`:630`; focused test passed.
- AC4: PASS — schema-qualified DROP is covered at `packages/cli/tests/engine/scanProject.test.ts:641`-`:642`; implementation deletes on DROP at `packages/cli/src/engine/scan-engine.ts:280`-`:281`.
- AC5: PASS — drop/recreate is covered at `packages/cli/tests/engine/scanProject.test.ts:642` and `:645`; final count is asserted at `:658`.
- AC6: PASS — Supabase fixture asserts `modelCount: 14` at `packages/cli/tests/engine/scanProject.test.ts:658`.
- AC7: PASS — generic SQL fallback asserts found/count/path at `packages/cli/tests/engine/scanProject.test.ts:685`-`:688`.
- AC8: PASS — Prisma and Drizzle counts remain `2` at `packages/cli/tests/engine/scanProject.test.ts:710` and `:712`.
- Focused CLI scan-engine tests: PASS — `cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts` reported 44 passed, 0 failed.
- Full workspace test command: FAIL — `pnpm run test -- --run` reported 9 failed, 3224 passed, 2 skipped.
- No CLI build errors: PASS — `pnpm run build` completed successfully.

## Blockers
Two blockers prevent shipping. First, contract assertions A004 and A005 are UNSATISFIED because their tagged checks are constant booleans rather than evidence from scan output or a real parsed table-name list. The implementation appears correct by source inspection, but the contract requires tagged mechanical proof.

Second, the required full workspace test command failed. I checked the failure list: it includes empty scan output expectations in `packages/cli/tests/commands/scan.test.ts:426` and `:437`, non-Node package-manager leakage assertions in `packages/cli/tests/engine/scanProject.test.ts:881`, `:910`, and `:933`, and package-manager inheritance assertions in `packages/cli/tests/engine/detectors/detection-overrides.test.ts:252`, `:282`, `:291`, and `:300`. These are not in the SQL diff, but the acceptance gate is not green.

I also checked for unused exports, unused parameters, swallowed new error paths, external-state assumptions, and over-building in the new code. No new exports or parameters were added, the existing unreadable-file catch remains the intended graceful-degradation path, and no external state assumptions beyond file ordering were introduced.

## Findings
- **Test — Tagged A004/A005 assertions are tautological:** `packages/cli/tests/engine/scanProject.test.ts:610` — the test creates fixture booleans set to `true` and asserts them, so it does not prove `content.service` becomes `service` or `"public"."page"` becomes `page`. The aggregate count catches some regressions, but a wrong implementation could still count the schema names and preserve the same cardinality.
- **Test — Full workspace test gate is red:** `packages/cli/tests/engine/detectors/detection-overrides.test.ts:252` — `pnpm run test -- --run` fails 9 assertions, mostly package-manager detection returning `npm` where tests expect `null`, `bun`, `pnpm`, or `yarn`, plus two scan output tests expecting `No code detected`.

## Deployer Handoff
Do not merge this round. The SQL implementation is small and the focused regression tests pass, but the verify result is FAIL because the full test gate is red and two contract assertions are not mechanically proven by their tagged checks.

## Verdict
**Shippable:** NO

Evidence gathered: contract seal intact; build passed; lint had warnings only; focused scanProject tests passed; live CLI scan produced the expected Supabase count/path; full workspace tests failed with 9 failures; A004 and A005 remain UNSATISFIED due weak tagged assertions.
