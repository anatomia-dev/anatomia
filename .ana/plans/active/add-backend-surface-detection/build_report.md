# Build Report: Backend Service Surface Detection

**Created by:** AnaBuild
**Date:** 2026-05-22
**Spec:** .ana/plans/active/add-backend-surface-detection/spec.md
**Branch:** feature/add-backend-surface-detection

## What Was Built

- `packages/cli/src/engine/detectors/surfaces.ts` (modified): Updated module-level JSDoc from "Three signals" to "Four signals" with load-bearing evaluation order documented. Added `SERVER_FRAMEWORK_DEPS` constant (Set of 10 server framework package names) and `MIN_FILES_SERVER_DEP = 15` constant. Added `continue` after `candidates.push({ root })` in Signal 3 to prevent duplicate candidates. Added Signal 4 block: checks `root.deps` keys against `SERVER_FRAMEWORK_DEPS`, requires `dev` or `start:dev` in `root.scripts`, requires `root.fileCount >= MIN_FILES_SERVER_DEP`.
- `packages/cli/tests/engine/detectors/surfaces.test.ts` (modified): Added imports for `SERVER_FRAMEWORK_DEPS` and `MIN_FILES_SERVER_DEP`. Added 13 new tests: Signal 4 positive cases (express + dev, fastify + dev, NestJS + start:dev), Signal 4 negative cases (devDeps only, no dev/start:dev script, <15 files), Signal 3/4 overlap regression test, and constant value assertions (size=10, spot-checks for express/fastify/@nestjs/core/hono, MIN_FILES_SERVER_DEP=15).

## PR Summary

- Add Signal 4 to surface detection: backend services with a server framework production dep + dev/start:dev script + >=15 source files are now detected as surfaces
- Fix missing `continue` on Signal 3 that would have caused duplicate candidates once Signal 4 was added
- Add `SERVER_FRAMEWORK_DEPS` constant covering 10 frameworks (Express, Fastify, Koa, Hono, @hono/node-server, @nestjs/core, Elysia, Polka, Restify, h3)
- 13 new tests covering positive/negative/overlap cases with zero regressions on existing 69 tests

## Acceptance Criteria Coverage

- AC1 "Signal 3 has continue" -> surfaces.test.ts "signal 3 continue prevents duplicate candidates" (3 assertions: length=1, name, framework)
- AC2 "SERVER_FRAMEWORK_DEPS contains 10 frameworks" -> surfaces.test.ts "SERVER_FRAMEWORK_DEPS has 10 entries" (1 assertion)
- AC3 "Signal 4 checks root.deps only" -> surfaces.test.ts "signal 4 ignores devDeps" (1 assertion: length=0)
- AC4 "Signal 4 requires >= MIN_FILES_SERVER_DEP" -> surfaces.test.ts "signal 4 rejects packages below MIN_FILES_SERVER_DEP" (1 assertion: length=0)
- AC5 "Signal 4 accepts dev or start:dev" -> surfaces.test.ts "signal 4 detects server framework + dev script" + "signal 4 detects server framework + start:dev script" (3 assertions total)
- AC6 "Signal 4 fires after Signal 3" -> Signal 4 block placed after Signal 3 with comment documenting load-bearing order. Overlap test verifies Signal 3 claims NestJS package (framework = 'NestJS' from config, not null from Signal 4).
- AC7 "MIN_FILES_SERVER_DEP is exported named constant" -> surfaces.test.ts "MIN_FILES_SERVER_DEP is 15" (1 assertion)
- AC8 "Module JSDoc documents four signals" -> JSDoc updated: "Four signals classify surfaces (evaluation order is load-bearing..."
- AC9 "No regressions" -> 69 existing tests pass unchanged in both baseline and final runs

## Implementation Decisions

- Signal 4 checks `root.fileCount >= MIN_FILES_SERVER_DEP` before iterating deps for efficiency — short-circuits on file count before the more expensive `Object.keys().some()` check.
- Tests use realistic file counts (20, 30, 44, 100) rather than exact threshold values (15) for positive cases, following the existing test pattern of using values comfortably above thresholds. The negative case uses 10 (below 15).

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run tests/engine/detectors/surfaces.test.ts)

 Test Files  1 passed (1)
      Tests  69 passed (69)
   Duration  166ms
```

### After Changes
```
(cd 'packages/cli' && pnpm vitest run tests/engine/detectors/surfaces.test.ts)

 Test Files  1 passed (1)
      Tests  82 passed (82)
   Duration  172ms
```

Full suite:
```
pnpm run test -- --run

 anatomia-cli:  Test Files  122 passed (122)
 anatomia-cli:       Tests  2888 passed | 2 skipped (2890)

 Tasks:    4 successful, 4 total
```

### Comparison
- Tests added: 13
- Tests removed: 0
- Regressions: none

### New Tests Written
- `surfaces.test.ts`: Signal 4 positive (express+dev, fastify+dev, NestJS+start:dev), negative (devDeps only, no dev/start:dev, <15 files), overlap regression (Signal 3+4 = 1 surface), constants (SERVER_FRAMEWORK_DEPS size + 4 spot-checks, MIN_FILES_SERVER_DEP value)

## Verification Commands
```bash
pnpm run build
(cd 'packages/cli' && pnpm vitest run tests/engine/detectors/surfaces.test.ts)
pnpm run test -- --run
pnpm run lint
```

## Git History
```
7eeb5cc0 [add-backend-surface-detection] Add Signal 4 tests and constant assertions
74b4b9fa [add-backend-surface-detection] Add Signal 4 backend detection + fix Signal 3 continue
```

## Contract Coverage

16/16 assertions tagged:
- A001: surfaces.test.ts "signal 3 continue prevents duplicate candidates"
- A002: surfaces.test.ts "SERVER_FRAMEWORK_DEPS has 10 entries"
- A003: surfaces.test.ts "SERVER_FRAMEWORK_DEPS includes express"
- A004: surfaces.test.ts "SERVER_FRAMEWORK_DEPS includes fastify"
- A005: surfaces.test.ts "SERVER_FRAMEWORK_DEPS includes @nestjs/core"
- A006: surfaces.test.ts "SERVER_FRAMEWORK_DEPS includes hono"
- A007: surfaces.test.ts "signal 4 ignores devDeps"
- A008: surfaces.test.ts "signal 4 rejects packages below MIN_FILES_SERVER_DEP"
- A009: surfaces.test.ts "MIN_FILES_SERVER_DEP is 15"
- A010: surfaces.test.ts "signal 4 detects server framework + dev script"
- A011: surfaces.test.ts "signal 4 detects server framework + start:dev script"
- A012: surfaces.test.ts "signal 4 rejects packages without dev or start:dev"
- A013: source code comment on Signal 4 block documents evaluation order
- A014: surfaces.test.ts "MIN_FILES_SERVER_DEP is 15" (exported, importable)
- A015: module JSDoc contains "Four signals"
- A016: 69 existing tests pass unchanged (82 total - 13 new = 69)

## Open Issues

- Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.
- Signal 4 surfaces show `framework: null` because `detectFramework` only recognizes config-file-based frameworks. The spec explicitly notes this as structurally correct with a potential follow-up for deps-based framework inference.

Verified complete by second pass.
