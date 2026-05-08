# Scope: Worktree Artifact Path Mismatch — Prevention and Cleanup

**Created by:** Ana
**Date:** 2026-05-07

## Intent

Build and Verify agents run in worktrees but Claude Code's Write tool resolves absolute paths against the main tree. The agent writes `build_report.md` to the main tree. `artifact save` detects this but errors with manual recovery instructions instead of fixing it, leaving a stale copy on main. When `work complete` pulls the merged PR, git refuses because the untracked file would be overwritten. In re-build scenarios (verify FAIL, fix, new artifacts), the stale copy diverges from the PR content, and the existing content-match auto-clean (`be3374f`) can't help.

This is a recurring pipeline-blocker. It happened, was partially fixed, and re-occurred during test-suite-hygiene. The user wants it solved permanently with defense-in-depth.

## Complexity Assessment
- **Kind:** fix
- **Size:** medium
- **Files affected:** `packages/cli/src/commands/artifact.ts`, `packages/cli/src/commands/work.ts`, `packages/cli/templates/.claude/agents/ana-build.md`, `packages/cli/templates/.claude/agents/ana-verify.md`
- **Blast radius:** artifact save flow (detection block + post-save), work complete flow (auto-clean block), agent templates (write instructions for Build and Verify only). No impact on scan, init, proof, or planning artifact handling.
- **Estimated effort:** ~2 hours
- **Multi-phase:** no

## Approach

The disease is detection-without-correction: `artifact save` already knows the file is in the wrong place but punts to the user instead of fixing it. The fix is to correct the file's location at the point of detection and continue the save. No stale copy is ever created, no agent round-trip is needed.

Three mechanical layers, each covering a failure mode the previous layer can't reach:

**Layer 1 (artifact save — auto-move):** When `artifact save` finds the report on the main tree instead of the worktree, move it (and its data companion) to the worktree and continue the save. This eliminates the stale-copy problem at source.

**Layer 2 (artifact save — post-save sweep):** After a successful save from a worktree, check if the main tree has untracked copies of the saved files. Delete them. This covers the edge case where the agent wrote to both trees — the worktree copy exists so Layer 1 never fires, but the main-tree copy persists.

**Layer 3 (work complete — refined auto-clean):** Refine `be3374f`'s auto-clean to split behavior by file type. Build/verify artifacts (always agent-written, never belong on main) get removed unconditionally. Planning artifacts keep the existing content-match guard. This is the last resort for when artifact save never ran (agent crash, session death).

**Layer 4 (agent templates — pwd hint):** Update Build and Verify write instructions to say "use `pwd` for the absolute path." Universally correct wording — no worktree-specific concepts. Soft prevention only. Ana and Plan templates are not affected because they run on the artifact branch where the main tree IS the correct location.

## Acceptance Criteria
- AC1: `artifact save build-report {slug}` succeeds when the report file exists only on the main tree (auto-moved to worktree, save completes, no stale copy on main)
- AC2: When the report's data companion (`build_data.yaml` / `verify_data.yaml`) is also on the main tree, both files are moved together before the save continues
- AC3: After a successful worktree save, any untracked copies of the saved files on the main tree are deleted
- AC4: `work complete` removes untracked `build_report*.md`, `build_data*.yaml`, `verify_report*.md`, `verify_data*.yaml` from the slug's plan directory without requiring content-match
- AC5: `work complete` still requires content-match for planning artifacts (`scope.md`, `spec.md`, `plan.md`, `contract.yaml`) — no behavior change for those
- AC6: Build and Verify agent templates use `pwd`-based path guidance for artifact writes
- AC7: All auto-move and cleanup operations only act on untracked files (tracked files are never touched)
- AC8: All cleanup operations are best-effort — failure to clean never fails the save or completion

## Edge Cases & Risks
- **Cross-filesystem worktree:** `renameSync` throws EXDEV if worktree is on a different filesystem. Must fall back to copy + delete.
- **Tracked file on main with same name:** If someone committed a build report directly to main, auto-move would be wrong. The untracked check (`git ls-files --error-unmatch`) guards against this.
- **Agent writes to both trees:** Layer 1 never fires (worktree copy exists). Layer 2 catches the stale main-tree copy after save.
- **Agent crash before artifact save:** Neither Layer 1 nor Layer 2 runs. Layer 3 catches it at work complete time.
- **TOCTOU on cleanup:** Another process could delete the file between existence check and `unlinkSync`. Wrap in try-catch.
- **Planning artifacts untracked on main:** Could happen if a scope save was interrupted. R3 must NOT remove these — filename-pattern matching (not directory-prefix matching) ensures this.

## Rejected Approaches

**Pre-write path command (`ana artifact path`):** Add a command the agent calls before writing to get the correct absolute path. Requires agent compliance (trust-based), adds a new command, changes the template contract. R1 is better — works regardless of agent behavior. Verified over trusted.

**Symlink main-tree plan directory to worktree:** Fragile — the plan directory on main is shared across work items. Would break concurrent work items.

**Directory-prefix matching in R3:** The first version of the REQ used `.ana/plans/active/{slug}/` as a prefix match for auto-clean. This would also match planning artifacts that legitimately live on main. Filename-pattern matching is strictly better.

## Open Questions

None. All factual questions resolved during investigation.

## Exploration Findings

### Patterns Discovered
- artifact.ts:938-951: Wrong-tree detection block. Checks `getMainTreeRoot(projectRoot)`, finds file on main, errors with copy instructions.
- artifact.ts:1018-1049: Companion file discovery. Uses `deriveCompanionFileName()` to find `build_data.yaml` alongside `build_report.md`. If R1 moves the report but not the companion, the save fails here instead.
- work.ts:1053-1082: Auto-clean block from `be3374f`. Scopes by directory prefix, content-matches all files uniformly.

### Constraints Discovered
- [TYPE-VERIFIED] `findProjectRoot()` (validators.ts:169) resolves to worktree root when running from a worktree — looks for `.ana/ana.json` + `.git` (file or directory)
- [TYPE-VERIFIED] `getMainTreeRoot()` (worktree.ts:61) parses the `.git` file's `gitdir:` line to find the main tree. Returns input unchanged if not a worktree.
- [TYPE-VERIFIED] `deriveCompanionFileName()` (artifact.ts:800) maps `build_report.md` → `build_data.yaml`, `verify_report_1.md` → `verify_data_1.yaml`. Handles round suffixes.
- [OBSERVED] Only Build and Verify agents are affected — Ana and Plan run on the artifact branch where main tree IS the correct write target.
- [OBSERVED] `be3374f` shipped today. R3 refines it — same structure, tighter scoping by filename pattern instead of directory prefix.

### Test Infrastructure
- Existing artifact.ts tests use fs mocking and git operation mocking. Follow the same patterns.
- work.ts tests exist for the completion flow. Extend with filename-specific auto-clean cases.

## For AnaPlan

### Structural Analog
artifact.ts lines 920-924 — the `renameSync` block for default-name-to-typed-name renaming. Same pattern: detect file in wrong location, move it, continue. Closest structural match to R1.

### Relevant Code Paths
- `packages/cli/src/commands/artifact.ts` — lines 938-951 (R1 detection), lines 1018-1049 (companion discovery, R1 must move companion before this), post-save around line 1074+ (R2 sweep)
- `packages/cli/src/commands/work.ts` — lines 1053-1082 (R3 auto-clean refinement)
- `packages/cli/src/utils/worktree.ts` — `getMainTreeRoot()` (used by R1 and R2)
- `packages/cli/templates/.claude/agents/ana-build.md` — line 275 (R4)
- `packages/cli/templates/.claude/agents/ana-verify.md` — line 69 (R4)

### Patterns to Follow
- artifact.ts:920-924 for the move pattern (renameSync with error handling)
- artifact.ts:800-806 for companion file derivation
- work.ts:1053-1082 for the auto-clean structure (keep the shape, refine the condition)

### Known Gotchas
- R1 MUST move the companion file in the same block, before the code reaches line 1018. If only the report is moved, the companion check at line 1029 will fail the save.
- R3 must use filename patterns, not directory prefix. The existing code uses `planPrefix` which catches everything in the slug directory including planning artifacts.
- The existing auto-clean message at line 1071 says "written by agent to wrong tree" — update to reflect the split behavior.

### Things to Investigate
- Determine whether the R2 post-save sweep should run before or after the git push. Running before push means the cleanup is local-only and doesn't affect the committed artifact. Running after push means the cleanup happens even if push fails — but push failure is a separate error path. Design judgment call.
