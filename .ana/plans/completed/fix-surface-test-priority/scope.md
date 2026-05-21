# Scope: Fix per-surface test command priority

**Created by:** Ana
**Date:** 2026-05-20

## Intent

Per-surface test commands in `createAnaJson` use direct runner invocation (`pnpm vitest run`) instead of the developer's actual test script (`pnpm run test`). This skips setup steps like `prisma:generate`, `dotenv`, `cross-env`, and build prerequisites. R3 pre-launch testing found 12 of 29 surfaces (41%) across 17 real repos produce mismatched commands; 8 would cause test failures on the first pipeline run. The fix: invert the priority so script passthrough comes first, with direct invocation as fallback for surfaces that lack a test script.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — one conditional reorder, one test assertion update, four new test cases
- **Surface:** cli
- **Files affected:** `packages/cli/src/commands/init/state.ts`, `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts`
- **Blast radius:** Every monorepo customer's per-surface test commands change on fresh init. Existing installations are protected by `preserveUserState`/`mergeSurfaces` (user-owned commands survive re-init). Root command generation is a separate code path and is not affected.
- **Estimated effort:** under 1 hour
- **Multi-phase:** no

## Approach

Invert the priority at `state.ts` lines 517-523. Currently: direct runner invocation first, script passthrough as unreachable fallback. After: script passthrough first (preserves developer setup steps), direct runner invocation only when no test script exists but a testing framework is detected.

Do not append `--run` to per-surface script passthrough. The pipeline runs in a non-TTY subprocess; Vitest and Jest auto-detect non-interactive mode and disable watch. Complex scripts with `&&` chains would break if `--run` were appended to the end.

## Acceptance Criteria
- AC1: Surface with a `test` script gets `(cd 'path' && {pm} run test)` regardless of detected testing framework.
- AC2: Surface with no `test` script but a detected testing framework gets `(cd 'path' && {runner} {framework} {flags})` (direct invocation fallback).
- AC3: Surface with neither test script nor detected framework gets `null` test command.
- AC4: Root command generation (`commands.test`) is unchanged.
- AC5: Existing tests pass. New tests cover: complex script passthrough, fallback to direct invocation, bun package manager, empty-string test script.

## Edge Cases & Risks

1. **Surface with `test: "vitest"` (bare, no `run`).** Script passthrough produces `pnpm run test` which runs bare `vitest`. In the pipeline (non-TTY), vitest auto-detects and disables watch. In a manual terminal, vitest enters watch mode. Acceptable — the command is for pipeline use, and the developer chose bare `vitest`.

2. **Surface with `test: "vitest run"` (explicit).** Script passthrough produces `pnpm run test` which runs `vitest run`. Functionally equivalent to current direct invocation. No behavior change.

3. **Surface with no test script but Vitest detected.** Falls back to direct invocation: `pnpm vitest run`. Same as current behavior.

4. **Surface with test script using a different runner than detected.** E.g., testing array says Vitest but script uses `bun test`. Script passthrough runs the actual script (correct). Direct invocation would have used `bun vitest run` (wrong). This is the Midday/api case.

5. **Bun workspaces.** `prefix` at line 483 is `bun run` for bun. Script passthrough produces `bun run test`. Correct.

6. **Surface with `test: ""` (empty string).** Empty string is truthy in the `scripts['test']` check, so script passthrough fires: `pnpm run test` runs an empty script, which exits 0 silently. The pipeline would PASS with no tests actually run. This is a known silent-pass path — still better than current behavior where direct invocation overrides the developer's intentionally empty script with a real runner. This is not something to add detection for in this scope; note it for awareness only.

## Rejected Approaches

**Smart script parsing.** Parse the test script to extract the runner and append appropriate flags. Rejected: fragile (regex over arbitrary shell), solves a problem that doesn't exist. The developer's script IS the authority.

**Append `--run` to per-surface script passthrough.** `pnpm run test -- --run` on a script like `prisma:generate && vitest ...` appends `--run` to the end of the chain where it doesn't reach vitest. Also unnecessary because the pipeline is non-TTY. Rejected.

## Open Questions

None. All questions from the requirements document were resolved during investigation.

## Exploration Findings

### Patterns Discovered
- `state.ts` lines 509-515: build commands already use script passthrough (`pnpm run build`). Correct pattern to follow.
- `state.ts` lines 526-531: lint commands already use script passthrough (`pnpm run lint`). Correct. Only test has the inverted priority.
- `monorepoCommandScoping.test.ts`: comprehensive test suite with `setupPackage` helper and `makeMonorepoResult` factory. New tests should use the same patterns.

### Constraints Discovered
- [TYPE-VERIFIED] `buildDirectTestCommand` always returns non-null for Vitest/Jest/Mocha (`state.ts:249-269`) — the script passthrough branch is effectively dead code for any recognized framework.
- [OBSERVED] `preserveUserState` + `mergeSurfaces` protect existing installations — user-owned commands survive re-init. Fresh init and new surfaces get new behavior.
- [OBSERVED] Empty array `[]` is truthy in JS — `surface.testing || result.stack.testing` uses the surface value when `surface.testing` is `[]`, falling back only when `undefined`/`null`.

### Test Infrastructure
- `monorepoCommandScoping.test.ts`: `setupPackage(rootDir, pkgPath, scripts)` creates fake package.json. `makeMonorepoResult(overrides)` builds engine results with configurable surfaces, pm, testing frameworks.

## For AnaPlan

### Structural Analog
`state.ts` lines 509-515 (build command generation). Same pattern: check `scripts[key]` first, use script passthrough. The test command block should mirror this structure.

### Relevant Code Paths
- `state.ts:517-523` — the bug. Direct invocation first, script passthrough unreachable.
- `state.ts:249-269` — `buildDirectTestCommand`. Still needed for fallback. Do not remove.
- `state.ts:460-475` — root command generation. Separate code path. Do not touch.
- `state.ts:483` — `prefix` variable: `pm === 'npm' ? 'npm run' : '${pm} run'`. Used by script passthrough.
- `monorepoCommandScoping.test.ts:91-136` — A001-A004 test. Line 122-123 assertion needs updating.

### Patterns to Follow
- `monorepoCommandScoping.test.ts` — use `setupPackage` and `makeMonorepoResult` for new test cases. Each test creates temp dirs and cleans up in `finally`.
- Existing test at line 323-340 (A026: null test for surface without test script) is the structural model for fallback and edge case tests.

### Known Gotchas
- The A001-A004 test at line 95 sets `scripts.test = 'vitest'` for the cli surface. After the fix, the assertion at line 122-123 must change from `toContain('vitest run')` to `toBe("(cd 'packages/cli' && pnpm run test)")`.
- The A026 test (line 323-340) creates a surface with `testing: []` and no test script. This already expects `null` and will continue to pass unchanged — the fallback `buildDirectTestCommand([], pm)` returns null.

### Things to Investigate
- Nothing. All design questions resolved during scoping.
