# Verify Report: session-capture — Phase 2: Derive + attach

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-07
**Spec:** .ana/plans/active/session-capture/spec-2.md
**Branch:** feature/session-capture

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

- **Tests:** 3523 passed, 0 failed, 2 skipped (`ana test --stage verify`, full suite via `pnpm run test -- --run`). Baseline at plan time was 3424 — count increased by ~99, never decreased.
- **Build:** `pnpm run build` — success.
- **Typecheck:** `tsc --noEmit` (source) and `tsc --noEmit -p tsconfig.test.json` (tests) — both clean, 0 errors.
- **Lint:** `eslint src/ tests/` — 0 errors, 1 warning (`src/utils/git-operations.ts:198`, an unused eslint-disable directive — NOT a Phase 2 file, pre-existing).

This report verifies **Phase 2 only** (assertions A023–A035). Phase 1 (A001–A022) was verified in `verify_report_1.md` and is out of scope here.

## Contract Compliance

| ID   | Says                                                          | Status      | Evidence |
|------|--------------------------------------------------------------|-------------|----------|
| A023 | A finished session's token usage is counted from its transcript | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:160` asserts `d?.tokens.input === 1500` against the inline fixture (1000 [req_A, deduped] + 500 [req_B]). |
| A024 | Token usage repeated across lines is counted only once       | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:166` asserts `d?.tokens.output === 800` with a duplicated `req_A` in the fixture; dedup via `seenRequestIds` Set at `forensics.ts:405`. |
| A025 | The model that ran the session is recorded                   | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:172` asserts `d?.model === 'claude-opus-4-6'`; Codex variant at `:216` reads model from `turn_context`, not the null `session_meta`. |
| A026 | Deriving the same transcript twice yields identical result   | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:197-202` derives twice and asserts `JSON.stringify(a) === JSON.stringify(b)`; Codex at `:236`. No clock/random in derive path (verified by grep). |
| A027 | Cost is computed from tokens and a stamped price table       | ✅ SATISFIED | `tests/data/pricing.test.ts:30` asserts `result.price_table_version === PRICE_TABLE_VERSION`; exact cost `110.25` at `:29`, fractional `1.69089` at `:38`. |
| A028 | An unknown model yields a zero estimate instead of crashing  | ✅ SATISFIED | `tests/data/pricing.test.ts:45` asserts `computeCost(..,'no-such-model-9000').cost_usd === 0`; `pricing.ts:84` returns `{cost_usd:0, price_table_version}` without throwing. |
| A029 | Per-file lines added/removed are recorded for each change    | ✅ SATISFIED | `tests/commands/artifact-module-churn.test.ts:146` asserts `saves['module_churn']` defined with exact `{added:4,deleted:0}` at `:147`; binary→0/0 at `:89`. |
| A030 | Recording churn never changes the list of touched files      | ✅ SATISFIED | `tests/commands/artifact-module-churn.test.ts:150-151` asserts `modules_touched` is still an array containing `packages/cli/src/commands/run.ts`. `artifact.ts:209` writes it unchanged. |
| A031 | A completed work item's proof carries its session provenance | ✅ SATISFIED | `tests/commands/work-proof-process.test.ts:180-188` asserts assembly returns non-null with sessions + churn; spread onto `entry.process` at `work-proof.ts:358` (mirrors commit_hygiene). |
| A032 | The proof records whether verification passed on first try   | ✅ SATISFIED | `tests/commands/work-proof-process.test.ts:198` asserts `outcome.first_pass_verify === true` for `rejection_cycles:0`; `false` for cycles:2 at `:208`. `work-proof.ts:171`. |
| A033 | A proof with capture off omits provenance, stays complete    | ✅ SATISFIED | `tests/commands/work-proof-process.test.ts:292` asserts `assembleProcessAttestation(..) === null` when capture off; spread omits the field. Also null when no worktree match (`:308`). |
| A034 | A non-pipeline session is fully counted when it ends         | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:311` asserts `target?.derived` written back; `tests/commands/_capture.test.ts:257` end-to-end via compiled CLI, exit 0, `derived.tokens.input === 700`. |
| A035 | Raw conversation content is never stored — only pointers/counts | ✅ SATISFIED | `tests/utils/forensics-derive.test.ts:208` asserts derived JSON does not contain the `SECRET_BODY` sentinel; `tests/commands/_capture.test.ts:275` asserts the `derived` block holds only count keys. |

All 13 Phase-2 assertions SATISFIED. Each `@ana` tag was read and confirmed to actually exercise what the contract specifies (not rubber-stamped). Note: the `@ana A0NN` tags collide across the global test namespace — `A023` etc. appear in dozens of unrelated feature test files — so verification was anchored to the Phase-2 test files named in the contract `file_changes`/spec, not a global grep.

## Independent Findings

**Predictions (written before reading implementation), resolved:**

1. *requestId dedup may use the wrong key.* **Not found** — `deriveClaude` dedupes by top-level `requestId` via a Set (`forensics.ts:403-411`), exactly as the gotcha demands; the fixture proves a duplicated `req_A` is counted once (input 1500, output 800).
2. *Determinism — accidental clock/key-order.* **Not found** — grep confirms no `Date.now`/`new Date`/`Math.random` inside `deriveTranscript`/`computeCost`; duration comes from `Date.parse` of transcript timestamps; objects are built in fixed key order. The one `new Date()` (`forensics.ts:196`) is the Phase-1 capture timestamp, outside the derive.
3. *Buffer selection — "first match" / non-deterministic.* **Surprised** — Build made a **human-approved deviation**: Build/Verify sessions launch from the main repo with an *empty* slug, so records are recovered by matching the worktree path against the transcript's own `cwd` entries, and ALL matching sessions are kept (sorted by timestamp then role) rather than collapsed to "newest wins." Deterministic and contract-compatible — but it surfaced two real issues (see Findings #1, #2).
4. *Codex usage-key branch guessed/untested.* **Not found** — `deriveCodex` was confirmed against a real rollout (documented at `forensics.ts:466-476`: model on `turn_context`, cumulative `total_token_usage`, last-total-wins) and is tested with a Codex fixture (`forensics-derive.test.ts:212-248`).
5. *computeCost may throw on unknown/empty tokens.* **Not found** — returns `{cost_usd:0, version}` for unknown models; zero tokens → exact 0; both tested.
6. *Production risk — whole-transcript reads / unbounded buffer.* **Confirmed** — see Finding #2.

**Unpredicted findings (the most important):**
- The **prefix-collision bug** in `recordBelongsToWorktree` (Finding #1) — a genuine correctness risk that no test covers.
- The attestation **shape change** from the spec mockup (single session → `sessions[]`), documented but leaving stale spec/JSDoc.

**Over-building / YAGNI check:** No scope creep found. `computeModuleChurn` and `assembleProcessAttestation` are exported but imported by their test files (`artifact-module-churn.test.ts`, `work-proof-process.test.ts`) — test-access exports, sanctioned by testing-standards, not dead exports. No unused parameters in new functions. No unreachable branches found in the new code. The `sessions[]` array (vs single session) is extra captured data beyond the spec mockup, but it's deliberate, tested, and contract-compatible — recorded as an observation, not a defect.

**Proof-context cross-check:** The active finding `fix-false-rejection-archive-C3` (multiple `.saves.json` reads in `artifact.ts`) was correctly NOT worsened — `module_churn` is folded into the existing `captureModulesTouched` read (`artifact.ts:207`) and write (`:211`); `computeModuleChurn` only adds a git `--numstat` call, no new file read.

## AC Walkthrough

- **AC8** — `deriveTranscript` produces tokens (deduped by requestId), cost, duration, turns, tool/command/test/failure/files counts, model; same input → byte-identical. ✅ PASS — `forensics-derive.test.ts` asserts every field with exact values (cache 150/300, turns 3, tool_calls 3, commands_run 1, files_touched 1, duration 21000, cost 0.085763) plus the determinism test.
- **AC9** — At work-complete, derived + outcome + task_shape + module_churn attach as optional `process?` via the 4-touch pattern; off / no match → absent. ✅ PASS — all 4 touches present (type `proof.ts:175`, default `proofSummary.ts:887`, read+spread `work-proof.ts:283/358`, display `proof.ts:437`); `work-proof-process.test.ts` covers on/off/no-match/dangling.
- **AC10** — `module_churn` from `--numstat`; `modules_touched` unchanged. ✅ PASS — `artifact-module-churn.test.ts` (exact churn, binary 0/0, `.ana` excluded, unresolvable merge-base no-throw, array unchanged).
- **AC11** — SessionEnd (Claude) / Stop (Codex) hook triggers the same derive, writes counts back, async, provenance-only. ✅ PASS — `_capture.ts:192 executeDerive`; hook install + prune tested in `assets-capture-hooks.test.ts:192-203` (Claude) and `:311-329` (Codex), user hooks preserved.
- **AC12** — No network I/O on the capture+derive path; no raw transcript body persisted. ⚠️ PARTIAL — no-raw-body is fully verified (sentinel + key-allowlist tests). No-network is verified by a source-content enforcement scan (`_capture.test.ts:156`) covering `_capture.ts`/`forensics.ts`/`pricing.ts` — the derive/cost core. The scan does not extend to the `work-proof.ts` assembly wrapper, so the *guarantee* holds at the core but the *test boundary* is narrower than the AC's "capture + derive path" phrasing. Recorded as Finding #5; not a blocker (no network code exists anywhere on the path on inspection).
- **New: computeCost deterministic, stamps version, unknown→0.** ✅ PASS — `pricing.test.ts`.
- **New: determinism — derive twice JSON-identical.** ✅ PASS — `forensics-derive.test.ts:197`, `:236`.
- **New: capture-off → no process key, renders identically.** ✅ PASS — `work-proof-process.test.ts:285`; display gated on `entry.process` (`proof.ts:437`).
- **New: tests pass, no type errors, lint clean, count not decreased.** ✅ PASS — 3523p/0f/2s (up from 3424 baseline), typecheck clean, lint 0 errors.

## Blockers

None. I searched specifically for:
- **Unused exports in new code:** `computeModuleChurn`, `assembleProcessAttestation`, `deriveTranscript`, `updateSessionRecord` are all imported by their test files or callers — no zero-import exports.
- **Unused parameters:** every parameter of the new functions (`assembleProcessAttestation`'s 6 args, `computeCost`, `deriveTranscript`) is read.
- **Silently-swallowed error paths:** the totality `catch {}` blocks in `_capture.ts`/`forensics.ts` are intentional (documented totality contract — must never disturb teardown) and exercised by the no-throw / dangling-pointer tests.
- **External-state assumptions:** the home-global buffer and `CODEX_HOME` are resolved defensively with fallbacks; tests override `HOME`.
- **Spec-gap decisions:** the slug-recovery deviation was a real decision Build had to make; it is documented and tested. It introduces latent risks (Findings #1–#2) but none rise to a contract failure or a broken acceptance criterion.

No contract assertion is UNSATISFIED; no acceptance criterion is ❌; no regressions (count increased); no determinism/network/raw-body guardrail violations.

## Findings

- **Code — Worktree path prefix collision contaminates provenance:** `packages/cli/src/commands/work-proof.ts:51` (and `:67`, `:50`) — `recordBelongsToWorktree` matches with `record.cwd.startsWith(worktreePath)` / `transcript_path.includes(worktreePath)` with no trailing-slash boundary. For a worktree slug `feat`, a session from worktree `feat-2` (cwd `…/worktrees/feat-2/src`) returns `true` and is attributed to `feat`'s proof attestation. Confirmed empirically (`startsWith` → true; with `+ path.sep` boundary → false). This is the **same bug class** `deriveSurface` deliberately guards against four functions down in this very file (`:225`, trailing-slash prefix). A risk because provenance is meant to be a trustworthy dataset row — cross-slug contamination silently corrupts it. Fix: append `path.sep` before the prefix compare (and prefer an exact-or-under boundary for the `transcript_path.includes` check). Relates to A031.
- **Code — Unbounded home-global buffer scanned in full at every work-complete:** `packages/cli/src/commands/work-proof.ts:117` — `assembleProcessAttestation` reads `~/.ana/forensics/sessions.jsonl` (shared across ALL projects and sessions on the machine, never pruned in Phase 1) entirely, and for every record that doesn't match by slug it reads that record's *entire* transcript file end-to-end (`recordBelongsToWorktree:56`). Cost grows linearly with a developer's lifetime session count — a heavy user with thousands of buffered sessions pays a growing tax on each `ana work complete`. Provenance-only and best-effort, so not a correctness blocker, but worth a buffer-prune or a slug-indexed lookup before this scales. Relates to A031.
- **Code — Stale JSDoc contradicts the implemented behavior:** `packages/cli/src/commands/work-proof.ts:93` — the doc comment says "Among matching records the newest by `timestamp` wins (deterministic)," but the function keeps **all** matching sessions (build/verify/every rework cycle) in a sorted array. The doc describes the pre-deviation design; the next engineer reading it will be misled about how many sessions land in the attestation.
- **Upstream — Attestation shape deviates from the spec-2 mockup:** spec-2 (`Output Mockups`, lines 52-70) shows `process` as a single-session object (`derived`/`session_id`/`role` at the top level). The implementation uses `process.sessions[]` with work-item-level `outcome`/`task_shape`/`module_churn`. This is a human-approved deviation driven by the empty-slug recovery reality, and it stays contract-compatible (A031 only requires `entry.process` to exist; A032's `outcome.first_pass_verify` is still top-level). No action beyond acknowledging the spec mockup is now stale. Relates to A031, A032.
- **Test — AC12 no-network enforcement has a narrower scan than the AC phrasing:** `packages/cli/tests/commands/_capture.test.ts:156` scans `_capture.ts`/`forensics.ts`/`pricing.ts` for network imports — the derive/cost core. The full assembly path (`work-proof.ts assembleProcessAttestation`) is outside the scan. Source inspection confirms no network code anywhere on the path, so the guarantee holds; the gap is only in the regression *guard's* reach. Consider adding `work-proof.ts` to the scanned set.
- **Code — SessionEnd derive blocks on a synchronous full-transcript read before exit:** `packages/cli/src/commands/_capture.ts:208` — `executeDerive` awaits `deriveTranscript` (a `readFileSync` + per-line `JSON.parse` of the whole transcript) before `process.exit(0)`. The spec's intent is "async, never delays teardown"; the 250ms stdin cap bounds the *read-wait* but not the *derive* itself, so a very large finished transcript adds proportional latency to the hook. Low impact (the hook is its own process), recorded for awareness.
- **Code — `parseTestCounts` over-counts on prose:** `packages/cli/src/utils/forensics.ts:346` — matches the first `/(\d+)\s+passed/` in any Bash `tool_result`, so output that merely mentions "12 passed" in prose (not a test runner) inflates `tests_executed`/`failures_encountered`. Documented best-effort and provenance-only (never feeds a verdict), so the blast radius is a slightly untrustworthy metric, not a wrong decision. Acknowledged.

## Deployer Handoff

- Phase 2 completes the session-capture feature: deterministic transcript-derive, a versioned price table, `module_churn`, the optional `ProcessAttestation` proof attach, and the SessionEnd/Stop derive trigger. All 13 Phase-2 contract assertions are satisfied and all acceptance criteria pass (AC12 PARTIAL only in test-scan reach, not in behavior).
- **Know before merge:** `process` is an *optional* proof field — every existing proof entry without it renders unchanged, and capture-off projects produce byte-identical proofs to today. Nothing here gates the proof.
- **Two latent risks to schedule** (neither blocks this ship): the worktree-prefix collision (Finding #1, a real correctness bug for slugs that are prefixes of each other, e.g. `feat`/`feat-2`) and the unbounded home-global buffer scan (Finding #2, a scaling tax with no Phase-1 prune). Both are good first follow-ups.
- The implementation deviates from the spec mockup's attestation shape (single session → `sessions[]`); the deviation is documented in code and human-approved. Update the spec mockup and the stale JSDoc (Finding #3) when convenient.
- Pre-existing lint warning in `src/utils/git-operations.ts:198` is unrelated to this work.

## Verdict
**Shippable:** YES

All 13 Phase-2 contract assertions SATISFIED, all acceptance criteria pass (AC12 PARTIAL is a test-scan boundary, not a behavior gap), 3523 tests pass with zero failures (count up from the 3424 baseline), typecheck and lint clean. I read every new file and every tagged Phase-2 test, confirmed determinism by grep and by the double-derive tests, and empirically reproduced the one correctness bug I found. That bug (worktree prefix collision) and the unbounded-buffer scan are real and worth fixing, but they are latent provenance-quality issues on an optional, non-gating proof field — not contract failures and not regressions. I would stake my name on this shipping, with Findings #1 and #2 logged as the first follow-ups.
