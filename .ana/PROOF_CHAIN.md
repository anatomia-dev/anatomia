# Proof Chain Dashboard

126 runs · 84 active · 3 promoted · 651 closed

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 9 | 7 |
| packages/cli/tests/commands/work.test.ts | 6 | 5 |
| packages/cli/src/commands/init/state.ts | 5 | 3 |
| packages/cli/src/engine/detectors/projectType.ts | 4 | 2 |
| packages/cli/tests/commands/proof.test.ts | 3 | 3 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 84 total)

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
- **code:** Duplicated zero-entry JSON payload — identical object literal at two call sites — *Audit matrix orientation*

### packages/cli/src/engine/analyzers/conventions/imports.ts

- **code:** classifyTSImport line 83 replace('/*', '') is dead code for new alias format — *Fix Deep Tier Sampling & Finding Accuracy*

### packages/cli/src/engine/detectors/projectType.ts

- **code:** hasRustWorkspace catch block unreachable — regex cannot throw — *Rust/Go Polyglot Detection*
- **code:** Priority ordering Python > Rust > Go in Tier 3 is implicit and untested — *Rust/Go Polyglot Detection*
- **code:** Tier 4 no-lockfile + pyproject with no real deps returns 0.70 — same confidence as Tier 5 bare package.json, indistinguishable to downstream consumers — *Polyglot Language Detection*
- **code:** nextSection search uses indexOf('\n[') which misses a section header at position 0 of the sliced block (no preceding newline) — *Polyglot Language Detection*

### packages/cli/src/engine/findings/rules/validation.ts

- **code:** VALIDATION_PATH_PATTERNS check can false-positive on non-validation imports containing 'schema' or 'validate' — *Fix Deep Tier Sampling & Finding Accuracy*
- **code:** Validation rule reads all route files synchronously via readFileSync — established pattern (matches secrets.ts) but could be noticeable at 500+ routes — *Fix Deep Tier Sampling & Finding Accuracy*

### packages/cli/src/engine/sampling/proportionalSampler.ts

- **code:** allocateBudget can return total exceeding budget when budget < non-empty bucket count — *Fix Deep Tier Sampling & Finding Accuracy*

### packages/cli/src/utils/proofSummary.ts

- **code:** formatRelativeTime doesn't handle invalid input — produces 'NaNw ago' for bad ISO strings — *Audit matrix orientation*
- **code:** proofSummary.ts now ~2330 lines — past comfort threshold, growing — *Audit matrix orientation*

### packages/cli/tests/commands/doctor.test.ts

- **test:** A001-A005 tests verify data model, not terminal output — contract targets output.lines — *ana doctor — unified project health diagnostic*
- **test:** A022 test line 410 contains dead logic — 'still scaffold'.split(' ')[0] ternary always evaluates to truthy branch, duplicating line 408 — *ana doctor — unified project health diagnostic*
- **test:** No tests for guard clauses (A018/A019 no-ana guard, A025/A026 worktree guard) — these are in the command handler and require subprocess testing to reach — *ana doctor — unified project health diagnostic*

### packages/cli/tests/commands/init/monorepoCommandScoping.test.ts

- **test:** A007 tests null equality, not string equality — doesn't exercise the string-comparison branch — *Flip Monorepo Command Semantics*

### packages/cli/tests/commands/proof.test.ts

- **test:** A008/A009 use toBeDefined() instead of specific values for stale_count and recent_entries — *Audit matrix orientation*

### packages/cli/tests/engine/detectors/polyglot.test.ts

- **test:** A012 frameworkDeps test verifies detector-level cascade but not the actual scan-engine.ts ternary conditional — the ternary fix is tested structurally, not behaviorally — *Polyglot Language Detection*

### packages/cli/tests/engine/findings/rules/validation.test.ts

- **test:** No test exercises VALIDATION_PATH_PATTERNS false positive boundary (e.g., import containing 'schema' in a non-validation context) — *Fix Deep Tier Sampling & Finding Accuracy*

### website/components/pricing/pricing.module.css

- **code:** Error color hardcoded as #ff8a8a on highlighted card instead of CSS custom property — *Team edition waitlist form*

### website/components/pricing/WaitlistForm.tsx

- **code:** Honeypot DOM input is dead code — JSON submission hardcodes _gotcha: '' regardless of field value — *Team edition waitlist form*
- **code:** Hidden _source DOM input is dead code — JSON body hardcodes _source value, DOM element never read — *Team edition waitlist form*
- **code:** Success message aria-live on freshly mounted element — screen readers may not announce dynamically inserted aria-live regions — *Team edition waitlist form*
- **code:** No client-side rate limiting — user can spam submit after error state re-enables the button — *Team edition waitlist form*

