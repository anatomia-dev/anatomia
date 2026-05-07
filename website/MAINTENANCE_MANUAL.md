# Maintenance Manual

**Author:** Ana (prototype builder)
**Date:** 2026-05-06
**Audience:** Any developer maintaining, extending, or updating this codebase

---

## Architecture at a Glance

```
app/
  layout.tsx              Root layout (fonts, theme bootstrap, skip link)
  globals.css             Design tokens, themes, base reset, utilities
  fonts.ts                Self-hosted Geist + Geist Mono + Fraunces
  (marketing)/            Public marketing pages (all 9 pages)
    layout.tsx            Nav + Footer wrapper
    page.tsx              Landing page (composes all sections)
    about/changelog/cli/contact/docs/examples/license/manifesto/
  (app)/                  Platform boundary (empty — future)
    README.md

components/
  ui/                     Design system primitives (3 files)
  nav/                    Site navigation (4 files)
  hero/                   Hero section (4 files)
  marquee/                Compatibility marquee (2 files)
  scan/                   Scan slab section (2 files)
  bento/                  Bento grid + 6 tiles (8 files)
  deep/                   Deep dive section (1 file)
  pricing/                Pricing section (4 files)
  proof-feed/             Ship log dock (3 files)
  docs/                   Docs page components (4 files)
  manifesto/              Manifesto components (2 files)
  contact/                Contact components (2 files)

lib/
  copy.ts                 ALL user-visible strings (monolithic, typed)
  proof-feed.ts           Proof feed data layer (mock → real swap point)
  theme.ts                Theme toggle hook (useSyncExternalStore)
  format.ts               Text formatting (splitHeadline)
  utils.ts                Shared utilities (cn)
```

---

## Design Decisions & Why

### 1. Monolithic `copy.ts`

**Decision:** Every user-visible string on the site lives in one file.

**Why:** A non-developer can open one file, ctrl-F any string they see on the site, edit it, and have it just work. Split copy files add navigation overhead and scattered diffs for zero benefit at this scale (395 lines).

**When to reconsider:** If copy.ts exceeds ~800 lines (likely when blog posts or extended docs arrive). At that point, introduce MDX as a second tier for long-form prose. UI strings stay in copy.ts.

**How to use:**
```tsx
import { copy } from "@/lib/copy";
<h1>{copy.hero.headline}</h1>
```

### 2. Proof feed as shared data source

**Decision:** Version pill, eyebrow, ship log, and footer commit all read from `getProofFeed()` — not from hardcoded strings in copy.ts.

**Why:** When mock data is replaced with real GitHub API data, ONE function body changes and all 5 consumers update automatically. If these were copy.ts strings, wiring to real data would be a 5-file refactor.

**The contract:**
```typescript
interface ProofEntry {
  version: string;     // "v1.0.2"
  hash: string;        // "93a4cac"
  ts: string;          // ISO timestamp
  kind: ProofKind;     // "feature" | "fix" | "chore"
  feat: string;        // Plain English description
  feature_em: string;  // Substring to emphasize
  assertions: number;  // Total contract assertions
  passed: number;      // Assertions verified
  url: string;         // Link to proof
}
```

Never change this shape without updating all consumers. The shape is the API.

### 3. CSS Modules only where Tailwind can't reach

**Decision:** 6 CSS modules for complex CSS. Everything else uses Tailwind utilities.

**Why:** Tailwind v4 processes each CSS Module in isolation. More modules = slower builds. Modules exist only for:
- Complex keyframe animations (marquee, hero shimmer)
- Pseudo-element styling (manifesto drop cap, proof-feed collapse)
- Responsive CSS Grid with named areas (bento)
- `:has()` selectors (proof-feed state)
- Complex hover/state transitions requiring multiple selectors

**Rule:** If you can express it as Tailwind utilities, do. If you need `@keyframes`, `::first-letter`, `:has()`, complex grid, or multi-selector transitions, use a module.

**Rule:** Never use `@apply` inside CSS Modules. Tailwind v4 won't resolve utilities in isolated module compilation. Use `var(--token)` directly.

### 4. Semantic color tokens in `@theme`

**Decision:** Added `--color-fg`, `--color-ink-60`, `--color-surface`, etc. to `@theme` so Tailwind generates utilities like `text-fg`, `text-ink-60`, `bg-surface`.

**Why:** Eliminates `style={{ color: "var(--ink-60)" }}` inline styles in new components. Existing components still use inline styles (works correctly) and should migrate incrementally when touched.

**How to use in new components:**
```tsx
// Instead of:
<p style={{ color: "var(--ink-60)" }}>text</p>

// Use:
<p className="text-ink-60">text</p>
```

Available utilities: `text-fg`, `text-fg-strong`, `text-ink-75`, `text-ink-60`, `text-ink-45`, `text-ink-30`, `text-ink-15`, `bg-bg`, `bg-surface`, `bg-surface-elevated`, `bg-surface-deep`, `border-border`, `border-border-soft`, `border-hairline`.

### 5. Server components by default

**Decision:** Only 8 of 35 components are client (`"use client"`).

**Why:** Server components render to HTML on the server — zero JS shipped for them. Client components are used ONLY when DOM APIs are required:
- `ThemeToggle` — reads/writes `data-theme` attribute
- `NavMobile` — toggles overlay state
- `NavScrollWrapper` — scroll event listener
- `ScrollHint` — scroll event listener
- `CopyButton` / `CopyAddress` — clipboard API
- `ProofFeedCard` — localStorage for collapse state
- `TetrisSnake` — canvas API + IntersectionObserver

**Rule:** Never add `"use client"` to a component that doesn't need a browser API. If you need interactivity in one small part, extract that part as a client child component — keep the parent server.

### 6. Theme bootstrap via raw `<script>`

**Decision:** Inline `<script>` in `<head>` reads localStorage and sets `data-theme` before React hydrates.

**Why:** Prevents FOUC (flash of unstyled content). React context or `useEffect` approaches cause a visible flash on hard reload because they run after hydration. The raw script runs synchronously in the initial HTML parse.

**Important:** If you ever change the theme attribute name from `data-theme` or the localStorage key from `anatomia-theme`, update BOTH the bootstrap script in `app/layout.tsx` AND the `useTheme()` hook in `lib/theme.ts`.

### 7. Touch targets at 44px

**Decision:** All icon buttons are `h-11 w-11` (44×44px).

**Why:** WCAG 2.5.8 Target Size (Level AAA). 34px buttons are technically Level A compliant but frustrating on mobile. 44px is the iOS Human Interface minimum and feels intentional.

### 8. Security headers

**Decision:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` disabling camera/mic/geo, HSTS with preload.

**Why:** Defense in depth. Costs nothing. Prevents clickjacking, MIME sniffing, and unnecessary permission grants. HSTS ensures the site is always accessed over HTTPS after the first visit.

### 9. `useSyncExternalStore` for client state

**Decision:** Theme and proof-feed-collapse use `useSyncExternalStore` instead of `useState` + `useEffect`.

**Why:** React 19.2's strict lint rules flag `setState` inside effects as a cascading render. `useSyncExternalStore` is the correct primitive for reading external state (localStorage, DOM attributes). It also handles SSR correctly via `getServerSnapshot`.

**Pattern:**
```typescript
function getSnapshot() { return localStorage.getItem(KEY); }
function getServerSnapshot() { return DEFAULT; }
function subscribe(cb) { window.addEventListener('event', cb); return () => ...; }
const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
```

---

## How to Add a New Page

1. All pages go in `(marketing)/`. It provides the Nav + Footer wrapper.
2. Create `app/(group)/your-page/page.tsx`.
3. Add metadata export.
4. If it needs copy, add entries to `lib/copy.ts`.
5. Build components in `components/your-page/`.
6. Add to `app/sitemap.ts`.
7. Run `pnpm check`.

Example — adding a `/blog` page:
```
app/(marketing)/blog/page.tsx       ← list page
app/(marketing)/blog/[slug]/page.tsx ← individual post
components/blog/BlogCard.tsx
```

The `(marketing)` layout already provides Nav + Footer. Just compose your content.

---

## How to Add a New Landing Page Section

1. Create `components/your-section/YourSection.tsx`.
2. If it needs complex CSS (keyframes, :has(), grid), add `your-section.module.css`.
3. Read copy from `copy.ts` — add new entries if needed.
4. Import into `app/(marketing)/page.tsx` in the correct position.
5. If it shows proof data, call `getProofFeed()` (async server component).
6. Run `pnpm check`.

---

## How to Update Copy

1. Open `lib/copy.ts`.
2. Find the string (ctrl-F).
3. Edit it.
4. If you're adding formatting: `*italic*`, `**bold**`, `` `code` ``.
5. The `<Formatted>` component renders these automatically.
6. Run `pnpm check` — TypeScript will catch any missing keys.

---

## How to Update Dependencies

### Next.js minor bump (e.g., 16.2 → 16.3)
```bash
pnpm update next@latest
pnpm check
```
Usually safe. Read the release notes for deprecations.

### Next.js major bump (e.g., 16 → 17)
- Read the migration guide carefully
- Check: async request APIs, `next.config.ts` format, `next/font` API, `<Script>` behavior
- The theme bootstrap is a raw `<script>` — should survive any Next.js version
- Run full visual regression after upgrade

### Tailwind minor bump (e.g., 4.2 → 4.3)
```bash
pnpm update tailwindcss@latest @tailwindcss/postcss@latest
pnpm check
```
Tailwind v4 patches are safe. Check release notes for new utilities you might want.

### React minor bump (e.g., 19.2 → 19.3)
Usually ships with a Next.js update. Let Next.js drive the React version.

---

## How to Test

### Manual smoke test
```bash
pnpm dev
# Visit each route, toggle dark mode, resize to mobile, check:
# - No layout overflow
# - Theme persists on refresh
# - All copy renders (no undefined/null)
# - Proof feed data appears in nav, hero, footer
# - ProofFeed collapse works
# - Mobile nav overlay works
# - Copy buttons work
```

### Automated checks
```bash
pnpm check    # lint + typecheck + build (catches 95% of issues)
```

### Visual regression (future)
When the site is deployed, use Vercel's preview deployments for visual diff before merge.

---

## How to Debug

### "Build fails with type error"
```bash
pnpm typecheck    # Shows the exact file + line
```

### "Styles look wrong in dark mode"
Check that the CSS property uses a `var(--token)` that's defined in BOTH `[data-theme="light"]` and `[data-theme="dark"]` in `globals.css`.

### "Component renders on server but breaks on client"
You're probably using a browser API (window, document, localStorage) in a server component. Either:
- Move the code to a `"use client"` component
- Guard with `typeof window !== "undefined"`

### "Tailwind utility not generating"
In Tailwind v4, utilities come from `@theme` tokens or Tailwind's built-in classes. If you're using `text-[var(--custom-thing)]`, the value must be valid CSS. For custom token utilities, add the token to `@theme` in `globals.css`.

### "CSS Module class not applying"
1. Check the import: `import styles from "./file.module.css"`
2. Use `styles.className` (camelCase), not the raw string
3. If you need a global selector inside a module, use `:global(.class-name)`

---

## Performance Budget

| Metric | Target | Notes |
|--------|--------|-------|
| Lighthouse Performance | ≥ 95 | Static site, should be trivial |
| Lighthouse Accessibility | 100 | WCAG AAA focus indicators, proper semantics |
| Lighthouse Best Practices | 100 | Security headers, HTTPS, no deprecated APIs |
| Lighthouse SEO | 100 | Metadata, robots, sitemap |
| First Contentful Paint | < 1s | Static prerender + self-hosted fonts |
| Total Blocking Time | < 50ms | Only 8 small client components |
| CLS | 0 | No layout shift (fonts have display:swap, explicit dimensions) |

---

## File naming conventions

| Type | Convention | Example |
|------|-----------|---------|
| Component | PascalCase | `Hero.tsx`, `PriceCard.tsx` |
| CSS Module | lowercase-kebab | `hero.module.css`, `proof-feed.module.css` |
| Lib file | lowercase-kebab | `proof-feed.ts`, `copy.ts` |
| Route page | `page.tsx` | `app/(marketing)/page.tsx` |
| Route layout | `layout.tsx` | `app/(marketing)/layout.tsx` |

---

## Things that will need updating when the product changes

| Product change | Website update needed |
|----------------|---------------------|
| New CLI version published | `getProofFeed()` picks up new proof chain entries automatically (when wired to real) |
| Product name change | `lib/copy.ts` — ctrl-F and replace |
| New pricing tier | Add to `copy.pricing.plans` array + new `PriceCard` renders automatically |
| New nav link | Add to `copy.nav.links` array |
| New sub-page | Create route + component, add to sitemap.ts |
| Brand color change | Change `--color-brand` in `globals.css` `@theme` — one place, propagates everywhere |
| New font | Add to `app/fonts.ts`, add variable to `@theme` in globals.css |

---

## What this codebase does NOT have (by design)

- **No CMS** — copy.ts is the CMS. Add Sanity/Contentful when non-devs need to edit.
- **No state management** — theme is a hook, everything else is server-rendered.
- **No component library** — everything is custom. The site demonstrates what Anatomia ships.
- **No testing framework** — `pnpm check` (lint + types + build) catches structural issues. Visual regression happens via Vercel previews. Add Playwright if the site grows complex interactive flows.
- **No i18n** — English only. The copy.ts pattern supports future i18n (wrap access in a `t()` function) but don't build it until there's demand.
- **No API routes** — the marketing site is fully static/ISR. API routes belong in the platform (separate app).
- **No database** — same. The platform owns data persistence.

---

## Contact

If something in this codebase confuses you and this manual doesn't answer it, the decision was probably wrong. Fix it and update this doc.

The bar isn't "the original builder understands it." The bar is "a stranger can extend it tomorrow."
