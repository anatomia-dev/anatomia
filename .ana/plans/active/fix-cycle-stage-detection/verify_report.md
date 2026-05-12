# Verify Report: Fix cycle stage detection breaks on multi-phase builds

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-12
**Spec:** .ana/plans/active/fix-cycle-stage-detection/spec.md
**Branch:** feature/fix-cycle-stage-detection

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-cycle-stage-detection/contract.yaml
  Seal: INTACT (hash sha256:e191bd3ec9fcdeff40d5fa0f7c7400505e392d5f7070f7c1188bfc0fe024e005)
```

Tests: 2153 passed, 2 skipped (100 test files). Build: success. Lint: 1 warning (pre-existing unused eslint-disable in `git-operations.ts` — not introduced by this build).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | A fix build on phase 2 transitions the stage to ready-for-re-verify | ✅ SATISFIED | `work.test.ts:440`, test creates 2-phase project with FAIL phase 2 verify + saves.json with build-report-2 after verify-report-2, asserts output `toContain('phase-2-ready-for-re-verify')` |
| A002 | A fix build on a single-spec item transitions the stage to ready-for-re-verify | ✅ SATISFIED | `work.test.ts:255`, test creates single-spec with FAIL verify + saves.json build after verify, asserts `toContain('ready-for-re-verify')` |
| A003 | Stage stays needs-fixes when no fix build has been saved | ✅ SATISFIED | `work.test.ts:281`, saves.json has build BEFORE verify, asserts `toContain('needs-fixes')` |
| A004 | When both numbered and unnumbered report files exist, save renames the unnumbered to numbered | ✅ SATISFIED | `artifact.test.ts:3794`, writes "fix cycle content" in unnumbered, saves build-report-1, reads numbered file and asserts `toContain('fix cycle content')` |
| A005 | Companion data files are renamed alongside their report files | ✅ SATISFIED | `artifact.test.ts:3811`, writes "Fix cycle companion" in unnumbered companion, saves build-report-1, reads numbered companion and asserts `toContain('Fix cycle companion')` |
| A006 | Auto-rename works for verify reports the same way as build reports | ✅ SATISFIED | `artifact.test.ts:3832`, writes "fix cycle verify" in unnumbered verify_report.md, saves verify-report-1, reads numbered and asserts `toContain('fix cycle verify')` |
| A007 | Stage detection reads timestamps from saves.json instead of git log | ✅ SATISFIED | `work.test.ts:255` (tagged A002, A007), test uses `.saves.json` `saved_at` fields not git log. Source confirms `readFileOnBranch` reads saves.json at `work.ts:407` |
| A008 | Multi-phase stage detection reads phase-numbered saves.json keys | ✅ SATISFIED | `work.test.ts:440` (tagged A001, A008), saves.json uses `build-report-2`/`verify-report-2` keys. Source confirms at `work.ts:469-470` |
| A009 | Stage detection falls back to unnumbered keys for backward compatibility | ✅ SATISFIED | `work.test.ts:519`, 2-phase project with unnumbered saves.json keys, asserts `toContain('phase-2-ready-for-re-verify')` via fallback. Source confirms at `work.ts:472` |
| A010 | Saving a numbered build report writes a phase-numbered key to saves.json | ✅ SATISFIED | `artifact.test.ts:3847`, saves build-report-1, reads .saves.json, asserts `saves['build-report-1']` is defined with `saved_at` |
| A011 | Saving an unnumbered build report keeps the unnumbered key | ✅ SATISFIED | `artifact.test.ts:3861`, saves build-report, asserts `saves['build-report']` defined AND `saves['build-report-1']` undefined |
| A012 | Companion data files get phase-numbered keys in saves.json | ✅ SATISFIED | `artifact.test.ts:3877`, saves build-report-1 with companion, asserts `saves['build-data-1']` defined with `saved_at` |
| A013 | Work completion succeeds with phase-aware saves.json keys | ✅ SATISFIED | Source inspection: `work.ts:1494` uses `build-report-${phaseNum}` / `verify-report-${phaseNum}` for numbered specs. Existing `completeWork` tests at `work.test.ts:2337` exercise the pipeline completeness check and pass |
| A014 | Work completion succeeds with old unnumbered saves.json keys | ✅ SATISFIED | Source inspection: `work.ts:1498` fallback `savesData[buildKey] ?? (!isUnnumbered ? savesData['build-report'] : undefined)` reads unnumbered when numbered absent |
| A015 | Build template resume section references phase-numbered filenames from the start | ✅ SATISFIED | Source inspection: `ana-build.md:438` resume step 3 says `build_report_{N}.md for multi-phase` from the opening instruction. `ana-build.md:445` step 10 also uses `build_report_{N}.md`. Template and dogfood copy are byte-identical |
| A016 | Verify template lists re-verify as a valid stage | ✅ SATISFIED | Source inspection: `ana-verify.md:43` contains `ready-for-re-verify`. Template and dogfood copy are byte-identical |
| A017 | Verify template lists phase-specific re-verify as a valid stage | ✅ SATISFIED | Source inspection: `ana-verify.md:44` contains `phase-N-ready-for-re-verify`. Template and dogfood copy are byte-identical |
| A018 | The full rejection cycle progresses correctly from FAIL through fix to re-verify | ✅ SATISFIED | `work.test.ts:307`, two-step test: first checks `needs-fixes`, then adds saves.json with build after verify, checks `ready-for-re-verify`. Sequence proves `needs-fixes → ready-for-re-verify` |
| A019 | The full rejection cycle progresses correctly for multi-phase builds | ✅ SATISFIED | `work.test.ts:474`, two-step test: first checks `phase-2-needs-fixes`, then adds saves.json with build-report-2 after verify-report-2, checks `phase-2-ready-for-re-verify` |

## Independent Findings

**Prediction resolution:**

1. **"Builder probably missed one of the two `deriveCompanionKey` call sites"** — Not found. Both sites updated: `saveArtifact` at line 1145 and `saveAllArtifacts` at line 1537. Builder followed the spec gotcha.

2. **"Auto-rename 'both files exist' probably doesn't handle companion when only report has both"** — Not found. The companion rename is inside the `if (defaultCompanion && numberedCompanion)` block at line 1022, and only fires when `fs.existsSync(defaultCompPath)`. If companion doesn't have both variants, the guard skips it cleanly.

3. **"`.saves.json` fallback has subtle ordering issue with missing `saved_at`"** — Not found. The code does `saves[buildKey]?.saved_at` with optional chaining, and the `if (buildSavedAt && verifySavedAt && ...)` guard requires both to be truthy. Missing `saved_at` falls through cleanly to `needs-fixes`.

4. **"Tests use hardcoded timestamps that don't test boundary"** — Confirmed. All timestamp tests use 1-hour gaps (09:00 vs 10:00). No test for equal timestamps. The code uses `>` (strict greater than), so equal timestamps fall through to `needs-fixes`, which is reasonable behavior. Noted as finding.

5. **"Template dogfood copies might have drifted"** — Not found. `diff` confirmed byte-identical. Sync test passes.

**Production risk predictions:**
- `readFileOnBranch` for `.saves.json` returns null → code handles this with the `if (savesContent)` guard. Falls through to `needs-fixes`. Safe.
- Auto-rename overwriting numbered file with stale unnumbered → technically possible but unlikely in practice. The fix cycle scenario is: verify FAILs → builder writes fix → builder runs `ana artifact save build-report-N`. The unnumbered file would be the fresh one. Noted as observation.

**Surprised by:** The existing test at `artifact.test.ts:3071` was changed from `verify-data` to `verify-data-1`. This is a pre-existing bug fix — the test was checking the wrong key for a numbered artifact's companion. The build correctly fixed this alongside the phase-aware key changes.

## AC Walkthrough

- [x] **AC1: Multi-phase fix cycle works end-to-end** — ✅ PASS. `work.test.ts:440` tests phase-2 FAIL → fix build → `phase-2-ready-for-re-verify`. Stage detection at `work.ts:463-477` reads phase-numbered saves.json keys. `work.test.ts:474` tests full progression.

- [x] **AC2: `artifact save` is self-healing** — ✅ PASS. Auto-rename at `artifact.ts:1002-1032` handles both-files-exist case. `artifact.test.ts:3794` (build report), `artifact.test.ts:3811` (companion), `artifact.test.ts:3832` (verify report) all test the fix cycle rename.

- [x] **AC3: Stage detection uses `.saves.json` timestamps** — ✅ PASS. `work.ts:404-415` (single-spec) and `work.ts:464-477` (multi-phase) both read `readFileOnBranch(workBranch, savesPath)` and compare `saved_at` timestamps. Git log calls removed. Tested by `work.test.ts:255` and `work.test.ts:440`.

- [x] **AC4: `.saves.json` keys are phase-aware** — ✅ PASS. `artifact.ts:309` stores `artifactType: type`. `writeSaveMetadata` calls at lines 1269 and 1673 pass `typeInfo.artifactType`. `deriveCompanionKey` at line 897 uses regex to extract phase suffix. Tested by `artifact.test.ts:3847` (A010), `artifact.test.ts:3861` (A011), `artifact.test.ts:3877` (A012).

- [x] **AC5: `completeWork` backward compatibility** — ✅ PASS. `work.ts:1487-1518` iterates phases, uses phase-numbered keys for numbered specs with fallback to unnumbered at line 1498. Source inspection confirms both paths. No tagged test for this specific behavior.

- [x] **AC6: Template build resume protocol** — ✅ PASS. `ana-build.md:438` resume step 3 says `build_report_{N}.md` from the first mention. Step 10 at line 445 and step 11 at line 448 also use numbered format with single-spec fallback. Dogfood copy is byte-identical.

- [x] **AC7: Template verify Find Work stages** — ✅ PASS. `ana-verify.md:43-44` adds `ready-for-re-verify` and `phase-N-ready-for-re-verify`. Dogfood copy is byte-identical.

- [x] **AC8: Tests exist for fix-cycle stage transitions and auto-rename** — ✅ PASS. `work.test.ts` adds 6 new tests (A001-A003, A007-A009, A018-A019). `artifact.test.ts` adds 8 new tests (A004-A006, A010-A012 + 2 edge cases). Test count: 2153 (up from 2107 baseline).

- [x] **Tests pass** — ✅ PASS. 2153 passed, 2 skipped, 100 test files.

- [x] **No build errors** — ✅ PASS. `pnpm run build` succeeded.

## Blockers

No blockers. All 19 contract assertions satisfied. All 10 acceptance criteria pass. No regressions (test count increased from 2107 to 2153). No unused exports in new code (grep confirmed no new `export` lines). No unused parameters — `artifactType` field is consumed at 4 call sites (2 `writeSaveMetadata`, 2 `deriveCompanionKey`). Error paths in saves.json reading are guarded by try/catch and optional chaining. Template dogfood copies confirmed byte-identical.

## Findings

- **Test — No tagged tests for A013/A014 completeWork backward compat:** `packages/cli/src/commands/work.ts:1498` — The completeWork phase-aware loop and unnumbered fallback have no dedicated tagged tests. Existing completeness tests at `work.test.ts:2294-2337` exercise the single-spec path but not the multi-phase fallback. Verified by source inspection; the code is straightforward. Next cycle should add dedicated tests.

- **Test — No tagged tests for A015/A016/A017 template content:** Template assertions verified by source inspection (grep for literal strings). These are static content checks — the sync test (`agent-proof-context.test.ts`) confirms dogfood copies match templates. Low risk but not mechanically tagged.

- **Code — completeWork fallback lets multi-phase specs share one unnumbered entry:** `packages/cli/src/commands/work.ts:1498` — For a 2-phase project with only unnumbered saves.json keys (backward compat), both phase 1 and phase 2 fall back to the same `build-report`/`verify-report` entry. This means if only one phase was actually saved, both phases pass the completeness check. Acceptable for backward compat but worth scoping a stricter check for new work items.

- **Test — Equal-timestamp boundary not tested:** `packages/cli/tests/commands/work.test.ts:259` — All timestamp comparisons use 1-hour gaps. No test for `saved_at` equal between build and verify. The code uses strict `>`, so equal falls to `needs-fixes`, which is reasonable. An explicit boundary test would document this choice.

- **Code — Auto-rename overwrites numbered file unconditionally:** `packages/cli/src/commands/artifact.ts:1016` — `fs.renameSync(defaultPath, filePath)` destroys the numbered file if both exist. In the fix cycle scenario, the unnumbered file is always the fresh one, so this is correct. But if an agent writes an unnumbered file in a non-fix-cycle context (bug), the good numbered version is silently replaced. The rename block has no content comparison or safety check. Low risk given the workflow context.

- **Upstream — Race condition in writeTimestamp still present:** Known from proof chain. `.saves.json` read-modify-write is not atomic. Accepted — CLI is single-process. See prior finding in proof context.

## Deployer Handoff

Standard merge. The build modifies 4 source files (`artifact.ts`, `work.ts`, 2 template pairs with dogfood copies) and 2 test files. No schema changes, no new dependencies, no config changes. The existing test at `artifact.test.ts:3071` was corrected from `verify-data` to `verify-data-1` — this is a pre-existing bug fix, not a behavior change.

After merge, fix cycles (FAIL → fix → re-verify) will work correctly for both single-spec and multi-phase work items. The pipeline's `.saves.json` timestamps replace git log timestamps for stage detection, which is more reliable when content-hash idempotency skips commits.

Lint has 1 pre-existing warning (unused eslint-disable in `git-operations.ts`). Not introduced by this build.

## Verdict
**Shippable:** YES

19/19 contract assertions satisfied. 10/10 acceptance criteria pass. 2153 tests pass (46 net new). Build clean. Templates synced. The code is focused on its spec — no scope creep, no over-building. The missing tagged tests for A013-A017 are noted but don't block — source inspection confirms correctness and these are static content / straightforward code paths.
