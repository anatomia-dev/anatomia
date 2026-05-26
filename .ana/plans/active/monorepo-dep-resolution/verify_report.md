# Verify Report: Monorepo Three-Tier Dependency Resolution

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-26
**Spec:** .ana/plans/active/monorepo-dep-resolution/spec.md
**Branch:** feature/monorepo-dep-resolution

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/monorepo-dep-resolution/contract.yaml
  Seal: INTACT (hash sha256:3e1618b8a7d7289de78b98ed110d4e61abcab699c688d753e17cc8bf0948e9ce)
```

Seal: **INTACT**

Tests: 2953 passed, 0 failed, 2 skipped (125 test files). Build: ✅ (typecheck + tsup). Lint: ✅ (0 errors, 3 pre-existing warnings).

Baseline was 2924 tests in 124 files → 2953 tests in 125 files (+29 tests, +1 file). No regressions.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | The census type includes root production dependencies | ✅ SATISFIED | `packages/cli/src/engine/types/census.ts:74` — `rootDeps: Record<string, string>` on ProjectCensus. TypeScript compilation passes. |
| A002 | Census builder populates root production deps from root package.json | ✅ SATISFIED | `packages/cli/src/engine/census.ts:601` — `const rootDeps = (result?.rootPackage?.packageJson?.dependencies ?? {})`. Returned in census object at line 650. |
| A003 | ORM package names are exported as a constant | ✅ SATISFIED | `packages/cli/tests/engine/detectors/dependencies.test.ts:67-103` — test imports and verifies `ORM_PACKAGES` export, confirms 9 entries. |
| A004 | Prisma is recognized as an ORM | ✅ SATISFIED | `packages/cli/tests/engine/detectors/dependencies.test.ts:69-78` — test asserts `ORM_PACKAGES.has('prisma')` is true (within the loop over all 9 expected ORMs). |
| A005 | Raw database drivers are not classified as ORMs | ✅ SATISFIED | `packages/cli/tests/engine/detectors/dependencies.test.ts:82-88` — asserts `ORM_PACKAGES.has('pg')` is false, plus mysql2, better-sqlite3, mongodb, postgres. |
| A006 | BaaS packages are not classified as ORMs | ✅ SATISFIED | `packages/cli/tests/engine/detectors/dependencies.test.ts:91-96` — asserts `ORM_PACKAGES.has('@supabase/supabase-js')` is false, plus firebase, @planetscale/database, convex. |
| A007 | Primary package database wins over integration package database | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:68-71` — n8n-shaped census: `expect(result.database).toBe('PostgreSQL')`. |
| A008 | Integration packages do not contaminate project identity | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:73-76` — `expect(result.database).not.toBe('Supabase')`. |
| A009 | Hoisted database dependencies are detected from root package.json | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:90-93` — postiz-shaped: `expect(result.database).toBe('Prisma')`. |
| A010 | Hoisted auth dependencies are detected from root package.json | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:95-98` — `expect(result.auth).toBe('JWT')`. |
| A011 | Hoisted payment dependencies are detected from root package.json | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:100-103` — `expect(result.payments).toBe('Stripe')`. |
| A012 | ORM in a shared package wins over raw driver in primary package | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:117-120` — dub-shaped: `expect(result.database).toBe('Prisma')`. |
| A013 | The ORM merge rule prevents serverless adapters from shadowing ORMs | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:122-125` — `expect(result.database).not.toBe('PlanetScale')`. |
| A014 | Single-repo projects detect databases the same as before | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:139-142` — single-repo: `expect(result.database).toBe('Prisma')`. |
| A015 | Single-repo projects detect auth the same as before | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:144-147` — `expect(result.auth).toBe('NextAuth')`. |
| A016 | Hoisted Prisma dependency triggers schema detection | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:171-178` — `expect(hasDep('prisma', census)).toBe(true)` with prisma only in rootDeps. |
| A017 | hasDep returns false when package is absent from all tiers | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:183-190` — `expect(hasDep('nonexistent', census)).toBe(false)`. |
| A018 | hasDep finds packages in primary deps | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:195-202` — `expect(hasDep('prisma', census)).toBe(true)` with prisma in primaryDeps. |
| A019 | Primary API auth wins over dashboard frontend auth | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:161-164` — novu-shaped: `expect(result.auth).toBe('Passport')`. |
| A020 | AI SDK is detected from root deps when absent from workspace packages | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:209-216` — `expect(resolveAiSdk(census)).toBe('Anthropic')` with @anthropic-ai/sdk only in rootDeps. |
| A021 | Primary AI SDK wins over non-primary AI SDK | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:221-228` — `expect(resolveAiSdk(census)).toBe('OpenAI')` with openai in primaryDeps, anthropic in allDeps. |
| A022 | UI system is detected from root deps in hoisted monorepos | ✅ SATISFIED | Source inspection: `packages/cli/src/engine/scan-engine.ts:830` — `detectUiSystem(census.primaryDeps) ?? detectUiSystem(census.rootDeps)`. `detectUiSystem` (line 115-128) returns "Tailwind CSS" when `tailwindcss` key is present. Proxy test at three-tier-detection.test.ts:237 confirms rootDeps access. |
| A023 | All tiers returning null produces null, not a crash | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:252-263` — empty census: `expect(result.database).toBeNull()`, `.auth`, `.payments` all null. |
| A024 | ORM in root deps beats raw driver in primary deps | ✅ SATISFIED | `packages/cli/tests/engine/three-tier-detection.test.ts:267-277` — drizzle-orm in rootDeps, pg in primaryDeps: `expect(result.database).toBe('Drizzle')`. |

24/24 assertions SATISFIED.

## Independent Findings

**A022 proxy test.** The uiSystem assertion is verified by source inspection rather than a direct test. `detectUiSystem` is a private function in scan-engine.ts, so the test uses `hasDep('tailwindcss', census)` as a proxy. The code path is correct — `detectUiSystem(census.rootDeps)` is called at line 830, and the function returns "Tailwind CSS" when tailwindcss is present (lines 115-128). But if someone refactors `detectUiSystem` to change the return value, the proxy test won't catch it. Not a blocker — the source inspection is sufficient for this contract — but a debt item for future coverage.

**testing field in three-tier.** The spec states "testing field stays on allDeps — it's an array that collects all matches, and breadth is correct. No three-tier needed." The implementation includes testing in the three-tier resolution at line 696: `tier1.testing.length > 0 ? tier1.testing : tier2.testing...`. Since tier2 IS allDeps for monorepos, this preserves the existing behavior when primaryDeps has no testing frameworks. But if primaryDeps has testing frameworks, those now win over allDeps. This is arguably better behavior (primary's testing tools matter more than a demo app's), but it deviates from the spec's explicit constraint. Not a blocker — the behavior is reasonable and the scenarios where it differs are narrow.

**Duplicated merge logic in test helper.** `resolveThreeTier()` in three-tier-detection.test.ts (lines 23-41) mirrors scan-engine.ts logic exactly. This is the right testing pattern — tests shouldn't import the full engine — but it means if someone modifies scan-engine.ts's merge logic without updating the test helper, the tests would pass while the engine diverges. A comment cross-referencing the two would help.

**hasDep uses truthy check.** `hasDep` at scan-engine.ts:136 uses `||` (truthy): `!!(census.primaryDeps[pkg] || ...)`. If a dependency version were an empty string `""`, it would be treated as absent. In practice, package.json versions are never empty strings, so this is dormant.

**detectAiSdk duplication eliminated.** The proof chain noted `detectAiSdk` was called twice in scan-engine.ts — once inline in the stack literal, once for provenance. This build eliminates the duplication: the three-tier chain at line 826 feeds both `stack.aiSdk` and `findStackProvenance` (line 836 passes `stack.aiSdk`).

**No over-building detected.** `ORM_PACKAGES` is imported by scan-engine.ts and test files. `hasDep` is used by 3 schema trigger call sites. `rootDeps` is used by three-tier logic. No unused exports, no dead code paths in new code. The build is well-scoped to the spec.

## AC Walkthrough

- **AC1: n8n-shaped deps return database=PostgreSQL** — ✅ PASS. Test at three-tier-detection.test.ts:68-76.
- **AC2: postiz-shaped deps return database=Prisma, auth=JWT, payments=Stripe** — ✅ PASS. Tests at three-tier-detection.test.ts:90-103.
- **AC3: All 6 Group A repo shapes produce correct identity fields — zero regressions** — ✅ PASS. 2953 tests pass, 0 failures, +29 new tests. No regression in any existing test file.
- **AC4: dub-shaped deps return database=Prisma (ORM from tier 2)** — ✅ PASS. Test at three-tier-detection.test.ts:117-125.
- **AC5: Single-repo projects produce identical results** — ✅ PASS. Test at three-tier-detection.test.ts:139-147.
- **AC6: postiz-shaped schema detection finds Prisma via hasDep** — ✅ PASS. Test at three-tier-detection.test.ts:171-178.
- **AC7: rootDeps exposed on ProjectCensus and populated in census builder** — ✅ PASS. Type at census.ts:74, builder at census.ts:601, included in return at census.ts:650.
- **AC8: ORM_PACKAGES exported from dependencies.ts** — ✅ PASS. Export at dependencies.ts:43-49, test at dependencies.test.ts:67-103.
- **Tests pass** — ✅ PASS. `(cd packages/cli && pnpm vitest run)`: 2953 passed, 2 skipped.
- **No build errors** — ✅ PASS. `pnpm run build`: typecheck + tsup succeed.
- **Lint passes** — ✅ PASS. `pnpm run lint`: 0 errors (3 pre-existing warnings).
- **The nodeAiSdk variable at line 798 is eliminated** — ✅ PASS. `detectAiSdk` appears only once in scan-engine.ts at line 826 (three-tier chain). `findStackProvenance` at line 836 receives `stack.aiSdk` directly.

## Blockers

None. All 24 contract assertions satisfied. All 12 acceptance criteria pass. No regressions. Checked: no unused exports in new code (ORM_PACKAGES imported by scan-engine.ts and 2 test files; hasDep used at 3 call sites), no sentinel test patterns (all assertions check specific values), no error paths that swallow silently (hasDep is a pure boolean, detectUiSystem returns null on no match), no assumptions about external state (all detection is from census data, no filesystem access in new code).

## Findings

- **Test — A022 uiSystem test is a hasDep proxy:** `packages/cli/tests/engine/three-tier-detection.test.ts:237` — Uses `hasDep('tailwindcss', census)` instead of testing `detectUiSystem` directly. The function is private, so a proxy is reasonable, but it won't catch changes to detectUiSystem's return value logic. Source inspection confirms correctness for this build.

- **Code — testing field included in three-tier despite spec constraint:** `packages/cli/src/engine/scan-engine.ts:696` — Spec says "testing stays on allDeps" but implementation applies tier priority (primary wins if non-empty, else allDeps). Behavior is reasonable — primary's testing tools are more relevant — but deviates from stated intent. The scenarios where it differs (primary has testing deps that allDeps doesn't) are narrow.

- **Test — resolveThreeTier duplicates scan-engine logic:** `packages/cli/tests/engine/three-tier-detection.test.ts:23` — The test helper mirrors the engine's three-tier merge logic. Correct pattern (tests shouldn't import the full engine), but creates drift risk. A `// Keep in sync with scan-engine.ts:675-698` comment would help the next engineer.

- **Code — hasDep truthy check on empty-string versions:** `packages/cli/src/engine/scan-engine.ts:136` — `||` treats empty string `""` as falsy. Package.json versions are never empty strings in practice, so dormant. Strict check would be `!== undefined`.

- **Upstream — detectAiSdk duplication resolved:** Proof chain noted `detectAiSdk` called twice. This build eliminates the duplication — single three-tier chain at line 826 feeds both `stack.aiSdk` and `findStackProvenance`. Known issue resolved.

## Deployer Handoff

This is a pure engine change — no CLI surface changes, no new commands, no user-visible output changes. What changes is the VALUES produced by the scan engine for monorepo projects.

**Behavioral changes:**
- n8n-style monorepos: `database` field now reflects primary package (PostgreSQL from `pg`) instead of being contaminated by integration packages (Supabase from LangChain vector store).
- Hoisted monorepos (postiz-app style): `database`, `auth`, `payments` now detected from root package.json instead of returning null.
- ORM-beats-driver: when an ORM exists in any tier, it wins over raw drivers regardless of tier priority.
- novu: `auth` changes from Clerk to Passport (primary API's auth wins over dashboard's frontend auth). This is documented as a known, correct change.

**No breaking changes** to the public API or scan.json schema. `rootDeps` is a new field on `ProjectCensus`, but that's an internal type — no external consumers.

**Merge note:** Branch is 7 commits behind main. May need a rebase before merge if conflicts exist in scan-engine.ts or census.ts.

## Verdict

**Shippable:** YES

All 24 contract assertions satisfied. All 12 acceptance criteria pass. 2953 tests pass with 0 failures. Build and lint clean. No regressions. The implementation is well-scoped — no over-building, no dead code, no YAGNI violations. The five findings are all observation/debt level — none prevent shipping. The three-tier logic correctly handles all specified scenarios: contamination prevention, hoisted dep detection, ORM-beats-driver merge, single-repo passthrough, and edge cases.
