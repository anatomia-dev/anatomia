# Scope: Test Suite Hygiene

**Created by:** Ana
**Date:** 2026-05-07

## Intent

Clean the edges of a fundamentally sound 2000+ test suite. Over 64 pipeline runs, tests have accumulated that don't test behavior: source-reading tests that grep `.ts` files for strings, archaeological tests verifying deleted code stays deleted, mislabeled tests whose names contradict their assertions, weak assertions using `toBeDefined()` on deterministic fields, and dead test helper exports. The suite passes — but passing means less when some tests assert nothing meaningful. This is a hygiene pass, not a rewrite.

## Complexity Assessment

- **Size:** small-medium
- **Files affected:** 10 files across `packages/cli/tests/`
  - `tests/commands/work.test.ts`
  - `tests/commands/proof.test.ts`
  - `tests/commands/artifact.test.ts`
  - `tests/commands/verify.test.ts`
  - `tests/utils/proofSummary.test.ts`
  - `tests/e2e/init-flow.test.ts`
  - `tests/cleanup/old-system-removed.test.ts` (DELETE)
  - `tests/engine/fixtures.ts`
  - `tests/performance/benchmarks.test.ts`
  - `tests/engine/performance/parsing-performance.test.ts`
- **Blast radius:** Tests only — zero production code changes. The risk is accidentally removing a test that covered a real behavior, but the requirements doc explicitly traces every removal.
- **Estimated effort:** 2-3 hours Build, 1 hour Verify
- **Multi-phase:** no

## Approach

Systematic cleanup in eight categories, each with a clear rule:

1. **Source-reading tests** — remove tests that `readFileSync` production code and grep for strings when the behavior can be tested by exercising the code. Import-boundary tests (proofSummary:1407, verify:268) are exempt with comments.
2. **Archaeological tests** — delete `old-system-removed.test.ts` entirely and remove `verify.test.ts:334`. These verify deleted code stays deleted; code review catches resurrections.
3. **Mislabeled tests** — rename 3 tests in work.test.ts and 2 in proofSummary.test.ts so names match assertions.
4. **Weak assertions** — replace `toBeDefined()` with type-specific or value-specific assertions where the test setup produces deterministic values. Keep legitimate guard assertions.
5. **E2E gaps** — add missing agent file (ana-learn.md) and skill directories (ai-patterns, api-patterns, data-access) to init-flow assertions. Update stale comments.
6. **Dead code** — remove `loadFixture()` export, unexport `isWasmAvailable()` in fixtures.ts.
7. **Console noise** — remove console.log/warn from 3 test files.
8. **Exemption comments** — add explicit comments to the two kept source-reading tests explaining why they're exempt.

The guiding principle: every removed test is archaeological, redundant, or testing source structure rather than behavior. Zero behavioral coverage lost.

## Acceptance Criteria

- AC1: Zero source-reading tests that grep production code for behavior testable by exercising the code. Import-boundary tests at `proofSummary.test.ts:1407` and `verify.test.ts:268` are exempt with exemption comments.
- AC2: Zero archaeological tests. `tests/cleanup/old-system-removed.test.ts` deleted entirely. `verify.test.ts:334` removed.
- AC3: Every test name accurately describes what the test asserts. The 3 mislabeled tests in `work.test.ts` and 2 stale names in `proofSummary.test.ts` are corrected.
- AC4: No `toBeDefined()` as the sole assertion on a field whose type is deterministic. Guard assertions before stronger checks are acceptable.
- AC5: E2E init test asserts all 6 agent files and all 8 skill directories shipped in `packages/cli/templates/`.
- AC6: Zero dead exports in test helpers. `loadFixture()` removed, `isWasmAvailable()` unexported.
- AC7: Zero `console.log`/`console.warn` in tests outside explicitly labeled performance benchmarks.
- AC8: All tests pass (`pnpm test --run` green). Test count decreases by ~23. Zero behavioral coverage lost.
- AC9: Every removed test is traced: archaeological, redundant, or source-structure-not-behavior.

## Edge Cases & Risks

1. **Template placeholder tests (work.test.ts 502-527):** These read template files, not production source. Converting to behavioral tests means calling `init` in a tempdir (slow). The requirements doc defers this to implementer judgment — keep with comment, convert, or extract to `templates.test.ts`.

2. **work.test.ts line 1695 "shows maintenance line":** Name says "shows" but assertion says `not.toContain('Maintenance:')`. Before renaming, verify actual product behavior. If the label was intentionally removed, rename the test. If the label should be present, the assertion is the bug.

3. **work.test.ts line 2676 retry command source test:** Behavioral alternative requires triggering a git commit failure deterministically. If failure injection is too complex, keep as source-reading with a `// NOTE: source-reading — behavioral alternative requires failure injection` comment.

4. **Exact-count vs toBeGreaterThan(0):** Changing `toBeGreaterThan(0)` to `toHaveLength(n)` couples tests to fixture setup. This is usually desirable — you want to know when fixtures change — but increases maintenance. Recommendation: use exact counts.

5. **old-system-removed.test.ts has 1 potentially useful test** (cross-platform.test.ts existence). Evaluate whether this provides value beyond what e2e coverage already provides. If so, move it; if not, drop it.

## Rejected Approaches

- **Rewrite source-reading tests as behavioral tests for all cases.** Some source-reading tests (import boundaries, template placeholders) serve a legitimate purpose that has no behavioral surface. Forced behavioral rewrites would be more complex and less clear. Exemptions with comments are more honest.
- **Split large test files while cleaning.** The 4 files over 2900 lines are structural debt, but splitting while also modifying assertions mixes two concerns. Separate scope.
- **Fix duplicate test names in proof.test.ts.** Not wrong, just ambiguous in flat logs. Deferred to a file-splitting scope.

## Open Questions

1. **work.test.ts line 1695:** Does the product code currently emit a "Maintenance:" label for auto-closed findings? This determines whether the test name or the assertion is wrong. AnaPlan should verify before Plan writes the contract assertion.
2. **Template placeholder tests:** Keep-with-comment vs behavioral conversion vs extract to `templates.test.ts`. AnaPlan decides based on test runtime and coupling tradeoffs.
3. **Retry command source test (line 2676):** Convert to behavioral (requires failure injection) or keep as source-reading with exemption comment. AnaPlan decides based on complexity.

## Exploration Findings

### Patterns Discovered
- Requirements doc verified by 3 independent agents with convergence on all critical findings
- `strengthen-weak-test-assertions` (completed plan) is a structural analog — same shape of work, same files

### Constraints Discovered
- [TYPE-VERIFIED] old-system-removed.test.ts exists at `tests/cleanup/` (109 lines, 21 tests) — original investigation agent incorrectly claimed it was deleted
- [TYPE-VERIFIED] verify.test.ts has 2 source-reading tests: line 268 (import boundary, keep) and line 334 (archaeological, remove)
- [TYPE-VERIFIED] loadFixture() in fixtures.ts is exported but never imported by any test file
- [OBSERVED] isWasmAvailable() only consumed internally by skipIfNoWasm() — export is unnecessary

### Test Infrastructure
- `fixtures.ts`: exports `skipIfNoWasm()` (used by 13 files), `loadFixture()` (dead), `isWasmAvailable()` (internal-only)
- Test count ~2000+ with CI running on 3 OS × 2 Node versions
- Coverage thresholds enforced in vitest.config.ts

## For AnaPlan

### Structural Analog
`strengthen-weak-test-assertions` in `.ana/plans/completed/` — same shape (assertion cleanup across the same test files). Check what it touched to avoid re-treading and to reuse patterns.

### Relevant Code Paths
- `packages/cli/tests/commands/work.test.ts` — source-reading tests (502-530, 2071, 2676), mislabeled tests (829, 1695, 1723), weak assertions (2093-2360)
- `packages/cli/tests/commands/proof.test.ts` — weak assertions throughout (249-261, 531-538, 604-607, 746-778, 1150-1156, 1502-1505)
- `packages/cli/tests/commands/artifact.test.ts` — 1 archaeological test (1281), 1 weak assertion (1253)
- `packages/cli/tests/commands/verify.test.ts` — 1 archaeological test (334), 1 kept source-reading test (268)
- `packages/cli/tests/utils/proofSummary.test.ts` — 2 stale names (639, 649), weak assertions (1312, 1344, 1387, 1402, 1425-1537), 1 kept source-reading test (1407)
- `packages/cli/tests/e2e/init-flow.test.ts` — missing agent/skill assertions (117-141), stale comments (7, 113, 131)
- `packages/cli/tests/cleanup/old-system-removed.test.ts` — DELETE ENTIRE FILE
- `packages/cli/tests/engine/fixtures.ts` — dead loadFixture() (~line 41), unnecessarily exported isWasmAvailable()

### Patterns to Follow
- The requirements doc (`anatomia_reference/v1_Release/TEST_HYGIENE_REQUIREMENTS.md`) IS the investigation. Every line number, every test name, every assertion — verified by 3 agents. Use it as the implementation checklist.
- Keep guard assertions that precede stronger checks (e.g., artifact.test.ts 1251, 1275)
- Exemption comment pattern for kept source-reading tests: explain WHY the test reads source (architectural constraint, no behavioral surface)

### Known Gotchas
- Line numbers in the requirements doc are from a specific point in time. If `strengthen-weak-test-assertions` or other completed work shifted line numbers, Plan must re-verify locations by test name, not line number.
- The `tests/cleanup/` directory may become empty after deleting `old-system-removed.test.ts` — delete the directory too if so.
- `init-flow.test.ts` assertions about agent/skill counts must match what's actually in `packages/cli/templates/` at build time, not what the requirements doc says. Verify template contents.

### Things to Investigate
- **Line 1695 behavior:** Read the production code path for auto-closed findings display to determine if "Maintenance:" was intentionally removed. This determines the fix (rename test vs fix assertion).
- **Template placeholder test strategy:** Evaluate runtime cost of behavioral conversion vs value of keeping source-reading. Decide once for all 4 template tests.
- **Retry command test (2676):** Assess feasibility of failure injection in the test harness before committing to behavioral conversion.
