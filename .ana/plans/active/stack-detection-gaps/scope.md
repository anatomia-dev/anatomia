# Scope: Stack Detection Gaps (V2-Alpha Breadth Sweep)

**Created by:** Ana
**Date:** 2026-05-19

## Intent

V2-Alpha testing across 20 real open-source repos revealed detection gaps in four areas: deployment platforms, CI systems, workspace tools, and Vercel AI provider packages. The core stack detection (language, framework, database, auth, testing) is strong. The gaps are in areas where the ecosystem moved in 2025-2026 and our detection maps haven't kept pace.

This is a breadth sweep — lots of small additions (1-3 lines each) to existing detection maps. No architectural changes. No new systems. Cloudflare Workers is the priority gap: 4 of 20 test repos use it and it's undetected. Nx is used by 3 of 20. The @ai-sdk provider list has 26 missing packages. Closing these gaps makes the scan output more complete for both the sniper customer (TS monorepo with modern tooling) and the shotgun customer (established team with diverse CI/deploy infrastructure).

## Complexity Assessment

- **Kind:** chore
- **Size:** small — 4 files changed, ~50 lines added, all additions to existing maps/functions
- **Files affected:**
  - `packages/cli/src/engine/census.ts` — add entries to DEPLOYMENT_CONFIGS map, add CI system checks to `discoverCiWorkflows`
  - `packages/cli/src/engine/scan-engine.ts` — add `nx.json` check alongside `turbo.json` in workspace display (~3 lines)
  - `packages/cli/src/engine/detectors/dependencies.ts` — add @ai-sdk/* provider packages to AI_PACKAGES map, add wildcard match for future providers to `detectServiceDeps`
- **Blast radius:** Scan output gains new entries. Deployment platforms, CI systems, AI provider services, and workspace tool labels can now appear that didn't before. Nothing previously detected changes. No schema changes. No downstream consumer changes.
- **Estimated effort:** 1 pipeline cycle (fast — mostly map additions)
- **Multi-phase:** no

## Approach

Four independent additions to existing detection infrastructure, shipped together because they're all the same class of fix (map gaps) and were discovered in the same V2-Alpha testing.

**1. Deployment platforms.** Add Cloudflare Workers (`wrangler.toml`, `wrangler.json`, `wrangler.jsonc`), Helm (`Chart.yaml`), Kubernetes (`kustomization.yaml`), AWS CDK (`cdk.json`), Pulumi (`Pulumi.yaml`), and Serverless Framework (`serverless.yml`, `serverless.yaml`) to the DEPLOYMENT_CONFIGS map in census.ts. These are 1-line entries following the existing pattern. The detection checks per-source-root, which handles wrangler configs inside workspace packages (Cap's `apps/discord-bot/wrangler.jsonc`, Novu's `enterprise/workers/*/wrangler.jsonc`).

**2. CI systems.** Add CircleCI (`.circleci/config.yml`), Jenkins (`Jenkinsfile`), and Bitbucket Pipelines (`bitbucket-pipelines.yml`) to `discoverCiWorkflows` in census.ts. Follow the GitLab CI pattern — single file existence check, not directory listing. These are repo-root checks (CI configs are always at repo root).

**3. Nx workspace detection.** Add `nx.json` check alongside `turbo.json` in scan-engine.ts workspace display. Currently: `turbo.json` exists → "Turborepo (pnpm)", else → "pnpm monorepo". New: `turbo.json` → "Turborepo (pnpm)", `nx.json` → "Nx (pnpm)", else → "pnpm monorepo". 3 of 20 test repos use Nx (Novu, Refine, Twenty).

**4. @ai-sdk provider packages.** Two changes. First, add the 7 highest-priority missing providers to AI_PACKAGES: `@ai-sdk/groq`, `@ai-sdk/xai`, `@ai-sdk/deepseek`, `@ai-sdk/perplexity`, `@ai-sdk/gateway`, `@ai-sdk/mcp`, `@ai-sdk/openai-compatible`. These are the providers most likely to appear in our customers' repos (Groq, xAI, DeepSeek are growing fast; Gateway and MCP are Vercel infrastructure). Second, add a wildcard catch in `detectServiceDeps` for any `@ai-sdk/*` package not already in the map — display as "Vercel AI ({provider})" where {provider} is extracted from the package name. This catches the remaining 19 providers and any future additions without code changes. The wildcard excludes known non-provider packages (`react`, `svelte`, `vue`, `solid`, `angular`, `provider`, `provider-utils`, `rsc`, `otel`, `codemod`, `devtools`, `test-server`, `valibot`, `workflow`, `core`, `open-responses`). The wildcard checks each `@ai-sdk/*` dependency against `Object.keys(AI_PACKAGES)` before processing — packages with explicit map entries are skipped to prevent duplicates with different casing.

## Acceptance Criteria

- AC1: Scanning a repo with `wrangler.toml` in a workspace package detects "Cloudflare Workers" as a deployment platform
- AC2: Scanning a repo with `wrangler.jsonc` detects "Cloudflare Workers"
- AC3: Scanning a repo with `.circleci/config.yml` detects "CircleCI" as a CI system
- AC4: Scanning a repo with `Jenkinsfile` at root detects "Jenkins" as a CI system
- AC5: Scanning a repo with `bitbucket-pipelines.yml` detects "Bitbucket Pipelines" as a CI system
- AC6: Scanning a monorepo with `nx.json` (no `turbo.json`) shows "Nx ({tool})" as workspace label
- AC7: Scanning a monorepo with `turbo.json` still shows "Turborepo ({tool})" (unchanged)
- AC8: Scanning a monorepo with neither `turbo.json` nor `nx.json` still shows "{tool} monorepo" (unchanged)
- AC9: `@ai-sdk/groq` in dependencies is detected as "Vercel AI (Groq)" in externalServices
- AC10: `@ai-sdk/deepseek` in dependencies is detected as "Vercel AI (DeepSeek)"
- AC11: A hypothetical `@ai-sdk/newprovider` not in the explicit map is caught by the wildcard and displayed as "Vercel AI (Newprovider)"
- AC12: `@ai-sdk/react` (a framework package, not a provider) is NOT caught by the wildcard
- AC13: All existing deployment, CI, workspace, and AI provider detection continues to work (no regressions)
- AC14: Scanning repos with `Chart.yaml`, `kustomization.yaml`, `cdk.json`, `Pulumi.yaml`, `serverless.yml` at source root detects the corresponding platform
- AC15: Wildcard-generated display name has correct capitalization — `@ai-sdk/deepseek` produces "Vercel AI (Deepseek)" not "Vercel AI (deepseek)"

## Edge Cases & Risks

- **Helm/Kubernetes configs not at source root.** Twenty has `Chart.yaml` at `packages/twenty-docker/helm/twenty/Chart.yaml` — 2 levels deep within a source root. The per-source-root detection checks `path.join(root.absolutePath, file)` which only matches root-level files within each source root. Chart.yaml 2 levels deep is NOT detected. This is a known limitation of the per-source-root detection architecture — documented, not fixed here. The deployment map catches `Chart.yaml` when it's at the root of any workspace package.
- **wrangler.jsonc format.** Cloudflare migrated from `.toml` to `.jsonc` in recent versions. 3 of 4 repos with Cloudflare use `.jsonc`, 1 uses `.toml`. All three formats (`.toml`, `.json`, `.jsonc`) are added.
- **@ai-sdk wildcard false positives.** The wildcard could match internal/utility packages like `@ai-sdk/provider-utils`. The exclusion list filters these out. The exclusion list is: `react`, `svelte`, `vue`, `solid`, `angular`, `provider`, `provider-utils`, `rsc`, `otel`, `codemod`, `devtools`, `test-server`, `valibot`, `workflow`, `core`, `open-responses`, `langchain`, `llamaindex`, `vercel`. If Vercel adds a new non-provider package we haven't excluded, it would appear as a service entry — wrong category but harmless (no crash, just a spurious service in the list).
- **Nx + Turbo coexistence.** If both `nx.json` and `turbo.json` exist, Turbo wins (checked first). This is the conservative choice — Turborepo is more common in our customer segment.
- **Serverless Framework yml vs yaml.** Both extensions are standard. Both added.
- **Biome detection.** 10/20 repos use Biome. Currently detected in lint commands and git hooks but not surfaced as a stack field. Adding a `linting` field to EngineResult would change the schema and affect all consumers. Not worth the schema change for V2-Alpha — the lint command detection is sufficient. Deferred.

## Rejected Approaches

**Adding a `linting` field to EngineResult.** Would surface Biome, ESLint, Prettier as first-class stack entries. Schema change affects all consumers (scan display, init generators, skills, agents). The existing lint command detection covers the use case for agents (they can see "lint: biome check" in the commands). Not worth the blast radius for V2-Alpha.

**Enumerating all 26 missing @ai-sdk providers individually.** The GitHub monorepo has 55+ packages under @ai-sdk/, 26+ of which are provider packages. Enumerating each with a display name is brittle — new providers appear regularly. The hybrid approach (7 high-priority explicit entries + wildcard catch for the rest) balances precision for common providers with coverage for the long tail.

**Recursive deployment config detection.** Searching subdirectories within source roots for `Chart.yaml`, `kustomization.yaml`, etc. Would require changing `discoverDeployments` from a flat per-root check to a recursive search. Higher I/O cost, different detection architecture. The per-root check catches the common case (deployment configs at workspace package root). Documented as limitation for nested configs.

## Open Questions

None — all investigation questions resolved.

## Exploration Findings

### Patterns Discovered

- Cloudflare configs are inside workspace packages, not at repo root: Cap `apps/discord-bot/wrangler.jsonc`, LobeChat `apps/device-gateway/wrangler.toml`, Novu `enterprise/workers/*/wrangler.jsonc`, Twenty `packages/twenty-website/wrangler.jsonc`. The per-source-root detection handles this correctly for workspace packages that are census source roots.
- `.jsonc` is the current Cloudflare format (3 of 4 repos). `.toml` is legacy but still used. `.json` is the middle format. All three should be supported.
- GitLab CI detection (census.ts:319-321) uses simple `existsSync` — CircleCI, Jenkins, and Bitbucket follow this exact pattern.
- The @ai-sdk GitHub monorepo has 55+ packages. Non-provider packages include: react, svelte, vue, solid, angular, provider, provider-utils, rsc, otel, codemod, devtools, test-server, valibot, workflow, core, open-responses, langchain, llamaindex, vercel. Everything else is a provider.
- `detectServiceDeps` iterates over `AI_PACKAGES` map entries. The wildcard catch needs to go AFTER the map iteration — it processes remaining `@ai-sdk/*` deps that weren't matched by explicit entries.

### Constraints Discovered

- [OBSERVED] 4/20 repos have Cloudflare Workers configs: Cap, LobeChat, Novu, Twenty
- [OBSERVED] 3/20 repos use Nx: Novu, Refine, Twenty. All show as "{tool} monorepo" instead of "Nx ({tool})"
- [OBSERVED] Twenty's Chart.yaml is at `packages/twenty-docker/helm/twenty/Chart.yaml` — 2 levels deep within source root, not detected by per-root check
- [OBSERVED] 0/20 repos have CircleCI, Jenkins, or Bitbucket Pipelines (these are shotgun customer coverage, not evidence-based from test repos)
- [OBSERVED] Vercel AI SDK has 36+ provider packages on GitHub. We detect 10. Missing 26.

### Test Infrastructure

- No dedicated tests for DEPLOYMENT_CONFIGS map or `discoverCiWorkflows` — these are tested through integration in scan-engine tests and init tests. New entries don't need new tests (map additions follow established pattern).
- AI_PACKAGES wildcard catch will need a test — it's new behavior beyond a map addition.
- Nx workspace detection will need a test case alongside the existing Turborepo tests.

## For AnaPlan

### Structural Analog

The existing DEPLOYMENT_CONFIGS map (census.ts:60-74) is the analog for deployment additions — each entry is `'filename': 'Platform Name'`. The GitLab CI detection (census.ts:319-321) is the analog for new CI system checks. The `turbo.json` ternary (scan-engine.ts:767-769) is the analog for the Nx check.

### Relevant Code Paths

- `packages/cli/src/engine/census.ts:60-74` — DEPLOYMENT_CONFIGS map (add entries)
- `packages/cli/src/engine/census.ts:300-324` — `discoverCiWorkflows` function (add CI checks)
- `packages/cli/src/engine/scan-engine.ts:766-770` — workspace display ternary (add Nx check)
- `packages/cli/src/engine/detectors/dependencies.ts:100-130` — AI_PACKAGES map (add providers)
- `packages/cli/src/engine/detectors/dependencies.ts:323-347` — `detectServiceDeps` function (add wildcard catch)

### Patterns to Follow

- DEPLOYMENT_CONFIGS: `'filename': 'Platform Name'` — 1 line per entry
- discoverCiWorkflows: `if (existsSync(path.join(rootPath, 'path'))) entries.push({ system: 'Name', workflowFiles: ['path'] })` — GitLab CI pattern
- Workspace display: nested ternary — `turbo.json ? 'Turborepo' : nx.json ? 'Nx' : 'monorepo'`
- AI_PACKAGES: `'@ai-sdk/provider': 'Vercel AI (Provider)'` — 1 line per entry, exact display name convention

### Known Gotchas

- The `existsSync` import is already in census.ts (used by deployment and CI discovery). No new imports needed.
- The workspace display ternary is inline in the `stack` object literal (scan-engine.ts:766-770). Adding `nx.json` extends the ternary to three levels. Keep it readable — possibly extract to a helper if the ternary gets unwieldy, but 3 levels is acceptable.
- The wildcard catch in `detectServiceDeps` must run AFTER the map iteration loop, not inside it. It processes deps that start with `@ai-sdk/` but weren't matched by any explicit AI_PACKAGES entry. The display name is derived from the package name: `@ai-sdk/groq` → "Vercel AI (Groq)" with the provider name capitalized.
- The exclusion list for the wildcard must be maintained. When Vercel adds new non-provider `@ai-sdk/*` packages, they need to be added to the exclusion list. Document this.

### Things to Investigate

None — all questions resolved during investigation.
