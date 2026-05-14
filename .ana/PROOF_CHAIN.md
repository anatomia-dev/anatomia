# Proof Chain Dashboard

96 runs · 251 active · 117 lessons · 0 promoted · 221 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 19 | 10 |
| packages/cli/tests/commands/work.test.ts | 14 | 11 |
| packages/cli/src/utils/worktree.ts | 11 | 6 |
| packages/cli/src/commands/artifact.ts | 10 | 6 |
| packages/cli/src/utils/proofSummary.ts | 9 | 8 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 251 total)

### packages/cli/src/commands/artifact.ts

- **code:** CommitHygieneFinding and runCommitHygieneChecks exported for test access — widens module public API — *Commit hygiene checks at build-report save*
- **code:** Secret scan reads full file content for every non-test file in modules_touched — large binary files or generated bundles would be read entirely into memory — *Commit hygiene checks at build-report save*

### packages/cli/src/types/proof.ts

- **code:** commit_hygiene type duplicated in three locations (proof.ts, proofSummary.ts, work.ts inline) rather than imported from a shared definition — *Commit hygiene checks at build-report save*

### packages/cli/src/utils/worktree.ts

- **code:** No timeout on spawnSync — hanging build command blocks worktree creation indefinitely — *Run build command during worktree creation*
- **code:** Empty string build command passes typeof guard and executes spawnSync('') — *Run build command during worktree creation*
- **code:** getBuildCommandString re-reads ana.json instead of receiving command from runBuildCommand — duplicate I/O with misleading 'pnpm run build' fallback — *Run build command during worktree creation*
- **code:** getBuildCommandString fallback 'pnpm run build' is unreachable in practice — dead code path — *Run build command during worktree creation*

### packages/cli/tests/commands/commit-hygiene.test.ts

- **test:** A002 test is tautological — verifies key absence without calling the function, not the gating conditional — *Commit hygiene checks at build-report save*
- **test:** A017 uses toHaveProperty (existence) instead of asserting specific values — passes on any object shape — *Commit hygiene checks at build-report save*
- **test:** A019 is type-level only — verifies ProofChainEntry accepts commit_hygiene, not that writeProofChain actually reads and writes it — *Commit hygiene checks at build-report save*
- **test:** A024 tests the same function call as A001 — doesn't exercise saveAllArtifacts code path, just calls runCommitHygieneChecks directly — *Commit hygiene checks at build-report save*

### packages/cli/tests/commands/work.test.ts

- **test:** Conditional PID guard makes 8 tests potential no-ops in environments where getClaudePid() returns null — *Capture actual think time from Ana session start*
- **test:** A015 reads source code instead of testing runtime behavior — pragmatic for Commander registration — *Capture actual think time from Ana session start*
- **test:** A008 ordering verified by inspection only — no test enforces delete-before-use sequence — *Capture actual think time from Ana session start*

### packages/cli/tests/utils/proofSummary.test.ts

- **test:** Gantt bar assertions (A014-A018, A022) test a re-implemented copy of buildGanttBars, not the production function in PipelineGantt.tsx — *Multi-phase Gantt visualization for proof timeline*

### packages/cli/tests/utils/worktree.test.ts

- **test:** A010 assertion uses toContain('## Build Status') — confirms heading exists but not that content follows the spec mockup format — *Run build command during worktree creation*
- **test:** A008 uses toBeDefined() for depsInstalled — weaker than contract's 'exists' intent, passes even if value is false — *Run build command during worktree creation*

### website/app/docs/[...slug]/page.tsx

- **code:** Dynamic components not registered in catch-all mdxComponents map — contract specifies registration but builder used build-time regex approach instead — *Docs Search + Polish*

### website/app/docs/proof/[slug]/page.tsx

- **code:** Multi-phase timeline text derives phase count via Math.max on filtered segments — works correctly but couples rendering to segment internals when entry.phases field exists for this purpose — *Multi-phase Gantt visualization for proof timeline*

### website/components/docs/layout/RightRail.tsx

- **code:** pageTitle and pageDescription props accepted by RightRail but never used in any rendering logic — *Docs Search + Polish*
- **code:** Clipboard API failure silently swallowed — no user feedback when writeText fails on insecure context — *Docs Search + Polish*

### website/components/docs/proof/PipelineGantt.tsx

- **code:** buildGanttBars and GanttBar exported from PipelineGantt.tsx but never imported — YAGNI exports for potential cross-package testing that doesn't happen — *Multi-phase Gantt visualization for proof timeline*
- **code:** OPACITY_MAP duplicates opacity values already in STAGES array — two sources of truth for the same constants — *Multi-phase Gantt visualization for proof timeline*
- **code:** 60px label column may be tight for 'VERIFY 3' at 10.5px mono with 0.06em letter-spacing — fits now but fragile for higher phase counts — *Multi-phase Gantt visualization for proof timeline*

### website/content/docs/concepts/pipeline.mdx

- **code:** pipeline.mdx rejectionProofCount stale (17 vs 19) — regex marker placement broken, extra text between value and ana:dynamic comment — *Docs Search + Polish*

### website/scripts/extract-docs-data.ts

- **code:** LLMS_SECTIONS constant declared but never used in extract-docs-data.ts — *Docs Search + Polish*
- **code:** Unused variable 'other' in generateLlmsTxt — pages filtered but remainder never referenced — *Docs Search + Polish*
- **code:** Duplicate stripJsx implementation — one in website/lib/docs-data/stripJsx.ts, another inlined in extract-docs-data.ts — *Docs Search + Polish*

### General

- **test:** A013 (phases population) and A021 (extraction passthrough) have no tagged tests — verified by source inspection only — *Multi-phase Gantt visualization for proof timeline*
- **code:** Website content files updated with dynamic proof counts (90→93, 19→21) — not in spec but harmless build-time content refresh — *Multi-phase Gantt visualization for proof timeline*

