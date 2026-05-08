# Spec: Website nav, scroll targets, compat icons, and copy accuracy

**Created by:** AnaPlan
**Date:** 2026-05-07
**Scope:** .ana/plans/active/website-nav-copy-polish/scope.md

## Approach

All user-visible strings live in `website/lib/copy.ts`. Most changes are single-line edits there — nav links, CTA hrefs, about/contact copy. Three component-level changes accompany the copy edits:

1. **Scroll targets:** Move `id="pricing"` from the outer `<section>` in `Pricing.tsx` to an inner element, matching the pattern already used by `AgentsTile.tsx` where `id="agents"` sits on the tile `<div>`. Remove `id="pipeline"` from `Bento.tsx` entirely — Pipeline is removed from nav and the footer Pipeline link now points to `#agents`, so the anchor is dead infrastructure.

2. **Install CTAs as external links:** Hero uses raw `<a>` tags, not the `Button` component — changing the href to an npm URL in copy.ts isn't enough. The Hero `<a>` tags need `target="_blank"` and `rel="noopener noreferrer"` added. PriceCard uses the `Button` component which auto-detects external links, so that's copy.ts-only. Nav and NavMobile hardcode `/#pricing` on the Install CTA — these need to read from a new `copy.nav.ctaInstallHref` field.

3. **Brand icons:** Replace letter-circle glyphs with inline SVGs sourced from Simple Icons (CC0-licensed). A new shared `website/lib/icons.tsx` exports a map keyed by the item name strings already in `copy.marquee.items`. Both `CompatMarquee` and `CompatTile` import from this single source.

## Output Mockups

**Navbar (desktop):** Three links — Agents, Pricing, Docs. Install button links to npm (opens new tab).

**Hero CTAs:**
```
[● Install · npx anatomia init]     [See the pipeline →]
```
Primary "Install" opens npm in new tab. "See the pipeline" scrolls to `#agents`.

**Pricing free-tier CTA:** "Install" button opens npm in new tab.

**CompatMarquee items:**
```
[🔶] Claude Code  [■] Cursor  [◆] Codex  [▲] Windsurf  [⚡] Zed  [🐙] GitHub Actions  [📦] pnpm  [TS] TypeScript  [⚙] Rust  [🐍] Python
```
Each letter-circle replaced with the brand's actual SVG icon at 16×16.

**About page title:** `One *idea*. Shipped with proof.`

**About page body:**
```
Anatomia started with a simple observation: AI writes more code every month,
and almost none of it arrives with evidence. A diff, a confident summary, no
proof. We thought that was a solvable problem.

We're based in Denver and built Anatomia because we wanted to ship AI-written
code we could actually stand behind — not code we hoped was correct. The
pipeline exists to make that possible: four agents, four artifacts, mechanical
verification.

Everything is open source, MIT-licensed, and runs on your machine. We believe
the best way to earn trust is to make the proof readable.
```

**Contact coda:** `Based in Denver.` (was `Based in San Francisco.`)

## File Changes

### `website/lib/copy.ts` (modify)
**What changes:** Nav links array drops "Pipeline" entry (3 links remain: Agents, Pricing, Docs). New `ctaInstallHref` field added to `nav` section pointing to npm URL. Hero primary CTA href changes from `#pricing` to npm URL. Hero secondary CTA href changes from `#pipeline` to `#agents`. Pricing free-tier CTA href changes from `/#pricing` to npm URL. Footer Pipeline link href changes from `/#pipeline` to `/#agents`. About title, about body[0], about body[1], and contact coda updated.
**Pattern to follow:** Existing copy.ts structure — all values are string literals in a single `as const` object.
**Why:** All user-visible text and link targets are data-driven from this file. Editing components directly would violate the single-source-of-truth pattern.

### `website/lib/icons.tsx` (create)
**What changes:** New file exporting a `brandIcons` map — `Record<string, JSX.Element>` keyed by the exact strings in `copy.marquee.items`. Each value is an inline `<svg>` element using the Simple Icons path data for that brand. All SVGs use a consistent `viewBox="0 0 24 24"` and render at `width`/`height` passed by the consuming component (defaults to 16). Export a single `BrandIcon` component that takes `name` and optional `size` props.
**Pattern to follow:** Existing component style in `website/components/ui/` — named exports, TypeScript, no default exports.
**Why:** Two components need the same icons. A shared source prevents drift and keeps SVG paths out of component files.

### `website/components/marquee/CompatMarquee.tsx` (modify)
**What changes:** Replace the letter-circle `<span>` glyph with `<BrandIcon>` from `lib/icons.tsx`. Remove the `glyphColors` map — brand colors are encoded in the SVG icons themselves. The `.glyph` CSS class stays for layout (16×16 container, flex centering) but no longer sets `background` or `color`.
**Pattern to follow:** The existing component structure — import from lib, render in the `doubled` loop.
**Why:** Letter-circles are placeholder glyphs. Real brand icons are the design intent.

### `website/components/bento/tiles/CompatTile.tsx` (modify)
**What changes:** Add `<BrandIcon>` next to each chip's text label. The chip `<span>` gains a flex layout with a small icon (14px) before the text. Only chips whose name exists in the `brandIcons` map get an icon — the catch chip ("+ any markdown-aware tool") stays text-only.
**Pattern to follow:** Existing chip rendering pattern in the same file.
**Why:** Compat chips should visually match the marquee icons for consistency.

### `website/components/bento/Bento.tsx` (modify)
**What changes:** Remove `id="pipeline"` from the outer `<section>` element. The section keeps its `data-component="bento"` attribute and `className`.
**Pattern to follow:** N/A — this is a removal.
**Why:** Pipeline is removed from nav. The footer Pipeline link now points to `#agents`. No code references `#pipeline` anymore, so the anchor is dead infrastructure.

### `website/components/pricing/Pricing.tsx` (modify)
**What changes:** Remove `id="pricing"` from the outer `<section>`. Add `id="pricing"` and `style={{ scrollMarginTop: 72 }}` to the `<div className={styles.inner}>` element that wraps the pricing heading. This inner element is inside the `<div className={styles.frame}>`, directly wrapping the eyebrow + heading + blurb.
**Pattern to follow:** `AgentsTile.tsx` line 8 — `id="agents"` placed on the inner `<div>`, not the section wrapper. This is why agents scrolls correctly (no 116px padding above).
**Why:** The outer section has `--spacing-section: 116px` top padding. Anchoring to it puts 116px of whitespace above the fold. Anchoring to the inner heading element scrolls to the content.

### `website/components/hero/Hero.tsx` (modify)
**What changes:** Add `target="_blank"` and `rel="noopener noreferrer"` to the primary CTA `<a>` tag (the "Install" button). The href itself comes from `copy.hero.ctas.primary.href` which is changed in copy.ts.
**Pattern to follow:** The GitHub link `<a>` tag at Nav.tsx line 88-98 — same `target="_blank" rel="noopener noreferrer"` pattern.
**Why:** Hero uses raw `<a>` tags, not the Button component. Button auto-detects external links via `href.startsWith("http")`, but raw `<a>` tags don't. Without explicit `target="_blank"`, clicking Install navigates away from the site.

### `website/components/nav/Nav.tsx` (modify)
**What changes:** Change the Install CTA `<Link>` (line 101) to an `<a>` tag with `href={copy.nav.ctaInstallHref}`, `target="_blank"`, `rel="noopener noreferrer"`. Remove the `Link` import if no other usage remains (but the wordmark and nav links still use `Link`, so the import stays).
**Pattern to follow:** The GitHub `<a>` tag at lines 88-98 in the same file.
**Why:** The CTA currently uses Next.js `<Link>` pointing to `/#pricing`. An external npm URL requires a plain `<a>` with `target="_blank"`.

### `website/components/nav/NavMobile.tsx` (modify)
**What changes:** Change the bottom Install CTA `<Link>` (line 98) to an `<a>` tag with `href={copy.nav.ctaInstallHref}`, `target="_blank"`, `rel="noopener noreferrer"`. Add `onClick={close}` to dismiss the overlay. Remove the `Link` import only if nothing else uses it (but the wordmark and nav links still use `Link`, so the import stays).
**Pattern to follow:** Same pattern as Nav.tsx change above.
**Why:** Same reason — external link needs `<a>`, not `<Link>`.

## Acceptance Criteria

- [x] AC1: Navbar contains exactly three links: Agents, Pricing, Docs (Pipeline removed)
- [ ] AC2: Clicking "Agents" in navbar scrolls to the agents tile with the tile heading visible, not buried under whitespace
- [ ] AC3: Clicking "Pricing" in navbar scrolls to the pricing section with the pricing heading visible, not 116px of padding above it
- [ ] AC4: Navbar "Install" CTA button links to `https://www.npmjs.com/package/anatomia-cli` and opens in new tab
- [ ] AC5: Hero primary "Install" button links to npm package page, opens in new tab
- [ ] AC6: Hero secondary "See the pipeline" button scrolls to `#agents` location
- [ ] AC7: Pricing free-tier "Install" button links to npm package page, opens in new tab
- [ ] AC8: Footer product links remain (Pipeline, Agents, Pricing, Changelog) with targets matching the corrected anchors
- [ ] AC9: CompatMarquee displays real SVG brand icons for all 10 items instead of letter-circles
- [ ] AC10: CompatTile (bento) chips display matching brand icons alongside text
- [ ] AC11: About page title contains no headcount claims
- [ ] AC12: About page body contains no headcount claims and references Denver, not San Francisco
- [ ] AC13: Contact page coda says "Based in Denver" not "Based in San Francisco"
- [ ] AC14: Manifesto page unchanged
- [ ] AC15: License page unchanged
- [ ] AC16: Site builds without errors (`pnpm build` in website/)
- [ ] AC17: No TypeScript errors (`pnpm tsc --noEmit` in website/)

## Testing Strategy

- **Unit tests:** No website tests exist. This scope doesn't introduce a test framework — build verification is the acceptance gate.
- **Build verification:** `cd website && pnpm build` must complete without errors. This is the primary gate.
- **Type checking:** `cd website && pnpm tsc --noEmit` must pass — catches broken imports, mistyped copy fields, missing icon keys.
- **Manual checks:** The builder should note which pages to visually verify: home page (nav, hero CTAs, marquee, bento compat tile, pricing CTA, footer), about page, contact page.

## Dependencies

- Simple Icons SVG path data for 10 brands. All are CC0/MIT-licensed and freely available at simpleicons.org. The builder should source paths from the Simple Icons npm package or the SVG files directly.

## Constraints

- No new npm dependencies. Icon SVG paths are inlined, not imported from a package.
- All copy changes stay in `copy.ts`. No hardcoded strings in components.
- The `as const` assertion on the copy object must be preserved — it drives type inference for all consumers.

## Gotchas

- **`section[id]` CSS rule:** `globals.css` line 181 applies `scroll-margin-top: 72px` only to `<section>` elements with an `id`. When moving `id="pricing"` to a `<div>`, you must add inline `scrollMarginTop: 72` or the scroll offset will be wrong.
- **Hero uses raw `<a>` tags:** The Button component handles external link detection automatically, but the Hero CTAs are handcrafted `<a>` tags with inline Tailwind classes. If you change the href to an external URL without adding `target="_blank"`, clicking Install navigates away from the site.
- **CompatMarquee doubles items:** The track renders `[...items, ...items]` for CSS animation. Icon components will be instantiated 20 times (10 items × 2). Inline SVGs are lightweight — this is fine. Don't use icon components that fetch or lazy-load.
- **Nav CTA is a `<Link>` not `<a>`:** Both `Nav.tsx` (line 101) and `NavMobile.tsx` (line 98) use Next.js `<Link>` for the Install CTA. External URLs need plain `<a>` tags — `<Link>` is for internal routing.
- **`copy.nav.ctaInstallHref` is new:** This field doesn't exist yet. The builder must add it to the nav section of copy.ts. Both Nav.tsx and NavMobile.tsx reference it. Type inference from `as const` will catch typos automatically.
- **About body is a 3-element array:** `copy.about.body` is `[string, string, string]`. The rewrite changes body[0] and body[1] but keeps body[2] unchanged. Don't collapse to fewer elements — consumers may index by position.

## Build Brief

### Rules That Apply
- All user-visible strings live in `copy.ts` — components import and render, never hardcode text.
- Named exports only, no default exports.
- TypeScript with explicit return types on exported functions.
- Website is a Next.js app with `@/` path alias for imports.
- Inline styles use CSS custom properties (`var(--color-brand)`, etc.).
- No new npm dependencies for the website.

### Pattern Extracts

**AgentsTile.tsx — correct anchor placement (the pattern to replicate for Pricing):**
```tsx
// website/components/bento/tiles/AgentsTile.tsx:7-8
export function AgentsTile() {
  return (
    <div id="agents" className={`${styles.tile} ${styles.tAgents}`}>
```

**Nav.tsx — external link pattern (the pattern for Install CTA):**
```tsx
// website/components/nav/Nav.tsx:88-98
<a
  href={copy.nav.githubUrl}
  target="_blank"
  rel="noopener noreferrer"
  className="relative flex h-[34px] w-[34px] items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-150 after:absolute after:inset-[-5px] after:content-['']"
  style={{ color: "var(--ink-60)" }}
  aria-label="GitHub"
>
```

**Button.tsx — external detection (why PriceCard needs no component change):**
```tsx
// website/components/ui/Button.tsx:51-52
const isExternal = external || href.startsWith("http");
if (isExternal) {
```

**CompatMarquee.tsx — current glyph rendering (what to replace):**
```tsx
// website/components/marquee/CompatMarquee.tsx:30-39
<span key={i} className={styles.item}>
  <span
    className={styles.glyph}
    style={colors ? { background: colors.bg, color: colors.color } : undefined}
  >
    {name.charAt(0)}
  </span>
  {name}
</span>
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands
- After copy.ts changes: `cd website && pnpm tsc --noEmit` — Expected: no errors
- After all changes: `cd website && pnpm build` — Expected: clean build, all pages listed
- Lint: `cd website && pnpm lint` (if configured)

### Build Baseline
- Current website build: passes (all 11 pages render as static content)
- No test suite for website — build verification only
- After build: same 11 pages, no new pages, no removed pages
- Regression focus: home page (all sections), about page, contact page
