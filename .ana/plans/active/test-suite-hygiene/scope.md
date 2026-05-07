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
- **Blast radius:** Tests only — zero production code changes. The risk is accidentally removing a test that covered a real behavior, but every removal is traced below.
- **Estimated effort:** 2-3 hours Build, 1 hour Verify
- **Multi-phase:** no

## Approach

Systematic cleanup in eight categories, each with a clear rule:

1. **Source-reading tests** — remove tests that `readFileSync` production source and grep for strings. Template-reading tests (502-527) stay — templates are shipped artifacts. Import-boundary tests (proofSummary:1407, verify:268) stay with exemption comments.
2. **Archaeological tests** — delete `old-system-removed.test.ts` entirely and remove `verify.test.ts:334`. These verify deleted code stays deleted; code review catches resurrections.
3. **Mislabeled tests** — rename 3 tests in work.test.ts and 2 in proofSummary.test.ts so names match assertions.
4. **Weak assertions** — replace `toBeDefined()` with type-specific or value-specific assertions where the test setup produces deterministic values. Keep legitimate guard assertions.
5. **E2E gaps** — add missing agent file (ana-learn.md) and skill directories (ai-patterns, api-patterns, data-access) to init-flow assertions. Update stale comments.
6. **Dead code** — remove `loadFixture()` export, unexport `isWasmAvailable()` in fixtures.ts.
7. **Console noise** — remove console.log/warn from 3 test files.
8. **Exemption comments** — add explicit comments to the two kept source-reading tests explaining why they're exempt.

The guiding principle: every removed test is archaeological, redundant, or testing source structure rather than behavior. Zero behavioral coverage lost.

## Acceptance Criteria

- AC1: Zero source-reading tests that grep production source for behavior testable by exercising the code. Import-boundary tests at `proofSummary.test.ts:1407` and `verify.test.ts:268` are exempt with exemption comments. Template-reading tests (work.test.ts 502-527) are exempt — templates are shipped artifacts.
- AC2: Zero archaeological tests. `tests/cleanup/old-system-removed.test.ts` deleted entirely (and `tests/cleanup/` directory if empty). `verify.test.ts:334` removed.
- AC3: Every test name accurately describes what the test asserts. The 3 mislabeled tests in `work.test.ts` and 2 stale names in `proofSummary.test.ts` are corrected.
- AC4: No `toBeDefined()` as the sole assertion on a field whose type is deterministic. Guard assertions before stronger checks are acceptable.
- AC5: E2E init test asserts all 6 agent files and all 8 skill directories shipped in `packages/cli/templates/`.
- AC6: Zero dead exports in test helpers. `loadFixture()` removed, `isWasmAvailable()` unexported.
- AC7: Zero `console.log`/`console.warn` in tests outside explicitly labeled performance benchmarks.
- AC8: All tests pass (`pnpm test --run` green). Test count decreases by ~23. Zero behavioral coverage lost.
- AC9: Every removed test is traced: archaeological, redundant, or source-structure-not-behavior.

## Full Change Inventory

This inventory is the implementation checklist. Every item has a disposition. Line numbers are approximate — locate by test name.

### Category 1: Source-Reading Tests

#### `packages/cli/tests/commands/work.test.ts`

| ~Line | Test Name | Disposition |
|-------|-----------|-------------|
| 502 | `ana-build template uses branchPrefix placeholder` | **KEEP.** Reads template file (shipped artifact), not production source. Add comment: `// Reads template file — templates are shipped artifacts, not implementation details` |
| 511 | `ana-plan template uses branchPrefix placeholder` | **KEEP.** Same rationale as 502. Add same comment. |
| 520 | `ana-verify template uses branchPrefix placeholder` | **KEEP.** Same rationale. Add same comment. |
| 530 | `injectGitWorkflow uses branchPrefix placeholder` | **REMOVE.** Reads `src/commands/init/skills.ts` — production source. The template tests above already verify `{branchPrefix}` is present in the templates that `injectGitWorkflow` processes. This test is redundant with those. |
| 2071 | `completeCommand registers --json option` | **REMOVE.** Reads `src/commands/work.ts` and greps for `option('--json'`. Already covered by behavioral test at ~line 2079 which actually calls `completeWork` with `{ json: true }` and verifies JSON output. Redundant. |
| 2676 | `commit failure error includes retry command` | **KEEP with exemption comment.** Reads `src/commands/work.ts` to verify retry guidance strings. Behavioral alternative requires mocking `execSync` to throw during git commit — doable but adds significant test complexity for a string presence check. Add comment: `// NOTE: source-reading test — behavioral alternative requires commit failure injection` |

#### `packages/cli/tests/commands/artifact.test.ts`

| ~Line | Test Name | Disposition |
|-------|-----------|-------------|
| 1281 | `step 9a post-commit fixup no longer exists in source` | **REMOVE.** Archaeological — verifies deleted code stays deleted. |

#### `packages/cli/tests/utils/proofSummary.test.ts`

| ~Line | Test Name | Disposition |
|-------|-----------|-------------|
| 1407 | `getProofContext has no CLI dependencies` | **KEEP with exemption comment.** Reads source to assert no `chalk`/`commander` imports. This is architectural constraint enforcement — no behavioral surface exists. Add comment: `// Source-reading exemption: enforces import boundary — no behavioral surface for this constraint` |

#### `packages/cli/tests/commands/verify.test.ts`

| ~Line | Test Name | Disposition |
|-------|-----------|-------------|
| 268 | `does not import execSync, glob, readArtifactBranch, yaml, or ContractSchema` | **KEEP with exemption comment.** Same class as proofSummary:1407 — import boundary enforcement. Add same exemption comment pattern. |

**Net: remove 3 source-reading tests, keep 6 with comments (3 template, 2 import-boundary, 1 retry).**

### Category 2: Archaeological Tests (REMOVE)

#### `packages/cli/tests/cleanup/old-system-removed.test.ts` — DELETE ENTIRE FILE

109 lines, ~21 tests. Asserts deleted source files, template files, test files, and removed dependencies stay absent. Examples:
- 3 tests asserting source files don't exist
- 10 tests (`it.each`) asserting template files don't exist
- 5 tests asserting test files don't exist
- 2 tests reading package.json checking handlebars/inquirer aren't dependencies
- 1 test checking cross-platform.test.ts existence — drop (covered by e2e)

Delete the `tests/cleanup/` directory if empty after removal.

#### `packages/cli/tests/commands/verify.test.ts` ~line 334

```
it('tag coverage tests are removed — parseDiffAddedCommentLines is not exported', ...)
```

Reads `verify.ts` source to assert a deleted function isn't exported. Remove.

**Net: remove ~22 archaeological tests.**

### Category 3: Mislabeled Tests

#### `packages/cli/tests/commands/work.test.ts`

| ~Line | Current Name | New Name | Rationale |
|-------|-------------|----------|-----------|
| 829 | `allows completion with UNKNOWN result` | `allows completion with PASS result` | Test runs a normal PASS completion. Never triggers UNKNOWN. Remove the misleading UNKNOWN comments. Alternatively remove entirely — PASS path already tested at ~line 814. |
| 1695 | `shows maintenance line when findings were auto-closed` | `does not show Maintenance label for auto-closed findings` | **Resolved:** `Maintenance:` does not appear anywhere in `work.ts` production code. The label was intentionally removed/never existed. The assertion (`not.toContain('Maintenance:')`) is correct — the name is stale. Rename. |
| 1723 | `warns on UNKNOWN result with verify report present in completed dir` | `writes PASS result to proof chain` | Test runs a normal PASS completion, asserts `chain.entries[last].result === 'PASS'`. Never triggers UNKNOWN, never checks for a warning. Alternatively remove as redundant — PASS path is well-covered. |

#### `packages/cli/tests/utils/proofSummary.test.ts`

| ~Line | Current Name | New Name |
|-------|-------------|----------|
| 639 | `returns empty array when no Callouts section in verify report` | `returns empty array when no Findings section in verify report` |
| 649 | `returns empty array when Callouts section in verify report has no parseable entries` | `returns empty array when Findings section has no parseable entries` |

**Net: 5 renames.**

### Category 4: Weak Assertions

Replace `toBeDefined()` with specific assertions where the field value is deterministic. Keep guard assertions that precede stronger checks.

#### `packages/cli/tests/commands/work.test.ts`

| ~Line | Current | Replacement |
|-------|---------|-------------|
| 2093 | `json.timestamp.toBeDefined()` | `toMatch(/^\d{4}-\d{2}-\d{2}/)` |
| 2094 | `json.results.toBeDefined()` | `toBeTypeOf('object')` |
| 2095 | `json.meta.toBeDefined()` | `toBeTypeOf('object')` |
| 2113 | `json.results.feature.toBeDefined()` | `toBe('json-test')` or `toBeTypeOf('string')` — slug's feature field |
| 2116-2120 | `contract.satisfied.toBeDefined()`, `contract.total.toBeDefined()`, `contract.pass_rate.toBeDefined()`, `contract.unverified.toBeDefined()` | All → `toBeTypeOf('number')` (lines 2121/2123 already do this for `new_findings`/`rejection_cycles`, making the pattern inconsistent) |
| 2122 | `contract.rejection_cycles.toBeDefined()` | Already typed at 2123 — **remove redundant guard** |
| 2158-2159 | `json.meta.findings.by_severity.toBeDefined()`, `by_action.toBeDefined()` | `toBeTypeOf('object')` or assert known keys |
| 2238-2239 | Same pattern — `meta.toBeDefined()`, `by_severity.toBeDefined()` | Same fix |
| 2356-2360 | `quality.toBeDefined()`, `quality.changed.toBeDefined()`, `quality.trajectory.toBeDefined()`, `quality.triggers.toBeDefined()` | `changed` → `toBeTypeOf('boolean')` (2358 already does this — 2357 is redundant guard, remove). `trajectory` → `toBeTypeOf('string')`. `triggers` → line 2361 already checks `Array.isArray`, so 2360 is redundant guard, remove. |

#### `packages/cli/tests/commands/proof.test.ts`

| ~Line | Current | Replacement |
|-------|---------|-------------|
| 249 | `json.toBeTruthy()` | **Remove** — next line does `json.command.toBe('proof')` which throws if json is falsy |
| 252-254 | `timestamp.toBeDefined()`, `results.toBeDefined()`, `meta.toBeDefined()` | `timestamp` → `toMatch(/^\d{4}/)`. Others → `toBeTypeOf('object')`. |
| 256 | `results.entries.toBeDefined()` | **Remove** — line 257 does `Array.isArray`, line 258 does `toHaveLength(2)` |
| 260-261 | `chain_runs.toBeDefined()`, `findings.toBeDefined()` | `chain_runs` → `toBeTypeOf('number')`. `findings` → `toBeTypeOf('object')`. |
| 531-533 | Same envelope pattern | Same fix |
| 535-538 | `results.results.toBeDefined()`, `findings.toBeDefined()`, `build_concerns.toBeDefined()` | Remove guards that precede `length` checks. Line 537 does `toBeGreaterThan(0)` which covers 536. |
| 604-607 | Same envelope pattern | Same fix |
| 746-749 | `parsed.toBeTruthy()`, `command.toBeDefined()`, `results.toBeDefined()`, `meta.toBeDefined()` | Remove `toBeTruthy` guard. Others → `toBeTypeOf`. |
| 758, 768, 778 | `slug.toBeDefined()`, `assertions.toBeDefined()`, `timing.toBeDefined()` | `slug` → `toBe(expectedSlug)`. Others → `toBeTypeOf('object')` or assert specific keys. |
| 1150, 1155-1156 | Same envelope pattern | Same fix |
| 1502-1505 | `by_file.toBeDefined()`, `anchor_present.toBeDefined()`, `chain_runs.toBeDefined()` | Same fix |

#### `packages/cli/tests/commands/artifact.test.ts`

| ~Line | Current | Replacement |
|-------|---------|-------------|
| 1251 | `saves['pre-check'].toBeDefined()` | **KEEP** — guard before real assertions at 1252-1258 |
| 1253 | `seal_hash.toBeDefined()` | `toMatch(/^sha256:[a-f0-9]{64}$/)` |
| 1275 | `saves.scope.toBeDefined()` | **KEEP** — guard before 1276-1277 |

#### `packages/cli/tests/utils/proofSummary.test.ts`

| ~Line | Current | Replacement |
|-------|---------|-------------|
| 1312 | `findings.length.toBeGreaterThan(0)` | `toHaveLength(1)` — setup creates exactly 1 finding |
| 1344 | `build_concerns.length.toBeGreaterThan(0)` | `toHaveLength(n)` matching `baseEntry.build_concerns` count |
| 1387 | `touch_count.toBeGreaterThan(0)` | `toBe(expectedCount)` based on chain setup |
| 1402 | `last_touched.toBeDefined()` | **Remove** — followed by `toBe('2026-04-24T10:00:00Z')` at line 1403 which catches undefined |
| 1425, 1499, 1512, 1525, 1537 | `findings.length.toBeGreaterThan(0)` | Assert exact length based on fixture setup |

### Category 5: E2E Test Gaps

#### `packages/cli/tests/e2e/init-flow.test.ts`

| ~Line | Issue | Fix |
|-------|-------|-----|
| 7 | Comment says "9 files" for agents, "6 dirs" for skills | Update to "6 files" and "8 dirs" |
| 113 | Comment says "9 agent files" | Update to "6 agent files" |
| 117-129 | `agentFiles` array checks 5 files, missing `ana-learn.md` | Add `ana-learn.md` |
| 131 | Comment says "6 skill directories" | Update to "8 skill directories" |
| 135-141 | `skillDirs` array checks 5 dirs, missing `ai-patterns`, `api-patterns`, `data-access` | Add all 3 |

**Important:** Verify actual template contents at build time. The counts above come from investigation — confirm against `packages/cli/templates/` before committing.

### Category 6: Dead Code in Test Helpers

#### `packages/cli/tests/engine/fixtures.ts`

| ~Line | Item | Fix |
|-------|------|-----|
| 41 | `loadFixture()` — exported, never imported by any test file | Remove the function and its export |
| ~20 | `isWasmAvailable()` — exported but only consumed internally by `skipIfNoWasm()` | Remove `export` keyword (keep function) |

### Category 7: Console Noise

| File | ~Line | Issue | Fix |
|------|-------|-------|-----|
| `tests/performance/benchmarks.test.ts` | 39 | `console.log` for timing | Remove — the `expect` captures the result |
| `tests/engine/performance/parsing-performance.test.ts` | 31 | `console.log` skip message | Remove — `describe.skipIf` already handles this |
| `tests/engine/fixtures.ts` | 33 | `console.warn` for WASM unavailable | Remove — the skip mechanism communicates this |

### Category 8: Exemption Comments

Add to these kept source-reading tests:

| File | ~Line | Comment to Add |
|------|-------|----------------|
| `proofSummary.test.ts` | 1407 | `// Source-reading exemption: enforces import boundary (no chalk/commander in proof utils) — no behavioral surface for this constraint` |
| `verify.test.ts` | 268 | `// Source-reading exemption: enforces import boundary (no execSync/glob/yaml in verify) — no behavioral surface for this constraint` |

## What Does NOT Change

| Test | Why It Stays |
|------|-------------|
| `work.test.ts` 502-527: template `{branchPrefix}` placeholder tests | Read template files (shipped artifacts), not production source. Keep with descriptive comment. |
| `work.test.ts` 2676: retry command source test | Behavioral alternative requires commit failure injection. Keep with exemption comment. |
| `proofSummary.test.ts` 1407: `getProofContext has no CLI dependencies` | Architectural constraint enforcement via import check. No behavioral surface. Keep with exemption comment. |
| `verify.test.ts` 268: `does not import execSync, glob...` | Same class — import boundary. Keep with exemption comment. |
| `work.test.ts` 1164/1180: `entry.worktree.toBeDefined()` | Legitimate guard before `.used`, `.created_at`, etc. |
| `artifact.test.ts` 1251/1275: `saves['pre-check'].toBeDefined()`, `saves.scope.toBeDefined()` | Legitimate guards before deeper property assertions. |
| `work.test.ts` 3209/3231/3246/3261: timing `toBeDefined()` | Primary assertions and legitimate guards before timestamp checks. |
| `proof.test.ts` 1431-1442: overflow message test | Not source-reading. Behavioral test of `proof audit` output. |

## Edge Cases & Risks

1. **Template placeholder tests (work.test.ts 502-527):** Resolved — keep as-is with descriptive comment. Templates are shipped artifacts, not implementation details. No conversion needed.

2. **work.test.ts line 1695 "shows maintenance line":** Resolved — `Maintenance:` does not appear anywhere in `work.ts`. The label was intentionally removed or never existed. The assertion (`not.toContain('Maintenance:')`) is correct. Rename the test to `does not show Maintenance label for auto-closed findings`.

3. **work.test.ts line 2676 retry command source test:** Resolved — keep as source-reading with exemption comment. Behavioral alternative requires `execSync` failure injection — more complexity than the check warrants.

4. **Exact-count vs toBeGreaterThan(0):** Use exact counts. Coupling to fixture setup is desirable — you want to know when fixtures change.

5. **old-system-removed.test.ts cross-platform.test.ts check:** Drop it. E2E coverage already validates init output. One assertion about one test file existing adds no value.

6. **Line number drift:** The `strengthen-weak-test-assertions` completed plan touched some of these same files. Line numbers may have shifted. Locate all targets by test name, not line number.

## Rejected Approaches

- **Rewrite all source-reading tests as behavioral.** Some (import boundaries, retry command) serve a legitimate purpose with no behavioral surface. Forced rewrites would be more complex and less clear. Exemptions with comments are more honest.
- **Split large test files while cleaning.** The 4 files over 2900 lines are structural debt, but splitting while also modifying assertions mixes two concerns. Separate scope.
- **Fix duplicate test names in proof.test.ts.** Not wrong, just ambiguous in flat logs. Deferred to a file-splitting scope.
- **Convert template tests to behavioral.** Would require calling `init` in a tempdir — slow and coupling-heavy for a check that template files contain `{branchPrefix}`.

## Open Questions

None. All questions from the investigation have been resolved and dispositions are final in the inventory above.

## For AnaPlan

### Structural Analog
`strengthen-weak-test-assertions` in `.ana/plans/completed/` — same shape (assertion cleanup across the same test files). Check what it touched to avoid re-treading and to reuse patterns.

### Relevant Code Paths
All paths and line numbers are in the Full Change Inventory above. Every item has a disposition and replacement.

### Patterns to Follow
- Keep guard assertions that precede stronger checks (artifact.test.ts 1251, 1275; work.test.ts 1164/1180, 3209/3231)
- Exemption comment pattern: `// Source-reading exemption: enforces {what} — no behavioral surface for this constraint`
- Template comment pattern: `// Reads template file — templates are shipped artifacts, not implementation details`
- For `toBeGreaterThan(0)` → exact count: read the fixture setup to determine the expected count

### Known Gotchas
- Line numbers are from investigation point-in-time. Locate all targets by test name, not line number.
- `tests/cleanup/` directory may become empty after deleting `old-system-removed.test.ts` — delete the directory too.
- `init-flow.test.ts` agent/skill counts must match actual `packages/cli/templates/` contents. Verify before writing assertions.
- `proofSummary.test.ts` `toBeGreaterThan(0)` → exact count changes require reading each test's fixture setup to determine the correct expected value.
