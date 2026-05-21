# Verify Report: Fix sampler budget overflow

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-20
**Spec:** .ana/plans/active/fix-sampler-budget-overflow/spec.md
**Branch:** feature/fix-sampler-budget-overflow

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-sampler-budget-overflow/contract.yaml
  Seal: INTACT (hash sha256:f1cafedbb95a3850558b8c7d0c3aa19e1ae082160e358b3d2b07ef9061e377c3)
```

Tests: 10 passed, 0 failed, 0 skipped. Build: success. Lint: 0 errors (1 pre-existing warning — unused eslint-disable directive, not introduced by this build).

## Contract Compliance

| ID   | Says                                                              | Status        | Evidence |
|------|-------------------------------------------------------------------|---------------|----------|
| A001 | The sampler never returns more files than the budget allows       | ✅ SATISFIED   | `proportional-sampler.test.ts:251`, asserts `files.length` not equal 0 — matches contract matcher `not_equals 0` |
| A002 | A budget of 2 with three depth levels returns at most 2 files    | ✅ SATISFIED   | `proportional-sampler.test.ts:252`, asserts `files.length` equals 2 |
| A003 | Shallow files get priority when budget is too small for all depth levels | ✅ SATISFIED | `proportional-sampler.test.ts:255-256`, `hasShallowFile` asserted true |
| A004 | A budget of 1 with three depth levels returns exactly 1 file     | ✅ SATISFIED   | `proportional-sampler.test.ts:286`, asserts `files.length` equals 1 |
| A005 | Existing sampler tests still pass after the fix                   | ✅ SATISFIED   | `proportional-sampler.test.ts:56`, "samples from single-repo project" — `files.length` equals 10. All 8 pre-existing tests pass. |
| A006 | Proportional allocation across roots still works after the fix    | ✅ SATISFIED   | `proportional-sampler.test.ts:94`, `webFiles.length` greater than `uiFiles.length` (implies > 0) |
| A007 | Depth stratification still works after the fix                    | ✅ SATISFIED   | `proportional-sampler.test.ts:170-171`, `hasDeepFiles` asserted true |
| A008 | Budget cap is still enforced after the fix                        | ✅ SATISFIED   | `proportional-sampler.test.ts:137`, `files.length` equals 10 |

## Independent Findings

**Prediction resolution:**

1. *Comment quality* — Not found. The comment at lines 77-79 of `proportionalSampler.ts` clearly explains the shallow-priority consequence of the guard. Well written.
2. *Weak assertions* — Partially confirmed. A001's matcher (`not_equals 0`) doesn't actually verify "never returns more than budget" as the `says` field claims — it just checks non-emptiness. A002 is the one that verifies the cap. This is a contract wording issue, not a test issue.
3. *Budget=1 doesn't verify shallow priority* — Confirmed. The A004 test only checks `length === 1`, not that the file is from the shallow bucket. The contract only requires `equals 1`, so SATISFIED per contract, but the shallow-priority invariant is undertested at the extreme case.
4. *Root-level allocation* — Not touched, correctly deferred per spec.
5. *Glob returning fewer files* — Not triggered by this change. The fix only affects allocation math, not globbing.

**Surprise finding:** None. This is a clean, minimal fix that does exactly what the spec says. The diff is 5 lines changed (1 condition, 3 comment lines, 1 period).

**Over-building check:** No extra parameters, functions, exports, or code paths added. The fix is exactly the guard specified in the spec. No YAGNI violations. Grep of new exports: none added — `sampleFilesProportional` was already the sole export.

## AC Walkthrough

- **AC1:** `allocateBudget` never returns allocations summing > budget. ✅ PASS — The `remaining > 0` guard at line 81 stops allocation once budget is exhausted. Second pass already guarded at line 88. Verified by A002 test (budget=2 returns exactly 2).
- **AC2:** When budget < non-empty bucket count, shallow buckets receive allocation first. ✅ PASS — Buckets array at lines 211-215 is ordered `[shallow, mid, deep]`. The for-loop at line 80 iterates in order. With budget=2, shallow and mid get 1 each; deep gets 0. Test at line 255 asserts `hasShallowFile`.
- **AC3:** A comment at the guard explains shallow-priority behavior. ✅ PASS — Lines 77-79: "Guard: stop when budget is exhausted. Because buckets are ordered [shallow, mid, deep], small budgets favor shallower files — this is intentional (shallow files are higher-signal for project structure)."
- **AC4:** A test creates a scenario with files at multiple depth levels and a small budget. ✅ PASS — Test at line 225 creates 5 files at each of 3 depth levels, budget=2, asserts `files.length === 2`.
- **AC5:** Existing sampler tests continue to pass unchanged. ✅ PASS — All 8 pre-existing tests pass. The guard condition `&& remaining > 0` has no effect when `budget >= nonEmpty.length` (the common case), so existing behavior is preserved.
- **AC6:** Tests pass with project test command. ✅ PASS — `pnpm run test -- --run` passes all tests across both surfaces (CLI: 10 sampler tests, website: 55 tests).
- **AC7:** No build errors. ✅ PASS — `pnpm run build` completed successfully.

## Blockers

No blockers. All 8 contract assertions satisfied. All 7 acceptance criteria pass. No regressions — all 8 pre-existing sampler tests pass unchanged. Checked for: unused exports in modified files (none — `sampleFilesProportional` is the sole export, unchanged), unused parameters in the modified function (none — `buckets` and `budget` both used), unhandled error paths (the `allocateBudget` function is pure math with no error paths; `globFromDir` catch block pre-existed), sentinel test patterns (all new assertions use exact values `toBe(2)`, `toBe(1)`, `toBe(true)` — none pass on broken code).

## Findings

- **Upstream — A001 `says` field mismatches its matcher:** The `says` claims "The sampler never returns more files than the budget allows" but the matcher is `not_equals 0` — it only verifies non-emptiness. Budget enforcement is actually proven by A002 (`equals 2`). Not a test problem — the test correctly implements the contract. The contract's `says` field is misleading. Consider rewording on next seal to "The sampler returns files when budget is smaller than bucket count."

- **Code — Root-level allocation shares the same bug pattern:** `packages/cli/src/engine/sampling/proportionalSampler.ts:140-143` — The `sampleFilesProportional` function's root-level allocation assigns floor 1 per root without a `remaining > 0` guard. Protected by the final `allFiles.slice(0, budget)` trim at line 172, so output is correct, but over-allocation wastes glob work on roots that will be trimmed away. The spec explicitly defers this fix. Known from proof context (`fix-deep-tier-sampling-C2` noted allocateBudget, but the root-level pattern is the same shape). Worth a future scope.

- **Test — Budget=1 test doesn't verify shallow priority:** `packages/cli/tests/engine/sampling/proportional-sampler.test.ts:286` — The A004 test asserts `files.length === 1` but doesn't check that the single returned file is from the shallow bucket. Given the iteration order `[shallow, mid, deep]`, the result is deterministically shallow, but the test would also pass if the iteration order changed to deep-first. The contract only requires `equals 1`, so this is SATISFIED — but the shallow-priority invariant is only tested at budget=2 (A003), not budget=1.

- **Upstream — Proof chain finding resolved:** `fix-deep-tier-sampling-C2` ("allocateBudget can return total exceeding budget when budget < non-empty bucket count") is directly resolved by the `remaining > 0` guard added at line 81. The exact scenario described in the finding is now tested by the budget=2 and budget=1 tests.

## Deployer Handoff

Minimal, surgical fix — 1 condition change + 3-line comment in `allocateBudget`. Two new tests added (budget=2, budget=1). No behavioral change for the common case (budget >= bucket count). The root-level allocation at lines 140-143 has the same pattern but is explicitly out of scope — the final trim at line 172 prevents incorrect output. Consider scoping a follow-up for that.

The lint warning (unused eslint-disable directive in an unrelated file) is pre-existing and not introduced by this build.

## Verdict

**Shippable:** YES

Clean fix. The one-line guard change is the exact analog of the second-pass guard that already existed. Two focused tests exercise the previously-untested budget < bucket count path. All existing tests pass unchanged. No over-building, no scope creep, no regressions. The proof chain finding `fix-deep-tier-sampling-C2` is resolved.
