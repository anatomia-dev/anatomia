# Verify Report: work complete --merge flag

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-09
**Spec:** .ana/plans/active/work-complete-merge/spec.md
**Branch:** feature/work-complete-merge

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/work-complete-merge/.ana/plans/active/work-complete-merge/contract.yaml
  Seal: INTACT (hash sha256:95d27b3d98d88e88467cf80b44a0cce8833b6c6fac679890f806cad24aa49806)
```

Seal status: **INTACT**

Tests: 2047 passed, 2 skipped (2049 total), 96 test files. Build: clean. Lint: 0 errors, 1 pre-existing warning (unused eslint-disable directive in scan-engine).

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Merging and completing in one command produces a successful completion | ✅ SATISFIED | `work-merge.test.ts:129-161` — `@ana A001`, asserts exit code 0 (no thrown exit), completed dir exists |
| A002 | The merge step calls gh pr merge without a strategy flag | ✅ SATISFIED | `work-merge.test.ts:151-154` — `@ana A002`, asserts mergeCall does not contain `--squash` or `--rebase` |
| A003 | The merge step never uses --delete-branch | ✅ SATISFIED | `work-merge.test.ts:155` — `@ana A003`, asserts mergeCall does not contain `--delete-branch` |
| A004 | Running without --merge behaves identically to before | ✅ SATISFIED | `work.test.ts:916-923` — `@ana A004`, calls `completeWork('test-slug')` without merge, asserts completion |
| A005 | Pending checks trigger auto-merge attempt | ✅ SATISFIED | `work-merge.test.ts:164-190` — `@ana A005`, mocks checks pending stderr, asserts output contains `auto-merge` |
| A006 | Successful auto-merge tells the user to come back after the PR merges | ✅ SATISFIED | `work-merge.test.ts:188` — `@ana A006`, asserts output contains `work complete` |
| A007 | Auto-merge failure tells the user to merge manually | ✅ SATISFIED | `work-merge.test.ts:213` — `@ana A007`, asserts `Merge manually` (capital M; contract says lowercase — casing difference, spirit met) |
| A008 | Branch behind shows rebase commands with the worktree path | ✅ SATISFIED | `work-merge.test.ts:234` — `@ana A008`, asserts output contains `rebase` |
| A009 | Branch behind includes force-with-lease push command | ✅ SATISFIED | `work-merge.test.ts:235` — `@ana A009`, asserts output contains `--force-with-lease` |
| A010 | Branch behind warns about approval dismissal | ✅ SATISFIED | `work-merge.test.ts:236` — `@ana A010`, asserts output contains `approvals` |
| A011 | Already-merged PR skips the merge step and completes normally | ✅ SATISFIED | `work-merge.test.ts:240-258` — `@ana A011`, mocks MERGED state, asserts `already merged` in output and completion dir exists |
| A012 | Missing PR tells the user to create one first | ✅ SATISFIED | `work-merge.test.ts:261-280` — `@ana A012`, asserts output contains `ana pr create` |
| A013 | Multiple merge strategies tells the user to merge manually | ✅ SATISFIED | `work-merge.test.ts:283-301` — `@ana A013`, asserts `Merge manually` (same casing note as A007) |
| A014 | Unknown merge errors show the raw gh output | ✅ SATISFIED | `work-merge.test.ts:304-322` — `@ana A014`, asserts output contains `unexpected gh error text` |
| A015 | Base branch mismatch prevents the merge | ✅ SATISFIED | `work-merge.test.ts:325-340` — `@ana A015`, mocks baseRefName `develop`, asserts output contains `must target` |
| A016 | Missing gh CLI shows install instructions | ✅ SATISFIED | `work-merge.test.ts:343-354` — `@ana A016`, mocks gh returning status 1, asserts output contains `https://cli.github.com/` |
| A017 | Failed merge exits before any archive or commit happens | ✅ SATISFIED | `work-merge.test.ts:261-280` — `@ana A017`, asserts active path still exists (no archive happened) |
| A018 | The --admin flag is never passed to gh | ✅ SATISFIED | `work-merge.test.ts:156` — `@ana A018`, asserts mergeCall does not contain `--admin` |
| A019 | Verify agent PASS output mentions the --merge option | ✅ SATISFIED | `work.test.ts:920-923` — `@ana A019`, template content contains `ana work complete --merge` |
| A020 | Work status next-action for ready-to-merge mentions --merge | ✅ SATISFIED | `work.test.ts:935-940` — `@ana A020`, source content check confirms string present. Source inspection of `work.ts:524` confirms the return value. |
| A021 | Verification-passed message mentions the --merge option | ✅ SATISFIED | `work.test.ts:943-948` — `@ana A021`, source content check confirms string present. Source inspection of `work.ts:1829` confirms `console.log` with `--merge`. |
| A022 | Ana's pipeline state table mentions the --merge option | ✅ SATISFIED | `work.test.ts:951-955` — `@ana A022`, template content contains `ana work complete --merge` |
| A023 | Verify agent guardrails are not modified | ✅ SATISFIED | `work.test.ts:958-962` — `@ana A023`, template contains exact guardrail text. Verified at `ana-verify.md:495` (shifted +1 from template addition). |
| A024 | Verify agent 'don't run work complete' guardrail is unchanged | ✅ SATISFIED | `work.test.ts:965-969` — `@ana A024`, template contains exact guardrail text. Verified at `ana-verify.md:499` (shifted +1). |
| A025 | Wrong branch error mentions --merge context when the flag is used | ✅ SATISFIED | `work.test.ts:972-988` — `@ana A025`, asserts output contains `` `--merge` handles the merge ``. Source verified at `work.ts:1021`. |

## Independent Findings

**Predictions resolved:**

1. **Missed `--json` on some failure paths** — Not confirmed. All 7 failure paths include `if (options?.json)` JSON output. However, the auto-merge enabled path writes plain text to stdout before JSON (see finding below).
2. **Overly broad stderr keyword matching** — Acceptable. The keywords (`behind`, `required status check`, `merge strategy`) are specific enough for `gh pr merge` context.
3. **No `--json` tests** — Confirmed. No tests verify the structured JSON output for any failure path. All tests only check human-readable console output.
4. **Template line numbers drifted** — Confirmed. Guardrail lines shifted from 494/498 to 495/499 due to the added template line. Content is intact — the contract checks content, not position.
5. **`getNextAction` multi-line return** — Confirmed as a formatting issue. The `\n` in the return value causes the second line to render without the `→` prefix, indentation, or cyan styling in `printHumanReadable` at line 632.

**Production risk predictions:**
- `gh` stderr format changes across versions — the keyword matching is resilient (broad keywords + catch-all), acceptable risk.
- TOCTOU between `gh pr view` and `gh pr merge` — PR could merge between the two calls. The `gh pr merge` on an already-merged PR returns an error, which would fall through to the catch-all. Acceptable for a CLI tool.

**Surprise finding:** The builder created a separate test file (`work-merge.test.ts`) not listed in the contract's `file_changes`. This is a good engineering decision — module-level `vi.mock` on `spawnSync` would interfere with all other tests in `work.test.ts`. The separation is clean and well-documented in the file header.

## AC Walkthrough
- AC1: `ana work complete --merge {slug}` merges and completes — ✅ PASS — `work-merge.test.ts:129-161`, test creates merged project, mocks gh, verifies completion directory exists.
- AC2: Without `--merge`, behavior unchanged — ✅ PASS — `work.test.ts:916-923`, calls `completeWork` without merge option, verifies completion. All 2047 existing tests pass (no regressions).
- AC3: Merge uses `gh pr merge` without `--delete-branch` or strategy flag — ✅ PASS — `work-merge.test.ts:151-155`, asserts merge call excludes `--squash`, `--rebase`, `--delete-branch`.
- AC4: Pending checks trigger `--auto` attempt, success shows PR number and tells user to return — ✅ PASS — `work-merge.test.ts:164-190`.
- AC5: `--auto` failure tells user to merge manually — ✅ PASS — `work-merge.test.ts:193-214`.
- AC6: Branch behind shows rebase commands with worktree path, `--force-with-lease`, and approval warning — ✅ PASS — `work-merge.test.ts:217-237`.
- AC7: Already-merged PR skips merge and completes normally — ✅ PASS — `work-merge.test.ts:240-258`.
- AC8: No PR tells user to create one — ✅ PASS — `work-merge.test.ts:261-280`.
- AC9: Multiple merge strategies tells user to merge manually — ✅ PASS — `work-merge.test.ts:283-301`.
- AC10: Unknown error shows raw stderr — ✅ PASS — `work-merge.test.ts:304-322`.
- AC11: Base branch mismatch prevents merge — ✅ PASS — `work-merge.test.ts:325-340`.
- AC12: `gh` not installed shows install instructions — ✅ PASS — `work-merge.test.ts:343-354`.
- AC13: All failure paths exit before completion — ✅ PASS — `work-merge.test.ts:277-279` verifies active path still exists for no-PR case; all failure mocks throw `process.exit` before completion logic.
- AC14: `--admin` never used — ✅ PASS — `work-merge.test.ts:156`, asserts `--admin` not in merge call args.
- AC15: Verify agent template PASS output includes `--merge` — ✅ PASS — `work.test.ts:920-923`, template diff verified.
- AC16: `work status` next-action for `ready-to-merge` includes `--merge` — ✅ PASS — source inspection `work.ts:524`.
- AC17: Verification-passed message includes `--merge` — ✅ PASS — source inspection `work.ts:1829`.
- AC18: Ana's pipeline state table includes `--merge` — ✅ PASS — `work.test.ts:951-955`, template diff verified.
- AC19: Verify agent guardrails not modified — ✅ PASS — `ana-verify.md:495` and `ana-verify.md:499` contain exact text. Lines shifted +1 from template edit above; content unchanged.
- Tests pass — ✅ PASS — 2047 passed, 2 skipped (2049 total), 96 test files.
- Build clean — ✅ PASS — `pnpm run build` succeeds.
- Lint clean — ✅ PASS — 0 errors, 1 pre-existing warning.

## Blockers
No blockers. All 25 contract assertions satisfied. All ACs pass. No regressions (2047 tests pass, up from 2029 baseline — 18 new tests added). Checked: no unused parameters in new code (all function params consumed), no unhandled error paths in new code (all failure branches exit cleanly), no `--admin` or `--delete-branch` in any `gh` call, no dead code blocks in the merge logic.

## Findings

- **Test — A020, A021 assert on source code content instead of testing behavior:** `packages/cli/tests/commands/work.test.ts:936-948` — Both tests read `work.ts` source with `readFileSync` and check `toContain`. This proves the string exists in code, not that users see it. Testing standards say "Never assert on source code content." Pragmatically acceptable here — `getNextAction` and the verification-passed message are hard to exercise in isolation without heavy mocking. Not a blocker.

- **Test — No tests verify `--json` output for any merge failure path:** `packages/cli/tests/commands/work-merge.test.ts` — All 7 failure paths include `if (options?.json)` JSON output in production, but no test passes `{ merge: true, json: true }` and asserts the JSON envelope structure. The `wrapJsonError` function is separately tested, but the integration (correct reason code, correct context fields per failure mode) is unverified.

- **Code — `JSON.parse` on `gh pr view` stdout has no try/catch:** `packages/cli/src/commands/work.ts:1061` — If `gh pr view` returns status 0 with malformed output, `JSON.parse` throws an unhandled exception. In practice `gh --json` always returns valid JSON on success, but the defensive pattern used elsewhere (`gh pr view` at line 1226 with status check) doesn't protect against parse failure either. Pre-existing pattern, but this is a new instance.

- **Code — `getNextAction` multi-line return breaks status output formatting:** `packages/cli/src/commands/work.ts:524` — The `\n` in the return value causes the second line to render without the `→` prefix, indentation, or cyan styling when displayed by `printHumanReadable` at line 632. The output will look like:
  ```
      → Review PR, then: ana work complete slug
  Or to merge and complete: ana work complete --merge slug
  ```
  The second line is unstyled and left-aligned. Consider either (a) making `printHumanReadable` handle multi-line nextAction, or (b) keeping the nextAction single-line and appending the `--merge` text with a separator like ` | `.

- **Code — Auto-merge enabled path writes plain text to stdout before JSON:** `packages/cli/src/commands/work.ts:1096-1101` — `console.log` messages precede the JSON envelope on stdout. A `--json` consumer piping stdout through `jq` would get a parse error. This is the same pattern used in the existing completion success path, so it's pre-existing, but worth noting for the module.

- **Code — Separate test file not in contract `file_changes`:** `packages/cli/tests/commands/work-merge.test.ts` — The contract lists `work.test.ts` as the only test file to modify. The builder also created `work-merge.test.ts` (355 lines) for mock isolation. This is a reasonable deviation — module-level `vi.mock` on `spawnSync` would interfere with all other tests. Well-documented in the file header comment.

- **Upstream — Contract A007 and A013 values have case mismatch:** Contract specifies `"merge manually"` (lowercase) but the code outputs `"Merge manually"` (capital M). The tests correctly assert against the actual output. The contract values should use the actual casing for precision.

## Deployer Handoff

1. This adds `--merge` to `ana work complete`. No breaking changes — without `--merge`, behavior is identical.
2. Runtime dependency: `gh` CLI must be installed and authenticated for `--merge` to work. The code guards for missing `gh` with a clear install message.
3. The `getNextAction` formatting for `ready-to-merge` stage now includes a second line that renders without styling in `ana work status`. Cosmetic only — doesn't affect functionality.
4. Template changes to `ana-verify.md` and `ana.md` update agent guidance to mention the `--merge` option. These take effect on next `ana init`.
5. A new test file `work-merge.test.ts` was added alongside the expected `work.test.ts` changes. Both files test different aspects of the merge feature.

## Verdict
**Shippable:** YES

All 25 contract assertions satisfied. All acceptance criteria pass. 2047 tests pass with 18 new tests added, no regressions. Build and lint clean. The findings are real (unguarded JSON.parse, missing `--json` test coverage, formatting nit) but none prevent shipping. The merge logic is well-structured with clear escalation paths and clean separation from the existing completion flow.
