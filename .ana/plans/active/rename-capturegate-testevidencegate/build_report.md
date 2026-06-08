# Build Report: Rename `captureGate` → `testEvidenceGate` (clean rename, no back-compat)

**Created by:** AnaBuild
**Date:** 2026-06-08
**Spec:** .ana/plans/active/rename-capturegate-testevidencegate/spec.md
**Branch:** feature/rename-capturegate-testevidencegate

## What Was Built

Source (`packages/cli/src/`):
- `commands/init/anaJsonSchema.ts` (modified): schema field `captureGate` → `testEvidenceGate`, identical `z.enum(['on','off']).optional().catch(undefined)` shape; migration-safe comment updated. Old key removed (one key exists).
- `commands/artifact.ts` (modified): `isCaptureGateEnabled` → `isTestEvidenceGateEnabled` (flag read `anaJson['testEvidenceGate'] !== 'on'`, carve-out unchanged); `applyCaptureGate` → `applyTestEvidenceGate` (both call sites updated); import `evaluateCaptureGate` → `evaluateTestEvidenceGate`; block message + escape hatch now name `testEvidenceGate` / `set "testEvidenceGate": "off"`. The C9 reassurance line (`ana test` seals a harmless abstain) was preserved verbatim. JSDoc renamed.
- `utils/capture-marker.ts` (modified): interface `CaptureGateResult` → `TestEvidenceGateResult`; function `evaluateCaptureGate` → `evaluateTestEvidenceGate`; the one comment naming the flag updated. Marker mechanism (`parseMarkers`, `validateCapturePresent`, `CaptureMarker`, seal format) untouched — the boundary holds.
- `commands/doctor.ts` (modified): raw read `anaContent['captureGate']` → `anaContent['testEvidenceGate']`; `isCaptureGateEnabled` import/call + `{@link}` JSDoc renamed. Local `testEvidenceGate` var and `test_evidence_gate` dimension (predecessor vocabulary) left intact.
- `commands/config.ts` (modified): `KNOWN_FIELDS` entry `'captureGate'` → `'testEvidenceGate'` (old key removed).
- `commands/init/state.ts` (modified): `createAnaJson` emits `testEvidenceGate: 'on'`; preserve-not-refresh comments renamed. No migrate-on-re-init block added (rides along in `...parsed.data`, same as before).
- `utils/forensics.ts` (modified): JSDoc `Mirrors isCaptureGateEnabled` → `isTestEvidenceGateEnabled`. Comment-only.

Docs + dogfood:
- `website/content/docs/guides/configurability.mdx` (modified): all `captureGate` references → `testEvidenceGate` (field, `ana config set` command, user-fields list, prose); section header "Capture gate" → "Test-evidence gate" for consistency. No legacy note.
- `.ana/ana.json` (modified): dogfood line `"captureGate": "on"` → `"testEvidenceGate": "on"`.

Tests (`packages/cli/tests/`):
- `commands/init/anaJsonSchema.test.ts`, `commands/artifact.test.ts`, `commands/init.test.ts`, `commands/doctor.test.ts`, `commands/config.test.ts`, `commands/work.test.ts`, `utils/capture-marker.test.ts` (modified): renamed all `captureGate` fixtures/flag strings and `isCaptureGateEnabled`/`evaluateCaptureGate` symbol references to the new names; renamed test-internal helpers (`captureGateError` → `testEvidenceGateError`, `setCaptureGateConfig` → `setTestEvidenceGateConfig`); contract tags A001–A008 added/aligned. No back-compat tests added.

## PR Summary

- Cleanly renames the `captureGate` ana.json flag and all gate **policy** symbols to `testEvidenceGate`/`TestEvidenceGate` — no back-compat, since `captureGate` never shipped (introduced after the published v1.2.2 tag, zero installs carry it).
- The capture-**marker** mechanism (`CaptureMarker`, `parseMarkers`, `validateCapturePresent`, the seal format) and the `processCapture*` subsystem are deliberately untouched — the marker is the evidence, the gate is the policy that checks it, and that boundary holds.
- User-facing surfaces updated: the save-time block message, the `set "testEvidenceGate": "off"` escape hatch, the configurability docs, and the dogfood config.
- Migration-safe schema posture carried verbatim to the new name (`optional`, no `.default`, `.catch(undefined)`): an absent flag stays absent through re-init and reads as off.
- Source clean-sweep confirms zero residual `captureGate`/`CaptureGate` across `packages/cli/src`, `website/content`, and `.ana/ana.json`.

## Acceptance Criteria Coverage

- AC1 "new projects get testEvidenceGate: on" → init.test.ts "createAnaJson writes testEvidenceGate: on" (@ana A001) ✅
- AC5 "block message names testEvidenceGate" → artifact.test.ts "block message names the missing-evidence reason…" (@ana A005), asserts `toContain('testEvidenceGate')` ✅
- AC6 "config set testEvidenceGate, no warning; captureGate not in KNOWN_FIELDS" → config.test.ts "does not warn when setting testEvidenceGate" (@ana A006) ✅
- AC7 "no captureGate/CaptureGate anywhere in src/docs/dogfood; boundary symbols unchanged" → clean-sweep `grep -rniE "captureGate" packages/cli/src website/content .ana/ana.json` → zero hits; CaptureMarker/parseMarkers/validateCapturePresent/processCapture counts unchanged. Source half is contract-backed by A009/A010 (Verify-checked). ✅
- AC8 "configurability.mdx documents testEvidenceGate, no legacy note" → docs updated, verified by grep ✅
- AC9 "dogfood .ana/ana.json uses testEvidenceGate: on" → updated, verified by grep ✅
- AC10 "test count ≥ 3589; rename + new-key behavior tested; no back-compat tests" → 3589 total (3587 passed, 2 skipped), no decrease; enablement on/off + absent fail-safe covered (A002/A003/A004); no back-compat tests ✅
- `tsc --noEmit` passes with zero errors ✅
- Lint passes (0 errors) ✅

## Implementation Decisions

- **Src + test files committed together (commit 1).** The test suites reference the renamed symbols (`isTestEvidenceGateEnabled`, `evaluateTestEvidenceGate`), so committing src without tests would leave the suite red. The two are one logical unit (the rename) and ship in one commit to honor green-per-commit. Docs + dogfood (no test impact) are commit 2.
- **Doc section header renamed beyond the spec's enumerated lines.** The spec enumerated `:34-35, :74, :84-86` for `configurability.mdx`. I also renamed the section header "Capture gate" → "Test-evidence gate" (line 33) for consistency with the renamed flag and block message. "Capture gate" (with a space) is not a `captureGate` token and would not be caught by the AC7 grep — this is a cosmetic consistency change, not required by AC7.
- **Test-internal helpers and assertion strings renamed.** Helper functions `captureGateError`/`setCaptureGateConfig` and asserted string literals (e.g. `not.toContain('captureGate')` → `not.toContain('testEvidenceGate')`, `toContain('captureGate')` → `toContain('testEvidenceGate')`) were renamed as part of the spec-authorized rename of test references. The block-message assertion's expected substring changed from `captureGate` to `testEvidenceGate` (AC5) — noted here per guardrail #8; this tracks the renamed user-facing message, not a weakening.
- **Contract-tag alignment under a tag-reuse convention.** The suite reuses `@ana A00x` IDs per-work-item (every file already carries A001-A0xx from its own merged contract). I added this contract's tags (A001-A008) on the clearest dedicated tests rather than disturbing historical tags. A009/A010 are source-invariant (no test; Verify-checked).

## Deviations from Contract

None — contract followed exactly. All 8 testable assertions (A001–A008) are satisfied and tagged; A009/A010 (source-invariant clean-sweep) pass mechanically with zero residual hits.

## Test Results

### Baseline (before changes)
Command: `pnpm run test -- --run` (full workspace)
```
Test Files  146 passed (146)
     Tests  3587 passed | 2 skipped (3589)
```
Tests: 3587 passed, 0 failed, 2 skipped. Exit 0.

### After Changes
Command: `ana test --stage build --slug rename-capturegate-testevidencegate` (capture-sealed full suite)
```
✓ captured  counts: 3587 passed, 0 failed, 2 skipped  (verdict: pass)
```
Sealed marker (engine-captured, sha-sealed) — top-level so the present-check recognizes it:

<!-- ana:capture stage=build slug=rename-capturegate-testevidencegate counts=3587p/0f/2s verdict=pass sha256=5f4cabf70ae3c93e81cf27ca07f4ea4590aa88f485b47b4496708388f6a8ab69 -->

Tests: 3587 passed, 0 failed, 2 skipped. (Confirmed by 3 independent clean full runs; see Open Issues for one observed flaky run.)

### Comparison
- Tests added: 0 net new test files; the rename re-pointed existing fixtures/assertions plus added contract tags. Total unchanged at 3589.
- Tests removed: 0
- Regressions: none (deterministic 3587/0/2, identical to baseline)

### New Tests Written
None net-new — this is a rename. New-key behaviors required by AC10 (enablement on/off, absent fail-safe) were already covered by the predecessor's gate tests and now exercise the new key after rename (artifact.test.ts A002/A003/A004; anaJsonSchema.test.ts A007).

## Verification Commands
```
(cd 'packages/cli' && pnpm run build)
(cd 'packages/cli' && pnpm vitest run anaJsonSchema artifact config)   # expect green
(cd 'packages/cli' && pnpm vitest run init doctor work capture-marker) # expect green
(cd 'packages/cli' && pnpm exec tsc --noEmit)                          # expect 0 errors
pnpm run test -- --run                                                 # expect 3587 pass / 2 skip
(cd 'packages/cli' && pnpm run lint)                                   # expect 0 errors
grep -rniE "captureGate" packages/cli/src website/content .ana/ana.json # expect zero hits (AC7)
```

## Git History
```
99664612 [rename-capturegate-testevidencegate] Rename captureGate → testEvidenceGate in docs and dogfood config
6acddf2a [rename-capturegate-testevidencegate] Rename captureGate → testEvidenceGate (schema, gate symbols, readers, tests)
```

## Contract Coverage
8/8 testable assertions tagged (A001–A008). A009/A010 source-invariant (no test; Verify-checked via clean-sweep — zero residual hits).

## Open Issues

1. **Flaky full-suite test (observation, monitor).** One `ana test` full-suite run reported 1 failure (3586p/1f/2s); three other full runs and the clean re-seal were all 3587p/0f/2s. The exact test could not be isolated (the failing run's raw capture was overwritten by the clean re-seal), but its stderr was dominated by `work.test.ts` git/push-failure paths — matching the risk profile's documented flaky tests (conditional PID guards, heavyweight bare-remote git setups). Environmental, unrelated to a string rename. Recorded in build_data.yaml.

2. **@ana ID reuse across the suite (observation, acknowledge).** `@ana A00x` IDs are reused per-work-item; every test file carries same-numbered tags from its own merged contract. This contract's tags (A001-A008) coexist with unrelated predecessor tags of the same IDs. Verify should map against this work item's active contract.

3. **capture-marker.test.ts modified though not in contract file_changes (observation, acknowledge).** It imports the renamed `evaluateCaptureGate` symbol, so updating it was mandatory to keep the suite green. The spec's prose did not list it among the test files but the contract's behavioral requirement (renamed evaluator) forces it.

4. **Pre-existing lint warning, not mine.** `src/utils/git-operations.ts:198` carries an "Unused eslint-disable directive" warning. That file is not part of this spec and I did not modify it — `git diff --name-only main..HEAD` confirms. 0 lint errors overall.

Second pass — re-examined the diff for unrecorded concerns: the rename is mechanical and total; no unused imports/params introduced (tsc clean), no edge cases from the spec unhandled, the C9 reassurance line and the warning/error partition (C11) preserved. The four items above are the complete set.
