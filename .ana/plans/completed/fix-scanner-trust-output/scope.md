# Scope: Fix Scanner Trust Output

**Created by:** Ana
**Date:** 2026-05-16

## Intent

The scanner produces incorrect output in two narrow, high-impact ways: it flags template URL patterns as critical secrets (false positives), and it generates unrunnable `npm vitest run` commands for monorepo projects. Both erode first-user trust — the tool's own output is untrustworthy. A user who sees a false CRITICAL finding or a broken test command in their first scan has no reason to trust anything else the tool says.

## Complexity Assessment

- **Kind:** fix
- **Size:** small — two isolated functions, no architectural change
- **Files affected:**
  - `packages/cli/src/engine/findings/rules/secrets.ts` (validate function, ~1-2 lines)
  - `packages/cli/src/commands/init/state.ts` (`buildDirectTestCommand`, ~3 lines)
  - `packages/cli/tests/engine/findings/secrets.test.ts` (new template pattern tests)
  - `packages/cli/tests/commands/init/makeTestCommand.test.ts` (correct npm assertion + new cases)
- **Blast radius:** Zero overlap between the two fixes. Secret validate function is only called by the DB URL pattern. `buildDirectTestCommand` is only called in the monorepo test-command path. No shared callers, no shared types.
- **Estimated effort:** Under 1 hour including tests
- **Multi-phase:** no

## Approach

Fix both functions that produce incorrect output. The secret validator gains structural template pattern recognition — paired delimiters (`<<...>>`, `{{...}}`, `${...}`, `<UPPER_CASE>`) are categorically not passwords. The test command builder gains an npm-specific runner (`npx`) since npm doesn't forward to local bins like pnpm/yarn/bun do.

Both fixes follow "the elegant solution removes" — they remove false outputs from the system rather than adding workarounds downstream.

## Acceptance Criteria

- AC1: Template syntax patterns (`<<password>>`, `{{db_pass}}`, `${dbPassword}`, `${process.env.DB_URL}`, `<YOUR_PASSWORD>`) in the password position of a DB URL do NOT produce findings
- AC2: Real credentials still fire — `postgres://user:realPassword123@prod.example.com:5432/db` remains CRITICAL
- AC3: Passwords containing special chars still fire — `p@ss<w0rd`, `my{secret}123`, `p<ss{word` are NOT suppressed
- AC4: Tests cover at least 5 template syntax variants including mixed-case content in `${...}`
- AC5: `buildDirectTestCommand(['Vitest'], 'npm')` returns `npx vitest run`
- AC6: `buildDirectTestCommand(['Jest'], 'npm')` returns `npx jest --watchAll=false`
- AC7: `buildDirectTestCommand(['Mocha'], 'npm')` returns `npx mocha --exit`
- AC8: pnpm/yarn/bun behavior unchanged — existing tests pass unmodified (except the npm mocha assertion which corrects from `npm` to `npx`)
- AC9: All existing tests pass (`pnpm vitest run` in packages/cli)

## Edge Cases & Risks

- **`${...}` breadth**: Accepting any content inside `${...}` is correct because template literals are categorically expressions, never literal passwords. A real password would never be wrapped in `${...}` in source code — that would be a variable reference, which is the safe pattern.
- **Single `<` in passwords**: The regex requires `<UPPER_CASE>` (paired delimiters + uppercase content) for single-angle patterns. A password like `p<ss{word` contains unpaired `<` and won't match the anchored regex. Verified safe.
- **`npx` resolution in subdirectories**: `npx` resolves from the CWD's `node_modules/.bin` first. Since the command is wrapped in `(cd packages/web && npx vitest run)`, it resolves from the primary package's local bins. This is correct behavior.
- **`npm exec` alternative**: `npm exec vitest -- run` would also work but requires `--` separator for flag passthrough. `npx vitest run` is simpler, more universally understood, and has identical resolution behavior for local packages.

## Rejected Approaches

- **Adding more words to `DB_URL_PLACEHOLDERS`**: Treats the symptom. Adding `<<password>>` to the list would fix one template syntax but leave `{{password}}`, `${password}`, `<<db_pass>>`, and every other structural pattern unfixed. The disease is missing structural recognition, not missing words.
- **Global pre-filter for all secret patterns**: Only DB URLs have this problem. Other patterns use fixed prefixes (`sk_live_`, `AKIA`, `phc_`) that can't collide with template syntax. A global filter adds complexity for zero benefit.
- **Reading package.json scripts instead of direct construction (Issue 3)**: Explicitly rejected in the codebase comment at state.ts lines 375-378. Passthrough composition breaks with pnpm + vitest — `-- --run` doesn't reach vitest through the script layer. The direct construction approach is intentional; only the npm runner mapping was wrong.
- **Using `npm exec` instead of `npx`**: More "correct" for npm 7+ but requires different flag syntax (`npm exec vitest -- run`). `npx` is universally available (ships with npm), resolves local bins identically, and produces cleaner commands.

## Open Questions

None. Both fixes are narrow, validated, and have clear acceptance criteria.

## Exploration Findings

### Patterns Discovered

- `secrets.ts:63-66`: validate function uses string equality against a word list. The structural gap is the only issue — the word list itself is well-curated.
- `state.ts:248-268`: `buildDirectTestCommand` constructs `${packageManager} ${tool} ${flags}` — works for pnpm/yarn/bun (they forward to local bins) but not npm (requires npx).
- `makeTestCommand.test.ts:98`: Test asserts `npm mocha --exit` — the broken behavior is enshrined as expected output.

### Constraints Discovered

- [TYPE-VERIFIED] validate is DB-URL-only (secrets.ts:62) — no other pattern uses validate, so the fix has zero blast radius on other secret patterns
- [TYPE-VERIFIED] buildDirectTestCommand is monorepo-only (state.ts:405) — only called when `result.monorepo.isMonorepo && result.monorepo.primaryPackage`
- [OBSERVED] The npm+Vitest and npm+Jest cases have no test coverage — only pnpm and yarn are tested for those frameworks
- [OBSERVED] Template patterns have zero test coverage in secrets.test.ts — only the literal word `password` is tested

### Test Infrastructure

- `tests/engine/findings/secrets.test.ts`: Uses tmpDir with real filesystem writes. Each test creates a `.ts` file and runs `checkHardcodedSecrets` against it. Pattern: write file → run check → assert findings array.
- `tests/commands/init/makeTestCommand.test.ts`: Pure unit tests. Direct function call → assert return value. Has `it.each` for `makeTestCommandNonInteractive` but individual `it()` blocks for `buildDirectTestCommand`.

## For AnaPlan

### Structural Analog

`makeTestCommand.test.ts` line 85-116 — the existing `buildDirectTestCommand` test block. New npm cases follow the exact same pattern (one `it()` per case, direct assertion).

For the secrets fix: `secrets.test.ts` line 55-64 — the existing placeholder filter test. New template tests follow the same tmpDir + writeFile + assert pattern.

### Relevant Code Paths

- `packages/cli/src/engine/findings/rules/secrets.ts:63-66` — the validate function to modify
- `packages/cli/src/commands/init/state.ts:248-268` — `buildDirectTestCommand` to modify
- `packages/cli/tests/engine/findings/secrets.test.ts:55-64` — adjacent test to extend
- `packages/cli/tests/commands/init/makeTestCommand.test.ts:84-116` — test block to extend and correct

### Patterns to Follow

- Secrets tests: each test writes a single `.ts` file into tmpDir, runs the full `checkHardcodedSecrets`, asserts on the findings array. Follow the `detects database URL with real credentials` test at line 47.
- buildDirectTestCommand tests: one `it()` per case, direct call, `toBe()` assertion. Follow line 85-86 pattern.

### Known Gotchas

- The validate function receives the FULL URL match, not just the password. The password extraction (`/:\/\/[^:]+:([^@]+)@/`) happens inside validate. The structural regex must test `pw` (the extracted password), not the full match.
- The `pw` variable is already lowercased (line 65: `pwMatch?.[1]?.toLowerCase()`). The `${...}` regex will match because `${dbpassword}` (lowercased) still matches `/^\$\{[^}]+\}$/`. But `<UPPER_CASE>` requires uppercase — since `pw` is lowercased, the single-angle pattern should match lowercase: `/^<[a-z][a-z_]*>$/`. Planner must account for this.

### Things to Investigate

- Confirm whether `<your_password>` (lowercased single-angle) is a pattern worth supporting, or if `<YOUR_PASSWORD>` in source gets lowercased to `<your_password>` by the time the regex runs — which it does. The single-angle pattern needs to be `/^<[a-z][a-z_]*>$/` to match the lowercased input.
