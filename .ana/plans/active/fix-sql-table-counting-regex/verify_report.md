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

Build: PASS (`pnpm run build`, 2 successful tasks; cached logs include existing website data-cache warnings). Focused tests: PASS (`cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts`, 45 passed, 0 failed). Full tests: FAIL (`pnpm run test -- --run`, 3225 passed, 9 failed, 2 skipped across 132 files). Lint: PASS with warnings only (`pnpm run lint`, 0 errors, 3 warnings in unrelated cached logs).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Quoted schema-qualified Supabase tables are counted by table name | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:616` creates `"public"."page"`; `:645`-`:647` asserts Supabase found with count 14; implementation extracts final segment at `packages/cli/src/engine/scan-engine.ts:274`-`:275`. |
| A002 | Supabase migrations with sixteen creates and two drops report fourteen surviving tables | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:615`-`:639` contains 16 creates and 2 drops; `:647` asserts `modelCount` is `14`. |
| A003 | Supabase migration detection keeps the migration directory path | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:648` asserts path is `supabase/migrations/`. |
| A004 | Non-public schema prefixes count the table instead of the schema | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:659`-`:660` creates `content.service` and `content.invoice`; `:669` asserts count `4`, which would be `2` if schema names were counted. |
| A005 | Quoted public schema prefixes count the table instead of public | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:661`-`:662` creates `"public"."page"` and `"public"."post"`; `:669` asserts count `4`, which would be `2` if `public` were counted. |
| A006 | Schema-qualified dropped tables are removed from the surviving count | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:633`-`:635` drops schema-qualified tables; `:647` asserts surviving count `14`; implementation deletes on DROP at `packages/cli/src/engine/scan-engine.ts:280`-`:281`. |
| A007 | A table dropped and recreated later still survives | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:631`, `:635`, and `:638` cover create/drop/recreate; `:647` asserts the final surviving count includes the recreated table. |
| A008 | Generic SQL fallback uses the same table identifier handling | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:679`-`:682` covers schema-qualified generic SQL; `:695`-`:696` asserts SQL fallback found. |
| A009 | Generic SQL fallback reports only surviving tables | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:684`-`:689` covers drops and recreate; `:697` asserts generic SQL `modelCount` is `3`. |
| A010 | Generic SQL fallback keeps the SQL directory path | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:698` asserts path is `db/`. |
| A011 | Prisma model counting is unchanged by the SQL table fix | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:708` defines two Prisma models; `:719`-`:720` asserts Prisma `modelCount` is `2`. |
| A012 | Drizzle model counting is unchanged by the SQL table fix | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:710`-`:712` defines two Drizzle tables; `:721`-`:722` asserts Drizzle `modelCount` is `2`. |

## Independent Findings
Prediction resolution: the previous tautological A004/A005 fixture-boolean issue is fixed by the new schema-qualified count fixture at `packages/cli/tests/engine/scanProject.test.ts:651`-`:669`. The expected DROP/recreate shortcut was not found: the helper maintains a lifecycle set and deletes/re-adds in file order at `packages/cli/src/engine/scan-engine.ts:266`-`:281`. The expected parser overreach was not found: no SQL parser dependency, new imports, public helper export, or CLI dependency was added.

The production change is scoped to private `countUniqueTables`. It sorts SQL paths, reads each file, matches CREATE/DROP TABLE statements, selects the final optional schema-qualified identifier segment, lowercases it, and mutates the surviving table set. I checked for unused new exports and parameters; none were added. I checked the only catch block in the changed helper; it preserves the pre-existing graceful unreadable-file skip.

Surprise: the focused `scanProject` file passes alone but fails inside the full workspace test run because unrelated package-manager expectations in the same file still fail at `packages/cli/tests/engine/scanProject.test.ts:891`, `:920`, and `:943`. The live CLI scan on a temporary Supabase fixture returned `schemas.supabase.path: "supabase/migrations/"` and `modelCount: 3` for quoted public, non-public schema, drop, and recreate input. The missing-path CLI case exited 1 with `Error: Path not found: /tmp/anatomia-missing-sql-verify`.

Production risk not addressed by the spec: lifecycle order follows lexicographic file sort. That is deterministic and matches the spec, but unpadded migration filenames such as `10_drop.sql` and `2_create.sql` can be processed in the wrong chronological order.

## Previous Findings Resolution
### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A004 | Tagged test asserted a hard-coded fixture boolean instead of proving `content.service` counted as `service`. | SATISFIED | Builder added a schema-qualified fixture whose count is `4`; counting schema names would produce `2`. |
| A005 | Tagged test asserted a hard-coded fixture boolean instead of proving `"public"."page"` counted as `page`. | SATISFIED | Builder added a quoted public schema fixture whose count is `4`; counting `public` would produce `2`. |

### Previous Findings
| Finding | Status | Notes |
|---------|--------|-------|
| Tagged A004/A005 assertions are tautological | Fixed | New test at `packages/cli/tests/engine/scanProject.test.ts:651`-`:669` uses scan output instead of hard-coded booleans. |
| Full workspace test gate is red | Still present | `pnpm run test -- --run` still fails 9 tests: 2 scan output expectations, 3 non-Node package-manager leakage checks, and 4 package-manager inheritance checks. |

## AC Walkthrough
- AC1: PASS — quoted schema-qualified Postgres identifiers are covered at `packages/cli/tests/engine/scanProject.test.ts:616` and `:661`; implementation extracts the final segment at `packages/cli/src/engine/scan-engine.ts:274`.
- AC2: PASS — non-public schema prefixes are covered at `packages/cli/tests/engine/scanProject.test.ts:617` and `:659`-`:660`; the focused count assertion at `:669` would fail if schemas were counted.
- AC3: PASS — bare names, unquoted `public.table`, `IF NOT EXISTS`, case-insensitive CREATE, and multiline whitespace are covered at `packages/cli/tests/engine/scanProject.test.ts:618`-`:623`; focused test command passed 45/45.
- AC4: PASS — schema-qualified DROP is covered at `packages/cli/tests/engine/scanProject.test.ts:633`-`:635`; implementation deletes on DROP at `packages/cli/src/engine/scan-engine.ts:280`-`:281`.
- AC5: PASS — drop/recreate is covered at `packages/cli/tests/engine/scanProject.test.ts:631`, `:635`, and `:638`; final count is asserted at `:647`.
- AC6: PASS — Supabase regression fixture asserts `modelCount: 14` at `packages/cli/tests/engine/scanProject.test.ts:647`.
- AC7: PASS — generic SQL fallback asserts found/count/path at `packages/cli/tests/engine/scanProject.test.ts:695`-`:698`.
- AC8: PASS — Prisma and Drizzle counts remain `2` at `packages/cli/tests/engine/scanProject.test.ts:719`-`:722`.
- Focused CLI scan-engine tests: PASS — `cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts` reported 45 passed, 0 failed.
- Full workspace test command remains green: FAIL — `pnpm run test -- --run` reported 9 failed, 3225 passed, 2 skipped.
- No CLI build errors are introduced: PASS — `pnpm run build` completed successfully.

## Blockers
The required full workspace test command is still red. The failure list is unchanged in shape from the previous rejection: `packages/cli/tests/commands/scan.test.ts:426` and `:437` expect `No code detected`; `packages/cli/tests/engine/scanProject.test.ts:891`, `:920`, and `:943` expect non-Node projects to have null package managers; `packages/cli/tests/engine/detectors/detection-overrides.test.ts:252`, `:282`, `:291`, and `:300` expect no-lockfile/packageManager-field behavior that currently returns `npm`.

No additional blocker was found in the SQL change itself. I checked for unused exports, unused parameters, new external-state assumptions beyond deterministic file ordering, new swallowed error paths, and scope creep into Prisma/Drizzle detection; none of those qualify as blockers.

## Findings
- **Test — Full workspace test gate is still red:** `packages/cli/tests/engine/detectors/detection-overrides.test.ts:252` — `pnpm run test -- --run` fails 9 assertions. The SQL-focused behavior is green, but the acceptance gate explicitly requires the full workspace command to be green before shipping.
- **Upstream — Lexicographic migration ordering is deterministic but not chronological for unpadded filenames:** `packages/cli/src/engine/scan-engine.ts:266` — the spec requires sorted relative paths, and the implementation follows it. A project with `2_create.sql` and `10_drop.sql` can be lifecycle-counted in the wrong order unless migrations are timestamped or zero-padded.

## Deployer Handoff
Do not merge this round. The SQL table-counting implementation and focused regression tests now satisfy the contract, including the previous A004/A005 gaps, but the full workspace test gate is still failing with 9 tests.

## Verdict
**Shippable:** NO

Evidence gathered: contract seal intact; build passed; lint passed with warnings only; focused scanProject test passed 45/45; live CLI scan produced the expected Supabase count/path; missing-path CLI error path returned code 1; all 12 contract assertions are satisfied; full workspace tests failed with 9 failures.
