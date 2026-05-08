# Spec: Test Suite Hygiene

**Created by:** AnaPlan
**Date:** 2026-05-07
**Scope:** .ana/plans/active/test-suite-hygiene/scope.md

## Approach

Eight-category cleanup pass on the test suite. Tests only — zero production code changes. The scope provides an exhaustive inventory with dispositions for every test. This spec organizes that inventory into a build checklist.

The structural analog is `strengthen-weak-test-assertions` (completed) — same shape: assertion cleanup across the same test files. That plan established the `toBeDefined()` → `toBeTypeOf()` pattern and exact-value-from-fixture pattern used here.

Two mislabeled tests that the scope offers as "rename or remove" (work.test.ts lines 829 and 1723) are being **removed**. Both exercise the PASS path which is already well-covered (line 848 and surrounding tests). Renaming them to match what they actually test would create duplicates. Proof findings confirm: "A030 test named 'allows completion with UNKNOWN result' but exercises PASS path" and "A024 warning test doesn't trigger the warning."

## Output Mockups

No user-facing output changes. The test runner shows the same test structure with fewer tests, corrected names, and stronger assertions. Expected final output:

```
 Test Files  95 passed (95)
      Tests  ~1988 passed | 2 skipped (~1990)
```

The exact count depends on how many redundant guard assertions are removed vs strengthened. The file count drops by 1 (old-system-removed.test.ts deleted).

## File Changes

### `packages/cli/tests/cleanup/old-system-removed.test.ts` (delete)
**What changes:** Delete entire file (109 lines, ~21 archaeological tests). Delete `tests/cleanup/` directory if empty after.
**Why:** Every test asserts deleted code stays deleted. Code review catches resurrections — these tests add no behavioral coverage.

### `packages/cli/tests/commands/work.test.ts` (modify)
**What changes:** Remove 2 source-reading tests, remove 2 mislabeled tests (redundant PASS path), rename 1 mislabeled test, strengthen ~15 weak assertions, add exemption comments to 3 kept source-reading tests, add template comments to 3 template tests.
**Pattern to follow:** Existing assertion patterns in the same file. `toBeTypeOf('object')` for object fields, `toMatch(/^\d{4}-\d{2}-\d{2}/)` for timestamps.
**Why:** Source-reading tests verify structure not behavior. Mislabeled tests confuse future maintenance. Weak assertions pass without proving anything.

### `packages/cli/tests/commands/proof.test.ts` (modify)
**What changes:** Strengthen ~25 weak assertions across JSON envelope tests. Replace `toBeDefined()` with `toBeTypeOf()`, remove redundant guard assertions that precede stronger checks.
**Pattern to follow:** The `strengthen-weak-test-assertions` plan established the pattern: remove `toBeTruthy()` guards before value assertions, replace `toBeDefined()` with type or value checks.
**Why:** `toBeDefined()` on a deterministic field passes for any non-null value. Type assertions catch shape regressions.

### `packages/cli/tests/commands/artifact.test.ts` (modify)
**What changes:** Remove 1 archaeological source-reading test (line ~1281 "step 9a post-commit fixup"). Strengthen 1 weak assertion (seal_hash at line ~1253).
**Pattern to follow:** `toMatch(/^sha256:[a-f0-9]{64}$/)` — already used elsewhere in the same file.
**Why:** Archaeological test verifies deleted code. seal_hash `toBeDefined()` should verify the hash format.

### `packages/cli/tests/commands/verify.test.ts` (modify)
**What changes:** Remove 1 archaeological test (line ~334 "tag coverage tests are removed"). Add exemption comment to kept import-boundary test (line ~268).
**Pattern to follow:** Exemption comment pattern: `// Source-reading exemption: enforces import boundary — no behavioral surface for this constraint`
**Why:** Archaeological test verifies deleted function. Import-boundary test is legitimate constraint enforcement.

### `packages/cli/tests/utils/proofSummary.test.ts` (modify)
**What changes:** Rename 2 mislabeled tests ("Callouts" → "Findings"), strengthen `toBeGreaterThan(0)` → exact counts, remove 1 redundant guard assertion (line ~1402). Add exemption comment to kept import-boundary test (line ~1407).
**Pattern to follow:** Read each test's fixture setup to determine the exact expected count. Single-finding fixtures → `toBe(1)`.
**Why:** Stale names from a "Callouts" → "Findings" rename. Weak assertions accept any positive number.

### `packages/cli/tests/e2e/init-flow.test.ts` (modify)
**What changes:** Add missing agent file (`ana-learn.md`) to assertions. Add missing skill directories (`ai-patterns`, `api-patterns`, `data-access`). Update stale comments (agent count: 9→6, skill count: 6→8). Update inline comment "5 agent files" → "6 agent files".
**Pattern to follow:** Existing array pattern — append to `agentFiles` and `skillDirs` arrays.
**Why:** Templates ship 6 agents and 8 skills. Test only checks 5 and 5.

### `packages/cli/tests/engine/fixtures.ts` (modify)
**What changes:** Remove `loadFixture()` function entirely (dead — never imported). Remove `export` keyword from `isWasmAvailable()` (only consumed internally by `skipIfNoWasm()`). Remove `console.warn` from `skipIfNoWasm()`.
**Pattern to follow:** `describe.skipIf` pattern already communicates skipped tests — no need for console output.
**Why:** Dead exports clutter autocomplete and signal false public API surface.

### `packages/cli/tests/performance/benchmarks.test.ts` (modify)
**What changes:** Remove `console.log` timing output (line 39).
**Pattern to follow:** The `expect(seconds).toBeLessThan(20)` already captures the result.
**Why:** Console noise in test output.

### `packages/cli/tests/engine/performance/parsing-performance.test.ts` (modify)
**What changes:** Remove `console.log` skip message (line 31).
**Pattern to follow:** `describe.skipIf(!wasmAvailable)` already communicates the skip.
**Why:** Console noise in test output.

## Acceptance Criteria

- [ ] AC1: Zero source-reading tests that grep production source for behavior testable by exercising the code. Import-boundary tests at `proofSummary.test.ts` and `verify.test.ts` are exempt with exemption comments. Template-reading tests (work.test.ts) are exempt with template comments.
- [ ] AC2: Zero archaeological tests. `tests/cleanup/old-system-removed.test.ts` deleted entirely and `tests/cleanup/` directory deleted. `verify.test.ts` "tag coverage" test removed.
- [ ] AC3: Every test name accurately describes what the test asserts. 2 stale names in `proofSummary.test.ts` corrected ("Callouts" → "Findings").
- [ ] AC4: No `toBeDefined()` as the sole assertion on a field whose type is deterministic. Guard assertions before stronger checks are acceptable.
- [ ] AC5: E2E init test asserts all 6 agent files (`ana.md`, `ana-plan.md`, `ana-setup.md`, `ana-build.md`, `ana-verify.md`, `ana-learn.md`) and all 8 skill directories (`testing-standards`, `coding-standards`, `git-workflow`, `deployment`, `troubleshooting`, `ai-patterns`, `api-patterns`, `data-access`).
- [ ] AC6: Zero dead exports in test helpers. `loadFixture()` removed, `isWasmAvailable()` unexported.
- [ ] AC7: Zero `console.log`/`console.warn` in tests outside explicitly labeled performance benchmarks. (Note: `parsing-performance.test.ts` is a performance test, but the console.log at line 31 is a skip message, not a benchmark result — remove it.)
- [ ] AC8: All tests pass (`(cd packages/cli && pnpm vitest run)` green). Test count decreases. Zero behavioral coverage lost.
- [ ] AC9: Tests pass, no build errors, no lint errors.

## Testing Strategy

- **Unit tests:** This IS the test cleanup — no separate test layer.
- **Regression:** Full suite run after all changes. Baseline: 96 files, 2013 passed, 2 skipped. After: 95 files, ~1988 passed, 2 skipped.
- **Edge cases:** Verify `isWasmAvailable` still works after unexport (consumed internally by `skipIfNoWasm` in the same file). Verify `tests/cleanup/` directory is fully removed.

## Dependencies

None. All changes are test-only.

## Constraints

- **No production code changes.** This is purely test hygiene.
- **Contract tag preservation:** Tests being removed may carry `@ana` tags from completed plans. These tags reference archived contracts — removing them is expected.
- **Locate by test name, not line number.** Line numbers in this spec are approximate from investigation. The builder must search by test name or surrounding context.

## Gotchas

- **`isWasmAvailable` export removal:** After removing `export`, verify `skipIfNoWasm()` in the same file still calls it. It does — it's a local function call, not an import. But also check if any other file imports `isWasmAvailable` directly. Grep confirmed: only `fixtures.ts` and `skipIfNoWasm` consume it.
- **`loadFixture` removal:** Confirm no test file imports it before deleting. Grep confirmed: zero imports outside `fixtures.ts`.
- **E2E agent/skill counts:** The scope says to verify against actual `packages/cli/templates/` contents. Verified: 6 agent files (`ana.md`, `ana-plan.md`, `ana-setup.md`, `ana-build.md`, `ana-verify.md`, `ana-learn.md`) and 8 skill dirs (`testing-standards`, `coding-standards`, `git-workflow`, `deployment`, `troubleshooting`, `ai-patterns`, `api-patterns`, `data-access`).
- **Removing work.test.ts line 829 and 1723:** These are `@ana A030` and `@ana A024` respectively. Both from completed/archived plans. Removing them orphans those tags — expected behavior.
- **`proofSummary.test.ts` exact counts from fixtures:** Several `toBeGreaterThan(0)` assertions need exact values. For each one, read the fixture setup in the same test to determine the exact count. Single-finding fixtures produce 1. Multi-finding fixtures produce the count written into the fixture.
- **`proof.test.ts` guard removal:** When removing `toBeTruthy()` or `toBeDefined()` guards, verify the next assertion would fail on null/undefined (e.g., `json.command.toBe('proof')` throws on null json). Only remove guards where the subsequent assertion already covers the case.
- **`tests/cleanup/` directory:** After deleting `old-system-removed.test.ts`, the directory should be empty (verified: only file). Delete the directory too.

## Build Brief

### Rules That Apply
- Always use `--run` with `pnpm vitest` to avoid watch mode hang
- Use `import type` for type-only imports, separate from value imports
- Named exports preferred — when unexporting `isWasmAvailable`, remove the `export` keyword, don't convert to default
- `toBeTypeOf('object')` for object fields, `toBeTypeOf('number')` for numeric fields, `toBeTypeOf('string')` for strings, `toBeTypeOf('boolean')` for booleans
- `toMatch(/^\d{4}-\d{2}-\d{2}/)` for ISO timestamps
- `toMatch(/^sha256:[a-f0-9]{64}$/)` for SHA-256 hashes

### Pattern Extracts

**Weak assertion strengthening (from strengthen-weak-test-assertions plan, same files):**

From `proof.test.ts` line ~778-779 — the pattern of value assertion making guard redundant:
```typescript
// packages/cli/tests/commands/proof.test.ts ~778
expect(json.results.timing).toBeDefined();    // guard — REMOVE
expect(json.results.timing.total_minutes).toBe(90);  // value assertion covers the guard
```

**Exemption comment pattern (to add):**
```typescript
// Source-reading exemption: enforces import boundary — no behavioral surface for this constraint
```

**Template comment pattern (to add):**
```typescript
// Reads template file — templates are shipped artifacts, not implementation details
```

**E2E array pattern (from init-flow.test.ts line ~118-129):**
```typescript
// packages/cli/tests/e2e/init-flow.test.ts ~117-129
const agentFiles = [
  'ana.md',
  'ana-plan.md',
  'ana-setup.md',
  'ana-build.md',
  'ana-verify.md',
];
// Add: 'ana-learn.md'
```

```typescript
// packages/cli/tests/e2e/init-flow.test.ts ~135-141
const skillDirs = [
  'testing-standards',
  'coding-standards',
  'git-workflow',
  'deployment',
  'troubleshooting',
];
// Add: 'ai-patterns', 'api-patterns', 'data-access'
```

### Proof Context

**work.test.ts (10 pipeline cycles):**
- [test] "A030 test named 'allows completion with UNKNOWN result' but exercises PASS path" — directly addressed: removing this test.
- [test] "Test name 'shows maintenance line when findings were auto-closed' is now inverted" — directly addressed: renaming this test.
- [test] "A024 warning test doesn't trigger the warning" — directly addressed: removing this test (line 1723).

**proof.test.ts (7 pipeline cycles):**
- [test] "toBeDefined() on JSON confidence tiers — verifies existence not structure" — directly addressed by weak assertion strengthening.
- [test] "A018 uses toBeGreaterThan(0) — weak assertion" — tangentially related, in proofSummary scope.

**proofSummary.test.ts (6 pipeline cycles):**
- [test] "Remaining toBeGreaterThan(0) — 21 instances outside this spec's scope still use weak assertions" — this build addresses several of these in the proofContext section.

No active proof findings for init-flow.test.ts or fixtures.ts.

### Checkpoint Commands

- After `old-system-removed.test.ts` deletion: `(cd packages/cli && pnpm vitest run tests/cleanup 2>&1)` — Expected: no such file/directory (directory deleted)
- After each file change: `(cd packages/cli && pnpm vitest run --reporter=verbose {changed_file})` — Expected: all tests pass
- After all changes: `(cd packages/cli && pnpm vitest run)` — Expected: 95 files pass, ~1988 tests pass, 2 skipped
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2013 passed, 2 skipped (2015 total)
- Current test files: 96
- Command used: `(cd packages/cli && pnpm vitest run)`
- After build: expected 95 files, ~1988 tests (exact count depends on guard removal decisions)
- Regression focus: `work.test.ts`, `proof.test.ts`, `proofSummary.test.ts` — highest churn files, most changes in this build
