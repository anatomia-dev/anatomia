# Scope: Bump anatrace-core 0.2.0 → 0.4.0 (pin, fail-closed emit, reason lock, real-engine CI)

**Created by:** Ana
**Date:** 2026-06-16

## Intent

Anatomia's behavioral-attestation layer is fully wired but has emitted **zero** records, because the engine it consumes (`anatrace-core`) is pinned to a version that is both **uninstalled** and **known-false-PASS** (0.2.0). The product's headline differentiator is therefore undemonstrated, and emitting on 0.2.0/0.3.0 would attest *behind a forgeable engine*.

Bump `anatrace-core` 0.2.0 → 0.4.0 (install + lockfile), lock the verdict `reason` field to 0.4.0's closed set with schema validation, close finding C12 fail-closed in the emit path, and add real-engine CI assertions. Its own PR, full pipeline, so it leaves its own proof entry.

The disease is the pin behind a forgeable engine **plus** the unguarded empty-version stamp. Fixing the pin without the fail-closed gate would just relocate the dishonesty — a record could still carry `anatrace_core_version: ""` while satisfying the "exists" assertion.

## Complexity Assessment

- **Kind:** fix
- **Size:** medium
- **Surface:** cli
- **Files affected:**
  - `packages/cli/package.json` — pin `anatrace-core` → `"0.4.0"` exact
  - `pnpm-lock.yaml` — regenerate so the frozen-lockfile CI install resolves 0.4.0
  - `packages/cli/src/types/proof.ts` — `reason` field: `string` → closed `VerdictReason` union (scope-limited to this field)
  - `packages/cli/src/utils/compliance.ts` — fail-closed abstain gate + collapse double `readCoreVersion()`; reason schema validation at projection
  - `packages/cli/tests/utils/compliance.test.ts` (and/or a sibling) — real-engine CI assertions (AC4 i/ii) + one in-class force-push fixture (AC4 iii)
- **Blast radius:** `captureComplianceAtSave` is called at TWO save sites — `artifact.ts:1250` (build) and `artifact.ts:1682` (verify). Both inherit the abstain gate; both are the in-cycle observable emit sites. The import is **static** (`compliance.ts:30-36`), so install is load-bearing — a missing/old install is a build/test failure, not a soft skip. The `reason` union is consumed only where `ComplianceVerdictRecord.reason` is read; the typed narrowing must not break any existing reader.
- **Estimated effort:** ~half a day. The bump + gate + union are mechanical; the AC4(iii) fixture is the only open-ended part (iterate a transcript until it genuinely flips to `violated` under 0.4.0).
- **Multi-phase:** no

## Approach

Four moves, one PR, in dependency order:

1. **Bump + install + lock.** Set the pin to `0.4.0` exact, install, and regenerate `pnpm-lock.yaml`. CI runs `pnpm install --frozen-lockfile`, so a stale lockfile fails at the install step *before any test runs* — the lockfile regeneration is part of the bump, not an afterthought. `tsc` + build must be clean; that clean compile is the mechanical proof that 0.4.0 introduced no removed-export breakage against anatomia's call sites (no trust required — the gate proves it).

2. **Lock the `reason` field to 0.4.0's closed set.** Today `reason` is a free `string` sitting next to `status`, which is already a closed union — mirror that existing pattern. Introduce a typed `VerdictReason` union matching 0.4.0's closed set, plus a schema check at the projection point so an out-of-set reason is caught mechanically, not assumed. **Strictly scoped to the `reason` field and its check** — no broader `proof.ts` or proof-schema refactor.

3. **Close C12 fail-closed.** The emit path stamps `anatrace_core_version: readCoreVersion()` unconditionally, and `readCoreVersion()` returns `''` on failure — so a record can carry an empty engine version while satisfying the "exists" assertion. Compute the core version once, **abstain** (write no record — return `null`, matching the file's existing abstain guards) when it is empty/unresolvable, and stamp from that same value. This is the real behavioral fix, not merely a CI assertion. It also collapses the current double `readCoreVersion()` call into one.

4. **Real-engine CI assertions.** They live in the existing test job — CI already installs the real engine on every matrix runner via `--frozen-lockfile`, so no new CI infra. Assert against the live engine: every emitted `reason` is in the 0.4.0 closed set; the version stamp is exactly `"0.4.0"`; and one in-class obfuscated-forbidden-command fixture reads `violated`.

## Acceptance Criteria

### HARD / GATING (the PR does not merge without these)

- **AC1:** `require.resolve('anatrace-core')` resolves 0.4.0; `package.json` pin `== "0.4.0"` exact; `pnpm-lock.yaml` regenerated to resolve 0.4.0; `tsc` + build clean.
- **AC2:** The verdict `reason` field is locked to 0.4.0's closed `VerdictReason` set — typed union + schema validation. SCOPE LIMIT: the reason union + its schema check ONLY. Do NOT refactor the broader proof schema or `proof.ts`.
- **AC3:** Finding C12 closed FAIL-CLOSED — the emit path ABSTAINS (writes no record) when the core version is empty/unresolvable; it never stamps `anatrace_core_version: ""`. Implemented as a gate in `captureComplianceAtSave` (the behavioral fix), not merely a CI assertion. Collapse the double `readCoreVersion()`: compute once, gate on it, stamp from the same value.
- **AC4:** Real-engine CI assertions green:
  - (i) every emitted `reason` ∈ 0.4.0 closed set;
  - (ii) the version stamp `== "0.4.0"` exact;
  - (iii) **one fixture in the obfuscated-forbidden-command class demonstrably reads `violated` under the installed 0.4.0 engine.** Exact transcript bytes are flexible — Build iterates the transcript until it genuinely flips. SCOPE LIMIT: ONE fixture. **Guards on AC4(iii):**
    - The fixture MUST stay in the class the 0.4.0 fix closed — an obfuscated / non-trivially-resolved forbidden command (ANSI-C `$'...'` force-push shape or equivalent). A plainly-violated command any version would catch proves nothing.
    - If no in-class fixture can be made to flip under 0.4.0, **STOP and surface it as a finding** — do NOT downgrade to a trivial fixture to turn CI green. That would mean the closure isn't reaching our emit path, which is exactly what this item exists to catch.
    - Do NOT attempt to prove the 0.2.0→0.4.0 differential in CI. CI proves only that 0.4.0 catches the in-class fixture. The "0.2.0 false-passed it" half of the claim is cited from anatrace's own audit (#38 / CLOSEOUT), not re-derived here.

### OBSERVABLE / NON-GATING (record it; it never holds the PR)

- ≥1 compliance record with `anatrace_core_version == "0.4.0"` emits on disk as exhaust of THIS cycle's own build/verify saves (`captureComplianceAtSave` at `artifact.ts:1250` / `:1682`). This is a NON-BLOCKING observable, NOT a merge gate. If it does not fire in-cycle, it is a ~5-minute follow-on `ana run`, never a held PR. Emitting it is the dogfood flywheel; absence is not a failure of this PR.

## Edge Cases & Risks

- **Stale lockfile = CI install failure.** `--frozen-lockfile` rejects any drift between `package.json` and `pnpm-lock.yaml`. Regenerating the lockfile is load-bearing; skipping it fails CI before tests run.
- **Empty/unresolvable core version.** The whole point of AC3 — must abstain, never stamp `""`. Covered by the gate; verify it abstains rather than throws.
- **`reason` narrowing breaks a reader.** Tightening `reason: string` → union could surface a latent assignment elsewhere. The schema validation and `tsc` clean (AC1) catch this; the scope limit keeps the change to this one field.
- **Fixture proves nothing (trivial-command trap).** Guarded explicitly in AC4(iii): must be in-class; if it can't flip, STOP and file a finding rather than weaken it.
- **Behavioral, not compile, exposure.** A clean compile against 0.4.0 does not prove correct behavior — the exposure is verdict flips. This is precisely why AC4 runs the real engine instead of mocking it.
- **Two emit sites.** Both build and verify saves call the emit path; the gate and observable apply to both. Don't fix one and miss the other.

## Rejected Approaches

- **Fold into Step 3 (verdict integrity).** Rejected — kept separate so this leaves its own proof entry and the honesty boundary stays clean (dogfood record now; public attestation only after Step 3 lands).
- **CI-only C12 fix (assert non-empty in a test, leave the emit path stamping `""`).** Rejected — that detects the disease without curing it. The fix must be behavioral: abstain in `captureComplianceAtSave`.
- **Broaden the `reason` lock into a full proof-schema pass.** Rejected — scope creep. The closed `status` union already establishes the pattern; match it for `reason` only.
- **Prove the 0.2.0→0.4.0 differential in CI.** Rejected — brittle and unnecessary. Cite anatrace's audit for the false-PASS half; CI proves only that 0.4.0 catches the in-class fixture.
- **Bundle C9 (parseSession-null branch coverage).** Rejected — out of scope (see Open Questions). It is a distinct coverage gap, not the version bump.

## Open Questions

- **Exact 0.4.0 `VerdictReason` member list.** Must be read from the installed `anatrace-core` `.d.mts` *post-install* — cannot be derived pre-install. M3 counted 15 (incl. `command-unresolvable` / `session-parse-suspect` / `harness-version-unrecognized`); verify the live set, do not inherit the count. AnaPlan resolves this during planning.
- **Does the build worktree run `pnpm install` after the `package.json` change?** Determines whether the in-cycle observable emit (NON-GATING) fires this cycle or needs the ~5-min follow-on `ana run`. AnaPlan to confirm against worktree behavior.
- **Force-push / obfuscated-command fixture: build or reuse?** No existing force-push / obfuscated-command transcript fixture found under `tests/` (grep on `force-push`/`--force`/`obfuscat`/`$'` surfaced only unrelated test files). Likely build ONE minimal in-class fixture. Per AC4(iii) scope limit: build one, defer any corpus.

## Exploration Findings

### Patterns Discovered

- `compliance.ts:147-252` (`captureComplianceAtSave`) — the emit path. Uses a chain of ~8 early `return null` abstain guards (`:153,156,173,178,186,193,196,198`) as its "write nothing rather than write a bad record" idiom. The C12 fail-closed gate (AC3) should be a new guard in exactly this style.
- `compliance.ts:215-220` — verdicts projected from the core result: `status: v.status`, `reason: v.reason`, straight from the engine. The `reason` lock (AC2) validates at this projection point.
- `compliance.ts:229` — `anatrace_core_version: readCoreVersion()` stamped unconditionally; `readCoreVersion()` (`:51-58`) returns `''` on failure. This is C12 in the code.
- `src/types/proof.ts:143` — `status: 'satisfied' | 'violated' | 'unverifiable'` is the existing closed-union pattern `reason` (`:145`) must mirror.

### Constraints Discovered

- [TYPE-VERIFIED] Static import surface (`compliance.ts:30-36`): `anatomiaAdapter, parseSession, runCompliance, scrubDeep, transcriptContentResolver` + types `Harness, Mandate, NamedBlob`. Clean `tsc`/build against 0.4.0 (AC1) mechanically proves no removed-export breakage on these.
- [TYPE-VERIFIED] `reason: string` free/unvalidated at `src/types/proof.ts:145`; `status` beside it already closed.
- [OBSERVED] CI install is `pnpm install --frozen-lockfile` (`.github/workflows/test.yml:41`) → lockfile must be regenerated; real engine is installed on every matrix runner, so AC4 assertions need no new CI infra.
- [OBSERVED] `node_modules/anatrace-core` absent at both repo root and `packages/cli`; lockfile resolves 0.2.0 (`pnpm-lock.yaml:1859,5687`); npm `dist-tags.latest = 0.4.0`.
- [OBSERVED] `captureComplianceAtSave` called at TWO sites: `artifact.ts:1250` (build), `artifact.ts:1682` (verify).

### Test Infrastructure

- `tests/utils/compliance.test.ts` — Vitest, contract-tagged (`// @ana A0xx`). Line ~142 reads the installed core version dynamically via `createRequire('anatrace-core/package.json').version` and asserts the record's `anatrace_core_version` equals it — so it **auto-tracks 0.4.0 with no edit**. AC4's new assertions extend this suite.

## For AnaPlan

### Structural Analog

`src/types/proof.ts:143` — the existing `status` closed union on `ComplianceVerdictRecord` is the exact structural analog for the AC2 `reason` lock: same record, same kind of change (free/closed → closed union), adjacent field. Build the `VerdictReason` union the same way `status` is built, and validate it at the same projection point (`compliance.ts:218-219`).

### Relevant Code Paths

- `packages/cli/src/utils/compliance.ts` — `readCoreVersion` (`:51-58`), `captureComplianceAtSave` (`:147-252`), abstain guards, verdict projection (`:215-220`), version stamp (`:229`).
- `packages/cli/src/types/proof.ts` — `ComplianceVerdictRecord` (`:137-146`), `status` union (`:143`), `reason` (`:145`).
- `packages/cli/src/commands/artifact.ts` — emit call sites (`:1250`, `:1682`), import (`:31`).
- `packages/cli/package.json` — `anatrace-core` pin (deps block; ~line 63, content `"anatrace-core": "0.2.0"`).
- `.github/workflows/test.yml` — frozen-lockfile install (`:41`), test job (`:61-63`).
- `packages/cli/tests/utils/compliance.test.ts` — version-lock test (`~:142`), home for AC4 assertions.

### Patterns to Follow

- Abstain via early `return null` (the file's existing idiom) for the C12 gate — not an exception, not a sentinel record.
- Closed union for `reason` mirroring the `status` union in the same interface.
- Read the live 0.4.0 `VerdictReason` set from the installed `.d.mts`; do not hardcode from the M3 count.

### Known Gotchas

- **`--frozen-lockfile` is unforgiving** — regenerate `pnpm-lock.yaml` or CI dies at install before any test.
- **Two emit sites, not one** — the gate and observable apply to both build and verify saves.
- **AC4(iii) is the load-bearing risk** — the STOP signal is a feature: an in-class fixture that won't flip means the closure isn't reaching our emit path. Surface it as a finding; do NOT swap in a trivial fixture to go green.
- **Pre-install unknowns are real** — the exact `VerdictReason` set and whether the fixture flips can only be confirmed after install. Plan for an install-then-verify step, not a guess.

### Things to Investigate

- Read the installed 0.4.0 `VerdictReason` `.d.mts` to fix the exact closed-set membership for the AC2 union and the AC4(i) assertion.
- Confirm whether the build worktree runs `pnpm install` post-bump (governs the NON-GATING in-cycle observable).
- Construct/verify the one in-class obfuscated-forbidden-command fixture flips to `violated` under 0.4.0 (AC4 iii) — and honor the STOP signal if it won't.

### Related Findings (disposition per the must-disposition rule)

- **`anatrace-core-integration-C12`** (active, action: monitor) — **FIXED by this scope (AC3).** The empty-version-still-passes hole.
- **`anatrace-core-integration-C9`** (active, action: scope) — **OUT OF SCOPE, cited for awareness.** Malformed-but-readable transcript → `parseSession` returns null branch uncovered at `compliance.ts:193`. Distinct from AC4's fixture (which produces a *parsed, violated* session, not a null one); bundling it would violate the one-fixture scope limit. Left for its own cycle.
