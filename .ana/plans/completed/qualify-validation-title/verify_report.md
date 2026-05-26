# Verify Report: Qualify Validation Finding Title

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-26
**Spec:** .ana/plans/active/qualify-validation-title/spec.md
**Branch:** feature/qualify-validation-title

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/qualify-validation-title/contract.yaml
  Seal: INTACT (hash sha256:ae36eca8dda8369f1e1010d11dc8ae59c5d20bf067b7fc30fbe7826760902cbe)
```

Tests: 2924 passed, 0 failed, 2 skipped (124 files). Build: ✓ cached. Lint: 0 errors, 1 pre-existing warning.

Checkpoint tests (validation rule files only): 14 passed, 0 failed.

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Warn title shows approximate count with tilde prefix | ✅ SATISFIED | Source `packages/cli/src/engine/findings/rules/validation.ts:115` — template literal starts with `` `~${unvalidated}` ``. Cross-verified by test assertions at `packages/cli/tests/engine/findings/rules/validation.test.ts:121` (`~12 of 12`) and `packages/cli/tests/engine/findings/validation.test.ts:63` (`~11 of 12`). |
| A002 | Warn title says 'route files' instead of 'routes' | ✅ SATISFIED | Source `packages/cli/src/engine/findings/rules/validation.ts:115` contains "API route files". Test `packages/cli/tests/engine/findings/rules/validation.test.ts:40` asserts `toContain('of 15 API route files')`. |
| A003 | Warn title uses 'may lack' language instead of 'have no' | ✅ SATISFIED | Source `packages/cli/src/engine/findings/rules/validation.ts:115` — `may lack input validation`. Test `packages/cli/tests/engine/findings/validation.test.ts:63` asserts `toContain('~11 of 12 API route files')` (partial match includes the surrounding format). Full string verified by source inspection. |
| A004 | Warn title uses 'of' separator instead of slash | ✅ SATISFIED | Source `packages/cli/src/engine/findings/rules/validation.ts:115` — uses `` `~${unvalidated} of ${routeFiles.length}` ``, no `/` present. Test `packages/cli/tests/engine/findings/rules/validation.test.ts:121` asserts `~12 of 12 API route files` (no slash). |
| A005 | Pass title says 'route files' instead of 'routes' | ✅ SATISFIED | Source `packages/cli/src/engine/findings/rules/validation.ts:103` — `API route files`. Test `packages/cli/tests/engine/findings/validation.test.ts:47` asserts `toContain('All 2 API route files')`. |
| A006 | Pass title includes 'detected' qualifier | ✅ SATISFIED | Source `packages/cli/src/engine/findings/rules/validation.ts:103` — `have validation imports detected`. No test explicitly asserts the "detected" keyword, but source inspection confirms its presence in the template literal. |
| A007 | Pass title has no tilde since 100% coverage is exact | ✅ SATISFIED | Source `packages/cli/src/engine/findings/rules/validation.ts:103` — pass title template `All ${routeFiles.length} API route files have validation imports detected` contains no `~`. Source inspection confirms. |
| A008 | Finding ID remains stable for downstream consumers | ✅ SATISFIED | Source `packages/cli/src/engine/findings/rules/validation.ts:101` and `:113` both use `id: 'api-validation'`. Downstream consumer `packages/cli/src/commands/init/assets.ts:451` references `'api-validation'` by ID, not title — confirmed unaffected. |

## Independent Findings

**Tag misalignment:** All 8 `@ana` tags in `validation.test.ts` are inherited from a prior build cycle (fix-deep-tier-sampling). None map to this contract's assertions. For example, `@ana A001` tags a test about glob coverage, but contract A001 is about tilde prefix. Every assertion was verified by source inspection and cross-test evidence. This is not a correctness problem — the code is right — but the tags are stale semantic pointers.

**Pass title lacks dedicated test coverage:** No test asserts on the "detected" keyword (A006) or the absence of tilde in pass title (A007). The pass title test at `validation.test.ts:47` asserts `toContain('All 2 API route files')` which matches the "route files" part but stops short of the full string. A test asserting `toContain('validation imports detected')` would close this gap.

**Diff is minimal and precise:** 2 source lines changed, 5 test assertions updated. No scope creep, no new exports, no new functions, no dead code. The builder followed the spec exactly.

**Over-building check:** No new files, no new exports, no new parameters, no new functions. Grep of changed files confirms no unused code introduced.

**Prediction resolution:**
1. *Predicted @ana tags wouldn't map to this contract* — **Confirmed.** All 8 are stale from prior cycle.
2. *Predicted A001 tilde check might be weak* — **Confirmed.** Tagged test doesn't check tilde, but three other tests do (`~12`, `~11`, `~1`).
3. *Predicted A004 tagged test tests severity not slash* — **Confirmed.** The tagged test checks `severity === 'info'`.
4. *Predicted no test for "detected"* — **Confirmed.** No test asserts the "detected" keyword.
5. *Predicted downstream breakage from title change* — **Not found.** `assets.ts:458` uses `f.id` lookup, confirmed safe.
6. *Production risk — old format pattern matching elsewhere* — **Not found.** Grep for "API routes have" across the codebase returned zero hits outside the changed files.

## AC Walkthrough

- **AC1: Warn title renders as `~{n} of {total} API route files may lack input validation`** — ✅ PASS. Source line 115 matches exactly. Tests at `validation.test.ts:63` and `validation.test.ts:89` confirm with real data.
- **AC2: Pass title renders as `All {total} API route files have validation imports detected`** — ✅ PASS. Source line 103 matches exactly. Test at `validation.test.ts:47` confirms partial match.
- **AC3: AGENTS.md constraint continues to fire for warn-severity validation findings** — ✅ PASS. `assets.ts:458` uses `f.id` not `f.title`. ID unchanged at `api-validation`.
- **AC4: Existing tests pass with updated expected title strings** — ✅ PASS. 14/14 checkpoint tests pass. 2924/2924 full suite pass.
- **AC5: `ana scan` on a project with routes shows the new format** — ⚠️ PARTIAL. Not live-tested against a project with API routes (no Next.js project with routes available in this environment). Source inspection confirms the format change is correct. The test suite exercises the code path with temp directories containing mock route files.
- **Tests pass: `(cd packages/cli && pnpm vitest run)`** — ✅ PASS. 2924 passed, 2 skipped, 0 failed.
- **No build errors: `pnpm run build`** — ✅ PASS. Build succeeded (cached).

## Blockers

No blockers. All 8 contract assertions satisfied. All acceptance criteria pass (one partial — live scan not exercised, but code path verified through tests). No regressions — test count matches baseline exactly (2924 passed, 2 skipped). Checked for: unused exports in changed files (none — `checkApiValidation` is the only export, imported by `findings/index.ts`), unhandled error paths (existing catch blocks unchanged), dead code in diff (none — only string content changed), slash characters remaining in titles (grep confirms none).

## Findings

- **Test — All 8 @ana tags are stale from prior build cycle:** `packages/cli/tests/engine/findings/rules/validation.test.ts:26-142` — Tags A001-A008 reference tests from the fix-deep-tier-sampling build, not this contract. Example: `@ana A001` tags a glob coverage test but contract A001 is about tilde prefix. Every assertion was verified by source inspection instead. The tags aren't wrong per se (they linked to valid tests in their original context) but they're misleading for this contract.

- **Test — No test asserts 'detected' in pass title:** `packages/cli/tests/engine/findings/validation.test.ts:47` — asserts `toContain('All 2 API route files')` but stops before "have validation imports detected". A test asserting on the full suffix would prevent silent regression of the "detected" qualifier. Low risk — the string is a literal in the template, not computed.

- **Test — No test asserts absence of tilde in pass title:** `packages/cli/tests/engine/findings/rules/validation.test.ts:74` — the pass-case test asserts `toContain('3')` which matches the count but doesn't verify `~` is absent. Contract A007 requires `not_contains "~"` — no test exercises this negative assertion.

- **Code — Grammatically incorrect singular case:** `packages/cli/src/engine/findings/rules/validation.ts:115` — produces "~1 of 1 API route files" (plural) for the singular case. Spec acknowledges this (line 84: "cosmetic and out of scope") and the existing test at `validation.test.ts:89` asserts this exact string. Noted for future scope.

- **Upstream — Tilde qualifier partially addresses known false-positive inaccuracy:** The `~` prefix and "may lack" language acknowledge that `VALIDATION_PATH_PATTERNS` can false-positive (proof chain `fix-deep-tier-sampling-C1`). The title change makes the heuristic nature visible to users, partially mitigating the impact of inaccurate counts. The underlying detection logic is unchanged.

## Deployer Handoff

Minimal change — two template literal strings in `validation.ts`, five test assertion updates. No new dependencies, no API changes, no config changes. The `api-validation` finding ID is unchanged, so downstream consumers (AGENTS.md generation via `assets.ts`) are unaffected. The lint warning (`unused eslint-disable directive` in an unrelated file) is pre-existing. Merge and ship.

## Verdict
**Shippable:** YES

Clean two-line source change with precise test updates. All 8 contract assertions satisfied (6 by source inspection due to stale @ana tags, 2 with direct test evidence). Full test suite passes at baseline count. No regressions, no scope creep, no dead code. The stale @ana tags are inherited debt, not introduced by this build. Would stake my name on this shipping.
