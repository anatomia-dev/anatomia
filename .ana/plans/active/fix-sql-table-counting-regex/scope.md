# Scope: Fix SQL table counting regex

**Created by:** Ana
**Date:** 2026-06-03

## Intent

The SQL schema counter under-reports real tables when migrations use schema-qualified quoted identifiers. In Supabase-style SQL, `CREATE TABLE "public"."page"` is counted as `public` instead of `page`, collapsing multiple tables into one set entry. Supabase therefore shows 10 models when the surviving table count should be 14.

This should stay surgical: fix the shared SQL table-counting function so quoted schema prefixes and dropped tables are handled correctly, then prove the behavior through scan-level regression tests.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — one production function and focused scan-engine tests
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/scan-engine.ts`
  - `packages/cli/tests/engine/scanProject.test.ts`
- **Blast radius:** Low, but not Supabase-only. `countUniqueTables` is used by Supabase schema detection and the generic SQL fallback. Prisma and Drizzle model counts use separate code paths and should not change.
- **Estimated effort:** 30-60 minutes implementation + focused test run
- **Multi-phase:** no

## Approach

Keep the fix inside `countUniqueTables`. The function should identify the table portion of `CREATE TABLE` statements after an optional quoted or unquoted schema prefix, and it should account for `DROP TABLE` statements using the same identifier shape. This changes the SQL table-counting heuristic from "unique created names" to "surviving table names inferred from migration text."

The change should remain a heuristic, not a full SQL parser. It should correct the observed Postgres/Supabase cases without broadening the scanner into parsing every SQL dialect.

## Acceptance Criteria
- AC1: `CREATE TABLE "public"."page"` and similar quoted schema-qualified Postgres identifiers count the table name (`page`), not the schema name (`public`).
- AC2: Non-public schema prefixes such as `CREATE TABLE IF NOT EXISTS content.service` count the table name (`service`), not the schema name (`content`).
- AC3: Existing supported forms continue to count correctly: bare table names, unquoted `public.table`, `IF NOT EXISTS`, case-insensitive `CREATE TABLE`, and multiline whitespace between `TABLE` and the identifier.
- AC4: `DROP TABLE` uses the same identifier handling as `CREATE TABLE`, so dropped schema-qualified tables are removed from the surviving count.
- AC5: Lifecycle accounting is order-aware enough that a dropped table can be recreated later without being permanently subtracted.
- AC6: Supabase scan regression coverage proves a fixture with 16 created tables and 2 dropped tables reports `modelCount: 14`.
- AC7: Generic SQL fallback regression coverage proves the shared function also fixes non-Supabase SQL directory scans.
- AC8: Prisma and Drizzle regression behavior is unchanged because their counts do not use `countUniqueTables`.

## Edge Cases & Risks

Glob/file ordering matters once DROP handling is lifecycle-aware. The implementation should process SQL files deterministically, preferably by sorted relative path, so migration order does not depend on filesystem traversal order.

The proposed regex shape intentionally supports conventional Postgres identifiers made from word characters and optional double-quoted schema/table segments. It does not make the scanner a full SQL parser.

Commented SQL can still be a false positive if a file contains `-- CREATE TABLE old_data (`. No such case was observed in the reviewed repo set. Stripping full-line SQL comments is acceptable if it stays local and simple, but block-comment parsing should be deferred.

Backtick-quoted MySQL identifiers, `CREATE TEMP TABLE`, `CREATE TABLE AS`, multi-table `DROP TABLE a, b`, and unusual quoted identifiers such as `"has-hyphen"` are out of scope unless AnaPlan finds they are already handled cheaply by the same local pattern without increasing false positives.

False subtraction is the main risk. A final "created set minus dropped set" pass would undercount when a table is dropped and later recreated. The scope requires order-aware lifecycle handling to avoid that known trap.

## Rejected Approaches

**Full SQL parser.** Rejected for this scope. The scanner currently uses a lightweight heuristic, and the evidence points to a small Postgres identifier bug. Pulling in a parser would add dependency and dialect decisions disproportionate to the fix.

**Supabase-only special case.** Rejected because `countUniqueTables` is shared by Supabase detection and generic SQL fallback. Fix the shared disease once.

**Final created-minus-dropped set subtraction.** Rejected as too coarse. It fixes Supabase's current 16-created/2-dropped case, but fails if a table is dropped and later recreated.

**Export `countUniqueTables` for direct unit tests.** Rejected. The function is private to scan-engine, and scan-level tests already match the local testing pattern for schema detection.

**Bundle turbo.jsonc detection.** Rejected. That fix already shipped as a direct commit and is unrelated to table counting.

## Open Questions

None for scope. AnaPlan should make the small implementation-shape decisions called out below.

## Exploration Findings

### Patterns Discovered
- `packages/cli/src/engine/scan-engine.ts:261` — `countUniqueTables` currently uses one CREATE regex and stores matched names in a lowercase set.
- `packages/cli/src/engine/scan-engine.ts:538` — Supabase detection calls `countUniqueTables` after filtering product migration/schema SQL files.
- `packages/cli/src/engine/scan-engine.ts:563` — generic SQL fallback also calls `countUniqueTables`; this is part of the blast radius.
- `packages/cli/tests/engine/scanProject.test.ts:588` — existing Supabase scan fixture uses `scanProject()` with temp files and dependency-based activation.

### Constraints Discovered
- [TYPE-VERIFIED] Prisma counting uses `.prisma` model regexes in `scan-engine.ts` and is separate from SQL counting.
- [TYPE-VERIFIED] Drizzle counting uses table-helper call counts in `scan-engine.ts` and is separate from SQL counting.
- [OBSERVED] The proposed identifier regex fixes the reviewed core cases: quoted `"public"."page"`, unquoted `content.service`, bare `feedback`, `public.launch_weeks`, and multiline `CREATE TABLE\n  public.tickets`.
- [OBSERVED] The same regex shape does not support backticks or exotic quoted names; keep that limitation explicit unless tests prove a safe local improvement.
- [OBSERVED] Proof context marks `scan-engine.ts` as frequently touched with prior test-coverage concerns; this small production change still needs concrete regression tests.

### Test Infrastructure
- `packages/cli/tests/engine/scanProject.test.ts` uses `createFiles()` to build temp project fixtures and `scanProject(tempDir, { depth: 'surface' })` for schema-detection assertions.
- Existing schema tests assert `result.schemas[orm]!.found`, `path`, `provider`, and `modelCount` directly.

## For AnaPlan

### Structural Analog
`packages/cli/tests/engine/scanProject.test.ts:588` is the closest structural analog: it creates a Supabase dependency plus SQL migration fixture, runs `scanProject()`, and asserts Supabase schema detection. Extend this style with count assertions instead of exporting private internals.

### Relevant Code Paths
- `packages/cli/src/engine/scan-engine.ts:261` — SQL table-counting function to update
- `packages/cli/src/engine/scan-engine.ts:538` — Supabase call site
- `packages/cli/src/engine/scan-engine.ts:563` — generic SQL fallback call site
- `packages/cli/tests/engine/scanProject.test.ts:20` — temp fixture helper
- `packages/cli/tests/engine/scanProject.test.ts:588` — existing Supabase schema-detection test pattern

### Patterns to Follow
- Keep production changes inside `countUniqueTables`.
- Use lowercase normalized table names, matching current behavior.
- Use scan-level integration tests rather than exporting private helpers.
- Keep test fixtures small but representative: quoted schema, non-public schema, multiline table name, duplicate creates, drop, and recreate.

### Known Gotchas
- Sort SQL file paths before lifecycle processing if the implementation depends on migration order.
- `content.service` currently captures `content`; the fixed pattern must capture the identifier after the final optional schema prefix.
- A naive final dropped-set subtraction can make recreated tables disappear.
- `schemaFiles` and `migrationFiles` are already filtered before `countUniqueTables`; do not move or weaken the non-product path filtering.
- The scan display still says "models" for SQL-derived tables. That wording is an existing product decision and is not part of this fix.

### Things to Investigate
- Whether a tiny full-line `--` comment strip should be included while reading each SQL file, or deferred to a future SQL-parser scope.
- Whether the cleanest implementation is one shared identifier fragment for CREATE/DROP regexes or two explicit regex constants for readability.
