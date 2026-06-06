# Verify Report: Retire Capture-Gate Self-Arming — Drive the Gate from a Committed Config Flag

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-06
**Spec:** .ana/plans/active/retire-capture-self-arming/spec.md
**Branch:** feature/retire-capture-self-arming

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../retire-capture-self-arming/contract.yaml
  Seal: INTACT (hash sha256:798f64a1fe5a648bb312fe5aebcebbf73b0766e3ddb3c7d02a93d85674fe60dd)
```

Seal status: **INTACT** — contract unmodified since the planner sealed it.

Tests: **3432 passed, 0 failed, 2 skipped** (3434 total; baseline 3421 → +13, exceeds the spec's ≥3424 floor; +1 vs the prior verify's 3431, the net of the new A014 test). Build: **pass**. Lint: **pass** (0 errors; 3 pre-existing warnings — `git-operations.ts:198`, `Hero.tsx:3,16` — none in this changeset). Typecheck (`tsc --noEmit`): **pass** (exit 0).

Independent test re-run sealed via `ana test --stage verify`: `✓ checkpoint counts: 3432 passed, 0 failed, 2 skipped (verdict: pass)`.

This is a **re-verification**. The prior verify FAILED on two items: AC15 (CHANGELOG entry) and AC9 PARTIAL (A014 had no targeted test). Both are addressed below; I ran the full verification fresh rather than trusting the prior PASS rows.

## Contract Compliance

All 17 assertions satisfied. Every assertion is now backed by a passing, tagged test — A014's source-only gap from the prior round is closed.

| ID   | Says                                                                 | Status       | Evidence |
|------|----------------------------------------------------------------------|--------------|----------|
| A001 | Gate enabled + no valid evidence → blocked                           | ✅ SATISFIED | `capture-marker.test.ts` (`{enabled:true}`+failing validator → `blocked:true`); integration `artifact.test.ts` (gate on + no evidence → throws); source `artifact.ts:826-837` |
| A002 | Gate enabled + valid sealed evidence → not blocked                   | ✅ SATISFIED | `capture-marker.test.ts` (`{enabled:true}` clean → `blocked:false`); `capture-marker.ts:469-472` |
| A003 | Gate off/unset → never blocked even with failing validator          | ✅ SATISFIED | `capture-marker.test.ts` (`{enabled:false}` → not blocked); `artifact.ts:771` (`captureGate !== 'on'` → false) |
| A004 | Enabled + abstaining counts → never block (only preservation blocks) | ✅ SATISFIED | `capture-marker.test.ts` (abstain counts + valid → `blocked:false`); gate loops only the 3 preservation validators (`capture-marker.ts:465-468`) |
| A005 | Missing/malformed config → off, never throws                        | ✅ SATISFIED | `artifact.test.ts` (absent + malformed → false, no throw); source `artifact.ts:762-769` try/catch → false |
| A006 | Verify reports never gated, even when enabled                       | ✅ SATISFIED | `artifact.test.ts` (gate on + verify save → not throw); source `artifact.ts:1005-1010` verify branch calls `inlineReportCaptures` only, never `applyCaptureGate` |
| A007 | Non-build-report saves never gated, even when enabled               | ✅ SATISFIED | `artifact.test.ts` (gate on + spec save → not throw); source: only `build-report` branch (`artifact.ts:1035-1045`) calls `applyCaptureGate` |
| A008 | Gate on + no resolvable test command → false                        | ✅ SATISFIED | `artifact.test.ts` (`captureGate:on`, empty commands+surfaces → false); source `artifact.ts:775-780` |
| A009 | Gate on + surface-only test command → true (monorepo trap)          | ✅ SATISFIED | `artifact.test.ts` (surface-only `surfaces.cli.commands.test` → true); source `artifact.ts:776-779` iterates `Object.keys(surfaces ?? {})` |
| A010 | Fresh init turns the gate on                                        | ✅ SATISFIED | `init.test.ts` (`createAnaJson` writes `captureGate:'on'`); source `state.ts:569` |
| A011 | Re-init preserves explicit gate-off                                 | ✅ SATISFIED | `init.test.ts` (`preserveUserState` keeps `'off'`); source `state.ts:732` `...parsed.data` spread, field excluded from override list |
| A012 | Re-init absent → stays absent AND enablement reads off              | ✅ SATISFIED | `init.test.ts` — asserts both field-absence AND `isCaptureGateEnabled === false` with a resolvable test command present (behavior-level) |
| A013 | Status shows the gate on/off state                                  | ✅ SATISFIED | `work.test.ts` (human "Capture gate:" line, `--json` parity); source `work.ts:340-346` `formatCaptureGateState` (3 states); live-confirmed below |
| A014 | Verify report keeps its own sealed account                         | ✅ SATISFIED | **NEW** `artifact.test.ts:469` (`@ana A014`) — saves a verify report with a bare marker (gate ON), asserts saved `verify_report.md` contains `ana:capture-begin`/`-end`, the real `sha256=…`, AND the verbatim bytes `Tests 5 passed (5)` absent before the save; source `artifact.ts:1010` |
| A015 | Block message names the `ana test` fix                              | ✅ SATISFIED | `artifact.test.ts` truncated-capture test asserts message contains `ana test`; source `artifact.ts:835` |
| A016 | Block message names how to disable (`captureGate`)                  | ✅ SATISFIED | `artifact.test.ts` asserts message contains `captureGate`; source `artifact.ts:836` |
| A017 | Block message states the REAL reason (dynamic, not canned)          | ✅ SATISFIED | `artifact.test.ts` truncated fixture asserts `truncated` — that word appears in NONE of the static message lines, only the dynamic `for (const err of gate.errors)` loop (`artifact.ts:832-834`), so a hardcoded string cannot satisfy it |

## Independent Findings

The cut remains clean and disciplined, and the two prior-round defects are resolved. The arming machinery is fully excised: the AC1 reference sweep over `packages/cli/src` and `packages/cli/tests` for `isArmed`/`armCapture`/`capture.json`/`wasArmed`/`armedAt`/`CaptureGateOutcome`/`capture-state`/`armAfterValidBuildReport` returns **zero** hits, and both `capture-state.ts` and its test are gone. `evaluateCaptureGate`'s block logic is byte-identical save the renamed input (`armed → enabled`, `capture-marker.ts:463-472`). The dynamic `gate.errors` loop is intact with both the `ana test` fix line and the `captureGate: "off"` disable line.

**Predictions (Step 3):**
1. *The new A014 test is a sentinel (asserts truthy without checking the real seal)* — **refuted**. It asserts the begin/end delimiters, the actual computed `sha256`, AND verbatim captured bytes that were provably absent from the report before the save. It runs with the gate ON, proving the seal is unconditional. A genuine behavioral test.
2. *The `getWorkStatus` double-read persists (builder left the monitor-severity finding)* — **confirmed**. Still two reads of `ana.json` per status call (`work.ts:~500` inline, then `isCaptureGateEnabled` at `~515`). Unchanged; non-blocking.
3. *The stale `capture.json` still lingers* — **confirmed, with a sharper diagnosis** (see Surprises).

**Production-risk prediction:** malformed `ana.json` throwing on every save. Refuted — `isCaptureGateEnabled` wraps read+parse in try/catch → false (A005 covers absent and malformed).

**Surprises (not predicted):** the stale `.ana/state/capture.json` carries `armedAt: 2026-06-06T17:50:09Z` — i.e. **11:50 MDT, ~1 minute before this review**, not a mid-build leftover. The current source provably cannot write it (zero references). It is the **globally-installed, pre-merge `ana` binary** (still self-arming) re-creating the file whenever the pipeline invokes `ana` — the arm fires on my `ana test` run. Gitignored, untracked, non-shipping, inert under the new code; it stops once this change is the published binary. This is a toolchain artifact, not a build defect.

## Previous Findings Resolution

### Previously UNSATISFIED Assertions

The prior round marked all 17 contract assertions SATISFIED (A014 by source inspection only). No assertion was UNSATISFIED. The A014 source-only gap — which made the prior AC9 ⚠️ PARTIAL — is now closed by a targeted test:

| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A014 | SATISFIED by source inspection only; no `@ana A014` test existed (made AC9 PARTIAL) | ✅ SATISFIED | New `@ana A014` test at `artifact.test.ts:469` asserts the verify report's sealed block (delimiters + real sha256 + verbatim bytes) is inlined with the gate ON |

### Previous Findings

| Finding | Status | Notes |
|---------|--------|-------|
| AC15 CHANGELOG `[Unreleased]` entry not removed (prior BLOCKER) | No longer applicable | Founder confirmed during this verify that the note stays (commit 9c787fa2, "founder decision"). Authorized spec deviation, not a defect — footer link is correct (`v1.2.2...HEAD`). |
| A014 has no targeted test | Fixed | New `@ana A014` test added (`ba9bcfa6`); closes AC9. |
| `getWorkStatus` reads ana.json twice | Still present | `work.ts:~500` + `~515`. Monitor-severity; cold-path; not a FAIL item. |
| Stale `capture.json` in dogfood worktree | Still present | Re-diagnosed: written by the pre-merge installed `ana` binary, not by this build (zero source refs). Gitignored, non-shipping, inert. |
| Upstream: arming proof findings dissolved (C10/C11) | Still applicable | Recorded as a `resolves` claim in `verify_data.yaml`. |

## AC Walkthrough

- **AC1** — ✅ PASS. `capture-state.ts` + its test deleted; reference sweep over `src/`+`tests/` returns zero hits for all forbidden symbols.
- **AC2** — ✅ PASS. Gate block logic byte-identical (`capture-marker.ts`: only `armed→enabled`); A001–A004 confirm counts/verdict never block.
- **AC3** — ✅ PASS. Enablement driven by committed `captureGate` (`isCaptureGateEnabled`, `artifact.ts:771`); A003/A005/A008 cover off/absent/malformed → warn-mode.
- **AC4** — ✅ PASS. `createAnaJson` writes `captureGate:'on'` unconditionally (`state.ts:569`; A010).
- **AC5** — ✅ PASS. `preserveUserState` spread preserves explicit on/off; override list excludes the field (`state.ts:728-738`; A011/A012).
- **AC6** — ✅ PASS. Flag on + no resolvable command → false (A008; `artifact.ts:775-780`).
- **AC7** — ✅ PASS. Block message names `ana test` AND `captureGate` AND the real validator reason (A015/A016/A017; `artifact.ts:829-837`).
- **AC8** — ✅ PASS. Verify + non-build saves never gated (A006/A007; verify branch inlines but does not gate at `artifact.ts:1010`/`1416`).
- **AC9** — ✅ PASS. Gate behavior re-expressed in config terms in the new sealed contract; the completed `captured-test-evidence` contract is untouched. **All 17 assertions are now backed by a passing, targeted test** — the prior A014 gap that held this to PARTIAL is closed.
- **AC10** — ✅ PASS. Dogfood `.ana/ana.json` has `captureGate:"on"`; live built-dist `work status --json` shows `captureGateActive:true`, so a no-evidence build-report save in this repo would block. The new code creates no `capture.json` by any path (source-verified zero refs); the lingering gitignored file is from the pre-merge installed binary (see Findings) and does not ship.
- **AC11** — ✅ PASS. Live built-dist `work status` prints `Capture gate: on`; `--json` emits `captureGate:"on"` + `captureGateActive:true` (A013). Verified against the freshly-built `packages/cli/dist`, not the stale installed binary.
- **AC12** — ✅ PASS. `configurability.mdx` adds the settings card, example JSON (`"captureGate": "on"`), the user-fields list entry, and a net-new behavior paragraph (apostrophes escaped as `&quot;`).
- **AC13** — ✅ PASS. `project-context.md` lines ~86 and ~123 rewritten — no longer claim agent defs/CLAUDE.md are "kept as-is"/"skipped if they exist"; now describe template propagation (consistent with the retained CHANGELOG note).
- **AC14** — N/A (dropped in the spec: editing the frozen completed `captured-test-evidence` artifact is itself an immutability violation; superseded by the new contract).
- **AC15** — ⚠️ PARTIAL → **accepted (authorized deviation).** Footer compare link corrected to `v1.2.2...HEAD` ✅. The spec's other clause — remove the premature `### Changed` `[Unreleased]` entry — was **deliberately not done**: commit `9c787fa2` ("Restore CHANGELOG [Unreleased] note (founder decision)") keeps it, and the founder **confirmed during this verify** that the note stays. The note documents the same template-propagation behavior the AC13 `project-context.md` edit describes, so retaining it is internally coherent. The spec is the stale party here, not the code. Not a shipping blocker.
- **AC16** — ✅ PASS. Build, full CLI suite (3434 ≥ 3424), lint (0 errors), and typecheck all green; test count increased by 13.

## Blockers

**None.** What was searched and cleared: forbidden-symbol references (zero hits over `src/`+`tests/`); both gate call sites and both former arm sites (arm sites gone, both `applyCaptureGate` calls bare); the surface-only carve-out (iterates `Object.keys(surfaces ?? {})`, correct); undefined-safe config reads (try/catch → false, A005); the dynamic block message (loop intact, proven by A017's truncated fixture); the new A014 test (genuine seal assertion, not a sentinel); test-count regression (+13, none missing); build/lint/typecheck (all green); and the dogfood block path (live `captureGateActive:true`). The single spec-vs-code tension (AC15 CHANGELOG) is a founder-confirmed authorized deviation, not a defect.

## Findings

- **Upstream — AC15 spec/founder conflict, resolved:** `CHANGELOG.md:10` — spec AC15 said remove the `### Changed` `[Unreleased]` template-propagation note; the founder decided to keep it (commit `9c787fa2`) and confirmed it during this verify. Footer link corrected to `v1.2.2...HEAD`. Authorized spec deviation; the note documents the same behavior the AC13 `project-context.md` edit ships. No action — recorded so the next cycle knows the spec, not the code, was the stale party.
- **Test — A014 now has a genuine targeted test:** `packages/cli/tests/commands/artifact.test.ts:469` — closes the prior round's source-only gap. Saves a verify report with a bare marker under gate-ON and asserts the saved file gains the begin/end delimiters, the real `sha256`, and the verbatim captured bytes that were absent pre-save. A future refactor dropping `inlineReportCaptures` from the verify branch (`artifact.ts:1010`) would now be caught. Not a sentinel.
- **Code — `getWorkStatus` reads ana.json twice:** `packages/cli/src/commands/work.ts:500` — inline `readFileSync`+`JSON.parse` for `lastScanAt`/`captureGate`, then `isCaptureGateEnabled(projectRoot)` re-reads and `AnaJsonSchema.parse`s the same file for `captureGateActive`. Harmless (status is cold-path) but two reads of one file; could thread the parsed object through. Unchanged since prior verify.
- **Code — stale gitignored `capture.json` reappears, from the installed binary:** `.ana/state/capture.json` (`armed:true`, `armedAt 2026-06-06T17:50:09Z`) — NOT written by this build (zero source refs to `capture.json`/`armCapture`/`isArmed`). The pre-merge installed `ana` binary (still self-arming) re-creates it on every pipeline `ana` invocation; the timestamp matches this session's `ana test`. Gitignored, untracked, non-shipping, inert under the new code. Resolves once this change is the published binary. `rm .ana/state/capture.json` for worktree hygiene.
- **Upstream — arming proof findings dissolved:** retiring self-arming deletes `isArmed` (dissolving `captured-test-evidence-C10`, the double `isArmed` read) and the `valid`/`CaptureGateOutcome` predicate (dissolving `captured-test-evidence-C11`, the `warnings.length` proxy). The C9 block-message reassurance ("`ana test` seals a harmless abstain even when no tests run") is preserved in config terms (`artifact.ts:835`). Recorded as a structured `resolves` claim in `verify_data.yaml`.

## Deployer Handoff

This is shippable. The substantive engineering — excising self-arming, re-pointing enablement to the committed `captureGate` flag, the surface-only carve-out, the dynamic block message, init/re-init preservation, and the status readout — is correct, well-tested (3434 passing, all 17 assertions test-backed), and dogfood-enabled (live `captureGateActive:true`).

Two things to know:
1. **AC15 / CHANGELOG is an authorized deviation.** The spec said remove the `[Unreleased]` note; you confirmed during verify that it stays. The spec text is now the stale party — no code action needed, but the spec/scope record carries an intentional divergence.
2. **Once `captureGate: "on"` reaches `main`** and the binary republishes, this repo's own no-evidence build-report saves will block — intended (the dogfood release gate). The gitignored `.ana/state/capture.json` left by the current installed binary will stop being created at that point; delete it in the worktree for cleanliness (it never ships).

## Verdict

**Shippable:** YES

All 17 contract assertions are satisfied with passing, targeted tests — including A014, whose prior source-only gap (the sole reason AC9 was PARTIAL last round) is now closed by a genuine seal-asserting test. Build, full suite (3434 ≥ 3424), lint, and typecheck are green; the AC1 forbidden-symbol sweep is clean; the dogfood gate is live. The one spec-vs-code tension — AC15's retained CHANGELOG note — is a founder-confirmed authorized deviation, not a defect. I would stake my name on this shipping.
