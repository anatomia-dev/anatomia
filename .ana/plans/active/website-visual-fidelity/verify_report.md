# Verify Report: Website Visual Fidelity

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-07
**Spec:** .ana/plans/active/website-visual-fidelity/spec.md
**Branch:** feature/website-visual-fidelity

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/website-visual-fidelity/contract.yaml
  Seal: INTACT (hash sha256:4c689c479eeca16953db2e2daca4d9d3ce08a296bae9d68011c0dea9ed1d91d2)
```

Seal status: **INTACT**

Build: ✅ Clean (2 tasks, website compiled + typechecked, no errors)
Lint: ✅ Clean (eslint passed both packages)
Tests: N/A — website has no test files. CLI tests cached (not affected by this build).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | The pricing animation walks the frame border clockwise instead of bouncing randomly | ✅ SATISFIED | `website/components/pricing/TetrisSnake.tsx:62-67` — builds clockwise perimeter array (top→right→bottom→left), steps through sequentially at lines 70-87 |
| A002 | The animation builds permanent border blocks that accumulate over time | ✅ SATISFIED | `website/components/pricing/TetrisSnake.tsx:34,76-78` — `placed` array, pushes block with alpha 0.18 every 3 steps |
| A003 | The animation clears old blocks periodically to prevent density buildup | ✅ SATISFIED | `website/components/pricing/TetrisSnake.tsx:81-86` — increments `lap` on wrap, clears ~40% every 2 laps via `Math.random() > 0.4` filter |
| A004 | The animation reads the brand color every frame to track theme changes | ✅ SATISFIED | `website/components/pricing/TetrisSnake.tsx:43-46,92` — `brandColor()` reads `--color-brand` via `getComputedStyle`, called in `draw()` which runs every animation frame |
| A005 | The Team pricing card has a dark background that makes it stand out | ✅ SATISFIED | `website/components/pricing/pricing.module.css:47` — `.cardHighlighted { background: var(--fg-strong); }` |
| A006 | The highlighted card text is light-colored for readability on dark background | ✅ SATISFIED | `website/components/pricing/pricing.module.css:48` — `.cardHighlighted { color: var(--bg); }` |
| A007 | The highlighted card border becomes invisible against the dark background | ✅ SATISFIED | `website/components/pricing/pricing.module.css:49` — `.cardHighlighted { border-color: transparent; }` |
| A008 | The highlighted card CTA button uses the brand color background | ✅ SATISFIED | `website/components/pricing/pricing.module.css:78` — `.cardHighlighted .cardCta a, .cardHighlighted .cardCta button { background: var(--color-brand) !important; }` |
| A009 | The compatibility tile has a dark background that makes it stand out | ✅ SATISFIED | `website/components/bento/bento.module.css:118` — `.tCompat { background: var(--fg-strong); }` |
| A010 | Compatibility chips are visible against the dark tile background | ✅ SATISFIED | `website/components/bento/bento.module.css:133` — `.tCompat .compatChip { background: color-mix(in oklch, var(--bg) 8%, transparent); }` |
| A011 | Compatibility chip text uses the page background color for contrast | ✅ SATISFIED | `website/components/bento/bento.module.css:134` — `.tCompat .compatChip { color: var(--bg); }` |
| A012 | The footer tagline is displayed at a large display size | ✅ SATISFIED | `website/components/footer/Footer.tsx:40` — `fontSize: "clamp(32px, 3.6vw, 44px)"` inline style |
| A013 | The footer tagline italic word uses Fraunces with optical sizing | ✅ SATISFIED | `website/components/footer/Footer.tsx:50` — `fontVariationSettings: '"opsz" 96'` on the `<em>` element, with `className="font-serif italic"` |
| A014 | The pricing heading is large and prominent | ✅ SATISFIED | `website/components/pricing/Pricing.tsx:23` — `text-[clamp(40px,5.5vw,68px)]` Tailwind utility |
| A015 | The pricing heading has tight line height and letter spacing | ✅ SATISFIED | `website/components/pricing/Pricing.tsx:23` — `leading-[1.02] tracking-[-0.04em]` |
| A016 | The price flag is a rounded pill badge | ✅ SATISFIED | `website/components/pricing/pricing.module.css:91` — `.cardFlag { border-radius: 999px; }` |
| A017 | The price flag has a soft brand background | ✅ SATISFIED | `website/components/pricing/pricing.module.css:92` — `.cardFlag { background: var(--brand-soft); }` |
| A018 | The price flag uses the correct small font size | ✅ SATISFIED | `website/components/pricing/pricing.module.css:85` — `.cardFlag { font-size: 9.5px; }` |
| A019 | The price amount is displayed at 48px | ✅ SATISFIED | `website/components/pricing/pricing.module.css:114` — `.cardPriceValue { font-size: 48px; }` |
| A020 | The footer commit link is a rounded pill | ✅ SATISFIED | `website/components/footer/Footer.tsx:119` — `borderRadius: "999px"` inline style |
| A021 | The footer commit pill has a transparent border that appears on hover | ✅ SATISFIED | `website/components/footer/Footer.tsx:118` — `border: "1px solid transparent"` base, line 113 Tailwind `hover:border-[var(--border-soft)]` |
| A022 | Section spacing is 116px for comfortable visual breathing room | ✅ SATISFIED | `website/app/globals.css:59` — `--spacing-section: 116px;` |
| A023 | Bento section uses the spacing token instead of a hardcoded value | ✅ SATISFIED | `website/components/bento/bento.module.css:5` — `.section { padding: var(--spacing-section) 0 64px; }` |
| A024 | Pricing section uses the spacing token instead of a hardcoded value | ✅ SATISFIED | `website/components/pricing/pricing.module.css:4` — `.section { padding: var(--spacing-section) 0 64px; }` |
| A025 | Dark mode uses a warm off-white instead of pure white for strong text | ✅ SATISFIED | `website/app/globals.css:108` — `[data-theme="dark"] { --fg-strong: #FBFAF6; }` |
| A026 | Scan metrics use a hairline grid with 1px gaps between cells | ✅ SATISFIED | `website/components/bento/bento.module.css:296` — `.metricGrid { gap: 1px; }` |
| A027 | Scan metric cells use the card background for contrast against hairlines | ✅ SATISFIED | `website/components/bento/bento.module.css:305` — `.metric { background: var(--bg-card); }` |
| A028 | Agent chips are arranged in a two-column grid | ✅ SATISFIED | `website/components/bento/bento.module.css:326` — `.chipGrid { grid-template-columns: 1fr 1fr; }` |
| A029 | Each agent chip stacks its content vertically | ✅ SATISFIED | `website/components/bento/bento.module.css:332` — `.chip { flex-direction: column; }` |
| A030 | Agent chip markup uses block-level elements for vertical stacking | ✅ SATISFIED | `website/components/bento/tiles/AgentsTile.tsx:19-21` — three `<div>` elements for chipN, chipName, chipRole |
| A031 | The pricing section has a subtle top border separating it from content above | ✅ SATISFIED | `website/components/pricing/pricing.module.css:5` — `.section { border-top: 1px solid var(--hairline); }` |

**31/31 SATISFIED. 0 UNSATISFIED.**

## Independent Findings

**Prediction resolution:**

1. **"TetrisSnake per-frame brand color or wrong fallback"** — Not found. Uses `--color-brand` correctly (line 45), fallback is `#7A1B1B` as specified. Per-frame read confirmed in `draw()` → `brandColor()` call chain.
2. **"Missed child overrides in card/compat inversion"** — Not found. All spec-required overrides present. Builder also added `.cardPriceUnit` override (not in spec but necessary — see findings).
3. **"`--brand` instead of `--color-brand`"** — Not found. Grep confirmed zero instances of bare `--brand` in TetrisSnake.tsx.
4. **"Over-built highlighted card"** — Partially confirmed. `.cardPriceUnit` override (line 63) and `.cardHighlighted:hover` (line 51) added beyond explicit spec. Both are justified — without them, the price unit text and hover border would break the dark card.
5. **"Missed `.compatCatch` or `.cardFeatures` border-top"** — Not found. `.compatCatch` override at bento.module.css:138. `.cardFeatures` base border at pricing.module.css:134, highlighted override at line 73.

**Surprise finding:** The `.tCompat` hover state — see first finding below.

## AC Walkthrough

- AC1: TetrisSnake walks the pricing frame perimeter clockwise — ✅ PASS — perimeter array built clockwise (top→right→bottom→left) at TetrisSnake.tsx:62-66, sequential stepping at line 80
- AC2: Team pricing card fully inverted — ✅ PASS — dark bg (line 47), light text (48), transparent border (49), inverted flag (68-71), feature list border override (72-75), CTA override (76-80)
- AC3: Compat tile fully inverted with child elements — ✅ PASS — base inversion (117-121), h3/eyebrow (122-125), brand number color (126-128), paragraph (129-131), chips (132-136), compatCatch (137-139)
- AC4: Footer tagline at clamp size with Fraunces em — ✅ PASS — fontSize clamp (Footer.tsx:40), fontWeight 600 (41), lineHeight 1.0 (42), em with opsz 96 (50), fontWeight 400 (51), brand color (49)
- AC5: Pricing heading at clamp size — ✅ PASS — `text-[clamp(40px,5.5vw,68px)] leading-[1.02] tracking-[-0.04em]` at Pricing.tsx:23
- AC6: Price flag pill badge — ✅ PASS — padding 4px 9px (90), border-radius 999px (91), background var(--brand-soft) (92) at pricing.module.css
- AC7: Price amount 48px — ✅ PASS — pricing.module.css:114 `font-size: 48px`
- AC8: Footer commit pill — ✅ PASS — borderRadius 999px (119), padding 3px 10px (118), transparent border (118), hover via Tailwind utilities `hover:border-[var(--border-soft)] hover:bg-[var(--bg-elev)]` (113)
- AC9: --spacing-section is 116px, used by sections — ✅ PASS — globals.css:59 `116px`, bento.module.css:5 `var(--spacing-section)`, pricing.module.css:4 `var(--spacing-section)`
- AC10: Dark mode --fg-strong is #FBFAF6 — ✅ PASS — globals.css:108
- AC11: Scan metrics hairline grid — ✅ PASS — gap 1px (296), background var(--hairline) (297), border (298), cells with bg-card (305), no border-radius on cells (line 307 has no border-radius)
- AC12: Agent chips 2-column grid stacked — ✅ PASS — grid 1fr 1fr (326), flex-direction column (332), `<div>` elements in AgentsTile.tsx:19-21
- AC13: Pricing section border-top — ✅ PASS — pricing.module.css:5 `border-top: 1px solid var(--hairline)`
- No TypeScript build errors — ✅ PASS — `pnpm run build` clean, 2/2 tasks successful
- Site renders correctly in both themes — ⚠️ PARTIAL — build compiles and tokens are correct for both themes. Visual rendering requires browser comparison against handoff HTML which cannot be done in this environment. Token-level inspection confirms light/dark values are properly defined for all inverted elements.

## Blockers

None. All 31 contract assertions satisfied. All acceptance criteria pass (one PARTIAL due to environment limitation — visual rendering cannot be browser-tested in CLI). Build and lint clean. No regressions — TetrisSnake rewrite preserved reduced-motion check (line 22), IntersectionObserver pause (lines 132-140), cleanup on unmount (lines 150-155). No unused exports in new code (TetrisSnake exports only the component, which is imported by Pricing.tsx). No unused parameters — all function arguments consumed. No unhandled error paths in canvas code (ctx cast is safe given canvas element presence check at line 17).

## Findings

- **Code — tCompat hover state leaks through inversion:** `website/components/bento/bento.module.css:61,117-121` — `.tCompat` sets `border-color: transparent` but inherits `.tile:hover { border-color: var(--border); }` from line 61. On hover, the compat tile will flash a visible border against the dark background, breaking the inversion effect. `.cardHighlighted` handles this correctly with an explicit `:hover` override (pricing.module.css:51-53). The compat tile needs the same treatment: `.tCompat:hover { border-color: transparent; }`.

- **Code — TetrisSnake trail fade/filter mismatch:** `website/components/pricing/TetrisSnake.tsx:104,124` — Trail opacity fades to 0 at age 18 (`1 - age/18`) but particles aren't removed until age 20 (`age < 20`). Two ticks of invisible-but-tracked particles per trail item. Functionally harmless — the array stays bounded — but the constants should match.

- **Code — DPR capped at 2 without spec guidance:** `website/components/pricing/TetrisSnake.tsx:50` — `Math.min(window.devicePixelRatio || 1, 2)` caps the device pixel ratio. The handoff doesn't include this. Sensible performance guard for 3x displays, but unspecified. Accepted as reasonable over-building.

- **Code — cardPriceUnit highlighted override not in spec:** `website/components/pricing/pricing.module.css:63-64` — `.cardHighlighted .cardPriceUnit` added with `color-mix(in oklch, var(--bg) 70%, transparent)`. Not listed in the spec's file changes, but without it the price unit text (e.g., "/mo") would use `var(--ink-45)` which is invisible on the dark card. Necessary over-building.

- **Code — Per-frame getComputedStyle in TetrisSnake:** `website/components/pricing/TetrisSnake.tsx:44` — `brandColor()` calls `getComputedStyle(document.documentElement)` every animation frame. This is correct per spec (track theme changes) but forces style recalculation each frame. On low-end mobile with 60fps, that's 60 recalcs/second. The IntersectionObserver pause mitigates this when offscreen, but on-screen performance on budget devices is worth monitoring.

- **Code — placed array grows between lap clears:** `website/components/pricing/TetrisSnake.tsx:77` — Every 3 steps pushes to `placed`, only cleared 40% every 2 laps. For a typical frame (~200 perimeter cells), that's ~67 blocks per lap, ~134 before first clear. After clear, ~80 remain + 67 new = ~147. The array stabilizes around 150-200 entries — manageable but worth knowing. No cap exists.

## Deployer Handoff

Visual-only CSS changes plus a TetrisSnake algorithm rewrite. No API changes, no data model changes, no new dependencies.

**Merge note:** This is a marketing website — the changes affect visual appearance only. The one item worth visual QA in browser before shipping is the compat tile hover state (first finding) — hover the compat bento tile and confirm the border doesn't flash on the dark background. Everything else is structural CSS that either matches the handoff values or it doesn't.

**Theme testing:** Open the site in both light and dark mode. The inverted elements (Team pricing card, compat tile) swap `--fg-strong`/`--bg` so they should look correct in both themes, but visual confirmation is recommended since this can't be automated.

## Verdict
**Shippable:** YES

All 31 contract assertions satisfied. 13/14 ACs pass (1 partial — visual rendering unverifiable in CLI). Build and lint clean. The tCompat hover finding is real but cosmetic — it's a border flash on hover of a dark tile, not a functional break. The remaining findings are observations and minor debt. The implementation faithfully ports the handoff's visual specifications.
