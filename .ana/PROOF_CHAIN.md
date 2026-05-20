# Proof Chain Dashboard

130 runs · 103 active · 3 promoted · 657 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 9 | 7 |
| packages/cli/src/commands/init/state.ts | 8 | 4 |
| packages/cli/src/engine/detectors/projectType.ts | 8 | 3 |
| packages/cli/tests/commands/work.test.ts | 6 | 5 |
| packages/cli/tests/commands/proof.test.ts | 3 | 3 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 103 total)

### packages/cli/src/commands/doctor.ts

- **code:** ana.json read twice — assessScanFreshness and assessContext both parse .ana/ana.json independently — *ana doctor — unified project health diagnostic*
- **code:** formatFooter redCount only counts cli_version and scan_freshness — if fail status were ever added to context/skills/proof_chain, the count would be wrong — *ana doctor — unified project health diagnostic*

### packages/cli/src/commands/init/state.ts

- **test:** A020 has no tagged test — verified by source inspection only — *Command Detection Language Awareness*
- **code:** displaySuccessMessage treats empty string test command as null for init display — consistent with upstream blank sanitizer — *Command Detection Language Awareness*
- **code:** buildNonNodeCommands returns early per-language without fallthrough — adding a new language requires a new if-block, no extensibility pattern — *Command Detection Language Awareness*
- **code:** Merge override assumes newAnaConfig always contains all four keys — undefined would silently drop the field from JSON output — *Re-init mechanical field refresh*

### packages/cli/src/engine/analyzers/conventions/imports.ts

- **code:** classifyTSImport line 83 replace('/*', '') is dead code for new alias format — *Fix Deep Tier Sampling & Finding Accuracy*

### packages/cli/src/engine/census.ts

- **code:** 29 FRAMEWORK_HINTS entries vs spec's claim of 18+9=27 — 2 entries existed before this build (react-router.config.ts, astro.config.ts), making the true delta 11 new entries not 9 — *Scan Surface Detection*

### packages/cli/src/engine/detectors/dependencies.ts

- **code:** @openrouter/ai-sdk-provider added to AI_PACKAGES but not in spec — over-building with zero test coverage — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*
- **code:** AI_SDK_EXCLUSIONS set recreated on every detectServiceDeps call — could be module-level constant — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/src/engine/detectors/projectType.ts

- **code:** Stale docstring — says 'Python → Go → Rust → Ruby → PHP' but polyglot tier order is Python → Rust → Ruby → Go — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*
- **code:** indexOf('\n[') section boundary misses header at position 0 of sliced block — inherited from hasPythonProjectDeps pattern — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*
- **code:** Tauri discriminator omits Cargo.toml from indicators — downstream consumers can't tell Rust is present — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*
- **code:** Ruby detection is existence-only — no Gemfile content analysis, so a Gemfile with only dev gems still triggers Ruby — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*

### packages/cli/src/engine/detectors/surfaces.ts

- **code:** deriveRawName @scope stripping handles segment-level scoped names but path-level scoped packages use last path segment after split, making the @scope branch in deriveRawName unreachable for standard monorepo layouts — *Scan Surface Detection*
- **code:** Collision disambiguation can still produce duplicates if two version-like paths share the same parent (e.g., packages/api/v1 and packages/api/v2 both become api-v1 and api-v2 — fine, but apps/api/v1 and packages/api/v1 would both become api-v1 after version normalization) — *Scan Surface Detection*

### packages/cli/src/engine/findings/rules/validation.ts

- **code:** VALIDATION_PATH_PATTERNS check can false-positive on non-validation imports containing 'schema' or 'validate' — *Fix Deep Tier Sampling & Finding Accuracy*
- **code:** Validation rule reads all route files synchronously via readFileSync — established pattern (matches secrets.ts) but could be noticeable at 500+ routes — *Fix Deep Tier Sampling & Finding Accuracy*

### packages/cli/src/engine/sampling/proportionalSampler.ts

- **code:** allocateBudget can return total exceeding budget when budget < non-empty bucket count — *Fix Deep Tier Sampling & Finding Accuracy*

### packages/cli/src/engine/scan-engine.ts

- **code:** detectNonNodeTesting Ruby branch uses existsSync (synchronous) inside an async function — inconsistent with other branches that use async reads — *Command Detection Language Awareness*

### packages/cli/src/utils/displayNames.ts

- **code:** nuxt and astro missing from FRAMEWORK_DISPLAY_NAMES — surfaces display lowercase keys instead of 'Nuxt'/'Astro' — *Scan Surface Detection*

### packages/cli/src/utils/worktree.ts

- **code:** getBuildCommandString exported solely for testing with @internal tag — follows project convention but increases public API surface — *Command Detection Language Awareness*

### packages/cli/tests/commands/doctor.test.ts

- **test:** A022 test line 410 contains dead logic — 'still scaffold'.split(' ')[0] ternary always evaluates to truthy branch, duplicating line 408 — *ana doctor — unified project health diagnostic*
- **test:** No tests for guard clauses (A018/A019 no-ana guard, A025/A026 worktree guard) — these are in the command handler and require subprocess testing to reach — *ana doctor — unified project health diagnostic*

### packages/cli/tests/engine/census-detection.test.ts

- **test:** Workspace label tests verify a replicated helper, not the actual scan-engine.ts ternary — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/tests/engine/detectors/ai-sdk-detection.test.ts

- **test:** Wildcard capitalization only tested with single-word providers — no test for hyphenated wildcard input like @ai-sdk/foo-bar — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/tests/engine/detectors/polyglot.test.ts

- **test:** Tag collision — @ana IDs A001-A019 used by both old contracts and this contract in same file, creating ambiguity for tooling — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*

### packages/cli/tests/engine/detectors/surfaces.test.ts

- **test:** A023 tests STRONG_FRAMEWORK_CONFIGS presence as proxy for FRAMEWORK_HINTS count — FRAMEWORK_HINTS is not exported — *Scan Surface Detection*
- **test:** A021 tests data shape availability, not actual terminal output containing 'Surfaces' string — *Scan Surface Detection*

### packages/cli/tests/engine/findings/rules/validation.test.ts

- **test:** No test exercises VALIDATION_PATH_PATTERNS false positive boundary (e.g., import containing 'schema' in a non-validation context) — *Fix Deep Tier Sampling & Finding Accuracy*

