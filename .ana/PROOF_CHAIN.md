# Proof Chain Dashboard

140 runs · 101 active · 3 promoted · 712 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 25 | 14 | 2026-05-20 |
| cli | 94 | 67 | 2026-05-21 |
| website | 21 | 20 | 2026-05-21 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 9 | 6 |
| packages/cli/tests/commands/work.test.ts | 8 | 7 |
| packages/cli/src/commands/init/state.ts | 7 | 5 |
| packages/cli/tests/commands/init/monorepoCommandScoping.test.ts | 4 | 3 |
| packages/cli/src/commands/proof.ts | 4 | 3 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 101 total)

### packages/cli/src/commands/config.ts

- **code:** config delete on top-level machine-managed fields (anaVersion, name, etc.) blocked by MACHINE_MANAGED_FIELDS guard, but delete on whole 'surfaces' key is allowed — could wipe all surfaces — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/src/commands/init/state.ts

- **code:** scripts['test'] !== undefined treats explicit null value as 'present' — a package.json with test: null would get script passthrough producing a broken pnpm run test — *Fix per-surface test command priority*
- **code:** surface.path injected into shell command without sanitization — paths with spaces or special chars produce broken subshell — *Fix per-surface test command priority*
- **code:** Non-Node surface gets empty commands object instead of null commands — no native command generation for Rust/Go surfaces — *Surface Awareness Schema and Pipeline Integration*
- **code:** displaySuccessMessage treats empty string test command as null for init display — consistent with upstream blank sanitizer — *Command Detection Language Awareness*

### packages/cli/src/commands/proof.ts

- **code:** EMPTY_AUDIT_MATRIX is a mutable shared object — not frozen, callees could theoretically mutate it — *Command File Duplication Cleanup*
- **code:** proof.ts imports pullBeforeRead and commitAndPushProofChanges from git-operations.ts but only uses them as pass-through calls — no local usage justifies the import beyond maintaining the existing call sites — *Command File Duplication Cleanup*

### packages/cli/src/commands/work.ts

- **code:** Backfill guard treats empty string surface as 'no surface' — !'' is truthy in JS, so surface: '' would be overwritten during backfill — *Fix test behavioral coverage gaps*
- **code:** Bracket notation inconsistency: backfill guard uses chain.migrations?.['surface_backfill'] but marker is set with dot notation via spread — *Pre-surface behavior cleanup*
- **code:** Migration markers always set both values unconditionally — lesson_to_closed is set even though no lesson migration code runs. Correct per spec but semantically the marker claims work that was already completed in a prior release — *Pre-surface behavior cleanup*
- **code:** Backfill iterates all chain.entries on every work complete — O(n) with no short-circuit after first fully-backfilled run — *Surface Awareness Bridge*

### packages/cli/src/engine/detectors/surfaces.ts

- **code:** deriveRawName @scope stripping handles segment-level scoped names but path-level scoped packages use last path segment after split, making the @scope branch in deriveRawName unreachable for standard monorepo layouts — *Scan Surface Detection*
- **code:** Collision disambiguation can still produce duplicates if two version-like paths share the same parent (e.g., packages/api/v1 and packages/api/v2 both become api-v1 and api-v2 — fine, but apps/api/v1 and packages/api/v1 would both become api-v1 after version normalization) — *Scan Surface Detection*

### packages/cli/src/engine/sampling/proportionalSampler.ts

- **code:** Root-level allocation in sampleFilesProportional lines 140-143 has the same floor-1-without-remaining-guard pattern. Protected by final trim at line 172 but still wastes glob work. — *Fix sampler budget overflow*

### packages/cli/src/utils/git-operations.ts

- **code:** Pre-existing lint warning at git-operations.ts:198 (unused eslint-disable directive) — 10+ verify cycles old, not introduced by this build — *Command File Duplication Cleanup*

### packages/cli/tests/commands/init/makeTestCommand.test.ts

- **code:** File not in contract file_changes was modified — makeTestCommand.test.ts assertions updated to match new behavior — *Fix per-surface test command priority*

### packages/cli/tests/commands/init/monorepoCommandScoping.test.ts

- **test:** A006 empty-string assertion uses toContain('run test') — weaker than other assertions that use toBe for exact match — *Fix per-surface test command priority*
- **test:** Repeated tmpDir/cwdDir setup+teardown boilerplate in all 4 new tests — follows existing pattern but adds to known tech debt — *Fix per-surface test command priority*

### packages/cli/tests/commands/proof-surface-derivation.test.ts

- **code:** deriveSurface logic duplicated in test — test reimplements work.ts logic instead of importing it — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/tests/commands/work.test.ts

- **test:** New backfill guard test doesn't verify the negative case — no test for what happens if surface is removed from the guard condition — *Fix test behavioral coverage gaps*
- **test:** Migration marker tests use heavyweight completeWork integration path — each test creates a full git repo, plan artifacts, and runs the complete flow for a 4-line code change — *Pre-surface behavior cleanup*

### packages/cli/tests/engine/census-detection.test.ts

- **test:** Workspace label tests verify a replicated helper, not the actual scan-engine.ts ternary — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/tests/engine/detectors/ai-sdk-detection.test.ts

- **test:** Wildcard capitalization only tested with single-word providers — no test for hyphenated wildcard input like @ai-sdk/foo-bar — *Stack Detection Gaps (V2-Alpha Breadth Sweep)*

### packages/cli/tests/engine/detectors/polyglot.test.ts

- **test:** Tauri Cargo.toml indicator push has no test assertion — existing Tauri tests assert pnpm-workspace.yaml but not Cargo.toml — *Polyglot detection hygiene*
- **test:** Tier 4 Tauri test has no indicator assertions at all — only asserts type and confidence — *Polyglot detection hygiene*

### packages/cli/tests/engine/sampling/proportional-sampler.test.ts

- **test:** Budget=1 test (A004) verifies count but not that the returned file is shallow. Iteration order guarantees shallow, but the test doesn't assert it. — *Fix sampler budget overflow*

### website/components/docs/proof/ProofExplorer.tsx

- **code:** Badge style object duplicated three times in ProofExplorer inline badge container — *Comprehensive Documentation Update for Surface Awareness*

### website/components/docs/proof/ProofHero.tsx

- **code:** formatDuration duplicated in ProofHero — known across 4 files per proof context — *Comprehensive Documentation Update for Surface Awareness*
- **test:** No unit tests for surface conditional rendering in ProofHero or ProofExplorer — by spec design (build-only strategy), but null/undefined/empty-string edge cases untested — *Comprehensive Documentation Update for Surface Awareness*

### website/lib/__tests__/docs-data/data-integrity.test.ts

- **test:** Supplementary files silent pass on missing — existsSync guard inside for-loop means missing files are never asserted — *Website Test Suite*

