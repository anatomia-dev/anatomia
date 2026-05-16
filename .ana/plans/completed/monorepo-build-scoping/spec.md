# Spec: Monorepo build command scoping

**Created by:** AnaPlan
**Date:** 2026-05-15
**Scope:** .ana/plans/active/monorepo-build-scoping/scope.md

## Approach

Extend `createAnaJson` in `state.ts` to scope build and lint commands to the primary package in monorepos, using the same guard pattern as the existing test scoping (lines 398-410).

The mechanism differs from test scoping: test uses `buildDirectTestCommand` (framework-to-runner mapping), while build/lint requires reading the primary package's `package.json` to check for script keys. Add a `cwd` parameter to `createAnaJson` so it can construct `${cwd}/${pkg.path}/package.json` and read the scripts object.

Key lookup order must match `detectCommands` exactly:
- Build: `build`, `compile`, `tsc` (commands.ts:52)
- Lint: `lint`, `eslint`, `biome` (commands.ts:67)

Package manager prefix follows the same pattern as `detectCommands:49`: `npm run` for npm, `${pm} run` for others.

The package.json read must be try/catch guarded — missing or malformed files fall back silently to the root command. The `dev` command is never scoped.

No shared helper extraction. Test scoping and build/lint scoping look similar at the guard level but diverge in mechanism (framework mapping vs package.json script lookup). Extracting would add indirection for two callers that do different things.

## Output Mockups

Before (monorepo with primary package `packages/cli`):
```json
{
  "commands": {
    "build": "pnpm run build",
    "test": "(cd packages/cli && pnpm vitest run)",
    "lint": "pnpm run lint",
    "dev": "pnpm run dev"
  }
}
```

After:
```json
{
  "commands": {
    "build": "(cd packages/cli && pnpm run build)",
    "test": "(cd packages/cli && pnpm vitest run)",
    "lint": "(cd packages/cli && pnpm run lint)",
    "dev": "pnpm run dev"
  }
}
```

When primary package has `compile` instead of `build`:
```json
{
  "commands": {
    "build": "(cd packages/cli && pnpm run compile)",
    "test": "(cd packages/cli && pnpm vitest run)",
    "lint": "(cd packages/cli && pnpm run lint)",
    "dev": "pnpm run dev"
  }
}
```

When primary package has NO build script — keeps root command:
```json
{
  "commands": {
    "build": "pnpm run build",
    "test": "(cd packages/cli && pnpm vitest run)",
    "lint": "(cd packages/cli && pnpm run lint)",
    "dev": "pnpm run dev"
  }
}
```

## File Changes

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** Add `cwd` parameter to `createAnaJson`. After the test scoping block (line 410), add build and lint scoping. Read the primary package's `package.json` once, check for build script keys (`build`, `compile`, `tsc`) and lint script keys (`lint`, `eslint`, `biome`). If found, construct `(cd ${pkg.path} && ${prefix} ${key})`. If not found, keep the root command unchanged.
**Pattern to follow:** The test scoping block at lines 397-410 for the guard and command format. The `detectCommands` function in `commands.ts:49-68` for key lookup order and package manager prefix.
**Why:** Without this, monorepo customers get `pnpm run build` which triggers `turbo run build` across all packages (30-60s), when agents only need the primary package build (3s).

### `packages/cli/src/commands/init/index.ts` (modify)
**What changes:** Pass `cwd` to `createAnaJson` at line 108. The variable is already available at the call site (line 102 uses it for `runAnalyzer(cwd)`).
**Pattern to follow:** Same line — `runAnalyzer(cwd)` shows the pattern.
**Why:** `createAnaJson`'s new `cwd` parameter must be supplied at the only call site.

### `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` (create)
**What changes:** New test file covering all eight acceptance criteria. Tests call `createAnaJson` with a real temp directory containing a fake primary package's `package.json` (with appropriate scripts). Follows the structure of `makeTestCommand.test.ts` — same imports, same temp directory pattern, same `readAnaJson` helper.
**Pattern to follow:** `tests/commands/init/makeTestCommand.test.ts` lines 118-220 — the `createAnaJson monorepo test command scoping` describe block. Same tmpDir setup/teardown, same `readAnaJson` helper, same `createEmptyEngineResult()` mock pattern.
**Why:** Zero existing tests for build/lint scoping. All scenarios must be verified.

## Acceptance Criteria

- [ ] AC1: Fresh `ana init` on a monorepo with a primary package that has a `build` script produces a scoped build command: `(cd {pkg.path} && {pm} run build)`
- [ ] AC2: Fresh `ana init` on a monorepo with a primary package that has a `lint` script produces a scoped lint command: `(cd {pkg.path} && {pm} run lint)`
- [ ] AC3: Fresh `ana init` on a monorepo where the primary package has NO build script keeps the root build command
- [ ] AC4: Fresh `ana init` on a monorepo where the primary package has NO lint script keeps the root lint command
- [ ] AC5: Fresh `ana init` on a single-package repo produces identical behavior to today
- [ ] AC6: `dev` command is never scoped regardless of monorepo status
- [ ] AC7: Build script key lookup checks `build`, `compile`, `tsc` (same keys as `detectCommands`). Lint checks `lint`, `eslint`, `biome`
- [ ] AC8: Tests cover all six scenarios above (AC1-AC6) plus the key-variant lookup (AC7)
- [ ] Tests pass: `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors: `(cd packages/cli && pnpm run build)`

## Testing Strategy

- **Unit tests:** New file `tests/commands/init/monorepoCommandScoping.test.ts`. Each test creates a temp directory, writes a fake primary package.json with specific scripts, builds an `EngineResult` with monorepo data, calls `createAnaJson(tmpDir, result, cwd)` (where `cwd` is a parent temp dir containing the fake package structure), and asserts on the resulting ana.json commands.
- **Edge cases:**
  - Primary package.json missing entirely → falls back to root commands
  - Primary package.json with malformed JSON → falls back to root commands
  - Primary package with `compile` instead of `build` → uses `compile`
  - Primary package with `biome` instead of `lint` → uses `biome`
  - npm as package manager → prefix is `npm run` not `pnpm run`
  - Single-repo (not monorepo) → no scoping applied
  - Monorepo with `dev` script → dev is never scoped

## Dependencies

None. All required infrastructure exists.

## Constraints

- `createAnaJson` signature change must be backward-compatible with the single call site in `index.ts`.
- Key lookup order must exactly match `detectCommands` to avoid confusing users who see different behavior between scan detection and init scoping.
- The package.json read must never crash init — silent fallback to root command on any error.

## Gotchas

- `result.commands.build` and `result.commands.lint` contain the ROOT package.json commands (e.g., `pnpm run build` which may invoke turbo). These are the fallback values. Don't confuse them with the primary package's scripts.
- `result.commands.all` is also ROOT scripts — it does NOT contain primary package scripts. The primary package scripts come from reading the actual `package.json` file on disk.
- The `cwd` parameter is the project root, not the primary package path. The primary package path is `${cwd}/${pkg.path}`.
- `createAnaJson` uses `ora` spinners which write to stdout. Tests that call it will see spinner output. The existing `makeTestCommand.test.ts` tests already handle this — they don't mock ora, they just let it run. Follow the same approach.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Prefer early returns over nested conditionals.
- Engine files have zero CLI dependencies — but `state.ts` is a command file, so `fs` reads are fine here.
- Always use `--run` with `pnpm vitest` to avoid watch mode hang.

### Pattern Extracts

Test scoping block to mirror (state.ts:397-410):
```typescript
  let testCmd = makeTestCommandNonInteractive(result.commands.test, result.stack.testing, result.commands.all?.['test']);
  if (testCmd && result.monorepo.isMonorepo && result.monorepo.primaryPackage) {
    const pkg = result.monorepo.primaryPackage;
    const pm = result.commands.packageManager || 'pnpm';

    // Map detected testing framework to direct runner invocation
    const directCmd = buildDirectTestCommand(result.stack.testing, pm);
    if (directCmd) {
      testCmd = `(cd ${pkg.path} && ${directCmd})`;
    } else {
      // Unknown framework — cd with root-derived command as fallback
      testCmd = `(cd ${pkg.path} && ${testCmd})`;
    }
  }
```

Key lookup and prefix from detectCommands (commands.ts:49-68):
```typescript
    const prefix = packageManager === 'npm' ? 'npm run' : `${packageManager} run`;

    // Build: first match
    for (const key of ['build', 'compile', 'tsc']) {
      if (scripts[key]) { result.build = `${prefix} ${key}`; break; }
    }

    // Lint: first match
    for (const key of ['lint', 'eslint', 'biome']) {
      if (scripts[key]) { result.lint = `${prefix} ${key}`; break; }
    }
```

Test pattern from makeTestCommand.test.ts (lines 118-143):
```typescript
describe('createAnaJson monorepo test command scoping', () => {
  let tmpDir: string;

  async function readAnaJson(dir: string): Promise<Record<string, unknown>> {
    const content = await fs.readFile(path.join(dir, 'ana.json'), 'utf-8');
    return JSON.parse(content);
  }

  it('scopes pnpm monorepo with Vitest using direct invocation', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    try {
      const result = createEmptyEngineResult();
      result.commands = { build: null, test: 'pnpm run test', lint: null, dev: null, packageManager: 'pnpm', all: { test: 'turbo run test' } };
      result.stack.testing = ['Vitest'];
      result.monorepo = {
        isMonorepo: true, tool: 'pnpm',
        packages: [{ name: '@myapp/web', path: 'apps/web' }],
        primaryPackage: { name: '@myapp/web', path: 'apps/web' },
      };

      await createAnaJson(tmpDir, result);
      const cmds = (await readAnaJson(tmpDir))['commands'] as Record<string, string | null>;
      expect(cmds['test']).toBe('(cd apps/web && pnpm vitest run)');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });
```

### Proof Context
No active proof findings for `state.ts`. The `index.ts` finding about Commander `--json` inheritance is unrelated to this change.

### Checkpoint Commands

- After modifying `state.ts`: `(cd packages/cli && pnpm vitest run tests/commands/init/makeTestCommand.test.ts --run)` — Expected: existing 23 tests still pass (no regressions in existing test/monorepo scoping)
- After adding new test file: `(cd packages/cli && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts --run)` — Expected: all new tests pass
- After all changes: `(cd packages/cli && pnpm vitest run --run)` — Expected: 2336+ tests pass, 0 failures
- Lint: `pnpm run lint`
- Build: `(cd packages/cli && pnpm run build)`

### Build Baseline
- Current tests: 2336 passed, 2 skipped (104 test files)
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2336 + ~10-12 new tests in 105 test files
- Regression focus: `tests/commands/init/makeTestCommand.test.ts` (existing monorepo test scoping tests — verify they still pass with the `cwd` signature change)
