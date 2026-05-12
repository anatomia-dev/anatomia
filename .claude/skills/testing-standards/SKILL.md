---
name: testing-standards
description: "Invoke when writing tests, reviewing test quality, or setting up test infrastructure. Contains project-specific testing framework conventions, fixture patterns, and coverage expectations."
---

# Testing Standards

## Detected
- Framework: Vitest (94 test files)
- Test command: pnpm run test -- --run
- Testing patterns: vitest
- Test location: dedicated test directory

### Library Rules
- Always pass `--run` flag when invoking Vitest in CI or non-interactive contexts. Vitest defaults to watch mode, which hangs pipelines waiting for input.

## Rules
- Test behavior, not implementation. Assert on what the code returns or produces — not which internal functions it calls. Tests should survive refactoring when behavior is unchanged.
- Prefer real implementations over mocks. Mock only what you can't control: network calls, time, randomness. Every mock is a lie about how the system actually behaves.
- Cover the error path, not just the happy path. For each feature test, write at least one test for invalid input, missing data, or service failure.
- Assert on specific expected values from real inputs. `expect(status).toBe(200)` not `expect(status).toBeDefined()`. A test that passes regardless of whether the feature works catches nothing. Never write tautological tests — `expect(true).toBe(true)` proves nothing. The same applies to range matchers — `toBe(2)` not `toBeGreaterThan(0)` when the test fixture has a known count. If you can't determine the specific expected value, read the contract's `matcher`/`value` fields before falling back to a weak assertion.
- Never weaken a test to make it pass. If a test fails, fix the code or fix the expectation — never broaden assertions or catch exceptions to force green.
- When overriding EngineResult fields in tests, spread at each nesting level: `{ ...base, commands: { ...base.commands, test: 'vitest' } }`. Never reconstruct the full object manually — the factory provides all required defaults and the type has 40+ fields.

- Never assert on source code content in a test. Reading a file and checking `source.toContain('some string')` proves the string exists in code, not that users see it. Mock the trigger condition and assert on the output instead.
- Run the relevant test file after each change for fast feedback: `pnpm vitest run tests/{file}`. Run the full suite before the build report to catch cross-file regressions.
- Scan integration tests run against the compiled `dist/index.js`, not source. The pre-commit hook runs `pnpm run build` to keep the artifact fresh. If running tests manually outside the hook, run `pnpm run build` first — stale dist will give false passes on terminal output tests.
- Tests that create git repositories must force the branch name with `git init -b main` or `git branch -M main` after first commit. CI runners have different `init.defaultBranch` settings — never assume the default. This has caused CI failures 3 times.
- Use inline fixture data for scanner and parser tests — write files to temp directories at test time. Standalone manifest files with real package names (requirements.txt, package.json) trigger GitHub security advisory false positives.

## Gotchas
*Not yet captured. Add as you discover them during development.*

## Examples
*Not yet captured. Add short snippets showing the RIGHT way.*
