# Verify Report: work.ts saves.json backward compat bug + worktree dedup + formatting

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-15
**Spec:** .ana/plans/active/fix-work-saves-compat/spec.md
**Branch:** feature/fix-work-saves-compat

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-work-saves-compat/contract.yaml
  Seal: INTACT (hash sha256:07ec902427d6cfa6eef4d6447fbd405851dc8a1dafb73a313ac8da7f244ac4e9)
```

Tests: 2302 passed, 2 skipped (2304 total), 104 test files. Build: success. Lint: success.

Baseline was 2297 passed — net gain of 5 tests, consistent with spec expectation of 4+ new tests plus the `createMergedProject` helper fix enabling previously-broken multi-phase completeWork tests.

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Phase 2 cannot pass completeness checks using phase 1's legacy save data | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:2598` — creates 2-phase project, overwrites .saves.json with unnumbered keys, asserts `captureAsyncError` output contains `build-report` (exit 1 path) |
| A002 | Phase 1 still uses legacy save data when numbered keys are missing | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:2620` — creates single-phase project with unnumbered keys via createMergedProject, calls completeWork successfully, asserts completed directory exists |
| A003 | Phase 2 status detection does not fall back to legacy save keys | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:565` — 2-phase project with unnumbered saves, phase 2 FAIL verify, asserts `not.toContain('phase-2-ready-for-re-verify')` and `toContain('phase-2-needs-fixes')` |
| A004 | Phase 1 status detection still uses legacy save keys when needed | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:602` — 2-phase project with unnumbered saves, phase 1 FAIL verify, asserts `toContain('phase-1-ready-for-re-verify')` |
| A005 | The existing backward compat test asserts the corrected behavior | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:565` — same test as A003. The original test asserted `phase-2-ready-for-re-verify` (buggy). Updated to assert `not.toContain('phase-2-ready-for-re-verify')` and `toContain('phase-2-needs-fixes')` (correct). |
| A006 | Worktree display reuses the shared worktree info function instead of duplicating git queries | ✅ SATISFIED | `packages/cli/src/commands/work.ts:2132` — `const wtInfo = getWorktreeInfo(projectRoot, slug)`. Manual git queries (rev-parse, rev-list ahead/behind) removed. Source inspection confirms implementation contains `getWorktreeInfo`. |
| A007 | Worktree display still shows branch name, commit count, and path | ✅ SATISFIED | `packages/cli/src/commands/work.ts:2141-2148` — displays `wtInfo.branch`, `wtInfo.commitCount`, `wtInfo.commitsBehind`, relative path. Same fields as before, sourced from WorktreeInfo instead of manual queries. |
| A008 | Multi-line next actions display with proper arrow prefix on each line | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:704` — ready-to-merge test filters output lines containing `→`, asserts >= 2 arrow lines, first contains 'Review PR', second contains 'Or to merge'. |
| A009 | Next action returns an array for multi-line cases instead of embedded newlines | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:733` — JSON output test parses output, asserts `Array.isArray(json.items[0].nextAction)` is true, length is 2, elements contain expected text. |
| A010 | All existing tests continue to pass after the changes | ✅ SATISFIED | Full suite: 2302 passed, 2 skipped, 104 test files. No failures. No regressions. |

## Independent Findings

**Unscoped deletion — resolves claims summary removed.** The diff removes ~25 lines of resolves-claims logic from `completeWork` (both JSON and human-readable output paths, lines ~1691-1703 and ~1720-1731 in the original). It also deletes ~120 lines of tests (the entire "resolves claims summary line" describe block — 3 tests covering emit/no-emit/proof-chain-preservation). This feature was shipped in the `upstream-finding-resolution` build just one commit before this branch point. The spec says nothing about removing this feature. The scope mentions only three fixes: phase guard, worktree dedup, and formatting.

The code removal doesn't break anything — tests pass, the feature it removes is self-contained. But it's an unscoped change that removes recently-shipped functionality. The resolves claims feature was the output of a full pipeline cycle (scope → plan → build → verify → PR → merge). Removing it without a scope decision undermines the pipeline's authority.

**Why this isn't a FAIL:** The contract doesn't include any assertion about preserving the resolves claims feature. All 10 contract assertions are SATISFIED. The removal is outside contract scope — it's an observation about build discipline, not a contract violation.

**Weak arrow-count assertion.** `packages/cli/tests/commands/work.test.ts:728` uses `expect(arrowLines.length).toBeGreaterThanOrEqual(2)` instead of `toBe(2)`. For the ready-to-merge case, exactly 2 arrow lines are expected. `>= 2` would pass if a future bug added spurious arrow lines. Not a blocker — the companion assertions on line content (`'Review PR'`, `'Or to merge'`) provide sufficient behavioral coverage, but the count assertion is weaker than it should be.

**createMergedProject helper now produces phase-numbered keys for multi-phase.** The helper at `packages/cli/tests/commands/work.test.ts:1249-1273` was updated to use `build-report-N`/`verify-report-N` keys when `phases > 1`. This is correct — it aligns the test helper with the real pipeline behavior. But it means all existing multi-phase completeWork tests now use numbered keys, where previously they used unnumbered. The suite still passes, confirming the completeWork code path handles numbered keys correctly and was never actually depending on the unnumbered fallback for multi-phase.

## AC Walkthrough

- **AC1:** ✅ PASS — `packages/cli/tests/commands/work.test.ts:2598` test creates 2-phase project with unnumbered saves, `completeWork` throws error containing `build-report`. Source at `work.ts:1563`: `!isUnnumbered && phaseNum === 1` guard prevents phase 2 fallback.
- **AC2:** ✅ PASS — `packages/cli/tests/commands/work.test.ts:565` test verifies getWorkStatus with 2-phase project and unnumbered saves. Output does not contain `phase-2-ready-for-re-verify`, contains `phase-2-needs-fixes`. Source at `work.ts:472`: `phaseNum === 1 ? saves['build-report'] : undefined` guard applied.
- **AC3:** ✅ PASS — Two tests confirm backward compat: `work.test.ts:602` (phase 1 status detection falls back to unnumbered keys, output contains `phase-1-ready-for-re-verify`) and `work.test.ts:2620` (completeWork accepts phase 1 with unnumbered keys, completion succeeds).
- **AC4:** ✅ PASS — `work.test.ts:2598` (phase 2 rejected with unnumbered keys) and `work.test.ts:2620` (phase 1 accepted with unnumbered keys) cover completeWork's multi-phase completeness check for both numbered and unnumbered saves.json keys.
- **AC5:** ✅ PASS — Test at `work.test.ts:565` updated from `expect(output).toContain('phase-2-ready-for-re-verify')` to `expect(output).not.toContain('phase-2-ready-for-re-verify')` + `expect(output).toContain('phase-2-needs-fixes')`. New companion test at line 602 for phase 1 fallback.
- **AC6:** ✅ PASS — `printExistingWorktree` at `work.ts:2132` calls `getWorktreeInfo(projectRoot, slug)`. All manual git queries removed (rev-parse, rev-list ahead/behind). Uses `wtInfo.path`, `wtInfo.branch`, `wtInfo.commitCount`, `wtInfo.commitsBehind`. `artifactBranch` parameter preserved for warning text.
- **AC7:** ✅ PASS — `getNextAction` return type changed to `string | string[]` at `work.ts:505`. Ready-to-merge case returns 2-element array at line 531. Display caller at `work.ts:662-668` handles array with per-line `→ ` prefix. `WorkItem.nextAction` type updated to `string | string[]` at line 82.
- **AC8:** ✅ PASS — 2302 tests passed, 2 skipped, 104 test files. No failures. Baseline was 2297 — net +5 tests (4 new + 1 helper fix enabling a previously-broken path).

## Blockers

No blockers. All 10 contract assertions satisfied. All 8 ACs pass. Tests green. Build and lint clean. Checked for: unused parameters in new code (the `artifactBranch` param in `printExistingWorktree` is still used for the behind-warning text — correct), unhandled error paths (the `!wtInfo` null check at line 2134 handles the no-worktree case), sentinel tests that pass on broken code (A003 test uses `not.toContain` + positive `toContain` — both arms needed to distinguish the bug), dead code blocks in new code (the `Array.isArray` branch at line 662 and the else branch at line 667 are both reachable — array for ready-to-merge, string for all other stages).

## Findings

- **Code — Resolves claims summary removed without scope authorization:** `packages/cli/src/commands/work.ts` (lines ~1691-1703 and ~1720-1731 in original) — removes the "Verify claims N finding(s) resolved" line from human-readable output and `resolves_claims` from JSON output. This was shipped in the previous pipeline cycle (`upstream-finding-resolution`). The deletion is clean and tests pass, but it's unscoped removal of recently-shipped functionality. Risk: low (the feature is informational). Impact: users running `ana work complete` with upstream resolves findings will no longer see the claims summary.
- **Code — Resolves claims tests deleted:** `packages/cli/tests/commands/work.test.ts` — 3 tests (~120 lines) removed from the "resolves claims summary line" describe block. These tested: (1) summary emitted when upstream findings have resolves, (2) no summary when no resolves, (3) proof chain preserves resolves field. Since the feature code was removed, the tests are correctly removed too. But the feature removal itself is unscoped.
- **Test — Arrow-line count assertion is weak:** `packages/cli/tests/commands/work.test.ts:728` — `toBeGreaterThanOrEqual(2)` should be `toBe(2)` for the ready-to-merge case which produces exactly 2 arrow lines. Passes with spurious extra arrows.
- **Upstream — printExistingWorktree duplication resolved:** The manual git queries (rev-parse HEAD, rev-list ahead, rev-list behind) in `printExistingWorktree` are replaced with a single `getWorktreeInfo` call. Resolves `kind-aware-branch-prefixes-C5`.
- **Upstream — saves.json fallback bug resolved:** Both `getWorkStatus` (line 472) and `completeWork` (line 1563) now guard the unnumbered-key fallback with `phaseNum === 1`. Phase 2+ can no longer satisfy completeness using phase 1's legacy data. Resolves `fix-cycle-stage-detection-C3`.
- **Upstream — getNextAction multi-line formatting resolved:** Returns `string[]` for ready-to-merge. Caller formats each element with `→` prefix. JSON output serializes as proper array instead of `\n`-embedded string. Resolves `work-complete-merge-C4`.

## Deployer Handoff

Three clean fixes plus one unscoped deletion. The three fixes are straightforward and well-tested:
1. Phase guard on saves.json fallback — both getWorkStatus and completeWork paths fixed identically.
2. printExistingWorktree dedup — 20 lines of manual git queries replaced with 1 getWorktreeInfo call.
3. getNextAction array return — `string | string[]` type change, caller handles both.

**Attention item:** The build also removes the resolves claims summary feature (~25 lines of production code + 120 lines of tests) that shipped in the previous cycle (`upstream-finding-resolution`). This is not in the spec or scope. If you want to keep this removal, acknowledge it. If not, the code should be restored before merge. The removal doesn't break anything — it removes an informational display line from `work complete` output.

The `createMergedProject` test helper was also updated to produce phase-numbered saves.json keys for multi-phase projects. This is a correct fix — the helper was producing unnumbered keys for multi-phase, which masked the bug being fixed. All existing tests pass with the corrected helper.

## Verdict
**Shippable:** YES
All 10 contract assertions satisfied. All 8 acceptance criteria pass. Tests green (2302 passed). The three scoped fixes are correct and well-tested. The unscoped resolves-claims removal is an observation, not a blocker — the deployer should decide whether to accept or revert that change.
