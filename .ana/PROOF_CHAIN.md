# Proof Chain Dashboard

174 runs · 142 active · 5 promoted · 848 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 30 | 24 | 2026-05-29 |
| cli | 121 | 99 | 2026-05-31 |
| website | 23 | 19 | 2026-05-24 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 8 | 6 |
| packages/cli/src/commands/run.ts | 7 | 2 |
| packages/cli/tests/commands/work.test.ts | 6 | 5 |
| packages/cli/tests/commands/proof.test.ts | 5 | 4 |
| packages/cli/src/commands/init/commit.ts | 5 | 3 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 142 total)

### assets/demo/dub-scan.tape

- **code:** Tape file comment says Output is relative to tape file location, but VHS resolves Output relative to CWD — *README Terminal Demo*

### packages/cli/package.json

- **code:** prepublishOnly copies root README to package dir but assets/demo/ is not in files array — GIF path dangling on npm — *README Terminal Demo*

### packages/cli/src/commands/check.ts

- **code:** Residual hardcoded .claude/skills/ display string in check.ts not migrated to helper — *Platform-Aware CLI*

### packages/cli/src/commands/init/assets.ts

- **code:** createSkillSymlinks silently skips real directories — falls through to nothing when lstat succeeds but isSymbolicLink is false — *Codex Support*

### packages/cli/src/commands/init/commit.ts

- **code:** discoverGitignoredDirtyFiles correctly uses --no-index for tracked files — improvement over existing discoverGitignoredFiles pattern — *Gitignore disclosure at init time, commit hardening, and docs*
- **code:** discoverGitignoredFiles calls resolveMonorepoAgentsMd independently — duplicated scan.json read — *Force-add gitignored infrastructure in init commit*
- **code:** No guard for symlinks under .claude/ — readdirSync with recursive follows symlinks into arbitrary directories — *Force-add gitignored infrastructure in init commit*
- **code:** lstatSync called per-file during candidate enumeration — O(n) syscalls on large .claude/ trees — *Force-add gitignored infrastructure in init commit*

### packages/cli/src/commands/init/index.ts

- **code:** Warning text hardcodes '.claude/' but detection covers both .claude/ and .ana/ — *Gitignore disclosure at init time, commit hardening, and docs*

### packages/cli/src/commands/platform.ts

- **code:** Duplicate JSDoc block on getPlatformFlags — old block left above new block — *Codex Support*
- **code:** Duplicate JSDoc block on getPlatformFlags — old docstring not removed when new one added — *Codex Support*

### packages/cli/src/commands/run.ts

- **code:** TOML mode field is dead data — dispatch uses hardcoded INTERACTIVE_AGENTS set instead — *Codex Support*
- **code:** resolvePlatform accepts arbitrary platform strings without validation — --platform foo dispatches to unknown code path — *Codex Support*
- **code:** parseSimpleToml silently drops lines with unquoted values, inline comments, or multiline strings — *Codex Support*
- **code:** advisoryPipelineCheck not called for Codex dispatch — only Claude path runs the advisory check — *Codex Support*
- **code:** Advisory pipeline check reads .saves.json stage field directly — couples to internal format — *Platform-Aware CLI*
- **code:** advisoryPipelineCheck stage.includes() match is broad — 'ready-for-build' would match 'phase-2-ready-for-build' (intended) but also any future stage containing that substring — *Platform-Aware CLI*
- **code:** findRunProjectRoot walks up from process.cwd() but executeRun is called after Commander parses — if user runs ana from a subdirectory, project root resolves correctly; no issue found — *Platform-Aware CLI*

### packages/cli/src/commands/work.ts

- **code:** getNextAction still in work.ts — known from decompose-work-ts-C1, not changed by this build — *Platform-Aware CLI*

### packages/cli/tests/commands/init.test.ts

- **test:** No test for codex-only init path — A011/A012/A013 verified by source inspection only — *Codex Support*
- **test:** A026 test asserts length > 0, not that correct platforms were detected — weak assertion for auto-detection — *Codex Support*

### packages/cli/tests/commands/init/commit.test.ts

- **test:** No integration test for subsequent-commit hardening scenario (A008-A010) — *Gitignore disclosure at init time, commit hardening, and docs*
- **test:** A020 test is indirect — exercises exit-code-1 path but the file created is dirty, not a clean non-ignored candidate — *Force-add gitignored infrastructure in init commit*

### packages/cli/tests/commands/platform.test.ts

- **test:** A004 contract assertion contradicted by implementation — schema .catch() does not fire on valid empty arrays — *Platform-Aware CLI*
- **test:** A001 test mis-tagged — tests schema preservation of explicit values, not fresh-project default — *Platform-Aware CLI*
- **test:** Six assertions (A008-A009, A013-A018) use source-content inspection instead of behavioral tests — *Platform-Aware CLI*
- **test:** A004 tagged test asserts opposite of contract value — test says [] but contract says ['claude']. Test is correct for Zod behavior, contract assertion is wrong — *Platform-Aware CLI*

### packages/cli/tests/commands/run.test.ts

- **test:** @ana tag collisions — A028-A033 tags on pre-existing CC dispatch tests match different contract assertions from a prior plan — *Codex Support*

### packages/cli/tests/e2e/init-flow.test.ts

- **test:** A029 (init-flow.test.ts asserts ana run) lacks @ana tag — verified by source inspection — *Codex Support*

### packages/cli/tests/engine/three-tier-detection.test.ts

- **test:** A022 uiSystem test is a hasDep proxy — doesn't call detectUiSystem — *Monorepo Three-Tier Dependency Resolution*

