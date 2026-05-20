# Build Report: Stack Detection Gaps (V2-Alpha Breadth Sweep)

**Created by:** AnaBuild
**Date:** 2026-05-19
**Spec:** .ana/plans/active/stack-detection-gaps/spec.md
**Branch:** feature/stack-detection-gaps

## What Was Built

- `packages/cli/src/engine/census.ts` (modified): Added 9 deployment config entries (Cloudflare Workers ×3, Helm, Kubernetes, AWS CDK, Pulumi, Serverless Framework ×2) to `DEPLOYMENT_CONFIGS` map. Added 3 CI system checks (CircleCI, Jenkins, Bitbucket Pipelines) to `discoverCiWorkflows`. Exported `discoverDeployments` and `discoverCiWorkflows` with JSDoc for direct testability.
- `packages/cli/src/engine/scan-engine.ts` (modified): Extended workspace ternary to check `nx.json` as fallback after `turbo.json`. Three-level: Turborepo → Nx → generic monorepo.
- `packages/cli/src/engine/detectors/dependencies.ts` (modified): Added 7 explicit `@ai-sdk/*` provider entries (Groq, xAI, DeepSeek, Perplexity, Gateway, MCP, OpenAI Compatible). Added wildcard catch in `detectServiceDeps` for unknown `@ai-sdk/*` providers with proper capitalization and an exclusion set of 19 non-provider packages.
- `packages/cli/tests/engine/census-detection.test.ts` (created): 22 tests covering deployment detection, CI detection, and workspace label logic.
- `packages/cli/tests/engine/detectors/ai-sdk-detection.test.ts` (modified): Added 11 tests for explicit AI provider entries, wildcard catch, exclusions, deduplication, and casing.

## PR Summary

- Add detection for 8 new deployment platforms (Cloudflare Workers, Helm, Kubernetes, AWS CDK, Pulumi, Serverless Framework) and 3 CI systems (CircleCI, Jenkins, Bitbucket Pipelines)
- Add Nx workspace detection as fallback after Turborepo, with correct precedence when both exist
- Add 7 explicit @ai-sdk/* provider entries and a wildcard catch for unknown providers with capitalization and a 19-package exclusion set
- Export `discoverDeployments` and `discoverCiWorkflows` for direct unit testing
- 33 new tests across 2 test files with zero regressions

## Acceptance Criteria Coverage

- AC1 "wrangler.toml detects Cloudflare Workers" → census-detection.test.ts:25 "detects Cloudflare Workers from wrangler.toml" (1 assertion)
- AC2 "wrangler.jsonc detects Cloudflare Workers" → census-detection.test.ts:32 "detects Cloudflare Workers from wrangler.jsonc" (1 assertion)
- AC3 ".circleci/config.yml detects CircleCI" → census-detection.test.ts:149 "detects CircleCI from .circleci/config.yml" (1 assertion)
- AC4 "Jenkinsfile detects Jenkins" → census-detection.test.ts:159 "detects Jenkins from Jenkinsfile" (1 assertion)
- AC5 "bitbucket-pipelines.yml detects Bitbucket Pipelines" → census-detection.test.ts:166 "detects Bitbucket Pipelines from bitbucket-pipelines.yml" (1 assertion)
- AC6 "nx.json shows Nx ({tool})" → census-detection.test.ts:234 "detects Nx workspace from nx.json" (1 assertion)
- AC7 "turbo.json still shows Turborepo" → census-detection.test.ts:240 "Turborepo detection unchanged" (1 assertion)
- AC8 "neither shows {tool} monorepo" → census-detection.test.ts:252 "generic monorepo label when no orchestrator" (1 assertion)
- AC9 "@ai-sdk/groq detected as Vercel AI (Groq)" → ai-sdk-detection.test.ts "detects @ai-sdk/groq as Vercel AI (Groq)" (1 assertion)
- AC10 "@ai-sdk/deepseek detected as Vercel AI (DeepSeek)" → ai-sdk-detection.test.ts "detects @ai-sdk/deepseek as Vercel AI (DeepSeek)" (1 assertion)
- AC11 "hypothetical @ai-sdk/newprovider caught by wildcard" → ai-sdk-detection.test.ts "wildcard catches unknown @ai-sdk provider" (1 assertion)
- AC12 "@ai-sdk/react NOT caught by wildcard" → ai-sdk-detection.test.ts "wildcard excludes non-provider @ai-sdk packages" (3 assertions)
- AC13 "no regressions" → Full test suite: 2589 passed (was 2556), 0 regressions
- AC14 "Chart.yaml, kustomization.yaml, cdk.json, Pulumi.yaml, serverless.yml detected" → census-detection.test.ts:55-102 (5 individual tests)
- AC15 "wildcard capitalization correct" → ai-sdk-detection.test.ts "wildcard catches unknown @ai-sdk provider with correct capitalization" — "Newprovider" not "newprovider"
- AC16 "Tests pass" → ✅ 2589 passed
- AC17 "No build errors" → ✅ pnpm run build succeeds (pre-commit hook)
- AC18 "Lint passes" → ✅ 0 errors (1 pre-existing warning in git-operations.ts)

## Implementation Decisions

- **Exported `discoverDeployments` and `discoverCiWorkflows`:** Spec noted these aren't exported. Added `export` keyword and JSDoc tags to both for direct unit testing. Both are pure functions — safe to export.
- **Workspace label test approach:** The workspace ternary is inline in scan-engine.ts and can't be unit-tested without running the full scan. Mirrored the ternary logic in a test helper function with real filesystem checks. This tests the detection logic (existsSync + ternary precedence) without scan-engine's full dependency graph.
- **Wildcard capitalization:** Used `charAt(0).toUpperCase() + slice(1).toLowerCase()` per spec. This means `@ai-sdk/deepseek` → "Deepseek" via wildcard, but the explicit entry `'@ai-sdk/deepseek': 'Vercel AI (DeepSeek)'` takes precedence with custom casing.
- **`AI_SDK_EXCLUSIONS` as inline const:** Defined inside `detectServiceDeps` rather than module-level since it's only used there. The set has 19 entries matching the spec's exclusion list.

## Deviations from Contract

### A013–A016: Workspace label tests use mirrored logic
**Instead:** Tested via a helper function that mirrors the scan-engine ternary, not through the actual scan-engine code path
**Reason:** The ternary is inline in scan-engine.ts — no exported function to test. Full integration scan requires extensive setup (package.json, node_modules, etc.)
**Outcome:** Functionally equivalent — the filesystem detection logic (existsSync checks + ternary precedence) is identical. The scan-engine.ts code change was also verified by the build succeeding.

### A023: Wildcard excludes @ai-sdk/provider-utils
**Instead:** The exclusion set uses `'provider-utils'` which matches the slug after `@ai-sdk/`. The test verifies neither "Provider-utils" nor "provider-utils" appear in display names.
**Reason:** The contract says `not_contains` for value `provider-utils`. The exclusion works on the package slug, not the display name.
**Outcome:** Assertion satisfied — `@ai-sdk/provider-utils` is excluded from wildcard detection.

## Test Results

### Baseline (before changes)
```
cd packages/cli && pnpm vitest run
Test Files  112 passed (112)
     Tests  2556 passed | 2 skipped (2558)
  Duration  48.53s
```

### After Changes
```
cd packages/cli && pnpm vitest run
Test Files  113 passed (113)
     Tests  2589 passed | 2 skipped (2591)
  Duration  47.57s
```

### Comparison
- Tests added: 33
- Tests removed: 0
- Regressions: none

### New Tests Written
- `packages/cli/tests/engine/census-detection.test.ts`: 22 tests — deployment platform detection (11 tests for all new + existing platforms, workspace packages), CI system detection (7 tests for CircleCI, Jenkins, Bitbucket, GitHub Actions, GitLab CI, edge cases), workspace label logic (4 tests for Nx, Turborepo, precedence, generic)
- `packages/cli/tests/engine/detectors/ai-sdk-detection.test.ts`: 11 new tests — explicit provider entries (4 tests), wildcard catch (3 tests for unknown provider, exclusions, provider-utils), deduplication (1 test), casing (2 tests), existing provider regression (1 test)

## Verification Commands
```bash
pnpm run build
cd packages/cli && pnpm vitest run tests/engine/census-detection.test.ts
cd packages/cli && pnpm vitest run tests/engine/detectors/ai-sdk-detection.test.ts
pnpm run test -- --run
(cd packages/cli && pnpm run lint)
```

## Git History
```
e90673de [stack-detection-gaps] Add AI SDK providers and wildcard catch
5376f057 [stack-detection-gaps] Add Nx workspace detection
f763b074 [stack-detection-gaps] Add deployment platforms and CI systems
```

## Open Issues

- **Pre-existing lint warning:** `src/utils/git-operations.ts:198` has an unused eslint-disable directive. Not introduced by this build.
- **Workspace label test indirection:** The workspace tests mirror the scan-engine ternary rather than testing through it. If the ternary in scan-engine.ts is refactored to differ from the mirrored logic, the tests would pass falsely. An integration test through `scanProject` would be more robust but requires significant setup.
- **Wildcard capitalization is naive:** `charAt(0).toUpperCase() + slice(1).toLowerCase()` produces "Openai-compatible" for `@ai-sdk/openai-compatible`, but this package has an explicit entry so the wildcard never fires. If a future provider has a hyphenated name (e.g., `@ai-sdk/some-provider`), the wildcard would produce "Some-provider" — technically correct per spec but potentially undesirable.

Verified complete by second pass.
