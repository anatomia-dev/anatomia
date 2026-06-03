# Spec: Fix SQL Table Counting Regex

**Created by:** AnaPlan
**Date:** 2026-06-03
**Scope:** .ana/plans/active/fix-sql-table-counting-regex/scope.md

## Approach

Fix the shared SQL table-counting disease: `countUniqueTables` currently captures the first identifier after `CREATE TABLE`, so schema-qualified forms like `"public"."page"` and `content.service` store the schema name instead of the table name. It also ignores `DROP TABLE`, so the reported count is created tables rather than surviving tables.

Keep the production change inside `countUniqueTables` in `packages/cli/src/engine/scan-engine.ts`. Do not export the helper. Replace the single CREATE-only regex with a small local identifier heuristic that both CREATE and DROP handling use. The accepted identifier shape is conventional Postgres/Supabase SQL: bare word identifiers, double-quoted word identifiers, and an optional schema prefix in the same forms. Normalize only the final table identifier to lowercase before applying it to the lifecycle set.

Process SQL files in deterministic relative-path order before reading them. Lifecycle handling must be order-aware: CREATE adds the normalized table name, DROP removes it, and a later CREATE adds it again. This is the key behavior that a final `created - dropped` set subtraction cannot provide.

Keep the scanner heuristic narrow. Do not add a full SQL parser, do not make a Supabase-only branch, and do not change Prisma or Drizzle counting paths. Full-line SQL comment stripping is deferred for this scope; the known false-positive case remains out of scope unless the builder can handle it locally without broadening the parser.

## Output Mockups

Supabase fixture behavior after the fix:

```text
result.schemas['supabase'] = {
  found: true,
  path: "supabase/migrations/",
  modelCount: 14
}
```

Generic SQL fallback behavior after the fix:

```text
result.schemas['sql'] = {
  found: true,
  path: "db/",
  modelCount: 3
}
```

Identifier lifecycle examples the scan should infer:

```text
CREATE TABLE "public"."page" (...)              -> add page
CREATE TABLE IF NOT EXISTS content.service (...) -> add service
DROP TABLE "public"."obsolete_page"              -> remove obsolete_page
CREATE TABLE public.recreated (...)              -> add recreated
DROP TABLE public.recreated
CREATE TABLE public.recreated (...)              -> recreated survives
```

## File Changes

### packages/cli/src/engine/scan-engine.ts (modify)
**What changes:** Update `countUniqueTables` to parse CREATE and DROP table statements with the same optional schema-qualified identifier heuristic, sort file paths before lifecycle processing, and maintain a surviving table set.
**Pattern to follow:** Keep the helper private, pure engine code, with graceful unreadable-file handling matching the existing helper.
**Why:** Both Supabase detection and generic SQL fallback rely on this helper. Fixing only a call site would leave the shared undercount in place.

### packages/cli/tests/engine/scanProject.test.ts (modify)
**What changes:** Add scan-level regression tests using `createFiles()` fixtures and `scanProject(tempDir, { depth: 'surface' })`. Tag the tests with the contract assertion IDs.
**Pattern to follow:** Existing Supabase schema detection test near the current `falls back to first-found when all modelCount are null` case.
**Why:** The helper is private by design. Behavior should be proven through scan output that customers actually receive.

## Acceptance Criteria

- [ ] AC1: `CREATE TABLE "public"."page"` and similar quoted schema-qualified Postgres identifiers count the table name (`page`), not the schema name (`public`).
- [ ] AC2: Non-public schema prefixes such as `CREATE TABLE IF NOT EXISTS content.service` count the table name (`service`), not the schema name (`content`).
- [ ] AC3: Existing supported forms continue to count correctly: bare table names, unquoted `public.table`, `IF NOT EXISTS`, case-insensitive `CREATE TABLE`, and multiline whitespace between `TABLE` and the identifier.
- [ ] AC4: `DROP TABLE` uses the same identifier handling as `CREATE TABLE`, so dropped schema-qualified tables are removed from the surviving count.
- [ ] AC5: Lifecycle accounting is order-aware enough that a dropped table can be recreated later without being permanently subtracted.
- [ ] AC6: Supabase scan regression coverage proves a fixture with 16 created tables and 2 dropped tables reports `modelCount: 14`.
- [ ] AC7: Generic SQL fallback regression coverage proves the shared function also fixes non-Supabase SQL directory scans.
- [ ] AC8: Prisma and Drizzle regression behavior is unchanged because their counts do not use `countUniqueTables`.
- [ ] Focused CLI scan-engine tests pass with `cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts`.
- [ ] Full workspace test command remains green on main's baseline: `pnpm run test -- --run` reports 3230 passed, 0 failed.
- [ ] No CLI build errors are introduced.

## Testing Strategy

- **Unit tests:** Do not export or directly unit-test `countUniqueTables`. Test through scan output.
- **Integration tests:** Add at least two `scanProject()` cases in `packages/cli/tests/engine/scanProject.test.ts`: one Supabase dependency fixture with migrations reporting 14 surviving tables from 16 creates and 2 drops, and one dependency-free generic SQL directory fixture proving the shared fallback reports surviving tables from schema-qualified SQL.
- **Edge cases:** Cover quoted schema-qualified identifiers, non-public unquoted schema prefixes, bare identifiers, `public.table`, `IF NOT EXISTS`, case-insensitive CREATE, multiline whitespace after TABLE, schema-qualified DROP, and DROP followed by recreate.
- **Non-regression:** Add or preserve assertions showing Prisma and Drizzle model counts remain independent and unchanged in the same test file.

## Dependencies

- Vitest test infrastructure already exists.
- `scanProject()` and `createFiles()` test pattern already exist in `packages/cli/tests/engine/scanProject.test.ts`.
- `countUniqueTables` is already used by Supabase detection and generic SQL fallback.

## Constraints

- Engine code must not import CLI dependencies such as chalk, commander, or ora.
- Keep local imports with `.js` extensions if any imports are added.
- Use lowercase normalized table names, matching current helper behavior.
- Keep path filtering for Supabase `migrationFiles` and `schemaFiles` unchanged.
- Do not alter Prisma or Drizzle counting logic.
- Do not introduce a SQL parser dependency.
- Sorting SQL files is required for deterministic lifecycle behavior.

## Gotchas

- Capturing the first identifier after `TABLE` is the bug; schema-qualified inputs require capturing the final identifier after the optional schema prefix.
- A final dropped-set subtraction is wrong because it undercounts recreate-after-drop migrations.
- `glob()` ordering is not a lifecycle contract. Sort the relative paths before processing.
- Generic SQL fallback globs are broader than Supabase's filtered migration/schema globs; keep the fix shared and do not weaken fallback discovery.
- Commented SQL false positives still exist in this heuristic. Do not solve block comments in this scope.
- Backtick-quoted MySQL identifiers, `CREATE TEMP TABLE`, `CREATE TABLE AS`, multi-table `DROP TABLE a, b`, and quoted identifiers with punctuation are out of scope.
- The scan display may still call SQL tables "models"; that wording is not part of this fix.

## Build Brief

### Rules That Apply

- Engine files stay pure: no chalk, commander, ora, or user-facing output.
- Local imports require `.js` extensions and built-ins use the `node:` prefix.
- Internal helpers can use inferred return types; exported functions need explicit return types and JSDoc.
- Engine detector failures degrade gracefully and should not crash scans.
- Tests should assert exact scan results, not implementation details.
- Use inline temp fixture data for scanner tests.
- Always run Vitest with `--run` in non-interactive contexts.
- Design principle: fix the shared disease, not the Supabase symptom.
- Design principle: verify through mechanical scan output, not helper trust.

### Pattern Extracts

Current private helper and shared call sites in `packages/cli/src/engine/scan-engine.ts`:

```ts
async function countUniqueTables(rootPath: string, sqlFiles: string[]): Promise<number> {
  const tableNames = new Set<string>();
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["']?(\w+)["']?/gi;
  for (const f of sqlFiles) {
    try {
      const content = await fs.readFile(path.join(rootPath, f), 'utf-8');
      for (const match of content.matchAll(regex)) {
        if (match[1]) tableNames.add(match[1].toLowerCase());
      }
    } catch { /* skip unreadable files */ }
  }
  return tableNames.size;
}
```

```ts
const files = [...migrationFiles, ...schemaFiles];
if (files.length > 0) {
  const modelCount = await countUniqueTables(rootPath, files);
  // Record the directory that actually matched. In monorepo sub-packages
  // this surfaces as e.g. `apps/api/supabase/migrations/` instead of the
  // legacy hard-coded `supabase/migrations/` root.
  const firstPath = migrationFiles[0] ?? schemaFiles[0] ?? null;
  const schemaDir = firstPath ? `${toPosix(path.dirname(firstPath))}/` : null;
  schemas['supabase'] = { found: true, path: schemaDir, modelCount };
}
```

```ts
const sqlFiles = await glob(`${dir}/**/*.sql`, { cwd: rootPath });
if (sqlFiles.length > 0) {
  const modelCount = await countUniqueTables(rootPath, sqlFiles);
  if (modelCount > 0) {
    schemas['sql'] = { found: true, path: `${dir}/`, modelCount };
    break;
  }
}
```

Existing test fixture pattern in `packages/cli/tests/engine/scanProject.test.ts`:

```ts
async function createFiles(files: Record<string, string>): Promise<void> {
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(tempDir, filePath);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, content);
  }
}
```

```ts
await createFiles({
  'package.json': JSON.stringify({
    name: 'test',
    dependencies: { '@supabase/supabase-js': '2.0.0' },
  }),
  'supabase/migrations/001_init.sql': 'CREATE TABLE users (id INT);',
});

const result = await scanProject(tempDir, { depth: 'surface' });

expect(result.schemas['supabase']).toBeDefined();
expect(result.schemas['supabase']!.found).toBe(true);
```

### Proof Context

- `packages/cli/src/engine/scan-engine.ts`: active proof context notes high churn and prior test-coverage concerns. Relevant observations include hardcoded subdirectory lists in a large scan function and several prior detector assertions verified structurally rather than by tagged tests. This scope should offset that risk with tagged behavioral scan tests.
- `packages/cli/src/engine/scan-engine.ts`: build concerns note `detectSchemas` has seen structural churn and stale comments from prior insertions. Keep the SQL fix local and avoid wider detector refactors.
- `packages/cli/tests/engine/scanProject.test.ts`: no active proof findings for affected file.

### Checkpoint Commands

- After `scan-engine.ts` change: `cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts` — Expected: at least 43 tests pass after adding the new focused tests.
- After all changes: `pnpm run test -- --run` — Expected: 3230 existing tests plus the new tests pass, 0 failed.
- Lint: `pnpm run lint`
- Build: `pnpm run build`

### Build Baseline

- Current tests: 3230 passed, 0 failed on main, per developer-confirmed baseline.
- Current test files: 132 passing files on main, per prior full-suite output shape with no failures in the corrected baseline.
- Focused baseline command used: `cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts`
- Focused baseline: 41 tests pass in 1 file.
- After build: expected at least 3232 tests in 132 files if two tests are added to the existing scan test file.
- Regression focus: `packages/cli/src/engine/scan-engine.ts`, Supabase schema detection, generic SQL fallback detection, and existing Prisma/Drizzle schema count tests.
