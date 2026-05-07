# Build Report: Website Direct Polish

**Created by:** AnaBuild
**Date:** 2026-05-07
**Spec:** .ana/plans/active/website-direct-polish/spec.md
**Branch:** feature/website-direct-polish

## What Was Built

- `website/components/pricing/pricing.module.css` (modified): Removed `border` and `border-radius` from `.frame`, changed padding to `40px 64px` with mobile breakpoint `28px 20px`. Added `text-align: center` to `.top`. Changed `.grid` gap from `18px` to `14px`, breakpoint from `720px` to `820px`. Added responsive `.card` padding `40px` at `min-width: 1024px`.
- `website/components/pricing/Pricing.tsx` (modified): Added `maxWidth: "18ch"` to h2 inline style, matching the blurb's `maxWidth: "52ch"` pattern.
- `website/components/footer/Footer.tsx` (modified): Added `letterSpacing: "-0.02em"` to tagline `<em>` inline style. Stripped commit pill styling (border, padding, borderRadius, `rounded-full` class) to plain `<span>`. Removed `mt-10` from footer className.
- `website/app/globals.css` (modified): Added `footer { margin-top: 40px; }` and `:has()` bonding rule `section[data-component="proof-feed"]:has([data-open="false"]) + footer { margin-top: 0; }` in UTILITIES section.
- `website/lib/copy.ts` (modified): Removed `\nClick one.` from `proofFeed.headTitle`. Changed headSub `links to` → `is` to remove link implication. Changed hero headline `*Ana*` → `*ana*` for brand typography.
- `website/components/bento/bento.module.css` (modified): Added `.tCompat:hover { border-color: transparent; }` to prevent hover border flash on inverted tile.
- `website/components/nav/Nav.tsx` (modified): Changed GitHub link button from `h-11 w-11` to `h-[34px] w-[34px]` with `relative` and `after:absolute after:inset-[-5px] after:content-['']` for 44px touch target.
- `website/components/nav/ThemeToggle.tsx` (modified): Same icon button treatment as Nav.tsx.
- `website/components/nav/NavMobile.tsx` (modified): Same treatment for hamburger button and close button.
- `website/MAINTENANCE_MANUAL.md` (modified): Replaced `(sub)` route group with `(marketing)` showing all 9 pages and `(app)` as empty stub. Updated "How to Add a New Page" to direct all pages to `(marketing)/`. Fixed file naming table layout.tsx example. Removed all SubNav references.

## PR Summary

- Fix 12 visual and copy regressions found during post-merge review, matching the locked handoff HTML
- Remove pricing frame static border, center content, adjust grid gap/breakpoint and responsive padding
- De-style footer commit pill to plain text, add CSS margin + `:has()` bonding rule for flush proof-feed/footer
- Update stale copy: remove "Click one", fix link language in proof feed, lowercase `*ana*` in hero
- Shrink nav icon buttons to 34px visual with 44px pseudo-element touch targets, fix tCompat hover border flash, update MAINTENANCE_MANUAL route references

## Acceptance Criteria Coverage

- AC1 "Pricing frame has NO static CSS border" → pricing.module.css `.frame` block has no `border:` property ✅
- AC2 "Pricing frame content centered" → `.top` has `text-align: center` ✅
- AC3 "Pricing h2 has max-width: 18ch" → Pricing.tsx h2 `style={{ maxWidth: "18ch" }}` ✅
- AC4 "Pricing frame padding 40px 64px / 28px 20px" → `.frame` padding + `@media (max-width: 720px)` ✅
- AC5 "Pricing grid gap 14px, breakpoint 820px" → `.grid` gap + `@media (min-width: 820px)` ✅
- AC6 "Price cards padding: 40px at 1024px" → `@media (min-width: 1024px) { .card { padding: 40px; } }` ✅
- AC7 "Footer tagline em letter-spacing: -0.02em" → `letterSpacing: "-0.02em"` in em inline style ✅
- AC8 "Footer commit pill plain text" → Stripped border, padding, borderRadius, rounded-full ✅
- AC9 "Collapsed proof feed flush against footer" → `:has([data-open="false"]) + footer { margin-top: 0 }` ✅
- AC10 "Footer mt-10 replaced with CSS margin-top: 40px" → Tailwind class removed, CSS rule added ✅
- AC11 "Proof feed headTitle no Click one" → String updated ✅
- AC12 "Proof feed headSub describes rows as display" → "links to" → "is" ✅
- AC13 "tCompat hover no border flash" → `.tCompat:hover { border-color: transparent; }` ✅
- AC14 "MAINTENANCE_MANUAL references (marketing), no (sub), no SubNav" → Updated, grep confirms zero matches ✅
- AC15 "Hero headline lowercase *ana*" → `*Ana*` → `*ana*` ✅
- AC16 "Nav icon buttons 34px visual with 44px touch targets" → All 4 buttons updated ✅
- AC17 "pnpm --filter anatomia-website build passes" → Passes after every commit ✅
- AC18 "Site renders correctly in both themes" → NO TEST (requires manual visual inspection)

## Implementation Decisions

- Placed the `@media (max-width: 720px)` breakpoint for `.frame` mobile padding immediately after the `.frame` block, following the existing pattern where responsive overrides sit directly below their base rule.
- Used `max-width: 720px` (not `min-width`) for mobile frame padding since the spec describes it as "at max-width: 720px, set padding: 28px 20px" — the mobile-first approach would be `min-width` for desktop, but the spec explicitly mentions this as a mobile breakpoint.
- The `:has()` bonding rule targets `section[data-component="proof-feed"]` (an attribute selector) rather than a CSS module class, as noted in the spec's gotchas — module classes get hashed.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
pnpm --filter anatomia-website build
✓ Generating static pages (13/13)
Route (app): 11 routes, all static
Build: PASS
Tests: 0 (website has no test infrastructure)
```

### After Changes
```
pnpm --filter anatomia-website build
✓ Generating static pages (13/13)
Route (app): 11 routes, all static
Build: PASS
Tests: 0 (website has no test infrastructure)
```

### Comparison
- Tests added: 0 (no test infrastructure; spec explicitly states "No unit tests")
- Tests removed: 0
- Regressions: none

### New Tests Written
None — spec's testing strategy is build verification + manual visual inspection.

## Verification Commands
```bash
pnpm --filter anatomia-website build
pnpm run lint
```

## Git History
```
6fe53d8 [website-direct-polish] MAINTENANCE_MANUAL: replace (sub) with (marketing)/(app)
567b8b6 [website-direct-polish] Nav: 34px icon buttons with 44px touch targets
c9ed20b [website-direct-polish] Bento: prevent tCompat hover border flash
d729bf9 [website-direct-polish] Copy: remove "Click one", fix headSub link language, lowercase ana
d0a9a7e [website-direct-polish] Footer: letter-spacing, de-style commit pill, CSS margin + bonding
082d5d9 [website-direct-polish] Pricing frame: remove border, center content, adjust grid/padding
```

## Open Issues

1. **MAINTENANCE_MANUAL decision 7 contradicts implementation.** Decision 7 ("Touch targets at 44px") says "All icon buttons are `h-11 w-11` (44×44px)" and explains the WCAG rationale. After this build, buttons are `h-[34px] w-[34px]` with pseudo-element touch targets. The decision text should be updated to reflect the new approach (34px visual, 44px touch via pseudo-element). Not updated here because the spec didn't include it in file changes.

2. **Pre-existing lint warning.** `packages/cli/src/utils/git-operations.ts:169` has an unused eslint-disable directive. Not introduced by this build — present in baseline.

3. **AC18 (both themes) cannot be verified automatically.** Requires manual visual inspection with `pnpm --filter anatomia-website dev`. The build passes, which verifies no structural regressions, but visual theme correctness is a judgment call.

Verified complete by second pass.
