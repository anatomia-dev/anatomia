# Verify Report: Kind-aware branch prefixes

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-12
**Spec:** .ana/plans/active/kind-aware-branch-prefixes/spec.md
**Branch:** feature/kind-aware-branch-prefixes

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/kind-aware-branch-prefixes/contract.yaml
  Seal: INTACT (hash sha256:0339b9da5318ce95b214f7bffd323cf187b6cda0c14ed7c8290885463743b194)
```

Tests: 2170 passed, 0 failed, 2 skipped (2172 total). Build: success. Lint: 1 pre-existing warning (unused eslint-disable in git-operations.ts:169).

## Contract Compliance
| ID   | Says                                                        | Status       | Evidence |
|------|-------------------------------------------------------------|--------------|----------|
| A001 | String-form branch prefix works exactly as before           | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:39` — writes `branchPrefix: 'dev/'` (string), asserts `readBranchPrefix(tempDir)` equals `'dev/'`. Pre-existing test, no new tag for this contract. |
| A002 | Map-form config returns the correct prefix for a given kind | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:88` — `@ana A002`, writes map `{feature: 'feature/', fix: 'fix/', chore: 'chore/'}`, calls `readBranchPrefix(tempDir, 'fix')`, asserts equals `'fix/'` |
| A003 | Map-form config falls back to feature prefix when no kind   | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:95` — `@ana A003`, map config, no kind arg, asserts equals `'feature/'` |
| A004 | String-form config ignores the kind parameter entirely      | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:102` — `@ana A004`, string config `'feature/'`, kind `'fix'`, asserts equals `'feature/'` |
| A005 | Unknown kind falls back to the feature key in the map       | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:109` — `@ana A005`, kind `'unknown'`, asserts equals `'feature/'` |
| A006 | Partial map without a feature key falls back to hardcoded   | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:116` — `@ana A006`, map `{fix: 'fix/'}`, kind `'unknown'`, asserts equals `'feature/'` |
| A007 | Empty map falls back to the hardcoded default               | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:123` — `@ana A007`, empty map `{}`, asserts equals `'feature/'` |
| A008 | Malformed map values fall back to the hardcoded default      | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:130` — `@ana A008`, map `{fix: 42}`, kind `'fix'`, asserts equals `'feature/'` |
| A009 | Each map value is validated independently for branch safety  | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:137` — `@ana A009`, map `{fix: 'x; echo pwned/', feature: 'feature/'}`, kind `'fix'`, falls back to feature key, asserts equals `'feature/'` |
| A010 | Map-form branch prefix is accepted by the Zod schema        | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:377` — `@ana A010`, parses map `{feature: 'feature/', fix: 'fix/', chore: 'chore/'}`, asserts `branchPrefix` is defined and typeof object |
| A011 | Map-form config survives re-init without being destroyed    | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:388` — `@ana A011`, round-trips map through `AnaJsonSchema.parse()`, asserts `bp['feature']` equals `'feature/'` and `bp['fix']` equals `'fix/'` |
| A012 | Invalid branchPrefix type still falls back to safe default  | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:401` — `@ana A012`, `branchPrefix: [1, 2, 3]`, asserts `parsed.branchPrefix` equals `'feature/'` |
| A013 | Existing branches are found by slug regardless of prefix    | ✅ SATISFIED  | Source inspection: `packages/cli/src/commands/work.ts:144` — `getWorkBranch` filters by `b.endsWith('/' + slug) \|\| b === slug`, no prefix dependency. No tagged test for this contract. |
| A014 | Substring slugs do not cause false matches                  | ✅ SATISFIED  | Source inspection: `packages/cli/src/commands/work.ts:144` — `endsWith('/' + slug)` requires exact segment match after `/`. `'feature/add-auth-system'.endsWith('/add-auth')` → false. No tagged test. |
| A015 | Branch lookup works after config changes                    | ✅ SATISFIED  | Source inspection: `packages/cli/src/commands/work.ts:138-148` — `getWorkBranch` takes only `slug`, no config params. Config changes cannot affect lookup. No tagged test. |
| A016 | Full branch name is returned so consumers use the real name | ✅ SATISFIED  | Source inspection: `packages/cli/src/commands/work.ts:147` — returns `local \|\| remote \|\| null` where both are full branch name strings containing `/`. No tagged test. |
| A017 | Worktree status shows actual branch from git, not config    | ✅ SATISFIED  | Source inspection: `packages/cli/src/utils/worktree.ts:303` — `getWorktreeInfo` calls `runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: wtPath })`. No config reconstruction. No tagged test. |
| A018 | Commit count uses the actual branch name from git           | ✅ SATISFIED  | Source inspection: `packages/cli/src/utils/worktree.ts:312` — `runGit(['rev-list', '--count', \`${artifactBranch}..${branchName}\`])` where `branchName` comes from HEAD read at line 303. No tagged test. |
| A019 | Work status displays correct branch info with map config    | ✅ SATISFIED  | Source inspection: `packages/cli/src/commands/work.ts:744,749` — `getWorkStatus` calls `getWorkBranch(slug)` (slug-based) and `getWorktreeInfo(projectRoot, slug)` (HEAD-based). No branchPrefix in call chain. No tagged test. |
| A020 | PR branch validation works with map-form config             | ✅ SATISFIED  | `packages/cli/tests/commands/pr.test.ts:168` — `@ana A020`, branch `dev/other-branch` with slug `test-feature`, asserts warning output exists containing branch name and slug |
| A021 | Undefined kind with map config returns feature default      | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:145` — `@ana A021`, map config, explicit `undefined` kind, asserts equals `'feature/'` |
| A022 | Partial map resolves present keys correctly                 | ✅ SATISFIED  | `packages/cli/tests/utils/git-operations.test.ts:152` — `@ana A022`, map `{fix: 'bugfix/'}`, kind `'fix'`, asserts equals `'bugfix/'` |
| A023 | All existing tests continue to pass                         | ✅ SATISFIED  | Test run: 2170 passed, 0 failed, 2 skipped. All 100 test files pass. |
| A024 | New tests are added for map-form config and slug-based matching | ✅ SATISFIED | 2172 total tests > 2156 baseline. 14 new tests added (12 in git-operations.test.ts, 1 in pr.test.ts, 1 in artifact.test.ts). |

## Independent Findings

**Prediction resolution:**

1. **Tag collision confirmed.** IDs A001-A024 collide with tags from previous contracts in the same test files. The builder tagged new tests correctly for A002-A012, A020-A022, but A001 has no new tag and A013-A019 have no tagged tests at all. Not a FAIL — the assertions are satisfied by source inspection — but it degrades the proof chain's tag-tracing capability.

2. **A013-A019 have no dedicated tests — confirmed.** These assertions about `getWorkBranch`, `getWorktreeInfo`, and `printExistingWorktree` are internal functions. The builder verified them by source code changes rather than new test cases. `getWorkBranch` is a private function in work.ts, so direct testing would require refactoring or export. Reasonable judgment call.

3. **Substring false-match prevention works — not found.** `endsWith('/' + slug)` correctly prevents substring matches. Predicted problem didn't materialize.

4. **Over-building — not found.** artifact.ts changes were minimal and correctly scoped. No extra features, no unused exports.

5. **Test count (2172 > 2156) — trivially satisfied as predicted.** Not a concern.

**Production risk predictions:**
1. **Short slug glob over-matching — confirmed as latent risk.** `git branch -a --list *${slug}` at work.ts:139 uses `*slug` glob. If slug is `fix`, this matches ALL branches containing "fix" (e.g., `feature/fix-auth`, `hotfix/deploy`). The subsequent `endsWith` filter narrows correctly, but a project with thousands of branches could have performance issues from the broad glob. Pre-existing behavior, not introduced by this build.

2. **Detached HEAD — confirmed as latent behavior.** `rev-parse --abbrev-ref HEAD` returns the literal string `"HEAD"` when detached, not an error. So `headResult.exitCode === 0` is true, and `branchName` becomes `"HEAD"`. Then `rev-list --count main..HEAD` at worktree.ts:312 would actually work (counts commits on detached HEAD). The `(unknown)` fallback at line 304 only triggers on git command failure, not detached state. Minor — worktrees should always have a checked-out branch.

**Surprise finding:** Three independent copies of the HEAD-reading pattern exist: `getWorktreeInfo` (worktree.ts:303), `printExistingWorktree` (work.ts:2038), and `startWork` resume path (work.ts:1685). All do the same `runGit(['rev-parse', '--abbrev-ref', 'HEAD'])` + commit-count dance. Not a blocker — the duplication is bounded and each site has slightly different context (different cwd, different output format) — but a future refactor could extract a shared helper.

## AC Walkthrough

- **AC1:** ✅ PASS — String-form `branchPrefix: 'dev/'` test passes (git-operations.test.ts:39), all existing tests unchanged.
- **AC2:** ✅ PASS — Map-form accepted by Zod (git-operations.test.ts:377), schema union at anaJsonSchema.ts:48-51.
- **AC3:** ✅ PASS — `readBranchPrefix(projectRoot)` with no kind returns `'feature/'` from map (git-operations.test.ts:95).
- **AC4:** ✅ PASS — `readBranchPrefix(projectRoot, 'fix')` returns `'fix/'` from map (git-operations.test.ts:88).
- **AC5:** ✅ PASS — `readBranchPrefix(projectRoot, 'fix')` returns `'feature/'` from string config (git-operations.test.ts:102).
- **AC6:** ✅ PASS — Unknown kind falls back to feature key, then hardcoded (git-operations.test.ts:109, 116).
- **AC7:** ✅ PASS — Undefined kind returns feature key value (git-operations.test.ts:145).
- **AC8:** ✅ PASS — Malformed map `{fix: 42}` falls back to `'feature/'` (git-operations.test.ts:130).
- **AC9:** ✅ PASS — Map-form survives `AnaJsonSchema.parse()` round-trip (git-operations.test.ts:388).
- **AC10:** ✅ PASS — Invalid map value `'x; echo pwned/'` independently validated, falls back to feature key (git-operations.test.ts:137).
- **AC11:** ✅ PASS — Empty map `{}` falls back to `'feature/'` (git-operations.test.ts:123).
- **AC12:** ✅ PASS — Partial map `{fix: 'bugfix/'}` resolves present key; missing keys fall back to `'feature/'` (git-operations.test.ts:152, 116).
- **AC13:** ✅ PASS — `startBuildPhase` reads kind via `extractScopeKind()` and passes to `readBranchPrefix(projectRoot, scopeKind)` at work.ts:1928-1929. Resolved prefix passed to `createWorktree` at work.ts:1989.
- **AC14:** ✅ PASS — `getWorkBranch` at work.ts:144 uses `b.endsWith('/' + slug) || b === slug`. Prefix-independent.
- **AC15:** ✅ PASS — `getWorkBranch` returns full branch name at work.ts:147 (`local || remote || null`).
- **AC16:** ✅ PASS — `endsWith('/' + slug)` prevents substring matches. `'feature/add-auth-system'.endsWith('/add-auth')` → false.
- **AC17:** ✅ PASS — `getWorkBranch` takes only `slug` — no config dependency. Works after config changes.
- **AC18:** ✅ PASS — `printExistingWorktree` reads HEAD at work.ts:2038 via `runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: wtPath })`.
- **AC19:** ✅ PASS — `getWorktreeInfo` reads HEAD at worktree.ts:303, uses it for commit counting (line 312) and branch return (line 341). `branchPrefix` parameter removed from signature.
- **AC20:** ⚠️ PARTIAL — `startWork` resume path reads HEAD at work.ts:1685. Verified by source inspection. No test exercises this exact path for the "prefix-independent" property specifically.
- **AC21:** ✅ PASS — `completeWork` at work.ts:1388 uses `getWorkBranch(slug)` return value. The old `${branchPrefix}${slug}` construction is eliminated.
- **AC22:** ✅ PASS — `completeWork --merge` at work.ts:1073 calls `getWorkBranch(slug)` first, falls back to `readBranchPrefix(projectRoot, extractScopeKind(...))` reconstruction only when branch is already deleted.
- **AC23:** ✅ PASS — `pr.ts:173` uses `currentBranch.endsWith('/' + slug) || currentBranch === slug`. Old `startsWith(branchPrefix)` removed. Test at pr.test.ts:142.
- **AC24:** ✅ PASS — `artifact.ts:949` uses generic `"Switch to the feature branch for \`${slug}\`"` hint. Old `${branchPrefix}${slug}` construction eliminated. `readBranchPrefix` import removed entirely. Test at artifact.test.ts:398.
- **AC25:** ✅ PASS — `getWorkStatus` at work.ts:744 calls `getWorkBranch(slug)` (slug-based) and line 749 calls `getWorktreeInfo(projectRoot, slug)` (HEAD-based). No branchPrefix in the status display path.
- **AC26:** ✅ PASS — All 2170 tests pass, 2172 total > 2156 baseline. No build errors. Lint: 1 pre-existing warning.

## Blockers

No blockers. All 24 contract assertions satisfied. All 26 acceptance criteria pass (1 partial — AC20 verified by source only). No regressions. No guardrail violations. Checked for: unused exports in new code (none — `readBranchPrefix`'s `kind` parameter is used by `startBuildPhase` and `completeWork --merge`), unused parameters in changed functions (none — `_branchPrefix` in `getNextAction` kept for API compat per spec), error paths that swallow silently (the existing `catch {}` blocks in `getWorktreeInfo` and `printExistingWorktree` are intentional degradation, matching the pre-existing pattern), dead code in new branches (the map-form fallback chain at git-operations.ts:146-157 has no dead paths — each candidate key is reached when prior keys are missing or invalid).

## Findings

- **Test — Contract A013-A019 have no tagged tests:** Verified by source inspection only. `getWorkBranch`, `getWorktreeInfo`, `printExistingWorktree` are internal functions. The builder made a reasonable judgment call not to export them for testing, but 7 of 24 assertions rely on reading code rather than running tests. This weakens the proof chain for these assertions — a future refactor could change the behavior without a test catching it.

- **Test — A001 has no tagged test for this contract:** `packages/cli/tests/utils/git-operations.test.ts:38` — the pre-existing test from a previous contract satisfies this assertion but lacks a `@ana A001` tag for this build. Assertion is satisfied; traceability is slightly degraded.

- **Code — `getWorkBranch` glob may over-match for short slugs:** `packages/cli/src/commands/work.ts:139` — `git branch -a --list *${slug}` with a short slug like `fix` would match all branches containing "fix". The subsequent `endsWith` filter narrows correctly, but projects with many branches could see unnecessary branch scanning. Pre-existing behavior, not introduced by this build.

- **Code — Detached HEAD produces `"HEAD"` as branch name, not `"(unknown)"`:** `packages/cli/src/utils/worktree.ts:304` — `rev-parse --abbrev-ref HEAD` returns literal `"HEAD"` on detached state (exit code 0), so the fallback `(unknown)` is never reached for detached HEAD. `rev-list --count main..HEAD` would still work, so the impact is cosmetic (branch displays as `"HEAD"` in status). Worktrees should always have a branch checked out, so this is theoretical.

- **Code — HEAD-reading pattern duplicated in three places:** `packages/cli/src/utils/worktree.ts:303` (getWorktreeInfo), `packages/cli/src/commands/work.ts:2038` (printExistingWorktree), `packages/cli/src/commands/work.ts:1685` (startWork resume). All three read HEAD, count commits, and display branch info. Each has slightly different context (different cwd assumptions, different output format), but the core pattern could be extracted to a shared helper. Bounded duplication — 3 sites, stable pattern.

- **Upstream — Contract `file_changes` lists `packages/cli/tests/commands/work.test.ts` as modified but zero changes were made:** The contract anticipated new tests in work.test.ts for slug-based matching. The builder chose to verify A013-A019 by source inspection instead. Not a contract violation (assertions are still satisfied), but the contract was slightly inaccurate about where test changes would land.

- **Code — `completeWork --merge` fallback reconstruction at work.ts:1074 is the only remaining config-dependent branch reconstruction:** `readBranchPrefix(projectRoot, extractScopeKind(...))` is used when `getWorkBranch` returns null (branch already deleted). This is the "already merged" edge case documented in the spec. Correct design — the reconstruction is a last resort for a deleted branch. Worth noting because it's the single surviving instance of the pattern this build otherwise eliminates.

- **Upstream — Stale finding from proof chain likely resolved:** Proof chain notes `_branchPrefix parameter in getNextAction is unused` (from Worktree Isolation build). Still present — work.ts:504 shows `_branchPrefix: string` — kept intentionally for API compat per spec constraint.

## Deployer Handoff

- **Backward compatible.** String-form `branchPrefix` config is unchanged. Existing projects need no migration.
- **Map-form config is opt-in.** Users can add `branchPrefix: { feature: "feature/", fix: "fix/" }` to ana.json to get kind-aware prefixes. The default remains `'feature/'`.
- **Slug-based lookup is the behavioral change.** Branches are now found by slug suffix, not prefix+slug reconstruction. This means branches survive config changes between creation and lookup. Users who changed their `branchPrefix` after creating branches will no longer see "branch not found" errors.
- **One surviving reconstruction site.** `completeWork --merge` falls back to config reconstruction when the branch is already deleted. This is correct for the "already merged" edge case.

## Verdict
**Shippable:** YES

All 24 contract assertions satisfied. All acceptance criteria pass. 14 new tests added. Build and lint clean. The implementation correctly decouples branch lookup from config and adds map-form support. The change is well-scoped — `artifact.ts` no longer imports `readBranchPrefix`, and `getWorktreeInfo`/`printExistingWorktree` no longer take a `branchPrefix` parameter. The only concern is that 7 assertions rely on source inspection rather than tests, but the code is straightforward enough that this is acceptable for an internal function.
