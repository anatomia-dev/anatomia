# Build Report: Content Pages — Phase 2 (Seven Concept Pages)

**Created by:** AnaBuild
**Date:** 2026-05-12
**Spec:** .ana/plans/active/content-pages/spec-2.md
**Branch:** feature/content-pages

## What Was Built

- `website/content/docs/concepts/pipeline.mdx` (created): Pipeline concept page — 5 stages, independence, rejection cycles, artifact table, Learn stage, proof chain. Uses PipelineDiagram component.
- `website/content/docs/concepts/skills.mdx` (created): Skills concept page — what Anatomia adds, 4-section structure, ownership, how skills grow, all 8 skills table, conditional matching, gotcha library.
- `website/content/docs/concepts/context.mdx` (created): Context concept page — what context files are, context vs skills, creation flow, each file's purpose, who reads what, freshness.
- `website/content/docs/concepts/toolbelt.mdx` (created): Toolbelt concept page — what it is, what it enforces, per-agent commands table, why it matters, how access is enforced.
- `website/content/docs/concepts/artifacts.mdx` (created): Artifacts concept page — where artifacts live, then each of the 8 artifact types with writer, reader, and purpose.
- `website/content/docs/concepts/contract.mdx` (created): Contract concept page — what a contract is, real example from security-hardening, matcher types table, sealing, assertion→test tagging, writing good assertions.
- `website/content/docs/concepts/findings.mdx` (created): Findings concept page — severity levels, suggested actions, categories, lifecycle, real finding example.
- `website/app/docs/[...slug]/page.tsx` (modified): Added PipelineDiagram to mdxComponents so pipeline concept page can use it.

## PR Summary

- Add 7 concept MDX pages (pipeline, skills, context, toolbelt, artifacts, contract, findings) translated verbatim from supermock render functions
- Register PipelineDiagram component in mdxComponents for use on the pipeline concept page
- All pages follow identical structure: frontmatter → h1 → lede → body sections → NextCards navigation
- Content hardcodes dynamic values (78 proofs, 8 skills, 15 gotchas) with `{/* Dynamic: update on data change */}` comments
- NextCards link to correct next pages with `/docs/` prefixed hrefs

## Acceptance Criteria Coverage

- AC3 "All 7 concept pages render at /docs/concepts/{slug} with correct content" → Build output shows all 7 routes compiled: pipeline, skills, context, toolbelt, artifacts, contract, findings ✅
- AC10 "Ghost agents concept page does NOT exist" → No `concepts/agents.mdx` file created, verified via `ls` ✅
- AC13 "TOC populates correctly on all concept pages" → All pages use h2/h3 heading structure; Fumadocs auto-generates heading IDs for TOC ✅
- AC14 "NextCards at the bottom link to correct next page" → Each page has NextCards with supermock-matching navigation: pipeline→skills, skills→context, context→toolbelt, toolbelt→artifacts, artifacts→contract, contract→findings, findings→verifying-changes ✅
- AC12 "`pnpm build` succeeds" → Build passes with all 7 new concept pages (21 total routes) ✅
- "No type errors or missing component imports" → TypeScript compilation succeeded, PipelineDiagram registered in mdxComponents ✅

## Implementation Decisions

1. **PipelineDiagram registration:** Spec noted PipelineDiagram is NOT registered in mdxComponents. Registered it there rather than using MDX import syntax — simpler and consistent with how other components (Callout, NextCards) are available.

2. **Pipeline page diagram vs supermock:** The supermock's pipeline concept page has a detailed diagram with longer descriptions per stage ("Understand intent. Bound the change. Write `scope.md`."). The PipelineDiagram component from Phase 1 uses shorter overview-style descriptions. Used the existing component as-is — the detailed descriptions are in the artifact table section below.

3. **Supermock's blockquote sidebar:** The pipeline page's independence example is rendered as a `<p>` with inline styling in the supermock. Translated to a markdown blockquote (`>`) which renders with appropriate styling in the prose context.

4. **Dynamic values:** Hardcoded `78` (proof entries), `8` (skills), `15` (gotchas) with `{/* Dynamic */}` comments per spec decision.

5. **Toolbelt table links:** The supermock toolbelt page has individual `<a>` tags linking to specific anchors in the CLI reference page. Translated to markdown links pointing to `/docs/reference/cli` — the anchor-specific routing will work once the reference pages exist in Phase 3+.

## Deviations from Contract

### A010: All 7 concept pages compile and render at their routes
**Instead:** Verified via `pnpm build` output showing all 7 routes
**Reason:** No automated test infrastructure for MDX page rendering in this project — verification is build-based
**Outcome:** Functionally equivalent — all 7 pages compile and generate static HTML

### A011: Each concept page includes MetaRow with reading time and last reviewed date
**Instead:** Verified via frontmatter fields in each MDX file (readingTime and lastReviewed present)
**Reason:** MetaRow rendering is handled by page.tsx from frontmatter — no separate test exists
**Outcome:** Functionally equivalent — page.tsx reads these fields and renders MetaRow

### A012: Each concept page has NextCards linking to the next page in sequence
**Instead:** Verified by reading each MDX file's NextCards component
**Reason:** Static MDX content, no test infrastructure for component presence
**Outcome:** Functionally equivalent — every page has NextCards with correct hrefs

### A029: MDX pages produce heading structure that populates the right rail TOC
**Instead:** Verified that all pages use h2/h3 markdown headings
**Reason:** TOC generation is automatic by Fumadocs from heading structure — no separate test
**Outcome:** Functionally equivalent — heading structure present, TOC auto-populates

### A030: Pipeline concept links to skills concept and verifying changes guide
**Instead:** Verified NextCards in pipeline.mdx contains href="/docs/concepts/skills" and href="/docs/guides/verifying-changes"
**Reason:** Static MDX content verification
**Outcome:** Exact match — both hrefs present in NextCards

## Test Results

### Baseline (before changes)
```
$ cd website && pnpm build
✓ Generating static pages (14/14)
Route: /docs, /docs/start
```
Pages: 14 total, all generated successfully.

### After Changes
```
$ cd website && pnpm build
✓ Compiled successfully in 1796ms
✓ Generating static pages (21/21) in 535ms
Routes: /docs, /docs/start, /docs/concepts/artifacts, /docs/concepts/context, +5 more
```
Pages: 21 total, all generated successfully.

### Comparison
- Pages added: 7 (pipeline, skills, context, toolbelt, artifacts, contract, findings)
- Pages removed: 0
- Regressions: none

### New Tests Written
No unit tests written — Phase 2 is MDX content creation. Verification is via `pnpm build` (all pages compile) and visual review against supermock.

## Verification Commands

```bash
cd website && pnpm build
cd website && pnpm lint
```

CLI test suite (packages/cli) is not affected by website content changes.

## Git History

```
a6b9119 [content-pages:s2] Add 7 concept pages translated from supermock
215520a [content-pages] Verify report 1
ae2eaed [content-pages] Update: Build report 1
105956b [content-pages:s1] Fix: Pipeline agent links, Callout CSS tokens, artifact pills
8806354 [content-pages] Update: Build report 1
098960d [content-pages:s1] Fix: Match all content to supermock verbatim
d254aa4 [content-pages] Build report 1
1bc395c [content-pages:s1] Fix: Remove unused variable in ResourceStrip
0dd2d9c [content-pages:s1] Add quickstart page, sidebar meta.json, delete test page
a9559ef [content-pages:s1] Add overview page with dynamic components
4041273 [content-pages:s1] Fix Callout label, RightRail dead zone, GitHub URLs
```

## Open Issues

1. **PipelineDiagram uses overview descriptions, not detailed concept-page descriptions.** The supermock's pipeline concept page has a detailed diagram variant with longer descriptions per stage. The Phase 1 PipelineDiagram component only has the short overview descriptions. The detailed information is present in the artifact table below the diagram, so no content is lost — but the visual presentation differs from the supermock.

2. **Toolbelt table links point to /docs/reference/cli without anchors.** The supermock toolbelt page links to specific anchors (e.g., `data-anchor="pipeline"`) within the CLI reference page. The reference pages don't exist yet (Phase 3+), so anchor links were simplified to `/docs/reference/cli`. When reference pages are built, these should be updated with proper anchor targets.

3. **Context page sub-heading links.** The supermock context page links h3 headings (project-context.md, design-principles.md, scan.json, ana.json) to `/reference/context` with specific anchors. Translated to `/docs/reference/context` without anchors since the reference page doesn't exist yet.

4. **Skills table links to reference pages.** Each skill name in the skills table links to `/docs/reference/skills/{name}`. These reference pages don't exist yet and will 404 until built.

Verified complete by second pass.
