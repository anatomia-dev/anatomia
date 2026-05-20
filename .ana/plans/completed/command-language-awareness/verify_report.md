# Verify Report: Command Detection Language Awareness

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-19
**Spec:** .ana/plans/active/command-language-awareness/spec.md
**Branch:** feature/command-language-awareness

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/command-language-awareness/contract.yaml
  Seal: INTACT (hash sha256:525810fddf5bbc3caea9e779d030543854adf908322931acce878af52e501c6f)
```

Tests: 2618 passed, 0 failed, 2 skipped (2620 total). Baseline was 2589 — +29 new tests.
Build: PASS (cached, no errors).
Lint: PASS (1 pre-existing warning in git-operations.ts — unused eslint-disable directive, not introduced by this build).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Ruby project with JS devDeps only shows native testing frameworks | ✅ SATISFIED | `scanProject.test.ts:692` — asserts `result.stack.testing` contains `'RSpec'` |
| A002 | JS testing frameworks removed from Ruby project scan results | ✅ SATISFIED | `scanProject.test.ts:694-695` — asserts not contains `'Vitest'` and `'Jest'` |
| A003 | Rust projects detect the built-in test runner | ✅ SATISFIED | `scanProject.test.ts:725` — asserts `result.stack.testing` contains `'Cargo test'` |
| A004 | Ruby projects detect Minitest when test directory exists | ✅ SATISFIED | `scanProject.test.ts:738` — asserts `result.stack.testing` contains `'Minitest'` |
| A005 | Ruby projects do not get JavaScript build commands | ✅ SATISFIED | `commands.test.ts:48` — asserts `result.build` is null for ruby projectType; `scanProject.test.ts:697` confirms at integration level |
| A006 | Ruby projects do not get JavaScript test commands from package.json | ✅ SATISFIED | `commands.test.ts:49` — asserts `result.test` is null for ruby projectType; `scanProject.test.ts:698` confirms at integration level |
| A007 | Package.json scripts are still recorded for polyglot projects | ✅ SATISFIED | `commands.test.ts:51-52` — asserts `result.all` has `build: 'webpack'` and `test: 'jest'`; `scanProject.test.ts:700-701` confirms |
| A008 | TypeScript projects still get all commands from package.json | ✅ SATISFIED | `commands.test.ts:30-31` — asserts `result.test` is `'pnpm run test'` for node projectType; `scanProject.test.ts:754` confirms at integration level |
| A009 | TypeScript project build commands are unaffected | ✅ SATISFIED | `commands.test.ts:30` — asserts `result.build` is `'pnpm run build'`; `scanProject.test.ts:756` confirms |
| A010 | Ruby projects with bin/rspec get a direct test command | ✅ SATISFIED | `nonNodeCommands.test.ts:28` — asserts `result.test` toBe `'bin/rspec'` with bin/rspec file on disk |
| A011 | Ruby projects without bin/rspec fall back to bundle exec rspec | ✅ SATISFIED | `nonNodeCommands.test.ts:38` — asserts `result.test` toBe `'bundle exec rspec'` |
| A012 | Go projects get the standard test command | ✅ SATISFIED | `nonNodeCommands.test.ts:52` — asserts `result.test` toBe `'go test ./...'` |
| A013 | Go projects get the standard build command | ✅ SATISFIED | `nonNodeCommands.test.ts:53` — asserts `result.build` toBe `'go build ./...'` |
| A014 | Rust projects get all three standard commands | ✅ SATISFIED | `nonNodeCommands.test.ts:62` — asserts `result.test` toBe `'cargo test'` |
| A015 | Rust projects get the cargo build command | ✅ SATISFIED | `nonNodeCommands.test.ts:63` — asserts `result.build` toBe `'cargo build'` |
| A016 | Rust projects get the cargo clippy lint command | ✅ SATISFIED | `nonNodeCommands.test.ts:64` — asserts `result.lint` toBe `'cargo clippy'` |
| A017 | Python projects with pytest get the pytest command | ✅ SATISFIED | `nonNodeCommands.test.ts:72` — asserts `result.test` toBe `'pytest'` |
| A018 | Ruby projects without any test framework get null test command | ✅ SATISFIED | `nonNodeCommands.test.ts:44` — asserts `result.test` toBeNull() |
| A019 | Non-Node projects do not get a dev command | ✅ SATISFIED | `nonNodeCommands.test.ts:78-81` — asserts `.dev` toBeNull() for Go, Rust, Ruby, Python |
| A020 | Rust projects with JS workspace packages do not get scoped JS build commands | ✅ SATISFIED | Source inspection: `state.ts:480-481` — scoping block guard `(!lang \|\| lang === 'TypeScript' \|\| lang === 'Node.js')` skips the entire block for Rust. `buildPackageCmd` stays null. No tagged test — verified by reading the guard logic. |
| A021 | Build command display returns empty string when no build command configured | ✅ SATISFIED | `nonNodeCommands.test.ts:201` — asserts `getBuildCommandString(tempDir)` toBe `''` |
| A022 | User-configured native commands survive re-initialization | ✅ SATISFIED | `nonNodeCommands.test.ts:136` — asserts `merged.commands.test` toBe `'bundle exec rspec'` after preserveUserState |
| A023 | Stale JavaScript commands cleared for non-Node projects on re-init | ✅ SATISFIED | `nonNodeCommands.test.ts:157-159` — asserts merged commands not equal to pnpm run variants |
| A024 | Non-Node projects with missing test command see setup listed first | ✅ SATISFIED | `nonNodeCommands.test.ts:247` — asserts output contains `'Configure commands'` |
| A025 | Non-Node projects with missing test command do not see setup as optional | ✅ SATISFIED | `nonNodeCommands.test.ts:248` — asserts output does not match `/optional.*~10 min/` |
| A026 | TypeScript projects still see setup as optional | ✅ SATISFIED | `nonNodeCommands.test.ts:259` — asserts output contains `'optional'` |
| A027 | Setup template surfaces null commands with a warning marker | ✅ SATISFIED | `nonNodeCommands.test.ts:279` — reads product template, asserts contains `'⚠'` and `'needs configuration'` |
| A028 | Dogfood setup template matches the product template change | ✅ SATISFIED | `nonNodeCommands.test.ts:287-288` — reads dogfood template, asserts contains `'⚠'` and `'needs configuration'` |

28/28 assertions SATISFIED.

## Independent Findings

### Predictions Resolved

1. **detectCommands guard placement** — NOT FOUND. Correctly placed after `result.all = scripts` (line 59 in commands.ts), before named command detection begins. Package.json scripts flow to `result.all`, then the guard returns before JS named commands are set.

2. **Case sensitivity (projectType vs language)** — NOT FOUND. The two layers correctly use different identifiers: `detectNonNodeTesting` and `detectCommands` use lowercase `projectType` ('ruby', 'rust') from the detector. `buildNonNodeCommands` and `preserveUserState` use display-name `language` ('Ruby', 'Rust') from `stack.language`. Spec gotchas explicitly warned about this.

3. **preserveUserState regex edge cases** — NOT FOUND as a problem. The regex `/(npm|yarn|pnpm|npx|bunx)\s/` requires a trailing space, correctly matching `pnpm run test` and `npm test` but not substring matches in native commands (`pytest`, `bundle exec rspec`, `cargo test`). Conservative as specified.

4. **Empty string vs null in init display** — CONFIRMED AS OBSERVATION. `!initTestCmd` at `state.ts:923` treats both `null` and `''` as "no test command." The upstream blank sanitizer (`state.ts:653-658`) already replaces `''` with `freshCommands[key]`, and `buildNonNodeCommands` returns `null` for missing commands — so empty string shouldn't reach this check in practice. But the falsy check is technically broader than the spec's "null" wording. No production impact.

5. **detectNonNodeTesting filesystem access** — NOT FOUND. Ruby branch uses `existsSync` (synchronous, won't throw from async perspective), wrapped in the existing try/catch. Go branch calls `readGoDependencies` (async, also in try/catch). Clear-and-rebuild at `scan-engine.ts:847` correctly awaits.

### Surprised Findings

- **A023 uses negated assertion:** The test at `nonNodeCommands.test.ts:157` asserts `not.toBe('pnpm run test')` rather than asserting the specific expected value (`null`). The contract says `not_equals: 'pnpm run test'` which maps to `not.toBe` — so the test is contract-aligned. But a test that asserts "not X" rather than "is Y" is weaker — it would pass if the value were `'npm run test'` (a different stale JS command). The migration regex would catch `npm run test` too, so the code is correct, but the test doesn't prove it.

- **A020 has no tagged test.** Verified by source inspection — the scoping block guard at `state.ts:480-481` prevents non-Node languages from entering the monorepo scoping block. `buildPackageCmd` stays at its initial `null`. The guard is sound but the assertion relies on code reading, not a mechanical test.

## AC Walkthrough
- [x] AC1: Ruby + .rspec + bin/rspec → `bin/rspec`; without → `bundle exec rspec`. ✅ PASS — `nonNodeCommands.test.ts:28,38`
- [x] AC2: TypeScript project unaffected. ✅ PASS — `commands.test.ts:28-34` (node projectType gets JS commands), `scanProject.test.ts:743-756` (integration level)
- [x] AC3: Python + pytest → `pytest`. ✅ PASS — `nonNodeCommands.test.ts:72`
- [x] AC4: Go → `go test ./...`, `go build ./...`. ✅ PASS — `nonNodeCommands.test.ts:52-53`
- [x] AC5: Rust → full command set. ✅ PASS — `nonNodeCommands.test.ts:62-65`
- [x] AC6: Ruby without .rspec → `null`. ✅ PASS — `nonNodeCommands.test.ts:44`
- [x] AC7: Ruby + .rspec + JS devDeps → `['RSpec']`. ✅ PASS — `scanProject.test.ts:692-695`
- [x] AC8: `detectNonNodeTesting` has Ruby + Rust branches. ✅ PASS — `scan-engine.ts:89-95` — Ruby checks `.rspec` and `test/`, Rust returns `['Cargo test']`
- [x] AC9: `commands.all` populated for polyglot. ✅ PASS — `commands.test.ts:51-52`, `scanProject.test.ts:700-701`
- [x] AC10: Rust + JS workspace → `buildPackage: null`. ✅ PASS — source inspection `state.ts:480-481`, scoping block skipped for non-Node
- [x] AC11: Skills Detected doesn't contain JS test commands. ⚠️ PARTIAL — `computeSkillManifest` returns skill file names (coding-standards, testing-standards), not test commands. The "Detected" line shows conditional skills (ai-patterns, api-patterns, data-access), none of which are test commands. This AC is trivially satisfied because it tests absence of something that was never present. The underlying concern (JS contamination in init display) is addressed by the command suppression in Layers 1-2.
- [x] AC12: `getBuildCommandString` returns `''`. ✅ PASS — `nonNodeCommands.test.ts:201`, `worktree.ts:431`
- [x] AC13: User-set `bundle exec rspec` survives re-init. ✅ PASS — `nonNodeCommands.test.ts:136`
- [x] AC14: `preserveUserState` clears stale JS commands. ✅ PASS — `nonNodeCommands.test.ts:157-159`, migration regex at `state.ts:663-668`
- [x] AC15: Rust `stack.testing` → `['Cargo test']`. ✅ PASS — `scanProject.test.ts:725`
- [x] AC16: TypeScript init shows setup as optional. ✅ PASS — `nonNodeCommands.test.ts:259`
- [x] AC17: Non-Node + null test → setup first, no "optional". ✅ PASS — `nonNodeCommands.test.ts:247-248`
- [x] AC18: Non-Node + test populated → setup optional. ✅ PASS — `nonNodeCommands.test.ts:262-269`
- [x] AC19: Setup template shows ⚠ marker. ✅ PASS — `nonNodeCommands.test.ts:279`, read template content, contains `⚠` and `needs configuration`
- [x] AC20: Configured commands persist to ana.json. ✅ PASS — `nonNodeCommands.test.ts:136` (preserveUserState preserves native commands through re-init)
- [x] AC21: Dogfood template matches product. ✅ PASS — `nonNodeCommands.test.ts:287-288`, both contain identical ⚠ content
- [x] Tests pass. ✅ PASS — 2618 passed, 0 failed, 2 skipped
- [x] No build errors. ✅ PASS — turbo build cached, no errors
- [x] Lint clean. ✅ PASS — 0 errors, 1 pre-existing warning (not introduced by this build)

## Blockers

No blockers. All 28 contract assertions SATISFIED. All ACs pass (AC11 is PARTIAL due to spec wording, not implementation). Checked for: unused exports in new code (only `getBuildCommandString` exported for tests, follows project convention with `@internal` tag), unused parameters in new functions (all used), error paths (all `catch` blocks follow graceful degradation pattern), sentinel test patterns (A023's negated assertion is contract-aligned, though weaker than a positive assertion), dead code in new if-blocks (each language branch returns — no fall-through or unreachable code).

## Findings

- **Test — A023 negated assertion is weaker than positive:** `packages/cli/tests/commands/init/nonNodeCommands.test.ts:157-159` — uses `not.toBe('pnpm run test')` instead of `toBe(null)`. Contract specifies `not_equals` matcher which maps to `not.toBe`, so the test is contract-aligned. But a positive assertion (`toBe(null)`) would catch bugs the negated assertion misses (e.g., migration replacing with a different stale value instead of clearing). The migration regex handles this upstream, so the code is correct — but the test doesn't prove it independently.

- **Test — A020 has no mechanical test:** `packages/cli/src/commands/init/state.ts:480` — the scoping block guard is verified by source inspection. A unit test with a Rust EngineResult in a monorepo configuration asserting `buildPackage: null` would be stronger. The guard logic is simple (language check) but untested in isolation.

- **Upstream — AC11 tests absence of something never present:** The "Skills Detected" display shows conditional skill file names (ai-patterns, api-patterns, data-access), not test commands. JS test commands never appeared there. The AC is trivially satisfied. The underlying concern (JS contamination leaking into init output) is addressed by Layers 1-2. Spec wording should be tightened on next revision.

- **Code — displaySuccessMessage uses falsy check for test command:** `packages/cli/src/commands/init/state.ts:923` — `!initTestCmd` catches both `null` and `''`. Spec says "null" specifically. Upstream guarantees `buildNonNodeCommands` returns `null` not `''`, and the blank sanitizer replaces `''` with fresh values, so empty string shouldn't reach this check. The broader check is defensive, not incorrect.

- **Code — buildNonNodeCommands is a linear if-chain:** `packages/cli/src/commands/init/state.ts:285-322` — each language is a separate if-block with early return. Adding a new language requires a new block. No extensibility pattern (map, registry). Acceptable for 4 languages — would want a registry at 8+.

- **Code — getBuildCommandString exported for testing:** `packages/cli/src/utils/worktree.ts:426` — was private, now exported with `@internal` tag. Follows project convention for test-only exports. Increases public API surface minimally.

- **Code — detectNonNodeTesting Ruby branch uses sync I/O in async function:** `packages/cli/src/engine/scan-engine.ts:89-90` — `existsSync` is used inside an async function while Go/Python branches use async reads. Functionally correct (sync I/O is simpler for existence checks) but stylistically inconsistent. Not worth changing — `existsSync` is used elsewhere in the codebase for simple existence checks.

- **Upstream — worktree-build-step-C3 partially addressed:** This build fixes the misleading `'pnpm run build'` fallback (now returns `''`). The duplicate I/O pattern (re-reading ana.json) noted in the original finding remains. The fallback fix is the scope of this build; the architecture remains unchanged.

## Deployer Handoff

This is a pure additive change — no behavioral change for TypeScript/Node.js projects. The risk surface is non-Node project initialization, which is currently broken (JS commands leak into Ruby/Python/Go/Rust projects). This build fixes that.

Key merge notes:
1. **No migration needed.** Existing TypeScript installations are unaffected. Non-Node installations will get correct commands on next `ana init`.
2. **Re-init is safe.** `preserveUserState` clears stale JS commands and preserves user-configured native commands. The regex is conservative — only matches `(npm|yarn|pnpm|npx|bunx)\s`.
3. **Two template files changed** (product + dogfood `ana-setup.md`). Both contain the ⚠ marker for null commands. These are LLM agent instructions, not user-facing code.
4. **+29 tests** across 3 new/modified test files. No existing tests modified — all new assertions.
5. **Pre-existing lint warning** in `git-operations.ts` — unused eslint-disable directive. Not introduced by this build.

## Verdict
**Shippable:** YES

28/28 contract assertions satisfied. All ACs pass. 2618 tests pass with 0 failures. Build and lint clean. No regressions — every guard explicitly checks for Node/TypeScript before applying, leaving existing behavior untouched. The implementation is clean, well-scoped, and follows existing patterns. Findings are all observations and debt — no risks that block shipping.
