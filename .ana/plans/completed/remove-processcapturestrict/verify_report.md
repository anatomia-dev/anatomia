# Verify Report: Remove `processCaptureStrict` — provenance records-and-annotates, never blocks

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-08
**Spec:** .ana/plans/active/remove-processcapturestrict/spec.md
**Branch:** feature/remove-processcapturestrict

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../remove-processcapturestrict/contract.yaml
  Seal: INTACT (hash sha256:a1b40f590177e8471c8fce9474bf147ed0ffcea9c49fe9ce365e961f99e77b88)
```

Seal: **INTACT** — contract unmodified since AnaPlan sealed it.

**Build:** `pnpm run build` → success (39ms, `dist/index.js` emitted).
**Tests (sealed verify run):** 3582 passed, 0 failed, 2 skipped.
`<!-- ana:capture stage=verify slug=remove-processcapturestrict counts=3582p/0f/2s verdict=pass sha256=79370e5c2e4a5042d3cbb0372c10e4eb96e3db7a7a55b61b5b3c9f6a447de903 -->`
Baseline was 3587p/2s → net −5 passing. AC7 (reframed) explicitly predicts a net dip of ~−4 from removing flag-plumbing tests alongside the flag; −5 is within that band and is correct, not a regression.
**Lint:** `pnpm run lint` → 0 errors, 1 warning. The warning (`git-operations.ts:198`, unused eslint-disable directive) is in a file **not touched by this branch** (`git diff main...HEAD` shows 0 hits) → pre-existing, not introduced here.

## Contract Compliance

| ID   | Says                                                              | Status       | Evidence |
|------|-------------------------------------------------------------------|--------------|----------|
| A001 | Incomplete provenance still records a proof entry instead of blocking | ✅ SATISFIED | `work.test.ts` `@ana A001` — `completeWork` resolves (no exit throw), `readChainEntry` non-null, `completed/` dir exists |
| A002 | Incomplete gap recorded as not-complete, never hidden             | ✅ SATISFIED | `work.test.ts` — `entry.process.completeness.complete` `.toBe(false)` |
| A003 | Recorded gap names the missing pipeline stage                     | ✅ SATISFIED | `work.test.ts` — `gaps.some(g => g.includes('verify'))` `.toBe(true)` (matcher `contains "verify"`) |
| A004 | Zero recorded sessions still writes a proof entry                 | ✅ SATISFIED | `work.test.ts` `@ana A004` — no provenance seeded, `completeWork` resolves, `entry` non-null |
| A005 | Zero sessions marked incomplete, not complete                    | ✅ SATISFIED | `work.test.ts` — `completeness.complete` `.toBe(false)` |
| A006 | Full provenance still writes the proof entry                     | ✅ SATISFIED | `work.test.ts` `@ana A006` — all three roles seeded, `entry` non-null |
| A007 | Full provenance marks provenance complete                        | ✅ SATISFIED | `work.test.ts` — `completeness.complete` `.toBe(true)` |
| A008 | Merge with incomplete provenance still records the proof entry    | ✅ SATISFIED | `work-merge.test.ts` `@ana A008` — gh `pr merge` call recorded (`mergeCall` defined) **AND** `readChainEntry` non-null. The keystone: merge lands + audit trail kept |
| A009 | After merge with incomplete provenance, proof annotates the gap   | ✅ SATISFIED | `work-merge.test.ts` — `entry.process.completeness.complete` `.toBe(false)` |
| A010 | New project's config contains no strict flag                      | ✅ SATISFIED | `init.test.ts` `@ana A010` — `config['processCaptureStrict']` and `written.processCaptureStrict` both `.toBeUndefined()`. Source: `state.ts` emit deleted; live grep of `src` → 0 hits |
| A011 | Doctor's enforcement report omits the strict flag                 | ✅ SATISFIED | `doctor.test.ts` `@ana A011` — `JSON.stringify(enforcement)` `.not.toContain('process_capture_strict')` + `formatTerminalOutput` `.not.toContain('strict')`. Confirmed live: built `doctor` shows 2 enforcement lines, no `strict` |
| A012 | Doctor still reports the test-evidence gate                       | ✅ SATISFIED | `doctor.test.ts` `@ana A012` — `enforcement.test_evidence_gate` `.toBeDefined()` / `.toBe('off')` |
| A013 | Doctor still reports the process-capture state                    | ✅ SATISFIED | `doctor.test.ts` `@ana A013` — `enforcement.process_capture` `.toBeDefined()` |
| A014 | Doctor still exits successfully on a valid config                 | ✅ SATISFIED | `doctor.test.ts` `@ana A014` — `results.overall` `.toBe('pass')` (proxy implying exit 0). Confirmed live: `node dist/index.js doctor; echo $?` → **0** |

All 14 assertions SATISFIED. See Findings for the A014 proxy note.

## Independent Findings

**Predictions (Step 3) and resolution (Step 5):**
1. *Predicted:* the three orphaned imports in `work.ts` (the gotcha) would be the likely miss → lint failure. **Not found** — all three removed precisely: line 34 (`isProcessCaptureStrictEnabled`), line 33 (`type SessionProvenance`), and `computeCompleteness` trimmed from the combined import on line 32 while keeping `writeProofChain`/`guardFailResult`. Lint passes with 0 errors.
2. *Predicted:* a sloppy delete would catch the `processCapture` recorder (differs only by `Strict` suffix). **Not found** — `isProcessCaptureEnabled` survives byte-for-byte in `forensics.ts`; `work-proof.ts` (the recorder) is entirely absent from the diff; `assembleProcessAttestation` + `computeCompleteness` still present (grep count 2).
3. *Predicted:* doctor's four removal sites — one might be missed (interface, error-fallback, assessor read, terminal render). **Not found** — all four removed; live render confirms two-line Enforcement view.
4. *Predicted:* replacement tests would be weak absence-checks (padding). **Not found** — the replacements are positive behavioral assertions on real proof-chain entries; the spec explicitly forbade padding and the builder complied.
5. *Predicted:* §8b/§8c adjacency could be disturbed by the block deletion. **Not found** — `// 8c. Capture worktree metadata` now follows the prior artifact-saved guard directly; intact.

**Surprised (unpredicted):** the spec's designated "real gate" — the vitest coverage thresholds — cannot be exercised in this environment because `@vitest/coverage-v8` is not a declared dependency (see Findings + AC7). This is the one criterion I could not mechanically run.

**Over-building / YAGNI:** none. This is a pure deletion; the only additions are two local test helpers in `work-merge.test.ts` (`seedProvenance`, `readChainEntry`) used by the keystone test. No new source exports, no new branches, no dead code introduced.

**Production risk:** the change strictly *removes* a `process.exit(1)` path and the flag that armed it; the surviving record path is unchanged and now the sole path. The risk profile goes down — there is no longer any metadata-driven block on a terminal pipeline action. The keystone merge test locks in the cure for the `--merge` inversion (code lands, proof still written).

## AC Walkthrough

- **AC1** — `work complete` never blocks on incomplete provenance. ✅ PASS — guard block (`work.ts:1081–1119`) deleted; A001/A004 tests assert `completeWork` resolves on gaps; live grep finds no `process.exit` in any provenance path.
- **AC2** — incomplete provenance records the gap and completes. ✅ PASS — A001/A002/A003: entry written, `complete: false`, gap names `verify`.
- **AC3** — record path unchanged with full provenance. ✅ PASS — A006/A007: `complete: true`; recorder file untouched (not in diff).
- **AC4** — flag gone from schema, `createAnaJson`, `KNOWN_FIELDS`. ✅ PASS — diffs confirm deletions in `anaJsonSchema.ts`, `state.ts`, `config.ts`; A010 asserts new config emits no key; `grep src` → 0.
- **AC5** — doctor Enforcement view reports two flags, no strict line, exits 0. ✅ PASS — A011–A014; live built doctor shows two lines + exit 0.
- **AC6** — `isProcessCaptureStrictEnabled` / `processCaptureStrict` gone from `src` (grep → 0); recorder unchanged. ✅ PASS — `grep -rn "processCaptureStrict\|isProcessCaptureStrictEnabled\|process_capture_strict" packages/cli/src` → zero; recorder fns present and untouched.
- **AC7 (reframed)** — behavioral coverage of record path ≥ prior; flag-plumbing tests removed with the flag; coverage thresholds still pass. ⚠️ PARTIAL — behavioral coverage verifiably *increased* (3 guard tests → 4 stronger behavioral tests incl. the `--merge` keystone); plumbing tests removed alongside the flag; **but the literal threshold run (80/75/80/80) could not be executed** because `@vitest/coverage-v8` is not installed/declared in this environment (offline install unavailable). Reasoned assessment: a symmetric code+test deletion that removes an entire branch and *raises* behavioral coverage of the surviving path will not lower the ratio — thresholds almost certainly hold — but I did not mechanically confirm. See Findings.
- **Suite passes (no new failures vs baseline)** — ✅ PASS — 3582p/0f/2s, 0 failures.
- **Lint clean (no `no-unused-vars` on trimmed imports)** — ✅ PASS — 0 errors; the one warning is pre-existing in an untouched file.
- **Build succeeds** — ✅ PASS.

## Blockers

None. What I searched and why nothing qualifies:
- **Unused imports** — the deletion's known failure mode; all three orphaned imports removed, lint reports 0 errors.
- **Recorder collateral damage** — `work-proof.ts` absent from diff; `assembleProcessAttestation`/`computeCompleteness`/`isProcessCaptureEnabled` all present and unchanged; the `processCapture` sibling never caught by the `Strict`-suffix delete.
- **Weak/absence-padding tests** — every replacement is a positive behavioral assertion on real proof-chain state; no tautologies, no "assert the deleted field is absent" filler.
- **Residual flag references** — `grep src` → 0; doctor's four sites all removed; live render confirms.
- **Error/exit paths** — the only behavioral change is the *removal* of an exit path; no new error branch introduced.

The one criterion not mechanically verified (coverage threshold execution) is an environmental tooling gap, not a code defect, and is reasoned-through above — it does not rise to a blocker.

## Findings

- **Upstream — `cross-machine-provenance-C7` resolved:** `packages/cli/src/commands/work.ts` — the deleted strict guard inlined its own `readdirSync` + `JSON.parse` provenance-file loop, duplicating the reader in `assembleProcessAttestation` (the C7 finding: "the two could drift, and the guard copy omits the sort"). Deleting the entire guard block eliminates that duplicate reader. The `verify_data.yaml` records this with `resolves: ["cross-machine-provenance-C7"]`.
- **Test — A014 verified via a proxy, not the literal exit code:** `packages/cli/tests/commands/doctor.test.ts:668` — the contract target is `doctorExitCode equals 0`, but the tagged test asserts `results.overall === 'pass'`. It's a *stronger* proxy (`pass` ⟹ exit 0) and I confirmed exit 0 live, so the assertion is satisfied. Caveat for the next engineer: if doctor's `overall → exit code` mapping ever changes (e.g. `warn` begins exiting non-zero), this test would not catch an exit-code regression because it never reads the exit code directly.
- **Test — coverage gate is not runnable in this environment:** `packages/cli/vitest.config.ts:26` defines hard thresholds (80/75/80/80) that the spec designates the "real gate," yet `@vitest/coverage-v8` is not a declared dependency in `package.json`. Wherever the provider is absent (including this verify environment), `vitest run --coverage` fails with `MISSING DEPENDENCY` rather than enforcing — the designated enforcement gate silently no-ops. Worth scoping: either declare the provider as a devDependency or stop calling it the enforcing gate.
- **Test — keystone test re-declares helpers:** `packages/cli/tests/commands/work-merge.test.ts:624` — adds its own `seedProvenance` and `readChainEntry`, duplicating `seedActiveProvenance`/`readChainEntry` in `work.test.ts`. The duplication is justified (the `--merge` test must live in `work-merge.test.ts` for its module-level `vi.mock('node:child_process')` isolation, per the Build Brief), but it is duplication a future shared test-util could absorb.

## Deployer Handoff

- This is a pure deletion of the unreleased `processCaptureStrict` flag and its `process.exit(1)` guard. After merge the model is two-state: `processCapture: on` = best-effort capture + always-annotated completeness; `off` = no provenance recorded. No third flag, no blocking path.
- **No migration needed.** The flag shipped only on unreleased `main` (absent from `v1.2.2`); `.passthrough()` tolerates any stray key in existing configs. A project that explicitly set `processCaptureStrict` will simply have an inert key — no error.
- The `--merge` inversion (PR merges, then strict refuses the proof → code lands with no audit trail) is the disease this cures; the keystone test in `work-merge.test.ts` guards against its return.
- **One thing I could not run:** the coverage threshold gate (provider not installed here). If your CI runs coverage, confirm it stays green there; analytically it should (symmetric code+test removal, behavioral coverage up). See Findings.

## Verdict

**Shippable:** YES

All 14 contract assertions SATISFIED with strong, positive behavioral tests. All acceptance criteria pass except AC7's literal coverage-threshold run, which is ⚠️ PARTIAL solely due to an environmental tooling gap (`@vitest/coverage-v8` not installed) — every other facet of AC7 (behavioral coverage increased, plumbing tests removed with the flag) is verified, and the deletion's symmetry makes a threshold regression implausible. Build succeeds, 3582 tests pass with zero failures, lint is error-free (sole warning pre-existing and untouched), the recorder is byte-for-byte intact, and live `doctor` confirms the two-line Enforcement view and exit 0. The change deletes a `process.exit` path and lowers risk. I would stake my name on this shipping.
