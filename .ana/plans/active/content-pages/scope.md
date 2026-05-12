# Scope: Content Pages

**Created by:** Ana
**Date:** 2026-05-12

## Intent
Ship all 16 editorial content pages for anaDocs: the overview (custom page.tsx), quickstart (MDX), 7 concept pages (MDX with locked copy from the supermock), and 6 guide pages (MDX with rewritten copy from the supermock session). Fix three Scope 3 bugs that affect every page render: responsive breakpoint dead zone (D15), GitHub URL wrong org (D20), and Callout missing label text (D19). After this scope, every editorial page on the docs site is live with correct sidebar navigation, TOC, and dynamic values from data loaders.

## Complexity Assessment
- **Kind:** feature
- **Size:** large — 16 pages, 5 new components, 3 bug fixes, meta.json files for sidebar ordering
- **Files affected:**
  - `website/app/docs/page.tsx` (new — overview custom page)
  - `website/content/docs/index.mdx` (delete — Scope 1 test artifact)
  - `website/content/docs/start.mdx` (new — quickstart)
  - `website/content/docs/meta.json` (new — root sidebar ordering)
  - `website/content/docs/concepts/*.mdx` (7 new files)
  - `website/content/docs/concepts/meta.json` (new)
  - `website/content/docs/guides/*.mdx` (6 new files)
  - `website/content/docs/guides/meta.json` (new)
  - `website/components/docs/content/Callout.tsx` (fix — add label text)
  - `website/components/docs/layout/RightRail.tsx` (fix — remove Tailwind hidden/xl:block)
  - `website/components/docs/layout/DocsNav.tsx` (fix — TettoLabs org)
  - `website/app/docs/[[...slug]]/page.tsx` (fix — TettoLabs org in editUrl)
  - `website/components/docs/content/PipelineDiagram.tsx` (new)
  - `website/components/docs/content/AudienceCards.tsx` (new)
  - `website/components/docs/content/CuratedProofs.tsx` (new)
  - `website/components/docs/content/ResourceStrip.tsx` (new)
  - `website/components/docs/content/TroubleCard.tsx` (new)
  - `website/lib/docs-data/proofs.ts` (extend — add computed helpers if needed for median timing, curated proof lookup)
- **Blast radius:** Scope 5 (Dynamic pages) uses the same layout, components, and data loaders. Changes to page.tsx editUrl and DocsNav affect all docs pages. Callout fix affects all future MDX pages that use `<Callout>`. Sidebar ordering via meta.json determines the 5-group structure that persists through remaining scopes.
- **Estimated effort:** Large — 3 phases. Phase 1 (overview + quickstart + bug fixes + meta.json): ~45 min. Phase 2 (7 concept pages): ~40 min. Phase 3 (6 guide pages): ~40 min.
- **Multi-phase:** yes — three phases with natural boundaries

## Approach
Three phases, each independently verifiable against the supermock:

**Phase 1 — Overview, quickstart, bug fixes, sidebar structure.** The overview is a custom `app/docs/page.tsx` (not MDX) because it has unique layout: stats strip with dynamic values, pipeline diagram, audience cards, curated proof table, resource strip. Five new server components built for the overview. Quickstart is the first real MDX page. Bug fixes (D15, D19, D20) land here so every subsequent page renders correctly. Meta.json files establish the 5-group sidebar (Get Started, Concepts, Guides are from MDX folders; Reference and Proof Chain are injected by the transformer from Scope 3). Delete the Scope 1 test `index.mdx`.

**Phase 2 — Seven concept pages.** Locked copy ported from supermock render functions. Pipeline, Skills, Context, Toolbelt, Artifacts, Contract, Findings. Each page is MDX with the shared components (Callout, CodeBlock, NextCards, MetaRow). Dynamic values wired from data loaders where they exist. Ghost `agents` concept page is NOT created — removed by omission (the content was merged into the pipeline page in the supermock).

**Phase 3 — Six guide pages.** Rewritten copy from the supermock session. Using ana-setup, Verifying changes, Reading a proof, Using ana-learn, Configurability, Troubleshooting. The troubleshooting page needs TroubleCard component for the card-based layout. Dynamic values wired from data loaders. `help@anatomia.dev` ships as-is — the email will be set up before Scope 6.

**Dynamic values strategy:** Use existing data loaders (`getProofStats`, `getProofEntries`, `getAgentTemplates`, `getCommands`, `getSkillTemplates`, `getBuildMeta`). Where a value needs computation from existing data (e.g., median timing from proof entries, curated proof lookup by slug), add computed helper functions in `lib/docs-data/` — not new extraction. Values that genuinely cannot be derived from current data (e.g., enriched rule counts, active finding stats) are flagged in MDX comments and left hardcoded for now, to be resolved when the extraction script is next extended.

## Acceptance Criteria
- AC1: Overview page renders at `/docs` with stats strip showing dynamic values (proof count, agent count, command count, skill count), pipeline diagram, audience cards, curated proof table with dynamic assertion/finding counts, and resource strip
- AC2: Quickstart page renders at `/docs/start` with correct MDX content matching supermock, including callouts, code blocks, and next cards
- AC3: All 7 concept pages render at `/docs/concepts/{slug}` with correct content matching the supermock, including MetaRow with reading time and last reviewed date
- AC4: All 6 guide pages render at `/docs/guides/{slug}` with correct content matching the supermock, including the troubleshooting page's card-based layout
- AC5: Sidebar shows 5 groups in correct order: Get Started, Concepts, Guides, Reference, Proof Chain — with correct page ordering within each group
- AC6: Callout component renders "Rule" or "Note" label text in mono uppercase before the content, matching the supermock's `.ci` styling
- AC7: RightRail is visible at viewports >1180px without a dead zone — CSS media query is the sole visibility controller
- AC8: All GitHub URLs in DocsNav and page.tsx point to `TettoLabs/anatomia`, not `anatomia-dev/anatomia`
- AC9: Dynamic values (proof counts, rejection counts, command counts, skill counts, agent counts) come from data loaders, not hardcoded strings
- AC10: Ghost agents concept page does NOT exist — no `/docs/concepts/agents` route
- AC11: The Scope 1 test page (`content/docs/index.mdx`) is deleted and does not render
- AC12: `pnpm build` succeeds with all 16 pages compiling without errors
- AC13: TOC (right rail) populates correctly on all content pages from heading structure
- AC14: NextCards at the bottom of each page link to the correct next page, matching the supermock's navigation flow

## Edge Cases & Risks
- **Overview page as page.tsx vs MDX:** The overview uses `app/docs/page.tsx` which is a route-level file, not the catch-all. Fumadocs catch-all `[[...slug]]` matches empty slugs too. Need to verify that `app/docs/page.tsx` takes precedence over `[[...slug]]` with no slug for Next.js routing.
- **RightRail in overview page:** Since RightRail renders in `[[...slug]]/page.tsx`, the custom `app/docs/page.tsx` must render its own RightRail (or explicitly not render one if the overview doesn't need it). The supermock overview does have a TOC.
- **Callout in MDX:** The Callout component uses `variant` prop but MDX content should use `<Callout variant="rule">` or `<Callout variant="note">`. Verify the supermock's usage maps correctly — supermock uses `callout('note', text)` which becomes `<Callout variant="note">text</Callout>`.
- **Dynamic values that don't exist yet:** Some supermock values (median timing, enriched rule counts, active finding severity breakdown) may not be derivable from current data loaders. Plan should audit each page against DYNAMIC_LOADING_REQUIREMENTS.md and decide which values get computed helpers vs which stay hardcoded with a comment.
- **meta.json ordering:** Fumadocs uses `meta.json` for sidebar ordering. The ordering must match the supermock: Overview first, then Get Started > Concepts > Guides. Within each: the order from the supermock sidebar.
- **Large MDX pages:** Some guide pages (configurability, troubleshooting, using-ana-setup) are very long with complex inline-styled HTML in the supermock. These need to be translated to Tailwind + component composition, not copy-pasted HTML.
- **Code blocks with terminal styling:** The supermock uses `<span class="tk-f">`, `<span class="tk-c">`, etc. for syntax highlighting in terminal output. Production uses Fumadocs rehype-code. Terminal-style blocks may need a different approach — either a `terminal` language hint or raw HTML spans.
- **Curated proof table:** The overview has 6 curated proof slugs with editorial descriptions. The slugs are static (curated selection) but assertion counts, finding counts, stage tags, and dates should be dynamic from proof data. If a slug doesn't exist in proof_chain.json, the row should handle that gracefully.
- **Breadcrumb generation:** The catch-all page has a `buildBreadcrumb` function that capitalizes slug segments. Concept and guide pages should produce correct breadcrumbs: Docs > Concepts > The Pipeline, Docs > Guides > Troubleshooting, etc.

## Rejected Approaches
- **Single phase:** Rejected because overview + quickstart (5 new components, custom page, bug fixes) is fundamentally different work from MDX content porting (volume, repetitive, same pattern per page). Three phases with clear boundaries let each one be verified independently.
- **Expanding the extraction script:** Rejected for this scope. Values that need new extraction (enriched rule counts, active finding stats, design principles text) require changes to `scripts/extract-docs-data.ts` and new JSON outputs. That's a scope boundary violation — flag for Plan, keep this scope focused on content pages.
- **Creating all MDX pages first, components second:** Rejected because the overview page can't render without its unique components. Components first, then the pages that use them.
- **Fixing D14 (transformer URLs) in this scope:** Rejected. The transformer URLs (`/docs/reference/cli-commands` etc.) are dead links until Scope 5 creates those route handlers. Fixing the transformer here creates churn — Scope 5 will address the URL mismatch when the reference pages exist.
- **Fixing D17/D18 (sidebar chevrons, wordmark size) in this scope:** Rejected. Visual polish that doesn't block content rendering. Address in a post-Scope 6 polish pass or during PR preview comparison.

## Open Questions
- What approach for terminal-styled code blocks? Supermock uses custom span classes (`tk-f`, `tk-c`, `tk-k`, `tk-s`) for colored terminal output. Options: (a) use a custom `terminal` language with rehype-code, (b) use raw HTML in MDX, (c) use a TerminalBlock component. Plan should investigate what Fumadocs rehype-code supports.
- Does Fumadocs handle `app/docs/page.tsx` coexisting with `app/docs/[[...slug]]/page.tsx`? The overview page is a direct route; the catch-all handles everything else. This is standard Next.js routing (explicit routes take precedence) but worth confirming in the Fumadocs context.

## Exploration Findings

### Patterns Discovered
- `website/app/docs/[[...slug]]/page.tsx`: The catch-all pattern — fetches page from source, renders MDX with components, builds breadcrumb, renders RightRail with TOC. This is the structural template for how all MDX pages work.
- `website/components/docs/content/`: All shared content components (Callout, CodeBlock, NextCards, MetaRow, StatsStrip, ForPlatform, CopyButton). The component inventory for MDX.
- `website/lib/docs-data/`: All data loaders with caching pattern (read JSON, cache in module-level variable). Template for any new computed helpers.
- Supermock `renderConceptPage()` (pages.js line 286): Wrapper that adds breadcrumb, title, lede, meta-row, body, and next cards. This maps directly to the MDX page structure with frontmatter.

### Constraints Discovered
- [TYPE-VERIFIED] Frontmatter schema (source.config.ts) — requires `title` (string) and `description` (string); optional `readingTime` (number) and `lastReviewed` (string). All MDX pages must include title and description.
- [TYPE-VERIFIED] RightRail renders in page component not layout (layout.tsx line 15 comment, page.tsx line 57-63) — the custom overview page.tsx must handle its own RightRail rendering.
- [OBSERVED] GitHub org is TettoLabs (9 references in marketing site) not anatomia-dev (2 references in docs, both bugs).
- [OBSERVED] Callout component has variant styles for rule/note but no label rendering (Callout.tsx lines 21-36).
- [OBSERVED] RightRail has dual visibility control — Tailwind `hidden xl:block` AND CSS `@media (max-width: 1180px)` with `!important` — creating a 1181-1279px dead zone.

### Test Infrastructure
- `pnpm build` is the primary verification — MDX compilation, type checking, route generation all happen at build time.
- Vercel preview deployments provide visual validation against the supermock.

## For AnaPlan

### Structural Analog
`website/app/docs/[[...slug]]/page.tsx` — the catch-all page component is the structural analog for the custom overview page.tsx. Both fetch data, render components, and handle RightRail. The overview adds page-specific components and data fetching from multiple loaders.

For MDX content pages, the existing `content/docs/index.mdx` is the structural analog — frontmatter + MDX content + component imports. Every concept and guide page follows this pattern.

### Relevant Code Paths
- `website/app/docs/layout.tsx` — docs layout shell (DocsNav, Sidebar, ErrorBoundary, PlatformProvider)
- `website/app/docs/[[...slug]]/page.tsx` — catch-all MDX page renderer with breadcrumb, MetaRow, RightRail
- `website/components/docs/content/` — shared content components (Callout, CodeBlock, NextCards, MetaRow, StatsStrip, ForPlatform)
- `website/components/docs/layout/RightRail.tsx` — right rail with scroll spy TOC (bug fix target)
- `website/components/docs/layout/DocsNav.tsx` — docs navbar (bug fix target)
- `website/lib/docs-data/` — all data loader modules (proofs, agents, commands, skills, gotchas, context, meta)
- `website/source.config.ts` — Fumadocs MDX config with Zod frontmatter schema
- `website/lib/source.ts` — Fumadocs source loader
- `website/app/docs/docs.css` — docs-specific CSS including responsive breakpoints
- Supermock `pages.js` — all 15 render functions that are the source of truth for content

### Patterns to Follow
- Data loader caching pattern in `website/lib/docs-data/proofs.ts` — read JSON, cache in module variable, export typed functions
- Component prop pattern in `website/components/docs/content/StatsStrip.tsx` — server component, typed props, CSS custom properties for theming
- MDX component registration in `[[...slug]]/page.tsx` lines 14-20 — the `mdxComponents` object maps component names to React components for use in MDX

### Known Gotchas
- The supermock uses inline `style` attributes extensively for one-off layouts (hero grids, PASS/FAIL cards, preserved/refreshed cards, audience cards). Production should use Tailwind utilities or component props, not inline styles.
- The supermock's `code()` helper (pages.js) wraps code in `<div class="code">` with optional header. Production uses the `CodeBlock` component via the `pre` MDX override. Code blocks in MDX are just fenced code blocks, not component calls.
- The supermock's `callout()` helper returns raw HTML. In MDX, callouts are `<Callout variant="rule">children</Callout>`. The children are MDX content, not HTML strings.
- The supermock's `nextCards()` helper takes an array of `{route, label, title, desc}`. Production `NextCards` takes `cards` prop with `{eyebrow, title, href, description}`. The field names differ — `route` becomes `href` (prefixed with `/docs/`), `label` becomes `eyebrow`.
- Terminal-styled code blocks in the supermock use `<span>` elements for coloring. Fumadocs rehype-code handles syntax highlighting for standard languages but terminal output with custom coloring needs investigation.
- The overview page's curated proof table has hardcoded editorial descriptions per proof. The descriptions are static (intentionally curated); the numeric data (assertions, findings, stage) should be dynamic.

### Things to Investigate
- How to handle the overview page's RightRail — does it show a TOC (the supermock overview has section headings) or is it hidden? If it shows TOC, the custom page.tsx needs to build the TOC items manually since it's not an MDX page with automatic heading extraction.
- Terminal code block styling strategy — what Fumadocs rehype-code supports for non-standard language hints, and whether a custom component or raw HTML is the cleaner approach.
- Sidebar ordering with meta.json — verify Fumadocs documentation for the exact format (array of slugs? object with title and pages?). The page tree transformer from Scope 3 injects Reference and Proof Chain groups — confirm these still appear correctly after meta.json is added to the MDX folders.
