# Scope: Website Direct Polish

**Created by:** Ana
**Date:** 2026-05-07

## Intent
Fix 12 visual and copy regressions found during post-merge review of the live site against the handoff HTML. These are the gap between "it builds" and "it matches the design." The pricing frame is the most visible — it has a static CSS border instead of letting the TetrisSnake canvas be the border, and the content is left-aligned instead of centered. The footer tagline font is missing letter-spacing, the commit pill has a visible border that shouldn't be there, the proof feed copy promises interactivity that was removed, and the nav is taller than designed.

## Complexity Assessment
- **Size:** small-medium
- **Files affected:**
  - `website/components/pricing/pricing.module.css` — frame border removal, centering, grid gap/breakpoint, card responsive padding (Fixes 1, 2, 3)
  - `website/components/pricing/Pricing.tsx` — h2 max-width (Fix 1)
  - `website/components/footer/Footer.tsx` — tagline em letter-spacing, commit pill de-styling, footer margin-top change (Fixes 4, 5, 6)
  - `website/app/globals.css` — proof feed / footer bonding rule (Fix 6)
  - `website/lib/copy.ts` — stale "Click one." copy, "ana" lowercase (Fixes 7, 10)
  - `website/components/bento/bento.module.css` — tCompat hover override (Fix 8)
  - `website/MAINTENANCE_MANUAL.md` — stale (sub) route references (Fix 9)
  - `website/components/nav/Nav.tsx` — icon button size 44px → 34px visual with touch target (Fix 12)
  - `website/components/nav/ThemeToggle.tsx` — same (Fix 12)
  - `website/components/nav/NavMobile.tsx` — same (Fix 12)
- **Blast radius:** Visual-only except Fix 6 (globals.css `:has()` rule targeting footer) and Fix 12 (nav button sizing). No routing, data model, or logic changes. No new files.
- **Estimated effort:** 2-3 hours. All fixes are CSS property changes, small markup tweaks, or copy string edits. No rewrites.
- **Multi-phase:** no

## Approach
Match the shipped site to the locked handoff HTML for 12 specific regressions found during visual review. Each fix has a before/after with exact handoff values. The fixes are grouped by file to minimize diff surface.

The pricing frame (Fix 1) is the most impactful — removing the static CSS border and centering the content transforms the section. The footer/proof feed bonding (Fix 6) requires a CSS `:has()` rule in globals.css because it targets a sibling element across component boundaries. The nav button sizing (Fix 12) uses a pseudo-element for touch target expansion without changing visual size.

## Acceptance Criteria
- AC1: Pricing frame has NO static CSS border — the TetrisSnake canvas is the only visible border
- AC2: Pricing frame content (eyebrow, h2, blurb) is centered, not left-aligned
- AC3: Pricing h2 has `max-width: 18ch`
- AC4: Pricing frame padding is `40px 64px` (desktop), `28px 20px` (mobile ≤720px)
- AC5: Pricing grid gap is `14px`, two-column breakpoint at `820px`
- AC6: Price cards have `padding: 40px` at `min-width: 1024px`
- AC7: Footer tagline `<em>` has `letter-spacing: -0.02em`
- AC8: Footer commit pill is plain text — no visible border, no padding, no pill shape
- AC9: Collapsed proof feed sits flush against footer — zero gap when `data-open="false"`
- AC10: Footer `mt-10` class replaced with CSS `margin-top: 40px` that the `:has()` rule can override
- AC11: Proof feed headTitle is `"Every commit has *receipts*."` — no "Click one."
- AC12: Proof feed headSub describes rows as display, not as links
- AC13: tCompat tile hover does NOT flash a border (`.tCompat:hover { border-color: transparent; }`)
- AC14: MAINTENANCE_MANUAL.md references `(marketing)` route group, not `(sub)`
- AC15: Hero headline uses lowercase `*ana*` not `*Ana*`
- AC16: Nav icon buttons are 34px visually with 44px touch targets via pseudo-element
- AC17: `pnpm --filter anatomia-website build` passes with zero errors
- AC18: Site renders correctly in both light and dark themes

## Edge Cases & Risks
- **Fix 1 — overflow:hidden must be preserved.** The frame currently has `overflow: hidden` which prevents the TetrisSnake canvas from overflowing. The border and border-radius are removed, but `overflow: hidden` stays.
- **Fix 6 — Tailwind specificity.** The footer has `mt-10` (Tailwind utility). The globals.css `:has()` rule with `margin-top: 0` may lose to Tailwind's specificity. Solution: remove `mt-10` from Footer.tsx and add `footer { margin-top: 40px; }` in globals.css so the `:has()` override works naturally.
- **Fix 12 — touch target pseudo-element.** The `after:absolute after:inset-[-5px]` approach extends the touch area without affecting layout. Verify the pseudo-element doesn't create unexpected stacking context issues with the nav's backdrop-blur.
- **Fix 5 + 8 combined with Scope A.** Scope A styled the commit pill as a pill shape. Scope B changed it to a `<span>`. This fix removes the remaining visible pill styling that shouldn't be there. The three scopes touched this element sequentially — verify the final state is plain text.

## Rejected Approaches
- **Separate direct commits per fix.** 12 commits for mostly CSS tweaks is noisy. One scope batches them cleanly with a single verification pass.
- **Skip Fix 12 (nav sizing).** The nav being taller than designed is visible. The pseudo-element touch target approach gives both visual fidelity and accessibility — no tradeoff needed.
- **Full page margin investigation (Fix 11).** Container max-width, padding, and centering all match the handoff. The perceived "skew" is likely viewport-dependent. Investigate during build, but don't change values that already match the handoff.

## Open Questions
- Fix 11 (hero left margin): may not be a real issue. Builder should compare at 1440px viewport width against the handoff HTML and only change if a measurable difference exists.

## Exploration Findings

### Patterns Discovered
- Icon button class `h-11 w-11 items-center justify-center rounded-[var(--radius-sm)]` is repeated 4× across Nav.tsx, NavMobile.tsx (×2), ThemeToggle.tsx — candidate for an `IconButton` component extraction in a future scope.
- Brand dot class `h-1.5 w-1.5 rounded-full` + brand background is repeated 3× across components — candidate for extraction.
- Eyebrow pattern `font-mono text-[11px] font-semibold uppercase tracking-widest` is repeated 10+× — strongest DRY candidate.

### Constraints Discovered
- [TYPE-VERIFIED] Footer has `className="mt-10 border-t pt-15 pb-9"` — the `mt-10` must move to CSS for the `:has()` override to work
- [TYPE-VERIFIED] pricing.module.css `.frame` has `overflow: hidden` — must preserve when removing border
- [TYPE-VERIFIED] Handoff `.tetris-frame` has NO border property, NO border-radius — canvas IS the frame
- [TYPE-VERIFIED] Handoff `.footer-commit` has `border: 1px solid transparent` at rest — pill only visible on hover. Since delinked, no hover, so plain text.
- [TYPE-VERIFIED] copy.ts line 224: `headTitle` still says "Click one." — stale after Scope B delinked rows
- [TYPE-VERIFIED] Handoff headline at line 3374 and tweaks JSON at line 70 both use lowercase `ana`

### Test Infrastructure
- No website tests. Build verification + visual comparison against handoff.

## For AnaPlan

### Structural Analog
`website/components/pricing/pricing.module.css` — same file modified by Scope A. The pattern of removing/changing CSS properties against the handoff reference is identical.

### Relevant Code Paths
- `website/components/pricing/pricing.module.css` — `.top`, `.frame`, `.inner`, `.grid`, `.card` (Fixes 1-3)
- `website/components/pricing/Pricing.tsx` — h2 className (Fix 1)
- `website/components/footer/Footer.tsx` — tagline `<em>` style, commit `<span>`, footer className (Fixes 4-6)
- `website/app/globals.css` — new `:has()` rule, new `footer` margin rule (Fix 6)
- `website/lib/copy.ts` — `proofFeed.headTitle`, `proofFeed.headSub`, `hero.headline` (Fixes 7, 10)
- `website/components/bento/bento.module.css` — `.tCompat:hover` (Fix 8)
- `website/components/nav/Nav.tsx`, `ThemeToggle.tsx`, `NavMobile.tsx` — icon button sizing (Fix 12)
- Handoff reference: `~/Downloads/anatomia (5)/Anatomia Landing Refresh handoff.html`

### Patterns to Follow
- Handoff lines 2645-2670 for pricing frame/top/inner CSS
- Handoff lines 2673-2676 for pricing grid
- Handoff lines 2686 for card responsive padding
- Handoff lines 2882-2898 for footer tagline
- Handoff lines 2914-2926 for footer commit
- Handoff lines 3066-3080 for proof feed / footer bonding

### Known Gotchas
- The pricing `.frame` loses `border` and `border-radius` but KEEPS `overflow: hidden`. If `overflow: hidden` is removed, the TetrisSnake canvas overflows the frame.
- The footer `:has()` bonding rule must be in globals.css, not a CSS module — it targets a sibling element (`+ footer`).
- The `mt-10` Tailwind class on footer must be removed and replaced with a CSS rule — Tailwind utilities beat regular CSS in specificity.
- The nav icon button pseudo-element touch target (`after:absolute after:inset-[-5px]`) needs the button to be `position: relative` — add `relative` to the className.

### Things to Investigate
- Fix 11: Compare hero layout at 1440px viewport against the handoff HTML. If the Container padding, max-width, and headline max-width all match (they do per code inspection), the perceived difference is not a code issue.
