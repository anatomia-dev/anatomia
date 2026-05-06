# Verify Report: Non-Main Artifact Branch Tests

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-06
**Spec:** .ana/plans/active/non-main-artifact-branch-tests/spec.md
**Branch:** feature/non-main-artifact-branch-tests

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/non-main-artifact-branch-tests/contract.yaml
  Seal: INTACT (hash sha256:0254b0110eab2c97c1ec4cbd667104a2d9ba647f796b8f7f18a75060deb371b5)
```

Tests: 1920 passed, 1 failed (pre-existing), 2 skipped. Build: success. Lint: clean (1 pre-existing warning).

Pre-existing failure: `tests/utils/worktree.test.ts:125` — `detectWorktreeSlug('')` resolves to cwd, which is inside the worktree. Not introduced by this build.

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Work status detects correct stage when artifact branch is develop | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:2727`, asserts output contains `ready-for-plan` |
| A002 | Work status shows the develop branch name in output | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:2738`, asserts output contains `develop` |
| A003 | Work status detects build-in-progress with develop-based project | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:2741`, asserts output contains `build-in-progress` |
| A004 | Starting work succeeds when on the develop artifact branch | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3072`, asserts slugDir exists after startWork |
| A005 | Starting work fails when not on configured develop branch | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3082`, asserts process.exit(1) and error contains `develop` |
| A006 | Saving scope is allowed when on develop artifact branch | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:356`, asserts no throw with `artifactBranch: 'develop', currentBranch: 'develop'` |
| A007 | Saving build report rejected when on develop artifact branch | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:363`, asserts throw with `currentBranch: 'develop'` |
| A008 | Saving build report succeeds from feature branch when artifact branch is develop | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:370`, asserts no throw with `currentBranch: 'feature/test-slug'` |
| A009 | Completing work succeeds when artifact branch is develop | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:2758`, asserts directory moved to completed and feature branch deleted |
| A010 | Init display shows configured artifact branch instead of git default | ✅ SATISFIED | Source inspection: `packages/cli/src/commands/init/state.ts:634` now reads `anaConfig?.['artifactBranch'] as string ?? engineResult.git.defaultBranch ?? ...` — confirmed contains `anaConfig`. No tagged runtime test exists. |

## Independent Findings

All predictions investigated:

1. **Fallback chain precedence** — Tested with node REPL. `anaConfig?.['artifactBranch']` correctly returns `undefined` when anaConfig is undefined (falls through to git default), returns `undefined` when key is missing (falls through), and returns `'develop'` when set. The `as string` is compile-time only. No issue.

2. **completeWork branch references** — Reviewed lines 2759–2814. All git operations correctly use `develop` (branch -M, checkout, merge target). No accidental `main` references.

3. **saveArtifact direction** — A007 correctly tests the rejection case (on develop = rejected for build-report), A008 correctly tests the allow case (on feature branch). Mirrors existing test logic.

4. **Test substance** — Each test exercises real git operations via `createWorkTestProject`/`createStartTestProject`/`createTestProject` helpers with `artifactBranch: 'develop'`. The assertions are specific to the develop-branch behavior, not vacuous.

5. **A010 source assertion confirmed** — No runtime test for `displaySuccessMessage` with a non-main artifact branch exists. The contract uses a source-level target (`state.ts:634` contains `anaConfig`), which I verified by reading the file. This is satisfied per the contract's terms but leaves the runtime behavior untested.

No scope creep detected. The diff touches exactly the three files specified in the contract. No new exports, no unused code paths, no YAGNI violations.

## AC Walkthrough

- **AC1:** `startWork` works with `artifactBranch: 'develop'` — ✅ PASS — test at line 3072 passes, creates slug directory on develop branch.
- **AC2:** `getWorkStatus` correctly discovers slugs when artifact branch is `develop` — ✅ PASS — test at line 2727 passes, output contains `ready-for-plan`.
- **AC3:** `saveArtifact` for scope validates branch against `develop` — ✅ PASS — test at line 356 passes, allows save on develop.
- **AC4:** `saveArtifact` for build-report validates against `develop` (must NOT be on develop) — ✅ PASS — test at line 363 passes, rejects on develop; test at line 370 passes, allows on feature branch.
- **AC5:** `completeWork` validates against `develop` — ✅ PASS — test at line 2758 passes, moves to completed and cleans up feature branch.
- **AC6:** Init display at `state.ts:634` shows configured `artifactBranch` — ✅ PASS — source confirmed: line 634 reads from `anaConfig?.['artifactBranch']` with correct fallback chain.
- **AC7:** All existing tests pass (no regression) — ✅ PASS — 1920 passed, 1 pre-existing failure unrelated to this build.
- **AC8:** Build succeeds, typecheck clean, lint clean — ✅ PASS — build success, lint has 1 pre-existing warning only.

## Blockers

None. All 10 contract assertions satisfied. All 8 ACs pass. No regressions introduced. Checked for: unused exports in new code (none — tests only, no exports), unhandled error paths (startWork rejection fully tested), assumptions about external state (all tests create isolated git repos), sentinel tests that pass on broken code (each assertion is specific to the develop-branch path).

## Findings

- **Test — A010 has no runtime test:** `packages/cli/src/commands/init/state.ts:634` — The contract assertion verifies source content (`contains anaConfig`) rather than runtime output. This means a regression in `displaySuccessMessage` that produces wrong output but still contains the word `anaConfig` in source would not be caught. Low risk since the fix is a simple expression swap, but a runtime test calling `displaySuccessMessage` with `anaConfig: { artifactBranch: 'develop' }` and asserting console output contains `develop` would be more robust.

- **Test — completeWork fixture is manually constructed:** `packages/cli/tests/commands/work.test.ts:2759` — 55 lines of setup vs ~5 lines if a helper like `createMergedProject` existed. Matches the existing test at line 538 which also builds manually, so this is consistent with codebase patterns. Acceptable but contributes to test file size.

- **Upstream — A010 contract target is line-number-based:** Contract references `state.ts:634` — fragile if the file grows. The assertion is valid today but could silently become wrong if code is inserted above line 634. Future contracts should prefer function-level or output-level targets.

- **Test — Pre-existing worktree.test.ts failure:** `packages/cli/tests/utils/worktree.test.ts:125` — `detectWorktreeSlug('')` resolves to cwd via `path.resolve('')`. When running from within a worktree, cwd contains `.ana/worktrees/{slug}`, so it returns the slug instead of null. Not introduced by this build but worth fixing — the test makes an assumption about execution environment.

## Deployer Handoff

Straightforward test-and-fix build. 8 new tests added across 2 test files, 1 line changed in source. The source change fixes a display bug where `ana init` showed the git default branch instead of the configured `artifactBranch`. All existing tests continue to pass. The pre-existing `worktree.test.ts` failure is unrelated (environment-dependent test) and predates this branch.

## Verdict
**Shippable:** YES
All contract assertions satisfied. All acceptance criteria pass. No regressions. The implementation is minimal, correct, and follows established patterns. The findings are minor debt items — no blockers to shipping.
