# Proof Chain Dashboard

173 runs · 131 active · 5 promoted · 846 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 30 | 24 | 2026-05-29 |
| cli | 120 | 88 | 2026-05-31 |
| website | 23 | 19 | 2026-05-24 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 8 | 6 |
| packages/cli/tests/commands/work.test.ts | 6 | 5 |
| packages/cli/tests/commands/proof.test.ts | 5 | 4 |
| packages/cli/src/commands/init/commit.ts | 5 | 3 |
| packages/cli/src/commands/init/state.ts | 5 | 5 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 131 total)

### assets/demo/dub-scan.tape

- **code:** Tape file comment says Output is relative to tape file location, but VHS resolves Output relative to CWD — *README Terminal Demo*

### packages/cli/package.json

- **code:** prepublishOnly copies root README to package dir but assets/demo/ is not in files array — GIF path dangling on npm — *README Terminal Demo*

### packages/cli/src/commands/check.ts

- **code:** Residual hardcoded .claude/skills/ display string in check.ts not migrated to helper — *Platform-Aware CLI*

### packages/cli/src/commands/init/commit.ts

- **code:** discoverGitignoredDirtyFiles correctly uses --no-index for tracked files — improvement over existing discoverGitignoredFiles pattern — *Gitignore disclosure at init time, commit hardening, and docs*
- **code:** discoverGitignoredFiles calls resolveMonorepoAgentsMd independently — duplicated scan.json read — *Force-add gitignored infrastructure in init commit*
- **code:** No guard for symlinks under .claude/ — readdirSync with recursive follows symlinks into arbitrary directories — *Force-add gitignored infrastructure in init commit*
- **code:** lstatSync called per-file during candidate enumeration — O(n) syscalls on large .claude/ trees — *Force-add gitignored infrastructure in init commit*

### packages/cli/src/commands/init/index.ts

- **code:** Warning text hardcodes '.claude/' but detection covers both .claude/ and .ana/ — *Gitignore disclosure at init time, commit hardening, and docs*

### packages/cli/src/commands/init/state.ts

- **code:** Path escape handles single quotes only — dollar signs, backticks in paths still break inside single-quoted shell context — *Fix Risk Findings*

### packages/cli/src/commands/run.ts

- **code:** Advisory pipeline check reads .saves.json stage field directly — couples to internal format — *Platform-Aware CLI*
- **code:** advisoryPipelineCheck stage.includes() match is broad — 'ready-for-build' would match 'phase-2-ready-for-build' (intended) but also any future stage containing that substring — *Platform-Aware CLI*
- **code:** findRunProjectRoot walks up from process.cwd() but executeRun is called after Commander parses — if user runs ana from a subdirectory, project root resolves correctly; no issue found — *Platform-Aware CLI*

### packages/cli/src/commands/work-state.ts

- **code:** work-state.ts determineStage function is 148 lines with deeply nested conditionals — largest function in the new module, could benefit from phase-specific helpers — *Decompose work.ts*

### packages/cli/src/commands/work.ts

- **code:** getNextAction still in work.ts — known from decompose-work-ts-C1, not changed by this build — *Platform-Aware CLI*
- **code:** getNextAction not moved to work-state.ts — 9 functions instead of contract's 10 — *Decompose work.ts*
- **test:** No dedicated test for the backfill guard's empty-string behavior — only verified by source inspection — *Fix Risk Findings*

### packages/cli/src/engine/census.ts

- **code:** rootDevDeps is empty in Fix B path — fallback devDeps only flow through sourceRoot.devDeps — *Fix Workspace Glob Fallback*

### packages/cli/src/engine/findings/rules/secrets.ts

- **code:** Trailing bracket regex broader than [password] intent — matches any lowercase word ending in ] — *Fix False Positive Secret Detection*

### packages/cli/src/utils/proof-health.ts

- **code:** proof-health.ts at 893 lines is already above comfort threshold — health computation could decompose further — *Decompose proofSummary.ts*

### packages/cli/src/utils/proofSummary.ts

- **code:** proofSummary.ts still 1285 lines — reduced from 2330 but remains the largest util module — *Decompose proofSummary.ts*

### packages/cli/tests/commands/init/commit.test.ts

- **test:** No integration test for subsequent-commit hardening scenario (A008-A010) — *Gitignore disclosure at init time, commit hardening, and docs*
- **test:** A020 test is indirect — exercises exit-code-1 path but the file created is dirty, not a clean non-ignored candidate — *Force-add gitignored infrastructure in init commit*

### packages/cli/tests/commands/platform.test.ts

- **test:** A004 contract assertion contradicted by implementation — schema .catch() does not fire on valid empty arrays — *Platform-Aware CLI*
- **test:** A001 test mis-tagged — tests schema preservation of explicit values, not fresh-project default — *Platform-Aware CLI*
- **test:** Six assertions (A008-A009, A013-A018) use source-content inspection instead of behavioral tests — *Platform-Aware CLI*
- **test:** A004 tagged test asserts opposite of contract value — test says [] but contract says ['claude']. Test is correct for Zod behavior, contract assertion is wrong — *Platform-Aware CLI*

### packages/cli/tests/engine/census.test.ts

- **test:** Fix A test does not assert deps/devDeps are separated correctly — only checks allDeps — *Fix Workspace Glob Fallback*

### packages/cli/tests/engine/detectors/ci-detection.test.ts

- **test:** No negative test for primaryPath matching wrong sourceRootPath substring (e.g., 'apps/we' partial match) — *Fix deploy platform detection for monorepos*

### packages/cli/tests/engine/three-tier-detection.test.ts

- **test:** A022 uiSystem test is a hasDep proxy — doesn't call detectUiSystem — *Monorepo Three-Tier Dependency Resolution*
- **test:** resolveThreeTier helper duplicates scan-engine logic — drift risk if engine changes — *Monorepo Three-Tier Dependency Resolution*

