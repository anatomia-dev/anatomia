# Verify Report: Setup Verification Hints

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/setup-verification-hints/spec.md
**Branch:** feature/setup-verification-hints

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/setup-verification-hints/.ana/plans/active/setup-verification-hints/contract.yaml
  Seal: INTACT (hash sha256:6a80820c03820ad617dee1a7c36428ebfa2117a0604f60e95bdf50c06cb6527e)
```

Tests: 2890 passed, 0 failed, 2 skipped. Build: success. Lint: 0 errors, 1 pre-existing warning (unused eslint-disable directive).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Database detection captures the triggering npm package name | ✅ SATISFIED | `dependencies.test.ts:137` — `expect(result.databasePkg).toBe('prisma')` |
| A002 | Auth detection captures the triggering npm package name | ✅ SATISFIED | `dependencies.test.ts:142` — `expect(result.authPkg).toBe('next-auth')` |
| A003 | Payment detection captures the triggering npm package name | ✅ SATISFIED | `dependencies.test.ts:149` — `expect(result.paymentsPkg).toBe('stripe')` |
| A004 | Package name fields are null when no detection occurs | ✅ SATISFIED | `dependencies.test.ts:154-158` — all three pkg fields asserted `toBeNull()` |
| A005 | Single-repo projects always produce empty provenance | ✅ SATISFIED | `dependencies.test.ts:209` — `expect(Object.keys(provenance).length).toBe(0)` |
| A006 | Detection from the primary package produces empty provenance | ✅ SATISFIED | `dependencies.test.ts:221` — `expect(provenance).toEqual({})` |
| A007 | Detection from a non-primary package records the source path | ✅ SATISFIED | `dependencies.test.ts:233` — `expect(provenance.database).toBe('packages/other')` |
| A008 | Provenance checks devDeps, not just production deps | ✅ SATISFIED | `dependencies.test.ts:245-246` — asserts `provenance.database` is defined and equals `'packages/db'` |
| A009 | AI SDK detection from a non-primary package is flagged | ✅ SATISFIED | `dependencies.test.ts:258-259` — asserts `provenance.aiSdk` is defined and equals `'packages/ai'` |
| A010 | Null dep result fields produce no provenance entry | ✅ SATISFIED | `dependencies.test.ts:272` — `expect(Object.keys(provenance).length).toBe(0)` |
| A011 | Null aiSdk parameter produces no aiSdk provenance | ✅ SATISFIED | `dependencies.test.ts:284` — `expect(Object.keys(provenance)).not.toContain('aiSdk')` |
| A012 | Provenance checks database, auth, payments, and aiSdk | ✅ SATISFIED | `dependencies.test.ts:300-303` — all four keys asserted via `toContain` |
| A013 | Provenance does not check testing or framework | ✅ SATISFIED | `dependencies.test.ts:316-317` — `not.toContain('testing')` and `not.toContain('framework')` |
| A014 | scan.json includes stackProvenance as a top-level field | ✅ SATISFIED | `analyzer-contract.test.ts:153` — `'stackProvenance'` in expectedKeys list; test at line 186 asserts all keys present. `engineResult.ts:140` declares the field. |
| A015 | Empty engine result initializes stackProvenance to empty object | ✅ SATISFIED | `engineResult.ts:385` — `stackProvenance: {},` in `createEmptyEngineResult()`. Contract test at line 190 validates key count matches. |
| A016 | Setup template instructs surface gap check after showing surfaces | ✅ SATISFIED | `ana-setup.md:154` — `Read \`monorepo.packages\` from scan.json` |
| A017 | Surface gap check requires dev script and 15+ source files | ✅ SATISFIED | `ana-setup.md:157` — `It has 15+ source files` |
| A018 | Surface gap results are capped at 5 suggestions | ✅ SATISFIED | `ana-setup.md:166` — `show up to 5, sorted by sourceFiles descending` |
| A019 | Surface gap excludes non-product paths like examples and fixtures | ✅ SATISFIED | `ana-setup.md:160-161` — lists `examples`, `templates`, `fixtures`, and 11 other exclusion patterns |
| A020 | Setup template shows provenance notes when non-primary detections exist | ✅ SATISFIED | `ana-setup.md:195` — `[If scan.json contains \`stackProvenance\` with non-empty entries:` |
| A021 | Provenance notes use the informational marker not a warning | ✅ SATISFIED | `ana-setup.md:198` — `ⓘ {field label}` |
| A022 | Setup template includes instructions for adding surfaces to ana.json | ✅ SATISFIED | `ana-setup.md:192` — `Always set \`dev: null\`.` |
| A023 | Surface commands use the cd-and-run pattern | ✅ SATISFIED | `ana-setup.md:177` — `(cd '{path}' && {packageManager} run {script})` |

## Independent Findings

**Prediction resolution:**

1. **Confirmed:** `detectAiSdk(allDeps)` is called twice — line 787 for stack construction and line 798 for provenance. The spec's gotcha explicitly said to "Capture `const nodeAiSdk = detectAiSdk(allDeps)` separately, use it in both." The builder captured it separately but didn't wire it into the stack line. Functionally correct (pure function, same input → same output) but is duplicated work.

2. **Confirmed:** `@ana` tag IDs A001-A004 are used by both pre-existing DATABASE_PACKAGES tests and the new forward-capture tests. The contract's `block` field disambiguates, and Vitest doesn't parse `@ana` tags, so no test-runtime impact. But automated tag scanners would find duplicates.

3. **Confirmed:** A008 (line 245) and A009 (line 258) use `toBeDefined()` before `toBe()`. The `toBe()` already implies defined — the `toBeDefined()` is redundant. Not harmful, just unnecessary.

4. **Confirmed:** Template assertions (A016-A023) have no `@ana` tags. Verified by source inspection of template content. Appropriate — these are template prose assertions, not executable tests.

5. **Investigated — safe:** The no-primary-root edge case at `findStackProvenance` line 371: if no root has `isPrimary: true`, `primaryRoot` is undefined and the `primaryRoot &&` guard at line 386 means nothing is treated as primary. All detections would be attributed to non-primary roots. This is theoretically possible but practically unreachable — the census construction always marks one root as primary. No test coverage for this edge case, but the guard handles it safely.

**Surprised:** The builder added two excellent edge case tests not explicitly required by the contract — "multiple non-primary roots — first match wins" (line 320) and "primary root devDeps prevents provenance entry" (line 330). Both exercise real-world scenarios that strengthen confidence.

**Over-building check:** No unused exports. `findStackProvenance` is imported by scan-engine.ts and the test file. `StackProvenance` is imported by engineResult.ts. No YAGNI violations. The `makeRoot`/`makeCensus` helpers are local to the test file, matching the spec's guidance to either extract or duplicate locally — the builder chose duplication, which is the less ideal but acceptable path.

## AC Walkthrough

- **AC1:** `DependencyDetectionResult` gains `databasePkg`, `authPkg`, `paymentsPkg` fields. `detectFromDeps` captures these. ✅ PASS — `dependencies.ts:275-279` declares fields, lines 317/319/334 assign them.
- **AC2:** scan.json contains `stackProvenance`. Empty for single-repo/all-primary. ✅ PASS — `engineResult.ts:140` declares field, `scan-engine.ts:996` includes in return, test A005/A006 verify empty case.
- **AC3:** `findStackProvenance` checks database, auth, payments, aiSdk. NOT testing or framework. ✅ PASS — `dependencies.ts:345` (StackProvenance type restricts to four keys), test A012/A013 verify inclusion/exclusion.
- **AC4:** Signature matches spec. Pure function, no filesystem access. ✅ PASS — `dependencies.ts:363-367` matches `(census, depResult, aiSdk) => StackProvenance`. No fs imports used in function body.
- **AC5:** Checks BOTH deps AND devDeps. ✅ PASS — `dependencies.ts:386` checks `primaryRoot.deps[pkg] || primaryRoot.devDeps[pkg]`, line 389 checks non-primary the same way. Test A008 and "primary root devDeps prevents entry" (line 330) verify both paths.
- **AC6:** Single-repo → empty. Non-Node aiSdk → no provenance. ✅ PASS — Line 369 early-returns `{}` for single root. `scan-engine.ts:798` passes `nodeAiSdk` (from `detectAiSdk`, not `detectNonNodeAiSdk`) to provenance.
- **AC7:** Template cross-references monorepo.packages against surfaces. 15+ files, dev script, exclusions, capped at 5, sorted by sourceFiles descending. ✅ PASS — `ana-setup.md:153-193` implements all criteria with explicit conditions.
- **AC8:** ⓘ notes for non-primary detections. ✅ PASS — `ana-setup.md:195-204` shows conditional block with ⓘ marker and field label mapping.
- **AC9:** Surface addition writes to ana.json with cd-and-run pattern. dev: null. ✅ PASS — `ana-setup.md:174-193` specifies the full pattern including `(cd '{path}' && {pm} run {script})` and `dev: null`.
- **AC10:** When no flags, Step 2 identical to current flow. ✅ PASS — Both blocks at lines 153 and 195 are wrapped in `[If ...]` conditionals. They render nothing when conditions aren't met.
- **Tests pass:** ✅ PASS — 2890 passed, 0 failed, 2 skipped (baseline was 2875 passed). 15 new tests added.
- **Build:** ✅ PASS — `pnpm run build` succeeds.
- **stackProvenance in expectedKeys:** ✅ PASS — `analyzer-contract.test.ts:153`.

## Blockers

No blockers. All 23 contract assertions satisfied. All 13 ACs pass. No regressions (2890 tests, up from 2875 baseline). Checked for: unused exports in new code (all used), unused parameters in `findStackProvenance` (all three consumed), error paths that silently swallow (none — function is pure with no error paths), external state assumptions (none — function reads only from its arguments).

## Findings

- **Code — Double `detectAiSdk` call:** `packages/cli/src/engine/scan-engine.ts:787` calls `detectAiSdk(allDeps)` for the stack object, and line 798 calls it again via `const nodeAiSdk = detectAiSdk(allDeps)`. The spec gotcha explicitly recommended capturing once and reusing. Functionally equivalent (pure function, same input, deterministic) but duplicates the iteration over `AI_SDK_PACKAGES`. Minor efficiency loss; no correctness impact.

- **Test — Duplicate `@ana` tag IDs across describe blocks:** `packages/cli/tests/engine/detectors/dependencies.test.ts` — pre-existing tests use `@ana A001` through `@ana A014`, and the new forward-capture tests reuse `@ana A001` through `@ana A004`. The contract's `block` field disambiguates, but automated tag scanning would report collisions. The pre-existing tags are from a prior pipeline cycle with a different contract — they should have been namespaced or the new ones offset.

- **Test — Redundant `toBeDefined()` assertions:** `packages/cli/tests/engine/detectors/dependencies.test.ts:245,258` — A008 and A009 each assert `toBeDefined()` then `toBe('packages/...')`. The specific assertion subsumes the existence check. Not harmful but adds visual noise.

- **Code — No-primary-root edge case undocumented:** `packages/cli/src/engine/detectors/dependencies.ts:371` — `findStackProvenance` calls `census.sourceRoots.find(r => r.isPrimary)` which returns `undefined` if no root is marked primary. The `primaryRoot &&` guard at line 386 handles this correctly (nothing treated as primary → everything attributed to non-primary). This is safe but not tested. The census builder always marks one root primary, so practically unreachable.

- **Upstream — Spec guidance not fully followed:** The spec gotcha said to capture `nodeAiSdk` and use it in both the stack construction (line 787) and the provenance call. The builder captured it separately but left line 787's `detectAiSdk(allDeps)` call as-is. The spec's suggestion was an optimization, not a requirement — both calls produce the same result.

- **Test — `makeRoot`/`makeCensus` helpers duplicated locally:** `packages/cli/tests/engine/detectors/dependencies.test.ts:163-200` — the spec noted these helpers exist in `surfaces.test.ts` and suggested extraction to a shared test helper. The builder duplicated instead of extracting. Both files now maintain independent copies of nearly identical helpers. Future census type changes require updating both.

## Deployer Handoff

Clean build. 15 new tests, no regressions. The `stackProvenance` field is additive — existing scan.json consumers ignore unknown fields. The template change is conditional and silent when there's nothing to flag, so existing single-repo setups see no change.

The duplicate `detectAiSdk` call and duplicated test helpers are minor debt — neither affects correctness or user experience. The `@ana` tag collision is cosmetic — the contract `block` field disambiguates.

Pre-commit hooks run build + lint + typecheck, so the merge path is standard.

## Verdict

**Shippable:** YES

All 23 contract assertions satisfied. All 13 acceptance criteria pass. 2890 tests pass (15 new, 0 regressions). Build and lint clean. The implementation is correct, well-tested, and follows project patterns. The findings are all observation-level — duplicated work, duplicated test helpers, redundant assertions. None affect correctness or production behavior.
