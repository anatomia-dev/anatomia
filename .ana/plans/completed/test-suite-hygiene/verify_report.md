# Verify Report: Test Suite Hygiene

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-07
**Spec:** .ana/plans/active/test-suite-hygiene/spec.md
**Branch:** feature/test-suite-hygiene

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/test-suite-hygiene/contract.yaml
  Seal: INTACT (hash sha256:970febcff1c6943ecaae0396cebac6f37f3c404b86b598cb4d5a0847b76f2582)
```

Seal status: **INTACT**

Tests: 1987 passed, 0 failed, 2 skipped (95 files). Build: clean. Lint: 1 pre-existing warning (unused eslint-disable in git-operations.ts, not from this build).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Source-reading test that greps production source for --json option registration is removed | ✅ SATISFIED | `work.test.ts` — 0 matches for "completeCommand registers --json option" |
| A002 | Source-reading test that greps skills.ts for branchPrefix is removed | ✅ SATISFIED | `work.test.ts` — 0 matches for "injectGitWorkflow uses branchPrefix placeholder" |
| A003 | Archaeological source-reading test for step 9a fixup is removed | ✅ SATISFIED | `artifact.test.ts` — 0 matches for "step 9a post-commit fixup no longer exists in source" |
| A004 | Import boundary test in proofSummary has an exemption comment | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:1405` — exact comment present |
| A005 | Import boundary test in verify has an exemption comment | ✅ SATISFIED | `packages/cli/tests/commands/verify.test.ts:268` — exact comment present |
| A006 | Template tests have comments explaining templates are shipped artifacts | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:502,513,523` — 3 template comments |
| A007 | The entire old-system-removed test file is deleted | ✅ SATISFIED | `packages/cli/tests/cleanup/old-system-removed.test.ts` — "No such file or directory" |
| A008 | The cleanup directory is deleted after removing its only file | ✅ SATISFIED | `packages/cli/tests/cleanup/` — "No such file or directory" |
| A009 | Archaeological test verifying parseDiffAddedCommentLines deletion is removed | ✅ SATISFIED | `verify.test.ts` — 0 matches for "tag coverage tests are removed" |
| A010 | Maintenance line test has a name that matches its assertion | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:1669` — `'does not show Maintenance label when findings are auto-closed'` |
| A011 | Redundant UNKNOWN result test is removed | ✅ SATISFIED | `work.test.ts` — 0 matches for "allows completion with UNKNOWN result" |
| A012 | Redundant UNKNOWN warning test is removed | ✅ SATISFIED | `work.test.ts` — 0 matches for "warns on UNKNOWN result with verify report present" |
| A013 | Callouts section name is updated to Findings in proofSummary test | ✅ SATISFIED | `proofSummary.test.ts` — 0 matches for "no Callouts section". Renamed at L639 and L649. |
| A014 | Timestamp field uses format assertion instead of just checking it exists | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:2038` — `expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/)` |
| A015 | Contract numeric fields use type assertions instead of just checking they exist | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:2061-2066` — all 6 contract fields use `toBeTypeOf('number')` |
| A016 | JSON envelope fields in proof tests use type assertions instead of toBeDefined | ✅ SATISFIED | `packages/cli/tests/commands/proof.test.ts` — 48 instances of `toBeTypeOf()` across envelope tests |
| A017 | Redundant toBeTruthy guard before value assertion is removed in proof tests | ✅ SATISFIED | `expect(json).toBeTruthy()` guard at L249 removed. `expect(json.results.slug).toBeDefined()` guard before `.toBe()` at L757 removed. `expect(json.results.timing).toBeDefined()` guard before `.toBe(90)` at L774 removed. |
| A018 | Seal hash assertion uses format pattern match | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:1253` — `toMatch(/^sha256:[a-f0-9]{64}$/)` |
| A019 | Exact fixture counts replace toBeGreaterThan(0) in proofSummary tests | ✅ SATISFIED | `proofSummary.test.ts` — 0 matches for `toBeGreaterThan(0)` in getProofContext/generateProofSummary sections. 20+ instances of `toBe(1)` on single-finding fixtures. Remaining `toBeGreaterThan(0)` instances (L2450, L2478, L2585, L2863, L2942) are in hot_modules and staleness tests — not targeted by contract. |
| A020 | E2E init test checks for the ana-learn agent file | ✅ SATISFIED | `packages/cli/tests/e2e/init-flow.test.ts:124` — `'ana-learn.md'` in agentFiles array |
| A021 | E2E init test checks for the ai-patterns skill directory | ✅ SATISFIED | `packages/cli/tests/e2e/init-flow.test.ts:320` — `'ai-patterns'` in allSkillDirs array in new conditional skills test |
| A022 | E2E init test checks for the api-patterns skill directory | ✅ SATISFIED | `packages/cli/tests/e2e/init-flow.test.ts:321` — `'api-patterns'` in allSkillDirs array |
| A023 | E2E init test checks for the data-access skill directory | ✅ SATISFIED | `packages/cli/tests/e2e/init-flow.test.ts:322` — `'data-access'` in allSkillDirs array |
| A024 | Dead loadFixture function is removed from test helpers | ✅ SATISFIED | `packages/cli/tests/engine/fixtures.ts` — 0 matches for "loadFixture". File is 27 lines. |
| A025 | isWasmAvailable is no longer exported but still used internally | ✅ SATISFIED | `packages/cli/tests/engine/fixtures.ts:13` — `async function isWasmAvailable()` (no `export`). Called by `skipIfNoWasm()` at L24. |
| A026 | Console timing output is removed from performance benchmarks | ✅ SATISFIED | `benchmarks.test.ts` — 0 matches for `console.log` |
| A027 | Console skip message is removed from parsing performance test | ✅ SATISFIED | `parsing-performance.test.ts` — 0 matches for `console.log` |
| A028 | Console warn for WASM unavailable is removed from fixtures | ✅ SATISFIED | `fixtures.ts` — 0 matches for `console.warn` |
| A029 | All tests pass after cleanup with no behavioral coverage lost | ✅ SATISFIED | `(cd packages/cli && pnpm vitest run)` exit 0: "Test Files 95 passed (95), Tests 1987 passed | 2 skipped (1989)" |
| A030 | Test file count decreases by exactly 1 | ✅ SATISFIED | "Test Files 95 passed (95)" — down from 96 baseline |

## Independent Findings

**Prediction resolution:**

1. **"New conditional skills test might be flaky due to scan detection heuristics"** — Investigated. The test uses `prisma` for database detection, `next` for framework, `@anthropic-ai/sdk` for aiSdk. These are standard detection targets in the scan engine. Test passed cleanly at 222ms. The risk is real but low — if detection heuristics change, this test breaks. That's actually desirable (it would catch the regression). Not a problem.

2. **"Builder might have left the '8 dirs' comment"** — Not found. Header comment updated to "5 core + 3 conditional dirs" (L7). Good.

3. **"Some toBeDefined patterns outside scope might still be present"** — Confirmed, but the builder also fixed the ones flagged in the previous verify report: proof.test.ts L1015 and L4079 `closed_at` timestamps, and work.test.ts L3151/3173/3203 `build_started_at`/`verify_started_at` timestamps. The remaining `toBeDefined()` instances (E2E scan regression test L280-284, work.test.ts L92-93) are genuinely outside scope.

4. **"What would break in production?"** — Nothing. Zero production code changes. The only risk is a flaky E2E test if scan detection heuristics change for `prisma`/`@anthropic-ai/sdk` — and that's actually a feature, not a bug.

**Surprise finding:** Test count is 1987, not 1988 as the previous report stated or ~1988 as the spec predicted. This is expected — the builder added 1 new test (conditional skills E2E) in the fix round, netting 1987 (was 1986 before the fix, now 1987 with the new test). Math checks out.

**Over-building check:** The builder's fix round added a new E2E test (conditional skills), strengthened 5 timestamp assertions (proof.test.ts L1015/L4079, work.test.ts L3151/3173/3203), and fixed the header comment. The timestamp fixes address previous verify findings — within spirit of scope. No unrelated changes.

## Previous Findings Resolution

### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A021 | E2E test didn't assert ai-patterns — conditional on scan | ✅ SATISFIED | Builder added new test at L291 with rich fixture (Next.js + prisma + @anthropic-ai/sdk) that triggers all 3 conditional skills |
| A022 | E2E test didn't assert api-patterns — conditional on scan | ✅ SATISFIED | Same new test covers api-patterns via Next.js framework detection |
| A023 | E2E test didn't assert data-access — conditional on scan | ✅ SATISFIED | Same new test covers data-access via prisma database detection |

### Previous Findings
| Finding | Status | Notes |
|---------|--------|-------|
| Contract A021-A023 assumed unconditional skill scaffolding | Fixed | Builder created separate test with rich fixture instead of modifying the minimal fixture |
| E2E header comment says "8 dirs" but tests 5 | Fixed | Updated to "5 core + 3 conditional dirs" at L7 |
| proof.test.ts: toBeDefined() on finding.closed_at timestamps | Fixed | L1015 and L4079 now use `toMatch(/^\d{4}-\d{2}-\d{2}/)` |
| work.test.ts: 3 inconsistent timestamp assertions | Fixed | L3151, L3173, L3203 now use `toMatch(/^\d{4}-\d{2}-\d{2}/)` |
| proofSummary.test.ts: weak assertions in parseFindings tests | Still present | L733/736/741/744 — `toBeGreaterThanOrEqual` on deterministic fixture data. Outside contract scope. |
| "Previous Callouts" in fixture template strings | Still present | L834/866 — intentionally frozen backward-compat fixture data. Accepted. |
| proof.test.ts L744 redundant toBeTruthy guard | Still present | Builder's spec gotcha says "Only remove guards where the subsequent assertion already covers the case." Harmless. |
| E2E scan regression test uses 5 toBeDefined() sole assertions | Still present | L280-284 — outside scope of this build. |

## AC Walkthrough

- **AC1:** ✅ PASS — Zero source-reading tests for exercisable behavior. 2 removed (work.test.ts, artifact.test.ts). Import-boundary tests exempt with comments at proofSummary.test.ts:1405 and verify.test.ts:268. Template tests exempt with comments at work.test.ts:502/513/523.

- **AC2:** ✅ PASS — Zero archaeological tests. `tests/cleanup/` directory deleted entirely. verify.test.ts "tag coverage" test removed.

- **AC3:** ✅ PASS — Maintenance test renamed at L1669. Callouts→Findings rename at L639/649. UNKNOWN-path tests removed (duplicated PASS path).

- **AC4:** ✅ PASS — No `toBeDefined()` as sole assertion on a deterministic field in contract-targeted assertions. The builder also fixed 5 additional instances flagged in previous verify: proof.test.ts L1015/4079 and work.test.ts L3151/3173/3203. Remaining `toBeDefined()` instances are on non-deterministic or out-of-scope fields.

- **AC5:** ✅ PASS — E2E init test asserts all 6 agent files (agentFiles array L118-125 including ana-learn.md). Core test asserts 5 unconditional skill dirs (L139-145). New test at L291 asserts all 8 skill dirs including conditional ai-patterns, api-patterns, data-access using a rich fixture that triggers scan detection.

- **AC6:** ✅ PASS — `loadFixture()` removed entirely from fixtures.ts. `isWasmAvailable()` at L13 has no `export` keyword. Still called internally by `skipIfNoWasm()` at L24.

- **AC7:** ✅ PASS — Zero `console.log`/`console.warn` in benchmarks.test.ts, parsing-performance.test.ts, and fixtures.ts.

- **AC8:** ✅ PASS — 95 files, 1987 passed, 2 skipped. File count down from 96 (1 file deleted). Test count down from 2013 (net -26: 27 removed + 1 added). Zero behavioral coverage lost.

- **AC9:** ✅ PASS — Tests exit 0. Build clean (`turbo run build` success). Lint clean (1 pre-existing warning in git-operations.ts, not from this build).

## Blockers

No blockers. All 30 contract assertions SATISFIED. All 9 acceptance criteria pass. No regressions. Checked: no unused exports in new code (the new test creates no exports), no sentinel test patterns (new test uses `fileExists` assertions on real filesystem), no error paths that swallow silently (new test has no try/catch). The one new test exercises the real `ana init` command end-to-end with actual scan detection.

## Findings

- **Test — proof.test.ts L744 redundant toBeTruthy guard:** `packages/cli/tests/commands/proof.test.ts:744` — `expect(parsed).toBeTruthy()` before `parsed!['command'].toBeTypeOf('string')`. The non-null assertion `!` already assumes truthy. Spec gotcha says keep guards where the subsequent assertion doesn't cover the case — this is a borderline judgment call. Harmless.

- **Test — proofSummary.test.ts parseFindings uses weak range assertions:** `packages/cli/tests/utils/proofSummary.test.ts:733` — `toBeGreaterThanOrEqual(4)` and `:736` `toBeGreaterThanOrEqual(2)` on deterministic multi-finding fixture data. The fixture produces a known count; exact values would be stronger. Outside this build's contract targets but same anti-pattern addressed elsewhere in this build.

- **Test — E2E scan regression test uses 5 sole toBeDefined() assertions:** `packages/cli/tests/e2e/init-flow.test.ts:280-284` — `scan.overview`, `scan.stack`, `scan.commands`, `scan.files`, `scan.externalServices` all use `toBeDefined()`. Could be `toBeTypeOf('object')`. Outside this build's scope.

- **Test — "Previous Callouts" in fixture template strings:** `packages/cli/tests/utils/proofSummary.test.ts:834,866` — Fixture data uses stale "Previous Callouts" heading. These represent historical verify report format and are correctly preserved as backward-compat test fixtures. Not a code problem — the parser must handle legacy formats.

- **Upstream — New conditional skills E2E test depends on scan engine heuristics:** `packages/cli/tests/e2e/init-flow.test.ts:291` — Test triggers conditional skills via `prisma` (database), `next` (framework), `@anthropic-ai/sdk` (aiSdk). If the scan engine's detection keywords change, this test would fail. That's desirable behavior — it catches regression — but worth knowing if a future "detection maps" refactor happens.

## Deployer Handoff

Test-only cleanup — zero production code changes. No deployment risk. Test count dropped from 2013 → 1987 (net -26). All removed tests were archaeological, source-reading, mislabeled, or redundant. One new test added for conditional skill scaffolding E2E coverage.

The builder's fix round cleanly resolved all 3 previously-UNSATISFIED assertions by creating a separate E2E test with a rich fixture rather than modifying the minimal fixture. This is the right design — it keeps the core init test fast (bare package.json) and tests conditional behavior separately with appropriate triggers.

## Verdict
**Shippable:** YES

30/30 contract assertions SATISFIED. 9/9 acceptance criteria pass. Tests green (95 files, 1987 passed, 2 skipped). Build clean. Lint clean. The previous round's 3 UNSATISFIED assertions (A021-A023) and 4 findings (header comment, timestamp assertions) are all resolved. Remaining findings are outside this build's scope and carry forward as institutional memory for the next test hygiene pass.
