# Verify Report: Flip Monorepo Command Semantics

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-17
**Spec:** .ana/plans/active/flip-monorepo-commands/spec.md
**Branch:** feature/flip-monorepo-commands

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/flip-monorepo-commands/.ana/plans/active/flip-monorepo-commands/contract.yaml
  Seal: INTACT (hash sha256:91bdf99d8722ed973499c73ea2571d315edbcbcff9f0406efd9d0695c3d0535b)
```

Seal: **INTACT**

Tests: 2462 passed, 0 failed, 2 skipped (107 test files). Build: success. Lint: success (2 tasks).

Checkpoint test: `monorepoCommandScoping.test.ts` — 16 passed (12 rewritten + 4 new), matches spec expectation.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Monorepo build command is project-wide, not scoped to primary package | ✅ SATISFIED | `monorepoCommandScoping.test.ts:94` asserts `cmds['build']` === `'pnpm run build'`; line 278 also asserts `'npm run build'` for npm variant |
| A002 | Monorepo buildPackage contains the scoped command for primary package | ✅ SATISFIED | `monorepoCommandScoping.test.ts:95` asserts `cmds['buildPackage']` === `'(cd packages/cli && pnpm run build)'`; line 206 tests compile key variant |
| A003 | Monorepo test command is project-wide non-interactive | ✅ SATISFIED | `monorepoCommandScoping.test.ts:306` asserts `cmds['test']` does not contain `'(cd '` |
| A004 | Monorepo testPackage contains the scoped test command | ✅ SATISFIED | `monorepoCommandScoping.test.ts:309` asserts `cmds['testPackage']` === `'(cd apps/web && pnpm vitest run)'` |
| A005 | Single-package projects have no buildPackage or testPackage fields | ✅ SATISFIED | `monorepoCommandScoping.test.ts:171-172` asserts both `toBeUndefined()` |
| A006 | buildPackage is omitted when its value would be identical to build | ✅ SATISFIED | `monorepoCommandScoping.test.ts:327` asserts `buildPackage` is `undefined` when root build is set to the scoped value |
| A007 | testPackage is omitted when its value would be identical to test | ✅ SATISFIED | `monorepoCommandScoping.test.ts:348-349` asserts `test` is null and `testPackage` is undefined. Weaker than "identical strings" but functionally correct — see Findings |
| A008 | Build command stays root when primary package has no build script | ✅ SATISFIED | `monorepoCommandScoping.test.ts:129` asserts `cmds['build']` === `'pnpm run build'` with no build script in primary pkg |
| A009 | buildPackage not written when primary package has no build script | ✅ SATISFIED | `monorepoCommandScoping.test.ts:131` asserts `cmds['buildPackage']` is `undefined` |
| A010 | New command keys appear on re-init without overwriting existing customizations | ✅ SATISFIED | `monorepoCommandScoping.test.ts:415-416` asserts `buildPackage` and `testPackage` propagated from fresh config to merged result |
| A011 | Existing user-customized commands survive re-init unchanged | ✅ SATISFIED | `monorepoCommandScoping.test.ts:413` asserts `build` stays `'custom-build-command'`; line 478 asserts `buildPackage` stays `'my-custom-package-build'` |
| A012 | Empty string buildPackage is rejected by config validation | ✅ SATISFIED | Source inspection: `config.ts:328` — COMMAND_FIELDS includes `'commands.buildPackage'`. Line 329 checks `value === ''` and exits with code 1. No dedicated test — see Findings |
| A013 | Empty string testPackage is rejected by config validation | ✅ SATISFIED | Source inspection: `config.ts:328` — COMMAND_FIELDS includes `'commands.testPackage'`. Same rejection logic as A012 |
| A014 | Build template instructs using commands.build for project build | ✅ SATISFIED | `ana-build.md:107` — "Run `commands.build` from ana.json first to compile the project" |
| A015 | Build template instructs using Build Brief for test checkpoints, not commands.test | ✅ SATISFIED | `ana-build.md:372` — `{checkpoint test command from Build Brief}`. Grep confirms `{test command from ana.json commands.test}` does NOT appear in the file |
| A016 | Verify template uses Build Brief checkpoint commands for test verification | ✅ SATISFIED | `ana-verify.md:173` — `{checkpoint test command from Build Brief's Verification Commands section}`. Grep confirms `{test command from ana.json commands.test}` does NOT appear |
| A017 | Plan template references commands.test for full baseline runs | ✅ SATISFIED | `ana-plan.md:427` — "Run `commands.test` from `ana.json` and record exact counts" |
| A018 | Dogfood build template is byte-identical to product template | ✅ SATISFIED | `diff packages/cli/templates/.claude/agents/ana-build.md .claude/agents/ana-build.md` — exit 0 |
| A019 | Dogfood verify template is byte-identical to product template | ✅ SATISFIED | `diff packages/cli/templates/.claude/agents/ana-verify.md .claude/agents/ana-verify.md` — exit 0 |
| A020 | Dogfood plan template is byte-identical to product template | ✅ SATISFIED | `diff packages/cli/templates/.claude/agents/ana-plan.md .claude/agents/ana-plan.md` — exit 0 |
| A021 | Troubleshooting docs reference the new command semantics | ✅ SATISFIED | `troubleshooting.mdx:41` contains `buildPackage` and `testPackage` with project-wide context |
| A022 | Quickstart callout describes commands as project-wide | ✅ SATISFIED | `start.mdx:44` — "These are project-wide commands. For monorepos, `buildPackage` and `testPackage` target your primary package specifically." |
| A023 | Lint command stays scoped in monorepos (not flipped) | ✅ SATISFIED | `monorepoCommandScoping.test.ts:112` asserts `cmds['lint']` === `'(cd packages/cli && pnpm run lint)'` |

## Independent Findings

**Predictions resolved:**

1. *"Builder may have missed edge case in 'only when different' comparison"* — **Not found.** The comparison at `state.ts:464-468` uses strict `!==` on the computed strings. Both A006 and A007 test the omission path. The A006 test sets root build to the same value scoping would produce.

2. *"preserveUserState propagation loop might miss null/undefined filtering"* — **Not found.** Line 583 checks `freshCommands[key] != null && freshCommands[key] !== ''` — null, undefined, and empty string all filtered.

3. *"Builder may have left stale references to commands.test in templates"* — **Not found.** Grep for `{test command from ana.json commands.test}` returned zero hits across all three product templates and all three dogfood copies.

4. *"Dogfood sync might have subtle whitespace difference"* — **Not found.** `diff` exit code 0 on all three pairs.

5. *"Builder may have accidentally flipped lint"* — **Not found.** Lint stays scoped: `state.ts:444-450` writes `lintCmd` (not `lintPackageCmd`), and test A023 at line 112 asserts `(cd packages/cli && pnpm run lint)`.

**Surprise finding:** The builder also modified `makeTestCommand.test.ts` — not in the contract's `file_changes` list. This was necessary: those tests asserted the OLD behavior where `test` was the scoped command. The builder correctly updated 3 test assertions to expect `test` as root + `testPackage` as scoped. This is a reasonable adaptation, not scope creep.

**Production risk predictions:**
1. *"testPackage with wrong path for non-standard monorepo"* — Not a new risk. The path comes from `result.monorepo.primaryPackage.path`, same as before the flip. The flip doesn't change path resolution.
2. *"Propagation loop conflicts with manual edits"* — **Partially confirmed.** The loop iterates `Object.keys(freshCommands)` which includes ALL keys in the commands object from `createAnaJson` — that's `build`, `test`, `lint`, `dev`, and conditionally `buildPackage`/`testPackage`. The `in` check prevents overwriting, so no corruption risk. But if `freshCommands` contained unexpected keys (e.g., if a future change adds `'all'` to the commands object), those would propagate too. Low risk — the input is controlled by `createAnaJson`.

## AC Walkthrough

- **AC1:** For monorepos, `build` and `test` in ana.json are project-wide root commands (no `(cd ...` prefix). ✅ PASS — `state.ts:400-401` keeps `testCmd` as root non-interactive; `state.ts:421` keeps `buildCmd` as root. Tests at lines 94 and 306 confirm.

- **AC2:** For monorepos, `buildPackage` and `testPackage` contain the primary-package-scoped commands, and only appear when they differ from `build`/`test`. ✅ PASS — `state.ts:464-468` writes only when different. Tests A001 (line 95), A004 (line 309), A006 (line 327) confirm.

- **AC3:** For single-package projects, only `build`, `test`, `lint`, `dev` exist. No `buildPackage`/`testPackage`. ✅ PASS — Test A005 (line 171-172) asserts both undefined for non-monorepo.

- **AC4:** Worktree `runBuildCommand` continues to read `commands.build` directly. ✅ PASS — `git diff main...HEAD -- packages/cli/src/commands/worktree.ts` shows no changes. `commands.build` now contains the project-wide command, which is correct.

- **AC5:** Build template says "use `commands.build`" for project build; Build Brief checkpoint commands are authoritative. ✅ PASS — `ana-build.md:107` and `ana-build.md:372` confirmed.

- **AC6:** Verify template uses `commands.build` for build step; Build Brief checkpoint commands for test verification. ✅ PASS — `ana-verify.md:172-173` confirmed.

- **AC7:** Plan template references `commands.test` for full baseline runs; uses `commands.testPackage` as starting point for checkpoints. ✅ PASS — `ana-plan.md:420` and `ana-plan.md:427` confirmed.

- **AC8:** `preserveUserState` propagation loop: new command keys appear on re-init without overwriting existing values. ✅ PASS — Tests A010 (line 415-416) and A011 (line 478) confirm. Source at `state.ts:578-586`.

- **AC9:** `ana config set commands.buildPackage ""` is rejected. ✅ PASS — COMMAND_FIELDS at `config.ts:328` includes both new fields. Rejection logic at line 329-334.

- **AC10:** Troubleshooting docs and quickstart callout reflect new command semantics. ✅ PASS — `troubleshooting.mdx:41,69,71` and `start.mdx:44` verified.

- **AC11:** Dogfood templates byte-identical to product templates. ✅ PASS — `diff` exit 0 on all three pairs.

- **Tests pass:** ✅ PASS — 2462 passed, 0 failed, 2 skipped (107 files). Matches baseline + 4 new tests.

- **No build errors:** ✅ PASS — `pnpm run build` succeeds, ESM output.

## Blockers

No blockers. All 23 contract assertions satisfied. All 13 acceptance criteria pass. No regressions (2462 tests pass vs 2458 baseline + 4 new). Build and lint clean.

Checked for: unused exports in new code (no new exports beyond `preserveUserState` which was already exported and is imported by tests), unused parameters (none — all function signatures unchanged or use all params), error paths that swallow silently (`state.ts:451` catch block is intentionally empty for graceful degradation — pre-existing pattern), and dead code (no new unreachable branches).

## Findings

- **Test — No dedicated test for empty-string buildPackage/testPackage rejection:** `packages/cli/src/commands/config.ts:328` — A012/A013 verified by source inspection only. The COMMAND_FIELDS array includes the new fields and the rejection logic is shared with existing fields, but there's no test exercising `ana config set commands.buildPackage ""` end-to-end. Existing config tests cover the shared rejection path for other fields, making this low risk but still a coverage gap.

- **Test — A007 tests null equality, not string equality:** `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts:334` — The contract says "testPackage is omitted when its value would be identical to test." The test achieves this by setting `test` to null (so testPackageCmd is also null), which technically satisfies "identical" but doesn't exercise the string-comparison branch at `state.ts:467`. The A006 test does exercise string comparison for buildPackage, and the code paths are symmetric, so the risk is low.

- **Code — Unlisted file change (makeTestCommand.test.ts):** `packages/cli/tests/commands/init/makeTestCommand.test.ts` — Not in the contract's `file_changes`, but the builder correctly updated 3 existing test assertions and descriptions to match the new semantics. The old assertions would have failed after the flip. Reasonable adaptation.

- **Code — pkg.path unsanitized in new variables:** `packages/cli/src/commands/init/state.ts:412,439` — `testPackageCmd` and `buildPackageCmd` inject `pkg.path` into shell commands without sanitization. This is the same known risk documented in `monorepo-build-scoping-C5` — now applied to two additional code paths. Paths with spaces or special chars would produce broken subshell commands. Not a regression (same pattern as the existing lint scoping), but the attack surface grew.

- **Upstream — Contract A005 matcher encoding is confusing:** Contract says `matcher: "not_equals"`, `value: "undefined"` for "Single-package projects have no buildPackage." The `says` field is clear (no field), but the mechanical encoding reads as "buildPackage should not equal the string 'undefined'" — which is always true. The test correctly asserts `toBeUndefined()`. The assertion intent is right; the encoding is misleading.

- **Code — Propagation loop iterates all freshCommands keys:** `packages/cli/src/commands/init/state.ts:582` — `Object.keys(freshCommands)` includes every key from the `commands` object produced by `createAnaJson`. Today that's `build`, `test`, `lint`, `dev`, and conditionally `buildPackage`/`testPackage` — all safe to propagate. If future changes add non-command keys to the `commands` object, they'd propagate too. The `in` check prevents overwriting, so no data corruption risk, but unexpected keys could appear in older configs after re-init. Accepted — the input is controlled by `createAnaJson`.

## Deployer Handoff

This is a semantics flip — `commands.build` and `commands.test` change from scoped to project-wide. Existing users on re-init get `buildPackage`/`testPackage` automatically via the propagation loop. Users who manually set `commands.build` to a scoped value won't be affected (preserveUserState doesn't overwrite).

After merge: run `ana init` on this repo to verify the new ana.json output matches the spec mockup (build/test are root, buildPackage/testPackage are scoped, lint stays scoped). The test suite covers this mechanically, but a live dogfood run confirms the full init flow.

Templates are already synced. No migration needed for existing `.claude/agents/` files in user projects — the template changes only affect new `ana init` runs.

## Verdict
**Shippable:** YES

All 23 contract assertions satisfied. All 13 acceptance criteria pass. 2462 tests green, build and lint clean. The core implementation is clean — variable splitting is correct, comparison logic prevents redundant fields, propagation loop is additive-only. Template changes are consistent across all 6 files. Findings are observation-grade (test coverage gaps, known unsanitized paths, confusing contract encoding) — none prevent shipping.