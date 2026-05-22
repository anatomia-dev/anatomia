# Verify Report: Fix TypeScript Language Detection for Monorepos and Multi-Directory Projects

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-typescript-language-detection/spec.md
**Branch:** feature/fix-typescript-language-detection

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-typescript-language-detection/contract.yaml
  Seal: INTACT (hash sha256:ad0231a7e0a60451d34a3a9fa30a9d2ce957c1691672ae730bcfee851e82d49d)
```

Tests: 2780 passed, 0 failed, 2 skipped. Build: PASS. Lint: PASS (warnings only, pre-existing).

Focused test run (`pnpm vitest run detection-overrides`): 21 passed, 0 failed.

Baseline was 2762 tests. Now 2780 — net +18 tests (5 new TS detection tests in this build, remainder from other merged work on main).

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Monorepo projects with TypeScript as a root toolchain dependency are detected as TypeScript | ✅ SATISFIED | `detection-overrides.test.ts:68` — creates pnpm monorepo with `devDependencies: { typescript: '5.0.0' }`, workspace package without typescript, asserts `result.stack.language === 'TypeScript'` |
| A002 | Projects with TypeScript config files in common subdirectories are detected as TypeScript | ✅ SATISFIED | `detection-overrides.test.ts:92` — no root tsconfig, no typescript dep, `server/tsconfig.json` present, asserts `result.stack.language === 'TypeScript'` |
| A003 | Non-Node projects with subdirectory TypeScript configs are not falsely upgraded | ✅ SATISFIED | `detection-overrides.test.ts:110` — no package.json, `web/tsconfig.json` present, asserts `result.stack.language !== 'TypeScript'` via `.not.toBe()`. Contract matcher is `not_equals` — method matches |
| A004 | Root tsconfig detection continues working after the change | ✅ SATISFIED | `detection-overrides.test.ts:26` — pre-existing test, root tsconfig + package.json, asserts `result.stack.language === 'TypeScript'` |
| A005 | TypeScript dependency detection continues working after the change | ✅ SATISFIED | `detection-overrides.test.ts:56` — pre-existing test, typescript in devDependencies, asserts `result.stack.language === 'TypeScript'` |
| A006 | Plain Node.js projects without TypeScript signals stay as Node.js | ✅ SATISFIED | `detection-overrides.test.ts:43` — pre-existing test, no tsconfig, no typescript dep, asserts `result.stack.language === 'Node.js'` |
| A007 | Tier 2 alone is sufficient without any subdirectory tsconfigs present | ✅ SATISFIED | `detection-overrides.test.ts:125` — monorepo with rootDevDeps typescript, no tsconfig anywhere, asserts `result.stack.language === 'TypeScript'` |
| A008 | Multiple subdirectory tsconfig candidates are handled correctly | ✅ SATISFIED | `detection-overrides.test.ts:148` — `server/` and `web/` both have tsconfig.json, no root tsconfig, no typescript dep, asserts `result.stack.language === 'TypeScript'` |

## Independent Findings

**Predictions before reading code:**
1. *Tier 3 short-circuit might be misplaced* — **Not found.** The `!hasTsConfig && !hasTsDep` guard at line 864 is correctly placed inside the Node.js gate, after the Tier 1/2 block.
2. *Monorepo test might not properly isolate rootDevDeps from allDeps* — **Not found.** Both A001 and A007 fixtures include `pnpm-workspace.yaml` and a workspace package, which triggers the monorepo census path where rootDevDeps stays separate from allDeps. The spec's gotcha about this was properly followed.
3. *A003 gate test might use wrong approach* — **Not found.** Correctly uses no-package.json fixture so language resolves to null, never entering the Node.js gate.
4. *Module caching issues across dynamic imports* — **Not found.** Vitest handles module isolation properly across the test suite.
5. *Massive test count increase suggesting over-building* — **Not found.** The 21 total tests in the file include pre-existing Prisma (2) and package manager (11) tests. Builder added exactly 5 new TS tests plus 3 `@ana` tags on existing tests. No over-building.

**Surprise finding:** The implementation diff is remarkably small — 1 line modified (Tier 2 `hasTsDep` expansion) and 10 lines added (Tier 3 block). The test diff is proportional at ~100 lines for 5 new tests. No scope creep detected.

**What I didn't predict:** Whether the A001 and A007 tests actually exercise different code paths. Both create monorepo fixtures with `rootDevDeps.typescript`. The answer: they test the same Tier 2 path but assert different contract claims — A001 is "monorepo works" and A007 is "Tier 2 alone suffices without subdirectory tsconfigs." Same code path, different contract semantics. Acceptable.

## AC Walkthrough
- **AC1** (Budibase → TypeScript): ⚠️ PARTIAL — A001 test replicates the budibase pattern (monorepo, root devDeps typescript, no root tsconfig). Unit test passes. Cannot run against actual budibase repo in this session.
- **AC2** (Infisical → TypeScript): ⚠️ PARTIAL — A002 test replicates the infisical pattern (subdirectory tsconfig in `server/`). Unit test passes. Cannot run against actual repo.
- **AC3** (Tooljet → TypeScript): ⚠️ PARTIAL — A002 test replicates the tooljet pattern (subdirectory tsconfig). Tooljet uses `frontend/` specifically, but the test uses `server/` — both are in the `tsSubdirs` array. The `some()` logic is uniform across all entries.
- **AC4** (No regression on existing TS projects): ✅ PASS — A004, A005 are pre-existing tests that still pass. Full suite: 2780 passed.
- **AC5** (Non-Node unaffected): ✅ PASS — A003 test verifies the Node.js gate blocks non-Node languages from Tier 3 upgrade.
- **AC6** (Tier 3 short-circuited): ✅ PASS — Code inspection at `scan-engine.ts:864`: `if (!hasTsConfig && !hasTsDep)` ensures Tier 3 only runs when Tiers 1-2 miss.
- **AC7** (Unit test: rootDevDeps-only): ✅ PASS — A001 and A007 both test this. A007 explicitly excludes subdirectory tsconfigs.
- **AC8** (Unit test: subdirectory-tsconfig-only): ✅ PASS — A002 test covers this with `server/tsconfig.json`.
- **AC9** (Unit test: Node.js gate): ✅ PASS — A003 test covers this: no package.json + web/tsconfig.json → language stays non-TypeScript.
- **AC10** (Tests pass): ✅ PASS — `(cd 'packages/cli' && pnpm vitest run)`: 2780 passed, 2 skipped.
- **AC11** (No build errors): ✅ PASS — `pnpm run build` succeeds with clean typecheck.

## Blockers

No blockers. All 8 contract assertions satisfied. All 11 acceptance criteria pass (3 partially — verified by proxy through unit tests matching the described repository patterns, not against actual repos). No regressions. No unused exports in new code (no new exports added — changes are internal to `scanProject`). No unused parameters (no new function signatures). No error paths to exercise (the `existsSync`/`some()` chain has no throw behavior). No external state assumptions beyond filesystem layout (which is the feature's purpose).

## Findings

- **Code — Hardcoded subdirectory list inline in function body:** `packages/cli/src/engine/scan-engine.ts:865` — `['frontend', 'backend', 'server', 'web']` is a magic constant inside a 900+ line function. If additional subdirectory names need adding (e.g., `src`, `app`, `client`), a future engineer must find this buried array. The spec explicitly constrains to these four, so it's correct per contract — but extracting to a named constant at module scope would improve discoverability. Not a blocker; the list is intentionally conservative.

- **Test — A003 asserts negation not identity:** `packages/cli/tests/engine/detectors/detection-overrides.test.ts:121` — `.not.toBe('TypeScript')` matches the contract's `not_equals` matcher exactly, so it's contract-aligned. However, the test doesn't assert what language actually IS for a no-package.json project (likely `null`). A `.toBeNull()` assertion would be stronger — catching future regressions where language becomes something unexpected rather than just "not TypeScript." The current assertion passes whether language is `null`, `'Go'`, or `'Python'`.

- **Test — Only 2 of 4 subdirectory names exercised:** `packages/cli/tests/engine/detectors/detection-overrides.test.ts:98-168` — Tests use `server/` (A002) and `server/ + web/` (A008). The `frontend/` and `backend/` entries in the `tsSubdirs` array are never directly tested. Since `some()` applies the same logic uniformly across the array, this is logically sound — but if someone reorders or edits the array entries individually, the untested entries could silently break without detection.

- **Upstream — AC1-3 verifiable only by proxy:** The spec's AC1-3 reference real repositories (budibase, infisical, tooljet) as the motivation. The unit tests replicate the relevant filesystem patterns rather than scanning the actual repos. This is the right testing approach (unit tests shouldn't depend on external repos), but it means the fix is verified against the *described* pattern, not the actual repository layout. If any of those repos have additional structural quirks, they wouldn't be caught.

## Deployer Handoff

Minimal change — 1 line modified, 10 lines added in scan-engine.ts. 5 new test cases. No new dependencies, no new exports, no config changes.

The `tsSubdirs` array (`frontend`, `backend`, `server`, `web`) is intentionally limited. When users report missed TypeScript detection for repos with tsconfig in other subdirectories (e.g., `src/`, `app/`, `client/`), the fix is adding to that array at scan-engine.ts:865.

The branch is 2 commits behind main. Merge or rebase before merging the PR.

## Verdict
**Shippable:** YES

All 8 contract assertions satisfied by real integration tests calling `scanProject()` end-to-end. Implementation matches the spec exactly — no over-building, no scope creep. The three-tier detection (root tsconfig → root/workspace deps → subdirectory tsconfig) with the Node.js gate is clean and correct. 2780 tests pass with zero failures.
