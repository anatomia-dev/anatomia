# Verify Report: Worktree Artifact Path Mismatch — Prevention and Cleanup

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-07
**Spec:** .ana/plans/active/worktree-artifact-cleanup/spec.md
**Branch:** feature/worktree-artifact-cleanup

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/worktree-artifact-cleanup/contract.yaml
  Seal: INTACT (hash sha256:ad3fa95025a391a434127bf500df851f4b831ebfbd101578dbbfce4b7010f99d)
```

Seal status: **INTACT**

Tests: 2009 passed, 2 skipped (2011 total), 95 test files. Build: clean (typecheck + tsup). Lint: 1 pre-existing warning in `git-operations.ts` (unused eslint-disable directive — not from this build).

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Saving an artifact that was written to the wrong tree auto-moves it to the correct location | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:2982` — creates report on main tree only, `saveArtifact` succeeds, git log confirms commit |
| A002 | The data companion file moves alongside its report automatically | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:3004` — creates both on main, companion exists in worktree after save, gone from main |
| A003 | After auto-move, no stale copy remains on the main tree | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:2998` — asserts `mainCopyExists` is `false` |
| A004 | Files that are tracked by git on the main tree are never auto-moved | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:3025` — commits report on main (tracked), `saveArtifact` throws |
| A005 | Cross-filesystem moves fall back to copy-then-delete | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:3040` tests copy+delete pattern works at FS level; source inspection of `moveFileCrossFs` at `packages/cli/src/commands/artifact.ts:809-819` confirms EXDEV catch invokes `copyFileSync`+`unlinkSync`. See Finding about test quality. |
| A006 | After a successful worktree save, stale copies on the main tree are deleted | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:3077` — dual-write scenario, main-tree copies swept after save |
| A007 | Post-save sweep only removes untracked files | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:3101` — tracked files on main survive sweep |
| A008 | A cleanup failure during post-save sweep does not fail the save | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:3124` — save succeeds when sweep is a no-op; source inspection of `packages/cli/src/commands/artifact.ts:1260-1264` confirms empty catch wraps `unlinkSync`. See Finding about test quality. |
| A009 | Build and verify artifacts are removed from main without checking content | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3687` — `matchesRemote: false` build artifacts, `completeWork` resolves |
| A010 | Planning artifacts still require content-match before removal | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3714` — `scope.md` with different content, `completeWork` rejects |
| A011 | When build artifacts and planning artifacts are both untracked, each group gets its own cleanup strategy | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3727` — mixed scenario: build artifacts (different content) removed, planning artifact (matching content) removed |
| A012 | Build and verify data companions are also removed unconditionally | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3701` — `verify_data.yaml` with `matchesRemote: false`, resolves |
| A013 | The Build agent template instructs agents to use pwd for artifact paths | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3748` — `toContain('pwd')` and `toContain('Write tool resolves paths against the main tree')` |
| A014 | The Verify agent template instructs agents to use pwd for artifact paths | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3756` — same assertions on verify template |
| A015 | Auto-move operations never touch files outside the current slug directory | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:3140` — `other-slug` file untouched after save on `test-slug` |
| A016 | When not running from a worktree, auto-move and sweep are silently skipped | ✅ SATISFIED | `packages/cli/tests/commands/artifact.test.ts:3162` — normal (non-worktree) project, save succeeds without errors |

## Independent Findings

**Prediction resolution:**
1. **EXDEV fallback test quality — Confirmed.** The A005 test does not call `moveFileCrossFs` or trigger an EXDEV error. It manually invokes `copyFileSync`+`unlinkSync` — proving Node.js works, not that the application catches EXDEV correctly. The builder noted "ESM built-in modules have non-configurable exports" — fair constraint, but the function itself is importable and could be tested with a helper that wraps the FS call. Verified via source inspection instead.
2. **Layer 3 filename patterns too loose — Not found.** Uses `basename.startsWith('build_report')` etc., which is specific enough. No planning artifact starts with `build_` or `verify_`.
3. **Post-save sweep race condition — Not found.** The sweep wraps `unlinkSync` in try-catch at `artifact.ts:1263`, handling TOCTOU gracefully.
4. **pwd hint placement buried — Not found.** Placed immediately before the report format section in both templates (line 275 in build, line 285 in verify). Good placement.
5. **A015 slug-directory scoping narrow — Not found.** The code never constructs paths outside the current slug directory. The scoping is architectural, not just guard-based.

**Surprise: Layer 3 planning artifact TOCTOU.** The content-match path at `work.ts:1084` calls `fs.readFileSync` on a path that was discovered from git stderr output. If the file is deleted between the untracked-files check and the readFileSync call (e.g., concurrent cleanup), this throws an unhandled ENOENT. The build/verify path wraps in try-catch; the planning path does not.

## AC Walkthrough
- **AC1:** ✅ PASS — Test at `artifact.test.ts:2982` exercises auto-move from main tree to worktree, save completes, no stale copy.
- **AC2:** ✅ PASS — Test at `artifact.test.ts:3004` verifies companion moves alongside report.
- **AC3:** ✅ PASS — Test at `artifact.test.ts:3077` verifies post-save sweep deletes untracked main-tree copies.
- **AC4:** ✅ PASS — Test at `work.test.ts:3687` removes build artifacts unconditionally (different content, still removed).
- **AC5:** ✅ PASS — Test at `work.test.ts:3714` rejects `completeWork` when planning artifact doesn't match remote.
- **AC6:** ✅ PASS — Templates at `ana-build.md:275` and `ana-verify.md:285` contain pwd guidance.
- **AC7:** ✅ PASS — Tests at `artifact.test.ts:3025` (Layer 1 tracked guard) and `artifact.test.ts:3101` (Layer 2 tracked guard) verify tracked files are untouched.
- **AC8:** ✅ PASS — Source inspection of `artifact.ts:1260-1264` and `work.ts:1070-1074` confirms all cleanup is try-catch wrapped. Tests at `artifact.test.ts:3124` and `work.test.ts:3687` confirm saves/completes don't fail.
- **AC9 (Tests pass):** ✅ PASS — 2009 passed, 2 skipped, 0 failures.
- **AC10 (Build clean):** ✅ PASS — typecheck + tsup succeed.

## Blockers
No blockers. All 16 contract assertions satisfied, all 10 ACs pass, no regressions (baseline was 1994 tests, now 2009 — 15 net new tests). Checked: no unused exports in new code (both `moveFileCrossFs` and `isBuildVerifyArtifact` are internal helpers used inline), no unhandled error paths in the new Layer 1/Layer 2 code (both wrapped in try-catch or guarded by existence checks), no assumptions about external state beyond what `getMainTreeRoot` provides.

## Findings

- **Test — A005 EXDEV test doesn't exercise the application code:** `packages/cli/tests/commands/artifact.test.ts:3040` — manually calls `copyFileSync`+`unlinkSync` instead of triggering `moveFileCrossFs` with a mocked EXDEV. Passes regardless of whether the EXDEV catch block exists in the application. Verified via source inspection instead.
- **Test — A008 sweep-failure test is a no-op:** `packages/cli/tests/commands/artifact.test.ts:3124` — tests absence of sweep (no main-tree copy to delete), not an actual cleanup failure path. Doesn't prove that a failed `unlinkSync` is caught. Source inspection of `artifact.ts:1263` confirms the catch block exists.
- **Code — moveFileCrossFs copy-then-delete is not atomic:** `packages/cli/src/commands/artifact.ts:814` — if `copyFileSync` succeeds but `unlinkSync` fails (permissions, etc.), the source file persists as a stale duplicate. The caller doesn't handle this, and the user gets two copies. Acceptable for best-effort cleanup, but worth knowing.
- **Code — Layer 3 planning artifact readFileSync lacks try-catch:** `packages/cli/src/commands/work.ts:1084` — reads file content for content-match without catching ENOENT. If the file is deleted between git stderr parsing and `readFileSync`, `completeWork` crashes with an unhandled exception. The build/verify path (lines 1070-1074) wraps in try-catch; this path does not. Not introduced by this build — this is the pre-existing content-match code restructured but not hardened.
- **Code — Duplicate getMainTreeRoot call:** `packages/cli/src/commands/artifact.ts:1246` — Layer 2 calls `getMainTreeRoot(projectRoot)` again, same value computed at line 963 for Layer 1. Not threaded through because the Layer 1 block may not execute (guarded by `typeInfo.category !== 'planning'` and file non-existence). Minor inefficiency — `getMainTreeRoot` parses the `.git` file each time.
- **Upstream — Dogfood templates also updated:** `.claude/agents/ana-build.md` and `.claude/agents/ana-verify.md` (dogfood copies) received the pwd hint. Not listed in contract `file_changes` but correct behavior — dogfood templates should match shipped templates.

## Deployer Handoff
Standard merge. No migration, no config changes, no new dependencies. The build adds defense-in-depth for a known pipeline-blocker (wrong-tree artifact writes). All four layers are backward-compatible — they only fire when the wrong-tree condition is detected. Existing behavior for correctly-written artifacts is unchanged. The one thing to watch: the Layer 3 planning artifact content-match path at `work.ts:1084` inherits a pre-existing TOCTOU risk — not introduced by this build, but now more visible because the surrounding code was refactored. Consider wrapping in try-catch in a future cycle.

## Verdict
**Shippable:** YES

All 16 contract assertions satisfied. All 10 acceptance criteria pass. 15 net new tests, no regressions. The implementation follows the spec's four-layer defense-in-depth design correctly. Two tests (A005, A008) are weaker than ideal — they verify the pattern works rather than exercising the actual error paths — but the source code is inspectable and correct. The Layer 3 TOCTOU risk is pre-existing, not introduced. I'd stake my name on this shipping.
