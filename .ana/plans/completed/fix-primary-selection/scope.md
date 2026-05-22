# Scope: Fix Primary Package Selection in Monorepos

**Created by:** Ana
**Date:** 2026-05-22

## Intent

The primary package heuristic picks the package with the most files when no `apps/` directory with framework evidence exists. For library and platform monorepos, the biggest package is often the admin dashboard, test suite, i18n data, or example app — not the core product. This cascades to wrong framework detection, wrong shape, wrong UI system, and wrong version display.

The user wants to add a name-match policy that uses the project's directory name as an identity signal to prefer packages whose npm name matches the project, with a file-count guard to prevent thin wrapper packages from winning.

This is Priority #3 from R5 comprehensive validation (70 repos tested). The requirements were validated by 3 independent review agents and independently verified by Ana against actual source code and test repos.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — new policy logic in one function, caller signature change, unit tests
- **Surface:** cli
- **Files affected:** `src/engine/census.ts` (selectPrimary function + caller), test files for census/primary selection
- **Blast radius:** Every monorepo scan where Policy 1 (apps/ + framework) doesn't fire. 7 repos change primary (all improve), 1 unchanged (scalar — guard blocks correctly). All Policy 1 repos verified unaffected. Shape detection cascades for 2 repos (strapi, payload) — acknowledged and owned below.
- **Estimated effort:** 1–2 pipeline cycles
- **Multi-phase:** no

## Approach

Add a name-match policy between Policy 1 (apps/ + framework evidence) and Policy 3 (most files). The new policy uses the repo directory name — the strongest available project identity signal — to prefer packages whose npm name matches.

The policy chain becomes:
- **Policy 0:** Non-product path exclusion (filter, not selection). Reuses `isNonProductPath` from Issue #1.
- **Policy 1:** apps/ with framework evidence (existing, unchanged).
- **Policy 2:** Name match — exact name, scoped+exact, scoped+identity word, scoped+self-named. With file-count minimum guard and tiered priority.
- **Policy 3:** Most files (existing fallback, narrowed to Policy 0 filtered candidates).

The identity words are {core, server}. Matching is strict (no fuzzy/substring). The file-count guard requires matched packages to have at least 10 files AND at least 5% of the largest viable candidate's file count. This prevents thin wrapper packages (directus: 3 files) and tiny utility packages (@scalar/core: 5 files) from winning over the real product.

This fixes 7 of 8 wrong primaries. Scalar remains unfixed — a name signal exists (@scalar/core matches Policy 2c) but is blocked by the file-count guard because the package has only 5 files. This is correct behavior: @scalar/core is a shared utility, not the product. Setup handles the remainder.

This scope ships AFTER Issue #1 (false surface detection) to reuse `isNonProductPath` rather than duplicating the predicate.

## Acceptance Criteria
- AC1: `selectPrimary()` accepts a `projectDirName` parameter and applies name-match before most-files fallback.
- AC2: Non-product paths (examples/, test/, templates/, etc.) are excluded from the candidate pool via `isNonProductPath` from Issue #1. If all candidates excluded, falls back to unfiltered list.
- AC3: Name-match fires in tiered priority: exact name > scoped+exact > scoped+identity word {core, server} > scoped+self-named. Within a tier, largest file count wins as tiebreaker.
- AC4: File-count minimum guard: matched package must have >= 10 files AND >= 5% of the largest viable candidate's file count (after Policy 0 filtering).
- AC5: Policy 3 (most files fallback) operates on Policy 0 filtered candidates, not the original unfiltered list.
- AC6: Caller at census.ts:478 passes `path.basename(normalizedRoot)` as the directory name.
- AC7: Root package (relativePath '.') is excluded from Policy 2 name-match candidates as defense-in-depth. Root is NOT excluded from Policy 3.
- AC8: All 8 affected repos produce correct new primaries: logto→packages/core, medusa→packages/medusa, trpc→packages/server, payload→packages/payload, strapi→packages/core/strapi, vercel-ai→packages/ai, n8n→packages/cli, scalar→unchanged (guard blocks).
- AC9: All Policy 1 repos produce identical results (dub, inbox-zero, supabase, cal.com, teable, formbricks, midday, tegon, trigger.dev).
- AC10: Directus produces identical result — wrapper (3 files) blocked by guard, api/ wins via Policy 3.
- AC11: Anatomia self-scan unchanged — "anatomia-cli" does not match "anatomia", Policy 3 picks packages/cli.
- AC12: Unit tests cover all matching variants, the file-count guard (both absolute and relative thresholds), root exclusion, regression tests for directus and scalar, and the full policy chain.

## Edge Cases & Risks

### What Gets Worse

Primary identity improves for all 8 affected repos — correct package, correct framework detection, correct terminal display. But shape temporarily regresses for 2 repos until Issue #2 (shape detection priority fix) ships. Shape is informational; primary affects framework detection, version display, and agent context — higher-impact dimensions.

**Strapi: shape regresses from full-stack to cli.** Current primary (@strapi/admin) has koa + react → shape "full-stack." New primary (@strapi/strapi) has bin + commander + react → shape "cli" because bin fires before framework in the current priority chain. A developer scanning strapi after this fix will see "cli" instead of "full-stack" in the terminal header. This is visible and wrong. It is fixed when Issue #2 ships (framework evidence beats CLI dep signals) — react in @strapi/strapi's deps would produce "web-app", which is closer to correct though still not ideal for a server-side CMS framework.

**Payload: shape moves laterally (web-app to cli).** Current primary (test/) has next + react → "web-app." New primary (packages/payload) has bin + minimist → "cli." Both are wrong for different reasons — test suite deps don't represent the project, and payload's bin field is for its CLI entry point, not its identity. Issue #2 does not fully resolve this because packages/payload has no framework in direct deps. Payload's shape requires either framework detection improvements or per-package shape signals — separate concerns.

**n8n: shape changes from unknown/library to cli.** Current primary (packages/nodes-base) has no framework deps, no bin → likely "library" or "unknown." New primary (packages/cli) has express + bin → "cli" under current priority. With Issue #2, express beats bin → "api-server." n8n is a workflow automation platform with a CLI entry point and an Express API server. "api-server" is the most accurate shape, achievable with Issue #2.

**The tradeoff is net positive.** Primary selection affects framework detection, version display, terminal identity line, and agent context — all high-impact. Shape affects terminal header and scaffold descriptions — informational. Fixing primary now and shape in Issue #2 is the right sequencing.

### Other Edge Cases

- **All candidates excluded by Policy 0.** If every source root is in a non-product path (theoretical), Policy 0 falls back to the unfiltered list. The guard ensures we never produce an empty candidate pool.
- **Multiple name matches in the same tier.** File count tiebreaker within a tier (largest among matches wins). If two packages have identical names at different paths, the one with more files wins.
- **Cloned with non-canonical directory name.** If someone clones medusa into `~/projects/my-cms/`, the directory name "my-cms" matches nothing → name-match silently fails → Policy 3 (most files) takes over. Graceful degradation, same as current behavior.
- **allDeps merge is NOT affected.** `allDeps` merges all workspace packages regardless of primary. Only `primaryDeps` changes, affecting framework, shape, and uiSystem detection.
- **trpc shape is a three-issue problem.** Fixing primary to @trpc/server does not fix shape — server has `bin: {"intent": "./bin/intent.js"}` (auto-generated @tanstack/intent scaffold). Shape "cli" persists until Issue #2 (framework beats CLI) + bin-filtering for auto-generated scaffolding are both resolved.

## Rejected Approaches

**Fuzzy/substring name matching.** "ai" is a suffix of "vercel-ai" — should that match? No. vercel-ai is already fixed by Policy 0 (examples excluded) + Policy 3. No repo in the 70-repo test set requires fuzzy matching. The risk of false positives (a package named "ui" matching a dir named "mui") outweighs zero marginal benefit.

**Repository URL field parsing.** More robust for cloned-with-different-name cases. But requires parsing the `repository` field from package.json (inconsistent formats: string, object, git:// URLs, github shorthand) or `.git/config`. Heavier machinery for marginal gain over a clean fallback. Natural Policy 2.5 to add later if directory-name mismatches are observed in the wild.

**Additional identity words beyond {core, server}.** Considered `engine`, `sdk`, `api`, `main`, `app`. No repo in the test set benefits from any of these. `api` is risky — could match a gateway surface, not the core. Conservative start; extend later if a pattern emerges.

**Shipping independently of Issue #1.** Would require duplicating the `isNonProductPath` predicate inline. Payload and vercel-ai are partially fixed by Issue #1's filtering alone. The policies compose cleanly. Ship after Issue #1.

## Open Questions

None — all open questions from the requirements file were resolved during investigation.

## Exploration Findings

### Patterns Discovered
- census.ts:112-131: `selectPrimary` is a pure function with clean input (roots, frameworkHints). Adding a parameter is a minimal signature change.
- census.ts:429-444: sourceRoots built from `result.packages` — root package is NOT included by @manypkg for any tested monorepo. Root exclusion is defense-in-depth, not correcting a current bug.
- census.ts:478: Caller has `normalizedRoot` available. `path.basename(normalizedRoot)` is the identity signal.
- census.ts:496: `primaryDeps` merges deps + devDeps from the primary root. Changing primary changes all downstream detection.

### Constraints Discovered
- [TYPE-VERIFIED] @manypkg root exclusion (census.ts:429) — `result.packages` does not include the root package for pnpm, npm, or yarn workspaces across all 70 test repos. One exception: infisical (root_included=true, count=1) detected as single-repo, selectPrimary never called.
- [TYPE-VERIFIED] countSourceFiles (census.ts:135-152) — counts .ts/.tsx/.js/.jsx/.py/.go/.rs files, excludes node_modules/dist/.next/build/.git. Logto's 1,717 .ts phrase files are correctly counted because .ts is a source extension.
- [OBSERVED] File-count guard thresholds — 10 absolute blocks directus (3 files) and scalar (5 files). 5% relative blocks directus (3/1059 = 0.3%) and scalar (5/360 = 1.4%). Both thresholds are needed: absolute catches tiny wrappers, relative catches small packages in large repos.
- [OBSERVED] Shape cascades — strapi regresses (full-stack → cli), payload moves laterally (web-app → cli), n8n changes (unknown → cli). All mitigated or resolved by Issue #2 except payload.

### Test Infrastructure
- Existing census tests should be in the test suite. New tests needed for selectPrimary policy chain with mocked roots.

## For AnaPlan

### Structural Analog
`selectPrimary()` itself at census.ts:112-131 — the function being modified. It's a pure function that takes data and returns a string. The new policy slots between existing policies with the same pattern.

### Relevant Code Paths
- `census.ts:112-131` — selectPrimary function (the change target)
- `census.ts:429-444` — sourceRoots construction from @manypkg packages
- `census.ts:478` — selectPrimary call site (needs projectDirName parameter)
- `census.ts:496` — primaryDeps derivation (downstream consumer, unchanged)
- `src/engine/detectors/surfaces.ts` or wherever Issue #1 exports `isNonProductPath` — Policy 0 dependency

### Patterns to Follow
- selectPrimary is a pure function — keep it pure. No filesystem access, no async.
- The existing Policy 1 pattern: filter candidates, sort by file count, return first match.
- census.ts uses `toPosix()` for cross-platform path consistency — name matching should lowercase both sides.

### Known Gotchas
- The `projectDirName` must come from `path.basename(normalizedRoot)`, NOT from `projectName` (line 398). `projectName` comes from root package.json name field, which is often "root", "monorepo", or "@scope/monorepo" — not the directory name.
- Root exclusion applies to Policy 2 only, not Policy 3. Root must remain a viable fallback for repos where no name matches and no apps/ exist.
- The guard's "largest candidate" denominator is after Policy 0 filtering. For payload: test/ (1754 files) is excluded by Policy 0, so the largest viable candidate is packages/payload (679 files), making the guard self-referential (679/679 = 100%). This is correct behavior.
- Package names with scopes need bare-name extraction: `@medusajs/medusa` → bare `medusa`, scope `medusajs`. Handle edge cases: unscoped packages (bare = full name, scope = empty).

### Things to Investigate
- Where exactly does Issue #1 export `isNonProductPath`? The plan needs to identify the import path. If Issue #1 hasn't shipped by plan time, the plan should specify the inline fallback.
- Test strategy: unit tests with mocked SourceRoot arrays are cleaner than integration tests hitting the filesystem. Design test fixtures that cover all 8 affected repos, the directus guard case, the scalar guard case, and the root exclusion defense.
