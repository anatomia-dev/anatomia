# Proof Chain Dashboard

128 runs · 92 active · 3 promoted · 654 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 9 | 7 |
| packages/cli/src/engine/detectors/projectType.ts | 8 | 3 |
| packages/cli/tests/commands/work.test.ts | 6 | 5 |
| packages/cli/src/commands/init/state.ts | 5 | 3 |
| packages/cli/tests/commands/proof.test.ts | 3 | 3 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 92 total)

### packages/cli/src/commands/config.ts

- **test:** No dedicated test for empty-string buildPackage/testPackage rejection — verified by source inspection only — *Flip Monorepo Command Semantics*

### packages/cli/src/commands/doctor.ts

- **code:** ana.json read twice — assessScanFreshness and assessContext both parse .ana/ana.json independently — *ana doctor — unified project health diagnostic*
- **code:** formatFooter redCount only counts cli_version and scan_freshness — if fail status were ever added to context/skills/proof_chain, the count would be wrong — *ana doctor — unified project health diagnostic*

### packages/cli/src/commands/init/state.ts

- **code:** Merge override assumes newAnaConfig always contains all four keys — undefined would silently drop the field from JSON output — *Re-init mechanical field refresh*
- **code:** pkg.path injected without sanitization in createAnaJson — pre-existing, unrelated to this build — *Re-init mechanical field refresh*
- **code:** pkg.path injected without sanitization in new buildPackageCmd and testPackageCmd — same known risk as monorepo-build-scoping-C5 — *Flip Monorepo Command Semantics*

### packages/cli/src/commands/proof.ts

- **code:** commitAndPushProofChanges and pullBeforeRead exported from proof.ts instead of extracted to git-operations.ts — *Learn Session Memory*

### packages/cli/src/engine/analyzers/conventions/imports.ts

- **code:** classifyTSImport line 83 replace('/*', '') is dead code for new alias format — *Fix Deep Tier Sampling & Finding Accuracy*

### packages/cli/src/engine/detectors/dependencies.ts

- **code:** @openrouter/ai-sdk-provider added to AI_PACKAGES but not in spec — over-building with zero test coverage — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*
- **code:** AI_SDK_EXCLUSIONS set recreated on every detectServiceDeps call — could be module-level constant — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/src/engine/detectors/projectType.ts

- **code:** Stale docstring — says 'Python → Go → Rust → Ruby → PHP' but polyglot tier order is Python → Rust → Ruby → Go — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*
- **code:** indexOf('\n[') section boundary misses header at position 0 of sliced block — inherited from hasPythonProjectDeps pattern — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*
- **code:** Tauri discriminator omits Cargo.toml from indicators — downstream consumers can't tell Rust is present — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*
- **code:** Ruby detection is existence-only — no Gemfile content analysis, so a Gemfile with only dev gems still triggers Ruby — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*

### packages/cli/src/engine/findings/rules/validation.ts

- **code:** VALIDATION_PATH_PATTERNS check can false-positive on non-validation imports containing 'schema' or 'validate' — *Fix Deep Tier Sampling & Finding Accuracy*
- **code:** Validation rule reads all route files synchronously via readFileSync — established pattern (matches secrets.ts) but could be noticeable at 500+ routes — *Fix Deep Tier Sampling & Finding Accuracy*

### packages/cli/src/engine/sampling/proportionalSampler.ts

- **code:** allocateBudget can return total exceeding budget when budget < non-empty bucket count — *Fix Deep Tier Sampling & Finding Accuracy*

### packages/cli/src/utils/proofSummary.ts

- **code:** formatRelativeTime doesn't handle invalid input — produces 'NaNw ago' for bad ISO strings — *Audit matrix orientation*

### packages/cli/tests/commands/doctor.test.ts

- **test:** A022 test line 410 contains dead logic — 'still scaffold'.split(' ')[0] ternary always evaluates to truthy branch, duplicating line 408 — *ana doctor — unified project health diagnostic*
- **test:** No tests for guard clauses (A018/A019 no-ana guard, A025/A026 worktree guard) — these are in the command handler and require subprocess testing to reach — *ana doctor — unified project health diagnostic*

### packages/cli/tests/commands/init/monorepoCommandScoping.test.ts

- **test:** A007 tests null equality, not string equality — doesn't exercise the string-comparison branch — *Flip Monorepo Command Semantics*

### packages/cli/tests/engine/census-detection.test.ts

- **test:** Workspace label tests verify a replicated helper, not the actual scan-engine.ts ternary — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/tests/engine/detectors/ai-sdk-detection.test.ts

- **test:** Wildcard capitalization only tested with single-word providers — no test for hyphenated wildcard input like @ai-sdk/foo-bar — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/tests/engine/detectors/polyglot.test.ts

- **test:** Tag collision — @ana IDs A001-A019 used by both old contracts and this contract in same file, creating ambiguity for tooling — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*

### packages/cli/tests/engine/findings/rules/validation.test.ts

- **test:** No test exercises VALIDATION_PATH_PATTERNS false positive boundary (e.g., import containing 'schema' in a non-validation context) — *Fix Deep Tier Sampling & Finding Accuracy*

### website/components/pricing/pricing.module.css

- **code:** Error color hardcoded as #ff8a8a on highlighted card instead of CSS custom property — *Team edition waitlist form*

### website/components/pricing/WaitlistForm.tsx

- **code:** Honeypot DOM input is dead code — JSON submission hardcodes _gotcha: '' regardless of field value — *Team edition waitlist form*
- **code:** Hidden _source DOM input is dead code — JSON body hardcodes _source value, DOM element never read — *Team edition waitlist form*
- **code:** Success message aria-live on freshly mounted element — screen readers may not announce dynamically inserted aria-live regions — *Team edition waitlist form*
- **code:** No client-side rate limiting — user can spam submit after error state re-enables the button — *Team edition waitlist form*

