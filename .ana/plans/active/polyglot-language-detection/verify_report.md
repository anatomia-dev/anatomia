# Verify Report: Polyglot Language Detection

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-17
**Spec:** .ana/plans/active/polyglot-language-detection/spec.md
**Branch:** feature/polyglot-language-detection

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/polyglot-language-detection/.ana/plans/active/polyglot-language-detection/contract.yaml
  Seal: INTACT (hash sha256:a9af3f25e9f60a2a118d6e8aa402dba9f3d7962116778a1387f7fbcf28213c08)
```

Tests: 2423 passed, 2 skipped (2425 total), 107 test files. Build: ⚡️ success. Lint: 0 errors (1 pre-existing warning — unused eslint-disable directive).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Python project with frontend tooling detects as Python | ✅ SATISFIED | `polyglot.test.ts:36-50`, asserts `result.type === 'python'` and `confidence === 0.90` |
| A002 | Standard Node project with lockfile still detects as Node | ✅ SATISFIED | `polyglot.test.ts:53-62`, asserts `result.type === 'node'` |
| A003 | Standard Node projects retain full confidence | ✅ SATISFIED | `polyglot.test.ts:61`, asserts `result.confidence === 0.95` |
| A004 | Monorepo with workspaces detects as Node regardless of pyproject.toml | ✅ SATISFIED | `polyglot.test.ts:65-80`, creates workspaces + pyproject.toml with deps, asserts `type === 'node'` |
| A005 | Poetry-based Python projects correctly identified | ✅ SATISFIED | `polyglot.test.ts:99-114`, Poetry format deps, asserts `type === 'python'` |
| A006 | No lockfile + pyproject.toml detects as Python | ✅ SATISFIED | `polyglot.test.ts:117-129`, asserts `type === 'python'` |
| A007 | No lockfile + pyproject.toml gets confidence 0.85 | ✅ SATISFIED | `polyglot.test.ts:128`, asserts `confidence === 0.85` |
| A008 | Bare package.json without lockfile gets reduced confidence | ✅ SATISFIED | `polyglot.test.ts:132-140`, asserts `confidence === 0.70` |
| A009 | Tooling-only pyproject.toml does not flip type to Python | ✅ SATISFIED | `polyglot.test.ts:143-158`, creates `[tool.ruff]` + `[tool.black]` only, asserts `type === 'node'` |
| A010 | Malformed pyproject.toml falls through safely | ✅ SATISFIED | `polyglot.test.ts:161-171`, writes invalid content, asserts `type === 'node'` |
| A011 | Bun 1.2 text-based lockfile recognized | ✅ SATISFIED | `polyglot.test.ts:174-184`, creates `bun.lock`, asserts `indicators.toContain('bun.lock')` |
| A012 | Python framework detection works after type flip | ✅ SATISFIED | `polyglot.test.ts:203-229`, verifies `detectFramework(pythonDeps, 'python', [])` returns `fastapi` and node deps don't |
| A013 | Lockfile invariant: pnpm-lock.yaml | ✅ SATISFIED | `projectType.test.ts:198-207`, asserts `type === 'node'` and `confidence === 0.95` |
| A014 | Lockfile invariant: package-lock.json | �� SATISFIED | `projectType.test.ts:209-219`, asserts `type === 'node'` and `confidence === 0.95` |
| A015 | Lockfile invariant: yarn.lock | ✅ SATISFIED | `projectType.test.ts:221-231`, asserts `type === 'node'` and `confidence === 0.95` |
| A016 | Lockfile invariant: bun.lockb | ✅ SATISFIED | `projectType.test.ts:233-243`, asserts `type === 'node'` and `confidence === 0.95` |
| A017 | Lockfile invariant: bun.lock | ✅ SATISFIED | `projectType.test.ts:245-255`, asserts `type === 'node'` and `confidence === 0.95` |
| A018 | Empty dependencies array does not count as Python | ✅ SATISFIED | `polyglot.test.ts:187-200`, writes `dependencies = []`, asserts `type === 'node'` |
| A019 | Bare package.json still detects as Node | ✅ SATISFIED | `polyglot.test.ts:132-138`, asserts `type === 'node'` |

## Independent Findings

**Prediction resolution:**
1. *Regex too greedy/loose* — NOT FOUND. The regex anchors `[project]` to start-of-line with `^...$` multiline, scopes search to next section header, then requires quoted entries in the array. Well-constructed.
2. *Empty deps edge case weak* — NOT FOUND. Test at line 187 writes `dependencies = []` and the regex `["'][^"']+["']` correctly requires at least one quoted string.
3. *Workspaces object format missed* — NOT FOUND. There's an extra test (line 82-97) covering `{ packages: [...] }` format, and the code checks `pkg['workspaces'] !== undefined` which handles both.
4. *frameworkDeps test doesn't test the ternary* — CONFIRMED (partial). The test proves the detector cascade works, but doesn't exercise the scan-engine.ts conditional directly. See Findings.
5. *bun.lock indicator without file* — NOT FOUND. Test creates the actual file.

**Production risk check:** The `readFile` calls correctly specify `'utf-8'` encoding. The `catch` blocks around `readFile` handle EACCES/ENOENT. The `hasPythonProjectDeps` function has its own try/catch returning false on any error.

**Over-building check:** `hasPythonProjectDeps` is internal (not exported). No unused parameters. No extra code paths beyond what the spec describes. The Yarn-format workspaces test is extra but reasonable defensive coverage.

## AC Walkthrough
- **AC1:** ✅ PASS — Test `polyglot.test.ts:36-50` creates this exact scenario and passes.
- **AC2:** ✅ PASS — Test `polyglot.test.ts:53-62` and lockfile invariant tests confirm this.
- **AC3:** ✅ PASS — Test `polyglot.test.ts:65-80` plus Yarn format test at line 82.
- **AC4:** ✅ PASS — Test `polyglot.test.ts:117-129`, confidence 0.85 asserted.
- **AC5:** ✅ PASS — Test `polyglot.test.ts:132-140`, confidence 0.70 asserted.
- **AC6:** ✅ PASS — Test `polyglot.test.ts:143-158` creates tooling-only pyproject, stays Node.
- **AC7:** ✅ PASS — This repo has `package.json` + `pnpm-lock.yaml`, no `pyproject.toml`. The Tier 1 fast path applies. Confirmed files exist in worktree. Lockfile invariant test A013 covers this exact combo.
- **AC8:** ✅ PASS — Test `polyglot.test.ts:203-229` proves Python deps flow to framework detection. The scan-engine.ts ternary (line 675) adds the `&& projectTypeResult.type === 'node'` guard. When type is 'python', it falls to `deps` instead of monorepo primaryDeps.
- **AC9:** ✅ PASS — Lockfile invariant tests exist in `projectType.test.ts:196-255` for all 5 lockfile types.
- **AC10:** ✅ PASS — 2423 tests pass (baseline was 2405 + ~18 new = 2423). The bare package.json test now asserts 0.70.
- **AC11:** ✅ PASS — `bun.lock` check at `projectType.ts:96`, test at `polyglot.test.ts:174-184`.
- **Tests pass:** ✅ PASS — 2423 passed, 2 skipped, 0 failures.
- **No build errors:** ✅ PASS — Build success in 32ms.

## Blockers

None. All 19 contract assertions satisfied. All 13 acceptance criteria pass. No regressions (2423 tests vs 2405 baseline — 18 net new). No unused exports in new code (hasPythonProjectDeps is internal). No unhandled error paths (both readFile calls wrapped in try/catch). No assumptions about external state beyond filesystem access (which is the function's purpose).

## Findings

- **Test — A012 cascade test doesn't exercise the scan-engine ternary:** `packages/cli/tests/engine/detectors/polyglot.test.ts:203` — The test proves `detectFramework(pythonDeps, 'python', [])` returns `'fastapi'`, which validates the detector-level cascade works. But the actual fix (scan-engine.ts:675 adding `&& projectTypeResult.type === 'node'`) is verified only by source inspection, not behavioral test. The contract's `not_contains` matcher on `frameworkDeps` is satisfied because the test proves react isn't used when Python deps are passed — reasonable for a unit test, but leaves the integration path untested.

- **Code — nextSection indexOf('\n[') misses section at slice start:** `packages/cli/src/engine/detectors/projectType.ts:41` — If `[project]` is the LAST section header in the file, `nextSection` correctly returns -1 and the code slices to end. But if a subsequent section starts immediately at position 0 of the slice (no preceding newline), `indexOf('\n[')` would miss it. In practice this is impossible — `projectStart` includes the matched header's length + whitespace, so there's always content before the next `[`. Dormant, not harmful.

- **Upstream — Workspaces confidence (0.90) lower than lockfile-only (0.95):** The spec defines Tier 2 (workspaces) at 0.90 and Tier 1 (lockfile, no pyproject) at 0.95. A monorepo with workspaces AND a lockfile gets 0.90 — lower than a simple project with just a lockfile. This is counterintuitive: monorepos are MORE definitively Node, not less. The implementation faithfully matches the spec. Worth revisiting if confidence values are ever exposed to users.

- **Code — Tier 4 fallback indistinguishable from Tier 5:** `packages/cli/src/engine/detectors/projectType.ts:146` — When pyproject.toml exists but has no real deps (Tier 4 fallback), confidence is 0.70 — the same as bare package.json without any competing manifest (Tier 5). Downstream consumers can't distinguish "pyproject exists but is tooling-only without a lockfile" from "bare package.json alone." Not a bug per the spec, but a potential signal loss.

## Deployer Handoff

Clean merge expected. The changes are confined to two source files (projectType.ts, scan-engine.ts one-line fix) and two test files (one modified, one new). No new dependencies. No config changes. The pre-existing lint warning (unused eslint-disable in an unrelated file) is not introduced by this build.

The build adds ~18 new tests in a new file (polyglot.test.ts) and modifies one assertion (confidence 0.95 → 0.70) in the existing projectType.test.ts. Baseline test count grew from 2405 to 2423.

## Verdict
**Shippable:** YES

All 19 contract assertions satisfied. All acceptance criteria pass. Tests green, build clean, no regressions. The implementation is focused — no over-building, no unnecessary exports, proper error handling. The tiered heuristic is clear and well-ordered. Findings are all observational (confidence semantics, integration test depth) — none block shipping.
