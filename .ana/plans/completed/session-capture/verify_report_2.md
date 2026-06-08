# Verify Report: session-capture — Phase 2: Derive + attach

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-07
**Spec:** .ana/plans/active/session-capture/spec-2.md
**Branch:** feature/session-capture

> **Re-verification after a FAIL.** The prior `verify_report_2` FAILed Phase 2 on a single blocker (a human-elevated severity override): a worktree path-prefix collision in `recordBelongsToWorktree` that let a shorter slug greedily absorb a longer slug's sessions (`feat` ⊃ `feat-v2`), silently corrupting the per-role `ProcessAttestation` dataset. Build has fixed that defect (commit `e845e24a`), added the required regression test, and corrected the stale JSDoc. This report re-runs the FULL Phase-2 verification from scratch. The blocker is **resolved**; all 13 Phase-2 assertions remain SATISFIED; the suite is green. **Result: PASS.**

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/session-capture/.ana/plans/active/session-capture/contract.yaml
  Seal: INTACT (hash sha256:130cc607fb298032b71120b7eec56a5a6a8989fb184482e6df58dae2844edc0f)
```

Seal status: **INTACT** — the contract was not modified since the planner sealed it (same hash as the prior verification).

Verify test run (sealed, independent of Build's account):
```
<!-- ana:capture stage=verify slug=session-capture counts=3525p/0f/2s verdict=pass sha256=5403ce8a2e52f9a56a92a00132ddd3204d37c923361dd39473d03a588b5f1711 -->
```

- **Tests:** 3525 passed, 0 failed, 2 skipped (`ana test --stage verify`, full suite). Prior verification ran 3523; the +2 is Build's two new tests (the `<slug>-v2` boundary regression and the banked-counts paths). Count increased, never decreased — baseline at plan time was 3424.
- **Build:** `(cd packages/cli && pnpm run build)` — success (tsup ESM, build success in 38ms).
- **Typecheck:** `tsc --noEmit` (source) and `tsc --noEmit -p tsconfig.test.json` (tests) — both clean, 0 errors.
- **Lint:** `eslint src/ tests/` — 0 errors, 1 warning (`src/utils/git-operations.ts:198`, pre-existing unused eslint-disable, not a Phase 2 file).
- **Focused regression file:** `vitest run tests/commands/work-proof-process.test.ts` — 13/13 passed, including the new boundary test.

This verifies **Phase 2 only** (A023–A035); Phase 1 (A001–A022) was verified in `verify_report_1.md`.

## Contract Compliance

| ID   | Says                                                          | Status      | Evidence |
|------|--------------------------------------------------------------|-------------|----------|
| A023 | A finished session's token usage is counted from its transcript | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts` asserts `derived.tokens.input === 1500`; `deriveTranscript` sums input tokens. Green in suite. |
| A024 | Token usage repeated across lines is counted only once       | ✅ SATISFIED | `forensics-derive.test.ts` asserts `derived.tokens.output === 800` (duplicate `requestId` deduped in `forensics.ts`). Green. |
| A025 | The model that ran the session is recorded                   | ✅ SATISFIED | `forensics-derive.test.ts` extracts `model === 'claude-opus-4-6'` (Claude + Codex `turn_context`). Green. |
| A026 | Deriving the same transcript twice yields identical result   | ✅ SATISFIED | `forensics-derive.test.ts` double-derive JSON equality; no clock/random on the derive path. Green. |
| A027 | Cost is computed from tokens and a stamped price table       | ✅ SATISFIED | `tests/data/pricing.test.ts` stamps `price_table_version`; exact cost asserted. Green. |
| A028 | An unknown model yields a zero estimate instead of crashing  | ✅ SATISFIED | `pricing.test.ts` → `cost_usd === 0`; `pricing.ts` returns 0 without throwing. Green. |
| A029 | Per-file lines added/removed are recorded for each change    | ✅ SATISFIED | `tests/commands/artifact-module-churn.test.ts` exact `{added,deleted}`; binary→0/0. Green. |
| A030 | Recording churn never changes the list of touched files      | ✅ SATISFIED | `artifact-module-churn.test.ts` asserts `modules_touched` still an array containing `run.ts`. Green. |
| A031 | A completed work item's proof carries its session provenance | ✅ SATISFIED | `tests/commands/work-proof-process.test.ts:174-189` attaches `entry.process` with sessions; spread at `work-proof.ts:374`. **The matching logic that feeds this (`recordBelongsToWorktree`) is now boundary-safe — see Previous Findings Resolution.** Green. |
| A032 | The proof records whether verification passed on first try   | ✅ SATISFIED | `work-proof-process.test.ts:191-209` (rejection_cycles 0→true, 2→false); `outcome.first_pass_verify` at `work-proof.ts:187`. Green. |
| A033 | A proof with capture off omits provenance, stays complete    | ✅ SATISFIED | `work-proof-process.test.ts:304-328` → `null` when off and on no-match; field omitted via `...(x ? {process:x} : {})`. Green. |
| A034 | A non-pipeline session is fully counted when it ends         | ✅ SATISFIED | `forensics-derive.test.ts` + `_capture.test.ts` (compiled CLI, exit 0) write `record.derived`. Green. |
| A035 | Raw conversation content is never stored — only pointers/counts | ✅ SATISFIED | `forensics-derive.test.ts` (sentinel content absent); `_capture.test.ts` derived block holds only count keys; `record.transcriptBodyPersisted === false`. Green. |

All 13 Phase-2 assertions remain SATISFIED. None were affected adversely by either fix commit: A031/A032/A033 are exercised by the 13-test `work-proof-process.test.ts` (all green), and the matching defect behind the prior FAIL is now closed.

## Independent Findings

**Predictions I made before reading the fixed code, and how they resolved:**

1. *Predicted the fix might only patch `startsWith` and miss the `transcript_path.includes()` and per-line cwd checks.* **Not found — Build got it right.** All three matching paths use the boundary-safe helper: `transcript_path.includes(worktreeWithSep)` (line 60), `isUnderWorktree(record.cwd)` (line 61), and `isUnderWorktree(cwd)` in the per-line scan (line 77). The cheap pre-filter `line.includes(worktreePath)` (line 68) is still a raw prefix, but it only gates an expensive `JSON.parse` — the actual matching decision is the boundary-safe `isUnderWorktree`, so a `feat-v2` line that passes the pre-filter is still correctly rejected. Verified by reading the code path end to end.

2. *Predicted the regression test might be a sentinel — seeding nothing and trivially asserting null.* **Not found.** `work-proof-process.test.ts:237-254` seeds a real `feat-v2` build session (transcript cwd under `…/worktrees/feat-v2`), asserts `assembleProcessAttestation(…, 'feat', …)` is `null` (the shorter slug does NOT absorb it), AND asserts the `feat-v2` session is still correctly attributed to `feat-v2`. It exercises the exact per-line-cwd path where the old code failed. A real test.

3. *Predicted Build might "fix" by widening assertions or skipping the dangling-transcript case.* **Surprised — Build did the opposite and widened scope.** Commit `41cdc1cb` ("prefer banked counts, never drop a matched session") is an unrequested second fix that makes `SessionProvenance.derived` optional and keeps matched-but-counts-less sessions as metadata-only rows. This is scope expansion during a fix cycle (the FAIL had one required fix) — but it is a genuine robustness improvement, well-tested, and type-safe. Recorded as a finding, not a blocker.

4. *Predicted the JSDoc "newest by timestamp wins" lie (prior Finding #3) might be left untouched.* **Not found — fixed.** The `assembleProcessAttestation` JSDoc now reads "ALL matching records are kept … ordered deterministically by `timestamp` then `role`" (`work-proof.ts:106-108`), matching the implemented behavior.

**Production-risk prediction:** *the optional-`derived` change could crash `proof.ts` rendering when `derived` is absent.* **Investigated — handled.** `proof.ts:formatHumanReadable` reads `s.derived` into `d`, branches on `if (d)`, renders `chalk.gray('counts unavailable')` otherwise, and skips counts-less sessions in the cost total (`if (!s.derived) continue`). No unguarded `d.` deref remains on that path. Typecheck clean confirms no other call site assumes the field is required.

**Over-building / YAGNI check:** the only new surface area is the optional-`derived` path from `41cdc1cb`, covered above. No unused exports introduced (`assembleProcessAttestation` is imported by `writeProofChain` and the test; `recordBelongsToWorktree` is module-private). No dead branches in the fixed function — every `if` in `recordBelongsToWorktree` is a distinct, reachable matching signal.

## Previous Findings Resolution

### Previously UNSATISFIED Assertions

None. The prior FAIL had **zero** UNSATISFIED assertions — all 13 were SATISFIED. The FAIL was a human-elevated correctness/data-integrity blocker that no mechanical assertion covered, recorded in the table below.

### Previous Findings

| Finding | Status | Notes |
|---------|--------|-------|
| Worktree path prefix collision in `recordBelongsToWorktree` (the BLOCKER) | **Fixed** | Commit `e845e24a`: `worktreeWithSep = worktreePath + path.sep` + `isUnderWorktree` helper applied to all three matching paths (`transcript_path.includes`, `record.cwd`, per-line cwd). Regression test at `work-proof-process.test.ts:237-254` proves a `feat-v2` session is not attributed to `feat`. Verified by reading the diff and running the focused file (13/13 green). |
| Unbounded home-global buffer scanned in full at every work-complete | **Still present** | `assembleProcessAttestation` still reads `~/.ana/forensics/sessions.jsonl` (machine-wide, unpruned) in full, and `recordBelongsToWorktree` still reads each non-matched record's full transcript. Partially mitigated: `41cdc1cb`'s banked-counts preference removed the redundant re-derive for already-counted matched sessions. Not a blocker — provenance-only, best-effort. |
| Stale JSDoc ("newest by timestamp wins") | **Fixed** | `work-proof.ts:106-108` now documents "ALL matching records are kept … ordered deterministically by timestamp then role." Corrected in the same `e845e24a` pass, as recommended. |
| Attestation shape deviates from spec-2 mockup | **Still present** | By design, human-approved, contract-compatible (A031 only requires existence; A032 outcome stays top-level). The spec mockup is stale; refresh on next seal. Not a blocker. |
| AC12 no-network scan narrower than AC phrasing | **Still present** | Enforcement scan covers the derive/cost core but not the `work-proof.ts` assembly wrapper. Source inspection confirms no network code on the assembly path. Not a blocker. |
| SessionEnd derive blocks on synchronous full-transcript read | **Still present** | `_capture.ts:208` unchanged. Low impact; the 250ms stdin cap bounds the read-wait. Not a blocker. |
| `parseTestCounts` over-counts on prose | **Still present** | `forensics.ts:346` unchanged. Best-effort, provenance-only, never feeds a verdict. Not a blocker. |

Every previous finding is accounted for. The one blocker is Fixed; the JSDoc nit is Fixed; the remaining five are the same non-blocking observations carried forward.

## AC Walkthrough

- **AC8** — `deriveTranscript` produces all counts, deduped, byte-identical; `computeCost` stamps version, unknown→0. ✅ PASS — exact-value + determinism tests (A023–A028) green.
- **AC9** — work-complete attaches `process?` via the 4-touch pattern; off/no-match → absent; session selection is boundary-correct. ✅ PASS — the prior ❌ is cleared. The session-selection defect (`recordBelongsToWorktree` prefix collision) that made this AC's core output corruptible is fixed and regression-tested; `entry.process` is assembled correctly and cannot absorb a prefix-sibling slug's sessions.
- **AC10** — `module_churn` from `--numstat`; `modules_touched` unchanged. ✅ PASS — A029/A030 green.
- **AC11** — SessionEnd/Stop hook triggers the derive, async, provenance-only. ✅ PASS — A034 green; install/prune tested both harnesses.
- **AC12** — No network + no raw body. ⚠️ PARTIAL — no-raw-body fully verified (A035 green); no-network verified by enforcement scan over the derive/cost core, with the scan boundary noted in Findings (assembly wrapper inspected manually, no network code).
- **New: computeCost deterministic, stamps version, unknown→0.** ✅ PASS.
- **New: determinism — derive/assemble twice JSON-identical.** ✅ PASS — `work-proof-process.test.ts:292-302` green.
- **New: capture-off → no process key, renders identically.** ✅ PASS — A033 green.
- **New: tests pass, no type errors, lint clean, count not decreased.** ✅ PASS — 3525p/0f/2s, up from 3523; tsc clean (source + tests); lint 0 errors.

## Blockers

**None.** The sole blocker from the prior FAIL — the worktree path-prefix collision in `recordBelongsToWorktree` — is fixed (commit `e845e24a`) and regression-tested. I searched specifically for:

- **Incomplete fix:** checked that the boundary applies to ALL three matching signals (transcript_path, record.cwd, per-line cwd), not just the one named in the report — confirmed all three use `isUnderWorktree`/`worktreeWithSep`.
- **Sentinel regression test:** read the new test; it seeds a real `feat-v2` session and asserts both the negative (`feat` → null) and the positive (`feat-v2` → its own session) — not a trivial pass-through.
- **Collateral breakage from the second fix:** the optional-`derived` change could have broken `proof.ts` rendering or a contract assertion — verified the display guards `d?` everywhere, cost totals skip counts-less rows, typecheck is clean, and all 13 A031–A035 tests pass.
- **New error/edge paths:** the metadata-only-row path (matched session, no banked counts, deleted transcript) is exercised by `work-proof-process.test.ts:363-382` (green).
- **External-state assumptions:** the buffer read and transcript reads are wrapped in try/catch returning `null`/no-match; a missing buffer or unreadable transcript degrades cleanly.

Nothing qualifies as ship-blocking.

## Findings

- **Code — Unrequested scope expansion during the fix cycle:** `packages/cli/src/commands/work-proof.ts:163` — commit `41cdc1cb` went beyond the FAIL's single required fix, making `SessionProvenance.derived` optional, keeping matched-but-counts-less sessions as metadata-only rows, and updating `proof.ts` to render "counts unavailable" and exclude such rows from cost totals. It is a real robustness improvement (prevents silently dropping a session whose transcript was deleted before the SessionEnd hook banked counts), is well-tested (two new green tests), and is type-safe (every `proof.ts` read guards `d?`). Recorded because a fix cycle that widens beyond its mandate is worth the next engineer knowing — the behavior change (dangling transcript: was dropped, now kept) is intentional, not accidental. Relates to A031.
- **Code — Home-global buffer scanned in full at every work-complete (partially mitigated):** `packages/cli/src/commands/work-proof.ts:125` — `assembleProcessAttestation` reads `~/.ana/forensics/sessions.jsonl` (machine-wide, never pruned in Phase 1) entirely, and `recordBelongsToWorktree` reads each non-slug/non-cwd-matched record's full transcript end-to-end. `41cdc1cb`'s banked-counts preference removed the redundant re-derive for already-counted matched sessions, lowering per-matched-session cost, but the unbounded buffer scan and per-candidate transcript read remain. Cost grows with lifetime session count. Provenance-only and best-effort — a buffer-prune or slug-indexed lookup is the eventual fix. Relates to A031.
- **Upstream — Attestation shape deviates from the spec-2 mockup:** spec-2 lines 52-70 show `process` as a single-session object; implementation uses `process.sessions[]` with work-item-level `outcome`/`task_shape`/`module_churn`. Human-approved, contract-compatible (A031 requires only existence; A032's `outcome` stays top-level). Spec mockup is stale — refresh on the next seal.
- **Test — AC12 no-network enforcement scan is narrower than the AC phrasing:** `packages/cli/tests/commands/_capture.test.ts:156` scans the derive/cost core (`_capture.ts`/`forensics.ts`/`pricing.ts`) but not the `work-proof.ts` assembly wrapper or `artifact.ts` churn path. Source inspection confirms no network code on the assembly path; consider adding `work-proof.ts` to the scanned set so the guard tracks the full AC surface.
- **Code — SessionEnd derive blocks on a synchronous full-transcript read before exit:** `packages/cli/src/commands/_capture.ts:208` — `executeDerive` awaits a `readFileSync` + per-line `JSON.parse` of the whole transcript before `process.exit(0)`. The 250ms stdin cap bounds the read-wait, not the derive. Low impact; unchanged this cycle; recorded for awareness.
- **Code — `parseTestCounts` over-counts on prose:** `packages/cli/src/utils/forensics.ts:346` — matches the first `/(\d+)\s+passed/` in any Bash `tool_result`, so prose mentioning "N passed" inflates `tests_executed`/`failures_encountered`. Best-effort and provenance-only (never feeds a verdict). Acknowledged; unchanged this cycle.

## Deployer Handoff

- **Phase 2 is shippable.** The blocker that held the prior FAIL — the worktree path-prefix collision in `recordBelongsToWorktree` — is fixed (commit `e845e24a`, boundary applied to all three matching paths) and regression-tested (`feat-v2` is never attributed to `feat`). All 13 Phase-2 contract assertions are SATISFIED, the suite is green (3525p/0f/2s), typecheck and lint are clean.
- **Know about the second fix.** Build also landed `41cdc1cb` ("prefer banked counts, never drop a matched session"), an unrequested robustness change that makes `SessionProvenance.derived` optional. It is intentional, tested, and type-safe — but it is a behavior change (a session whose transcript was deleted before counts were banked is now kept as a metadata-only row instead of being dropped). If you expected the FAIL to produce a one-line diff, this is why the diff is larger.
- **Carried-forward, non-blocking:** the home-global buffer is still scanned in full at every work-complete (scales with lifetime session count); the spec-2 attestation mockup is stale (single-session vs `sessions[]`); the AC12 no-network scan does not cover the assembly wrapper (manually inspected, no network code). None block shipping.
- On this PASS, a new PR will be created (the prior PR was closed as part of the FAIL).

## Verdict
**Shippable:** YES

Phase 2 passes re-verification. The sole blocker from the prior FAIL — a worktree path-prefix collision that silently corrupted the per-role `ProcessAttestation` dataset under ordinary iterative slug naming — is fixed at the root (path-segment boundary on all three matching signals, mirroring `deriveSurface`'s precedent) and locked down by a real regression test that proves a `feat-v2` session is never attributed to `feat`. The stale JSDoc is corrected in the same pass. All 13 Phase-2 contract assertions remain SATISFIED, every acceptance criterion passes (AC12 PARTIAL only on scan breadth, manually closed), the full suite is green (3525p/0f/2s, up from 3523), and typecheck and lint are clean. Build additionally landed an unrequested-but-sound robustness fix (optional `derived` / never-drop-a-matched-session); it is well-tested and type-safe, recorded as a finding for transparency, and does not block. I would stake my name on this shipping. Routing to PR.
