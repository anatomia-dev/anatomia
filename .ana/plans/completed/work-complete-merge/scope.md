# Scope: work complete --merge flag for structured PR merging

**Created by:** Ana
**Date:** 2026-05-08

## Intent
The pipeline manages every step from scope to PR creation, but merge is unmanaged. When developers delegate the merge to an agent (which they inevitably do), the agent improvises with raw `gh` commands — using `--delete-branch` (worktree conflict), `--squash` (opinionated), `--admin` (bypasses branch protection) — producing confusing errors and inconsistent state. Observed live: the verify agent hit every one of these failure modes in sequence when asked to merge PR #95. The user wants a structured merge path that agents can use without improvising.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — one new code path in work.ts, four template/message updates, one `gh` guard
- **Files affected:** `packages/cli/src/commands/work.ts`, `packages/cli/templates/.claude/agents/ana-verify.md`, `packages/cli/templates/.claude/agents/ana.md`
- **Blast radius:** `work complete` behavior only when `--merge` is passed. Without the flag, behavior is unchanged. Template changes are output text only — no logic changes. Existing tests unaffected (R4 guarantee: no behavioral change for existing usage).
- **Estimated effort:** 3-4 hours
- **Multi-phase:** no

## Approach
Add a `--merge` flag to `work complete` that merges the PR via GitHub's API before running the existing completion flow. The merge step slots between the existing validation (steps 0a-3) and pull (step 4) — it needs config data from validation, and the pull needs the merge to have happened. The flag is additive: `--merge` should never be worse than running without it (already-merged PRs are detected and skipped).

The merge uses bare `gh pr merge` — no merge strategy flag, no `--delete-branch`. GitHub uses the repo's configured default strategy. Branch cleanup is handled by `work complete`'s existing flow (worktree removal → local branch delete → remote branch delete), which already handles all the edge cases that `--delete-branch` gets wrong.

Failure modes have an escalation ladder: try merge → if checks pending, try `--auto` → if branch behind, show rebase commands → if unknown error, show raw stderr. Every failure exits before any completion logic runs — no partial state. The system never uses `--admin` and never auto-rebases.

Template changes present the `--merge` option as information at the four instructional touchpoints. Agent guardrails ("don't merge, don't run work complete") stay unchanged. The agent presents both paths; the human decides.

## Acceptance Criteria
- AC1: `ana work complete --merge {slug}` merges an open PR and completes the work item in one command
- AC2: Without `--merge`, `work complete` behavior is identical to current behavior — no regressions
- AC3: Merge uses `gh pr merge` without `--delete-branch` and without a merge strategy flag
- AC4: When `gh pr merge` fails because checks are pending, `--auto` is attempted; if `--auto` succeeds, output includes the PR number and tells the user to run `work complete` after it merges; exit without completing
- AC5: When `--auto` fails (repo doesn't have auto-merge enabled), output tells the user to merge manually or enable auto-merge; exit without completing
- AC6: When `gh pr merge` fails because the branch is behind, output includes the exact rebase commands with the worktree path, a `--force-with-lease` push, and a warning about approval dismissal; exit without completing
- AC7: When the PR is already merged, `--merge` skips the merge step and continues with normal completion — never worse than running without the flag
- AC8: When no PR exists for the branch, output tells the user to create one with `ana pr create`; exit without completing
- AC9: When `gh pr merge` fails because multiple merge strategies are enabled, output tells the user to merge manually or specify a strategy; exit without completing
- AC10: When `gh pr merge` fails for any unrecognized reason, output the raw `gh` stderr; exit without completing
- AC11: Before merging, verify the PR's base branch matches `artifactBranch`; if not, output the mismatch and exit
- AC12: Before merging, check `gh --version`; if `gh` is not installed, output install instructions and exit
- AC13: `--merge` exits before any existing completion steps (pull, archive, commit, push) on all failure paths — no partial completion
- AC14: `--admin` is never used, under any circumstance
- AC15: The verify agent template PASS output includes: `Or to merge and complete in one step: \`ana work complete --merge {slug}\``
- AC16: `work status` next-action text for `ready-to-merge` includes the `--merge` option
- AC17: The verification-passed message (work.ts line 1695) includes the `--merge` option
- AC18: Ana's pipeline state table (ana.md line 277) includes the `--merge` option
- AC19: Verify agent guardrails at lines 494 and 498 of ana-verify.md are NOT modified

## Edge Cases & Risks
**Race condition between merge and pull.** `gh pr merge` is synchronous — the GitHub API creates the merge commit before returning. `git pull --rebase` in step 4 will find it. Merge queues (which make `gh pr merge` async) are out of scope — they'd cause step 6's merge detection to fail, which is the correct behavior (user retries without `--merge` after the queue processes).

**Force-push dismisses approvals.** R4/AC6 addresses this by never auto-rebasing. The rebase commands are presented as a suggestion with a warning. The human or agent decides.

**`--auto` left dangling.** If auto-merge is set and the PR never passes checks, it stays enabled on GitHub indefinitely. This is GitHub's behavior — Anatomia doesn't manage it. Users cancel via GitHub UI or `gh pr merge --disable-auto`.

**`gh` not authenticated.** The `gh --version` check (AC12) catches "not installed" but not "not authenticated." An auth failure would fall through to the catch-all (AC10), which shows the raw `gh` error ("not logged in" or similar). Acceptable — the error is clear enough without special handling.

**Concurrent `--merge` calls.** Two agents running `work complete --merge` for the same slug. First merges, second hits AC7 (already merged, continue). The completion flow handles this via existing merge detection at step 6.

**`work complete --merge` from wrong branch.** Step 3 (line 1017) exits if not on artifact branch, before `--merge` runs. Error message at step 3 should mention `--merge` as context — currently says "The PR should be merged before completing" which is misleading when the user is trying to use `--merge` to do exactly that. Update to: "Switch to `{artifactBranch}` first. `--merge` handles the merge, but must run from the artifact branch."

## Rejected Approaches
**Auto-rebase when branch is behind.** Force-push after rebase can dismiss PR approvals on repos with "dismiss stale reviews on new pushes" enabled. For our pipeline (where Verify creates the PR and nobody approves), this is harmless. For shotgun customers with human review flows, it's a bad surprise. Manual rebase with a warning is safer across all customer types.

**`--admin` flag support.** The investigation's original Fix B proposed `--admin` as an explicit opt-in. Rejected: `--admin` bypasses branch protection, which exists to protect the repo. If checks are failing, the answer is to fix the checks or wait, not to bypass protection. The pipeline should never be the tool that circumvents a team's safety rails.

**Merge as default when PR exists.** Making `--merge` the default behavior when an unmerged PR exists would remove the human checkpoint entirely. The PR review is the last moment where a human exercises judgment on pipeline output. Making it trivially skippable changes what the pipeline is. Explicit `--merge` preserves the decision while making it easy.

**Put merge guidance in agent templates.** Teaching the verify agent how to merge (instead of building `--merge`) would encode "skip the human checkpoint" into default agent behavior. The template should present options, not execute them. `--merge` as a CLI command keeps the intelligence in the CLI, not the agent.

**Build a separate `ana merge` command.** A standalone merge command would duplicate state management that `work complete` already handles (slug resolution, branch names, worktree cleanup). Merging is not a standalone action — it's the first step of completion. A flag on the existing command is the right abstraction.

## Open Questions
None for Ana. Open questions for AnaPlan:
- `--json` interaction: when `--merge` triggers an early exit (AC4-AC6, AC8-AC10), should `--json` output structured JSON? `work complete --json` exists for programmatic consumption.
- stderr parsing strategy: how to reliably distinguish `gh pr merge` failure modes (checks pending vs. branch behind vs. multiple strategies). `gh` error messages aren't a stable API.
- Whether the `gh --version` guard should be extracted as a shared utility (pr.ts line 179 has an identical check).

## Exploration Findings

### Patterns Discovered
- `pr.ts` lines 179-184: the `gh` availability guard pattern. `spawnSync('gh', ['--version'])`, check status, clean error with install link. Identical pattern needed for `--merge`.
- `work.ts` lines 1226-1231: existing `gh pr view` call for squash merge detection. Same `spawnSync` + `encoding: 'utf-8'` + `stdio: 'pipe'` pattern for `gh` calls within `work complete`.
- `work.ts` lines 1233-1236: the "not merged" error message. Currently says "Merge the PR first, then run this command again." With `--merge`, this message is only reached when `--merge` is NOT passed (because `--merge` runs before step 6). No change needed — but the step 3 message (line 1019) does need updating.

### Constraints Discovered
- [TYPE-VERIFIED] `completeWork` signature (work.ts line 986): `async function completeWork(slug: string, options?: { json?: boolean })`. Options type needs `merge?: boolean` added.
- [TYPE-VERIFIED] Commander registration (work.ts lines 1943-1949): needs `.option('--merge', '...')` added to `completeCommand`. The `cmdOptions` type at line 1947 needs `merge?: boolean`.
- [TYPE-VERIFIED] Step 3 guard (line 1017): exits if not on artifact branch. `--merge` runs after this — user must be on artifact branch. Correct because `gh pr merge` is a GitHub API call, not a local git operation.
- [TYPE-VERIFIED] Step 4 pull (line 1028): `git pull --rebase`. Runs after `--merge`. The merged code arrives via this pull.
- [TYPE-VERIFIED] Step 6 merge detection (lines 1218-1240): checks `merge-base --is-ancestor` then falls back to `gh pr view`. With `--merge`, the PR is already merged by this point — detection should pass.
- [OBSERVED] The `completeCommand` description (line 1944) says "Archive completed work after PR merge." Needs updating — with `--merge`, it also performs the merge.

### Test Infrastructure
- Existing `work complete` tests at work.test.ts line 588+ use real git repos with `execSync('git init')`. Tests create feature branches, simulate merges, and verify archive behavior.
- Tests mock `spawnSync` for `gh` calls (line 1226 squash detection). Same pattern works for mocking `gh pr merge` and `gh pr view` in new tests.
- The `describe('ana work complete')` block at line 588 has sub-describes for single-spec, multi-spec, completeness checks, subdirectory runs, pull failure warnings, and auto-clean strategies. New `--merge` tests would be a new sub-describe at the same level.

## For AnaPlan

### Structural Analog
`pr.ts` lines 179-300 — the PR creation flow. Same pattern: check `gh` availability, call `gh` via `spawnSync`, handle multiple failure modes from stderr, exit with actionable messages. The `gh` guard (lines 179-184), the `spawnSync` call pattern (line 286), and the error handling (lines 291-300) are the closest structural match for the merge logic.

### Relevant Code Paths
- `packages/cli/src/commands/work.ts` line 986 — `completeWork` function signature (add `merge` to options)
- `packages/cli/src/commands/work.ts` lines 1001-1022 — steps 1-3 (validation, config reads, artifact branch check). Merge inserts after these.
- `packages/cli/src/commands/work.ts` line 1028 — step 4 (`git pull --rebase`). Merge must complete before this.
- `packages/cli/src/commands/work.ts` lines 1211-1240 — step 6 (merge detection). With `--merge`, this validates the merge succeeded.
- `packages/cli/src/commands/work.ts` line 524 — `work status` next-action text for `ready-to-merge`
- `packages/cli/src/commands/work.ts` line 1695 — verification-passed message
- `packages/cli/src/commands/work.ts` lines 1943-1949 — Commander registration for `completeCommand`
- `packages/cli/src/commands/pr.ts` lines 179-184 — `gh` availability guard (structural analog)
- `packages/cli/templates/.claude/agents/ana-verify.md` line 443 — PASS output message
- `packages/cli/templates/.claude/agents/ana-verify.md` lines 494, 498 — guardrails (DO NOT MODIFY)
- `packages/cli/templates/.claude/agents/ana.md` line 277 — pipeline state table

### Patterns to Follow
- `pr.ts` line 179 for the `gh --version` check
- `pr.ts` line 286 for the `spawnSync('gh', [...])` call pattern with `stdio: 'pipe'` and `encoding: 'utf-8'`
- `work.ts` line 1226 for `gh pr view` within `work complete` context

### Known Gotchas
- `gh pr merge` in non-interactive mode (which `spawnSync` is) won't prompt for merge strategy. If multiple strategies are enabled with no default, it errors. Must handle this case (AC9).
- `gh pr merge --auto` fails if the repo doesn't have "Allow auto-merge" enabled in GitHub settings (off by default). Must handle the `--auto` failure, not just the initial merge failure (AC5).
- The Commander option should be `--merge` not `-m` (which conflicts with commit message conventions and could confuse users).
- The step 3 error message (line 1019) says "The PR should be merged before completing" — misleading when the user tried `--merge`. Update this message to mention `--merge` when the flag is set but the user is on the wrong branch.

### Things to Investigate
- Determine the exact `gh pr merge` stderr patterns for each failure mode (checks pending, branch behind, multiple strategies, draft PR, required approvals). Design a detection strategy that's resilient to `gh` version changes — keyword matching with catch-all fallback, not exact string matching.
- Decide whether `--json` early exits need structured JSON envelopes. Check whether any existing consumer relies on `work complete --json` output structure.
- Evaluate whether extracting the `gh --version` guard into a shared utility (used by both `pr.ts` and `work.ts`) is worth the indirection vs. duplicating the 5-line check.
