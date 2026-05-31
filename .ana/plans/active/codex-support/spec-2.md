# Spec: Codex Support — Runtime Dispatch

**Created by:** AnaPlan
**Date:** 2026-05-30
**Scope:** .ana/plans/active/codex-support/scope.md

## Approach

This spec adds Codex dispatch to `ana run`. The `--platform` flag, `ANA_PLATFORM` env, and auto-detection form a resolution chain that determines which platform to invoke. For Claude Code, behavior is unchanged (spawn `claude --agent`). For Codex, `ana run` reads the `.agent.toml` manifest, constructs a `codex` CLI invocation, and spawns it.

The key design decision: the `.agent.toml` manifest is the declarative source for Codex dispatch config. `ana run` reads `model`, `sandbox_mode`, `model_reasoning_effort`, and `mode` from the TOML and constructs the CLI invocation. This keeps platform-specific details in files the user can edit, not hardcoded in the CLI.

Interactive agents (Think, Setup) use `codex` without `exec` — opening the Codex TUI with the agent's instructions loaded. Non-interactive agents (Build, Plan, Verify) use `codex exec` with `developer_instructions` injected via `$(cat)` shell expansion.

Learn is not available on Codex — `ana run learn` detects the missing prompt file and shows a helpful error.

## Output Mockups

### `ana run build` (Codex platform)

```
$ ana run build
Launching ana-build on Codex...
[Codex exec output follows]
```

### `ana run` (Codex interactive — Think agent)

```
$ ana run
[Opens Codex TUI with Ana's instructions loaded]
```

### `ana run learn` on Codex

```
$ ana run learn
Error: The Learn agent is not yet available on Codex.
  Use Claude Code instead: claude --agent ana-learn
```

### `ana run build --platform codex` (explicit platform)

```
$ ana run build --platform codex
Launching ana-build on Codex...
[Codex exec output follows]
```

### Platform resolution errors

```
$ ana run build
Error: Multiple platforms configured (claude, codex). Specify which to use:
  ana run build --platform codex
  or set ANA_PLATFORM=codex
```

```
$ ana run build --platform codex
Error: codex not found in PATH.
  Install: https://openai.com/codex
```

## File Changes

### `packages/cli/src/commands/run.ts` (modify)
**What changes:** Add `--platform` flag. Implement platform resolution chain: `--platform` flag → `ANA_PLATFORM` env → sole platform in `ana.json` → error with guidance. Replace single-platform CC dispatch with a `dispatchToPlatform()` function that branches on resolved platform. For Claude: existing behavior (spawn `claude --agent`). For Codex: read `.agent.toml` from `.codex/agents/`, construct `codex` CLI invocation. Interactive mode (Think, Setup) opens `codex` TUI. Non-interactive (Build, Plan, Verify) uses `codex exec`. Learn on Codex shows helpful error. Progress output for non-interactive Codex mode.
**Pattern to follow:** Existing `executeRun()` structure — same error handling, same `spawnSync`, same exit code passthrough.
**Why:** This is the core runtime change — `ana run` becomes the universal dispatch surface.

### `packages/cli/src/commands/platform.ts` (modify)
**What changes:** `getPlatformFlags()` accepts an optional `platform` parameter. When provided, reads `platformFlags[platform]` instead of `platformFlags[platforms[0]]`. The existing no-parameter behavior is preserved as the default.
**Pattern to follow:** Same function shape, additive parameter.
**Why:** `ana run build --platform codex` must read `platformFlags.codex`, not `platformFlags.claude`.

### `packages/cli/tests/commands/run.test.ts` (modify)
**What changes:** Add tests for: Codex dispatch (mock `codex` in PATH, verify correct args), platform resolution chain (flag > env > sole platform > error), Learn on Codex error message, interactive vs exec mode, `--platform` flag, `ANA_PLATFORM` env, missing Codex executable error.
**Pattern to follow:** Existing test structure — `createProject()` helper, `runAndGetExit()`, mocked `spawnSync`.
**Why:** Codex dispatch needs thorough test coverage.

### `packages/cli/tests/commands/platform.test.ts` (modify)
**What changes:** Add tests for `getPlatformFlags(cwd, 'codex')` reading `platformFlags.codex`.
**Pattern to follow:** Existing `getPlatformFlags` test block.
**Why:** New parameter needs test coverage.

## Acceptance Criteria

- [x] AC6: `ana run build` on a Codex-configured project launches `codex exec` with correct `developer_instructions`, model, and `--sandbox danger-full-access` read from the manifest
- [x] AC7: `ana run` (no argument) on Codex opens the interactive TUI with Ana's instructions loaded
- [x] AC8: Codex Build agent calls `ana artifact save build-report {slug}` during its session and the commit succeeds (`danger-full-access` provides full git access)
- [x] AC12: `ana run build --platform codex` works when both tools are installed, reads flags from `platformFlags.codex`
- [x] AC13: `ana run learn` on Codex shows: "The Learn agent is not yet available on Codex" with guidance to use CC
- [x] AC20: All existing tests pass. Test count does not decrease. CC behavior unchanged.
- [ ] Tests pass with `(cd 'packages/cli' && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`
- [ ] CC dispatch behavior is unchanged (existing tests pass without modification)

## Testing Strategy

- **Unit tests:** Mock `spawnSync` to verify Codex dispatch constructs correct args. Test each step of the platform resolution chain. Test interactive vs exec mode branching. Test Learn agent error path.
- **Integration tests:** Create test project with Codex-only config + `.agent.toml` manifests. Verify `executeRun()` reads TOML and passes correct flags. Verify `--platform` flag overrides.
- **Edge cases:** Codex not in PATH (install link error). Both platforms in `ana.json` with no `--platform` flag (error with guidance). Empty platforms array (error). `ANA_PLATFORM` env override. TOML with missing fields (sensible defaults). Agent prompt file missing (error for Learn, error for deleted templates).

## Dependencies

- Spec 1 must be complete — provides Codex templates and `.agent.toml` manifests that this spec reads at runtime.
- `getPlatformFlags()` with platform parameter (from Spec 1 or early in this spec).

## Constraints

- `shell: true` required for `$(cat)` expansion in Codex dispatch. The agent prompt path is constructed from `ana.json` + project root — not user input. No injection vector.
- Paths with spaces must be quoted in the shell command. Template literal with explicit quoting.
- CC behavior must be byte-identical — existing `spawnSync('claude', ...)` path unchanged.
- Exit code passthrough from spawned Codex process.

## Gotchas

- **TOML parsing:** Need a TOML parser. Check if one is available in dependencies. If not, the `.agent.toml` files are simple key-value (no nested tables), so a minimal parser or regex extraction works. Alternatively, add a lightweight TOML dependency.
- **`$(cat)` with long prompts:** Validated in scope's spike — 538-line prompt loaded without truncation. But the shell command string has a maximum length. For very long prompts, consider `--stdin` or temp file approach. Current agent prompts are well within limits.
- **Interactive mode for Codex:** `codex` (without `exec`) opens a TUI. The `spawnSync` with `stdio: 'inherit'` should work — same pattern as CC dispatch. But verify that Codex TUI doesn't require special terminal setup.
- **`sandbox_mode` vs `--sandbox` mapping:** The TOML stores `sandbox_mode = "danger-full-access"` (Codex config key). `ana run` reads this and passes it as the `--sandbox` CLI flag value: `--sandbox danger-full-access`. The config key name and CLI flag name differ — the spec must make this mapping explicit.
- **`mode` field determines dispatch shape:** `mode = "exec"` → `codex exec`. `mode = "auto"` → `codex` (interactive TUI). The field controls whether the agent runs non-interactively or in conversational mode.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Early returns over nested conditionals.
- Error handling: commands surface errors with `chalk.red` + `process.exit(1)`.

### Pattern Extracts

**Existing CC dispatch (run.ts:130-174):**
```typescript
export function executeRun(agentSuffix: string, passthroughArgs: string[]): void {
  const projectRoot = findRunProjectRoot();
  if (!projectRoot) {
    console.error(chalk.red('Error: No Anatomia project found. Run `ana init` first.'));
    process.exit(1);
  }

  const flags = getPlatformFlags(projectRoot);

  if (flags.some(f => f.startsWith('--agent'))) {
    console.error(chalk.red('Error: platformFlags.claude contains --agent...'));
    process.exit(1);
  }

  const agentName = AGENT_MAP[agentSuffix];
  if (agentName === undefined) {
    console.error(chalk.red(`Error: Unknown agent "${agentSuffix}".`));
    process.exit(1);
  }

  if (!isExecutableInPath('claude')) {
    console.error(chalk.red('Error: claude not found...'));
    process.exit(1);
  }

  advisoryPipelineCheck(projectRoot, agentSuffix);

  const args = ['--agent', agentName, ...flags, ...passthroughArgs];
  const result = spawnSync('claude', args, {
    stdio: 'inherit',
    cwd: projectRoot,
  });

  process.exit(result.status ?? 1);
}
```

**Test helper pattern (run.test.ts:60-72):**
```typescript
function createProject(config?: Record<string, unknown>): void {
  const anaDir = path.join(tempDir, '.ana');
  fs.mkdirSync(anaDir, { recursive: true });
  fs.writeFileSync(
    path.join(anaDir, 'ana.json'),
    JSON.stringify({
      name: 'test',
      platforms: ['claude'],
      platformFlags: {},
      ...config,
    }),
  );
}
```

### Proof Context

- **run.ts (platform-aware-cli-C7):** Advisory pipeline check reads `.saves.json` stage field directly. Not affected by this spec — advisory check is orthogonal to platform dispatch.
- **run.ts (platform-aware-cli-C10):** `findRunProjectRoot` walks from `process.cwd()` — works correctly for both platforms.

### Checkpoint Commands

- After platform resolution chain: `(cd 'packages/cli' && pnpm vitest run tests/commands/run.test.ts)` — Expected: all existing + new tests pass
- After all changes: `pnpm run test -- --run` — Expected: 3060+ tests pass (including Spec 1 additions)
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 3041 passed (2 skipped) + Spec 1 additions ≈ 3060+
- Current test files: 129 + Spec 1 additions ≈ 131+
- Command used: `pnpm run test -- --run`
- After build: expected 3080+ tests in 131+ files (Codex dispatch tests added to existing run.test.ts and platform.test.ts)
- Regression focus: `run.test.ts` (existing CC tests must pass unchanged), `platform.test.ts` (`getPlatformFlags` parameter change)
