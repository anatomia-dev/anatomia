# Spec: Flip Monorepo Command Semantics

**Created by:** AnaPlan
**Date:** 2026-05-17
**Scope:** .ana/plans/active/flip-monorepo-commands/scope.md

## Approach

Reverse the command assignment flow in `createAnaJson`. Currently: root commands are captured, then overwritten by scoped variants. After the flip: root commands stay as `build`/`test` (project-wide). The monorepo block computes `buildPackage`/`testPackage` as NEW additive keys — never destructive to `build`/`test`.

The key restructuring is splitting the `testCmd` mutation. Currently `testCmd` starts as root non-interactive, then gets overwritten with `(cd ...)` in the monorepo block. After: two separate variables — `testCmd` stays root, `testPackageCmd` gets the scoped value. Same pattern for build — `buildCmd` stays root, `buildPackageCmd` gets the scoped value.

`buildPackage`/`testPackage` are written only when their value differs from `build`/`test`. Single-package projects get no extra fields.

A propagation loop in `preserveUserState` ensures new command keys from fresh detection appear on re-init without overwriting user customizations.

Templates get simplified: unconditional "use `commands.build`" for project build. Build Brief checkpoint commands for focused testing (not `commands.test`).

## Output Mockups

### ana.json for a monorepo (e.g., our repo after fresh init)
```json
{
  "commands": {
    "build": "pnpm run build",
    "test": "pnpm run test -- --run",
    "lint": "(cd packages/cli && pnpm run lint)",
    "dev": "pnpm run dev",
    "buildPackage": "(cd packages/cli && pnpm run build)",
    "testPackage": "(cd packages/cli && pnpm vitest run)"
  }
}
```

### ana.json for a single-package project (unchanged)
```json
{
  "commands": {
    "build": "pnpm run build",
    "test": "pnpm run test -- --run",
    "lint": "pnpm run lint",
    "dev": "pnpm run dev"
  }
}
```

### ana.json for monorepo where root == scoped (no extra fields)
```json
{
  "commands": {
    "build": "pnpm run build",
    "test": "pnpm run test -- --run",
    "lint": "pnpm run lint",
    "dev": "pnpm run dev"
  }
}
```

## File Changes

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** Reverse command assignment in `createAnaJson` (lines 398–469). Split `testCmd` into two variables: `testCmd` (root non-interactive, becomes `test` in ana.json) and `testPackageCmd` (scoped, becomes `testPackage`). Similarly split `buildCmd`/`buildPackageCmd`. Write `buildPackage`/`testPackage` only when monorepo AND value differs from root.

Add propagation loop in `preserveUserState` (after line 562). After the blank-string sanitization loop, iterate `freshCommands` keys — for any key that doesn't exist in `mergedCommands`, copy the fresh value (skip null/empty).

Also extend the blank-string sanitization list from `['test', 'build', 'lint']` to include `'buildPackage'` and `'testPackage'`.

**Pattern to follow:** The existing monorepo scoping block (lines 415–450) is the structural analog — same conditional structure, same location. The existing blank-string sanitization loop (lines 553–563) is the propagation loop analog.

**Why:** Without this, `build` stays scoped and the worktree (which reads `commands.build` directly) compiles only the primary package instead of the full project.

### `packages/cli/src/commands/config.ts` (modify)
**What changes:** Add `'commands.buildPackage'` and `'commands.testPackage'` to the `COMMAND_FIELDS` array (line 328). This enables empty-string rejection for the new fields.

**Pattern to follow:** Existing entries use dot notation with `commands.` prefix.

**Why:** Without this, `ana config set commands.buildPackage ""` would silently set an empty string, which is never a valid command.

### `packages/cli/templates/.claude/agents/ana-build.md` (modify)
**What changes:** Three areas:

1. **Lines 105–107** (Build and Run Baseline Tests): Replace "run the test commands from the Build Brief section of the spec (Checkpoint Commands). If no Build Brief exists, discover commands from the project's build configuration" with clear two-step wording:
   - Build step: Run `commands.build` from ana.json
   - Test step: Run checkpoint commands from the Build Brief. `commands.test` is project-wide — use it only for the final "after all changes" baseline, not for per-file checkpoints

2. **Lines 369–373** (Verification Commands section): Replace `{test command from ana.json commands.test}` with `{checkpoint test command from Build Brief}`. The build reports the actual command Verify should run — which is the focused command from the Brief, not the project-wide `commands.test`.

3. **Line 34** (Load Skills and Context): Update the parenthetical from "for baseline tests and checkpoint commands" to "for project-wide build/test and `coAuthor`" — since checkpoints now come from the Build Brief, not ana.json.

**Pattern to follow:** The template uses unconditional instructions — no "if present" or "or" qualifiers.

**Why:** This eliminates the "competing instructions" bug where Build reads both `commands.test` and Build Brief, picks one ambiguously, and runs the wrong command.

### `packages/cli/templates/.claude/agents/ana-verify.md` (modify)
**What changes:** Two areas:

1. **Lines 81–82** (Load Context): Update from "commands field has the exact build/test/lint commands" to clarify that `commands.build` is for project-wide build, and Build Brief checkpoint commands are for test verification.

2. **Lines 169–175** (Step 2: Run Build, Tests, Lint): Replace the placeholder block:
   - Build: `{build command from ana.json commands.build}`
   - Test: `{checkpoint test command from Build Brief's Verification Commands section}`
   - Lint: `{lint command from ana.json commands.lint}`

   The Verify template should instruct the verifier to read the Verification Commands section of the build report for the focused test command — that's where Build records the actual command it used.

**Pattern to follow:** The existing Step 2 structure with the `bash` code block.

**Why:** Without this, Verify runs project-wide tests that may pass even when the specific package's tests fail (turbo caching, or different test configs per package).

### `packages/cli/templates/.claude/agents/ana-plan.md` (modify)
**What changes:** Two areas in the Build Brief section:

1. **Line 420** (Checkpoint Commands): Update to reference `commands.test` for the final "after all changes" baseline. For per-file checkpoints in the Build Brief, use `commands.testPackage` as a starting point but always write the correct command for THIS scope's target package (since `testPackage` targets the primary package, which may not be the scope's target).

2. **Line 427** (Build Baseline): Keep `commands.test` for baseline — this is correct (project-wide baseline run).

**Pattern to follow:** The existing checkpoint template format with `- After {change}: {command} — Expected: {result}`.

**Why:** Plan must produce Build Briefs with the focused test command, not the project-wide one. This is where the correct command enters the pipeline.

### `.claude/agents/ana-build.md` (modify)
**What changes:** Byte-identical to the product template after changes.
**Pattern to follow:** Copy from `packages/cli/templates/.claude/agents/ana-build.md`.
**Why:** Dogfood sync — AC11.

### `.claude/agents/ana-verify.md` (modify)
**What changes:** Byte-identical to the product template after changes.
**Pattern to follow:** Copy from `packages/cli/templates/.claude/agents/ana-verify.md`.
**Why:** Dogfood sync — AC11.

### `.claude/agents/ana-plan.md` (modify)
**What changes:** Byte-identical to the product template after changes.
**Pattern to follow:** Copy from `packages/cli/templates/.claude/agents/ana-plan.md`.
**Why:** Dogfood sync — AC11.

### `website/content/docs/guides/troubleshooting.mdx` (modify)
**What changes:** Two TroubleCards:

1. **Line 41** ("Monorepo: scan covers the whole repo"): Update the override guidance from "set `commands.test` and `commands.build` in ana.json to target it" to reflect the new semantics: `commands.test` and `commands.build` are now project-wide by default. To scope pipeline work to a specific package, set `commands.testPackage` for the primary package focus, or use Build Brief checkpoint commands for per-scope targeting.

2. **Lines 69–72** ("Tests fail in pipeline but pass locally"): Update step 1 from "look at `commands.test`" to "look at `commands.test` (project-wide) and `commands.testPackage` (primary package)". Update step 3 to show both override options.

**Pattern to follow:** Existing TroubleCard format with concise, actionable guidance.

**Why:** Stale docs send users down the wrong path when debugging command issues.

### `website/content/docs/start.mdx` (modify)
**What changes:** Line 44 callout: Change "In monorepos they may not target the right package" to reflect the new truth — commands ARE project-wide now. Reword to: "These are project-wide commands. For monorepos, `buildPackage` and `testPackage` target your primary package specifically."

**Pattern to follow:** Existing `<Callout variant="note">` format.

**Why:** The old callout warns about a problem that no longer exists after the flip.

### `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` (modify)
**What changes:** Rewrite assertions to match flipped semantics. The test file structure, helpers (`makeMonorepoResult`, `setupPrimaryPackage`, `readAnaJson`), and cleanup patterns stay identical. Only the assertion values change:

- A001: Assert `build` is root (`'pnpm run build'`), `buildPackage` is scoped (`'(cd packages/cli && pnpm run build)'`)
- A002: Assert `lint` stays scoped (lint is NOT flipped — it remains `'(cd packages/cli && pnpm run lint)'`). No `lintPackage` field.
- A003: Assert `build` is root when primary package lacks build script. Assert `buildPackage` is `undefined`.
- A004: Assert `lint` is root when primary package lacks lint script (unchanged behavior).
- A005: Assert `buildPackage` is `undefined` and `testPackage` is `undefined` for single-repo.
- A006: Dev command unchanged.
- A007: Assert `build` is root, `buildPackage` uses compile key.
- A008: Lint stays scoped (not flipped). No change to assertion value.
- A009–A010: `build` stays root when package.json missing/malformed. Assert `buildPackage` is `undefined`.
- A011: Assert `build` is root (`'npm run build'`), `buildPackage` is scoped with npm prefix.
- A012: Assert `test` is root non-interactive, `testPackage` is scoped.

Add new tests:
- A013: Assert `buildPackage` not written when root and scoped values are identical.
- A014: Assert `testPackage` not written when root and scoped test commands are identical.
- A015: `preserveUserState` propagation — new keys from fresh detection appear on re-init.
- A016: `preserveUserState` propagation — existing keys are NOT overwritten by fresh values.

**Pattern to follow:** Existing test structure — `fs.mkdtemp` for temp dirs, try/finally cleanup, `readAnaJson` helper.

**Why:** Tests enforce the new semantics. Without updated tests, CI passes on the old behavior.

## Acceptance Criteria

- [ ] AC1: For monorepos, `build` and `test` in ana.json are project-wide root commands (no `(cd ...` prefix).
- [ ] AC2: For monorepos, `buildPackage` and `testPackage` contain the primary-package-scoped commands, and only appear when they differ from `build`/`test`.
- [ ] AC3: For single-package projects, only `build`, `test`, `lint`, `dev` exist. No `buildPackage`/`testPackage`.
- [ ] AC4: Worktree `runBuildCommand` continues to read `commands.build` directly (no code change needed). After the flip, `build` contains the project-wide command.
- [ ] AC5: Build template says "use `commands.build`" for project build. For test execution, Build Brief checkpoint commands are authoritative — `commands.test` is only for the final baseline.
- [ ] AC6: Verify template uses `commands.build` for build step. For test verification, uses Build Brief checkpoint commands (reads them from the build report's Verification Commands section).
- [ ] AC7: Plan template references `commands.test` for full baseline runs. For Build Brief checkpoint commands, uses `commands.testPackage` as a starting point but adapts for the scope's target package.
- [ ] AC8: `preserveUserState` propagation loop: new command keys from fresh detection appear on re-init without overwriting existing user-customized values.
- [ ] AC9: `ana config set commands.buildPackage ""` is rejected (COMMAND_FIELDS validation).
- [ ] AC10: Troubleshooting docs and quickstart callout reflect new command semantics.
- [ ] AC11: Dogfood templates (`.claude/agents/`) are byte-identical to product templates after changes.
- [ ] Tests pass with `(cd packages/cli && pnpm vitest run)`
- [ ] No build errors with `(cd packages/cli && pnpm run build)`

## Testing Strategy

- **Unit tests:** Rewrite existing `monorepoCommandScoping.test.ts` assertions (12 tests flip, 4 new tests added). Follow the existing test structure exactly — `fs.mkdtemp`, `try/finally`, `readAnaJson` helper, `@ana` tags.
- **Integration tests:** The `preserveUserState` propagation tests (A015, A016) require calling `preserveUserState` with an existing ana.json and a fresh config. Use the existing `createAnaJson` call followed by a second call simulating re-init — read the approach from how A012 sets up its result.
- **Edge cases:** A013/A014 cover the "identical values" edge. A009/A010 already cover missing/malformed package.json. A005 covers single-repo getting no extra fields.

## Dependencies

- No external dependencies. All changes are internal to the CLI package and templates.

## Constraints

- `lint` command stays scoped (not flipped). The scope explicitly rejects `lintPackage`.
- `worktree.ts` must NOT be modified — it already reads `commands.build` and gets correct behavior automatically after the flip.
- The propagation loop must never overwrite existing keys — it's additive only.
- Template instructions must be unconditional — no "if present" or "or" language.

## Gotchas

- **`testCmd` mutation is NOT a simple "don't overwrite."** The current code processes `testCmd` through `makeTestCommandNonInteractive` THEN overwrites with the scoped variant. The flip requires capturing the non-interactive root value BEFORE the monorepo block touches it, then computing the scoped value as a SEPARATE variable inside the monorepo block. Don't try to reorder — split into two variables from the start.
- **Lint stays scoped.** Only `build` and `test` get flipped. The monorepo block still writes the scoped lint value directly to `lintCmd`. Don't accidentally flip lint.
- **"Only when different" comparison.** Compare the computed `buildPackageCmd` against `buildCmd` — if equal, don't write `buildPackage`. For test: compare `testPackageCmd` against `testCmd`. The comparison prevents noise in projects where root and scoped happen to be the same command.
- **Blank-string sanitization must cover new fields.** The list in `preserveUserState` currently sanitizes `['test', 'build', 'lint']`. Add `'buildPackage'` and `'testPackage'` — users who `ana config set commands.buildPackage ""` should get fallback to fresh detection.
- **Template line numbers may drift.** Find the content by searching for the surrounding text patterns (e.g., "Run the build command first", "Verification Commands", "Step 2: Run Build"), not by line number.
- **Six template files must be consistent.** Three product templates + three dogfood copies. Make all product template changes first, then copy to dogfood. Verify byte-identical with `diff`.
- **Config.ts COMMAND_FIELDS uses dot notation.** Entries are `'commands.buildPackage'` and `'commands.testPackage'` (with the `commands.` prefix).
- **Test A012 restructuring.** This test uses `createEmptyEngineResult()` with manual setup (not `makeMonorepoResult`). After the flip, assert `test` is the root non-interactive value and `testPackage` is the scoped `(cd apps/web && pnpm vitest run)`.
- **DO NOT modify `worktree.ts`.** Already reads `commands.build` directly. Zero changes needed.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Prefer early returns over nested conditionals.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Always use `--run` with pnpm vitest to avoid watch mode hang.
- Use `Ana <build@anatomia.dev>` in git commit co-author trailers.

### Pattern Extracts

**Existing monorepo scoping block (state.ts:415–450) — the structural analog for the flip:**
```typescript
  // Scope build and lint commands to primary package in monorepos.
  // Unlike test scoping (which maps framework → direct runner), build/lint
  // reads the primary package's package.json to find the actual script key.
  let buildCmd = result.commands.build || null;
  let lintCmd = result.commands.lint || null;

  if (cwd && result.monorepo.isMonorepo && result.monorepo.primaryPackage) {
    const pkg = result.monorepo.primaryPackage;
    const pm = result.commands.packageManager || 'pnpm';
    const prefix = pm === 'npm' ? 'npm run' : `${pm} run`;

    try {
      const pkgJsonPath = path.join(cwd, pkg.path, 'package.json');
      const pkgContent = await fs.readFile(pkgJsonPath, 'utf-8');
      const pkgJson = JSON.parse(pkgContent);
      const scripts = pkgJson.scripts || {};

      // Build: first match — same key order as detectCommands
      for (const key of ['build', 'compile', 'tsc']) {
        if (scripts[key]) {
          buildCmd = `(cd ${pkg.path} && ${prefix} ${key})`;
          break;
        }
      }

      // Lint: first match — same key order as detectCommands
      for (const key of ['lint', 'eslint', 'biome']) {
        if (scripts[key]) {
          lintCmd = `(cd ${pkg.path} && ${prefix} ${key})`;
          break;
        }
      }
    } catch {
      // Missing or malformed package.json — keep root commands
    }
  }
```

**Existing blank-string sanitization (state.ts:553–563) — the propagation loop analog:**
```typescript
    // Sanitize blank commands — fall through to fresh detection value.
    // null is intentional absence (acceptable). "" is accidental blank (never valid).
    const mergedCommands = merged.commands as Record<string, unknown> | undefined;
    if (mergedCommands) {
      const freshCommands = (newAnaConfig['commands'] ?? {}) as Record<string, unknown>;
      for (const key of ['test', 'build', 'lint']) {
        if (mergedCommands[key] === '') {
          mergedCommands[key] = freshCommands[key] ?? null;
        }
      }
    }
```

**Existing COMMAND_FIELDS (config.ts:328):**
```typescript
        const COMMAND_FIELDS = ['commands.test', 'commands.build', 'commands.lint', 'commands.dev'];
```

### Proof Context

- `(monorepo-build-scoping-C5)` pkg.path injected without sanitization — known risk, carries over to new field names. Not introducing new unsanitized paths.
- `(monorepo-build-scoping-C2)` Build/lint scoping silently degrades when cwd is omitted — same risk persists after flip. Not in scope to fix.

### Checkpoint Commands

- After state.ts changes: `(cd packages/cli && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts)` — Expected: 16 tests pass (12 rewritten + 4 new)
- After config.ts changes: `(cd packages/cli && pnpm vitest run tests/commands/config.test.ts)` — Expected: existing tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 2462+ tests pass (2458 baseline + 4 new)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2458 passed, 2 skipped (2460 total)
- Current test files: 107
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 2462+ tests in 107 files (4 new tests in existing file)
- Regression focus: `tests/commands/init/monorepoCommandScoping.test.ts` (all 12 tests rewritten)
