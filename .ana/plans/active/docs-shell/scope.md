# Scope: Docs Shell (Layout + Shared Components)

**Created by:** Ana
**Date:** 2026-05-12

## Intent

Build the complete docs UI shell — navbar, sidebar, right rail, layout grid, and all shared content components. Replace the Scope 1 placeholder layout with the production docs interface matching the supermock pixel-for-pixel. After this scope, every subsequent scope (content pages, dynamic pages, search) just fills in content. The shell IS the visual foundation.

This is the most visual scope. The PR preview will be compared side by side against the supermock served at `anatomia_reference/docs-research/supermock/`.

## Complexity Assessment

- **Kind:** feature
- **Size:** large — ~20 new component files, 1 layout rewrite, 1 CSS file, 1 page tree transformer, plus wiring
- **Files affected:**
  - `website/app/docs/layout.tsx` (rewrite)
  - `website/lib/source.ts` (add page tree transformer)
  - `website/components/docs/layout/` (5 new: DocsNav, Sidebar, RightRail, Breadcrumb, PlatformSwitcher)
  - `website/components/docs/content/` (6 new: CodeBlock, Callout, NextCards, MetaRow, StatsStrip, ForPlatform)
  - `website/components/docs/providers/` (1 new: PlatformProvider)
  - `website/app/docs/docs.css` or similar (1 new: docs-specific CSS patterns)
  - `website/content/docs/index.mdx` (update: exercise components in test page)
  - `website/source.config.ts` (possible: add lastReviewed/readingTime to frontmatter schema)
- **Blast radius:** Only the `/docs` route tree. Marketing site is completely isolated — different layout, different nav, different footer. The root layout (`app/layout.tsx`) is untouched.
- **Estimated effort:** 6-8 hours implementation + verification
- **Multi-phase:** no

## Approach

Replace the Scope 1 placeholder layout with a three-column docs shell: sticky sidebar (left), scrollable content (center), sticky right rail (right). Build a docs-specific navbar that is completely separate from the marketing nav. Wire the sidebar to the Fumadocs page tree with a transformer that injects Reference and Proof Chain sections for non-MDX routes. Build all shared content components that every subsequent content page will use. Build responsive — the grid collapses at two breakpoints.

The supermock (`anatomia_reference/docs-research/supermock/`) is the pixel-level visual spec. Serve it with `npx serve` and build to match.

## Acceptance Criteria

- AC1: The docs layout renders a three-column grid: sidebar (248px fixed) + content (flexible) + right rail (220px fixed). The layout is visually consistent with the supermock.
- AC2: DocsNav renders with anaDocs wordmark (Fraunces serif + oxblood mark), dynamic version pill from `getBuildMeta()`, PlatformSwitcher, SearchTrigger placeholder, ThemeToggle, GitHub icon link, and "anatomia" external link. Sticky with backdrop-blur.
- AC3: The sidebar renders all five groups from the Fumadocs page tree: Get Started, Concepts, Guides, Reference, Proof Chain. Active state highlights the current page. The "Featured proofs" toggle collapses/expands. The sidebar is sticky and independently scrollable.
- AC4: The page tree transformer in `lib/source.ts` injects Reference entries (CLI commands, Agent templates, Skill files, Context files) and Proof Chain entries (Browse all + featured proofs) into the Fumadocs page tree using the `transformers` API with `root(node)`. NOT `attachFolder` (doesn't exist in fumadocs-core 16.x).
- AC5: The right rail renders a TOC with scroll spy (IntersectionObserver tracks visible headings), "Ask AI about this page" links section (static placeholders), and a footer showing generated date, commit SHA, and "Edit on GitHub" link from build meta data.
- AC6: PlatformSwitcher renders in the navbar as a dropdown. Claude Code is the active selection. Five other platforms (Cursor, Codex, Windsurf, Copilot, Cline) show as disabled with "soon" labels. The dropdown opens/closes on click and closes on outside click.
- AC7: PlatformProvider wraps the docs layout with React Context. ForPlatform component conditionally renders children based on the active platform. Platform selection persists via cookie.
- AC8: CodeBlock renders with a header (language label + title), CopyButton (client component using Clipboard API), and styled code body. Visually matches the supermock's `.code` pattern.
- AC9: Callout renders in two variants: "rule" (brand-colored left border) and "note" (info-colored left border). Matches the supermock's `.callout` pattern.
- AC10: NextCards renders a two-column grid of navigation cards at the bottom of content pages. Each card has an eyebrow label, title, and description. Matches the supermock's `.next-grid` pattern.
- AC11: MetaRow renders reading time and last-reviewed date in a mono-font row below the page title. Matches the supermock's `.meta-row` pattern.
- AC12: Breadcrumb renders the page's position in the tree (e.g., Docs > Concepts > Pipeline) using data from the Fumadocs page tree.
- AC13: StatsStrip renders a horizontal row of labeled metrics. Matches the supermock's `.home-stats` pattern (used on overview page, but the component is shared).
- AC14: Responsive layout collapses correctly: at <=1180px the right rail hides and the grid becomes two-column; at <=880px the sidebar also hides and the grid becomes single-column.
- AC15: `pnpm build` succeeds with all new components. The test MDX page at `/docs` renders inside the full shell layout.
- AC16: The existing marketing site at `/`, `/about`, `/cli`, etc. is completely unaffected by these changes.
- AC17: Theme toggle in the docs navbar uses the existing `useTheme()` hook and `ThemeToggle` component. Dark/light themes work correctly with all new components using the existing design tokens from `globals.css`.

## Edge Cases & Risks

- **Fumadocs page tree API surface:** The transformer uses `root(node)` to mutate the page tree. The node shape (`type: 'page'`, `type: 'separator'`) must match what fumadocs-core 16.x expects. Scope 1 confirmed `attachFolder` doesn't exist — the `transformers` array with `root()` is the correct approach. Plan should verify the exact node type definitions by reading fumadocs-core source or types.
- **Theme token alignment:** The supermock defines its own CSS variables (`--ink`, `--ink-80`, `--bg-card`, etc.) that partially overlap with the existing site tokens (`--fg`, `--ink-60`, `--bg-card`). The existing globals.css already has most of these. The docs components should use the existing Tailwind theme tokens where they exist and only add new ones if genuinely missing. Don't duplicate.
- **Scroll spy edge cases:** TOC scroll spy with IntersectionObserver needs to handle pages with few headings (entire page visible = first heading active), pages with no headings (right rail TOC section hidden), and fast scrolling.
- **Cookie for platform:** The `ForPlatform` component reads platform from context, which reads from a cookie. On first visit (no cookie), it defaults to "claude-code". Server rendering should handle the no-cookie case gracefully without hydration mismatch — the PlatformProvider should read the cookie on the client and default to "claude-code" for the server snapshot.
- **SearchTrigger is a placeholder:** The button renders and shows "Search docs, commands, proofs..." with the Cmd+K hint, but clicking it does nothing in this scope. Search wiring is Scope 6. The empty overlay from the supermock should NOT be built — just the trigger button in the navbar.
- **Right rail collapse on proof explorer:** The right rail should hide (and grid should become two-column) when the route is `/docs/proof` (the explorer page). Since the explorer page doesn't exist yet, this behavior should be designed into the layout but can't be tested until Scope 5. Plan should note the mechanism (conditional rendering or CSS) but it doesn't need a test page.
- **Code syntax highlighting:** The CodeBlock component needs a syntax highlighting solution. The supermock uses manual `<span class="tk-k">` tokens. Production should use a real highlighter. Fumadocs has built-in Shiki support via `rehype-code` — Plan should investigate whether to use that (configured in `source.config.ts` rehype plugins) or a standalone Shiki component. The Shiki approach is more standard and gives server-side highlighting for free.

## Rejected Approaches

- **Reuse marketing Nav component:** The docs navbar is fundamentally different — anaDocs wordmark instead of Anatomia logo, platform switcher, search bar, no marketing links. Wrapping or extending the marketing Nav would create a confusing conditional component. Clean separation is better.
- **CSS Modules per component:** The supermock has ~40 CSS classes that map to components. CSS modules would give 1:1 parity but the site uses Tailwind v4 everywhere. Mixing paradigms creates maintenance burden. Use Tailwind utilities for most styling, with a small `docs.css` file for the handful of patterns that are awkward in Tailwind (TOC timeline dots, scrollbar behavior, sidebar active state transitions).
- **Multi-phase spec (layout → components → interactivity):** Components are tightly coupled to the layout. The sidebar can't be tested without the sidebar component. The right rail can't be verified without the TOC. A single spec with a well-organized contract (layout assertions → component assertions → interaction assertions) is cleaner.
- **Defer responsive to a later scope:** Responsive is ~10% more effort now and prevents a refactor later. The supermock has the breakpoints defined. Build it once correctly.
- **Defer PlatformSwitcher:** It's a visible supermock element. The side-by-side preview comparison will show the gap. Build the component and provider now, even though multi-platform content doesn't exist yet.

## Open Questions

None — all design decisions are locked in the handoff documents. Plan should verify:
1. The exact fumadocs-core `PageTreeNode` type definitions for the transformer (what fields are required on `type: 'page'` and `type: 'separator'` nodes).
2. Whether Shiki syntax highlighting should be configured via fumadocs rehype plugin or as a standalone component.

## Exploration Findings

### Patterns Discovered

- `website/app/layout.tsx` (lines 42-66): Root layout sets font CSS variables, theme bootstrap script, analytics. Docs layout nests inside this — no conflict.
- `website/components/nav/ThemeToggle.tsx` (full file): Reusable client component using `useTheme()` from `lib/theme.ts`. Uses `useSyncExternalStore` with localStorage key `"anatomia-theme"`. Can be imported directly into DocsNav.
- `website/lib/icons.tsx` (lines 1-60): `BrandIcon` component with all 6 platform SVG icons. Can be imported directly into PlatformSwitcher.
- `website/lib/theme.ts` (full file): Theme hook with cross-tab sync. Storage key is `"anatomia-theme"`. The supermock uses `"ana-docs-theme"` — production should use the existing key for consistency across marketing and docs.
- `website/app/globals.css` (lines 24-131): Design tokens already defined: `--bg`, `--bg-card`, `--bg-elev`, `--border`, `--hairline`, `--ink-60`, etc. Both light and dark themes. The supermock tokens overlap heavily — most are already available.
- `website/lib/docs-data/meta.ts`: `getBuildMeta()` returns `{ version, commitSha, buildTimestamp }`. Used by DocsNav (version pill) and RightRail (footer).
- `website/lib/source.ts` (lines 1-7): Current source loader with no transformer. Needs `pageTree.transformers` array added.
- `website/source.config.ts` (lines 1-17): Frontmatter schema has `description` only. May need `lastReviewed` and `readingTime` fields for MetaRow.

### Constraints Discovered

- [TYPE-VERIFIED] fumadocs-core 16.x API (Scope 1 learnings) — `attachFolder` does not exist. Must use `transformers: [{ root(node) { ... } }]` in the loader config.
- [OBSERVED] Theme storage key — existing site uses `"anatomia-theme"`, supermock uses `"ana-docs-theme"`. Use the existing key.
- [OBSERVED] Tailwind v4 — site uses `@theme` directive in globals.css for token generation. New docs tokens (if any) should follow this pattern.
- [OBSERVED] Font variables — `--font-geist-sans`, `--font-geist-mono`, `--font-fraunces` set by next/font/local in `app/fonts.ts`. The `@theme` layer aliases these to `--font-sans`, `--font-mono`, `--font-serif`.
- [INFERRED] Supermock nav height is 58px (`--nav-h: 58px`). The marketing nav uses 72px (`scroll-padding-top: 72px`). Docs nav should match the supermock height.

### Test Infrastructure

- No existing docs component tests. Scope 1 used smoke tests (`pnpm build` succeeds, page renders). Same approach here — build success + visual verification against supermock.

## For AnaPlan

### Structural Analog

`website/components/nav/Nav.tsx` — the marketing navbar. Same structural shape (sticky header, logo, links, theme toggle) but completely different content. Shows how the existing site builds navbars with Tailwind. Also `website/app/(marketing)/layout.tsx` for how the marketing layout wraps children with Nav + Footer.

### Relevant Code Paths

- `website/app/docs/layout.tsx` — current placeholder layout (rewrite target)
- `website/lib/source.ts` — Fumadocs source loader (add transformer here)
- `website/source.config.ts` — Fumadocs collection config (may need frontmatter schema additions)
- `website/app/docs/[[...slug]]/page.tsx` — catch-all page (needs to pass page data to layout for breadcrumb/TOC)
- `website/components/nav/ThemeToggle.tsx` — reusable theme toggle (import into DocsNav)
- `website/lib/icons.tsx` — BrandIcon component (import into PlatformSwitcher)
- `website/lib/theme.ts` — useTheme hook (used by ThemeToggle)
- `website/lib/docs-data/meta.ts` — getBuildMeta() for version pill and right rail footer
- `website/app/globals.css` — design tokens (verify coverage before adding docs-specific tokens)

### Patterns to Follow

- `website/components/nav/ThemeToggle.tsx` — how client components are structured (explicit "use client", clean hook usage)
- `website/app/(marketing)/layout.tsx` — how layouts compose (Nav + children + Footer pattern)
- `website/app/globals.css` lines 24-61 — how design tokens are declared via `@theme`

### Known Gotchas

- The supermock's `--ink-80` and `--ink-40` don't have exact matches in globals.css (which uses `--ink-75` and `--ink-45`). These are close enough — use the existing tokens, don't add new near-duplicate tokens. Map `--ink-80` → `text-ink-75`, `--ink-40` → `text-ink-45`.
- The supermock uses `data-theme="dark"` as default. The existing site uses `data-theme="light"` as the HTML default (with a bootstrap script that may flip to dark). The docs shell inherits from the root layout — no conflict, but the supermock's visual spec is dark-theme-first. Verify both themes.
- The catch-all page (`[[...slug]]/page.tsx`) currently wraps content in `<article className="prose ...">`. The prose styling needs to come from the docs CSS, not from Tailwind's `@tailwindcss/typography` prose classes. The supermock has very specific prose styling (font sizes, colors, spacing).
- `source.config.ts` uses `frontmatterSchema` from `fumadocs-mdx/config`. The `frontmatterSchema.extend()` call adds fields. If `lastReviewed` and `readingTime` are added, ALL existing MDX files need to either have these fields or they need to be `z.optional()`.

### Things to Investigate

1. Fumadocs `PageTreeNode` type — what's the exact interface for injected `type: 'page'` and `type: 'separator'` nodes? Does `type: 'page'` require an `id` field, a `slug` field, or just `name` and `url`?
2. Syntax highlighting strategy — should CodeBlock use fumadocs' built-in Shiki via rehype plugin (configured in `source.config.ts`), or render with a standalone Shiki transformer? The rehype approach handles MDX code fences automatically; the component approach gives more control over the chrome (header, copy button, language label).
3. The supermock's right rail TOC has a vertical timeline with dots. Is this achievable with Tailwind utilities or does it need custom CSS? The pattern: `::before` pseudo-element for the vertical line, `li::before` for the dots, `.active::before` for the filled dot with box-shadow.
