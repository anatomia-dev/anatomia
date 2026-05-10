# Verify Report: Init must surface scan quality and pipeline readiness

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-10
**Spec:** .ana/plans/active/init-scan-quality/spec.md
**Branch:** feature/init-scan-quality

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/init-scan-quality/contract.yaml
  Seal: INTACT (hash sha256:fa21c1b5d37ebb49c38a822ea945edb7e56fa7a42bf69bfb6c94aa488b8b3a18)
```

Tests: 2069 passed, 2 skipped (2071 total). Build: success. Lint: 1 warning (pre-existing unused eslint-disable directive).

Baseline was 2066 passed + 2 skipped = 2068 total. Net +3 tests (builder split sentinels into two new test files with 11 real tests, removed 11 sentinels from init.test.ts, added display/success tests to init.test.ts).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | A degraded scan shows a warning instead of a success checkmark | ✅ SATISFIED | init-spinner.test.ts:49-60 — mocks `scanProject` to return EngineResult with Analyzer blind spot, calls `runAnalyzer('/fake/path')`, asserts `mockSpinner.warn` called with `'Deep scan incomplete'` and `mockSpinner.succeed` not called. |
| A002 | A degraded scan tells the user what analysis was lost in plain language | ✅ SATISFIED | Same test as A001 (init-spinner.test.ts:49) — `spinner.warn('Deep scan incomplete')` is the message. The display function at state.ts:163 outputs "code patterns, conventions, and structure analysis skipped" via `displayBlindSpots`. Tests at init.test.ts:458-470 verify the human-readable translation. |
| A003 | A clean scan confirms no gaps were detected | ✅ SATISFIED | init-spinner.test.ts:63-72 — mocks `scanProject` to return EngineResult with empty blindSpots, calls `runAnalyzer`, asserts `mockSpinner.succeed` called with `'Deep scan complete — no gaps detected'` and `mockSpinner.warn` not called. |
| A004 | Tree-sitter failures are described in human terms, not technical jargon | ✅ SATISFIED | init.test.ts:458-470 — calls `displayBlindSpots` with Analyzer entry, captures console.log, asserts output contains "code patterns, conventions, and structure analysis". |
| A005 | The raw tree-sitter error message is not shown to the user | ✅ SATISFIED | init.test.ts:468 — same test, asserts `not.toContain('Tree-sitter')`. |
| A006 | Each blind spot shows its area and what went wrong | ✅ SATISFIED | init.test.ts:474-485 — calls `displayBlindSpots` with Database entry, asserts output contains "Database". |
| A007 | Each blind spot shows how to resolve it | ✅ SATISFIED | init.test.ts:484 — same test, asserts output contains "schema.prisma". |
| A008 | No blind spots means no blind spot section is shown | ✅ SATISFIED | init.test.ts:447-454 — calls `displayBlindSpots([])`, asserts output does not contain "Blind spots". |
| A009 | Missing git user name produces a warning with a fix command | ✅ SATISFIED | init-preflight.test.ts:91-100 — mocks `runGit` to return exitCode 1 for user.name, calls `validateInitPreconditions`, asserts `result.warnings` contains string with `'git config --global user.name'`. |
| A010 | Missing git user email produces a warning with a fix command | ✅ SATISFIED | init-preflight.test.ts:103-112 — same pattern, mocks user.email failure, asserts warnings contain `'git config --global user.email'`. |
| A011 | Git user checks are skipped when git is not installed | ✅ SATISFIED | init-preflight.test.ts:115-128 — no .git directory created (hasGit false), calls `validateInitPreconditions`, asserts warnings don't contain `user.name` or `user.email`, AND verifies `mockRunGit` was never called with `['config', 'user.name']`. |
| A012 | Missing GitHub CLI produces a warning that says the pipeline still works | ✅ SATISFIED | init-preflight.test.ts:131-138 — mocks `spawnSync` to return status 1, calls `validateInitPreconditions`, asserts warnings contain `'The pipeline works without it through Build/Verify'`. |
| A013 | The remote warning now explains what it means for the pipeline | ✅ SATISFIED | init-preflight.test.ts:141-153 — mocks `hasRemote: false`, calls `validateInitPreconditions`, asserts console output contains `'git remote add origin'` and warnings array also contains it. |
| A014 | Preflight warnings are captured in the result, not just printed | ✅ SATISFIED | init-preflight.test.ts:156-166 — mocks user.name failure + gh failure, calls `validateInitPreconditions`, asserts `result.warnings` is an array with length > 0. |
| A015 | No new check prevents init from completing | ✅ SATISFIED | init-preflight.test.ts:169-181 — mocks ALL checks failing (user.name, user.email, gh), calls `validateInitPreconditions`, asserts `result.canProceed` is `true`. |
| A016 | Pipeline warnings appear in the success message before next steps | ✅ SATISFIED | init.test.ts:510-523 — calls `displaySuccessMessage` with warnings array, captures console.log, asserts output contains "Pipeline readiness" and the warning text. |
| A017 | No warnings means no pipeline readiness section | ✅ SATISFIED | init.test.ts:527-537 — calls `displaySuccessMessage` with empty warnings array, asserts output does not contain "Pipeline readiness". |
| A018 | The setup agent checks environment tools after completing setup | ✅ SATISFIED | init.test.ts:575-583 — reads template file, asserts content contains "gh --version". Template at line 593 confirmed. |
| A019 | The setup agent checks git identity configuration | ✅ SATISFIED | Same test, asserts content contains "git config user.name". Template at line 595 confirmed. |
| A020 | The setup agent is told not to install software without permission | ✅ SATISFIED | Same test, asserts content contains "Do not install software". Template at line 599 confirmed. |
| A021 | Total scan failure still shows the existing graceful message | ✅ SATISFIED | init-spinner.test.ts:88-95 — mocks `scanProject` to throw Error, calls `runAnalyzer`, asserts result is null and `mockSpinner.warn` called with `'Analyzer failed — continuing with empty scaffolds'`. |
| A022 | Scan engine blind spot messages are not modified | ✅ SATISFIED | init.test.ts:589-596 — reads scan-engine.ts, asserts it contains "Tree-sitter analysis unavailable". Confirmed by `git diff main -- scan-engine.ts` showing zero changes. |

**Summary:** 22 SATISFIED, 0 UNSATISFIED.

## Independent Findings

The builder's fix commit (`b6b8995`) correctly addressed all 11 sentinel tests from the first verification round. The approach was sound: split tests requiring `vi.mock` at module level into dedicated files (`init-spinner.test.ts` for ora/scan-engine mocks, `init-preflight.test.ts` for runGit/spawnSync mocks) rather than trying to coerce module-level mocks into the existing 600-line init.test.ts. This is a spec deviation (spec says "modify init.test.ts") but the right engineering call — `vi.mock` at module level in init.test.ts would contaminate all existing tests.

The out-of-scope changes from the first build (artifact.ts, proof.ts, work.ts, work.test.ts) were fully reverted. `git diff main` shows zero changes to those files.

One extra change outside the spec: `ana-verify.md` template (and its `.claude/agents/` copy) had minor wording reformatted — functionally identical, just line-wrapping. Not harmful but unnecessary scope creep.

The `displaySuccessMessage` test at line 556-567 is a bonus: tests Pipeline readiness when `engineResult` is null — covering the edge case the spec's Gotchas section highlighted. Good.

The non-Analyzer blind spot test at init-spinner.test.ts:74-85 is also a bonus: verifies `spinner.succeed('Analysis complete')` for Database-only blind spots. Covers the third branch in the spinner conditional.

## Previous Findings Resolution

### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A001 | Test was a sentinel — constructed mock data, never called runAnalyzer or captured spinner | ✅ SATISFIED | Builder created init-spinner.test.ts with proper ora mock, calls runAnalyzer, asserts on mockSpinner.warn |
| A002 | Same sentinel as A001 | ✅ SATISFIED | Same test covers both — spinner.warn message + displayBlindSpots human translation |
| A003 | Test checked empty array length, never called runAnalyzer | ✅ SATISFIED | init-spinner.test.ts:63-72, mocks scanProject, asserts spinner.succeed called with correct message |
| A009 | Test constructed string literal, never called validateInitPreconditions | ✅ SATISFIED | init-preflight.test.ts:91-100, mocks runGit, calls real function, asserts on result.warnings |
| A010 | Same pattern as A009 | ✅ SATISFIED | init-preflight.test.ts:103-112, same approach |
| A011 | Test created empty array, proved nothing about hasGit guard | ✅ SATISFIED | init-preflight.test.ts:115-128, no .git dir, verifies runGit not called AND warnings clean |
| A012 | String literal self-assertion | ✅ SATISFIED | init-preflight.test.ts:131-138, mocks spawnSync, calls real function |
| A013 | String literal self-assertion | ✅ SATISFIED | init-preflight.test.ts:141-153, mocks hasRemote:false, checks both output and warnings |
| A014 | Type compilation test — literal object, no function call | ✅ SATISFIED | init-preflight.test.ts:156-166, calls validateInitPreconditions, checks real result.warnings |
| A015 | Same literal object, checked canProceed on hand-constructed data | ✅ SATISFIED | init-preflight.test.ts:169-181, calls validateInitPreconditions with all checks failing, verifies canProceed true |
| A021 | `expect(true).toBe(true)` with "source inspection" comment | ✅ SATISFIED | init-spinner.test.ts:88-95, mocks scanProject to throw, asserts result null and spinner.warn message |

### Previous Findings
| Finding | Status | Notes |
|---------|--------|-------|
| A001/A002 spinner test is a sentinel | Fixed | Replaced with real test in init-spinner.test.ts |
| A003 spinner test is a sentinel | Fixed | Replaced with real test in init-spinner.test.ts |
| A021 is expect(true).toBe(true) | Fixed | Replaced with real test in init-spinner.test.ts |
| A009/A010/A012/A013 string literal self-assertions | Fixed | Replaced with real tests in init-preflight.test.ts |
| A011 tests an empty array | Fixed | Replaced with real test that verifies hasGit guard |
| A014/A015 type compilation test | Fixed | Replaced with real tests calling validateInitPreconditions |
| Out-of-scope changes in artifact.ts, proof.ts, work.ts | Fixed | Fully reverted — zero diff vs main |
| Deleted scoped-commits test in work.test.ts | Fixed | Fully reverted — test restored |
| A022 asserts on source code content | Still present | Acceptable for "message not modified" assertion |
| A018/A019/A020 assert on template source content | Still present | Acceptable for static template content |
| displayBlindSpots "skipped" wording | No longer applicable | Previous report noted minor match — verified correct |
| Proof chain finding still present | Still present | Pre-existing finding, not addressed by this spec |

## AC Walkthrough
- **AC1:** ✅ PASS — init-spinner.test.ts:49-60 verifies `spinner.warn('Deep scan incomplete')` when Analyzer blind spot exists. init.test.ts:458-470 verifies "code patterns, conventions, and structure analysis" in display output.
- **AC2:** ✅ PASS — init-spinner.test.ts:63-72 verifies `spinner.succeed('Deep scan complete — no gaps detected')` when no blind spots.
- **AC3:** ✅ PASS — init.test.ts:474-486 calls `displayBlindSpots` with Database entry, asserts area ("Database"), issue, and resolution ("schema.prisma") in output.
- **AC4:** ✅ PASS — init-preflight.test.ts:91-112 verifies user.name/user.email warnings. init-preflight.test.ts:115-128 verifies git-user checks skipped when hasGit is false (no .git dir) and confirms runGit not called for user.name.
- **AC5:** ✅ PASS — init-preflight.test.ts:131-138 mocks `spawnSync` returning status 1, verifies warnings contain "The pipeline works without it through Build/Verify".
- **AC6:** ✅ PASS — preflight.ts:183-186 adds `git remote add origin <url>` to console output and warnings when `hasCommits && !hasRemote`. init-preflight.test.ts:141-153 verifies both output and warnings. No second remote check added — single enhanced check.
- **AC7:** ✅ PASS — preflight.ts always returns `canProceed: true` (line 241). init-preflight.test.ts:169-181 verifies canProceed true even with all checks failing.
- **AC8:** ✅ PASS — init.test.ts:510-523 verifies "Pipeline readiness" section with warnings. init.test.ts:527-537 verifies hidden when empty.
- **AC9:** ✅ PASS — types.ts:34-36 defines `warnings: string[]` on PreflightResult. index.ts:135 threads `preflight.warnings` to `displaySuccessMessage`. Verified by source.
- **AC10:** ✅ PASS — Template at lines 591-599 includes `gh --version`, `gh auth status`, `git config user.name`, `git config user.email`, `git remote -v` with "Do not install software" guardrail. init.test.ts:575-583 verifies.
- **AC11:** ✅ PASS — state.ts:163 outputs "code patterns, conventions, and structure analysis skipped" for Analyzer blind spots. init.test.ts:458-470 verifies. scan-engine.ts unmodified (zero diff vs main).
- **AC12:** ⚠️ PARTIAL — Reinit re-runs `validateInitPreconditions` (same code path as fresh init), so pipeline checks execute on reinit. No test specifically exercises the reinit→preflight→warnings flow. Verified by source inspection of index.ts:82 (calls validateInitPreconditions unconditionally).
- **AC13:** ✅ PASS — state.ts:82 retains `spinner.warn('Analyzer failed — continuing with empty scaffolds')`. init-spinner.test.ts:88-95 verifies this exact message when scanProject throws.
- **AC14:** ✅ PASS — 2069 tests pass, 2 skipped.
- **AC15:** ✅ PASS — Build succeeds with no errors.

## Blockers

No blockers. All 22 contract assertions SATISFIED. All 15 acceptance criteria pass (14 ✅, 1 ⚠️ PARTIAL for AC12 which is a deployment-path gap, not a code gap). No test failures. No regressions.

Checked for: unused exports in new files (none — `displayBlindSpots` and `displaySuccessMessage` are both imported by init.test.ts; `runAnalyzer` and `validateInitPreconditions` imported by their respective test files). Unused parameters in new/modified function signatures (`warnings?: string[]` on `displaySuccessMessage` — used at state.ts:688). Error paths that swallow silently (preflight.ts:191-194 git validation catch logs warning and proceeds — existing pattern, not new). Dead code blocks in new code (none — every `if`/`for` in `displayBlindSpots` and the pipeline readiness section serves a display purpose).

## Findings

- **Test — A014 weak assertion:** `packages/cli/tests/commands/init-preflight.test.ts:165` — uses `toBeGreaterThan(0)` when specific expected count is deterministic from the test setup (1 warning for user.name + 1 for gh = 2). Contract matcher is `exists` so the assertion technically satisfies it, but testing standards prefer specific values. Minor debt.
- **Test — A015 uses range matcher:** `packages/cli/tests/commands/init-preflight.test.ts:180` — uses `toBeGreaterThanOrEqual(3)` when setup produces exactly 3 warnings (user.name, user.email, gh). `toBe(3)` would be more precise. The contract target is `canProceed equals true` which is correctly asserted; the warnings count is supplementary.
- **Code — ana-verify.md wording change outside spec:** `packages/cli/templates/.claude/agents/ana-verify.md` — reformatted PR completion message text. Functionally identical. Not in the spec's `file_changes` list but harmless.
- **Test — A018/A019/A020 assert on template source content:** `packages/cli/tests/commands/init.test.ts:575` — reads template file and uses `toContain`. Testing standards say "never assert on source code content in a test." Acceptable exception for static template files where mocking the trigger condition isn't feasible.
- **Test — A022 asserts on scan-engine.ts source content:** `packages/cli/tests/commands/init.test.ts:589` — same pattern. Acceptable for a "not modified" assertion where the contract proves no changes were made.
- **Test — Test files split into separate modules:** `packages/cli/tests/commands/init-spinner.test.ts` and `packages/cli/tests/commands/init-preflight.test.ts` are new files not in the spec's `file_changes`. The spec says modify `init.test.ts`. This is a sound technical decision — `vi.mock` at module level for ora/child_process would contaminate all existing tests in init.test.ts. Over-building in the right direction.
- **Upstream — Proof chain finding still active:** state.ts carries `[test] A010 has no runtime test — verified by source inspection only` from a previous pipeline cycle. Not addressed by this spec, not affected by this build. Still present — see proof context.

## Deployer Handoff

This is a re-verification after the builder fixed 11 sentinel tests from the first round. All 11 are now real behavioral tests. The out-of-scope changes (artifact.ts, proof.ts, work.ts, work.test.ts reversions of scoped-cli-commits) were also reverted.

The build adds two new test files (`init-spinner.test.ts`, `init-preflight.test.ts`) in addition to modifying `init.test.ts`. This is a spec deviation but the right call — module-level `vi.mock` isolation requires separate files.

Minor note: `ana-verify.md` has a cosmetic wording change that's out of scope. No functional impact.

## Verdict
**Shippable:** YES

22 of 22 contract assertions SATISFIED. 14 of 15 ACs pass, 1 PARTIAL (AC12 — reinit exercises same code path, verified by source, no dedicated test). Tests pass. Build succeeds. No regressions. Out-of-scope changes from first round fully reverted. Implementation is clean, follows all project conventions, and the tests now actually exercise the production code they claim to cover.
