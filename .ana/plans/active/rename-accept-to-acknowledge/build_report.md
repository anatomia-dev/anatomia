# Build Report: Rename Finding Action `accept` → `acknowledge`

**Created by:** AnaBuild
**Date:** 2026-06-01
**Spec:** .ana/plans/active/rename-accept-to-acknowledge/spec.md
**Branch:** feature/rename-accept-to-acknowledge

## What Was Built

For each file created or modified:
- `packages/cli/src/types/proof.ts` (modified): Changed `suggested_action` union type from `'accept'` to `'acknowledge'` in both `findings` and `build_concerns` type definitions.
- `packages/cli/src/utils/proofSummary.ts` (modified): Renamed all 7 occurrences of `'accept'` in type unions and `as` casts to `'acknowledge'`. Also fixed a `by_action` zero-object literal in the error response helper (line 495).
- `packages/cli/src/utils/proof-health.ts` (modified): Renamed type key `accept` → `acknowledge` in `ChainHealth` interface, variable `actAccept` → `actAcknowledge`, switch case `'accept'` → `'acknowledge'`, and return object key.
- `packages/cli/src/commands/proof.ts` (modified): Updated 5 locations: `EMPTY_AUDIT_MATRIX` zero object, `matrixByAction` key, zero-entry audit JSON payload, `byAction` key, and `actOrder` array. Removed the special-case ternary that appended `(closeable)` to the accept label — all actions now use plain `${count} ${act}` format.
- `packages/cli/src/commands/artifact-validators.ts` (modified): Changed `VALID_FINDING_ACTIONS` to `['promote', 'scope', 'monitor', 'acknowledge', 'accept']` — both values present for backward compatibility.
- `packages/cli/src/commands/work-proof.ts` (modified): Added `accept_to_acknowledge` backfill migration block following the `surface_backfill` pattern. Iterates all entries' findings and build_concerns, renames `'accept'` → `'acknowledge'`, sets migration marker. Used `as string` cast to satisfy TypeScript since the type no longer includes `'accept'`.
- `packages/cli/templates/.claude/agents/ana-verify.md` (modified): Updated action field list and description.
- `packages/cli/templates/.claude/agents/ana-build.md` (modified): Updated action field list and description.
- `packages/cli/templates/.claude/agents/ana-learn.md` (modified): Updated 6 locations: field list, prose explanation, 3 closure reason examples, and predict-before-reading guidance.
- `packages/cli/templates/.codex/agents/ana-verify.md` (modified): Mirrored Claude template changes.
- `packages/cli/templates/.codex/agents/ana-build.md` (modified): Mirrored Claude template changes.
- `.claude/agents/ana-verify.md` (modified): Mirrored product template changes (dogfood).
- `.claude/agents/ana-build.md` (modified): Mirrored product template changes (dogfood).
- `.claude/agents/ana-learn.md` (modified): Mirrored product template changes (dogfood).
- `.codex/agents/ana-verify.md` (modified): Mirrored product template changes (dogfood).
- `.codex/agents/ana-build.md` (modified): Mirrored product template changes (dogfood).
- `packages/cli/tests/utils/proof-health.test.ts` (modified): Updated 5 fixture `suggested_action` values and 3 assertion references from `accept` to `acknowledge`.
- `packages/cli/tests/commands/proof.test.ts` (modified): Updated 9 fixture values, renamed test from "closeable hint on accept" to "acknowledge label", updated `by_action.accept` → `by_action.acknowledge` assertions, updated `by_severity_action['observation/accept']` → `by_severity_action['observation/acknowledge']`, and updated zero-entry expected JSON.
- `packages/cli/tests/commands/work.test.ts` (modified): Added 3 new migration integration tests.
- `website/content/docs/concepts/findings.mdx` (modified): Updated action table row from `accept` to `acknowledge` and severity table typical action reference.
- `website/content/docs/guides/using-ana-learn.mdx` (modified): Updated terminal mockup from `observation/accept` to `observation/acknowledge`.

## PR Summary

- Rename finding action value `accept` → `acknowledge` across all source types, switch cases, display paths, and JSON output keys in the CLI
- Add backward-compatible validator tolerance: `VALID_FINDING_ACTIONS` includes both `acknowledge` (canonical) and `accept` (tolerated for old templates)
- Add one-time backfill migration in `writeProofChain` that renames existing `accept` findings/concerns to `acknowledge`, gated by `migrations.accept_to_acknowledge`
- Update all 10 agent templates (product + dogfood, Claude + Codex) to reference `acknowledge` in structured action definitions
- Update docs action table and terminal mockup to show the new action name

## Acceptance Criteria Coverage

- AC1 "Zero occurrences of `'accept'` as action value in source" → Verified via replace_all edits; type system enforces (TypeScript union no longer includes `'accept'`)
- AC2 "Zero `suggested_action: 'accept'` in test fixtures" → proof-health.test.ts and proof.test.ts all fixtures updated; work.test.ts intentionally uses `'accept'` in migration test input data (testing the backfill)
- AC3 "Product templates use `acknowledge`" → ana-verify.md, ana-build.md, ana-learn.md updated for both .claude and .codex
- AC4 "Dogfood templates use `acknowledge`" → All 5 dogfood agent files updated
- AC5 "`VALID_FINDING_ACTIONS` includes both" → artifact-validators.ts:44 = `['promote', 'scope', 'monitor', 'acknowledge', 'accept']`
- AC6 "writeProofChain runs backfill" → work-proof.ts migration block at lines 305-319
- AC7 "After backfill, zero accept findings" → work.test.ts "renames accept to acknowledge" test verifies (A011-A013)
- AC8 "Display shows acknowledge, not accept" → proof.ts actOrder uses `'acknowledge'`; closeable ternary removed; proof.test.ts assertion updated
- AC9 "findings.mdx action table shows acknowledge" → Line 27 updated; using-ana-learn.mdx mockup updated
- AC10 "Website builds successfully" → `(cd website && pnpm run build)` succeeded
- AC11 "All existing tests pass" → 3132 passed, 2 skipped (3 new tests added)
- AC12 "No build errors" → `pnpm run build` clean

## Implementation Decisions

1. **`as string` cast in migration**: TypeScript's type system correctly flags `=== 'accept'` as impossible since the union no longer includes it. Used `(finding.suggested_action as string) === 'accept'` to satisfy the compiler while maintaining the runtime check needed for legacy data.
2. **proofSummary.ts line 495**: Spec didn't explicitly mention this `by_action` zero-object, but it had `accept: 0` and the type changed — caught by the build step.
3. **Test rename**: Changed test name from "shows action breakdown with closeable hint on accept" to "shows action breakdown with acknowledge label" since the test semantics changed.

## Deviations from Contract

None — contract followed exactly.

## Test Results

### Baseline (before changes)
```
(cd 'packages/cli' && pnpm vitest run)
 Test Files  129 passed (129)
      Tests  3129 passed | 2 skipped (3131)
   Duration  51.43s
```

### After Changes
```
pnpm run test -- --run
 Test Files  129 passed (129)
      Tests  3132 passed | 2 skipped (3134)
   Duration  52.11s
```

### Comparison
- Tests added: 3 (migration integration tests in work.test.ts)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/work.test.ts`: 3 tests in "migration markers" describe block:
  - "renames accept to acknowledge in findings and build concerns" — verifies findings, build_concerns, and non-accept values unchanged
  - "does not re-process when accept_to_acknowledge marker already exists" — verifies idempotency
  - "handles entries with no findings or build_concerns arrays" — verifies defensive handling of missing arrays

## Verification Commands
```bash
pnpm run build
(cd 'packages/cli' && pnpm vitest run)
pnpm run lint
(cd 'website' && pnpm run build)
```

## Git History
```
832fb8e4 [rename-accept-to-acknowledge] Add migration integration tests for accept-to-acknowledge backfill
52234119 [rename-accept-to-acknowledge] Update docs to use acknowledge in action table and terminal mockup
1eb6f7a0 [rename-accept-to-acknowledge] Update product and dogfood templates to use acknowledge
bd2d8924 [rename-accept-to-acknowledge] Rename accept to acknowledge in source, tests, and add backfill migration
```

## Open Issues

1. **Pre-existing lint warning**: `git-operations.ts:198` has an unused eslint-disable directive — not introduced by this build, present in baseline.
2. **Migration test uses `'accept'` as fixture input**: `work.test.ts` migration tests intentionally set `suggested_action: 'accept'` in test fixtures to exercise the migration path. This is correct behavior — the migration must accept old values. AC2 says "zero in test fixture data" but the migration test input data is specifically testing the backfill of old values, not representing current fixture conventions. The verifier should assess whether this is a deviation from AC2's intent.
3. **`ana-setup.md` prose "accept" untouched**: Per spec, English prose uses of "accept" (e.g., "accept it", "accept the rest") in `ana-setup.md` templates are intentionally not renamed. The spec explicitly warns about these false positives.

Verified complete by second pass.
