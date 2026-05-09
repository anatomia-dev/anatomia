# Proof Chain Dashboard

73 runs · 161 active · 89 lessons · 0 promoted · 161 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/tests/commands/work.test.ts | 12 | 9 |
| packages/cli/src/commands/work.ts | 12 | 7 |
| packages/cli/tests/commands/proof.test.ts | 11 | 5 |
| website/lib/proof-feed.ts | 10 | 3 |
| packages/cli/tests/commands/artifact.test.ts | 8 | 4 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 161 total)

### .github/workflows/test.yml

- **code:** staging branch in trigger list is a no-op — branch does not exist on remote — *CI path filtering for artifact-only commits*

### .husky/post-merge

- **code:** Post-merge hook uses set -e but wraps build in if-guard — correct now, but fragile if future edits add unguarded commands — *Scope Validation Integrity*

### packages/cli/src/commands/artifact.ts

- **code:** moveFileCrossFs copy-then-delete is not atomic — if copyFileSync succeeds but unlinkSync fails, source file persists as a stale duplicate — *Worktree Artifact Path Mismatch — Prevention and Cleanup*
- **code:** Layer 2 post-save sweep calls getMainTreeRoot a second time — already computed in Layer 1 block but not threaded through — *Worktree Artifact Path Mismatch — Prevention and Cleanup*

### packages/cli/src/commands/work.ts

- **code:** commitSaves silently swallows commit failures — index.lock or other git errors invisible to user — *Commit timestamps written by work start*
- **code:** commitSaves mixes runGit (throws) and spawnSync (returns status) for git operations — works correctly but inconsistent API usage — *Commit timestamps written by work start*
- **code:** Layer 3 planning artifact content-match reads file without try-catch — if file is deleted between filter and readFileSync, unhandled ENOENT crashes completeWork — *Worktree Artifact Path Mismatch — Prevention and Cleanup*

### packages/cli/src/utils/proofSummary.ts

- **code:** extractScopeKind regex matches **Kind:** anywhere in file, not section-scoped — *Ship Log Polish*

### packages/cli/tests/commands/artifact.test.ts

- **test:** A016 only tests 'Feature' case variant, not 'FIX' — contract says both should be accepted — *Scope Validation Integrity*
- **code:** Console.error capture pattern repeated verbatim in 8 rejection tests — extraction into a helper would reduce duplication — *Scope Validation Integrity*
- **test:** Pre-existing scope validation tests (lines 697-746) still use plain toThrow() without checking error message content — *Scope Validation Integrity*
- **test:** A005 EXDEV test doesn't exercise moveFileCrossFs — tests Node.js copyFileSync/unlinkSync directly instead of mocking renameSync to throw EXDEV — *Worktree Artifact Path Mismatch — Prevention and Cleanup*
- **test:** A008 sweep-failure test is a no-op — tests absence of sweep (no main tree copy), not an actual cleanup failure — *Worktree Artifact Path Mismatch — Prevention and Cleanup*

### packages/cli/tests/commands/proof.test.ts

- **test:** proof.test.ts L744 redundant toBeTruthy guard before non-null assertion — *Test Suite Hygiene*

### packages/cli/tests/commands/work.test.ts

- **test:** A010 test creates untracked file after commit — doesn't test scoped staging during commit — *Commit timestamps written by work start*
- **test:** A011 no-push test relies on absence of remote as indirect proof — no spy or mock verifying git push not called — *Commit timestamps written by work start*

### packages/cli/tests/e2e/init-flow.test.ts

- **test:** E2E scan regression test uses 5 sole toBeDefined() assertions on scan.json keys — *Test Suite Hygiene*

### packages/cli/tests/utils/proofSummary.test.ts

- **test:** proofSummary.test.ts parseFindings uses toBeGreaterThanOrEqual on deterministic fixture data — *Test Suite Hygiene*
- **test:** Previous Callouts in fixture template strings — stale naming preserved as backward-compat fixtures — *Test Suite Hygiene*

### website/components/hero/ScrollHint.tsx

- **code:** ScrollHint still links to #pipeline — scroll from hero goes nowhere — *Website nav, scroll targets, compat icons, and copy accuracy*

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

