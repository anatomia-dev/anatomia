# Scope: `ana init commit` — persist infrastructure to git

**Created by:** Ana
**Date:** 2026-05-14

## Intent

The CLI has no concept of committing infrastructure. Init writes files to disk. Setup enriches them. Neither commits. A teammate who clones gets nothing Anatomia-related. The investment of a 10-minute setup session exists only on one developer's machine. This scope adds `ana init commit` — a command that commits Anatomia infrastructure files to the artifact branch, distinct from pipeline artifacts (`ana artifact save`) and proof chain data (`ana work complete`, `ana proof close/promote/strengthen`).

The requirements for this scope were developed through deep investigation of the init, setup, artifact save, work, and proof command codebases, followed by two rounds of redundant scrutiny (7 independent reviewers total). All findings were verified against source code. The full requirements document is at `anatomia_reference/CONTEXT_COMMIT_REQUIREMENTS.md`.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — one new command file, small modifications to 4-5 existing files, documentation updates across 4 pages
- **Files affected:** ~8-10 files across cli and website packages
- **Blast radius:** Low. One new command file concentrates the logic. Existing commands are not modified — only init's success message and the setup agent template gain awareness of the new command.
- **Estimated effort:** 1 pipeline cycle (single-phase plan → build → verify)
- **Multi-phase:** no

## Approach

Add `ana init commit` as a subcommand of `ana init`, following the guard-commit-push sequence proven by `artifact save` but at the implementation complexity of `commitAndPushProofChanges` (~30 lines of commit mechanics, not `artifact save`'s 370 lines of artifact-type-specific logic). The command discovers dirty infrastructure files via known directory roots plus `git status`, excludes pipeline data and runtime state via an explicit exclusion list, and commits with path-scoped `git commit -- <paths>`. Init's success message gains a commit-readiness check (branch comparison, zero additional git operations) that tells the user whether the commit will work before they try. Setup's Step 8 auto-invokes the command after `ana setup complete`, with a branch check and offer-to-switch after Step 2's config confirmation.

The critical design decision is the infrastructure/pipeline boundary: this command commits project configuration and context (ana.json, scan.json, context files, agent definitions, skills, ENRICHMENT.md, CLAUDE.md, AGENTS.md). It explicitly excludes proof chain files, plan directories, and per-developer state. Each exclusion was verified against the source code — every excluded file has its own commit lifecycle managed by another command.

## Acceptance Criteria

- AC1: `ana init commit` commits all Anatomia infrastructure files (`.ana/` config+context, `.claude/` agents+skills+settings+ENRICHMENT.md, `CLAUDE.md`, `AGENTS.md`, monorepo primary-package `AGENTS.md`) to the artifact branch with a single path-scoped commit.
- AC2: `ana init commit` excludes pipeline data: `proof_chain.json`, `PROOF_CHAIN.md`, and all contents of `plans/` are never staged or committed by this command.
- AC3: `ana init commit` excludes runtime state and per-developer files: `.ana/state/`, `.ana/worktrees/`, `.claude/settings.local.json`, `.claude/agent-memory/` are never staged or committed.
- AC4: `ana init commit` validates the execution context before committing: refuses to run from a worktree (`isWorktreeDirectory()` guard), refuses to run on the wrong branch (artifact branch validation), and pulls with rebase before committing (remote-aware, skips pull if no remote).
- AC5: `ana init commit` uses `--no-verify` on git commits and path-scoped `git commit -- <paths>` to avoid triggering pre-commit hooks and avoid including unrelated staged files.
- AC6: `ana init commit` is idempotent — running it when all infrastructure is already committed and unchanged exits with "Context is up to date" (exit 0).
- AC7: `ana init commit` produces context-aware commit messages: `[ana] Initialize project context` on first commit (ana.json not yet tracked) or `[ana] Update project context` on subsequent commits. Includes co-author trailer from `ana.json`.
- AC8: `ana init commit` pushes after committing, with soft-fail on push failure (same pattern as `artifact save`). Warns but does not exit non-zero if push fails.
- AC9: Init's `displaySuccessMessage` performs a commit-readiness check (compares current branch to artifact branch) and displays the result inline: `ana init commit — Save to {branch} ✓` or `⚠ you're on {currentBranch}`.
- AC10: The setup agent template (`ana-setup.md`) checks the branch after Step 2 (config confirmation) and offers to switch if not on the artifact branch. Step 8 auto-invokes `ana init commit` if on the artifact branch, or prints a fallback instruction if not.
- AC11: Monorepo primary-package `AGENTS.md` is discovered via `scan.json` at `monorepo.primaryPackage.path` and included in the commit if it exists on disk.
- AC12: File discovery uses known directory roots (`.ana/`, `.claude/`, root `CLAUDE.md`, root `AGENTS.md`, monorepo `AGENTS.md`) with explicit exclusions, filtered by `git status` for untracked or modified files. Not a hardcoded file list.
- AC13: Documentation is updated: quickstart adds the commit step between init and first pipeline run, setup guide notes auto-commit behavior, context concept page describes the infrastructure persistence lifecycle, toolbelt page lists the new command.

## Edge Cases & Risks

- **User runs init on wrong branch, then `ana init commit`:** Branch validation catches this. Clear error message directs user to switch branches. Init files survive branch switch (untracked files are preserved by `git checkout`).
- **Dirty proof chain from `work complete` crash:** The exclusion list prevents this command from absorbing proof chain data. `work complete` has its own crash recovery (work.ts:1346-1360). Each subsystem manages its own lifecycle.
- **Skill files straddling the boundary:** `proof promote` and `proof strengthen` also commit `.claude/skills/*/SKILL.md`. The infrastructure commit command commits skill files too when they're dirty from setup enrichment. The operations are temporally disjoint — a user doesn't run setup and proof promote simultaneously. Commit messages distinguish the source (`[ana] Update project context` vs. `[proof] Promote ...`).
- **Two developers commit infrastructure simultaneously (shotgun customer):** Pull-before-commit handles this. If `scan.json` conflicts (different detection results), standard git conflict resolution applies. The command doesn't need to solve merge conflicts.
- **Setup on wrong branch, user declines to switch:** Setup proceeds locally. Step 8 skips auto-commit. Prints fallback instruction. Files persist on disk across branch switches.
- **`git checkout` fails during setup branch switch (dirty working tree):** Agent tells user to stash or commit first, then re-run setup. Untracked init files (first-time scenario) survive checkout without stashing.
- **No `.ana/` directory:** Command errors with "Run `ana init` first." Same guard pattern as other commands that require init.
- **No git repository:** `findProjectRoot()` or branch check fails early with clear error.

## Rejected Approaches

**Extending init with a `--commit` flag:** Same mechanism needed after setup, re-init, and standalone scan. A flag couples the commit to init; a subcommand is independently callable but still discoverable under `ana init`.

**Auto-committing inside init:** Init is a pure scan+write operation. Adding git side effects changes its contract. The user might be on the wrong branch. First-time users would be surprised by an unexpected commit. Keep init pure, make commit explicit.

**Git-only discovery (commit everything dirty in `.ana/` and `.claude/`):** Doesn't respect the infrastructure/pipeline boundary. Would sweep up dirty proof chain files and plan artifacts. Rejected with LOW confidence by all reviewers.

**Manifest file approach:** Init writes a list of created files. The commit command reads it. Adds a new file and contract that can drift from reality. Rejected as unnecessary complexity.

**Four-message commit variants:** Distinguishing post-setup, post-reinit, post-scan in the commit message. Detection requires reading setupPhase transitions and scan timestamps. Over-engineered for forensic value that doesn't change behavior.

**Excluding ENRICHMENT.md from commits:** The setup agent depends on ENRICHMENT.md presence to detect template vs. user-created skills. Excluding them breaks Developer B's setup experience on shotgun teams. The upgrade noise (small files changing on version upgrades) is acceptable.

**Blocking setup when on the wrong branch:** Setup enriches files locally regardless of branch. Blocking prevents useful work. Warning + offer-to-switch + Step 8 skip is more user-friendly.

## Open Questions

- **OQ1 mechanism for `agent-memory/` exclusion:** The exclusion MUST live in the commit command's discovery logic. Additionally, consider adding `.claude/agent-memory/` to a `.claude/.gitignore` that init creates — belt-and-suspenders. Defer the gitignore addition decision to Plan if scope needs trimming.
- **R14 (Ana agent infrastructure awareness):** A one-line addition to Ana's Step 0 that checks `git ls-files --error-unmatch .ana/ana.json` and mentions if infrastructure isn't committed. Valuable but outside the core scope — Plan can include or defer.

## Exploration Findings

### Patterns Discovered
- `commitAndPushProofChanges` (proof.ts:156-195): 30-line commit-push pattern with retry. Closest structural analog for the commit mechanics.
- `artifact save` (artifact.ts:1120-1490): Guard sequence (worktree → branch → pull → commit → push) is the right ORDER. Implementation complexity (370 lines, 8 artifact types) is NOT the right model.
- `pullBeforeRead` (proof.ts:126-140): Pull-with-rebase pattern with remote check, conflict detection, and network-failure warning.
- `setup complete` as subcommand (setup.ts:50-142): Commander.js subcommand pattern with bare action on parent command.

### Constraints Discovered
- [TYPE-VERIFIED] `--no-verify` pattern (artifact.ts:1465, work.ts:2232) — 4 of 5 CLI commit sites use it. proof.ts:165 omits it (latent bug, separate scope).
- [TYPE-VERIFIED] Path-scoped commit pattern (artifact.ts:1465) — `git commit -- <paths>` prevents sweeping up unrelated staged files.
- [TYPE-VERIFIED] `isWorktreeDirectory()` guard (index.ts:63, setup.ts:58, scan.ts:384) — three existing precedents for commands that modify shared state.
- [OBSERVED] `proof promote/strengthen` commit `.claude/skills/*/SKILL.md` — skill files straddle the infrastructure/pipeline boundary. Temporally disjoint, acceptable.
- [OBSERVED] `.ana/.gitignore` template generates only `state/` and `worktrees/` (assets.ts:73-76). On-disk file in this repo has 2 additional legacy entries. Functionally irrelevant — `worktree-meta.json` and `worktree-context.md` are only written inside `worktrees/` (already covered).
- [OBSERVED] `ana.json` does not store `primaryPackage.path` — only `scan.json` does at `monorepo.primaryPackage.path`.

### Test Infrastructure
- `artifact save` tests cover the same git mechanics (branch validation, path-scoped commits, push soft-fail). Follow that pattern for the new command's tests.

## For AnaPlan

### Structural Analog
`commitAndPushProofChanges` at proof.ts:156-195 for the commit mechanics. `artifact save`'s `saveArtifact` at artifact.ts:1120 for the guard sequence ORDER (not the implementation). `setup complete` at setup.ts:50 for the subcommand registration pattern.

### Relevant Code Paths
- `packages/cli/src/commands/init/index.ts` — where `init commit` subcommand will be registered
- `packages/cli/src/commands/init/state.ts` — `displaySuccessMessage` at line 608, needs commit-readiness check
- `packages/cli/src/commands/setup.ts` — subcommand registration pattern to follow
- `packages/cli/src/commands/proof.ts` — `commitAndPushProofChanges` at line 156, `pullBeforeRead` at line 126
- `packages/cli/src/commands/artifact.ts` — guard sequence at lines 1076-1112, pull at 1373-1388, commit at 1465
- `packages/cli/src/utils/git-operations.ts` — `getCurrentBranch` at line 207, `readArtifactBranch`, `readCoAuthor`, `runGit`
- `packages/cli/src/utils/worktree.ts` — `isWorktreeDirectory` for the worktree guard
- `packages/cli/src/utils/validators.ts` — `findProjectRoot`
- `packages/cli/templates/.claude/agents/ana-setup.md` — Step 2 (config confirmation) and Step 8 (completion) need modification

### Patterns to Follow
- `commitAndPushProofChanges` for stage → commit → push-with-retry
- `pullBeforeRead` for pull-with-rebase before committing
- `validateBranch` in artifact.ts for branch validation
- `setup.ts` for Commander.js subcommand registration under a parent command
- `displaySuccessMessage` for extending init's output with readiness check

### Known Gotchas
- `init/index.ts` has a bare `.action()` handler on the init command. Adding a subcommand requires Commander.js to distinguish `ana init` (bare action = run scan) from `ana init commit` (subcommand = commit infrastructure). The `setup` command at setup.ts:40 proves this works — bare action + subcommands coexist.
- `primaryPackage.path` lives in `scan.json`, not `ana.json`. The discovery mechanism must read `scan.json` for monorepo support.
- The setup agent template uses merge-not-overwrite on re-init (assets.ts:258-270). The command name `ana init commit` is hardcoded once and sticks for existing users.

### Things to Investigate
- Whether the file discovery should use `git status --porcelain` (machine-parseable) or `git diff` against HEAD for tracking modified files within the known roots. The `artifact save` pattern stages specific known paths; this command needs to discover paths first, which is a different operation.
- The exact output format for the success message — how many files to list, whether to group by directory, how to handle the "up to date" case. Follow the `artifact save` success message style (one green ✓ line).
