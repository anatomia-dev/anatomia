# Spec: Bump anatrace-core 0.2.0 → 0.4.0 (pin, fail-closed emit, reason lock, real-engine CI)

**Created by:** AnaPlan
**Date:** 2026-06-16
**Scope:** .ana/plans/active/anatrace-pin-0-4-0/scope.md

## Approach

Four moves, one PR, in dependency order. The disease is **a pin behind a forgeable engine (0.2.0, known-false-PASS) plus an unguarded empty-version stamp** — fixing one without the other relocates the dishonesty. So this is a behavioral fix, not a version-number edit.

1. **Bump + install + lock.** Pin `anatrace-core` → `"0.4.0"` exact in `packages/cli/package.json`, then run a **non-frozen** `pnpm install` so `pnpm-lock.yaml` regenerates to resolve 0.4.0. This is load-bearing, not cosmetic: CI installs with `--frozen-lockfile` (`.github/workflows/test.yml:41`), so a stale lockfile fails at the install step before any test runs. **Worktree note (resolved):** `ana work start` already ran `pnpm install --frozen-lockfile` when it created the build worktree (`worktree.ts:391-417`), which installed the *old* 0.2.0. After you edit the pin you MUST re-run a non-frozen `pnpm install` inside the worktree — this both regenerates the lockfile and pulls 0.4.0 into the worktree's `node_modules` so the suite (and this cycle's own emit) judges against the real 0.4.0 engine.

2. **Lock the `reason` field to 0.4.0's closed set — forward-compatibly.** Today `ComplianceVerdictRecord.reason` is a free `string` (`proof.ts:145`) sitting next to `status`, which is already a closed union (`proof.ts:143`). Introduce a **single source of truth** for the reason set and validate at the projection point. The two locks in this scope have **opposite failure modes — do not conflate them** (see Gotchas): the `reason` lock RECORDS an unknown reason verbatim and emits a drift warning; it never rejects or abstains.

3. **Close C12 fail-closed.** The emit path stamps `anatrace_core_version: readCoreVersion()` unconditionally (`compliance.ts:229`), and `readCoreVersion()` returns `''` on failure (`compliance.ts:51-58`) — so a record can carry an empty engine version while satisfying the "exists" assertion. Compute the version **once**, **abstain** (`return null`, the file's existing idiom) when it is empty/unresolvable, and stamp from that same value. This is the behavioral cure, and it collapses the current double `readCoreVersion()` call into one.

4. **Real-engine assertions.** Extend the existing `compliance.test.ts` suite. CI already installs the real engine on every matrix runner via `--frozen-lockfile`, so no new CI infra. Assert against the live engine: every emitted `reason` is in the 0.4.0 closed set; the emitted version stamp matches the installed engine (dynamic — see Output Mockups); and one in-class obfuscated-forbidden-command fixture reads `violated`.

**Resolved open questions (all three from scope):**

- **Exact 0.4.0 `VerdictReason` set** — read from the published `0.4.0` `dist/index.d.mts`. **15 members** (use this exact set; do NOT inherit the M3 count or the 0.2.0 list):
  `predicate-matched`, `predicate-not-matched`, `routed-to-llm`, `runtime-scoped`, `low-confidence`, `absent-signal`, `content-unresolvable`, `command-unresolvable`, `codex-blind`, `subject-unresolvable`, `delegate-coverage-incomplete`, `channel-coverage-incomplete`, `window-unresolvable`, `harness-version-unrecognized`, `session-parse-suspect`.
  Differential vs 0.2.0 is **purely additive** — 3 new (`command-unresolvable`, `harness-version-unrecognized`, `session-parse-suspect`), zero removed/renamed. `status` union unchanged (`satisfied | violated | unverifiable`). The additive-only delta is why narrowing `reason: string` → union cannot break a stored-record reader.
- **Build worktree install** — see Approach step 1. The observable (below) WILL fire in-cycle once you run the non-frozen install before the build's own `ana artifact save`.
- **Fixture: build or reuse** — build ONE. No existing obfuscated-command transcript fixture. Mandate source is `ana-build.md` (declares the no-force-push / forbidden-command obligation). See AC4(iii) and Gotchas for the load-bearing iteration + STOP guard.

## Output Mockups

**Drift warning (AC2)** — emitted to **stderr** at the projection point when the live engine returns a reason outside `VERDICT_REASONS`. Non-blocking; the verdict is still recorded verbatim. This path is NOT triggered by 0.4.0 (whose reasons are all known) — it is the future-bump drift signal:

```
[anatrace] unknown verdict reason "some-future-reason" from anatrace-core@0.4.0 —
the engine may have drifted; recording verbatim. Update VERDICT_REASONS in src/types/proof.ts.
```

**Compliance record version stamp (AC4 ii)** — the emitted `anatrace_core_version` equals the installed engine version, read dynamically (the existing `compliance.test.ts:142` pattern). The test compares emitted-vs-installed, NOT against a `"0.4.0"` literal:

```ts
const installed = (createRequire(import.meta.url)('anatrace-core/package.json') as { version: string }).version;
expect(rec.anatrace_core_version).toBe(installed); // dynamic — auto-tracks the next bump
```

The single `"0.4.0"` literal in the whole change lives in the AC1 install/pin check (it asserts the bump landed). Do not introduce a second `"0.4.0"` literal anywhere in the emit/compliance tests.

**Fail-closed abstain (AC3)** — when the core version is empty/unresolvable, `captureComplianceAtSave` returns `null` and writes no file (no `anatrace_core_version: ""` record ever lands):

```ts
const result = captureComplianceAtSave(projectDir, 'feat', env({...}), { readCoreVersion: () => '' });
expect(result).toBeNull();              // abstained
// compliance dir empty — no record written
```

## File Changes

All six files exist (verified) — every change is a `modify`. The machine-readable list is in `contract.yaml` `file_changes`.

### packages/cli/package.json (modify)
**What changes:** The `anatrace-core` dependency pin `"0.2.0"` → `"0.4.0"` exact (currently line 59).
**Pattern to follow:** Existing exact pins in the same `dependencies` block (no `^`/`~`).
**Why:** Without the exact pin, the lockfile won't resolve 0.4.0 and the headline differentiator stays undemonstrated behind a forgeable engine.

### pnpm-lock.yaml (modify)
**What changes:** Regenerated by a non-frozen `pnpm install` so it resolves `anatrace-core@0.4.0` (currently pins 0.2.0 at lines ~1859, ~5687).
**Pattern to follow:** Let `pnpm install` rewrite it — do not hand-edit.
**Why:** `--frozen-lockfile` in CI rejects any drift between `package.json` and the lockfile; a stale lockfile fails CI at install before a single test runs.

### packages/cli/src/types/proof.ts (modify)
**What changes:** Add the single source of truth for verdict reasons and tighten the field type — SCOPE-LIMITED to `reason` and its set:
- `export const VERDICT_REASONS = [...15 members...] as const;` — the canonical list (the exact 15 above).
- `export type VerdictReason = (typeof VERDICT_REASONS)[number];` — type derived from the const (no duplicated member list).
- `export function isVerdictReason(r: string): r is VerdictReason` — membership guard backed by `VERDICT_REASONS` (a `Set` for O(1)).
- Change `ComplianceVerdictRecord.reason: string` → `reason: VerdictReason | (string & {})`.
**Pattern to follow:** The adjacent `status: 'satisfied' | 'violated' | 'unverifiable'` closed union (`proof.ts:143`) is the structural analog — same record, adjacent field, free→closed.
**Why:** A free `string` lets a drifted/garbage reason pass silently. `VerdictReason | (string & {})` documents the closed set for readers/IDE while still legally storing an unknown reason from a *future* engine without a cast or data loss — exactly the "on-disk shape distinct from core's runtime shape so the engine can evolve" intent already stated in the `ComplianceVerdictRecord` doc comment (`proof.ts:135`).
**Deliberate deviation (call it out, don't second-guess it):** `proof.ts` is otherwise types-only. The runtime `const VERDICT_REASONS` + `isVerdictReason` guard live here ON PURPOSE — it is the single source of truth feeding both the type and the runtime check, and it avoids a circular import (`compliance.ts` already imports types from `proof.ts`; `proof.ts` imports nothing from `compliance.ts`). Defining the const in `compliance.ts` and the type in `proof.ts` would duplicate the 15-member list across two files — the exact drift this lock exists to prevent.

### packages/cli/src/utils/compliance.ts (modify)
**What changes:** Four coordinated edits in `captureComplianceAtSave` + one small extraction:
- **Fail-closed gate (AC3):** Compute `const coreVersion = readCoreVersion();` ONCE, add a new abstain guard `if (!coreVersion) return null;` in the existing early-`return null` style, and stamp `anatrace_core_version: coreVersion` from that same value (replacing the second `readCoreVersion()` call at `:229`). Place the guard with the other guards / before the expensive `runCompliance` if natural — exact placement is yours, but it must abstain before any record is built.
- **Testable version seam (AC3):** Give `captureComplianceAtSave` an optional 4th parameter `deps: { readCoreVersion?: () => string } = {}` defaulting `readCoreVersion` to the module function. The gate calls `(deps.readCoreVersion ?? readCoreVersion)()`. The two real call sites in `artifact.ts` pass nothing → unchanged behavior. This is the seam the AC3 test uses to drive an empty version without uninstalling the engine (it also closes the standing build-concern that the abstain path had no reliable external trigger).
- **Reason drift check (AC2):** Extract the verdict projection (currently the inline `result.verdicts.map(...)` at `:215-220`) into an exported pure helper `projectVerdicts(verdicts, saysById): ComplianceVerdictRecord[]`. Inside, for each verdict: if `!isVerdictReason(v.reason)`, `console.warn(...)` the drift message (see Output Mockups), then store `reason: v.reason` **verbatim regardless**. NEVER drop, coerce, or abstain on an unknown reason.
- Import `VERDICT_REASONS`/`isVerdictReason`/`projectVerdicts` dependencies from `proof.js` with `.js` extension and `import type` for the types.
**Pattern to follow:** The chain of early `return null` abstain guards (`:153,156,173,178,186,193,196,198`) for the AC3 gate. The existing inline projection (`:215-220`) for `projectVerdicts`.
**Why:** AC3 is the behavioral cure for C12 (must abstain, never stamp `""`). The `projectVerdicts` extraction is the testable seam for AC2's verbatim-store + warn behavior (the real 0.4.0 engine never emits an unknown reason, so the drift path can only be exercised through a pure helper).

### packages/cli/tests/utils/compliance.test.ts (modify)
**What changes:** Add the AC2/AC3/AC4 assertions and the ONE in-class fixture, tagged `// @ana A0xx` per the contract. Reuse the file's existing helpers (`installAgentDef`, `writeContract`, `captureClaude`, `writeClaudeTranscript`, the temp-dir `beforeEach`/`afterEach`). Use `// @ana` tags starting at **A045** (existing tags run through A044 across the suite — do not collide).
**Pattern to follow:** The existing `it()` blocks and the dynamic version read at `:142`.
**Why:** This is where the engine is judged for real. See Testing Strategy for the matrix.

### CHANGELOG.md (modify)
**What changes:** Add entries under the existing `## [Unreleased]` heading (Keep a Changelog format, which the file already uses). Record (a) the `anatrace-core` 0.2.0 → 0.4.0 bump, and (b) the verdict-semantics shift — that previously-`satisfied`/false-passing obfuscated commands now read `violated`/`unverifiable`, and the three new `reason` members (`command-unresolvable`, `harness-version-unrecognized`, `session-parse-suspect`).
**Pattern to follow:** The `### Added` / `### Fixed` subsections under prior version headings.
**Why:** AC5 (HARD). This is a behavior change on a repo with an actively maintained CHANGELOG; the doc ships in THIS PR.

## Acceptance Criteria

Copied from scope, expanded with implementation-specific criteria. (HARD criteria gate the PR; the observable never does.)

- [ ] **AC1:** `require.resolve('anatrace-core')` resolves and the installed `anatrace-core/package.json` version `== "0.4.0"`; `package.json` pin `== "0.4.0"` exact; `pnpm-lock.yaml` regenerated to resolve 0.4.0; `tsc` + build clean.
- [ ] **AC2:** `reason` locked to the 0.4.0 closed set via `VERDICT_REASONS` + `isVerdictReason`, validated at projection. An out-of-set reason is **recorded verbatim and surfaced as a stderr drift warning — never rejected or abstained.** SCOPE LIMIT: the reason set + its check ONLY; no broader `proof.ts` / proof-schema refactor.
- [ ] **AC3:** C12 closed FAIL-CLOSED — `captureComplianceAtSave` ABSTAINS (returns `null`, writes no record) when the core version is empty/unresolvable; never stamps `anatrace_core_version: ""`. `readCoreVersion()` computed once; stamped from the same value.
- [ ] **AC4:** Real-engine assertions green — (i) every emitted `reason` ∈ the 0.4.0 set; (ii) the emitted version stamp equals the installed engine version (dynamic); (iii) ONE obfuscated-forbidden-command fixture reads `violated` under installed 0.4.0 (honor the STOP guard — do NOT downgrade to a trivial fixture).
- [ ] **AC5 (HARD):** `CHANGELOG.md` `## [Unreleased]` records the 0.2.0 → 0.4.0 bump AND the verdict-semantics shift + new reason members.
- [ ] **Observable (NON-GATING):** ≥1 compliance record with `anatrace_core_version == "0.4.0"` emits on disk as exhaust of this cycle's own build/verify saves. NOT a merge gate — record it in the build report; absence is a ~5-min follow-on `ana run`, never a held PR.
- [ ] New: `pnpm --filter anatomia-cli build` clean (typecheck + tsup).
- [ ] New: `cd packages/cli && pnpm lint` clean (0 errors).
- [ ] New: `cd packages/cli && pnpm vitest run` — full suite green; test count does not decrease.

## Testing Strategy

- **Unit tests (extend `compliance.test.ts`):**
  - **AC2 guard:** `isVerdictReason('command-unresolvable')` → `true` (proves the union was built from the live 0.4.0 set, not the 0.2.0 list — this member is new in 0.4.0); `isVerdictReason('not-a-real-reason')` → `false`.
  - **AC2 drift behavior:** call `projectVerdicts([{ claimId: 'c1', status: 'violated', reason: 'totally-made-up' }], saysMap)` with a `console.warn` spy → assert the returned record's `reason === 'totally-made-up'` (verbatim, not coerced/dropped) AND `console.warn` was called once. This is the only path that exercises drift; the real engine never emits an unknown reason.
  - **AC3 abstain:** drive `captureComplianceAtSave(..., { readCoreVersion: () => '' })` → assert returns `null` AND the compliance dir contains zero records (no `""`-version file).
  - **AC3 happy stamp:** a normal capture stamps a non-empty version equal to the installed engine (dynamic read) — never `""`.
- **Real-engine tests:**
  - **AC4(i):** capture a real session → assert `record.verdicts.every(v => VERDICT_REASONS.includes(v.reason))` (equivalently: count of out-of-set reasons `=== 0`).
  - **AC4(ii):** `record.anatrace_core_version === installedVersion` (dynamic, per Output Mockups).
  - **AC4(iii) — the load-bearing one:** build ONE in-class fixture (an obfuscated / non-trivially-resolved forbidden command — ANSI-C `$'...'` force-push shape or equivalent) using `installAgentDef('build')` as the mandate source, run it through the real engine via `captureComplianceAtSave`, and assert ≥1 verdict has `status === 'violated'`. Iterate the transcript bytes until it genuinely flips. **If no in-class fixture can be made to flip under 0.4.0, STOP and file a finding — do NOT swap in a trivially-violated command to go green.** A plainly-forbidden command any version catches proves nothing; the STOP signal means the closure isn't reaching our emit path, which is the whole reason this item exists.
- **Edge cases:** empty/unresolvable core version (AC3 abstain — covered above); unknown reason from a hypothetical future engine (AC2 drift — covered); both build AND verify save sites inherit the gate (the change is in the shared `captureComplianceAtSave`, so both `artifact.ts:1250` and `:1682` are covered by construction — no per-site test needed).
- **Do NOT** attempt to prove the 0.2.0→0.4.0 differential in CI (brittle, out of scope). CI proves only that 0.4.0 catches the in-class fixture; the "0.2.0 false-passed it" half is cited from anatrace's own audit.
- **Run** `cd packages/cli && pnpm vitest run tests/utils/compliance.test.ts` after each edit; full `pnpm vitest run` before the build report.

## Dependencies

- `anatrace-core@0.4.0` installed in the worktree (non-frozen `pnpm install` after the pin edit) before tests run. The static import (`compliance.ts:30-37`) makes the install load-bearing — a missing/old install is a hard build/test failure, not a soft skip.

## Constraints

- **Test count must not decrease** (CI runs 2 Node versions; coverage thresholds in `vitest.config.ts`).
- **SCOPE LIMIT (AC2):** the reason set + its check ONLY. No broader `proof.ts` or proof-schema refactor (do NOT touch `commit_hygiene` duplication or other fields flagged in proof context — those are separate cycles).
- **SCOPE LIMIT (AC4 iii):** exactly ONE fixture. Defer any corpus.
- **Backward compatibility:** the `reason` narrowing must not break any existing reader. `VerdictReason | (string & {})` is assignable from any string, so it cannot, and the additive-only 0.4.0 delta means stored 0.2.0-era reasons remain valid members. `tsc` clean (AC1) is the mechanical proof.
- **Dogfood-only:** this touches `packages/cli` source/tests + root `pnpm-lock.yaml`/`CHANGELOG.md` only. It does NOT touch `templates/` or generators — nothing ships to customers.

## Gotchas

- **The two locks have OPPOSITE failure modes — the single most important thing not to get wrong.** AC3 (empty/unresolvable core version → unknown provenance) **abstains**: write no record. AC2 (unknown `reason` from a *known* engine → a valid verdict whose label drifted) **records verbatim + warns**: never reject, never abstain. Do NOT apply AC3's abstain reflex to AC2 — dropping a valid verdict on an unknown reason re-breaks the forward-compat the distinct-on-disk-shape design deliberately bought.
- **`--frozen-lockfile` is unforgiving.** Regenerate `pnpm-lock.yaml` via non-frozen install or CI dies at the install step before any test. The worktree's startup install used `--frozen-lockfile` (old 0.2.0) — you must re-install non-frozen after the pin edit.
- **Two emit sites, not one.** `captureComplianceAtSave` is called at `artifact.ts:1250` (build) and `:1682` (verify). The gate lives in the shared function, so both inherit it — but don't accidentally special-case one site.
- **AC4(iii) is the load-bearing risk.** The STOP signal is a feature, not a failure: an in-class fixture that won't flip means the closure isn't reaching our emit path. File a finding; never weaken the fixture.
- **`command-unresolvable` is new in 0.4.0** and is the reason class behind the obfuscated-command closure — a useful signpost when iterating the AC4(iii) fixture (the obfuscated force-push should resolve/match under 0.4.0 where 0.2.0 false-passed).
- **C9 is OUT OF SCOPE** (malformed-but-readable transcript → `parseSession` null branch, `compliance.ts:193`). It's a distinct coverage gap; AC4's fixture produces a *parsed, violated* session, not a null one. Do not bundle it.
- **`.js` import extensions + `import type`.** Every relative import ends in `.js`; types imported with `import type`, separate from value imports. Omitting `.js` compiles but crashes at runtime (tsup emits ESM).
- **`console.warn` from a util is a deliberate, AC-mandated exception** to the "engine returns defaults, commands surface output" rule. AC2 requires a drift *signal*; stderr is the lightest honest channel that doesn't expand the on-disk schema (which the scope limit forbids). Keep it to the one drift line.

## Build Brief

### Rules That Apply
- All relative imports end in `.js`; `node:` prefix for built-ins. (tsup emits ESM — missing `.js` crashes at runtime.)
- `import type` for type-only imports, separate from value imports. `VerdictReason` / `ComplianceVerdictRecord` are `import type`; `VERDICT_REASONS` / `isVerdictReason` / `projectVerdicts` are value imports.
- Named exports only; no default exports.
- `| null` for "checked and empty" (the abstain return is `null`); `?:` only for "may not have been checked."
- Early `return null` over nested conditionals — match the existing abstain-guard chain for the AC3 gate.
- Explicit return types on all exported functions (`isVerdictReason`, `projectVerdicts`, the updated `captureComplianceAtSave`). `@param`/`@returns` JSDoc on every exported function (eslint pre-commit rejects missing tags).
- Avoid `any` — `isVerdictReason(r: string): r is VerdictReason` narrows from `string`.
- Tests: prefer the dependency-injection seam (`deps.readCoreVersion`) over global module mocks; real engine over mocks elsewhere. Assert specific values (contract-aligned matcher/value), never tautologies. Temp-dir pattern via the file's existing `fs.mkdtempSync` `beforeEach`/`afterEach`. Pass `--run` (the project's `pnpm vitest run` already does).

### Pattern Extracts

The existing inline projection to extract into `projectVerdicts` (`compliance.ts:213-220`):
```ts
const saysById = new Map<string, string>();
for (const c of mandate.claims) saysById.set(c.id, c.says);
const verdicts: ComplianceVerdictRecord[] = result.verdicts.map((v) => ({
  claim_id: v.claimId,
  says: saysById.get(v.claimId) ?? '',
  status: v.status,
  reason: v.reason,
}));
```

The closed-union structural analog to mirror for `VerdictReason` (`proof.ts:142-145`):
```ts
/** Behavioral verdict: `satisfied` | `violated` | `unverifiable`. EVIDENCE ONLY — never gates. */
status: 'satisfied' | 'violated' | 'unverifiable';
/** Coverage-aware verdict reason (subject/context-dependent, e.g. `codex-blind`). */
reason: string;
```

The abstain-guard idiom for the AC3 gate (`compliance.ts:155-156, 173, 178`):
```ts
const role = env['ANA_ROLE'] ?? '';
if (!role) return null; // no role → nothing to attribute
...
if (!sessionId) return null; // unresolvable session → nothing to write
...
if (!transcriptPath) return null; // no transcript bytes → nothing to judge
```

The version stamp to fix (`compliance.ts:229`) — currently a second `readCoreVersion()` call; stamp from the once-computed `coreVersion`:
```ts
anatrace_core_version: readCoreVersion(),
```

The dynamic version-read test pattern to reuse for AC4(ii) (`compliance.test.ts:142-143`):
```ts
const coreVersion = (createRequire(import.meta.url)('anatrace-core/package.json') as { version: string }).version;
expect(rec.anatrace_core_version).toBe(coreVersion);
```

### Proof Context

`packages/cli/src/utils/compliance.ts`:
- **(C12) [code] — FIXED BY THIS BUILD (AC3).** `readCoreVersion` returns `''` on failure; A020's `exists` would still pass with an empty string, so a record could carry an empty engine version. The fail-closed gate cures this.
- **Build concern — ADDRESSED.** "The outer try-catch / abstain path had no reliable external trigger." The AC3 `deps.readCoreVersion` seam is exactly that trigger — note in the build report that this concern is now covered.
- **(C9) [test] — OUT OF SCOPE, cited.** Malformed-but-readable transcript → `parseSession` null branch (`:193`) uncovered. Distinct from AC4's fixture. Leave it.

`packages/cli/src/types/proof.ts`:
- **(commit-hygiene-C6) [code] — OUT OF SCOPE, cited.** `commit_hygiene` type duplicated across three files. Do NOT touch it — AC2's scope limit forbids broader `proof.ts` refactors. (Noted only so you don't "helpfully" fix it and blow the scope limit.)

### Checkpoint Commands
- After the pin edit + non-frozen install (in the worktree): `require.resolve('anatrace-core')` resolves 0.4.0 and `node -e "console.log(require('anatrace-core/package.json').version)"` prints `0.4.0`.
- After `proof.ts` + `compliance.ts` edits: `cd packages/cli && pnpm vitest run tests/utils/compliance.test.ts` — expected: all green (existing + new tags).
- After all changes: `cd packages/cli && pnpm vitest run` — expected: full suite green, count ≥ baseline.
- Build: `pnpm --filter anatomia-cli build` (typecheck + tsup) — clean.
- Lint: `cd packages/cli && pnpm lint` — 0 errors.

### Build Baseline
**The full suite cannot run in the main tree right now — `anatrace-core` is uninstalled there (`node_modules/anatrace-core` absent at root and `packages/cli`), and the static import makes it a hard failure. Capture the exact baseline in the worktree AFTER your non-frozen install, BEFORE adding new tests:**
- Command: `cd packages/cli && pnpm vitest run`
- Pre-edit estimate (file/`it()` count, NOT a run): ~155 test files, ~3644 `it()`/`test()` blocks; `compliance.test.ts` has 10 `it()` blocks. Record the EXACT numbers from your in-worktree run.
- After build: expected baseline + the new tests (≈6–8 added in `compliance.test.ts`), count strictly non-decreasing.
- Regression focus: `compliance.test.ts` (signature change to `captureComplianceAtSave` — the optional `deps` param must not break existing callers/tests), and any reader of `ComplianceVerdictRecord.reason` (the narrowing — `tsc` clean is the proof; the additive 0.4.0 delta means no value-level breakage).
