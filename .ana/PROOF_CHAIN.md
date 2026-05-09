# Proof Chain Dashboard

74 runs · 167 active · 90 lessons · 0 promoted · 161 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 15 | 8 |
| packages/cli/tests/commands/work.test.ts | 13 | 10 |
| packages/cli/tests/commands/proof.test.ts | 11 | 5 |
| website/lib/proof-feed.ts | 10 | 3 |
| packages/cli/tests/commands/artifact.test.ts | 8 | 4 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 167 total)

### .github/workflows/test.yml

- **code:** staging branch in trigger list is a no-op — branch does not exist on remote — *CI path filtering for artifact-only commits*

### .husky/post-merge

- **code:** Post-merge hook uses set -e but wraps build in if-guard — correct now, but fragile if future edits add unguarded commands — *Scope Validation Integrity*

### packages/cli/src/commands/artifact.ts

- **code:** moveFileCrossFs copy-then-delete is not atomic — if copyFileSync succeeds but unlinkSync fails, source file persists as a stale duplicate — *Worktree Artifact Path Mismatch — Prevention and Cleanup*
- **code:** Layer 2 post-save sweep calls getMainTreeRoot a second time — already computed in Layer 1 block but not threaded through — *Worktree Artifact Path Mismatch — Prevention and Cleanup*

### packages/cli/src/commands/work.ts

- **code:** JSON.parse on gh pr view stdout has no try/catch — malformed response crashes — *work complete --merge flag for structured PR merging*
- **code:** getNextAction multi-line return breaks status output formatting — second line lacks indentation and styling — *work complete --merge flag for structured PR merging*
- **code:** Auto-merge enabled path writes plain text to stdout before JSON output — pollutes stdout for --json consumers — *work complete --merge flag for structured PR merging*
- **code:** commitSaves silently swallows commit failures — index.lock or other git errors invisible to user — *Commit timestamps written by work start*
- **code:** commitSaves mixes runGit (throws) and spawnSync (returns status) for git operations — works correctly but inconsistent API usage — *Commit timestamps written by work start*
- **code:** Layer 3 planning artifact content-match reads file without try-catch — if file is deleted between filter and readFileSync, unhandled ENOENT crashes completeWork — *Worktree Artifact Path Mismatch — Prevention and Cleanup*

### packages/cli/tests/commands/artifact.test.ts

- **test:** A016 only tests 'Feature' case variant, not 'FIX' — contract says both should be accepted — *Scope Validation Integrity*
- **code:** Console.error capture pattern repeated verbatim in 8 rejection tests — extraction into a helper would reduce duplication — *Scope Validation Integrity*
- **test:** Pre-existing scope validation tests (lines 697-746) still use plain toThrow() without checking error message content — *Scope Validation Integrity*
- **test:** A005 EXDEV test doesn't exercise moveFileCrossFs — tests Node.js copyFileSync/unlinkSync directly instead of mocking renameSync to throw EXDEV — *Worktree Artifact Path Mismatch — Prevention and Cleanup*
- **test:** A008 sweep-failure test is a no-op — tests absence of sweep (no main tree copy), not an actual cleanup failure — *Worktree Artifact Path Mismatch — Prevention and Cleanup*

### packages/cli/tests/commands/work-merge.test.ts

- **test:** No tests verify --json output for any of the 7 merge failure paths — *work complete --merge flag for structured PR merging*
- **code:** New test file work-merge.test.ts not in contract file_changes — reasonable deviation for spawnSync mock isolation — *work complete --merge flag for structured PR merging*

### packages/cli/tests/commands/work.test.ts

- **test:** A020, A021 assert on source code content instead of testing behavior — *work complete --merge flag for structured PR merging*
- **test:** A010 test creates untracked file after commit — doesn't test scoped staging during commit — *Commit timestamps written by work start*
- **test:** A011 no-push test relies on absence of remote as indirect proof — no spy or mock verifying git push not called — *Commit timestamps written by work start*

### website/components/hero/ScrollHint.tsx

- **code:** ScrollHint still links to #pipeline — scroll from hero goes nowhere — *Website nav, scroll targets, compat icons, and copy accuracy*

### website/components/proof-feed/proof-feed.module.css

- **code:** rowArrow CSS class defined but never used in ProofFeed.tsx — *Website Mobile Polish + Marquee Overhaul*

### website/components/proof-feed/ProofFeed.tsx

- **code:** kindLabel defaults to 'improve' for unrecognized kind — pre-existing, not in scope — *Website Mobile Polish + Marquee Overhaul*

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

