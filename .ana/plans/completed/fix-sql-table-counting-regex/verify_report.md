# Verify Report: Fix SQL Table Counting Regex

**Result:** PASS
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

Build: PASS (`pnpm run build`, 2 successful tasks; cached website logs include existing Next.js data-cache warnings). Focused tests: PASS (`cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts`, 45 passed, 0 failed). Full workspace tests: PASS (`pnpm run test -- --run`; CLI task 3234 passed, 2 skipped; website task 84 passed; 0 failed). Lint: PASS with warnings only (`pnpm run lint`, 0 errors, 3 warnings in unrelated cached logs).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Quoted schema-qualified Supabase tables are counted by table name | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:618` creates `"public"."page"`; `:648`-`:649` assert Supabase found/count; `packages/cli/src/engine/scan-engine.ts:274`-`:275` extracts the final identifier. |
| A002 | Supabase migrations with sixteen creates and two drops report fourteen surviving tables | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:617`-`:641` contains 16 creates and 2 drops; `:649` asserts `modelCount` is `14`. |
| A003 | Supabase migration detection keeps the migration directory path | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:650` asserts path is `supabase/migrations/`. |
| A004 | Non-public schema prefixes count the table instead of the schema | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:661`-`:662` creates `content.service` and `content.invoice`; `:671` asserts count `4`, which would be `2` if only schema names were counted. |
| A005 | Quoted public schema prefixes count the table instead of public | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:663`-`:664` creates `"public"."page"` and `"public"."post"`; `:671` asserts count `4`, which would be `2` if `public` were counted. |
| A006 | Schema-qualified dropped tables are removed from the surviving count | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:635`-`:637` drops schema-qualified tables; `:649` asserts surviving count `14`; implementation deletes on DROP at `packages/cli/src/engine/scan-engine.ts:280`-`:281`. |
| A007 | A table dropped and recreated later still survives | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:633`, `:637`, and `:640` cover create/drop/recreate; `:649` asserts the final surviving count includes the recreated table. |
| A008 | Generic SQL fallback uses the same table identifier handling | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:681`-`:684` covers schema-qualified generic SQL; `:697`-`:699` assert SQL fallback found with count `3`. |
| A009 | Generic SQL fallback reports only surviving tables | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:686`-`:691` covers drops and recreate; `:699` asserts generic SQL `modelCount` is `3`. |
| A010 | Generic SQL fallback keeps the SQL directory path | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:700` asserts path is `db/`. |
| A011 | Prisma model counting is unchanged by the SQL table fix | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:710` defines two Prisma models; `:721`-`:722` assert Prisma `modelCount` is `2`. |
| A012 | Drizzle model counting is unchanged by the SQL table fix | SATISFIED | `packages/cli/tests/engine/scanProject.test.ts:712`-`:714` define two Drizzle tables; `:723`-`:724` assert Drizzle `modelCount` is `2`. |

## Independent Findings
Prediction resolution: the previous tautological A004/A005 risk is fixed by the schema-qualified count fixture at `packages/cli/tests/engine/scanProject.test.ts:653`-`:671`. The expected DROP/recreate shortcut was not found: `countUniqueTables` maintains a lifecycle set and deletes/re-adds in sorted file order at `packages/cli/src/engine/scan-engine.ts:266`-`:281`. Parser overreach was not found: no SQL parser dependency, new imports, public helper export, or engine CLI dependency was added.

The production SQL change is scoped to private `countUniqueTables`. It sorts SQL paths, reads each file, matches CREATE/DROP TABLE statements, selects the final optional schema-qualified identifier segment, lowercases it, and mutates the surviving table set. I checked for unused new exports and parameters; none were added. The only catch block in the changed helper preserves the pre-existing graceful unreadable-file skip.

Surprise: the rework also changed three test fixture roots outside the original SQL file list: `packages/cli/tests/commands/scan.test.ts:22`-`:35`, `packages/cli/tests/engine/detectors/detection-overrides.test.ts:15`-`:25`, and `packages/cli/tests/engine/scanProject.test.ts:9`-`:19`. That fixes the previous workspace failures by preventing parent-directory package-manager leakage. The approach is pragmatic, but it is coupled to the detector's current five-level lockfile walk.

Live CLI check: after building, I created a temporary Supabase project and ran `node packages/cli/dist/index.js scan "$tmpdir" --json`; the output reported `schemas.supabase.path: "supabase/migrations/"` and `modelCount: 3` for quoted public, non-public schema, drop, and recreate input. The missing-path CLI case exited 1 with `Error: Path not found: /tmp/anatomia-missing-sql-verify`.

Production risk not addressed by the spec: lifecycle order follows lexicographic file sort. That is deterministic and matches the spec, but unpadded migration filenames such as `10_drop.sql` and `2_create.sql` can be processed in the wrong chronological order.

## Previous Findings Resolution
### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A004 | Tagged test asserted a hard-coded fixture boolean instead of proving `content.service` counted as `service`. | SATISFIED | Schema-qualified count fixture at `packages/cli/tests/engine/scanProject.test.ts:653`-`:671` now uses scan output; counting schemas would produce `2`, not `4`. |
| A005 | Tagged test asserted a hard-coded fixture boolean instead of proving `"public"."page"` counted as `page`. | SATISFIED | Quoted public schema fixture at `packages/cli/tests/engine/scanProject.test.ts:663`-`:664` now uses scan output; counting `public` would produce `2`, not `4`. |

### Previous Findings
| Finding | Status | Notes |
|---------|--------|-------|
| Tagged A004/A005 assertions are tautological | Fixed | New focused fixture uses scan output instead of hard-coded booleans. |
| Full workspace test gate is red | Fixed | `pnpm run test -- --run` is now green: CLI 3234 passed/2 skipped, website 84 passed, 0 failed. |
| Lexicographic migration ordering is deterministic but not chronological for unpadded filenames | Still present | This follows the current spec requirement to sort relative paths; keep it as an upstream scope note, not a blocker. |

## AC Walkthrough
- AC1: PASS — quoted schema-qualified Postgres identifiers are covered at `packages/cli/tests/engine/scanProject.test.ts:618` and `:663`; implementation extracts the final segment at `packages/cli/src/engine/scan-engine.ts:274`.
- AC2: PASS — non-public schema prefixes are covered at `packages/cli/tests/engine/scanProject.test.ts:619` and `:661`-`:662`; the focused count assertion at `:671` would fail if schemas were counted.
- AC3: PASS — bare names, unquoted `public.table`, `IF NOT EXISTS`, case-insensitive CREATE, and multiline whitespace are covered at `packages/cli/tests/engine/scanProject.test.ts:620`-`:625`; focused test command passed 45/45.
- AC4: PASS — schema-qualified DROP is covered at `packages/cli/tests/engine/scanProject.test.ts:635`-`:637`; implementation deletes on DROP at `packages/cli/src/engine/scan-engine.ts:280`-`:281`.
- AC5: PASS — drop/recreate is covered at `packages/cli/tests/engine/scanProject.test.ts:633`, `:637`, and `:640`; final count is asserted at `:649`.
- AC6: PASS — Supabase regression fixture asserts `modelCount: 14` at `packages/cli/tests/engine/scanProject.test.ts:649`.
- AC7: PASS — generic SQL fallback asserts found/count/path at `packages/cli/tests/engine/scanProject.test.ts:697`-`:700`.
- AC8: PASS — Prisma and Drizzle counts remain `2` at `packages/cli/tests/engine/scanProject.test.ts:722` and `:724`.
- Focused CLI scan-engine tests: PASS — `cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts` reported 45 passed, 0 failed.
- Full workspace test command remains green: PASS — `pnpm run test -- --run` reported CLI 3234 passed/2 skipped and website 84 passed, with 0 failures.
- No CLI build errors are introduced: PASS — `pnpm run build` completed successfully.

## Blockers
No blockers remain. I checked all 12 contract assertions against tagged tests and source lines, ran the focused scan test, ran the full workspace test command, ran build, ran lint, and live-tested the CLI success and missing-path error cases.

Specific blocker checks: no unused exports were added; no function parameters were added to the changed production helper; the only changed error path is the existing unreadable-file graceful skip; the implementation adds no new external service, environment variable, or network assumptions; Prisma and Drizzle paths remain outside the SQL helper; and the only scope expansion is test-fixture isolation needed to make the required full test gate deterministic.

## Findings
- **Test — Temp fixture isolation depends on current package-manager walk depth:** `packages/cli/tests/engine/detectors/detection-overrides.test.ts:20` — the tests avoid parent-repo package-manager leakage by nesting fixtures under `isolated/a/b/c/d/project`. This works with the current `MAX_WALK_DEPTH = 5`, but the tests are coupled to that detector constant instead of using an explicit isolated filesystem boundary.
- **Upstream — Lexicographic migration ordering is deterministic but not chronological for unpadded filenames:** `packages/cli/src/engine/scan-engine.ts:266` — the spec requires sorted relative paths, and the implementation follows it. A project with `2_create.sql` and `10_drop.sql` can be lifecycle-counted in the wrong order unless migrations are timestamped or zero-padded.

## Deployer Handoff
The branch is shippable. The SQL table-counting fix satisfies the contract, the previous A004/A005 tagged-test gap is fixed, and the previously red workspace test gate is green. The only handoff notes are the test-isolation coupling to package-manager walk depth and the known lexicographic migration-order limitation.

## Verdict
**Shippable:** YES

Evidence gathered: contract seal intact; build passed; lint passed with warnings only; focused scanProject tests passed 45/45; full workspace tests passed with 0 failures; live CLI scan produced the expected Supabase count/path; missing-path CLI error returned code 1; all 12 contract assertions are SATISFIED.
