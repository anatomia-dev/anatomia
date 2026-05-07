# Spec: Website Visual Fidelity

**Created by:** AnaPlan
**Date:** 2026-05-07
**Scope:** .ana/plans/active/website-visual-fidelity/scope.md

## Approach

13 discrete visual fixes matching the shipped website to the locked handoff HTML. Each fix is a CSS property change or small markup adjustment, except A1 (TetrisSnake) which is a full algorithm rewrite.

The handoff file is at `~/Downloads/anatomia (5)/Anatomia Landing Refresh handoff.html`. Every CSS value in this spec comes from that file.

**Key design decisions:**

- **TetrisSnake (A1):** Full rewrite porting the handoff's perimeter-walker algorithm. The current implementation bounces randomly — the handoff walks the frame perimeter clockwise, laying permanent blocks every 3 steps and clearing ~40% every 2 laps. Read `--color-brand` per-frame via `getComputedStyle` (not once at mount) to track theme changes. Use ResizeObserver instead of window resize listener for more reliable container tracking.

- **Card inversion (A2):** `.cardHighlighted` gets full inversion: dark bg, light text, transparent border. Child overrides cascade to all text elements. The CTA button override uses a CSS descendant selector `.cardHighlighted .cardCta a, .cardHighlighted .cardCta button` in `pricing.module.css` — this reaches through the Button component's Tailwind classes. The Button component accepts `className` but the highlighted card needs a completely different style (`background: var(--brand); color: #000`), so a descendant selector is cleaner than a new Button variant.

- **Compat tile inversion (A3):** Same pattern as card inversion — `.tCompat` base override plus child selectors. The compat chips need explicit inverted styling since their current `border: 1px solid var(--border-soft)` and `color: var(--ink-60)` become invisible on the dark background.

- **Section padding (A9):** Update the `--spacing-section` token from `88px` to `116px`, AND refactor both `bento.module.css` and `pricing.module.css` to use `var(--spacing-section)` instead of hardcoded `88px`. This fixes the design-token inconsistency where the token exists but no component references it.

- **Agent chips (A12):** Both markup and CSS change. The handoff renders each chip as a stacked column (number, name, role on separate lines) in a 2-column grid — the current implementation renders them as a single inline-flex row in a flex-wrap container.

## Output Mockups

These are visual CSS changes — no terminal output or API responses. The reference for all visual output is the handoff HTML rendered in a browser. Key visual changes:

**TetrisSnake (A1):** Instead of a random bouncing dot with a fading trail, the canvas shows cells being placed one at a time along the pricing frame's perimeter in a clockwise direction, building a visible border. Permanent blocks accumulate at ~18% opacity, creating a growing frame pattern that periodically thins out.

**Highlighted pricing card (A2):** The Team card appears as a dark card (using `--fg-strong` as background) with light text, standing out against the page. Flag becomes a brand-colored pill on brand background. CTA button becomes `background: var(--brand); color: #000`.

**Agent chips (A12):** Instead of a horizontal row of `[THINK ana reads · asks · scopes]` inline chips, the layout becomes a 2×2 grid of stacked cards:
```
┌─────────────────┐ ┌─────────────────┐
│ THINK           │ │ PLAN            │
│ ana             │ │ ana-plan        │
│ reads · asks ·  │ │ specs ·         │
│ scopes          │ │ contracts       │
└─────────────────┘ └─────────────────┘
┌─────────────────┐ ┌─────────────────┐
│ BUILD           │ │ VERIFY          │
│ ana-build       │ │ ana-verify      │
│ implements ·    │ │ isolated ·      │
│ tests           │ │ mechanical      │
└─────────────────┘ └─────────────────┘
```

## File Changes

### `website/app/globals.css` (modify)
**What changes:** Two token updates: `--spacing-section` from `88px` to `116px` (A9), and dark theme `--fg-strong` from `#ffffff` to `#FBFAF6` (A10).
**Pattern to follow:** Existing token structure in the same file.
**Why:** Section spacing is visibly tighter than the handoff. Dark mode `--fg-strong` is pure white instead of the warm off-white specified in the handoff.

### `website/components/pricing/TetrisSnake.tsx` (modify — full rewrite)
**What changes:** Replace the random-bounce walker with the handoff's perimeter-walker algorithm. The new algorithm: builds a perimeter array of all cells along the frame edge (clockwise from top-left), steps through one cell per tick, lays permanent blocks every 3 steps at 0.18 alpha, maintains a fading trail (age-based, 20 ticks), clears ~40% of placed blocks every 2 laps, reads `--color-brand` per-frame.
**Pattern to follow:** Handoff algorithm at lines 5143–5244 of `~/Downloads/anatomia (5)/Anatomia Landing Refresh handoff.html`. Port directly with these adaptations: (1) `--brand` → `--color-brand`, (2) vanilla JS → React useEffect with cleanup, (3) ResizeObserver on parent element, (4) IntersectionObserver for offscreen pause (keep existing pattern), (5) prefers-reduced-motion check (keep existing pattern).
**Why:** The current animation bounces randomly. The handoff walks the perimeter clockwise, building a border — fundamentally different behavior.

### `website/components/pricing/pricing.module.css` (modify)
**What changes:** Multiple properties across several selectors:
- `.section`: Change `padding: 88px 0 64px` to `padding: var(--spacing-section) 0 64px`. Add `border-top: 1px solid var(--hairline)` (A13).
- `.cardHighlighted`: Add full inversion — `background: var(--fg-strong); color: var(--bg); border-color: transparent` (A2).
- Add `.cardHighlighted` child overrides for `.cardName`, `.cardPriceValue`, `.cardSub`, `.cardFeature`, `.cardFeatureTick` (A2).
- `.cardFlag`: Change to pill — `display: inline-block; font-size: 9.5px; padding: 4px 9px; border-radius: 999px; background: var(--brand-soft); color: var(--brand-deep)` (A6). Add dark mode override `[data-theme="dark"] .cardFlag { color: var(--color-brand); }`. Add `.cardHighlighted .cardFlag { background: var(--color-brand); color: #000; }`.
- `.cardPriceValue`: Change `font-size: 40px` to `font-size: 48px` (A7).
- Add `.cardHighlighted .cardCta a, .cardHighlighted .cardCta button` descendant selector for CTA override — `background: var(--color-brand) !important; color: #000 !important` (A2).
- Add `.cardHighlighted .cardFeatures` border-top override — `border-top: 1px solid rgba(255,255,255,0.12)` if the feature list has a border-top. Current implementation has no border-top on `.cardFeatures` — check the handoff's `.price-list` which has `border-top: 1px solid var(--hairline)`. Add this border to `.cardFeatures` and override it on highlighted.
**Pattern to follow:** The existing `.card` / `.cardHighlighted` modifier pattern in this same file. The handoff's `.price-card.highlighted` overrides at lines 2687–2689.
**Why:** The highlighted card currently only changes border color. The handoff fully inverts it.

### `website/components/pricing/Pricing.tsx` (modify)
**What changes:** Update the pricing heading `<h2>` from `text-[clamp(32px,3.8vw,52px)] leading-[1.05] tracking-tight` to `text-[clamp(40px,5.5vw,68px)] leading-[1.02] tracking-[-0.04em]` (A5).
**Pattern to follow:** Existing inline Tailwind utility pattern in this file.
**Why:** Heading is visibly smaller than the handoff.

### `website/components/bento/bento.module.css` (modify)
**What changes:** Multiple property groups:
- `.section`: Change `padding: 88px 0 64px` to `padding: var(--spacing-section) 0 64px` (A9 consistency).
- `.tCompat`: Add inversion — `background: var(--fg-strong); color: var(--bg); border-color: transparent` (A3).
- Add `.tCompat h3, .tCompat .tileEyebrow` override — `color: var(--bg)` (A3).
- Add `.tCompat .tileEyebrow .tileNum` — `color: var(--color-brand)` (keep brand color on number).
- Add `.tCompat p` — `color: color-mix(in oklch, var(--bg) 70%, transparent)` (A3).
- `.compatChip` inside `.tCompat`: `background: color-mix(in oklch, var(--bg) 8%, transparent); color: var(--bg); border: none` (A3).
- `.compatCatch` inside `.tCompat`: `color: color-mix(in oklch, var(--bg) 70%, transparent)` (A3).
- `.metricGrid`: Change to hairline-grid layout — `gap: 1px; background: var(--hairline); border: 1px solid var(--hairline); border-radius: var(--radius-sm); overflow: hidden` (A11).
- `.metric`: Change `background: var(--bg-deep)` to `background: var(--bg-card)`. Remove `border-radius: var(--radius-sm)` (cells are flush inside the hairline grid) (A11).
- `.chipGrid`: Change from `display: flex; flex-wrap: wrap` to `display: grid; grid-template-columns: 1fr 1fr` (A12).
- `.chip`: Change from `display: inline-flex; align-items: center` to `display: flex; flex-direction: column; gap: 4px; padding: 12px` (A12).
**Pattern to follow:** The handoff's `.scan-readout` at lines 1620–1631 for the hairline grid. The handoff's `.agents-grid` / `.agent-chip` at lines 1656–1664 for the chip layout.
**Why:** Scan metrics use rounded separated cards instead of the handoff's flush hairline grid. Agent chips are horizontal instead of stacked vertical.

### `website/components/bento/tiles/AgentsTile.tsx` (modify)
**What changes:** Change chip markup from a single inline-flex row to stacked vertical divs. Currently renders `<span className={chipN}>`, `<span className={chipName}>`, `<span className={chipRole}>` as siblings in an inline-flex container. Change to three separate `<div>` elements so they stack vertically with the column flex direction from the CSS change.
**Pattern to follow:** The handoff's chip markup at lines 3910–3913: `<div class="n">THINK</div><div class="name">ana</div><div class="role">reads · asks · scopes</div>`.
**Why:** The CSS `flex-direction: column` on `.chip` needs block-level children to stack properly.

### `website/components/footer/Footer.tsx` (modify)
**What changes:** Two areas:
1. **Tagline (A4):** Replace Tailwind classes `text-lg font-semibold` on the tagline `<p>` with inline style: `fontSize: "clamp(32px, 3.6vw, 44px)", fontWeight: 600, lineHeight: 1.0, letterSpacing: "-0.02em"`. Update the `<em>` to include `fontVariationSettings: '"opsz" 96', fontWeight: 400` in its inline style (A4). The `<em>` already has `font-serif italic` and brand color.
2. **Commit pill (A8):** Replace the current underline-style `<a>` with a pill. Remove `border-b pb-px` classes and the `borderColor: "var(--ink-15)"` style. Apply: `borderRadius: "999px", padding: "3px 10px", border: "1px solid transparent"`, `transition: "color .18s ease, border-color .18s ease, background .18s ease"`. The hover state needs CSS — either add a small CSS module for footer or use Tailwind hover utilities: `hover:border-[var(--border-soft)] hover:bg-[var(--bg-elev)]`.
**Pattern to follow:** The handoff's `.footer-tagline` at lines 2882–2898 and `.footer-commit` at lines 2914–2926. The current file uses inline styles extensively — follow the same pattern for the tagline. For the commit hover state, the simplest approach is inline styles for base + Tailwind hover utilities.
**Why:** Tagline is too small (18px vs 32–44px clamp). Commit link is an underline instead of a pill.

## Acceptance Criteria

- [x] AC1: TetrisSnake walks the pricing frame perimeter clockwise, building a border one cell at a time — not random bouncing
- [ ] AC2: Team pricing card is fully inverted (dark bg `var(--fg-strong)`, light text `var(--bg)`, transparent border) with inverted flag, feature list, and CTA
- [ ] AC3: Compat bento tile is fully inverted with all child elements (h3, eyebrow, p, chips) color-adjusted for dark background
- [ ] AC4: Footer tagline renders at `clamp(32px, 3.6vw, 44px)` weight 600, with `<em>` in Fraunces italic weight 400 at `font-variation-settings: "opsz" 96` in brand color
- [ ] AC5: Pricing heading renders at `clamp(40px, 5.5vw, 68px)` with `leading-[1.02]` and `tracking-[-0.04em]`
- [ ] AC6: Price flag is a pill badge with `padding: 4px 9px`, `border-radius: 999px`, `background: var(--brand-soft)`
- [ ] AC7: Price amount is 48px (up from 40px)
- [ ] AC8: Footer commit is a pill with `border-radius: 999px`, `padding: 3px 10px`, transparent border, hover state with `border-color: var(--border-soft)` and `background: var(--bg-elev)`
- [ ] AC9: `--spacing-section` is `116px` (up from 88px), applied to all section components using that token
- [ ] AC10: Dark mode `--fg-strong` is `#FBFAF6` (warm off-white, not pure `#ffffff`)
- [ ] AC11: Scan metrics use hairline-grid layout (`gap: 1px; background: var(--hairline)`) with `border-radius: 0` cells on `var(--bg-card)` background
- [ ] AC12: Agent chips use 2-column grid with stacked vertical layout (number, name, role on separate lines)
- [ ] AC13: Pricing section has `border-top: 1px solid var(--hairline)`
- [ ] No TypeScript build errors (`pnpm run build` in website)
- [ ] Site renders correctly in both light and dark themes

## Testing Strategy

- **No automated tests.** The website has zero test files. These are visual CSS changes — verification is visual comparison against the handoff HTML in a browser.
- **Manual verification:** Open the handoff HTML and the dev server side by side. Compare each of the 13 items.
- **Build verification:** `pnpm run build` must succeed with no type errors.
- **Theme verification:** Check both light and dark mode for the inverted elements (A2, A3) since `--fg-strong` and `--bg` swap between themes.

## Dependencies

- The handoff HTML file at `~/Downloads/anatomia (5)/Anatomia Landing Refresh handoff.html` must be accessible for reference during implementation.
- No package installations needed.

## Constraints

- All CSS values must match the handoff exactly — no approximations.
- The TetrisSnake rewrite must preserve: prefers-reduced-motion check, IntersectionObserver pause, and cleanup on unmount.
- No changes to the Button component (`Button.tsx`) — overrides happen via CSS descendant selectors.
- No new CSS module files — all changes go in existing module files.

## Gotchas

- **TetrisSnake `--color-brand` not `--brand`.** The handoff reads `--brand`. The implementation's token is `--color-brand`. Every `getComputedStyle` call in the rewrite must use `--color-brand`.
- **Compat chips invisible without explicit overrides.** The `.compatChip` has `border: 1px solid var(--border-soft)` which is near-invisible on the inverted dark background. The `.tCompat .compatChip` override must set `border: none` and `background: color-mix(...)`.
- **The `.compatCatch` also needs inversion.** The italic "and anything…" chip uses `color: var(--ink-45)` which becomes invisible on the dark background.
- **Button CTA override specificity.** The Button component uses Tailwind utility classes like `bg-[var(--color-brand)]`. The CSS module descendant selector `.cardHighlighted .cardCta a` may need `!important` to override Tailwind's specificity. Test this — if Tailwind classes win, add `!important` on the critical properties (background, color).
- **Section padding: only bento and pricing hardcode `88px`.** The hero section also has `88px` in `hero.module.css` but it's in a `clamp()` for font-size, not section padding — don't touch it.
- **`.cardFlag` font-size mismatch.** Current: `10px`. Handoff: `9.5px`. Update to `9.5px` as part of the pill conversion (A6).
- **TetrisSnake CELL size.** Handoff uses `CELL = 10`. Current uses `cellSize = 6`. Use `10` to match the handoff.
- **Handoff's `--brand` fallback.** The handoff uses `'#10B981'` as fallback in `brandColor()`. The implementation should use `'#7A1B1B'` (the actual brand color) as fallback.
- **Feature list border-top.** The handoff's `.price-list` has `border-top: 1px solid var(--hairline)`. The current `.cardFeatures` has no border-top. Add it, plus the highlighted override `border-top-color: rgba(255,255,255,0.12)`.
- **Dark mode `.cardFlag` color.** The handoff has `[data-theme="dark"] .price-flag { color: var(--brand); }`. Since `.cardFlag` uses `color: var(--color-brand)` which is the same value, no dark mode override is needed for the non-highlighted state. But the highlighted override `.cardHighlighted .cardFlag { background: var(--color-brand); color: #000; }` is needed.

## Build Brief

### Rules That Apply
- Website is Next.js + Tailwind v4 with CSS Modules. No `.js` extension imports needed (website uses Next.js module resolution, not the CLI's ESM setup).
- Components use `"use client"` directive when they need browser APIs (canvas, IntersectionObserver). TetrisSnake already has this.
- CSS tokens are defined in `globals.css` under `@theme` (Tailwind-generating) and `:root` / `[data-theme]` blocks.
- Inline styles using `style={{ color: "var(--token)" }}` are the dominant pattern in the website — not CSS modules for everything.
- The `cn()` utility from `@/lib/utils` merges Tailwind classes. Used in `Button.tsx` and `PriceCard.tsx`.

### Pattern Extracts

**Card inversion pattern (handoff lines 2687–2689, 2701, 2707, 2712, 2723):**
```css
/* from handoff */
.price-card.highlighted { background: var(--fg-strong); color: var(--bg); border-color: transparent; }
.price-card.highlighted h3, .price-card.highlighted .price { color: var(--bg); }
.price-card.highlighted .price-sub, .price-card.highlighted p, .price-card.highlighted li { color: color-mix(in oklch, var(--bg) 70%, transparent); }
.price-card.highlighted .price-flag { background: var(--brand); color: #000; }
.price-card.highlighted .price-list { border-top-color: rgba(255,255,255,0.12); }
.price-card.highlighted .price-list li { color: color-mix(in oklch, var(--bg) 80%, transparent); }
.price-card.highlighted .price-cta.primary { background: var(--brand); color: #000; }
```

**Compat tile inversion pattern (handoff lines 1686–1691):**
```css
/* from handoff */
.t-compat { background: var(--fg-strong); color: var(--bg); border-color: transparent; }
.t-compat h3, .t-compat .eyebrow { color: var(--bg); }
.t-compat .eyebrow .num { color: var(--brand); }
.t-compat p { color: color-mix(in oklch, var(--bg) 70%, transparent); }
```

**Compat chip inversion (handoff lines 2214–2226):**
```css
/* from handoff */
.compat-strip .cs-chip {
  padding: 6px 12px;
  background: color-mix(in oklch, var(--bg) 8%, transparent);
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--bg);
}
.compat-strip .cs-chip-any {
  background: var(--brand);
  color: #000;
  font-weight: 600;
}
```

**Hairline grid pattern (handoff lines 1620–1631):**
```css
/* from handoff */
.scan-readout {
  margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
  background: var(--hairline);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-sm); overflow: hidden;
}
.scan-cell {
  background: var(--bg-card); padding: 14px;
  display: flex; flex-direction: column; gap: 4px;
}
```

**Agent chip layout (handoff lines 1656–1664):**
```css
/* from handoff */
.agents-grid { margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.agent-chip {
  padding: 12px; background: var(--bg-deep);
  border: 1px solid var(--border-soft); border-radius: var(--radius-sm);
  display: flex; flex-direction: column; gap: 4px;
}
.agent-chip .n { font-family: var(--font-mono); font-size: 11px; color: var(--ink-45); letter-spacing: 0.08em; text-transform: uppercase; }
.agent-chip .name { font-size: 14px; font-weight: 600; }
.agent-chip .role { font-family: var(--font-mono); font-size: 11px; color: var(--ink-60); }
```

**Footer tagline (handoff lines 2882–2898):**
```css
/* from handoff */
.footer-tagline {
  font-family: var(--font-sans);
  font-size: clamp(32px, 3.6vw, 44px);
  line-height: 1.0;
  letter-spacing: -0.02em;
  font-weight: 600;
  color: var(--fg);
  margin: 10px 0 14px;
}
.footer-tagline em {
  font-family: var(--font-serif);
  font-variation-settings: "opsz" 96;
  font-style: italic;
  font-weight: 400;
  color: var(--brand);
  letter-spacing: -0.02em;
}
```

**Footer commit pill (handoff lines 2914–2926):**
```css
/* from handoff */
.footer-commit {
  color: var(--ink-45); text-decoration: none;
  display: inline-flex; align-items: center; gap: 2px;
  padding: 3px 10px; border: 1px solid transparent; border-radius: 999px;
  transition: color .18s ease, border-color .18s ease, background .18s ease;
}
.footer-commit .k { color: var(--ink-30); }
.footer-commit:hover {
  color: var(--fg);
  border-color: var(--border-soft);
  background: var(--bg-elev);
}
.footer-commit:hover .k { color: var(--ink-60); }
```

**Price flag pill (handoff lines 2693–2701):**
```css
/* from handoff */
.price-flag {
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 600;
  padding: 4px 9px; border-radius: 999px;
  background: var(--brand-soft); color: var(--brand-deep);
  letter-spacing: 0.08em; text-transform: uppercase;
  white-space: nowrap;
}
[data-theme="dark"] .price-flag { color: var(--brand); }
.price-card.highlighted .price-flag { background: var(--brand); color: #000; }
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands
- After globals.css changes: `cd website && pnpm run build` — Expected: clean build
- After all CSS module changes: `cd website && pnpm run build` — Expected: clean build
- After TetrisSnake rewrite: `cd website && pnpm run build` — Expected: clean build, no type errors
- Final: `cd website && pnpm run build` — Expected: clean build

### Build Baseline
- No tests exist for the website package. CI runs build + typecheck only.
- Build command: `cd website && pnpm run build`
- After build: no new tests expected (visual-only changes)
- Regression focus: TetrisSnake.tsx (full rewrite — ensure no runtime errors), PriceCard.tsx (ensure Button still renders in highlighted context)
