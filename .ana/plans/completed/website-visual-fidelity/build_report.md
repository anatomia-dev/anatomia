# Build Report: Website Visual Fidelity

**Created by:** AnaBuild
**Date:** 2026-05-07
**Spec:** .ana/plans/active/website-visual-fidelity/spec.md
**Branch:** feature/website-visual-fidelity

## What Was Built

- `website/app/globals.css` (modified): `--spacing-section` 88px → 116px (A9). Dark mode `--fg-strong` #ffffff → #FBFAF6 (A10).
- `website/components/pricing/pricing.module.css` (modified): Section uses `var(--spacing-section)` + border-top hairline (A9, A13). Full card inversion — `.cardHighlighted` gets dark bg, light text, transparent border, child overrides for name/price/sub/features/tick/flag/CTA (A2). Flag → pill badge with 999px radius, brand-soft bg, 9.5px font, dark mode override (A6). Price amount 40px → 48px (A7). Feature list border-top added with highlighted override (A2).
- `website/components/bento/bento.module.css` (modified): Section uses `var(--spacing-section)` (A9). Compat tile inversion — `.tCompat` gets dark bg/light text, child overrides for h3/eyebrow/p/chips/catch (A3). Scan metrics → hairline grid with 1px gap, bg-card cells (A11). Agent chips → 2-column grid with stacked vertical layout, updated chip styling to match handoff (A12).
- `website/components/bento/tiles/AgentsTile.tsx` (modified): Chip children changed from `<span>` to `<div>` for block-level vertical stacking (A12).
- `website/components/pricing/TetrisSnake.tsx` (modified — full rewrite): Replaced random-bounce walker with clockwise perimeter-walker algorithm. Builds permanent blocks every 3 steps at 0.18 alpha. Fading trail (age-based, 20 ticks). Clears ~40% of placed blocks every 2 laps. Reads `--color-brand` per frame. Uses ResizeObserver + IntersectionObserver. CELL size 6 → 10. Preserves prefers-reduced-motion check (A1).
- `website/components/pricing/Pricing.tsx` (modified): Heading font size clamp(32px,3.8vw,52px) → clamp(40px,5.5vw,68px), leading 1.05 → 1.02, tracking tight → -0.04em (A5).
- `website/components/footer/Footer.tsx` (modified): Tagline → clamp(32px,3.6vw,44px) weight 600, lineHeight 1.0, letterSpacing -0.02em. `<em>` gets fontVariationSettings '"opsz" 96', fontWeight 400 (A4). Commit link → pill with 999px radius, transparent border, 3px 10px padding. Hover: border-color var(--border-soft), bg var(--bg-elev) (A8).

## PR Summary

- 13 visual fidelity fixes matching the shipped website to the locked handoff HTML, covering tokens, typography, component inversion, and layout changes
- Full TetrisSnake rewrite: replaces random-bounce animation with clockwise perimeter-walker that builds a visible border frame
- Card and compat tile inversion: highlighted pricing card and compatibility tile now use dark backgrounds with full child element overrides
- Scan metrics switch from separated rounded cards to a flush hairline grid; agent chips switch from inline-flex row to 2-column stacked grid
- Footer tagline scales to display size with Fraunces optical sizing; commit link becomes a hover-reactive pill

## Acceptance Criteria Coverage

- AC1 "TetrisSnake walks perimeter clockwise" → TetrisSnake.tsx: perimeter array built clockwise, `pos` increments through it (visual verification)
- AC2 "Team card fully inverted" → pricing.module.css: `.cardHighlighted` bg/color/border + child overrides + CTA descendant selector (visual verification)
- AC3 "Compat tile fully inverted" → bento.module.css: `.tCompat` + child selectors for h3/eyebrow/p/chips/catch (visual verification)
- AC4 "Footer tagline at clamp(32px,3.6vw,44px)" → Footer.tsx: inline style with exact values + opsz 96 on em (visual verification)
- AC5 "Pricing heading at clamp(40px,5.5vw,68px)" → Pricing.tsx: Tailwind classes updated (visual verification)
- AC6 "Price flag is pill badge" → pricing.module.css: `.cardFlag` padding/radius/background (visual verification)
- AC7 "Price amount is 48px" → pricing.module.css: `.cardPriceValue` font-size: 48px (visual verification)
- AC8 "Footer commit is pill" → Footer.tsx: inline style + Tailwind hover utilities (visual verification)
- AC9 "--spacing-section is 116px" → globals.css: token updated + pricing/bento sections reference var(--spacing-section) (visual verification)
- AC10 "Dark mode --fg-strong is #FBFAF6" → globals.css: dark theme block updated (visual verification)
- AC11 "Scan metrics hairline grid" → bento.module.css: `.metricGrid` gap:1px, bg:hairline, overflow:hidden + `.metric` bg:bg-card (visual verification)
- AC12 "Agent chips 2-column grid stacked" → bento.module.css: `.chipGrid` grid + `.chip` flex-direction:column + AgentsTile.tsx div markup (visual verification)
- AC13 "Pricing section border-top" → pricing.module.css: `.section` border-top: 1px solid var(--hairline) (visual verification)
- "No TypeScript build errors" → ✅ `pnpm run build` passes cleanly
- "Site renders correctly in both themes" → NO TEST (visual-only, requires manual browser check)

## Implementation Decisions

- **TetrisSnake TypeScript narrowing:** Used `as` casts for `canvas.getContext("2d")` and `canvas.parentElement` to satisfy TS strict mode in closure context. The `canvasRef.current` null check + early return guarantees non-null, but TS can't narrow `useRef` across nested closures.
- **Feature list border-top for all cards:** Added `border-top: 1px solid var(--hairline)` to `.cardFeatures` (not just highlighted) since the handoff's `.price-list` has this border. The highlighted override changes it to `rgba(255,255,255,0.12)`.
- **Agent chip `.chipN` styling:** Changed from 9px bold brand-colored to 11px normal ink-45 to match the handoff's `.agent-chip .n` pattern. The old styling made the chip number look like a badge; the handoff treats it as a label.
- **Footer commit `<span>` for "commit" keyword:** Changed from `color: var(--ink-45)` to `color: var(--ink-30)` to match the handoff's `.footer-commit .k` styling.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
cd website && pnpm run build
✓ Compiled successfully
✓ Generating static pages (8/8)
```
No test suite — website has zero test files. Build is the verification.

### After Changes
```
cd website && pnpm run build
✓ Compiled successfully in 1062ms
✓ TypeScript in 1159ms
✓ Generating static pages (8/8)
```

### CLI Test Suite (unchanged)
```
cd packages/cli && pnpm vitest run
Test Files  96 passed (96)
     Tests  1998 passed | 2 skipped (2000)
  Duration  33.92s
```

### Comparison
- Tests added: 0 (no test infrastructure for website)
- Tests removed: 0
- Regressions: none

### New Tests Written
None — spec explicitly states "No automated tests" for visual-only CSS changes.

## Verification Commands
```bash
cd website && pnpm run build
cd packages/cli && pnpm vitest run
```

## Git History
```
b22b4ff [website-visual-fidelity] Update markup and typography
f813a20 [website-visual-fidelity] Rewrite TetrisSnake as perimeter walker
e641f0d [website-visual-fidelity] Update tokens, section spacing, and visual overhauls
```

## Open Issues

1. **No automated visual regression tests.** All 13 changes are visual CSS — verification requires manual browser comparison against the handoff HTML. The spec acknowledges this ("No automated tests").

2. **Compat tile hover state on dark background.** The `.tile:hover { border-color: var(--border); }` rule still applies to `.tCompat`, but `.tCompat` sets `border-color: transparent`. The hover may briefly show a border that looks odd against the inverted background. The handoff doesn't specify a hover override for `.t-compat`, so this follows the spec.

3. **`!important` on highlighted CTA override.** The `.cardHighlighted .cardCta a, .cardHighlighted .cardCta button` selector uses `!important` on background and color to override the Button component's Tailwind utility classes. This is noted as a potential necessity in the spec's Gotchas section. Visual verification in browser should confirm this works correctly.

Verified complete by second pass.
