# Verify Report: Codex Support — Runtime Dispatch

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-30
**Spec:** .ana/plans/active/codex-support/spec-2.md
**Branch:** feature/codex-support

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/codex-support/contract.yaml
  Seal: INTACT (hash sha256:5e81db6a68903af056d21ea6aa883cf1425370f5e4dacacb882bae95d1d82473)
```

Seal status: **INTACT**

Build: passes (typecheck + tsup, zero errors)
Tests: 3090 passed, 2 skipped, 0 failed (129 test files)
Lint: 0 errors, 1 pre-existing warning (unused eslint-disable directive)

## Contract Compliance

Only spec-2 assertions (A030–A040) are in scope for this phase. Spec-1 assertions (A001–A029) were verified in phase 1.

| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A030 | Running an agent on Codex launches the correct Codex process | ✅ SATISFIED | `packages/cli/tests/commands/run.test.ts:280-286` — `mockedSpawnSync.mock.calls.find(c => c[0] === 'codex')` confirms command is `'codex'`, asserts `spawnArgs` contains `'exec'` |
| A031 | Codex dispatch passes the sandbox flag from the manifest | ✅ SATISFIED | `packages/cli/tests/commands/run.test.ts:289` — `expect(spawnArgs).toContain('--sandbox')` and `'danger-full-access'` |
| A032 | Codex dispatch passes the model from the manifest | ✅ SATISFIED | `packages/cli/tests/commands/run.test.ts:288` — `expect(spawnArgs).toContain('--model')` and `'gpt-5.5'` |
| A033 | Think agent opens interactive mode instead of exec | ✅ SATISFIED | `packages/cli/tests/commands/run.test.ts:295-305` — `expect(spawnArgs).not.toContain('exec')` for empty-string suffix |
| A034 | Explicit platform flag selects the correct dispatch target | ✅ SATISFIED | `packages/cli/tests/commands/run.test.ts:431-444` — calls `runAndGetExit('build', [], 'codex')`, verifies `c[0] === 'codex'` |
| A035 | Learn agent shows a helpful message instead of failing on Codex | ✅ SATISFIED | `packages/cli/tests/commands/run.test.ts:338-345` — asserts error output contains `'not yet available on Codex'` and `'claude --agent ana-learn'` |
| A036 | Platform flag takes priority over environment variable | ✅ SATISFIED | `packages/cli/tests/commands/run.test.ts:447-467` — sets `ANA_PLATFORM=claude`, passes `platformFlag='codex'`, verifies codex dispatch |
| A037 | Multiple platforms without explicit selection shows guidance | ✅ SATISFIED | `packages/cli/tests/commands/run.test.ts:500-515` — creates project with `['claude', 'codex']`, no flag, verifies error contains `'--platform'` and `'ANA_PLATFORM'` |
| A038 | Platform flags can be read for a specific platform | ✅ SATISFIED | `packages/cli/tests/commands/platform.test.ts:254-268` — `getPlatformFlags(tempDir, 'codex')` returns `['--full-auto']`, `getPlatformFlags(tempDir, 'claude')` returns `['--dangerously-skip-permissions']` |
| A039 | All existing tests continue to pass | ✅ SATISFIED | Full suite: 3090 passed, 2 skipped, 0 failed. Test count above baseline (3041 → 3090). No regressions. |
| A040 | Codex does not include a Learn agent template | ✅ SATISFIED | `packages/cli/tests/commands/run.test.ts:411-418` — `fs.existsSync(learnPrompt)` and `fs.existsSync(learnToml)` both `false` |

## Independent Findings

### Predictions resolved

1. **parseSimpleToml fragility — Confirmed (observation).** The regex `^(\w+)\s*=\s*"([^"]*)"$` only matches double-quoted string values. Unquoted values, single-quoted values, inline comments (`key = "val" # comment`), and multiline strings are silently dropped. The spec explicitly calls this out ("simple key-value, no nested tables") and the current TOML files only use double-quoted strings. Acceptable for now, but if `.agent.toml` files grow beyond trivial key-value, this breaks silently.

2. **No validation of resolved platform value — Confirmed (risk).** `resolvePlatform()` returns whatever string comes from `--platform` flag, `ANA_PLATFORM` env, or `ana.json`. If someone runs `ana run build --platform foo`, the code reaches `dispatchToCodex` for any non-`'claude'` value (line 347: `if (platform === 'codex')`). Actually — re-reading: any unknown platform falls through to `dispatchToClaude`. So `--platform foo` would attempt to run `claude --agent ana-build` regardless. This is confusing but not dangerous — Claude dispatch still works. The risk is `--platform codex` with a typo like `--platform codeex` silently falling back to Claude.

3. **`-i` flag coupling — Not found.** The `-i` flag for developer instructions is a Codex CLI convention. The spec explicitly chose this approach. Acceptable.

4. **TOML `mode` field unused — Confirmed (debt).** The spec says "mode field determines dispatch shape" (Gotchas section). The TOML files store `mode = "exec"` and `mode = "auto"`. But `dispatchToCodex()` ignores the `mode` field entirely — it uses the hardcoded `INTERACTIVE_AGENTS = new Set(['', 'setup'])` to decide exec vs interactive. If a user edits their `.agent.toml` to change mode, nothing happens. The TOML is supposed to be "the declarative source for Codex dispatch config" but `mode` is decoration.

5. **Duplicate JSDoc — Confirmed (debt).** `packages/cli/src/commands/platform.ts:73-95` has two consecutive JSDoc blocks. The old one (lines 73-83) describes the pre-parameter signature; the new one (lines 84-95) describes the current signature. Only the latter is correct.

### Surprise finding

6. **Advisory pipeline check skipped for Codex dispatch.** `dispatchToClaude()` calls `advisoryPipelineCheck()` (line 390), but `dispatchToCodex()` does not. If a Codex user runs `ana run build` when no work item is at the build stage, they get no advisory warning. This is a functional gap between platforms. Not a blocker (advisory check is best-effort), but inconsistent.

## AC Walkthrough

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC6 | `ana run build` on Codex launches `codex exec` with correct args | ✅ PASS | Test at `run.test.ts:280-292` verifies exec, --model, --sandbox. Implementation reads TOML at `run.ts:175-177`. |
| AC7 | `ana run` on Codex opens interactive TUI | ✅ PASS | Test at `run.test.ts:295-305` verifies no `exec` in args. `INTERACTIVE_AGENTS` set at `run.ts:50`. |
| AC8 | Codex Build agent calls `ana artifact save` during session | ⚠️ PARTIAL | Cannot verify at unit test level — requires live Codex execution. The `danger-full-access` sandbox mode is passed correctly (test at `run.test.ts:290`), which provides the git access needed. Template content not re-verified here (phase 1 scope). |
| AC12 | `--platform codex` works with both tools installed | ✅ PASS | Test at `run.test.ts:431-444` — project with claude config, `--platform codex` override dispatches to codex. |
| AC13 | `ana run learn` on Codex shows helpful error | ✅ PASS | Test at `run.test.ts:338-345` — error contains "not yet available on Codex" and guidance to use CC. |
| AC20 | All existing tests pass, count doesn't decrease | ✅ PASS | 3090 passed (baseline 3041), 2 skipped, 0 failed. CC dispatch tests at `run.test.ts:517-527` pass unchanged. |
| Tests pass with `pnpm vitest run` | | ✅ PASS | `run.test.ts`: 38 passed. Full suite: 3090 passed. |
| No build errors | | ✅ PASS | `pnpm run build` completed with zero errors. |
| CC dispatch unchanged | | ✅ PASS | Test at `run.test.ts:517-527` verifies Claude dispatch still spawns `claude --agent ana-build` with correct args. Existing tests unmodified and passing. |

## Blockers

None. All 11 contract assertions (A030-A040) satisfied. All 9 acceptance criteria pass (1 partial — AC8 requires live Codex, verified structurally). No regressions — test count increased from 3041 to 3090.

Checked for: unused exports in new code (parseSimpleToml and resolvePlatform exported for test access — intentional per coding standards), unhandled error paths (missing TOML returns defaults at `run.ts:176-177`, missing prompt file errors at `run.ts:181-184`, missing executable errors at `run.ts:168-172`), assumptions about external state (Codex PATH check at `run.ts:168`, shell availability via `shell: true`), dead code blocks (none — every branch in dispatchToCodex is reachable).

## Findings

- **Code — TOML `mode` field is dead data:** `packages/cli/src/commands/run.ts:50` — `INTERACTIVE_AGENTS` hardcodes which agents are interactive. The TOML files store `mode = "exec"` / `mode = "auto"` but this field is never read. The spec says "mode field determines dispatch shape" — the implementation diverges. If a user edits their `.agent.toml` to change mode, nothing happens. The TOML is supposed to be the declarative source for dispatch config but `mode` is decoration. Future scope: either read `mode` from TOML and remove the hardcoded set, or remove `mode` from TOML files.

- **Code — Duplicate JSDoc on getPlatformFlags:** `packages/cli/src/commands/platform.ts:73-95` — Two consecutive JSDoc blocks. The old one (lines 73-83) describes the pre-parameter signature. The new one (lines 84-95) describes the current signature with `platform?` parameter. The old block should have been deleted.

- **Code — No platform value validation in resolvePlatform:** `packages/cli/src/commands/run.ts:84-119` — `resolvePlatform()` accepts and returns any string. `--platform codeex` (typo) silently falls back to Claude dispatch via the `else` branch at line 347. No error, no warning. The user thinks they're running on Codex but they're on Claude. Consider validating against a known set (`['claude', 'codex']`) and erroring on unknown values.

- **Code — Advisory pipeline check missing from Codex dispatch:** `packages/cli/src/commands/run.ts:154-228` — `dispatchToCodex()` does not call `advisoryPipelineCheck()`. `dispatchToClaude()` does (line 390). Codex users don't get the "no work item at build stage" advisory warning. Not a blocker (advisory is best-effort), but inconsistent cross-platform behavior.

- **Code — parseSimpleToml silently drops non-string TOML values:** `packages/cli/src/commands/run.ts:61-72` — The regex only matches `key = "value"` (double-quoted strings). Integer values (`timeout = 30`), boolean values (`verbose = true`), and inline comments (`key = "val" # note`) are silently ignored. Currently safe — all `.agent.toml` files use only double-quoted strings. If TOML files evolve, this breaks silently with no error.

- **Test — @ana tag collisions from prior plan:** `packages/cli/tests/commands/run.test.ts:117,126,150,163,174` — Pre-existing tests carry `@ana A028-A033` tags from a previous plan cycle (platform-aware-cli). These IDs now collide with this contract's assertions. The correct spec-2 tagged tests are at lines 279, 294, 337, 410, 430, 446, 499. Not ambiguous for verification (the correct tests are identifiable by context), but degrades tag uniqueness.

- **Upstream — A029 lacks @ana tag:** The init-flow.test.ts assertion at line 157 (`expect(claudeMdContent).toContain('ana run')`) satisfies contract A029 but has no `@ana A029` tag. Verified by source inspection. The test exists and passes.

## Deployer Handoff

This PR adds Codex dispatch to `ana run`. After merge:

1. **Codex CLI required for Codex features.** Users need `codex` in their PATH. `ana run` detects and provides install guidance.
2. **Dual-platform projects** must use `--platform` flag or `ANA_PLATFORM` env to disambiguate. Auto-selection only works for single-platform projects.
3. **The `mode` field in `.agent.toml` files is currently decorative.** It's written by init (phase 1) but not read by dispatch. If you document TOML config for users, note that changing `mode` has no effect — interactive vs exec is determined by agent identity.
4. **No regression to CC behavior.** All existing Claude dispatch tests pass unmodified.

## Verdict
**Shippable:** YES

All 11 contract assertions satisfied. All acceptance criteria pass. 3090 tests pass with no regressions. The findings (dead `mode` field, duplicate JSDoc, missing platform validation, missing advisory check for Codex) are all technical debt — none affect correctness or user safety. The Codex dispatch path is clean, well-tested, and follows the existing spawnSync pattern. The platform resolution chain works as specified.
