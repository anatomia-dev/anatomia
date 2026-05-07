# Proof Chain Dashboard

63 runs · 120 active · 77 lessons · 0 promoted · 160 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/tests/commands/work.test.ts | 10 | 8 |
| packages/cli/tests/commands/proof.test.ts | 10 | 4 |
| website/lib/proof-feed.ts | 9 | 2 |
| packages/cli/src/commands/proof.ts | 7 | 5 |
| packages/cli/src/utils/proofSummary.ts | 6 | 5 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 120 total)

### packages/cli/src/commands/agents.ts

- **code:** Double error message on unknown agent in setModel() — throws after console.error, catch block re-prints — *Agent Dashboard Phase 1*
- **code:** maxModelLen computed inside the loop body on every iteration instead of once before the loop — *Agent Dashboard Phase 1*

### packages/cli/src/utils/agent-config.ts

- **code:** AgentFrontmatter interface exported but never imported outside agent-config.ts — *Agent Dashboard Phase 1*

### packages/cli/src/utils/worktree.ts

- **code:** detectWorktreeSlug empty-string guard removed — unrelated to website-lift scope — *Website Lift*
- **code:** Double H2 heading in risk profile — worktree.ts pushes '## Proof Findings' then proofFindings content starts with '## Risk Profile' — *Worktrees V2 — Phase Timing + Danger Map + Prune*

### packages/cli/tests/commands/agents.test.ts

- **test:** A002 test uses toBeGreaterThan(templateSize) — correct intent but could assert exact expected value since skill content is fixture-controlled — *Agent Dashboard Phase 1*

### packages/cli/tests/commands/artifact.test.ts

- **test:** A014 test does not exercise actual archive failure (catch branch). Tests first-save no-op, not error recovery. — *Rejection Cycle Artifact Preservation*

### packages/cli/tests/commands/work.test.ts

- **test:** A017 (build_agent) and A020 (verify_agent) lack direct tagged tests — covered by source inspection only — *Worktrees V2 — Phase Timing + Danger Map + Prune*

### packages/cli/tests/utils/proofSummary.test.ts

- **test:** A013/A014 are type-level sentinels — construct PipelineStats manually, don't test computePipelineStats computes median_plan — *Worktrees V2 — Phase Timing + Danger Map + Prune*

### packages/cli/tests/utils/worktree.test.ts

- **test:** detectWorktreeSlug empty-string test is environment-dependent — pre-existing, fails inside worktrees — *Worktrees V2 — Phase Timing + Danger Map + Prune*

### website/components/about/about.module.css

- **code:** Five new CSS modules duplicate identical eyebrow/title blocks — no shared base — *Dead Links & Missing Pages*

### website/components/bento/bento.module.css

- **code:** tCompat hover state leaks through inversion — base .tile:hover sets border-color: var(--border) — *Website Visual Fidelity*

### website/components/pricing/pricing.module.css

- **code:** cardPriceUnit override added for highlighted card — not in spec but necessary for visibility — *Website Visual Fidelity*

### website/components/pricing/TetrisSnake.tsx

- **code:** TetrisSnake trail fade math off by 2 ticks — fades to 0 at age 18 but filter removes at age 20 — *Website Visual Fidelity*
- **code:** DPR cap at 2 added without spec guidance — prevents large canvas on 3x displays — *Website Visual Fidelity*
- **code:** TetrisSnake getComputedStyle called every frame — potential performance concern on low-end mobile — *Website Visual Fidelity*
- **code:** TetrisSnake placed blocks array grows unbounded between lap clears — no cap on array size — *Website Visual Fidelity*

### website/lib/analytics.tsx

- **code:** PostHog useEffect has no cleanup return — posthog.init() could be called on remount — *Website Production Infrastructure*

### website/lib/copy.ts

- **code:** proofFeed.headTitle says 'Click one.' but rows are no longer clickable — *Dead Links & Missing Pages*
- **code:** proofFeed.headSub says 'Each row links to the contract...' but rows no longer link — *Dead Links & Missing Pages*

### website/lib/proof-feed.ts

- **code:** getLatestCommit() exported but never imported — unused function — *Website Production Infrastructure*
- **code:** LatestCommit interface exported but never imported — unused type — *Website Production Infrastructure*
- **code:** githubHeaders() extras parameter never used with non-default value — YAGNI — *Website Production Infrastructure*
- **code:** No tag name validation — non-semver GitHub tags would display as-is in version pill — *Website Production Infrastructure*
- **code:** File header comment still says 'Today: static mock data' — stale after live data wiring — *Website Production Infrastructure*
- **code:** mapEntry never produces kind 'chore' — only 'fix' or 'feature' — *Website Lift*
- **code:** Hardcoded version 'v1.0.2' will go stale — *Website Lift*
- **code:** Empty entries returns [] instead of mockFeed — blank state possible — *Website Lift*
- **code:** extractFeatureEm on single-word feature returns that word — acceptable for display — *Website Lift*

### website/MAINTENANCE_MANUAL.md

- **code:** MAINTENANCE_MANUAL.md still references (sub) route group and SubNav — now deleted — *Dead Links & Missing Pages*

