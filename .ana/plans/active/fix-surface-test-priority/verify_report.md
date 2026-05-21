# Verify Report: Fix per-surface test command priority

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-20
**Spec:** .ana/plans/active/fix-surface-test-priority/spec.md
**Branch:** feature/fix-surface-test-priority

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-surface-test-priority/contract.yaml
  Seal: INTACT (hash sha256:de80e2fcca47ea395dad28e07a525f2aa73efe81b2e09b85b6ec9f43cd772a3a)
```

Seal: **INTACT**

Tests: 2717 passed, 0 failed, 2 skipped. Build: success. Lint: 0 errors, 1 pre-existing warning (unrelated file `git-operations.ts`).

## Contract Compliance

| ID   | Says                                                           | Status        | Evidence |
|------|----------------------------------------------------------------|---------------|----------|
| A001 | Surfaces with a test script use the developer's script instead of a direct runner command | ✅ SATISFIED | `monorepoCommandScoping.test.ts:122` — `expect(cliCmds['test']).toBe("(cd 'packages/cli' && pnpm run test)")` |
| A002 | Complex test scripts with setup steps are preserved, not overridden | ✅ SATISFIED | `monorepoCommandScoping.test.ts:334` — `expect(apiCmds['test']).toBe("(cd 'packages/api' && pnpm run test)")`, surface has `test: 'prisma:generate && vitest'` |
| A003 | Surfaces without a test script fall back to direct framework invocation | ✅ SATISFIED | `monorepoCommandScoping.test.ts:354` — `expect(apiCmds['test']).toBe("(cd 'packages/api' && pnpm vitest run)")`, surface has no test script |
| A004 | Surfaces with neither test script nor detected framework get no test command | ✅ SATISFIED | `monorepoCommandScoping.test.ts:129` — `expect(webCmds['test']).toBeNull()`, web surface has `testing: []` and no test script |
| A005 | Bun workspaces use the correct bun run prefix for script passthrough | ✅ SATISFIED | `monorepoCommandScoping.test.ts:377` — `expect(libCmds['test']).toBe("(cd 'packages/lib' && bun run test)")` |
| A006 | An empty test script is treated as present and uses script passthrough | ✅ SATISFIED | `monorepoCommandScoping.test.ts:397` — `expect(svcCmds['test']).toContain('run test')`, surface has `test: ''`. Contract matcher is `contains` — test matches. |
| A007 | Root-level test commands are not affected by this change | ✅ SATISFIED | `makeTestCommand.test.ts:160` — `expect(cmds['test']).toBe('pnpm run test -- --run')`. Root test command generated independently at state.ts:460-475, not touched by this change. |
| A008 | Build commands still use script passthrough as before | ✅ SATISFIED | `monorepoCommandScoping.test.ts:126` — `expect(cliCmds['build']).toBe("(cd 'packages/cli' && pnpm run build)")` |
| A009 | Existing merge behavior preserves user-customized test commands on re-init | ✅ SATISFIED | `monorepoCommandScoping.test.ts:461` — `expect(merged['cli']!.commands['test']).toBe('custom-user-test-command')` |
| A010 | The web surface with no test script and empty testing array gets null | ✅ SATISFIED | `monorepoCommandScoping.test.ts:129` — `expect(webCmds['test']).toBeNull()`, web surface in A001-A004 test has `testing: []` and no test script in `setupPackage` |

## Independent Findings

**Predictions made before reading code:**

1. *"Builder probably used a truthy check instead of !== undefined for the empty-string case"* — **Not found.** Builder correctly used `scripts['test'] !== undefined` which handles empty string per spec.
2. *"Builder probably forgot to update assertions in other test files"* — **Confirmed (partially).** `makeTestCommand.test.ts` was also updated (2 assertion changes), which is correct behavior but this file wasn't in the contract's `file_changes`.
3. *"Builder probably modified `buildDirectTestCommand`"* — **Not found.** Function untouched, as spec required.
4. *"Test for empty-string case probably uses a weak assertion"* — **Confirmed.** A006 test uses `toContain('run test')` instead of exact `toBe`. However, this matches the contract's `contains` matcher — the weakness is in the contract, not the test.
5. *"Builder probably didn't consider scripts.test set to explicit null in package.json"* — **Confirmed as latent.** `scripts['test'] !== undefined` treats `test: null` as "present" and generates `pnpm run test` for it. In practice, `test: null` in package.json is vanishingly rare and npm/pnpm would error on it too, so this is observation-level, not a blocker.

**Production risk:** A malicious or malformed `surface.path` containing shell metacharacters (`;`, `$()`, etc.) would be injected unsanitized into the subshell command. This is a **pre-existing risk** documented in proof context as `monorepo-build-scoping-C5` and `flip-monorepo-commands-C4`. The new code follows the identical pattern and doesn't worsen the risk, but it inherits it.

## AC Walkthrough

- [x] **AC1:** Surface with a `test` script gets `(cd 'path' && {pm} run test)` regardless of detected testing framework.
  ✅ PASS — Verified by A001 test (line 122) and A002 test (line 334). Both surfaces have detected frameworks (`Vitest`) but get script passthrough.

- [x] **AC2:** Surface with no `test` script but a detected testing framework gets `(cd 'path' && {runner} {framework} {flags})`.
  ✅ PASS — Verified by A003 test (line 354). Surface has no test script, `testing: ['Vitest']`, gets `pnpm vitest run`.

- [x] **AC3:** Surface with neither test script nor detected framework gets `null` test command.
  ✅ PASS — Verified by A004/A010/A026 tests (lines 129, 417). Web surface with `testing: []` and no test script gets `null`.

- [x] **AC4:** Root command generation (`commands.test`) is unchanged.
  ✅ PASS — `state.ts` lines 460-475 not touched. `makeTestCommand.test.ts:160` verifies root command is `pnpm run test -- --run`.

- [x] **AC5:** Existing tests pass. New tests cover: complex script passthrough, fallback to direct invocation, bun package manager, empty-string test script.
  ✅ PASS — 4 new tests at lines 322, 342, 362, 385. All 26 tests pass in the file. 2717 total tests pass.

- [x] **No build errors.**
  ✅ PASS — `pnpm run build` succeeds cleanly.

- [x] **2713+ tests pass (baseline: 2713 passed, 2 skipped).**
  ✅ PASS — 2717 passed, 2 skipped (2719 total). 4 new tests as expected.

## Blockers

No blockers. All 10 contract assertions satisfied. All 7 acceptance criteria pass. No regressions (2717 passed vs 2713 baseline). Checked for: unused exports in new code (no new exports), unhandled error paths (existing catch block at line 534 handles package.json failures), dead code (old `else if` branch cleanly removed), and sentinel test patterns (all new tests assert specific string values, not just existence).

## Findings

- **Code — `!== undefined` admits explicit null:** `packages/cli/src/commands/init/state.ts:518` — `scripts['test'] !== undefined` treats an explicit `test: null` in package.json as "script present," generating `pnpm run test` for a null script. In practice this is academic — npm/pnpm would also error — but `!== undefined && scripts['test'] !== null` would be more precise. Observation-level.

- **Code — Extra file modified outside contract scope:** `packages/cli/tests/commands/init/makeTestCommand.test.ts` — Two assertions updated from direct-invocation expectations to script-passthrough expectations. This file isn't in the contract's `file_changes` list. The changes are correct (tests now validate the new behavior instead of the old broken behavior), but it's scope creep by the builder.

- **Code — Path injection inherited from prior work:** `packages/cli/src/commands/init/state.ts:519` — `surface.path` injected into shell string without sanitization. Pre-existing risk (proof chain: `monorepo-build-scoping-C5`, `flip-monorepo-commands-C4`). This build doesn't worsen it but doesn't fix it either. Still active.

- **Test — A006 assertion weaker than peers:** `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts:397` — Uses `toContain('run test')` while all other new tests use exact `toBe`. Matches the contract's `contains` matcher, so the weakness is upstream (contract level). The test would pass if the command had extra unexpected suffixes.

- **Test — Setup boilerplate continues to accumulate:** `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` — All 4 new tests repeat the `mkdtemp`/`try`/`finally`/`rm` pattern. Follows existing convention (proof chain: `monorepo-build-scoping-C4`) but the file now has 26 tests with identical boilerplate. Growing candidate for `beforeEach`/`afterEach` extraction.

- **Upstream — Contract A006 uses `contains` matcher inconsistently:** All other contract assertions use `equals` or `exists`. A006's `contains` is looser and doesn't verify the full command string. If the intent is to verify the exact command, `equals` with the full string would be more precise.

## Deployer Handoff

Clean, minimal change. The production diff is 7 lines — a conditional inversion in `state.ts`. The builder also correctly updated 2 assertions in `makeTestCommand.test.ts` that validated the old (broken) behavior, though this file wasn't listed in the contract.

The `makeTestCommand.test.ts` changes are safe to merge — they align the tests with the new correct behavior. The lint warning on `git-operations.ts` is pre-existing and unrelated.

This change only affects `ana init` for new surfaces. Existing user configurations are protected by `mergeSurfaces`/`preserveUserState`. No migration needed.

## Verdict
**Shippable:** YES

All 10 contract assertions satisfied. All 7 acceptance criteria pass. 2717 tests pass (4 net new). The production change is a clean 7-line conditional inversion that mirrors the existing build command pattern. The only scope addition (updating `makeTestCommand.test.ts`) is correct and necessary — those tests would have failed without the update.
