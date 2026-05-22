# Scope: Fill Scan Detection Gaps

**Created by:** Ana
**Date:** 2026-05-22

## Intent

The database dependency map, framework hint patterns, and payment package table are incomplete. Missing entries cause false negatives — real stack components go undetected. The user wants to fill every known gap from a 70-repo validation and independent agent review, bringing the lookup tables to vocabulary completeness for the modern TS startup customer.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — lookup-table additions, one array reorder, no logic changes
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/detectors/dependencies.ts` (DATABASE_PACKAGES, PAYMENT_PACKAGES)
  - `packages/cli/src/engine/census.ts` (FRAMEWORK_HINTS)
  - `packages/cli/src/engine/detectors/surfaces.ts` (STRONG_FRAMEWORK_CONFIGS)
  - Test files for the above
- **Blast radius:** Scan output only. No downstream consumers change behavior — surfaces, skills, gotchas all read the same `stack.*` fields. Repos that previously showed `null` for database/payments will now show a value. No existing detection changes.
- **Estimated effort:** ~1 hour
- **Multi-phase:** no

## Approach

Fill vocabulary gaps in three lookup tables and fix one array ordering issue. All changes are additive entries — no detection logic changes.

**Part A — Database drivers (10 entries):** Add Kysely, MikroORM, slonik, @silverhand/slonik, @vercel/postgres, mongodb, postgres (postgres.js), sqlite3, and mssql to DATABASE_PACKAGES. Place ORMs (Kysely, MikroORM) after existing ORMs so they lose to Prisma/Drizzle/TypeORM when both are present. Place raw drivers (postgres, slonik, @silverhand/slonik, mongodb, sqlite3, mssql) after existing raw drivers. Ordering preserves the "ORM wins over driver" invariant.

**Part B — Framework config variants (5 .mjs entries):** Add svelte.config.mjs, nuxt.config.mjs, remix.config.mjs, react-router.config.mjs, vue.config.mjs to both FRAMEWORK_HINTS and STRONG_FRAMEWORK_CONFIGS. Achieves parity with existing .ts/.js variants. Defensive — only svelte.config.mjs has evidence today (budibase), but all frameworks support .mjs configs.

**Part C — Framework ordering fix (array reorder):** Move Svelte entries above Nuxt entries in FRAMEWORK_HINTS. This fixes the budibase misidentification where builder has both svelte.config.mjs (real, with svelte in deps) and nuxt.config.js (legacy, no nuxt in deps). detectFramework returns the first strong-config match, so array order is the tiebreaker.

**Part D — Payment package (1 entry):** Add @stripe/react-stripe-js to PAYMENT_PACKAGES. Defensive addition — all 8 repos with this package are already detected via server-side stripe, but this catches the theoretical frontend-only-Stripe-in-monorepo case.

## Acceptance Criteria
- AC1: DATABASE_PACKAGES contains all 10 new entries (kysely, @mikro-orm/core, slonik, @silverhand/slonik, @vercel/postgres, mongodb, postgres, sqlite3, mssql) with correct display names
- AC2: ORMs (Kysely, MikroORM) appear before raw drivers in DATABASE_PACKAGES iteration order
- AC3: FRAMEWORK_HINTS contains .mjs variants for svelte, nuxt, remix, react-router, vue
- AC4: STRONG_FRAMEWORK_CONFIGS contains the same 5 .mjs variants
- AC5: Svelte entries appear before Nuxt entries in FRAMEWORK_HINTS array
- AC6: PAYMENT_PACKAGES contains @stripe/react-stripe-js mapping to 'Stripe'
- AC7: A project with only `postgres` (not `pg`) in deps detects as database: 'PostgreSQL'
- AC8: A project with only `sqlite3` (not `better-sqlite3`) detects as database: 'SQLite'
- AC9: A project with `svelte.config.mjs` and `nuxt.config.js` in the same surface detects framework as Svelte, not Nuxt
- AC10: No existing detection results change for projects that were already correctly detected
- AC11: Unit tests cover each new entry and the ordering fix

## Edge Cases & Risks
- **postgres vs pg naming:** `postgres` is the npm package name for postgres.js (Porsager). Completely different package from `pg`. Both map to display name 'PostgreSQL'. If both present, `pg` wins (appears first). No collision.
- **sqlite3 vs better-sqlite3:** Different packages (async vs sync). Both map to 'SQLite'. No repo in test set has both. If both appeared, same display name — no conflict.
- **mongodb vs mongoose:** mongoose appears before mongodb in iteration order. If both present, mongoose wins ('Mongoose'). If only native mongodb driver, now correctly detected as 'MongoDB'.
- **mssql vs tedious:** mssql wraps tedious. We add mssql (the wrapper users install), not tedious (the underlying driver). Correct — users depend on mssql.
- **@silverhand/slonik:** Fork used by logto. Maps to 'PostgreSQL' same as slonik. Niche but costs nothing.
- **Svelte/Nuxt reorder:** Verified no repo has both real Svelte and real Nuxt configs in the same non-excluded surface. Three repos (scalar, supabase, vercel-ai) have both deps, but configs are under examples/ (filtered by EXCLUDED_SEGMENTS).
- **@stripe/react-stripe-js:** All 8 repos with this package already detected via stripe or @stripe/stripe-js. Impact is defensive, not corrective.

## Rejected Approaches
- **Dep-aware framework tiebreaker:** When multiple framework configs exist in one surface, check which framework is in the package's actual deps. This is the correct general solution but over-scoped for the single known case (budibase). The array reorder fixes it. Scope the tiebreaker separately if more cases emerge.
- **Adding tedious, oracledb, @electric-sql/pglite, @tidbcloud/serverless:** Enterprise or niche. Not in target customer profile, zero or near-zero evidence in test set.
- **Adding objection.js:** Knex-based ORM. If present, Knex is usually also present and already detected. Adding objection would change display from 'Knex' to 'Objection.js' — debatable improvement, not worth the complexity of deciding.
- **Redis/cache recategorization:** Redis is correctly categorized as cache/service, not database. Our target customer uses Redis for caching/queues, not as primary data store.
- **Adding .cjs variants:** No evidence in 70-repo set. Frameworks generally don't document .cjs config support. Skip.

## Open Questions
None. All questions from the requirements file were resolved during analysis.

## Exploration Findings

### Patterns Discovered
- `dependencies.ts`: DATABASE_PACKAGES is a Record<string, string> iterated with Object.entries(). First match wins via `break` (line 302). Insertion order = priority order.
- `census.ts`: FRAMEWORK_HINTS is an array iterated in order. discoverFrameworkHints (line 156) preserves this order per source root.
- `surfaces.ts`: detectFramework (line 182) filters hints by source root, then returns the first one whose basename is in STRONG_FRAMEWORK_CONFIGS. Array order of FRAMEWORK_HINTS determines winner.
- `surfaces.ts`: STRONG_FRAMEWORK_CONFIGS is a Set — used only for membership check, not ordering. Order doesn't matter for additions here.

### Constraints Discovered
- [TYPE-VERIFIED] DATABASE_PACKAGES iteration order (dependencies.ts:301-302) — first match wins via `break`, ORMs must precede drivers
- [TYPE-VERIFIED] FRAMEWORK_HINTS array order (census.ts:30-72) — determines framework detection priority when multiple configs exist in one surface
- [OBSERVED] STRONG_FRAMEWORK_CONFIGS (surfaces.ts:29-39) — membership set, no ordering constraint, but must stay in sync with FRAMEWORK_HINTS file patterns
- [OBSERVED] EXCLUDED_SEGMENTS (surfaces.ts:60-74) — filters examples/, templates/, etc. Prevents dual-framework repos from causing false conflicts

### Test Infrastructure
- `tests/engine/detectors/surfaces.test.ts` — synthetic census objects, tests for detectSurfaces, enrichPackages, isNonProductPath, STRONG_FRAMEWORK_CONFIGS membership
- No existing unit tests for DATABASE_PACKAGES or PAYMENT_PACKAGES directly — detectFromDeps is tested indirectly through integration tests

## For AnaPlan

### Structural Analog
The existing entries in each lookup table. Every addition follows the exact same pattern: `'package-name': 'Display Name'` in a Record, or `{ pattern: 'file.ext', framework: 'name', check: 'file' }` in an array, or `'file.ext'` in a Set. No new patterns needed.

### Relevant Code Paths
- `packages/cli/src/engine/detectors/dependencies.ts` — DATABASE_PACKAGES (line 14), PAYMENT_PACKAGES (line 82), detectFromDeps (line 291)
- `packages/cli/src/engine/census.ts` — FRAMEWORK_HINTS (line 30), discoverFrameworkHints (line 156)
- `packages/cli/src/engine/detectors/surfaces.ts` — STRONG_FRAMEWORK_CONFIGS (line 29), detectFramework (line 182)

### Patterns to Follow
- Existing entries in each table — follow exact formatting, comment style, and grouping
- DATABASE_PACKAGES comment structure: `// ORMs first`, `// BaaS / serverless databases`, `// Raw drivers last`
- FRAMEWORK_HINTS grouping: entries grouped by framework with `//` comment headers

### Known Gotchas
- FRAMEWORK_HINTS and STRONG_FRAMEWORK_CONFIGS must stay in sync — every file pattern in FRAMEWORK_HINTS that represents a strong config must also be in STRONG_FRAMEWORK_CONFIGS
- The Svelte/Nuxt reorder changes line numbers. Plan should specify the reorder as "move Svelte block above Nuxt block" not by line number.
- `detectFromDeps` uses `break` on first match for database/auth/payments but collects ALL matches for testing. New DB entries must respect the break-on-first-match behavior — ordering is the only priority mechanism.

### Things to Investigate
- Whether the surfaces.test.ts file needs new test cases for STRONG_FRAMEWORK_CONFIGS .mjs membership, or if existing pattern-based tests cover it implicitly
