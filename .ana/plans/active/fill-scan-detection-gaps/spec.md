# Spec: Fill Scan Detection Gaps

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/fill-scan-detection-gaps/scope.md

## Approach

Fill vocabulary gaps in three lookup tables and fix one array ordering issue. All changes are additive — no detection logic changes, no new functions, no new modules.

Four parts:

**Part A — Database drivers (9 entries):** Add to `DATABASE_PACKAGES` in `dependencies.ts`. Insert ORMs (Kysely, MikroORM) at the end of the ORM section (after `knex`). Insert raw drivers (slonik, @silverhand/slonik, @vercel/postgres, mongodb, postgres, sqlite3, mssql) at the end of the raw drivers section (after `@libsql/client`). The ORM-before-driver ordering is critical — `detectFromDeps` uses `break` on first match, so insertion order = priority.

**Part B — Framework config .mjs variants (5 entries):** Add `svelte.config.mjs`, `nuxt.config.mjs`, `remix.config.mjs`, `react-router.config.mjs`, `vue.config.mjs` to both `FRAMEWORK_HINTS` (census.ts) and `STRONG_FRAMEWORK_CONFIGS` (surfaces.ts). Place each `.mjs` variant adjacent to its existing `.ts`/`.js` siblings.

**Part C — Framework ordering fix (array reorder):** In `FRAMEWORK_HINTS` (census.ts), move the entire Svelte block above the Nuxt block. `detectFramework` in surfaces.ts returns the first strong-config match per source root, so array order is the tiebreaker. This fixes budibase misidentification (has both `svelte.config.mjs` and `nuxt.config.js`, only Svelte is real).

**Part D — Payment package (1 entry):** Add `'@stripe/react-stripe-js': 'Stripe'` to `PAYMENT_PACKAGES` in `dependencies.ts`. Place after existing Stripe entries.

## Output Mockups

Before (project with only `postgres` in deps):
```
database: null
```

After:
```
database: PostgreSQL
```

Before (project with `svelte.config.mjs` and `nuxt.config.js`):
```
framework: Nuxt       ← wrong, Svelte is the real framework
```

After:
```
framework: Svelte     ← correct
```

## File Changes

### packages/cli/src/engine/detectors/dependencies.ts (modify)
**What changes:** Add 9 entries to DATABASE_PACKAGES, 1 entry to PAYMENT_PACKAGES.
**Pattern to follow:** Existing entries in each Record — `'package-name': 'Display Name'` format with comment-group headers.
**Why:** Projects using Kysely, MikroORM, slonik, mongodb, postgres.js, sqlite3, mssql, or @vercel/postgres currently show `database: null`. Projects with only `@stripe/react-stripe-js` (no server-side stripe) would show `payments: null`.

DATABASE_PACKAGES additions — insert after `'knex': 'Knex'` (end of ORM section):
```
'kysely': 'Kysely', '@mikro-orm/core': 'MikroORM',
```

Insert after `'@libsql/client': 'Turso'` (end of raw drivers section):
```
'slonik': 'PostgreSQL', '@silverhand/slonik': 'PostgreSQL',
'@vercel/postgres': 'PostgreSQL',
'mongodb': 'MongoDB',
'postgres': 'PostgreSQL',
'sqlite3': 'SQLite', 'mssql': 'SQL Server',
```

PAYMENT_PACKAGES addition — insert after `'@stripe/stripe-js': 'Stripe'`:
```
'@stripe/react-stripe-js': 'Stripe',
```

### packages/cli/src/engine/census.ts (modify)
**What changes:** Add 5 `.mjs` framework hint entries. Reorder Svelte block above Nuxt block.
**Pattern to follow:** Existing FRAMEWORK_HINTS entries — `{ pattern: 'file.ext', framework: 'name', check: 'file' }` with `//` comment headers per framework group.
**Why:** `.mjs` configs go undetected. Svelte/Nuxt ordering causes misidentification when both configs exist in one surface.

After reorder, the section from Astro through Vue should read: Astro → NestJS → SvelteKit (with .mjs) → Nuxt (with .mjs) → Angular → Vue (with .mjs). Remix and React Router entries already exist earlier in the array — add their `.mjs` variants adjacent to the existing `.ts`/`.js` entries.

### packages/cli/src/engine/detectors/surfaces.ts (modify)
**What changes:** Add 5 `.mjs` entries to STRONG_FRAMEWORK_CONFIGS Set.
**Pattern to follow:** Existing Set entries — `'file.ext'` strings, grouped by framework.
**Why:** Without these, `.mjs` config files won't qualify as strong framework signals for surface detection (Signal 3).

### packages/cli/tests/engine/detectors/dependencies.test.ts (create)
**What changes:** New test file for DATABASE_PACKAGES and PAYMENT_PACKAGES vocabulary coverage plus `detectFromDeps` ordering behavior.
**Pattern to follow:** Test structure in `surfaces.test.ts` — import constants and functions directly, use `describe`/`it`/`expect` from vitest.
**Why:** No direct unit tests exist for these tables. The scope requires tests for each new entry and the ordering invariant.

### packages/cli/tests/engine/detectors/surfaces.test.ts (modify)
**What changes:** Add `.mjs` config entries to the existing STRONG_FRAMEWORK_CONFIGS membership test block (around line 458).
**Pattern to follow:** The existing pattern at lines 458-468 — add `.mjs` variants to the `newConfigs` array.
**Why:** Verifies all 5 `.mjs` entries are present in STRONG_FRAMEWORK_CONFIGS.

## Acceptance Criteria

- [x] AC1: DATABASE_PACKAGES contains all 9 new entries (kysely, @mikro-orm/core, slonik, @silverhand/slonik, @vercel/postgres, mongodb, postgres, sqlite3, mssql) with correct display names
- [x] AC2: ORMs (Kysely, MikroORM) appear before raw drivers in DATABASE_PACKAGES iteration order
- [x] AC3: FRAMEWORK_HINTS contains .mjs variants for svelte, nuxt, remix, react-router, vue
- [x] AC4: STRONG_FRAMEWORK_CONFIGS contains the same 5 .mjs variants
- [x] AC5: Svelte entries appear before Nuxt entries in FRAMEWORK_HINTS array
- [x] AC6: PAYMENT_PACKAGES contains @stripe/react-stripe-js mapping to 'Stripe'
- [x] AC7: A project with only `postgres` (not `pg`) in deps detects as database: 'PostgreSQL'
- [x] AC8: A project with only `sqlite3` (not `better-sqlite3`) in deps detects as database: 'SQLite'
- [x] AC9: A project with `svelte.config.mjs` and `nuxt.config.js` in the same surface detects framework as Svelte, not Nuxt
- [x] AC10: No existing detection results change for projects that were already correctly detected
- [x] AC11: Unit tests cover each new entry and the ordering fix
- [x] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [x] No build errors with `pnpm run build`
- [x] Lint passes with `pnpm run lint`

## Testing Strategy

- **Unit tests (dependencies.test.ts — new file):**
  - Membership tests: each of the 9 new DATABASE_PACKAGES entries exists with the correct display name
  - Membership test: `@stripe/react-stripe-js` maps to `'Stripe'` in PAYMENT_PACKAGES
  - Ordering test: call `detectFromDeps` with only `postgres` in deps → returns `database: 'PostgreSQL'`
  - Ordering test: call `detectFromDeps` with only `sqlite3` in deps → returns `database: 'SQLite'`
  - Ordering test: call `detectFromDeps` with only `mssql` in deps → returns `database: 'SQL Server'`
  - Ordering test: call `detectFromDeps` with only `mongodb` in deps → returns `database: 'MongoDB'`
  - Ordering invariant: call `detectFromDeps` with both `prisma` and `postgres` → returns `'Prisma'` (ORM wins)
  - Ordering invariant: call `detectFromDeps` with both `mongoose` and `mongodb` → returns `'Mongoose'` (ORM wins)
  - Payment test: call `detectFromDeps` with only `@stripe/react-stripe-js` → returns `payments: 'Stripe'`

- **Unit tests (surfaces.test.ts — extend existing):**
  - Add 5 `.mjs` entries to the existing STRONG_FRAMEWORK_CONFIGS membership test

- **AC9 (Svelte/Nuxt ordering):** This requires an integration-level test because `detectFramework` in surfaces.ts reads from FRAMEWORK_HINTS (census.ts) via the census object's `configs.frameworkHints`. Test by constructing a census with both `svelte.config.mjs` and `nuxt.config.js` as framework hints in the same source root, then calling `detectSurfaces` — the result should show Svelte, not Nuxt. Place this test in `surfaces.test.ts`.

## Dependencies

None. All changes are to existing files with no new external dependencies.

## Constraints

- Insertion order in DATABASE_PACKAGES is the priority mechanism — ORMs must come before raw drivers.
- FRAMEWORK_HINTS and STRONG_FRAMEWORK_CONFIGS must stay in sync — every strong config file pattern in FRAMEWORK_HINTS must also be in STRONG_FRAMEWORK_CONFIGS.
- No detection logic changes — only table entries and array ordering.

## Gotchas

- `FRAMEWORK_HINTS` is not exported from `census.ts`. Tests cannot directly verify its contents or ordering. The Svelte/Nuxt ordering must be tested via `detectSurfaces` with a synthetic census that has both hints.
- The Svelte/Nuxt reorder changes line numbers in `census.ts`. Reference by content/comment headers, not line numbers.
- `postgres` (the npm package) is postgres.js by Porsager — completely different from `pg`. Both correctly map to `'PostgreSQL'`. If both are present, `pg` wins because it appears first. No collision.
- `sqlite3` and `better-sqlite3` are different packages (async vs sync). Both map to `'SQLite'`. `better-sqlite3` appears first so it wins if both are present.
- `@silverhand/slonik` is a fork used by logto. Maps to `'PostgreSQL'` same as `slonik`.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { detectFromDeps } from '../../../src/engine/detectors/dependencies.js'`
- Use `import type` for type-only imports, separate from value imports
- Tests use `describe`/`it`/`expect` from vitest — `import { describe, it, expect } from 'vitest'`
- Always use `--run` with pnpm vitest to avoid watch mode hang

### Pattern Extracts

DATABASE_PACKAGES entry format (dependencies.ts lines 14-29):
```typescript
export const DATABASE_PACKAGES: Record<string, string> = {
  // ORMs first — they represent what the code queries through
  'prisma': 'Prisma', '@prisma/client': 'Prisma',
  'drizzle-orm': 'Drizzle',
  'typeorm': 'TypeORM', 'sequelize': 'Sequelize',
  'mongoose': 'Mongoose', 'knex': 'Knex',
  // BaaS / serverless databases
  'convex': 'Convex',
  '@supabase/supabase-js': 'Supabase',
  '@neondatabase/serverless': 'Neon',
  '@planetscale/database': 'PlanetScale',
  'firebase': 'Firebase', 'firebase-admin': 'Firebase',
  // Raw drivers last
  'pg': 'PostgreSQL', 'mysql2': 'MySQL',
  'better-sqlite3': 'SQLite', '@libsql/client': 'Turso',
};
```

FRAMEWORK_HINTS entry format (census.ts lines 31-53):
```typescript
const FRAMEWORK_HINTS: Array<{ pattern: string; framework: string; check: 'file' | 'dir' }> = [
  // Next.js
  { pattern: 'next.config.ts', framework: 'nextjs', check: 'file' },
  { pattern: 'next.config.js', framework: 'nextjs', check: 'file' },
  { pattern: 'next.config.mjs', framework: 'nextjs', check: 'file' },
  ...
  // Nuxt
  { pattern: 'nuxt.config.ts', framework: 'nuxt', check: 'file' },
  { pattern: 'nuxt.config.js', framework: 'nuxt', check: 'file' },
  // SvelteKit
  { pattern: 'svelte.config.js', framework: 'svelte', check: 'file' },
  { pattern: 'svelte.config.ts', framework: 'svelte', check: 'file' },
```

STRONG_FRAMEWORK_CONFIGS entry format (surfaces.ts lines 29-39):
```typescript
export const STRONG_FRAMEWORK_CONFIGS = new Set([
  'next.config.ts', 'next.config.js', 'next.config.mjs',
  'nest-cli.json',
  'nuxt.config.ts', 'nuxt.config.js',
  'svelte.config.js', 'svelte.config.ts',
  ...
]);
```

detectFromDeps break-on-first-match (dependencies.ts lines 301-302):
```typescript
for (const [pkg, name] of Object.entries(DATABASE_PACKAGES)) {
  if (allDeps[pkg]) { result.database = name; break; }
}
```

STRONG_FRAMEWORK_CONFIGS membership test pattern (surfaces.test.ts lines 458-468):
```typescript
const newConfigs = [
  'nest-cli.json',
  'nuxt.config.ts', 'nuxt.config.js',
  'svelte.config.js', 'svelte.config.ts',
  'angular.json',
  'vue.config.js',
  'react-router.config.js',
  'astro.config.js',
];
for (const config of newConfigs) {
  expect(STRONG_FRAMEWORK_CONFIGS.has(config), `Missing: ${config}`).toBe(true);
}
```

### Proof Context
No active proof findings overlap with this scope's affected areas. The existing findings on census.ts and surfaces.ts relate to primary selection and surface detection logic — unrelated to lookup table entries.

### Checkpoint Commands
- After modifying `dependencies.ts`: `(cd packages/cli && pnpm vitest run dependencies)` — Expected: new tests pass, existing tests unaffected
- After modifying `census.ts` and `surfaces.ts`: `(cd packages/cli && pnpm vitest run surfaces)` — Expected: existing + new membership tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2807+ tests pass (baseline 2807)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2807 passed, 2 skipped (2809 total)
- Current test files: 121
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected ~2820+ tests in 122 files (1 new test file)
- Regression focus: `surfaces.test.ts` (modified), existing dependency detection integration tests
