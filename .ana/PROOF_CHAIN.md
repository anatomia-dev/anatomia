# Proof Chain Dashboard

168 runs · 120 active · 5 promoted · 827 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 28 | 19 | 2026-05-25 |
| cli | 117 | 82 | 2026-05-26 |
| website | 23 | 19 | 2026-05-24 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 7 | 5 |
| packages/cli/tests/commands/work.test.ts | 6 | 5 |
| packages/cli/tests/commands/proof.test.ts | 5 | 4 |
| packages/cli/src/commands/init/state.ts | 5 | 5 |
| packages/cli/tests/engine/findings/rules/validation.test.ts | 4 | 2 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 120 total)

### packages/cli/src/commands/artifact.ts

- **code:** hasOpposingStageAdvanced reads .saves.json on every call — four calls per save mean four file reads of the same file — *Fix False Rejection Archives on Same-Session Re-Saves*

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

### packages/cli/src/engine/findings/rules/validation.ts

- **code:** Grammatically incorrect '1 API route files' in singular edge case — known, documented in spec as out of scope — *Qualify Validation Finding Title*

### packages/cli/src/engine/scan-engine.ts

- **code:** testing field included in three-tier resolution despite spec saying 'stays on allDeps' — *Monorepo Three-Tier Dependency Resolution*
- **code:** hasDep uses truthy check (||) — empty string version would be treated as absent — *Monorepo Three-Tier Dependency Resolution*
- **code:** readPythonDependencies called twice for Python projects — line 673 (production) and line 76 inside detectNonNodeTesting (all), both performing fresh filesystem reads of the same pyproject.toml — *Separate Python production deps from dev deps*

### packages/cli/src/utils/proof-health.ts

- **code:** proof-health.ts at 893 lines is already above comfort threshold — health computation could decompose further — *Decompose proofSummary.ts*

### packages/cli/src/utils/proofSummary.ts

- **code:** proofSummary.ts still 1285 lines — reduced from 2330 but remains the largest util module — *Decompose proofSummary.ts*

### packages/cli/tests/commands/commit-hygiene.test.ts

- **test:** Vacuously true test — __tests__ exclusion still uses removed phc_ pattern — *Fix False Positive Secret Detection*

### packages/cli/tests/commands/proof.test.ts

- **test:** A003 and A004 tests use conditional assertions — silently pass if section absent — *CLI Polish*
- **test:** A005 assertion checks for any double space, not trailing gap before right border — *CLI Polish*

### packages/cli/tests/engine/census.test.ts

- **test:** Fix A test does not assert deps/devDeps are separated correctly — only checks allDeps — *Fix Workspace Glob Fallback*

### packages/cli/tests/engine/detectors/ci-detection.test.ts

- **test:** No negative test for primaryPath matching wrong sourceRootPath substring (e.g., 'apps/we' partial match) — *Fix deploy platform detection for monorepos*

### packages/cli/tests/engine/detectors/dependencies.test.ts

- **test:** makeRoot/makeCensus helpers duplicated locally instead of extracted to shared test helper — *Setup Verification Hints*

### packages/cli/tests/engine/findings/rules/validation.test.ts

- **test:** All 8 @ana tags are stale — inherited from prior build cycle, none map to this contract's assertions — *Qualify Validation Finding Title*
- **test:** No test asserts 'detected' keyword in pass title — A006 verified only by source inspection — *Qualify Validation Finding Title*
- **test:** No test asserts absence of tilde in pass title — A007 verified only by source inspection — *Qualify Validation Finding Title*

### packages/cli/tests/engine/parsers/python.test.ts

- **test:** A010 include-group test passes trivially — inline table syntax never matches extractFromArray regex — *Fix Python pyproject.toml parser — 3 bugs*

### packages/cli/tests/engine/three-tier-detection.test.ts

- **test:** A022 uiSystem test is a hasDep proxy — doesn't call detectUiSystem — *Monorepo Three-Tier Dependency Resolution*
- **test:** resolveThreeTier helper duplicates scan-engine logic — drift risk if engine changes — *Monorepo Three-Tier Dependency Resolution*

### website/lib/__tests__/docs-data/data-integrity.test.ts

- **test:** No dedicated test verifies commands.json contains 'doctor' or 'learn' by name — relies on source inspection and shape tests — *CLI Polish*

### website/lib/__tests__/docs-data/staleness.test.ts

- **test:** Staleness tests replicate checkStaleDocs rather than testing the actual function — *Fix AnaDocs date freshness*

