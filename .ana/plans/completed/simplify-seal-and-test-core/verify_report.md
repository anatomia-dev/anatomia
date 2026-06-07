# Verify Report: Simplify `ana test` to its load-bearing core (deterministic seal)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-07
**Spec:** .ana/plans/active/simplify-seal-and-test-core/spec.md
**Branch:** feature/simplify-seal-and-test-core

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .../simplify-seal-and-test-core/contract.yaml
  Seal: INTACT (hash sha256:c740b894512d8184eefa264540093ffe64e15f27866439731eaf8db68782cc92)
```

Seal status: **INTACT** — the contract was not modified after sealing.

**Build:** `(cd packages/cli && pnpm run build)` → success (ESM build, 36ms).
**Tests:** `(cd packages/cli && pnpm vitest run)` → **138 files, 3424 passed, 0 failed, 2 skipped (3426 total)**. Baseline was 3429 passed / 2 skipped (3431); net −5 is within the spec's expected delta (removed-machinery tests gone, canonical/idempotency tests added).
**Lint:** `(cd packages/cli && pnpm run lint)` → **0 errors, 1 warning**. The warning is an unused eslint-disable in `git-operations.ts:198`, a file **outside this diff** — pre-existing, not a regression.

Independent sealed verify re-run marker (`ana test --stage verify --slug simplify-seal-and-test-core`):
```
<!-- ana:capture stage=verify slug=simplify-seal-and-test-core counts=3424p/0f/2s verdict=pass sha256=d0abfca83d961c7b0577a7749db0b0a42f246d88e755ecba7de73e860941f3f6 bytes=1048750 lines=207 -->
```
Note: this marker carries `bytes=`/`lines=` because it was minted by the **globally-installed** `ana` (the released v1.2.2), not the worktree's rebuilt artifact. The verify report is never gated, so this is informational. I verified the *new* format directly against the rebuilt `dist/` (see Independent Findings → Live Testing).

## Contract Compliance

| ID   | Says                                                              | Status       | Evidence |
|------|------------------------------------------------------------------|--------------|----------|
| A001 | Seal built from a fixed, predictable result summary              | ✅ SATISFIED | `capture-marker.test.ts:68` asserts `canonicalCaptureString` `toBe` the exact literal `stage=build\nslug=demo\ncounts=47p/0f/2s\nverdict=pass`; impl `capture-marker.ts:105-107` |
| A002 | Same result always produces the same seal                        | ✅ SATISFIED | `capture-marker.test.ts:73` `seal() toBe seal()` (byte-identical); confirmed live (two runs, identical sha256) |
| A003 | Fingerprint recomputes from the reported result                  | ✅ SATISFIED | `capture-marker.test.ts:79` parses then recomputes `captureSha` from parsed fields; impl `captureSha` `capture-marker.ts:118-120` |
| A004 | Different result → different fingerprint                         | ✅ SATISFIED | `capture-marker.test.ts:88` `not.toBe` for both changed verdict AND changed counts |
| A005 | Seal no longer reports raw-output byte counts                    | ✅ SATISFIED | `capture-marker.test.ts:108` `not.toContain('bytes=')`; `formatMarker` `capture-marker.ts:130-140` emits no bytes |
| A006 | Seal no longer reports a raw-output line total                   | ✅ SATISFIED | `capture-marker.test.ts:108` `not.toContain('lines=')`; `formatMarker` emits no lines |
| A007 | Seal still carries stage/slug/counts/verdict/fingerprint         | ✅ SATISFIED | `capture-marker.test.ts:115-121` asserts all five incl. `verdict=pass` |
| A008 | Well-formed new seal recognized as a real seal                  | ✅ SATISFIED | `capture-marker.test.ts:131` `parseMarkers(...).toHaveLength(1)`; parser `capture-marker.ts:162-191` |
| A009 | Malformed-fingerprint seal rejected                             | ✅ SATISFIED | `capture-marker.test.ts:143` (non-hex placeholder) and `:165` (uppercase + short hex) → length 0; `HEX64` guard `capture-marker.ts:186` |
| A010 | Seal missing fingerprint rejected                              | ✅ SATISFIED | `capture-marker.test.ts:159` no-sha256 marker → length 0; guard `capture-marker.ts:185-186` |
| A011 | Passing run still produces a sealed result                     | ✅ SATISFIED | `test-command.test.ts:99` asserts compact marker + `verdict=pass` + exit 0; confirmed live |
| A012 | Failing run reports a test failure (exit 1), not a capture error| ✅ SATISFIED | `test-command.test.ts:156` `outcome.exitCode toBe(1)`, `verdict=fail`; impl `test.ts:209` |
| A013 | Shell-needing command refused as capture error (exit 3)         | ✅ SATISFIED | `test-command.test.ts:168` real `\| tee` command → `CAPTURE_ERROR_EXIT`; confirmed live (exit 3) |
| A014 | No surface named → top-level command used                      | ✅ SATISFIED | `test-command.test.ts:50` asserts `{command,source}`; impl `resolveTestCommandString` `test.ts:103-119` |
| A015 | Verify seals a verify-stage result even when a surface is named | ✅ SATISFIED | `test-command.test.ts:193` — surface command is a bogus binary (ENOENT if used); top-level runs clean → proves `--surface` ignored; impl `test.ts:170` |
| A016 | Build agents drop the checkpoint-wrapping instruction           | ✅ SATISFIED | `template-capture-instruction.test.ts:39` `not.toContain('-- {checkpoint command')`; grep across all 8 defs → none |
| A017 | Build agents keep the final build-seal instruction              | ✅ SATISFIED | `template-capture-instruction.test.ts:38` `toContain('ana test --stage build --slug')`; present in all 4 build defs |
| A018 | Verify agents keep the full independent re-run instruction      | ✅ SATISFIED | `template-capture-instruction.test.ts:50` `toContain('ana test --stage verify --slug')`; present in all 4 verify defs |
| A019 | Verify agents drop the focused-checkpoint form                  | ✅ SATISFIED | `template-capture-instruction.test.ts:51` `not.toContain('-- {checkpoint command')` |
| A020 | Agent seal descriptions drop byte/line totals                  | ✅ SATISFIED | `template-capture-instruction.test.ts:41` `not.toContain('byte/line totals')`; grep across all defs → none |
| A021 | Shipped & in-repo Codex build agent identical                  | ✅ SATISFIED | `codex-learn-template.test.ts:66` loops `CODEX_AGENT_FILES` (incl. `ana-build.md`) `toBe` template; `diff` confirms identical |
| A022 | Shipped & in-repo Codex verify agent identical                 | ✅ SATISFIED | same loop covers `ana-verify.md`; `diff` confirms identical |
| A023 | Valid new-shape build seal passes the save gate                | ✅ SATISFIED | `capture-marker.test.ts:215` `gate.blocked toBe(false)`, errors/warnings empty; `evaluateCaptureGate` unchanged |
| A024 | Build report with no seal is blocked                           | ✅ SATISFIED | `capture-marker.test.ts:224` no-marker → `blocked toBe(true)` |
| A025 | Fenced-example seal does not satisfy the gate                  | ✅ SATISFIED | `capture-marker.test.ts:232` fenced marker → `blocked toBe(true)`; fence-skip `capture-marker.ts:205-209` |

All 25 assertions SATISFIED. Every `@ana`-tagged test was read; matcher methods match the contract (`equals`→`toBe`/`toHaveLength`, `not_contains`→`not.toContain`, `not_equals`→`not.toBe`, `contains`→`toContain`, `exists`→present-and-asserted).

## Independent Findings

**Predictions resolved.** I predicted (1) a dangling reference to a removed symbol, (2) `bytes`/`lines` surviving in `src/`, (3) a tautological canonical test, (4) `--stage verify` not actually ignoring `--surface`, (5) drifted agent-def role copies. **All five came back clean (builder got them right):**
- (1)/(2) The AC13 grep — `bytes=`/`lines=`/`countLines`/`isCheckpointSealConflict`/`SEALING_STAGES`/`degradedToRaw`/`rawText` — is **zero matches in `src/`** and zero orphaned refs in `tests/`. The 284-line `test.ts` reduction left no half-removed branch.
- (3) The canonical test asserts against a **literal string**, not the function-against-itself — genuinely non-tautological.
- (4) `--stage verify` forces `effectiveSurface = undefined` (`test.ts:170`); the A015 test *proves* the surface is ignored by making the surface command fail-if-used.
- (5) All four copies per role are **byte-identical** (`diff` clean for codex build/verify dogfood-vs-template and claude dogfood-vs-template); `ana-plan.md` is untouched as required.

**Surprises (not predicted):**
- `artifact.test.ts` was modified but is **not in the contract's file_changes** — see Findings (upstream). The change is *necessary and correct* (the `marker()` factory no longer accepts `bytes`/`lines`; an old-format `@ana` test depended on the retired shape). Not a defect; a contract-scope gap.
- The `test.ts` docstring names `commands.test` for verify resolution, but the code resolves `test_json`-first via `resolveTestCommandString` — minor imprecision (see Findings).

**Live Testing.** I ran the **rebuilt worktree artifact** (`packages/cli/dist/index.js`, not the global `ana`) against a temp project:
- Two consecutive `--stage build` captures of the same outcome → **byte-identical markers** (`sha256=d5d7e4f0a03c…`), with **no `bytes=`/`lines=`** and all load-bearing fields present. The determinism fix and field removal are confirmed on the compiled output, end to end.
- A shell-needing command (`echo hi | tee out.txt`) → **exit 3** (fail-closed capture error). The exit-code contract holds.
- (First attempt failed with "not inside an Anatomia project" — that was my harness gap: `findProjectRoot` requires a `.git` sibling to `.ana/`. Adding `.git/` fixed it. Not a build defect.)

**Code quality.** `capture-marker.ts` keeps the pure-module boundary (only `node:crypto`/`node:fs`); the new `canonicalCaptureString`/`captureSha` are the single source of truth for both hash input and the idempotency test, so the hash cannot silently diverge from the visible fields. `test.ts` keeps two-layer error handling (command surfaces errors; exit codes 0/1/3 preserved). Docstrings in all three source files were corrected to drop byte/line wording (AC10).

**Over-building / YAGNI.** None found. The reduction is subtractive; the surviving exports (`formatCounts`, `inferRunner`, `KNOWN_RUNNERS`, `resolveTestCommandString`, `countHint`) are all still load-bearing and consumed. The new `canonicalCaptureString`/`captureSha` are both imported (`test.ts`, tests). No dead `if`/`try` blocks introduced.

## AC Walkthrough

- **AC1** ✅ PASS — `sha256` over `canonicalCaptureString(stage|slug|counts|verdict)` via shared `captureSha` (`test.ts:225`, `capture-marker.ts:118`). No `createHash(...).update(rawBytes)` remains.
- **AC2** ✅ PASS — `bytes`/`lines` removed from `CaptureMarker`, `formatMarker`, parser; `countLines`/`NL` gone; no `bytes/lines` console line in `printOutcome`.
- **AC3** ✅ PASS — canonical-layout + idempotency tests added (`capture-marker.test.ts:68,73`); literal byte layout pinned.
- **AC4** ✅ PASS — checkpoint passthrough, `isCheckpointSealConflict`, `SEALING_STAGES`, degrade-to-raw, `rawText`/`degradedToRaw`/`mode`, `[command...]` arg, and `CaptureRunResult.bytes` all removed; no dead code (grep clean). `formatCounts`/`inferRunner`/`KNOWN_RUNNERS`/`countHint` retained.
- **AC5** ✅ PASS — `registerTestCommand` (`test.ts:323-334`) exposes only `--stage`, `--slug`, `--surface`, `--json`. No `--all`.
- **AC6** ✅ PASS — `--stage verify` sets `effectiveSurface = undefined` (`test.ts:170`); proven by A015 live-style test.
- **AC7** ✅ PASS — route-everything + checkpoint-wrapping removed from all ana-build/ana-verify defs + dogfood; marker prose drops "byte/line"; final-seal instruction kept; edits identical within role; `ana-plan.md` unchanged.
- **AC8** ✅ PASS — `template-propagation.test.ts`, `agent-proof-context.test.ts`, rewritten `template-capture-instruction.test.ts` all green; the old-format `@ana` test in `artifact.test.ts` rewritten (tag dropped, now a non-hex-placeholder test).
- **AC9** ✅ PASS — gate logic in `capture-marker.ts` unchanged (`validateCapturePresent`/`evaluateCaptureGate` present-check only); `artifact.ts` gate source not in diff; no new re-parse path.
- **AC10** ✅ PASS — docstrings corrected in `test.ts`, `capture-marker.ts`, `capture-runner.ts`. ⚠️ minor: `test.ts` docstring names `commands.test` where the code prefers `test_json` (see Findings) — accurate enough to pass, flagged as debt.
- **AC11** ✅ PASS — codex dogfood `ana-build.md`/`ana-verify.md` synced AND covered by the generalized byte-check loop over `CODEX_AGENT_FILES` (`codex-learn-template.test.ts:66`).
- **AC12** ✅ PASS — full suite green (3424 passed / 2 skipped); diff removes machinery tests and adds canonical/idempotency tests; one coherent diff.
- **AC13** ✅ PASS — grep for `result.bytes` / marker `bytes`/`lines` in `src/` → **clean**.
- **AC14** ✅ PASS — build succeeds; lint 0 errors (1 pre-existing warning outside the diff).

## Blockers

None. I specifically searched for:
- **Unused/dead code** — grepped new code for removed symbols and exported functions; all retained exports are imported, no orphaned `if`/`try` branches in the reduced `test.ts`.
- **Unhandled error paths** — the three `failClosed` sites (ana.json read, command resolve, capture spawn) each map to exit 3 and are tested; the exit-1 vs exit-3 split is covered by A012/A013 and confirmed live.
- **External-state assumptions** — the one I hit (`findProjectRoot` needs `.git`) is pre-existing CLI behavior, correctly unchanged.
- **Spec edge cases** — abstaining run (`counts=abstain`) still seals deterministically; large-capture still seals without a `bytes` assertion; both covered.

Nothing rises to blocker level: all 25 assertions SATISFIED, all 14 ACs pass, no regressions.

## Findings

- **Upstream — Contract file_changes omits `artifact.test.ts`:** `packages/cli/tests/commands/artifact.test.ts` was modified by the build (removed `bytes`/`lines` from `marker()` factory calls at ~L382/L486; rewrote the old-format `@ana A024` block at ~L568 into a non-hex-placeholder test). This change is **necessary and correct** — the `CaptureMarker` type no longer has those fields, so the file would not compile otherwise. But the contract's `file_changes` list never names it. A scope gap in planning, not a build defect; the next planner should know this consumer exists.
- **Upstream — Checkpoint removal resolves two prior proof-chain findings:** Deleting the checkpoint machinery from `test.ts` resolves `compact-capture-seal-C5` (`isCheckpointSealConflict` over-build) and `captured-test-evidence-C2` (checkpoint-passthrough argv-quoting loss) by removal rather than patch. Recorded in `verify_data.yaml` with a `resolves` claim for the stale-finding sweep.
- **Code — `test.ts` docstring imprecise about verify resolution:** `packages/cli/src/commands/test.ts:16` says verify "resolves the top-level `commands.test`", but the implementation resolves via `resolveTestCommandString`, which prefers `commands.test_json` when present. Functionally the documented resolution rule, but the named field is wrong. Low-severity doc debt (relevant to AC10).
- **Code — "Verify runs the full project" is config-dependent:** On *this* repo, top-level `test_json` is `(cd 'packages/cli' && pnpm vitest run --reporter=json)` — CLI-only. So a `--stage verify` seal here covers the CLI suite and **excludes the `website` package**. This follows the spec's accepted resolution rules (and matches what my own sealed verify run captured: 3424 CLI tests, no website tests), but a reader could over-read "full project". Worth knowing for whoever relies on the verify seal as whole-repo coverage. `test.ts:170`.
- **Code — Widened seal grammar (recorded, not guarded):** Dropping required `lines` means any well-formed five-field line outside a fence now parses as a real seal — the verbatim-paste forgery surface. The spec accepts this and defers it to the reserved `enginebind` token; it matches active proof finding `captured-test-evidence-C4`. Still present by design — monitor. `capture-marker.ts:201`.
- **Test — Redundant follow-up assertion:** `packages/cli/tests/utils/capture-runner.test.ts:128` adds `expect(result.rawBytes.byteLength).toBeGreaterThan(0)` immediately after `:127` `toBe(11)` on the same value. The specific assertion already covers it; the range matcher adds nothing. Cosmetic.
- **Code — Pre-existing lint warning (not a regression):** `packages/cli/src/utils/git-operations.ts:198` — unused `eslint-disable` for `no-control-regex`. The file is outside this diff; flagged so it is not attributed to this build. Lint is otherwise 0 errors.

## Deployer Handoff

- This is a **format-changing** seal migration done in lockstep: producer (`test.ts`), pure module (`capture-marker.ts`), runner (`capture-runner.ts`), all 8 agent defs, and the sync tests move together. The parser is backward-tolerant — old markers with `bytes=`/`lines=` still parse (those keys are now ignored as unknown), so previously-saved reports are not invalidated.
- **After merge, reinstall the global CLI** (`npm i -g anatomia-cli` once published, or rebuild your local link). The currently-installed `ana` (v1.2.2) still emits old-format `bytes=`/`lines=` markers — harmless (they parse) but you won't get deterministic seals until the new build is the one on your PATH. This is why my sealed verify marker above still shows `bytes=`/`lines=`.
- `ana-plan.md` is intentionally untouched (it authors raw per-file commands, never `ana test` wrappers). Do not "sync" it.
- Verify-stage seals on this monorepo cover the CLI package only (via `test_json`); see Findings if you depend on the seal as whole-repo evidence.

## Verdict

**Shippable:** YES

All 25 contract assertions SATISFIED, all 14 acceptance criteria PASS, full suite green (3424/0/2), build and lint clean (sole warning pre-existing and outside the diff). The determinism fix and field removal are confirmed not just by unit tests but live against the rebuilt artifact — two captures of the same outcome produce byte-identical markers with no raw-output size fields, and the exit-3 fail-closed path holds. The findings are observations and low-severity debt for the next engineer (a contract-scope gap, a docstring imprecision, a config-scoping nuance, a recorded forgery surface) — none block shipping. Would I stake my name on this: yes.
