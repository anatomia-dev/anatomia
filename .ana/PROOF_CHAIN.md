# Proof Chain Dashboard

172 runs · 122 active · 5 promoted · 843 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 30 | 24 | 2026-05-29 |
| cli | 119 | 79 | 2026-05-29 |
| website | 23 | 19 | 2026-05-24 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 7 | 5 |
| packages/cli/tests/commands/work.test.ts | 6 | 5 |
| packages/cli/tests/commands/proof.test.ts | 5 | 4 |
| packages/cli/src/commands/init/commit.ts | 5 | 3 |
| packages/cli/src/commands/init/state.ts | 5 | 5 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 122 total)

### assets/demo/dub-scan.tape

- **code:** Tape file comment says Output is relative to tape file location, but VHS resolves Output relative to CWD — *README Terminal Demo*

### packages/cli/package.json

- **code:** prepublishOnly copies root README to package dir but assets/demo/ is not in files array — GIF path dangling on npm — *README Terminal Demo*

### packages/cli/src/commands/artifact.ts

- **code:** hasOpposingStageAdvanced reads .saves.json on every call — four calls per save mean four file reads of the same file — *Fix False Rejection Archives on Same-Session Re-Saves*

### packages/cli/src/commands/init/commit.ts

- **code:** discoverGitignoredDirtyFiles correctly uses --no-index for tracked files — improvement over existing discoverGitignoredFiles pattern — *Gitignore disclosure at init time, commit hardening, and docs*
- **code:** discoverGitignoredFiles calls resolveMonorepoAgentsMd independently — duplicated scan.json read — *Force-add gitignored infrastructure in init commit*
- **code:** No guard for symlinks under .claude/ — readdirSync with recursive follows symlinks into arbitrary directories — *Force-add gitignored infrastructure in init commit*
- **code:** lstatSync called per-file during candidate enumeration — O(n) syscalls on large .claude/ trees — *Force-add gitignored infrastructure in init commit*

### packages/cli/src/commands/init/index.ts

- **code:** Warning text hardcodes '.claude/' but detection covers both .claude/ and .ana/ — *Gitignore disclosure at init time, commit hardening, and docs*

### packages/cli/src/commands/init/state.ts

- **code:** Path escape handles single quotes only — dollar signs, backticks in paths still break inside single-quoted shell context — *Fix Risk Findings*

### packages/cli/src/commands/proof.ts

- **code:** Hot spots displayNames not truncated when exceeding maxWidth — padEnd passes through unchanged — *CLI Polish*

### packages/cli/src/commands/work-state.ts

- **code:** work-state.ts determineStage function is 148 lines with deeply nested conditionals — largest function in the new module, could benefit from phase-specific helpers — *Decompose work.ts*

### packages/cli/src/commands/work.ts

- **code:** getNextAction not moved to work-state.ts — 9 functions instead of contract's 10 — *Decompose work.ts*
- **test:** No dedicated test for the backfill guard's empty-string behavior — only verified by source inspection — *Fix Risk Findings*

### packages/cli/src/engine/census.ts

- **code:** rootDevDeps is empty in Fix B path — fallback devDeps only flow through sourceRoot.devDeps — *Fix Workspace Glob Fallback*
- **code:** No test for discoverSchemas non-product path filtering — Fix 1 relies solely on integration coverage — *Scan Quality Polish (6 Additive Fixes)*

### packages/cli/src/engine/detectors/dependencies.ts

- **code:** No-primary-root edge case — findStackProvenance silently treats all roots as non-primary when no root.isPrimary is true — *Setup Verification Hints*

### packages/cli/src/engine/findings/rules/secrets.ts

- **code:** Trailing bracket regex broader than [password] intent — matches any lowercase word ending in ] — *Fix False Positive Secret Detection*

### packages/cli/src/utils/proof-health.ts

- **code:** proof-health.ts at 893 lines is already above comfort threshold — health computation could decompose further — *Decompose proofSummary.ts*

### packages/cli/src/utils/proofSummary.ts

- **code:** proofSummary.ts still 1285 lines — reduced from 2330 but remains the largest util module — *Decompose proofSummary.ts*

### packages/cli/tests/commands/init/commit.test.ts

- **test:** No integration test for subsequent-commit hardening scenario (A008-A010) — *Gitignore disclosure at init time, commit hardening, and docs*
- **test:** A020 test is indirect — exercises exit-code-1 path but the file created is dirty, not a clean non-ignored candidate — *Force-add gitignored infrastructure in init commit*

### packages/cli/tests/commands/proof.test.ts

- **test:** A003 and A004 tests use conditional assertions — silently pass if section absent — *CLI Polish*
- **test:** A005 assertion checks for any double space, not trailing gap before right border — *CLI Polish*

### packages/cli/tests/engine/census.test.ts

- **test:** Fix A test does not assert deps/devDeps are separated correctly — only checks allDeps — *Fix Workspace Glob Fallback*

### packages/cli/tests/engine/detectors/ci-detection.test.ts

- **test:** No negative test for primaryPath matching wrong sourceRootPath substring (e.g., 'apps/we' partial match) — *Fix deploy platform detection for monorepos*

### packages/cli/tests/engine/detectors/dependencies.test.ts

- **test:** makeRoot/makeCensus helpers duplicated locally instead of extracted to shared test helper — *Setup Verification Hints*

### packages/cli/tests/engine/three-tier-detection.test.ts

- **test:** A022 uiSystem test is a hasDep proxy — doesn't call detectUiSystem — *Monorepo Three-Tier Dependency Resolution*
- **test:** resolveThreeTier helper duplicates scan-engine logic — drift risk if engine changes — *Monorepo Three-Tier Dependency Resolution*

### website/lib/__tests__/docs-data/data-integrity.test.ts

- **test:** No dedicated test verifies commands.json contains 'doctor' or 'learn' by name — relies on source inspection and shape tests — *CLI Polish*

### website/lib/__tests__/docs-data/staleness.test.ts

- **test:** Staleness tests replicate checkStaleDocs rather than testing the actual function — *Fix AnaDocs date freshness*

