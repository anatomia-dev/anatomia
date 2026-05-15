# Verify Report: Fix CI Matrix and Broken Tests

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-15
**Spec:** .ana/plans/active/fix-ci-matrix-and-broken-tests/spec.md
**Branch:** feature/fix-ci-matrix-and-broken-tests

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-ci-matrix-and-broken-tests/contract.yaml
  Seal: INTACT (hash sha256:cbf34eb02b669f616a874cb1982fd83bca501083a16699a79cf8af46fbc287d7)
```

Tests: 2297 passed, 2 skipped (104 test files). Build: success. Lint: 1 warning (pre-existing unused eslint-disable directive, not introduced by this build).

## Contract Compliance

| ID   | Says                                                                | Status        | Evidence |
|------|---------------------------------------------------------------------|---------------|----------|
| A001 | Claude PID resolution returns a valid process ID when the process tree is available | ✅ SATISFIED | `packages/cli/tests/commands/work-ci-mocked.test.ts:58` — mocks ps to return `12345\n`, asserts `pid === 12345` |
| A002 | Claude PID resolution returns null when the ps command fails | ✅ SATISFIED | `packages/cli/tests/commands/work-ci-mocked.test.ts:71` — mocks ps to return status 1, asserts `toBeNull()` |
| A003 | Claude PID resolution returns null when ps returns an invalid number | ✅ SATISFIED | `packages/cli/tests/commands/work-ci-mocked.test.ts:83` — mocks ps to return `0\n` (triggers `pid <= 0` guard at `work.ts:2180`), asserts `toBeNull()` |
| A004 | A rebase conflict during pull causes the process to exit with failure | ✅ SATISFIED | `packages/cli/tests/commands/work-ci-mocked.test.ts:211-212` — asserts `exitCalls[0]?.[0]` equals 1 |
| A005 | The conflict error message tells the user what went wrong | ✅ SATISFIED | `packages/cli/tests/commands/work-ci-mocked.test.ts:214` — asserts `output.toLowerCase()` contains `'conflict'` |
| A006 | The conflict error message tells the user how to recover | ✅ SATISFIED | `packages/cli/tests/commands/work-ci-mocked.test.ts:216` — asserts output contains `'Resolve conflicts and try again'` |
| A007 | CI runs on Ubuntu only, not Windows or macOS | ✅ SATISFIED | Source inspection: `.github/workflows/test.yml` — grep for `windows-latest` returns no matches |
| A008 | CI runs on Ubuntu only, not Windows or macOS | ✅ SATISFIED | Source inspection: `.github/workflows/test.yml` — grep for `macos-latest` returns no matches |
| A009 | CI tests against both Node 20 and Node 22 | ✅ SATISFIED | Source inspection: `.github/workflows/test.yml:23` — `node-version: [20, 22]` |
| A010 | CI tests against both Node 20 and Node 22 | ✅ SATISFIED | Source inspection: `.github/workflows/test.yml:23` — `node-version: [20, 22]` |
| A011 | The pnpm setup action is bumped to v6 before the June deadline | ✅ SATISFIED | Source inspection: `.github/workflows/test.yml` — grep for `pnpm/action-setup@v4` returns no matches; lines 32 and 84 use `@v6` |
| A012 | The pnpm setup action is bumped to v6 in the release workflow too | ✅ SATISFIED | Source inspection: `.github/workflows/release.yml:19` — `pnpm/action-setup@v6`; grep for `@v4` returns no matches |
| A013 | The staging branch is removed from CI triggers since it does not exist | ✅ SATISFIED | Source inspection: `.github/workflows/test.yml` — grep for `staging` returns no matches |
| A014 | Coverage upload no longer checks the OS since there is only one | ✅ SATISFIED | Source inspection: `.github/workflows/test.yml:66` — `if: matrix.node-version == 20`; grep for `matrix.os` returns no matches |
| A015 | No tests were lost during the extraction — the new file has the same number of tests that were removed | ✅ SATISFIED | `packages/cli/tests/commands/work-ci-mocked.test.ts` contains 4 `it()` blocks; `work.test.ts` diff shows 4 tests removed (3 getClaudePid + 1 conflict) |
| A016 | The new test file exists and runs successfully | ✅ SATISFIED | File exists at `packages/cli/tests/commands/work-ci-mocked.test.ts`; full test suite passes with 104 test files (was 103) |
| A017 | The deployment skill reflects the actual Ubuntu-only CI matrix | ✅ SATISFIED | Source inspection: `.claude/skills/deployment/SKILL.md:12` — "2 runners: Ubuntu x Node 20, 22"; grep for `windows` returns no matches |
| A018 | The deployment skill no longer warns about Windows path separators | ✅ SATISFIED | Source inspection: `.claude/skills/deployment/SKILL.md` — grep for `Windows` returns no matches; gotchas section is empty |
| A019 | ARCHITECTURE.md reflects the actual CI matrix | ✅ SATISFIED | Source inspection: `packages/cli/ARCHITECTURE.md:225` — "Ubuntu x Node 20/22"; grep for `macOS` and `Windows` returns no matches |
| A020 | CONTRIBUTING.md reflects the actual CI matrix | ✅ SATISFIED | Source inspection: `packages/cli/CONTRIBUTING.md` — grep for `macOS` and `Windows` returns no matches |

## Independent Findings

The build is clean and well-scoped. Predictions resolved below, followed by discoveries.

**Prediction: The mock routing is too broad (partially confirmed).** Line 188 of `work-ci-mocked.test.ts` uses `Array.from(args).includes('pull')` to intercept git commands. This matches any git command with `'pull'` anywhere in its args, not specifically `git pull --rebase`. In practice, `completeWork` only calls `git pull --rebase`, so this works correctly. But the `work-merge.test.ts` pattern checks for a specific top-level command (`'gh'`), which is tighter. This is a cosmetic difference — not a correctness issue.

**Prediction: createMergedProject helper copy-pasted without remote (not confirmed).** The builder correctly added `git remote add origin https://example.com/fake.git` at line 179, exactly as the spec required. The spec's critical gotcha about `completeWork` checking `runGit(['remote']).stdout` was addressed.

**Prediction: Deployment skill has remnant Windows references (not confirmed).** The Windows path separator gotcha was fully removed. The skill now reads cleanly with "2 runners: Ubuntu x Node 20, 22."

**Surprise: None.** The build is straightforward and follows the spec precisely. All 7 files changed as specified, no more, no less.

**Over-building check:** No unused exports, no extra parameters, no dead code paths. The new file exports nothing. `createMergedProject` is scoped to the describe block. No YAGNI concerns.

**Proof chain resolution:** Three active findings are directly addressed by this build:
- "Conditional PID guard makes 8 tests potential no-ops" — resolved. Mocked tests are deterministic.
- "Conflict test creates bareDir and cloneDir as siblings of tempDir" — resolved. Mocked version creates no temp directories outside tempDir.
- "staging branch in trigger list is a no-op" — resolved. Staging removed from test.yml.

## AC Walkthrough

- **AC1:** ✅ PASS — All 2297 tests pass locally. The 4 extracted tests use mocked `spawnSync` — deterministic regardless of CI runner process namespace.
- **AC2:** ✅ PASS — `test.yml` matrix is `node-version: [20, 22]` only, `runs-on: ubuntu-latest`. No `windows-latest` or `macos-latest` anywhere in the file.
- **AC3:** ✅ PASS — `pnpm/action-setup@v6` at `test.yml:32` (test job), `test.yml:84` (website job), and `release.yml:19`. All three locations bumped.
- **AC4:** ⚠️ PARTIAL — The job name template at `test.yml:17` renders as `Test (ubuntu-latest, Node 20)` and `Test (ubuntu-latest, Node 22)`. Branch protection must be updated manually by the developer using the `gh api` command documented in the spec. Cannot verify this was done — it's a manual step.
- **AC5:** ✅ PASS — No `staging` in `test.yml`. Both `push.branches` and `pull_request.branches` are `[main]` only.
- **AC6:** ✅ PASS — Coverage upload condition at `test.yml:66` is `if: matrix.node-version == 20`. No `matrix.os` reference.
- **AC7:** ✅ PASS — 4 tests removed from `work.test.ts`, 4 tests added to `work-ci-mocked.test.ts`. Total: 2297 passed, 2 skipped across 104 test files (was 103).
- **AC8:** ✅ PASS — Deployment skill updated (line 12: "2 runners: Ubuntu x Node 20, 22", Windows gotcha removed). `ARCHITECTURE.md:225`: "Ubuntu x Node 20/22". `CONTRIBUTING.md`: no macOS/Windows references.
- **Tests pass:** ✅ PASS — `pnpm vitest run`: 2297 passed, 2 skipped.
- **No build errors:** ✅ PASS — `pnpm --filter anatomia-cli build`: ESM build success in 30ms.

## Blockers

No blockers. All 20 contract assertions satisfied. All testable ACs pass. No regressions — test count maintained at 2297 passed, 2 skipped, file count increased from 103 to 104 as expected. Checked for: unused exports in new file (none — file exports nothing), sentinel test patterns (assertions are specific: `toBe(12345)`, `toBeNull()`, `toBe(1)`, `toContain('conflict')`, `toContain('Resolve conflicts and try again')`), error paths that swallow silently (the mocked tests properly exercise the null-return and exit-code-1 paths), dead code in new file (every block serves a purpose).

## Findings

- **Test — Broad mock intercept for git pull:** `packages/cli/tests/commands/work-ci-mocked.test.ts:188` — `Array.from(args).includes('pull')` matches any git command with 'pull' in args, not specifically `git pull --rebase`. Works because `completeWork` only calls `git pull --rebase`, but is looser than the `work-merge.test.ts` pattern which checks the top-level command name. Not a correctness issue — cosmetic.

- **Test — Duplicated createMergedProject helper:** `packages/cli/tests/commands/work-ci-mocked.test.ts:125` — `createMergedProject` is copy-pasted from `work.test.ts` with modifications (uses `realExecSync` instead of `execSync`, adds remote). Both files now maintain independent copies. This is a natural consequence of module-level `vi.mock` separation — the helper can't be shared across files with different mock boundaries. Worth knowing for future maintainers.

- **Test — Exit call count assertion uses toBeGreaterThan(0):** `packages/cli/tests/commands/work-ci-mocked.test.ts:211` — `expect(exitCalls.length).toBeGreaterThan(0)` passes even if `process.exit` is called multiple times. `toBe(1)` would be tighter. However, the next line `expect(exitCalls[0]?.[0]).toBe(1)` pins the exit code, so the overall assertion is still meaningful.

- **Upstream — Stale finding: Conditional PID guard makes 8 tests potential no-ops:** Resolved by this build. The 3 `getClaudePid` tests now use deterministic mocks — no conditional guards, no environment-dependent behavior.

- **Upstream — Stale finding: Conflict test leaks bareDir and cloneDir:** Resolved by this build. The mocked conflict test creates no directories outside `tempDir`.

- **Upstream — Stale finding: staging branch in trigger list is a no-op:** Resolved by this build. `staging` removed from `test.yml` branch triggers.

## Deployer Handoff

1. **Branch protection update required before or after merge.** The CI job names changed from whatever they were to `Test (ubuntu-latest, Node 20)` and `Test (ubuntu-latest, Node 22)`. Run the `gh api` command from the spec to update required status checks. If you merge first, PRs won't be mergeable until you update branch protection to match the new check names.

2. **pnpm/action-setup@v6** is a version bump. It reads `packageManager` from `package.json` the same way v4 did. The project already has `"pnpm@9.0.0"` in `packageManager`. No behavior change expected, but monitor the first CI run post-merge.

3. **Three proof chain findings are resolved** by this build (PID guard no-ops, conflict test directory leak, staging branch no-op). These can be closed after merge.

## Verdict
**Shippable:** YES

20/20 contract assertions satisfied. 9/10 ACs pass, 1 partial (AC4 — manual branch protection update, by design). Tests green, build clean, lint clean. The build is well-scoped — exactly the 7 files specified, no over-building, no dead code. The extracted tests are deterministic and follow the established `work-merge.test.ts` mock pattern. Three known proof chain issues are resolved by this change.
