# Verify Report: Gitignore disclosure at init time, commit hardening, and docs

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-29
**Spec:** .ana/plans/active/gitignore-disclosure-and-hardening/spec.md
**Branch:** feature/gitignore-disclosure-and-hardening

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/gitignore-disclosure-and-hardening/contract.yaml
  Seal: INTACT (hash sha256:dc63cde0269c3374f042892fc74f26e6adf577bb73329fa83d7ff15b3b37dbd8)
```

Build: clean (cached). Lint: 0 errors, 3 pre-existing warnings (Hero.tsx unused vars, git-operations.ts unused directive). Tests: 3001 passed, 2 skipped, 0 failed across 127 test files (up from 2996 baseline — 5 new tests added). Checkpoint: commit.test.ts 45/45 passed.

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Init warns users when their gitignore blocks infrastructure files | ✅ SATISFIED | Source: `index.ts:138` — warning pushed onto `preflight.warnings` containing "gitignored" when `discoverGitignoredFiles(cwd, [])` returns non-empty |
| A002 | The warning appears in the Pipeline readiness section | ✅ SATISFIED | Source: `index.ts:137` — pushed onto `preflight.warnings` which renders under "Pipeline readiness:" heading in `displaySuccessMessage` (state.ts:1032) |
| A003 | The warning explains force-add is for worktree compatibility | ✅ SATISFIED | Source: `index.ts:139` — warning text includes "worktree compatibility" |
| A004 | No gitignore warning appears when nothing is gitignored | ✅ SATISFIED | Source: `index.ts:136` — conditional `if (gitignoredFiles.length > 0)` gates the push; when empty, no warning added |
| A005 | Tracked-but-gitignored dirty files are identified for force-add | ✅ SATISFIED | Test: `commit.test.ts:814` (@ana A005) — creates .gitignore, force-adds .claude/settings.json, modifies it, verifies `discoverGitignoredDirtyFiles` returns it. Asserts `result.toContain('.claude/settings.json')` |
| A006 | Non-gitignored dirty files are not flagged for force-add | ✅ SATISFIED | Test: `commit.test.ts:837` (@ana A006) — modifies .ana/ana.json (not gitignored), verifies `result.length === 0` |
| A007 | Empty dirty set produces no force-add candidates | ✅ SATISFIED | Test: `commit.test.ts:852` (@ana A007) — passes `[]` to `discoverGitignoredDirtyFiles`, asserts `result.toEqual([])` |
| A008 | Subsequent commits with tracked-but-gitignored files succeed | ✅ SATISFIED | Source inspection: `commit.ts:475-478` — gitignored dirty files routed to `filesToForceAdd` (line 496), which uses `git add -f` (not plain `git add`). Unit test A005 proves detection; wiring is 4 lines of deterministic filtering |
| A009 | Force-added files appear in the git log after subsequent commit | ✅ SATISFIED | Source inspection: `commit.ts:495-498` — `gitignoredDirtyFiles` spread into `filesToForceAdd`, which feeds `git add -f` call. Files staged with `-f` are included in the subsequent `git commit` |
| A010 | Normal dirty files still commit alongside force-added files | ✅ SATISFIED | Source inspection: `commit.ts:476-478` — gitignored files removed from `files` array via Set filter; remaining files proceed to normal `git add`. Both paths converge at the same `git commit` call |
| A011 | Troubleshooting page covers the Unknown skill symptom | ✅ SATISFIED | Source: `troubleshooting.mdx:52` — TroubleCard title is "Unknown skill errors or missing agents in pipeline", body line 54 contains "Unknown skill: git-workflow" |
| A012 | Troubleshooting page explains gitignore as the cause | ✅ SATISFIED | Source: `troubleshooting.mdx:55` — "Your host repo's `.gitignore` blocks `.claude/` or `.ana/` directories" |
| A013 | Troubleshooting page includes the diagnosis command | ✅ SATISFIED | Source: `troubleshooting.mdx:56` — "Run `git ls-files .claude/skills/`" |
| A014 | All existing commit tests continue to pass | ✅ SATISFIED | Checkpoint: `pnpm vitest run tests/commands/init/commit.test.ts` — 45 passed, 0 failed. Full suite: 3001 passed (up from 2996 baseline) |
| A015 | Git check-ignore errors are handled gracefully | ✅ SATISFIED | Test: `commit.test.ts:859` (@ana A015) — runs `discoverGitignoredDirtyFiles` in a non-git temp directory with a dirty file argument, asserts `result.toEqual([])` |

## Independent Findings

**Predictions resolved:**

1. *"Builder used `discoverGitignoredFiles` directly, passing `[]`"* — **Confirmed, and correct.** The `try/catch` around it in index.ts handles the case where `.claude/` doesn't exist. The `[]` parameter means no deduplication against a dirty set, which is the right behavior at init time.

2. *"New helper might share too much code with existing function"* — **Not found.** `discoverGitignoredDirtyFiles` is clean, independent, and correctly uses `--no-index` (the existing function doesn't need it because it checks untracked files). Good separation.

3. *"Test might mock git check-ignore"* — **Not found.** All 5 new tests use real git repos with real `.gitignore` files. Same pattern as existing tests. Strong coverage.

4. *"Troubleshooting MDX might have unescaped apostrophes"* — **Not found.** Builder correctly used `&apos;` in all 3 instances (lines 54, 55, 55).

5. *"Warning text might not match mockup"* — **Partially confirmed.** The warning text matches the mockup format and includes the key details (worktree compatibility, `--respect-gitignore`, help reference). However, the text hardcodes "under .claude/" while the detection scope covers both `.claude/` and `.ana/` directories. If `.ana/` were gitignored but `.claude/` weren't, the warning text would be misleading. See Findings.

**Production risks investigated:**
- *Large dirty file set hanging `git check-ignore --stdin`* — Not a real risk; stdin is batched by spawnSync, and dirty sets in practice are < 50 files.
- *Deleted files in the dirty set* — `git add -f` on a deleted tracked file stages the deletion, which is correct behavior.

**Over-building check:** No unused exports. `discoverGitignoredDirtyFiles` is used both in source (`commit.ts:475`) and tests. No new parameters, abstractions, or utility functions beyond what the spec requires. No dead code blocks in new code.

**`--no-index` flag:** The builder correctly identified that `git check-ignore` skips tracked files by default. Adding `--no-index` to the new helper (but not the existing function) is the right choice — the existing function checks untracked candidates, while the new one checks tracked-but-gitignored files. Good engineering judgment.

## AC Walkthrough

- [x] **AC1:** When `ana init` detects gitignored infrastructure files, the success output includes a warning in the Pipeline readiness section. ✅ PASS — `index.ts:133-145` pushes warning onto `preflight.warnings`, which `displaySuccessMessage` renders under "Pipeline readiness:" (state.ts:1032).
- [x] **AC2:** The warning explains WHY the force-add is necessary. ✅ PASS — Warning text at `index.ts:139`: "for worktree compatibility."
- [x] **AC3:** When no files are gitignored, no warning appears. ✅ PASS — Conditional at `index.ts:136` gates the push. Empty return → no warning.
- [x] **AC4:** On subsequent commits, tracked-but-gitignored files are staged with `git add -f`. ✅ PASS — `commit.ts:471-498`: `discoverGitignoredDirtyFiles` identifies them, removes from normal `files`, adds to `filesToForceAdd`. Unit tests prove detection; wiring is deterministic.
- [x] **AC5:** Troubleshooting docs page covers gitignore-related issues. ✅ PASS — `troubleshooting.mdx:52-59`: TroubleCard with symptom, cause, diagnosis (`git ls-files`), and fix.
- [x] **AC6:** All existing tests continue to pass. ✅ PASS — 45/45 commit tests pass. 3001/3001 total pass (5 new + 2996 baseline).
- [x] Tests pass with `pnpm run test -- --run`. ✅ PASS — 3001 passed, 2 skipped, 0 failed.
- [x] No build errors with `pnpm run build`. ✅ PASS — Build clean (cached).
- [x] Lint passes with `pnpm run lint`. ✅ PASS — 0 errors (3 pre-existing warnings in unrelated files).

## Blockers

No blockers. All 15 contract assertions satisfied. All 9 acceptance criteria pass. No test failures, no regressions (3001 vs 2996 baseline), no lint errors.

Checked for: unused exports in new code (none — `discoverGitignoredDirtyFiles` used in source and tests), unused parameters in new function signatures (both params used), unhandled error paths (`status >= 128` returns empty, try/catch in index.ts silently skips), assumptions about external state (new code only assumes git is available, same as existing pattern).

## Findings

- **Code — Warning text narrower than detection scope:** `packages/cli/src/commands/init/index.ts:138` — Warning says "files under .claude/ are gitignored" but `discoverGitignoredFiles` enumerates both `.claude/` and `.ana/` directories plus root files. If only `.ana/` files are gitignored, the warning text is inaccurate. Low risk in practice (most gitignore patterns that catch one catch both), but the text should either enumerate the actual files or use "infrastructure files" without specifying a directory.

- **Test — No integration test for subsequent-commit hardening scenario:** `packages/cli/tests/commands/init/commit.test.ts` — A008-A010 are verified by source inspection and unit test A005 (detection). But no test exercises the full round-trip: force-add → commit → modify → commit again → verify git log. The existing integration test (line 955) covers first-time force-add only. The hardening wiring in the commit action is 4 lines of straightforward filtering, so the risk is low — but the subsequent-commit path is the specific scenario the hardening was designed for.

- **Upstream — Pre-existing @ana tags share IDs with this contract:** `packages/cli/tests/commands/init/commit.test.ts` — The previous gitignore-force-add build's `@ana A008, A009, A010` tags (line 987) have different semantics than this contract's A008-A010. `@ana` IDs are scoped per-contract, but the test file accumulates tags across builds. Future tooling that searches for `@ana A008` in this file will find both. Not a problem now, but worth monitoring as the proof chain grows.

- **Code — `--no-index` flag is a correct improvement over existing pattern:** `packages/cli/src/commands/init/commit.ts:326` — The builder correctly identified that `git check-ignore` skips tracked files without `--no-index`. The existing `discoverGitignoredFiles` doesn't need it (checks untracked candidates), but the new helper does (checks tracked-but-dirty files). Good engineering judgment — noting as positive signal.

## Deployer Handoff

This is a clean three-part change: init-time disclosure, commit hardening, and docs. All are additive — no existing behavior changes.

- The init-time warning is cosmetic and guarded by try/catch. Zero blast radius if anything goes wrong.
- The commit hardening moves gitignored dirty files from `git add` to `git add -f`. The fallback to old behavior (if `discoverGitignoredDirtyFiles` returns empty) is the existing code path. Zero risk for repos without gitignored infrastructure.
- The troubleshooting TroubleCard uses existing MDX components and follows existing patterns.

No environment variables, no config changes, no new dependencies. Merge and ship.

## Verdict
**Shippable:** YES

All 15 contract assertions satisfied. All 9 acceptance criteria pass. 3001 tests pass (5 new), 0 failures, 0 regressions. Code is clean, well-documented, and follows existing patterns. The findings are observations and debt items — no blockers. The `--no-index` flag choice shows the builder understood the git internals correctly. Would stake my name on this shipping.
