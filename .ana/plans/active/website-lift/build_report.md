# Build Report: Website Lift

**Created by:** AnaBuild
**Date:** 2026-05-06
**Spec:** .ana/plans/active/website-lift/spec.md
**Branch:** feature/website-lift

## What Was Built

- `website/` (replaced): Deleted old demo-site (9720 lines removed), copied production Next.js 16 prototype from `../anatomia-website/`. Cleaned up `node_modules/`, `.next/`, `pnpm-lock.yaml`, `tsconfig.tsbuildinfo`, `MIGRATION_HANDOFF.md`. Kept `MAINTENANCE_MANUAL.md`. 67 files across 4 pages, 35 components.
- `website/lib/proof-feed.ts` (modified): Replaced `getProofFeed()` body to fetch from `raw.githubusercontent.com/.../proof_chain.json`. Added `ProofChainEntry` interface, `mapEntry()` helper, `extractFeatureEm()` helper. Falls back to `mockFeed()` on network error or non-OK response. Returns 6 most recent entries sorted descending by `completed_at`.
- `.github/workflows/release.yml` (modified): Changed line 29 from `pnpm build` to `pnpm --filter anatomia-cli build`.
- `packages/cli/tests/engine/detectors/documentation.test.ts` (modified): Updated dogfood test — old assertion expected `website/README.md` (demo-site artifact), replaced with assertion that `website/README.md` does NOT exist (production prototype has no README).

## PR Summary

- Replace the old demo-site website with the production Next.js 16 prototype (4 pages, 35 components, 67 files)
- Wire `getProofFeed()` to fetch real proof chain data from GitHub raw API with graceful fallback to mock data
- Filter release workflow build step to CLI-only so website build failures can't block npm publish
- Update documentation detector dogfood test to reflect new website structure (no more `website/README.md`)

## Acceptance Criteria Coverage

- AC1 "pnpm install resolves without conflicts" -> verified: `pnpm install` completed successfully after website swap
- AC2 "website build succeeds" -> verified: `pnpm --filter anatomia-website build` passes (all 8 routes generated)
- AC3 "website check passes" -> verified: `pnpm --filter anatomia-website check` passes (lint + types + build)
- AC4 "Dev server boots and routes render" -> 🔨 Implemented (static build verified all routes: `/`, `/contact`, `/docs`, `/manifesto`, `/_not-found`; dev server not tested in build environment)
- AC5 "Proof feed shows real data or fallback" -> 🔨 Implemented: code fetches from GitHub raw API, catch block returns `mockFeed()`. No unit test (website has no test infrastructure).
- AC6 "ProofEntry type unchanged" -> verified: type definition unchanged, all 5 consuming components build without modification
- AC7 "CLI tests still pass" -> verified: 1949 passed from worktree (1 environmental failure in worktree.test.ts), 1950 passed from main tree
- AC8 "No dependency conflicts" -> verified: `pnpm install` resolves cleanly
- AC9 "Website build doesn't block CLI release" -> verified: `release.yml` uses `--filter anatomia-cli`
- AC10 "Pre-commit hook unaffected" -> verified: hook runs successfully on every commit (scoped to `cd packages/cli`)
- AC11 "No build or type errors" -> verified: `pnpm --filter anatomia-website check` passes

## Implementation Decisions

- **Empty entries returns `[]` not mock data:** When the API returns valid JSON with an empty `entries` array, we return `[]` rather than falling back to mock data. This matches the spec's edge case: "Empty entries array → returns empty array (no crash)."
- **Dogfood test updated rather than skipped:** The documentation detector test expected `website/README.md` which no longer exists. Rather than skipping the test, updated it to assert the file does NOT exist — this is the correct state after the lift.
- **`ProofChainEntry` interface inline:** Defined the GitHub API response shape as a local interface in proof-feed.ts rather than a shared type, since it's only used in the mapping layer.

## Deviations from Contract

### Test Evidence Note

Contract assertions A001–A006, A021–A027 are verified through build commands, file existence checks, and `package.json` inspection — not through unit tests. The website has no test infrastructure per the spec's Testing Strategy. These assertions are verified by AnaVerify running the checkpoint commands.

Contract assertions A007–A020 are verified through code inspection of `proof-feed.ts` — the implementation matches the specified field mapping exactly. No unit tests exist for these (website has no test infrastructure).

None — contract followed exactly. All field mappings match the spec's table. All cleanup items completed.

## Test Results

### Baseline (before changes)
```
cd packages/cli && pnpm vitest run --run
(run from main tree, not worktree)

Test Files  95 passed (95)
     Tests  1950 passed | 2 skipped (1952)
  Duration  34.32s
```

### After Changes
```
cd packages/cli && pnpm vitest run --run
(run from worktree)

Test Files  1 failed | 94 passed (95)
     Tests  1 failed | 1949 passed | 2 skipped (1952)
  Duration  33.46s
```

The 1 failure is `worktree.test.ts > detectWorktreeSlug > returns null for empty string` — environmental, caused by running from inside `.ana/worktrees/website-lift/` where CWD contains the slug. Verified passing from main tree (55/55 tests pass in the affected files).

### Comparison
- Tests added: 0
- Tests removed: 0
- Tests modified: 1 (documentation.test.ts — updated assertion for new website structure)
- Regressions: none (1 environmental failure in worktree.test.ts, pre-existing for all worktree builds)

### New Tests Written
None — website has no test infrastructure per spec.

## Verification Commands
```
pnpm install
pnpm --filter anatomia-website check
pnpm --filter anatomia-website build
cd packages/cli && pnpm vitest run --run
```

## Git History
```
208cc86 [website-lift] Update dogfood test for new website structure
273d1d2 [website-lift] Filter release workflow build to CLI only
63c110d [website-lift] Wire getProofFeed() to GitHub raw API
a75385b [website-lift] Replace demo-site with production prototype
```

## Open Issues

1. **Documentation detector dogfood test modified:** Changed assertion from "website/README.md exists" to "website/README.md does not exist." This is a correct reflection of the new website structure, but it's a test assertion change that the verifier should review. The old website had a README; the production prototype does not.

2. **Worktree environment test failure:** `worktree.test.ts > detectWorktreeSlug('')` returns `"website-lift"` when run from inside the worktree. This is a pre-existing environmental issue affecting all worktree-based builds — not introduced by this build. The test passes from main tree.

3. **`version` hardcoded to `v1.0.2`:** The spec notes this is intentional (phase 2 fetches the latest git tag), but it will become stale. Noted per spec's Gotchas section.

4. **`feature_em` extraction imperfect for names without em dash:** For "Fix Drizzle schema detection" the result is "Fix Drizzle schema" (3 words). Good enough for display-only per spec.

5. **File header comment still says "Today: static mock data":** The proof-feed.ts file header comment references the old mock-only state. Not updated because the spec said only the function body changes, not the header documentation.

Verified complete by second pass.
