# Build Report: Website Production Infrastructure

**Created by:** AnaBuild
**Date:** 2026-05-07
**Spec:** .ana/plans/active/website-production-infra/spec.md
**Branch:** feature/website-production-infra

## What Was Built

- `website/lib/proof-feed.ts` (modified): Added `getLatestVersion()` (GitHub tags API, 1hr ISR, fallback "v1.0.2"), `getLatestCommit()` (GitHub commits API, 5min ISR, fallback "0000000"), and `githubHeaders()` helper with conditional GITHUB_TOKEN auth. Modified `mapEntry()` to accept `version` parameter. Modified `getProofFeed()` to resolve version before `.map()` and pass it to `mapEntry()`.
- `website/lib/analytics.tsx` (created): PostHog provider with `"use client"` directive. Dynamic `import('posthog-js')` inside `useEffect`, gated on `NEXT_PUBLIC_POSTHOG_KEY`. Children prop is optional — component works as sibling (not wrapper) in layout. Returns `children ?? null`.
- `website/app/layout.tsx` (modified): Imported `AnalyticsProvider`, replaced placeholder comment with `<AnalyticsProvider />` after `{children}`. Added `openGraph.images` to root metadata pointing to `/og/og-home.png`.
- `website/app/(marketing)/page.tsx` (modified): Added `Metadata` import and `metadata` export with `openGraph.images` for landing page.
- `website/app/(marketing)/docs/page.tsx` (modified): Added `openGraph.images` to existing metadata export.
- `website/app/(marketing)/manifesto/page.tsx` (modified): Added `openGraph.images` to existing metadata export.
- `website/app/(marketing)/contact/page.tsx` (modified): Added `openGraph.images` to existing metadata export.
- `website/public/og/*.png` (created): 9 static OG images at 1200×630px — og-home, og-docs, og-manifesto, og-contact, og-changelog, og-cli, og-examples, og-about, og-license. Generated with Pillow: warm paper background (#F7F7F4), oxblood accent bar, [anatomia] wordmark, page subtitle.
- `website/.env.example` (created): Documents `GITHUB_TOKEN` and `NEXT_PUBLIC_POSTHOG_KEY` with usage comments.
- `website/.gitignore` (modified): Added `!.env.example` negation so `.env.example` is tracked despite the `.env*` ignore rule.
- `.github/workflows/test.yml` (modified): Added `website` job running `pnpm --filter anatomia-website check` on ubuntu-latest with Node 22, independent of the existing test matrix.
- `website/package.json` (modified): Added `posthog-js` dependency and `"smoke": "bash scripts/smoke-test.sh"` script.
- `website/scripts/smoke-test.sh` (created): Builds website, greps `routes-manifest.json` for all 9 expected routes. Uses space-tolerant grep pattern `"page": *"$route"`.

## PR Summary

- Wire live version and commit data from GitHub API into the proof feed, replacing hardcoded "v1.0.2" with ISR-cached fetches (1hr for tags, 5min for commits) and graceful fallbacks
- Add PostHog analytics provider with zero-JS-when-unconfigured pattern — dynamic import gated on `NEXT_PUBLIC_POSTHOG_KEY` env var
- Create 9 static 1200×630 OG images and wire social sharing metadata into all existing pages
- Add website CI job to test.yml (lint + typecheck + build) running in parallel with CLI test matrix
- Add smoke test script verifying all 9 routes exist in the Next.js build output

## Acceptance Criteria Coverage

- AC1 "Nav version pill shows real latest git tag" → proof-feed.ts `getLatestVersion()` fetches from `api.github.com/repos/TettoLabs/anatomia/tags` (code inspection)
- AC2 "Version data in proof feed rows comes from getLatestVersion()" → `getProofFeed()` calls `getLatestVersion()` before `.map()`, passes result to `mapEntry()` (code inspection)
- AC3 "getLatestVersion() has 1-hour ISR cache and fallback" → `next: { revalidate: 3600 }` and `return VERSION_FALLBACK` ("v1.0.2") on failure (code inspection)
- AC4 "getLatestCommit() returns 7-char SHA and ISO timestamp" → `commits[0].sha.slice(0, 7)` and `commits[0].commit.committer.date` (code inspection)
- AC5 "getLatestCommit() has 5-minute ISR cache and fallback" → `next: { revalidate: 300 }` and `{ hash: "0000000", ts: now }` on failure (code inspection)
- AC6 ".env.example exists with GITHUB_TOKEN and NEXT_PUBLIC_POSTHOG_KEY" → file created with both documented (file exists)
- AC7 "PostHog provider captures pageview + pageleave events" → `capture_pageview: true, capture_pageleave: true` in PostHog init config (code inspection)
- AC8 "PostHog provider is no-op when env var absent" → `if (!POSTHOG_KEY) return;` before dynamic import (code inspection)
- AC9 "Every page has openGraph.images metadata" → landing, docs, manifesto, contact all have `openGraph.images` (code inspection)
- AC10 "OG images are 1200×630px" → Generated at 1200×630, verified with Pillow (build output)
- AC11 "test.yml has website check job" → `website` job added running `pnpm --filter anatomia-website check` (code inspection)
- AC12 "Smoke test verifies 9+ routes" → smoke-test.sh checks 9 routes against routes-manifest.json (smoke test passes)
- AC13 "pnpm smoke runs the smoke test" → `"smoke": "bash scripts/smoke-test.sh"` in package.json (smoke test passes)
- AC14 "Pre-commit hook remains CLI-only" → `.husky/pre-commit` unchanged, contains `cd packages/cli` only (file inspection)
- AC15 "pnpm check passes after all changes" → `pnpm --filter anatomia-website check` exits 0 (build output)
- AC16 "Version pill updates within 1 hour" → ISR `revalidate: 3600` on `getLatestVersion()` (code inspection)
- AC17 "No build errors" → `pnpm --filter anatomia-website check` passes (build output)
- AC18 "posthog-js added to dependencies" → `"posthog-js": "^1.372.9"` in website/package.json (file inspection)

## Implementation Decisions

1. **`githubHeaders()` helper**: Extracted a shared helper for GitHub API headers (User-Agent, Accept, conditional Authorization) rather than duplicating across `getLatestVersion()` and `getLatestCommit()`. Spec didn't specify this — reduces duplication.

2. **Children prop made optional**: The spec says AnalyticsProvider is "a sibling of {children}, not a wrapper" and `<AnalyticsProvider />` is used without children in layout.tsx. Made `children` optional with `children ?? null` return to satisfy both usage patterns.

3. **OG image generation via Pillow**: Spec says "static 1200×630 images" and "Brand treatment: oxblood accent, Geist font, warm paper background (#F7F7F4), [anatomia] wordmark." Generated programmatically since ImageMagick wasn't available. Used system Helvetica font as Geist isn't installed system-wide — the images are placeholders with correct dimensions and brand colors.

4. **Smoke test grep pattern**: Spec says "grep for the string pattern, not parse JSON — resilient to key ordering changes." The actual routes-manifest uses `"page": "/route"` (with space after colon). Used `"page": *"$route"` pattern to handle both no-space and space variants.

5. **Page locations**: Spec lists pages under `(sub)/` but Scope B already shipped and moved them to `(marketing)/`. Wired OG metadata to `(marketing)/` pages which is where they actually live. Contract file_changes still reference `(sub)/` — this is a spec/contract stale reference, not a deviation from intent.

6. **`.gitignore` negation**: `.env*` pattern in website `.gitignore` blocked `.env.example`. Added `!.env.example` negation line to allow tracking.

## Deviations from Contract

### Page paths: (sub) vs (marketing)
**Instead:** Modified pages under `website/app/(marketing)/` instead of `website/app/(sub)/`
**Reason:** Scope B (website-dead-links) shipped before this scope, moving docs/manifesto/contact from `(sub)` to `(marketing)`. The contract's `file_changes` still reference `(sub)` paths which no longer exist.
**Outcome:** Functionally equivalent — the correct pages were modified at their current locations.

### A019: OG image dimensions
**Instead:** Verified dimensions via Pillow generation output (1200×630) rather than an independent measurement tool
**Reason:** Images were generated programmatically at exact dimensions — verification is inherent in the generation process
**Outcome:** Dimensions are correct — verifier can confirm with `identify` or similar tool

## Test Results

### Baseline (before changes)
```
$ pnpm --filter anatomia-website check
> pnpm lint && pnpm typecheck && pnpm build
✓ Compiled successfully
✓ Generating static pages (13/13)
All 9 routes rendered. Exit code 0.
```
CLI tests: 1998 passed, 2 skipped (no website tests exist)

### After Changes
```
$ pnpm --filter anatomia-website check
> pnpm lint && pnpm typecheck && pnpm build
✓ Compiled successfully in 1071ms
✓ Generating static pages (13/13) in 787ms
All 9 routes rendered. Exit code 0.

$ pnpm --filter anatomia-website smoke
Building website...
✓ Compiled successfully in 1144ms
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

$ cd packages/cli && pnpm vitest run
Test Files  96 passed (96)
     Tests  1998 passed | 2 skipped (2000)
  Duration  35.21s
```

### Comparison
- Tests added: 0 (no website test infrastructure; smoke test is a shell script, not a test runner)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `website/scripts/smoke-test.sh`: Verifies all 9 expected routes exist in the Next.js routes-manifest.json after build

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
pnpm --filter anatomia-website check
pnpm --filter anatomia-website smoke
```

## Git History
```
98a62a3 [website-production-infra] Add CI job, smoke test, and env docs
593af32 [website-production-infra] Add OG images and social sharing metadata
059e480 [website-production-infra] Add PostHog analytics provider
cd150b7 [website-production-infra] Add live version and commit data from GitHub API
```

## Open Issues

1. **OG images are programmatic placeholders**: Generated with Pillow using system Helvetica — not the Geist font specified in the spec. The images have correct dimensions (1200×630), brand colors (oxblood #800000, warm paper #F7F7F4), and [anatomia] wordmark, but the typography won't match the website. A designer should replace these with production-quality images.

2. **AnalyticsProvider `children` prop optional with default**: The spec describes AnalyticsProvider as both accepting `{children}` and being used as `<AnalyticsProvider />` (no children). Made children optional to satisfy both patterns. The `= {}` default parameter on the destructured props is technically unnecessary since React always passes props — but it makes the API explicit.

3. **Pre-existing lint warning**: `packages/cli/src/utils/git-operations.ts:169` has "Unused eslint-disable directive" — pre-existing, not introduced by this build.

4. **`getLatestVersion()` returns the first tag, not necessarily a semver release**: GitHub's tags API returns tags in order, but the first tag might not be a release tag. If the repo uses non-release tags, this could return unexpected values. The fallback handles failures but not unexpected tag formats.

5. **Worktree lockfile warning**: Next.js detects multiple lockfiles (main repo + worktree symlink) and warns during build. This is a worktree artifact, not a production concern.

Verified complete by second pass.
