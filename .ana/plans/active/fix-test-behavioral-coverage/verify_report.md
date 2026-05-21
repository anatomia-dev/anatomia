# Verify Report: Fix test behavioral coverage gaps

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-20
**Spec:** .ana/plans/active/fix-test-behavioral-coverage/spec.md
**Branch:** feature/fix-test-behavioral-coverage

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-test-behavioral-coverage/contract.yaml
  Seal: INTACT (hash sha256:1f32c2f4922e281085cb6b16d8743d453f73e956c2d91ea7017997c1de8a365d)
```

Tests: 2713 passed, 0 failed, 2 skipped. Build: clean (typecheck + tsup). Lint: 0 errors, 2 warnings (pre-existing website warnings).

## Contract Compliance
| ID   | Says                                                                  | Status        | Evidence |
|------|-----------------------------------------------------------------------|---------------|----------|
| A001 | The dead ternary line is removed from the doctor scaffold test        | ✅ SATISFIED   | `doctor.test.ts:428-429` — exactly 2 expect lines remain in the A022 block (lines 428-429). The ternary on former line 430 is gone. |
| A002 | The doctor test still verifies deployment is listed as a scaffold default | ✅ SATISFIED | `doctor.test.ts:428` — `expect(results.dimensions.skills.scaffold_defaults).toContain('deployment')` |
| A003 | The doctor test still verifies troubleshooting is listed as a scaffold default | ✅ SATISFIED | `doctor.test.ts:429` — `expect(results.dimensions.skills.scaffold_defaults).toContain('troubleshooting')` |
| A004 | An entry with an existing surface is not overwritten during backfill  | ✅ SATISFIED   | `work.test.ts:6043` — `expect(chain.entries[0].surface).toBe('website')` after backfill ran on entry with `surface: 'website'` and `modules_touched` that derives to `'cli'` |
| A005 | The backfill guard test uses a surface mismatch to prove the guard works | ✅ SATISFIED | `work.test.ts:6023-6024` — fixture has `surface: 'website'` and `modules_touched: ['packages/cli/src/foo.ts']` (derives to `'cli'` via `createProofProjectWithChain`'s surfaces config) |
| A006 | The backfill guard test does not skip the backfill loop via migration marker | ✅ SATISFIED | `work.test.ts:6017-6033` — fixture passes only `entries` to `createProofProjectWithChain`, no `migrations` field. The backfill loop runs (confirmed by `surface_backfill: true` assertion at line 6044). |
| A007 | The replacement test carries the A021 contract tag                    | ✅ SATISFIED   | `work.test.ts:6015` — `// @ana A021` comment directly above the test |
| A008 | The trivial deriveSurface idempotency test is removed                 | ✅ SATISFIED   | `grep -n idempotent work.test.ts` returns empty. The 6-line test block (former lines 5848-5855) is gone. The `deriveSurface` describe block ends at line 5848 with the closing brace. |
| A009 | All existing tests still pass after the changes                       | ✅ SATISFIED   | Full CLI suite: 120 test files, 2713 passed, 2 skipped, 0 failed |
| A010 | The test count stays the same — one removed, one added                | ✅ SATISFIED   | Baseline: 2713 passed. After build: 2713 passed. Delta = 0. |

## Independent Findings

**Predictions resolved:**
1. Surface mismatch in fixture — **Not found.** Builder correctly set `surface: 'website'` with `modules_touched` deriving to `'cli'`. The mismatch is genuine and makes the assertion non-trivial.
2. Migration flag accidentally set — **Not found.** No `migrations` in fixture.
3. Missing `surface_backfill` assertion — **Not found.** Line 6044 asserts it.
4. Test count drift — **Not found.** Exact match at 2713.
5. Tag placement — **Not found.** `@ana A021` is in the `migration markers` block as specified.

**Production risk prediction:** The backfill guard at `work.ts:1101` uses `!existing.surface` — an empty string `surface: ''` is falsy in JS, so it would be treated as "no surface" and overwritten. This is outside the scope of this test-only build but is a latent edge case in the production guard logic.

**Over-building check:** No extra code, no new exports, no new files. The diff is minimal — one line deleted in doctor.test.ts, one test block deleted and one added in work.test.ts. No scope creep.

**Proof context resolution:** Both proof chain findings that motivated this spec are directly addressed:
- `(add-doctor-command-C2)` dead ternary — removed
- `(surface-awareness-bridge-C1)` trivial idempotency test — replaced with behavioral guard test

## AC Walkthrough
- ✅ **AC1:** doctor.test.ts line 430 (the `'still scaffold'.split(' ')[0]` ternary) is deleted. Lines 428-429 remain unchanged. Verified by diff and reading lines 423-431.
- ✅ **AC2:** The A022 test passes — confirmed via `pnpm vitest run tests/commands/doctor.test.ts` (40 passed).
- ✅ **AC3:** The trivial idempotency test is replaced with a test that creates a proof chain entry WITH `surface: 'website'`, runs `completeWork`, and asserts `chain.entries[0].surface` is still `'website'`. Verified at `work.test.ts:6016-6045`.
- ✅ **AC4:** The replacement test uses `surface: 'website'` with `modules_touched: ['packages/cli/src/foo.ts']` which derives to `'cli'` — a genuine mismatch that proves the guard prevents overwrite. Verified at `work.test.ts:6023-6024`.
- ✅ **AC5:** `@ana A021` tag is on line 6015, directly above the replacement test.
- ✅ **AC6:** All 2713 tests pass. Only doctor.test.ts and work.test.ts were modified. No other files changed.
- ✅ **AC7:** `pnpm vitest run` in packages/cli: 2713 passed, 2 skipped.
- ✅ **AC8:** `pnpm run build` succeeds — typecheck clean, tsup clean.

## Blockers
No blockers. All 10 contract assertions satisfied. All 8 ACs pass. No regressions (2713/2713 baseline maintained). Checked: no unused exports in changed files (test-only, no exports), no dead code paths introduced, no new parameters or functions, no assumptions about external state. The build is two surgical test modifications with zero production code changes.

## Findings
- **Code — Empty string surface treated as absent:** `packages/cli/src/commands/work.ts:1101` — the backfill guard `!existing.surface` treats empty string `''` as falsy, meaning an entry with `surface: ''` would be overwritten during backfill. Not introduced by this build, but surfaced during review of the guard logic this test exercises. Latent edge case.
- **Test — No negative proof for the guard:** `packages/cli/tests/commands/work.test.ts:6016` — the new test proves the guard preserves existing surfaces, but there's no complementary test proving that removing the `!existing.surface` condition from the guard would cause this test to fail. The test IS meaningful (it would fail if the guard were removed, since `deriveSurface` would return `'cli'` and overwrite `'website'`), but this reasoning requires understanding the backfill implementation — the test itself doesn't make the guard's necessity self-evident.
- **Upstream — add-doctor-command-C2 resolved:** Dead ternary logic in A022 test removed. This build directly addresses the proof chain finding.
- **Upstream — surface-awareness-bridge-C1 resolved:** Trivial pure-function idempotency test replaced with behavioral backfill guard test. This build directly addresses the proof chain finding.

## Deployer Handoff
Test-only change. No production code modified. Safe to merge — the two test fixes improve behavioral coverage without changing any runtime behavior. The proof chain findings `add-doctor-command-C2` and `surface-awareness-bridge-C1` can be marked resolved after merge.

## Verdict
**Shippable:** YES
All 10 contract assertions satisfied. All 8 acceptance criteria pass. 2713 tests pass with 0 regressions. Build and lint clean. The changes are minimal, correctly scoped, and achieve the stated goal: replacing assertions that pass-but-don't-test with assertions that exercise real behavior.
