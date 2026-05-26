# Spec: Monorepo Three-Tier Dependency Resolution

**Created by:** AnaPlan
**Date:** 2026-05-26
**Scope:** .ana/plans/active/monorepo-dep-resolution/scope.md

## Approach

Identity field detection (database, auth, payments, aiSdk) currently runs against `allDeps` — a flat merge of every workspace package's dependencies. This causes two opposite bugs: hoisted deps invisible (postiz-app: all deps in root package.json, `allDeps = {}`, everything returns null) and integration package contamination (n8n: `@supabase/supabase-js` from a LangChain vector store package wins over `pg` from the primary CLI).

The fix generalizes the pattern already used by framework detection (scan-engine.ts lines 685-692) to all identity fields: `primaryDeps → allDeps → rootDeps` with an ORM-beats-driver merge rule for database detection only.

**Three-tier strategy:** Call `detectFromDeps` three times — once per tier. Chain results with `??` for auth, payments. For database, apply an ORM merge: if any tier found an ORM (checked against `ORM_PACKAGES`), that tier's database result wins regardless of tier priority. This handles dub where tier 1 finds `@planetscale/database` (a serverless adapter used BY Prisma) but tier 2 finds `prisma` (the actual ORM).

**aiSdk** uses the same three-tier `??` chain but calls `detectAiSdk` (a separate function) instead of pulling from the `DependencyDetectionResult`. The existing duplicate call to `detectAiSdk` at line 798 (for provenance) is eliminated — the winning tier's aiSdk value feeds both `stack.aiSdk` and `findStackProvenance`.

**Schema triggers** (`hasPrisma`, `hasDrizzle`, `hasSupabase`) switch from `allDeps[x]` to a `hasDep(pkg, census)` helper that checks all three tiers. Without this, postiz-app's Prisma schema detection fails even after the stack field is fixed.

**uiSystem** adds `rootDeps` as a third fallback for hoisted monorepos (postiz-app has tailwindcss in root).

**Testing** adds no testing tier change. `testing` is an array (collects all matches), and the merge semantics are different — breadth is correct for testing frameworks. Leave it on `allDeps`.

## Output Mockups

No user-visible output changes. The scan produces `scan.json` and terminal display. What changes is the VALUES in identity fields for monorepo projects:

**n8n (contamination fix):**
```
database: PostgreSQL    (was: Supabase)
```

**postiz-app (hoisted fix):**
```
database: Prisma        (was: null)
auth:     JWT           (was: null)
payments: Stripe        (was: null)
```

**dub (ORM-beats-driver):**
```
database: Prisma        (was: Prisma — unchanged, but now via ORM merge rule not tier ordering luck)
```

**novu (known change):**
```
auth: Passport          (was: Clerk — tier 1 primary API has passport, Clerk is in dashboard)
```

## File Changes

### `packages/cli/src/engine/types/census.ts` (modify)
**What changes:** Add `rootDeps: Record<string, string>` field to `ProjectCensus` interface.
**Pattern to follow:** The existing `rootDevDeps` field at line 73.
**Why:** Three-tier detection needs root production deps as the third fallback tier. Without this type field, census can't carry root deps to the scan engine.

### `packages/cli/src/engine/census.ts` (modify)
**What changes:** Build `rootDeps` from root package.json production dependencies, same as `rootDevDeps` uses devDependencies.
**Pattern to follow:** Line 590 — `rootDevDeps` construction: `(result?.rootPackage?.packageJson?.devDependencies ?? {})`. Use `.dependencies` instead.
**Why:** Provides the data for tier 3 detection. Without it, postiz-app (all deps hoisted to root) stays invisible.

### `packages/cli/src/engine/detectors/dependencies.ts` (modify)
**What changes:** Export an `ORM_PACKAGES` constant — a `Set<string>` of the ORM package names from the first section of `DATABASE_PACKAGES` (prisma, @prisma/client, drizzle-orm, typeorm, sequelize, mongoose, knex, kysely, @mikro-orm/core).
**Pattern to follow:** The existing `DATABASE_PACKAGES` map at lines 14-35. The ORM section ends at the "BaaS / serverless databases" comment on line 21.
**Why:** The ORM-beats-driver merge rule needs to check whether a tier's winning database package is an ORM. Defining `ORM_PACKAGES` next to `DATABASE_PACKAGES` keeps the ordering intent ("ORMs first") and the ORM membership list in one place.

### `packages/cli/src/engine/scan-engine.ts` (modify)
**What changes:** Four changes in the stack-building section (lines 660-800):

1. **Three-tier identity detection.** Replace the single `detectFromDeps(allDeps)` at line 663 with three calls: `detectFromDeps(census.primaryDeps)`, `detectFromDeps(census.allDeps)`, `detectFromDeps(census.rootDeps)`. For monorepos only — single-repo projects skip tiering (primaryDeps === allDeps, rootDeps is empty or identical).

2. **ORM-beats-driver merge for database.** After the three calls, resolve `database` with a merge rule: iterate tiers in order; if any tier's `databasePkg` is in `ORM_PACKAGES`, that tier wins for database. If no tier found an ORM, tier 1 wins (standard `??` chain). Store the winning `depResult` (the full `DependencyDetectionResult` from the winning tier) for provenance.

3. **aiSdk three-tier.** Replace the inline `detectAiSdk(allDeps)` at line 787 with: `detectAiSdk(census.primaryDeps) ?? detectAiSdk(census.allDeps) ?? detectAiSdk(census.rootDeps)`. Eliminate the separate `detectAiSdk(allDeps)` call at line 798 — feed the winning aiSdk value to both `stack.aiSdk` and `findStackProvenance`.

4. **uiSystem rootDeps fallback.** In the monorepo branch of `uiSystem` (line 790-792), add `?? detectUiSystem(census.rootDeps)` after the existing `detectUiSystem(census.primaryDeps)`.

5. **Schema trigger `hasDep` helper.** Add a module-level helper: `function hasDep(pkg: string, census: ProjectCensus): boolean` that returns `!!(census.primaryDeps[pkg] || census.allDeps[pkg] || census.rootDeps[pkg])`. Replace the three `allDeps[x]` checks in `detectSchemas` calls — line 288 (`allDeps['prisma'] || allDeps['@prisma/client']`), line 374 (`allDeps['drizzle-orm']`), line 492 (`allDeps['@supabase/supabase-js']`) — with `hasDep('prisma', census) || hasDep('@prisma/client', census)`, `hasDep('drizzle-orm', census)`, `hasDep('@supabase/supabase-js', census)` respectively.

**Pattern to follow:** Framework detection at lines 685-692 — the existing monorepo-scoped detection pattern.
**Why:** This is the core change. Without it, monorepo identity detection is wrong for both hoisted and contaminated layouts.

### `packages/cli/tests/engine/detectors/dependencies.test.ts` (modify)
**What changes:** Add `rootDeps: {}` to the `makeCensus` helper (line 188). Add new test blocks for ORM_PACKAGES export and three-tier detection scenarios.
**Pattern to follow:** The existing `findStackProvenance` tests and `makeCensus` helper structure.
**Why:** Exercises the new ORM_PACKAGES constant and the three-tier + ORM merge behavior through unit tests.

### `packages/cli/tests/engine/types/census.test.ts` (modify)
**What changes:** Add `rootDeps: {}` (or appropriate values) to the `makeMonorepoCensus()` helper at line 41 and the inline `ProjectCensus` object at line 107. TypeScript will flag these at compile time.
**Pattern to follow:** Existing `rootDevDeps` placement in both objects.
**Why:** Type compliance. New required field on `ProjectCensus`.

### `packages/cli/tests/engine/sampling/proportional-sampler.test.ts` (modify)
**What changes:** Add `rootDeps: {}` to the `makeCensus` helper at line 33.
**Pattern to follow:** Existing `rootDevDeps: {}` on the line above.
**Why:** Type compliance.

### `packages/cli/tests/engine/detectors/surfaces.test.ts` (modify)
**What changes:** Add `rootDeps: {}` to the `makeCensus` helper at line 54.
**Pattern to follow:** Existing `rootDevDeps: {}` on the line above.
**Why:** Type compliance.

### New test file: `packages/cli/tests/engine/three-tier-detection.test.ts` (create)
**What changes:** Integration-style tests that exercise three-tier detection through mock census objects with realistic dep distributions. Covers: n8n-shaped contamination, postiz-shaped hoisting, dub-shaped ORM-beats-driver, single-repo passthrough, and the novu auth change.
**Pattern to follow:** The `makeCensus`/`makeRoot` pattern from `dependencies.test.ts`. Tests should construct census objects with specific dep layouts and call `detectFromDeps` per-tier + the merge logic to verify outcomes.
**Why:** Acceptance criteria require verifying specific repo scenarios. These tests encode those scenarios as fixtures rather than requiring live repo access.

## Acceptance Criteria

- [x] AC1: n8n-shaped deps return `database=PostgreSQL` (from `pg` in primary), not `database=Supabase`
- [x] AC2: postiz-shaped deps return `database=Prisma`, `auth=JWT`, `payments=Stripe` (from root deps), not null
- [x] AC3: All 6 Group A repo shapes produce correct identity fields — zero regressions
- [x] AC4: dub-shaped deps return `database=Prisma` (ORM from tier 2) despite `@planetscale/database` in tier 1
- [x] AC5: Single-repo projects produce identical results (three-tier degrades gracefully)
- [x] AC6: postiz-shaped schema detection finds Prisma (via `hasDep` checking rootDeps)
- [x] AC7: `rootDeps` exposed on `ProjectCensus` type and populated in census builder
- [x] AC8: `ORM_PACKAGES` exported from `dependencies.ts`
- [ ] Tests pass: `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors: `pnpm run build`
- [ ] Lint passes: `pnpm run lint`
- [ ] The `nodeAiSdk` variable at line 798 is eliminated — winning aiSdk feeds both `stack.aiSdk` and `findStackProvenance`

## Testing Strategy

- **Unit tests (dependencies.test.ts):** ORM_PACKAGES membership (all 9 ORM entries present, no non-ORM entries), export availability.
- **Unit tests (three-tier-detection.test.ts):** Five scenario fixtures encoding the acceptance criteria as census objects:
  - n8n-shaped: primary has `pg`, non-primary has `@supabase/supabase-js` → database=PostgreSQL
  - postiz-shaped: all tiers empty except rootDeps has prisma, jsonwebtoken, stripe → all three detected
  - dub-shaped: primary has `@planetscale/database`, tier 2 has `prisma` → ORM wins → database=Prisma
  - single-repo: primaryDeps === allDeps, rootDeps empty → same result as current behavior
  - novu-shaped: primary has `passport`, non-primary has `@clerk/clerk-react` → auth=Passport
- **Schema trigger tests:** postiz-shaped census where prisma is only in rootDeps → `hasDep('prisma', census)` returns true
- **Edge cases:**
  - All three tiers return null for a field → result is null (no crash)
  - ORM in tier 3 (rootDeps) beats driver in tier 1 (primaryDeps) → ORM wins
  - `detectAiSdk` three-tier chain with aiSdk only in rootDeps → detected correctly
  - uiSystem with tailwindcss only in rootDeps → detected correctly

## Dependencies

None. All changes are to existing engine code with no new external dependencies.

## Constraints

- `allDeps` is used in many places beyond identity detection (externalServices, detectServiceDeps, detectSchemas body, documentation). Only identity fields and schema TRIGGERS should use three-tier. The `allDeps` variable must remain available and unchanged for all other consumers.
- Engine files have zero CLI dependencies — no chalk, ora, or commander in scan-engine.ts.
- `testing` field stays on `allDeps` — it's an array that collects all matches, and breadth is correct. No three-tier needed.
- `findStackProvenance` receives the winning tier's `depResult` — no structural change to the function itself. The `databasePkg` on the winning result carries the correct package name regardless of which tier won.

## Gotchas

- **`allDeps` must survive.** It's tempting to replace all `allDeps` usage with three-tier. Don't. `externalServices` (line 915), `detectServiceDeps` (line 917), `detectSchemas` body (line 922), `documentation` (line 909) all correctly use `allDeps` for breadth. Only identity fields and schema triggers change.
- **`hasDep` is for boolean presence only.** Schema triggers ask "does this dep exist anywhere?" — that's `hasDep`. Identity detection asks "which display name wins?" — that's `detectFromDeps` per tier with a merge rule. Don't use `hasDep` for identity detection.
- **`@n8n/typeorm` is NOT in DATABASE_PACKAGES.** n8n uses a fork. The ORM rule correctly does NOT fire for n8n — tier 1's `pg` wins as the highest-tier non-ORM match. Don't add `@n8n/typeorm` to ORM_PACKAGES.
- **`as ProjectCensus` casts in findings tests.** Four test files (`validation.test.ts`, `errorBoundaries.test.ts`, `env.test.ts`, `secrets.test.ts`) use partial objects with `as ProjectCensus` casts. These won't fail at compile time because `as` bypasses structural checking. No changes needed there — only full object literals fail.
- **Single-repo optimization.** When `census.layout === 'single-repo'`, `primaryDeps` already equals the merged deps and `rootDeps` will be empty or identical. The three-tier chain still works correctly (tier 1 finds everything, tiers 2-3 are redundant), but consider guarding with `if (census.layout === 'monorepo')` to make the intent explicit and avoid three redundant `detectFromDeps` calls for single-repo projects. The scope's comment at line 688-689 uses this guard for framework detection.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { ORM_PACKAGES } from './detectors/dependencies.js'`
- Use `import type` for type-only imports, separate from value imports
- Engine files have zero CLI dependencies — no chalk, ora, commander
- Prefer early returns over nested conditionals
- Explicit return types on all exported functions
- Exported functions require `@param` and `@returns` JSDoc tags
- Constants use SCREAMING_SNAKE_CASE: `ORM_PACKAGES`
- Use `| null` for fields checked and found empty, `?:` for unchecked optional fields

### Pattern Extracts

**Framework detection monorepo guard (scan-engine.ts:685-692) — the structural analog:**
```typescript
  // In monorepos, framework detection uses primary root deps
  // only. A demo site's Next.js shouldn't define the project identity when
  // the primary product is a CLI. Detection fields (database, auth, testing,
  // payments, aiSdk, services) stay on allDeps — they're project-wide facts.
  const frameworkDeps = census.layout === 'monorepo' && projectTypeResult.type === 'node'
    ? Object.keys(census.primaryDeps)
    : deps;
  const frameworkResult = detectFramework(frameworkDeps, projectTypeResult.type, census.configs.frameworkHints);
```

**rootDevDeps construction (census.ts:586-590) — the pattern for rootDeps:**
```typescript
  // Root devDeps — toolchain deps (testing, linting) that live in the root
  // package.json but not in any workspace package. Separated from allDeps
  // because root deps are toolchain, not stack — but testing frameworks
  // in root devDeps (like @playwright/test) should still be detected.
  const rootDevDeps = (result?.rootPackage?.packageJson?.devDependencies ?? {}) as Record<string, string>;
```

**DATABASE_PACKAGES ORM section (dependencies.ts:14-20) — entries for ORM_PACKAGES:**
```typescript
export const DATABASE_PACKAGES: Record<string, string> = {
  // ORMs first — they represent what the code queries through
  'prisma': 'Prisma', '@prisma/client': 'Prisma',
  'drizzle-orm': 'Drizzle',
  'typeorm': 'TypeORM', 'sequelize': 'Sequelize',
  'mongoose': 'Mongoose', 'knex': 'Knex',
  'kysely': 'Kysely', '@mikro-orm/core': 'MikroORM',
  // BaaS / serverless databases
```

**makeCensus helper (dependencies.test.ts:177-199) — test fixture pattern:**
```typescript
function makeCensus(roots: SourceRoot[]): ProjectCensus {
  return {
    rootPath: '/tmp/project',
    projectName: 'test-project',
    layout: roots.length > 1 ? 'monorepo' : 'single-repo',
    monorepoTool: roots.length > 1 ? 'pnpm' : null,
    sourceRoots: roots,
    primarySourceRoot: roots.find(r => r.isPrimary)?.relativePath ?? '.',
    allDeps: {},
    deps: {},
    devDeps: {},
    rootDevDeps: {},
    primaryDeps: {},
    configs: {
      frameworkHints: [],
      tsconfigs: [],
      schemas: [],
      deployments: [],
      ciWorkflows: [],
    },
    builtAt: '2026-05-22T00:00:00.000Z',
    buildDurationMs: 1,
  };
}
```

### Proof Context

**scan-engine.ts:**
- `detectAiSdk` called twice — once inline in stack literal (line 787), once for provenance (line 798). Three-tier eliminates the duplication: winning aiSdk feeds both uses.
- Hardcoded subdirectory list inline in 900+ line function (known tech debt, not related to this change).

**dependencies.ts:**
- No-primary-root edge case in `findStackProvenance` — silently treats all roots as non-primary when no `root.isPrimary` is true. Not affected by this change (the `depResult` passed in still has the correct package names).

**census.ts:**
- `rootDevDeps` is empty in Fix B path (known issue). `rootDeps` follows the same construction, so same behavior — acceptable.

### Checkpoint Commands

- After `census.ts` + `types/census.ts` changes: `(cd packages/cli && pnpm vitest run tests/engine/types/census.test.ts)` — Expected: existing census tests pass with `rootDeps` added
- After `dependencies.ts` changes: `(cd packages/cli && pnpm vitest run tests/engine/detectors/dependencies.test.ts)` — Expected: existing dep tests pass, new ORM_PACKAGES tests pass
- After `scan-engine.ts` changes + new test file: `(cd packages/cli && pnpm vitest run tests/engine/three-tier-detection.test.ts)` — Expected: all scenario tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2924+ tests pass (2924 current + new three-tier tests)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2924 passed, 2 skipped (2926 total)
- Current test files: 124
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2924 + ~20 new tests in 125 test files (1 new file + 4 modified)
- Regression focus: `scanProject.test.ts` (integration test that detects stack from deps), `dependencies.test.ts` (detectFromDeps ordering), `census.test.ts` (type shape)
