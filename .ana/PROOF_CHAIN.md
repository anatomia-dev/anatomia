# Proof Chain Dashboard

92 runs · 284 active · 113 lessons · 0 promoted · 162 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 22 | 12 |
| packages/cli/tests/commands/work.test.ts | 20 | 15 |
| packages/cli/tests/commands/proof.test.ts | 11 | 5 |
| packages/cli/src/commands/artifact.ts | 10 | 6 |
| packages/cli/src/utils/proofSummary.ts | 10 | 8 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 284 total)

### packages/cli/src/commands/artifact.ts

- **code:** writeSaveMetadata export scope widened for tests — only consumed by test files, widens module public API — *Fix pipeline timing accuracy for multi-phase and rejection cycles*
- **code:** Unbounded history array growth — each rejection cycle appends with no cap — *Fix pipeline timing accuracy for multi-phase and rejection cycles*

### packages/cli/src/utils/proofSummary.ts

- **code:** Non-null assertion on missing verify phase — verifyPhases[i-1]! crashes if verify-report-(N-1) missing when build-report-N exists — *Fix pipeline timing accuracy for multi-phase and rejection cycles*

### packages/cli/tests/utils/proofSummary.test.ts

- **test:** A019 asserts on source code content — reads proofSummary.ts and checks string patterns instead of behavioral assertion — *Fix pipeline timing accuracy for multi-phase and rejection cycles*

### website/app/docs/[...slug]/page.tsx

- **code:** Dynamic components not registered in catch-all mdxComponents map — contract specifies registration but builder used build-time regex approach instead — *Docs Search + Polish*
- **code:** Catch-all route renamed from [[...slug]] to [...slug] — not specified in spec but necessary — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/app/docs/docs.css

- **code:** docs-content-full CSS class added in Phase 1 but only used by Phase 2 explorer — harmless dead code until Phase 2 ships — *Dynamic Pages — Reference & Proof Chain*
- **code:** Reference grid responsive collapse only at 660px — no intermediate 2-col→1-col at 880px. Supermock shows collapse at 660px so this matches, but the spec text mentions 1180px and 880px rules — *Dynamic Pages — Reference & Proof Chain*

### website/app/docs/page.tsx

- **code:** Stats strip has 5 items (added MIT/free forever) vs spec mockup showing 4 — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/app/docs/reference/cli/page.tsx

- **code:** Hardcoded 'Last reviewed · 2026-05-11' in CLI reference page will become stale — *Dynamic Pages — Reference & Proof Chain*

### website/app/globals.css

- **code:** globals.css modified to add --brand-light and --info CSS variables — not in spec file_changes — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/content/Callout.tsx

- **code:** Callout label stores titlecase (Rule/Note), relies on CSS text-transform for uppercase display — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/content/DocsGrid.tsx

- **code:** DocsGrid component created but not in spec file_changes — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/content/ResourceStrip.tsx

- **code:** ResourceStrip uses <a> for Manifesto link (internal anatomia.dev URL) instead of Next.js Link — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/layout/RightRail.tsx

- **code:** pageTitle and pageDescription props accepted by RightRail but never used in any rendering logic — *Docs Search + Polish*
- **code:** Clipboard API failure silently swallowed — no user feedback when writeText fails on insecure context — *Docs Search + Polish*
- **code:** RightRail 'Download artifacts' and 'Open in Claude' links point to '#' — placeholder hrefs with no target — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/layout/SearchOverlay.tsx

- **code:** Search index fetched on every overlay open without cache invalidation awareness — 69KB JSON loaded client-side — *Docs Search + Polish*

### website/components/docs/proof/FindingsList.tsx

- **code:** FindingsList shows max 5 findings with no toggle to expand — AssertionLedger has expand/collapse but FindingsList truncates permanently — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/proof/IntegritySeal.tsx

- **code:** IntegritySeal last hash row retains bottom border — CSS rule `.integ-row:last-child { border-bottom: 0 }` from supermock not applied since rows use inline styles — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/proof/PipelineGantt.tsx

- **code:** formatDuration defined but unused in PipelineGantt — duration column uses raw `{value}m` instead — *Dynamic Pages — Reference & Proof Chain*
- **code:** PipelineGantt left-offset uses Math.round per-stage — cumulative rounding can exceed 100% and cause visual overflow on entries with many small stages — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/proof/ProofExplorer.tsx

- **code:** formatDuration duplicated in 4 files (ProofExplorer, ProofHero, PipelineGantt, detail page) — extract to shared utility — *Dynamic Pages — Reference & Proof Chain*
- **code:** ProofExplorer inline styles heavily duplicated across 7 column headers — same 9-property object repeated per th element — *Dynamic Pages — Reference & Proof Chain*

### website/content/docs/concepts/pipeline.mdx

- **code:** pipeline.mdx rejectionProofCount stale (17 vs 19) — regex marker placement broken, extra text between value and ana:dynamic comment — *Docs Search + Polish*

### website/scripts/extract-docs-data.ts

- **code:** LLMS_SECTIONS constant declared but never used in extract-docs-data.ts — *Docs Search + Polish*
- **code:** Unused variable 'other' in generateLlmsTxt — pages filtered but remainder never referenced — *Docs Search + Polish*
- **code:** Duplicate stripJsx implementation — one in website/lib/docs-data/stripJsx.ts, another inlined in extract-docs-data.ts — *Docs Search + Polish*
- **code:** Variable shadowing in extractSkillTemplates — inner 'content' (line 584) shadows outer 'content' (line 566), latent confusion risk — *Dynamic Pages — Reference & Proof Chain*

### General

- **test:** No unit tests for any new components — build verification is pnpm build only — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

