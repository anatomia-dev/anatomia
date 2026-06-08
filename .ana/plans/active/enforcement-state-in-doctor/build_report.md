# Build Report: Move enforcement-gate state from `ana work status` to `ana doctor`

**Created by:** AnaBuild
**Date:** 2026-06-08
**Spec:** .ana/plans/active/enforcement-state-in-doctor/spec.md
**Branch:** feature/enforcement-state-in-doctor

## What Was Built

- **`packages/cli/src/commands/work.ts`** (modified): Removed everything that fed only the capture-gate readout — the `Capture gate:` print line in `printHumanReadable`, the `formatCaptureGateState` helper + JSDoc, the `captureGate`/`captureGateActive` fields on the `StatusOutput` interface, the inline `captureGate` parse and the `captureGateActive = isCaptureGateEnabled(...)` call in `getWorkStatus`, the gate fields at all three JSON-output sites (main, empty-slugs JSON, empty-slugs notifications), and the now-unused `isCaptureGateEnabled` import. Kept the `lastScanAt` inline read (scan-freshness still needs it). `grep captureGate` now returns zero in this file.
- **`packages/cli/src/commands/doctor.ts`** (modified): Added the `EnforcementDimension` interface (`status: 'info'` literal, not `DimensionStatus`); an `assessEnforcement(projectRoot)` assessor mirroring `assessSurfaces`' once-only null-guarded read; `enforcement` on the `DoctorDimensions` interface; the `assessEnforcement` call + inclusion in `runDoctor`; and the Enforcement render block in `formatTerminalOutput` (after surfaces/legacy, before stale work) using a neutral gray `ℹ` and column-aligned sub-lines. Imported `isCaptureGateEnabled` from `./artifact.js`. Exported `formatTerminalOutput` for testing (see Deviations).
- **`packages/cli/src/commands/config.ts`** (modified): Added `captureGate`, `processCapture`, `processCaptureStrict` to the `KNOWN_FIELDS` set.
- **`packages/cli/tests/commands/work.test.ts`** (modified): Repurposed the four `capture gate status readout` cases into absence assertions (`describe('capture gate state is absent from work status')`) — net test count unchanged.
- **`packages/cli/tests/commands/doctor.test.ts`** (modified): Added an `enforcement dimension` describe block (11 new tests) covering on / on-inactive / off, process_capture, strict, info-status, overall-stays-pass, and the human-output Enforcement + inactive readout.
- **`packages/cli/tests/commands/config.test.ts`** (modified): Added three cases proving `config set` emits no "not a known ana.json field" warning for the three gate keys.

## PR Summary

- Relocates capture-gate state out of the high-frequency `ana work status` surface (human line + `--json` fields) into a new informational `Enforcement` dimension on `ana doctor`.
- The Enforcement dimension reports all three gates (test-evidence, process capture, strict) as one view; it carries a fixed `status: 'info'` and is structurally incapable of changing doctor's exit code.
- Fixes a pre-existing bug where `ana config set captureGate off` (and `processCapture`/`processCaptureStrict`) printed a spurious "not a known ana.json field" warning despite being real schema fields.
- Removes the redundant second parse of `ana.json` in `getWorkStatus` (closes finding `retire-capture-self-arming-C3`).
- **Breaking JSON contract change (intentional):** `work status --json` drops `captureGate`/`captureGateActive`; `doctor --json` gains an `enforcement` block.

## Acceptance Criteria Coverage

- AC1 "work status no longer prints gate state" → work.test.ts "human output omits the gate line…" (3 tests, A001) ✅
- AC2 "work status --json drops both fields" → work.test.ts "--json omits captureGate and captureGateActive…" (A002, A003) ✅
- AC3 "doctor human shows Enforcement incl. inactive" → doctor.test.ts "human output renders an Enforcement section" + "…inactive test-evidence gate readout" (A011, A012) ✅
- AC4 "doctor --json carries enforcement block" → doctor.test.ts "includes an enforcement dimension in results" (A005); structure flows through `DoctorResults.dimensions` ✅
- AC5 "Enforcement never exits non-zero" → doctor.test.ts "always carries status info…" + "does not make overall fail…" (A013, A014, A015) ✅
- AC6 "config set gate keys no warning" → config.test.ts three cases (A016, A017, A018) ✅
- AC7 "inline read no longer parses captureGate; lastScanAt unchanged" → verified by `grep captureGate work.ts` = 0; `lastScanAt` read retained in same try/catch; scan-freshness tests still pass ✅
- AC8 "test count does not decrease; work tests repurposed; doctor covers new dimension incl. inactive" → package 3573→3587 (+14); work block repurposed not deleted; doctor inactive case covered ✅
- "grep captureGate work.ts == 0" → confirmed (0 matches) ✅
- "isCaptureGateEnabled remains exported from artifact.ts" → confirmed, body unchanged; doctor.ts is now its consumer ✅
- "vitest passes; lint passes (no unused-import)" → 3587 passed / 0 failed; lint 0 errors ✅

**Contract coverage: 18/18 assertions tagged** (A001–A004 in work.test.ts; A005–A015 in doctor.test.ts; A016–A018 in config.test.ts).

## Implementation Decisions

- **Exported `formatTerminalOutput` from doctor.ts.** The contract's A011/A012 target `doctorHumanOutput` (the rendered dashboard), but the formatter was module-private and the existing doctor.test.ts only exercises `runDoctor`. I exported `formatTerminalOutput` — mirroring the existing "exported for testing" rationale on `runDoctor` — so the two human-output assertions get deterministic unit coverage without a subprocess harness. Pure function, no behavior change.
- **Read count in `assessEnforcement` = 2, as the spec prescribed.** One raw `JSON.parse` for `captureGate`/`processCapture`/`processCaptureStrict`, plus one `isCaptureGateEnabled(projectRoot)` call (which re-reads) for the active/inactive carve-out. Did not reimplement the carve-out inline (would duplicate the artifact.ts logic) and did not call the trivial `isProcessCapture*` helpers (read those flags from the single raw parse instead).
- **Column alignment via `padEnd(20)`.** The three labels ("test-evidence gate" = 18 chars being the longest) pad to a 20-col field under a 6-space indent, matching the spec mockup exactly (verified by rendering all four states).

## Deviations from Contract

### Exporting `formatTerminalOutput` (not a contract assertion change)
**Instead:** A011/A012 are satisfied by unit-testing the now-exported `formatTerminalOutput` rather than a subprocess invocation of `ana doctor`.
**Reason:** The formatter was private; the contract target `doctorHumanOutput` is the rendered string. Exporting it (consistent with `runDoctor`) keeps the test deterministic and in-process.
**Outcome:** Functionally equivalent — the exported function is exactly what the command action handler prints. Verifier should assess.

No contract assertion's target/matcher/value was weakened or changed. All 18 are addressed as specified.

## Test Results

### Baseline (before changes)
Command: `pnpm vitest run` (in `packages/cli`)
```
 Test Files  146 passed (146)
      Tests  3573 passed | 2 skipped (3575)
```

### After Changes
Command: `ana test --stage build --slug enforcement-state-in-doctor`
```
✓ captured  counts: 3587 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=enforcement-state-in-doctor counts=3587p/0f/2s verdict=pass sha256=b287caa31a69fe1819df83ce5ea763b06c9dc084df75d2ce2ea64f6612198d17 -->

Per-file checkpoints (all green):
- `work.test.ts`: 238 passed
- `doctor.test.ts`: 51 passed (40 existing + 11 new)
- `config.test.ts`: 45 passed (42 existing + 3 new)

### Comparison
- Tests added: 14 (11 doctor + 3 config; work.test.ts block repurposed in place, count unchanged)
- Tests removed: 0
- Regressions: none

### New Tests Written
- `doctor.test.ts` → `enforcement dimension`: existence, on/on-inactive/off classification, process_capture, process_capture_strict, all-off default, `status: 'info'` (never fail), overall stays `pass`, human Enforcement section, human inactive readout.
- `config.test.ts`: no "not a known" warning for `captureGate`, `processCapture`, `processCaptureStrict`.
- `work.test.ts` (repurposed): gate line absent from human output (on / inactive / absent), and `--json` omits both gate fields while retaining `artifactBranch`.

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run tests/commands/work.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/doctor.test.ts)
(cd packages/cli && pnpm vitest run tests/commands/config.test.ts)
(cd packages/cli && pnpm vitest run)
(cd packages/cli && pnpm run lint)
```
Confirm zero matches: `grep captureGate packages/cli/src/commands/work.ts`
Confirm export retained: `grep "export function isCaptureGateEnabled" packages/cli/src/commands/artifact.ts`
Confirm no templates consumer: `grep -rn captureGate packages/cli/templates/`

## Git History
```
3fc3b666 [enforcement-state-in-doctor] Add gate keys to config KNOWN_FIELDS
260a4ff0 [enforcement-state-in-doctor] Add Enforcement dimension to doctor
fc24a402 [enforcement-state-in-doctor] Remove capture-gate readout from work status
```

## Open Issues

1. **Pre-existing `@ana` ID collision in doctor.test.ts** (observation). The existing doctor.test.ts tests carry `@ana` tags (A001–A033) from a prior doctor contract. The current contract reuses A005–A015 for the Enforcement assertions, so the file now contains duplicate `@ana A005`/`A006`/… tags pointing at unrelated tests. I did NOT strip the old tags (proof-context finding flags tag-stripping as traceability debt). The verifier runs each assertion mechanically, so coverage is unaffected, but tag-based traceability for this file is now ambiguous. Suggested action: monitor — a project-wide convention for per-build ID namespacing would resolve it.

2. **Finding `retire-capture-self-arming-C3` is closed by this build** (observation). The double-parse of `ana.json` in `getWorkStatus` is gone — the inline `captureGate` parse and the `captureGateActive`/`isCaptureGateEnabled` call both left `work.ts`. The remaining inline read is the single, necessary `lastScanAt` read.

Second pass — what I noticed but did not write down:
- `assessEnforcement` reads `ana.json` while `assessSurfaces`, `assessScanFreshness`, and `assessContext` each independently parse the same file (pre-existing debt noted in the risk profile, doctor.ts finding). This build adds one more independent read rather than threading a shared parse. Deliberate: matches the established per-assessor pattern; consolidating is out of scope. Recorded as an observation in build_data.yaml.

No other concerns. The three source changes are minimal and the deletion is total (grep-verified); tests meaningfully assert the relocated behavior in both its old (absent) and new (present) homes.
