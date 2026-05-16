# Build Report: Monorepo build command scoping

**Created by:** AnaBuild
**Date:** 2026-05-15
**Spec:** .ana/plans/active/monorepo-build-scoping/spec.md
**Branch:** feature/monorepo-build-scoping

## What Was Built

- `packages/cli/src/commands/init/state.ts` (modified): Added optional `cwd` parameter to `createAnaJson`. After the existing test scoping block, added build/lint scoping that reads the primary package's `package.json` to find script keys (`build`/`compile`/`tsc` for build, `lint`/`eslint`/`biome` for lint). When found, wraps in `(cd {pkg.path} && {prefix} {key})`. Silent fallback to root command on missing/malformed package.json. Dev command is never scoped.
- `packages/cli/src/commands/init/index.ts` (modified): Passed `cwd` to `createAnaJson` at the single call site (line 108). The variable was already available from `process.cwd()` at line 76.
- `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` (created): 12 tests covering all contract assertions. Each test creates temp directories, writes a fake primary package.json with specific scripts, and asserts on the resulting ana.json commands.

## PR Summary

- Scope `build` and `lint` commands to the monorepo primary package in `ana init`, so agents run `(cd packages/cli && pnpm run build)` instead of `pnpm run build` (which invokes turbo across all packages)
- Read the primary package's `package.json` for script key lookup, matching `detectCommands` key order exactly (build/compile/tsc, lint/eslint/biome)
- Silent fallback to root commands when primary package.json is missing or malformed — init never crashes
- Added `cwd` parameter to `createAnaJson` (optional, backward-compatible) and passed it from the single call site in `index.ts`
- 12 new tests covering all scenarios: scoping, fallback, single-repo, dev passthrough, alternate keys, error handling, npm prefix

## Acceptance Criteria Coverage

- AC1 "scoped build command" -> monorepoCommandScoping.test.ts "scopes build command for monorepo with primary package build script" (1 assertion) ✅
- AC2 "scoped lint command" -> monorepoCommandScoping.test.ts "scopes lint command for monorepo with primary package lint script" (1 assertion) ✅
- AC3 "no build script keeps root" -> monorepoCommandScoping.test.ts "keeps root build command when primary package has no build script" (1 assertion) ✅
- AC4 "no lint script keeps root" -> monorepoCommandScoping.test.ts "keeps root lint command when primary package has no lint script" (1 assertion) ✅
- AC5 "single-repo unchanged" -> monorepoCommandScoping.test.ts "does not scope single-repo projects" (2 assertions) ✅
- AC6 "dev never scoped" -> monrepoCommandScoping.test.ts "does not scope dev command in monorepo" (1 assertion) ✅
- AC7 "alternate keys" -> monorepoCommandScoping.test.ts "scopes build command using compile key" + "scopes lint command using biome key" (2 assertions) ✅
- AC8 "tests cover all scenarios" -> 12 tests covering AC1-AC7 plus missing package.json, malformed package.json, npm prefix, and test regression ✅

## Implementation Decisions

- Made `cwd` optional (`cwd?: string`) rather than required to maintain backward compatibility with existing callers and tests that don't pass it. When `cwd` is undefined, the monorepo scoping block is skipped (guarded by `if (cwd && result.monorepo.isMonorepo ...)`).
- Used a single `try/catch` around the entire package.json read + script lookup rather than separate guards. Any error (ENOENT, JSON parse, missing scripts key) falls back silently to root commands.
- `dev` is intentionally excluded from the scoping block per spec — only build and lint are scoped.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run --run)
Test Files  104 passed (104)
     Tests  2336 passed | 2 skipped (2338)
  Duration  42.98s
```

### After Changes
```
(cd packages/cli && pnpm vitest run --run)
Test Files  105 passed (105)
     Tests  2348 passed | 2 skipped (2350)
  Duration  43.00s
```

### Comparison
- Tests added: 12
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts`: 12 tests covering build/lint scoping for monorepo primary packages, fallback behavior, single-repo passthrough, dev passthrough, alternate script keys (compile, biome), missing/malformed package.json, npm prefix, and existing test scoping regression check.

## Verification Commands
```bash
(cd packages/cli && pnpm run build)
(cd packages/cli && pnpm vitest run --run)
pnpm run lint
```

## Git History
```
453ffdef [monorepo-build-scoping] Add tests for monorepo build/lint command scoping
65ba9fa6 [monorepo-build-scoping] Scope build and lint commands for monorepo primary package
```

## Open Issues

Contract coverage: 12/12 assertions tagged.

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` (unused eslint-disable directive) — not introduced by this build.

Verified complete by second pass.
