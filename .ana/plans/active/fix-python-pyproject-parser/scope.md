# Scope: Fix Python pyproject.toml parser — 3 bugs causing silent testing detection failure

**Created by:** Ana
**Date:** 2026-05-22

## Intent

The pyproject.toml parser silently fails to detect pytest for every Python project we've tested. Three bugs compound: (1) PEP 735 `[dependency-groups]` isn't parsed at all, (2) the TOML array regex terminates at extras brackets like `[trio]` inside package specifiers, truncating everything after, and (3) single-quoted strings are ignored. All 5 validated Python repos (fastapi, pydantic, litellm, reflex, prefect) show `testing: []` despite having pytest. The scan lies — it says "no tests" when tests exist.

## Complexity Assessment
- **Kind:** fix
- **Size:** small — one source file, one test file
- **Surface:** cli
- **Files affected:** `packages/cli/src/engine/parsers/python/pyproject.ts` (source), `packages/cli/tests/engine/parsers/python.test.ts` (tests)
- **Blast radius:** Low. `parsePyprojectToml` is called only from `readPythonDependencies` (python.ts), which is called only for `projectType === 'python'`. No non-Python code paths reach this parser. Fixing array extraction also improves dependency completeness for framework, AI SDK, and database detection — not just testing.
- **Estimated effort:** 1-2 hours including tests
- **Multi-phase:** no

## Approach

Fix all three bugs in `parsePyprojectToml()`:

1. **Add Strategy 5** for PEP 735 `[dependency-groups]`. Same section-then-groups extraction pattern as Strategy 2. Extract the section body, then match `key = [...]` groups within it.

2. **Fix array termination** across Strategies 1, 2, and new 5. Change `[\s\S]*?\]` to `[\s\S]*?\]\s*$` (with `m` flag). This anchors the closing bracket to end-of-line, so extras brackets mid-line (like `anyio[trio] >=3.2.1`) are skipped. Handles both multi-line arrays (closing `]` on its own line) and single-line arrays (closing `]` at end of line).

3. **Support single quotes** in `extractFromArray`. Change the leading `"` to `["']` and add `'` to the trailing character class. TOML allows both quote styles.

Add a code comment on the regex tradeoff: the `\]\s*$` approach handles all known real-world pyproject.toml patterns; if TOML parsing needs grow beyond this, use a proper TOML parser library rather than extending these regexes.

Add a code comment on the Strategy 1 latent issue: the `^\s*dependencies\s*=\s*\[` pattern is not section-scoped and could theoretically match a `dependencies` key inside `[dependency-groups]` or another section. No known pyproject.toml uses this pattern, but it's worth documenting.

## Acceptance Criteria
- AC1: `parsePyprojectToml` extracts dependencies from `[dependency-groups]` sections (PEP 735 format)
- AC2: TOML arrays containing extras brackets (e.g., `"anyio[trio] >=3.2.1"`) are parsed completely — no truncation
- AC3: Single-line arrays (e.g., `benchmark = ["pytest-benchmark>=5.1.0"]`) continue to parse correctly (regression guard)
- AC4: Single-quoted strings (e.g., `'pytest'`) are extracted the same as double-quoted
- AC5: When run against fastapi's and pydantic's actual pyproject.toml content, `pytest` appears in the returned dependency list
- AC6: `include-group` inline tables (e.g., `{ include-group = "tests" }`) do not crash the parser — they are silently skipped (they're references, not package names)
- AC7: Existing tests continue to pass unchanged
- AC8: Code comments document the `\]\s*$` regex tradeoff and the Strategy 1 section-scoping note

## Edge Cases & Risks
- **Single-line arrays with extras:** `perf = ["logfire[fastapi,sqlalchemy]>=3.14.0", "pyinstrument>=5.0.0"]` — the `]` inside extras is NOT at end-of-line, the closing `]` IS. Option B handles this correctly.
- **TOML comments ending with `]`:** A line like `"foo", # see [docs]` inside an array would cause premature termination. This pattern doesn't appear in any tested pyproject.toml and is vanishingly rare. Documented as a known limitation in the code comment.
- **Strategy 1 false match:** `^\s*dependencies\s*=\s*\[` could match inside `[dependency-groups]` if a group is named `dependencies`. No known repos use this, but it means Strategy 1 might duplicate some deps. Since the function deduplicates via `new Set(deps)`, the impact is cosmetic (extra work, not wrong results).
- **`include-group` directives:** `{ include-group = "docs-tests" }` entries in `[dependency-groups]` arrays. The `extractFromArray` regex requires a quoted string — inline tables don't match, so they're silently ignored. This is correct behavior: `include-group` is a reference, not a package.

## Rejected Approaches
- **Option A (`^\s*\]` line-anchored):** Fails on single-line arrays. The existing test at python.test.ts:57-62 uses a single-line array and would break. Prefect has 3+ single-line arrays in `[dependency-groups]`.
- **Option C (line-by-line state machine):** ~20 lines of bracket-depth tracking. Eliminates all regex edge cases. Rejected because: both B and C are hand-rolled TOML parsing. If we outgrow B's regex, the right next step is a real TOML parser library, not a more complex hand-rolled parser. B creates a clear decision boundary. C is a half-measure that obscures the upgrade path.
- **Using a TOML parser library:** Would eliminate all parsing bugs permanently. Rejected for now — adds a dependency to the surface-tier scan engine, which deliberately stays lightweight. Worth revisiting if more TOML edge cases surface.
- **Following `include-group` references:** Would recursively resolve group references. Not justified — pytest is always in a top-level group (`tests` or `dev`), never in a sub-group that's only reachable via reference.

## Open Questions
None. All investigative questions resolved during analysis.

## Exploration Findings

### Patterns Discovered
- `pyproject.ts`: 4 strategies, each following extract-section → extract-groups/table → extract-names pattern. Strategy 5 should mirror Strategy 2's structure.
- `extractFromArray` helper: shared by Strategies 1, 2, and will be shared by 5. Single fix point for Bug 3.
- Strategies 3-4 (Poetry) use table format (`key = "value"`), not arrays — not affected by Bug 2.

### Constraints Discovered
- [TYPE-VERIFIED] `extractFromArray` regex (pyproject.ts:34) — leading `"` literal excludes single-quoted strings
- [TYPE-VERIFIED] Strategy 2 group regex (pyproject.ts:65-66) — `[\s\S]*?\]` terminates at first `]` including extras brackets
- [OBSERVED] PEP 735 `[dependency-groups]` — used by all 5 tested Python repos, not parsed by any strategy
- [OBSERVED] Pydantic uses single quotes exclusively — zero deps extracted even with Bugs 1-2 fixed

### Test Infrastructure
- `tests/engine/parsers/python.test.ts`: 4 test cases for `parsePyprojectToml`. All use simple inputs — no extras brackets, no multi-line optional-deps, no single quotes, no `[dependency-groups]`.

## For AnaPlan

### Structural Analog
Strategy 2 (PEP 621 `[project.optional-dependencies]`, pyproject.ts:59-73) — Strategy 5 is the same shape: extract section body, then match group arrays within it. The section header regex and group iteration logic can be modeled directly on Strategy 2.

### Relevant Code Paths
- `packages/cli/src/engine/parsers/python/pyproject.ts` — the entire file (110 lines). All changes happen here.
- `packages/cli/tests/engine/parsers/python.test.ts` — lines 56-83 are the `parsePyprojectToml` describe block. New tests go here.
- `packages/cli/src/engine/parsers/python.ts` — caller, no changes needed. Useful for understanding the call chain.
- `packages/cli/src/engine/scan-engine.ts:70-81` — `detectNonNodeTesting`, the upstream consumer. No changes needed.

### Patterns to Follow
- Strategy 2's section-then-groups pattern (pyproject.ts:59-73) — mirror for Strategy 5
- `extractFromArray` helper reuse (pyproject.ts:32-41) — Bug 3 fix here benefits all strategies
- Existing test style in python.test.ts — inline TOML strings, `expect(result).toEqual([...])` assertions

### Known Gotchas
- The `m` flag on `\]\s*$` is critical — without it, `$` only matches end of string, not end of line, and multi-line arrays break.
- Strategy 1's regex already has the `m` flag. Strategy 2's group regex has `gm`. New Strategy 5 groups regex needs `gm`.
- `extractFromArray` does NOT have the `m` flag on its own regex — it doesn't need it (it operates on already-extracted array bodies).
- The `new Set(deps)` dedup on line 109 means duplicate extraction across strategies is harmless — but the code comment should note that Strategy 1's unscoped match is tolerated because of this dedup.

### Things to Investigate
- Whether the Strategy 5 section terminator should use `(?:\n\[(?!dependency-groups)|$)` or the simpler `(?:\n\[|$)`. The simpler form is correct — `[dependency-groups]` only appears once per file, so there's no risk of the section header re-matching itself as a terminator.
