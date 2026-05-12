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
| A009 | Verify template tells the agent that skills are auto-loaded | ✅ SATISFIED | Source inspection: `packages/cli/templates/.claude/agents/ana-verify.md:139` — "auto-loaded via frontmatter" |

9/9 assertions SATISFIED.

## Independent Findings

**Prediction resolution:**
- **P1 (doc comment incomplete):** Not confirmed. Builder rewrote lines 6-23 thoroughly — describes passthrough, explains why, mentions data-loss footgun. Clean.
- **P2 (template sync missed):** Not confirmed. Both files byte-identical per `diff`.
- **P3 (step 7 remnants):** Not confirmed. Clean single-sentence replacement at line 139. No remnant `/testing-standards` or `/coding-standards` invocation language.
- **P4 (shallow tests):** Partially confirmed — see test finding below.
- **P5 (type widening consumers):** Not investigated in depth — no consumer code was changed. Noted as risk finding.

**Production risks:**
- No consumer currently iterates `Object.keys()` on parsed ana.json (spec notes this was verified). But the type signature on `AnaJson` now permits arbitrary keys, and future consumers won't see a type error if they enumerate. This is dormant risk, not a blocker.
- No size/key-count guard on passthrough — a corrupted or malicious ana.json could accumulate unbounded unknown keys across re-inits. Low probability for a CLI config file, but worth noting.

**Surprise finding:** Builder also modified `packages/cli/tests/utils/git-operations.test.ts:289-300` — flipped a strip assertion to a preservation assertion. This file isn't listed in the contract's `file_changes` but the fix is correct and necessary (the test would have failed otherwise). Good initiative.

## AC Walkthrough

- **AC1:** Unknown top-level keys survive `ana init` re-init. ✅ PASS — Test at `anaJsonSchema.test.ts:57-78` verifies `scanStaleDays: 7` survives parse. Schema uses `.passthrough()` at line 55.
- **AC2:** `.catch()` defaults still fire for invalid known fields with passthrough active. ✅ PASS — Test at `anaJsonSchema.test.ts:111-119` verifies `setupPhase: 'invalid-value'` defaults to undefined while unknown keys survive.
- **AC3:** `ana-verify` agent template declares `skills: [testing-standards, coding-standards]` in frontmatter. ✅ PASS — Read `packages/cli/templates/.claude/agents/ana-verify.md:5`.
- **AC4:** Verify template body text reflects that skills are auto-loaded, not manually invoked. ✅ PASS — Read line 139: "auto-loaded via frontmatter — they are available as reference material without manual invocation."
- **AC5:** Dogfood verify agent is byte-identical to template. ✅ PASS — `diff` returned empty.
- **AC6:** `ana agents` dashboard shows 2 skills for verify. ✅ PASS — Live invocation: `ana-verify  38,199 chars  2 skills`.
- **AC16:** No existing tests break. Test count increases. ✅ PASS — 2109 passed (was 2107), 0 failures.
- **Tests pass:** ✅ PASS — `(cd packages/cli && pnpm vitest run)`: 2109 passed, 2 skipped.
- **No build errors:** ✅ PASS — `pnpm run build`: 2 tasks successful.

9/9 ACs pass.

## Blockers

No blockers. All 9 contract assertions satisfied. All 9 acceptance criteria pass. Tests pass, build succeeds, lint clean (0 errors). Checked for: unused exports in new code (none — no new exports added), unused parameters (no new functions added), error paths without tests (no new error paths), external assumptions (passthrough doesn't assume external state), spec gaps (spec covered both changes completely).

## Findings

- **Code — Type widening not guarded:** `packages/cli/src/commands/init/anaJsonSchema.ts:57` — `AnaJson` type now includes `& { [k: string]: unknown }` from `.passthrough()`. No consumer currently enumerates keys, but future consumers could iterate unknown fields without a type error. Monitor for property enumeration in future consumers.
- **Test — A006-A009 have no `@ana` tags:** The builder did not create tagged tests for the verify template assertions (A006-A009). These were verified by source inspection and the pre-existing dogfood sync test. Not a blocker — the assertions are about static file content, and the dogfood sync test covers A008 mechanically. But untagged assertions weaken the proof chain's automated traceability.
- **Code — Unspecified file change was correct:** `packages/cli/tests/utils/git-operations.test.ts:292` — Builder modified a test not listed in the contract's `file_changes`. The change was necessary (flipped a strip assertion to match passthrough behavior) and correct. This is scope creep in the positive direction — better than leaving a broken test.
- **Upstream — No passthrough size guard:** Passthrough has no limit on the number or size of unknown keys. A corrupted ana.json could grow across re-init cycles. Low risk for a local CLI config file, but worth scoping if `config set` (Phase 2) introduces automated writes to unknown keys.

## Deployer Handoff

Minimal-risk change. Two independent improvements:

1. **Schema passthrough:** `.strip()` → `.passthrough()` on `AnaJsonSchema`. Unknown top-level keys in ana.json now survive `ana init` re-runs. This unblocks Phase 2's `config set` command, which writes custom keys. No consumer code changed — all consumers access named fields only.

2. **Verify agent skills:** Added `skills: [testing-standards, coding-standards]` to verify agent frontmatter and updated step 7 text. Both template and dogfood copy are byte-identical. `ana agents` dashboard now shows 2 skills for verify.

Test count increased from 2107 to 2109. No regressions. The builder also correctly fixed a strip-assertion test in `git-operations.test.ts` that would have failed after the schema change.

## Verdict
**Shippable:** YES

Clean, minimal build. Both changes are exactly what the spec described — no over-building, no missing pieces. The 2 new tests and 4 modified tests (3 in anaJsonSchema.test.ts, 1 in git-operations.test.ts) adequately cover the behavioral change. All contract assertions satisfied, all ACs pass, all tests green.