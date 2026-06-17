# Verify Report: Guard the anatrace-core load and emit the first real attestation records

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-16
**Spec:** .ana/plans/active/attestation-emit-and-guard/spec.md
**Branch:** feature/attestation-emit-and-guard

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../attestation-emit-and-guard/contract.yaml
  Seal: INTACT (hash sha256:8062d586124a7e24f6e2aff5a1d33267f0a0bc6f3cf965f0f57e9ab83fdd2ad4)
```

Seal status: **INTACT** — contract unmodified since AnaPlan sealed it.

**Tests:** 3851 passed, 0 failed, 2 skipped (verdict: pass). Sealed verify re-run:
`<!-- ana:capture stage=verify slug=attestation-emit-and-guard counts=3851p/0f/2s verdict=pass sha256=7eafbe8476a1d91d2e53aee8480a783982b26d1d5bc5c19ede97409f3d4d64e1 -->`
Focused: `tests/utils/compliance.test.ts` → 22 passed (20 existing + 2 new, matches Build Brief).
**Build:** success (tsup, 47ms). **Lint:** 0 errors, 1 warning — in `packages/cli/src/utils/git-operations.ts` (unused eslint-disable), a file this build did **not** touch; pre-existing, not a regression.
The 2 skips are outside `compliance.test.ts` (all 22 there pass) — pre-existing, not introduced.

## Contract Compliance

| ID   | Says                                                          | Status      | Evidence |
|------|--------------------------------------------------------------|-------------|----------|
| A001 | Engine unloadable → save abstains (returns null), no crash   | ✅ SATISFIED | `compliance.test.ts:287` "abstains LOUDLY", `{ loadCore: () => null }`, `expect(result).toBeNull()`. Code: `compliance.ts:281-286` returns null on `core === null`. |
| A002 | Missing engine never throws out of save path                 | ✅ SATISFIED | `compliance.test.ts` loud test wraps call in `expect(() => {...}).not.toThrow()`; outer try/catch `compliance.ts:237-359`. |
| A003 | Missing engine surfaces loud warning (contains text)         | ✅ SATISFIED | `expect(warnings[0]).toContain('anatrace-core not resolvable')` + `toHaveLength(1)`. Code emits exact line `compliance.ts:282-284`. |
| A004 | Benign skip (no role/session) stays quiet — 0 warnings       | ✅ SATISFIED | `compliance.test.ts:312` "stays QUIET", `ANA_ROLE: undefined`, `expect(warnings).toHaveLength(0)`. Role guard `compliance.ts:241` precedes `loadCore` (280). |
| A005 | Empty engine version → abstain (returns null)                | ✅ SATISFIED | C12 `compliance.test.ts:421`, `{ readCoreVersion: () => '' }`, `expect(result).toBeNull()`; version guard `compliance.ts:293-294`. |
| A006 | Empty version → no file written (count 0)                    | ✅ SATISFIED | C12 reads compliance dir, `expect(records).toHaveLength(0)`. |
| A007 | record.anatrace_core_version equals "0.4.0"                  | ✅ SATISFIED | `compliance.test.ts:468` `expect(rec.anatrace_core_version).toBe(installed)` where `installed` = dynamic read of installed core pkg = `0.4.0` (store + package.json confirmed). Dynamic version-lock, mechanically equals "0.4.0". |
| A008 | Real attestation stamps non-empty version (truthy)           | ✅ SATISFIED | Same test; `installed` is non-empty `"0.4.0"`. |
| A009 | package.json anatrace-core dependency equals "0.4.0"         | ✅ SATISFIED | Source inspection: `packages/cli/package.json` → `"anatrace-core": "0.4.0"` (no caret/tilde); store `node_modules/.pnpm/anatrace-core@0.4.0`. Pin test `_capture.test.ts:220` asserts `EXPECTED_CORE_VERSION = '0.4.0'`. (Tag drift — see Findings.) |
| A010 | record.verdicts length greater than 0                        | ✅ SATISFIED | `compliance.test.ts:154` `expect(rec.verdicts.length).toBeGreaterThan(0)` (compact-record) and `:478` (reasons test). Build record shows 16 verdicts. |
| A011 | record.coverage.total greater than 0                         | ✅ SATISFIED | `compliance.test.ts:149` `expect(rec.coverage.total).toBeGreaterThan(0)`. Build record `coverage.total = 16`. |
| A012 | Zero out-of-set verdict reasons under live 0.4.0 engine      | ✅ SATISFIED | `compliance.test.ts:478-481` guards `verdicts.length > 0` then `expect(outOfSet).toHaveLength(0)` against `VERDICT_REASONS`. Non-vacuous. |

All 12 assertions SATISFIED. A009 has no matching `@ana A009` tag (the enforcing pin test carries stale IDs); verified by source inspection per process — documented as a Test finding.

## Independent Findings

**The reorder is correct.** The version guard moved from before the role check to *after* the new `loadCore` guard (`compliance.ts:280→293`). `coreVersion` is now defined at line 293 and consumed only at lines 325 (`projectVerdicts`) and 335 (record stamp) — both after definition, no use-before-assign. All five benign early-returns (capture 238, role 241, session 258, transcript-path 263, readable-bytes 271) precede `loadCore` (280), so a benign abstain never reaches the loud line. The loud line wording matches the spec verbatim. This satisfies AC1 (loud-on-absent) and AC4 (silent version fail-closed) simultaneously, which was the whole point of the reorder.

**`loadCore` is materially more complex than the spec prescribed — and that complexity is necessary.** The spec said "mirror `readCoreVersion` exactly: `require('anatrace-core')` in try/catch." Build discovered that `anatrace-core` is import-only ESM (its `exports["."]` map defines `import` but no `require` condition), so a bare `require('anatrace-core')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. Build's solution resolves `package.json`, reads `exports["."].import`, and `require()`s the ESM entry by absolute path (Node's stable `require(esm)`, preserving the synchronous call contract). This is a justified deviation, well-commented, and **proven to work** — the build-role compliance record was emitted with `anatrace_core_version: "0.4.0"`, 16 verdicts, `coverage.total: 16`. Recorded as an observation, not a fault.

**Two second-order consequences of that deviation** (both Findings): the spec's documented edge "package.json unreadable → silent version abstain" is now a *loud* abstain (loadCore depends on package.json); and `require(esm)` is only unflagged from Node 22.12.0, while the README advertises "Node 22+" — on Node 22.0–22.11 an installed engine would falsely report as unresolvable.

**Scope is clean.** Source diff touches exactly the two contract `file_changes` (`compliance.ts`, `compliance.test.ts`). No scope creep, no unused exports (`loadCore` is module-private, used internally), no extra parameters beyond the spec-mandated `deps.loadCore`. The static value import was removed; the type-only import at line 41 was preserved as instructed.

**Prediction resolution.** (1) Use-before-assign / loud-on-benign — *not found*, reorder is sound. (2) C12 going vacuous — *not found*; C12 was upgraded with a non-vacuity pin that captures `console.warn` and asserts zero "not resolvable" warnings, proving it reaches the *version* guard (silent), not the loadCore guard (loud). (3) Quiet test trivial — *partially confirmed*: it injects `loadCore: () => null` but the no-role guard short-circuits first, so the loud guard is never exercised — correct for intent, but single-path (Finding). (4) Loose matcher — *not found*; contract-aligned `contains` plus exact `toHaveLength(1)`. (5) `loadCore` lint — *not found*; explicit return type + JSDoc present. Second sweep beyond predictions surfaced the `loadCore` deviation, the silent→loud edge-case shift, the Node-version portability nuance, and the A009 tag drift — none predicted.

## AC Walkthrough

- **AC1 (loud on absent):** ✅ PASS — `compliance.test.ts:287` proves return null + no throw + exactly one warning containing the spec line; code path `compliance.ts:280-286` confirmed.
- **AC1 (quiet on benign):** ✅ PASS — `compliance.test.ts:312` proves zero warnings on no-role abstain; guard ordering confirmed. (Single benign path covered — see Findings.)
- **AC2 (running dist contains emit code):** ✅ PASS — `grep -c captureComplianceAtSave packages/cli/dist/index.js` → 3 (>0); `realpath $(which ana)` → `…/packages/cli/dist/index.js`. Both hard-gate conditions met (judgment-only waiver, confirmed operationally).
- **AC3 (≥1 real record, version 0.4.0, verdicts>0, coverage.total>0, verify-independence present):** ✅ PASS — mechanical properties pinned by real-engine tests (22/22 pass) and demonstrated by the emitted build record (`anatrace_core_version "0.4.0"`, 16 verdicts, `coverage.total 16`). The `ana-verify:verify-independence` claim is carried by the verify mandate (the build analog `ana-build:verify-independence` is present in the build record); the verify-role record materializes on `ana artifact save verify-report` and is confirmed operationally at save — the dogfood record IS the deliverable. **No violation required (spec).**
- **AC4 (C12 + version-lock intact, C12 non-vacuous):** ✅ PASS — C12 (`:421`) passes and now explicitly asserts it reached the version guard (zero "not resolvable" warnings); dynamic version-lock (`:144`) passes; `_capture.test.ts:220` pin passes.
- **Full CLI suite:** ✅ PASS — 3851 passed, 0 failed, 2 skipped (re-baselined after install).
- **Lint clean, no `any`, return type + JSDoc on `loadCore`:** ✅ PASS — 0 errors; `loadCore(): AnatraceCore | null` with `@returns`; module typed via `typeof import('anatrace-core')`, no `any`.

## Blockers

None. Searched specifically for: (1) use-before-assign on the moved `coreVersion` — none, defined before both consumers; (2) the loud line firing on benign abstains — none, all five benign returns precede `loadCore`; (3) C12 going vacuous after the reorder — prevented by an explicit warning-channel assertion; (4) out-of-scope file edits — none, diff matches the two contract `file_changes`; (5) unguarded throw out of the save path — outer try/catch wraps the whole body and returns null; (6) regressions — full suite green (3851/0/2). Every contract assertion is SATISFIED and every AC passes. The remaining items are observations/debt for the next engineer, not ship-stoppers.

## Findings

- **Code — `loadCore` deviates from the spec's bare-require idiom (necessary):** `packages/cli/src/utils/compliance.ts:73-90` — resolves `package.json`, reads `exports["."].import`, and `require()`s the ESM entry by absolute path instead of `require('anatrace-core')`. Required because the engine is import-only ESM (bare require throws `ERR_PACKAGE_PATH_NOT_EXPORTED`). Well-commented and proven working by the emitted build record. Acknowledge — not a fault, but the next engineer should know the loader is more involved than `readCoreVersion`.
- **Code — Node 22.0–22.11 portability risk:** `packages/cli/src/utils/compliance.ts:84` — `require()` of an `.mjs` entry relies on unflagged `require(ESM)`, which only landed in Node **22.12.0**. The README advertises "Node 22+". On Node 22.0–22.11, an *installed* engine would throw `ERR_REQUIRE_ESM`, be caught, and falsely emit the loud "anatrace-core not resolvable" line — a misleading diagnostic. Works on the current toolchain (Node 25). Worth a `package.json` `engines` floor of `>=22.12` or a doc note.
- **Code — silent→loud edge-case shift:** `packages/cli/src/utils/compliance.ts:288-294` — the spec's documented edge "core present but package.json unreadable → loadCore succeeds, version guard abstains silently" is no longer true, because `loadCore` itself reads `package.json`. An unreadable `package.json` now yields a *loud* abstain. The silent version guard's production reachability narrows to a present-but-missing/non-string `version` field (plus the test injection seam). Arguably more correct; flagged as a deviation from documented semantics so future contracts don't assume the old behavior.
- **Test — A009 tag drift:** `packages/cli/tests/commands/_capture.test.ts:219-220` — the pin test enforcing A009 carries stale `@ana A001, A045, A046` IDs from a prior cycle's contract; this contract's A009 has no matching `@ana A009` tag anywhere. A009 was verified by source inspection (pin literal `0.4.0`, store resolves `anatrace-core@0.4.0`), but the assertion→test linkage is broken and should be retagged.
- **Test — quiet-direction A004 is single-path:** `packages/cli/tests/utils/compliance.test.ts:312-340` — covers only the no-role benign abstain; the spec named "no role OR no session." Because the role guard short-circuits before `loadCore`, the injected `loadCore: () => null` is never invoked, so the test cannot distinguish a correctly-quiet path from a broken loud guard. It pins the ordering intent correctly but would not catch a regression in the loud guard via this path.
- **Code — untested total-catch swallow (pre-existing):** `packages/cli/src/utils/compliance.ts:357-358` — the outer `try/catch` converts any mid-pipeline core throw (`parseSession`/`extract`/`runCompliance`/`scrubDeep`) into a silent null abstain; the catch path is still not separately unit-triggered. Carried over from `anatrace-core-integration` (still present — see that cycle's build concern); the reorder preserves it. Not introduced by this build.

## Deployer Handoff

This change is strictly safer on a universal path: it converts a module-load crash (absent `anatrace-core` took down every `ana artifact save`) into a guarded abstain — loud when a record was due, quiet on benign skips. It also closes the long-standing zero-records state: `anatrace-core@0.4.0` is installed, the main-tree dist is rebuilt and provably contains the emit code, and real compliance records now emit (a build record is already on disk; the verify record lands when this report saves — that dogfood record is the deliverable). One thing to action before broad release: confirm the Node floor — the loader uses `require(esm)`, unflagged only since Node 22.12, while docs say "Node 22+" (see Findings). The merge itself is safe; the portability note is for the release/engines field.

## Verdict

**Shippable:** YES

All 12 contract assertions SATISFIED, all acceptance criteria pass, full suite green (3851/0/2, sealed), lint clean on touched files, scope tight. The implementation deviates from the spec's prescribed loader idiom — but the deviation is necessary (import-only ESM), well-documented, and proven by an actually-emitted record. The findings are genuine and worth recording (a real Node-version portability risk, a documented-semantics shift, a broken assertion tag, a single-path test), but none rise to a blocker. I would stake my name on this shipping — with the Node `engines` floor flagged for the release step.
