# Proof Chain Dashboard

88 runs · 245 active · 107 lessons · 0 promoted · 161 closed

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

## Active Findings (30 shown of 245 total)

### packages/cli/src/commands/work.ts

- **code:** --autostash bypasses content-match guard for tracked dirty planning artifacts — theoretical gap remains — *Hygiene debt cleanup*
- **code:** printExistingWorktree duplicates commitsBehind rev-list logic from getWorktreeInfo — now two inline computations duplicated instead of one — *Worktree freshness detection*

### packages/cli/src/engine/detectors/git.ts

- **test:** A004 and A005 are source-inspection-only assertions — no behavioral test verifies the regex actually strips + markers in git.ts (only work.ts path is integration-tested) — *Fix worktree branch parsing*
- **test:** Integration test covers work.ts parsing path end-to-end but git.ts detectBranches is not exercised by any new test — the fix is verified only by source inspection — *Fix worktree branch parsing*

### packages/cli/src/utils/worktree.ts

- **code:** commitsBehind uses origin/artifactBranch but commitCount uses bare artifactBranch — asymmetric ref comparison — *Worktree freshness detection*

### packages/cli/tests/commands/work.test.ts

- **test:** planningOnlyInMerge flag improves test fidelity — now models real production scenario of untracked artifacts — *Hygiene debt cleanup*
- **test:** No dedicated @ana tag for A003 — existing test satisfies the assertion but is tagged @ana A010 from a prior contract — *Fix worktree branch parsing*
- **code:** No mutual exclusion between featureBranch and worktree options in createWorkTestProject — setting both creates branch via checkout then fails on worktree add — *Fix worktree branch parsing*
- **test:** A008 JSON test asserts typeof === 'number' not a specific value — passes even if commitsBehind computation is broken — *Worktree freshness detection*

### packages/cli/tests/utils/worktree.test.ts

- **test:** A005 git failure test relies on absent origin/main ref rather than injecting a failure — indirect coverage of the catch path — *Worktree freshness detection*

### website/app/docs/[[...slug]]/page.tsx

- **code:** Prose classes used without @tailwindcss/typography installed — *Docs Infrastructure — Fumadocs MDX Pipeline*

### website/app/docs/layout.tsx

- **code:** data-hide-rail attribute from spec not implemented — prep mechanism for future proof-explorer route — *Docs Shell (Layout + Shared Components)*
- **code:** No error boundary in docs layout — broken MDX crashes entire docs section — *Docs Infrastructure — Fumadocs MDX Pipeline*

### website/components/docs/

- **code:** Empty components/docs directory left after deleting 4 component files — *Docs Infrastructure — Fumadocs MDX Pipeline*

### website/components/docs/content/CopyButton.tsx

- **code:** CopyButton uses inline event handlers for hover styles instead of CSS — fragile pattern, state survives re-renders differently than CSS hover — *Docs Shell (Layout + Shared Components)*

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

- **test:** No tests exist for website package — all 31 assertions verified by source inspection only. No regression safety net for component behavior. — *Docs Shell (Layout + Shared Components)*
- **code:** Audit reduced from 20 to 12, not 0 — remaining 12 are postcss dev-only transitives awaiting upstream fix — *Hygiene debt cleanup*

