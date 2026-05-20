# Scope: Command Detection Language Awareness

**Created by:** Ana
**Date:** 2026-05-19

## Intent

Non-Node projects with a package.json (Ruby/Mastodon, Rust/Biome) get JS commands in ana.json. The pipeline executes these mechanically — Build runs `yarn run test -- --run` on a Ruby project. The entire pipeline produces wrong results. Fix the scan engine and init layer so non-Node projects get correct native commands or honest nulls.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — touches 4 source files across 2 layers (engine + init), plus 1 utility consumer
- **Files affected:**
  - `packages/cli/src/engine/scan-engine.ts` — clear-and-rebuild for stack.testing, Ruby detection branch
  - `packages/cli/src/engine/detectors/commands.ts` — suppress named commands for non-Node, preserve commands.all
  - `packages/cli/src/commands/init/state.ts` — non-Node command builder functions, scoping block guard, preserveUserState migration
  - `packages/cli/src/utils/worktree.ts` — getBuildCommandString fallback fix
- **Blast radius:** Engine output changes for non-Node projects (stack.testing, commands). All Node/TypeScript projects completely unaffected — every guard is `projectType !== 'node'`. Consumers of engine output (skills.ts, display, agents) benefit automatically since the engine result itself becomes correct.
- **Estimated effort:** 2-3 hours build, 1-2 hours test
- **Multi-phase:** no

## Approach

Three layers, each making the next one work:

**Layer 1 — Fix stack.testing contamination.** JS testing frameworks enter `stack.testing` for non-Node projects via two paths: `detectFromDeps(census.allDeps)` catches vitest/jest from merged workspace devDependencies (line 652 → 764), and the rootDevDeps loop (lines 829-833) adds more. Instead of gating each path individually (fragile, incomplete), add a single clear-and-rebuild step after all enrichment: if project is non-Node, replace `stack.testing` entirely with `detectNonNodeTesting` results. One operation, future-proof.

**Layer 2 — Suppress JS commands for non-Node.** Pass `projectType` to `detectCommands`. If non-Node, suppress the four named commands (build/test/lint/dev) to null while preserving `commands.all` (informational for scan.json). Guard the scoping block in `createAnaJson` against non-Node to prevent `buildPackage`/`testPackage`/scoped lint from bypassing the suppression.

**Layer 3 — Write correct native commands.** New `buildNonNodeCommands` function produces test/build/lint commands from `projectType` and the corrected `stack.testing`. High-confidence commands only: pytest, go test, bundle exec rspec / bin/rspec, cargo test, go build, cargo build, cargo clippy. Everything else stays null — setup and doctor surface the gaps.

## Acceptance Criteria
- AC1: A Ruby project with `.rspec` and `bin/rspec` (Mastodon pattern) gets `commands.test: 'bin/rspec'`, `commands.build: null`, `commands.lint: null`, `commands.dev: null`. Falls back to `'bundle exec rspec'` when `bin/rspec` doesn't exist.
- AC2: A TypeScript project is completely unaffected — all commands generated identically to before.
- AC3: A Python project with pytest detected gets `commands.test: 'pytest'`, other commands null.
- AC4: A Go project gets `commands.test: 'go test ./...'`, `commands.build: 'go build ./...'`, `commands.lint: null`, `commands.dev: null`.
- AC5: A Rust project gets `commands.test: 'cargo test'`, `commands.build: 'cargo build'`, `commands.lint: 'cargo clippy'`, `commands.dev: null`.
- AC6: A Ruby project WITHOUT `.rspec` gets `commands.test: null`.
- AC7: `stack.testing` for Mastodon shows `['RSpec']` — not `['Vitest', 'Playwright', 'Testing Library']`. JS testing contamination eliminated.
- AC8: `detectNonNodeTesting` has a Ruby branch that detects RSpec (`.rspec` file) and Minitest (`test/` directory).
- AC9: `commands.all` in scan.json still shows the actual package.json scripts for polyglot projects (suppression is named-commands-only).
- AC10: A Rust project with JS workspace packages (Biome pattern) gets `buildPackage: null` — scoped JS commands suppressed.
- AC11: Skills Detected section does NOT contain JS test commands for non-Node projects (Option B fixes at engine level).
- AC12: `getBuildCommandString` at worktree.ts returns null for null build command — not `'pnpm run build'` fallback.
- AC13: A user who set `commands.test: 'bundle exec rspec'` via `ana config set` has that command survive re-init.
- AC14: `preserveUserState` clears stale JS commands (matching `/(npm|yarn|pnpm|npx|bunx)\s/`) on non-Node projects during re-init. User can re-set via `ana config set`.

## Edge Cases & Risks
- **Polyglot TS+Ruby (Mastodon):** Language detection correctly returns Ruby. JS commands suppressed. `commands.all` preserves scripts for informational use. User can override any command via `ana config set`.
- **Rust with JS workspace (Biome):** The scoping block at state.ts:425-453 reads the primary package's package.json directly, bypassing `detectCommands`. Language guard must cover this block too, or Biome gets `buildPackage: "(cd 'packages/tailwindcss-config-analyzer' && pnpm run build)"` on a Rust project.
- **Python project running tests via `npm test`:** Suppression nulls the command. Rare pattern; escape hatch exists via `ana config set`.
- **Pre-fix installs on re-init:** The preserveUserState migration clears JS commands matching the runner regex. Conservative heuristic — only matches `npm|yarn|pnpm|npx|bunx` followed by a space. Commands like `pytest` or `bundle exec rspec` never match.
- **Ruby project without .rspec or test/ dir:** Gets `commands.test: null`. The honest answer. Setup and doctor surface it.
- **Deep-tier pattern enrichment for non-Node:** Clear-and-rebuild happens after all enrichment (including deep-tier patterns at lines 799-801). This means deep-tier testing detection for non-Node is also replaced. Acceptable — tree-sitter testing patterns are tuned for JS/TS, not Python/Ruby/Go.

## Rejected Approaches

**Option A — Suppress in `createAnaJson` only.** Fixes ana.json but leaves the engine result containing JS commands. The skills.ts consumer at line 323 writes `result.commands.test` into skill Detected sections from the raw engine result — it would still write JS commands for non-Node projects. Option B fixes at the engine level so all consumers benefit.

**Option D — Reorder scan steps, make `detectPackageManager` return null for non-Node.** More elegant in theory but semantically wrong. `packageManager: 'yarn'` for Mastodon is a correct factual observation — the project does use yarn for JS tooling. The disease is commands promoted from JS scripts, not wrong package manager detection. Suppressing `packageManager` would lose legitimate information and break downstream code that reads it.

**Gate individual enrichment paths instead of clear-and-rebuild.** The REQ originally proposed gating only the rootDevDeps loop (lines 829-833) on `projectType === 'node'`. Investigation revealed contamination enters from TWO paths: `detectFromDeps(census.allDeps)` at line 652 also catches JS testing frameworks because `census.allDeps` merges devDependencies from all packages. Gating only one path leaves Vitest in `stack.testing` — the Ruby detection branch would be dead code. Clear-and-rebuild after all enrichment is one operation that covers all current and future enrichment paths.

## Open Questions
- Whether `buildNonNodeCommands` should live in `state.ts` alongside `buildDirectTestCommand` or in a new module (design judgment for Plan).

## Exploration Findings

### Patterns Discovered
- `scan-engine.ts:652-764`: `detectFromDeps(census.allDeps)` is the FIRST source of JS testing contamination. `census.allDeps` merges deps + devDeps from ALL packages (census.ts:436). Mastodon's vitest devDep enters here.
- `scan-engine.ts:829-833`: rootDevDeps loop is the SECOND source. Adds Playwright, Testing Library from root devDependencies.
- `scan-engine.ts:811`: `detectNonNodeTesting` gate checks `stack.testing.length === 0`. With either contamination source active, the gate fails and native testing detection never runs.
- `state.ts:425-453`: Scoping block reads primary package's package.json directly — independent of `detectCommands`. This is why Biome gets JS `buildPackage` despite having null root commands.
- `worktree.ts:446-454`: `runBuildCommand` already returns null for non-string commands. The `getBuildCommandString` fallback at line 430 is cosmetic (only used in build report display when build succeeded/failed, which can't happen if runBuildCommand returned null). Still worth fixing for correctness.

### Constraints Discovered
- [TYPE-VERIFIED] `detectProjectType` has NO dependency on `detectPackageManager` (projectType.ts reads filesystem directly — Gemfile, go.mod, etc.). Reordering is mechanically safe but semantically wrong (see Rejected Approaches).
- [TYPE-VERIFIED] `census.allDeps` includes devDependencies from all workspace packages (census.ts:432-436). Any JS testing devDep in any workspace package enters `detectFromDeps`.
- [OBSERVED] `commands.all` is used only by `makeTestCommandNonInteractive` (state.ts:401, 798) as the `rawScript` param. No other consumer reads it. Safe to preserve while suppressing named commands.
- [OBSERVED] `detectCommands` has a clean guard pattern at line 38 (`if (packageManager === null) return result`). Adding a projectType guard follows the same pattern.
- [OBSERVED] Maybe Finance (Ruby without .rspec) has `test/` dir + `bin/rails` + `capybara` in Gemfile test group. This is a minitest/Rails test project. The correct behavior is `commands.test: null` (LOW confidence — could be `bin/rails test`, `bundle exec rake test`, etc.).

### Test Infrastructure
- Existing scan-engine tests in `tests/engine/` and `tests/detectors/` — extend with non-Node project fixtures.
- Reference repos in `/tmp/anatomia-v2-alpha-r2/`: r2-mastodon (Ruby+JS), r2-discourse (Ruby+JS), r2-maybe (Ruby, no .rspec), r2-ragas (Python), r2-temporal (Go), r2-biome (Rust+JS), phase0-inbox-zero (TS), phase1-dub (TS monorepo).

## For AnaPlan

### Structural Analog
`buildDirectTestCommand` at state.ts:248-269. Same shape: takes framework list, returns command string or null. The new `buildNonNodeCommands` follows this pattern but adds `rootPath` parameter (for Ruby `bin/rspec` check) and returns an object with test/build/lint instead of just test.

### Relevant Code Paths
- `scan-engine.ts:624-988` — full scan orchestration. stack.testing built at 764, enriched at 799-801, 811-816, 829-833. Commands at 862. Output at 950-988.
- `commands.ts:26-80` — `detectCommands`. Signature change: add `projectType`. Guard after line 38. Preserve `result.all` population.
- `state.ts:248-269` — `buildDirectTestCommand`. Structural analog for the new function.
- `state.ts:365-490` — `createAnaJson`. Test command at 401. Scoping block at 425-453. Commands object at 458-469. Language guard needed for the scoping block.
- `state.ts:529-594` — `preserveUserState`. Migration insertion point after line 579 (blank sanitizer).
- `worktree.ts:425-434` — `getBuildCommandString`. Change line 430 fallback from `'pnpm run build'` to null-safe.

### Patterns to Follow
- Guard clause pattern in `commands.ts:38` — add projectType guard in the same style.
- `buildDirectTestCommand` at `state.ts:248` — framework-to-command mapping with priority ordering.
- `preserveUserState` blank sanitizer at `state.ts:572-579` — same loop structure for the JS command migration.

### Known Gotchas
- The scoping block at state.ts:425-453 reads package.json independently of `detectCommands`. It MUST get its own language guard — it's the source of Biome's wrong `buildPackage`.
- `census.allDeps` includes devDependencies. Anything that iterates allDeps against JS package lists will match polyglot projects. The clear-and-rebuild approach sidesteps this entirely for testing.
- `makeTestCommandNonInteractive` operates on the test command after `createAnaJson` sets it. For non-Node projects, the test command will be native (e.g., `'bin/rspec'`) — `makeTestCommandNonInteractive` must not corrupt it. The existing code handles this: Vitest/Jest/Mocha checks won't match native commands, and everything else passes through unchanged.
- `getBuildCommandString` is synchronous (uses `readFileSync`). The fix is a return-value change, not an async conversion.

### Things to Investigate
- Placement of the clear-and-rebuild step relative to the non-Node AI SDK enrichment at line 820. Both operate on non-Node projects. The AI SDK enrichment is independent of stack.testing — no ordering constraint. But verify.
- Whether `buildNonNodeCommands` should be in state.ts or a new module. The function needs `rootPath` for Ruby bin/rspec check, which is available in `createAnaJson`'s scope. Keeping it in state.ts near `buildDirectTestCommand` is the structural analog approach.
