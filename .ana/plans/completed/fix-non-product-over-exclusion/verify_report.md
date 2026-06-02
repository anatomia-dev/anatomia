# Verify Report: Fix non-product path over-exclusion at deep segments

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-06-02
**Spec:** .ana/plans/active/fix-non-product-over-exclusion/spec.md
**Branch:** feature/fix-non-product-over-exclusion

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-non-product-over-exclusion/contract.yaml
  Seal: INTACT (hash sha256:a8f577dd85612510c77814928de04b0783e2f490666382c7737810d29fa10d11)
```

Tests: 3230 passed, 0 failed, 2 skipped. Build: success (typecheck + tsup). Lint: 0 errors (3 pre-existing warnings in unrelated files).

## Contract Compliance
| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Deep product paths with excluded segment names are no longer over-excluded | ✅ SATISFIED | non-product-filtering.test.ts:211 — asserts `isNonProductFilePath('apps/web/app/(ee)/api/e2e/bounties/route.ts')` equals `false` |
| A002 | Top-level non-product directories are still excluded | ✅ SATISFIED | non-product-filtering.test.ts:216 — asserts `isNonProductFilePath('examples/next-app/src/route.ts')` equals `true` |
| A003 | Non-product directories at depth 2 are still excluded | ✅ SATISFIED | non-product-filtering.test.ts:220 — asserts `isNonProductFilePath('packages/platform/examples/base/src/route.ts')` equals `true` |
| A004 | Segments at exactly depth 3 are not excluded by the file-path filter | ✅ SATISFIED | non-product-filtering.test.ts:225 — asserts `isNonProductFilePath('packages/novu/src/commands/init/templates/route.ts')` equals `false` |
| A005 | The -e2e suffix check works within the depth limit | ✅ SATISFIED | non-product-filtering.test.ts:231 — asserts `isNonProductFilePath('apps/gauzy-e2e/src/route.ts')` equals `true` |
| A006 | The -e2e suffix check does not apply past the depth limit | ✅ SATISFIED | non-product-filtering.test.ts:237 — asserts `isNonProductFilePath('apps/web/app/api/gauzy-e2e/route.ts')` equals `false` |
| A007 | File-path filtering is case-insensitive | ✅ SATISFIED | non-product-filtering.test.ts:243 — asserts `isNonProductFilePath('Examples/next-app/src/route.ts')` equals `true` |
| A008 | Package-path filtering still works for all segments | ✅ SATISFIED | non-product-filtering.test.ts:278 — asserts `isNonProductPath('examples/next-app')` equals `true` |
| A009 | Package-path filtering still detects deep excluded segments | ✅ SATISFIED | non-product-filtering.test.ts:282 — asserts `isNonProductPath('packages/core/examples/with-auth/src/index.ts')` equals `true` |
| A010 | Package-path filtering still handles -e2e suffix | ✅ SATISFIED | non-product-filtering.test.ts:287 — asserts `isNonProductPath('apps/gauzy-e2e')` equals `true` |
| A011 | Glob patterns use rooted depth tiers instead of any-depth matching | ✅ SATISFIED | non-product-filtering.test.ts:30 — loop asserts `toContain('${segment}/**')` for every EXCLUDED_SEGMENTS entry |
| A012 | Glob patterns include second-level rooted tier | ✅ SATISFIED | non-product-filtering.test.ts:31 — loop asserts `toContain('*/${segment}/**')` |
| A013 | Glob patterns include third-level rooted tier | ✅ SATISFIED | non-product-filtering.test.ts:32 — loop asserts `toContain('*/*/${segment}/**')` |
| A014 | Any-depth patterns are no longer used for excluded segments | ✅ SATISFIED | non-product-filtering.test.ts:34 — loop asserts `not.toContain('**/${segment}/**')` |
| A015 | Build artifact patterns remain at any depth | ✅ SATISFIED | non-product-filtering.test.ts:297 — asserts all 8 `**/` build artifact patterns present |
| A016 | All 8 build artifact patterns are preserved | ✅ SATISFIED | non-product-filtering.test.ts:309 — filters `**/`-prefixed patterns and asserts length 8 |
| A017 | Hot file filtering uses the depth-limited filter | ✅ SATISFIED | Source inspection: git.ts:9 imports `isNonProductFilePath`, git.ts:382 calls `isNonProductFilePath(file)` |
| A018 | Schema detection filtering uses the depth-limited filter | ✅ SATISFIED | Source inspection: scan-engine.ts:42 imports `isNonProductFilePath`, used at lines 321, 443, 543, 545 |
| A019 | Package-path callers are not migrated | ✅ SATISFIED | Source inspection: scan-engine.ts:42 imports only `isNonProductFilePath` — no `isNonProductPath` import. Grep confirms census.ts, state.ts, surfaces.ts `detectSurfaces` still use `isNonProductPath` |
| A020 | The depth limit is defined as a named constant | ✅ SATISFIED | non-product-filtering.test.ts:249 + surfaces.test.ts:963 — both assert `FILE_PATH_DEPTH_LIMIT` equals 3 |
| A021 | The new function is exported and callable | ✅ SATISFIED | non-product-filtering.test.ts:254 + surfaces.test.ts:958 — both assert `typeof isNonProductFilePath` equals `'function'` |

## Independent Findings

**Prediction resolution:**
1. **Confirmed** — `isNonProductFilePath` uses two separate `for` loops over the same `0..limit` range: one for EXCLUDED_SEGMENTS, one for `-e2e` suffix. Could be a single loop. Functionally correct, minor debt.
2. **Not found** — scan-engine.ts import is clean: only `isNonProductFilePath`, no leftover `isNonProductPath`.
3. **Not found** — empty string path produces `['']`, limit=1, `''.toLowerCase()` works. Test covers this edge case (non-product-filtering.test.ts:258).
4. **Not found** — build artifact patterns remain `**/`-prefixed at lines 139-141.
5. **Not found** — spec's line references (321, 443, 543, 545) all match actual scan-engine.ts.

**Over-building check:** No exports beyond what the spec requires. `isNonProductFilePath` and `FILE_PATH_DEPTH_LIMIT` are both exported and imported by consumers. No dead code in new functions. No extra parameters or features.

**YAGNI check:** Grepped new exports — `isNonProductFilePath` imported by git.ts, scan-engine.ts, and test files. `FILE_PATH_DEPTH_LIMIT` imported by test files. No orphan exports.

## AC Walkthrough
- ✅ AC1: `isNonProductFilePath('apps/web/app/(ee)/api/e2e/bounties/route.ts')` returns `false` — verified via test at non-product-filtering.test.ts:211, passing.
- ✅ AC2: `isNonProductFilePath('examples/next-app/src/route.ts')` returns `true` — verified via test at non-product-filtering.test.ts:216, passing.
- ✅ AC3: `isNonProductFilePath('packages/platform/examples/base/src/route.ts')` returns `true` — verified via test at non-product-filtering.test.ts:220, passing.
- ✅ AC4: `isNonProductPath('examples/next-app')` still returns `true` — verified via test at non-product-filtering.test.ts:278, passing.
- ✅ AC5: `NON_PRODUCT_GLOB_IGNORE` contains 3-tier rooted patterns — verified via test at non-product-filtering.test.ts:25-36. Loops all EXCLUDED_SEGMENTS, checks `${s}/**`, `*/${s}/**`, `*/*/${s}/**` present and `**/${s}/**` absent.
- ✅ AC6: Build artifact patterns retained at any depth — verified via test at non-product-filtering.test.ts:294-312. All 8 `**/`-prefixed patterns present.
- ✅ AC7: git.ts hot file filtering calls `isNonProductFilePath` — verified by source inspection: import at git.ts:9, call at git.ts:382.
- ✅ AC8: scan-engine.ts call sites use `isNonProductFilePath` — verified by source inspection and grep: lines 321, 443, 543, 545 all call `isNonProductFilePath`.
- ✅ AC9: Package-path callers unchanged — grep confirms census.ts (lines 26, 167, 331, 427), surfaces.ts `detectSurfaces` (line 364), and state.ts (lines 23, 651) all still use `isNonProductPath`.
- ✅ AC10: `-e2e` suffix check in `isNonProductFilePath` iterates segments 0 through limit-1 — verified by source at surfaces.ts:122-124, `for (let i = 0; i < limit; i++)`.
- ✅ AC11: All existing tests pass — 3230 passed, 0 failed, 2 skipped (baseline was 3205 passed, 2 skipped — 25 new tests added).
- ✅ Tests pass with `(cd 'packages/cli' && pnpm vitest run)` — confirmed, 3230 passed.
- ✅ No build errors with `pnpm run build` — confirmed, typecheck + tsup both succeed.

## Blockers

No blockers. All 21 contract assertions satisfied. All 13 acceptance criteria pass. No regressions (3230 tests vs 3205 baseline — 25 new assertions). Checked for: unused exports in new code (none — both new exports consumed), dead code blocks in `isNonProductFilePath` (none — every branch reachable), error paths without tests (no error paths in pure filtering functions), unused parameters (none), and assumptions about external state (none — pure function over string input).

## Findings

- **Code — Redundant loop in isNonProductFilePath:** `packages/cli/src/engine/detectors/surfaces.ts:122` — the EXCLUDED_SEGMENTS check (lines 118-120) and `-e2e` suffix check (lines 122-124) iterate the same `0..limit` range in separate loops. A single loop checking both conditions would halve the iterations. Functionally correct, minor debt. Follows the structural pattern of `isNonProductPath` which also separates the two checks, so the duplication is consistent.

- **Code — **/build/** glob collision still present:** `packages/cli/src/engine/detectors/surfaces.ts:140` — `**/build/**` in build artifact patterns collides with legitimate `build/` directories in some monorepo layouts. Not introduced by this build. Already tracked as `fix-non-product-code-pollution-C5`. The 3-tier rooted pattern fix was correctly applied only to EXCLUDED_SEGMENTS, not build artifacts — build artifacts ARE correct at any depth.

- **Test — @ana tag namespace collision across contracts:** `packages/cli/tests/engine/detectors/surfaces.test.ts` — this file carries `@ana A001`-`@ana A027` tags from at least 3 prior contracts (surface detection, vite framework detection, server framework detection). The same tag ID (e.g., `@ana A001`) appears multiple times referring to different contract assertions. Doesn't break anything — verification works because each build's tests are in distinct describe blocks — but makes automated per-contract tag lookup ambiguous. Future consideration: prefix tags with slug or use unique IDs across contracts.

- **Code — Suffix loop comment lacks architectural rationale:** `packages/cli/src/engine/detectors/surfaces.ts:121` — comment says "Suffix check: segments within depth limit ending with -e2e" but doesn't explain WHY it iterates all segments in range rather than using the last-segment pattern from `isNonProductPath`. The reason (last segment of a file path is the filename, not a directory name) is the entire motivation for this function existing. A one-line comment would make the design decision self-documenting for the next engineer.

## Deployer Handoff

Clean merge to main. No migration steps, no config changes, no user-facing behavior changes. The fix is internal — `isNonProductFilePath` replaces `isNonProductPath` at 5 file-path call sites (1 in git.ts, 4 in scan-engine.ts). Observable effect: scan results will now include files that were previously over-excluded when excluded segment names (`e2e`, `templates`, `playground`, etc.) appeared deep in product source paths (depth 3+). Build artifact patterns unchanged. Package-path callers unchanged. 25 new test assertions cover the depth-boundary behavior.

## Verdict
**Shippable:** YES

21/21 contract assertions satisfied. 13/13 acceptance criteria pass. 3230 tests pass (25 new). Build and lint clean. The implementation is minimal, correct, and well-tested. The two-function split (`isNonProductPath` for package paths, `isNonProductFilePath` for file paths) is the right abstraction — it preserves backward compatibility while fixing the over-exclusion for deep file paths.
