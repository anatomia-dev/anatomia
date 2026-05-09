# Scope: work start must commit timestamps it writes to the artifact branch

**Created by:** Ana
**Date:** 2026-05-08

## Intent
`ana work start` writes timestamps to `.saves.json` on the artifact branch without committing, creating dirty tracked state that blocks `git pull --rebase` for concurrent pipeline work. The user wants this fixed — it caused a confirmed failure during concurrent work on 2026-05-07 and is a recurring friction source. Secondary: comments and messages in the affected files say "main" when they mean "artifact branch," which is misleading for customers using a different artifact branch name.

## Complexity Assessment
- **Kind:** fix
- **Size:** small
- **Files affected:** `packages/cli/src/commands/work.ts` (timestamp commits + comment/message fixes), `packages/cli/src/commands/artifact.ts` (one message fix)
- **Blast radius:** `work start` behavior only. `artifact save` and `work complete` are unaffected. `artifact save scope` now rebases over the work_started_at commit but this is transparent — it already pulls before committing.
- **Estimated effort:** ~1 hour
- **Multi-phase:** no

## Approach
Apply the design rule from `f278510` consistently: if you write to the artifact branch, commit it. `work start` is the only command that writes to the artifact branch without committing. Add a stage-and-commit after each `writeTimestamp` call that targets the artifact branch (Think and Plan phases). Build/Verify/Fix phases already write to the worktree — no change needed there.

The commit is scoped to this slug's `.saves.json` only, uses `readCoAuthor()` for the trailer, and does not push (artifact save handles push). The write-once guard in `writeTimestamp` means repeat calls are no-ops — the commit must handle the case where nothing changed gracefully.

While touching these files, fix comments and user-facing messages that say "main" when they mean "artifact branch." The code already uses `artifactBranch` variable for all branch operations — only the human-readable strings are wrong.

## Acceptance Criteria
- AC1: After `work start {slug}` creates a new work item (Think phase), `.saves.json` is committed to the artifact branch — `git status` shows no unstaged changes for that file
- AC2: After `work start {slug}` enters Plan phase (scope exists, no plan), `.saves.json` is committed to the artifact branch — `git status` shows no unstaged changes for that file
- AC3: Think phase commit message is `[{slug}] Start work` with co-author trailer
- AC4: Plan phase commit message is `[{slug}] Start plan phase` with co-author trailer
- AC5: Second call to `work start {slug}` for the same phase (write-once no-op) does not create an empty commit and does not error
- AC6: The commit stages only `.ana/plans/active/{slug}/.saves.json` — no other files are included
- AC7: No `git push` is executed by `work start`
- AC8: Comments and messages in work.ts and artifact.ts that say "main" when meaning the artifact branch are corrected. Messages referring to the "main project directory" or "main tree" (git's primary working tree) are left unchanged.

## Edge Cases & Risks
**`artifact save scope` after committed `.saves.json`.** `artifact save` does `git pull --rebase` for planning artifacts (artifact.ts line 1201). The work_started_at commit rebases cleanly — it only touches this slug's .saves.json, no cross-slug conflict possible. Then artifact save stages .saves.json again with scope hash added and commits. Two commits for .saves.json in history. This is correct behavior.

**Pre-existing dirty state from another file.** The commit stages only this slug's .saves.json (scoped `git add`). Other dirty files don't affect it.

**Pre-commit hook.** `.husky/pre-commit` lines 11-18 skip commits that only touch `.ana/` files. These commits are skipped automatically.

**User abandons work after `work start`.** Commit exists on artifact branch with only work_started_at. Harmless — same as today minus the dirty state.

**No remote configured.** No push (R5), so no issue. Think phase's existing pull (line 1586) already handles this.

## Rejected Approaches
**Remove `plan_started_at` entirely.** Would lose accurate plan timing — a feature deliberately shipped through the full pipeline in `phase-timing-fix` (PR #86). Proof chain data shows the fallback conflates idle time with work: nav-polish shows plan=7m with plan_started_at vs plan=14m without. Removing data to fix a side effect is painting over, not fixing.

**Stash before pull in `work complete`.** Treats the symptom (dirty state blocks pull) without fixing the cause (uncommitted writes). Adds code to manage a problem instead of removing the problem.

**Move `plan_started_at` to `artifact save plan`.** Would give plan_started_at the same value as plan.saved_at, making it redundant. The whole point is recording when the phase started, not when it ended.

## Open Questions
None.

## Exploration Findings

### Patterns Discovered
- `f278510`: established the "write to worktree, not artifact branch" rule for build/verify timestamps. Comments explicitly say "to avoid dirty .saves.json blocking git pull." Plan was missed because it runs before the worktree exists.
- `397752a` (phase-timing-fix): shipped `plan_started_at` as a full pipeline work item. Updated ana-plan template (line 34) to call `work start` at session start. Proof chain shows meaningful timing separation after this shipped.
- `artifact save` commit pattern (artifact.ts lines 1260-1286): stages .saves.json, checks for staged changes via `git diff --staged --quiet`, commits with `spawnSync('git', ['commit', ...])`. This is the structural analog for the commit logic in work start.

### Constraints Discovered
- [TYPE-VERIFIED] `writeTimestamp` write-once guard (work.ts line 1868) — returns early if key exists unless `force: true`. Second call is a no-op, file unchanged.
- [TYPE-VERIFIED] `readCoAuthor()` (git-operations.ts) — reads from ana.json, returns the configured co-author string. Already imported in work.ts (line 22).
- [TYPE-VERIFIED] Pre-commit hook skips `.ana/`-only commits (`.husky/pre-commit` lines 14-18).
- [TYPE-VERIFIED] Code uses `artifactBranch` variable everywhere for branch operations — never hardcoded "main." Only comments and string literals have the wrong terminology.
- [OBSERVED] "main tree" / "main project directory" in messages is correct git terminology for the primary working tree. Must NOT be changed to "artifact branch" — these refer to the checkout location, not the branch name.

### Test Infrastructure
- Existing tests at work.test.ts lines 2764-2861 (`describe('ana work start')`) test Think phase: directory creation (A015), work_started_at writing (A016), confirmation message, slug validation, branch validation, uniqueness.
- Existing test at work.test.ts line 3522 tests Plan phase: plan_started_at writes plan_agent (A019).
- Tests use `execSync('git init')` + `execSync('git add -A && git commit')` to set up git state. Same pattern works for verifying new commits.

## For AnaPlan

### Structural Analog
artifact.ts lines 1260-1286 — the commit logic in `artifact save`. Same pattern: stage specific files with `runGit(['add', ...])`, check for changes with `spawnSync('git', ['diff', '--staged', '--quiet'])`, commit with `spawnSync('git', ['commit', '-m', ...])`. Closest structural match for the commit logic to add to `work start`.

### Relevant Code Paths
- `packages/cli/src/commands/work.ts` line 1600 — Think phase `writeTimestamp` (add commit after)
- `packages/cli/src/commands/work.ts` line 1637 — Plan phase `writeTimestamp` (add commit after)
- `packages/cli/src/commands/work.ts` line 22 — `readCoAuthor` already imported
- `packages/cli/src/commands/artifact.ts` line 1260-1286 — structural analog for commit pattern
- `packages/cli/src/commands/work.ts` lines 1031, 1076, 1096, 1102, 1388, 1649, 1681, 1720, 1796 — "main" → "artifact branch" in comments/messages
- `packages/cli/src/commands/artifact.ts` line 937 — "main" → "artifact branch tree" in user-facing message

### Patterns to Follow
- artifact.ts lines 1267-1272 for the "check before commit" pattern (`git diff --staged --quiet`)
- artifact.ts line 1281 for the commit call (`spawnSync('git', ['commit', '-m', ...])`)
- work.ts line 1372 for commit message formatting with co-author in work.ts context

### Known Gotchas
- `writeTimestamp` returns `Promise<void>` with no indication of whether it actually wrote. The commit logic must check independently (via `git diff --staged --quiet` after staging) rather than relying on writeTimestamp's return value.
- The Think phase creates the directory AND writes .saves.json in the same block (lines 1597-1600). The `git add` must target the .saves.json specifically, not the directory — the directory may also contain scope.md that Ana hasn't written yet.
- For the R7 terminology fixes: "main tree" and "main project directory" must NOT be changed — these are correct git terminology for the primary working tree. Only instances where "main" means the branch should change.

### Things to Investigate
- Determine whether the commit helper should be extracted as a shared function (used by both Think and Plan paths) or inlined in each. Design judgment — shared function is cleaner but only two call sites.
