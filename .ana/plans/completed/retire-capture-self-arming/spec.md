# Spec: Retire Capture-Gate Self-Arming — Drive the Gate from a Committed Config Flag

**Created by:** AnaPlan
**Date:** 2026-06-06
**Scope:** .ana/plans/active/retire-capture-self-arming/scope.md

## Approach

Excise the self-arming machinery and re-point the capture gate's single enablement input from hidden per-working-copy state (`.ana/state/capture.json`) to a committed `ana.json` flag (`captureGate`). The gate, the seal, the three preservation validators, the inliner, and the capture engine are preserved **exactly** — only the *decision of when enforcement is on* moves from runtime state to a git-tracked config fact. Net-negative LOC: we delete the code that causes the problem (invisible state), we do not add code to manage it.

The cut line is precise and isolated. `isArmed`/`armCapture` are imported in exactly one place (`artifact.ts:26`). The block logic in `evaluateCaptureGate` is byte-identical after the change — only the boolean input is renamed `armed → enabled` and its derivation swapped from arming-state to config. Follow the `mergeStrategy` field end-to-end as the structural analog for the new flag: schema enum → written in `createAnaJson` → preserved by `preserveUserState`'s existing spread.

**Key derivations:**

- **Enablement = flag on AND a resolvable test command.** A new exported helper `isCaptureGateEnabled(projectRoot)` reads `ana.json`, returns `false` unless `captureGate === 'on'`, and `false` unless a test command resolves. It is **undefined-safe**: a missing or malformed `ana.json` returns `false` and never throws — the same fail-safe posture the deleted `isArmed` held (missing → off, never brick).
- **The carve-out keys on ANY resolvable test command**, not just top-level `commands.test`. It reuses `resolveTestCommandString` (already exported from `commands/test.ts`) for the top-level case and iterates `surfaces` for the per-surface case. This is the surface-only-monorepo trap: a config with no top-level `commands.test` but a `surfaces.cli.commands.test` is fully capture-capable and must stay enforced.
- **Re-init preservation is free.** `preserveUserState` already builds `merged = { ...parsed.data, <mechanical overrides> }` and writes it. Because `captureGate` is a *declared schema field*, `parsed.data` carries it, so an explicit `on`/`off` is preserved by the spread, and an **absent** flag is simply not in `parsed.data` → stays absent. The mechanical-override list (`anaVersion`, `lastScanAt`, `name`, `language`, `framework`, `packageManager`) does **not** include `captureGate`, so fresh-init's `on` never leaks onto a re-initialized project that lacked the flag. **No new merge branching is required** — declaring the field in the schema is exactly what makes the preservation deliberate rather than a `.passthrough()` accident.

**Settled residual behavior (accept explicitly):** Under config-on + carve-out, a project *with* a test command that didn't run it **is** blocked on build #1 — there is no "first save arms itself" grace. This is the intended "you must actually run `ana test`" behavior. The block message must make the one-line fix obvious (see Output Mockups).

**Contract handling (decided with developer — Option 1):** This scope writes a **new sealed contract** that re-expresses the gate's behavior in config terms. The completed `captured-test-evidence` contract and its verify_reports are **never touched** — they remain sealed, immutable historical proof. A supersession comment in the new contract records the mapping. Consequently, the scope's AC14 (striking prose from the *completed* `captured-test-evidence` spec/scope) is **dropped** — editing a frozen artifact is the same immutability violation; the contradiction is superseded by the new authoritative contract, not fixed by rewriting history.

## Output Mockups

**Re-framed block message** (`applyCaptureGate`, replacing the arming-era text). Config framing; names the `ana test` fix AND how to disable (AC7). **The reason line(s) are DYNAMIC** — the current code already loops `gate.errors` (the actual preservation validator output); keep that loop. The structure is: config preamble → the actual validator error(s) → fix line → disable line. Below, `{gate.errors…}` is illustrative for a *truncated* capture; a *missing* capture would print the missing-marker error instead:

```
Error: build_report.md has no valid captured test evidence.
  The capture gate is on for this project, so test evidence is required.
  {gate.errors[*] — e.g. "Inlined capture block was truncated — end delimiter is not at the expected 412-byte offset."}
  Fix: run `ana test` (it seals a harmless abstain even when no tests run), then re-save.
  To turn the gate off for this project: set "captureGate": "off" in .ana/ana.json.
```

Do **not** hardcode a single reason string — the message must surface whichever of the three preservation validators (missing / tampered / truncated) actually failed, via the existing `gate.errors` loop. A015–A017 verify this: the test blocks on a *tampered/truncated* capture and asserts the message contains `ana test`, `captureGate`, and the real validator error.

**Status readout** (`ana work status` human output, AC11). One line near the header. Three states:

```
Pipeline Status (artifact branch: main)

  Capture gate: on
```
```
  Capture gate: off
```
```
  Capture gate: on (inactive — no test command configured)
```
The third state is `captureGate: "on"` but the carve-out resolves no test command — the gate is configured on but never blocks. JSON output (`--json`) gains a `captureGate` field with the raw flag value (`"on"` / `"off"` / `null` when absent) for parity.

**ana.json reference entry** (`configurability.mdx`, AC12) documents `captureGate` as: on-by-default-for-new-projects; `"off"` or absent disables; enforcement also requires a resolvable test command; blocks only a build-report save that has no valid captured evidence.

## File Changes

### packages/cli/src/utils/capture-state.ts (delete)
**What changes:** Deleted in full. `isArmed`, `armCapture`, the `CaptureState` interface, and the `.ana/state/capture.json` read/write all go. It is imported only by `artifact.ts:26`.
**Why:** This is the arming signal — the invisible per-working-copy state the scope exists to remove.

### packages/cli/tests/utils/capture-state.test.ts (delete)
**What changes:** Deleted in full (6 tests, tagged `@ana A034` against the old contract).
**Why:** Its subject is deleted. A034's *behavior* (undefined-safe default → off) is re-expressed as new-contract A005 against `isCaptureGateEnabled`.

### packages/cli/src/utils/capture-marker.ts (modify)
**What changes:** In `evaluateCaptureGate` (current line ~461), rename the options field `armed → enabled` (`opts: { enabled: boolean }`) and the block condition `opts.armed → opts.enabled`. **The block logic is otherwise byte-identical** — the validator loop, the `blocked` partition, the warn/error split do not change. Rewrite the function's JSDoc to drop the Phase-1/Phase-2 arming narrative and describe config enablement instead (a stranger should read it correctly post-arming).
**Pattern to follow:** The function as it stands — preserve its exact shape.
**Why:** This is the input swap. Renaming `armed → enabled` is mechanical; the gate's safety claim ("only blocks when no valid capture present") is unchanged.

### packages/cli/src/commands/artifact.ts (modify)
**What changes:**
- Remove the `import { isArmed, armCapture } from '../utils/capture-state.js'` line (26).
- Add a new exported helper `isCaptureGateEnabled(projectRoot: string): boolean` (see Approach). It reads `ana.json` undefined-safe (missing/malformed → `false`), parses via `AnaJsonSchema`, returns `captureGate === 'on' && hasResolvableTestCommand`. Import `resolveTestCommandString` from `./test.js`.
- In `applyCaptureGate`, replace `const wasArmed = isArmed(projectRoot)` with `const enabled = isCaptureGateEnabled(projectRoot)` and pass `{ enabled }` to `evaluateCaptureGate`. Re-frame the block message (see Output Mockups): change the now-false "previously sealed a real capture" line to the config preamble; **keep the existing `for (const err of gate.errors)` loop** (this is what makes the reason dynamic — do not collapse it to a fixed string); keep the `ana test` line; **add** the `captureGate: "off"` disable line. The thrown/printed message must contain all three: the real validator error(s), `ana test`, and `captureGate`.
- Delete the `CaptureGateOutcome` interface, the `wasArmed` field, the function's `valid`/`wasArmed` return — `applyCaptureGate` now returns `void`.
- Delete `armAfterValidBuildReport` entirely and both call sites (current ~1188 and ~1618), the `buildReportOutcome` variable and its two assignments (current ~1039 and ~1448 become bare `applyCaptureGate(...)` calls), and the one-time "capture gate armed" message.
**Pattern to follow:** ana.json load+parse mirrors `work.ts:150-151` and `platform.ts:87-88` (`AnaJsonSchema.parse(JSON.parse(readFileSync(...)))`), wrapped in try/catch returning `false`.
**Why:** This is the arming plumbing. With it gone, `applyCaptureGate` is a pure gate evaluation with no post-seal side effect. Dissolves proof findings captured-test-evidence-C10 (double `isArmed` read) and C11 (`valid` predicate proxy).

### packages/cli/src/commands/init/anaJsonSchema.ts (modify)
**What changes:** Add `captureGate: z.enum(['on', 'off']).optional().catch(undefined)` to the top-level object (alongside `mergeStrategy`, ~line 99). **No `.default`** — absent must stay `undefined` so absent-stays-absent on re-init and reads as off.
**Pattern to follow:** `mergeStrategy` (lines 99-102) — exact same enum shape.
**Why:** Declares the field explicitly so `.passthrough()` doesn't merely tolerate it — it becomes validated, discoverable, and (critically) carried by `parsed.data` in `preserveUserState`.

### packages/cli/src/commands/init/state.ts (modify)
**What changes:** In `createAnaJson`'s returned `anaConfig` object (~line 556-571), add `captureGate: 'on'`. **No change to `preserveUserState`** — its existing `{ ...parsed.data }` spread (line 727) already preserves the field, and the mechanical-override list deliberately excludes it. Add a brief comment at the override site noting `captureGate` is intentionally preserved-not-refreshed.
**Pattern to follow:** The sibling fields in `anaConfig` (`artifactBranch`, `branchPrefix`).
**Why:** Fresh init opts the project in (AC4); re-init preserves the user's choice and never imposes `on` (AC5).

### packages/cli/src/commands/work.ts (modify)
**What changes:** Add a `captureGate` field to the `StatusOutput` interface (~line 61). In `getWorkStatus` (~line 419, has `projectRoot`), read the raw flag from `ana.json` and compute the effective state (reuse `isCaptureGateEnabled` for the "inactive — no test command" distinction). In `printHumanReadable` (~line 320), render one `Capture gate: …` line near the header (after the artifact-branch line). Include the raw flag in the JSON output path for parity.
**Pattern to follow:** How `artifactBranch` flows from `getWorkStatus` → `StatusOutput` → `printHumanReadable`.
**Why:** AC11 — the gate's on/off state must be human-visible.

### packages/cli/tests/utils/capture-marker.test.ts (modify)
**What changes:** Rename every `{ armed: false }` → `{ enabled: false }` and `{ armed: true }` → `{ enabled: true }` (cases at ~215, 219, 229, 262, 266, 274, 279, 291). Update the `describe` labels that say "Phase 1 / Phase 2 / armed" to config terms. Re-point tags: the `{enabled:true}` failing-validator → blocked cases carry **A001**; the abstain-counts-valid → not-blocked case carries **A004**; the `{enabled:false}` → not-blocked case supports **A003**; add a clean-valid `{enabled:true}` → not-blocked case tagged **A002**.
**Pattern to follow:** The existing cases — same fixtures (`seed`, `inlineToFile`), only the input field name and tags change.
**Why:** Re-express, not rewrite — the gate behavior is identical.

### packages/cli/tests/commands/artifact.test.ts (modify)
**What changes:** In the `capture gate — self-arming flip (Phase 2)` describe block (~371-459):
- Delete the `armProject()` / `isProjectArmed()` helpers (they wrote `capture.json` directly) and the **A031** test (`first valid-capture save arms the project…`) — self-arming is gone.
- Replace arming setup with config: write `captureGate: "on"` (and ensure a resolvable `commands.test`) into the test project's `ana.json` instead of calling `armProject()`.
- Re-express **A030 → A001** (config on + no evidence → throws), **A032 → A003** (flag absent → not throw), **A035 → A006** (verify-report not throw with flag on), **A036 → A007** (spec save not throw with flag on).
- Add `isCaptureGateEnabled` unit tests in this file (the function's home): **A005** (absent/malformed ana.json → false, no throw), **A008** (flag on + no test command → false), **A009** (flag on + surface-only test command → true).
- Add **A002** integration happy-path (config on + valid capture → not blocked) if not better covered in capture-marker.
- Add the **block-message test (A015/A016/A017)**: flag on + resolvable test command + a **truncated** capture. Produce the truncation by **deleting bytes from inside the sealed block** so the end delimiter shifts off its offset — reuse the exact `capture-marker.test.ts` pattern at lines 205-209 (`text.replace('line two\n', '')`), which trips `validateCaptureNotTruncated` and yields the substring **`truncated`**. Do **not** use an equal-length content swap — that trips `validateCaptureInlined` ("byte-length mismatch") and would not contain "truncated", breaking A017. Capture the thrown/`console.error` output and assert it contains **`ana test`** (A015), **`captureGate`** (A016), and **`truncated`** (A017). Using a truncated (not missing) fixture is what proves the reason line is dynamic, not hardcoded. Assert via the mocked `process.exit`/`console.error` spy already used by the gate integration tests in this file.
**Pattern to follow:** The existing `createTestProject` / `createArtifact` / `createBuildReportWithCapture` helpers and the surrounding describe block. `createTestProject` already writes an `ana.json` — extend its options or write the flag after.
**Why:** The integration tests must drive enablement from config, not from a written `capture.json`.

### packages/cli/tests/commands/init.test.ts (modify)
**What changes:** Add **A010** (fresh `createAnaJson` / init produces `captureGate: "on"`), **A011** (re-init with existing `captureGate: "off"` → merged config keeps `"off"`), **A012** (re-init with **absent** flag → merged config has no `captureGate` **and** `isCaptureGateEnabled` reads `false` / a build-report save is not blocked — assert the *enablement is off*, not merely that the field is absent).
**Pattern to follow:** Existing `preserveUserState` re-init tests in this file (search for `preserveUserState`).
**Why:** AC4/AC5 — init writes on, re-init preserves and never imposes. A012 asserts the conservative guarantee at the behavior level.

### packages/cli/tests/commands/init/anaJsonSchema.test.ts (modify)
**What changes:** Add a case validating the `captureGate` enum: `"on"`/`"off"` parse through; an invalid value `.catch`es to `undefined`; absence yields `undefined` (not a default).
**Pattern to follow:** The existing `mergeStrategy` enum test in this file.
**Why:** Locks the schema contract for the new field.

### packages/cli/tests/commands/work.test.ts (modify)
**What changes:** Add **A013** — `ana work status` human output reports the capture-gate state (assert the `Capture gate:` line / the `captureGate` field on `StatusOutput`).
**Pattern to follow:** Existing status-output assertions in this file.
**Why:** AC11.

### website/content/docs/guides/configurability.mdx (modify)
**What changes:** Add `captureGate` to the `ana.json` reference (the field list around lines 7-39 / 61-78) and a short net-new description of the gate's behavior: on by default for new projects; `"off"` or absent disables; enforcement also requires a resolvable test command; blocks only a build-report save with no valid captured evidence; disable by setting `"captureGate": "off"`.
**Pattern to follow:** How `mergeStrategy` / `branchPrefix` are documented in the same file.
**Why:** AC12. (Investigation confirmed there is no existing capture-gate prose to reverse — this is net-new.)

### .ana/context/project-context.md (modify)
**What changes:** Correct the stale re-init prose at lines ~86 and ~123. Line 86 ("If they exist, they're kept as-is") and line 123 ("template improvements don't reach existing users … skipped if they exist") contradict the shipped template-propagation behavior. Rewrite to reflect that re-init now propagates agent/template updates (consistent with the already-corrected `configurability.mdx:143`).
**Why:** AC13 — dogfood context accuracy. (This is our own context file, not a sealed proof — safe to edit.)

### CHANGELOG.md (modify)
**What changes:** Remove the premature `### Changed` "Re-init now propagates agent template updates" entry under `## [Unreleased]` (lines ~8-12); **retain** the empty `## [Unreleased]` header. Correct the footer compare link to `v1.2.2...HEAD`. Add **no** new entry for this work.
**Why:** AC15 — the changelog reflects only what is published to npm (1.2.2). The template-propagation note re-appears at the next version bump (recorded in the proof chain), not now.

### .ana/ana.json (modify)
**What changes:** Add `"captureGate": "on"` to the dogfood config.
**Why:** AC10 — our own repo runs the gate. With a resolvable `commands.test` present, a no-evidence build-report save in this repo is now blocked. This is the live regression check for the whole scope — treat a failing dogfood block as a release blocker, not a flaky test.

## Acceptance Criteria

Copied from scope, expanded. **AC14 is dropped** (see Approach — editing the frozen completed spec/scope is an immutability violation; superseded by the new contract). **AC9 reinterpreted**: "the contract" = the new active contract; the completed `captured-test-evidence` contract is left sealed.

- [ ] **AC1:** `capture-state.ts` + its test file deleted; no source or test references `isArmed`, `armCapture`, `.ana/state/capture.json`, `wasArmed`, or `armedAt`.
- [ ] **AC2:** Gate block behavior unchanged from `main`: blocks a build-report save **only** when enabled **and** a preservation validator fails (missing/tampered/truncated). Counts and verdict never block.
- [ ] **AC3:** Enablement driven by the committed `captureGate` flag; present-and-`on` enables, `off` or absent → warn-mode.
- [ ] **AC4:** `ana init` writes `captureGate: "on"` unconditionally (not gated on test-command detection).
- [ ] **AC5:** Re-init preserves an explicit `on`/`off`; an absent flag stays absent (re-init never writes `on` onto a project that had no flag).
- [ ] **AC6:** Flag on + **no** resolvable test command (top-level and no surface) → warn-mode, never blocks.
- [ ] **AC7:** Flag on + resolvable test command + no valid evidence → blocked, with a message naming the `ana test` fix and how to disable the gate.
- [ ] **AC8:** Verify-report and non-build-report saves never gated, regardless of flag state.
- [ ] **AC9:** Gate behavior re-expressed in config terms in the **new** sealed contract; every retained assertion backed by a passing, targeted test. (Completed `captured-test-evidence` contract untouched.)
- [ ] **AC10:** Dogfood `.ana/ana.json` has `captureGate: "on"`; no `.ana/state/capture.json` created by any path; a no-evidence build-report save in the dogfood is blocked.
- [ ] **AC11:** `ana work status` reports the gate's on/off state in human-readable output.
- [ ] **AC12:** `configurability.mdx` documents `captureGate`; a net-new gate-behavior description exists.
- [ ] **AC13:** `project-context.md` no longer claims agent defs/CLAUDE.md are "kept as-is"/"skipped if they exist" on re-init (~86, ~123).
- [ ] **AC15:** Premature `### Changed` `[Unreleased]` entry removed (empty header retained); footer link → `v1.2.2...HEAD`; no new changelog entry.
- [ ] **AC16:** `pnpm run build`, full `packages/cli` test suite, lint, and typecheck pass; total test count does not decrease (see Build Baseline for expected delta).

## Testing Strategy

- **Unit (capture-marker):** `evaluateCaptureGate` with `{ enabled: true/false }` × {failing validator, valid block, abstain counts} — A001, A002, A003, A004. Same fixtures as today.
- **Unit (isCaptureGateEnabled, in artifact.test.ts):** absent/malformed ana.json → false (A005); flag on + no test command → false (A008); flag on + surface-only test command → true (A009); flag on + top-level test command → true; flag off → false.
- **Integration (artifact save path):** flag on + no evidence → throws (A001); verify-report not gated (A006); non-build-report not gated (A007); flag absent → not gated (A003).
- **Block-message content (A015/A016/A017):** flag on + resolvable test command + **truncated** capture (delete bytes inside the sealed block, per `capture-marker.test.ts:205-209` — NOT an equal-length swap) → blocked; assert the message contains `ana test` (fix), `captureGate` (disable), and `truncated` (the real validator error, proving dynamic — not a canned "missing"). One test, all three assertions.
- **Init / re-init:** fresh init writes on (A010); re-init preserves off (A011); re-init absent → enablement off / not blocked (A012); schema enum validation.
- **Status:** `Capture gate:` line present (A013).
- **Verify-report sealed account:** verify-report capture still inlined/sealed independently of the gate (A014) — tag the existing verify-report inlining test if present, else add one.
- **Edge cases:** malformed `ana.json` (must not throw); `captureGate: "on"` with empty `commands` and empty `surfaces`; surface-only config with no top-level `commands.test`; `captureGate` set to an invalid value (schema `.catch` → undefined → off).

## Dependencies

None external. `resolveTestCommandString` is already exported from `commands/test.ts`. `AnaJsonSchema` is already the shared loader. No new packages.

## Constraints

- **Test count must not decrease** (CI across 3 OS × 2 Node). See Build Baseline — the deliberately-removed arming tests are offset by new config/carve-out coverage.
- **Do not touch load-bearing gate internals:** `applyCaptureGate`'s block path, the three preservation validators (`validateCapturePresent`, `validateCaptureInlined`, `validateCaptureNotTruncated`), `inlineReportCaptures`, the verify-report sealed account, `capture-runner.ts`, `commands/test.ts` resolution logic, the trinary verdict. The cut is *arming only*.
- **Backward compatibility:** absent `captureGate` must read as off for every pre-flag install (the entire migration mechanism). Never throw on a missing/old `ana.json`.
- **The completed `captured-test-evidence` plan is immutable** — no edits to its contract, spec, scope, or verify_reports.

## Gotchas

- **Carve-out surface-only trap.** `resolveTestCommandString(anaJson, undefined)` only checks top-level `commands.test`. A surface-only monorepo (no top-level test command, but `surfaces.cli.commands.test`) is capture-capable. The carve-out MUST also iterate `surfaces` and call `resolveTestCommandString(anaJson, surfaceName)` for each — return enabled if **any** resolves. Keying on top-level alone wrongly drops surface-only projects to warn-mode.
- **No `.default` on the schema field.** `z.enum(['on','off']).optional().catch(undefined)` — adding `.default('on')` or `.default('off')` would make absent reads non-absent and break absent-stays-absent on re-init (the spread would carry a defaulted value). Mirror `mergeStrategy`, which has no default.
- **`preserveUserState` needs no new branch — verify by test, not by adding code.** The `{ ...parsed.data }` spread already preserves `captureGate`. Resist adding an explicit copy; it would be redundant and risks overriding with `newAnaConfig`'s `on`. The mechanical-override list at ~line 729-734 must NOT gain `captureGate`.
- **Two gate call sites.** `saveArtifact` (~1039) and `saveAllArtifacts` (~1448) both call `applyCaptureGate`; both arm sites (~1188, ~1618) must be removed. Wiring only one leaves a bypass/leftover.
- **Block message must mention disabling.** AC7 requires the message name both the `ana test` fix and `captureGate: "off"`. The current arming message says "previously sealed a real capture" — that line is now false and must go.
- **Dogfood block is a release gate.** After writing `captureGate: "on"` into `.ana/ana.json`, this repo's own build-report saves require evidence. If the dogfood block fails, it is a real regression, not flake.
- **Tag IDs are per-contract.** `@ana A001`…`A014` here refer to THIS contract. The same IDs exist in other work items' tests — do not disturb them.

## Build Brief

### Rules That Apply
- All local imports end in `.js` and use `node:` prefix for built-ins (ESM runtime requirement; compiles without but crashes at runtime).
- `import type` for type-only imports, separate from value imports.
- Named exports only — no default exports.
- Exported functions need explicit return types + `@param`/`@returns` JSDoc (pre-commit lint enforces the tags).
- Undefined-safe config read: missing/malformed `ana.json` → `false`, never throw (the fail-safe posture the deleted `isArmed` held).
- Prefer early returns; avoid `any` (use `unknown` + narrow).
- In MDX/JSX text, escape apostrophes as `&apos;` (the `configurability.mdx` edit).

### Pattern Extracts

**Structural analog — `mergeStrategy` field in `anaJsonSchema.ts` (lines 99-102):**
```ts
    mergeStrategy: z
      .enum(['merge', 'squash', 'rebase'])
      .optional()
      .catch(undefined),
```
Add `captureGate` directly alongside it:
```ts
    captureGate: z
      .enum(['on', 'off'])
      .optional()
      .catch(undefined),
```

**Gate input swap — `evaluateCaptureGate` in `capture-marker.ts` (461-471), block logic unchanged:**
```ts
export function evaluateCaptureGate(filePath: string, opts: { armed: boolean }): CaptureGateResult {
  const messages: string[] = [];
  for (const validate of [validateCapturePresent, validateCaptureInlined, validateCaptureNotTruncated]) {
    const msg = validate(filePath);
    if (msg) messages.push(msg);
  }
  if (opts.armed && messages.length > 0) {
    return { blocked: true, warnings: [], errors: messages };
  }
  return { blocked: false, warnings: messages, errors: [] };
}
```
→ `opts: { enabled: boolean }`, `opts.armed → opts.enabled`. Nothing else.

**Carve-out resolver — `resolveTestCommandString` in `commands/test.ts` (98-116), reuse as-is:**
```ts
export function resolveTestCommandString(
  anaJson: Record<string, unknown>,
  surface: string | undefined,
): string | null {
  if (surface) {
    const surfaces = anaJson['surfaces'] as Record<string, unknown> | undefined;
    const surfaceObj = surfaces?.[surface] as Record<string, unknown> | undefined;
    if (!surfaceObj) return null;
    const commands = surfaceObj['commands'] as Record<string, unknown> | undefined;
    const testJson = commands?.['test_json'];
    if (typeof testJson === 'string' && testJson.trim()) return testJson;
    const test = commands?.['test'];
    return typeof test === 'string' && test.trim() ? test : null;
  }
  const commands = anaJson['commands'] as Record<string, unknown> | undefined;
  const test = commands?.['test'];
  return typeof test === 'string' && test.trim() ? test : null;
}
```
The carve-out: enabled iff `captureGate === 'on'` AND (`resolveTestCommandString(anaJson, undefined)` OR any `s` in `Object.keys(anaJson.surfaces ?? {})` where `resolveTestCommandString(anaJson, s)` is non-null).

**ana.json load+parse — `work.ts` (150-151), mirror this (wrap in try/catch → false):**
```ts
    const rawConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, '.ana', 'ana.json'), 'utf-8')) as unknown;
    configuredStrategy = AnaJsonSchema.parse(rawConfig).mergeStrategy;
```

**Re-init preservation — `state.ts` `preserveUserState` (727-735), already carries the field:**
```ts
    const merged = {
      ...parsed.data,                       // <- captureGate rides along here
      anaVersion: newAnaConfig['anaVersion'],
      lastScanAt: newAnaConfig['lastScanAt'],
      name: newAnaConfig['name'],
      language: newAnaConfig['language'],
      framework: newAnaConfig['framework'],
      packageManager: newAnaConfig['packageManager'],
    };
```
Do NOT add `captureGate` to this override list. Absent-in-`parsed.data` → absent-in-`merged` → off.

### Proof Context
- **`artifact.ts` — captured-test-evidence-C10 (code):** `isArmed` read twice on the first valid save. **Dissolved** by this change (`isArmed` deleted).
- **`artifact.ts` — captured-test-evidence-C11 (test):** the `valid` arming predicate uses `warnings.length === 0` as a proxy. **Dissolved** — the `valid` predicate and `CaptureGateOutcome` are deleted with arming.
- **`artifact.ts` — captured-test-evidence-C9 (code):** block message didn't reassure a no-tests agent. The re-framed message (Output Mockups) keeps the `ana test`-seals-an-abstain guidance — preserve that reassurance in config terms.
- **`artifact.ts` — Build concern (captured-test-evidence):** "the verify-report sealed account was built but has no contract assertion binding it." **Closed** by new-contract A014.
- **`capture-marker.ts` — captured-test-evidence-C4 (code):** `validateCapturePresent` per-line scan caveat. **Do not touch** — out of scope; preservation validators are frozen.

### Checkpoint Commands
Surface: cross-surface (primary `cli`).
- After `capture-marker.ts` + `artifact.ts` edits: `(cd 'packages/cli' && pnpm vitest run tests/utils/capture-marker.test.ts tests/commands/artifact.test.ts)` — Expected: re-expressed gate tests pass; no `isArmed`/arming references remain.
- After `state.ts` + `anaJsonSchema.ts` edits: `(cd 'packages/cli' && pnpm vitest run tests/commands/init.test.ts tests/commands/init/anaJsonSchema.test.ts)` — Expected: init/re-init preservation tests pass.
- After `work.ts` edit: `(cd 'packages/cli' && pnpm vitest run tests/commands/work.test.ts)` — Expected: status readout test passes.
- After all changes: `pnpm run test -- --run` (root `commands.test`) — Expected: full suite green, total ≥ 3423.
- Lint: `pnpm run lint`. Build: `pnpm run build`. Typecheck via pre-commit (`tsc --noEmit`).

### Build Baseline
Measured on `main` at plan time with the exact command below.
- Current tests: **3419 passed + 2 skipped = 3421 total**
- Current test files: **139**
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- Expected delta: **remove 7 arming tests** (6 in `capture-state.test.ts` + 1 self-arming `A031` test in `artifact.test.ts`); **add ≈12** (A002, A005, A008, A009, A010, A011, A012, A013, A014, the A015/A016/A017 block-message test, plus carve-out/malformed edge cases). Net **≥ +5** → expected total **≥ 3424**. Test files: −1 (`capture-state.test.ts` deleted), new tests folded into existing files → **≈138-139 files**.
- Regression focus: `artifact.test.ts` (gate block path re-expressed), `capture-marker.test.ts` (input rename), `init.test.ts` (re-init merge), `work.test.ts` (status output shape).
