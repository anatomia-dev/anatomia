# Verify Report: Website Mobile Polish + Marquee Overhaul

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-08
**Spec:** .ana/plans/active/website-mobile-polish/spec.md
**Branch:** feature/website-mobile-polish

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/website-mobile-polish/contract.yaml
  Seal: INTACT (hash sha256:f8493b98a1e0b0cc4a8eec45e121e537bcabca74ba9ecdd5d834f0cdf8762a81)
```
Seal status: **INTACT**

Build: `pnpm --filter anatomia-website build` — **PASS** (all 13 routes generated, no errors)
Typecheck: `pnpm --filter anatomia-website typecheck` — **PASS** (tsc --noEmit, exit 0)
Lint: `pnpm run lint` — **PASS** (2/2 tasks successful)
Tests: N/A — website has no unit tests (CSS/copy/SVG work, as noted in spec)

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Marquee shows exactly six AI tools | ✅ SATISFIED | `website/lib/copy.ts:84-86` — `items` array has exactly 6 entries |
| A002 | Marquee includes Claude Code, Cursor, Codex, Windsurf, Copilot, and Cline | ✅ SATISFIED | `website/lib/copy.ts:85` — array contains "Copilot" and all 6 names |
| A003 | Every marquee tool has a brand icon that renders | ✅ SATISFIED | `website/lib/icons.tsx:28-41` — `brandPaths` has entries for all 6 tools including "Copilot" |
| A004 | Cline has a brand icon in the registry | ✅ SATISFIED | `website/lib/icons.tsx:39-40` — `brandPaths["Cline"]` has full SVG path |
| A005 | Codex icon is no longer the diamond placeholder | ✅ SATISFIED | `website/lib/icons.tsx:33-34` — Codex path is OpenAI logomark (starts with `M22.2819`), not `M12 0L24 12 12 24 0 12Z` |
| A006 | Marquee title reads "Works with any AI tool" | ✅ SATISFIED | `website/lib/copy.ts:83` — `copy.marquee.title` = `"Works with any AI tool"` |
| A007 | Marquee animation is faster than the original 40s | ✅ SATISFIED | `website/components/marquee/marquee.module.css:57` — base duration is `24s`, not `40s` |
| A008 | Mobile nav overlay escapes the parent nav stacking context | ✅ SATISFIED | `website/components/nav/NavMobile.tsx:4,40` — imports `createPortal` from `react-dom`, renders overlay via `createPortal(..., document.body)` |
| A009 | Hero meta row says "Works with any AI tool" | ✅ SATISFIED | `website/lib/copy.ts:62` — `copy.hero.meta[1]` = `"Works with any AI tool"` |
| A010 | Hero meta row stacks vertically on phone screens | ✅ SATISFIED | `website/components/hero/hero.module.css:241-247` — `@media (max-width: 640px)` sets `flex-direction: column` on `.heroMeta` |
| A011 | Dot separators are hidden on phone screens | ✅ SATISFIED | `website/components/hero/hero.module.css:248` — `.sep { display: none; }` inside `@media (max-width: 640px)` |
| A012 | Ship dots are hidden on phone to prevent overlap | ✅ SATISFIED | `website/components/proof-feed/proof-feed.module.css:135` — `.shipDots, .dotsLabel { display: none; }` inside `@media (max-width: 640px)` |
| A013 | Verified count label is hidden on phone | ✅ SATISFIED | `website/components/proof-feed/proof-feed.module.css:135` — `.dotsLabel { display: none; }` at 640px (and also at 880px on line 132) |
| A014 | Proof rows use a two-line stacked layout on phone | ✅ SATISFIED | `website/components/proof-feed/proof-feed.module.css:329-333` — `@media (max-width: 760px)` switches `.proofRow` to `display: flex; flex-wrap: wrap` |
| A015 | Assertions are visible on phone in the proof row second line | ✅ SATISFIED | `website/components/proof-feed/proof-feed.module.css:344` — `.rowAssert { display: inline; }` (not `display: none`) at 760px breakpoint |
| A016 | The dead link to PROOF_CHAIN.md is removed from the page | ✅ SATISFIED | `website/components/proof-feed/ProofFeed.tsx` — grep for "PROOF_CHAIN" returns no matches; the `feedFoot` div was removed |
| A017 | The "Full proof chain" link is removed from copy | ✅ SATISFIED | `website/lib/copy.ts:222-227` — `proofFeed` no longer contains `footLink` or `footSource` |
| A018 | Bento compat chips list the six AI tools | ✅ SATISFIED | `website/lib/copy.ts:176` — `copy.bento.compat.chips` has exactly 6 entries matching the tool roster |
| A019 | Pricing no longer lists specific tool names | ✅ SATISFIED | `website/lib/copy.ts:198` — `copy.pricing.plans[0].features[4]` = `"Works with any AI tool"` |
| A020 | Website builds successfully with no errors | ✅ SATISFIED | `pnpm --filter anatomia-website build` succeeded, 13/13 static pages generated |
| A021 | Website type checking passes with no errors | ✅ SATISFIED | `pnpm --filter anatomia-website typecheck` (tsc --noEmit) exited 0 |
| A022 | Icons for tools no longer in the marquee are removed | ✅ SATISFIED | `website/lib/icons.tsx` — `brandPaths` has no "Python", "Zed", "GitHub Actions", "pnpm", "TypeScript", or "Rust" entries; grep confirms removal |

## Independent Findings

**Prediction resolution:**
- *Predicted: builder left dead .feedFoot CSS* — **Not found.** Both `.feedFoot` and `.feedFootLink` were properly removed from CSS.
- *Predicted: currentColor may cause contrast issues* — **Partially confirmed.** Copilot and Cline use `currentColor` which resolves to `var(--fg)` inside `.glyph` (which sets `color: var(--fg)`). This works in both themes because `--fg` has sufficient contrast against `--ink-15` background. Acceptable choice — better than hardcoding a near-black color that breaks in dark mode.
- *Predicted: rowArrow orphaned in flex layout* — **Confirmed as pre-existing.** `rowArrow` has CSS definitions (lines 320-327) but is never referenced in `ProofFeed.tsx`. This was true before this build — the builder didn't introduce it.
- *Predicted: dotsLabel redundant hide at two breakpoints* — **Not redundant.** Progressive disclosure: at 880px the label hides but dots remain visible; at 640px both hide. Intentional design.
- *Predicted: SSR hydration mismatch with portal* — **Not found.** The portal only renders when `open` is true, and `open` defaults to `false`. SSR never renders the portal content. The `typeof document !== "undefined"` guard adds a second safety layer.

**Over-building check:** No scope creep detected. Every change maps to a spec file change. No new exports, no new components, no new dependencies. The builder added a `.rowMeta` CSS class and wrapper `<span>` in ProofFeed.tsx — this was explicitly spec'd for the mobile two-line layout.

**YAGNI check:** Grepped for unused exports in new code. No new exports were added. The pre-existing `brandIconNames` export remains unused (known, out of scope per spec).

## AC Walkthrough
- **AC1:** ✅ PASS — `copy.marquee.items` contains exactly Claude Code, Cursor, Codex, Windsurf, Copilot, Cline. `brandPaths` has matching entries for all 6 with full SVG paths. Codex uses OpenAI logomark path (not diamond).
- **AC2:** ✅ PASS — `CompatMarquee.tsx:18` renders `{copy.marquee.title}` which resolves to "Works with any AI tool". The old hard-coded "Compatible runtimes" string is gone.
- **AC3:** ✅ PASS — `marquee.module.css:57` base is 24s; media queries at 1024px (20s) and 640px (16s). All faster than the original 40s. `prefers-reduced-motion` disables animation entirely.
- **AC4:** ⚠️ PARTIAL — Portal implementation is correct: `createPortal` renders overlay to `document.body`, escaping the nav's `backdrop-filter` stacking context. SSR guard present (`typeof document !== "undefined"`). Background is `var(--bg)` which is opaque. **Partial because visual opacity cannot be mechanically verified without a browser** — the implementation is correct by code inspection but true visual verification requires rendering at mobile width.
- **AC5:** ✅ PASS — `hero.module.css:241-248` adds `@media (max-width: 640px)` with `flex-direction: column`, `align-items: flex-start`, `gap: 8px` on `.heroMeta`. `.sep` hidden with `display: none`. `copy.hero.meta[1]` = "Works with any AI tool".
- **AC6:** ✅ PASS — At 640px: `.shipDots` and `.dotsLabel` hidden, leaving only kicker + version/count + chevron. At 880px: `.dotsLabel` hidden but dots remain. No overlapping text possible with the progressive hide.
- **AC7:** ✅ PASS — When open, `.psDivider` and `.psLatest` are always hidden (`card[data-open="true"]` rule). The kicker text swaps to "N verified changes" via `.kOpen`. At 640px, dots and label are also hidden.
- **AC8:** ✅ PASS — `proof-feed.module.css:328-346`: at 760px, `.proofRow` switches from grid to `display: flex; flex-wrap: wrap`. `.rowHash` hidden. `.rowKind` and `.rowFeat` on first line. `.rowMeta` wrapper becomes `display: flex; width: 100%; justify-content: flex-end` for second line with `.rowAssert` and `.rowAgo` visible (`display: inline`).
- **AC9:** ✅ PASS — `ProofFeed.tsx` diff shows the `feedFoot` div removed (lines 115-120 in old file). `copy.proofFeed.footSource` and `copy.proofFeed.footLink` removed from `copy.ts`. `feedFoot`/`feedFootLink` CSS removed.
- **AC10:** ⚠️ PARTIAL — Desktop layout (>1024px) is unaffected by code inspection: all new CSS is inside `max-width` media queries that don't fire above 1024px. Build succeeds. **Partial because true regression testing requires visual comparison** — no screenshot diff tooling available.
- **AC11:** ✅ PASS — All four tool-reference locations updated: (1) `hero.meta[1]` = "Works with any AI tool" (line 62), (2) `marquee.items` = 6 AI tools (line 84-86), (3) `bento.compat.chips` = same 6 tools (line 176), (4) `pricing.plans[0].features[4]` = "Works with any AI tool" (line 198).
- **AC12:** ✅ PASS — `pnpm --filter anatomia-website build` succeeded with 13/13 static pages generated, no errors.
- **AC13:** ✅ PASS — `pnpm --filter anatomia-website typecheck` (tsc --noEmit) exited 0, no type errors.

## Blockers

None. All 22 contract assertions satisfied. All 13 ACs pass (11 full, 2 partial due to visual-only verification limitation — code is correct by inspection). Build and typecheck both pass cleanly. Lint passes.

Checked for: unused parameters in new code (none — no new functions), unhandled error paths (portal SSR guard present), assumptions about external state (portal uses `document.body` which is guaranteed in browser context, guarded for SSR), missing edge cases from spec (all 4 tool-reference locations updated, all 6 icon entries present, responsive breakpoints match spec).

## Findings

- **Code — rowArrow CSS class defined but never used:** `website/components/proof-feed/proof-feed.module.css:320-327` — `.rowArrow` and `.proofRow:hover .rowArrow` are styled but `rowArrow` is never referenced in `ProofFeed.tsx`. Pre-existing dead CSS, not introduced by this build.
- **Code — brandIconNames exported but never imported:** `website/lib/icons.tsx:74` — `Object.keys(brandPaths)` exported but unused anywhere. Known from proof context, explicitly out of scope per spec gotchas.
- **Code — Copilot/Cline use currentColor for dark-mode safety:** `website/lib/icons.tsx:23-24` — Both icons use `currentColor` instead of a brand hex. Inside `.glyph`, this resolves to `var(--fg)`. This is a deliberate dark-mode safety choice (their brand colors are near-black). The trade-off is that the icons don't show their brand color — they inherit the foreground. Acceptable for this context since the icons are small (16px) and sit on a `var(--ink-15)` chip.
- **Upstream — Manifesto outbound link still points to /#pipeline:** `website/lib/copy.ts:307` — `{ label: "See the pipeline", href: "/#pipeline" }` references a removed anchor. Pre-existing from proof context, not in scope. Still active.
- **Upstream — Three dead #pipeline links in copy.ts:** `website/lib/copy.ts` — Pre-existing from proof context. The builder correctly avoided touching these (out of scope). Still active.
- **Code — kindLabel defaults to 'improve' for unrecognized kind:** `website/components/proof-feed/ProofFeed.tsx:28` — Silent fallback if `ProofKind` grows. Pre-existing from proof context (Ship Log Polish cycle). Not in scope, not addressed by this build.

## Deployer Handoff

This is a CSS/copy/SVG change to the marketing website. No CLI code touched, no dependency changes, no database migrations.

**What changed:** The marquee now shows 6 AI tools (was 10 mixed items), mobile nav overlay uses a React portal (was trapped in stacking context), hero meta row stacks on phone, ship log summary/proof rows are responsive, dead footer link removed, all tool references unified.

**What to visually verify after deploy:** The two ⚠️ PARTIAL ACs (AC4 mobile nav opacity, AC10 desktop regression) should be spot-checked in a real browser at phone and desktop widths. The code is correct by inspection but visual confirmation is the ground truth for CSS work.

**Known pre-existing issues not addressed:** `/#pipeline` dead links in manifesto outbound (3 occurrences), `brandIconNames` unused export, `kindLabel` silent fallback. All out of scope, all documented in proof context.

## Verdict
**Shippable:** YES

22/22 contract assertions satisfied. 11/13 ACs fully pass, 2 partial (visual-only verification gap — code is correct). Build, typecheck, and lint all pass. No regressions detected. No over-building. The builder's changes are focused, spec-aligned, and clean. The responsive CSS follows existing breakpoint patterns. The portal implementation handles SSR correctly. All four tool-reference locations are consistent.
