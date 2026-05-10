# Verify Report: Version Awareness Notifications

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-10
**Spec:** .ana/plans/active/version-awareness/spec.md
**Branch:** feature/version-awareness

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/version-awareness/.ana/plans/active/version-awareness/contract.yaml
  Seal: INTACT (hash sha256:9a72139a73b0172ff82418dd80c6f40afce9c6df594912014588c86143018217)
```

Seal status: **INTACT**

Tests: 2106 passed, 2 skipped (2108 total), 99 test files. Build: success (typecheck + tsup). Lint: 1 pre-existing warning in git-operations.ts (unused eslint-disable directive — not introduced by this build).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Users see when a newer CLI version is available on npm | ✅ SATISFIED | `tests/commands/work.test.ts:635` — asserts output contains "available" and "v1.2.0" |
| A002 | The update notification tells users the exact command to upgrade | ✅ SATISFIED | `tests/commands/work.test.ts:636` — asserts `npm update -g anatomia-cli` in output |
| A003 | Users see when their project was initialized with a different CLI version | ✅ SATISFIED | `tests/commands/work.test.ts:650` — asserts output contains "Project initialized with" |
| A004 | The mismatch notification tells users to re-initialize | ✅ SATISFIED | `tests/commands/work.test.ts:651` — asserts `ana init` in output |
| A005 | No notifications appear when all versions are current | ✅ SATISFIED | `tests/commands/work.test.ts:662` — asserts output not.toContain "available" |
| A006 | No mismatch notification appears when project version matches CLI | ✅ SATISFIED | `tests/commands/work.test.ts:663` — asserts output not.toContain "initialized with" |
| A007 | Network failures never show errors to the user | ✅ SATISFIED | `tests/utils/update-check.test.ts:320` — mocks getCliVersion rejection, asserts both fields null (indirect: null fields produce no output). See Findings re: target mismatch. |
| A008 | A fresh cache is not re-fetched within 24 hours | ✅ SATISFIED | `tests/utils/update-check.test.ts:276` — writes fresh cache, asserts mockSpawn not called |
| A009 | An expired cache triggers a new background fetch | ✅ SATISFIED | `tests/utils/update-check.test.ts:284` — writes 25h-old cache, asserts mockSpawn called once |
| A010 | CI environments skip the npm update check entirely | ✅ SATISFIED | `tests/utils/update-check.test.ts:218` — sets CI=true, asserts spawn not called. Also `tests/utils/update-check.test.ts:335` — asserts `updateAvailable` is null in CI. |
| A011 | JSON output includes update availability when a newer version exists | ✅ SATISFIED | `tests/commands/work.test.ts:688` — parses JSON, asserts `updateAvailable.latest` exists and matches |
| A012 | JSON output includes project version mismatch details | ✅ SATISFIED | `tests/commands/work.test.ts:689` — parses JSON, asserts `projectMismatch.projectVersion` exists and matches |
| A013 | JSON output shows null for update fields when versions are current | ✅ SATISFIED | `tests/commands/work.test.ts:704` — parses JSON, asserts both fields are null |
| A014 | First run after install shows no update notification | ✅ SATISFIED | `tests/utils/update-check.test.ts:270` — no cache file, asserts `updateAvailable` is null |
| A015 | Old projects with missing anaVersion show mismatch with unknown version | ✅ SATISFIED | `tests/utils/update-check.test.ts:148` — writes ana.json without anaVersion, asserts returns "unknown" |
| A016 | Old projects with anaVersion 0.0.0 show mismatch with unknown version | ✅ SATISFIED | `tests/utils/update-check.test.ts:153` — writes ana.json with "0.0.0", asserts returns "unknown" |
| A017 | Multi-digit version numbers compare correctly | ✅ SATISFIED | `tests/utils/update-check.test.ts:25` — asserts `isNewerVersion('1.2.0', '1.10.0')` returns true |
| A018 | Equal versions are not flagged as newer | ✅ SATISFIED | `tests/utils/update-check.test.ts:30` — asserts `isNewerVersion('1.0.0', '1.0.0')` returns false |
| A019 | Older npm versions are not flagged as newer | ✅ SATISFIED | `tests/utils/update-check.test.ts:35` — asserts `isNewerVersion('2.0.0', '1.5.0')` returns false |
| A020 | Background check process is detached from the parent | ✅ SATISFIED | `tests/utils/update-check.test.ts:198` — asserts spawn options include `detached: true` |
| A021 | Background check process is unreferenced so parent can exit | ✅ SATISFIED | `tests/utils/update-check.test.ts:203` — asserts `mockUnref` called once |
| A022 | Background process hides console window on Windows | ✅ SATISFIED | `tests/utils/update-check.test.ts:198` — asserts spawn options include `windowsHide: true` |
| A023 | Cache file path is safely escaped in the spawned script | ✅ SATISFIED | `tests/utils/update-check.test.ts:213` — asserts spawn script contains `JSON.stringify`-escaped cache path |
| A024 | Users with no active work still see version notifications | ✅ SATISFIED | `tests/commands/work.test.ts:672` — creates project with empty slugs, asserts "available" in output |
| A025 | Existing work status tests pass after async conversion | ✅ SATISFIED | `tests/commands/work.test.ts:726` — representative test passes; all 2106 tests pass in full suite |

## Independent Findings

The implementation is clean and well-structured. The builder followed the spec's structural and functional analogs correctly. The `printVersionNotifications` extraction is a good pattern — DRY across three call sites.

The async conversion of `captureOutput` and all 21+ call sites is mechanical and correct. Each call site was converted from `captureOutput(() => getWorkStatus(...))` to `await captureOutput(async () => await getWorkStatus(...))`. The helper's type signature changed from `() => void` to `() => void | Promise<void>`. No silent promise drops.

**Prediction results:** All 5 code predictions were investigated — none confirmed. The builder handled error paths, both early returns, malformed input, and getCliVersion failures correctly. The spawn script's JSON parse is wrapped in try/catch. The cache directory is created with `recursive: true`.

**Over-building check:** The module exports 5 functions but only `checkForUpdates` is imported in production code (`work.ts:26`). The other 4 (`isNewerVersion`, `readUpdateCache`, `getProjectAnaVersion`, `spawnUpdateCheck`) are public for testability. This matches the spec's explicit "five exports" guidance — not builder over-building. No dead code paths found in any new function. Every `if`, `try/catch`, and loop has a purpose.

**Proof context review:** The existing proof findings for `work.ts` and `work.test.ts` are all in unrelated areas (completeWork, startWork, proof chain). None interact with the version awareness changes. No stale findings resolved by this build.

## AC Walkthrough

- ✅ **AC1:** `work status` shows "v{X} available" — verified via test at `work.test.ts:635`, output contains "available" and version strings. Source confirms `printVersionNotifications` renders the notification at `work.ts:562`.
- ✅ **AC2:** `work status` shows "Project initialized with v{X}" — verified via test at `work.test.ts:650`, output contains "Project initialized with". Source confirms rendering at `work.ts:567`.
- ✅ **AC3:** Both notifications suppressed when current — verified via test at `work.test.ts:662-663`, not.toContain assertions for both.
- ✅ **AC4:** Network failure is silent — `checkForUpdates` wraps everything in try/catch at `update-check.ts:188-224`, returns nulls. Test at `update-check.test.ts:320` confirms.
- ✅ **AC5:** Cache persists for 24 hours — `CACHE_TTL_MS = 86_400_000` at `update-check.ts:17`. Tests at `update-check.test.ts:276` (fresh, no spawn) and `update-check.test.ts:284` (expired, spawn) confirm.
- ✅ **AC6:** CI environments skip npm check — `process.env['CI'] === 'true'` guard at both `spawnUpdateCheck:100` and `checkForUpdates:192`. Tests at `update-check.test.ts:218` and `update-check.test.ts:335` confirm.
- ✅ **AC7:** JSON includes `updateAvailable` and `projectMismatch` — `StatusOutput` interface extended at `work.ts:99-100`. JSON output includes both fields in all three paths (items: `work.ts:770`, zero-slugs: `work.ts:714-715`). Tests at `work.test.ts:688-689` and `work.test.ts:704`.
- ✅ **AC8:** First run shows no notification — no cache returns null from `readUpdateCache`, `checkForUpdates` returns `updateAvailable: null`. Test at `update-check.test.ts:270`.
- ✅ **AC9:** Notification includes exact commands — `npm update -g anatomia-cli` at `work.ts:563` and `ana init` at `work.ts:568`. Tests at `work.test.ts:636` and `work.test.ts:651`.
- ✅ **AC10:** Missing/0.0.0 anaVersion shows "unknown" — `getProjectAnaVersion` returns "unknown" for both at `update-check.ts:158-159`. Tests at `update-check.test.ts:148` and `update-check.test.ts:153`.
- ✅ **AC11:** Multi-digit semver — `isNewerVersion` splits on `.` and compares numerically at `update-check.ts:47-57`. Test at `update-check.test.ts:25` confirms `1.10.0 > 1.2.0`.
- ✅ **AC12:** Background process exits independently — `detached: true`, `stdio: 'ignore'`, `child.unref()` at `update-check.ts:133-139`. Tests at `update-check.test.ts:198-203`.
- ✅ **Tests pass:** 2106 passed, 2 skipped (99 test files) with `(cd packages/cli && pnpm vitest run)`.
- ✅ **No build errors:** `pnpm run build` succeeded (typecheck + tsup).
- ✅ **All 21 existing call sites work:** Every `captureOutput` call site properly awaits. 2106 tests pass — no regressions.

## Blockers

No blockers. All 25 contract assertions satisfied. All 15 acceptance criteria pass. Tests pass (2106 passed, 2 pre-existing skips). Build and lint clean (1 pre-existing lint warning not from this build). Checked for: unused exports in new files (4 exports used only by tests — by spec design), unused parameters in all new functions (none found — every param is used), error paths without tests (all error paths in update-check.ts have corresponding tests), external assumptions (cache path created with `recursive: true`, CI env var checked consistently, getCliVersion failure handled).

## Findings

- **Code — packageName not JSON.stringify-escaped in spawn script URL:** `packages/cli/src/utils/update-check.ts:115` — `cacheFile` and `cacheDir` use `JSON.stringify` for safe interpolation, but `packageName` is interpolated via bare template literal into the URL. Currently safe because the only caller passes the hardcoded string `'anatomia-cli'`, but inconsistent with the security discipline applied to the other two interpolations. Not exploitable today.

- **Code — Four of five exports unused in production code:** `packages/cli/src/utils/update-check.ts` — Only `checkForUpdates` is imported by `work.ts`. The other four (`isNewerVersion`, `readUpdateCache`, `getProjectAnaVersion`, `spawnUpdateCheck`) are exported for testability. This matches the spec's "five exports" design, but the public surface area is larger than necessary. Acceptable — individual function testing is valuable.

- **Test — A007 tagged test checks return values, not output:** `packages/cli/tests/utils/update-check.test.ts:320` — Contract says target is `output` with matcher `not_contains` and value `Error`. The test asserts `updateAvailable` and `projectMismatch` are null — proving the error is swallowed, but not directly asserting on rendered output. Indirect proof: null fields produce no notification output. Acceptable coverage via logical implication.

- **Test — A010 tag on spawn test vs. contract target:** `packages/cli/tests/utils/update-check.test.ts:217` — Contract target is `updateAvailable` equals `null`. The tagged test verifies spawn is not called (mechanism). The untagged CI test at line 335 directly asserts `updateAvailable` is null (contract target). Both together satisfy the assertion; the tag placement is on the mechanism rather than the target.

- **Code — Spawn script uses CommonJS require() in ESM codebase:** `packages/cli/src/utils/update-check.ts:108-110` — The inline script uses `require('https')`, `require('fs')`, `require('path')`. This is correct — `node -e` defaults to CommonJS mode, and the script runs in a separate process, not the ESM module graph. But it's a surprise for anyone reading the codebase expecting ESM throughout.

- **Upstream — A025 is a meta-assertion:** Contract assertion A025 ("Existing work status tests pass after async conversion") is a regression guard, not a behavioral contract. The test verifies one representative case; the real proof is the full suite passing. Functionally correct but unconventional as a contract assertion.

## Deployer Handoff

This is a self-contained feature addition. No database migrations, no config changes, no breaking API changes. The `StatusOutput` interface gains two new nullable fields (`updateAvailable`, `projectMismatch`) — any downstream JSON consumers will see these new fields. `getWorkStatus` is now async — any callers beyond the commander action handler would need to await it. Currently there is only one caller (the action handler at `work.ts:2107`), which was updated.

The background spawn creates `.ana/state/cache/update-check.json` on first npm check. This is a new file in the `.ana/state/` directory — ensure `.gitignore` covers `.ana/state/` if it doesn't already (it's a cache, not tracked state).

The lint warning (`git-operations.ts:169`) is pre-existing and unrelated to this build.

## Verdict

**Shippable:** YES

All 25 contract assertions satisfied. All 15 acceptance criteria verified. 2106 tests pass with zero regressions from the async conversion. Build and lint clean. The implementation follows spec guidance precisely — `printVersionNotifications` extracted as DRY helper, notifications rendered in all three output paths, error handling is silent and graceful. The findings are all observations — no correctness issues, no missing behavior. I'd stake my name on this shipping.
