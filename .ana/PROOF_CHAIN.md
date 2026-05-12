# Proof Chain Dashboard

83 runs · 219 active · 101 lessons · 0 promoted · 161 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 21 | 11 |
| packages/cli/tests/commands/work.test.ts | 17 | 13 |
| packages/cli/tests/commands/proof.test.ts | 11 | 5 |
| website/lib/proof-feed.ts | 10 | 3 |
| packages/cli/tests/commands/artifact.test.ts | 9 | 5 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 219 total)

### packages/cli/src/commands/artifact.ts

- **code:** Auto-rename overwrites numbered file unconditionally — if the unnumbered file is stale or corrupt, the good numbered version is destroyed — *Fix cycle stage detection breaks on multi-phase builds*

### packages/cli/src/commands/config.ts

- **code:** displayAll shows empty object as JSON.stringify output (e.g., '{}') — inconsistent with nested object display pattern which uses indentation — *Configurability Improvements*
- **code:** Synchronous fs operations (readFileSync/writeFileSync) — works for a CLI tool but blocks the event loop during file I/O — *Configurability Improvements*

### packages/cli/src/commands/init/anaJsonSchema.ts

- **code:** Type widening from .passthrough() adds [k: string]: unknown to AnaJson — safe now but fragile if consumers enumerate keys — *Configurability Improvements*

### packages/cli/src/commands/pr.ts

- **code:** pr.ts fetch adds network latency to every PR creation — no timeout or skip mechanism — *Worktree freshness detection*

### packages/cli/src/commands/work.ts

- **code:** printExistingWorktree duplicates commitsBehind rev-list logic from getWorktreeInfo — now two inline computations duplicated instead of one — *Worktree freshness detection*
- **code:** getWorkBranch glob pattern `*${slug}` may over-match for short slugs (e.g., slug 'fix' matches all branches containing 'fix') — *Kind-aware branch prefixes*
- **code:** printExistingWorktree duplicates HEAD-reading logic from getWorktreeInfo — same pattern in two places — *Kind-aware branch prefixes*
- **code:** startWork resume path at line 1685 also duplicates HEAD-reading pattern — three places total read HEAD for branch name — *Kind-aware branch prefixes*
- **test:** A013/A014 completeWork backward compat assertions have no tagged tests — verified by source inspection only — *Fix cycle stage detection breaks on multi-phase builds*
- **code:** completeWork fallback lets two multi-phase specs share one unnumbered saves.json entry — phase 2 passes if phase 1's unnumbered key exists — *Fix cycle stage detection breaks on multi-phase builds*

### packages/cli/src/utils/proofSummary.ts

- **code:** extractScopeKind regex matches **Kind:** anywhere in file, not section-scoped — pre-existing issue, milestone addition doesn't change the risk profile — *Add milestone kind*

### packages/cli/src/utils/worktree.ts

- **code:** commitsBehind uses origin/artifactBranch but commitCount uses bare artifactBranch — asymmetric ref comparison — *Worktree freshness detection*
- **code:** Detached HEAD produces branchName '(unknown)' — rev-list and log commands will fail silently, showing 0 commits and 0 days — *Kind-aware branch prefixes*
- **code:** rev-parse --abbrev-ref HEAD returns literal 'HEAD' on detached HEAD, not '(unknown)' — ternary fallback never triggers for detached state — *Kind-aware branch prefixes*

### packages/cli/templates/.claude/agents/ana-verify.md

- **code:** Step 7 body condensed from 3-line bulleted list to single line — functionally correct but less scannable for agents — *Configurability Improvements*

### packages/cli/tests/commands/artifact.test.ts

- **test:** A002 test asserts on echoed invalid input ('fix + chore'), not on the four-value error string — source inspection confirms correct text but test would pass even if milestone were missing from the error message — *Add milestone kind*

### packages/cli/tests/commands/config.test.ts

- **test:** A011 assertion uses toBeDefined() — JSON.parse would throw before reaching it, so the assertion is tautological — *Configurability Improvements*

### packages/cli/tests/commands/work.test.ts

- **test:** A008 JSON test asserts typeof === 'number' not a specific value — passes even if commitsBehind computation is broken — *Worktree freshness detection*
- **test:** Stage detection tests use hardcoded timestamps with 1-hour gaps — no boundary test for equal timestamps — *Fix cycle stage detection breaks on multi-phase builds*

### packages/cli/tests/utils/git-operations.test.ts

- **test:** Contract A001 has no tagged test for this contract — relies on pre-existing test from previous build — *Kind-aware branch prefixes*
- **code:** Unspecified file change in git-operations.test.ts — flipped strip assertion to preservation assertion, necessary and correct — *Configurability Improvements*

### packages/cli/tests/utils/worktree.test.ts

- **test:** A005 git failure test relies on absent origin/main ref rather than injecting a failure — indirect coverage of the catch path — *Worktree freshness detection*

### website/components/proof-feed/proof-feed.module.css

- **code:** Dark mode milestone badge has no background override — inherits light-mode color-mix background. Works because transparent mix renders identically in dark mode, but inconsistent with feature badge which doesn't set explicit dark background either — *Add milestone kind*

### website/components/proof-feed/ProofFeed.tsx

- **test:** No test verifies milestone badge CSS class or label output — website has no test suite, so ProofFeed rendering is unverified beyond type checking and build compilation — *Add milestone kind*
- **code:** kindClass and kindLabel use string parameter type instead of ProofKind — the functions accept any string and fall through to chore/improve defaults for unrecognized values — *Add milestone kind*

### General

- **test:** No tagged tests for A009, A010, A011, A012, A013, A014 — verified by source inspection only — *Worktree freshness detection*
- **test:** Contract assertions A013-A019 have no tagged tests — verified by source inspection only — *Kind-aware branch prefixes*
- **test:** A015/A016/A017 template content assertions have no tagged tests — verified by source inspection only — *Fix cycle stage detection breaks on multi-phase builds*
- **test:** A006-A009 have no @ana tags in this build's test files — verified by source inspection and dogfood sync test — *Configurability Improvements*

