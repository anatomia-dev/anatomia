# Scope: Monorepo Root Commands

**Created by:** Ana
**Date:** 2026-05-17

## Intent

In monorepos, the scan detects root-level commands (`turbo run build`, `pnpm run test`) but only surfaces primary-package-scoped commands to ana.json. When pipeline work targets a non-primary package, the worktree builds the wrong package, baseline tests run in the wrong place, and the proof chain records results from the wrong package. The data already exists in `scan.json.commands.all` — it just needs promotion to ana.json and consumption by the worktree and agent templates.

## Complexity Assessment
- **Kind:** feature
- **Size:** small — schema addition, one behavior change, template clarifications
- **Files affected:**
  - `src/commands/init/anaJsonSchema.ts` — add optional `buildRoot` / `testRoot` fields
  - `src/commands/init/state.ts` — populate `buildRoot` / `testRoot` from scan data in `createAnaJson`
  - `src/utils/worktree.ts` — `runBuildCommand` fallback chain: `buildRoot` → `build` → null
  - `packages/cli/templates/.claude/agents/ana-build.md` — clarify baseline vs. focused commands
  - `packages/cli/templates/.claude/agents/ana-verify.md` — use Build Brief for test runs, not `commands.test`
  - `.claude/agents/ana-build.md` — dogfood copy of Build template
  - `.claude/agents/ana-verify.md` — dogfood copy of Verify template
- **Blast radius:** Every pipeline run reads ana.json commands and follows template instructions. The schema change is additive (new optional fields). The worktree change has a clean fallback. Template changes affect agent behavior for all future pipeline runs across all customers.
- **Estimated effort:** ~1 hour pipeline run
- **Multi-phase:** no

## Approach

Promote root-level monorepo commands from scan data to ana.json as `buildRoot` and `testRoot`. The worktree uses `buildRoot` when available to compile all workspace packages (including dependency packages like `@superglue/shared`), falling back to `build` for single-package projects. Agent templates get clarified roles: ana.json commands for project-wide operations (building, baseline), Build Brief checkpoint commands for focused package-scoped work during development and verification.

No per-package command maps. No dependency graph resolution. The spec's Build Brief already tells agents which package to test — the gap is only in the mechanical infrastructure (worktree build, template clarity).

## Acceptance Criteria
- AC1: For monorepos with root-level build/test scripts, `ana init` produces ana.json with `buildRoot` and `testRoot` fields alongside the existing scoped `build` and `test`.
- AC2: For single-package projects, ana.json has no `buildRoot` or `testRoot` fields (or they are null). Behavior is identical to current.
- AC3: `runBuildCommand` in worktree.ts uses `buildRoot` when present, falls back to `build` when not, returns null when neither exists.
- AC4: Existing ana.json files without `buildRoot`/`testRoot` survive re-init — `preserveUserState` handles the new fields correctly via passthrough.
- AC5: The Build template distinguishes baseline commands (ana.json `buildRoot`/`build`) from focused commands (Build Brief checkpoint commands). No competing instructions.
- AC6: The Verify template uses Build Brief checkpoint commands for test runs, not `commands.test` from ana.json.
- AC7: The Build report Verification Commands section references the commands Verify should actually run (Build Brief checkpoint commands), not hardcoded ana.json references.

## Edge Cases & Risks
- **Root package.json has no build/test scripts.** `buildRoot`/`testRoot` stay null. Worktree falls back to scoped `build`. No regression.
- **Monorepo without turbo/nx.** Root scripts might be `pnpm -r run build` or similar. Still correct — these build all packages. The detection reads whatever scripts exist in the root package.json.
- **User overrides `buildRoot` via `ana config set`.** Should work — `preserveUserState` preserves user-owned fields. AnaJsonSchema passthrough handles unknown fields, but explicit schema fields are cleaner.
- **`buildRoot` command fails in worktree.** Current behavior: `runBuildCommand` returns false, worktree-context.md reports "Build command failed." Same behavior with `buildRoot` — no regression in failure handling.
- **Template changes affect all customers.** The clarification removes ambiguity — it doesn't change what good agents already do (read the spec, test in the right place). It prevents bad outcomes where agents follow `commands.test` literally for cross-package work.

## Rejected Approaches
- **Per-package command map** (`commands.packages["core"].test`). The Build Brief already tells agents which package to target. A command map would duplicate information that Plan already curates per-scope, add schema complexity, and require maintenance for package additions/removals. The disease is "worktree builds the wrong thing" — not "agents don't know which package to test."
- **`lintRoot` field.** Lint is already root-scoped — our ana.json has `pnpm run lint` with no `cd`. Confirmed by inspection. Adding `lintRoot` would be speculative infrastructure.
- **Overwriting `build` with root command.** Loses the scoped command for focused iteration. Both are useful — root for "compile everything once," scoped for "rebuild just this package during development."
- **Turbo `--filter` integration.** Would require detecting turbo, constructing `--filter=<package>...` commands, handling the `...` dependency suffix. Over-engineering — root build already compiles all packages in dependency order. Save for when someone reports that building everything is too slow.

## Open Questions
- Should `getBuildCommandString` (worktree.ts) also prefer `buildRoot`? It's used for the worktree-context.md display message. Currently re-reads ana.json independently (existing finding `worktree-build-step-C3`). Plan should decide whether to fix the display or just the execution.

## Exploration Findings

### Patterns Discovered
- `createAnaJson` (state.ts:400–470): Scoped commands constructed by reading primary package's package.json scripts. Root commands available in `result.commands.all` but never promoted.
- `detectCommands` (commands.ts:26–80): Reads ROOT package.json, stores all scripts in `commands.all`. This is the data source for `buildRoot`/`testRoot`.
- `runBuildCommand` (worktree.ts:446–471): Reads `commands.build` from worktree's ana.json, runs via `spawnSync` with `shell: true`. Clean insertion point for fallback chain.

### Constraints Discovered
- [TYPE-VERIFIED] AnaJsonSchema uses `.passthrough()` (anaJsonSchema.ts:62) — unknown fields survive parse, but explicit schema fields give type safety and `.catch()` resilience
- [TYPE-VERIFIED] `commands` field is `z.record(z.string(), z.unknown())` (anaJsonSchema.ts:44) — untyped bag. `buildRoot`/`testRoot` would survive passthrough even without schema changes, but explicit fields are cleaner
- [OBSERVED] `preserveUserState` (state.ts:553–563) sanitizes blank commands for `test`, `build`, `lint` only — new fields need the same treatment or explicit handling
- [OBSERVED] Product templates live in `packages/cli/templates/.claude/agents/` — dogfood copies in `.claude/agents/`. Both must be updated. Template improvements don't reach existing users (merge-not-overwrite on re-init).

### Test Infrastructure
- Worktree tests: `tests/unit/utils/worktree.test.ts` — covers `runBuildCommand`, mocks `spawnSync` and `readFileSync`
- State tests: `tests/unit/commands/init/state.test.ts` — covers `createAnaJson`, monorepo command scoping
- Schema tests: `tests/unit/commands/init/anaJsonSchema.test.ts` — covers parse, passthrough, catch behavior

## For AnaPlan

### Structural Analog
`runBuildCommand` in worktree.ts (lines 446–471) — the exact function being modified. Its pattern (read ana.json → extract command → spawnSync) is the shape for the fallback chain change. Also: the existing monorepo scoping block in `createAnaJson` (state.ts:415–450) is the structural analog for the new `buildRoot`/`testRoot` population logic — same location, same pattern (read scan data, construct command, assign to config).

### Relevant Code Paths
- `packages/cli/src/commands/init/state.ts:400–470` — `createAnaJson`, where `buildRoot`/`testRoot` get populated
- `packages/cli/src/commands/init/anaJsonSchema.ts:37–62` — schema, where new fields get declared
- `packages/cli/src/utils/worktree.ts:446–471` — `runBuildCommand`, where fallback chain changes
- `packages/cli/src/utils/worktree.ts:586–617` — `writeWorktreeContext`, where `getBuildCommandString` is called for display
- `packages/cli/src/engine/detectors/commands.ts:26–80` — `detectCommands`, source of `commands.all` (read-only, no changes needed)
- `packages/cli/src/engine/scan-engine.ts:857–860` — where `detectCommands` result flows into `EngineResult` (read-only)

### Patterns to Follow
- Schema field pattern: follow `artifactBranch` in anaJsonSchema.ts — `z.string().nullable().optional().catch(undefined)` for new optional fields
- Command construction: follow the existing scoped-command block in state.ts:415–450 — same `const pm = ...` / `const prefix = ...` pattern
- Worktree fallback: follow the existing `buildCmd` null check at worktree.ts:454 — same conditional structure

### Known Gotchas
- `preserveUserState` (state.ts:553–563) sanitizes blank strings for `test`, `build`, `lint`. If `buildRoot`/`testRoot` can be set via `ana config set` and accidentally blanked, they need the same sanitization.
- `getBuildCommandString` (worktree.ts) re-reads ana.json independently of `runBuildCommand`. Existing finding `worktree-build-step-C3`. Decide whether to fix or leave — it only affects the display message in worktree-context.md, not execution.
- Template changes affect product templates (what customers get) AND dogfood copies (what we use). Four files total: two Build, two Verify. The dogfood copies may have drifted from product templates — diff before editing.
- The Build report template (lines 370–373 in Build template) hardcodes `{build command from ana.json commands.build}` — this is prose guidance to the agent, not code. The fix is rewording the template text to reference Build Brief commands.

### Things to Investigate
- Diff dogfood Build/Verify templates against product templates to assess drift before editing. If they've diverged, decide which is canonical.
