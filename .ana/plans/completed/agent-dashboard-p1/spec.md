# Spec: Agent Dashboard Phase 1

**Created by:** AnaPlan
**Date:** 2026-05-07
**Scope:** .ana/plans/active/agent-dashboard-p1/scope.md

## Approach

Restructure `agents.ts` from a flat monolith into the parent-command + subcommand pattern used by `work.ts` and `proof.ts`. The parent `agents` command keeps its default list action; `model` becomes a subcommand via `agents.addCommand(model)`.

Extract frontmatter read/write logic to a new `agent-config.ts` utils module. The key abstraction is `getAgentInfoList()` — a pure data function returning enriched `AgentInfo` objects with optional model, character count, and skill count. Both the list display and model subcommand consume this function.

**Frontmatter strategy:** Regex-based parse-modify-serialize within the first `---` pair only. No YAML library dependency — frontmatter is simple `key: value` lines. The module handles three operations: read all fields, set a field, remove a field. Body content (including `---` horizontal rules in markdown) is never touched.

**Character counting:** File size of the agent template (via `fs.statSync`) plus sum of resolved skill file sizes. Skills referenced in `skills:` that don't exist on disk contribute 0 characters. This gives honest relative comparison — "how many characters of context does Claude Code load for this agent."

**Model display logic:** When all agents share the same model value (including all being "(default)"), a single footer line shows `Model: {value}`. When models differ, each agent shows its model inline and the footer notes the mixed state.

**`process.exit(1)` elimination:** The current `listAgents` uses `process.exit(1)` for missing directory. Change this to throw an error. The action handler in command registration catches it. Cleaner testing, same UX.

## Output Mockups

### `ana agents` (uniform models)

```
Agents:

  ana             14,883 chars   0 skills   Scoping and navigation
  ana-build       28,719 chars   1 skill    Reads spec, produces working code, tests, and build report
  ana-learn       36,328 chars   0 skills   Quality gardener. Triages findings, promotes rules, routes o…
  ana-plan        25,798 chars   2 skills   Reads scope, produces implementation spec
  ana-setup       34,900 chars   0 skills   Setup orchestrator
  ana-verify      31,123 chars   0 skills   Fault-finder and code reviewer

  Model: opus[1m]
```

### `ana agents` (mixed models)

```
Agents:

  ana             14,883 chars   0 skills   opus[1m]    Scoping and navigation
  ana-build       28,719 chars   1 skill    sonnet      Reads spec, produces working code, tests, and bu…
  ana-learn       36,328 chars   0 skills   opus[1m]    Quality gardener. Triages findings, promotes rule…
  ana-plan        25,798 chars   2 skills   (default)   Reads scope, produces implementation spec
  ana-setup       34,900 chars   0 skills   opus[1m]    Setup orchestrator
  ana-verify      31,123 chars   0 skills   opus[1m]    Fault-finder and code reviewer

  Models: mixed (overrides shown inline)
```

### `ana agents model`

```
Agent models:

  ana             opus[1m]
  ana-build       sonnet
  ana-learn       opus[1m]
  ana-plan        (default)
  ana-setup       opus[1m]
  ana-verify      opus[1m]
```

### `ana agents model ana-build sonnet`

```
Set ana-build model to sonnet
```

### `ana agents model ana-build --default`

```
Cleared ana-build model (will use default)
```

### `ana agents model ana-build --default` (no model line exists)

```
ana-build already uses default model
```

### `ana agents model --all sonnet`

```
Set model to sonnet for 6 agents
```

### `ana agents model nonexistent sonnet`

```
Unknown agent 'nonexistent'
Available agents: ana, ana-build, ana-learn, ana-plan, ana-setup, ana-verify
```

### `ana agents model sonnet` (missing agent name — Commander sees `sonnet` as agent arg)

```
Unknown agent 'sonnet'
Available agents: ana, ana-build, ana-learn, ana-plan, ana-setup, ana-verify

Did you mean: ana agents model --all sonnet
```

## File Changes

### `packages/cli/src/commands/agents.ts` (modify)
**What changes:** Full rewrite. Decompose `listAgents` into `getAgentInfoList()` (data) and display logic. Add `model` subcommand. Change registration from `program.command('agents').action()` to `new Command('agents')` + `.addCommand(model)` + `program.addCommand(agents)`.
**Pattern to follow:** `registerWorkCommand` in `work.ts` lines 1737-1769 — parent command with `.action()` plus subcommands via `.addCommand()`.
**Why:** The monolithic `listAgents` can't be reused by the model subcommand. The flat command registration doesn't support subcommands.

### `packages/cli/src/utils/agent-config.ts` (create)
**What changes:** New module with frontmatter parse/write utilities. Exports: `parseFrontmatter()` (returns all fields as a record with optional model), `setFrontmatterField()` (write a key-value into the first `---` block), `removeFrontmatterField()` (remove a key from the first `---` block), `resolveSkillCharCount()` (sum character counts of skill files referenced in frontmatter). Each function operates on file content strings, not file paths — I/O stays in the caller.
**Pattern to follow:** Pure functions operating on strings, like the existing `parseFrontmatter` in `agents.ts` but extracted and expanded.
**Why:** Frontmatter serialization within the first `---` block is tricky — scoping to the first pair while preserving body `---` horizontal rules needs careful regex work. Isolating this in a module enables thorough unit testing without filesystem setup.

### `packages/cli/tests/commands/agents.test.ts` (modify)
**What changes:** Expand from 5 "doesn't throw" tests to comprehensive output verification. Capture console output and assert on content. Add test groups for: enhanced display (char counts, skill counts, model footer), model subcommand (read, set, clear, --all, errors), edge cases (missing frontmatter, corrupt files, no model line).
**Pattern to follow:** Existing `createTestProject` + temp dir pattern already in place. Add console capture via `vi.spyOn(console, 'log')`.
**Why:** Current tests verify "doesn't crash" but not correctness. The new display and model command need output-level assertions.

### `packages/cli/tests/utils/agent-config.test.ts` (create)
**What changes:** Unit tests for `agent-config.ts`. Test frontmatter parsing (all fields, optional model, missing frontmatter, quoted values), field writing (add model, update model, preserve other fields), field removal (remove existing, no-op when absent), skill char counting, and the critical edge case: `---` horizontal rules in body content not being modified by write operations.
**Pattern to follow:** Pure function tests — no filesystem, no temp dirs. Pass content strings in, assert on output strings.
**Why:** The frontmatter write logic is the riskiest part of this feature. A bug here corrupts agent files. Unit tests on string functions are fast and exhaustive.

## Acceptance Criteria

- [ ] AC1: `ana agents` shows character count for each agent (template + loaded skills)
- [ ] AC2: `ana agents model` with no arguments shows current model for each agent
- [ ] AC3: `ana agents model ana-build sonnet` writes `model: sonnet` to `.claude/agents/ana-build.md` frontmatter. File content otherwise unchanged.
- [ ] AC4: `ana agents model ana-build --default` removes the `model:` line from frontmatter
- [ ] AC5: `ana agents model --all sonnet` writes to every `.md` file in `.claude/agents/`
- [ ] AC6: When all agents share the same model, footer shows `Model: {value}`. When agents differ, per-agent models appear inline with footer noting overrides.
- [ ] AC7: Agents without `model:` in frontmatter display "(default)" and are not skipped from the listing
- [ ] AC8: `ana agents model nonexistent sonnet` prints a clear error with available agent names
- [ ] AC9: `ana agents model ana-build --default` when no `model:` line exists is a no-op with a message
- [ ] AC10: Skills count appears for agents with `skills:` in frontmatter
- [ ] AC11: Frontmatter write preserves all fields (`memory:`, `initialPrompt:`, `skills:`, etc.) — only `model:` is modified
- [ ] AC12: `--all` skips files with corrupt/missing frontmatter with a warning, continues to remaining files
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`
- [ ] No lint errors with `pnpm run lint`

## Testing Strategy

- **Unit tests (`agent-config.test.ts`):** Pure string-in/string-out tests for all frontmatter operations. No filesystem. Test matrix:
  - Parse: complete frontmatter, missing model, missing all fields, no frontmatter block, quoted description, extra unknown fields
  - Set field: add new model line, update existing model, preserve all other fields, handle frontmatter with no trailing newline
  - Remove field: remove existing model, no-op when model absent, preserve other fields
  - Body protection: content with `---` horizontal rules in body — write operations must not touch body
  - Skill char resolution: valid skills, missing skills (0 chars), no skills field, empty array

- **Command tests (`agents.test.ts`):** Capture `console.log` output via `vi.spyOn`. Test matrix:
  - List display: verify char count appears, verify skill count appears, verify model footer (uniform), verify model column (mixed)
  - Model read: verify output shows each agent's model
  - Model set: verify file is written correctly, verify other frontmatter preserved
  - Model clear: verify model line removed, verify no-op message when already default
  - Model --all: verify all files updated
  - Errors: nonexistent agent, missing agents dir, corrupt frontmatter with --all

- **Edge cases:** Agent without `model:` in frontmatter listed with "(default)". Agent without any frontmatter listed with warning. Custom user-created agent files work. Empty skills array. Skills referencing nonexistent skill files.

## Dependencies

- Commander v14 (already installed at ^14.0.3) — parent action + subcommand pattern verified working.
- No new dependencies required.

## Constraints

- Frontmatter writes must be scoped to the first `---` pair. Agent files use `---` as horizontal rules in markdown body content.
- No model name validation — that's Claude Code's domain.
- No git commits on model writes — model preference is local configuration.
- Agent matching by filename (stem of `.md` file), not by frontmatter `name:` field.
- Character counts use file byte size, not token estimates. Honest representation of what's in the file.

## Gotchas

- **`---` in body content is the #1 risk.** Agent files like `ana-build.md` use `---` as horizontal rules throughout the markdown body. The frontmatter regex MUST anchor to the start of file: `/^---\s*\n([\s\S]*?)\n---/`. The write functions must replace ONLY the content between the first pair. Test this explicitly with real-world agent content.
- **`skills:` field format.** Current files use `skills: [git-workflow]` and `skills: [coding-standards, testing-standards]` — YAML inline array syntax. Parse with regex, not a YAML parser. Handle: no skills field, empty array `[]`, single item, multiple items.
- **Console capture in tests.** `vi.spyOn(console, 'log')` captures calls but doesn't suppress output. Use `mockImplementation(() => {})` to suppress. Restore in afterEach.
- **`findProjectRoot()` in tests.** Every test that calls `listAgents()` needs `.ana/ana.json` and `.git/` in the temp dir (via `createTestProject`). The existing tests already do this. The model write tests need this too since they go through the command path.
- **File header comment.** The current file header says "List deployed agents" — update to reflect the expanded scope. (Proof context flagged this as already stale.)

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. No default exports.
- Use `| null` for checked-and-empty fields. `?:` for might-not-exist.
- Prefer early returns over nested conditionals.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Test behavior, not implementation. Assert on specific expected values.
- Cover error paths, not just happy paths.
- Always pass `--run` flag when invoking vitest.

### Pattern Extracts

**Command registration with subcommands** (`work.ts` lines 1737-1769):
```typescript
export function registerWorkCommand(program: Command): void {
  const workCommand = new Command('work')
    .description('Start, track, and complete development tasks');

  const statusCommand = new Command('status')
    .description('Show pipeline state for all active work items')
    .option('--json', 'Output JSON format for programmatic consumption')
    .action((options: { json?: boolean }) => {
      getWorkStatus(options);
    });

  const startCommand = new Command('start')
    .description('Start a new work item')
    .argument('<slug>', 'Kebab-case slug for the work item')
    .addHelpText('after', '\nEXAMPLES\n  $ ana work start fix-auth-timeout')
    .action(async (slug: string) => {
      await startWork(slug);
    });

  workCommand.addCommand(statusCommand);
  workCommand.addCommand(startCommand);

  program.addCommand(workCommand);
}
```

**Test helper and temp dir pattern** (`agents.test.ts` lines 12-38):
```typescript
describe('ana agents', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agents-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  async function createAgentsDir(files: { name: string; content: string }[]): Promise<void> {
    await createTestProject(tempDir);
    const agentsDir = path.join(tempDir, '.claude/agents');
    await fs.mkdir(agentsDir, { recursive: true });

    for (const file of files) {
      await fs.writeFile(path.join(agentsDir, file.name), file.content, 'utf-8');
    }
  }
```

### Proof Context
- `agents.ts`: File header comment says "List deployed agents" — stale after this change. Update it.
- `agents.test.ts`: Previous build concern noted that `createAgentsDir` helper needed `.ana/` directory creation (via `createTestProject`). Already handled — the helper calls `createTestProject(tempDir)` before creating agents dir.

No other active proof findings for affected files.

### Checkpoint Commands

- After `agent-config.ts` + its tests: `(cd packages/cli && pnpm vitest run tests/utils/agent-config.test.ts)` — Expected: all agent-config unit tests pass
- After `agents.ts` rewrite + test expansion: `(cd packages/cli && pnpm vitest run tests/commands/agents.test.ts)` — Expected: all agents tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: all tests pass, no regressions
- Lint: `pnpm run lint`
- Build: `pnpm run build`

### Build Baseline
- Current tests: 1950 passed, 2 skipped (1952 total) across 95 test files
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expect ~1980+ tests (baseline + ~30 new tests for agent-config and agents command expansion)
- Regression focus: no other files import from `agents.ts`, so blast radius is contained to these files
