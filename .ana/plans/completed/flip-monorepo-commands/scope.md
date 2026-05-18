# Scope: Flip Monorepo Command Semantics

**Created by:** Ana
**Date:** 2026-05-17

## Intent

The scan detects root-level commands (`pnpm run build`, `pnpm run test`) but only surfaces primary-package-scoped commands to ana.json. When pipeline work targets a non-primary package, the worktree builds the wrong package, baseline tests run in the wrong place, and the proof chain records misleading results.

The original attempt (`monorepo-root-commands`) solved this by adding `buildRoot`/`testRoot` alongside the existing scoped `build`/`test`. That created conditional template language ("use `buildRoot` or `build`"), a `??` fallback chain in the worktree, and redundant fields for single-package projects. Post-verify scrutiny revealed the naming was backwards: `build` should mean "build the project" — what every developer expects. The scoped command is the specialization, not the default.

This scope flips the semantics: `build`/`test` are project-wide. `buildPackage`/`testPackage` are the scoped monorepo variants. Templates say "use `build`" unconditionally. Worktree reads `build` directly. Single-package projects have clean config with zero extra fields.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — semantic flip in command generation, template rewrites across 3 agent templates, config validation, docs update, propagation loop for re-init
- **Files affected:**
  - `packages/cli/src/commands/init/state.ts` — flip command assignment in `createAnaJson`, add propagation loop to `preserveUserState`
  - `packages/cli/src/commands/config.ts` — add `buildPackage`/`testPackage` to COMMAND_FIELDS
  - `packages/cli/templates/.claude/agents/ana-build.md` — unconditional "use `build`", Build Brief for focused testing
  - `packages/cli/templates/.claude/agents/ana-verify.md` — unconditional "use `build`", Build Brief for test verification
  - `packages/cli/templates/.claude/agents/ana-plan.md` — reference `test` for baseline, `testPackage` or Build Brief for checkpoints
  - `.claude/agents/ana-build.md` — dogfood sync
  - `.claude/agents/ana-verify.md` — dogfood sync
  - `.claude/agents/ana-plan.md` — dogfood sync
  - `website/content/docs/guides/troubleshooting.mdx` — update monorepo command guidance (2 TroubleCards)
  - `website/content/docs/start.mdx` — line 44 callout says "In monorepos they may not target the right package" which is stale after the flip (commands ARE project-wide now)
- **Files NOT affected (verified):**
  - `packages/cli/src/utils/worktree.ts` — already reads `commands.build` directly (line 452). After the flip, `build` contains the project-wide command. Zero code changes needed. The worktree automatically gets correct behavior from the upstream change in `createAnaJson`.
  - `packages/cli/src/commands/init/anaJsonSchema.ts` — `commands` is `z.record(z.string(), z.unknown())` with passthrough. New keys handled automatically.
  - Setup template (`ana-setup.md`) — shows `commands.build`/`commands.test` during confirmation. After the flip these are project-wide, which matches the descriptions ("Verify runs this", "Build runs this to compile"). More accurate than before.
- **Blast radius:** Every pipeline run reads ana.json commands and follows template instructions. The semantic flip changes what `build`/`test` mean for monorepo projects. Single-package projects are unaffected — their `build`/`test` were already project-wide. Templates affect agent behavior for all future pipeline runs across all customers. Worktree behavior changes automatically (reads `build` which now has a different value) without code changes.
- **Estimated effort:** ~1.5 hour pipeline run
- **Multi-phase:** no

## Approach

Reverse the command assignment flow in `createAnaJson`. Currently: start with root, overwrite with scoped, discard root. After: root commands stay as `build`/`test` (never overwritten). The monorepo block computes `buildPackage`/`testPackage` as NEW keys — additive, not destructive. Write `buildPackage`/`testPackage` only when the project is a monorepo AND the scoped command differs from the root command.

The worktree just reads `build` — the word means "build the project" now, which is exactly what the worktree needs. No fallback chain. No conditional logic.

Templates get simplified: "use `build`" replaces "use `buildRoot` or `build`". The Plan template tells planners to use `test` for the full baseline run and to put the right package-scoped command in the Build Brief (using `testPackage` as a starting point for monorepos, but the Build Brief is always authoritative for the specific scope).

A propagation loop in `preserveUserState` ensures new command keys (like `buildPackage`/`testPackage`) appear on re-init without overwriting user customizations to existing keys.

## Acceptance Criteria
- AC1: For monorepos, `build` and `test` in ana.json are project-wide root commands (no `(cd ...` prefix).
- AC2: For monorepos, `buildPackage` and `testPackage` contain the primary-package-scoped commands, and only appear when they differ from `build`/`test`.
- AC3: For single-package projects, only `build`, `test`, `lint`, `dev` exist. No `buildPackage`/`testPackage`.
- AC4: Worktree `runBuildCommand` continues to read `commands.build` directly (no code change needed — it already does this). After the flip, `build` contains the project-wide command, so the worktree compiles all packages correctly.
- AC5: Build template says "use `build`" unconditionally for baseline builds, Build Brief checkpoint commands for focused testing. No "if present" or "or" language.
- AC6: Verify template uses `build` for the build step and Build Brief checkpoint commands for test verification.
- AC7: Plan template references `test` for full baseline runs. For Build Brief checkpoint commands, Plan uses `testPackage` as a starting point but adapts the path for the ACTUAL target package of the scope (since `testPackage` always targets the primary package, which may not be the scope's target).
- AC8: `preserveUserState` propagation loop: new command keys from fresh detection appear on re-init without overwriting existing user-customized values.
- AC9: `ana config set commands.buildPackage ""` is rejected (COMMAND_FIELDS validation).
- AC10: Troubleshooting docs and quickstart callout reflect the new command semantics.
- AC11: Dogfood templates (`.claude/agents/`) are byte-identical to product templates after changes.

## Edge Cases & Risks
- **Root package.json has no build/test scripts.** `build`/`test` are null. `buildPackage`/`testPackage` not written. Worktree gets `null` from `runBuildCommand` — returns null (already handled, same as today).
- **Monorepo where root and scoped commands are identical.** Don't write `buildPackage`/`testPackage` — they'd be redundant. The "only when different" check prevents noise.
- **User has customized `build` via `ana config set`.** Preserved by `preserveUserState` — the propagation loop only adds keys that don't exist in old config, never overwrites.
- **Re-init on our own repo.** Our current `build` is the scoped command `(cd packages/cli && pnpm run build)`. After the flip, the fresh `build` should be `pnpm run build`. But `preserveUserState` preserves old values — our `build` won't flip automatically. Resolution: delete `.ana/ana.json` before re-init to get fresh values. Context files, proof chain, skills all preserved separately. This is a one-time migration for us only; future customers fresh-init correctly.
- **Pipeline work targeting a non-primary package.** `testPackage` is scoped to the PRIMARY package. If work targets a different package, the Build Brief must have the correct command. The Plan template should note: "use `testPackage` as a starting point, but always write the correct command for THIS scope's target package."
- **`buildPackage`/`testPackage` written with unsanitized pkg.path.** Existing finding `monorepo-build-scoping-C5` — path with spaces/special chars produces broken subshell. Same risk as today's `build` field. Not introducing new unsanitized paths; the existing risk carries over to the new field names.

## Rejected Approaches
- **`buildRoot`/`testRoot` alongside `build`/`test` (the original scope).** Requires fallback chains (`buildRoot ?? build`), conditional template language, always-write redundancy for single-package projects. The naming fights developer intuition — `build` should mean "build the project." Went through full pipeline, passed verification, but post-verify scrutiny revealed the design was backwards.
- **Per-package command map** (`commands.packages["core"].test`). The Build Brief already tells agents which package to target. A map would duplicate Plan's curation, add schema complexity, and require maintenance for package additions/removals. The disease is "worktree builds the wrong thing" — not "agents don't know which package to test."
- **Overwriting `build` with root command without adding scoped variants.** Loses the primary-package-scoped command entirely. `buildPackage`/`testPackage` preserve it for planners who want a default starting point for Build Brief checkpoints.
- **`lintPackage` field.** Lint scoping is unchanged by this work. The code DOES scope lint to the primary package for fresh monorepo inits (state.ts:441-446), but our preserved ana.json has root-level `pnpm run lint`. Either way, lint doesn't need the flip: the worktree doesn't run lint mechanically, lint has no "compile dependencies" failure mode, and scoped lint is actually reasonable (you lint what you're working on). Can be revisited separately if users report issues.

## Open Questions
- None. The design is settled through multi-round scrutiny. Implementation details are clear from the requirements analysis and the original pipeline run.

## Exploration Findings

### Patterns Discovered
- `createAnaJson` (state.ts:400–470): Current flow captures root commands (`result.commands.build`), then overwrites with scoped. The flip reverses this — root stays as `build`, scoped becomes `buildPackage`.
- `detectCommands` (commands.ts:26–80): Reads ROOT package.json. Returns `commands.build` as the root-level command. This becomes `build` in ana.json directly — no transformation needed.
- `makeTestCommandNonInteractive` (state.ts:400): Processes `result.commands.test` into a non-interactive variant. This processed value becomes `test` in ana.json. The scoped variant (after monorepo rewrite) becomes `testPackage`.
- `runBuildCommand` (worktree.ts:446–471): Already reads `commands.build` on main — no code changes needed. After the flip, `commands.build` IS the project-wide command. The function automatically gets correct behavior.
- `preserveUserState` (state.ts:553–563): Sanitizes blank strings for `['test', 'build', 'lint']`. Needs `buildPackage`/`testPackage` added. Also needs the propagation loop for new keys.
- `COMMAND_FIELDS` (config.ts:328): Currently `['commands.test', 'commands.build', 'commands.lint', 'commands.dev']`. Needs `'commands.buildPackage'` and `'commands.testPackage'`.
- Plan template (ana-plan.md:420–427): Currently says "Copy checkpoint commands from ana.json commands field" and "Run the test command from ana.json commands.test." Needs updating to reference `testPackage` for checkpoints and `test` for baseline.

### Constraints Discovered
- [TYPE-VERIFIED] `commands` field in AnaJsonSchema is `z.record(z.string(), z.unknown())` (anaJsonSchema.ts:44) — `buildPackage`/`testPackage` survive passthrough without schema changes
- [OBSERVED] `preserveUserState` preserves ALL existing keys via schema `.passthrough()` — old `build` value survives re-init even if fresh detection produces a different value. This is correct behavior (user customization wins) but means our own repo needs manual `ana.json` reset.
- [OBSERVED] Product templates in `packages/cli/templates/.claude/agents/` — dogfood copies in `.claude/agents/`. All three pairs (build, verify, plan) are currently byte-identical (verified via diff).
- [OBSERVED] Troubleshooting page has two TroubleCards that reference command field names (lines 41 and 69-72). Both need updating.
- [OBSERVED] The scan stores raw root-level scripts in `scan.json.commands.all` AND as `result.commands.build`/`result.commands.test` in the engine result. Both are available in `createAnaJson`.

### Test Infrastructure
- Monorepo command scoping tests: `tests/commands/init/monorepoCommandScoping.test.ts` — 12 existing tests. Uses `makeMonorepoResult` helper with mock fs for package.json. Structural analog for new tests.
- Worktree tests: `tests/utils/worktree.test.ts` — covers `createWorktree` which calls `runBuildCommand` internally. Uses temp dirs with real git repos.
- Schema tests: `tests/commands/init/anaJsonSchema.test.ts` — covers parse, passthrough, catch behavior.
- Config tests: likely in `tests/commands/config.test.ts` — covers COMMAND_FIELDS validation.

## For AnaPlan

### Structural Analog
The existing monorepo scoping block in `createAnaJson` (state.ts:415–450) is the structural analog — same location, same conditional structure. The flip reverses the data flow: instead of "compute root, overwrite with scoped, capture root before overwrite," it becomes "root stays as build/test, scoped computed as separate buildPackage/testPackage keys."

For the propagation loop: the existing blank-string sanitization loop (state.ts:553–563) is the structural analog — same location in `preserveUserState`, same iteration pattern.

### Relevant Code Paths
- `packages/cli/src/commands/init/state.ts:398–470` — `createAnaJson`, where the flip happens
- `packages/cli/src/commands/init/state.ts:553–563` — `preserveUserState` sanitization + propagation loop location
- `packages/cli/src/utils/worktree.ts:446–471` — `runBuildCommand` (READ-ONLY reference — already reads `commands.build`, needs NO changes. After the flip it automatically gets the project-wide command.)
- `packages/cli/src/utils/worktree.ts:425–434` — `getBuildCommandString` (READ-ONLY reference — same, no changes needed)
- `packages/cli/src/commands/config.ts:328` — `COMMAND_FIELDS` array
- `packages/cli/templates/.claude/agents/ana-build.md:34,105,107,371–372` — template sections to rewrite
- `packages/cli/templates/.claude/agents/ana-verify.md:81,145,172–174` — template sections to rewrite
- `packages/cli/templates/.claude/agents/ana-plan.md:420,427` — checkpoint and baseline references
- `website/content/docs/guides/troubleshooting.mdx:41,69–72` — TroubleCards to update

### Patterns to Follow
- Command construction: follow existing `(cd ${pkg.path} && ${prefix} ${key})` pattern for `buildPackage`/`testPackage`
- Conditional key addition: `if (condition) { commands['buildPackage'] = value; }` — only add when monorepo AND value differs from `build`
- Sanitization list: extend `['test', 'build', 'lint']` with new field names
- Propagation loop: iterate `freshCommands`, add keys missing from old config (only non-null, non-empty values)
- Template style: unconditional instructions. "Use `build` from ana.json" — no "if present" or "or" qualifiers.

### Known Gotchas
- **`test` scoping requires restructuring, not just "don't overwrite."** The current code (lines 400-412) mutates `testCmd` in place — starts as root non-interactive, then gets overwritten with the scoped `(cd ... && ...)` variant. The flip requires splitting this into TWO separate computations: (1) `test` = `makeTestCommandNonInteractive(result.commands.test, ...)` (capture BEFORE the monorepo block runs), (2) `testPackage` = the `(cd ${pkg.path} && ${directCmd})` value (computed inside the monorepo block). This is NOT symmetric with `build` — the build scoping (lines 421-450) reads primary package.json scripts, while the test scoping uses `buildDirectTestCommand` framework mapping. Both mechanisms stay; they just write to different variables (`build`/`buildPackage` and `test`/`testPackage`).
- **"Only when different" check.** `buildPackage` should only be written when its value differs from `build`. For single-package projects, they'd be identical — so don't write it. For monorepos where the primary package IS the root (relativePath === '.'), `primaryPackage` is null (census.ts:642-644) and the scoping block doesn't execute — so no `buildPackage` is computed.
- **Template changes span three agent templates.** Build, Verify, AND Plan. Plus three dogfood copies. Six files total. All must be consistent with each other. The original scope missed the Plan template.
- **DO NOT modify worktree.ts.** `runBuildCommand` (line 452) and `getBuildCommandString` (line 430) already read `commands.build`. After the flip, `build` contains the project-wide command. The worktree automatically gets correct behavior. Any change here is unnecessary work.
- **Our own re-init requires manual `ana.json` delete.** The propagation loop adds NEW keys but doesn't overwrite existing ones. Our existing `build` = scoped command. Fresh detection `build` = root command. Preserving the old value is correct behavior for user customizations — but for us it means a manual reset. Build should NOT try to automate this — it's a post-merge manual step.
- **Config.ts COMMAND_FIELDS uses dot notation.** The entries are `'commands.buildPackage'` and `'commands.testPackage'` (with the `commands.` prefix). Follow the existing pattern.
- **Existing monorepoCommandScoping tests assert old behavior.** Tests A001, A002, A007, A008 assert `build` is scoped (e.g., `expect(cmds['build']).toBe('(cd packages/cli && pnpm run build)')`). After the flip, these must assert `build` is ROOT and `buildPackage` is scoped. Tests A003-A004 ("keeps root command when primary package lacks scripts") become "build stays as root when primary package has no build script" — same assertion value, different semantic meaning. Tests A005 ("single-repo unaffected") needs an additional check that `buildPackage` is undefined.

### Things to Investigate
- None outstanding. Verified during scope scrutiny:
  - Plan template lines 420 and 427 confirmed as exact locations for checkpoint/baseline updates.
  - `displaySuccessMessage` (state.ts:756-764) reads `configCmds?.['build']` and `configCmds?.['test']` — after the flip these show project-wide commands, which is more intuitive. No changes needed.
  - `worktree.ts` confirmed as needing zero changes (already reads `commands.build` directly).
  - Setup template (ana-setup.md:132-135) shows `commands.build`/`commands.test` — after flip these are project-wide, matching descriptions. No changes needed.
