# Verify Report: Commit hygiene checks at build-report save

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-14
**Spec:** .ana/plans/active/commit-hygiene-checks/spec.md
**Branch:** feature/commit-hygiene-checks

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/commit-hygiene-checks/contract.yaml
  Seal: INTACT (hash sha256:2fe3f598a118f521a46a9c8679d48d3b331ead1d19421fb17a9b9b4fc4ee87dc)
```

Seal status: **INTACT**

Tests: 2251 passed, 2 skipped (101 test files). Build: clean (typecheck + tsup). Lint: 1 warning (pre-existing unused eslint-disable directive in secrets.ts — not introduced by this build).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Hygiene checks run when saving a build report | ✅ SATISFIED | `commit-hygiene.test.ts:249` — writes modules_touched, calls function, asserts commit_hygiene key exists in saves.json. Call sites confirmed at `artifact.ts:1439` and `artifact.ts:1732` gated by `baseType === 'build-report'` |
| A002 | Hygiene checks do not run for non-build-report saves | ✅ SATISFIED | `commit-hygiene.test.ts:257` — verifies key absence when function not called. Gating confirmed by source: `artifact.ts:1437` checks `typeInfo.baseType === 'build-report'` |
| A003 | No additional git diff calls during hygiene checks | ✅ SATISFIED | `commit-hygiene.test.ts:267` — runs in non-git temp dir, succeeds finding .env. Source confirmed: `runCommitHygieneChecks` has zero `runGit` calls |
| A004 | Lockfile changed without manifest is flagged | ✅ SATISFIED | `commit-hygiene.test.ts:60` — modules_touched=['pnpm-lock.yaml'], asserts findings[0].check === 'lockfile-desync' |
| A005 | Lockfile changed alongside manifest is not flagged | ✅ SATISFIED | `commit-hygiene.test.ts:69` — both pnpm-lock.yaml and package.json in modules_touched, asserts findings.length === 0 |
| A006 | Any package.json in monorepo satisfies lockfile | ✅ SATISFIED | `commit-hygiene.test.ts:77` — pnpm-lock.yaml + packages/api/package.json, asserts findings.length === 0 |
| A007 | Committed file with API key is flagged | ✅ SATISFIED | `commit-hygiene.test.ts:102` — creates file with `phc_testaaaaabbbbbcccccddddd`, asserts findings[0].check === 'secret-detected' |
| A008 | Secrets in test files are not flagged | ✅ SATISFIED | `commit-hygiene.test.ts:113` — creates `stripe.test.ts` with same secret, asserts findings.length === 0 |
| A009 | Secret regex resets between files | ✅ SATISFIED | `commit-hygiene.test.ts:121` — two files each with a secret, asserts findings.length === 2 |
| A010 | File with merge conflict markers is flagged | ✅ SATISFIED | `commit-hygiene.test.ts:146` — file with `<<<<<<<`/`=======`/`>>>>>>>`, asserts findings[0].check === 'conflict-marker' |
| A011 | File without conflict markers is not flagged | ✅ SATISFIED | `commit-hygiene.test.ts:163` — clean file, asserts findings.length === 0 |
| A012 | .env file in branch diff is flagged | ✅ SATISFIED | `commit-hygiene.test.ts:173` — modules_touched=['.env'], asserts findings[0].check === 'env-file' |
| A013 | .env.example not flagged | ✅ SATISFIED | `commit-hygiene.test.ts:199` — modules_touched=['.env.example'], asserts findings.length === 0 |
| A014 | .env.test not flagged | ✅ SATISFIED | `commit-hygiene.test.ts:206` — modules_touched=['.env.test'], asserts findings.length === 0 |
| A015 | Findings print as yellow warnings | ✅ SATISFIED | `commit-hygiene.test.ts:215` — spies on console.error, asserts output contains 'Commit hygiene:' |
| A016 | Save completes even with findings | ✅ SATISFIED | `commit-hygiene.test.ts:223` — calls with .env and .env.local, no throw, saves.json has both commit_hygiene and modules_touched |
| A017 | Each finding has check, file, severity, message | ✅ SATISFIED | `commit-hygiene.test.ts:236` — asserts toHaveProperty for all four fields |
| A018 | Proof summary includes commit hygiene from saves.json | ✅ SATISFIED | `commit-hygiene.test.ts:333` — writes saves.json with commit_hygiene, calls generateProofSummary, asserts summary.commit_hygiene[0].check === 'env-file' |
| A019 | Proof chain entry includes commit hygiene data | ✅ SATISFIED | `commit-hygiene.test.ts:416` — type-level test constructing ProofChainEntry with commit_hygiene. Source confirmed: `work.ts:912` spreads commitHygiene into entry |
| A020 | Proof card shows commit hygiene when findings exist | ✅ SATISFIED | `commit-hygiene.test.ts:386` — formatHumanReadable with commit_hygiene findings, asserts output contains 'Commit Hygiene' |
| A021 | Proof card omits commit hygiene when no findings | ✅ SATISFIED | `commit-hygiene.test.ts:397` — formatHumanReadable with empty array, asserts output not contains 'Commit Hygiene'. Also tests undefined case at line 403 |
| A022 | Empty modules_touched produces no findings | ✅ SATISFIED | `commit-hygiene.test.ts:281` — empty array, asserts findings.length === 0 |
| A023 | Missing saves.json handled gracefully | ✅ SATISFIED | `commit-hygiene.test.ts:288` — no saves.json on disk, asserts no throw |
| A024 | Batch save triggers hygiene checks | ✅ SATISFIED | `commit-hygiene.test.ts:308` — calls runCommitHygieneChecks directly, asserts commit_hygiene populated. Batch call site confirmed at `artifact.ts:1732` |

24/24 SATISFIED.

## Independent Findings

**Predictions resolved:**

1. **lastIndex reset** — Not found. Builder correctly resets at `artifact.ts:271` before each file scan. Matches the spec's `secrets.ts:135` pattern.
2. **Missed batch-save site** — Not found. Both `saveArtifact` (line 1439) and `saveAllArtifacts` (line 1732) have the call.
3. **Test file exclusion** — Patterns are correct and comprehensive: `.test.`, `.spec.`, `.e2e.`, `__tests__/`, `/test/`, `/tests/`, `fixture`, `mock`. Tests cover `.test.` and `__tests__/`.
4. **Env exclusion edge** — Correct. Only exact `.env.example` and `.env.test` excluded. `.env.testing` would be flagged. Per spec.
5. **Display truncation** — Builder added `MAX_DISPLAY = 5` with overflow count. Matches Build Concerns pattern.

**Surprise:** A002's test strategy — verifying that NOT calling the function means the key doesn't exist — is tautological. The real gating is the `baseType === 'build-report'` conditional, which is structural, not unit-tested. Would need integration-level testing to cover.

**Production risk:** Deleted files in `modules_touched` (file removed in the diff but referenced in the list) — handled gracefully via `try { content = fs.readFileSync(...) } catch { continue; }` at lines 268 and 286. Not a bug.

## AC Walkthrough
- **AC1:** ✅ PASS — `runCommitHygieneChecks` called at `artifact.ts:1439` after `captureModulesTouched`, gated by `typeInfo.baseType === 'build-report'`
- **AC2:** ✅ PASS — Function reads `modules_touched` from `.saves.json` (line 241). Zero git operations in function body.
- **AC3:** ✅ PASS — Lockfile desync logic at lines 252-263. `LOCKFILE_MANIFEST_MAP` covers pnpm, npm, yarn, Gemfile, Pipfile, poetry, Cargo, composer, go. Monorepo satisfied by `endsWith(manifest)`.
- **AC4:** ✅ PASS — `SECRET_PATTERNS` imported from `src/engine/findings/rules/secrets.ts` at line 27. Regex lastIndex reset at line 271. Test-file exclusion via `TEST_FILE_PATTERNS` at line 266.
- **AC5:** ✅ PASS — Conflict marker regex at line 287: `^<{7}\s`, `^={7}$`, `^>{7}\s` with multiline flag.
- **AC6:** ✅ PASS — Env file regex `/^\.env(\..*)?$/` at line 296, with exact exclusions for `.env.example` and `.env.test` at line 298.
- **AC7:** ✅ PASS — `chalk.yellow` warning via `console.error` at line 305. Test confirms output contains "Commit hygiene:".
- **AC8:** ✅ PASS — Findings written to `.saves.json` under `commit_hygiene` key at line 308. Structure has check/file/severity/message.
- **AC9:** ✅ PASS — `proofSummary.ts:1837-1840` reads `commit_hygiene` from saves. Defaults to `[]` at line 1814.
- **AC10:** ✅ PASS — Outer try/catch at line 231 catches all errors and prints a warning. Never throws.
- **AC11:** ✅ PASS — Only called inside `if (typeInfo.baseType === 'build-report')` blocks at lines 1437 and 1730.
- **AC12:** ✅ PASS — 2251 tests pass (baseline was 2218, so 33 new tests). No regressions. 2 skipped (pre-existing).
- **AC13:** ✅ PASS — `proof.ts:93-98` adds optional `commit_hygiene` field to `ProofChainEntry`.
- **AC14:** ✅ PASS — `work.ts:861-863` reads `commit_hygiene` from saves.json. Line 912 spreads into entry when non-empty.
- **AC15:** ✅ PASS — `proof.ts:372-389` displays "Commit Hygiene" section with findings, truncated at 5 with overflow count.
- **AC16:** ✅ PASS — Build: clean (typecheck + tsup). Lint: 0 errors (1 pre-existing warning).

## Blockers
No blockers. All 24 contract assertions satisfied. All 16 acceptance criteria pass. 2251 tests pass with no regressions. Build and typecheck clean. Lint clean (1 pre-existing warning).

Checked for: unused exports in new code (CommitHygieneFinding and runCommitHygieneChecks exported only for test access — known pattern, not a blocker), unhandled error paths (outer try/catch + per-file try/catch for content reads both present), dead code (every if/for/try block serves a purpose — no unreachable paths), assumptions about external state (modules_touched paths may reference deleted files — handled via catch/continue).

## Findings

- **Test — A002 test is tautological:** `packages/cli/tests/commands/commit-hygiene.test.ts:257` — Verifies that NOT calling `runCommitHygieneChecks` means the key doesn't exist. This proves nothing about the gating conditional (`baseType === 'build-report'`). The real gating is structural at `artifact.ts:1437` and `artifact.ts:1730`, confirmed by source inspection but not exercised by a test.
- **Test — A017 uses existence checks instead of specific values:** `packages/cli/tests/commands/commit-hygiene.test.ts:240` — Uses `toHaveProperty('check')` rather than asserting the specific check value. Passes if the function returns any object shape with those keys. Contract matcher is `exists` so this satisfies the contract, but per testing-standards it's weaker than it could be.
- **Test — A019 is type-level only:** `packages/cli/tests/commands/commit-hygiene.test.ts:416` — Constructs a `ProofChainEntry` with `commit_hygiene` and checks type accepts it. Doesn't exercise `writeProofChain()` reading from saves.json. The runtime behavior is confirmed by source inspection (`work.ts:861-863`, `work.ts:912`) but not by this test.
- **Test — A024 tests same function call as A001:** `packages/cli/tests/commands/commit-hygiene.test.ts:308` — Calls `runCommitHygieneChecks` directly, same as A001. The "batch save" distinction exists only in the function's call site (`saveAllArtifacts`), not in the function itself. The test doesn't exercise the batch code path.
- **Code — Export scope widened for testing:** `packages/cli/src/commands/artifact.ts:183` — `CommitHygieneFinding` interface and `runCommitHygieneChecks` function are exported solely for test consumption. Same pattern as existing `writeSaveMetadata` export noted in proof context — the API surface keeps growing.
- **Code — commit_hygiene type defined in three places:** `packages/cli/src/types/proof.ts:93`, `packages/cli/src/utils/proofSummary.ts:90`, `packages/cli/src/commands/work.ts:851` — The `{ check: string; file: string; severity: string; message: string }` shape is written inline at each location rather than imported from a shared type. Future schema changes require updating all three.
- **Upstream — Export-for-test pattern growing:** Still present — see proof context finding "writeSaveMetadata export scope widened for tests". This build adds two more exports following the same pattern. Not blocking but the trend is worth tracking.
- **Code — Full file read for secret scanning:** `packages/cli/src/commands/artifact.ts:268` — Reads full file content into memory for every non-test file in `modules_touched`. Branch diffs typically contain few files so this is fine now. If modules_touched ever includes large generated bundles or binary files, this would be expensive. The scan engine has file-size guards; the hygiene check does not.

## Deployer Handoff
Clean build. All tests pass. The feature adds commit hygiene checks (lockfile desync, secrets, conflict markers, env files) at build-report save time. Warnings are non-blocking — they never prevent saves.

The `commit_hygiene` data flows through the four-location proof chain pattern (type → summary → write → display). Old saves.json and proof_chain.json entries without the field are handled gracefully.

The one thing to know: `SECRET_PATTERNS` is imported from the scan engine. If secret patterns change upstream, hygiene checks pick up the changes automatically — no separate update needed.

No configuration or migration needed. Backward compatible.

## Verdict
**Shippable:** YES

24/24 contract assertions satisfied. 16/16 acceptance criteria pass. 2251 tests pass. Build and lint clean. Implementation follows the documented patterns (captureModulesTouched shape, four-location proof chain pattern). The findings are all debt/observation level — test weakness around integration paths and type duplication — none block shipping.
