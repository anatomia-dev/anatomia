# Build Report: Website nav, scroll targets, compat icons, and copy accuracy

**Created by:** AnaBuild
**Date:** 2026-05-08
**Spec:** .ana/plans/active/website-nav-copy-polish/spec.md
**Branch:** feature/website-nav-copy-polish

## What Was Built

- `website/lib/copy.ts` (modified): Removed Pipeline from nav links (3 remain: Agents, Pricing, Docs). Added `ctaInstallHref` field pointing to npm URL. Hero primary CTA href changed to npm, secondary to `#agents`. Pricing free-tier CTA href changed to npm. Footer Pipeline link href changed to `/#agents`. About title changed to "One *idea*. Shipped with proof." (removes headcount). About body[1] changed to reference Denver instead of San Francisco, removed "two-person team". Contact coda changed to "Based in Denver."
- `website/lib/icons.tsx` (created): New file exporting `BrandIcon` component and `brandIconNames` list. Contains inline SVG path data from Simple Icons for all 10 compatible tools. Each brand has its official color. Codex uses a geometric diamond (OpenAI removed their icon from Simple Icons).
- `website/components/marquee/CompatMarquee.tsx` (modified): Replaced `glyphColors` map and letter-circle rendering with `BrandIcon` component. Removed the `glyphColors` constant entirely. The `.glyph` CSS class is retained for layout.
- `website/components/bento/tiles/CompatTile.tsx` (modified): Added `BrandIcon` (size 14) before each chip's text label with flex layout and gap. Catch chip ("+ any markdown-aware tool") stays text-only since it has no icon mapping.
- `website/components/bento/Bento.tsx` (modified): Removed `id="pipeline"` from the outer `<section>` element.
- `website/components/pricing/Pricing.tsx` (modified): Removed `id="pricing"` from `<section>`. Added `id="pricing"` and `style={{ scrollMarginTop: 72 }}` to the inner `<div className={styles.inner}>`.
- `website/components/hero/Hero.tsx` (modified): Added `target="_blank"` and `rel="noopener noreferrer"` to the primary CTA `<a>` tag.
- `website/components/nav/Nav.tsx` (modified): Changed Install CTA from `<Link href="/#pricing">` to `<a href={copy.nav.ctaInstallHref} target="_blank" rel="noopener noreferrer">`. Link import retained (still used by wordmark and nav links).
- `website/components/nav/NavMobile.tsx` (modified): Changed Install CTA from `<Link href="/#pricing">` to `<a href={copy.nav.ctaInstallHref} target="_blank" rel="noopener noreferrer" onClick={close}>`. Link import retained.

## PR Summary

- Drop Pipeline from navigation, update all Install CTAs to link to npm package page (opens in new tab)
- Fix pricing scroll target by moving anchor from section wrapper to inner heading element with scroll-margin-top offset
- Replace placeholder letter-circle glyphs with real brand SVG icons (Simple Icons, CC0) across marquee and bento compat tile
- Update about page copy to remove headcount claims and reference Denver; update contact coda
- Remove dead `#pipeline` anchor from bento section; redirect footer Pipeline link to `#agents`

## Acceptance Criteria Coverage

- AC1 "Navbar contains exactly three links" -> copy.ts nav.links array has 3 entries (Agents, Pricing, Docs)
- AC2 "Clicking Agents scrolls to agents tile" -> No change needed; `id="agents"` already on inner div in AgentsTile.tsx
- AC3 "Clicking Pricing scrolls correctly" -> Pricing.tsx: `id="pricing"` moved to inner div with `scrollMarginTop: 72`
- AC4 "Nav Install CTA links to npm, new tab" -> Nav.tsx: `<a href={copy.nav.ctaInstallHref} target="_blank">`
- AC5 "Hero Install links to npm, new tab" -> Hero.tsx: `target="_blank" rel="noopener noreferrer"` added; href from copy.ts
- AC6 "Hero secondary scrolls to #agents" -> copy.ts: `hero.ctas.secondary.href` changed to `#agents`
- AC7 "Pricing free-tier Install links to npm" -> copy.ts: `pricing.plans[0].cta.href` changed to npm URL; Button auto-detects external
- AC8 "Footer links correct" -> copy.ts: footer Pipeline link href changed to `/#agents`
- AC9 "CompatMarquee displays real SVG brand icons" -> CompatMarquee.tsx: `BrandIcon` replaces letter-circles; `glyphColors` removed
- AC10 "CompatTile chips display brand icons" -> CompatTile.tsx: `BrandIcon` added before each chip text
- AC11 "About title contains no headcount" -> copy.ts: title changed to "One *idea*. Shipped with proof."
- AC12 "About body no headcount, references Denver" -> copy.ts: body[1] says "based in Denver", no "two-person"
- AC13 "Contact coda says Denver" -> copy.ts: `coda[0]` changed to "Based in Denver."
- AC14 "Manifesto unchanged" -> No changes to `copy.manifesto`
- AC15 "License unchanged" -> No changes to `copy.license`
- AC16 "Site builds without errors" -> `pnpm build` passes, all 11 pages rendered
- AC17 "No TypeScript errors" -> `pnpm tsc --noEmit` passes clean

## Implementation Decisions

- **Codex icon:** OpenAI removed their icon from Simple Icons. Used a geometric diamond SVG path (`M12 0L24 12 12 24 0 12Z`) matching the `◆` glyph from the spec mockup, with color `#000000`.
- **Brand colors in icons.tsx:** Each SVG is filled with the brand's official color from Simple Icons rather than using `currentColor`. This ensures icons are recognizable across light/dark themes.
- **React import for JSX type:** Added `import type React from "react"` to icons.tsx for the `React.JSX.Element` return type, since bare `JSX` namespace isn't available in the project's TS config.
- **CompatTile chip layout:** Used inline `style={{ display: "inline-flex", alignItems: "center", gap: 6 }}` on chip spans rather than modifying the CSS module, matching the spec's "gains a flex layout" description without introducing new CSS classes.

## Deviations from Contract

### A013: Marquee displays real brand icons instead of placeholder letters
**Instead:** Verified by removing `glyphColors` map and replacing letter rendering with `BrandIcon` component
**Reason:** Contract matcher `not_equals` with value `"exists"` checks that `glyphColors` no longer exists. The constant was deleted entirely, not just emptied.
**Outcome:** Functionally equivalent — `glyphColors` is gone, brand icons render instead.

## Test Results

### Baseline (before changes)
```
cd website && pnpm build
Route (app)       Revalidate  Expire
11 pages, 0 errors
```

```
cd packages/cli && pnpm vitest run
Test Files  95 passed (95)
     Tests  1994 passed | 2 skipped (1996)
```

### After Changes
```
cd website && pnpm build
Route (app)       Revalidate  Expire
11 pages, 0 errors — same pages as baseline
```

```
cd website && pnpm tsc --noEmit
(no errors)
```

```
cd packages/cli && pnpm vitest run
Test Files  95 passed (95)
     Tests  1994 passed | 2 skipped (1996)
```

### Comparison
- Tests added: 0 (no website test framework; build verification is the gate)
- Tests removed: 0
- Regressions: none
- CLI test suite: identical to baseline (1994 passed, 2 skipped)

### New Tests Written
None. Per spec: "This scope doesn't introduce a test framework — build verification is the acceptance gate."

## Verification Commands
```bash
cd website && pnpm build
cd website && pnpm tsc --noEmit
cd packages/cli && pnpm vitest run
```

## Git History
```
a5efeb9 [website-nav-copy-polish] Fix scroll targets and external link CTAs
5ea4374 [website-nav-copy-polish] Add brand icons to marquee and compat tile
8174355 [website-nav-copy-polish] Update copy.ts — nav, CTAs, about, contact
```

## Open Issues

- **Codex icon is a geometric placeholder:** OpenAI is not in Simple Icons (removed at brand's request). The diamond shape is visually distinct but not the official Codex/OpenAI branding. If an official icon source is found later, swap the path in `icons.tsx`.
- **Rust and Cursor icons share `#000000` fill:** These brands' official Simple Icons colors are both black. In dark mode, they may not be visible against dark backgrounds. The `.glyph` container has `background: var(--ink-15)` which provides contrast, but worth verifying visually.
- **CompatTile chip inline styles:** Used inline `style` for flex layout rather than CSS module class. This works but is inconsistent with the rest of the component which uses CSS modules. A `compatChipIcon` class in `bento.module.css` would be cleaner.
- **Manifesto still links to `/#pipeline`:** `copy.manifesto.outbound[0].href` is `"/#pipeline"` — this was not in the spec's File Changes so it was left unchanged, but the Pipeline anchor no longer exists. The link will scroll to page top instead of the bento section.

Verified complete by second pass.
