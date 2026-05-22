# Proof Chain Dashboard

144 runs · 106 active · 3 promoted · 726 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 25 | 14 | 2026-05-20 |
| cli | 98 | 72 | 2026-05-22 |
| website | 21 | 20 | 2026-05-21 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/tests/commands/work.test.ts | 6 | 5 |
| packages/cli/src/commands/work.ts | 6 | 4 |
| packages/cli/src/commands/init/state.ts | 6 | 5 |
| packages/cli/src/engine/detectors/surfaces.ts | 5 | 2 |
| packages/cli/src/engine/detectors/git.ts | 4 | 3 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 106 total)

### packages/cli/src/commands/config.ts

- **code:** config delete on top-level machine-managed fields (anaVersion, name, etc.) blocked by MACHINE_MANAGED_FIELDS guard, but delete on whole 'surfaces' key is allowed — could wipe all surfaces — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/src/commands/init/state.ts

- **code:** scripts['test'] !== undefined treats explicit null value as 'present' — a package.json with test: null would get script passthrough producing a broken pnpm run test — *Fix per-surface test command priority*
- **code:** Non-Node surface gets empty commands object instead of null commands — no native command generation for Rust/Go surfaces — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/src/commands/work.ts

- **code:** Backfill guard treats empty string surface as 'no surface' — !'' is truthy in JS, so surface: '' would be overwritten during backfill — *Fix test behavioral coverage gaps*

### packages/cli/src/engine/census.ts

- **code:** Tier 4 (scoped+self-named) matches any package where bare === scope, regardless of projectDirName. @strapi/strapi matches in any repo whose packages include it, not just 'strapi' directories. — *Fix Primary Package Selection in Monorepos*
- **code:** parsePackageName is a private helper but has no guard for empty-string input — returns { scope: '', bare: '' }. Harmless because nameMatchCandidates filters null packageName, but empty-string packageName would pass the filter and produce an empty bare match. — *Fix Primary Package Selection in Monorepos*
- **code:** IDENTITY_WORDS.has(bareLower) checks case-insensitively via bareLower, but the Set contains lowercase strings — this is correct but implicit. No comment documenting the case-insensitive intent. — *Fix Primary Package Selection in Monorepos*

### packages/cli/src/engine/detectors/applicationShape.ts

- **code:** BROWSER_DEP_ALIASES Set is small (3 entries) and tightly coupled to BROWSER_FRAMEWORKS — if a new browser framework is added with a different package name, both must be updated in sync — *Fix Application Shape Detection Priority Chain*

### packages/cli/src/engine/detectors/git.ts

- **code:** defaultBranch interpolated unsanitized into git exec — consistent with existing detectMergeStrategy pattern — *Scan Surface Display*

### packages/cli/src/engine/detectors/surfaces.ts

- **code:** Double path split — detectSurfaces splits relativePath at line 268, then isNonProductPath splits it again at line 85 — *Fix False Surface Detection*
- **code:** INFRA_PATTERNS is case-sensitive while EXCLUDED_SEGMENTS is case-insensitive — inconsistent casing strategy between the two pre-filters — *Fix False Surface Detection*
- **code:** isNonProductPath returns true for empty string segments from trailing slashes — 'examples/'.split('/') produces ['examples', ''], and '' does not match EXCLUDED_SEGMENTS, so it still works, but edge is unguarded — *Fix False Surface Detection*

### packages/cli/src/engine/sampling/proportionalSampler.ts

- **code:** Root-level allocation in sampleFilesProportional lines 140-143 has the same floor-1-without-remaining-guard pattern. Protected by final trim at line 172 but still wastes glob work. — *Fix sampler budget overflow*

### packages/cli/tests/commands/init/monorepoCommandScoping.test.ts

- **test:** Contract file_changes lists state.test.ts but tests were written in monorepoCommandScoping.test.ts — file mismatch between contract and implementation — *Fix False Surface Detection*
- **test:** Repeated tmpDir/cwdDir setup+teardown boilerplate in all 4 new tests — follows existing pattern but adds to known tech debt — *Fix per-surface test command priority*

### packages/cli/tests/commands/proof-surface-derivation.test.ts

- **code:** deriveSurface logic duplicated in test — test reimplements work.ts logic instead of importing it — *Surface Awareness Schema and Pipeline Integration*

### packages/cli/tests/commands/scan.test.ts

- **test:** A007 test uses conditional assertions — passes vacuously if Surfaces section not rendered — *Scan Surface Display*
- **test:** A003-A006 test asserts surface names exist in block but not framework, language, or testing values — *Scan Surface Display*

### packages/cli/tests/engine/census-primary.test.ts

- **test:** A007 tiebreaker test uses toContain('larger') — would pass if result were 'larger-thing' or any string containing 'larger' — *Fix Primary Package Selection in Monorepos*
- **test:** A026 caller test doesn't verify actual call site — it only shows selectPrimary accepts 3 args. Caller verified by source inspection (census.ts:571). — *Fix Primary Package Selection in Monorepos*
- **test:** No test for the Policy 1 + Policy 0 interaction: an apps/ package in a non-product path (e.g., 'examples/apps/web') — would Policy 0 filter it before Policy 1 can match? — *Fix Primary Package Selection in Monorepos*

### packages/cli/tests/engine/detectors/applicationShape.test.ts

- **test:** Stale @ana tags from prior contract create proof chain ambiguity — 20 duplicate tags with colliding IDs — *Fix Application Shape Detection Priority Chain*
- **test:** @ana A003 tags wrong test — tags 'pure function' check (line 319) instead of MCP+Next.js→web-app test (line 64) — *Fix Application Shape Detection Priority Chain*
- **test:** No test for MCP + server framework + browser deps triple combination (e.g., Express + MCP + React → full-stack) — *Fix Application Shape Detection Priority Chain*

### packages/cli/tests/engine/detectors/polyglot.test.ts

- **test:** Tauri Cargo.toml indicator push has no test assertion — existing Tauri tests assert pnpm-workspace.yaml but not Cargo.toml — *Polyglot detection hygiene*
- **test:** Tier 4 Tauri test has no indicator assertions at all — only asserts type and confidence — *Polyglot detection hygiene*

### website/components/docs/proof/ProofExplorer.tsx

- **code:** Badge style object duplicated three times in ProofExplorer inline badge container — *Comprehensive Documentation Update for Surface Awareness*

### website/components/docs/proof/ProofHero.tsx

- **code:** formatDuration duplicated in ProofHero — known across 4 files per proof context — *Comprehensive Documentation Update for Surface Awareness*
- **test:** No unit tests for surface conditional rendering in ProofHero or ProofExplorer — by spec design (build-only strategy), but null/undefined/empty-string edge cases untested — *Comprehensive Documentation Update for Surface Awareness*

### website/lib/__tests__/docs-data/data-integrity.test.ts

- **test:** Supplementary files silent pass on missing — existsSync guard inside for-loop means missing files are never asserted — *Website Test Suite*

