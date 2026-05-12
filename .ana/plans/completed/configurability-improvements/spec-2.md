# Spec: CLI Config Command

**Created by:** AnaPlan
**Date:** 2026-05-11
**Scope:** .ana/plans/active/configurability-improvements/scope.md

## Approach

New `ana config` command with `get` and `set` subcommands. Reads and writes `.ana/ana.json` directly — raw JSON, not through the Zod schema validator. This is intentional: config is a debug/utility tool, and showing actual file contents (even if corrupted) is more useful than silently returning `.catch()` defaults.

The command follows `agents.ts` structure: exported register function, subcommands via Commander, `findProjectRoot()` for project resolution, `--json` flag for scriptability. One key difference: `agents.ts` reads `.claude/agents/` files while `config` reads/writes `.ana/ana.json`.

**Machine-managed field blocklist:** A hardcoded constant array of fields that `config set` rejects: `anaVersion`, `name`, `language`, `framework`, `packageManager`, `setupPhase`, `lastScanAt`. Each field maps to the command that manages it (e.g., `ana init`, `ana scan`, `ana setup`). Error message tells the user which command to use instead.

**Dot notation traversal:** Both `get` and `set` support dot-separated paths for nested access. `config get commands.test` returns the `test` key from the `commands` object. `config set custom.myKey value` creates the `custom` object if needed and sets `myKey`. Traversal into a non-object value (string, number, null) errors clearly.

**Value parsing on set:** Try `JSON.parse(value)` first — this handles numbers (`42`), booleans (`true`/`false`), null, arrays, objects. If `JSON.parse` throws, treat the input as a string literal. This means `ana config set custom.port 8080` writes the number `8080`, and `ana config set custom.name "my project"` writes the string `my project`.

**Unknown key warning:** When setting a top-level key that isn't in the schema and doesn't start with `custom.`, print a warning: `Warning: '{key}' is not a known ana.json field. Use 'custom.{key}' to avoid future collisions.` Then write it anyway. The user chose to do this — warn, don't block.

## Output Mockups

**`ana config` (show all):**
```
$ ana config
anaVersion:     1.0.0
name:           my-project
language:       TypeScript
framework:      null
packageManager: pnpm
commands:
  build:        pnpm run build
  test:         pnpm vitest run
coAuthor:       Ana <build@anatomia.dev>
artifactBranch: main
branchPrefix:   feature/
setupPhase:     complete
lastScanAt:     2026-05-04T22:12:48.293Z
custom:         {}
```

**`ana config --json`:**
```json
{
  "anaVersion": "1.0.0",
  "name": "my-project",
  "language": "TypeScript",
  ...
}
```

**`ana config get branchPrefix`:**
```
feature/
```

**`ana config get branchPrefix --json`:**
```
"feature/"
```

**`ana config get commands.test`:**
```
pnpm vitest run
```

**`ana config get custom.myKey` (missing key):**
```
(undefined)
```

**`ana config set branchPrefix dev/`:**
```
Set branchPrefix = "dev/"
```

**`ana config set custom.team.name "Engineering"`:**
```
Set custom.team.name = "Engineering"
```

**`ana config set setupPhase complete` (machine-managed):**
```
Error: 'setupPhase' is managed by 'ana setup'. Use that command instead.
```

**`ana config set myField value` (unknown key warning):**
```
Warning: 'myField' is not a known ana.json field. Use 'custom.myField' to avoid future collisions.
Set myField = "value"
```

**`ana config` with no ana.json:**
```
Error: No ana.json found. Run `ana init` first.
```

## File Changes

### `packages/cli/src/commands/config.ts` (create)
**What changes:** New command module with `registerConfigCommand()` export. Three actions: bare `config` (display all), `config get <field>`, `config set <field> <value>`. Includes `--json` flag, machine-managed blocklist, dot-notation traversal, value parsing, and unknown-key warning.
**Pattern to follow:** `packages/cli/src/commands/agents.ts` — register function, subcommands, error handling with `chalk.red` + `process.exitCode = 1`, `findProjectRoot()`.
**Why:** This is the entire config CLI surface. No existing file serves this purpose.

### `packages/cli/src/index.ts` (modify)
**What changes:** Import and register `registerConfigCommand`. Add a new `CONFIGURATION` group between PIPELINE and INTELLIGENCE.
**Pattern to follow:** Existing registration pattern — `program.commandsGroup('CONFIGURATION')` followed by `registerConfigCommand(program)`, placed after the PIPELINE group and before the INTELLIGENCE group.
**Why:** Config needs to appear in `--help` output in a logical group.

### `packages/cli/tests/commands/config.test.ts` (create)
**What changes:** Test file covering all config command behavior.
**Pattern to follow:** `packages/cli/tests/commands/agents.test.ts` — temp directory setup with `fs.mkdtemp`, `process.chdir`, `vi.spyOn(console, 'log')`, Commander program creation via `registerConfigCommand`, `createTestProject` helper.
**Why:** 12+ tests covering get, set, blocklist, dot notation, value parsing, JSON output, error cases.

## Acceptance Criteria

- [ ] AC7: `ana config` with no args displays all ana.json fields
- [ ] AC8: `ana config get <field>` returns the field value
- [ ] AC9: `ana config get custom.<field>` traverses into nested custom fields
- [ ] AC10: `ana config set <field> <value>` writes to ana.json, preserving all other fields
- [ ] AC11: `ana config set` rejects machine-managed fields (`anaVersion`, `name`, `language`, `framework`, `packageManager`, `setupPhase`, `lastScanAt`) with an error naming the managing command
- [ ] AC12: `ana config set` parses values correctly — numbers, booleans, null via JSON.parse, strings as fallback
- [ ] AC13: `ana config set custom.<path>` creates intermediate objects
- [ ] AC14: `ana config --json` and `ana config get <key> --json` output valid JSON
- [ ] AC15: `ana config` with no ana.json fails with "Run `ana init` first"
- [ ] AC16: No existing tests break. Test count increases.
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `pnpm run build`

## Testing Strategy

- **Unit tests (config.test.ts):**
  - `config` bare: displays all fields from a valid ana.json
  - `config --json`: outputs valid JSON matching file contents
  - `config get <field>`: returns top-level field value
  - `config get <field>` missing key: prints `(undefined)`
  - `config get commands.test`: dot notation traversal into nested object
  - `config get custom.nested.key`: deep dot notation
  - `config set <field> <value>`: writes value, preserves other fields (read file back and verify)
  - `config set` machine-managed field: prints error, does not write
  - `config set` value parsing: number (`42`), boolean (`true`), null, string fallback
  - `config set custom.new.path value`: creates intermediate objects
  - `config set unknownField value`: writes but prints warning
  - `config --json` and `config get <key> --json`: valid JSON output
  - No ana.json: prints init-first error
- **Edge cases:**
  - `config get` on a field whose value is `null` — display "null", not empty
  - `config get` on a field whose value is `false` — display "false", not empty
  - `config set` with a JSON object value: `ana config set custom.obj '{"a":1}'`
  - Dot notation traversal into a non-object: `config get branchPrefix.sub` — clear error

## Dependencies

Phase 1 must be complete. Without passthrough, `config set` on an unknown key gets silently deleted on next `ana init`.

## Constraints

- Config reads raw JSON, not through `AnaJsonSchema.parse()`. Actual file contents, not validated/defaulted values.
- No atomic writes — match existing `writeFile` pattern.
- Machine-managed blocklist is a hardcoded constant, not derived from the schema.

## Gotchas

- `branchPrefix` is a known schema field with `.default('feature/')`. It is NOT machine-managed — users should be able to `config set branchPrefix dev/`. Make sure it's not in the blocklist.
- `commands` is also user-writable (set by init from scan, but users can customize). Same — not in the blocklist.
- `coAuthor` and `artifactBranch` are user-writable. Not in the blocklist.
- `custom` itself is a schema field. `config set custom {}` should work (replaces the custom object). `config set custom.key value` traverses into it.
- The display format for bare `config` (key-value listing) needs to handle nested objects like `commands` and `custom`. Flatten one level deep with indentation, or use `JSON.stringify` for nested values. The mockup above shows one level of indentation for `commands` — follow that pattern.
- For `--json` on bare `config`, output the raw file content parsed as JSON and re-serialized (to ensure valid JSON). Don't add fields that aren't in the file.
- `findProjectRoot()` throws if no `.ana/` directory exists. The config command needs to catch this and show the "Run `ana init` first" message, same as agents does.
- The mapping of machine-managed fields to their managing commands: `anaVersion` → `ana init`, `name` → `ana init`, `language` → `ana scan`, `framework` → `ana scan`, `packageManager` → `ana scan`, `setupPhase` → `ana setup`, `lastScanAt` → `ana scan`.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins
- Use `import type` for type-only imports, separate from value imports
- Prefer named exports — `export function registerConfigCommand`
- Exported functions require `@param` and `@returns` JSDoc tags
- Error handling: `chalk.red(msg)` + `process.exitCode = 1` for user-facing errors
- Engine files have zero CLI deps — but config.ts is a command, not engine, so chalk is fine
- Explicit return types on exported functions

### Pattern Extracts

**Command registration (from `packages/cli/src/commands/agents.ts:306-317`):**
```typescript
export function registerAgentsCommand(program: Command): void {
  const agentsCommand = new Command('agents')
    .description('Agent dashboard — list agents, manage models')
    .action(() => {
      try {
        listAgents();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      }
    });
```

**Index registration with groups (from `packages/cli/src/index.ts:44-53`):**
```typescript
program.commandsGroup('PIPELINE');
registerWorkCommand(program);
registerArtifactCommand(program);
registerVerifyCommand(program);
registerPrCommand(program);

program.commandsGroup('INTELLIGENCE');
registerProofCommand(program);
registerAgentsCommand(program);
```

**Test setup (from `packages/cli/tests/commands/agents.test.ts:42-55`):**
```typescript
beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agents-test-'));
  originalCwd = process.cwd();
  process.chdir(tempDir);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  process.chdir(originalCwd);
  await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
});
```

### Proof Context
- `index.ts` has a known fragility around Commander `--json` inheritance between parent and subcommands. The config command uses its own `--json` option on each subcommand — no inheritance needed.
- `commandsGroup()` is Commander v14-specific — confirmed this project uses commander ^12, but the method is available. Verify it works by running `--help` after registration.

### Checkpoint Commands

- After creating config.ts: `pnpm run build` — Expected: compiles without errors
- After creating config.test.ts: `(cd packages/cli && pnpm vitest run tests/commands/config.test.ts)` — Expected: all config tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2120+ tests pass, 0 failures
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2107 passed, 2 skipped (2109 total)
- Current test files: 99 passed
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2119+ tests (12+ new in config.test.ts) in 100+ files
- Regression focus: No existing files modified except `index.ts` (import + registration only). Low regression risk.
