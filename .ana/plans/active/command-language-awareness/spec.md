# Spec: Command Detection Language Awareness

**Created by:** AnaPlan
**Date:** 2026-05-19
**Scope:** .ana/plans/active/command-language-awareness/scope.md

## Approach

Four layers, bottom-up. Each layer fixes a class of bug and makes the next layer work.

**Layer 1 — Clear-and-rebuild `stack.testing` for non-Node.** JS testing frameworks contaminate `stack.testing` for non-Node projects via two paths: `detectFromDeps(census.allDeps)` merges devDependencies from ALL workspace packages (including JS testing libs), and the `TESTING_PACKAGES` rootDevDeps loop adds more. Instead of gating each path, add a single clear-and-rebuild after all enrichment completes: if `projectTypeResult.type` is not `'node'` and not `'unknown'`, replace `stack.testing` with `detectNonNodeTesting` results. Placement: after the rootDevDeps loop (line 833), before the TypeScript override (line 835). This one operation covers all current and future contamination paths.

Extend `detectNonNodeTesting` with Ruby and Rust branches:
- Ruby: `.rspec` file → `['RSpec']`; `test/` directory → `['Minitest']`; both → `['RSpec', 'Minitest']`
- Rust: always returns `['Cargo test']` (built-in, no dependency to detect)

**Layer 2 — Suppress JS commands for non-Node.** Add `projectType` parameter to `detectCommands`. If non-Node (not `'node'` and not `'unknown'`), skip the named-command detection (build/test/lint/dev stay null) but still populate `result.all` from package.json scripts. Guard follows the existing `packageManager === null` early-return pattern. In `scanProject`, pass `projectTypeResult.type` to `detectCommands` at line 862.

**Layer 3 — Build native commands.** New `buildNonNodeCommands` function in `state.ts` next to `buildDirectTestCommand`. Takes language (from `result.stack.language`), testing frameworks (from `result.stack.testing`), and `rootPath`. Returns `{ test, build, lint, dev }` with high-confidence commands only:
- Python + pytest → `test: 'pytest'`
- Go → `test: 'go test ./...'`, `build: 'go build ./...'`
- Ruby + RSpec → `test: 'bin/rspec'` if `bin/rspec` exists on disk, else `'bundle exec rspec'`
- Rust → `test: 'cargo test'`, `build: 'cargo build'`, `lint: 'cargo clippy'`
- Everything else stays null

Call `buildNonNodeCommands` in `createAnaJson` when language is not TypeScript/Node.js. Merge results into the commands object, replacing the engine-detected nulls.

Additionally: guard the scoping block at state.ts:425-453 with a language check. If language is not TypeScript/Node.js, skip the monorepo scoping entirely — prevents Biome-pattern projects from getting JS `buildPackage`/lint commands from the primary package's package.json.

**Layer 4 — Guide non-Node users.** Two changes:
1. Init display (state.ts ~834): when language is non-Node AND `commands.test` is null (from `anaConfig` post-merge values), show setup FIRST without "optional". When test IS populated, keep current order.
2. Setup template: change "skip null/empty fields" to surface null command fields with a ⚠ marker. Same change in both product template and dogfood template.

**Re-init safety.** Add a migration in `preserveUserState` after the blank sanitizer: if `newAnaConfig['language']` is not TypeScript/Node.js, clear any preserved command whose value matches `/(npm|yarn|pnpm|npx|bunx)\s/`. This cleans stale JS commands from pre-fix installations. Conservative regex — native commands like `pytest` or `bundle exec rspec` never match.

**Open question from scope resolved:** `buildNonNodeCommands` lives in `state.ts` alongside `buildDirectTestCommand` — same shape, same scope, not worth a new module.

## Output Mockups

### Ruby project with .rspec (Mastodon pattern)

```
ana.json commands:
  build: null
  test: "bin/rspec"        # or "bundle exec rspec" when bin/rspec missing
  lint: null
  dev: null

scan.json stack.testing: ["RSpec"]
```

### Rust project (Biome pattern)

```
ana.json commands:
  build: "cargo build"
  test: "cargo test"
  lint: "cargo clippy"
  dev: null
  # NO buildPackage — scoping block skipped for non-Node

scan.json stack.testing: ["Cargo test"]
```

### Non-Node init display (commands.test is null)

```
  Next:
    claude --agent ana-setup    Configure commands + enrich context (~10 min)
    claude --agent ana          Start working (after setup)
```

### Non-Node init display (commands.test IS populated — Rust, Go, Ruby+.rspec)

```
  Next:
    claude --agent ana          Start working (Ana knows your stack)
    claude --agent ana-setup    Enrich with your team's knowledge (optional, ~10 min)
```

### Setup template config confirmation (non-Node with null commands)

```
  ⚠ commands.test          null — needs configuration
  ⚠ commands.build         null — needs configuration
```

## File Changes

### `packages/cli/src/engine/scan-engine.ts` (modify)
**What changes:** Two additions: (1) Ruby and Rust branches in `detectNonNodeTesting`. (2) Clear-and-rebuild block after rootDevDeps loop — if non-Node, replace `stack.testing` with fresh `detectNonNodeTesting` results. Pass `projectTypeResult.type` to `detectCommands`.
**Pattern to follow:** Existing Python/Go branches in `detectNonNodeTesting` for the new language branches. Existing non-Node AI SDK enrichment block (lines 820-825) for the guard pattern.
**Why:** Without clear-and-rebuild, JS testing frameworks contaminate `stack.testing` through multiple paths. Without Ruby/Rust branches, those projects get empty `stack.testing` after rebuild.

### `packages/cli/src/engine/detectors/commands.ts` (modify)
**What changes:** Add `projectType` parameter. Add early-return guard after the existing `packageManager === null` guard: if projectType is not `'node'` and not `'unknown'`, still read package.json to populate `result.all`, then return (named commands stay null).
**Pattern to follow:** The new guard has a DIFFERENT shape from the existing `packageManager === null` guard. The packageManager guard returns immediately (before reading package.json). The new projectType guard must read package.json to populate `result.all` FIRST, then return without setting named commands. Place the guard AFTER the package.json read block (after `result.all = scripts`), not before it.
**Why:** Prevents wrong JS commands from entering EngineResult. All consumers (skills.ts, init, agents) benefit automatically.

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** Five additions: (1) `buildNonNodeCommands` function. (2) Call it in `createAnaJson` for non-Node languages, merging results into the commands object. (3) Guard the scoping block (lines 425-453) with a language check. (4) JS command migration in `preserveUserState`. (5) Conditional init display at the "Next:" section.
**Pattern to follow:** `buildDirectTestCommand` at lines 248-269 for the new function. Blank sanitizer loop at lines 572-579 for the migration. Non-Node suggestion at lines 807-816 for the language check pattern.
**Why:** Produces correct native commands for non-Node projects. Prevents Biome from getting JS scoped commands. Cleans stale JS commands on re-init. Guides non-Node users to setup when commands are missing.

### `packages/cli/src/utils/worktree.ts` (modify)
**What changes:** `getBuildCommandString` returns `''` (empty string) instead of `'pnpm run build'` when `commands.build` is not a string. The callers at lines 588 and 591 are inside `buildSucceeded === true/false` branches — unreachable when `runBuildCommand` returned null. But TypeScript string interpolation of `null` produces the literal string `"null"`. Use `''` (empty string) as the fallback — it's a display function, empty string is semantically correct for "no command configured."
**Pattern to follow:** `runBuildCommand` at lines 446-455 — already returns null for non-string commands.
**Why:** Non-Node projects have `commands.build: null`. The fallback to `'pnpm run build'` is a lie. Empty string is honest and TypeScript-safe.

### `packages/cli/templates/.claude/agents/ana-setup.md` (modify)
**What changes:** Change the config confirmation instruction from "skip null/empty fields" to surface null `commands.test` and `commands.build` with a ⚠ marker so the setup agent asks the user to configure them.
**Pattern to follow:** The existing "On correction" flow at the same location — same read/change/write/verify mechanism.
**Why:** Without this, the setup agent silently skips the fields the user most needs to configure.

### `.claude/agents/ana-setup.md` (modify)
**What changes:** Same change as the product template — dogfood copy.
**Pattern to follow:** Product template change above.
**Why:** Dogfood must match product.

## Acceptance Criteria

- [ ] AC1: A Ruby project with `.rspec` and `bin/rspec` gets `commands.test: 'bin/rspec'`, other commands null. Falls back to `'bundle exec rspec'` when `bin/rspec` doesn't exist.
- [ ] AC2: A TypeScript project is completely unaffected — all commands generated identically to before.
- [ ] AC3: A Python project with pytest detected gets `commands.test: 'pytest'`, other commands null.
- [ ] AC4: A Go project gets `commands.test: 'go test ./...'`, `commands.build: 'go build ./...'`, other commands null.
- [ ] AC5: A Rust project gets `commands.test: 'cargo test'`, `commands.build: 'cargo build'`, `commands.lint: 'cargo clippy'`, `commands.dev: null`.
- [ ] AC6: A Ruby project WITHOUT `.rspec` gets `commands.test: null`.
- [ ] AC7: `stack.testing` for a Ruby project with `.rspec` and JS devDeps shows `['RSpec']` — JS testing contamination eliminated.
- [ ] AC8: `detectNonNodeTesting` has Ruby branch (`.rspec` → RSpec, `test/` → Minitest) and Rust branch (→ `['Cargo test']`).
- [ ] AC9: `commands.all` in scan.json still shows package.json scripts for polyglot projects.
- [ ] AC10: A Rust project with JS workspace packages gets `buildPackage: null` — scoped JS commands suppressed.
- [ ] AC11: Skills Detected section does NOT contain JS test commands for non-Node projects.
- [ ] AC12: `getBuildCommandString` returns `''` (empty string) for null build command — not `'pnpm run build'`.
- [ ] AC13: A user who set `commands.test: 'bundle exec rspec'` via config has that command survive re-init.
- [ ] AC14: `preserveUserState` clears stale JS commands matching `/(npm|yarn|pnpm|npx|bunx)\s/` on non-Node projects during re-init.
- [ ] AC15: `stack.testing` for a Rust project shows `['Cargo test']`.
- [ ] AC16: A TypeScript project's init output still shows setup as "optional" with ana listed first.
- [ ] AC17: A non-Node project with null `commands.test` shows setup FIRST without "optional".
- [ ] AC18: A non-Node project where test IS populated shows setup as "optional".
- [ ] AC19: The setup template surfaces null command fields with ⚠ marker.
- [ ] AC20: After setup on a project with null commands, configured commands persist to ana.json.
- [ ] AC21: Dogfood template updated to match product template.
- [ ] Tests pass: `pnpm run test -- --run`
- [ ] No build errors: `pnpm run build`
- [ ] Lint clean: `(cd packages/cli && pnpm run lint)`

## Testing Strategy

- **Unit tests (scan-engine integration):** Extend `scanProject.test.ts` with polyglot project fixtures. The existing Python/Go/Rust fixtures (lines 589-674) assert `commands.test: null` at the ENGINE level — these assertions are STILL CORRECT (the engine suppresses JS commands to null; native commands are set later in `createAnaJson`). Do NOT modify existing scanProject assertions. Add NEW polyglot fixtures (Ruby + package.json + yarn + `.rspec`) that test contamination elimination: `stack.testing` contains `['RSpec']` not `['Vitest']`, named commands are null, `commands.all` is populated. New state.ts tests cover the native command layer separately.
- **Unit tests (commands detector):** New test file `tests/detectors/commands.test.ts`. Test `detectCommands` directly with projectType parameter: node project gets JS commands; ruby project with package.json gets null named commands but populated `all`; no-package-json project returns all-null.
- **Unit tests (state.ts):** New test file `tests/commands/init/state.test.ts` or extend existing. Test `buildNonNodeCommands` directly: Ruby+RSpec with/without bin/rspec, Go, Rust, Python+pytest, unknown language. Test the `preserveUserState` JS command migration.
- **Unit tests (worktree):** Test `getBuildCommandString` returns `''` (empty string) when commands.build is null in ana.json.
- **Edge cases:** Ruby without `.rspec` or `test/` → `commands.test: null`. TypeScript project → zero behavioral change. Polyglot project → `commands.all` populated but named commands null. Re-init with user-set native command → preserved. Re-init with stale JS command on non-Node → cleared.

## Dependencies

- `detectProjectType` must return correct types for Ruby/Rust/Python/Go — verified working.
- `existsSync` from `node:fs` for the Ruby `bin/rspec` check in `buildNonNodeCommands`.

## Constraints

- TypeScript projects must be completely unaffected — every guard checks language or projectType, never a blanket change.
- `commands.all` must stay populated for polyglot projects — only named commands are suppressed.
- Engine files (`scan-engine.ts`, `commands.ts`) have zero CLI dependencies — no chalk, no ora.
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Exported functions require `@param` and `@returns` JSDoc.

## Gotchas

- **`projectProfile.type` is NOT projectType.** `projectProfile.type` is `frameworkResult.framework || projectTypeResult.type` — it could be `'Next.js'` not `'node'`. In `scanProject`, use `projectTypeResult.type` directly. In `createAnaJson` and `preserveUserState`, use `result.stack.language` / `newAnaConfig['language']` — check against `'TypeScript'` and `'Node.js'` (display names, not detector values).
- **The scoping block (state.ts:425-453) reads package.json independently of `detectCommands`.** Suppressing in `detectCommands` alone leaves Biome with JS `buildPackage`. The scoping block needs its own language guard.
- **`makeTestCommandNonInteractive` operates after `createAnaJson` sets the test command.** For non-Node projects, the test command will be native (e.g., `'bin/rspec'`). The existing Vitest/Jest/Mocha checks won't match — native commands pass through unchanged. No change needed.
- **`preserveUserState` receives `newAnaConfig`, not `engineResult`.** The language field is at `newAnaConfig['language']` (a display name like `'Ruby'`, `'Python'`). The JS regex migration checks language, not projectType.
- **Init display reads `anaConfig` (post-merge) values, not `engineResult`.** This means it reflects preserved user commands from re-init. Correct behavior: if the user already configured commands, setup stays optional.
- **`detectNonNodeTesting` is async** — it reads the filesystem. The clear-and-rebuild must await it.
- **`buildNonNodeCommands` needs `existsSync` for Ruby `bin/rspec` check.** Import from `node:fs` (not `node:fs/promises`). `state.ts` may not have this import yet — add it.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions: `import { foo } from './bar.js'`. Omitting crashes at runtime.
- Use `import type` for type-only imports, separate from value imports.
- Use `| null` for fields that were checked and found empty. Reserve `?:` for unchecked fields.
- Prefer early returns over nested conditionals.
- Engine files have zero CLI dependencies — no chalk/ora in `scan-engine.ts` or `commands.ts`.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Always pass `--run` with `pnpm test` to avoid watch mode hang.
- Tests: use inline fixture data, create files in temp directories. Force branch name with `git init -b main`.
- Tests: assert specific values, not existence. `toBe('bin/rspec')` not `toBeDefined()`.

### Pattern Extracts

**`detectNonNodeTesting` — existing Python/Go branches (scan-engine.ts:68-94):**
```typescript
async function detectNonNodeTesting(
  rootPath: string,
  projectType: string
): Promise<string[]> {
  try {
    if (projectType === 'python') {
      const deps = await readPythonDependencies(rootPath);
      const detected: string[] = [];
      if (deps.includes('pytest')) detected.push('pytest');
      if (deps.includes('unittest')) detected.push('unittest');
      return detected;
    }
    if (projectType === 'go') {
      const deps = await readGoDependencies(rootPath);
      return deps.length >= 0 ? ['Go testing'] : [];
    }
  } catch {
    // Parser failure — fall through silently.
  }
  return [];
}
```

**`detectCommands` guard pattern (commands.ts:38-40):**
```typescript
  if (packageManager === null) {
    return result;
  }
```

**`buildDirectTestCommand` — structural analog (state.ts:248-269):**
```typescript
export function buildDirectTestCommand(
  frameworks: string[],
  packageManager: string,
): string | null {
  const runner = packageManager === 'npm' ? 'npx' : packageManager;
  if (frameworks.includes('Vitest')) {
    return `${runner} vitest run`;
  }
  if (frameworks.includes('Jest')) {
    return `${runner} jest --watchAll=false`;
  }
  if (frameworks.includes('Mocha')) {
    return `${runner} mocha --exit`;
  }
  if (frameworks.includes('pytest')) {
    return 'pytest';
  }
  return null;
}
```

**Blank sanitizer in `preserveUserState` (state.ts:572-579):**
```typescript
    const mergedCommands = merged.commands as Record<string, unknown> | undefined;
    if (mergedCommands) {
      const freshCommands = (newAnaConfig['commands'] ?? {}) as Record<string, unknown>;
      for (const key of ['test', 'build', 'lint', 'buildPackage', 'testPackage']) {
        if (mergedCommands[key] === '') {
          mergedCommands[key] = freshCommands[key] ?? null;
        }
      }
```

**Non-Node language check pattern (state.ts:808-809):**
```typescript
    const lang = engineResult.stack.language;
    if (lang && lang !== 'TypeScript' && lang !== 'Node.js') {
```

**Init display "Next:" section (state.ts:833-836):**
```typescript
  console.log('  Next:');
  console.log(chalk.cyan('    claude --agent ana') + '          Start working (Ana knows your stack)');
  console.log(chalk.cyan('    claude --agent ana-setup') + '    Enrich with your team\'s knowledge (optional, ~10 min)');
```

**`getBuildCommandString` current fallback (worktree.ts:425-434):**
```typescript
function getBuildCommandString(wtPath: string): string {
  try {
    const raw = fs.readFileSync(path.join(wtPath, '.ana', 'ana.json'), 'utf-8');
    const config = JSON.parse(raw);
    const cmd = config?.commands?.build;
    return typeof cmd === 'string' ? cmd : 'pnpm run build';
  } catch {
    return 'pnpm run build';
  }
}
```

### Proof Context

**scan-engine.ts:** A017 (Node AI SDK unchanged) has no dedicated test — low relevance to this build.

**state.ts:**
- `monorepo-build-scoping-C5` / `flip-monorepo-commands-C4`: pkg.path injected without sanitization. Pre-existing, not introduced by this build. The scoping block guard we're adding makes this path unreachable for non-Node — slight risk reduction.
- `reinit-field-refresh-C2`: Merge override assumes newAnaConfig always contains all four keys. Relevant — the new JS command migration operates on mergedCommands in the same area. Ensure migration only touches keys that exist.

**worktree.ts:**
- `worktree-build-step-C3`: getBuildCommandString re-reads ana.json with misleading fallback. This build directly fixes the misleading fallback.

### Checkpoint Commands

- After `scan-engine.ts` + `commands.ts` changes: `(cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts)` — Expected: existing tests pass, new polyglot tests pass
- After `state.ts` changes: `(cd packages/cli && pnpm vitest run tests/engine/scanProject.test.ts)` — Expected: still passing
- After `worktree.ts` changes: `(cd packages/cli && pnpm vitest run)` — Expected: all tests pass
- After all changes: `pnpm run test -- --run` — Expected: 2589+ tests pass (baseline 2589)
- Lint: `(cd packages/cli && pnpm run lint)`
- Build: `pnpm run build`

### Build Baseline
- Current tests: 2589 passed, 2 skipped (2591 total)
- Current test files: 113 passed (113 total)
- Command used: `pnpm run test -- --run`
- After build: expected ~2610+ tests (new polyglot fixtures, commands detector tests, state tests, worktree test)
- Regression focus: `tests/engine/scanProject.test.ts` — existing Python/Go/Rust fixtures assert `commands.test: null` at the ENGINE level. These are STILL CORRECT (engine suppresses JS commands to null; native commands are set in `createAnaJson`). Do NOT modify existing assertions. Add new polyglot fixtures instead.
