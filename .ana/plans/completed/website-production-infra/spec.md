# Spec: Website Production Infrastructure

**Created by:** AnaPlan
**Date:** 2026-05-07
**Scope:** .ana/plans/active/website-production-infra/scope.md

## Approach

Eight items making the website operationally real. All changes are in the `website/` package except the CI workflow.

**Data wiring (C1 + C2):** Add `getLatestVersion()` and `getLatestCommit()` to `proof-feed.ts`, following the identical pattern as `getProofFeed()` — async fetch with ISR cache and hardcoded fallback. Call `getLatestVersion()` once inside `getProofFeed()` before the `.map()` call, pass result to `mapEntry()` as a second parameter. `getLatestCommit()` is called independently by consumers that need the latest git SHA (Nav, Footer) — it's NOT wired through `mapEntry()` because the per-entry hash is a proof chain artifact hash, not a git commit.

**Analytics (C4):** Create a `"use client"` PostHog provider that uses dynamic `import('posthog-js')` inside `useEffect`. When `NEXT_PUBLIC_POSTHOG_KEY` is absent, the provider renders `{children}` with zero JS overhead. Wire into `layout.tsx` replacing the analytics placeholder comment.

**OG images (C5):** Create static 1200×630 images in `public/og/` for all pages. Wire `openGraph.images` metadata into the 4 pages that currently exist (landing via layout metadata, docs, manifesto, contact). The 5 Scope B pages get their metadata wired when B ships — create the images now so they're ready.

**CI (C6):** Add a separate `website` job to `test.yml` that runs `pnpm --filter anatomia-website check` on `ubuntu-latest, Node 22` only. Runs in parallel with the existing test matrix.

**Smoke test (C7):** A shell script that runs `pnpm build` and greps `routes-manifest.json` for expected route paths. Added to `package.json` as `"smoke": "bash scripts/smoke-test.sh"`.

**Env documentation (C3):** Create `website/.env.example` documenting `GITHUB_TOKEN` and `NEXT_PUBLIC_POSTHOG_KEY`.

## Output Mockups

### getLatestVersion() behavior
```
# Success: returns tag name from GitHub API
"v1.0.3"

# Failure/timeout: returns fallback
"v1.0.2"
```

### getLatestCommit() behavior
```
# Success: returns 7-char SHA + ISO timestamp
{ hash: "a3b4c5d", ts: "2026-05-07T10:30:00Z" }

# Failure/timeout: returns fallback
{ hash: "0000000", ts: "2026-05-07T00:00:00.000Z" }
```

### Smoke test output
```
$ pnpm smoke
Building website...
Checking routes in .next/routes-manifest.json...
  ✓ /
  ✓ /docs
  ✓ /manifesto
  ✓ /contact
  ✓ /changelog
  ✓ /cli
  ✓ /examples
  ✓ /about
  ✓ /license
All 9 routes found.
```

### .env.example
```
# GitHub API token — raises rate limit from 60/hr to 5,000/hr
# Server-side only (no NEXT_PUBLIC_ prefix)
# Optional: site works without it, falls back to hardcoded values
GITHUB_TOKEN=

# PostHog analytics — client-side
# Optional: when absent, zero analytics JS is shipped
NEXT_PUBLIC_POSTHOG_KEY=
```

## File Changes

### `website/lib/proof-feed.ts` (modify)
**What changes:** Add `getLatestVersion()` and `getLatestCommit()` exported async functions. Modify `getProofFeed()` to call `getLatestVersion()` before the `.map()` and pass the result to `mapEntry()`. Add `version` parameter to `mapEntry()` signature.
**Pattern to follow:** The existing `getProofFeed()` function in the same file — async fetch, ISR `next.revalidate`, try/catch with fallback.
**Why:** The hardcoded `"v1.0.2"` in `mapEntry()` goes stale on every release. Proof context flagged this as a known issue.

### `website/lib/analytics.tsx` (create)
**What changes:** PostHog provider component. `"use client"` directive. Dynamic `import('posthog-js')` inside `useEffect` gated on env var presence. Renders `{children}` always — the PostHog initialization is a side effect, not a wrapper.
**Pattern to follow:** The `"use client"` pattern in `website/lib/theme.ts` for client-side provider structure.
**Why:** Analytics with zero cost when unconfigured. The layout placeholder comment explicitly marks where this goes.

### `website/app/layout.tsx` (modify)
**What changes:** Import `AnalyticsProvider` from `@/lib/analytics`. Replace the `{/* Analytics provider: wire PostHog here when ready */}` comment with `<AnalyticsProvider />`. The provider sits after `{children}` inside `<body>`.
**Pattern to follow:** Existing layout structure — the provider is a sibling of `{children}`, not a wrapper.
**Why:** PostHog needs to be in the root layout to capture pageviews across all routes.

### `website/app/(marketing)/page.tsx` (modify)
**What changes:** Add `metadata` export with `openGraph.images` pointing to `/og/og-home.png`.
**Pattern to follow:** The existing `metadata` export in `website/app/(sub)/docs/page.tsx` (lines 8-12) for the shape. Add `openGraph` field.
**Why:** Social sharing previews for the landing page.

### `website/app/(sub)/docs/page.tsx` (modify)
**What changes:** Add `openGraph.images` to the existing `metadata` export.
**Pattern to follow:** Extend the existing metadata object — don't replace it.
**Why:** Social sharing previews for the docs page.

### `website/app/(sub)/manifesto/page.tsx` (modify)
**What changes:** Add `metadata` export with `openGraph.images` if one doesn't exist, or extend it.
**Pattern to follow:** Same as docs page metadata pattern.
**Why:** Social sharing previews.

### `website/app/(sub)/contact/page.tsx` (modify)
**What changes:** Add `metadata` export with `openGraph.images` if one doesn't exist, or extend it.
**Pattern to follow:** Same as docs page metadata pattern.
**Why:** Social sharing previews.

### `website/public/og/` (create directory + files)
**What changes:** Create OG images for all pages: `og-home.png`, `og-docs.png`, `og-manifesto.png`, `og-contact.png`, `og-changelog.png`, `og-cli.png`, `og-examples.png`, `og-about.png`, `og-license.png`. Each 1200×630px. Brand treatment: oxblood accent, Geist font, warm paper background (#F7F7F4), [anatomia] wordmark.
**Why:** Every page needs a preview image for social sharing. Create all 9 now so Scope B pages are ready when they ship.

### `website/.env.example` (create)
**What changes:** Document `GITHUB_TOKEN` and `NEXT_PUBLIC_POSTHOG_KEY` with comments explaining each.
**Pattern to follow:** See Output Mockups section above for exact format.
**Why:** Environment documentation for contributors and deployment.

### `.github/workflows/test.yml` (modify)
**What changes:** Add a `website` job that runs `pnpm --filter anatomia-website check` on `ubuntu-latest` with Node 22. This job is independent of the existing `test` job — runs in parallel.
**Pattern to follow:** The existing `test` job structure for checkout, pnpm setup, node setup, and install steps.
**Why:** CI should catch website regressions (lint, typecheck, build errors) without slowing the CLI test matrix.

### `website/package.json` (modify)
**What changes:** Add `"smoke": "bash scripts/smoke-test.sh"` to the scripts section.
**Why:** Enables `pnpm --filter anatomia-website smoke` as a build verification command.

### `website/scripts/smoke-test.sh` (create)
**What changes:** Shell script that builds the website and greps `routes-manifest.json` for expected routes. Exits 0 on success, 1 if any route is missing.
**Pattern to follow:** See Output Mockups for expected output format. The routes manifest uses `"page": "/route"` under the `staticRoutes` array.
**Why:** Lightweight build verification without Playwright overhead.

## Acceptance Criteria

- [ ] AC1: Nav version pill shows the real latest git tag from `api.github.com/repos/TettoLabs/anatomia/tags` (not hardcoded "v1.0.2")
- [ ] AC2: Version data in proof feed rows comes from `getLatestVersion()`, not a hardcoded string
- [ ] AC3: `getLatestVersion()` has 1-hour ISR cache (`revalidate: 3600`) and falls back to `"v1.0.2"` on failure
- [ ] AC4: `getLatestCommit()` returns a real 7-character git SHA and ISO timestamp from `api.github.com/repos/TettoLabs/anatomia/commits`
- [ ] AC5: `getLatestCommit()` has 5-minute ISR cache (`revalidate: 300`) and falls back to `{ hash: "0000000", ts: now }` on failure
- [ ] AC6: `.env.example` exists with `GITHUB_TOKEN` and `NEXT_PUBLIC_POSTHOG_KEY` documented
- [ ] AC7: PostHog provider wraps layout children, captures pageview + pageleave events when env var is set
- [ ] AC8: PostHog provider is a complete no-op (zero JS shipped) when `NEXT_PUBLIC_POSTHOG_KEY` is absent
- [ ] AC9: Every page with a route has an `openGraph.images` metadata entry pointing to a real image file in `public/og/`
- [ ] AC10: OG images are 1200×630px
- [ ] AC11: `test.yml` has a job that runs `pnpm --filter anatomia-website check` (lint + typecheck + build)
- [ ] AC12: Website smoke test script at `website/scripts/smoke-test.sh` verifies all 9+ routes exist in build output
- [ ] AC13: `pnpm --filter anatomia-website smoke` runs the smoke test
- [ ] AC14: Pre-commit hook remains CLI-only — `cat .husky/pre-commit` shows `cd packages/cli`, no website commands
- [ ] AC15: `pnpm --filter anatomia-website check` passes after all changes
- [ ] AC16: Version pill updates within 1 hour of a new npm release (ISR revalidation cycle)
- [ ] AC17: No build errors after all changes
- [ ] AC18: `posthog-js` added to website dependencies

## Testing Strategy

- **Unit tests:** None required — this is a website package with no test infrastructure. The smoke test (C7) is the first automated check.
- **Smoke test:** `website/scripts/smoke-test.sh` verifies all expected routes appear in the build output. This is the primary automated verification.
- **Manual verification:** `pnpm --filter anatomia-website check` (lint + typecheck + build) serves as the integration test. The CI job runs this on every push.
- **Edge cases:** GitHub API failure (fallback values), missing PostHog env var (zero JS), missing GITHUB_TOKEN (unauthenticated requests within rate limit).

## Dependencies

- **Scope B (website-dead-links) must ship first.** Scope B removes the `url` field from `ProofEntry`, moves pages from `(sub)` to `(marketing)`, and creates 5 new pages. This scope modifies `mapEntry()` in the same file and adds OG metadata to pages that B restructures. If C ships before B, there will be merge conflicts in `proof-feed.ts` and the page paths will be wrong.
- **`posthog-js` npm package** must be added to `website/package.json` dependencies.

## Constraints

- **No website tests exist.** The smoke test is the first. Don't introduce a test runner for the website — the shell script is intentional.
- **PostHog must ship zero JS when unconfigured.** Dynamic import gated on env var check, not a static import that tree-shakes.
- **GitHub API rate limits.** Unauthenticated: 60/hr. The combined ISR calls (~15/hr) are within budget. `GITHUB_TOKEN` is optional but raises the limit to 5,000/hr.
- **OG images are static files, not generated.** The scope rejected `next/og` dynamic generation.
- **Pre-commit hook stays CLI-only.** No website commands in `.husky/pre-commit`.

## Gotchas

- **`mapEntry()` is sync.** Cannot `await getLatestVersion()` inside it. Resolve the version in `getProofFeed()` before `.map()` and pass as parameter: `const version = await getLatestVersion(); return entries.map(e => mapEntry(e, version));`
- **Mock data versions stay hardcoded.** `mockFeed()` has per-entry version strings ("v1.0.2", "v1.0.1", "v1.0.0"). These are display data for fallback — `getLatestVersion()` only affects `mapEntry()` on the real data path.
- **`GITHUB_TOKEN` auth header is conditional.** Only include `Authorization: Bearer ${process.env.GITHUB_TOKEN}` when the env var exists. Otherwise the request goes unauthenticated. Don't send an empty Bearer token — GitHub rejects it.
- **PostHog provider is `"use client"` but children stay Server Components.** In Next.js, Server Components can be children of Client Components when passed as `{children}`. The provider doesn't force client rendering on the page tree.
- **Scope B dependency on page locations.** Currently docs/manifesto/contact are under `(sub)/`. After Scope B, they'll be under `(marketing)/`. The OG metadata must be wired to wherever the pages live when this scope ships. If B hasn't shipped, wire to `(sub)/` pages. If B has shipped, wire to `(marketing)/` pages. The spec lists both — builder checks which exists.
- **Smoke test route count.** The test checks for 9 routes, but only 4 exist before Scope B ships. After B ships, all 9 exist. The test should check for the routes that actually exist — start with what's there, the 5 new routes get added to the check list when B creates them. However, since this scope ships AFTER B (per Dependencies), all 9 routes should exist.
- **The `routes-manifest.json` format.** Routes appear as `"page": "/route"` under the `staticRoutes` array. The smoke test should grep for the string pattern, not parse JSON — resilient to key ordering changes.

## Build Brief

### Rules That Apply
- `"use client"` directive required for the PostHog provider component
- No default exports in library files — use named exports for `getLatestVersion`, `getLatestCommit`, `AnalyticsProvider`
- Page components use default exports (Next.js convention — this is the one exception)
- Explicit return types on all exported functions
- Exported functions require `@param` and `@returns` JSDoc tags

### Pattern Extracts

**ISR fetch + fallback pattern** (from `website/lib/proof-feed.ts`, lines 90-108):
```typescript
export async function getProofFeed(): Promise<ProofEntry[]> {
  try {
    const res = await fetch(PROOF_CHAIN_URL, {
      next: { revalidate: 60 },
      headers: { "User-Agent": "anatomia-web" },
    });
    if (!res.ok) return mockFeed();

    const data: { entries: ProofChainEntry[] } = await res.json();
    if (!data.entries || data.entries.length === 0) return [];

    return data.entries
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
      .slice(0, 6)
      .map(mapEntry);
  } catch {
    return mockFeed();
  }
}
```

**Page metadata pattern** (from `website/app/(sub)/docs/page.tsx`, lines 8-12):
```typescript
export const metadata: Metadata = {
  title: "Docs · Anatomia",
  description:
    "Quickstart: install, init, plan, run, verify. Get a proof chain in your repo in five minutes.",
};
```

**Client provider pattern** (from `website/lib/theme.ts`, lines 1-2):
```typescript
"use client";
// ... useSyncExternalStore-based provider
```

**CI job structure** (from `.github/workflows/test.yml`, lines 21-34):
```yaml
    steps:
      - name: Checkout code
        uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v6
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
```

### Proof Context

**`website/lib/proof-feed.ts`:**
- [code] Hardcoded version 'v1.0.2' will go stale — **directly addressed by this scope** (AC1, AC2)
- [build concern] version field hardcoded to v1.0.2 — **directly addressed by this scope**
- [code] mapEntry never produces kind 'chore' — out of scope, noted

**`website/package.json`:**
- No active findings relevant to this build.

No active proof findings for other affected files.

### Checkpoint Commands

- After `proof-feed.ts` changes: `cd website && pnpm typecheck` — Expected: no errors
- After `analytics.tsx` + `layout.tsx` changes: `cd website && pnpm typecheck` — Expected: no errors
- After all changes: `pnpm --filter anatomia-website check` — Expected: clean lint, typecheck, and build
- After smoke test script: `pnpm --filter anatomia-website smoke` — Expected: all routes found
- Lint: `cd website && pnpm lint`

### Build Baseline

- Current website tests: 0 (no test infrastructure)
- Current website scripts: dev, build, start, lint, typecheck, check, clean
- Command used: `pnpm --filter anatomia-website check`
- After build: expected scripts include `smoke` in addition to existing
- Regression focus: `website/lib/proof-feed.ts` — the `mapEntry()` signature change affects all 5 consumers (Nav, Hero, ProofFeed, Footer, ticker) via `getProofFeed()`
