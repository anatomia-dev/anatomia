# Scope: Monorepo build command scoping

**Created by:** Ana
**Date:** 2026-05-15

## Intent

`createAnaJson` scopes the test command to the primary package in monorepos but takes build and lint raw from the root package.json. Monorepo customers get `pnpm run build` which triggers `turbo run build` across all packages (30-60s), when agents only need the primary package build (3s). The test scoping has been proven across 110+ pipeline runs. Build and lint should follow the same principle.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — one function, one call site, new tests
- **Files affected:**
  - `packages/cli/src/commands/init/state.ts` — `createAnaJson` (add `cwd` parameter, build/lint scoping logic)
  - `packages/cli/src/commands/init/index.ts` — pass `cwd` at call site (line 108)
  - New test file or additions to existing init tests
- **Blast radius:** Every monorepo customer's fresh `ana init`. Single-package repos unaffected (scoping only activates when `isMonorepo && primaryPackage`). Existing users with old ana.json unaffected due to `preserveUserState`.
- **Estimated effort:** 1-2 hours
- **Multi-phase:** no

## Approach

Extend the monorepo scoping in `createAnaJson` from test-only to build and lint. The structural pattern is the same — check monorepo, check primary package, scope if possible, fall back to root if not — but the mechanism differs: test scoping uses `buildDirectTestCommand` (framework-based, no package.json read needed), while build/lint scoping requires reading the primary package's package.json to verify it has its own scripts.

Add `cwd` as a parameter to `createAnaJson`. When in a monorepo with a primary package, read `${cwd}/${pkg.path}/package.json` and check for build/lint script keys. If present, construct `(cd ${pkg.path} && ${pm} run ${scriptKey})`. If absent, keep the root command.

Leave `dev` unscoped — dev servers often run together across packages, agents rarely invoke dev, and the risk-reward is poor.

## Acceptance Criteria
- AC1: Fresh `ana init` on a monorepo with a primary package that has a `build` script produces a scoped build command: `(cd {pkg.path} && {pm} run build)`
- AC2: Fresh `ana init` on a monorepo with a primary package that has a `lint` script produces a scoped lint command: `(cd {pkg.path} && {pm} run lint)`
- AC3: Fresh `ana init` on a monorepo where the primary package has NO build script keeps the root build command
- AC4: Fresh `ana init` on a monorepo where the primary package has NO lint script keeps the root lint command
- AC5: Fresh `ana init` on a single-package repo produces identical behavior to today
- AC6: `dev` command is never scoped regardless of monorepo status
- AC7: Build script key lookup checks `build`, `compile`, `tsc` (same keys as `detectCommands`). Lint checks `lint`, `eslint`, `biome`.
- AC8: Tests cover all six scenarios above (AC1-AC6) plus the key-variant lookup (AC7)

## Edge Cases & Risks

- **Primary package uses a non-standard build key** (e.g., `compile` or `tsc` instead of `build`). The lookup must check the same keys as `detectCommands` (lines 52-53) and use the key that exists, not assume `build`.
- **Primary package.json is missing or malformed.** Treat as "no scripts" — fall back to root command. Silent failure, not a crash.
- **Package manager is npm.** Prefix is `npm run` not `pnpm run`. Use the same `packageManager === 'npm' ? 'npm run' : '${pm} run'` pattern from `detectCommands`.
- **Primary package path has spaces.** The `(cd ${pkg.path} && ...)` pattern doesn't quote the path. Existing test scoping has the same gap. Not in scope to fix, but worth noting.
- **`preserveUserState` blocks the fix for existing users.** On re-init, lines 493-510 preserve old ana.json commands. Users who already init'd with the unscoped command keep it. This is by design — preserveUserState protects user customizations. The upgrade path is either manual ana.json edit or a future command-refresh mechanism (separate scope).
- **Primary package moves between re-inits.** If a customer restructures their monorepo, re-init generates the correct scoped command but `preserveUserState` keeps the old one (now pointing at a stale path). This is a pre-existing limitation that also affects test scoping. The fix is re-init field refresh, not this scope.

## Rejected Approaches

**Extend `detectCommands` to capture primary package scripts (engine change).** Would add a `primaryCommands` field to `DetectedCommands` and require passing the primary package path into the engine detector. Overengineered: build/lint scoping is a product decision at init time, not a detection concern. The test scoping already lives in `createAnaJson`, not the engine. Adding `cwd` to `createAnaJson` is smaller blast radius and consistent with the existing pattern.

**Use `pnpm --filter {name} build` instead of `(cd path && pnpm run build)`.** More "correct" for pnpm but not portable across package managers. The `(cd && ...)` subshell pattern is already established for test scoping and works with npm, yarn, and pnpm.

**Scope `dev` too.** Dev workflows vary too much across monorepos. Some intentionally run all dev servers together (frontend + backend + worker). Agents rarely run `dev`. The risk of breaking legitimate multi-package dev setups outweighs the benefit of slightly faster dev starts.

**Solve the `preserveUserState` upgrade path in this scope.** Tempting to add command-level refresh (detect stale scoped commands on re-init). But that's a different disease — the re-init preservation contract is load-bearing and deserves its own scope with its own test coverage. This fix makes fresh init correct; the upgrade path is Phase 3.

## Open Questions

None. All investigative questions from the requirements file are resolved:
- Primary package scripts: read via `cwd` parameter (Option A)
- No build script fallback: keep root command
- Lint scoping: yes, same logic as build, same fallback
- Real-world validation: our own repo confirms the turbo pattern (root orchestrates, packages have own scripts)

## Exploration Findings

### Patterns Discovered
- `state.ts:397-410`: Test scoping pattern — check monorepo + primaryPackage, generate direct command or fall back to cd-wrapped root command
- `state.ts:248-268`: `buildDirectTestCommand` — framework-to-runner mapping. No equivalent needed for build (build tools too varied, just use the package's own script key)
- `commands.ts:51-54`: Build key lookup order: `build`, `compile`, `tsc`. Must replicate for primary package check.
- `commands.ts:67-69`: Lint key lookup order: `lint`, `eslint`, `biome`. Same.
- `state.ts:493-510`: `preserveUserState` merges ana.json by keeping ALL old fields, only refreshing `anaVersion` and `lastScanAt`. Commands are entirely from old config on re-init.

### Constraints Discovered
- [TYPE-VERIFIED] `primaryPackage` shape is `{ name: string; path: string } | null` (engineResult.ts:125) — no scripts data, confirming the need to read package.json separately
- [TYPE-VERIFIED] `createAnaJson` signature is `(tmpAnaPath: string, engineResult: EngineResult | null)` (state.ts:361-363) — needs `cwd` added
- [OBSERVED] Zero existing tests for `createAnaJson` — no test files match `createAnaJson` or monorepo command scoping in the tests/ directory
- [OBSERVED] `cwd` is available at the call site (index.ts:102, used for `runAnalyzer(cwd)`) — passing it to `createAnaJson` is trivial

### Test Infrastructure
- No existing unit tests for `createAnaJson`. Tests will need mock `EngineResult` objects with monorepo data and a temp directory with a fake primary package.json.

## For AnaPlan

### Structural Analog
`state.ts:397-410` — the test scoping block. This is the exact structural match. Build/lint scoping should sit adjacent to it (lines 411-418 area), using the same guard (`result.monorepo.isMonorepo && result.monorepo.primaryPackage`), with the addition of a package.json read.

### Relevant Code Paths
- `packages/cli/src/commands/init/state.ts:361-436` — `createAnaJson`, the function being modified
- `packages/cli/src/commands/init/state.ts:248-268` — `buildDirectTestCommand`, reference for test scoping pattern
- `packages/cli/src/commands/init/state.ts:493-510` — `preserveUserState`, explains why re-init doesn't propagate the fix
- `packages/cli/src/commands/init/index.ts:108` — call site for `createAnaJson`
- `packages/cli/src/engine/detectors/commands.ts:26-80` — `detectCommands`, reference for key lookup order
- `packages/cli/src/engine/types/engineResult.ts:121-126` — monorepo type shape

### Patterns to Follow
- Guard: `if (result.monorepo.isMonorepo && result.monorepo.primaryPackage)` — same as test scoping
- Command format: `(cd ${pkg.path} && ${pm} run ${key})` — same subshell pattern as test
- Fallback: keep `result.commands.build` / `result.commands.lint` unchanged when primary package lacks the script
- Key lookup order: match `detectCommands` exactly (`build`/`compile`/`tsc` for build, `lint`/`eslint`/`biome` for lint)
- Package manager prefix: `packageManager === 'npm' ? 'npm run' : '${pm} run'` — match `detectCommands:49`

### Known Gotchas
- The `cwd` parameter addition changes `createAnaJson`'s signature — `index.ts:108` must be updated in lockstep
- The primary package.json read must be try/catch guarded — missing or malformed package.json should fall back silently, not crash init
- `result.commands.all` contains ROOT scripts, not primary package scripts — don't confuse them

### Things to Investigate
- Whether the test scoping block and the new build/lint scoping should be extracted into a shared helper (e.g., `scopeCommandToPackage`). The logic is similar but not identical — test uses `buildDirectTestCommand` while build/lint uses package.json lookup. Plan should decide if extraction improves clarity or adds indirection.