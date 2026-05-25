# Spec: Fix Risk Findings

**Created by:** AnaPlan
**Date:** 2026-05-25
**Scope:** .ana/plans/active/fix-risk-findings/scope.md

## Approach

Three independent fixes that close 3 of 6 risk-severity proof findings. Each has zero blast radius — no behavior change for existing inputs.

**Fix 1: Escape single quotes in surface path commands (state.ts)**

In `createAnaJson`, surface paths are interpolated into single-quoted shell subcommands at 4 template literal sites (lines 513, 520, 524, 531). A path containing a single quote breaks the shell syntax.

Extract a local `escapedPath` variable using `surface.path.replace(/'/g, "'\\''")` before the template literal block. Use `escapedPath` in all 4 interpolation sites. The `'\''` pattern is the standard POSIX idiom: end single-quoted string, insert escaped literal quote, reopen single-quoted string.

The escape variable goes inside the `try` block after `const scripts = pkgJson.scripts || {};` (around line 508), before the first template literal usage. This keeps it scoped to where it's needed and ensures `surface.path` is only read once for escaping.

**Fix 2: Explicit null check in backfill guard (work.ts)**

Line 1101: `!existing.surface` is truthy for both `undefined` and `''`. Replace with `existing.surface === undefined || existing.surface === null` to match the codebase's strict equality convention. This makes the guard say what it means — "no surface assigned" rather than "any falsy surface value."

**Fix 3: Type-narrow DocsStat value prop (docsStatValues.ts + DocsStat.tsx)**

Export a `DocsStatKey` union type from `docsStatValues.ts` with the 9 valid keys. Change `DocsStat` component's `value` prop from `string` to `DocsStatKey`. Keep the `?? value` runtime fallback as defense-in-depth for MDX (which is not type-checked by fumadocs). The `buildDocsStatValues` return type stays `Record<string, string>` — the type narrowing lives at the component boundary only.

## Output Mockups

No user-facing output changes. All three fixes are internal correctness improvements.

**Fix 1 — escaped command string example:**

For a surface with path `it's-broken`:
```
(cd 'it'\''s-broken' && pnpm run build)
```

For a surface with path `packages/cli` (no quotes — unchanged):
```
(cd 'packages/cli' && pnpm run build)
```

## File Changes

### packages/cli/src/commands/init/state.ts (modify)
**What changes:** Add `escapedPath` variable after `scripts` extraction. Replace `surface.path` with `escapedPath` in 4 template literals.
**Pattern to follow:** Standard POSIX shell quote escape — `str.replace(/'/g, "'\\''")`.
**Why:** Proof findings monorepo-build-scoping-C5 and flip-monorepo-commands-C4 flag path injection risk. A surface path with a single quote produces broken shell syntax in ana.json commands.

### packages/cli/src/commands/work.ts (modify)
**What changes:** Replace `!existing.surface` with `existing.surface === undefined || existing.surface === null` at the backfill guard.
**Pattern to follow:** Strict equality convention used throughout the codebase — no `== null`.
**Why:** Proof finding fix-test-behavioral-coverage-C1 flags that `!''` is truthy, so an empty-string surface would be overwritten during backfill.

### website/lib/docs-data/docsStatValues.ts (modify)
**What changes:** Add exported `DocsStatKey` type union of the 9 valid keys.
**Pattern to follow:** Union type at the consumption boundary, not at the producer. `buildDocsStatValues` return type stays `Record<string, string>`.
**Why:** Misspelled keys in TypeScript call sites silently render the raw key as visible text. The type catches this at build time.

### website/components/docs/content/DocsStat.tsx (modify)
**What changes:** Import `DocsStatKey` from docsStatValues, narrow `value` prop from `string` to `DocsStatKey`.
**Pattern to follow:** Import type with `import type` separate from value imports.
**Why:** Component prop is the enforcement boundary. MDX remains unchecked at build time (fumadocs uses `@ts-nocheck`), but TypeScript call sites get compile-time validation.

### packages/cli/tests/commands/init/monorepoCommandScoping.test.ts (modify)
**What changes:** Add one test case verifying that a surface path with a single quote produces correctly escaped command strings.
**Pattern to follow:** Existing test structure in this file — `setupPackage` helper, `createAnaJson`, `readAnaJson`, temp directory with cleanup.
**Why:** AC2 requires a test verifying the escape. The test proves the POSIX idiom works end-to-end through `createAnaJson`.

## Acceptance Criteria

- [ ] AC1: Surface command strings in state.ts escape single quotes in paths using the `'\''` shell idiom.
- [ ] AC2: A test verifies that a surface path containing a single quote produces a correctly escaped command string.
- [ ] AC3: The backfill guard at work.ts uses `existing.surface === undefined || existing.surface === null` instead of `!existing.surface`.
- [ ] AC4: `DocsStatKey` type is exported from `docsStatValues.ts` as a union of the 9 valid keys.
- [ ] AC5: `DocsStat` component prop `value` accepts `DocsStatKey` instead of `string`. The `?? value` runtime fallback is kept.
- [ ] AC6: Website builds successfully (`cd website && pnpm run build`).
- [ ] AC7: All existing tests pass unchanged: `pnpm run test -- --run`.

## Testing Strategy

- **Unit test (new):** One test in `monorepoCommandScoping.test.ts` — create a surface with a path containing a single quote (e.g., `it's-here`), run `createAnaJson`, assert the command string contains the escaped path `it'\\''s-here` inside the `(cd '...' && ...)` wrapper.
- **Existing tests (regression):** All 2919 tests pass unchanged. The path escape is a no-op on paths without single quotes — existing assertions remain exact string matches.
- **Build verification:** `cd website && pnpm run build` confirms the type narrowing doesn't break MDX compilation.

## Dependencies

None. All three fixes are independent of each other and of any in-flight work.

## Constraints

- `buildDocsStatValues` return type must stay `Record<string, string>`. Changing to `Record<DocsStatKey, string>` would cascade into `resolveDocsStatTags` and the prebuild script.
- The backfill guard fix must use strict equality (`===`), not loose equality (`==`). The codebase has zero uses of `== null`.
- The escape pattern must use `'\''` (POSIX idiom), not double quotes or other shell escaping approaches.

## Gotchas

- The TypeScript string `"'\\'''"` looks confusing. In the source: `surface.path.replace(/'/g, "'\\''")`. The regex matches a literal single quote. The replacement string is 4 characters: `'`, `\`, `'`, `'`. In the output shell command, this produces `'\''` — end quote, escaped quote, reopen quote.
- `import type` for `DocsStatKey` must be a separate import statement from the value import of `buildDocsStatValues` in DocsStat.tsx. Coding standards require separate type imports.
- The test path `it's-here` contains the escaped character. The test assertion must account for the escape in the expected string. Use a raw string comparison against the full `(cd 'it'\\''s-here' && pnpm run build)` pattern.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions for local imports.
- Use `import type` for type-only imports, separate from value imports.
- Prefer named exports. `DocsStatKey` is a named export.
- Use `| null` for checked-and-empty fields. `=== undefined || === null` for explicit null checks (strict equality, no `== null`).
- Exported functions/types require JSDoc. `DocsStatKey` needs a doc comment.
- In JSX, use `&apos;` for apostrophes in text content (not relevant here — no JSX text changes).

### Pattern Extracts

From `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` lines 29-50 — test setup pattern:
```typescript
describe('createAnaJson surface command generation', () => {
  async function readAnaJson(dir: string): Promise<Record<string, unknown>> {
    const content = await fs.readFile(path.join(dir, 'ana.json'), 'utf-8');
    return JSON.parse(content);
  }

  async function setupPackage(
    rootDir: string,
    pkgPath: string,
    scripts: Record<string, string>,
  ): Promise<void> {
    const pkgDir = path.join(rootDir, pkgPath);
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: `test-${path.basename(pkgPath)}`, scripts }, null, 2),
      'utf-8',
    );
```

From `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` lines 120-134 — assertion pattern:
```typescript
      // A001: scoped test command uses script passthrough
      expect(cliCmds['test']).toBe("(cd 'packages/cli' && pnpm run test)");

      // A003: scoped build command
      expect(cliCmds['build']).toContain("cd '");
      expect(cliCmds['build']).toBe("(cd 'packages/cli' && pnpm run build)");

      // A026: surface with no test script gets null
      expect(webCmds['test']).toBeNull();
      expect(webCmds['build']).toBe("(cd 'apps/web' && pnpm run build)");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
```

From `packages/cli/src/commands/init/state.ts` lines 505-534 — the code being modified:
```typescript
        const pkgJsonPath = path.join(cwd, surface.path, 'package.json');
        const pkgContent = await fs.readFile(pkgJsonPath, 'utf-8');
        const pkgJson = JSON.parse(pkgContent);
        const scripts = pkgJson.scripts || {};

        // Build: first match
        for (const key of ['build', 'compile', 'tsc']) {
          if (scripts[key]) {
            surfaceBuild = `(cd '${surface.path}' && ${prefix} ${key})`;
            break;
          }
        }

        // Test: prefer script passthrough, fall back to direct runner
        if (scripts['test'] !== undefined) {
          surfaceTest = `(cd '${surface.path}' && ${prefix} test)`;
        } else {
          const directCmd = buildDirectTestCommand(surface.testing || result.stack.testing, pm);
          if (directCmd) {
            surfaceTest = `(cd '${surface.path}' && ${directCmd})`;
          }
        }

        // Lint: first match
        for (const key of ['lint', 'eslint', 'biome']) {
          if (scripts[key]) {
            surfaceLint = `(cd '${surface.path}' && ${prefix} ${key})`;
            break;
          }
        }
```

### Proof Context
- **monorepo-build-scoping-C5 / flip-monorepo-commands-C4:** Path injection in shell commands — directly addressed by Fix 1.
- **fix-test-behavioral-coverage-C1:** Backfill guard treats empty string as "no surface" — directly addressed by Fix 2.
- No active proof findings for the website files.

### Checkpoint Commands
- After state.ts change: `(cd 'packages/cli' && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts)` — Expected: all tests pass including new escape test
- After work.ts change: `(cd 'packages/cli' && pnpm vitest run tests/commands/work.test.ts)` — Expected: all existing tests pass unchanged
- After website changes: `(cd 'website' && pnpm run build)` — Expected: build succeeds
- After all changes: `pnpm run test -- --run` — Expected: 2920+ tests pass (2919 existing + 1 new)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2919 passed, 2 skipped (2921 total)
- Current test files: 124
- Command used: `pnpm run test -- --run`
- After build: expected 2920 passed in 124 files (1 new test added to existing file)
- Regression focus: `monorepoCommandScoping.test.ts` (new test), `work.test.ts` (guard change)
