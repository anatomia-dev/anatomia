# Spec: Content Pages — Phase 1 (Overview, Quickstart, Bug Fixes, Sidebar)

**Created by:** AnaPlan
**Date:** 2026-05-12
**Scope:** .ana/plans/active/content-pages/scope.md

## Approach

Phase 1 delivers the overview landing page (custom `page.tsx`), the quickstart MDX page, three bug fixes that affect all page renders, meta.json files for sidebar ordering, and deletion of the Scope 1 test page.

**Overview page** is a custom server component at `website/app/docs/page.tsx` — not MDX — because it has unique layout: stats strip with dynamic values, pipeline diagram, audience cards, curated proof table, and resource strip. Five new server components built for this page. No RightRail — the overview is a card-based landing page, not a prose page.

**Bug fixes** land in Phase 1 so every subsequent page renders correctly:
- D15 (RightRail dead zone): Remove Tailwind `hidden xl:block` from RightRail. The CSS `@media (max-width: 1180px)` with `!important` in docs.css is the sole visibility controller.
- D19 (Callout missing label): Add a mono uppercase label ("RULE" or "NOTE") before children.
- D20 (GitHub URL wrong org): Change `anatomia-dev` to `TettoLabs` in DocsNav and catch-all page.tsx.

**Sidebar ordering** via Fumadocs meta.json. Three files establish the 5-group structure: Get Started, Concepts, Guides (from MDX), plus Reference and Proof Chain (injected by the transformer in `lib/source.ts`).

**Terminal code blocks**: Content uses plain text in `bash` fenced blocks. No custom coloring — content is what matters.

## Output Mockups

### Overview page at `/docs`

Stats strip (dynamic values):
```
87          6             32            8
verified    sealed        CLI           stack-matched
proofs      agents        commands      skills
```

Pipeline diagram: 5 cards in a horizontal flow — Think → Plan → Build → Verify → Learn. Each card shows number (01–05), stage name, one-line description, artifact name, and agent name.

Audience cards: 3 cards — "Evaluating" (→ open a real proof), "Installing" (→ quickstart), "Operating" (→ how it works).

Curated proof table: 6 rows with columns: Proof (slug + description), Stage, Assertions (satisfied/total), Findings, Result (PASS pill). Footer: "6 of 87 proofs · curated" with "Browse all 87 →" link.

Resource strip: 3 small cards — GitHub (external), npm (external), Manifesto (internal).

### Callout with label
```
┌─────────────────────────────────────────┐
│ RULE                                     │
│ Every change must be verified. The proof │
│ chain records what was built...          │
└─────────────────────────────────────────┘
```

### Sidebar ordering
```
Get Started
  Overview
  Quickstart
Concepts
  The pipeline
  Skills
  Context
  The toolbelt
  Artifacts
  The contract
  Findings
Guides
  Using ana-setup
  Verifying changes
  Reading a proof
  Using ana-learn
  Configurability
  Troubleshooting
Reference          ← injected by transformer
  CLI Commands
  Agent Templates
  Skill Files
  Context Files
Proof Chain         ← injected by transformer
  Browse All
  Featured Proofs
```

## File Changes

### `website/app/docs/page.tsx` (create)
**What changes:** New custom overview page. Server component that imports data loaders and the 5 overview-specific components. Renders stats strip, pipeline diagram, audience cards, curated proof table, and resource strip. No RightRail. Includes `generateMetadata` export for SEO.
**Pattern to follow:** `website/app/docs/[[...slug]]/page.tsx` for the overall structure (server component, metadata generation). The overview renders its own layout instead of MDX.
**Why:** The overview is a marketing-style landing page with unique layout — cards, grids, dynamic data — that can't be expressed as MDX.

### `website/content/docs/index.mdx` (delete)
**What changes:** Remove the Scope 1 test page. It renders at `/docs` which would conflict with the new `app/docs/page.tsx`, and it contains placeholder content.
**Why:** Replaced by the custom overview page. The file was a validation artifact from the MDX pipeline scope.

### `website/content/docs/start.mdx` (create)
**What changes:** Quickstart MDX page. Frontmatter with title, description, readingTime (8), lastReviewed. Content translated from supermock `renderQuickstart()` — prerequisites, install, init, first pipeline run, review/merge/complete. Uses `<Callout>`, fenced code blocks, and `<NextCards>`.
**Pattern to follow:** The existing `index.mdx` for frontmatter structure. Supermock `renderQuickstart()` (lines 212–282) for content.
**Why:** First real MDX content page. Entry point for new users.

### `website/content/docs/meta.json` (create)
**What changes:** Root sidebar ordering. Fumadocs meta.json with `pages` array controlling order of top-level items and folder groups.
**Pattern to follow:** Fumadocs meta.json schema — `title` (optional), `pages` (array of slug strings or `---` separators or `...rest`).
**Why:** Without meta.json, sidebar order is alphabetical. With it, we get the intentional 5-group structure.

### `website/content/docs/concepts/meta.json` (create)
**What changes:** Concepts group ordering: pipeline, skills, context, toolbelt, artifacts, contract, findings.
**Pattern to follow:** Same Fumadocs meta.json schema.
**Why:** Controls page order within the Concepts group.

### `website/content/docs/guides/meta.json` (create)
**What changes:** Guides group ordering: using-ana-setup, verifying-changes, reading-a-proof, using-ana-learn, configurability, troubleshooting.
**Pattern to follow:** Same Fumadocs meta.json schema.
**Why:** Controls page order within the Guides group.

### `website/components/docs/content/PipelineDiagram.tsx` (create)
**What changes:** Server component rendering the 5-stage pipeline flow. Each stage is a card with number, name, description, artifact, and agent. Links to future agent reference pages.
**Pattern to follow:** `StatsStrip.tsx` for component structure — typed props interface, CSS custom properties for theming, Tailwind for layout.
**Why:** The pipeline visualization is the central visual on the overview. Reusable on the pipeline concept page.

### `website/components/docs/content/AudienceCards.tsx` (create)
**What changes:** Server component rendering 3 audience cards (Evaluating, Installing, Operating). Each card has a tag, heading, description, and CTA link.
**Pattern to follow:** `NextCards.tsx` for the card grid pattern.
**Why:** The overview's "where to start" section — routes users by intent.

### `website/components/docs/content/CuratedProofs.tsx` (create)
**What changes:** Server component rendering the curated proof table. Takes proof entries array and curated config (slug → editorial description). Renders a table with dynamic assertion counts, finding counts, and stage from data. Handles missing slugs gracefully (skip the row). Footer shows count and "Browse all" link.
**Pattern to follow:** Supermock overview proof table (lines 192–208) for structure. Data loader pattern from `proofs.ts`.
**Why:** The proof chain showcase on the overview. Dynamic data proves the system is real.

### `website/components/docs/content/ResourceStrip.tsx` (create)
**What changes:** Server component rendering 3 resource links (GitHub, npm, Manifesto). Each has a type label, name, and description.
**Pattern to follow:** `StatsStrip.tsx` for the horizontal strip layout.
**Why:** External links section at the bottom of the overview.

### `website/components/docs/content/Callout.tsx` (modify)
**What changes:** Add a label element before `children`. The label shows the variant name ("RULE" or "NOTE") in mono uppercase, matching the supermock's `.ci` styling.
**Why:** Without the label, users can't distinguish rule callouts from note callouts. The border color alone is insufficient.

### `website/components/docs/layout/RightRail.tsx` (modify)
**What changes:** Remove `hidden` and `xl:block` from the aside's className. Keep `docs-right-rail` class (CSS controls visibility via `@media (max-width: 1180px)`).
**Why:** The Tailwind `xl:block` (1280px breakpoint) conflicts with the CSS media query (1180px breakpoint), creating a 1181-1279px dead zone where the rail is hidden by Tailwind but should be visible per CSS.

### `website/components/docs/layout/DocsNav.tsx` (modify)
**What changes:** Change `anatomia-dev` to `TettoLabs` in the GitHub link href.
**Why:** Wrong org. TettoLabs is the correct GitHub organization (confirmed by 9 references in the marketing site).

### `website/app/docs/[[...slug]]/page.tsx` (modify)
**What changes:** Change `anatomia-dev` to `TettoLabs` in the `editUrl` template string.
**Why:** Same bug as DocsNav — wrong org in the "Edit on GitHub" link.

## Acceptance Criteria

- [ ] AC1: Overview page renders at `/docs` with stats strip showing dynamic values (proof count, agent count, command count, skill count), pipeline diagram, audience cards, curated proof table with dynamic assertion/finding counts, and resource strip
- [ ] AC5: Sidebar shows 5 groups in correct order: Get Started, Concepts, Guides, Reference, Proof Chain — with correct page ordering within each group
- [ ] AC6: Callout component renders "RULE" or "NOTE" label text in mono uppercase before the content
- [ ] AC7: RightRail is visible at viewports >1180px without a dead zone — CSS media query is the sole visibility controller
- [ ] AC8: All GitHub URLs in DocsNav and page.tsx point to `TettoLabs/anatomia`, not `anatomia-dev/anatomia`
- [ ] AC9: Dynamic values (proof counts, command counts, skill counts, agent counts) come from data loaders, not hardcoded strings
- [ ] AC11: The Scope 1 test page (`content/docs/index.mdx`) is deleted and does not render
- [ ] AC2: Quickstart page renders at `/docs/start` with correct MDX content matching supermock
- [ ] AC12: `pnpm build` succeeds with all pages compiling without errors
- [ ] No build errors or type errors

## Testing Strategy

- **Build verification:** `pnpm build` in the website directory is the primary test. MDX compilation, type checking, and route generation all happen at build time. A successful build proves all pages compile, all imports resolve, and all component props type-check.
- **Visual verification:** Vercel preview deployment against the supermock. Not automated — developer confirms.
- **Edge cases:**
  - CuratedProofs handles a missing slug gracefully (skip row, don't crash)
  - Overview renders correctly when proof chain has 0 entries (empty stats strip, empty table)
  - RightRail visibility at exactly 1180px, 1181px viewports

## Dependencies

- Data files in `website/data/docs/` must exist (generated by `prebuild` script `tsx scripts/extract-docs-data.ts`).
- Phase 1 has no dependencies on other phases.

## Constraints

- Server components only — no `"use client"` for the 5 new overview components. Data loaders use `readFileSync` which only works in server components.
- No new data extraction. Use existing loaders: `getProofStats`, `getProofEntries`, `getAgentTemplates` (or `getAgentCount`), `getCommandCount`, `getSkillCount`, `getBuildMeta`.
- meta.json files use the Fumadocs schema: `{ "title": "...", "pages": ["slug1", "slug2"] }`. The `pages` array controls ordering. Folder names become group titles unless `title` overrides.

## Gotchas

- **Next.js route precedence:** `app/docs/page.tsx` takes precedence over `app/docs/[[...slug]]/page.tsx` for the bare `/docs` path. This is standard App Router behavior — explicit routes win over catch-alls. No special configuration needed.
- **Deleting `index.mdx` and sidebar:** After deleting `content/docs/index.mdx`, the sidebar entry for it should disappear. The root meta.json ordering should not reference it. If Fumadocs generates a page tree entry for it despite deletion, the build will fail — delete the file before adding meta.json.
- **RightRail class removal:** Only remove the Tailwind visibility classes (`hidden xl:block`). Keep `sticky top-[58px]`, `h-[calc(100vh-58px)]`, `w-[220px]`, `shrink-0`, `overflow-y-auto`, and the `docs-right-rail` class. The CSS handles visibility; Tailwind handles sizing.
- **Curated proof editorial descriptions:** The 6 editorial descriptions in CuratedProofs are static strings — they're curated copy, not data. The numeric data (assertions, findings, stage) comes from the data loader. Don't try to generate descriptions from proof data.
- **meta.json `pages` array:** Use the MDX filename without extension as the slug. For the root meta.json, folder names and page slugs can be mixed: `["start", "concepts", "guides"]`. For folder meta.json files: `["pipeline", "skills", "context", "toolbelt", "artifacts", "contract", "findings"]`.
- **Supermock terminal code blocks:** The supermock uses `<span class="tk-f">`, `<span class="tk-c">` etc. for colored terminal output. In production MDX, use plain text in `bash` fenced code blocks. Strip the span tags and keep the text content.

## Build Brief

### Rules That Apply
- Server components: no `"use client"` unless the component needs browser APIs. All 5 new overview components are server components.
- Tailwind for layout, CSS custom properties for theming. Follow the pattern in `StatsStrip.tsx` — `className` for layout, `style` for color tokens like `var(--fg-strong)`, `var(--ink-45)`.
- TypeScript interfaces for all component props. Named exports, no default exports.
- Links to internal pages use Next.js `Link` component. External links use `<a>` with `target="_blank" rel="noopener noreferrer"`.

### Pattern Extracts

**StatsStrip.tsx (component pattern — typed props, CSS vars, Tailwind layout):**
```tsx
// website/components/docs/content/StatsStrip.tsx lines 1-31
interface Stat {
  value: string;
  label: string;
}

interface StatsStripProps {
  items: Stat[];
}

export function StatsStrip({ items }: StatsStripProps) {
  return (
    <div className="my-8 flex flex-wrap gap-8">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col items-center gap-1">
          <span
            className="font-mono text-[24px] font-semibold"
            style={{ color: "var(--fg-strong)" }}
          >
            {item.value}
          </span>
          <span
            className="text-[12px]"
            style={{ color: "var(--ink-45)" }}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
```

**Data loader pattern (proofs.ts — readFileSync, cache, typed exports):**
```ts
// website/lib/docs-data/proofs.ts lines 1-36
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

**NextCards.tsx (card grid pattern — Link component, typed interface):**
```tsx
// website/components/docs/content/NextCards.tsx lines 1-14
import Link from "next/link";

interface CardData {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
}

interface NextCardsProps {
  cards: CardData[];
}

export function NextCards({ cards }: NextCardsProps) {
  return (
    <div className="my-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
```

### Proof Context

No active proof findings for affected files.

### Checkpoint Commands

- After bug fixes (Callout, RightRail, DocsNav, catch-all page.tsx): `cd website && pnpm build` — Expected: build succeeds with existing index.mdx page
- After all Phase 1 changes: `cd website && pnpm build` — Expected: build succeeds with overview page and quickstart page
- Lint: `cd website && pnpm lint`

### Build Baseline

- Current build: `pnpm build` succeeds (1 MDX page: index.mdx)
- After Phase 1: build succeeds with overview page + quickstart page (index.mdx deleted)
- Regression focus: `website/app/docs/[[...slug]]/page.tsx` (editUrl change), `website/components/docs/layout/RightRail.tsx` (class removal), `website/components/docs/content/Callout.tsx` (label addition)
