# Verify Report: Cross-machine provenance — Phase 2 (completeness + enforcement + display)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-08
**Spec:** .ana/plans/active/cross-machine-provenance/spec-2.md
**Branch:** feature/cross-machine-provenance

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .../cross-machine-provenance/contract.yaml
  Seal: INTACT (hash sha256:300546c9ebe06e0342606d1641dbc6e6f915113038dcfbf878d0bb7cad0db4af)
```
Seal status: **INTACT** — the contract is unchanged since the planner sealed it.

**Sealed verify test run** (`ana test --stage verify`):
```
<!-- ana:capture stage=verify slug=cross-machine-provenance counts=3566p/0f/2s verdict=pass sha256=278f86a1e54f2c84243e9364180b6f34aa4a6b50118c769e18bd38b796818848 -->
```
Tests: **3566 passed, 0 failed, 2 skipped.** Build: **success**. Lint: **0 errors** (2 pre-existing warnings — `website` unused var, `git-operations.ts` unused eslint-disable; neither in a Phase-2 file).

Test count vs Phase-1 baseline (spec: ">3528"): **3566 — no decrease.** The 2 skips are pre-existing (no `.skip(` exists in any Phase-2 test file).

## Contract Compliance
Phase 2 owns assertions A021–A037 and A045–A046. (A001–A020 are Phase 1, A038–A044 Phase 3 — out of scope here.) Tags were cross-checked against the Phase-2-touched test files only, because the `@ana A0xx` namespace collides across unrelated contracts repo-wide.

| ID   | Says | Status | Evidence |
|------|------|--------|----------|
| A021 | Expected build count tied to saved build reports | ✅ SATISFIED | `tests/commands/work-proof-process.test.ts:314` asserts `expected.build` `toBe(2)` for 2 seeded reports; pure-helper `:402` same. Impl `work-proof.ts:53` `countReports('build_report*.md')`. |
| A022 | All roles present → complete | ✅ SATISFIED | `work-proof-process.test.ts:298` asserts `completeness.complete === true` + exact expected/present/gaps; pure-helper `:413`. |
| A023 | Missing role → incomplete | ✅ SATISFIED | `work-proof-process.test.ts:327` asserts `complete === false` with verify session absent; `:437` pure helper. |
| A024 | Incompleteness names the missing role | ✅ SATISFIED | `:341` asserts gap `=== 'verify: 0 of 1 expected session(s) present'`; `:438` exact gap array. |
| A025 | Rework never false-fails | ✅ SATISFIED | `:344` seeds `build_report_2_r1.md` + matching sessions, asserts `complete === true`, `expected.build===2`. |
| A026 | ana/learn never required | ✅ SATISFIED | `:363` adds a learn session, asserts `complete === true` and expected unchanged; `:444` ana/learn-only → 3 gaps. |
| A027 | Strict + gap blocks completion (exit 1) | ✅ SATISFIED | `tests/commands/work.test.ts:1442` mocks `process.exit`, asserts `completeWork` rejects with `process.exit`. Impl `work.ts:1138` `process.exit(1)`. |
| A028 | Blocked strict run writes no entry | ✅ SATISFIED | `work.test.ts:1466` asserts `readChainEntry` is null after block. Guard runs before `writeProofChain`. |
| A029 | Strict off + gap warns but completes (exit 0) | ✅ SATISFIED | `work.test.ts:1469` flips strict off, asserts `completeWork` resolves (no throw). |
| A030 | Warned completion records the gap | ✅ SATISFIED | `work.test.ts:1509` asserts written `entry.process.completeness.complete === false`. Warn path `work-proof.ts:325`. |
| A031 | ana.json accepts processCaptureStrict on/off | ✅ SATISFIED | `tests/commands/init/anaJsonSchema.test.ts:238` parses `'on'`/`'off'`/invalid→undefined. Schema `anaJsonSchema.ts:120`. |
| A032 | New projects default to off | ✅ SATISFIED | `tests/commands/init.test.ts:124` asserts `createAnaJson` emits `processCaptureStrict: 'off'` (config + written file). `state.ts:581`. |
| A033 | Explicit setting survives re-init | ✅ SATISFIED | `init.test.ts:792` seeds `'on'`, runs `preserveUserState`, asserts result still `'on'` (`:822`). Not in mechanical-override list. |
| A034 | Cost computed at display time | ✅ SATISFIED | `tests/commands/proof.test.ts:4968` asserts output contains `est. $`. Impl `proof.ts:455` `computeCost(d.tokens, d.model)`. Live-rendered without crash. |
| A035 | Process block never changes PASS/FAIL | ✅ SATISFIED | `proof.test.ts:5001` incomplete block + `result: 'PASS'` → output shows `PASS` AND `⚠ incomplete`. Block guarded by `if (entry.process)`. |
| A036 | Cross-machine files assemble complete | ✅ SATISFIED | `work-proof-process.test.ts:469` seeds distinct harness/cli/hash per session, no home state → `complete === true`, 3 sessions. |
| A037 | Per-session provenance survives squash | ✅ SATISFIED | `work-proof-process.test.ts:497` real `git merge --squash`, asserts 3 distinct files survive (`:528`). |
| A045 | Strict block leaves active dir intact | ✅ SATISFIED | `work.test.ts:1463` asserts `active/` exists and `completed/` does not after block. Guard placed before `removeWorktree`/`cp` (`work.ts:1117`). |
| A046 | Strict-off re-run after block records gap | ✅ SATISFIED | `work.test.ts:1469` re-runs, asserts NOT crash-recovery (`:1500`), `completed/` exists, entry `completeness.complete === false`. |

All 19 Phase-2 assertions **SATISFIED**.

## Independent Findings

**Predictions resolved (Step 3 → Step 5):**
1. *Inline reader in the strict guard could diverge from `assembleProcessAttestation`'s reader.* — Investigated (work.ts:1124 vs work-proof.ts:131). Functionally identical (readdir → filter `.json` → parse → skip-on-error → push object); the guard copy omits the post-read sort, which is irrelevant to role counting. They agree on the verdict. Not a bug, but the duplication is recorded as debt (Findings).
2. *Glob imprecision (`build_report*.md` matching extra files).* — Checked: patterns match only the intended `.md` report files (`build_report.md`, `build_report_2_r1.md`, etc.). No data/yaml leakage. Not found.
3. *Sentinel/tautological tests.* — Not found. Tests assert exact gap strings (`toBe('verify: 0 of 1 …')`), exact counts (`toBe(2)`), and exact `expected`/`present` objects.
4. *Fake squash test.* — Not found. The fixture runs a real `git init -b main` + `git merge --squash` and reads survivors off disk.
5. *Phase-1 `computeCost` stopgap left in.* — Not found. `proof.ts:455/470` use the finalized `computeCost(...)`.

**Production-risk predictions:** *What breaks in production this spec didn't address?* — The `--merge` strict boundary: under `--merge` the PR merge happens before the (post-merge, pre-archival) guard, so strict cannot stop the merge. The spec accepts this and the error message states it, but no integration test drives the actual `--merge` path through the guard (Findings). No production blocker.

**Surprises:** `computeCompleteness` was implemented with a 2-arg signature `(reportsDir, sessions)`, not the spec's 3-arg `(provenanceDir, reportsDir, sessions)`. This is a *correct* simplification — `present` counts come from the passed `sessions`, never from re-reading `provenanceDir`, so the param was dead in the spec's own design. The "don't hardcode `completed/`" gotcha is still honored (dir is a parameter). Recorded as an observation, not a defect.

**Quality:** Code adheres to project standards — `.js` import extensions, `import type` separation, named exports, explicit return types with `@param`/`@returns` JSDoc on `computeCompleteness` and `isProcessCaptureStrictEnabled`, total/never-throw gate read mirroring `isProcessCaptureEnabled`, `chalk.red`+`exit(1)` for strict / `chalk.yellow`+continue for warn. The strict guard's placement (before `removeWorktree`/`cp`) directly implements the verified-recovery fix and is proven by the A046 recovery test.

**No over-building / YAGNI:** Both new exports (`computeCompleteness`, `isProcessCaptureStrictEnabled`) are imported and used (work.ts imports both; assembler uses `computeCompleteness`). No unused parameters in the new code (the dropped `provenanceDir` is an absence, not a dead param). No dead branches added.

## AC Walkthrough

- **AC1 — `ProcessAttestation.completeness` exists (complete/expected/present/gaps), populated whenever capture on incl. zero-session:** ✅ PASS — type `proof.ts:95-106`; zero-session case `work-proof-process.test.ts:381` (all-gaps, non-null).
- **AC2 — expected.build/verify = saved report count; plan=1; ana/learn never expected:** ✅ PASS — `work-proof-process.test.ts:314` (`build` 2), `:444` (ana/learn → no expected).
- **AC3 — multi-phase + rejection-cycle pipeline reports complete (no false-fail):** ✅ PASS — `:344` rework reports + matching sessions → `complete: true`.
- **AC4 — missing role → complete:false with gap string:** ✅ PASS — `:327`, `:437`.
- **AC5 — strict on + gap: red error, exit 1, no entry, active/+worktree intact:** ✅ PASS — `work.test.ts:1442`, asserts exit, null entry, `active/` present, `completed/` absent.
- **AC6 — strict-off re-run completes via ordinary path (not crash-recovery), entry records complete:false:** ✅ PASS — `work.test.ts:1469`, asserts no "Recovering…"/"already completed" log, `completed/` exists, entry gap recorded.
- **AC7 — computeCompleteness pure & shared (active/ guard and completed/ assembler agree):** ✅ PASS — single exported helper `work-proof.ts:52` taking `reportsDir` arg; called by assembler (`:180`) and guard (`work.ts:1137`). ⚠ Note: the *session reading* (not the verdict) is duplicated, not shared — see Findings.
- **AC8 — processCaptureStrict valid enum; createAnaJson emits 'off'; explicit value survives re-init:** ✅ PASS — A031/A032/A033 tests.
- **AC9 — proof shows display-time cost + completeness line; never affects PASS/FAIL:** ✅ PASS — A034/A035; live `ana proof` smoke test rendered without crash on a pre-Phase-2 entry (optional-guard works).
- **AC10 — cross-machine fixture assembles complete process block:** ✅ PASS — `work-proof-process.test.ts:469`.
- **AC11 — squash/rebase fixture preserves all per-session files (union, no loss):** ✅ PASS — `:497` real squash merge, 3 files survive.
- **AC12 — build succeeds; vitest passes; count not below Phase-1 total:** ✅ PASS — 3566 passed / 0 failed; build green; ≥ baseline.

## Blockers
None. What I searched: every Phase-2 contract assertion (all 19 SATISFIED with file:line evidence); both new exports for orphan status (both imported/used); new function signatures for unused params (none); the strict guard's ordering relative to `removeWorktree`/`cp` (correct — before archival, proven by the A046 recovery test); error-path coverage (gap/block/warn/recovery all have dedicated tests); external-state assumptions (gate read is total/never-throw, verified against `isProcessCaptureEnabled`); regressions (full suite green, count up from baseline). Nothing rises to blocker level.

## Findings
- **Code — `computeCompleteness` signature deviates from the sealed Build Brief:** `packages/cli/src/commands/work-proof.ts:52` is `(reportsDir, sessions)`; the spec specified `(provenanceDir, reportsDir, sessions)`. The deviation is *correct* — `present` derives from the passed `sessions`, so `provenanceDir` was never read in the spec's own design. No contract impact. Observation; acknowledge.
- **Code/Test — duplicated provenance-file reader (drift risk):** the strict guard `packages/cli/src/commands/work.ts:1124-1136` inlines the same `readdirSync` + `JSON.parse` + skip-on-error loop as `assembleProcessAttestation` (`packages/cli/src/commands/work-proof.ts:131-143`), rather than sharing one reader. They agree today (the guard copy merely omits the verdict-irrelevant sort), but a future change to one — role filtering, schema validation — would silently desync the two read paths. The spec explicitly permitted the inline reader; recording as debt with a suggested `readSessionsFromDir(dir)` extraction. Debt; scope.
- **Test — `--merge` strict boundary unverified:** the strict integration tests (`packages/cli/tests/commands/work.test.ts:1442`,`:1469`) pre-merge via `createMergedProject` then call `completeWork()` *without* `--merge`. The documented boundary — under `--merge` the PR merge precedes the guard, so strict blocks the proof record but not the merge — is asserted nowhere. Accepted boundary per spec, but the honesty-of-message claim is untested. Observation; monitor.
- **Code — completeness is a presence floor, not an exact match:** `packages/cli/src/commands/work-proof.ts:75` flags a gap only when `present < expected`. An orphan/extra session (`present > expected`, e.g. a build session with no saved report) reads as complete. This is the intended rework-tolerant design, but the next engineer should know the check detects under-counting only — a duplicated or stray provenance file is never surfaced. Observation; monitor.
- **Upstream — Build Brief overstated Phase-2 proof.ts scope:** the spec listed cost-via-`computeCost` finalization as a Phase-2 proof.ts change, but Phase 1 already made the display `computeCost`-based; Phase 2's only proof.ts change was the completeness line. No defect — the cost code is correct (`proof.ts:455`). Observation; acknowledge.

## Deployer Handoff
- Phase 2 of 3 is verified and green. **Do not create a PR yet** — Phase 3 (init hooks) is not started; `ana work status` will signal when all phases are done.
- New opt-in config: `processCaptureStrict: 'on' | 'off'` in `ana.json` (default `off` = warn-and-record). With it `'on'`, an incomplete proof **blocks `ana work complete` (exit 1)** before any archival — the work item stays intact and is re-runnable. Under `--merge`, the merge has already happened by the time strict fires; strict blocks only the proof record. Remediation: re-run the missing role, or flip strict off and re-run.
- Completeness is recorded into every proof entry (`process.completeness`) and shown in `ana proof {slug}`; it never affects PASS/FAIL.
- Pre-Phase-2 proof entries lack `completeness` — the display optional-guards it (verified live, no crash).

## Verdict
**Shippable:** YES
All 19 Phase-2 contract assertions are SATISFIED with real, contract-aligned tests; build, full test suite (3566 passed / 0 failed), and lint are green with the count above the Phase-1 baseline. The verified-recovery fix (strict guard before archival) is correctly placed and proven by a genuine block-then-recover integration test. Findings are maintainability/observation only — none blocks shipping. I would stake my name on this Phase shipping.
