# Scope: Dead Links & Missing Pages

**Created by:** Ana
**Date:** 2026-05-07

## Intent
Eliminate every dead link on the site, unify navigation across all pages, and build the 5 missing pages that the footer promises. A verification product with dead links is a credibility failure — every `href="#"`, every 404, every anchor that scrolls nowhere undermines the core message. The user wants zero dead links, consistent nav, and every footer link resolving to a real destination.

## Complexity Assessment
- **Size:** medium
- **Files affected:**
  - `website/lib/copy.ts` — fix 5 `href="#"` links, fix 6 relative hash links to absolute, fix 2 docs "next" status badges (lines 38-40, 57, 200, 216, 227, 284-287, 347-349)
  - `website/lib/proof-feed.ts` — remove `url` field from ProofEntry, or make rows non-linking (lines 43-48, 79)
  - `website/components/proof-feed/ProofFeed.tsx` — change feed rows from `<a>` to non-linking `<div>` (line 89)
  - `website/components/footer/Footer.tsx` — change commit pill from `<a>` to display-only element
  - `website/components/nav/Nav.tsx` — remove link from version pill (or leave as display-only)
  - `website/app/(sub)/docs/page.tsx` — remove SubNav, move to `(marketing)` route group
  - `website/app/(sub)/manifesto/page.tsx` — same
  - `website/app/(sub)/contact/page.tsx` — same
  - `website/app/(sub)/layout.tsx` — delete
  - `website/components/sub-nav/SubNav.tsx` — delete
  - `website/components/bento/Bento.tsx` or `website/components/bento/tiles/AgentsTile.tsx` — add `id="agents"` anchor
  - `website/app/(marketing)/changelog/page.tsx` — new
  - `website/app/(marketing)/cli/page.tsx` — new
  - `website/app/(marketing)/examples/page.tsx` — new
  - `website/app/(marketing)/about/page.tsx` — new
  - `website/app/(marketing)/license/page.tsx` — new
  - `website/app/sitemap.ts` — add 5 new page entries to the hardcoded list
- **Blast radius:** Navigation and routing changes affect every page. The SubNav removal changes the layout inheritance for 3 existing pages. Hash link fixes affect copy.ts which feeds every component. New pages are additive — no existing code changes for them beyond copy.ts entries.
- **Estimated effort:** 4–6 hours. The SubNav removal is a structural change that needs careful verification. The 5 new pages follow an established pattern but need real content and craft. The link fixes in copy.ts and proof-feed.ts are mechanical.
- **Multi-phase:** no

## Approach
Three layers, each eliminating a class of dead links:

**Layer 1: Unify navigation.** Delete the `(sub)` route group and move docs, manifesto, contact into `(marketing)` so every page shares the same Nav + Footer. Fix all relative hash links (`#pipeline`, `#agents`, `#pricing`) to absolute (`/#pipeline`, `/#agents`, `/#pricing`) so they work from any page. Add `id="agents"` to the AgentsTile wrapper.

**Layer 2: Fix every dead href.** Replace the 5 `href="#"` links in copy.ts with real destinations. Remove the link behavior from proof feed rows (rows become informational display, not navigation). Remove the link from the Nav version pill and Footer commit pill since they point to the same dead `#proof-{slug}` anchors.

**Layer 3: Build missing pages.** Create the 5 pages the footer promises — /changelog, /cli, /examples, /about, /license. Each follows the established sub-page pattern (eyebrow with brand rule, dual-font title, body text at 17px). Content is minimal but intentional.

## Acceptance Criteria
- AC1: All pages use the same Nav component — no SubNav anywhere, `(sub)` route group deleted
- AC2: Zero `href="#"` links remain in copy.ts
- AC3: `#agents` anchor exists and scrolls to the agents tile on the landing page
- AC4: Proof feed rows are non-linking display elements (no `<a>` wrapper, no dead anchors)
- AC5: Nav version pill is display-only (no link to dead `#proof-{slug}`)
- AC6: Footer commit pill is a display-only `<span>` styled as a pill (`rounded-full`, `padding: 3px 10px`) — carrying forward the visual shape from Scope A but removing the `<a>` tag, link, and hover states
- AC7: `/changelog`, `/cli`, `/examples`, `/about`, `/license` all return 200
- AC8: All footer links resolve to real pages or valid absolute anchors
- AC9: All nav links resolve to real sections (from any page, not just the landing page)
- AC10: Hash links in nav and footer use absolute paths (`/#pipeline` not `#pipeline`) so they work from sub-pages
- AC11: Docs "next" cards for CLI reference and Examples show "Coming soon" status, not "Live"
- AC12: "Full history →" link in proof feed points to `https://github.com/TettoLabs/anatomia/commits/main`
- AC13: Zero dead links on any page — every `<a>` resolves to a real destination
- AC14: `sitemap.ts` includes all 9 pages (/, /docs, /manifesto, /contact, /changelog, /cli, /examples, /about, /license)

## Edge Cases & Risks
- **Route group move breaks URLs.** Next.js route groups are parenthesized and don't appear in URLs. Moving `/docs` from `(sub)/docs/` to `(marketing)/docs/` preserves the URL `/docs`. No redirects needed. But the build must be verified — if both `(sub)/docs/` and `(marketing)/docs/` exist during the migration, Next.js will error on conflicting routes. The `(sub)` directory must be fully deleted, not just emptied.
- **SubNav removal breaks component imports.** Three page files import `SubNav`. The import must be removed alongside the component move — if the page renders in `(marketing)` layout but still imports and renders SubNav, the page will show two navs.
- **Hash links from the landing page.** The hero CTAs use `#pricing` and `#pipeline` (copy.ts lines 57-58). These only render on the landing page, so relative hashes work fine. Don't change these to absolute — `/#pricing` is semantically identical to `#pricing` on the landing page but adds a full page reload if the user is already there. Leave hero CTAs as relative.
- **Proof feed row accessibility.** Changing rows from `<a>` to `<div>` changes the semantic role. The rows currently have `role="listitem"` which is fine for non-interactive elements, but the row arrow icon (→) becomes misleading on a non-linking element. Remove the arrow SVG or replace with a non-directional indicator.
- **New pages need metadata.** Each page must export a `metadata` object with `title` and `description` for SEO. Follow the pattern in existing sub-pages: `"Title · Anatomia"`.
- **Footer commit pill loses interactivity.** Scope A reskins this as a pill shape with hover background (`rounded-full`, `padding: 3px 10px`, hover `border-color` + `background`). Scope B then removes the `<a>` tag and hover states, keeping the pill shape as a display-only `<span>`. The visual form survives — only the interactivity is removed.
- **Docs "next" cards with "Coming soon" status.** The DocsNext component applies brand-colored styling only when `status === "Live"`. Cards with "Coming soon" will get muted gray styling automatically. But the cards still link to `/cli` and `/examples` via `<Link>` — after B5 ships those pages exist, so the links are valid. The status change is the only fix needed.
- **Team CTA waitlist link.** The requirements doc notes this as a product decision — a Typeform/Formspree URL is needed. Scope this as: use a temporary destination (the GitHub repo or a contact page link) with a `TODO` comment. The real URL is wired when the waitlist form exists.

## Rejected Approaches
- **Keep SubNav as an alternative nav.** The SubNav creates an inconsistent experience — different links, no version pill, no CTA, no mobile menu. A single Nav is the right call. Sub-pages need access to Pipeline/Agents/Pricing links, and the hash-to-absolute fix makes those work from any page.
- **Link proof feed rows to GitHub commits.** The mock feed hashes are real git SHAs, but `mapEntry()` uses `entry.hashes.scope.slice(7, 14)` which is a SHA-256 hash of the scope artifact — NOT a git commit SHA. Constructing `github.com/TettoLabs/anatomia/commit/{hash}` from artifact hashes produces dead links. Removing the link is honest; linking to a generic page is filler.
- **Build full-content pages for /cli, /examples, etc.** These pages need to exist to kill dead links, but full content is a separate scope. The placeholder pages should feel intentional — "coming soon" with a link to GitHub, matching the premium aesthetic. A well-crafted stub is better than an incomplete reference.
- **Fix hash links by adding section IDs to sub-pages.** Adding `id="pipeline"` to sub-pages so `#pipeline` resolves would be wrong — those sections don't exist on sub-pages. The fix is absolute paths, not fake anchors.

## Open Questions
- The Team CTA waitlist URL. Using `/contact` as the interim destination is the safest bet — it gives users a way to reach out. AnaPlan should confirm this or use a `TODO` placeholder.

## Exploration Findings

### Patterns Discovered
- `copy.ts` is the single source of truth for all links. Every `href` in the footer, nav, hero, and docs flows from this file. Fixing links in copy.ts propagates everywhere.
- The manifesto already uses absolute hash links correctly: `href: "/#pipeline"` (line 308). The nav and footer links are the ones missing the leading `/`.
- Sub-page pattern is consistent: eyebrow with brand rule (`h-px w-[18px]` + brand color + mono text), title via `splitHeadline()` for dual-font rendering, body at 17px with `ink-75`, wrapper at `pt-[140px] pb-24` + `mx-auto max-w-[760px] px-2`.
- `DocsHero.tsx` shows the cleanest implementation of the eyebrow + title + lede pattern. `Manifesto.tsx` shows the cleanest article-style layout with body paragraphs.
- `ProofEntry.url` is consumed in 3 places: ProofFeed rows (line 92), Nav version pill (line 46), Footer commit pill (line 102). All three must be addressed together.

### Constraints Discovered
- [TYPE-VERIFIED] `mapEntry()` (proof-feed.ts:79) builds URLs as `#proof-${entry.slug}` — slug-based, not hash-based. These are proof chain entry slugs like "worktree-isolation", not commit SHAs.
- [TYPE-VERIFIED] `mockFeed()` (proof-feed.ts:43-48) builds URLs as `#proof-{hash}` — mock git SHAs. Neither mock nor real URLs resolve to anything.
- [TYPE-VERIFIED] Nav version pill (Nav.tsx:46) renders `<a href={latest.url}>` — this is the same dead `#proof-{slug}` URL.
- [TYPE-VERIFIED] Footer commit pill (Footer.tsx:102) renders `<a href={latest.url}>` — same dead URL.
- [TYPE-VERIFIED] No `id="agents"` exists anywhere in the website source. Bento section has `id="pipeline"`. The AgentsTile renders as a plain `<div>` with no ID.
- [TYPE-VERIFIED] `(sub)/layout.tsx` only wraps `{children} + <Footer />`. SubNav is per-page, not layout-level. Each of the 3 sub-pages imports and renders SubNav directly.
- [OBSERVED] `docs/next` items "CLI reference" and "Examples" have `status: "Live"` but their pages (/cli, /examples) don't exist — these are false positives on the live site today.
- [OBSERVED] Footer hash links (`#pipeline`, `#agents`, `#pricing`) are already broken today on /docs, /manifesto, /contact — not a new problem introduced by B1, but B1 extends the breakage to the Nav on those pages.

### Test Infrastructure
- No link-checking tests exist. No route verification. CI runs `pnpm build` which catches missing imports but not dead anchors or 404 links.

## For AnaPlan

### Structural Analog
`website/app/(sub)/manifesto/page.tsx` + `website/components/manifesto/Manifesto.tsx` — the cleanest existing sub-page. Each new page should follow this structure: metadata export, `<main>` wrapper with standard padding, content component with eyebrow + title + body.

### Relevant Code Paths
- `website/lib/copy.ts` — all link hrefs. Lines 38-40 (nav), 57-58 (hero CTAs), 200+216 (pricing CTAs), 227 (proof feed foot), 284-287 (docs next), 347-349 (footer product links)
- `website/lib/proof-feed.ts` — `ProofEntry.url` field, `mockFeed()` URLs, `mapEntry()` URL construction
- `website/components/proof-feed/ProofFeed.tsx` — row rendering (line 89: `<a href={e.url}>`), foot link (line 117: `<a href={copy.proofFeed.footLink.href}>`)
- `website/components/nav/Nav.tsx` — version pill `<a>` (line 46)
- `website/components/footer/Footer.tsx` — commit pill `<a>` (line 101-113)
- `website/app/(sub)/layout.tsx` — delete target
- `website/app/(sub)/docs/page.tsx` — move to `(marketing)`, remove SubNav
- `website/app/(sub)/manifesto/page.tsx` — move to `(marketing)`, remove SubNav
- `website/app/(sub)/contact/page.tsx` — move to `(marketing)`, remove SubNav
- `website/components/sub-nav/SubNav.tsx` — delete target
- `website/components/bento/tiles/AgentsTile.tsx` — add `id="agents"` to tile wrapper div
- `website/components/docs/DocsNext.tsx` — status badge styling (already handles non-"Live" correctly)
- `website/lib/format.ts` — `splitHeadline()` for dual-font title rendering in new pages
- `website/app/sitemap.ts` — hardcoded with 4 entries today, needs all 9 pages

### Patterns to Follow
- `app/(sub)/manifesto/page.tsx` — page file pattern (metadata + main wrapper + component)
- `components/manifesto/Manifesto.tsx` — content component pattern (eyebrow + title + body + links)
- `components/docs/DocsHero.tsx` — eyebrow with brand rule pattern (the `h-px w-[18px]` + brand color + mono text)
- `lib/format.ts` `splitHeadline()` — parses `*word*` into segments for dual-font rendering
- Manifesto outbound link (line 308): `href: "/#pipeline"` — the correct way to reference landing page anchors from sub-pages

### Known Gotchas
- The route group move must be atomic — if `(sub)/docs/` and `(marketing)/docs/` both exist, Next.js will throw a conflicting route error at build time. Delete `(sub)` entirely before verifying the build.
- The hero CTAs (`#pricing`, `#pipeline` on lines 57-58) must stay as relative hashes — they only render on the landing page and an absolute `/#pricing` would trigger a full page reload instead of a smooth scroll.
- `ProofEntry.url` is typed in the `ProofEntry` interface. If Plan removes the field, every consumer must be updated. If Plan keeps the field but sets it to empty/null, the type must change. Either approach works — removing the field is cleaner since no consumer should use it after this scope.
- The proof feed row has an arrow SVG (line 106-108 in ProofFeed.tsx) that implies navigation. When the row becomes non-linking, the arrow should be removed — an arrow pointing nowhere is visual noise.
- New page content in copy.ts should use the `*emphasis*` convention for the emphasis word in titles, matching existing patterns: `"Code should come with *proof*."`, `"Two ways to reach *us*."`, etc.
- The `/license` page needs the full MIT license text. The CLI package.json or repo root likely has the canonical text — Plan should check `LICENSE` or `LICENSE.md` at the repo root.

### Things to Investigate
- The mobile Nav overlay (`NavMobile.tsx`) also renders `copy.nav.links` — the hash link fix in copy.ts will propagate here automatically, but verify the mobile overlay correctly navigates and closes when tapping an absolute hash link like `/#pipeline` from a sub-page.
- Whether the changelog page should pull version data from the CLI's `package.json` or hardcode entries. Hardcoding is fine for this scope — dynamic version fetching is Scope C territory.
