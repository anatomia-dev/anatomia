# Proof Chain Dashboard

96 runs · 137 active · 117 lessons · 0 promoted · 335 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 15 | 8 |
| packages/cli/tests/commands/work.test.ts | 11 | 9 |
| packages/cli/tests/commands/proof.test.ts | 8 | 4 |
| packages/cli/tests/commands/artifact.test.ts | 7 | 4 |
| packages/cli/src/commands/proof.ts | 6 | 4 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 137 total)

### packages/cli/src/commands/artifact.ts

- **code:** Unbounded history array growth — each rejection cycle appends with no cap — *Fix pipeline timing accuracy for multi-phase and rejection cycles*

### packages/cli/src/types/proof.ts

- **code:** commit_hygiene type duplicated in three locations (proof.ts, proofSummary.ts, work.ts inline) rather than imported from a shared definition — *Commit hygiene checks at build-report save*

### packages/cli/src/utils/proofSummary.ts

- **code:** Non-null assertion on missing verify phase — verifyPhases[i-1]! crashes if verify-report-(N-1) missing when build-report-N exists — *Fix pipeline timing accuracy for multi-phase and rejection cycles*

### packages/cli/src/utils/worktree.ts

- **code:** No timeout on spawnSync — hanging build command blocks worktree creation indefinitely — *Run build command during worktree creation*
- **code:** Empty string build command passes typeof guard and executes spawnSync('') — *Run build command during worktree creation*
- **code:** getBuildCommandString re-reads ana.json instead of receiving command from runBuildCommand — duplicate I/O with misleading 'pnpm run build' fallback — *Run build command during worktree creation*

### packages/cli/tests/commands/commit-hygiene.test.ts

- **test:** A002 test is tautological — verifies key absence without calling the function, not the gating conditional — *Commit hygiene checks at build-report save*
- **test:** A017 uses toHaveProperty (existence) instead of asserting specific values — passes on any object shape — *Commit hygiene checks at build-report save*

### packages/cli/tests/commands/work.test.ts

- **test:** Conditional PID guard makes 8 tests potential no-ops in environments where getClaudePid() returns null — *Capture actual think time from Ana session start*
- **test:** A008 ordering verified by inspection only — no test enforces delete-before-use sequence — *Capture actual think time from Ana session start*

### packages/cli/tests/utils/proofSummary.test.ts

- **test:** Gantt bar assertions (A014-A018, A022) test a re-implemented copy of buildGanttBars, not the production function in PipelineGantt.tsx — *Multi-phase Gantt visualization for proof timeline*

### website/app/docs/[...slug]/page.tsx

- **code:** Dynamic components not registered in catch-all mdxComponents map — contract specifies registration but builder used build-time regex approach instead — *Docs Search + Polish*

### website/app/docs/reference/cli/page.tsx

- **code:** Hardcoded 'Last reviewed · 2026-05-11' in CLI reference page will become stale — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/content/ResourceStrip.tsx

- **code:** ResourceStrip uses <a> for Manifesto link (internal anatomia.dev URL) instead of Next.js Link — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/content/TroubleCard.tsx

- **code:** TroubleCard has no aria/role attribute for accessibility — Callout uses role=note — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/layout/DocsErrorBoundary.tsx

- **code:** Lint error: DocsErrorBoundary uses <a> tag instead of Next.js <Link> for /docs/ navigation — *Docs Shell (Layout + Shared Components)*

### website/components/docs/layout/RightRail.tsx

- **code:** pageTitle and pageDescription props accepted by RightRail but never used in any rendering logic — *Docs Search + Polish*
- **code:** RightRail 'Download artifacts' and 'Open in Claude' links point to '#' — placeholder hrefs with no target — *Dynamic Pages — Reference & Proof Chain*
- **code:** Right rail responsive breakpoint mismatch — hidden from 1181-1279px where spec says visible above 1180px — *Docs Shell (Layout + Shared Components)*

### website/components/docs/proof/FindingsList.tsx

- **code:** FindingsList shows max 5 findings with no toggle to expand — AssertionLedger has expand/collapse but FindingsList truncates permanently — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/proof/PipelineGantt.tsx

- **code:** OPACITY_MAP duplicates opacity values already in STAGES array — two sources of truth for the same constants — *Multi-phase Gantt visualization for proof timeline*
- **code:** formatDuration defined but unused in PipelineGantt — duration column uses raw `{value}m` instead — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/proof/ProofExplorer.tsx

- **code:** formatDuration duplicated in 4 files (ProofExplorer, ProofHero, PipelineGantt, detail page) — extract to shared utility — *Dynamic Pages — Reference & Proof Chain*
- **code:** ProofExplorer inline styles heavily duplicated across 7 column headers — same 9-property object repeated per th element — *Dynamic Pages — Reference & Proof Chain*

### website/content/docs/concepts/pipeline.mdx

- **code:** pipeline.mdx rejectionProofCount stale (17 vs 19) — regex marker placement broken, extra text between value and ana:dynamic comment — *Docs Search + Polish*

### website/content/docs/concepts/skills.mdx

- **code:** Skills page inline-links 8 individual skill reference pages that don't exist and aren't scoped in any phase — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/content/docs/guides/verifying-changes.mdx

- **code:** Stale dynamic-value comment in verifying-changes and troubleshooting — says 17 of 78 proofs but real count may differ — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/scripts/extract-docs-data.ts

- **code:** LLMS_SECTIONS constant declared but never used in extract-docs-data.ts — *Docs Search + Polish*
- **code:** Unused variable 'other' in generateLlmsTxt — pages filtered but remainder never referenced — *Docs Search + Polish*
- **code:** Duplicate stripJsx implementation — one in website/lib/docs-data/stripJsx.ts, another inlined in extract-docs-data.ts — *Docs Search + Polish*

