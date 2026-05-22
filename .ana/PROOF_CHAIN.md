# Proof Chain Dashboard

147 runs · 117 active · 3 promoted · 728 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 25 | 14 | 2026-05-20 |
| cli | 101 | 83 | 2026-05-22 |
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

## Active Findings (30 shown of 117 total)

### packages/cli/src/engine/census.ts

- **code:** FRAMEWORK_HINTS is not exported — no direct unit test can verify array ordering invariants without integration-level testing — *Fill Scan Detection Gaps*
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

### packages/cli/src/engine/parsers/python/pyproject.ts

- **code:** Strategy numbering gap — 1, 2, 5, 3, 4 — from inserting PEP 735 before Poetry strategies — *Fix Python pyproject.toml parser — 3 bugs*
- **code:** TOML inline comments after closing bracket (e.g., `] # end`) would break \]\s*$ anchor — *Fix Python pyproject.toml parser — 3 bugs*
- **code:** Windows \r\n line endings could leave \r in captured content — $  matches before \n only — *Fix Python pyproject.toml parser — 3 bugs*

### packages/cli/src/engine/scan-engine.ts

- **code:** Hardcoded subdirectory list inline in 900+ line function — *Fix TypeScript Language Detection for Monorepos and Multi-Directory Projects*

### packages/cli/tests/commands/init/monorepoCommandScoping.test.ts

- **test:** Contract file_changes lists state.test.ts but tests were written in monorepoCommandScoping.test.ts — file mismatch between contract and implementation — *Fix False Surface Detection*

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

### packages/cli/tests/engine/detectors/detection-overrides.test.ts

- **test:** A003 asserts not-TypeScript but not what language IS — weaker than necessary — *Fix TypeScript Language Detection for Monorepos and Multi-Directory Projects*
- **test:** Only server/ and web/ subdirectories exercised — frontend/ and backend/ untested — *Fix TypeScript Language Detection for Monorepos and Multi-Directory Projects*

### packages/cli/tests/engine/detectors/polyglot.test.ts

- **test:** Tauri Cargo.toml indicator push has no test assertion — existing Tauri tests assert pnpm-workspace.yaml but not Cargo.toml — *Polyglot detection hygiene*
- **test:** Tier 4 Tauri test has no indicator assertions at all — only asserts type and confidence — *Polyglot detection hygiene*

### packages/cli/tests/engine/detectors/surfaces.test.ts

- **test:** Svelte/Nuxt ordering test (A020) constructs hints with Svelte first — passes regardless of actual FRAMEWORK_HINTS array order in census.ts — *Fill Scan Detection Gaps*
- **test:** @ana tag collision — A015-A020 IDs reused from scan-surface-detection contract in same test file. Machines parsing @ana tags will match wrong tests for older contracts. — *Fill Scan Detection Gaps*

### packages/cli/tests/engine/parsers/python.test.ts

- **test:** A010 include-group test passes trivially — inline table syntax never matches extractFromArray regex — *Fix Python pyproject.toml parser — 3 bugs*
- **test:** No test for empty string or malformed TOML in dependency-groups — only empty section tested — *Fix Python pyproject.toml parser — 3 bugs*

