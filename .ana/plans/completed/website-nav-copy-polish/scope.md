# Scope: Website nav, scroll targets, compat icons, and copy accuracy

**Created by:** Ana
**Date:** 2026-05-07

## Intent
Navigation links on the marketing site scroll to wrong positions (too much whitespace above content), Install buttons point to `/#pricing` instead of the npm package page, the compat sections use placeholder letter-circles instead of real brand icons, and the About/Contact pages contain inaccurate information (wrong city, false headcount claims). Fix all of it in one pass.

## Complexity Assessment
- **Kind:** fix + chore
- **Size:** medium
- **Files affected:**
  - `website/lib/copy.ts` — nav links, hero CTAs, pricing CTA hrefs, about copy, contact coda
  - `website/components/bento/Bento.tsx` — possibly move `id="pipeline"` or remove
  - `website/components/bento/tiles/AgentsTile.tsx` — scroll target anchor
  - `website/components/pricing/Pricing.tsx` — move `id="pricing"` to inner element
  - `website/components/marquee/CompatMarquee.tsx` — replace letter-circles with real SVG icons
  - `website/components/bento/tiles/CompatTile.tsx` — add icons to chips
  - `website/components/hero/Hero.tsx` — hero CTA href changes (driven by copy.ts)
  - `website/components/pricing/PriceCard.tsx` — install CTA href (driven by copy.ts)
- **Blast radius:** website only. No CLI code touched. All changes are in `website/`.
- **Estimated effort:** 2-3 hours
- **Multi-phase:** no

## Approach
All user-visible strings live in `lib/copy.ts` — most link target and copy changes are single-line edits there. Scroll position fixes require moving `id` attributes from outer `<section>` wrappers to inner elements closer to visible content, matching the pattern that already works for `#agents`. Brand icons are inline SVGs added to the marquee and bento compat tile components.

## Acceptance Criteria
- AC1: Navbar contains exactly three links: Agents, Pricing, Docs (Pipeline removed)
- AC2: Clicking "Agents" in navbar scrolls to the agents tile with the tile heading visible, not buried under whitespace
- AC3: Clicking "Pricing" in navbar scrolls to the pricing section with the pricing heading visible, not 116px of padding above it
- AC4: Navbar "Install" CTA button links to `https://www.npmjs.com/package/anatomia-cli` and opens in new tab
- AC5: Hero primary "Install" button links to npm package page, opens in new tab
- AC6: Hero secondary "See the pipeline" button scrolls to `#agents` location
- AC7: Pricing free-tier "Install" button links to npm package page, opens in new tab
- AC8: Footer product links remain (Pipeline, Agents, Pricing, Changelog) with targets matching the corrected anchors
- AC9: CompatMarquee displays real SVG brand icons for all 10 items (Claude Code, Cursor, Codex, Windsurf, Zed, GitHub Actions, pnpm, TypeScript, Rust, Python) instead of letter-circles
- AC10: CompatTile (bento) chips display matching brand icons alongside text
- AC11: About page title contains no headcount claims
- AC12: About page body contains no headcount claims and references Denver, not San Francisco
- AC13: Contact page coda says "Based in Denver" not "Based in San Francisco"
- AC14: Manifesto page unchanged
- AC15: License page unchanged
- AC16: Site builds without errors (`pnpm build` in website/)

## Edge Cases & Risks
- **SVG icon licensing** — most brand icons are available from official press kits or Simple Icons (CC0). AnaPlan should verify availability before committing to all 10.
- **Icon sizing in marquee** — current letter-circles are sized consistently. Real SVG icons have different aspect ratios (GitHub's octocat vs TypeScript's square). Need uniform visual weight, not uniform dimensions.
- **Scroll offset on mobile** — nav height may differ at mobile breakpoints. The existing `scroll-margin-top: 72px` rule applies to all `section[id]` — if the `id` moves to a non-section element (like a `div`), it won't inherit this rule. The new anchor elements need explicit scroll-margin-top.
- **npm link behavior** — Install buttons currently render as `<a>` tags via the Button component. The Button component already handles external links (`href.startsWith("http")` → `target="_blank"`), so pointing to the npm URL should work without component changes.
- **Footer "Pipeline" link** — Pipeline is removed from nav but kept in footer. The footer link still points to `/#pipeline`. Since Pipeline was removed from nav because the Agents anchor covers the same visual area, the footer Pipeline link should point to the same `#agents` anchor (or the bento section heading). AnaPlan should decide.

## Rejected Approaches
- **Adjusting scroll-margin-top per section** — would fix the symptom (wrong scroll position) but couples CSS values to padding values. Moving the `id` to inner elements is the same pattern that already works for `#agents`.
- **Adding Changelog as fourth nav link** — considered for social proof of project momentum, but three links is cleaner and the user confirmed three.
- **Image files in /public/icons/ instead of inline SVGs** — adds asset management overhead and extra HTTP requests for above-the-fold content. Inline SVGs are self-contained and faster.

## Open Questions
- About page title: what replaces "Two people. One *idea*."? AnaPlan should draft 2-3 options that sound confident without claiming team size.
- About page body[1] rewrite: keep the motivation sentence ("We built Anatomia because..."), rewrite the framing around it. AnaPlan drafts.

## Exploration Findings

### Patterns Discovered
- `lib/copy.ts` is the single source of truth for all user-visible strings — components import and render, never hardcode text
- `splitHeadline()` and `<Formatted>` handle `*emphasis*`, `**strong**`, `` `code` `` formatting in copy strings
- `Button` component auto-detects external links via `href.startsWith("http")` and adds `target="_blank"`

### Constraints Discovered
- [TYPE-VERIFIED] scroll-margin-top (globals.css:181) — `section[id] { scroll-margin-top: 72px; }` only targets `<section>` elements with `id`. Moving anchors to `<div>` elements requires adding scroll-margin-top to those elements.
- [TYPE-VERIFIED] spacing-section (globals.css:59) — `--spacing-section: 116px` is the top padding on both Bento and Pricing sections. This is the root cause of the "too much space above" scroll issue.
- [OBSERVED] agents anchor pattern — `id="agents"` is on the `AgentsTile` div inside the bento grid, not on the section wrapper. This is why it scrolls correctly.
- [OBSERVED] pipeline anchor pattern — `id="pipeline"` is on the outer `<section>` in `Bento.tsx`, which has 116px top padding. This is why it scrolls too high.

### Test Infrastructure
- No tests exist for the website. Build verification (`pnpm build`) is the acceptance gate.

## For AnaPlan

### Structural Analog
`website/components/bento/tiles/AgentsTile.tsx` — the `id="agents"` placement on an inner element is the exact pattern to replicate for fixing `#pricing` scroll position.

### Relevant Code Paths
- `website/lib/copy.ts` — all string/href changes (nav.links, hero.ctas, pricing.plans[0].cta, about.title, about.body, contact.coda)
- `website/components/bento/Bento.tsx:19` — `id="pipeline"` on outer section
- `website/components/bento/tiles/AgentsTile.tsx:8` — `id="agents"` on inner div (the good pattern)
- `website/components/pricing/Pricing.tsx:13` — `id="pricing"` on outer section
- `website/components/marquee/CompatMarquee.tsx:6-12` — `glyphColors` map + letter-circle rendering
- `website/components/bento/tiles/CompatTile.tsx:16-20` — plain text chip rendering
- `website/app/globals.css:181` — `section[id] { scroll-margin-top: 72px; }`

### Patterns to Follow
- Copy changes go in `copy.ts`, not in components
- Components render from `copy` object, never hardcode user-visible strings
- External links use `href.startsWith("http")` detection in Button component
- Inline styles use CSS custom properties (`var(--color-brand)`, etc.)

### Known Gotchas
- The `section[id]` CSS rule won't apply if the anchor `id` moves to a `<div>`. Explicitly add `scroll-margin-top: 72px` to new anchor elements.
- The CompatMarquee duplicates items for seamless CSS animation (`[...items, ...items]`). Icons must be lightweight enough to double without performance concern.
- Hero CTA buttons use raw `<a>` tags with inline Tailwind classes, not the `Button` component. The npm href change is in `copy.ts` but the `target="_blank"` behavior needs to be added to the hero's raw `<a>` tag since it doesn't use Button's auto-detection.

### Things to Investigate
- Footer "Pipeline" link target after Pipeline is removed from nav — should it point to `#agents`, to the bento section heading, or be removed?
- About page title and body[1] rewrite options — draft copy that uses "we" naturally, mentions Denver, claims no headcount, and sounds like a team that punches above its weight
