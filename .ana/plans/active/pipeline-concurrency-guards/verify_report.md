# Verify Report: Pipeline Concurrency Guards

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-15
**Spec:** .ana/plans/active/pipeline-concurrency-guards/spec.md
**Branch:** feature/pipeline-concurrency-guards

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/pipeline-concurrency-guards/.ana/plans/active/pipeline-concurrency-guards/contract.yaml
  Seal: INTACT (hash sha256:b4a85d19f8a96afc329b6d24f0e4e65388c9811e6d4ec12503d7e94e0b76140d)
```

Tests: 2345 passed, 2 skipped (2347 total, 104 test files). Build: success. Lint: success.
Baseline was 2320 passed — 25 new tests added (same as round 1; fix replaced tests, didn't add).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | A second verify session on the same work item is blocked | ✅ SATISFIED | `work.test.ts:5279` — writes recent `verify_started_at`, calls `startWork`, asserts `process.exit(1)` and error contains "verify session is already in progress" |
| A002 | A second plan session on the same work item is blocked | ✅ SATISFIED | `work.test.ts:5317` — writes recent `plan_started_at`, calls `startWork`, asserts `process.exit(1)` and error contains "plan session is already in progress" |
| A003 | The force flag overrides the verify concurrency guard | ✅ SATISFIED | `work.test.ts:5349` — calls `startWork('test-slug', { force: true })`, asserts no `exit(1)`, log contains "Overriding active verify session" |
| A004 | The force flag overrides the plan concurrency guard | ✅ SATISFIED | `work.test.ts:5386` — calls `startWork('test-slug', { force: true })`, asserts no `exit(1)`, log contains "Overriding active plan session" |
| A005 | Stale timestamps older than 1 hour are ignored automatically | ✅ SATISFIED | `work.test.ts:5420` — writes 2-hour-old `verify_started_at`, calls `startWork`, asserts no blocking |
| A006 | Missing saves.json does not block session start | ✅ SATISFIED | `work.test.ts:5462` — calls `checkConcurrencyGuard` on nonexistent dir, asserts `blocked === false` |
| A007 | Corrupted saves.json does not block session start | ✅ SATISFIED | `work.test.ts:5471` — writes `{{not json` to `.saves.json`, asserts `blocked === false` |
| A008 | An active verify session does not block a build session on the same work item | ✅ SATISFIED | `work.test.ts:5479` — writes `verify_started_at`, checks `build_started_at` key, asserts `blocked === false` |
| A009 | An active verify session on one work item does not block verify on a different work item | ✅ SATISFIED | `work.test.ts:5492` — writes to slug-a dir, checks slug-b dir, asserts `blocked === false` |
| A010 | Work status shows verify-in-progress when a verify session is active | ✅ SATISFIED | `work.test.ts:5505` — creates worktree with build_report, writes recent `verify_started_at`, captures `getWorkStatus` output, asserts contains "verify-in-progress" |
| A011 | Work status shows plan-in-progress when a plan session is active | ✅ SATISFIED | `work.test.ts:5530` — creates project with scope only, writes recent `plan_started_at`, captures `getWorkStatus` output, asserts contains "plan-in-progress" |
| A012 | Verify-in-progress stage shows guidance to use --force | ✅ SATISFIED | `work.test.ts:5550` — creates verify-in-progress scenario, captures output, asserts contains "--force" |
| A013 | Plan-in-progress stage shows guidance to use --force | ✅ SATISFIED | `work.test.ts:5575` — creates plan-in-progress scenario, captures output, asserts contains "--force" |
| A014 | Creating a PR is blocked when a merged PR already exists for the branch | ✅ SATISFIED | `pr.test.ts:464` — mocks `spawnSync` for `gh pr list` returning `[{state:'MERGED'}]`, calls `createPr('test-feature')`, asserts `process.exit(1)` and error contains "was already merged" |
| A015 | The merged-PR error message directs the user to work complete | ✅ SATISFIED | `pr.test.ts:464` — same test, `errorOutput` asserts `toContain('work complete')`. Contract: stderr contains "work complete". |
| A016 | Creating a PR is blocked when an open PR already exists for the branch | ✅ SATISFIED | `pr.test.ts:491` — mocks `gh pr list` returning `[{state:'OPEN', url:'https://...pull/140'}]`, calls `createPr`, asserts `process.exit(1)` and error contains "is already open" |
| A017 | The open-PR error message includes the existing PR URL | ✅ SATISFIED | `pr.test.ts:491` — same test, `errorOutput` asserts `toContain('https://github.com/org/repo/pull/140')`. Contract: stderr contains "https://". |
| A018 | PR creation proceeds when no existing PR is found | ✅ SATISFIED | `pr.test.ts:518` — mocks `gh pr list` returning `[]`, calls `createPr`, asserts no guard messages in stderr and `logOutput` contains "PR created". Contract: guardPassed equals true — demonstrated by function proceeding past guard to create PR. |
| A019 | Merged PRs are detected via GitHub CLI even when git is-ancestor fails | ✅ SATISFIED | `work.test.ts:5632` — creates unmerged feature branch (is-ancestor would fail), mocks `gh pr list --state` to return `'MERGED\n'`, calls `completeWork`, asserts slug archived to `plans/completed`. Contract: merged equals true. |
| A020 | Merge detection falls back to is-ancestor when GitHub CLI is unavailable | ✅ SATISFIED | `work.test.ts:5711` — creates and merges feature branch (is-ancestor succeeds), mocks all `gh` commands to fail, calls `completeWork`, asserts slug archived to `plans/completed`. Contract: merged equals true. |
| A021 | Verify timestamp overwrites previous value on re-entry | ✅ SATISFIED | `work.test.ts:5602` — writes old timestamp `2026-01-01T00:00:00.000Z`, calls `startWork`, reads `.saves.json`, asserts `verify_started_at !== oldTimestamp` |
| A022 | The start command accepts a --force flag | ✅ SATISFIED | `work.test.ts:5779` — reads source, confirms `startCommand` block contains `--force`. Structural verification of option registration — acceptable as enforcement test per testing-standards. Source at `work.ts:2439` confirms `.option('--force', ...)`. |

**Summary:** 22 SATISFIED, 0 UNSATISFIED.

## Independent Findings

### Prediction Resolution

1. **Prediction: Builder mocked at too high a level** — NOT FOUND. The builder mocked `spawnSync` at the right level — intercepting `gh` commands while passing git commands through to the real implementation. Clean separation.

2. **Prediction: Test count unchanged means fewer edge cases** — PARTIALLY CONFIRMED. Test count is the same (2345) because old tests were replaced, not added. The new behavioral tests for A019/A020 are more thorough than the old source-content tests (they create real git repos and call `completeWork`), but the PR tests are roughly equivalent in coverage — they test the three main cases (merged, open, none) without boundary cases like malformed JSON from `gh`.

3. **Prediction: Merge detection tests may miss one mock layer** — NOT FOUND. A019 mocks `spawnSync` for `gh` and lets `runGit` (which uses `execFileSync`, not `spawnSync`) pass through to real git. A020 also mocks `spawnSync` for `gh` to fail and uses a real merged branch for `is-ancestor` to succeed naturally. Both approaches are correct.

4. **Prediction: Non-blocker findings untouched** — CONFIRMED. Dead `force` param, `isTimestampRecent` duplication, inside-worktree bypass, boundary test gap, `plan_started_at` force-write — all still present. Expected since these were not blockers.

5. **Prediction: Mock cleanup issues** — NOT FOUND. Both test files use `vi.mocked(spawnSync).mockRestore()` in `afterEach` (pr.test.ts:461) or inline after each test (work.test.ts:5704, 5772). Clean.

### Surprise Finding
The A019 mock returns raw `'MERGED\n'` as stdout, matching what the `-q '.[0].state'` jq filter would produce. However, if `gh` is invoked without jq support or the jq filter syntax changes, the mock wouldn't catch it — the mock bypasses the JSON-to-jq parsing path entirely. This is a minor fidelity gap, not a correctness issue: the implementation's jq filter is `.[0].state` which extracts the state string, and the test verifies the code handles that string correctly.

## Previous Findings Resolution

### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A014 | Source-content test read pr.ts for `pr.state === 'MERGED'` string | ✅ SATISFIED | Builder added behavioral test: mocks `gh pr list`, calls `createPr`, asserts `process.exit(1)` and error message |
| A015 | Source-content test checked for `'work complete'` string in source | ✅ SATISFIED | Same behavioral test asserts `errorOutput.toContain('work complete')` from captured `console.error` calls |
| A016 | Source-content test read pr.ts for `pr.state === 'OPEN'` string | ✅ SATISFIED | Builder added behavioral test: mocks `gh pr list` with OPEN state, calls `createPr`, asserts `process.exit(1)` |
| A017 | Source-content test checked for `'pr.url'` string literal in source | ✅ SATISFIED | Behavioral test asserts `errorOutput.toContain('https://github.com/org/repo/pull/140')` — actual URL, not variable name |
| A018 | Source-content test checked for loop structure in source | ✅ SATISFIED | Behavioral test: mocks empty PR list, calls `createPr`, asserts no guard messages and "PR created" in output |
| A019 | Source-content test checked string ordering (gh list index < is-ancestor index) | ✅ SATISFIED | Full behavioral test: creates unmerged branch, mocks gh to return MERGED, calls `completeWork`, asserts archival |
| A020 | Source-content test checked for presence of merge-related strings | ✅ SATISFIED | Full behavioral test: creates merged branch, mocks gh to fail, calls `completeWork`, asserts archival via is-ancestor |

### Previous Findings
| Finding | Status | Notes |
|---------|--------|-------|
| PR duplicate detection tests use source-content assertions | Fixed | Replaced with behavioral tests using `spawnSync` mocks |
| Merge detection reorder tests use source-content assertions | Fixed | Replaced with behavioral tests using real git repos and `spawnSync` mocks |
| `checkConcurrencyGuard` has dead `force` parameter | Still present | `work.ts:2304` — param exists, production call sites at 2007/2033 never pass it. Not a blocker. |
| `isTimestampRecent` duplicates `checkConcurrencyGuard` logic | Still present | `work.ts:365` vs `work.ts:2300` — same pattern, different return types. Debt, not a bug. |
| Inside-worktree resume path skips concurrency guard | Still present | `work.ts:1888` — intentional resume behavior, guard bypass is by design |
| No boundary test at exactly 1-hour timeout | Still present | Tests use 2hr (stale) and now() (fresh). Missing 59m59s/60m01s edge cases. |
| `plan_started_at` now written with `force: true` | Still present | `work.ts:2017` — over-building for consistency, not harmful |

## AC Walkthrough
- [x] AC1: `ana work start {slug}` blocks with an error when `verify_started_at` exists and is recent — ✅ PASS — test at `work.test.ts:5279` runs `startWork`, asserts `exit(1)` and error message.
- [x] AC2: `ana work start {slug}` blocks when `plan_started_at` is recent — ✅ PASS — test at `work.test.ts:5317`.
- [x] AC3: `--force` overrides both guards — ✅ PASS — tests at `work.test.ts:5349` (verify) and `work.test.ts:5386` (plan).
- [x] AC4: `ana work status` displays `verify-in-progress` — ✅ PASS — test at `work.test.ts:5505`, output contains "verify-in-progress".
- [x] AC5: `ana work status` displays `plan-in-progress` — ✅ PASS — test at `work.test.ts:5530`, output contains "plan-in-progress".
- [x] AC6: `ana pr create` refuses when MERGED PR exists — ✅ PASS — behavioral test at `pr.test.ts:464`, mocks `gh pr list`, calls `createPr`, asserts `exit(1)` and "was already merged" + "work complete".
- [x] AC7: `ana pr create` refuses when OPEN PR exists — ✅ PASS — behavioral test at `pr.test.ts:491`, mocks `gh pr list`, calls `createPr`, asserts `exit(1)` and "is already open" + URL.
- [x] AC8: `ana work complete` detects merged PR via `gh pr list --state merged` — ✅ PASS — behavioral test at `work.test.ts:5632`, creates unmerged branch, mocks gh to return MERGED, verifies archival.
- [x] AC9: `ana work complete` falls back to `is-ancestor` when `gh` unavailable — ✅ PASS — behavioral test at `work.test.ts:5711`, merges branch, mocks gh to fail, verifies archival.
- [x] AC10: `verify_started_at` written with `force: true` — ✅ PASS — test at `work.test.ts:5602` plus source at `work.ts:1888` and `work.ts:2042`.
- [x] AC11: 1-hour timeout auto-expires stale timestamps — ✅ PASS — test at `work.test.ts:5420` uses 2-hour-old timestamp.
- [x] AC12: `getNextAction` returns guidance for new stages — ✅ PASS — tests at `work.test.ts:5550` and `work.test.ts:5575`.
- [x] AC13: Same slug, same phase → blocked — ✅ PASS — tests A001 and A002.
- [x] AC14: Same slug, different phase → allowed — ✅ PASS — test A008.
- [x] AC15: Different slug → allowed — ✅ PASS — test A009.
- [x] No build errors — ✅ PASS — `pnpm run build` succeeded.
- [x] Tests pass — ✅ PASS — 2345 passed, 2 skipped, 0 failed.

**Summary:** 17 of 17 ACs pass.

## Blockers

No blockers. All 22 contract assertions satisfied. All 17 acceptance criteria pass. Tests pass (2345), build succeeds, lint clean. No regressions from baseline (2320 → 2345, +25 new tests).

Checked for: unused exports in new code (none — `checkConcurrencyGuard` is exported and imported by tests, `ConcurrencyGuardResult` type exported and used), unused parameters in new functions (`force` param in `checkConcurrencyGuard` has a default and is exercised by tests though not production — noted in findings), error paths that swallow silently (the JSON parse `catch` at `pr.ts:222` silently continues — intentional, matches the existing gh check pattern), unhandled edge cases in the guard (empty string timestamps, NaN dates, missing keys all handled by the guard).

## Findings

- **Code — `checkConcurrencyGuard` has dead `force` parameter:** `packages/cli/src/commands/work.ts:2304` — accepts `force: boolean = false` but neither production call site (line 2007, line 2033) passes it. Force handling is done by the caller after the guard returns `blocked: true`. The parameter is only exercised by direct unit tests. Not a bug — the caller pattern works correctly — but the API is misleading.

- **Code — `isTimestampRecent` duplicates `checkConcurrencyGuard` logic:** `packages/cli/src/commands/work.ts:365` vs `packages/cli/src/commands/work.ts:2300` — Both parse `.saves.json`, extract a timestamp key, validate it, and compare against `CONCURRENCY_TIMEOUT_MS`. `isTimestampRecent` is the simpler version for `determineStage` (returns bool). Could call `checkConcurrencyGuard` internally: `return checkConcurrencyGuard(savesDir, key, '').blocked`.

- **Code — Inside-worktree resume path skips concurrency guard:** `packages/cli/src/commands/work.ts:1888` — When running `ana work start` from inside the worktree (same slug), `verify_started_at` is written with `force: true` but no `checkConcurrencyGuard` call precedes it. The outside-worktree path at line 2033 does check the guard. This is arguably intentional (resume scenario where you're already in the worktree means you're the active session), but it creates a bypass path that isn't documented.

- **Test — No boundary test at exactly 1-hour timeout:** `packages/cli/tests/commands/work.test.ts` — Tests use 2-hour-old timestamp (stale) and `new Date()` (fresh). No test at `Date.now() - 59*60*1000` (just under) or `Date.now() - 61*60*1000` (just over). The boundary is `>= CONCURRENCY_TIMEOUT_MS` at `checkConcurrencyGuard:2333`, meaning exactly-1-hour timestamps are treated as expired. A boundary test would pin this behavior.

- **Code — `plan_started_at` written with `force: true`:** `packages/cli/src/commands/work.ts:2017` — Spec mentions `verify_started_at` force-write explicitly but not `plan_started_at`. Builder extended the pattern for consistency. Not harmful — prevents the same write-once problem — but is over-building relative to what was specified.

- **Test — A019 mock returns raw string instead of JSON:** `packages/cli/tests/commands/work.test.ts:5686` — The mock returns `'MERGED\n'` as stdout for `gh pr list`. The implementation passes `-q '.[0].state'` to gh, which produces this exact output. But the mock bypasses gh's JSON parsing + jq filtering entirely. If the `-q` flag or jq filter were wrong, the test would still pass. Minor fidelity gap — the implementation's filter is correct by inspection.

- **Test — A019/A020 heavyweight test setup:** `packages/cli/tests/commands/work.test.ts:5633-5777` — Both tests create full git repos with bare remotes, multiple branches, and committed artifacts. This is ~70 lines of setup per test. The approach is correct (it tests the real code path through `completeWork`) but could be extracted to a helper similar to `createTestProjectForGuards`. Not a quality issue — a maintainability observation.

## Deployer Handoff

The fix cycle replaced 3 source-content tests with 5 behavioral tests. All 7 previously-UNSATISFIED assertions now pass with proper behavioral verification. No source files changed — only test files.

After merge: no migration needed. Same deployer notes as round 1 — guards read `.saves.json` which already exists, new `--force` flag is backward-compatible, new stage values (`verify-in-progress`, `plan-in-progress`) are display-only.

The branch is 8 commits behind main. Rebase before merge to pick up recent changes.

## Verdict
**Shippable:** YES
All 22 contract assertions satisfied. All 17 acceptance criteria pass. The 7 previously-UNSATISFIED assertions are now covered by proper behavioral tests that mock `spawnSync`, call the real functions, and assert on outputs. Tests pass, build succeeds, lint clean. The remaining findings are debt and observations — no blockers.
