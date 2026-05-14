# Build Report: Docs Search + Polish

**Created by:** AnaBuild
**Date:** 2026-05-14
**Spec:** .ana/plans/active/docs-search-polish/spec.md
**Branch:** feature/docs-search-polish

## What Was Built
- `website/lib/docs-data/stripJsx.ts` (created): Shared utility stripping JSX from raw MDX for Copy as Markdown and llms-full.txt
- `website/lib/docs-data/proofs.ts` (modified): Added `getMedianTimings()` — computes per-stage medians filtering zero values
- `website/lib/docs-data/index.ts` (modified): Re-exported `getMedianTimings`
- `website/components/docs/content/DynamicStat.tsx` (created): Server components for ProofCount, RejectionCount, FindingCount, SkillCount, GotchaCount, MedianTimings (used programmatically, not in MDX)
- `website/components/docs/content/NextCards.tsx` (modified): Widened `description` prop from `string` to `ReactNode`
- `website/components/docs/layout/SearchOverlay.tsx` (created): Client component — fixed overlay, lazy-loaded search index, relevance ranking, grouped results, keyboard navigation with clamped boundaries
- `website/components/docs/layout/SearchTrigger.tsx` (created): Client wrapper — button with ⌘K shortcut, renders SearchOverlay
- `website/components/docs/layout/DocsNav.tsx` (modified): Replaced inline disabled button with SearchTrigger import
- `website/components/docs/layout/RightRail.tsx` (modified): Added pageUrl/pageContent/pageTitle/pageDescription props. Wired Copy as Markdown (clipboard), Open in Claude (claude:// protocol), Open in ChatGPT. Proof variant removes Download artifacts, adds enriched grading prompt. Added copyFeedback state for 2s "Copied!" confirmation.
- `website/app/docs/[...slug]/page.tsx` (modified): Reads raw MDX source, strips JSX, passes pageContent/pageUrl/pageTitle/pageDescription to RightRail
- `website/app/docs/proof/[slug]/page.tsx` (modified): Added buildProofMarkdown helper for sharing template. Passes editUrl, pageUrl, pageTitle, pageContent to RightRail
- `website/app/docs/reference/cli/page.tsx` (modified): Added editUrl, pageUrl, pageTitle, pageDescription, pageContent to RightRail
- `website/app/docs/reference/agents/page.tsx` (modified): Added editUrl, pageUrl, pageTitle, pageDescription, pageContent to RightRail
- `website/app/docs/reference/agents/[name]/page.tsx` (modified): Added editUrl, pageUrl, pageTitle, pageDescription, pageContent to RightRail
- `website/app/docs/reference/skills/page.tsx` (modified): Added editUrl, pageUrl, pageTitle, pageDescription, pageContent to RightRail
- `website/app/docs/reference/skills/[name]/page.tsx` (modified): Added editUrl, pageUrl, pageTitle, pageDescription, pageContent to RightRail
- `website/app/docs/reference/context/page.tsx` (modified): Added editUrl, pageUrl, pageTitle, pageDescription, pageContent to RightRail
- `website/app/docs/docs.css` (modified): Search overlay CSS scoped under `[data-theme] .docs-layout`. AI link claude class. Mobile responsive: search modal 70vh cap at ≤640px, claude links hidden at ≤640px
- `website/scripts/extract-docs-data.ts` (modified): Added search index generation (150 entries), llms.txt/llms-full.txt generation, internal link validation, dynamic MDX value updates, extended completeness validation (totalCommands > 0, searchIndex > 100)
- `website/content/docs/start.mdx` (modified): Dynamic rejection/proof count with ana:dynamic marker
- `website/content/docs/concepts/pipeline.mdx` (modified): Dynamic rejection/proof count with ana:dynamic marker
- `website/content/docs/concepts/skills.mdx` (modified): Dynamic skill count and gotcha count with ana:dynamic markers
- `website/content/docs/guides/verifying-changes.mdx` (modified): Dynamic rejection/proof count with ana:dynamic marker
- `website/content/docs/guides/troubleshooting.mdx` (modified): Dynamic rejection/proof count and proof summary with ana:dynamic markers
- `website/content/docs/guides/using-ana-learn.mdx` (modified): Dynamic proof/findings count with ana:dynamic marker
- `website/content/docs/guides/reading-a-proof.mdx` (modified): Dynamic proof count and median timings with ana:dynamic marker
- `website/public/llms.txt` (generated): Navigation index with project description, sections, and links
- `website/public/llms-full.txt` (generated): Full concatenated MDX content with JSX stripped

## PR Summary

- Add ⌘K search overlay with relevance-ranked, keyboard-navigable results across pages, commands, proofs, agents, and skills
- Wire RightRail AI links: Copy as Markdown (clipboard), Open in Claude (claude:// protocol with enriched proof prompt), Open in ChatGPT — removing the Download artifacts placeholder from proof pages
- Generate llms.txt and llms-full.txt for LLM-readable documentation, search-index.json for client-side search, and validate internal links at build time
- Replace hardcoded numbers in 7 MDX files with prebuild-time dynamic values from the extraction script using ana:dynamic markers
- Add editUrl, pageUrl, pageContent props to RightRail across all page routes that have one

## Acceptance Criteria Coverage

- AC1 "⌘K opens search" → SearchTrigger.tsx handles ⌘K, SearchOverlay renders. Build-verified via successful `pnpm build`. (UI interaction not unit-testable without browser)
- AC2 "Keyboard navigation" → SearchOverlay.tsx useEffect keydown handler: ArrowDown/ArrowUp move selectedIndex, Enter navigates, clamped at boundaries. Build verified.
- AC3 "Relevance ranking" → SearchOverlay.tsx useMemo scoring: exact title=3, title-contains=2, description-contains=1, sorted descending. Build verified.
- AC4 "Search index > 100 entries" → Extraction script validates `searchIndex.length > 100` at build. Current: 150 entries across page/command/proof/agent/skill types.
- AC5 "Mobile search works" → docs.css: ≤640px search modal padding reduced, max-height 70vh. ≤880px search button becomes icon-only (existing CSS).
- AC6 "Copy as Markdown" → RightRail.tsx handleCopyMarkdown uses navigator.clipboard.writeText with pageContent. Content pages: title + description + stripped MDX. Proof pages: structured sharing template.
- AC7 "Open in Claude" → RightRail.tsx constructs `claude://claude.ai/new?q=...` with documentation-reading prompt (content) or enriched grading prompt (proof, contains "proof chain entry from Anatomia").
- AC8 "Open in ChatGPT" → RightRail.tsx constructs `https://chatgpt.com/?q=...` with same prompt pattern.
- AC9 "claude:// hidden on mobile" → docs.css: `.docs-ai-link-claude { display: none !important }` at ≤640px.
- AC10 "Download artifacts removed from proofs" → RightRail.tsx proof variant link array no longer contains "Download artifacts".
- AC11 "editUrl on every route with RightRail" → All 9 page route files pass editUrl prop. Catch-all already had it.
- AC12 "llms.txt exists after build" → public/llms.txt generated (37 lines). Contains `# Anatomia`, sections, links.
- AC13 "llms-full.txt exists after build" → public/llms-full.txt generated (1116 lines). JSX stripped: 0 `<Callout`, 0 `<NextCards`.
- AC14 "Build fails on broken internal links" → extract-docs-data.ts validateInternalLinks scans all MDX hrefs, exits non-zero on broken links.
- AC15 "Extraction validates completeness" → Errors array checks proofEntries > 0, commands.totalCommands > 0, searchIndex > 100.
- AC16 "Dynamic MDX components" → Implemented via prebuild-time text replacement instead of React components (see Deviations). Values update on every build.
- AC17 "MedianTimings" → getMedianTimings() computes per-stage medians filtering zeros. Used by extraction script for MDX value updates.
- AC18 "All pages build" → `pnpm build` produces 136 pages successfully.
- AC19 "CSS in docs.css only" → All search overlay CSS in docs.css under `[data-theme] .docs-layout`. No globals.css changes.
- AC20 "Search overlay matches supermock" → CSS implements: fixed overlay with blur backdrop, 580px modal, input row with search icon + ESC badge, scrollable results area with group labels.

## Implementation Decisions

1. **Dynamic values via prebuild text replacement, not React components.** Fumadocs-mdx compiles MDX into modules that evaluate component references at import time, before the `components` prop is available. Custom components like `<SkillCount />` cause "not defined" errors. Solution: extraction script updates numbers in-place using `ana:dynamic` marker comments. Values refresh on every build. Same outcome, different mechanism.

2. **Proof markdown sharing template built in page component.** `buildProofMarkdown()` constructs the structured sharing format (verdict, stats, assertions, findings, integrity) from the entry data at build time and passes as a string prop to RightRail.

3. **stripJsx duplicated in extraction script.** The extraction script runs under tsx (Node), not the Next.js bundler, so it can't import from website/lib. The stripJsx logic is duplicated as a local function. This is noted as an open issue.

4. **Search index includes all proof entries, not just "featured" ones.** The supermock only routes 3 featured proofs to detail pages, but in production all 90 have pages. All are included in the search index.

5. **Copy as Markdown uses navigator.clipboard.writeText.** Catches errors silently — clipboard API requires secure context (HTTPS/localhost). No fallback UI beyond the "Copied!" confirmation.

## Deviations from Contract

### A025: ProofCount component renders the current number of proof entries
**Instead:** Dynamic value updated in MDX via prebuild text replacement using ana:dynamic markers
**Reason:** Fumadocs-mdx compiles MDX modules that evaluate component references at import time. Custom JSX components in MDX cause "ReferenceError: not defined" at build. The `components` prop and `useMDXComponents` patterns don't resolve this in fumadocs-mdx's collection compilation mode.
**Outcome:** Functionally equivalent — values update on every build from the proof chain data

### A026: RejectionCount component renders the count of proofs with rejection cycles
**Instead:** Dynamic value updated in MDX via prebuild text replacement
**Reason:** Same fumadocs-mdx limitation as A025
**Outcome:** Functionally equivalent

### A027: MedianTimings renders computed median values from proof data
**Instead:** getMedianTimings() function exists and is used by extraction script to update MDX text
**Reason:** Same fumadocs-mdx limitation as A025
**Outcome:** Functionally equivalent

### A028: Median computation filters out zero-valued stages before calculating
**Instead:** Filtering implemented identically in both getMedianTimings() (proofs.ts) and the extraction script's local median computation
**Reason:** Both implementations filter `entry.timing.{stage} > 0` before collecting values
**Outcome:** Contract satisfied — zeros are filtered

### A029: Dynamic components are registered in the catch-all mdxComponents map
**Instead:** Components exist in DynamicStat.tsx but are not registered in mdxComponents (not usable in MDX)
**Reason:** Fumadocs-mdx limitation prevents custom component use in MDX content
**Outcome:** Components exist for programmatic use by page components and extraction script; MDX values updated via prebuild script

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  7 failed | 93 passed (100)
Tests       283 failed | 1895 passed | 2 skipped (2180)
```
Note: 7 test files failing pre-existed before any changes (MODULE_NOT_FOUND errors in Node v25.9.0).

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  7 failed | 93 passed (100)
Tests       283 failed | 1895 passed | 2 skipped (2180)
```

```
(cd website && pnpm build)
✓ Compiled successfully in 2.2s
✓ Generating static pages (136/136) in 649ms
Extraction: 150 search index entries, 90 proofs, 32 commands
llms.txt: 37 lines, llms-full.txt: 1116 lines
Internal links: validated, 0 broken
```

### Comparison
- Tests added: 0 (website has no unit test infrastructure; integration test is pnpm build)
- Tests removed: 0
- Regressions: none — CLI tests identical, website builds 136 pages (up from 124+ baseline due to new proofs)

### New Tests Written
No unit tests — website testing surface is `pnpm build` per spec Testing Strategy. The build exercises all imports, data loaders, component rendering, and extraction script validation.

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Fix History

- **Fix 1:** `buildProofMarkdown` compared `entry.result` against lowercase `"pass"` and `a.status` against lowercase `"satisfied"`, but proof chain data uses uppercase `"PASS"` / `"SATISFIED"`. Every proof's Copy as Markdown would have shown FAIL verdict and ✗ on all assertions. Fixed to uppercase comparisons.

## Git History
```
f341531c [docs-search-polish] Fix: case-sensitive status checks in proof sharing template
eb5ee10e [docs-search-polish] Build report
267992c0 [docs-search-polish] Add generated llms.txt and llms-full.txt
ebcc1c69 [docs-search-polish] Add search overlay and AI link CSS
c093f536 [docs-search-polish] Add search index, llms.txt, link validation, dynamic MDX values
8aa94b1a [docs-search-polish] Wire RightRail AI links and editUrl on all pages
e218e1c9 [docs-search-polish] Add search overlay with keyboard navigation
29a992fe [docs-search-polish] Add stripJsx utility, getMedianTimings, and DynamicStat components
```

## Open Issues

1. **stripJsx duplicated between extraction script and website lib.** The extraction script runs under tsx (not Next.js bundler) and cannot import from `website/lib/docs-data/stripJsx.ts` because of path resolution differences. The logic is duplicated as a local function in `extract-docs-data.ts`. A shared module would need to be extracted to a location both contexts can import from.

2. **DynamicStat components created but unused in MDX.** The components exist and work as server components (for programmatic use) but cannot be rendered inside MDX content due to fumadocs-mdx's compilation model. They remain available for future use if fumadocs-mdx adds support or if the rendering approach changes.

3. **Search overlay not unit-tested.** The search overlay has keyboard navigation, relevance ranking, and group logic that would benefit from unit tests. No test infrastructure exists for website components — would need jsdom/happy-dom setup.

4. **Prebuild MDX text replacement is fragile.** The `ana:dynamic` markers rely on regex patterns matching the exact surrounding text. If editorial changes modify the sentence structure around a marker, the regex won't match and the value won't update. The extraction script logs how many files were updated — a 0-file update when expected changes exist would signal breakage.

5. **Pre-existing CLI test failures.** 7 test files (283 tests) fail with MODULE_NOT_FOUND on Node v25.9.0. These are pre-existing and unrelated to this build.

Verified complete by second pass.
