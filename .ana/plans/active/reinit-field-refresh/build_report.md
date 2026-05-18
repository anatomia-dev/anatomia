# Build Report: Re-init mechanical field refresh

**Created by:** AnaBuild
**Date:** 2026-05-18
**Spec:** .ana/plans/active/reinit-field-refresh/spec.md
**Branch:** feature/reinit-field-refresh

## What Was Built

- `packages/cli/src/commands/init/state.ts` (modified): Added `name`, `language`, `framework`, `packageManager` overrides to the merge object literal in `preserveUserState`, matching the existing `anaVersion`/`lastScanAt` pattern. Updated the doc comment (lines 520-522) to list all six mechanical refresh fields and removed the "separate design decision for a later sprint" note.
- `packages/cli/tests/commands/init.test.ts` (modified): Added 3 new tests in the `preserveUserState` describe block covering metadata field refresh, PRESERVE field survival, and null scan value overwrite.
- `.ana/context/project-context.md` (modified): Updated the Re-init Preservation Contract "Refreshed" bullet to list all six mechanical fields.

## PR Summary

- Add `name`, `language`, `framework`, `packageManager` to the set of fields that refresh from a fresh scan during `ana init` re-runs
- Commands and user-owned fields (coAuthor, artifactBranch, branchPrefix, custom) continue to preserve from old config
- Null scan results correctly overwrite stale non-null values — the scan is the source of truth
- Doc comment and project-context.md updated to reflect the new six-field preservation contract
- Three new tests verify the refresh, preservation, and null-overwrite behaviors

## Acceptance Criteria Coverage

- AC1 "name matches fresh scan" → init.test.ts "refreshes name, language, framework, packageManager from new config" `expect(result.name).toBe('fresh-project-name')` ✅
- AC2 "language matches fresh scan" → same test `expect(result.language).toBe('Python')` ✅
- AC3 "framework matches fresh scan" → same test `expect(result.framework).toBe('Django')` ✅
- AC4 "packageManager matches fresh scan" → same test `expect(result.packageManager).toBe('pip')` ✅
- AC5 "PRESERVE fields retain old values" → init.test.ts "preserves coAuthor, artifactBranch, branchPrefix, custom" (4 assertions) ✅
- AC6 "user-tuned command survives" → init.test.ts "refreshes metadata..." `expect(result.commands.test).toBe('my-custom-test')` ✅
- AC7 "doc comment lists all six refresh fields" → state.ts line 521 contains "anaVersion, lastScanAt, name, language, framework, packageManager" ✅
- AC8 "all existing tests pass, count does not decrease" → 2489 passed (2486 baseline + 3 new) ✅
- AC9 "unknown passthrough keys survive" → init.test.ts "refreshes metadata..." `expect(result.myCustomKey).toBe(true)` ✅
- AC10 "project-context.md matches new behavior" → Updated Refreshed bullet lists all six fields ✅

## Implementation Decisions

None. The spec was unambiguous and the implementation follows the existing pattern exactly.

## Deviations from Contract

None — contract followed exactly.

Contract coverage: 13/13 assertions tagged.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run tests/commands/init.test.ts)
 Test Files  1 passed (1)
      Tests  33 passed (33)
```

### After Changes
```
(cd packages/cli && pnpm vitest run tests/commands/init.test.ts)
 Test Files  1 passed (1)
      Tests  36 passed (36)
```

Full suite:
```
pnpm run test -- --run
 Test Files  108 passed (108)
      Tests  2489 passed | 2 skipped (2491)
   Duration  42.17s
```

### Comparison
- Tests added: 3
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/init.test.ts`:
  - "refreshes name, language, framework, packageManager from new config" — verifies all 4 metadata fields refresh, commands preserve, passthrough keys survive
  - "preserves coAuthor, artifactBranch, branchPrefix, custom" — verifies all PRESERVE fields survive alongside metadata refresh
  - "null scan results overwrite non-null old values" — verifies null language/framework/packageManager from scan overwrites stale values

## Verification Commands
```bash
pnpm run build
(cd packages/cli && pnpm vitest run tests/commands/init.test.ts)
pnpm run test -- --run
(cd packages/cli && pnpm run lint)
```

## Git History
```
68f796da [reinit-field-refresh] Update project-context preservation contract
297478c8 [reinit-field-refresh] Add tests for metadata field refresh
0de982e9 [reinit-field-refresh] Refresh metadata fields from scan on re-init
```

## Open Issues

Pre-existing lint warning in `packages/cli/src/utils/git-operations.ts:198` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
