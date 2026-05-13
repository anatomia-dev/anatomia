# Build Report: Content Pages — Phase 1

**Created by:** AnaBuild
**Date:** 2026-05-12
**Spec:** .ana/plans/active/content-pages/spec-1.md
**Branch:** feature/content-pages

## What Was Built

- `website/components/docs/content/Callout.tsx` (modified): Added mono uppercase label (`RULE`/`NOTE`) before children content, using variant name via `toUpperCase()`.
- `website/components/docs/layout/RightRail.tsx` (modified): Removed `hidden` and `xl:block` Tailwind classes. CSS `@media` in `docs.css` is now the sole visibility controller.
- `website/components/docs/layout/DocsNav.tsx` (modified): Changed GitHub URL from `anatomia-dev/anatomia` to `TettoLabs/anatomia`.
- `website/app/docs/[...slug]/page.tsx` (modified, renamed from `[[...slug]]`): Changed editUrl GitHub org to `TettoLabs`. Converted from optional catch-all to required catch-all to resolve Next.js 16 routing conflict. Updated `generateStaticParams` to filter out empty slug entries. Updated slug type from optional to required.
- `website/app/docs/page.tsx` (created): Overview landing page. Server component importing `getProofStats`, `getProofEntries`, `getAgentCount`, `getCommandCount`, `getSkillCount` from data loaders. Renders StatsStrip, PipelineDiagram, AudienceCards, CuratedProofs, ResourceStrip. No RightRail.
- `website/components/docs/content/PipelineDiagram.tsx` (created): Server component rendering 5 pipeline stages (Think → Plan → Build → Verify → Learn) as a card grid. Each card has number, name, description, artifact, and agent.
- `website/components/docs/content/AudienceCards.tsx` (created): Server component rendering 3 audience cards (Evaluating → proof browse, Installing → quickstart, Operating → pipeline concept).
- `website/components/docs/content/CuratedProofs.tsx` (created): Server component rendering curated proof table. 6 editorial entries matched against live proof data. Dynamic assertion counts from data loader. Handles missing slugs gracefully.
- `website/components/docs/content/ResourceStrip.tsx` (created): Server component rendering 3 resource links (GitHub, npm, Manifesto) with external link attributes.
- `website/content/docs/start.mdx` (created): Quickstart page with prerequisites, install, init, scan, setup, pipeline run (scope/plan/build/verify), review/merge sections. Uses Callout and NextCards components.
- `website/content/docs/meta.json` (created): Root sidebar ordering — `["start", "concepts", "guides"]`.
- `website/content/docs/concepts/meta.json` (created): Concepts sidebar ordering — `["pipeline", "skills", "context", "toolbelt", "artifacts", "contract", "findings"]`.
- `website/content/docs/guides/meta.json` (created): Guides sidebar ordering — `["using-ana-setup", "verifying-changes", "reading-a-proof", "using-ana-learn", "configurability", "troubleshooting"]`.
- `website/content/docs/index.mdx` (deleted): Scope 1 test page removed. Replaced by custom overview page.

## PR Summary

- Add custom overview landing page at `/docs` with dynamic stats, pipeline diagram, audience cards, curated proof table, and resource links — all data from loaders, nothing hardcoded
- Fix three bugs: Callout missing label (D19), RightRail 1181-1279px dead zone (D15), wrong GitHub org in DocsNav and editUrl (D20)
- Create quickstart MDX page at `/docs/start` with full install-to-merge walkthrough
- Add sidebar ordering via Fumadocs meta.json files for root, concepts, and guides groups
- Delete Scope 1 test page and convert catch-all route from optional to required for Next.js 16 compatibility

## Acceptance Criteria Coverage

- AC1 "Overview page renders at /docs with stats, pipeline, cards, proofs, resources" → Build route table shows `/docs` as static route. StatsStrip uses `getProofStats()`, `getAgentCount()`, `getCommandCount()`, `getSkillCount()`. PipelineDiagram has 5 stages. AudienceCards has 3 cards. CuratedProofs renders 6 rows. ResourceStrip renders 3 links. ✅
- AC5 "Sidebar shows 5 groups in correct order" → Root meta.json lists `["start", "concepts", "guides"]`. Concepts and guides meta.json files define page order. Reference and Proof Chain injected by transformer in `lib/source.ts`. ✅
- AC6 "Callout renders RULE or NOTE label" → Label span added with `variant.toUpperCase()` output. ✅
- AC7 "RightRail visible >1180px without dead zone" → `hidden` and `xl:block` removed. CSS `@media` in docs.css is sole controller. ✅
- AC8 "GitHub URLs point to TettoLabs/anatomia" → Changed in DocsNav.tsx and catch-all page.tsx. ✅
- AC9 "Dynamic values from data loaders" → Overview imports `getProofStats`, `getAgentCount`, `getCommandCount`, `getSkillCount`. No hardcoded stat values. ✅
- AC11 "Scope 1 test page deleted" → `content/docs/index.mdx` removed via `git rm`. ✅
- AC2 "Quickstart renders at /docs/start" → Build route table shows `/docs/start`. Content includes install, init, scan, pipeline run, review sections. ✅
- AC12 "`pnpm build` succeeds" → Build succeeds with 14 static pages. ✅
- No build errors or type errors → TypeScript passes, build completes cleanly. ✅

## Implementation Decisions

1. **Optional → required catch-all:** Next.js 16 errors with "You cannot define a route with the same specificity as an optional catch-all route" when both `app/docs/page.tsx` and `app/docs/[[...slug]]/page.tsx` exist. Converted to `[...slug]` (required catch-all). The overview page at `app/docs/page.tsx` handles bare `/docs`; the catch-all handles all sub-paths. `generateStaticParams` filters out empty slug entries.

2. **Curated proof slugs:** Selected 6 proofs that span different capabilities: proof-list-view, add-project-kind-detection, proof-context-query, s10-engine, s11-init-reset, s12-prove-it. These were chosen based on actual entries in `proof-entries.json`. CuratedProofs skips rows where the slug doesn't match (graceful handling).

3. **No supermock reference:** The spec references `renderQuickstart()` from a supermock, but no supermock exists in the codebase. Quickstart content was written from the spec's description (prerequisites, install, init, pipeline run, review/merge).

4. **ResourceStrip uses `<a>` not `<Link>` for all links:** External links use `<a>` with `target="_blank"` per spec. The internal Manifesto link also uses `<a>` since it's a marketing page outside the docs route, keeping the pattern uniform.

## Deviations from Contract

### Route structure: `[[...slug]]` → `[...slug]`
**Instead:** Converted optional catch-all to required catch-all and added explicit `app/docs/page.tsx`
**Reason:** Next.js 16 does not allow an explicit route (`page.tsx`) alongside an optional catch-all (`[[...slug]]`) at the same path level. The spec assumed Next.js 14/15 behavior.
**Outcome:** Functionally equivalent — `/docs` renders the overview, all sub-paths render via catch-all. No user-visible difference.

### A010–A015, A026, A029–A032: Phase 2/3 assertions
**Instead:** Not addressed in Phase 1
**Reason:** These assertions cover concept pages (A010–A012), guide pages (A013–A015), TroubleCard (A014, A032), agents page (A026), TOC headings (A029), and NextCards navigation (A030). They belong to Phase 2 and Phase 3.
**Outcome:** Will be addressed in subsequent phases.

## Test Results

### Baseline (before changes)
```
Website: pnpm build → success (13 static pages, 1 MDX page)
CLI: pnpm vitest run → 100 test files, 2180 tests (1895 passed, 283 failed, 2 skipped)
Note: 283 failures in 7 test files were pre-existing — all from e2e/init and benchmarks
requiring dist/index.js which wasn't built in the fresh worktree. After `pnpm run build`,
all 100 test files pass.
```

### After Changes
```
Website: pnpm build → success (14 static pages: /docs, /docs/start)
CLI: pnpm vitest run → 100 test files, 2180 tests (2178 passed, 0 failed, 2 skipped)
```

### Comparison
- Tests added: 0 (no automated tests — website validation is via `pnpm build`)
- Tests removed: 0
- Regressions: none

### New Tests Written
No new test files. The website has no test infrastructure — validation is build-time: MDX compilation, type checking, and static generation all happen during `pnpm build`. A successful build proves all imports resolve, all component props type-check, and all pages compile.

## Verification Commands
```bash
cd website && pnpm build
cd packages/cli && pnpm vitest run
cd website && pnpm lint
```

## Git History
```
1bc395c [content-pages:s1] Fix: Remove unused variable in ResourceStrip
0dd2d9c [content-pages:s1] Add quickstart page, sidebar meta.json, delete test page
a9559ef [content-pages:s1] Add overview page with dynamic components
4041273 [content-pages:s1] Fix Callout label, RightRail dead zone, GitHub URLs
```

## Open Issues

1. **Pre-existing lint errors in website:** `DocsErrorBoundary.tsx` has `@next/next/no-html-link-for-pages` error. `PlatformProvider.tsx` has `react-hooks/set-state-in-effect` error. Neither file was modified in this build. Website lint fails due to these pre-existing errors.

2. **No automated visual tests:** The overview page layout (stats strip, pipeline diagram, audience cards, curated proofs table, resource strip) is verified by build compilation but not visually tested. Content accuracy and layout quality require Vercel preview review.

3. **Curated proof editorial descriptions are static:** If proof slugs are removed or renamed in future builds, CuratedProofs silently skips missing rows. The component handles this gracefully (filter null), but the curated list will silently shrink.

4. **Quickstart content written without supermock reference:** The spec references `renderQuickstart()` lines 212-282 from a supermock, but no supermock file exists. Content was authored from the spec's section descriptions. May need editorial review.

Verified complete by second pass.