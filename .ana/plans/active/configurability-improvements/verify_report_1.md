# Verify Report: Schema Passthrough and Verify Agent Skills

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-12
**Spec:** .ana/plans/active/configurability-improvements/spec-1.md
**Branch:** feature/configurability-improvements

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/configurability-improvements/contract.yaml
  Seal: INTACT (hash sha256:2c415feaed690dc785360be55e1a7b98b6dce5e95bf55904939c8d23b2732a84)
```

Seal status: **INTACT**

Tests: 2109 passed, 2 skipped (2111 total). Build: success. Lint: 0 errors, 1 pre-existing warning (unused eslint-disable directive in `git-operations.ts:169`).

Baseline was 2107 passed + 2 skipped = 2109 total. Net +2 tests added, 0 failures, 0 regressions.

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Unknown fields in ana.json survive re-initialization | ✅ SATISFIED | `packages/cli/tests/commands/init/anaJsonSchema.test.ts:57-78`, asserts `scanStaleDays` key exists AND value equals 7 |
| A002 | Legacy fossil fields are preserved instead of stripped | ✅ SATISFIED | `packages/cli/tests/commands/init/anaJsonSchema.test.ts:98-108`, asserts `setupMode` and `setupCompletedAt` exist with correct values |
| A003 | Invalid known fields still get safe defaults even with passthrough | ✅ SATISFIED | `packages/cli/tests/commands/init/anaJsonSchema.test.ts:111-119`, asserts `setupPhase` is undefined while `unknownKey` survives |
| A004 | Custom namespace defaults still work with passthrough | ✅ SATISFIED | `packages/cli/tests/commands/init/anaJsonSchema.test.ts:137-146`, asserts `custom` defaults to `{}` when missing |
| A005 | Unknown keys coexist with catch defaults in a single parse | ✅ SATISFIED | `packages/cli/tests/commands/init/anaJsonSchema.test.ts:122-132`, asserts `unknownKey` equals `"preserved"` while `setupPhase` defaults and `language` catches |
| A006 | Verify agent template declares testing and coding skills | ✅ SATISFIED | Source inspection: `packages/cli/templates/.claude/agents/ana-verify.md:5` — `skills: [testing-standards, coding-standards]` contains `testing-standards` |
| A007 | Verify agent template declares coding-standards skill | ✅ SATISFIED | Source inspection: `packages/cli/templates/.claude/agents/ana-verify.md:5` — `skills: [testing-standards, coding-standards]` contains `coding-standards` |
| A008 | Dogfood verify agent matches the template exactly | ✅ SATISFIED | `diff` of both files returned empty (byte-identical). Dogfood sync test at `packages/cli/tests/templates/agent-proof-context.test.ts:67-76` passes |
| A009 | Verify template tells the agent that skills are auto-loaded | DEVIATED | The text "auto-loaded" is no longer present in Step 7. The builder correctly removed the false claim per the previous verify report's blocker — Claude Code does not auto-load skills from frontmatter. Step 7 now says `Invoke after reading contracts: /testing-standards, /coding-standards` which is the correct pattern (matching ana-build and ana-plan). The contract assertion encodes a false premise identified in the previous verify cycle. |

8/9 SATISFIED. 1 DEVIATED (A009 — contract premise was false; builder correctly fixed the behavior per previous verify report's blocker).

## Independent Findings

**Prediction resolution:**
- **P1 (minimal fix):** Confirmed. Builder condensed Step 7 from a 3-line bulleted list to a single-line explicit invocation. Clean and functional.
- **P2 (dogfood mismatch):** Not found. Both files byte-identical per `diff`.
- **P3 (no tagged test for A009):** Confirmed. No `@ana` tags for this build's A006-A009 in the build's test files — same as previous round. Verified by source inspection.
- **P4 (passthrough unchanged):** Confirmed. Schema code at `anaJsonSchema.ts:37-55` identical to previous round.
- **P5 (contract/text contradiction):** Confirmed. "auto-loaded" removed, explicit invocation restored. The contract A009 is now stale — it requires text that was correctly removed. This is an upstream contract issue.

**Production risk resolved:** The previous report's blocker — that fresh projects would silently skip skill loading — is fixed. Step 7 now explicitly invokes both skills.

## Previous Findings Resolution

### Previously UNSATISFIED Assertions
| ID | Previous Issue | Current Status | Resolution |
|----|----------------|----------------|------------|
| A009 | Template claimed skills are "auto-loaded" but Claude Code doesn't auto-load from frontmatter | DEVIATED | Builder removed false "auto-loaded" claim, restored explicit invocation. Correct behavior. Contract assertion is stale — encodes the false premise the previous report identified. |

### Previous Findings
| Finding | Status | Notes |
|---------|--------|-------|
| Code — Step 7 removes explicit skill invocation | Fixed | Step 7 now explicitly invokes `/testing-standards` and `/coding-standards` |
| Upstream — Contract A009 and spec AC4 encode false premise | Still present | Contract still says `contains "auto-loaded"` — the builder correctly chose not to satisfy a false assertion |
| Code — Type widening not guarded | Still present | No consumer changes, no property enumeration added. Monitor. |
| Test — A006-A009 have no @ana tags | Still present | Assertions about static file content, verified by source inspection. Not a blocker. |
| Code — Unspecified file change in git-operations.test.ts | Still present | Correct and necessary change — flipped strip to preservation assertion |
| Upstream — No passthrough size guard | Still present | Low risk for local CLI config file. Monitor if `config set` introduces automated writes. |

## AC Walkthrough

- **AC1:** Unknown top-level keys survive `ana init` re-init. ✅ PASS — Test at `anaJsonSchema.test.ts:57-78` verifies `scanStaleDays: 7` survives parse. Schema uses `.passthrough()` at line 55.
- **AC2:** `.catch()` defaults still fire for invalid known fields with passthrough active. ✅ PASS — Test at `anaJsonSchema.test.ts:111-119` verifies `setupPhase: 'invalid-value'` defaults to undefined while unknown keys survive.
- **AC3:** `ana-verify` agent template declares `skills: [testing-standards, coding-standards]` in frontmatter. ✅ PASS — Read `packages/cli/templates/.claude/agents/ana-verify.md:5`.
- **AC4:** Verify template body text reflects that skills are auto-loaded, not manually invoked. ⚠️ PARTIAL — The previous verify report identified this AC as encoding a false premise (Claude Code doesn't auto-load from frontmatter). The builder correctly restored explicit invocation instead. Step 7 now uses the same pattern as ana-build and ana-plan: frontmatter declares, body invokes. The AC's stated goal (auto-loading) was wrong; the actual goal (consistent skill loading) is met.
- **AC5:** Dogfood verify agent is byte-identical to template. ✅ PASS — `diff` returned empty.
- **AC6:** `ana agents` dashboard shows 2 skills for verify. ✅ PASS — Live invocation: `ana-verify  38,255 chars  2 skills`.
- **AC16:** No existing tests break. Test count increases. ✅ PASS — 2109 passed (was 2107), 0 failures.
- **Tests pass:** ✅ PASS — `(cd packages/cli && pnpm vitest run)`: 2109 passed, 2 skipped.
- **No build errors:** ✅ PASS — `pnpm run build`: 2 tasks successful.

7/9 ACs pass. 1 PARTIAL (AC4 — false premise corrected). 0 FAIL.

## Blockers

No blockers. The previous round's blocker (Step 7 removing explicit skill invocation based on false auto-loading premise) is resolved. Step 7 now explicitly invokes both skills.

Checked for: unused exports in new code (none — no new exports added), unused parameters in modified functions (none — schema is declarative, no function signatures changed), error paths without test coverage (N/A — schema `.catch()` paths all tested), external state assumptions (none — schema is pure input→output).

## Findings

- **Upstream — Contract A009 encodes false premise:** Contract says `step7Content contains "auto-loaded"` but Claude Code doesn't auto-load skills from frontmatter. The builder correctly removed the false claim per the previous verify report's blocker. The assertion is stale — update on next re-plan. Not a blocker because the underlying behavior is correct.
- **Code — Type widening from `.passthrough()`:** `packages/cli/src/commands/init/anaJsonSchema.ts:55` — `AnaJson` type now includes `& { [k: string]: unknown }`. No consumer currently enumerates keys, but future consumers could iterate unknown fields without a type error. Monitor for property enumeration in future consumers.
- **Test — A006-A009 have no `@ana` tags in this build's test files:** The verify template assertions were verified by source inspection and the pre-existing dogfood sync test. Not a blocker — the assertions are about static file content — but untagged assertions weaken automated traceability.
- **Code — Unspecified file change was correct:** `packages/cli/tests/utils/git-operations.test.ts:292` — Builder modified a test not listed in the contract's `file_changes`. The change was necessary (flipped strip assertion to match passthrough behavior) and correct. Scope creep in the positive direction.
- **Upstream — No passthrough size guard:** Passthrough has no limit on the number or size of unknown keys. A corrupted ana.json could grow across re-init cycles. Low risk for a local CLI config file, but worth scoping if `config set` (Phase 2) introduces automated writes to unknown keys.
- **Code — Step 7 body condensed to single line:** `packages/cli/templates/.claude/agents/ana-verify.md:139` — The original 3-line bulleted list (each skill on its own line with a description) was condensed to a single inline sentence. Functionally identical, but the bulleted format was more scannable for agents parsing instructions. Minor style observation.

## Deployer Handoff

Phase 1 is ready to merge. The schema passthrough change (A001-A005) is clean — good tests, correct doc comment, no consumer regressions. The verify agent skills change (A006-A008) is correct — frontmatter declared, dogfood synced, agents dashboard shows 2 skills.

A009/AC4: The contract assertion requires "auto-loaded" text that the builder correctly removed (per the previous verify report's blocker about false auto-loading claims). The underlying behavior is right — Step 7 now explicitly invokes both skills, matching the pattern used by ana-build and ana-plan. The contract assertion should be updated on next re-plan to reflect the actual pattern (frontmatter declares + body invokes).

Phase 2 (`config set` command) has not been built yet.

## Verdict
**Shippable:** YES

Schema passthrough is solid. Verify agent skills are correctly declared in frontmatter with explicit invocation in body text. The previous round's blocker (false auto-loading claim) is resolved. The only contract deviation (A009) exists because the assertion encoded a false premise that the previous verify report identified — the builder correctly fixed the behavior rather than satisfying a wrong assertion. All tests pass, no regressions, no blockers.
