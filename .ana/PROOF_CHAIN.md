# Proof Chain Dashboard

82 runs · 213 active · 100 lessons · 0 promoted · 161 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 20 | 10 |
| packages/cli/tests/commands/work.test.ts | 16 | 12 |
| packages/cli/tests/commands/proof.test.ts | 11 | 5 |
| website/lib/proof-feed.ts | 10 | 3 |
| packages/cli/tests/commands/artifact.test.ts | 9 | 5 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 213 total)

### packages/cli/src/commands/artifact.ts

- **code:** Auto-rename overwrites numbered file unconditionally — if the unnumbered file is stale or corrupt, the good numbered version is destroyed — *Fix cycle stage detection breaks on multi-phase builds*

### packages/cli/src/commands/config.ts

- **code:** displayAll shows empty object as JSON.stringify output (e.g., '{}') — inconsistent with nested object display pattern which uses indentation — *Configurability Improvements*
- **code:** Synchronous fs operations (readFileSync/writeFileSync) — works for a CLI tool but blocks the event loop during file I/O — *Configurability Improvements*
- **code:** Machine-managed check blocks dot-paths into managed fields (e.g., 'setupPhase.sub') — defensive and correct, but not spec-required. Minimal over-building. — *Configurability Improvements*

### packages/cli/src/commands/init/anaJsonSchema.ts

- **code:** Type widening from .passthrough() adds [k: string]: unknown to AnaJson — safe now but fragile if consumers enumerate keys — *Configurability Improvements*

### packages/cli/src/commands/work.ts

- **code:** getWorkBranch glob pattern `*${slug}` may over-match for short slugs (e.g., slug 'fix' matches all branches containing 'fix') — *Kind-aware branch prefixes*
- **code:** printExistingWorktree duplicates HEAD-reading logic from getWorktreeInfo — same pattern in two places — *Kind-aware branch prefixes*
- **code:** startWork resume path at line 1685 also duplicates HEAD-reading pattern — three places total read HEAD for branch name — *Kind-aware branch prefixes*
- **test:** A013/A014 completeWork backward compat assertions have no tagged tests — verified by source inspection only — *Fix cycle stage detection breaks on multi-phase builds*
- **code:** completeWork fallback lets two multi-phase specs share one unnumbered saves.json entry — phase 2 passes if phase 1's unnumbered key exists — *Fix cycle stage detection breaks on multi-phase builds*

### packages/cli/src/utils/proofSummary.ts

- **code:** extractScopeKind regex matches **Kind:** anywhere in file, not section-scoped — pre-existing issue, milestone addition doesn't change the risk profile — *Add milestone kind*

### packages/cli/src/utils/update-check.ts

- **code:** packageName interpolated via template literal without JSON.stringify in spawn script URL — *Version Awareness Notifications*
- **code:** Four of five exports from update-check.ts are unused in production code — only checkForUpdates is imported — *Version Awareness Notifications*
- **code:** Spawn script uses require() (CommonJS) inside node -e — works but inconsistent with ESM codebase — *Version Awareness Notifications*

### packages/cli/src/utils/worktree.ts

- **code:** Detached HEAD produces branchName '(unknown)' — rev-list and log commands will fail silently, showing 0 commits and 0 days — *Kind-aware branch prefixes*
- **code:** rev-parse --abbrev-ref HEAD returns literal 'HEAD' on detached HEAD, not '(unknown)' — ternary fallback never triggers for detached state — *Kind-aware branch prefixes*

### packages/cli/templates/.claude/agents/ana-verify.md

- **code:** Step 7 body condensed from 3-line bulleted list to single line — functionally correct but less scannable for agents — *Configurability Improvements*

### packages/cli/tests/commands/artifact.test.ts

- **test:** A002 test asserts on echoed invalid input ('fix + chore'), not on the four-value error string — source inspection confirms correct text but test would pass even if milestone were missing from the error message — *Add milestone kind*

### packages/cli/tests/commands/config.test.ts

- **test:** A011 assertion uses toBeDefined() — JSON.parse would throw before reaching it, so the assertion is tautological — *Configurability Improvements*

### packages/cli/tests/commands/work.test.ts

- **test:** Stage detection tests use hardcoded timestamps with 1-hour gaps — no boundary test for equal timestamps — *Fix cycle stage detection breaks on multi-phase builds*

### packages/cli/tests/utils/git-operations.test.ts

- **test:** Contract A001 has no tagged test for this contract — relies on pre-existing test from previous build — *Kind-aware branch prefixes*
- **code:** Unspecified file change in git-operations.test.ts — flipped strip assertion to preservation assertion, necessary and correct — *Configurability Improvements*

### packages/cli/tests/utils/update-check.test.ts

- **test:** A007 tagged test checks return values not output — contract target is 'output' with not_contains 'Error' — *Version Awareness Notifications*
- **test:** A010 tagged test checks spawn not called — contract target is updateAvailable equals null, which is tested in untagged CI test — *Version Awareness Notifications*

### website/components/proof-feed/proof-feed.module.css

- **code:** Dark mode milestone badge has no background override — inherits light-mode color-mix background. Works because transparent mix renders identically in dark mode, but inconsistent with feature badge which doesn't set explicit dark background either — *Add milestone kind*

### website/components/proof-feed/ProofFeed.tsx

- **test:** No test verifies milestone badge CSS class or label output — website has no test suite, so ProofFeed rendering is unverified beyond type checking and build compilation — *Add milestone kind*
- **code:** kindClass and kindLabel use string parameter type instead of ProofKind — the functions accept any string and fall through to chore/improve defaults for unrecognized values — *Add milestone kind*

### General

- **test:** Contract assertions A013-A019 have no tagged tests — verified by source inspection only — *Kind-aware branch prefixes*
- **test:** A015/A016/A017 template content assertions have no tagged tests — verified by source inspection only — *Fix cycle stage detection breaks on multi-phase builds*
- **test:** A006-A009 have no @ana tags in this build's test files — verified by source inspection and dogfood sync test — *Configurability Improvements*

