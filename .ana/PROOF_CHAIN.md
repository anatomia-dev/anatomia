# Proof Chain Dashboard

89 runs · 261 active · 110 lessons · 0 promoted · 161 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 22 | 12 |
| packages/cli/tests/commands/work.test.ts | 20 | 15 |
| packages/cli/tests/commands/proof.test.ts | 11 | 5 |
| website/lib/proof-feed.ts | 10 | 3 |
| packages/cli/tests/commands/artifact.test.ts | 9 | 5 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 261 total)

### website/app/docs/[...slug]/page.tsx

- **code:** Catch-all route renamed from [[...slug]] to [...slug] — not specified in spec but necessary — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/app/docs/[[...slug]]/page.tsx

- **code:** Prose classes used without @tailwindcss/typography installed — *Docs Infrastructure — Fumadocs MDX Pipeline*

### website/app/docs/layout.tsx

- **code:** data-hide-rail attribute from spec not implemented — prep mechanism for future proof-explorer route — *Docs Shell (Layout + Shared Components)*

### website/app/docs/page.tsx

- **code:** Stats strip has 5 items (added MIT/free forever) vs spec mockup showing 4 — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/app/globals.css

- **code:** globals.css modified to add --brand-light and --info CSS variables — not in spec file_changes — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/content/Callout.tsx

- **code:** Callout label stores titlecase (Rule/Note), relies on CSS text-transform for uppercase display — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*
- **code:** Callout label renders 'Rule' with CSS uppercase — contract A020 expects literal 'RULE'. Visually correct but DOM text differs from contract value. — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/content/CopyButton.tsx

- **code:** CopyButton uses inline event handlers for hover styles instead of CSS — fragile pattern, state survives re-renders differently than CSS hover — *Docs Shell (Layout + Shared Components)*

### website/components/docs/content/DocsGrid.tsx

- **code:** DocsGrid component created but not in spec file_changes — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/content/ResourceStrip.tsx

- **code:** ResourceStrip uses <a> for Manifesto link (internal anatomia.dev URL) instead of Next.js Link — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/content/TroubleCard.tsx

- **code:** TroubleCard has no aria/role attribute for accessibility — Callout uses role=note — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*
- **test:** No unit tests for TroubleCard component — only verified via build compilation — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/layout/DocsErrorBoundary.tsx

- **code:** Lint error: DocsErrorBoundary uses <a> tag instead of Next.js <Link> for /docs/ navigation — *Docs Shell (Layout + Shared Components)*

### website/components/docs/layout/PlatformSwitcher.tsx

- **code:** PlatformSwitcher labelMap duplicates data already in platforms array — two sources of truth for platform labels — *Docs Shell (Layout + Shared Components)*

### website/components/docs/layout/RightRail.tsx

- **code:** Right rail responsive breakpoint mismatch — hidden from 1181-1279px where spec says visible above 1180px — *Docs Shell (Layout + Shared Components)*

### website/components/docs/layout/Sidebar.tsx

- **code:** Sidebar md:block (768px) is redundant — overridden by docs.css @media (max-width: 880px) with !important — *Docs Shell (Layout + Shared Components)*

### website/components/docs/providers/PlatformProvider.tsx

- **code:** Lint error: PlatformProvider calls setState synchronously inside useEffect — violates react-hooks/set-state-in-effect rule — *Docs Shell (Layout + Shared Components)*

### website/content/docs/concepts/context.mdx

- **code:** Context page links to /docs/reference/context twice — page doesn't exist and isn't scoped — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/content/docs/concepts/pipeline.mdx

- **code:** Dynamic value comments use {/* Dynamic: update on data change */} but there's no grep-friendly tag to find them at update time — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/content/docs/concepts/skills.mdx

- **code:** Skills page inline-links 8 individual skill reference pages that don't exist and aren't scoped in any phase — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/content/docs/guides/using-ana-setup.mdx

- **code:** NextCards link to unbuilt reference/proof pages — will 404 until Scope 5 — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/content/docs/guides/verifying-changes.mdx

- **code:** Stale dynamic-value comment in verifying-changes and troubleshooting — says 17 of 78 proofs but real count may differ — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/lib/docs-data/index.ts

- **code:** All 13 exported loader functions and 14 types are unused — no page components import from docs-data yet — *Docs Data Pipeline*

### website/lib/docs-data/proofs.ts

- **code:** No JSDoc on exported loader functions — inconsistent with CLI package coding standards, though website eslint doesn't enforce it — *Docs Data Pipeline*
- **code:** process.cwd() in loader DATA_PATH assumes Next.js runs from website/ root — correct for Next.js build, fragile if loaders are ever called from tests or scripts — *Docs Data Pipeline*

### website/scripts/extract-docs-data.ts

- **code:** Keyword fallback categorization lacks word boundaries — 'scannable' matches /scan/, misassigning proof entries to Engine — *Docs Data Pipeline*
- **code:** Variable shadowing in extractSkillTemplates — inner 'content' shadows outer 'content' in same function — *Docs Data Pipeline*

### General

- **test:** No unit tests for any new components — build verification is pnpm build only — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*
- **code:** NextCards link to 6 pages that don't exist yet (guides, reference, proof) — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*
- **test:** No tests exist for website package — all 31 assertions verified by source inspection only. No regression safety net for component behavior. — *Docs Shell (Layout + Shared Components)*

