# Spec: Captured Test Evidence — Phase 2 (Self-arming flip to fail-closed)

**Created by:** AnaPlan
**Date:** 2026-06-05
**Scope:** .ana/plans/active/captured-test-evidence/scope.md
**Depends on:** Phase 1 (spec-1.md) — the capturing runner, marker, inliner, three validators, and the `evaluateCaptureGate` orchestrator must exist.

> **Phase 1 observes; Phase 2 enforces.** Phase 1 shipped the integrity spine in warn-mode so it could never brick the install base. Phase 2 makes the gate **fail-closed — but only for a project that has already proven it can capture.** The flip is automatic and per-project: a project arms itself the moment it seals one valid capture. A project that never captured stays in warn-mode forever and is never blocked. This is the brick-proof guarantee the whole design was built around — do not weaken it to version-keyed.

---

## Approach

The keystone is a **marker-sealed arming signal**, stored as a sticky per-project flag, with **check-then-arm** ordering so the arming save can never block itself.

1. **Arming store** (`capture-state.ts`, new) — `isArmed(projectRoot) → boolean` reads `.ana/state/capture.json` and is **undefined-safe** (missing file → `false`). `armCapture(projectRoot)` writes `{ "armed": true, "armedAt": "<iso>" }`. `.ana/state/` is the established machine-state location (gitignored — local to each developer), so arming is project-scoped, survives across work items, and is invisible to the proof chain and to git. It is a **separate file** — it adds **zero reads** to the hot `.saves.json` path.

2. **The flip in `evaluateCaptureGate`** — Phase 1's orchestrator already returns `{ blocked, warnings, errors }` and already takes an `armed` flag. Phase 2 wires the real signal: when `armed === true` and any preservation validator fails → `blocked = true`. When `armed === false` → `blocked = false` (warn-only), unchanged. **Fail-OPEN on counts, fail-CLOSED only on preservation** (missing marker / sha mismatch / byte-length mismatch) — `abstain` counts never block, after the flip as before.

3. **Check-then-arm at the save sites** (`artifact.ts`) — at **both** build-report save sites, in order:
   1. Read `armed = isArmed(projectRoot)`.
   2. `const gate = evaluateCaptureGate(buildReportPath, { armed })`. If `gate.blocked` → print errors + `process.exit(1)` (**before** `writeSaveMetadata`).
   3. Otherwise emit warnings; proceed to seal.
   4. **After** a successful, valid build-report save (all three validators passed this save), call `armCapture(projectRoot)`.
   So the save that first produces a valid capture is evaluated while still un-armed (`blocked` false), seals, then arms — it never blocks itself. The **next** build-report save with no/invalid capture is blocked.

4. **Gate scope = `build_report.md` only.** `verify_report.md` saves are never gated (Verify's independence is preserved — its capture is still inlined + sealed per Phase 1, just not gated). Build-only specs with no contract, and saves with no build report, never trigger the gate.

**Why marker-sealed, not version-keyed (locked decision).** Version-keyed arms the instant a project is on a capture-aware `anaVersion`/post-re-init — simpler, no store — but it *assumes* re-init put the agent on the capture path. If the refreshed template didn't take, or the first build ran raw, the project is armed-with-no-marker and fail-closed: the exact residual brick this design exists to remove. Marker-sealed arms only after a real capture is sealed, so **arming itself is proof the agent is already capturing.** Brick-proof by construction.

---

## Output Mockups

**An armed project, build-report save with no valid capture → blocked:**
```
$ ana artifact save build-report captured-test-evidence
✗ Error: build_report.md has no valid captured test evidence.
  This project has previously sealed a real capture, so test evidence is required.
  Run tests via `ana test --stage build --slug captured-test-evidence` and paste the
  emitted marker into build_report.md, then save again.
  (failed: validateCapturePresent)
[exit 1]
```

**The arming save itself (first valid capture) → never blocked:**
```
$ ana artifact save build-report some-slug
✓ build_report.md sealed (capture: vitest 47p/0f/2s, verdict pass)
  capture gate armed for this project — future build reports now require valid evidence.
```

**A never-captured project (warn-mode, unchanged from Phase 1) → never blocked:**
```
$ ana artifact save build-report legacy-slug
⚠ Warning: build_report.md has no captured test evidence (capture gate not yet armed
  for this project — warn-mode). Run tests via `ana test` to start sealing evidence.
✓ build_report.md sealed.
```

**A verify_report save (never gated, even when armed):**
```
$ ana artifact save verify-report some-slug
✓ verify_report.md sealed (capture inlined; verify reports are not gated).
```

---

## File Changes

### `packages/cli/src/utils/capture-state.ts` (create)
**What changes:** `isArmed(projectRoot: string): boolean` — reads `.ana/state/capture.json`, returns `false` on missing file / parse error (undefined-safe). `armCapture(projectRoot: string): void` — writes `{ armed: true, armedAt: <iso> }` (idempotent; don't rewrite if already armed). Small, pure-ish module; no chalk.
**Pattern to follow:** the undefined-safe read pattern of `readSaveMetadata` (`artifact.ts:498`) — `existsSync` guard, try/catch around `JSON.parse`, safe default.
**Why:** the sticky, brick-proof arming signal. Separate file = zero added reads on the hot `.saves.json` path.

### `packages/cli/src/utils/capture-marker.ts` (modify)
**What changes:** Wire the real fail-closed behavior into `evaluateCaptureGate`: when `armed` and a **preservation** validator (`validateCapturePresent` / `validateCaptureInlined` / `validateCaptureNotTruncated`) fails → `blocked = true`. Counts/verdict `abstain` must **never** set `blocked` (fail-open on counts). When `!armed` → `blocked` stays `false`.
**Pattern to follow:** the `{ blocked, warnings, errors }` contract established in Phase 1 — Phase 2 only flips the `blocked` computation; the validator set is unchanged.
**Why:** this is the enforcement flip.

### `packages/cli/src/commands/artifact.ts` (modify)
**What changes:** At **both** build-report save sites (the `evaluateCaptureGate` calls added in Phase 1), implement **check-then-arm**: (1) `armed = isArmed(projectRoot)`; (2) evaluate the gate; if `gate.blocked` → print `gate.errors` in red + `process.exit(1)` **before** `writeSaveMetadata`; (3) else emit `gate.warnings`; (4) **after** a successful valid build-report save, call `armCapture(projectRoot)`. Scope strictly to `build_report.md` — do not touch the `verify_report.md` save path. `projectRoot` is already resolved at both sites (`findProjectRoot()`).
**Pattern to follow:** the existing `process.exit(1)` fail pattern at the build-report format validator (`:928`), now driven by `gate.blocked`. Reuse `readSaveMetadata` (`:498`) — do not add a new `.saves.json` reader.
**Why:** wiring one site is bypassable; both gate before the seal hash.

### `packages/cli/tests/utils/capture-state.test.ts` (create)
**What changes:** Unit tests for `isArmed`/`armCapture` (see Testing Strategy).
**Why:** the arming signal is the keystone; it must be proven undefined-safe and sticky.

---

## Acceptance Criteria

Copied from scope (Phase 2), expanded:

- [ ] **AC12:** On the **marker-sealed** arming signal, the three validators arm to **fail-closed**: a build-report save with no marker / sha mismatch / byte-length mismatch hits `process.exit(1)` at the existing save-time gate, before the seal hash. The signal is automatic, not a user-toggled setting.
- [ ] **AC13:** A project not yet capture-aware (never captured) remains in warn-mode and is **never blocked**. Fail-OPEN on counts and fail-CLOSED only on preservation hold after the flip.
- [ ] **AC14:** Build-only specs with no contract, and saves with no build report, never trigger the gate. The gate is scoped to `build_report.md`; `verify_report.md` saves are not gated.
- [ ] **New (check-then-arm):** The first valid-capture build-report save is never blocked; it seals and then arms. The *next* invalid build-report save on the same project is blocked.
- [ ] **New:** `isArmed` is undefined-safe — a fresh project (no `.ana/state/capture.json`) returns `false`; a malformed file returns `false`.
- [ ] **New:** `armCapture` is idempotent and writes only to `.ana/state/` (never to `ana.json`, never to the proof chain).
- [ ] **New:** `pnpm vitest run` in `packages/cli` passes; test count does not decrease; `tsc --noEmit` clean.

---

## Testing Strategy

- **Unit — arming (`tests/utils/capture-state.test.ts`):**
  - `isArmed` on a temp dir with no `.ana/state/capture.json` → `false`.
  - `isArmed` after `armCapture` → `true`; file contains `armed: true` + an `armedAt`.
  - `isArmed` on a malformed `capture.json` → `false` (undefined-safe).
  - `armCapture` idempotent (second call doesn't corrupt; armedAt may stay first-set).
- **Unit — the flip (`capture-marker` gate tests, extend Phase 1's):**
  - `evaluateCaptureGate(badReport, { armed: true })` → `blocked === true`, errors name the failed validator.
  - `evaluateCaptureGate(badReport, { armed: false })` → `blocked === false` (warn-only).
  - `evaluateCaptureGate(reportWithAbstainCountsButValidPreservation, { armed: true })` → `blocked === false` (fail-open on counts).
  - `evaluateCaptureGate(validReport, { armed: true })` → `blocked === false`.
- **Integration — check-then-arm + scope (use temp project dirs, exercise the gate orchestration as the command path does):**
  - First valid-capture save on an un-armed project: not blocked → seals → armed.
  - Next no-capture save on the now-armed project: blocked (exit path).
  - A `verify_report.md` save on an armed project with no/invalid capture: **not** gated.
  - A non-build-report save (e.g. spec/contract) on an armed project: not gated.
- **Regression:** the full Phase 1 suite stays green; warn-mode behavior for never-captured projects is unchanged.

---

## Dependencies

- Phase 1 complete (runner, marker, inliner, three validators, `evaluateCaptureGate` orchestrator, gate wired warn-mode at both save sites).
- `node:fs`, `node:path` only. No new npm dependencies.

---

## Constraints

- **Brick-proof is non-negotiable.** Marker-sealed only. Never arm a project that hasn't sealed a real capture.
- **Fail-OPEN on counts, fail-CLOSED on preservation** — abstain counts never block, after the flip.
- **Gate scope = `build_report.md` only** — `verify_report.md` is never gated.
- **Check-then-arm ordering** — evaluate before arming so the arming save never blocks itself.
- **`.ana/state/` only** for the flag — never `ana.json` (user-owned, preserved on re-init), never the proof chain.
- **Hot file:** reuse `readSaveMetadata`; the arming flag is a separate file (no added `.saves.json` reads).
- `.js` imports, `node:` builtins, `import type`, explicit return types, JSDoc on exports; test count must not decrease; `tsc --noEmit` clean.

---

## Gotchas

- **Order is the whole correctness story.** Check the gate (block if `armed && invalid`) **before** calling `armCapture`. Reverse the order and the first valid save would arm then... still pass (it's valid) — but the subtle bug is arming on an *invalid* save. Only `armCapture` after the save is confirmed valid (all three validators passed this save).
- **Undefined-safe `isArmed`.** A missing or malformed `.ana/state/capture.json` MUST mean "not armed" → warn-mode. A throw here would brick every fresh project — the opposite of the goal.
- **Do not arm on a checkpoint or a verify save.** Only a valid `build_report.md` save arms the project.
- **`verify_report.md` stays ungated** even when armed — re-check you didn't wire the gate into the verify save path.
- **`.ana/state/` is gitignored** (Phase 1 added `.captures/`; `state/` is already ignored) — arming is per-developer-checkout local. That is intended: arming reflects "this working copy has demonstrably captured," and the warn→flip safety holds regardless.

---

## Build Brief

### Rules That Apply
- `.js` import extensions; `node:` builtins; `import type` for type-only imports.
- Named exports; explicit return types; `@param`/`@returns` JSDoc on exports.
- Pure-ish util: no chalk/ora in `capture-state.ts`; user-facing output stays in `artifact.ts`.
- Undefined-safe reads: `existsSync` guard + try/catch with a safe default (mirror `readSaveMetadata`).

### Pattern Extracts

**Undefined-safe read to mirror for `isArmed`** (`artifact.ts:498-507`):
```ts
function readSaveMetadata(slugDir: string): Record<string, SaveMetadata> {
  const savesPath = path.join(slugDir, '.saves.json');
  if (!fs.existsSync(savesPath)) return {};
  try { return JSON.parse(fs.readFileSync(savesPath, 'utf-8')) as Record<string, SaveMetadata>; }
  catch { return {}; }
}
```

**The fail pattern the blocked branch drives** (`artifact.ts:928-934`):
```ts
if (typeInfo.baseType === 'build-report') {
  // Phase 2: const gate = evaluateCaptureGate(filePath, { armed: isArmed(projectRoot) });
  // if (gate.blocked) { console.error(chalk.red(...gate.errors)); process.exit(1); }
  // ... seal ...
  // if (valid) armCapture(projectRoot);
}
```

**The seal the gate must precede** (`artifact.ts:73-75`):
```ts
const hash = createHash('sha256').update(content).digest('hex');
const fullHash = `sha256:${hash}`;
```

### Proof Context
- `artifact.ts` — active findings `fix-false-rejection-archive-C3` / `multi-phase-report-naming-guard-C1` flag repeated `.saves.json` reads. The arming flag is a **separate file** (`.ana/state/capture.json`) precisely so it adds no reader to that hot path. Don't route arming through `.saves.json`.

### Checkpoint Commands
- After `capture-state.ts` + test: `ana test --slug captured-test-evidence -- "(cd 'packages/cli' && pnpm vitest run capture-state)"` — Expected: arming unit tests pass (undefined-safe, sticky, idempotent).
- After the flip wiring: `ana test --slug captured-test-evidence -- "(cd 'packages/cli' && pnpm vitest run capture-marker)"` — Expected: armed→blocked, unarmed→warn, fail-open-on-counts tests pass.
- After all changes (baseline): `ana test --stage build --slug captured-test-evidence` — Expected: full `packages/cli` suite green, test count ≥ Phase 1.
- Lint: `(cd 'packages/cli' && pnpm run lint)` and `tsc --noEmit` clean.

### Build Baseline
Run `(cd 'packages/cli' && pnpm vitest run)` after Phase 1 merges and record exact counts before Phase 2 code:
- Current tests (post-Phase-1): {record exact number}
- Current test files: {record exact number}
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected {Phase-1 count + arming unit + flip tests} across {Phase-1 files + 1}.
- Regression focus: `artifact.ts` (gate now blocks — verify never-captured/verify-report/non-build-report paths stay open), `capture-marker.ts` (`evaluateCaptureGate` blocked computation).
