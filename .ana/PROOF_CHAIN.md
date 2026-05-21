# Proof Chain Dashboard

135 runs · 96 active · 3 promoted · 694 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 25 | 16 | 2026-05-20 |
| cli | 89 | 60 | 2026-05-21 |
| website | 21 | 20 | 2026-05-21 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 11 | 8 |
| packages/cli/tests/commands/work.test.ts | 8 | 7 |
| packages/cli/src/commands/init/state.ts | 5 | 4 |
| packages/cli/src/engine/detectors/projectType.ts | 4 | 2 |
| packages/cli/tests/commands/proof.test.ts | 3 | 3 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 96 total)

### packages/cli/src/commands/config.ts

- **code:** config delete on top-level machine-managed fields (anaVersion, name, etc.) blocked by MACHINE_MANAGED_FIELDS guard, but delete on whole 'surfaces' key is allowed — could wipe all surfaces — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/src/commands/doctor.ts

- **code:** ana.json read twice — assessScanFreshness and assessContext both parse .ana/ana.json independently — *ana doctor — unified project health diagnostic*
- **code:** formatFooter redCount only counts cli_version and scan_freshness — if fail status were ever added to context/skills/proof_chain, the count would be wrong — *ana doctor — unified project health diagnostic*

### packages/cli/src/commands/init/state.ts

- **code:** Non-Node surface gets empty commands object instead of null commands — no native command generation for Rust/Go surfaces — *Surface Awareness Schema and Pipeline Integration*
- **code:** displaySuccessMessage treats empty string test command as null for init display — consistent with upstream blank sanitizer — *Command Detection Language Awareness*

### packages/cli/src/commands/work.ts

- **code:** Bracket notation inconsistency: backfill guard uses chain.migrations?.['surface_backfill'] but marker is set with dot notation via spread — *Pre-surface behavior cleanup*
- **code:** Migration markers always set both values unconditionally — lesson_to_closed is set even though no lesson migration code runs. Correct per spec but semantically the marker claims work that was already completed in a prior release — *Pre-surface behavior cleanup*
- **code:** Backfill iterates all chain.entries on every work complete — O(n) with no short-circuit after first fully-backfilled run — *Surface Awareness Bridge*

### packages/cli/src/engine/detectors/projectType.ts

- **code:** Stale docstring — says 'Python → Go → Rust → Ruby → PHP' but polyglot tier order is Python → Rust → Ruby → Go — *Fix Polyglot Detection for Tauri+TS and Ruby+JS Projects*
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

### packages/cli/tests/commands/doctor.test.ts

- **test:** A022 test line 410 contains dead logic — 'still scaffold'.split(' ')[0] ternary always evaluates to truthy branch, duplicating line 408 — *ana doctor — unified project health diagnostic*
- **test:** No tests for guard clauses (A018/A019 no-ana guard, A025/A026 worktree guard) — these are in the command handler and require subprocess testing to reach — *ana doctor — unified project health diagnostic*

### packages/cli/tests/commands/proof-surface-derivation.test.ts

- **code:** deriveSurface logic duplicated in test — test reimplements work.ts logic instead of importing it — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/tests/commands/work.test.ts

- **test:** Migration marker tests use heavyweight completeWork integration path — each test creates a full git repo, plan artifacts, and runs the complete flow for a 4-line code change — *Pre-surface behavior cleanup*
- **test:** A021 idempotency test checks pure function determinism, not backfill loop guard — *Surface Awareness Bridge*

### packages/cli/tests/engine/census-detection.test.ts

- **test:** Workspace label tests verify a replicated helper, not the actual scan-engine.ts ternary — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/tests/engine/detectors/ai-sdk-detection.test.ts

- **test:** Wildcard capitalization only tested with single-word providers — no test for hyphenated wildcard input like @ai-sdk/foo-bar — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/tests/engine/findings/rules/validation.test.ts

- **test:** No test exercises VALIDATION_PATH_PATTERNS false positive boundary (e.g., import containing 'schema' in a non-validation context) — *Fix Deep Tier Sampling & Finding Accuracy*

### website/components/docs/proof/ProofExplorer.tsx

- **code:** Badge style object duplicated three times in ProofExplorer inline badge container — *Comprehensive Documentation Update for Surface Awareness*

### website/components/docs/proof/ProofHero.tsx

- **code:** formatDuration duplicated in ProofHero — known across 4 files per proof context — *Comprehensive Documentation Update for Surface Awareness*
- **test:** No unit tests for surface conditional rendering in ProofHero or ProofExplorer — by spec design (build-only strategy), but null/undefined/empty-string edge cases untested — *Comprehensive Documentation Update for Surface Awareness*

### website/components/pricing/WaitlistForm.tsx

- **code:** Honeypot DOM input is dead code — JSON submission hardcodes _gotcha: '' regardless of field value — *Team edition waitlist form*
- **code:** Hidden _source DOM input is dead code — JSON body hardcodes _source value, DOM element never read — *Team edition waitlist form*

### website/lib/__tests__/docs-data/data-integrity.test.ts

- **test:** Supplementary files silent pass on missing — existsSync guard inside for-loop means missing files are never asserted — *Website Test Suite*

