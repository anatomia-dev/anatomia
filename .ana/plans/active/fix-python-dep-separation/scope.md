# Scope: Separate Python production deps from dev deps

**Created by:** Ana
**Date:** 2026-05-22

## Intent

The PEP 735 `[dependency-groups]` parser fix (PR #199) reads all dependency groups into a flat list that feeds framework, database, and auth detection. Test dependencies from `[dependency-groups]` contaminate stack identity: fastapi shows `framework=Flask` + `auth=JWT`, pydantic shows `database=SQLAlchemy`, reflex shows `framework=FastAPI` (all from dev deps, none production). This is a regression — we made Python scanning worse in an attempt to make it better. Must ship before 1.1.3 bump.

Bundled: correct a misleading docstring in pyproject.ts (line 14 calls `[project.optional-dependencies]` "Python's equivalent of devDependencies" — it's not, it's user-facing production extras) and add `'testing'` to `EXCLUDED_SEGMENTS` in surfaces.ts.

## Complexity Assessment

- **Kind:** fix
- **Size:** small — 4 files changed, 1 return type split propagated through 2 call sites
- **Surface:** cli
- **Files affected:**
  - `packages/cli/src/engine/parsers/python/pyproject.ts` — split return type to `{ production, dev }`, fix docstring
  - `packages/cli/src/engine/parsers/python.ts` — split return type to `{ production, all }`
  - `packages/cli/src/engine/scan-engine.ts` — use `.production` for stack detection (line 672), `.all` for testing detection (lines 76, 849)
  - `packages/cli/src/engine/detectors/surfaces.ts` — add `'testing'` to `EXCLUDED_SEGMENTS`
  - `packages/cli/tests/engine/parsers/python.test.ts` — update assertions for structured return type, add contamination-proves-fixed tests
- **Blast radius:** Framework, database, auth, and AI SDK detection for all Python projects. Testing detection must remain unaffected. Non-Python scans untouched (all changes gated on `projectType === 'python'` or inside Python-specific parsers).
- **Estimated effort:** 1-2 hours
- **Multi-phase:** no

## Approach

Split `parsePyprojectToml` from returning a flat `string[]` to returning `{ production: string[], dev: string[] }`, where production contains Strategies 1–4 (PEP 621 `[project] dependencies`, `[project.optional-dependencies]`, Poetry deps) and dev contains Strategy 5 (`[dependency-groups]` only). Propagate through `readPythonDependencies` as `{ production: string[], all: string[] }`. Stack identity detection (framework, database, auth, AI SDK) uses `.production`. Testing detection uses `.all`. The distinction is permanent and universal — `[dependency-groups]` is never production in the Python ecosystem.

Correct the pyproject.ts docstring that mischaracterizes `[project.optional-dependencies]` as devDependencies. It's production extras — what users install with `pip install package[extra]`.

Add `'testing'` to `EXCLUDED_SEGMENTS` alongside existing `'test'` and `'tests'` entries.

## Acceptance Criteria

- AC1: `parsePyprojectToml` returns `{ production: string[], dev: string[] }` with `[dependency-groups]` deps in `dev` and all other strategies in `production`.
- AC2: `readPythonDependencies` returns `{ production: string[], all: string[] }` where `all` is the union of production and dev.
- AC3: scan-engine.ts line 672 sets `deps` to `pythonDeps.production` for stack detection (framework, database, auth, AI SDK).
- AC4: `detectNonNodeTesting` (called at both line 76 and line 849) uses the `all` list to find pytest/unittest.
- AC5: A pyproject.toml with Flask in `[dependency-groups].tests` and starlette in `[project] dependencies` does NOT produce `framework=Flask`.
- AC6: A pyproject.toml with SQLAlchemy in `[dependency-groups].dev` and pydantic-core in `[project] dependencies` does NOT produce `database=SQLAlchemy`.
- AC7: A pyproject.toml with pytest in `[dependency-groups].test` DOES produce pytest in testing detection.
- AC8: A pyproject.toml with FastAPI in `[project] dependencies` (litellm/prefect style) still produces `framework=FastAPI`.
- AC9: `'testing'` is in `EXCLUDED_SEGMENTS` and `isNonProductPath('packages/testing/code-health')` returns true.
- AC10: The pyproject.ts docstring for `[project.optional-dependencies]` no longer calls it devDependencies.
- AC11: All existing tests pass. No test count decrease.

## Edge Cases & Risks

- **Double call to `readPythonDependencies`.** scan-engine.ts calls it at line 76 (inside `detectNonNodeTesting`) and line 672 (main stack path). Both calls return the structured type — the line-76 path uses `.all`, the line-672 path uses `.production`. The line-849 "clear-and-rebuild" also calls `detectNonNodeTesting` internally — same `.all` path. All three call sites must be traced.
- **Strategy 1 cross-match.** The PEP 621 regex (`/^\s*dependencies\s*=\s*\[/m`) is not section-scoped — it could match a `dependencies` key inside `[dependency-groups]`. Currently harmless via dedup. After the split, if Strategy 1 accidentally matches a `[dependency-groups]` entry, those deps would land in `production` instead of `dev`. The regex anchors on line-leading `dependencies = [` which doesn't match typical group keys like `test = [`, so the risk is minimal. But the planner should verify with a test case that has both sections.
- **requirements.txt has no dev/production split.** Everything from requirements.txt goes to production. This is correct — requirements.txt is always production. No change needed.
- **Pipfile already separates sections** but merges them. Deferred — no Pipfile repos in test set, no false detections.
- **Poetry `group.dev` goes to production.** Deferred — no Poetry repos with false detections from dev groups in test set.

## Rejected Approaches

- **Filter by group name** (skip groups named "test", "dev", "docs" in `[dependency-groups]`). Rejected: the entire `[dependency-groups]` section is dev by PEP 735 definition. Filtering by name would be a weaker heuristic that misses custom group names like "lint" or "benchmark". The section-level split is the correct abstraction.
- **Pipfile `[dev-packages]` split in this scope.** Rejected: cheap to implement but no test repos use Pipfile. Zero evidence of false detections. Would expand scope for defensive coverage with no proven regression to fix.
- **Poetry `group.dev` split in this scope.** Rejected: same reasoning. No false detections from Poetry dev groups in the 70-repo test set.

## Open Questions

None. The requirements were validated by 3 independent agents with corrections applied. Root cause, contamination path, and fix approach verified against source code.

## Exploration Findings

### Patterns Discovered

- `parsePyprojectToml` (pyproject.ts): 5 strategies in numeric order 1, 2, 5, 3, 4. Each pushes to a shared `deps: string[]`. Strategy 5 (`[dependency-groups]`) is the only one that should route to `dev`.
- `readPythonDependencies` (python.ts): merges requirements.txt + pyproject.toml + Pipfile into one `Set<string>`. The structured return replaces the set with two buckets.
- `detectFromDependencies` (dependencies.ts:30): receives `deps` and `devDeps` as separate arrays. Currently `deps` is contaminated; `devDeps` is `Object.keys(census.devDeps)` which is empty for Python projects. After fix, `deps` will be clean production only.
- Python framework registry priority: FastAPI → Django → Flask → CLI. First match wins. Flask false-positive on fastapi repo happens because fastapi-the-library doesn't depend on fastapi-the-package.

### Constraints Discovered

- [TYPE-VERIFIED] Two independent `readPythonDependencies` call sites (scan-engine.ts:76 and :672) — both must handle the structured return.
- [TYPE-VERIFIED] Third call path via line 849 `detectNonNodeTesting` — the "clear-and-rebuild" for non-Node testing also calls `readPythonDependencies` internally.
- [OBSERVED] `detectNonNodeAiSdk(deps)` at line 830 also consumes `deps` — naturally uses production after the line-672 narrowing, no additional change needed.
- [OBSERVED] The pyproject.ts docstring at line 14 says `[project.optional-dependencies]` is "Python's equivalent of devDependencies" — factually wrong, must correct.

### Test Infrastructure

- `tests/engine/parsers/python.test.ts`: 17 tests covering all three parsers. Tests for `parsePyprojectToml` assert on flat arrays — all need updating to assert on `{ production, dev }` structure. The test at line 135 ("fastapi-style pyproject") is the ideal base for the contamination-proves-fixed test.

## For AnaPlan

### Structural Analog

`parsePipfile` in `packages/cli/src/engine/parsers/python/Pipfile.ts` — already separates `[packages]` and `[dev-packages]` with two regex matches, just merges them at the end. The pyproject split follows the same two-regex-to-two-buckets shape.

### Relevant Code Paths

- `packages/cli/src/engine/parsers/python/pyproject.ts` — the parser, 5 strategies, flat return
- `packages/cli/src/engine/parsers/python.ts` — the reader, 3 formats, flat return
- `packages/cli/src/engine/scan-engine.ts:672` — Python deps override for stack detection
- `packages/cli/src/engine/scan-engine.ts:76` — `detectNonNodeTesting`, first call
- `packages/cli/src/engine/scan-engine.ts:848-851` — `detectNonNodeTesting`, clear-and-rebuild call
- `packages/cli/src/engine/scan-engine.ts:830` — `detectNonNodeAiSdk`, consumes `deps` (already narrowed after line 672 fix)
- `packages/cli/src/engine/scan-engine.ts:748-749` — `inferPatterns`, receives `{ deps, devDeps }`, passes to `detectFromDependencies`
- `packages/cli/src/engine/detectors/framework.ts:42` — dispatches to Python registry
- `packages/cli/src/engine/detectors/python/framework-registry.ts` — FastAPI → Django → Flask → CLI
- `packages/cli/src/engine/analyzers/patterns/dependencies.ts:30` — `detectFromDependencies`, database/auth/validation detection
- `packages/cli/src/engine/detectors/surfaces.ts:60` — `EXCLUDED_SEGMENTS` set

### Patterns to Follow

- `parsePipfile` in `Pipfile.ts` — two-section regex pattern that the pyproject split mirrors
- `detectFromDependencies` signature already takes `deps` and `devDeps` separately — the split aligns with the existing interface

### Known Gotchas

- Strategy 1's PEP 621 regex is not section-scoped. After the split, verify it doesn't accidentally capture `[dependency-groups]` content into `production`. Add a test with both `[project] dependencies` and `[dependency-groups]` entries to confirm.
- The "clear-and-rebuild" at line 848-851 calls `detectNonNodeTesting` a second time. This is a THIRD call to `readPythonDependencies`. All three must return the structured type and use `.all` for testing.
- Existing test assertions (`expect(result).toContain('pytest')`) break when return type changes from `string[]` to `{ production, dev }`. Every `parsePyprojectToml` test needs updating.

### Things to Investigate

- Whether the Strategy 1 regex can match inside a `[dependency-groups]` section when the group happens to be named `dependencies`. Construct a test case: `[dependency-groups]\ndependencies = ["flask"]` and verify it lands in `dev` not `production`.
