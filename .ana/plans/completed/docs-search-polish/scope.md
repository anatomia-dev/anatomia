# Scope: Docs Search + Polish (Scope 6 — Final)

**Created by:** Ana
**Date:** 2026-05-13

## Intent

The docs site has 124 pages rendering across 37 routes with 171/171 contract assertions passing (Scopes 1-5). But it can't ship: search is a disabled button, the AI surface is placeholder links pointing at `#`, 10 hardcoded numbers are already stale (78 → 90 proofs), and there's no build safety net for link rot. This scope makes the site production-ready — users can find content, the AI links work, the numbers stay current, and the build catches broken links.

## Complexity Assessment

- **Kind:** feature
- **Size:** medium — ~22 files touched, two non-trivial features (search overlay, copy-as-markdown), four small items (AI link wiring, llms.txt, build validation, dynamic values)
- **Files affected:**
  - NEW: `components/docs/layout/SearchOverlay.tsx` (client component)
  - NEW: `components/docs/content/DynamicStat.tsx` (server components)
  - MODIFY: `components/docs/layout/DocsNav.tsx` (wire search trigger)
  - MODIFY: `components/docs/layout/RightRail.tsx` (wire AI links, remove Download artifacts)
  - MODIFY: `scripts/extract-docs-data.ts` (search index + llms.txt generation)
  - MODIFY: `lib/docs-data/proofs.ts` (add `getMedianTimings()`)
  - MODIFY: `app/docs/[...slug]/page.tsx` (pass content/editUrl props, register DynamicStat components)
  - MODIFY: `app/docs/proof/[slug]/page.tsx` (wire proof-specific AI links, remove Download artifacts link)
  - MODIFY: `app/docs/proof/page.tsx` (pass editUrl)
  - MODIFY: `app/docs/reference/cli/page.tsx` (pass editUrl)
  - MODIFY: `app/docs/reference/agents/page.tsx` (pass editUrl)
  - MODIFY: `app/docs/reference/agents/[name]/page.tsx` (pass editUrl)
  - MODIFY: `app/docs/reference/skills/page.tsx` (pass editUrl)
  - MODIFY: `app/docs/reference/skills/[name]/page.tsx` (pass editUrl)
  - MODIFY: `app/docs/reference/context/page.tsx` (pass editUrl)
  - MODIFY: `app/docs/docs.css` (search overlay styles, mobile adaptations)
  - MODIFY: 6 MDX files (replace hardcoded numbers with dynamic components)
  - GENERATED: `public/llms.txt`, `public/llms-full.txt`
  - GENERATED: `data/docs/search-index.json`
- **Blast radius:** Docs site only. No CLI package changes, no marketing site changes, no globals.css changes. All CSS in docs.css under `.docs-layout` scope.
- **Estimated effort:** 1 pipeline run, single spec
- **Multi-phase:** no

## Approach

Six independent work items that ship together as the final production-readiness scope:

**1. Search overlay.** Build a custom SearchOverlay client component matching the supermock exactly (app.js:337-440, styles.css:780-822, index.html:92-101). Static JSON index generated at build time by the extraction script. Client-side substring filter with simple relevance ranking: exact title match first, then title-contains, then description-contains. Results grouped by Pages/Commands/Proofs. Replace the disabled placeholder button in DocsNav with the live overlay trigger. No Orama — the engine is a future swap; the overlay UI is the investment.

**2. Right rail AI links.** Wire the three placeholder links in RightRail with real functionality. "Copy as Markdown" serializes page content per page type — designed as a sharing surface, not a raw text dump. "Open in Claude" constructs claude:// protocol URLs with context-rich prompts. "Open in ChatGPT" constructs chatgpt.com URLs. Proof pages get an enriched grading prompt that explains what Anatomia is and what to assess. Remove the dead "Download artifacts" link from proof pages.

**3. Right rail footer.** Wire `editUrl` on every page route that doesn't already pass it. MDX pages link to the MDX source file (already done in catch-all). Dynamic pages link to the source data file or the generator.

**4. llms.txt generation.** The extraction script generates `public/llms.txt` (navigation index per llms.txt spec) and `public/llms-full.txt` (all content concatenated, JSX stripped) at build time.

**5. Build validation.** Add remark-validate-links for internal link checking (build fails on broken references). Extend extraction script's data completeness assertions.

**6. Dynamic MDX values.** Small server components that call data loaders at build time, replacing hardcoded numbers in editorial MDX pages. Registered in the catch-all's mdxComponents map.

## Acceptance Criteria

- AC1: ⌘K opens the search overlay. Typing filters results. Results are grouped by Pages, Commands, Proofs. Clicking a result navigates to the page and closes the overlay. ESC and backdrop click close the overlay.
- AC2: Keyboard navigation works in search results — arrow keys move selection, Enter navigates to selected result.
- AC3: Search results are ordered by relevance: exact title match first, then title-contains, then description-contains. Not just array order.
- AC4: Search index includes all content types: MDX pages (title + description from frontmatter), CLI commands (from commands.json), proof entries (slug + feature + scope summary from proof-entries.json), agent templates, skill templates. Total entries > 100.
- AC5: Mobile search works — search button triggers overlay (no ⌘K), modal has reduced top padding at ≤640px, max-height caps at 70vh for keyboard clearance.
- AC6: "Copy as Markdown" produces structured output per page type. Proof pages produce a sharing-ready template (title, verdict, stats, date, URL, then structured sections). Content pages produce clean markdown with a source header. Dynamic reference pages produce readable structured text.
- AC7: "Open in Claude" constructs `claude://claude.ai/new?q=...` URLs. Content pages use a documentation-reading prompt. Proof pages use an enriched grading prompt that explains what Anatomia is and what to assess (contract assertions, verification findings, stage timing).
- AC8: "Open in ChatGPT" constructs `https://chatgpt.com/?q=...` URLs with the same prompt pattern as Claude.
- AC9: claude:// links are hidden or gracefully degraded on mobile (protocol doesn't work in mobile browsers).
- AC10: "Download artifacts" link is removed from proof detail pages. "View on GitHub" remains.
- AC11: `editUrl` is passed to RightRail on every page route. MDX pages link to source MDX file. Dynamic pages link to source data file or generator.
- AC12: `public/llms.txt` exists after build. Contains navigation index with H1 project name, blockquote summary, H2 sections with page links.
- AC13: `public/llms-full.txt` exists after build. Contains concatenated content from all pages, JSX stripped.
- AC14: Build fails on broken internal links (remark-validate-links or equivalent).
- AC15: Extraction script validates data completeness before writing (proof count > 0, command count > 0, agent count > 0, skill count > 0).
- AC16: `<ProofCount />`, `<RejectionCount />`, `<FindingCount />`, `<SkillCount />`, `<GotchaCount />` server components render current values from data loaders. Hardcoded "78" and "17" in editorial MDX pages are replaced.
- AC17: `<MedianTimings />` renders computed median timing values (think, plan, build, verify) from all proof entries. Computation happens at build time in the data loader, not in the extraction script.
- AC18: All existing docs pages still build and render after this scope ships. `pnpm build` succeeds with zero regressions across all 124+ pages (14 MDX + 90 proof detail + 6 agent detail + 8 skill detail + 6 index/explorer pages).
- AC19: All search overlay CSS lives in docs.css, scoped under `.docs-layout`. No globals.css changes.
- AC20: Search overlay visual design matches supermock: fixed overlay with blur backdrop, 580px modal, input row with search icon + ESC kbd badge, scrollable results area.

## Edge Cases & Risks

- **Search index size.** ~160 entries at ~100 bytes each = ~16KB. Negligible. Fetched once on first overlay open, cached client-side.
- **MDX frontmatter for search index.** The extraction script runs at prebuild, before fumadocs processes MDX. It must read frontmatter directly from `.mdx` files (yaml parsing), not from the fumadocs source API. Plan should verify this works for nested directories (`concepts/`, `guides/`).
- **Copy as Markdown JSX stripping.** MDX pages contain JSX components (`<Callout>`, `<PipelineDiagram>`, `<ForPlatform>`). "Copy as Markdown" needs to either strip these cleanly or work from raw source. Plan decides the strategy.
- **llms-full.txt JSX stripping.** Same challenge as Copy as Markdown but at build time. The extraction script has access to raw MDX source files. Plan should define the stripping approach (regex vs remark serialization).
- **remark-validate-links compatibility.** Must work with fumadocs-mdx's remark pipeline. May need configuration to understand the `/docs` base URL and dynamic routes (proof, reference). Internal links to dynamic pages might need to be excluded or have a custom resolver. Plan should investigate.
- **Keyboard navigation state.** Search overlay needs a `selectedIndex` state for arrow key navigation. Must handle edge cases: wrapping (top → bottom or clamping), empty results, groups (do groups count as navigable items or just results?).
- **Token name verification.** Supermock CSS uses `--bg-code`, production docs.css defines `--code-bg`. Every token in the search overlay CSS must be verified against docs.css before use (Scope 5 learning).
- **Dynamic component registration.** New server components (`ProofCount`, etc.) must be registered in the catch-all's `mdxComponents` map. Missing registration = component renders as raw text in MDX.
- **Median computation edge cases.** Some proof entries may have 0-minute stages (e.g., early entries without timing data). `getMedianTimings()` should filter out zero-valued entries before computing medians, or document that zeros are included.

## Rejected Approaches

- **Fumadocs Orama for search.** Auto-indexes MDX pages but the UI is Fumadocs' search dialog, which doesn't match the supermock. We'd override the UI completely while still needing supplementary entries for commands/proofs/agents/skills. Static index is simpler, matches the spec, engine is swappable. The overlay UI is the investment; the engine is a future swap.
- **.json API routes per page for AI links.** The blueprint suggests parallel route.ts files so AI can read structured JSON. But Claude and ChatGPT can already read the static HTML pages (Next.js static generation on Vercel). Adds ~10 route files for marginal UX improvement. Deferred — AI links use direct page URLs now, structured endpoints can come in a polish pass if analytics show AI tools struggle with the HTML.
- **Download artifacts on proof pages.** Dead `#` link in the current UI. Options were: zip download, individual file links, or remove. Removed — "View on GitHub" already links to the archived plan directory. Dead links are worse than no links.
- **Multi-phase spec.** Items are independent (search, AI links, llms.txt, validation, dynamic values) but each is small enough that splitting into phases adds overhead without reducing risk. Single spec.

## Open Questions

- **Copy as Markdown serialization strategy.** For MDX pages: DOM-based walk (preserves rendered structure, requires client JS), raw MDX source passed as build-time prop (preserves markdown, includes JSX noise), or hybrid (build-time cleaned source). For proof pages: structured sharing template is defined (see AC6), but the template fields need to be available to the client component — passed as a prop or computed client-side from the page data. Plan should evaluate and decide.
- **remark-validate-links integration point.** Does it work as a remark plugin in `source.config.ts`, or does it need a separate build step? How does it handle links to dynamic routes (`/docs/proof/slug`, `/docs/reference/agents/name`) that don't have corresponding MDX files?
- **Mobile claude:// fallback.** Options: hide the link entirely on mobile (cleanest), show `claude.ai/new?q=` web URL (unreliable per ARCHITECTURE_BLUEPRINT.md), or show with a "(Desktop)" label. Plan picks.
- **llms-full.txt ordering.** Should content be ordered by sidebar navigation order (matching llms.txt) or alphabetically? Navigation order is more useful for sequential reading.

## Exploration Findings

### Patterns Discovered

- `website/scripts/extract-docs-data.ts`: Already extracts timing data per proof entry (lines 151-200). Per-stage minutes (think, plan, build, verify, totalMinutes) are fully populated on all 90 entries. Median computation belongs in the data loader (`lib/docs-data/proofs.ts`), not the extraction script.
- `website/lib/docs-data/proofs.ts`: Cached data loading pattern — `load()` reads JSON once, caches in module scope. `getMedianTimings()` follows the same pattern, iterating `load()` output.
- `website/components/docs/layout/RightRail.tsx`: Already has `variant="proof"` prop, `proofLinks` prop with `githubUrl`, and the three placeholder link rows. The link array is inline — wiring real URLs means replacing `href: "#"` with constructed URLs and adding onClick handlers for Copy as Markdown.
- `website/components/docs/layout/DocsNav.tsx`: Search button is at line 88-127, `disabled` prop. Replace with onClick that opens the overlay. The button is already styled to match the supermock trigger — just needs to become functional.
- `website/app/docs/[...slug]/page.tsx`: `mdxComponents` map at line 18-29. New DynamicStat components register here. Already passes `editUrl` to RightRail (line 99).

### Constraints Discovered

- [TYPE-VERIFIED] Timing data shape (website/lib/docs-data/types.ts:22-28) — `ProofTiming { think, plan, build, verify, totalMinutes }`. All number fields, all populated on 90 entries.
- [TYPE-VERIFIED] RightRail props (website/components/docs/layout/RightRail.tsx:16-26) — `editUrl?: string`, `variant?: "proof"`, `proofLinks?: { githubUrl: string }`. Props exist but need extension for AI link URLs and content serialization.
- [OBSERVED] Token isolation — all docs CSS in `app/docs/docs.css` scoped under `[data-theme] .docs-layout`. Search overlay styles must follow this pattern.
- [OBSERVED] 90 proof entries, 32 commands, 6 agents, 8 skills, 14 MDX pages = ~150 search index entries.
- [OBSERVED] Supermock search CSS uses `--bg-card`, `--border`, `--hairline`, `--ink`, `--ink-40`, `--ink-60`, `--code-bg`, `--shadow`, `--font-sans`, `--font-mono`, `--r-md`, `--r-sm`. All exist in docs.css except verify `--r-md` and `--r-sm` (may be `--radius-md` / `--radius-sm` in production).

### Test Infrastructure

- Build succeeds = primary validation (Next.js static generation exercises all pages).
- No unit test infrastructure for website components. Contract assertions via the pipeline are the test surface.

## For AnaPlan

### Structural Analog

`website/components/docs/proof/ProofExplorer.tsx` — the closest structural match. Client component with local state, filtering logic, keyboard-driven interaction, result rendering from data. SearchOverlay follows the same pattern: local state for query/selectedIndex, filter function over a data array, grouped result rendering, keyboard event handlers.

### Relevant Code Paths

- `website/components/docs/layout/DocsNav.tsx` — search button placeholder (line 88-127, `disabled` prop)
- `website/components/docs/layout/RightRail.tsx` — AI link placeholders (lines 128-185), footer (lines 187-235)
- `website/app/docs/[...slug]/page.tsx` — catch-all page, `mdxComponents` map (line 18-29), RightRail props (line 95-100)
- `website/app/docs/proof/[slug]/page.tsx` — proof detail page, RightRail with `variant="proof"` and `proofLinks`
- `website/scripts/extract-docs-data.ts` — extraction script, prebuild hook
- `website/lib/docs-data/proofs.ts` — proof data loaders, cached module pattern
- `website/app/docs/docs.css` — all docs CSS, responsive breakpoints at ≤1180px, ≤880px, ≤640px
- `website/content/docs/` — 14 MDX files, 6 with hardcoded values per DYNAMIC_VALUES_AUDIT.md

### Patterns to Follow

- Token isolation: `app/docs/docs.css` under `[data-theme] .docs-layout`. Never globals.css.
- Component CSS classes: component renders with a class like `docs-search-overlay`, `docs.css` targets it. Same pattern as `docs-right-rail`, `docs-sidebar`, `docs-content-area`.
- Client components: `"use client"` directive, local state, no data loader imports. Data passed as props from server page components.
- Data loader pattern: `website/lib/docs-data/proofs.ts` — `load()` caches, exported functions compute from cache.
- MDX component registration: `mdxComponents` map in catch-all page.tsx. Component name in map = component tag in MDX.
- Responsive collapse: docs.css `@media` rules at established breakpoints. New components add className props for CSS targeting.

### Known Gotchas

- Supermock CSS token names differ from production. Confirmed mappings: `--bg-code` → `--code-bg`, `--r-sm` → `--radius-sm` (6px), `--r-md` → `--radius-md` (10px), `--brand` → `--color-brand`. Verify EVERY token against docs.css before use. Build Brief must include this mapping table.
- Contract assertions must NEVER pin to specific counts. Use `greater 0` or `exists`, not `equals 90`.
- RightRail is a client component (`"use client"`). AI link construction (URL encoding, prompt text) can happen there, but data for Copy as Markdown must be passed as props from the server page component.
- The `claude://` protocol pre-fills without auto-submitting. The `chatgpt.com/?q=` URL auto-submits. Different UX — the prompts should be written accordingly (Claude prompt can be longer since user reviews before sending).
- Content for search index MDX entries must be read from raw `.mdx` files at prebuild time (yaml frontmatter parsing), not from fumadocs source API (not available yet at prebuild).

### Supermock Reference

- Search behavior: `app.js` lines 337-440
- Search overlay CSS: `styles.css` lines 780-822
- Search HTML structure: `index.html` lines 92-101
- Search index data: `data.js` lines 439-494

Path: `/Users/rsmith/Projects/anatomia_project/anatomia_reference/docs-research/supermock/`

### Copy as Markdown — Proof Page Template

Per product owner direction, proof page "Copy as Markdown" produces a structured sharing template:

```
# {Feature} — {PASS/FAIL}
{contract.satisfied}/{contract.total} assertions · {findingCount} findings · {duration}
Shipped {completedDate}
→ https://anatomia.dev/docs/proof/{slug}

## Assertions
{assertion list}

## Findings
{finding list with severity}

## Integrity
{hash summary}
```

This is a sharing surface — designed for pasting into PRs, Slack, docs. Not a raw text dump.

### Grading Prompt for Proof Pages

Per product owner direction, the "Open in Claude" link on proof pages carries an enriched grading prompt:

```
This is a proof chain entry from Anatomia — a verified AI development pipeline. Each proof records: contract assertions (what was promised), verification findings (what was discovered independently), and timing across Think→Plan→Build→Verify stages. Read this proof and assess: Are the assertions testing meaningful behavior or just checking existence? Are the findings actionable? Does the evidence support the verdict? {proofPageUrl}
```

### Dynamic Values Inventory

From DYNAMIC_VALUES_AUDIT.md — exact files and replacements:

| Component | Returns | Replaces |
|-----------|---------|----------|
| `<ProofCount />` | `getProofStats().entries` | "78 proofs" in 6 locations across 4 files |
| `<RejectionCount />` | `getProofEntries().filter(e => e.rejectionCycles > 0).length` | "17 had rejection cycles" in 4 files |
| `<FindingCount />` | `getProofStats().findings` | "443 findings" in 1 file |
| `<SkillCount />` | `getSkillCount()` | "8 skills" in 1 file |
| `<GotchaCount />` | `getGotchas().length` | "15 gotchas" in 1 file |
| `<MedianTimings />` | `getMedianTimings()` — computed in proofs.ts loader | "8m think, 10m plan, 31m build, 7m verify" in 1 file |

MDX files to edit: `start.mdx`, `concepts/pipeline.mdx`, `concepts/skills.mdx`, `guides/verifying-changes.mdx`, `guides/troubleshooting.mdx`, `guides/using-ana-learn.mdx`, `guides/reading-a-proof.mdx`.

### Things to Investigate

- Copy as Markdown serialization strategy for MDX content pages — DOM walk vs raw source prop vs hybrid. Each has fidelity/complexity/bundle tradeoffs.
- remark-validate-links compatibility with fumadocs-mdx remark pipeline and dynamic route resolution.
- Mobile claude:// fallback UX — hide, web URL, or label.
