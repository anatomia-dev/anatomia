# Verify Report: Separate Python production deps from dev deps

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-python-dep-separation/spec.md
**Branch:** feature/fix-python-dep-separation

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/fix-python-dep-separation/.ana/plans/active/fix-python-dep-separation/contract.yaml
  Seal: INTACT (hash sha256:ed8c7fe47c207733dd9c5e735a864ebd2e57266b50613dc8dfac00f731fe669f)
```

Seal: **INTACT**

Build: ✅ (2 tasks successful)
Tests: 2856 passed, 2 skipped (baseline was 2846 — +10 new tests)
Lint: ✅ (0 errors, 1 pre-existing warning — unused eslint-disable directive)

## Contract Compliance

| ID   | Says                                                                  | Status        | Evidence |
|------|-----------------------------------------------------------------------|---------------|----------|
| A001 | PEP 621 production dependencies land in the production bucket         | ✅ SATISFIED  | `python.test.ts:67` — `expect(result.production).toContain('fastapi')` |
| A002 | PEP 735 dependency-groups land in the dev bucket, not production      | ✅ SATISFIED  | `python.test.ts:111` — `expect(result.dev).toContain('pytest')` |
| A003 | PEP 735 dependencies never contaminate the production list            | ✅ SATISFIED  | `python.test.ts:114` — `expect(result.production).not.toContain('pytest')` |
| A004 | Optional dependencies are production extras, not dev                  | ✅ SATISFIED  | `python.test.ts:132` — `expect(result.production).toContain('httpx')` |
| A005 | Poetry main dependencies land in production                           | ✅ SATISFIED  | `python.test.ts:78` — `expect(result.production).toContain('fastapi')` |
| A006 | Poetry group dependencies land in production (deferred split)         | ✅ SATISFIED  | `python.test.ts:88` — `expect(result.production).toContain('pytest')` |
| A007 | The combined reader provides both production and all-deps views       | ✅ SATISFIED  | `python.test.ts:375` — `expect(result.production).toBeDefined()` (contract matcher: `exists`) |
| A008 | All-deps includes both production and dev dependencies                | ✅ SATISFIED  | `python.test.ts:380` — `expect(result.all).toContain('pytest')` |
| A009 | Flask in dev dependency-groups does not contaminate framework detection| ✅ SATISFIED  | `python.test.ts:265` — `expect(result.production).not.toContain('flask')` |
| A010 | Flask correctly appears in the dev bucket when in dependency-groups   | ✅ SATISFIED  | `python.test.ts:266` — `expect(result.dev).toContain('flask')` |
| A011 | SQLAlchemy in dev dependency-groups does not contaminate database detection | ✅ SATISFIED | `python.test.ts:284` — `expect(result.production).not.toContain('sqlalchemy')` |
| A012 | SQLAlchemy correctly appears in the dev bucket when in dependency-groups | ✅ SATISFIED | `python.test.ts:285` — `expect(result.dev).toContain('sqlalchemy')` |
| A013 | pytest in dependency-groups is still detected for testing             | ✅ SATISFIED  | `python.test.ts:380` — `expect(result.all).toContain('pytest')` via readPythonDependencies |
| A014 | FastAPI in production dependencies still produces correct framework detection | ✅ SATISFIED | `python.test.ts:318` — `expect(result.production).toContain('fastapi')` |
| A015 | Directories named testing are excluded from surface detection         | ✅ SATISFIED  | `python.test.ts:351` — `expect(isNonProductPath('packages/testing/code-health')).toBe(true)` |
| A016 | The optional-dependencies docstring no longer calls them devDependencies | ✅ SATISFIED | `python.test.ts:344` — `expect(source).not.toContain('devDependencies')` (enforcement test) |
| A017 | Empty dependency-groups returns empty dev array                       | ✅ SATISFIED  | `python.test.ts:231-232` — `expect(result.dev).toEqual([])` |
| A018 | Invalid TOML returns empty production and dev arrays                  | ✅ SATISFIED  | `python.test.ts:96` — `expect(result.production).toEqual([])` |
| A019 | A dependency-group named 'dependencies' is handled without crashing   | ✅ SATISFIED  | `python.test.ts:333-335` — `expect(result.dev).toContain('pytest')`, no crash |

19/19 SATISFIED.

## Independent Findings

**Predictions resolved:**

1. **Strategy 1 cross-match (predicted problem):** Not found. The builder investigated and discovered `match()` returns only the first occurrence, so a `[dependency-groups]` group literally named `dependencies` does NOT cross-match into production. Test at line 322-336 documents this with an accurate comment. The spec's Gotchas section predicted cross-match that doesn't occur.

2. **detectNonNodeTesting destructuring (predicted awkwardness):** Not found. Clean implementation: `const pythonResult = await readPythonDependencies(rootPath); pythonResult.all.includes('pytest')`.

3. **Edge case weak assertions (predicted):** Not found. Both A017 and A018 use `toEqual([])` — specific value assertions, not existence checks.

4. **Docstring fix incomplete (predicted):** Not found. Lines 13-14 now read "production extras — what users install with `pip install package[extra]`" — accurate and clear.

5. **Poetry deferred split confusion (predicted):** Not found. A006 correctly asserts `result.production` per the scope decision to defer Poetry dev separation.

**Production risk check:** If `readPythonDependencies` throws, the catch block at scan-engine.ts:681 catches before assignment — `deps` stays as `Object.keys(census.allDeps)`. The structured return type doesn't change error behavior. Safe.

**Over-building check:** No new exports added. No new files created. No unused parameters in new code. No unnecessary abstractions — the two-array pattern is the minimum viable change. The `extractFromArray` helper was already present and reused cleanly.

**What I didn't predict:** `readPythonDependencies` is called twice for Python projects during a single scan — once at line 673 for production deps feeding stack detection, and again at line 76 inside `detectNonNodeTesting` for the `.all` list. Both perform fresh filesystem reads. This is existing behavior (not introduced by this build), but the structured return makes the duplication more visible.

## AC Walkthrough

- [x] **AC1** ✅ PASS — `parsePyprojectToml` returns `{ production: string[], dev: string[] }` (pyproject.ts:27, line 139-142). Dependency-groups land in `dev` (line 99), all other strategies in `production` (lines 56, 77, 116, 133).
- [x] **AC2** ✅ PASS — `readPythonDependencies` returns `{ production: string[], all: string[] }` (python.ts:23, line 67). `all` computed as deduped union (line 65).
- [x] **AC3** ✅ PASS — scan-engine.ts:674: `deps = pythonDeps.production` — stack detection (framework, database, auth, AI SDK) receives production-only deps.
- [x] **AC4** ✅ PASS — scan-engine.ts:78: `pythonResult.all.includes('pytest')` — testing detection uses `.all`. Called at both line 76 (direct) and line 852 (clear-and-rebuild via `detectNonNodeTesting`).
- [x] **AC5** ✅ PASS — Test at python.test.ts:251-267: Flask in `[dependency-groups].tests` with starlette in `[project] dependencies` → production contains starlette, does NOT contain flask.
- [x] **AC6** ✅ PASS — Test at python.test.ts:269-286: SQLAlchemy in `[dependency-groups].dev` → production does NOT contain sqlalchemy.
- [x] **AC7** ✅ PASS — Test at python.test.ts:289-303: pytest in `[dependency-groups].test` → `result.dev` contains pytest → flows to `result.all` at readPythonDependencies level (verified at line 380).
- [x] **AC8** ✅ PASS — Test at python.test.ts:305-320: FastAPI in `[project] dependencies` → `result.production` contains fastapi.
- [x] **AC9** ✅ PASS — `'testing'` in EXCLUDED_SEGMENTS (surfaces.ts:65). Test at python.test.ts:351: `isNonProductPath('packages/testing/code-health')` returns true.
- [x] **AC10** ✅ PASS — pyproject.ts:13-14 reads "production extras" not "devDependencies". Enforcement test at python.test.ts:344.
- [x] **AC11** ✅ PASS — 2856 tests pass (baseline 2846, +10 new). No test count decrease.
- [x] **AC12** ✅ PASS — `(cd 'packages/cli' && pnpm vitest run)` — 122 test files passed, 2856 tests passed.
- [x] **AC13** ✅ PASS — `pnpm run build` — 2 tasks successful, no errors.

13/13 ACs pass.

## Blockers

No blockers. All 19 contract assertions satisfied. All 13 acceptance criteria pass. Tests pass with +10 net new (no decrease). Build clean. Lint clean (0 errors). Checked: no unused parameters in new code (pyproject.ts `extractFromArray` and main function both use all params), no unhandled error paths (catch blocks in python.ts lines 34, 48, 59 all fall through correctly with new structured return), no assumptions about external state (filesystem access already guarded by `exists()` checks), no dead code blocks (every `if` branch in pyproject.ts serves a distinct strategy, every Set in python.ts feeds the return value).

## Findings

- **Code — Duplicate filesystem reads for Python deps:** `packages/cli/src/engine/scan-engine.ts:76` and `:673` — `readPythonDependencies` called twice per scan, both reading pyproject.toml from disk. Pre-existing behavior amplified by the structured return. A future optimization would cache the result or pass it through.

- **Code — Strategy ordering breaks numeric sequence:** `packages/cli/src/engine/parsers/python/pyproject.ts:82` — Strategy 5 (dependency-groups → dev) is placed between Strategies 2 and 3 in the code, making the comment numbering read 1, 2, 5, 3, 4. The placement is logical (PEP strategies together before Poetry), but the numbering is confusing for a reader expecting sequential order.

- **Upstream — Spec Gotchas cross-match prediction inaccurate:** The spec predicted Strategy 1 would cross-match a dependency-group named `dependencies` into production. Builder correctly identified that `match()` returns only the first occurrence, so no cross-match occurs. The spec's Gotchas section should be updated if referenced again.

- **Code — TOML inline comment fragility still present:** `packages/cli/src/engine/parsers/python/pyproject.ts:54` — `]\s*$` anchor breaks on `] # end-of-deps` style comments. Known from prior cycle (fix-python-pyproject-parser-C2). Not addressed by this build (out of scope), still active.

- **Test — A013 indirect proxy at parser level:** `packages/cli/tests/engine/parsers/python.test.ts:289` — The parser-level test for A013 checks `result.dev` as a proxy for "will flow into `.all`." The actual `.all` assertion exists at the readPythonDependencies level (line 380), so coverage is complete — but the parser-level `@ana A013` tag is on a test that doesn't directly verify the contract target (`result.all`).

## Deployer Handoff

This is a pure engine change — no CLI interface changes, no config changes, no migration steps. The `parsePyprojectToml` return type changed from `string[]` to `{ production: string[], dev: string[] }`, and `readPythonDependencies` changed from `Promise<string[]>` to `Promise<{ production: string[], all: string[] }>`. Both callers in scan-engine.ts are updated. No external consumers of these functions exist outside the CLI package.

After merge, Python project scans will correctly exclude dev-only dependencies from stack detection. Projects like FastAPI (Flask in test fixtures) and Pydantic (SQLAlchemy in dev deps) will no longer produce false framework/database detections. Testing detection (pytest/unittest) is unaffected — it reads from the `.all` list.

The `'testing'` addition to EXCLUDED_SEGMENTS means directories named `testing/` will now be excluded from surface detection, matching existing behavior for `test/` and `tests/`.

## Verdict

**Shippable:** YES

19/19 contract assertions satisfied. 13/13 acceptance criteria pass. 2856 tests pass (+10 from baseline). Build and lint clean. The implementation is minimal and correct — two arrays where there was one, propagated through two callers, with 10 new tests proving the contamination fix works. The Strategy 1 cross-match the spec worried about doesn't occur. No over-building, no dead code, no unused exports.