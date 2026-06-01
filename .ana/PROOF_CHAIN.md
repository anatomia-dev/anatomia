# Proof Chain Dashboard

177 runs · 156 active · 5 promoted · 851 closed

## By Surface

| Surface | Runs | Active | Latest |
|---------|------|--------|--------|
| Unscoped | 30 | 24 | 2026-05-29 |
| cli | 123 | 108 | 2026-06-01 |
| website | 24 | 24 | 2026-06-01 |

## Hot Modules

| File | Active | Entries |
|------|--------|--------|
| packages/cli/src/commands/work.ts | 12 | 7 |
| packages/cli/tests/commands/work.test.ts | 7 | 6 |
| packages/cli/src/commands/run.ts | 7 | 2 |
| packages/cli/tests/commands/proof.test.ts | 5 | 4 |
| packages/cli/tests/commands/artifact.test.ts | 5 | 3 |

## Promoted Rules

*No promoted rules yet.*

## Active Findings (30 shown of 156 total)

### packages/cli/src/commands/artifact.ts

- **code:** Phase inference adds a second .saves.json reader instead of sharing the existing metadata read path — *Multi-Phase Report Naming Guard*

### packages/cli/src/commands/check.ts

- **code:** Residual hardcoded .claude/skills/ display string in check.ts not migrated to helper — *Platform-Aware CLI*

### packages/cli/src/commands/init/assets.ts

- **code:** createSkillSymlinks silently skips real directories — falls through to nothing when lstat succeeds but isSymbolicLink is false — *Codex Support*

### packages/cli/src/commands/platform.ts

- **code:** Duplicate JSDoc block on getPlatformFlags — old block left above new block — *Codex Support*
- **code:** Duplicate JSDoc block on getPlatformFlags — old docstring not removed when new one added — *Codex Support*

### packages/cli/src/commands/run.ts

- **code:** TOML mode field is dead data — dispatch uses hardcoded INTERACTIVE_AGENTS set instead — *Codex Support*
- **code:** resolvePlatform accepts arbitrary platform strings without validation — --platform foo dispatches to unknown code path — *Codex Support*
- **code:** parseSimpleToml silently drops lines with unquoted values, inline comments, or multiline strings — *Codex Support*
- **code:** advisoryPipelineCheck not called for Codex dispatch — only Claude path runs the advisory check — *Codex Support*
- **code:** Advisory pipeline check reads .saves.json stage field directly — couples to internal format — *Platform-Aware CLI*

### packages/cli/src/commands/work-state.ts

- **code:** resolvePhase returns null for both 'all phases passed' and 'single-spec' — dual-meaning null forces callers to disambiguate — *Fix Multi-Phase Timestamp Poisoning*

### packages/cli/src/commands/work.ts

- **code:** Dead conditional — verifyAgent always equals 'ana-verify' on both branches — *Fix Multi-Phase Timestamp Poisoning*
- **code:** startBuildPhaseWithKey is an unnecessary wrapper — delegates entirely to startBuildPhase with unused _buildAgentKey param — *Fix Multi-Phase Timestamp Poisoning*
- **code:** getMainTreeResolution re-reads filesystem artifacts via gatherLocalArtifactState even though caller already has hasNumberedSpec/buildReportExists flags — *Fix Multi-Phase Timestamp Poisoning*
- **code:** Inside-worktree resume writes phase-scoped timestamps without concurrency guard check — now phase-aware but still no guard — *Fix Multi-Phase Timestamp Poisoning*

### packages/cli/tests/commands/artifact.test.ts

- **test:** Work-status progression test calls determineStage with constructed state instead of exercising ana work status discovery — *Multi-Phase Report Naming Guard*
- **test:** No-target error test asserts only the headline message, not the exit code or explicit numbered-command guidance — *Multi-Phase Report Naming Guard*

### packages/cli/tests/commands/init.test.ts

- **test:** No test for codex-only init path — A011/A012/A013 verified by source inspection only — *Codex Support*
- **test:** A026 test asserts length > 0, not that correct platforms were detected — weak assertion for auto-detection — *Codex Support*

### packages/cli/tests/commands/platform.test.ts

- **test:** A004 contract assertion contradicted by implementation — schema .catch() does not fire on valid empty arrays — *Platform-Aware CLI*
- **test:** A001 test mis-tagged — tests schema preservation of explicit values, not fresh-project default — *Platform-Aware CLI*
- **test:** Six assertions (A008-A009, A013-A018) use source-content inspection instead of behavioral tests — *Platform-Aware CLI*

### packages/cli/tests/commands/run.test.ts

- **test:** @ana tag collisions — A028-A033 tags on pre-existing CC dispatch tests match different contract assertions from a prior plan — *Codex Support*

### packages/cli/tests/commands/work.test.ts

- **test:** A023 test only covers worktree startWork path — doesn't actually compare main-tree vs worktree output as the test title claims — *Fix Multi-Phase Timestamp Poisoning*

### packages/cli/tests/e2e/init-flow.test.ts

- **test:** A029 (init-flow.test.ts asserts ana run) lacks @ana tag — verified by source inspection — *Codex Support*

### website/content/docs/guides/platform-setup.mdx

- **code:** Platform flags guide shows Codex sandbox as platformFlags even though run dispatch already passes sandbox mode — *Docs, Website, and README Multi-Platform Update*

### website/lib/__tests__/docs-platform-content.test.ts

- **test:** ForPlatform pairing test only compares total block counts — *Docs, Website, and README Multi-Platform Update*
- **test:** Generated docs asset assertions read ignored prebuild outputs directly, so focused tests can depend on stale or missing local files — *Docs, Website, and README Multi-Platform Update*
- **test:** ForPlatform pairing test proves count and adjacency but not that paired blocks address the same user need — *Docs, Website, and README Multi-Platform Update*

### website/public/search-index.json

- **test:** Generated search index can still surface stale direct Claude agent command text — *Docs, Website, and README Multi-Platform Update*

