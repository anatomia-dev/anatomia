# Verify Report: Fix Workspace Glob Fallback

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-25
**Spec:** .ana/plans/active/fix-workspace-glob-fallback/spec.md
**Branch:** feature/fix-workspace-glob-fallback

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-workspace-glob-fallback/contract.yaml
  Seal: INTACT (hash sha256:b3351aa73038b17babd13e7c89cd5b5b3473ff93fc0f64e60df4c8d9b5b91ffe)
```

Tests: 2924 passed, 0 failed, 2 skipped. Build: success. Lint: clean (1 pre-existing warning in git-operations.ts, unrelated).

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | A workspace with unresolvable glob patterns doesn't crash the scan | ✅ SATISFIED | `census.test.ts:64` — `expect(census.layout).toBe('single-repo')` |
| A002 | Root package dependencies are detected when workspace globs can't be resolved | ✅ SATISFIED | `census.test.ts:68` — `expect(census.allDeps).toHaveProperty('next')` |
| A003 | Dev dependencies from root are detected when workspace globs can't be resolved | ✅ SATISFIED | `census.test.ts:69` — `expect(census.allDeps).toHaveProperty('vitest')` |
| A004 | Exactly one primary source root exists when workspace globs can't be resolved | ✅ SATISFIED | `census.test.ts:70-71` — filters primaries, asserts length 1 |
| A005 | No monorepo tool is reported when workspace packages can't be resolved | ✅ SATISFIED | `census.test.ts:65` — `expect(census.monorepoTool).toBeNull()` |
| A006 | Dependencies from root package.json are recovered when workspace packages have invalid metadata | ✅ SATISFIED | `census.test.ts:101` — `expect(census.allDeps).toHaveProperty('express')` |
| A007 | Dev dependencies from root are recovered when workspace packages have invalid metadata | ✅ SATISFIED | `census.test.ts:102` — `expect(census.allDeps).toHaveProperty('typescript')` |
| A008 | Scan treats a failed workspace as single-repo with recovered deps | ✅ SATISFIED | `census.test.ts:100` — `expect(census.layout).toBe('single-repo')` |
| A009 | Package name from root is used when workspace resolution fails | ✅ SATISFIED | `census.test.ts:104` — `expect(census.sourceRoots[0]!.packageName).toBe('erxes-like')` (stronger than `exists`) |
| A010 | Exactly one primary source root exists when workspace resolution fails | ✅ SATISFIED | `census.test.ts:106-107` — filters primaries, asserts length 1 |
| A011 | When there's no package.json at all, the scan still works with empty dependencies | ✅ SATISFIED | `census.test.ts:123` — `expect(census.layout).toBe('single-repo')` |
| A012 | Empty dependency list is returned when no package.json exists anywhere | ✅ SATISFIED | `census.test.ts:125` — `expect(Object.keys(census.allDeps)).toHaveLength(0)` |
| A013 | Existing monorepo scans still work correctly after the fix | ✅ SATISFIED | `census.test.ts:13` — `expect(census.layout).toBe('monorepo')` |
| A014 | Existing monorepo dependency detection is unchanged | ✅ SATISFIED | `census.test.ts:17` — `expect(census.allDeps).toHaveProperty('vitest')` |

## Independent Findings

**Prediction resolution:**
1. Fix B test validity — **Not found.** Live verified: `@manypkg` throws `"The following package.jsons are missing the 'name' field"` on nameless packages.
2. Type narrowness — **Not found.** Only fields actually needed are accessed.
3. `rootDevDeps` gap — **Confirmed (observation).** In Fix B path, `rootDevDeps` (line 590) is `{}` because it reads from `result?.rootPackage` which is null. However, devDeps flow through `sourceRoot.devDeps` → `allDeps` correctly. The `rootDevDeps` field is only used for testing detection fallback in monorepos. In single-repo (which Fix B always produces), `detectTesting` finds devDeps from the root's own `devDeps` field first. Net impact: none currently.
4. Defensive guard reachability — **Confirmed (observation).** The `!result.rootPackage` guard (line 531) is unreachable with known `@manypkg` behavior. `@manypkg` always populates `rootPackage` when it succeeds. Defensive typing per spec guidance.
5. Glob pattern fidelity — **Not found.** `nonexistent-dir/*` correctly produces `tool.type = 'pnpm'`, 0 packages, matching real umami behavior.

**Surprised:** `result.packages` is length 0 (not 1) when workspace globs resolve to nothing — the root package is NOT included in `packages[]`, only in `rootPackage`. This means the `nonRootPackages` filter works on an empty array. Correct behavior, just non-obvious.

**Over-building check:** No unused exports, no YAGNI violations. Both code paths are tested and necessary. The `fallbackRootPackage` variable is used in exactly 2 branches (`!result` and `projectName` resolution). No extra parameters, no unused code.

## AC Walkthrough

- [x] **AC1** (umami scan): ⚠️ PARTIAL — No umami clone available in this environment. Verified the code path with a synthetic umami-like structure (pnpm workspace with unresolvable glob). `@manypkg` returns `tool.type = 'pnpm'` with 0 packages → `isSingleRepo = true` → deps from root package.json detected. The code path is exercised; the real repo test is not.
- [x] **AC2** (erxes scan): ⚠️ PARTIAL — Same as AC1. Synthetic structure verified: nameless workspace package triggers throw → fallback reads root `package.json` → deps detected.
- [x] **AC3** (immich scan): ⚠️ PARTIAL — Same mechanism as AC2. The throw path is identical.
- [x] **AC4** (existing monorepos unaffected): ✅ PASS — 2924 tests pass including the Anatomia self-scan regression test (line 10-25) which asserts `layout = 'monorepo'`, `monorepoTool = 'pnpm'`, `vitest` in allDeps.
- [x] **AC5** (Fix A test): ✅ PASS — Test at line 45-75 exercises unresolvable glob with deps. 5 assertions verify layout, monorepoTool, deps, primaries.
- [x] **AC6** (Fix B test): ✅ PASS — Test at line 78-111 exercises @manypkg throw with root package.json fallback. 7 assertions verify recovery.
- [x] **AC7** (Fix B edge test): ✅ PASS — Test at line 114-131 exercises @manypkg throw without root package.json. 4 assertions verify empty-deps fallback.
- [x] **AC8** (tests pass): ✅ PASS — `pnpm run test -- --run`: 2924 passed, 2 skipped, 124 test files.
- [x] **AC9** (build and lint pass): ✅ PASS — Build success. Lint: 0 errors, 1 pre-existing warning (unrelated).

## Blockers

No blockers. All 14 contract assertions SATISFIED. All mechanically verifiable ACs pass. No regressions (2924 tests vs 2921 baseline + 3 new). Checked: no unused exports in modified files, no unused parameters in new code, no swallowed errors beyond intentional graceful degradation (the inner catch at line 496 follows the established engine pattern per coding standards).

## Findings

- **Code — rootDevDeps empty in Fix B path:** `packages/cli/src/engine/census.ts:590` — When `@manypkg` throws (`result === null`), `rootDevDeps` reads from `result?.rootPackage?.packageJson?.devDependencies` → `{}`. Fallback devDeps flow through `sourceRoot.devDeps` → `allDeps` correctly, and `detectTesting` finds them in the root's own deps first. No current impact for single-repo output. If future code adds a monorepo-like path for partially-failed workspaces, this gap would matter.

- **Code — Defensive guard unreachable:** `packages/cli/src/engine/census.ts:531` — `if (!result.rootPackage)` branch handles the case where `@manypkg` succeeds but `rootPackage` is undefined. With current `@manypkg@3.x`, `rootPackage` is always set when the call succeeds. This is intentional defensive typing per spec. Not dead code — future-proofing against library changes.

- **Test — Fix A test only asserts allDeps, not deps/devDeps separation:** `packages/cli/tests/engine/census.test.ts:68` — The test checks `allDeps` has `next` and `vitest` but doesn't verify `sourceRoots[0].deps` contains `next` and `sourceRoots[0].devDeps` contains `vitest` separately. If the implementation accidentally merged everything into `deps`, the test would still pass. Low risk — the code clearly separates them (lines 525-526) and the pattern follows the existing `isSingleRepo` branch.

- **Code — No runtime validation of fallback JSON:** `packages/cli/src/engine/census.ts:487` — `fallbackRootPackage` gets its type from a type annotation, but `JSON.parse` returns `any`. If a corrupt-but-parseable `package.json` has `dependencies: "string"` instead of an object, the code would pass a string to `Object.assign` → silently wrong. Extremely unlikely in practice (not valid npm format) and consistent with how `@manypkg` handles it (no validation either).

## Deployer Handoff

This fix changes how `buildCensus()` handles two failure modes of `@manypkg/get-packages`:
1. **Workspace with 0 resolved packages** (e.g., umami) — previously crashed, now returns single-repo with root deps.
2. **Workspace packages with invalid metadata** (e.g., erxes, immich) — previously returned zero detection, now recovers root `package.json` deps.

No configuration changes. No new dependencies. No migration needed. The fix is purely additive — existing correct scans produce identical output. The `isSingleRepo` condition is now broader (removes `tool.type === 'root'` check), which means any repo where `@manypkg` finds 0 non-root packages is treated as single-repo. This is correct — such repos have no workspace packages to enumerate.

AC1-AC3 are marked PARTIAL because they require real repo clones (umami, erxes, immich) not available in this environment. If real-repo validation matters, clone them and run `ana scan` manually.

## Verdict
**Shippable:** YES

All contract assertions satisfied. Tests pass. Code is clean, follows established patterns, has appropriate defensive guards. The two observations (rootDevDeps gap, unreachable guard) are informational — neither impacts correctness for the scenarios this fix addresses.
