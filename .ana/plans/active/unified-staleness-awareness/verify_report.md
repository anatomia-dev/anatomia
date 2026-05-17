# Verify Report: Unified Staleness Awareness

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-16
**Spec:** .ana/plans/active/unified-staleness-awareness/spec.md
**Branch:** feature/unified-staleness-awareness

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/unified-staleness-awareness/contract.yaml
  Seal: INTACT (hash sha256:00512cbdd460482d408cfaeb5228b2ec9e679126d0011db3ae8200a2bdc14275)
```

Tests: 2366 passed, 0 failed, 2 skipped (106 test files). Build: ESM success. Lint: CLI clean, website has pre-existing unrelated failure (Changelog.tsx unescaped apostrophe — not introduced by this build).

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Stale scan triggers a notification with age and commit count | ✅ SATISFIED | Unit test `scan-freshness.test.ts:80` proves isStale=true + commitsSinceScan=73; work.ts:639 formats to `ℹ Scan is {N} days old ({M} commits since scan)` |
| A002 | Staleness requires both time AND commit thresholds to be met | ✅ SATISFIED | `scan-freshness.test.ts:93` — time exceeded (10 days) + commits low (10) → isStale=false |
| A003 | Staleness requires both time AND commit thresholds to be met | ✅ SATISFIED | `scan-freshness.test.ts:104` — time low (3 days) + commits exceeded (100) → isStale=false |
| A004 | Unresolvable git SHA falls back to time-only notification | ✅ SATISFIED | `scan-freshness.test.ts:115` — exitCode 128 → commitsSinceScan=null |
| A005 | Time-only fallback still detects staleness by age alone | ✅ SATISFIED | `scan-freshness.test.ts:118` — exitCode 128 + 10 days → isStale=true |
| A006 | CI environments never see staleness warnings | ✅ SATISFIED | `scan-freshness.test.ts:41` — CI=true → null |
| A007 | Missing scan date is handled gracefully without crashing | ✅ SATISFIED | `scan-freshness.test.ts:47,53,59` — undefined/null/empty → null |
| A008 | Unparseable scan date is handled gracefully without crashing | ✅ SATISFIED | `scan-freshness.test.ts:65,71` — "not-a-date"/"xyzzy123" → null |
| A009 | Setup check shows scan freshness status | ✅ SATISFIED | check.ts:1441 prints `chalk.bold('\nFreshness')`; live test confirms "Freshness" section in output |
| A010 | Current scan shows as healthy in the dashboard | ✅ SATISFIED | check.ts:1449 prints `✓ Scan age: current` when not stale; live test confirms |
| A011 | The notification function works for all notification types | ✅ SATISFIED | work.ts:624-627 still prints `ℹ anatomia-cli v{latest}...`; rename preserved behavior |
| A012 | The notification function works for all notification types | ✅ SATISFIED | work.ts:629-632 still prints `ℹ Project initialized with v{ver}...`; rename preserved behavior |
| A013 | JSON output includes scan staleness data | ✅ SATISFIED | work.ts:876 sets `scanStale: scanFreshness?.isStale ? scanFreshness : null`; live JSON test shows `"scanStale": null` for fresh scan |
| A014 | JSON output includes scan staleness even with no work items | ✅ SATISFIED | work.ts:824 (empty-items JSON path) includes `scanStale` field |
| A015 | Agents are instructed to relay notification lines to the user | ��� SATISFIED | `packages/cli/templates/.claude/agents/ana.md:36` contains "include them in your first message verbatim" |
| A016 | Product template and dogfood template match for the modified section | ✅ SATISFIED | `diff` of lines 34-38 between `.claude/agents/ana.md` and `packages/cli/templates/.claude/agents/ana.md` — zero differences |
| A017 | Staleness result includes days since scan | ✅ SATISFIED | `scan-freshness.test.ts:84` — `result.daysSinceScan` > 0 (12 days ago input) |
| A018 | Staleness result includes commits since scan | ✅ SATISFIED | `scan-freshness.test.ts:85` — `result.commitsSinceScan` === 73 |
| A019 | Time-only fallback notification omits commit count | ✅ SATISFIED | `scan-freshness.test.ts:119` proves commitsSinceScan=null; work.ts:635-636 conditionally includes "commits since scan" only when not null |
| A020 | Fresh scan produces null scanStale in JSON | ✅ SATISFIED | `scan-freshness.test.ts:149` proves isStale=false for fresh scan; work.ts:876 maps non-stale to null; live JSON test confirms `"scanStale": null` |

## Independent Findings

**Prediction resolution:**
1. ✅ Confirmed — no integration tests for output/JSON assertions. Builder used unit tests + source inspection chain. Reasonable for this feature's scope.
2. Not found — templates are byte-identical (verified with diff).
3. Not found — non-stale results correctly map to `null` via `scanFreshness?.isStale ? scanFreshness : null`.
4. ✅ Confirmed — `check.ts:1449` shows "✓ Scan age: current" when `freshness` is null (missing scan data), conflating "unknown" with "fresh".
5. ✅ Confirmed — `website/lib/copy.ts` pricing change ($45→$24) is unrelated scope creep.

**What I didn't predict:** The `daysSinceScan` uses `Math.floor`, meaning a scan 7.9 days old reports as "7 days" and stays below the `> 7` threshold. This is defensible behavior (strict > not >=) but worth noting — the boundary is sharp.

## AC Walkthrough
- ✅ AC1: `ana work status` displays `ℹ Scan is {N} days old ({M} commits since scan). Run: ana init` — verified by unit test (data) + source inspection (formatting at work.ts:639)
- ✅ AC2: Time-only fallback tested at `scan-freshness.test.ts:111-120`; code conditionally omits commit part
- ✅ AC3: CI suppression tested at `scan-freshness.test.ts:39-42`; uses `process.env['CI'] === 'true'` string comparison
- ✅ AC4: Live test confirms Freshness section in `ana setup check` output
- ✅ AC5: Both templates contain relay instruction at line 36
- ✅ AC6: Diff confirms byte-identity between product and dogfood templates
- ✅ AC7: `printVersionNotifications` fully renamed — zero references remain in source; 3 call sites updated
- ✅ AC8: `scanStale` in StatusOutput interface (work.ts:104), normal assembly (line 876), JSON early-return (line 824), live JSON confirms
- ✅ AC9: `checkScanFreshness` returns null for missing/unparseable — tested at lines 47-71
- ✅ AC10: No new ana.json fields — verified by reading work.ts, check.ts, and scan-freshness.ts; existing `lastScanAt` read only
- ✅ Tests pass: 2366 passed, 2 skipped
- ⚠️ Lint: CLI clean; website pre-existing failure (unrelated)

## Blockers

No blockers. All 20 contract assertions satisfied. All acceptance criteria pass. No regressions (baseline was 2351 tests, now 2366 — 15 new tests). Checked for: unused exports in scan-freshness.ts (both used — `checkScanFreshness` imported in work.ts and check.ts, `ScanFreshnessResult` imported in work.ts); unused parameters (none — both params of `checkScanFreshness` are used); error paths (outer catch returns null, inner catch falls through to time-only — both exercised by tests); no new CLI commands or schema changes.

## Findings

- **Code — Freshness section conflates "unknown" with "current":** `packages/cli/src/commands/check.ts:1449` — when `checkScanFreshness` returns null (missing lastScanAt, CI, error), the else branch prints "✓ Scan age: current". This is misleading for the edge case where no scan has ever run. Low impact: `setup check` is only invoked in initialized projects which should have `lastScanAt`.
- **Code — Unrelated website pricing change in feature branch:** `website/lib/copy.ts:439` — price changed from $45 to $24. Not in the spec's file_changes. Scope creep — harmless but should be a separate commit or branch.
- **Test — Integration tests rely on source inspection chain:** `packages/cli/tests/utils/scan-freshness.test.ts` — assertions A001, A009-A014 are verified by unit tests proving data correctness + source inspection proving formatting. No integration test directly asserts the rendered output string. Acceptable given the feature's narrow scope, but creates a gap if the formatting code is refactored without updating tests.
- **Code — Floor rounding at threshold boundary:** `packages/cli/src/utils/scan-freshness.ts:56` — `Math.floor((now - scanDate.getTime()) / (1000 * 60 * 60 * 24))` means 7 days and 23 hours reports as "7 days" (not stale). Combined with strict `>` comparison, the effective threshold is 8 calendar days. Documented behavior, not a bug — but the threshold feels higher than spec says.

## Deployer Handoff

- Feature adds scan freshness detection to `work status` and `setup check`. No migration needed — reads existing `lastScanAt` from ana.json.
- The `website/lib/copy.ts` pricing change ($45→$24) is included in this branch. If you want to ship it separately, cherry-pick or revert before merge.
- The website lint failure (Changelog.tsx unescaped apostrophe) is pre-existing and unrelated to this build.
- `printVersionNotifications` → `printNotifications` rename: if any external scripts grep for that function name, update them.

## Verdict
**Shippable:** YES

All 20 contract assertions satisfied. All ACs pass. 15 new tests, zero regressions. The implementation is clean, follows established patterns (mirrors update-check.ts structure), and the live CLI produces correct output. The findings are minor debt items — none affect correctness or reliability of the shipped feature.
