# Spec: CLI UX Polish — First 10 Minutes

**Created by:** AnaPlan
**Date:** 2026-05-05
**Scope:** .ana/plans/active/cli-ux-polish/scope.md

## Approach

Seven changes to make `ana --help` professional. All user-facing output — no behavioral changes, no data model changes.

Commander v14.0.3 has native `commandsGroup()` support. The approach groups commands under three headings (GETTING STARTED, PIPELINE, INTELLIGENCE) by calling `program.commandsGroup(heading)` before registering each group's commands in `index.ts`. The default `help` subcommand is suppressed with `program.addHelpCommand(false)` to eliminate the residual "Commands:" section.

The scope recommends `.hideHelp()` for the setup index subcommand, but that method doesn't exist in Commander v14. The correct API is `setupCommand.addCommand(createIndexCommand(), { hidden: true })` — same result, different call.

Descriptions are updated in each command's register function (where `.description()` is called), not centrally. Examples are added via `.addHelpText('after', ...)` on individual subcommands.

## Output Mockups

### `ana --help`
```
Usage: ana [options] [command]

Verified AI development. Ship with proof.

Options:
  -v, --version   output the version number
  -h, --help      display help for command

GETTING STARTED
  scan [path]     Detect stack, conventions, and patterns
  init            Scan project and generate agent context
  setup           Enrich context with team knowledge

PIPELINE
  work            Start, track, and complete development tasks
  artifact        Save pipeline outputs with hash verification
  verify          Verify contract assertions before code review
  pr              Create pull request from verified build

INTELLIGENCE
  proof [slug]    View proof chain entries, health, and findings
  agents          List installed agent definitions
```

### `ana scan --help`
```
Usage: ana scan [options] [path]

Detect stack, conventions, and patterns

Arguments:
  path            Directory to scan (default: current directory) (default: ".")

Options:
  --json          Output JSON format for programmatic consumption
  --save          Save scan results to .ana/scan.json
  -q, --quiet     Suppress informational stdout
  --quick         Fast scan — skip deep code analysis
  -h, --help      display help for command

EXAMPLES
  $ ana scan .
  $ ana scan /path/to/project --json
```

### `ana init --help` (examples section only)
```
EXAMPLES
  $ ana init
  $ ana init --yes
```

### `ana work start --help` (examples section only)
```
EXAMPLES
  $ ana work start fix-auth-timeout
```

### `ana artifact save --help` (examples section only)
```
EXAMPLES
  $ ana artifact save scope my-feature
  $ ana artifact save-all my-feature
```

### `ana --version`
```
ana/1.2.3
```

### Scan CTA (funnel mode, with findings)
```
  Found 3 issues. Run `ana init` to scaffold context and agents for your project.
```

### `ana setup --help`
The `index` subcommand should NOT appear. `check` and `complete` remain visible.

## File Changes

### `packages/cli/src/index.ts` (modify)
**What changes:** Reorder command registrations into three groups. Add `program.commandsGroup()` calls before each group. Add `program.addHelpCommand(false)`. Change version string from `anatomia-cli/${pkg.version}` to `ana/${pkg.version}`.
**Pattern to follow:** Current file structure — same imports, same `main()` function, just reordered registrations with group calls inserted.
**Why:** Without reordering, Commander renders commands in registration order under the wrong group headings. Without `addHelpCommand(false)`, a residual "Commands: help [command]" section appears after the groups.

### `packages/cli/src/commands/scan.ts` (modify)
**What changes:** Two changes: (1) Update `.description()` on the scan command from `'Scan project and display tech stack, file counts, and structure'` to `'Detect stack, conventions, and patterns'`. (2) Fix CTA at line 322 — change `"Found ${findings} issues. Run \`ana init\` to fix them."` to `"Found ${findings} issues. Run \`ana init\` to scaffold context and agents for your project."`. (3) Add `.addHelpText('after', ...)` with examples to the scan command.
**Pattern to follow:** Commander's `.addHelpText('after', text)` — text appears after the default help output.
**Why:** "fix them" creates a false promise — init scaffolds context, it doesn't fix scan findings.

### `packages/cli/src/commands/init/index.ts` (modify)
**What changes:** Update `.description()` from `'Initialize .ana/ context framework'` to `'Scan project and generate agent context'`. Add `.addHelpText('after', ...)` with examples.
**Pattern to follow:** Same `.addHelpText` pattern as scan.
**Why:** "context framework" is internal jargon.

### `packages/cli/src/commands/setup.ts` (modify)
**What changes:** Two changes: (1) Update `.description()` from `'Configure project context (check, complete)'` to `'Enrich context with team knowledge'`. (2) Change `setupCommand.addCommand(createIndexCommand())` to `setupCommand.addCommand(createIndexCommand(), { hidden: true })`.
**Pattern to follow:** Commander's `addCommand` second arg `{ hidden: true }`.
**Why:** "Configure project context (check, complete)" is jargon. The index subcommand is agent-internal tooling — showing it in help confuses human users.

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Update work command `.description()` from `'Track work items and complete pipelines'` to `'Start, track, and complete development tasks'`. Add `.addHelpText('after', ...)` with examples to the `start` subcommand.
**Pattern to follow:** Same `.addHelpText` pattern.
**Why:** "complete pipelines" is jargon.

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** Update artifact command `.description()` from `'Save and validate plan artifacts'` to `'Save pipeline outputs with hash verification'`. Add `.addHelpText('after', ...)` with examples to the `save` subcommand.
**Pattern to follow:** Same `.addHelpText` pattern.
**Why:** "plan artifacts" is jargon to new users.

### `packages/cli/src/commands/verify.ts` (modify)
**What changes:** Update `.description()` from `'Check contract seal integrity'` to `'Verify contract assertions before code review'`.
**Pattern to follow:** None needed — string replacement only.
**Why:** "contract seal integrity" is jargon.

### `packages/cli/src/commands/pr.ts` (modify)
**What changes:** Update `.description()` from `'Manage pull requests'` to `'Create pull request from verified build'`.
**Pattern to follow:** None needed — string replacement only.
**Why:** "Manage pull requests" is vague and doesn't convey the pipeline-specific purpose.

### `packages/cli/src/commands/agents.ts` (modify)
**What changes:** Update `.description()` from `'List deployed agents'` to `'List installed agent definitions'`.
**Pattern to follow:** None needed — string replacement only.
**Why:** "deployed" implies a server-side concept. "installed" matches what actually happens (files copied to `.claude/agents/`).

### `packages/cli/templates/.claude/skills/*/ENRICHMENT.md` (modify — 8 files)
**What changes:** Prepend `<!-- Internal: read by ana-setup only. Not for manual editing. -->` as the first line of each file, followed by a blank line before the existing content.
**Pattern to follow:** HTML comment syntax — invisible in rendered markdown.
**Why:** Prevents users from manually editing files that are consumed only by the setup agent.

The 8 files:
- `templates/.claude/skills/coding-standards/ENRICHMENT.md`
- `templates/.claude/skills/testing-standards/ENRICHMENT.md`
- `templates/.claude/skills/git-workflow/ENRICHMENT.md`
- `templates/.claude/skills/deployment/ENRICHMENT.md`
- `templates/.claude/skills/troubleshooting/ENRICHMENT.md`
- `templates/.claude/skills/ai-patterns/ENRICHMENT.md`
- `templates/.claude/skills/api-patterns/ENRICHMENT.md`
- `templates/.claude/skills/data-access/ENRICHMENT.md`

## Acceptance Criteria

- [ ] AC1: `ana scan .` on a project with findings shows "scaffold context" not "fix them"
- [ ] AC2: `ana scan --help` shows at least 2 usage examples
- [ ] AC3: `ana init --help` shows at least 1 usage example
- [ ] AC4: `ana work start --help` shows at least 1 usage example
- [ ] AC5: `ana --help` shows commands grouped into "Getting Started", "Pipeline", and "Intelligence" categories
- [ ] AC6: `scan` appears before `init` in the Getting Started group
- [ ] AC7: Every command description is free of internal jargon (no "context framework", "contract seal", "plan artifacts", "deployed agents")
- [ ] AC8: `ana --version` outputs `ana/X.Y.Z` not `anatomia-cli/X.Y.Z`
- [ ] AC9: `ana setup --help` does NOT show `index` subcommand
- [ ] AC10: Every ENRICHMENT.md starts with `<!-- Internal: ... -->` HTML comment
- [ ] AC11: All existing tests pass
- [ ] AC12: No build errors (`pnpm run build`)
- [ ] AC13: `artifact save --help` shows at least 1 usage example

## Testing Strategy

- **Unit tests:** No new unit tests required. These are string changes to help text and descriptions — no logic changes. Existing tests don't assert on help output or version format.
- **Integration tests:** After building (`pnpm run build`), manually verify `ana --help`, `ana --version`, `ana scan --help`, `ana setup --help` produce correct output. The test suite verifies nothing regresses.
- **Edge cases:** Verify `ana setup index` still works when called directly (hidden from help, not removed). Verify `ana help` no longer works as a subcommand (acceptable — `ana --help` and `ana <cmd> --help` still work).

## Dependencies

Commander v14.0.3 (already installed). No new dependencies.

## Constraints

- Do not change any command behavior — only descriptions, help text, and display format.
- The `help` built-in subcommand is suppressed. Users use `--help` flag instead. This matches `gh` behavior.
- ENRICHMENT.md changes are template files only. `dist/` copies are build artifacts — they update on `pnpm run build`.

## Gotchas

- **`addHelpCommand(false)` suppresses `ana help <cmd>`** — After this change, `ana help scan` won't work. `ana scan --help` still works. This matches `gh` behavior and is acceptable.
- **Registration order matters.** Commands appear in `--help` in the order they're registered with Commander. The `commandsGroup()` call sets the heading for all commands registered AFTER it until the next `commandsGroup()` call. If a command is registered before its group heading, it appears in the wrong section.
- **`agents` command uses `program.command()` not `program.addCommand()`.** This still works with `commandsGroup()` — Commander tracks registration order regardless of the API used.
- **`setup index` is hidden, not removed.** `ana setup index` still works when called directly by agents. Only hidden from `ana setup --help`.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Named exports only — no default exports.
- Explicit return types on exported functions.
- Engine files have zero CLI dependencies — but none of these changes touch engine files.
- Pre-commit hooks run tsc, lint, and tests. All must pass.

### Pattern Extracts

**Commander `commandsGroup` usage (verified working with v14.0.3):**
```typescript
// from verified test — this is the pattern for index.ts
program.commandsGroup('GETTING STARTED');
// register scan, init, setup commands here
program.commandsGroup('PIPELINE');
// register work, artifact, verify, pr commands here
program.commandsGroup('INTELLIGENCE');
// register proof, agents commands here
```

**Commander `addHelpText` usage (verified working):**
```typescript
// from verified test — this is the pattern for adding examples
scanCommand.addHelpText('after', '\nEXAMPLES\n  $ ana scan .\n  $ ana scan /path/to/project --json');
```

**Commander `addCommand` with hidden option (verified working):**
```typescript
// from setup.ts line 31 — current:
setupCommand.addCommand(createIndexCommand());
// change to:
setupCommand.addCommand(createIndexCommand(), { hidden: true });
```

**Current index.ts registration block (lines 35-44):**
```typescript
// Register commands (Item 22: every command uses the register* pattern).
registerInitCommand(program);
registerScanCommand(program);
registerSetupCommand(program);
registerArtifactCommand(program);
registerWorkCommand(program);
registerProofCommand(program);
registerPrCommand(program);
registerAgentsCommand(program);
registerVerifyCommand(program);
```

### Proof Context
- `index.ts`: Build concern about Commander `--json` inheritance and `enablePositionalOptions()`. Not relevant to this scope — we're not changing option handling, just registration order and group headings.
- No active proof findings for `scan.ts` or `setup.ts`.

### Checkpoint Commands

- After index.ts changes: `(cd packages/cli && pnpm vitest run --run)` — Expected: all 1866 tests pass
- After all changes: `(cd packages/cli && pnpm vitest run --run)` — Expected: 1866 tests pass (no new tests, no test changes)
- Lint: `pnpm run lint`
- Build: `pnpm run build`

### Build Baseline
- Current tests: 1866 passed, 2 skipped (1868 total)
- Current test files: 94
- Command used: `(cd packages/cli && pnpm vitest run --run)`
- After build: expected 1866 passed in 94 files (no new tests)
- Regression focus: none — no existing tests assert on help output, version format, or CTA wording
