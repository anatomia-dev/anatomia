# Scope: Website Mobile Polish + Marquee Overhaul

**Created by:** Ana
**Date:** 2026-05-08

## Intent
The website's mobile experience is broken in several visible ways: the ship log header text overlaps and garbles, the hamburger nav has no opaque background so content bleeds through, the hero meta row wraps awkwardly, ship log expanded rows lose all proof signal on narrow screens, the compatibility marquee has placeholder icons and a stale tool list, and the "Full proof chain" link is a 404. These are all on the primary marketing surface. Fix them, and do it responsively across phone, tablet, and desktop — not just "desktop and mobile."

## Complexity Assessment
- **Kind:** fix
- **Size:** medium
- **Files affected:**
  - `website/lib/copy.ts` — marquee items, hero meta, proof chain link
  - `website/lib/icons.tsx` — add Copilot + Cline icons, replace Codex placeholder
  - `website/components/marquee/marquee.module.css` — animation speed, responsive
  - `website/components/marquee/CompatMarquee.tsx` — title text
  - `website/components/nav/NavMobile.tsx` — opaque background fix
  - `website/components/hero/hero.module.css` — meta row responsive layout
  - `website/components/proof-feed/proof-feed.module.css` — summary row + expanded row mobile layout
  - `website/components/proof-feed/ProofFeed.tsx` — possibly restructure row markup for mobile
- **Blast radius:** Website only. No CLI code touched. All changes are CSS/copy/SVG.
- **Estimated effort:** 3-5 hours
- **Multi-phase:** no

## Approach
Six distinct fixes unified by one goal: the website should look intentional on every screen size. The responsive strategy uses three tiers — phone (<640px), tablet (640-1024px), desktop (>1024px) — aligned with existing breakpoints in the codebase (Tailwind `md:` at 768px, `lg:` at 1024px, plus CSS module breakpoints at 640/720/760/880/1024).

Each fix is CSS/copy/SVG — no new components, no new dependencies, no structural changes.

## Acceptance Criteria
- AC1: Marquee displays exactly: Claude Code, Cursor, Codex, Windsurf, Copilot, Cline — with recognizable brand icons for each (OpenAI logo for Codex, GitHub Copilot goggles for Copilot, Cline robot face for Cline).
- AC2: Marquee title reads "Works with any AI tool" (not "Compatible runtimes").
- AC3: Marquee animation is noticeably faster on phone/tablet (fewer items need less travel time).
- AC4: Mobile hamburger nav overlay has a fully opaque background — no page content visible behind menu items.
- AC5: Hero meta row stacks cleanly on phone, wraps gracefully on tablet, stays inline on desktop. Content updated — "Works with Claude, Cursor, Codex" replaced with a short form that reflects the new 6-tool marquee (e.g., "Works with 6+ AI tools" or "Works with any AI tool"). AnaPlan decides exact wording.
- AC6: Ship log collapsed summary row renders cleanly at all three breakpoints — no overlapping text, no garbled dots. On phone: hide ship dots and verified count, show only kicker + version/count + chevron.
- AC7: Ship log expanded summary row (open state with "X verified changes") renders cleanly at all breakpoints with no text overlap.
- AC8: Ship log expanded proof rows show a two-line stacked layout on phone: top line = kind badge + title, bottom line = assertions + age (right-aligned). Tablet shows at minimum kind + title + assertions. Desktop unchanged.
- AC9: Ship log footer references to PROOF_CHAIN.md are removed — both the "Full proof chain →" link and the "Source of truth: PROOF_CHAIN.md" label (the file does not exist in the repo). Either remove the footer entirely or replace with content that points to something real.
- AC10: No regressions on desktop — all existing layouts preserved at >1024px.

## Edge Cases & Risks
- **Icon licensing:** All icons must come from Simple Icons (CC0) or equivalent open sources. The existing icons use this approach.
- **Marquee speed with fewer items:** Going from 10 items to 6 means the animation loop is shorter. If the speed isn't adjusted, the gap between the end of the list and the start of the duplicate becomes visible. The doubled-track technique handles this but animation duration needs to scale with item count.
- **Ship log summary row has two states:** collapsed shows version, expanded shows "X verified changes." Both must work at all three breakpoints — that's 6 combinations to verify.
- **var(--bg) opacity:** The mobile nav sets `background: var(--bg)`. If this resolves to a transparent or semi-transparent value in dark mode, the fix might need to use an explicit opaque color or `var(--bg)` with a fallback. Investigate the actual computed value in both themes.
- **Hero meta row content:** "Works with Claude, Cursor, Codex" is stale — needs updating. But the new list (6 tools) is too long for this meta row. Consider abbreviating: "Works with 6+ AI tools" or similar.
- **Existing breakpoint inconsistency:** The codebase mixes Tailwind breakpoints (768px `md:`, 1024px `lg:`) with CSS module breakpoints (640, 720, 760, 880, 1024). New breakpoints should prefer the existing values for each component rather than introducing new ones.

## Rejected Approaches
- **Card layout for mobile ship log rows.** Considered a full card-per-entry redesign. Rejected because a two-line stacked row achieves the same information density gain without restructuring the component. Cards also break the visual rhythm of the log-as-table metaphor.
- **Pointing proof chain link to `.ana/proof_chain.json`.** The JSON file exists but isn't human-readable. Linking to it would confuse visitors. Generating a PROOF_CHAIN.md is a separate feature — out of scope.
- **Keeping Zed and Aider in marquee.** Zed's `.claude/` context pickup is unverified. Aider technically works but targets a different audience. Dropped to keep the list honest and focused on tools our sniper customer uses.
- **Redesigning the nav mobile overlay.** The structure is fine — it just needs an opaque background. No need to rebuild the component.

## Open Questions
None — all design decisions resolved in conversation.

## Exploration Findings

### Patterns Discovered
- `website/lib/icons.tsx`: SVG paths stored in `brandPaths` record, colors in `brandColors`. `BrandIcon` component looks up by display name string. Adding new icons = adding entries to both records.
- `website/lib/copy.ts:82-87`: Marquee items list drives the carousel. Single source of truth.
- `website/components/proof-feed/proof-feed.module.css:260-324`: Proof rows use CSS Grid with 6 columns on desktop, collapsing to 3 columns at 760px. The 760px breakpoint hides hash, assertions, and age — leaving only kind + title + arrow.
- `website/components/proof-feed/proof-feed.module.css:130-134`: Summary row hides divider and latest ticker at 880px, but doesn't hide the dots or verified label, causing the overlap.
- `website/components/nav/NavMobile.tsx:42`: Overlay uses `background: var(--bg)`. Need to verify `--bg` is opaque in both themes.
- `website/components/hero/hero.module.css:226-240`: Meta row is `flex-wrap` with `gap: 4px 22px`. No mobile-specific breakpoint — it just wraps, which looks bad.

### Constraints Discovered
- [TYPE-VERIFIED] Breakpoint mix (multiple files) — Tailwind uses 768/1024, CSS modules use 640/720/760/880/1024. No single system.
- [OBSERVED] Marquee animation duration — currently 40s for 10 items. With 6 items the duration should be ~24s, or faster on mobile.
- [TYPE-VERIFIED] Codex icon placeholder (icons.tsx:38) — `M12 0L24 12 12 24 0 12Z` is literally a diamond shape. Needs real OpenAI path.
- [OBSERVED] PROOF_CHAIN.md — file does not exist in repo. Link at copy.ts:228 is dead.

### Test Infrastructure
- `website/scripts/smoke-test.sh` — exists but scope is CSS/copy changes. Visual verification needed across breakpoints. No unit tests for website components.

## For AnaPlan

### Structural Analog
`website/components/bento/bento.module.css` — best responsive pattern in the codebase. Uses progressive enhancement with min-width breakpoints at 720px and 1024px. Three-tier layout: single column → 2-col grid → full grid. The proof-feed CSS should follow this same progressive pattern rather than the current max-width approach.

### Relevant Code Paths
- `website/lib/copy.ts` — all display copy, marquee items (line 82), hero meta (line 60), proof chain link (line 228)
- `website/lib/icons.tsx` — SVG icon registry, BrandIcon component
- `website/components/marquee/CompatMarquee.tsx` — marquee component, reads `copy.marquee.items`
- `website/components/marquee/marquee.module.css` — marquee styles, animation
- `website/components/nav/NavMobile.tsx` — mobile nav overlay
- `website/components/hero/hero.module.css` — hero meta row styles (line 226)
- `website/components/proof-feed/proof-feed.module.css` — summary row + proof row responsive styles
- `website/components/proof-feed/ProofFeed.tsx` — proof row markup, may need restructuring for two-line mobile layout

### Patterns to Follow
- Icon additions: follow the existing pattern in `icons.tsx` — add to `brandPaths` and `brandColors` records, use 24x24 viewBox SVG paths from Simple Icons.
- Responsive: follow `bento.module.css` progressive min-width pattern where possible. Where existing component uses max-width, stay consistent within that file.
- Copy changes: all display strings live in `copy.ts`. Don't hardcode text in components.

### Known Gotchas
- The marquee duplicates its items array for seamless looping (`[...items, ...items]`). Changing item count affects animation timing — fewer items = shorter track = need shorter duration or items appear sparse.
- The proof row grid uses explicit `grid-template-columns` with fixed pixel widths. The mobile two-line layout likely needs a different grid definition or switching to flex for the mobile breakpoint.
- `BrandIcon` returns `null` if the name isn't found in `brandPaths`. If copy.ts references a name that doesn't match the icon registry, the icon silently disappears. Names must match exactly.

### Things to Investigate
- What does `var(--bg)` compute to in dark mode? If it's already opaque, the mobile nav issue might be z-index or stacking context related rather than transparency. Check `globals.css` for the `--bg` definition in both themes.
- The proof row two-line layout: should the mobile grid switch to `display: flex; flex-wrap: wrap` or stay as grid with `grid-template-rows`? Investigate which approach keeps the code simpler given the existing structure.
