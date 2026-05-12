# Verify Report: Schema Passthrough and Verify Agent Skills

**Result:** FAIL
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

Tests: 2109 passed, 2 skipped (2111 total). Build: success. Lint: 0 errors, 1 pre-existing warning (unused eslint-disable directive in unrelated file).

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
| A008 | Dogfood verify agent matches the template exactly | ✅ SATISFIED | `diff` of both files returned empty (byte-identical). Pre-existing dogfood sync test at `packages/cli/tests/templates/agent-proof-context.test.ts:67-76` passes |
| A009 | Verify template tells the agent that skills are auto-loaded | UNSATISFIED | The text at `packages/cli/templates/.claude/agents/ana-verify.md:139` does contain "auto-loaded" — but this is factually incorrect. Claude Code does not auto-load skills from frontmatter. Both `ana-build.md:42` and `ana-plan.md:59` declare skills in frontmatter AND explicitly invoke them in body text. The builder followed the spec faithfully, but the spec's premise was wrong. Step 7 must retain explicit `/testing-standards` and `/coding-standards` invocation alongside the frontmatter declaration. |

8/9 assertions SATISFIED. 1 UNSATISFIED (A009).

## Independent Findings

**Prediction resolution:**
- **P1 (doc comment incomplete):** Not confirmed. Builder rewrote lines 6-23 thoroughly — describes passthrough, explains why, mentions data-loss footgun. Clean.
- **P2 (template sync missed):** Not confirmed. Both files byte-identical per `diff`.
- **P3 (step 7 remnants):** Ironically inverted — the problem is that step 7 has NO remnant invocation language when it SHOULD have kept it. I predicted remnants as a bug; turns out removing them IS the bug.
- **P4 (shallow tests):** Partially confirmed — see test finding below.
- **P5 (type widening consumers):** Not investigated in depth — no consumer code was changed. Noted as risk finding.

**Production risk confirmed:**
- On fresh projects where the verify agent loads this template without cached skill state from main, skills will never load. The agent will proceed without testing-standards or coding-standards reference material, degrading verification quality silently — no error, just missing context.

**Surprise finding:** Builder also modified `packages/cli/tests/utils/git-operations.test.ts:289-300` — flipped a strip assertion to a preservation assertion. This file isn't listed in the contract's `file_changes` but the fix is correct and necessary (the test would have failed otherwise). Good initiative.

## AC Walkthrough

- **AC1:** Unknown top-level keys survive `ana init` re-init. ✅ PASS — Test at `anaJsonSchema.test.ts:57-78` verifies `scanStaleDays: 7` survives parse. Schema uses `.passthrough()` at line 55.
- **AC2:** `.catch()` defaults still fire for invalid known fields with passthrough active. ✅ PASS — Test at `anaJsonSchema.test.ts:111-119` verifies `setupPhase: 'invalid-value'` defaults to undefined while unknown keys survive.
- **AC3:** `ana-verify` agent template declares `skills: [testing-standards, coding-standards]` in frontmatter. ✅ PASS — Read `packages/cli/templates/.claude/agents/ana-verify.md:5`.
- **AC4:** Verify template body text reflects that skills are auto-loaded, not manually invoked. ❌ FAIL — The text does say "auto-loaded" but this is a false claim. Claude Code does not auto-load skills from frontmatter. The correct pattern (used by ana-build and ana-plan) is: frontmatter declares, body explicitly invokes. Step 7 must keep explicit `/testing-standards` and `/coding-standards` invocation instructions.
- **AC5:** Dogfood verify agent is byte-identical to template. ✅ PASS — `diff` returned empty.
- **AC6:** `ana agents` dashboard shows 2 skills for verify. ✅ PASS — Live invocation: `ana-verify  38,199 chars  2 skills`.
- **AC16:** No existing tests break. Test count increases. ✅ PASS — 2109 passed (was 2107), 0 failures.
- **Tests pass:** ✅ PASS — `(cd packages/cli && pnpm vitest run)`: 2109 passed, 2 skipped.
- **No build errors:** ✅ PASS — `pnpm run build`: 2 tasks successful.

8/9 ACs pass. 1 FAIL (AC4).

## Blockers

**1. Step 7 removes explicit skill invocation based on false auto-loading premise.**

`packages/cli/templates/.claude/agents/ana-verify.md:139` now reads:
> "Testing-standards and coding-standards are auto-loaded via frontmatter — they are available as reference material without manual invocation."

Claude Code does not auto-load skills from frontmatter. Evidence:
- `ana-build.md` has `skills: [git-workflow]` in frontmatter (line 5) AND `Invoke before any work: /git-workflow` in body (line 42).
- `ana-plan.md` has `skills: [coding-standards, testing-standards]` in frontmatter (line 5) AND `Invoke /coding-standards — always` in body (line 59).
- Both pipeline agents maintain explicit invocation alongside frontmatter.

**Fix required:** Step 7 body must retain explicit invocation instructions — e.g., "Invoke after reading contracts: `/testing-standards`, `/coding-standards`" — while keeping the new frontmatter declaration. Match the pattern used by ana-build and ana-plan: declare in frontmatter, invoke in body. Both the template and dogfood copy must be updated identically.

This is a spec-level error (the spec told the builder to make this change), not a builder error. The builder followed the spec faithfully.

## Findings

- **Code — Step 7 removes explicit skill invocation:** `packages/cli/templates/.claude/agents/ana-verify.md:139` — Replaces working explicit invocation with a false claim about auto-loading. On fresh projects, verify agents will silently skip loading testing-standards and coding-standards. This is the FAIL blocker.
- **Upstream — Contract A009 and spec AC4 encode false premise:** The contract assertion says "tells the agent that skills are auto-loaded" and the spec says "inform the agent that skills are auto-loaded via frontmatter rather than instructing manual invocation." Both assume Claude Code auto-loads from frontmatter, which it doesn't. The builder executed the spec correctly — the spec was wrong. Future re-planning should correct the assertion to match the actual pattern: frontmatter declares + body invokes.
- **Code — Type widening not guarded:** `packages/cli/src/commands/init/anaJsonSchema.ts:57` — `AnaJson` type now includes `& { [k: string]: unknown }` from `.passthrough()`. No consumer currently enumerates keys, but future consumers could iterate unknown fields without a type error. Monitor for property enumeration in future consumers.
- **Test — A006-A009 have no `@ana` tags:** The builder did not create tagged tests for the verify template assertions (A006-A009). These were verified by source inspection and the pre-existing dogfood sync test. Not a blocker — the assertions are about static file content, and the dogfood sync test covers A008 mechanically. But untagged assertions weaken the proof chain's automated traceability.
- **Code — Unspecified file change was correct:** `packages/cli/tests/utils/git-operations.test.ts:292` — Builder modified a test not listed in the contract's `file_changes`. The change was necessary (flipped a strip assertion to match passthrough behavior) and correct. Scope creep in the positive direction.
- **Upstream — No passthrough size guard:** Passthrough has no limit on the number or size of unknown keys. A corrupted ana.json could grow across re-init cycles. Low risk for a local CLI config file, but worth scoping if `config set` (Phase 2) introduces automated writes to unknown keys.

## Deployer Handoff

Do not merge. Step 7 of the verify agent template removes working explicit skill invocation and replaces it with a false auto-loading claim. The schema passthrough change (Change 1) is clean and ready, but the template change (Change 2) needs a fix before shipping.

The fix is small: restore explicit invocation in step 7 body text (both template and dogfood copy) while keeping the new frontmatter `skills:` declaration. Match the pattern from ana-build and ana-plan.

## Verdict
**Shippable:** NO

Schema passthrough (A001-A005) is solid — clean implementation, good tests, correct doc comment update. The verify template's frontmatter declaration (A006-A008) is also correct. But A009/AC4 fails: step 7 removes explicit skill invocation based on the false premise that Claude Code auto-loads skills from frontmatter. This would silently degrade verification quality on fresh projects. The fix is a 3-line change to step 7 body text in both template and dogfood copy.