# Verify Report: Fix Risk Findings

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-25
**Spec:** .ana/plans/active/fix-risk-findings/spec.md
**Branch:** feature/fix-risk-findings

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-risk-findings/contract.yaml
  Seal: INTACT (hash sha256:b99d11570f45a2c8d08b3e878364967cadb3bf693be2d0d6455fc920b9182ffc)
```

Tests: 2921 passed, 0 failed, 2 skipped (124 test files). Build: success (CLI + website). Lint: 0 errors, 3 warnings (all pre-existing: unused vars in Hero.tsx, unused eslint-disable in git-operations.ts).

## Contract Compliance

| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Surface commands escape single quotes in directory paths | ✅ SATISFIED | `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts:153` — `expect(cmds['build']).toBe("(cd 'it'\\''s-here' && pnpm run build)")` |
| A002 | Every generated command type uses the escaped path | ✅ SATISFIED | `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts:155-156` — test, lint commands both assert escaped path |
| A003 | Paths without single quotes produce unchanged command strings | ✅ SATISFIED | `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts:178` — `expect(cliCmds['build']).toBe("(cd 'packages/cli' && pnpm run build)")` |
| A004 | Escaped path only affects the cd target, not the rest of the command | ✅ SATISFIED | `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts:158` — `expect(cmds['test']).toContain('&& pnpm run test)')` |
| A005 | Backfill guard uses explicit null check instead of falsy coercion | ✅ SATISFIED | `packages/cli/src/commands/work.ts:1101` — source contains `existing.surface === undefined \|\| existing.surface === null` |
| A006 | Backfill guard no longer matches empty-string surfaces | ✅ SATISFIED | `packages/cli/src/commands/work.ts` — grep confirms zero occurrences of `!existing.surface` |
| A007 | A type restricts which stat keys the component accepts | ✅ SATISFIED | `website/lib/docs-data/docsStatValues.ts:10` — `export type DocsStatKey` |
| A008 | The stat key type covers all nine valid statistics | ✅ SATISFIED | `website/lib/docs-data/docsStatValues.ts:11-19` — 9 union members: proofCount, rejections, findings, skillCount, gotchaCount, medianThink, medianPlan, medianBuild, medianVerify |
| A009 | The component prop accepts the narrowed type instead of any string | ✅ SATISFIED | `website/components/docs/content/DocsStat.tsx:8` — `value: DocsStatKey` |
| A010 | The runtime fallback is kept for unrecognized keys from MDX | ✅ SATISFIED | `website/components/docs/content/DocsStat.tsx:34` — `{values[value] ?? value}` |
| A011 | All existing tests continue to pass after the changes | ✅ SATISFIED | 2921 passed > 2918 threshold |
| A012 | The website builds successfully with the narrowed type | ✅ SATISFIED | `pnpm run build` exited 0, website build completed with all pages rendered |

## Independent Findings

**Predictions resolved:**

1. *"Escape test string matching could be wrong due to escaping layers"* — Not found. The test at line 153 uses `toBe` with a correctly escaped string. The JS literal `"(cd 'it'\\''s-here' && pnpm run build)"` correctly represents the shell output `(cd 'it'\''s-here' && pnpm run build)`. Verified by reading the test and matching against the POSIX idiom.

2. *"A005/A006 have no behavior test, only source inspection"* — Confirmed. The contract targets `sourceCode`, so inspection is the correct verification method. But there's no test proving that an empty-string surface survives backfill unchanged. This is tech debt, not a blocker.

3. *"DocsStatKey might not cover all 9 keys"* — Not found. Counted all 9, cross-referenced against `buildDocsStatValues` input fields. Perfect 1:1 correspondence.

4. *"The ?? value fallback silently renders garbage for MDX typos"* — Confirmed as design-accepted. The spec explicitly calls for this: "defense-in-depth for MDX (which is not type-checked by fumadocs)." The fallback renders the raw key, which is visible but not a crash. Noted as debt.

5. *"Other special characters in paths still dangerous"* — Observation. Single-quoted shell strings handle `$`, spaces, and most special characters correctly. The remaining risk is paths containing literal single quotes inside single quotes — which is exactly what this fix addresses. Backticks and `!` are safe inside single quotes. The only remaining vector is a path containing a literal backslash before a single quote, which is exotic enough to monitor rather than scope.

**Production risk prediction:** "What would break in production that this spec didn't address?"
- A misspelled key in MDX (e.g., `<DocsStat value="proofCoutn" />`) renders the string "proofCoutn" as visible text on the docs page. The type system can't catch this because fumadocs uses `@ts-nocheck`. This is acknowledged in the spec and mitigated by the fallback, but there's no build-time or test-time validation of MDX key usage.

**Over-building check:** No scope creep found. The escape variable is scoped inside the try block as specified. No new exports beyond `DocsStatKey`. No extra error handling or abstractions. The changes are minimal and focused.

## AC Walkthrough

- **AC1:** ✅ PASS — `packages/cli/src/commands/init/state.ts:509`: `escapedPath = surface.path.replace(/'/g, "'\\''")` used in all 4 template literals (lines 514, 521, 525, 532).
- **AC2:** ✅ PASS — `packages/cli/tests/commands/init/monorepoCommandScoping.test.ts:138-162`: "escapes single quotes in surface path commands" test creates surface with path `it's-here`, asserts build/test/lint commands contain escaped path.
- **AC3:** ✅ PASS — `packages/cli/src/commands/work.ts:1101`: `existing.surface === undefined || existing.surface === null` — strict equality, no falsy coercion.
- **AC4:** ✅ PASS — `website/lib/docs-data/docsStatValues.ts:10-19`: `DocsStatKey` union exported with 9 members.
- **AC5:** ✅ PASS — `website/components/docs/content/DocsStat.tsx:5,8,34`: `import type { DocsStatKey }` (separate from value import), prop typed as `DocsStatKey`, `?? value` fallback present.
- **AC6:** ✅ PASS — `pnpm run build` completed successfully, website built all pages including docs with DocsStat components.
- **AC7:** ✅ PASS — 2921 tests passed, 2 skipped, 0 failed across 124 test files. Baseline was 2919 + 2 skipped; the +2 is the new escape test assertions.

## Blockers

No blockers. All 12 contract assertions satisfied. All 7 acceptance criteria pass. No test regressions. No unused exports in new code (only `DocsStatKey` is new, imported by DocsStat.tsx). No unhandled error paths introduced — the escape is a pure string operation inside an existing try block. No assumptions about external state beyond what already existed. The backfill guard change narrows behavior (fewer values match), which is strictly safer than the original.

## Findings

- **Code — Path escape covers single quotes only:** `packages/cli/src/commands/init/state.ts:509` — The fix correctly addresses the proof findings (monorepo-build-scoping-C5, flip-monorepo-commands-C4) for single-quote injection. Other special characters (backslash before quote) remain theoretically possible but are safe inside POSIX single-quoted strings for all practical surface paths. Monitor for exotic monorepo naming.

- **Upstream — Backfill guard resolves fix-test-behavioral-coverage-C1:** `packages/cli/src/commands/work.ts:1101` — The strict equality check directly fixes the reported behavior where `''` (empty string) would be treated as "no surface." The proof finding is resolved.

- **Test — No behavior test for empty-string backfill guard:** `packages/cli/src/commands/work.ts:1101` — The contract's A005/A006 target `sourceCode` (verified by inspection), but there's no test proving a proof chain entry with `surface: ''` survives backfill without being overwritten. The old code would overwrite it; the new code preserves it. A future scope item could add a test exercising this edge case through `writeProofChain`.

- **Code — DocsStatKey fallback renders raw key as visible text:** `website/components/docs/content/DocsStat.tsx:34` — `values[value] ?? value` means a misspelled key in MDX silently renders the key string on the live docs page. The spec acknowledges this as defense-in-depth; fumadocs's `@ts-nocheck` prevents compile-time detection. Consider a prebuild lint that greps MDX files for `<DocsStat value="..."/>` and validates keys against the type.

- **Code — fix-surface-test-priority-C1 still active:** `packages/cli/src/commands/init/state.ts:520` — `scripts['test'] !== undefined` treats `"test": null` in package.json as a present script, producing `pnpm run test` which would fail. This is a pre-existing finding not in scope for this build, but the modified code is adjacent (line 520 vs the new escape at line 509). Noting for context.

## Deployer Handoff

Three independent fixes, all internal correctness improvements with zero user-facing behavior change for existing inputs:

1. **Path escape (state.ts):** Only triggers for monorepo surface paths containing single quotes — no existing project uses such paths. The escape is a no-op for normal paths (verified by A003 test).
2. **Backfill guard (work.ts):** Only changes behavior for proof chain entries with `surface: ''` (empty string), which would previously be overwritten during backfill migration. No known production data has this state.
3. **DocsStatKey type (website):** Purely additive type safety. The runtime behavior is unchanged — the `?? value` fallback was already present. Only affects TypeScript call sites.

Pre-existing lint warnings (3 total, all warnings not errors) are unrelated to this build. The "Committed locally. Push failed" messages in test output are from test fixtures creating temporary git repos — not real push failures.

## Verdict

**Shippable:** YES

All 12 contract assertions satisfied. All 7 acceptance criteria pass. 2921 tests pass with 0 failures. Build and lint clean. The three fixes are minimal, correctly scoped, and independently verifiable. Each resolves a specific proof chain finding with zero blast radius. Would stake my name on this shipping.
