# Verify Report: Monorepo build command scoping

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-15
**Spec:** .ana/plans/active/monorepo-build-scoping/spec.md
**Branch:** feature/monorepo-build-scoping

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/monorepo-build-scoping/contract.yaml
  Seal: INTACT (hash sha256:9fd6f9b5807a9e401cbba956dda46ba7512e66843fa3bb71d8df0bd59f501f8c)
```

Seal status: **INTACT**

Tests: 2348 passed, 0 failed, 2 skipped (105 test files). Build: ESM success. Lint: 0 errors (1 pre-existing warning — unused eslint-disable directive).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Monorepo build command targets only the primary package | ✅ SATISFIED | `monorepoCommandScoping.test.ts:84-98`, asserts `cmds['build']` equals `(cd packages/cli && pnpm run build)` — test creates package.json with `build` script, calls `createAnaJson` with `cwdDir`, checks output |
| A002 | Monorepo lint command targets only the primary package | ✅ SATISFIED | `monorepoCommandScoping.test.ts:101-115`, asserts `cmds['lint']` equals `(cd packages/cli && pnpm run lint)` — same setup, checks lint command |
| A003 | Build command falls back to root when primary package has no build script | ✅ SATISFIED | `monorepoCommandScoping.test.ts:118-132`, package.json has only `lint` script, asserts `cmds['build']` equals `pnpm run build` |
| A004 | Lint command falls back to root when primary package has no lint script | ✅ SATISFIED | `monorepoCommandScoping.test.ts:135-149`, package.json has only `build` script, asserts `cmds['lint']` equals `pnpm run lint` |
| A005 | Single-package repos are unaffected by monorepo scoping | ✅ SATISFIED | `monorepoCommandScoping.test.ts:152-172`, uses `createEmptyEngineResult()` (no monorepo), asserts build and lint unchanged |
| A006 | Dev command is never scoped regardless of monorepo status | ✅ SATISFIED | `monorepoCommandScoping.test.ts:175-189`, package.json includes `dev: 'vite'`, asserts `cmds['dev']` equals `pnpm run dev` |
| A007 | Build scoping recognizes alternate script names like compile and tsc | ✅ SATISFIED | `monorepoCommandScoping.test.ts:192-206`, package.json has `compile: 'tsc -b'` (no `build` key), asserts `cmds['build']` contains `compile` |
| A008 | Lint scoping recognizes alternate script names like eslint and biome | ✅ SATISFIED | `monorepoCommandScoping.test.ts:209-223`, package.json has `biome: 'biome check'` (no `lint` key), asserts `cmds['lint']` contains `biome` |
| A009 | Missing primary package.json does not crash init | ✅ SATISFIED | `monorepoCommandScoping.test.ts:226-241`, no package.json created, asserts fallback to `pnpm run build` and `pnpm run lint` |
| A010 | Malformed primary package.json does not crash init | ✅ SATISFIED | `monorepoCommandScoping.test.ts:244-261`, writes `{ not valid json!!!`, asserts fallback to root commands |
| A011 | Scoped build command uses the correct package manager prefix | ✅ SATISFIED | `monorepoCommandScoping.test.ts:264-278`, uses `pm: 'npm'`, asserts `cmds['build']` contains `npm run build` |
| A012 | Existing test command scoping still works after the signature change | ✅ SATISFIED | `monorepoCommandScoping.test.ts:281-305`, monorepo with Vitest, asserts `cmds['test']` equals `(cd apps/web && pnpm vitest run)` — plus 23 existing tests in `makeTestCommand.test.ts` still pass with the new optional `cwd` parameter |

## Independent Findings

**Prediction resolution:**
1. **cwd parameter backward-compatibility** — Not a bug. `cwd?: string` is optional, and `if (cwd && ...)` correctly skips scoping when omitted. Existing 5 callers in `makeTestCommand.test.ts` pass 2 args — confirmed they all still pass. The signature change is clean.
2. **Package.json edge cases** — Not found. The try/catch handles missing directories (ENOENT) and malformed JSON correctly. Both paths tested.
3. **EngineResult reconstruction** — Not found. Builder created `makeMonorepoResult()` helper that uses `createEmptyEngineResult()` and sets fields properly. Follows testing standards.
4. **Alternate key undertested** — Confirmed minor: `compile` and `biome` are tested but `tsc` and `eslint` variants are not individually tested. The loop logic is identical so this is low risk, but noted.
5. **Dev command test quality** — Prediction wrong. The A006 test explicitly adds `dev: 'vite'` to the package.json scripts, which is the stronger test (verifying dev stays unscoped even when a dev script exists, not just by absence).

**Surprise:** The implementation is notably clean. No over-building, no scope creep, no YAGNI violations. No new exports beyond the existing `createAnaJson`. No utility functions, no abstractions. The builder followed the spec precisely.

## AC Walkthrough

- **AC1** ✅ PASS — A001 test verifies scoped build command format. Test passes.
- **AC2** ✅ PASS — A002 test verifies scoped lint command format. Test passes.
- **AC3** ✅ PASS — A003 test verifies fallback when no build script. Test passes.
- **AC4** ✅ PASS — A004 test verifies fallback when no lint script. Test passes.
- **AC5** ✅ PASS — A005 test verifies single-repo is unaffected. Test passes.
- **AC6** ✅ PASS — A006 test verifies dev never scoped (even with dev script present). Test passes.
- **AC7** ✅ PASS — A007 tests `compile` key, A008 tests `biome` key. Key lookup order matches `detectCommands` (`['build', 'compile', 'tsc']` and `['lint', 'eslint', 'biome']` at state.ts:432,440).
- **AC8** ✅ PASS — 12 test cases covering all ACs plus edge cases (missing package.json, malformed JSON, npm prefix, test regression).
- **Tests pass** ✅ PASS — 2348 passed, 0 failed, 2 skipped (105 files).
- **No build errors** ✅ PASS — ESM build success.

## Blockers

No blockers. All 12 contract assertions SATISFIED. All 10 ACs pass. No regressions — existing 23 monorepo test-scoping tests in `makeTestCommand.test.ts` pass unchanged. No unused exports in new code (no new exports added). No unused parameters (`cwd` is used in the guard condition). No unhandled error paths (empty catch is intentional per spec — "silent fallback to root command on any error"). No assumptions about external state beyond `cwd` being a valid directory (guarded by try/catch).

## Findings

- **Test — No individual test for `tsc` and `eslint` key variants:** `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` — A007 tests `compile`, A008 tests `biome`, but `tsc` (third build key) and `eslint` (second lint key) have no dedicated tests. The for-loop logic is identical so risk is low, but 100% key coverage would require two more tests. Accepted — the loop structure makes individual key failure unlikely.

- **Code — Silent degradation when cwd is omitted:** `packages/cli/src/commands/init/state.ts:420` — When `cwd` is `undefined`, the guard `if (cwd && ...)` silently skips all build/lint scoping. In production, `cwd` is always passed from `index.ts:108`. But if a future caller omits `cwd`, scoping silently doesn't happen — there's no log or warning. This matches the spec's intent (backward-compatible optional parameter), but a future engineer might be confused. Worth monitoring.

- **Code — Empty catch swallows all errors:** `packages/cli/src/commands/init/state.ts:446` — The catch block handles the expected cases (ENOENT, SyntaxError) but also swallows unexpected errors like EACCES (permission denied) or ENOMEM. This follows the project's engine-style graceful degradation pattern and is explicitly called for in the spec ("silent fallback to root command on any error"), so it's intentional. However, it means permission issues in the primary package directory are invisible during init.

- **Test — Repeated setup/teardown boilerplate:** `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts` — Each of the 12 tests repeats the same `mkdtemp`/`rm` pattern in try/finally blocks (~6 lines each). A `beforeEach`/`afterEach` would reduce ~72 lines to ~10. This follows the existing pattern in `makeTestCommand.test.ts` though, so it's consistent with the codebase. Accepted as style-consistent debt.

- **Code — pkg.path injected into shell command unsanitized:** `packages/cli/src/commands/init/state.ts:434` — `pkg.path` is interpolated directly into `(cd ${pkg.path} && ...)`. A path containing spaces or shell metacharacters would produce a broken command. In practice, monorepo package paths are always simple relative paths like `packages/cli` or `apps/web`. This is the same pattern used in the existing test scoping (line 407), so the risk is pre-existing and symmetric. Worth monitoring if Anatomia ever encounters a monorepo with unusual paths.

## Deployer Handoff

Straightforward change. Adds optional `cwd` parameter to `createAnaJson` for monorepo build/lint scoping. The only call site (`index.ts:108`) already has `cwd` available and now passes it.

After merge: run `ana init` on a monorepo project to confirm the scoped commands appear in `ana.json`. The existing `ana.json` in this repository already has the correct scoped commands (set during a previous manual init), so re-running init should produce identical output.

No migration needed — existing `ana.json` files are unaffected. The scoping only applies during fresh `ana init`.

## Verdict

**Shippable:** YES

All 12 contract assertions satisfied. All acceptance criteria pass. Tests green (2348 passed, +12 new). Build clean. Lint clean. Implementation is minimal, focused, and follows existing patterns precisely. No over-building, no scope creep. The five findings are all observations or accepted debt — none rise to blocker level.
