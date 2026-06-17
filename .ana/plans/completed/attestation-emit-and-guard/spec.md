# Spec: Guard the anatrace-core load and emit the first real attestation records

**Created by:** AnaPlan
**Date:** 2026-06-16
**Scope:** .ana/plans/active/attestation-emit-and-guard/scope.md

## Approach

Two moves in one work item. Move 1 is a small, strictly-safer code diff. Move 2 is operational sequencing that produces the deliverable (the first real records).

**Move 1 — Guard the core load (crash → loud abstain).**
The disease: a static *value* import of `anatrace-core` (`compliance.ts:34-40`) resolves at **module load**. When core is absent it throws before any function runs, and because `artifact.ts:32` statically imports `captureComplianceAtSave`, the throw takes down the entire `ana artifact save` command. Verified live: importing `compliance.ts` with core absent fails the whole test suite at line 34 (`Cannot find package 'anatrace-core'`, 0 tests run).

The fix: replace **only** the value import with a synchronous, guarded `loadCore()` that mirrors the existing `readCoreVersion()` idiom (`compliance.ts:56-64`) — `createRequire(import.meta.url)('anatrace-core')` in try/catch, returning `null` on failure. Type the module via `type AnatraceCore = typeof import('anatrace-core')` (a type-only construct, erased at compile, crash-safe — no runtime resolution). Leave the existing `import type { Harness, Mandate, NamedBlob }` (line 41) untouched. Add `loadCore` to the existing `deps` injection seam alongside `readCoreVersion`, so tests can simulate an absent engine without touching the module system.

Inside `captureComplianceAtSave`, call `loadCore()` once, just-in-time, and reference the result as `core.parseSession`, `core.anatomiaAdapter`, `core.runCompliance`, `core.scrubDeep`, `core.transcriptContentResolver`.

**Critical ordering decision (deviates from scope's suggested ~line 252 — ratified by developer).**
The scope suggested placing the guard "immediately before first core use (~252)." That placement is **unsatisfiable for AC1**: `readCoreVersion()` (line 56) also resolves `anatrace-core/package.json`, so with core genuinely absent it returns `''` and the **silent** fail-closed abstain at line 213 fires *before* line 252 — the loud line would never run.

The correct order expresses the two distinct failure modes as two distinct guards:

```
1. capture-off check                          → silent abstain   (unchanged, top)
2. role / session / transcript-path / bytes   → silent abstains   (the benign early-returns, unchanged)
3. loadCore()                → null → LOUD warn + abstain          (engine-absent = loud)   ← NEW
4. readCoreVersion()         → '' → SILENT abstain                 (version-unstampable = fail-closed)  ← MOVED here from line 212-213
5. core.parseSession(...) and the rest of the pipeline
```

This satisfies both goals at once:
- **Engine absent + a record was otherwise due** (role+session+transcript present) → reaches `loadCore` → **loud** (AC1). In genuine absence, `loadCore` fails *before* the version guard, so the silent-abstain short-circuit no longer hides it.
- **Engine absent + benign skip** (no role / no session) → abstains at step 2, *before* `loadCore` → **quiet** (no false alarm).
- **Engine present + empty injected version** (the C12 test) → `loadCore` succeeds quietly, the version guard at step 4 fires silently → C12's fail-closed semantics preserved.

Move the version read/abstain (currently `compliance.ts:212-213`) down to step 4. `coreVersion` is not consumed until `projectVerdicts` (line ~279) and the record stamp (line ~289), both well after step 4 — the move is safe.

**Loud line wording** (matches the existing `console.warn('[anatrace] …')` drift style in `projectVerdicts`, line 94):
```
[anatrace] behavioral attestation disabled — anatrace-core not resolvable; reinstall to enable
```

**Move 2 — Emit the first real records (operational; Build owns the sequencing).**
The emit code is already merged into main-tree source, but the running dist is stale (built 13 Jun, predates the emit code — `grep -c captureComplianceAtSave dist/index.js` → 0) and core is uninstalled. The global `ana` resolves through a homebrew symlink to **this repo's** `packages/cli/dist/index.js` (verified: `realpath $(which ana)` → `…/packages/cli/dist/index.js`). So installing core is necessary but **not sufficient** — the dist must be rebuilt and the running binary proven to contain the emit code before this cycle's build/verify saves run.

Sequence (Build, in the **main tree**):
1. `pnpm install` — fetch `anatrace-core@0.4.0` into the main-tree `node_modules` (lockfile already pins it; `npm view anatrace-core@0.4.0` resolves).
2. Rebuild the dist: `pnpm --filter anatomia-cli build` (or `cd packages/cli && pnpm run build`).
3. **Hard gate:** `grep -c captureComplianceAtSave packages/cli/dist/index.js` must be `> 0`, and `realpath $(which ana)` must resolve to that same file. If either fails, STOP — the dogfood saves would re-emit zero.
4. This cycle's own `ana artifact save-all` (build + verify) then produces the first real records under `.ana/plans/active/attestation-emit-and-guard/compliance/`. **These dogfood records ARE the deliverable.**

## Output Mockups

**Loud stderr line** when core is unresolvable but a record was otherwise due:
```
[anatrace] behavioral attestation disabled — anatrace-core not resolvable; reinstall to enable
```
Nothing else changes — the save completes normally, the record is simply absent. On a benign skip (no role / no session), **no** line is printed.

**A real emitted record** (shape — `…/compliance/verify-{session_id}.json`), the AC3 deliverable:
```json
{
  "role": "verify",
  "harness": "claude",
  "session_id": "…",
  "captured_at": "2026-06-16T…Z",
  "anatrace_core_version": "0.4.0",
  "framework": "anatomia",
  "mandate_hash": "sha256:…",
  "transcript_hash": "sha256:…",
  "coverage": { "total": 12, "fully_checked": 7, "unverifiable": 5 },
  "complete": false,
  "verdicts": [
    { "claim_id": "ana-verify:verify-independence", "says": "never read the build report",
      "status": "satisfied", "reason": "predicate-not-matched", "source": "deterministic" }
  ]
}
```
The `ana-verify:verify-independence` claim must be **evaluated and present** (any status — `satisfied` / `violated` / `unverifiable`). A clean verify cycle that never read the build report reads `satisfied` or `unverifiable`; that satisfies AC3. **Do not require a violation.**

## File Changes

The machine-readable list is in `contract.yaml`. Prose context below.

### packages/cli/src/utils/compliance.ts (modify)
**What changes:**
- Remove the static value import block (lines 34-40). Keep the `import type {...}` at line 41 verbatim.
- Add a module-level `type AnatraceCore = typeof import('anatrace-core')` and a `loadCore(): AnatraceCore | null` helper that mirrors `readCoreVersion` exactly (createRequire in try/catch, `null` on failure). Give it the same JSDoc treatment as `readCoreVersion`.
- Extend the `deps` param of `captureComplianceAtSave` to `{ readCoreVersion?: () => string; loadCore?: () => AnatraceCore | null }`; update the JSDoc `@param deps.loadCore`.
- Reorder the guards inside the function per the Approach: move the version read/abstain down below the new `loadCore` guard; place `loadCore` after the benign early-returns (capture / role / session / transcript-path / readable-bytes) and before `core.parseSession`.
- On `loadCore() === null`: emit the loud `console.warn('[anatrace] …')` line, then `return null`.
- Rewrite the five core call-sites as `core.*` members.
**Pattern to follow:** `readCoreVersion` (compliance.ts:56-64) for the guarded loader; `projectVerdicts` (line 94) for the `console.warn('[anatrace] …')` surfacing channel and tone.
**Why:** Without the guard, an absent core crashes every `ana artifact save` at module load (proven live). Without the reorder, AC1's loud line is unreachable.

### packages/cli/tests/utils/compliance.test.ts (modify)
**What changes:**
- Add the **bidirectional** regression test for the new guard:
  - *Loud direction:* a full pipeline (capture on, agent-def installed, contract, valid pointer/transcript) with `deps.loadCore: () => null` → `captureComplianceAtSave` returns `null`, does **not** throw, and emits exactly one stderr warning containing `anatrace-core not resolvable`. Capture `console.warn` the same way the existing A049 drift test does (lines 304-319).
  - *Quiet direction:* a **benign** abstain (no `ANA_ROLE`, or no session) with `deps.loadCore: () => null` → returns `null` and emits **zero** warnings (the guard is never reached because a benign early-return fires first).
- **Update C12** (the "ABSTAINS … when the core version is empty" test, line 351) so it remains non-vacuous after the reorder: it must set up a full pipeline (role + session + transcript present, core present, only `readCoreVersion: () => ''` injected) and **specifically reach the version guard** — not abstain earlier at a benign check. It already supplies `ANA_ROLE` via `env()` and a valid pointer/transcript; verify (don't assume) that with the version guard moved below `loadCore`, the injected empty version is still what triggers the abstain. Add an assertion or comment that pins this intent if the existing setup leaves it ambiguous.
**Pattern to follow:** the `console.warn` capture/restore idiom at lines 304-319; the existing `deps` injection used by C12 at lines 361-365.
**Why:** AC1 needs a test proving loud-on-absent and quiet-on-benign; AC4 needs C12 to keep exercising the version-abstain path specifically after it moves.

## Acceptance Criteria

Copied from scope, expanded:

- [ ] **AC1:** With `anatrace-core` unresolvable, `ana artifact save` does **not** crash: `captureComplianceAtSave` returns `null` and emits the loud "behavioral attestation disabled — anatrace-core not resolvable" stderr line. Pinned by the new regression test (loud direction).
- [ ] **AC1 (quiet):** A benign abstain (no role / no session) with core absent emits **no** warning. Pinned by the regression test (quiet direction).
- [ ] **AC2:** The running `ana`/dist provably contains the emit code — `grep -c captureComplianceAtSave packages/cli/dist/index.js > 0` AND `realpath $(which ana)` resolves to that file. Build-time hard gate (waived from the unit contract — not source-testable; see Build Brief).
- [ ] **AC3:** ≥1 real compliance record on disk with `anatrace_core_version == "0.4.0"`, non-empty `verdicts[]`, `coverage.total > 0`, and the `ana-verify:verify-independence` claim **evaluated and present** (any status). The mechanical properties are pinned by the real-engine tests once core installs; the dogfood record + independence claim are confirmed operationally by Verify. **Do not require a violation.**
- [ ] **AC4:** C12 abstain-on-empty-version (`compliance.test.ts:351`) and the dynamic version-lock (`:144`) both still pass, and C12 still exercises the version-abstain path specifically.
- [ ] Full CLI test suite passes (`(cd packages/cli && pnpm vitest run)`) — must be **re-baselined after `pnpm install`**, since the suite currently fails to load with core absent.
- [ ] `pnpm lint` clean; no `any`; explicit return type and JSDoc on the new `loadCore`.

## Testing Strategy

- **Unit (new, the guard):** the bidirectional test above — loud-on-absent (returns null, no throw, one `[anatrace]` warning) and quiet-on-benign (returns null, zero warnings). Drive absence via `deps.loadCore: () => null` — never by uninstalling core.
- **Unit (regression, AC4):** keep C12 (version-empty silent abstain) and the dynamic version-lock (line 144) green; ensure C12 still reaches the version guard post-reorder.
- **Real-engine (AC3 mechanical):** the existing 0.4.0 block (lines 260-425) judges via the live engine — version equals installed, `verdicts.length > 0`, `coverage.total > 0`, zero out-of-set reasons. These only run once core is installed; their passing is the mechanical half of AC3.
- **Integration (AC2/AC3 dogfood):** this cycle's own `ana artifact save-all` produces real records under `…/compliance/`. Build greps the dist (hard gate) before relying on the save to emit.
- **Edge cases:** core present but `package.json` unreadable → `loadCore` succeeds, version guard abstains silently (fail-closed). Core entirely absent on a no-role save → quiet (benign return precedes the guard).

## Dependencies

- `anatrace-core@0.4.0` must install into the main-tree `node_modules` (lockfile pins it; registry resolves). The unit suite cannot load until it does.
- The main-tree dist must be rebuilt from current source **before** this cycle's build/verify saves run.

## Constraints

- **No signature change** to `captureComplianceAtSave`'s call contract — `artifact.ts:32/:1322/:1757` call it synchronously with no `await`. The loader is synchronous (`createRequire`, not `await import()`); do not introduce async.
- **Exact version pin** — `anatrace-core` stays `"0.4.0"` (no caret/tilde); `_capture.test.ts:220` enforces it. Do not edit `package.json`'s pin.
- **Keep core external** — no `noExternal` in `tsup.config.ts`. The guard handles absence; bundling is rejected (defeats version-lock provenance).
- **Strictly safer** — the change only converts crash → abstain on a universal save path. Do not alter any existing abstain semantics beyond moving the version guard's position.

## Gotchas

- **Do not touch line 41** (`import type {...}`) — erased at compile, already crash-safe.
- **Do not use `await import()`** — synchronous call sites forbid a signature change.
- **The version guard MUST move below `loadCore`** — if it stays at line 212-213, genuine absence silently abstains there and the loud line is dead (AC1 fails). This is the whole point of the reorder.
- **C12 must stay non-vacuous** — after the reorder it must still abstain *at the version guard*, not at an earlier benign check. It already sets role/session/transcript; verify the empty-version injection is still the trigger.
- **`loadCore` and `readCoreVersion` are independent resolutions** — both fail under genuine absence, but `loadCore` runs first (loud) and the version guard never gets the chance to silently swallow it.
- **Install ≠ emit** — the running dist is the main tree's; rebuild it and grep it. Skipping the rebuild re-emits zero records even with core installed.
- **The suite is red until core installs** — `compliance.test.ts` reports 0 tests (module-load crash) right now. Re-baseline after `pnpm install`, not before.

## Build Brief

### Rules That Apply
- Relative imports end in `.js`; use the `node:` prefix for built-ins (`node:module`, `node:fs`). Omitting `.js` compiles but crashes the ESM runtime.
- `import type` stays separate from value imports — never mix. The type-only import at line 41 is correct; keep it.
- Avoid `any`. Type the loaded module as `typeof import('anatrace-core')` — full typing, zero runtime import.
- Explicit return type + `@param`/`@returns` JSDoc on the exported/new `loadCore` (eslint enforces JSDoc; pre-commit rejects missing tags).
- Prefer early returns — the function is already a flat sequence of `if (!x) return null;` guards. Add the new guards in the same flat style.
- `console.warn('[anatrace] …')` is the established surfacing channel in this module (`projectVerdicts`, line 94) — this util legitimately writes to stderr; it is not an `engine/` file, so the engine no-CLI-output rule does not apply.

### Pattern Extracts

The loader to mirror (`compliance.ts:56-64`):
```ts
function readCoreVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('anatrace-core/package.json') as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '';
  } catch {
    return '';
  }
}
```

The surfacing channel/tone to match (`compliance.ts:94-97`):
```ts
console.warn(
  `[anatrace] unknown verdict reason "${v.reason}" from anatrace-core@${coreVersion} — ` +
    'the engine may have drifted; recording verbatim. Update VERDICT_REASONS in src/types/proof.ts.',
);
```

The `console.warn` capture/restore idiom for the new test (`compliance.test.ts:304-319`):
```ts
const warnings: string[] = [];
const original = console.warn;
console.warn = (...args: unknown[]): void => { warnings.push(args.join(' ')); };
try {
  // … call captureComplianceAtSave …
} finally {
  console.warn = original;
}
expect(warnings).toHaveLength(1);
expect(warnings[0]).toContain('…');
```

The current guard region to reorder (`compliance.ts:206-258`, abridged):
```ts
if (!isProcessCaptureEnabled(projectRoot)) return null;          // 207  keep top
const coreVersion = (deps.readCoreVersion ?? readCoreVersion)(); // 212  MOVE down
if (!coreVersion) return null;                                   // 213  MOVE down (silent)
const role = env['ANA_ROLE'] ?? '';
if (!role) return null;                                          // 216  benign
// … session / transcript-path / readable-bytes benign returns …  233/238/246
const sessionBlobs: NamedBlob[] = [{ name: transcriptName, bytes }];
// ── insert loadCore guard HERE (loud), then the moved version guard (silent) ──
const session = parseSession(sessionBlobs, harness as Harness);  // 252  becomes core.parseSession
```

### Proof Context
Run `ana proof context packages/cli/src/utils/compliance.ts` and `… artifact.ts` before building and fold in the top findings. At plan time: this file's history is dominated by the attestation lifecycle (`verifier-verdict-honesty`, `anatrace-pin-0-4-0`, `anatrace-core-integration`); the one live hazard is the documented zero-records state this work item closes. No other active proof findings block the change.

### Checkpoint Commands
Surface is `cli`. Use the surface test command for focused checkpoints, root `commands.test` for the final baseline.

- **Precondition (do first):** `pnpm install` → `pnpm --filter anatomia-cli build` → `grep -c captureComplianceAtSave packages/cli/dist/index.js` (must be `> 0`) and `realpath $(which ana)` (must end in `packages/cli/dist/index.js`).
- After `compliance.ts` edit: `(cd packages/cli && pnpm vitest run tests/utils/compliance.test.ts)` — Expected: suite now **loads** (was 0 tests / module-load crash) and all compliance tests pass.
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: full CLI suite green.
- Lint: `(cd packages/cli && pnpm run lint)` — Expected: clean.

### Build Baseline
The suite **cannot be baselined before `pnpm install`** — `compliance.test.ts` currently fails at module load (`Cannot find package 'anatrace-core'`, 0 tests run), verified live. Capture exact counts **after** install + the guard edit:
- Command: `(cd packages/cli && pnpm vitest run)`
- Before (this file): 0 tests collected from `compliance.test.ts` (module-load crash); 20 `it` blocks defined but unrunnable.
- After: 20 existing + 2 new (loud + quiet regression) = **22** in `compliance.test.ts`; C12 updated in place (not added). Record the true total-suite counts from the terminal — do not guess.
- Regression focus: `tests/utils/compliance.test.ts` (C12 + version-lock), `tests/commands/_capture.test.ts:220` (pin + install), any test importing `compliance.ts`.
