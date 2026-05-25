# Build Report: Fix Workspace Glob Fallback

**Created by:** AnaBuild
**Date:** 2026-05-25
**Spec:** .ana/plans/active/fix-workspace-glob-fallback/spec.md
**Branch:** feature/fix-workspace-glob-fallback

## What Was Built

- `packages/cli/src/engine/census.ts` (modified): Two fixes in `buildCensus()`:
  1. **Fix A** — Simplified `isSingleRepo` condition: removed `result.tool.type === 'root'` check. Now any result with 0 non-root packages is treated as single-repo. Added defensive guard for `result.rootPackage` being undefined.
  2. **Fix B** — Enhanced catch block: reads root `package.json` into `fallbackRootPackage` when `@manypkg` throws. The `!result` branch now uses fallback fields (name, deps, devDeps, bin, scripts) instead of hardcoded empty objects.

- `packages/cli/tests/engine/census.test.ts` (modified): Added 3 integration tests exercising both fixes and the edge case.

## PR Summary

- Fix scan crash on repos where `@manypkg` resolves workspace YAML but finds 0 packages (e.g., umami with unresolvable glob patterns)
- Recover root package.json dependencies when `@manypkg` throws on invalid workspace packages (e.g., erxes/immich missing `name` field)
- Add defensive guard for `result.rootPackage` being undefined in the single-repo branch
- Graceful degradation preserved: repos with no package.json at all still produce empty-deps fallback
- 3 new integration tests covering Fix A, Fix B, and the Fix B edge case

## Acceptance Criteria Coverage

- AC1 "ana scan on umami completes without crashing" → census.test.ts "handles workspace with 0 resolved packages (Fix A)" — layout is single-repo, deps detected
- AC2 "erxes detects database/framework" → census.test.ts "falls back to root package.json when @manypkg throws (Fix B)" — express/mongoose detected
- AC3 "immich completes without crashing" → Same Fix B mechanism (nameless workspace packages)
- AC4 "Existing monorepo scans produce identical results" → census.test.ts "builds census for Anatomia itself (pnpm monorepo)" passes unchanged (A013, A014)
- AC5 "Test verifies Fix A" → census.test.ts "handles workspace with 0 resolved packages (Fix A)" (7 assertions)
- AC6 "Test verifies Fix B" → census.test.ts "falls back to root package.json when @manypkg throws (Fix B)" (7 assertions)
- AC7 "Test verifies Fix B edge case" → census.test.ts "empty-deps fallback when @manypkg throws and no root package.json exists" (4 assertions)
- AC8 "`pnpm run test -- --run` passes" → 2924 passed, 2 skipped
- AC9 "Build and lint pass" → Both pass (lint has 1 pre-existing warning in unrelated file)

## Implementation Decisions

1. **`fallbackRootPackage` type inline rather than imported.** The type only needs 5 fields (name, dependencies, devDependencies, bin, scripts). Using a local type avoids coupling to any external interface and keeps the change minimal.
2. **Defensive guard uses early-return pattern.** When `result.rootPackage` is undefined in the `isSingleRepo` branch, falls through to empty-deps source root rather than crashing. Matches the spec's "early returns over nested conditionals" guidance.
3. **Comments explain the *why* of the Fix A change.** Added explanation that repos like umami return `tool.type 'pnpm'` with 0 packages, which would otherwise enter the monorepo branch and crash.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run census.test)
Test Files  2 passed (2)
     Tests  6 passed | 2 skipped (8)
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run census.test)
Test Files  2 passed (2)
     Tests  9 passed | 2 skipped (11)
```

Full suite:
```
pnpm run test -- --run
Test Files  124 passed (124)
     Tests  2924 passed | 2 skipped (2926)
  Duration  47.69s
```

### Comparison
- Tests added: 3
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/engine/census.test.ts`:
  - "handles workspace with 0 resolved packages (Fix A)" — pnpm-workspace.yaml with unresolvable glob, verifies layout/deps/monorepoTool
  - "falls back to root package.json when @manypkg throws (Fix B)" — nameless workspace package triggers throw, verifies root deps recovered
  - "empty-deps fallback when @manypkg throws and no root package.json exists (Fix B edge)" — no root package.json, verifies empty-deps behavior preserved

### Contract Coverage
14/14 assertions tagged:
- A001-A005: "handles workspace with 0 resolved packages (Fix A)" test
- A006-A010: "falls back to root package.json when @manypkg throws (Fix B)" test
- A011-A012: "empty-deps fallback..." test
- A013-A014: Covered by existing "builds census for Anatomia itself" test (not tagged — pre-existing test, assertions verified by running it)

## Verification Commands
```bash
pnpm run build
(cd 'packages/cli' && pnpm vitest run census.test)
pnpm run test -- --run
pnpm run lint
```

## Git History
```
c282b4ea [fix-workspace-glob-fallback] Fix scan crash on unresolvable workspace globs and invalid workspace packages
```

## Open Issues

1. **A013/A014 not tagged in test file.** The existing "builds census for Anatomia itself" test covers these contract assertions but is a pre-existing test. Adding `// @ana` tags to pre-existing tests would be a modification not in the spec's file changes. The test passes and verifies the assertions — just not tagged.

Verified complete by second pass.
