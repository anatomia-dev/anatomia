# Verify Report: Worktree freshness detection

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-12
**Spec:** .ana/plans/active/worktree-freshness-detection/spec.md
**Branch:** feature/worktree-freshness-detection

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/worktree-freshness-detection/.ana/plans/active/worktree-freshness-detection/contract.yaml
  Seal: INTACT (hash sha256:16753070a4ce245e8922daaa810df0b901592c29783bed28971e03502923d309)
```

Seal status: **INTACT**

Tests: 2177 passed, 2 skipped (2179 total). Baseline was 2156 passed — 21 new tests added.
Build: success.
Lint: 1 pre-existing warning (unused eslint-disable directive), 0 errors.

## Contract Compliance

| ID   | Says                                                          | Status        | Evidence |
|------|---------------------------------------------------------------|---------------|----------|
| A001 | Worktree info includes how many commits behind the main branch it is | ✅ SATISFIED | `packages/cli/tests/utils/worktree.test.ts:377` — `expect(info!.commitsBehind).toBeDefined()` |
| A002 | A freshly-created worktree shows zero commits behind          | ✅ SATISFIED | `packages/cli/tests/utils/worktree.test.ts:378` — `expect(info!.commitsBehind).toBe(0)` |
| A003 | When main advances, the worktree correctly reports how far behind it is | ✅ SATISFIED | `packages/cli/tests/utils/worktree.test.ts:396` — `expect(info!.commitsBehind).toBe(2)` after 2 commits on main with `git update-ref` |
| A004 | A worktree can be both ahead and behind at the same time      | ✅ SATISFIED | `packages/cli/tests/utils/worktree.test.ts:416-417` — `commitCount > 0` and `commitsBehind > 0` after diverged commits |
| A005 | Git failures during behind-count don't crash the system       | ✅ SATISFIED | `packages/cli/tests/utils/worktree.test.ts:431` — `commitsBehind` is 0 in test env without `origin/main` ref, exercising the catch-default-0 path |
| A006 | Status shows a behind-count warning when the worktree is stale | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:576` — `expect(output).toContain('behind')` after advancing main |
| A007 | Status output is clean when the worktree is up to date        | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:596` — `expect(output).not.toContain('behind main')` |
| A008 | JSON status output includes the behind-count for machine consumption | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:617-618` — `commitsBehind` exists and is a number in JSON output |
| A009 | Resuming a build on a stale worktree shows a rebase suggestion | ✅ SATISFIED | Source inspection: `packages/cli/src/commands/work.ts:2077-2078` prints `chalk.yellow(... behind ... Consider rebasing ...)` when `commitsBehind > 0` |
| A010 | Resuming a build on a fresh worktree shows no extra warnings  | ✅ SATISFIED | Source inspection: `packages/cli/src/commands/work.ts:2077` — `if (commitsBehind > 0)` gate prevents output when 0 |
| A011 | Creating a PR when behind main shows a warning before the PR is made | ✅ SATISFIED | Source inspection: `packages/cli/src/commands/pr.ts:184-188` — rev-list check + yellow warning before PR body generation at line 199+ |
| A012 | Completed work records which commit the code was verified against | ✅ SATISFIED | Source inspection: `packages/cli/src/commands/work.ts:1531-1536` computes merge-base, line 1571 spreads `base_commit` into `worktreeMeta` |
| A013 | The recorded base commit is a full 40-character git SHA        | ✅ SATISFIED | Source inspection: `packages/cli/src/commands/work.ts:1534` — `mbResult.stdout.length >= 40` check + `.slice(0, 40)` extracts exactly 40 chars |
| A014 | Old proof chain entries without base_commit continue to work   | ✅ SATISFIED | Source inspection: `packages/cli/src/types/proof.ts:96` — field is `base_commit?: string` (optional). Spread pattern at `work.ts:1571` omits when undefined. No consumer requires it. |
| A015 | The proof chain type definition includes the base_commit field | ✅ SATISFIED | `packages/cli/src/types/proof.ts:96` — `base_commit?: string;` inside `worktree` type |
| A016 | All existing tests continue to pass after the changes          | ✅ SATISFIED | 2177 passed, 2 skipped. Baseline 2156 passed. No regressions. |
| A017 | Behind warnings use yellow color to signal informational status | ✅ SATISFIED | Source inspection: `work.ts:653` (`chalk.yellow`), `work.ts:2078` (`chalk.yellow`), `pr.ts:187` (`chalk.yellow`). All three warning sites use yellow. |

## Independent Findings

**Prediction resolution:**

1. **Predicted: `printExistingWorktree` missing `origin/` ref handling.** Partially confirmed — the code uses `origin/${artifactBranch}` and the catch block defaults to 0 if the ref doesn't exist. Not a bug; correct error handling.
2. **Predicted: `pr.ts` offline scenario.** Not found — the builder correctly separated fetch and rev-list into separate try-catch blocks. Offline fetch doesn't prevent the behind-count attempt against local refs.
3. **Predicted: `base_commit` trailing newline.** The concern was valid — git outputs SHAs with a trailing newline. Builder handled it with `.slice(0, 40)`. Correct.
4. **Predicted: A005 test mocking.** Partially confirmed — the test doesn't mock git failure; it relies on the test environment lacking `origin/main`. This works but tests the "ref not found" path, not "git binary crash" path.
5. **Predicted: A008 JSON test weak assertion.** Confirmed — `typeof commitsBehind === 'number'` and `toBeDefined()` pass even if the computation returns `NaN` (which `parseInt` could produce, though `|| 0` prevents it). The assertion is structurally correct but doesn't verify the actual value.

**Surprise finding:** None. The implementation is clean, tightly scoped, and well-matched to the spec. No scope creep, no dead code, no YAGNI violations. Every new line maps to a spec requirement.

**Over-building check:** Grep of new code shows no extra exports, no unused functions, no added abstractions. The `WorkItem.worktreeInfo` interface in work.ts gained `commitsBehind` — which flows naturally from the `WorktreeInfo` interface change.

**Asymmetric ref comparison:** `commitCount` uses `${artifactBranch}..${branchName}` (local refs) while `commitsBehind` uses `${branchName}..origin/${artifactBranch}` (remote-tracking ref). This is intentional — `commitCount` counts local work (which is always local), while `commitsBehind` needs the remote state to be meaningful. The asymmetry is correct but worth documenting.

## AC Walkthrough

- **AC1:** `getWorktreeInfo` returns a `commitsBehind` field → ✅ PASS — `WorktreeInfo` interface has `commitsBehind: number` at `worktree.ts:41`, computed at line 324-335.
- **AC2:** `commitsBehind` is 0 when up to date → ✅ PASS — Test at `worktree.test.ts:378` asserts `toBe(0)`.
- **AC3:** `commitsBehind` correctly computed when artifact branch advances → ✅ PASS — Test at `worktree.test.ts:396` asserts `toBe(2)` after 2 commits + `git update-ref`.
- **AC4:** `commitsBehind` defaults to 0 on git failure → ✅ PASS — Test at `worktree.test.ts:431` asserts `toBe(0)` without `origin/main`.
- **AC5:** `work status` displays `commitsBehind` when > 0 → ✅ PASS — Test at `work.test.ts:576` asserts `toContain('behind')`.
- **AC6:** `work status` does NOT show behind-count when 0 → ✅ PASS — Test at `work.test.ts:596` asserts `not.toContain('behind main')`.
- **AC7:** `startBuildPhase` resume path prints warning when > 0 → ✅ PASS — Source: `work.ts:2077-2078`, `if (commitsBehind > 0)` prints chalk.yellow warning.
- **AC8:** `printExistingWorktree` includes `commitsBehind` in output when > 0 → ✅ PASS — Same as AC7 — `printExistingWorktree` is the function called on resume. `work.ts:2077-2078`.
- **AC9:** `pr create` warns when behind → ✅ PASS — Source: `pr.ts:184-188`, fetch + rev-list + yellow warning.
- **AC10:** All warnings are informational (yellow, not blocking) → ✅ PASS — All three sites use `chalk.yellow`. No `process.exit`, no thrown errors. Operations continue after warning.
- **AC11:** `work complete` computes `merge-base` and stores `base_commit` → ✅ PASS — Source: `work.ts:1531-1536` computes, `work.ts:1571` stores via spread.
- **AC12:** `base_commit` is a 40-char SHA → ✅ PASS — Source: `work.ts:1534` checks `length >= 40`, `.slice(0, 40)`.
- **AC13:** If `merge-base` fails, `base_commit` is omitted → ✅ PASS — Source: `work.ts:1537-1539` catch block leaves `baseCommit` undefined; spread at 1571 excludes undefined. Field is never null or empty string.
- **AC14:** Old proof chain entries without `base_commit` work → ✅ PASS — Type is `base_commit?: string` (optional). No code reads `base_commit` from existing entries.
- **AC15:** `ProofChainEntry.worktree` type includes `base_commit?: string` → ✅ PASS — `proof.ts:96`.
- **AC16:** No existing tests break, count increases → ✅ PASS — 2177 passed (was 2156), 2 skipped (unchanged), 0 failed.
- **AC17:** `work status --json` includes `commitsBehind` → ✅ PASS — Test at `work.test.ts:617-618` asserts field exists in JSON output.

## Blockers

None. All 17 contract assertions SATISFIED. All 17 ACs pass. No test regressions. No lint errors.

Checked for: unused exports in new code (none — `commitsBehind` on `WorktreeInfo` is consumed by `printHumanReadable`, `printExistingWorktree`, and JSON output). Unused parameters in new code (none). Error paths that swallow silently (3 catch blocks in new code — all intentional, matching existing patterns). Sentinel tests that pass on broken AND working code (A008's type check is weakest, but `commitsBehind` is also tested with specific values in A002/A003).

## Findings

- **Code — Asymmetric ref comparison in `getWorktreeInfo`:** `packages/cli/src/utils/worktree.ts:327` — `commitsBehind` checks against `origin/${artifactBranch}` while `commitCount` at line 313 checks against bare `${artifactBranch}`. The asymmetry is intentionally correct (local work vs remote state) but undocumented. A comment explaining the `origin/` prefix would help the next engineer who reads both blocks side-by-side.

- **Code — printExistingWorktree duplication grows:** `packages/cli/src/commands/work.ts:2064-2071` — This function now duplicates both `commitCount` and `commitsBehind` rev-list logic from `getWorktreeInfo`. The duplication is acknowledged in the spec (Gotchas section) and matches a known proof chain finding from kind-aware-branch-prefixes. Three places now read branch-related git data inline: `getWorktreeInfo`, `printExistingWorktree`, and `startWork` resume path. Upstream — still present, see kind-aware-branch-prefixes finding.

- **Test — A008 assertion checks structure not correctness:** `packages/cli/tests/commands/work.test.ts:618` — Uses `typeof === 'number'` and `toBeDefined()`. Per testing-standards, prefer specific expected values. Since the test creates a worktree at current main with no divergence, the expected value is `0`. `expect(json.items[0].worktreeInfo.commitsBehind).toBe(0)` would be stronger.

- **Test — A005 git failure coverage is indirect:** `packages/cli/tests/utils/worktree.test.ts:421-431` — Tests the "ref not found" error path by not creating `origin/main`. This does exercise the catch block, but doesn't cover scenarios like corrupted git state or git binary absence. Acceptable for this scope — the error handling mirrors the existing `commitCount` pattern which has the same coverage gap.

- **Test — Six assertions verified by source inspection only:** A009, A010, A011, A012, A013, A014 have no tagged tests. These are display-logic and proof-chain-metadata assertions that are difficult to unit test without heavyweight mocking. Source inspection confirms correctness. Not a blocker — the builder made a reasonable call to verify these by inspection rather than writing fragile mocks.

- **Code — pr.ts fetch adds latency:** `packages/cli/src/commands/pr.ts:179` — Every `ana pr create` now fetches before the behind-check. On slow networks or offline, this adds visible delay. The spec acknowledges this trade-off ("PR creation is already a network operation"). The fetch has no timeout — git's default network timeout applies. Acceptable — matches the spec's design decision.

- **Upstream — Stale finding from kind-aware-branch-prefixes likely deepened by this build:** The proof chain finding about `printExistingWorktree` duplicating HEAD-reading logic now has an additional dimension — it duplicates `commitsBehind` too. The spec explicitly chose to extend the duplication rather than refactor. Future scope candidate.

## Deployer Handoff

- This is a purely additive change — no existing behavior modified, no breaking changes.
- The `WorktreeInfo` interface gained `commitsBehind: number`. Any external consumers of this type will need updating, but currently all consumers are internal.
- The `ProofChainEntry.worktree` type gained `base_commit?: string`. Optional field — no migration needed.
- The `pr.ts` change adds a network fetch to every `ana pr create` invocation. This is by design but will be visible on slow connections.
- Test count increased from 2156 to 2177 (+21). No test regressions.

## Verdict

**Shippable:** YES

Clean, well-scoped implementation. Every change maps to a spec requirement with no over-building. All 17 contract assertions satisfied. All 17 ACs pass. 21 new tests, zero regressions. The duplication in `printExistingWorktree` is acknowledged tech debt, not a new problem. The weak type-check assertion in A008 is the only testing standards deviation, and it's covered by specific-value assertions in the unit tests (A002, A003). I would ship this.
