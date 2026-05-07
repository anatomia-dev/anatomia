# Proof Chain Dashboard

60 runs · 104 active · 73 lessons · 0 promoted · 160 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/tests/commands/work.test.ts | 10 | 8 |
| packages/cli/tests/commands/proof.test.ts | 10 | 4 |
| packages/cli/src/commands/proof.ts | 7 | 5 |
| packages/cli/src/utils/proofSummary.ts | 6 | 5 |
| packages/cli/src/commands/work.ts | 5 | 4 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 104 total)

### packages/cli/src/commands/agents.ts

- **code:** Double error message on unknown agent in setModel() — throws after console.error, catch block re-prints — *Agent Dashboard Phase 1*
- **code:** maxModelLen computed inside the loop body on every iteration instead of once before the loop — *Agent Dashboard Phase 1*

### packages/cli/src/commands/artifact.ts

- **code:** archivePreviousVersion uses string equality for content comparison — could produce false archives on Windows with CRLF line endings from git — *Rejection Cycle Artifact Preservation*
- **code:** No upper bound on round numbers — a slug that goes through many rejection cycles will accumulate archive files with no cleanup mechanism — *Rejection Cycle Artifact Preservation*

### packages/cli/src/commands/init/index.ts

- **test:** Guard commands (A028-A032) have no integration tests — *Worktree Isolation*

### packages/cli/src/commands/init/state.ts

- **test:** A010 has no runtime test — verified by source inspection only — *Non-Main Artifact Branch Tests*

### packages/cli/src/commands/proof.ts

- **code:** proof.ts WRONG_BRANCH primary error still says 'Switch to main' even in worktree context — *Worktree Isolation*

### packages/cli/src/commands/work.ts

- **test:** A021 has no tagged test — verified by source inspection only — *Worktree Isolation*
- **test:** Phase detection logic (A001-A003, A006-A011) has no dedicated tagged tests — *Worktree Isolation*

### packages/cli/src/utils/agent-config.ts

- **code:** AgentFrontmatter interface exported but never imported outside agent-config.ts — *Agent Dashboard Phase 1*

### packages/cli/src/utils/worktree.ts

- **code:** detectWorktreeSlug empty-string guard removed — unrelated to website-lift scope — *Website Lift*
- **code:** Double H2 heading in risk profile — worktree.ts pushes '## Proof Findings' then proofFindings content starts with '## Risk Profile' — *Worktrees V2 — Phase Timing + Danger Map + Prune*
- **code:** branchExists exported only for test imports — not used by production code — *Worktree Isolation*
- **code:** isWorktreeDirectory false-positive risk in git submodules — *Worktree Isolation*
- **code:** detectWorktreeSlug path-based detection fragile if project root contains .ana/worktrees/ — *Worktree Isolation*

### packages/cli/tests/commands/agents.test.ts

- **test:** A002 test uses toBeGreaterThan(templateSize) — correct intent but could assert exact expected value since skill content is fixture-controlled — *Agent Dashboard Phase 1*

### packages/cli/tests/commands/artifact.test.ts

- **test:** A014 test does not exercise actual archive failure (catch branch). Tests first-save no-op, not error recovery. — *Rejection Cycle Artifact Preservation*
- **test:** A010 test catches process.exit(0) as throw — structurally correct but test name suggests content-identity check while the code path is no-changes-to-commit — *Rejection Cycle Artifact Preservation*

### packages/cli/tests/commands/check.test.ts

- **code:** check.test.ts fixture uses 'active sprints' — slightly odd phrasing for a mock project-context but acceptable — *Code Comment Cleanup*

### packages/cli/tests/commands/work.test.ts

- **test:** A017 (build_agent) and A020 (verify_agent) lack direct tagged tests — covered by source inspection only — *Worktrees V2 — Phase Timing + Danger Map + Prune*
- **test:** completeWork test builds fixture manually (60 lines) instead of using createMergedProject helper — *Non-Main Artifact Branch Tests*

### packages/cli/tests/engine/types.test.ts

- **test:** types.test.ts compile-time assertions use expect(true).toBe(true) — sentinel pattern, but acceptable because the real assertion is TypeScript compilation — *Code Comment Cleanup*

### packages/cli/tests/utils/proofSummary.test.ts

- **test:** A013/A014 are type-level sentinels — construct PipelineStats manually, don't test computePipelineStats computes median_plan — *Worktrees V2 — Phase Timing + Danger Map + Prune*

### packages/cli/tests/utils/worktree.test.ts

- **test:** detectWorktreeSlug empty-string test is environment-dependent — pre-existing, fails inside worktrees — *Worktrees V2 — Phase Timing + Danger Map + Prune*
- **test:** Pre-existing worktree.test.ts failure — detectWorktreeSlug('') returns slug when run inside worktree — *Non-Main Artifact Branch Tests*
- **test:** A012 and A037 use typeof assertions instead of value assertions — *Worktree Isolation*

### website/lib/proof-feed.ts

- **code:** mapEntry never produces kind 'chore' — only 'fix' or 'feature' — *Website Lift*
- **code:** Hardcoded version 'v1.0.2' will go stale — *Website Lift*
- **code:** Empty entries returns [] instead of mockFeed — blank state possible — *Website Lift*
- **code:** extractFeatureEm on single-word feature returns that word — acceptable for display — *Website Lift*

