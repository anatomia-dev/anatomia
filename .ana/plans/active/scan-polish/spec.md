# Spec: Scan Polish — Detection Gaps + AGENTS.md Quality

**Created by:** AnaPlan
**Date:** 2026-05-26
**Scope:** .ana/plans/active/scan-polish/scope.md

## Approach

Five independent improvements shipped together. All are additive or display-only — no existing correct output changes. Two files affected: `scan-engine.ts` (3 functional changes + 2 comment fixes) and `assets.ts` (2 functional changes).

**Drizzle barrel fallback:** After the scoring loop selects `best` but finds `modelCount === 0`, check if the file is a barrel (re-export index). Expand `path.dirname(best.path)` recursively for `.ts` files, count table helpers across all of them, aggregate. Store the barrel file path as `schemas['drizzle'].path`. Only triggers for census-resolved paths — the glob fallback already has its own content filter.

**Env monorepo enrichment:** At the `detectSecrets` call site (line 962), after secrets are returned, check if `envExampleExists` is false AND `census.primarySourceRoot !== '.'`. If so, re-check `census.primarySourceRoot` for `.env.example`/`.env.template`. Mutate the returned object — avoids changing function signature.

**AI sub-provider collapse:** In AGENTS.md services section, filter standalone services to exclude names matching `stack.aiSdk + ' ('` prefix. Preserves direct SDK entries (e.g., "OpenAI" standalone).

**Surfaces section:** New section in AGENTS.md between Deployment and Conventions. Lists surfaces with path and framework. Cap at 4 with "+N more" overflow. Omitted when `surfaces.length === 0`.

**Stale comments:** Two fixes — accurate three-tier description at line 723-724, correct line reference at line 733.

## Output Mockups

### AGENTS.md Surfaces Section (new)
```
## Surfaces
- cli (packages/cli)
- website (website) — Next.js
- api (packages/api) — Express
- mobile (apps/mobile) — React Native
```

When > 4 surfaces:
```
## Surfaces
- cli (packages/cli)
- website (website) — Next.js
- api (packages/api) — Express
- mobile (apps/mobile) — React Native
+2 more
```

### AGENTS.md Services Section (after collapse)
Before (inbox-zero):
```
## Services
- Vercel AI (OpenAI) (ai)
- Vercel AI (Anthropic) (ai)
- Vercel AI (Google) (ai)
- OpenAI (ai)
- Upstash (database)
```

After:
```
## Services
- OpenAI (ai)
- Upstash (database)
```

## File Changes

### `packages/cli/src/engine/scan-engine.ts` (modify)
**What changes:** 
1. Barrel fallback after Drizzle scoring loop — when `best.modelCount === 0`, expand directory and re-aggregate.
2. Env enrichment at `detectSecrets` call site — monorepo primary root check.
3. Two stale comments fixed (lines 723-724, 733).

**Pattern to follow:** The existing directory expansion at lines 408-411 (`${p}/**/*.ts` glob pattern). The barrel fallback uses the same glob + content-filter approach.

**Why:** Without the barrel fallback, repos using barrel-index schema files (openstatus) report 0 models. Without env enrichment, monorepos with `.env.example` in primary package report false.

### `packages/cli/src/commands/init/assets.ts` (modify)
**What changes:**
1. AI sub-provider filter in services section.
2. New Surfaces section between Deployment and Conventions.

**Pattern to follow:** `state.ts:997-1017` for surfaces rendering with truncation. `scan.ts:193-196` for standalone service filtering.

**Why:** Without AI collapse, AGENTS.md lists redundant sub-provider variants. Without Surfaces, monorepo projects get no surface visibility in AGENTS.md.

## Acceptance Criteria

- [ ] AC1: Drizzle barrel file with 0 direct tables triggers directory expansion; openstatus-like structure reports ~40 models
- [ ] AC2: Monorepo with `.env.example` in primary source root (not repo root) reports `envExampleExists: true`
- [ ] AC3: AGENTS.md services section excludes AI sub-provider variants (names matching `aiSdk + ' ('`) but preserves standalone SDK entries
- [ ] AC4: AGENTS.md has `## Surfaces` section when `surfaces.length > 0`; omitted for single-package repos
- [ ] AC5: Comment at line 723-724 accurately describes three-tier detection model
- [ ] AC6: Line reference at line 733 updated from "~504" to "~659"
- [ ] AC7: Repos with single-file Drizzle schemas (non-barrel) produce unchanged model counts
- [ ] AC8: All existing tests pass — zero regressions
- [ ] Tests pass with `pnpm vitest run`
- [ ] No lint errors

## Testing Strategy

- **Unit tests:** Add to `tests/engine/scanProject.test.ts` — the barrel fallback test creates a drizzle.config pointing to a barrel index that re-exports, with table definitions in sibling files. Verify aggregated count.
- **Unit tests:** Add env monorepo test — project with `.env.example` in a subdirectory primary source root.
- **Unit tests:** Add to a new `tests/commands/agents-md.test.ts` or extend existing init tests — verify AI service collapse and surfaces section rendering. Since `generateAgentsMd` writes to disk, tests create a temp dir without existing AGENTS.md, call the function, read the output.
- **Edge cases:**
  - Barrel file in census match, NOT in glob fallback (ensure glob fallback is untouched)
  - Single-file schema with real tables (modelCount > 0) — fallback must NOT trigger
  - `surfaces.length === 0` — no Surfaces heading rendered
  - `surfaces.length > 4` — truncation with "+N more"
  - `stack.aiSdk` is null — no filtering applied (guard with `if (stack.aiSdk)`)

## Dependencies

None. All changes are additive to existing code paths.

## Constraints

- Engine files have zero CLI dependencies (no chalk, no commander).
- Barrel fallback must only trigger from census matches — guard with a flag or position check.
- Performance: barrel expansion reads files in a bounded directory. No unbounded recursion.
- The `generateAgentsMd` early return (line 342) means changes only affect new inits. This is by design.

## Gotchas

- The barrel fallback must check `best.modelCount === 0` BEFORE the `schemas['drizzle']` assignment at line 480. Insert between line 474 (`if (best)`) and line 476 (dialect fallback). The logic is: check modelCount → if 0, expand → reassign modelCount/provider on `best`.
- `census.primarySourceRoot` is a relative path (e.g., `packages/cli`). Join with `rootPath` for filesystem access.
- The env enrichment must guard `census.primarySourceRoot !== '.'` — if primary IS root, the root check already ran correctly.
- For surfaces section placement: it goes AFTER the Deployment section and BEFORE the Conventions section. Look for where `engineResult?.conventions` is checked — the Surfaces section inserts before that block.
- `engineResult.surfaces` uses the `Surface` interface: `{ name, path, packageName, language, framework, testing, sourceFiles }`. Use `name` and `path` for display, `framework` when non-null.
- The existing test at `scanProject.test.ts:427` ("schema with no tables reports modelCount 0") uses `pgTable` in an import but no actual table call. This test must STILL pass — the barrel fallback only triggers when directory expansion finds tables in SIBLING files, not when the single file itself has no tables and there are no siblings.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Engine files have zero CLI dependencies — no chalk, no ora.
- Prefer early returns over nested conditionals.
- Empty catch blocks in engine are intentional (graceful degradation).
- Explicit return types on exported functions. Internal helpers use inference.
- Use `| null` for checked-and-empty fields.

### Pattern Extracts

**Directory expansion pattern (scan-engine.ts:408-411):**
```typescript
              if (stat.isDirectory()) {
                // Directory: find all .ts files inside
                const dirFiles = (await glob(`${p}/**/*.ts`, SCHEMA_GLOB_OPTS)).map(toPosix);
                matches.push(...dirFiles);
              }
```

**Drizzle scoring with table helper regex (scan-engine.ts:452-456):**
```typescript
            const content = await fs.readFile(path.join(rootPath, relPath), 'utf-8');
            const pgCount = (content.match(/pgTable\s*\(/g) || []).length;
            const mysqlCount = (content.match(/mysqlTable\s*\(/g) || []).length;
            const sqliteCount = (content.match(/sqliteTable\s*\(/g) || []).length;
            const modelCount = pgCount + mysqlCount + sqliteCount;
```

**Services standalone filter (assets.ts:427):**
```typescript
    const standalone = engineResult.externalServices.filter(svc => svc.stackRoles.length === 0);
```

**Surfaces terminal display with truncation (state.ts:1003-1016):**
```typescript
      const surfaceEntries = Object.entries(configSurfaces);
      const MAX_SURFACE_DISPLAY = 3;
      const displayEntries = surfaceEntries.slice(0, MAX_SURFACE_DISPLAY);
      for (const [name, surface] of displayEntries) {
        // ...render each
      }
      if (surfaceEntries.length > MAX_SURFACE_DISPLAY) {
        const remaining = surfaceEntries.length - MAX_SURFACE_DISPLAY;
        console.log(chalk.gray(`    +${remaining} more. Run \`ana config show\` for all.`));
      }
```

**Test pattern (scanProject.test.ts:19-25):**
```typescript
  async function createFiles(files: Record<string, string>): Promise<void> {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(tempDir, filePath);
      await mkdir(join(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, content);
    }
  }
```

### Proof Context

**scan-engine.ts** — 5 prior findings, none directly overlap with this scope's assertions. Key awareness:
- `detectSchemas` already gained a 4th census parameter in a prior cycle — the function signature is `(allDeps, rootPath, configSchemas, census)`.
- No prior findings about barrel file handling or env enrichment.

**assets.ts** — No active proof findings.

### Checkpoint Commands
- After scan-engine.ts changes: `(cd 'packages/cli' && pnpm vitest run tests/engine/scanProject.test.ts)` — Expected: existing Drizzle tests pass + new barrel test passes
- After assets.ts changes: `(cd 'packages/cli' && pnpm vitest run tests/commands/)` — Expected: new AGENTS.md tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2971+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2971 passed, 2 skipped (126 test files)
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected ~2980+ tests (adding ~6-8 new test cases)
- Regression focus: `tests/engine/scanProject.test.ts` (Drizzle detection), any init-related tests
