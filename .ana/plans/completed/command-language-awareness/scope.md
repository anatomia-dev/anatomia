# Scope: Command Detection Language Awareness

**Created by:** Ana
**Date:** 2026-05-19

## Intent

Non-Node projects with a package.json (Ruby/Mastodon, Rust/Biome) get JS commands in ana.json. The pipeline executes these mechanically — Build runs `yarn run test -- --run` on a Ruby project. The entire pipeline produces wrong results. Fix the scan engine and init layer so non-Node projects get correct native commands or honest nulls, and ensure the user-facing flow (init display + setup) guides non-Node users to configure any remaining null commands before entering the pipeline.

## Complexity Assessment
- **Kind:** feature
- **Size:** medium — touches 4 source files across 2 layers (engine + init), plus 1 utility consumer and 1 agent template
- **Files affected:**
  - `packages/cli/src/engine/scan-engine.ts` — clear-and-rebuild for stack.testing, Ruby + Rust detection branches
  - `packages/cli/src/engine/detectors/commands.ts` — suppress named commands for non-Node, preserve commands.all
  - `packages/cli/src/commands/init/state.ts` — non-Node command builder functions, scoping block guard, preserveUserState migration, conditional init display
  - `packages/cli/src/utils/worktree.ts` — getBuildCommandString fallback fix
  - `packages/cli/templates/.claude/agents/ana-setup.md` — surface null commands instead of skipping them
  - `.claude/agents/ana-setup.md` — dogfood template: same change as product template
- **Blast radius:** Engine output changes for non-Node projects (stack.testing, commands). All Node/TypeScript projects completely unaffected — every guard is `projectType !== 'node'`. Consumers of engine output (skills.ts, display, agents) benefit automatically since the engine result itself becomes correct. Init display and setup template only change behavior when commands are null.
- **Estimated effort:** 3-4 hours build, 1-2 hours test
- **Multi-phase:** no

## Approach

Four layers, each making the next one work:

**Layer 1 — Fix stack.testing contamination.** JS testing frameworks enter `stack.testing` for non-Node projects via two paths: `detectFromDeps(census.allDeps)` catches vitest/jest from merged workspace devDependencies (line 652 → 764), and the rootDevDeps loop (lines 829-833) adds more. Instead of gating each path individually (fragile, incomplete), add a single clear-and-rebuild step after all enrichment: if project is non-Node, replace `stack.testing` entirely with `detectNonNodeTesting` results. One operation, future-proof. Add Ruby and Rust branches to `detectNonNodeTesting` so native testing frameworks are correctly detected for all supported languages.

**Layer 2 — Suppress JS commands for non-Node.** Pass `projectType` to `detectCommands`. If non-Node, suppress the four named commands (build/test/lint/dev) to null while preserving `commands.all` (informational for scan.json). Guard the scoping block in `createAnaJson` against non-Node to prevent `buildPackage`/`testPackage`/scoped lint from bypassing the suppression.

**Layer 3 — Write correct native commands.** New `buildNonNodeCommands` function produces test/build/lint commands from `projectType` and the corrected `stack.testing`. High-confidence commands only: pytest, go test, bundle exec rspec / bin/rspec, cargo test, go build, cargo build, cargo clippy. Everything else stays null — setup surfaces the gaps.

**Layer 4 — Guide non-Node users through command configuration.** When the engine fix leaves commands null, the init display and setup template must close the loop. Init display becomes conditional: when `commands.test` is null on a non-Node project, setup appears first and "optional" is removed. The setup template stops hiding null command fields and instead surfaces them with a ⚠ marker so the setup agent asks the user to configure them. The setup agent is an LLM — it reads the language field from ana.json and naturally suggests appropriate commands. No hardcoded suggestion table needed.

## Acceptance Criteria

### Engine fix (Layers 1-3)
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
- AC15: `stack.testing` for a Rust project shows `['Cargo test']` — not empty. Consistent with Go (which gets `['Go testing']`).

### Init display + setup (Layer 4)
- AC16: A TypeScript project's init output still shows setup as "optional" with `claude --agent ana` listed first. Zero change for sniper customer.
- AC17: A non-Node project with null `commands.test` shows setup FIRST in init output, without the word "optional": `claude --agent ana-setup    Configure commands + enrich context (~10 min)` then `claude --agent ana          Start working (after setup)`.
- AC18: A non-Node project where test IS populated (Ruby with .rspec, Go, Rust) shows setup as "optional" — same as TypeScript.
- AC19: The setup template's config confirmation surfaces null `commands.test` and `commands.build` with a ⚠ marker instead of silently skipping them. The setup agent uses the project language to suggest appropriate commands.
- AC20: After setup on a project with null commands, the configured commands are persisted to ana.json via the existing correction flow (read → change → write → verify).
- AC21: Dogfood template (`.claude/agents/ana-setup.md`) updated to match product template.

## Edge Cases & Risks
- **Polyglot TS+Ruby (Mastodon):** Language detection correctly returns Ruby. JS commands suppressed. `commands.all` preserves scripts for informational use. User can override any command via `ana config set`.
- **Rust with JS workspace (Biome):** The scoping block at state.ts:425-453 reads the primary package's package.json directly, bypassing `detectCommands`. Language guard must cover this block too, or Biome gets `buildPackage: "(cd 'packages/tailwindcss-config-analyzer' && pnpm run build)"` on a Rust project.
- **Python project running tests via `npm test`:** Suppression nulls the command. Rare pattern; escape hatch exists via `ana config set`.
- **Pre-fix installs on re-init:** The preserveUserState migration clears JS commands matching the runner regex. Conservative heuristic — only matches `npm|yarn|pnpm|npx|bunx` followed by a space. Commands like `pytest` or `bundle exec rspec` never match.
- **Ruby project without .rspec or test/ dir:** Gets `commands.test: null`. Init display shows setup-first. Setup agent asks for the test command. Honest behavior.
- **Deep-tier pattern enrichment for non-Node:** Clear-and-rebuild happens after all enrichment (including deep-tier patterns at lines 799-801). This means deep-tier testing detection for non-Node is also replaced. Acceptable — tree-sitter testing patterns are tuned for JS/TS, not Python/Ruby/Go.
- **Non-Node project with all commands populated (Rust):** Init display shows setup as "optional." The condition is `!commands.test` — when test is set, setup is optional regardless of build/lint. This is correct: test is the pipeline-critical command.
- **Setup correction mechanism for null fields:** JSON read → set null property → write back works. Verified mechanically. No code change needed for the correction flow itself.
- **Quickstart docs (start.mdx):** Show a TypeScript example where "optional" is correct. Non-Node users see different init output from the CLI. Docs update is a separate concern, not in this scope.

## Rejected Approaches

**Option A — Suppress in `createAnaJson` only.** Fixes ana.json but leaves the engine result containing JS commands. The skills.ts consumer at line 323 writes `result.commands.test` into skill Detected sections from the raw engine result — it would still write JS commands for non-Node projects. Option B fixes at the engine level so all consumers benefit.

**Option D — Reorder scan steps, make `detectPackageManager` return null for non-Node.** More elegant in theory but semantically wrong. `packageManager: 'yarn'` for Mastodon is a correct factual observation — the project does use yarn for JS tooling. The disease is commands promoted from JS scripts, not wrong package manager detection. Suppressing `packageManager` would lose legitimate information and break downstream code that reads it.

**Gate individual enrichment paths instead of clear-and-rebuild.** The REQ originally proposed gating only the rootDevDeps loop (lines 829-833) on `projectType === 'node'`. Investigation revealed contamination enters from TWO paths: `detectFromDeps(census.allDeps)` at line 652 also catches JS testing frameworks because `census.allDeps` merges devDependencies from all packages. Gating only one path leaves Vitest in `stack.testing` — the Ruby detection branch would be dead code. Clear-and-rebuild after all enrichment is one operation that covers all current and future enrichment paths.

**Hardcoded language-specific suggestion tables in setup template.** The REQ-setup-required-for-non-node proposed hardcoding suggestion tables per language (Ruby: "bundle exec rspec, bin/rails test"; Python: "pytest, python -m pytest"; etc.). This is redundant — the setup agent is an LLM that reads `language: 'Ruby'` from ana.json and naturally suggests appropriate commands. Hardcoded tables are fragile (require template updates for new languages), verbose, and add template bulk without value. The simpler fix: stop hiding null fields. The agent does the rest.

## Open Questions
- Whether `buildNonNodeCommands` should live in `state.ts` alongside `buildDirectTestCommand` or in a new module (design judgment for Plan).

## Exploration Findings

### Patterns Discovered
- `scan-engine.ts:652-764`: `detectFromDeps(census.allDeps)` is the FIRST source of JS testing contamination. `census.allDeps` merges deps + devDeps from ALL packages (census.ts:436). Mastodon's vitest devDep enters here.
- `scan-engine.ts:829-833`: rootDevDeps loop is the SECOND source. Adds Playwright, Testing Library from root devDependencies.
- `scan-engine.ts:811`: `detectNonNodeTesting` gate checks `stack.testing.length === 0`. With either contamination source active, the gate fails and native testing detection never runs.
- `scan-engine.ts:68-94`: `detectNonNodeTesting` handles Python and Go but NOT Ruby or Rust. Line 93 returns `[]` as the default, meaning Rust projects get empty `stack.testing` after clear-and-rebuild. Same fix needed as Ruby: add Rust branch returning `['Cargo test']`.
- `state.ts:425-453`: Scoping block reads primary package's package.json directly — independent of `detectCommands`. This is why Biome gets JS `buildPackage` despite having null root commands.
- `state.ts:807-816`: Existing non-Node suggestion ("No test/build/lint commands detected. Set them manually.") fires based on null commands. After the fix, this complements (not conflicts with) the new setup-first display at 834-837. The suggestion is the manual escape hatch; setup-first is the recommended path.
- `state.ts:834-837`: Init "Next:" section. Currently always shows ana first, setup second with "optional." The condition for setup-first: `!commands.test` AND non-Node language. When test is populated (Rust, Go, Python+pytest, Ruby+.rspec), setup stays optional.
- `ana-setup.md:149-154`: Config confirmation says "skip null/empty fields" then has an "On correction" flow that reads ana.json, changes fields, writes back. This mechanism already works for setting null fields to values — JSON handles null → string transitions. The only change needed: stop skipping null command fields.
- `worktree.ts:446-454`: `runBuildCommand` already returns null for non-string commands. The `getBuildCommandString` fallback at line 430 is cosmetic (only used in build report display when build succeeded/failed, which can't happen if runBuildCommand returned null). Still worth fixing for correctness.

### Constraints Discovered
- [TYPE-VERIFIED] `detectProjectType` has NO dependency on `detectPackageManager` (projectType.ts reads filesystem directly — Gemfile, go.mod, etc.). Reordering is mechanically safe but semantically wrong (see Rejected Approaches).
- [TYPE-VERIFIED] `census.allDeps` includes devDependencies from all workspace packages (census.ts:432-436). Any JS testing devDep in any workspace package enters `detectFromDeps`.
- [OBSERVED] `commands.all` is used only by `makeTestCommandNonInteractive` (state.ts:401, 798) as the `rawScript` param. No other consumer reads it. Safe to preserve while suppressing named commands.
- [OBSERVED] `detectCommands` has a clean guard pattern at line 38 (`if (packageManager === null) return result`). Adding a projectType guard follows the same pattern.
- [OBSERVED] Maybe Finance (Ruby without .rspec) has `test/` dir + `bin/rails` + `capybara` in Gemfile test group. This is a minitest/Rails test project. The correct behavior is `commands.test: null` (LOW confidence — could be `bin/rails test`, `bundle exec rake test`, etc.).
- [OBSERVED] `detectNonNodeTesting` line 77 checks `deps.includes('unittest')` but `readPythonDependencies` never returns `'unittest'` (it's stdlib, not a pip package). This check is dead code. Not in scope to fix but noted.
- [TYPE-VERIFIED] The setup template's correction mechanism (read ana.json → set field → write back) works for null fields. JSON.parse + set property on null + JSON.stringify produces correct output. No code change needed for the correction flow.
- [OBSERVED] Quickstart docs (start.mdx:39, 48) show "optional" in a TypeScript example. This is correct for that example. Non-Node users see different init output from the CLI itself. Docs update is a separate concern.

### Test Infrastructure
- Existing scan-engine tests in `tests/engine/` and `tests/detectors/` — extend with non-Node project fixtures.
- Reference repos in `/tmp/anatomia-v2-alpha-r2/`: r2-mastodon (Ruby+JS), r2-discourse (Ruby+JS), r2-maybe (Ruby, no .rspec), r2-ragas (Python), r2-temporal (Go), r2-biome (Rust+JS), phase0-inbox-zero (TS), phase1-dub (TS monorepo).

## For AnaPlan

### Structural Analog
`buildDirectTestCommand` at state.ts:248-269. Same shape: takes framework list, returns command string or null. The new `buildNonNodeCommands` follows this pattern but adds `rootPath` parameter (for Ruby `bin/rspec` check) and returns an object with test/build/lint instead of just test.

For the init display conditional: the existing non-Node suggestion at state.ts:807-816 is the structural analog. Same condition shape (`lang && lang !== 'TypeScript' && lang !== 'Node.js'`), but the new conditional additionally checks `!commands.test`.

### Relevant Code Paths
- `scan-engine.ts:624-988` — full scan orchestration. stack.testing built at 764, enriched at 799-801, 811-816, 829-833. Commands at 862. Output at 950-988.
- `scan-engine.ts:68-94` — `detectNonNodeTesting`. Add Ruby branch (`.rspec` → RSpec, `test/` → Minitest) and Rust branch (`→ ['Cargo test']`).
- `commands.ts:26-80` — `detectCommands`. Signature change: add `projectType`. Guard after line 38. Preserve `result.all` population.
- `state.ts:248-269` — `buildDirectTestCommand`. Structural analog for the new function.
- `state.ts:365-490` — `createAnaJson`. Test command at 401. Scoping block at 425-453. Commands object at 458-469. Language guard needed for the scoping block.
- `state.ts:529-594` — `preserveUserState`. Migration insertion point after line 579 (blank sanitizer).
- `state.ts:807-816` — Existing non-Node suggestion. Stays as-is; complementary to the new setup-first display.
- `state.ts:834-837` — Init "Next:" display. Add conditional: if non-Node AND `!commands.test`, flip to setup-first order.
- `worktree.ts:425-434` — `getBuildCommandString`. Change line 430 fallback from `'pnpm run build'` to null-safe.
- `templates/.claude/agents/ana-setup.md:149-151` — Config confirmation. Change "skip null/empty fields" to surface null `commands.test` and `commands.build` with ⚠ marker.

### Patterns to Follow
- Guard clause pattern in `commands.ts:38` — add projectType guard in the same style.
- `buildDirectTestCommand` at `state.ts:248` — framework-to-command mapping with priority ordering.
- `preserveUserState` blank sanitizer at `state.ts:572-579` — same loop structure for the JS command migration.
- Non-Node suggestion at `state.ts:807-816` — same condition shape for the init display conditional.

### Known Gotchas
- The scoping block at state.ts:425-453 reads package.json independently of `detectCommands`. It MUST get its own language guard — it's the source of Biome's wrong `buildPackage`.
- `census.allDeps` includes devDependencies. Anything that iterates allDeps against JS package lists will match polyglot projects. The clear-and-rebuild approach sidesteps this entirely for testing.
- `makeTestCommandNonInteractive` operates on the test command after `createAnaJson` sets it. For non-Node projects, the test command will be native (e.g., `'bin/rspec'`) — `makeTestCommandNonInteractive` must not corrupt it. The existing code handles this: Vitest/Jest/Mocha checks won't match native commands, and everything else passes through unchanged.
- `getBuildCommandString` is synchronous (uses `readFileSync`). The fix is a return-value change, not an async conversion.
- The init display conditional uses `anaConfig` (post-merge) values, not `engineResult` values. This means it reflects preserved user commands from re-init, not just fresh detection. Correct behavior: if the user already configured commands, setup stays optional.
- The setup template change is a one-line edit to the instruction. The LLM agent handles language-specific suggestions naturally from ana.json's `language` field. Do NOT add hardcoded suggestion tables — that would be redundant and fragile.

### Things to Investigate
- Placement of the clear-and-rebuild step relative to the non-Node AI SDK enrichment at line 820. Both operate on non-Node projects. The AI SDK enrichment is independent of stack.testing — no ordering constraint. But verify.
- Whether `buildNonNodeCommands` should be in state.ts or a new module. The function needs `rootPath` for Ruby bin/rspec check, which is available in `createAnaJson`'s scope. Keeping it in state.ts near `buildDirectTestCommand` is the structural analog approach.
