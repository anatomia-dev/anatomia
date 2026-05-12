# Proof Chain Dashboard

87 runs · 237 active · 105 lessons · 0 promoted · 161 closed

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

## Active Findings (30 shown of 237 total)

### packages/cli/src/commands/pr.ts

- **code:** pr.ts fetch adds network latency to every PR creation — no timeout or skip mechanism — *Worktree freshness detection*

### packages/cli/src/commands/work.ts

- **code:** --autostash bypasses content-match guard for tracked dirty planning artifacts — theoretical gap remains — *Hygiene debt cleanup*
- **code:** printExistingWorktree duplicates commitsBehind rev-list logic from getWorktreeInfo — now two inline computations duplicated instead of one — *Worktree freshness detection*
- **code:** getWorkBranch glob pattern `*${slug}` may over-match for short slugs (e.g., slug 'fix' matches all branches containing 'fix') — *Kind-aware branch prefixes*
- **code:** printExistingWorktree duplicates HEAD-reading logic from getWorktreeInfo — same pattern in two places — *Kind-aware branch prefixes*
- **code:** startWork resume path at line 1685 also duplicates HEAD-reading pattern — three places total read HEAD for branch name — *Kind-aware branch prefixes*

### packages/cli/src/engine/detectors/git.ts

- **test:** A004 and A005 are source-inspection-only assertions — no behavioral test verifies the regex actually strips + markers in git.ts (only work.ts path is integration-tested) — *Fix worktree branch parsing*
- **test:** Integration test covers work.ts parsing path end-to-end but git.ts detectBranches is not exercised by any new test — the fix is verified only by source inspection — *Fix worktree branch parsing*

### packages/cli/src/utils/worktree.ts

- **code:** commitsBehind uses origin/artifactBranch but commitCount uses bare artifactBranch — asymmetric ref comparison — *Worktree freshness detection*
- **code:** Detached HEAD produces branchName '(unknown)' — rev-list and log commands will fail silently, showing 0 commits and 0 days — *Kind-aware branch prefixes*

### packages/cli/tests/commands/work.test.ts

- **test:** planningOnlyInMerge flag improves test fidelity — now models real production scenario of untracked artifacts — *Hygiene debt cleanup*
- **test:** No dedicated @ana tag for A003 — existing test satisfies the assertion but is tagged @ana A010 from a prior contract — *Fix worktree branch parsing*
- **code:** No mutual exclusion between featureBranch and worktree options in createWorkTestProject — setting both creates branch via checkout then fails on worktree add — *Fix worktree branch parsing*
- **test:** A008 JSON test asserts typeof === 'number' not a specific value — passes even if commitsBehind computation is broken — *Worktree freshness detection*

### packages/cli/tests/utils/git-operations.test.ts

- **test:** Contract A001 has no tagged test for this contract — relies on pre-existing test from previous build — *Kind-aware branch prefixes*

### packages/cli/tests/utils/worktree.test.ts

- **test:** A005 git failure test relies on absent origin/main ref rather than injecting a failure — indirect coverage of the catch path — *Worktree freshness detection*

### website/app/docs/[[...slug]]/page.tsx

- **code:** Prose classes used without @tailwindcss/typography installed — *Docs Infrastructure — Fumadocs MDX Pipeline*

### website/app/docs/layout.tsx

- **code:** No error boundary in docs layout — broken MDX crashes entire docs section — *Docs Infrastructure — Fumadocs MDX Pipeline*

### website/components/docs/

- **code:** Empty components/docs directory left after deleting 4 component files — *Docs Infrastructure — Fumadocs MDX Pipeline*

### website/eslint.config.mjs

- **code:** eslint.config.mjs modified to ignore .source — not in spec file_changes — *Docs Infrastructure — Fumadocs MDX Pipeline*

### website/lib/docs-data/index.ts

- **code:** All 13 exported loader functions and 14 types are unused — no page components import from docs-data yet — *Docs Data Pipeline*

### website/lib/docs-data/proofs.ts

- **code:** No JSDoc on exported loader functions — inconsistent with CLI package coding standards, though website eslint doesn't enforce it — *Docs Data Pipeline*
- **code:** process.cwd() in loader DATA_PATH assumes Next.js runs from website/ root — correct for Next.js build, fragile if loaders are ever called from tests or scripts — *Docs Data Pipeline*

### website/lib/source.ts

- **code:** Page tree injections for Reference and Proof Chain omitted from source loader — *Docs Infrastructure — Fumadocs MDX Pipeline*

### website/scripts/extract-docs-data.ts

- **code:** Keyword fallback categorization lacks word boundaries — 'scannable' matches /scan/, misassigning proof entries to Engine — *Docs Data Pipeline*
- **code:** Variable shadowing in extractSkillTemplates — inner 'content' shadows outer 'content' in same function — *Docs Data Pipeline*

### website/source.config.ts

- **code:** Frontmatter schema allows empty strings — z.string() without .min(1) — *Docs Infrastructure — Fumadocs MDX Pipeline*

### General

- **code:** Audit reduced from 20 to 12, not 0 — remaining 12 are postcss dev-only transitives awaiting upstream fix — *Hygiene debt cleanup*
- **test:** No tagged tests for A009, A010, A011, A012, A013, A014 — verified by source inspection only — *Worktree freshness detection*
- **test:** Contract assertions A013-A019 have no tagged tests — verified by source inspection only — *Kind-aware branch prefixes*

