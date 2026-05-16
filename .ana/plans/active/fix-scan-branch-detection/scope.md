# Scope: Fix scan branch detection — remove local branches from shared intelligence

**Created by:** Ana
**Date:** 2026-05-15

## Intent

The scan engine captures local git branches alongside remote branches via `git branch -a`. When scan.json is committed and shared (via `ana init commit`, AnaDocs, or agent consumption), developer-local branch state — stale refs, experiment branches, old sprint fossils — becomes permanent project intelligence. Two developers scanning the same repo produce different branch lists. This was discovered when our own scan.json was committed with 98 branches, 89 of which were stale local refs.

The user wants scan.json to reflect the project's shared branch structure, not any individual developer's local git state.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — two functions in one file, plus test updates
- **Files affected:** `packages/cli/src/engine/detectors/git.ts` (primary), `packages/cli/tests/engine/detectors/git-detection.test.ts` (tests)
- **Blast radius:** Small code surface, wide data surface. Every customer's `scan.json` branch list changes on next scan. AnaDocs displays branch data at build time. The setup agent reads `branchPatterns.primary` to generate git-workflow rules. `detectArtifactBranch()` in `state.ts` reads the branch list during init. No code changes needed in any consumer — the fix only removes noise from the data they already read.
- **Estimated effort:** ~1 hour implementation + testing
- **Multi-phase:** no

## Approach

Align the branch list source with the branch patterns source. Both should read from the shared remote (`git branch -r`), not the developer's local state (`git branch -a`). For repos with no remote, fall back to local branches — the "shared intelligence" disease doesn't exist when there's no remote to share with.

Separately, filter known bot prefixes from `branchPatterns.prefixes` so dependency automation branches (dependabot, renovate, etc.) don't dominate the branching convention signal that the setup agent uses for git-workflow rule generation.

## Acceptance Criteria
- AC1: `detectBranches()` uses `git branch -r` when a remote exists, producing a branch list that is deterministic across developers who share the same remote.
- AC2: `detectBranches()` falls back to `git branch` (local only) when no remote exists, preserving branch detection for local-only repos.
- AC3: `detectBranchPatterns()` excludes known bot prefixes (`dependabot/`, `renovate/`, `snyk-`, `greenkeeper/`, `imgbot/`) from the `prefixes` map and `primary` selection.
- AC4: Existing test for no-remote branch detection continues to pass (with fallback behavior).
- AC5: New test verifies that local-only branches are excluded when a remote exists.
- AC6: New test verifies that bot prefixes are excluded from `branchPatterns`.

## Edge Cases & Risks
- **No remote (air-gapped, pre-first-push, educational repos):** `git branch -r` returns nothing. The fallback to `git branch` covers this. The data contamination disease doesn't apply here — no remote means no shared intelligence to pollute.
- **Multiple remotes (fork-based workflows):** `git branch -r` includes all remotes (`origin/`, `upstream/`). Continue stripping only `origin/` prefix and skip branches from other remotes. This matches current behavior, just without locals.
- **Current branch not pushed:** The developer's current branch is already captured in `git.branch` (a separate field). It doesn't need to appear in the branch list to be visible to agents.
- **Solo developer with local-only pre-prod branch (e.g., `staging` created but not pushed):** `detectArtifactBranch()` won't auto-detect it. This is correct — if you have a remote and haven't pushed the branch, you haven't committed to that workflow. `artifactBranch` is user-editable in `ana.json` for manual override.
- **Bot prefix list goes stale:** New bots emerge. The hardcoded list covers ~99% of real-world dependency bots (Dependabot, Renovate, Snyk, Greenkeeper, Imgbot). Custom bot integrations with custom prefixes are rare enough to handle when encountered. The list is trivial to extend.

## Rejected Approaches
- **Keep `git branch -a` and filter stale branches by checking remote existence per-branch:** Requires N git calls (one per local branch) to check if each exists on remote. Slow, complex, and solves the symptom (stale locals) rather than the disease (local state in shared intelligence).
- **Check branch author to distinguish bot from human:** Requires `git log -1 --format=%ae` per branch. Slow, and bot accounts don't have consistent email patterns across GitHub, GitLab, and self-hosted. Over-engineering for a problem a 5-item prefix list solves.
- **Weight branch patterns by recency:** More complex, and recency doesn't distinguish bot from human. A recently-merged Dependabot PR is still a bot branch.
- **Add a post-save warning for local branches:** Solves nothing — the user already committed the bad data. Fix the source, don't warn about the output.

## Open Questions
None. All questions from the requirements file and the investigation have been resolved.

## Exploration Findings

### Patterns Discovered
- `detectBranches()` (git.ts:100-118): Uses `git branch -a`, deduplicates via Set, strips `remotes/origin/` prefix. The dedup logic is sound and reusable with `-r`.
- `detectBranchPatterns()` (git.ts:148-175): Already uses `git branch -r`. Counts slash-delimited prefixes, picks most frequent as `primary`. Bot filtering slots cleanly into the existing loop.
- The `git branch -a` vs `git branch -r` divergence was unintentional — introduced in separate commits (142a8438 and 2dbf2ec1) with locally reasonable but systemically inconsistent choices.

### Constraints Discovered
- [TYPE-VERIFIED] `branches` field type is `string[] | null` (git.ts:18) — no schema change needed
- [TYPE-VERIFIED] `branchPatterns` type is `{ prefixes: Record<string, number>; primary: string | null }` (git.ts:25-28) — no schema change needed
- [OBSERVED] `detectArtifactBranch()` (state.ts:386-395) reads `res.git.branches` — behavior improves with this fix (no local-only pre-prod false positives) without code changes
- [OBSERVED] `work.ts:140` does its own `git branch -a` call for runtime slug lookup — different context (finding an active work branch, not project intelligence), not in scope

### Test Infrastructure
- `packages/cli/tests/engine/detectors/git-detection.test.ts`: Creates temp repos with `git init`, tests branch detection. The test at line 82-99 creates a no-remote repo with local branches — this test exercises the fallback path and should continue to pass. No remote-scenario test exists yet.

## For AnaPlan

### Structural Analog
`detectBranchPatterns()` at git.ts:148-175 — it already does exactly what `detectBranches()` needs to do: read `git branch -r`, strip `origin/` prefix, handle empty output. The pattern is right there in the same file.

### Relevant Code Paths
- `packages/cli/src/engine/detectors/git.ts:100-118` — `detectBranches()`, the primary fix target
- `packages/cli/src/engine/detectors/git.ts:148-175` — `detectBranchPatterns()`, bot prefix filtering
- `packages/cli/src/engine/detectors/git.ts:54-60` — `gitExec()` wrapper, used by both functions
- `packages/cli/src/commands/init/state.ts:386-395` — `detectArtifactBranch()`, consumer (no changes needed)
- `packages/cli/tests/engine/detectors/git-detection.test.ts:64-99` — existing branch tests

### Patterns to Follow
- `detectBranchPatterns()` in the same file — same data source (`git branch -r`), same prefix stripping, same null handling
- The `gitExec()` wrapper returns `null` on failure — use this to detect "no remote" (empty output from `-r`) vs "no git" (null from `-r`)

### Known Gotchas
- `git branch -r` returns empty string (not null) when a remote exists but has no branches. `gitExec` returns the trimmed output, so an empty remote returns `''` which is truthy. The fallback logic needs to check for empty string, not just null: `if (!output || output.trim() === '')`.
- Actually, `gitExec` trims the output (line 57), so an empty result from a valid git command returns `''`. But `''` is falsy in JS. So `if (!output)` catches both "no git" (null) and "no output" (empty string). The distinction between "no remote" and "remote with no branches" needs a separate check — run `git remote` first to determine if a remote exists, then decide whether to fall back.
- The existing test at line 82-99 creates local branches in a no-remote repo. With the fix, `git branch -r` will fail or return empty → fallback to `git branch` → test passes. But verify: does `git branch -r` return null (gitExec catches the error) or empty string in a no-remote repo? This determines fallback behavior.

### Things to Investigate
- Confirm what `git branch -r` returns via `gitExec` in a repo with no remote configured. Does it error (null) or return empty string? This determines the fallback detection strategy: check `git remote` explicitly, or rely on the `-r` output.
