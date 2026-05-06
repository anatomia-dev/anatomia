# Proof Chain Dashboard

56 runs · 87 active · 68 lessons · 0 promoted · 159 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/tests/commands/proof.test.ts | 10 | 4 |
| packages/cli/tests/commands/work.test.ts | 9 | 7 |
| packages/cli/src/commands/proof.ts | 7 | 5 |
| packages/cli/src/utils/proofSummary.ts | 6 | 5 |
| packages/cli/src/commands/work.ts | 5 | 4 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 87 total)

### .husky/pre-commit

- **code:** Pre-commit filter also skips for .claude/-only commits — broader than contract A006 specifies (only mentions .ana/). Pragmatic but unspecified. — *Proof System Near-Term — Learn Infrastructure Foundation*

### packages/cli/src/commands/agents.ts

- **code:** agents.ts file header comment still says 'List deployed agents' — stale after description change — *CLI UX Polish — First 10 Minutes*

### packages/cli/src/commands/init/index.ts

- **test:** Guard commands (A028-A032) have no integration tests — *Worktree Isolation*

### packages/cli/src/commands/init/state.ts

- **test:** A010 has no runtime test — verified by source inspection only — *Non-Main Artifact Branch Tests*

### packages/cli/src/commands/proof.ts

- **code:** proof.ts WRONG_BRANCH primary error still says 'Switch to main' even in worktree context — *Worktree Isolation*
- **code:** pullBeforeRead calls process.exit(1) on rebase conflict without running git rebase --abort first — leaves dirty rebase state — *Proof System Near-Term — Learn Infrastructure Foundation*
- **code:** Audit severity filter uses reverse-index splice loop — O(n²) on large finding sets; Array.filter() would be clearer and faster — *Proof System Near-Term — Learn Infrastructure Foundation*
- **code:** Lesson command catch block at proof.ts:1141 loses error detail — swallows commit failure cause — *Proof Intelligence Hardening*
- **code:** Lesson command duplicates close's finding-search loop pattern — 4 identical loops across lesson, close, promote, strengthen — *Proof Intelligence Hardening*

### packages/cli/src/commands/work.ts

- **test:** A021 has no tagged test — verified by source inspection only — *Worktree Isolation*
- **test:** Phase detection logic (A001-A003, A006-A011) has no dedicated tagged tests — *Worktree Isolation*
- **code:** guardFailResult JSDoc first line says 'Write proof chain files' — copy-paste from writeProofChain description — *Proof Intelligence Hardening*

### packages/cli/src/utils/git-operations.ts

- **code:** getCurrentBranch still uses execSync — not hardened by this phase — *Security Hardening — Command Injection Elimination*

### packages/cli/src/utils/validators.ts

- **code:** SLUG_PATTERN exported but only consumed by test file — no source imports the raw regex — *Security Hardening — Command Injection Elimination*

### packages/cli/src/utils/worktree.ts

- **code:** branchExists exported only for test imports — not used by production code — *Worktree Isolation*
- **code:** isWorktreeDirectory false-positive risk in git submodules — *Worktree Isolation*
- **code:** detectWorktreeSlug path-based detection fragile if project root contains .ana/worktrees/ — *Worktree Isolation*

### packages/cli/tests/commands/check.test.ts

- **code:** check.test.ts fixture uses 'active sprints' — slightly odd phrasing for a mock project-context but acceptable — *Code Comment Cleanup*

### packages/cli/tests/commands/proof.test.ts

- **test:** A001 test verifies retry success path, not the failure message — contract matcher/value ('Push failed after retry') never asserted — *Proof System Near-Term — Learn Infrastructure Foundation*
- **test:** A018 uses toBeGreaterThan(0) — weak assertion; the fixture has exactly 1 unclassified finding, test should use toBe(1) — *Proof System Near-Term — Learn Infrastructure Foundation*
- **test:** No dedicated push retry tests for lesson, promote, or strengthen — shared helper covers them but no integration test proves the wiring — *Proof System Near-Term — Learn Infrastructure Foundation*

### packages/cli/tests/commands/work.test.ts

- **test:** completeWork test builds fixture manually (60 lines) instead of using createMergedProject helper — *Non-Main Artifact Branch Tests*
- **test:** A016-A019 @ana tags point to pre-existing branchPrefix template tests, not command entry point validation — *Security Hardening — Command Injection Elimination*

### packages/cli/tests/engine/types.test.ts

- **test:** types.test.ts compile-time assertions use expect(true).toBe(true) — sentinel pattern, but acceptable because the real assertion is TypeScript compilation — *Code Comment Cleanup*

### packages/cli/tests/utils/worktree.test.ts

- **test:** Pre-existing worktree.test.ts failure — detectWorktreeSlug('') returns slug when run inside worktree — *Non-Main Artifact Branch Tests*
- **test:** A012 and A037 use typeof assertions instead of value assertions — *Worktree Isolation*

### General

- **code:** addHelpCommand(false) breaks 'ana help <cmd>' — users who learned that pattern get an error — *CLI UX Polish — First 10 Minutes*
- **test:** No contract assertions are covered by @ana-tagged tests — all verified by source inspection and live invocation only — *CLI UX Polish — First 10 Minutes*
- **test:** No test coverage for pre-commit bypass behavior (A006/A007) — shell hook not exercised in vitest suite — *Proof System Near-Term — Learn Infrastructure Foundation*
- **test:** No dedicated integration tests for command entry point injection rejection — saveArtifact, completeWork, createPr, strengthen — *Security Hardening — Command Injection Elimination*

