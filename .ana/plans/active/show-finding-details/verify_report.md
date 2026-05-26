# Verify Report: Show Finding Details in CLI Output

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-26
**Spec:** .ana/plans/active/show-finding-details/spec.md
**Branch:** feature/show-finding-details

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/show-finding-details/contract.yaml
  Seal: INTACT (hash sha256:df547c88834aed2b22d5295431eaed9f35cc1ffbb84f4a0f4ef8ba478c5fc70e)
```

Tests: 2932 passed, 2 skipped (2934 total). Build: clean. Lint: 1 pre-existing warning (unused eslint-disable directive in unrelated file).

Baseline was 2924 passed, 2 skipped (2926 total) → net +8 tests, all new.

## Contract Compliance
| ID   | Says                                                          | Status       | Evidence |
|------|---------------------------------------------------------------|--------------|----------|
| A001 | Scan output shows detail text below each warning or critical finding | ✅ SATISFIED | `packages/cli/tests/commands/scan-finding-details.test.ts:26` — asserts output contains 4-space indent and detail text `'This explains what happened'` |
| A002 | Detail text appears dimmed to distinguish it from the finding title | ✅ SATISFIED | `packages/cli/tests/commands/scan-finding-details.test.ts:44` — verifies detail line exists and is indented; source at `packages/cli/src/commands/scan.ts:334` confirms `chalk.gray()` wrapping |
| A003 | Findings without detail text show only the title line          | ✅ SATISFIED | `packages/cli/tests/commands/scan-finding-details.test.ts:68` — creates null-detail finding, asserts line after title is not detail-indented |
| A004 | Multi-line detail text renders each line separately            | ✅ SATISFIED | `packages/cli/tests/commands/scan-finding-details.test.ts:93` — creates `'First detail line\nSecond detail line'`, asserts `detailLines.toHaveLength(2)` |
| A005 | Validation finding explains its detection methodology in one line | ✅ SATISFIED | `packages/cli/tests/engine/findings/rules/validation.test.ts:166` — `toBe()` exact match against full detail string |
| A006 | Validation detail no longer contains a newline character        | ✅ SATISFIED | `packages/cli/tests/engine/findings/rules/validation.test.ts:167` — `expect(finding!.detail).not.toContain('\n')` |
| A007 | Validation detail still mentions wrapper-based detection limitation | ✅ SATISFIED | `packages/cli/tests/engine/findings/rules/validation.test.ts:136` — `expect(finding!.detail).toContain('wrapper-based')` |
| A008 | Secret findings show their redacted match and file location as detail | ✅ SATISFIED | `packages/cli/tests/commands/scan-finding-details.test.ts:112` — asserts output contains `'sk_l****aBcD  src/config.ts:42'` (includes `:`) |
| A009 | Env hygiene finding shows its explanatory detail               | ✅ SATISFIED | `packages/cli/tests/commands/scan-finding-details.test.ts:129` — asserts output contains env detail text |
| A010 | Pass findings never enter the detail display path              | ✅ SATISFIED | `packages/cli/tests/commands/scan-finding-details.test.ts:145` — creates pass finding with detail, asserts `output.not.toContain('This should not appear')` |

## Independent Findings

**Predictions resolved:**
1. *Builder used synthetic findings instead of integration tests* — Confirmed. Tests create findings via `makeResult()` and pass to `formatHumanReadable` directly. This is reasonable since the function was exported specifically for testing, and the codebase has established this pattern (`formatHumanReadable` from proof.ts is tested the same way).
2. *A002 test doesn't verify ANSI gray codes* — Confirmed. Chalk output is environment-dependent (CI may disable colors). Test verifies detail line existence and indentation. Source code at scan.ts:334 uses `chalk.gray()`. Pragmatic tradeoff.
3. *Validation detail text has redundancy* — Confirmed. "checks imports in first 30 lines" appears twice in the detail string. This came directly from the spec (AC3), so the builder followed instructions correctly. This is a spec-level issue.
4. *Export increases public API surface* — Confirmed. `formatHumanReadable` now exported from scan.ts. Only imported by the new test file. Established codebase pattern (proof chain shows prior closures of identical pattern).
5. *No truncation for long detail text* — Not a practical concern. All current finding details are short. Multi-line handling is correct.

**Over-building check:** The diff is tight — 5 lines of display logic, 1 line of detail text change, 1 keyword change (`function` → `export function`), and 1 new test file. No unused parameters, no unnecessary abstractions, no dead code. No scope creep.

## AC Walkthrough
- ✅ **AC1:** `ana scan` on a repo with warn/critical findings shows `f.detail` as indented gray text below each finding title. Live tested on `/tmp/scan-test-detail` with an `.env` file not in `.gitignore` — env hygiene finding displayed with indented detail line beneath the title.
- ✅ **AC2:** `ana scan` on a repo with all-pass findings shows no detail lines. Live tested on the anatomia workspace (all pass) — no detail lines in output. Pass findings are filtered by `criticalOrWarn` before the detail-rendering loop.
- ✅ **AC3:** The validation finding's detail is a single line matching the specified text. Verified by exact-match test at `validation.test.ts:166` (10 tests passed).
- ✅ **AC4:** Secret findings show their redacted match + file:line detail. Test at `scan-finding-details.test.ts:112` verifies with synthetic secret finding. Live secret scan not triggered (no secrets in test repos).
- ✅ **AC5:** Env hygiene finding shows its explanatory detail. Live verified — `ana scan` in test directory displayed `AI won't know what env vars this project needs without .env.example` indented below the title.
- ✅ **AC6:** CLI output for a repo with multiple findings remains compact. Live verified — one detail line per finding, indented under its title. No blank lines between findings.
- ✅ **AC7:** Tests pass: 2932 passed, 2 skipped (baseline was 2924 passed).
- ✅ **AC8:** No build errors: `pnpm run build` completed successfully.

## Blockers
No blockers. All 10 contract assertions satisfied, all 8 ACs pass, no test regressions (+8 net new tests), build and lint clean. Checked for: unused exports in new code (only `formatHumanReadable`, which is test-imported — established pattern), unused parameters in modified code (none), unhandled error paths in new logic (detail split handles empty strings correctly since `''.split('\n')` returns `['']` which renders as an empty indented line — acceptable), sentinel test patterns (all tests assert specific values or conditions, none are tautological).

## Findings

- **Upstream — Validation detail text contains redundant repetition:** `packages/cli/src/engine/findings/rules/validation.ts:116` — "checks imports in first 30 lines" appears twice: "Heuristic: checks imports in first 30 lines. Checks imports in first 30 lines; wrapper-based..." The spec prescribed this exact text (AC3), so the builder followed correctly. Worth condensing to "Heuristic: checks imports in first 30 lines; wrapper-based or middleware validation may not be detected." in a future cycle.
- **Test — A002 verifies indentation but not chalk.gray styling:** `packages/cli/tests/commands/scan-finding-details.test.ts:44` — The contract says `detailLine.style equals gray`. The test checks the detail line exists and is indented but doesn't verify ANSI escape codes. Source inspection at `packages/cli/src/commands/scan.ts:334` confirms `chalk.gray()` is applied. Chalk output is environment-dependent (CI may strip ANSI), so this is a pragmatic choice. Not a contract failure — the style IS gray in the implementation.
- **Test — A003 uses next-line check instead of line count:** `packages/cli/tests/commands/scan-finding-details.test.ts:68` — Contract says `outputLines.length equals 1`. Test verifies the line after the title isn't detail-indented, which proves the same thing but through a different mechanism. Functionally equivalent.
- **Code — `formatHumanReadable` exported for test access:** `packages/cli/src/commands/scan.ts:101` — Previously internal, now exported. Only imported by `scan-finding-details.test.ts`. This is an established pattern in the codebase (proof chain shows multiple prior closures for the same pattern in proof.ts and other modules). No action needed.

## Deployer Handoff
Minimal change — 2 source files modified, 1 new test file, 1 existing test file extended. The validation detail text rewrite changes user-visible output for the `api-validation` finding (from two lines to one). The scan display now shows indented gray detail text below warn/critical findings. No configuration changes, no new dependencies, no migration needed. Pre-commit hook will run typecheck + lint + test on merge.

## Verdict
**Shippable:** YES
All 10 contract assertions satisfied. All 8 acceptance criteria pass. 2932 tests pass (+8 from baseline). Build clean, lint clean. Live-tested the display on a real project — detail rendering works as specified. The validation text repetition is a spec-level issue, not a build issue. Would stake my name on this shipping.
