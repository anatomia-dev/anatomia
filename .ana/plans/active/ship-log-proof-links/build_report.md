# Build Report: Ship log proof linking

**Created by:** AnaBuild
**Date:** 2026-05-16
**Spec:** .ana/plans/active/ship-log-proof-links/spec.md
**Branch:** feature/ship-log-proof-links

## What Was Built

- `website/lib/proof-feed.ts` (modified): Added `slug?: string` to `ProofEntry` interface. Passed `entry.slug` through in `mapEntry()`. Added real slugs (from static proof-entries) to all 6 mock entries.
- `website/components/proof-feed/ProofFeed.tsx` (modified): Imported `Link` from `next/link`. Refactored entries map to conditionally wrap row content in `<Link>` (when `e.slug` exists) or `<div>` (when it doesn't). Summary bar dots remain as `<span>` elements.
- `website/app/docs/proof/[slug]/page.tsx` (modified): Added `dynamicParams = true` and `revalidate = 3600` route segment config exports. Added `fetchProofChainEntry()` helper that fetches proof_chain.json from GitHub raw API and finds entry by slug. Updated `generateMetadata` to use the GitHub fallback when static entry not found. Updated page component to render minimal fallback page (feature name, result, assertion count, date, "next site build" note, GitHub link) before calling `notFound()`.
- `website/components/proof-feed/proof-feed.module.css` (not modified): Already had `text-decoration: none` and explicit `color: var(--ink-75)` on `.proofRow` — no changes needed.

## PR Summary

- Ship log rows in the proof feed now link to `/docs/proof/{slug}` — clicking navigates to the full proof detail page
- Rows without a slug gracefully render as plain divs (no broken links)
- Proof detail pages now accept dynamic slugs not in the static build, rendering a minimal summary from the GitHub proof chain API
- Invalid slugs still return 404; fallback pages cache for 1 hour via ISR
- No new dependencies, no changes to existing page behavior for statically-built entries

## Acceptance Criteria Coverage

- AC1 "Each expanded ship log row links to `/docs/proof/{slug}`" → ProofFeed.tsx renders `<Link href="/docs/proof/{slug}">` for each entry with slug (build verification)
- AC2 "Rows where slug is unavailable render without a link" → Conditional rendering: `e.slug` ? Link : div (build verification)
- AC3 "Visiting `/docs/proof/{new-slug}` for entry in proof_chain.json returns valid page" → `dynamicParams = true` + `fetchProofChainEntry()` fallback (build verification)
- AC4 "Fallback page shows: feature name, result, assertion count, date, note" → Fallback render includes all fields (build verification)
- AC5 "Mobile: entire row is tap target" → `.proofRow` class applied to Link element, existing flex-wrap layout unchanged (build verification)
- AC6 "Collapsed summary bar dots do NOT link" → Dots remain `<span>` inside button, untouched by this change (build verification)
- AC7 "Hover state unchanged" → `.proofRow:hover` CSS applies equally to `<a>` and `<div>` (build verification)
- AC8 "No TypeScript errors" → ✅ `tsc --noEmit` passes, `pnpm build` succeeds
- AC9 "generateMetadata handles both static and dynamic" → ✅ Metadata function falls through to GitHub fetch, returns "Proof" in title for both paths

## Implementation Decisions

- **Row content extraction:** Extracted row inner content to a `rowContent` variable to avoid duplicating JSX between the Link and div wrappers. Cleaner than two full copies.
- **Local `PROOF_CHAIN_URL` in page.tsx:** Defined a local constant rather than importing from `proof-feed.ts` — avoids coupling the docs data layer to the marketing feed layer, as spec's Gotchas section recommended.
- **Fallback page styling:** Used inline styles matching the existing page layout (same article wrapper, same breadcrumb) with a soft brand-colored card for the "next site build" note. No heavy proof visualization components imported.
- **No CSS changes:** `.proofRow` already had `text-decoration: none` and an explicit color value. Verified during implementation that the anchor element doesn't introduce browser-default link styles.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd website && pnpm build)
Build succeeded. 113 static proof pages generated.
```

### After Changes
```
(cd website && pnpm build)
Build succeeded. 113 static proof pages generated. Route shows 1h revalidation.
```

```
(cd website && npx tsc --noEmit)
No errors.
```

```
pnpm run lint
Tasks: 2 successful, 2 total
1 pre-existing warning in packages/cli (unused eslint-disable directive) — not introduced by this build.
```

### Comparison
- Tests added: 0 (no test infrastructure for website — build-only verification per spec)
- Tests removed: 0
- Regressions: none

### New Tests Written
None — spec explicitly states "Unit tests: None required" for this marketing site component.

## Verification Commands
```bash
(cd website && pnpm build)
(cd website && npx tsc --noEmit)
pnpm run lint
```

## Git History
```
a2e42b40 [ship-log-proof-links] Add dynamic fallback for un-built proof pages
2188e1fd [ship-log-proof-links] Link ship log rows to proof detail pages
cf839695 [ship-log-proof-links] Add slug to proof feed data layer
```

## Open Issues

- The fallback page does not include a RightRail component (ToC, edit link, share) — intentional per spec constraint (fallback is stripped-down) but may look visually inconsistent with other docs pages until the next static build promotes the entry to the full layout.
- Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts` (unused eslint-disable directive) — not introduced by this build.

Verified complete by second pass.
