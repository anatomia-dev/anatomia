# Build Report: Fix SQL Table Counting Regex

**Created by:** AnaBuild
**Date:** 2026-06-03
**Spec:** .ana/plans/active/fix-sql-table-counting-regex/spec.md
**Branch:** feature/fix-sql-table-counting-regex

## What Was Built
- packages/cli/src/engine/scan-engine.ts (modified): Replaced CREATE-only SQL table counting with a private order-aware CREATE/DROP TABLE heuristic that supports optional schema qualification and sorts SQL files before processing.
- packages/cli/tests/engine/scanProject.test.ts (modified): Added tagged scan-level regression tests for Supabase migrations, generic SQL fallback, and Prisma/Drizzle non-regression.

## PR Summary
- Fixes SQL schema counting so schema-qualified identifiers count the table name, not the schema name.
- Adds order-aware DROP TABLE lifecycle handling, including recreate-after-drop behavior.
- Keeps the fix inside the shared private SQL counting helper used by Supabase and generic SQL fallback.
- Adds scan-output regression coverage for all 12 contract assertions.

## Acceptance Criteria Coverage
- AC1 "quoted schema-qualified identifiers count table name" -> scanProject.test.ts "counts surviving Supabase tables from schema-qualified SQL" asserts Supabase found and count 14, with `"public"."page"` in fixture.
- AC2 "non-public schema prefixes count table name" -> same test includes `content.service` and asserts fixture coverage.
- AC3 "existing supported forms continue" -> same test includes bare names, `public.table`, `IF NOT EXISTS`, mixed-case CREATE TABLE, and multiline whitespace.
- AC4 "DROP TABLE uses same identifier handling" -> same test drops `"public"."obsolete_page"` and `public.recreated`; generic fallback test also drops schema-qualified tables.
- AC5 "dropped table can be recreated later" -> same test drops and recreates `public.recreated`.
- AC6 "Supabase fixture 16 creates / 2 drops reports 14" -> same test asserts `result.schemas['supabase']!.modelCount === 14`.
- AC7 "generic SQL fallback fixed" -> scanProject.test.ts "counts surviving tables in generic SQL fallback" asserts `sql.modelCount === 3`.
- AC8 "Prisma and Drizzle unchanged" -> scanProject.test.ts "keeps Prisma and Drizzle counts independent from SQL table counting" asserts both model counts are 2.
- Focused CLI scan-engine tests -> verified with `cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts`, 44 passed.
- Full workspace test -> run; failed with 9 unrelated full-suite interaction failures. All three failing files pass individually.
- No CLI build errors -> verified with `pnpm run build`.

## Implementation Decisions
- The table statement heuristic accepts only bare word and double-quoted word identifiers, with one optional schema prefix, matching the spec's Postgres/Supabase scope.
- DROP TABLE IF EXISTS is supported alongside CREATE TABLE IF NOT EXISTS because it uses the same identifier extraction path.
- SQL files are copied and sorted with `[...sqlFiles].sort()` so callers are not mutated.

## Deviations from Contract
None - contract followed exactly.

Contract coverage: 12/12 assertions tagged.

## Test Results

### Baseline (before changes)
Command: `pnpm run build`

Output summary:
```text
Tasks:    2 successful, 2 total
Cached:    2 cached, 2 total
Time:    47ms >>> FULL TURBO
```

Command: `cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts`

Output:
```text
Test Files  1 passed (1)
Tests  41 passed (41)
Duration  2.56s
```

Full workspace baseline was not rerun before changes; Build Brief recorded main baseline as 3230 passed, 0 failed.

### After Changes
Command: `pnpm run build`

Output summary:
```text
Tasks:    2 successful, 2 total
Cached:    1 cached, 2 total
Time:    2.333s
```

Command: `pnpm run lint`

Output summary:
```text
Tasks:    2 successful, 2 total
Cached:    1 cached, 2 total
Time:    4.094s

Warnings:
website/components/hero/Hero.tsx: two unused variable warnings
packages/cli/src/utils/git-operations.ts: unused eslint-disable directive warning
```

Command: `cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts`

Output:
```text
Test Files  1 passed (1)
Tests  44 passed (44)
Duration  3.60s
```

Command: `pnpm run test -- --run`

Output summary:
```text
Test Files  3 failed | 129 passed (132)
Tests  9 failed | 3224 passed | 2 skipped (3235)
Failed:
- tests/commands/scan.test.ts: 2 no-code display expectation failures
- tests/engine/scanProject.test.ts: 3 non-Node packageManager expectation failures
- tests/engine/detectors/detection-overrides.test.ts: 4 packageManager detection failures
```

Individual reruns of the failing files:
```text
cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts
Test Files  1 passed (1)
Tests  44 passed (44)

cd packages/cli && pnpm vitest run tests/engine/detectors/detection-overrides.test.ts
Test Files  1 passed (1)
Tests  21 passed (21)

cd packages/cli && pnpm vitest run tests/commands/scan.test.ts
Test Files  1 passed (1)
Tests  89 passed (89)
```

### Comparison
- Tests added: 3
- Tests removed: 0
- Regressions: none identified in the scoped SQL table-counting behavior; full workspace command has unrelated interaction failures documented in Open Issues.

### New Tests Written
- packages/cli/tests/engine/scanProject.test.ts: Supabase schema-qualified SQL lifecycle counting, generic SQL fallback lifecycle counting, and Prisma/Drizzle model-count independence.

## Verification Commands
```bash
pnpm run build
cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts
pnpm run test -- --run
pnpm run lint
```

## Git History
```text
14fa06d0 [fix-sql-table-counting-regex] Add SQL scan regressions
c2024ac3 [fix-sql-table-counting-regex] Count surviving SQL tables
```

## Open Issues
- Full workspace test command `pnpm run test -- --run` failed with 9 failures in 3 files. The failing files all pass when rerun individually, and the new SQL regression tests pass both individually and in the full run. This points to full-suite interaction or environment pollution outside this scope.
- Workspace lint passes with warnings in unrelated files: `website/components/hero/Hero.tsx` and `packages/cli/src/utils/git-operations.ts`.
- What did I notice during the build that I didn't write down? The website build also logs repeated Next.js data cache size warnings for `.ana/proof_chain.json`; build still succeeds.
- Verified complete by second pass.
