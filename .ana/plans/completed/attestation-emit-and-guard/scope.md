# Scope: Make behavioral attestation reliably emit, and crash-proof the save path when anatrace-core is absent

**Created by:** Ana
**Date:** 2026-06-16

## Intent

Anatomia's headline differentiator — behavioral attestation — has never produced a record. Two defects, one work item:

1. **Crash, not degrade.** The static unguarded value import of `anatrace-core` (`compliance.ts:34-40`) throws at *module load*. Because `artifact.ts:32` statically imports `captureComplianceAtSave` from that module, an absent core takes down the **entire** `ana artifact save` command (called synchronously at `artifact.ts:1322` and `:1757`) rather than abstaining. The save path is a latent reliability break.

2. **Zero emit.** No compliance record has ever been written. The consumed engine is uninstalled at runtime *and* the pipeline runs a stale `dist` (dated 13 Jun) that does not contain the emit code. The global `ana` the pipeline executes is the main tree's `dist` — so installing core is necessary but **not sufficient**; the dist must be rebuilt and the running binary verified to contain `captureComplianceAtSave`.

The fix: replace **only** the value import with a synchronous guarded `createRequire` inside `captureComplianceAtSave` (the GUARD design — decided, do not bundle), so absent core degrades **loudly** instead of crashing; then install core, rebuild the dist, prove the running binary contains the emit code, and produce the first real records. **This cycle's own build/verify saves are the first real attestation emit — the dogfood records ARE the deliverable.**

## Complexity Assessment

- **Kind:** fix
- **Size:** medium
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/utils/compliance.ts` — replace value import with guarded sync require + just-in-time loud line
  - `packages/cli/tests/utils/compliance.test.ts` — bidirectional regression test
  - Operational (no source change): `pnpm install` (fetch `anatrace-core@0.4.0`), rebuild main-tree `dist`
- **Blast radius:** `captureComplianceAtSave` runs on **every** `ana artifact save` path (`artifact.ts:1322`, `:1757`). The code change is strictly safer (crash → abstain), but it is a universal path — any regression here affects all saves. The dist rebuild affects the binary every pipeline stage runs.
- **Estimated effort:** Small code diff (one import → guarded require + one loud line, one test). Medium overall: the install/rebuild/verify-running-binary sequencing and the "first real emit" deliverable are the bulk of the work.
- **Multi-phase:** no

## Approach

**Strategy, not implementation.** Two moves:

**Move 1 — Crash-proof via guard (decided: GUARD, do not bundle).** Keep `anatrace-core` a normal external dependency (tsup already externalizes it; no `noExternal` — leave it). The hazard is the *static value import* resolving at module load. Replace only that value import with a **synchronous** guarded load inside `captureComplianceAtSave`, mirroring the exact idiom `readCoreVersion` already uses (`createRequire(import.meta.url)('anatrace-core')` in try/catch). Synchronous is required: `captureComplianceAtSave` is called synchronously at both save sites, so `await import()` would ripple into a signature-changing refactor. On failure, abstain (return `null`, like every existing guard) **and** surface one loud stderr line — never silent. Leave the type-only import alone (erased at compile time, already crash-safe).

**Move 2 — Actually emit, against the stale-dist reality.** Installing core is necessary but not sufficient because the pipeline runs the main tree's stale dist. So: install core in the main tree, rebuild the dist there, and **prove** (not assume) the running `ana`/dist contains `captureComplianceAtSave` before this cycle's build/verify saves execute. Then confirm a real record lands on disk.

## Acceptance Criteria

- **AC1:** With `anatrace-core` unresolvable, `ana artifact save` does **not** crash: `captureComplianceAtSave` returns `null` and emits the loud surfaced "behavioral attestation disabled — anatrace-core not resolvable" line. Pinned by a regression test simulating unresolvable core.
- **AC2:** The pipeline's running `ana`/dist provably contains the emit code — verified by grepping the running binary/dist for `captureComplianceAtSave`, not assumed. This closes the stale-dist gap.
- **AC3:** ≥1 real compliance record on disk with `anatrace_core_version == "0.4.0"`, non-empty `verdicts[]`, `coverage.total > 0`, and the deterministic claim `ana-verify:verify-independence` **evaluated and present** in a record (any status — satisfied / violated / unverifiable). This is the **verify-role** record (the claim comes from the verify mandate); a clean cycle that did not read the build report reads satisfied/unverifiable, and that satisfies AC3. **Do not require a violation.**
- **AC4:** C12 abstain-on-empty-version (`compliance.test.ts:351`) and the dynamic version-lock test (`compliance.test.ts:144`, `createRequire` on `anatrace-core/package.json`) both still pass.

## Edge Cases & Risks

- **Loud-line noise (the placement trap).** `captureComplianceAtSave` has ~6 benign early-return abstains (capture disabled, no role, no session id, unreadable/unparsable transcript, empty mandate). If the guarded require / loud line is placed at the top of the function, it fires on every innocent abstain. **It must be placed just-in-time — immediately before first core use (~line 252/257, before `parseSession`/`anatomiaAdapter.extract`/`runCompliance`).** "Never silent" means loud-when-wanted, not loud-always.
- **Stale-dist sequencing (the re-emit-zero trap).** The global `ana` is an absolute symlink to the *main tree's* `dist/index.js`. Build and Verify invoke that global `ana` even from a worktree. If the main-tree install+rebuild has not landed before this cycle's build/verify save sites run, we re-emit zero records. The rebuild is a **precondition**, and grepping the running binary is the **hard gate** that catches a missed rebuild.
- **Module-resolution path.** `createRequire(import.meta.url)` resolves from the `dist` location → main tree `node_modules`. So core must be installed in the main tree's `node_modules`, not only declared. (`package.json:59` already pins `0.4.0`; it is in the lockfile but absent from `node_modules`.)
- **Version pin.** `anatrace-core` is pinned exactly (`0.4.0`, no caret/tilde); `tests/commands/_capture.test.ts:220` asserts this. Install must honor the exact pin.

## Rejected Approaches

- **Bundle anatrace-core (noExternal in tsup).** Rejected (decided upstream). Keeps core a normal dependency; the GUARD makes absence degrade loudly. Bundling would couple the published engine into the CLI artifact and defeat the version-lock provenance the records depend on.
- **`await import('anatrace-core')` (async dynamic import).** Rejected: `captureComplianceAtSave` is synchronous and called synchronously at `artifact.ts:1322`/`:1757`. Async would force a signature change rippling through both save sites — a refactor disproportionate to a crash-guard.
- **Silent abstain on absent core.** Rejected: violates "Never silent." The feature would remain invisibly broken — exactly how it reached zero records. Absent-when-wanted must surface.
- **Touch the type-only import (line 41).** Rejected: `import type {...}` is erased at compile time, causes no runtime resolution, and is already crash-safe. Only the value import is the hazard.

## Open Questions

- Exact wording of the loud stderr line (e.g. "behavioral attestation disabled — anatrace-core not resolvable; reinstall to enable"). Design judgment for Plan.
- Precise insertion point of the guarded require within `captureComplianceAtSave` — recommend immediately before first core use (`parseSession`/`anatomiaAdapter.extract`/`runCompliance`, ~line 252-257) so all benign early-returns precede it and stay quiet.
- How Build mechanically proves the *running* binary is the rebuilt one: rebuild → ensure global `ana` points at it → grep `dist/index.js` for `captureComplianceAtSave` → run a real save and confirm a record.

## Exploration Findings

### Patterns Discovered
- `compliance.ts:34-40` — the static VALUE import (`anatomiaAdapter, parseSession, runCompliance, scrubDeep, transcriptContentResolver` from `anatrace-core`). This is the module-load crash source.
- `compliance.ts:41` — `import type { Harness, Mandate, NamedBlob } from 'anatrace-core'` — type-only, erased at compile, crash-safe. **Leave alone.** (Brief said line 37; it is line 41.)
- `compliance.ts:56-64` — `readCoreVersion()`: the **exact** guarded idiom to mirror — `createRequire(import.meta.url)` in try/catch returning a safe fallback (`''`).
- `compliance.ts:200-269` — `captureComplianceAtSave`: `export function ... : string | null`. Synchronous. Early-return abstains at lines 207, 213, 216, 233, 238, 246, 253, 256, 258. First core use is `parseSession` at line 252, then `anatomiaAdapter.extract` (257) and `runCompliance` (261).
- `artifact.ts:32` — static import of `captureComplianceAtSave`. Called synchronously (no `await`) at `:1322` and `:1757`; both guard on truthy return before logging.

### Constraints Discovered
- [TYPE-VERIFIED] `captureComplianceAtSave` (compliance.ts:200) returns `string | null`, synchronous — async guard would change the signature.
- [OBSERVED] Stale dist: `packages/cli/dist/index.js` mtime **13 Jun 02:48**; `grep -c captureComplianceAtSave dist/index.js` → **0**; no `anatrace-core` reference in dist.
- [OBSERVED] Global `ana` → `/Users/rsmith/Projects/anatomia_project/anatomia/packages/cli/dist/index.js` (this repo's dist; `ana --version` → 1.2.2).
- [OBSERVED] `require.resolve('anatrace-core')` → `MODULE_NOT_FOUND`; not in `node_modules`; but declared `package.json:59` = `"0.4.0"`, in lockfile, and `npm view anatrace-core@0.4.0` resolves → install will succeed.
- [OBSERVED] Zero compliance records: `find .ana/plans -path '*/compliance/*.json'` → 0, across ~209 proof entries.
- [INFERRED] tsup keeps core external (no `noExternal` in `tsup.config.ts`) — keep external; the guard handles absence.

### Test Infrastructure
- `tests/utils/compliance.test.ts` — Vitest. C12 abstain test at `:351` ("ABSTAINS (returns null, writes no record) when the core version is empty"). Dynamic version-lock at `:144` and `:384` (`createRequire(import.meta.url)('anatrace-core/package.json').version`). Real-engine block "0.4.0 reason lock + fail-closed emit + real-engine assertions" at `:260`.
- `tests/commands/_capture.test.ts:220` — asserts exact `0.4.0` pin (no caret/tilde).

## For AnaPlan

### Structural Analog
`readCoreVersion()` (`compliance.ts:56-64`) — the closest structural and functional match. Same module, same dependency, same `createRequire(import.meta.url)` in try/catch returning a safe fallback. The guarded value-require must mirror this idiom exactly. The only delta: on failure it abstains *and* surfaces a loud line, where `readCoreVersion` returns `''` silently (because `captureComplianceAtSave` already converts that empty version to a silent abstain at line 213 — the loud line belongs at the *core-use* guard, not the version guard).

### Relevant Code Paths
- `packages/cli/src/utils/compliance.ts:34-41` — imports to change (value) / preserve (type).
- `packages/cli/src/utils/compliance.ts:200-269` — `captureComplianceAtSave` body; guard insertion point ~252-257.
- `packages/cli/src/utils/compliance.ts:56-64` — `readCoreVersion` idiom to mirror.
- `packages/cli/src/commands/artifact.ts:32, :1322, :1757` — sync import + call sites (no signature change permitted).
- `packages/cli/tsup.config.ts` — keep core external (no edit expected).
- `packages/cli/tests/utils/compliance.test.ts` — add regression test; preserve `:144` and `:351`.

### Patterns to Follow
- Mirror `readCoreVersion` (compliance.ts:56-64) for the guarded require.
- Match existing abstain semantics: every failure path in `captureComplianceAtSave` returns `null`; the new guard does the same — plus the loud line.
- Loud surfaced output: follow the existing stderr drift-warning style already used in this module (`projectVerdicts` emits a single stderr drift warning — same surfacing channel/tone).

### Known Gotchas
- **Do not touch line 41** (type-only import) — erased at compile, crash-safe.
- **Do not use `await import()`** — sync call sites; signature change is out of bounds.
- **Loud line placement is load-bearing** — top-of-function placement makes it scream on benign abstains. Place just-in-time before first core use.
- **Install is not enough** — the main-tree dist must be rebuilt before this cycle's build/verify saves, and the running binary grepped for `captureComplianceAtSave`. Otherwise: re-emit zero.
- **Exact version pin** — `0.4.0`, no caret/tilde (`_capture.test.ts:220` enforces).
- **C12 fail-closed stays intact** — empty-version abstain (line 213) is a separate, deliberate silent abstain; do not make it loud.

### Things to Investigate
- Best mechanical proof, runnable inside Build, that the binary the pipeline executes contains the emit code (grep `dist/index.js`; optionally assert `which ana` resolves to the rebuilt dist).
- Whether the regression test should simulate unresolvable core by injecting a failing `require`/`readCoreVersion`-style dep (the function already accepts a `deps` injection param at line 204 — a natural seam) versus mocking the module — Plan to choose the cleaner seam that also lets the test assert the loud line fires on core-absent and stays quiet on benign early-returns.

### Precondition (operational — Build owns)
Before this cycle's build/verify save sites run: `pnpm install` (fetch `anatrace-core@0.4.0` into main-tree `node_modules`) → rebuild main-tree `dist` → verify global `ana` runs the rebuilt dist (`grep captureComplianceAtSave dist/index.js`). This is a hard gate, not an assumption. The emit code is already merged; only the dist is stale and core uninstalled.
