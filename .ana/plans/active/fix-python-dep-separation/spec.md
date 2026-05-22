# Spec: Separate Python production deps from dev deps

**Created by:** AnaPlan
**Date:** 2026-05-22
**Scope:** .ana/plans/active/fix-python-dep-separation/scope.md

## Approach

Split `parsePyprojectToml` from returning a flat `string[]` to `{ production: string[], dev: string[] }`. Strategies 1–4 push to `production`, Strategy 5 (`[dependency-groups]`) pushes to `dev`. Propagate through `readPythonDependencies` as `{ production: string[], all: string[] }` where `all` is the deduped union. Stack detection uses `.production`, testing detection uses `.all`.

The structural analog is `parsePipfile` in `Pipfile.ts` — two-section regex pattern that already separates `[packages]` from `[dev-packages]` into different match blocks, just merges them at the end. The pyproject split follows the same two-regex-to-two-buckets shape but keeps them separate in the return type.

requirements.txt feeds entirely to `production` (it has no dev concept). Pipfile merges both sections to `production` — the Pipfile dev split is deferred per scope (no false detections in test set).

Correct the pyproject.ts docstring that mischaracterizes `[project.optional-dependencies]` as devDependencies. It's production extras — what users install with `pip install package[extra]`.

Add `'testing'` to `EXCLUDED_SEGMENTS` in surfaces.ts alongside existing `'test'` and `'tests'`.

## Output Mockups

No user-facing output changes. The scan result is identical for correctly-detected projects. For previously-contaminated Python projects, the change removes false positives:

Before (fastapi repo): `framework=Flask` (from `[dependency-groups].tests` containing flask test fixtures)
After (fastapi repo): `framework=FastAPI` (from `[project] dependencies` containing starlette)

Before (pydantic repo): `database=SQLAlchemy` (from `[dependency-groups].dev`)
After (pydantic repo): `database=null` (no production database dep)

## File Changes

### `packages/cli/src/engine/parsers/python/pyproject.ts` (modify)
**What changes:** Return type splits from `string[]` to `{ production: string[], dev: string[] }`. Two separate arrays (`production` and `dev`) replace the single `deps` array. Strategies 1, 2, 3, 4 push to `production`. Strategy 5 pushes to `dev`. Dedup applies per-array. Fix docstring at line 14 — replace "dev/test/docs dependency groups — Python's equivalent of devDependencies" with accurate description of production extras.
**Pattern to follow:** `parsePipfile` in `Pipfile.ts` — same two-section regex structure, separate result arrays.
**Why:** This is the root cause. All `[dependency-groups]` deps contaminate production detection because they share a single array.

### `packages/cli/src/engine/parsers/python.ts` (modify)
**What changes:** Return type splits from `Promise<string[]>` to `Promise<{ production: string[], all: string[] }>`. requirements.txt deps → `production`. pyproject.toml returns `{ production, dev }` — merge `production` arrays, compute `all` as `production ∪ dev`. Pipfile deps → `production`. `all` is the deduped union of everything.
**Pattern to follow:** Same function structure, just two Sets instead of one.
**Why:** The reader must propagate the structured type so scan-engine can choose the right bucket per consumer.

### `packages/cli/src/engine/scan-engine.ts` (modify)
**What changes:** Two areas:
1. **Line 672 (Python deps override):** Call `readPythonDependencies`, assign `.production` to `deps`. The `deps` variable feeds `frameworkDeps` (line 684), `inferPatterns` (line 748), and `detectNonNodeAiSdk` (line 830) — all naturally consume production-only after this narrowing.
2. **`detectNonNodeTesting` function (line 70–81):** Internal Python branch calls `readPythonDependencies` and uses `.all` for pytest/unittest detection.

No signature changes to `detectNonNodeTesting`. Go/Ruby/Rust branches untouched. The line-849 "clear-and-rebuild" calls `detectNonNodeTesting` — same internal `.all` path.
**Pattern to follow:** Existing destructuring patterns in scan-engine.
**Why:** Stack detection (framework, database, auth, AI SDK) must see only production deps. Testing detection must see everything.

### `packages/cli/src/engine/detectors/surfaces.ts` (modify)
**What changes:** Add `'testing'` to `EXCLUDED_SEGMENTS` set.
**Pattern to follow:** Existing entries like `'test'`, `'tests'`.
**Why:** Directories named `testing/` (e.g., `packages/testing/code-health`) are non-product paths that should be excluded from surface detection, same as `test/` and `tests/`.

### `packages/cli/tests/engine/parsers/python.test.ts` (modify)
**What changes:** All `parsePyprojectToml` test assertions update from flat array to `{ production, dev }` structure. New contamination-proves-fixed tests added. Details in Testing Strategy section.
**Pattern to follow:** Existing test structure in the same file.
**Why:** Return type change breaks every existing assertion. New tests prove the contamination regression is fixed.

## Acceptance Criteria

- [ ] AC1: `parsePyprojectToml` returns `{ production: string[], dev: string[] }` with `[dependency-groups]` deps in `dev` and all other strategies in `production`.
- [ ] AC2: `readPythonDependencies` returns `{ production: string[], all: string[] }` where `all` is the union of production and dev.
- [ ] AC3: scan-engine.ts line 672 sets `deps` to `pythonDeps.production` for stack detection (framework, database, auth, AI SDK).
- [ ] AC4: `detectNonNodeTesting` (called at both line 76 and line 849) uses the `all` list to find pytest/unittest.
- [ ] AC5: A pyproject.toml with Flask in `[dependency-groups].tests` and starlette in `[project] dependencies` does NOT produce `framework=Flask`.
- [ ] AC6: A pyproject.toml with SQLAlchemy in `[dependency-groups].dev` and pydantic-core in `[project] dependencies` does NOT produce `database=SQLAlchemy`.
- [ ] AC7: A pyproject.toml with pytest in `[dependency-groups].test` DOES produce pytest in testing detection.
- [ ] AC8: A pyproject.toml with FastAPI in `[project] dependencies` (litellm/prefect style) still produces `framework=FastAPI`.
- [ ] AC9: `'testing'` is in `EXCLUDED_SEGMENTS` and `isNonProductPath('packages/testing/code-health')` returns true.
- [ ] AC10: The pyproject.ts docstring for `[project.optional-dependencies]` no longer calls it devDependencies.
- [ ] AC11: All existing tests pass. No test count decrease.
- [ ] AC12: Tests pass with project test command.
- [ ] AC13: No build errors.

## Testing Strategy

- **Unit tests (parsePyprojectToml):** Every existing `parsePyprojectToml` test updates assertions from `expect(result).toContain('x')` / `expect(result).toEqual([...])` to `expect(result.production).toContain('x')` or `expect(result.dev).toContain('x')` as appropriate. The PEP 735 test (line 86) becomes the key: `pytest`, `coverage`, `sphinx` now assert in `result.dev` not `result.production`.
- **New contamination tests:**
  - Flask in `[dependency-groups].tests` + starlette in `[project] dependencies` → `result.production` contains starlette, does NOT contain flask. `result.dev` contains flask.
  - SQLAlchemy in `[dependency-groups].dev` + pydantic-core in `[project] dependencies` → `result.production` contains pydantic-core, does NOT contain sqlalchemy. `result.dev` contains sqlalchemy.
  - pytest in `[dependency-groups].test` → `result.dev` contains pytest, `result.all` (at readPythonDependencies level) contains pytest.
  - FastAPI in `[project] dependencies` → `result.production` contains fastapi (unaffected by split).
- **Strategy 1 cross-match test:** Construct a pyproject with both `[project] dependencies = ["flask"]` AND `[dependency-groups]\ndependencies = ["pytest"]` (group literally named "dependencies"). Verify: flask in `production`, pytest in `dev`. This catches if Strategy 1's unscoped regex accidentally matches the `[dependency-groups]` entry. Note: Strategy 1 regex anchors on `dependencies = [` which WILL match inside `[dependency-groups]` if a group is named `dependencies`. If this test reveals cross-match, document it as a known limitation — the dedup still prevents duplicates, just means that specific group's deps land in both `production` and `dev`.
- **EXCLUDED_SEGMENTS test:** `isNonProductPath('packages/testing/code-health')` returns true.
- **Edge cases:** Empty `[dependency-groups]` section returns `{ production: [], dev: [] }`. Invalid TOML returns `{ production: [], dev: [] }`.

## Dependencies

None. All affected files exist and are on main.

## Constraints

- Return type change is breaking for callers — both call sites in scan-engine.ts must update simultaneously.
- Test count must not decrease (CI constraint).
- Engine files have zero CLI dependencies — no chalk/ora in parser or scan-engine changes.

## Gotchas

- **Strategy 1 cross-match:** The PEP 621 regex is not section-scoped. If a `[dependency-groups]` group is literally named `dependencies`, Strategy 1 will also match those deps into `production`. After the split, this means those deps appear in BOTH `production` and `dev`. This is acceptable — the group name `dependencies` is extremely rare in practice, and having extra deps in production is conservative (false positive, not false negative). The test should document this known behavior.
- **Three call sites for `readPythonDependencies`:** Line 672 (main stack path, uses `.production`), line 76 inside `detectNonNodeTesting` (uses `.all`), and line 849 which calls `detectNonNodeTesting` again (same `.all` path). All three must handle the structured return.
- **Existing `@ana` test tags:** Tests at lines 85, 102, 114, 123, 134, 165, 184 have `@ana` assertion tags from a previous pipeline run. These refer to old contract assertions, not the current contract. The tags will be replaced by AnaBuild with new assertion IDs from this contract.
- **`detectNonNodeAiSdk(deps)` at line 830:** This naturally gets production deps after the line-672 narrowing — no additional change needed. But verify it still receives `deps` (the local variable), not something else.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Use `import type` for type-only imports, separate from value imports.
- Explicit return types on all exported functions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Engine files have zero CLI dependencies — no chalk, no ora.
- Prefer early returns over nested conditionals.
- Use `| null` for checked-empty fields, `?:` for unchecked.
- Always use `--run` with pnpm test/vitest to avoid watch mode hang.

### Pattern Extracts

`parsePipfile` two-section structure (Pipfile.ts:13-41) — the structural analog for pyproject's split:
```typescript
// packages/cli/src/engine/parsers/python/Pipfile.ts:13-41
export function parsePipfile(content: string): string[] {
  const deps: string[] = [];

  // Find [packages] section (production dependencies)
  const packagesSection = content.match(/\[packages\]([\s\S]*?)(?=\[|$)/);
  if (packagesSection && packagesSection[1]) {
    const tableContent = packagesSection[1];
    const pkgMatches = tableContent.matchAll(/^([a-zA-Z0-9][\w.-]*)\s*=/gm);
    for (const match of pkgMatches) {
      if (match[1]) {
        deps.push(match[1].toLowerCase());
      }
    }
  }

  // Find [dev-packages] section
  const devSection = content.match(/\[dev-packages\]([\s\S]*?)(?=\[|$)/);
  if (devSection && devSection[1]) {
    const tableContent = devSection[1];
    const pkgMatches = tableContent.matchAll(/^([a-zA-Z0-9][\w.-]*)\s*=/gm);
    for (const match of pkgMatches) {
      if (match[1]) {
        deps.push(match[1].toLowerCase());
      }
    }
  }

  return Array.from(new Set(deps));
}
```

scan-engine.ts Python deps override (lines 668-678) — the primary consumer to modify:
```typescript
// packages/cli/src/engine/scan-engine.ts:668-678
  let deps = Object.keys(census.allDeps);
  try {
    const pt = projectTypeResult.type;
    if (pt === 'python') deps = await readPythonDependencies(rootPath);
    else if (pt === 'go') deps = await readGoDependencies(rootPath);
    else if (pt === 'rust') {
      const { readRustDependencies } = await import('./parsers/rust.js');
      deps = await readRustDependencies(rootPath);
    }
  } catch { /* dep reading failed — continue with census deps */ }
```

detectNonNodeTesting Python branch (lines 75-81) — uses `.all`:
```typescript
// packages/cli/src/engine/scan-engine.ts:75-81
    if (projectType === 'python') {
      const deps = await readPythonDependencies(rootPath);
      const detected: string[] = [];
      if (deps.includes('pytest')) detected.push('pytest');
      if (deps.includes('unittest')) detected.push('unittest');
      return detected;
    }
```

### Proof Context
- `pyproject.ts`: 1 active finding (fix-python-pyproject-parser-C2) — TOML inline comments after closing bracket would break `]\s*$` anchor. Not related to this change but worth knowing.
- `scan-engine.ts`: 1 active finding (fix-typescript-language-detection-C1) — hardcoded subdirectory list. Not related. Build concern: A017 (Node AI SDK unchanged) has no dedicated test. Not related.
- `python.ts`: No active proof findings.

### Checkpoint Commands
- After pyproject.ts + python.ts changes: `(cd 'packages/cli' && pnpm vitest run tests/engine/parsers/python.test.ts)` — Expected: all python parser tests pass with updated assertions
- After scan-engine.ts changes: `(cd 'packages/cli' && pnpm vitest run)` — Expected: all 122 test files pass
- After all changes: `pnpm run test -- --run` — Expected: 2846+ tests pass
- Lint: `pnpm run lint`

### Build Baseline
- Current tests: 2846 passed, 2 skipped (2848 total)
- Current test files: 122 passed
- Command used: `(cd 'packages/cli' && pnpm vitest run)`
- After build: expected 2846 + ~6-8 new tests (contamination proofs, EXCLUDED_SEGMENTS, edge cases)
- Regression focus: `tests/engine/parsers/python.test.ts` (all pyproject assertions change), `tests/engine/scan-engine.test.ts` (if any Python integration tests exist)
