# Spec: Move enforcement-gate state from `ana work status` to `ana doctor`

**Created by:** AnaPlan
**Date:** 2026-06-08
**Scope:** .ana/plans/active/enforcement-state-in-doctor/scope.md

## Approach

Three coordinated moves in one spec — a deletion in `work.ts`, a new dimension in `doctor.ts`, and a one-line bug fix in `config.ts`. They are halves of a single relocation, so they ship together.

1. **Subtract from `work.ts`.** The `Capture gate:` line, the helper that fed only it, the two `StatusOutput` gate fields, the gate fields at all three JSON-output sites, and the inline `ana.json` read that existed *only* to populate the raw flag. This is the "elegant solution removes" principle — the line goes away and so does the redundant second parse of `ana.json` (`getWorkStatus` currently parses the file inline AND again inside `isCaptureGateEnabled`). Keep the `lastScanAt` read — scan-freshness still needs it.

2. **Add an `Enforcement` dimension to `doctor.ts`.** One new dimension built exactly like the existing `assessSurfaces` (read `ana.json` once with a try/catch fallback → classify → format). It reports all three gates as one enforcement view. The dimension is **informational** — it carries a fixed `status: 'info'`, never `pass`/`warn`/`fail`, so it is structurally incapable of flipping doctor's exit code. (`hasRed` only inspects `cli_version` and `scan_freshness`; the `'info'` literal makes the intent explicit rather than implicit.)

3. **Fix the `KNOWN_FIELDS` gap.** `captureGate`, `processCapture`, `processCaptureStrict` are absent from the `KNOWN_FIELDS` set, so the documented `ana config set captureGate off` fires a spurious "not a known ana.json field" warning today. Add all three.

### Key design decision — the `EnforcementDimension` shape

`DimensionStatus` (`'pass' | 'warn' | 'fail'`) is the wrong type for this dimension: every gate value is a *valid configuration*, not a health grade. Give the dimension its own status literal, `status: 'info'`, so "never fails" is true by type, not by convention. Shape:

```
EnforcementDimension {
  status: 'info';                                  // fixed literal — not DimensionStatus
  test_evidence_gate: 'on' | 'on-inactive' | 'off';
  process_capture: 'on' | 'off';
  process_capture_strict: 'on' | 'off';
}
```

The three-way `test_evidence_gate` classification is exactly the logic in the `formatCaptureGateState` helper being deleted from `work.ts` — lift it, don't reinvent it:
- raw `captureGate === 'on'` AND `isCaptureGateEnabled(projectRoot)` → `'on'`
- raw `captureGate === 'on'` AND NOT enabled → `'on-inactive'`
- otherwise → `'off'`

### Key design decision — read count in `assessEnforcement`

Read `ana.json` **once** (raw `JSON.parse(fs.readFileSync(...))` in a try/catch, defaulting to all-off on failure — the same pattern as `assessSurfaces` at `doctor.ts:372-377`) to get the raw `captureGate` flag plus `processCapture` and `processCaptureStrict`. Then call `isCaptureGateEnabled(projectRoot)` **once** for the active/inactive carve-out — that function re-reads the file, so this is 2 reads total.

This is a deliberate choice: `isCaptureGateEnabled` owns the non-trivial "a test command resolves at top-level OR any surface" carve-out (`artifact.ts:819-838`). Reimplementing it inline to save one read would duplicate ~15 lines of the exact logic the scope says to reuse, and the two copies would drift. Doctor is a cold, human-invoked path; correctness-without-duplication wins over one file read. Do **not** also call `isProcessCaptureEnabled`/`isProcessCaptureStrictEnabled` (forensics.ts) — those are trivial `=== 'on'` checks; read both flags from the single raw parse instead. Net: 2 reads, zero duplicated logic.

## Output Mockups

### `ana doctor` (human) — Enforcement section, header + indented sub-lines

```
  ℹ Enforcement
      test-evidence gate  on
      process capture     off
      strict              off
```

Inactive test-evidence gate (flag on, no resolvable test command):

```
  ℹ Enforcement
      test-evidence gate  on (inactive — no test command)
      process capture     off
      strict              off
```

- The `ℹ` glyph is **neutral gray** (`chalk.gray('ℹ')` / `chalk.dim`), distinct from the green `✓`, yellow `○`, red `✗` used by other dimensions. It must not read as pass or warn.
- The header line carries no trailing state; each gate is its own indented sub-line (6-space indent under the 2-space dimension indent). Sub-line labels are left-aligned and padded so the values form a column, matching the mockup.
- Placement: after the Surfaces / legacy-field block and before the stale-work items in `formatTerminalOutput`.

### `ana doctor --json` — new `enforcement` block under `results.dimensions`

```json
{
  "results": {
    "dimensions": {
      "enforcement": {
        "status": "info",
        "test_evidence_gate": "on",
        "process_capture": "off",
        "process_capture_strict": "off"
      }
    }
  }
}
```

### `ana work status` (human) — after removal

The first content line is no longer `Capture gate: ...`. Output is the bold `Pipeline Status (...)` header, then branch notices / pipeline items / next actions only. No gate state anywhere.

## File Changes

(Machine-readable list is in contract.yaml `file_changes`. This is prose context.)

### `packages/cli/src/commands/work.ts` (modify)
**What changes:** Remove everything that fed only the gate readout. Delete the `captureGate` + `captureGateActive` fields from the `StatusOutput` interface (currently `:71-76`); the `formatCaptureGateState` helper and its JSDoc block (currently `:334-344`); the `Capture gate:` print line in `printHumanReadable` (currently `:348`); the inline `captureGate` parse and the `captureGateActive = isCaptureGateEnabled(...)` call in `getWorkStatus` (currently `:501`, `:507`, `:512-514`); and the `captureGate` / `captureGateActive` fields at all three JSON-output construction sites (currently `:528-529`, `:540-541`, `:584-585`). Keep the `lastScanAt` read in the same try/catch. Remove the now-unused `isCaptureGateEnabled` import (currently `:36`).
**Pattern to follow:** N/A — pure deletion. After editing, the surrounding `getWorkStatus` shape is unchanged except the two fields are gone from all three output objects.
**Why:** The gate's state does not change agent behavior — it's enforced mechanically at the action. Carrying it in the high-frequency `work status` surface is chrome every agent reads. The inline parse existed only to populate it.

### `packages/cli/src/commands/doctor.ts` (modify)
**What changes:** Add the `EnforcementDimension` interface (near the other dimension interfaces, ~`:87-100`); add an `assessEnforcement(projectRoot: string): EnforcementDimension` assessor (near `assessSurfaces`); add `enforcement: EnforcementDimension` to the `DoctorDimensions` interface (`:102-109`); call `assessEnforcement` in `runDoctor` and include it in the returned `dimensions` (`:678-709`); render the Enforcement block in `formatTerminalOutput` after the surfaces/legacy block and before stale work (`:609-634`). Import `isCaptureGateEnabled` from `./artifact.js`.
**Pattern to follow:** `assessSurfaces` (`:368-421`) for the once-only null-guarded `ana.json` read and the classify-then-return shape; its terminal block (`:609-623`) for the formatting style. The functional logic for the three-way test-evidence classification mirrors the deleted `formatCaptureGateState`.
**Why:** Config/enforcement health is something a human checks deliberately — that is what `ana doctor` is for. Grouping all three gates as one view sets the pattern before the gate family grows.

### `packages/cli/src/commands/config.ts` (modify)
**What changes:** Add `'captureGate'`, `'processCapture'`, `'processCaptureStrict'` to the `KNOWN_FIELDS` set (`:44-61`).
**Pattern to follow:** The existing string entries in the set.
**Why:** Pre-existing bug — the documented `ana config set captureGate off` currently prints "not a known ana.json field." These are real, schema-defined fields (`anaJsonSchema.ts:105-123`).

### `packages/cli/tests/commands/config.test.ts` (modify)
**What changes:** Add three cases proving `ana config set` no longer warns for the gate keys — `captureGate`, `processCapture`, `processCaptureStrict` each produce no "not a known ana.json field" text on the error stream.
**Pattern to follow:** The existing `runCommand(program, [...])` + error-spy harness in this file (`getErrorOutput` at `:93`).
**Why:** AC6.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** The `describe('capture gate status readout', ...)` block (`:644-687`) tests the removed behavior. Do NOT just delete it — repurpose its four cases so test count does not drop. Two clean options, pick whichever keeps counts steady: (a) move the equivalent coverage into `doctor.test.ts` as Enforcement-dimension tests (preferred — the behavior moved, so the tests move with it), and replace the work.test.ts block with assertions that the gate line / fields are *absent* from `work status` output; or (b) convert the four cases in place to absence assertions. Net test count for the package must not decrease.
**Pattern to follow:** Existing `getWorkStatus` capture/parse helpers already in this file (`captureOutput`, `createWorkTestProject`, the local `setCaptureGateConfig`).
**Why:** AC8 — count does not decrease; the removed line must be proven gone.

### `packages/cli/tests/commands/doctor.test.ts` (modify)
**What changes:** Add Enforcement-dimension coverage: gate on + test command → `'on'`; gate on + no resolvable test command → `'on-inactive'`; absent flags → `'off'` / `'off'` / `'off'`; `processCapture`/`processCaptureStrict` on → reported; and that `results.overall` stays `'pass'` when only enforcement is "set" (never flips exit code).
**Pattern to follow:** `createMinimalProject` (`:24-125`) with `anaJson` overrides for the gate flags; assert on `runDoctor(tmpDir)` results (`runDoctor` is exported for exactly this). Mirror the existing dimension tests (`:127-225`).
**Why:** AC3, AC4, AC5.

## Acceptance Criteria

- [ ] AC1: `ana work status` (human) no longer prints `Capture gate:` or any gate state — output is pipeline state + next actions only.
- [ ] AC2: `ana work status --json` no longer contains `captureGate` or `captureGateActive` fields (all three output sites: main, empty-slugs JSON, empty-slugs notifications).
- [ ] AC3: `ana doctor` (human) shows an Enforcement section reporting the test-evidence gate including the `on (inactive — no test command)` case, plus process capture and strict.
- [ ] AC4: `ana doctor --json` carries the equivalent `enforcement` block under `results.dimensions`.
- [ ] AC5: The Enforcement dimension never causes `ana doctor` to exit non-zero (`status: 'info'`, kept out of `hasRed`).
- [ ] AC6: `ana config set captureGate off` (and `processCapture`, `processCaptureStrict`) no longer prints the "not a known ana.json field" warning.
- [ ] AC7: The inline `ana.json` read in `getWorkStatus` no longer parses `captureGate`; `lastScanAt` / scan-freshness behavior is unchanged.
- [ ] AC8: Package test count does not decrease; work-status gate tests repurposed (not just deleted); doctor tests cover the new dimension including the inactive case.
- [ ] `grep captureGate packages/cli/src/commands/work.ts` returns zero matches after the edit.
- [ ] `isCaptureGateEnabled` remains exported from `artifact.ts` (doctor is now its consumer).
- [ ] `pnpm vitest run` (in `packages/cli`) passes; `pnpm run lint` passes (no unused-import error from the dropped `work.ts` import).

## Testing Strategy

- **Unit tests (doctor):** Drive `runDoctor(tmpDir)` against `createMinimalProject` fixtures with `anaJson` overrides. Cover: (1) `captureGate: 'on'` + a resolvable `commands.test` → `test_evidence_gate === 'on'`; (2) `captureGate: 'on'` + `commands: {}` + `surfaces: {}` → `'on-inactive'`; (3) no gate flags → all three `'off'`; (4) `processCapture: 'on'` / `processCaptureStrict: 'on'` → reported as `'on'`; (5) `results.overall === 'pass'` and `enforcement.status === 'info'` when gates are set with no other failures.
- **Unit tests (work status):** Assert the gate line and JSON fields are absent (human output `not.toContain('Capture gate')`; `Object.keys(parsedJson)` excludes both fields). Keep `lastScanAt`-driven scan-freshness coverage intact.
- **Unit tests (config):** `ana config set captureGate off` produces no "not a known" warning on the error stream; same for `processCapture` and `processCaptureStrict`. (Use the existing config.test.ts `runCommand` + error-spy harness.)
- **Edge cases:** absent `ana.json` (assessEnforcement returns all-off, no crash); `captureGate: 'on'` with malformed/unreadable config (falls to off branch consistently).

## Dependencies

None. All touched code exists on `main`. `cross-machine-provenance` (which added `processCapture`/`processCaptureStrict`) is already merged.

## Constraints

- **JSON contract relocation is intentional and breaking.** `work status --json` loses two fields; `doctor --json` gains the `enforcement` block. Verified no `templates/` consumer reads the `work status` gate fields — re-confirm with `grep -rn "captureGate" packages/cli/templates/` (expect zero) and call the relocation out in the build report.
- **Doctor must never exit non-zero from enforcement.** Keep `enforcement` out of the `hasRed` array (`doctor.ts:691`) and the `redCount` array in `formatFooter` (`:647-650`).
- Backward-compat: `isCaptureGateEnabled` stays exported from `artifact.ts` (function body unchanged).

## Gotchas

- **Three JSON-output sites in `work.ts`, not one** — `:528-529`, `:540-541`, `:584-585`. Miss one and the field lingers in a branch. After editing, `grep captureGate packages/cli/src/commands/work.ts` must return zero.
- **Drop the unused import** — after removing the `work.ts` usage, delete the `isCaptureGateEnabled` import (`:36`); lint (`@typescript-eslint/no-unused-vars`) will fail otherwise. Keep the export in `artifact.ts`.
- **Keep `lastScanAt`** — it shares the try/catch with the `captureGate` parse being removed. Delete only the `captureGate` line, not the whole block.
- **Possible import cycle** — `doctor.ts` will import from `artifact.ts`. Confirm `artifact.ts` does not import `doctor.ts` (it doesn't today, but verify after wiring — a cycle would surface as `undefined` at module load). If a cycle appears, import `isCaptureGateEnabled` from wherever it's cleanly reachable, or move the check — but the straight import is expected to be fine.
- **`status: 'info'` is a new literal, not in `DimensionStatus`** — type `EnforcementDimension.status` as the literal `'info'`, not as `DimensionStatus`. This is intentional; it keeps the dimension out of any pass/fail computation by construction.

## Build Brief

### Rules That Apply
- All relative imports end in `.js` (`import { isCaptureGateEnabled } from './artifact.js'`) — ESM resolution crashes at runtime otherwise.
- `import type` for type-only imports, separate from value imports.
- Explicit return types on all exported functions; exported functions need `@param`/`@returns` JSDoc (eslint enforces — `assessEnforcement` is internal so inference is fine, but match the JSDoc style of the sibling assessors which all carry it).
- Prefer early returns / the established try-catch-return-default shape; no `any` (use `Record<string, unknown>` for the raw parse, as `assessSurfaces` does).
- Tests use `fs.mkdtemp` temp dirs with `afterEach` cleanup (already the pattern in both test files).

### Pattern Extracts

`assessSurfaces` — the once-only null-guarded `ana.json` read + classify shape to mirror (`doctor.ts:368-377`):
```ts
function assessSurfaces(projectRoot: string): SurfacesDimension {
  const anaJsonPath = path.join(projectRoot, '.ana', 'ana.json');
  let anaContent: Record<string, unknown> = {};
  try {
    anaContent = JSON.parse(fs.readFileSync(anaJsonPath, 'utf-8'));
  } catch {
    return { status: 'pass', count: 0, missing_test: [], drift: false, drift_scan_count: null, legacy_fields: [] };
  }
  // ... classify from anaContent ...
}
```

The three-way classification to lift from the deleted `formatCaptureGateState` (`work.ts:339-344`):
```ts
function formatCaptureGateState(flag: 'on' | 'off' | null, active: boolean): string {
  if (flag === 'on') {
    return active ? 'on' : 'on (inactive — no test command configured)';
  }
  return 'off';
}
```
For the dimension, express this as the enum value: `flag === 'on' ? (active ? 'on' : 'on-inactive') : 'off'`, where `active = isCaptureGateEnabled(projectRoot)`.

The active-check carve-out being reused (`artifact.ts:819-838`) — already reads + Zod-parses `ana.json`, undefined-safe (missing file → `false`):
```ts
export function isCaptureGateEnabled(projectRoot: string): boolean {
  // ... parse ana.json (returns false on failure) ...
  if (anaJson['captureGate'] !== 'on') return false;
  if (resolveTestCommandString(anaJson, undefined)) return true;
  const surfaces = anaJson['surfaces'] as Record<string, unknown> | undefined;
  for (const surfaceName of Object.keys(surfaces ?? {})) {
    if (resolveTestCommandString(anaJson, surfaceName)) return true;
  }
  return false;
}
```

Terminal dimension formatting style (`doctor.ts:609-623`) — chalk glyph + indented line; enforcement uses a neutral gray `ℹ` and a header + indented sub-lines (see Output Mockups).

### Proof Context
Active findings touching these files (from `ana proof context`, curated):
- **`retire-capture-self-arming-C3`** (observation, `work.ts:~500`) — `getWorkStatus` reads + parses `ana.json` twice per call (inline for `lastScanAt`/`captureGate`, then again inside `isCaptureGateEnabled` for `captureGateActive`). This scope **resolves** it: the inline `captureGate` parse and the `captureGateActive` call both leave `work.ts`. The `lastScanAt` inline read remains (single, necessary). Note in the build report that this finding is closed by the deletion.
- No active findings for `doctor.ts` or `config.ts` beyond the above.

### Checkpoint Commands
- After `work.ts` edit: `(cd packages/cli && pnpm vitest run tests/commands/work.test.ts)` — Expected: passes after the gate-readout block is repurposed; `grep captureGate packages/cli/src/commands/work.ts` returns zero.
- After `doctor.ts` edit: `(cd packages/cli && pnpm vitest run tests/commands/doctor.test.ts)` — Expected: new Enforcement tests pass.
- After `config.ts` edit: `(cd packages/cli && pnpm vitest run tests/commands/config.test.ts)` — Expected: no "not a known" warning for the three keys.
- After all changes: `pnpm vitest run` (from repo root, surface cli) — Expected: ≥ 3573 tests pass (count must not drop).
- Lint: `(cd packages/cli && pnpm run lint)` — Expected: clean (no unused-import error).

### Build Baseline
- Current tests: 3573 passing, 2 skipped
- Current test files: 146
- Command used: `pnpm vitest run` (in `packages/cli`)
- After build: 3573 + new Enforcement tests, work-status gate tests repurposed (not removed) → count must be ≥ 3573
- Regression focus: `work.test.ts` (gate-readout block repurposed), `doctor.test.ts` (new dimension), `config.test.ts` (warning gone), and any test asserting `work status --json` shape.
