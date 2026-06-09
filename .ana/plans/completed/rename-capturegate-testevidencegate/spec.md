# Spec: Rename `captureGate` → `testEvidenceGate` (clean rename, no back-compat)

**Created by:** AnaPlan
**Date:** 2026-06-08
**Scope:** .ana/plans/active/rename-capturegate-testevidencegate/scope.md

## Approach

A clean, total rename of the `ana.json` flag and every gate *policy* symbol from `captureGate`/`CaptureGate` to `testEvidenceGate`/`TestEvidenceGate`. The capture-*marker* mechanism (`CaptureMarker`, `parseMarkers`, `validateCapturePresent`, the seal format) and the `processCapture*` provenance subsystem are untouched. The marker is the *evidence*; the gate is the *policy* that checks it — keep that layer split.

**No back-compat.** `captureGate` was introduced 2026-06-06, four days after the published `v1.2.2` tag (2026-06-02), and is absent from that tag — zero installs carry it. There is no install base to be compatible with. So there is no fallback read, no legacy schema field, and no re-init migration: the old name is deleted, not preserved. This is the rename the disease called for, made elegant by the fact that nothing depends on the old name.

Three layers change, one boundary holds:

1. **Public contract (`ana.json` field) — replace, not add.** `captureGate` becomes `testEvidenceGate` in the schema with the *identical* migration-safe posture (`z.enum(['on','off']).optional().catch(undefined)`, no `.default`). `captureGate` is **removed** from the schema. One key exists.

2. **Gate symbols (internal — rename, type-checked).** `isCaptureGateEnabled` → `isTestEvidenceGateEnabled`, `evaluateCaptureGate` → `evaluateTestEvidenceGate`, `applyCaptureGate` → `applyTestEvidenceGate`, and the result type `CaptureGateResult` → `TestEvidenceGateResult`. Zero contract cost; the symbols MUST track the flag.

3. **User-facing strings.** The block message + escape-hatch hint in `applyTestEvidenceGate` and the docs name `testEvidenceGate`; the escape hatch becomes `set "testEvidenceGate": "off"`.

4. **The boundary — do NOT touch:** `CaptureMarker`, `capture-marker.ts`'s marker functions (`parseMarkers`, `validateCapturePresent`, `serialize*`), and all `processCapture` / `processCaptureStrict` / `ana _capture` references. Only the gate evaluator + its result type rename inside `capture-marker.ts`; everything else there stays.

### Resolved design decisions

- **No `readTestEvidenceGateFlag` helper.** Its only justification was owning the `testEvidenceGate ?? captureGate` precedence in one place. With no fallback there is no precedence — the read collapses to a single field access. The reader inlines `anaJson['testEvidenceGate'] === 'on'`; doctor inlines `anaContent['testEvidenceGate'] === 'on'`. No new exported symbol. (This reverses an earlier plan to add a shared resolver — that decision was contingent on the fallback, which is now gone.)
- **`CaptureGateResult` → `TestEvidenceGateResult`.** It is the gate's verdict type (return type of `evaluateTestEvidenceGate`), on the *policy* side of the boundary — location in `capture-marker.ts` is not concept. Rename it (2 refs, same file, type-checked).
- **`isTestEvidenceGateEnabled`** = `anaJson['testEvidenceGate'] === 'on'` AND a test command resolves (the existing carve-out, unchanged — only the flag string changes).
- **`doctor.assessEnforcement`** reads `anaContent['testEvidenceGate'] === 'on'` for the raw flag (the existing shape at doctor.ts:462, only the key string changes), then `isTestEvidenceGateEnabled(projectRoot)` for the active/inactive distinction.

## Output Mockups

**Block message** (gate on, test command resolves, `build_report.md` save carries no seal) — only the flag name changes:

```
Error: build_report.md has no valid captured test evidence.
  The test-evidence gate is on for this project, so test evidence is required.
  No captured test run found. Run `ana test --stage build --slug <slug>` and paste the marker into the build report.
  Fix: run `ana test` (it seals a harmless abstain even when no tests run), then re-save.
  To turn the gate off for this project: set "testEvidenceGate": "off" in .ana/ana.json.
```

**New-project `ana.json`** (createAnaJson output) carries the single key:

```json
{
  ...
  "branchPrefix": "feature/",
  "testEvidenceGate": "on",
  ...
}
```

## File Changes

### packages/cli/src/commands/init/anaJsonSchema.ts (modify)
**What changes:** Rename the `captureGate` field (`:105-108`) to `testEvidenceGate`, keeping the exact `z.enum(['on','off']).optional().catch(undefined)` shape and the migration-safe comment ("absent stays undefined → reads as off"). Do NOT keep a `captureGate` field — one key exists.
**Pattern to follow:** The adjacent `processCapture` / `processCaptureStrict` fields (`:112-123`) — identical posture.
**Why:** The schema is the single definition of the field; the old name is removed because nothing references it.

### packages/cli/src/commands/artifact.ts (modify)
**What changes:**
- Rename `isCaptureGateEnabled` → `isTestEvidenceGateEnabled` (`:819`); change its flag check from `anaJson['captureGate'] !== 'on'` to `anaJson['testEvidenceGate'] !== 'on'`. Keep the test-command carve-out exactly.
- Rename `applyCaptureGate` → `applyTestEvidenceGate` (`:858`), update both call sites (`:1077`, `:1499`).
- Update the import of the gate evaluator from `../utils/capture-marker.js`: `evaluateCaptureGate` → `evaluateTestEvidenceGate`.
- Update the block message + escape-hatch hint (`:863-869`) to name the test-evidence gate and `set "testEvidenceGate": "off"`. **Keep the reassurance line** about `ana test` sealing a harmless abstain (proof finding C9 — do not drop it).
- Update JSDoc on the renamed functions to name `testEvidenceGate` (no `captureGate` strings remain).
**Pattern to follow:** `forensics.ts:258-291` (`isProcessCaptureEnabled`) — the canonical flag-reader shape: read raw, safe-parse, string-compare.
**Why:** This file owns enforcement; the flag string and the gate symbols rename together.

### packages/cli/src/utils/capture-marker.ts (modify)
**What changes:** Rename the interface `CaptureGateResult` → `TestEvidenceGateResult` (`:57`) and the function `evaluateCaptureGate` → `evaluateTestEvidenceGate` (`:252`) plus its JSDoc. Update the one comment that names the `captureGate` flag (`:241`) to `testEvidenceGate`. Leave `parseMarkers`, `validateCapturePresent`, `CaptureMarker`, and every seal/marker symbol untouched.
**Why:** The gate evaluator and its verdict type are policy symbols colocated with the marker; they track the flag. The marker mechanism is the boundary and stays.

### packages/cli/src/commands/doctor.ts (modify)
**What changes:** Change the raw read `const gateFlag = anaContent['captureGate'] === 'on';` (`:462`) to `anaContent['testEvidenceGate'] === 'on';`. Update the `isCaptureGateEnabled` import + call (`:27`, `:464`) to `isTestEvidenceGateEnabled`, and the `{@link isCaptureGateEnabled}` JSDoc (`:447`). The local var `testEvidenceGate` and the `test_evidence_gate` dimension field already carry the target vocabulary (from the predecessor scope) — leave them.
**Pattern to follow:** Existing `assessEnforcement` structure — `process_capture` / `process_capture_strict` reads stay as-is.
**Why:** Doctor needs the raw flag (on vs on-inactive); only the key string and the imported reader name change.

### packages/cli/src/commands/config.ts (modify)
**What changes:** In `KNOWN_FIELDS` (`:60`), replace `'captureGate'` with `'testEvidenceGate'`. Do NOT keep `captureGate` — it is not a known field anymore.
**Why:** `config set testEvidenceGate` must not warn (AC6); `captureGate` is gone, so it is correctly no longer recognized.

### packages/cli/src/commands/init/state.ts (modify)
**What changes:**
- `createAnaJson` emits `testEvidenceGate: 'on'` instead of `captureGate: 'on'` (`:572`).
- Update the preserve-not-refresh comments (`:570-571`, `:576-577`, `:581-582`, `:742-745`) to name `testEvidenceGate`. Remove any wording about `captureGate` being a legacy alias — there is none.
- **No migrate-on-re-init block.** `testEvidenceGate` rides along in `...parsed.data` and is excluded from the mechanical-override list, exactly as `captureGate` was — same preserved-user-field treatment, no convergence step (there is nothing to migrate from).
**Pattern to follow:** How `mergeStrategy`/`branchPrefix` ride along in `...parsed.data` and are excluded from the mechanical-override list — `testEvidenceGate` gets identical treatment.
**Why:** New projects default to the new key (AC1); re-init preserves an explicit on/off as before. No migration logic is added.

### packages/cli/src/utils/forensics.ts (modify)
**What changes:** Update the JSDoc comment `Mirrors \`isCaptureGateEnabled\`...` (`:252`) to `isTestEvidenceGateEnabled`. Comment-only; no logic, no `processCapture*` changes.
**Why:** A renamed symbol referenced in a sibling's docs should not dangle.

### .ana/ana.json (modify)
**What changes:** Rename the dogfood line `"captureGate": "on"` (`:52`) to `"testEvidenceGate": "on"`. Direct file edit.
**Why:** AC9 — the dogfood config uses the only key that exists.

### website/content/docs/guides/configurability.mdx (modify)
**What changes:** Replace all `captureGate` references (`:34-35, :74, :84-86`) with `testEvidenceGate`, including `ana config set captureGate "off"` → `ana config set testEvidenceGate "off"`. **No "legacy captureGate still honored" note** — there is no legacy key.
**Why:** AC8 — the customer-facing field documentation names the one key.

### Tests (modify — see Testing Strategy)
`tests/commands/init/anaJsonSchema.test.ts`, `tests/commands/artifact.test.ts`, `tests/commands/init.test.ts`, `tests/commands/doctor.test.ts`, `tests/commands/config.test.ts`, `tests/commands/work.test.ts` — rename `captureGate` references/fixtures to `testEvidenceGate`. Do NOT write back-compat tests (fallback / precedence / re-init convergence) — that behavior does not exist.

## Acceptance Criteria

- [ ] AC1: New projects get `testEvidenceGate: "on"` in `ana.json`; `captureGate` is never written.
- [ ] AC5: The block message and escape-hatch hint name `testEvidenceGate` (`set "testEvidenceGate": "off"`), not `captureGate`.
- [ ] AC6: `ana config set testEvidenceGate off` works with no "unknown key" warning; `captureGate` is no longer in `KNOWN_FIELDS`.
- [ ] AC7: No `captureGate`/`CaptureGate` string remains anywhere across `packages/cli/src/`, `website/content/`, or `.ana/ana.json` — neither the flag name nor any gate symbol. Capture-*marker* symbols (`CaptureMarker`, `parseMarkers`, `validateCapturePresent`) and `processCapture*` counts unchanged. The `src/` half is contract-backed by source-invariant assertions A009/A010 (Verify-checked); the docs + dogfood surfaces, which the `sourceCode` matcher cannot reach, are covered by the widened final clean-sweep grep below — Verify runs that grep.
- [ ] AC8: `configurability.mdx` documents `testEvidenceGate` with no legacy note.
- [ ] AC9: The dogfood root `.ana/ana.json` uses `testEvidenceGate: "on"`.
- [ ] AC10: Test count does not decrease from baseline (3589); rename coverage and new-key behavior (enablement on/off, absent fail-safe) are tested. No back-compat tests.
- [ ] `tsc --noEmit` passes with zero errors.
- [ ] Lint passes.

## Testing Strategy

- **Unit tests:**
  - `anaJsonSchema.test.ts` — schema accepts `{testEvidenceGate:'on'}` and parses it to `'on'`. (Rename any existing `captureGate` parse test to the new key.)
  - `artifact.test.ts` — `isTestEvidenceGateEnabled`: `{testEvidenceGate:'on'}` + resolvable test command → `true`; `{testEvidenceGate:'off'}` → `false`; absent flag → `false` (fail-safe). Block path: gate enabled + no seal → `applyTestEvidenceGate` blocks, error names `testEvidenceGate` / `set "testEvidenceGate": "off"`.
  - `config.test.ts` — `testEvidenceGate` is in `KNOWN_FIELDS` (no unknown-key warning). (Rename the existing `captureGate` assertion.)
- **Integration tests:**
  - `init.test.ts` — fresh `createAnaJson` emits `testEvidenceGate:'on'`. Re-init via `preserveUserState` preserves an explicit `{testEvidenceGate:'off'}` (rides along, not refreshed) — same preserve behavior previously covered for `captureGate`, renamed.
  - `doctor.test.ts` — Enforcement dimension reports `test_evidence_gate` correctly for `{testEvidenceGate:'on'}` (on / on-inactive depending on test-command resolution), using the renamed reader.
- **Edge cases:**
  - Absent flag → `isTestEvidenceGateEnabled` returns `false`, gate warns (never blocks).
  - Malformed `ana.json` → reader returns `false`, never throws (fail-safe).
- **Do NOT test:** legacy-only enforcement, key precedence, re-init convergence — none of these behaviors exist.

## Dependencies

`enforcement-state-in-doctor` (the predecessor scope) is **already merged** (commit `c9ff2880`). The doctor Enforcement view and its `test_evidence_gate` dimension exist; this spec renames within that post-merge code. Build against current `main`.

## Constraints

- **Migration-safe schema posture preserved.** `testEvidenceGate` is `optional` + no `.default` + `.catch(undefined)` — an absent flag stays absent through re-init and reads as off. (This is the original field's posture, carried to the new name — not a back-compat affordance.)
- **Type-checked rename.** Gate-symbol renames must leave `tsc --noEmit` clean.
- **Do not widen the blast radius.** No `processCapture*` renames, no marker-mechanism renames.
- **Total rename.** After this change, `captureGate`/`CaptureGate` appears nowhere in `packages/cli/src/`.

## Gotchas

- **`captureGate` never shipped — delete, don't preserve.** No fallback read, no legacy schema field, no migration block, no dual `KNOWN_FIELDS` entry. If you find yourself adding compatibility code, stop — there is no install base.
- **`evaluateCaptureGate` lives in `capture-marker.ts`, not `artifact.ts`** (`:252`), and so does its result type `CaptureGateResult` (`:57`). Both rename; the rest of that file does not. `artifact.ts` imports the evaluator — update the import name.
- **doctor.ts already uses the target vocabulary partially.** The local `testEvidenceGate` var and `test_evidence_gate` dimension field came from the predecessor scope — do NOT touch those. Only the raw flag-string read (`:462`) and the `isCaptureGateEnabled` import/call/JSDoc change.
- **Don't drop the reassurance line.** The block message's "`ana test` seals a harmless abstain even when no tests run" line exists because of proof finding C9 — keep it, just rename the flag references around it.
- **Grep after editing.** `captureGate` / `CaptureGate` → zero in `packages/cli/src/`. `CaptureMarker` / `parseMarkers` / `validateCapturePresent` / `processCapture` / `processCaptureStrict` → unchanged counts.

## Build Brief

### Rules That Apply
- All local imports use `.js` extensions; `node:` prefix for built-ins. `import type` separated from value imports.
- Named exports only — no default exports.
- Explicit return types on exported functions; `@param`/`@returns` JSDoc on exported functions (pre-commit enforces it).
- Engine purity does NOT apply here — `artifact.ts`/`doctor.ts`/`config.ts` are command-layer files; chalk + `process.exit(1)` are correct there.
- Prefer early returns: `if (anaJson['testEvidenceGate'] !== 'on') return false;` then flat carve-out logic.

### Pattern Extracts

The current reader being renamed (`artifact.ts:819-838`) — keep the carve-out exactly, swap only the flag string and the function name:

```ts
export function isCaptureGateEnabled(projectRoot: string): boolean {
  let anaJson: Record<string, unknown>;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8')) as unknown;
    anaJson = AnaJsonSchema.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }

  if (anaJson['captureGate'] !== 'on') return false;   // -> isTestEvidenceGateEnabled; anaJson['testEvidenceGate'] !== 'on'

  if (resolveTestCommandString(anaJson, undefined)) return true;
  const surfaces = anaJson['surfaces'] as Record<string, unknown> | undefined;
  for (const surfaceName of Object.keys(surfaces ?? {})) {
    if (resolveTestCommandString(anaJson, surfaceName)) return true;
  }
  return false;
}
```

The schema field to rename (`anaJsonSchema.ts:105-108`) — replace the name, keep the shape:

```ts
captureGate: z          // -> testEvidenceGate
  .enum(['on', 'off'])
  .optional()
  .catch(undefined),
```

The `createAnaJson` emit line (`state.ts:572`):

```ts
captureGate: 'on',      // -> testEvidenceGate: 'on'
```

### Proof Context

- **`captured-test-evidence-C9` [code] (artifact.ts):** The block message previously didn't reassure a build-only/no-tests agent that `ana test` seals a harmless abstain. A reassurance line was added. **Keep that line** when renaming the flag in the message — do not regress it.
- **`captured-test-evidence-C11` [test] (artifact.ts):** The arming predicate uses `warnings.length === 0` as a proxy, correct only because `evaluateCaptureGate` routes all non-blocking messages to warnings. After renaming to `evaluateTestEvidenceGate`, preserve that warning/error partition exactly — it is load-bearing.
- Other active findings on these files (`.saves.json` multi-read, provenance unstaged-file) are unrelated to this rename — no action.

### Checkpoint Commands

- After `anaJsonSchema.ts` + `artifact.ts` + `capture-marker.ts`: `(cd 'packages/cli' && pnpm vitest run anaJsonSchema artifact)` — Expected: green.
- After `state.ts` + `doctor.ts` + `config.ts`: `(cd 'packages/cli' && pnpm vitest run init doctor config)` — Expected: green.
- Type check: `(cd 'packages/cli' && pnpm tsc --noEmit)` — Expected: zero errors.
- After all changes: `pnpm run test -- --run` — Expected: ≥3589 tests pass.
- Lint: `(cd 'packages/cli' && pnpm run lint)` — Expected: clean.
- Final clean-sweep gate (AC7), run by Build AND independently by Verify — covers all three edited surfaces, including the docs + dogfood paths the `sourceCode` contract matcher cannot reach: `grep -rniE "captureGate" packages/cli/src website/content .ana/ana.json` → zero hits.

### Build Baseline
- Current tests: **3589** (3587 passed + 2 skipped)
- Current test files: **146**
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected **≥3589** tests in 146 files (no new test files; this is a rename — mostly renamed assertions plus a few new-key behavior tests, no back-compat tests).
- Regression focus: `artifact.test.ts`, `init.test.ts`, `doctor.test.ts`, `config.test.ts`, `work.test.ts`, `anaJsonSchema.test.ts` — every suite that holds a `captureGate` reference or fixture.
