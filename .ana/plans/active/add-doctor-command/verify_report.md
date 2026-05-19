# Verify Report: ana doctor — unified project health diagnostic

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-19
**Spec:** .ana/plans/active/add-doctor-command/spec.md
**Branch:** feature/add-doctor-command

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/add-doctor-command/contract.yaml
  Seal: INTACT (hash sha256:17d5f48bc65d6a755395d2df2a3d2c48eab8469e6ab3129254cd52643192aae6)
```

Tests: 2524 passed, 2 skipped (109 test files). Doctor-specific: 35 passed (1 test file).
Build: PASS (both packages).
Lint: PASS (1 pre-existing warning in git-operations.ts, not introduced by this build).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Doctor prints a status line for each health dimension | ✅ SATISFIED | test line 131 checks `cli_version.current` matches semver; `formatTerminalOutput` line 470/473 renders "CLI v{version}" |
| A002 | Doctor shows scan freshness status | ✅ SATISFIED | test line 139 checks `scan_freshness` defined + depth; `formatTerminalOutput` lines 477-493 render "Scan" lines |
| A003 | Doctor shows context quality status | ✅ SATISFIED | test line 147 checks `context` defined + sections_total; `formatTerminalOutput` lines 497-504 render "Context" lines |
| A004 | Doctor shows skill enrichment status | ✅ SATISFIED | test line 155 checks `skills` defined + total > 0; `formatTerminalOutput` lines 508-513 render "Skills" lines |
| A005 | Doctor shows proof chain status | ✅ SATISFIED | test line 163 checks `proof_chain` defined; `formatTerminalOutput` lines 517-529 render "Proof chain" lines |
| A006 | JSON output includes the doctor command name | ✅ SATISFIED | test line 177 constructs envelope and asserts `json.command === 'doctor'` |
| A007 | JSON output includes a timestamp | ✅ SATISFIED | test line 184 asserts `json.timestamp` defined and parseable as Date |
| A008 | JSON output includes all five dimension objects | ✅ SATISFIED | test line 192 checks all five dimension keys defined |
| A009 | JSON output includes the maturity classification | ✅ SATISFIED | test line 202 asserts `results.maturity` is one of ['new', 'setup', 'established'] |
| A010 | JSON output includes the overall pass/fail status | ✅ SATISFIED | test line 209 asserts `results.overall` is one of ['pass', 'fail'] |
| A011 | A healthy project exits with code 0 | ✅ SATISFIED | test line 258 asserts `results.overall === 'pass'`; command handler line 661 maps pass to exit(0) |
| A012 | A project with problems exits with code 1 | ✅ SATISFIED | test line 335 creates outdated CLI fixture, asserts `results.overall === 'fail'`; command handler line 661 maps fail to exit(1) |
| A013 | Yellow warnings do not cause a failure exit code | ✅ SATISFIED | test line 265 verifies `proof_chain.status === 'warn'` AND `overall === 'pass'` |
| A014 | A brand new project sees a welcome message directing them to setup | ✅ SATISFIED | test line 279 verifies `maturity === 'new'` for project with no proof chain; `formatFooter` line 559 outputs "Next: claude --agent ana-setup" for new maturity |
| A015 | A brand new project sees the compact view without the full dashboard footer | ✅ SATISFIED | test line 279 verifies `maturity === 'new'`; `formatFooter` returns "Next:..." for new maturity, not "All healthy" — source inspection confirms `not_contains` "All healthy" |
| A016 | An established project with 10+ runs sees a healthy message without a welcome CTA | ✅ SATISFIED | test line 286 creates 12-entry proof chain, asserts `maturity === 'established'`; `formatFooter` line 566 returns "All healthy." for established maturity — no "Next:" |
| A017 | Doctor delegates version checking to the existing update-check module | ✅ SATISFIED | test line 304 calls `runDoctor` and asserts `cli_version.current` is truthy string; `assessCliVersion` line 122 calls `checkForUpdates()` from update-check.ts |
| A018 | Running doctor without an Anatomia installation shows a helpful error | ✅ SATISFIED | No tagged test — verified by source inspection: command handler line 635 outputs "No Anatomia installation found. Run: ana init"; live test from /tmp confirmed output and exit 1 |
| A019 | Running doctor without an Anatomia installation exits with failure | ✅ SATISFIED | Source inspection: command handler line 636 calls `process.exit(1)`; live test from /tmp confirmed exit code 1 |
| A020 | A stale scan includes the fix command to re-initialize | ✅ SATISFIED | test line 346 creates stale scan fixture, asserts days > 7; `formatTerminalOutput` line 482 outputs "Run: ana init" when scan status is fail |
| A021 | An outdated CLI includes the fix command to update | ✅ SATISFIED | test line 312 creates update cache with v99.0.0, asserts `status === 'fail'` and `latest === '99.0.0'`; `formatTerminalOutput` line 471 outputs "Run: npm update -g anatomia-cli" |
| A022 | When some skills are still scaffold-default, their names are shown | ✅ SATISFIED | test line 406 asserts `scaffold_defaults` contains 'deployment' and 'troubleshooting'; `formatTerminalOutput` line 511 includes "still scaffold" with names joined |
| A023 | A work item stalled for over 14 days appears as a warning | ✅ SATISFIED | test line 441 creates 20-day-old save, asserts stale item found with days > 14 |
| A024 | A work item with an active worktree is not shown as stalled | ✅ SATISFIED | test line 458 creates worktree dir and 20-day-old save, asserts stale item is undefined |
| A025 | Running doctor from a worktree is blocked with a helpful message | ✅ SATISFIED | No tagged test — verified by source inspection: line 625 outputs "Run from the main project directory, not from a worktree."; live test from worktree confirmed |
| A026 | Running doctor from a worktree exits with failure | ✅ SATISFIED | Source inspection: line 626 calls `process.exit(1)`; live test confirmed exit 1 |
| A027 | A project with setup in progress shows a resume message | ✅ SATISFIED | test line 372 creates project with `setupPhase: 'guided'`, asserts `setup_state === 'in-progress'`; `formatTerminalOutput` line 500 outputs "setup in progress" |
| A028 | The resume message tells the user how to continue setup | ✅ SATISFIED | `formatTerminalOutput` line 500 outputs "resume: claude --agent ana-setup"; test line 372 covers the in-progress state |
| A029 | A project that completed setup but has scaffold sections says so | ✅ SATISFIED | test line 381 creates complete+thin project, asserts `setup_state === 'complete'` and `sections_populated === 0`; `formatTerminalOutput` line 502 outputs "setup completed but sections thin" |
| A030 | A project that never started setup directs the user to begin | ✅ SATISFIED | test line 393 creates project with no setupPhase, asserts `setup_state === 'not-started'`; `formatTerminalOutput` line 504 outputs "run: claude --agent ana-setup" |
| A031 | JSON scan dimension includes the scan depth | ✅ SATISFIED | test line 219 asserts `scan_freshness.depth === 'deep'` |
| A032 | JSON skills dimension lists scaffold-default skill names | ✅ SATISFIED | test line 226 asserts `scaffold_defaults` is defined and is an array |
| A033 | JSON context dimension includes the setup state | ✅ SATISFIED | test line 233 asserts `context.setup_state` is defined |
| A034 | JSON proof chain dimension includes the trend | ✅ SATISFIED | test line 240 asserts `proof_chain.trend` is defined |
| A035 | JSON output includes stale work items array | ✅ SATISFIED | test line 247 asserts `stale_work` is defined and is an array |
| A036 | Missing scan.json degrades the scan dimension gracefully without crashing | ✅ SATISFIED | test line 358 removes scan.json, asserts dimension exists and depth is null; output will still contain "Scan" |
| A037 | Missing proof_chain.json shows zero proof runs | ✅ SATISFIED | test line 419 asserts `runs === 0` and `trend === 'insufficient_data'`; `formatTerminalOutput` line 518 outputs "no pipeline runs yet" |

37/37 assertions SATISFIED.

## Independent Findings

**Prediction resolution:**

1. **Stale work date parsing** — Not found. `new Date(save.saved_at)` with `isNaN` guard is adequate for ISO strings. No timezone issue since all timestamps are ISO 8601.
2. **Context three-way branch** — Not found. Code at lines 207-220 handles all three cleanly: `'complete'`, truthy-not-complete, and falsy with progress file fallback.
3. **`not_contains` assertions weak** — Partially confirmed. The tests don't check terminal output strings directly; they verify the data model, and source inspection confirms the formatter produces the expected strings. This is architecturally valid — the test-data-model-then-verify-formatter pattern is sound — but it means a typo in `formatTerminalOutput` wouldn't be caught by any assertion-tagged test.
4. **JSON ANSI leak** — Not found. JSON mode uses `results` directly, which never touches chalk. The dimension assessors return plain data; chalk is only in `formatTerminalOutput`.
5. **Worktree guard test** — Confirmed: no test for A025/A026. These are in the command handler and would require subprocess testing. Verified by live invocation.

**Surprise finding:** `assessScanFreshness` (line 148) and `assessContext` (line 195) both read and parse `.ana/ana.json` independently. Combined with the proof context note about `readAnaJson` being called twice in `check.ts`, doctor adds two more reads. Since these run in `Promise.all`, there's no sequential penalty, but it's duplicate I/O that could be consolidated by reading ana.json once and passing the parsed object to each assessor.

## AC Walkthrough
- **AC1**: `ana doctor` prints dashboard with one status line per dimension ✅ PASS — live test output shows 5 dimension lines (CLI, scan, context, skills, proof chain), plus stale work lines when applicable
- **AC2**: `ana doctor --json` prints structured JSON ✅ PASS — live test output matches envelope schema: `{ command, timestamp, results: { maturity, dimensions, stale_work, overall } }`
- **AC3**: Exit code 0 when no ✗, 1 when any ✗ ✅ PASS — test line 258 (pass), test line 335 (fail), test line 265 (yellow=pass); live tests confirmed exit codes
- **AC4**: Compact welcome view for new project ✅ PASS — test line 279 confirms `maturity === 'new'`; `formatFooter` renders "Next:" CTA
- **AC5**: Full dashboard for established project ✅ PASS — test line 286 confirms `maturity === 'established'` with 12 runs; `formatFooter` renders "All healthy."
- **AC6**: Doctor delegates to existing functions ✅ PASS — `assessCliVersion` calls `checkForUpdates`, `assessScanFreshness` calls `checkScanFreshness`, `assessContext` uses `readSetupProgress`/`countPopulatedContextSections`, `assessSkills` calls `discoverSkills`/`checkSkill`, `assessProofChain` calls `computeHealthReport`. No health logic reimplemented.
- **AC7**: No `.ana/` shows error and exits 1 ✅ PASS — live test from /tmp: "No Anatomia installation found. Run: ana init", exit 1
- **AC8**: ✗ lines include fix commands ✅ PASS — `formatTerminalOutput` line 471 ("npm update -g anatomia-cli") and line 482 ("Run: ana init")
- **AC9**: Scaffold-default skill names shown ✅ PASS — test line 406; `formatTerminalOutput` line 511 lists names with "still scaffold"
- **AC10**: Stale work items >14d shown ✅ PASS — test line 441 confirms stale detection; `formatTerminalOutput` line 535 renders "⚠" line
- **AC11**: extract-docs-data.ts funcToFile includes Doctor ✅ PASS — diff confirms `Doctor: 'src/commands/doctor.ts'` added at correct location
- **AC12**: README.md Quick Start and Commands table updated ✅ PASS — diff confirms `ana doctor` in Quick Start and table row added
- **AC13**: troubleshooting.mdx has new TroubleCard and updated version mismatch card ✅ PASS — diff confirms both edits
- **AC14**: start.mdx mentions doctor after init and in Updating section ✅ PASS — diff confirms both edits
- **AC15**: Worktree guard blocks with message and exit 1 ✅ PASS — live test from worktree: "Run from the main project directory, not from a worktree.", exit 1
- **AC16**: Context setup in progress message ✅ PASS — test line 372; `formatTerminalOutput` line 500
- **AC17**: Context complete but thin message ✅ PASS — test line 381; `formatTerminalOutput` line 502
- **AC18**: Context never started message ✅ PASS — test line 393; `formatTerminalOutput` line 504
- **AC19**: Tests pass ✅ PASS — 2524 passed, 2 skipped, 109 test files (baseline was 2489 passed, 108 files — 35 new tests, 1 new file)
- **AC20**: No build errors ✅ PASS — both packages built successfully

## Blockers

No blockers. All 37 contract assertions satisfied. All 20 ACs pass. No test regressions (2524 vs 2489 baseline — +35 new tests). Checked: no unused exports in new code (both `runDoctor` and `registerDoctorCommand` have consumers), no unused parameters in exported functions, no swallowed errors that hide failures (catch blocks in assessors return sensible defaults — design-principles-compliant graceful degradation), no missing edge cases from the spec.

## Findings

- **Test — A001-A005 tests verify data model, not terminal output:** `packages/cli/tests/commands/doctor.test.ts:131-167` — Contract assertions A001-A005 target `output.lines` with `contains` matcher, but tests check `runDoctor()` return values, not formatted terminal output. The formatter is verified by source inspection. A typo in `formatTerminalOutput` wouldn't be caught. Observation — the architectural split between testable data model and presentation layer is a valid pattern, and the formatter is simple enough that source inspection is adequate.

- **Test — Dead logic in A022 test assertion:** `packages/cli/tests/commands/doctor.test.ts:410` — `'still scaffold'.split(' ')[0] ? 'deployment' : ''` is a ternary that always evaluates to `'deployment'`, making it identical to the assertion on line 408. Looks like a confused attempt to verify the "still scaffold" string in output — but the test is checking the data model, not output.

- **Code — ana.json read twice in doctor dimension assessors:** `packages/cli/src/commands/doctor.ts:153,199` — `assessScanFreshness` and `assessContext` both independently read and parse `.ana/ana.json`. This compounds the existing known issue from proof context (readAnaJson called twice in check.ts). Since they run in `Promise.all`, no sequential penalty, but a single read at the top of `runDoctor()` passed to assessors would be cleaner.

- **Test — No tests for command handler guard clauses:** `packages/cli/tests/commands/doctor.test.ts` — A018/A019 (no-ana guard) and A025/A026 (worktree guard) are untested because they're in the Commander action handler which calls `process.exit(1)`. These would require subprocess testing (`execSync('node dist/index.js doctor')`). Verified by live invocation instead.

- **Code — formatFooter redCount hardcoded to two dimensions:** `packages/cli/src/commands/doctor.ts:549-552` — `redCount` only counts `cli_version` and `scan_freshness` status. If fail status were ever added to context, skills, or proof chain dimensions, the "N issues found" count would undercount. Currently correct since only CLI version and scan freshness can be red, but fragile for future changes.

- **Upstream — Proof context: ana.json read duplication growing:** The known issue "readAnaJson called twice in check.ts" now extends further — doctor adds two more independent reads. Not a production risk, but the pattern is spreading. Worth considering a shared `readAnaJson` utility that caches per-invocation.

## Deployer Handoff

Clean feature addition. `doctor.ts` is new (no merge conflict risk). `check.ts` changes are export-only (3 `export` keywords added to existing declarations — no logic changes). `index.ts` change is two lines (import + register). Website and README changes are additive text edits.

The doctor command is read-only — no file writes, no git operations. Safe to run anywhere (with worktree guard). JSON mode (`--json`) is CI-friendly.

Test count increased from 2489 to 2524 (+35 new tests in 1 new test file). No regressions.

Pre-existing lint warning in `git-operations.ts:198` is unrelated.

## Verdict
**Shippable:** YES

37/37 contract assertions satisfied. 20/20 acceptance criteria pass. 35 new tests, no regressions. Live testing confirms both success and error paths. Build clean, lint clean. The findings are all observations — no blockers.
