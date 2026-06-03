# Build Report: Fix SQL Table Counting Regex

**Created by:** AnaBuild
**Date:** 2026-06-03
**Spec:** .ana/plans/active/fix-sql-table-counting-regex/spec.md
**Branch:** feature/fix-sql-table-counting-regex

## What Was Built
- packages/cli/src/engine/scan-engine.ts (modified): Replaced CREATE-only SQL table counting with a private order-aware CREATE/DROP TABLE heuristic that supports optional schema qualification and sorts SQL files before processing.
- packages/cli/tests/engine/scanProject.test.ts (modified): Added tagged scan-level regression tests for Supabase migrations, generic SQL fallback, Prisma/Drizzle non-regression, and paired schema/table fixture coverage; later isolated the temp project root from ambient parent lockfiles under turbo.
- packages/cli/tests/commands/scan.test.ts (modified): Moved scan command fixtures into a deeper per-test temp root so empty and non-code scans do not inherit package-manager signals from the system temp directory.
- packages/cli/tests/engine/detectors/detection-overrides.test.ts (modified): Moved package-manager and related detector fixtures into deeper per-test temp roots so upward lockfile walking cannot reach unrelated package metadata in turbo runs.

## PR Summary
- Fixes SQL schema counting so schema-qualified identifiers count the table name, not the schema name.
- Adds order-aware DROP TABLE lifecycle handling, including recreate-after-drop behavior.
- Keeps the SQL fix inside the shared private helper used by Supabase and generic SQL fallback.
- Adds scan-output regression coverage for all 12 contract assertions.
- Fixes the full workspace test blocker by isolating temp project roots used by package-manager and no-code scan tests.

## Acceptance Criteria Coverage
- AC1 "quoted schema-qualified identifiers count table name" -> scanProject.test.ts "counts surviving Supabase tables from schema-qualified SQL" asserts Supabase found and count 14 with `"public"."page"` in the fixture; "counts schema-qualified Supabase identifiers by final table segment" asserts paired quoted public tables produce count 4.
- AC2 "non-public schema prefixes count table name" -> scanProject.test.ts "counts schema-qualified Supabase identifiers by final table segment" asserts paired `content.service` and `content.invoice` produce count 4; schema-name extraction would produce 2.
- AC3 "existing supported forms continue" -> scanProject.test.ts "counts surviving Supabase tables from schema-qualified SQL" includes bare names, `public.table`, `IF NOT EXISTS`, mixed-case CREATE TABLE, and multiline whitespace.
- AC4 "DROP TABLE uses same identifier handling" -> same Supabase lifecycle test drops `"public"."obsolete_page"` and `public.recreated`; generic fallback test also drops schema-qualified tables.
- AC5 "dropped table can be recreated later" -> same Supabase lifecycle test drops and recreates `public.recreated`.
- AC6 "Supabase fixture 16 creates / 2 drops reports 14" -> same test asserts `result.schemas['supabase']!.modelCount === 14`.
- AC7 "generic SQL fallback fixed" -> scanProject.test.ts "counts surviving tables in generic SQL fallback" asserts `sql.modelCount === 3`.
- AC8 "Prisma and Drizzle unchanged" -> scanProject.test.ts "keeps Prisma and Drizzle counts independent from SQL table counting" asserts both model counts are 2.
- Focused CLI scan-engine tests -> verified with `cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts`, 45 passed.
- Full workspace test -> verified with `pnpm run test -- --run`, 132 files passed, 3234 tests passed, 2 skipped.
- No CLI build errors -> verified with `pnpm run build`.

## Implementation Decisions
- The table statement heuristic accepts only bare word and double-quoted word identifiers, with one optional schema prefix, matching the spec's Postgres/Supabase scope.
- DROP TABLE IF EXISTS is supported alongside CREATE TABLE IF NOT EXISTS because it uses the same identifier extraction path.
- SQL files are copied and sorted with `[...sqlFiles].sort()` so callers are not mutated.
- For the verify fix, I added a focused paired-identifier Supabase test instead of exposing the private helper. The scan result count is the mechanical evidence: table-segment extraction returns 4, while schema-name extraction would collapse to 2.
- For the full-suite blocker, I changed test fixture setup rather than production detection. The temp project path is nested beneath five empty parent levels, so `detectPackageManager()` cannot walk far enough to see ambient lockfiles or package manifests outside the test root.

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

Full workspace baseline from Build Brief: 3230 passed, 0 failed on main.

### After Changes
Command: `cd packages/cli && pnpm vitest run tests/engine/detectors/detection-overrides.test.ts`

Output:
```text
Test Files  1 passed (1)
Tests  21 passed (21)
Duration  1.02s
```

Command: `cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts`

Output:
```text
Test Files  1 passed (1)
Tests  45 passed (45)
Duration  3.10s
```

Command: `cd packages/cli && pnpm vitest run tests/commands/scan.test.ts`

Output:
```text
Test Files  1 passed (1)
Tests  89 passed (89)
Duration  15.52s
```

Command: `pnpm run test -- --run`

Output summary:
```text
anatomia-website:test:
Test Files  11 passed (11)
Tests  84 passed (84)

anatomia-cli:test:
Test Files  132 passed (132)
Tests  3234 passed | 2 skipped (3236)
Duration  51.65s

Tasks:    4 successful, 4 total
Cached:    2 cached, 4 total
Time:    54.023s
```

Command: `pnpm run lint`

Output summary:
```text
Tasks:    2 successful, 2 total
Cached:    1 cached, 2 total
Time:    3.783s

Warnings:
website/components/hero/Hero.tsx: two unused variable warnings from cached website lint output
packages/cli/src/utils/git-operations.ts: one unused eslint-disable directive warning
```

Command: `pnpm run build`

Output summary:
```text
Tasks:    2 successful, 2 total
Cached:    1 cached, 2 total
Time:    1.941s

CLI build: typecheck passed; tsup ESM build succeeded.
Website build: succeeded with cached Next.js workspace-root and proof_chain.json data-cache size warnings.
```

Commit hook output for final fix commit:
```text
pnpm build: passed
pnpm typecheck: passed
pnpm typecheck:tests: passed
pnpm lint: passed with 1 pre-existing warning in packages/cli/src/utils/git-operations.ts
```

### Comparison
- Tests added: 4 total in this branch, including 1 verify-fix test after the first failed verify report.
- Tests removed: 0
- Regressions: none. The previous full workspace failures are resolved.

### New Tests Written
- packages/cli/tests/engine/scanProject.test.ts: Supabase schema-qualified SQL lifecycle counting, paired schema/table identifier extraction coverage, generic SQL fallback lifecycle counting, and Prisma/Drizzle model-count independence.

## Verification Commands
```bash
pnpm run build
cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts
pnpm run test -- --run
pnpm run lint
```

## Git History
```text
c96147fb [fix-sql-table-counting-regex] Fix: isolate temp project roots
d7524893 [fix-sql-table-counting-regex] Update: Verify report
fd19f425 [fix-sql-table-counting-regex] Update: Build report
05b73346 [fix-sql-table-counting-regex] Fix: strengthen schema identifier coverage
69c4b93c [fix-sql-table-counting-regex] Verify report
dc107f0f [fix-sql-table-counting-regex] Build report
14fa06d0 [fix-sql-table-counting-regex] Add SQL scan regressions
c2024ac3 [fix-sql-table-counting-regex] Count surviving SQL tables
```

## Fix History
- Verify round 1 failed A004/A005 because the tagged assertions were tautological fixture booleans. Fixed by removing those booleans and adding a paired Supabase scan fixture whose `modelCount` proves final table-segment extraction.
- Verify round 2 failed the full workspace test gate with 9 failures caused by package-manager detection seeing ambient parent package metadata in turbo runs. Fixed by isolating temp project roots in the three affected test files.

## Open Issues
- Workspace lint passes with warnings in unrelated/cached output: `website/components/hero/Hero.tsx` and `packages/cli/src/utils/git-operations.ts`.
- Website build logs cached Next.js warnings for workspace-root inference and proof_chain.json data-cache size while still succeeding.
- What did I notice during the build that I didn't write down? The full-suite SQL scan tests and the formerly failing package-manager/no-code scan tests now all pass under turbo.
- Verified complete by second pass.
