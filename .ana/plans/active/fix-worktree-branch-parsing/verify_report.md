# Verify Report: Fix worktree branch parsing

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-12
**Spec:** .ana/plans/active/fix-worktree-branch-parsing/spec.md
**Branch:** feature/fix-worktree-branch-parsing

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-worktree-branch-parsing/contract.yaml
  Seal: INTACT (hash sha256:2427e481ab399bf9af26425019d672f642f62d01032310a15074e850e6c8aa96)
```

Tests: 2178 passed, 0 failed, 2 skipped (2180 total). Build: clean. Lint: clean.

## Contract Compliance
| ID   | Says                                                                        | Status        | Evidence |
|------|-----------------------------------------------------------------------------|---------------|----------|
| A001 | Branch names from worktree-checked-out branches are clean and correct       | ✅ SATISFIED   | `packages/cli/tests/commands/work.test.ts:747` — `expect(json.items[0].workBranch).toBe('feature/test-slug')` |
| A002 | Pipeline stage advances to ready-for-verify when worktree has a build report | ✅ SATISFIED   | `packages/cli/tests/commands/work.test.ts:748` — `expect(json.items[0].stage).toBe('ready-for-verify')` |
| A003 | Current branch marker is still stripped correctly                           | ✅ SATISFIED   | `packages/cli/tests/commands/work.test.ts:796` — `expect(json.items[0].workBranch).toContain('dev/')` in block "getWorkBranch finds branch with custom prefix" (tagged `@ana A010` from prior contract, but test matches this contract's assertion) |
| A004 | The worktree plus-marker regex in work.ts uses a character class            | ✅ SATISFIED   | Source inspection: `packages/cli/src/commands/work.ts:144` — `.replace(/^[*+] /, '')` contains `[*+] ` |
| A005 | The worktree plus-marker regex in git.ts uses a character class             | ✅ SATISFIED   | Source inspection: `packages/cli/src/engine/detectors/git.ts:109` — `name.replace(/^[*+] /, '')` contains `[*+] ` |
| A006 | Test helper accepts a worktree option for creating real worktrees           | ✅ SATISFIED   | `packages/cli/tests/commands/work.test.ts:64` — `worktree?: boolean;` in slug type definition |
| A007 | Worktree cleanup runs before directory removal in test teardown             | ✅ SATISFIED   | `packages/cli/tests/commands/work.test.ts:27-50` — `git worktree list --porcelain` + `git worktree remove` loop before `fs.rm` at line 50 |
| A008 | All existing tests continue to pass after the fix                           | ✅ SATISFIED   | Test run: 2178 passed > 2177 threshold |
| A009 | Test count increases with the new worktree branch parsing test              | ✅ SATISFIED   | Test run: 2180 total > 2179 threshold |

## Independent Findings

**Prediction resolution:**

1. *"No dedicated test for A003 with + marker"* — Confirmed. The existing `featureBranch: true` test at line 781 tests `*` stripping with `dev/` prefix, but no test creates a worktree with `branchPrefix: 'dev/'` to test `+` stripping on custom prefixes. The new integration test only uses the default `feature/` prefix. Not a blocker — the regex is the same code path — but the `*` regression test and `+` test exercise different markers through different input mechanisms.

2. *"A004/A005 are source-inspection only"* — Confirmed. Both are source-content assertions with matcher `contains`. No behavioral test exercises `detectBranches()` in git.ts with worktree output. The work.ts path is covered end-to-end by the integration test.

3. *"Cleanup may fail if tempDir already deleted"* — Not found. The cleanup uses `cwd: tempDir` which is set before the try block. If tempDir is gone, `execSync` throws, caught by the outer catch. The `fs.rm` with `force: true` also handles missing dirs. Cleanup is robust.

4. *"No mutual exclusion between featureBranch and worktree"* — Confirmed. Both are separate `if` blocks (lines 107, 123). Setting both would create the branch via checkout, then `git worktree add -b` would fail because the branch already exists. No test exercises this, and the spec doesn't require it, but it's a latent footgun for future test authors.

5. *"Didn't consider detached HEAD lines"* — Not found. `git branch -a` shows `(HEAD detached at ...)` which starts with `(`, not `*` or `+`. The regex `^[*+] ` won't match. The trim + replace chain handles this correctly.

**Production risk assessment:** The `getWorkBranch` glob pattern `*${slug}` (line 140) is unchanged and has a known proof chain finding about over-matching for short slugs. Not introduced by this build — pre-existing.

## AC Walkthrough
| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | `getWorkBranch` returns clean branch name (no `+` prefix) for worktree branch | ✅ PASS | Test at line 747: `toBe('feature/test-slug')` — no `+` prefix |
| AC2 | `getWorkBranch` still strips `*` prefix for current branch | ✅ PASS | Existing test at line 796 (`toContain('dev/')`) uses `featureBranch: true` which creates `*`-marked branches. Still passes. |
| AC3 | `getWorkBranch` doesn't strip legitimate `+` in branch names | ⚠️ PARTIAL | No dedicated test. Regex `^[*+] ` requires trailing space — branch names like `feature/c++fixes` appear as `  feature/c++fixes` (space-padded, no marker space). The regex won't match. Verified by regex analysis, not by a test. |
| AC4 | `detectBranches()` in git.ts strips both `*` and `+` markers | ✅ PASS | Source inspection: `packages/cli/src/engine/detectors/git.ts:109` — `name.replace(/^[*+] /, '')`. No behavioral test for git.ts specifically, but source change is correct. |
| AC5 | `createWorkTestProject` accepts `worktree: true` | ✅ PASS | `packages/cli/tests/commands/work.test.ts:64` — option exists, used at line 740 |
| AC6 | Worktree artifacts written inside worktree dir, main tree stays on artifact branch | ✅ PASS | Lines 131-137: artifacts written to `wtSlugPath` under worktree. Line 141: `process.chdir(tempDir)` returns to main tree. `git worktree add` doesn't change the main tree's HEAD. |
| AC7 | Test uses `worktree: true` with build report, asserts clean workBranch and correct stage | ✅ PASS | Lines 732-749: creates worktree with `build_report.md`, asserts `workBranch` is `'feature/test-slug'` and stage is `'ready-for-verify'` |
| AC8 | afterEach cleanup removes worktrees | ✅ PASS | Lines 27-50: `git worktree list --porcelain` + remove loop runs before `fs.rm`. Pattern copied from `worktree.test.ts:27-54`. |
| AC9 | Existing tests unaffected | ✅ PASS | 2178 passed (was 2177 baseline + 1 new). No regressions. |
| AC10 | No existing tests break, count increases | ✅ PASS | 2180 total > 2179 baseline. 100 test files, same count. |
| Tests pass | `(cd packages/cli && pnpm vitest run)` | ✅ PASS | 2178 passed, 2 skipped, 0 failed |
| No build errors | `pnpm run build` | ✅ PASS | Clean build, 2 tasks successful |

## Blockers
No blockers. All 9 contract assertions satisfied. All ACs pass or partial. Checked for: unused exports in new code (none — no new exports), unused parameters (none — `worktree` option is used in the if-block), error paths that swallow silently (afterEach catches are intentional for cleanup robustness), assumptions about external state (worktree path uses `tempDir/worktrees/` which is created with `recursive: true`).

## Findings

- **Test — A003 tag mismatch:** `packages/cli/tests/commands/work.test.ts:781` — The test that satisfies A003 ("getWorkBranch finds branch with custom prefix") is tagged `@ana A010` from a prior contract cycle, not `@ana A003`. Functionally correct — the test does what A003 specifies — but the tag lineage is muddled. Future proof chain queries for A003 won't find it.

- **Test — No behavioral test for git.ts detectBranches with worktree output:** `packages/cli/src/engine/detectors/git.ts:109` — The integration test exercises the `work.ts:144` code path end-to-end. The identical fix in `git.ts:109` is verified only by source inspection (A005). If the git.ts regex were reverted, no test would catch it. The two parsing sites handle the same `git branch` output but are tested at different confidence levels.

- **Code — No guard against featureBranch + worktree both true:** `packages/cli/tests/commands/work.test.ts:107-142` — Both `featureBranch` and `worktree` are checked with independent `if` blocks. If a future test author sets both, `git worktree add -b` fails because the branch already exists from the checkout path. A comment or early guard would prevent confusion.

- **Test — AC3 (legitimate `+` in branch names) verified by regex analysis, not a test:** The spec explicitly says "doesn't need a separate test — it's a property of the regex" (spec line 77). Fair call — the trailing space in `[*+] ` makes false-positive stripping impossible. But the absence of a test means this property is verified by human reasoning, not by CI.

- **Upstream — Phase detection tagged-test gap still present:** Proof chain shows "Phase detection logic (A001-A003, A006-A011) has no dedicated tagged tests" from the Worktree Isolation cycle. Still present — not addressed by this build (different scope). See prior finding.

## Deployer Handoff
Clean, minimal fix. Two regex changes (work.ts:144, git.ts:109) widen `*`-only stripping to `[*+]`. One new integration test creates a real git worktree and asserts the full pipeline path. The afterEach cleanup pattern is copied from worktree.test.ts.

After merge, `ana work status` will correctly detect worktree-based builds as `ready-for-verify` instead of showing `build-in-progress`. This unblocks the verification pipeline for any active worktree.

No migration, no config changes, no new dependencies.

## Verdict
**Shippable:** YES

All 9 contract assertions satisfied. 2178 tests pass, 0 failures, clean build, clean lint. The fix is two regex character-class widenings and one well-structured integration test. The git.ts path lacks a behavioral test (source-inspection only), but the regex is identical to the integration-tested work.ts path. Findings are debt and observations — none qualify as blockers.
