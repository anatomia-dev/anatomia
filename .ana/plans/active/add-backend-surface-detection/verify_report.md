# Verify Report: Backend Service Surface Detection

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-22
**Spec:** .ana/plans/active/add-backend-surface-detection/spec.md
**Branch:** feature/add-backend-surface-detection

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: /Users/rsmith/Projects/anatomia_project/anatomia/.ana/worktrees/add-backend-surface-detection/.ana/plans/active/add-backend-surface-detection/contract.yaml
  Seal: INTACT (hash sha256:bf0c52162136323f485420fdcfb024fb7a9101a08dcc85d6cc8dfb01c581e3e7)
```

Seal: **INTACT**

Tests: 82 passed, 0 failed, 0 skipped (surfaces.test.ts). Full suite: 2888 passed, 2 skipped. Build: success. Lint: clean (2 pre-existing warnings in website, unrelated).

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | A backend package matching both a config file and a server framework is detected exactly once | ✅ SATISFIED | test line 1257-1278, creates root with nest-cli.json hint AND @nestjs/core dep, asserts `surfaces.toHaveLength(1)` |
| A002 | The server framework list contains exactly ten frameworks | ✅ SATISFIED | test line 1128-1131, asserts `SERVER_FRAMEWORK_DEPS.size` equals 10 |
| A003 | Express is recognized as a server framework | ✅ SATISFIED | test line 1133-1136, asserts `SERVER_FRAMEWORK_DEPS.has('express')` is true |
| A004 | Fastify is recognized as a server framework | ✅ SATISFIED | test line 1138-1141, asserts `SERVER_FRAMEWORK_DEPS.has('fastify')` is true |
| A005 | NestJS core is recognized as a server framework | ✅ SATISFIED | test line 1143-1146, asserts `SERVER_FRAMEWORK_DEPS.has('@nestjs/core')` is true |
| A006 | Hono is recognized as a server framework | ✅ SATISFIED | test line 1148-1151, asserts `SERVER_FRAMEWORK_DEPS.has('hono')` is true |
| A007 | A server framework in dev dependencies does not trigger backend detection | ✅ SATISFIED | test line 1209-1223, creates root with express in `devDeps` (not `deps`), asserts `surfaces.toHaveLength(0)` |
| A008 | A backend with fewer than fifteen source files is not detected as a surface | ✅ SATISFIED | test line 1241-1255, creates root with express + dev + fileCount 10, asserts `surfaces.toHaveLength(0)` |
| A009 | The minimum file threshold for server dependency detection is fifteen | ✅ SATISFIED | test line 1153-1156, asserts `MIN_FILES_SERVER_DEP` equals 15 |
| A010 | A backend with a dev script and server framework is detected as a surface | ✅ SATISFIED | test line 1161-1175, creates root with express in deps + dev script + 20 files, asserts `surfaces.toHaveLength(1)` and name is 'api' |
| A011 | A NestJS backend using start:dev is detected as a surface | ✅ SATISFIED | test line 1192-1207, creates root with @nestjs/core + start:dev + 44 files, asserts `surfaces.toHaveLength(1)` and name is 'backend' |
| A012 | A server framework without a dev or start:dev script is not detected | ✅ SATISFIED | test line 1225-1239, creates root with express + scripts ['build', 'test', 'start'] (no dev/start:dev), asserts `surfaces.toHaveLength(0)` |
| A013 | Signal evaluation order is documented in the source code | ✅ SATISFIED | Source inspection: surfaces.ts lines 317-319, comment reads "Signal 4: server framework dep + dev/start:dev script + enough files / Last signal — weakest evidence. Stronger signals claim packages first / via `continue`, so evaluation order is load-bearing." |
| A014 | The file count threshold is a named constant, not a magic number | ✅ SATISFIED | Source inspection: surfaces.ts line 122, `export const MIN_FILES_SERVER_DEP = 15;`. Signal 4 uses `MIN_FILES_SERVER_DEP` at line 320, not a literal 15. Test at line 1153 confirms export and value. |
| A015 | The module documentation describes all four detection signals | ✅ SATISFIED | Source inspection: surfaces.ts lines 8-14, JSDoc reads "Four signals classify surfaces" and lists all four signals including "4. Server framework dep" |
| A016 | All existing surface detection tests pass without modification | ✅ SATISFIED | 82 total tests - 13 new tests = 69 existing tests. All pass. Diff confirms 13 new `it()` blocks added, 0 existing tests modified. |

## Independent Findings

The implementation is clean and well-scoped. The diff is minimal — 36 lines in the source file (20 constants, 12 signal logic, 4 JSDoc), 156 lines in tests. No over-building beyond the spec.

**Signal 4 logic is correct.** The guard structure (`fileCount >= MIN_FILES_SERVER_DEP`, then `Object.keys(root.deps).some(...)`, then script check) is sound. The `continue` on Signal 3 (line 314) prevents duplicate candidates when a package matches both Signal 3 and Signal 4 — the overlap test at line 1257 confirms this.

**Prediction resolution:**
- Predicted `root.deps` null safety issue → Not found. `SourceRoot.deps` is typed `Record<string, string>`, always initialized to `{}` in `makeRoot`. No null path.
- Predicted tests check length only → Not found. Tests assert both `.toHaveLength()` and `.name` on positive cases (lines 1174, 1188, 1205, 1275).
- Predicted over-building in test count → Minor. 13 new tests vs ~10 estimated. The fastify variant test (line 1177) adds coverage variety without being gratuitous.
- Predicted `start:dev` substring matching issue → Not found. `root.scripts` is `string[]` of exact key names, `.includes('start:dev')` is exact match on array elements.

**What I didn't predict:** The test file's module JSDoc still says "three signals" — stale documentation. Minor.

## AC Walkthrough

- [x] AC1: Signal 3 has `continue` after `candidates.push()` — ✅ PASS. Source diff confirms `continue` added at line 314. Overlap test at line 1257 creates a package matching both Signal 3 (nest-cli.json) and Signal 4 (@nestjs/core dep), asserts exactly 1 surface.
- [x] AC2: `SERVER_FRAMEWORK_DEPS` contains all 10 frameworks — ✅ PASS. Source lines 108-119 list all 10: express, fastify, koa, hono, @hono/node-server, @nestjs/core, elysia, polka, restify, h3. Test at line 1129 asserts size is 10. Spot-checks at lines 1133-1151 verify 4 specific entries.
- [x] AC3: Signal 4 checks `root.deps` only — ✅ PASS. Source line 321: `Object.keys(root.deps).some(...)`. Test at line 1209 puts express in `devDeps` only, asserts 0 surfaces.
- [x] AC4: File count threshold is 15 — ✅ PASS. Source line 320: `root.fileCount >= MIN_FILES_SERVER_DEP`. Test at line 1241 uses fileCount 10 + express + dev, asserts 0 surfaces. Constant test at line 1154 asserts value is 15.
- [x] AC5: Accepts `dev` or `start:dev` — ✅ PASS. Source line 322: `root.scripts.includes('dev') || root.scripts.includes('start:dev')`. Test at line 1162 uses `dev`, test at line 1192 uses `start:dev`. Both assert 1 surface. Test at line 1225 uses `start` (not `start:dev`), asserts 0.
- [x] AC6: Signal 4 fires after Signal 3 — ✅ PASS. Source order: Signal 3 at line 311, Signal 4 at line 317. Signal 3 has `continue` at line 314. Comment at lines 318-319 documents evaluation order. Overlap test at line 1257 confirms no duplicates.
- [x] AC7: `MIN_FILES_SERVER_DEP` is an exported named constant — ✅ PASS. Source line 122: `export const MIN_FILES_SERVER_DEP = 15;`. Pattern matches existing `MIN_SOURCE_FILES` and `APPS_DIR_FILE_THRESHOLD`.
- [x] AC8: Module-level JSDoc updated to four signals — ✅ PASS. Source line 8: "Four signals classify surfaces" with all four listed at lines 10-14.
- [x] AC9: No regressions — ✅ PASS. 69 existing tests pass. Full suite: 2888 passed, 2 skipped (both pre-existing skips). No test modifications to existing tests.
- [x] Tests pass — ✅ PASS. `pnpm run test -- --run` completes with 2888 passed, 2 skipped.
- [x] No build errors — ✅ PASS. `pnpm run build` completes successfully.

## Blockers

None. All 16 contract assertions satisfied. All 11 acceptance criteria pass. No regressions. Checked for: unused exports in new code (SERVER_FRAMEWORK_DEPS and MIN_FILES_SERVER_DEP both used in implementation and tests), unused parameters (none — Signal 4 uses all three conditions), error paths that swallow silently (Signal 4 has no try/catch — pure conditional logic), external assumptions (none — pure function on census data).

## Findings

- **Code — Test file JSDoc stale:** `packages/cli/tests/engine/detectors/surfaces.test.ts:3` — Still says "all three signals" after Signal 4 was added. Not a contract assertion (A015 targets the source module, not the test file), but stale documentation.
- **Code — Signal 4 guard ordering:** `packages/cli/src/engine/detectors/surfaces.ts:320` — Checks `fileCount >= MIN_FILES_SERVER_DEP` before checking deps. This is actually a good optimization (cheap check first), but worth noting the structure differs slightly from the spec's description which lists deps first. The behavior is identical.
- **Test — No empty-scripts edge case:** `packages/cli/tests/engine/detectors/surfaces.test.ts` — The negative case at line 1225 tests a package with scripts `['build', 'test', 'start']` but no test covers an empty `scripts: []` array. The code handles it correctly (`.includes()` on empty array returns false), but there's no explicit test for this edge. Low risk — the existing negative case at line 1225 covers the logic path.
- **Test — No multi-backend scenario:** `packages/cli/tests/engine/detectors/surfaces.test.ts` — No test creates two packages both caught by Signal 4 in the same census. The overlap test at line 1257 tests Signal 3 + Signal 4 overlap, but not two independent Signal 4 matches. The code is a `for` loop over roots, so each is evaluated independently — structurally correct, but untested.
- **Upstream — A013 not mechanically testable:** Contract A013 uses matcher `exists` on target `comment` — this requires source inspection, not a test assertion. Verified by reading the source. Future contracts could avoid comment-existence assertions in favor of behavioral checks.

## Deployer Handoff

Clean feature addition. Two files modified, no new dependencies, no schema changes, no breaking changes. The `continue` fix on Signal 3 is a bug fix that was harmless before Signal 4 but is now load-bearing — if Signal 4 is ever removed, the `continue` should stay (it's correct regardless). The 10-framework list in `SERVER_FRAMEWORK_DEPS` may need expansion as new frameworks emerge — it's an exported Set, easy to extend.

## Verdict

**Shippable:** YES

All 16 contract assertions satisfied. All 11 acceptance criteria pass. 82 tests green, full suite of 2888 tests green, no regressions, clean build, clean lint. The implementation is minimal, follows existing patterns exactly, and the test coverage is thorough with both positive and negative cases for every Signal 4 condition. The `continue` fix and overlap test provide regression protection for the duplicate-candidate bug.
