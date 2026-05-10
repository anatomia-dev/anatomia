# Verify Report: CLI commits scoped to intended paths

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-10
**Spec:** .ana/plans/active/scoped-cli-commits/spec.md
**Branch:** feature/scoped-cli-commits

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/scoped-cli-commits/.ana/plans/active/scoped-cli-commits/contract.yaml
  Seal: INTACT (hash sha256:49b4b2dc0b2e75843f741116abcd7ea2bc19c7a5f16661e1c3bd171779d8d522)
```

Seal status: **INTACT**

Tests: 2048 passed, 0 failed, 2 skipped (96 test files). Build: success. Lint: 1 pre-existing warning (unused eslint-disable in git-operations.ts — not from this build).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | The work complete commit only contains the files it intended to stage | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:746` — `expect(commitFiles).not.toContain('unrelated.txt')` |
| A002 | Pre-existing staged files remain staged after a scoped commit | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:757` — `expect(stagedFiles).toContain('unrelated.txt')` |
| A003 | The work complete commit includes the archived plan directory | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:749` — `expect(commitFiles).toContain('completed/')` |
| A004 | The work complete commit includes the proof chain | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:750` — `expect(commitFiles).toContain('proof_chain.json')` |
| A005 | The single artifact save commit uses scoped pathspecs | ✅ SATISFIED | Source: `packages/cli/src/commands/artifact.ts:1288` — `['commit', '-m', commitMessage, '--', ...stagedPaths]` |
| A006 | The multi artifact save commit uses scoped pathspecs | ✅ SATISFIED | Source: `packages/cli/src/commands/artifact.ts:1685` — `['commit', '-m', commitMessage, '--', ...stagedPaths]` |
| A007 | The single artifact diff check uses scoped pathspecs | ✅ SATISFIED | Source: `packages/cli/src/commands/artifact.ts:1275` — `['diff', '--staged', '--quiet', '--', ...stagedPaths]` |
| A008 | The multi artifact diff check uses scoped pathspecs | ✅ SATISFIED | Source: `packages/cli/src/commands/artifact.ts:1673` — `['diff', '--staged', '--quiet', '--', ...stagedPaths]` |
| A009 | The saves-only commit uses a scoped pathspec | ✅ SATISFIED | Source: `packages/cli/src/commands/work.ts:2050` — `['commit', '-m', commitMessage, '--', savesRelPath]` |
| A010 | The saves-only diff check uses a scoped pathspec | ✅ SATISFIED | Source: `packages/cli/src/commands/work.ts:2042` — `['diff', '--staged', '--quiet', '--', savesRelPath]` |
| A011 | The proof commit uses scoped pathspecs from options.files | ✅ SATISFIED | Source: `packages/cli/src/commands/proof.ts:165` — `['commit', '-m', commitMessage, '--', ...options.files]` |
| A012 | The recovery commit uses scoped pathspecs | ✅ SATISFIED | Source: `packages/cli/src/commands/work.ts:1283` — `['commit', '-m', commitMessage, '--', ...recoveryPaths]` |
| A013 | Orphan file removals are included in the scoped multi-artifact commit | ✅ SATISFIED | Source: `packages/cli/src/commands/artifact.ts:1641-1643` — `orphanRelPath` computed and pushed to `stagedPaths` |
| A014 | A clean index produces identical behavior with scoped commits | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:761` — `expect(fsSync.existsSync(completedPath)).toBe(true)` |

All 14 assertions SATISFIED. A001-A004 and A014 are verified by tagged test at line 731. A005-A013 are verified by source inspection — the contract specifies structural properties (`commitArgs contains "--"`) that are directly observable in the source.

## Independent Findings

**Predictions resolved:**

1. *"Builder only added one test."* — Confirmed. One test covers site 4 (completeWork). Sites 1-3, 5-6 are verified by source inspection only. This matches the spec's testing strategy ("One new test in work.test.ts targeting completeWork (site 4)"), so it's by design, not an oversight.

2. *"Recovery path (site 3) untested with dirty index."* — Confirmed. The recovery path at work.ts:1280-1283 has the scoping fix applied but no test proves the scoping works. The structural change is identical to site 4, so the risk is low.

3. *"planPath absolute/relative mismatch in site 2."* — Not found. Builder correctly computed `relPlanPath` at artifact.ts:1627 and pushed it to `stagedPaths`, while passing the absolute `planPath` to `git add` at line 1629. This matches the spec's gotcha warning.

4. *"Partial staging in try block could leave stagedPaths incomplete."* — Not found as a problem. The catch blocks all call `process.exit(1)`, so partial staging never reaches the commit/diff-check.

5. *"Production risk: what if stagedPaths is empty?"* — Investigated. In site 1, `relFilePath` is always pushed first (the artifact itself). In site 2, `artifactPaths` is always non-empty. In site 5, `savesRelPath` is hardcoded. Sites 3/4/6 use explicit path arrays. Empty `stagedPaths` is not reachable.

**Over-building check:** No over-building. The branch includes 3 website commits (`36818ee`, `2e13fa4`, `c75602d`) that predate the build — they're from the `experiment/wider-sections` work, not the builder. The builder's 4 commits (`53bed59`, `5ab7cea`, `d26f317`, `a2c9cf6`) touch only the spec'd files.

**YAGNI check:** Grep'd new exports — the builder added no new functions, no new exports, no new parameters. Changes are strictly scoping existing commit and diff-check calls. No unnecessary abstractions.

## AC Walkthrough

- **AC1:** `work complete` commit includes only intended paths — ✅ PASS — Test at line 746 proves `unrelated.txt` excluded; lines 749-750 prove `completed/` and `proof_chain.json` included.
- **AC2:** `work complete` recovery commit scoped — ✅ PASS — Source at work.ts:1280-1283 shows `recoveryPaths` array with `'--', ...recoveryPaths` appended to commit args.
- **AC3:** `commitSaves` commit scoped — ✅ PASS — Source at work.ts:2050 shows `'--', savesRelPath` appended.
- **AC4:** `artifact save` single commit scoped — ✅ PASS — Source at artifact.ts:1288 shows `'--', ...stagedPaths`; `stagedPaths` accumulates relFilePath, relCompanionPath, archiveRelPaths, relPlanPath, savesRelPath.
- **AC5:** `artifact save` multi commit scoped — ✅ PASS — Source at artifact.ts:1685 shows `'--', ...stagedPaths`; `stagedPaths` accumulates artifactPaths, companion.relPath, archiveRelPaths, relPlanPath, orphanRelPath, savesRelPathAll.
- **AC6:** `commitAndPushProofChanges` scoped — ✅ PASS — Source at proof.ts:165 shows `'--', ...options.files`.
- **AC7:** `artifact save` single diff check scoped — ✅ PASS — Source at artifact.ts:1275 shows `'--', ...stagedPaths`.
- **AC8:** `artifact save` multi diff check scoped — ✅ PASS — Source at artifact.ts:1673 shows `'--', ...stagedPaths`.
- **AC9:** `commitSaves` diff check scoped — ✅ PASS — Source at work.ts:2042 shows `'--', savesRelPath`.
- **AC10:** Clean index identical behavior — ✅ PASS — Test at line 760-761 proves directory moved to completed (same as existing happy-path tests). `git commit -- paths` with clean index behaves identically — it commits only the specified paths, which are the same files that were just staged.
- **AC11:** Test stages unrelated file, verifies exclusion and persistence — ✅ PASS — Test at lines 736-757 does exactly this: writes `unrelated.txt`, stages it, runs `completeWork`, checks `diff-tree` excludes it, checks `diff --cached` includes it.
- **AC12:** Orphan `git rm` paths included in scoped commit — ✅ PASS — Source at artifact.ts:1641-1643 pushes `orphanRelPath` to `stagedPaths`.
- **AC13:** Tests pass — ✅ PASS — 2048 passed, 0 failed, 2 skipped.
- **AC14:** No build errors — ✅ PASS — `pnpm run build` succeeded.

## Blockers

No blockers. All 14 contract assertions SATISFIED. All 14 acceptance criteria PASS. No regressions (2048 tests, up from 2047 baseline). No unused exports in new code (no new exports added). No unhandled error paths introduced (all commit calls retain existing error handling). No assumptions about external state changed (paths are derived from existing variables).

## Findings

- **Test — 9 of 14 assertions verified by source inspection only:** `packages/cli/tests/commands/work.test.ts:731` — Only site 4 (completeWork) has an integration test proving scoped commits work with a dirty index. Sites 1-3, 5-6 rely on source inspection confirming `'--', ...paths` in the args array. The spec explicitly scoped testing to site 4, so this is by design. The structural change is mechanical and identical across all 6 sites, making source inspection reasonable.

- **Code — `git commit --` uses `--only` semantics:** `packages/cli/src/commands/artifact.ts:1288` — When `git commit` receives `-- <paths>`, it uses `--only` mode: it commits from the working tree for those paths, ignoring the index for everything else. This is safe because `git add` and `git commit` are always adjacent synchronous calls at every site, so working tree and index match. The spec acknowledges this. Worth documenting if the pattern is ever separated (e.g., async staging).

- **Code — Site 2 mixed absolute/relative path convention:** `packages/cli/src/commands/artifact.ts:1629` — `runGit(['add', planPath])` uses absolute `planPath`, while `stagedPaths.push(relPlanPath)` uses relative. Both resolve to the same file. The builder correctly followed the spec's gotcha guidance, but the mixed convention is a maintenance hazard — a future change might use `planPath` (absolute) in `stagedPaths`, which would cause `git commit -- /absolute/path` to fail.

- **Test — `toContain` path matching is broad:** `packages/cli/tests/commands/work.test.ts:749` — `expect(commitFiles).toContain('completed/')` matches any line containing `completed/`. In this controlled test with a single commit, false positives are unlikely. But the assertion is weaker than checking for a specific full path like `.ana/plans/completed/test-slug/`.

- **Upstream — `commitSaves` still swallows commit failures silently:** `packages/cli/src/commands/work.ts:2052-2053` — Pre-existing issue (see proof context: "commitSaves silently swallows commit failures"). The scoping fix doesn't change this behavior. Still present — the silent catch at line 2052 means a git error during saves commit is invisible to the user.

## Deployer Handoff

Clean merge. The change is invisible to users with clean staging indexes — `git commit -- paths` with only the intended files staged behaves identically to `git commit` without pathspecs. The fix activates when the index is dirty from concurrent work, manual staging, or failed prior runs.

The branch includes 3 unrelated website commits (wider sections experiment) that predate the build. These will merge alongside the CLI changes. If you want CLI-only, cherry-pick commits `53bed59`, `5ab7cea`, `d26f317`.

No new dependencies. No configuration changes. No user-facing output changes.

## Verdict

**Shippable:** YES

All 6 commit sites and 3 diff-check sites now use `-- <paths>` scoping. The test proves the primary path (completeWork) correctly excludes unrelated staged files and preserves them in the index. The remaining sites use the same mechanical pattern — source inspection confirms the fix. 2048 tests pass, build succeeds, lint clean.
