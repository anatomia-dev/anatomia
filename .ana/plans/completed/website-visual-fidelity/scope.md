# Scope: Website Visual Fidelity

**Created by:** Ana
**Date:** 2026-05-07

## Intent
Fix 13 visual regressions between the locked handoff HTML and the shipped website. Every item was validated against both the handoff source (`Anatomia Landing Refresh handoff.html`) and the live implementation. The site is live at anatomia.dev — these differences are visible to anyone comparing the design reference.

## Complexity Assessment
- **Size:** medium
- **Files affected:**
  - `website/components/pricing/TetrisSnake.tsx` — full rewrite (A1)
  - `website/components/pricing/PriceCard.tsx` — minor markup adjustment for inverted context (A2)
  - `website/components/pricing/pricing.module.css` — card inversion, flag pill, price size, section border (A2, A6, A7, A13)
  - `website/components/pricing/Pricing.tsx` — heading font size (A5)
  - `website/components/bento/bento.module.css` — compat tile inversion, scan metrics hairline grid, agent chip grid (A3, A11, A12)
  - `website/components/bento/tiles/AgentsTile.tsx` — chip layout markup change for stacked name/role (A12)
  - `website/components/footer/Footer.tsx` — tagline display lockup, commit pill shape (A4, A8)
  - `website/app/globals.css` — section padding token, dark mode `--fg-strong` (A9, A10)
- **Blast radius:** Visual-only. No routing, data, or logic changes. All changes are CSS properties or component markup within existing files. The TetrisSnake rewrite (A1) is the largest single change but is fully isolated — a client component with no consumers beyond `Pricing.tsx`.
- **Estimated effort:** 3–5 hours. 12 of 13 items are CSS property changes or small markup tweaks. A1 (TetrisSnake) is a rewrite but the handoff has the complete algorithm.
- **Multi-phase:** no

## Approach
Match the shipped site to the locked handoff pixel by pixel. Each of the 13 items is a discrete CSS or component fix validated against the handoff HTML source. The TetrisSnake (A1) is a full algorithm rewrite — the handoff provides the complete perimeter-walker implementation at lines 5138-5244. The two card inversions (A2, A3) follow the handoff's pattern of swapping `--fg-strong` and `--bg` with explicit child color overrides. Everything else is numerical CSS corrections.

## Acceptance Criteria
- AC1: TetrisSnake walks the pricing frame perimeter clockwise, building a border one cell at a time — not random bouncing
- AC2: Team pricing card is fully inverted (dark bg `var(--fg-strong)`, light text `var(--bg)`, transparent border) with inverted flag, feature list, and CTA
- AC3: Compat bento tile is fully inverted with all child elements (h3, eyebrow, p, chips) color-adjusted for dark background
- AC4: Footer tagline renders at `clamp(32px, 3.6vw, 44px)` weight 600, with `<em>` in Fraunces italic weight 400 at `font-variation-settings: "opsz" 96` in brand color
- AC5: Pricing heading renders at `clamp(40px, 5.5vw, 68px)` with `leading-[1.02]` and `tracking-[-0.04em]`
- AC6: Price flag is a pill badge with `padding: 4px 9px`, `border-radius: 999px`, `background: var(--brand-soft)`
- AC7: Price amount is 48px (up from 40px)
- AC8: Footer commit is a pill with `border-radius: 999px`, `padding: 3px 10px`, transparent border, hover state with `border-color: var(--border-soft)` and `background: var(--bg-elev)`
- AC9: `--spacing-section` is `116px` (up from 88px), applied to all section components using that token
- AC10: Dark mode `--fg-strong` is `#FBFAF6` (warm off-white, not pure `#ffffff`)
- AC11: Scan metrics use hairline-grid layout (`gap: 1px; background: var(--hairline)`) with `border-radius: 0` cells on `var(--bg-card)` background
- AC12: Agent chips use 2-column grid with stacked vertical layout (number, name, role on separate lines)
- AC13: Pricing section has `border-top: 1px solid var(--hairline)`

## Edge Cases & Risks
- **Pricing card inversion in dark mode.** `--fg-strong` is `#FBFAF6` in dark mode — the highlighted card becomes a light card against a dark page. This is correct and intentional (inverted = "stands out from page bg"). No special dark-mode override needed.
- **Compat tile chips against inverted background.** Current `.compatChip` has `border: 1px solid var(--border-soft); color: var(--ink-60)` — both are semi-transparent light-theme values that become invisible on a dark `--fg-strong` background. The chips need explicit inverted styling: `background: color-mix(in oklch, var(--bg) 8%, transparent); color: var(--bg); border: none;` following the handoff's compat-strip chip pattern.
- **TetrisSnake performance.** The perimeter walker creates placed blocks that accumulate. The handoff clears ~40% of placed blocks every 2 laps (`placed = placed.filter(() => Math.random() > 0.4)`). This must be preserved to prevent density buildup.
- **TetrisSnake `--color-brand` vs `--brand`.** The handoff reads `--brand`. The implementation's token is `--color-brand`. The rewrite must use `--color-brand`.
- **Section padding cascade.** Changing `--spacing-section` from 88px to 116px affects every component that references the token. The bento section (`bento.module.css`) and pricing section (`pricing.module.css`) both hardcode `padding: 88px 0 64px` — they reference the value, not the token. Plan needs to audit which sections use the literal `88px` vs the `var(--spacing-section)` token and ensure consistency.
- **Highlighted card feature list border.** The handoff's `.price-list` has `border-top: 1px solid var(--hairline)` which on the highlighted card overrides to `border-top-color: rgba(255,255,255,0.12)`. Current implementation uses a different feature layout (no border-top on the list). Plan should check whether this border exists and add the override if so.
- **Agent chip markup change.** A12 isn't CSS-only — the handoff's chip structure is `<div class="n">THINK</div><div class="name">ana</div><div class="role">reads · asks · scopes</div>` (stacked column), while the implementation renders `.chipN`, `.chipName`, `.chipRole` in a single inline-flex row. The component markup in `AgentsTile.tsx` needs to change alongside the CSS.

## Rejected Approaches
- **Fix only high-severity items.** The requirements doc assessed severity but all 13 are real regressions from a locked handoff. A verification product can't ship with known visual gaps — credibility is the product.
- **Separate scopes per fix.** 12 of 13 are <10-line CSS changes. Running 13 pipeline cycles for CSS property changes is overhead that doesn't match the risk. Batching is appropriate because: no architectural changes, no shared state between fixes, and the handoff provides exact values for every property.
- **Approximate the TetrisSnake behavior.** The handoff has the complete algorithm (100 lines). Approximating it would create a second implementation that needs future reconciliation. Port the algorithm directly, adapting only the token name (`--brand` → `--color-brand`).

## Open Questions
None — all items have locked handoff values as the reference.

## Exploration Findings

### Patterns Discovered
- `pricing.module.css`: Card styling uses `.card` base + `.cardHighlighted` modifier. The modifier currently only adds `border-color` — needs full inversion properties.
- `bento.module.css`: Tile base (`.tile`) provides default bg/border. Tile-specific classes (`.tCompat`, `.tScan`, etc.) override. `.tCompat` has grid placement but no visual overrides.
- `Footer.tsx`: Tagline uses `splitHeadline()` from `lib/format.ts` to parse `*word*` into `<em>` tags. The markup structure already supports the weight contrast — just needs CSS properties.
- `TetrisSnake.tsx`: 130 lines, all self-contained. No exports consumed elsewhere. Clean rewrite target.
- `AgentsTile.tsx`: Renders chips from `copy.bento.agents.items` array. Each item has `.num`, `.name`, `.role` fields — the data model already supports the stacked layout.

### Constraints Discovered
- [TYPE-VERIFIED] Section padding hardcoded in module CSS (`bento.module.css:4`, `pricing.module.css:4`) as literal `88px`, not `var(--spacing-section)` — changing the token alone won't propagate
- [TYPE-VERIFIED] `--fg-strong` in dark theme is `#ffffff` (`globals.css:108`) — single-line fix to `#FBFAF6`
- [TYPE-VERIFIED] TetrisSnake reads `--color-brand` once at mount (`line 51`) — the handoff reads `--brand` every frame via `brandColor()` function. The rewrite should read per-frame to track theme changes.
- [OBSERVED] Price flag `.cardFlag` has no `display: inline-block` — it's block-level by default, which works but the pill styling needs `display: inline-block` to constrain width
- [OBSERVED] Handoff `.price-flag` has `font-size: 9.5px` but impl `.cardFlag` has `font-size: 10px` — minor but worth matching exactly

### Test Infrastructure
- No visual regression tests exist. Verification is manual comparison against the handoff HTML.
- The website has no test files. CI runs build + typecheck only.

## For AnaPlan

### Structural Analog
`website/components/pricing/pricing.module.css` — the pattern of base class + modifier class (`.card` / `.cardHighlighted`) is the exact pattern needed for the compat tile inversion (`.tile` / `.tCompat`).

### Relevant Code Paths
- `website/components/pricing/TetrisSnake.tsx` — full rewrite to perimeter walker. Handoff algorithm at lines 5138-5244 of `~/Downloads/anatomia (5)/Anatomia Landing Refresh handoff.html`
- `website/components/pricing/PriceCard.tsx` — highlighted card renders `Button variant="primary"`. The inversion needs the CTA override to reach through the Button component's styles.
- `website/components/pricing/pricing.module.css` — `.cardHighlighted`, `.cardFlag`, `.cardPriceValue`, `.section`
- `website/components/bento/bento.module.css` — `.tCompat`, `.compatChip`, `.metricGrid`, `.metric`, `.chipGrid`, `.chip`
- `website/components/bento/tiles/AgentsTile.tsx` — chip markup for stacked layout
- `website/components/bento/tiles/CompatTile.tsx` — no code changes needed, just CSS
- `website/components/footer/Footer.tsx` — tagline `<p>` and `<em>` classes, commit `<a>` element
- `website/app/globals.css` — `--spacing-section`, dark theme `--fg-strong`
- `website/components/ui/Button.tsx` — check if the primary variant's styles need an override path for the inverted card context

### Patterns to Follow
- `pricing.module.css` for the card inversion pattern
- Handoff CSS (lines 1686-1691) for the compat tile inversion pattern
- Handoff CSS (lines 2880-2898) for the footer tagline display lockup
- Handoff JS (lines 5143-5244) for the TetrisSnake algorithm — port directly, change `--brand` to `--color-brand`

### Known Gotchas
- The TetrisSnake handoff reads `--brand` via `getComputedStyle` every frame. The implementation token is `--color-brand`. The rewrite must use `--color-brand`.
- The compat tile inversion needs child overrides for `.compatChip` — without them, the chips are invisible against the dark background. The handoff's `.compat-strip .cs-chip` pattern (from the deep dive section) shows the inverted chip style: `background: color-mix(in oklch, var(--bg) 8%, transparent); color: var(--bg)`.
- The highlighted card CTA uses `<Button variant="primary">`. The Button component's primary variant has its own background/color. The inversion override must reach through — either via a CSS class on the card that targets the button, or by passing different styles when highlighted. Check `Button.tsx` for override approach.
- Section padding: `bento.module.css` and `pricing.module.css` both hardcode `88px` instead of using `var(--spacing-section)`. The fix should either update these to use the token, or update the literal values — but must be consistent.
- The `.cardFlag` font-size is `10px` in the impl vs `9.5px` in the handoff. Minor but should match.
- The `.compatCatch` chip (the "and anything…" italic chip) also needs inverted styling when inside `.tCompat`.

### Things to Investigate
- How to override the `<Button variant="primary">` styles when inside `.cardHighlighted`. Does the Button accept a `className` override? Does it use CSS modules or inline styles? The answer determines whether the override is a CSS descendant selector or a prop change.
- Whether sections beyond bento and pricing hardcode `88px` — grep for `88px` across all website CSS to find every instance that needs updating.
