# Proof Chain Dashboard

102 runs · 74 active · 122 lessons · 3 promoted · 416 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 14 | 9 |
| packages/cli/tests/commands/work.test.ts | 5 | 5 |
| packages/cli/src/utils/worktree.ts | 5 | 3 |
| website/lib/copy.ts | 4 | 3 |
| website/scripts/extract-docs-data.ts | 4 | 2 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 74 total)

### packages/cli/src/commands/init/commit.ts

- **test:** No integration test for pull conflict abort path — *ana init commit — persist infrastructure to git*

### packages/cli/src/commands/work.ts

- **code:** Two different result parsers with different casing: getVerifyResult returns 'unknown' (lowercase), parseResult in proofSummary returns 'UNKNOWN' (uppercase) — works correctly but fragile coupling between two parallel implementations — *work.ts untested branch coverage*
- **test:** Pull-recovery guards (2 of 5) not directly exercised by any test — *Fix --merge stdout pollution in --json mode*
- **code:** printExistingWorktree duplicates commitsBehind rev-list logic from getWorktreeInfo — now two inline computations duplicated instead of one — *Worktree freshness detection*

### packages/cli/src/types/proof.ts

- **code:** commit_hygiene type duplicated in three locations (proof.ts, proofSummary.ts, work.ts inline) rather than imported from a shared definition — *Commit hygiene checks at build-report save*

### packages/cli/src/utils/worktree.ts

- **code:** No timeout on spawnSync — hanging build command blocks worktree creation indefinitely — *Run build command during worktree creation*
- **code:** Empty string build command passes typeof guard and executes spawnSync('') — *Run build command during worktree creation*
- **code:** getBuildCommandString re-reads ana.json instead of receiving command from runBuildCommand — duplicate I/O with misleading 'pnpm run build' fallback — *Run build command during worktree creation*

### packages/cli/tests/commands/init/commit.test.ts

- **test:** Push failure test doesn't test push failure — tests push skip (no remote) — *ana init commit — persist infrastructure to git*

### packages/cli/tests/commands/work.test.ts

- **test:** Conflict test creates bareDir and cloneDir as siblings of tempDir — afterEach only cleans tempDir, so these directories leak on each test run — *work.ts untested branch coverage*
- **test:** Conditional PID guard makes 8 tests potential no-ops in environments where getClaudePid() returns null — *Capture actual think time from Ana session start*

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
- **code:** Right rail responsive breakpoint mismatch — hidden from 1181-1279px where spec says visible above 1180px — *Docs Shell (Layout + Shared Components)*

### website/components/docs/proof/FindingsList.tsx

- **code:** Badge opacity 0.75 persists when interactive — reduces contrast for clickable element, potential a11y concern — *FindingsList expand/collapse for proof pages*

### website/components/docs/proof/PipelineGantt.tsx

- **code:** formatDuration defined but unused in PipelineGantt — duration column uses raw `{value}m` instead — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/proof/ProofExplorer.tsx

- **code:** formatDuration duplicated in 4 files (ProofExplorer, ProofHero, PipelineGantt, detail page) — extract to shared utility — *Dynamic Pages — Reference & Proof Chain*

### website/components/docs/providers/PlatformProvider.tsx

- **code:** Lint error: PlatformProvider calls setState synchronously inside useEffect — violates react-hooks/set-state-in-effect rule — *Docs Shell (Layout + Shared Components)*

### website/content/docs/concepts/skills.mdx

- **code:** Skills page inline-links 8 individual skill reference pages that don't exist and aren't scoped in any phase — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/content/docs/guides/verifying-changes.mdx

- **code:** Stale dynamic-value comment in verifying-changes and troubleshooting — says 17 of 78 proofs but real count may differ — *Content Pages — 16 editorial docs pages with bug fixes and sidebar ordering*

### website/scripts/extract-docs-data.ts

- **code:** LLMS_SECTIONS constant declared but never used in extract-docs-data.ts — *Docs Search + Polish*
- **code:** Unused variable 'other' in generateLlmsTxt — pages filtered but remainder never referenced — *Docs Search + Polish*
- **code:** Duplicate stripJsx implementation — one in website/lib/docs-data/stripJsx.ts, another inlined in extract-docs-data.ts — *Docs Search + Polish*
- **code:** Keyword fallback categorization lacks word boundaries — 'scannable' matches /scan/, misassigning proof entries to Engine — *Docs Data Pipeline*

### General

- **code:** URL reachability not verified — stable URL contract is a deployment assumption — *Documentation links in init and setup*
- **test:** Contract assertions A013-A019 have no tagged tests — verified by source inspection only — *Kind-aware branch prefixes*

