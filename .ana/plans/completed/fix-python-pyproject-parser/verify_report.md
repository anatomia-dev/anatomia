# Verify Report: Fix Python pyproject.toml parser — 3 bugs

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/fix-python-pyproject-parser/spec.md
**Branch:** feature/fix-python-pyproject-parser

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/fix-python-pyproject-parser/.ana/plans/active/fix-python-pyproject-parser/contract.yaml
  Seal: INTACT (hash sha256:ab31cb0ac791fe72b796c6c5d5f9c093bd054e7a385274b334651cd946c9d91b)
```

Seal: **INTACT**

Tests: 2846 passed, 0 failed, 2 skipped (cli). 55 passed (website). 122 test files.
Build: ✅ success.
Lint: ✅ (1 pre-existing warning — unused eslint-disable in unrelated file).

Focused test run: `pnpm vitest run tests/engine/parsers/python.test.ts` — 24 passed (24 total).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Dependencies listed under PEP 735 dependency-groups are detected | ✅ SATISFIED | `python.test.ts:96` — `expect(result).toContain('pytest')` on `[dependency-groups]` input |
| A002 | Multiple groups within dependency-groups are all extracted | ✅ SATISFIED | `python.test.ts:99` — `expect(result.length).toBeGreaterThan(1)`, input has `test` + `docs` groups |
| A003 | Packages with extras brackets like anyio[trio] are fully parsed | ✅ SATISFIED | `python.test.ts:110` — `expect(result).toContain('anyio')` on `"anyio[trio] >=3.2.1"` input |
| A004 | Dependencies listed after an extras bracket are not truncated | ✅ SATISFIED | `python.test.ts:111` — `expect(result).toContain('httpx')` on array following `anyio[trio]` |
| A005 | Single-line dependency arrays continue to parse correctly | ✅ SATISFIED | `python.test.ts:119` — `expect(result).toContain('pytest-benchmark')` on single-line `["pytest-benchmark>=5.1.0"]` |
| A006 | Single-quoted package names are extracted the same as double-quoted | ✅ SATISFIED | `python.test.ts:129` — `expect(result).toContain('pytest')` on `'pytest>=7.0'` (single-quoted) |
| A007 | Mixed single and double quotes in the same array both work | ✅ SATISFIED | `python.test.ts:130` — `expect(result).toContain('coverage')` on `"coverage>=7.0"` in mixed-quote array |
| A008 | Fastapi-style pyproject.toml produces pytest in the dependency list | ✅ SATISFIED | `python.test.ts:157` — `expect(result).toContain('pytest')` on multi-strategy fastapi content |
| A009 | Pydantic-style pyproject.toml with single quotes produces pytest | ✅ SATISFIED | `python.test.ts:180` — `expect(result).toContain('pytest')` on single-quoted pydantic content |
| A010 | Include-group entries produce harmless phantom deps, not crashes | ✅ SATISFIED | `python.test.ts:196` — `expect(result).not.toContain('include-group')` on `{include-group = "common"}` input |
| A011 | Real package names are still extracted alongside include-group entries | ✅ SATISFIED | `python.test.ts:195` — `expect(result).toContain('pytest')` alongside include-group inline table |
| A012 | Existing PEP 621 parsing test still passes | ✅ SATISFIED | `python.test.ts:61` — `expect(result).toEqual(['fastapi', 'uvicorn'])` unchanged from baseline |
| A013 | Existing Poetry parsing test still passes | ✅ SATISFIED | `python.test.ts:69` — `expect(result).toEqual(['fastapi'])` unchanged from baseline |
| A014 | Regex tradeoff is documented in a code comment | ✅ SATISFIED | `pyproject.ts:51` — "a proper TOML parser is the right next step if more edge cases surface" |
| A015 | Strategy 1 section-scoping limitation is documented | ✅ SATISFIED | `pyproject.ts:48` — "this pattern is not section-scoped" |

## Independent Findings

**Prediction 1 (single-quote regex):** Not found. The `["']` opening and `"'` in the trailing character class is correct — single-quoted `'pytest>=7.0'` matches via `'` open → `pytest` capture → `>=` terminates.

**Prediction 2 (include-group trivial pass):** Confirmed as observation. `{include-group = "common"}` never matches `extractFromArray` because the curly-brace line doesn't start with a quote. The `not.toContain('include-group')` assertion is correct but passes trivially — it tests the absence of a string the regex structurally cannot produce. This is acceptable — the contract asks for "not crashes" and "not contains", both verified.

**Prediction 3 (A012/A013 matchers):** Not found. Both existing tests use `toEqual` with exact arrays, matching the `equals` contract matcher.

**Prediction 4 (inline comments after `]`):** Confirmed as known tradeoff. TOML allows `] # comment` but `\]\s*$` won't match that. The spec explicitly documents this as a known limitation with "proper TOML parser is the right next step." Acceptable.

**Prediction 5 (strategy numbering):** Confirmed. Strategies are numbered 1, 2, 5, 3, 4 in the source. This is because Strategy 5 was inserted between existing Strategy 2 and Strategy 3 without renumbering. Cosmetic debt.

**Production risk — Windows line endings:** `$` in multiline mode matches before `\n` but not before `\r`. A TOML file with `\r\n` endings would include `\r` in captured content. `extractFromArray` would still work since `\r` falls into the whitespace match, but it's untested. Low risk — git normalizes line endings and Python tooling predominantly uses Unix endings.

**Production risk — nested sub-tables:** A `[dependency-groups.metadata]` sub-table header would appear in the section body but wouldn't match the `group = [...]` regex (starts with `[`). Harmless.

**Over-building check:** No extra exports, no extra functions, no extra parameters. The three changes are exactly: single-quote in `extractFromArray`, `\]\s*$` anchor in three regexes, and new Strategy 5 block. Two code comments added as specified. No YAGNI concerns.

## AC Walkthrough

- **AC1:** `parsePyprojectToml` extracts dependencies from `[dependency-groups]` sections — ✅ PASS. Test at line 86-100 exercises PEP 735 format with two groups, all deps extracted.
- **AC2:** TOML arrays containing extras brackets parsed completely — ✅ PASS. Test at line 103-112 uses `"anyio[trio] >=3.2.1"` followed by `"httpx"`, both present in result.
- **AC3:** Single-line arrays continue to parse correctly — ✅ PASS. Test at line 115-120 uses `["pytest-benchmark>=5.1.0"]`, extracted correctly.
- **AC4:** Single-quoted strings extracted same as double-quoted — ✅ PASS. Test at line 123-132 mixes `'pytest>=7.0'` and `"coverage>=7.0"`, both extracted.
- **AC5:** Fastapi and pydantic real-world content produces pytest — ✅ PASS. Tests at lines 135-163 and 167-182 use representative content; `pytest` in result for both.
- **AC6:** `include-group` inline tables don't crash the parser — ✅ PASS. Test at line 185-197 includes `{include-group = "common"}` alongside real deps; no crash, `include-group` absent from result.
- **AC7:** Existing tests continue to pass unchanged — ✅ PASS. Lines 57-83 are the original 4 tests; all 4 pass. Verified via `git diff` that these lines are unmodified.
- **AC8:** Code comments document the regex tradeoff and Strategy 1 note — ✅ PASS. `pyproject.ts:48` has the section-scoping note, `pyproject.ts:51` has the TOML parser tradeoff.

## Blockers

No blockers. All 15 contract assertions satisfied. All 8 acceptance criteria pass. No regressions (2846 tests vs 2837 baseline — 9 new tests, 0 failures). Checked for: unused exports in new code (none — no new exports), unused parameters (none — all function params used), error paths that silently swallow (engine catch blocks are pre-existing, not introduced), external assumptions (pure function, no env vars or file I/O).

## Findings

- **Code — Strategy numbering gap (1, 2, 5, 3, 4):** `packages/cli/src/engine/parsers/python/pyproject.ts:80` — Strategy 5 inserted between Strategy 2 and Strategy 3 without renumbering. Cosmetic — the numbers are comment labels only, not functional. Renumbering would create a noisier diff for no behavioral change.

- **Code — Inline TOML comments after `]` would break `\]\s*$` anchor:** `packages/cli/src/engine/parsers/python/pyproject.ts:52` — A line like `"httpx>=0.24.0",\n] # end of deps` won't match because `# end of deps` follows `]`. Documented in-code as a known tradeoff with "proper TOML parser" as the next step. Acceptable for current scope.

- **Code — Windows `\r\n` line endings untested:** `packages/cli/src/engine/parsers/python/pyproject.ts:52` — `$` in `m` mode matches before `\n` only. `\r` would be included in captured content. `extractFromArray` still works (the `\r` matches `\s` in the trailing class), but no test exercises this path. Low risk — git normalizes line endings.

- **Test — A010 include-group exclusion is structurally trivial:** `packages/cli/tests/engine/parsers/python.test.ts:185` — `{include-group = "common"}` can never produce `"include-group"` in results because curly-brace lines don't start with a quote character. The assertion `not.toContain('include-group')` is correct but doesn't distinguish between "actively excluded" and "never matched." Acceptable — the contract asks for non-crash and absence.

- **Test — No malformed TOML input test for dependency-groups:** `packages/cli/tests/engine/parsers/python.test.ts:199` — The empty section test is good but there's no test for malformed array bodies (unclosed brackets, garbage between groups). The existing `returns empty array for invalid TOML` test (line 79) covers the general case, but doesn't specifically exercise Strategy 5's resilience.

## Deployer Handoff

This is a pure parser fix — no CLI behavior changes, no config changes, no new dependencies. The three bugs fixed (PEP 735 missing, extras bracket truncation, single-quote ignorance) all affect Python project scanning. After merge, any `ana scan` on a Python project with `[dependency-groups]`, extras brackets, or single-quoted deps will produce correct results.

The strategy numbering (1, 2, 5, 3, 4) is intentional — renumbering was avoided to minimize diff noise. Future developers should not assume strategy numbers are sequential.

The regex-based TOML parsing is acknowledged as a tradeoff in code comments. If new edge cases surface (inline comments, complex nested tables), the next step is a proper TOML parser library.

## Verdict

**Shippable:** YES

All 15 contract assertions satisfied. All 8 acceptance criteria pass. 9 new tests added, 0 regressions. The implementation is clean, minimal, and exactly scoped to the three bugs specified. Findings are observations and cosmetic debt — nothing that prevents shipping.
