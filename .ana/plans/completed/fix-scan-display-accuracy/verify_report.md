# Verify Report: Fix scan display accuracy — env hygiene false positive and contributor label

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-02
**Spec:** .ana/plans/active/fix-scan-display-accuracy/spec.md
**Branch:** feature/fix-scan-display-accuracy

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/fix-scan-display-accuracy/.ana/plans/active/fix-scan-display-accuracy/contract.yaml
  Seal: INTACT (hash sha256:8a0ea7ce883e83433da112366cc4faa3a4d8eb49920c42eab463c2aede3d650f)
```

Seal status: **INTACT**

Build: ✅ (turbo cache hit, typecheck + tsup clean). Tests: 3205 passed, 0 failed, 2 skipped. Lint: ✅ clean.

Focused checkpoint results:
- `pnpm vitest run scan-engine-secrets` — 4 passed (new file)
- `pnpm vitest run scan.test` — 89 passed (88 existing + 1 new)
- `pnpm vitest run tests/engine/findings/env.test.ts` — 5 passed (untouched, no regression)

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Repos that only gitignore .env.local are correctly flagged as not covering .env | ✅ SATISFIED | `tests/engine/scan-engine-secrets.test.ts:34` — creates `.env.local\n.env.production\n` gitignore, asserts `result.gitignoreCoversEnv` equals `false` |
| A002 | Repos with .env in their gitignore are still correctly detected as covered | ✅ SATISFIED | `tests/engine/scan-engine-secrets.test.ts:26` — creates `.env\n` gitignore, asserts `result.gitignoreCoversEnv` equals `true` |
| A003 | Non-git directories gracefully fall back to assuming .env is not covered | ✅ SATISFIED | `tests/engine/scan-engine-secrets.test.ts:42` — no git init, asserts `result.gitignoreCoversEnv` equals `false` |
| A004 | Git negation patterns that un-ignore .env are correctly detected | ✅ SATISFIED | `tests/engine/scan-engine-secrets.test.ts:49` — creates `.env\n!.env\n` gitignore, asserts `result.gitignoreCoversEnv` equals `false` |
| A005 | The contributor count shows the active qualifier | ✅ SATISFIED | `tests/commands/scan.test.ts:1296` — asserts Activity line `toContain('active contributor')`. Test fixture has 1 contributor so produces singular; the substring matches both forms. Code at `src/commands/scan.ts:276` confirms shared template for singular/plural. |
| A006 | A single contributor uses singular form | ✅ SATISFIED | `tests/commands/scan.test.ts:1296` — 1 contributor in fixture, output is "1 active contributor", asserts `toContain('active contributor')` |
| A007 | A single contributor does not show plural form | ✅ SATISFIED | `tests/commands/scan.test.ts:1299` — asserts `not.toContain('1 active contributors')` |
| A008 | Existing env hygiene finding tests still pass unchanged | ✅ SATISFIED | `tests/engine/findings/env.test.ts` — 5 tests pass, file unmodified (zero diff against main) |

## Independent Findings

**Prediction 1 (Windows paths):** Not found. `git check-ignore` handles path resolution internally.

**Prediction 2 (Negation test narrow):** The test covers `!.env` only. Edge cases like `!.env*` or nested gitignore aren't tested, but the contract only specifies basic negation. `git check-ignore` handles all gitignore semantics — the test is about proving the subprocess approach works, not re-testing git.

**Prediction 3 (Contributor substring weakness):** Confirmed. The test checks `toContain('active contributor')` which matches both singular and plural. With 1 contributor in the fixture, A005's contract value "active contributors" (plural) is never literally present in the output. The code is clearly correct (single template at `scan.ts:276`), but a multi-contributor fixture would be a stronger test.

**Prediction 4 (30-test delta):** Explained. Branch is 2 commits behind main. The build added 5 new tests (4 in scan-engine-secrets + 1 in scan.test). The remaining delta comes from work merged to main after branch creation.

**Prediction 5 (detectSecrets export):** Confirmed. Exported solely for test access — matches the documented pattern in testing-standards ("Functions exported solely for test access are intentional").

**Surprise:** The contributor display test uses a conditional guard pattern. `scan.test.ts:1295` finds the Activity line with `.find()`, asserts it's defined, then checks content — this is correct form. But `scan.test.ts:1298-1300` gates the plural check behind `if (activityLine!.includes('1 active contributor'))` — if the text ever changes to not include that exact string, the assertion silently passes. Not a current failure but a fragile pattern.

## AC Walkthrough

- **AC1:** Scanning a repo where `.gitignore` contains `.env.local` but NOT `.env` produces `gitignoreCoversEnv: false` — ✅ PASS. Test at `scan-engine-secrets.test.ts:34` verifies directly with real git repo.
- **AC2:** Scanning a repo where `.gitignore` contains `.env` produces `gitignoreCoversEnv: true` (no regression) — ✅ PASS. Test at `scan-engine-secrets.test.ts:26`. Existing `env.test.ts` also passes unchanged.
- **AC3:** The contributor display line reads "N active contributors" (not "N contributors") — ✅ PASS. Code diff at `scan.ts:276` adds "active " before "contributor". Test at `scan.test.ts:1296` verifies output contains "active contributor".
- **AC4:** Singular form "1 active contributor" works correctly — ✅ PASS. Test fixture has 1 contributor, output verified at `scan.test.ts:1296-1300`.
- **AC5:** Existing env hygiene tests pass, new tests cover the `.env.local`-only false positive case — ✅ PASS. `env.test.ts` passes (5/5), `scan-engine-secrets.test.ts` passes (4/4) with `.env.local`-only case at line 34.
- **AC6:** No scan output changes for repos that already have `.env` in their gitignore — ✅ PASS. A002 test confirms `.env` in gitignore still returns `true`. No existing test regressions.
- **AC7 (Tests pass):** ✅ PASS. Full suite: 3205 passed, 0 failed.
- **AC8 (No build errors):** ✅ PASS. `pnpm run build` succeeds (turbo cache, typecheck clean).

## Blockers

No blockers. All 8 contract assertions SATISFIED. All 8 ACs pass. No test regressions. Checked for: unused parameters in new code (none — `detectSecrets` takes only `rootPath`, which is used), unhandled error paths (the catch block at `scan-engine.ts:606` handles both exit-1 and exit-128 correctly), dead code (no unreachable branches in the diff), scope creep (JSDoc added to the exported function — required by coding standards, not over-building).

## Findings

- **Test — `git init` without `-b main` in new test files:** `packages/cli/tests/engine/scan-engine-secrets.test.ts:20` and `packages/cli/tests/commands/scan.test.ts:1282` — both use `git init` without forcing branch name. Testing standards require `git init -b main` because CI runners have different `init.defaultBranch` settings — documented as having caused CI failures 3 times. This is a widespread pattern in existing tests (~40 instances without `-b main`), so it's pre-existing debt the build inherited. Still, new tests should follow the standard.

- **Test — A005 plural form not directly verified:** `packages/cli/tests/commands/scan.test.ts:1296` — contract A005 specifies `contains "active contributors"` (plural) but the test creates 1 contributor and checks `toContain('active contributor')` (singular substring). The code clearly handles both forms via the same template (`scan.ts:276`), so this is a test coverage gap, not a code defect.

- **Test — Conditional assertion guard in contributor test:** `packages/cli/tests/commands/scan.test.ts:1298-1300` — the plural check `expect(activityLine).not.toContain('1 active contributors')` is gated behind `if (activityLine!.includes('1 active contributor'))`. If the Activity line format changes, this assertion silently passes. Testing standards say to assert the search succeeded rather than gating behind a truthy check.

- **Code — Synchronous subprocess in async function:** `packages/cli/src/engine/scan-engine.ts:604` — `execSync` is a blocking call inside an `async` function. The spec documents this as acceptable (single git command, instantaneous). Noting for context — if `detectSecrets` is ever called in parallel with other detectors, the synchronous call becomes a bottleneck.

- **Upstream — `formatHumanReadable` not exported:** The contributor display test uses an integration approach (runs `dist/index.js` via `execSync`) rather than unit testing the format function. This was noted in proof context from the previous scan-surface-detection cycle. The integration test is reasonable but slower and couples to the built artifact.

## Deployer Handoff

Two independent fixes landing together. The env hygiene change replaces a string match with a git subprocess call — verify that CI environments have git available (they do — this project already uses git in many tests). The contributor label is a one-word display change.

The `git init` without `-b main` pattern in the new tests is worth a follow-up cleanup pass across the test suite (~40 existing instances). Not blocking this PR — CI currently uses a consistent default branch, but it's latent risk.

## Verdict
**Shippable:** YES

Both fixes are clean and minimal. The env hygiene change correctly replaces a false-positive-prone substring match with `git check-ignore`, which is the authoritative gitignore evaluator. The contributor label adds the missing "active" qualifier. Tests cover all four contract scenarios for env detection plus the display change. No regressions, no over-building, no dead code. The `git init -b main` issue is real but pre-existing across ~40 test files — not a reason to hold this build.
