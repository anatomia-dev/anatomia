# Verify Report: Website Direct Polish

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-07
**Spec:** .ana/plans/active/website-direct-polish/spec.md
**Branch:** feature/website-direct-polish

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/website-direct-polish/contract.yaml
  Seal: INTACT (hash sha256:de97c7400321271c3ec4625fb1e0e0d459fef05494aefa15d6c4ac03b86c6b3f)
```

Build: ✅ passes (all 13 static pages generated, zero errors)
Lint: ✅ passes (1 pre-existing warning — unused eslint-disable in anatomia-cli, not related to this build)
Tests: N/A (website has no test infrastructure)

## Contract Compliance
| ID   | Says                                                         | Status       | Evidence |
|------|--------------------------------------------------------------|--------------|----------|
| A001 | Pricing frame has no static CSS border                       | ✅ SATISFIED | `website/components/pricing/pricing.module.css:13-17` — `.frame` block has no `border:` property |
| A002 | Pricing frame has no border-radius                           | ✅ SATISFIED | `website/components/pricing/pricing.module.css:13-17` — `.frame` block has no `border-radius:` property |
| A003 | Pricing frame preserves overflow hidden                      | ✅ SATISFIED | `website/components/pricing/pricing.module.css:16` — `overflow: hidden` present |
| A004 | Pricing frame content is centered                            | ✅ SATISFIED | `website/components/pricing/pricing.module.css:10` — `.top` has `text-align: center` |
| A005 | Pricing headline has max-width constraint                    | ✅ SATISFIED | `website/components/pricing/Pricing.tsx:23` — `style={{ color: "var(--fg-strong)", maxWidth: "18ch" }}` |
| A006 | Pricing frame has correct desktop padding                    | ✅ SATISFIED | `website/components/pricing/pricing.module.css:15` — `padding: 40px 64px` |
| A007 | Pricing frame has compact padding on mobile                  | ✅ SATISFIED | `website/components/pricing/pricing.module.css:18-19` — `@media (max-width: 720px) { .frame { padding: 28px 20px; } }` |
| A008 | Pricing grid uses tighter gap                                | ✅ SATISFIED | `website/components/pricing/pricing.module.css:30` — `gap: 14px` |
| A009 | Pricing grid two-column breakpoint                           | ✅ SATISFIED | `website/components/pricing/pricing.module.css:32` — `min-width: 820px` |
| A010 | Price cards get more padding on large screens                | ✅ SATISFIED | `website/components/pricing/pricing.module.css:48-49` — `@media (min-width: 1024px) { .card { padding: 40px; } }` |
| A011 | Footer tagline em has refined letter-spacing                 | ✅ SATISFIED | `website/components/footer/Footer.tsx:52` — `letterSpacing: "-0.02em"` |
| A012 | Footer commit display has no visible border                  | ✅ SATISFIED | `website/components/footer/Footer.tsx:111-117` — plain `<span>`, no `border` property |
| A013 | Footer commit display has no pill padding                    | ✅ SATISFIED | `website/components/footer/Footer.tsx:111-117` — no `padding` property |
| A014 | Footer margin comes from CSS, not Tailwind                   | ✅ SATISFIED | `website/components/footer/Footer.tsx:18` — className is `"border-t pt-15 pb-9"`, no `mt-10` |
| A015 | Footer has default top margin in global CSS                  | ✅ SATISFIED | `website/app/globals.css:228` — `footer { margin-top: 40px; }` |
| A016 | Collapsed proof feed sits flush against footer               | ✅ SATISFIED | `website/app/globals.css:231-233` — `:has([data-open="false"]) + footer { margin-top: 0; }` |
| A017 | Proof feed headline no longer asks users to click            | ✅ SATISFIED | `website/lib/copy.ts:224` — `"Every commit has *receipts*."` — no "Click one" |
| A018 | Proof feed description does not promise clickable rows       | ✅ SATISFIED | `website/lib/copy.ts:226` — "Each row is the verification record" — no "links to" |
| A019 | Compatibility tile does not flash border on hover            | ✅ SATISFIED | `website/components/bento/bento.module.css:122-124` — `.tCompat:hover { border-color: transparent; }` |
| A020 | Maintenance manual no longer references (sub)                | ✅ SATISFIED | `website/MAINTENANCE_MANUAL.md` — grep confirms zero `(sub)` matches |
| A021 | Maintenance manual does not reference SubNav                 | ✅ SATISFIED | `website/MAINTENANCE_MANUAL.md` — grep confirms zero `SubNav` matches |
| A022 | Hero headline uses lowercase ana                             | ✅ SATISFIED | `website/lib/copy.ts:53` — `"Your AI doesn't know your codebase. *ana* does."` |
| A023 | Hero headline does not use uppercase Ana                     | ✅ SATISFIED | `website/lib/copy.ts:53` — confirmed lowercase `*ana*` |
| A024 | Nav icon buttons are 34px not 44px                           | ✅ SATISFIED | `website/components/nav/Nav.tsx:92` — `h-[34px] w-[34px]`, no `h-11 w-11` |
| A025 | Nav icon buttons have expanded touch targets                 | ✅ SATISFIED | `website/components/nav/Nav.tsx:92` — `after:absolute after:inset-[-5px] after:content-['']` |
| A026 | Theme toggle button is 34px visually                         | ✅ SATISFIED | `website/components/nav/ThemeToggle.tsx:15` — `h-[34px] w-[34px]`, no `h-11 w-11` |
| A027 | Mobile nav hamburger button is 34px visually                 | ✅ SATISFIED | `website/components/nav/NavMobile.tsx:21` — `h-[34px] w-[34px]`; close button line 60 also `h-[34px] w-[34px]` |
| A028 | Website builds successfully                                  | ✅ SATISFIED | Build completed: 13 static pages generated, zero errors |

## Independent Findings

All 28 contract assertions satisfied. Diff is tight — 10 files, ~60 lines changed, no new files, no new dependencies. Every change maps to a spec fix. No over-building detected: no unused exports, no dead code paths, no parameters or functions beyond what the spec requires.

**Prediction resolutions:**
1. "Stale comment or unused variable" — **Not found.** Clean diff.
2. "h2 maxWidth centering" — **Confirmed as observation.** The h2 has `maxWidth: "18ch"` but no `margin: 0 auto`. The `text-align: center` on `.top` centers inline text content but the block-level h2 box itself is left-biased when narrower than its container. However: the spec explicitly says to follow the blurb `<p>` pattern which has the same issue (`maxWidth: "52ch"`, no `margin: auto`). The builder followed the spec's instruction correctly. If this looks wrong visually, it's a spec/handoff gap, not a build error.
3. "`:has()` rule fragility" — **Confirmed as observation.** The `+` sibling combinator requires ProofFeed to remain the direct previous sibling of `<footer>` in the DOM. The spec acknowledges this in Gotchas. Documented below.
4. "Touch target pseudo-element fragility" — **Confirmed as observation.** Adding `overflow: hidden` to any nav button would clip the pseudo-element touch target. Low risk — there's no reason to add overflow:hidden to a 34px button — but it's invisible.
5. "MAINTENANCE_MANUAL accuracy" — **Not found.** The architecture tree correctly lists all 9 pages under `(marketing)/`, `(app)/` as empty stub, and all `(sub)`/SubNav references are gone.

**Surprise finding:** `copy.ts:31` `meta.description` still says "Ana" (capitalized) while the hero headline now says `*ana*` (lowercase). The scope only targeted `hero.headline` (Fix 15), so this is out-of-scope — but it creates an inconsistency between the page's `<meta>` description and the hero headline.

## AC Walkthrough
- **AC1:** ✅ PASS — `pricing.module.css` `.frame` has no `border:` property. Diff confirms removal of `border: 1px solid var(--border-soft)`.
- **AC2:** ✅ PASS — `.top` has `text-align: center` at line 10. Eyebrow, h2, blurb all render inside `.top > .frame > .inner`.
- **AC3:** ✅ PASS — `Pricing.tsx:23` h2 has `maxWidth: "18ch"` inline style.
- **AC4:** ✅ PASS — `.frame` padding is `40px 64px` (line 15), mobile `28px 20px` at `max-width: 720px` (lines 18-19).
- **AC5:** ✅ PASS — `.grid` gap is `14px` (line 30), two-column at `min-width: 820px` (line 32).
- **AC6:** ✅ PASS — `.card` has `padding: 40px` at `min-width: 1024px` (lines 48-49).
- **AC7:** ✅ PASS — Footer `<em>` has `letterSpacing: "-0.02em"` at `Footer.tsx:52`.
- **AC8:** ✅ PASS — Commit span is plain `<span>` at `Footer.tsx:111-117`. Diff shows removal of `padding`, `border`, `borderRadius`, and `className="rounded-full"`.
- **AC9:** ⚠️ PARTIAL — The `:has()` rule exists at `globals.css:231-233` and the CSS is syntactically correct. The build passes. However, I cannot run the dev server and visually confirm the flush behavior in this session. The CSS logic is sound: `section[data-component="proof-feed"]:has([data-open="false"]) + footer { margin-top: 0; }` targets the right elements.
- **AC10:** ✅ PASS — `mt-10` removed from Footer.tsx (diff confirms), `footer { margin-top: 40px; }` added in globals.css:228.
- **AC11:** ✅ PASS — `copy.ts:224`: `"Every commit has *receipts*."` — no "Click one."
- **AC12:** ✅ PASS — `copy.ts:226`: "Each row is the verification record" — no link/click language.
- **AC13:** ✅ PASS — `bento.module.css:122-124`: `.tCompat:hover { border-color: transparent; }`.
- **AC14:** ✅ PASS — Grep confirms zero `(sub)` and zero `SubNav` matches. `(marketing)` used for all pages, `(app)` as empty stub.
- **AC15:** ✅ PASS — `copy.ts:53`: `*ana*` lowercase.
- **AC16:** ✅ PASS — All four nav icon buttons (GitHub, ThemeToggle, hamburger, close) use `h-[34px] w-[34px]` with `relative after:absolute after:inset-[-5px] after:content-['']`.
- **AC17:** ✅ PASS — `pnpm --filter anatomia-website build` completed successfully, 13 pages generated, zero errors.
- **AC18:** ⚠️ PARTIAL — Cannot run dev server and visually compare themes in this session. Code inspection shows no theme-specific regressions: all color values use `var(--token)` references which resolve correctly in both themes. The `footer { margin-top: 40px }` rule in globals.css is theme-agnostic.

## Blockers

None. All 28 contract assertions satisfied. All ACs pass or are partially verified (the 2 PARTIAL items are visual-only verifications that cannot be run mechanically — the CSS is structurally correct). No regressions introduced. Checked for: unused exports in new code (none — no new exports), unhandled error paths (N/A — pure CSS/copy changes), external state assumptions (the `:has()` rule assumes DOM sibling order, acknowledged in spec Gotchas), dead code (none).

## Findings

- **Code — Pricing h2 maxWidth without margin auto:** `website/components/pricing/Pricing.tsx:23` — `maxWidth: "18ch"` constrains width but without `margin: 0 auto`, the block is left-biased within its centered parent. Same pattern exists for the blurb `<p>` with `maxWidth: "52ch"`. The builder correctly followed the spec's instruction to match the blurb pattern. If the visual result doesn't match the handoff, this is a spec gap, not a build error.

- **Code — Touch target pseudo-elements are invisible and fragile:** `website/components/nav/Nav.tsx:92`, `ThemeToggle.tsx:15`, `NavMobile.tsx:21,60` — `after:absolute after:inset-[-5px]` creates touch targets that extend beyond the visible button. These break silently if `overflow: hidden` is ever added to the button, and are invisible during development. Low risk — no reason to add overflow:hidden to icon buttons — but worth knowing.

- **Code — :has() bonding rule depends on DOM sibling order:** `website/app/globals.css:231-233` — The `+` combinator requires `section[data-component="proof-feed"]` to be the direct previous sibling of `<footer>`. The spec acknowledges this in Gotchas. If ProofFeed is ever wrapped in a container, the rule breaks silently. A comment in globals.css explains the intent, which is good.

- **Upstream — meta.description still uses capitalized "Ana":** `website/lib/copy.ts:31` — `meta.description` says "Ana does" while the hero headline (Fix 15) changed to lowercase `*ana*`. The scope only targeted `hero.headline`, so this is out-of-scope, but it creates a brand inconsistency between the `<meta>` tag and the visible headline.

- **Code — globals.css footer rule is unscoped:** `website/app/globals.css:228` — `footer { margin-top: 40px; }` applies to ALL `<footer>` elements. Currently there's only one footer in the site, so this is fine. If a second footer appears (e.g., in the `(app)` route), it inherits this margin. Low risk given the site's single-footer architecture.

## Deployer Handoff

Straightforward CSS/copy polish. 10 files, ~60 lines changed. No new dependencies, no new files, no runtime behavior changes. The `:has()` bonding rule in globals.css is the most architecturally interesting change — it uses a CSS sibling combinator that assumes ProofFeed renders as a direct sibling before Footer in the marketing layout. The existing ProofFeed module already uses `:has()` for state-dependent styling, so this pattern is established.

The two PARTIAL ACs (AC9 visual flush, AC18 theme verification) should be spot-checked in the dev server before merge: `pnpm --filter anatomia-website dev`, then toggle the proof feed open/closed and switch themes.

## Verdict
**Shippable:** YES

28/28 contract assertions satisfied. 16/18 ACs pass, 2 partially verified (visual-only checks that require dev server). Build passes. Lint clean. No regressions. Changes are minimal and precisely scoped to the 12 fixes described in the spec. Findings are informational — no blockers.
