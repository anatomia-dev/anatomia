# Scope: Website Production Infrastructure

**Created by:** Ana
**Date:** 2026-05-07

## Intent
Wire the website to real data, add analytics, add CI coverage, and create OG images. After Scopes A (visual fidelity) and B (dead links) ship, the site looks right and every link works. This scope makes it operationally real — live version numbers, real commit hashes, traffic visibility, social sharing previews, and CI that catches regressions.

## Complexity Assessment
- **Size:** medium
- **Files affected:**
  - `website/lib/proof-feed.ts` — add `getLatestVersion()` + `getLatestCommit()` helpers, replace hardcoded version in `mapEntry`, wire real commit hash (C1, C2)
  - `website/lib/analytics.tsx` — new file, PostHog provider (C4)
  - `website/app/layout.tsx` — replace analytics placeholder comment with `<AnalyticsProvider>` (C4)
  - `website/app/(marketing)/page.tsx` — add OG image metadata (C5)
  - `website/app/(marketing)/docs/page.tsx` — add OG image metadata (C5)
  - `website/app/(marketing)/manifesto/page.tsx` — add OG image metadata (C5)
  - `website/app/(marketing)/contact/page.tsx` — add OG image metadata (C5)
  - `website/app/(marketing)/changelog/page.tsx` — add OG image metadata (C5, page created by Scope B)
  - `website/app/(marketing)/about/page.tsx` — add OG image metadata (C5, page created by Scope B)
  - `website/public/og/` — 4+ static OG images (C5)
  - `website/.env.example` — new file, document env vars (C3)
  - `.github/workflows/test.yml` — add website lint + typecheck step (C6)
  - `website/package.json` — add smoke test script (C7)
  - `website/scripts/smoke-test.sh` — new file (C7)
- **Blast radius:** Low-medium. The proof-feed.ts changes affect all 5 proof feed consumers (Nav, Hero, ProofFeed, Footer, ticker) but only change the data source — the ProofEntry type contract is unchanged. The CI change affects every push. Analytics is additive (no-ops without env var). OG images are metadata-only.
- **Estimated effort:** 3-4 hours. Each item is small and independent. The proof feed wiring is the most complex (~30 lines). Everything else is configuration or boilerplate.
- **Multi-phase:** no
- **Depends on:** Scope B must ship first. Scope B removes the `url` field from ProofEntry and changes proof feed rows to non-linking. Scope C modifies `mapEntry()` in the same file — if C ships before B, the url field changes conflict. Additionally, the smoke test (C7) checks for routes that Scope B creates (/changelog, /cli, etc.).

## Approach
Eight items, each independently implementable within the scope:

**Data wiring (C1 + C2):** Add two GitHub API fetch helpers to `proof-feed.ts` — one for the latest git tag (version pill), one for the latest commit SHA (footer/nav display). Both use ISR caching (1 hour for tags, 5 minutes for commits) with hardcoded fallbacks. The `mapEntry()` function calls `getLatestVersion()` instead of hardcoding `"v1.0.2"`. Since `getProofFeed()` is already async, the additional awaits integrate cleanly.

**Analytics (C4):** Create a client-side PostHog provider that wraps layout children. No-ops when the env var is absent — zero JS shipped until PostHog is configured. The provider captures pageviews and page-leave events automatically.

**Social sharing (C5):** Create static OG images for each page and wire them into Next.js metadata exports. The images use the Oxblood brand — text on warm paper background. Even simple text-based images are better than no preview.

**CI (C6):** Add a website lint + typecheck step to the existing test.yml workflow. This runs alongside the existing CLI checks — doesn't gate CLI releases but catches website regressions.

**Smoke test (C7):** A shell script that builds the website and verifies all expected routes appear in the build output. Added to package.json as `pnpm smoke`. Not a full test suite — a build verification sanity check.

**Environment documentation (C3):** Create `.env.example` documenting `GITHUB_TOKEN` and `NEXT_PUBLIC_POSTHOG_KEY`. Add `GITHUB_TOKEN` to Vercel manually (documented as a manual step in the scope, not a code change).

**Pre-commit (C8):** No change. Document that the pre-commit hook stays CLI-only. Vercel preview deploys + CI catch website issues.

## Acceptance Criteria
- AC1: Nav version pill shows the real latest git tag from `api.github.com/repos/TettoLabs/anatomia/tags` (not hardcoded "v1.0.2")
- AC2: Version data in proof feed rows comes from `getLatestVersion()`, not a hardcoded string
- AC3: `getLatestVersion()` has 1-hour ISR cache (`revalidate: 3600`) and falls back to `"v1.0.2"` on failure
- AC4: `getLatestCommit()` returns a real 7-character git SHA and ISO timestamp from `api.github.com/repos/TettoLabs/anatomia/commits`
- AC5: `getLatestCommit()` has 5-minute ISR cache (`revalidate: 300`) and falls back to `{ hash: "0000000", ts: now }` on failure
- AC6: `.env.example` exists with `GITHUB_TOKEN` and `NEXT_PUBLIC_POSTHOG_KEY` documented
- AC7: PostHog provider wraps layout children, captures pageview + pageleave events when env var is set
- AC8: PostHog provider is a complete no-op (zero JS shipped) when `NEXT_PUBLIC_POSTHOG_KEY` is absent
- AC9: Every page with a route has an `openGraph.images` metadata entry pointing to a real image file in `public/og/`
- AC10: OG images are 1200×630px
- AC11: `test.yml` has a step that runs `pnpm --filter anatomia-website check` (lint + typecheck + build)
- AC12: Website smoke test script at `website/scripts/smoke-test.sh` verifies all 9+ routes exist in build output
- AC13: `pnpm --filter anatomia-website smoke` runs the smoke test
- AC14: Pre-commit hook remains CLI-only — `cat .husky/pre-commit` shows `cd packages/cli`, no website commands
- AC15: `pnpm --filter anatomia-website check` passes after all changes
- AC16: Version pill updates within 1 hour of a new npm release (ISR revalidation cycle)

## Edge Cases & Risks
- **GitHub API rate limits.** `getLatestVersion()` (1-hour cache) + `getLatestCommit()` (5-minute cache) + `getProofFeed()` (1-minute cache) = ~15 API calls/hour unauthenticated. The unauthenticated limit is 60/hour, so this is fine. `GITHUB_TOKEN` raises it to 5,000/hour for safety margin under heavy ISR traffic.
- **`getLatestVersion()` inside `mapEntry()`.** `mapEntry()` is called once per proof feed entry (6 entries). If `getLatestVersion()` is called inside `mapEntry()`, that's 6 API calls per ISR cycle. Fix: call `getLatestVersion()` once in `getProofFeed()` and pass the result to `mapEntry()` as a parameter. Same for `getLatestCommit()`.
- **PostHog bundle size.** `posthog-js` adds ~20KB gzipped. It loads only when the env var is set, via dynamic import or lazy initialization. The provider must not add to the initial bundle for users without PostHog configured.
- **OG images — design quality.** The images need to feel premium, not like default placeholders. At minimum: Geist font, oxblood accent, warm paper background (#F7F7F4), the [anatomia] wordmark. If design resources aren't available, simple text-on-brand is acceptable — the wiring matters more than the art.
- **Smoke test false positives.** The `routes-manifest.json` format may change between Next.js versions. The test should grep for route paths in the manifest, not parse the JSON structure. If the manifest format changes, the test fails loudly (which is correct — the builder updates the test).
- **CI timing.** Adding `pnpm --filter anatomia-website check` to test.yml adds 30-60 seconds to CI. This runs in a separate step after the CLI build, so it doesn't slow the CLI test path. If timing becomes a concern, it can be moved to a parallel job.
- **Scope B dependency.** If Scope B hasn't shipped when this scope starts, `mapEntry()` still has the `url` field. Plan should note that the `url` field may or may not exist when C ships — the version/commit wiring doesn't touch `url`, so there's no conflict, but Plan should verify.

## Rejected Approaches
- **Fetch version from CLI package.json.** Cross-package import creates a dependency coupling. The GitHub tags API is decoupled and self-updating.
- **Dynamic OG images via `next/og`.** The `ImageResponse` API generates images at request time. Overkill for a marketing site with 9 static pages. Static images are simpler, faster, and don't require a runtime dependency.
- **Playwright E2E tests.** The smoke test script + CI lint/typecheck catches structural issues. Visual regression testing happens via Vercel preview deploys. Playwright would add 60+ seconds to CI and a complex dependency for minimal incremental value on a marketing site.
- **Website-specific pre-commit hook.** Adds 30-60s to every commit for a check that CI already performs. Developer experience trumps — keep pre-commit fast, let CI be thorough.

## Open Questions
None. All items have clear specifications and implementation paths.

## Exploration Findings

### Patterns Discovered
- `getProofFeed()` is already async and fetches from GitHub raw API. Adding `getLatestVersion()` and `getLatestCommit()` follows the same pattern — async fetch with ISR cache and fallback.
- `mapEntry()` is a sync function called inside `getProofFeed()`. To pass the dynamic version, `mapEntry` needs a second parameter or `getLatestVersion()` is called before the map. The cleaner approach: `const version = await getLatestVersion(); return entries.map(e => mapEntry(e, version));`
- The layout.tsx analytics placeholder is at line 60: `{/* Analytics provider: wire PostHog here when ready */}`. Direct replacement target.
- Root layout already has `metadataBase: new URL("https://anatomia.dev")` — OG image paths can be relative (`/og/og-home.png`) and will resolve correctly.

### Constraints Discovered
- [TYPE-VERIFIED] `mapEntry()` is sync — called inside `.map()` on line 104. `getLatestVersion()` is async. Can't call async inside sync map. Must resolve version before the map call.
- [TYPE-VERIFIED] `mockFeed()` hardcodes version strings per-entry ("v1.0.2", "v1.0.1", "v1.0.0"). These are mock data and should stay hardcoded — `getLatestVersion()` only affects `mapEntry()` for real data.
- [TYPE-VERIFIED] `ProofEntry.hash` currently comes from `entry.hashes.scope.slice(7, 14)` — a SHA-256 artifact hash, not a git SHA. `getLatestCommit()` provides a real git SHA, but it's the LATEST commit, not the commit for each specific proof entry. For the nav pill and footer, "latest commit" is correct. For individual feed rows, the artifact hash is the best available identifier.
- [OBSERVED] No `.env.example` exists in the website directory. The prototype had one at `/Users/rsmith/Projects/anatomia_project/anatomia-website/.env.example` but it wasn't copied during the lift.
- [OBSERVED] `test.yml` has no website-specific steps — only `pnpm build` (via turbo, builds both) + CLI-scoped lint/typecheck/tests.

### Test Infrastructure
- No website tests exist. The smoke test (C7) will be the first.
- CI currently catches website build failures via turbo (the `pnpm build` step builds both packages) but doesn't lint or typecheck the website independently.

## For AnaPlan

### Structural Analog
The existing `getProofFeed()` in `proof-feed.ts` — async fetch with ISR cache and sync fallback. `getLatestVersion()` and `getLatestCommit()` follow the identical pattern.

### Relevant Code Paths
- `website/lib/proof-feed.ts` — `mapEntry()` (line 69), `getProofFeed()` (line 90), `ProofEntry` interface (line 21), `PROOF_CHAIN_URL` constant
- `website/app/layout.tsx` — analytics placeholder (line 60), `metadataBase` (line 9)
- `website/app/(marketing)/page.tsx` — landing page metadata (currently has none beyond layout defaults)
- `.github/workflows/test.yml` — CI steps (lines 43-65)
- `website/package.json` — scripts section

### Patterns to Follow
- `getProofFeed()` for the ISR fetch + fallback pattern
- `website/lib/theme.ts` for the client-side provider pattern (useSyncExternalStore)
- Existing sub-page metadata exports (`app/(marketing)/docs/page.tsx`) for the OG metadata pattern

### Known Gotchas
- `mapEntry()` is sync but `getLatestVersion()` is async. Resolve the version BEFORE the `.map()` call: `const version = await getLatestVersion(); return entries.map(e => mapEntry(e, version));`
- The mock data in `mockFeed()` has per-entry version strings ("v1.0.2", "v1.0.1"). These should stay hardcoded — they're mock display data, not live. Only `mapEntry()` (the real data path) uses the dynamic version.
- `GITHUB_TOKEN` in Vercel is a server-side env var (no `NEXT_PUBLIC_` prefix). It should be passed via the `headers` option on the GitHub API fetches: `headers: { Authorization: \`Bearer \${process.env.GITHUB_TOKEN}\` }`. Only include the header when the env var exists.
- PostHog's React provider must be a client component (`"use client"`). Wrapping layout `{children}` in a client provider does NOT make all children client components — Server Components can be children of Client Components in Next.js.
- The smoke test references `routes-manifest.json` — this file exists in `.next/` after a build. The test must run `pnpm build` first (or assume a fresh build exists). The script in the requirements doc runs `pnpm build` before checking.
- OG images for the 5 new Scope B pages (/changelog, /cli, /examples, /about, /license) — these pages may not exist when C is being planned. Plan should create OG images for all 9 pages and wire metadata for the 4 original pages. The 5 new pages' metadata is wired when B ships.

### Things to Investigate
- Whether `posthog-js` supports tree-shaking so that the no-env-var code path truly ships zero JS. The PostHog docs recommend dynamic `import()` inside the `useEffect` that checks the env var. Plan should verify.
- The exact format of `.next/routes-manifest.json` — what key the route paths appear under, so the smoke test greps correctly. A quick `cat .next/routes-manifest.json | python3 -m json.tool | head -30` during planning would confirm.
