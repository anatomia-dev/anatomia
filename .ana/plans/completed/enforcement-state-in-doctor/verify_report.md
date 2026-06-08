# Verify Report: Move enforcement-gate state from `ana work status` to `ana doctor`

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-08
**Spec:** .ana/plans/active/enforcement-state-in-doctor/spec.md
**Branch:** feature/enforcement-state-in-doctor

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../enforcement-state-in-doctor/contract.yaml
  Seal: INTACT (hash sha256:ef2bb3a014b8d31bfaa21baf7fd9c1889bdf49d68fd9f8654f1cc45567f1c6b3)
```

Contract seal **INTACT** — the contract was not modified since AnaPlan sealed it.

**Build:** PASS — `(cd packages/cli && pnpm run build)`, ESM build success.
**Tests:** 3587 passed, 0 failed, 2 skipped (sealed verify run). Baseline was 3573 passing / 2 skipped → +14 tests (doctor +11, config +3, work repurposed in place). Count did not decrease (AC8).
**Lint:** 0 errors, 1 warning. The single warning is an unused eslint-disable directive in `packages/cli/src/utils/git-operations.ts:198` — a file untouched by this build. Pre-existing, not a regression.

Sealed verify test marker:
```
<!-- ana:capture stage=verify slug=enforcement-state-in-doctor counts=3587p/0f/2s verdict=pass sha256=010a5d050b2963e5f03f387b4e4eecbda92db389b9d716f2891da9b04598598e -->
```

## Contract Compliance

| ID   | Says                                                              | Status       | Evidence |
|------|-------------------------------------------------------------------|--------------|----------|
| A001 | Pipeline status no longer announces capture-gate state            | ✅ SATISFIED | `work.test.ts:658,668,677` assert `not.toContain('Capture gate')` (3 cases: on, on-inactive, absent). Source: `printHumanReadable` print line deleted (`work.ts`). Live: `work status` grep for "Capture gate" → none. |
| A002 | `work status --json` drops `captureGate`                          | ✅ SATISFIED | `work.test.ts:687` asserts `Object.keys(parsed)` excludes `captureGate`. Source: field removed at all 3 JSON sites. Live: `captureGate in keys: False`. |
| A003 | `work status --json` drops `captureGateActive`                    | ✅ SATISFIED | `work.test.ts:688` asserts keys exclude `captureGateActive`. Live: `captureGateActive in keys: False`. |
| A004 | Status still reports artifact branch                              | ✅ SATISFIED | `work.test.ts:689` `expect(parsed.artifactBranch).toBeDefined()` (matcher=exists, contract-aligned). Live: `artifactBranch -> main`. |
| A005 | Doctor includes an enforcement dimension                          | ✅ SATISFIED | `doctor.test.ts:627` `toBeDefined()`. Source: `enforcement` added to `DoctorDimensions` (`doctor.ts:125`), wired in `runDoctor` (`:753,:771`). Live: JSON block present. |
| A006 | Gate `on` when on + test command resolves                         | ✅ SATISFIED | `doctor.test.ts:634` `toBe('on')`, fixture `{captureGate:'on'}` keeps default `commands.test` via spread → genuinely resolves. |
| A007 | Gate `on-inactive` when on but no command resolves                | ✅ SATISFIED | `doctor.test.ts:641` `toBe('on-inactive')`, fixture `{captureGate:'on',commands:{},surfaces:{}}` — spread replaces `commands` → genuinely no resolvable command. Distinct branch from A006. |
| A008 | Gate `off` when flag absent                                       | ✅ SATISFIED | `doctor.test.ts:648` `toBe('off')`. |
| A009 | Reports `process_capture` state                                   | ✅ SATISFIED | `doctor.test.ts:655` `toBe('on')` with `{processCapture:'on'}`. Live: `process_capture: on`. |
| A010 | Reports `process_capture_strict` state                            | ✅ SATISFIED | `doctor.test.ts:662` `toBe('on')` with `{processCaptureStrict:'on'}`. |
| A011 | Human dashboard renders Enforcement section                       | ✅ SATISFIED | `doctor.test.ts:78` `formatTerminalOutput` contains `Enforcement` + `test-evidence gate`. Live: gray `ℹ Enforcement` header rendered. |
| A012 | Human dashboard surfaces the inactive case                        | ✅ SATISFIED | `doctor.test.ts:87` output contains `inactive` with the on-inactive fixture. Source renders `on (inactive — no test command)`. |
| A013 | Enforcement status is `info`                                      | ✅ SATISFIED | `doctor.test.ts` `toBe('info')`. Source: `status: 'info'` literal type. Live: `"status": "info"`. |
| A014 | Configured enforcement never flips overall to fail                | ✅ SATISFIED | `doctor.test.ts` `expect(results.overall).toBe('pass')` with all 3 gates on. Live: `overall: pass`. |
| A015 | Enforcement dimension is never `fail`                             | ✅ SATISFIED | `doctor.test.ts` `.not.toBe('fail')` (matcher=not_equals, aligned). Structural: `enforcement` excluded from both `hasRed` (`doctor.ts:757`) and `redCount` (`:712`). |
| A016 | `config set captureGate` no longer warns                          | ✅ SATISFIED | `config.test.ts` `not.toContain('not a known ana.json field')`. Source: key added to `KNOWN_FIELDS` (`config.ts:60`). Live temp-project test: no warning. |
| A017 | `config set processCapture` no longer warns                       | ✅ SATISFIED | `config.test.ts` absence assertion. Source `config.ts:61`. Live: no warning. |
| A018 | `config set processCaptureStrict` no longer warns                 | ✅ SATISFIED | `config.test.ts` absence assertion. Source `config.ts:62`. Live: no warning. |

All 18 assertions SATISFIED. Every tagged test was read; matchers were compared to the contract (`equals`→`toBe`, `not_equals`→`.not.toBe`, `not_contains`→`.not.toContain`, `exists`→`toBeDefined`) — all method-matched.

## Independent Findings

**Predictions resolved (from Step 3):**
1. *Sentinel risk in A006/A007 fixtures* — **Not found.** I traced `createMinimalProject`: the default `ana.json` carries `commands.test` (line 44), spread at line 48. A006 (`{captureGate:'on'}`) keeps it → resolves → `on`. A007 (`{captureGate:'on',commands:{},surfaces:{}}`) — object spread *replaces* `commands` with `{}` → no resolvable command → `on-inactive`. The two fixtures exercise genuinely distinct branches; the passing suite (3587 green) confirms the active path actually resolves. The builder got this right.
2. *work.test.ts deleted rather than repurposed* — **Not found.** The `describe` block was converted in place (spec option b): 4 cases retitled to absence assertions, tags remapped A013→A001/A002/A003/A004, count held. The header comment documents the relocation.
3. *`status:'info'` leaked into hasRed/redCount* — **Not found.** Both arrays (`doctor.ts:757-760`, `:712-715`) inspect only `cli_version` and `scan_freshness`. Enforcement is structurally incapable of flipping the exit code.
4. *grep captureGate not fully zero in work.ts* — **Not found.** `grep -c captureGate work.ts` → 0. Import, StatusOutput fields, helper, print line, inline parse, and all 3 JSON sites removed.
5. *lastScanAt read damaged* — **Not found.** The `lastScanAt` inline read is intact; only the `captureGate` parse line was removed from the shared try/catch.

**Production-risk prediction:** import cycle from `doctor.ts → artifact.ts`. Checked — `artifact.ts` does not import `doctor.ts` (`grep doctor artifact.ts` → 0). No cycle; the straight import is clean and the live `doctor` command runs without `undefined`-at-load symptoms.

**Code quality:** doctor.ts mirrors `assessSurfaces` exactly — once-only null-guarded raw parse with all-off fallback, classify-then-return. The `EnforcementDimension.status` is typed as the literal `'info'` (not `DimensionStatus`), making "never fails" true by type. JSDoc present on the exported/`assessEnforcement` functions, `.js` import extension used, `import type` not needed (value import). No `any` — `Record<string, unknown>` for the raw parse. Pattern-compliant throughout.

**Over-building / YAGNI:** None. `formatTerminalOutput` is newly exported — used by the command action handler (`doctor.ts:824`) AND by A011/A012 tests. This is the testing-standards-sanctioned "exported for test access" pattern, not dead surface. `assessEnforcement` and `EnforcementDimension` are both wired and consumed. No unused exports, no extra parameters, no gold-plating.

**Live verification:** Ran the freshly-built `dist/index.js` for `doctor` (human + `--json`), `work status` (human + `--json`), and `config set` on all three keys in an isolated temp project. Output matches the spec mockups byte-for-intent (gray `ℹ` header, column-aligned sub-lines). No worktree config was mutated.

## AC Walkthrough

- **AC1** — `work status` human omits gate state: ✅ PASS (live grep → no "Capture gate" line; 3 unit cases).
- **AC2** — `work status --json` drops both fields (all 3 sites): ✅ PASS (live keys check + source: all 3 construction sites edited).
- **AC3** — `doctor` human shows Enforcement incl. inactive case: ✅ PASS (live render + A011/A012).
- **AC4** — `doctor --json` carries `enforcement` block: ✅ PASS (live JSON matches mockup shape).
- **AC5** — Enforcement never causes non-zero exit: ✅ PASS (excluded from `hasRed` and `redCount`; `status:'info'` by type; A013/A014/A015).
- **AC6** — `config set` no longer warns for the 3 keys: ✅ PASS (live temp-project test, all three clean; A016-A018).
- **AC7** — inline read drops `captureGate`, `lastScanAt`/scan-freshness unchanged: ✅ PASS (diff shows only the `captureGate` line removed; `lastScanAt` read + `checkScanFreshness` intact).
- **AC8** — test count does not decrease; gate tests repurposed; doctor covers new dimension incl. inactive: ✅ PASS (3573→3587, +14; work block converted in place; A007/A012 cover inactive).
- **grep captureGate work.ts → 0**: ✅ PASS.
- **isCaptureGateEnabled still exported from artifact.ts**: ✅ PASS (`artifact.ts:819`).
- **vitest + lint pass**: ✅ PASS (3587 pass; lint 0 errors, no unused-import error from the dropped `work.ts` import).

## Blockers

None. I specifically searched for: unused exports in the new code (both `assessEnforcement` and `formatTerminalOutput` have live call sites; `EnforcementDimension` is consumed); unused parameters (none added); error paths that swallow silently (the `assessEnforcement` catch deliberately returns all-off, matching `assessSurfaces`); external-state assumptions (the only assumption is `.ana/ana.json` readability, handled by the catch); import cycles (`artifact.ts` does not import `doctor.ts`); stray references to the removed JSON fields elsewhere in `src` (none — only the new owner files reference `captureGate`); and method mismatches between tests and contract matchers (none). Nothing qualifies as a blocker.

## Findings

- **Test — `assessEnforcement` parse-failure fallback untested:** `packages/cli/src/commands/doctor.ts:458` — the `try/catch` returns all-off when `ana.json` is missing or malformed, but every enforcement test uses `createMinimalProject`, which always writes a valid `ana.json`. The catch branch never executes under test. The spec's edge-case list explicitly names "absent `ana.json` → all-off, no crash," yet no test feeds that input. Low-risk (3-line fallback mirroring `assessSurfaces`), but the next engineer touching this assessor has no regression guard on the degradation path. *(debt / scope)*
- **Test — config A016-A018 are absence-only guards:** `packages/cli/tests/commands/config.test.ts:360` — each asserts only that `'not a known ana.json field'` is absent from stderr; none asserts the field was actually written to `ana.json`. They are contract-aligned (the contract matcher is `not_contains`) but would pass vacuously if the validation path ever short-circuited before reaching the warning. A follow-up `expect(written.captureGate).toBe('off')` would make them positive guards. *(observation / monitor)*
- **Code — `assessEnforcement` reads `ana.json` twice:** `packages/cli/src/commands/doctor.ts:453` — one raw inline parse plus a second read inside `isCaptureGateEnabled`. This is a deliberate, spec-documented tradeoff (reuse the canonical active-check rather than duplicate ~15 lines; doctor is a cold human-invoked path). Recorded only so it is revisited if `doctor` ever moves onto a hot path. *(observation / acknowledge)*
- **Upstream — resolves `retire-capture-self-arming-C3`:** `packages/cli/src/commands/work.ts:473` — that finding flagged `getWorkStatus` parsing `ana.json` twice (inline for `captureGate`/`lastScanAt`, then again inside `isCaptureGateEnabled` for `captureGateActive`). This build removes both the inline `captureGate` parse and the `isCaptureGateEnabled` call; `getWorkStatus` now reads `ana.json` once for `lastScanAt` only. The double-read is gone. *(observation / acknowledge — see `verify_data.yaml` `resolves`)*

## Deployer Handoff

- **Intentional breaking JSON change.** `work status --json` no longer emits `captureGate` or `captureGateActive`; `doctor --json` now carries `results.dimensions.enforcement`. I confirmed zero `templates/` consumers of the old fields (`grep -rn captureGate packages/cli/templates/` → 0) and no stray readers in `src`. Any external/automation consumer reading the old `work status` gate fields must migrate to `doctor --json`.
- `isCaptureGateEnabled` stays exported from `artifact.ts` (body unchanged); `doctor.ts` is now its consumer.
- Pre-existing lint warning in `git-operations.ts:198` is unrelated to this change.

## Verdict

**Shippable:** YES

All 18 contract assertions SATISFIED, all 8 acceptance criteria plus the three explicit grep/export/lint gates PASS, verified both by reading every changed file and by running the freshly-built CLI live. The build is a clean, pattern-faithful relocation: a pure deletion in `work.ts` (which also resolves a recorded double-read finding), a well-typed informational dimension in `doctor.ts` that cannot affect the exit code by construction, and a one-line `KNOWN_FIELDS` bug fix. Findings are minor (one real test-coverage gap on the parse-failure path, two test-robustness observations, one accepted-tradeoff note) and none block shipping. I would stake my name on this shipping to production.
