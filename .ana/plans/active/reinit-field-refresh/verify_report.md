# Verify Report: Re-init mechanical field refresh

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-18
**Spec:** .ana/plans/active/reinit-field-refresh/spec.md
**Branch:** feature/reinit-field-refresh

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/reinit-field-refresh/contract.yaml
  Seal: INTACT (hash sha256:038d579a1a343babd584312907aeb9e5f396154daa812eb507c98a20ba20715c)
```

Seal: **INTACT**

Tests: 2489 passed, 0 failed, 2 skipped across 108 files. Build: success. Lint: 0 errors (1 pre-existing warning in git-operations.ts, unrelated).

## Contract Compliance

| ID   | Says                                                          | Status       | Evidence |
|------|---------------------------------------------------------------|--------------|----------|
| A001 | Re-init updates the project name from the fresh scan          | ✅ SATISFIED  | init.test.ts:808, `expect(result.name).toBe('fresh-project-name')` |
| A002 | Re-init updates the language from the fresh scan              | ✅ SATISFIED  | init.test.ts:809, `expect(result.language).toBe('Python')` |
| A003 | Re-init updates the framework from the fresh scan             | ✅ SATISFIED  | init.test.ts:810, `expect(result.framework).toBe('Django')` |
| A004 | Re-init updates the package manager from the fresh scan       | ✅ SATISFIED  | init.test.ts:811, `expect(result.packageManager).toBe('pip')` |
| A005 | User-customized commands survive re-init                      | ✅ SATISFIED  | init.test.ts:813, `expect(result.commands.test).toBe('my-custom-test')` |
| A006 | Unknown user-added keys survive re-init alongside field refresh | ✅ SATISFIED | init.test.ts:816, `expect(result.myCustomKey).toBe(true)` |
| A007 | Co-author setting survives re-init                            | ✅ SATISFIED  | init.test.ts:857, `expect(result.coAuthor).toBe('My Team <team@example.com>')` |
| A008 | Artifact branch setting survives re-init                      | ✅ SATISFIED  | init.test.ts:858, `expect(result.artifactBranch).toBe('develop')` |
| A009 | Branch prefix setting survives re-init                        | ✅ SATISFIED  | init.test.ts:859, `expect(result.branchPrefix).toBe('fix/')` |
| A010 | Custom config block survives re-init                          | ✅ SATISFIED  | init.test.ts:860, `expect(result.custom.myFlag).toBe(true)` |
| A011 | A null scan result correctly overwrites a non-null old value  | ✅ SATISFIED  | init.test.ts:900, `expect(result.language).toBe(null)` |
| A012 | A null framework from scan overwrites a non-null old framework | ✅ SATISFIED | init.test.ts:901, `expect(result.framework).toBe(null)` |
| A013 | The doc comment lists all six mechanical refresh fields        | ✅ SATISFIED  | state.ts:520-521, doc comment reads "six mechanical fields refresh from the new scan: anaVersion, lastScanAt, name, language, framework, packageManager" — contains required substring. No tagged test; verified by source inspection per spec testing strategy. |

## Independent Findings

**Scope adherence:** The implementation is surgically precise — 4 lines added to the merge literal, doc comment updated, project-context.md updated. No over-building, no YAGNI violations, no dead code. All new exports are existing (no new exports added). The change follows the existing `anaVersion`/`lastScanAt` pattern exactly.

**Test quality:** All three test cases use specific expected values (`toBe('fresh-project-name')`, `toBe(null)`) — no weak assertions. The test fixtures are realistic with multiple fields exercised simultaneously. Each test covers its contract assertions accurately — matchers align, values align, targets are checked at the right path.

**Prediction resolution:**
- Predicted doc comment might be incomplete → **Not found.** Lists all six fields explicitly.
- Predicted null test might miss packageManager → **Not found.** All three nullable fields (language, framework, packageManager) tested with null.
- Predicted passthrough key might fail schema validation → **Not found.** AnaJsonSchema uses `.passthrough()`, test confirms it works.
- Predicted PRESERVE test might miss commands → **Confirmed minor gap.** Test 2 doesn't assert on commands, but test 1 already covers command preservation. No coverage gap.
- Predicted undefined newConfig field risk → **Observed.** If `newAnaConfig['name']` were `undefined`, `JSON.stringify` would omit the key silently. In practice, `createAnaJson` always returns `name` (defaults to `'unknown'`), so the risk is theoretical. Worth monitoring if `createAnaJson` ever changes.

**What I didn't predict:** The lint warning in `git-operations.ts:198` is pre-existing (unused eslint-disable directive). Unrelated to this build.

## AC Walkthrough

- **AC1:** After re-init, `name` matches fresh scan → ✅ PASS — init.test.ts:808, `result.name === 'fresh-project-name'`
- **AC2:** After re-init, `language` matches fresh scan → ✅ PASS — init.test.ts:809, `result.language === 'Python'`
- **AC3:** After re-init, `framework` matches fresh scan → ✅ PASS — init.test.ts:810, `result.framework === 'Django'`
- **AC4:** After re-init, `packageManager` matches fresh scan → ✅ PASS — init.test.ts:811, `result.packageManager === 'pip'`
- **AC5:** PRESERVE fields retain old values → ✅ PASS — init.test.ts:857-860, coAuthor/artifactBranch/branchPrefix/custom all asserted with specific old values
- **AC6:** User-tuned command survives → ✅ PASS — init.test.ts:813, `result.commands.test === 'my-custom-test'`
- **AC7:** Doc comment lists all six refresh fields → ✅ PASS — state.ts:520-521 reads "six mechanical fields refresh from the new scan: anaVersion, lastScanAt, name, language, framework, packageManager"
- **AC8:** All existing tests pass, count does not decrease → ✅ PASS — 2489 passed (baseline 2486 + 3 new), 2 skipped, 108 files
- **AC9:** Unknown passthrough keys survive → ✅ PASS — init.test.ts:816, `result.myCustomKey === true`
- **AC10:** project-context.md matches new behavior → ✅ PASS — Refreshed line now reads "ana.json mechanical fields (anaVersion, lastScanAt, name, language, framework, packageManager)"

## Blockers

No blockers. All 13 contract assertions satisfied. All 10 ACs pass. No regressions (2489 tests, up from 2486 baseline). No unused exports in new code (no new exports added — only the existing `preserveUserState` was modified). No unhandled error paths introduced (the 4 new lines are simple property overrides in an existing object literal, no branching logic). No assumptions about external state (the function signature and data flow are unchanged). The command sanitization block at lines 570-589 was not disturbed.

## Findings

- **Test — A013 has no tagged test:** `packages/cli/tests/commands/init.test.ts` — The doc comment assertion (A013) is verified by source inspection rather than a tagged test. This is acceptable per the spec's testing strategy (three test cases for behavior, doc comment verified structurally), but means future doc comment regressions won't be caught by the test suite. Dormant risk — the doc comment is stable and rarely touched.

- **Code — Merge override assumes newAnaConfig always contains all four keys:** `packages/cli/src/commands/init/state.ts:564` — If `newAnaConfig['name']` were `undefined` (e.g., `createAnaJson` changes its return shape), `JSON.stringify` would silently omit the key from the written ana.json, rather than setting it to an explicit value. In practice, `createAnaJson` always returns `name` (defaults to `'unknown'`) and the three nullable fields default to `null`. The existing `anaVersion`/`lastScanAt` overrides have the same theoretical risk and have been stable. Monitor — no action needed now.

- **Upstream — Pre-existing pkg.path injection risk:** `packages/cli/src/commands/init/state.ts` — Proof context shows `monorepo-build-scoping-C5` and `flip-monorepo-commands-C4`: `pkg.path` injected into shell commands without sanitization. Unrelated to this build's merge-literal change, still present. See `monorepo-build-scoping-C5`.

## Deployer Handoff

Straightforward merge. The change adds 4 property overrides to an existing merge literal and updates two documentation locations. No migration needed — existing ana.json files will get refreshed values on next `ana init` re-run. The behavior change is: `name`, `language`, `framework`, `packageManager` now refresh from the scan instead of preserving stale old values. Commands and user-owned fields (coAuthor, artifactBranch, branchPrefix, custom) still preserve. The pre-existing lint warning in git-operations.ts is unrelated.

## Verdict

**Shippable:** YES

13/13 contract assertions satisfied. 10/10 acceptance criteria pass. 2489 tests pass across 108 files (3 net new). No regressions. The implementation is minimal, follows the existing pattern exactly, and the tests use specific assertions with realistic fixtures. The three findings are all observations — none require action before shipping.
