# Spec: Fix Python pyproject.toml parser — 3 bugs

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/fix-python-pyproject-parser/scope.md

## Approach

Three fixes in `parsePyprojectToml()`, all in `packages/cli/src/engine/parsers/python/pyproject.ts`:

1. **Bug 1 — PEP 735 `[dependency-groups]` not parsed.** Add Strategy 5 between Strategy 2 and Strategy 3, mirroring Strategy 2's structure exactly. Extract the `[dependency-groups]` section body, then iterate `key = [...]` group arrays within it. Use `extractFromArray` for name extraction (same as Strategies 1 and 2).

2. **Bug 2 — Array termination at extras brackets.** In every regex that matches `[..array body..]`, change the closing `\]` to `\]\s*$` so it anchors to end-of-line. This skips mid-line brackets like `[trio]` in `"anyio[trio] >=3.2.1"`. Affects: Strategy 1 regex, Strategy 2 group regex, and new Strategy 5 group regex. The `m` flag is required on all three (Strategy 1 already has it, Strategy 2 groups already have `gm`).

3. **Bug 3 — Single-quoted strings ignored.** In `extractFromArray`, change the leading `"` in the regex to `["']` and add `'` to the trailing character class. TOML allows both quote styles; pydantic uses single quotes exclusively.

Add two code comments:
- On the `\]\s*$` pattern: document the regex tradeoff and that a proper TOML parser is the right next step if more edge cases surface.
- On Strategy 1: document that `^\s*dependencies\s*=\s*\[` is not section-scoped and could theoretically match inside `[dependency-groups]`, but dedup via `new Set(deps)` makes this harmless.

## Output Mockups

Before fix — fastapi pyproject.toml:
```
parsePyprojectToml(fastapiContent) → ["fastapi", "starlette", "pydantic", ...]
// pytest is MISSING — it's in [dependency-groups]
```

After fix:
```
parsePyprojectToml(fastapiContent) → ["fastapi", "starlette", "pydantic", ..., "pytest", "coverage", ...]
// pytest is found via Strategy 5
```

## File Changes

### `packages/cli/src/engine/parsers/python/pyproject.ts` (modify)
**What changes:** Three bug fixes in existing code plus one new strategy block (~15 lines). `extractFromArray` regex updated for single quotes. Strategy 1 and Strategy 2 group regexes updated for end-of-line anchoring. New Strategy 5 block added after Strategy 2, before Strategy 3. Two code comments added.
**Pattern to follow:** Strategy 2 (lines 59-73) — mirror its section-then-groups structure for Strategy 5.
**Why:** Without these fixes, every Python project scanned reports zero testing dependencies regardless of actual pytest usage.

### `packages/cli/tests/engine/parsers/python.test.ts` (modify)
**What changes:** New test cases added to the `parsePyprojectToml` describe block. Existing 4 tests remain untouched.
**Pattern to follow:** Existing tests (lines 57-83) — inline TOML strings, `expect(result).toEqual([...])`.
**Why:** The existing tests use only simple inputs — no extras brackets, no multi-line optional-deps, no single quotes, no `[dependency-groups]`.

## Acceptance Criteria

- [x] AC1: `parsePyprojectToml` extracts dependencies from `[dependency-groups]` sections (PEP 735 format)
- [x] AC2: TOML arrays containing extras brackets (e.g., `"anyio[trio] >=3.2.1"`) are parsed completely — no truncation
- [x] AC3: Single-line arrays (e.g., `benchmark = ["pytest-benchmark>=5.1.0"]`) continue to parse correctly (regression guard)
- [x] AC4: Single-quoted strings (e.g., `'pytest'`) are extracted the same as double-quoted
- [x] AC5: When run against fastapi's and pydantic's actual pyproject.toml content, `pytest` appears in the returned dependency list
- [x] AC6: `include-group` inline tables (e.g., `{ include-group = "tests" }`) do not crash the parser — they produce harmless phantom dependency names (e.g., `"tests"`) that no detector matches
- [x] AC7: Existing tests continue to pass unchanged
- [x] AC8: Code comments document the `\]\s*$` regex tradeoff and the Strategy 1 section-scoping note

## Testing Strategy

- **Unit tests:** Add to the existing `parsePyprojectToml` describe block. Each bug gets its own test case(s):
  - PEP 735 `[dependency-groups]` with multi-line array → extracts all deps
  - PEP 735 with `include-group` inline table → silently skipped, no crash
  - Array with extras brackets (e.g., `"anyio[trio] >=3.2.1"`) → package name extracted, not truncated
  - Single-line array → still works (regression guard for existing test at line 57)
  - Single-quoted strings → extracted same as double-quoted
  - Mixed: `[dependency-groups]` with extras brackets and single quotes combined
- **Integration-style tests:** Two tests using representative pyproject.toml content modeled on fastapi and pydantic. Verify `pytest` appears in results. These don't need to be exact copies — use representative snippets that exercise all three bugs.
- **Edge cases:** Single-line `[dependency-groups]` array. Empty `[dependency-groups]` section. Group with only `include-group` entries (extracts phantom dep names like `"tests"` — harmless, no detector matches these).

## Dependencies

None. Pure parser function with no external dependencies.

## Constraints

- Engine code: no chalk, no commander, no CLI dependencies.
- The `extractFromArray` regex change must remain backward-compatible — double-quoted strings must continue to work identically.
- The `new Set(deps)` dedup on the return line handles any overlap between Strategy 1 and Strategy 5 matching the same `dependencies` key. No additional dedup logic needed.

## Gotchas

- **The `m` flag is critical.** Without it, `$` matches end-of-string only, not end-of-line. Multi-line arrays would break. Strategy 1 already has `m`. Strategy 2 groups already have `gm`. New Strategy 5 groups regex needs `gm`.
- **`extractFromArray` does NOT need the `m` flag.** It operates on already-extracted array bodies, not raw file content.
- **Strategy 5 section terminator:** Use `(?:\n\[|$)` — the simpler form. `[dependency-groups]` appears at most once per file, so there's no risk of self-matching as a terminator.
- **Existing test on line 57-61 is a single-line array.** The array termination fix must not break this. `\]\s*$` handles single-line arrays correctly because the closing `]` IS at end-of-line.

## Build Brief

### Rules That Apply
- Engine files have zero CLI dependencies — no chalk, no ora.
- All imports use `.js` extensions for ESM resolution.
- Explicit return types on exported functions (already present on `parsePyprojectToml`).
- Prefer early returns over nested conditionals.
- `import type` separate from value imports.

### Pattern Extracts

Strategy 2 — the structural analog for Strategy 5 (pyproject.ts lines 59-73):
```typescript
  // Strategy 2: PEP 621 [project.optional-dependencies]
  const optionalDepsSection = content.match(
    /\[project\.optional-dependencies\]([\s\S]*?)(?:\n\[|$)/
  );
  if (optionalDepsSection && optionalDepsSection[1]) {
    const sectionBody = optionalDepsSection[1];
    // Match `group = [ ... ]` entries, allowing multi-line arrays.
    const groupMatches = sectionBody.matchAll(
      /^\s*[a-zA-Z0-9][\w.-]*\s*=\s*\[([\s\S]*?)\]/gm
    );
    for (const match of groupMatches) {
      if (match[1]) {
        deps.push(...extractFromArray(match[1]));
      }
    }
  }
```

`extractFromArray` — the function getting the single-quote fix (pyproject.ts lines 32-41):
```typescript
  const extractFromArray = (arrayBody: string): string[] => {
    const names: string[] = [];
    const matches = arrayBody.matchAll(/"([a-zA-Z0-9][\w.-]*)[\[\]>=<\s"]/g);
    for (const match of matches) {
      if (match[1]) {
        names.push(match[1].toLowerCase());
      }
    }
    return names;
  };
```

Existing test style (python.test.ts lines 57-62):
```typescript
  it('parses PEP 621 format', () => {
    const content = `[project]
dependencies = ["fastapi>=0.100.0", "uvicorn>=0.20.0"]`;
    const result = parsePyprojectToml(content);
    expect(result).toEqual(['fastapi', 'uvicorn']);
  });
```

### Proof Context
No active proof findings for affected files.

### Checkpoint Commands
- After modifying `pyproject.ts`: `(cd 'packages/cli' && pnpm vitest run tests/engine/parsers/python.test.ts)` — Expected: existing 4 `parsePyprojectToml` tests still pass
- After adding new tests: `(cd 'packages/cli' && pnpm vitest run tests/engine/parsers/python.test.ts)` — Expected: all tests pass (existing + new)
- After all changes: `pnpm run test -- --run` — Expected: 2837+ tests pass, 122+ test files
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2837 passed, 2 skipped
- Current test files: 122
- Command used: `pnpm run test -- --run`
- After build: expected ~2845+ tests in 122 test files (same file, more tests)
- Regression focus: `tests/engine/parsers/python.test.ts` — existing 4 `parsePyprojectToml` tests must not change or break
