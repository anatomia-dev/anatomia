# Proof Chain Dashboard

99 runs · 87 active · 119 lessons · 0 promoted · 396 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 14 | 8 |
| packages/cli/tests/commands/work.test.ts | 6 | 6 |
| packages/cli/src/utils/worktree.ts | 5 | 3 |
| packages/cli/src/commands/proof.ts | 4 | 3 |
| website/lib/copy.ts | 4 | 3 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 87 total)

### packages/cli/src/commands/init/commit.ts

- **test:** No integration test for pull conflict abort path — *ana init commit — persist infrastructure to git*

### packages/cli/src/commands/work.ts

- **test:** Pull-recovery guards (2 of 5) not directly exercised by any test — *Fix --merge stdout pollution in --json mode*

### packages/cli/src/types/proof.ts

- **code:** commit_hygiene type duplicated in three locations (proof.ts, proofSummary.ts, work.ts inline) rather than imported from a shared definition — *Commit hygiene checks at build-report save*

### packages/cli/src/utils/proofSummary.ts

- **code:** Non-null assertion on missing verify phase — verifyPhases[i-1]! crashes if verify-report-(N-1) missing when build-report-N exists — *Fix pipeline timing accuracy for multi-phase and rejection cycles*

### packages/cli/src/utils/worktree.ts

- **code:** No timeout on spawnSync — hanging build command blocks worktree creation indefinitely — *Run build command during worktree creation*
- **code:** Empty string build command passes typeof guard and executes spawnSync('') — *Run build command during worktree creation*
- **code:** getBuildCommandString re-reads ana.json instead of receiving command from runBuildCommand — duplicate I/O with misleading 'pnpm run build' fallback — *Run build command during worktree creation*

### packages/cli/tests/commands/init/commit.test.ts

- **test:** Push failure test doesn't test push failure — tests push skip (no remote) — *ana init commit — persist infrastructure to git*

### packages/cli/tests/commands/work.test.ts

- **test:** Conditional PID guard makes 8 tests potential no-ops in environments where getClaudePid() returns null — *Capture actual think time from Ana session start*

### packages/cli/tests/commands/worktree-guards.test.ts

- **test:** A009 test only verifies cwd restoration, not process.exit or console spy cleanup — *Worktree Guard Integration Tests*
- **test:** Console and process.exit spies restored inline after assertions — leak on assertion failure — *Worktree Guard Integration Tests*
- **test:** A009 test is order-dependent — relies on running after the other describe blocks — *Worktree Guard Integration Tests*

### website/app/docs/[...slug]/page.tsx

- **code:** Dynamic components not registered in catch-all mdxComponents map — contract specifies registration but builder used build-time regex approach instead — *Docs Search + Polish*

### website/app/docs/[[...slug]]/page.tsx

- **code:** Prose classes used without @tailwindcss/typography installed — *Docs Infrastructure — Fumadocs MDX Pipeline*

### website/app/docs/reference/cli/page.tsx

- **code:** Hardcoded 'Last reviewed · 2026-05-11' in CLI reference page will become stale — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/content/TroubleCard.tsx

- **code:** TroubleCard has no aria/role attribute for accessibility — Callout uses role=note — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/layout/DocsErrorBoundary.tsx

- **code:** Lint error: DocsErrorBoundary uses <a> tag instead of Next.js <Link> for /docs/ navigation — *Docs Shell (Layout + Shared Components)*

### website/components/docs/layout/RightRail.tsx

- **code:** pageTitle and pageDescription props accepted by RightRail but never used in any rendering logic — *Docs Search + Polish*
- **code:** RightRail 'Download artifacts' and 'Open in Claude' links point to '#' — placeholder hrefs with no target — *Dynamic Pages — Reference & Proof Chain*
- **code:** Right rail responsive breakpoint mismatch — hidden from 1181-1279px where spec says visible above 1180px — *Docs Shell (Layout + Shared Components)*

### website/components/docs/proof/PipelineGantt.tsx

- **code:** formatDuration defined but unused in PipelineGantt — duration column uses raw `{value}m` instead — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/proof/ProofExplorer.tsx

- **code:** formatDuration duplicated in 4 files (ProofExplorer, ProofHero, PipelineGantt, detail page) — extract to shared utility — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/providers/PlatformProvider.tsx

- **code:** Lint error: PlatformProvider calls setState synchronously inside useEffect — violates react-hooks/set-state-in-effect rule — *Docs Shell (Layout + Shared Components)*

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
- **code:** Keyword fallback categorization lacks word boundaries — 'scannable' matches /scan/, misassigning proof entries to Engine — *Docs Data Pipeline*

