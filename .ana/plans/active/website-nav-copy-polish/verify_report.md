# Verify Report: Website nav, scroll targets, compat icons, and copy accuracy

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-07
**Spec:** .ana/plans/active/website-nav-copy-polish/spec.md
**Branch:** feature/website-nav-copy-polish

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/website-nav-copy-polish/contract.yaml
  Seal: INTACT (hash sha256:731910822a9243870ce068f6da26d371bf90376484201e19be608513e9b726ad)
```
Seal status: **INTACT**

Tests: N/A (no website test suite). Build: ✅ passed (13 static pages). TypeScript: ✅ clean (`tsc --noEmit` zero errors). Lint: not configured for website.

## Contract Compliance

All 22 assertions verified by source inspection (no test framework for website — build verification is the acceptance gate per spec).

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Navigation bar shows exactly three links: Agents, Pricing, Docs | ✅ SATISFIED | `website/lib/copy.ts:37-41` — array has 3 entries: Agents, Pricing, Docs |
| A002 | Pipeline link is removed from the navigation bar | ✅ SATISFIED | `website/lib/copy.ts:37-41` — no Pipeline entry in nav.links array |
| A003 | Navigation Install button links to the npm package page | ✅ SATISFIED | `website/lib/copy.ts:43` — `ctaInstallHref: "https://www.npmjs.com/package/anatomia-cli"`, `website/components/nav/Nav.tsx:102` — `href={copy.nav.ctaInstallHref}` |
| A004 | Navigation Install button opens in a new browser tab | ✅ SATISFIED | `website/components/nav/Nav.tsx:103` — `target="_blank"`, NavMobile.tsx:100 — `target="_blank"` |
| A005 | Hero Install button links to the npm package page | ✅ SATISFIED | `website/lib/copy.ts:57` — `href: "https://www.npmjs.com/package/anatomia-cli"`, `website/components/hero/Hero.tsx:63` — `href={copy.hero.ctas.primary.href}` |
| A006 | Hero Install button opens in a new browser tab | ✅ SATISFIED | `website/components/hero/Hero.tsx:64` — `target="_blank"` with `rel="noopener noreferrer"` |
| A007 | See the pipeline button scrolls to the agents section | ✅ SATISFIED | `website/lib/copy.ts:58` — `href: "#agents"`, `website/components/hero/Hero.tsx:79` — `href={copy.hero.ctas.secondary.href}` |
| A008 | Pricing free-tier Install button links to the npm package page | ✅ SATISFIED | `website/lib/copy.ts:200` — `href: "https://www.npmjs.com/package/anatomia-cli"`, PriceCard passes href to Button which auto-detects external via `href.startsWith("http")` |
| A009 | Pricing anchor is on an inner element, not the section wrapper | ✅ SATISFIED | `website/components/pricing/Pricing.tsx:13` — `<section>` has no `id`; line 18 — `<div id="pricing">` on inner element |
| A010 | Pricing inner anchor has scroll margin to clear the fixed navbar | ✅ SATISFIED | `website/components/pricing/Pricing.tsx:18` — `style={{ scrollMarginTop: 72 }}` on the `id="pricing"` div |
| A011 | Pipeline anchor no longer exists on the bento section | ✅ SATISFIED | `website/components/bento/Bento.tsx:18-21` — `<section data-component="bento">` has no `id` attribute |
| A012 | Footer Pipeline link points to the agents section | ✅ SATISFIED | `website/lib/copy.ts:430` — `{ label: "Pipeline", href: "/#agents" }` |
| A013 | Marquee displays real brand icons instead of placeholder letters | ✅ SATISFIED | `website/components/marquee/CompatMarquee.tsx:24` — renders `<BrandIcon>`, no `charAt(0)` glyph. Grep confirms `glyphColors` fully removed from codebase |
| A014 | Brand icons exist for all ten compatible tools | ✅ SATISFIED | `website/lib/icons.tsx:32-52` — `brandPaths` has 10 entries matching all 10 items in `copy.marquee.items` |
| A015 | Bento compatibility chips show brand icons alongside text | ✅ SATISFIED | `website/components/bento/tiles/CompatTile.tsx:19` — `<BrandIcon name={c} size={14} />` rendered before chip text |
| A016 | About page title makes no claims about team size | ✅ SATISFIED | `website/lib/copy.ts:386` — `"One *idea*. Shipped with proof."` — no headcount reference |
| A017 | About page body references Denver, not San Francisco | ✅ SATISFIED | `website/lib/copy.ts:389` — `"We're based in Denver..."` |
| A018 | About page body makes no claims about team size | ✅ SATISFIED | `website/lib/copy.ts:389` — no "two-person" in body[1] |
| A019 | Contact page says Based in Denver | ✅ SATISFIED | `website/lib/copy.ts:335` — `"Based in Denver."` |
| A020 | Manifesto page content is not modified | ✅ SATISFIED | `website/lib/copy.ts:295` — `"Code should come with *proof*."` unchanged |
| A021 | License page content is not modified | ✅ SATISFIED | `website/lib/copy.ts:396` — `"MIT — free *forever*."` unchanged |
| A022 | Website builds without errors | ✅ SATISFIED | `pnpm build` exited 0 with 13 static pages rendered |

**22 / 22 SATISFIED. 0 UNSATISFIED.**

## Independent Findings

**Prediction resolution:**
1. Missing `rel="noopener noreferrer"` — Not found. Both Nav.tsx:104 and NavMobile.tsx:101 include it correctly.
2. Missing `onClick={close}` on NavMobile CTA — Not found. NavMobile.tsx:102 has `onClick={close}`.
3. Dead `glyphColors` references — Not found. Grep confirms zero references in codebase.
4. `scrollMarginTop` on wrong element — Not found. Applied correctly to the inner div at Pricing.tsx:18.
5. Brand icon key mismatches — Not found. All 10 keys in `brandPaths` match `copy.marquee.items` exactly.

**Surprise:** Removing `id="pipeline"` from Bento.tsx creates three dead `#pipeline` links in files outside the build scope. Detailed in Findings below.

**Over-building check:**
- `brandIconNames` export at `website/lib/icons.tsx:86` is never imported by any file. Unused export — minor YAGNI.
- `brandColors` map is module-private, used only inside `BrandIcon`. Appropriate.
- No other unused exports, parameters, or dead code found in new/modified files.

## AC Walkthrough

- **AC1:** Navbar contains exactly three links: Agents, Pricing, Docs (Pipeline removed) — ✅ PASS — `copy.ts:37-41` has 3 links, no Pipeline
- **AC2:** Clicking "Agents" scrolls to agents tile with heading visible — ⚠️ PARTIAL — `id="agents"` is on AgentsTile inner div (verified in code), but not tested with a live browser scroll
- **AC3:** Clicking "Pricing" scrolls to pricing section with heading visible — ⚠️ PARTIAL — `id="pricing"` moved to inner div with `scrollMarginTop: 72` (Pricing.tsx:18), but not tested with a live browser scroll. The `section[id]` CSS rule (globals.css:181) no longer applies since the target is a `<div>`, but the inline style provides the same 72px offset
- **AC4:** Navbar Install CTA links to npm, opens in new tab — ✅ PASS — Nav.tsx:102-104 `href={copy.nav.ctaInstallHref}` + `target="_blank"` + `rel="noopener noreferrer"`. NavMobile.tsx:99-101 same pattern
- **AC5:** Hero primary Install links to npm, opens in new tab — ✅ PASS — Hero.tsx:63-65 `href={copy.hero.ctas.primary.href}` + `target="_blank"` + `rel="noopener noreferrer"`
- **AC6:** Hero secondary "See the pipeline" scrolls to #agents — ✅ PASS — Hero.tsx:79 `href={copy.hero.ctas.secondary.href}`, copy.ts:58 `href: "#agents"`
- **AC7:** Pricing free-tier Install links to npm, opens in new tab — ✅ PASS — copy.ts:200 `href: "https://www.npmjs.com/package/anatomia-cli"`, PriceCard passes to Button which auto-detects external links and adds `target="_blank"`
- **AC8:** Footer product links remain with corrected targets — ✅ PASS — copy.ts:429-434: Pipeline→`/#agents`, Agents→`/#agents`, Pricing→`/#pricing`, Changelog→`/changelog`
- **AC9:** CompatMarquee displays real SVG brand icons — ✅ PASS — CompatMarquee.tsx:24 renders `<BrandIcon>`, glyphColors fully removed, 10 SVG paths in icons.tsx
- **AC10:** CompatTile chips display brand icons alongside text — ✅ PASS — CompatTile.tsx:19 `<BrandIcon name={c} size={14} />` with inline-flex layout
- **AC11:** About page title no headcount claims — ✅ PASS — copy.ts:386 `"One *idea*. Shipped with proof."`
- **AC12:** About page body no headcount, references Denver — ✅ PASS — copy.ts:389 `"We're based in Denver..."`, no "two-person"
- **AC13:** Contact coda says "Based in Denver" — ✅ PASS — copy.ts:335 `"Based in Denver."`
- **AC14:** Manifesto page unchanged — ✅ PASS — copy.ts:293-312 manifesto section unchanged from baseline
- **AC15:** License page unchanged — ✅ PASS — copy.ts:394-418 license section unchanged
- **AC16:** Site builds without errors — ✅ PASS — `pnpm build` exited 0, 13 static pages
- **AC17:** No TypeScript errors — ✅ PASS — `pnpm tsc --noEmit` exited 0

**15 ✅ PASS, 2 ⚠️ PARTIAL, 0 ❌ FAIL**

AC2 and AC3 are PARTIAL because the scroll behavior depends on browser rendering and fixed navbar height — verified structurally (correct elements, correct IDs, correct scroll-margin-top) but not with a live browser interaction.

## Blockers

None. All 22 contract assertions satisfied. All acceptance criteria pass or partially pass (the two PARTIAL items are structurally correct but unverifiable without a browser). No TypeScript errors, no build failures, no regressions in the modified files themselves.

Checked for: unused parameters in new code (none — `BrandIcon` uses all props), unhandled error paths (`BrandIcon` returns null for unknown names — safe), external state assumptions (npm URL is a published package), dead code in modified files (all `if`/conditional blocks serve a purpose).

## Findings

- **Code — Three dead `#pipeline` links after anchor removal:** `website/lib/copy.ts:309`, `website/components/hero/ScrollHint.tsx:24`, `website/components/scan/ScanSlab.tsx:163` — Removing `id="pipeline"` from Bento.tsx (A011) leaves three links pointing to a nonexistent anchor. The footer Pipeline link was correctly updated to `/#agents`, but these three were out of scope. The manifesto "See the pipeline" link, the hero ScrollHint, and the ScanSlab CTA all scroll to nothing. This is a real user-facing regression — especially ScrollHint, which fires on every hero scroll. Should be scoped as a follow-up.

- **Code — `brandIconNames` exported but never imported:** `website/lib/icons.tsx:86` — `Object.keys(brandPaths)` is exported but no file imports it. Minor YAGNI. Not harmful but adds unused API surface.

- **Code — Codex icon is a geometric diamond placeholder:** `website/lib/icons.tsx:38` — The file header correctly notes OpenAI removed their icon from Simple Icons. The diamond (`M12 0L24 12 12 24 0 12Z`) is a reasonable placeholder but won't be recognized as the Codex brand. Acceptable for now.

- **Upstream — Spec scoped out files that depend on removed anchor:** The spec correctly identified `id="pipeline"` as "dead infrastructure" but didn't account for ScrollHint.tsx, ScanSlab.tsx, and manifesto outbound links still referencing it. The spec guidance led Build to remove the anchor without updating all consumers. This is a scoping gap, not a build gap.

- **Upstream — Stale finding from proof chain:** Proof context shows `Pricing h2 and blurb with maxWidth may not visually center without margin auto` (from Website Direct Polish). The current build doesn't address this — the Pricing inner div gets `id` and `scrollMarginTop` but no centering changes. Still present.

- **Upstream — Proof context hero eyebrow concern:** `Hero eyebrow pill arrow icon removed — visual change not covered by spec` (from Dead Links & Missing Pages). Not affected by this build — hero changes were limited to CTA `target="_blank"` and href updates.

## Deployer Handoff

1. **Dead `#pipeline` links:** Three links in ScrollHint, ScanSlab, and manifesto outbound still reference `#pipeline` which no longer exists. Scope a follow-up to update these to `#agents` or remove them. The ScrollHint is the most visible — it fires on every page load when users scroll from the hero.

2. **All Install CTAs now go to npm:** Verify the npm package page is live at `https://www.npmjs.com/package/anatomia-cli` before deploying — if the package is unpublished or renamed, all Install buttons lead to a 404.

3. **Pricing scroll target changed:** `id="pricing"` moved from `<section>` to inner `<div>`. The global CSS rule `section[id] { scroll-margin-top: 72px }` no longer applies; the inline `scrollMarginTop: 72` handles it instead. If the global rule is later updated, this component won't inherit — it's now independently styled.

4. **No test coverage for website:** This build is verified by build output and source inspection only. There is no automated regression net for copy, links, or scroll behavior.

## Verdict
**Shippable:** YES

All 22 contract assertions SATISFIED. Build passes. TypeScript clean. All ACs pass (2 PARTIAL due to browser-only verification, both structurally correct). The dead `#pipeline` links are a real side effect but were explicitly out of scope — they're a scoping gap, not a build failure. The builder executed the spec faithfully and completely.
