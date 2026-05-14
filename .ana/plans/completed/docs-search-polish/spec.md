# Spec: Docs Search + Polish

**Created by:** AnaPlan
**Date:** 2026-05-13
**Scope:** .ana/plans/active/docs-search-polish/scope.md

## Approach

Six independent work items that ship together as the final docs production-readiness scope. The search overlay is the biggest piece; the rest are wiring tasks.

**Search overlay.** New `SearchOverlay.tsx` client component and a `SearchTrigger.tsx` client wrapper for the DocsNav search button. DocsNav stays a server component. The overlay lazy-loads `search-index.json` on first open (~16KB, cached in state). Client-side substring filtering with relevance ranking: exact title match first, title-contains second, description-contains third. Results grouped by Pages/Commands/Proofs. Keyboard navigation with clamping (not wrapping). The structural analog is `ProofExplorer.tsx` — same pattern of client component with local state, filtering, keyboard interaction.

**AI links.** Wire RightRail's three placeholder links with real functionality. "Copy as Markdown" uses a `pageContent` prop (cleaned MDX source or structured template) passed from page components. "Open in Claude" constructs `claude://claude.ai/new?q=...` URLs — hidden on mobile via CSS. "Open in ChatGPT" constructs `chatgpt.com/?q=...` URLs. Proof pages get the enriched grading prompt. Remove "Download artifacts" from proof variant.

**Copy as Markdown serialization.** Raw MDX source stripped of JSX via a shared `stripJsx()` utility, passed as a build-time prop. Proof pages use the structured sharing template (title, verdict, stats, URL, assertions, findings, integrity). Reference pages build structured text from data props. The `stripJsx()` regex handles the known component set: `<Callout>`, `<ForPlatform>`, `<PipelineDiagram>`, `<TroubleCard>`, `<NextCards>`, `<StatsStrip>`, `<CodeBlock>`, plus self-closing components like `<ProofCount />`.

**editUrl wiring.** Every page route passes `editUrl` to RightRail. The catch-all already does this. Dynamic pages point to their most useful edit target (see File Changes below for each route's target).

**llms.txt generation.** The extraction script generates `public/llms.txt` (navigation index per llms.txt spec) and `public/llms-full.txt` (all MDX content concatenated, JSX stripped). Content ordered by sidebar navigation order. Project description blockquote sourced from the first paragraph of `.ana/context/project-context.md`.

**Build validation.** The extraction script's validation section extends to check internal link resolution. Collect all `href="/docs/..."` patterns from MDX content, verify each resolves to a known route (MDX file path, proof slug, agent name, skill name, CLI reference anchor). Fail the build on broken internal links.

**Dynamic MDX values.** Server components that import from data loaders and render inline spans. Registered in the catch-all's `mdxComponents` map. `getMedianTimings()` added to `proofs.ts` — filters zero-valued stages before computing medians.

## Output Mockups

### Search overlay

```
┌──────────────────────────────────────────────┐
│ 🔍  Search docs, commands, proofs...    ESC  │
├──────────────────────────────────────────────┤
│ PAGES                                        │
│  The Pipeline                                │
│  5 stages, independence, artifacts           │
│                                              │
│  The Contract                                │
│  Contract format, matchers, sealing          │
│                                              │
│ COMMANDS                                     │
│  ana proof                                   │
│  Show proof chain summary table              │
│                                              │
│ PROOFS                                       │
│  security-hardening — Security Hardening     │
│  27 assertions · 10 findings · May 4, 2026   │
└──────────────────────────────────────────────┘
```

Empty state: "Type to search pages, commands, and proofs"
No results: "No results found"

### Copy as Markdown — content page

```markdown
# The Pipeline

> 5 stages, independence, artifacts

Source: https://anatomia.dev/docs/concepts/pipeline

---

{cleaned MDX content with JSX stripped}
```

### Copy as Markdown — proof page

```markdown
# Security Hardening — PASS
27/27 assertions · 10 findings · 1h 14m
Shipped May 4, 2026
→ https://anatomia.dev/docs/proof/security-hardening

## Assertions
- ✓ A001: Slugs with shell injection characters are rejected before any operation
- ✓ A002: Valid kebab-case slugs pass validation
...

## Findings
- [debt] No dedicated integration tests for...
- [observation] getCurrentBranch still uses execSync
...

## Integrity
scope: a1b2c3d4...
spec: e5f6a7b8...
```

### llms.txt

```
# Anatomia

> Anatomia is an open-source methodology and CLI tool for verified AI development...

## Concepts

- [The Pipeline](https://anatomia.dev/docs/concepts/pipeline): 5 stages, independence, artifacts
- [Skills](https://anatomia.dev/docs/concepts/skills): 4-section structure, conditional matching
...

## Guides

- [Quickstart](https://anatomia.dev/docs/start): Install, scan, init, first cycle
...

## Reference

- [CLI Commands](https://anatomia.dev/docs/reference/cli): Every command grouped by category
...
```

### AI link URLs

Claude (content page):
```
claude://claude.ai/new?q=Read%20this%20Anatomia%20documentation%20page%20and%20answer%20questions%20about%20it.%20https%3A%2F%2Fanatomia.dev%2Fdocs%2Fconcepts%2Fpipeline
```

Claude (proof page — enriched grading prompt):
```
claude://claude.ai/new?q=This%20is%20a%20proof%20chain%20entry%20from%20Anatomia...%20https%3A%2F%2Fanatomia.dev%2Fdocs%2Fproof%2Fsecurity-hardening
```

ChatGPT (same prompt pattern, different base URL):
```
https://chatgpt.com/?q=Read%20this%20Anatomia%20documentation%20page...%20https%3A%2F%2Fanatomia.dev%2Fdocs%2Fconcepts%2Fpipeline
```

## File Changes

### `website/components/docs/layout/SearchOverlay.tsx` (create)
**What changes:** New client component. Fixed overlay with blur backdrop, 580px modal, input row with search icon + ESC kbd badge, scrollable results area. Local state for `query`, `selectedIndex`, `results`. Fetches `/data/docs/search-index.json` on first open. Relevance ranking: exact title match → title-contains → description-contains. Results grouped by Pages/Commands/Proofs. Keyboard: arrow keys move selectedIndex (clamped), Enter navigates, ESC closes.
**Pattern to follow:** `ProofExplorer.tsx` for client component structure — `"use client"`, local state with `useState`/`useMemo`, `useRouter` for navigation. CSS classes target `docs-search-overlay` and children, styled in docs.css.
**Why:** The search button is currently disabled. Users can't find content.

### `website/components/docs/layout/SearchTrigger.tsx` (create)
**What changes:** Small client component wrapping the search button. Renders the existing button markup (from DocsNav lines 88-127) but with `onClick` that opens the overlay, plus a `useEffect` for ⌘K/Ctrl+K global keyboard shortcut. Renders `<SearchOverlay />` as a sibling. This keeps DocsNav as a server component.
**Pattern to follow:** `MobileSidebarToggle` — a client component wrapper used inside a server component.
**Why:** DocsNav is a server component. The search button needs client interactivity (onClick, keyboard shortcut). A wrapper isolates the client boundary.

### `website/components/docs/layout/DocsNav.tsx` (modify)
**What changes:** Replace the inline `<button>` block (lines 88-127) with `<SearchTrigger />`. Import `SearchTrigger`. Remove the `disabled` prop since the trigger handles its own state.
**Pattern to follow:** How `MobileSidebarToggle` is already used — imported and rendered inline.
**Why:** Wires the live search trigger into the nav.

### `website/components/docs/layout/RightRail.tsx` (modify)
**What changes:** Extend props interface with `pageUrl?: string`, `pageContent?: string`, `pageTitle?: string`, `pageDescription?: string`. Wire the three AI link rows:
- "Copy as Markdown": `onClick` handler that writes to clipboard using `navigator.clipboard.writeText()`. Build the markdown string from props based on variant. Show brief "Copied!" feedback by swapping the button text for 2 seconds.
- "Open in Claude": construct `claude://claude.ai/new?q={encodedPrompt}` URL. Content pages use documentation-reading prompt. Proof pages use the enriched grading prompt from scope. Add CSS class `docs-ai-link-claude` — hidden at ≤640px via docs.css.
- "Open in ChatGPT": construct `https://chatgpt.com/?q={encodedPrompt}` URL. Same prompt patterns.
- Proof variant: remove "Download artifacts" row, keep "View on GitHub", add "Copy as Markdown" and "Open in Claude" and "Open in ChatGPT". The link array becomes conditional on variant.
**Pattern to follow:** Existing link row rendering pattern in RightRail (lines 149-184). The `href="#"` entries become real URLs or onClick handlers.
**Why:** These links are currently dead `#` placeholders.

### `website/components/docs/content/DynamicStat.tsx` (create)
**What changes:** Server components for dynamic MDX values. Each is a named export that imports from data loaders and renders an inline `<span>`. Components: `ProofCount`, `RejectionCount`, `FindingCount`, `SkillCount`, `GotchaCount`, `MedianTimings`. All server components — no `"use client"`.
**Pattern to follow:** Standard Next.js server component pattern. Import data loaders from `@/lib/docs-data`.
**Why:** Replaces hardcoded numbers in MDX that go stale as proof entries grow.

### `website/lib/docs-data/proofs.ts` (modify)
**What changes:** Add `getMedianTimings()` export. Iterates `load()` entries, collects per-stage timing arrays, filters out zero values, computes median of each. Returns `{ think: number, plan: number, build: number, verify: number }`. Median computation: sort array, take middle element (or average of two middle for even length).
**Pattern to follow:** Existing `getProofStats()` in the same file — iterates entries, computes aggregate, returns typed object.
**Why:** `MedianTimings` component needs computed values. The computation belongs in the data loader (build-time), not the component.

### `website/lib/docs-data/index.ts` (modify)
**What changes:** Add `getMedianTimings` to the re-export from `./proofs`. Add `getGotchaCount` if not already exported (it is — verified).
**Pattern to follow:** Existing export lines in the same file.
**Why:** New data loader functions need to be accessible via the barrel export.

### `website/scripts/extract-docs-data.ts` (modify)
**What changes:** Three additions:
1. **Search index generation.** After all 7 data files are written, generate `search-index.json` combining: MDX pages (frontmatter title + description from `.mdx` files in `content/docs/`), commands (from extracted commands data), proofs (slug + feature + scope summary from extracted proof entries), agents (name + description), skills (name + description). Each entry: `{ type, title, description, route }`. Write to `data/docs/search-index.json`.
2. **llms.txt generation.** Read MDX frontmatter for all pages, read the first paragraph of `.ana/context/project-context.md` for the blockquote. Write `public/llms.txt` (navigation index with H1 project name, blockquote, H2 sections with links) and `public/llms-full.txt` (concatenated MDX content with JSX stripped via `stripJsx()`). Order by sidebar navigation (concepts → guides → reference).
3. **Internal link validation.** After all extractions, scan all `.mdx` files for `href="/docs/..."` patterns. Build a set of known routes from extracted data (MDX slugs, proof slugs, agent names, skill names, plus static routes like `/docs/reference/cli`, `/docs/reference/context`, `/docs/proof`). Assert every internal href resolves. Fail the build on broken links.
4. **Extend completeness validation.** Add assertions: `commands.totalCommands > 0` (currently only checks `groups.length > 0`).
**Pattern to follow:** Existing extraction functions in the same file. `parseFrontmatter()` is already available for MDX reading. `writeJSON()` for output.
**Why:** Search index, llms.txt, and link validation are build-time concerns that belong in the prebuild step.

### `website/lib/docs-data/stripJsx.ts` (create)
**What changes:** Shared utility function `stripJsx(mdxSource: string): string`. Strips known JSX components from raw MDX source. Handles both block-level components with children (`<Callout variant="note">...content...</Callout>`, preserving inner content) and self-closing components (`<ProofCount />`, `<MedianTimings />`). Also strips JSX expression comments (`{/* ... */}`), inline style objects, and HTML-like `<div style={{...}}>` wrappers (preserving inner content). Returns clean markdown.
**Pattern to follow:** Pure function, no dependencies beyond string manipulation. Exported for use by both the extraction script and page components.
**Why:** Used by both Copy as Markdown (page prop) and llms-full.txt (extraction script). Single implementation prevents drift.

### `website/app/docs/[...slug]/page.tsx` (modify)
**What changes:**
1. Register new MDX components in `mdxComponents` map: `ProofCount`, `RejectionCount`, `FindingCount`, `SkillCount`, `GotchaCount`, `MedianTimings`. Import from `@/components/docs/content/DynamicStat`.
2. Pass `pageContent` prop to RightRail: read the raw MDX source file at build time using `page.data.body` source or filesystem read of the content file, strip JSX via `stripJsx()`, pass as string prop.
3. Pass `pageUrl`, `pageTitle`, `pageDescription` props to RightRail.
**Pattern to follow:** Existing component registration in `mdxComponents` map (lines 18-29). Existing RightRail prop passing (lines 95-100).
**Why:** Dynamic components need registration to render in MDX. RightRail needs content for Copy as Markdown and AI links.

### `website/app/docs/proof/[slug]/page.tsx` (modify)
**What changes:**
1. Pass new props to RightRail: `pageUrl`, `pageTitle`, `pageContent` (structured proof sharing template as markdown string, built from entry data).
2. Remove "Download artifacts" — this is handled by the RightRail link array change. The proof variant link array in RightRail changes.
3. Pass `editUrl` — point to the completed plan directory on GitHub: `https://github.com/TettoLabs/anatomia/tree/main/.ana/plans/completed/${entry.slug}`.
**Pattern to follow:** Existing RightRail usage in the same file (lines 116-123).
**Why:** Proof pages need enriched AI links and the sharing template for Copy as Markdown.

### `website/app/docs/proof/page.tsx` (modify)
**What changes:** This is the proof explorer page — no RightRail currently. Add `editUrl` pointing to the extraction script: `https://github.com/TettoLabs/anatomia/blob/main/website/scripts/extract-docs-data.ts`. This page uses `docs-content-full` layout without a right rail, so editUrl isn't directly used. Skip RightRail addition — the page intentionally uses full-width layout for the explorer table.
**Pattern to follow:** N/A — page stays as-is. No editUrl wiring needed since there's no RightRail.
**Why:** The scope says "pass editUrl to RightRail on every page route" — but this page doesn't have a RightRail. Leave it.

### `website/app/docs/reference/cli/page.tsx` (modify)
**What changes:** Pass `editUrl` to RightRail. Target: `https://github.com/TettoLabs/anatomia/blob/main/packages/cli/src/index.ts` (the CLI command registration file). Pass `pageUrl`, `pageTitle`, `pageDescription` for AI links. Pass `pageContent` — structured text listing all command groups and commands.
**Pattern to follow:** Existing RightRail usage in the same file (lines 77-81).
**Why:** editUrl and AI link props are missing.

### `website/app/docs/reference/agents/page.tsx` (modify)
**What changes:** Pass `editUrl` to RightRail. Target: `https://github.com/TettoLabs/anatomia/tree/main/packages/cli/templates/.claude/agents`. Pass `pageUrl`, `pageTitle`, `pageDescription`, `pageContent`.
**Pattern to follow:** Existing RightRail usage in the file.
**Why:** editUrl and AI link props are missing.

### `website/app/docs/reference/agents/[name]/page.tsx` (modify)
**What changes:** Pass `editUrl` to RightRail. Target: `https://github.com/TettoLabs/anatomia/blob/main/packages/cli/templates/.claude/agents/${agent.name}.md`. Pass `pageUrl`, `pageTitle`, `pageDescription`, `pageContent` (agent body markdown).
**Pattern to follow:** Existing RightRail usage (lines 144-148).
**Why:** editUrl and AI link props are missing.

### `website/app/docs/reference/skills/page.tsx` (modify)
**What changes:** Pass `editUrl` to RightRail. Target: `https://github.com/TettoLabs/anatomia/tree/main/packages/cli/templates/.claude/skills`. Pass `pageUrl`, `pageTitle`, `pageDescription`, `pageContent`.
**Pattern to follow:** Existing RightRail usage (lines 109-113).
**Why:** editUrl and AI link props are missing.

### `website/app/docs/reference/skills/[name]/page.tsx` (modify)
**What changes:** Pass `editUrl` to RightRail. Target: `https://github.com/TettoLabs/anatomia/blob/main/packages/cli/templates/.claude/skills/${skill.name}/SKILL.md`. Pass `pageUrl`, `pageTitle`, `pageDescription`, `pageContent` (skill content markdown).
**Pattern to follow:** Existing RightRail usage (lines 131-135).
**Why:** editUrl and AI link props are missing.

### `website/app/docs/reference/context/page.tsx` (modify)
**What changes:** Pass `editUrl` to RightRail. Target: `https://github.com/TettoLabs/anatomia/tree/main/.ana/context`. Pass `pageUrl`, `pageTitle`, `pageDescription`, `pageContent`.
**Pattern to follow:** Existing RightRail usage (lines 98-102).
**Why:** editUrl and AI link props are missing.

### `website/app/docs/docs.css` (modify)
**What changes:** Add search overlay styles under `[data-theme] .docs-layout` scope. Classes: `.docs-search-overlay` (fixed overlay), `.docs-search-modal` (580px centered modal), `.docs-search-input-row`, `.docs-search-results`, `.docs-sr-group`, `.docs-sr-item`, `.docs-sr-empty`. Add `.docs-sr-item.selected` for keyboard navigation highlight (same style as hover). Add responsive rules: at ≤640px reduce search modal top padding, cap max-height at 70vh. Add `.docs-ai-link-claude { display: flex; }` and at ≤640px `.docs-ai-link-claude { display: none; }`. Add mobile search button style at ≤880px (icon-only, no text, no kbd badge).
**Pattern to follow:** Existing docs.css structure — token overrides first, then component styles, then responsive rules at established breakpoints (≤1180px, ≤880px, ≤640px).
**Why:** All search and AI link CSS must live in docs.css under `.docs-layout` scope. No globals.css changes.

### 6 MDX files (modify)
**What changes:** Replace hardcoded numbers with dynamic components. Each replacement is a `{/* Dynamic: update on data change */}` comment that marks the location. The surrounding prose is preserved — only the number becomes a component.

Specific replacements per file:
- `start.mdx` line 65: `17 of Anatomia's own 78 proofs` → `<RejectionCount /> of Anatomia's own <ProofCount /> proofs`
- `concepts/pipeline.mdx` line 24: `17 of Anatomia's own 78 proofs` → `<RejectionCount /> of Anatomia's own <ProofCount /> proofs`
- `concepts/skills.mdx` line 43: `All 8 skills` → `All <SkillCount /> skills`
- `guides/verifying-changes.mdx` line 67: `17 of Anatomia's own 78 proofs` → `<RejectionCount /> of Anatomia's own <ProofCount /> proofs`
- `guides/troubleshooting.mdx` line 43: `17 of our 78 proofs` → `<RejectionCount /> of our <ProofCount /> proofs`
- `guides/troubleshooting.mdx` line 133: `"78 verified pipeline runs."` → use template literal or inline component rendering. Since this is inside a JSX prop (`description`), the component can't be used directly — compute the value in the page component and pass as a prop, or use the data loader inline. Decision: since this is inside a `<NextCards>` JSX prop value, replace with a string interpolation approach. The simplest path: leave this as a known limitation documented in a comment, or refactor the `NextCards` component to accept ReactNode descriptions. Better: import `getProofStats` and `getProofEntries` at the top of the MDX file using an export and pass computed values. Simplest correct approach: the page component (catch-all) can inject these values via mdxComponents. Create a `<ProofCardDescription />` component that renders the full description string with computed values.
- `guides/using-ana-learn.mdx` line 116: same pattern as troubleshooting — inside a JSX prop. Use the same `<ProofCardDescription />` approach or create a `<FindingsCardDescription />` component.
- `guides/reading-a-proof.mdx` line 60: `The median across all 78 proofs: 8m think, 10m plan, 31m build, 7m verify.` → `The median across all <ProofCount /> proofs: <MedianTimings />.`

**MDX JSX prop limitation:** Two files (`troubleshooting.mdx` and `using-ana-learn.mdx`) have hardcoded values inside JSX prop strings within `<NextCards>` and `<TroubleCard>` components. Server components can't be rendered inside string props. The cleanest solution: create small wrapper components `ProofSummaryText` (renders "X verified pipeline runs") and `ProofFindingsText` (renders "X proofs, Y findings to triage") that return strings as ReactNode. Register in mdxComponents. Replace the string props with component children or restructure the JSX. The builder should read these specific MDX lines and determine the minimal change — the goal is replacing the hardcoded number, not refactoring the component API.

**Pattern to follow:** Existing MDX component usage in content files (e.g., `<Callout>`, `<NextCards>`).
**Why:** Numbers go stale as proof entries grow. Components pull from data loaders at build time.

### `data/docs/search-index.json` (generated)
**What changes:** Generated by extraction script at prebuild time. Array of `{ type, title, description, route }` objects.
**Why:** Static search index consumed by SearchOverlay.

### `public/llms.txt` (generated)
**What changes:** Generated by extraction script. Navigation index per llms.txt spec.
**Why:** AI-readable site index for LLMs that crawl documentation.

### `public/llms-full.txt` (generated)
**What changes:** Generated by extraction script. All MDX content concatenated with JSX stripped.
**Why:** Full content dump for LLM consumption.

## Acceptance Criteria

- [ ] AC1: ⌘K opens the search overlay. Typing filters results. Results are grouped by Pages, Commands, Proofs. Clicking a result navigates to the page and closes the overlay. ESC and backdrop click close the overlay.
- [ ] AC2: Keyboard navigation works in search results — arrow keys move selection, Enter navigates to selected result.
- [ ] AC3: Search results are ordered by relevance: exact title match first, then title-contains, then description-contains. Not just array order.
- [ ] AC4: Search index includes all content types: MDX pages, CLI commands, proof entries, agent templates, skill templates. Total entries > 100.
- [ ] AC5: Mobile search works — search button triggers overlay (no ⌘K), modal has reduced top padding at ≤640px, max-height caps at 70vh for keyboard clearance.
- [ ] AC6: "Copy as Markdown" produces structured output per page type. Proof pages produce a sharing-ready template (title, verdict, stats, date, URL, then structured sections). Content pages produce clean markdown with a source header. Dynamic reference pages produce readable structured text.
- [ ] AC7: "Open in Claude" constructs `claude://claude.ai/new?q=...` URLs. Content pages use a documentation-reading prompt. Proof pages use an enriched grading prompt that explains what Anatomia is and what to assess.
- [ ] AC8: "Open in ChatGPT" constructs `https://chatgpt.com/?q=...` URLs with the same prompt pattern as Claude.
- [ ] AC9: claude:// links are hidden on mobile (≤640px).
- [ ] AC10: "Download artifacts" link is removed from proof detail pages. "View on GitHub" remains.
- [ ] AC11: `editUrl` is passed to RightRail on every page route that has a RightRail.
- [ ] AC12: `public/llms.txt` exists after build. Contains navigation index with H1 project name, blockquote summary, H2 sections with page links.
- [ ] AC13: `public/llms-full.txt` exists after build. Contains concatenated content from all pages, JSX stripped.
- [ ] AC14: Build fails on broken internal links — extraction script validates all `/docs/...` hrefs in MDX against known routes.
- [ ] AC15: Extraction script validates data completeness before writing (proof count > 0, command count > 0, agent count > 0, skill count > 0).
- [ ] AC16: `<ProofCount />`, `<RejectionCount />`, `<FindingCount />`, `<SkillCount />`, `<GotchaCount />` server components render current values from data loaders. Hardcoded numbers in editorial MDX pages are replaced.
- [ ] AC17: `<MedianTimings />` renders computed median timing values from all proof entries. Computation happens at build time in the data loader.
- [ ] AC18: All existing docs pages still build and render. `pnpm build` succeeds with zero regressions across all 124+ pages.
- [ ] AC19: All search overlay CSS lives in docs.css, scoped under `.docs-layout`. No globals.css changes.
- [ ] AC20: Search overlay visual design matches supermock: fixed overlay with blur backdrop, 580px modal, input row with search icon + ESC kbd badge, scrollable results area.
- [ ] Tests pass with project test command.
- [ ] No build errors from `pnpm build` in website/.

## Testing Strategy

- **Unit tests:** No unit test infrastructure exists for website components. The website's test surface is `pnpm build` — Next.js static generation exercises all 124+ pages, validating imports, data loaders, and component rendering.
- **Integration tests:** `pnpm build` in the website directory is the integration test. It catches: missing imports, broken data loaders, MDX component registration errors, and the extraction script's validation (completeness + link resolution).
- **Edge cases:**
  - Search with empty query shows placeholder text, not empty results
  - Search with no matches shows "No results found"
  - Keyboard navigation at first/last item stays clamped
  - Copy as Markdown with missing page content gracefully degrades (empty string, not crash)
  - MedianTimings with zero-valued stages filters them out before computing
  - llms-full.txt with JSX-heavy MDX files produces readable output (no leftover tags)

## Dependencies

- All 7 existing data JSON files must be generated before search-index.json (sequential in extraction script — already the case).
- `stripJsx.ts` must exist before the extraction script and page components reference it.

## Constraints

- All CSS in `docs.css` under `.docs-layout` scope. No globals.css changes.
- No new npm dependencies. Search is client-side substring matching. JSX stripping is regex. llms.txt is string concatenation.
- Website package only. No CLI package changes.
- RightRail is a `"use client"` component. Data for Copy as Markdown must be passed as string props from server page components — no data loader imports in RightRail.
- DocsNav must remain a server component. Search interactivity is isolated in `SearchTrigger` client wrapper.

## Gotchas

- **Supermock CSS token names differ from production.** The supermock uses `--bg-code`, `--r-sm`, `--r-md`, `--brand`. Production docs.css uses `--code-bg`, `--radius-sm` (6px), `--radius-md` (10px), `--color-brand`. Verify every token against docs.css before use.
- **RightRail is a client component.** AI link URL construction and Copy as Markdown formatting happen inside RightRail (client-side). But the *data* for these (page content, proof entry fields) must be passed as serializable props from server page components. Don't import data loaders inside RightRail.
- **MDX component registration is case-sensitive.** `<ProofCount />` in MDX must match exactly `ProofCount` key in `mdxComponents` map. Missing registration = raw text `<ProofCount />` rendered in the page.
- **Dynamic values inside JSX props.** Two MDX files have hardcoded values inside `description` string props of `<NextCards>` components. React server components can't render inside string props. The builder needs to find a pragmatic solution — either small wrapper components, or restructuring the JSX to use children instead of string props.
- **Search index must use `/docs/` prefix for routes.** The supermock omits the `/docs/` prefix because it's a standalone prototype. Production routes need the full path: `/docs/concepts/pipeline`, `/docs/proof/security-hardening`, etc.
- **Clipboard API requires secure context.** `navigator.clipboard.writeText()` works on localhost and HTTPS (Vercel). If it fails, catch and show a fallback message.
- **`claude://` protocol pre-fills without auto-submitting; `chatgpt.com/?q=` auto-submits.** Claude prompt can be longer since user reviews before sending. ChatGPT prompt should be concise.
- **Variable shadowing in extraction script.** Known proof finding: `extractSkillTemplates` has inner `content` shadowing outer `content`. Don't introduce new shadowing when adding the search index and llms.txt generation functions.
- **Supermock proof search routes are wrong for production.** The supermock only routes 3 "featured" proofs to detail pages (`hasDetail` check in app.js:398-399) — non-featured proofs fall back to the `/proof` explorer. In production, ALL 90 proofs have detail pages generated by `generateStaticParams()` in `app/docs/proof/[slug]/page.tsx`. Every proof search result must link to `/docs/proof/{slug}`. Do NOT replicate the supermock's featured-only routing logic.

## Build Brief

### Rules That Apply
- All CSS scoped under `[data-theme] .docs-layout` in docs.css. Never globals.css.
- Component CSS classes: component renders with a class like `docs-search-overlay`, docs.css targets it. Same pattern as `docs-right-rail`, `docs-sidebar`.
- Client components: `"use client"` directive, local state, no data loader imports. Data passed as props from server pages.
- Data loader pattern: `load()` caches in module scope, exported functions compute from cache.
- MDX component registration: `mdxComponents` map in catch-all page.tsx. Key = tag name in MDX.
- Responsive breakpoints: ≤1180px (right rail hides), ≤880px (mobile nav), ≤640px (compact mobile).
- No `any` — use `unknown` and narrow. Explicit return types on exported functions.

### Pattern Extracts

**ProofExplorer.tsx — client component structure (lines 1-15, 28-35):**
```tsx
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ProofEntry, ProofStats } from "@/lib/docs-data/types";

interface ProofExplorerProps {
  entries: ProofEntry[];
  stats: ProofStats;
  className?: string;
}
// ...
export function ProofExplorer({ entries, stats, className }: ProofExplorerProps) {
  const router = useRouter();
  const [stageFilter, setStageFilter] = useState<string>("All");
```

**RightRail.tsx — link row rendering (lines 149-184):**
```tsx
{(variant === "proof"
  ? [
      { text: "View on GitHub", arr: "↗", href: proofLinks?.githubUrl ?? "#" },
      { text: "Download artifacts", arr: "↗", href: "#" },
      { text: "Open in Claude", arr: "↗", href: "#" },
    ]
  : [
      { text: "Copy as Markdown", arr: "⌘C", href: "#" },
      { text: "Open in Claude", arr: "↗", href: "#" },
      { text: "Open in ChatGPT", arr: "↗", href: "#" },
    ]
).map((link) => (
  <a
    key={link.text}
    href={link.href}
    // ...
```

**proofs.ts — data loader pattern (lines 1-19):**
```tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProofEntry, ProofStats } from './types';

const DATA_PATH = join(process.cwd(), 'data', 'docs', 'proof-entries.json');
let cached: ProofEntry[] | null = null;

function load(): ProofEntry[] {
  if (!cached) {
    cached = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as ProofEntry[];
  }
  return cached;
}

export function getProofEntries(): ProofEntry[] {
  return load();
}
```

**Supermock search CSS (styles.css lines 780-822):**
```css
.search-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
  display: none; align-items: flex-start; justify-content: center;
  padding-top: 120px;
}
.search-overlay.open { display: flex; }
.search-modal {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--r-md); width: 580px; max-width: 90vw;
  max-height: 480px; overflow: hidden; box-shadow: var(--shadow);
  display: flex; flex-direction: column;
}
```
Note: `--r-md` → `--radius-md`, `--r-sm` → `--radius-sm` in production.

### Token Mapping Table

| Supermock token | Production token | Value |
|----------------|-----------------|-------|
| `--bg-code` | `--code-bg` | rgba(11,11,16,0.04) light / rgba(255,255,255,0.04) dark |
| `--r-sm` | `--radius-sm` | 6px |
| `--r-md` | `--radius-md` | 10px |
| `--brand` | `--color-brand` | (oxblood) |
| `--bg-card` | `--bg-card` | same |
| `--border` | `--border` | same |
| `--hairline` | `--hairline` | same |
| `--ink` | `--ink` | same |
| `--ink-40` | `--ink-40` | same |
| `--ink-60` | `--ink-60` | same |
| `--shadow` | `--shadow` | same |
| `--font-sans` | `--font-sans` | same |
| `--font-mono` | `--font-mono` | same |

### Proof Context
- RightRail: "Download artifacts" and "Open in Claude" links point to '#' — this scope fixes both.
- RightRail: responsive breakpoint mismatch finding — not in scope, don't regress it.
- extract-docs-data.ts: variable shadowing in `extractSkillTemplates` — don't introduce new shadowing.
- proofs.ts: no JSDoc on exported functions — add JSDoc to new `getMedianTimings()`.
- docs.css: `docs-content-full` dead code note — not in scope, leave it.

### Checkpoint Commands

- After SearchOverlay + SearchTrigger created: `(cd website && pnpm build)` — Expected: build succeeds, search overlay renders
- After all changes: `(cd website && pnpm build)` — Expected: build succeeds, 124+ pages render, llms.txt and llms-full.txt in public/
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: all existing CLI tests pass (no regressions)
- Lint: `pnpm run lint`

### Build Baseline
- Current CLI tests: run `(cd packages/cli && pnpm vitest run)` to get exact count
- Website build: `(cd website && pnpm build)` — must produce 124+ pages
- After build: website/public/llms.txt and website/public/llms-full.txt exist
- After build: website/data/docs/search-index.json exists with > 100 entries
- Regression focus: docs.css (responsive rules), RightRail.tsx (existing link rendering), DocsNav.tsx (layout), extract-docs-data.ts (existing validations)
