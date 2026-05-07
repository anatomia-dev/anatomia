# Spec: Website Direct Polish

**Created by:** AnaPlan
**Date:** 2026-05-07
**Scope:** .ana/plans/active/website-direct-polish/scope.md

## Approach

Fix 12 visual and copy regressions found during post-merge review. Every change matches the locked handoff HTML — no design interpretation, just parity. Changes are grouped by file to minimize diff surface.

The fixes fall into three categories:
1. **CSS property changes** (Fixes 1–3, 5–6, 8, 12) — removing/changing values in CSS modules and globals.css
2. **Copy string edits** (Fixes 7, 10, 15) — direct changes in copy.ts
3. **Markup tweaks** (Fixes 4, 9, 12) — className adjustments in TSX and prose edits in MAINTENANCE_MANUAL.md

Fix 6 (footer bonding) is the most architecturally interesting: it requires a `:has()` rule in globals.css that crosses component boundaries (proof-feed section → footer). The proof-feed already uses `:has(.card[data-open])` in its own CSS module, so this pattern is established.

Fix 11 (hero left margin) is intentionally excluded. The scope flagged it as "may not be a real issue" — container max-width, padding, and centering already match the handoff. No change unless a measurable difference exists at 1440px, which code inspection doesn't support.

## Output Mockups

No user-facing CLI output. All changes are visual — verified by building the site and comparing against the handoff HTML.

**Pricing frame (Fix 1):** The frame section currently has a 1px `border-soft` border and `border-radius: var(--radius-md)`. After: no border, no border-radius. The TetrisSnake canvas is the only visible frame. Content (eyebrow, h2, blurb) centers instead of left-aligning.

**Footer commit pill (Fix 5):** Currently renders as a pill shape with `border: 1px solid var(--border-soft)`, `padding: 3px 10px`, `borderRadius: 999px`. After: plain text span with no border, no padding, no border-radius — just the same font styling as surrounding text.

**Proof feed headTitle (Fix 7):** Currently: `"Every commit has *receipts*.\nClick one."` → After: `"Every commit has *receipts*."`

**Proof feed headSub (Fix 7):** Currently describes rows as links to contracts. After: describes rows as a display of the verification record — no link/click language since rows were delinked in Scope B.

**Hero headline (Fix 15):** Currently: `"Your AI doesn't know your codebase. *Ana* does."` → After: `"Your AI doesn't know your codebase. *ana* does."`

## File Changes

### `website/components/pricing/pricing.module.css` (modify)
**What changes:** Four property groups in the pricing CSS module:
- `.frame` — remove `border` and `border-radius` properties. Keep `overflow: hidden` (prevents TetrisSnake canvas from overflowing). Change `padding: 48px` to `padding: 40px 64px`.
- `.top` — add `text-align: center` so the inner content (eyebrow, h2, blurb) centers.
- `.grid` — change `gap: 18px` to `gap: 14px`. Change breakpoint from `720px` to `820px`.
- `.card` — add responsive padding: `padding: 40px` at `min-width: 1024px`.

Additionally, add a mobile breakpoint for `.frame`: at `max-width: 720px`, set `padding: 28px 20px`.

**Pattern to follow:** The existing `.card` block in the same file — it already has base padding and could use the same `@media` pattern for responsive overrides.
**Why:** The static CSS border competes with the TetrisSnake canvas that IS the frame. Left-aligned pricing content doesn't match the handoff's centered layout.

### `website/components/pricing/Pricing.tsx` (modify)
**What changes:** Add `max-width: 18ch` to the h2's className or inline style. The h2 currently has clamp font size and tracking but no max-width constraint. The blurb `<p>` already has `maxWidth: "52ch"` as an inline style — follow that pattern and add `maxWidth: "18ch"` to the h2's inline style.
**Pattern to follow:** The blurb `<p>` on line 26 that already uses `style={{ maxWidth: "52ch" }}`.
**Why:** Without the max-width, the pricing headline runs wide and doesn't match the handoff's compact centered layout.

### `website/components/footer/Footer.tsx` (modify)
**What changes:** Three changes:
1. **Tagline `<em>` letter-spacing (Fix 4):** Add `letterSpacing: "-0.02em"` to the `<em>` element's inline style object (line 48–52). It already has `color`, `fontVariationSettings`, and `fontWeight` — add one more property.
2. **Commit pill de-styling (Fix 5):** The `latest &&` block (lines 110–124) renders a `<span>` with pill styling: `padding`, `border`, `borderRadius`, and a `className="rounded-full"`. Strip all of that — make it a plain `<span>` with just the font styling inherited from its parent (`font-mono text-[11.5px]`, `color: var(--ink-45)`). Keep the inner `<span>` elements and text content unchanged.
3. **Footer margin-top (Fix 6):** Remove `mt-10` from the footer's className (line 18). The margin will now come from a CSS rule in globals.css so the `:has()` override can work. The className becomes `"border-t pt-15 pb-9"`.

**Pattern to follow:** The existing inline style pattern on the `<em>` element for Fix 4. For Fix 5, the `<span>{copy.footer.legal}</span>` on line 108 is the structural analog — plain text, no decoration.
**Why:** Fix 4 matches the handoff's letter-spacing on the serif italic. Fix 5 removes residual pill styling that survived from Scope A after Scope B delinked the commit element. Fix 6 enables the `:has()` bonding rule — Tailwind's `mt-10` utility beats regular CSS in specificity, so the margin must come from a regular CSS rule that the `:has()` override can naturally beat.

### `website/app/globals.css` (modify)
**What changes:** Add two rules in the UTILITIES section (after the existing `.hairline-top` rule, before the Nav CTA comment block):

1. `footer { margin-top: 40px; }` — replaces the Tailwind `mt-10` removed from Footer.tsx. 40px = Tailwind's spacing-10.
2. A `:has()` bonding rule: when the proof-feed section's card is collapsed (`data-open="false"`), the adjacent footer gets `margin-top: 0`, making them sit flush. The selector: `section[data-component="proof-feed"]:has([data-open="false"]) + footer { margin-top: 0; }`. This works because ProofFeed renders outside `<main>` as a direct sibling before `<Footer />` in the marketing layout.

**Pattern to follow:** The existing `:has()` rules in `proof-feed.module.css` (lines 12–19) that use the same `data-open` attribute for state-dependent styling.
**Why:** When the proof feed is collapsed, it visually sits on top of the footer (same background tint). A 40px gap between them breaks the "drawer face on footer" effect. The `:has()` rule removes the gap only when collapsed, preserving it when expanded.

### `website/lib/copy.ts` (modify)
**What changes:** Three string edits:
1. **proofFeed.headTitle (Fix 7):** Change `"Every commit has *receipts*.\nClick one."` to `"Every commit has *receipts*."` — remove the newline and "Click one." since rows are no longer clickable.
2. **proofFeed.headSub (Fix 7):** Replace the current text that describes rows as linking to contracts. New text should describe the rows as a display of verification records — each row shows the contract assertions, the pass/fail result, and the verifier's independent account. No click/link language. Keep similar length and tone.
   Current: `"This isn't a changelog. Each row links to the contract Plan wrote before the work began, with Verify's independent account stapled to it. The claims, the matchers, the pass/fail — all there."`
   New: `"This isn't a changelog. Each row is the verification record — the contract Plan wrote before the work began, with Verify's independent account stapled to it. The claims, the matchers, the pass/fail — all there."`
   (Only change: "links to" → "is" — removes link implication while preserving the sentence structure and meaning.)
3. **hero.headline (Fix 15):** Change `"Your AI doesn't know your codebase. *Ana* does."` to `"Your AI doesn't know your codebase. *ana* does."` — lowercase `ana` matches the handoff and the brand's typographic convention (brand is always lowercase in body text).

**Pattern to follow:** Existing strings in copy.ts — same format conventions, same `*emphasis*` markers.
**Why:** Stale copy that references removed interactivity (clicking rows) and uses wrong capitalization.

### `website/components/bento/bento.module.css` (modify)
**What changes:** Add a hover override for `.tCompat`: `.tCompat:hover { border-color: transparent; }`. The base `.tile:hover` rule (line 61) sets `border-color: var(--border)` on hover, which flashes a visible border on the inverted compat tile. The compat tile already has `border-color: transparent` at rest (line 121) — this just ensures hover doesn't override it.
**Pattern to follow:** The existing `.cardHighlighted:hover { border-color: transparent; }` in `pricing.module.css` (line 52) — same pattern of preventing hover border flash on inverted tiles.
**Why:** The border flash is a visual regression — the handoff has no border flash on the compat tile.

### `website/MAINTENANCE_MANUAL.md` (modify)
**What changes:** Fix all three `(sub)` references to reflect the current route structure:
1. **Architecture tree (lines 19–21):** Replace the `(sub)` block with `(app)` as an empty platform stub. Move docs/manifesto/contact under `(marketing)` alongside the existing landing page. The tree should show all 9 pages (landing, about, changelog, cli, contact, docs, examples, license, manifesto) under `(marketing)/`. Show `(app)/` with just `README.md` and a comment like "Platform boundary (empty — future)".
2. **How to Add a New Page (line 171):** Change `(sub)` to `(marketing)`. Remove the SubNav mention — all pages now use the `(marketing)` layout with Nav + Footer. The step becomes: "All pages go in `(marketing)/`."
3. **File naming table (line 311):** Change `app/(sub)/layout.tsx` to `app/(marketing)/layout.tsx`.

Delete any references to SubNav — the SubNav concept was removed when `(sub)` was deleted.

**Pattern to follow:** The existing `(marketing)` references already in the manual (lines 16–17, 181–186).
**Why:** Stale documentation that references a deleted route group. A stranger reading this manual would create pages in a nonexistent directory.

### `website/components/nav/Nav.tsx` (modify)
**What changes:** The GitHub link button (line 92) has `h-11 w-11` (44×44px visual). Change to `h-[34px] w-[34px]` for 34px visual size. Add `relative` to the className. Add `after:absolute after:inset-[-5px] after:content-['']` for the 44px touch target pseudo-element.
**Pattern to follow:** No existing pattern in the codebase — this is a new technique. The pseudo-element extends the tap area by 5px on each side (34 + 10 = 44px effective touch target) without affecting visual layout.
**Why:** The nav is taller than designed because the icon buttons are 44px visual. 34px visual with 44px touch target matches the handoff while preserving WCAG accessibility.

### `website/components/nav/ThemeToggle.tsx` (modify)
**What changes:** Same as Nav.tsx — change the button's `h-11 w-11` to `h-[34px] w-[34px]`, add `relative`, add `after:absolute after:inset-[-5px] after:content-['']`.
**Pattern to follow:** Same technique as Nav.tsx GitHub button.
**Why:** Consistent icon button sizing across the nav.

### `website/components/nav/NavMobile.tsx` (modify)
**What changes:** Two icon buttons need the same treatment:
1. The hamburger button (line 21): `h-11 w-11` → `h-[34px] w-[34px]` + `relative` + `after:absolute after:inset-[-5px] after:content-['']`.
2. The close button in the overlay header (line 59): same change.

The close button inside the overlay content (line 58–66 area) — same treatment.
**Pattern to follow:** Same technique as Nav.tsx and ThemeToggle.tsx.
**Why:** Consistent icon button sizing. The hamburger is visible on mobile; the close button appears in the overlay.

## Acceptance Criteria

- [ ] AC1: Pricing frame has NO static CSS border — the TetrisSnake canvas is the only visible border
- [ ] AC2: Pricing frame content (eyebrow, h2, blurb) is centered, not left-aligned
- [ ] AC3: Pricing h2 has `max-width: 18ch`
- [ ] AC4: Pricing frame padding is `40px 64px` (desktop), `28px 20px` (mobile ≤720px)
- [ ] AC5: Pricing grid gap is `14px`, two-column breakpoint at `820px`
- [ ] AC6: Price cards have `padding: 40px` at `min-width: 1024px`
- [ ] AC7: Footer tagline `<em>` has `letter-spacing: -0.02em`
- [ ] AC8: Footer commit pill is plain text — no visible border, no padding, no pill shape
- [ ] AC9: Collapsed proof feed sits flush against footer — zero gap when `data-open="false"`
- [ ] AC10: Footer `mt-10` class replaced with CSS `margin-top: 40px` that the `:has()` rule can override
- [ ] AC11: Proof feed headTitle is `"Every commit has *receipts*."` — no "Click one."
- [ ] AC12: Proof feed headSub describes rows as display, not as links
- [ ] AC13: tCompat tile hover does NOT flash a border (`.tCompat:hover { border-color: transparent; }`)
- [ ] AC14: MAINTENANCE_MANUAL.md references `(marketing)` route group for all pages, `(app)` as empty stub, no `(sub)` references, no SubNav references
- [ ] AC15: Hero headline uses lowercase `*ana*` not `*Ana*`
- [ ] AC16: Nav icon buttons are 34px visually with 44px touch targets via pseudo-element
- [ ] AC17: `pnpm --filter anatomia-website build` passes with zero errors
- [ ] AC18: Site renders correctly in both light and dark themes

## Testing Strategy

- **No unit tests.** The website has zero test infrastructure. These are CSS/copy changes — verified by build pass and visual inspection.
- **Build verification:** `pnpm --filter anatomia-website build` must pass. This is the primary automated check.
- **Manual verification:** After all changes, run `pnpm --filter anatomia-website dev` and visually compare against the handoff HTML at desktop and mobile breakpoints. Check both light and dark themes.

## Dependencies

None. All changes are to existing files. No new dependencies.

## Constraints

- **No new files.** All changes modify existing files.
- **`overflow: hidden` must be preserved on `.frame`.** Removing it would let the TetrisSnake canvas overflow.
- **The `:has()` bonding rule must be in globals.css**, not a CSS module — it targets a sibling element across component boundaries.
- **Touch target pseudo-elements need `position: relative` on the parent button.** Without it, `absolute` positioning on the pseudo-element won't work relative to the button.
- **posthog-js must be installed** before the build will pass. Run `pnpm install` if the website's node_modules are incomplete (this is a pre-existing issue, not caused by this scope).

## Gotchas

- **Tailwind specificity vs globals.css:** The footer `mt-10` Tailwind class MUST be removed from Footer.tsx before adding `footer { margin-top: 40px; }` in globals.css. If both exist, Tailwind wins and the `:has()` override is dead.
- **CSS module isolation:** The globals.css `:has()` rule uses `section[data-component="proof-feed"]` as the selector anchor, not a CSS module class. Module classes get hashed — a hashed class in globals.css wouldn't match anything.
- **ProofFeed sibling position:** The `:has()` + `+` CSS combinator requires ProofFeed to be the direct previous sibling of Footer in the DOM. This works because ProofFeed renders outside `<main>` in page.tsx, and `{children}` expands inline in the marketing layout. If anyone wraps ProofFeed in a container, the rule breaks.
- **MAINTENANCE_MANUAL architecture tree:** The tree currently shows 3 pages under `(sub)`. The reality is 9 pages under `(marketing)` (landing page.tsx + about, changelog, cli, contact, docs, examples, license, manifesto). List them all.
- **The `after:content-['']` pseudo-element** on nav buttons creates an absolutely-positioned overlay. Since the buttons already use `rounded-[var(--radius-sm)]` and the pseudo-element extends 5px beyond, the touch target is rectangular — not rounded. This is fine and expected for touch targets.

## Build Brief

### Rules That Apply
- CSS Modules: never use `@apply` — use `var(--token)` directly (from coding-standards)
- Tailwind v4 processes each CSS Module in isolation (from MAINTENANCE_MANUAL decision 3)
- Server components by default — don't add `"use client"` to components that don't need browser APIs
- Copy changes go in `lib/copy.ts` — the single source of truth for all user-visible strings
- Use `var(--token)` for all colors — never hardcode color values in components

### Pattern Extracts

**Existing `:has()` pattern from proof-feed.module.css (lines 12–19):**
```css
/* Collapsed: sits on footer like a drawer face */
.section:has(.card[data-open="false"]) {
  background: color-mix(in oklch, var(--color-brand) 2.5%, var(--footer-bg));
}

/* Expanded: sits on page body */
.section:has(.card[data-open="true"]) {
  background: var(--bg);
  border-bottom: 1px solid var(--hairline);
}
```

**Footer commit pill — current (Footer.tsx lines 110–124) to become plain text:**
```tsx
{latest && (
  <span
    className="rounded-full"
    style={{
      color: "var(--ink-45)",
      padding: "3px 10px",
      border: "1px solid var(--border-soft)",
      borderRadius: "999px",
    }}
  >
    <span style={{ color: "var(--ink-30)" }}>commit</span> ·{" "}
    <span>{latest.hash}</span> ·{" "}
    <span>{formatAge(latest.ts)}</span>
  </span>
)}
```

**Icon button pattern — current (Nav.tsx line 92):**
```tsx
className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-150"
```

**Responsive card padding pattern (bento.module.css lines 66–68):**
```css
@media (min-width: 1024px) {
  .tilePad { padding: 36px 36px 40px; }
}
```

### Proof Context

No active proof findings for affected files.

### Checkpoint Commands

- After pricing CSS changes: `pnpm --filter anatomia-website build` — Expected: passes with zero errors
- After all changes: `pnpm --filter anatomia-website build` — Expected: passes with zero errors
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 0 (website has no test infrastructure)
- Current test files: 0
- Build command: `pnpm --filter anatomia-website build`
- Build status: passes (after `pnpm install`)
- After build: 0 tests, build must still pass
- Regression focus: globals.css `:has()` rule could break proof-feed visual if selector is wrong
