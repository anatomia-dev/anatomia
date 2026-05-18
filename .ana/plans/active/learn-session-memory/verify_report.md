# Verify Report: Learn Session Memory

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-17
**Spec:** .ana/plans/active/learn-session-memory/spec.md
**Branch:** feature/learn-session-memory

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/learn-session-memory/contract.yaml
  Seal: INTACT (hash sha256:f17ae9fb0cc9c446edad2482ea557bb9bff86504dd0110a1ce7986b3caef5fb3)
```

Seal: **INTACT**

Tests: 2482 passed, 2 skipped (2484 total) across 108 test files. Build: clean (typecheck + tsup). Lint: 1 warning (pre-existing unused eslint-disable in git-operations.ts, not introduced by this build).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Initializing a new project creates a learn state file with no session history | ✅ SATISFIED | `init.test.ts:715-727` — calls `createDirectoryStructure`, reads `learn/state.json`, asserts `last_session_at` equals `null` |
| A002 | Re-initializing a project keeps the existing learn session timestamp | ✅ SATISFIED | `init.test.ts:731-767` — creates existing learn state with timestamp, runs `preserveUserState`, asserts timestamp preserved |
| A003 | Filtering by new shows only findings from entries completed after the last session | ✅ SATISFIED | `proof.test.ts:4682-4692` — creates old+new entries, sets `last_session_at` between them, asserts `total_active` equals 2 |
| A004 | When no session has been recorded, filtering by new shows all findings | ✅ SATISFIED | `proof.test.ts:4696-4705` — sets `last_session_at` to null, asserts `total_active` equals 4 |
| A005 | When the learn state file is missing, filtering by new shows all findings without error | ✅ SATISFIED | `proof.test.ts:4709-4718` — no `writeLearnState` call, asserts `total_active` equals 4 |
| A006 | Filtering by date shows only findings from entries completed after that date | ✅ SATISFIED | `proof.test.ts:4722-4730` — passes `--since 2026-05-01`, asserts `total_active` equals 2 |
| A007 | Filtering by an invalid date exits with an error | ✅ SATISFIED | `proof.test.ts:4734-4741` — passes `not-a-date`, asserts `exitCode` not 0 and stderr contains "Invalid date" |
| A008 | Filtering by a future date returns zero findings | ✅ SATISFIED | `proof.test.ts:4745-4753` — passes `2099-01-01`, asserts `total_active` equals 0 |
| A009 | New and severity filters combine — only findings matching both appear | ✅ SATISFIED | `proof.test.ts:4757-4768` — passes `--new --severity risk`, asserts `total_active` > 0 and equals 1 |
| A010 | The orientation matrix ignores the new filter and shows all findings | ✅ SATISFIED | `proof.test.ts:4772-4781` — passes `--matrix --new`, asserts `total_active` equals 4 |
| A011 | The orientation matrix ignores the since filter and shows all findings | ✅ SATISFIED | `proof.test.ts:4785-4793` — passes `--matrix --since 2026-05-01`, asserts `total_active` equals 4 |
| A012 | The orientation matrix shows how many findings are new since the last session | ✅ SATISFIED | `proof.test.ts:4797-4806` — sets `last_session_at`, runs `--matrix --json`, asserts `new_since_last` equals 2 |
| A013 | The orientation matrix includes the last session timestamp | ✅ SATISFIED | `proof.test.ts:4810-4819` — sets `last_session_at`, runs `--matrix --json`, asserts `last_session_at` is defined |
| A014 | The orientation matrix omits session info when no session has been recorded | ✅ SATISFIED | `proof.test.ts:4823-4832` — sets `last_session_at` to null, asserts `new_since_last` is undefined |
| A015 | The human-readable matrix shows a new-since line when a session timestamp exists | ✅ SATISFIED | `proof.test.ts:4836-4844` — runs `--matrix` (no --json), asserts stdout contains "New since last session" |
| A016 | The human-readable matrix omits the new-since line when no session exists | ✅ SATISFIED | `proof.test.ts:4848-4856` — sets null `last_session_at`, asserts stdout does not contain "New since last session" |
| A017 | Filtering by new works in JSON output mode | ✅ SATISFIED | `proof.test.ts:4860-4870` — passes `--new --json`, asserts `command` equals "proof audit" and `total_active` equals 2 |
| A018 | Filtering by date works in JSON output mode | ✅ SATISFIED | `proof.test.ts:4874-4883` — passes `--since 2026-05-01 --json`, asserts `command` equals "proof audit" and `total_active` equals 2 |
| A019 | Ending a learn session records the current timestamp | ✅ SATISFIED | `learn.test.ts:130-145` — runs `learn end`, reads `state.json`, asserts `last_session_at` is defined, not null, and valid ISO |
| A020 | Ending a learn session creates a git commit | ✅ SATISFIED | `learn.test.ts:150-158` — runs `learn end`, checks `git log`, asserts commit contains "[learn] End session" |
| A021 | Ending a learn session from the wrong branch is rejected | ✅ SATISFIED | `learn.test.ts:163-171` — switches to feature branch, runs `learn end`, asserts exit code not 0 and stderr contains "Wrong branch" |
| A022 | Ending a learn session shows how many findings will be old next time | ✅ SATISFIED | `learn.test.ts:176-183` — creates 7 findings, runs `learn end`, asserts stdout contains "Findings now" and "7" |
| A023 | Ending a learn session on a project without a learn directory creates it | ✅ SATISFIED | `learn.test.ts:188-200` — no `withLearnState`, runs `learn end`, reads `state.json`, asserts timestamp defined |
| A024 | Ending a learn session returns valid JSON when requested | ✅ SATISFIED | `learn.test.ts:205-214` — runs `learn end --json`, parses JSON, asserts `command` equals "learn end" |
| A025 | The Learn template references session-aware startup with new findings count | ✅ SATISFIED | Source inspection: `ana-learn.md:86` contains "new findings since last session" |
| A026 | The Learn template includes session wrap-up with ana learn end | ✅ SATISFIED | Source inspection: `ana-learn.md:472` contains "ana learn end" in wrap-up flow |
| A027 | The README documents the learn end command | ✅ SATISFIED | Source inspection: `README.md:190` contains "ana learn end" |
| A028 | The using-ana-learn guide references session memory | ✅ SATISFIED | Source inspection: `using-ana-learn.mdx:102` contains "ana learn end" |
| A029 | The toolbelt page lists learn end in the ana-learn agent row | ✅ SATISFIED | Source inspection: `toolbelt.mdx:41` contains "ana learn end" in the ana-learn row |

## Independent Findings

Thorough. Clean build overall with good spec adherence. The implementation follows established patterns and the tests are well-structured with meaningful assertions.

**Confirmed predictions:**
- Duplicated learn-state-reading logic between matrix block and filter block (predicted shared-vs-independent concern). Both paths correctly read and parse `state.json` independently — this is correct per spec since matrix runs inside an early-return block. The duplication is minor (15 lines each) and extracting a helper would couple the matrix block to the filter block unnecessarily.

**Not found (builder got it right):**
- Missing-status handling: Both `learn end` (line 75: `!finding.status || finding.status === 'active'`) and matrix enrichment (line 1728: `if (finding.status && finding.status !== 'active') continue`) correctly treat missing status as active. Consistent.
- Edge case handling for missing `completed_at`: Both matrix (line 1725: `if (!entry.completed_at) continue`) and filter (line 1934: `if (!completedAt) return false`) handle entries without `completed_at` gracefully.
- Template voice: Additions at lines 86, 88, 90, 461-476, 506 are well-integrated with existing template voice and flow.

**Surprised (not predicted):**
- The sync vs async fs choice in `learn.ts` — the builder used `node:fs` (synchronous) while `init/assets.ts` uses `node:fs/promises` (async). This is defensible — `learn end` is a short-lived command and the proof close command uses sync fs too — but it's a style inconsistency.

## AC Walkthrough

- [x] **AC1:** `ana init` creates `.ana/learn/` directory containing `state.json` seeded with `{ "last_session_at": null }` — ✅ PASS. Verified via `init.test.ts:715-727` and source reading of `assets.ts:67-74`.
- [x] **AC2:** `ana init` on an existing project preserves `.ana/learn/state.json` — ✅ PASS. Verified via `init.test.ts:731-767` and source reading of `state.ts:609-620`.
- [x] **AC3:** `ana proof audit --new` shows only active findings from entries after `last_session_at` — ✅ PASS. Verified via `proof.test.ts:4682-4692` and source reading of `proof.ts:1898-1939`.
- [x] **AC4:** When `last_session_at` is null or state.json doesn't exist, `--new` shows all — ✅ PASS. Verified via `proof.test.ts:4696-4718` (both null and missing cases).
- [x] **AC5:** `--since` filters by ISO date — ✅ PASS. Verified via `proof.test.ts:4722-4730`.
- [x] **AC6:** `--new` composes with `--severity`, `--entry`, and `--full` — ✅ PASS. Composition tested in `proof.test.ts:4757-4768` (`--new --severity risk` → 1 finding). Filter ordering in source (`proof.ts:1878-1939`) shows `--severity` → `--entry` → `--new/--since`, all applied sequentially on the same `activeFindings` array. `--full` is orthogonal (controls truncation, not filtering).
- [x] **AC7:** `--matrix` silently ignores `--new` and `--since` — ✅ PASS. Verified via `proof.test.ts:4772-4793`. Matrix returns at line 1819 before the filter block at line 1898.
- [x] **AC8:** When `last_session_at` is non-null, `--matrix` includes `new_since_last` and `last_session_at` — ✅ PASS. JSON: `proof.test.ts:4797-4806`. Human-readable: `proof.test.ts:4836-4844`.
- [x] **AC9:** When `last_session_at` is null, `--matrix` omits "new since" line — ✅ PASS. JSON: `proof.test.ts:4823-4832`. Human-readable: `proof.test.ts:4848-4856`.
- [x] **AC10:** `ana learn end` writes timestamp, commits, and pushes — ✅ PASS. Live tested: timestamp written to `state.json`, commit created with `[learn] End session`. Push fails gracefully (no remote in test) with "Committed locally" message.
- [x] **AC11:** `ana learn end` enforces artifact branch — ✅ PASS. Live tested on `feature/test` branch → "Error: Wrong branch." Test: `learn.test.ts:163-171`.
- [x] **AC12:** `ana learn end` outputs confirmation with timestamp and count — ✅ PASS. Live tested: output shows "Learn session ended. / Timestamp: ... / Findings now 'old' in next session: 0". Test: `learn.test.ts:176-183`.
- [x] **AC13:** Learn template startup references `--new` count — ✅ PASS. `ana-learn.md:86`: "new findings since last session" conditional on `new_since_last > 0`.
- [x] **AC14:** Learn template communicates session boundaries at startup and wrap-up — ✅ PASS. Startup: `ana-learn.md:90` ("I'll run `ana learn end`..."). Wrap-up: `ana-learn.md:461-476` (explicit delta + `ana learn end` with developer confirmation).
- [x] **AC15:** `--new` and `--since` work in both JSON and human-readable — ✅ PASS. JSON tested in `proof.test.ts:4860-4883`. Human-readable uses same filter logic; filter runs before output formatting.
- [x] **Tests pass** — ✅ PASS. 2482 passed, 2 skipped, 108 test files.
- [x] **No build errors** — ✅ PASS. Typecheck + tsup clean.
- [x] **Lint passes** — ✅ PASS. 0 errors, 1 pre-existing warning.
- [x] **README, guide, toolbelt updated** — ✅ PASS. All three documents contain `ana learn end` references.

## Blockers

None. All 29 contract assertions satisfied. All 18 acceptance criteria pass. No regressions (2482 tests, same 2 pre-existing skips). Checked: no unused exports in new files (`learn.ts` exports only `registerLearnCommand`, imported in `index.ts`). No unhandled error paths — `learn end` handles wrong branch, missing learn directory, missing/malformed proof chain, and push failure. No silent swallowing of errors that callers need.

## Findings

- **Code — `commitAndPushProofChanges` and `pullBeforeRead` exported from proof.ts rather than extracted:** `packages/cli/src/commands/proof.ts:126,156` — The spec recommended extracting these to `git-operations.ts` since they have no proof-specific logic. The builder chose to export them in place instead. This works and avoids a large refactor, but creates a dependency from `learn.ts` on `proof.ts` for generic git operations. Future commands (e.g., `learn status`) would deepen this coupling. Worth scoping as a future extraction task.

- **Code — Duplicated learn state reading logic:** `packages/cli/src/commands/proof.ts:1717` and `:1913` — Two independent blocks parse `.ana/learn/state.json`: one in the matrix early-return block, one in the `--new` filter. This is correct by design (matrix returns before filters run), and the duplication is minor (~15 lines each). Not worth extracting unless a third consumer appears.

- **Code — `--new` and `--since` simultaneous use undocumented:** `packages/cli/src/commands/proof.ts:1899` — If both `--new` and `--since` are provided, `--since` silently wins (checked first in the if/else). No error, no warning. Not harmful, but Commander could add `.conflicts()` or the code could warn. Low priority.

- **Code — Synchronous fs in learn.ts vs async in init:** `packages/cli/src/commands/learn.ts:63-86` — Uses `fs.existsSync`, `fs.mkdirSync`, `fs.readFileSync`, `fs.writeFileSync` while `init/assets.ts` uses `fs/promises`. This is consistent with `proof.ts` patterns (which also use sync fs in command actions), so it's defensible as following the closest pattern. Style inconsistency between command modules, not a correctness issue.

- **Test — No @ana tags for A025-A029:** These documentation/template content assertions have no tagged tests. Verified by source inspection (checking actual file content against contract `value` fields). The spec's testing strategy describes these as enforcement tests where source-content assertions are acceptable per testing standards.

- **Upstream — Pre-existing lint warning:** `packages/cli/src/utils/git-operations.ts:198` — Unused eslint-disable directive. Not introduced by this build. Already tracked.

- **Code — Known proof context issue still present:** `packages/cli/src/commands/proof.ts` — Duplicated zero-entry JSON payload (audit-matrix-orientation-C5) still exists. This build didn't add a third copy — the `--new`/`--since` filter uses the same zero-findings block that already existed. No regression.

## Deployer Handoff

Straightforward merge. No migration needed — `ana init` creates the new `learn/` directory for new projects; `ana learn end` creates it on-demand for existing projects. The `learn/state.json` file is committed (not gitignored), so it's shared across machines.

The `--new` and `--since` flags are additive to existing `ana proof audit` behavior. No breaking changes to existing flags or output formats.

The `ana learn end` command is designed to be invoked by the Learn template during wrap-up. It can also be run manually.

Test count: 2482 → up from baseline 2458 (24 new tests). New test file: `learn.test.ts`.

## Verdict

**Shippable:** YES

All 29 contract assertions satisfied. All acceptance criteria pass. Live-tested `ana learn end` on real projects — success path, error path (wrong branch), JSON output, and missing-directory creation all work correctly. Tests are well-structured with specific assertions against known fixture data. Code follows established patterns. Findings are all observations/debt — no blockers.
