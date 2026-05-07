# Verify Report: Fix Pipeline Phase Timing

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-07
**Spec:** .ana/plans/active/phase-timing-fix/spec.md
**Branch:** feature/phase-timing-fix

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/phase-timing-fix/contract.yaml
  Seal: INTACT (hash sha256:5ac86cd400896f30cbc38dd8adcd59ee015537872bb6665d976a02ee37d365db)
```

Seal status: **INTACT**

Tests: 2013 passed, 2 skipped (baseline was 1998 passed, 2 skipped — 15 new tests). Build: success. Lint: 0 errors, 1 warning (pre-existing unused eslint-disable directive in unrelated file).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Starting work from inside a worktree during Verify phase records verify_started_at | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3214` — `@ana A001`, asserts `saves.verify_started_at` is defined and `verify_agent` is `'ana-verify'` |
| A002 | Starting work from inside a worktree during Build phase records build_started_at | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3192` — `@ana A002`, asserts `saves.build_started_at` is defined and `build_agent` is `'ana-build'` |
| A003 | Starting work from main during Plan phase records plan_started_at | ✅ SATISFIED | No tagged test. Verified by source inspection: `packages/cli/src/commands/work.ts:1549` — Plan phase block (`hasScope && !hasPlan && !specExists`) calls `writeTimestamp(activePath, 'plan_started_at', 'ana-plan')`. Write-once guard defaults to `force: false`. |
| A004 | Plan duration uses actual session start time when available | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3445` — `@ana A004`, sets `plan_started_at` 15min before contract, asserts `timing.plan === 15` |
| A005 | Plan duration falls back to artifact gap when no session start recorded | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3466` — `@ana A005`, no `plan_started_at`, asserts `timing.plan === 30` (contract - scope gap) |
| A006 | Plan template tells agent to record session start | ✅ SATISFIED | `packages/cli/templates/.claude/agents/ana-plan.md:34` — contains `Run \`ana work start {slug}\` to record the plan session start time.` |
| A007 | Dogfood plan template tells agent to record session start | ✅ SATISFIED | `.claude/agents/ana-plan.md:34` — identical content to shipped template, contains `work start` |
| A008 | Plan timing rejects session starts after contract saved | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3483` — `@ana A008`, `plan_started_at` after `contractTime`, asserts fallback `timing.plan === 30` |
| A009 | Plan timing rejects durations longer than 24 hours | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3501` — `@ana A009`, `plan_started_at` 48h before contract, asserts fallback `timing.plan === 30` |
| A010 | Old entries without plan_started_at still compute correct plan timing | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3519` — `@ana A010`, no `plan_started_at`, asserts `timing.plan === 30` and `timing.think === 20` |
| A011 | Verify session start not overwritten on repeat call | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3268` — `@ana A011`, pre-writes `verify_started_at: '2026-04-01T10:00:00Z'`, calls startWork, asserts value preserved as `'2026-04-01T10:00:00Z'` |
| A012 | Build session start intentionally overwritten in FAIL→Fix | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3288` — `@ana A012`, pre-writes `build_started_at: '2026-04-01T10:00:00Z'`, FAIL verify report triggers force overwrite, asserts `not.toBe(oldTimestamp)` |
| A013 | Warning appears when worktree missing during timestamp write | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3310` — `@ana A013`, sets up Verify phase on main with no worktree directory, asserts output contains `'Worktree not found'` and `'Timestamp skipped'` |
| A014 | Verify template tells agent to enter worktree before recording start | ✅ SATISFIED | `packages/cli/templates/.claude/agents/ana-verify.md:55` — contains `cd to the worktree path, THEN run \`ana work start {slug}\`` |
| A015 | Dogfood verify template tells agent to enter worktree before recording start | ✅ SATISFIED | `.claude/agents/ana-verify.md:55` — identical content to shipped template, contains `cd` |
| A016 | Starting work during Verify does not accidentally record build_started_at | ✅ SATISFIED | `packages/cli/tests/commands/work.test.ts:3235` — `@ana A016`, Verify phase artifacts, asserts `build_started_at` is undefined while `verify_started_at` is defined |
| A017 | Verify duration still uses actual session start when available | ✅ SATISFIED | `packages/cli/tests/utils/proofSummary.test.ts:3537` — `@ana A017`, sets `verify_started_at` 30min before verify-report, asserts `timing.verify === 30` |

17/17 assertions SATISFIED.

## Independent Findings

**Predictions resolved:**

1. *"Fix phase detection for numbered variants is fiddly"* — **Not found.** The builder correctly reads each numbered verify report and checks for FAIL regex. The loop breaks on first FAIL. Clean implementation.
2. *"plan_started_at sanity guard might use < instead of <="* — **Not found.** Code uses `planStartedAt <= contractTime` (line 1511 of proofSummary.ts), and a dedicated test confirms `plan_started_at === contractTime` produces `timing.plan === 0`. Edge case handled.
3. *"A013 test might not verify exact warning text"* — **Confirmed (minor).** Test asserts `toContain('Worktree not found')` and `toContain('Timestamp skipped')` separately — reasonable. The exact emoji and formatting aren't tested but that's cosmetic.
4. *"Dogfood copies might differ from shipped templates"* — **Not found.** Git diff confirms both `.claude/agents/ana-plan.md` and `packages/cli/templates/.claude/agents/ana-plan.md` received identical changes. Same for ana-verify.md.
5. *"Write-once test might not verify original value preserved"* — **Not found.** A011 test pre-writes `'2026-04-01T10:00:00Z'` and asserts the exact value is preserved after second call. Strong test.

**Surprised by:** The early-return path's `else if (!worktreeExists(projectRoot, slug))` warning (line 1452) has a subtle logic issue. See Code finding below.

## AC Walkthrough
- ✅ **AC1:** `work start` from inside worktree during Verify writes `verify_started_at` — test at work.test.ts:3214, verified by reading test and source.
- ✅ **AC2:** `work start` from inside worktree during Build writes `build_started_at` — test at work.test.ts:3192.
- ✅ **AC3:** `work start` from main during Plan writes `plan_started_at` — source inspection at work.ts:1549, Plan block calls `writeTimestamp(activePath, 'plan_started_at', 'ana-plan')`.
- ✅ **AC4:** `computeTiming` uses `plan_started_at` when available, falls back otherwise — tests at proofSummary.test.ts:3445 and :3466.
- ✅ **AC5:** `computeTiming` uses `verify_started_at` — test at proofSummary.test.ts:3537 confirms 30min verify duration from `verify_started_at`.
- ✅ **AC6:** Plan template instructs `work start {slug}` — verified at ana-plan.md:34.
- ✅ **AC7:** Sanity guards on `plan_started_at` — tests for after-contract (A008), over-24h (A009), invalid date fallback.
- ✅ **AC8:** Backward compat without `plan_started_at` — test at proofSummary.test.ts:3519 confirms gap timing.
- ✅ **AC9:** `build_started_at` NOT overwritten during Verify — test at work.test.ts:3235 asserts undefined.
- ✅ **AC10:** `writeTimestamp` write-once behavior — test at work.test.ts:3268, guard at work.ts:1780.
- ✅ **AC11:** FAIL→Fix path overwrites with force — test at work.test.ts:3288, code at work.ts:1441 and :1597.
- ✅ **AC12:** Missing worktree produces warning — test at work.test.ts:3310, code at work.ts:1566 and :1599.
- ✅ **AC13:** Tests pass — 2013 passed, 2 skipped (15 new tests above baseline of 1998).
- ✅ **AC14:** No build errors — `pnpm run build` succeeded.

## Blockers
No blockers. All 17 contract assertions SATISFIED, all 14 ACs pass. Checked for: unused parameters in new code (the `force` parameter is used at 2 call sites plus the guard), unhandled error paths in new code (the early-return phase detection has no try/catch around fs reads, but `fs.existsSync` + `fs.readFileSync` follow the same unguarded pattern as the existing main-path code — consistent), spec gaps requiring builder decisions (none — the spec was precise about which paths need timestamps and which need force).

## Findings

- **Code — Early-return missing-worktree warning is misleading from inside worktree:** `packages/cli/src/commands/work.ts:1452` — The `else if (!worktreeExists(projectRoot, slug))` branch fires when `localActivePath` doesn't exist. But from inside a worktree, `projectRoot` resolves to the worktree root, so `worktreeExists` checks `worktreeRoot/.ana/worktrees/slug` (nested path that never exists). If the plan directory is absent inside the worktree, the user gets "Worktree not found" when they're clearly inside it. This only triggers if someone manually deletes the plan directory from inside the worktree — unlikely in practice, but the message is incorrect for that edge case.

- **Code — Early-return phase detection adds 3 globSync calls per `work start` from inside worktree:** `packages/cli/src/commands/work.ts:1419-1421` — Three `globSync` calls for numbered specs/reports fire on every early-return. Known concern from prior cycles ("Phase detection globSync could be slow with many plans"). The glob patterns scope to a single slug directory so the practical impact is minimal, but it's additive with the existing main-path globs.

- **Code — Race condition in writeTimestamp read-modify-write on .saves.json:** `packages/cli/src/commands/work.ts:1769-1789` — The read-parse-modify-write sequence is not atomic. If two agents call `work start` simultaneously (e.g., Build and Verify in rapid succession), one write could be lost. This is pre-existing behavior, not introduced by this build, but the write-once guard makes it slightly more consequential — a lost write means the guard won't fire on the next call.

- **Test — A003 has no dedicated tagged test:** `packages/cli/src/commands/work.ts:1549` — The Plan-phase `plan_started_at` write is verified by source inspection only. The existing `process.exit` in `startWork` validation paths makes it hard to test the Plan phase in isolation (known issue: "process.exit in startWork prevents unit testing phase detection"). Still, the proof chain benefits from tagged test coverage — see prior finding from Worktree Isolation cycle that flagged this same gap for A001-A003.

- **Test — Fix-phase early-return test has no `@ana` tag:** `packages/cli/tests/commands/work.test.ts:3248` — The "early-return writes build_started_at during Fix phase" test covers FAIL→Fix from inside the worktree but isn't linked to any contract assertion ID. It effectively demonstrates A012's force behavior from the early-return path (complementing the main-path A012 test), but the proof chain can't trace it.

- **Upstream — proofSummary.ts file size:** `packages/cli/src/utils/proofSummary.ts` — Now ~1565 lines after the 16-line addition. Still past the comfort threshold noted in prior cycles. The `computeTiming` changes follow the existing pattern cleanly and add minimal complexity, so this build isn't the one to address it — but the file keeps growing.

## Deployer Handoff
Straightforward merge. Changes are additive — write-once guard defaults to `force: false` so all existing `writeTimestamp` call sites are idempotent without code changes. The template changes affect agent behavior on next pipeline run (Plan agents will call `work start`, Verify agents will `cd` before `work start`). No migration needed. The `plan_started_at` field in `.saves.json` will appear on new pipeline runs only — old entries without it fall back to artifact-gap timing (verified by A010).

## Verdict
**Shippable:** YES

17/17 contract assertions satisfied. 14/14 acceptance criteria pass. 15 new tests, all passing. Implementation follows existing patterns precisely — the `computeTiming` plan block mirrors the build block, the early-return phase detection mirrors the main-path detection, the write-once guard is minimal. Findings are all observation-level: a misleading warning message in an edge case nobody will hit, known file size growth, and a missing tagged test for A003. None prevent shipping.
