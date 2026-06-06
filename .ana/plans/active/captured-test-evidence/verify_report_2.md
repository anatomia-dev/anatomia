# Verify Report: Captured Test Evidence — Phase 2 (Self-arming flip to fail-closed)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-05
**Spec:** .ana/plans/active/captured-test-evidence/spec-2.md
**Branch:** feature/captured-test-evidence

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .../captured-test-evidence/contract.yaml
  Seal: INTACT (hash sha256:23c7ef1e5e87348ef51f0f411279f5ed5aa2557446f396c357c16d14ebaed4e3)
```
Seal status: **INTACT** — the contract is unchanged since AnaPlan sealed it.

- **Build:** `pnpm run build` — success (2 tasks, 1 cached).
- **Tests:** `pnpm vitest run` (full `packages/cli` suite) — **3389 passed, 2 skipped, 0 failed** across 138 files. Focused Phase 2 files (`capture-state`, `capture-marker`, `artifact.test.ts`) — 224 passed.
- **Lint:** `pnpm run lint` — 0 errors, 1 warning. The warning is an unused eslint-disable in `packages/cli/src/utils/git-operations.ts`, which is **not** touched by this branch (`git diff main...HEAD` empty for that file) — pre-existing, not a regression.
- **Typecheck:** `tsc --noEmit` — clean (exit 0).

## Contract Compliance

Phase 2 owns assertions **A030–A036**. (A001–A029 are Phase 1, verified in verify_report_1.md — out of scope here.)

| ID   | Says                                                                 | Status       | Evidence |
|------|----------------------------------------------------------------------|--------------|----------|
| A030 | Once armed, a later build report with no valid evidence is blocked    | ✅ SATISFIED | `capture-marker.test.ts:262` (no marker, armed→`blocked=true`, errors>0, warnings empty) and `:286` (tampered block→`blocked=true`); `artifact.test.ts:423` (armed project, plain report → `saveArtifact` throws via `process.exit(1)`). Code: `capture-marker.ts:467` flips `blocked` only when `armed && messages.length>0`. |
| A031 | First valid-evidence build report is never blocked; it seals then arms | ✅ SATISFIED | `artifact.test.ts:408` — un-armed valid capture save does not throw, then `isProjectArmed()===true`, then a follow-up no-capture save throws. Code: `applyCaptureGate` evaluates with `wasArmed` (:796–797) **before** `armAfterValidBuildReport` (:1187/:1617). |
| A032 | A never-captured project stays in warn-mode and is never blocked      | ✅ SATISFIED | `artifact.test.ts:432` — un-armed, no marker → no throw, and `isProjectArmed()===false` after. Matcher `gate.blocked === false`. |
| A033 | After enforcement, unreadable counts still never block               | ✅ SATISFIED | `capture-marker.test.ts:274` — `armed:true`, valid preservation, abstain counts → `blocked=false`. Code: `evaluateCaptureGate` runs only the 3 preservation validators; counts are never weighed (fail-open by construction). |
| A034 | A fresh project with no arming record reads as not armed             | ✅ SATISFIED | `capture-state.test.ts:37` (no file→`false`), `:43` (malformed JSON→`false`, `not.toThrow`). Code: `capture-state.ts:56` `existsSync` guard + try/catch default. |
| A035 | Verify reports are never blocked by the evidence gate                 | ✅ SATISFIED | `artifact.test.ts:442` — armed project, verify-report save → no throw. Structural: verify-report branch (artifact.ts:990, :1409) calls only `inlineReportCaptures`, never `applyCaptureGate`. |
| A036 | Saves with no build report never trigger the evidence gate           | ✅ SATISFIED | `artifact.test.ts:452` — armed project, spec save → no throw. Structural: `applyCaptureGate` is reached only inside `baseType === 'build-report'` (artifact.ts:1027, :1438). |

All 7 Phase 2 assertions **SATISFIED**.

**Tag-collision note:** `grep "@ana A03[0-6]"` returns hits in ~12 unrelated test files (`proof-health`, `worktree`, `run`, `config`, `doctor`, `proof`, `work`, `confirmation`, `dependencies`, etc.). These are **ID collisions** — bare numeric `@ana` IDs are not slug-scoped, and other features' contracts reuse A030–A036. Phase 2's genuine coverage lives only in `capture-state.test.ts`, `capture-marker.test.ts`, and `artifact.test.ts`. I read those and ignored the collisions.

## Independent Findings

**Predictions resolved (Step 3):**
1. *check-then-arm ordering bug (arm-before-check, or arming on invalid save)* — **Not found.** The order is correct: `applyCaptureGate` captures `wasArmed = isArmed()` and evaluates the gate (:796–797), exits on block (:805) before any seal, and `armAfterValidBuildReport` (:1187, :1617) only arms when `outcome.valid` (all validators passed this save). The gotcha the spec flagged was handled.
2. *Missing integration coverage for A030–A036* — **Not found.** All seven are covered by real, targeted tests (not sentinels). Each asserts a specific `blocked`/throw/armed outcome.
3. *A035/A036 scope leak (gate wired into verify path)* — **Not found.** Verify and non-build-report paths never call `applyCaptureGate`; confirmed by reading both save sites.
4. *Fail-open on counts* — **Confirmed correct by construction.** The gate orchestrator only runs preservation validators; counts cannot set `blocked`.
5. **Surprise (unpredicted):** AC14's first clause — *"build-only specs with no contract never trigger the gate"* — is **not implemented.** `applyCaptureGate` runs for every `build-report` save with no contract-presence guard (artifact.ts:1027–1039). On an armed working copy, a build-only spec whose build report carries no capture marker would be **blocked**. This clause was never encoded as a contract assertion, so it shipped unverified. See AC14 below and Findings.

**Quality observations:**
- `capture-state.ts` is clean: pure util, no chalk, `node:` builtins, `import type`, explicit return types, JSDoc on exports, undefined-safe read mirroring `readSaveMetadata`. `armCapture` is idempotent via an `isArmed` short-circuit and writes only to `.ana/state/capture.json`.
- The arming flip in `evaluateCaptureGate` is a minimal, surgical change to the Phase 1 `{blocked,warnings,errors}` contract — exactly as the spec prescribed.
- No over-building: `isArmed`/`armCapture` are imported only by `artifact.ts`; no unused exports, no dead branches, no speculative abstractions.
- `armCapture` exits `process.exit`-free and chalk-free, keeping the architectural boundary (user-facing output stays in `artifact.ts`).

## AC Walkthrough

- **AC12 — armed → three validators fail-closed, `process.exit(1)` before the seal hash, automatic not user-toggled:** ✅ PASS. `applyCaptureGate` (artifact.ts:1038/:1447) runs before `writeSaveMetadata`/seal; block path `process.exit(1)` at :805. Arming is marker-sealed and automatic — no user setting. (A030)
- **AC13 — never-captured stays warn-mode; fail-open counts, fail-closed preservation after flip:** ✅ PASS. (A032 never-blocked; A033 abstain-counts-never-block; A030 preservation-fails-block.)
- **AC14 — build-only specs with no contract AND saves with no build report never gated; gate scoped to `build_report.md`; verify ungated:** ⚠️ PARTIAL. Two of three clauses verified: verify-report ungated (A035) and non-build-report ungated (A036), both structurally and by test. The **third clause — "build-only specs with no contract never trigger the gate" — is not honored**: `applyCaptureGate` runs for every build-report save regardless of contract presence (no guard at artifact.ts:1027). On an armed working copy, a build-only spec's build report with no capture marker would be blocked. Reachability is narrow (requires Build to have produced *zero* capture, which only happens when no tests run at all), and the clause was never sealed into a contract assertion — so this is a documented latent gap, not a contract failure. See Findings.
- **New (check-then-arm) — first valid save not blocked, seals then arms; next invalid save blocked:** ✅ PASS. (A031, `artifact.test.ts:408`.)
- **New — `isArmed` undefined-safe (missing→false, malformed→false):** ✅ PASS. (A034, `capture-state.test.ts:37/43`.)
- **New — `armCapture` idempotent, writes only to `.ana/state/` (never ana.json, never proof chain):** ✅ PASS. `capture-state.test.ts:70` (idempotent, preserves `armedAt`), `:80` (writes only `.ana/state/capture.json`; asserts `ana.json` and `plans/` untouched).
- **New — `pnpm vitest run` passes; count does not decrease; `tsc --noEmit` clean:** ✅ PASS. 3389 passed / 2 skipped / 0 failed; Phase 2 *adds* the 9-test `capture-state` suite plus flip tests — count increased; tsc exit 0.

## Blockers

None. Searched specifically for:
- **Arming-on-invalid-save** (the spec's headline correctness hazard): not present — `armCapture` is gated behind `outcome.valid`, evaluated after the gate.
- **Gate leaking into verify/non-build-report paths** (would break Verify's independence): not present — both save sites scope `applyCaptureGate` strictly to `baseType === 'build-report'`.
- **`isArmed` throwing on malformed/missing state** (would brick fresh projects): not present — `existsSync` guard + try/catch, both tested.
- **Block-before-seal ordering** (a late block would seal truncated evidence): correct — `process.exit(1)` fires before `writeSaveMetadata`.
- **Regressions:** full 138-file suite green; warn-mode behavior for never-captured projects unchanged.

The one real gap (AC14 build-only-spec clause) is a narrow, unsealed-clause edge case that upholds the brick-proof guarantee (it never silently passes a typed claim) — it belongs in Findings, not as a blocker.

## Findings

- **Code — AC14 build-only-spec carve-out not implemented:** `packages/cli/src/commands/artifact.ts:1027` — `applyCaptureGate` runs for every `build-report` save with no contract-presence check. On an armed working copy, a build-only spec (no contract) whose build report carries no capture marker is blocked by `validateCapturePresent`. Narrow in practice (only when Build captured *nothing*, i.e. no tests ran), but AC14 explicitly carved this out and the implementation doesn't. *risk / scope.*
- **Upstream — AC14 third clause was never sealed:** the contract encodes only A035 (verify ungated) and A036 (non-build-report ungated) for AC14; the prose clause "build-only specs with no contract never trigger the gate" has no assertion, so it shipped unverified. On the next seal, either add an assertion (e.g. "armed project + build-only spec build report + no capture → not blocked") or strike the clause from AC14 so spec and contract agree. *observation / scope.*
- **Test — `valid` arming predicate keys off `warnings.length === 0`:** `artifact.ts:815` uses "no warnings" as a proxy for "all three preservation validators passed." Correct today (the gate routes every non-blocking message to `warnings`), but implicit: a future informational warning would silently suppress arming. Consider arming off an explicit validator-pass signal. *debt / monitor.*
- **Code — redundant second `isArmed` read on first valid save:** `artifact.ts:796` reads `isArmed`, then `armCapture` (`capture-state.ts:75`) reads it again for its idempotency guard. `wasArmed` is already known and could be passed through. Negligible cost — `capture.json` is a small separate file off the hot `.saves.json` path (the design's whole point) — noting for completeness. *observation / monitor.*

## Deployer Handoff

- **This Phase 2 work is sound and ships the fail-closed flip as designed.** Every sealed contract assertion (A030–A036) passes; full suite, tsc, and lint are clean.
- **Known limitation to set expectations on:** enforcement is per-working-copy (gitignored `.ana/state/capture.json`) — a fresh clone or CI runner starts un-armed and stays in warn-mode until it captures locally. This is intended (committing the flag would re-introduce the brick on fresh clones), but it means **CI does not enforce the seal-gate** unless that runner persists `.ana/state/` and has itself sealed a capture.
- **One latent edge to track (Findings #1/#2):** on an armed working copy, a build-only spec (no contract) whose build report has no capture marker would be blocked — AC14 carved this out but the code doesn't. Low blast radius (needs a build that ran no tests), but worth a follow-up assertion or a spec correction so the contract and AC14 agree.
- Worktree is **14 commits behind main** — rebase before merging the eventual PR.

## Verdict
**Shippable:** YES

Every Phase 2 contract assertion is satisfied with real, targeted tests; the self-arming flip, check-then-arm ordering, undefined-safe arming signal, and gate scoping are all correct and independently confirmed by reading the code and running the suite. The single gap — AC14's unsealed "build-only spec" clause — is a narrow edge case that still upholds the brick-proof guarantee and is documented for follow-up. I'd stake my name on this shipping.
