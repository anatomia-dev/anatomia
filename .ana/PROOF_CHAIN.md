# Proof Chain Dashboard

71 runs · 153 active · 87 lessons · 0 promoted · 161 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/tests/commands/proof.test.ts | 11 | 5 |
| packages/cli/tests/commands/work.test.ts | 10 | 8 |
| packages/cli/src/commands/work.ts | 10 | 6 |
| website/lib/proof-feed.ts | 10 | 3 |
| packages/cli/src/utils/proofSummary.ts | 8 | 6 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 153 total)

### .github/workflows/test.yml

- **code:** staging branch in trigger list is a no-op — branch does not exist on remote — *CI path filtering for artifact-only commits*

### packages/cli/src/commands/artifact.ts

- **code:** moveFileCrossFs copy-then-delete is not atomic — if copyFileSync succeeds but unlinkSync fails, source file persists as a stale duplicate — *Worktree Artifact Path Mismatch — Prevention and Cleanup*
- **code:** Layer 2 post-save sweep calls getMainTreeRoot a second time — already computed in Layer 1 block but not threaded through — *Worktree Artifact Path Mismatch — Prevention and Cleanup*

### packages/cli/src/commands/work.ts

- **code:** Layer 3 planning artifact content-match reads file without try-catch — if file is deleted between filter and readFileSync, unhandled ENOENT crashes completeWork — *Worktree Artifact Path Mismatch — Prevention and Cleanup*
- **code:** Early-return missing-worktree warning uses misleading message when inside worktree but plan dir absent — *Fix Pipeline Phase Timing*

### packages/cli/src/utils/proofSummary.ts

- **code:** extractScopeKind regex matches **Kind:** anywhere in file, not section-scoped — *Ship Log Polish*
- **code:** ProofChainEntryForContext does not include kind field — consistent with projection pattern, no current consumer needs it — *Ship Log Polish*

### packages/cli/tests/commands/artifact.test.ts

- **test:** A005 EXDEV test doesn't exercise moveFileCrossFs — tests Node.js copyFileSync/unlinkSync directly instead of mocking renameSync to throw EXDEV — *Worktree Artifact Path Mismatch — Prevention and Cleanup*
- **test:** A008 sweep-failure test is a no-op — tests absence of sweep (no main tree copy), not an actual cleanup failure — *Worktree Artifact Path Mismatch — Prevention and Cleanup*

### packages/cli/tests/commands/proof.test.ts

- **test:** proof.test.ts L744 redundant toBeTruthy guard before non-null assertion — *Test Suite Hygiene*

### packages/cli/tests/e2e/init-flow.test.ts

- **test:** E2E scan regression test uses 5 sole toBeDefined() assertions on scan.json keys — *Test Suite Hygiene*

### packages/cli/tests/utils/proofSummary.test.ts

- **test:** proofSummary.test.ts parseFindings uses toBeGreaterThanOrEqual on deterministic fixture data — *Test Suite Hygiene*
- **test:** Previous Callouts in fixture template strings — stale naming preserved as backward-compat fixtures — *Test Suite Hygiene*

### website/app/globals.css

- **code:** :has() bonding rule depends on ProofFeed being direct previous sibling of footer in DOM — *Website Direct Polish*
- **code:** globals.css footer rule applies margin-top to ALL footer elements including any future non-marketing footers — *Website Direct Polish*

### website/components/hero/ScrollHint.tsx

- **code:** ScrollHint still links to #pipeline — scroll from hero goes nowhere — *Website nav, scroll targets, compat icons, and copy accuracy*

### website/components/nav/Nav.tsx

- **code:** Pseudo-element touch targets on nav buttons break if overflow:hidden is added to button — *Website Direct Polish*

### website/components/pricing/Pricing.tsx

- **code:** Pricing h2 and blurb with maxWidth may not visually center without margin auto — *Website Direct Polish*

### website/components/proof-feed/proof-feed.module.css

- **code:** rowArrow CSS class defined but never used in ProofFeed.tsx — *Website Mobile Polish + Marquee Overhaul*

### website/components/proof-feed/ProofFeed.tsx

- **code:** kindLabel defaults to 'improve' for unrecognized kind — pre-existing, not in scope — *Website Mobile Polish + Marquee Overhaul*
- **code:** kindLabel defaults to 'improve' for any unrecognized kind — silent fallback if ProofKind grows — *Ship Log Polish*

### website/components/scan/ScanSlab.tsx

- **code:** ScanSlab still links to #pipeline — scan section CTA goes nowhere — *Website nav, scroll targets, compat icons, and copy accuracy*

### website/lib/copy.ts

- **code:** Three dead #pipeline links in copy.ts — pre-existing, not introduced by this build — *Website Mobile Polish + Marquee Overhaul*
- **code:** Three dead #pipeline links after anchor removal — *Website nav, scroll targets, compat icons, and copy accuracy*

### website/lib/icons.tsx

- **code:** brandIconNames exported but never imported — pre-existing, out of scope — *Website Mobile Polish + Marquee Overhaul*
- **code:** Copilot/Cline use currentColor — renders as var(--fg) inside .glyph, works in both themes but contrast depends on --ink-15 background chip — *Website Mobile Polish + Marquee Overhaul*
- **code:** brandIconNames exported but never imported — *Website nav, scroll targets, compat icons, and copy accuracy*
- **code:** Codex icon is a geometric diamond placeholder, not an official brand icon — *Website nav, scroll targets, compat icons, and copy accuracy*

### website/lib/proof-feed.ts

- **code:** resolveKind falls back to slug heuristic for old entries — chore-type old entries misclassified as feature — *Ship Log Polish*

### General

- **test:** A001-A010, A018-A024 verified by source inspection only — no tagged tests for website copy, types, or wiring — *Ship Log Polish*

