# Proof Chain Dashboard

105 runs · 47 active · 128 lessons · 3 promoted · 451 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 9 | 6 |
| website/components/docs/proof/PipelineGantt.tsx | 4 | 2 |
| packages/cli/tests/commands/artifact.test.ts | 3 | 2 |
| packages/cli/tests/commands/work.test.ts | 3 | 3 |
| packages/cli/tests/commands/proof.test.ts | 2 | 2 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 47 total)

### packages/cli/src/commands/init/commit.ts

- **test:** No integration test for pull conflict abort path — *ana init commit — persist infrastructure to git*

### packages/cli/src/commands/work.ts

- **code:** Two different result parsers with different casing: getVerifyResult returns 'unknown' (lowercase), parseResult in proofSummary returns 'UNKNOWN' (uppercase) — works correctly but fragile coupling between two parallel implementations — *work.ts untested branch coverage*
- **test:** Pull-recovery guards (2 of 5) not directly exercised by any test — *Fix --merge stdout pollution in --json mode*
- **code:** printExistingWorktree duplicates commitsBehind rev-list logic from getWorktreeInfo — now two inline computations duplicated instead of one — *Worktree freshness detection*
- **code:** printExistingWorktree duplicates HEAD-reading logic from getWorktreeInfo — same pattern in two places — *Kind-aware branch prefixes*

### packages/cli/src/types/proof.ts

- **code:** commit_hygiene type duplicated in three locations (proof.ts, proofSummary.ts, work.ts inline) rather than imported from a shared definition — *Commit hygiene checks at build-report save*

### packages/cli/src/utils/worktree.ts

- **code:** getBuildCommandString re-reads ana.json instead of receiving command from runBuildCommand — duplicate I/O with misleading 'pnpm run build' fallback — *Run build command during worktree creation*

### packages/cli/tests/commands/init/commit.test.ts

- **test:** Push failure test doesn't test push failure — tests push skip (no remote) — *ana init commit — persist infrastructure to git*

### packages/cli/tests/commands/work-ci-mocked.test.ts

- **test:** Broad mock intercept matches any git command with 'pull' in args, not specifically 'git pull --rebase' — *Fix CI Matrix and Broken Tests*
- **code:** createMergedProject duplicated between work-ci-mocked.test.ts and work.test.ts — both have independent copies with different mock routing — *Fix CI Matrix and Broken Tests*
- **test:** A004 assertion uses toBeGreaterThan(0) for exit call count instead of toBe(1) — passes even if process.exit is called multiple times — *Fix CI Matrix and Broken Tests*

### packages/cli/tests/commands/work.test.ts

- **test:** Conditional PID guard makes 8 tests potential no-ops in environments where getClaudePid() returns null — *Capture actual think time from Ana session start*

### website/app/docs/reference/cli/page.tsx

- **code:** Hardcoded 'Last reviewed · 2026-05-11' in CLI reference page will become stale — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/content/TroubleCard.tsx

- **code:** TroubleCard has no aria/role attribute for accessibility — Callout uses role=note — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/components/docs/layout/RightRail.tsx

- **code:** pageTitle and pageDescription props accepted by RightRail but never used in any rendering logic — *Docs Search + Polish*

### website/components/docs/proof/FindingsList.tsx

- **code:** Badge opacity 0.75 persists when interactive — reduces contrast for clickable element, potential a11y concern — *FindingsList expand/collapse for proof pages*

### website/components/docs/proof/PipelineGantt.tsx

- **code:** Negative phase values display raw in bar label while bar width is clamped — *Fix Gantt Bar Distortion and Document Timing*
- **code:** buildGanttBars and GanttBar exported but only consumed within PipelineGantt.tsx — *Fix Gantt Bar Distortion and Document Timing*
- **code:** Zero-duration bars get minimum 2% width that can push cumulative past 100% if many zero-duration phases exist — *Fix Gantt Bar Distortion and Document Timing*
- **code:** formatDuration defined but unused in PipelineGantt — duration column uses raw `{value}m` instead — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/proof/ProofExplorer.tsx

- **code:** formatDuration duplicated in 4 files (ProofExplorer, ProofHero, PipelineGantt, detail page) — extract to shared utility — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/providers/PlatformProvider.tsx

- **code:** Lint error: PlatformProvider calls setState synchronously inside useEffect — violates react-hooks/set-state-in-effect rule — *Docs Shell (Layout + Shared Components)*

### website/content/docs/concepts/skills.mdx

- **code:** Skills page inline-links 8 individual skill reference pages that don't exist and aren't scoped in any phase — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/scripts/extract-docs-data.ts

- **code:** LLMS_SECTIONS constant declared but never used in extract-docs-data.ts — *Docs Search + Polish*
- **code:** Unused variable 'other' in generateLlmsTxt — pages filtered but remainder never referenced — *Docs Search + Polish*
- **code:** Duplicate stripJsx implementation — one in website/lib/docs-data/stripJsx.ts, another inlined in extract-docs-data.ts — *Docs Search + Polish*

### General

- **code:** Dynamic stat markers (ana:dynamic) updated as prebuild side effect — pipeline.mdx, reading-a-proof.mdx, using-ana-learn.mdx, verifying-changes.mdx, start.mdx, troubleshooting.mdx all have updated proof counts (90->103, 19->21 rejections). These are correct but outside the spec's file_changes list. — *Bump Node Minimum to 22, Add Node 24 to CI*
- **code:** Lint warning (pre-existing): unused eslint-disable directive for no-control-regex. Not introduced by this build. — *Bump Node Minimum to 22, Add Node 24 to CI*
- **code:** URL reachability not verified — stable URL contract is a deployment assumption — *Documentation links in init and setup*
- **test:** Contract assertions A013-A019 have no tagged tests — verified by source inspection only — *Kind-aware branch prefixes*

