# Verify Report: Stack Detection Gaps (V2-Alpha Breadth Sweep)

**Result:** PASS
**Created by:** AnaVerify
**Date:** 2026-05-19
**Spec:** .ana/plans/active/stack-detection-gaps/spec.md
**Branch:** feature/stack-detection-gaps

## Pre-Check Results

```
=== CONTRACT COMPLIANCE ===
  Contract: .ana/plans/active/stack-detection-gaps/contract.yaml
  Seal: INTACT (hash sha256:3ddcfb06c7651eb9c0f8bb609944d5aa6e4136d79ba258faeb4320461854d4e5)
```

Seal status: **INTACT**

Tests: 2589 passed, 0 failed, 2 skipped. Build: clean (typecheck + tsup). Lint: clean (1 pre-existing warning in git-operations.ts, unrelated).

Focused test results:
- `census-detection.test.ts`: 22 passed
- `ai-sdk-detection.test.ts`: 42 passed

## Contract Compliance

| ID | Says | Status | Evidence |
|----|------|--------|----------|
| A001 | Cloudflare Workers detected from wrangler.toml | ✅ SATISFIED | `census-detection.test.ts:26-32` — creates wrangler.toml, asserts `platform: 'Cloudflare Workers'` |
| A002 | Cloudflare Workers detected from wrangler.jsonc | ✅ SATISFIED | `census-detection.test.ts:35-41` — creates wrangler.jsonc, asserts platform match |
| A003 | Helm detected from Chart.yaml | ✅ SATISFIED | `census-detection.test.ts:52-58` — creates Chart.yaml, asserts `platform: 'Helm'` |
| A004 | Kubernetes detected from kustomization.yaml | ✅ SATISFIED | `census-detection.test.ts:60-66` — creates kustomization.yaml, asserts `platform: 'Kubernetes'` |
| A005 | AWS CDK detected from cdk.json | ✅ SATISFIED | `census-detection.test.ts:69-75` — creates cdk.json, asserts `platform: 'AWS CDK'` |
| A006 | Pulumi detected from Pulumi.yaml | ✅ SATISFIED | `census-detection.test.ts:79-84` — creates Pulumi.yaml, asserts `platform: 'Pulumi'` |
| A007 | Serverless Framework detected from serverless.yml | ✅ SATISFIED | `census-detection.test.ts:88-93` — creates serverless.yml, asserts `platform: 'Serverless Framework'` |
| A008 | Existing platforms like Docker and Vercel still work | ✅ SATISFIED | `census-detection.test.ts:105-112` — creates Dockerfile + vercel.json, asserts both platforms present |
| A009 | CircleCI detected from .circleci/config.yml | ✅ SATISFIED | `census-detection.test.ts:142-151` — creates .circleci/config.yml, asserts exact entry match |
| A010 | Jenkins detected from Jenkinsfile | ✅ SATISFIED | `census-detection.test.ts:154-159` — creates Jenkinsfile, asserts exact entry match |
| A011 | Bitbucket Pipelines detected from bitbucket-pipelines.yml | ✅ SATISFIED | `census-detection.test.ts:163-170` — creates file, asserts exact entry match |
| A012 | GitHub Actions detection still works | ✅ SATISFIED | `census-detection.test.ts:174-182` — creates .github/workflows/ci.yml, asserts `system: 'GitHub Actions'` |
| A013 | Nx monorepos labeled as Nx | ✅ SATISFIED | `census-detection.test.ts:238-241` — creates nx.json, helper returns `'Nx (pnpm)'` containing "Nx". Note: tests replicated helper, not actual scan-engine.ts ternary (see Findings) |
| A014 | Turborepo monorepos still show Turborepo label | ✅ SATISFIED | `census-detection.test.ts:244-246` — creates turbo.json, helper returns `'Turborepo (pnpm)'` |
| A015 | Turborepo wins when both turbo.json and nx.json exist | ✅ SATISFIED | `census-detection.test.ts:250-254` — creates both files, helper returns `'Turborepo (npm)'` |
| A016 | Monorepos without Turbo or Nx show generic label | ✅ SATISFIED | `census-detection.test.ts:257-259` — no files created, helper returns `'yarn monorepo'` |
| A017 | Groq AI provider detected via Vercel AI SDK | ✅ SATISFIED | `ai-sdk-detection.test.ts:183-186` — `detectServiceDeps({'@ai-sdk/groq': '1.0.0'})` asserts exact `{name: 'Vercel AI (Groq)', category: 'ai'}` |
| A018 | DeepSeek AI provider detected via Vercel AI SDK | ✅ SATISFIED | `ai-sdk-detection.test.ts:189-192` — asserts exact `{name: 'Vercel AI (DeepSeek)', category: 'ai'}` |
| A019 | xAI provider detected via Vercel AI SDK | ✅ SATISFIED | `ai-sdk-detection.test.ts:195-198` — asserts exact `{name: 'Vercel AI (xAI)', category: 'ai'}` |
| A020 | Unknown AI providers caught by wildcard | ✅ SATISFIED | `ai-sdk-detection.test.ts:214-217` — `@ai-sdk/newprovider` produces `'Vercel AI (Newprovider)'` |
| A021 | Wildcard provider names properly capitalized | ✅ SATISFIED | `ai-sdk-detection.test.ts:214-217` — same test, asserts `'Vercel AI (Newprovider)'` (capital N) |
| A022 | Framework packages not mistaken for AI providers | ✅ SATISFIED | `ai-sdk-detection.test.ts:220-230` — react, svelte, vue all excluded from service names |
| A023 | Utility packages not mistaken for AI providers | ✅ SATISFIED | `ai-sdk-detection.test.ts:233-238` — provider-utils excluded, both capitalization variants checked |
| A024 | Explicit entries not duplicated by wildcard | ✅ SATISFIED | `ai-sdk-detection.test.ts:248-258` — uniqueNames.size === names.length (zero duplicates) |
| A025 | Existing AI provider detection still works | ✅ SATISFIED | `ai-sdk-detection.test.ts:201-209` — Anthropic and OpenAI both present in service names |

## Independent Findings

**Predictions resolved:**

1. *Predicted: workspace label tests don't test the real code path.* **Confirmed.** The tests at `census-detection.test.ts:227-235` define a `getWorkspaceLabel` helper that replicates the scan-engine.ts ternary. The logic matches the current implementation, but if someone edits scan-engine.ts without updating the test helper, tests pass on broken code. The spec acknowledged this: "verify through the full scan path" was the alternative. This is a reasonable trade-off given that testing through `buildCensus` → full scan requires significantly more setup, but it's a testing gap.

2. *Predicted: wildcard capitalization might produce odd results for hyphenated providers.* **Confirmed as dormant.** `@ai-sdk/openai-compatible` is explicit, so the wildcard doesn't touch it. But a hypothetical `@ai-sdk/foo-bar` would produce `Vercel AI (Foo-bar)` — the spec says "first letter uppercase, rest lowercase" which is exactly what `.charAt(0).toUpperCase() + .slice(1).toLowerCase()` does. Working as specified, but the hyphen case looks inconsistent. No test covers a hyphenated wildcard input.

3. *Predicted: over-building in AI packages.* **Confirmed.** `@openrouter/ai-sdk-provider: 'Vercel AI (OpenRouter)'` at `dependencies.ts:124` was not in the spec's 7 explicit entries. Zero test coverage for this entry. The addition is reasonable (OpenRouter is a real provider), but it's unspecified and untested.

4. *Predicted: scan-engine import missing.* **Not found.** `existsSync` is correctly imported from `node:fs` at `scan-engine.ts:15`.

5. *Surprised: `AI_SDK_EXCLUSIONS` allocated inside function.* The Set is recreated on every `detectServiceDeps` call. Since this is called once per scan it's negligible, but it's idiomatic to define constant sets at module level.

**Production risk:**
- The wildcard loop iterates `Object.keys(allDeps)` — in a project with 200+ deps, this is still O(n) per scan. Negligible for current usage but would matter if `detectServiceDeps` were ever called in a hot path.

## AC Walkthrough

- **AC1** (wrangler.toml → Cloudflare Workers): ✅ PASS — `census.ts:74` map entry, test at `census-detection.test.ts:26-32`
- **AC2** (wrangler.jsonc → Cloudflare Workers): ✅ PASS — `census.ts:76` map entry, test at `census-detection.test.ts:35-41`
- **AC3** (.circleci/config.yml → CircleCI): ✅ PASS — `census.ts:344` existsSync check, test at `census-detection.test.ts:142-151`
- **AC4** (Jenkinsfile → Jenkins): ✅ PASS — `census.ts:349` existsSync check, test at `census-detection.test.ts:154-159`
- **AC5** (bitbucket-pipelines.yml → Bitbucket Pipelines): ✅ PASS — `census.ts:354` existsSync check, test at `census-detection.test.ts:163-170`
- **AC6** (nx.json → Nx label): ✅ PASS — `scan-engine.ts:769-770` ternary branch, test at `census-detection.test.ts:238-241`
- **AC7** (turbo.json → Turborepo unchanged): ✅ PASS — `scan-engine.ts:767-768` ternary branch, test at `census-detection.test.ts:244-246`
- **AC8** (neither → generic monorepo): ✅ PASS — `scan-engine.ts:771` fallback, test at `census-detection.test.ts:257-259`
- **AC9** (@ai-sdk/groq → Vercel AI (Groq)): ✅ PASS — `dependencies.ts:117` map entry, test at `ai-sdk-detection.test.ts:183-186`
- **AC10** (@ai-sdk/deepseek → Vercel AI (DeepSeek)): ✅ PASS — `dependencies.ts:119` map entry, test at `ai-sdk-detection.test.ts:189-192`
- **AC11** (wildcard catches unknown @ai-sdk): ✅ PASS — `dependencies.ts:362-373` wildcard loop, test at `ai-sdk-detection.test.ts:214-217`
- **AC12** (@ai-sdk/react NOT caught): ✅ PASS — `dependencies.ts:356` exclusion set, test at `ai-sdk-detection.test.ts:220-230`
- **AC13** (no regressions): ✅ PASS — 2589 tests passed (baseline was 2556 passed + 2 skipped = 2558 total; now 2589 passed + 2 skipped = 2591 total; 33 new tests, zero regressions)
- **AC14** (Chart.yaml, kustomization.yaml, cdk.json, Pulumi.yaml, serverless.yml): ✅ PASS — all map entries present at `census.ts:77-82`, tests at `census-detection.test.ts:52-98`
- **AC15** (wildcard capitalization): ✅ PASS — `dependencies.ts:367` `charAt(0).toUpperCase() + slice(1).toLowerCase()`, test at `ai-sdk-detection.test.ts:214-217` checks "Newprovider" (capital N)
- **AC16** (tests pass): ✅ PASS — `pnpm run test -- --run`: 2589 passed, 2 skipped
- **AC17** (build clean): ✅ PASS — `pnpm run build`: typecheck + tsup clean
- **AC18** (lint passes): ✅ PASS — 0 errors (1 pre-existing warning unrelated to this build)

## Blockers

None. All 25 contract assertions satisfied. All 18 ACs pass. No regressions (33 new tests added, baseline tests unchanged). Checked for: unused exports in new code (discoverDeployments and discoverCiWorkflows exported and tested), unused parameters (all function parameters used), error paths (census.ts catch blocks are pre-existing graceful degradation), external assumptions (all tests use temp directories with real filesystem fixtures).

## Findings

- **Test — Workspace label tests verify replicated logic, not actual scan-engine.ts:** `packages/cli/tests/engine/census-detection.test.ts:227-235` — The `getWorkspaceLabel` helper replicates the scan-engine.ts ternary. If the ternary changes without updating the test helper, tests pass on broken code. The spec acknowledged this trade-off (testing through full scan requires heavy setup). A future refactor could extract the ternary to a shared utility imported by both scan-engine.ts and the test.

- **Code — @openrouter/ai-sdk-provider added but not in spec:** `packages/cli/src/engine/detectors/dependencies.ts:124` — The spec listed 7 explicit AI_PACKAGES entries; the builder added 8 (including `@openrouter/ai-sdk-provider: 'Vercel AI (OpenRouter)'`). No test covers this entry. The addition is sensible (OpenRouter is a real provider), but it's unspecified, untested surface area.

- **Code — AI_SDK_EXCLUSIONS allocated inside function body:** `packages/cli/src/engine/detectors/dependencies.ts:355-360` — The Set is recreated on every `detectServiceDeps` call. Since the function runs once per scan, this is negligible. Idiomatic pattern would be a module-level constant, consistent with `AI_PACKAGES`, `EMAIL_PACKAGES`, etc.

- **Test — No test for hyphenated wildcard provider names:** `packages/cli/tests/engine/detectors/ai-sdk-detection.test.ts` — The wildcard capitalization is tested with `newprovider` and `someprovider` (single words). A hypothetical `@ai-sdk/foo-bar` would produce `Vercel AI (Foo-bar)` — correct per spec but visually inconsistent. Worth a test to document the behavior.

## Deployer Handoff

Clean addition — 9 new deployment platform entries, 3 new CI system checks, Nx workspace detection, and @ai-sdk wildcard provider catch. 33 new tests across 2 files (1 new, 1 extended). No breaking changes to existing detection.

The `@openrouter/ai-sdk-provider` entry was added beyond spec — it works but has no test. Consider adding a test or removing it if you want strict spec compliance.

The workspace label tests use a replicated helper rather than testing through scan-engine.ts directly. If the scan-engine ternary is ever refactored, update `getWorkspaceLabel` in `census-detection.test.ts` too.

## Verdict

**Shippable:** YES

All 25 contract assertions satisfied. All 18 acceptance criteria pass. 2589 tests pass with zero regressions. Build and lint clean. The implementation follows existing patterns precisely — map entries for deployments, existsSync checks for CI, ternary extension for Nx, wildcard loop for @ai-sdk. The four findings are observations (replicated test helper, one unspecified entry, allocation style, missing edge case test) — none prevent shipping.
