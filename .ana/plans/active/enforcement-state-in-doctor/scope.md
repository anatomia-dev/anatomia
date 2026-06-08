# Scope: Move enforcement-gate state from `ana work status` to `ana doctor`

**Created by:** Ana
**Date:** 2026-06-08

## Intent

`ana work status` unconditionally prints `Capture gate: <state>` as its first content line (`work.ts:348`). Every agent runs `work status`, but the gate's state **does not change how any agent behaves** — it's mechanically enforced at the action (`applyCaptureGate` → `process.exit(1)` at `ana artifact save build-report`, `artifact.ts:860`). The agent learns at the moment it matters and is told exactly what to do. Foreknowledge in `work status` is pure chrome.

The same logic applies to the two sibling gates added in `cross-machine-provenance` (merged this cycle): `processCapture` (records provenance) and `processCaptureStrict` (blocks at `ana work complete`, `work.ts:1143`). Neither should leak into `work status` either.

This scope **moves** that state — it is not a delete. Config/enforcement health is something a human checks deliberately, which is what `ana doctor` is for. After this change: `work status` is pipeline state + next actions only; `ana doctor` gains one coherent **Enforcement** view covering all three gates.

(GitHub issue #300. The rename of `captureGate` — also raised in #300 — is deliberately split into a separate scope, `rename-capturegate-testevidencegate`, which depends on this one.)

## Complexity Assessment

- **Kind:** feature
- **Size:** small
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/work.ts` — remove the gate line, the `formatCaptureGateState` helper, the `StatusOutput` gate fields, the 3 JSON-output gate fields, and the now-dead inline `ana.json` read of `captureGate`.
  - `packages/cli/src/commands/doctor.ts` — add an `Enforcement` dimension (interface + assessor + wiring + terminal formatting + `--json`).
  - `packages/cli/src/commands/config.ts` — add `captureGate`, `processCapture`, `processCaptureStrict` to `KNOWN_FIELDS` (`config.ts:44`) so `ana config set captureGate off` stops firing a spurious "unknown key" warning.
  - `packages/cli/tests/commands/work.test.ts` — drop/adjust assertions on the removed gate line.
  - `packages/cli/tests/commands/doctor.test.ts` — add Enforcement-dimension coverage.
- **Blast radius:**
  - `ana work status --json` **loses** the `captureGate` / `captureGateActive` fields; `ana doctor --json` **gains** an `enforcement` block. This is an intentional contract relocation. #300's premise is that no agent reads these for behavior; confirm no pipeline agent template depends on the `work status --json` gate fields (grep of `templates/` found none).
  - `isCaptureGateEnabled` (exported from `artifact.ts`) is currently imported by `work.ts`; after this change `work.ts` no longer needs it, and `doctor.ts` becomes its new consumer. The function itself is unchanged.
- **Estimated effort:** ~half a day. Mostly deletion in work.ts + one new doctor dimension mirroring an established pattern.
- **Multi-phase:** no

## Approach

Two coordinated moves plus one bug fix:

1. **Subtract from `work status`.** Delete the `Capture gate:` line and everything that fed only it — the `formatCaptureGateState` helper, the `captureGate`/`captureGateActive` fields on `StatusOutput` and in all three JSON-output sites, and the inline `ana.json` read that exists *only* to populate them. Keep the `lastScanAt` read (scan-freshness still needs it). This is the elegant-solution-removes principle: the line goes away, and so does the redundant second parse of `ana.json` (finding `retire-capture-self-arming-C3`).

2. **Add an Enforcement dimension to `ana doctor`.** One new dimension, built like the existing six (`assessEnforcement` → `EnforcementDimension` → wired into `runDoctor`, `formatTerminalOutput`, and `--json`). It reports all three gates as one "enforcement state" group: the test-evidence gate (on / off / on-but-inactive-no-test-command, reusing `isCaptureGateEnabled` for the active check), `processCapture` (on/off), and `processCaptureStrict` (on/off). Status is informational (never `fail` — these are valid configurations, not health problems), so it reads green/neutral and never changes doctor's exit code.

3. **Fix the `KNOWN_FIELDS` gap.** The three gate keys are missing from `config.ts:44`, so the documented command `ana config set captureGate off` currently warns "unknown key." Add all three.

Strategy only — exact dimension wording, the green/neutral glyph choice, and JSON shape are Plan's call.

## Acceptance Criteria

- AC1: `ana work status` (human output) no longer prints the `Capture gate:` line or any gate state; output is pipeline state + next actions only.
- AC2: `ana work status --json` no longer contains `captureGate` or `captureGateActive` fields.
- AC3: `ana doctor` (human output) shows an Enforcement section reporting the test-evidence gate state including the `on (inactive — no test command configured)` case, plus `processCapture` and `processCaptureStrict`.
- AC4: `ana doctor --json` carries the equivalent enforcement block.
- AC5: The Enforcement dimension never causes `ana doctor` to exit non-zero (valid config is not a health failure).
- AC6: `ana config set captureGate off` (and the same for `processCapture`, `processCaptureStrict`) no longer prints an "unknown key" warning.
- AC7: The inline `ana.json` read in `getWorkStatus` no longer parses for `captureGate`; `lastScanAt`/scan-freshness behavior is unchanged.
- AC8: Test count does not decrease; work-status tests updated for the removed line; doctor tests cover the new dimension including the inactive case.

## Edge Cases & Risks

- **Inactive gate readout.** `captureGate: "on"` with no resolvable test command must still render distinctly in doctor as inactive (the carve-out where it never blocks) — don't collapse it to a plain "on." `isCaptureGateEnabled` already encodes flag-on-AND-test-command-resolves; reuse it, don't reimplement.
- **Absent flags.** All three flags are `optional` with no schema default (absent reads as off / records-nothing). Doctor must render the absent case without crashing — null-guard the `ana.json` read like the other doctor assessors do.
- **JSON contract relocation.** Removing the gate fields from `work status --json` is a breaking shape change for any consumer reading them. Verified no template depends on it; Plan should re-confirm and the change should be called out in the build report.
- **Doctor exit code.** Enforcement is informational. A mis-classification that returns `fail` would flip doctor's exit code and could break CI that runs `ana doctor`. Keep it out of the `hasRed` computation (`doctor.ts:691`).
- **Don't double-read in doctor.** Doctor already reads `ana.json` in several assessors. Prefer reading it once for the enforcement flags rather than adding yet another parse (the very smell this scope removes from work.ts).

## Rejected Approaches

- **Delete the gate line outright (no doctor home).** Rejected — the inactive-gate case is genuinely worth surfacing *somewhere* a human looks; deleting with no relocation loses a real signal. The issue explicitly frames this as a move.
- **Keep it in `work status` but gate it behind a flag/condition.** Rejected — every condition still spends a line agents read on every status call; the state belongs in the deliberate health surface, not the high-frequency pipeline surface.
- **Surface only `captureGate` in doctor, leave the provenance pair.** Rejected — the three are one enforcement family; #300 calls for the coherent view, and grouping them now sets the pattern before the family grows.

## Open Questions

- None blocking. One judgment call for Plan: the exact glyph/*status* for the Enforcement dimension (a neutral `ℹ`/`·` vs. a green `✓`) — informational, never `✗`. Recommend neutral.

## Exploration Findings

### Patterns Discovered
- `work.ts:346-348` — `printHumanReadable` prints the gate line first, unconditionally. The helper is `formatCaptureGateState` (`work.ts:339-344`).
- `work.ts:64-77` — `StatusOutput` interface carries `captureGate` + `captureGateActive`.
- `work.ts:500-514` — inline `ana.json` read populating `lastScanAt` AND `captureGate`; `captureGateActive` comes from `isCaptureGateEnabled(projectRoot)` (a *second* parse of the same file — finding `retire-capture-self-arming-C3`).
- `work.ts:528-529, 540-541, 584-585` — the gate fields appear in all three JSON-output construction sites (empty-slugs JSON, empty-slugs notifications, and the main output).
- `doctor.ts:102-122` — `DoctorDimensions` / `DoctorResults` / `DoctorJson` shapes; new dimension plugs in here.
- `doctor.ts:678-709` — `runDoctor` orchestration; `doctor.ts:541-637` — `formatTerminalOutput` (per-dimension ✓/○/✗ lines); `doctor.ts:691-694` — `hasRed` exit-code computation (Enforcement must stay out of this).

### Constraints Discovered
- [TYPE-VERIFIED] `isCaptureGateEnabled` (`artifact.ts`, imported `work.ts:36`) — encodes "flag on AND a test command resolves." Reuse for the active/inactive readout.
- [TYPE-VERIFIED] `captureGate` schema (`anaJsonSchema.ts:105-108`) — `z.enum(['on','off']).optional().catch(undefined)`, no default; absent must read as off. `processCapture`/`processCaptureStrict` identical (`:112-123`).
- [OBSERVED] `config.ts:44 KNOWN_FIELDS` omits `captureGate`, `processCapture`, `processCaptureStrict` — pre-existing bug; docs tell users to run `ana config set captureGate "off"` (`configurability.mdx:35`) which warns today.

### Test Infrastructure
- `packages/cli/tests/commands/work.test.ts` — existing work-status assertions (some reference the gate line — update, don't just delete, to keep count steady).
- `packages/cli/tests/commands/doctor.test.ts` — existing doctor dimension tests; mirror their fixture style for the Enforcement dimension. `runDoctor` is exported specifically for this kind of unit test (`doctor.ts:678`).

## For AnaPlan

### Structural Analog
`assessSurfaces` / `SurfacesDimension` in `doctor.ts:368-421` — a dimension that reads `ana.json`, classifies state, and formats a multi-part line with sub-conditions. The Enforcement dimension has the same shape (read flags → classify → format a grouped line). Build it the same way. **Read this first.**

### Functional Analog
`formatCaptureGateState` (`work.ts:339-344`) — the existing on/off/inactive string logic being *removed* from work.ts. Its three-way classification is exactly what the doctor dimension needs to express for the test-evidence gate; lift the logic, don't reinvent it.

### Relevant Code Paths
- Remove from: `work.ts:64-77` (interface), `:339-344` (helper), `:348` (print line), `:500-514` (inline read — keep `lastScanAt`), `:528-529/:540-541/:584-585` (JSON fields).
- Add to: `doctor.ts` dimension assessor + `DoctorDimensions` (`:102-109`) + `runDoctor` (`:678-709`) + `formatTerminalOutput` (`:541-637`), keeping it out of `hasRed` (`:691`).
- Fix: `config.ts:44`.

### Patterns to Follow
- Doctor dimension assembly: `assessSurfaces` and its terminal block (`doctor.ts:609-623`).
- `ana.json` null-guarded read inside an assessor: `assessSurfaces` (`doctor.ts:372-377`) reads raw JSON with a try/catch fallback — do the enforcement read once, the same way.

### Known Gotchas
- Three JSON-output sites in work.ts, not one — miss one and the field lingers in a branch. Grep `captureGate` in work.ts after editing; it should return zero.
- After removing the work.ts usage, drop the now-unused `isCaptureGateEnabled` import from work.ts (lint will flag it) — but keep the export in artifact.ts; doctor now imports it.
- Keep the `lastScanAt` read when deleting the inline parse — scan-freshness depends on it.
- Enforcement dimension must not push doctor's overall verdict to `fail`.

### Things to Investigate
- Decide the Enforcement dimension's neutral status representation so it reads as informational, not pass/fail (design judgment — recommend a neutral glyph).
- Confirm one-read-of-`ana.json` in doctor for the three flags rather than adding a fresh parse alongside the existing assessor reads.
