# Verify Report: Commit timestamps written by work start

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-09
**Spec:** .ana/plans/active/commit-work-start-timestamps/spec.md
**Branch:** feature/commit-work-start-timestamps

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/commit-work-start-timestamps/contract.yaml
  Seal: INTACT (hash sha256:586072a4fe4a9f2a32ad663eed3e057dfec5fba7fabc305411fe1db28b92afc7)
```

Tests: 2029 passed, 2 skipped. Build: success (2 tasks, 1 cached). Lint: success (2 tasks).

## Contract Compliance
| ID   | Says                                                                 | Status        | Evidence |
|------|----------------------------------------------------------------------|---------------|----------|
| A001 | Starting a new work item commits the timestamp to the artifact branch | ✅ SATISFIED  | work.test.ts:3050, `expect(statusResult).not.toContain('.saves.json')` — git status clean after startWork |
| A002 | The start-work commit message identifies the slug                    | ✅ SATISFIED  | work.test.ts:3054, `expect(logResult).toContain('[fix-auth-timeout] Start work')` |
| A003 | The start-work commit includes the co-author trailer                 | ✅ SATISFIED  | work.test.ts:3055, `expect(logResult).toContain('Co-authored-by:')` |
| A004 | Starting a plan phase commits the timestamp to the artifact branch   | ✅ SATISFIED  | work.test.ts:3081, `expect(statusResult).not.toContain('.saves.json')` |
| A005 | The plan-phase commit message identifies the phase                   | ✅ SATISFIED  | work.test.ts:3087, `expect(logResult).toContain('[plan-test] Start plan phase')` |
| A006 | The plan-phase commit includes the co-author trailer                 | ✅ SATISFIED  | work.test.ts:3088, `expect(logResult).toContain('Co-authored-by:')` |
| A007 | Repeating work start for the same phase does not create empty commit | ✅ SATISFIED  | work.test.ts:3107, `expect(countAfter).toBe(countBefore)` — rev-list count unchanged |
| A008 | Repeating work start for the same phase does not error               | ✅ SATISFIED  | work.test.ts:3103, second `startWork` completes without throwing |
| A009 | The commit only includes the saves file for this work item           | ✅ SATISFIED  | work.test.ts:3058, `expect(diffFiles).toBe('.ana/plans/active/fix-auth-timeout/.saves.json')` — exact single-file match |
| A010 | Other files in the slug directory are not included in the commit     | ✅ SATISFIED  | work.test.ts:3130, `expect(statusResult).toContain('extra.txt')` — file remains untracked. Note: test creates file after commit; A009's diff-tree assertion provides stronger proof of scoped staging |
| A011 | Work start does not push to the remote                               | ✅ SATISFIED  | work.test.ts:3139, startWork succeeds without remote configured — push would fail. Source inspection of commitSaves (work.ts:1893-1917) confirms no push calls |
| A012 | Comments saying main when meaning the artifact branch are fixed      | ✅ SATISFIED  | Source inspection: grep for `\bmain\b` in work.ts returns only 4 hits — lines 989, 1006, 1347, 1554 — all refer to git primary working tree or code paths, not the branch. All 8 spec-listed fixes verified present |
| A013 | The artifact branch message in artifact.ts no longer hardcodes main  | ✅ SATISFIED  | artifact.ts:937 now reads `is here on the artifact branch but belongs in the worktree`. grep for `on main but` returns 0 matches |
| A014 | References to main project directory and main tree are preserved     | ✅ SATISFIED  | work.ts lines 989, 1006, 1347, 1554 — 4 references to "main project directory", "main commit path", "main tree" preserved. 4 > 0 |

## Independent Findings

The implementation follows the spec closely. The `commitSaves` helper mirrors the artifact.ts commit pattern as specified. Both call sites (Think phase line 1601, Plan phase line 1639) are correctly placed after `writeTimestamp`.

The builder made reasonable design choices on error handling — silent failure on commit (line 1914-1916) matches the spec's "don't block the user's workflow" guidance. However, this means a git index.lock or corrupted state would be invisible. The spec didn't require error reporting, so this is noted as an observation.

The A010 test has a structural weakness: it creates `extra.txt` AFTER `startWork` has already committed `.saves.json`, then checks it's untracked. This proves git didn't retroactively add it but doesn't test what happens when extra files exist before the commit. A009's `git diff-tree` assertion (exact single-file match) provides the real scoped-staging proof. A010 is supplementary, not load-bearing.

The A011 test uses absence of a remote as indirect proof that push wasn't called. This is a reasonable test design — if push were attempted on a repo with no remote, it would throw. Not a blocker but noted.

No over-building detected. No unused exports in the new `commitSaves` function (it's private). No YAGNI violations — the function does exactly what the spec requires and nothing more. No dead code blocks in the new code.

Prediction resolution:
1. **Silent error swallowing** — Confirmed. Both catch blocks in commitSaves are empty. Accepted as design choice per spec.
2. **Co-author format mismatch** — Not found. Format is correct.
3. **No-op test fragility** — Not found. Uses robust rev-list count.
4. **Missed terminology fix** — Not found. All 9 changes made, all 4 preserved references intact.
5. **A010 test weakness** — Confirmed. Documents above.

What I didn't predict: nothing surprising emerged. The implementation is straightforward and well-scoped.

## AC Walkthrough
- **AC1:** ✅ PASS — Test at work.test.ts:3050 verifies git status clean after Think phase startWork. `commitSaves` called at work.ts:1601.
- **AC2:** ✅ PASS — Test at work.test.ts:3081 verifies git status clean after Plan phase startWork. `commitSaves` called at work.ts:1639.
- **AC3:** ✅ PASS — Test at work.test.ts:3054-3055 verifies `[fix-auth-timeout] Start work` and `Co-authored-by:` in commit.
- **AC4:** ✅ PASS — Test at work.test.ts:3087-3088 verifies `[plan-test] Start plan phase` and `Co-authored-by:` in commit.
- **AC5:** ✅ PASS — Test at work.test.ts:3107-3108 verifies commit count unchanged on second call. No error thrown.
- **AC6:** ✅ PASS — Test at work.test.ts:3058 verifies `git diff-tree` shows exactly one file: `.ana/plans/active/fix-auth-timeout/.saves.json`.
- **AC7:** ✅ PASS — Source inspection of commitSaves (work.ts:1893-1917) shows no `git push` calls. Test at work.test.ts:3139 confirms startWork succeeds without remote.
- **AC8:** ✅ PASS — All 8 work.ts terminology fixes verified by diff. artifact.ts line 937 changed. 4 "main tree"/"main project directory" references preserved at lines 989, 1006, 1347, 1554.
- **Tests pass:** ✅ PASS — 2029 passed, 2 skipped. No regressions (baseline was 2024 passed, 2 skipped — 5 new tests added).
- **No build errors:** ✅ PASS — Build: 2 tasks successful.

## Blockers

No blockers. All 14 contract assertions satisfied. All 10 acceptance criteria pass. No test regressions (2024→2029 passed). No unused exports in new code (commitSaves is private). No unhandled error paths beyond the intentional silent catch blocks. No assumptions about external state — commitSaves uses projectRoot from caller context. No spec gaps requiring undocumented decisions.

## Findings

- **Test — A010 assertion tests timing, not staging scope:** `packages/cli/tests/commands/work.test.ts:3124` — `extra.txt` is created after the commit, so the assertion only proves the file stays untracked afterward, not that scoped `git add` excludes it during commit. A009's `diff-tree` assertion at line 3058 carries the real scoped-staging proof. Weak but not incorrect — the test would still catch a `git add .` regression since the file exists when git status runs.
- **Code — commitSaves silently swallows commit failures:** `packages/cli/src/commands/work.ts:1914` — The outer catch block (line 1914) discards git commit errors. If `git commit` fails due to index.lock, disk full, or hook rejection, the user sees no indication. The spec explicitly says "don't block the user's workflow for a convenience commit" so this is an intentional design choice, but a failed commit means dirty `.saves.json` — the exact problem this feature solves. Worth monitoring.
- **Test — A011 no-push proof is indirect:** `packages/cli/tests/commands/work.test.ts:3134` — Relies on absence of remote as proof that push wasn't called. If someone adds a remote to the test fixture in a future test, this test would still pass even if push were added to commitSaves (it would fail, but the error is caught silently). Source inspection confirms no push calls in commitSaves.
- **Code — Mixed git API usage in commitSaves:** `packages/cli/src/commands/work.ts:1897` — Uses `runGit` (throws on failure) for `git add` but `spawnSync` (returns status) for `git diff` and `git commit`. This matches the artifact.ts pattern (spec reference) so it's consistent with project conventions, but within the function itself the dual API is worth noting for future maintainers.
- **Upstream — writeTimestamp race condition still present:** Pre-existing finding from Fix Pipeline Phase Timing — read-modify-write on `.saves.json` is not atomic. This build doesn't change writeTimestamp, so the race condition persists. Still present — see proof chain finding for that module.

## Deployer Handoff

Straightforward feature addition. The `commitSaves` helper is private to work.ts, follows the existing artifact.ts commit pattern, and adds no new dependencies. The 5 new tests all exercise real git operations in temp directories.

The terminology fixes (8 in work.ts, 1 in artifact.ts) are cosmetic — comments and error messages only. No logic changes. The variable `artifactBranch` was already used for all branch operations; only human-readable strings were updated.

After merge, verify that `ana work start {slug}` in a real project produces a clean `git status` (no dirty `.saves.json`). This was the original bug that motivated the feature.

## Verdict
**Shippable:** YES

All 14 contract assertions satisfied. All acceptance criteria pass. Tests pass with 5 new tests added and no regressions. The implementation is minimal, well-scoped, and follows established project patterns. Findings are observations for future cycles, not blockers.
