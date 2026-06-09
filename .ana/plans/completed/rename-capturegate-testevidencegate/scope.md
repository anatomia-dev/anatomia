# Scope: Rename `captureGate` → `testEvidenceGate` (clean rename — no back-compat)

**Created by:** Ana
**Date:** 2026-06-08
**Revised:** 2026-06-08 — back-compat layer removed (see note below)

> **Revision note:** An earlier draft of this scope mandated a legacy fallback (keep `captureGate`, `testEvidenceGate ?? captureGate` read, migrate-on-re-init). **That was wrong.** Verified via git: `captureGate` was introduced 2026-06-06, four days *after* the published `v1.2.2` tag (2026-06-02), and is absent from that tag. The entire capture-gate family is **unreleased — zero customers have it.** There is no install base to be compatible with, so the back-compat machinery is pure scaffolding. This is a clean rename: delete the old name, done. *The elegant solution removes.*

## Intent

The `ana.json` flag `captureGate` doesn't describe what it does — it gates whether a `build_report.md` save must carry **real captured test-run evidence**. Worse, "capture" is *overloaded*: it names this subsystem (the "capture marker" / seal that proves tests ran) **and** the unrelated provenance subsystem (`processCapture` / `processCaptureStrict`, the harness payload). Two different things wearing one word.

**The disease:** the flag name is opaque *and* collides with a second subsystem's vocabulary. Rename `captureGate` → `testEvidenceGate`. That single rename does double duty: it makes the flag self-describing, and it de-overloads "capture" **by subtraction** — once `captureGate` is gone, `processCapture*` becomes the sole, unambiguous owner of "capture" in `ana.json`.

Because the flag never shipped, the rename is total: `captureGate` is *replaced*, not aliased. No fallback, no migration, no legacy key anywhere.

(GitHub issue #300, the rename half. **Depends on `enforcement-state-in-doctor`** (already merged, `c9ff2880`) — that scope removed the work-status gate readout and stood up the `ana doctor` Enforcement view; this scope renames the field and the gate symbols that survive, including the ones that scope introduced in doctor.)

## Complexity Assessment

- **Kind:** chore
- **Size:** small
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/init/anaJsonSchema.ts` — **replace** the `captureGate` enum field with `testEvidenceGate` (identical `optional().catch(undefined)` posture). Do **not** keep `captureGate`.
  - `packages/cli/src/commands/init/state.ts` — `createAnaJson` emits `testEvidenceGate: 'on'` (`state.ts:572`); update the preserve-not-refresh comments (`:571-572, :742`). **No migrate-on-re-init logic** — nothing to migrate.
  - `packages/cli/src/commands/artifact.ts` — rename `isCaptureGateEnabled` → `isTestEvidenceGateEnabled` (reads `testEvidenceGate` only), `evaluateCaptureGate` → `evaluateTestEvidenceGate`, `applyCaptureGate` → `applyTestEvidenceGate`; update the block/escape-hatch messages (`:860-872`) to name `testEvidenceGate`.
  - `packages/cli/src/commands/capture-marker.ts` → `packages/cli/src/utils/capture-marker.ts` — rename the two gate-side symbols `evaluateCaptureGate` → `evaluateTestEvidenceGate` and the result type `CaptureGateResult` → `TestEvidenceGateResult`; fix the one flag-name comment (`:241`). Marker mechanism untouched (see boundary).
  - `packages/cli/src/commands/doctor.ts` — read `testEvidenceGate` directly (the raw tri-state for on/inactive); rename the `isCaptureGateEnabled` import/call. The `test_evidence_gate` dimension field/var already carry target vocabulary (from Scope A) — leave them.
  - `packages/cli/src/commands/config.ts` — in `KNOWN_FIELDS`, **replace** `captureGate` with `testEvidenceGate`. Remove `captureGate`.
  - `packages/cli/src/utils/forensics.ts` — JSDoc comment fix (`:252`, `Mirrors isCaptureGateEnabled` → `isTestEvidenceGateEnabled`).
  - `.ana/ana.json` — dogfood: change our own `captureGate: "on"` (`:52`) to `testEvidenceGate: "on"`. A one-line edit to a file we control, not a migration.
  - `website/content/docs/guides/configurability.mdx` — replace all `captureGate` references (`:34-35, :74, :84, :86`) with `testEvidenceGate`. **No "legacy key honored" note** — there is no legacy key.
  - Tests: `anaJsonSchema.test.ts`, `artifact.test.ts`, `init.test.ts`, `doctor.test.ts`, `config.test.ts`, `work.test.ts` — rename references. **No back-compat tests** (no fallback, precedence, or convergence to cover).
- **Blast radius:** internal only. The `ana.json` field changes, but it has no install base — no customer config carries `captureGate`. Everything else is type-checked symbols or docs. Our own dogfood `ana.json` is a one-line edit.
- **Estimated effort:** ~2-3 hours. Pure mechanical rename, fully caught by `tsc --noEmit`. No design seam left (the migration question is moot).
- **Multi-phase:** no

## Approach

A clean rename across three layers, with a hard boundary on the fourth. No back-compat — the flag is unreleased, so the old name is *deleted*, not aliased.

1. **The `ana.json` field.** Replace `captureGate` with `testEvidenceGate` in the schema (same `optional` + no-default + `.catch(undefined)` posture). The reader reads `testEvidenceGate` only — no `??`, no precedence. `createAnaJson` emits the new key. No migrate-on-re-init step; there is nothing in the field to migrate from.

2. **Gate symbols (internal — rename freely, type-checked).** `isCaptureGateEnabled` → `isTestEvidenceGateEnabled`, `evaluateCaptureGate` → `evaluateTestEvidenceGate`, `applyCaptureGate` → `applyTestEvidenceGate`, and the result type `CaptureGateResult` → `TestEvidenceGateResult`. Zero contract cost; they *must* track the flag — leaving a `captureGate`-named symbol reading a `testEvidenceGate` value just relocates the opacity into the source.

3. **User-facing strings.** The block message and escape-hatch hint in `applyTestEvidenceGate` (`artifact.ts:866-872`) and the docs name `testEvidenceGate` (the escape hatch becomes `set "testEvidenceGate": "off"`). Keep the existing reassurance line about `ana test` sealing a harmless abstain (proof finding C9).

4. **The boundary — do NOT rename:** the *capture-marker* mechanism (`CaptureMarker`, `parseMarkers`, `validateCapturePresent`, the seal format — the evidence) and the *provenance* subsystem (`processCapture`, `processCaptureStrict`, `ana _capture`, the capture hooks). The gate is the **policy**; the capture marker is the **evidence** it checks. Only the gate evaluator + its result type rename inside `capture-marker.ts`; everything else there stays.

## Acceptance Criteria

- AC1: New projects get `testEvidenceGate: "on"` in `ana.json`; the serialized config contains no `captureGate` key.
- AC2: `isTestEvidenceGateEnabled` reads `testEvidenceGate` (`on` + a resolvable test command → enforces; absent/`off` → never blocks). No `captureGate` is read anywhere.
- AC3: The block message and escape-hatch hint name `testEvidenceGate` (`set "testEvidenceGate": "off"`), not `captureGate`.
- AC4: `ana config set testEvidenceGate off` works with no "unknown key" warning; `captureGate` is no longer in `KNOWN_FIELDS`.
- AC5: **No `captureGate` / `CaptureGate` string remains in `packages/cli/src`** — the rename is total. The capture-*marker* symbols (`CaptureMarker`, `parseMarkers`, `validateCapturePresent`) and `processCapture*` are untouched (unchanged grep counts).
- AC6: `configurability.mdx` documents `testEvidenceGate`; no reference to `captureGate` remains.
- AC7: The dogfood root `.ana/ana.json` reads `testEvidenceGate: "on"`.
- AC8: Test count does not decrease from baseline (3589); `tsc --noEmit` and lint pass clean.

## Edge Cases & Risks

- **Absent flag.** `testEvidenceGate` is `optional` + no default + `.catch(undefined)` — an absent flag stays absent through re-init and reads as off (gate never blocks). Preserve that posture exactly when replacing the field.
- **Don't widen the blast radius.** Tempting to also rename `processCapture*` or the capture-marker vocabulary "while we're here." Explicitly out of scope — renaming `processCapture*` without the `ana _capture` command/hooks at the same layer would *open* a flag-vs-mechanism gap.
- **Doctor's raw read.** `doctor.assessEnforcement` needs the bare `on/off/absent` value (to distinguish on vs on-inactive), which the boolean reader can't give. It reads `testEvidenceGate` directly. Since there's no fallback precedence anymore, a thin shared reader is optional — inline or a one-line helper, builder's choice; do not reintroduce a `??`.
- **Proof finding C9 (reassurance line).** The block message's "`ana test` seals a harmless abstain even when no tests run" line is load-bearing — keep it, just rename the flag references around it.
- **Proof finding C11 (warn/error partition).** The arming predicate relies on `evaluateTestEvidenceGate` routing all non-blocking messages to warnings — preserve that warning/error partition exactly through the rename.

## Rejected Approaches

- **Keep `captureGate` as a legacy fallback (the original draft of this scope).** Rejected after verification — `captureGate` is unreleased (introduced four days after the `v1.2.2` publish, absent from the tag), so there is no install base to be compatible with. A fallback read, dual `KNOWN_FIELDS`, and migrate-on-re-init would be complexity managing a non-existent problem. Delete the old name outright.
- **`requireTestEvidence` instead of `testEvidenceGate`.** Rejected — the field's values are `'on' | 'off'`, not booleans; `requireTestEvidence: "on"` reads redundantly and implies `true`/`false`. `ana.json`'s grammar is noun-phrases (`mergeStrategy`, `branchPrefix`), which `testEvidenceGate` matches.
- **Rename all three gates (`captureGate` + `processCapture` + `processCaptureStrict`) to a uniform scheme.** Rejected — renaming `captureGate` alone de-overloads "capture" by subtraction, and `processCapture*` are correctly bound to the `ana _capture` command/hooks at the same layer; renaming the flags without the command/hooks would open a worse gap than it closes.
- **Also rename the capture-marker mechanism.** Rejected — the marker is the evidence format (a coherent internal concept); churning it widens the diff and erases a useful policy/evidence layer boundary.

## Open Questions

- None. The migration question that drove the earlier draft is moot now that the flag is confirmed unreleased.

## Exploration Findings

### Patterns Discovered
- `anaJsonSchema.ts:105-108` — `captureGate: z.enum(['on','off']).optional().catch(undefined)`, no default. Copy this exact posture for `testEvidenceGate`, then delete the `captureGate` line.
- `state.ts:572` — `createAnaJson` emits `captureGate: 'on'`; `:571, :742` — preserve-not-refresh comments to update to the new name.
- `artifact.ts:850-879` — `applyCaptureGate` (the enforcement gate, `process.exit(1)`); reads enablement via `isCaptureGateEnabled`, evaluates via `evaluateCaptureGate`. Block message `:866`, escape-hatch hint `:872` name `captureGate`.
- `capture-marker.ts:57` — `CaptureGateResult` interface; `:252` — `evaluateCaptureGate`. Both rename. `:241` — the one flag-name comment.
- `configurability.mdx:34-35, 74, 84-86` — customer-facing field docs, including the literal `ana config set captureGate "off"` example.

### Constraints Discovered
- [VERIFIED] `captureGate` is **unreleased**: introduced commit `2d094c6e` (2026-06-06), four days after the `v1.2.2` tag (`77f31ca6`, 2026-06-02); `git grep captureGate v1.2.2 -- packages/cli/src` → 0. Published npm version is `1.2.2`. No customer config carries the key.
- [TYPE-VERIFIED] Gate symbols to rename, counts (grep `src/`): `isCaptureGateEnabled` (6), `evaluateCaptureGate` (3), `applyCaptureGate` (3), `CaptureGateResult` (2). (`captureGateActive`/`formatCaptureGateState` were removed by the merged predecessor scope, not this one.)
- [TYPE-VERIFIED] Boundary symbols that must NOT change: `CaptureMarker`, `parseMarkers`, `validateCapturePresent`, and all `processCapture`/`processCaptureStrict` references — distinct from the gate symbols, confirmed by grep; none contain the substring `captureGate`/`CaptureGate`, so a clean-sweep grep assertion is false-positive-safe.
- [OBSERVED] `config.ts` `KNOWN_FIELDS` — Scope A added `captureGate`; this scope replaces it with `testEvidenceGate`.
- [OBSERVED] Dogfood root `.ana/ana.json:52` carries `captureGate: "on"` — a one-line edit (AC7).

### Test Infrastructure
- `tests/commands/anaJsonSchema.test.ts` — schema parse tests; update the `captureGate` field test to `testEvidenceGate`.
- `tests/commands/artifact.test.ts` — exercises the gate; rename references, assert the block message names `testEvidenceGate` and contains no `captureGate`.
- `tests/commands/init.test.ts` — `createAnaJson` test asserts emitted key is `testEvidenceGate` and no `captureGate` in output.
- `tests/commands/doctor.test.ts` — rename the Enforcement-dimension reader references.
- `tests/commands/config.test.ts`, `tests/commands/work.test.ts` — update `captureGate` fixtures/references to keep the suites green.

## For AnaPlan

### Structural Analog
The existing flag-reader pattern **in the same codebase** — `isProcessCaptureEnabled` in `forensics.ts:258-269`: read raw `ana.json`, safe-parse, single string compare, undefined-safe. The renamed `isTestEvidenceGateEnabled` is structurally this plus the test-command carve-out (which already exists, unchanged). **Read `forensics.ts:258-269` first** — cleanest reader template. No `??`, no fallback — this reader reads one key.

### Functional Analog
`isCaptureGateEnabled` / `evaluateCaptureGate` / `applyCaptureGate` / `CaptureGateResult` in `artifact.ts` + `capture-marker.ts` — the exact symbols being renamed. Same logic, new names. The only behavioral change is the flag *key* the reader checks; the carve-out logic is identical.

### Relevant Code Paths
- Schema + emit: `anaJsonSchema.ts:105-108` (replace), `state.ts:572` (+ comments `:571, :742`).
- Reader + gate + messages: `artifact.ts` (`isCaptureGateEnabled`, `evaluateCaptureGate`, `applyCaptureGate`, block/escape strings `:866-872`).
- Gate evaluator + result type: `capture-marker.ts:57` (`CaptureGateResult`), `:252` (`evaluateCaptureGate`), `:241` (comment).
- Config allowlist: `config.ts` `KNOWN_FIELDS` (replace `captureGate`).
- Doctor: the raw read + `isCaptureGateEnabled` import/call introduced by the merged predecessor scope.
- Forensics JSDoc: `forensics.ts:252`.
- Docs: `configurability.mdx:34-35, 74, 84-86`. Dogfood: `.ana/ana.json:52`.

### Patterns to Follow
- Schema posture: copy the exact `optional().catch(undefined)` no-default shape from the current `captureGate` line for `testEvidenceGate`, then delete the old line. Absent stays absent → reads as off.
- Reader: one key, no `??`. If doctor + reader share a tri-state read, a thin one-line helper is fine, but do not build a precedence resolver — there is nothing to resolve.

### Known Gotchas
- **Total deletion, not aliasing.** `captureGate` / `CaptureGate` must end at zero occurrences in `packages/cli/src`. AC5 is the clean-sweep grep — this is the highest-value assertion because behavioral tests can't see a stray symbol (the rename doesn't change behavior).
- **`evaluateCaptureGate` + `CaptureGateResult` live in `capture-marker.ts`**, not `artifact.ts`. Both rename; the rest of that file (marker mechanism) does not. `artifact.ts` imports the evaluator — update the import name.
- **doctor.ts already uses target vocab partially.** The `test_evidence_gate` dimension field/var came from the merged predecessor — do NOT rename those. Only the raw `captureGate` read + the `isCaptureGateEnabled` import/call change.
- **Don't drop the C9 reassurance line or break the C11 warn/error partition** in the block message / evaluator.
- **Don't touch `processCapture*` or the marker mechanism.** After editing: `grep -rE "captureGate|CaptureGate" packages/cli/src` → zero; `CaptureMarker` / `parseMarkers` / `processCapture` → unchanged counts.

### Things to Investigate
- Confirm the schema field replacement leaves `.passthrough()` behavior intact for any *other* unknown keys (we're removing a known field, not adding strictness).
- Confirm no test asserts the literal string `captureGate` as expected output anywhere that would survive the rename (grep the test suites).
