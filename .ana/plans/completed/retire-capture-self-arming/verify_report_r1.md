# Verify Report: Retire Capture-Gate Self-Arming — Drive the Gate from a Committed Config Flag

**Result:** FAIL
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

Tests: **3431 passed, 0 failed, 2 skipped** (3433 total; baseline 3421 → +12, exceeds the spec's ≥3424 floor). Build: **pass**. Lint: **pass** (0 errors; 3 pre-existing warnings in `git-operations.ts` and `website/components/hero/Hero.tsx` — neither in this changeset). Typecheck (`tsc --noEmit`): **pass**.

Independent test re-run sealed via `ana test --stage verify`: `✓ checkpoint counts: 3431 passed, 0 failed, 2 skipped (verdict: pass)`.

## Contract Compliance

All 17 assertions satisfied. A014 is satisfied by source inspection (no targeted test exists — see Findings).

| ID   | Says                                                                 | Status       | Evidence |
|------|----------------------------------------------------------------------|--------------|----------|
| A001 | Gate enabled + no valid evidence → blocked                           | ✅ SATISFIED | `capture-marker.test.ts:258,293` (enabled+failing validator / tampered → `blocked:true`); integration `artifact.test.ts:430` (gate on + no evidence → throws) |
| A002 | Gate enabled + valid sealed evidence → not blocked                   | ✅ SATISFIED | `capture-marker.test.ts:269` (`blocked:false`, no errors/warnings); integration `artifact.test.ts:439` (valid capture → not throw) |
| A003 | Gate off/unset → never blocked even with failing validator          | ✅ SATISFIED | `capture-marker.test.ts:211` (`enabled:false` → not blocked); `artifact.test.ts:448` (flag absent → not throw) |
| A004 | Enabled + abstaining counts → never block (only preservation blocks) | ✅ SATISFIED | `capture-marker.test.ts:280` (abstain counts, valid block → `blocked:false`) |
| A005 | Missing/malformed config → off, never throws                        | ✅ SATISFIED | `artifact.test.ts:477` — missing file AND malformed JSON both `not.toThrow()` and return `false` |
| A006 | Verify reports never gated, even when enabled                       | ✅ SATISFIED | `artifact.test.ts:456` (enableGate + verify-report save → not throw) |
| A007 | Non-build-report saves never gated, even when enabled               | ✅ SATISFIED | `artifact.test.ts:466` (enableGate + spec save → not throw) |
| A008 | Gate on + no resolvable test command → false                        | ✅ SATISFIED | `artifact.test.ts:490` (`captureGate:on`, empty commands+surfaces → `false`) |
| A009 | Gate on + surface-only test command → true (monorepo trap)          | ✅ SATISFIED | `artifact.test.ts:501` (surface-only `surfaces.cli.commands.test` → `true`); source `artifact.ts:786-794` iterates `Object.keys(surfaces)` |
| A010 | Fresh init turns the gate on                                        | ✅ SATISFIED | `init.test.ts:111` (`createAnaJson` returns + writes `captureGate:'on'`) |
| A011 | Re-init preserves explicit gate-off                                 | ✅ SATISFIED | `init.test.ts:745` (`preserveUserState` keeps `'off'` through merge) |
| A012 | Re-init absent → stays absent AND enablement reads off              | ✅ SATISFIED | `init.test.ts:779` — asserts both `not.toHaveProperty('captureGate')` AND `isCaptureGateEnabled === false` with a resolvable test command present (behavior-level guarantee) |
| A013 | Status shows the gate on/off state                                  | ✅ SATISFIED | `work.test.ts:654` (human "Capture gate: on", inactive state, "off", and `--json` parity); live-confirmed below |
| A014 | Verify report keeps its own sealed account                         | ✅ SATISFIED (source inspection) | `artifact.ts:1010` — verify-report branch calls `inlineReportCaptures` unconditionally (not gated); mechanism at `artifact.ts:786-803`. **No targeted `@ana A014` test exists** — see Findings. |
| A015 | Block message names the `ana test` fix                              | ✅ SATISFIED | `artifact.test.ts:534` truncated-capture test asserts message contains `ana test` |
| A016 | Block message names how to disable (`captureGate`)                  | ✅ SATISFIED | `artifact.test.ts:534` asserts message contains `captureGate` |
| A017 | Block message states the REAL reason (dynamic, not canned)          | ✅ SATISFIED | `artifact.test.ts:534` truncated fixture asserts `truncated` — the word appears in NONE of the static message lines, only in the dynamic `gate.errors` loop, so a hardcoded string cannot satisfy it |

## Independent Findings

The cut is clean and disciplined — this is a strong build. The arming machinery (`capture-state.ts`, `isArmed`, `armCapture`, `armAfterValidBuildReport`, the `CaptureGateOutcome` interface, both `buildReportOutcome` vars, the one-time "armed" message) is fully excised; the AC1 reference sweep over `src/` and `tests/` for `isArmed`/`armCapture`/`capture.json`/`wasArmed`/`armedAt`/`CaptureGateOutcome`/`capture-state` returns **zero** hits. `evaluateCaptureGate`'s block logic is byte-identical — only the `armed → enabled` input renamed (`capture-marker.ts`). The dynamic `for (const err of gate.errors)` loop is preserved, with both the `ana test` fix line and the new `captureGate: "off"` disable line added.

**Predictions (Step 3) — all five "shortcut" predictions were refuted:**
1. *Surface-only carve-out mis-iterated* — refuted. `isCaptureGateEnabled` (`artifact.ts:786-794`) checks top-level first, then iterates `Object.keys(surfaces ?? {})`, returning `true` on any hit. `surfaces` survives `AnaJsonSchema.parse` because the schema both declares `surfaces` and is `.passthrough()`. A009 exercises the real function.
2. *A leftover arm call at one of the two sites* — refuted. Both `saveArtifact` (~1189) and `saveAllArtifacts` (~1614) arm sites removed; both `applyCaptureGate` calls are now bare.
3. *Block message collapsed to a hardcoded reason* — refuted. The dynamic loop is intact and A017's truncation fixture proves it.
4. *A012 asserts only field-absence* — refuted. It also asserts `isCaptureGateEnabled === false` with a resolvable test command present, isolating the absent flag as the sole cause.
5. *"Inactive — no test command" third status state missing* — refuted. Implemented in `formatCaptureGateState` (`work.ts`), tested (`work.test.ts`), and the `captureGateActive` boolean carries the distinction into JSON.

**Production-risk prediction:** a malformed `ana.json` throwing on every save. Refuted — `isCaptureGateEnabled` wraps the read+parse in try/catch → `false` (A005 covers both missing and malformed).

**Surprises (not predicted):** (a) AC15's CHANGELOG entry-removal was dropped — see Blockers; (b) the A014 assertion that was *created specifically to bind the verify-report sealed account to a passing test* has no test; (c) a stale gitignored `capture.json` lingers in the dogfood worktree.

## AC Walkthrough

- **AC1** — ✅ PASS. `capture-state.ts` + its test deleted; reference sweep over `src/`+`tests/` returns zero hits for all forbidden symbols.
- **AC2** — ✅ PASS. Gate block logic byte-identical (`capture-marker.ts` diff: only `armed→enabled`); A001–A004 confirm counts/verdict never block.
- **AC3** — ✅ PASS. Enablement driven by committed `captureGate` (`isCaptureGateEnabled`); A003/A005/A008 confirm off/absent/malformed → warn-mode.
- **AC4** — ✅ PASS. `createAnaJson` writes `captureGate:'on'` unconditionally (`state.ts:569`; A010).
- **AC5** — ✅ PASS. `preserveUserState` unchanged; spread preserves explicit on/off, override list excludes the field (A011/A012).
- **AC6** — ✅ PASS. Flag on + no resolvable command → `false` (A008).
- **AC7** — ✅ PASS. Block message names `ana test` AND `captureGate` AND the real validator reason (A015/A016/A017).
- **AC8** — ✅ PASS. Verify + non-build saves never gated (A006/A007; `artifact.ts:1010` inlines but does not gate).
- **AC9** — ⚠️ PARTIAL. Gate behavior re-expressed in config terms in the new sealed contract; the completed `captured-test-evidence` contract is untouched. **But** the clause "every retained assertion backed by a passing, targeted test" is not fully met: **A014 has no targeted test** (verified by source inspection only). 16 of 17 assertions are test-backed.
- **AC10** — ✅ PASS (with hygiene finding). Dogfood `.ana/ana.json` has `captureGate:"on"`; live `captureGateActive:true` + the A001 integration test confirm a no-evidence dogfood build-report save would block. The current code creates no `capture.json` by any path (source-verified). A stale gitignored `.ana/state/capture.json` from mid-build iteration remains in the worktree — inert and non-shipping (the new code never reads or writes it), but see Findings.
- **AC11** — ✅ PASS. Live `ana work status` prints `Capture gate: on`; `--json` emits `captureGate` + `captureGateActive` (A013).
- **AC12** — ✅ PASS. `configurability.mdx` adds the settings card, example JSON, user-fields list entry, and a net-new behavior paragraph (apostrophes escaped).
- **AC13** — ✅ PASS. `project-context.md` lines ~86 and ~123 rewritten — no longer claim agent defs/CLAUDE.md are "kept as-is"/"skipped if they exist".
- **AC14** — N/A (dropped in the spec: editing the frozen completed `captured-test-evidence` artifact is itself an immutability violation; superseded by the new contract).
- **AC15** — ❌ FAIL. Footer compare link corrected to `v1.2.2...HEAD`, **but** the premature `### Changed` "Re-init now propagates agent template updates" entry under `## [Unreleased]` was **not removed** — `CHANGELOG.md:8-12` on HEAD is byte-identical to `main`. Only one of the two required edits was made.
- **AC16** — ✅ PASS. Build, full CLI suite (3433 ≥ 3424), lint (0 errors), and typecheck all green; test count increased by 12.

## Blockers

**AC15 — the premature `[Unreleased]` CHANGELOG entry was not removed.** The spec required two CHANGELOG edits; only the footer-link correction was made. The `### Changed` block describing "Re-init now propagates agent template updates" still sits under `## [Unreleased]` (`CHANGELOG.md:10-12`), unchanged from `main`. AC15's purpose is to keep the published changelog reflecting only what ships to npm (1.2.2) — merging as-is publishes an unreleased-feature note prematurely, which is exactly the harm the criterion guards against. This is a clear, binary, stated deliverable that was half-completed, with a concrete downstream consequence — not a judgment call. The fix is one edit: delete the `### Changed` heading and its bullet, retaining the empty `## [Unreleased]` header.

What was searched and cleared as NOT a blocker: forbidden-symbol references (zero), both gate call/arm sites (both clean), the surface-only carve-out (correct), undefined-safe config reads (try/catch → false), the dynamic block message (loop intact, proven by A017), test-count regression (+12), build/lint/typecheck (all green), and the dogfood block path (live `captureGateActive:true`).

## Findings

- **Code — AC15 CHANGELOG entry not removed (BLOCKER):** `CHANGELOG.md:10` — the `### Changed` "Re-init now propagates agent template updates" bullet under `## [Unreleased]` is unchanged from `main`. The footer-link half of AC15 was done; this half was dropped. Delete the heading + bullet, keep the empty `## [Unreleased]` header. Ships premature unreleased content to the published changelog if merged.
- **Test — A014 has no targeted test:** `packages/cli/src/commands/artifact.ts:1010` — A014 ("a verify report keeps its own sealed account") was created specifically (spec OQ6) to bind the verify-report sealed account to a passing assertion and close the prior captured-test-evidence Build concern. The behavior is present and source-verifiable (`inlineReportCaptures` is called unconditionally in the verify branch), and the underlying mechanism is exercised by the build-report path and `capture-marker.test.ts`. But no `@ana A014` test exists in this contract's changed files — a future refactor removing line 1010 would not be caught by this contract's suite. Add a test that saves a verify report carrying a capture marker and asserts the sealed block is inlined into `verify_report.md`. This is what makes AC9 only PARTIAL.
- **Code — `getWorkStatus` reads ana.json twice:** `packages/cli/src/commands/work.ts:500` — the inline `readFileSync`+`JSON.parse` for `lastScanAt`/`captureGate`, then `isCaptureGateEnabled(projectRoot)` re-reads and re-parses the same file for `captureGateActive`. Harmless (status is not hot-path) but two reads of one file; could thread the parsed object through.
- **Code — stale `capture.json` in dogfood worktree:** `.ana/state/capture.json` (`armed:true`, `armedAt 01:57`) — a mid-build leftover, gitignored and untracked, predating the final build-report save (02:26). The HEAD code provably cannot create it (`armCapture` deleted) or read it (`isArmed` deleted), so it is inert and never ships. Recommend `rm .ana/state/capture.json` in the worktree for hygiene; harmless if left.
- **Upstream — arming proof findings dissolved:** retiring self-arming deletes `isArmed` (dissolving `captured-test-evidence-C10`, the double `isArmed` read) and the `valid`/`CaptureGateOutcome` predicate (dissolving `captured-test-evidence-C11`, the `warnings.length` proxy). Recorded as a structured `resolves` claim in `verify_data.yaml` for the proof chain.

## Deployer Handoff

This is one trivial fix away from shipping. The substantive engineering — excising self-arming, re-pointing enablement to the committed `captureGate` flag, the surface-only carve-out, the dynamic block message, init/re-init preservation, and the status readout — is correct, well-tested (3433 passing), and dogfood-enabled. The blocker is a single dropped CHANGELOG deletion (AC15). Before re-verify the builder should also add the missing A014 test (closes AC9). The stale `.ana/state/capture.json` in the worktree is gitignored and will not be committed; delete it for cleanliness. Once `captureGate: "on"` reaches `main`, this repo's own no-evidence build-report saves will block — that is intended (the dogfood release gate).

## Verdict

**Shippable:** NO

The implementation is excellent and the contract is fully satisfied (17/17), but two acceptance criteria are not met: AC15 (a required CHANGELOG edit was dropped — a concrete published-output defect) is a ❌, and AC9 is ⚠️ PARTIAL because A014 lacks a targeted test. Both are small and quickly fixable, but AC15 is a clear, binary deliverable miss with a real downstream consequence — I would not stake my name on this shipping with a premature unreleased entry in the published changelog. Back to AnaBuild: remove the `## [Unreleased]` `### Changed` entry (retain the empty header) and add the A014 verify-report-sealed-account test.