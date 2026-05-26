# Scope: Monorepo Dependency Resolution — Three-Tier Detection

**Created by:** Ana
**Date:** 2026-05-26

## Intent

Identity field detection (database, auth, payments, aiSdk) uses `allDeps` — a flat merge of all workspace package dependencies. This creates two opposite problems from one design decision:

1. **Hoisted deps invisible (postiz-app).** All 213 dependencies live in root package.json, workspace packages have zero deps. Census never reads root production deps, so `allDeps = {}`. Every identity field returns null despite the project having Prisma, Stripe, JWT, and more.

2. **Integration package contamination (n8n).** `packages/@n8n/nodes-langchain` has `@supabase/supabase-js` for a LangChain vector store integration. Census merges this into allDeps. Detection returns `database=Supabase` when n8n's actual database is PostgreSQL (pg in `packages/cli`, the primary package).

The fix: three-tier dependency resolution for identity fields (primary → all → root) with an ORM-beats-driver merge rule for database detection.

## Complexity Assessment

- **Kind:** feature
- **Size:** medium — touches 4 source files + types, but the change is concentrated in scan-engine.ts with a mechanical census addition
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/census.ts` — add `rootDeps`
  - `packages/cli/src/engine/types/census.ts` — add `rootDeps` to `ProjectCensus`
  - `packages/cli/src/engine/scan-engine.ts` — three-tier identity detection, `hasDep` helper, schema trigger updates, uiSystem fallback
  - `packages/cli/src/engine/detectors/dependencies.ts` — export `ORM_PACKAGES` constant
  - Tests — new test cases for all three tiers + ORM rule + regression checks
- **Blast radius:** Every monorepo customer's scan results feed downstream into context generation (scaffold-generators.ts), skill injection (skills.ts), gotcha matching, and CLAUDE.md. Incorrect detection cascades through everything. Single-repo projects are unaffected (primaryDeps === allDeps, rootDeps empty or identical).
- **Estimated effort:** 4-6 hours implementation + verification
- **Multi-phase:** no

## Approach

Generalize the existing `primaryDeps` pattern (already used by framework detection) to all identity fields, adding root production deps as a third fallback tier for hoisted-dep monorepos.

For database detection, enforce the existing DATABASE_PACKAGES ordering principle ("ORMs first — they represent what the code queries through") across tiers via an ORM-beats-driver merge rule. This prevents a raw driver or BaaS adapter in the primary package from shadowing the ORM that lives in a shared database package — the standard monorepo pattern.

Auth, payments, and aiSdk use simple tier fallback (`??` chain) without a merge rule. These detection maps don't have the ORM/driver hierarchy that makes cross-tier shadowing a practical risk for databases.

Schema detection triggers (`hasPrisma`, `hasDrizzle`, `hasSupabase`) switch from direct `allDeps[x]` checks to a `hasDep` helper that checks all three tiers, preventing schema detection from missing hoisted deps.

## Acceptance Criteria

- AC1: n8n scan returns `database=PostgreSQL` (from `pg` in packages/cli, the primary package), not `database=Supabase`
- AC2: postiz-app scan returns `database=Prisma`, `auth=JWT`, `payments=Stripe` (from root package.json production deps), not null for any identity field
- AC3: All 6 Group A repos (dub, inbox-zero, formbricks, midday, openpanel, Cap) produce identical scan results for all identity fields — zero regressions
- AC4: dub scan returns `database=Prisma` (ORM from packages/prisma, tier 2) despite `@planetscale/database` in apps/web (tier 1) — the ORM-beats-driver rule is load-bearing here
- AC5: Single-repo projects produce identical results (three-tier degrades to single-tier when primaryDeps === allDeps)
- AC6: postiz-app schema detection finds Prisma schema (via `hasDep` checking rootDeps) — not just the stack field but the schema trigger too
- AC7: `rootDeps` is exposed on `ProjectCensus` type and populated in census builder
- AC8: `ORM_PACKAGES` is exported from `dependencies.ts`

## Edge Cases & Risks

### CRITICAL: Primary has non-ORM database dep (dub — VERIFIED)

dub's apps/web has `@planetscale/database` (a serverless DB adapter used BY Prisma). Without the ORM-beats-driver rule, tier 1 returns PlanetScale and stops — **wrong**. The ORM found in tier 2 (Prisma from packages/prisma) must win. This rule is not optional — removing it regresses dub. inbox-zero also has `pg` + `prisma` in the same primary, but within-tier ordering handles that (Prisma comes first in DATABASE_PACKAGES).

### Primary has conflicting dep (theoretical)

If a primary package has `sqlite3` (for caching) and a shared package has Prisma (the real database), tier 1 picks sqlite3. Not observed in any of 13 verified repos. The shared-database-package pattern is consistent — projects don't put conflicting database deps in the primary app.

### Root deps include toolchain packages

For standard monorepos (dub, inbox-zero, formbricks), root deps are minimal toolchain (turbo, husky, lint-staged). None match identity detection packages. Tier 3 only fires when tiers 1 and 2 both return null — it's a last resort for hoisted-dep monorepos only.

### novu auth changes from Clerk to Passport (KNOWN CHANGE)

novu's primary (apps/api) has `passport` + `jsonwebtoken` + `bcrypt`. The dashboard (apps/dashboard) has `@clerk/clerk-react` + `better-auth`. Current scan returns `auth=Clerk` (from allDeps — `@clerk/clerk-react` appears before `passport` in AUTH_PACKAGES iteration order). Three-tier returns `auth=Passport` (from tier 1, the primary API service). This is an improvement — the API service IS the auth authority, Clerk is a frontend SDK in a non-primary package — but it IS a result change. Documented in the verification plan.

### AUTH hierarchy gap (theoretical, deferred)

AUTH_PACKAGES has high-level frameworks (Clerk, NextAuth, Better Auth) and low-level primitives (jsonwebtoken→JWT, bcrypt→bcrypt). Theoretically, a low-level auth in the primary could shadow a high-level framework in allDeps — the same pattern as the ORM/driver issue for databases. No repo exhibits this pattern in practice because auth frameworks live in the consuming app, not in shared packages (unlike databases where `packages/db` is standard). If this pattern appears in the wild, scope a "framework-beats-primitive" rule for auth. No action now.

### stackProvenance for tier 3 (rootDeps)

When tier 3 wins (postiz-app), `findStackProvenance` searches all source roots for the winning package. Root deps aren't in any source root → empty provenance. Acceptable — "from the root package.json" is implicit. Enhance with a `"<root>"` sentinel later if display consumers need it.

### detectFromDeps called three times

Performance: `detectFromDeps` iterates ~20 entries per lookup table, three calls = ~60 iterations total. Sub-millisecond. Not a concern.

### Schema detection triggers must also update

`detectSchemas` checks `allDeps` directly at lines 288, 374, 492. Without updating these to use the `hasDep` helper, postiz-app's Prisma schema won't be detected even after the stack field is fixed. This is the most likely place to miss something during implementation.

## Rejected Approaches

### Switch identity detection to primaryDeps only

The pre-requirements summary's original proposal. Would regress 4 of 6 Group A repos for database detection because the standard monorepo pattern puts database deps in shared packages (`packages/db`, `packages/prisma`, `packages/database`), not in the primary app. dub, midday, and openpanel would lose database detection entirely.

### Naive three-tier without ORM-beats-driver

Returns PlanetScale for dub (tier 1 finds `@planetscale/database` in apps/web before tier 2 finds Prisma in packages/prisma). Three independent agents identified this regression. The ORM rule extends the existing DATABASE_PACKAGES design intent ("ORMs first") to work across tiers — it's not a new heuristic.

### Two-pass approach (ORM-only first pass, then full detection)

Architecturally cleaner but adds a separate code path. The single-pass approach with post-detection merge achieves the same result with less code.

### Prisma-specific rule

Narrowest fix but couples the rule to one ORM. The generalized ORM_PACKAGES set handles all ORMs uniformly.

## Open Questions

None — all questions from the REQ have been investigated and resolved during scoping.

## Exploration Findings

### Patterns Discovered
- `scan-engine.ts:685-692`: Framework detection already uses `primaryDeps` for monorepos with the comment "A demo site's Next.js shouldn't define the project identity" — this is the exact pattern being generalized
- `dependencies.ts:14-15`: DATABASE_PACKAGES comment "ORMs first — they represent what the code queries through" — this is the design intent the ORM rule enforces across tiers
- `census.ts:590`: `rootDevDeps` already exists as a precedent for reading root package.json deps — `rootDeps` (production) follows the same pattern

### Constraints Discovered
- [TYPE-VERIFIED] ProjectCensus type (census.ts:58-86) — must add `rootDeps` field
- [OBSERVED] `allDeps` at scan-engine.ts:662-663 is the single point where identity detection reads deps — clean replacement target
- [OBSERVED] Schema triggers at lines 288, 374, 492 use `allDeps[x]` directly — must update all three
- [OBSERVED] `aiSdk` detection at line 787 uses `allDeps` separately from the main `detectFromDeps` call — needs its own three-tier chain
- [OBSERVED] `uiSystem` at line 790-792 uses `primaryDeps` with no fallback — needs `rootDeps` fallback for hoisted monorepos
- [OBSERVED] `findStackProvenance` at dependencies.ts:363-416 works correctly with the ORM rule because `depResult` carries the winning package name regardless of which tier it came from

### Test Infrastructure
- Existing tests use `createEmptyEngineResult()` — census type changes require updating this factory
- Scan integration tests in `tests/` directory cover full scan output — regression checks should verify against these

## For AnaPlan

### Structural Analog
`scan-engine.ts:685-692` — framework detection's `primaryDeps` approach for monorepos. The three-tier model generalizes this same pattern to all identity fields.

### Relevant Code Paths
- `packages/cli/src/engine/census.ts:576-591` — where `allDeps`, `primaryDeps`, `rootDevDeps` are built. Add `rootDeps` after line 590.
- `packages/cli/src/engine/types/census.ts:58-86` — `ProjectCensus` type. Add `rootDeps: Record<string, string>`.
- `packages/cli/src/engine/scan-engine.ts:662-663` — where `detectFromDeps(allDeps)` is called. Replace with three-tier detection + ORM merge.
- `packages/cli/src/engine/scan-engine.ts:288,374,492` — schema detection triggers using `allDeps[x]`. Replace with `hasDep(x, census)`.
- `packages/cli/src/engine/scan-engine.ts:787` — `aiSdk` detection. Add three-tier chain.
- `packages/cli/src/engine/scan-engine.ts:790-792` — `uiSystem` detection. Add `rootDeps` fallback.
- `packages/cli/src/engine/detectors/dependencies.ts:14-35` — `DATABASE_PACKAGES` with three sections. Add exported `ORM_PACKAGES` constant referencing the ORM section entries.
- `packages/cli/src/engine/detectors/dependencies.ts:363-416` — `findStackProvenance`. Works correctly with ORM rule, no changes needed.

### Patterns to Follow
- `census.ts:590` for how `rootDevDeps` is constructed — `rootDeps` uses the same pattern with `.dependencies` instead of `.devDependencies`
- `scan-engine.ts:685-692` for how framework detection scopes deps to primary in monorepos
- `dependencies.ts:14-35` for the ORM/BaaS/driver ordering that the ORM rule enforces

### Known Gotchas
- `allDeps` is used in MANY places beyond identity detection — `externalServices` (line 915), `detectServiceDeps` (line 917), `detectSchemas` (line 922), `documentation` (line 909). Only identity fields and schema triggers should use three-tier. Services and schemas (beyond the trigger checks) stay on `allDeps` — breadth is correct there.
- The `hasDep` helper is for schema triggers (boolean presence) only. Do NOT use it for identity detection — identity needs the full `DependencyDetectionResult` from each tier for the merge rule.
- `n8n` uses `@n8n/typeorm` (a fork), NOT `typeorm`. `@n8n/typeorm` is not in DATABASE_PACKAGES, so n8n has no ORM in any tier. The ORM rule correctly does NOT fire for n8n — tier 1's `pg` wins as the highest-tier non-ORM match.
- `createEmptyEngineResult()` in `engineResult.ts` must be updated if it includes census-dependent fields.

### Things to Investigate
- Whether the `hasDep` helper should accept the census object or destructured dep maps — design judgment on API ergonomics
- Whether ORM_PACKAGES should be defined in `dependencies.ts` alongside DATABASE_PACKAGES (close to the ordering intent it enforces) or in `scan-engine.ts` (close to the merge logic that uses it) — the scope recommends `dependencies.ts` but Plan should confirm
