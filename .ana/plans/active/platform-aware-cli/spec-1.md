# Spec: Platform Infrastructure (Zero Behavior Change)

**Created by:** AnaPlan
**Date:** 2026-05-30
**Scope:** .ana/plans/active/platform-aware-cli/scope.md

## Approach

Pure refactor. Add `platforms` and `platformFlags` fields to the ana.json schema and write path. Create a `platform.ts` helper module that centralizes platform directory resolution. Replace all hardcoded `.claude/agents` and `.claude/skills` path constructions in command files with helper calls. Expand static exclusion patterns in `commit.ts`, `proportionalSampler.ts`, and `symbol-index.ts` to include `.codex/` and `.agents/` directories. Every call site returns the same value as before — behavior is identical.

The helper functions in `platform.ts` return hardcoded CC paths for now (`.claude/agents`, `.claude/skills`). The config-driven platform-to-directory lookup is Scope 2. This spec establishes the indirection point — the single place that changes when multi-platform support arrives.

Follow the `branchPrefix` structural analog in `anaJsonSchema.ts` for the new schema fields. Follow the `findProjectRoot()` consumer pattern that every command file uses for the helper functions.

## Output Mockups

No user-visible output changes. `ana init` produces an `ana.json` with two new fields:

```json
{
  "anaVersion": "1.1.5",
  "name": "my-project",
  "platforms": ["claude"],
  "platformFlags": {},
  "commands": { ... }
}
```

Re-init of an existing project preserves user-set `platforms` and `platformFlags` values via the existing `...parsed.data` spread in `preserveUserState`.

## File Changes

### `packages/cli/src/commands/init/anaJsonSchema.ts` (modify)
**What changes:** Add `platforms` and `platformFlags` fields to the schema.
**Pattern to follow:** The existing `branchPrefix` field (line 66-73) for `.optional().default().catch()` with a non-trivial type. The `custom` field (line 79) for `.record()` usage.
**Why:** Without these schema fields, the config has no place to store platform configuration, and re-init would silently drop user-set values.

`platforms`: `z.array(z.string()).optional().default(['claude']).catch(['claude'])` — array of platform identifiers. Defaults to `['claude']`.

`platformFlags`: `z.record(z.string(), z.array(z.string()).catch([])).optional().default({}).catch({})` — per-platform flag arrays. Inner `.catch([])` prevents one malformed platform entry from corrupting all flags.

Place `platforms` after `surfaces` and before `coAuthor`. Place `platformFlags` immediately after `platforms`.

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** Add `platforms: ['claude']` and `platformFlags: {}` to the `anaConfig` object in `createAnaJson()`.
**Pattern to follow:** The existing `branchPrefix: 'feature/'` line (line 564) in the `anaConfig` object literal.
**Why:** Without this, fresh inits produce ana.json missing the new fields. The schema defaults would catch it on read, but the write side must match the read side (cross-check documented in schema header comment).

Place `platforms` after the `surfaces` spread (line 561) and before `coAuthor` (line 562). Place `platformFlags` immediately after `platforms`.

### `packages/cli/src/commands/platform.ts` (create)
**What changes:** New module with platform directory resolution helpers.
**Pattern to follow:** The `findProjectRoot()` pattern used by every command file — accept `cwd` as parameter, return a path string.
**Why:** Centralizes the `.claude/agents` and `.claude/skills` path knowledge. Today's six command files each construct these paths independently. When Scope 2 adds platform-to-directory mapping, one function changes instead of six files.

Functions to export:
- `getAgentsDir(cwd: string): string` — returns `path.join(cwd, '.claude', 'agents')`. Takes `cwd` (project root), returns absolute path.
- `getSkillsDir(cwd: string): string` — returns `path.join(cwd, '.claude', 'skills')`. Takes `cwd` (project root), returns absolute path.
- `getSkillsDirRel(): string` — returns `'.claude/skills'`. For consumers that need the relative path (globSync patterns in `proof.ts`).

These are intentionally simple today — they establish the indirection point. Scope 2 makes them config-aware.

### `packages/cli/src/commands/agents.ts` (modify)
**What changes:** Replace four hardcoded `.claude/agents` and `.claude/skills` path constructions with `getAgentsDir(root)` and `getSkillsDir(root)` calls. Two sites: `listAgents()` (line 88-89) and the `model` subcommand action (line 322-323).
**Pattern to follow:** The existing `findProjectRoot()` call pattern — `root` is already resolved in both functions.
**Why:** Without this, `agents.ts` would remain hardcoded while other files use helpers, creating inconsistency.

### `packages/cli/src/commands/check.ts` (modify)
**What changes:** Replace three hardcoded `.claude/skills` path constructions with `getSkillsDir(cwd)` calls. Delete the `claudePath` variable (line 1262) and replace its consumer at line 1301 with `path.join(getSkillsDir(cwd), skill, 'SKILL.md')`. Sites: `discoverSkills()` (line 796), `checkSkill()` (line 812), `validateSetupCompletion()` skill path at line 952, and `validateSetupCompletion()` skill loop at line 1301.
**Pattern to follow:** `discoverSkills` already takes `cwd` as a parameter — the helper call is a drop-in replacement.
**Why:** The `claudePath` variable at line 1262 is an intermediate that only exists to construct skill paths. Replacing it with the helper eliminates the variable entirely.

### `packages/cli/src/commands/proof.ts` (modify)
**What changes:** Replace five hardcoded `.claude/skills/` path references with helper calls. Sites: `promote` function's globSync pattern (line 1158), skill path construction (lines 1227-1228), `strengthen` function's skill discovery (line 1554) and path construction (lines 1622-1623).
**Pattern to follow:** The globSync at line 1158 uses a relative pattern with `cwd` option — use `getSkillsDirRel()` for the glob pattern, `getSkillsDir(proofRoot)` for absolute paths.
**Why:** These five references are the full set of hardcoded skill paths in proof.ts.

Note on `skillRelPath` (lines 1227, 1622): These store `.claude/skills/{name}/SKILL.md` as persistent data in `proof_chain.json`. For Scope 1, `getSkillsDirRel()` returns the same `.claude/skills` string — no data change. Scope 2 will need to handle the fact that old proof chain entries contain `.claude/skills/` paths.

### `packages/cli/src/commands/init/commit.ts` (modify)
**What changes:** Expand the static `KNOWN_ROOTS` array to include `.codex/` and `.agents/`. Also expand `EXCLUDED_PREFIXES` to include `.codex/` and `.agents/` equivalents of the existing `.claude/` exclusions.
**Pattern to follow:** The existing static array pattern — these are `const` arrays with string literals, no config reads.
**Why:** Forward-compatible. Extra roots match zero files on CC installs — no behavior change. But when Scope 2 creates `.codex/` directories, `ana init commit` will already know to include them.

`KNOWN_ROOTS` becomes: `['.ana/', '.claude/', '.codex/', '.agents/']`

`EXCLUDED_PREFIXES` gains: `.codex/` and `.agents/` mirrors of the existing `.claude/settings.local.json` and `.claude/agent-memory/` entries. Specifically: `.codex/settings.local.json`, `.codex/agent-memory/`, `.agents/settings.local.json`, `.agents/agent-memory/`. These match zero files today.

### `packages/cli/src/engine/sampling/proportionalSampler.ts` (modify)
**What changes:** Add `'**/.codex/**'` and `'**/.agents/**'` to the `EXCLUDED_PATTERNS` array alongside the existing `'**/.claude/**'`.
**Pattern to follow:** The existing entry format — glob pattern strings in a const array.
**Why:** Forward-compatible scan exclusion. Matches zero files today.

### `packages/cli/src/commands/symbol-index.ts` (modify)
**What changes:** Add `'.codex/**'` and `'.agents/**'` to the `ignorePatterns` array alongside the existing `'.claude/**'`.
**Pattern to follow:** The existing entry format.
**Why:** Forward-compatible index exclusion. Matches zero files today.

### `packages/cli/src/commands/config.ts` (modify)
**What changes:** Add `'platforms'` and `'platformFlags'` to the `KNOWN_FIELDS` set. Do NOT add to `MACHINE_MANAGED_FIELDS` — both are user-settable.
**Pattern to follow:** The existing entries in the `KNOWN_FIELDS` set.
**Why:** Without this, `ana config set platforms '["claude","codex"]'` would emit an unknown-field warning, confusing users who followed the docs.

## Acceptance Criteria

- [ ] AC1: `ana.json` contains `platforms: ["claude"]` after fresh init and after re-init of existing projects
- [ ] AC2: `ana.json` accepts `platformFlags` field preserved across re-init
- [ ] AC3: `ana agents` resolves agent directory from helper, not hardcoded path. Behavior identical to today on CC.
- [ ] AC4: `ana setup check` discovers skills from helper. Behavior identical to today on CC.
- [ ] AC5: `ana proof promote --skill coding-standards` resolves skill path from helper. Behavior identical to today on CC.
- [ ] AC6: `ana init commit` uses static `KNOWN_ROOTS` including `.codex/` and `.agents/`. Behavior identical to today on CC.
- [ ] AC14: `ana scan` excludes `.codex/` and `.agents/` directories from sampling
- [ ] Tests pass with `pnpm run test -- --run`. No build errors. Test count does not decrease from 3001.

## Testing Strategy

- **Unit tests for `platform.ts`:** Test `getAgentsDir`, `getSkillsDir`, `getSkillsDirRel` return correct paths. Test with various `cwd` values including paths with spaces.
- **Schema tests for `anaJsonSchema.ts`:** Test `platforms` field defaults, catches, empty array fallback. Test `platformFlags` field with valid data, malformed inner values (inner `.catch([])`), missing field. Follow the existing schema test patterns.
- **Integration tests for `createAnaJson`:** Verify fresh init writes `platforms` and `platformFlags` to the output JSON. Verify re-init preserves user-set values.
- **Regression:** Run the full test suite. All 3001 tests must pass. The path helper changes must produce identical behavior — test the command files indirectly through their existing test coverage.

## Dependencies

None. This spec is self-contained.

## Constraints

- Zero behavior change. Every command must produce identical output before and after this spec.
- The `platforms` and `platformFlags` fields must survive re-init via the existing `...parsed.data` spread — no additional merge code.
- `KNOWN_ROOT_FILES` (line 68, `CLAUDE.md`) is NOT a change target — it's a cross-platform filename.
- `init/index.ts` line 138 `.claude/` string in gitignore warning is NOT a change target — it refers to the literal `.claude/` directory that init creates, which is still `.claude/` in Scope 1.

## Gotchas

- **`proof.ts` globSync patterns use relative paths.** Line 1158: `globSync('.claude/skills/*/SKILL.md', { cwd: proofRoot })`. The helper must provide a relative-path variant (`getSkillsDirRel()`) for this pattern. An absolute path would break globSync's cwd-relative resolution.
- **`skillRelPath` is persistent data.** Lines 1227 and 1622 write `skillRelPath` into `proof_chain.json`. Changing the return value of the helper changes historical data format. In Scope 1 the value is identical (`.claude/skills`), but document this for Scope 2.
- **Schema cross-check with `createAnaJson`.** The schema header comment (line 25-29) documents that every field in `createAnaJson` must exist in the schema and vice versa. Both `platforms` and `platformFlags` must appear in both places.
- **`EXCLUDED_PREFIXES` additions match zero files.** The `.codex/` and `.agents/` entries are forward-compatible — they won't affect any existing infrastructure commits because those directories don't exist yet.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { getSkillsDir } from './platform.js'`
- Use `node:` prefix for built-ins: `import * as path from 'node:path'`
- Named exports only, no default exports
- Explicit return types on all exported functions
- Exported functions require `@param` and `@returns` JSDoc tags
- Use `import type` for type-only imports, separate from value imports

### Pattern Extracts

**Schema field pattern** (from `anaJsonSchema.ts` lines 66-73):
```typescript
    branchPrefix: z
      .union([
        z.string(),
        z.record(z.string(), z.string()),
      ])
      .optional()
      .default('feature/')
      .catch('feature/'),
```

**createAnaJson config object** (from `state.ts` lines 554-567):
```typescript
  const anaConfig: Record<string, unknown> = {
    anaVersion: cliVersion,
    name: result.overview.project,
    language: result.stack.language || null,
    framework: result.stack.framework || null,
    packageManager: result.commands.packageManager,
    commands,
    ...(Object.keys(surfaces).length > 0 ? { surfaces } : {}),
    coAuthor: 'Ana <build@anatomia.dev>',
    artifactBranch: detectArtifactBranch(result),
    branchPrefix: 'feature/',
    lastScanAt: result.overview.scannedAt,
    custom: {},
  };
```

**KNOWN_ROOTS pattern** (from `commit.ts` lines 60-63):
```typescript
const KNOWN_ROOTS = [
  '.ana/',
  '.claude/',
];
```

**Helper consumer pattern** (from `agents.ts` lines 87-89):
```typescript
  const root = findProjectRoot();
  const agentsDir = path.join(root, '.claude/agents');
  const skillsDir = path.join(root, '.claude/skills');
```

### Proof Context

- `work.ts`: `getNextAction` not yet moved to `work-state.ts` (decompose-work-ts-C1). Not relevant — this spec doesn't touch `getNextAction`.
- `check.ts`: No active proof findings for affected paths (skill discovery, `claudePath` variable).
- `proof.ts`: No active proof findings for promote/strengthen skill paths.

### Checkpoint Commands

- After `anaJsonSchema.ts` + `state.ts` + `config.ts` changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: all existing schema/init tests pass
- After `platform.ts` creation + consumer updates (`agents.ts`, `check.ts`, `proof.ts`): `(cd 'packages/cli' && pnpm vitest run)` — Expected: all existing tests still pass (identical behavior)
- After exclusion pattern expansions (`commit.ts`, `proportionalSampler.ts`, `symbol-index.ts`): `(cd 'packages/cli' && pnpm vitest run)` — Expected: all tests pass
- After all changes: `pnpm run test -- --run` — Expected: 3001+ tests pass
- Lint: `pnpm run lint`

### Build Baseline

- Current tests: 3001 passed, 2 skipped (3003 total)
- Current test files: 127
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected 3001+ tests in 127+ files (new `platform.test.ts` adds file count)
- Regression focus: `tests/commands/agents.test.ts`, `tests/commands/check-dashboard.test.ts`, `tests/commands/proof.test.ts`, `tests/commands/init.test.ts`
