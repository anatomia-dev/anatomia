# Scope: work.ts untested branch coverage

**Created by:** Ana
**Date:** 2026-05-14

## Intent
Two proof findings (proof-health-v2-C12, proof-health-v2-C8) identify untested defensive branches in work.ts. The UNKNOWN verification result warning and the git pull conflict error path have zero test coverage. Both protect users from silent failures — a malformed verify report proceeding unnoticed, and a rebase conflict during completion losing work. The user wants regression tests for both paths.

## Complexity Assessment
- **Kind:** chore
- **Size:** small — two tests in an existing test file, following established patterns
- **Files affected:** `packages/cli/tests/commands/work.test.ts`
- **Blast radius:** none — test-only changes, no production code modified
- **Estimated effort:** under 1 hour
- **Multi-phase:** no

## Approach
Add two tests to work.test.ts that exercise the untested defensive branches in completeWork. Both tests use the existing `createMergedProject` helper and established patterns (console capture, process.exit spy). No production code changes. No helper modifications — keep the helper interface clean by writing custom fixture state after the helper runs.

## Acceptance Criteria
- AC1: A test exercises the UNKNOWN result warning at work.ts:868-875. It creates a verify report without a `**Result:**` line, confirms the yellow warning fires containing "UNKNOWN" and "verify_report.md", and confirms completeWork still succeeds (writes proof chain entry).
- AC2: A test exercises the pull conflict error at work.ts:1335-1342. It sets up a git state where `pull --rebase` produces a conflict, confirms `process.exit(1)` is called, and confirms the error message contains "conflict."
- AC3: Both tests live in `packages/cli/tests/commands/work.test.ts`, not a new file.

## Edge Cases & Risks
- The UNKNOWN test must verify that the proof chain entry is actually written with `result: 'UNKNOWN'` — not just that the warning fires. This ensures the test catches any future change to the UNKNOWN handling behavior.
- The pull conflict test needs a bare repo with divergent commits. The existing non-conflict pull test at work.test.ts:3251 uses an invalid remote URL, which produces a different error class. The conflict test needs real divergent history — closer to the push retry pattern than the existing pull test.
- Both tests spy on `process.exit` — must restore cleanly to avoid poisoning subsequent tests.

## Rejected Approaches
**Testing the not-a-git-repo path (work.ts:1087, 1821, 1900).** Investigated and confirmed unreachable through normal control flow. `findProjectRoot()` at validators.ts:173-175 requires both `.ana/ana.json` and `.git` to exist — it skips any directory without `.git` and throws if none is found. `getCurrentBranch()` is only called after `findProjectRoot` succeeds, meaning `.git` is guaranteed to exist. The only way `getCurrentBranch` returns null is if `.git` exists but is internally corrupted — a state the code can't naturally produce. Testing it would require mocking `findProjectRoot` to succeed without `.git`, which tests artificial state rather than real user scenarios. The check is valid defense-in-depth; it doesn't need a test.

## Open Questions
None — all investigative questions resolved during scoping.

## Exploration Findings

### Patterns Discovered
- `createMergedProject` helper (work.test.ts:1085-1179) creates a full git repo with .ana structure, feature branch, merge, and artifacts. Takes `verifyResults` array that writes `**Result:** ${value}` into verify reports.
- Existing non-conflict pull test (work.test.ts:3251-3267) uses `git remote add origin https://invalid.example.com/repo.git` to trigger pull failure. Tests the WARNING path (lines 3343-3346), not the CONFLICT exit path (lines 1338-1342).
- `parseResult` (proofSummary.ts:197-199) uses regex `/\*\*Result:\*\*\s*(PASS|FAIL)/i` — only matches PASS or FAIL. Anything else returns UNKNOWN.
- `guardFailResult` (work.ts:807-815) only blocks FAIL. UNKNOWN passes through to the warning check.

### Constraints Discovered
- [TYPE-VERIFIED] guardFailResult only blocks FAIL (work.ts:808) — UNKNOWN is intentionally allowed through
- [TYPE-VERIFIED] findProjectRoot requires .git (validators.ts:175) — makes not-a-git-repo check in completeWork unreachable
- [OBSERVED] createMergedProject writes verify reports at line 1147 — overwriting after the helper runs is the clean way to produce a report without a Result line

### Test Infrastructure
- work.test.ts uses `tempDir` with `beforeEach`/`afterEach` cleanup, `process.chdir(tempDir)`, `vi.spyOn(process, 'exit')`, console capture via reassignment
- `createMergedProject` is scoped inside the `completeWork` describe block (line 1085)

## For AnaPlan

### Structural Analog
The non-conflict pull failure test at work.test.ts:3251-3267 — same describe block, same helper, same console capture pattern. The UNKNOWN test follows this shape exactly. The conflict test needs a more involved fixture but same assertion style.

### Relevant Code Paths
- work.ts:868-875 — UNKNOWN result warning (the branch AC1 tests)
- work.ts:1335-1342 — pull conflict error exit (the branch AC2 tests)
- work.ts:807-815 — guardFailResult, confirms UNKNOWN passes through
- proofSummary.ts:197-199 — parseResult, produces the UNKNOWN value
- work.test.ts:1085-1179 — createMergedProject helper
- work.test.ts:3249-3267 — existing pull failure test (structural analog)

### Patterns to Follow
- Console capture: `const errors: string[] = []; console.error = (...args) => { errors.push(args.map(String).join(' ')); };` (work.test.ts:3258-3259)
- Process exit spy: `vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); })` (pattern used across work.test.ts)
- Fixture approach for UNKNOWN test: call `createMergedProject({ slug, phases: 1 })`, then overwrite the verify report file with content that has no `**Result:**` line

### Known Gotchas
- The UNKNOWN warning only fires when `proof.result === 'UNKNOWN'` AND `fs.existsSync(verifyReportPath)` — the test must ensure the verify report file exists in the completed plan directory (not just the active directory). `createMergedProject` with `merged: true` puts artifacts on main in active/, then completeWork moves them to completed/. The overwrite must happen before completeWork runs, in the active directory.
- The conflict test must produce a REAL git conflict, not just a failed pull. The error message check at line 1338 looks for 'conflict', 'Cannot rebase', or 'could not apply' in stderr.

### Things to Investigate
- Exact fixture setup for the conflict test: bare repo with a pushed commit that conflicts with a local commit on main, so `pull --rebase` hits a real conflict. Verify the stderr output contains one of the expected strings.
