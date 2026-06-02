# Scope: Fix scan display accuracy — env hygiene false positive and contributor label

**Created by:** Ana
**Date:** 2026-06-02

## Intent
The scan makes two claims the data doesn't support. First, `.gitignore covers .env` passes on a substring match — `.env.local` contains `.env`, so repos that only cover `.env.local` variants get a false "clean" checkmark. Second, the contributor count shows `activeContributors` without the "active" qualifier, making a 563-contributor repo look like it has 27 people.

These are the third and final batch of scan accuracy fixes, following fix-non-product-code-pollution (merged) and fix-vite-framework-detection (in build).

## Complexity Assessment
- **Kind:** fix
- **Size:** small — two surgical changes, both under 5 lines of production code
- **Surface:** cli
- **Files affected:** `src/engine/scan-engine.ts` (env hygiene), `src/commands/scan.ts` (contributor display), plus test files
- **Blast radius:** Minimal. Env hygiene changes the `gitignoreCoversEnv` boolean fed to finding rules — downstream consumers (`env.ts` finding rule) are unaffected since they already handle both `true` and `false`. Contributor display is a label-only change.
- **Estimated effort:** 1-2 hours
- **Multi-phase:** no

## Approach
Replace the substring match with git's own gitignore evaluator. Add the missing "active" qualifier to the contributor label.

The env hygiene fix uses `git check-ignore --no-index .env` instead of `gitignore.includes('.env')`. This is the authoritative check — it handles negation patterns, nested gitignores, and glob semantics. The `--no-index` flag evaluates regardless of whether `.env` exists or is tracked. `execSync` is already established in the engine's git detector (`git.ts:57`), so this follows existing patterns.

The contributor fix adds one word: "active" before "contributor" in the display output.

## Acceptance Criteria
- AC1: Scanning a repo where `.gitignore` contains `.env.local` but NOT `.env` (like shadcn-ui/ui) produces `gitignoreCoversEnv: false` and the env hygiene finding shows warn severity with ".env not in .gitignore"
- AC2: Scanning a repo where `.gitignore` contains `.env` produces `gitignoreCoversEnv: true` (no regression for dub, langfuse, anatomia)
- AC3: The contributor display line reads "N active contributors" (not "N contributors")
- AC4: Singular form "1 active contributor" works correctly
- AC5: Existing env hygiene tests pass, new test covers the `.env.local`-only false positive case
- AC6: No scan output changes for repos that already have `.env` in their gitignore (dub, langfuse, anatomia)

## Edge Cases & Risks
- **`git check-ignore` not available:** Non-git directories or very old git versions. The existing try/catch pattern handles this — defaults to `false` (conservative: assume not covered).
- **`--no-index` flag compatibility:** Available since git 2.10 (2016). Safe for any modern environment.
- **Bare `.env` intentionally committed:** Some projects commit `.env` with non-secret defaults. The check correctly reports "not covered" — accurate even if intentional. Finding severity stays at `warn`, not `critical`.
- **shadcn env hygiene output changes from pass to warn:** This is the fix working as intended. The current "clean" signal is wrong.
- **Non-git projects:** `execSync` will throw, catch block defaults `gitignoreCoversEnv` to `false`. Same behavior as current code when `.gitignore` doesn't exist.

## Rejected Approaches
- **Stricter string matching (line-by-line `.env` exact match):** Faster (no subprocess) but doesn't handle negation (`!.env`), nested gitignores, or complex glob patterns. An approximation when the authoritative tool is available. Rejected because `execSync` is already used in the engine and `git check-ignore` runs once per scan — performance is irrelevant.
- **Show both total and active contributors ("563 contributors · 27 active"):** Richer display but requires threading `git.contributorCount` through to the display context. `contributorCount` is unreliable on shallow clones, so showing it as a confident number is potentially misleading. Not worth the complexity for this fix.

## Open Questions
None. Both fixes are mechanically clear.

## Exploration Findings

### Patterns Discovered
- `detectSecrets()` at `scan-engine.ts:578-598` is async, uses `fs` operations only. No git subprocess calls currently, but `execSync` from `child_process` is used in `git.ts:57` within the same engine directory.
- Env hygiene finding rule at `src/engine/findings/rules/env.ts` consumes the `secrets` object from `detectSecrets()`. It doesn't care how `gitignoreCoversEnv` was computed — just reads the boolean.
- Contributor display at `scan.ts:275-276` uses `activity.activeContributors` directly. The field name in the type definition (`git.ts:50`) is correctly named `activeContributors`.

### Constraints Discovered
- [DETECTED] `execSync` pattern (git.ts:57) — `gitExec` helper wraps `execSync` with try/catch returning `null` on failure. Available for reuse or as a pattern to follow.
- [DETECTED] `detectSecrets` is async but doesn't need to be for this change — `execSync` is synchronous. No async/sync mismatch.
- [OBSERVED] Env finding tests (`tests/engine/findings/env.test.ts`) test the finding rule with pre-computed `gitignoreCoversEnv` booleans, not the detection logic itself. The detection logic in `scan-engine.ts` has no dedicated test — the new test should cover the detection.

### Test Infrastructure
- `tests/engine/findings/env.test.ts` — tests the env hygiene finding rule with a `makeContext()` helper that takes `{ envFileExists, envExampleExists, gitignoreCoversEnv }`. These tests remain valid since they test the rule, not the detection.
- `tests/engine/findings/secrets.test.ts` — tests hardcoded secret detection using temp directories with real files. Pattern for filesystem-based engine tests.

## For AnaPlan

### Structural Analog
`src/engine/detectors/git.ts` lines 55-61 — the `gitExec` helper that wraps `execSync` with try/catch. The env hygiene fix follows the exact same pattern: run a git command, interpret the result, fall back gracefully on failure.

### Relevant Code Paths
- `src/engine/scan-engine.ts:578-598` — `detectSecrets()`, where the env hygiene fix goes
- `src/commands/scan.ts:275-276` — contributor display, where the label fix goes
- `src/engine/detectors/git.ts:55-61` — `gitExec` helper, pattern to follow for the subprocess call
- `src/engine/findings/rules/env.ts` — downstream consumer of `gitignoreCoversEnv`, unchanged
- `tests/engine/findings/env.test.ts` — existing env finding tests, may need new case for detection logic

### Patterns to Follow
- `git.ts:55-61` for subprocess error handling
- `secrets.test.ts` for temp-directory-based engine tests (if testing detection with a real git repo)

### Known Gotchas
- `detectSecrets` currently has no `execSync` import — needs `import { execSync } from 'node:child_process'` added to scan-engine.ts
- The test for the substring false positive needs a real git repo (with `.gitignore`) since `git check-ignore` requires git context. Follow the temp directory + `git init` pattern from other engine tests, or test at the integration level.

### Things to Investigate
- Whether to inline the `execSync` call or import and reuse `gitExec` from `git.ts`. `gitExec` is not exported — Plan should decide whether to export it or duplicate the 3-line pattern inline.
