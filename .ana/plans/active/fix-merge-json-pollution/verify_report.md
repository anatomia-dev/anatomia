# Verify Report: Fix --merge stdout pollution in --json mode

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-14
**Spec:** .ana/plans/active/fix-merge-json-pollution/spec.md
**Branch:** feature/fix-merge-json-pollution

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-merge-json-pollution/contract.yaml
  Seal: INTACT (hash sha256:9e1409911a63e1000263a6e1e9a6e4d1b7a8f3162fbbfb6cd8f5971e77854df6)
```

Tests: 2256 passed, 2 skipped (2258 total), 101 test files. Build: success. Lint: 0 errors (1 pre-existing warning — unused eslint-disable directive).

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Completing an already-merged PR with --json produces valid JSON output | ✅ SATISFIED | `work-merge.test.ts:380` — `JSON.parse(output)` succeeds on joined logs after `completeWork('test-slug', { json: true, merge: true })` with MERGED state |
| A002 | The JSON output contains the standard command envelope | ✅ SATISFIED | `work-merge.test.ts:384` — `expect(json.command).toBe('work complete')` |
| A003 | The JSON output includes results with the work item slug | ✅ SATISFIED | `work-merge.test.ts:385` — `expect(json.results.slug).toBe('test-slug')` |
| A004 | The JSON output includes chain metadata | ✅ SATISFIED | `work-merge.test.ts:386` — `expect(json.meta).toBeTypeOf('object')` (see Findings re: weakness) |
| A005 | Merging a PR with --json produces valid JSON output | ✅ SATISFIED | `work-merge.test.ts:411` — `JSON.parse(output)` succeeds on joined logs after merge-succeeded path |
| A006 | The merge-succeeded JSON output contains the standard command envelope | ✅ SATISFIED | `work-merge.test.ts:413` — `expect(json.command).toBe('work complete')` |
| A007 | No progress messages appear before the JSON output on the already-merged path | ✅ SATISFIED | `work-merge.test.ts:389` — `expect(output).not.toContain('already merged')` |
| A008 | No progress messages appear before the JSON output on the merge-succeeded path | ✅ SATISFIED | `work-merge.test.ts:417` — `expect(output).not.toContain('Merging PR')` |
| A009 | Human-readable output still shows progress messages without --json | ✅ SATISFIED | `work-merge.test.ts:148` — existing test "merges PR and completes work item" asserts `expect(output).toContain('PR merged.')` with `{ merge: true }` (no json flag) |
| A010 | Human-readable output still shows already-merged message without --json | ✅ SATISFIED | `work-merge.test.ts:265` — existing test "skips merge when PR is already merged" asserts `expect(output).toContain('already merged')` with `{ merge: true }` (no json flag) |

10/10 assertions SATISFIED.

## Independent Findings

**Prediction resolution:**

1. "Builder might miss one of the 2 pull-recovery guards" — **Not found.** Both guards at lines 1290 and 1312 are correctly implemented with the same `if (!options?.json)` pattern. Verified by reading the diff.
2. "Tests might not check output contains ONLY JSON" — **Not found.** Tests use `JSON.parse(output)` on the full joined logs, which would throw if non-JSON text were present. Additionally, explicit `not.toContain` checks verify no human-readable text leaked.
3. "not_contains assertions might be covered by single test without distinct verification" — **Confirmed but acceptable.** A007 shares a test block with A001-A004, and A008 shares with A005-A006. Each assertion has its own `expect` call within the test, so they're distinct assertions — just grouped in the same test function. This is standard practice.
4. "Test count mismatch" — **Not found.** Baseline was 2254 passed + 2 skipped (2256 total). After build: 2256 passed + 2 skipped (2258 total). The +2 matches the 2 new test cases.
5. "Merge-succeeded test mock might not exercise full path" — **Not found.** The mock handles `gh --version`, `gh pr view`, and `gh pr merge`. The completion flow continues through archival and JSON output. The test captures the full output and validates the envelope.

**Unpredicted observation:** The second test (merge-succeeded) asserts both `not.toContain('Merging PR')` and `not.toContain('PR merged')`, but A008 only requires the first. The extra assertion is beneficial — it verifies a guard the contract didn't explicitly require checking.

**Over-building check:** No scope creep. The diff adds exactly 5 `if (!options?.json)` guards and 2 test cases. No new exports, parameters, abstractions, or utility functions. No dead code. Clean surgical fix.

## AC Walkthrough

- **AC1:** `ana work complete --merge --json <slug>` produces exactly one JSON object on stdout with no preceding text, for both paths.
  ✅ PASS — Both tests call `completeWork` with `{ json: true, merge: true }`, join all captured logs, and successfully `JSON.parse` the output. The `not.toContain` assertions confirm no human-readable text precedes the JSON.

- **AC2:** Pull-recovery warning messages do not appear on stdout when `--json` is set.
  ⚠️ PARTIAL — Guards at lines 1290 and 1312 are correctly implemented (verified by code review). However, no test exercises the pull-recovery path with `json: true` — the spec acknowledges this ("not directly testable without simulating an untracked-file pull conflict"). The guard pattern is identical to the 3 tested guards.

- **AC3:** Human-readable output (without `--json`) is unchanged.
  ✅ PASS — Existing tests at lines 148 and 265 assert progress messages still appear when `json` is not set. All 11 pre-existing tests pass unchanged.

- **AC4:** A test in `work-merge.test.ts` exercises `--merge --json` and validates stdout parses as JSON.
  ✅ PASS — Two new tests added: "already-merged path with --json produces valid JSON" (line 367) and "merge-succeeded path with --json produces valid JSON" (line 392).

- **Tests pass:** ✅ PASS — 2256 passed, 2 skipped, 0 failed.

- **No build errors:** ✅ PASS — `pnpm run build` succeeds.

## Blockers

No blockers. All 10 contract assertions satisfied. All ACs pass (one partial — code-review-only for untestable pull-recovery path, acknowledged by spec). No regressions. Checked for: unused parameters in new code (none — no new parameters added), unhandled error paths (error paths correctly use `console.error` + `process.exit(1)`, writing to stderr not stdout), sentinel tests (all assertions check specific values or specific absence), dead code in new additions (none — each guard wraps exactly one `console.log`).

## Findings

- **Test — A004 meta assertion uses `toBeTypeOf('object')` — passes for null:** `packages/cli/tests/commands/work-merge.test.ts:386` — `typeof null === 'object'` in JavaScript, so `toBeTypeOf('object')` would pass if `json.meta` were null. In practice, `meta` is always a populated object from `completeWork`, but the assertion doesn't verify that. The existing JSON test pattern at `work.test.ts:2788` uses the same `toBeTypeOf('object')` — this is a pre-existing pattern weakness, not introduced by this build.

- **Test — A009/A010 satisfied by existing tests but lack `@ana` tags for this contract:** `packages/cli/tests/commands/work-merge.test.ts:148,265` — The existing tests carry `@ana` tags referencing the original work-merge contract (A001/A011), not this contract's A009/A010. The tests DO verify the behavior. The tag gap means automated tag-based lookups for this contract's A009/A010 would not find them. Not a blocker — the coverage exists.

- **Test — Pull-recovery guards (2 of 5) not directly exercised by any test:** `packages/cli/src/commands/work.ts:1290,1312` — The two pull-recovery `if (!options?.json)` guards are verified by code review only. Testing would require simulating an untracked-file pull conflict with specific filesystem state. The guard pattern is identical to the 3 tested guards. This is acknowledged in the spec's testing strategy section.

- **Upstream — JSON.parse on gh pr view stdout has no try/catch (pre-existing):** `packages/cli/src/commands/work.ts` — Active proof chain finding. Malformed `gh pr view` output would crash `completeWork`. Not introduced by this build, not worsened by it, but the merge path exercises this code. Still present — see proof chain finding from "work complete --merge flag for structured PR merging."

## Deployer Handoff

Straightforward bug fix. The change guards 5 `console.log` calls behind `if (!options?.json)` so that `--merge --json` produces clean parseable JSON on stdout. The pattern matches an existing guard in the same function. Two new tests verify both the already-merged and merge-succeeded paths produce valid JSON. All existing tests pass unchanged. The lint warning (unused eslint-disable directive) is pre-existing and unrelated.

## Verdict
**Shippable:** YES

All 10 contract assertions satisfied. 5 of 6 ACs pass outright, 1 partial (pull-recovery guard verified by code review, not test — acknowledged by spec as untestable without complex filesystem simulation). No regressions, no dead code, no over-building. The fix is minimal, surgical, and follows the established pattern.
