# Build Report: Surface Awareness Bridge

**Created by:** AnaBuild
**Date:** 2026-05-21
**Spec:** .ana/plans/active/surface-awareness-bridge/spec.md
**Branch:** feature/surface-awareness-bridge

## What Was Built
For each file created or modified:
- `packages/cli/src/commands/work.ts` (modified): Extracted 15-line inline surface derivation block into named `deriveSurface()` helper function. Added backfill migration loop in the existing migration section — iterates existing entries without `surface` but with `modules_touched`, calls the helper to derive and populate surface. Restructured ana.json read to happen once before both new-entry derivation and backfill.
- `packages/cli/src/commands/proof.ts` (modified): Added `--surface <name>` option to both health and audit subcommands. Added `validateSurface()` helper function for surface name validation against ana.json. Health: filters `chain.entries` before `computeHealthReport`. Audit regular path: captures `entry_surface` during finding collection, filters post-collection. Audit `--matrix` path: filters `chain.entries` before matrix computation loop.
- `packages/cli/src/utils/proofSummary.ts` (modified): Added `surface?: string | undefined` to `DashboardEntry` interface. Added "By Surface" section generation in `generateDashboard` after summary line and before Hot Modules. Groups entries by surface (undefined → "Unscoped"), counts runs, active findings, and latest date per surface. Conditionally rendered only when at least one entry has a defined surface.
- `packages/cli/src/utils/scaffold-generators.ts` (modified): Added "Detected surfaces" line in Architecture section after monorepo packages line. Lists surface names with paths and frameworks. Only emitted when `result.surfaces` exists and has entries.
- `packages/cli/src/commands/doctor.ts` (modified): Added `SurfacesDimension` interface and `assessSurfaces()` function. Three checks: surface count + test command presence, scan-vs-ana.json drift, legacy field detection. Added to `DoctorDimensions`, `runDoctor` orchestration, and `formatTerminalOutput` display.
- `packages/cli/templates/.claude/agents/ana-learn.md` (modified): Added `surfaces` to startup field list in step 3. Added surface-aware triage guidance. Added `--surface` flag to `ana proof health` and `ana proof audit` command reference lines.
- `.claude/agents/ana-learn.md` (modified): Synced dogfood copy with template.
- `packages/cli/tests/commands/work.test.ts` (modified): Added `deriveSurface` unit tests — single surface match, cross-surface, empty modules, directory boundary matching, idempotence.
- `packages/cli/tests/commands/proof.test.ts` (modified): Added `--surface` integration tests for health (filter, invalid name, unconfigured) and audit (filter, matrix mode).
- `packages/cli/tests/utils/proofSummary.test.ts` (modified): Added dashboard "By Surface" section tests — rendering with surfaces, absence without surfaces, Unscoped grouping.
- `packages/cli/tests/commands/doctor.test.ts` (modified): Added surfaces dimension tests — count, missing test warning, scan drift, legacy fields, graceful no-surfaces.
- `packages/cli/tests/utils/scaffold-generators.test.ts` (created): New test file for scaffold surface line — monorepo inclusion and single-package absence.

## PR Summary

- Add `--surface <name>` filter to `ana proof health` and `ana proof audit` for monorepo surface-scoped querying, with validation and error messages for invalid/unconfigured surfaces
- Extract surface derivation into reusable `deriveSurface()` helper and add backfill migration that populates surface fields on existing proof chain entries
- Add "By Surface" section to the proof chain dashboard showing per-surface run counts, active findings, and latest dates
- Add surfaces health dimension to `ana doctor` checking test commands, scan drift, and legacy field warnings
- Add detected surfaces line to scaffold output and update ana-learn template with surface-aware triage guidance

## Acceptance Criteria Coverage

- AC1 "health --surface filters entries" → proof.test.ts "filters entries to the specified surface" (2 assertions: runs === 2, hot_modules defined) ✅
- AC2 "audit --surface filters findings" → proof.test.ts "filters active findings to specified surface" (2 assertions: total_active === 2, no website files) ✅
- AC3 "invalid surface error" → proof.test.ts "shows error for unknown surface name" (3 assertions: exitCode 1, contains "Unknown surface", lists available) ✅
- AC4 "no surfaces configured" → proof.test.ts "shows not-configured message" (2 assertions: exitCode 1, contains "not configured") ✅
- AC5 "By Surface dashboard section" → proofSummary.test.ts "renders By Surface section" (4 assertions: contains header, surface names, run counts) ✅
- AC6 "Unscoped grouping" → proofSummary.test.ts "groups entries without surface as Unscoped" (2 assertions: contains section, contains "Unscoped") ✅
- AC7 "scaffold surface line" → scaffold-generators.test.ts "includes detected surfaces" (3 assertions: contains "Detected surfaces", both surface details) ✅
- AC8 "no scaffold for single-package" → scaffold-generators.test.ts "no surface mention" (1 assertion) ✅
- AC9 "doctor surface count" → doctor.test.ts "reports count of configured surfaces" (2 assertions: count 2, status pass) ✅
- AC10 "doctor drift detection" → doctor.test.ts "detects scan-to-ana.json surface drift" (1 assertion: drift true) ✅
- AC11 "doctor legacy fields" → doctor.test.ts "warns when legacy keys exist" (2 assertions: contains both keys) ✅
- AC12 "learn template surfaces in startup" → verified via grep: template step 3 contains "surfaces" ✅
- AC13 "learn template --surface in reference" → verified via grep: 3 occurrences of "--surface" ✅
- AC14 "backfill populates surface" → work.test.ts "derives surface from modules_touched" (1 assertion: result === "cli") ✅
- AC15 "backfill is self-completing" → work.test.ts "is idempotent" (2 assertions: both calls return "cli") ✅
- AC16 "cross-surface stays undefined" → work.test.ts "returns undefined for cross-surface" (1 assertion: result undefined) ✅
- AC17 "no modules_touched not modified" → work.test.ts "returns undefined when modules_touched is empty" (1 assertion: result undefined) ✅
- AC18 "tests pass" → full suite: 2711 passed, 2 skipped ✅
- AC19 "no build errors" → pre-commit hook passes typecheck ✅
- AC20 "lint passes" → 0 errors, 1 pre-existing warning in git-operations.ts ✅

## Implementation Decisions
- Exported `deriveSurface` from work.ts for direct unit testing rather than testing only through integration. The function is pure and stateless — export cost is negligible, testability gain is high.
- Used `typeof activeFindings[0]` pattern for audit finding type and assigned `entry_surface` conditionally (`if (entry.surface)`) to avoid TypeScript `exactOptionalPropertyTypes` strict mode conflicts.
- Placed surface validation helper inside proof.ts as a non-exported function (used only by health and audit in the same file) per spec guidance.
- Added `assessSurfaces` as a sync function called after the `Promise.all` block in `runDoctor`, matching `assessProofChain` pattern per spec guidance.
- Synced `.claude/agents/ana-learn.md` dogfood copy with template — the dogfood comparison test enforces this.

## Deviations from Contract

### A022: Entries touching multiple surfaces keep their surface undefined
**Instead:** Test asserts `deriveSurface()` returns `undefined` for cross-surface entries rather than checking `hasOwnProperty('surface')` on an entry object
**Reason:** `deriveSurface` is the extracted helper — it returns `undefined` for cross-surface. The backfill loop only sets `entry.surface` when `derived` is truthy, so the entry property is never set. Testing the helper's return value is functionally equivalent to testing the property absence.
**Outcome:** Functionally equivalent — verifier should assess

### A023: Entries without modules_touched are not modified by the backfill
**Instead:** Test asserts `deriveSurface()` returns `undefined` for empty modules_touched rather than checking `hasOwnProperty('surface')` on an entry object
**Reason:** Same rationale as A022 — the helper return value controls whether the property is set on the entry.
**Outcome:** Functionally equivalent — verifier should assess

## Test Results

### Baseline (before changes)
```
pnpm run test -- --run
Test Files  119 passed (119)
     Tests  2689 passed | 2 skipped (2691)
```

### After Changes
```
pnpm run test -- --run
Test Files  120 passed (120)
     Tests  2711 passed | 2 skipped (2713)
```

### Comparison
- Tests added: 22
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/work.test.ts`: 7 tests — deriveSurface helper: single match, cross-surface, empty modules, empty surfaces, directory boundary, backfill scenario, idempotence
- `packages/cli/tests/commands/proof.test.ts`: 5 tests — health --surface filter, invalid surface error, unconfigured surfaces, audit --surface filter, audit --matrix --surface filter
- `packages/cli/tests/utils/proofSummary.test.ts`: 3 tests — By Surface section rendering, absence without surfaces, Unscoped grouping
- `packages/cli/tests/commands/doctor.test.ts`: 5 tests — surface count, missing test warning, scan drift, legacy fields, no surfaces graceful
- `packages/cli/tests/utils/scaffold-generators.test.ts`: 2 tests — monorepo surface line, single-package absence

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run tests/commands/work.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/proof.test.ts)
(cd packages/cli && pnpm vitest run tests/utils/proofSummary.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/doctor.test.ts)
(cd packages/cli && pnpm vitest run tests/utils/scaffold-generators.test.ts)
pnpm run test -- --run
(cd packages/cli && pnpm run lint)
```

## Git History
```
c2637bab [surface-awareness-bridge] Sync dogfood ana-learn.md with template
0e977694 [surface-awareness-bridge] Update ana-learn template with surface awareness
d84ae1f7 [surface-awareness-bridge] Add surfaces dimension to doctor
eee6a73b [surface-awareness-bridge] Add detected surfaces line to scaffold
519ac8de [surface-awareness-bridge] Add By Surface dashboard section
2bf8d8fd [surface-awareness-bridge] Add --surface filter to proof health and audit
6d82b147 [surface-awareness-bridge] Extract surface derivation helper and add backfill migration
```

## Open Issues

- `validateSurface` in proof.ts reads ana.json independently from the chain reading. If both health and audit are called in the same process, ana.json is read twice. Low impact — both are CLI commands that exit after one invocation.
- The `makeHealthEntry` helper function is duplicated in proof.test.ts across the health and audit --surface describe blocks. Pre-existing pattern — the original `makeHealthEntry` is scoped inside `describe('ana proof health')` and isn't accessible from sibling describe blocks.
- Pre-existing lint warning in `git-operations.ts:198` (unused eslint-disable directive) — not introduced by this build.

Verified complete by second pass.
