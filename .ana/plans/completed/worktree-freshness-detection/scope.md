# Scope: Worktree freshness detection

**Created by:** Ana
**Date:** 2026-05-12

## Intent

Worktrees don't know when they're behind main. When multiple pipelines run concurrently — or when main advances for any reason while a worktree is active — the build and verification happen against stale code. The developer discovers this only at merge time ("branch is behind"), after wasting an entire build+verify cycle. Worse: if the PR merges cleanly despite being behind (no conflicting files), the proof chain records a PASS that was verified against different code than what shipped. The proof is weak and nobody knows.

This was a known concern. The V2 requirements doc explicitly deferred "Cross-Worktree Conflict Prediction" with the rationale "needs real concurrent worktree usage data from V1." We now have that data — the problem manifested during concurrent pipeline runs on 2026-05-12. The trigger for addressing it has fired.

This scope adds two things: (1) freshness detection — the system tells you when a worktree is behind main, and (2) base-commit tracking — the proof chain records what commit the code was verified against, so weak proofs are detectable after the fact.

## Complexity Assessment
- **Kind:** feature
- **Size:** small — one new field in `WorktreeInfo`, one new field in `ProofChainEntry`, warnings at existing display points
- **Files affected:**
  - `packages/cli/src/utils/worktree.ts` — `WorktreeInfo` interface + `getWorktreeInfo` implementation (add `commitsBehind` field)
  - `packages/cli/src/commands/work.ts` — `printHumanReadable` display (show behind-count), `startBuildPhase` resume path (warn if behind), `printExistingWorktree` (show behind-count), `completeWork` (compute and store `base_commit` in proof chain entry)
  - `packages/cli/src/types/proof.ts` — `ProofChainEntry.worktree` type (add optional `base_commit` field)
  - `packages/cli/src/commands/pr.ts` — warn if work branch is behind artifact branch before creating PR
  - `packages/cli/tests/utils/worktree.test.ts` — new tests for `commitsBehind` computation
  - `packages/cli/tests/commands/work.test.ts` — new tests for behind-warning display
- **Blast radius:** Low. All changes are additive. `commitsBehind` is a new optional field on an existing interface — no consumer breaks. `base_commit` is a new optional field on an existing type — old entries lack it, which is handled the same way `kind` is handled (65 of 78 entries lack `kind` and the system works fine). Display changes add information; they don't change existing output. No behavioral changes — detection, not enforcement.
- **Estimated effort:** ~1 hour
- **Multi-phase:** no

## Approach

Two additions to the same system, both following patterns that already exist:

**1. Freshness detection.** `getWorktreeInfo` already computes `commitCount` (commits ahead) via `git rev-list --count ${artifactBranch}..${branchName}`. Add `commitsBehind` using the reverse: `git rev-list --count ${branchName}..${artifactBranch}`. Same git command, reversed arguments. Surface the count in `work status` display, warn at `startBuildPhase` resume, and warn at `pr create`. All are informational — warnings, not blocks. The developer decides whether to rebase.

**2. Base-commit tracking.** At `work complete` time, compute `git merge-base ${artifactBranch} ${branchName}` (the commit the worktree branched from) and store it as `base_commit` in the proof chain entry's `worktree` object. This is one field, computed by a git operation that already exists in the codebase (`artifact.ts:145` uses `git merge-base` for `captureModulesTouched`). Old entries without `base_commit` are handled by the existing optional-field pattern. The field enables future analysis: "was this proof verified against the code that actually shipped?"

Both changes follow the V1→V2 pattern the worktree system was designed around: **prove the foundation with detection, then build enforcement on top.** V1 proved isolation. V2 proved intelligence (danger maps). This scope proves freshness awareness. Enforcement (blocking stale builds, invalidating post-rebase verifications) is a future scope that builds on the data this scope produces.

## Acceptance Criteria

### Freshness detection
- AC1: `getWorktreeInfo` returns a `commitsBehind` field — the count of commits on the artifact branch that are not on the worktree branch
- AC2: `commitsBehind` is 0 when the worktree is up to date with the artifact branch
- AC3: `commitsBehind` is correctly computed when the artifact branch has advanced (e.g., another PR merged)
- AC4: `commitsBehind` defaults to 0 on git failure (same error-swallowing pattern as `commitCount`)
- AC5: `work status` displays `commitsBehind` alongside existing worktree info when the count is > 0 (e.g., "⚠ 3 commits behind main")
- AC6: `work status` does NOT show behind-count when `commitsBehind` is 0 (no noise for fresh worktrees)
- AC7: `startBuildPhase` resume path (worktree already exists) prints a warning when `commitsBehind > 0`: "Worktree is N commits behind {artifactBranch}. Consider rebasing before building."
- AC8: `printExistingWorktree` includes `commitsBehind` in its output when > 0
- AC9: `pr create` warns when the work branch is behind the artifact branch before creating the PR
- AC10: All warnings are informational (yellow text, not red errors) — they do not block any operation

### Base-commit tracking
- AC11: `work complete` computes `git merge-base ${artifactBranch} ${branchName}` and stores the result as `base_commit` in the proof chain entry's `worktree` object
- AC12: `base_commit` is a 40-character git SHA (full hash, not abbreviated)
- AC13: If `merge-base` fails (e.g., no common ancestor — shouldn't happen in normal flow), `base_commit` is omitted (not null, not empty string — absent)
- AC14: Old proof chain entries without `base_commit` continue to work — no consumer crashes on missing field
- AC15: The `ProofChainEntry.worktree` type is updated to include `base_commit?: string`

### Safety
- AC16: No existing tests break. Test count increases.
- AC17: `work status` JSON output includes `commitsBehind` in the worktree info object (for machine consumption)

## Edge Cases & Risks

### The `rev-list` behind-count requires a fetch to be accurate

`git rev-list --count ${branchName}..${artifactBranch}` compares the local refs. If the local artifact branch hasn't been updated (no recent `git fetch`), the behind-count reflects the local state, not the remote state. This means: if main advanced on the remote but the local main hasn't pulled, `commitsBehind` shows 0.

**Mitigation:** `work status` already runs `git fetch origin ${artifactBranch}` at line 683 before computing worktree info. After that fetch, the local artifact branch ref is updated, and `rev-list` reflects the true state. For `startBuildPhase` and `pr create`, a best-effort fetch before the behind-check ensures accuracy. If the fetch fails (offline), the behind-count is computed against local state — which is the same information the developer would get from `git log`. No worse than today.

**AnaPlan validation task:** Verify that `work status` at line 683 fetches `origin ${artifactBranch}` before `getWorktreeInfo` is called at line 748. Confirm the fetch updates the local ref so `rev-list` sees the latest remote state. If the fetch is after the worktree info computation, the ordering needs adjustment.

### `startBuildPhase` creates the worktree from current HEAD — not from latest remote

When `createWorktree` runs, it branches from whatever the local artifact branch points to. If the developer hasn't pulled recently, the worktree starts stale. The freshness detection would show 0 behind at creation time (because the local ref matches), then show behind-count on the next `work status` (which fetches).

**Mitigation:** This is acceptable for the detection-only scope. The first `work status` after main advances will surface the behind-count. A future scope could add a fetch before `createWorktree`, but that's enforcement, not detection.

**AnaPlan validation task:** Confirm that `startBuildPhase` at line 1907 does NOT fetch before creating the worktree. Document this as a known limitation — the behind-count is accurate after the next fetch, not at creation time.

### `merge-base` after squash/rebase merge

If the PR was squash-merged, the merge-base between the artifact branch and the (now-deleted) work branch may not be meaningful — the squash commit is a new commit, not a descendant of the work branch. However, `base_commit` is computed BEFORE the branch is deleted (at `work complete` time, the work branch still exists as a local ref even if the remote was deleted). The merge-base at that point is the commit where the worktree originally branched.

**Mitigation:** Compute `base_commit` early in `completeWork`, before worktree removal (line 1522) and before branch deletion (line 1583). The branch ref is still valid at that point.

**AnaPlan validation task:** Trace the exact ordering in `completeWork`. The `base_commit` computation must happen before step 8d (worktree removal at line 1522) and step 12 (branch deletion at line 1583). The `getWorkBranch` call at line 1387 confirms the branch exists at that point — compute merge-base alongside it.

### `isStale` heuristic doesn't change

The existing `isStale` check (`commitCount === 0 && lastActivityDays >= 14`) remains unchanged. `commitsBehind` is a separate, more precise signal. A worktree can have `isStale: false` (has commits, recent activity) but `commitsBehind: 12` (main advanced significantly). Both signals are displayed independently.

### Interaction with `kind-aware-branch-prefixes` scope

Both this scope and `kind-aware-branch-prefixes` modify `getWorktreeInfo`. This scope adds `commitsBehind` (a new field). That scope changes how `branchName` is derived (git HEAD instead of config reconstruction). The changes are to different parts of the function and don't conflict. AnaPlan should be aware if both are in flight.

### Concurrent `work complete` and `base_commit`

Two `work complete` calls running simultaneously both compute `merge-base` independently. Each gets the correct base for its own work branch. No interference — `merge-base` is a read-only git operation. The concurrent-write risk on `proof_chain.json` is a pre-existing issue (documented in BACKLOG_INFRA ANA-CLI-034) not introduced by this scope.

## Rejected Approaches

- **Blocking stale builds.** Refuse to start build/verify if the worktree is behind main. Rejected because: enforcement without data is premature. Some teams intentionally build against a stable base. The V1→V2 pattern is detection first, enforcement later. This scope provides the detection data; a future scope can add gates based on it.
- **Auto-rebase at resume.** When `startBuildPhase` resumes a stale worktree, automatically fetch + rebase. Rejected because: rebase can have conflicts, auto-rebase changes developer code without consent, and a failed rebase leaves the worktree in a broken state. The warning lets the developer decide.
- **Post-rebase verification invalidation.** After a rebase, delete or mark the existing verify report as stale. Rejected for this scope because: it requires understanding whether the rebase was trivial (fast-forward, no conflicts) or substantive (conflict resolution). The `base_commit` field makes this detectable in a future scope — compare the verify report's expected base with the actual base at completion time. This scope provides the data; invalidation logic is enforcement.
- **File locking for `proof_chain.json`.** Prevent concurrent read-modify-write races. Rejected for this scope because: it's a different code path (proof chain append, not worktree info), the scenario is rare (simultaneous `work complete` calls), and the existing push-fail-and-warn pattern catches most cases. Documented as a known limitation.
- **Fetching before `createWorktree`.** Pull the latest main before creating the worktree so it starts fresh. Rejected for this scope because: the `--autostash` fix in `hygiene-debt-cleanup` hasn't shipped yet, and a pull before worktree creation could fail on dirty trees. Once `--autostash` ships, a pre-creation fetch becomes viable as a future enhancement.

## Open Questions

- **Should `pr create` show behind-count or just warn?** A behind-count like "Warning: branch is 5 commits behind main" is more informative than just "Warning: branch is behind main." But computing behind-count in `pr.ts` requires either a `git fetch` (network call that may slow PR creation) or working from local refs (may be stale). AnaPlan should decide: fetch + count, local-only count, or boolean warning.

## Exploration Findings

### Patterns Discovered
- `worktree.ts:304-316`: `commitCount` computed via `rev-list --count ${artifactBranch}..${branchName}` in a try-catch that defaults to 0. `commitsBehind` uses the identical pattern with reversed arguments.
- `artifact.ts:143-150`: `git merge-base` already used for `captureModulesTouched`. Same error handling pattern (try-catch, silently skip on failure). Same call signature (`['merge-base', artBranch, 'HEAD']`).
- `work.ts:646-652`: Worktree display in `printHumanReadable` uses `wt.commitCount`, `wt.lastActivityDays`, `wt.isStale`. Adding `wt.commitsBehind` to the same line is consistent.
- `proof.ts:91-96`: `ProofChainEntry.worktree` has 4 fields (`used`, `created_at`, `completed_at`, `commit_count`). `base_commit` would be the 5th. All are optional (the entire `worktree` object is `?`).
- `work.ts:1553-1558`: `worktreeMeta` is constructed just before `writeProofChain`. Adding `base_commit` to this object is one line.

### Constraints Discovered
- [TYPE-VERIFIED] `WorktreeInfo` is used in 3 places: `getWorktreeInfo` (definition), `work.ts:748` (status display), `work.ts:1508` (completion metadata). All access named fields — adding a field doesn't break any consumer.
- [TYPE-VERIFIED] `ProofChainEntry.worktree` is written at `work.ts:1553-1558` and read at `proof.ts` display functions. The `worktree` object is optional on the entry — old entries without it are already handled.
- [OBSERVED] `work status` fetches at line 683 before computing worktree info at line 748. The fetch updates local refs, so `rev-list` behind-count is accurate after `work status` runs.
- [OBSERVED] `startBuildPhase` resume path at line 1914-1919 does NOT fetch. A behind-warning here would use local refs (may be stale). Acceptable — the warning is best-effort; `work status` provides the accurate count.
- [OBSERVED] `pr.ts` has no fetch, no behind-check, no `getWorktreeInfo` call. Adding a behind-warning requires either importing `getWorktreeInfo` or computing behind-count inline.
- [VERIFIED] `getWorkBranch` at `work.ts:1387` confirms the branch exists before worktree removal at line 1522 and branch deletion at line 1583. `merge-base` computation can happen at this point.

### Test Infrastructure
- `tests/utils/worktree.test.ts`: Tests for `getWorktreeInfo` exist, including `isStale` behavior. Pattern: create a test repo, create a worktree, call `getWorktreeInfo`, assert fields. New `commitsBehind` tests follow the same pattern — add a commit to the artifact branch after creating the worktree, then verify `commitsBehind` is 1.
- `tests/commands/work.test.ts:425-580`: Comprehensive `branchPrefix` and status display tests. Pattern: `createWorkTestProject` → `getWorkStatus` → assert output. Behind-warning display tests follow the same pattern.

## For AnaPlan

### Structural Analog
`packages/cli/src/utils/worktree.ts:304-316` — the `commitCount` computation. `commitsBehind` is the identical pattern with reversed `rev-list` arguments. Same try-catch, same default-to-0, same field on `WorktreeInfo`.

### Relevant Code Paths
- `packages/cli/src/utils/worktree.ts:37-43` — `WorktreeInfo` interface (add `commitsBehind`)
- `packages/cli/src/utils/worktree.ts:293-342` — `getWorktreeInfo` implementation (add rev-list call)
- `packages/cli/src/commands/work.ts:646-652` — `printHumanReadable` worktree display (add behind-count)
- `packages/cli/src/commands/work.ts:1907-1919` — `startBuildPhase` resume path (add behind-warning)
- `packages/cli/src/commands/work.ts:2013-2025` — `printExistingWorktree` (add behind-count)
- `packages/cli/src/commands/work.ts:1553-1558` — `worktreeMeta` construction (add `base_commit`)
- `packages/cli/src/commands/work.ts:1387` — `getWorkBranch` confirms branch exists (compute merge-base here)
- `packages/cli/src/types/proof.ts:91-96` — `ProofChainEntry.worktree` type (add `base_commit`)
- `packages/cli/src/commands/pr.ts:160-176` — PR creation flow (add behind-warning)
- `packages/cli/src/commands/artifact.ts:143-150` — existing `merge-base` usage (pattern reference)

### Patterns to Follow
- `worktree.ts:304-316` for rev-list computation with error handling
- `artifact.ts:143-150` for merge-base computation with error handling
- `work.ts:646-652` for conditional worktree display (only show when relevant)

### Known Gotchas
- **Fetch ordering in `work status`.** The fetch at line 683 must happen BEFORE `getWorktreeInfo` at line 748 for the behind-count to be accurate. Verify this ordering is maintained — if a future refactor moves the fetch, behind-counts become stale.
- **`base_commit` computation timing.** Must happen before worktree removal (line 1522) and branch deletion (line 1583). The branch ref is needed for `merge-base`. If the branch was already deleted (e.g., GitHub auto-deleted after merge), `merge-base` fails — handle with the same try-catch pattern as `artifact.ts:143-150`.
- **`kind-aware-branch-prefixes` interaction.** Both scopes modify `getWorktreeInfo`. This scope adds `commitsBehind`. That scope changes how `branchName` is resolved. If both are in flight, they touch the same function but different logic. No conflict, but the planner should know.
- **`pr.ts` doesn't import worktree utilities.** Adding a behind-warning to PR creation requires either importing `getWorktreeInfo` (adds a dependency) or computing behind-count inline with a raw `rev-list` call. The inline approach is simpler — `pr.ts` already has `getCurrentBranch()` and `readArtifactBranch()`.

### Validation Tasks for AnaPlan

AnaPlan should independently verify these claims before writing the spec:

1. **Trace the `work status` fetch → worktreeInfo ordering.** Read `getWorkStatus` from line 668. Confirm the fetch at ~683 runs before `getWorktreeInfo` at ~748. If there's any code path where worktree info is computed before the fetch, the behind-count would be stale.

2. **Trace the `completeWork` ordering for `base_commit`.** Read from line 1035. Map which step can access the branch ref. Confirm the ref is available at the proposed computation point (near line 1387). Verify it's before worktree removal (1522) and branch deletion (1583).

3. **Check whether `rev-list ${branchName}..${artifactBranch}` works from the main tree.** The existing `commitCount` at `worktree.ts:308` runs `rev-list` with `cwd: wtPath` (inside the worktree). The behind-count needs to compare the worktree branch against the artifact branch. Does this require running from the worktree, or does it work from the main tree? Both refs should be visible from either location. Verify.

4. **Confirm that adding `commitsBehind` to `WorktreeInfo` doesn't break any consumer.** Grep for `WorktreeInfo` and `worktreeInfo` to find all consumers. Verify they access named fields, not destructure-all.

5. **Confirm the `worktree` type extension is backward-compatible.** Read old proof chain entries — do they have `worktree` objects? Some entries have `worktree: undefined` (pre-V1). Verify that the type change doesn't affect `generateDashboard`, `computeChainHealth`, or `formatHumanReadable` which read proof chain entries.

### Things to Investigate
- Whether `startBuildPhase` should do a best-effort `git fetch` before the behind-warning, or whether local refs are sufficient. The tradeoff: a fetch adds a network call (~1s) to every build resume, but makes the warning accurate. Without fetch, the warning is only as fresh as the last `work status`.

### Dependencies
- None. This scope is independent of all other active scopes.
- **Complementary with `hygiene-debt-cleanup`** (`--autostash`). Once `--autostash` ships, a future scope could add a pre-creation fetch to `createWorktree` so worktrees start fresh. This scope doesn't do that — it only detects staleness after the fact.
