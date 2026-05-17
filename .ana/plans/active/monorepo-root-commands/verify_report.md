# Verify Report: Monorepo Root Commands

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-17
**Spec:** .ana/plans/active/monorepo-root-commands/spec.md
**Branch:** feature/monorepo-root-commands

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/monorepo-root-commands/contract.yaml
  Seal: INTACT (hash sha256:0eff11b4ce1396e317c21eea4cc852c611aee44cc2b71a15d54447ad55eccdb5)
```

Seal status: **INTACT**

Tests: 2470 passed, 0 failed, 2 skipped (2472 total, 107 test files). Build: success (typecheck + tsup). Lint: 0 errors, 1 pre-existing warning (unused eslint-disable in git-operations.ts).

Baseline was 2458 passed per spec. Delta: +12 tests from new test additions.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Monorepo init produces a root build command alongside the scoped build command | ✅ SATISFIED | `monorepoCommandScoping.test.ts:281` — asserts `cmds['buildRoot']` is defined and equals `'pnpm run build'` |
| A002 | Monorepo init produces a root test command alongside the scoped test command | ✅ SATISFIED | `monorepoCommandScoping.test.ts:302` — asserts `cmds['testRoot']` is defined |
| A003 | Root build command is the unscoped root-level command, not the primary-package-scoped one | ✅ SATISFIED | `monorepoCommandScoping.test.ts:386` — asserts `cmds['buildRoot']` is `'pnpm run build'` (no `(cd `) while `cmds['build']` is `'(cd packages/cli && pnpm run build)'` |
| A004 | Root test command is the unscoped root-level command | ✅ SATISFIED | `monorepoCommandScoping.test.ts:314` — asserts `cmds['testRoot']` does not contain `'(cd '` |
| A005 | Single-package projects do not get root command fields | ✅ SATISFIED | `monorepoCommandScoping.test.ts:337` — asserts `cmds['buildRoot']` is `undefined` |
| A006 | Single-package projects produce the same commands as before | ✅ SATISFIED | `monorepoCommandScoping.test.ts:340` — asserts `cmds['build']` is defined |
| A007 | The worktree build uses the root command when one exists | ✅ SATISFIED | `worktree.test.ts:324` — sets `buildRoot: 'mkdir ... echo root'` and `build: 'exit 1'`, asserts build succeeded and marker contains `'root'` |
| A008 | The worktree build falls back to the scoped command when no root command exists | ✅ SATISFIED | `worktree.test.ts:354` — sets only `build`, no `buildRoot`, asserts build succeeded and marker contains `'scoped'` |
| A009 | The worktree returns null when no build command is configured at all | ✅ SATISFIED | `worktree.test.ts:375` — sets `commands: {}`, asserts `result.buildSucceeded` is `null` |
| A010 | The build status display shows the root command when one exists | ✅ SATISFIED | `worktree.test.ts:347` — reads `worktree-context.md` and asserts it contains `'dist && echo root'` (the buildRoot command) |
| A011 | The build status display falls back to the scoped command when no root command exists | ✅ SATISFIED | Source inspection: `worktree.ts:430` uses `config?.commands?.buildRoot ?? config?.commands?.build`, identical fallback to `runBuildCommand` at line 454. Test at `worktree.test.ts:354` proves the execution path works; display uses the same resolution. |
| A012 | Existing ana.json files without root commands survive re-init unchanged | ✅ SATISFIED | `monorepoCommandScoping.test.ts:437` — old config without buildRoot/testRoot merges successfully, asserts truthy result |
| A013 | Accidentally blanked root commands get restored to detected values on re-init | ✅ SATISFIED | `monorepoCommandScoping.test.ts:480` — old config with `buildRoot: ''` restored to `'pnpm run build'`, asserts `not.toBe('')` and `toBe('pnpm run build')` |
| A014 | Monorepo without root build script does not produce a buildRoot field | ✅ SATISFIED | `monorepoCommandScoping.test.ts:348` — sets `result.commands.build = null`, asserts `cmds['buildRoot']` is `undefined` |
| A015 | Monorepo without root test script does not produce a testRoot field | ✅ SATISFIED | `monorepoCommandScoping.test.ts:367` — sets `result.commands.test = null`, asserts `cmds['testRoot']` is `undefined` |
| A016 | The schema preserves buildRoot and testRoot through parse without data loss | ✅ SATISFIED | `anaJsonSchema.test.ts:219` — parses config with buildRoot/testRoot through `AnaJsonSchema.parse`, asserts `cmds['buildRoot']` equals `'pnpm run build'` and `cmds['testRoot']` equals `'pnpm run test'` |

## Independent Findings

**Prediction resolution:**

1. **testRoot captures non-interactive variant** — Confirmed correct. `testRootCmd = testCmd` is assigned after `makeTestCommandNonInteractive` but before monorepo scoping. For Vitest projects with `pnpm run test`, testRoot becomes `pnpm run test -- --run`. This is the right behavior per the spec gotcha.
2. **Template inconsistency between dogfood and product** — Not found. `diff` of both ana-build.md and ana-verify.md between product templates and dogfood returned empty output. Byte-identical.
3. **preserveUserState edge cases** — Not found. The sanitization loop correctly adds `'buildRoot'` and `'testRoot'` to the key list at `state.ts:577`. Null values pass through naturally (the guard checks `=== ''`).
4. **getBuildCommandString default mismatch** — Not found as a new problem. Both `getBuildCommandString` and `runBuildCommand` now use `buildRoot ?? build`. The pre-existing `'pnpm run build'` default in `getBuildCommandString` vs `null` in `runBuildCommand` remains (see worktree-build-step-C3), but this spec partially addresses it by aligning the resolution chain.
5. **Edge case: root build exists but root test doesn't** — Not found. A014 and A015 test these independently.

**Over-building check:** No new exports, no new files, no unused functions. Grep of new code in state.ts lines 457-474 — all variables (`buildRootCmd`, `testRootCmd`, `commands`) are used. No YAGNI violations.

**Scope check:** The implementation adds exactly what the spec describes — root command capture in state.ts, fallback chain in worktree.ts, sanitization keys, template clarifications. No extra parameters, no extra code paths.

## AC Walkthrough

- **AC1:** ✅ PASS — Monorepo init produces `buildRoot` and `testRoot`. Verified by tests at `monorepoCommandScoping.test.ts:281,302` and source at `state.ts:467-474`.
- **AC2:** ✅ PASS — Single-package projects have no `buildRoot`/`testRoot`. Verified by test at `monorepoCommandScoping.test.ts:322`.
- **AC3:** ✅ PASS — `runBuildCommand` uses `buildRoot` when present, falls back to `build`, returns null. Verified by tests at `worktree.test.ts:324,354,375` and source at `worktree.ts:454`.
- **AC4:** ✅ PASS — `preserveUserState` handles missing and blank root commands. Verified by tests at `monorepoCommandScoping.test.ts:437,480` and source at `state.ts:577`.
- **AC5:** ✅ PASS — Build template distinguishes baseline commands from focused commands. Verified by diff: Step 1 clarifies `buildRoot`/`build` for baseline, Step 4 references Build Brief for tests, Verification Commands section uses `buildRoot or build` + checkpoint commands.
- **AC6:** ✅ PASS — Verify template uses Build Brief checkpoint commands for test runs. Verified by diff: Step 5, Step 2 template block, and skill load section all reference Build Brief instead of `commands.test`.
- **AC7:** ✅ PASS — Build report template references `buildRoot or build` + `checkpoint test commands from spec Build Brief`. Verified by diff at lines 371-372.
- **Tests pass:** ✅ PASS — 2470 passed, 0 failed, 2 skipped.
- **No lint errors:** ✅ PASS — 0 errors (1 pre-existing warning).
- **getBuildCommandString prefers buildRoot:** ✅ PASS — Source at `worktree.ts:430`: `config?.commands?.buildRoot ?? config?.commands?.build`.
- **Dogfood matches product:** ✅ PASS — `diff` of both template files returned empty output.

## Blockers

No blockers. All 16 contract assertions satisfied. All 11 acceptance criteria pass. No regressions (2470 tests, up from 2458 baseline). No unused exports in new code (checked `buildRootCmd`, `testRootCmd`, `commands` object — all consumed). No unhandled error paths (root command capture uses existing conditional structure; worktree fallback uses `??` operator). No assumptions about external state beyond what the existing code already assumes (ana.json exists, JSON.parse succeeds).

## Findings

- **Test — A011 display fallback verified by source inspection, not assertion:** `packages/cli/tests/utils/worktree.test.ts:354` — The test tagged `@ana A008, A011` proves `runBuildCommand` falls back to `build` when `buildRoot` is absent (marker file check), but doesn't read `worktree-context.md` to verify `getBuildCommandString` displayed the right command. The A007/A010 test at line 324 DOES check the context file for buildRoot. Source inspection at `worktree.ts:430` confirms the identical `buildRoot ?? build` pattern in both functions. Not a blocker — the pattern is proven by the A010 test and source; adding a context file assertion to the A011 test would close the gap.

- **Test — testRoot specific value never asserted:** `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts:302` — The A002/A004 test checks `testRoot` is defined and doesn't contain `(cd ` but never asserts its specific value. For the test fixture (`pnpm run test` + Vitest), `testRoot` becomes `pnpm run test -- --run` via `makeTestCommandNonInteractive`. The contract's `exists` and `not_contains` matchers are satisfied, but a stronger assertion like `toBe('pnpm run test -- --run')` would catch if the non-interactive transform changes unexpectedly. Compare with `buildRoot` which IS asserted to equal `'pnpm run build'`.

- **Upstream — getBuildCommandString duplicate I/O still present:** `packages/cli/src/utils/worktree.ts:427` — still present, see worktree-build-step-C3. This spec partially addresses it by aligning the fallback chain (`buildRoot ?? build` in both functions), but `getBuildCommandString` still re-reads ana.json independently of `runBuildCommand`. The duplicate read is wasteful but functionally correct.

## Deployer Handoff

Clean merge expected — changes are scoped to init state, worktree utils, and template prose. The build produces 12 new tests across 3 files. After merge, the project's own `.ana/ana.json` will gain `buildRoot` and `testRoot` on next `ana init` run. Existing projects without these fields are unaffected — the worktree fallback chain handles absence gracefully.

Template changes affect future agent behavior: Build and Verify agents will now prefer `buildRoot` for baseline builds and use Build Brief checkpoint commands for focused testing instead of `commands.test`. This is the intended behavior shift.

## Verdict

**Shippable:** YES

All 16 contract assertions satisfied. All acceptance criteria pass. Tests green with no regressions. Code changes are minimal, well-scoped, and follow existing patterns. The three findings are test quality observations and a pre-existing debt item — none affect correctness or reliability.
