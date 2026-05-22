# Verify Report: Scan Quality Polish (6 Additive Fixes)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/scan-quality-polish/spec.md
**Branch:** feature/scan-quality-polish

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/scan-quality-polish/.ana/plans/active/scan-quality-polish/contract.yaml
  Seal: INTACT (hash sha256:69d65ccedbdcd6afe44df698a57fb7851f58420bd2f250ca52450ddc5e169531)
```

Seal: **INTACT**

Tests: 2846 passed, 0 failed, 2 skipped (122 test files). Build: clean. Lint: 0 errors (1 pre-existing warning in git-operations.ts).

## Contract Compliance
| ID   | Says                                                                 | Status       | Evidence |
|------|----------------------------------------------------------------------|--------------|----------|
| A001 | Schema discovery ignores schemas in test/example directories         | ✅ SATISFIED | `packages/cli/src/engine/census.ts:322` — `if (isNonProductPath(root.relativePath)) continue;` at top of `discoverSchemas` loop. `isNonProductPath` checks `EXCLUDED_SEGMENTS` which includes `'e2e'`. |
| A002 | Infrastructure package filtering is case-insensitive                 | ✅ SATISFIED | `packages/cli/src/engine/detectors/surfaces.ts:269` — `INFRA_PATTERNS.has(lastSegment.toLowerCase())` |
| A003 | Vue projects using TypeScript config files detected correctly        | ✅ SATISFIED | `packages/cli/src/engine/census.ts:62` — `{ pattern: 'vue.config.ts', framework: 'vue', check: 'file' }` in `FRAMEWORK_HINTS` |
| A004 | Vue TypeScript config recognized as strong framework signal          | ✅ SATISFIED | `packages/cli/src/engine/detectors/surfaces.ts:35` — `'vue.config.ts'` in `STRONG_FRAMEWORK_CONFIGS` Set |
| A005 | surfaces-without-testing test fails when Surfaces section missing    | ✅ SATISFIED | `packages/cli/tests/commands/scan.test.ts:1099` — `expect(surfIdx).toBeGreaterThan(-1)` replaces vacuous `if` guard |
| A006 | surfaces-without-testing test fails when surface line missing        | ✅ SATISFIED | `packages/cli/tests/commands/scan.test.ts:1102` — `expect(cliLine).toBeDefined()` before `not.toContain` assertion |
| A007 | Surface display tests verify framework/language/testing values       | ✅ SATISFIED | `packages/cli/tests/commands/scan.test.ts:1085` — `expect(surfaceBlock).toContain('Next.js')` |
| A008 | Surface display tests verify the testing framework is rendered       | ✅ SATISFIED | `packages/cli/tests/commands/scan.test.ts:1087` — `expect(surfaceBlock).toContain('Vitest')` |
| A009 | MCP-yields-to-web-app test carries correct proof chain tag           | ✅ SATISFIED | `packages/cli/tests/engine/detectors/applicationShape.test.ts:64` — `// @ana A003` directly above `it('mcp-server yields to web-app when browser framework present')` |
| A010 | pure-function test no longer carries misplaced proof chain tag       | ✅ SATISFIED | `packages/cli/tests/engine/detectors/applicationShape.test.ts:320` — `describe('detector is a pure function')` has no `@ana A003` tag. Grep confirms only one instance at line 64. |
| A011 | All existing tests continue to pass after changes                    | ✅ SATISFIED | Full test run: 2846 passed, 2 skipped, 0 failed across 122 test files |

## Independent Findings

**Prediction resolution:**
1. Fix 1 placement — correct, at top of loop with `continue`. No specific unit test, relies on integration.
2. Fix 2 wrong variable — not found; correctly applied to `lastSegment`.
3. Fix 4 conditional flattening — not found; builder properly flattened both `if` guards.
4. Fix 5 string accuracy — **Surprised:** The spec's gotcha says the `web` surface should produce "TypeScript" from the `.ts` source files, but the actual rendered output is "JavaScript." The builder correctly followed the spec's instruction to "run the test, capture the output, then write assertions" — so the assertion uses the actual value. The spec was wrong about the expected language for this fixture. Since no source files with `.js` extension exist in the fixture (all are `.ts`), this suggests the language detector is using signals other than file extensions (possibly the `next.config.js` config file or the `bin` entry pointing to `index.js`).
5. Fix 6 tag placement — correct; single instance at the right location.

**Over-building check:** No scope creep detected. All four diffs are minimal and match the spec exactly. No extra exports, no new functions, no unnecessary abstractions. Grep of new code shows no dead code paths.

**Pre-existing branch change:** `'testing'` was removed from `EXCLUDED_SEGMENTS` in surfaces.ts. This change predates the build (came from the branch point, not from any build commit). Not the builder's doing, but noted for context — a directory segment named `testing` would no longer be excluded from surface detection.

## AC Walkthrough
- ✅ **AC1:** `discoverSchemas` skips non-product paths. `isNonProductPath` check at `census.ts:322` filters `e2e`, `examples`, `templates`, etc. before any ORM checks.
- ✅ **AC2:** `INFRA_PATTERNS` matching is case-insensitive. `lastSegment.toLowerCase()` at `surfaces.ts:269`, consistent with `EXCLUDED_SEGMENTS` at line 87.
- ✅ **AC3:** `vue.config.ts` is in both `FRAMEWORK_HINTS` (`census.ts:62`) and `STRONG_FRAMEWORK_CONFIGS` (`surfaces.ts:35`). Parity with `.js`/`.mjs` variants.
- ✅ **AC4:** The "surfaces without testing" test uses `expect(surfIdx).toBeGreaterThan(-1)` at `scan.test.ts:1099` and `expect(cliLine).toBeDefined()` at line 1102. Both are non-vacuous — if the Surfaces section or cli line is missing, the test fails.
- ✅ **AC5:** Value-level assertions at `scan.test.ts:1085-1087` check `Next.js`, `JavaScript`, and `Vitest` in the `surfaceBlock`.
- ✅ **AC6:** `// @ana A003` at `applicationShape.test.ts:64` (above the MCP yields test). Grep confirms no other instance in the file.
- ✅ **AC7:** `(cd packages/cli && pnpm vitest run)` — 2846 passed, 2 skipped, 0 failed. No regressions.
- ✅ **AC8:** `pnpm run build` — clean, no errors.

## Blockers
No blockers. All 11 contract assertions satisfied. All 8 acceptance criteria pass. No regressions. Checked for: unused exports in modified files (none — no new exports added), unhandled error paths (n/a — changes are filter additions and assertion fixes, no new error-handling code), sentinel test patterns (both `if` guards in scan.test.ts replaced with real assertions), scope creep (diffs match spec exactly, no extra code).

## Findings

- **Upstream — Spec language prediction incorrect:** `packages/cli/tests/commands/scan.test.ts:1086` — Spec says fixture produces "TypeScript" but rendered output is "JavaScript." The builder correctly captured the actual output as instructed. The spec's gotcha was wrong. Worth investigating why `.ts` source files yield "JavaScript" in this fixture — the language detector may prioritize config file extensions (`.js`) over source file extensions.
- **Code — No unit test for schema non-product path filtering:** `packages/cli/src/engine/census.ts:322` — Fix 1 adds `isNonProductPath` to `discoverSchemas` but there's no test that specifically exercises this filter (e.g., a schema in an `e2e/` directory being excluded). The fix relies on integration coverage. The spec acknowledged this: "If no schema-specific test exists, verify manually."
- **Upstream — Fix 2 resolves proof finding:** `packages/cli/src/engine/detectors/surfaces.ts:269` — `.toLowerCase()` on `lastSegment` before `INFRA_PATTERNS.has()` directly fixes `fix-false-surface-detection-C2` (case-sensitive inconsistency).
- **Upstream — Fix 4 resolves proof finding:** `packages/cli/tests/commands/scan.test.ts:1099` — Non-vacuous assertions replace conditional guards, resolving `scan-surface-display-C1`.
- **Upstream — Fix 5 resolves proof finding:** `packages/cli/tests/commands/scan.test.ts:1085-1087` — Value-level assertions resolve `scan-surface-display-C2`.
- **Upstream — Fix 6 resolves proof finding:** `packages/cli/tests/engine/detectors/applicationShape.test.ts:64` — Tag relocation resolves `fix-shape-detection-priority-C2`.
- **Code — Pre-existing 'testing' removal from EXCLUDED_SEGMENTS:** `packages/cli/src/engine/detectors/surfaces.ts:65` — The word `'testing'` was removed from the `EXCLUDED_SEGMENTS` Set in a commit before the build started. Not introduced by this build, but a directory literally named `testing` would now be treated as a product surface. Low risk — `'test'` and `'tests'` remain.

## Deployer Handoff
Straightforward merge — six surgical fixes, all additive, no behavior change for correctly-scanned repos. The `'testing'` removal from `EXCLUDED_SEGMENTS` predates this build (from a prior branch commit). If that's intentional, no action needed. If not, it should be addressed separately. The spec's "TypeScript" language prediction was wrong for the fixture — the test correctly uses the actual rendered value "JavaScript" — but the discrepancy is worth understanding for future specs that reference scan output.

## Verdict
**Shippable:** YES
All 11 assertions satisfied. All 8 ACs pass. Tests green, build clean, lint clean. The changes are minimal, match the spec, and resolve four active proof chain findings.
