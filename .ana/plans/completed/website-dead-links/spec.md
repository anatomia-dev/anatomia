# Spec: Dead Links & Missing Pages

**Created by:** AnaPlan
**Date:** 2026-05-07
**Scope:** .ana/plans/active/website-dead-links/scope.md

## Approach

Three layers, each eliminating a class of dead links:

**Layer 1: Unify navigation.** Delete the `(sub)` route group entirely — `layout.tsx` and the `SubNav` component. Move docs, manifesto, and contact page files into `(marketing)` so every page shares the same Nav + Footer from the marketing layout. Fix all relative hash links in `copy.nav.links` and `copy.footer.columns` to use absolute paths (`/#pipeline`, `/#agents`, `/#pricing`) so they work from any page. Add `id="agents"` to the AgentsTile wrapper div. The hero CTAs (`#pricing`, `#pipeline` in `copy.hero.ctas`) stay as relative hashes — they only render on the landing page.

**Layer 2: Fix every dead href.** Replace the 5 `href: "#"` links in copy.ts with real destinations: Free plan CTA → `/#pricing` (scroll to install), Team plan CTA → `/contact` (interim waitlist destination, mark with `TODO`), proof feed "Full history" → `https://github.com/TettoLabs/anatomia/commits/main`, and docs "next" items for CLI reference and Examples → change status from `"Live"` to `"Coming soon"`. Remove `url` from the `ProofEntry` interface and all consumers: proof feed rows become `<div>` (remove arrow SVG), Nav version pill becomes `<span>`, Footer commit pill becomes a display-only `<span>` styled as a pill.

**Layer 3: Build 5 missing pages.** Create `/changelog`, `/cli`, `/examples`, `/about`, `/license` — each following the manifesto structural pattern: page.tsx with metadata export + `<main>` wrapper, content component with eyebrow (brand rule) + `splitHeadline()` title + body text. Content is minimal but intentional — "coming soon" stubs for pages without content yet, real content for about and license. Add all 9 pages to sitemap.ts.

**Open question resolution:**
- Team CTA waitlist URL: use `/contact` with a `// TODO: Replace with waitlist form URL when available` comment. The contact page exists and gives users a real destination.

## Output Mockups

**Nav hash links (from any page):** `/#pipeline`, `/#agents`, `/#pricing`, `/docs` — all absolute, all resolve from any page.

**Footer commit pill (display-only):**
```
commit · 93a4cac · 4m ago
```
Rendered as a `<span>` with `rounded-full px-[10px] py-[3px]` pill shape, no link, no hover states.

**New page structure (e.g., /about):**
```
[anatomia]  v1.0.2 · 4m ago    Pipeline  Agents  Pricing  Docs    ☀  GitHub  Install

── About                    ← eyebrow with brand rule

Two people. One *idea*.     ← dual-font title via splitHeadline

Body text at serif 18px...  ← same typographic treatment as manifesto

─── Footer ───
```

**Proof feed row (non-linking):**
```
93a4cac  new  Worktree isolation — concurrent agents...  45/45  4m ago
```
No arrow icon. Rendered as `<div>` not `<a>`.

## File Changes

### `website/lib/copy.ts` (modify)
**What changes:** Fix 3 hash links in `nav.links` to absolute (`/#pipeline`, `/#agents`, `/#pricing`). Fix 3 hash links in `footer.columns[0]` (Product) to absolute. Replace `href: "#"` on Free plan CTA with `/#pricing`, Team plan CTA with `/contact` (+ TODO comment). Replace proof feed `footLink.href` with `https://github.com/TettoLabs/anatomia/commits/main`. Change docs next items "CLI reference" and "Examples" status from `"Live"` to `"Coming soon"`. Add copy objects for the 5 new pages (changelog, cli, examples, about, license). The Nav CTA `#pricing` (line 103 in Nav.tsx) uses `copy.nav` — but it's hardcoded in Nav.tsx, not from copy.ts. Fix it there.
**Pattern to follow:** Existing copy structure — `copy.manifesto` and `copy.contact` objects show the sub-page copy pattern (eyebrow, title, body).
**Why:** Every `href="#"` is a dead link. Every relative hash link breaks on sub-pages.

### `website/lib/proof-feed.ts` (modify)
**What changes:** Remove `url` field from `ProofEntry` interface. Remove `url` from `mockFeed()` return objects. Remove `url: ...` from `mapEntry()`.
**Pattern to follow:** The field is consumed in 3 places (ProofFeed rows, Nav pill, Footer pill) — all three are being delinked in this scope.
**Why:** The `url` field generates dead `#proof-{slug}` anchors that don't resolve to anything.

### `website/components/proof-feed/ProofFeed.tsx` (modify)
**What changes:** Change proof feed rows from `<a href={e.url}>` to `<div>`. Remove the arrow SVG (lines 106-109). Keep `role="listitem"`. Update the "Full history" foot link `href` — this already reads from `copy.proofFeed.footLink.href`, so the copy.ts fix propagates automatically.
**Pattern to follow:** The row keeps its existing CSS class `styles.proofRow` and all other visual elements.
**Why:** Rows linked to `#proof-{hash}` anchors that don't exist. Removing the link is honest.

### `website/components/nav/Nav.tsx` (modify)
**What changes:** Change the version pill from `<a href={latest.url}>` to a `<span>`. Keep all visual styling. Remove `no-underline` class (irrelevant on span). Change the CTA `<Link href="#pricing">` to `<Link href="/#pricing">` — the Nav renders on all pages now.
**Pattern to follow:** The pill keeps its existing classes and inline styles.
**Why:** Version pill linked to dead `#proof-{slug}` anchor. CTA hash link breaks on sub-pages.

### `website/components/nav/NavMobile.tsx` (modify)
**What changes:** Change the bottom CTA `<Link href="#pricing">` to `<Link href="/#pricing">`. The nav links already read from `copy.nav.links` so the absolute path fix propagates automatically.
**Pattern to follow:** Same pattern as desktop Nav CTA.
**Why:** Mobile CTA hash link breaks on sub-pages.

### `website/components/footer/Footer.tsx` (modify)
**What changes:** Change commit pill from `<a href={latest.url}>` to a `<span>` styled as a pill: `rounded-full` border-radius, `px-[10px] py-[3px]` padding. Remove the underline styling (`border-b pb-px`). Remove hover states. Keep mono text, ink colors, and the "commit · hash · ago" format.
**Pattern to follow:** The Nav version pill's existing pill styling (rounded-full, padding, border, background).
**Why:** Commit pill linked to dead `#proof-{slug}` anchor.

### `website/components/bento/tiles/AgentsTile.tsx` (modify)
**What changes:** Add `id="agents"` to the root `<div>` of the tile.
**Pattern to follow:** `id="pipeline"` on the Bento `<section>` shows the anchor pattern.
**Why:** `#agents` and `/#agents` links have no scroll target without this ID.

### `website/app/(sub)/layout.tsx` (delete)
**What changes:** Delete the entire file.
**Why:** Sub-pages move to `(marketing)` layout which provides Nav + Footer.

### `website/app/(sub)/docs/page.tsx` (delete)
**What changes:** Delete. Replaced by `website/app/(marketing)/docs/page.tsx`.

### `website/app/(sub)/manifesto/page.tsx` (delete)
**What changes:** Delete. Replaced by `website/app/(marketing)/manifesto/page.tsx`.

### `website/app/(sub)/contact/page.tsx` (delete)
**What changes:** Delete. Replaced by `website/app/(marketing)/contact/page.tsx`.

### `website/components/sub-nav/SubNav.tsx` (delete)
**What changes:** Delete the component entirely.
**Why:** All pages now use the main Nav via the `(marketing)` layout.

### `website/app/(marketing)/docs/page.tsx` (create)
**What changes:** Docs page without SubNav import. Marketing layout provides Nav + Footer. Same metadata, same component imports (DocsHero, DocsSteps, DocsRecap, DocsNext), same `<main>` structure.
**Pattern to follow:** The existing `(sub)/docs/page.tsx` minus the SubNav.

### `website/app/(marketing)/manifesto/page.tsx` (create)
**What changes:** Manifesto page without SubNav import.
**Pattern to follow:** The existing `(sub)/manifesto/page.tsx` minus the SubNav.

### `website/app/(marketing)/contact/page.tsx` (create)
**What changes:** Contact page without SubNav import.
**Pattern to follow:** The existing `(sub)/contact/page.tsx` minus the SubNav.

### `website/app/(marketing)/changelog/page.tsx` (create)
**What changes:** Changelog page — metadata + `<main>` wrapper + Changelog component.
**Pattern to follow:** `(sub)/manifesto/page.tsx` structure.

### `website/app/(marketing)/cli/page.tsx` (create)
**What changes:** CLI reference stub page.
**Pattern to follow:** Same as changelog page.

### `website/app/(marketing)/examples/page.tsx` (create)
**What changes:** Examples stub page.
**Pattern to follow:** Same as changelog page.

### `website/app/(marketing)/about/page.tsx` (create)
**What changes:** About page with real content.
**Pattern to follow:** Same as changelog page.

### `website/app/(marketing)/license/page.tsx` (create)
**What changes:** License page displaying the full MIT license text.
**Pattern to follow:** Same as changelog page, but with monospace license text.

### `website/components/changelog/Changelog.tsx` (create)
**What changes:** Changelog content component with eyebrow + title + hardcoded entries.
**Pattern to follow:** `components/manifesto/Manifesto.tsx` — eyebrow with brand rule, `splitHeadline()` title, body paragraphs.

### `website/components/changelog/changelog.module.css` (create)
**What changes:** Styles for changelog page.
**Pattern to follow:** `components/manifesto/manifesto.module.css` — same eyebrow, title, body patterns.

### `website/components/cli-ref/CliRef.tsx` (create)
**What changes:** CLI reference stub — eyebrow + title + "coming soon" message + link to GitHub.
**Pattern to follow:** Same as Changelog component.

### `website/components/cli-ref/cli-ref.module.css` (create)
**What changes:** Styles for CLI reference page.
**Pattern to follow:** Same as changelog.module.css.

### `website/components/examples/Examples.tsx` (create)
**What changes:** Examples stub component.
**Pattern to follow:** Same as CliRef.

### `website/components/examples/examples.module.css` (create)
**What changes:** Styles for examples page.
**Pattern to follow:** Same as changelog.module.css.

### `website/components/about/About.tsx` (create)
**What changes:** About page with real content — company description, mission, team info.
**Pattern to follow:** Same as Manifesto component.

### `website/components/about/about.module.css` (create)
**What changes:** Styles for about page.
**Pattern to follow:** Same as manifesto.module.css.

### `website/components/license/License.tsx` (create)
**What changes:** License page displaying the full MIT license text from the repo root. The license body renders in monospace at a smaller size than the serif body text.
**Pattern to follow:** Manifesto component for the eyebrow + title. License body uses mono font instead of serif.

### `website/components/license/license.module.css` (create)
**What changes:** Styles for license page. Same eyebrow/title as manifesto, but body uses `var(--font-mono)` for the license text.
**Pattern to follow:** manifesto.module.css adapted for monospace body.

### `website/app/sitemap.ts` (modify)
**What changes:** Add entries for `/changelog`, `/cli`, `/examples`, `/about`, `/license`. All 9 pages in the sitemap.
**Pattern to follow:** Existing 4 entries — same structure, appropriate `changeFrequency` and `priority`.

## Acceptance Criteria

- [ ] AC1: All pages use the same Nav component — no SubNav anywhere, `(sub)` route group deleted
- [ ] AC2: Zero `href="#"` links remain in copy.ts
- [ ] AC3: `#agents` anchor exists and scrolls to the agents tile on the landing page
- [ ] AC4: Proof feed rows are non-linking display elements (no `<a>` wrapper, no dead anchors)
- [ ] AC5: Nav version pill is display-only (no link to dead `#proof-{slug}`)
- [ ] AC6: Footer commit pill is a display-only `<span>` styled as a pill (`rounded-full`, `padding: 3px 10px`) — no `<a>` tag, no link, no hover states
- [ ] AC7: `/changelog`, `/cli`, `/examples`, `/about`, `/license` all return 200
- [ ] AC8: All footer links resolve to real pages or valid absolute anchors
- [ ] AC9: All nav links resolve to real sections (from any page, not just the landing page)
- [ ] AC10: Hash links in nav and footer use absolute paths (`/#pipeline` not `#pipeline`) so they work from sub-pages
- [ ] AC11: Docs "next" cards for CLI reference and Examples show "Coming soon" status, not "Live"
- [ ] AC12: "Full history →" link in proof feed points to `https://github.com/TettoLabs/anatomia/commits/main`
- [ ] AC13: Zero dead links on any page — every `<a>` resolves to a real destination
- [ ] AC14: `sitemap.ts` includes all 9 pages
- [ ] AC15: `pnpm build` succeeds with no errors (website)
- [ ] AC16: No SubNav imports remain in any file

## Testing Strategy

- **Build verification:** `pnpm build` in the website directory is the primary verification — it catches missing imports, conflicting routes, and type errors. This is the website's only test infrastructure.
- **Manual verification:** All pages render, all links resolve. The contract defines what to check.
- **Type safety:** Removing `url` from `ProofEntry` causes compile errors in any stale consumer — the type system is the test for delink completeness.

There are no existing website tests (Vitest runs against `packages/cli` only). This scope doesn't add a test runner to the website — the build is the verification gate.

## Dependencies

- The `(sub)` route group must be fully deleted before `(marketing)` pages are created to avoid Next.js conflicting route errors. The deletion and creation should be atomic — delete all `(sub)` files, then create `(marketing)` pages.
- The 5 new pages need copy entries in `copy.ts` before the components can reference them.

## Constraints

- Hero CTAs (`#pricing`, `#pipeline`) must stay as relative hashes — they only render on the landing page and absolute paths would trigger a full page reload instead of smooth scroll.
- New page content must use the `*emphasis*` convention for the emphasis word in titles, matching existing patterns.
- The MIT license text comes from the repo root `LICENSE` file — copy it verbatim into the copy.ts entry or inline in the License component.
- Every new page must export a `metadata` object with `title: "PageName · Anatomia"` and a `description` for SEO.

## Gotchas

- **Conflicting routes during migration.** If `(sub)/docs/` and `(marketing)/docs/` both exist, Next.js throws a build error. Delete the entire `(sub)` directory before creating the new `(marketing)` page files. Or more safely: create the `(marketing)` pages, then delete `(sub)` — but verify the build only after `(sub)` is fully gone.
- **SubNav imports.** All three page files (`docs`, `manifesto`, `contact`) import SubNav. The new `(marketing)` versions must not import it. If the old pages are copied as a starting point, the SubNav import line must be removed.
- **NavMobile reads `copy.nav.links`.** The hash fix in copy.ts propagates to mobile nav automatically. The `onClick={close}` handler on mobile links handles overlay dismissal before navigation. No separate mobile fix needed for nav links — but the bottom CTA `<Link href="#pricing">` is hardcoded in NavMobile.tsx and needs the same `/#pricing` fix.
- **Proof feed row arrow.** The arrow SVG (lines 106-109 in ProofFeed.tsx) implies clickability. Remove it when changing the row to `<div>` — an arrow pointing nowhere is visual noise.
- **`ProofEntry.url` removal is a breaking type change.** Every consumer that references `.url` will fail to compile. This is intentional — it surfaces any stale reference. But the build will fail until ALL consumers are updated. Do the interface change and all consumer changes together.
- **Footer commit pill restyling.** The current footer pill uses `border-b pb-px` underline style. AC6 specifies `rounded-full` + `px-[10px] py-[3px]` pill shape. This is a visual change, not just a delink — carry forward the pill shape while removing interactivity.
- **New page CSS modules.** Each follows manifesto.module.css but the stub pages (cli, examples, changelog) need less — no pull quote, no drop cap, no post-pull body. Keep the modules lean: eyebrow, title, body, and a "coming soon" styled block.

## Build Brief

### Rules That Apply
- Website uses `@/` import alias (maps to the website root). All imports use `@/lib/`, `@/components/` paths.
- Components are PascalCase files, CSS modules are kebab-case: `About.tsx` + `about.module.css`.
- The website is a Next.js app — `export const metadata` for page metadata, `Link` from `next/link` for internal navigation.
- `splitHeadline()` from `@/lib/format` parses `*word*` into segments for dual-font title rendering.
- `<Formatted>` from `@/components/ui/Formatted` renders `*em*`, `**strong**`, `` `code` `` in body text.
- No default exports except page components (Next.js requires `export default function PageName`).
- Page components use `export default function`, content components use `export function`.

### Pattern Extracts

**Manifesto page.tsx (structural analog for new pages):**
```tsx
// website/app/(sub)/manifesto/page.tsx — lines 1-20
import type { Metadata } from "next";
import { Manifesto } from "@/components/manifesto/Manifesto";

export const metadata: Metadata = {
  title: "Manifesto · Anatomia",
  description:
    "Code should come with proof. A short note on why Anatomia exists.",
};

export default function ManifestoPage() {
  return (
    <main id="main" className="relative pt-[140px] pb-24">
      <Manifesto />
    </main>
  );
}
```

Note: No SubNav import. The `(marketing)` layout provides Nav + Footer.

**Manifesto component eyebrow pattern (from manifesto.module.css lines 10-27):**
```css
.eyebrow {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-45);
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 28px;
}
.eyebrow::before {
  content: "";
  width: 18px;
  height: 1px;
  background: var(--color-brand);
}
```

**Manifesto component structure (from Manifesto.tsx lines 12-58):**
```tsx
export function Manifesto() {
  const title = splitHeadline(copy.manifesto.title);
  return (
    <article className={styles.article}>
      <div className={styles.eyebrow}>{copy.manifesto.eyebrow}</div>
      <h1 className={styles.title}>
        {title.map((p, i) =>
          p.em ? <em key={i}>{p.t}</em> : <span key={i}>{p.t}</span>,
        )}
      </h1>
      {/* body paragraphs */}
    </article>
  );
}
```

### Proof Context

**proof-feed.ts** — 3 active findings from Website Lift:
- `mapEntry` never produces kind `'chore'` — only `'fix'` or `'feature'` (not affected by this scope)
- Hardcoded version `'v1.0.2'` will go stale (not affected by this scope — future work)
- Empty entries returns `[]` instead of `mockFeed` — blank state possible (not affected by this scope)

No active proof findings for other affected files.

### Checkpoint Commands

- After deleting `(sub)` and creating `(marketing)` pages: `cd website && pnpm build` — Expected: build succeeds, no conflicting route errors
- After all changes: `cd website && pnpm build` — Expected: clean build, all 9 pages generated
- CLI tests (regression): `cd packages/cli && pnpm vitest run` — Expected: 1950 tests pass (unchanged)

### Build Baseline
- Current CLI tests: 1950 passed in 95 files
- Current CLI test files: 95
- Command used: `cd packages/cli && pnpm vitest run`
- After build: 1950 tests in 95 files (no CLI changes, no new tests)
- Website verification: `cd website && pnpm build` (no test runner for website)
- Regression focus: None — this scope only touches website files, CLI tests are unaffected
