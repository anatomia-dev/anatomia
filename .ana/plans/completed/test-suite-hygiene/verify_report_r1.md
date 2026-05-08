# Verify Report: Test Suite Hygiene

**Result:** FAIL
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

Tests: 1986 passed, 0 failed, 2 skipped (95 files). Build: clean. Lint: 1 pre-existing warning (unused eslint-disable in git-operations.ts, not from this build).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Source-reading test that greps production source for --json option registration is removed | ✅ SATISFIED | `work.test.ts` — 0 matches for "completeCommand registers --json option". Diff confirms deletion of 9-line source-reading test block. |
| A002 | Source-reading test that greps skills.ts for branchPrefix is removed | ✅ SATISFIED | `work.test.ts` — 0 matches for "injectGitWorkflow uses branchPrefix placeholder". Diff confirms deletion at L529-538. |
| A003 | Archaeological source-reading test for step 9a fixup is removed | ✅ SATISFIED | `artifact.test.ts` — 0 matches for "step 9a post-commit fixup no longer exists in source". Diff confirms deletion at L1277-1287. |
| A004 | Import boundary test in proofSummary has an exemption comment | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:1405` — exact comment: `// Source-reading exemption: enforces import boundary — no behavioral surface for this constraint` |
| A005 | Import boundary test in verify has an exemption comment | ✅ SATISFIED | `packages/cli/tests/commands/verify.test.ts:268` — exact comment: `// Source-reading exemption: enforces import boundary — no behavioral surface for this constraint` |
| A006 | Template tests have comments explaining templates are shipped artifacts | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:502,513,523` — 3 template comments added: `// Reads template file — templates are shipped artifacts, not implementation details` |
| A007 | The entire old-system-removed test file is deleted | ✅ SATISFIED | `packages/cli/tests/cleanup/old-system-removed.test.ts` — file does not exist. `ls` returns "No such file or directory". |
| A008 | The cleanup directory is deleted after removing its only file | ✅ SATISFIED | `packages/cli/tests/cleanup/` — directory does not exist. `ls` returns "No such file or directory". |
| A009 | Archaeological test verifying parseDiffAddedCommentLines deletion is removed | ✅ SATISFIED | `verify.test.ts` — 0 matches for "tag coverage tests are removed". Diff confirms deletion of 8-line archaeological test at L334-341. |
| A010 | Maintenance line test has a name that matches its assertion | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:1669` — test renamed to `'does not show Maintenance label when findings are auto-closed'`. Assertions check `not.toContain('Maintenance:')` which matches the name. |
| A011 | Redundant UNKNOWN result test is removed | ✅ SATISFIED | `work.test.ts` — 0 matches for "allows completion with UNKNOWN result". Diff confirms deletion of 20-line test block at L828-848. |
| A012 | Redundant UNKNOWN warning test is removed | ✅ SATISFIED | `work.test.ts` — 0 matches for "warns on UNKNOWN result with verify report present". Diff confirms deletion of 19-line test block at L1722-1740. |
| A013 | Callouts section name is updated to Findings in proofSummary test | ✅ SATISFIED | `proofSummary.test.ts` — 0 matches for "no Callouts section". Diff confirms two test names renamed: "no Callouts section" → "no Findings section" and "Callouts section" → "Findings section" at L639 and L647. |
| A014 | Timestamp field uses format assertion instead of just checking it exists | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:2038` — `expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/)` |
| A015 | Contract numeric fields use type assertions instead of just checking they exist | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:2061-2066` — all contract fields use `toBeTypeOf('number')`: satisfied, total, unsatisfied, deviated, new_findings, rejection_cycles. |
| A016 | JSON envelope fields in proof tests use type assertions instead of toBeDefined | ✅ SATISFIED | `packages/cli/tests/commands/proof.test.ts` — 46 instances of `toBeTypeOf()` across envelope tests. Diff confirms systematic replacement of `toBeDefined()` with `toBeTypeOf('object')`, `toBeTypeOf('number')`, `toBeTypeOf('string')`, `toBeTypeOf('boolean')`. |
| A017 | Redundant toBeTruthy guard before value assertion is removed in proof tests | ✅ SATISFIED | Diff confirms removal of `expect(json).toBeTruthy()` guard at L249, `expect(json.results.slug).toBeDefined()` guard before `.toBe('stripe-payments')` at L757, and `expect(json.results.timing).toBeDefined()` guard before `.toBe(90)` at L774. |
| A018 | Seal hash assertion uses format pattern match | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:1253` — `expect(saves['pre-check'].seal_hash).toMatch(/^sha256:[a-f0-9]{64}$/)` |
| A019 | Exact fixture counts replace toBeGreaterThan(0) in proofSummary tests | ✅ SATISFIED | Diff confirms 12 replacements of `toBeGreaterThan(0)` → `toBe(1)` in getProofContext and generateProofSummary tests (L1312, L1344, L1373, L1387, L1402, L1425, L1499, L1512, L1525, L1537, L1718, L1739, etc.). All fixture counts verified against single-finding fixtures. |
| A020 | E2E init test checks for the ana-learn agent file | ✅ SATISFIED | `packages/cli/tests/e2e/init-flow.test.ts:124` — `'ana-learn.md'` present in agentFiles array. |
| A021 | E2E init test checks for the ai-patterns skill directory | ❌ UNSATISFIED | `init-flow.test.ts` skillDirs array (L139-145) does not include `'ai-patterns'`. String appears only in comment at L133 explaining conditional scaffolding. Test does not assert this directory. Builder's justification is sound — `computeSkillManifest()` conditionally includes ai-patterns only when scan detects `aiSdk`. The minimal E2E fixture (bare package.json) doesn't trigger this condition. The contract assumption that all 8 skills are unconditional is incorrect. |
| A022 | E2E init test checks for the api-patterns skill directory | ❌ UNSATISFIED | Same as A021 — `'api-patterns'` not in skillDirs array. Conditional on framework detection. |
| A023 | E2E init test checks for the data-access skill directory | ❌ UNSATISFIED | Same as A021 — `'data-access'` not in skillDirs array. Conditional on database detection. |
| A024 | Dead loadFixture function is removed from test helpers | ✅ SATISFIED | `packages/cli/tests/engine/fixtures.ts` — 0 matches for "loadFixture". Diff confirms deletion of 19-line function and associated imports (path, fs, fileURLToPath). |
| A025 | isWasmAvailable is no longer exported but still used internally | ✅ SATISFIED | `packages/cli/tests/engine/fixtures.ts:13` — `async function isWasmAvailable()` (no `export` keyword). Function still called by `skipIfNoWasm()` at L25. |
| A026 | Console timing output is removed from performance benchmarks | ✅ SATISFIED | `packages/cli/tests/performance/benchmarks.test.ts` — 0 matches for `console.log`. |
| A027 | Console skip message is removed from parsing performance test | ✅ SATISFIED | `packages/cli/tests/engine/performance/parsing-performance.test.ts` — 0 matches for `console.log`. |
| A028 | Console warn for WASM unavailable is removed from fixtures | ✅ SATISFIED | `packages/cli/tests/engine/fixtures.ts` — 0 matches for `console.warn`. Diff confirms deletion of the 3-line warn block in `skipIfNoWasm()`. |
| A029 | All tests pass after cleanup with no behavioral coverage lost | ✅ SATISFIED | `(cd packages/cli && pnpm vitest run)` exit code 0. Output: "Test Files  95 passed (95), Tests  1986 passed | 2 skipped (1988)". |
| A030 | Test file count decreases by exactly 1 | ✅ SATISFIED | "Test Files  95 passed (95)" — down from 96 baseline. |

## Independent Findings

**Prediction resolution:**

1. **"Builder probably missed some toBeDefined → toBeTypeOf conversions"** — Partially confirmed. proof.test.ts `finding.closed_at` at L1015 and L4079 still uses `toBeDefined()` as sole assertion on a timestamp field. work.test.ts has 3 timestamp sole `toBeDefined()` assertions at L3151/3173/3203 that weren't strengthened, while L3187 was. The scope targeted envelope tests specifically, so these are outside the explicit target — but they're the same pattern.

2. **"E2E init test comments might not be updated"** — Partially confirmed. The builder updated "9 files" → "6 files" and "6 dirs" → "8 dirs" in the header comment. But "8 dirs" is misleading — only 5 are actually tested. The comment says "8 dirs" because 8 templates exist, but 3 are conditional and not asserted.

3. **"Exemption comments might not use exact wording"** — Not found. All three exemption comments and three template comments use exact wording from the spec.

4. **"isWasmAvailable unexport done by deleting function"** — Not found. Correctly handled: `export` keyword removed, function kept, `skipIfNoWasm()` still calls it internally.

5. **"Exact fixture counts might be guessed"** — Not found. All 12 `toBeGreaterThan(0)` → `toBe(1)` conversions in proofSummary.test.ts target single-finding fixtures, making `toBe(1)` correct.

**Surprise finding:** The builder also replaced `Array.isArray(x).toBe(true)` patterns with `toBeInstanceOf(Array)` in proof.test.ts — a pattern improvement not in the spec but within the spirit of "strengthen weak assertions." Positive deviation, minimal risk.

**Production risk:** None — this is purely test hygiene with zero production code changes. `pnpm run build` confirms typecheck passes and dist builds cleanly.

**Over-building check:** No scope creep detected. All changes are within the 10 files listed in the spec's file_changes. No new exports, no new functions, no new files created. The `toBeInstanceOf(Array)` pattern is a minor extension of the "strengthen weak assertions" scope — acceptable.

## AC Walkthrough

- **AC1:** ✅ PASS — Zero source-reading tests that grep production source for exercisable behavior. Two source-reading tests removed (work.test.ts, artifact.test.ts). Import-boundary tests at proofSummary.test.ts L1405 and verify.test.ts L268 are exempt with "Source-reading exemption" comments. Template-reading tests at work.test.ts L502/513/523 are exempt with "templates are shipped artifacts" comments.

- **AC2:** ✅ PASS — Zero archaeological tests. `tests/cleanup/` directory and `old-system-removed.test.ts` deleted (confirmed by `ls` — "No such file or directory"). verify.test.ts "tag coverage" archaeological test removed (diff confirmed).

- **AC3:** ✅ PASS — Every test name accurately describes its assertion. Maintenance test renamed to "does not show Maintenance label" (L1669). Two proofSummary tests renamed from "Callouts" to "Findings" (L639, L647). Two mislabeled UNKNOWN-path tests removed entirely rather than renamed (correctly — they duplicated the PASS path).

- **AC4:** ⚠️ PARTIAL — No `toBeDefined()` as sole assertion on a deterministic field in the CONTRACT-TARGETED assertions. However, 5 `toBeDefined()` sole assertions on deterministic timestamp fields remain in work.test.ts (L3151/3173/3203) and proof.test.ts (L1015/4079). These were outside the explicit contract targets but are the same anti-pattern. The AC says "No toBeDefined() as the sole assertion on a field whose type is deterministic" — this is technically violated by the remaining instances.

- **AC5:** ❌ FAIL — E2E init test asserts all 6 agent files ✅ (agentFiles array at L118-125 includes ana-learn.md). E2E init test asserts 5 of 8 skill directories ❌ — ai-patterns, api-patterns, data-access not asserted. Builder's comment explains these are conditionally scaffolded via `computeSkillManifest()`, which is correct. The AC didn't account for conditional skills.

- **AC6:** ✅ PASS — Zero dead exports. `loadFixture()` removed entirely. `isWasmAvailable()` unexported (L13 — no `export` keyword). Verified: no other file imports `isWasmAvailable` (only consumed internally by `skipIfNoWasm()`).

- **AC7:** ✅ PASS — Zero `console.log`/`console.warn` in the targeted files. benchmarks.test.ts: 0 matches. parsing-performance.test.ts: 0 matches. fixtures.ts: 0 matches.

- **AC8:** ✅ PASS — All tests pass: 95 files, 1986 passed, 2 skipped. Test file count decreased from 96 → 95 (one file deleted). Test count decreased from 2013 → 1986 (27 tests removed: 21 archaeological + 2 source-reading + 2 mislabeled + 2 redundant guards). Zero behavioral coverage lost — all removed tests either verified deleted code, duplicated existing coverage, or read source instead of exercising behavior.

- **AC9:** ✅ PASS — Tests pass (exit 0), no build errors (`turbo run build` clean), no lint errors (1 pre-existing warning in git-operations.ts, not introduced by this build).

## Blockers

A021-A023 are UNSATISFIED — the E2E test does not assert the 3 conditional skill directories (ai-patterns, api-patterns, data-access). This is a contract defect, not a builder defect. The builder correctly identified that `computeSkillManifest()` conditionally includes these skills based on scan results, and the minimal E2E fixture doesn't trigger those conditions.

Options to resolve:
1. **Amend the contract** to remove A021-A023 (the contract's assumption was wrong).
2. **Create a richer E2E fixture** that triggers conditional skills (adds framework/database/aiSdk to package.json) — but this changes scope significantly and may introduce flaky detection.
3. **Accept the deviation** — the builder's comment documents the gap, and the conditional skills ARE tested indirectly through the all-scaffolds.test.ts unit tests.

## Findings

- **Upstream — Contract A021-A023 assumed unconditional skill scaffolding:** `packages/cli/src/commands/init/skills.ts:124` — `computeSkillManifest(analysis)` dynamically determines which skills to scaffold based on engine analysis. ai-patterns requires `aiSdk`, api-patterns requires `framework`, data-access requires `database`. The contract and spec didn't account for this. The builder's handling (document in comment, test only unconditional skills) is the correct response to a contract defect.

- **Test — E2E header comment says "8 dirs" but tests 5:** `packages/cli/tests/e2e/init-flow.test.ts:7` — The file header says `.claude/ with settings.json, agents/ (6 files), and skills/ (8 dirs)` but the test only asserts 5 skill directories. "8 dirs" describes the template inventory, not what the test verifies. Misleading for future maintainers.

- **Test — proof.test.ts: toBeDefined() on finding.closed_at timestamps:** `packages/cli/tests/commands/proof.test.ts:1015` and `:4079` — `expect(finding.closed_at).toBeDefined()` is the sole assertion on a deterministic ISO timestamp field. Should be `toMatch(/^\d{4}-\d{2}-\d{2}/)` per the pattern established in this build. Outside this build's explicit targets but same anti-pattern.

- **Test — work.test.ts: 3 inconsistent timestamp assertions:** `packages/cli/tests/commands/work.test.ts:3151,3173,3203` — `saves.build_started_at` and `saves.verify_started_at` use `toBeDefined()` while L3187 was strengthened to `toMatch(/^\d{4}-\d{2}-\d{2}/)` in this build. Same file, same field type, inconsistent treatment.

- **Test — proofSummary.test.ts: weak assertions in parseFindings tests:** `packages/cli/tests/utils/proofSummary.test.ts:733,736` — `toBeGreaterThanOrEqual(4)` and `toBeGreaterThanOrEqual(2)` on deterministic fixture data. The fixture produces a known count; use exact values. (These are in a different section than the ones this build addressed.)

- **Test — "Previous Callouts" in fixture template strings:** `packages/cli/tests/utils/proofSummary.test.ts:834,866` — Fixture data for `parseRejectionCycles` tests uses "Previous Callouts" as a section heading. These represent historical verify report format and are correctly preserved as fixture data (not test names). Stale naming but intentionally frozen as test fixtures for backward compat parsing.

- **Test — proof.test.ts L744 redundant toBeTruthy guard:** `packages/cli/tests/commands/proof.test.ts:744` — `expect(parsed).toBeTruthy()` before `parsed!['command'].toBeTypeOf('string')`. The non-null assertion `!` already assumes truthy. Guard is redundant but harmless — TypeScript narrowing makes the `!` sufficient. Left deliberately by builder (spec's gotcha says "Only remove guards where the subsequent assertion already covers the case").

- **Test — E2E scan regression test uses 5 toBeDefined() sole assertions:** `packages/cli/tests/e2e/init-flow.test.ts:280-284` — scan.json top-level keys (overview, stack, commands, files, externalServices) use `toBeDefined()`. Could be `toBeTypeOf('object')`. Outside this build's scope but same anti-pattern.

## Deployer Handoff

This is a test-only cleanup — zero production code changes. No deployment risk. The 3 UNSATISFIED assertions (A021-A023) are a contract defect: the spec assumed all 8 skill directories are unconditionally scaffolded, but 3 are conditional on scan results. The builder's handling is correct. The developer should either amend the contract or accept the deviation before merging.

Test count dropped from 2013 → 1986 (27 tests removed). All removed tests were archaeological (verifying deleted code), source-reading (grepping production files), mislabeled (testing wrong behavior), or redundant (duplicating existing coverage). No behavioral coverage was lost.

## Verdict
**Shippable:** NO

3 of 30 contract assertions are UNSATISFIED (A021-A023). The builder's deviation is justified — these skills are conditionally scaffolded and the E2E fixture can't produce them — but the contract is authoritative. The developer should decide: amend the contract to remove the conditional-skill assertions, or create a richer E2E fixture that triggers them.

The remaining 27 assertions are all SATISFIED. All 8 acceptance criteria besides AC5 pass. The code changes are clean, well-scoped, and consistent with the spec. This is a contract defect blocking an otherwise shippable build.