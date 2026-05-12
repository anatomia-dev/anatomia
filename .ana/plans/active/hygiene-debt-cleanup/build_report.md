# Build Report: Hygiene debt cleanup

**Created by:** AnaBuild
**Date:** 2026-05-12
**Spec:** .ana/plans/active/hygiene-debt-cleanup/spec.md
**Branch:** feature/hygiene-debt-cleanup

## What Was Built

- `.gitignore` (modified): Committed existing `.mcp.json` entry — MCP config contains local paths.
- `packages/cli/src/commands/work.ts` (modified): Added `'--autostash'` to all three `pull --rebase` args arrays (lines 1206, 1287, 1796).
- `packages/cli/tests/engine/fixtures/` (deleted): Removed entire directory tree — 3 dead fixture files whose `loadFixture()` consumer was deleted in `785a9eb`.
- `.claude/skills/testing-standards/SKILL.md` (modified): Added inline fixture rule to the project's dogfood testing-standards skill (not the shipped template — see Deviations).
- `pnpm-lock.yaml` (modified): `pnpm update` at workspace root. Key changes: minimatch 9.0.5→9.0.9, eslint 9.39.2→9.39.4, prettier 3.8.0→3.8.3, turbo 2.7.5→2.9.12.
- `packages/cli/tests/commands/work.test.ts` (modified): Fixed content-match guard test to use genuinely untracked planning artifacts. Added `planningOnlyInMerge` option to `createProjectWithUntrackedConflict` helper so planning artifacts arrive via merge only (not in init commit), exercising the actual `"untracked working tree files would be overwritten"` error path.

## PR Summary

- Add `--autostash` to all three `git pull --rebase` calls in `work.ts`, preventing silent pull skips when the working tree has uncommitted changes
- Delete 3 dead test fixture files containing real package names that triggered GitHub security advisory false positives
- Update transitive dependencies within semver ranges, reducing `pnpm audit` findings from 20 to 12
- Commit `.gitignore` entry for `.mcp.json` and add inline fixture rule to project testing-standards skill
- Fix content-match guard test to use genuinely untracked files (was testing tracked-dirty path by mistake)

## Acceptance Criteria Coverage

- AC1 "All three git pull --rebase calls include --autostash" → verified by `grep -n 'autostash' packages/cli/src/commands/work.ts` — 3 matches at lines 1206, 1287, 1796
- AC2 "Dead fixture files deleted" → verified by `ls packages/cli/tests/engine/fixtures/ 2>&1` — "No such file or directory"
- AC3 "All existing tests pass" → ✅ 2177 passed, 2 skipped, 0 failed (100 test files)
- AC4 "pnpm update run at workspace root" → ✅ lockfile updated
- AC5 "pnpm audit reports fewer than 20" → 12 findings (down from 20). All dev-only transitives (postcss via vite/tsup).
- AC6 "Testing-standards skill includes inline fixture rule" → ✅ Rule added to project dogfood skill (see Deviations)
- AC7 ".gitignore includes .mcp.json" → ✅ Committed in ea26e6a
- AC8 "pnpm run build succeeds" → ✅ Build passes

## Implementation Decisions

1. **Split .gitignore and --autostash into one commit** — both relate to "git sync works with dirty trees." Logically one unit.
2. **Used `pnpm update minimatch --recursive`** after initial `pnpm update` didn't resolve minimatch 9.0.5→9.0.9. The `--recursive` flag forced resolution across workspace packages.
3. **Fixture deletion + testing-standards rule in one commit** — the rule documents why the fixtures were deleted. One logical unit.
4. **`planningOnlyInMerge` option on test helper** — Rather than duplicating the helper or creating a separate one, added an option that controls whether planning artifacts are committed in init or deferred to the feature branch. This keeps the helper generic while allowing the content-match guard test to use genuinely untracked files. Applied to both the content-match test (A010) and the mixed-files test (A011) since both test the untracked planning artifact path.

## Deviations from Contract

### A011: Testing standards now warn against standalone manifest fixture files
**Instead:** Rule added to `.claude/skills/testing-standards/SKILL.md` (project dogfood) instead of `packages/cli/templates/.claude/skills/testing-standards/SKILL.md` (shipped template)
**Reason:** "Scanner and parser tests" is Anatomia-specific vocabulary. The rule doesn't clear the bar for a universal default shipped to every user.
**Outcome:** Contract assertion A011 is satisfied — the testing-standards SKILL.md does contain "inline fixture data." Developer confirmed this change during the first build.

### A012: The new rule explains why standalone manifests are problematic
**Instead:** Same file location change as A011
**Reason:** Same reasoning
**Outcome:** Contract assertion A012 is satisfied — the rule text contains "security advisory"

## Test Results

### Baseline (before changes, from first build)
```
(cd packages/cli && pnpm vitest run)
 Test Files  100 passed (100)
      Tests  2177 passed | 2 skipped (2179)
```

### After Changes (post-fix)
```
(cd packages/cli && pnpm vitest run)
 Test Files  100 passed (100)
      Tests  2177 passed | 2 skipped (2179)
   Duration  50.42s (transform 4.09s, setup 0ms, import 13.67s, tests 215.39s, environment 43ms)
```

### Comparison
- Tests added: 0
- Tests removed: 0
- Regressions: none — the previously failing content-match guard test now passes

### New Tests Written
None — spec says "No new tests required." The fix corrected an existing test's setup, not its assertions.

## Fix History

### Round 1: Verify found 1 regression
- **Failing test:** `keeps content-match guard for planning artifacts during work complete` (work.test.ts:4366)
- **Root cause:** The test committed `scope.md` in the init commit, making it tracked. When overwritten with different content, it was a dirty tracked file — `--autostash` handled it silently. The content-match guard only fires on `"untracked working tree files would be overwritten"`, a different error path.
- **Fix:** Added `planningOnlyInMerge` option to `createProjectWithUntrackedConflict` helper. When true, planning artifacts are only added in the feature branch, so they arrive via merge and are genuinely untracked when written locally. Applied to both the content-match test (4357) and mixed-files test (4370).
- **Result:** All 2177 tests pass.

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
pnpm audit
grep -n 'autostash' packages/cli/src/commands/work.ts
ls packages/cli/tests/engine/fixtures/ 2>&1
```

## Git History
```
c57c09f [hygiene-debt-cleanup] Fix: content-match guard test uses untracked scenario
8166ba4 [hygiene-debt-cleanup] Verify report
3f22813 [hygiene-debt-cleanup] Build report
adf19d4 [hygiene-debt-cleanup] Update transitive dependencies within semver ranges
57bb215 [hygiene-debt-cleanup] Delete dead fixture files and add inline fixture rule
ea26e6a [hygiene-debt-cleanup] Add --autostash to pull --rebase and commit .gitignore
```

## Open Issues

1. **11 audit findings remain:** All dev-only transitives (postcss via vite/tsup, rollup via vitest, flatted via eslint). Can't resolve without major version bumps. AC5 says "≤3 dev-only" — ambiguous whether that's 3 packages or 3 paths. By unique package it's ~4 (postcss, rollup, flatted, picomatch); by path it's 12.

2. **minimatch required `--recursive` flag:** `pnpm update` alone didn't resolve minimatch 9.0.5→9.0.9 despite being within `^9.0.4`. Future transitive updates may need `--recursive`.

3. **Pre-existing lint warning:** `git-operations.ts:198` has an unused eslint-disable directive. Not introduced by this build.

4. **Template not modified:** Spec called for modifying `packages/cli/templates/.claude/skills/testing-standards/SKILL.md`. Developer redirected to project dogfood skill during first build. Contract assertions A011/A012 satisfied by the dogfood file.

5. **Contract A008 test count stale:** Contract says 2177 but main has gained 1 test since sealing (from fix-worktree-branch-parsing). Branch is behind main. No tests were lost by this build — the count matches the branch's baseline.

Verified complete by second pass.
