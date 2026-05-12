# Verify Report: Hygiene debt cleanup

**Result:** FAIL
**Created by:** AnaVerify
**Date:** 2026-05-12
**Spec:** .ana/plans/active/hygiene-debt-cleanup/spec.md
**Branch:** feature/hygiene-debt-cleanup

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/hygiene-debt-cleanup/contract.yaml
  Seal: INTACT (hash sha256:192d6140207767b7f761c6e506eb31d9e4b02e4c7c0ab27a9ad4d27d3b920c72)
```

Tests: 2176 passed, 1 failed, 2 skipped (100 test files). Build: PASS (cached). Lint: PASS (1 warning, 0 errors).

The failing test (`keeps content-match guard for planning artifacts during work complete` at work.test.ts:4366) is a regression introduced by this build — confirmed by running the full suite at the merge base (44aa7df) where all 2177 tests pass.

## Contract Compliance

| ID   | Says                                                          | Status         | Evidence |
|------|---------------------------------------------------------------|----------------|----------|
| A001 | Git pull in work-complete uses autostash                      | ✅ SATISFIED    | work.ts:1206 — `['pull', '--rebase', '--autostash']` |
| A002 | Git pull retry in work-complete also uses autostash           | ✅ SATISFIED    | work.ts:1287 — `['pull', '--rebase', '--autostash']` |
| A003 | Git pull in work-start uses autostash                         | ✅ SATISFIED    | work.ts:1796 — `['pull', '--rebase', '--autostash']` |
| A004 | Dead Python fixture files no longer exist                     | ✅ SATISFIED    | `ls packages/cli/tests/engine/fixtures/python/` → "No such file or directory" |
| A005 | Dead Node fixture files no longer exist                       | ✅ SATISFIED    | `ls packages/cli/tests/engine/fixtures/node/` → "No such file or directory" |
| A006 | The empty fixtures directory itself is removed                | ✅ SATISFIED    | `ls packages/cli/tests/engine/fixtures/` → "No such file or directory" |
| A007 | Deleting fixture files causes zero test failures              | ❌ UNSATISFIED  | 1 test fails: `keeps content-match guard for planning artifacts during work complete` (work.test.ts:4366). This regression is caused by the `--autostash` change, not by fixture deletion, but the contract requires zero failures across all changes. |
| A008 | Test count remains stable — no tests lost                     | ✅ SATISFIED    | Contract value 2177 is stale (merge base has 2177, main has 2178 due to fix-worktree-branch-parsing). The build did not delete any tests — the count difference is a merge gap artifact. 2176 passing + 1 failing = 2177 total non-skipped tests, matching the contract value. No tests were lost. |
| A009 | Dependency patches are applied within semver ranges           | ✅ SATISFIED    | pnpm-lock.yaml updated in commit adf19d4. Lockfile changes only — no package.json modifications in the build's commits. |
| A010 | Security audit findings reduced from 20                       | ✅ SATISFIED    | `pnpm audit` reports 12 findings (6 moderate, 6 high), down from 20. All are postcss dev-only transitives. |
| A011 | Testing standards warn against standalone manifest fixtures   | ✅ SATISFIED    | `.claude/skills/testing-standards/SKILL.md:29` contains "Use inline fixture data for scanner and parser tests". Human override: added to project-level file, not template — intentional (dogfooding context, not for all users). |
| A012 | New rule explains why standalone manifests are problematic     | ✅ SATISFIED    | Same line (SKILL.md:29) contains "trigger GitHub security advisory false positives". |
| A013 | MCP config file is gitignored                                 | ✅ SATISFIED    | `.gitignore:7` contains `.mcp.json`. Committed in ea26e6a. |
| A014 | No type or compilation regressions from dependency updates    | ✅ SATISFIED    | `pnpm run build` succeeds (cached, no errors). |

## Independent Findings

### The `--autostash` / content-match interaction (the real problem)

The `--autostash` flag changes git's behavior for **tracked dirty files**. Without it, `git pull --rebase` fails immediately when tracked files have uncommitted changes ("You have unstaged changes"). With it, dirty changes are stashed, pull proceeds, stash pops.

The test at work.test.ts:4357 creates a scenario where `scope.md` (a tracked planning artifact) has different local content. Without `--autostash`, pull fails → error handling → completeWork eventually fails. With `--autostash`, pull succeeds silently → content-match guard (lines 1211-1289) is never reached → completeWork resolves.

The content-match guard only triggers on the error string `"untracked working tree files would be overwritten"`. For tracked dirty files, `--autostash` removes the error entirely. This means planning artifacts that are tracked and locally modified will be silently stashed during pull, bypassing the safety check. The spec didn't address this interaction.

**This is the only regression.** The `--autostash` addition is correct for its intended purpose (handling dirty working trees during pull). The issue is the interaction with the existing auto-clean split strategy.

### Predictions resolved

1. **`--autostash` additions correct** — Confirmed. All 3 call sites updated mechanically.
2. **Test count drop from fixture deletion** — Not confirmed. Count difference is merge gap (branch 12 behind main).
3. **work.test.ts failure from `--autostash`** — Confirmed. The semantic interaction with tracked dirty planning artifacts.
4. **Testing-standards rule wording** — Confirmed correct, human override to project-level file.
5. **Audit improvement** — Confirmed (20 → 12).

**Surprise:** No surprise findings beyond the `--autostash` regression. The build is mechanically clean — the problem is a behavioral interaction the spec didn't anticipate.

### Production risk

In production, the `--autostash` change means: if a developer has uncommitted changes to planning artifacts (scope.md, plan.md, spec.md) when running `work complete`, those changes will be silently stashed and popped rather than triggering the content-match safety check. The stash pop may produce merge conflicts, which git will report — but the explicit error messaging from the auto-clean logic is bypassed.

## AC Walkthrough

- AC1: All three `git pull --rebase` calls include `--autostash` → ✅ PASS — grep confirms 3 matches at lines 1206, 1287, 1796
- AC2: Dead fixture files and directories deleted → ✅ PASS — `ls` confirms `tests/engine/fixtures/` does not exist
- AC3: All existing tests pass → ❌ FAIL — 1 test fails (work.test.ts:4366, content-match guard test). Regression from `--autostash` change, not fixture deletion.
- AC4: `pnpm update` run and lockfile updated → ✅ PASS — lockfile updated in commit adf19d4, no `--latest` flag (package.json unchanged in build commits)
- AC5: `pnpm audit` reports fewer than 20 findings → ✅ PASS — 12 findings (all dev-only postcss transitives)
- AC6: Testing-standards includes inline fixture rule → ✅ PASS — rule present in project-level SKILL.md:29 (human override from template to project file)
- AC7: `.gitignore` includes `.mcp.json` → ✅ PASS — committed in ea26e6a
- AC8: `pnpm run build` succeeds → ✅ PASS — build passes

## Blockers

1 test regression caused by the `--autostash` addition interacting with the content-match guard for tracked dirty planning artifacts. The test `keeps content-match guard for planning artifacts during work complete` (work.test.ts:4366) expects `completeWork` to reject when a planning artifact has different local content, but `--autostash` causes the pull to succeed silently, bypassing the guard.

Fix options:
- Add a pre-pull check for dirty planning artifacts before the `--autostash` pull
- Or accept the `--autostash` behavior and update the test to reflect the new semantics (if silently stashing planning artifacts is acceptable)

## Findings

- **Code — `--autostash` bypasses content-match guard for tracked dirty planning artifacts:** `packages/cli/src/commands/work.ts:1206` — The content-match guard (lines 1211-1289) only fires on "untracked working tree files would be overwritten". With `--autostash`, tracked dirty files are stashed before pull, so this error never occurs for tracked files. Planning artifacts like scope.md are tracked — their content-match safety check is silently bypassed. This is a semantic gap between the guard's trigger condition and `--autostash`'s behavior.

- **Test — content-match guard test regressed:** `packages/cli/tests/commands/work.test.ts:4366` — The test creates a tracked dirty scope.md and expects completeWork to reject. With `--autostash`, the pull succeeds (dirty change is stashed), so completeWork resolves. Confirmed regression: test passes at merge base (44aa7df), fails on feature branch.

- **Upstream — Contract A008 test count is stale:** Contract says 2177 but merge base has 2177 and current main has 2178 (one test added by fix-worktree-branch-parsing). The build didn't lose tests — the contract was sealed with the correct count at the time, and main has since gained one. Not a build error.

- **Code — Audit at 12, not 0:** `pnpm audit` shows 12 remaining findings (6 moderate, 6 high), all postcss via tsup and vite. These are dev-only transitives waiting on upstream postcss 8.5.10+ release. Within AC5's "≤3 dev-only" acceptable range if counted by package (1 package: postcss), but 12 path instances. The AC says "≤3 dev-only" which is ambiguous — 12 paths vs 1 package.

- **Upstream — A011/A012 target changed by human override:** Spec says modify `packages/cli/templates/.claude/skills/testing-standards/SKILL.md` (template). Builder placed the rule in `.claude/skills/testing-standards/SKILL.md` (project-level) per human direction — this is dogfooding context, not shipped to users. Contract target "testing-standards SKILL.md rules" is ambiguous between the two files. Commit 57bb215 message explicitly notes this: "not the shipped template — this is Anatomia-specific knowledge."

## Deployer Handoff

The `--autostash` additions, fixture deletion, gitignore commit, dependency update, and testing-standards rule are all clean. The only issue is the interaction between `--autostash` and the content-match guard for tracked dirty planning artifacts.

When merging: the branch is 12 behind main (fix-worktree-branch-parsing). The merge will bring in git.ts and work.test.ts changes from that branch. The `getWorkBranch` regex change at work.ts:144 duplicates the fix-worktree-branch-parsing change — this will merge cleanly as both sides made the same change.

After fixing the test regression: rebase on main before merging to pick up the 12 missing commits.

## Verdict

**Shippable:** NO

1 test regression. The `--autostash` change is correct in isolation but introduces a behavioral gap with the existing content-match guard. The test failure is real and demonstrates the gap — planning artifacts that are tracked and locally modified are no longer caught by the content-match check. This needs a decision: either add a pre-pull dirty-file check, or accept the new semantics and update the test.