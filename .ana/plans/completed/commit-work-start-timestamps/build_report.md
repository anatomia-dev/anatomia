# Build Report: Commit timestamps written by work start

**Created by:** AnaBuild
**Date:** 2026-05-08
**Spec:** .ana/plans/active/commit-work-start-timestamps/spec.md
**Branch:** feature/commit-work-start-timestamps

## What Was Built

- `packages/cli/src/commands/work.ts` (modified): Added `commitSaves()` helper that stages only `.saves.json`, checks for staged changes, and commits with co-author trailer. Called after Think phase `writeTimestamp` (message: `[{slug}] Start work`) and Plan phase `writeTimestamp` (message: `[{slug}] Start plan phase`). Fixed 8 occurrences of "main" to "artifact branch" in comments and user-facing messages where "main" referred to the branch, not git's primary working tree. Preserved 4 correct references to "main project directory", "main tree", and "main commit path".
- `packages/cli/src/commands/artifact.ts` (modified): Fixed 1 user-facing error message from "on main but belongs in the worktree" to "on the artifact branch but belongs in the worktree".
- `packages/cli/tests/commands/work.test.ts` (modified): Added 5 tests covering Think phase commit, Plan phase commit, no-op on repeat, scoped staging, and no-push behavior.

## PR Summary

- Add `commitSaves()` helper that auto-commits `.saves.json` after `work start` creates timestamps, preventing dirty tracked state that blocks `git pull --rebase`
- Think phase commits with `[{slug}] Start work`, Plan phase with `[{slug}] Start plan phase`, both with co-author trailer
- Write-once guard means repeat calls are silent no-ops — no empty commits
- Fix "main" terminology in 9 locations across work.ts and artifact.ts to say "artifact branch" where appropriate
- 5 new tests verify commit behavior, scoped staging, no-op idempotency, and no-push guarantee

## Acceptance Criteria Coverage

- AC1 "After work start, .saves.json is committed (Think phase)" -> work.test.ts "Think phase commits .saves.json" (3 assertions: status clean, message correct, single file committed)
- AC2 "After work start, .saves.json is committed (Plan phase)" -> work.test.ts "Plan phase commits .saves.json" (2 assertions: status clean, message correct)
- AC3 "Think phase commit message is [{slug}] Start work" -> work.test.ts "Think phase commits .saves.json" (1 assertion: logResult contains "[fix-auth-timeout] Start work")
- AC4 "Plan phase commit message is [{slug}] Start plan phase" -> work.test.ts "Plan phase commits .saves.json" (1 assertion: logResult contains "[plan-test] Start plan phase")
- AC5 "Second call does not create empty commit" -> work.test.ts "second call to work start for same Think phase" (1 assertion: commit count unchanged)
- AC6 "Commit stages only .saves.json" -> work.test.ts "Think phase commits .saves.json" (1 assertion: diff-tree shows only .saves.json)
- AC7 "No git push" -> work.test.ts "work start does not push to remote" (1 assertion: succeeds without remote)
- AC8 "Main terminology fixed" -> Verified by code inspection: 9 changes made, 4 correct references preserved
- Tests pass -> 2029 passed, 2 skipped
- No build errors -> typecheck and build pass

## Implementation Decisions

- `commitSaves` silently catches commit failures rather than blocking the user's workflow. The spec says "no console output" and the commit is a convenience — failing silently is better than crashing `work start` over a git issue.
- `commitSaves` is a synchronous function (using `spawnSync`) rather than async — matches the artifact.ts pattern reference and avoids unnecessary complexity since git operations are inherently synchronous.
- The `try/catch` around `runGit(['add', ...])` returns early if staging fails — handles the case where .saves.json doesn't exist (shouldn't happen, but defensive).

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run --run)
Test Files  95 passed (95)
     Tests  2024 passed | 2 skipped (2026)
  Duration  34.75s
```

### After Changes
```
(cd packages/cli && pnpm vitest run --run)
Test Files  95 passed (95)
     Tests  2029 passed | 2 skipped (2031)
  Duration  36.47s
```

### Comparison
- Tests added: 5
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/work.test.ts`: Think phase commit (A001, A002, A003, A009), Plan phase commit (A004, A005, A006), no-op on repeat (A007, A008), scoped staging (A010), no-push (A011)

### Contract Coverage
Contract coverage: 14/14 assertions tagged.
- A001-A003: Think phase commit test
- A004-A006: Plan phase commit test
- A007-A008: No-op repeat test
- A009: Think phase commit test (single file assertion)
- A010: Scoped staging test
- A011: No-push test
- A012: Code change verified (8 "main" references fixed in work.ts)
- A013: Code change verified (1 "on main but" reference fixed in artifact.ts)
- A014: Code inspection verified (4 "main project directory"/"main tree" references preserved)

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
4a99e58 [commit-work-start-timestamps] Add tests for timestamp commit behavior
48118be [commit-work-start-timestamps] Add commitSaves helper and fix terminology
```

## Open Issues

1. `commitSaves` silently swallows commit failures. If git commit fails for a non-lock reason (e.g., corrupted index), the user gets no feedback. This is intentional — the spec says no console output and the commit is a convenience — but worth monitoring.

2. A011 (no-push) test verifies indirectly: the test repo has no remote, so if push were attempted it would fail and the test would catch the thrown error. A more direct test would mock/spy on git commands, but the existing test patterns in this file use real git repos without mocking.

3. A012/A013/A014 are code-change assertions verified by inspection, not runtime tests. These are terminology fixes in comments and string literals — runtime testing would require parsing source files, which is verifier territory.

4. Pre-existing lint warning in `git-operations.ts` (unused eslint-disable directive) — not introduced by this build.

Verified complete by second pass.
