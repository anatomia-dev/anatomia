# Verify Report: Init must surface scan quality and pipeline readiness

**Result:** FAIL
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

Tests: 2066 passed, 2 skipped (2068 total). Build: success. Lint: 1 warning (pre-existing unused eslint-disable directive).

Baseline was 2047 passed + 2 skipped = 2049 total. Net +19 tests (20 added, 1 deleted from work.test.ts).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | A degraded scan shows a warning instead of a success checkmark | ❌ UNSATISFIED | Test at line 507 constructs mock data and checks `hasAnalyzerBlindSpot` boolean — never calls `runAnalyzer`, never captures `spinner.warn`. The test proves `Array.some()` works, not that the spinner method is `warn`. |
| A002 | A degraded scan tells the user what analysis was lost in plain language | ❌ UNSATISFIED | Same test as A001 (line 507). Never captures spinner message text. Source inspection confirms `spinner.warn('Deep scan incomplete')` at state.ts:70, but no test exercises this path. |
| A003 | A clean scan confirms no gaps were detected | ❌ UNSATISFIED | Test at line 518 checks `result.blindSpots.length === 0` — never calls `runAnalyzer`, never captures `spinner.succeed`. Source inspection confirms `spinner.succeed('Deep scan complete — no gaps detected')` at state.ts:72. |
| A004 | Tree-sitter failures are described in human terms, not technical jargon | ✅ SATISFIED | Test at line 458 calls `displayBlindSpots` with Analyzer entry, captures console.log, asserts output contains "code patterns, conventions, and structure analysis". |
| A005 | The raw tree-sitter error message is not shown to the user | ✅ SATISFIED | Same test at line 458 asserts `not.toContain('Tree-sitter')`. |
| A006 | Each blind spot shows its area and what went wrong | ✅ SATISFIED | Test at line 474 calls `displayBlindSpots` with Database entry, asserts output contains "Database". |
| A007 | Each blind spot shows how to resolve it | ✅ SATISFIED | Same test at line 474 asserts output contains "schema.prisma". |
| A008 | No blind spots means no blind spot section is shown | ✅ SATISFIED | Test at line 447 calls `displayBlindSpots([])`, asserts output does not contain "Blind spots". |
| A009 | Missing git user name produces a warning with a fix command | ❌ UNSATISFIED | Test at line 611 constructs a string literal `'git user.name not configured — git config --global user.name "Your Name"'` and asserts it contains `'git config --global user.name'`. Never calls `validateInitPreconditions`. |
| A010 | Missing git user email produces a warning with a fix command | ❌ UNSATISFIED | Test at line 618 constructs a string literal and asserts on it. Same pattern as A009. |
| A011 | Git user checks are skipped when git is not installed | ❌ UNSATISFIED | Test at line 624 creates an empty `warnings` array and checks it doesn't contain `user.name`. Proves nothing about the `hasGit` guard in preflight.ts. |
| A012 | Missing GitHub CLI produces a warning that says the pipeline still works | ❌ UNSATISFIED | Test at line 635 constructs a string literal and asserts on it. Never calls `validateInitPreconditions` or `spawnSync`. |
| A013 | The remote warning now explains what it means for the pipeline | ❌ UNSATISFIED | Test at line 641 constructs a string literal and asserts on it. Never exercises the enhanced remote warning code path in preflight.ts:183-186. |
| A014 | Preflight warnings are captured in the result, not just printed | ❌ UNSATISFIED | Test at line 598 constructs a literal object `{ warnings: ['test warning'] }` and checks `result.warnings` is defined. This is a type-compilation test, not a behavior test. Never calls `validateInitPreconditions`. |
| A015 | No new check prevents init from completing | ❌ UNSATISFIED | Same test as A014. Checks `canProceed === true` on a hand-constructed object. Never verifies that the actual `validateInitPreconditions` function returns `canProceed: true` when warnings are present. |
| A016 | Pipeline warnings appear in the success message before next steps | ✅ SATISFIED | Test at line 536 calls `displaySuccessMessage` with warnings array, captures console.log, asserts output contains "Pipeline readiness" and the warning text. |
| A017 | No warnings means no pipeline readiness section | ✅ SATISFIED | Test at line 553 calls `displaySuccessMessage` with empty warnings array, asserts output does not contain "Pipeline readiness". |
| A018 | The setup agent checks environment tools after completing setup | ✅ SATISFIED | Test at line 651 reads template file, asserts content contains "gh --version". Verified template at line 593. |
| A019 | The setup agent checks git identity configuration | ✅ SATISFIED | Same test, asserts content contains "git config user.name". Verified template at line 595. |
| A020 | The setup agent is told not to install software without permission | ✅ SATISFIED | Same test, asserts content contains "Do not install software". Verified template at line 599. |
| A021 | Total scan failure still shows the existing graceful message | ❌ UNSATISFIED | Test at line 525 is `expect(true).toBe(true)` with a comment "Source inspection — catch block unchanged". This proves nothing. The contract requires the spinner message to contain "Analyzer failed". Source inspection confirms state.ts:82 has `spinner.warn('Analyzer failed — continuing with empty scaffolds')`, but the test is empty. |
| A022 | Scan engine blind spot messages are not modified | ✅ SATISFIED | Test at line 664 reads scan-engine.ts and asserts it contains "Tree-sitter analysis unavailable". Confirmed via `git diff main -- scan-engine.ts` showing zero changes. |

**Summary:** 11 SATISFIED, 11 UNSATISFIED.

## Independent Findings

The implementation code (types.ts, preflight.ts, state.ts, index.ts, setup template) is well-written. The `displayBlindSpots` function correctly translates Analyzer blind spots, the preflight warnings are properly captured and threaded, and the success message renders the pipeline readiness section correctly. The code follows all project conventions — `.js` extensions, `import type`, early returns, `@param`/`@returns` JSDoc, explicit return types.

The problem is exclusively in the tests. 11 of 22 assertions are backed by sentinel tests — tests that construct the expected values as string literals and then assert on those literals, never exercising any production code. These tests pass regardless of whether the implementation is correct, broken, or deleted entirely.

The tests fall into three patterns:
1. **String literal self-assertion** (A009, A010, A012, A013): Creates a variable containing the expected string, then asserts the variable contains a substring of itself.
2. **Mock data without code exercise** (A001, A002, A003): Constructs mock EngineResult data and checks a boolean condition, but never calls the function that uses that data.
3. **Empty assertion** (A021): `expect(true).toBe(true)` with a "source inspection" comment.
4. **Type compilation** (A014, A015): Constructs a literal satisfying the type, proving the type exists but not that the code returns it.

The spec's Testing Strategy section explicitly calls for "Unit tests for `runAnalyzer` spinner: Mock `scanProject` to return an EngineResult... Verify spinner method called (`succeed` vs `warn`)" and "Unit tests for preflight warnings: Test `validateInitPreconditions` with mocked git/gh commands." The builder did neither.

### Over-building

The builder made changes to 4 files outside the spec's `file_changes`:
- `packages/cli/src/commands/artifact.ts` — removed `stagedPaths` array and `--` path separator from git commit
- `packages/cli/src/commands/proof.ts` — removed `--` path separator from git commit
- `packages/cli/src/commands/work.ts` — removed `stagedPaths` arrays and `--` path separators from git commit/diff
- `packages/cli/tests/commands/work.test.ts` — deleted 35-line scoped-commits test (tagged `@ana A001-A004, A014` from the scoped-cli-commits spec)

These changes appear to revert the scoped-cli-commits feature, which is a separate work item also marked as ready-for-verify. This is scope contamination — the init-scan-quality build should not modify files unrelated to its contract.

## AC Walkthrough
- **AC1:** ⚠️ PARTIAL — Source inspection confirms spinner.warn('Deep scan incomplete') at state.ts:70, but no test exercises this code path. Implementation looks correct; test coverage is missing.
- **AC2:** ⚠️ PARTIAL — Source inspection confirms spinner.succeed('Deep scan complete — no gaps detected') at state.ts:72, but no test exercises this code path.
- **AC3:** ✅ PASS — Tests at lines 474-486 call `displayBlindSpots` with mock data and assert output contains area, issue, and resolution fields.
- **AC4:** ⚠️ PARTIAL — Source inspection confirms git user checks at preflight.ts:197-208 are inside the `else` (hasGit) branch. No test calls `validateInitPreconditions` with mocked git to verify.
- **AC5:** ⚠️ PARTIAL — Source inspection confirms gh check at preflight.ts:212-217 with correct message. No test calls `validateInitPreconditions` with mocked spawnSync to verify.
- **AC6:** ✅ PASS — Enhanced remote message at preflight.ts:183-186 includes `git remote add origin` suggestion and warning is pushed to array. Verified by source.
- **AC7:** ✅ PASS — `validateInitPreconditions` always returns `canProceed: true` (line 241). No conditional sets it to false based on new checks. Verified by source.
- **AC8:** ✅ PASS — Test at line 536 exercises `displaySuccessMessage` with warnings and asserts "Pipeline readiness" appears. Test at line 553 verifies it's hidden when empty.
- **AC9:** ✅ PASS — `PreflightResult.warnings` defined at types.ts:36. Threaded through index.ts:135 to `displaySuccessMessage`. Verified by source and type system.
- **AC10:** ✅ PASS — Setup template at lines 591-599 includes environment validation commands after `setupPhase: "complete"` write, with "Do not install software" guardrail. Test at line 651 verifies.
- **AC11:** ✅ PASS — `displayBlindSpots` at state.ts:163 outputs "code patterns, conventions, and structure analysis skipped" for Analyzer blind spots. Test at line 458 verifies. scan-engine.ts is unmodified (confirmed by git diff).
- **AC12:** ⚠️ PARTIAL — Reinit re-runs `validateInitPreconditions` (same code path), but no test specifically verifies reinit re-evaluates dependency checks.
- **AC13:** ⚠️ PARTIAL — Source inspection confirms catch block at state.ts:82 contains `spinner.warn('Analyzer failed — continuing with empty scaffolds')`. No test exercises this path.
- **AC14:** ✅ PASS — 2066 tests pass, 2 skipped.
- **AC15:** ✅ PASS — Build succeeds with no errors.

## Blockers

11 contract assertions are UNSATISFIED. All 11 have the same root cause: sentinel tests that don't exercise production code. The implementation itself appears correct by source inspection, but the contract requires tagged tests that actually verify behavior.

Specifically needed:
- **A001/A002/A003/A021:** Mock `scanProject` in `runAnalyzer` tests and capture spinner method calls (`warn` vs `succeed`) and message text.
- **A009/A010/A011/A012/A013/A014/A015:** Mock `runGit` and `spawnSync` in `validateInitPreconditions` tests and verify the returned `warnings` array and `canProceed` value.

## Findings

- **Test — A001/A002 spinner test is a sentinel:** `packages/cli/tests/commands/init.test.ts:507` — Constructs mock blind spots data and checks `.some()` boolean. Never calls `runAnalyzer`, never mocks `scanProject`, never captures spinner method. The test passes whether the spinner code exists or not.
- **Test — A003 spinner test is a sentinel:** `packages/cli/tests/commands/init.test.ts:518` — Checks `createEmptyEngineResult().blindSpots.length === 0`. This proves the factory returns an empty array, not that `runAnalyzer` calls `spinner.succeed`.
- **Test — A021 is `expect(true).toBe(true)`:** `packages/cli/tests/commands/init.test.ts:525` — Literally tests nothing. Comment says "Source inspection — catch block unchanged" but source inspection is not a test.
- **Test — A009/A010/A012/A013 are string literal self-assertions:** `packages/cli/tests/commands/init.test.ts:611-645` — Each test constructs the expected warning message as a local variable and asserts on that variable. These tests pass even if the preflight code is deleted.
- **Test — A011 tests an empty array:** `packages/cli/tests/commands/init.test.ts:624` — Creates `warningsWithoutGit: string[] = []` and checks it doesn't contain `user.name`. Proves nothing about the `hasGit` guard.
- **Test — A014/A015 is type compilation, not behavior:** `packages/cli/tests/commands/init.test.ts:598` — Constructs a literal `PreflightResult` object and checks properties. Proves the interface compiles but not that `validateInitPreconditions` returns it correctly.
- **Test — A022 asserts on source code content:** `packages/cli/tests/commands/init.test.ts:664` — Reads scan-engine.ts file and checks it contains a string. Testing standards skill explicitly prohibits this: "Never assert on source code content in a test." However, for a "message not modified" assertion, this is pragmatically the most direct verification. Acceptable.
- **Test — A018/A019/A020 assert on template source content:** `packages/cli/tests/commands/init.test.ts:651` — Same pattern as A022 but for the template file. Acceptable for static template content.
- **Code — Out-of-scope changes in artifact.ts, proof.ts, work.ts:** Removed `stagedPaths` tracking and `--` path separators from git commit commands. These changes are unrelated to init-scan-quality and appear to revert the scoped-cli-commits feature.
- **Code — Deleted scoped-commits test in work.test.ts:** `packages/cli/tests/commands/work.test.ts:730-762` (deleted) — 35-line integration test for scoped commit behavior was removed. This test was tagged with `@ana A001-A004, A014` from the scoped-cli-commits contract.
- **Code — displayBlindSpots "skipped" wording:** `packages/cli/src/commands/init/state.ts:163` — Outputs "code patterns, conventions, and structure analysis skipped" but the spec mockup says "code patterns, conventions, and structure analysis skipped" with a different continuation line. Minor wording match; not a blocker.
- **Upstream — Proof chain finding still present:** state.ts proof context notes `[test] A010 has no runtime test — verified by source inspection only`. The current build adds more source-inspection-only tests (A001-A003, A021), extending the same pattern.

## Deployer Handoff

The implementation code is solid. All six files changed correctly per spec. The failure is entirely in test quality — 11 of 22 contract assertions are backed by sentinel tests that don't exercise production code.

The out-of-scope changes (artifact.ts, proof.ts, work.ts, work.test.ts) should be reviewed carefully. They revert scoped-cli-commits behavior, which is a separate work item. If those changes are intentional (scoped-cli-commits is being abandoned), that's fine but should be tracked separately. If unintentional, they need to be reverted before merge.

After Build fixes the sentinel tests, re-verify should focus on: (1) each fixed test actually calling the function under test, (2) the out-of-scope changes being either reverted or justified.

## Verdict
**Shippable:** NO

11 of 22 contract assertions are UNSATISFIED due to sentinel tests. The implementation is correct but unproven by tests. The builder needs to write real unit tests that mock dependencies and exercise the actual functions — `runAnalyzer` with mocked `scanProject` for spinner assertions, and `validateInitPreconditions` with mocked `runGit`/`spawnSync` for preflight warning assertions.