# Spec: Rename `captureGate` → `testEvidenceGate` (field + gate symbols, with back-compat)

**Created by:** AnaPlan
**Date:** 2026-06-08
**Scope:** .ana/plans/active/rename-capturegate-testevidencegate/scope.md

## Approach

Rename the `ana.json` flag and every gate *policy* symbol from `captureGate`/`CaptureGate` to `testEvidenceGate`/`TestEvidenceGate`, while leaving the capture-*marker* mechanism (`CaptureMarker`, `parseMarkers`, `validateCapturePresent`, the seal format) and the `processCapture*` provenance subsystem untouched. The marker is the *evidence*; the gate is the *policy* that checks it — keep that layer split.

Three layers change, one boundary holds:

1. **Public contract (`ana.json` field) — rename + permanent back-compat.** Add `testEvidenceGate` to the schema with the *identical* migration-safe posture as the current `captureGate` line (`z.enum(['on','off']).optional().catch(undefined)`, no `.default`). **Keep `captureGate` in the schema** so legacy files still parse. Precedence (`testEvidenceGate ?? captureGate`) is resolved in exactly ONE helper, `readTestEvidenceGateFlag(anaJson)`. New key wins; legacy key honored forever.

2. **Gate symbols (internal — rename freely, type-checked).** `isCaptureGateEnabled` → `isTestEvidenceGateEnabled`, `evaluateCaptureGate` → `evaluateTestEvidenceGate`, `applyCaptureGate` → `applyTestEvidenceGate`, and the result type `CaptureGateResult` → `TestEvidenceGateResult`. These have zero contract cost and MUST track the flag — a `testEvidenceGate` value read into a `captureGate`-named symbol just relocates the opacity into the source.

3. **User-facing strings.** The block message + escape-hatch hint in `applyTestEvidenceGate` and the docs name `testEvidenceGate`; the escape hatch becomes `set "testEvidenceGate": "off"`.

4. **The boundary — do NOT touch:** `CaptureMarker`, `capture-marker.ts`'s marker functions (`parseMarkers`, `validateCapturePresent`, `serialize*`), and all `processCapture` / `processCaptureStrict` / `ana _capture` references. Only the gate evaluator + its result type rename inside `capture-marker.ts`; everything else there stays.

### Resolved design decisions (from the planning conversation)

- **Migration mechanism = BOTH.** Migrate-on-re-init *and* permanent fallback-read.
  - **Migrate-on-re-init** lives in `preserveUserState`, right after the `merged` object is constructed (state.ts ~:754, before `writeFile`). Converge to a single new key: if `merged.testEvidenceGate` is present, delete `merged.captureGate`; else if `merged.captureGate` is present, set `merged.testEvidenceGate = merged.captureGate` and delete `merged.captureGate`. After any re-init the file carries only the new key — no double-write.
  - **Fallback-read** (`testEvidenceGate ?? captureGate`) is the permanent safety net for installs that never re-init. It is non-negotiable and independent of the migrate step.
- **`CaptureGateResult` → `TestEvidenceGateResult`.** It is the gate's verdict type (return type of `evaluateTestEvidenceGate`), on the *policy* side of the boundary — location in `capture-marker.ts` is not concept. Rename it (2 refs, same file, type-checked).
- **One shared precedence resolver, record-in.** `readTestEvidenceGateFlag(anaJson: Record<string, unknown>): 'on' | 'off' | null` owns the `?? captureGate` precedence in ONE place. Signature takes the already-parsed record (NOT `projectRoot`) because both call sites already hold a parsed object — `isTestEvidenceGateEnabled` reuses its `anaJson` for the test-command carve-out, and doctor holds `anaContent`. A `projectRoot` signature would force a redundant second parse inside the reader. Returns `null` when neither key is present.
  - `isTestEvidenceGateEnabled` = `readTestEvidenceGateFlag(anaJson) === 'on'` AND a test command resolves (the existing carve-out, unchanged).
  - `doctor.assessEnforcement` calls `readTestEvidenceGateFlag(anaContent)` for the raw tri-state (replacing the inline `anaContent['captureGate'] === 'on'` at doctor.ts:462), then `isTestEvidenceGateEnabled(projectRoot)` for the active/inactive distinction.

## Output Mockups

**Block message** (when the gate is on, a test command resolves, and a `build_report.md` save carries no seal) — only the flag name changes:

```
Error: build_report.md has no valid captured test evidence.
  The test-evidence gate is on for this project, so test evidence is required.
  No captured test run found. Run `ana test --stage build --slug <slug>` and paste the marker into the build report.
  Fix: run `ana test` (it seals a harmless abstain even when no tests run), then re-save.
  To turn the gate off for this project: set "testEvidenceGate": "off" in .ana/ana.json.
```

**New-project `ana.json`** (createAnaJson output) carries only the new key:

```json
{
  ...
  "branchPrefix": "feature/",
  "testEvidenceGate": "on",
  ...
}
```

**Re-init of a legacy install** (`{"captureGate": "off"}` → after `ana init`):

```json
{ "testEvidenceGate": "off" }   // value preserved, key converged, captureGate dropped
```

## File Changes

### packages/cli/src/commands/init/anaJsonSchema.ts (modify)
**What changes:** Add a `testEvidenceGate` enum field immediately above the existing `captureGate` field, copying the exact `z.enum(['on','off']).optional().catch(undefined)` shape and the migration-safe comment ("absent stays undefined → reads as off"). **Keep `captureGate`** as the legacy fallback (still parsed, never emitted). Reword the `captureGate` comment to note it is now the legacy alias of `testEvidenceGate`.
**Pattern to follow:** The adjacent `processCapture` / `processCaptureStrict` fields (`:112-123`) — identical posture, three established siblings in this file.
**Why:** Without the new field in the schema, `createAnaJson`'s emitted key is stripped on parse; without keeping `captureGate`, legacy installs fail to carry their committed flag.

### packages/cli/src/commands/artifact.ts (modify)
**What changes:**
- Add `readTestEvidenceGateFlag(anaJson: Record<string, unknown>): 'on' | 'off' | null` — the single precedence resolver: returns `(anaJson.testEvidenceGate ?? anaJson.captureGate)` narrowed to `'on' | 'off' | null`. Export it (doctor imports it).
- Rename `isCaptureGateEnabled` → `isTestEvidenceGateEnabled`; its flag check becomes `if (readTestEvidenceGateFlag(anaJson) !== 'on') return false;` (keeping the existing test-command carve-out that follows, using the same `anaJson`).
- Rename `applyCaptureGate` → `applyTestEvidenceGate`, update both call sites (`:1077`, `:1499`).
- Update the import of the gate evaluator from `../utils/capture-marker.js` (`evaluateCaptureGate` → `evaluateTestEvidenceGate`).
- Update the block message + escape-hatch hint (`:863-869`) to name the test-evidence gate and `set "testEvidenceGate": "off"`. Keep the existing reassurance line about `ana test` sealing a harmless abstain (proof finding C9 — do not drop it).
- Update JSDoc on the renamed functions to name `testEvidenceGate`.
**Pattern to follow:** `forensics.ts:258-291` (`isProcessCaptureEnabled`) is the canonical flag-reader shape in this codebase — read raw, safe-parse, string-compare.
**Why:** This file owns enforcement; the reader and the precedence resolver are the single source of fallback truth.

### packages/cli/src/utils/capture-marker.ts (modify)
**What changes:** Rename the interface `CaptureGateResult` → `TestEvidenceGateResult` (`:57`) and the function `evaluateCaptureGate` → `evaluateTestEvidenceGate` (`:252`) plus its JSDoc. Update the one comment that names the `captureGate` flag (`:241`) to `testEvidenceGate`. Leave `parseMarkers`, `validateCapturePresent`, `CaptureMarker`, and every seal/marker symbol untouched.
**Pattern to follow:** N/A — mechanical symbol rename of the two gate-side symbols only.
**Why:** The gate evaluator and its verdict type are policy symbols colocated with the marker; they must track the flag. The marker mechanism is the boundary and stays.

### packages/cli/src/commands/doctor.ts (modify)
**What changes:** Replace the inline raw read `const gateFlag = anaContent['captureGate'] === 'on';` (`:462`) with `const gateFlag = readTestEvidenceGateFlag(anaContent) === 'on';` (import the helper from `./artifact.js`). Update the `isCaptureGateEnabled` import + its call (`:27`, `:464`) to `isTestEvidenceGateEnabled`, and the `{@link isCaptureGateEnabled}` JSDoc (`:447`). The local var `testEvidenceGate` and the `test_evidence_gate` dimension field already carry the target vocabulary (introduced by the predecessor scope) — leave them.
**Pattern to follow:** Existing `assessEnforcement` structure — `process_capture` / `process_capture_strict` reads stay as-is.
**Why:** Doctor needs the raw tri-state (on vs on-inactive) the boolean reader can't give; routing it through the shared resolver keeps the fallback in one place.

### packages/cli/src/commands/config.ts (modify)
**What changes:** In `KNOWN_FIELDS` (`:60`), add `'testEvidenceGate'` and **keep** `'captureGate'`. Both present.
**Pattern to follow:** The existing flat string set.
**Why:** `config set testEvidenceGate` must not warn (AC6); legacy `config set captureGate` must also not warn.

### packages/cli/src/commands/init/state.ts (modify)
**What changes:**
- `createAnaJson` emits `testEvidenceGate: 'on'` instead of `captureGate: 'on'` (`:572`).
- Update the preserve-not-refresh comments (`:570-571`, `:576-577`, `:581-582`, `:742-745`) to name `testEvidenceGate` (and note `captureGate` is the legacy alias still honored on read).
- In `preserveUserState`, after the `merged` object is built (~:754, before `writeFile`), add the migrate-on-re-init convergence: if `merged.testEvidenceGate != null` → `delete merged.captureGate`; else if `merged.captureGate != null` → `merged.testEvidenceGate = merged.captureGate; delete merged.captureGate`. Guard on the `parsed.success` block that already exists.
**Pattern to follow:** How `mergeStrategy`/`branchPrefix` ride along in `...parsed.data` and are excluded from the mechanical-override list — `testEvidenceGate` gets the same preserved-user-field treatment; the migrate step only converges the key name.
**Why:** New projects must default to the new key (AC1); legacy installs must converge without losing their on/off choice (AC4) and without double-writing both keys.

### packages/cli/src/utils/forensics.ts (modify)
**What changes:** Update the JSDoc comment `Mirrors \`isCaptureGateEnabled\`...` (`:252`) to `isTestEvidenceGateEnabled`. Comment-only; no logic, no `processCapture*` changes.
**Why:** A renamed symbol referenced in a sibling's docs should not dangle.

### .ana/ana.json (modify)
**What changes:** Change the dogfood line `"captureGate": "on"` (`:52`) to `"testEvidenceGate": "on"`. Direct file edit.
**Why:** AC9 — we ship ourselves the same migration we expect customers to get.

### website/content/docs/guides/configurability.mdx (modify)
**What changes:** Replace all `captureGate` references (`:34-35, :74, :84-86`) with `testEvidenceGate`, including the `ana config set captureGate "off"` example → `ana config set testEvidenceGate "off"`. Add one line noting the legacy `captureGate` key is still honored for back-compat.
**Why:** AC8 — the customer-facing field documentation must name the new key.

### Tests (modify — see Testing Strategy)
`tests/commands/init/anaJsonSchema.test.ts`, `tests/commands/artifact.test.ts`, `tests/commands/init.test.ts`, `tests/commands/doctor.test.ts`, `tests/commands/config.test.ts`, `tests/commands/work.test.ts` — rename references and add the new back-compat coverage. (`config.test.ts` and `work.test.ts` also reference `captureGate`, mostly as fixtures — update them so the suite stays green and `config.test.ts` asserts both keys are known.)

## Acceptance Criteria

- [ ] AC1: New projects get `testEvidenceGate: "on"` in `ana.json`; no new project writes `captureGate`.
- [ ] AC2: An `ana.json` containing only the legacy `captureGate` key still enforces — `testEvidenceGate ?? captureGate` resolves, and an `on` legacy value still blocks a build-report save with no test evidence.
- [ ] AC3: When both keys are present, `testEvidenceGate` wins.
- [ ] AC4: Re-init on a project carrying legacy `captureGate` does not lose the user's on/off choice (migrated to `testEvidenceGate`, legacy key dropped) and never double-writes both keys.
- [ ] AC5: The block message and escape-hatch hint name `testEvidenceGate` (`set "testEvidenceGate": "off"`), not `captureGate`.
- [ ] AC6: `ana config set testEvidenceGate off` works with no "unknown key" warning; `ana config set captureGate off` on a legacy install also does not warn (both in `KNOWN_FIELDS`).
- [ ] AC7: No `captureGate`-named gate symbol remains in `src/` (grep `isCaptureGateEnabled|evaluateCaptureGate|applyCaptureGate|CaptureGateResult` returns zero); capture-*marker* symbols (`CaptureMarker`, `parseMarkers`, `validateCapturePresent`) and `processCapture*` counts unchanged.
- [ ] AC8: `configurability.mdx` documents `testEvidenceGate` and notes the legacy `captureGate` key is still honored.
- [ ] AC9: The dogfood root `.ana/ana.json` is migrated to `testEvidenceGate: "on"`.
- [ ] AC10: Test count does not decrease from baseline (3589); new tests cover legacy fallback (AC2), precedence (AC3), and re-init convergence (AC4).
- [ ] `tsc --noEmit` passes with zero errors.
- [ ] Lint passes.

## Testing Strategy

- **Unit tests:**
  - `anaJsonSchema.test.ts` — schema parses a legacy-only `{captureGate:'on'}` (field survives); schema accepts `{testEvidenceGate:'on'}`. Follow the existing per-field parse tests.
  - `artifact.test.ts` — `readTestEvidenceGateFlag`: new-key-only → `'on'`; legacy-only → `'on'`; both present (`testEvidenceGate:'off'`, `captureGate:'on'`) → `'off'` (precedence); neither → `null`. `isTestEvidenceGateEnabled`: legacy-only `on` + resolvable test command → `true` (AC2 enforcement reaches the gate). Block path: with the gate enabled and no seal, `applyTestEvidenceGate` blocks and the error names `testEvidenceGate` / `set "testEvidenceGate": "off"` and does NOT contain `captureGate`.
  - `config.test.ts` — both `testEvidenceGate` and `captureGate` are in `KNOWN_FIELDS` (no unknown-key warning for either).
- **Integration tests:**
  - `init.test.ts` — fresh `createAnaJson` emits `testEvidenceGate:'on'` and the serialized config does NOT contain `captureGate`. Re-init via `preserveUserState`: legacy `{captureGate:'off'}` → merged has `testEvidenceGate:'off'` and no `captureGate`; existing `{testEvidenceGate:'on', captureGate:'on'}` → merged keeps `testEvidenceGate` and drops `captureGate`.
  - `doctor.test.ts` — update Enforcement-dimension assertions to the renamed reader; a legacy-only `captureGate:'on'` config still reports `test_evidence_gate` as `on`/`on-inactive` correctly (legacy honored through the shared resolver).
- **Edge cases:**
  - Both keys present with conflicting values — `testEvidenceGate` wins on read AND survives re-init (the other key is dropped, not preserved).
  - Absent flag → `readTestEvidenceGateFlag` returns `null`, `isTestEvidenceGateEnabled` returns `false`, gate warns (never blocks).
  - Malformed `ana.json` → reader returns `false`, never throws (fail-safe).

## Dependencies

`enforcement-state-in-doctor` (the predecessor scope) is **already merged** (commit `c9ff2880`). The doctor Enforcement view and its `test_evidence_gate` dimension exist; this spec renames within that post-merge code. Build against current `main`.

## Constraints

- **Back-compat is mandatory.** `captureGate` is on-by-default and committed to every existing customer's artifact branch. The fallback-read may never be removed by this work.
- **Migration-safe schema posture.** `testEvidenceGate` is `optional` + no `.default` + `.catch(undefined)` — an absent flag stays absent through re-init and reads as off.
- **Type-checked rename.** Gate-symbol renames must leave `tsc --noEmit` clean — that is the safety net for the internal half of this diff.
- **Do not widen the blast radius.** No `processCapture*` renames, no marker-mechanism renames.

## Gotchas

- **`evaluateCaptureGate` lives in `capture-marker.ts`, not `artifact.ts`** (`:252`), and so does its result type `CaptureGateResult` (`:57`). Both rename; the rest of that file does not. `artifact.ts` imports the evaluator — update the import name.
- **doctor.ts already uses the target vocabulary partially.** The local `testEvidenceGate` var and `test_evidence_gate` dimension field came from the predecessor scope — do NOT rename those. Only the inline raw `captureGate` read (`:462`) and the `isCaptureGateEnabled` import/call/JSDoc change.
- **`preserveUserState` migrate step placement.** It must run on the `merged` object *after* `...parsed.data` spreads in the legacy key but *before* `writeFile` (~:754–806). Placing it earlier risks the spread re-adding `captureGate`; placing it after write is too late.
- **Two raw read sites of the flag, one resolver.** `isTestEvidenceGateEnabled` (enforcement) and `doctor.assessEnforcement` (reporting) both need the flag — both call `readTestEvidenceGateFlag`. Do not inline a second `?? captureGate`.
- **Don't drop the reassurance line.** The block message's "`ana test` seals a harmless abstain even when no tests run" line exists because of proof finding C9 — keep it, just rename the flag references around it.
- **Grep after editing.** Gate symbols (`isCaptureGateEnabled|evaluateCaptureGate|applyCaptureGate|CaptureGateResult`) → zero in `src/`. `CaptureMarker` / `parseMarkers` / `processCapture` / `processCaptureStrict` → unchanged counts.

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions; `node:` prefix for built-ins. `import type` separated from value imports.
- Named exports only — no default exports. `readTestEvidenceGateFlag` is a named export from `artifact.ts`.
- Explicit return types on all exported functions; `@param`/`@returns` JSDoc on exported functions (pre-commit enforces it). `readTestEvidenceGateFlag` needs both.
- Engine purity does NOT apply here — `artifact.ts`/`doctor.ts`/`config.ts` are command-layer files; chalk + `process.exit(1)` are correct there.
- Prefer early returns: `if (readTestEvidenceGateFlag(anaJson) !== 'on') return false;` then flat carve-out logic.
- Use `'on' | 'off' | null` for the resolver return — `null` is "checked and absent," matching the codebase's `| null`-for-checked-empty convention.

### Pattern Extracts

The canonical flag-reader shape to mirror for `isTestEvidenceGateEnabled` (from `forensics.ts:260-269`):

```ts
export function isProcessCaptureEnabled(projectRoot: string): boolean {
  let anaJson: Record<string, unknown>;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8')) as unknown;
    anaJson = AnaJsonSchema.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }
  return anaJson['processCapture'] === 'on';
}
```

The current reader being renamed + given the fallback (`artifact.ts:819-838`) — keep the test-command carve-out exactly, only swap the flag check to the resolver:

```ts
export function isCaptureGateEnabled(projectRoot: string): boolean {
  let anaJson: Record<string, unknown>;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8')) as unknown;
    anaJson = AnaJsonSchema.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }

  if (anaJson['captureGate'] !== 'on') return false;   // <- becomes: readTestEvidenceGateFlag(anaJson) !== 'on'

  if (resolveTestCommandString(anaJson, undefined)) return true;
  const surfaces = anaJson['surfaces'] as Record<string, unknown> | undefined;
  for (const surfaceName of Object.keys(surfaces ?? {})) {
    if (resolveTestCommandString(anaJson, surfaceName)) return true;
  }
  return false;
}
```

The schema field to copy (`anaJsonSchema.ts:105-108`) — add a `testEvidenceGate` twin above it, keep this as legacy:

```ts
captureGate: z
  .enum(['on', 'off'])
  .optional()
  .catch(undefined),
```

The `preserveUserState` merged-object seam (`state.ts:746-754`) — insert the convergence right after this block, before `writeFile`:

```ts
const merged = {
  ...parsed.data,
  anaVersion: newAnaConfig['anaVersion'],
  lastScanAt: newAnaConfig['lastScanAt'],
  name: newAnaConfig['name'],
  language: newAnaConfig['language'],
  framework: newAnaConfig['framework'],
  packageManager: newAnaConfig['packageManager'],
};
// converge legacy captureGate → testEvidenceGate (new key wins; single-key output)
```

### Proof Context

- **`captured-test-evidence-C9` [code] (artifact.ts):** The block message previously didn't reassure a build-only/no-tests agent that `ana test` seals a harmless abstain. A reassurance line was added. **Keep that line** when renaming the flag in the message — do not regress it.
- **`captured-test-evidence-C11` [test] (artifact.ts):** The arming predicate uses `warnings.length === 0` as a proxy, correct only because `evaluateCaptureGate` routes all non-blocking messages to warnings. After renaming to `evaluateTestEvidenceGate`, preserve that warning/error partition exactly — it is load-bearing.
- Other active findings on these files (`.saves.json` multi-read, provenance unstaged-file) are unrelated to this rename — no action.

### Checkpoint Commands

- After `anaJsonSchema.ts` + `artifact.ts` + `capture-marker.ts`: `(cd 'packages/cli' && pnpm vitest run anaJsonSchema artifact)` — Expected: green, including new fallback/precedence tests.
- After `state.ts` + `doctor.ts` + `config.ts`: `(cd 'packages/cli' && pnpm vitest run init doctor config)` — Expected: green, including re-init convergence tests.
- Type check: `(cd 'packages/cli' && pnpm tsc --noEmit)` — Expected: zero errors (the safety net for the internal renames).
- After all changes: `pnpm run test -- --run` — Expected: ≥3589 tests pass.
- Lint: `(cd 'packages/cli' && pnpm run lint)` — Expected: clean.
- Final grep gate (AC7): `grep -rnE "isCaptureGateEnabled|evaluateCaptureGate|applyCaptureGate|CaptureGateResult" packages/cli/src` → zero hits.

### Build Baseline
- Current tests: **3589** (3587 passed + 2 skipped)
- Current test files: **146**
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected **3589 + ~8–10 new** tests in 146 files (no new test files; assertions added to the six existing suites).
- Regression focus: `artifact.test.ts`, `init.test.ts`, `doctor.test.ts`, `config.test.ts`, `work.test.ts`, `anaJsonSchema.test.ts` — every suite that holds a `captureGate` reference or fixture.
