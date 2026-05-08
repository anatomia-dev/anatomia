# Spec: Website Mobile Polish + Marquee Overhaul

**Created by:** AnaPlan
**Date:** 2026-05-08
**Scope:** .ana/plans/active/website-mobile-polish/scope.md

## Approach

Six CSS/copy/SVG fixes unified by one goal: the website should look intentional on every screen size. Three responsive tiers: phone (<640px), tablet (640–1024px), desktop (>1024px). These align with breakpoints already used in the codebase.

All display strings live in `website/lib/copy.ts`. All brand icons live in `website/lib/icons.tsx`. Responsive behavior is CSS-only via media queries in CSS modules. No new components, no new dependencies.

**Marquee strategy:** Replace 10 mixed items (tools + languages + package managers) with 6 focused AI tools: Claude Code, Cursor, Codex, Windsurf, Copilot, Cline. Add Copilot and Cline icons. Replace the Codex diamond placeholder with the OpenAI logomark. Animation duration scales: 24s desktop, 20s tablet, 16s phone.

**Tool references in copy.ts:** Four locations reference tool lists — hero meta (line 62), marquee items (line 84), bento compat chips (line 176), and pricing features (line 198). All four must be updated consistently to reflect the 6-tool roster or the generic "Works with any AI tool" phrasing.

**Nav overlay fix:** `var(--bg)` resolves to opaque hex in both themes. The bleed-through is a stacking context issue — the overlay is a DOM child of the `<nav>` which has `backdrop-filter` (creates a stacking context at z-150). The overlay at z-200 is trapped inside that context. Fix by rendering the overlay outside the nav's DOM tree using a React portal to `document.body`.

**Ship log responsive:** The summary row hides `psDivider` and `psLatest` at 880px but leaves dots and verified label untouched, causing text overlap. Fix by progressively hiding elements: at <640px show only kicker + version/count + chevron. Expanded proof rows switch from 6-column grid to a flex two-line stack below 760px.

**Dead footer:** Remove the proof feed footer entirely — PROOF_CHAIN.md doesn't exist, and generating it is out of scope.

## Output Mockups

### Marquee (all breakpoints)
```
─── Works with any AI tool ───
  [icon] Claude Code   [icon] Cursor   [icon] Codex   [icon] Windsurf   [icon] Copilot   [icon] Cline
```

### Hero meta row — phone (<640px)
```
MIT License
Works with any AI tool
5 languages parsed
Zero vendor lock-in
```

### Hero meta row — desktop (>1024px)
```
MIT License · Works with any AI tool · 5 languages parsed · Zero vendor lock-in
```

### Ship log summary — phone (<640px)
Collapsed: `[dot] Ship log · v1.0.2  [chevron]`
Expanded: `[dot] Ship log · 12 verified changes  [chevron]`

### Ship log summary — desktop (>1024px)
Collapsed: `[dot] Ship log · v1.0.2  |  #a3f9c1  2d ago     [dots] 10/12 verified  [chevron]`

### Ship log proof row — phone (<760px)
```
[feature] Proof chain health signal
                            6/6  ·  2d ago
```

### Ship log proof row — desktop
```
#a3f9c1  [feature]  Proof chain health signal     6/6    2d ago
```

## File Changes

### `website/lib/copy.ts` (modify)
**What changes:** Update four tool-reference locations: (1) `hero.meta[1]` from "Works with Claude, Cursor, Codex" to "Works with any AI tool"; (2) `marquee.items` from 10 mixed items to the 6 AI tools, add `marquee.title` field with "Works with any AI tool"; (3) `bento.compat.chips` from 5 items to the 6 tools; (4) `pricing.plans[0].features[4]` from "Works with Claude, Cursor, Codex, Zed" to "Works with any AI tool". Remove `proofFeed.footSource` and `proofFeed.footLink` fields. The `bento.compat.catchChip` stays as-is ("+ any markdown-aware tool").
**Pattern to follow:** Existing `copy.ts` string-record structure — all strings as `as const`.
**Why:** Stale tool lists confuse visitors and contradict the marquee. Dead link is a 404.

### `website/lib/icons.tsx` (modify)
**What changes:** (1) Replace the Codex diamond path with the OpenAI logomark SVG path from Simple Icons. (2) Add `"Copilot"` entry to `brandPaths` and `brandColors` with the GitHub Copilot SVG path (Simple Icons, CC0). (3) Add `"Cline"` entry to `brandPaths` and `brandColors` with the Cline SVG path (Simple Icons, CC0). (4) Remove entries for `"Zed"`, `"GitHub Actions"`, `"pnpm"`, `"TypeScript"`, `"Rust"`, `"Python"` — they're no longer in the marquee or bento chips. Keep `"Claude Code"`, `"Cursor"`, `"Codex"`, `"Windsurf"`.
**Pattern to follow:** Existing `brandPaths`/`brandColors` record pattern — 24x24 viewBox SVG paths.
**Why:** Codex has a placeholder diamond. Copilot and Cline have no icons at all (BrandIcon returns null for unknown names).

### `website/components/marquee/CompatMarquee.tsx` (modify)
**What changes:** Replace the hard-coded "Compatible runtimes" string with `copy.marquee.title` (the new field added to copy.ts).
**Pattern to follow:** Other components already read from `copy` — this one hard-coded the title.
**Why:** Aligns with the single-source-of-truth pattern for display strings.

### `website/components/marquee/marquee.module.css` (modify)
**What changes:** Adjust marquee animation duration: base 24s (desktop), add media queries for 20s at <1024px and 16s at <640px.
**Pattern to follow:** Existing animation declaration on `.track` (line 57). Add responsive overrides below the base rule.
**Why:** With 6 items instead of 10, the 40s duration creates a visible gap between the end and start of the duplicated track.

### `website/components/nav/NavMobile.tsx` (modify)
**What changes:** Render the mobile overlay via `createPortal(overlay, document.body)` instead of inline in the nav tree. Import `createPortal` from `react-dom`. This moves the overlay out of the nav's `backdrop-filter` stacking context (z-150) so its z-200 works against the root stacking context.
**Pattern to follow:** Standard React portal pattern. The component is already `"use client"`.
**Why:** The overlay's z-200 is trapped inside the nav's stacking context created by `backdrop-filter`. Portal escapes the DOM tree while keeping React state.

### `website/components/hero/hero.module.css` (modify)
**What changes:** Add phone breakpoint for `.heroMeta`: at <640px, set `flex-direction: column`, `align-items: flex-start`, `gap: 8px`. Hide the `·` separators on phone by targeting `.sep` with `display: none` at <640px.
**Pattern to follow:** Existing `max-width: 640px` breakpoint used elsewhere in hero.module.css (line 107).
**Why:** The meta row wraps awkwardly on phone because `flex-wrap` with `gap: 4px 22px` breaks mid-item.

### `website/components/proof-feed/proof-feed.module.css` (modify)
**What changes:** Three responsive additions:
1. **Summary row at <640px:** Hide `.shipDots` and `.dotsLabel`. This leaves only kicker + version/count + chevron — clean single line.
2. **Summary row at 640–880px:** Hide `.dotsLabel` text but keep `.shipDots` visible. Dots provide signal without taking text space.
3. **Proof rows at <760px (existing breakpoint):** Replace the current 3-column grid with a flex two-line layout. Top line: kind badge + title (flex, gap). Bottom line: assertions + age (flex, justify-end). Show assertions and age again (currently hidden at 760px).
Also remove `.feedFoot` styles — the footer is being deleted from markup.
**Pattern to follow:** The existing 760px and 880px breakpoints in this file. The bento grid's progressive min-width pattern is the structural analog, but this file already uses max-width — stay consistent within the file.
**Why:** Summary row overlaps because dots and verified label don't hide. Proof rows lose all signal below 760px (assertions and age disappear).

### `website/components/proof-feed/ProofFeed.tsx` (modify)
**What changes:** (1) Remove the `feedFoot` div (lines 115–120) that renders "Source of truth: PROOF_CHAIN.md" and "Full proof chain →". (2) For proof rows, wrap assertions and age in a container `<span>` so the two-line mobile layout can place them as a unit on the second line. Add a CSS class for this wrapper.
**Pattern to follow:** Existing row markup structure — keep the grid cells, add a wrapper span with a class for the mobile second-line grouping.
**Why:** Footer links to a file that doesn't exist. Wrapper span enables the flex two-line layout without restructuring the entire row.

## Acceptance Criteria

- [ ] AC1: Marquee displays exactly: Claude Code, Cursor, Codex, Windsurf, Copilot, Cline — with recognizable brand icons for each (OpenAI logo for Codex, GitHub Copilot goggles for Copilot, Cline robot face for Cline).
- [ ] AC2: Marquee title reads "Works with any AI tool" (not "Compatible runtimes").
- [ ] AC3: Marquee animation is noticeably faster on phone/tablet (fewer items need less travel time).
- [ ] AC4: Mobile hamburger nav overlay has a fully opaque background — no page content visible behind menu items.
- [ ] AC5: Hero meta row stacks cleanly on phone, wraps gracefully on tablet, stays inline on desktop. Content reads "Works with any AI tool".
- [ ] AC6: Ship log collapsed summary row renders cleanly at all three breakpoints — no overlapping text. On phone: only kicker + version/count + chevron visible.
- [ ] AC7: Ship log expanded summary row (open state with "X verified changes") renders cleanly at all breakpoints with no text overlap.
- [ ] AC8: Ship log expanded proof rows show a two-line stacked layout on phone: top line = kind badge + title, bottom line = assertions + age. Tablet shows kind + title + assertions at minimum. Desktop unchanged.
- [ ] AC9: Ship log footer references to PROOF_CHAIN.md are removed — both the link and the source label.
- [ ] AC10: No regressions on desktop — all existing layouts preserved at >1024px.
- [ ] AC11: All four tool-reference locations in copy.ts are updated consistently.
- [ ] AC12: `pnpm --filter demo-site build` succeeds with no errors.
- [ ] AC13: `pnpm --filter demo-site typecheck` succeeds with no errors.

## Testing Strategy

- **No unit tests** — this is CSS/copy/SVG. The website has no component test infrastructure. Visual verification across breakpoints is the testing strategy.
- **Build verification:** `pnpm --filter demo-site build` must succeed.
- **Type check:** `pnpm --filter demo-site typecheck` must succeed — the `copy` object is `as const`, so removing fields will surface any references.
- **Smoke test:** `website/scripts/smoke-test.sh` if it covers relevant pages.
- **Manual verification matrix:** 6 combinations (3 breakpoints × 2 ship log states). Desktop must be regression-free.

## Dependencies

None. All changes are within the website package. No CLI code touched.

## Constraints

- **Icon licensing:** All SVG paths must come from Simple Icons (CC0) or equivalent. The existing icons follow this pattern.
- **Breakpoint consistency:** Use the existing breakpoint values for each component (640, 760, 880, 1024). Don't introduce new breakpoints.
- **Copy source of truth:** All display strings live in `copy.ts`. Don't hard-code text in components.
- **`as const` assertion:** `copy.ts` uses `as const`. Adding/removing fields affects the type. TypeScript will catch dangling references.

## Gotchas

- **BrandIcon returns null for unknown names.** If `copy.marquee.items` contains a name that doesn't match `brandPaths`, the icon silently disappears. Names in `copy.ts` must exactly match keys in `icons.tsx`.
- **Marquee doubled array.** `CompatMarquee.tsx` does `[...items, ...items]` for seamless looping. Changing item count is fine, but the animation duration MUST scale — otherwise the gap between the two halves becomes visible.
- **Proof row grid has fixed pixel columns.** The desktop grid is `86px 62px minmax(0, 1fr) 78px 84px 20px`. The mobile override must completely redefine the layout — you can't just hide columns because the grid tracks remain. Switch to flex at the mobile breakpoint.
- **Portal needs SSR guard.** `createPortal` requires `document.body` which doesn't exist during server rendering. The component is `"use client"` but Next.js still does an SSR pass. Guard with `typeof document !== 'undefined'` or render the overlay conditionally only when `open` is true (which it never is on initial render).
- **Four tool-reference locations.** Hero meta (line 62), marquee items (line 84), bento compat chips (line 176), pricing features (line 198). Missing any one creates an inconsistency visitors will notice.
- **`proofFeed.footSource` and `proofFeed.footLink` removal.** These are referenced in `ProofFeed.tsx`. Remove the copy fields AND the rendering code in the same change — TypeScript will error if one is removed without the other (because `as const`).
- **`brandIconNames` export.** Proof findings flag it as unused. Don't remove it in this build — it's not in scope and removing exports has blast radius.
- **Copilot/Cline icon colors for dark mode.** If either icon uses #000000 for its brand color (like Cursor and Codex), it will be invisible on dark backgrounds. Check the Simple Icons brand color and use `currentColor` fallback if needed, or use the specific brand color that has sufficient contrast in both themes.

## Build Brief

### Rules That Apply
- All display strings in `copy.ts`, not in components. Components import from `@/lib/copy`.
- CSS modules for component styles — no `@apply` (Tailwind v4 doesn't resolve in modules).
- SVG paths in `icons.tsx` use 24×24 viewBox. Colors in `brandColors` record, paths in `brandPaths` record.
- Use `var()` CSS custom properties from `globals.css` for colors, fonts, spacing.
- No new dependencies. No structural component changes.
- Responsive breakpoints: use existing values per component (640, 760, 880, 1024). `max-width` in files that already use `max-width`.

### Pattern Extracts

**Icon registry pattern** (`website/lib/icons.tsx:18-53`):
```tsx
const brandColors: Record<string, string> = {
  "Claude Code": "#D97757",
  "Cursor": "#000000",
  "Codex": "#000000",
  // ... add Copilot and Cline here
};

const brandPaths: Record<string, string> = {
  "Claude Code": "m4.7144 15.9555...",
  // ... add entries following same pattern
};
```

**Marquee component pattern** (`website/components/marquee/CompatMarquee.tsx:11-13`):
```tsx
const items = copy.marquee.items;
const doubled = [...items, ...items];
```

**Proof row grid → mobile override** (`website/components/proof-feed/proof-feed.module.css:321-324`):
```css
@media (max-width: 760px) {
  .proofRow { grid-template-columns: 62px minmax(0, 1fr) 16px; gap: 12px; }
  .rowHash, .rowAssert, .rowAgo { display: none; }
}
```
This existing breakpoint is the one to replace — switch to flex and show assertions + age in a second line.

**Summary row responsive** (`website/components/proof-feed/proof-feed.module.css:130-134`):
```css
@media (max-width: 880px) {
  .psDivider, .psLatest { display: none; }
}
```
Add a <640px breakpoint below this to also hide `.shipDots` and `.dotsLabel`.

### Proof Context

**`website/lib/copy.ts`:**
- [stale] "headTitle says 'Click one'" and "headSub says 'Each row links'" — already fixed in previous PRs, no longer in the file.
- [active] "Three dead #pipeline links after anchor removal" — not in scope but be aware; don't introduce new `#pipeline` references.

**`website/lib/icons.tsx`:**
- [active] "Codex icon is a geometric diamond placeholder" — this build fixes it.
- [active] "brandIconNames exported but never imported" — don't remove, out of scope.
- [observation] "Rust and Cursor share #000000" — Codex also uses #000000. When adding Copilot/Cline, verify dark mode contrast.

**`website/components/proof-feed/ProofFeed.tsx`:**
- [active] "kindLabel defaults to 'improve' for any unrecognized kind" — not in scope, don't change.

**`website/components/nav/NavMobile.tsx`:**
- No active proof findings.

### Checkpoint Commands

- After copy.ts + icons.tsx changes: `pnpm --filter demo-site typecheck` — Expected: pass with no errors
- After all CSS changes: `pnpm --filter demo-site build` — Expected: successful build
- Final: `pnpm --filter demo-site build && pnpm --filter demo-site typecheck` — Expected: both pass

### Build Baseline
- No unit tests for website components. Test suite is CLI-only.
- Command: `pnpm --filter demo-site build`
- After build: same command should still pass. No test count to track — this is visual work.
- Regression focus: desktop layout must be unchanged at >1024px.
