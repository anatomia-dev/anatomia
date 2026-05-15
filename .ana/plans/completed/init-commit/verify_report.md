# Verify Report: ana init commit — persist infrastructure to git

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-14
**Spec:** .ana/plans/active/init-commit/spec.md
**Branch:** feature/init-commit

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/init-commit/contract.yaml
  Seal: INTACT (hash sha256:c6f8537e1192a45f8d51d941d584f0864a49c274098d86974fc73f625a496de1)
```

Seal status: **INTACT**

Tests: 2279 passed, 0 failed, 2 skipped. Build: ⚡ success. Lint: 0 errors, 1 pre-existing warning.

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Running init commit stages and commits discovered infrastructure files | ✅ SATISFIED | `commit.test.ts:349` — commits scan.json, verifies git log contains `.ana/scan.json` |
| A002 | The commit is path-scoped to only infrastructure files | ✅ SATISFIED | `commit.test.ts:362` — git log output contains `[ana]` |
| A003 | File discovery walks known directory roots, not a hardcoded list | ✅ SATISFIED | `commit.test.ts:69` — discovers `.claude/` from known roots |
| A004 | Proof chain files are never committed by this command | ✅ SATISFIED | `commit.test.ts:138` + `commit.test.ts:177` — isExcluded and discoverDirtyFiles both exclude |
| A005 | Plan directory contents are never committed by this command | ✅ SATISFIED | `commit.test.ts:149` + `commit.test.ts:177` — excludes `.ana/plans/` prefix |
| A006 | Proof chain markdown is never committed by this command | ✅ SATISFIED | `commit.test.ts:143` + `commit.test.ts:177` — excludes `PROOF_CHAIN.md` |
| A007 | Per-developer state directory is excluded from commits | ✅ SATISFIED | `commit.test.ts:153` + `commit.test.ts:198` — excludes `.ana/state/` |
| A008 | Agent memory is excluded from commits | ✅ SATISFIED | `commit.test.ts:158` + `commit.test.ts:198` — excludes `.claude/agent-memory/` |
| A009 | Local settings file is excluded from commits | ✅ SATISFIED | `commit.test.ts:162` + `commit.test.ts:198` — excludes `settings.local.json` |
| A010 | Running from a worktree is rejected with a clear error | ✅ SATISFIED | Source inspection: `commit.ts:287-289` — calls `isWorktreeDirectory()`, exits 1 with descriptive message |
| A011 | Running on the wrong branch is rejected with a clear error | ✅ SATISFIED | `commit.test.ts:328` — exitCode 1, stderr contains "must be committed to" |
| A012 | Running without init is rejected | ✅ SATISFIED | `commit.test.ts:316` — exitCode 1, stderr contains "ana init" |
| A013 | Commits bypass pre-commit hooks | ✅ SATISFIED | Source inspection: `commit.ts:330` — spawnSync args include `'--no-verify'` |
| A014 | Running when nothing has changed exits with an up-to-date message | ✅ SATISFIED | `commit.test.ts:340` — stdout contains "up to date" |
| A015 | Running when nothing has changed does not create a new commit | ✅ SATISFIED | `commit.test.ts:344` — exitCode undefined (no process.exit = exits 0) |
| A016 | First commit uses the initialize message | ✅ SATISFIED | `commit.test.ts:373` — git log contains "Initialize project context" |
| A017 | Subsequent commits use the update message | ✅ SATISFIED | `commit.test.ts:398` — git log contains "Update project context" |
| A018 | Commit includes co-author trailer | ✅ SATISFIED | `commit.test.ts:369` — git log contains "Co-authored-by:" |
| A019 | Push failure does not cause the command to exit with an error code | ✅ SATISFIED | Source inspection: `commit.ts:240-274` — `pushWithSoftFail` never calls `process.exit`. All paths return normally. |
| A020 | Push failure produces a warning message | ✅ SATISFIED | Source inspection: `commit.ts:263,272` — both failure paths write `'⚠ Push failed. Run \`git push\` manually.'` to stderr |
| A021 | Init success message shows commit readiness when on the correct branch | ✅ SATISFIED | `commit.test.ts:542` — displaySuccessMessage output contains "ana init commit" |
| A022 | Setup template Step 8 includes auto-commit instruction | ✅ SATISFIED | `commit.test.ts:568` — reads template file, verifies contains "ana init commit" |
| A023 | Monorepo primary package AGENTS.md is included when it exists | ✅ SATISFIED | `commit.test.ts:108` — discoverDirtyFiles returns `packages/cli/AGENTS.md` with scan.json config |
| A024 | Pull conflicts cause the command to abort with a clear message | ✅ SATISFIED | Source inspection: `commit.ts:226-229` — detects conflict keywords, aborts rebase, exits 1 |

## Independent Findings

**Prediction resolution:**
1. Hardcoded exclusion list — Confirmed as a `const` array, but spec explicitly designs it this way. Not a problem.
2. `git status --porcelain` and renamed files — Not found. Code at line 112 splits on `' -> '` correctly.
3. displaySuccessMessage placement — Not found. Correctly placed after "Next:" section (state.ts:706-713).
4. Push soft-fail test mocking — **Confirmed.** The test tagged A019/A020 tests "no remote" (push skipped), not push failure. Test name is misleading.
5. Pull conflict test missing — **Confirmed.** No test exercises the pull conflict abort path.

**Surprised findings:**
- The `npx ana init commit` invocation from the worktree initially showed a Commander "too many arguments" error — but this was because the globally installed `ana` doesn't have this feature yet. Running via `node dist/index.js init commit` works correctly. Commander subcommand routing works as expected.
- The code uses `spawnSync` directly for `git status --porcelain` (line 97-101) instead of the project's `runGit` helper, with a well-documented comment explaining why (`runGit` trims stdout, corrupting porcelain format). This is a reasonable trade-off, not over-engineering.

**Live testing:**
- `node dist/index.js init commit` from the worktree correctly rejects with branch guard: `Error: You're on \`feature/init-commit\`. Infrastructure must be committed to \`main\`.` — exit code 1. ✅
- Branch guard message matches contract A011 format exactly.

## AC Walkthrough
- [x] AC1: ✅ PASS — Test at line 349 commits infrastructure file, git log confirms path-scoped commit with `.ana/scan.json`.
- [x] AC2: ✅ PASS — Tests at lines 177-194 verify `proof_chain.json`, `PROOF_CHAIN.md`, `plans/` are excluded from discovery.
- [x] AC3: ✅ PASS — Tests at lines 198-214 verify `.ana/state/`, `.claude/agent-memory/`, `settings.local.json` are excluded.
- [x] AC4: ✅ PASS — Guard sequence tests (lines 316-337) verify worktree rejection (source), branch rejection (test), init guard (test). Pull verified by source inspection.
- [x] AC5: ✅ PASS — Source inspection: `commit.ts:330` uses `['commit', '--no-verify', '-m', commitMessage, '--', ...files]`.
- [x] AC6: ✅ PASS — Test at line 340 verifies "up to date" message. Idempotent test at line 480 runs twice, second returns "up to date".
- [x] AC7: ✅ PASS — Tests at lines 222-246 verify Initialize vs Update messages. Test at line 369 verifies Co-authored-by trailer.
- [x] AC8: ✅ PASS — `pushWithSoftFail` (commit.ts:240-274) never calls process.exit. Both failure paths output warning to stderr.
- [x] AC9: ✅ PASS — `state.ts:706-713` adds commit readiness to displaySuccessMessage. Test at line 542 confirms.
- [x] AC10: ✅ PASS — Template at line 613 includes auto-commit instruction. Template test at line 568 verifies.
- [x] AC11: ✅ PASS — Test at line 108 verifies monorepo AGENTS.md discovery via scan.json `primaryPackage.path`.
- [x] AC12: ✅ PASS — `discoverDirtyFiles` walks `KNOWN_ROOTS` + `KNOWN_ROOT_FILES`, intersects with `git status --porcelain`. Test at line 69 exercises discovery.
- [x] AC13: ✅ PASS — Verified `ana init commit` appears in: `start.mdx:52`, `using-ana-setup.mdx:119`, `context.mdx:67`, `toolbelt.mdx:42`.
- [x] Tests pass: ✅ PASS — 2279 passed, 2 skipped, 102 test files.
- [x] No build errors: ✅ PASS — `pnpm run build` succeeds cleanly.

## Blockers
No blockers. All 24 contract assertions satisfied. All 15 acceptance criteria pass. No regressions (baseline was 2254 tests, now 2279 — 25 new tests added). No unused exports in new code (verified: all 4 exports from commit.ts are imported). No unhandled error paths that could crash the process (all spawnSync results are checked). No missing edge cases from spec — idempotent path, no-remote path, conflict path, and wrong-branch path are all handled.

## Findings
- **Test — Push failure test doesn't test push failure:** `packages/cli/tests/commands/init/commit.test.ts:425` — Test is tagged `@ana A019, A020` and named "soft-fails on push failure" but actually tests the "no remote" path where push is skipped entirely. The comment at line 467 says "No 'Push failed' because no remote exists — push is skipped." The assertion proves push skip works, not push failure recovery. Contract satisfied by source inspection, but the test provides false confidence about the failure path.

- **Test — No integration test for pull conflict abort:** `packages/cli/src/commands/init/commit.ts:224` — The `pullBeforeCommit` function's conflict detection path (checks for "conflict"/"Cannot rebase"/"CONFLICT" in stderr, aborts rebase, exits 1) has no test. Creating a real merge conflict in a temp repo is harder than other guards but doable. Contract A024 satisfied by source inspection only.

- **Test — No integration test for worktree guard:** `packages/cli/src/commands/init/commit.ts:287` — The `isWorktreeDirectory()` check and exit(1) at line 287-289 has no tagged test. This matches the known proof finding from worktree-isolation: "Guard commands (A028-A032) have no integration tests." Still present — same architectural gap applies to this new command.

- **Code — Silent failure on git status error:** `packages/cli/src/commands/init/commit.ts:102` — If `git status --porcelain` fails (non-zero exit), the function returns `[]` with no logging. The caller treats empty as "nothing to commit" and prints "Context is up to date." — which would be misleading if git status failed for a real reason (corrupted index, permission error). Unlikely in practice since guards already validated git works.

- **Test — A013 assertion is nominal only:** `packages/cli/tests/commands/init/commit.test.ts:349` — The test name includes "--no-verify" but no assertion checks it was passed to git. It only verifies the commit succeeded. Since `--no-verify` is a flag that skips pre-commit hooks, its absence wouldn't be detectable in a test with no hooks. Verified by source inspection instead.

- **Upstream — Proof finding still active: guard integration tests missing:** Worktree-isolation finding notes guard commands lack integration tests. This build adds another guard command (A010) with the same gap. Not a regression — consistent with existing pattern — but the debt accumulates.

## Deployer Handoff
- This adds `ana init commit` as a new subcommand. It's independently discoverable via `ana init --help`.
- The command only works from the artifact branch (default: `main`). Running from feature branches exits with a helpful message.
- Existing users who ran setup before this feature won't have the auto-commit template behavior. The command is standalone-discoverable.
- The worktree is 7 commits behind main — expect a merge commit. No conflicts anticipated since the new file (`commit.ts`) doesn't exist on main.
- 25 new tests added (2254 → 2279). One new test file: `tests/commands/init/commit.test.ts`.

## Verdict
**Shippable:** YES

All 24 contract assertions satisfied. All acceptance criteria pass. Tests green, build clean, lint clean. The implementation follows established patterns (`commitAndPushProofChanges`, `pullBeforeRead`) faithfully. File discovery is well-architected — known roots + exclusions + porcelain intersection avoids both hardcoded file lists and dangerous `git add -A`. Guard sequence matches the spec exactly. The test gaps (push failure, pull conflict, worktree guard) are debt worth noting but don't prevent shipping — the behaviors are trivially verifiable by source inspection and follow patterns proven elsewhere in the codebase.
