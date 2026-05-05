# Proof Chain Dashboard

53 runs · 74 active · 65 lessons · 0 promoted · 159 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/tests/commands/proof.test.ts | 10 | 4 |
| packages/cli/tests/commands/work.test.ts | 8 | 6 |
| packages/cli/src/utils/proofSummary.ts | 6 | 5 |
| packages/cli/src/commands/proof.ts | 6 | 4 |
| packages/cli/tests/templates/agent-proof-context.test.ts | 3 | 2 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 74 total)

### .github/workflows/release.yml

- **code:** release.yml copies README/CHANGELOG separately from prepublishOnly — two sources of truth for doc copying — *V1 Release Prep*

### .husky/pre-commit

- **code:** Pre-commit filter also skips for .claude/-only commits — broader than contract A006 specifies (only mentions .ana/). Pragmatic but unspecified. — *Proof System Near-Term — Learn Infrastructure Foundation*
- **code:** Pre-commit comment claims ~9s / 10s threshold — will drift as test count grows (1807 now) — *V1 Code Changes*

### package.json

- **code:** Release script 'cd packages/cli && npm version' requires a semver argument — no guard or help text — *V1 Release Prep*

### packages/cli/package.json

- **code:** npm pack dry-run doesn't include README.md or CHANGELOG.md — prepublishOnly required first — *V1 Release Prep*
- **code:** prepublishOnly relies on relative ../../ path — breaks if package depth changes — *V1 Documentation Overhaul*
- **code:** README.md and CHANGELOG.md cannot be verified with npm pack --dry-run — only exist after prepublishOnly — *V1 Documentation Overhaul*

### packages/cli/src/commands/agents.ts

- **code:** agents.ts file header comment still says 'List deployed agents' — stale after description change — *CLI UX Polish — First 10 Minutes*

### packages/cli/src/commands/proof.ts

- **code:** pullBeforeRead calls process.exit(1) on rebase conflict without running git rebase --abort first — leaves dirty rebase state — *Proof System Near-Term — Learn Infrastructure Foundation*
- **code:** Audit severity filter uses reverse-index splice loop — O(n²) on large finding sets; Array.filter() would be clearer and faster — *Proof System Near-Term — Learn Infrastructure Foundation*
- **code:** Lesson command catch block at proof.ts:1141 loses error detail — swallows commit failure cause — *Proof Intelligence Hardening*
- **code:** Lesson command duplicates close's finding-search loop pattern — 4 identical loops across lesson, close, promote, strengthen — *Proof Intelligence Hardening*

### packages/cli/src/commands/work.ts

- **code:** guardFailResult JSDoc first line says 'Write proof chain files' — copy-paste from writeProofChain description — *Proof Intelligence Hardening*

### packages/cli/src/engine/detectors/git.ts

- **code:** git.ts in src/engine/detectors/ retains execSync — architecturally correct (engine boundary, not commands/utils) but is the last remaining execSync in the codebase outside tests. Future hardening could migrate this to spawnSync for consistency. — *Security Hardening — Command Injection Elimination*

### packages/cli/src/utils/git-operations.ts

- **code:** getCurrentBranch still uses execSync — not hardened by this phase — *Security Hardening — Command Injection Elimination*
- **code:** runGit defaults exitCode to 1 when spawnSync returns null status (signal kill). This is reasonable but means SIGKILL'd git processes appear as generic failures — no way to distinguish 'command failed' from 'process was killed'. Acceptable for CLI use. — *Security Hardening — Command Injection Elimination*

### packages/cli/src/utils/proofSummary.ts

- **code:** proofSummary.ts ~1550 lines — past comfort threshold, known from prior cycles — *V1 Code Changes*

### packages/cli/src/utils/validators.ts

- **code:** SLUG_PATTERN exported but only consumed by test file — no source imports the raw regex — *Security Hardening — Command Injection Elimination*

### packages/cli/tests/commands/proof.test.ts

- **test:** A001 test verifies retry success path, not the failure message — contract matcher/value ('Push failed after retry') never asserted — *Proof System Near-Term — Learn Infrastructure Foundation*
- **test:** A018 uses toBeGreaterThan(0) — weak assertion; the fixture has exactly 1 unclassified finding, test should use toBe(1) — *Proof System Near-Term — Learn Infrastructure Foundation*
- **test:** No dedicated push retry tests for lesson, promote, or strengthen — shared helper covers them but no integration test proves the wiring — *Proof System Near-Term — Learn Infrastructure Foundation*

### packages/cli/tests/commands/work.test.ts

- **test:** A016-A019 @ana tags point to pre-existing branchPrefix template tests, not command entry point validation — *Security Hardening — Command Injection Elimination*

### packages/cli/tests/utils/git-operations.test.ts

- **test:** A010 test mocks process.exit — after mock, readArtifactBranch continues and returns invalid branch to caller. Correct in production but test pattern allows post-exit execution. — *Security Hardening — Command Injection Elimination*
- **test:** Enforcement test (A023) asserts on source code content via grep — violates testing-standards skill rule 'never assert on source code content' but is the only practical way to enforce convention. Spec explicitly requested this pattern. — *Security Hardening — Command Injection Elimination*
- **test:** Enforcement test comment-filter heuristic checks line prefix only (starts with //, *, /*). An execSync buried mid-line after non-comment code wouldn't be caught if the line also starts with a comment-like pattern. Low probability given codebase conventions. — *Security Hardening — Command Injection Elimination*

### General

- **code:** addHelpCommand(false) breaks 'ana help <cmd>' — users who learned that pattern get an error — *CLI UX Polish — First 10 Minutes*
- **test:** No contract assertions are covered by @ana-tagged tests — all verified by source inspection and live invocation only — *CLI UX Polish — First 10 Minutes*
- **test:** No test coverage for pre-commit bypass behavior (A006/A007) — shell hook not exercised in vitest suite — *Proof System Near-Term — Learn Infrastructure Foundation*
- **test:** No dedicated integration tests for command entry point injection rejection — saveArtifact, completeWork, createPr, strengthen — *Security Hardening — Command Injection Elimination*
- **test:** No dedicated tests for v1-release-prep contract — assertions verified by source inspection only — *V1 Release Prep*

