# Proof Chain Dashboard

151 runs · 102 active · 3 promoted · 763 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 25 | 14 | 2026-05-20 |
| cli | 105 | 68 | 2026-05-22 |
| website | 21 | 20 | 2026-05-21 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/tests/commands/work.test.ts | 6 | 5 |
| packages/cli/src/commands/work.ts | 6 | 4 |
| packages/cli/src/commands/init/state.ts | 6 | 5 |
| packages/cli/tests/commands/proof.test.ts | 3 | 3 |
| packages/cli/src/utils/proofSummary.ts | 3 | 2 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 102 total)

### packages/cli/src/commands/artifact.ts

- **code:** hasOpposingStageAdvanced reads .saves.json on every call — four calls per save mean four file reads of the same file — *Fix False Rejection Archives on Same-Session Re-Saves*

### packages/cli/src/commands/config.ts

- **code:** config delete on top-level machine-managed fields (anaVersion, name, etc.) blocked by MACHINE_MANAGED_FIELDS guard, but delete on whole 'surfaces' key is allowed — could wipe all surfaces — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/src/commands/init/state.ts

- **code:** scripts['test'] !== undefined treats explicit null value as 'present' — a package.json with test: null would get script passthrough producing a broken pnpm run test — *Fix per-surface test command priority*
- **code:** Non-Node surface gets empty commands object instead of null commands — no native command generation for Rust/Go surfaces — *Surface Awareness Schema and Pipeline Integration*
- **code:** displaySuccessMessage treats empty string test command as null for init display — consistent with upstream blank sanitizer — *Command Detection Language Awareness*

### packages/cli/src/commands/work.ts

- **code:** Backfill guard treats empty string surface as 'no surface' — !'' is truthy in JS, so surface: '' would be overwritten during backfill — *Fix test behavioral coverage gaps*

### packages/cli/src/engine/census.ts

- **code:** No test for discoverSchemas non-product path filtering — Fix 1 relies solely on integration coverage — *Scan Quality Polish (6 Additive Fixes)*
- **code:** FRAMEWORK_HINTS is not exported — no direct unit test can verify array ordering invariants without integration-level testing — *Fill Scan Detection Gaps*
- **code:** Tier 4 (scoped+self-named) matches any package where bare === scope, regardless of projectDirName. @strapi/strapi matches in any repo whose packages include it, not just 'strapi' directories. — *Fix Primary Package Selection in Monorepos*

### packages/cli/src/engine/detectors/applicationShape.ts

- **code:** BROWSER_DEP_ALIASES Set is small (3 entries) and tightly coupled to BROWSER_FRAMEWORKS — if a new browser framework is added with a different package name, both must be updated in sync — *Fix Application Shape Detection Priority Chain*

### packages/cli/src/engine/detectors/surfaces.ts

- **code:** deriveRawName @scope stripping handles segment-level scoped names but path-level scoped packages use last path segment after split, making the @scope branch in deriveRawName unreachable for standard monorepo layouts — *Scan Surface Detection*
- **code:** Collision disambiguation can still produce duplicates if two version-like paths share the same parent (e.g., packages/api/v1 and packages/api/v2 both become api-v1 and api-v2 — fine, but apps/api/v1 and packages/api/v1 would both become api-v1 after version normalization) — *Scan Surface Detection*

### packages/cli/src/engine/sampling/proportionalSampler.ts

- **code:** Root-level allocation in sampleFilesProportional lines 140-143 has the same floor-1-without-remaining-guard pattern. Protected by final trim at line 172 but still wastes glob work. — *Fix sampler budget overflow*

### packages/cli/src/engine/scan-engine.ts

- **code:** readPythonDependencies called twice for Python projects — line 673 (production) and line 76 inside detectNonNodeTesting (all), both performing fresh filesystem reads of the same pyproject.toml — *Separate Python production deps from dev deps*
- **code:** Hardcoded subdirectory list inline in 900+ line function — *Fix TypeScript Language Detection for Monorepos and Multi-Directory Projects*

### packages/cli/tests/commands/init/monorepoCommandScoping.test.ts

- **test:** Repeated tmpDir/cwdDir setup+teardown boilerplate in all 4 new tests — follows existing pattern but adds to known tech debt — *Fix per-surface test command priority*

### packages/cli/tests/commands/proof-surface-derivation.test.ts

- **code:** deriveSurface logic duplicated in test — test reimplements work.ts logic instead of importing it — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/tests/commands/scan.test.ts

- **test:** A003-A006 test asserts surface names exist in block but not framework, language, or testing values — *Scan Surface Display*

### packages/cli/tests/engine/census-detection.test.ts

- **test:** Workspace label tests verify a replicated helper, not the actual scan-engine.ts ternary — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/tests/engine/census-primary.test.ts

- **test:** No test for the Policy 1 + Policy 0 interaction: an apps/ package in a non-product path (e.g., 'examples/apps/web') — would Policy 0 filter it before Policy 1 can match? — *Fix Primary Package Selection in Monorepos*

### packages/cli/tests/engine/detectors/applicationShape.test.ts

- **test:** @ana A003 tags wrong test — tags 'pure function' check (line 319) instead of MCP+Next.js→web-app test (line 64) — *Fix Application Shape Detection Priority Chain*
- **test:** No test for MCP + server framework + browser deps triple combination (e.g., Express + MCP + React → full-stack) — *Fix Application Shape Detection Priority Chain*

### packages/cli/tests/engine/detectors/polyglot.test.ts

- **test:** Tauri Cargo.toml indicator push has no test assertion — existing Tauri tests assert pnpm-workspace.yaml but not Cargo.toml — *Polyglot detection hygiene*
- **test:** Tier 4 Tauri test has no indicator assertions at all — only asserts type and confidence — *Polyglot detection hygiene*

### packages/cli/tests/engine/detectors/surfaces.test.ts

- **test:** Svelte/Nuxt ordering test (A020) constructs hints with Svelte first — passes regardless of actual FRAMEWORK_HINTS array order in census.ts — *Fill Scan Detection Gaps*

### packages/cli/tests/engine/parsers/python.test.ts

- **test:** A010 include-group test passes trivially — inline table syntax never matches extractFromArray regex — *Fix Python pyproject.toml parser — 3 bugs*

### website/components/docs/proof/ProofExplorer.tsx

- **code:** Badge style object duplicated three times in ProofExplorer inline badge container — *Comprehensive Documentation Update for Surface Awareness*

### website/components/docs/proof/ProofHero.tsx

- **code:** formatDuration duplicated in ProofHero — known across 4 files per proof context — *Comprehensive Documentation Update for Surface Awareness*
- **test:** No unit tests for surface conditional rendering in ProofHero or ProofExplorer — by spec design (build-only strategy), but null/undefined/empty-string edge cases untested — *Comprehensive Documentation Update for Surface Awareness*

### website/lib/__tests__/docs-data/data-integrity.test.ts

- **test:** Supplementary files silent pass on missing — existsSync guard inside for-loop means missing files are never asserted — *Website Test Suite*

