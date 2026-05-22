# Build Report: Fix TypeScript Language Detection for Monorepos and Multi-Directory Projects

**Created by:** AnaBuild
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-typescript-language-detection/spec.md
**Branch:** feature/fix-typescript-language-detection

## What Was Built

- `packages/cli/src/engine/scan-engine.ts` (modified): Expanded the TypeScript override block (lines 853-871). Tier 2 now checks `census.rootDevDeps['typescript']` in addition to `allDeps['typescript']`. Added Tier 3: subdirectory tsconfig check (`frontend/`, `backend/`, `server/`, `web/`) gated on `!hasTsConfig && !hasTsDep`, inside the existing Node.js guard.
- `packages/cli/tests/engine/detectors/detection-overrides.test.ts` (modified): Added 5 new integration tests and `@ana` tags to 3 existing tests. New tests cover: monorepo rootDevDeps-only (A001), subdirectory tsconfig-only (A002), non-Node gate (A003), rootDevDeps sufficiency without subdirectory tsconfigs (A007), and multiple subdirectory tsconfigs (A008).

## PR Summary

- Fix TypeScript language detection for monorepos where `typescript` is only in root `devDependencies` (e.g., Budibase)
- Add Tier 3 subdirectory tsconfig detection for projects with `tsconfig.json` in `frontend/`, `backend/`, `server/`, or `web/` (e.g., Infisical, Tooljet)
- Preserve Node.js gate — non-Node projects with subdirectory tsconfigs are not falsely upgraded
- Five new integration tests covering all three detection tiers and edge cases
- Zero changes to existing test assertions; all 16 pre-existing tests pass unchanged

## Acceptance Criteria Coverage

- AC1 "Budibase scan produces TypeScript" → detection-overrides.test.ts "detects TypeScript when typescript is only in root devDependencies (monorepo)" (1 assertion) — tests the rootDevDeps path that Budibase hits
- AC2 "Infisical scan produces TypeScript" → detection-overrides.test.ts "detects TypeScript when tsconfig.json exists in a subdirectory only" (1 assertion) — tests server/tsconfig.json path
- AC3 "Tooljet scan produces TypeScript" → covered by AC2 (same Tier 3 code path, different subdirectory name)
- AC4 "Repos currently detecting as TypeScript remain TypeScript" → existing tests (A004, A005) pass unchanged
- AC5 "Non-Node.js repos unaffected" → detection-overrides.test.ts "does not override language for non-Node projects with subdirectory tsconfig" (1 assertion)
- AC6 "Tier 3 is short-circuited when Tier 1 or 2 matches" → verified by code structure: `if (!hasTsConfig && !hasTsDep)` gate. Existing tests for Tier 1 (A004) and Tier 2 (A005) pass without entering Tier 3.
- AC7 "Unit test covers rootDevDeps-only scenario" → detection-overrides.test.ts A001 test
- AC8 "Unit test covers subdirectory-tsconfig-only scenario" → detection-overrides.test.ts A002 test
- AC9 "Unit test covers the Node.js gate blocking non-Node languages" → detection-overrides.test.ts A003 test

## Implementation Decisions

- **A001/A007 monorepo fixture uses pnpm workspace:** As the spec's Gotchas section warned, without `pnpm-workspace.yaml` the census treats the project as single-repo and root devDeps flow into `allDeps` via sourceRoots. The fixture includes a workspace config and a workspace package to ensure the monorepo census path runs, separating rootDevDeps from allDeps.
- **A003 non-Node fixture has no package.json:** The simplest way to get a non-Node language detection is an empty directory with just a subdirectory tsconfig. This produces `language: null`, which correctly does not enter the Node.js gate.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run detection-overrides)
 Test Files  1 passed (1)
      Tests  16 passed (16)
   Duration  2.11s
```

### After Changes
```
(cd packages/cli && pnpm vitest run detection-overrides)
 Test Files  1 passed (1)
      Tests  21 passed (21)
   Duration  712ms

(cd packages/cli && pnpm vitest run)
 Test Files  120 passed (120)
      Tests  2780 passed | 2 skipped (2782)
   Duration  44.11s
```

### Comparison
- Tests added: 5
- Tests removed: 0
- Regressions: none

### New Tests Written
- `detection-overrides.test.ts`: monorepo rootDevDeps-only (A001), subdirectory tsconfig-only (A002), non-Node gate (A003), rootDevDeps sufficiency (A007), multiple subdirectory tsconfigs (A008)

## Verification Commands
```bash
pnpm run build
(cd 'packages/cli' && pnpm vitest run detection-overrides)
(cd 'packages/cli' && pnpm vitest run)
pnpm run lint
```

## Git History
```
c35be330 [fix-typescript-language-detection] Expand TypeScript override with rootDevDeps and subdirectory checks
```

## Contract Coverage

8/8 assertions tagged:
- A001 → "detects TypeScript when typescript is only in root devDependencies (monorepo)"
- A002 → "detects TypeScript when tsconfig.json exists in a subdirectory only"
- A003 → "does not override language for non-Node projects with subdirectory tsconfig"
- A004 → "detects TypeScript when tsconfig.json exists alongside package.json" (existing test, tagged)
- A005 → "detects TypeScript when typescript is in devDependencies" (existing test, tagged)
- A006 → "shows Node.js when no tsconfig.json and no typescript dep" (existing test, tagged)
- A007 → "detects TypeScript via rootDevDeps without subdirectory tsconfigs"
- A008 → "detects TypeScript when tsconfig.json exists in multiple subdirectories"

## Open Issues

- Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.
- Baseline test count discrepancy: spec says 2762 passed but worktree full suite shows 2780 passed. Likely due to tests added between spec creation and worktree creation (the worktree is created from HEAD of main). No regressions — 0 failures in both runs.

Verified complete by second pass.
