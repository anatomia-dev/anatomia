# Verify Report: Dynamic marketing stats — wire command count and version fallback

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-16
**Spec:** .ana/plans/active/dynamic-marketing-stats/spec.md
**Branch:** feature/dynamic-marketing-stats

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/dynamic-marketing-stats/contract.yaml
  Seal: INTACT (hash sha256:1ebf1cb8e486d2e543d8449bd5fead1fc2dbac5d86e6ac0e2e30315e48ca0d99)
```

Tests: 2336 passed, 0 failed, 2 skipped (CLI). 8 passed (website marketing-stats). Build: website `pnpm build` succeeded. Lint: 1 pre-existing error in `TetrisSnake.tsx` (not in this branch's diff). TypeScript: `tsc --noEmit` clean.

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | The marketing command count returns the real number from extraction data | ✅ SATISFIED | `website/lib/__tests__/marketing-stats.test.ts:22-23` — mocks getCommandCount to return 32, asserts `toBe(32)` |
| A002 | Missing extraction data falls back to the previous hardcoded count | ✅ SATISFIED | `website/lib/__tests__/marketing-stats.test.ts:28-31` — mocks throw ENOENT, asserts `toBe(26)` |
| A003 | Malformed extraction data falls back safely | ✅ SATISFIED | `website/lib/__tests__/marketing-stats.test.ts:36-39` — mocks throw SyntaxError, asserts `toBe(26)` |
| A004 | The marketing version reads from build metadata with a v prefix | ✅ SATISFIED | `website/lib/__tests__/marketing-stats.test.ts:53-58` — mocks getBuildMeta returning version "1.0.2", asserts `toBe('v1.0.2')` |
| A005 | Missing build metadata falls back to the previous hardcoded version | ✅ SATISFIED | `website/lib/__tests__/marketing-stats.test.ts:63-66` — mocks throw ENOENT, asserts `toBe('v1.1.0')` |
| A006 | The specStrip renders the dynamic command count instead of the stale number | ✅ SATISFIED | Source inspection: `website/components/system/SystemSection.tsx:17-19` — maps specStrip, replaces `label === "cli"` item value with `` `${commandCount} commands` ``. Passes modified array to SpecStrip at line 57. When commandCount=32, produces "32 commands". |
| A007 | The CLI drawer shows the dynamic command count in its metadata | ✅ SATISFIED | Source inspection: `website/components/system/Drawer.tsx:91` — `` drawer.id === "cli" ? `${commandCount} commands` : drawer.meta ``. copy.ts confirms drawer id is `"cli"` at line 183. When commandCount=32, renders "32 commands". |
| A008 | The man page shows the correct number of additional commands | ✅ SATISFIED | Source inspection: `website/components/system/Drawer.tsx:128` — `moreCount: commandCount - 6`. When commandCount=32, produces 26. |
| A009 | The version fallback in proof-feed uses build metadata instead of a hardcoded string | ✅ SATISFIED | Source inspection: `website/lib/proof-feed.ts:61` — `const VERSION_FALLBACK = getMarketingVersion()`. getMarketingVersion wraps getBuildMeta().version with `v` prefix. build-meta.json has `"version": "1.0.2"` → "v1.0.2". |
| A010 | copy.ts remains unmodified | ✅ SATISFIED | `git diff main -- website/lib/copy.ts` produces empty output — no changes. |
| A011 | The website builds without errors after wiring dynamic stats | ✅ SATISFIED | `(cd website && pnpm build)` completed successfully with exit code 0. |
| A012 | No TypeScript errors are introduced | ✅ SATISFIED | `(cd website && npx tsc --noEmit)` completed with no output (clean). |

## Independent Findings

**Prediction resolution:**

1. **Confirmed — `vundefined` gap.** `getMarketingVersion()` at `marketing-stats.ts:38` does `v${getBuildMeta().version}`. If getBuildMeta succeeds but returns an object with `version: undefined`, the result is the string `"vundefined"`. The test at line 84 documents this explicitly — it's a known gap, not a bug, because getBuildMeta would throw on truly malformed data. Still, if the JSON has `{}` with no version key, this produces garbage silently.

2. **Confirmed — module-load-time evaluation.** `proof-feed.ts:61` evaluates `VERSION_FALLBACK = getMarketingVersion()` at module import time. This is a one-shot call. If build-meta.json is transiently unavailable during SSR startup, the fallback value gets set to `"v1.1.0"` permanently for that server process. Not a bug — this is how the original hardcoded pattern worked too — but worth knowing.

3. **Confirmed — no component tests for A006-A008.** The spec's testing strategy focused on unit tests for marketing-stats.ts. Component-level assertions (A006-A008) were verified by source inspection, which is reasonable for server component prop-passing and template string interpolation.

4. **Confirmed — no floor guard on moreCount.** `Drawer.tsx:128` computes `commandCount - 6`. If commandCount were ever < 6 (unlikely with real extraction data, but possible with a corrupted commands.json), the ManPage would show "+ -2 more" or similar nonsense. Low probability — extraction data currently has 32 commands and the fallback is 26.

5. **Confirmed — split imports.** `marketing-stats.ts:12-13` has two separate `import` lines from `@/lib/docs-data`. Should be `import { getCommandCount, getBuildMeta } from '@/lib/docs-data'`. Cosmetic.

**No surprises found.** All predictions mapped to real observations. Checked for additional issues: no unused exports in marketing-stats.ts (both functions are imported by consumers), no dead code paths, no error swallowing beyond intentional fallback catches.

## AC Walkthrough

- **AC1:** The System section specStrip displays the command count from commands.json, not the hardcoded "26 commands." → ✅ PASS — `SystemSection.tsx:17-19` maps specStrip to replace the cli item with dynamic count. `SpecStrip items={specStrip}` at line 57. Website build succeeds, confirming render.
- **AC2:** The CLI drawer meta displays the same dynamic command count. → ✅ PASS — `Drawer.tsx:91` conditionally renders `commandCount` for `drawer.id === "cli"`. Prop passed from SystemSection at line 60.
- **AC3:** The manPage moreCount is computed as `totalCommands - 6`. → ✅ PASS — `Drawer.tsx:128` uses `commandCount - 6`.
- **AC4:** VERSION_FALLBACK in proof-feed.ts reads from build-meta.json instead of a hardcoded string. → ✅ PASS — `proof-feed.ts:61` calls `getMarketingVersion()` instead of literal `"v1.1.0"`.
- **AC5:** If extraction data is missing or malformed, all values fall back to sensible defaults. → ✅ PASS — Tests cover ENOENT (A002, A005) and SyntaxError (A003) paths, all returning hardcoded fallbacks.
- **AC6:** copy.ts is not modified. → ✅ PASS — `git diff main -- website/lib/copy.ts` empty.
- **AC7:** The website builds with `pnpm build`. → ✅ PASS — `(cd website && pnpm build)` exit 0, all pages rendered.
- **AC8:** No TypeScript errors introduced. → ✅ PASS — `(cd website && npx tsc --noEmit)` clean.

## Blockers

No blockers. All 12 contract assertions satisfied, all 8 ACs pass, no regressions (CLI test suite 2336 passed unchanged), no TypeScript errors. Checked for: unused exports in new files (both `getMarketingCommandCount` and `getMarketingVersion` are imported by SystemSection.tsx and proof-feed.ts respectively), sentinel test patterns (all assertions use specific values from contract — `toBe(32)`, `toBe(26)`, `toBe('v1.0.2')`, `toBe('v1.1.0')`), error paths that swallow silently (catch blocks return explicit fallback values, intentional by design). Lint failure in TetrisSnake.tsx is pre-existing (file not in this branch's diff).

## Findings

- **Code — `vundefined` when BuildMeta has no version field:** `website/lib/marketing-stats.ts:38` — `` `v${getBuildMeta().version}` `` produces `"vundefined"` if the accessor returns `{ version: undefined }`. The catch only fires on throws. A non-throwing accessor returning incomplete data slips through. Low probability with real build-meta.json but a latent defect.

- **Code — VERSION_FALLBACK evaluated once at module load:** `website/lib/proof-feed.ts:61` — `getMarketingVersion()` runs during module initialization. If `readFileSync` fails at that instant, the fallback is `"v1.1.0"` for the life of the process. Same behavior as the original hardcoded value, but now the code *looks* dynamic when it's actually captured once. Future maintainers may assume it re-evaluates.

- **Code — No floor guard on moreCount:** `website/components/system/Drawer.tsx:128` — `commandCount - 6` with no `Math.max(0, ...)` guard. Negative moreCount would render if commandCount < 6. Unlikely with current data (32 commands, fallback 26) but fragile if extraction data ever changes shape.

- **Code — Split imports from same module:** `website/lib/marketing-stats.ts:12-13` — Two separate `import` statements from `@/lib/docs-data` where one combined import would suffice. Cosmetic, no functional impact.

- **Test — `vundefined` assertion documents gap but normalizes it:** `website/lib/__tests__/marketing-stats.test.ts:84` — `expect(getMarketingVersion()).toBe('vundefined')` passes on both correct and incorrect implementations. The test documents the edge case honestly (good) but treating `"vundefined"` as expected output means the gap is enshrined rather than guarded against.

- **Code — Over-build: vitest infrastructure added to website package:** `website/vitest.config.ts` (new) and `website/package.json` (vitest added to devDependencies). Neither file appears in the contract's `file_changes`. This is reasonable scaffolding — the test file needed a runner — but it is scope beyond what the spec listed. No functional concern; the config is minimal and correct.

- **Upstream — proof-feed.ts header comment stale:** `website/lib/proof-feed.ts:1-18` — File header still references "mock-only state" from the Website Lift build. The file now fetches live data from GitHub APIs. Comment should be updated in a future cycle.

## Deployer Handoff

Clean build. The lint failure (`TetrisSnake.tsx` prefer-const and unused-vars) is pre-existing on main and unrelated to this branch. The pre-commit hook runs lint, so merging may trigger the hook failure — consider fixing TetrisSnake.tsx on main first, or expect the merge commit's hook to fail on that file.

The `vitest.config.ts` and `website/package.json` changes are over-build relative to the spec but necessary for the test file to run. They add vitest as a devDependency to the website workspace (it was already in the CLI workspace). pnpm-lock.yaml is updated accordingly.

No environment variables or secrets added. No new runtime dependencies. Website build time unaffected.

## Verdict

**Shippable:** YES

12/12 assertions SATISFIED. 8/8 ACs pass. Tests green. Build clean. TypeScript clean. The findings are all observation/debt tier — the `vundefined` gap and missing floor guard are real but low-probability edge cases with the current data shape. No blockers.
