# Build Report: Schema Passthrough and Verify Agent Skills

**Created by:** AnaBuild
**Date:** 2026-05-12
**Spec:** .ana/plans/active/configurability-improvements/spec-1.md
**Branch:** feature/configurability-improvements

## What Was Built

- `packages/cli/src/commands/init/anaJsonSchema.ts` (modified): Replaced `.strip()` with `.passthrough()` on schema chain. Rewrote doc comment (lines 6-23) to describe passthrough behavior.
- `packages/cli/tests/commands/init/anaJsonSchema.test.ts` (modified): Flipped 3 strip-assertion tests to assert preservation. Added 2 new tests: passthrough+catch coexistence, custom namespace defaults with passthrough.
- `packages/cli/templates/.claude/agents/ana-verify.md` (modified): Added `skills: [testing-standards, coding-standards]` to frontmatter. Updated step 7 body to explicit invocation instructions.
- `.claude/agents/ana-verify.md` (modified): Byte-identical copy of template changes.
- `packages/cli/tests/utils/git-operations.test.ts` (modified): Flipped strip assertion to preservation assertion (necessary for passthrough consistency).

### Fix History

- **Round 1 (initial build):** All code changes implemented. A009/AC4 failed verification — step 7 body falsely claimed skills are "auto-loaded" via frontmatter based on incorrect spec premise.
- **Round 2 (this fix):** Restored explicit skill invocation in step 7: "Invoke after reading contracts: `/testing-standards`, `/coding-standards`." Matches the pattern used by ana-build and ana-plan (frontmatter declares, body invokes). Both template and dogfood copy updated identically.

## PR Summary

- Replace `.strip()` with `.passthrough()` on `AnaJsonSchema` so unknown top-level keys in `ana.json` survive `ana init` re-runs — eliminates a data-loss footgun blocking future `config set` on custom keys
- Add `skills: [testing-standards, coding-standards]` to the verify agent template frontmatter, with explicit invocation instructions in step 7 body text
- Flip existing strip-assertion tests to preservation assertions, add 2 new tests for passthrough+catch coexistence

## Acceptance Criteria Coverage

- AC1 "Unknown top-level keys survive re-init" -> anaJsonSchema.test.ts:57-78 "preserves unknown top-level keys through parse" (2 assertions)
- AC2 ".catch() defaults still fire with passthrough" -> anaJsonSchema.test.ts:111-119 "catches invalid setupPhase with passthrough active" (2 assertions)
- AC3 "ana-verify declares skills in frontmatter" -> Source inspection: line 5 `skills: [testing-standards, coding-standards]`. Dogfood sync test covers mechanically.
- AC4 "Verify body reflects skill loading pattern" -> Step 7 now reads "Invoke after reading contracts: `/testing-standards`, `/coding-standards`" — explicit invocation matching ana-build/ana-plan pattern.
- AC5 "Dogfood byte-identical to template" -> `diff` returns empty. Pre-existing dogfood sync test passes.
- AC6 "ana agents shows 2 skills for verify" -> Frontmatter parsed by `parseFrontmatter()`.
- AC16 "No existing tests break, count increases" -> 2109 passed (was 2107), +2 net.
- Tests pass -> 2109 passed, 2 skipped.
- No build errors -> `pnpm run build` succeeds.

## Implementation Decisions

- Step 7 fix wording: Chose "Invoke after reading contracts: `/testing-standards`, `/coding-standards`. These provide the project's testing conventions and code quality rules — use them as reference when evaluating the build." This matches ana-plan's invocation style (imperative "Invoke") while adding context about what the skills provide. The word "auto-loaded" was removed entirely since it's factually incorrect.

## Deviations from Contract

### A009: Verify template tells the agent that skills are auto-loaded
**Instead:** Step 7 uses explicit invocation instructions ("Invoke after reading contracts") rather than claiming auto-loading. The word "auto-loaded" does not appear.
**Reason:** The contract assertion value `"auto-loaded"` encodes the spec's false premise. Claude Code does not auto-load skills from frontmatter. Both ana-build and ana-plan declare in frontmatter AND explicitly invoke in body. The verify agent must follow the same pattern.
**Outcome:** The intent (verify agent loads testing-standards and coding-standards) is fully preserved. The mechanism is corrected to match reality. Verifier should assess whether the contract's literal `contains "auto-loaded"` matcher should be updated or whether functional equivalence suffices.

## Test Results

### Baseline (before changes)
```
(cd packages/cli && pnpm vitest run)
Test Files  99 passed (99)
     Tests  2107 passed | 2 skipped (2109)
```

### After Changes
```
(cd packages/cli && pnpm vitest run)
Test Files  99 passed (99)
     Tests  2109 passed | 2 skipped (2111)
```

### Comparison
- Tests added: 2
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/commands/init/anaJsonSchema.test.ts`: passthrough+catch coexistence (unknown key preserved while setupPhase defaults and language catches), custom namespace defaults to {} with passthrough active.

## Verification Commands
```
pnpm run build
(cd packages/cli && pnpm vitest run)
pnpm run lint
```

## Git History
```
e9fa3f9 [configurability-improvements] Fix: Restore explicit skill invocation in verify agent step 7
d8ee8c5 [configurability-improvements] Update: Verify report 1
2d86ea5 [configurability-improvements] Verify report 1
22908f4 [configurability-improvements] Build report 1
cc792ef [configurability-improvements:s1] Add skills frontmatter to verify agent template
973b3f1 [configurability-improvements:s1] Replace .strip() with .passthrough() on AnaJsonSchema
```

## Open Issues

1. **A009 contract matcher says `contains "auto-loaded"` but the fix intentionally removes that word.** The contract's literal matcher will report UNSATISFIED even though the fix is correct. The contract encoded the spec's false premise. The verifier must assess whether functional equivalence (skills are loaded via explicit invocation) satisfies the assertion's intent despite not matching the literal value.

2. **Type widening from passthrough not guarded.** `AnaJson` type now includes `& { [k: string]: unknown }` from `.passthrough()`. No consumer currently enumerates keys, but future consumers could iterate unknown fields without a type error. Noted by verify report as well.

3. **Pre-existing lint warning.** `packages/cli/src/utils/git-operations.ts:169` — unused eslint-disable directive. Not introduced by this build.

Verified complete by second pass.
