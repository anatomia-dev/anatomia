# Scope: CLI commits must be scoped to intended paths

**Created by:** Ana
**Date:** 2026-05-09

## Intent
Every `git commit` in the CLI commits the entire staging index, not the specific files it staged. Pre-existing staged changes from other sessions, manual operations, or concurrent pipeline work leak into unrelated commits. Observed: `work complete commit-work-start-timestamps` (commit `bb2ee1f`) swept `polish-scan-copy`'s staged deletions into its commit — files from a different work item deleted by a different terminal session. The user wants every CLI commit to contain exactly what was intended.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — nine changes across three files plus one new test (four files total)
- **Files affected:** `packages/cli/src/commands/artifact.ts` (4 changes), `packages/cli/src/commands/work.ts` (3 changes), `packages/cli/src/commands/proof.ts` (1 change), `packages/cli/tests/commands/work.test.ts` (1 new test)
- **Blast radius:** Commit behavior only. With a clean index (normal case), behavior is identical. With a dirty index (concurrent work, manual staging), CLI commits no longer sweep in unintended changes. No user-visible output changes.
- **Estimated effort:** 2-3 hours
- **Multi-phase:** no

## Approach
Scope every `git commit` and every `git diff --staged --quiet` check in the CLI to operate on the intended paths only, not the entire index. The commit change is `git commit -m msg` → `git commit -m msg -- <paths>`. The diff check change is `git diff --staged --quiet` → `git diff --staged --quiet -- <paths>`. Both must use the same paths so the "should we commit?" check and the commit itself agree on scope.

For sites with simple, obvious paths (work.ts, proof.ts), this is a one-line append. For artifact.ts sites where paths are staged conditionally across multiple `git add`/`git rm` calls, the staging block needs a `stagedPaths` array that accumulates paths alongside each staging call, then passes the array to both the diff check and the commit.

One test proves the fix works: stage an unrelated file, run `completeWork` (site 4 — the most complex path, includes directory deletions), verify the unrelated file is NOT in the commit (via `git diff-tree --no-commit-id --name-only -r HEAD`) and IS still staged afterward (via `git diff --cached --name-only`).

**Git semantics note:** `git commit -- <paths>` uses `--only` semantics by default (commits working tree state for named paths, not index state). For our sites, `git add` and `git commit` are adjacent synchronous calls, so working tree and index match — no practical difference. `git commit -- <deleted-dir>/` correctly commits deletions: git sees files in HEAD, doesn't see them in the working tree, records the deletions. This is standard git behavior for missing working-tree files.

## Acceptance Criteria
- AC1: `work complete` commit (line 1373) includes only `active/{slug}/`, `completed/{slug}/`, `proof_chain.json`, `PROOF_CHAIN.md` — no other staged files leak in
- AC2: `work complete` recovery commit (line 1147) includes only `completed/{slug}/`, `proof_chain.json`, `PROOF_CHAIN.md`
- AC3: `commitSaves` commit (line 1912) includes only `.ana/plans/active/{slug}/.saves.json`
- AC4: `artifact save` single commit (line 1281) includes only the artifact file, companion YAML (if present), archive files, plan.md (if verify-report), and .saves.json
- AC5: `artifact save` multi commit (line 1668) includes only the artifact files, companion YAMLs, archive files, plan.md (if verify-report), orphan removals, and .saves.json
- AC6: `commitAndPushProofChanges` commit (proof.ts line 165) includes only `options.files`
- AC7: `artifact save` single diff check (line 1268) checks only the artifact's staged paths, not the entire index
- AC8: `artifact save` multi diff check (line 1656) checks only the artifacts' staged paths, not the entire index
- AC9: `commitSaves` diff check (line 1904) checks only `.ana/plans/active/{slug}/.saves.json`, not the entire index
- AC10: With a clean index, all nine sites produce identical behavior to current code — no regressions
- AC11: At least one test targeting site 4 (`completeWork` main path) stages an unrelated file, runs `completeWork`, verifies the unrelated file is NOT in the resulting commit (via `git diff-tree --no-commit-id --name-only -r HEAD`), and verifies it IS still staged afterward (via `git diff --cached --name-only`)
- AC12: `git rm` orphan paths at artifact.ts site 2 (lines 1627-1629) are included in the scoped commit — orphan cleanup is committed, not left staged

## Edge Cases & Risks
**Empty `stagedPaths` array.** If all conditional `git add` calls skip (nothing to stage), `stagedPaths` is empty. `git diff --staged --quiet --` with no paths checks nothing and returns 0 (no changes). The early-exit fires: "No changes to save — artifact is already up to date." Correct behavior.

**`git add` fails silently.** Several `git add` calls are in try/catch with empty catch blocks (artifact.ts lines 1262-1264). If `git add` fails, the path was pushed to `stagedPaths` but isn't actually staged. `git commit -- <paths>` would find no changes for that path. If OTHER paths have changes, the commit succeeds with those paths. If NO paths have changes, `git diff --staged --quiet -- <paths>` catches it first with the early return. Correct behavior either way.

**`git rm` paths in site 2.** Orphan cleanup (artifact.ts lines 1627-1629) stages deletions via `git rm`. These paths must be collected into `stagedPaths` alongside `git add` paths. If omitted, the orphan deletions stay staged but uncommitted — a silent bug where plan restructuring appears to work but doesn't persist.

**Cross-platform path separators.** All paths use `path.relative(projectRoot, ...)` which produces OS-native separators. `git` on Windows accepts both `/` and `\`. No issue.

## Rejected Approaches
**`git reset HEAD` before staging.** Would clear the entire index before staging CLI files, ensuring only our files are staged. But this is destructive — it unstages any legitimate changes the user staged manually. `git commit -- <paths>` preserves other staged changes while excluding them from the commit. Non-destructive is better.

**`git stash` / `git stash pop` around commits.** Stash pre-existing changes, commit, then restore them. Complex, error-prone if the stash pop conflicts, and unnecessary when `-- <paths>` achieves the same result without touching other changes.

**Only fix the commit, not the diff check.** The reviewers caught this: without scoping the diff check, a dirty index bypasses the "no changes" early-exit, leading to a scoped commit that finds nothing to commit and errors with "Commit failed" instead of the correct "No changes to save." Both must agree on scope.

## Open Questions
None.

## Exploration Findings

### Patterns Discovered
- All six commit sites use the identical pattern: `runGit(['add', ...])` followed by `spawnSync('git', ['commit', '-m', msg])`. The `git add` and `git commit` are always adjacent (within the same try block or sequential statements).
- Three of six sites have `git diff --staged --quiet` guards between staging and commit (artifact.ts lines 1268, 1656; work.ts line 1904). The other three (work.ts lines 1147, 1373; proof.ts line 165) commit unconditionally.
- proof.ts site is the cleanest — `options.files` is already a path array passed as a parameter. Zero work beyond appending `'--', ...options.files` to the commit args.

### Constraints Discovered
- [TYPE-VERIFIED] artifact.ts site 1 stages from 5 sources across lines 1216-1264. Each source is conditional.
- [TYPE-VERIFIED] artifact.ts site 2 stages from 6 sources across lines 1598-1653, including `git rm` for orphans (lines 1627-1629).
- [TYPE-VERIFIED] `commitSaves` (work.ts line 1893) already has `savesRelPath` as a named variable. Trivial to append to commit.
- [TYPE-VERIFIED] `commitAndPushProofChanges` (proof.ts line 156) already receives `options.files` as a typed parameter. Trivial to append.
- [OBSERVED] The `git add` calls at artifact.ts lines 1262-1264 and 1650-1652 are in try/catch with empty catch blocks. The path is pushed to `stagedPaths` regardless of whether `git add` succeeded. This is correct — the diff check verifies what's actually staged.

### Test Infrastructure
- work.test.ts `describe('ana work complete')` at line 588+ uses real git repos with `execSync('git init')`. Tests create branches, simulate merges, and verify archive behavior.
- The pattern for the dirty-index test: within an existing `work complete` test setup, add `execSync('echo "unrelated" > unrelated.txt && git add unrelated.txt')` before running `completeWork`, then verify with `execSync('git diff-tree --no-commit-id --name-only -r HEAD')` that `unrelated.txt` is not in the commit and `execSync('git diff --cached --name-only')` that it's still staged.

## For AnaPlan

### Structural Analog
proof.ts `commitAndPushProofChanges` (lines 156-175) — the cleanest commit site. `options.files` is already a path array. The change is literally appending `'--', ...options.files` to the commit args. All other sites should follow this pattern: collect paths into an array, pass to both diff check and commit.

### Relevant Code Paths
- `packages/cli/src/commands/artifact.ts` lines 1216-1286 — site 1: staging block (5 sources) → diff check (line 1268) → commit (line 1281)
- `packages/cli/src/commands/artifact.ts` lines 1598-1673 — site 2: staging block (6 sources including `git rm`) → diff check (line 1656) → commit (line 1668)
- `packages/cli/src/commands/work.ts` lines 1137-1148 — site 3: recovery staging → commit (no diff check)
- `packages/cli/src/commands/work.ts` lines 1369-1378 — site 4: main staging → commit (no diff check)
- `packages/cli/src/commands/work.ts` lines 1893-1917 — site 5: `commitSaves` staging → diff check (line 1904) → commit (line 1912)
- `packages/cli/src/commands/proof.ts` lines 156-175 — site 6: staging → commit (no diff check)

### Patterns to Follow
- proof.ts lines 163-165 for the cleanest path → commit pattern
- artifact.ts line 1268 for the diff check pattern (scoping mirrors the commit pattern)

### Known Gotchas
- artifact.ts site 2 has `git rm` calls (lines 1627-1629) that must be collected into `stagedPaths`. Easy to miss because they're `rm` not `add`.
- The `stagedPaths` array should be declared BEFORE the try block at the staging entry point, so all conditional branches can push to it. Declaring inside a conditional branch would miss paths from other branches.
- `path.relative(projectRoot, ...)` is used inconsistently — most `git add` calls pass relative paths, but site 2's `planPath` at line 1617 is absolute (`path.join(planDir, 'plan.md')`). A relative version is already computed at line 1616 for the `includes` check. The implementer should use the relative version for `stagedPaths`. For all other paths: collect whatever was passed to `git add`/`git rm`.

### Verified Constraints
- `git commit -- <dir>/` works correctly for directories. Sites 3 and 4 pass directory paths like `.ana/plans/active/{slug}/`. For deleted directories (site 4 after `fsPromises.rm`), git sees files in HEAD but missing from the working tree and records the deletions. For new directories (site 4's `completed/{slug}/`), `git add` makes the files known first, then `git commit -- <dir>/` commits them. Standard git behavior.
- `git commit -- <paths>` uses `--only` semantics (the default with pathspecs): commits from the working tree, not the index. Since `git add` and `git commit` are adjacent synchronous lines at every site, working tree and index always match. No semantic difference in practice.

### Things to Investigate
- Determine the cleanest pattern for the `stagedPaths` array at artifact.ts sites — declare at the top of the staging block, push inline, or extract path collection into a helper function. Design judgment for the planner.
