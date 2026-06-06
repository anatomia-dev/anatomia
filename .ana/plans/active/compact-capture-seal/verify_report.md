# Verify Report: Compact the capture seal + fix the count

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-06
**Spec:** .ana/plans/active/compact-capture-seal/spec.md
**Branch:** feature/compact-capture-seal

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/compact-capture-seal/contract.yaml
  Seal: INTACT (hash sha256:e944b8cc712ed165f4a3da32036bb9309f99de0a9e1fedd1af3c7e0774f33fbf)
```

Seal status: **INTACT** — the contract was not modified since AnaPlan sealed it.

**Build:** clean (`pnpm run build` — tsc --noEmit + tsup, ESM build success).
**Tests:** 3429 passed, 0 failed, 2 skipped (3431 total), 138 files — `(cd packages/cli && pnpm vitest run)`.
**Lint:** 0 errors, 1 warning (`(cd packages/cli && pnpm run lint)`). The single warning is an unused `eslint-disable` in `packages/cli/src/utils/git-operations.ts` — **pre-existing on main** and in a file this branch does not touch. Not a regression.

## Contract Compliance

| ID   | Says                                                                 | Status      | Evidence |
|------|----------------------------------------------------------------------|-------------|----------|
| A001 | A captured run produces a one-line sealed result, not a dump          | ✅ SATISFIED | `tests/utils/capture-marker.test.ts:76` (split→length 1) + live dogfood: marker is a single line |
| A002 | The seal carries counts, verdict, fingerprint, output size           | ✅ SATISFIED | `capture-marker.test.ts:84` asserts counts/verdict/sha256/bytes/lines + live marker carries `lines=207` |
| A003 | The seal no longer carries a throwaway log-file path                 | ✅ SATISFIED | `capture-marker.test.ts:94` `includes('file=')===false`; `formatMarker` (`capture-marker.ts:110`) emits no `file`; live marker has no `file=` |
| A004 | Saving a build report no longer pastes raw test output into it        | ✅ SATISFIED | `artifact.test.ts:276`; `inlineReportCaptures` deleted in `artifact.ts`; no save path emits `ana:capture-begin` |
| A005 | A compact-seal build report saves through the gate                   | ✅ SATISFIED | `capture-marker.test.ts:206` gate not blocked; `artifact.test.ts:445` |
| A006 | Counts read from a machine-readable report, not human text           | ✅ SATISFIED | `capture-runner.test.ts:197,212,223` (JSON counts, survives stderr noise, human fallback) |
| A007 | Tool prefers configured machine-readable command (top-level test_json)| ✅ SATISFIED | `test-command.test.ts:80` returns `{command, source:'test_json'}` |
| A008 | Configured test_json yields a real count, not abstain                 | ✅ SATISFIED | **Live dogfood:** seals `3429p/0f/2s verdict=pass` (non-abstain) via configured `test_json`; mechanism in A006. No hermetic unit test — see Findings |
| A009 | No machine-readable reporter → abstain, no invented count             | ✅ SATISFIED | `capture-runner.test.ts:245`; `capture-corpus/invariants.test.ts:154` |
| A010 | Clean exit with no countable evidence is never a pass                 | ✅ SATISFIED | `capture-runner.test.ts:190` `deriveVerdict(null,0)→abstain`; `invariants.test.ts:143` |
| A011 | A run where nothing passed is never a pass                           | ✅ SATISFIED | `capture-runner.test.ts:172,177` ({0,0,0} & all-skip → abstain); `invariants.test.ts:87,136` |
| A012 | A seal in a fenced code block is not a real seal                     | ✅ SATISFIED | `capture-marker.test.ts:107` fenced example → 0 markers |
| A013 | A placeholder-description seal is not a real seal                    | ✅ SATISFIED | `capture-marker.test.ts:113` non-hex sha256 → 0 markers |
| A014 | A prose-only seal does not satisfy the evidence gate                 | ✅ SATISFIED | `capture-marker.test.ts:215` gate blocked; `artifact.test.ts:436` |
| A015 | The raw log is deleted after sealing                                 | ✅ SATISFIED | `test-command.test.ts:143` `existsSync→false`; `test.ts` `fs.rmSync(sink)` after hash+count; **live:** `.captures/` empty after run |
| A016 | The project gitignores raw capture logs                             | ✅ SATISFIED | `.ana/.gitignore` diff carries `plans/active/*/.captures/`. **Source inspection only** — see Findings |
| A017 | New projects also gitignore raw capture logs                        | ✅ SATISFIED | `assets.ts` generator emits `plans/active/*/.captures/`. **Source inspection only** — see Findings |
| A018 | A seal with the reserved enginebind field round-trips unchanged      | ✅ SATISFIED | `capture-marker.test.ts:149` `formatMarker(parse(line))===line` with enginebind |
| A019 | A seal without the reserved field round-trips and gains no field     | ✅ SATISFIED | `capture-marker.test.ts:159` round-trip, no `enginebind=` added |
| A020 | Build templates drop the "verbatim, sha-sealed block" language       | ✅ SATISFIED | All four templates: string gone (`grep`→none). **Source inspection only** — see Findings |
| A021 | All four agent templates describe the compact single-line seal       | ✅ SATISFIED | Template diffs (Claude+Codex × build+verify) describe compact marker. **Source inspection only** — see Findings |
| A022 | The machine-readable count works for a non-JS runner (go -json)      | ✅ SATISFIED | `capture-runner.test.ts:233` `parseGo` → 2p/1f/1s |
| A023 | An old-format report does not crash the new reader                  | ✅ SATISFIED | `capture-marker.test.ts:173` old-format + capture-begin/end → no throw |
| A024 | An old-format seal is not accepted as a valid new seal              | ✅ SATISFIED | `capture-marker.test.ts:184` (no `lines`, has `file`) → 0 markers; `artifact.test.ts:575` |
| A025 | When a real count is unavailable, the tool names the fix             | ✅ SATISFIED | `test-command.test.ts:155` countHint names `test_json`; suppressed when test_json IS source (`:170`) |
| A026 | Saving the same build report twice is byte-stable                   | ✅ SATISFIED | `artifact.ts`: inlining (the only write-back) deleted, `applyCaptureGate` is read-only → byte-stable by construction. **No dedicated test** — see Findings |
| A027 | A large output still seals (one line regardless of size)            | ✅ SATISFIED | `test-command.test.ts:201` 8.4 MiB capture → `marker` defined, `bytes>8MiB` |
| A028 | A large output does not trigger a capture error                     | ✅ SATISFIED | `test-command.test.ts:201` `exitCode !== CAPTURE_ERROR_EXIT (3)` |
| A029 | A seal missing its fingerprint is rejected                          | ✅ SATISFIED | `capture-marker.test.ts:129` missing-sha256 → 0 markers (the load-bearing test) |

All 29 assertions SATISFIED. Six (A008, A016, A017, A020, A021, A026) are satisfied by source inspection and/or live behavior rather than by a dedicated automated test — sound today, but see Findings for the regression-coverage gap.

## Independent Findings

**Predictions (made before reading source).** Before reading the implementation I predicted the build would most likely (1) leave a coverage gap on the byte-stable re-save AC, (2) lack a regression test for the template wording change, (3) carry an unhermetic A008 verified only on the dogfood, (4) ship the JSON parser with assumed-not-confirmed vitest field names, (5) let the test-count drop pass without explicit accounting.

Resolution: (1), (2), (3) **confirmed** — A026/A020/A021/A008 have no dedicated tests (Findings below). (4) **not found** — the JSON parser uses the real field names (`numPassedTests`/`numFailedTests`/`numPendingTests`/`numTodoTests`); my live dogfood produced `3429p/0f/2s`, byte-for-byte matching the human summary, which independently confirms the names against real `--reporter=json` output. (5) **surprised** — the drop is small (−3) and entirely accounted for by the deleted inliner/validator suites; the surprise was discovering the PR also carries **merged sibling-branch commits (PR #281)** that touch files outside this contract.

**Code quality.** The implementation is clean and matches the spec's "mostly-red diff" intent. `capture-marker.ts` is pure (no chalk/commander), the strict parser is full-line-anchored, fenced-region-skipping, requires the `lines` discriminator and a 64-lowercase-hex sha256, and ignores unknown keys for forward-compat. All deleted symbols (`INLINE_CEILING_BYTES`, `locateBlock`, `renderBlock`, `inlineCaptures`, `eachMarker`, `validateCaptureInlined`, `validateCaptureNotTruncated`, the loose `MARKER_REGEX`) are gone with **zero dangling references** in `src/` or `tests/`. `deriveVerdict`'s no-false-green ladder is untouched, and the new JSON path is reached only via the `vitest` hint — finding `captured-test-evidence-C3` (fabrication via per-parser fallthrough) is respected, confirmed by the bonus test at `capture-runner.test.ts:250` (rspec-shaped prose still abstains).

**Over-building.** `test.ts` adds `isCheckpointSealConflict` — a guard refusing `--stage build/verify` combined with the `-- <command>` checkpoint form. It is not part of this contract; it arrived via the PR #281 merge. Well-tested and consistent with the anti-fabrication theme, but worth recording as scope that rode in on this branch.

**Live verification.** Ran the built CLI end-to-end on this repo with the configured `test_json`: it sealed a real count (`3429p/0f/2s verdict=pass`), printed the compact one-line marker with byte/line totals and no `file=`, and left the `.captures/` directory empty — exercising A001/A002/A003/A006/A008/A015/A027 against real output in one pass.

## AC Walkthrough

- **AC1** (single-line marker, counts+verdict+sha+byte/line, no raw output): ✅ PASS — `capture-marker.test.ts:76,84` + live marker.
- **AC2** (save seals without inlining; no `ana:capture-begin`): ✅ PASS — `artifact.ts` inlining deleted; `artifact.test.ts:276` (A004).
- **AC3** (count from test_json; real count on this repo): ✅ PASS — live dogfood `3429p/0f/2s`, non-abstain.
- **AC4** (abstain safely; no-false-green preserved): ✅ PASS — `deriveVerdict` untouched; A009/A010/A011 green.
- **AC5** (closed token; fenced/placeholder not a seal): ✅ PASS — A012/A013/A014.
- **AC6** (log written then actively deleted; `.captures/` rule both places): ✅ PASS — A015 live (log gone); A016/A017 gitignore rules present (by inspection).
- **AC7** (enginebind round-trips present AND absent): ✅ PASS — A018/A019, re-serialization identical both ways.
- **AC8** (all four templates describe compact seal; contract-seal untouched): ✅ PASS — template diffs verified by inspection; "verbatim, sha-sealed block" gone; contract-seal wording untouched. (No regression test — Findings.)
- **AC9** (JSON count works for go -json): ✅ PASS — A022 `parseGo`.
- **AC10** (old-format: no throw, not a valid new seal): ✅ PASS — A023/A024.
- **AC11** (abstain names the fix): ✅ PASS — A025 countHint + suppression test.
- **AC12** (re-save byte-stable): ✅ PASS — verified by source inspection: inlining (the sole write-back) is deleted and the gate is read-only. Verification method is inspection, not a double-save test (Findings).
- **AC13** (over-8MiB still seals, no capture error): ✅ PASS — A027/A028, 8.4 MiB capture seals with `exitCode !== 3`.
- **AC: full suite passes, no regression (≥3434 net of deletions):** ⚠️ PARTIAL — 3431 total (3429 passed, 2 skipped, **0 failed**). All green, no failing test, no live-code coverage lost. The literal ≥3434 floor is not met (−3); the delta is fully consistent with the documented deletion of the inliner round-trip and two block-validator suites. I do not read the build report, so the developer should confirm it states the delta explicitly as the Build Brief required.
- **AC: lint clean:** ✅ PASS — 0 errors. The 1 warning is pre-existing on main in an untouched file.

## Blockers

None. I searched for: dangling references to the deleted inliner/validator/ceiling symbols (none in `src/` or `tests/`); a write-back path that could make re-save non-byte-stable (none — inlining deleted, gate read-only); reintroduction of the `deriveCounts` fabrication fallthrough that finding C3 warns about (not present — JSON path is hint-gated, abstain-on-unknown holds); stray `.captures` logs left in the working tree after a real run (none — live cleanup + gitignore confirmed); and tampering with `runCapture`'s shell-free spawn / 64 MiB maxBuffer (untouched). Every contract assertion is SATISFIED and no acceptance criterion is ❌. The single ⚠️ PARTIAL (test count) is an authorized, documented deletion with zero failures — not a blocker.

## Findings

- **Test — A026 / AC12 byte-stable re-save has no dedicated test:** `packages/cli/tests/commands/artifact.test.ts` — the spec's Testing Strategy explicitly listed "saving twice is byte-stable (AC12)", but no test computes `reportUnchangedOnSecondSave`. The behavior is sound by construction (inlining deleted; `applyCaptureGate` is a read-only present-check), so this is a coverage gap, not a behavior gap. A future change that reintroduces any save-time report mutation would not be caught.
- **Test — A020/A021 template wording has no regression test:** `packages/cli/tests/commands/template-capture-instruction.test.ts` was not modified and asserts nothing about the compact seal. The four templates are correct today (verified by inspection), but a future edit could silently reintroduce "verbatim, sha-sealed block" or drop the compact description with the suite still green.
- **Test — A016/A017 gitignore rules verified by inspection only:** no test asserts the dogfood `.ana/.gitignore` or the `assets.ts` generator carries `.captures/`. The generator rule predates this build (PR #281); this build only corrected its stale comment.
- **Test — A008 has no hermetic unit test:** `packages/cli/tests/commands/test-command.test.ts` — the test_json→`executeCapture`→non-abstain chain is proven only by the live dogfood plus the A006 parser test. A fixture feeding vitest JSON through `executeCapture` and asserting `verdict !== 'abstain'` would lock it in.
- **Code — `isCheckpointSealConflict` is out-of-contract scope:** `packages/cli/src/commands/test.ts:168` — refuses `--stage build/verify` + `-- <command>`. Well-built and tested; arrived via the PR #281 merge. Recording it so the deployer knows it is part of this PR's surface.
- **Upstream — PR carries merged sibling-branch commits (PR #281):** out-of-contract file changes ride along — `CHANGELOG.md` (−4) and `.ana/plans/active/retire-capture-self-arming/build_report.md` (−2623). Not build defects (the build agent did not author them), but the deployer should confirm they are intended to land when this PR merges.
- **Upstream — over-ceiling availability edge resolved:** removing `INLINE_CEILING_BYTES` means an armed project whose honest output exceeds 8 MiB no longer fails closed; the one-line seal is size-independent. The previously-deferred excerpt-on-overflow fast-follow is now moot.
- **Upstream — proof finding `captured-test-evidence-C4` resolved:** `validateCapturePresent` no longer risks a marker embedded in block content satisfying "present" — there are no blocks, and the new strict parser is full-line-anchored and skips fenced regions.

## Deployer Handoff

- This is a clean, deletion-heavy cleanup. Net test count moved 3434 → **3431** (3429 passed, 2 skipped, **0 failed**) — the drop is the intentional removal of the inliner/block-validator suites. Confirm the build report documents this delta (the Build Brief required it); I do not read the build report.
- **The PR's commit range includes a merge of PR #281 (`feature/capture-seal-cleanup`).** That brings in changes to `CHANGELOG.md` and `.ana/plans/active/retire-capture-self-arming/build_report.md` and the `isCheckpointSealConflict` guard — none of which are in this contract's `file_changes`. Review those as part of the merge; they are not defects but they are extra surface.
- The dogfood `.ana/ana.json` now sets `commands.test_json` to a vitest `--reporter=json` run; this is what turns this repo's former `abstain` into a real sealed count. Verified live.
- One lint warning remains (`git-operations.ts`, unused `eslint-disable`) — pre-existing on main, unrelated to this work.
- Six assertions (A008, A016, A017, A020, A021, A026) hold today but lack dedicated regression tests; the Findings list them as scoped follow-ups for the next cycle.

## Verdict

**Shippable:** YES

All 29 contract assertions are SATISFIED, all 13 feature acceptance criteria pass (the one ⚠️ PARTIAL is an authorized, documented test deletion with zero failures), the build compiles, lint is clean (0 errors), and the headline deliverable — a real machine-readable count replacing this repo's `abstain` — is verified live (`3429p/0f/2s verdict=pass`). The code is pure where required, the no-false-green and anti-fabrication invariants are preserved, and no dangling references survive the deletion. The reservations I would stake my name on are the coverage gaps (A026/A020/A021/A008 inspection-only) and the sibling-branch commits riding in on the merge — both recorded for the deployer, neither a blocker.
