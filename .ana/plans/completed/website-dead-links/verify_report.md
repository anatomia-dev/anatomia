# Verify Report: Dead Links & Missing Pages

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-07
**Spec:** .ana/plans/active/website-dead-links/spec.md
**Branch:** feature/website-dead-links

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/website-dead-links/contract.yaml
  Seal: INTACT (hash sha256:603d8d1f63d1e7b27de772501c47fde1a9f55b605ee5a5fe3ea656a8fab66ef0)
```

Seal status: **INTACT**

Build: `pnpm build` in website — ✅ 13 pages generated, 0 errors.
Tests: CLI regression — 1998 passed, 2 skipped, 96 files. No regressions.
Lint: N/A (website-only changes, no separate lint runner).

## Contract Compliance

No `@ana` test tags exist — the website has no test files. All assertions verified by source inspection and build output per the spec's testing strategy ("build is the verification gate").

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Every page uses the same primary navigation bar | ✅ SATISFIED | `website/components/sub-nav/SubNav.tsx` does not exist. `ls website/app/(sub)/` returns empty. `(sub)` route group fully deleted. |
| A002 | The sub-page route group no longer exists | ✅ SATISFIED | `website/app/(sub)/` directory does not exist on filesystem. |
| A003 | No file in the codebase imports the old SubNav component | ✅ SATISFIED | `grep -r "SubNav\|sub-nav" website/` returns only `MAINTENANCE_MANUAL.md` (docs reference, not import). Zero source file imports. |
| A004 | No placeholder hash links remain in the site copy | ✅ SATISFIED | `grep 'href: "#"' website/lib/copy.ts` — 0 matches. All former `#` links replaced with real destinations. |
| A005 | The agents section has a scroll anchor on the landing page | ✅ SATISFIED | `website/components/bento/tiles/AgentsTile.tsx:8` — root div has `id="agents"`. |
| A006 | Proof feed rows display information without being clickable links | ✅ SATISFIED | `website/components/proof-feed/ProofFeed.tsx:89-105` — rows are `<div>` elements with `role="listitem"`, no `<a>` tag. |
| A007 | The proof entry data no longer carries a URL field | ✅ SATISFIED | `website/lib/proof-feed.ts:23-32` — `ProofEntry` interface has no `url` field. `mockFeed()` and `mapEntry()` produce no `url`. |
| A008 | Proof feed rows have no arrow icon suggesting clickability | ✅ SATISFIED | `grep "arrow\|Arrow\|svg.*path.*M" ProofFeed.tsx` — no matches in row markup. Only SVG is the expand/collapse chevron in the summary bar. |
| A009 | The version pill in the navigation bar is not a link | ✅ SATISFIED | `website/components/nav/Nav.tsx:46-66` — version pill is a `<span>`, no `<a>` tag, no `href`. |
| A010 | The commit pill in the footer is not a link | ✅ SATISFIED | `website/components/footer/Footer.tsx:101-113` — commit pill is a `<span>`, no `<a>` tag. |
| A011 | The footer commit pill has a rounded pill shape | ✅ SATISFIED | `website/components/footer/Footer.tsx:102` — `className="rounded-full"`, inline style `padding: "3px 10px"`. |
| A012 | The changelog page exists and can be built | ✅ SATISFIED | `website/app/(marketing)/changelog/page.tsx` exists. Build output shows `/changelog` route generated. |
| A013 | The CLI reference page exists and can be built | ✅ SATISFIED | `website/app/(marketing)/cli/page.tsx` exists. Build output shows `/cli` route generated. |
| A014 | The examples page exists and can be built | ✅ SATISFIED | `website/app/(marketing)/examples/page.tsx` exists. Build output shows `/examples` route generated. |
| A015 | The about page exists and can be built | ✅ SATISFIED | `website/app/(marketing)/about/page.tsx` exists. Build output shows `/about` route generated. |
| A016 | The license page exists and can be built | ✅ SATISFIED | `website/app/(marketing)/license/page.tsx` exists. Build output shows `/license` route generated. |
| A017 | Each new page exports SEO metadata with the Anatomia brand | ✅ SATISFIED | All 5 pages export `metadata: Metadata` with `title: "X · Anatomia"`: changelog:3-8, cli:3-8, examples:3-8, about:3-8, license:3-8. Count: 5. |
| A018 | Footer product links use absolute paths for landing page sections | ✅ SATISFIED | `website/lib/copy.ts:430` — Product column links: `/#pipeline`, `/#agents`, `/#pricing`, `/changelog`. Contains `/#pipeline`. |
| A019 | Navigation links use absolute paths for landing page sections | ✅ SATISFIED | `website/lib/copy.ts:38` — `{ label: "Pipeline", href: "/#pipeline" }`. |
| A020 | Navigation links point to the agents section with an absolute path | ✅ SATISFIED | `website/lib/copy.ts:39` — `{ label: "Agents", href: "/#agents" }`. |
| A021 | Navigation links point to pricing with an absolute path | ✅ SATISFIED | `website/lib/copy.ts:40` — `{ label: "Pricing", href: "/#pricing" }`. |
| A022 | The desktop nav install button links to pricing with an absolute path | ✅ SATISFIED | `website/components/nav/Nav.tsx:102` — `<Link href="/#pricing">`. |
| A023 | The mobile nav install button links to pricing with an absolute path | ✅ SATISFIED | `website/components/nav/NavMobile.tsx:99` — `<Link href="/#pricing">`. |
| A024 | The CLI reference card on the docs page shows coming soon status | ✅ SATISFIED | `website/lib/copy.ts:285` — `status: "Coming soon"` for "CLI reference". |
| A025 | The examples card on the docs page shows coming soon status | ✅ SATISFIED | `website/lib/copy.ts:286` — `status: "Coming soon"` for "Examples". |
| A026 | The proof feed history link points to the real GitHub commit log | ✅ SATISFIED | `website/lib/copy.ts:228` — `href: "https://github.com/TettoLabs/anatomia/commits/main"`. |
| A027 | The sitemap lists all nine public pages | ✅ SATISFIED | `website/app/sitemap.ts` — 9 entries: `/`, `/docs`, `/manifesto`, `/contact`, `/changelog`, `/cli`, `/examples`, `/about`, `/license`. |
| A028 | The website builds successfully with no errors | ✅ SATISFIED | `pnpm build` completed: "Compiled successfully", 13 static pages generated, 0 errors. |
| A029 | The docs page renders inside the marketing layout with the main nav | ✅ SATISFIED | `website/app/(marketing)/docs/page.tsx` exists inside `(marketing)` route group. No SubNav import. |
| A030 | The manifesto page renders inside the marketing layout with the main nav | ✅ SATISFIED | `website/app/(marketing)/manifesto/page.tsx` exists. No SubNav import. |
| A031 | The contact page renders inside the marketing layout with the main nav | ✅ SATISFIED | `website/app/(marketing)/contact/page.tsx` exists. No SubNav import. |

31/31 SATISFIED. 0 UNSATISFIED.

## Independent Findings

**Stale proof feed copy.** The builder delinked proof feed rows (correct) but didn't update the copy that describes them as clickable. Two strings in `copy.ts` are now misleading:
- `headTitle` (line 224) says "Click one." — there's nothing to click.
- `headSub` (line 226) says "Each row links to the contract..." — rows no longer link.

This wasn't in the contract or spec, so it's not an AC failure. But it's user-facing copy that promises interactivity that doesn't exist.

**MAINTENANCE_MANUAL.md references deleted architecture.** Lines 19-21 and 171 reference the `(sub)` route group and SubNav component. The docs are now wrong. Not a blocker — it's an internal reference doc — but the next person who reads it will be confused.

**CSS duplication across new modules.** The eyebrow and title blocks are copy-pasted identically across 5 new CSS modules (about, changelog, cli-ref, examples, license). Each is ~40 lines of identical CSS. A shared `page-base.module.css` would eliminate ~160 lines of duplication. Reasonable for a first pass — each module stays self-contained — but will become maintenance debt as pages multiply.

**Prediction resolution:**
- Predicted stale metadata across new pages — **not found**. Each page has distinct descriptions.
- Predicted arrow SVG missed — **not found**. Clean removal.
- Predicted `url` left in mock data — **not found**. Clean removal.
- Predicted footer pill mixed styles — **not found**. Clean transition.
- Predicted "Coming soon" missed — **not found**. Both cards correctly updated.
- **Surprised:** The stale "Click one" copy — predicted production risks around hash links but found a simpler copy consistency issue.

**Upstream — still present from Website Lift:**
- `proof-feed.ts:70` — hardcoded `version: "v1.0.2"` in mapEntry (see proof chain finding). Not affected by this scope.
- `proof-feed.ts:74` — mapEntry never produces kind `'chore'`. Not affected by this scope.

## AC Walkthrough

- **AC1:** All pages use the same Nav component — no SubNav anywhere, `(sub)` route group deleted → ✅ PASS — `(sub)` directory gone, SubNav component gone, all pages in `(marketing)` route group sharing Nav+Footer from layout.tsx.
- **AC2:** Zero `href="#"` links remain in copy.ts → ✅ PASS — grep returns 0 matches. Free CTA → `/#pricing`, Team CTA → `/contact` (with TODO comment at line 217), proof feed → real GitHub URL.
- **AC3:** `#agents` anchor exists and scrolls to the agents tile → ✅ PASS — `AgentsTile.tsx:8` has `id="agents"`. Nav link at copy.ts:39 points to `/#agents`.
- **AC4:** Proof feed rows are non-linking display elements → ✅ PASS — ProofFeed.tsx rows are `<div>` elements, no `<a>` wrapper, no arrow SVG, `role="listitem"` retained.
- **AC5:** Nav version pill is display-only → ✅ PASS — Nav.tsx:46-66 renders `<span>`, no link element, no href.
- **AC6:** Footer commit pill is a display-only `<span>` styled as a pill → ✅ PASS — Footer.tsx:101-113: `<span className="rounded-full">` with inline `padding: "3px 10px"`, `border: "1px solid var(--border-soft)"`, `background: "var(--bg-elev)"`. No `<a>` tag.
- **AC7:** `/changelog`, `/cli`, `/examples`, `/about`, `/license` all return 200 → ✅ PASS — Build output confirms all 5 routes generated as static pages. Page files exist with metadata exports.
- **AC8:** All footer links resolve to real pages or valid absolute anchors → ✅ PASS — Footer columns in copy.ts:427-454: Product links use `/#pipeline`, `/#agents`, `/#pricing`, `/changelog`. Developers: `/docs`, GitHub URL, `/cli`, `/examples`. Company: `/about`, `/manifesto`, `/contact`, `/license`. All real destinations.
- **AC9:** All nav links resolve to real sections (from any page) → ✅ PASS — copy.ts:38-42: Pipeline→`/#pipeline`, Agents→`/#agents`, Pricing→`/#pricing`, Docs→`/docs`. All absolute paths.
- **AC10:** Hash links in nav and footer use absolute paths → ✅ PASS — All hash links prefixed with `/`: `/#pipeline`, `/#agents`, `/#pricing`. Hero CTAs remain relative (`#pricing`, `#pipeline`) per spec constraint.
- **AC11:** Docs "next" cards for CLI reference and Examples show "Coming soon" → ✅ PASS — copy.ts:285-286 both have `status: "Coming soon"`.
- **AC12:** "Full history →" link points to GitHub commits → ✅ PASS — copy.ts:228: `href: "https://github.com/TettoLabs/anatomia/commits/main"`.
- **AC13:** Zero dead links on any page → ⚠️ PARTIAL — All `<a>` elements now point to real destinations. However, the proof feed header copy says "Click one." and "Each row links to..." while rows are no longer clickable. The links themselves are fixed; the copy describing them is stale. No dead `href` attributes remain.
- **AC14:** `sitemap.ts` includes all 9 pages → ✅ PASS — sitemap.ts has exactly 9 entries matching all public routes.
- **AC15:** `pnpm build` succeeds with no errors → ✅ PASS — Build completed successfully, 13 pages generated.
- **AC16:** No SubNav imports remain in any file → ✅ PASS — grep finds SubNav only in `MAINTENANCE_MANUAL.md` (text reference, not an import statement). Zero source code imports.

15 ✅ PASS, 1 ⚠️ PARTIAL, 0 ❌ FAIL.

## Blockers

No blockers. All 31 contract assertions satisfied. All 16 ACs pass (1 partial — copy consistency, not a dead link). Build succeeds. No regressions (1998 CLI tests pass). Checked for: unused exports in new files (each component exported once, imported once), unused parameters (none — new components take no props), error paths (no new error handling introduced — these are static pages), external assumptions (new pages are fully static, no runtime dependencies).

## Findings

- **Code — Stale proof feed copy "Click one.":** `website/lib/copy.ts:224` — `headTitle` says "Click one." but proof feed rows are no longer clickable `<a>` elements. Users see a prompt to click but nothing responds. Should read something like "Every commit has receipts."
- **Code — Stale proof feed copy "Each row links to...":** `website/lib/copy.ts:226` — `headSub` describes rows as linking to contracts, but rows are now inert `<div>` elements. Copy should describe what rows show, not where they link.
- **Code — MAINTENANCE_MANUAL.md references deleted (sub) route group:** `website/MAINTENANCE_MANUAL.md:19,171` — Still documents the `(sub)/` route group and SubNav component as active architecture. Should be updated to reflect `(marketing)` as the only route group.
- **Code — CSS duplication across 5 new modules:** `website/components/about/about.module.css`, `changelog/changelog.module.css`, `cli-ref/cli-ref.module.css`, `examples/examples.module.css`, `license/license.module.css` — eyebrow and title blocks (~40 lines each) are identical across all 5 modules. A shared base would eliminate ~160 lines. Acceptable for now — each module is self-contained — but becomes maintenance debt as pages multiply.
- **Upstream — Hardcoded version 'v1.0.2' in proof-feed.ts still present:** `website/lib/proof-feed.ts:70` — see proof chain finding from Website Lift. Not affected by this scope.
- **Upstream — mapEntry never produces kind 'chore' still present:** `website/lib/proof-feed.ts:74` — see proof chain finding from Website Lift. Not affected by this scope.

## Deployer Handoff

This PR eliminates all dead links on the marketing site, unifies navigation across all pages, and adds 5 new routes. After merging:

1. Visually confirm the proof feed section on the landing page — the "Click one." header copy is stale (finding, not blocker). Users may notice the mismatch before a follow-up fix.
2. The MAINTENANCE_MANUAL.md still references the old `(sub)` architecture — update it in a follow-up or during the next website scope.
3. All 9 pages are statically generated. No new runtime dependencies. No environment changes needed.
4. The Team plan CTA (`/contact`) has a TODO comment at copy.ts:217 — replace with a waitlist form URL when ready.

## Verdict

**Shippable:** YES

31/31 contract assertions satisfied. Build succeeds with all 13 pages generated. 1998 CLI tests pass with no regressions. Every dead link eliminated. The stale proof feed copy ("Click one.", "Each row links to...") is a legitimate debt item but not a dead link — it's misleading prose, not a broken href. The implementation is clean, follows the manifesto pattern consistently, and the scope creep checks came back empty. Would I stake my name on this shipping? Yes — with the copy fix noted for the next cycle.
