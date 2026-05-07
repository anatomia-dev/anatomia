# Proof Chain Dashboard

65 runs · 129 active · 79 lessons · 0 promoted · 160 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/tests/commands/work.test.ts | 11 | 9 |
| packages/cli/tests/commands/proof.test.ts | 10 | 4 |
| packages/cli/src/commands/work.ts | 9 | 5 |
| website/lib/proof-feed.ts | 9 | 2 |
| packages/cli/src/commands/proof.ts | 7 | 5 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 129 total)

### packages/cli/src/commands/agents.ts

- **code:** Double error message on unknown agent in setModel() — throws after console.error, catch block re-prints — *Agent Dashboard Phase 1*
- **code:** maxModelLen computed inside the loop body on every iteration instead of once before the loop — *Agent Dashboard Phase 1*

### packages/cli/src/commands/work.ts

- **code:** Early-return missing-worktree warning uses misleading message when inside worktree but plan dir absent — *Fix Pipeline Phase Timing*
- **code:** Early-return phase detection adds 3 globSync calls per work start from inside worktree — not cached — *Fix Pipeline Phase Timing*
- **code:** Race condition in writeTimestamp: read-modify-write on .saves.json is not atomic — *Fix Pipeline Phase Timing*
- **test:** A003 has no dedicated tagged test — verified by source inspection only — *Fix Pipeline Phase Timing*

### packages/cli/src/utils/agent-config.ts

- **code:** AgentFrontmatter interface exported but never imported outside agent-config.ts — *Agent Dashboard Phase 1*

### packages/cli/tests/commands/agents.test.ts

- **test:** A002 test uses toBeGreaterThan(templateSize) — correct intent but could assert exact expected value since skill content is fixture-controlled — *Agent Dashboard Phase 1*

### packages/cli/tests/commands/work.test.ts

- **test:** Fix-phase test (early-return) has no @ana tag — not linked to any contract assertion — *Fix Pipeline Phase Timing*

### website/app/globals.css

- **code:** :has() bonding rule depends on ProofFeed being direct previous sibling of footer in DOM — *Website Direct Polish*
- **code:** globals.css footer rule applies margin-top to ALL footer elements including any future non-marketing footers — *Website Direct Polish*

### website/components/about/about.module.css

- **code:** Five new CSS modules duplicate identical eyebrow/title blocks — no shared base — *Dead Links & Missing Pages*

### website/components/bento/bento.module.css

- **code:** tCompat hover state leaks through inversion — base .tile:hover sets border-color: var(--border) — *Website Visual Fidelity*

### website/components/nav/Nav.tsx

- **code:** Pseudo-element touch targets on nav buttons break if overflow:hidden is added to button — *Website Direct Polish*

### website/components/pricing/pricing.module.css

- **code:** cardPriceUnit override added for highlighted card — not in spec but necessary for visibility — *Website Visual Fidelity*

### website/components/pricing/Pricing.tsx

- **code:** Pricing h2 and blurb with maxWidth may not visually center without margin auto — *Website Direct Polish*

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

### website/MAINTENANCE_MANUAL.md

- **code:** MAINTENANCE_MANUAL.md still references (sub) route group and SubNav — now deleted — *Dead Links & Missing Pages*

