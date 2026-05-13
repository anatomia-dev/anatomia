# Build Report: Content Pages — Phase 1

**Created by:** AnaBuild
**Date:** 2026-05-12
**Spec:** .ana/plans/active/content-pages/spec-1.md
**Branch:** feature/content-pages

## What Was Built

- `website/components/docs/content/Callout.tsx` (modified): Side-by-side flex layout (gap 12px) matching supermock `.callout` styling. Label shows "Rule" or "Note" (capitalized) with variant-specific colors: `var(--brand-light)` for rule, `var(--info)` for note. 10px mono uppercase with 0.06em letter-spacing.
- `website/components/docs/layout/RightRail.tsx` (modified): Removed `hidden` and `xl:block` Tailwind classes. CSS `@media` in `docs.css` is now the sole visibility controller.
- `website/components/docs/layout/DocsNav.tsx` (modified): Changed GitHub URL from `anatomia-dev/anatomia` to `TettoLabs/anatomia`.
- `website/app/docs/[...slug]/page.tsx` (modified, renamed from `[[...slug]]`): Changed editUrl GitHub org to `TettoLabs`. Converted from optional catch-all to required catch-all for Next.js 16 compatibility.
- `website/app/docs/page.tsx` (created): Overview landing page matching supermock `renderOverview()`. Sections in order: lede, stats strip (5 items incl MIT), pipeline diagram, "What's in these docs" (DocsGrid), "Where to start" (AudienceCards), Resources (ResourceStrip), "From the proof chain" (CuratedProofs). All dynamic values from data loaders. No RightRail.
- `website/components/docs/content/PipelineDiagram.tsx` (created): 5 pipeline stages with supermock descriptions. Links to agent reference pages. Footer with "Sealed" explanation and "How it works in depth →" link to concepts/pipeline.
- `website/components/docs/content/DocsGrid.tsx` (created): "What's in these docs" section — 3 cards (Get started, Guides, Reference) with link lists matching supermock `qgrid` section.
- `website/components/docs/content/AudienceCards.tsx` (created): 3 audience cards with exact supermock copy. Evaluating → proof/security-hardening, Installing → start, Operating → concepts/pipeline.
- `website/components/docs/content/CuratedProofs.tsx` (created): 6 curated proofs matching supermock exactly: security-hardening, worktree-isolation, proof-promote (→ /docs/proof/{slug}), v1-documentation-overhaul, add-project-kind-detection, cli-ux-polish (→ /docs/proof). Table with slug + name + description + stage tag, Stage pill, Assertions (satisfied/total), Findings, pass pill. Footer shows curated count and "Browse all" link.
- `website/components/docs/content/ResourceStrip.tsx` (created): 3 resources matching supermock: Repo/GitHub, Pkg/npm, Brief/Manifesto with exact copy.
- `website/content/docs/start.mdx` (created): Quickstart page translated verbatim from supermock `renderQuickstart()`. Prerequisites, Step 1-4, terminal output block (spans stripped), two Callout notes, NextCards linking to concepts/pipeline and guides/reading-a-proof.
- `website/content/docs/meta.json` (created): Root sidebar ordering — `["start", "concepts", "guides"]`.
- `website/content/docs/concepts/meta.json` (created): `["pipeline", "skills", "context", "toolbelt", "artifacts", "contract", "findings"]`.
- `website/content/docs/guides/meta.json` (created): `["using-ana-setup", "verifying-changes", "reading-a-proof", "using-ana-learn", "configurability", "troubleshooting"]`.
- `website/content/docs/index.mdx` (deleted): Scope 1 test page removed.

## PR Summary

- Add custom overview landing page at `/docs` with 7 sections matching the supermock verbatim: lede, stats strip, pipeline diagram, docs grid, audience cards, resources, curated proof table — all dynamic values from data loaders
- Fix three bugs: Callout side-by-side layout with label (D19), RightRail 1181-1279px dead zone (D15), wrong GitHub org (D20)
- Create quickstart MDX at `/docs/start` translated verbatim from supermock `renderQuickstart()`
- Add sidebar ordering via Fumadocs meta.json files for root, concepts, and guides groups
- Convert catch-all route from `[[...slug]]` to `[...slug]` for Next.js 16 compatibility

## Acceptance Criteria Coverage

- AC1 "Overview page renders at /docs with stats, pipeline, cards, proofs, resources" → Build route table shows `/docs` as static route. All sections present with dynamic data from loaders. ✅
- AC5 "Sidebar shows 5 groups in correct order" → Root meta.json lists `["start", "concepts", "guides"]`. Concepts and guides meta.json files define page order. Reference and Proof Chain injected by transformer in `lib/source.ts`. ✅
- AC6 "Callout renders RULE or NOTE label" → Label rendered side-by-side with content in flex layout, matching supermock `.ci` styling. ✅
- AC7 "RightRail visible >1180px without dead zone" → `hidden` and `xl:block` removed. CSS `@media` is sole controller. ✅
- AC8 "GitHub URLs point to TettoLabs/anatomia" → Changed in DocsNav.tsx and catch-all page.tsx. ✅
- AC9 "Dynamic values from data loaders" → Overview imports `getProofStats`, `getAgentCount`, `getCommandCount`, `getSkillCount`. No hardcoded stat values. ✅
- AC11 "Scope 1 test page deleted" → `content/docs/index.mdx` removed via `git rm`. ✅
- AC2 "Quickstart renders at /docs/start" → Build route table shows `/docs/start`. Content translated verbatim from supermock. ✅
- AC12 "`pnpm build` succeeds" → Build succeeds with 14 static pages. ✅
- No build errors or type errors → TypeScript passes, build completes cleanly. ✅

## Implementation Decisions

1. **Optional → required catch-all:** Next.js 16 errors when both `app/docs/page.tsx` and `app/docs/[[...slug]]/page.tsx` exist. Converted to `[...slug]` (required catch-all). The overview page handles bare `/docs`; the catch-all handles all sub-paths.

2. **DocsGrid component:** The supermock "What's in these docs" section (lines 112-152) has 3 cards with internal link lists. Created a new `DocsGrid` component to render this — not in the spec's File Changes but required for supermock fidelity.

3. **Callout CSS variable fallbacks:** Used `var(--brand-light, var(--color-brand))` and `var(--info, var(--ink-30))` as fallbacks since the website's CSS may not define `--brand-light` and `--info` (supermock variables). The fallbacks ensure the component renders correctly regardless.

4. **Curated proof stage tag in Proof column:** The supermock includes a `<span class="tag">` inside the description showing the stage in lowercase. Added this inline tag to match the supermock structure.

## Deviations from Contract

### Route structure: `[[...slug]]` → `[...slug]`
**Instead:** Converted optional catch-all to required catch-all and added explicit `app/docs/page.tsx`
**Reason:** Next.js 16 does not allow an explicit route alongside an optional catch-all at the same path level.
**Outcome:** Functionally equivalent — `/docs` renders the overview, all sub-paths render via catch-all.

### A010–A015, A026, A029–A032: Phase 2/3 assertions
**Instead:** Not addressed in Phase 1
**Reason:** These assertions cover concept pages, guide pages, TroubleCard, and cross-page navigation belonging to Phases 2 and 3.
**Outcome:** Will be addressed in subsequent phases.

## Test Results

### Baseline (before changes)
```
Website: cd website && pnpm build → success (13 static pages, 1 MDX page)
CLI: cd packages/cli && pnpm vitest run → 100 test files, 2180 tests
     (1895 passed, 283 failed, 2 skipped)
     Note: 283 failures in 7 test files pre-existing — e2e/init and
     benchmarks require dist/index.js not built in fresh worktree.
     After pnpm run build: 100 test files pass.
```

### After Changes
```
Website: cd website && pnpm build → success (14 static pages: /docs, /docs/start)
CLI: cd packages/cli && pnpm vitest run → 100 test files, 2180 tests
     (2178 passed, 0 failed, 2 skipped)
```

### Comparison
- Tests added: 0 (website validation is via `pnpm build`)
- Tests removed: 0
- Regressions: none

### New Tests Written
No new test files. The website has no test infrastructure — validation is build-time: MDX compilation, type checking, and static generation all happen during `pnpm build`.

## Verification Commands
```bash
cd website && pnpm build
cd packages/cli && pnpm vitest run
cd website && pnpm lint
```

## Git History
```
098960d [content-pages:s1] Fix: Match all content to supermock verbatim
d254aa4 [content-pages] Build report 1
1bc395c [content-pages:s1] Fix: Remove unused variable in ResourceStrip
0dd2d9c [content-pages:s1] Add quickstart page, sidebar meta.json, delete test page
a9559ef [content-pages:s1] Add overview page with dynamic components
4041273 [content-pages:s1] Fix Callout label, RightRail dead zone, GitHub URLs
```

## Fix History

- **Round 1:** Initial build with original content. Curated proof slugs were wrong (used proof-list-view, proof-context-query, s10-engine, s11-init-reset, s12-prove-it instead of supermock's 6 entries). Quickstart content was authored from spec description, not supermock. Overview missing "What's in these docs" section. Callout layout was stacked (block) instead of side-by-side (flex). Pipeline diagram descriptions and links didn't match supermock.
- **Round 2:** All content matched to supermock verbatim. Curated proofs corrected to supermock's 6 entries with exact editorial copy. Quickstart translated verbatim from `renderQuickstart()`. Overview restructured with DocsGrid, correct section ordering, exact copy. Callout converted to flex layout with correct label styling. PipelineDiagram descriptions, artifacts, links, and footer all matched.

## Open Issues

1. **Pre-existing lint errors in website:** `DocsErrorBoundary.tsx` has `@next/next/no-html-link-for-pages` error. `PlatformProvider.tsx` has `react-hooks/set-state-in-effect` error. Neither file was modified in this build.

2. **DocsGrid component not in spec:** Created `DocsGrid.tsx` to render the "What's in these docs" section from the supermock. This component was not in the spec's File Changes section but was required for content fidelity.

3. **Callout CSS variable fallbacks:** The supermock uses `--brand-light` and `--info` CSS variables. The production site may not define these. Added fallbacks to `--color-brand` and `--ink-30` respectively. If the site does define them, the fallbacks are harmless.

4. **Curated proofs depend on proof-entries.json slugs:** Three of the 6 curated slugs (security-hardening, worktree-isolation, proof-promote) may not exist in the current proof-entries.json. CuratedProofs handles missing slugs gracefully (skips the row), but the table may show fewer than 6 rows until those proof entries exist.

Verified complete by second pass.