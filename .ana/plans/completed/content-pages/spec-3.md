# Spec: Content Pages — Phase 3 (Six Guide Pages)

**Created by:** AnaPlan
**Date:** 2026-05-12
**Scope:** .ana/plans/active/content-pages/scope.md

## Approach

Phase 3 creates 6 guide MDX pages with content rewritten from the supermock session. One new component: TroubleCard for the troubleshooting page's card-based layout. All other guide pages use the same components as concept pages (Callout, NextCards, fenced code blocks, markdown tables).

The 6 guide pages and their supermock sources:
1. `using-ana-setup.mdx` ← `renderUsingAnaSetup()` — guess-and-confirm pattern, what setup writes, the session (5 phases), strong vs weak answers
2. `verifying-changes.mdx` ← `renderVerifyingChanges()` — what Verify does (8 steps), the asymmetry, the verify report, PASS/FAIL, rejection cycles, running verify, comparing reports
3. `reading-a-proof.mdx` ← `renderReadingAProof()` — how to read a proof chain entry
4. `using-ana-learn.mdx` ← `renderUsingAnaLearn()` — when to run Learn, what it does, finding triage
5. `configurability.mdx` ← `renderConfigurability()` — ana.json, custom skills, custom agents, design principles
6. `troubleshooting.mdx` ← `renderTroubleshooting()` — card-based layout with TroubleCard, 3 sections (gate, pipeline, config), best practices

**Guide pages differ from concept pages** in voice: guides are task-oriented ("do this, then this") while concepts are explanatory ("here's how this works"). The content structure is the same — frontmatter, h1, lede, MetaRow, sections, NextCards.

**TroubleCard component:** The troubleshooting page uses a card layout for each problem/solution pair. Each card has a title (the problem) and body (the fix). This is a simple server component — no interactivity needed. Used via MDX import on the troubleshooting page only.

**Dynamic values in guides:** Same strategy as Phase 2 — hardcode with comments. The guide pages reference proof counts ("17 of 87 proofs had rejection cycles") and similar stats. These are editorial numbers that give context, not real-time dashboards.

**Email address:** `help@anatomia.dev` ships as-is per scope. The email will be set up before Scope 6.

## Output Mockups

### TroubleCard layout (troubleshooting page)
```
┌──────────────────────────────────────────────┐
│ ana init failed                               │
│                                               │
│ 1. Run from your project root, not a          │
│    subdirectory or a worktree                 │
│ 2. Git must be configured: git status must    │
│    succeed...                                 │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ Scan missed my stack                          │
│                                               │
│ Install dependencies first...                 │
└──────────────────────────────────────────────┘
```

### Guide page structure (all 6 follow this)
```
Docs / Guides / Using ana-setup         ← breadcrumb (auto)

Using ana-setup                          ← h1
Setup reads your codebase, forms...     ← lede
8 min read · Last reviewed 2026-05-12   ← MetaRow

## How it works                          ← content sections
...

[Next guide] [Related concept]           ← NextCards
```

## File Changes

### `website/components/docs/content/TroubleCard.tsx` (create)
**What changes:** Server component for problem/solution cards. Takes `title` (string) and `children` (ReactNode). Renders a bordered card with the title as h4 and children as the solution body. Used in the troubleshooting guide via MDX import.
**Pattern to follow:** `Callout.tsx` for component structure — typed props, CSS custom properties for theming, simple wrapper with children.
**Why:** The troubleshooting page's card layout can't be expressed with standard markdown. Each problem/solution pair needs visual grouping.

### `website/content/docs/guides/using-ana-setup.mdx` (create)
**What changes:** Using ana-setup guide. Guess-and-confirm pattern, what setup writes (3 artifacts), the session (5 phases: config, product identity, draft review, design principles, skill enrichment), strong vs weak answers comparison.
**Pattern to follow:** Supermock `renderUsingAnaSetup()` (lines 675–800) for content.
**Why:** The most important guide for new users after quickstart. Explains how to calibrate project knowledge.

### `website/content/docs/guides/verifying-changes.mdx` (create)
**What changes:** Verifying changes guide. What Verify does (8 steps), the asymmetry (what each agent reads), the verify report structure, PASS/FAIL criteria, rejection cycle handling, running verify, comparing two reports.
**Pattern to follow:** Supermock `renderVerifyingChanges()` (lines 803–901) for content.
**Why:** Explains the verification process — the core value proposition.

### `website/content/docs/guides/reading-a-proof.mdx` (create)
**What changes:** Reading a proof guide. How to interpret each section of a proof chain entry — contract score, findings by severity, timing, artifact hashes.
**Pattern to follow:** Supermock `renderReadingAProof()` (lines 903–1000) for content.
**Why:** Connects the pipeline output to user understanding.

### `website/content/docs/guides/using-ana-learn.mdx` (create)
**What changes:** Using ana-learn guide. When to run Learn, what it does (finding triage), the triage flow, how findings become rules.
**Pattern to follow:** Supermock `renderUsingAnaLearn()` (lines 1001–1090) for content.
**Why:** Explains the learning loop that makes the system improve over time.

### `website/content/docs/guides/configurability.mdx` (create)
**What changes:** Configurability guide. ana.json configuration, custom skills (create your own skill files), custom agents, design principles management, advanced options.
**Pattern to follow:** Supermock `renderConfigurability()` (lines 1091–1256) for content.
**Why:** Power-user guide for customizing Anatomia's behavior.

### `website/content/docs/guides/troubleshooting.mdx` (create)
**What changes:** Troubleshooting guide with TroubleCard component. Three sections: Getting through the gate (4 cards), Pipeline problems (5 cards), Configuration and state (5 cards). Plus best practices list and contact info.
**Pattern to follow:** Supermock `renderTroubleshooting()` (lines 1257–1314) for content and card structure.
**Why:** The "stuck? look here" page. Card-based for quick scanning.

## Acceptance Criteria

- [ ] AC4: All 6 guide pages render at `/docs/guides/{slug}` with correct content matching the supermock, including the troubleshooting page's card-based layout
- [ ] AC13: TOC (right rail) populates correctly on all guide pages from heading structure
- [ ] AC14: NextCards at the bottom of each page link to the correct next page, matching the supermock's navigation flow
- [ ] AC12: `pnpm build` succeeds with all 16 pages compiling without errors
- [ ] No type errors or missing component imports
- [ ] TroubleCard renders correctly in the troubleshooting page

## Testing Strategy

- **Build verification:** `pnpm build` in the website directory. All 6 MDX files must compile. This is the final build — all 16 pages (overview + quickstart + 7 concepts + 6 guides) must succeed.
- **Visual verification:** Vercel preview against supermock. Pay special attention to the troubleshooting page's card layout and the configurability page's long-form content.
- **Edge cases:**
  - TroubleCard renders correctly with complex children (ordered lists, code blocks, links)
  - `help@anatomia.dev` mailto link works
  - All NextCards hrefs resolve to real pages (not future scope pages)

## Dependencies

- Phase 2 must be complete: concept pages exist so NextCards links from guides to concepts resolve.
- Phase 1 must be complete: Callout fix, meta.json ordering, bug fixes.

## Constraints

- Guide content is rewritten from the supermock, not copied verbatim. The supermock uses HTML with inline styles; production uses MDX with markdown and components.
- TroubleCard must be registered in `mdxComponents` in `[[...slug]]/page.tsx` or imported explicitly in the troubleshooting MDX file. Decision: register in mdxComponents — it's a content component like Callout.
- Some NextCards in guides link to reference pages (`/docs/reference/cli`, `/docs/reference/agents`) that don't exist yet (Scope 5). These links will 404 until Scope 5 lands. This is acknowledged — the sidebar transformer already injects these links with the same behavior.
- The troubleshooting page has no `readingTime` in the supermock — only `lastReviewed`. Include `lastReviewed` but omit `readingTime` for this page.

## Gotchas

- **TroubleCard children complexity:** The supermock trouble cards contain ordered lists (`<ol>`), inline code, and links. In MDX, TroubleCard children must be valid MDX — use markdown lists and formatting inside the component tags. Test that markdown renders correctly inside the component.
- **Long guide pages:** The configurability page is the longest guide (supermock lines 1091–1256). It covers ana.json, custom skills, custom agents, design principles, and advanced options. Don't skip sections — translate the full content.
- **Supermock inline-styled grids:** The using-ana-setup page has inline-styled 3-column grids (what setup writes) and 2-column grids (weak vs strong answers). In MDX, these can't use inline styles. Options: (a) use a simple list/description structure instead, (b) create a simple grid component. Decision: use markdown structure (bold headings + descriptions). The visual fidelity of cards is nice-to-have; the information is what matters.
- **NextCards linking to reference pages:** Some guides link to `/docs/reference/cli`, `/docs/reference/agents`, etc. These routes exist in the sidebar (injected by the transformer) but will 404 until Scope 5. Use the links anyway — they're correct and will work when reference pages ship.
- **Dynamic proof stats in guides:** The verifying-changes guide says "17 of Anatomia's own 87 proofs had rejection cycles." The real number is 19 rejections out of 87 entries. Use the real numbers, not the supermock's stale numbers.

## Build Brief

### Rules That Apply
- Same MDX conventions as Phase 2: frontmatter schema, component usage, markdown formatting.
- TroubleCard follows the Callout component pattern: typed props, CSS custom properties, children as ReactNode.
- Links to reference pages that don't exist yet: use the correct href anyway. They'll resolve in Scope 5.
- When hardcoding proof stats in guide prose, use current values from the proof chain at build time (run `getProofStats()` or check `proof-entries.json`). Don't copy the supermock's stale numbers — they're from an older snapshot.

### Pattern Extracts

**Callout.tsx (component pattern for TroubleCard — similar wrapper with children):**
```tsx
// website/components/docs/content/Callout.tsx lines 21-37
export function Callout({ variant = "note", children }: CalloutProps) {
  const styles = variantStyles[variant];

  return (
    <div
      role="note"
      className="my-6 rounded-[var(--radius-sm)] px-5 py-4 text-[14.5px] leading-relaxed"
      style={{
        borderLeft: `3px solid ${styles.borderColor}`,
        background: styles.background,
        color: "var(--fg)",
      }}
    >
      {children}
    </div>
  );
}
```

**Supermock TroubleCard rendering (shows the data structure):**
```js
// supermock-v1-locked/pages.js lines 1289-1295
${gateCards.map(c => `<div class="trouble-card"><h4>${c.title}</h4><div class="fix">${c.fix}</div></div>`).join('')}
```

### Proof Context

No active proof findings for affected files.

### Checkpoint Commands

- After first 3 guide pages: `cd website && pnpm build` — Expected: build succeeds
- After all 6 guide pages + TroubleCard: `cd website && pnpm build` — Expected: build succeeds with all 16 pages
- Final build: `cd website && pnpm build` — Expected: all 16 pages compile, 0 errors
- Lint: `cd website && pnpm lint`

### Build Baseline

- After Phase 2: build succeeds with overview + quickstart + 7 concept pages
- After Phase 3: build succeeds with all 16 pages (1 overview + 1 quickstart + 7 concepts + 6 guides + 1 deleted)
- Regression focus: sidebar ordering with all pages present, catch-all page rendering for all routes
