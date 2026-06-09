# Build Report: Remove `processCaptureStrict` — provenance records-and-annotates, never blocks

**Created by:** AnaBuild
**Date:** 2026-06-08
**Spec:** .ana/plans/active/remove-processcapturestrict/spec.md
**Branch:** feature/remove-processcapturestrict

## What Was Built

A pure deletion. `processCaptureStrict` — the unreleased flag whose only job was to `process.exit(1)` at `ana work complete` on incomplete process provenance — is removed from every surface. The recorder (`assembleProcessAttestation` / `computeCompleteness`) is untouched; the model is now two-state: `processCapture` on = best-effort capture + always-annotated completeness; off = nothing recorded.

**Source:**
- `packages/cli/src/commands/work.ts` (modified): Deleted the §8b-strict guard block (the `// 8b-strict.` comment through the `if (isProcessCaptureStrictEnabled(...))` block) and its three orphaned imports — `isProcessCaptureStrictEnabled` (whole line), `SessionProvenance` type (whole line), and `computeCompleteness` (trimmed from the combined `work-proof.js` import, keeping `writeProofChain` + `guardFailResult`). §8b and §8c are now adjacent and intact.
- `packages/cli/src/utils/forensics.ts` (modified): Deleted `isProcessCaptureStrictEnabled` and its JSDoc. `isProcessCaptureEnabled` unchanged.
- `packages/cli/src/commands/init/anaJsonSchema.ts` (modified): Deleted the `processCaptureStrict` schema field + comment. `.passthrough()` tolerates any stray key — no migration added.
- `packages/cli/src/commands/init/state.ts` (modified): Deleted the `processCaptureStrict: 'off'` emit + comment from `createAnaJson`.
- `packages/cli/src/commands/config.ts` (modified): Removed `'processCaptureStrict'` from `KNOWN_FIELDS`.
- `packages/cli/src/commands/doctor.ts` (modified): Removed the strict twin from the Enforcement dimension across all four sites (interface field, error-fallback literal, assessor read, terminal render line) and cleaned the now-stale `assessEnforcement` JSDoc. Enforcement now surfaces exactly two flags.

**Tests:**
- `packages/cli/tests/commands/work.test.ts` (modified): Renamed `describe('strict process-completeness guard (Phase 2)')` → `describe('process provenance recording')`; dropped the `processCaptureStrict` param from `setCaptureFlags`; removed the 3 strict guard tests; added 3 positive record-path tests (incomplete-records-gap, zero-sessions-incomplete, full-complete).
- `packages/cli/tests/commands/work-merge.test.ts` (modified): Added the keystone `--merge` regression — merge lands AND the proof entry is still written with the gap recorded.
- `packages/cli/tests/commands/doctor.test.ts` (modified): Removed the A010 strict-reports test; folded the "defaults" test to two surviving gates; dropped `processCaptureStrict` from two anaJson inputs; added the AC5 test (enforcement omits strict, keeps both survivors, exits 0).
- `packages/cli/tests/commands/config.test.ts` (modified): Removed the obsolete `does not warn when setting processCaptureStrict` test.
- `packages/cli/tests/commands/init.test.ts` (modified): Flipped the `createAnaJson` test to assert the key is absent (`toBeUndefined`); removed the re-init-preservation test for the deleted flag.
- `packages/cli/tests/commands/init/anaJsonSchema.test.ts` (modified): Removed the entire `processCaptureStrict enum values` describe block (4 schema-existence tests).

## PR Summary

- Removes `processCaptureStrict` — the unreleased flag that blocked `ana work complete` (via `process.exit(1)`) when recorded process provenance was incomplete. Metadata must never block a terminal pipeline action; under `--merge` the guard fired *after* the PR had merged, landing code with no audit trail.
- The provenance model is now two-state: `processCapture` on records best-effort capture and **always** annotates a `completeness` block (gaps listed, even for zero sessions); off records nothing. There is no third flag and no blocking path. The recorder is unchanged.
- Deletes the flag from every surface: the guard in `work.ts`, the `isProcessCaptureStrictEnabled` reader, the schema field, the `createAnaJson` emit, `config.ts` `KNOWN_FIELDS`, and doctor's Enforcement view (now two flags).
- Adds the keystone `--merge` regression test proving the merge lands **and** the proof entry is still written with the gap recorded — the exact inversion this change cures can never return.
- Net −5 tests: flag-existence plumbing removed alongside the flag, behavioral coverage of the surviving record path increased (3 guard tests → 4 stronger ones including the merge keystone).

## Acceptance Criteria Coverage

- AC1 "never blocks on incomplete provenance" → work.test.ts "records and completes when provenance is incomplete" (asserts `completeWork` resolves, never throws `process.exit`) — ✅ Verified
- AC2 "incomplete records the gap and completes" → work.test.ts:1454 `@ana A001,A002,A003` (entry written, `complete: false`, gap names `verify`) — ✅ Verified
- AC2-zero "zero sessions recorded as incomplete" → work.test.ts:1478 `@ana A004,A005` — ✅ Verified
- AC3 "record path unchanged, full → complete" → work.test.ts:1493 `@ana A006,A007` — ✅ Verified
- AC4 "flag gone from schema/createAnaJson/KNOWN_FIELDS; new ana.json has no key" → init.test.ts:135 `@ana A010` (`toBeUndefined`) + AC6 grep — ✅ Verified
- AC5 "doctor Enforcement reports two flags only, no strict line, exits 0" → doctor.test.ts:667 `@ana A011,A012,A013,A014` — ✅ Verified
- AC6 "no strict symbol anywhere in src; survivors unchanged" → grep (zero hits) + survivor ref counts — ✅ Verified (see Verification Commands)
- AC7 (reframed) "behavioral coverage ≥ prior; flag-plumbing removed with flag; coverage thresholds pass" → record-path tests increased; net −5 as expected. **Coverage thresholds NOT mechanically verified** — provider package not installed (see Open Issues) — 🔨 Implemented
- "(cd packages/cli && pnpm vitest run) passes" → 3582 passed / 0 failed / 2 skipped — ✅ Verified
- "lint clean, no no-unused-vars on trimmed work.ts imports" → 0 errors (pre-commit hook, both commits) — ✅ Verified
- "build succeeds" → `pnpm run build` succeeded (both commits) — ✅ Verified

**Contract coverage: 14/14 assertions tagged** (A001–A014).

## Implementation Decisions

- **A003 assertion method (`.some(g => g.includes('verify'))` instead of `.toContain('verify')`).** The contract's `gaps` target holds full strings like `"verify: 0 of 1 expected session(s) present"`, not the bare token `verify`. Vitest's `.toContain` on an array does exact-element matching, which would fail. I assert that some gap string includes `verify`, which faithfully satisfies the contract intent ("the recorded gap names the missing pipeline stage"). See Deviations.
- **Cleaned two stale JSDoc references in doctor.ts** (`assessEnforcement` doc said "and strict process-completeness flags" / "process capture and strict"). The flag they describe no longer exists; leaving them would mislead. Not called out in the spec's File Changes but within the deletion's intent.
- **Cleaned a third stale `processCaptureStrict: 'on'` test input** in doctor.test.ts "does not make overall fail" (line ~683). The spec only named the line-674 input, but the line-683 input referenced the same deleted flag. A passthrough key is harmless at runtime, but leaving a reference to a deleted flag is misleading. Removed for consistency with the spec-named sibling.
- **Folded the AC5 exit-0 assertion (A014) into the new enforcement test** rather than adding a standalone test or re-tagging a prior-contract test. The spec said "extend rather than duplicate"; the new test already builds a valid config and runs doctor, so `expect(results.overall).toBe('pass')` covers the exit-0 path without touching prior-contract tests.

## Deviations from Contract

### A003: The recorded gap names the missing pipeline stage
**Instead:** Asserted `gaps.some((g) => g.includes('verify'))` rather than `gaps.toContain('verify')`.
**Reason:** The `gaps` array holds descriptive strings (`"verify: 0 of 1 expected session(s) present"`), not the bare value `"verify"`. Vitest `.toContain` on an array is exact-element membership, which would not match; a substring check on the elements is the honest interpretation of the contract's `contains` matcher against an array-of-strings target.
**Outcome:** Functionally equivalent and faithful to intent — the test confirms the missing stage (`verify`) is named in the recorded gap. Tagged `@ana A001, A002, A003`.

## Test Results

### Baseline (before changes)
Command: `(cd packages/cli && pnpm vitest run)`
```
Test Files  146 passed (146)
     Tests  3587 passed | 2 skipped (3589)
```

### After Changes
Command: `ana test --stage build --slug remove-processcapturestrict` (sealed capture)
```
✓ captured  counts: 3582 passed, 0 failed, 2 skipped  (verdict: pass)
```
<!-- ana:capture stage=build slug=remove-processcapturestrict counts=3582p/0f/2s verdict=pass sha256=a6df845c3e9163aba084fa8cfc4964c67708fc6adb425cac61b4c42f5c8120c9 -->

### Comparison
- Tests added: 5 (3 record-path in work.test.ts, 1 `--merge` keystone in work-merge.test.ts, 1 enforcement in doctor.test.ts)
- Tests removed: 10 (3 strict in work.test.ts, 1 in config.test.ts, 1 in init.test.ts, 1 in doctor.test.ts, 4 in anaJsonSchema.test.ts)
- Net: −5 (3587 → 3582). Expected and correct (spec AC7 predicted ~−4). Flag-existence plumbing removed alongside the flag; record-path behavioral coverage increased.
- Regressions: none. 0 failed.

### New Tests Written
- `work.test.ts` (`describe('process provenance recording')`): incomplete-provenance records gap + completes; zero-session incomplete; full-provenance complete.
- `work-merge.test.ts`: `--merge` lands AND records the proof entry with the gap (keystone regression against the strict inversion).
- `doctor.test.ts`: enforcement output omits `process_capture_strict`, keeps both survivors, exits 0.

## Verification Commands

```
# Build
(cd packages/cli && pnpm run build)

# Full suite (expect 3582 passed / 0 failed / 2 skipped)
(cd packages/cli && pnpm vitest run)

# Completion-path regression focus
(cd packages/cli && pnpm vitest run tests/commands/work.test.ts tests/commands/work-merge.test.ts tests/commands/work-proof-process.test.ts)

# AC6 — zero strict symbols in src
grep -rn "processCaptureStrict\|isProcessCaptureStrictEnabled\|process_capture_strict" packages/cli/src   # expect: no matches

# Survivors intact
grep -rn "isProcessCaptureEnabled\|computeCompleteness\|assembleProcessAttestation" packages/cli/src

# Lint (expect 0 errors; 1 pre-existing warning in git-operations.ts, unrelated)
(cd packages/cli && pnpm run lint)

# Coverage gate (NOTE: requires @vitest/coverage-v8, not currently installed — see Open Issues)
(cd packages/cli && pnpm vitest run --coverage)
```

## Git History
```
9c50caf2 [remove-processcapturestrict] Remove processCaptureStrict from config surfaces
8e6917b2 [remove-processcapturestrict] Remove strict completeness guard from work complete
```

## Open Issues

1. **Coverage gate could not be executed (`@vitest/coverage-v8` not installed).** The spec names the vitest.config.ts thresholds (lines 80 / branches 75 / functions 80 / statements 80) as the "real gate," but the coverage provider package is absent from `package.json` and not installed in either the worktree or the main tree — `pnpm vitest run --coverage` fails with `MISSING DEPENDENCY @vitest/coverage-v8`. Coverage has therefore never been runnable in this repo as configured. I did not install it (per the "don't install dependencies without approval" guardrail). The thresholds *should* hold — this deletion removes covered source (the guard, the strict reader) together with its tests, keeping the ratio neutral, and the surviving record path gains coverage (3 guard tests → 4 stronger behavioral ones) — but this is reasoned, not mechanically confirmed. **Suggested action: scope** (either install the provider so the documented gate is runnable, or stop citing an unrunnable gate in specs).

2. **`@ana` tag collisions across contracts in shared test files.** This contract's IDs A001–A014 overlap with historical tags A001–A016 left by prior merged contracts (the enforcement-state-in-doctor and merge contracts) living in the same files (`work.test.ts`, `work-merge.test.ts`, `doctor.test.ts`, `init.test.ts`). My new tests are tagged with this contract's IDs, but a naive `grep '@ana A001'` cannot distinguish them from prior-contract tags. This is a pre-existing, already-acknowledged traceability limitation (noted in the build's risk profile, e.g. "@ana A006 appears on both config.test.ts and doctor.test.ts"). No action taken — historical tags belong to immutable proof entries and must not be edited. **Suggested action: monitor.**

3. **Net test delta is −5, not the spec's predicted ~−4.** The spec estimated "~−4" (remove ~10, add ~6). Actual: removed 10, added 5 → −5. The difference is that I added one enforcement test in doctor.test.ts rather than two, by folding the A014 exit-0 assertion into the AC5 test (the existing healthy-project test at doctor.test.ts:257 already covers exit-0; per "extend rather than duplicate" a second standalone test would have been padding). Within the spec's stated tolerance ("net count may dip ~−4"). **Suggested action: acknowledge.**

Second pass — what I noticed but hadn't written down: the `formatTerminalOutput(results)` assertion `.not.toContain('strict')` in the new doctor test is safe only because the two remaining `strict` occurrences in doctor.ts are JSDoc (non-rendered), which I cleaned anyway; no rendered output contains the substring. Confirmed by grep. No further issues surfaced.
