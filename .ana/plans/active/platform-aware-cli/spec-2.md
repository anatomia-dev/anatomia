# Spec: Platform Display and Run Command

**Created by:** AnaPlan
**Date:** 2026-05-30
**Scope:** .ana/plans/active/platform-aware-cli/scope.md

## Approach

Behavior-changing phase. Migrate all `claude --agent` display strings to `agentCommand()` calls that return `ana run` syntax. Update scaffold text and its detection atomically. Ship `ana run` as a new CLI command with CC passthrough, advisory pipeline state checking, `--agent` conflict guard, and configurable platform flags. Rename `getClaudePid` to `getAgentPid` across source and tests.

This spec depends on Spec 1 being complete — the `platform.ts` module, schema fields, and path helpers must exist.

Add an `agentCommand(agentSuffix: string): string` function to `platform.ts`. This maps agent suffixes to `ana run` invocations: `agentCommand('build')` returns `'ana run build'`, `agentCommand('setup')` returns `'ana run setup'`, `agentCommand('')` returns `'ana run'` (Think agent — the empty string edge case). This is the single source for all user-facing agent invocation strings.

The `ana run` command uses `spawnSync` with `stdio: 'inherit'` for full TUI passthrough. It maps the user's agent argument to a `claude --agent ana-{suffix}` invocation, appends `platformFlags.claude` from ana.json, and passes through any `--` args. Before spawning, it checks for `--agent` in `platformFlags` (conflict guard) and optionally checks pipeline state (advisory warning, non-blocking).

## Output Mockups

**`ana work status` (human output):**
```
  platform-aware-cli (2 phases):
    scope.md         ✓ main
    plan.md          ✓ main
    spec-1.md        ✓ main
    spec-2.md        ✓ main
    Stage: ready-for-build
    → ana run build
```

**`ana work status --json` (partial):**
```json
{
  "items": [{
    "slug": "platform-aware-cli",
    "stage": "ready-for-build",
    "nextAction": "ana run build"
  }]
}
```

**`ana run build` (with platformFlags):**
```
$ ana run build
# Executes: claude --agent ana-build --dangerously-skip-permissions
# (flags from platformFlags.claude appended automatically)
```

**`ana run build` — advisory pipeline warning:**
```
$ ana run build
⚠ No work item at build stage. Continuing anyway.
# Spawns claude --agent ana-build regardless
```

**`ana run build` — `--agent` conflict guard:**
```
$ ana run build
Error: platformFlags.claude contains --agent, which conflicts with ana run's agent selection.
Remove --agent from platformFlags in .ana/ana.json.
```

**`ana run` (no argument):**
```
$ ana run
# Executes: claude --agent ana
```

**`ana run build -- --extra-flag`:**
```
$ ana run build -- --extra-flag
# Executes: claude --agent ana-build --dangerously-skip-permissions --extra-flag
```

**`ana run build` — `claude` not in PATH:**
```
$ ana run build
Error: claude not found. Install Claude Code: https://docs.anthropic.com/s/claude-code
```

**`ana run` — no `.ana/` directory:**
```
$ ana run build
Error: No Anatomia project found. Run `ana init` first.
```

## File Changes

Note: The machine-readable `file_changes` list is in contract.yaml. This section provides prose context for the builder.

### `packages/cli/src/commands/platform.ts` (modify)
**What changes:** Add `agentCommand(agentSuffix)` function that returns `ana run {suffix}` strings for display. Add `getPlatformFlags(cwd)` function that reads `platformFlags` from ana.json for the active platform.
**Pattern to follow:** The existing helpers in the same file (from Spec 1).
**Why:** Every display string site needs a single source of truth for the user-facing agent invocation command.

`agentCommand(agentSuffix: string): string` — returns `'ana run'` when suffix is empty, `'ana run {suffix}'` when non-empty. No backticks, no formatting — callers wrap in backticks/chalk as needed.

`getPlatformFlags(cwd: string): string[]` — reads ana.json from `cwd/.ana/ana.json`, parses through schema, returns `platformFlags[activePlatform]` or `[]`. Fails silently to empty array (consistent with fail-soft convention).

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Three categories of changes: (1) Replace all `claude --agent` strings in `getNextAction()` with `agentCommand()` calls — 11 sites. (2) Replace 6 `claude --agent` display strings outside `getNextAction()` with `agentCommand()` calls. (3) Rename `getClaudePid` export to `getAgentPid` and all 6 `claudePid` variable uses to `agentPid`.
**Pattern to follow:** The existing early-return structure in `getNextAction()`. Each return statement is a simple string — replace the string value, keep the structure.
**Why:** `getNextAction()` is the core pipeline routing function. Its return values appear in both human display and `--json` output. The rename removes CC-specific naming from a platform-agnostic function.

Specific `getNextAction()` replacements:
- `'claude --agent ana-plan'` → `agentCommand('plan')`
- `'claude --agent ana-build'` → `agentCommand('build')`
- `'claude --agent ana-verify'` → `agentCommand('verify')`

Display string sites outside `getNextAction()`:
- Line 187: `'claude --agent ana to scope new work'` → uses `agentCommand('')`
- Line 266: `'claude --agent ana'` → uses `agentCommand('')`
- Line 365: same pattern
- Line 874: `'claude --agent ana-verify'` → uses `agentCommand('verify')`
- Line 1080: `'claude --agent ana-learn'` → uses `agentCommand('learn')`
- Line 1311: `'claude --agent ana-plan'` → uses `agentCommand('plan')`

`getClaudePid` rename: export name changes to `getAgentPid`. All `claudePid` local variables at lines 281, 1243, and their downstream uses rename to `agentPid`.

### `packages/cli/src/commands/doctor.ts` (modify)
**What changes:** Replace four `claude --agent` display strings with `agentCommand()` calls. Sites: lines 576, 580, 656, 660.
**Pattern to follow:** Existing chalk formatting at each site — replace only the command string inside.
**Why:** Doctor output is user-facing guidance. Must show `ana run` syntax.

### `packages/cli/src/commands/setup.ts` (modify)
**What changes:** Replace three `claude --agent` display strings with `agentCommand()` calls. Sites: lines 43, 133, 142.
**Pattern to follow:** Existing formatting — line 43 is inside `chalk.cyan()`, lines 133 and 142 are plain strings.
**Why:** Setup output is user-facing guidance.

### `packages/cli/src/commands/pr.ts` (modify)
**What changes:** Replace two `claude --agent` display strings with `agentCommand()` calls. Sites: lines 258, 290.
**Pattern to follow:** Both are inside `chalk.gray()` error hints.
**Why:** PR error messages are user-facing guidance.

### `packages/cli/src/commands/work-proof.ts` (modify)
**What changes:** Replace one `claude --agent` display string with `agentCommand()` calls. Site: line 30.
**Pattern to follow:** Existing `chalk.gray()` error hint formatting.
**Why:** Work-proof error output is user-facing guidance.

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** Replace `claude --agent` display strings in init success output. Five sites in two clusters: (1) Line 961 `.claude/skills/` display string — leave unchanged, this is a literal path display, not an agent invocation. (2) Lines 1055-1059: four `claude --agent` strings in the "Next:" post-init output.
**Pattern to follow:** Existing `chalk.cyan()` formatting for the "Next:" lines.
**Why:** Post-init output tells users what to run next. Must show `ana run` syntax.

### `packages/cli/src/commands/init/skills.ts` (modify)
**What changes:** Update scaffold template text at line 167 to use `ana run setup` instead of `claude --agent ana-setup`. This changes what new installations write to skill files.
**Pattern to follow:** The existing `replaceRulesSection` call — the replacement text is a template string.
**Why:** Must change atomically with `check.ts` scaffold detection. New installations should see `ana run setup` in their scaffold text.

### `packages/cli/src/commands/check.ts` (modify)
**What changes:** Update `isScaffoldTemplateLine()` at line 1201 to match both `claude --agent ana-setup` and `ana run setup` patterns. This is the detection side of the bidirectional dependency with `skills.ts`.
**Pattern to follow:** The existing pattern match structure — add an `||` condition for the new string.
**Why:** Must change atomically with `skills.ts` line 167. Without dual-pattern matching, new installations (which write `ana run setup`) would falsely pass scaffold detection.

Also update `scaffold-generators.ts` — search for any `claude --agent ana-setup` strings in scaffold template text and update to `ana run setup`.

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Replace the `claude --agent` reference in the error message at line 891 with `agentCommand()` equivalent.
**Pattern to follow:** Existing `chalk.gray()` hint formatting.
**Why:** Error hint is user-facing guidance.

### `packages/cli/src/commands/init/index.ts` (modify)
**What changes:** The `.claude/` string at line 138 in the gitignore warning stays unchanged — it refers to the literal `.claude/` directory, not an agent invocation. Verify no `claude --agent` strings exist in this file.
**Why:** Documenting this as a non-change to prevent the builder from modifying it.

### `packages/cli/src/commands/run.ts` (create)
**What changes:** New command module implementing `ana run`. Exports a `registerRunCommand(program)` function following the existing command registration pattern.
**Pattern to follow:** The `registerWorkCommand` pattern in `work.ts` for command registration. The `spawnSync` usage in `getClaudePid` (same file) for process spawning.
**Why:** `ana run` is the universal invocation surface that makes platform choice invisible.

Command structure:
- `ana run [agent] [-- ...args]` — positional agent argument (optional), passthrough args after `--`
- Agent mapping: `''` → `ana`, `'build'` → `ana-build`, `'plan'` → `ana-plan`, `'verify'` → `ana-verify`, `'setup'` → `ana-setup`, `'learn'` → `ana-learn`
- `--platform` option (default: first entry from `platforms` in ana.json, falls back to `'claude'`)
- Process: (1) find project root, (2) read ana.json for platformFlags, (3) check `--agent` conflict in flags, (4) advisory pipeline state check, (5) resolve executable path, (6) spawn with inherited stdio

Advisory pipeline state check: Read `ana work status --json` output (call the status function internally, don't spawn a subprocess). Check if any work item is at the appropriate stage for the requested agent. If not, print a yellow warning line and continue. Non-blocking — the user may be running outside the pipeline intentionally.

`--agent` conflict guard: Before spawning, check if `platformFlags` for the active platform contains any entry starting with `--agent`. If found, print an error and exit. This prevents silent agent override via committed config.

Executable resolution: For `claude` platform, check if `claude` is in PATH using `which` (or `where` on Windows). If not found, print error with install link and exit.

### `packages/cli/src/index.ts` (modify)
**What changes:** Import and register `registerRunCommand`. Place between `registerWorkCommand` and `registerArtifactCommand` in the PIPELINE group.
**Pattern to follow:** The existing `registerWorkCommand(program)` call at line 62.
**Why:** `ana run` is a pipeline command — it's how users invoke pipeline agents.

### `packages/cli/src/utils/scaffold-generators.ts` (modify)
**What changes:** Replace any `claude --agent ana-setup` strings in scaffold template text with `ana run setup`. These are the templates that generate initial content for context files.
**Pattern to follow:** Existing template string patterns in the file.
**Why:** New installations should see `ana run` syntax in scaffold text, consistent with the skill file change in `skills.ts`.

## Acceptance Criteria

- [ ] AC7: `ana work status` shows `ana run build` (not `claude --agent ana-build`) in human output
- [ ] AC8: `ana work status --json` `nextAction` field contains `ana run build` (not `claude --agent ana-build`)
- [ ] AC9: `check.ts` scaffold detection matches both `claude --agent ana-setup` and `ana run setup` patterns
- [ ] AC10: `ana run build` launches `claude --agent ana-build` with `platformFlags.claude` appended
- [ ] AC11: `ana run` (no argument) launches `claude --agent ana` (Think agent)
- [ ] AC12: `ana run build` with no work item at build stage shows advisory warning, does not block
- [ ] AC13: `ana run build -- --extra-flag` appends `--extra-flag` after config flags
- [ ] AC15: `ana run build` with `platformFlags` containing `--agent` warns and exits (conflict guard)
- [ ] AC16: All existing tests pass. Test count does not decrease from 3001.
- [ ] `getClaudePid` renamed to `getAgentPid` with all variable uses updated
- [ ] No `claude --agent` strings remain in source files (except template files under `templates/` which are Scope 2)
- [ ] Scaffold text in `skills.ts` and detection in `check.ts` updated atomically

## Testing Strategy

- **Unit tests for `agentCommand()`:** Test all agent mappings — `''` → `'ana run'`, `'build'` → `'ana run build'`, etc. This is the most likely function to get the empty-string edge case wrong.
- **Unit tests for `ana run` command:** Mock `spawnSync` to verify correct argument construction. Test: agent mapping, platformFlags injection, `--` passthrough, `--agent` conflict guard exit, advisory warning output. Don't test actual process spawning.
- **Unit tests for `getNextAction()` output:** Verify all stage strings return `ana run` syntax. The existing test file has tests for `getNextAction` output — update expected values.
- **Unit tests for scaffold detection:** Test `isScaffoldTemplateLine` with both `claude --agent ana-setup` and `ana run setup` strings.
- **Integration tests for `getAgentPid` rename:** Update all 6 `claudePid` variable references in test files and the import statements.
- **Regression:** Full test suite. All 3001+ tests must pass (plus new tests from this spec).

## Dependencies

- Spec 1 must be complete. This spec imports from `platform.ts` and relies on the schema fields existing.

## Constraints

- The scaffold text change (`skills.ts`) and detection change (`check.ts`) MUST land in the same commit or atomic change set. One without the other creates a detection bug.
- `getNextAction()` return values flow into both human display (`chalk.cyan`) and JSON output (`JSON.stringify`). Both paths must see the new strings.
- `getClaudePid` is exported and tested — the rename requires updating imports in `work.test.ts` and `work-ci-mocked.test.ts`.
- Template files under `templates/.claude/` are NOT changed in this spec — that's Scope 2.

## Gotchas

- **`agentCommand('')` must return `'ana run'`, not `'ana run '` (trailing space).** The empty-string case maps to the Think agent. A trailing space breaks display formatting and copy-paste.
- **`getNextAction` serves two consumers.** Line 261 renders it with `chalk.cyan` for humans. Line 409 serializes it with `JSON.stringify` for `--json`. The function returns plain strings — formatting is the caller's job. Don't add formatting inside `agentCommand()`.
- **`work.ts` line 1080 is inside a health change conditional.** The `claude --agent ana-learn` string appears inside `if (healthChange.triggers.includes('new_candidates'))`. Replace the string but preserve the conditional structure.
- **`scaffold-generators.ts` may have zero matches.** Grep showed no `claude --agent ana-setup` strings in that file. Verify during build — if no matches exist, skip the file.
- **Test files reference `getClaudePid` by name in imports and describe blocks.** Update the import name and all `describe('getClaudePid')` blocks to `describe('getAgentPid')`.
- **Advisory pipeline check must not spawn a subprocess.** Call the work status logic internally (import the status-gathering functions). Don't shell out to `ana work status --json` — that would spawn a new process and potentially hang.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { agentCommand } from './platform.js'`
- Use `node:` prefix for built-ins: `import { spawnSync } from 'node:child_process'`
- Named exports only, no default exports
- Explicit return types on all exported functions
- Exported functions require `@param` and `@returns` JSDoc tags
- Error handling: commands surface errors with `chalk.red` + `process.exit(1)`. Advisory warnings use `chalk.yellow`.
- Temp directories in tests use `fs.mkdtemp(path.join(os.tmpdir(), 'prefix-'))`

### Pattern Extracts

**getNextAction return pattern** (from `work.ts` lines 83-84):
```typescript
  if (stage === 'ready-for-plan') {
    return 'claude --agent ana-plan';
  }
```

**Command registration pattern** (from `index.ts` lines 61-65):
```typescript
program.commandsGroup('PIPELINE');
registerWorkCommand(program);
registerArtifactCommand(program);
registerVerifyCommand(program);
registerPrCommand(program);
```

**Display string with chalk** (from `work.ts` line 261):
```typescript
      console.log(chalk.cyan(`    → ${item.nextAction}\n`));
```

**spawnSync usage** (from `work.ts` lines 1550-1553):
```typescript
    const result = spawnSync('ps', ['-o', 'ppid=', '-p', String(process.ppid)], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
```

**Scaffold detection pattern** (from `check.ts` lines 1198-1202):
```typescript
  if (
    trimmed.startsWith('*') &&
    trimmed.endsWith('*') &&
    trimmed.includes('Run `claude --agent ana-setup`')
  ) {
```

### Proof Context

- `work.ts`: `getNextAction` not yet moved to `work-state.ts` (decompose-work-ts-C1). Relevant — all `getNextAction` changes happen in `work.ts`, not a separate file.
- `work.ts`: `checkConcurrencyGuard` has dead `force` parameter (pipeline-concurrency-guards-C1). Not relevant to this spec.
- No active proof findings for `doctor.ts`, `setup.ts`, `pr.ts`, `work-proof.ts`, `artifact.ts`.

### Checkpoint Commands

- After `agentCommand()` addition to `platform.ts`: `(cd 'packages/cli' && pnpm vitest run)` — Expected: new tests pass, existing tests unaffected
- After `getNextAction()` migration in `work.ts` + test updates: `(cd 'packages/cli' && pnpm vitest run)` — Expected: work tests pass with updated expected values
- After `getClaudePid` → `getAgentPid` rename: `(cd 'packages/cli' && pnpm vitest run)` — Expected: all rename references consistent, tests pass
- After scaffold text + detection atomic update (`skills.ts` + `check.ts`): `(cd 'packages/cli' && pnpm vitest run)` — Expected: scaffold detection tests pass for both patterns
- After `run.ts` creation and `index.ts` registration: `(cd 'packages/cli' && pnpm vitest run)` — Expected: new run command tests pass
- After all changes: `pnpm run test -- --run` — Expected: 3001+ tests pass (existing + new)
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 3001 passed, 2 skipped (3003 total) — plus any added by Spec 1
- Current test files: 127 — plus any added by Spec 1
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected significant test count increase from `run.test.ts` and updated assertions
- Regression focus: `tests/commands/work.test.ts` (19 `claude --agent` references, 6 `claudePid` uses), `tests/commands/work-ci-mocked.test.ts` (getClaudePid import/tests), `tests/commands/check-dashboard.test.ts` (8 `claude --agent` references), `tests/commands/init.test.ts` (1 `claude --agent` reference), `tests/e2e/init-flow.test.ts` (1 `claude --agent` reference)
