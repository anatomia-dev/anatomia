# Verify Report: Rejection Cycle Artifact Preservation

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-06
**Spec:** .ana/plans/active/rejection-artifact-preservation/spec.md
**Branch:** feature/rejection-artifact-preservation

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/rejection-artifact-preservation/contract.yaml
  Seal: INTACT (hash sha256:e3cbee6d7997a2b7bdd907e87623e77c2630f42eaafc3db42481d9d0cbe79f10)
```

Seal status: **INTACT**

Tests: 1924 passed, 1 failed (pre-existing environmental — `worktree.test.ts:125` `detectWorktreeSlug('')` returns slug name when run from inside a worktree), 2 skipped. Build: clean (cached). Lint: clean (1 pre-existing warning in `git-operations.ts`).

Artifact test file: 131 passed, 0 failed.

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | A previously committed verify report is preserved when a new version is saved | ✅ SATISFIED | `artifact.test.ts:2623` — commits R1 content, overwrites with R2, saves, asserts `verify_report_r1.md` exists |
| A002 | The archived verify report contains the original content, not the new version | ✅ SATISFIED | `artifact.test.ts:2645-2646` — reads archive, `expect(archiveContent).toBe(originalContent)` |
| A003 | A previously committed verify data file is preserved alongside the report | ✅ SATISFIED | `artifact.test.ts:2649` — commits verify_data.yaml R1, overwrites, saves, asserts `verify_data_r1.yaml` exists |
| A004 | The archived verify data contains the original content | ✅ SATISFIED | `artifact.test.ts:2667-2668` — `expect(archiveContent).toBe(originalDataContent)` |
| A005 | A previously committed build report is preserved when a new version is saved | ✅ SATISFIED | `artifact.test.ts:2671` — same pattern for `build_report_r1.md`, asserts exists |
| A006 | The archived build report contains the original content | ✅ SATISFIED | `artifact.test.ts:2689-2690` — `expect(archiveContent).toBe(originalContent)` |
| A007 | Second rejection creates a second archive instead of overwriting the first | ✅ SATISFIED | `artifact.test.ts:2715` — three rounds, checks `_r2` archive name contains `_r2` |
| A008 | Both archive rounds are preserved after multiple rejections | ✅ SATISFIED | `artifact.test.ts:2746-2747` — counts `verify_report_r\d+\.md` files, `expect(archiveCount).toBe(2)` |
| A009 | First-time saves do not create spurious archive files | ✅ SATISFIED | `artifact.test.ts:2750` — first save with no committed version, asserts `archiveFiles.length === 0` |
| A010 | Saving identical content does not create an archive | ✅ SATISFIED | `artifact.test.ts:2766` — writes identical content, asserts `archiveFiles.length === 0` |
| A011 | Archive files are included in the same commit as the new artifacts | ✅ SATISFIED | `artifact.test.ts:2794` — `git diff-tree` on HEAD, `expect(commitFiles).toContain('_r1.md')` |
| A012 | Phase-numbered reports archive with both phase and round suffixes | ✅ SATISFIED | `artifact.test.ts:2816` — saves `verify_report_1.md`, asserts archive name contains `_1_r1` |
| A013 | Batch save preserves previous artifact versions just like individual save | ✅ SATISFIED | `artifact.test.ts:2837` — `saveAllArtifacts`, asserts `verify_report_r1.md` exists |
| A014 | Archive failures do not block the artifact save | ✅ SATISFIED | `artifact.test.ts:2856` — `not.toThrow()`, verifies commit happened via `git log`. Note: tests the no-archive path, not a forced error in `archivePreviousVersion`. See Findings. |
| A015 | Files deleted from disk but present in git history are still archived | ✅ SATISFIED | `artifact.test.ts:2873` — deletes file, writes new version, saves, asserts archive exists with original content |
| A016 | Build data companion files are preserved alongside build reports | ✅ SATISFIED | `artifact.test.ts:2693` — commits `build_data.yaml`, overwrites, saves, asserts `build_data_r1.yaml` exists with original content |

## Independent Findings

The implementation is clean and well-structured. `archivePreviousVersion` follows the `captureModulesTouched` pattern as specified — standalone helper, called from both save paths, catches errors internally.

**Prediction resolution:**
1. **Regex issue in round scanning** — Not found. `escapeRegExp` helper properly escapes the base name. Clean.
2. **Line ending content comparison** — Not found as a current problem, but noted as observation (see Findings).
3. **`saveAllArtifacts` companion staging miss** — Not found. Both artifact and companion archive paths collected and staged correctly (lines 1386-1397, 1443-1446).
4. **A015 sentinel test** — Not found. Test deletes, rewrites, saves, and checks both existence and content.
5. **A014 weak test** — Confirmed. The test exercises the no-archive-needed path (first save), not the catch branch where `archivePreviousVersion` encounters an actual error (e.g., permission denied on writing the archive file). The contract is technically satisfied — the save succeeds — but the catch block at line 224 is untested.

**Surprise finding:** The A010 identical-content test works by a side effect — when content is identical, no archive is created, AND no changes are staged, so `saveArtifact` hits the "no changes to save" `process.exit(0)`. The test catches this throw. The archive-skipping works correctly, but the test's mechanism is indirect.

**Over-building check:** `archivePreviousVersion` and `escapeRegExp` — both used. No unused exports. No dead code paths. No YAGNI violations. The implementation stays within spec scope.

**Orphan cleanup compatibility:** The `artifactPattern` regex at line 1458 uses `_\d+` which does not match `_r\d+`, so archive files are invisible to orphan cleanup. Confirmed safe.

**`deriveCompanionFileName` compatibility:** Requires `_report(_\d+)?\.md$` — archive files like `verify_report_r1.md` don't match. Confirmed safe.

## AC Walkthrough
- [x] **AC1:** ✅ PASS — Test at line 2623 commits verify_report.md, overwrites, saves, archive created with original content. Confirmed by test output showing `Archived verify_report.md → verify_report_r1.md (previous round)`.
- [x] **AC2:** ✅ PASS — Test at line 2649 same flow for verify_data.yaml → verify_data_r1.yaml.
- [x] **AC3:** ✅ PASS — Test at line 2671 same flow for build_report.md → build_report_r1.md.
- [x] **AC4:** ✅ PASS — Test at line 2715 creates three rounds, verifies _r1 and _r2 both exist with archiveCount === 2.
- [x] **AC5:** ✅ PASS — Test at line 2750, first save with no committed version → archiveFiles.length === 0.
- [x] **AC6:** ✅ PASS — 131/131 artifact tests pass. 1924/1925 total pass (1 pre-existing environmental failure in worktree.test.ts unrelated to this build).
- [x] **AC7:** ✅ PASS — Build clean (cached), typecheck clean, lint clean (1 pre-existing warning).
- [x] **AC8:** ✅ PASS — Test at line 2794, `git diff-tree --no-commit-id --name-only -r HEAD` output contains `_r1.md`.
- [x] **AC9:** ✅ PASS — Test at line 2766, identical content → archiveFiles.length === 0.

## Blockers
No blockers. All 16 contract assertions satisfied, all 9 ACs pass, no regressions. Checked for: unused exports in new code (none — `archivePreviousVersion` and `escapeRegExp` are both internal and both called), unhandled error paths (the catch block in `archivePreviousVersion` handles all errors with a warning), sentinel test patterns (none — all tests assert specific values), archive file leakage into orphan cleanup / companion derivation / proof summary (confirmed safe via regex analysis).

## Findings

- **Test — A014 doesn't exercise actual archive failure:** `packages/cli/tests/commands/artifact.test.ts:2856` — The test proves save succeeds when no archive is needed (first save). It does NOT force an error in `archivePreviousVersion` (e.g., read-only planDir, corrupted git state). The `catch` block at `packages/cli/src/commands/artifact.ts:224` is untested. Acceptable for this build — the pattern is well-established (`captureModulesTouched` uses the same structure) — but a future cycle should add a test that forces a write failure during archiving and confirms the warning is emitted and save completes.

- **Code — String equality for content comparison may produce false archives on Windows:** `packages/cli/src/commands/artifact.ts:193` — `diskContent === committedContent` uses strict equality. If `git show` returns content with different line endings than `fs.readFileSync` (possible on Windows with `core.autocrlf`), identical files would produce false archives. Not a current risk — this is a macOS/Linux CLI project — but worth knowing if the project ever supports Windows CI.

- **Code — No upper bound on archive accumulation:** `packages/cli/src/commands/artifact.ts:212` — A slug that goes through 10+ rejection cycles accumulates `_r1` through `_r10` files. No cleanup mechanism exists. Unlikely in practice (most slugs go through 1-3 rounds), but the directory could get cluttered for a particularly stubborn build. Not a blocker — archive files are invisible to all existing consumers.

- **Upstream — Double YAML parse in companion success message (pre-existing):** `packages/cli/src/commands/artifact.ts:1039` — Still present from proof context finding. Not introduced by this build, not affected by it. The validation function already parsed the YAML; the success message re-parses to count findings.

- **Test — A010 mechanism is indirect:** `packages/cli/tests/commands/artifact.test.ts:2766` — The test name says "skips archive when content is identical" but the mechanism is that identical content → no staged changes → `process.exit(0)` → caught as throw. The archive IS correctly skipped (verified by checking `archiveFiles.length === 0`), so the test is valid, but the test passes for two reasons (no archive + no staged changes) which could mask a regression where archiving happens but the exit still fires.

## Deployer Handoff

Straightforward feature addition — one new helper function (`archivePreviousVersion`) and one utility (`escapeRegExp`), both internal. Called from two existing save paths. No API changes, no new dependencies, no configuration changes.

After merge: rejection cycles will automatically preserve previous verify/build reports and their data companions as `_r{N}` archive files. These are invisible to all existing consumers (orphan cleanup, companion derivation, proof summary).

The pre-existing `worktree.test.ts:125` failure when running tests from inside a worktree is environmental — not a regression. Passes from the main tree.

## Verdict
**Shippable:** YES

All 16 contract assertions satisfied. All 9 acceptance criteria pass. No regressions. The implementation follows the specified pattern, stays within scope, and the archive files are confirmed invisible to existing consumers. The findings are observation-level (untested catch branch, theoretical Windows line ending issue, archive accumulation) — none prevent shipping.
