# Verify Report: Capture actual think time from Ana session start

**Result:** FAIL
**Created by:** AnaVerify
**Date:** 2026-05-13
**Spec:** .ana/plans/active/capture-think-time/spec.md
**Branch:** feature/capture-think-time

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/capture-think-time/contract.yaml
  Seal: INTACT (hash sha256:7339ff7c7b13a794ccbacb4944362e51a0e86732818f8989356f212f64b15b52)
```

Tests: 2194 passed, 0 failed, 2 skipped. Build: success. Lint: 0 errors, 1 warning (pre-existing unused eslint-disable in git-operations.ts).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | The CLI can resolve the Claude Code process ID from the current process tree | ✅ SATISFIED | `work.test.ts:4564`, calls `getClaudePid()` and asserts `typeof pid === 'number'` and `pid > 0` when non-null. Conditional — see findings. |
| A002 | PID resolution returns null when the process lookup fails | ✅ SATISFIED | `work.test.ts:4573`, sets `process.ppid` to 99999999 causing ps to fail, asserts `toBeNull()` |
| A003 | PID resolution returns null when ps output is not a valid number | ❌ UNSATISFIED | `work.test.ts:4577`, test asserts `pid === null \|\| (typeof pid === 'number' && pid > 0)` — this is always true for any return value of `getClaudePid()`. The test never triggers the invalid-output path. Tautological assertion. |
| A004 | Running work status with --session creates a session file in .ana/state/ | ✅ SATISFIED | `work.test.ts:4594`, calls `getWorkStatus({ session: true })`, asserts `existsSync(sessionPath)` is true. Conditional on PID resolution. |
| A005 | The session file contains a valid UTC timestamp | ✅ SATISFIED | `work.test.ts:4606`, parses session file JSON, asserts `content.timestamp` is defined and contains `'T'`. |
| A006 | Running work status without --session does not create a session file | ✅ SATISFIED | `work.test.ts:4614`, calls `getWorkStatus({ json: false })`, asserts no session files in state dir. |
| A007 | Starting a new work item with a session file uses the session timestamp instead of now | ✅ SATISFIED | `work.test.ts:4639`, pre-creates session file with `2026-01-15T10:00:00.000Z`, asserts `saves.work_started_at` equals that value. |
| A008 | The session file is deleted before the timestamp is written to saves | ✅ SATISFIED | `work.test.ts:4668`, asserts `existsSync(sessionPath)` is false after startWork. Ordering verified by source inspection: `work.ts:1834` calls `unlinkSync` before `writeTimestamp` at line 1845. |
| A009 | Starting a new work item without a session file uses the current time | ✅ SATISFIED | `work.test.ts:4685`, brackets startWork with `Date.now()` before/after, asserts timestamp is within range. |
| A010 | The writeTimestamp function accepts an optional timestamp parameter | ✅ SATISFIED | `work.test.ts:4699`, pre-creates session file with known timestamp, asserts `saves.work_started_at === '2026-01-15T10:00:00.000Z'`. |
| A011 | The writeTimestamp function uses now() when no timestamp is provided | ✅ SATISFIED | `work.test.ts:4718`, brackets with Date.now(), asserts timestamp within range. |
| A012 | Session files with invalid JSON are ignored and work start falls back to now | ✅ SATISFIED | `work.test.ts:4732`, writes `'not valid json!!!'`, asserts timestamp is within before/after range. |
| A013 | The session file is still deleted even when it contains invalid JSON | ✅ SATISFIED | `work.test.ts:4745`, writes invalid JSON, asserts `existsSync(sessionPath)` is false. Implementation confirms: `unlinkSync` at line 1834 runs before `JSON.parse` at line 1835, so file is deleted even when parse throws. |
| A014 | Only the new-slug path in startWork reads session files | ✅ SATISFIED | `work.test.ts:4750`, creates project with existing slug, pre-creates session file, calls `startWork('existing-slug')`, asserts session file still exists. |
| A015 | The --session flag is registered on the status subcommand only | ✅ SATISFIED | `work.test.ts:4772`, reads source and regex-matches statusCommand block for `--session`, verifies startCommand and completeCommand blocks do NOT contain it. Source-reading test — see findings. |
| A016 | Ana's dogfood prompt tells it to run work status with the session flag | ✅ SATISFIED | `work.test.ts:4788`, reads `.claude/agents/ana.md`, asserts `toContain('ana work status --session')`. |
| A017 | The template prompt for new installations includes the session flag | ✅ SATISFIED | `work.test.ts:4794`, reads `templates/.claude/agents/ana.md`, asserts `toContain('ana work status --session')`. |

**Summary:** 16 SATISFIED, 1 UNSATISFIED (A003).

## Independent Findings

The implementation is clean and well-structured. The builder made good architectural decisions: `spawnSync` over `execSync` for structured exit code handling, correct delete-then-use ordering, clean `timestamp ?? new Date().toISOString()` fallback, proper `--session` placement on the status subcommand only. The three spec gotchas (ppid vs Claude PID, subcommand placement, delete-then-use) were all handled correctly.

The primary issue is test quality. One test is a tautology (A003), and the conditional PID guard pattern creates a systemic risk across 8 tests.

## AC Walkthrough

- [x] **AC1:** `ana work status --session` writes session file ✅ PASS — verified in code (`work.ts:676-689`) and test (`work.test.ts:4594`). File format is `{ "timestamp": "<UTC ISO string>" }` keyed by Claude PID.
- [x] **AC2:** `ana work start {slug}` reads, deletes, then uses session file ✅ PASS — verified in code (`work.ts:1826-1845`). Delete-then-use ordering confirmed: `unlinkSync` at line 1834, `writeTimestamp` at line 1845.
- [x] **AC3:** Without session file, work start uses now() ✅ PASS — verified by test (`work.test.ts:4685`) and code path (sessionTimestamp stays undefined, `writeTimestamp` uses `?? new Date().toISOString()`).
- [x] **AC4:** PID resolution uses POSIX ps, fails gracefully ✅ PASS — `work.ts:2128` uses `ps -o ppid= -p {process.ppid}`. Three failure paths return null: status !== 0, NaN/non-positive parse, catch block.
- [x] **AC5:** --session flag in both ana.md files ✅ PASS — confirmed in both diffs: `.claude/agents/ana.md` (2 occurrences) and `packages/cli/templates/.claude/agents/ana.md` (2 occurrences).
- [x] **AC6:** Session files in .ana/state/ (gitignored) ✅ PASS — code writes to `.ana/state/session-{pid}.json`. Verified `.ana/.gitignore` contains `state/`.
- [x] **AC7:** Orphan session files are inert ✅ PASS — session files are only consumed on the new-slug path in `startWork`, keyed by PID. An orphan file from a prior session with a different PID is never read.
- [x] **AC8:** Plain `ana work status` does not write session file ✅ PASS — gated by `if (options.session)` at line 677. Tests confirm at `work.test.ts:4614` and `4627`.
- [x] **AC9:** Tests pass ✅ PASS — 2194 passed, 0 failed, 2 skipped.
- [x] **AC10:** No build errors ✅ PASS — build success in 27ms.

## Blockers

A003 is UNSATISFIED. The tagged test (`work.test.ts:4577`) asserts `pid === null || (typeof pid === 'number' && pid > 0)` which is always true — `getClaudePid()` returns `number | null`, and the function already guarantees any returned number is positive (line 2137: `if (isNaN(pid) || pid <= 0) return null`). The test passes on broken AND working code. The implementation IS correct (verified by source inspection at line 2136-2138), but the test doesn't prove it.

**Fix:** Replace the A003 test with one that actually triggers the invalid-output path — e.g., mock `spawnSync` to return stdout of `"abc\n"` and assert the result is `null`.

## Findings

- **Test — A003 is a tautological assertion:** `packages/cli/tests/commands/work.test.ts:4577` — asserts `pid === null || (typeof pid === 'number' && pid > 0)` which is always true for any return of `getClaudePid()`. The test never triggers the invalid-output code path. It passes regardless of whether the `isNaN(pid) || pid <= 0` guard exists. This is the FAIL item.

- **Test — Conditional PID guard makes 8 tests potential no-ops:** `packages/cli/tests/commands/work.test.ts` — tests for A004, A005, A007, A008, A010, A012/A013, and A014 all have `if (claudePid === null) return;`. In any environment where `getClaudePid()` returns null (CI containers, Docker, unusual process trees), these tests pass with zero assertions executed. Locally they work because there's a real process tree. Consider mocking `getClaudePid` to return a known PID for deterministic test behavior.

- **Test — A015 reads source code instead of testing runtime behavior:** `packages/cli/tests/commands/work.test.ts:4756` — reads `work.ts` and regex-matches Commander registration blocks. Violates testing standard ("Never assert on source code content in a test"). However, Commander registration is hard to test behaviorally without a CLI harness, so this is pragmatic. Noted as debt, not a blocker.

- **Test — A008 ordering verified by inspection only:** `packages/cli/tests/commands/work.test.ts:4668` — test proves the file is deleted after `startWork` completes, but doesn't prove it was deleted BEFORE `writeTimestamp`. The ordering is correct in the implementation (verified: `unlinkSync` line 1834, `writeTimestamp` line 1845), but no test enforces it. If someone reorders these lines, the test still passes.

- **Code — Async/sync IO inconsistency:** `packages/cli/src/commands/work.ts` — session file is written with `await fsPromises.writeFile` in `getWorkStatus` (line 684) but read with sync `fs.readFileSync` in `startWork` (line 1832). Works correctly — the sync read in `startWork` is appropriate since it's a small file read in a sequential path. Noted for consistency awareness.

- **Code — spawnSync vs execSync deviation from spec:** `packages/cli/src/commands/work.ts:2128` — spec recommended adding `execSync` to the import, but builder used `spawnSync` (already imported). This is actually better — `spawnSync` returns structured output with exit code, while `execSync` throws on non-zero exit. Good judgment call.

## Deployer Handoff

This is a low-risk, invisible feature — no user-facing output changes. The session marker mechanism is best-effort: every failure path degrades to current behavior (using `now()` for `work_started_at`).

After merge, Ana's prompt will include `--session` flag automatically. Existing user installations won't get the template update until they run `ana init --force` — this is a known distribution gap noted in the spec, not something to fix here.

The one-line fix needed: replace the A003 test with a real test that mocks `spawnSync` to return invalid output and asserts `null`. No implementation changes needed.

## Verdict
**Shippable:** NO
A003 test is a tautology that passes on broken and working code. The implementation is correct — the test is not. One test fix, zero code changes.