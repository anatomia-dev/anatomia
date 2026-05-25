# Proof Chain Dashboard

159 runs · 110 active · 5 promoted · 798 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 28 | 22 | 2026-05-25 |
| cli | 108 | 68 | 2026-05-24 |
| website | 23 | 20 | 2026-05-24 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/init/state.ts | 8 | 6 |
| packages/cli/tests/commands/work.test.ts | 6 | 5 |
| packages/cli/src/commands/work.ts | 6 | 4 |
| packages/cli/tests/commands/proof.test.ts | 5 | 4 |
| packages/cli/src/engine/detectors/git.ts | 3 | 2 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 110 total)

### packages/cli/src/commands/artifact.ts

- **code:** hasOpposingStageAdvanced reads .saves.json on every call — four calls per save mean four file reads of the same file — *Fix False Rejection Archives on Same-Session Re-Saves*

### packages/cli/src/commands/init/state.ts

- **code:** Path escape handles single quotes only — dollar signs, backticks in paths still break inside single-quoted shell context — *Fix Risk Findings*
- **code:** fix-surface-test-priority-C1 still active — scripts['test'] !== undefined at state.ts:520 treats explicit null in package.json as present — *Fix Risk Findings*
- **code:** scripts['test'] !== undefined treats explicit null value as 'present' — a package.json with test: null would get script passthrough producing a broken pnpm run test — *Fix per-surface test command priority*

### packages/cli/src/commands/proof.ts

- **code:** Hot spots displayNames not truncated when exceeding maxWidth — padEnd passes through unchanged — *CLI Polish*

### packages/cli/src/commands/work.ts

- **test:** No dedicated test for the backfill guard's empty-string behavior — only verified by source inspection — *Fix Risk Findings*

### packages/cli/src/engine/census.ts

- **code:** No test for discoverSchemas non-product path filtering — Fix 1 relies solely on integration coverage — *Scan Quality Polish (6 Additive Fixes)*
- **code:** FRAMEWORK_HINTS is not exported — no direct unit test can verify array ordering invariants without integration-level testing — *Fill Scan Detection Gaps*
- **code:** Tier 4 (scoped+self-named) matches any package where bare === scope, regardless of projectDirName. @strapi/strapi matches in any repo whose packages include it, not just 'strapi' directories. — *Fix Primary Package Selection in Monorepos*

### packages/cli/src/engine/detectors/applicationShape.ts

- **code:** BROWSER_DEP_ALIASES Set is small (3 entries) and tightly coupled to BROWSER_FRAMEWORKS — if a new browser framework is added with a different package name, both must be updated in sync — *Fix Application Shape Detection Priority Chain*

### packages/cli/src/engine/detectors/dependencies.ts

- **code:** No-primary-root edge case — findStackProvenance silently treats all roots as non-primary when no root.isPrimary is true — *Setup Verification Hints*

### packages/cli/src/engine/sampling/proportionalSampler.ts

- **code:** Root-level allocation in sampleFilesProportional lines 140-143 has the same floor-1-without-remaining-guard pattern. Protected by final trim at line 172 but still wastes glob work. — *Fix sampler budget overflow*

### packages/cli/src/engine/scan-engine.ts

- **code:** readPythonDependencies called twice for Python projects — line 673 (production) and line 76 inside detectNonNodeTesting (all), both performing fresh filesystem reads of the same pyproject.toml — *Separate Python production deps from dev deps*
- **code:** Hardcoded subdirectory list inline in 900+ line function — *Fix TypeScript Language Detection for Monorepos and Multi-Directory Projects*

### packages/cli/src/utils/proof-health.ts

- **code:** proof-health.ts at 893 lines is already above comfort threshold — health computation could decompose further — *Decompose proofSummary.ts*

### packages/cli/src/utils/proofSummary.ts

- **code:** proofSummary.ts still 1285 lines — reduced from 2330 but remains the largest util module — *Decompose proofSummary.ts*

### packages/cli/tests/commands/init/monorepoCommandScoping.test.ts

- **test:** Repeated tmpDir/cwdDir setup+teardown boilerplate in all 4 new tests — follows existing pattern but adds to known tech debt — *Fix per-surface test command priority*

### packages/cli/tests/commands/proof.test.ts

- **test:** A003 and A004 tests use conditional assertions — silently pass if section absent — *CLI Polish*
- **test:** A005 assertion checks for any double space, not trailing gap before right border — *CLI Polish*

### packages/cli/tests/engine/census-primary.test.ts

- **test:** No test for the Policy 1 + Policy 0 interaction: an apps/ package in a non-product path (e.g., 'examples/apps/web') — would Policy 0 filter it before Policy 1 can match? — *Fix Primary Package Selection in Monorepos*

### packages/cli/tests/engine/detectors/applicationShape.test.ts

- **test:** No test for MCP + server framework + browser deps triple combination (e.g., Express + MCP + React → full-stack) — *Fix Application Shape Detection Priority Chain*

### packages/cli/tests/engine/detectors/dependencies.test.ts

- **test:** makeRoot/makeCensus helpers duplicated locally instead of extracted to shared test helper — *Setup Verification Hints*

### packages/cli/tests/engine/detectors/polyglot.test.ts

- **test:** Tauri Cargo.toml indicator push has no test assertion — existing Tauri tests assert pnpm-workspace.yaml but not Cargo.toml — *Polyglot detection hygiene*
- **test:** Tier 4 Tauri test has no indicator assertions at all — only asserts type and confidence — *Polyglot detection hygiene*

### packages/cli/tests/engine/detectors/surfaces.test.ts

- **test:** Svelte/Nuxt ordering test (A020) constructs hints with Svelte first — passes regardless of actual FRAMEWORK_HINTS array order in census.ts — *Fill Scan Detection Gaps*

### packages/cli/tests/engine/parsers/python.test.ts

- **test:** A010 include-group test passes trivially — inline table syntax never matches extractFromArray regex — *Fix Python pyproject.toml parser — 3 bugs*

### website/components/docs/content/DocsStat.tsx

- **code:** DocsStatKey runtime fallback renders raw key name as visible page text — user sees 'proofCoutn' instead of a number if MDX has a typo — *Fix Risk Findings*

### website/components/docs/proof/ProofExplorer.tsx

- **code:** Badge style object duplicated three times in ProofExplorer inline badge container — *Comprehensive Documentation Update for Surface Awareness*

### website/lib/__tests__/docs-data/data-integrity.test.ts

- **test:** No dedicated test verifies commands.json contains 'doctor' or 'learn' by name — relies on source inspection and shape tests — *CLI Polish*

### website/lib/__tests__/docs-data/staleness.test.ts

- **test:** Staleness tests replicate checkStaleDocs rather than testing the actual function — *Fix AnaDocs date freshness*

