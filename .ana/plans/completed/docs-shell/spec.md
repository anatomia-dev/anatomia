# Spec: Docs Shell (Layout + Shared Components)

**Created by:** AnaPlan
**Date:** 2026-05-12
**Scope:** .ana/plans/active/docs-shell/scope.md

## Approach

Replace the placeholder docs layout with a production three-column CSS Grid shell: sticky sidebar (248px) + scrollable content (flexible) + sticky right rail (220px). Build a docs-specific navbar completely separate from the marketing Nav. Wire the sidebar to the Fumadocs page tree with a `root(node)` transformer that injects Reference and Proof Chain sections. Build all shared content components. Add responsive collapse at two breakpoints.

The supermock (`anatomia_reference/docs-research/supermock/`) is the pixel-level visual reference. Serve it with `npx serve` and compare side by side during implementation.

**Key architectural decisions:**

1. **Syntax highlighting:** Use fumadocs-core's built-in `rehypeCode` plugin configured in `source.config.ts`. It ships Shiki integration — handles MDX code fences at build time with zero runtime JS. The CodeBlock component provides chrome (header, copy button, language label) around the highlighted output via MDX component mapping for `pre`.

2. **Page tree transformer:** Uses `root(node)` in the `pageTree.transformers` array on the loader config. Pushes `Separator` + `Item` nodes into `node.children`. Item shape: `{ type: 'page', name: string, url: string }`. Separator shape: `{ type: 'separator', name: string }`. Reference and Proof Chain entries point to routes that don't exist yet — they'll 404 until content scopes land.

3. **PlatformProvider hydration:** Server snapshot defaults to `"claude-code"` (matches the cookie default). Client reads cookie on mount. No hydration mismatch on first visit. Cookie set via `document.cookie` on selection change.

4. **Right rail proof-explorer collapse:** Layout grid reads a `data-hide-rail` attribute. When the route is `/docs/proof`, the attribute is set, CSS hides the rail and widens content. Mechanism is in place but untestable until Scope 5.

5. **Error boundary:** Add a React error boundary in the docs layout. Prior proof finding flagged that broken MDX crashes the entire docs section. Wrap content area in an error boundary that shows a fallback message.

## Output Mockups

### DocsNav (58px height)
```
┌─────────────────────────────────────────────────────────────────┐
│ anaDocs■   v1.0.2   [Claude Code ▾]   Search docs... ⌘K   ☀ 🐙 anatomia │
└─────────────────────────────────────────────────────────────────┘
```
- "anaDocs" in Fraunces serif, oxblood square mark (■)
- Version pill from `getBuildMeta()` in mono font
- PlatformSwitcher dropdown (Claude Code active, 5 others disabled with "soon")
- SearchTrigger placeholder button (no functionality this scope)
- ThemeToggle (reuse existing component)
- GitHub icon link
- "anatomia" external link back to marketing site

### PlatformSwitcher dropdown (open state)
```
┌──────────────────┐
│ ● Claude Code    │  ← active, brand-colored dot
│ ○ Cursor    soon │
│ ○ Codex     soon │
│ ○ Windsurf  soon │
│ ○ Copilot   soon │
│ ○ Cline     soon │
└──────────────────┘
```

### Three-column layout
```
┌──────────────────────────────────────────────────────────┐
│                      DocsNav (sticky)                     │
├────────────┬───────────────────────────┬─────────────────┤
│  Sidebar   │    Content Area           │   Right Rail    │
│  248px     │    (flexible)             │   220px         │
│  sticky    │                           │   sticky        │
│            │  Breadcrumb               │                 │
│ Get Started│  # Page Title             │  On this page   │
│ Concepts   │  MetaRow (time + date)    │  ── Heading 1   │
│ Guides     │                           │  ── Heading 2   │
│ ──────     │  ...content...            │  ·· Heading 3   │
│ Reference  │                           │                 │
│   CLI...   │  NextCards                │  Ask AI...      │
│ ──────     │                           │                 │
│ Proof Chain│                           │  Generated...   │
│   Browse.. │                           │  Commit SHA     │
│   Featured │                           │  Edit on GitHub │
│   [toggle] │                           │                 │
└────────────┴───────────────────────────┴─────────────────┘
```

### Responsive breakpoints
- **≤1180px:** Right rail hides → two-column (sidebar + content)
- **≤880px:** Sidebar hides → single-column (content only)

### Callout variants
```
Rule variant:
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│▌ Rule: Every change must be verified  │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
  (brand-colored left border)

Note variant:
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│▌ Note: This requires Node.js 18+      │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
  (info-colored left border)
```

### MetaRow
```
5 min read  ·  Last reviewed May 2026
```
Mono font, muted color. Shows "—" for missing values.

## File Changes

### `website/app/docs/layout.tsx` (modify — rewrite)
**What changes:** Replace the placeholder centered `<div>` with the full three-column grid shell. Wraps children in `PlatformProvider`. Renders `DocsNav`, `Sidebar`, content area with `Breadcrumb` + children, and `RightRail`. Adds error boundary around content. Sets `data-hide-rail` based on pathname for future proof-explorer route.
**Pattern to follow:** `website/app/(marketing)/layout.tsx` — same composition pattern (components + children), but with a CSS Grid instead of linear flow.
**Why:** This is the visual foundation every subsequent docs scope renders inside.

### `website/app/docs/[[...slug]]/page.tsx` (modify)
**What changes:** Pass `page.data.toc` (table of contents) and breadcrumb data to the layout context. Remove the `prose` classes from `<article>` — prose styling moves to `docs.css`. Export the TOC data via a mechanism the RightRail can consume (page props or a shared module).
**Pattern to follow:** Fumadocs convention — `page.data.toc` is the heading tree generated by the MDX pipeline.
**Why:** RightRail needs TOC data for scroll spy. Breadcrumb needs the page's position in the tree.

### `website/lib/source.ts` (modify)
**What changes:** Add `pageTree: { transformers: [...] }` to the loader config. The transformer's `root(node)` function pushes Reference and Proof Chain sections into `node.children` as `Separator` + `Item` nodes. Reference entries: CLI Commands, Agent Templates, Skill Files, Context Files. Proof Chain entries: Browse All + Featured Proofs (collapsible).
**Pattern to follow:** Fumadocs `PageTreeTransformer` interface — `{ root(node) { node.children.push(...); return node; } }`.
**Why:** The sidebar needs five groups visible. Three come from MDX folder structure (Get Started, Concepts, Guides). Two are injected (Reference, Proof Chain) because their content comes from extracted JSON data, not MDX files.

### `website/source.config.ts` (modify)
**What changes:** (1) Add `rehypeCode` from `fumadocs-core/mdx-plugins/rehype-code` to `mdxOptions.rehypePlugins`. (2) Add `lastReviewed: z.string().optional()` and `readingTime: z.number().optional()` to the frontmatter schema. Use `.optional()` — existing MDX files don't have these fields.
**Pattern to follow:** Existing `frontmatterSchema.extend()` call — add fields alongside the existing `description`.
**Why:** (1) Enables Shiki syntax highlighting for all MDX code fences at build time. (2) MetaRow component needs these fields from page frontmatter.

### `website/components/docs/layout/DocsNav.tsx` (create)
**What changes:** Server component. Renders the docs-specific navbar: "anaDocs" wordmark (Fraunces serif + oxblood mark), version pill from `getBuildMeta()`, PlatformSwitcher, SearchTrigger placeholder, ThemeToggle, GitHub icon, "anatomia" external link. 58px height, sticky, backdrop-blur.
**Pattern to follow:** `website/components/nav/Nav.tsx` — same structure (sticky fixed nav, backdrop-blur, flex layout, inline styles for token references). But different content — no marketing links, no CTA, different wordmark.
**Why:** The docs navbar is fundamentally different from marketing. Clean separation avoids conditional logic.

### `website/components/docs/layout/PlatformSwitcher.tsx` (create)
**What changes:** Client component. Dropdown with Claude Code as active selection, five others disabled with "soon" labels. Uses `BrandIcon` from `lib/icons.tsx` for platform logos. Opens/closes on click, closes on outside click (useEffect with document click listener). Reads/writes platform via `PlatformProvider` context.
**Pattern to follow:** Standard dropdown pattern — `useState` for open/close, `useRef` for outside click detection, `useEffect` cleanup.
**Why:** Visible in supermock. Platform switching is the mechanism for multi-platform content in future scopes.

### `website/components/docs/layout/Sidebar.tsx` (create)
**What changes:** Client component (needs pathname for active state). Renders the Fumadocs page tree as a nested list. Five groups: Get Started, Concepts, Guides, Reference, Proof Chain. Active state highlights current page via pathname comparison. "Featured proofs" section has a toggle that collapses/expands (local state). Sticky positioning, independent scroll with hidden scrollbar.
**Pattern to follow:** Iterate `source.pageTree.children` — each `Separator` node is a group header, each `Item` node is a link, each `Folder` node is a collapsible group.
**Why:** Core navigation for the docs. Every page needs the sidebar to be useful.

### `website/components/docs/layout/RightRail.tsx` (create)
**What changes:** Client component (needs IntersectionObserver for scroll spy). Three sections: (1) TOC with scroll-spy active heading tracking, (2) "Ask AI about this page" links section (static placeholders), (3) Footer with generated date, commit SHA from `getBuildMeta()`, and "Edit on GitHub" link. Sticky positioning. Hidden at ≤1180px breakpoint.
**Pattern to follow:** IntersectionObserver pattern: observe all heading elements, track which is in viewport, update active ID state. The TOC timeline (vertical line + dots) uses CSS pseudo-elements in `docs.css`.
**Why:** Standard docs right rail. Scroll spy provides navigation context within long pages.

### `website/components/docs/layout/Breadcrumb.tsx` (create)
**What changes:** Server component. Renders page position in tree (e.g., "Docs > Concepts > Pipeline") using page tree data from Fumadocs. Each segment is a link except the last (current page).
**Pattern to follow:** Traverse `source.pageTree` to find the path from root to the current page node. Render as `nav` with `aria-label="Breadcrumb"` and `ol` list.
**Why:** Required by supermock. Provides spatial orientation.

### `website/components/docs/content/CodeBlock.tsx` (create)
**What changes:** Maps to the `pre` element in MDX component overrides. Renders a header bar (language label from `data-language` + optional title) and a CopyButton. Wraps the Shiki-highlighted `<code>` children. The header and copy button are the chrome; the actual highlighting comes from rehypeCode.
**Pattern to follow:** Fumadocs convention — rehypeCode annotates `<pre>` with `data-language`, `data-title`, and the highlighted `<code>` as children.
**Why:** Supermock shows code blocks with headers and copy buttons. rehypeCode handles highlighting; this component handles the UI wrapper.

### `website/components/docs/content/CopyButton.tsx` (create)
**What changes:** Client component. Uses Clipboard API (`navigator.clipboard.writeText`). Shows copy icon → check icon on success with a brief timeout reset. Reads the code text content from a ref or prop.
**Pattern to follow:** Standard copy button pattern. `"use client"`, `useState` for copied state, `setTimeout` to reset.
**Why:** CodeBlock needs a copy button. Must be a separate client component since CodeBlock itself can be a server component.

### `website/components/docs/content/Callout.tsx` (create)
**What changes:** Two variants: "rule" (brand-colored left border, `var(--color-brand)`) and "note" (info-colored left border). Accepts `variant` prop and `children`. Renders as a `<div>` with role="note".
**Pattern to follow:** Match the supermock's `.callout` pattern — padding, border-left width, background color.
**Why:** Used throughout docs content for emphasis and warnings.

### `website/components/docs/content/NextCards.tsx` (create)
**What changes:** Two-column grid of navigation cards. Each card has eyebrow label, title, description, and links to another docs page. Accepts array of card data as props.
**Pattern to follow:** Match the supermock's `.next-grid` — CSS Grid with 2 columns, gap, card styling with `var(--bg-card)` background.
**Why:** Every content page has "Next steps" navigation at the bottom.

### `website/components/docs/content/MetaRow.tsx` (create)
**What changes:** Renders reading time and last-reviewed date in mono font, muted color. Accepts `readingTime?: number` and `lastReviewed?: string` props. Shows "—" when values are absent.
**Pattern to follow:** Match the supermock's `.meta-row` — mono font, `var(--ink-45)` color, small text.
**Why:** Page metadata below title. Builds trust through visible review dates.

### `website/components/docs/content/StatsStrip.tsx` (create)
**What changes:** Horizontal row of labeled metrics. Each stat has a value and label. Accepts array of `{ value: string, label: string }` items. Used on overview page but built as shared component.
**Pattern to follow:** Match the supermock's `.home-stats` — flex row, mono values, label below.
**Why:** Shared component for the overview page and potentially other pages.

### `website/components/docs/content/ForPlatform.tsx` (create)
**What changes:** Reads active platform from PlatformProvider context. Conditionally renders children only when the active platform matches the `platform` prop. Pure conditional render — no layout shift.
**Pattern to follow:** `const { platform } = usePlatform(); if (platform !== props.platform) return null; return children;`
**Why:** Enables per-platform content blocks in MDX. Required by PlatformProvider contract.

### `website/components/docs/providers/PlatformProvider.tsx` (create)
**What changes:** Client component. React Context with `{ platform, setPlatform }`. Reads initial value from `document.cookie` on mount, defaults to `"claude-code"`. `setPlatform` updates context state and writes cookie. Server snapshot returns `"claude-code"` to avoid hydration mismatch. Exports `PlatformProvider` component and `usePlatform` hook.
**Pattern to follow:** `website/lib/theme.ts` — same client-side state management pattern with `useSyncExternalStore` if cross-component sync is needed, or simpler `useState` + `useEffect` for cookie read since platform changes are infrequent.
**Why:** Platform selection drives ForPlatform conditional rendering and persists across page navigations.

### `website/app/docs/docs.css` (create)
**What changes:** Docs-specific CSS for patterns awkward in Tailwind: (1) TOC timeline vertical line + dots via `::before` pseudo-elements, (2) sidebar scrollbar hiding, (3) sidebar active state transitions, (4) prose styling for MDX content area (font sizes, colors, spacing — replaces Tailwind `@tailwindcss/typography` prose classes), (5) code block header/body styling for rehypeCode output.
**Pattern to follow:** `website/app/globals.css` — same structure (clear section comments, CSS custom properties for theme-aware values). Import in `layout.tsx`.
**Why:** These patterns require pseudo-elements or complex selectors that Tailwind can't express cleanly.

### `website/content/docs/index.mdx` (modify)
**What changes:** Add examples of new components to exercise them in the test page: a Callout (both variants), a code block with language label, a MetaRow-ready frontmatter update if needed. This is the visual test page for the PR review.
**Pattern to follow:** Existing MDX content — add below the current "Getting Started" section.
**Why:** Every new component needs to render somewhere for verification. The index page is the only MDX content.

## Acceptance Criteria

- [ ] AC1: Three-column grid: sidebar (248px) + content (flexible) + right rail (220px). Matches supermock layout.
- [ ] AC2: DocsNav with anaDocs wordmark, version pill from `getBuildMeta()`, PlatformSwitcher, SearchTrigger placeholder, ThemeToggle, GitHub icon, "anatomia" link. Sticky with backdrop-blur.
- [ ] AC3: Sidebar renders all five groups (Get Started, Concepts, Guides, Reference, Proof Chain). Active state highlights current page. Featured proofs toggle collapses/expands. Sticky and independently scrollable.
- [ ] AC4: Page tree transformer injects Reference and Proof Chain sections into page tree using `root(node)` with correct node types.
- [ ] AC5: Right rail with TOC scroll spy (IntersectionObserver), "Ask AI" placeholder links, footer with generated date, commit SHA, "Edit on GitHub" link.
- [ ] AC6: PlatformSwitcher dropdown — Claude Code active, five others disabled with "soon" labels. Opens/closes on click, closes on outside click.
- [ ] AC7: PlatformProvider wraps docs layout with React Context. ForPlatform conditionally renders. Platform selection persists via cookie.
- [ ] AC8: CodeBlock with header (language + title), CopyButton, styled code body. rehypeCode provides syntax highlighting.
- [ ] AC9: Callout in "rule" and "note" variants matching supermock.
- [ ] AC10: NextCards two-column grid with eyebrow, title, description.
- [ ] AC11: MetaRow with reading time and last-reviewed date in mono font.
- [ ] AC12: Breadcrumb renders page position in tree.
- [ ] AC13: StatsStrip horizontal metrics row.
- [ ] AC14: Responsive: ≤1180px hides right rail (two-column), ≤880px hides sidebar (single-column).
- [ ] AC15: `pnpm build` succeeds with all new components.
- [ ] AC16: Marketing site at `/`, `/about`, `/cli`, etc. completely unaffected.
- [ ] AC17: Theme toggle works correctly with all new components using existing design tokens.

## Testing Strategy

- **Build verification:** `pnpm build` is the primary test. All components are exercised at build time via SSG/SSR. A build failure means a component is broken.
- **Component smoke tests:** Not required this scope — no test infrastructure exists for the website package. Build success serves as the smoke test since Next.js renders all pages at build time.
- **Page tree transformer:** This is the one unit-testable piece. Write a test that calls the transformer function with a mock root node and verifies the injected Separator and Item nodes. Place in `website/__tests__/source-transformer.test.ts` if vitest is configured for the website, otherwise defer to build verification.
- **Visual verification:** Compare the built site side by side with the supermock. This is manual and happens during PR review.
- **Regression:** Verify marketing pages (`/`, `/about`, `/cli`) render unchanged. The docs layout is in `app/docs/` — completely isolated route tree.

## Dependencies

- `fumadocs-core` ^16.8.10 (already installed) — provides `rehypeCode`, `PageTreeTransformer` types, loader API.
- `fumadocs-mdx` ^15.0.4 (already installed) — provides `frontmatterSchema`, collection config.
- `data/docs/build-meta.json` — must exist at build time. Generated by `scripts/extract-docs-data.ts`.
- `lib/icons.tsx` — `BrandIcon` component for PlatformSwitcher platform logos.
- `lib/theme.ts` + `components/nav/ThemeToggle.tsx` — reused directly in DocsNav.

## Constraints

- **No new npm dependencies.** Everything needed is already in fumadocs-core or standard React/Next.js APIs.
- **Existing design tokens.** Use tokens from `globals.css` (`--fg`, `--bg-card`, `--ink-60`, `--border`, etc.). The supermock's `--ink-80` maps to existing `--ink-75`, `--ink-40` maps to `--ink-45`. Do not add near-duplicate tokens.
- **Theme storage key.** Use `"anatomia-theme"` (existing), not `"ana-docs-theme"` (supermock). Docs and marketing share one theme.
- **DocsNav height.** 58px (supermock), not 72px (marketing nav). Update `scroll-padding-top` in docs.css for docs pages only.
- **No `attachFolder`.** Does not exist in fumadocs-core 16.x. Only `transformers: [{ root(node) }]`.
- **Marketing isolation.** No changes to `app/(marketing)/`, `app/layout.tsx`, `components/nav/`, `components/footer/`, or `globals.css` structural tokens.
- **Frontmatter schema backwards compatibility.** New fields must be `.optional()`. Existing MDX files don't have `lastReviewed` or `readingTime`.

## Gotchas

- **Fumadocs TOC data access.** `page.data.toc` contains the heading tree. But the layout renders *around* the page — it doesn't have access to page-level data directly. The catch-all page component needs to pass TOC data upward. Investigate whether fumadocs provides a context/hook for this, or whether the page component needs to render the RightRail directly within its own tree rather than in the layout.
- **rehypeCode output structure.** After rehypeCode processes a code fence, the DOM structure is `<pre data-language="bash"><code>...</code></pre>` with Shiki-highlighted spans inside `<code>`. The CodeBlock component maps to `pre` in MDX components — it receives the `data-language` attribute and `<code>` as children. Don't try to re-parse the highlighted output.
- **Cookie reading on server.** `document.cookie` is client-only. PlatformProvider must NOT try to read cookies during SSR. The server snapshot is always `"claude-code"`. The `useSyncExternalStore` pattern from `theme.ts` shows how to handle this — `getServerSnapshot` returns the default.
- **`source.pageTree` structure.** The root node's `children` array contains a mix of `Separator`, `Item`, and `Folder` nodes. The three MDX groups (Get Started, Concepts, Guides) come from the `content/docs/` folder structure with `meta.json` files. Currently there are NO folders — only `index.mdx`. The transformer must handle this gracefully. The injected Reference and Proof Chain sections should append regardless of how many MDX-sourced nodes exist.
- **Proof finding: No error boundary.** Prior verification flagged missing error boundary in docs layout. Add one wrapping the content area. React error boundaries must be class components or use the `react-error-boundary` library. Since no new deps are allowed, use a small class component in the same file or a dedicated `DocsErrorBoundary.tsx`.
- **Proof finding: Frontmatter allows empty strings.** `z.string()` without `.min(1)` on `description`. This is the existing behavior — don't change it in this scope, but be aware that `description` can be `""`. The new optional fields don't have this issue since they're optional.
- **`getBuildMeta()` uses `readFileSync`.** It reads `data/docs/build-meta.json` synchronously. This works in server components and at build time. Don't call it from client components — import it only in server components (DocsNav, RightRail's server portion).

## Build Brief

### Rules That Apply
- Tailwind v4 with `@theme` directive for token generation. New docs tokens (if any) go in `docs.css`, not `globals.css`.
- All components use existing design tokens (`--fg`, `--bg-card`, `--ink-60`, `--border`, `--hairline`, etc.). No new near-duplicate tokens.
- Client components require explicit `"use client"` directive.
- Named exports only — no default exports for components. Exception: Next.js page/layout files which require default exports.
- 2-space indentation, TypeScript strict mode.
- Use `import type` for type-only imports, separate from value imports.

### Pattern Extracts

**Marketing layout composition** (`website/app/(marketing)/layout.tsx` lines 1-17):
```tsx
import type { ReactNode } from "react";
import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/footer/Footer";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  );
}
```

**ThemeToggle client component** (`website/components/nav/ThemeToggle.tsx` lines 1-10):
```tsx
"use client";

import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  // ... renders button with onClick={toggle}
}
```

**Nav sticky + backdrop-blur** (`website/components/nav/Nav.tsx` lines 22-31):
```tsx
<nav
  className="fixed top-0 left-0 right-0 z-[150] flex items-center justify-between px-6 py-3.5"
  style={{
    background: "var(--nav-bg)",
    backdropFilter: "blur(14px) saturate(1.2)",
    WebkitBackdropFilter: "blur(14px) saturate(1.2)",
    borderBottom: "1px solid var(--hairline)",
  }}
  aria-label="Primary"
>
```

**Fumadocs source loader** (`website/lib/source.ts` lines 1-7):
```ts
import { loader } from "fumadocs-core/source";
import { docs } from "collections/server";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
```

**Fumadocs PageTreeTransformer types** (from `fumadocs-core/dist`):
```ts
interface Item extends ID {
  type: 'page';
  name: ReactNode;
  url: string;
  external?: boolean;
  description?: ReactNode;
  icon?: ReactNode;
}

interface Separator extends ID {
  type: 'separator';
  name?: ReactNode;
  icon?: ReactNode;
}

interface Folder extends ID {
  type: 'folder';
  name: ReactNode;
  description?: ReactNode;
  root?: boolean;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: Node[];
}

interface PageTreeTransformer<S> {
  root?: (this: PageTreeBuilderContext<S>, node: Root) => Root;
  // also: file?, folder?, separator?
}
```

**BrandIcon usage** (`website/lib/icons.tsx`):
```tsx
import { BrandIcon } from "@/lib/icons";
<BrandIcon name="Claude Code" size={16} />
// Available names: "Claude Code", "Cursor", "Codex", "Windsurf", "Copilot", "Cline"
```

**getBuildMeta** (`website/lib/docs-data/meta.ts`):
```ts
export function getBuildMeta(): BuildMeta {
  // Returns { version: string, commitSha: string, buildTimestamp: string }
  // Reads from data/docs/build-meta.json synchronously
}
```

### Proof Context
- **`website/app/docs/layout.tsx`:** [code] No error boundary — broken MDX crashes entire docs section. **Action: Add error boundary in this scope.**
- **`website/lib/source.ts`:** [code] Page tree injections for Reference and Proof Chain omitted. **Action: This scope adds the transformer — resolves the finding.**
- **`website/source.config.ts`:** [code] Frontmatter schema allows empty strings on `description`. **Awareness only — don't change existing behavior, but new optional fields are correctly `.optional()`.**

### Checkpoint Commands

- After layout + DocsNav: `cd website && pnpm build` — Expected: build succeeds, `/docs` page renders inside new shell
- After all components: `cd website && pnpm build` — Expected: build succeeds with all new components, no type errors
- After index.mdx updates: `cd website && pnpm build` — Expected: build succeeds, test page exercises components
- Lint: `cd website && pnpm lint` (if configured) or `pnpm tsc --noEmit`
- CLI regression: `cd packages/cli && pnpm vitest run` — Expected: 2178 tests pass (100 files), unchanged

### Build Baseline
- Current CLI tests: 2178 passed, 2 skipped (100 test files)
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: CLI tests unchanged (2178 passed, 100 files) — this scope adds no CLI code
- Website build: `cd website && pnpm build` — currently succeeds
- Regression focus: `website/app/docs/layout.tsx`, `website/lib/source.ts`, `website/source.config.ts` — these are the only existing files being modified
