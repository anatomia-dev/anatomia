# Spec: Fix per-surface test command priority

**Created by:** AnaPlan
**Date:** 2026-05-20
**Scope:** .ana/plans/active/fix-surface-test-priority/scope.md

## Approach

Invert the conditional at state.ts lines 517-523 so script passthrough is checked first, with direct runner invocation as fallback. The build command block (lines 510-515) already uses this pattern — the test block should mirror it exactly.

Current (broken):
```
directCmd first → script passthrough unreachable when framework detected
```

After:
```
scripts['test'] first → direct invocation only when no test script exists
```

Do not append `--run` to per-surface script passthrough. The pipeline runs non-TTY; Vitest and Jest auto-detect and disable watch. Complex scripts with `&&` chains would break if `--run` were appended.

The `buildDirectTestCommand` function is unchanged — it's still needed for the fallback path.

## Output Mockups

Before fix — surface with `test: "prisma:generate && vitest"`:
```
"test": "(cd 'packages/api' && pnpm vitest run)"   ← skips prisma:generate
```

After fix — same surface:
```
"test": "(cd 'packages/api' && pnpm run test)"      ← runs developer's full script
```

Surface with no test script but Vitest detected (fallback, unchanged):
```
"test": "(cd 'packages/api' && pnpm vitest run)"
```

## File Changes

### `packages/cli/src/commands/init/state.ts` (modify)
**What changes:** Reorder the test command conditional at lines 517-523. Check `scripts['test']` first (script passthrough), then fall back to `buildDirectTestCommand` when no test script exists. Update the comment from "prefer direct runner invocation" to match the new priority.
**Pattern to follow:** The build command block at lines 510-515 — same structure: iterate script keys, use `prefix` for passthrough.
**Why:** Without this, `buildDirectTestCommand` always wins for any recognized framework, making script passthrough dead code. 41% of real-world surfaces produce mismatched commands; 8 would cause test failures.

### `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` (modify)
**What changes:** Update the A002 assertion at line 122-123 to expect script passthrough instead of direct invocation. Add four new test cases.
**Pattern to follow:** Existing tests in this file — `setupPackage` + `makeMonorepoResult` + temp dirs with `finally` cleanup.
**Why:** The existing A002 assertion validates the old (broken) behavior. New tests cover the edge cases in the scope.

## Acceptance Criteria

- [ ] AC1: Surface with a `test` script gets `(cd 'path' && {pm} run test)` regardless of detected testing framework.
- [ ] AC2: Surface with no `test` script but a detected testing framework gets `(cd 'path' && {runner} {framework} {flags})` (direct invocation fallback).
- [ ] AC3: Surface with neither test script nor detected framework gets `null` test command.
- [ ] AC4: Root command generation (`commands.test`) is unchanged.
- [ ] AC5: Existing tests pass. New tests cover: complex script passthrough, fallback to direct invocation, bun package manager, empty-string test script.
- [ ] No build errors
- [ ] 2713+ tests pass (baseline: 2713 passed, 2 skipped)

## Testing Strategy

- **Unit tests:** Four new tests in `monorepoCommandScoping.test.ts` using existing `setupPackage` and `makeMonorepoResult` helpers:
  1. Complex script passthrough — surface with `test: "prisma:generate && vitest"`, Vitest detected. Assert command is `(cd '...' && pnpm run test)`.
  2. Fallback to direct invocation — surface with no test script, `testing: ['Vitest']`. Assert command is `(cd '...' && pnpm vitest run)`.
  3. Bun package manager — surface with `test: "bun test --exit"`, pm `bun`. Assert command is `(cd '...' && bun run test)`.
  4. Empty-string test script — surface with `test: ""`, Vitest detected. Assert command is `(cd '...' && pnpm run test)` (truthy empty string takes the script passthrough path).
- **Existing test update:** A002 assertion changes from `toContain('vitest run')` to `toBe("(cd 'packages/cli' && pnpm run test)")`.
- **Regression:** A026 (no test script, `testing: []`) continues to pass unchanged — returns `null`.

## Dependencies

None. Self-contained change.

## Constraints

- Root command generation (`commands.test`, lines 460-475) must not be touched — separate code path.
- `buildDirectTestCommand` must not be removed or modified — still needed for the fallback path.
- `preserveUserState` + `mergeSurfaces` protect existing installations — this change only affects fresh init and new surfaces.

## Gotchas

- The A001-A004 test at line 91 sets `scripts.test = 'vitest'` for the cli surface. After the fix, the assertion at line 122-123 must change from `toContain('vitest run')` to `toBe("(cd 'packages/cli' && pnpm run test)")`. If the builder updates the production code but not this assertion, the test fails.
- The A026 test (line 323-340) creates a surface with `testing: []` and no test script. This already expects `null` and continues to pass unchanged — `buildDirectTestCommand([], pm)` returns null. Don't touch this test.
- Empty string is truthy in JS. `scripts['test']` with `test: ""` passes the check. This is acceptable per scope — the developer's intentionally empty script is respected.
- The `web` surface in the A001-A004 test has `testing: []` and no test script in its `setupPackage` call. Its assertion at line 130 (`expect(webCmds['test']).toBeNull()`) is already correct and unchanged.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Temp directory pattern with `fs.mkdtemp` and cleanup in `finally` block.
- Early returns over nested conditionals.

### Pattern Extracts

Build command block (the structural analog — state.ts lines 509-515):
```typescript
        // Build: first match
        for (const key of ['build', 'compile', 'tsc']) {
          if (scripts[key]) {
            surfaceBuild = `(cd '${surface.path}' && ${prefix} ${key})`;
            break;
          }
        }
```

Test helper pattern (monorepoCommandScoping.test.ts lines 323-340):
```typescript
  // @ana A026
  it('generates null test command for surface without test script', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-json-'));
    const cwdDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-cwd-'));
    try {
      await setupPackage(cwdDir, 'apps/web', { build: 'next build' });
      const result = makeMonorepoResult({
        surfaces: [{ name: 'web', path: 'apps/web', framework: 'Next.js', testing: [] }],
      });

      await createAnaJson(tmpDir, result, cwdDir);
      const surfaces = (await readAnaJson(tmpDir))['surfaces'] as Record<string, Record<string, unknown>>;
      const webCmds = surfaces['web']!['commands'] as Record<string, string | null>;
      expect(webCmds['test']).toBeNull();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      await fs.rm(cwdDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });
```

### Proof Context

**state.ts** — 4 pipeline cycles. Path injection risk (monorepo-build-scoping-C5, flip-monorepo-commands-C4) is pre-existing and out of scope. No findings directly related to this fix.

**monorepoCommandScoping.test.ts** — 2 pipeline cycles. Repeated setup/teardown boilerplate noted (monorepo-build-scoping-C4) — follow the same pattern for consistency, don't try to refactor it in this scope.

### Checkpoint Commands

- After state.ts change: `(cd 'packages/cli' && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts)` — Expected: existing A002 assertion fails (confirms the production change works, test needs updating)
- After test updates: `(cd 'packages/cli' && pnpm vitest run tests/commands/init/monorepoCommandScoping.test.ts)` — Expected: all tests pass including 4 new ones
- After all changes: `pnpm run test -- --run` — Expected: 2717+ tests pass (2713 baseline + 4 new)
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2713 passed, 2 skipped (2715 total)
- Current test files: 120 passed
- Command used: `cd packages/cli && pnpm vitest run`
- After build: expected 2717+ tests in 120 files
- Regression focus: `monorepoCommandScoping.test.ts` (assertion update), no other test files should be affected
