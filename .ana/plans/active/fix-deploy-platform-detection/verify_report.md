# Verify Report: Fix deploy platform detection for monorepos

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-26
**Spec:** .ana/plans/active/fix-deploy-platform-detection/spec.md
**Branch:** feature/fix-deploy-platform-detection

## Pre-Check Results
```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/fix-deploy-platform-detection/contract.yaml
  Seal: INTACT (hash sha256:8f4602c851082f24ab8912f6d19e01455c11477970e095d991c7ba3c74cbf9f0)
```

Build: PASS (typecheck + tsup clean).
Tests: 11 passed, 0 failed, 0 skipped (ci-detection.test.ts — was 7, now 11 with 4 new).
Lint: PASS (0 errors; 1 pre-existing warning in git-operations.ts, not introduced by this build).

## Contract Compliance
| ID   | Says                                           | Status       | Evidence |
|------|------------------------------------------------|--------------|----------|
| A001 | Monorepo scan picks the primary package's deploy platform over alphabetically-first | ✅ SATISFIED | `packages/cli/tests/engine/detectors/ci-detection.test.ts:64-74` — tagged `@ana A001, A002`, constructs `[Cloudflare/apps/image-proxy, Vercel/apps/web]` with `primaryPath='apps/web'`, asserts `result.platform === 'Vercel'` |
| A002 | Monorepo scan returns the primary package's config file path | ✅ SATISFIED | Same test at line 73 — asserts `result.configFile === 'apps/web/vercel.json'` |
| A003 | When the primary package has no deploy config, the first available platform is used | ✅ SATISFIED | `packages/cli/tests/engine/detectors/ci-detection.test.ts:76-85` — tagged `@ana A003`, entries `[Docker/apps/worker]` with `primaryPath='apps/web'`, asserts `result.platform === 'Docker'` |
| A004 | Single-repo projects still detect their deploy platform correctly | ✅ SATISFIED | `packages/cli/tests/engine/detectors/ci-detection.test.ts:87-96` — tagged `@ana A004`, entries `[Vercel/'.']` with `primaryPath='.'`, asserts `result.platform === 'Vercel'` |
| A005 | Calling without a primary path preserves the original first-match behavior | ✅ SATISFIED | `packages/cli/tests/engine/detectors/ci-detection.test.ts:54-61` — tagged `@ana A005`, entries `[Docker, Vercel]` with no `primaryPath`, asserts `result.platform === 'Docker'` |
| A006 | Empty deployment list still returns null platform | ✅ SATISFIED | `packages/cli/tests/engine/detectors/ci-detection.test.ts:47-51` — tagged `@ana A006`, calls `detectDeployment([])`, asserts `result.platform` is `null` and `result.configFile` is `null`. Contract matcher is `exists` — the field exists (as null). Test is stronger than contract requires. |
| A007 | Empty deployment list with a primary path still returns null | ✅ SATISFIED | `packages/cli/tests/engine/detectors/ci-detection.test.ts:98-103` — tagged `@ana A007`, calls `detectDeployment([], 'apps/web')`, asserts both fields `null` |
| A008 | The scan engine passes the primary source root to deployment detection | ✅ SATISFIED | `packages/cli/src/engine/scan-engine.ts:924` — `detectDeployment(census.configs.deployments, census.primarySourceRoot)`. Verified by source inspection; no `@ana` tag expected for a call-site assertion. |

## Independent Findings

**Predictions resolved:**
1. *"Builder might mishandle `undefined` vs missing `primaryPath`"* — **Not found.** The `primaryPath !== undefined` guard at `deployment.ts:46` correctly skips the find when omitted. The fallback path (`deployments[0]`) executes.
2. *"Census comment might be imprecise about V8 guarantees"* — **Confirmed (minor).** The comment at `census.ts:82` says "V8 guarantees string-key insertion order." This is actually an ES2015+ spec guarantee for all conforming engines, not V8-specific. Accurate in practice, imprecise in attribution.
3. *"A006 test might use a weak matcher"* — **Partially confirmed.** The test asserts `toBeNull()` which is specific, but the contract matcher says `exists`. The test is *stronger* than the contract, so no problem — but the contract matcher could be `equals: null` for precision.
4. *"Scan-engine might pass the wrong census field"* — **Not found.** Line 924 passes `census.primarySourceRoot`, which is the correct field.
5. *"AC5 wording might not match where guidance lands"* — **Confirmed.** AC5 says "AGENTS.md with Vercel-specific serverless guidance" but the Vercel guidance lands in `.claude/skills/deployment/SKILL.md`, not in AGENTS.md. The fix is working — deployment skill correctly says "Platform: Vercel" — but the AC wording is imprecise about the output file.

**Production risk predictions:**
- *"What if `primarySourceRoot` is undefined for a project without packages?"* — Investigated: `primarySourceRoot` is set during census. For single-root projects it's `'.'`. For monorepos without a detected primary, it would be the first source root. The `primaryPath !== undefined` guard in `detectDeployment` handles both cases.

**Code quality observations:**
- The implementation is minimal and correct. 5 new lines in `deployment.ts` (parameter + find + return), 1 line change in `scan-engine.ts`, 1 comment in `census.ts`. No over-building detected.
- All new code follows early-return pattern per coding standards.
- JSDoc is updated accurately — describes the new behavior, not the old aspirational comment.
- No unused exports: `detectDeployment` is imported by scan-engine and tests.
- No dead code: every branch in the function is exercised by tests.
- `.js` extensions on all imports. `import type` used correctly for `DeploymentEntry` and `CiWorkflowEntry`.

## AC Walkthrough
- **AC1:** inbox-zero scan shows "Vercel" not "Cloudflare Workers" — ✅ PASS — ran `node dist/index.js scan` on inbox-zero, Deploy line shows "Vercel · GitHub Actions"
- **AC2:** Cap scan shows "Vercel" not "Cloudflare Workers" — -- UNVERIFIABLE — Cap repo not available locally. The fix is structurally identical to inbox-zero (monorepo with primary package on Vercel), so confidence is high.
- **AC3:** dub scan still shows "Vercel" — ✅ PASS — ran scan on dub, Deploy line shows "Vercel · GitHub Actions"
- **AC4:** formbricks scan still shows "Docker" — ✅ PASS — ran scan on formbricks, Deploy line shows "Docker · GitHub Actions"
- **AC5:** `ana init` on inbox-zero produces AGENTS.md with Vercel-specific serverless guidance — ⚠️ PARTIAL — ran `ana init --force` on inbox-zero. Deployment skill correctly shows "Platform: Vercel" and "Config: apps/web/vercel.json". However, the Vercel-specific serverless guidance lands in `.claude/skills/deployment/SKILL.md` and `.claude/skills/data-access/SKILL.md` (Prisma singleton gotcha), not in AGENTS.md itself. The fix is working — correct platform detected — but AC wording targets the wrong file.
- **AC6:** Prisma + Vercel gotcha fires for inbox-zero after the fix — ✅ PASS — data-access skill contains "Use a singleton Prisma client with `globalThis` caching for serverless" after init.
- **AC7:** Single-repo projects unaffected — ✅ PASS — test A004 at `ci-detection.test.ts:87-96` passes with `primaryPath='.'`.
- **AC8:** Existing fallback test continues to pass — ✅ PASS — test A005 at `ci-detection.test.ts:54-61` (the original test) passes unchanged.
- **Tests pass:** ✅ PASS — `(cd packages/cli && pnpm vitest run tests/engine/detectors/ci-detection.test.ts)` — 11 passed, 0 failed.
- **No build errors:** ✅ PASS — `pnpm run build` clean.
- **No lint errors:** ✅ PASS — `pnpm run lint` — 0 errors (1 pre-existing warning in unrelated file).

## Blockers
No blockers. All 8 contract assertions SATISFIED. 9 of 11 ACs pass, 1 PARTIAL (AC5 — wording issue, fix is working), 1 UNVERIFIABLE (AC2 — repo unavailable). Checked for: unused parameters in `detectDeployment` (none — both `deployments` and `primaryPath` used), unhandled error paths (the function is pure with no throws), dead code branches (every if/return path has test coverage), external assumptions (strict equality on `sourceRootPath` is correct per spec — paths use same convention).

## Findings

- **Upstream — AC5 wording targets wrong file:** AC5 says "AGENTS.md with Vercel-specific serverless guidance" but the guidance lands in `.claude/skills/deployment/SKILL.md` and `.claude/skills/data-access/SKILL.md`. The fix is correct — Vercel is detected — but the AC describes the wrong output surface. Not a code issue.
- **Upstream — Contract A006 matcher imprecision:** `packages/cli/tests/engine/detectors/ci-detection.test.ts:50` — Contract says `matcher: "exists"` but `says` field reads "returns null platform." The test asserts `toBeNull()` which is correct per intent. The matcher should be `equals: null` for precision. Dormant — the test is stricter than the contract.
- **Test — No @ana tag for A008:** `packages/cli/src/engine/scan-engine.ts:924` — A008 is a call-site assertion ("scan engine passes primarySourceRoot to detectDeployment"). Verified by source inspection. No unit test tags this assertion, which is appropriate for a wiring check — but it means A008 is only verified by code review, not by a running test.
- **Code — Census comment attributes ES2015+ spec behavior to V8:** `packages/cli/src/engine/census.ts:82` — "V8 guarantees string-key insertion order" is correct in practice but the guarantee comes from the ES2015+ spec, not V8 specifically. Minor accuracy issue in a documentation comment.
- **Test — No partial-match edge case:** `packages/cli/tests/engine/detectors/ci-detection.test.ts` — No test verifies that `primaryPath='apps/we'` does NOT match `sourceRootPath='apps/web'`. The implementation uses strict `===` so this is safe, but substring false-match is a common edge case worth covering.

## Deployer Handoff
Minimal change — 3 files modified, 4 tests added. The fix threads `census.primarySourceRoot` through `detectDeployment` so monorepo scans report the primary package's deploy platform instead of whichever sorts first alphabetically. Backward compatible: the `primaryPath` parameter is optional, existing callers unaffected. All existing tests pass unchanged. The only AC gap is AC2 (Cap repo unavailable locally) and AC5 (Vercel guidance lands in skills, not AGENTS.md — wording issue only). No migration, no config changes, no new dependencies.

## Verdict
**Shippable:** YES

Clean implementation. The fix is minimal, correct, and well-tested. 8/8 contract assertions satisfied. Live scans on inbox-zero, dub, and formbricks confirm the behavioral fix. The findings are all observations (upstream wording, comment precision, missing edge case test) — none affect correctness or safety.
