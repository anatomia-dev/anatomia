# Spec: Stack Detection Gaps (V2-Alpha Breadth Sweep)

**Created by:** AnaPlan
**Date:** 2026-05-19
**Scope:** .ana/plans/active/stack-detection-gaps/scope.md

## Approach

Four independent additions to existing detection maps and functions. No architectural changes — every addition follows an established pattern within the same file.

1. **Deployment platforms** — 8 new entries to `DEPLOYMENT_CONFIGS` in census.ts. The map drives `discoverDeployments`, which iterates source roots and checks `existsSync` for each key. Adding entries is the only change needed.

2. **CI systems** — 3 new `existsSync` checks in `discoverCiWorkflows` in census.ts. Follow the GitLab CI pattern (lines 318-321): single file check, push entry with `system` and `workflowFiles`. CircleCI uses a subdirectory path (`.circleci/config.yml`), Jenkins and Bitbucket use root-level files.

3. **Nx workspace detection** — Extend the existing `turbo.json` ternary in scan-engine.ts (line 767) to check `nx.json` as a fallback. Three-level ternary: Turbo wins if both exist.

4. **@ai-sdk wildcard provider catch** — Two changes in dependencies.ts. First, add 7 explicit entries to `AI_PACKAGES`. Second, add a wildcard catch loop in `detectServiceDeps` AFTER the main map iteration. The wildcard iterates `Object.keys(allDeps)`, filters for `@ai-sdk/*` prefixed packages, skips those already in `AI_PACKAGES` or in an exclusion set of known non-provider packages, capitalizes the provider name, and pushes to services with category `'ai'`.

## Output Mockups

**Deployment detection (scan output with Cloudflare Workers):**
```
Deployment: Cloudflare Workers (apps/discord-bot/wrangler.jsonc)
```

**CI detection:**
```
CI: CircleCI (.circleci/config.yml)
CI: Jenkins (Jenkinsfile)
```

**Nx workspace label:**
```
Workspace: Nx (pnpm)
```

**AI provider wildcard (scan.json externalServices):**
```json
{ "name": "Vercel AI (Groq)", "category": "ai" }
{ "name": "Vercel AI (Deepseek)", "category": "ai" }
{ "name": "Vercel AI (Newprovider)", "category": "ai" }
```

Capitalization convention for wildcard: first letter uppercase, rest lowercase. `@ai-sdk/deepseek` → `Deepseek`. `@ai-sdk/xai` → `Xai`. Explicit map entries override this with custom casing where needed (e.g., `@ai-sdk/xai` → `Vercel AI (xAI)` via explicit entry).

## File Changes

### `packages/cli/src/engine/census.ts` (modify)
**What changes:** Add 8 deployment platform entries to `DEPLOYMENT_CONFIGS` map. Add 3 CI system checks to `discoverCiWorkflows`.
**Pattern to follow:** Existing map entries (lines 60-74) for deployments. GitLab CI check (lines 318-321) for CI systems.
**Why:** Without these entries, Cloudflare Workers, Helm, Kubernetes, AWS CDK, Pulumi, and Serverless Framework deployments are invisible to the scan. CI systems beyond GitHub Actions and GitLab CI are undetected.

Deployment entries to add:
- `'wrangler.toml': 'Cloudflare Workers'`
- `'wrangler.json': 'Cloudflare Workers'`
- `'wrangler.jsonc': 'Cloudflare Workers'`
- `'Chart.yaml': 'Helm'`
- `'kustomization.yaml': 'Kubernetes'`
- `'cdk.json': 'AWS CDK'`
- `'Pulumi.yaml': 'Pulumi'`
- `'serverless.yml': 'Serverless Framework'`
- `'serverless.yaml': 'Serverless Framework'`

CI checks to add (after GitLab CI block, before the `return entries`):
- CircleCI: check `.circleci/config.yml`
- Jenkins: check `Jenkinsfile`
- Bitbucket Pipelines: check `bitbucket-pipelines.yml`

### `packages/cli/src/engine/scan-engine.ts` (modify)
**What changes:** Extend the workspace display ternary to include Nx detection.
**Pattern to follow:** The existing ternary at line 767: `existsSync(path.join(rootPath, 'turbo.json')) ? \`Turborepo (${mono.tool})\` : \`${mono.tool} monorepo\``
**Why:** 3 of 20 test repos use Nx. Currently they show as generic "pnpm monorepo" instead of "Nx (pnpm)".

New ternary structure:
```
turbo.json exists → `Turborepo (${mono.tool})`
nx.json exists → `Nx (${mono.tool})`
else → `${mono.tool} monorepo`
```

### `packages/cli/src/engine/detectors/dependencies.ts` (modify)
**What changes:** Add 7 explicit provider entries to `AI_PACKAGES` map. Add a wildcard catch for remaining `@ai-sdk/*` providers in `detectServiceDeps`.
**Pattern to follow:** Existing `AI_PACKAGES` entries (lines 107-116) for explicit additions. The `detectServiceDeps` loop structure (lines 337-344) for the wildcard placement.
**Why:** 26 provider packages are undetected. The hybrid approach (explicit + wildcard) covers the long tail without enumerating all 26+.

Explicit entries to add to `AI_PACKAGES`:
- `'@ai-sdk/groq': 'Vercel AI (Groq)'`
- `'@ai-sdk/xai': 'Vercel AI (xAI)'`
- `'@ai-sdk/deepseek': 'Vercel AI (DeepSeek)'`
- `'@ai-sdk/perplexity': 'Vercel AI (Perplexity)'`
- `'@ai-sdk/gateway': 'Vercel AI (Gateway)'`
- `'@ai-sdk/mcp': 'Vercel AI (MCP)'`
- `'@ai-sdk/openai-compatible': 'Vercel AI (OpenAI Compatible)'`

Wildcard catch in `detectServiceDeps`: after the main map iteration loop ends, iterate `Object.keys(allDeps)` to find `@ai-sdk/*` packages not already handled. The exclusion set of known non-provider packages: `react`, `svelte`, `vue`, `solid`, `angular`, `provider`, `provider-utils`, `rsc`, `otel`, `codemod`, `devtools`, `test-server`, `valibot`, `workflow`, `core`, `open-responses`, `langchain`, `llamaindex`, `vercel`. For each matched package, extract the provider name from the package (part after `@ai-sdk/`), capitalize it (first letter uppercase, rest lowercase), construct display name `Vercel AI (${capitalized})`, and push `{ name, category: 'ai' }` — but only if `!seen.has(name)` (to prevent duplicates with explicit entries that produce the same display name). Also skip packages where the key exists in `AI_PACKAGES` (already processed in the map loop).

## Acceptance Criteria

- [ ] AC1: Scanning a repo with `wrangler.toml` in a workspace package detects "Cloudflare Workers" as a deployment platform
- [ ] AC2: Scanning a repo with `wrangler.jsonc` detects "Cloudflare Workers"
- [ ] AC3: Scanning a repo with `.circleci/config.yml` detects "CircleCI" as a CI system
- [ ] AC4: Scanning a repo with `Jenkinsfile` at root detects "Jenkins" as a CI system
- [ ] AC5: Scanning a repo with `bitbucket-pipelines.yml` detects "Bitbucket Pipelines" as a CI system
- [ ] AC6: Scanning a monorepo with `nx.json` (no `turbo.json`) shows "Nx ({tool})" as workspace label
- [ ] AC7: Scanning a monorepo with `turbo.json` still shows "Turborepo ({tool})" (unchanged)
- [ ] AC8: Scanning a monorepo with neither `turbo.json` nor `nx.json` still shows "{tool} monorepo" (unchanged)
- [ ] AC9: `@ai-sdk/groq` in dependencies is detected as "Vercel AI (Groq)" in externalServices
- [ ] AC10: `@ai-sdk/deepseek` in dependencies is detected as "Vercel AI (DeepSeek)"
- [ ] AC11: A hypothetical `@ai-sdk/newprovider` not in the explicit map is caught by the wildcard and displayed as "Vercel AI (Newprovider)"
- [ ] AC12: `@ai-sdk/react` (a framework package, not a provider) is NOT caught by the wildcard
- [ ] AC13: All existing deployment, CI, workspace, and AI provider detection continues to work (no regressions)
- [ ] AC14: Scanning repos with `Chart.yaml`, `kustomization.yaml`, `cdk.json`, `Pulumi.yaml`, `serverless.yml` at source root detects the corresponding platform
- [ ] AC15: Wildcard-generated display name has correct capitalization — `@ai-sdk/deepseek` produces "Vercel AI (Deepseek)" not "Vercel AI (deepseek)"
- [ ] Tests pass with `pnpm run test -- --run`
- [ ] No build errors with `pnpm run build`
- [ ] Lint passes with `(cd packages/cli && pnpm run lint)`

## Testing Strategy

- **Unit tests for deployment detection:** New test file `packages/cli/tests/engine/census-detection.test.ts`. Test `discoverDeployments` by creating temp directories with deployment config files and asserting the returned entries. Cover: Cloudflare Workers (all 3 extensions), Helm, Kubernetes, AWS CDK, Pulumi, Serverless Framework (both extensions). Also verify existing platforms still detect correctly (regression).
- **Unit tests for CI detection:** Same test file. Test `discoverCiWorkflows` by creating temp directories with CI config files. Cover: CircleCI (with `.circleci/` subdirectory), Jenkins, Bitbucket Pipelines. Verify GitHub Actions and GitLab CI still work.
- **Unit tests for @ai-sdk wildcard:** Add to existing `packages/cli/tests/engine/detectors/ai-sdk-detection.test.ts`. Test `detectServiceDeps` directly. Cover: explicit new providers (groq, xai, deepseek) produce correct entries. Wildcard catch for unknown provider. Wildcard exclusion for framework packages (react, svelte, provider-utils). Capitalization of wildcard names. No duplicate entries when explicit and wildcard would both match.
- **Unit tests for Nx workspace:** Test the ternary logic. This is inline in scan-engine.ts so it can't be tested in isolation without extracting it. Instead, verify through a scan integration test or by testing the `existsSync` logic in a temp directory. A focused test in `census-detection.test.ts` using the workspace label logic would work if the ternary is extracted to a helper — otherwise test through the full scan path.
- **Edge cases:** Wildcard with multi-segment package names (e.g., `@ai-sdk/openai-compatible` — explicit entry, not wildcard). Both `turbo.json` and `nx.json` present (Turbo wins). Empty `.circleci/` directory with no `config.yml` (not detected).

Note: `discoverDeployments` and `discoverCiWorkflows` are not currently exported. They're called from `buildCensus`. To test them directly, they need to be exported. The alternative is testing through `buildCensus`, which requires more setup. Exporting these pure functions is the cleaner approach — they have no side effects beyond filesystem reads.

## Dependencies

None. All changes are additions to existing infrastructure.

## Constraints

- Engine files have zero CLI dependencies (no chalk, no ora).
- All imports use `.js` extensions.
- Exported functions require `@param` and `@returns` JSDoc tags.
- `existsSync` is already imported in census.ts — no new imports needed there.
- `existsSync` must be imported from `node:fs` in scan-engine.ts if not already present (verify — it's already used on line 767 for `turbo.json`).

## Gotchas

- **`discoverDeployments` and `discoverCiWorkflows` are not exported.** To unit test them directly, add `export` keyword. This is a minor change but required for testability. Both are pure functions — safe to export.
- **The `seen` set in `detectServiceDeps` tracks display names, not package names.** The wildcard check must use both: skip packages whose key is in `AI_PACKAGES` (already processed by the map loop) AND skip display names already in `seen` (to prevent duplicates). Example: if `@ai-sdk/groq` is in `AI_PACKAGES` with name `'Vercel AI (Groq)'`, and the wildcard also processes `@ai-sdk/groq`, the map key check prevents the duplicate before it reaches `seen`.
- **`existsSync` in scan-engine.ts.** Verify the import exists before adding the Nx check. It's used on the same line (767) for `turbo.json`, so it must be imported — but confirm the import source is `node:fs`.
- **`serverless.yml` vs `serverless.yaml`.** Both are standard. Add both. Same pattern as `docker-compose.yml`/`docker-compose.yaml` already in the map.
- **CircleCI path is `.circleci/config.yml`** — a subdirectory path, not a root-level file. The `existsSync` check handles this fine, but the `workflowFiles` entry should be `['.circleci/config.yml']` (the full relative path), not just `['config.yml']`.

## Build Brief

### Rules That Apply
- All imports use `.js` extensions and `node:` prefix for built-ins.
- Engine files have zero CLI dependencies — no chalk, no commander, no ora.
- Exported functions require `@param` and `@returns` JSDoc tags.
- Use `import type` for type-only imports, separate from value imports.
- Always pass `--run` flag when invoking Vitest.
- Tests that create directories must use `fs.mkdtemp` for temp directory creation.
- Prefer real filesystem fixtures over mocks — create temp dirs with real files for `existsSync` tests.
- Inline fixture data for scanner tests — write files to temp directories at test time.

### Pattern Extracts

**DEPLOYMENT_CONFIGS map (census.ts lines 60-74):**
```typescript
const DEPLOYMENT_CONFIGS: Record<string, string> = {
  'vercel.json': 'Vercel',
  'Dockerfile': 'Docker',
  'docker-compose.yml': 'Docker Compose',
  'docker-compose.yaml': 'Docker Compose',
  'compose.yml': 'Docker Compose',
  'compose.yaml': 'Docker Compose',
  'railway.toml': 'Railway',
  'fly.toml': 'Fly.io',
  'render.yaml': 'Render',
  'Procfile': 'Heroku',
  'netlify.toml': 'Netlify',
  'app.yaml': 'Google Cloud',
  'firebase.json': 'Firebase',
};
```

**GitLab CI detection pattern (census.ts lines 318-321):**
```typescript
  // GitLab CI
  if (existsSync(path.join(rootPath, '.gitlab-ci.yml'))) {
    entries.push({ system: 'GitLab CI', workflowFiles: ['.gitlab-ci.yml'] });
  }
```

**Workspace ternary (scan-engine.ts lines 766-770):**
```typescript
    workspace: mono.isMonorepo
      ? (existsSync(path.join(rootPath, 'turbo.json'))
        ? `Turborepo (${mono.tool})`
        : `${mono.tool} monorepo`)
      : null,
```

**AI_PACKAGES provider entries (dependencies.ts lines 107-116):**
```typescript
  // Vercel AI provider integrations
  '@ai-sdk/anthropic': 'Vercel AI (Anthropic)',
  '@ai-sdk/openai': 'Vercel AI (OpenAI)',
  '@ai-sdk/google': 'Vercel AI (Google)',
  '@ai-sdk/google-vertex': 'Vercel AI (Google Vertex)',
  '@ai-sdk/amazon-bedrock': 'Vercel AI (Bedrock)',
  '@ai-sdk/azure': 'Vercel AI (Azure)',
  '@ai-sdk/mistral': 'Vercel AI (Mistral)',
  '@ai-sdk/cohere': 'Vercel AI (Cohere)',
  '@ai-sdk/togetherai': 'Vercel AI (Together)',
  '@ai-sdk/fireworks': 'Vercel AI (Fireworks)',
```

**detectServiceDeps loop structure (dependencies.ts lines 329-346):**
```typescript
export function detectServiceDeps(
  allDeps: Record<string, string>
): Array<{ name: string; category: string }> {
  const services: Array<{ name: string; category: string }> = [];
  const seen = new Set<string>();

  const maps: Array<[Record<string, string>, string]> = [
    [AI_PACKAGES, 'ai'],
    [EMAIL_PACKAGES, 'email'],
    [MONITORING_PACKAGES, 'monitoring'],
    [JOBS_PACKAGES, 'jobs'],
    [CACHE_PACKAGES, 'cache'],
  ];

  for (const [map, category] of maps) {
    for (const [pkg, name] of Object.entries(map)) {
      if (allDeps[pkg] && !seen.has(name)) {
        seen.add(name);
        services.push({ name, category });
      }
    }
  }

  return services;
}
```

### Proof Context

- `census.ts`: Root-level module path matching concern (dormant, unrelated to this change).
- `scan-engine.ts`: A017 (Node AI SDK unchanged) has no dedicated test. Unrelated to workspace detection.
- `dependencies.ts`: No active proof findings.

No active findings overlap with this scope's changes.

### Checkpoint Commands

- After census.ts changes: `cd packages/cli && pnpm vitest run tests/engine/census-detection.test.ts` — Expected: new deployment and CI tests pass
- After dependencies.ts changes: `cd packages/cli && pnpm vitest run tests/engine/detectors/ai-sdk-detection.test.ts` — Expected: new wildcard tests pass alongside existing tests
- After all changes: `pnpm run test -- --run` — Expected: all tests pass, no regressions
- Lint: `(cd packages/cli && pnpm run lint)`

### Build Baseline
- Current tests: 2556 passed, 2 skipped (2558 total)
- Current test files: 112 passed (112 total)
- Command used: `cd packages/cli && pnpm vitest run`
- After build: expected ~2575+ tests in 113+ files (1 new test file for census detection, plus new tests in existing ai-sdk-detection.test.ts)
- Regression focus: `tests/engine/detectors/ai-sdk-detection.test.ts`, `tests/commands/scan.test.ts`
