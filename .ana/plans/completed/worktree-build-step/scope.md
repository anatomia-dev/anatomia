# Scope: Run build command during worktree creation

**Created by:** Ana
**Date:** 2026-05-14

## Intent
Build agents enter fresh worktrees and hit 283 test failures (MODULE_NOT_FOUND) because `dist/` is gitignored and `createWorktree()` never runs the project's build command. The developer wants worktrees to be ready for baseline testing the moment they're created — deps installed, env linked, artifacts built.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — one function in one file, plus interface update and test additions
- **Files affected:** `packages/cli/src/utils/worktree.ts` (production), `packages/cli/tests/utils/worktree.test.ts` (tests)
- **Blast radius:** Minimal. `createWorktree()` is called from `work.ts` (the `ana work start` flow). No changes to Build, Verify, artifact saving, proof chain, or timing computation. The only behavioral change: worktrees take longer to create and have build artifacts when done.
- **Estimated effort:** ~1 hour
- **Multi-phase:** no

## Approach
Add a build step to `createWorktree()` after dependency installation and env file linking. Read `commands.build` from the worktree's own `.ana/ana.json`. If null/undefined, skip. If the command fails, warn in the terminal and record `buildSucceeded: false` in `worktree-context.md` so the Build agent knows to rebuild before running baseline tests. Follow the `installDependencies()` pattern exactly: `spawnSync`, `stdio: 'pipe'`, boolean return.

The build runs in the worktree directory against the worktree's dependencies and env files. This is setup, not pipeline work — analogous to `pnpm install`, not to the agent's own build step.

## Acceptance Criteria
- AC1: `createWorktree()` runs `commands.build` from the worktree's `.ana/ana.json` after dependency installation and env file linking
- AC2: When `commands.build` is null/undefined, the build step is skipped silently
- AC3: When the build command fails, worktree creation completes with a warning (not a hard failure)
- AC4: The warning message includes the failed command and suggests running it manually
- AC5: The build runs with the worktree as CWD (not the main tree)
- AC6: Build step runs AFTER `installDependencies()` and `linkEnvFiles()`, BEFORE `initSubmodules()`
- AC7: `WorktreeCreateResult` includes a `buildSucceeded` field (boolean or null when skipped)
- AC8: `worktree-context.md` includes build status so the Build agent can see whether artifacts exist
- AC9: Existing worktree tests pass — no regressions in creation, removal, rollback, env linking, or context writing
- AC10: New tests cover: build succeeds, build fails (warns, doesn't throw), no build command (skips)

## Edge Cases & Risks
- **Build command reads `.env` files:** Handled — env files are linked before the build runs.
- **Build command fails:** Warn-don't-block. The worktree is still usable for code changes. The Build agent sees `buildSucceeded: false` in worktree-context.md and knows to rebuild.
- **Branch has broken build:** This is the developer's problem, not ours. Warn and proceed — they may be entering the worktree specifically to fix the build.
- **Slow build (monorepo turbo/nx):** The user configured `commands.build` — we respect it. Worktree creation takes longer but the alternative (no build) causes 283 test failures. The tradeoff is correct.
- **No `ana.json` in worktree:** Projects that haven't run `ana init` won't have `ana.json`. Skip the build step (same as null `commands.build`).
- **`commands.build` contains shell operators:** `spawnSync` with `shell: true` handles this (pipes, `&&`, `cd` prefixes like `(cd packages/cli && pnpm run build)`). Match how `installDependencies` handles this — verify whether it uses shell mode.

## Rejected Approaches

**Block on build failure (throw + rollback).** If the build fails, the worktree would be destroyed. Hostile when the developer is entering the worktree to fix a broken build. The worktree is usable without build artifacts — source code, deps, and env files are all present.

**Add a timeout to the build step.** `installDependencies` doesn't have a timeout. Adding one to build alone creates inconsistency and a new edge case (what happens on timeout — kill the process? leave partial `dist/`?). If hanging builds become a problem, add timeouts to both `installDependencies` and `runBuild` in a future scope.

**Auto-scope `commands.build` to the primary package in monorepos.** Too opinionated. Breaks legitimate use cases (turbo dependency graph builds, cross-package testing). Monorepo users who want scoped commands can configure them in `ana.json` directly. Our own misconfigured `commands.build` is our config bug, not a product issue.

**Read `ana.json` from the main tree instead of the worktree.** The worktree checks out a branch that may have different build commands. Reading from the worktree's own `.ana/ana.json` respects branch-specific configuration.

## Open Questions
None — all design questions resolved during scoping.

## Exploration Findings

### Patterns Discovered
- `installDependencies()` (worktree.ts:386-412): `spawnSync` with `stdio: 'pipe'`, detects package manager from lockfiles, returns boolean. The structural analog for the build step.
- `WorktreeCreateResult` interface (worktree.ts:24-32): Already has `depsInstalled: boolean`. The `buildSucceeded` field follows the same pattern.
- `writeWorktreeContext()` (worktree.ts:495-542): Writes `worktree-context.md` with sections. Build status should be added as a new section or field.

### Constraints Discovered
- [TYPE-VERIFIED] `commands` field in `AnaJsonSchema` is `z.record(z.string(), z.unknown()).optional()` (anaJsonSchema.ts:44) — `commands.build` is accessed as a dynamic key, will be `unknown` type requiring runtime check
- [OBSERVED] `installDependencies` uses `spawnSync` without `shell: true` (worktree.ts:405) — the build command is a string like `pnpm run build` or `(cd packages/cli && pnpm run build)` which requires shell execution. Plan must decide: split on spaces (fragile) or use `shell: true`.
- [OBSERVED] `createWorktree` is async but `installDependencies` is sync (uses `spawnSync`) — the build function should also be sync for consistency

### Test Infrastructure
- `worktree.test.ts`: Uses temp directories with `git init`, creates test projects via `createTestProject()` helper. Tests can set `ana.json` content directly. Build tests will need a buildable project or a mock build command (e.g., `echo built > dist/index.js`).

## For AnaPlan

### Structural Analog
`installDependencies()` in `packages/cli/src/utils/worktree.ts` (line 386-412). Same file, same pattern, same return type. The build step is a near-clone with different command sourcing.

### Relevant Code Paths
- `packages/cli/src/utils/worktree.ts:178-256` — `createWorktree()`, where the build step is inserted
- `packages/cli/src/utils/worktree.ts:386-412` — `installDependencies()`, the pattern to follow
- `packages/cli/src/utils/worktree.ts:495-542` — `writeWorktreeContext()`, needs build status section
- `packages/cli/src/utils/worktree.ts:24-32` — `WorktreeCreateResult` interface, needs `buildSucceeded` field
- `packages/cli/src/commands/work.ts:2048-2064` — caller site that logs the result, needs to display build status
- `packages/cli/src/commands/init/anaJsonSchema.ts:44` — `commands` field schema

### Patterns to Follow
- `installDependencies()` for the function shape (sync, `spawnSync`, boolean return)
- `WorktreeCreateResult.depsInstalled` for the interface pattern
- `writeWorktreeContext()` section structure for the build status output

### Known Gotchas
- `installDependencies` does NOT use `shell: true` — it passes command and args separately (`spawnSync(cmd, args)`). But `commands.build` is a single string like `pnpm run build`. The build function needs `shell: true` to handle this, or it needs to split the string. `shell: true` is safer (handles `&&`, `()`, pipes). This is a deliberate divergence from `installDependencies` — document why.
- `commands` in `ana.json` is typed as `Record<string, unknown>` — the build value needs a runtime `typeof === 'string'` check before use.
- The `writeWorktreeContext` call happens AFTER the build step would run. The build status is available by the time context is written — no ordering issue.

### Things to Investigate
- Whether `work.ts` caller site (line 2048-2064) needs the warning to include actionable guidance (e.g., "run `pnpm run build` in the worktree"), or whether the worktree-context.md annotation is sufficient for the agent audience.
