# Verify Report: session-capture — Phase 2: Derive + attach

**Result:** FAIL
**Created by:** AnaVerify
**Date:** 2026-06-07
**Spec:** .ana/plans/active/session-capture/spec-2.md
**Branch:** feature/session-capture

> **Re-issued verdict (human severity override).** A prior `verify_report_2` graded this work PASS, with the worktree path prefix collision recorded as a non-blocking follow-up. On human review that finding has been **elevated to a ship-blocking BLOCKER** and the Phase-2 verdict is re-issued as **FAIL** with that collision as the **sole blocker**. Every other result in the prior report stands unchanged and passes: all 13 Phase-2 contract assertions remain SATISFIED, the suite is green, and the remaining six findings keep their original (non-blocking) severities. This report routes the work back to Build for one required fix.

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/session-capture/contract.yaml
  Seal: INTACT (hash sha256:130cc607fb298032b71120b7eec56a5a6a8989fb184482e6df58dae2844edc0f)
```

Seal status: **INTACT** — the contract was not modified since the planner sealed it.

Verify test run (sealed, independent of Build's account):
```
<!-- ana:capture stage=verify slug=session-capture counts=3523p/0f/2s verdict=pass sha256=6a6987523e6698273227f75ae7c0599c649dd7856b8fa926fb136c499a0b77fe -->
```

- **Tests:** 3523 passed, 0 failed, 2 skipped (`ana test --stage verify`, full suite). Baseline at plan time was 3424 — count increased, never decreased.
- **Build:** `pnpm run build` — success.
- **Typecheck:** `tsc --noEmit` (source) and `tsc --noEmit -p tsconfig.test.json` (tests) — both clean, 0 errors.
- **Lint:** `eslint src/ tests/` — 0 errors, 1 warning (`src/utils/git-operations.ts:198`, pre-existing, not a Phase 2 file).

The test/build/lint signal is green. **The FAIL is not a broken test or a regression — it is a correctness defect in shipped product code that no test exercises**, elevated to blocker on human review. This verifies **Phase 2 only** (A023–A035); Phase 1 (A001–A022) was verified in `verify_report_1.md`.

## Contract Compliance

| ID   | Says                                                          | Status      | Evidence |
|------|--------------------------------------------------------------|-------------|----------|
| A023 | A finished session's token usage is counted from its transcript | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:160` asserts `d?.tokens.input === 1500`. |
| A024 | Token usage repeated across lines is counted only once       | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:166` asserts `d?.tokens.output === 800` (duplicated `req_A` deduped at `forensics.ts:405`). |
| A025 | The model that ran the session is recorded                   | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:172` (Claude), `:216` (Codex `turn_context`). |
| A026 | Deriving the same transcript twice yields identical result   | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:197-202` double-derive JSON equality; no clock/random in derive path. |
| A027 | Cost is computed from tokens and a stamped price table       | ✅ SATISFIED | `tests/data/pricing.test.ts:30` stamps version; exact cost `110.25`/`1.69089` at `:29`/`:38`. |
| A028 | An unknown model yields a zero estimate instead of crashing  | ✅ SATISFIED | `tests/data/pricing.test.ts:45` → `cost_usd === 0`; `pricing.ts:84` returns 0 without throwing. |
| A029 | Per-file lines added/removed are recorded for each change    | ✅ SATISFIED | `tests/commands/artifact-module-churn.test.ts:146-147` exact `{added:4,deleted:0}`; binary→0/0 at `:89`. |
| A030 | Recording churn never changes the list of touched files      | ✅ SATISFIED | `tests/commands/artifact-module-churn.test.ts:150-151` modules_touched still an array containing `run.ts`. |
| A031 | A completed work item's proof carries its session provenance | ✅ SATISFIED | `tests/commands/work-proof-process.test.ts:180-188`; spread at `work-proof.ts:358`. *(See blocker — the assertion is satisfied; the matching logic that feeds it is defective in a case no test covers.)* |
| A032 | The proof records whether verification passed on first try   | ✅ SATISFIED | `tests/commands/work-proof-process.test.ts:198`/`:208` (cycles 0→true, 2→false). |
| A033 | A proof with capture off omits provenance, stays complete    | ✅ SATISFIED | `tests/commands/work-proof-process.test.ts:292` → `null` when off; `:308` no-match. |
| A034 | A non-pipeline session is fully counted when it ends         | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:311`; `tests/commands/_capture.test.ts:257` (compiled CLI, exit 0). |
| A035 | Raw conversation content is never stored — only pointers/counts | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:208` (sentinel absent); `tests/commands/_capture.test.ts:275` (derived block holds only count keys). |

All 13 Phase-2 assertions remain SATISFIED. The blocker is **not** an UNSATISFIED assertion — it is a correctness defect in `recordBelongsToWorktree`, the un-asserted matching logic that selects which sessions feed the `entry.process` attestation behind A031. The contract's mechanical check for A031 (`entry.process` exists) cannot see the cross-slug contamination; this is exactly the gap a fault-finding verifier exists to catch.

## Blockers

**BLOCKER — Worktree path prefix collision in `recordBelongsToWorktree` silently corrupts the per-role provenance dataset.**

- **Location:** `packages/cli/src/commands/work-proof.ts:51` (and `:67`, and the `:50` `transcript_path.includes` check).
- **Defect:** session-to-work-item matching uses `record.cwd.startsWith(worktreePath)` and `transcript_path.includes(worktreePath)` with **no path-segment boundary**. `worktreePath` is `…/.ana/worktrees/<slug>`. When one slug is a character-prefix of another, the shorter slug's match greedily absorbs the longer slug's sessions:
  - `dashboard` absorbs every session from `dashboard-v2`
  - `auth` absorbs every session from `auth-fix`
  - confirmed empirically this session: `'/proj/.ana/worktrees/feat-2/src'.startsWith('/proj/.ana/worktrees/feat')` → `true`; with a `path.sep` boundary → `false`.
- **Why this is ship-blocking, not a follow-up:**
  1. **Silent corruption of the exact thing the feature produces.** The per-role `ProcessAttestation` dataset is the entire point of session-capture; contaminating it with another work item's sessions makes the durable provenance row wrong without any error, warning, or failing test.
  2. **Triggered by normal naming.** Iterative slugs (`<name>`, `<name>-v2`, `<name>-fix`) are ordinary developer practice, so this hits real customers in the field, not a contrived edge case.
  3. **It is in shipped product code.** Once released, the corrupted attestations are written into customers' proof chains; AnaLearn tending the proof chain cannot un-ship the defect. Only a code fix prevents it. A follow-up ticket would ship the bug first and fix it later — unacceptable for a data-integrity defect in the feature's core output.
  4. **The correct pattern already exists in this same file.** `deriveSurface` (`work-proof.ts:225`) deliberately appends a trailing slash before its prefix compare precisely to avoid this collision class. The matching code diverged from an established in-file precedent.

- **Required fix for Build:**
  1. Enforce a path-segment boundary in `recordBelongsToWorktree` before every prefix comparison — append `path.sep` to `worktreePath` ahead of the `startsWith` checks (lines 51 and 67), mirroring the trailing-slash precedent in `deriveSurface` (`:225`). The `transcript_path.includes(worktreePath)` check at line 50 must likewise be tightened to an exact-or-under-boundary match (e.g. include the trailing `path.sep`, or compare path segments) so a substring of a longer worktree path cannot match.
  2. Add a **regression test** that seeds a `<slug>-v2` session (cwd under `…/worktrees/<slug>-v2`) and asserts `assembleProcessAttestation(projectRoot, '<slug>', …)` does **NOT** include that session — i.e. a `<slug>-v2` session is never attributed to `<slug>`. The existing `work-proof-process.test.ts` is the natural home; reuse its `writeRoleTranscript`/`roleRecord` helpers.

This is the **sole blocker**. No other issue in this report blocks shipping.

## Findings

All findings below stand from the prior verification; severities are unchanged except that Finding #1 is the elevated blocker above.

- **Code — Worktree path prefix collision contaminates provenance (BLOCKER):** `packages/cli/src/commands/work-proof.ts:51` — see Blockers section for the full write-up and required fix. Relates to A031.
- **Code — Unbounded home-global buffer scanned in full at every work-complete:** `packages/cli/src/commands/work-proof.ts:117` — `assembleProcessAttestation` reads `~/.ana/forensics/sessions.jsonl` (machine-wide, never pruned in Phase 1) entirely, and reads each non-slug-matched record's full transcript end-to-end (`recordBelongsToWorktree:56`). Cost grows linearly with lifetime session count. Provenance-only and best-effort, not a correctness blocker, but worth a buffer-prune or slug-indexed lookup. Relates to A031.
- **Code — Stale JSDoc contradicts implemented behavior:** `packages/cli/src/commands/work-proof.ts:93` — doc says "the newest by `timestamp` wins" but the function keeps **all** matching sessions in a sorted array. *Note: when fixing the blocker, correct this doc in the same pass — the boundary fix touches the same function.*
- **Upstream — Attestation shape deviates from the spec-2 mockup:** spec-2 lines 52-70 show `process` as a single-session object; implementation uses `process.sessions[]`. Human-approved, contract-compatible (A031 only requires existence; A032's `outcome` stays top-level). Spec mockup is now stale.
- **Test — AC12 no-network enforcement has a narrower scan than the AC phrasing:** `packages/cli/tests/commands/_capture.test.ts:156` scans the derive/cost core (`_capture.ts`/`forensics.ts`/`pricing.ts`) but not the `work-proof.ts` assembly wrapper. Source inspection confirms no network code on the path; consider adding `work-proof.ts` to the scanned set.
- **Code — SessionEnd derive blocks on a synchronous full-transcript read before exit:** `packages/cli/src/commands/_capture.ts:208` — `executeDerive` awaits a `readFileSync` + per-line `JSON.parse` of the whole transcript before `process.exit(0)`. The 250ms stdin cap bounds the read-wait, not the derive. Low impact; recorded for awareness.
- **Code — `parseTestCounts` over-counts on prose:** `packages/cli/src/utils/forensics.ts:346` — matches the first `/(\d+)\s+passed/` in any Bash `tool_result`, so prose mentioning "N passed" inflates `tests_executed`/`failures_encountered`. Best-effort and provenance-only (never feeds a verdict). Acknowledged.

## AC Walkthrough

The blocker is a correctness defect in the AC9 assembly path, not a failed mechanical check; the AC walkthrough is unchanged from the prior verification and recorded here for completeness. AC9 is marked ❌ because its core output (the `ProcessAttestation` session set) is corruptible under normal slug naming.

- **AC8** — `deriveTranscript` produces all counts, deduped, byte-identical. ✅ PASS — exact-value + determinism tests.
- **AC9** — work-complete attaches `process?` via the 4-touch pattern; off/no-match → absent. ❌ FAIL — the 4-touch wiring is correct and tested, but the session-selection step (`recordBelongsToWorktree`) that decides *which* sessions populate the attestation is defective (worktree prefix collision), so the attestation can carry another work item's sessions. This is the blocker.
- **AC10** — `module_churn` from `--numstat`; `modules_touched` unchanged. ✅ PASS.
- **AC11** — SessionEnd/Stop hook triggers the derive, async, provenance-only. ✅ PASS — install/prune tested both harnesses.
- **AC12** — No network + no raw body. ⚠️ PARTIAL — no-raw-body fully verified; no-network verified by enforcement scan over the derive/cost core (scan boundary noted in Findings).
- **New: computeCost deterministic, stamps version, unknown→0.** ✅ PASS.
- **New: determinism — derive twice JSON-identical.** ✅ PASS.
- **New: capture-off → no process key, renders identically.** ✅ PASS.
- **New: tests pass, no type errors, lint clean, count not decreased.** ✅ PASS — 3523p/0f/2s, up from 3424.

## Deployer Handoff

- **Do not ship Phase 2 as-is.** One blocker: the worktree path prefix collision in `recordBelongsToWorktree` (`work-proof.ts:51`) silently corrupts the per-role provenance dataset for prefix-related slugs (`dashboard`/`dashboard-v2`). It is in product code, triggered by normal naming, and cannot be remediated after release — it must be fixed before merge.
- Everything else in Phase 2 is sound: all 13 contract assertions satisfied, suite green (3523p/0f/2s), typecheck and lint clean, determinism/network/raw-body guardrails hold. The fix is narrow and has an in-file precedent (`deriveSurface:225`).
- After Build applies the path-boundary fix **and** adds the `<slug>-v2`-not-attributed-to-`<slug>` regression test, this returns for re-verification. On PASS, a new PR will be created (the prior PR #288 was closed as part of this FAIL).
- While the fix is open, it is the natural moment to also clear the stale JSDoc (Finding #3) in the same function.

## Verdict
**Shippable:** NO

Phase 2 is re-issued as **FAIL** on human severity override, with the worktree path prefix collision in `recordBelongsToWorktree` as the **sole blocker**. The defect silently corrupts the per-role `ProcessAttestation` dataset — the feature's core output — is triggered by ordinary iterative slug naming, and lands in shipped product code that cannot be remediated downstream. All 13 Phase-2 contract assertions remain SATISFIED and the suite is green; this FAIL is a correctness/data-integrity gate that no mechanical assertion covers, which is precisely the verifier's job. Required of Build: a path-segment boundary fix (mirror `deriveSurface`'s trailing-slash precedent) plus a regression test proving a `<slug>-v2` session is not attributed to `<slug>`. Routing back to Build.
