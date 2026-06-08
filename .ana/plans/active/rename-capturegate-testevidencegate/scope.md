# Scope: Rename `captureGate` → `testEvidenceGate` (field + gate symbols, with back-compat)

**Created by:** Ana
**Date:** 2026-06-08

## Intent

The `ana.json` flag `captureGate` doesn't describe what it does — it gates whether a `build_report.md` save must carry **real captured test-run evidence**. Worse, "capture" is *overloaded*: it names this subsystem (the "capture marker" / seal that proves tests ran) **and** the unrelated provenance subsystem (`processCapture` / `processCaptureStrict`, the harness payload). Two different things wearing one word.

**The disease:** the customer-facing flag name is opaque *and* collides with a second subsystem's vocabulary. Rename `captureGate` → `testEvidenceGate`. That single rename does double duty: it makes the flag self-describing, and it de-overloads "capture" **by subtraction** — once `captureGate` is gone, `processCapture*` becomes the sole, unambiguous owner of "capture" in `ana.json`.

(GitHub issue #300, the rename half. **Depends on `enforcement-state-in-doctor`** — that scope removes the work-status gate readout and stands up the `ana doctor` Enforcement view; this scope renames the field and the gate symbols that survive, including the ones that scope introduces in doctor.)

## Complexity Assessment

- **Kind:** chore
- **Size:** small
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/commands/init/anaJsonSchema.ts` — add `testEvidenceGate` enum field; **keep** `captureGate` in the schema as a legacy fallback (still parsed, never emitted).
  - `packages/cli/src/commands/init/state.ts` — `createAnaJson` emits `testEvidenceGate: 'on'` for new projects (`state.ts:572`); update the preserve-not-refresh comments (`:571-572, :742`).
  - `packages/cli/src/commands/artifact.ts` — rename the reader `isCaptureGateEnabled` → `isTestEvidenceGateEnabled` and have it read `testEvidenceGate ?? captureGate` (legacy fallback); rename `evaluateCaptureGate` → `evaluateTestEvidenceGate`, `applyCaptureGate` → `applyTestEvidenceGate`; update the block/escape-hatch messages (`artifact.ts:860-872`) to name `testEvidenceGate`.
  - `packages/cli/src/commands/doctor.ts` — rename the Enforcement-dimension symbols/labels introduced by Scope A from `captureGate*` to `testEvidenceGate*`; keep reading the legacy key via the renamed reader.
  - `packages/cli/src/commands/config.ts` — in `KNOWN_FIELDS`, change `captureGate` → `testEvidenceGate` **and keep `captureGate`** (so `config set` on a legacy install doesn't warn).
  - `packages/cli/src/utils/capture-marker.ts` — update the one *comment* that references the `captureGate` flag name (`:241`). The marker mechanism itself is **not** renamed (see boundary).
  - `website/content/docs/guides/configurability.mdx` — update all `captureGate` references (`:34-35, :74, :84, :86`) to `testEvidenceGate`, with a one-line note that the legacy `captureGate` key is still honored.
  - Tests: `anaJsonSchema.test.ts`, `artifact.test.ts`, `init.test.ts`, `doctor.test.ts` — rename references and **add** legacy-fallback coverage.
- **Blast radius:** one public contract changes (the `ana.json` field). Everything else is internal symbols (type-checked) or docs. The dogfood `.ana/ana.json` at the repo root carries `captureGate: "on"` today — re-init/migration must convert it without losing the `on`.
- **Estimated effort:** ~half a day. One real design seam (the fallback read + migration posture); the rest is mechanical and caught by `tsc --noEmit`.
- **Multi-phase:** no

## Approach

Rename across three layers, with a hard boundary on the fourth.

1. **The `ana.json` field (public contract — rename + back-compat).** Add `testEvidenceGate` to the schema with the same migration-safe posture as the current field (`optional`, no default, `.catch(undefined)`). **Keep `captureGate` in the schema** so old files still parse. The single reader resolves `testEvidenceGate ?? captureGate` — new key wins, legacy key honored forever (or until a deliberate migration drops it). `createAnaJson` emits only the new key. Decide and document the re-init posture: prefer **migrate-on-re-init** (when `preserveUserState` sees a legacy `captureGate` and no `testEvidenceGate`, carry the value forward under the new key) so installs converge, with the fallback read as the safety net for files that never re-init.

2. **Gate symbols (internal — rename freely).** `isCaptureGateEnabled` → `isTestEvidenceGateEnabled`, `evaluateCaptureGate` → `evaluateTestEvidenceGate`, `applyCaptureGate` → `applyTestEvidenceGate`, and the doctor-side `*captureGate*` symbols/labels from Scope A. These have zero contract cost and *must* track the flag — leaving a `testEvidenceGate` value read into a `captureGate`-named symbol just relocates the opacity into the source.

3. **User-facing strings.** The block message and escape-hatch hint in `applyTestEvidenceGate` (`artifact.ts:866-872`) and the docs must name `testEvidenceGate` (the escape hatch becomes `set "testEvidenceGate": "off"`).

4. **The boundary — do NOT rename:** the *capture-marker* mechanism (`capture-marker.ts`, `CaptureMarker`, "the seal" — the evidence **format**) and the *provenance* subsystem (`processCapture`, `processCaptureStrict`, `ana _capture`, the capture hooks). The gate is the **policy**; the capture marker is the **evidence** it checks — keeping that split is what makes `testEvidenceGate` reading a "capture marker" read as a clean layer boundary, not a leftover inconsistency.

Strategy only — the exact migration mechanism (fallback-read-only vs. migrate-on-re-init) is Plan's to finalize; recommendation above.

## Acceptance Criteria

- AC1: New projects get `testEvidenceGate: "on"` in `ana.json`; no new project writes `captureGate`.
- AC2: An `ana.json` containing only the legacy `captureGate` key still enforces correctly — `testEvidenceGate ?? captureGate` resolves, and an `on` legacy value still blocks a build-report save with no test evidence.
- AC3: When both keys are present, `testEvidenceGate` wins.
- AC4: Re-init on a project carrying legacy `captureGate` does not lose the user's on/off choice (migrated to `testEvidenceGate` and/or honored via fallback — per the chosen mechanism).
- AC5: The block message and escape-hatch hint name `testEvidenceGate` (e.g. `set "testEvidenceGate": "off"`), not `captureGate`.
- AC6: `ana config set testEvidenceGate off` works with no "unknown key" warning; `ana config set captureGate off` on a legacy install also does not warn (both in `KNOWN_FIELDS`).
- AC7: No `captureGate`-named gate *symbol* remains in `src/` (grep `isCaptureGateEnabled|evaluateCaptureGate|applyCaptureGate|captureGateActive|formatCaptureGateState` returns zero); the capture-*marker* symbols (`CaptureMarker`, `capture-marker`) and `processCapture*` are untouched.
- AC8: `configurability.mdx` documents `testEvidenceGate` and notes the legacy `captureGate` key is still honored.
- AC9: The dogfood root `.ana/ana.json` is migrated to `testEvidenceGate: "on"` (we are our own customer).
- AC10: Test count does not decrease; new tests cover the legacy fallback (AC2), precedence (AC3), and re-init preservation (AC4).

## Edge Cases & Risks

- **Both keys present.** Define precedence explicitly (`testEvidenceGate` wins) and test it — a half-migrated file must not flip behavior.
- **Legacy-only file never re-inits.** The fallback read is the permanent safety net; it cannot be dropped just because migrate-on-re-init exists (not every install re-inits).
- **`preserveUserState` interaction.** `captureGate` currently rides along via `...parsed.data` and is excluded from the mechanical-override list (`state.ts:742`). The migration must not accidentally strip a legacy key before it's read, nor double-write both keys on every re-init. Plan should trace the preserve path carefully.
- **Re-init template propagation.** Re-init overwrites agent bodies/CLAUDE.md from stock but preserves `ana.json` user fields. `testEvidenceGate` is a user field — confirm it lands in the preserved set, same as `captureGate` is today.
- **Don't widen the blast radius.** It is tempting to also rename `processCapture*` or the capture-marker vocabulary "while we're here." Explicitly out of scope — renaming `processCapture*` without renaming the `ana _capture` command/hooks at the same layer would *open* a flag-vs-mechanism gap, the opposite of the win here.
- **Schema `.catch` posture.** Keep `testEvidenceGate` as `optional` + no default + `.catch(undefined)` so an absent flag stays absent through re-init and reads as off — identical to the current migration-safe design.

## Rejected Approaches

- **Rename all three gates (`captureGate` + `processCapture` + `processCaptureStrict`) to a uniform scheme.** Rejected — renaming `captureGate` alone already de-overloads "capture" by subtraction, and `processCapture*` are correctly bound to the `ana _capture` command and capture hooks at the same layer; renaming the flags without the command/hooks would create a worse gap than it closes. (Reasoned through in the scoping conversation.)
- **`requireTestEvidence` instead of `testEvidenceGate`.** Rejected — the field's values are `'on' | 'off'`, not booleans; `requireTestEvidence: "on"` reads redundantly and implies `true`/`false`. `ana.json`'s grammar is noun-phrases (`mergeStrategy`, `branchPrefix`), which `testEvidenceGate` matches.
- **Hard rename, no legacy fallback.** Rejected — `captureGate` is on-by-default and committed to every customer's artifact branch; dropping the old key silently disables the gate on every existing install. Back-compat is mandatory.
- **Also rename the capture-marker mechanism.** Rejected — the marker is the evidence format (a coherent internal concept); churning it widens the diff and erases a useful policy/evidence layer boundary.

## Open Questions

- **Migration mechanism (for Plan to finalize):** fallback-read-only, or fallback-read **plus** migrate-on-re-init? Recommendation: both — migrate-on-re-init so installs converge on the new key, fallback-read as the permanent net for files that never re-init. Either way the fallback read is non-negotiable.

## Exploration Findings

### Patterns Discovered
- `anaJsonSchema.ts:105-108` — `captureGate: z.enum(['on','off']).optional().catch(undefined)`, no default; the comment names this *the migration mechanism* (absent reads as off). `processCapture`/`processCaptureStrict` use the identical pattern (`:112-123`) — proof the fallback-flag seam is already established three times in this file.
- `state.ts:572` — `createAnaJson` emits `captureGate: 'on'`; `:571, :742` — comments documenting why it's preserved-not-refreshed (rides along in `preserveUserState`'s `...parsed.data`, excluded from the mechanical-override list).
- `artifact.ts:850-879` — `applyCaptureGate` (the enforcement gate, `process.exit(1)`); reads enablement via `isCaptureGateEnabled` and evaluates via `evaluateCaptureGate`. The block message (`:866`) and escape-hatch hint (`:872`) name `captureGate` to the user.
- `configurability.mdx:34-35, 74, 84-86` — the customer-facing documentation of the field, including the literal `ana config set captureGate "off"` example.

### Constraints Discovered
- [TYPE-VERIFIED] Gate symbols to rename, with counts (grep `src/`): `isCaptureGateEnabled` (6), `evaluateCaptureGate` (3), `applyCaptureGate` (3). (`captureGateActive` (6) and `formatCaptureGateState` (2) are removed by the predecessor scope `enforcement-state-in-doctor`, not this one.)
- [TYPE-VERIFIED] Boundary symbols that must NOT change: `CaptureMarker` (6), `capture-marker` (2), and all `processCapture`/`processCaptureStrict` references — distinct from the gate symbols, confirmed by grep.
- [OBSERVED] `config.ts:44 KNOWN_FIELDS` — Scope A adds `captureGate` here; this scope changes that entry to `testEvidenceGate` while keeping `captureGate` for legacy `config set`.
- [OBSERVED] The dogfood root `.ana/ana.json` carries `captureGate: "on"` (gitStatus / scan) — must be migrated as part of AC9.

### Test Infrastructure
- `tests/commands/anaJsonSchema.test.ts` — schema parse tests; the natural home for precedence + legacy-fallback parse coverage.
- `tests/commands/artifact.test.ts` — already exercises the capture gate; extend for the renamed reader + legacy-value enforcement (AC2).
- `tests/commands/init.test.ts` — re-init preservation tests; add the migrate/preserve case (AC4).
- `tests/commands/doctor.test.ts` — rename Scope A's Enforcement-dimension assertions.

## For AnaPlan

### Structural Analog
The existing migration-safe flag pattern **in the same file** — `processCapture` / `processCaptureStrict` in `anaJsonSchema.ts:112-123` and their readers in `forensics.ts:258-291` (`isProcessCaptureEnabled` / `isProcessCaptureStrictEnabled`: read raw `ana.json`, return a boolean from a string compare). The renamed `isTestEvidenceGateEnabled` reader (with its `??` fallback) is structurally a sibling of these. **Read `forensics.ts:258-291` first** — it's the cleanest template for a flag reader in this codebase.

### Functional Analog
`isCaptureGateEnabled` / `evaluateCaptureGate` / `applyCaptureGate` in `artifact.ts` — the exact functions being renamed. Same logic, new names + a fallback read added to the enablement check.

### Relevant Code Paths
- Schema + emit: `anaJsonSchema.ts:105-108`, `state.ts:572` (+ comments `:571, :742`).
- Reader + gate + messages: `artifact.ts` (`isCaptureGateEnabled`, `evaluateCaptureGate`, `applyCaptureGate`, block/escape-hatch strings `:866-872`).
- Config allowlist: `config.ts:44`.
- Comment-only touch: `capture-marker.ts:241`.
- Docs: `configurability.mdx:34-35, 74, 84-86`.
- Doctor labels/symbols: whatever `enforcement-state-in-doctor` introduces (sequence after it).

### Patterns to Follow
- The `?? ` fallback read: `data.testEvidenceGate ?? data.captureGate`, resolved once in the reader — do not scatter the fallback across call sites.
- Schema posture: copy the exact `optional().catch(undefined)` no-default shape from the current `captureGate` line for `testEvidenceGate`.
- Re-init preservation: follow how `mergeStrategy`/`branchPrefix` are preserved as user fields in `preserveUserState`.

### Known Gotchas
- **Sequence after `enforcement-state-in-doctor`.** That scope deletes `captureGateActive`/`formatCaptureGateState` and creates the doctor Enforcement view; this scope renames within the post-A code. Planning against pre-A code will mis-map the doctor symbols.
- **Keep both keys in the schema and in `KNOWN_FIELDS`** — dropping `captureGate` breaks legacy installs and re-introduces the spurious `config set` warning for them.
- **The fallback read is permanent**, independent of any migrate-on-re-init step — not every install re-inits.
- **Don't touch `processCapture*` or the capture marker.** Grep after editing: gate symbols → zero; `CaptureMarker` / `capture-marker` / `processCapture` → unchanged counts.
- **Migrate the dogfood `ana.json`** (AC9) — we ship the same migration we expect customers to get.

### Things to Investigate
- Finalize the migration mechanism (fallback-only vs. + migrate-on-re-init) and where the migrate step lives if adopted (`preserveUserState` is the natural seam) — design judgment, recommendation in Open Questions.
- Confirm `preserveUserState` carries `testEvidenceGate` into the preserved user-field set and never double-writes both keys on re-init.
