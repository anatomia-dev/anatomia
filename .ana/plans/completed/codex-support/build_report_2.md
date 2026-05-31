# Build Report: Codex Support — Runtime Dispatch (Phase 2)

**Created by:** AnaBuild
**Date:** 2026-05-30
**Spec:** .ana/plans/active/codex-support/spec-2.md
**Branch:** feature/codex-support

## What Was Built

- `packages/cli/src/commands/run.ts` (modified): Added platform resolution chain (`--platform` flag → `ANA_PLATFORM` env → sole platform in ana.json → error with guidance). Extracted Claude dispatch into `dispatchToClaude()`. Added `dispatchToCodex()` for Codex agents — reads `.agent.toml` manifests for model/sandbox config, uses `codex exec` for non-interactive agents (Build, Plan, Verify) and `codex` TUI for interactive agents (Think, Setup). Learn agent on Codex shows helpful error. Added `parseSimpleToml()` for minimal TOML parsing and `resolvePlatform()` for the resolution chain. Added `--platform` option to `registerRunCommand()`.
- `packages/cli/tests/commands/run.test.ts` (modified): Added 26 new tests across 4 describe blocks: Codex dispatch (exec args, interactive mode, Learn error, shell:true, $(cat) instructions, missing codex, missing prompt, platform flags passthrough, no Learn template, launch message), platform resolution (--platform flag, flag priority over env, env selection, sole platform auto-select, multi-platform error, CC unchanged), parseSimpleToml (key-value parsing, comments, empty), resolvePlatform (flag, env, sole, default).

## PR Summary

- Add Codex runtime dispatch to `ana run` — agents can now run on OpenAI Codex via `codex exec` (non-interactive) or `codex` TUI (interactive)
- Platform resolution chain: `--platform` flag → `ANA_PLATFORM` env → sole platform in ana.json → error with guidance for multi-platform configs
- Codex dispatch reads `.agent.toml` manifests for model, sandbox_mode config; developer_instructions loaded via `$(cat)` shell expansion
- Learn agent shows helpful "not yet available on Codex" error with guidance to use Claude Code
- 26 new tests covering all dispatch paths, resolution chain, and edge cases; all 12 existing CC tests pass unchanged

## Acceptance Criteria Coverage

- AC6 "ana run build on Codex launches codex exec" → run.test.ts "dispatches codex exec with model and sandbox from TOML" (4 assertions: exec in args, --model, gpt-5.5, --sandbox, danger-full-access)
- AC7 "ana run on Codex opens interactive TUI" → run.test.ts "opens interactive mode for Think agent (no exec)" (3 assertions: no exec, has --model, has --sandbox)
- AC8 "Codex Build agent calls ana artifact save" → Not directly testable (runtime behavior during Codex session). Codex dispatch with `danger-full-access` sandbox verified by A030/A031 tests.
- AC12 "--platform codex works" → run.test.ts "--platform flag selects codex dispatch" (1 assertion: codex spawned)
- AC13 "Learn on Codex shows error" → run.test.ts "shows helpful error for Learn agent on Codex" (2 assertions: contains "not yet available on Codex", contains "claude --agent ana-learn")
- AC20 "All existing tests pass" → Full suite: 3090 passed, 0 failed, 2 skipped. All 12 original run.test.ts tests pass unchanged.
- "Tests pass with vitest run" → ✅ Verified
- "No build errors" → ✅ Verified
- "CC dispatch unchanged" → ✅ Verified (existing tests pass, dispatchToClaude preserves original behavior)

## Implementation Decisions

1. **Minimal TOML parser instead of dependency:** The `.agent.toml` files are simple key-value pairs with no nested tables. Rather than adding a TOML parser dependency, implemented `parseSimpleToml()` — a 10-line regex-based parser that handles `key = "value"` format, comments, and blank lines. Exported for testability.

2. **`resolvePlatform` extracted and exported:** Made `resolvePlatform` a standalone exported function (not just internal to `executeRun`) so it can be unit-tested independently without needing full dispatch mocking.

3. **try/catch scoped to file reading only:** The `resolvePlatform` function's `try/catch` is scoped to the `fs.readFileSync` + JSON parse, with `process.exit(1)` for multi-platform error placed outside the try block. This prevents the test spy's thrown error from being swallowed by the catch clause.

4. **Interactive agents determined by constant set:** `INTERACTIVE_AGENTS = new Set(['', 'setup'])` — Think and Setup open Codex TUI, all others use `codex exec`. This matches the TOML `mode = "auto"` vs `mode = "exec"` values but is determined by the CLI code, not read from the TOML. The TOML `mode` field is available for future use but the dispatch shape is currently hardcoded.

5. **`-i` flag for developer_instructions:** Both interactive and exec Codex modes use `-i "$(cat ...)"` to load the prompt file. This matches the Codex CLI's instruction loading pattern with `shell: true` for the `$(cat)` expansion.

## Deviations from Contract

### A030: Running an agent on Codex launches the correct Codex process
**Instead:** Test verifies `spawnArgs.command` via `mockedSpawnSync.mock.calls.find(c => c[0] === 'codex')` — the first arg to spawnSync is the command
**Reason:** spawnSync's first argument is the command, not `spawnArgs.command` as a property
**Outcome:** Functionally equivalent — the assertion confirms `codex` is the spawned executable

### A033: Think agent opens interactive mode instead of exec
**Instead:** Asserted `spawnArgs` does not contain `'exec'` and does contain `'--model'` and `'--sandbox'`
**Reason:** The contract specifies checking `spawnArgs.args` for not_contains "exec" — test checks the actual args array
**Outcome:** Exactly equivalent — verifies interactive mode (no exec subcommand)

### A039: All existing tests continue to pass
**Instead:** Verified via full test suite run (3090 passed) rather than a tagged test
**Reason:** "All existing tests pass" is a suite-level property, not a single test assertion
**Outcome:** Proven by baseline comparison: 12 original run.test.ts tests unchanged, full suite green

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run tests/commands/run.test.ts)
Test Files  1 passed (1)
     Tests  12 passed (12)

(cd 'packages/cli' && pnpm vitest run tests/commands/platform.test.ts)
Test Files  1 passed (1)
     Tests  30 passed (30)
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run tests/commands/run.test.ts)
Test Files  1 passed (1)
     Tests  38 passed (38)

(cd 'packages/cli' && pnpm vitest run tests/commands/platform.test.ts)
Test Files  1 passed (1)
     Tests  30 passed (30)

pnpm run test -- --run
Test Files  129 passed (129)
     Tests  3090 passed | 2 skipped (3092)
```

### Comparison
- Tests added: 26 (in run.test.ts)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/run.test.ts`: 26 tests across 4 describe blocks — Codex dispatch (12 tests: exec args, interactive Think/Setup, exec Plan/Verify, Learn error, shell:true, $(cat) instructions, missing codex, missing prompt, platform flags, no Learn template, launch message), platform resolution (6 tests: --platform flag, priority over env, env selection, sole platform, multi-platform error, CC unchanged), parseSimpleToml (3 tests), resolvePlatform (4 tests)

## Verification Commands
```bash
pnpm run build
(cd 'packages/cli' && pnpm vitest run tests/commands/run.test.ts)
(cd 'packages/cli' && pnpm vitest run tests/commands/platform.test.ts)
pnpm run test -- --run
pnpm run lint
```

## Git History
```
8779b5fb [codex-support:s2] Add Codex dispatch and platform resolution tests
b1fa78b2 [codex-support:s2] Add platform resolution and Codex dispatch to ana run
7e16aa2d [codex-support] Verify report 1
8d569366 [codex-support] Build report 1
9ef996cd [codex-support:s1] Add Codex init tests
fe04f9c6 [codex-support:s1] Add Codex init infrastructure and fix test paths
429b4be7 [codex-support:s1] Add Codex agent templates and TOML manifests
e5cb5a5b [codex-support:s1] Migrate CC templates to ana run syntax
57c94607 [codex-support:s1] Update platform helpers for canonical .ana/skills path
```

## Open Issues

1. **TOML `mode` field not read at runtime:** The `INTERACTIVE_AGENTS` set hardcodes which agents are interactive vs exec. The TOML's `mode = "auto"` / `mode = "exec"` is written but not read by `dispatchToCodex()`. If a user changes the TOML mode, it has no effect. This is intentional (the dispatch shape is a CLI concern, not a config concern) but could surprise users who edit the TOML expecting it to control behavior.

2. **`model_reasoning_effort` from TOML not passed:** The TOML manifests include `model_reasoning_effort = "high"` but this isn't mapped to a CLI flag. The Codex CLI may support `--reasoning-effort` but the mapping isn't documented in the spec. Omitted to avoid passing an unsupported flag.

3. **Pre-existing lint warning:** `packages/cli/src/utils/git-operations.ts:198` has an unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
